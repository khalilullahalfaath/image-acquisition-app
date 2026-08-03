"""
Thalassemia WebApp - Image Acquisition App
Jalankan:
    pip install -r requirements.txt
    python app.py
Lalu buka http://127.0.0.1:5000 di browser.
"""

import base64
import csv
import os
import re
import threading
import time
from datetime import datetime

import cv2
from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)

# Untuk deteksi buram
FOCUS_BLUR_THRESHOLD = 60.0 

# untuk deteksi objek tidak ada
BLANK_STD_THRESHOLD = 5.0     
LOG_FILENAME = "capture_log.csv"


# ---------------------------------------------------------------------------
# Camera state
# ---------------------------------------------------------------------------
class CameraManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.cap = None
        self.current_index = None
        self.last_frame = None       # frame terakhir dari stream (untuk MJPEG)
        self.captured_frame = None   # frame yang dibekukan lewat tombol Capture
        self.captured_focus_score = None

    def list_cameras(self, max_index=5):
        """Daftar kamera yang tersedia."""
        if os.name == "nt":
            try:
                import comtypes
                try:
                    comtypes.CoInitialize()
                except Exception:
                    pass

                from pygrabber.dshow_graph import FilterGraph

                names = FilterGraph().get_input_devices()
                print(f"[DEBUG] pygrabber menemukan device: {list(enumerate(names))}")
                return [{"index": i, "name": n} for i, n in enumerate(names)]
            except Exception as e:
                print(f"[DEBUG] pygrabber gagal, fallback ke probe OpenCV: {e}")

        backend = cv2.CAP_DSHOW if os.name == "nt" else 0
        available = []
        for i in range(max_index):
            cap = cv2.VideoCapture(i, backend)
            if cap is not None and cap.isOpened():
                name = f"Kamera USB #{i}"
                if os.name == "posix":
                    name_path = f"/sys/class/video4linux/video{i}/name"
                    try:
                        if os.path.isfile(name_path):
                            with open(name_path, "r") as f:
                                real_name = f.read().strip()
                            if real_name:
                                name = real_name
                    except OSError:
                        pass
                available.append({"index": i, "name": name})
            if cap is not None:
                cap.release()
        return available

    def open(self, index, width=None, height=None):
        """Buka kamera di index tertentu."""
        with self.lock:
            if self.cap is not None:
                self.cap.release()
                self.cap = None
            backend = cv2.CAP_DSHOW if os.name == "nt" else 0
            cap = cv2.VideoCapture(index, backend)
            if not cap.isOpened():
                self.cap = None
                self.current_index = None
                return {"ok": False}
            if width and height:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, int(width))
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, int(height))
            actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            self.cap = cap
            self.current_index = index
            return {"ok": True, "width": actual_w, "height": actual_h}

    def read(self):
        with self.lock:
            if self.cap is None or not self.cap.isOpened():
                return None
            ok, frame = self.cap.read()
            if not ok:
                return None
            self.last_frame = frame
            return frame

    def capture(self):
        with self.lock:
            if self.last_frame is None:
                return None
            self.captured_frame = self.last_frame.copy()
            self.captured_focus_score = compute_focus_score(self.captured_frame)
            return self.captured_frame

    def is_connected(self):
        return self.cap is not None and self.cap.isOpened()

camera = CameraManager()


def next_iteration_from_folder(folder, slug):
    """Tentukan nomor iterasi berikutnya dengan membaca file yang SUDAH ADA di folder tujuan.
    """
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


def gen_mjpeg():
    while True:
        frame = camera.read()
        if frame is None:
            time.sleep(0.2)
            continue
        ok, buf = cv2.imencode(".jpg", frame)
        if not ok:
            continue
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
        )
        time.sleep(0.03)  # kurang lebih 30 fps


def frame_to_png_base64(frame):
    ok, buf = cv2.imencode(".png", frame)
    if not ok:
        return None
    return base64.b64encode(buf.tobytes()).decode("ascii")


def safe_slug(name):
    name = name.strip().lower().replace(" ", "-")
    name = re.sub(r"[^a-z0-9\-]", "", name)
    return name or "pasien"


def compute_focus_score(frame):
    """Estimasi ketajaman fokus."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def resize_for_save(frame, target_width, target_height):
    """Resize gambar sebelum disimpan."
    """
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
    """Deteksi kasar frame yang kemungkinan kosong/lensa tertutup"""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(gray.std()) < BLANK_STD_THRESHOLD


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
# Routes - halaman
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# Routes - API kamera
# ---------------------------------------------------------------------------
@app.route("/api/cameras")
def api_cameras():
    return jsonify(camera.list_cameras())


@app.route("/api/camera/connect", methods=["POST"])
def api_camera_connect():
    data = request.json or {}
    index = int(data.get("index", 0))
    width = data.get("width")
    height = data.get("height")
    result = camera.open(index, width, height)
    return jsonify({
        "connected": result["ok"],
        "index": index,
        "width": result.get("width"),
        "height": result.get("height"),
    })


@app.route("/api/camera/status")
def api_camera_status():
    return jsonify({"connected": camera.is_connected(), "index": camera.current_index})


@app.route("/stream")
def stream():
    return Response(gen_mjpeg(), mimetype="multipart/x-mixed-replace; boundary=frame")


# ---------------------------------------------------------------------------
# Routes - capture & save
# ---------------------------------------------------------------------------
@app.route("/api/capture", methods=["POST"])
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


@app.route("/api/select-folder", methods=["POST"])
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


@app.route("/api/save", methods=["POST"])
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


@app.route("/api/folder-summary")
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


if __name__ == "__main__":
    app.run(debug=True, threaded=True)
