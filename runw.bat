@echo off
setlocal
cd /d "%~dp0"
set PORT=8000
start "jumpertail-server" cmd /k "python -m http.server %PORT%"
timeout /t 1 /nobreak >nul
start "" "http://localhost:%PORT%/index.html"
