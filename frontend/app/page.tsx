'use client'

import { NexaraHeader } from '@/components/nexara-header'
import { WorkspaceCard } from '@/components/workspace-card'

const workspaces = [
  {
    id: 'schedule',
    title: 'Расписание',
    description: 'Умное расписание уроков с AI-парсингом. Загрузи фото или текст — Nexara сама распознает.',
    href: '/schedule',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="4" y="6" width="20" height="18" rx="3" stroke="currentColor" strokeWidth="2"/>
        <path d="M4 11H24" stroke="currentColor" strokeWidth="2"/>
        <path d="M10 6V3M18 6V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <rect x="8" y="15" width="4" height="4" rx="1" fill="currentColor"/>
        <rect x="16" y="15" width="4" height="4" rx="1" fill="currentColor" opacity="0.5"/>
      </svg>
    ),
    gradient: 'from-primary/15 to-accent/10'
  },
  {
    id: 'notebook',
    title: 'Блокнот',
    description: 'Заметки по предметам, домашние задания и конспекты. Всё в одном месте.',
    href: '/notebook',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M8 4H20C21.1046 4 22 4.89543 22 6V22C22 23.1046 21.1046 24 20 24H8C6.89543 24 6 23.1046 6 22V6C6 4.89543 6.89543 4 8 4Z" stroke="currentColor" strokeWidth="2"/>
        <path d="M10 10H18M10 14H18M10 18H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    gradient: 'from-accent/15 to-primary/10',
    isNew: true
  },
  {
    id: 'ai-chat',
    title: 'AI Помощник',
    description: 'Спроси про тему, реши задачу или получи объяснение из загруженных учебников.',
    href: '/chat',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 24C19.5228 24 24 19.5228 24 14C24 8.47715 19.5228 4 14 4C8.47715 4 4 8.47715 4 14C4 16.0503 4.60103 17.9615 5.62804 19.5714L4 24L8.42857 22.372C10.0385 23.399 11.9497 24 14 24Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="10" cy="14" r="1.5" fill="currentColor"/>
        <circle cx="14" cy="14" r="1.5" fill="currentColor"/>
        <circle cx="18" cy="14" r="1.5" fill="currentColor"/>
      </svg>
    ),
    gradient: 'from-chart-1/15 to-primary/10'
  },
  {
    id: 'textbooks',
    title: 'Учебники',
    description: 'RAG-база твоих учебников. Загрузи PDF и получай точные ответы по материалу.',
    href: '/textbooks',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 6C14 6 12 4 8 4C4 4 4 6 4 8V22C4 22 4 20 8 20C12 20 14 22 14 22M14 6C14 6 16 4 20 4C24 4 24 6 24 8V22C24 22 24 20 20 20C16 20 14 22 14 22M14 6V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    gradient: 'from-chart-3/15 to-accent/10'
  },
  {
    id: 'planner',
    title: 'AI Планировщик',
    description: 'Персональный план подготовки на день. AI анализирует нагрузку и предлагает оптимальный ритм.',
    href: '/planner',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="2"/>
        <path d="M14 8V14L18 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="14" cy="14" r="2" fill="currentColor"/>
      </svg>
    ),
    gradient: 'from-chart-4/15 to-chart-1/10'
  },
  {
    id: 'settings',
    title: 'Настройки',
    description: 'Темы, уведомления, Telegram-интеграция и синхронизация аккаунта.',
    href: '/settings',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="3" stroke="currentColor" strokeWidth="2"/>
        <path d="M14 4V7M14 21V24M24 14H21M7 14H4M21.07 6.93L18.95 9.05M9.05 18.95L6.93 21.07M21.07 21.07L18.95 18.95M9.05 9.05L6.93 6.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    gradient: 'from-muted to-muted/50'
  }
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <NexaraHeader />
      
      <main className="pt-24 pb-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <section className="text-center mb-16 animate-slide-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              School AI Planner
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 tracking-tight text-balance">
              Твоё учебное
              <span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                пространство
              </span>
            </h1>
            
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
              Расписание, учебники, AI-чат и персональный ритм подготовки. 
              Всё в одном месте, с умным помощником.
            </p>
          </section>

          {/* Quick Stats */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
            <StatCard label="Уроков сегодня" value="6" />
            <StatCard label="Учебников" value="12" />
            <StatCard label="Заметок" value="24" />
            <StatCard label="AI запросов" value="48" />
          </section>

          {/* Workspaces Grid */}
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-foreground">Рабочие пространства</h2>
              <span className="text-sm text-muted-foreground">Выбери инструмент</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {workspaces.map((workspace, index) => (
                <WorkspaceCard
                  key={workspace.id}
                  {...workspace}
                  className={`opacity-0 animate-slide-up stagger-${Math.min(index + 1, 4)}`}
                />
              ))}
            </div>
          </section>

          {/* Quick Actions */}
          <section className="bg-gradient-to-br from-card via-card to-primary/5 rounded-2xl border border-border/50 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Быстрый старт</h3>
                <p className="text-sm text-muted-foreground">Загрузи расписание или начни чат с AI-помощником</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/20">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M9 3V15M3 9H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Добавить расписание
                </button>
                <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground font-medium text-sm transition-all hover:bg-secondary/80">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="9" cy="9" r="2" fill="currentColor"/>
                  </svg>
                  Спросить AI
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>Nexara AI Planner</span>
          <span>Версия 2.0</span>
        </div>
      </footer>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border border-border/50 p-4 text-center">
      <div className="text-2xl sm:text-3xl font-bold text-foreground mb-1">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
