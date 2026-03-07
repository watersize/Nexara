# Nexara

Nexara is a desktop school planner built with Tauri v2, Rust, SQLite and a bundled AI sidecar.

## Release Build

This repository includes one-click Windows build scripts that produce a standalone desktop build.

Double-click this file in Explorer:

```text
C:\Users\1thproj\Documents\ai\build-release.bat
```

Or run the PowerShell script directly:

```powershell
cd C:\Users\1thproj\Documents\ai
powershell -ExecutionPolicy Bypass -File .\build-release.ps1
```

After the script finishes, open:

```text
C:\Users\1thproj\Documents\ai\dist\Nexara\Nexara.exe
```

The portable folder already contains everything required to run the app:

- `Nexara.exe`
- `agent.exe`
- app icons

No localhost or separate dev server is required for the release executable.
The build script copies the fresh Tauri release binary from `target\release`, so `dist\Nexara\Nexara.exe` is always updated from the latest build.

## Development

```powershell
cd C:\Users\1thproj\Documents\ai
python -m venv .venv
.venv\Scripts\python -m pip install -r python_ai\requirements.txt
$env:GROQ_API_KEY="your_groq_api_key"
cd src-tauri
cargo tauri dev --no-watch
```

## Stack

- Desktop shell: Tauri v2 + Rust
- Frontend: HTML, CSS, Vanilla JavaScript
- Local database: SQLite
- AI engine: Python sidecar bundled as `agent.exe`
- Models: Groq `llama-3.3-70b-versatile` and `llama-3.2-90b-vision-preview`

## Main Features

- Email login with local fallback
- Weekly schedule management
- Smart schedule import from text, screenshots, PDF, DOCX and TXT
- AI chat powered by Groq
- PDF textbook upload with local RAG index
- Personal study plan generation
- Local settings for theme, hints, 3D mode and Telegram fields

## Checks

```powershell
cargo check --manifest-path C:\Users\1thproj\Documents\ai\src-tauri\Cargo.toml
python -m py_compile C:\Users\1thproj\Documents\ai\python_ai\agent.py
node --check C:\Users\1thproj\Documents\ai\app.js
```

## Notes

- User data is stored in the Tauri app data directory.
- PDF textbooks are deduplicated by file hash.
- The release script regenerates the app branding and bundles the local AI sidecar.
