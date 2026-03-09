# 🌊 ＶＥＹＯ．ＡＩ // Ｔｈｅ Ｎｅｘｔ Ｇｅｎｅｒａｔｉｏｎ Ｗｏｒｋｓｐａｃｅ
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
> **🚀 Your local-first, AI-augmented digital sanctuary.**
> 
> *veyo.ai is a revolutionary desktop ecosystem that unifies your entire study and research life into a single, high-performance interface. No cloud dependency. No privacy compromises. Just pure cognitive acceleration.*

## ◈ THE PHILOSOPHY OF VEYO
veyo.ai was born from a simple realization: **The modern student is overwhelmed, not by lack of information, but by its fragmentation.** 
We believe that your academic data—your notes, your books, your schedule—is a part of your identity. It should be:

- ◈ **Private**: Stored only on your machine.
- ◈ **Instant**: Powered by high-efficiency local engines (Rust/Go).
- ◈ **Intelligent**: Augmented by AI that understands *your* specific context.
- ◈ **Unified**: A single "flow" where everything is connected.

---

## ◈ CHOOSE YOUR PATHWAY
Navigate the veyo.ai multiverse based on your level of mastery.

### ◌ FOR THE LITTLE EXPLORERS (Kids)
Welcome to your **School Power-Up Box**!
- ◌ **The Smart Shelf**: Put your books here, and they'll never get lost.
- ◌ **The Time Machine**: Tells you exactly where you need to be and when.
- ◌ **The Magic Paper**: A giant notebook where you can draw, write, and even make cool charts!
- ◌ **The Helpful Genie**: A friendly friend who has read all your books and is ready to help you with homework.

### ◌ FOR THE KNOWLEDGE SEEKERS (Students)
Your ultimate **Academic Second Brain**.
- ◌ **Chronos Module**: Full weekly schedule with integrated task management.
- ◌ **Nexus Notebook**: Rich Text, Sketched drawings, and dynamic Data Viz.
- ◌ **Knowledge Forge**: Upload PDFs/Documents and create a local Vector Index.
- ◌ **Local RAG Chat**: Chat with your textbooks. The AI answers based *only* on your provided materials.
- ◌ **Aura Themes**: Beautiful light and dark modes designed for long-term focus.

### ◌ FOR THE MASTER ARCHITECTS (Developers)
A high-performance **Multi-Language Symphony**.
- ◈ **The Skeleton (Rust/Tauri)**: Low-level system access, SQLite management, and high-speed IPC.
- ◈ **The Skin (Next.js/TS)**: Reactive UI with complex state management and custom components.
- ◈ **The Brain (Python)**: Advanced RAG pipeline, document chunking, and semantic reasoning.
- ◈ **The Messenger (Go)**: High-concurrency utility services and experimental cloud bridges.
- ◈ **The Memory (SQLite)**: Atomic, local-first persistence for every bit of user data.

---

## ◈ THE MULTIVERSE OF CODE (Structure)

```text
📂 veyo.ai ROOT
├── 📂 frontend          ◈ Next.js + Tailwind + TypeScript (The Interface)
│   ├── 📂 components    ◈ Reusable UI atomic units
│   ├── 📂 hooks         ◈ Custom React logic and state
│   ├── 📂 lib           ◈ Shared utilities and API clients
│   └── 📂 styles        ◈ Global CSS and theme tokens
├── 📂 src-tauri        ◈ Rust / Tauri (The OS Bridge)
│   ├── 📂 src          ◈ Core Rust logic and handlers
│   └── 📂 icons        ◈ System-level branding assets
├── 📂 python_ai        ◈ Python (The Mental Layer)
│   ├── 📄 agent.py      ◈ Main RAG and routing logic
│   └── 📄 requirements  ◈ Neural dependencies
├── 📂 go_backend       ◈ Go (The High-Speed Pulse)
├── 📂 supabase         ◈ SQL blueprints and schemas
└── 📂 docs             ◈ Detailed technical archives
```

### ◈ SYSTEM DATA FLOW
```mermaid
graph LR
    User["◈ User"] <-> UI["◈ Next.js UI"]
    UI <-> Tauri["◈ Tauri Core (Rust)"]
    Tauri <-> DB[("◈ SQLite")]
    Tauri <-> AI["◈ Python Agent"]
    AI <-> VetorDB["◈ Vector Index"]
    VetorDB <-> PDF["◈ Local Docs"]
    Tauri --> OS["◈ Desktop Alerts"]
```

---

## ◈ BRINGING VEYO TO LIFE (Installation)

### ◌ THE CEREMONIAL PREREQUISITES
1.  **Rust Stable**: `rustup default stable`
2.  **Node.js/npm**: Version 20+ recommended.
3.  **Python 3.13+**: The "Thinking" engine.
4.  **Windows 10/11 x64**: Native habitat.

### ◌ THE FABRICATION PROCESS
1.  **Synthesize Interface**:
    ```powershell
    cd frontend; npm i; npm run build
    ```
2.  **Calibrate Engine**:
    ```powershell
    cd ..; cargo check --manifest-path src-tauri\Cargo.toml
    ```
3.  **Awaken the Mind**:
    ```powershell
    python -m py_compile python_ai\agent.py
    ```
4.  **The Great Union**:
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\build-release.ps1 -SkipPythonInstall
    ```

---

## ◈ STATUS REPORT (Capabilities)
- ◌ **Bio-Persistence**: local user profiles.
- ◌ **Chronos**: Full schedule & planner.
- ◌ **Nexus**: Multi-modal notebook.
- ◌ **Knowledge Forge**: PDF RAG indexing.
- ◌ **Genie Chat**: Context-aware AI.
- ◌ **Signal**: Desktop notification system.

---

## ◈ ARCHIVES & LINKS
- ◈ **Source**: [github.com/watersize/veyo.ai](https://github.com/watersize/veyo.ai)
- ◈ **Legal**: Consult the `LICENSE` file for terms of engagement.

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
*veyo.ai: Turning the tide of academic fragmentation into a sea of wisdom.*
