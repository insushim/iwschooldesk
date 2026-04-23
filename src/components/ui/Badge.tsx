import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface BadgeProps {
  children: ReactNode
  color?: string
  className?: string
}

export function Badge({ children, color, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        className
      )}
      style={{
        backgroundColor: color ? `${color}20` : 'var(--accent-light)',
        color: color ?? 'var(--accent)',
      }}
    >
      {children}
    </span>
  )
}
