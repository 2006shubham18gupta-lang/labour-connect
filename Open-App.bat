@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File Run.ps1
pause