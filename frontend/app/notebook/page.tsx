'use client'

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useTheme } from 'next-themes'
import {
  ChevronLeft, FileText, FolderOpen, FolderPlus, Grid3x3, Layers3,
  MoreHorizontal, NotebookPen, PenTool, Plus, Search, Trash, Trash2,
  Type, ZoomIn, ZoomOut, Copy, Pencil, MousePointer2, Circle, Square,
  Triangle, Hexagon, Table, BarChart3, PieChart, Download, Upload,
  Star, Clock, FileDown, FolderClosed, Hash, ChevronRight,
  Diamond, Minus, Undo2, Redo2, Palette, Move, ImageIcon
} from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AppShell } from '@/components/app-shell'
import { getLassoBox, getSnapGuides, HybridObjectWrapper, resolveLassoSelection } from '@/components/notebook/hybrid-object-wrapper'
import { BlockEditor, blocksToMarkdown, markdownToBlocks, type Block } from '@/components/notebook/block-editor'
import { WikiLinkPopup } from '@/components/notebook/wiki-link-popup'
import type { HybridObject, HybridPoint, LassoSelection, NoteFolder } from '@/components/notebook/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ── Constants ────────────────────────────────────────── */
const PREFIX = '__VEYO_HYBRID_NOTE__::'
const makeId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`
const sortObjects = (objects: HybridObject[]) => [...objects].sort((a, b) => a.z - b.z)

type NoteDoc = {
  version: number
  title: string
  folderId?: string
  mode: 'editor' | 'canvas'
  blocks: Block[]
  prefs: { dims: boolean; snap: boolean }
  objects: HybridObject[]
}

type NoteRecord = {
  id: string
  title: string
  topic: string
  folderId: string
  createdAt: string
  updatedAt: string
  doc: NoteDoc
}

type FolderRecord = {
  id: string
  name: string
  color: string
  parent_id: string
  sort_order: number
}

const parseDoc = (raw: string, title: string, folderId?: string): NoteDoc => {
  if (raw.startsWith(PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(PREFIX.length)) as NoteDoc
      return {
        ...parsed,
        mode: parsed.mode || 'editor',
        blocks: parsed.blocks || [{ id: makeId('blk'), type: 'heading1', content: title }, { id: makeId('blk'), type: 'paragraph', content: '' }],
        folderId: parsed.folderId || folderId || '',
      }
    } catch { /* fall through */ }
  }
  const text = raw.replace(/<[^>]*>/g, '').trim()
  return {
    version: 2,
    title,
    folderId: folderId || '',
    mode: 'editor',
    blocks: text
      ? markdownToBlocks(text)
      : [{ id: makeId('blk'), type: 'heading1', content: title }, { id: makeId('blk'), type: 'paragraph', content: '' }],
    prefs: { dims: true, snap: true },
    objects: [],
  }
}

const createDoc = (title: string, folderId?: string): NoteDoc => ({
  version: 2,
  title,
  folderId: folderId || '',
  mode: 'editor',
  blocks: [
    { id: makeId('blk'), type: 'heading1', content: title },
    { id: makeId('blk'), type: 'paragraph', content: '' },
  ],
  prefs: { dims: true, snap: true },
  objects: [],
})

const serialize = (doc: NoteDoc) => `${PREFIX}${JSON.stringify(doc)}`
const snippet = (doc: NoteDoc) => {
  const text = doc.blocks?.map(b => b.content).filter(Boolean).join(' ').trim() || ''
  return text ? `${text.slice(0, 120)}${text.length > 120 ? '...' : ''}` : 'Пустая заметка'
}

const Tip = ({ children, label, side = 'bottom' }: { children: React.ReactNode; label: string; side?: 'top' | 'bottom' | 'left' | 'right' }) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side={side} className="text-[11px] font-medium bg-neutral-900 border-white/10 text-white px-2 py-1 rounded-lg shadow-xl">{label}</TooltipContent>
  </Tooltip>
)

/* ── Main Component ───────────────────────────────────── */
export default function NotebookPage() {
  const appState = useAppState()
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme !== 'light'
  const user = appState?.authSession ? { displayName: appState.authSession.display_name, email: appState.authSession.email } : undefined

  /* State */
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [activeFolderId, setActiveFolderId] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderDraft, setFolderDraft] = useState({ name: '', color: '#3b82f6' })
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ noteId: string; x: number; y: number } | null>(null)
  
  /* Canvas state */
  const [tool, setTool] = useState<'select' | 'stroke'>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [scale, setScale] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [tempStroke, setTempStroke] = useState<HybridPoint[]>([])
  const [lasso, setLasso] = useState<LassoSelection | null>(null)
  const [drawColor, setDrawColor] = useState('#86adff')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [shapeColor, setShapeColor] = useState('#86adff')
  const [shapeFill, setShapeFill] = useState('transparent')
  const stageRef = useRef<HTMLDivElement>(null)
  const dragGroupStartRef = useRef<Record<string, {x: number, y: number}>>({})
  const [undoStack, setUndoStack] = useState<HybridObject[][]>([])
  const [redoStack, setRedoStack] = useState<HybridObject[][]>([])
  const [dragNoteId, setDragNoteId] = useState<string | null>(null)
  const [tableParams, setTableParams] = useState({ rows: 3, cols: 3 })
  const [diagramType, setDiagramType] = useState<'bar' | 'pie' | 'line' | 'donut'>('bar')
  
  /* Wiki-link state */
  const [wikiLink, setWikiLink] = useState<{ blockId: string; position: { x: number; y: number } } | null>(null)

  const active = useMemo(() => notes.find(n => n.id === activeNoteId) || null, [notes, activeNoteId])

  /* ── Undo/Redo helpers ───────────────────────────────── */
  const pushUndo = useCallback(() => {
    if (!active) return
    setUndoStack(prev => [...prev.slice(-30), JSON.parse(JSON.stringify(active.doc.objects))])
    setRedoStack([])
  }, [active])

  const undo = useCallback(() => {
    if (undoStack.length === 0 || !active) return
    const prev = undoStack[undoStack.length - 1]
    setRedoStack(rs => [...rs, JSON.parse(JSON.stringify(active.doc.objects))])
    setUndoStack(us => us.slice(0, -1))
    updateActiveDoc(doc => ({ ...doc, objects: prev }))
  }, [undoStack, active])

  const redo = useCallback(() => {
    if (redoStack.length === 0 || !active) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack(us => [...us, JSON.parse(JSON.stringify(active.doc.objects))])
    setRedoStack(rs => rs.slice(0, -1))
    updateActiveDoc(doc => ({ ...doc, objects: next }))
  }, [redoStack, active])

  /* ── Data Loading ────────────────────────────────────── */
  const loadNotes = async () => {
    try {
      const raw = await tauriInvoke<any[]>('list_notes')
      const loaded = (raw || []).map((n: any) => ({
        id: n.id,
        title: n.title || '',
        topic: n.topic || '',
        folderId: n.folder_id || '',
        createdAt: n.created_at || n.updated_at || new Date().toISOString(),
        updatedAt: n.updated_at || new Date().toISOString(),
        doc: parseDoc(n.content || '', n.title || '', n.folder_id || ''),
      }))
      setNotes(loaded)
    } catch (e) { console.error('loadNotes', e) }
  }

  const loadFolders = async () => {
    try {
      const raw = await tauriInvoke<FolderRecord[]>('list_note_folders')
      setFolders(raw || [])
    } catch (e) { console.error('loadFolders', e) }
  }

  useEffect(() => { loadNotes(); loadFolders() }, [])

  /* ── CRUD ─────────────────────────────────────────────── */
  const saveNote = async (note: NoteRecord) => {
    const content = serialize(note.doc)
    await tauriInvoke('save_note', {
      payload: {
        note: { id: note.id, title: note.doc.title || note.title, topic: note.topic, content, updated_at: new Date().toISOString() }
      }
    })
  }

  const createNote = async () => {
    const id = makeId('note')
    const title = 'Новая заметка'
    const folderId = activeFolderId !== 'all' && activeFolderId !== 'recent' && activeFolderId !== 'favorites' ? activeFolderId : ''
    const doc = createDoc(title, folderId)
    const now = new Date().toISOString()
    const record: NoteRecord = { id, title, topic: '', folderId, createdAt: now, updatedAt: now, doc }
    setNotes(prev => [record, ...prev])
    setActiveNoteId(id)
    await saveNote(record)
  }

  const deleteNote = async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    if (activeNoteId === id) setActiveNoteId(null)
    await tauriInvoke('delete_note', { payload: { id } })
    toast.success('Заметка удалена')
  }

  const updateActiveDoc = (updater: (doc: NoteDoc) => NoteDoc) => {
    if (!activeNoteId) return
    setNotes(prev => prev.map(n => {
      if (n.id !== activeNoteId) return n
      const newDoc = updater(n.doc)
      const updated: NoteRecord = { ...n, doc: newDoc, title: newDoc.title, updatedAt: new Date().toISOString() }
      // Debounced save
      clearTimeout((window as any).__noteSaveTimer)
      ;(window as any).__noteSaveTimer = setTimeout(() => saveNote(updated), 800)
      return updated
    }))
  }

  /* ── Folder CRUD ──────────────────────────────────────── */
  const saveFolder = async () => {
    const id = editingFolderId || makeId('folder')
    const folder: FolderRecord = { id, name: folderDraft.name, color: folderDraft.color, parent_id: '', sort_order: folders.length }
    await tauriInvoke('save_note_folder', { payload: { folder } })
    setFolderDialogOpen(false)
    setFolderDraft({ name: '', color: '#3b82f6' })
    setEditingFolderId(null)
    await loadFolders()
  }

  const deleteFolder = async (id: string) => {
    await tauriInvoke('delete_note_folder', { payload: { id } })
    if (activeFolderId === id) setActiveFolderId('all')
    await loadFolders()
    await loadNotes()
    toast.success('Папка удалена')
  }

  /* ── Canvas Actions ───────────────────────────────────── */
  const addCanvasObject = (type: HybridObject['type'], extra?: Partial<HybridObject>) => {
    pushUndo()
    const cx = (-panOffset.x + (stageRef.current?.clientWidth || 600) / 2) / scale
    const cy = (-panOffset.y + (stageRef.current?.clientHeight || 400) / 2) / scale
    const newObj: HybridObject = {
      id: makeId('obj'), type, name: type, x: cx - 80 + Math.random() * 40, y: cy - 80 + Math.random() * 40,
      w: type === 'text' ? 300 : 160, h: type === 'text' ? 100 : 160, rot: 0, z: (active?.doc.objects.length || 0) + 1,
      locked: false, visible: true, opacity: 1,
      ...(type === 'cad' ? { shape: 'rectangle' as const, stroke: shapeColor, fill: shapeFill, dash: false, strokeWidth: 3 } : {}),
      ...(type === 'text' ? { text: '', fontSize: 16 } : {}),
      ...(type === 'table' ? { cells: Array.from({ length: tableParams.rows }, (_, r) => Array.from({ length: tableParams.cols }, (_, c) => r === 0 ? `Кол. ${c + 1}` : '')) } : {}),
      ...(type === 'diagram' ? { cells: [['A', '30'], ['B', '50'], ['C', '20'], ['D', '40']], shape: 'rectangle' as const, dash: true, view: diagramType } : {}),
      ...extra,
    }
    updateActiveDoc(doc => ({ ...doc, objects: [...doc.objects, newObj] }))
    // Automatically select the newly created object (unless we are just drawing lines)
    if (type !== 'stroke' && type !== 'image') {
      setSelectedId(newObj.id)
      setSelectedIds([newObj.id])
    }
  }

  const applyPatchToSelected = useCallback((patch: Partial<HybridObject>) => {
    if (selectedIds.length === 0) return
    
    // Also save stroke/color as default for next items
    if (patch.stroke) { setShapeColor(patch.stroke); setDrawColor(patch.stroke) }
    if (patch.strokeWidth) setStrokeWidth(patch.strokeWidth)

    updateActiveDoc(doc => ({
      ...doc,
      objects: doc.objects.map(o => selectedIds.includes(o.id) ? { ...o, ...patch } : o)
    }))
  }, [selectedIds, updateActiveDoc])

  const patchObject = (id: string, patcher: (obj: HybridObject) => Partial<HybridObject>) => {
    updateActiveDoc(doc => ({
      ...doc,
      objects: doc.objects.map(o => o.id === id ? { ...o, ...patcher(o) } : o)
    }))
  }

  const selectObject = (id: string, additive?: boolean) => {
    if (tool === 'stroke') return // disable selection while drawing
    if (additive) {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    } else {
      setSelectedId(id)
      setSelectedIds([id])
    }
  }

  const onGroupMoveStart = useCallback(() => {
    if (!active) return
    const startMap: Record<string, {x: number, y: number}> = {}
    active.doc.objects.forEach(o => {
       if (selectedIds.includes(o.id)) startMap[o.id] = { x: o.x, y: o.y }
    })
    dragGroupStartRef.current = startMap
  }, [active, selectedIds])

  const onGroupMove = useCallback((dx: number, dy: number) => {
    updateActiveDoc(doc => ({
      ...doc,
      objects: doc.objects.map(o => {
        const start = dragGroupStartRef.current[o.id]
        if (start) return { ...o, x: start.x + dx, y: start.y + dy }
        return o
      })
    }))
  }, [updateActiveDoc])

  const beginDraw = (e: React.PointerEvent) => {
    // Middle button → pan
    if (e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      const startX = e.clientX - panOffset.x
      const startY = e.clientY - panOffset.y
      const onMove = (me: PointerEvent) => setPanOffset({ x: me.clientX - startX, y: me.clientY - startY })
      const onUp = () => { setIsPanning(false); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }
    if (e.button !== 0) return
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left - panOffset.x) / scale
    const y = (e.clientY - rect.top - panOffset.y) / scale

    if (tool === 'select') {
      setSelectedId(null)
      setSelectedIds([])
      setLasso({ active: true, start: { x, y }, current: { x, y } })
      const onMove = (me: PointerEvent) => {
        setLasso(prev => prev ? { ...prev, current: { x: (me.clientX - rect.left - panOffset.x) / scale, y: (me.clientY - rect.top - panOffset.y) / scale } } : null)
      }
      const onUp = () => {
        setLasso(prev => {
          if (prev && active) {
            const ids = resolveLassoSelection(active.doc.objects, prev)
            setSelectedIds(ids)
            if (ids.length === 1) setSelectedId(ids[0])
          }
          return null
        })
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    } else if (tool === 'stroke') {
      pushUndo()
      const pts: HybridPoint[] = [{ x, y }]
      setTempStroke(pts)
      const onMove = (me: PointerEvent) => {
        pts.push({ x: (me.clientX - rect.left - panOffset.x) / scale, y: (me.clientY - rect.top - panOffset.y) / scale })
        setTempStroke([...pts])
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        if (pts.length > 2) {
          const xs = pts.map(p => p.x); const ys = pts.map(p => p.y)
          const minX = Math.min(...xs); const minY = Math.min(...ys)
          const w = Math.max(20, Math.max(...xs) - minX); const h = Math.max(20, Math.max(...ys) - minY)
          const normalized = pts.map(p => ({ x: (p.x - minX) / w, y: (p.y - minY) / h }))
          addCanvasObject('stroke', { x: minX, y: minY, w, h, points: normalized, stroke: drawColor, strokeWidth })
        }
        setTempStroke([])
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
  }

  /* ── Keyboard shortcuts ────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!activeNoteId || !active) return
      // Undo / Redo work everywhere
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.shiftKey && e.key === 'z')) { e.preventDefault(); redo(); return }
      if (active.doc.mode !== 'canvas') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0 && document.activeElement === document.body) {
          pushUndo()
          updateActiveDoc(doc => ({ ...doc, objects: doc.objects.filter(o => !selectedIds.includes(o.id)) }))
          setSelectedId(null); setSelectedIds([])
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedIds.length > 0 && document.activeElement === document.body) {
          const copied = active.doc.objects.filter(o => selectedIds.includes(o.id))
          ;(window as any).__clipboard = JSON.parse(JSON.stringify(copied))
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        // Check clipboard for images first
        navigator.clipboard.read?.().then(items => {
          for (const item of items) {
            const imgType = item.types.find(t => t.startsWith('image/'))
            if (imgType) {
              item.getType(imgType).then(blob => {
                const reader = new FileReader()
                reader.onload = () => {
                  pushUndo()
                  addCanvasObject('image', { src: reader.result as string, w: 300, h: 200 })
                }
                reader.readAsDataURL(blob)
              })
              return
            }
          }
          // Fallback: paste objects
          const clipboard = (window as any).__clipboard as HybridObject[] | undefined
          if (clipboard?.length && document.activeElement === document.body) {
            pushUndo()
            const newObjects = clipboard.map(o => ({ ...o, id: makeId('obj'), x: o.x + 20, y: o.y + 20 }))
            updateActiveDoc(doc => ({ ...doc, objects: [...doc.objects, ...newObjects] }))
            setSelectedIds(newObjects.map(o => o.id))
          }
        }).catch(() => {
          const clipboard = (window as any).__clipboard as HybridObject[] | undefined
          if (clipboard?.length && document.activeElement === document.body) {
            pushUndo()
            const newObjects = clipboard.map(o => ({ ...o, id: makeId('obj'), x: o.x + 20, y: o.y + 20 }))
            updateActiveDoc(doc => ({ ...doc, objects: [...doc.objects, ...newObjects] }))
            setSelectedIds(newObjects.map(o => o.id))
          }
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeNoteId, active, selectedIds, undo, redo, pushUndo])

  /* ── Export ──────────────────────────────────────────── */
  const exportMarkdown = (note: NoteRecord) => {
    const md = `# ${note.title}\n\n${blocksToMarkdown(note.doc.blocks || [])}`
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${note.title || 'note'}.md`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Экспортировано как .md')
  }

  /* ── Filtered notes ──────────────────────────────────── */
  const filteredNotes = useMemo(() => {
    let out = notes
    if (activeFolderId === 'recent') {
      out = [...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 20)
    } else if (activeFolderId !== 'all' && activeFolderId !== 'favorites') {
      out = notes.filter(n => n.folderId === activeFolderId || n.doc.folderId === activeFolderId)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      out = out.filter(n => n.title.toLowerCase().includes(q) || snippet(n.doc).toLowerCase().includes(q))
    }
    return out
  }, [notes, activeFolderId, searchQuery])

  /* ── Sidebar colors ──────────────────────────────────── */
  const sidebarBg = dark ? 'bg-[#0a0c18]/95' : 'bg-[#f8f6f2]/95'
  const sidebarBorder = dark ? 'border-white/6' : 'border-black/6'
  const sidebarTextMuted = dark ? 'text-white/50' : 'text-gray-500'
  const sidebarTextMain = dark ? 'text-white' : 'text-gray-900'
  const sidebarItemActive = dark ? 'bg-white/8 text-white' : 'bg-black/5 text-gray-900'
  const sidebarItemHover = dark ? 'hover:bg-white/5 hover:text-white' : 'hover:bg-black/[0.03] hover:text-gray-900'
  const cardBg = dark ? 'bg-white/[0.03] border-white/6 hover:bg-white/[0.05]' : 'bg-white border-gray-200 hover:shadow-md'

  /* ── Render ──────────────────────────────────────────── */
  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="flex flex-1 min-h-screen overflow-hidden">

        {/* ════════════ SIDEBAR ════════════ */}
        {!activeNoteId && (
          <aside className={cn('w-60 shrink-0 flex flex-col border-r backdrop-blur-xl', sidebarBg, sidebarBorder)}>
            {/* Logo */}
            <div className="px-4 pt-5 pb-3">
              <div className="flex items-center gap-3">
                <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', dark ? 'bg-blue-500/15' : 'bg-blue-500/10')}>
                  <NotebookPen className="h-4.5 w-4.5 text-blue-500" />
                </div>
                <div>
                  <div className={cn('text-sm font-semibold', sidebarTextMain)}>Заметки</div>
                  <div className={cn('text-[10px] uppercase tracking-[0.2em]', sidebarTextMuted)}>v1.4.1</div>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="px-3 pb-2">
              <div className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm', dark ? 'bg-white/5' : 'bg-gray-100')}>
                <Search className={cn('h-3.5 w-3.5 shrink-0', sidebarTextMuted)} />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Поиск..."
                  className={cn('w-full bg-transparent outline-none text-sm', dark ? 'text-white placeholder:text-white/30' : 'text-gray-900 placeholder:text-gray-400')}
                />
              </div>
            </div>

            {/* Smart Folders */}
            <nav className="px-2 py-1 space-y-0.5">
              {[
                { id: 'all', label: 'Все заметки', icon: FileText, count: notes.length },
                { id: 'recent', label: 'Недавние', icon: Clock, count: null },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveFolderId(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                    activeFolderId === item.id ? sidebarItemActive : cn(sidebarTextMuted, sidebarItemHover)
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  {item.count != null && <span className={cn('text-xs tabular-nums', sidebarTextMuted)}>{item.count}</span>}
                </button>
              ))}
            </nav>

            {/* Divider */}
            <div className={cn('mx-4 my-2 border-t', sidebarBorder)} />

            {/* Folders */}
            <div className="px-3 mb-1 flex items-center justify-between">
              <span className={cn('text-[10px] uppercase tracking-[0.2em] font-semibold', sidebarTextMuted)}>Папки</span>
              <Tip label="Новая папка" side="right">
                <button
                  onClick={() => { setEditingFolderId(null); setFolderDraft({ name: '', color: '#3b82f6' }); setFolderDialogOpen(true) }}
                  className={cn('h-5 w-5 flex items-center justify-center rounded-md transition-colors', sidebarTextMuted, dark ? 'hover:bg-white/10' : 'hover:bg-gray-200')}
                >
                  <FolderPlus className="h-3 w-3" />
                </button>
              </Tip>
            </div>
            <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
              {folders.map(folder => (
                <div key={folder.id} className="group relative">
                  <button
                    onClick={() => setActiveFolderId(folder.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                      activeFolderId === folder.id ? sidebarItemActive : cn(sidebarTextMuted, sidebarItemHover)
                    )}
                  >
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: folder.color }} />
                    <span className="truncate flex-1 text-left">{folder.name}</span>
                    <span className={cn('text-xs tabular-nums', sidebarTextMuted)}>
                      {notes.filter(n => n.folderId === folder.id || n.doc.folderId === folder.id).length}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className={cn('absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity', dark ? 'hover:bg-white/10 text-white/50' : 'hover:bg-gray-200 text-gray-400')}>
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className={cn('min-w-[160px]', dark ? 'bg-neutral-900 border-white/10' : '')}>
                      <DropdownMenuItem onClick={() => { setEditingFolderId(folder.id); setFolderDraft({ name: folder.name, color: folder.color }); setFolderDialogOpen(true) }}>
                        <Pencil className="h-4 w-4 mr-2" /> Переименовать
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-400" onClick={() => deleteFolder(folder.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
              {folders.length === 0 && (
                <div className={cn('px-3 py-6 text-center text-xs', sidebarTextMuted)}>
                  Нет папок
                </div>
              )}
            </div>

            {/* New Note Button */}
            <div className={cn('p-3 border-t', sidebarBorder)}>
              <Button onClick={createNote} className="w-full rounded-xl h-10 gap-2 text-sm font-medium" size="sm">
                <Plus className="h-4 w-4" /> Новая заметка
              </Button>
            </div>
          </aside>
        )}

        {/* ════════════ CONTENT ════════════ */}
        {!activeNoteId ? (
          /* Note Grid */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto">
              {/* Header */}
              <div className="mb-6">
                <h1 className={cn('text-2xl font-bold', dark ? 'text-white' : 'text-gray-900')}>
                  {activeFolderId === 'all' ? 'Все заметки' : activeFolderId === 'recent' ? 'Недавние' : folders.find(f => f.id === activeFolderId)?.name || 'Заметки'}
                </h1>
                <p className={cn('mt-1 text-sm', dark ? 'text-white/50' : 'text-gray-500')}>
                  {filteredNotes.length} {filteredNotes.length === 1 ? 'заметка' : 'заметок'}
                </p>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* Create Card */}
                <button
                  onClick={createNote}
                  className={cn(
                    'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-all group cursor-pointer',
                    dark ? 'border-white/10 hover:border-white/20 hover:bg-white/[0.03]' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  )}
                >
                  <div className={cn('h-12 w-12 rounded-2xl flex items-center justify-center transition-colors', dark ? 'bg-white/5 group-hover:bg-blue-500/15' : 'bg-gray-100 group-hover:bg-blue-50')}>
                    <Plus className={cn('h-6 w-6', dark ? 'text-white/40 group-hover:text-blue-400' : 'text-gray-400 group-hover:text-blue-500')} />
                  </div>
                  <span className={cn('text-sm font-medium', dark ? 'text-white/40 group-hover:text-white/70' : 'text-gray-400 group-hover:text-gray-600')}>Создать</span>
                </button>

                {filteredNotes.map(note => (
                  <button
                    key={note.id}
                    onClick={() => setActiveNoteId(note.id)}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ noteId: note.id, x: e.clientX, y: e.clientY }) }}
                    className={cn('text-left rounded-2xl border p-4 transition-all group cursor-pointer', cardBg)}
                  >
                    {/* Preview */}
                    <div className={cn('h-24 rounded-xl mb-3 flex items-center justify-center overflow-hidden', dark ? 'bg-white/[0.03]' : 'bg-gray-50')}>
                      <div className={cn('text-xs leading-relaxed line-clamp-4 px-3', dark ? 'text-white/30' : 'text-gray-400')}>
                        {snippet(note.doc)}
                      </div>
                    </div>
                    <div className={cn('text-sm font-semibold truncate', dark ? 'text-white' : 'text-gray-900')}>{note.title || 'Без названия'}</div>
                    <div className={cn('mt-1 text-xs flex items-center gap-2', dark ? 'text-white/40' : 'text-gray-400')}>
                      <span>{format(new Date(note.updatedAt), 'd MMM, HH:mm', { locale: ru })}</span>
                      {note.folderId && (() => {
                        const f = folders.find(fo => fo.id === note.folderId)
                        return f ? <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full" style={{ backgroundColor: f.color }} />{f.name}</span> : null
                      })()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : active ? (
          /* ════════════ EDITOR ════════════ */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className={cn('flex items-center gap-2 px-4 py-2 border-b shrink-0', dark ? 'bg-[#0b0d17]/90 border-white/6 backdrop-blur-xl' : 'bg-white/90 border-gray-200 backdrop-blur-xl')}>
              <Tip label="Назад" side="bottom">
                <Button variant="ghost" size="icon" onClick={() => setActiveNoteId(null)} className="h-8 w-8 rounded-xl">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </Tip>

              {/* Title Editable */}
              <input
                value={active.doc.title}
                onChange={e => updateActiveDoc(doc => ({ ...doc, title: e.target.value }))}
                className={cn('flex-1 bg-transparent outline-none text-sm font-semibold', dark ? 'text-white' : 'text-gray-900')}
                placeholder="Название заметки"
              />

              {/* Mode Toggle */}
              <div className={cn('flex items-center rounded-xl p-0.5 gap-0.5', dark ? 'bg-white/5' : 'bg-gray-100')}>
                <Tip label="Редактор">
                  <button
                    onClick={() => updateActiveDoc(doc => ({ ...doc, mode: 'editor' }))}
                    className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all', active.doc.mode === 'editor' ? 'bg-blue-500 text-white shadow-sm' : (dark ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-900'))}
                  >
                    Текст
                  </button>
                </Tip>
                <Tip label="Холст">
                  <button
                    onClick={() => updateActiveDoc(doc => ({ ...doc, mode: 'canvas' }))}
                    className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all', active.doc.mode === 'canvas' ? 'bg-blue-500 text-white shadow-sm' : (dark ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-900'))}
                  >
                    Холст
                  </button>
                </Tip>
              </div>

              {/* Canvas Tools (conditional) */}
              {active.doc.mode === 'canvas' && (
                <>
                  <div className={cn('w-px h-6', dark ? 'bg-white/10' : 'bg-gray-200')} />
                  <Tip label="Выделение"><Button variant={tool === 'select' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 rounded-xl" onClick={() => setTool('select')}><MousePointer2 className="h-4 w-4" /></Button></Tip>
                  <Tip label="Рисование"><Button variant={tool === 'stroke' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 rounded-xl" onClick={() => setTool('stroke')}><PenTool className="h-4 w-4" /></Button></Tip>

                  {/* Shapes dropdown — NO Tip wrapping the trigger */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" title="Фигуры"><Square className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent className={dark ? 'bg-neutral-900 border-white/10' : ''}>
                      <DropdownMenuItem onSelect={() => addCanvasObject('cad', { shape: 'rectangle' })}><Square className="h-4 w-4 mr-2" /> Прямоугольник</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => addCanvasObject('cad', { shape: 'circle' })}><Circle className="h-4 w-4 mr-2" /> Круг</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => addCanvasObject('cad', { shape: 'triangle' })}><Triangle className="h-4 w-4 mr-2" /> Треугольник</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => addCanvasObject('cad', { shape: 'rhombus' })}><Diamond className="h-4 w-4 mr-2" /> Ромб</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => addCanvasObject('cad', { shape: 'polygon' })}><Hexagon className="h-4 w-4 mr-2" /> Полигон</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => addCanvasObject('stroke', { w: 200, h: 4, points: [{x:0,y:0.5},{x:1,y:0.5}], stroke: shapeColor, strokeWidth: 3 })}><Minus className="h-4 w-4 mr-2" /> Линия</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Text dropdown — NO Tip wrapping the trigger */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" title="Текст"><Type className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent className={dark ? 'bg-neutral-900 border-white/10' : ''}>
                      <DropdownMenuItem onSelect={() => addCanvasObject('text', { fontSize: 24, text: '', stroke: shapeColor })}>Заголовок</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => addCanvasObject('text', { fontSize: 16, text: '', stroke: shapeColor })}>Обычный текст</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => addCanvasObject('text', { fontSize: 12, text: '', stroke: shapeColor })}>Маленький текст</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Table popup — NO Tip wrapping the trigger */}
                  <Popover>
                    <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" title="Таблица"><Table className="h-4 w-4" /></Button></PopoverTrigger>
                    <PopoverContent align="start" className={cn('w-48 p-3 space-y-3', dark ? 'bg-neutral-900 border-white/10' : '')}>
                      <div className={cn('text-xs font-semibold', dark ? 'text-white/60' : 'text-gray-500')}>Параметры таблицы</div>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-xs', dark ? 'text-white/50' : 'text-gray-500')}>Строки:</span>
                        <input type="number" min={1} max={20} value={tableParams.rows} onChange={e => setTableParams(p => ({ ...p, rows: Math.max(1, +e.target.value) }))} className={cn('w-14 rounded px-2 py-1 text-xs', dark ? 'bg-white/10 text-white' : 'bg-gray-100')} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-xs', dark ? 'text-white/50' : 'text-gray-500')}>Колонки:</span>
                        <input type="number" min={1} max={10} value={tableParams.cols} onChange={e => setTableParams(p => ({ ...p, cols: Math.max(1, +e.target.value) }))} className={cn('w-14 rounded px-2 py-1 text-xs', dark ? 'bg-white/10 text-white' : 'bg-gray-100')} />
                      </div>
                      <Button size="sm" className="w-full h-8 text-xs rounded-lg" onPointerDown={(e) => { e.preventDefault(); addCanvasObject('table', { w: tableParams.cols * 100, h: tableParams.rows * 36 }) }}>Вставить</Button>
                    </PopoverContent>
                  </Popover>

                  {/* Diagram popup — NO Tip wrapping the trigger */}
                  <Popover>
                    <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" title="Диаграмма"><BarChart3 className="h-4 w-4" /></Button></PopoverTrigger>
                    <PopoverContent align="start" className={cn('w-48 p-3 space-y-2', dark ? 'bg-neutral-900 border-white/10' : '')}>
                      <div className={cn('text-xs font-semibold', dark ? 'text-white/60' : 'text-gray-500')}>Тип диаграммы</div>
                      {(['bar', 'pie', 'line', 'donut'] as const).map(t => (
                        <button key={t} onPointerDown={(e) => { e.preventDefault(); setDiagramType(t); addCanvasObject('diagram', { w: 250, h: 200, view: t }) }}
                          className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors', dark ? 'text-white/70 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50')}
                        >
                          {t === 'bar' && <><BarChart3 className="h-4 w-4" /> Столбчатая</>}
                          {t === 'pie' && <><PieChart className="h-4 w-4" /> Круговая</>}
                          {t === 'line' && <><Minus className="h-4 w-4" /> Линейная</>}
                          {t === 'donut' && <><Circle className="h-4 w-4" /> Кольцевая</>}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>

                  <div className={cn('w-px h-6', dark ? 'bg-white/10' : 'bg-gray-200')} />
                  <Tip label="Отменить (Ctrl+Z)"><Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" disabled={undoStack.length === 0} onClick={undo}><Undo2 className="h-4 w-4" /></Button></Tip>
                  <Tip label="Вернуть (Ctrl+Shift+Z)"><Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" disabled={redoStack.length === 0} onClick={redo}><Redo2 className="h-4 w-4" /></Button></Tip>
                  <div className={cn('w-px h-6', dark ? 'bg-white/10' : 'bg-gray-200')} />
                  <Tip label="Отдалить"><Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => setScale(s => Math.max(0.1, s - 0.1))}><ZoomOut className="h-4 w-4" /></Button></Tip>
                  <span className={cn('text-xs font-mono tabular-nums w-10 text-center', dark ? 'text-white/50' : 'text-gray-500')}>{Math.round(scale * 100)}%</span>
                  <Tip label="Приблизить"><Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => setScale(s => Math.min(5, s + 0.1))}><ZoomIn className="h-4 w-4" /></Button></Tip>
                </>
              )}

              {/* Export */}
              <Tip label="Экспорт .md" side="bottom">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => exportMarkdown(active)}>
                  <Download className="h-4 w-4" />
                </Button>
              </Tip>
            </div>

            {/* Properties Bar (shown when stroke tool active OR objects selected) */}
            {active.doc.mode === 'canvas' && (tool === 'stroke' || selectedIds.length > 0) && (
              <div className={cn('flex items-center gap-4 px-4 py-2 border-b shrink-0', dark ? 'border-white/8 bg-white/[0.02]' : 'border-gray-100 bg-gray-50')}>
                <span className={cn('text-xs font-medium', dark ? 'text-white/50' : 'text-gray-500')}>Цвет:</span>
                <div className="flex gap-1.5">
                  {['#86adff','#ff6b6b','#51cf66','#ffd43b','#cc5de8','#ff922b','#20c997','#ffffff','#868e96'].map(c => (
                    <button key={c} onClick={() => {
                        if (selectedIds.length > 0) applyPatchToSelected({ stroke: c })
                        else { setDrawColor(c); setShapeColor(c); }
                    }}
                      className={cn('h-6 w-6 rounded-full border-2 transition-all relative overflow-hidden', (selectedIds.length > 0 ? false : drawColor === c) ? 'scale-125 border-blue-500 shadow-md' : (dark ? 'border-white/20' : 'border-gray-200'))}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className={cn('w-px h-5', dark ? 'bg-white/10' : 'bg-gray-200')} />
                <span className={cn('text-xs font-medium whitespace-nowrap', dark ? 'text-white/50' : 'text-gray-500')}>Размер/Толщина:</span>
                <input type="range" min="1" max="64" 
                    value={selectedIds.length === 1 ? (active.doc.objects.find(o => o.id === selectedIds[0])?.strokeWidth || active.doc.objects.find(o => o.id === selectedIds[0])?.fontSize || strokeWidth) : strokeWidth} 
                    onChange={e => {
                        const val = Number(e.target.value)
                        setStrokeWidth(Math.min(val, 20))
                        if (selectedIds.length > 0) {
                            if (selectedIds.length === 1 && active.doc.objects.find(o => o.id === selectedIds[0])?.type === 'text') {
                                applyPatchToSelected({ fontSize: val })
                            } else {
                                applyPatchToSelected({ strokeWidth: Math.min(val, 20) })
                            }
                        }
                    }} className="w-32" 
                />
              </div>
            )}

            {/* Editor Body */}
            {active.doc.mode === 'editor' ? (
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-6 py-4">
                  <BlockEditor
                    blocks={active.doc.blocks || []}
                    onChange={blocks => updateActiveDoc(doc => ({ ...doc, blocks }))}
                    onWikiLinkTrigger={(query, blockId, pos) => setWikiLink({ blockId, position: pos })}
                    dark={dark}
                  />
                </div>
              </div>
            ) : (
              /* Canvas */
              <div className="flex-1 relative overflow-hidden">
                <div
                  ref={stageRef}
                  onPointerDown={beginDraw}
                  onWheel={e => {
                    e.preventDefault()
                    const rect = stageRef.current?.getBoundingClientRect()
                    if (!rect) return
                    const mx = e.clientX - rect.left
                    const my = e.clientY - rect.top
                    const delta = -Math.sign(e.deltaY) * 0.1
                    const newScale = Math.max(0.1, Math.min(5, scale + delta))
                    const ratio = newScale / scale
                    setPanOffset(p => ({
                      x: mx - ratio * (mx - p.x),
                      y: my - ratio * (my - p.y),
                    }))
                    setScale(newScale)
                  }}
                  onContextMenu={e => {
                    e.preventDefault()
                    // Right-click paste image
                    navigator.clipboard.read?.().then(items => {
                      for (const item of items) {
                        const imgType = item.types.find(t => t.startsWith('image/'))
                        if (imgType) {
                          item.getType(imgType).then(blob => {
                            const reader = new FileReader()
                            reader.onload = () => {
                              pushUndo()
                              const rect2 = stageRef.current?.getBoundingClientRect()
                              const x = rect2 ? (e.clientX - rect2.left - panOffset.x) / scale : 100
                              const y = rect2 ? (e.clientY - rect2.top - panOffset.y) / scale : 100
                              addCanvasObject('image', { src: reader.result as string, w: 300, h: 200, x, y })
                            }
                            reader.readAsDataURL(blob)
                          })
                          return
                        }
                      }
                    }).catch(() => {})
                  }}
                  className={cn('w-full h-full touch-none', tool === 'stroke' ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-default')}
                  style={{
                    background: dark
                      ? `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)`
                      : `radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)`,
                    backgroundSize: `${32 * scale}px ${32 * scale}px`,
                    backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
                  }}
                >
                  <div style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`, transformOrigin: '0 0', width: '100%', height: '100%' }}>
                    {sortObjects(active.doc.objects).filter(o => o.visible).map(object => (
                      <HybridObjectWrapper
                        key={object.id}
                        object={object}
                        selected={selectedId === object.id}
                        multiSelected={selectedIds.includes(object.id)}
                        showDimensions={active.doc.prefs.dims}
                        scale={1}
                        accent="#3b82f6"
                        border={dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
                        panel="#171717"
                        dim="#64748b"
                        onSelect={selectObject}
                        onTransform={(id, patch) => patchObject(id, () => patch)}
                        onGroupMoveStart={onGroupMoveStart}
                        onGroupMove={onGroupMove}
                      >
                        {object.type === 'text' && (
                          <div className="absolute inset-0 pointer-events-auto">
                            <textarea
                              value={object.text}
                              onChange={e => patchObject(object.id, () => ({ text: e.target.value }))}
                              className="w-full h-full bg-transparent border-none outline-none resize-none p-2 leading-relaxed"
                              style={{ fontSize: object.fontSize || 16, color: object.stroke || (dark ? '#f4f7ff' : '#182235') }}
                            />
                          </div>
                        )}
                        {object.type === 'table' && (
                          <div className={cn('absolute inset-0 pointer-events-auto p-1 rounded border overflow-hidden flex flex-col shadow-xl', dark ? 'bg-[#1c1c1c] border-white/10' : 'bg-white border-gray-200')}>
                            {object.cells?.map((row, rIdx) => (
                              <div key={rIdx} className={cn('flex-1 flex border-b last:border-0', dark ? 'border-white/10' : 'border-gray-100')}>
                                {row.map((cell, cIdx) => (
                                  <div key={cIdx} className={cn('flex-1 border-r last:border-0', dark ? 'border-white/10' : 'border-gray-100')}>
                                    <input
                                      value={cell}
                                      onChange={e => {
                                        const newCells = (object.cells || []).map(r => [...r])
                                        newCells[rIdx][cIdx] = e.target.value
                                        patchObject(object.id, () => ({ cells: newCells }))
                                      }}
                                      className={cn('w-full h-full bg-transparent px-2 outline-none text-sm', dark ? 'text-white' : 'text-gray-900')}
                                    />
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                        {object.type === 'diagram' && (
                          <div className="absolute inset-0 pointer-events-none p-4 pb-8 flex items-end justify-center gap-2">
                            {object.cells?.map((row, i) => {
                              const val = parseFloat(row[1]) || 0
                              const max = Math.max(...(object.cells?.map(r => parseFloat(r[1]) || 0) || [1]))
                              const pct = max > 0 ? (val / max) * 100 : 0
                              return (
                                <div key={i} className="flex-1 bg-blue-500 rounded-t-sm relative transition-all" style={{ height: `${pct}%`, minHeight: 4 }}>
                                  {object.dash && <span className="absolute -top-5 text-[10px] text-white font-bold left-1/2 -translate-x-1/2">{val}</span>}
                                  <span className={cn('absolute -bottom-6 text-[10px] whitespace-nowrap truncate w-8', dark ? 'text-neutral-400' : 'text-gray-500')}>{row[0]}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {object.type === 'image' && <img src={object.src} className="w-full h-full object-contain pointer-events-none" />}
                      </HybridObjectWrapper>
                    ))}
                    {lasso && (() => {
                      const box = getLassoBox(lasso)
                      return <div className="absolute border-2 border-blue-500 bg-blue-500/5 pointer-events-none z-[100] rounded-lg" style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }} />
                    })()}
                    {tempStroke.length > 1 && (
                      <svg className="absolute top-0 left-0 overflow-visible pointer-events-none z-[90]">
                        <polyline points={tempStroke.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={drawColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* ════════════ DIALOGS ════════════ */}
        <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
          <DialogContent className={dark ? 'bg-neutral-900 border-white/10' : ''}>
            <DialogHeader>
              <DialogTitle>{editingFolderId ? 'Редактировать папку' : 'Новая папка'}</DialogTitle>
              <DialogDescription>Введите название и выберите цвет</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <Input value={folderDraft.name} onChange={e => setFolderDraft(d => ({ ...d, name: e.target.value }))} placeholder="Название" />
              <div className="flex items-center gap-2">
                <span className={cn('text-sm', dark ? 'text-white/60' : 'text-gray-500')}>Цвет:</span>
                {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'].map(c => (
                  <button key={c} onClick={() => setFolderDraft(d => ({ ...d, color: c }))} className={cn('h-7 w-7 rounded-full transition-transform', folderDraft.color === c && 'ring-2 ring-offset-2 ring-blue-500 scale-110', dark && 'ring-offset-neutral-900')} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setFolderDialogOpen(false)}>Отмена</Button>
              <Button disabled={!folderDraft.name.trim()} onClick={saveFolder}>Сохранить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Wiki Link Popup */}
        {wikiLink && (
          <WikiLinkPopup
            position={wikiLink.position}
            dark={dark}
            onSelect={result => {
              // Insert [[title]] into the active block
              updateActiveDoc(doc => ({
                ...doc,
                blocks: doc.blocks.map(b =>
                  b.id === wikiLink.blockId
                    ? { ...b, content: b.content.replace(/\[\[$/, '') + `[[${result.title}]]` }
                    : b
                )
              }))
              setWikiLink(null)
            }}
            onClose={() => setWikiLink(null)}
          />
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div
            className={cn('fixed z-[1000] min-w-[200px] rounded-2xl border shadow-2xl p-1.5 overflow-hidden animate-in fade-in zoom-in duration-200', dark ? 'bg-neutral-900/95 backdrop-blur-xl border-white/10' : 'bg-white border-gray-200 shadow-xl')}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseLeave={() => setContextMenu(null)}
          >
            {[
              { label: 'Открыть', icon: Pencil, onClick: () => { setActiveNoteId(contextMenu.noteId); setContextMenu(null) } },
              { label: 'Экспорт .md', icon: Download, onClick: () => { const n = notes.find(x => x.id === contextMenu.noteId); if (n) exportMarkdown(n); setContextMenu(null) } },
              { label: 'Удалить', icon: Trash2, onClick: () => { deleteNote(contextMenu.noteId); setContextMenu(null) }, danger: true },
            ].map(item => (
              <button
                key={item.label}
                onClick={item.onClick}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left rounded-xl',
                  (item as any).danger ? 'text-red-400 hover:bg-red-500/10' : (dark ? 'text-neutral-300 hover:bg-white/5 hover:text-white' : 'text-gray-700 hover:bg-gray-50')
                )}
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </button>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  )
}
