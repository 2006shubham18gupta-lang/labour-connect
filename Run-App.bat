@echo off
cd /d "%~dp0"

start "" "index.html"

timeout /t 2 /nobreak >nul

start chrome --app="file:///%CD%/index.html" --new-window --window-size=1200,800 --window-position=100,100

exit