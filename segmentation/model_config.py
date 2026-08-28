"""
Status & konfigurasi model segmentasi -- placeholder transparansi (inference
model instance segmentation ASLI, Mask R-CNN/Detectron2, belum dipasang
sama sekali, lihat mock_model.py). File config ini cuma NYIMPAN path
checkpoint yang direncanakan dipakai nanti, belum benar-benar memuat/
menjalankan model apapun -- tujuannya biar plumbing-nya sudah siap begitu
integrasi model beneran dikerjakan (tinggal baca MODEL_CONFIG_PATH di
mock_model.py/routes.py dan branch ke inference asli).
"""

import json
import os

from flask import jsonify, request

from . import segmentation_bp

MODEL_CONFIG_FILENAME = "model_config.json"
# Naik dua level dari segmentation/model_config.py -> folder project root,
# sama persis dengan lokasi model_config.json sebelum dipecah jadi package
# (dulu ditaruh di sebelah app.py).
MODEL_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), MODEL_CONFIG_FILENAME
)


def _load_model_config():
    if os.path.isfile(MODEL_CONFIG_PATH):
        try:
            with open(MODEL_CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            pass
    return {"modelPath": ""}


@segmentation_bp.route("/api/segmentation/model-status")
def api_segmentation_model_status():
    config = _load_model_config()
    model_path = (config.get("modelPath") or "").strip()
    model_file_found = bool(model_path) and os.path.isfile(model_path)
    if model_path:
        detail = (
            f'Path model tersimpan ("{model_path}"), tapi kode inference asli belum '
            "dipasang -- ini baru tempat konfigurasi buat nanti."
        )
    else:
        detail = "Belum ada path model dikonfigurasi."
    return jsonify({
        "ok": True,
        "usingMock": True,
        "modelPath": model_path,
        "modelFileFound": model_file_found,
        "message": "Semua hasil segmentasi saat ini masih DUMMY/placeholder. " + detail,
    })


@segmentation_bp.route("/api/segmentation/model-config", methods=["POST"])
def api_segmentation_model_config():
    data = request.json or {}
    model_path = (data.get("modelPath") or "").strip()
    try:
        with open(MODEL_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump({"modelPath": model_path}, f, ensure_ascii=False, indent=2)
    except OSError as e:
        return jsonify({"ok": False, "message": f"Gagal menyimpan konfigurasi: {e}"}), 500
    return jsonify({"ok": True, "modelPath": model_path})
