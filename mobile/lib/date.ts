import { format, parseISO } from 'date-fns'

export function formatAppDate(value: Date | string | null | undefined): string {
  if (!value) return ''
  try {
    const date = typeof value === 'string' ? parseISO(value) : value
    return format(date, 'dd MMM yyyy')
  } catch {
    return ''
  }
}

export function formatAppDateTime(value: Date | string | null | undefined): string {
  if (!value) return ''
  try {
    const date = typeof value === 'string' ? parseISO(value) : value
    return format(date, 'dd MMM yyyy, HH:mm')
  } catch {
    return ''
  }
}
