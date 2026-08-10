"""
Modul capture & save (tab Capture) -- ambil frame dari kamera aktif, deteksi
fokus/blank, simpan ke file PNG + capture_log.csv per folder pasien, dan
ringkasan folder tujuan. Butuh objek `camera` singleton dari camera.py buat
ambil frame yang lagi di-capture.
"""

import csv
import os
import re
import threading
from datetime import datetime

import cv2
from flask import Blueprint, jsonify, request

from camera import camera
from utils import frame_to_png_base64, is_blank_frame, resize_for_save, safe_slug

capture_bp = Blueprint("capture", __name__)

# Untuk deteksi buram
FOCUS_BLUR_THRESHOLD = 60.0

LOG_FILENAME = "capture_log.csv"

# Lindungi critical section /api/save (hitung iterasi + tulis file + tulis
# log CSV) dari race condition kalau ada dua request /api/save nyaris
# bersamaan (Flask jalan threaded=True) -- tanpa ini, dua request bisa saja
# baca "iterasi berikutnya" yang sama sebelum salah satu selesai menulis,
# jadi filename ketimpa/duplikat atau baris CSV keselip.
save_lock = threading.Lock()


def next_iteration_from_folder(folder, slug):
    """Tentukan nomor iterasi berikutnya dengan membaca file yang SUDAH ADA di folder tujuan."""
    pattern = re.compile(
        rf"^{re.escape(slug)}_\d{{8}}-\d{{6}}_(\d+)\.png$", re.IGNORECASE
    )
    max_iter = 0
    try:
        for fname in os.listdir(folder):
            m = pattern.match(fname)
            if m:
                max_iter = max(max_iter, int(m.group(1)))
    except OSError:
        pass
    return max_iter + 1


def log_capture_csv(folder, row):
    """Tambahkan satu baris metadata ke capture_log.csv di folder tujuan."""
    log_path = os.path.join(folder, LOG_FILENAME)
    is_new = not os.path.exists(log_path)
    fieldnames = [
        "timestamp", "patient_id", "filename", "iterasi",
        "camera", "resolution", "focus_score",
    ]
    with open(log_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if is_new:
            writer.writeheader()
        writer.writerow(row)


# ---------------------------------------------------------------------------
# Routes - capture & save
# ---------------------------------------------------------------------------
@capture_bp.route("/api/capture", methods=["POST"])
def api_capture():
    frame = camera.capture()
    if frame is None:
        return jsonify({"ok": False, "message": "Belum ada frame dari kamera."}), 400
    b64 = frame_to_png_base64(frame)
    focus_score = camera.captured_focus_score
    return jsonify({
        "ok": True,
        "image": b64,
        "focusScore": round(focus_score, 1),
        "focusLabel": "Baik" if focus_score >= FOCUS_BLUR_THRESHOLD else "Buram",
        "blankWarning": is_blank_frame(frame),
    })


@capture_bp.route("/api/select-folder", methods=["POST"])
def api_select_folder():
    """Buka dialog folder NATIVE lewat tkinter."""
    result = {"path": None}

    def open_dialog():
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        result["path"] = filedialog.askdirectory(title="Pilih Lokasi Penyimpanan")
        root.destroy()

    t = threading.Thread(target=open_dialog)
    t.start()
    t.join()

    if not result["path"]:
        return jsonify({"ok": False}), 400
    return jsonify({"ok": True, "path": result["path"]})


@capture_bp.route("/api/save", methods=["POST"])
def api_save():
    data = request.json or {}
    patient_name = (data.get("patientName") or "").strip()
    folder = (data.get("folder") or "").strip()
    camera_name = (data.get("cameraName") or "").strip()
    target_width = data.get("width")
    target_height = data.get("height")

    if not patient_name:
        return jsonify({"ok": False, "message": "Nama pasien belum diisi."}), 400
    if not folder or not os.path.isdir(folder):
        return jsonify({"ok": False, "message": "Lokasi penyimpanan belum valid."}), 400
    if camera.captured_frame is None:
        return jsonify({"ok": False, "message": "Belum ada gambar yang di-capture."}), 400

    slug = safe_slug(patient_name)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    # Semua langkah di bawah ini (hitung iterasi berikutnya dari isi folder,
    # tulis file gambar, tulis baris log CSV) harus jadi satu unit atomik --
    # kalau dua request /api/save nyaris bersamaan (Flask threaded=True)
    # jalan tanpa lock ini, keduanya bisa saja baca "iterasi berikutnya" yang
    # sama sebelum salah satu selesai menulis, jadi filename ketimpa/duplikat
    # atau baris CSV keselip/korup.
    with save_lock:
        iterasi = next_iteration_from_folder(folder, slug)

        # Kalau kamera tidak bisa diatur resolusinya langsung (mis. MiiCam),
        # ini fallback: kecilin gambar secara software persis sebelum disimpan.
        frame_to_save = resize_for_save(camera.captured_frame, target_width, target_height)

        filename = f"{slug}_{timestamp}_{iterasi:02d}.png"
        full_path = os.path.join(folder, filename)

        ok = cv2.imwrite(full_path, frame_to_save)
        if not ok:
            return jsonify({"ok": False, "message": "Gagal menyimpan file."}), 500

        height, width = frame_to_save.shape[:2]
        log_capture_csv(folder, {
            "timestamp": timestamp,
            "patient_id": slug,
            "filename": filename,
            "iterasi": iterasi,
            "camera": camera_name or "?",
            "resolution": f"{width}x{height}",
            "focus_score": round(camera.captured_focus_score or 0, 1),
        })

    return jsonify(
        {
            "ok": True,
            "filename": filename,
            "path": full_path,
            "count": iterasi,
            "width": width,
            "height": height,
        }
    )


@capture_bp.route("/api/folder-summary")
def api_folder_summary():
    """Ringkasan jumlah gambar per pasien di folder tujuan, dibaca langsung
    dari nama file yang ada (bukan dari memori/log), jadi selalu akurat."""
    folder = (request.args.get("folder") or "").strip()
    if not folder or not os.path.isdir(folder):
        return jsonify({"ok": False, "message": "Folder tidak valid."}), 400

    pattern = re.compile(r"^([a-z0-9\-]+)_\d{8}-\d{6}_(\d+)\.png$", re.IGNORECASE)
    counts = {}
    for fname in os.listdir(folder):
        m = pattern.match(fname)
        if m:
            slug = m.group(1)
            counts[slug] = counts.get(slug, 0) + 1

    summary = [{"id": k, "count": v} for k, v in sorted(counts.items())]
    return jsonify({
        "ok": True,
        "summary": summary,
        "totalPatients": len(summary),
        "totalFiles": sum(counts.values()),
    })
