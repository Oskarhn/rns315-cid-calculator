@echo off
setlocal
cd /d "%~dp0"
echo RNS315 - install the ESP32 program
echo Connect only the ESP32 you want to program. Leave its SD socket empty.
echo This replaces the current program on that ESP32.
pause
py -3 --version >nul 2>&1
if errorlevel 1 (
  echo Install Python 3 with Python Launcher: https://www.python.org/downloads/windows/
  pause
  exit /b 1
)
if not exist ".tools\Scripts\python.exe" py -3 -m venv .tools
if errorlevel 1 goto failed
".tools\Scripts\python.exe" -m pip install platformio==6.1.18
if errorlevel 1 goto failed
".tools\Scripts\python.exe" -m platformio run -d esp32 -t upload
if errorlevel 1 goto failed
echo.
echo Done. Unplug USB before inserting the SD card into the module.
pause
exit /b 0
:failed
echo.
echo Upload did not finish. Check the error above and the illustrated guide.
pause
exit /b 1
