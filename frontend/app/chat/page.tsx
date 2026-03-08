'use client'

import { useState, useRef, useEffect } from 'react'
import { NexaraHeader } from '@/components/nexara-header'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { SendIcon, Loader2 } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Спроси про тему, домашнее задание или загруженный учебник.' }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    
    const question = input.trim()
    if (!question) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setIsLoading(true)

    try {
      const result = await tauriInvoke<any>('ask_ai', { question })
      const sources = Array.isArray(result.sources) && result.sources.length ? `\n\nИсточники: ${result.sources.join(", ")}` : ""
      setMessages(prev => [...prev, { role: 'assistant', text: `${result.answer || 'Ответ пуст.'}${sources}` }])
    } catch (err: any) {
      console.error('Ask AI failed', err)
      setMessages(prev => [...prev, { role: 'assistant', text: `Ошибка: ${err.message || String(err)}` }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    setMessages([{ role: 'assistant', text: 'История очищена. Можешь задать новый вопрос.' }])
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <NexaraHeader showBackButton title="AI Помощник" />
      
      <main className="flex-1 pt-20 pb-[100px] px-4 sm:px-6 flex flex-col max-w-4xl mx-auto w-full">
        <div className="flex justify-end mb-4">
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground text-xs">
            Очистить чат
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto">
          {messages.map((message, i) => (
            <div
              key={i}
              className={cn(
                "flex w-full",
                message.role === 'user' ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap",
                  message.role === 'user' 
                    ? "bg-primary text-primary-foreground rounded-tr-sm" 
                    : "bg-muted text-foreground rounded-tl-sm border border-border/50"
                )}
              >
                {message.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm bg-muted text-foreground rounded-tl-sm border border-border/50 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Nexara думает...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border/50 p-4 sm:p-6 pb-safe">
        <div className="max-w-4xl mx-auto flex gap-3 items-end">
          <Textarea 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Спроси про тему, домашнее задание..."
            className="resize-none min-h-[52px] max-h-[150px] bg-secondary border-none custom-scrollbar"
            rows={1}
          />
          <Button 
            onClick={handleSend} 
            disabled={!input.trim() || isLoading}
            size="icon"
            className="w-[52px] h-[52px] rounded-xl shrink-0"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <SendIcon className="w-5 h-5" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
