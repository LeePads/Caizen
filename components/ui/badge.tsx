import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

type StatusBadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

const statusBadgeClasses: Record<StatusBadgeVariant, string> = {
  neutral: 'border-border/70 bg-muted text-foreground',
  info: 'border-[color:var(--status-info-border)] bg-[color:var(--status-info-soft)] text-[color:var(--status-info-foreground)]',
  success: 'border-[color:var(--status-success-border)] bg-[color:var(--status-success-soft)] text-[color:var(--status-success-foreground)]',
  warning: 'border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-foreground)]',
  danger: 'border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-soft)] text-[color:var(--status-danger-foreground)]',
  muted: 'border-transparent bg-muted/65 text-muted-foreground',
};

function StatusBadge({
  status = 'neutral',
  className,
  ...props
}: Omit<React.ComponentProps<'span'>, 'color'> & {
  status?: StatusBadgeVariant;
}) {
  return (
    <Badge
      data-status={status}
      variant="outline"
      className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', statusBadgeClasses[status], className)}
      {...props}
    />
  );
}

export { Badge, StatusBadge, badgeVariants }
