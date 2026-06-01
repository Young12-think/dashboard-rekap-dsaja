@echo off
setlocal enabledelayedexpansion
title Rekap DSaja - Portable Launcher
color 0b

echo ===================================================
echo     MEMULAI REKAP DSAJA (PORTABLE SYSTEM)
echo ===================================================
echo.

:: Set Playwright browser path ke folder project
set PLAYWRIGHT_BROWSERS_PATH=%~dp0playwright_browsers
echo [INFO] Browser Path: %PLAYWRIGHT_BROWSERS_PATH%
echo.

:: ── STEP 1: Cek Python ─────────────────────────────
python --version >nul 2>&1
if !errorlevel! neq 0 (
    color 0c
    echo ===================================================
    echo [ERROR] Python tidak terdeteksi di PC ini!
    echo Silakan install Python dan centang "Add Python to PATH".
    echo ===================================================
    goto :FAIL
)
echo [OK] Python ditemukan.

:: ── STEP 2: Validasi .venv ─────────────────────────
if exist ".venv\Scripts\python.exe" (
    .venv\Scripts\python.exe --version >nul 2>&1
    if !errorlevel! neq 0 (
        echo [WARNING] .venv lama tidak kompatibel, menghapus...
        rd /s /q .venv 2>nul
    ) else (
        echo [OK] .venv sudah ada dan valid.
    )
)

:: ── STEP 3: Buat .venv baru jika perlu ─────────────
if not exist ".venv\Scripts\python.exe" (
    echo [INFO] Membuat Virtual Environment baru...
    python -m venv .venv
    if !errorlevel! neq 0 (
        color 0c
        echo [ERROR] Gagal membuat virtual environment!
        goto :FAIL
    )
    echo [OK] .venv berhasil dibuat.
)

:: ── STEP 4: Install library ────────────────────────
echo [INFO] Menginstal dependensi library...
.venv\Scripts\python.exe -m pip install --upgrade pip -q
.venv\Scripts\pip.exe install -r requirements.txt -q
if !errorlevel! neq 0 (
    color 0c
    echo [ERROR] Gagal menginstal library dari requirements.txt!
    goto :FAIL
)
echo [OK] Semua library terinstal.

:: ── STEP 5: Install Playwright browser ─────────────
echo [INFO] Memeriksa browser Playwright...
.venv\Scripts\playwright.exe install chromium
if !errorlevel! neq 0 (
    color 0c
    echo [ERROR] Gagal menginstal browser Playwright Chromium!
    goto :FAIL
)
echo [OK] Browser Playwright siap.

:: ── STEP 6: Jalankan Server & SSH Tunnel ────────────────────────
echo.
echo ===================================================
echo   APLIKASI SIAP!
echo   Akses via VPS : http://157.15.40.39:8080
echo   Akses Lokal    : http://localhost:8000
echo   Tekan Ctrl+C untuk menghentikan server.
echo ===================================================
echo.

:: Menjalankan SSH Tunnel otomatis di jendela CMD terpisah
:: ── STEP 6: Jalankan Server & SSH Tunnel ────────────────────────
:: Jalankan SSH di background (menggunakan /c agar jendela langsung menutup setelah SSH aktif)
start "SSH Tunnel - Rekap DSaja" cmd /c "ssh -R 0.0.0.0:8080:127.0.0.1:8000 -o ServerAliveInterval=60 ubuntu@157.15.40.39"

:: Matikan proses yang menempati port 8000 (server lama) tanpa membunuh python lain
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Hapus file log lama yang mungkin terkunci
del /f /q server_debug.log >nul 2>&1

:: Jalankan Server Python utama (output tampil di layar DAN ke file log)
echo [INFO] Menjalankan server...
echo.
.venv\Scripts\python.exe server.py 2>&1 | .venv\Scripts\python.exe -c "import sys; [print(line, end='', flush=True) or open('server_debug.log','a',encoding='utf-8').write(line) for line in sys.stdin]"
echo.

color 0c
echo ===================================================
echo [ERROR] Server berhenti! Lihat pesan error di atas.
echo ===================================================
goto :FAIL

:FAIL
echo.
echo Tekan tombol apa saja untuk menutup jendela ini...
pause >nul
exit /b