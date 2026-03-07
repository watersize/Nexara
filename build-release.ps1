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
$portableDir = Join-Path $root 'dist\Nexara'

Write-Host 'Syncing frontend assets...'
New-Item -ItemType Directory -Force $webDir | Out-Null
Copy-Item (Join-Path $root 'index.html') (Join-Path $webDir 'index.html') -Force
Copy-Item (Join-Path $root 'style.css') (Join-Path $webDir 'style.css') -Force
Copy-Item (Join-Path $root 'app.js') (Join-Path $webDir 'app.js') -Force

if (-not (Test-Path $pythonExe)) {
  Write-Host 'Creating virtual environment...'
  python -m venv $venvDir
}

if (-not $SkipPythonInstall) {
  Write-Host 'Installing Python dependencies...'
  & $pythonExe -m pip install --upgrade pip
  & $pythonExe -m pip install -r (Join-Path $root 'python_ai\requirements.txt') pyinstaller pillow
}

Write-Host 'Generating branding...'
& $pythonExe (Join-Path $root 'tools\generate_branding.py')

Write-Host 'Building bundled AI agent...'
Push-Location (Join-Path $root 'python_ai')
& $pythonExe -m PyInstaller --noconfirm --clean --onefile --name agent agent.py
Pop-Location

if (-not (Test-Path $agentDist)) {
  throw 'agent.exe was not produced by PyInstaller.'
}
New-Item -ItemType Directory -Force (Split-Path $resourceAgent) | Out-Null
Copy-Item $agentDist $resourceAgent -Force

Write-Host 'Building Tauri release executable...'
Push-Location (Join-Path $root 'src-tauri')
cargo tauri build --no-bundle
Pop-Location

if (-not (Test-Path $releaseExe)) {
  throw 'Tauri release executable was not produced.'
}

Write-Host 'Preparing portable release folder...'
New-Item -ItemType Directory -Force $portableDir | Out-Null
Copy-Item $releaseExe (Join-Path $portableDir 'Nexara.exe') -Force
Copy-Item $resourceAgent (Join-Path $portableDir 'agent.exe') -Force
Copy-Item (Join-Path $root 'src-tauri\icons\icon.ico') (Join-Path $portableDir 'icon.ico') -Force
Copy-Item (Join-Path $root 'src-tauri\icons\icon.png') (Join-Path $portableDir 'icon.png') -Force

Write-Host ''
Write-Host 'Portable release is ready:' -ForegroundColor Green
Write-Host (Join-Path $portableDir 'Nexara.exe')
