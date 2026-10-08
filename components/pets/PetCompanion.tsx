'use client';

import { PawPrint, Pencil, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { useAppContext } from '@/lib/context';
import type { MochiReaction, PetPersonality } from '@/lib/types';
import { dismissMochiObservation, getMochiBriefing } from '@/lib/mochi/briefing';
import type { MochiAnalysisContext } from '@/lib/mochi/section-analysis';
import type { MochiObservation } from '@/lib/mochi/types';
import { getBriefingIntroVariantCount, getVariantCount, voiceBriefingIntro } from '@/lib/mochi/voice';
import { pickVoiceVariant } from '@/lib/mochi/voice-session';
import { getPersonalityDefinition } from '@/lib/mochi/personality';
import {
  addMochiFloatingVisibilityListener,
  isMochiFloatingHidden,
  setMochiFloatingHidden,
} from '@/lib/mochi/companion-visibility';
import { DEFAULT_PET_PERSONALITY } from '@/lib/pets/normalization';
import { MochiBriefingPanel } from '@/components/pets/MochiBriefingPanel';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const sizeClass = {
  xs: 'pet-sprite-xs',
  sm: 'pet-sprite-sm',
  md: 'pet-sprite-md',
  lg: 'pet-sprite-lg',
};

export function PetCat({
  size = 'md',
  reaction,
  name,
  decorative = false,
}: {
  size?: keyof typeof sizeClass;
  reaction?: MochiReaction;
  /** Accessible name when not decorative — defaults to "Mochi". */
  name?: string;
  decorative?: boolean;
}) {
  const { mochiReaction } = useAppContext();
  const currentReaction = reaction || mochiReaction;
  const accessibleName = `${name || 'Mochi'} ${currentReaction}`;

  return (
    <span
      className={`pet-sprite pet-sprite-mochi ${sizeClass[size]} ${currentReaction === 'happy' ? 'pet-sprite-reaction-happy' : ''} ${currentReaction === 'focus' ? 'pet-sprite-reaction-focus' : ''}`}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': accessibleName })}
    >
      <span className="pet-sprite-frame" />
      <span className="pet-sprite-sparkles" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="pet-sprite-ground" aria-hidden="true" />
    </span>
  );
}

export function PetButton({ onClick }: { onClick: () => void }) {
  const { pet, mochiReaction } = useAppContext();
  const petName = pet?.name || 'Mochi';

  return (
    <Tooltip><TooltipTrigger asChild><button
      type="button"
      onClick={onClick}
      className="caizen-pet-button inline-flex h-10 items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-500/10 px-2.5 text-xs font-black text-amber-800 shadow-lg shadow-amber-500/10 transition-all hover:border-amber-200/40 hover:bg-amber-500/15 dark:text-amber-100 sm:px-3"
      aria-label={`Open ${petName} companion`}
    >
      <PetCat size="xs" decorative reaction={mochiReaction} />
      <span className="hidden xl:inline">{petName}</span>
    </button></TooltipTrigger><TooltipContent>{petName}</TooltipContent></Tooltip>
  );
}

export default function PetModal({
  isOpen,
  onClose,
  spotlightObservationId,
  spotlightProfileId,
}: {
  isOpen: boolean;
  onClose: () => void;
  spotlightObservationId?: string | null;
  spotlightProfileId?: string | null;
}) {
  const {
    pet,
    updatePet,
    mochiReaction,
    getCurrentProfile,
    wallets,
    upcomingMoneyItems,
    wishlistItems,
    inventoryItems,
    skincareProducts,
    health,
    supplements,
    mediaItems,
    games,
    books,
    musicItems,
    productivityItems,
    dailyChecklistItems,
    journalEntries,
    workItems,
    personalVaultItems,
    careerCourses,
    careerCredentials,
    careerSkills,
  } = useAppContext();

  const profileId = getCurrentProfile?.()?.id || '';
  const petName = pet?.name || 'Mochi';
  const personality: PetPersonality = pet?.personality || DEFAULT_PET_PERSONALITY;

  const briefingContext = useMemo<MochiAnalysisContext>(() => ({
    now: new Date(),
    profileId,
    wallets: wallets || [],
    upcomingMoneyItems: upcomingMoneyItems || [],
    wishlistItems: wishlistItems || [],
    inventoryItems: inventoryItems || [],
    skincareProducts: skincareProducts || [],
    foodEntries: health?.foodEntries || [],
    mealTemplateCount: health?.mealTemplates?.length || 0,
    sleepEntries: health?.sleepEntries || [],
    weightEntries: health?.weightEntries || [],
    fastingSessions: health?.fastingSessions || [],
    workoutSessions: health?.workoutSessions || [],
    noXTrackers: health?.noXTrackers || [],
    supplements: supplements || [],
    foodLogCompletedDates: health?.foodLogCompletedDates || [],
    mediaItems: mediaItems || [],
    games: games || [],
    books: books || [],
    musicItems: musicItems || [],
    productivityItems: productivityItems || [],
    dailyChecklistItems: dailyChecklistItems || [],
    journalEntries: journalEntries || [],
    workItems: workItems || [],
    personalVaultItems: personalVaultItems || [],
    careerCourses: careerCourses || [],
    careerCredentials: careerCredentials || [],
    careerSkills: careerSkills || [],
  }), [
    books, careerCourses, careerCredentials, careerSkills, dailyChecklistItems,
    games, health, inventoryItems, journalEntries, mediaItems, musicItems,
    personalVaultItems, productivityItems, profileId, skincareProducts, supplements,
    upcomingMoneyItems, wallets, wishlistItems, workItems,
  ]);

  const briefing = useMemo(
    () => (isOpen ? getMochiBriefing(briefingContext) : []),
    [briefingContext, isOpen],
  );
  const hasSomethingToSay = briefing.some(group => group.kind !== 'quiet');
  const currentSpotlightId = spotlightProfileId === profileId && briefing.some(group => group.observations.some(item => item.id === spotlightObservationId))
    ? spotlightObservationId
    : null;

  // Which dialogue variant each observation (and the intro line) uses is
  // picked once per modal opening, not on every render — otherwise the
  // wording would shuffle under the user's eyes while reading.
  const [introVariantIndex, setIntroVariantIndex] = useState(0);
  const [observationVariants, setObservationVariants] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) return;
    setIntroVariantIndex(pickVoiceVariant(profileId, 'modal-intro', getBriefingIntroVariantCount(personality, hasSomethingToSay)));
    const next: Record<string, number> = {};
    for (const group of briefing) {
      for (const observation of group.observations) {
        next[observation.id] = pickVoiceVariant(profileId, `modal:${observation.id}`, getVariantCount(observation, 'modal'));
      }
    }
    setObservationVariants(next);
    // Deliberately keyed only on `isOpen` transitioning — re-picking when
    // `briefing`/`hasSomethingToSay` merely recompute while already open
    // would make the dialogue shuffle mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const [floatingHidden, setFloatingHiddenState] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    const sync = () => setFloatingHiddenState(isMochiFloatingHidden(profileId));
    sync();
    return addMochiFloatingVisibilityListener(sync);
  }, [profileId]);

  // Opening Mochi — from the header button or the floating bubble itself —
  // is how the floating companion comes back after being hidden.
  useEffect(() => {
    if (isOpen && profileId) setMochiFloatingHidden(profileId, false);
  }, [isOpen, profileId]);

  const toggleFloatingCompanion = () => {
    if (!profileId) return;
    setMochiFloatingHidden(profileId, !floatingHidden);
  };

  const { close: closeBriefing, isClosing: briefingIsClosing } = useAnimatedOverlayClose({ isOpen, onClose });

  const handleSelectObservation = (observation: MochiObservation) => {
    if (!observation.target) return;
    if (observation.kind === 'opportunity' && profileId) {
      dismissMochiObservation(profileId, observation.id);
    }
    window.dispatchEvent(new CustomEvent('life-manager:navigate', { detail: observation.target }));
    closeBriefing();
  };

  const modalPanelRef = useRef<HTMLElement | null>(null);
  const briefingScrollRef = useRef<HTMLDivElement | null>(null);
  const renamePanelRef = useRef<HTMLElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const closeRenameSurface = useCallback(() => {
    setRenameOpen(false);
    setRenameError('');
  }, []);
  const { close: closeRename, isClosing: renameIsClosing } = useAnimatedOverlayClose({ isOpen: renameOpen, onClose: closeRenameSurface });

  useOverlayLifecycle(isOpen, closeBriefing, { containerRef: modalPanelRef });
  useOverlayLifecycle(renameOpen, closeRename, {
    containerRef: renamePanelRef,
    initialFocusSelector: '#mochi-rename-input',
  });

  useEffect(() => {
    if (!isOpen) return;
    modalPanelRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !currentSpotlightId) return;
    const scrollArea = briefingScrollRef.current;
    const item = scrollArea?.querySelector<HTMLElement>('[data-mochi-spotlight="true"]');
    if (!scrollArea || !item) return;
    const area = scrollArea.getBoundingClientRect();
    const target = item.getBoundingClientRect();
    if (target.bottom > area.bottom) scrollArea.scrollTop += target.bottom - area.bottom + 12;
    else if (target.top < area.top) scrollArea.scrollTop -= area.top - target.top + 12;
  }, [isOpen, currentSpotlightId]);

  const renamePet = () => {
    setRenameValue(petName.slice(0, 24));
    setRenameError('');
    setRenameOpen(true);
  };

  const saveRename = () => {
    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError('Give your companion a name.');
      renameInputRef.current?.focus();
      return;
    }
    if (nextName.length > 24) {
      setRenameError('That name must be 24 characters or fewer.');
      renameInputRef.current?.focus();
      return;
    }
    updatePet({ name: nextName });
    closeRename();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10600] flex items-center justify-center bg-black/75 px-3 backdrop-blur-sm sm:px-4"
      data-caizen-overlay={briefingIsClosing ? 'closing' : 'open'}
      data-state={briefingIsClosing ? 'closed' : 'open'}
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
      }}
    >
      <section
        ref={modalPanelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mochi-companion-title"
        className="caizen-pet-panel modal-card-enter flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl"
        style={{ maxHeight: 'min(88dvh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.5rem))' }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border/60 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">Quiet companion</p>
            <h2 id="mochi-companion-title" className="mt-1 text-2xl font-black">{petName}</h2>
          </div>
          <button
            type="button"
            onClick={closeBriefing}
            className="grid h-12 w-12 place-items-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Close ${petName} companion`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div ref={briefingScrollRef} className="min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="grid shrink-0 place-items-center rounded-2xl border border-amber-300/20 bg-amber-500/5 p-2">
              <PetCat size="sm" reaction={mochiReaction} decorative />
            </div>
            <h3 className="text-base font-semibold leading-snug sm:text-lg">
              {voiceBriefingIntro(personality, hasSomethingToSay, introVariantIndex, petName)}
            </h3>
          </div>

          <div className="mt-5">
            <MochiBriefingPanel groups={briefing} variantIndices={observationVariants} personality={personality} spotlightObservationId={currentSpotlightId} onSelect={handleSelectObservation} />
          </div>

          <div className="mt-6 border-t border-border/50 pt-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={renamePet}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PawPrint className="h-3.5 w-3.5" aria-hidden="true" />
                Rename companion
              </button>
              <button
                type="button"
                onClick={toggleFloatingCompanion}
                aria-pressed={!floatingHidden}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {floatingHidden ? 'Show floating companion' : 'Hide floating companion'}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Personality · <span className="font-semibold text-foreground">{getPersonalityDefinition(personality).label}</span>
              <span> — change this in Settings.</span>
            </p>
          </div>
        </div>
      </section>
      {renameOpen ? (
        <div className="fixed inset-0 z-[10700] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm sm:p-4" data-caizen-overlay={renameIsClosing ? 'closing' : 'open'} data-state={renameIsClosing ? 'closed' : 'open'}>
          <section
            ref={renamePanelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mochi-rename-title"
            data-caizen-overlay-panel="true"
            className="w-full max-w-sm rounded-2xl border border-border/70 bg-background p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">{petName}</p>
                <h2 id="mochi-rename-title" className="mt-1 text-xl font-black">Rename companion</h2>
              </div>
              <button
                type="button"
                onClick={closeRename}
                className="grid size-11 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close rename dialog"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={event => {
                event.preventDefault();
                saveRename();
              }}
            >
              <label htmlFor="mochi-rename-input" className="block text-sm font-bold">Name</label>
              <input
                ref={renameInputRef}
                id="mochi-rename-input"
                value={renameValue}
                maxLength={24}
                onChange={event => {
                  setRenameValue(event.target.value.slice(0, 24));
                  if (renameError) setRenameError('');
                }}
                className="control-input mt-2 w-full"
                aria-invalid={Boolean(renameError)}
                aria-describedby={renameError ? 'mochi-rename-error' : undefined}
              />
              {renameError ? <p id="mochi-rename-error" role="alert" className="text-sm font-semibold text-destructive">{renameError}</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeRename} className="min-h-11 rounded-xl border border-border/60 px-4 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Cancel</button>
                <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Pencil className="size-4" aria-hidden="true" />Save</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
