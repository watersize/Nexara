'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import ReactMarkdown from 'react-markdown'
import { Check, Clock3, Columns2, ListTodo, Plus, Trash2, Download } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/app-shell'
import { MiniGraphPreview } from '@/components/graph/mini-graph-preview'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { fetchNodeWithNeighbors, parseMarkdownLinksWithWorker, syncNodeLinks } from '@/lib/markdown-link-indexer'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { cn } from '@/lib/utils'

type Bucket = 'today' | 'week' | 'later' | 'done'
type ViewMode = 'board' | 'list'

type TaskItem = {
  id: string
  title: string
  topic: string
  dueDate: string
  startTime: string
  endTime: string
  durationMinutes: number
  details: string
  bucket: Bucket
  done: boolean
  updatedAt: string
}

type TaskDraft = {
  id?: string
  title: string
  topic: string
  dueDate: string
  startTime: string
  endTime: string
  durationMinutes: string
  details: string
  bucket: Bucket
}

function createEmptyDraft(): TaskDraft {
  return {
    title: '',
    topic: '',
    dueDate: '',
    startTime: '',
    endTime: '',
    durationMinutes: '',
    details: '',
    bucket: 'today',
  }
}

function mapTask(task: any): TaskItem {
  return {
    id: String(task.id || task.task_id || `task-${Date.now()}`),
    title: String(task.title || ''),
    topic: String(task.topic || ''),
    dueDate: String(task.due_date || ''),
    startTime: String(task.start_time || ''),
    endTime: String(task.end_time || ''),
    durationMinutes: Number(task.duration_minutes || 0),
    details: String(task.details || ''),
    bucket: (task.done ? 'done' : task.bucket || 'today') as Bucket,
    done: Boolean(task.done),
    updatedAt: String(task.updated_at || new Date().toISOString()),
  }
}

function bucketTitle(bucket: Bucket) {
  if (bucket === 'today') return 'Сегодня'
  if (bucket === 'week') return 'На неделе'
  if (bucket === 'later') return 'Позже'
  return 'Выполнено'
}

function timeLabel(task: TaskItem) {
  if (task.startTime && task.endTime) return `${task.startTime} - ${task.endTime}`
  if (task.durationMinutes > 0) return `${task.durationMinutes} мин`
  return 'Без времени'
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-[24px] border border-white/7 bg-white/[0.03] p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-white/50">{hint}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-white/70">{label}</Label>
      {children}
    </div>
  )
}

function TaskCard({
  task,
  onOpen,
  onToggle,
  onDelete,
}: {
  task: TaskItem
  onOpen: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <article className="rounded-[22px] border border-white/8 bg-black/15 p-4">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onToggle} className="mt-1 text-white/70 hover:text-white">
          {task.done ? <Check className="h-5 w-5 text-primary" /> : <div className="h-5 w-5 rounded-full border border-white/20" />}
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className={cn('text-base font-semibold text-white', task.done && 'line-through opacity-50')}>{task.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/55">
            <span className="rounded-full bg-primary/12 px-3 py-1 text-primary">{timeLabel(task)}</span>
            {task.topic ? <span className="rounded-full border border-white/10 px-3 py-1">{task.topic}</span> : null}
            {task.dueDate ? <span>{format(new Date(task.dueDate), 'd MMM', { locale: ru })}</span> : null}
          </div>
          {task.details ? <div className="mt-3 line-clamp-3 text-sm leading-6 text-white/55">{task.details}</div> : null}
        </button>
        <button type="button" onClick={onDelete} className="text-white/45 hover:text-white">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  )
}

export default function PlannerPage() {
  const appState = useAppState()
  const user = appState?.authSession ? { displayName: appState.authSession.display_name, email: appState.authSession.email } : undefined
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [view, setView] = useState<ViewMode>('board')
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [draft, setDraft] = useState<TaskDraft>(createEmptyDraft())
  const [activeTaskId, setActiveTaskId] = useState('')
  const [graph, setGraph] = useState<any>(null)
  const [linkMenu, setLinkMenu] = useState<{ open: boolean, pos: number } | null>(null)
  const [hoveredNode, setHoveredNode] = useState<{ title: string, kind: string, details?: string } | null>(null)

  const loadTasks = async () => {
    setLoading(true)
    try {
      const result = await tauriInvoke<any[]>('list_tasks')
      setTasks(Array.isArray(result) ? result.map(mapTask) : [])
    } catch (error) {
      toast.error('Не удалось загрузить задачи', { description: error instanceof Error ? error.message : String(error) })
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTasks()
  }, [])

  useEffect(() => {
    async function loadGraph() {
      if (!activeTaskId) {
        setGraph(null)
        return
      }
      try {
        setGraph(await fetchNodeWithNeighbors(activeTaskId))
      } catch {
        setGraph(null)
      }
    }
    void loadGraph()
  }, [activeTaskId, tasks])

  const grouped = useMemo(
    () => ({
      today: tasks.filter((task) => !task.done && task.bucket === 'today'),
      week: tasks.filter((task) => !task.done && task.bucket === 'week'),
      later: tasks.filter((task) => !task.done && task.bucket === 'later'),
      done: tasks.filter((task) => task.done),
    }),
    [tasks],
  )

  const activeTask = tasks.find((task) => task.id === activeTaskId) || null
  const progress = tasks.length ? Math.round((grouped.done.length / tasks.length) * 100) : 0

  const persistTask = async (task: TaskItem) => {
    await tauriInvoke('save_task', {
      payload: {
        task: {
          id: task.id,
          title: task.title,
          topic: task.topic,
          due_date: task.dueDate,
          start_time: task.startTime,
          end_time: task.endTime,
          duration_minutes: task.durationMinutes,
          details: task.details,
          bucket: task.bucket,
          done: task.done,
          updated_at: task.updatedAt,
        },
      },
    })
    const links = await parseMarkdownLinksWithWorker(task.details)
    await syncNodeLinks({
      nodeId: task.id,
      kind: 'task',
      title: task.title,
      topic: task.topic,
      content: `${task.details}\n${task.dueDate}\n${task.startTime} ${task.endTime}`.trim(),
      sourceRef: `task:${task.id}`,
      links,
    })
  }

  const saveDraft = async () => {
    if (!draft.title.trim()) return
    const task: TaskItem = {
      id: draft.id || `task-${Date.now()}`,
      title: draft.title.trim(),
      topic: draft.topic.trim(),
      dueDate: draft.dueDate,
      startTime: draft.startTime,
      endTime: draft.endTime,
      durationMinutes: Number(draft.durationMinutes || 0),
      details: draft.details.trim(),
      bucket: draft.bucket,
      done: draft.bucket === 'done',
      updatedAt: new Date().toISOString(),
    }
    try {
      await persistTask(task)
      await loadTasks()
      setComposerOpen(false)
      setDraft(createEmptyDraft())
      toast.success('Задача сохранена')
    } catch (error) {
      toast.error('Не удалось сохранить задачу', { description: error instanceof Error ? error.message : String(error) })
    }
  }

  const openDraft = (task?: TaskItem) => {
    setLinkMenu(null)
    setDraft(
      task
        ? {
            id: task.id,
            title: task.title,
            topic: task.topic,
            dueDate: task.dueDate,
            startTime: task.startTime,
            endTime: task.endTime,
            durationMinutes: task.durationMinutes ? String(task.durationMinutes) : '',
            details: task.details,
            bucket: task.done ? 'done' : task.bucket,
          }
        : createEmptyDraft(),
    )
    setComposerOpen(true)
  }

  const toggleTask = async (task: TaskItem) => {
    await persistTask({
      ...task,
      done: !task.done,
      bucket: task.done ? 'today' : 'done',
      updatedAt: new Date().toISOString(),
    })
    await loadTasks()
  }

  const deleteTask = async (id: string) => {
    await tauriInvoke('delete_task', { payload: { id } })
    await loadTasks()
    if (activeTaskId === id) {
      setDetailOpen(false)
      setActiveTaskId('')
    }
  }

  const handleDetailsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let val = e.target.value
    const cursor = e.target.selectionStart
    
    if (val.substring(0, cursor).endsWith('[[')) {
      val = val.substring(0, cursor) + ']]' + val.substring(cursor)
      setLinkMenu({ open: true, pos: cursor })
      setDraft((c) => ({ ...c, details: val }))
      setTimeout(() => {
          const el = document.getElementById('details_textarea') as HTMLTextAreaElement
          if(el) { el.focus(); el.selectionStart = el.selectionEnd = cursor }
      }, 0)
      return
    } else if (val.indexOf('[[') === -1) {
        setLinkMenu(null)
    }
    setDraft(c => ({...c, details: val}))
  }

  const insertLink = (type: string) => {
      if (!linkMenu) return
      const prefix = draft.details.substring(0, linkMenu.pos)
      const suffix = draft.details.substring(linkMenu.pos)
      const insertion = type + ': '
      setDraft(c => ({...c, details: prefix + insertion + suffix}))
      setLinkMenu(null)
      setTimeout(() => {
          const el = document.getElementById('details_textarea') as HTMLTextAreaElement
          if(el) { 
              el.focus(); 
              const newPos = linkMenu.pos + insertion.length
              el.selectionStart = el.selectionEnd = newPos 
          }
      }, 0)
  }

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-1 flex-col px-5 py-8 sm:px-8">
        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[30px] border border-white/8 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_34%),linear-gradient(180deg,_rgba(11,13,23,0.98),_rgba(6,8,18,1))] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">planner workspace</div>
                <h1 className="mt-3 text-4xl font-semibold text-white">Планировщик задач</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
                  Канбан, список, точные временные слоты и связи с заметками, учебниками и расписанием.
                </p>
              </div>
              <Button onClick={() => openDraft()} className="rounded-2xl">
                <Plus className="h-4 w-4" />
                Добавить задачу
              </Button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <Metric label="Сегодня" value={grouped.today.length} hint="слотов" />
              <Metric label="В работе" value={tasks.filter((task) => !task.done).length} hint="активных задач" />
              <Metric label="Прогресс" value={`${progress}%`} hint="выполнено" />
              <Metric label="Дата" value={format(new Date(), 'd MMM', { locale: ru })} hint="сегодня" />
            </div>
          </div>

          <div className="rounded-[30px] border border-white/8 bg-white/[0.03] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">вид</div>
                <div className="mt-2 text-2xl font-semibold text-white">Управление задачами</div>
              </div>
              <div className="inline-flex rounded-2xl border border-white/8 bg-white/[0.03] p-1">
                <button
                  type="button"
                  onClick={() => setView('board')}
                  className={cn('rounded-xl px-3 py-2', view === 'board' ? 'bg-primary text-white' : 'text-white/55')}
                >
                  <Columns2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className={cn('rounded-xl px-3 py-2', view === 'list' ? 'bg-primary text-white' : 'text-white/55')}
                >
                  <ListTodo className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {[...tasks]
                .filter((task) => !task.done)
                .sort((a, b) => `${a.dueDate} ${a.startTime}`.localeCompare(`${b.dueDate} ${b.startTime}`))
                .slice(0, 4)
                .map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => {
                      setActiveTaskId(task.id)
                      setDetailOpen(true)
                    }}
                    className="block w-full rounded-[22px] border border-white/8 bg-black/15 p-4 text-left transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="text-base font-semibold text-white">{task.title}</div>
                    <div className="mt-2 inline-flex rounded-full bg-primary/12 px-3 py-1 text-xs text-primary">{timeLabel(task)}</div>
                  </button>
                ))}
              {!tasks.filter((task) => !task.done).length ? (
                <div className="rounded-[22px] border border-white/7 bg-white/[0.02] px-5 py-8 text-center text-sm text-white/45">
                  Пока нет активных задач
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-8">
          {view === 'board' ? (
            <div className="grid gap-4 xl:grid-cols-4">
              {(['today', 'week', 'later', 'done'] as Bucket[]).map((bucket) => (
                <div key={bucket} className="rounded-[28px] border border-white/8 bg-white/[0.03] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-lg font-semibold text-white">{bucketTitle(bucket)}</div>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-white/55">{grouped[bucket].length}</span>
                  </div>
                  <div className="space-y-3">
                    {loading ? (
                      <div className="rounded-[20px] border border-white/7 bg-white/[0.02] px-4 py-6 text-sm text-white/45">Загрузка...</div>
                    ) : grouped[bucket].length ? (
                      grouped[bucket].map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onOpen={() => {
                            setActiveTaskId(task.id)
                            setDetailOpen(true)
                          }}
                          onToggle={() => void toggleTask(task)}
                          onDelete={() => void deleteTask(task.id)}
                        />
                      ))
                    ) : (
                      <div className="rounded-[20px] border border-white/7 bg-white/[0.02] px-4 py-6 text-sm text-white/45">Пусто</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 rounded-[28px] border border-white/8 bg-white/[0.03] p-4">
              {[...tasks]
                .sort((a, b) => `${a.dueDate} ${a.startTime}`.localeCompare(`${b.dueDate} ${b.startTime}`))
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpen={() => {
                      setActiveTaskId(task.id)
                      setDetailOpen(true)
                    }}
                    onToggle={() => void toggleTask(task)}
                    onDelete={() => void deleteTask(task.id)}
                  />
                ))}
              {!tasks.length ? (
                <div className="rounded-[20px] border border-white/7 bg-white/[0.02] px-4 py-10 text-center text-sm text-white/45">Пока нет задач</div>
              ) : null}
            </div>
          )}
        </section>

        <button
          type="button"
          onClick={() => openDraft()}
          className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-[24px] bg-primary text-white shadow-[0_22px_65px_-15px_rgba(92,113,255,0.85)] transition hover:scale-105"
          aria-label="Добавить задачу"
        >
          <Plus className="h-7 w-7" />
        </button>
      </main>

      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent
          showCloseButton={false}
          className="rounded-[28px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.14),_transparent_32%),linear-gradient(180deg,_rgba(12,14,28,0.98),_rgba(7,9,20,1))] p-0 text-white sm:max-w-3xl"
        >
          <div className="border-b border-white/8 px-5 py-4">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-2xl font-semibold text-white">{draft.id ? 'Редактировать задачу' : 'Новая задача'}</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-white/55">
                Точные временные слоты и ссылки вида [[...]] попадут в граф автоматически.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="grid gap-4 px-5 py-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Название">
                <Input value={draft.title} onChange={(e) => setDraft((c) => ({ ...c, title: e.target.value }))} className="h-12 rounded-2xl border-white/10 bg-black/20 text-white" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Тема">
                  <Input value={draft.topic} onChange={(e) => setDraft((c) => ({ ...c, topic: e.target.value }))} className="h-12 rounded-2xl border-white/10 bg-black/20 text-white" />
                </Field>
                <Field label="Дата">
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-[180px] h-12 justify-start text-left font-normal rounded-2xl border-white/10 bg-black/20 text-white hover:bg-white/5",
                            !draft.dueDate && "text-muted-foreground"
                          )}
                        >
                          {draft.dueDate ? format(new Date(draft.dueDate), "d MMMM yyyy", { locale: ru }) : <span>Выберите дату</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-2xl border-white/10 bg-neutral-900/95 backdrop-blur-xl">
                        <Calendar
                          mode="single"
                          selected={draft.dueDate ? new Date(draft.dueDate) : undefined}
                          onSelect={(date) => setDraft((c) => ({ ...c, dueDate: date ? format(date, 'yyyy-MM-dd') : '' }))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <Button type="button" variant="outline" onClick={() => setDraft((c) => ({ ...c, dueDate: '' }))} className="h-12 rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white">
                      Без даты
                    </Button>
                  </div>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Начало">
                  <Input type="time" value={draft.startTime} onChange={(e) => setDraft((c) => ({ ...c, startTime: e.target.value }))} className="h-12 rounded-2xl border-white/10 bg-black/20 text-white" />
                </Field>
                <Field label="Конец">
                  <Input type="time" value={draft.endTime} onChange={(e) => setDraft((c) => ({ ...c, endTime: e.target.value }))} className="h-12 rounded-2xl border-white/10 bg-black/20 text-white" />
                </Field>
                <Field label="Минуты">
                  <Input type="number" value={draft.durationMinutes} onChange={(e) => setDraft((c) => ({ ...c, durationMinutes: e.target.value }))} className="h-12 rounded-2xl border-white/10 bg-black/20 text-white" />
                </Field>
              </div>
              <Field label="Описание">
                <div className="relative">
                    <Textarea id="details_textarea" value={draft.details} onChange={handleDetailsChange} className="min-h-[170px] rounded-2xl border-white/10 bg-black/20 text-white" />
                    {linkMenu?.open && (
                        <div className="absolute top-full left-0 mt-2 z-50 flex gap-2 p-2 bg-neutral-900 border border-white/10 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-2">
                            <button type="button" onClick={() => insertLink('Заметка')} className="px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all font-semibold text-sm">Заметка</button>
                            <button type="button" onClick={() => insertLink('Расписание')} className="px-4 py-2 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all font-semibold text-sm">Расписание</button>
                            <button type="button" onClick={() => insertLink('Учебник')} className="px-4 py-2 rounded-xl bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all font-semibold text-sm">Учебник</button>
                        </div>
                    )}
                </div>
              </Field>
            </div>
            <div className="rounded-[26px] border border-white/8 bg-white/[0.03] p-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Preview</div>
              <div className="mt-4 text-2xl font-semibold text-white">{draft.title || 'Новая задача'}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1 text-sm text-primary">
                  <Clock3 className="h-4 w-4" />
                  {draft.startTime && draft.endTime
                    ? `${draft.startTime} - ${draft.endTime}`
                    : draft.durationMinutes
                      ? `${draft.durationMinutes} мин`
                      : 'Без времени'}
                </span>
                {draft.topic ? <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70">{draft.topic}</span> : null}
              </div>
              <div className="mt-5 rounded-[22px] border border-white/8 bg-black/15 p-4 text-sm leading-7 text-white/60">
                {draft.details ? <ReactMarkdown>{draft.details}</ReactMarkdown> : 'Описание и ссылки задачи появятся здесь.'}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-white/8 px-5 py-4">
            <Button variant="outline" onClick={() => setComposerOpen(false)} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white">
              Отмена
            </Button>
            <Button onClick={() => void saveDraft()} className="rounded-2xl">Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent
          showCloseButton={false}
          className="rounded-[28px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.14),_transparent_32%),linear-gradient(180deg,_rgba(12,14,28,0.98),_rgba(7,9,20,1))] p-0 text-white sm:max-w-5xl"
        >
          {activeTask ? (
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
              <div className="border-b border-white/8 px-5 py-5 lg:border-b-0 lg:border-r">
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">task view</div>
                <h2 className="mt-2 text-3xl font-semibold text-white">{activeTask.title}</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1 text-sm text-primary">
                    <Clock3 className="h-4 w-4" />
                    {timeLabel(activeTask)}
                  </span>
                  {activeTask.topic ? <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70">{activeTask.topic}</span> : null}
                </div>
                <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-white/72">
                  {activeTask.details || 'Описание пока не заполнено.'}
                </div>
                <div className="mt-6 flex gap-3">
                  <Button onClick={() => openDraft(activeTask)} className="rounded-2xl">Редактировать</Button>
                  <Button variant="outline" onClick={() => void toggleTask(activeTask)} className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white">
                    {activeTask.done ? 'Вернуть в работу' : 'Отметить выполненной'}
                  </Button>
                </div>
              </div>
              <div className="px-5 py-5">
                <MiniGraphPreview centerLabel={activeTask.title} neighbors={graph?.neighbors || []} onExpand={() => setGraphOpen(true)} />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={graphOpen} onOpenChange={setGraphOpen}>
        <DialogContent
          showCloseButton={false}
          className="rounded-[28px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_32%),linear-gradient(180deg,_rgba(12,14,28,0.98),_rgba(7,9,20,1))] p-0 text-white sm:max-w-6xl"
        >
          <div className="flex flex-col lg:flex-row min-h-[500px]">
              {/* Left Side: Preview */}
              <div className="w-full lg:w-[320px] p-6 border-b lg:border-b-0 lg:border-r border-white/8 flex flex-col bg-white/[0.01]">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Превью узла</div>
                  {hoveredNode ? (
                      <div className="mt-6 flex-1 flex flex-col relative">
                          <div className="inline-flex items-center rounded-full bg-white/5 px-3 py-1 text-xs text-white/70 w-fit">{hoveredNode.kind === 'note' ? 'Заметка' : hoveredNode.kind === 'schedule' ? 'Расписание' : 'Задача'}</div>
                          
                          <div className="absolute top-0 right-0">
                             <Button 
                               variant="ghost" 
                               size="icon" 
                               className="h-8 w-8 text-white/40 hover:text-white"
                               title="Скачать Markdown"
                               onClick={() => {
                                 const blob = new Blob([`# ${hoveredNode.title}\n\n*${hoveredNode.kind}*\n\n${hoveredNode.details || ''}`], { type: 'text/markdown' })
                                 const url = URL.createObjectURL(blob)
                                 const a = document.createElement('a')
                                 a.href = url
                                 a.download = `${hoveredNode.title}.md`
                                 a.click()
                                 URL.revokeObjectURL(url)
                                 toast.success('Файл скачан')
                               }}
                             >
                                <Download className="h-4 w-4" />
                             </Button>
                          </div>

                          <h3 
                            className="mt-4 text-2xl font-semibold text-white cursor-pointer hover:text-blue-400 transition-colors pr-10"
                            onClick={() => {
                                toast('Переход к объекту...', { description: hoveredNode.title })
                            }}
                          >
                            {hoveredNode.title}
                          </h3>
                          <div className="mt-4 text-sm text-white/60 leading-relaxed italic border-l-2 border-primary/40 pl-4">{hoveredNode.details || 'Превью недоступно'}</div>
                      </div>
                  ) : (
                      <div className="mt-12 text-center text-sm text-white/30 italic">Наведите на узел в графе для предпросмотра</div>
                  )}
              </div>
              
              {/* Right Side: Graph */}
              <div className="flex-1 p-6 relative">
                  <div className="absolute top-6 left-6 z-10">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">knowledge graph</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{graph?.node?.title || 'Граф связей'}</div>
                  </div>
                  <div className="rounded-[26px] border border-white/8 bg-black/15 p-4 mt-16 h-[400px]">
                      <svg viewBox="0 0 720 420" className="h-full w-full">
                        {graph?.neighbors?.map((neighbor: any, index: number) => {
                          const angle = (Math.PI * 2 * index) / Math.max(graph.neighbors.length, 1) - Math.PI / 2
                          const x = 360 + Math.cos(angle) * 150
                          const y = 210 + Math.sin(angle) * 150
                          const label = String(neighbor.title || '')
                          const isHovered = hoveredNode?.title === label
                          return (
                            <g 
                                key={neighbor.node_id} 
                                onMouseEnter={() => setHoveredNode({ title: label, kind: neighbor.kind, details: neighbor.details || `Фрагмент: ${neighbor.content ? neighbor.content.slice(0, 100) : '...'}` })}
                                onMouseLeave={() => setHoveredNode(null)}
                                onClick={() => setHoveredNode({ title: label, kind: neighbor.kind, details: neighbor.details || `Фрагмент: ${neighbor.content ? neighbor.content.slice(0, 100) : '...'}` })}
                                className="cursor-pointer transition-all"
                            >
                              <line
                                x1="360"
                                y1="210"
                                x2={x}
                                y2={y}
                                stroke={neighbor.direction === 'incoming' ? 'rgba(16,185,129,0.55)' : 'rgba(59,130,246,0.55)'}
                                strokeWidth="2"
                              />
                              <circle
                                cx={x}
                                cy={y}
                                r={isHovered ? "22" : "18"}
                                fill={neighbor.kind === 'note' ? '#10b981' : neighbor.kind === 'schedule' ? '#a855f7' : '#3b82f6'}
                                className="transition-all duration-300"
                              />
                              <text x={x} y={y + 34} textAnchor="middle" fill={isHovered ? "white" : "rgba(255,255,255,0.72)"} fontSize={isHovered ? "14" : "13"} fontWeight={isHovered ? "bold" : "normal"}>
                                {label.length > 18 ? `${label.slice(0, 18)}...` : label}
                              </text>
                            </g>
                          )
                        })}
                        <g 
                            onMouseEnter={() => setHoveredNode({ title: graph?.node?.title || '', kind: graph?.node?.kind || '', details: graph?.node?.content })}
                            onMouseLeave={() => setHoveredNode(null)}
                            className="cursor-pointer"
                        >
                            <circle cx="360" cy="210" r="26" fill="white" />
                            <text x="360" y="260" textAnchor="middle" fill="rgba(255,255,255,0.82)" fontSize="16" fontWeight="bold">
                              {graph?.node?.title || ''}
                            </text>
                        </g>
                      </svg>
                  </div>
              </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
