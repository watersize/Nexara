'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAppState } from '@/lib/tauri-provider'
import { tauriInvoke } from '@/lib/tauri-bridge'
import {
  Bold,
  Eraser,
  ImagePlus,
  Italic,
  LineChart,
  List,
  ListOrdered,
  Paintbrush,
  Plus,
  Search,
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
}

const LEGACY_STORAGE_KEY = 'nexara_notes_v1'
const FONT_OPTIONS = ['Inter', 'Georgia', 'Times New Roman', 'Courier New', 'Trebuchet MS']
const FONT_SIZE_OPTIONS = [14, 16, 18, 20, 24, 28]

function stripHtml(html: string) {
  if (typeof window === 'undefined') return html
  const div = window.document.createElement('div')
  div.innerHTML = html || ''
  return div.textContent || div.innerText || ''
}

function toNoteItem(note: any): NoteItem {
  return {
    id: String(note.id || note.note_id || `note-${Date.now()}`),
    title: String(note.title || '????? ???????'),
    topic: String(note.topic || note.subject || ''),
    content: String(note.content || ''),
    updatedAt: String(note.updated_at || note.updatedAt || new Date().toISOString()),
  }
}

function buildChartMarkup(title: string, values: number[]) {
  const width = 720
  const height = 320
  const padding = 36
  const max = Math.max(...values, 1)
  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0
  const points = values
    .map((value, index) => {
      const x = padding + stepX * index
      const y = height - padding - ((height - padding * 2) * value) / max
      return `${x},${y}`
    })
    .join(' ')

  const labels = values
    .map((value, index) => {
      const x = padding + stepX * index
      return `<text x="${x}" y="${height - 12}" text-anchor="middle" fill="#64748b" font-size="12">${index + 1}</text>
      <text x="${x}" y="${height - padding - ((height - padding * 2) * value) / max - 12}" text-anchor="middle" fill="#3b82f6" font-size="12">${value}</text>`
    })
    .join('')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" rx="26" fill="#0f172a" />
      <text x="36" y="32" fill="#f8fafc" font-size="22" font-weight="700">${title || '??????'}</text>
      <line x1="36" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#334155" stroke-width="2" />
      <line x1="36" y1="${padding}" x2="36" y2="${height - padding}" stroke="#334155" stroke-width="2" />
      <polyline fill="none" stroke="#60a5fa" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
      ${values.map((value, index) => {
        const x = padding + stepX * index
        const y = height - padding - ((height - padding * 2) * value) / max
        return `<circle cx="${x}" cy="${y}" r="6" fill="#60a5fa" />`
      }).join('')}
      ${labels}
    </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export default function NotebookPage() {
  const appState = useAppState()
  const user = appState?.authSession
    ? { displayName: appState.authSession.display_name, email: appState.authSession.email }
    : undefined
  const accountKey = user?.email || 'guest'

  const [notes, setNotes] = useState<NoteItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [editorHtml, setEditorHtml] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDrawingOpen, setIsDrawingOpen] = useState(false)
  const [isChartOpen, setIsChartOpen] = useState(false)
  const [chartTitle, setChartTitle] = useState('????? ??????')
  const [chartValues, setChartValues] = useState('12, 16, 18, 10')
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0])
  const [fontSize, setFontSize] = useState(18)
  const editorRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const saveTimeoutRef = useRef<number | null>(null)

  const loadNotes = async () => {
    setIsLoading(true)
    try {
      let remote = (await tauriInvoke<any[]>('list_notes')).map(toNoteItem)
      if (!remote.length) {
        const raw = window.localStorage.getItem(`${LEGACY_STORAGE_KEY}:${accountKey}`)
        const legacy = raw ? JSON.parse(raw) : []
        if (Array.isArray(legacy) && legacy.length) {
          const migrated = legacy.map(toNoteItem)
          for (const note of migrated) {
            await tauriInvoke('save_note', {
              payload: {
                note: {
                  id: note.id,
                  title: note.title,
                  topic: note.topic,
                  content: note.content,
                  updated_at: note.updatedAt,
                },
              },
            })
          }
          window.localStorage.removeItem(`${LEGACY_STORAGE_KEY}:${accountKey}`)
          remote = migrated
        }
      }
      setNotes(remote)
      setSelectedId((current) => current || remote[0]?.id || '')
    } catch (error) {
      toast.error('?? ??????? ????????? ???????', {
        description: error instanceof Error ? error.message : String(error),
      })
      setNotes([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadNotes()
  }, [accountKey])

  const filteredNotes = useMemo(
    () =>
      notes.filter((note) => {
        const haystack = `${note.title} ${note.topic} ${stripHtml(note.content)}`.toLowerCase()
        return haystack.includes(search.toLowerCase())
      }),
    [notes, search],
  )

  const selectedNote = filteredNotes.find((note) => note.id === selectedId) || notes.find((note) => note.id === selectedId) || filteredNotes[0]

  useEffect(() => {
    if (selectedNote) {
      setEditorHtml(selectedNote.content || '')
      if (editorRef.current && editorRef.current.innerHTML !== (selectedNote.content || '')) {
        editorRef.current.innerHTML = selectedNote.content || ''
      }
    }
  }, [selectedNote?.id])

  useEffect(() => {
    if (!selectedId && filteredNotes[0]) {
      setSelectedId(filteredNotes[0].id)
    }
  }, [filteredNotes, selectedId])

  const persistNote = async (note: NoteItem) => {
    await tauriInvoke('save_note', {
      payload: {
        note: {
          id: note.id,
          title: note.title,
          topic: note.topic,
          content: note.content,
          updated_at: note.updatedAt,
        },
      },
    })
  }

  const scheduleSave = (nextNote: NoteItem) => {
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      void persistNote(nextNote)
    }, 250)
  }

  const updateNote = (id: string, patch: Partial<NoteItem>) => {
    setNotes((current) =>
      current.map((note) => {
        if (note.id !== id) return note
        const next = { ...note, ...patch, updatedAt: new Date().toISOString() }
        scheduleSave(next)
        return next
      }),
    )
  }

  const addNote = async () => {
    const note: NoteItem = {
      id: `note-${Date.now()}`,
      title: '????? ???????',
      topic: '',
      content: '<p></p>',
      updatedAt: new Date().toISOString(),
    }
    setNotes((current) => [note, ...current])
    setSelectedId(note.id)
    setEditorHtml(note.content)
    await persistNote(note)
  }

  const removeNote = async (id: string) => {
    const next = notes.filter((note) => note.id !== id)
    setNotes(next)
    if (selectedId === id) {
      setSelectedId(next[0]?.id || '')
      setEditorHtml(next[0]?.content || '')
    }
    try {
      await tauriInvoke('delete_note', { payload: { id } })
    } catch (error) {
      toast.error('?? ??????? ??????? ???????', {
        description: error instanceof Error ? error.message : String(error),
      })
      await loadNotes()
    }
  }

  const focusEditor = () => editorRef.current?.focus()

  const applyCommand = (command: string, value?: string) => {
    focusEditor()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(command, false, value)
    if (selectedNote) {
      const html = editorRef.current?.innerHTML || ''
      setEditorHtml(html)
      updateNote(selectedNote.id, { content: html })
    }
  }

  const insertHtml = (html: string) => {
    focusEditor()
    document.execCommand('insertHTML', false, html)
    if (selectedNote) {
      const nextHtml = editorRef.current?.innerHTML || ''
      setEditorHtml(nextHtml)
      updateNote(selectedNote.id, { content: nextHtml })
    }
  }

  const handleImageFile = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    insertHtml(`<div class="my-4 overflow-hidden rounded-2xl border border-white/10"><img src="${dataUrl}" alt="????????" style="max-width:100%;display:block;" /></div>`)
  }

  const openDrawing = () => {
    setIsDrawingOpen(true)
    requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      ctx.fillStyle = '#0b1120'
      ctx.fillRect(0, 0, rect.width, rect.height)
      ctx.strokeStyle = '#60a5fa'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    })
  }

  const drawAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (!isDrawingRef.current) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      isDrawingRef.current = true
      return
    }
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const saveDrawing = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    insertHtml(`<div class="my-4 overflow-hidden rounded-2xl border border-white/10"><img src="${canvas.toDataURL('image/png')}" alt="???????" style="max-width:100%;display:block;" /></div>`)
    setIsDrawingOpen(false)
  }

  const insertChart = () => {
    const values = chartValues
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((value) => Number.isFinite(value))
    if (!values.length) {
      toast.error('????? ???????? ???????? ??? ???????')
      return
    }
    const chartDataUrl = buildChartMarkup(chartTitle, values)
    insertHtml(`<div class="my-4 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] p-3"><img src="${chartDataUrl}" alt="${chartTitle}" style="max-width:100%;display:block;" /></div>`)
    setIsChartOpen(false)
  }

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="flex min-h-screen flex-1 overflow-hidden">
        <section className="flex w-[340px] shrink-0 flex-col border-r border-white/6 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/6 px-5 py-5">
            <h1 className="text-2xl font-semibold text-white">???????</h1>
            <button type="button" onClick={() => void addNote()} className="rounded-xl p-2 text-white/75 transition-all hover:bg-white/[0.05] hover:text-white">
              <Plus className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-white/35" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="????? ???????..."
                className="h-12 rounded-2xl border-white/10 bg-white/[0.03] pl-10 text-white placeholder:text-white/28"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-none">
            {isLoading ? (
              <div className="px-4 py-10 text-sm text-white/45">???????? ???????...</div>
            ) : filteredNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => setSelectedId(note.id)}
                className={`mb-3 w-full rounded-[22px] border p-4 text-left transition-all ${
                  selectedNote?.id === note.id
                    ? 'border-primary/25 bg-primary/12'
                    : 'border-white/7 bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <div className="truncate text-lg font-semibold text-white">{note.title}</div>
                <div className="mt-1 line-clamp-2 text-sm text-white/55">{stripHtml(note.content)}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-white/40">
                  <span className="rounded-full bg-primary/12 px-2 py-1 text-primary">{note.topic || '??? ????'}</span>
                  <span>{new Date(note.updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col">
          {selectedNote ? (
            <>
              <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
                <Input
                  value={selectedNote.title}
                  onChange={(event) => updateNote(selectedNote.id, { title: event.target.value })}
                  className="h-11 border-none bg-transparent px-0 text-3xl font-semibold text-white shadow-none focus-visible:ring-0"
                />
                <button
                  type="button"
                  onClick={() => void removeNote(selectedNote.id)}
                  className="rounded-xl p-2 text-red-300 transition-all hover:bg-red-500/10 hover:text-red-100"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-white/6 px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    value={selectedNote.topic}
                    onChange={(event) => updateNote(selectedNote.id, { topic: event.target.value })}
                    placeholder="????"
                    className="h-10 w-48 rounded-xl border-white/10 bg-white/[0.03] text-white placeholder:text-white/28"
                  />
                  <select
                    value={fontFamily}
                    onChange={(event) => {
                      setFontFamily(event.target.value)
                      applyCommand('fontName', event.target.value)
                    }}
                    className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white"
                  >
                    {FONT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <select
                    value={fontSize}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setFontSize(next)
                      applyCommand('fontSize', next >= 28 ? '6' : next >= 24 ? '5' : next >= 20 ? '4' : next >= 18 ? '4' : next >= 16 ? '3' : '2')
                    }}
                    className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white"
                  >
                    {FONT_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}px</option>
                    ))}
                  </select>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => applyCommand('bold')} className="rounded-xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"><Bold className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => applyCommand('italic')} className="rounded-xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"><Italic className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => applyCommand('underline')} className="rounded-xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"><Underline className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => applyCommand('insertUnorderedList')} className="rounded-xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"><List className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => applyCommand('insertOrderedList')} className="rounded-xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"><ListOrdered className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => imageInputRef.current?.click()} className="rounded-xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"><ImagePlus className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={openDrawing} className="rounded-xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"><Paintbrush className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setIsChartOpen(true)} className="rounded-xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"><LineChart className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>

              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleImageFile(file)
                  if (imageInputRef.current) imageInputRef.current.value = ''
                }}
              />

              <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-none">
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(event) => {
                    const html = (event.currentTarget as HTMLDivElement).innerHTML
                    setEditorHtml(html)
                    updateNote(selectedNote.id, { content: html })
                  }}
                  className="min-h-full rounded-[28px] border border-white/8 bg-white/[0.02] p-6 text-lg leading-8 text-white outline-none [&_img]:mx-auto [&_img]:my-4 [&_img]:rounded-2xl [&_p]:mb-4"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-white/45">?????? ??????? ??? ?????? ?????</div>
          )}
        </section>
      </main>

      <Dialog open={isDrawingOpen} onOpenChange={setIsDrawingOpen}>
        <DialogContent className="rounded-[28px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.14),_transparent_32%),linear-gradient(180deg,_rgba(12,14,28,0.98),_rgba(7,9,20,1))] p-0 text-white sm:max-w-4xl" showCloseButton={false}>
          <DialogHeader className="border-b border-white/8 px-5 py-4 text-left">
            <DialogTitle className="text-2xl font-semibold text-white">??????? ? ???????</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <canvas
              ref={canvasRef}
              className="h-[420px] w-full rounded-[24px] border border-white/10 bg-[#0b1120]"
              onPointerDown={(event) => drawAt(event)}
              onPointerMove={(event) => {
                if (event.buttons === 1) drawAt(event)
              }}
              onPointerUp={() => {
                isDrawingRef.current = false
              }}
              onPointerLeave={() => {
                isDrawingRef.current = false
              }}
            />
            <div className="flex justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  const canvas = canvasRef.current
                  const ctx = canvas?.getContext('2d')
                  if (!canvas || !ctx) return
                  const rect = canvas.getBoundingClientRect()
                  ctx.fillStyle = '#0b1120'
                  ctx.fillRect(0, 0, rect.width, rect.height)
                }}
                className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"
              >
                <Eraser className="mr-2 h-4 w-4" />????????
              </Button>
              <Button onClick={saveDrawing} className="rounded-2xl">???????? ? ???????</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isChartOpen} onOpenChange={setIsChartOpen}>
        <DialogContent className="rounded-[28px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.14),_transparent_32%),linear-gradient(180deg,_rgba(12,14,28,0.98),_rgba(7,9,20,1))] p-0 text-white sm:max-w-xl" showCloseButton={false}>
          <DialogHeader className="border-b border-white/8 px-5 py-4 text-left">
            <DialogTitle className="text-2xl font-semibold text-white">???????? ??????</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <Input value={chartTitle} onChange={(event) => setChartTitle(event.target.value)} placeholder="???????? ???????" className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28" />
            <Input value={chartValues} onChange={(event) => setChartValues(event.target.value)} placeholder="????????: 12, 16, 18, 10" className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28" />
            <Button onClick={insertChart} className="rounded-2xl">???????? ??????</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
