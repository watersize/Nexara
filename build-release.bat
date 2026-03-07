@echo off
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0build-release.ps1"
set "exit_code=%ERRORLEVEL%"
echo.
if not "%exit_code%"=="0" (
  echo Build failed with exit code %exit_code%.
  pause
  exit /b %exit_code%
)
echo Build finished. Open dist\Nexara\Nexara.exe
pause
