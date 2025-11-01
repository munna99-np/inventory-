import * as React from 'react'
import { cn } from '../../lib/utils'

type StatCardProps = {
  title: string
  value: string | number
  subtitle?: string
  percent?: number
  icon?: React.ReactNode
  accent?: string // css color string
  className?: string
  variant?: 'default' | 'inverted'
}

export function StatCard({ title, value, subtitle, percent, icon, accent, className, variant = 'default' }: StatCardProps) {
  const p = Math.max(0, Math.min(100, Math.round(percent ?? 0)))
  const color = accent || 'hsl(var(--primary))'
  const inverted = variant === 'inverted'
  return (
    <div
      className={cn(
        'rounded-xl border bg-card/90 backdrop-blur-sm p-4 shadow-sm',
        inverted && 'border-white/30 bg-white/10 text-white',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn('text-sm font-medium', inverted ? 'text-white/80' : 'text-muted-foreground')}>{title}</div>
        {icon && <div className={cn('opacity-90', inverted && 'text-white')} style={{ color }}>{icon}</div>}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div
          className={cn(
            'relative grid h-12 w-12 place-items-center rounded-full',
            inverted ? 'bg-white/20' : 'bg-muted'
          )}
          aria-label={typeof p === 'number' ? `${p}%` : undefined}
          role="img"
        >
          {/* ring background */}
          <div className="absolute inset-0 rounded-full" style={{
            background: `conic-gradient(${color} ${p * 3.6}deg, rgba(0,0,0,0.08) 0deg)`
          }} />
          <div className={cn('absolute inset-1 rounded-full', inverted ? 'bg-white/10' : 'bg-card')} />
          <span className={cn('relative text-[11px] font-semibold', inverted ? 'text-white/90' : 'text-foreground/80')}>{p}%</span>
        </div>
        <div className="min-w-0">
          <div className={cn('text-2xl font-semibold tracking-tight truncate', inverted && 'text-white')}>{value}</div>
          {subtitle && (
            <div className={cn('mt-0.5 truncate text-xs', inverted ? 'text-white/70' : 'text-muted-foreground')}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StatCard
