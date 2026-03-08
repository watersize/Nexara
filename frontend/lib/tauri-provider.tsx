'use client'

import { useEffect, useState, createContext, useContext } from 'react'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { AuthModal } from '@/components/auth-modal'

interface AppState {
  days: any[]
  subjects: string[]
  authSession: any | null
  settings: any
  defaultWeekNumber: number
  defaultWeekday: number
}

const AppStateContext = createContext<AppState | null>(null)

export function useAppState() {
  return useContext(AppStateContext)
}

export function TauriProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false)
  const [appState, setAppState] = useState<AppState | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const data = await tauriInvoke<any>('bootstrap_app')
        setAppState({
          days: data.days || [],
          subjects: data.subjects || [],
          authSession: data.auth_session || null,
          settings: data.settings || {},
          defaultWeekNumber: data.default_week_number || 1,
          defaultWeekday: data.default_weekday || 1,
        })
      } catch (err) {
        console.error('Bootstrap failed', err)
      } finally {
        setIsReady(true)
      }
    }
    init()
  }, [])

  if (!isReady) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Загрузка пространства...</div>
      </div>
    )
  }

  return (
    <AppStateContext.Provider value={appState}>
      {children}
      <AuthModal isOpen={!appState?.authSession} />
    </AppStateContext.Provider>
  )
}
