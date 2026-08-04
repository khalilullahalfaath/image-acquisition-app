#!/bin/bash
# Runner otomatis untuk Ubuntu/Linux.
# Setara dengan run.bat (Windows): bikin venv kalau belum ada, install/update
# dependency, jalankan server, dan buka browser.

set -e
cd "$(dirname "$0")"

if ! command -v python3 &> /dev/null; then
    echo "Python 3 belum terinstall."
    echo "Install dulu: sudo apt update && sudo apt install python3 python3-venv python3-tk"
    exit 1
fi

if [ ! -f "venv/bin/activate" ]; then
    if [ -d "venv" ]; then
        echo "Folder venv yang ada sepertinya tidak lengkap (mungkin dari percobaan sebelumnya yang gagal), membuat ulang..."
        rm -rf venv
    fi

    echo "Membuat virtual environment (venv)..."
    if ! python3 -m venv venv || [ ! -f "venv/bin/activate" ]; then
        rm -rf venv
        echo ""
        echo "Gagal membuat virtual environment yang lengkap."
        echo "Kemungkinan besar paket python3-venv belum terinstall. Coba:"
        echo "  sudo apt update && sudo apt install python3-venv"
        echo "(sesuaikan versi Python kamu kalau perlu, misal python3.11-venv -- cek dengan python3 --version)"
        echo "Lalu jalankan lagi ./run.sh"
        exit 1
    fi
fi

source venv/bin/activate

echo "Menginstall/memperbarui dependency dari requirements.txt..."
pip install -q -r requirements.txt

# Kamera vendor seperti MiiCam butuh udev rule ini biar bisa diakses tanpa
# root lewat SDK ToupCam (lihat vendor/toupcam/). Cuma jalan sekali; kalau
# rule-nya sudah ada, dilewati.
UDEV_RULE_SRC="vendor/toupcam/99-toupcam.rules"
UDEV_RULE_DST="/etc/udev/rules.d/99-toupcam.rules"
if [ -f "$UDEV_RULE_SRC" ] && [ ! -f "$UDEV_RULE_DST" ]; then
    echo ""
    echo "Kamera vendor (mis. MiiCam) butuh udev rule supaya bisa diakses tanpa root."
    read -p "Install udev rule sekarang? Butuh sudo. (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if sudo cp "$UDEV_RULE_SRC" "$UDEV_RULE_DST" && sudo udevadm control --reload-rules && sudo udevadm trigger; then
            echo "udev rule terinstall. Cabut-colok ulang kameranya supaya permission baru berlaku."
        else
            echo "Gagal install udev rule -- bisa dicoba manual nanti:"
            echo "  sudo cp $UDEV_RULE_SRC $UDEV_RULE_DST && sudo udevadm control --reload-rules && sudo udevadm trigger"
        fi
    else
        echo "Dilewati. Bisa diinstall manual nanti kalau kamera vendor tidak terbaca:"
        echo "  sudo cp $UDEV_RULE_SRC $UDEV_RULE_DST && sudo udevadm control --reload-rules && sudo udevadm trigger"
    fi
fi

# Buka browser otomatis setelah server sempat start (jalan di background,
# tidak menghalangi server utama).
( sleep 2 && (xdg-open "http://127.0.0.1:5000" >/dev/null 2>&1 || true) ) &

echo ""
echo "Menjalankan server di http://127.0.0.1:5000"
echo "Tekan Ctrl+C untuk menghentikan aplikasi."
echo ""
python app.py
