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
import platform
import re
import sys
import threading
import time
from datetime import datetime

import cv2
import numpy as np
from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)

# Untuk deteksi buram
FOCUS_BLUR_THRESHOLD = 60.0

# untuk deteksi objek tidak ada
BLANK_STD_THRESHOLD = 5.0
LOG_FILENAME = "capture_log.csv"


# ---------------------------------------------------------------------------
# SDK vendor ToupCam (opsional, cuma dipakai di Linux)
# ---------------------------------------------------------------------------
# Beberapa kamera vendor (mis. MiiCam, rebrand dari chipset ToupTek) ternyata
# tidak sepenuhnya UVC-compliant dari sisi yang bisa di-bind modul kernel
# `uvcvideo` standar -- di beberapa board (mis. NVIDIA Jetson) device-nya
# kebaca di level USB tapi gagal dapat /dev/videoN sama sekali. SDK vendor
# (komunikasi langsung ke USB lewat libusb, bypass uvcvideo/V4L2) berhasil
# baca kameranya. Ini loader lazy buat SDK itu.
#
# libtoupcam.so adalah biner native per-arsitektur CPU, jadi dibundel
# per-arsitektur di vendor/toupcam/<arch>/ (masing-masing juga bawa salinan
# toupcam.py sendiri, karena binding-nya cari .so di folder yang sama
# persis dengan dirinya). Arsitektur dideteksi otomatis lewat
# platform.machine() -- tinggal tambah folder arch baru kalau nanti perlu
# platform lain (mis. armhf untuk Raspberry Pi 32-bit).
#
# Cuma dicoba di Linux -- di Windows OpenCV+DirectShow sudah cukup, jadi
# tidak diutak-atik supaya tidak menambah risiko regresi di sana.
_toupcam_sdk_cache = {"loaded": False, "module": None}

_TOUPCAM_ARCH_MAP = {
    "aarch64": "arm64",
    "arm64": "arm64",
    "x86_64": "x64",
    "amd64": "x64",
}


def _load_toupcam_sdk():
    if _toupcam_sdk_cache["loaded"]:
        return _toupcam_sdk_cache["module"]
    _toupcam_sdk_cache["loaded"] = True
    if os.name != "posix":
        return None

    arch_dir = _TOUPCAM_ARCH_MAP.get(platform.machine().lower())
    if arch_dir is None:
        print(f"[DEBUG] ToupCam SDK: arsitektur '{platform.machine()}' belum didukung/dibundel.")
        return None

    vendor_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "vendor", "toupcam", arch_dir
    )
    if not os.path.isfile(os.path.join(vendor_dir, "libtoupcam.so")):
        return None
    try:
        if vendor_dir not in sys.path:
            sys.path.insert(0, vendor_dir)
        import toupcam as toupcam_sdk

        _toupcam_sdk_cache["module"] = toupcam_sdk
        return toupcam_sdk
    except Exception as e:
        print(f"[DEBUG] ToupCam SDK gagal dimuat: {e}")
        return None


# ---------------------------------------------------------------------------
# Camera state
# ---------------------------------------------------------------------------
class CameraManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.backend = None          # "opencv" atau "toupcam", None kalau belum connect
        self.cap = None              # cv2.VideoCapture, dipakai kalau backend == "opencv"
        self.current_index = None    # index tampilan (posisi di list_cameras())
        self.last_frame = None       # frame terakhir dari stream (untuk MJPEG)
        self.captured_frame = None   # frame yang dibekukan lewat tombol Capture
        self.captured_focus_score = None
        self._registry = []          # hasil list_cameras() terakhir, index -> {backend, ...}

        # State khusus backend ToupCam
        self._tc_handle = None
        self._tc_buf = None
        self._tc_row_pitch = 0
        self._tc_width = 0
        self._tc_height = 0
        self._tc_connected = False
        self._tc_last_pull = 0.0

    def list_cameras(self, max_index=5):
        """Daftar kamera yang tersedia, gabungan SDK vendor ToupCam (kalau ada
        kamera yang cuma bisa dibaca lewat situ, mis. MiiCam di Linux) dan
        probe generik OpenCV/pygrabber/V4L2. Hasilnya disimpan di
        self._registry supaya open(index) tahu backend & device id yang tepat
        untuk index yang sama persis dengan yang ditampilkan di sini."""
        registry = []

        toupcam_sdk = _load_toupcam_sdk()
        if toupcam_sdk is not None:
            try:
                devices = toupcam_sdk.Toupcam.EnumV2()
                for dev in devices:
                    registry.append({
                        "name": dev.displayname,
                        "backend": "toupcam",
                        "toupcam_id": dev.id,
                    })
                if devices:
                    print(f"[DEBUG] ToupCam SDK menemukan device: {[d.displayname for d in devices]}")
            except Exception as e:
                print(f"[DEBUG] ToupCam EnumV2 gagal: {e}")

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
                for i, n in enumerate(names):
                    registry.append({"name": n, "backend": "opencv", "cv_index": i})
            except Exception as e:
                print(f"[DEBUG] pygrabber gagal, fallback ke probe OpenCV: {e}")
                registry.extend(self._probe_opencv_indices(max_index))
        else:
            registry.extend(self._probe_opencv_indices(max_index))

        for i, entry in enumerate(registry):
            entry["index"] = i
        self._registry = registry
        return [{"index": e["index"], "name": e["name"]} for e in registry]

    def _probe_opencv_indices(self, max_index):
        backend = cv2.CAP_DSHOW if os.name == "nt" else 0
        found = []
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
                found.append({"name": name, "backend": "opencv", "cv_index": i})
            if cap is not None:
                cap.release()
        return found

    def open(self, index, width=None, height=None):
        """Buka kamera pada index tampilan (hasil list_cameras()). Otomatis
        pilih backend yang sesuai (ToupCam SDK atau OpenCV) berdasarkan
        self._registry."""
        with self.lock:
            entry = self._registry[index] if 0 <= index < len(self._registry) else None
            self._release_locked()

            if entry is not None and entry["backend"] == "toupcam":
                result = self._open_toupcam_locked(entry["toupcam_id"], width, height)
            else:
                cv_index = entry["cv_index"] if entry is not None else index
                result = self._open_opencv_locked(cv_index, width, height)

            self.current_index = index if result.get("ok") else None
            return result

    def _release_locked(self):
        """Lepas backend yang sedang aktif (kalau ada). Harus dipanggil
        dalam keadaan self.lock sudah dipegang."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        if self._tc_handle is not None:
            try:
                self._tc_handle.Close()
            except Exception:
                pass
            self._tc_handle = None
        self._tc_connected = False
        self.backend = None

    def _open_opencv_locked(self, cv_index, width, height):
        backend = cv2.CAP_DSHOW if os.name == "nt" else 0
        cap = cv2.VideoCapture(cv_index, backend)
        if not cap.isOpened():
            return {"ok": False}

        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))

        if width and height:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, int(width))
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, int(height))
        actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.cap = cap
        self.backend = "opencv"
        return {"ok": True, "width": actual_w, "height": actual_h}

    def _open_toupcam_locked(self, cam_id, width, height):
        sdk = _load_toupcam_sdk()
        if sdk is None:
            return {"ok": False, "message": "ToupCam SDK tidak tersedia."}
        try:
            h = sdk.Toupcam.Open(cam_id)
        except Exception as e:
            return {"ok": False, "message": f"Gagal membuka kamera (ToupCam): {e}"}
        if h is None:
            return {"ok": False}

        try:
            # Paksa BGR (default di Linux adalah RGB) biar konsisten dengan
            # OpenCV di sisa aplikasi (imencode/imwrite/cvtColor semua asumsi BGR).
            h.put_Option(sdk.TOUPCAM_OPTION_BYTEORDER, 1)
        except Exception:
            pass

        if width and height:
            try:
                # Sensor ToupCam cuma mendukung daftar resolusi diskrit
                # tertentu (bukan sembarang angka) -- put_Size(width, height)
                # dengan nilai yang bukan salah satu step itu akan ditolak
                # (E_INVALIDARG). Jadi cari dulu resolusi valid TERDEKAT dari
                # daftar yang benar-benar didukung kamera, baru pakai
                # put_eSize(index) buat pilih itu.
                target_w, target_h = int(width), int(height)
                n = h.ResolutionNumber()
                best_idx, best_score = None, None
                for i in range(n):
                    rw, rh = h.get_Resolution(i)
                    score = abs(rw - target_w) + abs(rh - target_h)
                    if best_score is None or score < best_score:
                        best_idx, best_score = i, score
                if best_idx is not None:
                    h.put_eSize(best_idx)
            except Exception as e:
                print(f"[DEBUG] ToupCam set resolusi gagal (lanjut pakai resolusi default): {e}")

        try:
            # RealTime = SDK selalu kirim frame TERBARU dan buang backlog,
            h.put_RealTime(1)
        except Exception:
            pass

        try:
            w, ht = h.get_Size()
        except Exception as e:
            try:
                h.Close()
            except Exception:
                pass
            return {"ok": False, "message": f"Gagal membaca ukuran gambar (ToupCam): {e}"}

        self._tc_handle = h
        self._tc_row_pitch = w * 3
        self._tc_buf = bytes(self._tc_row_pitch * ht)
        self._tc_width = w
        self._tc_height = ht
        self._tc_connected = True
        self._tc_last_pull = 0.0
        self.backend = "toupcam"

        try:
            h.StartPullModeWithCallback(CameraManager._toupcam_event_callback, self)
        except Exception as e:
            self._tc_handle = None
            self._tc_connected = False
            self.backend = None
            try:
                h.Close()
            except Exception:
                pass
            return {"ok": False, "message": f"Gagal memulai stream (ToupCam): {e}"}

        return {"ok": True, "width": w, "height": ht}

    @staticmethod
    def _toupcam_event_callback(nEvent, ctx):
        # Callback ini dipanggil dari thread internal SDK, bukan thread Flask.
        ctx._on_toupcam_event(nEvent)

    def _on_toupcam_event(self, nEvent):
        sdk = _load_toupcam_sdk()
        if sdk is None:
            return
        if nEvent == sdk.TOUPCAM_EVENT_IMAGE:
            # Throttle ke ~20fps.
            now = time.monotonic()
            if now - self._tc_last_pull < 0.05:
                return
            self._tc_last_pull = now
            try:
                with self.lock:
                    if self._tc_handle is None:
                        return
                    self._tc_handle.PullImageV4(self._tc_buf, 0, 24, self._tc_row_pitch, None)
                    frame = np.frombuffer(self._tc_buf, dtype=np.uint8).reshape(
                        (self._tc_height, self._tc_width, 3)
                    ).copy()
                    self.last_frame = frame
            except Exception as e:
                print(f"[DEBUG] ToupCam PullImageV4 gagal: {e}")
        elif nEvent in (sdk.TOUPCAM_EVENT_DISCONNECTED, sdk.TOUPCAM_EVENT_ERROR):
            print(f"[DEBUG] ToupCam event disconnect/error: {nEvent}")
            self._tc_connected = False

    def read(self):
        with self.lock:
            if self.backend == "toupcam":
                if not self._tc_connected or self._tc_handle is None:
                    return None
                return self.last_frame
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
        if self.backend == "toupcam":
            return self._tc_handle is not None and self._tc_connected
        return self.cap is not None and self.cap.isOpened()

    def open_settings_dialog(self):
        """Buka dialog properti bawaan driver DirectShow kamera (kalau didukung).

        Berguna buat atur exposure/white balance/dll manual langsung lewat
        kontrol bawaan drivernya sendiri. Cuma jalan di Windows + backend
        CAP_DSHOW; kamera lain (mis. webcam bawaan laptop) biasanya tidak
        butuh ini karena sudah nurut lewat cv2.set() biasa.
        """
        if os.name != "nt":
            return {"ok": False, "message": "Fitur ini hanya didukung di Windows (DirectShow)."}
        with self.lock:
            if self.cap is None or not self.cap.isOpened():
                return {"ok": False, "message": "Kamera belum terhubung."}
            try:
                self.cap.set(cv2.CAP_PROP_SETTINGS, 1)
            except Exception as e:
                return {"ok": False, "message": f"Gagal membuka dialog pengaturan: {e}"}
            actual_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            return {"ok": True, "width": actual_w, "height": actual_h}


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
        "message": result.get("message"),
    })


@app.route("/api/camera/settings", methods=["POST"])
def api_camera_settings():
    """Buka dialog properti native driver kamera (lihat CameraManager.open_settings_dialog).
    Dialog ini modal -- request bakal nge-hold sampai user menutup jendelanya."""
    return jsonify(camera.open_settings_dialog())


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
