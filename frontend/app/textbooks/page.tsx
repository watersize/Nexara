'use client'

import { useState, useEffect, useRef } from 'react'
import { NexaraHeader } from '@/components/nexara-header'
import { Button } from '@/components/ui/button'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { FileUp, Trash2, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

interface MaterialRecord {
  hash: string
  file_name: string
  mime_type: string
  stored_path: string
  created_at: string
}

export default function TextbooksPage() {
  const [textbooks, setTextbooks] = useState<MaterialRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadTextbooks = async () => {
    try {
      setIsLoading(true)
      const data = await tauriInvoke<MaterialRecord[]>('list_textbooks_command')
      setTextbooks(data || [])
    } catch (err: any) {
      console.error('Failed to load textbooks', err)
      toast.error('Не удалось загрузить учебники', { description: err.message || String(err) })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTextbooks()
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('Файл слишком большой (максимум 50 МБ)')
      }

      const reader = new FileReader()
      reader.onload = async (ev) => {
        try {
          const result = ev.target?.result as string
          const base64Data = result.split(',')[1] || result

          const payload = {
            file_name: file.name,
            file_base64: base64Data,
            mime_type: file.type || 'application/octet-stream',
          }

          const response = await tauriInvoke<any>('upload_textbook', { payload })
          if (!response.ok) {
            throw new Error(response.message || 'Ошибка загрузки')
          }
          
          toast.success('Учебник загружен')
          loadTextbooks()
        } catch (err: any) {
          console.error('Upload Error:', err)
          toast.error('Ошибка', { description: err.message || String(err) })
        } finally {
          setIsUploading(false)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      }
      reader.onerror = () => {
        setIsUploading(false)
        toast.error('Ошибка чтения файла')
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
      reader.readAsDataURL(file)
    } catch (err: any) {
      toast.error('Ошибка', { description: err.message })
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (hash: string) => {
    if (!window.confirm('Удалить этот учебник?')) return
    try {
      setIsLoading(true)
      const payload = { hash }
      const response = await tauriInvoke<any>('delete_textbook', { payload })
      if (!response.ok) {
        throw new Error(response.message || 'Ошибка удаления')
      }
      toast.success('Учебник удален')
      loadTextbooks()
    } catch (err: any) {
      console.error('Delete Error:', err)
      toast.error('Ошибка', { description: err.message || String(err) })
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <NexaraHeader showBackButton title="Учебники (RAG)" />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 space-y-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Твои учебники</h1>
            <p className="text-muted-foreground">Загрузи PDF для умного поиска ответов в AI чате.</p>
          </div>
          
          <input 
            type="file" 
            accept=".pdf,.doc,.docx,.txt" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Button 
            className="gap-2" 
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            Загрузить документ
          </Button>
        </div>

        {isLoading && textbooks.length === 0 ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : textbooks.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
            <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Нет загруженных материалов</h3>
            <p className="text-muted-foreground mb-4">Нажми «Загрузить документ», чтобы добавить свой первый учебник.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {textbooks.map((book) => {
              let dateParsed = book.created_at
              try {
                if (book.created_at) {
                  dateParsed = format(new Date(book.created_at), 'd MMMM yyyy, HH:mm', { locale: ru })
                }
              } catch (e) {}
              
              return (
                <div key={book.hash} className="bg-card border border-border rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="bg-primary/10 p-3 rounded-lg shrink-0">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(book.hash)}
                      className="text-muted-foreground hover:text-destructive -mr-2 -mt-2 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <h4 className="font-semibold text-foreground line-clamp-2 mb-1" title={book.file_name}>
                    {book.file_name}
                  </h4>
                  <div className="mt-auto pt-4 space-y-1">
                    <p className="text-xs text-muted-foreground">Формат: {book.mime_type.split('/').pop() || 'unknown'}</p>
                    <p className="text-xs text-muted-foreground">Загружено: {dateParsed || 'Неизвестно'}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
