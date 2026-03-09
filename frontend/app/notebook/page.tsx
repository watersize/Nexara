'use client'

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { jsPDF } from 'jspdf'
import { useTheme } from 'next-themes'
import { ChevronLeft, Grid3x3, Layers3, MoveRight, NotebookPen, PenTool, Plus, Trash, Type, ZoomIn, ZoomOut, Copy, Trash2, Pencil, MousePointer2, Ruler, Workflow, Circle, Square, Type as TypeIcon } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AppShell } from '@/components/app-shell'
import { getLassoBox, getSnapGuides, HybridObjectWrapper, resolveLassoSelection } from '@/components/notebook/hybrid-object-wrapper'
import type { HybridObject, HybridPoint, LassoSelection, NoteFolder } from '@/components/notebook/types'
export type ToolKind = 'select' | 'text' | 'image' | 'cad' | 'stroke' | 'table' | 'diagram'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const PREFIX = '__VEYO_HYBRID_NOTE__::'
const MIN = 44

type Point = HybridPoint
type NoteObject = HybridObject

type NoteDoc = {
  version: number
  title: string
  folderId?: string
  prefs: { dims: boolean; snap: boolean }
  objects: NoteObject[]
}

type NoteRecord = { id: string; title: string; topic: string; createdAt: string; updatedAt: string; doc: NoteDoc }

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`
const sortObjects = (objects: NoteObject[]) => [...objects].sort((a, b) => a.z - b.z)
const snap = (value: number, isometric = false) => Math.round(value / (isometric ? 24 : 20)) * (isometric ? 24 : 20)

const svgImage = (kind: 'book' | 'diagram') => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(kind === 'book' ? `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" rx="28" fill="#eef2fb"/><rect x="40" y="44" width="560" height="328" rx="20" fill="#fff" stroke="#adc0e7" stroke-width="3"/><line x1="84" y1="106" x2="548" y2="106" stroke="#b7c8e5" stroke-width="2"/><line x1="84" y1="154" x2="548" y2="154" stroke="#d0dbef" stroke-width="2"/><line x1="84" y1="202" x2="548" y2="202" stroke="#d0dbef" stroke-width="2"/><line x1="84" y1="250" x2="548" y2="250" stroke="#d0dbef" stroke-width="2"/><circle cx="496" cy="232" r="38" fill="none" stroke="#4c74ff" stroke-width="6"/><path d="M184 302 C242 258 318 258 376 304" fill="none" stroke="#23324a" stroke-width="5"/></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="240"><rect width="420" height="240" rx="24" fill="#0d1628"/><rect x="36" y="34" width="118" height="54" rx="16" fill="#162544" stroke="#82a8ff"/><rect x="244" y="34" width="136" height="54" rx="16" fill="#0f2231" stroke="#93ffd1"/><rect x="136" y="146" width="148" height="54" rx="16" fill="#251b31" stroke="#ffd87e"/><path d="M154 61 H244" stroke="#82a8ff" stroke-width="3" stroke-dasharray="8 6"/><path d="M210 88 V146" stroke="#ffd87e" stroke-width="3"/></svg>`)}`

const stripHtml = (html: string) => typeof window === 'undefined' ? html : ((node) => ((node.innerHTML = html || ''), (node.textContent || '').replace(/\s+/g, ' ').trim()))(document.createElement('div'))

const parseDoc = (raw: string, title: string, fallbackFolderId?: string): NoteDoc => {
  if (raw.startsWith(PREFIX)) {
    try { 
        const parsed = JSON.parse(raw.slice(PREFIX.length)) as NoteDoc
        return {
           ...parsed,
           folderId: parsed.folderId || fallbackFolderId
        }
    } catch {}
  }
  
  const text = stripHtml(raw).trim()
  return {
    version: 1,
    title,
    folderId: fallbackFolderId,
    prefs: { dims: true, snap: true },
    objects: [
      { id: makeId('text'), type: 'text', name: 'Text', x: 200, y: 200, w: 400, h: 200, rot: 0, z: 1, locked: false, visible: true, opacity: 1, fontSize: 16, text: text || 'Пустая заметка' },
    ],
  }
}

const createDoc = (title: string, folderId?: string): NoteDoc => ({
  version: 1,
  title,
  folderId,
  prefs: { dims: true, snap: true },
  objects: [
    { id: makeId('text'), type: 'text', name: 'Title', x: 72, y: 72, w: 600, h: 200, rot: 0, z: 1, locked: false, visible: true, opacity: 1, variant: 'title', fontSize: 48, text: `${title}` },
  ],
})

const serialize = (doc: NoteDoc) => `${PREFIX}${JSON.stringify(doc)}`
const snippet = (doc: NoteDoc) => {
  const text = doc.objects.filter((object) => object.type === 'text').map((object) => object.text || '').join(' ').trim()
  return text ? `${text.slice(0, 150)}${text.length > 150 ? '...' : ''}` : `CAD ${doc.objects.filter((object) => object.type === 'cad').length}, stroke ${doc.objects.filter((object) => object.type === 'stroke').length}`
}

const exportNotePdf = (note: NoteRecord, dark: boolean) => {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [700, 1040] })
  pdf.setFillColor(dark ? '#0b0d17' : '#f5f1e8')
  pdf.rect(0, 0, 1040, 700, 'F')
  sortObjects(note.doc.objects).filter((object) => object.visible).forEach((object) => {
    if (object.type === 'text') {
      pdf.setTextColor(dark ? '#f4f7ff' : '#182235')
      pdf.setFontSize(object.fontSize || (object.variant === 'title' ? 20 : 12))
      pdf.text(pdf.splitTextToSize(object.text || '', object.w * 0.7), object.x * 0.7, object.y * 0.7 + 20)
    }
    if (object.type === 'cad') {
      pdf.setDrawColor(object.stroke || '#86adff')
      object.dash ? pdf.setLineDashPattern([6, 4], 0) : pdf.setLineDashPattern([], 0)
      if (object.shape === 'circle') pdf.ellipse((object.x + object.w / 2) * 0.7, (object.y + object.h / 2) * 0.7, object.w * 0.25, object.h * 0.25)
      else pdf.roundedRect(object.x * 0.7, object.y * 0.7, object.w * 0.7, object.h * 0.7, 12, 12)
    }
  })
  pdf.save(`${note.title || 'hybrid-note'}.pdf`)
}

export default function NotebookPage() {
  const appState = useAppState()
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme !== 'light'
  const user = appState?.authSession ? { displayName: appState.authSession.display_name, email: appState.authSession.email } : undefined
  const palette = dark
    ? { page: '#0b0d17', shell: 'linear-gradient(180deg,#0d1221,#070910)', panel: 'rgba(14,18,31,.92)', soft: 'rgba(255,255,255,.045)', strong: 'rgba(18,23,39,.98)', border: 'rgba(173,190,255,.16)', text: '#f4f7ff', muted: 'rgba(244,247,255,.62)', accent: '#79a7ff', accentSoft: 'rgba(121,167,255,.12)', dim: '#ffd87e', ghost: 'rgba(121,167,255,.28)' }
    : { page: '#f5f1e8', shell: 'linear-gradient(180deg,#fff,#f1e8d8)', panel: 'rgba(255,252,248,.94)', soft: 'rgba(255,255,255,.72)', strong: 'rgba(255,255,255,.98)', border: 'rgba(73,82,108,.15)', text: '#182235', muted: 'rgba(24,34,53,.62)', accent: '#2b5cff', accentSoft: 'rgba(43,92,255,.12)', dim: '#a16a08', ghost: 'rgba(31,88,255,.2)' }
  
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [folders, setFolders] = useState<NoteFolder[]>([
    { id: 'all', name: 'Все заметки', color: '#ffffff' },
    { id: 'f1', name: 'Личные', color: '#79a7ff' },
    { id: 'f2', name: 'Работа', color: '#ff79a7' }
  ])
  const [activeFolderId, setActiveFolderId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState('')
  const [stage, setStage] = useState<'library' | 'editor'>('library')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [tool, setTool] = useState<ToolKind>('select')
  const [selectedId, setSelectedId] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [drawColor, setDrawColor] = useState('#ffd87e')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [imageUrl, setImageUrl] = useState('')
  const [tableDraft, setTableDraft] = useState('Layer,Role\nText,Readable\nTrace,Overlay\nCAD,Geometry')
  const [draft, setDraft] = useState({ shape: 'rectangle' as NoteObject['shape'], units: 'mm' as 'mm' | 'px', x: 620, y: 420, w: 220, h: 110, view: 'Side View', dash: false })
  const [tempStroke, setTempStroke] = useState<Point[]>([])
  const [lasso, setLasso] = useState<LassoSelection | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, noteId: string } | null>(null)
  const [scale, setScale] = useState(1)
  
  const deferredSearch = useDeferredValue(search)
  const stageRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<number | null>(null)
  const drawSessionRef = useRef<Point[]>([])
  const lassoRef = useRef<LassoSelection | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const rows = await tauriInvoke<any[]>('list_notes')
        const mapped = (Array.isArray(rows) ? rows : []).map((row) => ({
          id: String(row.id || makeId('note')),
          title: String(row.title || 'Hybrid note'),
          topic: String(row.topic || row.subject || 'Engineering canvas'),
          createdAt: String(row.created_at || row.updated_at || new Date().toISOString()),
          updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
          doc: parseDoc(String(row.content || ''), String(row.title || 'Hybrid note'), String(row.folder_id || '')),
        }))
        setNotes(mapped)
        if (mapped[0]) setActiveId(mapped[0].id)
      } catch (error) {
        toast.error('Failed to load workspace library', { description: error instanceof Error ? error.message : String(error) })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => () => {
    if (saveRef.current) window.clearTimeout(saveRef.current)
  }, [])

  const filtered = useMemo(() => {
     let result = [...notes].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
     if (activeFolderId !== 'all') {
         result = result.filter(note => note.doc.folderId === activeFolderId)
     }
     if (deferredSearch.trim()) {
         const term = deferredSearch.trim().toLowerCase()
         result = result.filter((note) => `${note.title} ${note.topic} ${snippet(note.doc)}`.toLowerCase().includes(term))
     }
     return result
  }, [notes, deferredSearch, activeFolderId])
  const active = notes.find((note) => note.id === activeId) || null
  const selected = active?.doc.objects.find((object) => object.id === selectedId) || null

  const persist = async (note: NoteRecord) =>
    tauriInvoke('save_note', { payload: { note: { id: note.id, title: note.title, topic: note.topic, content: serialize(note.doc), updated_at: note.updatedAt, created_at: note.createdAt } } })

  const patchNoteMeta = (title?: string, topic?: string) => {
    mutate((note) => ({ ...note, title: title ?? note.title, topic: topic ?? note.topic }))
  }

  const mutate = (producer: (note: NoteRecord) => NoteRecord) => {
    if (!active) return
    setNotes((current) =>
      current.map((note) => {
        if (note.id !== active.id) return note
        const next = { ...producer(note), updatedAt: new Date().toISOString() }
        if (saveRef.current) window.clearTimeout(saveRef.current)
        saveRef.current = window.setTimeout(() => void persist(next), 240)
        return next
      }),
    )
  }

  const patchObject = (objectId: string, producer: (object: NoteObject) => Partial<NoteObject>) => {
    mutate((note) => ({
      ...note,
      doc: {
        ...note.doc,
        objects: note.doc.objects.map((object) => (object.id === objectId ? { ...object, ...producer(object) } : object))
      }
    }))
  }

  const addObject = (object: NoteObject) => {
    mutate((note) => ({ ...note, doc: { ...note.doc, objects: [...note.doc.objects, object] } }))
    setSelectedId(object.id)
    setSelectedIds([object.id])
  }

  const selectObject = (objectId: string, additive = false) => {
    setSelectedId(objectId)
    setSelectedIds((current) => {
      if (!additive) return [objectId]
      return current.includes(objectId) ? current.filter((id) => id !== objectId) : [...current, objectId]
    })
  }

  const enterEditor = (noteId: string) => {
    setActiveId(noteId)
    setStage('editor')
  }

  const exitEditor = () => {
    setStage('library')
  }

  const createNote = async () => {
    const stamp = new Date().toISOString()
    const folder = activeFolderId !== 'all' ? activeFolderId : undefined
    const note: NoteRecord = { id: makeId('note'), title: `Новая заметка ${notes.length + 1}`, topic: 'Заметка', createdAt: stamp, updatedAt: stamp, doc: createDoc(`Новая заметка ${notes.length + 1}`, folder) }
    setNotes((current) => [note, ...current])
    setActiveId(note.id)
    setStage('editor')
    await persist(note).catch(() => {})
  }

  const removeNote = async () => {
    const targetId = contextMenu?.noteId || activeId
    if (!targetId) return
    await tauriInvoke('delete_note', { payload: { id: targetId } }).catch(() => {})
    setNotes((current) => current.filter((note) => note.id !== targetId))
    if (activeId === targetId) {
        setStage('library')
        setActiveId('')
    }
  }

  const stagePoint = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || !active) return null
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }

  const deleteSelectedObjects = () => {
    if (!active || !selectedIds.length) return
    mutate((note) => ({
      ...note,
      doc: { ...note.doc, objects: note.doc.objects.filter(o => !selectedIds.includes(o.id)) }
    }))
    setSelectedId('')
    setSelectedIds([])
  }

  const clearCanvas = () => {
    if (!active) return
    mutate((note) => ({
      ...note,
      doc: { ...note.doc, objects: [] }
    }))
    setSelectedId('')
    setSelectedIds([])
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedIds.length > 0) {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
        deleteSelectedObjects()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [active, selectedIds])

  const beginDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active || tool === 'select') {
      if (tool === 'select') {
         setSelectedId('')
         setSelectedIds([])
      }
      return
    }
    
    // Check if clicked element is the stage (empty space)
    if (event.target !== event.currentTarget) return

    const point = stagePoint(event.clientX, event.clientY)
    if (!point) return
    
    if (tool === 'stroke') {
      drawSessionRef.current = [point]
      setTempStroke([point])
    } else {
      const next = { active: true, start: point, current: point }
      lassoRef.current = next
      setLasso(next)
      setSelectedIds([])
      setSelectedId('')
    }
  }

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const point = stagePoint(event.clientX, event.clientY)
      if (!point) return
      if (drawSessionRef.current.length) {
        const next = [...drawSessionRef.current, point]
        drawSessionRef.current = next
        setTempStroke(next)
      }
      if (lassoRef.current?.active) {
        const next = { ...lassoRef.current, current: point }
        lassoRef.current = next
        setLasso(next)
      }
    }
    const handleUp = (event: PointerEvent) => {
      if (active && drawSessionRef.current.length >= 2) {
        const xs = drawSessionRef.current.map((point) => point.x)
        const ys = drawSessionRef.current.map((point) => point.y)
        const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(MIN, Math.max(...xs) - x), h = Math.max(MIN, Math.max(...ys) - y)
        addObject({ 
            id: makeId('stroke'), 
            type: 'stroke', 
            name: 'Штрих', 
            x, y, w, h, 
            rot: 0, 
            z: active.doc.objects.length + 2, 
            locked: false, 
            visible: true, 
            opacity: 1, 
            stroke: drawColor, 
            strokeWidth: strokeWidth,
            points: drawSessionRef.current.map((p) => ({ x: (p.x - x) / w, y: (p.y - y) / h })) 
        })
      } else if (active && lassoRef.current?.active) {
        const box = getLassoBox(lassoRef.current)
        const dist = Math.sqrt(Math.pow(lassoRef.current.start.x - lassoRef.current.current.x, 2) + Math.pow(lassoRef.current.start.y - lassoRef.current.current.y, 2))
        
        if (dist < 5) {
          // Click on empty space -> Create object based on tool
          if (tool === 'text') {
              addObject({ id: makeId('text'), type: 'text', name: 'Текст', x: lassoRef.current.start.x, y: lassoRef.current.start.y, w: 240, h: 48, rot: 0, z: active.doc.objects.length + 2, locked: false, visible: true, opacity: 1, text: '', fontSize: 16 })
          } else if (tool === 'cad') {
              addObject({ id: makeId('cad'), type: 'cad', name: 'Фигура', shape: 'rectangle', fill: '#86adff', stroke: '#2b5cff', x: lassoRef.current.start.x, y: lassoRef.current.start.y, w: 100, h: 100, rot: 0, z: active.doc.objects.length + 2, locked: false, visible: true, opacity: 1 })
          } else if (tool === 'diagram') {
              addObject({ id: makeId('diagram'), type: 'text', name: 'Узел', x: lassoRef.current.start.x, y: lassoRef.current.start.y, w: 150, h: 60, rot: 0, z: active.doc.objects.length + 2, locked: false, visible: true, opacity: 1, text: 'Новый узел\n(диаграмма)', fontSize: 14 })
          }
        } else {
          const ids = resolveLassoSelection(active.doc.objects, lassoRef.current)
          setSelectedId(ids[0] || '')
          setSelectedIds(ids)
        }
      }
      drawSessionRef.current = []
      setTempStroke([])
      lassoRef.current = null
      setLasso(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp) }
  }, [active, drawColor, tool])

  const addTextObject = () => active && addObject({ id: makeId('text'), type: 'text', name: 'Текст', x: 200, y: 200, w: 300, h: 100, rot: 0, z: active.doc.objects.length + 2, locked: false, visible: true, opacity: 1, text: 'Новая заметка', fontSize: 16 })

  return (
    <AppShell displayName={user?.displayName} email={user?.email} hideSidebar={stage === 'editor'}>
      <main className={cn("flex-1 h-screen overflow-hidden flex flex-col transition-all", stage === 'editor' ? "p-0" : "p-4 sm:p-6 xl:p-8")}>
        {stage === 'library' ? (
          <div className="flex-1 flex flex-col gap-6 max-w-7xl mx-auto w-full h-full overflow-hidden">
            <header className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold tracking-tight">Заметки</h1>
                <p className="text-muted-foreground mt-1">Все ваши идеи и чертежи в одном месте.</p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} className="rounded-xl">
                  {viewMode === 'grid' ? <Layers3 className="h-5 w-5" /> : <Grid3x3 className="h-5 w-5" />}
                </Button>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="rounded-xl gap-2 px-4 shadow-sm">
                        <Plus className="h-4 w-4" /> Папка
                    </Button>
                    <Button onClick={() => void createNote()} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-2 px-5 shadow-lg shadow-blue-500/20">
                        <Plus className="h-5 w-5" /> Заметка
                    </Button>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto scrollbar-none pb-12 pr-2">
              <section className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold px-2">Папки</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {folders.map(folder => (
                    <div 
                      key={folder.id} 
                      onClick={() => setActiveFolderId(folder.id)}
                      className={cn(
                        "group relative flex flex-col items-center gap-2 p-4 rounded-3xl border transition-all cursor-pointer",
                        activeFolderId === folder.id 
                          ? "bg-blue-500/10 border-blue-500/50" 
                          : "bg-neutral-900/40 border-white/5 hover:bg-neutral-800/60"
                      )}
                    >
                      <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5" style={{ color: folder.color }}>
                        <NotebookPen className="h-6 w-6" />
                      </div>
                      <span className="text-sm font-medium">{folder.name}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-12">
                <h2 className="text-xl font-semibold mb-6 px-2">
                   {activeFolderId === 'all' ? 'Все заметки' : folders.find(f => f.id === activeFolderId)?.name || 'Заметки'}
                </h2>
                <div className={cn(
                  "grid gap-4",
                  viewMode === 'grid' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1"
                )}>
                  {filtered.map((note) => (
                    <div 
                      key={note.id} 
                      onClick={() => enterEditor(note.id)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id })
                      }}
                      className="group relative flex flex-col overflow-hidden rounded-3xl bg-neutral-900/40 border border-white/5 hover:border-blue-500/50 hover:bg-neutral-800/60 hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-all cursor-pointer min-h-[140px]"
                    >
                      <div className="flex-1 p-5 lg:p-6 flex flex-col">
                        <div className="flex items-start justify-between">
                            <h3 className="text-xl lg:text-2xl font-bold leading-tight line-clamp-1">{note.title}</h3>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id }); removeNote(); }}
                                className="h-8 w-8 rounded-full bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500/20"
                            >
                                <Trash className="h-4 w-4" />
                            </button>
                        </div>
                        <p className="text-[10px] lg:text-xs uppercase tracking-widest text-muted-foreground mt-2 lg:mt-3 opacity-60">
                          {format(new Date(note.updatedAt), 'd MMM yyyy, HH:mm', { locale: ru })} <span className="mx-2">•</span> {note.topic || 'Заметка'}
                        </p>
                        <div className="mt-4 lg:mt-6 text-sm text-neutral-400 line-clamp-2 leading-relaxed preview-text opacity-80 mix-blend-screen group-hover:opacity-100 group-hover:text-neutral-300 transition-colors">
                          {snippet(note.doc) || 'Нет содержимого'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex-1 h-full w-full relative bg-[#0b0d17] overflow-hidden flex flex-col">
            {/* Command Bar */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1 p-1 bg-neutral-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
              <Button variant="ghost" size="icon" onClick={exitEditor} className="rounded-xl h-10 w-10 text-neutral-400 hover:text-white">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="w-px h-6 bg-white/10 mx-1" />
              {/* Tools */}
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant={(tool === 'cad' || tool === 'diagram' || tool === 'text') ? 'secondary' : 'ghost'} 
                      size="sm" 
                      className={cn("rounded-xl gap-2 px-3 h-10 transition-all text-neutral-400 hover:bg-white/5 data-[state=open]:bg-white/10", (tool === 'cad' || tool === 'diagram' || tool === 'text') && "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20 max-w-[120px]")}
                    >
                      {tool === 'cad' ? <Ruler className="h-4 w-4 shrink-0" /> : tool === 'diagram' ? <Workflow className="h-4 w-4 shrink-0" /> : tool === 'text' ? <TypeIcon className="h-4 w-4 shrink-0" /> : <Plus className="h-4 w-4 shrink-0" />}
                      <span className="text-xs font-medium truncate shrink">Создать</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="rounded-xl border-white/10 bg-neutral-900/95 backdrop-blur-xl">
                      <DropdownMenuItem className="gap-2" onClick={() => {setTool('cad'); addObject({ id: makeId('cad'), type: 'cad', name: 'Прямоугольник', shape: 'rectangle', fill: '#86adff', stroke: '#2b5cff', x: window.innerWidth/2, y: window.innerHeight/2, w: 100, h: 100, rot: 0, z: active?.doc.objects.length || 0 + 2, locked: false, visible: true, opacity: 1 })}}>
                        <Square className="h-4 w-4" />Прямоугольник
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2" onClick={() => {setTool('cad'); addObject({ id: makeId('cad'), type: 'cad', name: 'Круг', shape: 'circle', fill: '#86adff', stroke: '#2b5cff', x: window.innerWidth/2, y: window.innerHeight/2, w: 100, h: 100, rot: 0, z: active?.doc.objects.length || 0 + 2, locked: false, visible: true, opacity: 1 })}}>
                        <Circle className="h-4 w-4" />Круг
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2" onClick={() => {setTool('text'); addObject({ id: makeId('text'), type: 'text', name: 'Текст', x: window.innerWidth/2, y: window.innerHeight/2, w: 240, h: 48, rot: 0, z: active?.doc.objects.length || 0 + 2, locked: false, visible: true, opacity: 1, text: '', fontSize: 16 })}}>
                        <TypeIcon className="h-4 w-4" />Текст
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2" onClick={() => {setTool('diagram'); addObject({ id: makeId('diagram'), type: 'text', name: 'Узел', x: window.innerWidth/2, y: window.innerHeight/2, w: 150, h: 60, rot: 0, z: active?.doc.objects.length || 0 + 2, locked: false, visible: true, opacity: 1, text: 'Узел', fontSize: 14 })}}>
                        <Workflow className="h-4 w-4" />Узел диаграммы
                      </DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>

              {[
                { id: 'select', icon: MousePointer2, label: 'Выделение' },
                { id: 'stroke', icon: PenTool, label: 'Рисовать' },
              ].map(item => (
                <Button 
                  key={item.id}
                  variant={tool === item.id ? 'secondary' : 'ghost'} 
                  size="sm" 
                  onClick={() => setTool((item.id) as ToolKind)}
                  className={cn("rounded-xl gap-2 px-3 h-10 transition-all", tool === item.id ? "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20" : "text-neutral-400 hover:bg-white/5")}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="text-xs font-medium shrink">{item.label}</span>
                </Button>
              ))}
              <div className="w-px h-6 bg-white/10 mx-1" />
              <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="rounded-xl h-10 w-10 text-neutral-400 hover:text-white"><ZoomOut className="h-4 w-4" /></Button>
              <div className="px-2 text-xs font-medium text-neutral-400 w-[4rem] text-center">{Math.round(scale * 100)}%</div>
              <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.min(5, s + 0.1))} className="rounded-xl h-10 w-10 text-neutral-400 hover:text-white"><ZoomIn className="h-4 w-4" /></Button>
              <Button variant="ghost" onClick={clearCanvas} className="rounded-xl gap-2 px-3 h-10 text-red-400 hover:bg-red-500/10 hover:text-red-300 ml-1">Очистить</Button>
            </div>

            {/* Top Left Title and Topic */}
            <div className="absolute top-6 left-6 z-[100] pointer-events-auto">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex flex-col items-start gap-1 p-4 rounded-2xl bg-neutral-900/60 backdrop-blur border border-white/5 shadow-xl hover:bg-neutral-800/80 transition-colors text-left max-w-[280px]">
                    <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold shrink-0">Заметка</div>
                    <div className="text-xl font-bold text-white leading-tight truncate w-full">{active?.title || 'Без названия'}</div>
                    <div className="text-sm text-neutral-400 truncate w-full">{active?.topic || 'Без темы'}</div>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 rounded-2xl border-white/10 bg-neutral-900/95 backdrop-blur-xl p-4 shadow-2xl">
                  <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Название</label>
                        <Input value={active?.title || ''} onChange={(e) => patchNoteMeta(e.target.value, undefined)} className="h-10 bg-black/20 border-white/10 text-base font-medium text-white focus-visible:ring-1 focus-visible:ring-blue-500" placeholder="Название заметки" autoFocus />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Тема</label>
                        <Input value={active?.topic || ''} onChange={(e) => patchNoteMeta(undefined, e.target.value)} className="h-10 bg-black/20 border-white/10 text-sm text-neutral-300 focus-visible:ring-1 focus-visible:ring-blue-500" placeholder="Общая тема или тег" />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Left Inspector Panel */}
            {selected && (
              <div className="absolute left-6 top-1/2 -translate-y-1/2 z-[100] w-64 bg-neutral-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl space-y-6">
                <div>
                  <h4 className="text-xs uppercase tracking-widest text-neutral-500 font-bold mb-4">Свойства</h4>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-neutral-400 uppercase font-bold">Наименование</label>
                      <Input value={selected.name} onChange={(e) => patchObject(selected.id, o => ({name: e.target.value}))} className="bg-white/5 border-white/10 rounded-xl h-9 text-sm focus:ring-1 focus:ring-blue-500" />
                    </div>
                    {selected.type === 'stroke' && (
                      <div className="space-y-3">
                        <label className="text-[10px] text-neutral-400 uppercase font-bold">Стиль линии</label>
                        <div className="flex gap-2">
                          {['#ffd87e', '#ff79a7', '#79a7ff', '#9bffd9', '#ffffff'].map(c => (
                            <button key={c} onClick={() => patchObject(selected.id, o => ({stroke: c}))} className={cn("w-7 h-7 rounded-full border-2 border-transparent transition-all", selected.stroke === c ? "border-blue-500 scale-110" : "hover:scale-105")} style={{background: c}} />
                          ))}
                        </div>
                        <Input type="range" min="1" max="20" value={selected.strokeWidth || 4} onChange={(e) => patchObject(selected.id, o => ({strokeWidth: Number(e.target.value)}))} />
                      </div>
                    )}
                    {selected.type === 'text' && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-neutral-400 uppercase font-bold">Размер шрифта</label>
                            <Input type="number" value={Math.round(selected.fontSize || 16)} onChange={(e) => patchObject(selected.id, o => ({fontSize: Number(e.target.value)}))} className="bg-white/5 border-white/10 rounded-xl h-9 text-sm" />
                        </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Canvas Stage */}
            <div 
              ref={stageRef} 
              onPointerDown={beginDraw}
              onWheel={(e) => {
                  if (e.ctrlKey) {
                      e.preventDefault()
                      setScale(s => Math.max(0.1, Math.min(5, s - e.deltaY * 0.005)))
                  }
              }}
              className="flex-1 w-full h-full cursor-crosshair overflow-hidden touch-none"
              style={{ background: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)`, backgroundSize: `${32 * scale}px ${32 * scale}px` }}
            >
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: '100%', height: '100%' }}>
              {active && sortObjects(active.doc.objects).filter(o => o.visible).map(object => (
                <HybridObjectWrapper
                  key={object.id}
                  object={object}
                  selected={selectedId === object.id}
                  multiSelected={selectedIds.includes(object.id)}
                  showDimensions={active.doc.prefs.dims}
                  scale={1}
                  accent="#3b82f6"
                  border="rgba(255,255,255,0.1)"
                  panel="#171717"
                  dim="#64748b"
                  onSelect={selectObject}
                  onTransform={(id, patch) => patchObject(id, () => patch)}
                >
                  {object.type === 'text' ? (
                    <div className="absolute inset-0 pointer-events-auto">
                      <textarea
                        value={object.text}
                        onChange={(e) => patchObject(object.id, o => ({text: e.target.value}))}
                        className="w-full h-full bg-transparent border-none outline-none resize-none p-2 leading-relaxed text-left"
                        style={{ fontSize: (object.fontSize || 16), color: '#f4f7ff' }}
                        autoFocus
                      />
                    </div>
                  ) : null}
                  {object.type === 'image' && <img src={object.src} className="w-full h-full object-contain pointer-events-none" />}
                </HybridObjectWrapper>
              ))}

              {lasso && (() => {
                const box = getLassoBox(lasso);
                return <div className="absolute border-2 border-blue-500 bg-blue-500/5 pointer-events-none z-[100] rounded-lg" style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }} />
              })()}

              {tempStroke.length > 1 && (
                <svg className="absolute top-0 left-0 overflow-visible pointer-events-none z-[90]">
                   <polyline points={tempStroke.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={drawColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              </div>
            </div>

            {/* Layers Panel Bottom */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[100] h-12 flex items-center gap-1 p-1 bg-neutral-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
              <div className="px-4 text-xs font-bold uppercase tracking-widest text-neutral-500">Слои ({active?.doc.objects.length})</div>
              <div className="w-px h-6 bg-white/10 mx-1" />
              <div className="flex items-center -space-x-1 pr-2">
                {active && sortObjects(active.doc.objects).slice(-6).map((o, i) => (
                  <div 
                    key={o.id} 
                    onClick={() => selectObject(o.id)}
                    className={cn(
                        "w-8 h-8 rounded-full border-2 border-neutral-900 bg-neutral-800 flex items-center justify-center text-[10px] font-bold cursor-pointer hover:scale-110 transition-transform",
                        selectedId === o.id && "bg-blue-600 border-blue-400"
                    )} 
                    style={{ zIndex: 10 - i }}
                  >
                    {o.type[0].toUpperCase()}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Global Context Menu */}
        {contextMenu && (
          <div 
            className="fixed z-[1000] min-w-[200px] bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-1.5 overflow-hidden animate-in fade-in zoom-in duration-200" 
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseLeave={() => setContextMenu(null)}
          >
            {[
              { label: 'Редактировать', icon: Pencil, onClick: () => enterEditor(contextMenu.noteId) },
              { label: 'Переименовать', icon: Type, onClick: () => {} },
              { label: 'Дублировать', icon: Copy, onClick: () => {} },
              { label: 'Переместить', icon: MoveRight, onClick: () => {} },
              { label: 'Удалить', icon: Trash2, onClick: () => { setContextMenu(null); removeNote(); }, danger: true },
            ].map(item => (
              <button 
                key={item.label} 
                onClick={item.onClick} 
                className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left rounded-xl",
                    item.danger ? "text-red-400 hover:bg-red-500/10" : "text-neutral-300 hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  )
}
