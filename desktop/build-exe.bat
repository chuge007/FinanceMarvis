@echo off
cd /d "%~dp0.."
echo [Marvis] rebuilding Marvis.exe ...
node desktop/make-exe.mjs
if errorlevel 1 (
  echo [Marvis] build FAILED
) else (
  echo [Marvis] OK - Marvis.exe is ready
)
pause
