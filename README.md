# Aplikasi Akuisisi Citra Apusan Darah Tepi (ADT)

Aplikasi web lokal untuk akuisisi citra apusan darah tepi dari kamera mikroskop USB.

## Persyaratan

Aplikasi ini bisa jalan di **Windows** atau **Ubuntu/Linux**.

### Windows

- Python 3.9+. Jika belum, download dari [python.org](https://www.python.org/downloads/windows/) dan centang opsi **Add Python to PATH** saat install.
- Kamera mikroskop USB dengan driver **DirectShow** sudah terpasang (untuk kamera MiiCam: install `MIIDshowSetup.exe` dari [situs resmi](https://miicamera.net/)).

### Ubuntu/Linux

- Python 3.9+ (biasanya sudah ada bawaan). Cek dengan `python3 --version`.
- Paket sistem tambahan:
  ```
  sudo apt update
  sudo apt install python3-venv python3-tk v4l-utils
  ```
  `python3-tk` dibutuhkan buat dialog pilih folder, `v4l-utils` buat cek kamera (`v4l2-ctl --list-devices`).
- Kamera mikroskop USB: kalau kameranya UVC-compliant, Ubuntu biasanya langsung mendeteksinya lewat driver V4L2 bawaan kernel -- tidak perlu install driver tambahan seperti di Windows. Colok kameranya, lalu cek dengan `v4l2-ctl --list-devices` atau `ls /dev/video*` untuk pastikan sudah terbaca.
- **Kamera MiiCam khususnya** ternyata tidak selalu bisa di-bind driver kernel `uvcvideo` standar di semua board (mis. NVIDIA Jetson) -- aplikasi ini otomatis fallback pakai **SDK vendor ToupCam** kalau itu terjadi. SDK ini dibundel per-arsitektur CPU di `vendor/toupcam/<arch>/` (`arm64/` untuk Jetson, `x64/` untuk Ubuntu x86_64 biasa) dan arsitekturnya **dideteksi otomatis** (`platform.machine()`), jadi tidak perlu ganti file manual pindah board. SDK ini butuh udev rule supaya bisa diakses tanpa root; `run.sh` akan menawarkan install otomatis, atau manual:
  ```
  sudo cp vendor/toupcam/99-toupcam.rules /etc/udev/rules.d/
  sudo udevadm control --reload-rules && sudo udevadm trigger
  ```
  Lalu cabut-colok ulang kameranya.

## Cara menjalankan

### Windows -- Otomatis (disarankan)

Double-click **`run.bat`**. Skrip ini otomatis:
1. Mengecek Python terinstall
2. Membuat virtual environment (`venv`) kalau belum ada
3. Menginstall/memperbarui library dari `requirements.txt`
4. Menjalankan server dan membuka browser ke `http://127.0.0.1:5000`

Untuk menghentikan aplikasi, tutup jendela hitam berjudul "ThalassemiaWebApp - Server".

### Windows -- Manual

```
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```
Lalu buka `http://127.0.0.1:5000` di browser.

### Ubuntu/Linux -- Otomatis (disarankan)

```
chmod +x run.sh   # cuma perlu sekali
./run.sh
```
Skrip ini otomatis bikin venv, install/update dependency, jalankan server, dan buka browser ke `http://127.0.0.1:5000`. Tekan `Ctrl+C` di terminal buat menghentikan.

### Ubuntu/Linux -- Manual

```
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```
Lalu buka `http://127.0.0.1:5000` di browser.

## Alur pemakaian

1. Colokkan kamera mikroskop USB, pastikan sudah terbaca sistem operasi (Windows: cek Device Manager. Ubuntu/Linux: cek `v4l2-ctl --list-devices` atau `ls /dev/video*`).
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
├── run.sh                  # Runner otomatis untuk Ubuntu/Linux
├── check_cameras.py        # Skrip diagnostik kamera (opsional, buat debug)
├── vendor/
│   └── toupcam/             # SDK vendor ToupCam -- fallback kalau uvcvideo gagal bind
│       ├── arm64/            # untuk NVIDIA Jetson dkk
│       │   ├── toupcam.py
│       │   └── libtoupcam.so
│       ├── x64/              # untuk Ubuntu x86_64 biasa
│       │   ├── toupcam.py
│       │   └── libtoupcam.so
│       └── 99-toupcam.rules  # udev rule, arsitektur-independen
├── templates/
│   └── index.html
└── static/
    ├── css/style.css
    └── js/app.js
```

## Troubleshooting

**Ubuntu: `venv/bin/activate: No such file or directory`**
- Biasanya karena paket `python3-venv` belum terinstall, jadi `python3 -m venv venv` gagal separuh jalan. Install: `sudo apt update && sudo apt install python3-venv` (sesuaikan versi Python kamu, mis. `python3.11-venv` -- cek dengan `python3 --version`), lalu jalankan lagi `./run.sh` (skrip otomatis bikin ulang venv yang rusak).

**Kamera tidak muncul di dropdown**
- Windows: pastikan driver DirectShow kamera sudah terinstall. Cek juga di Device Manager apakah kamera memang terbaca di level Windows.
- Ubuntu/Linux: cek `v4l2-ctl --list-devices` -- kalau kamera tidak muncul di situ juga, berarti belum terbaca di level sistem (coba kabel/port USB lain).
- Tutup aplikasi lain yang mungkin sedang memakai kamera yang sama (OBS Studio, aplikasi viewer bawaan kamera, dll), kamera USB umumnya cuma bisa dipakai satu aplikasi dalam satu waktu.
- Kalau masih bermasalah, jalankan `python check_cameras.py` (dengan venv aktif) buat lihat detail index & status buka tiap kamera, lalu cek pesan errornya.

**Gambar hasil capture semua identik (duplikat)**
- Biasanya karena panel Stream sempat tidak aktif/ter-render (misal tab browser di-minimize) sehingga video freeze di satu frame. Pastikan panel Stream kelihatan bergerak sebelum melakukan capture.

**Ubuntu: `ImportError: libGL.so.1: cannot open shared object file`**
- Kurang library sistem yang dibutuhkan OpenCV. Install: `sudo apt install libgl1`.

**Ubuntu: dialog "Lokasi Simpan" tidak muncul / error terkait `tkinter`**
- Paket `python3-tk` belum terinstall: `sudo apt install python3-tk`, lalu jalankan ulang `run.sh`/`python app.py`.

**Ubuntu: kamera tidak bisa dibuka meski muncul di `v4l2-ctl --list-devices` (Permission denied)**
- User belum masuk grup `video`: `sudo usermod -aG video $USER`, lalu logout/login ulang.

**Ubuntu/Jetson: MiiCam kebaca di `lsusb` tapi tidak muncul di `v4l2-ctl --list-devices`**
- Ini kasus yang butuh SDK vendor ToupCam (lihat bagian Persyaratan di atas). Aplikasi otomatis coba backend ini duluan sebelum fallback ke V4L2 -- kalau kamera tetap tidak muncul di dropdown aplikasi, cek:
  1. Udev rule sudah terinstall (`ls /etc/udev/rules.d/99-toupcam.rules`) dan kamera sudah dicabut-colok ulang setelahnya.
  2. Konsol server (`python app.py`) menampilkan baris `[DEBUG] ToupCam EnumV2 gagal: ...` atau `[DEBUG] ToupCam SDK gagal dimuat: ...` -- pesan errornya biasanya menunjukkan penyebabnya (mis. `libtoupcam.so` tidak ditemukan).
  3. Untuk arsitektur CPU selain arm64/x64 (belum dibundel), tambahkan folder baru `vendor/toupcam/<arch>/` berisi `toupcam.py` + `libtoupcam.so` yang sesuai dari ToupCamSDK, lalu daftarkan di `_TOUPCAM_ARCH_MAP` pada `app.py`.
