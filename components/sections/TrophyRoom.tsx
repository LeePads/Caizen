'use client';

import {
  Archive,
  BookOpen,
  CalendarRange,
  Check,
  Heart,
  LayoutGrid,
  Repeat2,
  RotateCcw,
  Sparkles,
  Target,
  Wallet,
  X,
} from 'lucide-react';
import type { RefObject } from 'react';

import { PetCat } from '@/components/pets/PetCompanion';
import { AndroidDismissibleBackdrop } from '@/components/native/android-design';
import type { EvaluatedMilestone, MilestoneId } from '@/lib/milestones';
import type { PetCompanionData } from '@/lib/types';

type TrophyMilestone = EvaluatedMilestone & {
  achieved: boolean;
  achievedAt?: Date;
  source?: 'persisted' | 'legacy-projection';
};

type TrophyRoomPanelProps = {
  panelRef: RefObject<HTMLElement | null>;
  milestones: TrophyMilestone[];
  pet: PetCompanionData;
  isClosing: boolean;
  onClose: () => void;
};

const ICONS = {
  archive: Archive,
  'book-open': BookOpen,
  'calendar-range': CalendarRange,
  heart: Heart,
  'layout-grid': LayoutGrid,
  repeat: Repeat2,
  'rotate-ccw': RotateCcw,
  sparkles: Sparkles,
  target: Target,
  wallet: Wallet,
} as const;

const AREA_LABELS = {
  productivity: 'Productivity',
  wellness: 'Wellness',
  finance: 'Finance',
  collection: 'Collection',
  reflection: 'Reflection',
} as const;

const LOCKED_CONDITIONS: Record<MilestoneId, string> = {
  'first-useful-step': 'Recognized after a meaningful activity record in any life area.',
  'rhythm-taking-shape': 'Recognized after meaningful productivity activity spans 4 different weeks, including at least 2 planned items.',
  'care-in-practice': 'Recognized after care activity on 3 different days across 2 kinds of care.',
  'money-in-order': 'Recognized after a wallet, a money planning or transaction entry, and reviews in 2 different weeks.',
  'goal-carried-through': 'Recognized when a wallet goal reaches its target.',
  'page-to-return': 'Recognized after 5 substantive journal entries across 3 different dates.',
  'room-for-matters': 'Recognized after meaningful records appear on 2 different collection surfaces.',
  'many-parts-one-home': 'Recognized after meaningful activity appears across 4 life areas.',
  'coming-back': 'Recognized after activity spans 3 different months with an 8-day gap between activity days.',
  'season-kept': 'Recognized after activity spans 6 different months across 2 life areas.',
};

export function TrophyRoomPanel({ panelRef, milestones, pet, isClosing, onClose }: TrophyRoomPanelProps) {
  const achievedCount = milestones.filter(item => item.achieved).length;

  return (
    <div className="caizen-form-modal-root fixed inset-0 z-[10500] flex items-center justify-center p-3 sm:p-5" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
      <AndroidDismissibleBackdrop
        onClose={onClose}
        ariaLabel="Close milestones"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="milestones-panel-title"
        tabIndex={-1}
        data-caizen-overlay-panel="true"
        className="modal-card-enter flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-2xl shadow-black/30"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <PetCat size="sm" decorative />
            <div className="min-w-0">
              <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-primary">Milestones</p>
              <h2 id="milestones-panel-title" className="truncate text-xl font-black tracking-tight sm:text-2xl">
                {pet.name || 'Mochi'} remembers the meaningful steps
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {achievedCount} of {milestones.length || 10} milestones achieved
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close milestones"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {milestones.map((milestone, index) => {
              const Icon = ICONS[milestone.icon as keyof typeof ICONS] || Sparkles;
              return (
                <article
                  key={milestone.id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    milestone.achieved
                      ? 'border-primary/30 bg-primary/[0.07]'
                      : 'border-border/60 bg-muted/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`grid h-10 w-10 place-items-center rounded-xl ${
                        milestone.achieved ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                      aria-hidden="true"
                    >
                      {milestone.achieved ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </span>
                    <span className="text-[0.68rem] font-black uppercase tracking-wider text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <p className="mt-4 text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
                    {AREA_LABELS[milestone.area]}
                  </p>
                  <h3 className="mt-1 text-base font-black">{milestone.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{milestone.description}</p>
                  {milestone.achieved && milestone.achievedAt ? (
                    <p className="mt-3 text-[0.76rem] font-bold text-primary">
                      Achieved {milestone.achievedAt.toLocaleDateString()}
                    </p>
                  ) : (
                    <>
                      <p className="mt-3 text-[0.76rem] font-semibold text-muted-foreground">
                        <span className="sr-only">Locked milestone. </span>
                        Not yet achieved
                      </p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {LOCKED_CONDITIONS[milestone.id]}
                      </p>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
