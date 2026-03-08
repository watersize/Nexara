'use client'

import { NexaraHeader } from '@/components/nexara-header'
import { ComingSoon } from '@/components/coming-soon'

export default function NotebookPage() {
  return (
    <div className="min-h-screen bg-background">
      <NexaraHeader showBackButton title="Блокнот" />
      <ComingSoon 
        title="Блокнот"
        description="Заметки по предметам, домашние задания и конспекты. Скоро здесь появится умный блокнот с AI-помощником."
        icon={
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path d="M14 8H34C36.2091 8 38 9.79086 38 12V36C38 38.2091 36.2091 40 34 40H14C11.7909 40 10 38.2091 10 36V12C10 9.79086 11.7909 8 14 8Z" stroke="currentColor" strokeWidth="2.5"/>
            <path d="M18 18H30M18 24H30M18 30H24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        }
      />
    </div>
  )
}
