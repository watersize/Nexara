'use client'

import { useEffect, useRef, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { Loader2, SendIcon } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

async function buildWorkspaceContext(appState: ReturnType<typeof useAppState>, accountKey: string) {
  const notesRaw = window.localStorage.getItem(`nexara_notes_v1:${accountKey}`)
  const tasksRaw = window.localStorage.getItem(`nexara_tasks_v1:${accountKey}`)
  const notes = notesRaw ? JSON.parse(notesRaw) : []
  const tasks = tasksRaw ? JSON.parse(tasksRaw) : []
  const lessons = await tauriInvoke<any[]>('get_schedule_for_weekday', {
    weekNumber: appState?.defaultWeekNumber || 1,
    weekday: appState?.defaultWeekday || 1,
  })
  const textbookNames = (appState?.textbooks || []).map((book: any) => book.file_name).join(', ')

  return [
    notes.length ? `Заметки:\n${notes.slice(0, 5).map((note: any) => `- ${note.title}: ${note.content || ''}`).join('\n')}` : '',
    tasks.length ? `Задачи:\n${tasks.slice(0, 6).map((task: any) => `- ${task.title} (${task.subject || 'без предмета'})`).join('\n')}` : '',
    Array.isArray(lessons) && lessons.length ? `Расписание на день:\n${lessons.map((lesson: any) => `- ${lesson.start_time}-${lesson.end_time} ${lesson.subject}`).join('\n')}` : '',
    textbookNames ? `Учебники: ${textbookNames}` : '',
  ].filter(Boolean).join('\n\n')
}

export default function ChatPage() {
  const appState = useAppState()
  const user = appState?.authSession
    ? { displayName: appState.authSession.display_name, email: appState.authSession.email }
    : undefined
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Спроси про тему, домашнее задание, расписание, задачи, заметки или загруженный учебник.' },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const accountKey = user?.email || 'guest'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const question = input.trim()
    if (!question) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: question }])
    setIsLoading(true)
    try {
      let context = ''
      try {
        context = await buildWorkspaceContext(appState, accountKey)
      } catch {}

      const result = await tauriInvoke<any>('ask_ai', { question, context })
      const sources = Array.isArray(result.sources) && result.sources.length ? `\n\nИсточники: ${result.sources.join(', ')}` : ''
      setMessages((prev) => [...prev, { role: 'assistant', text: `${result.answer || 'Ответ пуст.'}${sources}` }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Ошибка: ${err instanceof Error ? err.message : String(err)}` }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-1 flex-col px-5 py-8 sm:px-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">AI чат</div>
            <h1 className="mt-2 text-3xl font-semibold text-white">Помощник по учебе</h1>
          </div>
          <Button
            variant="outline"
            onClick={() => setMessages([{ role: 'assistant', text: 'История очищена. Можешь задать новый вопрос.' }])}
            className="rounded-2xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.06]"
          >
            Очистить
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto rounded-[28px] border border-white/7 bg-white/[0.03] p-5 scrollbar-none">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={index} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6',
                    message.role === 'user'
                      ? 'rounded-tr-sm bg-primary text-white'
                      : 'rounded-tl-sm border border-white/8 bg-white/[0.04] text-white/80',
                  )}
                >
                  {message.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-white/75">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Nexara думает...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <form onSubmit={handleSend} className="mt-4 flex gap-3">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Напиши вопрос..."
            className="min-h-[58px] rounded-2xl border-white/10 bg-white/[0.03] text-white placeholder:text-white/28 dark:border-white/10 dark:bg-white/[0.03]"
          />
          <Button type="submit" disabled={!input.trim() || isLoading} className="h-[58px] w-[58px] rounded-2xl">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendIcon className="h-5 w-5" />}
          </Button>
        </form>
      </main>
    </AppShell>
  )
}
