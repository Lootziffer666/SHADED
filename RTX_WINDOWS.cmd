@echo off
setlocal
cd /d "%~dp0"
rem Keep Windows PowerShell 5.1 from painting harmless Node/Python stderr progress as errors.
set "PATH=%~dp0tools\winshim;%PATH%"
rem Public Hugging Face models do not require a token. Hide the unauthenticated-rate-limit warning;
rem genuine provider failures still propagate through the process exit code.
set "HF_HUB_VERBOSITY=error"
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
