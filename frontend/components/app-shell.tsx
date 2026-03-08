'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { cn } from '@/lib/utils'
import {
  BookOpen,
  CalendarDays,
  Home,
  MessageCircle,
  MoonStar,
  Notebook,
  Settings,
  SquareCheckBig,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/', label: 'Главная', icon: Home },
  { href: '/notebook', label: 'Блокнот', icon: Notebook },
  { href: '/planner', label: 'Планировщик', icon: SquareCheckBig },
  { href: '/schedule', label: 'Расписание', icon: CalendarDays },
  { href: '/chat', label: 'AI Чат', icon: MessageCircle },
  { href: '/textbooks', label: 'Учебники', icon: BookOpen },
]

export function AppShell({
  children,
  displayName,
  email,
}: {
  children: ReactNode
  displayName?: string
  email?: string
}) {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const appState = useAppState()
  const brandIcon = resolvedTheme === 'light' ? '/icon-light-32x32.png' : '/icon-dark-32x32.png'

  const toggleTheme = async () => {
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    try {
      await tauriInvoke('save_settings', {
        settings: {
          theme: nextTheme === 'light' ? 'theme-light' : 'theme-dark',
          hints_enabled: Boolean(appState?.settings?.hints_enabled),
          enable_3d: Boolean(appState?.settings?.enable_3d),
          reminder_hours: Number(appState?.settings?.reminder_hours ?? 18),
          telegram_enabled: Boolean(appState?.settings?.telegram_enabled),
          telegram_bot_token: appState?.settings?.telegram_bot_token || '',
          telegram_chat_id: appState?.settings?.telegram_chat_id || '',
        },
      })
    } catch {}
  }

  return (
    <div
      className={cn(
        'min-h-screen text-white',
        resolvedTheme === 'light'
          ? 'theme-light-app'
          : 'bg-[radial-gradient(circle_at_top,_rgba(64,88,255,0.22),_transparent_28%),linear-gradient(180deg,_#050814_0%,_#060914_100%)]',
      )}
    >
      <div className="flex min-h-screen">
        <aside className="app-sidebar hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:border-r lg:border-white/6 lg:bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.16),_transparent_32%),linear-gradient(180deg,_rgba(10,12,24,0.98),_rgba(6,8,18,1))] xl:w-60">
          <div className="px-4 pb-4 pt-5 xl:px-5">
            <Link href="/" className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 shadow-lg shadow-primary/15">
                <img src={brandIcon} alt="veyo.ai" className="h-8 w-8" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-white">veyo.ai</div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">study workspace</div>
              </div>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 overflow-hidden px-3 py-2 xl:px-4">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-all duration-200 xl:px-4',
                    active
                      ? 'bg-primary/18 text-white shadow-lg shadow-primary/10 ring-1 ring-primary/25'
                      : 'text-white/60 hover:bg-white/[0.04] hover:text-white',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors',
                      active
                        ? 'border-primary/30 bg-primary/20 text-primary'
                        : 'border-white/8 bg-white/[0.03] text-white/55 group-hover:border-white/15 group-hover:text-white/85',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="truncate font-medium">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="space-y-2 border-t border-white/6 px-3 py-4 xl:px-4">
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-white/60 transition-all hover:bg-white/[0.04] hover:text-white xl:px-4"
            >
              <Settings className="h-4 w-4 shrink-0" />
              Настройки
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm text-white/60 transition-all hover:bg-white/[0.04] hover:text-white xl:px-4"
            >
              <MoonStar className="h-4 w-4 shrink-0" />
              Тема
            </button>

            {(displayName || email) && (
              <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3">
                <div className="truncate text-sm font-medium text-white">{displayName || 'Пользователь'}</div>
                {email && <div className="mt-1 truncate text-xs text-white/45">{email}</div>}
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
