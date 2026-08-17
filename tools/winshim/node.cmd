@echo off
rem Windows PowerShell 5.1 turns native stderr into red NativeCommandError records.
rem Merge Node's stderr into stdout for SHADED's Windows launcher. gpu-spatial.mjs
rem still returns the real non-zero exit code, so genuine failures remain failures.
node.exe %* 2>&1
exit /b %ERRORLEVEL%
