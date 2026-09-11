"""
Endpoint inti tab Segmentasi: daftar kelas, pilih gambar, jalankan (mock)
instance segmentation, muat/simpan hasil, proses batch satu folder, cek hasil
lama, dan ringkasan per pasien.

Scaffold UI + hasil DUMMY dulu -- model instance segmentation beneran
(rencana: Mask R-CNN/Detectron2, dilatih dari RBC Chula dataset) belum
dilatih/dipasang (lihat mock_model.py). Kontrak response endpoint-endpoint
ini sudah dirancang final (bukan sekadar placeholder acak) supaya begitu
model beneran dipasang, frontend nggak perlu diubah lagi.
"""

import csv
import json
import os
import threading
import time
from datetime import datetime

import cv2
from flask import jsonify, request

from utils import frame_to_png_base64

from . import segmentation_bp
from .constants import (
    RBC_CLASS_COLORS,
    RBC_CLASS_LABELS,
    SEGMENTATION_LOG_FIELDNAMES,
    SEGMENTATION_LOG_FILENAME,
)
from .mock_model import generate_mock_instance_segmentation
from .storage import (
    _ensure_log_columns,
    _latest_segmentation_rows,
    _load_segmentation_detail_file,
    segmentation_log_lock,
)


@segmentation_bp.route("/api/segmentation/classes")
def api_segmentation_classes():
    return jsonify([
        {"index": i, "label": label, "color": RBC_CLASS_COLORS[i]}
        for i, label in enumerate(RBC_CLASS_LABELS)
    ])


@segmentation_bp.route("/api/segmentation/select-image", methods=["POST"])
def api_segmentation_select_image():
    """Buka dialog pilih file gambar NATIVE lewat tkinter, baca isinya, dan
    kirim balik sebagai base64 buat preview (konsisten dengan pola
    /api/capture yang sudah ada -- bukan serve file lewat URL)."""
    result = {"path": None}

    def open_dialog():
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        result["path"] = filedialog.askopenfilename(
            title="Pilih Citra Apusan Darah",
            filetypes=[
                ("Gambar", "*.png *.jpg *.jpeg *.bmp *.tif *.tiff"),
                ("Semua file", "*.*"),
            ],
        )
        root.destroy()

    t = threading.Thread(target=open_dialog)
    t.start()
    t.join()

    if not result["path"]:
        return jsonify({"ok": False}), 400

    frame = cv2.imread(result["path"])
    if frame is None:
        return jsonify({"ok": False, "message": "Gagal membaca file gambar."}), 400

    b64 = frame_to_png_base64(frame)
    height, width = frame.shape[:2]
    return jsonify({
        "ok": True,
        "path": result["path"],
        "filename": os.path.basename(result["path"]),
        "image": b64,
        "width": width,
        "height": height,
    })


@segmentation_bp.route("/api/segmentation/run", methods=["POST"])
def api_segmentation_run():
    """PLACEHOLDER -- model instance segmentation beneran (Mask R-CNN/
    Detectron2, dilatih dari RBC Chula dataset) belum dilatih & dipasang.
    Endpoint ini mengembalikan deteksi DUMMY (lihat
    generate_mock_instance_segmentation) supaya seluruh alur UI bisa
    dibangun & dites duluan. Begitu modelnya siap, ganti isi fungsi ini jadi
    manggil inference beneran -- kontrak response-nya (detections +
    classCounts) dipertahankan supaya frontend nggak perlu diubah lagi."""
    data = request.json or {}
    path = (data.get("path") or "").strip()
    if not path or not os.path.isfile(path):
        return jsonify({"ok": False, "message": "Gambar sumber tidak valid."}), 400

    frame = cv2.imread(path)
    if frame is None:
        return jsonify({"ok": False, "message": "Gagal membaca gambar sumber."}), 400

    # Simulasi waktu proses model beneran, biar indikator progres di UI ada
    # gunanya buat dites -- kecilkan/hapus begitu inference asli dipasang.
    time.sleep(1.2)

    detections = generate_mock_instance_segmentation(frame)
    class_counts = {label: 0 for label in RBC_CLASS_LABELS}
    for d in detections:
        class_counts[d["classLabel"]] += 1

    height, width = frame.shape[:2]
    return jsonify({
        "ok": True,
        "mock": True,
        "message": (
            "Hasil DUMMY/placeholder"
        ),
        "imageWidth": width,
        "imageHeight": height,
        "detections": detections,
        "classCounts": class_counts,
    })


@segmentation_bp.route("/api/segmentation/load", methods=["POST"])
def api_segmentation_load():
    """Buka file JSON hasil segmentasi yang sudah pernah disimpan lewat
    /api/segmentation/save, muat balik detections-nya (termasuk koreksi
    manual sebelumnya kalau ada), dan coba baca ulang gambar sumbernya buat
    preview -- biar user bisa lihat & lanjut koreksi tanpa mulai dari nol."""
    result = {"path": None}

    def open_dialog():
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        result["path"] = filedialog.askopenfilename(
            title="Pilih File Hasil Segmentasi (JSON)",
            filetypes=[("Hasil segmentasi (JSON)", "*.json"), ("Semua file", "*.*")],
        )
        root.destroy()

    t = threading.Thread(target=open_dialog)
    t.start()
    t.join()

    if not result["path"]:
        return jsonify({"ok": False}), 400

    return jsonify(_load_segmentation_detail_file(result["path"]))


@segmentation_bp.route("/api/segmentation/load-path", methods=["POST"])
def api_segmentation_load_path():
    """Sama seperti /api/segmentation/load, tapi path file JSON-nya dikirim
    langsung dari frontend (klik salah satu baris di daftar "Hasil di
    Folder Ini"), TANPA buka dialog file lagi -- dipakai buat review hasil
    batch (banyak gambar sekaligus, mis. satu pasien ~20 capture) tanpa
    perlu buka-tutup dialog satu-satu per gambar."""
    data = request.json or {}
    detail_path = (data.get("path") or "").strip()
    if not detail_path or not os.path.isfile(detail_path):
        return jsonify({"ok": False, "message": "File hasil tidak valid."}), 400
    return jsonify(_load_segmentation_detail_file(detail_path))


@segmentation_bp.route("/api/segmentation/list-results")
def api_segmentation_list_results():
    """Daftar hasil segmentasi TERBARU per gambar sumber di satu folder
    (dibaca dari segmentation_log.csv) -- ditampilkan sebagai daftar yang
    bisa diklik satu-satu di dalam aplikasi (lewat /load-path).

    Satu gambar bisa saja tercatat berkali-kali di log (mis. diproses
    individual dulu, terus ikut ke-proses lagi lewat batch, atau batch
    dijalankan dua kali) -- karena hasilnya masih DUMMY/acak, tiap proses
    ulang menghasilkan deteksi yang beda. Supaya nggak ambigu "yang mana
    yang berlaku", di sini CUMA baris dengan timestamp TERBARU per
    source_image yang ditampilkan; baris-baris lama tetap ada di CSV
    (nggak dihapus, buat jejak audit) tapi disembunyikan dari daftar ini."""
    folder = (request.args.get("folder") or "").strip()
    if not folder or not os.path.isdir(folder):
        return jsonify({"ok": False, "message": "Folder tidak valid."}), 400

    try:
        rows = _latest_segmentation_rows(folder)
    except OSError as e:
        return jsonify({"ok": False, "message": f"Gagal membaca log: {e}"}), 500

    results = [
        {
            "detailPath": os.path.join(folder, row.get("detail_file")),
            "detailFile": row.get("detail_file"),
            "sourceImage": row.get("source_image"),
            "patientId": row.get("patient_id"),
            "totalCells": row.get("total_cells"),
            "timestamp": row.get("timestamp"),
            "isDuplicate": (row.get("is_duplicate") or "0") == "1",
            "duplicateOfFile": row.get("duplicate_of") or None,
        }
        for row in rows
        if row.get("detail_file")
    ]
    results.sort(key=lambda r: r["timestamp"] or "", reverse=True)
    return jsonify({"ok": True, "folder": folder, "results": results})


@segmentation_bp.route("/api/segmentation/save", methods=["POST"])
def api_segmentation_save():
    """Simpan hasil segmentasi (termasuk koreksi manual dari UI, kalau ada)
    ke dua tempat, keduanya di folder yang sama dengan gambar sumbernya:
      1. File JSON detail per-sel (mask polygon, confidence, status koreksi)
      2. Satu baris ringkasan di segmentation_log.csv (jumlah sel per kelas
         -- format kolom per kelas biar gampang dianalisis langsung di Excel)

    Sebelum benar-benar nulis, dicek dulu apakah hasil ini PERSIS SAMA
    (total sel + jumlah per kelas identik) dengan hasil TERAKHIR yang sudah
    tersimpan buat gambar yang sama -- kalau iya dan client belum kirim
    `force: true`, nggak jadi ditulis, cuma balikin `needsConfirmation` biar
    frontend nanya dulu ke user (lihat trySaveSegmentation()). Ini buat
    nyegah folder numpuk banyak file JSON isinya sama persis tanpa sadar.
    """
    data = request.json or {}
    path = (data.get("path") or "").strip()
    patient_id = (data.get("patientId") or "").strip()
    detections = data.get("detections") or []
    force = bool(data.get("force"))

    if not path or not os.path.isfile(path):
        return jsonify({"ok": False, "message": "Gambar sumber tidak valid."}), 400
    if not detections:
        return jsonify({"ok": False, "message": "Belum ada hasil segmentasi untuk disimpan."}), 400

    folder = os.path.dirname(path)
    base_name = os.path.splitext(os.path.basename(path))[0]
    source_image_basename = os.path.basename(path)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    class_counts = {label: 0 for label in RBC_CLASS_LABELS}
    for d in detections:
        label = d.get("correctedClassLabel") or d.get("classLabel")
        if label in class_counts:
            class_counts[label] += 1

    with segmentation_log_lock:
        log_path = os.path.join(folder, SEGMENTATION_LOG_FILENAME)
        _ensure_log_columns(log_path, SEGMENTATION_LOG_FIELDNAMES)

        prev_row = next(
            (r for r in _latest_segmentation_rows(folder) if r.get("source_image") == source_image_basename),
            None,
        )
        is_duplicate = False
        duplicate_of = ""
        if prev_row is not None:
            try:
                prev_total = int(prev_row.get("total_cells") or 0)
                counts_match = all(
                    int(prev_row.get(label) or 0) == class_counts[label] for label in RBC_CLASS_LABELS
                )
                is_duplicate = counts_match and prev_total == len(detections)
            except (TypeError, ValueError):
                is_duplicate = False
            if is_duplicate:
                duplicate_of = prev_row.get("detail_file") or ""

        if is_duplicate and not force:
            return jsonify({
                "ok": True,
                "needsConfirmation": True,
                "isDuplicate": True,
                "lastTimestamp": prev_row.get("timestamp"),
                "lastDetailFile": duplicate_of,
            })

        detail_filename = f"{base_name}_segmentation_{timestamp}.json"
        detail_path = os.path.join(folder, detail_filename)
        # Timestamp cuma presisi per detik -- kalau ada dua save dalam detik
        # yang sama (mis. warning duplikat lalu langsung "tetap simpan"),
        # nama filenya bakal sama & nimpa file sebelumnya. Tambah suffix
        # numerik biar tetap unik.
        dedup_suffix = 1
        while os.path.exists(detail_path):
            detail_filename = f"{base_name}_segmentation_{timestamp}-{dedup_suffix}.json"
            detail_path = os.path.join(folder, detail_filename)
            dedup_suffix += 1
        try:
            with open(detail_path, "w", encoding="utf-8") as f:
                json.dump({
                    "timestamp": timestamp,
                    "patientId": patient_id,
                    "sourceImage": path,
                    "detections": detections,
                    "isDuplicate": is_duplicate,
                    "duplicateOfFile": duplicate_of or None,
                }, f, ensure_ascii=False, indent=2)
        except OSError as e:
            return jsonify({"ok": False, "message": f"Gagal menyimpan file detail: {e}"}), 500

        is_new = not os.path.exists(log_path)
        row = {
            "timestamp": timestamp,
            "patient_id": patient_id or "?",
            "source_image": source_image_basename,
            "detail_file": detail_filename,
            "total_cells": len(detections),
            "is_duplicate": "1" if is_duplicate else "0",
            "duplicate_of": duplicate_of,
            **class_counts,
        }
        try:
            with open(log_path, "a", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=SEGMENTATION_LOG_FIELDNAMES)
                if is_new:
                    writer.writeheader()
                writer.writerow(row)
        except OSError as e:
            return jsonify({"ok": False, "message": f"Gagal menulis log: {e}"}), 500

    return jsonify({
        "ok": True,
        "detailPath": detail_path,
        "logPath": log_path,
        "totalCells": len(detections),
        "isDuplicate": is_duplicate,
    })


@segmentation_bp.route("/api/segmentation/batch-select", methods=["POST"])
def api_segmentation_batch_select():
    """Dialog pilih FOLDER buat proses batch -- daftar file gambar langsung
    di dalam folder itu (bukan rekursif ke subfolder) dikembalikan supaya
    frontend bisa konfirmasi dulu jumlahnya ke user sebelum benar-benar
    diproses (bisa makan waktu kalau isinya banyak)."""
    result = {"path": None}

    def open_dialog():
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        result["path"] = filedialog.askdirectory(title="Pilih Folder Citra untuk Diproses Batch")
        root.destroy()

    t = threading.Thread(target=open_dialog)
    t.start()
    t.join()

    if not result["path"]:
        return jsonify({"ok": False}), 400

    image_exts = (".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff")
    try:
        files = sorted(
            f for f in os.listdir(result["path"])
            if f.lower().endswith(image_exts) and os.path.isfile(os.path.join(result["path"], f))
        )
    except OSError as e:
        return jsonify({"ok": False, "message": f"Gagal membaca isi folder: {e}"}), 400

    return jsonify({"ok": True, "folder": result["path"], "files": files})


@segmentation_bp.route("/api/segmentation/batch-run", methods=["POST"])
def api_segmentation_batch_run():
    """PLACEHOLDER -- proses SEMUA gambar dalam satu folder sekaligus:
    jalankan (mock) instance segmentation + langsung simpan hasilnya (JSON
    detail + baris di segmentation_log.csv) untuk tiap gambar, tanpa jeda
    buat koreksi manual per gambar (koreksi tetap bisa dilakukan belakangan
    per file lewat "Muat Hasil Tersimpan"). Model instance segmentation
    beneran belum dilatih -- begitu siap, ganti pemanggilan
    generate_mock_instance_segmentation() di bawah jadi inference asli,
    sisanya (penyimpanan, agregasi) nggak perlu diubah."""
    data = request.json or {}
    folder = (data.get("folder") or "").strip()
    patient_id = (data.get("patientId") or "").strip()
    skip_existing = bool(data.get("skipExisting"))
    if not folder or not os.path.isdir(folder):
        return jsonify({"ok": False, "message": "Folder tidak valid."}), 400

    image_exts = (".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff")
    files = sorted(
        f for f in os.listdir(folder)
        if f.lower().endswith(image_exts) and os.path.isfile(os.path.join(folder, f))
    )
    if not files:
        return jsonify({"ok": False, "message": "Tidak ada file gambar di folder ini."}), 400

    grand_total_counts = {label: 0 for label in RBC_CLASS_LABELS}
    per_image_results = []
    already_processed = set()

    with segmentation_log_lock:
        log_path = os.path.join(folder, SEGMENTATION_LOG_FILENAME)
        _ensure_log_columns(log_path, SEGMENTATION_LOG_FIELDNAMES)
        is_new_log = not os.path.exists(log_path)

        if skip_existing and os.path.isfile(log_path):
            try:
                with open(log_path, "r", newline="", encoding="utf-8") as f:
                    for row in csv.DictReader(f):
                        si = row.get("source_image")
                        if si:
                            already_processed.add(si)
            except OSError:
                pass

        for fname in files:
            if skip_existing and fname in already_processed:
                per_image_results.append({
                    "filename": fname, "ok": True, "skipped": True,
                    "message": "Dilewati -- sudah pernah diproses sebelumnya.",
                })
                continue

            fpath = os.path.join(folder, fname)
            frame = cv2.imread(fpath)
            if frame is None:
                per_image_results.append({"filename": fname, "ok": False, "message": "Gagal dibaca."})
                continue

            # Delay simulasi diperkecil dibanding mode satu-gambar, biar
            # batch banyak file nggak kelamaan -- hapus kalau model beneran
            # sudah dipasang (delay ini murni buat placeholder).
            time.sleep(0.3)
            detections = generate_mock_instance_segmentation(frame)

            base_name = os.path.splitext(fname)[0]
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            detail_filename = f"{base_name}_segmentation_{timestamp}.json"
            detail_path = os.path.join(folder, detail_filename)
            try:
                with open(detail_path, "w", encoding="utf-8") as f:
                    json.dump({
                        "timestamp": timestamp,
                        "patientId": patient_id,
                        "sourceImage": fpath,
                        "detections": detections,
                    }, f, ensure_ascii=False, indent=2)
            except OSError as e:
                per_image_results.append({"filename": fname, "ok": False, "message": f"Gagal menyimpan detail: {e}"})
                continue

            class_counts = {label: 0 for label in RBC_CLASS_LABELS}
            for d in detections:
                class_counts[d["classLabel"]] += 1
                grand_total_counts[d["classLabel"]] += 1

            row = {
                "timestamp": timestamp,
                "patient_id": patient_id or "?",
                "source_image": fname,
                "detail_file": detail_filename,
                "total_cells": len(detections),
                "is_duplicate": "0",  # batch selalu jalankan segmentasi baru, nggak dicek duplikat
                "duplicate_of": "",
                **class_counts,
            }
            try:
                with open(log_path, "a", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=SEGMENTATION_LOG_FIELDNAMES)
                    if is_new_log:
                        writer.writeheader()
                        is_new_log = False
                    writer.writerow(row)
            except OSError as e:
                per_image_results.append({"filename": fname, "ok": False, "message": f"Gagal menulis log: {e}"})
                continue

            per_image_results.append({
                "filename": fname,
                "ok": True,
                "totalCells": len(detections),
                "classCounts": class_counts,
                "detailFile": detail_filename,
            })

    total_skipped = sum(1 for r in per_image_results if r.get("skipped"))
    total_processed = sum(1 for r in per_image_results if r["ok"] and not r.get("skipped"))
    return jsonify({
        "ok": True,
        "mock": True,
        "folder": folder,
        "totalImages": len(files),
        "totalImagesOk": sum(1 for r in per_image_results if r["ok"]),
        "totalSkipped": total_skipped,
        "grandTotalCounts": grand_total_counts,
        "perImage": per_image_results,
        "message": (
            f"Batch selesai (hasil DUMMY/placeholder) -- {total_processed} gambar diproses"
            + (f", {total_skipped} dilewati (sudah ada)" if total_skipped else "")
            + ". Model instance segmentation beneran belum dilatih."
        ),
    })


@segmentation_bp.route("/api/segmentation/check-existing")
def api_segmentation_check_existing():
    """Cek apakah satu gambar (by path) sudah pernah punya hasil segmentasi
    tersimpan di segmentation_log.csv folder yang sama -- dipakai buat
    warning sebelum reprocess individual (biar nggak nggak sadar bikin
    hasil baru yang beda random dari yang lama, lihat juga skipExisting di
    /batch-run buat kasus batch)."""
    path = (request.args.get("path") or "").strip()
    if not path:
        return jsonify({"exists": False})

    folder = os.path.dirname(path)
    fname = os.path.basename(path)
    log_path = os.path.join(folder, SEGMENTATION_LOG_FILENAME)
    if not os.path.isfile(log_path):
        return jsonify({"exists": False})

    latest = None
    try:
        with open(log_path, "r", newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("source_image") != fname:
                    continue
                ts = row.get("timestamp") or ""
                if latest is None or ts >= (latest.get("timestamp") or ""):
                    latest = row
    except OSError:
        return jsonify({"exists": False})

    if latest is None:
        return jsonify({"exists": False})

    return jsonify({
        "exists": True,
        "detailFile": latest.get("detail_file"),
        "totalCells": latest.get("total_cells"),
        "timestamp": latest.get("timestamp"),
    })


@segmentation_bp.route("/api/segmentation/patient-summary")
def api_segmentation_patient_summary():
    """Agregasi segmentation_log.csv per patient_id dalam satu folder --
    total gambar, total sel, dan breakdown per kelas.

    Dedup dulu per source_image (ambil baris TERBARU aja per gambar,
    sama seperti /api/segmentation/list-results) SEBELUM diagregasi --
    kalau tidak, gambar yang kebetulan diproses lebih dari sekali
    (individual lalu ikut batch, atau batch dijalankan dua kali) bakal
    kehitung dobel/lebih di total & breakdown per kelas."""
    folder = (request.args.get("folder") or "").strip()
    if not folder or not os.path.isdir(folder):
        return jsonify({"ok": False, "message": "Folder tidak valid."}), 400

    try:
        rows = _latest_segmentation_rows(folder)
    except OSError as e:
        return jsonify({"ok": False, "message": f"Gagal membaca log: {e}"}), 500

    patients = {}
    for row in rows:
        pid = row.get("patient_id") or "?"
        if pid not in patients:
            patients[pid] = {
                "patientId": pid,
                "totalImages": 0,
                "totalCells": 0,
                "classCounts": {label: 0 for label in RBC_CLASS_LABELS},
            }
        patients[pid]["totalImages"] += 1
        try:
            patients[pid]["totalCells"] += int(row.get("total_cells") or 0)
        except ValueError:
            pass
        for label in RBC_CLASS_LABELS:
            try:
                patients[pid]["classCounts"][label] += int(row.get(label) or 0)
            except (ValueError, TypeError):
                pass

    return jsonify({
        "ok": True,
        "patients": sorted(patients.values(), key=lambda p: p["patientId"]),
    })
