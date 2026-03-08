'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface ComingSoonProps {
  title: string
  description: string
  icon: React.ReactNode
}

export function ComingSoon({ title, description, icon }: ComingSoonProps) {
  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 sm:px-6 pt-20">
      <div className="text-center max-w-md animate-slide-up">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/15 to-accent/10 flex items-center justify-center mx-auto mb-8 text-primary">
          {icon}
        </div>
        
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/15 text-accent text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          В разработке
        </div>
        
        <h1 className="text-3xl font-bold text-foreground mb-4 text-balance">
          {title}
        </h1>
        
        <p className="text-muted-foreground leading-relaxed mb-8 text-pretty">
          {description}
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild className="w-full sm:w-auto rounded-xl">
            <Link href="/">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mr-2">
                <path d="M11 13L7 9L11 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              На главную
            </Link>
          </Button>
          <Button variant="outline" className="w-full sm:w-auto rounded-xl">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mr-2">
              <path d="M9 15C12.3137 15 15 12.3137 15 9C15 5.68629 12.3137 3 9 3C5.68629 3 3 5.68629 3 9C3 10.3831 3.43913 11.6651 4.18235 12.7143L3 15L5.28571 13.8176C6.33492 14.5609 7.61692 15 9 15Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Уведомить меня
          </Button>
        </div>
      </div>
    </main>
  )
}
