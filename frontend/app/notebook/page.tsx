'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { ru } from 'date-fns/locale'
import { jsPDF } from 'jspdf'
import { toPng } from 'html-to-image'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import {
  ArrowLeft,
  Bold,
  ChartColumn,
  ChevronLeft,
  Download,
  Eraser,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Paintbrush,
  Plus,
  SquarePen,
  Table2,
  Trash2,
  Underline,
} from 'lucide-react'
import { toast } from 'sonner'

interface NoteItem {
  id: string
  title: string
  topic: string
  content: string
  updatedAt: string
  createdAt: string
}

type BuilderMode = 'chart' | 'table' | null
type ChartType = 'line' | 'bar' | 'pie'

const FONT_OPTIONS = ['SF Pro Text', 'Inter', 'Georgia', 'Avenir Next', 'Courier New']
const FONT_SIZE_OPTIONS = [14, 16, 18, 20, 24, 28]

function stripHtml(html: string) {
  if (typeof window === 'undefined') return html
  const div = window.document.createElement('div')
  div.innerHTML = html || ''
  return (div.textContent || div.innerText || '').trim()
}

function toNoteItem(note: any): NoteItem {
  const stamp = String(note.created_at || note.createdAt || note.updated_at || note.updatedAt || new Date().toISOString())
  return {
    id: String(note.id || note.note_id || `note-${Date.now()}`),
    title: String(note.title || 'Новая заметка'),
    topic: String(note.topic || note.subject || ''),
    content: String(note.content || '<p></p>'),
    updatedAt: String(note.updated_at || note.updatedAt || stamp),
    createdAt: stamp,
  }
}

function noteDateLabel(dateValue: string) {
  const date = new Date(dateValue)
  if (isToday(date)) return 'Сегодня'
  if (isYesterday(date)) return 'Вчера'
  return format(date, 'd MMMM yyyy', { locale: ru })
}

function buildChartDataUrl(type: ChartType, title: string, rawValues: string) {
  const values = rawValues
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const [labelPart, valuePart] = item.includes(':') ? item.split(':') : [`${index + 1}`, item]
      return { label: labelPart.trim(), value: Math.max(0, Number(valuePart.trim()) || 0) }
    })

  if (!values.length) return ''
  const palette = ['#5b8cff', '#00c2a8', '#ff9f43', '#c084fc', '#fb7185']

  if (type === 'pie') {
    const radius = 98
    const size = 300
    const total = values.reduce((sum, item) => sum + item.value, 0) || 1
    let angle = -Math.PI / 2
    const slices = values
      .map((item, index) => {
        const delta = (item.value / total) * Math.PI * 2
        const x1 = size / 2 + Math.cos(angle) * radius
        const y1 = size / 2 + Math.sin(angle) * radius
        angle += delta
        const x2 = size / 2 + Math.cos(angle) * radius
        const y2 = size / 2 + Math.sin(angle) * radius
        const largeArc = delta > Math.PI ? 1 : 0
        return `<path d="M150 150 L${x1.toFixed(2)} ${y1.toFixed(2)} A${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${palette[index % palette.length]}" />`
      })
      .join('')
    const legend = values
      .map((item, index) => `<g transform="translate(22 ${220 + index * 22})"><rect width="12" height="12" rx="3" fill="${palette[index % palette.length]}" /><text x="18" y="11" fill="#dbe7ff" font-size="12">${item.label}: ${item.value}</text></g>`)
      .join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="320" viewBox="0 0 300 320"><rect width="300" height="320" rx="28" fill="#0b1226" /><text x="22" y="28" fill="#f8fbff" font-size="18" font-weight="700">${title || 'Диаграмма'}</text>${slices}<circle cx="150" cy="150" r="40" fill="#0b1226" />${legend}</svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  const width = 720
  const height = 320
  const padding = 42
  const max = Math.max(...values.map((item) => item.value), 1)
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0
  const points = values
    .map((item, index) => {
      const x = padding + step * index
      const y = height - padding - ((height - padding * 2) * item.value) / max
      return `${x},${y}`
    })
    .join(' ')
  const bars = values
    .map((item, index) => {
      const x = padding + index * ((width - padding * 2) / values.length) + 12
      const barWidth = Math.max(36, (width - padding * 2) / values.length - 24)
      const y = height - padding - ((height - padding * 2) * item.value) / max
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${height - padding - y}" rx="14" fill="#5b8cff" fill-opacity="0.92" />`
    })
    .join('')
  const labels = values
    .map((item, index) => {
      const x = type === 'bar' ? padding + index * ((width - padding * 2) / values.length) + 38 : padding + step * index
      return `<text x="${x}" y="${height - 14}" text-anchor="middle" fill="#8da2c0" font-size="12">${item.label}</text>`
    })
    .join('')
  const valuesText = values
    .map((item, index) => {
      const x = type === 'bar' ? padding + index * ((width - padding * 2) / values.length) + 38 : padding + step * index
      const y = type === 'bar' ? height - padding - ((height - padding * 2) * item.value) / max - 10 : height - padding - ((height - padding * 2) * item.value) / max - 12
      return `<text x="${x}" y="${y}" text-anchor="middle" fill="#dbe7ff" font-size="12">${item.value}</text>`
    })
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="28" fill="#0b1226" /><text x="24" y="30" fill="#f8fbff" font-size="22" font-weight="700">${title || 'Диаграмма'}</text><line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#223250" stroke-width="2" /><line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#223250" stroke-width="2" />${type === 'bar' ? bars : `<polyline fill="none" stroke="#5b8cff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${points}" />`}${type === 'line' ? values.map((item, index) => { const x = padding + step * index; const y = height - padding - ((height - padding * 2) * item.value) / max; return `<circle cx="${x}" cy="${y}" r="6" fill="#5b8cff" />` }).join('') : ''}${labels}${valuesText}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function buildTableHtml(raw: string) {
  const rows = raw.split('\n').map((row) => row.split(',').map((cell) => cell.trim())).filter((row) => row.some(Boolean))
  if (!rows.length) return ''
  return `<div class="my-5 overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04]"><table style="width:100%; border-collapse:collapse; color:#f8fafc; font-size:15px;"><tbody>${rows.map((row, rowIndex) => `<tr>${row.map((cell) => `<${rowIndex === 0 ? 'th' : 'td'} style="border:1px solid rgba(255,255,255,.08); padding:12px 14px; text-align:left; background:${rowIndex === 0 ? 'rgba(91,140,255,.18)' : 'transparent'};">${cell || '&nbsp;'}</${rowIndex === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>`
}

export default function NotebookPage() {
  const appState = useAppState()
  const user = appState?.authSession ? { displayName: appState.authSession.display_name, email: appState.authSession.email } : undefined
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [search, setSearch] = useState('')
  const [activeNoteId, setActiveNoteId] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0])
  const [fontSize, setFontSize] = useState(18)
  const [showDrawingPad, setShowDrawingPad] = useState(false)
  const [builderMode, setBuilderMode] = useState<BuilderMode>(null)
  const [chartTitle, setChartTitle] = useState('Новая диаграмма')
  const [chartType, setChartType] = useState<ChartType>('line')
  const [chartValues, setChartValues] = useState('Янв:12, Фев:18, Мар:15, Апр:22')
  const [tableSource, setTableSource] = useState('Показатель,Значение\nЗадачи,12\nУроки,28')
  const [selectedImageWidth, setSelectedImageWidth] = useState(80)
  const editorRef = useRef<HTMLDivElement>(null)
  const editorFrameRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawingContextRef = useRef<CanvasRenderingContext2D | null>(null)
  const selectedImageRef = useRef<HTMLImageElement | null>(null)
  const saveTimeoutRef = useRef<number | null>(null)
  const isDrawingRef = useRef(false)

  const loadNotes = async () => {
    setIsLoading(true)
    try {
      const result = await tauriInvoke<any[]>('list_notes')
      const mapped = result.map(toNoteItem)
      setNotes(mapped)
      if (!activeNoteId && mapped[0]) setActiveNoteId(mapped[0].id)
    } catch (error) {
      toast.error('Не удалось загрузить заметки', {
        description: error instanceof Error ? error.message : String(error),
      })
      setNotes([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadNotes()
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const source = [...notes].sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt))
    if (!query) return source
    return source.filter((note) => `${note.title} ${note.topic} ${stripHtml(note.content)}`.toLowerCase().includes(query))
  }, [notes, search])

  const activeNote = notes.find((note) => note.id === activeNoteId) || filteredNotes[0] || null

  useEffect(() => {
    if (activeNote && editorRef.current && editorRef.current.innerHTML !== (activeNote.content || '<p></p>')) {
      editorRef.current.innerHTML = activeNote.content || '<p></p>'
    }
  }, [activeNote?.id])

  const groupedNotes = useMemo(() => {
    const groups = new Map<string, NoteItem[]>()
    filteredNotes.forEach((note) => {
      const key = noteDateLabel(note.createdAt || note.updatedAt)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(note)
    })
    return Array.from(groups.entries())
  }, [filteredNotes])

  const persistNote = async (note: NoteItem) => {
    await tauriInvoke('save_note', {
      payload: {
        note: {
          id: note.id,
          title: note.title,
          topic: note.topic,
          content: note.content,
          updated_at: note.updatedAt,
          created_at: note.createdAt,
        },
      },
    })
  }

  const schedulePersist = (note: NoteItem) => {
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      void persistNote(note)
    }, 280)
  }

  const updateNote = (id: string, patch: Partial<NoteItem>) => {
    setNotes((current) =>
      current.map((note) => {
        if (note.id !== id) return note
        const next = { ...note, ...patch, updatedAt: new Date().toISOString() }
        schedulePersist(next)
        return next
      }),
    )
  }

  const createNote = async () => {
    const stamp = new Date().toISOString()
    const note: NoteItem = { id: `note-${Date.now()}`, title: 'Новая заметка', topic: '', content: '<p></p>', updatedAt: stamp, createdAt: stamp }
    await persistNote(note)
    await loadNotes()
    setActiveNoteId(note.id)
    setIsEditorOpen(true)
  }

  const removeNote = async (id: string) => {
    try {
      await tauriInvoke('delete_note', { payload: { id } })
      const nextNotes = notes.filter((note) => note.id !== id)
      setNotes(nextNotes)
      setActiveNoteId(nextNotes[0]?.id || '')
      if (!nextNotes.length) setIsEditorOpen(false)
      toast.success('Заметка удалена')
    } catch (error) {
      toast.error('Не удалось удалить заметку', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const focusEditor = () => editorRef.current?.focus()

  const syncEditorContent = () => {
    if (!activeNote || !editorRef.current) return
    updateNote(activeNote.id, { content: editorRef.current.innerHTML })
  }

  const applyCommand = (command: string, value?: string) => {
    focusEditor()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(command, false, value)
    syncEditorContent()
  }

  const insertHtml = (html: string) => {
    focusEditor()
    document.execCommand('insertHTML', false, html)
    syncEditorContent()
  }

  const handleImageInsert = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    insertHtml(`<figure class="note-image-block my-5 text-center"><img src="${dataUrl}" alt="Вложение" style="width:70%;max-width:100%;margin:0 auto;border-radius:22px;display:block;" /></figure>`)
  }

  const prepareDrawingPad = () => {
    const canvas = drawingCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = Math.floor(rect.width * ratio)
    canvas.height = Math.floor(rect.height * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#09111f'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#5b8cff'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    drawingContextRef.current = ctx
  }

  useEffect(() => {
    if (showDrawingPad) window.requestAnimationFrame(prepareDrawingPad)
  }, [showDrawingPad])

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const startDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = drawingContextRef.current
    if (!ctx) return
    const point = getCanvasPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    isDrawingRef.current = true
  }

  const moveDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = drawingContextRef.current
    if (!ctx || !isDrawingRef.current) return
    const point = getCanvasPoint(event)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  const endDraw = () => {
    isDrawingRef.current = false
  }

  const saveDrawingToNote = () => {
    const canvas = drawingCanvasRef.current
    if (!canvas) return
    insertHtml(`<figure class="my-5"><img src="${canvas.toDataURL('image/png')}" alt="Рисунок" style="width:100%;max-width:100%;display:block;border-radius:22px;" /></figure>`)
    setShowDrawingPad(false)
  }

  const chartPreview = useMemo(() => buildChartDataUrl(chartType, chartTitle, chartValues), [chartTitle, chartType, chartValues])
  const tablePreview = useMemo(() => buildTableHtml(tableSource), [tableSource])

  const insertChartBlock = () => {
    if (!chartPreview) return toast.error('Заполни данные для диаграммы')
    insertHtml(`<figure class="my-5"><img src="${chartPreview}" alt="${chartTitle}" style="width:100%;display:block;border-radius:24px;" /></figure>`)
    setBuilderMode(null)
  }

  const insertTableBlock = () => {
    if (!tablePreview) return toast.error('Заполни таблицу')
    insertHtml(tablePreview)
    setBuilderMode(null)
  }

  const handleEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (target instanceof HTMLImageElement) {
      selectedImageRef.current = target
      const widthValue = Number.parseInt(target.style.width || '70', 10)
      setSelectedImageWidth(Number.isFinite(widthValue) ? widthValue : 70)
      return
    }
    selectedImageRef.current = null
  }

  const resizeSelectedImage = (width: number) => {
    setSelectedImageWidth(width)
    if (selectedImageRef.current) {
      selectedImageRef.current.style.width = `${width}%`
      selectedImageRef.current.style.maxWidth = '100%'
      syncEditorContent()
    }
  }

  const exportAsPng = async () => {
    if (!editorFrameRef.current || !activeNote) return
    try {
      const dataUrl = await toPng(editorFrameRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: '#0a1120' })
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${activeNote.title || 'note'}.png`
      link.click()
    } catch (error) {
      toast.error('Не удалось скачать PNG', { description: error instanceof Error ? error.message : String(error) })
    }
  }

  const exportAsPdf = async () => {
    if (!editorFrameRef.current || !activeNote) return
    try {
      const dataUrl = await toPng(editorFrameRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: '#0a1120' })
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      pdf.addImage(dataUrl, 'PNG', 24, 24, pageWidth - 48, pageHeight - 48)
      pdf.save(`${activeNote.title || 'note'}.pdf`)
    } catch (error) {
      toast.error('Не удалось скачать PDF', { description: error instanceof Error ? error.message : String(error) })
    }
  }


  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {!isEditorOpen ? (
          <section className="flex w-full flex-col">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Блокнот</div>
                <h1 className="mt-2 text-3xl font-semibold text-white">Все записи</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/55">Список заметок по датам создания. Нажми на запись и она откроется в полноэкранном режиме.</p>
              </div>
              <Button onClick={() => void createNote()} className="rounded-2xl"><Plus className="h-4 w-4" />Создать заметку</Button>
            </div>
            <div className="mb-6">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по заметкам..." className="h-12 max-w-md rounded-2xl border-white/10 bg-white/[0.03] text-white placeholder:text-white/28" />
            </div>
            <div className="space-y-8">
              {isLoading ? <div className="rounded-[28px] border border-white/8 bg-white/[0.03] px-6 py-10 text-white/55">Загрузка заметок...</div> : groupedNotes.length ? groupedNotes.map(([label, sectionNotes]) => (
                <section key={label}>
                  <div className="mb-3 text-xs uppercase tracking-[0.22em] text-white/42">{label}</div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {sectionNotes.map((note) => (
                      <button key={note.id} type="button" onClick={() => { setActiveNoteId(note.id); setIsEditorOpen(true) }} className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/22 hover:bg-white/[0.05]">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold text-white">{note.title}</div>
                            <div className="mt-1 text-sm text-white/45">{format(new Date(note.createdAt), 'd MMMM yyyy, HH:mm', { locale: ru })}</div>
                          </div>
                          <SquarePen className="mt-1 h-4 w-4 shrink-0 text-white/35" />
                        </div>
                        <div className="line-clamp-4 text-sm leading-6 text-white/62">{stripHtml(note.content) || 'Пустая заметка'}</div>
                        <div className="mt-4 inline-flex rounded-full bg-primary/12 px-3 py-1 text-xs font-medium text-primary">{note.topic || 'Без темы'}</div>
                      </button>
                    ))}
                  </div>
                </section>
              )) : <div className="rounded-[28px] border border-white/8 bg-white/[0.03] px-6 py-12 text-center text-white/55">Пока нет заметок. Создай первую запись и открой её на весь экран.</div>}
            </div>
          </section>
        ) : activeNote ? (
          <section className="flex w-full flex-1 flex-col">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-sm text-white/45">{format(new Date(activeNote.createdAt), 'd MMMM yyyy', { locale: ru })}</div>
              <button type="button" onClick={() => setIsEditorOpen(false)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80 transition hover:bg-white/[0.08] hover:text-white">Назад<ArrowLeft className="h-4 w-4" /></button>
            </div>
            <div className="overflow-hidden rounded-[34px] border border-white/8 bg-[radial-gradient(circle_at_top,_rgba(91,140,255,0.14),_transparent_30%),linear-gradient(180deg,_rgba(9,14,28,0.98),_rgba(6,9,20,1))] shadow-[0_30px_90px_-45px_rgba(31,59,180,0.45)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
                <div className="min-w-0">
                  <Input value={activeNote.title} onChange={(event) => updateNote(activeNote.id, { title: event.target.value })} className="h-auto border-none bg-transparent px-0 text-3xl font-semibold text-white shadow-none focus-visible:ring-0" />
                  <div className="mt-1 text-sm text-white/40">Полноэкранная заметка</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={exportAsPng} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><Download className="h-4 w-4" />PNG</Button>
                  <Button variant="outline" size="sm" onClick={exportAsPdf} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><Download className="h-4 w-4" />PDF</Button>
                  <Button variant="outline" size="sm" onClick={() => void removeNote(activeNote.id)} className="rounded-2xl border-red-400/20 bg-transparent text-red-200 hover:bg-red-500/10 hover:text-red-100"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="border-b border-white/8 px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Input value={activeNote.topic} onChange={(event) => updateNote(activeNote.id, { topic: event.target.value })} placeholder="Тема" className="h-11 w-52 rounded-2xl border-white/10 bg-white/[0.03] text-white placeholder:text-white/28" />
                  <select value={fontFamily} onChange={(event) => { setFontFamily(event.target.value); applyCommand('fontName', event.target.value) }} className="h-11 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white">{FONT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  <select value={fontSize} onChange={(event) => { const next = Number(event.target.value); setFontSize(next); applyCommand('fontSize', next >= 28 ? '6' : next >= 24 ? '5' : next >= 20 ? '4' : next >= 16 ? '3' : '2') }} className="h-11 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white">{FONT_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}px</option>)}</select>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => applyCommand('bold')} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><Bold className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => applyCommand('italic')} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><Italic className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => applyCommand('underline')} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><Underline className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => applyCommand('insertUnorderedList')} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><List className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => applyCommand('insertOrderedList')} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><ListOrdered className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => imageInputRef.current?.click()} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><ImagePlus className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setShowDrawingPad((current) => !current)} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><Paintbrush className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setBuilderMode('chart')} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><ChartColumn className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setBuilderMode('table')} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><Table2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImageInsert(file); if (imageInputRef.current) imageInputRef.current.value = '' }} />
                {selectedImageRef.current ? <div className="mt-4 flex items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"><div className="text-sm text-white/65">Размер изображения</div><input type="range" min={25} max={100} value={selectedImageWidth} onChange={(event) => resizeSelectedImage(Number(event.target.value))} className="h-2 w-56 accent-blue-500" /><div className="text-sm text-white/85">{selectedImageWidth}%</div></div> : null}
                {showDrawingPad ? <div className="mt-4 rounded-[28px] border border-white/8 bg-white/[0.03] p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-base font-semibold text-white">Рисование прямо в заметке</div><div className="text-sm text-white/45">Нарисуй фрагмент и вставь его в заметку.</div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={prepareDrawingPad} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><Eraser className="h-4 w-4" />Очистить</Button><Button size="sm" onClick={saveDrawingToNote} className="rounded-2xl">Вставить</Button></div></div><canvas ref={drawingCanvasRef} className="h-[300px] w-full touch-none rounded-[22px] border border-white/10 bg-[#09111f]" onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerLeave={endDraw} onPointerCancel={endDraw} /></div> : null}
              </div>
              <div className="grid min-h-[72vh] gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 border-r border-white/8 p-5">
                  <div ref={editorFrameRef} className="rounded-[28px] border border-white/8 bg-white/[0.025] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={syncEditorContent} onClick={handleEditorClick} className="min-h-[62vh] text-[17px] leading-8 text-white outline-none [&_img]:mx-auto [&_img]:my-4 [&_img]:rounded-[22px] [&_p]:mb-4 [&_table]:w-full" style={{ fontFamily, fontSize }} />
                  </div>
                </div>
                <aside className="border-t border-white/8 p-5 xl:border-l-0 xl:border-t-0">
                  {builderMode === 'chart' ? <div className="grid h-full gap-4"><div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-4"><div className="mb-4 flex items-center justify-between"><div className="text-lg font-semibold text-white">Диаграмма</div><button type="button" onClick={() => setBuilderMode(null)} className="rounded-xl p-2 text-white/45 transition hover:bg-white/[0.06] hover:text-white"><ChevronLeft className="h-4 w-4" /></button></div><div className="space-y-3"><Input value={chartTitle} onChange={(event) => setChartTitle(event.target.value)} placeholder="Название" className="h-11 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28" /><select value={chartType} onChange={(event) => setChartType(event.target.value as ChartType)} className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white"><option value="line">Линейный</option><option value="bar">Столбчатый</option><option value="pie">Круговой</option></select><textarea value={chartValues} onChange={(event) => setChartValues(event.target.value)} className="h-36 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" placeholder="Янв:12, Фев:18, Мар:15" /><Button onClick={insertChartBlock} className="w-full rounded-2xl">Создать диаграмму</Button></div></div><div className="overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.03] p-4"><div className="mb-3 text-xs uppercase tracking-[0.22em] text-white/42">Preview</div>{chartPreview ? <img src={chartPreview} alt="preview chart" className="w-full rounded-[22px]" /> : <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/45">Заполни данные слева</div>}</div></div> : null}
                  {builderMode === 'table' ? <div className="grid h-full gap-4"><div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-4"><div className="mb-4 flex items-center justify-between"><div className="text-lg font-semibold text-white">Таблица</div><button type="button" onClick={() => setBuilderMode(null)} className="rounded-xl p-2 text-white/45 transition hover:bg-white/[0.06] hover:text-white"><ChevronLeft className="h-4 w-4" /></button></div><textarea value={tableSource} onChange={(event) => setTableSource(event.target.value)} className="h-48 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" placeholder="Столбец 1,Столбец 2&#10;Значение,10" /><div className="mt-3 text-xs text-white/45">Новая строка — новая запись. Запятая разделяет ячейки.</div><Button onClick={insertTableBlock} className="mt-4 w-full rounded-2xl">Создать таблицу</Button></div><div className="overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.03] p-4"><div className="mb-3 text-xs uppercase tracking-[0.22em] text-white/42">Preview</div>{tablePreview ? <div className="overflow-hidden rounded-[22px] border border-white/8 bg-[#0b1226] p-3" dangerouslySetInnerHTML={{ __html: tablePreview }} /> : <div className="rounded-[22px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/45">Заполни таблицу слева</div>}</div></div> : null}
                  {!builderMode ? <div className="flex h-full flex-col justify-between rounded-[28px] border border-white/8 bg-white/[0.03] p-5"><div><div className="text-xs uppercase tracking-[0.22em] text-white/42">Инструменты</div><div className="mt-3 text-2xl font-semibold text-white">Рабочая зона заметки</div><p className="mt-3 text-sm leading-6 text-white/52">Диаграммы, таблицы, рисунок внутри заметки, фото и экспорт в PDF или PNG.</p></div><div className="space-y-3"><Button variant="outline" onClick={() => setBuilderMode('chart')} className="w-full justify-start rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><ChartColumn className="h-4 w-4" />Создать диаграмму</Button><Button variant="outline" onClick={() => setBuilderMode('table')} className="w-full justify-start rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><Table2 className="h-4 w-4" />Создать таблицу</Button><Button variant="outline" onClick={() => setShowDrawingPad((current) => !current)} className="w-full justify-start rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"><Paintbrush className="h-4 w-4" />Рисование в заметке</Button></div></div> : null}
                </aside>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </AppShell>
  )
}
