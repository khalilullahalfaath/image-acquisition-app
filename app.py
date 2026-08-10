"""
Thalassemia WebApp - Image Acquisition App
Jalankan:
    pip install -r requirements.txt
    python app.py
Lalu buka http://127.0.0.1:5000 di browser.
"""

import os

from flask import Flask, render_template

from camera import camera_bp
from capture import capture_bp
from segmentation import segmentation_bp

app = Flask(__name__)
app.register_blueprint(camera_bp)
app.register_blueprint(capture_bp)
app.register_blueprint(segmentation_bp)


# ---------------------------------------------------------------------------
# Routes - halaman
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    # Dialog "Pengaturan Driver" cuma didukung Windows+DirectShow -- dipakai
    # template buat sembunyikan tombolnya di OS lain (Linux/toupcam) daripada
    # nampilin tombol yang kalau diklik cuma keluar toast "tidak didukung".
    return render_template("index.html", is_windows=(os.name == "nt"))


if __name__ == "__main__":
    app.run(debug=True, threaded=True)
