# veyo.ai Roadmap

## 1.0.x Stabilization

- Finish cleanup of legacy frontend assets that are no longer used
- Expand regression coverage for planner, notebook, and textbook preview
- Harden PDF preview for large files and uncommon encodings
- Improve AI error handling and fallback responses

## 1.1 Desktop polish

- Better schedule constructor with drag-and-drop lesson ordering
- Richer reminder rules for tasks and lessons
- Full in-app file preview for DOCX and image annotations
- Safer database migrations between releases

## 1.2 AI workspace

- Stronger RAG ranking for textbook fragments
- Smarter notebook-aware answers with direct note citations
- Schedule-aware daily brief generated inside the app
- Context controls for AI chat sources

## 1.3 Cloud and sync

- Optional account sync between devices
- Conflict-aware merge for notes, tasks, and schedules
- Background delivery for notifications when desktop app is closed

## Mobile track

- Android packaging review and Tauri mobile feasibility pass
- iOS distribution path analysis: TestFlight / PWA / hosted companion app
- Shared API layer for desktop and mobile clients
