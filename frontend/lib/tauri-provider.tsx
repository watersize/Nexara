'use client'

import { useEffect, useState, createContext, useContext } from 'react'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { AuthModal } from '@/components/auth-modal'

interface AppState {
  days: any[]
  subjects: string[]
  authSession: any | null
  settings: any
  textbooks: any[]
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
          textbooks: data.textbooks || [],
          defaultWeekNumber: data.default_week_number || 1,
          defaultWeekday: data.default_weekday || 1,
        })
      } catch (err) {
        console.error('Bootstrap failed', err)
      } finally {
        setIsReady(true)
      }
    }
    void init()
  }, [])

  useEffect(() => {
    async function pushStartupNotifications() {
      if (!appState?.authSession) return
      const email = appState.authSession.email || 'guest'
      const todayKey = `nexara_notify_tasks:${email}:${new Date().toISOString().slice(0, 10)}`
      try {
        const tasks = await tauriInvoke<any[]>('list_tasks')
        const dueToday = Array.isArray(tasks)
          ? tasks.filter((task: any) => !task.done && (task.due_date || task.dueDate) === new Date().toISOString().slice(0, 10))
          : []
        if (appState.settings?.hints_enabled && dueToday.length && !window.sessionStorage.getItem(todayKey)) {
          await tauriInvoke('notify_status', {
            title: 'veyo.ai',
            body: `?? ??????? ???? ${dueToday.length} ?????`,
          })
          window.sessionStorage.setItem(todayKey, '1')
        }
      } catch {}

      try {
        const notifyKey = `nexara_notify_schedule:${email}:${new Date().toISOString().slice(0, 10)}`
        const lessons = await tauriInvoke<any[]>('get_schedule_for_weekday', {
          weekNumber: appState.defaultWeekNumber,
          weekday: appState.defaultWeekday,
        })
        if (!Array.isArray(lessons) || !lessons.length || window.sessionStorage.getItem(notifyKey)) return
        const now = new Date()
        const upcoming = lessons.find((lesson) => {
          if (!lesson?.start_time) return false
          const [hours, minutes] = String(lesson.start_time).split(':').map(Number)
          const start = new Date()
          start.setHours(hours || 0, minutes || 0, 0, 0)
          const delta = start.getTime() - now.getTime()
          return delta > 0 && delta <= 2 * 60 * 60 * 1000
        })
        if (appState.settings?.enable_3d && upcoming) {
          await tauriInvoke('notify_status', {
            title: 'veyo.ai',
            body: `????? ${upcoming.subject} ? ${upcoming.start_time}`,
          })
          window.sessionStorage.setItem(notifyKey, '1')
        }
      } catch {}
    }

    void pushStartupNotifications()
  }, [appState])

  if (!isReady) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">???????? ????????????...</div>
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
