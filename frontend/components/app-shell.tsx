'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { cn } from '@/lib/utils'
import {
  BookOpen, CalendarDays, Home, MessageCircle,
  Network, Notebook, Settings, SquareCheckBig, Sun, MoonStar,
  Map, Route, ListTodo, Calendar, FolderKanban, Clock
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/', label: 'Домой', icon: Home },
  { href: '/planner', label: 'Задачи', icon: ListTodo },
  { href: '/schedule', label: 'Календарь', icon: Calendar },
  { href: '/notebook', label: 'Проекты', icon: FolderKanban },
  { href: '/roadmap', label: 'Дор. карты', icon: Route },
  { href: '/timeline', label: 'Timeline', icon: Clock },
  { href: '/context-map', label: 'Project Context Map', icon: Map },
  { href: '/chat', label: 'AI Чат', icon: MessageCircle },
  { href: '/textbooks', label: 'Учебники', icon: BookOpen },
  { href: '/graph', label: 'Графы', icon: Network },
]

function AvatarRenderer({ fallback }: { fallback: string }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    try { const saved = localStorage.getItem('veyo:avatar'); if (saved) setAvatarUrl(saved) } catch {}
  }, [])
  if (avatarUrl) {
    return <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
  }
  return <>{fallback}</>
}

export function AppShell({
  children,
  displayName,
  email,
  hideSidebar,
}: {
  children: ReactNode
  displayName?: string
  email?: string
  hideSidebar?: boolean
}) {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  const dark = mounted ? resolvedTheme === 'dark' : true // Default dark to prevent gross flashes
  const appState = useAppState()

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

  if (!mounted) {
    // Return a skeleton or invisible shell to avoid hydration mismatch
    return null
  }

  const shellBg = dark
    ? 'bg-[radial-gradient(circle_at_top,_rgba(64,88,255,0.22),_transparent_28%),linear-gradient(180deg,_#050814_0%,_#060914_100%)] text-white'
    : 'bg-gray-50 text-slate-900'

  return (
    <div className={cn('min-h-screen', shellBg)}>
      <div className="flex min-h-screen">
        {!hideSidebar && (
          /* ── Floating pill sidebar ───────────────────────────── */
          <aside className="fixed left-0 top-0 z-30 hidden h-screen lg:flex flex-col items-center py-5 w-[72px] shrink-0">
            <div
              className={cn(
                'flex flex-col h-full w-[56px] rounded-[28px] py-4 px-2 gap-1 shadow-2xl',
                dark
                  ? 'bg-[rgba(12,14,28,0.92)] border border-white/10 backdrop-blur-xl'
                  : 'bg-white border border-gray-200 shadow-lg backdrop-blur-xl',
              )}
            >
              {/* Brand avatar */}
              <Link
                href="/"
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-2xl mx-auto mb-2 shrink-0 border transition-colors',
                  dark ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-gray-200 bg-gray-50 hover:bg-gray-100',
                )}
                title="veyo.ai"
              >
                <img src="/apple-icon.png" alt="veyo.ai" className="h-7 w-7 object-contain rounded-lg" />
              </Link>

              {/* Divider */}
              <div className={cn('mx-3 h-px shrink-0 mb-1', dark ? 'bg-white/8' : 'bg-gray-200')} />

              {/* Nav items */}
              <nav className="flex-1 flex flex-col gap-1 overflow-y-auto scrollbar-hide">
                {NAV_ITEMS.map((item) => {
                  const active = pathname === item.href
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className={cn(
                        'group relative flex h-10 w-10 mx-auto items-center justify-center rounded-2xl transition-all duration-200',
                        active
                          ? 'bg-primary/20 text-primary shadow-lg shadow-primary/20 ring-1 ring-primary/30'
                          : dark
                            ? 'text-white/45 hover:bg-white/8 hover:text-white'
                            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {/* Tooltip */}
                      <span
                        className={cn(
                          'pointer-events-none absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold opacity-0 transition-all duration-150 group-hover:opacity-100 z-50 shadow-xl',
                          dark ? 'bg-white/10 text-white backdrop-blur border border-white/15' : 'bg-gray-900 text-white',
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  )
                })}
              </nav>

              {/* Divider */}
              <div className={cn('mx-3 h-px shrink-0 mt-1', dark ? 'bg-white/8' : 'bg-gray-200')} />

              {/* Bottom: theme + settings */}
              <div className="flex flex-col gap-1 mt-1">
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={dark ? 'Светлая тема' : 'Тёмная тема'}
                  className={cn(
                    'group relative flex h-10 w-10 mx-auto items-center justify-center rounded-2xl transition-all duration-200',
                    dark ? 'text-white/45 hover:bg-white/8 hover:text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700',
                  )}
                >
                  {dark ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                  <span className={cn('pointer-events-none absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold opacity-0 transition-all duration-150 group-hover:opacity-100 z-50 shadow-xl', dark ? 'bg-white/10 text-white backdrop-blur border border-white/15' : 'bg-gray-900 text-white')}>
                    {dark ? 'Светлая тема' : 'Тёмная тема'}
                  </span>
                </button>

                <Link
                  href="/settings"
                  title="Настройки"
                  className={cn(
                    'group relative flex h-10 w-10 mx-auto items-center justify-center rounded-2xl transition-all duration-200',
                    pathname === '/settings'
                      ? 'bg-primary/20 text-primary shadow-lg ring-1 ring-primary/30'
                      : dark
                        ? 'text-white/45 hover:bg-white/8 hover:text-white'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700',
                  )}
                >
                  <Settings className="h-4 w-4" />
                  <span className={cn('pointer-events-none absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold opacity-0 transition-all duration-150 group-hover:opacity-100 z-50 shadow-xl', dark ? 'bg-white/10 text-white backdrop-blur border border-white/15' : 'bg-gray-900 text-white')}>
                    Настройки
                  </span>
                </Link>

                {/* User avatar */}
                {displayName && (
                  <Link
                    href="/settings"
                    title={displayName}
                    className="flex h-10 w-10 mx-auto items-center justify-center rounded-full overflow-hidden border-2 border-primary/30 bg-primary/15 text-primary font-bold text-sm hover:border-primary/50 transition-colors mt-1"
                  >
                    <AvatarRenderer fallback={displayName.charAt(0).toUpperCase()} />
                  </Link>
                )}
              </div>
            </div>
          </aside>
        )}

        <div className={cn('flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden', !hideSidebar && 'lg:pl-[72px]')}>
          {children}
        </div>
      </div>
    </div>
  )
}
