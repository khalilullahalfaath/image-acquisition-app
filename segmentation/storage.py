"""
Baca/tulis hasil segmentasi -- file JSON detail per-gambar, dan
segmentation_log.csv (ringkasan per proses simpan). Dipakai bareng oleh
routes.py (load/load-path/list-results/save/batch-run/check-existing/
patient-summary) dan export.py.
"""

import csv
import json
import os
import threading

import cv2

from utils import frame_to_png_base64

from .constants import SEGMENTATION_LOG_FILENAME

# Lindungi penulisan file detail JSON + baris segmentation_log.csv dari race
# condition kalau ada beberapa "Simpan Hasil"/batch run nyaris bersamaan --
# pola yang sama dengan save_lock di capture.py.
segmentation_log_lock = threading.Lock()


def _ensure_log_columns(log_path, fieldnames):
    """Migrasi in-place kalau segmentation_log.csv yang sudah ada (dari versi
    lama) belum punya kolom baru (mis. is_duplicate/duplicate_of) -- baca
    semua baris lama, rewrite dengan header terbaru (kolom baru diisi kosong
    utk baris lama), biar CSV tetap satu format konsisten & nggak ada nilai
    ke-shift/hilang pas dibuka di Excel setelah kolom baru ditambahkan.
    Harus dipanggil di dalam segmentation_log_lock."""
    if not os.path.isfile(log_path):
        return
    with open(log_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []
        rows = list(reader)
    if not header or all(name in header for name in fieldnames):
        return  # file kosong, atau sudah punya semua kolom yg dibutuhkan
    with open(log_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            row.pop(None, None)  # buang overflow restkey (baris lama yg kolomnya beda)
            writer.writerow({name: row.get(name, "") for name in fieldnames})


def _load_segmentation_detail_file(detail_path):
    """Logic bersama buat baca satu file JSON hasil segmentasi + coba baca
    ulang gambar sumbernya buat preview. Dipakai baik dari dialog
    (/api/segmentation/load) maupun klik langsung di daftar hasil folder
    (/api/segmentation/load-path, tanpa buka dialog lagi -- ini yang bikin
    review banyak hasil sekaligus, mis. ~20 capture per pasien, nggak perlu
    buka-tutup dialog file satu-satu)."""
    try:
        with open(detail_path, "r", encoding="utf-8") as f:
            detail = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        return {"ok": False, "message": f"Gagal membaca file: {e}"}

    source_image = detail.get("sourceImage")
    detections = detail.get("detections") or []

    response = {
        "ok": True,
        "path": source_image,
        "detailFile": os.path.basename(detail_path),
        "patientId": detail.get("patientId"),
        "detections": detections,
        "image": None,
        "width": None,
        "height": None,
    }

    if source_image and os.path.isfile(source_image):
        frame = cv2.imread(source_image)
        if frame is not None:
            response["image"] = frame_to_png_base64(frame)
            h, w = frame.shape[:2]
            response["width"] = w
            response["height"] = h

    if response["image"] is None:
        response["message"] = (
            "Gambar sumber asli tidak ditemukan/gagal dibaca di lokasi "
            "semula -- cuma daftar sel yang berhasil dimuat."
        )

    return response


def _latest_segmentation_rows(folder):
    """Baca segmentation_log.csv di satu folder, dedup ambil baris TERBARU
    per source_image -- helper yang sama dipakai /list-results dan
    /patient-summary, dipusatkan di sini juga buat /export-report.

    Kalau dua baris punya timestamp yang PERSIS sama (resolusi timestamp
    cuma per detik, bisa kejadian kalau ada save cepat berturut-turut,
    mis. warning duplikat lalu "tetap simpan"), baris yang lebih BELAKANGAN
    di file (ditulis lebih baru) yang menang -- makanya perbandingannya
    `>` bukan `>=`, biar baris lama nggak "menang" cuma gara-gara duluan
    ditulis di file."""
    log_path = os.path.join(folder, SEGMENTATION_LOG_FILENAME)
    if not os.path.isfile(log_path):
        return []
    latest_by_image = {}
    with open(log_path, "r", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            si = row.get("source_image")
            if not si:
                continue
            ts = row.get("timestamp") or ""
            existing = latest_by_image.get(si)
            if existing is not None and existing.get("timestamp", "") > ts:
                continue
            latest_by_image[si] = row
    return list(latest_by_image.values())
