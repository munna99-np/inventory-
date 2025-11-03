import * as React from 'react'
import { Input, InputProps } from './input'
import { ActionButton, ActionButtonProps } from './action-button'
import { cn } from '../../lib/utils'
import { Search, Plus, Filter, RefreshCcw, Download, X } from 'lucide-react'

export interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  size?: InputProps['size']
  actions?: Array<{
    label: string
    iconLeft?: ActionButtonProps['iconLeft']
    iconRight?: ActionButtonProps['iconRight']
    variant?: ActionButtonProps['variant']
    onClick: () => void
    loading?: boolean
    disabled?: boolean
  }>
  showClear?: boolean
  className?: string
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  size = 'default',
  actions = [],
  showClear = true,
  className,
}: SearchBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex-1 min-w-[200px]">
        <Input
          type="search"
          size={size}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          iconLeft={Search}
          className="w-full"
        />
      </div>
      {showClear && value && (
        <ActionButton
          size={size}
          variant="ghost"
          iconLeft={X}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          Clear
        </ActionButton>
      )}
      {actions.map((action, index) => (
        <ActionButton
          key={index}
          size={size}
          variant={action.variant || 'outline'}
          iconLeft={action.iconLeft}
          iconRight={action.iconRight}
          onClick={action.onClick}
          loading={action.loading}
          disabled={action.disabled}
          aria-label={action.label}
        >
          {action.label}
        </ActionButton>
      ))}
    </div>
  )
}

