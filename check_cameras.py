"""
Skrip diagnostik kamera.
"""

import cv2

BACKENDS = [
    ("CAP_DSHOW", cv2.CAP_DSHOW),
    ("CAP_MSMF", cv2.CAP_MSMF),
]

try:
    from pygrabber.dshow_graph import FilterGraph

    names = FilterGraph().get_input_devices()
    print("Device menurut pygrabber (urutan index):")
    for i, n in enumerate(names):
        print(f"  [{i}] {n}")
except Exception as e:
    print("pygrabber gagal / belum terpasang:", e)
    names = []

print()

for backend_name, backend in BACKENDS:
    print(f"=== Backend: {backend_name} ===")
    for i in range(10):
        cap = cv2.VideoCapture(i, backend)
        opened = cap.isOpened()
        frame_ok = False
        shape = None
        if opened:
            ok, frame = cap.read()
            frame_ok = ok
            if ok:
                shape = frame.shape
        label = names[i] if i < len(names) else "?"
        print(f"  index {i} ({label}): opened={opened} frame_ok={frame_ok} shape={shape}")
        cap.release()
    print()

print("Selesai.")
