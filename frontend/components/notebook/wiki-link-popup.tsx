'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, FolderOpen, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tauriInvoke } from '@/lib/tauri-bridge'

type SearchResult = {
  id: string
  title: string
  kind: 'note' | 'folder' | 'textbook'
}

type WikiLinkPopupProps = {
  position: { x: number; y: number }
  onSelect: (result: SearchResult) => void
  onClose: () => void
  dark?: boolean
}

const kindIcon = (kind: string) => {
  if (kind === 'folder') return FolderOpen
  if (kind === 'textbook') return BookOpen
  return FileText
}

export function WikiLinkPopup({ position, onSelect, onClose, dark = true }: WikiLinkPopupProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (query.length < 1) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const data = await tauriInvoke<SearchResult[]>('search_notes', { payload: { query } })
        setResults(data || [])
        setSelectedIndex(0)
      } catch {
        setResults([])
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selectedIndex]) {
        onSelect(results[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className={cn(
        'fixed z-[999] w-72 rounded-xl border shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200',
        dark ? 'bg-neutral-900/95 backdrop-blur-xl border-white/10' : 'bg-white border-gray-200 shadow-xl'
      )}
      style={{ left: Math.min(position.x, window.innerWidth - 300), top: Math.min(position.y, window.innerHeight - 300) }}
    >
      <div className={cn('px-3 py-2 border-b', dark ? 'border-white/10' : 'border-gray-100')}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Поиск заметки..."
          className={cn(
            'w-full bg-transparent outline-none text-sm',
            dark ? 'text-white placeholder:text-white/40' : 'text-gray-900 placeholder:text-gray-400'
          )}
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {results.length === 0 && query.length > 0 && (
          <div className={cn('px-4 py-3 text-xs', dark ? 'text-white/40' : 'text-gray-400')}>
            Ничего не найдено
          </div>
        )}
        {results.length === 0 && query.length === 0 && (
          <div className={cn('px-4 py-3 text-xs', dark ? 'text-white/40' : 'text-gray-400')}>
            Введите имя заметки или папки
          </div>
        )}
        {results.map((result, index) => {
          const Icon = kindIcon(result.kind)
          return (
            <button
              key={`${result.kind}-${result.id}`}
              onClick={() => onSelect(result)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
                index === selectedIndex
                  ? (dark ? 'bg-white/10 text-white' : 'bg-blue-50 text-blue-700')
                  : (dark ? 'text-white/70 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50')
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-50" />
              <span className="truncate">{result.title}</span>
              <span className={cn('ml-auto text-[10px] uppercase tracking-wider', dark ? 'text-white/30' : 'text-gray-300')}>
                {result.kind === 'note' ? 'Заметка' : result.kind === 'folder' ? 'Папка' : 'Учебник'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
