import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1',
  {
    variants: {
      variant: {
        default: 'bg-[var(--accent)] text-white hover:opacity-90 shadow-sm',
        secondary: 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-widget)]/40 hover:bg-[var(--bg-widget-hover)]',
        ghost: 'hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
        danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
        outline: 'border border-[var(--border-widget)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]',
      },
      size: {
        sm: 'h-9 px-5 text-sm',
        md: 'h-11 px-7 text-[15px]',
        lg: 'h-12 px-9 text-base',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
)
Button.displayName = 'Button'
