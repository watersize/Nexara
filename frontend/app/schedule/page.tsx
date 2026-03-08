'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Home,
  MessageCircle,
  MoonStar,
  Notebook,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  WandSparkles,
  X,
} from 'lucide-react'

const DAYS_SHORT = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']
const DAYS_TINY = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const DAYS_FULL = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
]

const DEFAULT_TIMES = [
  ['08:30', '09:15'],
  ['09:25', '10:10'],
  ['10:25', '11:10'],
  ['11:25', '12:10'],
  ['12:30', '13:15'],
  ['13:25', '14:10'],
  ['14:20', '15:05'],
]

const NAV_ITEMS = [
  { href: '/', label: 'Главная', icon: Home },
  { href: '/notebook', label: 'Блокнот', icon: Notebook },
  { href: '/planner', label: 'Планировщик', icon: Sparkles },
  { href: '/schedule', label: 'Расписание', icon: CalendarDays },
  { href: '/chat', label: 'AI Чат', icon: MessageCircle },
  { href: '/textbooks', label: 'Учебники', icon: BookOpen },
]

interface Lesson {
  id: string
  subject: string
  teacher: string
  room: string
  start_time: string
  end_time: string
  notes: string
  materials: string[]
  order: number
}

interface EditorLesson {
  id: string
  subject: string
  teacher: string
  room: string
  start_time: string
  end_time: string
  notes: string
  materialsText: string
}

interface SaveScheduleLessonsPayload {
  week_number: number
  weekday: number
  lessons: Array<{
    subject: string
    teacher: string
    room: string
    start_time: string
    end_time: string
    notes: string
    materials: string[]
  }>
}

function createDraft(index: number): EditorLesson {
  const slot = DEFAULT_TIMES[index] ?? ['', '']
  return {
    id: `draft-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    subject: '',
    teacher: '',
    room: '',
    start_time: slot[0] ?? '',
    end_time: slot[1] ?? '',
    notes: '',
    materialsText: '',
  }
}

function mapLessonToEditor(lesson: Lesson, index: number): EditorLesson {
  return {
    id: lesson.id || `lesson-${index}`,
    subject: lesson.subject,
    teacher: lesson.teacher,
    room: lesson.room,
    start_time: lesson.start_time,
    end_time: lesson.end_time,
    notes: lesson.notes,
    materialsText: lesson.materials.join('\n'),
  }
}

function mapEditorToPayload(lesson: EditorLesson) {
  return {
    subject: lesson.subject.trim(),
    teacher: lesson.teacher.trim(),
    room: lesson.room.trim(),
    start_time: lesson.start_time,
    end_time: lesson.end_time,
    notes: lesson.notes.trim(),
    materials: lesson.materialsText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
  }
}

function formatWeekRange(start: Date, end: Date) {
  const startText = start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  const endText = end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${startText} - ${endText}`
}

function getWeekStart(weekOffset: number) {
  const now = new Date()
  const weekday = now.getDay() === 0 ? 6 : now.getDay() - 1
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(now.getDate() - weekday + weekOffset * 7)
  return start
}

function getWeekDates(weekOffset: number) {
  const start = getWeekStart(weekOffset)
  return DAYS_SHORT.map((_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

function subjectGlow(index: number) {
  const palettes = [
    'from-blue-500/20 via-indigo-500/10 to-transparent',
    'from-fuchsia-500/18 via-purple-500/10 to-transparent',
    'from-cyan-500/18 via-sky-500/10 to-transparent',
    'from-amber-500/18 via-orange-500/10 to-transparent',
    'from-emerald-500/18 via-teal-500/10 to-transparent',
  ]
  return palettes[index % palettes.length]
}

function WorkspaceSidebar({
  displayName,
  email,
}: {
  displayName?: string
  email?: string
}) {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <aside className="hidden xl:flex xl:w-64 xl:flex-col xl:shrink-0 xl:border-r xl:border-white/6 xl:bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.16),_transparent_32%),linear-gradient(180deg,_rgba(10,12,24,0.98),_rgba(6,8,18,1))]">
      <div className="px-6 pt-6">
        <Link href="/" className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/20 text-primary shadow-lg shadow-primary/15">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold text-white">Nexara</div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">AI School Assistant</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-6">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-all duration-200',
                active
                  ? 'bg-primary/18 text-white shadow-lg shadow-primary/10 ring-1 ring-primary/25'
                  : 'text-white/60 hover:bg-white/[0.04] hover:text-white',
              )}
            >
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
                  active
                    ? 'border-primary/30 bg-primary/20 text-primary'
                    : 'border-white/8 bg-white/[0.03] text-white/55 group-hover:border-white/15 group-hover:text-white/85',
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className="font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="space-y-3 border-t border-white/6 px-4 py-5">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-white/60 transition-all hover:bg-white/[0.04] hover:text-white"
        >
          <Settings className="h-4 w-4" />
          Настройки
        </Link>
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-white/60 transition-all hover:bg-white/[0.04] hover:text-white"
        >
          <MoonStar className="h-4 w-4" />
          Тема
        </button>

        {(displayName || email) && (
          <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3">
            <div className="text-sm font-medium text-white">{displayName || 'Пользователь'}</div>
            {email && <div className="mt-1 text-xs text-white/45">{email}</div>}
          </div>
        )}
      </div>
    </aside>
  )
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-3xl border border-white/6 bg-white/[0.03] p-5 shadow-[0_24px_80px_-50px_rgba(0,0,0,0.75)]">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">{label}</div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-2 text-sm text-white/50">{hint}</div>
    </div>
  )
}

function LessonPreviewCard({
  lesson,
  index,
  onDelete,
}: {
  lesson: Lesson
  index: number
  onDelete: () => void
}) {
  return (
    <article className="relative overflow-hidden rounded-[28px] border border-white/7 bg-white/[0.04] p-5 shadow-[0_22px_70px_-45px_rgba(59,89,255,0.45)]">
      <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70', subjectGlow(index))} />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-black/20 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-white/55">
              {lesson.order} урок
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm text-white/55">
              <Clock3 className="h-4 w-4 text-primary" />
              <span>{lesson.start_time || '--:--'} - {lesson.end_time || '--:--'}</span>
              {lesson.room && <span className="rounded-full border border-white/8 px-2 py-0.5 text-xs text-white/60">Каб. {lesson.room}</span>}
            </div>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">{lesson.subject || 'Без названия'}</h3>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/60">
              {lesson.teacher && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 px-3 py-1">
                  <UserRound className="h-3.5 w-3.5 text-primary" />
                  {lesson.teacher}
                </span>
              )}
              {!lesson.teacher && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 px-3 py-1 text-white/40">
                  Учитель не указан
                </span>
              )}
            </div>
            {lesson.notes && (
              <div className="mt-4 rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm leading-6 text-white/65">
                {lesson.notes}
              </div>
            )}
            {lesson.materials.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {lesson.materials.map((material) => (
                  <span
                    key={material}
                    className="rounded-full border border-primary/20 bg-primary/12 px-3 py-1 text-xs font-medium text-primary"
                  >
                    {material}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="shrink-0 rounded-2xl border-white/10 bg-transparent text-white/70 hover:bg-white/8 hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/8"
        >
          <Trash2 className="h-4 w-4" />
          Удалить
        </Button>
      </div>
    </article>
  )
}

function ScheduleBuilderDialog({
  open,
  onOpenChange,
  initialDay,
  weekNumber,
  weekDates,
  subjectSuggestions,
  onLoadLessons,
  onSaveLessons,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDay: number
  weekNumber: number
  weekDates: Date[]
  subjectSuggestions: string[]
  onLoadLessons: (dayIndex: number) => Promise<Lesson[]>
  onSaveLessons: (dayIndex: number, lessons: EditorLesson[]) => Promise<void>
}) {
  const [step, setStep] = useState<'day' | 'editor'>('day')
  const [selectedDay, setSelectedDay] = useState(initialDay)
  const [editorLessons, setEditorLessons] = useState<EditorLesson[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setStep('day')
      setSelectedDay(initialDay)
      setEditorLessons([])
      setError('')
      setIsBusy(false)
    }
  }, [open, initialDay])

  const loadDay = async (dayIndex: number) => {
    setIsBusy(true)
    setError('')
    try {
      const lessons = await onLoadLessons(dayIndex)
      setSelectedDay(dayIndex)
      setEditorLessons(lessons.length ? lessons.map(mapLessonToEditor) : [createDraft(0)])
      setStep('editor')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }

  const updateLesson = (id: string, field: keyof EditorLesson, value: string) => {
    setEditorLessons((current) =>
      current.map((lesson) => (lesson.id === id ? { ...lesson, [field]: value } : lesson)),
    )
  }

  const addLesson = () => {
    setEditorLessons((current) => [...current, createDraft(current.length)])
  }

  const removeLesson = (id: string) => {
    setEditorLessons((current) => {
      const next = current.filter((lesson) => lesson.id !== id)
      return next.length ? next : [createDraft(0)]
    })
  }

  const moveLesson = (id: string, direction: -1 | 1) => {
    setEditorLessons((current) => {
      const index = current.findIndex((lesson) => lesson.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) {
        return current
      }
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const save = async () => {
    const normalized = editorLessons
      .map(mapEditorToPayload)
      .filter((lesson) => lesson.subject || lesson.start_time || lesson.end_time || lesson.teacher || lesson.notes)

    if (!normalized.length) {
      setError('Добавь хотя бы один урок или закрой окно без сохранения.')
      return
    }

    setIsBusy(true)
    setError('')
    try {
      await onSaveLessons(selectedDay, editorLessons)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] overflow-hidden rounded-[32px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.16),_transparent_36%),linear-gradient(180deg,_rgba(13,15,31,0.98),_rgba(7,9,20,1))] p-0 text-white shadow-[0_40px_120px_-45px_rgba(32,56,240,0.55)] sm:max-w-4xl"
      >
        <div className="border-b border-white/8 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-2xl font-semibold tracking-tight text-white">
                {step === 'day' ? 'Добавить расписание' : `Конструктор: ${DAYS_FULL[selectedDay]}`}
              </DialogTitle>
              <DialogDescription className="max-w-2xl text-sm leading-6 text-white/55">
                {step === 'day'
                  ? 'Сначала выбери день. После этого откроется конструктор, где можно собрать уроки, переставить блоки местами и сразу сохранить готовый день.'
                  : `Неделя ${weekNumber}. Здесь можно добавить предмет, выбрать время урока, указать учителя, домашнее задание и материалы.`}
              </DialogDescription>
            </DialogHeader>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 transition-all hover:bg-white/[0.08] hover:text-white"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(92vh-112px)] overflow-y-auto px-6 py-6">
          {step === 'day' ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {weekDates.map((date, index) => {
                  const isSelected = selectedDay === index
                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      onClick={() => loadDay(index)}
                      className={cn(
                        'group rounded-[28px] border p-5 text-left transition-all duration-200',
                        isSelected
                          ? 'border-primary/35 bg-primary/14 shadow-[0_18px_60px_-35px_rgba(92,113,255,0.75)]'
                          : 'border-white/8 bg-white/[0.03] hover:border-white/16 hover:bg-white/[0.05]',
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">{DAYS_TINY[index]}</div>
                          <div className="mt-4 text-4xl font-semibold tracking-tight text-white">{date.getDate()}</div>
                          <div className="mt-2 text-base font-medium text-white/84">{DAYS_FULL[index]}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-1 text-xs font-medium text-white/55">
                          {date.toLocaleDateString('ru-RU', { month: 'short' })}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {isBusy && <div className="text-sm text-white/55">Загружаю текущие уроки для выбранного дня...</div>}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 rounded-[28px] border border-white/8 bg-white/[0.03] p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">Выбранный день</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {DAYS_FULL[selectedDay]}, {weekDates[selectedDay].toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep('day')}
                    className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.06]"
                  >
                    Сменить день
                  </Button>
                  <Button type="button" onClick={addLesson} className="rounded-2xl">
                    <Plus className="h-4 w-4" />
                    Добавить блок
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {editorLessons.map((lesson, index) => (
                  <div
                    key={lesson.id}
                    className="rounded-[30px] border border-white/8 bg-white/[0.035] p-5 shadow-[0_20px_70px_-45px_rgba(0,0,0,0.8)]"
                  >
                    <div className="mb-5 flex flex-col gap-3 border-b border-white/8 pb-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">Блок {index + 1}</div>
                        <div className="mt-2 text-lg font-semibold text-white">
                          {lesson.subject.trim() || `Новый урок ${index + 1}`}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => moveLesson(lesson.id, -1)}
                          disabled={index === 0}
                          className="rounded-2xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.06]"
                        >
                          <ArrowUp className="h-4 w-4" />
                          Выше
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => moveLesson(lesson.id, 1)}
                          disabled={index === editorLessons.length - 1}
                          className="rounded-2xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.06]"
                        >
                          <ArrowDown className="h-4 w-4" />
                          Ниже
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeLesson(lesson.id)}
                          className="rounded-2xl border-red-400/20 bg-transparent text-red-200 hover:bg-red-500/10 hover:text-red-100 dark:border-red-400/20 dark:bg-transparent dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          Удалить
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-white/70">Предмет</Label>
                          <Input
                            list="subject-suggestions"
                            value={lesson.subject}
                            onChange={(event) => updateLesson(lesson.id, 'subject', event.target.value)}
                            placeholder="Например: История, Алгебра, Труд"
                            className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28 dark:border-white/10 dark:bg-black/20"
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-white/70">Начало</Label>
                            <Input
                              type="time"
                              value={lesson.start_time}
                              onChange={(event) => updateLesson(lesson.id, 'start_time', event.target.value)}
                              className="h-12 rounded-2xl border-white/10 bg-black/20 text-white dark:border-white/10 dark:bg-black/20"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-white/70">Конец</Label>
                            <Input
                              type="time"
                              value={lesson.end_time}
                              onChange={(event) => updateLesson(lesson.id, 'end_time', event.target.value)}
                              className="h-12 rounded-2xl border-white/10 bg-black/20 text-white dark:border-white/10 dark:bg-black/20"
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-white/70">Учитель</Label>
                            <Input
                              value={lesson.teacher}
                              onChange={(event) => updateLesson(lesson.id, 'teacher', event.target.value)}
                              placeholder="Например: Петрова И.А."
                              className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28 dark:border-white/10 dark:bg-black/20"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-white/70">Кабинет</Label>
                            <Input
                              value={lesson.room}
                              onChange={(event) => updateLesson(lesson.id, 'room', event.target.value)}
                              placeholder="Например: 203"
                              className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28 dark:border-white/10 dark:bg-black/20"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-white/70">Задание или заметка</Label>
                          <Textarea
                            value={lesson.notes}
                            onChange={(event) => updateLesson(lesson.id, 'notes', event.target.value)}
                            placeholder="Например: повторить параграф, подготовить сообщение, принести тетрадь"
                            className="min-h-24 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28 dark:border-white/10 dark:bg-black/20"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-white/70">Материалы</Label>
                          <Textarea
                            value={lesson.materialsText}
                            onChange={(event) => updateLesson(lesson.id, 'materialsText', event.target.value)}
                            placeholder="Каждый материал с новой строки: PDF, ссылка, учебник, презентация"
                            className="min-h-20 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28 dark:border-white/10 dark:bg-black/20"
                          />
                        </div>
                      </div>

                      <div className="rounded-[28px] border border-primary/12 bg-primary/[0.08] p-5">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-primary/70">Preview</div>
                        <div className="mt-4 text-2xl font-semibold leading-tight text-white">
                          {lesson.subject.trim() || 'Предмет появится здесь'}
                        </div>
                        <div className="mt-4 space-y-3 text-sm text-white/70">
                          <div className="flex items-center gap-2">
                            <Clock3 className="h-4 w-4 text-primary" />
                            <span>{lesson.start_time || '--:--'} - {lesson.end_time || '--:--'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <UserRound className="h-4 w-4 text-primary" />
                            <span>{lesson.teacher.trim() || 'Учитель не указан'}</span>
                          </div>
                          <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-white/60">
                            {lesson.notes.trim() || 'Здесь появится задание или комментарий по уроку.'}
                          </div>
                          {lesson.materialsText.trim() && (
                            <div className="flex flex-wrap gap-2">
                              {lesson.materialsText
                                .split('\n')
                                .map((item) => item.trim())
                                .filter(Boolean)
                                .slice(0, 4)
                                .map((item) => (
                                  <span
                                    key={item}
                                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70"
                                  >
                                    {item}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <datalist id="subject-suggestions">
                {subjectSuggestions.map((subject) => (
                  <option key={subject} value={subject} />
                ))}
              </datalist>

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-white/8 pt-2 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={addLesson}
                  className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.06]"
                >
                  <Plus className="h-4 w-4" />
                  Добавить ещё урок
                </Button>

                <Button type="button" onClick={save} disabled={isBusy} className="rounded-2xl px-6">
                  <WandSparkles className="h-4 w-4" />
                  {isBusy ? 'Сохраняю...' : 'Сохранить день'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function SchedulePage() {
  const appState = useAppState()
  const defaultDay = appState ? Math.max(0, Math.min(6, appState.defaultWeekday - 1)) : 0
  const [selectedDay, setSelectedDay] = useState(defaultDay)
  const [weekOffset, setWeekOffset] = useState(0)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    setSelectedDay(defaultDay)
  }, [defaultDay])

  const weekDates = getWeekDates(weekOffset)
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]
  const weekNumber = (appState?.defaultWeekNumber || 1) + weekOffset
  const selectedDate = weekDates[selectedDay]
  const subjectSuggestions = Array.from(
    new Set(
      [
        ...(appState?.subjects || []),
        ...lessons.map((lesson) => lesson.subject),
      ]
        .map((subject) => subject.trim())
        .filter(Boolean),
    ),
  )

  const loadLessonsForDay = async (dayIndex: number) => {
    const result = await tauriInvoke<any[]>('get_schedule_for_weekday', {
      weekNumber,
      weekday: dayIndex + 1,
    })

    return (result || []).map((lesson, index) => ({
      id: String(lesson.id ?? `${dayIndex}-${index}`),
      subject: String(lesson.subject || ''),
      teacher: String(lesson.teacher || ''),
      room: String(lesson.room || ''),
      start_time: String(lesson.start_time || ''),
      end_time: String(lesson.end_time || ''),
      notes: String(lesson.notes || ''),
      materials: Array.isArray(lesson.materials) ? lesson.materials.map(String) : [],
      order: index + 1,
    })) as Lesson[]
  }

  const refreshSelectedDay = async () => {
    setIsLoading(true)
    setPageError('')
    try {
      const items = await loadLessonsForDay(selectedDay)
      setLessons(items)
    } catch (err) {
      setLessons([])
      setPageError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshSelectedDay()
  }, [selectedDay, weekOffset, appState?.defaultWeekNumber, appState?.defaultWeekday])

  const saveDayLessons = async (dayIndex: number, drafts: EditorLesson[]) => {
    const normalizedLessons = drafts
      .map(mapEditorToPayload)
      .filter((lesson) => lesson.subject || lesson.start_time || lesson.end_time || lesson.teacher || lesson.notes)

    const payload: SaveScheduleLessonsPayload = {
      week_number: weekNumber,
      weekday: dayIndex + 1,
      lessons: normalizedLessons,
    }

    await tauriInvoke('save_schedule_lessons', { payload })
    setSelectedDay(dayIndex)
    setLessons(
      normalizedLessons.map((lesson, index) => ({
        ...lesson,
        id: `saved-${dayIndex}-${index}`,
        order: index + 1,
      })),
    )
    setPageError('')
  }

  const deleteLesson = async (lesson: Lesson) => {
    const shouldDelete = window.confirm(`Удалить урок "${lesson.subject || 'без названия'}"?`)
    if (!shouldDelete) {
      return
    }

    setIsLoading(true)
    setPageError('')
    try {
      await tauriInvoke('delete_schedule_lesson', {
        payload: {
          week_number: weekNumber,
          weekday: selectedDay + 1,
          lesson: {
            subject: lesson.subject,
            teacher: lesson.teacher,
            room: lesson.room,
            start_time: lesson.start_time,
            end_time: lesson.end_time,
            notes: lesson.notes,
            materials: lesson.materials,
          },
        },
      })
      await refreshSelectedDay()
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err))
      setIsLoading(false)
    }
  }

  const user = appState?.authSession
    ? {
        displayName: appState.authSession.display_name,
        email: appState.authSession.email,
      }
    : undefined

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(64,88,255,0.22),_transparent_28%),linear-gradient(180deg,_#050814_0%,_#060914_100%)] text-white">
      <div className="flex min-h-screen">
        <WorkspaceSidebar displayName={user?.displayName} email={user?.email} />

        <main className="flex min-h-screen flex-1 flex-col">
          <div className="border-b border-white/6 px-5 py-5 sm:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/12 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_18px_rgba(92,113,255,0.95)]" />
                    Schedule Workspace
                  </div>
                  <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Расписание недели
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55 sm:text-base">
                    Управляй уроками в конструкторе: выбирай день, собирай блоки, переставляй занятия местами и сохраняй готовое расписание без отдельного окна импорта.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">Неделя</div>
                    <div className="mt-1 text-lg font-semibold text-white">{weekNumber}</div>
                  </div>
                  <Button onClick={() => setIsDialogOpen(true)} className="rounded-2xl px-5 py-6 text-sm shadow-[0_16px_50px_-18px_rgba(92,113,255,0.65)]">
                    <Plus className="h-4 w-4" />
                    Добавить
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="rounded-[30px] border border-white/7 bg-white/[0.035] p-4 shadow-[0_30px_90px_-55px_rgba(0,0,0,0.8)]">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">Навигация по неделе</div>
                      <div className="text-xl font-semibold text-white">{formatWeekRange(weekStart, weekEnd)}</div>
                    </div>

                    <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-black/18 p-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setWeekOffset((current) => current - 1)}
                        className="h-11 w-11 rounded-2xl text-white/70 hover:bg-white/[0.08] hover:text-white"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <div className="min-w-[180px] px-3 text-center">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">Диапазон</div>
                        <div className="mt-1 text-sm font-medium text-white/80">{formatWeekRange(weekStart, weekEnd)}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setWeekOffset((current) => current + 1)}
                        className="h-11 w-11 rounded-2xl text-white/70 hover:bg-white/[0.08] hover:text-white"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                    {weekDates.map((date, index) => {
                      const isSelected = selectedDay === index
                      return (
                        <button
                          key={date.toISOString()}
                          type="button"
                          onClick={() => setSelectedDay(index)}
                          className={cn(
                            'relative overflow-hidden rounded-[24px] border px-4 py-4 text-left transition-all duration-200',
                            isSelected
                              ? 'border-primary/30 bg-primary shadow-[0_0_40px_-14px_rgba(92,113,255,0.9)]'
                              : 'border-white/8 bg-[#0b1020] hover:border-white/16 hover:bg-white/[0.05]',
                          )}
                        >
                          {isSelected && (
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_55%)]" />
                          )}
                          <div className="relative">
                            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-white">{DAYS_TINY[index]}</div>
                            <div className="mt-3 text-3xl font-semibold leading-none text-white">{date.getDate()}</div>
                            <div className="mt-3 text-sm font-medium text-white">{DAYS_SHORT[index]}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <SummaryCard label="День" value={DAYS_FULL[selectedDay]} hint={selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} />
                  <SummaryCard label="Уроков" value={String(lessons.length)} hint="Количество блоков на выбранный день" />
                  <SummaryCard
                    label="Следующий шаг"
                    value={lessons.length ? 'Проверь детали' : 'Собери день'}
                    hint={lessons.length ? 'Можно открыть конструктор и изменить порядок уроков' : 'Добавь первый урок через кнопку справа'}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 py-8 sm:px-8">
            {pageError && (
              <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {pageError}
              </div>
            )}

            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">Детали дня</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {DAYS_FULL[selectedDay]}, {selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                </h2>
              </div>
              <Button
                onClick={() => setIsDialogOpen(true)}
                className="rounded-2xl px-5 py-6 text-sm shadow-[0_16px_50px_-18px_rgba(92,113,255,0.65)]"
              >
                <Plus className="h-4 w-4" />
                Добавить уроки
              </Button>
            </div>

            {isLoading ? (
              <div className="grid gap-4">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-40 animate-pulse rounded-[28px] border border-white/7 bg-white/[0.04]" />
                ))}
              </div>
            ) : lessons.length > 0 ? (
              <div className="grid gap-4">
                {lessons.map((lesson, index) => (
                  <LessonPreviewCard
                    key={`${lesson.id}-${index}`}
                    lesson={lesson}
                    index={index}
                    onDelete={() => deleteLesson(lesson)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="max-w-xl rounded-[32px] border border-white/8 bg-white/[0.035] px-8 py-12 text-center shadow-[0_30px_90px_-50px_rgba(0,0,0,0.8)]">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border border-primary/16 bg-primary/12 text-primary">
                    <CalendarDays className="h-8 w-8" />
                  </div>
                  <h3 className="mt-6 text-2xl font-semibold text-white">
                    На этот день пока нет уроков
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-white/55">
                    Нажми «Добавить» и выбери день. Затем откроется конструктор, где можно создать блоки, выбрать время, указать учителя, домашнее задание и материалы.
                  </p>
                  <Button
                    onClick={() => setIsDialogOpen(true)}
                    className="mt-6 rounded-2xl px-5 py-6 text-sm shadow-[0_16px_50px_-18px_rgba(92,113,255,0.65)]"
                  >
                    <Plus className="h-4 w-4" />
                    Открыть конструктор
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <button
        type="button"
        onClick={() => setIsDialogOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-[26px] bg-primary text-white shadow-[0_22px_65px_-15px_rgba(92,113,255,0.85)] transition-all duration-200 hover:scale-105 hover:shadow-[0_24px_75px_-12px_rgba(92,113,255,0.95)] active:scale-95"
        aria-label="Добавить расписание"
      >
        <Plus className="h-7 w-7" />
      </button>

      <ScheduleBuilderDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        initialDay={selectedDay}
        weekNumber={weekNumber}
        weekDates={weekDates}
        subjectSuggestions={subjectSuggestions}
        onLoadLessons={loadLessonsForDay}
        onSaveLessons={saveDayLessons}
      />
    </div>
  )
}
