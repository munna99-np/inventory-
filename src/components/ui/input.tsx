import * as React from 'react'
import { cn } from '../../lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const inputVariants = cva(
  'flex w-full rounded-md border border-input bg-background shadow-sm transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50 text-left align-middle',
  {
    variants: {
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-9 px-4 text-sm',
        lg: 'h-10 px-5 text-base',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  iconLeft?: React.ComponentType<{ className?: string }>
  iconRight?: React.ComponentType<{ className?: string }>
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, iconLeft: IconLeft, iconRight: IconRight, ...props }, ref) => {
    const iconSize = size === 'sm' || size === 'default' ? 'h-4 w-4' : 'h-5 w-5'
    const paddingLeft = IconLeft ? (size === 'sm' ? 'pl-9' : size === 'lg' ? 'pl-11' : 'pl-10') : ''
    const paddingRight = IconRight ? (size === 'sm' ? 'pr-9' : size === 'lg' ? 'pr-11' : 'pr-10') : ''

    return (
      <div className="relative w-full">
        {IconLeft && (
          <IconLeft className={cn('absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground', iconSize)} />
        )}
        <input
          type={type}
          className={cn(inputVariants({ size }), paddingLeft, paddingRight, className)}
          ref={ref}
          {...props}
        />
        {IconRight && (
          <IconRight className={cn('absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground', iconSize)} />
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input, inputVariants }

