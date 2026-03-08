'use client'

import { useState, useEffect } from 'react'
import { NexaraHeader } from '@/components/nexara-header'
import { useAppState } from '@/lib/tauri-provider'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useTheme } from 'next-themes'
import { Moon, Sun, Monitor, LogOut, Trash2, Bell, MessageCircle, Bot } from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const appState = useAppState()
  const { setTheme, theme } = useTheme()
  const [isSaving, setIsSaving] = useState(false)
  
  // Local state for settings form
  const [hints, setHints] = useState(true)
  const [enable3d, setEnable3d] = useState(true)
  const [reminder, setReminder] = useState(18)
  const [tgEnabled, setTgEnabled] = useState(false)
  const [tgToken, setTgToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')

  useEffect(() => {
    if (appState?.settings) {
      setHints(appState.settings.hints_enabled)
      setEnable3d(appState.settings.enable_3d)
      setReminder(appState.settings.reminder_hours)
      setTgEnabled(appState.settings.telegram_enabled)
      setTgToken(appState.settings.telegram_bot_token || '')
      setTgChatId(appState.settings.telegram_chat_id || '')
      setTheme(appState.settings.theme === 'theme-dark' ? 'dark' : 'light')
    }
  }, [appState, setTheme])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const payload = {
        theme: theme === 'dark' ? 'theme-dark' : 'theme-light',
        hints_enabled: hints,
        enable_3d: enable3d,
        reminder_hours: reminder,
        telegram_enabled: tgEnabled,
        telegram_bot_token: tgToken,
        telegram_chat_id: tgChatId
      }
      
      const res = await tauriInvoke<any>('save_settings', { settings: payload })
      if (!res?.ok && res?.message) throw new Error(res.message)
      toast.success('Настройки успешно сохранены')
    } catch (err: any) {
      console.error(err)
      toast.error('Ошибка сохранения', { description: err.message || String(err) })
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      await tauriInvoke('logout_user')
      window.location.reload()
    } catch(err) {
      console.error(err)
    }
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm('ОПАСНО! Действительно удалить аккаунт и все данные?')) return
    try {
      await tauriInvoke('delete_account')
      toast.success('Аккаунт удален')
      setTimeout(() => window.location.reload(), 1500)
    } catch(err: any) {
      toast.error('Ошибка', { description: err.message || String(err) })
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <NexaraHeader showBackButton title="Настройки" />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-24 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Настройки профиля</h1>
          <p className="text-muted-foreground text-sm">Управляй внешним видом и уведомлениями приложения.</p>
        </div>

        {/* Appearance */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            Внешний вид
          </h2>
          <div className="bg-card border border-border/50 rounded-2xl p-4 sm:p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Тема приложения</Label>
                <div className="text-sm text-muted-foreground">Выбери светлую или темную тему</div>
              </div>
              <div className="flex bg-secondary p-1 rounded-lg">
                <Button 
                  variant={theme !== 'dark' ? 'default' : 'ghost'} 
                  size="sm" 
                  className="rounded-md w-10 px-0 h-8"
                  onClick={() => setTheme('light')}
                >
                  <Sun className="w-4 h-4" />
                </Button>
                <Button 
                  variant={theme === 'dark' ? 'default' : 'ghost'} 
                  size="sm" 
                  className="rounded-md w-10 px-0 h-8"
                  onClick={() => setTheme('dark')}
                >
                  <Moon className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="hints" className="text-base">Показывать подсказки</Label>
                <div className="text-sm text-muted-foreground">Отключи, если уже все знаешь</div>
              </div>
              <Switch id="hints" checked={hints} onCheckedChange={setHints} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable3d" className="text-base">Анимации 3D</Label>
                <div className="text-sm text-muted-foreground">Плавные переходы и карточки</div>
              </div>
              <Switch id="enable3d" checked={enable3d} onCheckedChange={setEnable3d} />
            </div>
          </div>
        </section>

        {/* Notifications & Integrations */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Уведомления и интеграции
          </h2>
          <div className="bg-card border border-border/50 rounded-2xl p-4 sm:p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="reminder-hour" className="text-base">Время вечернего напоминания</Label>
                <div className="text-sm text-muted-foreground">Часы (0-23)</div>
              </div>
              <Input 
                id="reminder-hour"
                type="number" 
                min={0} max={23} 
                className="w-24 bg-background" 
                value={reminder} 
                onChange={(e) => setReminder(parseInt(e.target.value) || 0)} 
              />
            </div>

            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center justify-between mb-4">
                <div className="space-y-0.5">
                  <Label htmlFor="tg" className="text-base flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-blue-500" />
                    Telegram бот
                  </Label>
                  <div className="text-sm text-muted-foreground">Получать план через бота</div>
                </div>
                <Switch id="tg" checked={tgEnabled} onCheckedChange={setTgEnabled} />
              </div>
              
              {tgEnabled && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="space-y-2">
                    <Label htmlFor="tgToken">Токен бота (BotFather)</Label>
                    <div className="relative">
                      <Bot className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                      <Input 
                        id="tgToken" 
                        type="password"
                        placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" 
                        value={tgToken} 
                        onChange={(e) => setTgToken(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tgChat">Chat ID</Label>
                    <Input 
                      id="tgChat" 
                      placeholder="Например, 123456789" 
                      value={tgChatId} 
                      onChange={(e) => setTgChatId(e.target.value)} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
          <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto h-12 px-8 rounded-xl font-medium">
            {isSaving ? 'Сохранение...' : 'Сохранить изменения'}
          </Button>
          <Button variant="outline" onClick={handleLogout} className="w-full sm:w-auto h-12 px-8 rounded-xl gap-2 font-medium">
            <LogOut className="w-4 h-4" />
            Выйти из аккаунта
          </Button>
        </div>

        <div className="border border-destructive/20 bg-destructive/5 p-5 mt-12 rounded-2xl">
          <h3 className="text-destructive font-semibold mb-2">Опасная зона</h3>
          <p className="text-sm text-muted-foreground mb-4">Эта операция безвозвратно удалит все твои данные (расписание, учебники, чаты).</p>
          <Button variant="destructive" onClick={handleDeleteAccount} className="w-full sm:w-auto rounded-xl gap-2 font-medium">
            <Trash2 className="w-4 h-4" />
            Удалить аккаунт навсегда
          </Button>
        </div>
      </main>
    </div>
  )
}
