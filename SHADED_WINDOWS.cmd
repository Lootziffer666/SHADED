@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo FEHLER: Node.js wurde nicht gefunden.
  echo Installiere Node.js 20+ und starte diese Datei danach erneut.
  pause
  exit /b 1
)

echo.
echo SHADED - 1 Bild ^> 1 kleine Welt
echo ---------------------------------
echo Starte lokalen Editor und GPU-Bridge...
echo.

start "SHADED Local Bridge" cmd /k "cd /d "%~dp0" && node tools\shaded-local-bridge.mjs"

set /a TRIES=0
:WAIT
set /a TRIES+=1
powershell.exe -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:49666/api/health -TimeoutSec 1; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto OPEN
if %TRIES% GEQ 12 goto OPEN
timeout /t 1 /nobreak >nul
goto WAIT

:OPEN
start "" "http://127.0.0.1:49666/editor/"
echo SHADED wurde im Browser geoeffnet.
echo Das Bridge-Fenster offen lassen, solange DA3/V2 lokal genutzt werden sollen.
exit /b 0
