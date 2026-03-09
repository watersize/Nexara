'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { NexaraHeader } from '@/components/nexara-header'
import { WorkspaceCard } from '@/components/workspace-card'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'

function workspaces() {
  return [
    { id: 'schedule', title: 'Расписание', description: 'Недели, дни и учебная нагрузка.', href: '/schedule', icon: <span className="text-2xl">📅</span>, gradient: 'from-primary/15 to-accent/10' },
    { id: 'planner', title: 'Планировщик', description: 'Канбан, список и временные слоты.', href: '/planner', icon: <span className="text-2xl">✓</span>, gradient: 'from-accent/15 to-primary/10' },
    { id: 'chat', title: 'AI чат', description: 'Ответы с контекстом из всего пространства.', href: '/chat', icon: <span className="text-2xl">◎</span>, gradient: 'from-chart-1/15 to-primary/10' },
    { id: 'textbooks', title: 'Учебники', description: 'PDF, TXT и быстрый просмотр внутри приложения.', href: '/textbooks', icon: <span className="text-2xl">▤</span>, gradient: 'from-chart-3/15 to-accent/10' },
  ]
}

function DashboardWidget({ title, value, hint }: { title: string; value: string | number; hint: string }) {
  return <div className="rounded-[24px] border border-border/50 bg-card p-5"><div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{title}</div><div className="mt-3 text-3xl font-semibold text-foreground">{value}</div><div className="mt-2 text-sm text-muted-foreground">{hint}</div></div>
}

export default function HomePage() {
  const appState = useAppState()
  const [notes, setNotes] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [lessons, setLessons] = useState<any[]>([])
  const brandIcon = '/apple-icon.png'

  useEffect(() => {
    async function load() {
      try {
        const [notesResult, tasksResult, lessonResult] = await Promise.all([
          tauriInvoke<any[]>('list_notes'),
          tauriInvoke<any[]>('list_tasks'),
          tauriInvoke<any[]>('get_schedule_for_weekday', {
            weekNumber: appState?.defaultWeekNumber || 1,
            weekday: appState?.defaultWeekday || 1,
          }),
        ])
        setNotes(Array.isArray(notesResult) ? notesResult : [])
        setTasks(Array.isArray(tasksResult) ? tasksResult : [])
        setLessons(Array.isArray(lessonResult) ? lessonResult : [])
      } catch {
        setNotes([])
        setTasks([])
        setLessons([])
      }
    }
    void load()
  }, [appState])

  const activeTasks = useMemo(() => tasks.filter((task) => !task.done), [tasks])
  const recentFiles = useMemo(() => (appState?.textbooks || []).slice(0, 3), [appState])
  const todayLabel = format(new Date(), 'd MMMM yyyy', { locale: ru })

  return (
    <div className="min-h-screen bg-background">
      <NexaraHeader />
      <main className="px-4 pb-16 pt-24 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <section className="mb-10 rounded-[34px] border border-border/50 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_34%),linear-gradient(180deg,_rgba(11,13,23,0.98),_rgba(6,8,18,1))] p-8 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"><span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />veyo.ai workspace</div>
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-white/5 p-2 shadow-[0_24px_80px_-36px_rgba(91,140,255,0.45)]"><img src={brandIcon} alt="veyo.ai" className="h-full w-full object-cover" /></div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">Твоё рабочее<span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">пространство</span></h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-white/60">Локальная база, учебники, задачи, расписание и AI-помощник в одном минималистичном рабочем пространстве.</p>
          </section>

          <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardWidget title="Уроков сегодня" value={lessons.length} hint={todayLabel} />
            <DashboardWidget title="Активные задачи" value={activeTasks.length} hint="нужно закрыть" />
            <DashboardWidget title="Заметки" value={notes.length} hint="локально сохранено" />
            <DashboardWidget title="Учебники" value={appState?.textbooks?.length || 0} hint="доступно для RAG" />
          </section>

          <section className="mb-8 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] border border-border/50 bg-card p-6">
              <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold text-foreground">Текущие задачи</h2><Link href="/planner" className="text-sm text-primary">Открыть планировщик</Link></div>
              <div className="space-y-3">
                {activeTasks.slice(0, 4).map((task) => <div key={task.id || task.task_id} className="rounded-[20px] border border-border/50 bg-background/60 px-4 py-3"><div className="text-base font-semibold text-foreground">{task.title}</div><div className="mt-1 text-sm text-muted-foreground">{task.topic || 'Без темы'}</div></div>)}
                {!activeTasks.length ? <div className="rounded-[20px] border border-border/50 bg-background/60 px-4 py-6 text-sm text-muted-foreground">Пока нет активных задач</div> : null}
              </div>
            </div>
            <div className="rounded-[28px] border border-border/50 bg-card p-6">
              <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold text-foreground">Недавние файлы</h2><Link href="/textbooks" className="text-sm text-primary">Открыть библиотеку</Link></div>
              <div className="space-y-3">
                {recentFiles.map((file: any) => <div key={file.hash} className="rounded-[20px] border border-border/50 bg-background/60 px-4 py-3"><div className="text-base font-semibold text-foreground">{file.file_name}</div><div className="mt-1 text-sm text-muted-foreground">{file.mime_type}</div></div>)}
                {!recentFiles.length ? <div className="rounded-[20px] border border-border/50 bg-background/60 px-4 py-6 text-sm text-muted-foreground">Здесь появятся последние учебники</div> : null}
              </div>
            </div>
          </section>

          <section className="mb-16">
            <div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-semibold text-foreground">Рабочие пространства</h2><span className="text-sm text-muted-foreground">Главные модули системы</span></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{workspaces().map((workspace) => <WorkspaceCard key={workspace.id} {...workspace} />)}</div>
          </section>
        </div>
      </main>
      <footer className="border-t border-border/50 px-4 py-8 sm:px-6"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row"><span>veyo.ai</span><span>Версия 1.0.0</span></div></footer>
    </div>
  )
}

