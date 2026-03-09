'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'

interface NexaraHeaderProps {
  showBackButton?: boolean
  title?: string
}

export function NexaraHeader({ showBackButton = false, title }: NexaraHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const brandIcon = '/apple-icon.png'

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className={cn(
      'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
      scrolled 
        ? 'bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm' 
        : 'bg-transparent'
    )}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showBackButton ? (
            <Link href="/" className="flex items-center gap-3 group">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M12 15L7 10L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Button>
              <div className="flex items-center gap-2.5">
                <NexaraLogo className="w-8 h-8" src={brandIcon} />
                <span className="font-semibold text-foreground hidden sm:block">
                  {title || 'veyo.ai'}
                </span>
              </div>
            </Link>
          ) : (
            <Link href="/" className="flex items-center gap-2.5 group">
              <NexaraLogo className="w-9 h-9 transition-transform group-hover:scale-105" src={brandIcon} />
              <div className="flex flex-col">
                <span className="text-lg font-bold text-foreground tracking-tight">veyo.ai</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground -mt-0.5">study workspace</span>
              </div>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M3 18C3 14.134 6.13401 11 10 11C13.866 11 17 14.134 17 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </Button>
        </div>
      </div>
    </header>
  )
}

function NexaraLogo({ className, src }: { className?: string; src: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl', className)}>
      <img src={src} alt="veyo.ai" className="h-full w-full object-contain" />
    </div>
  )
}

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const appState = useAppState()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = async () => {
    const nextTheme = resolvedTheme === 'light' ? 'dark' : 'light'
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
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
        <div className="w-5 h-5" />
      </Button>
    )
  }

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={toggleTheme}
      className="h-9 w-9 rounded-xl"
    >
      {resolvedTheme === 'light' ? (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10 2V4M10 16V18M18 10H16M4 10H2M15.66 4.34L14.24 5.76M5.76 14.24L4.34 15.66M15.66 15.66L14.24 14.24M5.76 5.76L4.34 4.34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M17.5 10.73C17.1 13.28 15.12 15.38 12.55 15.87C9.35 16.48 6.16 14.48 5.42 11.28C4.68 8.08 6.69 4.89 9.89 4.28C10.18 4.22 10.46 4.19 10.73 4.17C9.32 6.29 9.32 9.11 10.73 11.23C12.14 13.35 14.78 14.22 17.23 13.49C17.45 12.61 17.54 11.67 17.5 10.73Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </Button>
  )
}
