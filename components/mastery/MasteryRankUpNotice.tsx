'use client';

/**
 * Quiet, dismissible notice shown when a category reaches a new mastery rank.
 *
 * Deliberately restrained: no confetti, no sound, no particles, no forced
 * navigation. The only motion is the shared `modal-card-enter` fade, which is
 * already disabled under `prefers-reduced-motion: reduce` and the app's
 * `data-animation="reduced"` setting.
 */
import { X } from 'lucide-react';

import { MasteryArtifact } from '@/components/mastery/MasteryArtifact';
import {
  MASTERY_CATEGORY_LABEL,
  MASTERY_RANK_LABEL,
  type MasteryCategory,
  type MasteryRank,
} from '@/lib/mastery/assets';

export type MasteryRankUp = {
  category: MasteryCategory;
  rank: MasteryRank;
};

export function MasteryRankUpNotice({
  rankUp,
  remaining = 0,
  onDismiss,
  onOpen,
}: {
  rankUp: MasteryRankUp;
  /** How many further rank-ups are queued behind this one. */
  remaining?: number;
  onDismiss: () => void;
  onOpen?: (category: MasteryCategory) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[10400] flex justify-center px-3"
      role="status"
      aria-live="polite"
    >
      <div className="modal-card-enter pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-xl">
        <MasteryArtifact
          category={rankUp.category}
          rank={rankUp.rank}
          size="lg"
          decorative
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            {MASTERY_CATEGORY_LABEL[rankUp.category]}
          </p>
          <p className="mt-0.5 truncate text-lg font-black leading-tight text-foreground">
            {MASTERY_RANK_LABEL[rankUp.rank]}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            New mastery level reached
          </p>
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(rankUp.category)}
              className="mt-2 text-xs font-black text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View path
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="grid h-9 w-9 shrink-0 place-items-center self-start rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            remaining > 0
              ? `Dismiss — ${remaining} more mastery level${remaining === 1 ? '' : 's'} to review`
              : 'Dismiss mastery notice'
          }
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
