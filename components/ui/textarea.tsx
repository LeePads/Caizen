import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      data-caizen-motion-ring="true"
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:bg-input focus:border-primary/70 focus:shadow-none focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-ring/60 focus-visible:ring-0 aria-invalid:border-destructive flex field-sizing-content min-h-24 w-full rounded-xl border bg-input px-3.5 py-3 text-base shadow-sm transition-[border-color,box-shadow,background-color] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
