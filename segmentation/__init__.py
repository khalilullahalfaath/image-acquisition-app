"""
Package segmentasi & klasifikasi morfologi sel (tab Segmentasi) -- instance
segmentation RBC 13 kelas. Dipecah jadi beberapa modul:

  constants.py     -- label/warna kelas, nama file log
  mock_model.py     -- generator deteksi DUMMY (ganti isinya nanti begitu
                        model instance segmentation asli siap dipasang)
  storage.py         -- baca/tulis JSON detail + segmentation_log.csv,
                         termasuk dedup baris terbaru per gambar
  routes.py           -- endpoint inti (classes/select-image/run/load/
                          load-path/list-results/save/batch-select/batch-run/
                          check-existing/patient-summary)
  export.py            -- endpoint export laporan Excel
  model_config.py       -- endpoint status & konfigurasi path model
                            (placeholder, belum ada inference asli)

Semua route didaftarkan ke satu Blueprint `segmentation_bp` yang sama, tanpa
url_prefix -- jadi path-nya tetap persis /api/segmentation/... seperti
sebelum dipecah, frontend tidak perlu berubah sama sekali.
"""

from flask import Blueprint

segmentation_bp = Blueprint("segmentation", __name__)

# Import submodul DI BAWAH (bukan di atas file) supaya @segmentation_bp.route
# di masing-masing modul itu bisa nempel ke objek blueprint yang sudah dibuat
# di atas -- baru dieksekusi begitu package ini pertama kali diimport (mis.
# oleh app.py lewat `from segmentation import segmentation_bp`).
from . import routes, export, model_config  # noqa: E402,F401
