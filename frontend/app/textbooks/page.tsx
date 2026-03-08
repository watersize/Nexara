'use client'

import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { FileText, FileUp, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface MaterialRecord {
  hash: string
  file_name: string
  mime_type: string
  stored_path: string
  created_at: string
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

export default function TextbooksPage() {
  const appState = useAppState()
  const user = appState?.authSession
    ? { displayName: appState.authSession.display_name, email: appState.authSession.email }
    : undefined
  const [textbooks, setTextbooks] = useState<MaterialRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadTextbooks = async () => {
    setIsLoading(true)
    try {
      setTextbooks(await tauriInvoke<MaterialRecord[]>('list_textbooks_command'))
    } catch (error) {
      toast.error('Не удалось загрузить учебники', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTextbooks()
  }, [])

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
      toast.success('Учебник загружен')
      await loadTextbooks()
    } catch (error) {
      toast.error('Ошибка загрузки', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-1 flex-col px-5 py-8 sm:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Учебники</div>
            <h1 className="mt-2 text-3xl font-semibold text-white">Библиотека файлов</h1>
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
              Загрузить
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            [0, 1, 2].map((item) => <div key={item} className="h-48 animate-pulse rounded-[24px] border border-white/7 bg-white/[0.04]" />)
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
                      toast.success('Учебник удалён')
                      await loadTextbooks()
                    }}
                    className="rounded-2xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.06]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-4 text-lg font-semibold text-white">{book.file_name}</div>
                <div className="mt-2 text-sm text-white/55">{book.mime_type}</div>
                <div className="mt-5 text-xs text-white/40">
                  {book.created_at ? format(new Date(book.created_at), 'd MMMM yyyy, HH:mm', { locale: ru }) : 'Дата не указана'}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[24px] border border-white/7 bg-white/[0.02] px-5 py-10 text-sm text-white/45">
              Пока нет загруженных учебников
            </div>
          )}
        </div>
      </main>
    </AppShell>
  )
}
