'use client'

import { useEffect, useMemo, useState } from 'react'
import { NexaraHeader } from '@/components/nexara-header'
import { WorkspaceCard } from '@/components/workspace-card'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'

const NOTES_STORAGE_KEY = 'nexara_notes_v1'
const TASKS_STORAGE_KEY = 'nexara_tasks_v1'

function createWorkspaces() {
  return [
    {
      id: 'schedule',
      title: 'Расписание',
      description: 'Недельное расписание, ручной конструктор уроков и быстрый доступ к материалам дня.',
      href: '/schedule',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="4" y="6" width="20" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M4 11H24" stroke="currentColor" strokeWidth="2" />
          <path d="M10 6V3M18 6V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="8" y="15" width="4" height="4" rx="1" fill="currentColor" />
          <rect x="16" y="15" width="4" height="4" rx="1" fill="currentColor" opacity="0.5" />
        </svg>
      ),
      gradient: 'from-primary/15 to-accent/10',
    },
    {
      id: 'notebook',
      title: 'Блокнот',
      description: 'Заметки по предметам, конспекты и быстрые черновики в одном месте.',
      href: '/notebook',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M8 4H20C21.1046 4 22 4.89543 22 6V22C22 23.1046 21.1046 24 20 24H8C6.89543 24 6 23.1046 6 22V6C6 4.89543 6.89543 4 8 4Z" stroke="currentColor" strokeWidth="2" />
          <path d="M10 10H18M10 14H18M10 18H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      gradient: 'from-accent/15 to-primary/10',
      isNew: true,
    },
    {
      id: 'chat',
      title: 'AI помощник',
      description: 'Вопросы по темам, задачам и загруженным учебникам через встроенный чат.',
      href: '/chat',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 24C19.5228 24 24 19.5228 24 14C24 8.47715 19.5228 4 14 4C8.47715 4 4 8.47715 4 14C4 16.0503 4.60103 17.9615 5.62804 19.5714L4 24L8.42857 22.372C10.0385 23.399 11.9497 24 14 24Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="10" cy="14" r="1.5" fill="currentColor" />
          <circle cx="14" cy="14" r="1.5" fill="currentColor" />
          <circle cx="18" cy="14" r="1.5" fill="currentColor" />
        </svg>
      ),
      gradient: 'from-chart-1/15 to-primary/10',
    },
    {
      id: 'textbooks',
      title: 'Учебники',
      description: 'PDF-библиотека и локальная база материалов для ответов по учебнику.',
      href: '/textbooks',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 6C14 6 12 4 8 4C4 4 4 6 4 8V22C4 22 4 20 8 20C12 20 14 22 14 22M14 6C14 6 16 4 20 4C24 4 24 6 24 8V22C24 22 24 20 20 20C16 20 14 22 14 22M14 6V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      gradient: 'from-chart-3/15 to-accent/10',
    },
    {
      id: 'planner',
      title: 'Планировщик',
      description: 'Обычный планировщик задач: дедлайны, приоритеты и список дел на день и неделю.',
      href: '/planner',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M14 8V14L18 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="14" cy="14" r="2" fill="currentColor" />
        </svg>
      ),
      gradient: 'from-chart-4/15 to-chart-1/10',
    },
    {
      id: 'settings',
      title: 'Настройки',
      description: 'Тема, уведомления, профиль и параметры приложения в одном разделе.',
      href: '/settings',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="3" stroke="currentColor" strokeWidth="2" />
          <path d="M14 4V7M14 21V24M24 14H21M7 14H4M21.07 6.93L18.95 9.05M9.05 18.95L6.93 21.07M21.07 21.07L18.95 18.95M9.05 9.05L6.93 6.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      gradient: 'from-muted to-muted/50',
    },
  ]
}

function readCountFromStorage(key: string) {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 text-center">
      <div className="mb-1 text-2xl font-bold text-foreground sm:text-3xl">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

export default function HomePage() {
  const appState = useAppState()
  const workspaces = useMemo(() => createWorkspaces(), [])
  const [notesCount, setNotesCount] = useState(0)
  const [tasksCount, setTasksCount] = useState(0)
  const [lessonsToday, setLessonsToday] = useState(0)

  useEffect(() => {
    setNotesCount(readCountFromStorage(NOTES_STORAGE_KEY))
    setTasksCount(readCountFromStorage(TASKS_STORAGE_KEY))
  }, [])

  useEffect(() => {
    async function loadTodayLessons() {
      if (!appState) return
      try {
        const items = await tauriInvoke<any[]>('get_schedule_for_weekday', {
          weekNumber: appState.defaultWeekNumber,
          weekday: appState.defaultWeekday,
        })
        setLessonsToday(Array.isArray(items) ? items.length : 0)
      } catch {
        setLessonsToday(0)
      }
    }
    void loadTodayLessons()
  }, [appState])

  const textbooksCount = appState?.textbooks?.length ?? 0

  return (
    <div className="min-h-screen bg-background">
      <NexaraHeader />

      <main className="px-4 pb-16 pt-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <section className="mb-16 text-center animate-slide-up">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              School Workspace
            </div>

            <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground text-balance sm:text-5xl lg:text-6xl">
              Твоё учебное
              <span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                пространство
              </span>
            </h1>

            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty sm:text-xl">
              Расписание, учебники, чат и персональный ритм подготовки. Всё в одном месте, без лишних переключений.
            </p>
          </section>

          <section className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Уроков сегодня" value={lessonsToday} />
            <StatCard label="Учебников" value={textbooksCount} />
            <StatCard label="Заметок" value={notesCount} />
            <StatCard label="Задач" value={tasksCount} />
          </section>

          <section className="mb-16">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Рабочие пространства</h2>
              <span className="text-sm text-muted-foreground">Выбери инструмент</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
              {workspaces.map((workspace, index) => (
                <WorkspaceCard
                  key={workspace.id}
                  {...workspace}
                  className={`opacity-0 animate-slide-up stagger-${Math.min(index + 1, 4)}`}
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/50 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <span>Nexara</span>
          <span>Версия 0.3.0</span>
        </div>
      </footer>
    </div>
  )
}
