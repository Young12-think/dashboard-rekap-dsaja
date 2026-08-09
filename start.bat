@echo off
setlocal enabledelayedexpansion

:: NSSM must call this batch through cmd.exe with the --service argument.
:: This path deliberately skips interactive/setup-only commands and lets NSSM
:: own the restart lifecycle.
if /i "%~1"=="--service" goto :SERVICE

title Rekap DSaja - Portable Launcher
color 0b

:: Pastikan Working Directory selalu di folder tempat start.bat berada
cd /d "%~dp0"

echo ===================================================
echo     MEMULAI REKAP DSAJA (PORTABLE SYSTEM)
echo ===================================================
echo.

:: Set Playwright browser path ke folder project
set PLAYWRIGHT_BROWSERS_PATH=%~dp0playwright_browsers
set "VENV_PYTHON=.venv\Scripts\python.exe"
set "REQUIREMENTS_STAMP=.venv\.requirements.sha256"
set "PLAYWRIGHT_STAMP=.venv\.playwright-ready"
echo [INFO] Browser Path: %PLAYWRIGHT_BROWSERS_PATH%
echo.

:: ── STEP 1: Cek Python / .venv ─────────────────────
if exist "%~dp0.venv\Scripts\python.exe" (
    echo [OK] Python Virtual Environment terdeteksi di .venv
) else (
    python --version >nul 2>&1
    if !errorlevel! neq 0 (
        color 0c
        echo ===================================================
        echo [ERROR] Python tidak terdeteksi di PC ini!
        echo Silakan install Python dan centang "Add Python to PATH".
        echo ===================================================
        goto :FAIL
    )
    echo [OK] Python sistem ditemukan.
)

:: ── STEP 1.5: Cek File .env ─────────────────────────
if not exist ".env" (
    if exist ".env.example" (
        echo [WARNING] File .env tidak ditemukan! Salin dari .env.example...
        copy ".env.example" ".env" >nul
        echo [OK] File .env berhasil dibuat dari .env.example.
    ) else (
        echo [WARNING] File .env tidak ditemukan! Silakan buat file .env.
    )
) else (
    echo [OK] File .env terdeteksi.
)

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
:: Verifikasi/install library hanya bila diperlukan.
echo [INFO] Memeriksa dependensi library...
"%VENV_PYTHON%" -m pip --version >nul 2>&1
if !errorlevel! neq 0 (
    echo [INFO] pip tidak tersedia, mencoba memulihkan...
    "%VENV_PYTHON%" -m ensurepip --upgrade
    if !errorlevel! neq 0 (
        color 0c
        echo [ERROR] Gagal memulihkan pip di virtual environment!
        goto :FAIL
    )
)

if not exist "requirements.txt" (
    color 0c
    echo [ERROR] File requirements.txt tidak ditemukan!
    goto :FAIL
)

set "REQUIREMENTS_HASH="
for /f "usebackq delims=" %%H in (`powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 'requirements.txt').Hash"`) do set "REQUIREMENTS_HASH=%%H"
if not defined REQUIREMENTS_HASH (
    color 0c
    echo [ERROR] Gagal menghitung hash requirements.txt!
    goto :FAIL
)

set "INSTALLED_HASH="
if exist "%REQUIREMENTS_STAMP%" set /p INSTALLED_HASH=<"%REQUIREMENTS_STAMP%"
set "NEED_DEPENDENCY_INSTALL=0"
if /i not "!INSTALLED_HASH!"=="!REQUIREMENTS_HASH!" set "NEED_DEPENDENCY_INSTALL=1"

:: Smoke test mendeteksi package terhapus/rusak walaupun hash tidak berubah.
"%VENV_PYTHON%" -c "import flask, flask_cors, mysql.connector, waitress, sshtunnel, playwright, bs4, lxml, dotenv" >nul 2>&1
if !errorlevel! neq 0 set "NEED_DEPENDENCY_INSTALL=1"

if "!NEED_DEPENDENCY_INSTALL!"=="1" (
    echo [INFO] Requirement baru/berubah. Menginstal library...
    "%VENV_PYTHON%" -m pip install -r requirements.txt
    if !errorlevel! neq 0 (
        color 0c
        echo [ERROR] Gagal menginstal library dari requirements.txt!
        goto :FAIL
    )
    >"%REQUIREMENTS_STAMP%" echo !REQUIREMENTS_HASH!
    rem Package Playwright berubah bersama requirements; validasi browser lagi.
    if exist "%PLAYWRIGHT_STAMP%" del /q "%PLAYWRIGHT_STAMP%" >nul 2>&1
    echo [OK] Semua library berhasil disiapkan.
) else (
    echo [OK] Dependensi sudah siap; instalasi dilewati.
)

:: ── STEP 5: Install Playwright browser ─────────────
echo [INFO] Memeriksa browser Playwright...
set "NEED_PLAYWRIGHT_INSTALL=0"
if not exist "%PLAYWRIGHT_BROWSERS_PATH%\chromium-*" set "NEED_PLAYWRIGHT_INSTALL=1"
if not exist "%PLAYWRIGHT_STAMP%" set "NEED_PLAYWRIGHT_INSTALL=1"

if "!NEED_PLAYWRIGHT_INSTALL!"=="1" (
    echo [INFO] Menyiapkan Playwright Chromium...
    "%VENV_PYTHON%" -m playwright install chromium
    if !errorlevel! neq 0 (
        color 0c
        echo [ERROR] Gagal menginstal browser Playwright Chromium!
        goto :FAIL
    )
    >"%PLAYWRIGHT_STAMP%" echo ready
    echo [OK] Browser Playwright berhasil disiapkan.
) else (
    echo [OK] Browser Playwright sudah tersedia; instalasi dilewati.
)

if /i "%~1"=="--setup-only" (
    echo [OK] Validasi setup selesai. Server tidak dijalankan.
    exit /b 0
)

:: ── STEP 6: Jalankan Server (SSH Tunnel dikelola oleh Python) ─────
echo.
echo ===================================================
echo   APLIKASI SIAP!
echo   Akses via VPS : http://157.15.40.39:8080
echo   Akses Lokal    : http://localhost:8000
echo   SSH Tunnel MySQL dikelola otomatis oleh server.py
echo   Tekan Ctrl+C untuk menghentikan server.
echo ===================================================
echo.

:: 1. Matikan proses lama yang menempati port 8000 (jika ada) agar tidak bentrok
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: 2. (OPSIONAL) Reverse SSH — buka komentar jika masih perlu expose ke VPS
:: start "SSH Reverse Tunnel" cmd /k "ssh -R 0.0.0.0:8080:127.0.0.1:8000 -o ServerAliveInterval=60 ubuntu@157.15.40.39"

:: 3. Jalankan Server Python (SSH Tunnel MySQL sudah di-handle di dalam server.py)
echo [INFO] Menjalankan server...
echo.
.venv\Scripts\python.exe server.py <nul
set EXIT_CODE=%errorlevel%
echo.

if !EXIT_CODE! equ 0 (
    echo ===================================================
    echo [INFO] Server dihentikan secara normal.
    echo ===================================================
    exit /b 0
)

color 0c
echo ===================================================
echo [ERROR] Server berhenti dengan error! (Code: !EXIT_CODE!)
echo ===================================================
goto :FAIL

:SERVICE
cd /d "%~dp0"
set "VENV_PYTHON=%~dp0.venv\Scripts\python.exe"

if not exist "%VENV_PYTHON%" (
    echo [ERROR] Virtual environment tidak ditemukan: "%VENV_PYTHON%"
    echo [ERROR] Jalankan start.bat sekali secara manual untuk menyiapkan aplikasi.
    exit /b 1
)

echo [INFO] Menjalankan server dalam mode NSSM...
"%VENV_PYTHON%" "%~dp0server.py"
exit /b %errorlevel%

:FAIL
echo.
echo ===================================================
echo [ERROR] Terjadi kesalahan pada persiapan/server.
echo ===================================================
<nul pause
exit /b 1

