param(
  [switch]$SkipPythonInstall
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '.')).Path
$webDir = Join-Path $root 'web'
$venvDir = Join-Path $root '.venv'
$pythonExe = Join-Path $venvDir 'Scripts\python.exe'
$agentDist = Join-Path $root 'python_ai\dist\agent.exe'
$resourceAgent = Join-Path $root 'src-tauri\resources\agent.exe'
$releaseExe = Join-Path $root 'target\release\schoolmate-proto.exe'
$portableDir = Join-Path $root 'dist\veyo.ai'
$installerOut = Join-Path $root 'dist\veyo.ai-Setup-1.5.0.exe'
$secretDir = Join-Path $root '.secrets'
$groqKeyFile = Join-Path $secretDir 'groq_key.txt'
$portableGroqKey = Join-Path $portableDir 'groq.key'
$installerWorkDir = Join-Path $root 'dist\installer-work'
$installerZip = Join-Path $installerWorkDir 'veyo-ai-portable.zip'
$installerScript = Join-Path $installerWorkDir 'install.cmd'
$installerSed = Join-Path $installerWorkDir 'veyo-ai-installer.sed'

Write-Host 'Syncing frontend assets...'
New-Item -ItemType Directory -Force $webDir | Out-Null
Copy-Item (Join-Path $root 'index.html') (Join-Path $webDir 'index.html') -Force
Copy-Item (Join-Path $root 'style.css') (Join-Path $webDir 'style.css') -Force
Copy-Item (Join-Path $root 'app.js') (Join-Path $webDir 'app.js') -Force

if (-not (Test-Path $pythonExe)) {
  Write-Host 'Creating virtual environment...'
  python -m venv $venvDir
}

if (-not (Test-Path $groqKeyFile)) {
  throw "Groq key file was not found: $groqKeyFile"
}

if (-not $SkipPythonInstall) {
  Write-Host 'Installing Python dependencies...'
  & $pythonExe -m pip install --upgrade pip
  & $pythonExe -m pip install -r (Join-Path $root 'python_ai\requirements.txt') pyinstaller pillow
}

Write-Host 'Building bundled AI agent...'
Push-Location (Join-Path $root 'python_ai')
& $pythonExe -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --name agent `
  --paths (Join-Path $venvDir 'Lib\site-packages\rapidocr_onnxruntime') `
  --collect-data rapidocr_onnxruntime `
  --hidden-import ch_ppocr_v3_det `
  --hidden-import ch_ppocr_v2_cls `
  --hidden-import ch_ppocr_v3_rec `
  agent.py
Pop-Location

if (-not (Test-Path $agentDist)) {
  throw 'agent.exe was not produced by PyInstaller.'
}
New-Item -ItemType Directory -Force (Split-Path $resourceAgent) | Out-Null
Copy-Item $agentDist $resourceAgent -Force

Write-Host 'Building Next.js frontend (static export)...'
Push-Location (Join-Path $root 'frontend')
& npx next build
Pop-Location

if (-not (Test-Path (Join-Path $root 'frontend\out'))) {
  throw 'Next.js build failed: frontend\out folder not found.'
}

Write-Host 'Building Tauri release executable...'
Push-Location (Join-Path $root 'src-tauri')
cargo tauri build --no-bundle
Pop-Location

if (-not (Test-Path $releaseExe)) {
  throw 'Tauri release executable was not produced.'
}

Write-Host 'Preparing portable release folder...'
New-Item -ItemType Directory -Force $portableDir | Out-Null
Copy-Item $releaseExe (Join-Path $portableDir 'veyo.ai.exe') -Force
Copy-Item $resourceAgent (Join-Path $portableDir 'agent.exe') -Force
Copy-Item (Join-Path $root 'src-tauri\icons\icon.ico') (Join-Path $portableDir 'icon.ico') -Force
Copy-Item (Join-Path $root 'src-tauri\icons\icon.png') (Join-Path $portableDir 'icon.png') -Force
Copy-Item $groqKeyFile $portableGroqKey -Force

Write-Host 'Building installer executable...'
if (Test-Path $installerWorkDir) {
  Remove-Item $installerWorkDir -Recurse -Force
}
New-Item -ItemType Directory -Force $installerWorkDir | Out-Null
if (Test-Path $installerOut) {
  Remove-Item $installerOut -Force
}
Compress-Archive -Path (Join-Path $portableDir '*') -DestinationPath $installerZip -Force

@'
@echo off
setlocal
set "APPDIR=%LocalAppData%\Programs\veyo.ai"
if exist "%APPDIR%" rmdir /S /Q "%APPDIR%"
mkdir "%APPDIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%~dp0veyo-ai-portable.zip' -DestinationPath '%LOCALAPPDATA%\Programs\veyo.ai' -Force"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$shell = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $programs = [Environment]::GetFolderPath('Programs'); $target = Join-Path $env:LOCALAPPDATA 'Programs\veyo.ai\veyo.ai.exe'; $workdir = Join-Path $env:LOCALAPPDATA 'Programs\veyo.ai'; $icon = Join-Path $env:LOCALAPPDATA 'Programs\veyo.ai\icon.ico'; $desktopShortcut = $shell.CreateShortcut((Join-Path $desktop 'veyo.ai.lnk')); $desktopShortcut.TargetPath = $target; $desktopShortcut.WorkingDirectory = $workdir; $desktopShortcut.IconLocation = $icon; $desktopShortcut.Save(); $menuShortcut = $shell.CreateShortcut((Join-Path $programs 'veyo.ai.lnk')); $menuShortcut.TargetPath = $target; $menuShortcut.WorkingDirectory = $workdir; $menuShortcut.IconLocation = $icon; $menuShortcut.Save()"
start "" "%APPDIR%\veyo.ai.exe"
exit /b 0
'@ | Set-Content $installerScript -Encoding ASCII

@"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=veyo.ai v1.5.0 was installed successfully.
TargetName=$installerOut
FriendlyName=veyo.ai v1.5.0 Setup
AppLaunched=install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=install.cmd
UserQuietInstCmd=install.cmd
SourceFiles=SourceFiles
[SourceFiles]
SourceFiles0=$installerWorkDir\
[SourceFiles0]
install.cmd=
veyo-ai-portable.zip=
"@ | Set-Content $installerSed -Encoding ASCII

$iexpress = Join-Path $env:WINDIR 'System32\iexpress.exe'
if (-not (Test-Path $iexpress)) {
  throw 'IExpress was not found on this Windows installation.'
}
& $iexpress /N /Q $installerSed | Out-Null
if (-not (Test-Path $installerOut)) {
  throw 'Installer executable was not produced.'
}
Remove-Item $installerWorkDir -Recurse -Force

Write-Host ''
Write-Host 'Portable release is ready:' -ForegroundColor Green
Write-Host (Join-Path $portableDir 'veyo.ai.exe')
Write-Host ''
Write-Host 'Installer is ready:' -ForegroundColor Green
Write-Host $installerOut
