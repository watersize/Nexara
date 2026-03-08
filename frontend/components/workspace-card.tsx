'use client'

import { cn } from '@/lib/utils'
import Link from 'next/link'

interface WorkspaceCardProps {
  title: string
  description: string
  icon: React.ReactNode
  href: string
  gradient?: string
  isNew?: boolean
  className?: string
}

export function WorkspaceCard({
  title,
  description,
  icon,
  href,
  gradient = 'from-primary/10 to-primary/5',
  isNew = false,
  className
}: WorkspaceCardProps) {
  return (
    <Link href={href} className={cn('group block', className)}>
      <article className="relative flex flex-col h-full rounded-2xl bg-card border border-border/50 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1">
        {isNew && (
          <span className="absolute top-4 right-4 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-full bg-accent text-accent-foreground">
            Новое
          </span>
        )}
        
        <div className={cn(
          'w-14 h-14 rounded-xl flex items-center justify-center mb-5 bg-gradient-to-br transition-transform duration-300 group-hover:scale-110',
          gradient
        )}>
          <div className="text-primary">
            {icon}
          </div>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
          {title}
        </h3>
        
        <p className="text-sm text-muted-foreground leading-relaxed flex-1">
          {description}
        </p>

        <div className="mt-4 flex items-center gap-2 text-sm font-medium text-primary opacity-0 translate-x-[-8px] transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
          <span>Открыть</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-1">
            <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </article>
    </Link>
  )
}
