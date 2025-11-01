import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { cn } from '../../lib/utils'

type Props = {
  value?: 'personal' | 'work'
  onValueChange?: (v: 'personal' | 'work') => void
  className?: string
  placeholder?: string
}

export default function ScopeSelect({ value, onValueChange, className, placeholder }: Props) {
  return (
    <Select value={value} onValueChange={onValueChange as any}>
      <SelectTrigger className={cn('h-10 min-w-[160px] w-full justify-between border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', className)}>
        <SelectValue placeholder={placeholder ?? 'Select scope'} />
      </SelectTrigger>
      <SelectContent className="rounded-xl border bg-card text-foreground shadow-xl" position="popper">
        <SelectItem value="personal">Personal</SelectItem>
        <SelectItem value="work">Work</SelectItem>
      </SelectContent>
    </Select>
  )
}

