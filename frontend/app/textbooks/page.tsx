'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ChevronDown, FileText, FileUp, FolderPlus, Loader2, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'

interface MaterialRecord {
  hash: string
  file_name: string
  mime_type: string
  stored_path: string
  created_at: string
}

interface TextbookPreview {
  kind: 'pdf' | 'text' | 'unsupported'
  file_name: string
  mime_type: string
  content: string
}

interface ThemeFolder {
  id: string
  name: string
  description: string
  hashes: string[]
  open: boolean
}

const THEMES_KEY = 'veyo:textbook-themes:v1'

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  return btoa(binary)
}

export default function TextbooksPage() {
  const appState = useAppState()
  const user = appState?.authSession ? { displayName: appState.authSession.display_name, email: appState.authSession.email } : undefined
  const [items, setItems] = useState<MaterialRecord[]>([])
  const [themes, setThemes] = useState<ThemeFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<TextbookPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [themeDraft, setThemeDraft] = useState({ name: '', description: '' })
  const [themeDialogOpen, setThemeDialogOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const persistThemes = (next: ThemeFolder[]) => {
    setThemes(next)
    try { window.localStorage.setItem(THEMES_KEY, JSON.stringify(next)) } catch {}
  }

  const loadItems = async () => {
    setLoading(true)
    try {
      setItems(await tauriInvoke<MaterialRecord[]>('list_textbooks_command'))
    } catch (error) {
      toast.error('Не удалось загрузить учебники', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
    try {
      const raw = window.localStorage.getItem(THEMES_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as ThemeFolder[]
      if (Array.isArray(parsed)) setThemes(parsed)
    } catch {}
  }, [])

  useEffect(() => {
    if (!preview || preview.kind !== 'pdf') { setPdfUrl(null); return }
    try {
      const binary = atob(preview.content)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      setPdfUrl(url)
      return () => URL.revokeObjectURL(url)
    } catch {
      setPdfUrl(null)
    }
  }, [preview])

  const uploadBook = async (file: File) => {
    setUploading(true)
    try {
      await tauriInvoke('upload_textbook', { payload: { file_name: file.name, file_base64: arrayBufferToBase64(await file.arrayBuffer()), mime_type: file.type || 'application/octet-stream' } })
      toast.success('Учебник загружен')
      await loadItems()
    } catch (error) {
      toast.error('Ошибка загрузки', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setUploading(false)
    }
  }

  const openPreview = async (hash: string) => {
    setPreviewLoading(true)
    setPreview(null)
    setZoom(100)
    try {
      setPreview(await tauriInvoke<TextbookPreview>('get_textbook_preview', { payload: { hash } }))
    } catch (error) {
      toast.error('Не удалось открыть файл', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setPreviewLoading(false)
    }
  }

  const addTheme = () => {
    if (!themeDraft.name.trim()) return
    persistThemes([{ id: `theme-${Date.now()}`, name: themeDraft.name.trim(), description: themeDraft.description.trim(), hashes: [], open: true }, ...themes])
    setThemeDraft({ name: '', description: '' })
    setThemeDialogOpen(false)
  }

  const assignBook = (hash: string, themeId: string) => {
    persistThemes(themes.map((theme) => ({ ...theme, hashes: theme.id === themeId ? Array.from(new Set([...theme.hashes, hash])) : theme.hashes.filter((item) => item !== hash) })))
  }

  const groupedThemes = useMemo(() => {
    const mapped = themes.map((theme) => ({ ...theme, books: items.filter((item) => theme.hashes.includes(item.hash)) }))
    const ungrouped = items.filter((item) => !themes.some((theme) => theme.hashes.includes(item.hash)))
    return { mapped, ungrouped }
  }, [items, themes])

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-1 flex-col px-5 py-8 sm:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div><div className="text-[11px] uppercase tracking-[0.22em] text-white/45">textbook library</div><h1 className="mt-2 text-3xl font-semibold text-white">Учебники по темам</h1></div>
          <div className="flex gap-3">
            <input ref={inputRef} type="file" accept=".pdf,.txt,.doc,.docx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBook(file); if (inputRef.current) inputRef.current.value = '' }} />
            <Button variant="outline" onClick={() => setThemeDialogOpen(true)} className="rounded-2xl border-white/10 bg-transparent text-white/80 hover:bg-white/[0.06]"><FolderPlus className="h-4 w-4" />Тема</Button>
            <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="rounded-2xl">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}Загрузить</Button>
          </div>
        </div>

        <div className="space-y-4">
          {groupedThemes.mapped.map((theme) => (
            <section key={theme.id} className="rounded-[26px] border border-white/8 bg-white/[0.03]">
              <button type="button" onClick={() => persistThemes(themes.map((item) => item.id === theme.id ? { ...item, open: !item.open } : item))} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                <div><div className="text-lg font-semibold text-white">{theme.name}</div><div className="mt-1 text-sm text-white/50">{theme.description || 'Описание темы пока не заполнено.'}</div></div>
                <div className="flex items-center gap-3"><span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">{theme.books.length}</span><ChevronDown className={`h-5 w-5 text-white/60 transition ${theme.open ? 'rotate-180' : ''}`} /></div>
              </button>
              {theme.open ? <div className="grid gap-4 border-t border-white/8 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">{theme.books.length ? theme.books.map((book) => <article key={book.hash} className="rounded-[22px] border border-white/7 bg-black/15 p-4"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary"><FileText className="h-5 w-5" /></div><button type="button" onClick={async () => { await tauriInvoke('delete_textbook', { payload: { hash: book.hash } }); await loadItems() }} className="text-white/50 hover:text-white"><Trash2 className="h-4 w-4" /></button></div><div className="mt-4 text-lg font-semibold text-white">{book.file_name}</div><div className="mt-2 text-sm text-white/50">{format(new Date(book.created_at), 'd MMMM yyyy, HH:mm', { locale: ru })}</div><div className="mt-4 flex items-center justify-between gap-3"><button type="button" onClick={() => void openPreview(book.hash)} className="text-sm font-medium text-primary hover:text-primary/80">Посмотреть</button><select value={theme.id} onChange={(event) => assignBook(book.hash, event.target.value)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white">{themes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></article>) : <div className="rounded-[20px] border border-white/7 bg-white/[0.02] px-4 py-6 text-sm text-white/45">В этой теме пока нет учебников.</div>}</div> : null}
            </section>
          ))}

          <section className="rounded-[26px] border border-white/8 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between"><div><div className="text-lg font-semibold text-white">Без темы</div><div className="mt-1 text-sm text-white/50">Недавно загруженные материалы, которые еще не распределены.</div></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">{groupedThemes.ungrouped.length}</span></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{loading ? [0, 1, 2].map((key) => <div key={key} className="h-40 animate-pulse rounded-[22px] border border-white/7 bg-white/[0.04]" />) : groupedThemes.ungrouped.length ? groupedThemes.ungrouped.map((book) => <article key={book.hash} className="rounded-[22px] border border-white/7 bg-black/15 p-4"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary"><FileText className="h-5 w-5" /></div><button type="button" onClick={async () => { await tauriInvoke('delete_textbook', { payload: { hash: book.hash } }); await loadItems() }} className="text-white/50 hover:text-white"><Trash2 className="h-4 w-4" /></button></div><div className="mt-4 text-lg font-semibold text-white">{book.file_name}</div><div className="mt-2 text-sm text-white/50">{book.mime_type}</div><div className="mt-4 flex items-center justify-between gap-3"><button type="button" onClick={() => void openPreview(book.hash)} className="text-sm font-medium text-primary hover:text-primary/80">Посмотреть</button><select defaultValue="" onChange={(event) => event.target.value && assignBook(book.hash, event.target.value)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white"><option value="" disabled>В тему</option>{themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></div></article>) : <div className="rounded-[20px] border border-white/7 bg-white/[0.02] px-5 py-10 text-sm text-white/45">Пока нет загруженных файлов.</div>}</div>
          </section>
        </div>

        <button type="button" onClick={() => setThemeDialogOpen(true)} className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-[24px] bg-primary text-white shadow-[0_22px_65px_-15px_rgba(92,113,255,0.85)] transition hover:scale-105" aria-label="Добавить тему"><FolderPlus className="h-7 w-7" /></button>

        <Dialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen}>
          <DialogContent showCloseButton={false} className="rounded-[28px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.14),_transparent_32%),linear-gradient(180deg,_rgba(12,14,28,0.98),_rgba(7,9,20,1))] p-5 text-white sm:max-w-xl">
            <div className="mb-4"><div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Новая тема</div><h2 className="mt-2 text-2xl font-semibold text-white">Добавить тему</h2></div>
            <div className="space-y-4"><Input value={themeDraft.name} onChange={(event) => setThemeDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Название темы" className="h-12 rounded-2xl border-white/10 bg-black/20 text-white" /><Textarea value={themeDraft.description} onChange={(event) => setThemeDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Описание темы" className="min-h-28 rounded-2xl border-white/10 bg-black/20 text-white" /></div>
            <div className="mt-5 flex justify-end gap-3"><Button variant="outline" onClick={() => setThemeDialogOpen(false)} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06]">Отмена</Button><Button onClick={addTheme} className="rounded-2xl">Создать тему</Button></div>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(preview) || previewLoading} onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent showCloseButton={false} className="h-[96vh] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[28px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.14),_transparent_32%),linear-gradient(180deg,_rgba(7,9,20,0.98),_rgba(7,9,20,1))] p-0 text-white sm:max-w-[calc(100vw-2rem)]">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4"><div><div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Предпросмотр</div><div className="mt-1 text-xl font-semibold text-white">{preview?.file_name || 'Открытие файла...'}</div></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setZoom((value) => Math.max(60, value - 10))} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06]"><ZoomOut className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => setZoom((value) => Math.min(200, value + 10))} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06]"><ZoomIn className="h-4 w-4" /></Button><button type="button" onClick={() => setPreview(null)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white"><X className="h-5 w-5" /></button></div></div>
            <div className="h-[calc(96vh-80px)] overflow-hidden px-5 py-5">{previewLoading ? <div className="flex h-full items-center justify-center gap-3 text-white/70"><Loader2 className="h-5 w-5 animate-spin text-primary" />Открытие файла...</div> : preview?.kind === 'pdf' ? <div className="h-full overflow-hidden rounded-[24px] border border-white/8 bg-[#eef2f7]">{pdfUrl ? <iframe title={preview.file_name} src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&zoom=${zoom}`} className="h-full w-full border-0" /> : <div className="flex h-full items-center justify-center text-slate-600">Не удалось подготовить PDF.</div>}</div> : preview?.kind === 'text' ? <div className="h-full overflow-auto rounded-[24px] border border-white/8 bg-white/[0.04] p-6 scrollbar-none"><pre className="whitespace-pre-wrap break-words text-white/85" style={{ fontSize: `${zoom / 6 + 10}px`, lineHeight: 1.7 }}>{preview.content}</pre></div> : <div className="flex h-full items-center justify-center rounded-[24px] border border-white/8 bg-white/[0.04] text-white/70">{preview?.content || 'Этот тип файла пока не поддерживается для встроенного предпросмотра.'}</div>}</div>
          </DialogContent>
        </Dialog>
      </main>
    </AppShell>
  )
}
