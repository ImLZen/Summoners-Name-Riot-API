@echo off
cd /d "%~dp0\.."
echo Civilization Frontier mechanics lab: http://localhost:8080/prototype/
py -m http.server 8080
pause
