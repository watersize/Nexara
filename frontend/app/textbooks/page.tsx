'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { FileText, FileUp, Loader2, Search, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { toast } from 'sonner'
import { Document, Page, pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

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

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function decodePdf(content: string) {
  const binary = atob(content)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export default function TextbooksPage() {
  const appState = useAppState()
  const user = appState?.authSession
    ? { displayName: appState.authSession.display_name, email: appState.authSession.email }
    : undefined
  const [textbooks, setTextbooks] = useState<MaterialRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [preview, setPreview] = useState<TextbookPreview | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [viewerWidth, setViewerWidth] = useState(960)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfViewportRef = useRef<HTMLDivElement>(null)

  const loadTextbooks = async () => {
    setIsLoading(true)
    try {
      setTextbooks(await tauriInvoke<MaterialRecord[]>('list_textbooks_command'))
    } catch (error) {
      toast.error('?? ??????? ????????? ????????', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadTextbooks()
  }, [])

  useEffect(() => {
    if (!preview || preview.kind !== 'pdf') return
    const updateWidth = () => {
      const next = pdfViewportRef.current?.clientWidth ?? 960
      setViewerWidth(Math.max(480, next - 48))
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    if (pdfViewportRef.current) observer.observe(pdfViewportRef.current)
    return () => observer.disconnect()
  }, [preview])

  const upload = async (file: File) => {
    setIsUploading(true)
    try {
      const data = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(data)
      await tauriInvoke('upload_textbook', {
        payload: {
          file_name: file.name,
          file_base64: base64,
          mime_type: file.type || 'application/octet-stream',
        },
      })
      toast.success('??????? ????????')
      await loadTextbooks()
    } catch (error) {
      toast.error('?????? ????????', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsUploading(false)
    }
  }

  const openPreview = async (book: MaterialRecord) => {
    setIsPreviewLoading(true)
    setPreview(null)
    setNumPages(0)
    setZoom(1)
    try {
      const result = await tauriInvoke<TextbookPreview>('get_textbook_preview', {
        payload: { hash: book.hash },
      })
      setPreview(result)
    } catch (error) {
      toast.error('?? ??????? ??????? ????', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsPreviewLoading(false)
    }
  }

  const closePreview = () => {
    setPreview(null)
    setZoom(1)
    setNumPages(0)
  }

  const pdfBytes = useMemo(() => {
    if (preview?.kind !== 'pdf' || !preview.content) return null
    try {
      return decodePdf(preview.content)
    } catch {
      return null
    }
  }, [preview])

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-1 flex-col px-5 py-8 sm:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">????????</div>
            <h1 className="mt-2 text-3xl font-semibold text-white">?????????? ??????</h1>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="rounded-2xl">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              ?????????
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            [0, 1, 2].map((item) => (
              <div key={item} className="h-48 animate-pulse rounded-[24px] border border-white/7 bg-white/[0.04]" />
            ))
          ) : textbooks.length ? (
            textbooks.map((book) => (
              <article key={book.hash} className="rounded-[24px] border border-white/7 bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                    <FileText className="h-6 w-6" />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await tauriInvoke('delete_textbook', { payload: { hash: book.hash } })
                      toast.success('??????? ??????')
                      await loadTextbooks()
                    }}
                    className="rounded-2xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-4 text-lg font-semibold text-white">{book.file_name}</div>
                <div className="mt-2 text-sm text-white/55">{book.mime_type}</div>

                <button
                  type="button"
                  onClick={() => void openPreview(book)}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary transition hover:text-primary/80"
                >
                  <Search className="h-4 w-4" />
                  ???????????
                </button>

                <div className="mt-5 text-xs text-white/40">
                  {book.created_at
                    ? format(new Date(book.created_at), 'd MMMM yyyy, HH:mm', { locale: ru })
                    : '???? ?? ???????'}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[24px] border border-white/7 bg-white/[0.02] px-5 py-10 text-sm text-white/45">
              ???? ??? ??????????? ?????????
            </div>
          )}
        </div>

        <Dialog open={Boolean(preview) || isPreviewLoading} onOpenChange={(open) => !open && closePreview()}>
          <DialogContent
            showCloseButton={false}
            className="h-[96vh] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[28px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.14),_transparent_32%),linear-gradient(180deg,_rgba(12,14,28,0.98),_rgba(7,9,20,1))] p-0 text-white sm:max-w-[calc(100vw-2rem)]"
          >
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">????????????</div>
                <div className="mt-1 text-xl font-semibold text-white">{preview?.file_name || '???????? ????...'}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom((current) => Math.max(0.75, Number((current - 0.15).toFixed(2))))}
                  className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom((current) => Math.min(2.5, Number((current + 0.15).toFixed(2))))}
                  className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={closePreview}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div ref={pdfViewportRef} className="h-[calc(96vh-80px)] overflow-hidden px-5 py-5">
              {isPreviewLoading ? (
                <div className="flex h-full items-center justify-center gap-3 text-white/70">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ???????? ????...
                </div>
              ) : preview?.kind === 'pdf' ? (
                <div className="h-full overflow-auto rounded-[24px] border border-white/8 bg-[#edf1f7] px-6 py-6 scrollbar-none">
                  {pdfBytes ? (
                    <Document
                      file={{ data: pdfBytes }}
                      loading={<div className="py-8 text-center text-sm text-slate-600">????????????? PDF...</div>}
                      error={<div className="py-8 text-center text-sm text-slate-600">?? ??????? ??????? PDF.</div>}
                      onLoadSuccess={({ numPages: total }) => setNumPages(total)}
                    >
                      <div className="mx-auto flex w-full max-w-full flex-col items-center gap-5">
                        {Array.from({ length: numPages }, (_, index) => (
                          <div key={index + 1} className="overflow-hidden rounded-[18px] bg-white shadow-[0_18px_50px_-22px_rgba(15,23,42,0.45)]">
                            <Page
                              pageNumber={index + 1}
                              width={Math.floor(viewerWidth * zoom)}
                              renderAnnotationLayer={false}
                              renderTextLayer={false}
                              loading=""
                            />
                          </div>
                        ))}
                      </div>
                    </Document>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-600">
                      ?? ??????? ??????????? PDF ??? ?????????????.
                    </div>
                  )}
                </div>
              ) : preview?.kind === 'text' ? (
                <div className="h-full overflow-auto rounded-[24px] border border-white/8 bg-white/[0.04] p-6 scrollbar-none">
                  <pre
                    className="whitespace-pre-wrap break-words text-white/85"
                    style={{ fontSize: `${16 * zoom}px`, lineHeight: 1.7 }}
                  >
                    {preview.content}
                  </pre>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-[24px] border border-white/8 bg-white/[0.04] px-6 py-5 text-white/75">
                    {preview?.content || '???? ?? ?????????????? ??? ?????????????.'}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </AppShell>
  )
}
