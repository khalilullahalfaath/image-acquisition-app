# Aplikasi Akuisisi Citra Apusan Darah Tepi (ADT)

Aplikasi web lokal untuk akuisisi citra apusan darah tepi dari kamera mikroskop USB.

## Persyaratan

- Windows (disarankan)
- Python 3.9+. Jika belum, download dari [python.org](https://www.python.org/downloads/windows/) dan centang opsi **Add Python to PATH** saat install.
- Kamera mikroskop USB dengan driver **DirectShow** sudah terpasang (untuk kamera MiiCam: install `MIIDshowSetup.exe` dari [situs resmi](https://miicamera.net/)).

## Cara menjalankan

### Otomatis (disarankan)

Double-click **`run.bat`**. Skrip ini otomatis:
1. Mengecek Python terinstall
2. Membuat virtual environment (`venv`) kalau belum ada
3. Menginstall/memperbarui library dari `requirements.txt`
4. Menjalankan server dan membuka browser ke `http://127.0.0.1:5000`

Untuk menghentikan aplikasi, tutup jendela hitam berjudul "ThalassemiaWebApp - Server".

### Manual

```
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```
Lalu buka `http://127.0.0.1:5000` di browser.

## Alur pemakaian

1. Colokkan kamera mikroskop USB, pastikan sudah terbaca Windows (cek di Device Manager).
2. Di TopBar, pilih nama kamera yang benar di dropdown. Atur juga resolusi bila perlu (opsional sebab "Bawaan kamera" pakai resolusi maksimal default), lalu klik **Hubungkan**. Resolusi aktual yang benar-benar dipakai kamera ditampilkan di sebelah status "Aktif". Kalau kameranya mendukung, resolusi diatur langsung di kamera; kalau tidak, gambar akan otomatis diperkecil sesuai pilihan ini saat proses **Save** (FOV tetap penuh, cuma di-scale down, bukan di-crop).
3. Isi **Inisial/ID Pasien**.
4. Klik **Capture** untuk mengambil gambar diam dari stream. Tinjau hasilnya di panel "Hasil Capture".
5. Kalau belum pas, klik Capture lagi buat mengambil ulang.
6. Klik **Lokasi Simpan** untuk memilih folder tujuan (dialog folder native akan muncul). Panel **Ringkasan Folder** otomatis muncul dan menampilkan jumlah gambar per pasien di folder tersebut.
7. Klik **Save**. File tersimpan dengan format `id-pasien_YYYYMMDD-HHMMSS_NN.png`, dan Ringkasan Folder ikut ter-update otomatis. Metadata capture (timestamp, id pasien, filename, iterasi, kamera, resolusi, skor fokus) juga dicatat ke `capture_log.csv` di folder yang sama.
8. Gambar yang berhasil disimpan pada sesi ini juga muncul di galeri riwayat di bagian bawah halaman.

## Struktur folder

```
thalassemia-capture-app/
├── app.py                 # Backend Flask + kontrol kamera (OpenCV)
├── requirements.txt
├── run.bat                 # Runner otomatis untuk Windows
├── check_cameras.py        # Skrip diagnostik kamera (opsional, buat debug)
├── templates/
│   └── index.html
└── static/
    ├── css/style.css
    └── js/app.js
```

## Troubleshooting

**Kamera tidak muncul di dropdown**
- Pastikan driver DirectShow kamera sudah terinstall.
- Tutup aplikasi lain yang mungkin sedang memakai kamera yang sama (OBS Studio, aplikasi viewer bawaan kamera, dll), kamera USB umumnya cuma bisa dipakai satu aplikasi dalam satu waktu.
- Cek dulu di Device Manager apakah kamera memang terbaca di level Windows.
- Kalau masih bermasalah, jalankan `python check_cameras.py` (dengan venv aktif) buat lihat detail index & status buka tiap kamera, lalu cek pesan errornya.

**Gambar hasil capture semua identik (duplikat)**
- Biasanya karena panel Stream sempat tidak aktif/ter-render (misal tab browser di-minimize) sehingga video freeze di satu frame. Pastikan panel Stream kelihatan bergerak sebelum melakukan capture.
