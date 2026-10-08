'use client';

import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';

export type HealthLibraryItem = {
  id: string;
  name: string;
  metadata: string;
  summary: string;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  onPrimary?: () => void;
  favorite?: boolean;
  favoriteKind?: 'food' | 'meal';
  onToggleFavorite?: () => void;
  actions: ReactNode;
};

export function HealthLibraryList({
  items,
  emptyMessage,
  revealControls = [],
}: {
  items: HealthLibraryItem[];
  emptyMessage: string;
  revealControls?: readonly unknown[];
}) {
  const collectionRevealRef = useCollectionReveal(items.map(item => item.id), revealControls);
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/15 p-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div ref={collectionRevealRef} className="divide-y divide-border/50 border-y border-border/60">
      {items.map(item => (
        <div key={item.id} data-caizen-collection-item="true" className="-mx-2 flex min-w-0 flex-col gap-3 rounded-xl px-2 py-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-bold [overflow-wrap:anywhere] sm:text-base">{item.name}</p>
            <p className="mt-1 break-words text-xs font-semibold text-muted-foreground">{item.metadata}</p>
            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.summary}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:justify-end">
            {item.onToggleFavorite ? <button type="button" onClick={item.onToggleFavorite} aria-pressed={item.favorite} aria-label={`${item.favorite ? 'Remove' : 'Add'} ${item.name} ${item.favoriteKind || 'item'} ${item.favorite ? 'from' : 'to'} favorites`} className="grid size-11 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"><Star className={`size-4 ${item.favorite ? 'fill-current text-amber-500' : ''}`} aria-hidden="true" /></button> : null}
            {item.onPrimary ? (
              <button
                type="button"
                disabled={item.primaryDisabled}
                onClick={item.onPrimary}
                className="min-h-11 rounded-xl border border-primary/30 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-border/60 disabled:text-muted-foreground disabled:opacity-60"
              >
                {item.primaryLabel}
              </button>
            ) : null}
            {item.actions}
          </div>
        </div>
      ))}
    </div>
  );
}
