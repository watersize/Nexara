'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { BookOpen, ChevronDown, FileText, FileUp, FolderPlus, Loader2, Search, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { cn } from '@/lib/utils'

interface MaterialRecord { hash: string; file_name: string; mime_type: string; stored_path: string; created_at: string }
interface TextbookPreview { kind: 'pdf' | 'text' | 'unsupported'; file_name: string; mime_type: string; content: string }
interface ThemeFolder { id: string; name: string; description: string; hashes: string[]; open: boolean }

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
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted ? resolvedTheme !== 'light' : true

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
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const persistThemes = (next: ThemeFolder[]) => { setThemes(next); try { window.localStorage.setItem(THEMES_KEY, JSON.stringify(next)) } catch {} }

  const loadItems = async () => {
    setLoading(true)
    try { setItems(await tauriInvoke<MaterialRecord[]>('list_textbooks_command')) }
    catch (error) { toast.error('Не удалось загрузить учебники', { description: error instanceof Error ? error.message : String(error) }) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    void loadItems()
    try { const raw = window.localStorage.getItem(THEMES_KEY); if (!raw) return; const parsed = JSON.parse(raw) as ThemeFolder[]; if (Array.isArray(parsed)) setThemes(parsed) } catch {}
  }, [])

  useEffect(() => {
    if (!preview || preview.kind !== 'pdf') { setPdfUrl(null); return }
    try {
      const binary = atob(preview.content)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      setPdfUrl(url)
      return () => URL.revokeObjectURL(url)
    } catch { setPdfUrl(null) }
  }, [preview])

  const uploadBook = async (file: File) => {
    setUploading(true)
    try {
      await tauriInvoke('upload_textbook', { payload: { file_name: file.name, file_base64: arrayBufferToBase64(await file.arrayBuffer()), mime_type: file.type || 'application/octet-stream' } })
      toast.success('Учебник загружен')
      await loadItems()
    } catch (error) { toast.error('Ошибка загрузки', { description: error instanceof Error ? error.message : String(error) }) }
    finally { setUploading(false) }
  }

  const openPreview = async (hash: string) => {
    setPreviewLoading(true); setPreview(null); setZoom(100)
    try { setPreview(await tauriInvoke<TextbookPreview>('get_textbook_preview', { payload: { hash } })) }
    catch (error) { toast.error('Не удалось открыть файл', { description: error instanceof Error ? error.message : String(error) }) }
    finally { setPreviewLoading(false) }
  }

  const addTheme = () => {
    if (!themeDraft.name.trim()) return
    persistThemes([{ id: `theme-${Date.now()}`, name: themeDraft.name.trim(), description: themeDraft.description.trim(), hashes: [], open: true }, ...themes])
    setThemeDraft({ name: '', description: '' }); setThemeDialogOpen(false)
  }

  const assignBook = (hash: string, themeId: string) => {
    persistThemes(themes.map((theme) => ({ ...theme, hashes: theme.id === themeId ? Array.from(new Set([...theme.hashes, hash])) : theme.hashes.filter((item) => item !== hash) })))
  }

  const groupedThemes = useMemo(() => {
    const mapped = themes.map((theme) => ({ ...theme, books: items.filter((item) => theme.hashes.includes(item.hash)) }))
    const ungrouped = items.filter((item) => !themes.some((theme) => theme.hashes.includes(item.hash)))
    return { mapped, ungrouped }
  }, [items, themes])

  const filteredUngrouped = useMemo(() => {
    if (!searchQuery.trim()) return groupedThemes.ungrouped
    const q = searchQuery.toLowerCase()
    return groupedThemes.ungrouped.filter(b => b.file_name.toLowerCase().includes(q))
  }, [groupedThemes.ungrouped, searchQuery])

  // Book card component
  const BookCard = ({ book, themeId }: { book: MaterialRecord; themeId?: string }) => {
    const [folderOpen, setFolderOpen] = useState(false)
    const assigned = themes.find(t => t.id === themeId)

    return (
      <article className={cn(
        'rounded-2xl border p-5 transition-all group hover:shadow-lg relative',
        dark ? 'border-white/8 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/12' : 'border-gray-200 bg-white hover:shadow-md'
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', dark ? 'bg-blue-500/12 text-blue-400' : 'bg-blue-50 text-blue-500')}>
            <FileText className="h-5 w-5" />
          </div>
          <button type="button" onClick={async () => { await tauriInvoke('delete_textbook', { payload: { hash: book.hash } }); await loadItems() }}
            className={cn('opacity-0 group-hover:opacity-100 transition-opacity', dark ? 'text-white/40 hover:text-red-400' : 'text-gray-400 hover:text-red-500')}
          ><Trash2 className="h-4 w-4" /></button>
        </div>
        <div className={cn('mt-4 text-base font-semibold truncate', dark ? 'text-white' : 'text-gray-900')}>{book.file_name}</div>
        <div className={cn('mt-1.5 text-xs', dark ? 'text-white/40' : 'text-gray-400')}>
          {format(new Date(book.created_at), 'd MMM yyyy, HH:mm', { locale: ru })}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" onClick={() => void openPreview(book.hash)} className="text-sm font-medium text-blue-500 hover:text-blue-400 transition-colors">Посмотреть</button>

          {/* Styled folder selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFolderOpen(v => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors',
                dark
                  ? 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/8'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
              )}
            >
              {assigned ? (
                <><span className="h-2 w-2 rounded-full bg-primary inline-block" />{assigned.name}</>
              ) : (
                <><span className="opacity-40">В тему</span></>
              )}
              <ChevronDown className={cn('h-3 w-3 transition-transform', folderOpen && 'rotate-180')} />
            </button>

            {folderOpen && (
              <div
                className={cn(
                  'absolute right-0 bottom-full mb-1 z-50 min-w-[140px] rounded-2xl border shadow-xl overflow-hidden',
                  dark ? 'bg-neutral-900 border-white/10' : 'bg-white border-gray-200'
                )}
              >
                {themes.length === 0 && (
                  <div className={cn('px-4 py-3 text-xs', dark ? 'text-white/40' : 'text-gray-400')}>Нет папок</div>
                )}
                {themes.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { assignBook(book.hash, t.id); setFolderOpen(false) }}
                    className={cn(
                      'flex w-full items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors',
                      t.id === themeId
                        ? 'bg-primary/15 text-primary font-semibold'
                        : dark ? 'text-white/80 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-primary/70 shrink-0" />
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </article>
    )
  }

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-1 flex-col px-5 py-8 sm:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className={cn('h-10 w-10 rounded-2xl flex items-center justify-center', dark ? 'bg-blue-500/12' : 'bg-blue-50')}>
                  <BookOpen className={cn('h-5 w-5', dark ? 'text-blue-400' : 'text-blue-500')} />
                </div>
                <div className={cn('text-[10px] uppercase tracking-[0.22em] font-semibold', dark ? 'text-white/35' : 'text-gray-400')}>библиотека материалов</div>
              </div>
              <h1 className={cn('text-3xl font-bold', dark ? 'text-white' : 'text-gray-900')}>Учебники</h1>
              <p className={cn('mt-2 text-sm', dark ? 'text-white/50' : 'text-gray-500')}>{items.length} файлов • {themes.length} тем</p>
            </div>
            <div className="flex gap-2">
              <input ref={inputRef} type="file" accept=".pdf,.txt,.doc,.docx" className="hidden"
                onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBook(file); if (inputRef.current) inputRef.current.value = '' }} />
              <Button variant="outline" onClick={() => setThemeDialogOpen(true)}
                className={cn('rounded-xl gap-2', dark ? 'border-white/10 bg-transparent text-white/80 hover:bg-white/[0.06]' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')}
              ><FolderPlus className="h-4 w-4" />Тема</Button>
              <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="rounded-xl gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}Загрузить
              </Button>
            </div>
          </div>
          {/* Search */}
          <div className={cn('mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 max-w-sm', dark ? 'bg-white/[0.04] border border-white/8' : 'bg-gray-50 border border-gray-200')}>
            <Search className={cn('h-4 w-4 shrink-0', dark ? 'text-white/30' : 'text-gray-400')} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Поиск по названию..."
              className={cn('w-full bg-transparent outline-none text-sm', dark ? 'text-white placeholder:text-white/30' : 'text-gray-900 placeholder:text-gray-400')} />
          </div>
        </div>

        {/* Theme sections */}
        <div className="space-y-5">
          {groupedThemes.mapped.map((theme) => (
            <section key={theme.id} className={cn('rounded-2xl border overflow-hidden', dark ? 'border-white/8 bg-white/[0.02]' : 'border-gray-200 bg-white')}>
              <button type="button" onClick={() => persistThemes(themes.map((item) => item.id === theme.id ? { ...item, open: !item.open } : item))}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left">
                <div>
                  <div className={cn('text-lg font-semibold', dark ? 'text-white' : 'text-gray-900')}>{theme.name}</div>
                  <div className={cn('mt-1 text-sm', dark ? 'text-white/50' : 'text-gray-500')}>{theme.description || 'Описание не добавлено'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('rounded-full border px-3 py-1 text-xs', dark ? 'border-white/10 text-white/50' : 'border-gray-200 text-gray-500')}>
                    {theme.books.length}
                  </span>
                  <ChevronDown className={cn('h-5 w-5 transition', dark ? 'text-white/40' : 'text-gray-400', theme.open && 'rotate-180')} />
                </div>
              </button>
              {theme.open && (
                <div className={cn('grid gap-4 border-t px-6 py-5 md:grid-cols-2 xl:grid-cols-3', dark ? 'border-white/8' : 'border-gray-100')}>
                  {theme.books.length ? theme.books.map(book => <BookCard key={book.hash} book={book} themeId={theme.id} />) : (
                    <div className={cn('rounded-xl border px-4 py-8 text-sm text-center col-span-full', dark ? 'border-white/6 text-white/40' : 'border-gray-200 text-gray-400')}>
                      В этой теме пока нет учебников
                    </div>
                  )}
                </div>
              )}
            </section>
          ))}

          {/* Ungrouped section */}
          <section className={cn('rounded-2xl border p-6', dark ? 'border-white/8 bg-white/[0.02]' : 'border-gray-200 bg-white')}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className={cn('text-lg font-semibold', dark ? 'text-white' : 'text-gray-900')}>Без темы</div>
                <div className={cn('mt-1 text-sm', dark ? 'text-white/50' : 'text-gray-500')}>Файлы, которые ещё не распределены по темам</div>
              </div>
              <span className={cn('rounded-full border px-3 py-1 text-xs', dark ? 'border-white/10 text-white/50' : 'border-gray-200 text-gray-500')}>
                {filteredUngrouped.length}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {loading ? (
                [0, 1, 2].map(key => <div key={key} className={cn('h-44 animate-pulse rounded-2xl border', dark ? 'border-white/6 bg-white/[0.03]' : 'border-gray-200 bg-gray-50')} />)
              ) : filteredUngrouped.length ? (
                filteredUngrouped.map(book => <BookCard key={book.hash} book={book} />)
              ) : (
                <div className={cn('rounded-xl border px-5 py-10 text-sm text-center col-span-full', dark ? 'border-white/6 text-white/40' : 'border-gray-200 text-gray-400')}>
                  {searchQuery.trim() ? 'По запросу ничего не найдено' : 'Загрузите первый учебник, нажав кнопку выше'}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* FAB */}
        <button type="button" onClick={() => setThemeDialogOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-[0_16px_48px_-8px_rgba(59,130,246,0.6)] transition-transform hover:scale-105 active:scale-95"
          aria-label="Добавить тему"><FolderPlus className="h-6 w-6" /></button>

        {/* Create Theme Dialog */}
        <Dialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen}>
          <DialogContent showCloseButton={false} className={cn('rounded-2xl p-6 sm:max-w-xl',
            dark ? 'border-white/10 bg-[#0e1020] text-white' : 'border-gray-200 bg-white text-gray-900')}>
            <div className="mb-4">
              <div className={cn('text-[10px] uppercase tracking-[0.22em] font-semibold', dark ? 'text-white/35' : 'text-gray-400')}>Новая тема</div>
              <h2 className={cn('mt-2 text-2xl font-bold', dark ? 'text-white' : 'text-gray-900')}>Добавить тему</h2>
            </div>
            <div className="space-y-4">
              <Input value={themeDraft.name} onChange={(event) => setThemeDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Название темы"
                className={cn('h-12 rounded-xl', dark ? 'border-white/10 bg-black/20 text-white' : 'border-gray-200 bg-gray-50')} />
              <Textarea value={themeDraft.description} onChange={(event) => setThemeDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Описание темы"
                className={cn('min-h-28 rounded-xl', dark ? 'border-white/10 bg-black/20 text-white' : 'border-gray-200 bg-gray-50')} />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setThemeDialogOpen(false)}
                className={cn('rounded-xl', dark ? 'border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06]' : 'border-gray-200')}>Отмена</Button>
              <Button onClick={addTheme} className="rounded-xl">Создать тему</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={Boolean(preview) || previewLoading} onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent showCloseButton={false} className={cn(
            'h-[96vh] max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl p-0 sm:max-w-[calc(100vw-2rem)]',
            dark ? 'border-white/10 bg-[#0a0c18] text-white' : 'border-gray-200 bg-white text-gray-900'
          )}>
            <div className={cn('flex items-center justify-between border-b px-5 py-4', dark ? 'border-white/8' : 'border-gray-200')}>
              <div>
                <div className={cn('text-[10px] uppercase tracking-[0.22em]', dark ? 'text-white/35' : 'text-gray-400')}>Предпросмотр</div>
                <div className={cn('mt-1 text-xl font-semibold', dark ? 'text-white' : 'text-gray-900')}>{preview?.file_name || 'Открытие файла...'}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setZoom((value) => Math.max(60, value - 10))}
                  className={cn('rounded-xl', dark ? 'border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06]' : '')}>
                  <ZoomOut className="h-4 w-4" /></Button>
                <span className={cn('text-xs font-mono tabular-nums w-10 text-center', dark ? 'text-white/50' : 'text-gray-500')}>{zoom}%</span>
                <Button variant="outline" size="sm" onClick={() => setZoom((value) => Math.min(200, value + 10))}
                  className={cn('rounded-xl', dark ? 'border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06]' : '')}>
                  <ZoomIn className="h-4 w-4" /></Button>
                <button type="button" onClick={() => setPreview(null)}
                  className={cn('flex h-10 w-10 items-center justify-center rounded-xl border transition',
                    dark ? 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}>
                  <X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="h-[calc(96vh-80px)] overflow-hidden px-5 py-5">
              {previewLoading ? (
                <div className={cn('flex h-full items-center justify-center gap-3', dark ? 'text-white/70' : 'text-gray-500')}>
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />Открытие файла...
                </div>
              ) : preview?.kind === 'pdf' ? (
                <div className={cn('h-full overflow-hidden rounded-xl border', dark ? 'border-white/8 bg-[#eef2f7]' : 'border-gray-200 bg-gray-50')}>
                  {pdfUrl ? <iframe title={preview.file_name} src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&zoom=${zoom}`} className="h-full w-full border-0" /> :
                  <div className="flex h-full items-center justify-center text-gray-500">Не удалось подготовить PDF.</div>}
                </div>
              ) : preview?.kind === 'text' ? (
                <div className={cn('h-full overflow-auto rounded-xl border p-6 scrollbar-none', dark ? 'border-white/8 bg-white/[0.04]' : 'border-gray-200 bg-gray-50')}>
                  <pre className={cn('whitespace-pre-wrap break-words', dark ? 'text-white/85' : 'text-gray-800')} style={{ fontSize: `${zoom / 6 + 10}px`, lineHeight: 1.7 }}>{preview.content}</pre>
                </div>
              ) : (
                <div className={cn('flex h-full items-center justify-center rounded-xl border', dark ? 'border-white/8 bg-white/[0.04] text-white/70' : 'border-gray-200 bg-gray-50 text-gray-500')}>
                  {preview?.content || 'Этот тип файла пока не поддерживается для встроенного предпросмотра.'}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </AppShell>
  )
}
