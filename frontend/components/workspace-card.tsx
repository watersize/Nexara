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

export function WorkspaceCard({ title, description, icon, href, gradient = 'from-primary/10 to-primary/5', isNew = false, className }: WorkspaceCardProps) {
  return (
    <Link href={href} className={cn('group block', className)}>
      <article className="relative flex h-full flex-col rounded-2xl border border-border/50 bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
        {isNew ? <span className="absolute right-4 top-4 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-foreground">Новое</span> : null}
        <div className={cn('mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br transition-transform duration-300 group-hover:scale-110', gradient)}>
          <div className="text-primary">{icon}</div>
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground transition-colors group-hover:text-primary">{title}</h3>
        <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-4 flex translate-x-[-8px] items-center gap-2 text-sm font-medium text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
          <span>Открыть</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-1"><path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </article>
    </Link>
  )
}
