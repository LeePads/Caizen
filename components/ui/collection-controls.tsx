'use client';

import * as React from 'react';
import { ResponsiveControlStrip } from '@/components/common/ResponsiveControlStrip';
import { cn } from '@/lib/utils';

export type ControlOption = {
  value: string;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
};

export function SegmentedControl({
  label,
  value,
  options,
  onValueChange,
  size = 'default',
  className,
}: {
  label: string;
  value: string;
  options: ControlOption[];
  onValueChange: (value: string) => void;
  size?: 'default' | 'compact';
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} data-slot="segmented-control" className={cn('segmented-control inline-flex min-w-0 items-center gap-1 rounded-xl border border-border/65 bg-card p-1', className)}>
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon, disabled }) => {
        const selected = value === optionValue;
        return (
          <button
            key={optionValue}
            data-slot="segmented-control-item"
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onValueChange(optionValue)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50',
              size === 'compact' ? 'min-h-9' : 'min-h-10',
              selected ? 'bg-primary/10 text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {Icon ? <Icon className={cn('size-4', selected && 'text-primary')} /> : null}
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}

export function FilterChip({
  children,
  selected,
  onSelectedChange,
  count,
  icon: Icon,
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'aria-pressed' | 'onClick'> & {
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  count?: number;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={selected}
      onClick={() => onSelectedChange(!selected)}
      className={cn(
        'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50',
        selected ? 'border-primary/35 bg-primary/10 text-foreground' : 'border-border/65 bg-card/70 text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {Icon ? <Icon className={cn('size-3.5', selected && 'text-primary')} /> : null}
      {children}
      {typeof count === 'number' ? <span className="text-xs tabular-nums text-muted-foreground">{count}</span> : null}
    </button>
  );
}

export function FilterBar({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ResponsiveControlStrip label={label} className={cn('gap-2 py-0.5', className)}>
      {children}
    </ResponsiveControlStrip>
  );
}

export function CollectionToolbar({
  search,
  filters,
  sort,
  utilities,
  viewMode,
  primaryAction,
  layout = 'default',
  className,
}: {
  search?: React.ReactNode;
  filters?: React.ReactNode;
  sort?: React.ReactNode;
  utilities?: React.ReactNode;
  viewMode?: React.ReactNode;
  primaryAction?: React.ReactNode;
  layout?: 'default' | 'two-row';
  className?: string;
}) {
  const hasSecondaryControls = Boolean(filters || sort || utilities || viewMode || primaryAction);
  const secondary = hasSecondaryControls ? (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {filters}
      {sort}
      {utilities}
      {viewMode}
      {primaryAction}
    </div>
  ) : null;

  return (
    <div className={cn('toolbar-surface min-w-0 space-y-3 p-3 sm:p-4', className)} data-collection-toolbar={layout}>
      {layout === 'two-row' ? (
        <>
          {search ? <div className="w-full">{search}</div> : null}
          {secondary}
        </>
      ) : (
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
          {search ? <div className="w-full min-w-0 lg:min-w-56 lg:flex-1">{search}</div> : null}
          {secondary ? <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto">{filters}{sort}{utilities}{viewMode}{primaryAction}</div> : null}
        </div>
      )}
    </div>
  );
}
