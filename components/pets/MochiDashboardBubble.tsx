'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PetCat } from '@/components/pets/PetCompanion';
import type { MochiBriefingGroup } from '@/lib/mochi/briefing';
import type { MochiReaction, PetPersonality } from '@/lib/types';
import { getVariantCount, voiceObservation, voiceQuietBubbleLine } from '@/lib/mochi/voice';
import { pickBriefingSpotlight, pickVoiceVariant } from '@/lib/mochi/voice-session';

// Sensible fallback before the real header height is measured — close to
// the app header's usual min-height so there's no visible jump.
const DEFAULT_HEADER_OFFSET_PX = 76;

/**
 * Mochi's floating companion — a viewport-level overlay, not part of
 * Dashboard's normal layout. Sprite and speech bubble read as one object:
 * the bubble sits just above Mochi with a small tail pointing down at him.
 * Its spotlight is chosen once from the same bounded briefing the modal shows.
 * Selection and wording stay fixed while their observation remains current.
 */
export function MochiDashboardBubble({
  petName,
  reaction,
  briefing,
  personality,
  profileId,
  onOpen,
  onHide,
}: {
  petName: string;
  reaction: MochiReaction;
  briefing: MochiBriefingGroup[];
  personality: PetPersonality;
  profileId: string;
  onOpen: (observationId?: string) => void;
  onHide: () => void;
}) {
  // Anchor below the real app header instead of guessing a fixed offset —
  // header height varies by breakpoint and platform (web vs Android).
  const [headerOffset, setHeaderOffset] = useState(DEFAULT_HEADER_OFFSET_PX);

  useEffect(() => {
    const header = document.querySelector('.caizen-header');
    if (!header || typeof ResizeObserver === 'undefined') return;
    const update = () => setHeaderOffset(header.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const candidates = useMemo(
    () => briefing.flatMap(group => group.observations).filter(item => item.kind !== 'quiet'),
    [briefing],
  );
  const [spotlight, setSpotlight] = useState<{ profileId: string; id: string } | null>(null);
  const spotlightRef = useRef<typeof spotlight>(null);

  useEffect(() => {
    const current = spotlightRef.current;
    if (current?.profileId === profileId && candidates.some(item => item.id === current.id)) return;
    const picked = pickBriefingSpotlight(profileId, candidates);
    const next = picked ? { profileId, id: picked.id } : null;
    spotlightRef.current = next;
    setSpotlight(next);
  }, [candidates, profileId]);

  const observation = spotlight?.profileId === profileId
    ? candidates.find(item => item.id === spotlight.id) ?? null
    : null;
  const [variant, setVariant] = useState<{ profileId: string; id: string; index: number } | null>(null);
  const variantRef = useRef<typeof variant>(null);

  useEffect(() => {
    if (!observation) return;
    if (variantRef.current?.profileId === profileId && variantRef.current.id === observation.id) return;
    const next = {
      profileId,
      id: observation.id,
      index: pickVoiceVariant(profileId, `bubble:${observation.id}`, getVariantCount(observation, 'bubble')),
    };
    variantRef.current = next;
    setVariant(next);
  }, [observation, profileId]);

  // Wait for the opening's selection and wording before showing the bubble;
  // an old line or the quiet fallback must never flash for a new profile.
  if (candidates.length > 0 && (!observation || variant?.profileId !== profileId || variant.id !== observation.id)) return null;

  const line = observation
    ? voiceObservation(observation, personality, 'bubble', variant?.index ?? 0)
    : { lead: '', body: voiceQuietBubbleLine(personality), reaction: 'idle' as MochiReaction };
  const spoken = [line.lead, line.body].filter(Boolean).join(' ');

  return (
    <div
      className="pointer-events-none fixed z-[500] flex flex-col items-end"
      style={{ top: `calc(${headerOffset}px + 0.65rem)`, right: 'calc(0.75rem + env(safe-area-inset-right, 0px))' }}
    >
      <div className="pointer-events-auto relative w-[min(12.5rem,calc(100vw-2rem))] sm:w-60">
        <button
          type="button"
          onClick={() => onOpen(observation?.id)}
          className="cz-mochi-bubble min-h-11 w-full rounded-2xl border border-border/50 bg-background/95 py-2 pl-3 pr-11 text-left shadow-lg shadow-black/5 backdrop-blur-sm transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label={`${petName} says: ${spoken}. Open ${petName} for today's briefing.`}
        >
          {line.lead ? <p className="text-sm font-semibold text-foreground">{line.lead}</p> : null}
          <p className={`text-sm text-foreground ${line.lead ? 'mt-0.5 text-muted-foreground' : 'font-medium'}`}>
            {line.body}
          </p>
        </button>
        <button
          type="button"
          onClick={onHide}
          className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label={`Hide ${petName}'s floating dialogue`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <span
          className="absolute -bottom-[5px] right-5 h-3 w-3 rotate-45 border-b border-r border-border/50 bg-background/95"
          aria-hidden="true"
        />
      </div>
      <button
        type="button"
        onClick={() => onOpen(observation?.id)}
        className="pointer-events-auto -mt-1 mr-2 grid min-h-11 min-w-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={`Open ${petName}`}
      >
        <PetCat size="xs" reaction={reaction} decorative />
      </button>
    </div>
  );
}
