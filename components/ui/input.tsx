import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-caizen-motion-ring="true"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-11 w-full min-w-0 rounded-xl border bg-input px-3.5 py-2 text-base shadow-sm transition-[border-color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:bg-input',
        'aria-invalid:border-destructive focus:border-primary/70 focus:shadow-none focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-ring/60 focus-visible:ring-0',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
