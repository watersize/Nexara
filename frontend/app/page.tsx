'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { cn } from '@/lib/utils'
import { Plus, Bot, BarChart4, FileText, Play, Pause, ArrowRight, ArrowLeft } from 'lucide-react'
import { useTheme } from 'next-themes'
import { NexaraHeader } from '@/components/nexara-header'

function QuickAction({ icon: Icon, title, desc, onClick }: any) {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark' || !resolvedTheme
  
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

export default function HomePage() {
  const appState = useAppState()
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark' || !resolvedTheme
  const [tasks, setTasks] = useState<any[]>([])

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

  const activeTasks = useMemo(() => tasks.filter((t) => !t.done).slice(0, 4), [tasks])
  const completedTasks = useMemo(() => tasks.filter((t) => t.done), [tasks])
  const percentComplete = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0

  return (
    <div className={cn('min-h-screen', dark ? 'bg-[#111114]' : 'bg-white')}>
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
            <button className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl transition-all', dark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90')}>
              +
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <QuickAction icon={Bot} title="AI чат" desc="Решение задач" onClick={() => window.location.href='/chat'} />
              <QuickAction icon={BarChart4} title="Граф связей" desc="Анализ данных" onClick={() => window.location.href='/graph'} />
              <QuickAction icon={FileText} title="Блокнот" desc="Подготовка отчетов" onClick={() => window.location.href='/notebook'} />
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
              <span className={cn('text-sm flex items-center gap-1 cursor-pointer', dark ? 'text-white/50' : 'text-gray-500')}>Неделя <ChevronDown className="h-4 w-4" /></span>
            </div>
            
            {/* Fake Chart */}
            <div className="h-48 flex items-end justify-between gap-2 px-2">
              <div className="w-12 flex flex-col items-center gap-3">
                <span className={cn('text-[10px]', dark ? 'text-white/40' : 'text-gray-400')}>2ч 15м</span>
                <div className="w-full bg-[#2a2b36] rounded-t-sm" style={{ height: '40%' }} />
              </div>
              <div className="w-12 flex flex-col items-center gap-3">
                <span className={cn('text-[10px]', dark ? 'text-white/40' : 'text-gray-400')}>4ч 45м</span>
                <div className="w-full bg-[#2a2b36] rounded-t-sm" style={{ height: '60%' }} />
              </div>
              <div className="w-12 flex flex-col items-center gap-3">
                <span className={cn('text-[10px]', dark ? 'text-white/40' : 'text-gray-400')}>3ч 45м</span>
                <div className="w-full bg-[#2a2b36] rounded-t-sm" style={{ height: '50%' }} />
              </div>
              <div className="w-12 flex flex-col items-center gap-3 relative">
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#ff5c35] text-white text-[10px] font-bold px-2 py-0.5 rounded">7ч 55м</div>
                <div className="w-full bg-gradient-to-t from-[#2a2b36] to-[rgba(255,255,255,0.1)] rounded-t-sm border-t-2 border-[#ff5c35]" style={{ height: '85%' }} />
              </div>
              <div className="w-12 flex flex-col items-center gap-3">
                <span className={cn('text-[10px]', dark ? 'text-white/40' : 'text-gray-400')} />
                <div className="w-full bg-[#2a2b36] rounded-t-sm" style={{ height: '10%' }} />
              </div>
            </div>
            <div className="flex justify-between mt-4 px-2">
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт'].map((d, i) => (
                <div key={d} className={cn('text-xs w-12 text-center', i === 3 ? (dark ? 'text-white font-bold' : 'text-black font-bold') : (dark ? 'text-white/40' : 'text-gray-400'))}>{d}</div>
              ))}
            </div>
          </div>

          {/* Task List Widget (Right pane top) */}
          <div className={cn('rounded-[24px] p-6', dark ? 'bg-white text-black' : 'bg-white border border-gray-100 shadow-sm')}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold">Список задач</h2>
                <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-black">
                  <FilterIcon className="h-4 w-4" /> Фильтр
                </button>
              </div>
              <Link href="/planner" className="text-sm font-semibold flex items-center gap-1 hover:opacity-70">
                Смотреть все <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 mb-4 text-xs font-semibold text-gray-400 px-2">
              <div>Название</div>
              <div>Статус</div>
              <div>Дедлайн</div>
              <div>Потрачено</div>
              <div>Трекинг</div>
            </div>
            
            <div className="space-y-2">
              {activeTasks.map((t, i) => (
                <div key={t.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 py-3 border-b border-gray-100 last:border-0 px-2 group">
                  <div className="font-bold text-[15px] flex items-center gap-2">
                    {t.title} {i === 0 && <span className="text-orange-500 text-lg">🔥</span>}
                  </div>
                  <div><StatusBadge status="progress" /></div>
                  <div className="text-sm font-medium text-gray-600">{t.dueDate ? format(new Date(t.dueDate), 'd MMM') : 'Без даты'}</div>
                  <div className="text-sm font-medium text-gray-600">{t.durationMinutes ? `${Math.floor(t.durationMinutes/60)}ч ${t.durationMinutes%60}м` : '0ч 0м'}</div>
                  <button className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-black hover:bg-black hover:text-white transition-colors">
                    {i === 0 ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                  </button>
                </div>
              ))}
              {activeTasks.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-500">Нет активных задач. Время планировать!</div>
              )}
            </div>
          </div>

          {/* Workflow Widget (Left pane bottom) */}
          <div className="rounded-[24px] p-6 relative overflow-hidden bg-gradient-to-br from-[#d4f8b3] to-[#99e89d] text-black min-h-[220px]">
            <div className="flex items-start justify-between relative z-10">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span className="text-xl">✨</span> Оптимизация
              </h2>
              <div className="flex items-center gap-2">
                <button className="h-8 w-8 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10 transition-colors"><ArrowLeft className="h-4 w-4" /></button>
                <button className="h-8 w-8 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10 transition-colors"><ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
            <p className="mt-4 text-[15px] font-medium max-w-[200px] leading-snug relative z-10">
              Добавь блок "Сводка лекций", чтобы сэкономить 30 минут.
            </p>
            <button className="mt-6 bg-black text-white px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider hover:bg-black/80 transition-hidden relative z-10">
              Настроить
            </button>
            <div className="absolute -bottom-10 -right-10 w-64 h-64 opacity-50 bg-[url('https://images.unsplash.com/photo-1542224566-6e85f2e6772f?auto=format&fit=crop&q=80&w=600')] bg-cover mix-blend-overlay rounded-full" />
          </div>

          {/* Completed Widget (Right pane bottom) */}
          <div className="rounded-[24px] p-6 relative overflow-hidden bg-[#b19df7] text-black">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">Завершённые задачи</h2>
                <span className="bg-black/10 px-3 py-1 rounded-full text-sm font-semibold">+10% сегодня</span>
              </div>
              <span className="text-sm font-semibold flex items-center gap-1 cursor-pointer">Неделя <ChevronDown className="h-4 w-4" /></span>
            </div>
            
            <div className="relative h-32 w-full mt-4">
               {/* Synthetic smooth line chart */}
               <svg viewBox="0 0 400 100" className="w-full h-full preserve-3d" preserveAspectRatio="none">
                 <path d="M0 100 V 80 C 40 80, 60 40, 100 60 C 140 80, 160 30, 200 50 C 240 70, 280 10, 320 30 C 360 50, 380 90, 400 70 V 100 Z" fill="rgba(255,255,255,0.2)" />
                 <path d="M0 80 C 40 80, 60 40, 100 60 C 140 80, 160 30, 200 50 C 240 70, 280 10, 320 30 C 360 50, 380 90, 400 70" fill="none" stroke="white" strokeWidth="3" />
                 <circle cx="280" cy="10" r="4" fill="white" className="drop-shadow-lg" />
                 <circle cx="280" cy="10" r="8" fill="none" stroke="white" strokeWidth="2" className="animate-ping" />
               </svg>
               <div className="absolute top-0 right-[25%] -translate-y-4 -translate-x-3 bg-white text-black font-bold px-3 py-1 rounded-md shadow-xl">
                 {completedTasks.length}
                 <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white" />
               </div>
            </div>
          </div>
          
        </div>
      </main>
    </div>
  )
}

function ChevronDown(props: any) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
}

function FilterIcon(props: any) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
}
