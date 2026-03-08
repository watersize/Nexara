'use client'

import { useState, useEffect } from 'react'
import { NexaraHeader } from '@/components/nexara-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { useAppState } from '@/lib/tauri-provider'
import { ChevronLeft, ChevronRight, Loader2, Sparkles, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const FULL_DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

export default function PlannerPage() {
  const appState = useAppState()
  const defaultWeekday = appState ? (appState.defaultWeekday - 1) : 0
  
  const [selectedDay, setSelectedDay] = useState(defaultWeekday >= 0 && defaultWeekday <= 5 ? defaultWeekday : 0)
  const [weekOffset, setWeekOffset] = useState(0)
  const [plan, setPlan] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const generatePlan = async () => {
    setIsLoading(true)
    setPlan('')
    try {
      const weekNumber = (appState?.defaultWeekNumber || 1) + weekOffset
      const weekday = selectedDay + 1

      const response = await tauriInvoke<any>('generate_study_plan', {
        weekNumber,
        weekday
      })
      if (response && response.plan) {
        setPlan(response.plan)
      } else {
        setPlan('AI вернул пустой план.')
      }
    } catch (err: any) {
      console.error('Failed to generate plan', err)
      toast.error('Ошибка планирования', { description: err.message || String(err) })
    } finally {
      setIsLoading(false)
    }
  }

  const currentWeekStart = new Date()
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + 1 + (weekOffset * 7))
  const currentWeekEnd = new Date(currentWeekStart)
  currentWeekEnd.setDate(currentWeekStart.getDate() + 6)

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <NexaraHeader showBackButton title="AI Планировщик" />

      <main className="flex-1 pt-24 px-4 sm:px-6 mx-auto w-full max-w-3xl space-y-8">
        <div className="flex items-center justify-between bg-card border border-border/50 rounded-2xl p-2 mb-8 shadow-sm">
            <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setWeekOffset(prev => prev - 1)}
                className="rounded-xl w-10 h-10 shrink-0"
            >
                <ChevronLeft className="w-5 h-5" />
            </Button>
            
            <div className="flex flex-col items-center">
                <span className="text-sm font-medium flex items-center gap-1.5 px-3 py-1 bg-secondary rounded-full -mt-4">
                  <Calendar className="w-3.5 h-3.5" />
                  {currentWeekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} - {currentWeekEnd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </span>
                <span className="text-sm font-medium mt-2">
                    Неделя {(appState?.defaultWeekNumber || 1) + weekOffset}
                </span>
            </div>

            <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setWeekOffset(prev => prev + 1)}
                className="rounded-xl w-10 h-10 shrink-0"
            >
                <ChevronRight className="w-5 h-5" />
            </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {DAYS.map((day, idx) => (
            <button
              key={day}
              onClick={() => {
                setSelectedDay(idx)
                setPlan('') // reset plan when changing day
              }}
              className={cn(
                'shrink-0 flex flex-col items-center justify-center w-[calc(100%/6-0.5rem)] min-w-[56px] py-3 rounded-2xl text-sm font-medium transition-all duration-200 border',
                selectedDay === idx 
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20 scale-105' 
                  : 'bg-card text-muted-foreground border-border/50 hover:bg-secondary hover:text-foreground'
              )}
            >
              <span className="text-xs mb-1 opacity-80">{day}</span>
              <span className="text-lg leading-none">
                {new Date(currentWeekStart.getTime() + idx * 86400000).getDate()}
              </span>
            </button>
          ))}
        </div>

        <Card className="p-6 md:p-8 rounded-3xl shadow-sm border-border">
          <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-2">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">План на {FULL_DAYS[selectedDay].toLowerCase()}</h2>
            <p className="text-muted-foreground max-w-lg">
              Nexara проанализирует твое расписание на этот день и составит оптимальный план для подготовки и отдыха.
            </p>
            
            <Button 
              size="lg" 
              onClick={generatePlan} 
              disabled={isLoading}
              className="mt-6 rounded-xl font-semibold gap-2 shadow-sm shadow-primary/20"
            >
              {isLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Анализирую...</>
              ) : (
                <><Sparkles className="w-5 h-5" /> Создать план</>
              )}
            </Button>
          </div>

          {(plan || isLoading) && (
            <div className="mt-8 pt-8 border-t border-border/50">
              {isLoading && !plan ? (
                <div className="space-y-4 opacity-50 animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-5/6"></div>
                </div>
              ) : (
                <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-secondary prose-pre:border prose-pre:border-border">
                  <ReactMarkdown>{plan}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </Card>
      </main>
    </div>
  )
}
