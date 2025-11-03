import * as React from 'react'
import { Button, ButtonProps, buttonVariants } from './button'
import { cn } from '../../lib/utils'
import { LucideIcon } from 'lucide-react'

export interface ActionButtonProps extends Omit<ButtonProps, 'children'> {
  iconLeft?: LucideIcon
  iconRight?: LucideIcon
  children: React.ReactNode
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ className, iconLeft: IconLeft, iconRight: IconRight, children, size = 'default', ...props }, ref) => {
    const iconSize = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
    const gapClass = 'gap-2'

    return (
      <Button ref={ref} size={size} className={cn(gapClass, className)} {...props}>
        {IconLeft && <IconLeft className={iconSize} />}
        <span className={cn((!IconLeft && !IconRight) && 'truncate')}>{children}</span>
        {IconRight && <IconRight className={iconSize} />}
      </Button>
    )
  }
)
ActionButton.displayName = 'ActionButton'

export { ActionButton }

