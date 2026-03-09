'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { cn } from '@/lib/utils'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Trash2, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'

const DAYS_SHORT = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']
const DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
const DEFAULT_TIMES = [
  ['08:30', '09:15'],
  ['09:25', '10:10'],
  ['10:25', '11:10'],
  ['11:25', '12:10'],
  ['12:30', '13:15'],
  ['13:25', '14:10'],
  ['14:20', '15:05'],
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

function formatWeekRange(start: Date, end: Date) {
  const startLabel = start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  const endLabel = end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${startLabel} - ${endLabel}`
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
    materials: lesson.materialsText.split('\n').map((item) => item.trim()).filter(Boolean),
  }
}

function DayButton({
  date,
  index,
  selected,
  onClick,
}: {
  date: Date
  index: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-w-0 w-full rounded-[20px] border px-3 py-3 text-left transition-all',
        selected
          ? 'border-primary/35 bg-primary shadow-[0_0_28px_-10px_rgba(92,113,255,0.9)]'
          : 'border-white/8 bg-white/[0.03] hover:border-white/16 hover:bg-white/[0.05]',
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white">{DAYS_SHORT[index]}</div>
      <div className="mt-3 text-3xl font-semibold leading-none text-white">{date.getDate()}</div>
      <div className="mt-2 text-sm font-medium text-white">{DAYS_SHORT[index]}</div>
    </button>
  )
}

function ScheduleDialog({
  open,
  onOpenChange,
  initialDay,
  weekNumber,
  weekDates,
  subjectSuggestions,
  onLoadLessons,
  onSaveLessons,
  onDuplicateLessons,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDay: number
  weekNumber: number
  weekDates: Date[]
  subjectSuggestions: string[]
  onLoadLessons: (dayIndex: number) => Promise<Lesson[]>
  onSaveLessons: (dayIndex: number, lessons: EditorLesson[]) => Promise<void>
  onDuplicateLessons: (dayIndex: number, lessons: EditorLesson[], mode: 'day-month' | 'week-month') => Promise<void>
}) {
  const [step, setStep] = useState<'day' | 'editor'>('day')
  const [selectedDay, setSelectedDay] = useState(initialDay)
  const [lessons, setLessons] = useState<EditorLesson[]>([])
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setStep('day')
      setSelectedDay(initialDay)
      setLessons([])
      setIsBusy(false)
    }
  }, [open, initialDay])

  const loadDay = async (dayIndex: number) => {
    setIsBusy(true)
    try {
      const items = await onLoadLessons(dayIndex)
      setSelectedDay(dayIndex)
      setLessons(items.length ? items.map(mapLessonToEditor) : [createDraft(0)])
      setStep('editor')
    } catch (error) {
      toast.error('Не удалось открыть день', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsBusy(false)
    }
  }

  const updateLesson = (id: string, patch: Partial<EditorLesson>) => {
    setLessons((current) => current.map((lesson) => (lesson.id === id ? { ...lesson, ...patch } : lesson)))
  }

  const moveLesson = (index: number, direction: -1 | 1) => {
    setLessons((current) => {
      const next = [...current]
      const target = index + direction
      if (target < 0 || target >= next.length) return current
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const removeLesson = (id: string) => {
    setLessons((current) => {
      const next = current.filter((lesson) => lesson.id !== id)
      return next.length ? next : [createDraft(0)]
    })
  }

  const save = async () => {
    setIsBusy(true)
    try {
      await onSaveLessons(selectedDay, lessons)
      onOpenChange(false)
    } catch (error) {
      toast.error('Не удалось сохранить день', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsBusy(false)
    }
  }

  const duplicate = async (mode: 'day-month' | 'week-month') => {
    setIsBusy(true)
    try {
      await onDuplicateLessons(selectedDay, lessons, mode)
      toast.success(mode === 'day-month' ? 'День продублирован на месяц вперед' : 'Неделя продублирована на месяц вперед')
    } catch (error) {
      toast.error('Не удалось продублировать расписание', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[88vh] overflow-hidden rounded-[28px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.14),_transparent_32%),linear-gradient(180deg,_rgba(12,14,28,0.98),_rgba(7,9,20,1))] p-0 text-white sm:max-w-5xl"
      >
        <div className="flex items-start justify-between border-b border-white/8 px-5 py-4">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-2xl font-semibold text-white">
              {step === 'day' ? 'Добавить расписание' : `Конструктор: ${DAYS_FULL[selectedDay]}`}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-white/55">
              {step === 'day'
                ? 'Сначала выбери день. Затем собери уроки, время, учителя, задание и материалы.'
                : `Неделя ${weekNumber}. Меняй порядок блоков и редактируй каждую карточку.`}
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(88vh-88px)] overflow-y-auto px-5 py-5 scrollbar-none">
          {step === 'day' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {weekDates.map((date, index) => (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => loadDay(index)}
                  className={cn(
                    'rounded-[24px] border p-5 text-left transition-all',
                    selectedDay === index
                      ? 'border-primary/35 bg-primary/12'
                      : 'border-white/8 bg-white/[0.03] hover:border-white/16 hover:bg-white/[0.05]',
                  )}
                >
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">{DAYS_SHORT[index]}</div>
                  <div className="mt-4 text-4xl font-semibold text-white">{date.getDate()}</div>
                  <div className="mt-2 text-sm text-white/70">{DAYS_FULL[index]}</div>
                </button>
              ))}
              {isBusy && <div className="text-sm text-white/55">Загружаю выбранный день...</div>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Выбранный день</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {DAYS_FULL[selectedDay]}, {weekDates[selectedDay].toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void duplicate('day-month')}
                    className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.06]"
                  >
                    Дублировать месяц
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void duplicate('week-month')}
                    className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.06]"
                  >
                    Дублировать неделю
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setStep('day')}
                    className="rounded-2xl border-white/10 bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.06]"
                  >
                    Сменить день
                  </Button>
                  <Button onClick={() => setLessons((current) => [...current, createDraft(current.length)])} className="rounded-2xl">
                    <Plus className="h-4 w-4" />
                    Блок
                  </Button>
                </div>
              </div>

              {lessons.map((lesson, index) => (
                <div key={lesson.id} className="rounded-[28px] border border-white/8 bg-white/[0.035] p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
                    <div className="text-lg font-semibold text-white">{lesson.subject.trim() || `Урок ${index + 1}`}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveLesson(index, -1)}
                        disabled={index === 0}
                        className="rounded-2xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.06]"
                      >
                        ↑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveLesson(index, 1)}
                        disabled={index === lessons.length - 1}
                        className="rounded-2xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.06]"
                      >
                        ↓
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeLesson(lesson.id)}
                        className="rounded-2xl border-red-400/20 bg-transparent text-red-200 hover:bg-red-500/10 hover:text-red-100 dark:border-red-400/20 dark:bg-transparent dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-white/70">Предмет</Label>
                        <Input
                          list="schedule-subjects"
                          value={lesson.subject}
                          onChange={(event) => updateLesson(lesson.id, { subject: event.target.value })}
                          placeholder="Например: География"
                          className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28 dark:border-white/10 dark:bg-black/20"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-white/70">Начало</Label>
                          <Input
                            type="time"
                            value={lesson.start_time}
                            onChange={(event) => updateLesson(lesson.id, { start_time: event.target.value })}
                            className="h-12 rounded-2xl border-white/10 bg-black/20 text-white dark:border-white/10 dark:bg-black/20"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-white/70">Конец</Label>
                          <Input
                            type="time"
                            value={lesson.end_time}
                            onChange={(event) => updateLesson(lesson.id, { end_time: event.target.value })}
                            className="h-12 rounded-2xl border-white/10 bg-black/20 text-white dark:border-white/10 dark:bg-black/20"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-white/70">Учитель</Label>
                          <Input
                            value={lesson.teacher}
                            onChange={(event) => updateLesson(lesson.id, { teacher: event.target.value })}
                            placeholder="Например: Петрова И.А."
                            className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28 dark:border-white/10 dark:bg-black/20"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-white/70">Кабинет</Label>
                          <Input
                            value={lesson.room}
                            onChange={(event) => updateLesson(lesson.id, { room: event.target.value })}
                            placeholder="Например: 203"
                            className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28 dark:border-white/10 dark:bg-black/20"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-white/70">Задание или заметка</Label>
                        <Textarea
                          value={lesson.notes}
                          onChange={(event) => updateLesson(lesson.id, { notes: event.target.value })}
                          placeholder="Например: повторить параграф, решить задачу"
                          className="min-h-24 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28 dark:border-white/10 dark:bg-black/20"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-white/70">Материалы</Label>
                        <Textarea
                          value={lesson.materialsText}
                          onChange={(event) => updateLesson(lesson.id, { materialsText: event.target.value })}
                          placeholder="Каждый материал с новой строки"
                          className="min-h-20 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/28 dark:border-white/10 dark:bg-black/20"
                        />
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-primary/12 bg-primary/[0.08] p-5">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-primary/70">Preview</div>
                      <div className="mt-4 text-2xl font-semibold text-white">{lesson.subject || 'Предмет появится здесь'}</div>
                      <div className="mt-4 space-y-3 text-sm text-white/70">
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-4 w-4 text-primary" />
                          <span>{lesson.start_time || '--:--'} - {lesson.end_time || '--:--'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <UserRound className="h-4 w-4 text-primary" />
                          <span>{lesson.teacher || 'Учитель не указан'}</span>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-white/60">
                          {lesson.notes || 'Здесь появится задание или комментарий по уроку.'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <datalist id="schedule-subjects">
                {subjectSuggestions.map((subject) => (
                  <option key={subject} value={subject} />
                ))}
              </datalist>

              <div className="sticky bottom-0 flex justify-end border-t border-white/8 bg-[linear-gradient(180deg,rgba(7,9,20,0.15),rgba(7,9,20,0.98))] pb-1 pt-4">
                <Button onClick={save} disabled={isBusy} className="rounded-2xl px-6">
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
  const [previewLesson, setPreviewLesson] = useState<Lesson | null>(null)

  useEffect(() => {
    setSelectedDay(defaultDay)
  }, [defaultDay])

  const weekDates = getWeekDates(weekOffset)
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]
  const weekNumber = (appState?.defaultWeekNumber || 1) + weekOffset
  const selectedDate = weekDates[selectedDay]
  const subjectSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          [...(appState?.subjects || []), ...lessons.map((lesson) => lesson.subject)]
            .map((subject) => subject.trim())
            .filter(Boolean),
        ),
      ),
    [appState?.subjects, lessons],
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
    try {
      setLessons(await loadLessonsForDay(selectedDay))
    } catch (error) {
      setLessons([])
      toast.error('Не удалось загрузить расписание', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshSelectedDay()
  }, [selectedDay, weekOffset, appState?.defaultWeekNumber, appState?.defaultWeekday])

  const saveDayLessons = async (dayIndex: number, drafts: EditorLesson[]) => {
    const normalized = drafts
      .map(mapEditorToPayload)
      .filter((lesson) => lesson.subject || lesson.start_time || lesson.end_time || lesson.teacher || lesson.notes)

    await tauriInvoke('save_schedule_lessons', {
      payload: {
        week_number: weekNumber,
        weekday: dayIndex + 1,
        lessons: normalized,
      },
    })

    setSelectedDay(dayIndex)
    setLessons(
      normalized.map((lesson, index) => ({
        ...lesson,
        id: `saved-${dayIndex}-${index}`,
        order: index + 1,
      })),
    )
    toast.success('Расписание сохранено')
  }

  const duplicateLessons = async (dayIndex: number, drafts: EditorLesson[], mode: 'day-month' | 'week-month') => {
    const normalized = drafts
      .map(mapEditorToPayload)
      .filter((lesson) => lesson.subject || lesson.start_time || lesson.end_time || lesson.teacher || lesson.notes)

    if (mode === 'day-month') {
      for (let offset = 1; offset <= 4; offset += 1) {
        await tauriInvoke('save_schedule_lessons', {
          payload: {
            week_number: weekNumber + offset,
            weekday: dayIndex + 1,
            lessons: normalized,
          },
        })
      }
      return
    }

    for (let weekday = 0; weekday < 7; weekday += 1) {
      const dayLessons = weekday === dayIndex
        ? normalized
        : (await loadLessonsForDay(weekday)).map((lesson) => ({
            subject: lesson.subject.trim(),
            teacher: lesson.teacher.trim(),
            room: lesson.room.trim(),
            start_time: lesson.start_time,
            end_time: lesson.end_time,
            notes: lesson.notes.trim(),
            materials: lesson.materials,
          }))

      for (let offset = 1; offset <= 4; offset += 1) {
        await tauriInvoke('save_schedule_lessons', {
          payload: {
            week_number: weekNumber + offset,
            weekday: weekday + 1,
            lessons: dayLessons,
          },
        })
      }
    }
  }

  const deleteLesson = async (lesson: Lesson) => {
    if (!window.confirm(`Удалить урок "${lesson.subject || 'без названия'}"?`)) return

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

    toast.success('Урок удалён')
    await refreshSelectedDay()
  }

  const user = appState?.authSession
    ? { displayName: appState.authSession.display_name, email: appState.authSession.email }
    : undefined

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-1 flex-col px-5 py-7 sm:px-8">
        <div className="grid gap-5">
          <section className="rounded-[30px] border border-white/7 bg-[radial-gradient(circle_at_top,_rgba(72,97,255,0.14),_transparent_36%),rgba(255,255,255,0.02)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/35">Навигация по неделе</div>
                <div className="mt-3 text-4xl font-semibold text-white">{formatWeekRange(weekStart, weekEnd)}</div>
              </div>
              <div className="flex items-center gap-2 rounded-[22px] border border-white/7 bg-white/[0.03] px-3 py-2">
                <button
                  type="button"
                  onClick={() => setWeekOffset((current) => current - 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="min-w-[220px] text-center text-lg font-semibold text-white">{formatWeekRange(weekStart, weekEnd)}</div>
                <button
                  type="button"
                  onClick={() => setWeekOffset((current) => current + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {weekDates.map((date, index) => (
                <DayButton
                  key={date.toISOString()}
                  date={date}
                  index={index}
                  selected={selectedDay === index}
                  onClick={() => setSelectedDay(index)}
                />
              ))}
            </div>
          </section>

          {false && <aside className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[28px] border border-white/7 bg-white/[0.03] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">День</div>
              <div className="mt-4 text-4xl font-semibold text-white">{DAYS_FULL[selectedDay]}</div>
              <div className="mt-2 text-lg text-white/55">{selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>
            </div>
            <div className="rounded-[28px] border border-white/7 bg-white/[0.03] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">Уроков</div>
              <div className="mt-4 text-4xl font-semibold text-white">{lessons.length}</div>
              <div className="mt-2 text-sm text-white/45">Количество блоков на выбранный день</div>
            </div>
            <div className="rounded-[28px] border border-white/7 bg-primary/85 p-5 shadow-[0_0_42px_-18px_rgba(92,113,255,0.9)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65">Следующий шаг</div>
              <div className="mt-4 text-3xl font-semibold text-white">
                {lessons.length ? 'Проверь уроки' : 'Собери день'}
              </div>
              <div className="mt-3 text-base text-white/80">
                {lessons.length ? 'Если нужно, открой конструктор и поправь порядок или детали.' : 'Добавь первый урок через круглую кнопку справа снизу.'}
              </div>
            </div>
          </aside>}
        </div>

        <section className="mt-8 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="mb-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">Детали дня</div>
            <h2 className="mt-2 text-3xl font-semibold text-white">
              {DAYS_FULL[selectedDay]}, {selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto pb-24 scrollbar-none">
            {isLoading ? (
              <div className="grid gap-4">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-32 animate-pulse rounded-[26px] border border-white/7 bg-white/[0.04]" />
                ))}
              </div>
            ) : lessons.length ? (
              <div className="grid gap-4">
                {lessons.map((lesson, index) => (
                  <article key={`${lesson.id}-${index}`} className="rounded-[26px] border border-white/7 bg-white/[0.04] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <button type="button" onClick={() => setPreviewLesson(lesson)} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-3 text-sm text-white/55">
                          <span>{lesson.order} урок</span>
                          <span>{lesson.start_time || '--:--'} - {lesson.end_time || '--:--'}</span>
                          {lesson.room && <span>каб. {lesson.room}</span>}
                        </div>
                        <h3 className="mt-3 text-2xl font-semibold text-white">{lesson.subject || 'Без названия'}</h3>
                        <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/60">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 px-3 py-1">
                            <UserRound className="h-3.5 w-3.5 text-primary" />
                            {lesson.teacher || 'Учитель не указан'}
                          </span>
                        </div>
                        {lesson.notes && (
                          <div className="mt-4 rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm leading-6 text-white/65">
                            {lesson.notes}
                          </div>
                        )}
                      </button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteLesson(lesson)}
                        className="rounded-2xl border-white/10 bg-transparent text-white/70 hover:bg-white/[0.08] hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.08]"
                      >
                        <Trash2 className="h-4 w-4" />
                        Удалить
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="max-w-xl rounded-[30px] border border-white/8 bg-white/[0.03] px-8 py-12 text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border border-primary/16 bg-primary/12 text-primary">
                    <CalendarDays className="h-8 w-8" />
                  </div>
                  <h3 className="mt-6 text-2xl font-semibold text-white">На этот день пока нет уроков</h3>
                  <p className="mt-3 text-sm leading-6 text-white/55">
                    Открой конструктор и собери день вручную: предмет, время, учитель, задание и материалы.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <button
        type="button"
        onClick={() => setIsDialogOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-[0_22px_65px_-15px_rgba(92,113,255,0.85)] transition-all duration-200 hover:scale-105 active:scale-95"
        aria-label="Добавить расписание"
      >
        <Plus className="h-6 w-6" />
      </button>

      <ScheduleDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        initialDay={selectedDay}
        weekNumber={weekNumber}
        weekDates={weekDates}
        subjectSuggestions={subjectSuggestions}
        onLoadLessons={loadLessonsForDay}
        onSaveLessons={saveDayLessons}
        onDuplicateLessons={duplicateLessons}
      />

      <Dialog open={Boolean(previewLesson)} onOpenChange={(open) => !open && setPreviewLesson(null)}>
        <DialogContent
          showCloseButton={false}
          className="rounded-[28px] border-white/10 bg-[radial-gradient(circle_at_top,_rgba(92,113,255,0.14),_transparent_32%),linear-gradient(180deg,_rgba(12,14,28,0.98),_rgba(7,9,20,1))] p-0 text-white sm:max-w-3xl"
        >
          {previewLesson ? (
            <div className="grid gap-5 p-5">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">preview</div>
                <h3 className="mt-2 text-3xl font-semibold text-white">{previewLesson.subject || 'Без названия'}</h3>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-white/70">
                <span className="rounded-full bg-primary/12 px-3 py-1 text-primary">{previewLesson.start_time || '--:--'} - {previewLesson.end_time || '--:--'}</span>
                {previewLesson.room ? <span className="rounded-full border border-white/10 px-3 py-1">каб. {previewLesson.room}</span> : null}
                <span className="rounded-full border border-white/10 px-3 py-1">{previewLesson.teacher || 'Учитель не указан'}</span>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/15 p-4 text-sm leading-7 text-white/70">
                {previewLesson.notes || 'Описание урока пока не заполнено.'}
              </div>
              {previewLesson.materials.length ? <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4"><div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-white/45">Материалы</div><div className="space-y-2 text-sm text-white/70">{previewLesson.materials.map((item, index) => <div key={`${item}-${index}`}>{item}</div>)}</div></div> : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
