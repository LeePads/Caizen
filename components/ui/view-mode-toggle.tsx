'use client';

import { LayoutGrid, List } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ViewMode = 'grid' | 'list';

export function ViewModeToggle({
  value,
  onChange,
  label = 'Content view',
  className,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('view-toggle', className)} role="group" aria-label={label}>
      <button
        type="button"
        aria-label="Grid view"
        aria-pressed={value === 'grid'}
        onClick={() => onChange('grid')}
        className={`view-toggle-button ${value === 'grid' ? 'view-toggle-button-active' : ''}`}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="List view"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
        className={`view-toggle-button ${value === 'list' ? 'view-toggle-button-active' : ''}`}
      >
        <List className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
