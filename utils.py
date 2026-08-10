"""
Helper murni (tidak pegang state global) yang dipakai lintas modul --
image/frame encoding, slug nama pasien, deteksi fokus/blank. Dipisah dari
app.py biar bisa dipakai bareng oleh camera.py, capture.py, dan
segmentation/ tanpa saling import satu sama lain.
"""

import base64
import re

import cv2

# untuk deteksi objek tidak ada (dipakai is_blank_frame)
BLANK_STD_THRESHOLD = 5.0


def safe_slug(name):
    name = name.strip().lower().replace(" ", "-")
    name = re.sub(r"[^a-z0-9\-]", "", name)
    return name or "pasien"


def frame_to_png_base64(frame):
    ok, buf = cv2.imencode(".png", frame)
    if not ok:
        return None
    return base64.b64encode(buf.tobytes()).decode("ascii")


def compute_focus_score(frame):
    """Estimasi ketajaman fokus."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def resize_for_save(frame, target_width, target_height):
    """Resize gambar sebelum disimpan."""
    if not target_width or not target_height:
        return frame
    h, w = frame.shape[:2]
    target_w, target_h = int(target_width), int(target_height)
    if w <= target_w and h <= target_h:
        return frame
    scale = min(target_w / w, target_h / h)
    new_w = max(1, round(w * scale))
    new_h = max(1, round(h * scale))
    return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)


def is_blank_frame(frame):
    """Deteksi kasar frame yang kemungkinan kosong/lensa tertutup."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(gray.std()) < BLANK_STD_THRESHOLD
