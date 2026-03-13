'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { useTheme } from 'next-themes'
import { Bell, Bot, Download, Lock, MoonStar, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function SettingsCard({
  title,
  children,
  dark,
}: {
  title: string
  children: React.ReactNode
  dark: boolean
}) {
  return (
    <section className={cn('overflow-hidden rounded-[26px] border', dark ? 'border-white/7 bg-white/[0.03]' : 'border-gray-200 bg-white')}>
      <div className={cn('border-b px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.24em]', dark ? 'border-white/6 text-white/35' : 'border-gray-100 text-gray-400')}>
        {title}
      </div>
      <div>{children}</div>
    </section>
  )
}

function SettingsRow({
  icon,
  title,
  description,
  trailing,
  danger = false,
  dark = true,
}: {
  icon: React.ReactNode
  title: string
  description: string
  trailing?: React.ReactNode
  danger?: boolean
  dark?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', danger ? 'bg-red-500/10 text-red-400' : (dark ? 'bg-white/[0.04] text-white/70' : 'bg-gray-100 text-gray-500'))}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className={cn('text-lg font-semibold', danger ? 'text-red-400' : (dark ? 'text-white' : 'text-gray-900'))}>{title}</div>
          <div className={cn('mt-1 text-sm', dark ? 'text-white/50' : 'text-gray-500')}>{description}</div>
        </div>
      </div>
      {trailing}
    </div>
  )
}

export default function SettingsPage() {
  const appState = useAppState()
  const user = appState?.authSession
    ? { displayName: appState.authSession.display_name, email: appState.authSession.email }
    : undefined
  const { resolvedTheme, setTheme } = useTheme()

  const [taskNotifications, setTaskNotifications] = useState(true)
  const [scheduleNotifications, setScheduleNotifications] = useState(true)
  const [reminder, setReminder] = useState(18)
  const [nickname, setNickname] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { const saved = localStorage.getItem('veyo:avatar'); if (saved) setAvatarUrl(saved) } catch {}
  }, [])

  useEffect(() => {
    if (!appState) return
    setTaskNotifications(Boolean(appState.settings?.hints_enabled))
    setScheduleNotifications(Boolean(appState.settings?.enable_3d))
    setReminder(Number(appState.settings?.reminder_hours ?? 18))
    setNickname(appState.authSession?.display_name || '')
    if (appState.settings?.theme === 'theme-dark') {
      setTheme('dark')
    } else if (appState.settings?.theme === 'theme-light') {
      setTheme('light')
    }
  }, [appState, setTheme])

  const version = useMemo(() => 'veyo.ai v1.5.0', [])
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted ? resolvedTheme !== 'light' : true

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      setAvatarUrl(url)
      try { localStorage.setItem('veyo:avatar', url) } catch {}
    }
    reader.readAsDataURL(file)
  }

  const saveSettings = async (themeOverride?: 'light' | 'dark') => {
    setIsSavingSettings(true)
    try {
      await tauriInvoke('save_settings', {
        settings: {
          theme: (themeOverride || resolvedTheme) === 'light' ? 'theme-light' : 'theme-dark',
          hints_enabled: taskNotifications,
          enable_3d: scheduleNotifications,
          reminder_hours: reminder,
          telegram_enabled: false,
          telegram_bot_token: '',
          telegram_chat_id: '',
        },
      })
      toast.success('Настройки сохранены')
    } catch (error) {
      toast.error('Не удалось сохранить настройки', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsSavingSettings(false)
    }
  }

  const saveNickname = async () => {
    setIsSavingProfile(true)
    try {
      await tauriInvoke('update_profile', { displayName: nickname })
      toast.success('Никнейм обновлён')
      window.location.reload()
    } catch (error) {
      toast.error('Не удалось обновить никнейм', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsSavingProfile(false)
    }
  }

  const toggleTheme = async (checked: boolean) => {
    const nextTheme = checked ? 'dark' : 'light'
    setTheme(nextTheme)
    await saveSettings(nextTheme)
  }

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className={cn('mx-auto flex min-h-screen w-full max-w-5xl flex-1 flex-col px-5 py-8 sm:px-8')}>
        <div className="space-y-6">
          <section className={cn('rounded-[26px] border p-5', dark ? 'border-white/7 bg-white/[0.03]' : 'border-gray-200 bg-white')}>
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div
                  role="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-primary text-2xl font-semibold text-white overflow-hidden hover:ring-4 ring-primary/30 transition-all"
                  title="Нажмите чтобы сменить аватарку"
                >
                  {avatarUrl
                    ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                    : (nickname || user?.displayName || user?.email || 'П').slice(0, 1).toUpperCase()
                  }
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Pencil className="h-5 w-5 text-white" />
                  </div>
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <div>
                  <div className={cn('text-2xl font-semibold', dark ? 'text-white' : 'text-gray-900')}>{nickname || user?.displayName || 'Пользователь'}</div>
                  <div className={cn('mt-1 text-sm', dark ? 'text-white/50' : 'text-gray-500')}>{user?.email || 'Профиль не заполнен'}</div>
                </div>
              </div>

              <div className="flex w-full max-w-md flex-col gap-3 md:w-auto">
                <div className="relative">
                  <Pencil className={cn('pointer-events-none absolute left-3 top-3.5 h-4 w-4', dark ? 'text-white/35' : 'text-gray-400')} />
                  <Input
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    placeholder="Измени никнейм"
                    className={cn('h-12 rounded-2xl pl-10', dark ? 'border-white/10 bg-black/20 text-white placeholder:text-white/28' : 'border-gray-200 bg-gray-50 text-gray-900')}
                  />
                </div>
                <Button onClick={saveNickname} disabled={isSavingProfile || !nickname.trim()} className="rounded-2xl">
                  Сохранить никнейм
                </Button>
              </div>
            </div>
          </section>

          <SettingsCard title="Внешний вид" dark={dark}>
            <SettingsRow
              icon={<MoonStar className="h-5 w-5" />}
              title="Переключение темы"
              description={`Сейчас: ${resolvedTheme === 'light' ? 'светлая' : 'тёмная'}`}
              trailing={<Switch checked={resolvedTheme !== 'light'} onCheckedChange={toggleTheme} />}
              dark={dark}
            />
          </SettingsCard>

          <SettingsCard title="Уведомления" dark={dark}>
            <SettingsRow icon={<Bell className="h-5 w-5" />} title="Напоминания о задачах" description="Показывать уведомления о задачах на сегодня" dark={dark} trailing={<Switch checked={taskNotifications} onCheckedChange={setTaskNotifications} />} />
            <div className={cn('border-t', dark ? 'border-white/6' : 'border-gray-100')} />
            <SettingsRow icon={<Download className="h-5 w-5" />} title="Напоминания о расписании" description="Показывать уведомление о ближайшем уроке" dark={dark} trailing={<Switch checked={scheduleNotifications} onCheckedChange={setScheduleNotifications} />} />
            <div className={cn('border-t', dark ? 'border-white/6' : 'border-gray-100')} />
            <SettingsRow
              icon={<Bell className="h-5 w-5" />}
              title="Время напоминания"
              description={`Напоминать за ${reminder} ч. до дедлайна`}
              dark={dark}
              trailing={
                <Input
                  type="number" min={0} max={23} value={reminder}
                  onChange={(event) => setReminder(Number(event.target.value) || 0)}
                  className={cn('h-11 w-24 rounded-2xl', dark ? 'border-white/10 bg-black/20 text-white' : 'border-gray-200 bg-gray-50 text-gray-900')}
                />
              }
            />
          </SettingsCard>

          <SettingsCard title="AI помощник" dark={dark}>
            <SettingsRow icon={<Bot className="h-5 w-5" />} title="Модель AI" description="llama-3.3-70b-versatile (GROQ)" dark={dark} />
            <div className={cn('border-t', dark ? 'border-white/6' : 'border-gray-100')} />
            <SettingsRow icon={<Lock className="h-5 w-5" />} title="GROQ API ключ" description="Встроен в приложение" dark={dark} />
          </SettingsCard>

          <SettingsCard title="Данные" dark={dark}>
            <SettingsRow
              icon={<Trash2 className="h-5 w-5" />}
              title="Очистить историю чата"
              description="Удалить все сообщения"
              dark={dark}
              trailing={
                <Button variant="outline" onClick={() => toast.success('История чата очищена')}
                  className={cn('rounded-2xl', dark ? 'border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')}
                >Очистить</Button>
              }
            />
            <div className={cn('border-t', dark ? 'border-white/6' : 'border-gray-100')} />
            <SettingsRow
              icon={<Trash2 className="h-5 w-5" />}
              title="Удалить аккаунт"
              description="Заметки, задачи и расписание на этом устройстве"
              danger
              dark={dark}
              trailing={<Button variant="destructive" onClick={() => tauriInvoke('delete_account').then(() => window.location.reload())} className="rounded-2xl">Удалить</Button>}
            />
          </SettingsCard>

          <section className="flex flex-wrap gap-3">
            <Button onClick={() => void saveSettings()} disabled={isSavingSettings} className="rounded-2xl px-6">
              Сохранить настройки
            </Button>
            <Button
              variant="outline"
              onClick={() => tauriInvoke('logout_user').then(() => window.location.reload())}
              className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"
            >
              Выйти
            </Button>
          </section>

          <section className={cn('rounded-[26px] border p-5 text-sm', dark ? 'border-white/7 bg-white/[0.03] text-white/50' : 'border-gray-200 bg-white text-gray-500')}>
            {version}
          </section>
        </div>
      </main>
    </AppShell>
  )
}
