@echo off
echo Creating GitHub Release for Nexara v0.2.0
echo.

REM Check if executable exists
if not exist "target\release\schoolmate-proto.exe" (
    echo ERROR: schoolmate-proto.exe not found!
    echo Please run: cargo tauri build
    pause
    exit /b 1
)

echo Found executable: target\release\schoolmate-proto.exe
dir "target\release\schoolmate-proto.exe"
echo.

echo Please follow these steps to create the GitHub release:
echo.
echo 1. Open https://github.com/watersize/Nexara/releases/new
echo 2. Tag version: v0.2.0
echo 3. Release title: Nexara v0.2.0 - Standalone Executable
echo 4. Upload file: target\release\schoolmate-proto.exe
echo 5. Description: See create-release.md for release notes
echo.
echo Press any key to open the release page in browser...
pause > nul

start https://github.com/watersize/Nexara/releases/new

echo.
echo Release page opened! Upload the executable and publish the release.
echo.
