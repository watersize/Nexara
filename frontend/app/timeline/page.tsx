'use client'

import React, { useEffect, useState, useRef, useMemo } from 'react'
import { AppShell } from '@/components/app-shell'
import { useAppState } from '@/lib/tauri-provider'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { cn } from '@/lib/utils'
import { format, addDays, startOfWeek, differenceInDays, parseISO, isValid, startOfDay, endOfDay, addHours, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Clock, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, CalendarDays, ListTodo } from 'lucide-react'
import { useTheme } from 'next-themes'

interface TimelineTask {
  id: string
  title: string
  topic: string
  due_date: string
  start_time: string
  end_time: string
  duration_minutes: number
  details: string
  bucket: string
  done: boolean
  updated_at: string
}

type ZoomLevel = 'hours' | 'days' | 'weeks' | 'months'

const ZOOM_LEVELS: ZoomLevel[] = ['hours', 'days', 'weeks', 'months']
const ZOOM_CELL_WIDTH: Record<ZoomLevel, number> = { hours: 80, days: 160, weeks: 200, months: 260 }
const LANE_HEIGHT = 56
const HEADER_HEIGHT = 54

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  done:    { bg: 'rgba(52, 211, 153, 0.22)', border: 'rgba(52, 211, 153, 0.45)', text: '#34d399' },
  today:   { bg: 'rgba(96, 165, 250, 0.22)', border: 'rgba(96, 165, 250, 0.45)', text: '#60a5fa' },
  week:    { bg: 'rgba(167, 139, 250, 0.22)', border: 'rgba(167, 139, 250, 0.45)', text: '#a78bfa' },
  overdue: { bg: 'rgba(251, 113, 133, 0.22)', border: 'rgba(251, 113, 133, 0.45)', text: '#fb7185' },
  default: { bg: 'rgba(148, 163, 184, 0.18)', border: 'rgba(148, 163, 184, 0.35)', text: '#94a3b8' },
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null
  // Try ISO
  const iso = parseISO(dateStr)
  if (isValid(iso)) return iso
  // Try dd.MM.yyyy
  const parts = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (parts) {
    const d = new Date(+parts[3], +parts[2] - 1, +parts[1])
    if (isValid(d)) return d
  }
  return null
}

function getTaskColor(task: TimelineTask) {
  if (task.done) return STATUS_COLORS.done
  if (task.bucket === 'today') return STATUS_COLORS.today
  if (task.bucket === 'week') return STATUS_COLORS.week
  const due = parseDate(task.due_date)
  if (due && due < new Date()) return STATUS_COLORS.overdue
  return STATUS_COLORS.default
}

export default function TimelinePage() {
  const appState = useAppState()
  const user = appState?.authSession ? { displayName: appState.authSession.display_name, email: appState.authSession.email } : undefined
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted ? resolvedTheme !== 'light' : true

  const [tasks, setTasks] = useState<TimelineTask[]>([])
  const [zoom, setZoom] = useState<ZoomLevel>('days')
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()))
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    tauriInvoke<TimelineTask[]>('list_tasks')
      .then(res => setTasks(res || []))
      .catch(err => console.error('Failed to load tasks:', err))
  }, [])

  // Filter tasks that have dates
  const datedTasks = useMemo(() => {
    return tasks
      .map(t => ({ ...t, _date: parseDate(t.due_date) }))
      .filter(t => t._date !== null) as (TimelineTask & { _date: Date })[]
  }, [tasks])

  // View configuration
  const cellWidth = ZOOM_CELL_WIDTH[zoom]
  const viewSpan = zoom === 'hours' ? 24 : zoom === 'days' ? 21 : zoom === 'weeks' ? 12 : 12
  const totalWidth = cellWidth * viewSpan

  // Generate time cells
  const timeCells = useMemo(() => {
    const cells: { date: Date; label: string; sub: string; isToday: boolean }[] = []
    const now = new Date()
    for (let i = 0; i < viewSpan; i++) {
      let d: Date
      let label: string
      let sub: string
      if (zoom === 'hours') {
        d = addHours(startOfDay(anchorDate), i)
        label = format(d, 'HH:00')
        sub = i === 0 ? format(d, 'dd MMM', { locale: ru }) : ''
      } else if (zoom === 'days') {
        d = addDays(anchorDate, i - 7)
        label = format(d, 'dd')
        sub = format(d, 'EEE', { locale: ru })
      } else if (zoom === 'weeks') {
        d = addDays(anchorDate, (i - 4) * 7)
        label = `W${format(d, 'ww')}`
        sub = format(d, 'dd MMM', { locale: ru })
      } else {
        d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + i - 4, 1)
        label = format(d, 'MMM', { locale: ru })
        sub = format(d, 'yyyy')
      }
      cells.push({ date: d, label, sub, isToday: isSameDay(d, now) })
    }
    return cells
  }, [zoom, anchorDate, viewSpan])

  // Position tasks on the timeline
  const positionedTasks = useMemo(() => {
    if (timeCells.length === 0) return []
    const firstDate = timeCells[0].date
    return datedTasks.map(t => {
      let pos: number
      if (zoom === 'hours') {
        pos = ((t._date.getTime() - firstDate.getTime()) / (1000 * 60 * 60)) * cellWidth
      } else if (zoom === 'days') {
        pos = differenceInDays(t._date, firstDate) * cellWidth
      } else if (zoom === 'weeks') {
        pos = (differenceInDays(t._date, firstDate) / 7) * cellWidth
      } else {
        const monthDiff = (t._date.getFullYear() - firstDate.getFullYear()) * 12 + t._date.getMonth() - firstDate.getMonth()
        pos = monthDiff * cellWidth
      }
      const duration = Math.max(t.duration_minutes || 45, 30)
      const width = zoom === 'hours' ? (duration / 60) * cellWidth : Math.max(cellWidth * 0.8, 100)
      return { ...t, left: pos, width }
    })
  }, [datedTasks, timeCells, zoom, cellWidth])

  // Group tasks into swim lanes to avoid overlapping
  const lanes = useMemo(() => {
    const sorted = [...positionedTasks].sort((a, b) => a.left - b.left)
    const result: typeof positionedTasks[] = []
    for (const task of sorted) {
      let placed = false
      for (const lane of result) {
        const lastInLane = lane[lane.length - 1]
        if (lastInLane.left + lastInLane.width + 8 <= task.left) {
          lane.push(task)
          placed = true
          break
        }
      }
      if (!placed) result.push([task])
    }
    return result
  }, [positionedTasks])

  const changeZoom = (dir: number) => {
    const idx = ZOOM_LEVELS.indexOf(zoom)
    const next = idx + dir
    if (next >= 0 && next < ZOOM_LEVELS.length) setZoom(ZOOM_LEVELS[next])
  }

  const navigate = (dir: number) => {
    if (zoom === 'hours') setAnchorDate(d => addHours(d, dir * 6))
    else if (zoom === 'days') setAnchorDate(d => addDays(d, dir * 7))
    else if (zoom === 'weeks') setAnchorDate(d => addDays(d, dir * 28))
    else setAnchorDate(d => new Date(d.getFullYear(), d.getMonth() + dir * 3, 1))
  }

  const contentHeight = Math.max(lanes.length * LANE_HEIGHT + HEADER_HEIGHT + 40, 300)

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className={cn(
          'flex items-center justify-between gap-3 border-b px-5 py-3',
          dark ? 'border-white/8 bg-white/[0.02]' : 'border-gray-200 bg-white'
        )}>
          <div className="flex items-center gap-3">
            <Clock className={cn('h-5 w-5', dark ? 'text-white/60' : 'text-gray-500')} />
            <h1 className={cn('text-lg font-semibold', dark ? 'text-white' : 'text-gray-900')}>Timeline</h1>
            <span className={cn('rounded-full px-3 py-0.5 text-xs font-medium', dark ? 'bg-white/8 text-white/50' : 'bg-gray-100 text-gray-500')}>
              {tasks.length} задач
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setAnchorDate(startOfDay(new Date())); }}
              className={cn('rounded-xl px-3 py-1.5 text-xs font-medium transition-colors', dark ? 'bg-white/8 text-white/70 hover:bg-white/12' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
            >
              Сегодня
            </button>
            <div className={cn('flex items-center rounded-xl border', dark ? 'border-white/10' : 'border-gray-200')}>
              <button onClick={() => navigate(-1)} className={cn('px-2 py-1.5 transition-colors', dark ? 'text-white/50 hover:text-white' : 'text-gray-400 hover:text-gray-700')}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className={cn('min-w-[100px] text-center text-xs font-medium', dark ? 'text-white/60' : 'text-gray-500')}>
                {format(anchorDate, 'dd MMM yyyy', { locale: ru })}
              </span>
              <button onClick={() => navigate(1)} className={cn('px-2 py-1.5 transition-colors', dark ? 'text-white/50 hover:text-white' : 'text-gray-400 hover:text-gray-700')}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className={cn('flex items-center rounded-xl border', dark ? 'border-white/10' : 'border-gray-200')}>
              <button onClick={() => changeZoom(-1)} className={cn('px-2 py-1.5 transition-colors', dark ? 'text-white/50 hover:text-white' : 'text-gray-400 hover:text-gray-700')}>
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className={cn('min-w-[64px] text-center text-xs font-semibold uppercase tracking-wider', dark ? 'text-white/50' : 'text-gray-500')}>
                {zoom}
              </span>
              <button onClick={() => changeZoom(1)} className={cn('px-2 py-1.5 transition-colors', dark ? 'text-white/50 hover:text-white' : 'text-gray-400 hover:text-gray-700')}>
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto"
          style={{ cursor: 'grab' }}
        >
          <div style={{ width: totalWidth, minHeight: contentHeight, position: 'relative' }}>
            {/* Header grid */}
            <div className={cn('sticky top-0 z-10 flex border-b', dark ? 'border-white/8 bg-[#080c18]/95 backdrop-blur' : 'border-gray-200 bg-white/95 backdrop-blur')} style={{ height: HEADER_HEIGHT }}>
              {timeCells.map((cell, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex flex-col items-center justify-center border-r text-xs',
                    dark ? 'border-white/5' : 'border-gray-100',
                    cell.isToday && (dark ? 'bg-primary/10' : 'bg-blue-50')
                  )}
                  style={{ width: cellWidth, flexShrink: 0 }}
                >
                  <span className={cn('font-semibold', cell.isToday ? 'text-primary' : dark ? 'text-white/70' : 'text-gray-700')}>{cell.label}</span>
                  {cell.sub && <span className={cn('mt-0.5', dark ? 'text-white/30' : 'text-gray-400')}>{cell.sub}</span>}
                </div>
              ))}
            </div>

            {/* Grid lines */}
            {timeCells.map((cell, i) => (
              <div
                key={`grid-${i}`}
                className={cn(
                  'absolute top-0 bottom-0 border-r',
                  cell.isToday ? (dark ? 'border-primary/25' : 'border-blue-200') : (dark ? 'border-white/[0.04]' : 'border-gray-100')
                )}
                style={{ left: i * cellWidth, width: 1 }}
              />
            ))}

            {/* Today marker */}
            {timeCells.findIndex(c => c.isToday) >= 0 && (
              <div
                className="absolute top-0 bottom-0 z-[5]"
                style={{
                  left: timeCells.findIndex(c => c.isToday) * cellWidth + cellWidth / 2,
                  width: 2,
                  background: 'linear-gradient(180deg, rgba(99,102,241,0.8) 0%, rgba(99,102,241,0.1) 100%)',
                }}
              />
            )}

            {/* Task lanes */}
            <div style={{ paddingTop: 12 }}>
              {lanes.length === 0 && (
                <div className={cn('flex flex-col items-center justify-center py-20', dark ? 'text-white/30' : 'text-gray-400')}>
                  <CalendarDays className="mb-3 h-10 w-10 opacity-40" />
                  <p className="text-sm font-medium">Нет задач с датами</p>
                  <p className="mt-1 text-xs opacity-60">Добавьте дату к задачам в планировщике</p>
                </div>
              )}
              {lanes.map((lane, laneIdx) => (
                <div key={laneIdx} className="relative" style={{ height: LANE_HEIGHT }}>
                  {lane.map(task => {
                    const color = getTaskColor(task)
                    return (
                      <div
                        key={task.id}
                        className="absolute flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02] hover:shadow-lg cursor-default"
                        style={{
                          left: task.left,
                          width: task.width,
                          top: 4,
                          height: LANE_HEIGHT - 12,
                          background: color.bg,
                          border: `1px solid ${color.border}`,
                          color: color.text,
                          backdropFilter: 'blur(8px)',
                        }}
                        title={`${task.title}\n${task.due_date}${task.start_time ? ` ${task.start_time}–${task.end_time}` : ''}`}
                      >
                        {task.done && <ListTodo className="h-3.5 w-3.5 shrink-0 opacity-60" />}
                        <span className="truncate">{task.title}</span>
                        {task.start_time && (
                          <span className="ml-auto shrink-0 opacity-50">{task.start_time}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stats footer */}
        <div className={cn(
          'flex items-center justify-between border-t px-5 py-2 text-xs',
          dark ? 'border-white/8 bg-white/[0.02] text-white/40' : 'border-gray-200 bg-gray-50 text-gray-500'
        )}>
          <span>{datedTasks.length} задач на таймлайне</span>
          <span>{datedTasks.filter(t => t.done).length} завершено</span>
        </div>
      </main>
    </AppShell>
  )
}
