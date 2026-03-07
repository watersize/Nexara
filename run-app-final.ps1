# Финальный скрипт запуска для всех пользователей
# Этот скрипт автоматически устанавливает все необходимые компоненты и запускает приложение

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "=== Запуск SchoolMate Prototype ===" -ForegroundColor Green

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TauriRoot = Join-Path $ProjectRoot "src-tauri"
$PythonAiRoot = Join-Path $ProjectRoot "python_ai"
$WebRoot = Join-Path $ProjectRoot "web"
$VenvRoot = Join-Path $ProjectRoot ".venv"
$VenvPython = Join-Path $VenvRoot "Scripts\\python.exe"
$RequirementsFile = Join-Path $PythonAiRoot "requirements.txt"
$PythonAgent = Join-Path $PythonAiRoot "python_agent.py"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command {
  param([string]$Command)
  Write-Verbose "Выполнение: $Command"
  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Команда завершилась с ошибкой: $Command"
  }
}

# Проверка наличия Python
Write-Step "Проверка наличия Python"
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python не найден в системе. Пожалуйста, установите Python 3.8 или выше."
    exit 1
}

# Проверка наличия Rust
Write-Step "Проверка наличия Rust"
if (!(Get-Command rustc -ErrorAction SilentlyContinue)) {
    Write-Error "Rust не найден в системе. Пожалуйста, установите Rust с https://rustup.rs/"
    exit 1
}

# Проверка наличия Cargo
Write-Step "Проверка наличия Cargo"
if (!(Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Error "Cargo не найден в системе. Пожалуйста, установите Rust с https://rustup.rs/"
    exit 1
}

# Установка необходимых компонентов
Write-Step "Установка необходимых компонентов"

# Проверка наличия Python виртуального окружения
if (!(Test-Path $VenvRoot)) {
  Write-Step "Создание Python виртуального окружения"
  Assert-Command "python -m venv $VenvRoot"
}

# Активация виртуального окружения
Write-Step "Активация виртуального окружения"
$ActivateScript = Join-Path $VenvRoot "Scripts\Activate.ps1"
if (Test-Path $ActivateScript) {
  . $ActivateScript
}

# Установка зависимостей Python
Write-Step "Установка Python зависимостей"
Assert-Command "$VenvPython -m pip install -r $RequirementsFile"

# Синхронизация файлов фронтенда
Write-Step "Синхронизация файлов фронтенда"
Assert-Command "xcopy /E /I /Y $WebRoot $TauriRoot\src\assets\*.*"

# Проверка и сборка Rust/Tauri
Write-Step "Проверка и сборка Rust/Tauri"
try {
    Assert-Command "cargo build --manifest-path $TauriRoot\Cargo.toml"
    Write-Step "Сборка завершена успешно"
} catch {
    Write-Error "Ошибка сборки: $_"
    exit 1
}

# Запуск приложения
Write-Step "Запуск приложения"
try {
    $ExePath = Join-Path $TauriRoot "target\debug\schoolmate-proto.exe"
    if (Test-Path $ExePath) {
        Write-Step "Запуск приложения"
        Start-Process -FilePath $ExePath -PassThru
        Write-Host "Приложение запущено успешно!" -ForegroundColor Green
    } else {
        Write-Error "Исполняемый файл не найден: $ExePath"
        exit 1
    }
} catch {
    Write-Error "Не удалось запустить приложение: $_"
    Write-Host "Попробуйте запустить скрипт от имени администратора" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== SchoolMate Prototype успешно запущен ===" -ForegroundColor Green