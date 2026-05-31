' ============================================
' Launcher Hidden - Rekap DSaja
' Jalankan start.bat tanpa jendela CMD muncul
' Log server tetap ditulis ke server_debug.log
' ============================================
Set WshShell = CreateObject("WScript.Shell")
' Pindah working directory ke lokasi script ini
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
' Jalankan start.bat secara hidden (parameter 0 = hidden window)
WshShell.Run "cmd /c start.bat", 0, False
Set WshShell = Nothing