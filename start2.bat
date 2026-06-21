@echo off
title Sakelar Cloudflare Tunnel
:: Memaksa script berjalan sebagai Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Meminta Akses Administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:MENU
cls
color 0e
echo ===================================================
echo          KONTROL CLOUDFLARE TUNNEL (ON/OFF)
echo ===================================================
echo  [1] MATIKAN Cloudflare (Murni Web Lokal Saja)
echo  [2] NYALAKAN Cloudflare (Buka Akses Online/HP)
echo  [3] Keluar
echo ===================================================
echo.
set /p pilihan="Masukkan pilihan Anda (1/2/3): "

if "%pilihan%"=="1" goto STOP_CF
if "%pilihan%"=="2" goto START_CF
if "%pilihan%"=="3" exit
goto MENU

:STOP_CF
cls
color 0c
echo [INFO] Mematikan terowongan internet Cloudflare...
net stop cloudflared
echo.
echo [OK] Cloudflare BERHASIL Dimatikan! Web sekarang murni lokal.
timeout /t 3 >nul
goto MENU

:START_CF
cls
color 0a
echo [INFO] Menyalakan terowongan internet Cloudflare...
net start cloudflared
echo.
echo [OK] Cloudflare BERHASIL Dinyalakan! Web bisa diakses via HP/Online.
timeout /t 3 >nul
goto MENU