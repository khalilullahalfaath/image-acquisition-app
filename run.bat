@echo off
setlocal enableextensions
cd /d "%~dp0"

echo ============================================
echo   ThalassemiaWebApp - Image Acquisition App
echo ============================================
echo.

set PY_CMD=
where python >nul 2>nul
if %errorlevel% equ 0 set PY_CMD=python

if not defined PY_CMD (
    where py >nul 2>nul
    if %errorlevel% equ 0 set PY_CMD=py
)

if not defined PY_CMD (
    echo [ERROR] Python belum terinstall di komputer ini.
    echo.
    echo Silakan install Python dulu dari:
    echo   https://www.python.org/downloads/
    echo.
    echo Saat proses install, WAJIB centang kotak "Add Python to PATH"
    echo di halaman pertama installer, baru klik Install.
    echo.
    echo Setelah selesai install, jalankan file ini lagi.
    echo.
    pause
    exit /b 1
)

if not exist venv (
    echo [1/3] Menyiapkan environment ^(hanya di percobaan pertama^)...
    %PY_CMD% -m venv venv
    if not exist venv (
        echo [ERROR] Gagal membuat environment. Coba install ulang Python.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Environment sudah siap.
)

call venv\Scripts\activate.bat

echo [2/3] Mengecek kelengkapan library ^(bisa beberapa menit di percobaan pertama^)...
pip install -q --disable-pip-version-check -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Gagal menginstall library. Pastikan komputer terhubung internet
    echo saat pertama kali menjalankan aplikasi ini, lalu coba lagi.
    echo.
    pause
    exit /b 1
)

echo [3/3] Menjalankan aplikasi...
echo.
echo Jendela BARU akan terbuka untuk server aplikasi.
echo JANGAN ditutup jendela itu selama aplikasi masih dipakai.
echo Browser akan terbuka otomatis dalam beberapa detik.
echo.

start "Thalassemia WebApp - Server (JANGAN DITUTUP selama dipakai)" cmd /k "cd /d "%~dp0" && call venv\Scripts\activate.bat && python app.py"

timeout /t 4 /nobreak >nul
start "" http://127.0.0.1:5000

echo.
echo Selesai. Kalau browser belum otomatis kebuka, buka manual alamat ini:
echo   http://127.0.0.1:5000
echo.
echo Untuk MENGHENTIKAN aplikasi: tutup jendela hitam berjudul
echo   "Thalassemia WebApp - Server"
echo.
pause