# Patch 1.2.2

## Modular Code Structure

- `frontend/app/notebook/page.tsx`
  Professional entry route for the hybrid note workspace.
- `frontend/components/notebook/workspace-shell.tsx`
  iOS-style library, preview, and immersive editor transition shell.
- `frontend/components/notebook/object-canvas.tsx`
  Shared infinite canvas surface with text, drawings, images, and CAD objects.
- `frontend/components/notebook/hybrid-object-wrapper.tsx`
  Atomic object wrapper with selection, lasso participation, handles, snapping hooks, and CAD dimensions.
- `frontend/components/notebook/floating-text-toolbar.tsx`
  Inline text formatting controls.
- `frontend/components/notebook/right-inspector.tsx`
  Collapsible panels for layers, shapes, dimensions, and metadata.
- `frontend/components/notebook/types.ts`
  Shared types for notes, selections, panels, and CAD settings.
- `src-tauri/src/professional_schema.rs`
  Local-first Rust schema and migration source for notes, sessions, professionals, links, and vector exports.

## Next.js Folder Structure

```text
frontend/
  app/
    layout.tsx
    notebook/
      page.tsx
  components/
    notebook/
      floating-text-toolbar.tsx
      hybrid-object-wrapper.tsx
      object-canvas.tsx
      right-inspector.tsx
      types.ts
      workspace-shell.tsx
```

## Professional Navigation Layout

- `RootLayout` uses professional metadata and terminology.
- `WorkspaceShell` owns:
  - `LibraryList`
  - `PreviewPane`
  - `ImmersiveWorkspace`
- `ImmersiveWorkspace` hides app sidebars and keeps title/project centered with a back arrow on the left.

## Rust Professional Data Model

- `professionals`
- `knowledge_notes`
- `knowledge_note_objects`
- `project_sessions`
- `knowledge_links`
- `vector_exports`

The schema is local-first SQLite, optimized for Rust-side PDF generation and future Go/Python integration.
