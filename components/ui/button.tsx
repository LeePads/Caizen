import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

function ArrowFlyThrough({
  direction,
  children,
  className,
}: {
  direction: 'left' | 'right';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-direction={direction}
      className={cn('caizen-arrow-fly-through', className)}
    >
      <span className="caizen-arrow-fly-through-copy">{children}</span>
      <span className="caizen-arrow-fly-through-copy caizen-arrow-fly-through-copy-next">
        {children}
      </span>
    </span>
  );
}

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0 transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-150 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 aria-invalid:border-destructive active:scale-[0.985]",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/92',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:outline-destructive focus-visible:ring-0',
        outline:
          'border border-border/70 bg-card/82 text-foreground hover:border-border hover:bg-muted hover:text-foreground',
        secondary:
          'border border-border/45 bg-secondary text-secondary-foreground hover:bg-muted',
        ghost:
          'text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-9 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-12 rounded-xl px-6 has-[>svg]:px-4',
        icon: 'size-11',
        'icon-sm': 'size-9',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant || 'default'}
      data-size={size || 'default'}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { ArrowFlyThrough, Button, buttonVariants };
