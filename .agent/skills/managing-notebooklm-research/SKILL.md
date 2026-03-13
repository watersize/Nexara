---
name: managing-notebooklm-research
description: Manages NotebookLM notebooks, sources, and deep research. Use when the user wants to organize research, analyze sources, or perform deep web/Drive searches using NotebookLM tools.
---

# Managing NotebookLM Research

## When to use this skill
- When starting a new research project or deep dive.
- When organizing existing sources (PDFs, URLs, Google Drive docs) into notebooks.
- When generating reports, summaries, or audio overviews from collected information.
- When searching for new sources via "fast" or "deep" research modes.

## Workflow
- [ ] **Plan**: Define the research goal and identify initial sources.
- [ ] **Initialize**: Create a new notebook using `notebook_create` if one doesn't exist.
- [ ] **Populate**: Add sources using `notebook_add_url`, `notebook_add_text`, `notebook_add_drive`, or `research_start`.
- [ ] **Analyze**: Query the notebook using `notebook_query` or get summaries via `notebook_describe`.
- [ ] **Synthesize**: Generate artifacts like reports (`report_create`) or audio overviews (`audio_overview_create`).
- [ ] **Validate**: Check that all imported sources are correctly listed using `notebook_get`.

## Instructions

### Research Patterns
- **Deep Research**: Use `research_start` with `mode="deep"` for comprehensive web searches. 
- **Sequential Polling**: After starting research, you must poll `research_status` until `status="completed"`. 
- **Importing**: Use `research_import` to bring discovered sources into the target notebook.

### Source Management
- Always check for "stale" Drive sources with `source_list_drive` before performing a `source_sync_drive`.
- Use `source_get_content` to extract raw text for external processing or further analysis.

### Content Generation
- When creating reports or quizzes, confirm with the user first as these tools require `confirm=True`.
- Leverage `chat_configure` to specialize the AI's behavior within the notebook (e.g., as a "learning guide").

## Resources
- [NotebookLM MCP Server Tools](notebooklm://)
- [Polling Script](scripts/poll_research.ps1)
