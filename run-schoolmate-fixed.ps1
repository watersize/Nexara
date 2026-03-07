# Исправленный скрипт запуска для Windows
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
  param([string]$Command)
  Write-Verbose "Executing: $Command"
  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command"
  }
}

# Установка необходимых компонентов
Write-Step "Checking for required components"

# Проверка наличия Python виртуального окружения
if (!(Test-Path $VenvRoot)) {
  Write-Step "Creating Python virtual environment"
  Assert-Command "python -m venv $VenvRoot"
}

# Активация виртуального окружения
$ActivateScript = Join-Path $VenvRoot "Scripts\Activate.ps1"
if (Test-Path $ActivateScript) {
  . $ActivateScript
}

# Установка зависимостей Python
Write-Step "Installing Python dependencies"
if (!(Test-Path "$VenvRoot\Lib\site-packages\numpy")) {
  Assert-Command "$VenvPython -m pip install -r $RequirementsFile"
} else {
  Write-Step "Python dependencies already installed"
}

# Синхронизация файлов фронтенда
Write-Step "Syncing frontend files into the web folder"
Assert-Command "xcopy /E /I /Y $WebRoot $TauriRoot\src\assets\*.*"

# Проверка Rust/Tauri build
Write-Step "Checking Rust/Tauri build"
Assert-Command "cargo build --manifest-path $TauriRoot\Cargo.toml"

# Запуск приложения с правильными параметрами
Write-Step "Starting Tauri application"
try {
  # Попробуем запустить с явным указанием пути
  $ExePath = Join-Path $TauriRoot "target\debug\schoolmate-proto.exe"
  if (Test-Path $ExePath) {
    Write-Step "Running application directly"
    Start-Process -FilePath $ExePath -PassThru
  } else {
    Write-Step "Executable not found at expected location"
    throw "Executable not found"
  }
} catch {
  Write-Error "Failed to start application: $_"
  Write-Step "Attempting alternative startup method"
  
  # Попробуем запустить через cargo run
  Assert-Command "cargo run --manifest-path $TauriRoot\Cargo.toml"
}