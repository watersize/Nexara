# Nexara - AI Assistant Platform

A modern cross-platform desktop application built with Tauri (Rust + Web frontend) that provides AI-powered assistance with authentication, scheduling, and file management capabilities.

## 🚀 Quick Start - Download & Run

### Option 1: Download Release (Recommended)

1. **Go to Releases**: [https://github.com/watersize/Nexara/releases](https://github.com/watersize/Nexara/releases)
2. **Download**: `schoolmate-proto.exe` (latest release)
3. **Run**: Double-click the executable
4. **Done!** No installation required

### Option 2: Build from Source

#### Prerequisites
- **Rust** (latest stable): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Go 1.26+**: `winget install GoLang.Go`
- **Python 3.8+**: Already installed on most systems

#### Automated Setup (Windows PowerShell)
```powershell
# Clone repository
git clone https://github.com/watersize/Nexara.git
cd Nexara

# Run automated setup
.\run-app-final.ps1
```

This script automatically:
- ✅ Checks for required software
- ✅ Creates Python virtual environment
- ✅ Installs all dependencies
- ✅ Builds the application
- ✅ Launches Nexara

#### Manual Setup
```powershell
# 1. Setup Python environment
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r python_ai\requirements.txt

# 2. Setup Go backend
cd go_backend
go mod init go_backend
go mod tidy
go build
cd ..

# 3. Build and run Tauri app
cargo tauri dev
```

## 🤖 AI Configuration

### GROQ API Setup (Automatic)

The application includes built-in GROQ API key for immediate use. No manual configuration required!

**Built-in Models:**
- `llama-3.3-70b-versatile` - General AI assistant
- `llama-3.2-90b-vision-preview` - Image processing

### Custom API Key (Optional)

If you want to use your own GROQ API key:

```powershell
# Set environment variable
$env:GROQ_API_KEY="your_groq_api_key_here"

# Or create .env file
echo "GROQ_API_KEY=your_groq_api_key_here" > .env
```

## 📦 Release Information

### Latest Release
- **Version**: v0.2.0
- **Size**: ~6.2 MB
- **Type**: Standalone executable
- **Requirements**: Windows 10/11 (x64)

### Release Features
- ✅ **One-click execution** - no setup required
- ✅ **All dependencies embedded** - includes Python, Rust, web frontend
- ✅ **Portable** - runs from any location
- ✅ **Secure** - local authentication and data storage
- ✅ **AI-powered** - built-in GROQ integration

### Download Statistics
View release downloads and statistics: [GitHub Releases](https://github.com/watersize/Nexara/releases)

## 🏗️ Architecture

- **Frontend**: HTML/CSS/JavaScript served by embedded web server
- **Backend**: Rust/Tauri application with SQLite database
- **Authentication**: Go backend with Supabase integration
- **AI Processing**: Python-based AI services with GROQ API
- **Database**: Local SQLite + optional Supabase cloud sync

## 📋 Features

### Core Functionality
- 🔐 **Email authentication** with local fallback mode
- 📅 **Weekly schedule management** with smart import
- 📄 **Document processing** (PDF, DOCX, TXT, images)
- 🤖 **AI chat assistant** powered by GROQ
- 📚 **Textbook upload** with RAG indexing
- 🎯 **Study plan generation** based on schedule

### Smart Schedule Import
- 📝 Text parsing from any format
- 📸 Screenshot analysis
- 📋 PDF and DOCX processing
- 🔄 Automatic subject recognition

### AI Capabilities
- 💬 Conversational AI assistant
- 📖 Document Q&A with context
- 📊 Study plan recommendations
- 🎨 Image analysis support

## 🛠️ Development

### Development Mode
```powershell
# Start frontend server + Tauri app
cargo tauri dev

# Individual components
cd web && python -m http.server 1420          # Frontend
cd go_backend && go run main.go               # Auth backend
cd python_ai && python python_agent.py        # AI services
```

### Build Release
```powershell
# Build standalone executable
cargo tauri build

# Output: target/release/schoolmate-proto.exe
```

### Environment Variables
```powershell
# Optional: Override built-in keys
$env:GROQ_API_KEY="your_key"
$env:SUPABASE_URL="your_supabase_url"
$env:SUPABASE_ANON_KEY="your_supabase_key"
```

## 📁 Project Structure

```
Nexara/
├── src-tauri/           # Rust/Tauri backend
│   ├── src/main.rs      # Main application logic
│   └── tauri.conf.json  # Configuration
├── web/                 # Frontend files
│   ├── index.html
│   ├── app.js
│   └── style.css
├── go_backend/          # Go authentication
│   └── main.go
├── python_ai/          # AI processing
│   ├── agent.py
│   └── requirements.txt
├── run-app-final.ps1   # Automated setup
└── README.md
```

## 🧪 Testing

### Quick Test
```powershell
# Test all components
cargo tauri dev

# Test individual parts
python -m http.server 1420                    # Frontend
echo '{"payload":{"email":"test@example.com"}}' | go run main.go --action register
```

### Build Verification
```powershell
cargo check --manifest-path src-tauri/Cargo.toml
go build ./go_backend
python -m py_compile python_ai/agent.py
```

## 🐛 Troubleshooting

### Common Issues

**"go command not found"**
```powershell
winget install GoLang.Go
$env:PATH += ";C:\Program Files\Go\bin"
```

**Frontend not loading**
```powershell
# Kill stuck processes
tasklist | findstr python
taskkill /PID <PID> /F

# Restart server
cd web && python -m http.server 1420
```

**Build errors**
```powershell
cargo clean
cargo tauri dev
```

### Port Conflicts
- **1420**: Frontend server
- **Tauri**: Automatic port allocation

## 📊 Release Statistics

### Download Latest Release
👉 [GitHub Releases](https://github.com/watersize/Nexara/releases)

### Release Archive
All previous releases available in the [releases section](https://github.com/watersize/Nexara/releases).

### Build Artifacts
- **Standalone exe**: `target/release/schoolmate-proto.exe`
- **Size**: ~6.2 MB
- **Dependencies**: All embedded

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Make changes and test
4. Commit: `git commit -m "Add feature"`
5. Push: `git push origin feature-name`
6. Open Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Homepage**: [GitHub Repository](https://github.com/watersize/Nexara)
- **Releases**: [Download Page](https://github.com/watersize/Nexara/releases)
- **Issues**: [Bug Reports](https://github.com/watersize/Nexara/issues)
- **Tauri Docs**: [Documentation](https://tauri.app/)
- **GROQ API**: [AI Models](https://groq.com/)

---

**🚀 Nexara v0.2.0 - Your AI-powered educational assistant**
