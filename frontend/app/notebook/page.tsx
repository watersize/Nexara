'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppState } from '@/lib/tauri-provider'
import { Plus, Search, Trash2 } from 'lucide-react'

interface NoteItem {
  id: string
  title: string
  subject: string
  content: string
  updatedAt: string
}

const STORAGE_KEY = 'nexara_notes_v1'

function seedNotes(): NoteItem[] {
  return [
    {
      id: 'note-1',
      title: 'Формулы по физике',
      subject: 'Физика',
      content: 'Второй закон Ньютона: F = ma\n\nЗакон сохранения энергии: E = mc²\n\nСкорость света: c = 3×10⁸ м/с',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'note-2',
      title: 'Конспект по истории',
      subject: 'История',
      content: 'Первая мировая война (1914-1918)\n\nПричины:\n- борьба за колонии\n- гонка вооружений',
      updatedAt: new Date(Date.now() - 3600_000).toISOString(),
    },
  ]
}

export default function NotebookPage() {
  const appState = useAppState()
  const user = appState?.authSession
    ? { displayName: appState.authSession.display_name, email: appState.authSession.email }
    : undefined
  const storageKey = `${STORAGE_KEY}:${user?.email || 'guest'}`

  const [notes, setNotes] = useState<NoteItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      const parsed = raw ? (JSON.parse(raw) as NoteItem[]) : []
      setNotes(parsed)
      setSelectedId(parsed[0]?.id || '')
    } catch {
      const fallback: NoteItem[] = []
      setNotes(fallback)
      setSelectedId(fallback[0]?.id || '')
    }
  }, [storageKey])

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(notes))
  }, [storageKey, notes])

  const filteredNotes = useMemo(
    () =>
      notes.filter((note) => {
        const haystack = `${note.title} ${note.subject} ${note.content}`.toLowerCase()
        return haystack.includes(search.toLowerCase())
      }),
    [notes, search],
  )

  const selectedNote = filteredNotes.find((note) => note.id === selectedId) || notes.find((note) => note.id === selectedId) || filteredNotes[0]

  useEffect(() => {
    if (!selectedId && filteredNotes[0]) {
      setSelectedId(filteredNotes[0].id)
    }
  }, [filteredNotes, selectedId])

  const updateNote = (id: string, patch: Partial<NoteItem>) => {
    setNotes((current) =>
      current.map((note) =>
        note.id === id
          ? { ...note, ...patch, updatedAt: new Date().toISOString() }
          : note,
      ),
    )
  }

  const addNote = () => {
    const note: NoteItem = {
      id: `note-${Date.now()}`,
      title: 'Новая заметка',
      subject: '',
      content: '',
      updatedAt: new Date().toISOString(),
    }
    setNotes((current) => [note, ...current])
    setSelectedId(note.id)
  }

  const removeNote = (id: string) => {
    const next = notes.filter((note) => note.id !== id)
    setNotes(next)
    if (selectedId === id) {
      setSelectedId(next[0]?.id || '')
    }
  }

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="flex min-h-screen flex-1 overflow-hidden">
        <section className="flex w-[320px] shrink-0 flex-col border-r border-white/6 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/6 px-5 py-5">
            <h1 className="text-2xl font-semibold text-white">Заметки</h1>
            <button
              type="button"
              onClick={addNote}
              className="rounded-xl p-2 text-white/75 transition-all hover:bg-white/[0.05] hover:text-white"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-white/35" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск заметок..."
                className="h-12 rounded-2xl border-white/10 bg-white/[0.03] pl-10 text-white placeholder:text-white/28 dark:border-white/10 dark:bg-white/[0.03]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-none">
            {filteredNotes.map((note) => (
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
                <div className="mt-1 line-clamp-2 text-sm text-white/55">{note.content}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-white/40">
                  <span className="rounded-full bg-primary/12 px-2 py-1 text-primary">{note.subject || 'Без предмета'}</span>
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
                <div className="flex min-w-0 items-center gap-3">
                  <Input
                    value={selectedNote.title}
                    onChange={(event) => updateNote(selectedNote.id, { title: event.target.value })}
                    className="h-11 border-none bg-transparent px-0 text-3xl font-semibold text-white shadow-none focus-visible:ring-0"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeNote(selectedNote.id)}
                  className="rounded-xl p-2 text-red-300 transition-all hover:bg-red-500/10 hover:text-red-100"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-white/6 px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    value={selectedNote.subject}
                    onChange={(event) => updateNote(selectedNote.id, { subject: event.target.value })}
                    placeholder="Предмет"
                    className="h-10 w-44 rounded-xl border-white/10 bg-white/[0.03] text-white placeholder:text-white/28 dark:border-white/10 dark:bg-white/[0.03]"
                  />
                  <span className="text-xs text-white/35">Сохранено автоматически</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-none">
                <textarea
                  value={selectedNote.content}
                  onChange={(event) => updateNote(selectedNote.id, { content: event.target.value })}
                  placeholder="Начни писать заметку..."
                  className="min-h-full w-full resize-none border-none bg-transparent text-lg leading-8 text-white outline-none placeholder:text-white/25"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-white/45">Выбери заметку или создай новую</div>
          )}
        </section>
      </main>
    </AppShell>
  )
}
