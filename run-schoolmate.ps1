$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TauriRoot = Join-Path $ProjectRoot "src-tauri"
$PythonAiRoot = Join-Path $ProjectRoot "python_ai"
$WebRoot = Join-Path $ProjectRoot "web"
$VenvRoot = Join-Path $ProjectRoot ".venv"
$VenvPython = Join-Path $VenvRoot "Scripts\\python.exe"
$VenvScripts = Join-Path $VenvRoot "Scripts"
$RequirementsFile = Join-Path $PythonAiRoot "requirements.txt"
$PythonAgent = Join-Path $PythonAiRoot "python_agent.py"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command '$Name' was not found. Install it and run the script again."
  }
}

function Test-WebView2Runtime {
  $keys = @(
    "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  )

  foreach ($key in $keys) {
    if (Test-Path $key) {
      $version = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).pv
      if ($version) {
        return $true
      }
    }
  }

  return $false
}

function Repair-WebView2Runtime {
  Write-Step "Reinstalling Microsoft Edge WebView2 Runtime"
  winget install --id Microsoft.EdgeWebView2Runtime --exact --force --accept-package-agreements --accept-source-agreements --disable-interactivity
}

function Repair-VcRedist {
  Write-Step "Reinstalling Microsoft Visual C++ Redistributable x64"
  winget install --id Microsoft.VCRedist.2015+.x64 --exact --force --accept-package-agreements --accept-source-agreements --disable-interactivity
}

function Ensure-Venv {
  if (-not (Test-Path $VenvPython)) {
    Write-Step "Creating Python virtual environment"
    python -m venv $VenvRoot
  }
}

function Install-PythonDeps {
  Write-Step "Installing Python dependencies"

  try {
    & $VenvPython -m pip install --disable-pip-version-check -r $RequirementsFile
    return
  } catch {
    Write-Host "Regular pip install failed, retrying with system certifi..." -ForegroundColor Yellow
  }

  $certPath = ""
  try {
    $certPath = (python -c "import certifi; print(certifi.where())").Trim()
  } catch {
    $certPath = ""
  }

  if (-not $certPath -or -not (Test-Path $certPath)) {
    throw "Failed to resolve a system certifi path for Python dependency installation."
  }

  & $VenvPython -m pip install --disable-pip-version-check --cert $certPath -r $RequirementsFile
}

function Sync-Frontend {
  Write-Step "Syncing frontend files into the web folder"
  Copy-Item (Join-Path $ProjectRoot "index.html") (Join-Path $WebRoot "index.html") -Force
  Copy-Item (Join-Path $ProjectRoot "style.css") (Join-Path $WebRoot "style.css") -Force
  Copy-Item (Join-Path $ProjectRoot "app.js") (Join-Path $WebRoot "app.js") -Force
}

function Run-Checks {
  Write-Step "Checking Python agent"
  & $VenvPython -m py_compile $PythonAgent

  Write-Step "Checking Rust/Tauri build"
  cargo check --manifest-path (Join-Path $TauriRoot "Cargo.toml")
}

function Start-App {
  Write-Step "Starting Tauri application"
  $env:VIRTUAL_ENV = $VenvRoot
  $env:Path = "$VenvScripts;$env:Path"
  Push-Location $TauriRoot
  try {
    cargo tauri dev --no-watch
    return $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

Assert-Command python
Assert-Command cargo

try {
  cargo tauri --version | Out-Null
} catch {
  throw "Tauri CLI was not found. Install it with 'cargo install tauri-cli --version ^2'."
}

Ensure-Venv
Install-PythonDeps
Sync-Frontend
Run-Checks

if (-not (Test-WebView2Runtime)) {
  Repair-WebView2Runtime
}

$launchCode = Start-App
if ($launchCode -eq -1073741511) {
  Write-Host ""
  Write-Host "STATUS_ENTRYPOINT_NOT_FOUND detected. Attempting automatic repair of system dependencies..." -ForegroundColor Yellow
  Repair-VcRedist
  Repair-WebView2Runtime
  $launchCode = Start-App
}

exit $launchCode
