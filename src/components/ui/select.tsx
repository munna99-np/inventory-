import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'

import { cn } from '../../lib/utils'

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectViewport = SelectPrimitive.Viewport

const SelectValue = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Value>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Value>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Value
    ref={ref}
    className={cn('flex-1 truncate text-left text-foreground data-[placeholder]:text-muted-foreground/80', className)}
    {...props}
  />
))
SelectValue.displayName = SelectPrimitive.Value.displayName

const baseTriggerStyles = 'flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger ref={ref} className={cn(baseTriggerStyles, className)} {...props}>
    <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'z-50 mt-1 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border/60 bg-card/95 text-foreground shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/85 focus:outline-none',
        'origin-[var(--radix-select-content-transform-origin)] opacity-0 translate-y-1 data-[side=top]:-translate-y-1 data-[state=open]:opacity-100 data-[state=open]:translate-y-0 transition duration-150 ease-out',
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex h-8 items-center justify-center bg-card/80 text-muted-foreground">
        <ChevronUp className="h-4 w-4" aria-hidden="true" />
      </SelectPrimitive.ScrollUpButton>
      <SelectViewport className="p-1">
        {children}
      </SelectViewport>
      <SelectPrimitive.ScrollDownButton className="flex h-8 items-center justify-center bg-card/80 text-muted-foreground">
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary',
      className
    )}
    {...props}
  >
    <SelectPrimitive.ItemText asChild>
      <span className="flex-1 truncate pr-6">{children}</span>
    </SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="absolute right-3 flex h-4 w-4 items-center justify-center text-primary">
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectViewport }
