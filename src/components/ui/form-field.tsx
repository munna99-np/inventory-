import * as React from 'react'
import { cn } from '../../lib/utils'
import { Label } from './label'

export interface FormFieldProps {
  label?: string
  htmlFor?: string
  error?: string
  description?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

export function FormField({ 
  label, 
  htmlFor, 
  error, 
  description, 
  required, 
  className,
  children 
}: FormFieldProps) {
  return (
    <div className={cn('flex flex-col w-full', className)}>
      {label && (
        <Label htmlFor={htmlFor} className="mb-2">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      {description && !error && (
        <p className="text-xs text-muted-foreground mb-2 sm:text-sm">{description}</p>
      )}
      {children}
      {error && (
        <p className="text-sm text-destructive mt-1.5 font-medium">{error}</p>
      )}
    </div>
  )
}

