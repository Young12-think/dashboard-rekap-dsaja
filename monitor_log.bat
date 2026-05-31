@echo off
title Rekap DSaja - Live Log Monitor
color 0a

echo ===================================================
echo     REKAP DSAJA - LIVE LOG MONITOR
echo ===================================================
echo   Memantau: server_debug.log
echo   Tekan Ctrl+C untuk berhenti memantau.
echo ===================================================
echo.

:: Cek apakah file log ada
if not exist "server_debug.log" (
    color 0e
    echo [WARNING] server_debug.log belum ada.
    echo Server mungkin belum dijalankan.
    echo Menunggu file log muncul...
    echo.
    :WAIT_LOG
    if not exist "server_debug.log" (
        timeout /t 2 /nobreak >nul
        goto :WAIT_LOG
    )
    echo [OK] File log ditemukan! Mulai memantau...
    echo.
)

:: Gunakan PowerShell Get-Content -Wait (mirip tail -f di Linux)
powershell -NoProfile -Command "Get-Content 'server_debug.log' -Wait -Tail 50"

pause
