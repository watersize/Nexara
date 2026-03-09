'use client'

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { jsPDF } from 'jspdf'
import { useTheme } from 'next-themes'
import { Eye, EyeOff, FileOutput, Ghost, Grid3x3, ImagePlus, Layers3, Lock, NotebookPen, PenTool, Plus, Ruler, Search, Sparkles, Table2, Unlock, Workflow } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { getLassoBox, getSnapGuides, HybridObjectWrapper, resolveLassoSelection } from '@/components/notebook/hybrid-object-wrapper'
import type { HybridObject, HybridPoint, LassoSelection } from '@/components/notebook/types'
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
  canvas: { w: number; h: number }
  prefs: { grid: 'off' | 'orthographic' | 'isometric'; dims: boolean; dimMode: boolean; ghost: boolean }
  objects: NoteObject[]
}

type NoteRecord = { id: string; title: string; topic: string; createdAt: string; updatedAt: string; doc: NoteDoc }

const codeSnippet = `export function SelectableCadObject({ object, selected, showDimensions, onResize, onDimensionInput }) {
  return (
    <div style={{ left: object.x, top: object.y, width: object.w, height: object.h }}>
      <CadShapeSvg object={object} />
      {selected ? <BoundingHandles onResize={onResize} /> : null}
      {selected && showDimensions ? <DimensionLines valueX={object.w} valueY={object.h} onInput={onDimensionInput} /> : null}
    </div>
  )
}`

const hierarchy = [
  'AppShell -> fixed workspace chrome',
  'NotebookPage -> note selection, preview stage, editor state',
  'Preview pane -> second-click transition into editor',
  'Shared object canvas -> text, trace, images, CAD, tables',
  'Layers panel -> visibility, locking, z-index awareness',
  'Rust bridge -> geometry solving and vector PDF export',
]

const syncNotes = [
  'Text blocks and drawings share one ordered object array.',
  'Trace strokes sit above or below text by z-index, not by separate DOM trees.',
  'The same serialized document can be consumed by Rust for dimension recompute.',
]

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`
const sortObjects = (objects: NoteObject[]) => [...objects].sort((a, b) => a.z - b.z)
const snap = (value: number, isometric = false) => Math.round(value / (isometric ? 24 : 20)) * (isometric ? 24 : 20)

const svgImage = (kind: 'book' | 'diagram') => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(kind === 'book' ? `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" rx="28" fill="#eef2fb"/><rect x="40" y="44" width="560" height="328" rx="20" fill="#fff" stroke="#adc0e7" stroke-width="3"/><line x1="84" y1="106" x2="548" y2="106" stroke="#b7c8e5" stroke-width="2"/><line x1="84" y1="154" x2="548" y2="154" stroke="#d0dbef" stroke-width="2"/><line x1="84" y1="202" x2="548" y2="202" stroke="#d0dbef" stroke-width="2"/><line x1="84" y1="250" x2="548" y2="250" stroke="#d0dbef" stroke-width="2"/><circle cx="496" cy="232" r="38" fill="none" stroke="#4c74ff" stroke-width="6"/><path d="M184 302 C242 258 318 258 376 304" fill="none" stroke="#23324a" stroke-width="5"/></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="240"><rect width="420" height="240" rx="24" fill="#0d1628"/><rect x="36" y="34" width="118" height="54" rx="16" fill="#162544" stroke="#82a8ff"/><rect x="244" y="34" width="136" height="54" rx="16" fill="#0f2231" stroke="#93ffd1"/><rect x="136" y="146" width="148" height="54" rx="16" fill="#251b31" stroke="#ffd87e"/><path d="M154 61 H244" stroke="#82a8ff" stroke-width="3" stroke-dasharray="8 6"/><path d="M210 88 V146" stroke="#ffd87e" stroke-width="3"/></svg>`)}`

const stripHtml = (html: string) => typeof window === 'undefined' ? html : ((node) => ((node.innerHTML = html || ''), (node.textContent || '').replace(/\s+/g, ' ').trim()))(document.createElement('div'))

function createDoc(title: string): NoteDoc {
  return {
    canvas: { w: 1180, h: 900 },
    prefs: { grid: 'orthographic', dims: true, dimMode: true, ghost: true },
    objects: [
      { id: makeId('text'), type: 'text', name: 'Title', x: 72, y: 72, w: 390, h: 120, rot: 0, z: 1, locked: false, visible: true, opacity: 1, variant: 'title', text: `${title}\nHybrid note-taking board with text, trace and CAD.` },
      { id: makeId('body'), type: 'text', name: 'Body', x: 74, y: 224, w: 410, h: 160, rot: 0, z: 2, locked: false, visible: true, opacity: 1, variant: 'body', text: 'All elements are objects. Draw over text, resize technical shapes, and keep one source of truth for preview, editor and PDF export.' },
      { id: makeId('img'), type: 'image', name: 'Reference trace', x: 560, y: 82, w: 500, h: 306, rot: 0, z: 3, locked: false, visible: true, opacity: 1, src: svgImage('book'), caption: 'Ghost trace', traceable: true },
      { id: makeId('cad'), type: 'cad', name: 'Side View', x: 632, y: 454, w: 240, h: 106, rot: 0, z: 4, locked: false, visible: true, opacity: 1, shape: 'rectangle', units: 'mm', stroke: '#86adff', fill: 'rgba(98,147,255,.14)', view: 'Side View' },
      { id: makeId('cad'), type: 'cad', name: 'Top View', x: 928, y: 442, w: 128, h: 128, rot: 0, z: 5, locked: false, visible: true, opacity: 1, shape: 'circle', units: 'mm', stroke: '#9bffd9', fill: 'rgba(86,214,170,.12)', dash: true, view: 'Top View' },
      { id: makeId('stroke'), type: 'stroke', name: 'Trace', x: 718, y: 178, w: 216, h: 132, rot: -5, z: 6, locked: false, visible: true, opacity: 1, stroke: '#ffd87e', points: [{ x: 0.02, y: 0.42 }, { x: 0.18, y: 0.22 }, { x: 0.48, y: 0.1 }, { x: 0.78, y: 0.46 }, { x: 0.98, y: 0.8 }] },
      { id: makeId('table'), type: 'table', name: 'Layers', x: 82, y: 462, w: 430, h: 202, rot: 0, z: 7, locked: false, visible: true, opacity: 1, cells: [['Layer', 'Role'], ['Text', 'Readable content'], ['Trace', 'Annotations'], ['CAD', 'Geometry']] },
    ],
  }
}

const parseDoc = (raw: string, title: string) => {
  if (raw.startsWith(PREFIX)) {
    try { return JSON.parse(raw.slice(PREFIX.length)) as NoteDoc } catch {}
  }
  const doc = createDoc(title)
  doc.objects.push({ id: makeId('legacy'), type: 'text', name: 'Legacy', x: 76, y: 708, w: 520, h: 124, rot: 0, z: 9, locked: false, visible: true, opacity: 1, variant: 'body', text: stripHtml(raw) || 'Legacy note migrated into object mode.' })
  return doc
}

const serialize = (doc: NoteDoc) => `${PREFIX}${JSON.stringify(doc)}`
const snippet = (doc: NoteDoc) => {
  const text = doc.objects.filter((object) => object.type === 'text').map((object) => object.text || '').join(' ').trim()
  return text ? `${text.slice(0, 150)}${text.length > 150 ? '...' : ''}` : `CAD ${doc.objects.filter((object) => object.type === 'cad').length}, trace ${doc.objects.filter((object) => object.type === 'stroke').length}`
}

const exportNotePdf = (note: NoteRecord, dark: boolean) => {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [700, 1040] })
  pdf.setFillColor(dark ? '#0b0d17' : '#f5f1e8')
  pdf.rect(0, 0, 1040, 700, 'F')
  sortObjects(note.doc.objects).filter((object) => object.visible).forEach((object) => {
    if (object.type === 'text') {
      pdf.setTextColor(dark ? '#f4f7ff' : '#182235')
      pdf.setFontSize(object.variant === 'title' ? 20 : 12)
      pdf.text(pdf.splitTextToSize(object.text || '', object.w * 0.7), object.x * 0.7, object.y * 0.7 + 20)
    }
    if (object.type === 'cad') {
      pdf.setDrawColor(object.stroke || '#86adff')
      object.dash ? pdf.setLineDashPattern([6, 4], 0) : pdf.setLineDashPattern([], 0)
      if (object.shape === 'circle') pdf.ellipse((object.x + object.w / 2) * 0.7, (object.y + object.h / 2) * 0.7, object.w * 0.25, object.h * 0.25)
      else pdf.roundedRect(object.x * 0.7, object.y * 0.7, object.w * 0.7, object.h * 0.7, 12, 12)
      if (note.doc.prefs.dims) {
        pdf.setTextColor('#d39b2c')
        pdf.setFontSize(10)
        pdf.text(`${Math.round(object.w)}${object.units}`, (object.x + object.w / 2) * 0.7, (object.y - 12) * 0.7, { align: 'center' })
      }
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
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState('')
  const [stage, setStage] = useState<'preview' | 'editor'>('preview')
  const [tool, setTool] = useState<'text' | 'draw' | 'table' | 'diagram' | 'drafting' | 'dimensions'>('drafting')
  const [selectedId, setSelectedId] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [drawColor, setDrawColor] = useState('#ffd87e')
  const [imageUrl, setImageUrl] = useState('')
  const [tableDraft, setTableDraft] = useState('Layer,Role\nText,Readable\nTrace,Overlay\nCAD,Geometry')
  const [draft, setDraft] = useState({ shape: 'rectangle' as NoteObject['shape'], units: 'mm' as 'mm' | 'px', x: 620, y: 420, w: 220, h: 110, view: 'Side View', dash: false })
  const [tempStroke, setTempStroke] = useState<Point[]>([])
  const [lasso, setLasso] = useState<LassoSelection | null>(null)
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
          doc: parseDoc(String(row.content || ''), String(row.title || 'Hybrid note')),
        }))
        setNotes(mapped)
        setActiveId(mapped[0]?.id || '')
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

  const filtered = useMemo(() => [...notes].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).filter((note) => `${note.title} ${note.topic} ${snippet(note.doc)}`.toLowerCase().includes(deferredSearch.trim().toLowerCase())), [notes, deferredSearch])
  const active = notes.find((note) => note.id === activeId) || filtered[0] || null
  const selected = active?.doc.objects.find((object) => object.id === selectedId) || null

  useEffect(() => {
    if (!active) {
      setSelectedId('')
      setSelectedIds([])
      return
    }
    if (!active.doc.objects.some((object) => object.id === selectedId)) {
      const fallbackId = active.doc.objects[0]?.id || ''
      setSelectedId(fallbackId)
      setSelectedIds(fallbackId ? [fallbackId] : [])
    }
    setSelectedIds((current) => current.filter((id) => active.doc.objects.some((object) => object.id === id)))
  }, [active, selectedId])

  const persist = async (note: NoteRecord) =>
    tauriInvoke('save_note', { payload: { note: { id: note.id, title: note.title, topic: note.topic, content: serialize(note.doc), updated_at: note.updatedAt, created_at: note.createdAt } } })

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

  const patchObject = (objectId: string, producer: (object: NoteObject) => NoteObject) => mutate((note) => ({ ...note, doc: { ...note.doc, objects: note.doc.objects.map((object) => (object.id === objectId ? producer(object) : object)) } }))
  const patchPrefs = (producer: (prefs: NoteDoc['prefs']) => NoteDoc['prefs']) => mutate((note) => ({ ...note, doc: { ...note.doc, prefs: producer(note.doc.prefs) } }))
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

  const transformSelection = (objectId: string, patch: Partial<NoteObject>) => {
    if (!active) return
    const anchor = active.doc.objects.find((object) => object.id === objectId)
    if (!anchor) return
    const targets = selectedIds.includes(objectId) ? selectedIds : [objectId]
    const delta = {
      x: patch.x === undefined ? 0 : patch.x - anchor.x,
      y: patch.y === undefined ? 0 : patch.y - anchor.y,
      w: patch.w === undefined ? 0 : patch.w - anchor.w,
      h: patch.h === undefined ? 0 : patch.h - anchor.h,
      rot: patch.rot === undefined ? 0 : patch.rot - anchor.rot,
    }

    mutate((note) => ({
      ...note,
      doc: {
        ...note.doc,
        objects: note.doc.objects.map((object) => {
          if (!targets.includes(object.id) || object.locked) return object
          const next = {
            ...object,
            x: patch.x === undefined ? object.x : object.x + delta.x,
            y: patch.y === undefined ? object.y : object.y + delta.y,
            w: patch.w === undefined ? object.w : Math.max(MIN, object.w + delta.w),
            h: patch.h === undefined ? object.h : Math.max(MIN, object.h + delta.h),
            rot: patch.rot === undefined ? object.rot : object.rot + delta.rot,
          }
          if (note.doc.prefs.grid !== 'off') {
            next.x = snap(next.x, note.doc.prefs.grid === 'isometric')
            next.y = snap(next.y, note.doc.prefs.grid === 'isometric')
          }
          return next
        }),
      },
    }))
  }

  const createNote = async () => {
    const stamp = new Date().toISOString()
    const note: NoteRecord = { id: makeId('note'), title: `Hybrid note ${notes.length + 1}`, topic: 'Engineering canvas', createdAt: stamp, updatedAt: stamp, doc: createDoc(`Hybrid note ${notes.length + 1}`) }
    setNotes((current) => [note, ...current])
    startTransition(() => {
      const firstId = note.doc.objects[0]?.id || ''
      setActiveId(note.id)
      setStage('preview')
      setSelectedId(firstId)
      setSelectedIds(firstId ? [firstId] : [])
    })
    await persist(note).catch(() => {})
  }

  const removeNote = async () => {
    if (!active) return
    await tauriInvoke('delete_note', { payload: { id: active.id } }).catch(() => {})
    setNotes((current) => current.filter((note) => note.id !== active.id))
    setStage('preview')
    setSelectedIds([])
  }

  const stagePoint = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || !active) return null
    return { x: Math.max(0, Math.min(active.doc.canvas.w, clientX - rect.left)), y: Math.max(0, Math.min(active.doc.canvas.h, clientY - rect.top)) }
  }

  const beginDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return
    const point = stagePoint(event.clientX, event.clientY)
    if (!point) return
    if (tool !== 'draw') {
      const next = { active: true, start: point, current: point }
      lassoRef.current = next
      setLasso(next)
      setSelectedIds([])
      setSelectedId('')
      return
    }
    drawSessionRef.current = [point]
    setTempStroke([point])
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
    const handleUp = () => {
      if (active && drawSessionRef.current.length >= 2) {
        const xs = drawSessionRef.current.map((point) => point.x)
        const ys = drawSessionRef.current.map((point) => point.y)
        const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(MIN, Math.max(...xs) - x), h = Math.max(MIN, Math.max(...ys) - y)
        addObject({ id: makeId('stroke'), type: 'stroke', name: 'Trace', x, y, w, h, rot: 0, z: active.doc.objects.length + 2, locked: false, visible: true, opacity: 1, stroke: drawColor, points: drawSessionRef.current.map((point) => ({ x: (point.x - x) / w, y: (point.y - y) / h })) })
      }
      drawSessionRef.current = []
      setTempStroke([])

      if (active && lassoRef.current?.active) {
        const ids = resolveLassoSelection(active.doc.objects, lassoRef.current)
        setSelectedId(ids[0] || '')
        setSelectedIds(ids)
      }
      lassoRef.current = null
      setLasso(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp) }
  }, [active, drawColor, tool])

  const addText = (variant: NoteObject['variant']) =>
    active &&
    addObject({ id: makeId('text'), type: 'text', name: variant === 'title' ? 'Title' : variant === 'callout' ? 'Callout' : 'Text', x: 120, y: 140 + active.doc.objects.length * 18, w: variant === 'body' ? 360 : 300, h: 120, rot: 0, z: active.doc.objects.length + 2, locked: false, visible: true, opacity: 1, variant, text: variant === 'title' ? 'New section\nAlign with drafting layer.' : variant === 'callout' ? 'Lock text before tracing.' : 'Editable paragraph object.' })

  const addImage = () => active && addObject({ id: makeId('img'), type: 'image', name: 'Reference asset', x: 560, y: 132, w: 420, h: 250, rot: 0, z: active.doc.objects.length + 2, locked: false, visible: true, opacity: 1, src: imageUrl.trim() || svgImage('book'), caption: 'Reference asset', traceable: true })
  const addTable = () => active && addObject({ id: makeId('table'), type: 'table', name: 'Object table', x: 110, y: 520, w: 400, h: 200, rot: 0, z: active.doc.objects.length + 2, locked: false, visible: true, opacity: 1, cells: tableDraft.split('\n').map((row) => row.split(',').map((cell) => cell.trim())).filter((row) => row.some(Boolean)) })
  const addDiagram = () => active && addObject({ id: makeId('cad'), type: 'cad', name: 'Diagram node', x: 630, y: 620, w: 188, h: 108, rot: 0, z: active.doc.objects.length + 2, locked: false, visible: true, opacity: 1, shape: 'polygon', units: 'px', stroke: '#ffd87e', fill: 'rgba(255,216,126,.12)', view: 'Diagram' })
  const addCad = () => active && addObject({ id: makeId('cad'), type: 'cad', name: draft.view, x: draft.x, y: draft.y, w: draft.w, h: draft.h, rot: 0, z: active.doc.objects.length + 2, locked: false, visible: true, opacity: 1, shape: draft.shape, units: draft.units, dash: draft.dash, stroke: '#86adff', fill: draft.shape === 'arc' ? 'transparent' : 'rgba(98,147,255,.12)', view: draft.view })
  const toolbarItems = [{ key: 'text', label: 'Text', icon: Plus }, { key: 'diagram', label: 'Diagram', icon: Workflow }, { key: 'table', label: 'Table', icon: Table2 }, { key: 'draw', label: 'Draw', icon: PenTool }, { key: 'drafting', label: 'Drafting', icon: Ruler }, { key: 'dimensions', label: 'Dimensions', icon: Eye }] as const
  const selectedSet = new Set(selectedIds)
  const selectedCad = active?.doc.objects.find((object) => object.id === selectedId && object.type === 'cad')
  const snapGuides = active && selectedCad ? getSnapGuides(active.doc.objects, selectedCad) : []

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="flex-1 p-4 sm:p-6 xl:p-8">
        <div className="min-h-[calc(100vh-3rem)] rounded-[34px] border p-4 sm:p-5 xl:p-6" style={{ background: palette.shell, borderColor: palette.border, color: palette.text }}>
          <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border" style={{ background: palette.accentSoft, borderColor: palette.border }}><NotebookPen className="h-5 w-5" style={{ color: palette.accent }} /></div>
                <div><div className="text-[11px] uppercase tracking-[0.28em]" style={{ color: palette.muted }}>veyo.ai professional workspace</div><h1 className="text-2xl font-semibold sm:text-3xl">Hybrid Knowledge Workspace</h1></div>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6" style={{ color: palette.muted }}>Two-stage opening, object canvas, annotation layer, dimensioning, snapping and Rust-ready vector PDF export.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex min-w-[260px] items-center gap-3 rounded-[20px] border px-4 py-3" style={{ background: palette.soft, borderColor: palette.border }}><Search className="h-4 w-4" style={{ color: palette.muted }} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes, sessions and objects" className="border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0" style={{ color: palette.text }} /></div>
              <Button onClick={() => void createNote()} className="h-12 rounded-[20px] px-5" style={{ background: palette.accent, color: dark ? '#08111f' : '#fff' }}><Plus className="h-4 w-4" />New workspace note</Button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="flex min-h-[760px] flex-col rounded-[30px] border p-4" style={{ background: palette.panel, borderColor: palette.border }}>
              <div className="mb-4 flex items-center justify-between"><div><div className="text-xs uppercase tracking-[0.24em]" style={{ color: palette.muted }}>Library</div><div className="mt-1 text-lg font-semibold">Knowledge Notes</div></div><div className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: palette.accentSoft, color: palette.accent }}>{filtered.length}</div></div>
              <div className="scrollbar-none flex-1 space-y-3 overflow-y-auto pr-1">
                {loading ? <div className="rounded-[24px] border px-4 py-8 text-sm" style={{ background: palette.soft, borderColor: palette.border, color: palette.muted }}>Loading workspace notes...</div> : filtered.map((note) => (
                  <button key={note.id} type="button" onClick={() => startTransition(() => { const firstId = note.doc.objects[0]?.id || ''; setActiveId(note.id); setStage('preview'); setSelectedId(firstId); setSelectedIds(firstId ? [firstId] : []) })} className={cn('w-full rounded-[28px] border p-4 text-left transition', note.id === active?.id ? 'translate-x-1' : 'hover:-translate-y-0.5')} style={{ minHeight: 154, background: note.id === active?.id ? palette.strong : palette.soft, borderColor: note.id === active?.id ? palette.accent : palette.border }}>
                    <div className="flex items-start justify-between gap-3"><div><div className="text-lg font-semibold">{note.title}</div><div className="mt-1 text-xs uppercase tracking-[0.16em]" style={{ color: palette.muted }}>{format(new Date(note.updatedAt), 'd MMM yyyy, HH:mm', { locale: ru })}</div></div><div className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ background: palette.accentSoft, color: palette.accent }}>{note.topic}</div></div>
                    <div className="mt-4 line-clamp-4 text-sm leading-6" style={{ color: palette.muted }}>{snippet(note.doc)}</div>
                  </button>
                ))}
              </div>
            </aside>
            {!active ? <div className="flex min-h-[760px] items-center justify-center rounded-[30px] border p-8 text-center text-sm" style={{ background: palette.panel, borderColor: palette.border, color: palette.muted }}>Select a workspace note from the library.</div> : stage === 'preview' ? (
              <div className="grid min-h-[760px] gap-4 rounded-[30px] border p-4 xl:grid-cols-[minmax(0,1fr)_320px]" style={{ background: palette.panel, borderColor: palette.border }}>
                <button type="button" onClick={() => setStage('editor')} className="flex min-h-[720px] flex-col rounded-[30px] border p-5 text-left transition hover:-translate-y-1" style={{ background: palette.strong, borderColor: palette.accent }}>
                  <div className="flex items-start justify-between gap-4">
                    <div><div className="text-xs uppercase tracking-[0.28em]" style={{ color: palette.muted }}>Preview pane</div><div className="mt-2 text-3xl font-semibold">{active.title}</div><div className="mt-3 max-w-2xl text-sm leading-6" style={{ color: palette.muted }}>Click preview to enter the full editor. The preview already reflects live objects, dimensions and lock state.</div></div>
                    <div className="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ background: palette.accentSoft, color: palette.accent }}>Enter Editor</div>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-4">{Object.entries({ text: active.doc.objects.filter((object) => object.type === 'text').length, cad: active.doc.objects.filter((object) => object.type === 'cad').length, trace: active.doc.objects.filter((object) => object.type === 'stroke').length, tables: active.doc.objects.filter((object) => object.type === 'table').length }).map(([key, value]) => <div key={key} className="rounded-[22px] border px-4 py-4" style={{ background: palette.soft, borderColor: palette.border }}><div className="text-xs uppercase tracking-[0.2em]" style={{ color: palette.muted }}>{key}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>)}</div>
                  <div className="relative mt-6 flex-1 overflow-hidden rounded-[28px] border" style={{ background: palette.page, borderColor: palette.border }}>{sortObjects(active.doc.objects).filter((object) => object.visible).map((object) => <div key={object.id} className="absolute rounded-[18px] border" style={{ left: object.x * 0.58, top: object.y * 0.58, width: object.w * 0.58, height: object.h * 0.58, borderColor: palette.border, background: object.type === 'cad' ? palette.accentSoft : object.type === 'image' ? palette.ghost : palette.soft }} />)}</div>
                </button>
                <div className="space-y-4">
                  {[hierarchy, syncNotes].map((list, index) => <div key={index} className="rounded-[24px] border p-4" style={{ background: palette.soft, borderColor: palette.border }}><div className="mb-3 text-xs uppercase tracking-[0.22em]" style={{ color: palette.muted }}>{index ? 'Drafting/Text Sync' : 'Component Hierarchy'}</div><div className="space-y-2">{list.map((item) => <div key={item} className="text-sm leading-6" style={{ color: palette.muted }}>{item}</div>)}</div></div>)}
                  <div className="rounded-[24px] border p-4" style={{ background: palette.soft, borderColor: palette.border }}><div className="mb-3 text-xs uppercase tracking-[0.22em]" style={{ color: palette.muted }}>Rust Pipeline</div><div className="text-sm leading-6" style={{ color: palette.muted }}><div>`solve_hybrid_geometry(document)`</div><div>`recompute_dimensions(document)`</div><div>`export_hybrid_note_pdf(document, theme)`</div></div></div>
                </div>
              </div>
            ) : (
              <div className="grid min-h-[760px] gap-4 rounded-[30px] border p-4 xl:grid-cols-[250px_minmax(0,1fr)_320px]" style={{ background: palette.panel, borderColor: palette.border }}>
                <div className="flex min-h-[720px] flex-col rounded-[28px] border p-3" style={{ background: palette.soft, borderColor: palette.border }}>
                  {tool === 'text' ? <div className="space-y-3"><Button className="justify-start rounded-[16px]" onClick={() => addText('title')}><Plus className="h-4 w-4" />Title block</Button><Button className="justify-start rounded-[16px]" onClick={() => addText('body')}><Plus className="h-4 w-4" />Documentation block</Button><Button className="justify-start rounded-[16px]" onClick={() => addText('callout')}><Sparkles className="h-4 w-4" />Callout</Button><Input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="Optional asset URL" /><Button className="justify-start rounded-[16px]" onClick={addImage}><ImagePlus className="h-4 w-4" />Insert reference asset</Button></div> : tool === 'draw' ? <div className="space-y-3"><Input type="color" value={drawColor} onChange={(event) => setDrawColor(event.target.value)} className="h-12" /><div className="rounded-[18px] border px-3 py-3 text-sm" style={{ background: palette.strong, borderColor: palette.border, color: palette.muted }}>Transparent annotation layer across the full canvas.</div></div> : tool === 'table' ? <div className="space-y-3"><textarea value={tableDraft} onChange={(event) => setTableDraft(event.target.value)} className="min-h-[180px] w-full rounded-[18px] border p-3 text-sm outline-none" style={{ background: palette.strong, borderColor: palette.border, color: palette.text }} /><Button className="justify-start rounded-[16px]" onClick={addTable}><Table2 className="h-4 w-4" />Insert table</Button></div> : tool === 'diagram' ? <div className="space-y-3"><Button className="justify-start rounded-[16px]" onClick={addDiagram}><Workflow className="h-4 w-4" />Insert diagram node</Button></div> : tool === 'dimensions' ? <div className="space-y-3"><div className="rounded-[18px] border px-3 py-3 text-sm" style={{ background: palette.strong, borderColor: palette.border, color: palette.muted }}>Dimension mode supports bidirectional resize through editable labels and grouped lasso selections.</div><Button className="justify-start rounded-[16px]" onClick={() => patchPrefs((prefs) => ({ ...prefs, dimMode: !prefs.dimMode }))}><Ruler className="h-4 w-4" />{active.doc.prefs.dimMode ? 'Switch to sketch mode' : 'Enable dimension mode'}</Button><Button className="justify-start rounded-[16px]" onClick={() => patchPrefs((prefs) => ({ ...prefs, dims: !prefs.dims }))}><Eye className="h-4 w-4" />{active.doc.prefs.dims ? 'Hide dimensions' : 'Show dimensions'}</Button></div> : <div className="space-y-3"><div className="grid grid-cols-2 gap-2">{(['rectangle', 'circle', 'arc', 'polygon'] as const).map((shape) => <button key={shape} type="button" onClick={() => setDraft((current) => ({ ...current, shape }))} className="rounded-[16px] border px-3 py-2 text-sm capitalize" style={{ background: draft.shape === shape ? palette.accentSoft : palette.strong, borderColor: draft.shape === shape ? palette.accent : palette.border, color: draft.shape === shape ? palette.accent : palette.text }}>{shape}</button>)}</div><div className="grid grid-cols-2 gap-2">{(['x', 'y', 'w', 'h'] as const).map((key) => <Input key={key} type="number" value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: Number(event.target.value || 0) }))} />)}</div><Input value={draft.view} onChange={(event) => setDraft((current) => ({ ...current, view: event.target.value }))} /><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setDraft((current) => ({ ...current, units: current.units === 'mm' ? 'px' : 'mm' }))} className="rounded-[16px] border px-3 py-2 text-sm" style={{ background: palette.strong, borderColor: palette.border, color: palette.text }}>Units: {draft.units}</button><button type="button" onClick={() => setDraft((current) => ({ ...current, dash: !current.dash }))} className="rounded-[16px] border px-3 py-2 text-sm" style={{ background: palette.strong, borderColor: palette.border, color: palette.text }}>Line: {draft.dash ? 'dashed' : 'solid'}</button></div><Button className="justify-start rounded-[16px]" onClick={addCad}><Ruler className="h-4 w-4" />Create drafting object</Button></div>}
                </div>
                <div className="flex min-h-[720px] flex-col gap-4">
                  <div className="rounded-[28px] border p-3" style={{ background: palette.soft, borderColor: palette.border }}>
                    <div className="flex flex-wrap gap-2">{toolbarItems.map((item) => { const Icon = item.icon; return <button key={item.key} type="button" onClick={() => setTool(item.key)} className="inline-flex items-center gap-2 rounded-[18px] border px-4 py-2 text-sm font-semibold" style={{ background: tool === item.key ? palette.accentSoft : palette.strong, color: tool === item.key ? palette.accent : palette.text, borderColor: tool === item.key ? palette.accent : palette.border }}><Icon className="h-4 w-4" />{item.label}</button> })}</div>
                    <div className="mt-3 flex flex-wrap gap-2">{[{ label: active.doc.prefs.dimMode ? 'Dimension Mode' : 'Sketch Mode', icon: Ruler, onClick: () => patchPrefs((prefs) => ({ ...prefs, dimMode: !prefs.dimMode })) }, { label: active.doc.prefs.dims ? 'Hide Dimensions' : 'Show Dimensions', icon: active.doc.prefs.dims ? Eye : EyeOff, onClick: () => patchPrefs((prefs) => ({ ...prefs, dims: !prefs.dims })) }, { label: active.doc.prefs.grid, icon: Grid3x3, onClick: () => patchPrefs((prefs) => ({ ...prefs, grid: prefs.grid === 'off' ? 'orthographic' : prefs.grid === 'orthographic' ? 'isometric' : 'off' })) }, { label: active.doc.prefs.ghost ? 'Ghost On' : 'Ghost Off', icon: Ghost, onClick: () => patchPrefs((prefs) => ({ ...prefs, ghost: !prefs.ghost })) }].map((item) => { const Icon = item.icon; return <button key={item.label} type="button" onClick={item.onClick} className="inline-flex items-center gap-2 rounded-[16px] border px-3 py-2 text-sm font-semibold" style={{ background: palette.strong, color: palette.text, borderColor: palette.border }}><Icon className="h-4 w-4" />{item.label}</button> })}<button type="button" onClick={() => exportNotePdf(active, dark)} className="inline-flex items-center gap-2 rounded-[16px] border px-3 py-2 text-sm font-semibold" style={{ background: palette.strong, color: palette.text, borderColor: palette.border }}><FileOutput className="h-4 w-4" />Export PDF</button></div>
                  </div>
                  <div className="relative flex-1 overflow-hidden rounded-[30px] border" style={{ background: palette.page, borderColor: palette.border }}>
                    <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: palette.border, background: palette.strong }}><div><Input value={active.title} onChange={(event) => mutate((note) => ({ ...note, title: event.target.value }))} className="h-auto border-none bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0" style={{ color: palette.text }} /><Input value={active.topic} onChange={(event) => mutate((note) => ({ ...note, topic: event.target.value }))} className="mt-1 h-auto border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0" style={{ color: palette.muted }} /></div><div className="flex gap-2"><Button variant="outline" onClick={() => setStage('preview')} className="rounded-[16px] border px-3" style={{ borderColor: palette.border, background: palette.strong, color: palette.text }}>Preview</Button><Button variant="outline" onClick={() => selected && addObject({ ...selected, id: makeId(selected.type), x: selected.x + 24, y: selected.y + 24, z: active.doc.objects.length + 2 })} className="rounded-[16px] border px-3" style={{ borderColor: palette.border, background: palette.strong, color: palette.text }}>Duplicate</Button><Button variant="outline" onClick={() => selectedIds.length && mutate((note) => ({ ...note, doc: { ...note.doc, objects: note.doc.objects.filter((object) => !selectedIds.includes(object.id)) } }))} className="rounded-[16px] border px-3" style={{ borderColor: 'rgba(255,91,91,.32)', background: 'rgba(255,91,91,.08)', color: '#ffb7b7' }}>Delete selection</Button><Button variant="outline" onClick={() => void removeNote()} className="rounded-[16px] border px-3" style={{ borderColor: 'rgba(255,91,91,.32)', background: 'rgba(255,91,91,.08)', color: '#ffb7b7' }}>Delete note</Button></div></div>
                    <div className="grid h-[calc(100%-73px)] grid-rows-[minmax(0,1fr)_188px]">
                      <div className="overflow-auto p-5">
                        <div ref={stageRef} className="relative mx-auto overflow-hidden rounded-[28px] border" style={{ width: active.doc.canvas.w, height: active.doc.canvas.h, borderColor: palette.border, backgroundColor: palette.page }} onPointerDown={beginDraw}>
                          {sortObjects(active.doc.objects).filter((object) => object.visible).map((object) => (
                            <HybridObjectWrapper
                              key={object.id}
                              object={{ ...object, opacity: object.type === 'image' && active.doc.prefs.ghost && object.traceable ? 0.34 : object.opacity }}
                              selected={selectedId === object.id}
                              multiSelected={selectedSet.has(object.id) && selectedId !== object.id}
                              showDimensions={Boolean(active.doc.prefs.dims || active.doc.prefs.dimMode)}
                              accent={palette.accent}
                              border={palette.border}
                              panel={palette.strong}
                              dim={palette.dim}
                              onSelect={selectObject}
                              onTransform={transformSelection}
                            >
                              {object.type === 'text' ? (
                                <div className="absolute inset-0 rounded-[26px] border p-4" style={{ background: object.variant === 'callout' ? palette.accentSoft : 'rgba(255,255,255,.02)', borderColor: 'transparent' }}>
                                  <textarea
                                    value={object.text}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => patchObject(object.id, (current) => ({ ...current, text: event.target.value }))}
                                    className={cn('relative h-full w-full resize-none border-none bg-transparent outline-none', object.variant === 'title' ? 'text-[28px] font-semibold leading-[1.14]' : object.variant === 'callout' ? 'text-sm font-medium leading-6' : 'text-[15px] leading-7')}
                                    style={{ color: palette.text }}
                                  />
                                </div>
                              ) : null}
                              {object.type === 'image' ? (
                                <>
                                  <img src={object.src} alt={object.caption} className="h-full w-full rounded-[24px] object-cover" />
                                  <div className="absolute left-3 top-3 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ background: palette.ghost, color: palette.text }}>
                                    {active.doc.prefs.ghost && object.traceable ? 'Ghost Mode' : object.caption}
                                  </div>
                                </>
                              ) : null}
                              {object.type === 'table' ? (
                                <div className="grid h-full w-full overflow-hidden rounded-[24px]" style={{ gridTemplateColumns: `repeat(${Math.max(...(object.cells || []).map((row) => row.length), 1)}, minmax(0,1fr))`, background: palette.strong }}>
                                  {(object.cells || []).flatMap((row, rowIndex) => row.map((cell, cellIndex) => <div key={`${rowIndex}-${cellIndex}`} className="border px-3 py-3 text-sm" style={{ borderColor: palette.border, background: rowIndex === 0 ? palette.accentSoft : 'transparent', color: palette.text }}>{cell}</div>))}
                                </div>
                              ) : null}
                            </HybridObjectWrapper>
                          ))}
                          {snapGuides.length ? <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">{snapGuides.map((guide, index) => <circle key={`${guide.x}-${guide.y}-${index}`} cx={guide.x} cy={guide.y} r={4} fill={palette.accent} opacity={0.9} />)}</svg> : null}
                          {lasso ? (() => { const box = getLassoBox(lasso); return <div className="pointer-events-none absolute rounded-[18px] border border-dashed" style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top, borderColor: palette.accent, background: palette.accentSoft }} /> })() : null}
                          {tempStroke.length > 1 ? <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"><polyline points={tempStroke.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={drawColor} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
                        </div>
                      </div>
                      <div className="border-t p-3" style={{ borderColor: palette.border, background: palette.strong }}><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4" style={{ color: palette.accent }} />Layers panel</div><div className="grid gap-2 xl:grid-cols-2">{sortObjects(active.doc.objects).slice().reverse().map((object) => <div key={object.id} className={cn('flex items-center justify-between gap-3 rounded-[18px] border px-4 py-3', selectedSet.has(object.id) && 'shadow-[0_0_0_1px_rgba(121,167,255,.3)]')} style={{ background: palette.soft, borderColor: selectedSet.has(object.id) ? palette.accent : palette.border }}><button type="button" className="min-w-0 text-left" onClick={() => selectObject(object.id)}><div className="truncate text-sm font-semibold">{object.name}</div><div className="mt-1 text-[11px] uppercase tracking-[0.18em]" style={{ color: palette.muted }}>{object.type} / z{object.z}</div></button><div className="flex items-center gap-2"><button type="button" onClick={() => patchObject(object.id, (current) => ({ ...current, visible: !current.visible }))} className="rounded-full border p-2" style={{ borderColor: palette.border, color: palette.text }}>{object.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button><button type="button" onClick={() => patchObject(object.id, (current) => ({ ...current, locked: !current.locked }))} className="rounded-full border p-2" style={{ borderColor: palette.border, color: object.locked ? palette.dim : palette.text }}>{object.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</button></div></div>)}</div></div>
                    </div>
                  </div>
                </div>
                <div className="flex min-h-[720px] flex-col gap-4">
                  <div className="rounded-[24px] border p-4" style={{ background: palette.soft, borderColor: palette.border }}><div className="mb-3 text-xs uppercase tracking-[0.22em]" style={{ color: palette.muted }}>Selection Inspector</div>{selected ? <div className="space-y-3"><Input value={selected.name} onChange={(event) => patchObject(selected.id, (current) => ({ ...current, name: event.target.value }))} /><div className="grid grid-cols-2 gap-2">{(['x', 'y', 'w', 'h'] as const).map((key) => <Input key={key} type="number" value={selected[key]} onChange={(event) => patchObject(selected.id, (current) => ({ ...current, [key]: Number(event.target.value || 0) }))} />)}</div>{selected.type === 'text' ? <textarea value={selected.text} onChange={(event) => patchObject(selected.id, (current) => ({ ...current, text: event.target.value }))} className="min-h-[120px] w-full rounded-[18px] border p-3 text-sm outline-none" style={{ background: palette.strong, borderColor: palette.border, color: palette.text }} /> : null}{selected.type === 'table' ? <textarea value={(selected.cells || []).map((row) => row.join(',')).join('\n')} onChange={(event) => patchObject(selected.id, (current) => ({ ...current, cells: event.target.value.split('\n').map((row) => row.split(',').map((cell) => cell.trim())).filter((row) => row.some(Boolean)) }))} className="min-h-[120px] w-full rounded-[18px] border p-3 text-sm outline-none" style={{ background: palette.strong, borderColor: palette.border, color: palette.text }} /> : null}</div> : <div className="text-sm leading-6" style={{ color: palette.muted }}>Select any object to edit geometry, content and lock state.</div>}</div>
                  <div className="rounded-[24px] border p-4" style={{ background: palette.soft, borderColor: palette.border }}><div className="mb-3 text-xs uppercase tracking-[0.22em]" style={{ color: palette.muted }}>Next.js + Rust</div><div className="space-y-2 text-sm leading-6" style={{ color: palette.muted }}><div>Next.js owns preview, interaction and optimistic state.</div><div>Rust owns geometry solving, dimension recompute and final PDF rendering.</div><div>The shared contract is one serialized hybrid note document.</div></div></div>
                  <div className="rounded-[24px] border p-4" style={{ background: palette.soft, borderColor: palette.border }}><div className="mb-3 text-xs uppercase tracking-[0.22em]" style={{ color: palette.muted }}>Selectable CAD Object</div><pre className="overflow-auto rounded-[18px] border p-4 text-[11px] leading-5" style={{ background: '#09101d', borderColor: palette.border, color: '#d9e4ff' }}>{codeSnippet}</pre></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  )
}
