@echo off
setlocal
cd /d "%~dp0"
echo.
echo SHADED RTX - Windows
echo --------------------
echo Standard: Depth Anything V2 auf CUDA/FP16 mit dem Demo-Bild.
echo Fuer DA3 oder eigene Bilder kann die PowerShell-Datei mit Parametern gestartet werden.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\run-rtx-spatial-windows.ps1" %*
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" (
  echo FEHLER - Exitcode %EXITCODE%.
) else (
  echo FERTIG.
)
pause
exit /b %EXITCODE%
