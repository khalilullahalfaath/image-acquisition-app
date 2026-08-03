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

if [ ! -d "venv" ]; then
    echo "Membuat virtual environment (venv)..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Menginstall/memperbarui dependency dari requirements.txt..."
pip install -q -r requirements.txt

# Buka browser otomatis setelah server sempat start (jalan di background,
# tidak menghalangi server utama).
( sleep 2 && (xdg-open "http://127.0.0.1:5000" >/dev/null 2>&1 || true) ) &

echo ""
echo "Menjalankan server di http://127.0.0.1:5000"
echo "Tekan Ctrl+C untuk menghentikan aplikasi."
echo ""
python app.py
