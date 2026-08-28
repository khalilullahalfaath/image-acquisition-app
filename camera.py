"""
Modul kamera -- enumerasi kamera (OpenCV generik + SDK vendor ToupCam),
CameraManager (buka/baca/capture frame, dual backend), dan endpoint terkait
(/api/cameras, /api/camera/connect, /api/camera/settings, /api/camera/status,
/stream).

Dipisah dari app.py karena ini bagian paling independen -- modul lain
(capture.py, segmentation/) cuma butuh objek `camera` singleton di bawah buat
ambil frame, tidak perlu tahu detail dual-backend OpenCV/ToupCam-nya.
"""

import os
import platform
import sys
import threading
import time

import cv2
import numpy as np
from flask import Blueprint, Response, jsonify, request

from utils import compute_focus_score

camera_bp = Blueprint("camera", __name__)

# Berapa kali read() OpenCV boleh gagal berturut-turut sebelum dianggap
# kamera itu benar-benar terputus (dicabut fisik, dll).
OPENCV_DISCONNECT_THRESHOLD = 15


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
        self.current_width = None    # resolusi aktual kamera yang sedang terhubung
        self.current_height = None
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

        # State khusus backend OpenCV -- cv2.VideoCapture.isOpened() TIDAK
        # otomatis jadi False cuma karena kameranya dicabut fisik; harus
        # dideteksi lewat read() yang gagal berkali-kali berturut-turut.
        self._opencv_connected = False
        self._opencv_read_failures = 0

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
            self.current_width = result.get("width") if result.get("ok") else None
            self.current_height = result.get("height") if result.get("ok") else None
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
        self._opencv_connected = True
        self._opencv_read_failures = 0
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
            with self.lock:
                self._tc_connected = False
                self.last_frame = None

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
                self._opencv_read_failures += 1
                if self._opencv_read_failures >= OPENCV_DISCONNECT_THRESHOLD:
                    self._opencv_connected = False
                    self.last_frame = None
                return None
            self._opencv_read_failures = 0
            self._opencv_connected = True
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
        return self.cap is not None and self.cap.isOpened() and self._opencv_connected

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


# ---------------------------------------------------------------------------
# Routes - API kamera
# ---------------------------------------------------------------------------
@camera_bp.route("/api/cameras")
def api_cameras():
    return jsonify(camera.list_cameras())


@camera_bp.route("/api/camera/connect", methods=["POST"])
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


@camera_bp.route("/api/camera/settings", methods=["POST"])
def api_camera_settings():
    """Buka dialog properti native driver kamera (lihat CameraManager.open_settings_dialog).
    Dialog ini modal -- request bakal nge-hold sampai user menutup jendelanya."""
    return jsonify(camera.open_settings_dialog())


@camera_bp.route("/api/camera/status")
def api_camera_status():
    connected = camera.is_connected()
    return jsonify({
        "connected": connected,
        "index": camera.current_index if connected else None,
        "width": camera.current_width if connected else None,
        "height": camera.current_height if connected else None,
    })


@camera_bp.route("/stream")
def stream():
    return Response(gen_mjpeg(), mimetype="multipart/x-mixed-replace; boundary=frame")
