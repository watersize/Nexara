# veyo.ai

`veyo.ai` is a desktop study workspace built with Tauri, Rust, Next.js, Python, and SQLite.  
The application combines schedule management, textbooks, notes, tasks, and AI chat in one local-first app.

## Current release

- Version: `1.0.0`
- Portable build: `dist\veyo.ai\veyo.ai.exe`
- Installer build: `dist\veyo.ai-Setup-1.0.0.exe`

## What works

- Local account session and profile persistence
- Weekly schedule storage by user and week number
- Planner with persistent tasks in SQLite
- Notebook with rich text, images, drawing, and charts
- Textbook upload, deletion, preview, and RAG indexing
- AI chat with context from schedule, planner, notes, and textbooks
- Desktop notifications for tasks and upcoming lessons
- Light and dark themes across the Next.js interface

## Build and release

### Prerequisites

- Rust stable
- Node.js with npm
- Python 3.13+
- Windows 10/11 x64

### Development

```powershell
cd frontend
npm install
npm run build

cd ..
cargo check --manifest-path src-tauri\Cargo.toml
python -m py_compile python_ai\agent.py
```

### Release build

```powershell
powershell -ExecutionPolicy Bypass -File .\build-release.ps1 -SkipPythonInstall
```

Outputs:

- `dist\veyo.ai\veyo.ai.exe`
- `dist\veyo.ai-Setup-1.0.0.exe`

## Project structure

```text
frontend/          Next.js desktop UI
src-tauri/         Rust/Tauri backend and SQLite storage
python_ai/         Python AI agent and document processing
go_backend/        Go backend experiments and cloud endpoints
supabase/          SQL and schema-related files
```

## Verification checklist

These commands were used for the current release:

```powershell
cd frontend
npm run build

cd ..
cargo check --manifest-path src-tauri\Cargo.toml
cargo test --manifest-path src-tauri\Cargo.toml
python -m py_compile python_ai\agent.py
powershell -ExecutionPolicy Bypass -File .\build-release.ps1 -SkipPythonInstall
```

## Notes

- Icon assets are now taken directly from the repository files and are no longer generated during release build.
- User data is stored locally in the app database and survives app restarts and updates.
- PDF preview currently supports local in-app viewing through `react-pdf` and bundled `pdf.worker.min.mjs`.

## Repository

- GitHub: [https://github.com/watersize/veyo.ai](https://github.com/watersize/veyo.ai)
