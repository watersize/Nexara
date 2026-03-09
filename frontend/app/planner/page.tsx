'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAppState } from '@/lib/tauri-provider'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { cn } from '@/lib/utils'
import { CalendarDays, Check, Circle, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type TaskBucket = 'today' | 'week' | 'later' | 'done'

interface TaskItem {
  id: string
  title: string
  topic: string
  dueDate: string
  details: string
  bucket: TaskBucket
  done: boolean
  updatedAt: string
}

const LEGACY_STORAGE_KEY = 'nexara_tasks_v1'

function bucketTitle(bucket: TaskBucket) {
  if (bucket === 'today') return '???????'
  if (bucket === 'week') return '?? ??????'
  if (bucket === 'later') return '?????'
  return '?????????'
}

function toTaskItem(task: any): TaskItem {
  return {
    id: String(task.id || task.task_id || `task-${Date.now()}`),
    title: String(task.title || ''),
    topic: String(task.topic || task.subject || ''),
    dueDate: String(task.due_date || task.dueDate || ''),
    details: String(task.details || ''),
    bucket: (task.done ? 'done' : task.bucket || 'today') as TaskBucket,
    done: Boolean(task.done),
    updatedAt: String(task.updated_at || task.updatedAt || new Date().toISOString()),
  }
}

export default function PlannerPage() {
  const appState = useAppState()
  const user = appState?.authSession
    ? { displayName: appState.authSession.display_name, email: appState.authSession.email }
    : undefined
  const accountKey = user?.email || 'guest'

  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [isLoading, setIsLoading] = useState(true)
  const [draft, setDraft] = useState({
    title: '',
    topic: '',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    details: '',
    bucket: 'today' as TaskBucket,
  })

  const saveTaskToDb = async (task: TaskItem) => {
    await tauriInvoke('save_task', {
      payload: {
        task: {
          id: task.id,
          title: task.title,
          topic: task.topic,
          due_date: task.dueDate,
          details: task.details,
          bucket: task.bucket,
          done: task.done,
          updated_at: task.updatedAt,
        },
      },
    })
  }

  const loadTasks = async () => {
    setIsLoading(true)
    try {
      let remote = (await tauriInvoke<any[]>('list_tasks')).map(toTaskItem)
      if (!remote.length) {
        const raw = window.localStorage.getItem(`${LEGACY_STORAGE_KEY}:${accountKey}`)
        const legacy = raw ? JSON.parse(raw) : []
        if (Array.isArray(legacy) && legacy.length) {
          const migrated = legacy.map(toTaskItem)
          for (const task of migrated) {
            await saveTaskToDb(task)
          }
          window.localStorage.removeItem(`${LEGACY_STORAGE_KEY}:${accountKey}`)
          remote = migrated
        }
      }
      setTasks(remote)
    } catch (error) {
      toast.error('?? ??????? ????????? ??????', {
        description: error instanceof Error ? error.message : String(error),
      })
      setTasks([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadTasks()
  }, [accountKey])

  const grouped = useMemo(
    () => ({
      today: tasks.filter((task) => !task.done && task.bucket === 'today'),
      week: tasks.filter((task) => !task.done && task.bucket === 'week'),
      later: tasks.filter((task) => !task.done && task.bucket === 'later'),
      done: tasks.filter((task) => task.done),
    }),
    [tasks],
  )

  const progress = `${grouped.done.length} / ${tasks.length || 0}`

  const createTask = async () => {
    if (!draft.title.trim()) return
    const nextTask: TaskItem = {
      id: `task-${Date.now()}`,
      title: draft.title.trim(),
      topic: draft.topic.trim(),
      dueDate: draft.dueDate,
      details: draft.details.trim(),
      bucket: draft.bucket,
      done: false,
      updatedAt: new Date().toISOString(),
    }
    await saveTaskToDb(nextTask)
    setTasks((current) => [nextTask, ...current])
    setDraft({
      title: '',
      topic: '',
      dueDate: selectedDate,
      details: '',
      bucket: 'today',
    })
    setIsDialogOpen(false)
  }

  const toggleTask = async (id: string) => {
    const current = tasks.find((task) => task.id === id)
    if (!current) return
    const updated: TaskItem = {
      ...current,
      done: !current.done,
      bucket: current.done ? 'today' : 'done',
      updatedAt: new Date().toISOString(),
    }
    setTasks((items) => items.map((task) => (task.id === id ? updated : task)))
    await saveTaskToDb(updated)
  }

  const removeTask = async (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id))
    try {
      await tauriInvoke('delete_task', { payload: { id } })
    } catch (error) {
      toast.error('?? ??????? ??????? ??????', {
        description: error instanceof Error ? error.message : String(error),
      })
      await loadTasks()
    }
  }

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-1 flex-col px-5 py-8 sm:px-8">
        <div className="rounded-[26px] border border-white/7 bg-white/[0.03] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">???????????</div>
              <h1 className="mt-2 text-3xl font-semibold text-white">?????? ? ????????</h1>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setIsDialogOpen(true)}
                className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left transition-all hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">????</div>
                    <div className="mt-1 text-sm font-medium text-white">
                      {format(new Date(selectedDate), 'd MMMM yyyy', { locale: ru })}
                    </div>
                  </div>
                </div>
              </button>

              <div className="min-w-[180px] rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center justify-between text-sm text-white/60">
                  <span>????????? ????? ???????</span>
                  <span className="font-semibold text-white">{progress}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/6">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${tasks.length ? (grouped.done.length / tasks.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex-1 overflow-y-auto pb-24 scrollbar-none">
          {(['today', 'week', 'later', 'done'] as TaskBucket[]).map((bucket) => {
            const items = grouped[bucket]
            return (
              <section key={bucket} className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-white">{bucketTitle(bucket)}</h2>
                    <span className="rounded-full border border-white/8 px-2 py-0.5 text-xs text-white/55">{items.length}</span>
                  </div>
                  {bucket !== 'done' && (
                    <Button onClick={() => setIsDialogOpen(true)} className="rounded-2xl">
                      <Plus className="h-4 w-4" />
                      ????????
                    </Button>
                  )}
                </div>

                {isLoading ? (
                  <div className="rounded-[22px] border border-white/7 bg-white/[0.02] px-5 py-8 text-center text-sm text-white/45">
                    ???????? ??????...
                  </div>
                ) : items.length ? (
                  <div className="space-y-3">
                    {items.map((task) => (
                      <article key={task.id} className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
                        <div className="flex items-start gap-4">
                          <button
                            type="button"
                            onClick={() => void toggleTask(task.id)}
                            className="mt-1 text-white/75 transition-colors hover:text-white"
                          >
                            {task.done ? <Check className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className={cn('text-lg font-semibold text-white', task.done && 'opacity-55 line-through')}>
                              {task.title}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/55">
                              {task.topic && <span className="rounded-full bg-primary/14 px-3 py-1 text-xs text-primary">{task.topic}</span>}
                              {task.dueDate && <span>{format(new Date(task.dueDate), 'd MMM', { locale: ru })}</span>}
                            </div>
                            {task.details && <div className="mt-3 text-sm leading-6 text-white/58">{task.details}</div>}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void removeTask(task.id)}
                            className="rounded-2xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-white/7 bg-white/[0.02] px-5 py-8 text-center text-sm text-white/45">
                    ??? ????? ? ???????
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </main>

      <button
        type="button"
        onClick={() => setIsDialogOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-[24px] bg-primary text-white shadow-[0_22px_65px_-15px_rgba(92,113,255,0.85)] transition-all duration-200 hover:scale-105 active:scale-95"
        aria-label="???????? ??????"
      >
        <Plus className="h-7 w-7" />
      </button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="rounded-[28px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.14),_transparent_32%),linear-gradient(180deg,_rgba(12,14,28,0.98),_rgba(7,9,20,1))] p-0 text-white shadow-[0_40px_120px_-45px_rgba(32,56,240,0.55)] sm:max-w-2xl"
        >
          <div className="flex items-start justify-between border-b border-white/8 px-5 py-4">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-2xl font-semibold text-white">????? ??????</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-white/55">
                ?????? ???? ? ?????? ?????? ? ?????? ?????? ????????????.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div className="space-y-2">
              <Label className="text-white/70">????</Label>
              <Input
                type="date"
                value={draft.dueDate}
                onChange={(event) => {
                  setSelectedDate(event.target.value)
                  setDraft((current) => ({ ...current, dueDate: event.target.value }))
                }}
                className="h-12 rounded-2xl border-white/10 bg-black/20 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">???????? ??????</Label>
              <Input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="????????: ??????? ??????? ?? ??????"
                className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-white/70">????</Label>
                <Input
                  value={draft.topic}
                  onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value }))}
                  placeholder="????????: ??????????? ?? ?????"
                  className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">??????</Label>
                <select
                  value={draft.bucket}
                  onChange={(event) => setDraft((current) => ({ ...current, bucket: event.target.value as TaskBucket }))}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-3 text-white"
                >
                  <option value="today">???????</option>
                  <option value="week">?? ??????</option>
                  <option value="later">?????</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">???????????</Label>
              <Textarea
                value={draft.details}
                onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))}
                placeholder="????? ?????? ?????????"
                className="min-h-24 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => void createTask()} className="rounded-2xl px-6">
                ????????? ??????
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
