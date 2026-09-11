"""
Konstanta kelas morfologi sel RBC & nama file log -- dipisah ke modul
tersendiri biar bisa diimport bebas dari mock_model.py, storage.py,
routes.py, dan export.py tanpa risiko circular import.
"""

# Label kelas morfologi sel eritrosit untuk tab Segmentasi & Klasifikasi.
# Urutan index di sini PENTING -- ini bakal jadi mapping output model
# klasifikasi (deep learning) begitu pipeline-nya dipasang, jadi jangan
# diubah urutannya tanpa nyesuaikan juga di sisi model/training nanti.
RBC_CLASS_LABELS = [
    "Normal cell",
    "Macrocyte",
    "Microcyte",
    "Spherocyte",
    "Target cell",
    "Stomatocyte",
    "Ovalocyte",
    "Teardrop",
    "Burr cell",
    "Schistocyte",
    "Uncategorised",
    "Hypochromia",
    "Elliptocyte",
]

# Warna tampilan per kelas (dipakai buat overlay & legenda di frontend) --
# ditaruh satu sumber di backend biar konsisten kalau nanti dipakai juga di
# skrip training/evaluasi (mis. visualisasi confusion matrix per warna kelas
# yang sama).
RBC_CLASS_COLORS = [
    "#16a34a",  # Normal cell
    "#2563eb",  # Macrocyte
    "#f59e0b",  # Microcyte
    "#db2777",  # Spherocyte
    "#7c3aed",  # Target cell
    "#0891b2",  # Stomatocyte
    "#ea580c",  # Ovalocyte
    "#65a30d",  # Teardrop
    "#dc2626",  # Burr cell
    "#9333ea",  # Schistocyte
    "#64748b",  # Uncategorised
    "#ca8a04",  # Hypochromia
    "#0d9488",  # Elliptocyte
]

# File ringkasan hasil segmentasi (satu baris per proses "Simpan Hasil"),
# ditulis di folder yang sama dengan gambar sumbernya -- polanya sengaja
# dibuat mirip capture_log.csv biar gampang dianalisis bareng.
SEGMENTATION_LOG_FILENAME = "segmentation_log.csv"

# is_duplicate/duplicate_of: ditambahkan belakangan (lihat storage._ensure_log_columns)
# buat nandain kalau suatu hasil disimpan persis sama (jumlah sel per kelas +
# total identik) dengan hasil TERAKHIR yang sudah tersimpan buat gambar yang
# sama -- biar folder nggak numpuk file JSON duplikat tanpa keterangan.
SEGMENTATION_LOG_FIELDNAMES = (
    ["timestamp", "patient_id", "source_image", "detail_file", "total_cells", "is_duplicate", "duplicate_of"]
    + RBC_CLASS_LABELS
)
