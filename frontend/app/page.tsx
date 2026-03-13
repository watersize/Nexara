'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { cn } from '@/lib/utils'
import { Plus, Bot, BarChart4, FileText, Play, Pause, ArrowRight, Network } from 'lucide-react'
import { useTheme } from 'next-themes'
import { NexaraHeader } from '@/components/nexara-header'
import { AppShell } from '@/components/app-shell'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function ChevronDown(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
}

function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
}

function GraphsWidget({ dark }: { dark: boolean }) {
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [dots, setDots] = useState<{ x: number; y: number; kind: string }[]>([])
  const router = useRouter()

  useEffect(() => {
    tauriInvoke<{ nodes: any[]; edges: any[] }>('get_all_graph').then(res => {
      if (res?.nodes) {
        setNodeCount(res.nodes.length)
        setEdgeCount((res.edges || []).length)
        // Place dots randomly for mini-preview
        setDots(res.nodes.slice(0, 18).map(n => ({
          x: 10 + Math.random() * 80,
          y: 10 + Math.random() * 70,
          kind: n.kind,
        })))
      }
    }).catch(() => {})
  }, [])

  const kindColor = (kind: string) => {
    if (kind === 'task') return '#6366f1'
    if (kind === 'folder') return '#f59e0b'
    if (kind === 'schedule') return '#10b981'
    return '#3b82f6'
  }

  return (
    <div className={cn('rounded-[24px] p-6 relative overflow-hidden min-h-[220px] flex flex-col', dark ? 'bg-[#0e1020]' : 'bg-[#0e1020]')}>
      {/* Mini graph preview */}
      <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 100 90">
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={i % 3 === 0 ? 3 : 1.5} fill={kindColor(d.kind)} />
        ))}
        {dots.slice(0, dots.length - 1).map((d, i) => (
          i % 2 === 0 ? <line key={`l${i}`} x1={d.x} y1={d.y} x2={dots[i + 1].x} y2={dots[i + 1].y} stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" /> : null
        ))}
      </svg>

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
            <Network className="h-5 w-5 text-indigo-400" />
            Графы
          </h2>
        </div>

        <div className="flex gap-4 mb-4">
          <div>
            <div className="text-2xl font-bold text-white">{nodeCount}</div>
            <div className="text-xs text-white/50">узлов</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{edgeCount}</div>
            <div className="text-xs text-white/50">связей</div>
          </div>
        </div>

        <div className="flex gap-2 mb-2">
          {[
            { color: '#3b82f6', label: 'Заметки' },
            { color: '#6366f1', label: 'Задачи' },
            { color: '#10b981', label: 'Расп.' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1 text-[10px] text-white/50">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
              {l.label}
            </div>
          ))}
        </div>

        <button
          onClick={() => router.push('/graph')}
          className="mt-auto bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2 rounded-full transition-colors w-fit"
        >
          Посмотреть →
        </button>
      </div>
    </div>
  )
}


function QuickAction({ icon: Icon, title, desc, onClick }: any) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted ? resolvedTheme === 'dark' : true
  
  return (
    <button onClick={onClick} className={cn('flex items-center gap-4 rounded-xl px-5 py-4 text-left transition-all', dark ? 'bg-[#1a1b21] hover:bg-[#22242b]' : 'bg-gray-50 border border-gray-100 hover:bg-gray-100')}>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', dark ? 'bg-white/5 text-white/80' : 'bg-black/5 text-black/80')}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-gray-900')}>{title}</div>
        <div className={cn('text-xs mt-0.5 truncate', dark ? 'text-white/45' : 'text-gray-500')}>{desc}</div>
      </div>
      <ArrowRight className={cn('h-4 w-4 shrink-0', dark ? 'text-white/30' : 'text-gray-400')} />
    </button>
  )
}

function StatusBadge({ status }: { status: 'progress' | 'completed' }) {
  if (status === 'completed') {
    return <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-500">Completed</span>
  }
  return <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-500">In progress</span>
}
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Calendar as CalendarIcon } from 'lucide-react'

export default function HomePage() {
  const appState = useAppState()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  useEffect(() => setMounted(true), [])
  const dark = mounted ? resolvedTheme === 'dark' : true
  const [tasks, setTasks] = useState<any[]>([])

  const [filter, setFilter] = useState('all')
  const [duration, setDuration] = useState('week')
  const [completedDuration, setCompletedDuration] = useState('week')

  // Mock Roadmap Projects
  const [projects] = useState([
    { id: 1, name: 'Сайт компании', desc: 'Редизайн и запуск нового корпоративного сайта. Включает разработку макетов, верстку, интеграцию с бэкендом и SEO оптимизацию.', progress: 65, date: '2024-04-15' },
    { id: 2, name: 'Мобильное приложение', desc: 'Разработка приложения для iOS и Android. Включает авторизацию, профиль пользователя, корзину и оплату.', progress: 30, date: '2024-05-20' },
    { id: 3, name: 'Внутренняя CRM', desc: 'Система для отдела продаж. Интеграция с телефонией, воронки продаж, отчетность.', progress: 90, date: '2023-11-01' }
  ])
  const [activeProjectIdx, setActiveProjectIdx] = useState(0)

  const activeProject = projects[activeProjectIdx]

  useEffect(() => {
    async function load() {
      try {
        const tasksResult = await tauriInvoke<any[]>('list_tasks')
        setTasks(Array.isArray(tasksResult) ? tasksResult : [])
      } catch {
        setTasks([])
      }
    }
    void load()
  }, [appState])

  const activeTasks = useMemo(() => {
    let list = tasks.filter((t) => !t.done)
    if (filter === 'urgent') {
       list.sort((a, b) => {
         if (!a.dueDate) return 1
         if (!b.dueDate) return -1
         return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
       })
    } else if (filter === 'important') {
       list.sort((a, b) => {
          const buckets = { 'today': 1, 'week': 2, 'later': 3 }
          return (buckets[a.bucket as keyof typeof buckets] || 4) - (buckets[b.bucket as keyof typeof buckets] || 4)
       })
    }
    return list.slice(0, 4)
  }, [tasks, filter])

  const completedTasks = useMemo(() => tasks.filter((t) => t.done), [tasks])
  const percentComplete = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0

  const durationLabel = duration === 'week' ? 'Неделя' : duration === 'month' ? 'Месяц' : 'Год'
  const completedDurationLabel = completedDuration === 'week' ? 'Неделя' : completedDuration === 'month' ? 'Месяц' : 'Год'

  const activeChartData = useMemo(() => {
    if (duration === 'week') return [
      { label: 'Пн', time: '2ч 15м', height: 40, highlight: false },
      { label: 'Вт', time: '4ч 45м', height: 60, highlight: false },
      { label: 'Ср', time: '3ч 45м', height: 50, highlight: false },
      { label: 'Чт', time: '7ч 55м', height: 85, highlight: true },
      { label: 'Пт', time: '0ч 45м', height: 10, highlight: false },
    ];
    if (duration === 'month') return [
      { label: 'Нед 1', time: '12ч', height: 30, highlight: false },
      { label: 'Нед 2', time: '24ч', height: 70, highlight: true },
      { label: 'Нед 3', time: '18ч', height: 50, highlight: false },
      { label: 'Нед 4', time: '22ч', height: 65, highlight: false },
      { label: 'Нед 5', time: '5ч', height: 20, highlight: false },
    ];
    return [
      { label: 'Кв 1', time: '120ч', height: 60, highlight: false },
      { label: 'Кв 2', time: '145ч', height: 80, highlight: true },
      { label: 'Кв 3', time: '90ч', height: 40, highlight: false },
      { label: 'Кв 4', time: '110ч', height: 50, highlight: false },
      { label: 'Итог', time: '', height: 100, highlight: false },
    ];
  }, [duration])

  const completedCount = useMemo(() => {
    const base = completedTasks.length > 0 ? completedTasks.length : 12;
    if (completedDuration === 'month') return base * 3 + 4;
    if (completedDuration === 'year') return base * 24 + 15;
    return base;
  }, [completedTasks, completedDuration])

  const completedChartPath = useMemo(() => {
    if (completedDuration === 'week') return "M0 80 C 40 80, 60 40, 100 60 C 140 80, 160 30, 200 50 C 240 70, 280 10, 320 30 C 360 50, 380 90, 400 70"
    if (completedDuration === 'month') return "M0 90 C 30 70, 80 80, 120 40 C 160 10, 200 60, 250 30 C 300 10, 350 50, 400 20"
    return "M0 100 C 50 80, 100 20, 150 50 C 200 90, 250 10, 300 40 C 350 80, 380 30, 400 10"
  }, [completedDuration])

  return (
    <AppShell displayName={appState?.authSession?.display_name} email={appState?.authSession?.email}>
      <div className={cn('min-h-screen relative', dark ? 'bg-[#111114]' : 'bg-white')}>
        <NexaraHeader />
        <main className="px-6 pb-16 pt-24 max-w-[1400px] mx-auto">
        
        {/* Top Section */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 mb-8">
          <div>
            <h1 className={cn('text-3xl sm:text-4xl font-bold tracking-tight', dark ? 'text-white' : 'text-gray-900')}>
              Добро пожаловать, {appState?.authSession?.display_name || 'Пользователь'}!
            </h1>
            <p className={cn('mt-2 text-sm', dark ? 'text-white/50' : 'text-gray-500')}>
              Управляй задачами и достигай большего каждый день.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <QuickAction icon={CalendarIcon} title="Планировщик" desc="Управление временем" onClick={() => router.push('/planner')} />
              <QuickAction icon={Bot} title="AI чат" desc="Решение задач" onClick={() => router.push('/chat')} />
              <QuickAction icon={BarChart4} title="Граф связей" desc="Анализ данных" onClick={() => router.push('/graph')} />
              <QuickAction icon={FileText} title="Блокнот" desc="Подготовка отчетов" onClick={() => router.push('/notebook')} />
            </div>
          </div>
        </div>

        <div className="flex justify-center mb-8">
          <div className={cn('inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium border', dark ? 'bg-white/5 border-white/10 text-white/70' : 'bg-gray-50 border-gray-200 text-gray-700')}>
            <span className={cn('font-bold', dark ? 'text-white' : 'text-black')}>{percentComplete}%</span> задач завершено сегодня
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-6">
          
          {/* Active Time Widget (Left pane top) */}
          <div className={cn('rounded-[24px] p-6 relative overflow-hidden', dark ? 'bg-[#1a1b21]' : 'border border-gray-100 bg-white shadow-sm')}>
            <div className="flex items-center justify-between mb-8">
              <h2 className={cn('text-lg font-semibold', dark ? 'text-white' : 'text-gray-900')}>Активность</h2>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <span className={cn('text-sm flex items-center gap-1 cursor-pointer outline-none select-none', dark ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-900')}>
                    {durationLabel} <ChevronDown className="h-4 w-4" />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={cn(dark ? 'bg-[#1a1b21] border-white/10 text-white' : 'bg-white border-gray-200')}>
                  <DropdownMenuItem onClick={() => setDuration('week')}>Неделя</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDuration('month')}>Месяц</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDuration('year')}>Год</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            {/* Fake Chart */}
            <div className="h-48 flex items-end justify-between gap-2 px-2 transition-all duration-300">
              {activeChartData.map((d, i) => (
                <div key={i} className="w-12 flex flex-col items-center gap-3 relative">
                  {d.highlight && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#ff5c35] text-white text-[10px] font-bold px-2 py-0.5 rounded z-10 whitespace-nowrap">
                      {d.time}
                    </div>
                  )}
                  {!d.highlight && d.time && (
                    <span className={cn('text-[10px]', dark ? 'text-white/40' : 'text-gray-400')}>{d.time}</span>
                  )}
                  <div 
                    className={cn("w-full rounded-t-sm transition-all duration-500", d.highlight ? "bg-gradient-to-t from-[#2a2b36] to-[rgba(255,255,255,0.1)] border-t-2 border-[#ff5c35]" : "bg-[#2a2b36]")} 
                    style={{ height: `${d.height}%` }} 
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-4 px-2">
              {activeChartData.map((d) => (
                <div key={d.label} className={cn('text-xs w-12 text-center transition-colors', d.highlight ? (dark ? 'text-white font-bold' : 'text-black font-bold') : (dark ? 'text-white/40' : 'text-gray-400'))}>
                  {d.label}
                </div>
              ))}
            </div>
          </div>

          {/* Roadmap Widget (Right pane top) */}
          <div className={cn('rounded-[24px] p-6 flex flex-col', dark ? 'bg-[#0f111a] border border-white/5 shadow-xl' : 'bg-white border border-gray-100 shadow-sm')}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={cn('text-xl font-bold flex items-center gap-2', dark ? 'text-white' : 'text-gray-900')}>
                Дорожная карта
              </h2>
              <Link href="/roadmap" className={cn('text-sm font-semibold flex items-center gap-1 transition-opacity hover:opacity-70', dark ? 'text-indigo-400' : 'text-indigo-600')}>
                Открыть редактор <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="flex-1 flex flex-col relative group">
              {/* Project Card Preview */}
              <div 
                className="flex-1 rounded-2xl p-6 flex flex-col justify-end relative overflow-hidden bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border transition-all duration-300"
                style={{ borderColor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
              >
                {/* Decorative background blocks */}
                <div className="absolute top-4 right-4 flex gap-2 opacity-50">
                  <div className="w-12 h-3 rounded-full bg-indigo-500/30"></div>
                  <div className="w-8 h-3 rounded-full bg-purple-500/30"></div>
                </div>
                <div className="absolute top-10 right-8 flex gap-2 opacity-30">
                  <div className="w-16 h-3 rounded-full bg-emerald-500/30"></div>
                </div>

                <div className="relative z-10 w-full mt-auto">
                    <h3 className={cn('text-2xl font-bold mb-2', dark ? 'text-white' : 'text-gray-900')}>{activeProject.name}</h3>
                    <p className={cn('text-sm mb-4 line-clamp-2', dark ? 'text-white/60' : 'text-gray-600')}>{activeProject.desc}</p>
                    
                    <div className="flex items-center justify-between mb-2 mt-6">
                        <span className={cn('text-xs font-semibold uppercase tracking-wider', dark ? 'text-white/40' : 'text-gray-500')}>Прогресс проекта</span>
                        <span className={cn('text-xs font-bold', dark ? 'text-white' : 'text-gray-900')}>{activeProject.progress}%</span>
                    </div>
                    <div className={cn('h-1.5 w-full rounded-full overflow-hidden', dark ? 'bg-white/10' : 'bg-gray-200')}>
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000" style={{ width: `${activeProject.progress}%` }} />
                    </div>
                </div>

                {/* Navigation Controls (Visible on hover or always) */}
                <button 
                  onClick={() => setActiveProjectIdx(i => i === 0 ? projects.length - 1 : i - 1)}
                  className={cn('absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all border shadow-lg hover:scale-110', dark ? 'bg-neutral-800/80 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => setActiveProjectIdx(i => (i + 1) % projects.length)}
                  className={cn('absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all border shadow-lg hover:scale-110', dark ? 'bg-neutral-800/80 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900')}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              
              {/* Pagination Dots */}
              <div className="flex justify-center gap-1.5 mt-4">
                {projects.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveProjectIdx(i)}
                    className={cn('h-1.5 rounded-full transition-all duration-300', i === activeProjectIdx ? (dark ? 'w-6 bg-white' : 'w-6 bg-indigo-600') : (dark ? 'w-1.5 bg-white/20' : 'w-1.5 bg-gray-300'))}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Graphs Widget (Left pane bottom) */}
          <GraphsWidget dark={dark} />

          {/* Completed Widget (Right pane bottom) */}
          <div className="rounded-[24px] p-6 relative overflow-hidden bg-[#b19df7] text-black">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">Завершённые задачи</h2>
                <span className="bg-black/10 px-3 py-1 rounded-full text-sm font-semibold">+10% сегодня</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <span className="text-sm font-semibold flex items-center gap-1 cursor-pointer outline-none select-none hover:opacity-80">
                    {completedDurationLabel} <ChevronDown className="h-4 w-4" />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={cn(dark ? 'bg-[#1a1b21] border-white/10 text-white' : 'bg-white border-gray-200')}>
                  <DropdownMenuItem onClick={() => setCompletedDuration('week')}>Неделя</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCompletedDuration('month')}>Месяц</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCompletedDuration('year')}>Год</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="relative h-32 w-full mt-4">
               {/* Synthetic smooth line chart */}
               <svg viewBox="0 0 400 100" className="w-full h-full preserve-3d transition-all duration-500" preserveAspectRatio="none">
                 <path d={`${completedChartPath} V 100 H 0 Z`} fill="rgba(255,255,255,0.2)" />
                 <path d={completedChartPath} fill="none" stroke="white" strokeWidth="3" />
                 <circle cx="280" cy="10" r="4" fill="white" className="drop-shadow-lg" />
                 <circle cx="280" cy="10" r="8" fill="none" stroke="white" strokeWidth="2" className="animate-ping" />
               </svg>
               <div className="absolute top-0 right-[25%] -translate-y-4 -translate-x-3 bg-white text-black font-bold px-3 py-1 rounded-md shadow-xl transition-all duration-300">
                 {completedCount}
                 <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white" />
               </div>
            </div>
          </div>
          
        </div>
      </main>
      </div>
    </AppShell>
  )
}

