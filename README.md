# Nexara

Nexara is a cross-platform school planner built with Tauri v2, Rust, SQLite and a local Python AI sidecar.

## What Works

- Email registration and login with local fallback
- Weekly schedule management
- Smart schedule import from text, screenshots, PDF, DOCX and TXT
- AI chat powered by Groq
- PDF textbook upload with local RAG index
- Personal study plan generation
- Local settings for theme, hints, 3D mode and Telegram fields

## Stack

- Desktop shell: Tauri v2 + Rust
- Frontend: HTML, CSS, Vanilla JavaScript
- Local database: SQLite
- AI engine: Python (`python_ai/agent.py`)
- Models: Groq `llama-3.3-70b-versatile` and `llama-3.2-90b-vision-preview`

## Project Layout

```text
Nexara/
├── index.html
├── style.css
├── app.js
├── web/
├── python_ai/
│   ├── agent.py
│   └── requirements.txt
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── icons/
    └── src/main.rs
```

## Requirements

- Rust stable
- Python 3.10+
- WebView2 Runtime on Windows

## Setup

```powershell
cd C:\Users\username\Documents\ai
python -m venv .venv
.venv\Scripts\python -m pip install -r python_ai\requirements.txt
$env:GROQ_API_KEY="your_groq_api_key"
```

## Run

```powershell
cd C:\Users\username\Documents\ai\src-tauri
cargo tauri dev --no-watch
```

## Build Checks

```powershell
cargo check --manifest-path C:\Users\username\Documents\ai\src-tauri\Cargo.toml
python -m py_compile C:\Users\username\Documents\ai\python_ai\agent.py
node --check C:\Users\username\Documents\ai\app.js
```

## Notes

- The app stores user data locally in the Tauri app data directory.
- PDF textbooks are deduplicated by file hash.
- If Supabase confirmation email fails, Nexara creates a local account so the user can continue working.
