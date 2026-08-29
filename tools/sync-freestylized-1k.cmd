@echo off
setlocal
cd /d "%~dp0\.."

echo SHADED - FreeStylized 1K Material Library
echo ==========================================
echo.
echo This downloads the public FreeStylized material library into:
echo   .cache\materials\freestylized
echo.
echo Downloaded assets stay local and are not committed to Git.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  echo.
  pause
  exit /b 1
)

node tools\freestylized-materials.mjs all --resolution 1k
if errorlevel 1 (
  echo.
  echo Sync failed. Existing downloaded materials were left untouched.
  pause
  exit /b 1
)

echo.
echo Material library is ready.
pause
