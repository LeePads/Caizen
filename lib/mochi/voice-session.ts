// Picks dialogue variants and a briefing spotlight once per opening, outside
// render. Same profile-scoped localStorage idiom as
// lib/discovery/dismissal.ts and lib/mochi/companion-visibility.ts.

import type { MochiObservation } from '@/lib/mochi/types';

const STORAGE_PREFIX = 'mochi-voice-variant';
const SPOTLIGHT_PREFIX = 'mochi-spotlight';

function storageKey(profileId: string, key: string): string {
  return `${STORAGE_PREFIX}:${profileId}:${key}`;
}

function readLastIndex(profileId: string, key: string): number | null {
  if (typeof window === 'undefined' || !profileId) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(profileId, key));
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isInteger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLastIndex(profileId: string, key: string, index: number): void {
  if (typeof window === 'undefined' || !profileId) return;
  try {
    window.localStorage.setItem(storageKey(profileId, key), String(index));
  } catch {
    // Best-effort only; a failed write just means variety may repeat sooner.
  }
}

/**
 * Picks a variant index in [0, total). Avoids immediately repeating the
 * last variant used for this exact key when there's more than one to
 * choose from, and remembers the pick per profile so the next opening
 * (even in a new session) tends to feel different.
 */
export function pickVoiceVariant(profileId: string, key: string, total: number): number {
  if (total <= 1) return 0;
  const last = readLastIndex(profileId, key);
  let next = Math.floor(Math.random() * total);
  if (last !== null && total > 1 && next === last) {
    next = (next + 1) % total;
  }
  writeLastIndex(profileId, key, next);
  return next;
}

/** Selects only from the current bounded briefing. High-importance attention
 * alternates with other kinds when both exist; the last ID is the only
 * profile-scoped state, so a changed briefing cannot resurrect old facts. */
export function pickBriefingSpotlight(profileId: string, observations: MochiObservation[]): MochiObservation | null {
  const candidates = observations.filter(item => item.kind !== 'quiet');
  if (candidates.length === 0) return null;

  let lastId: string | null = null;
  if (typeof window !== 'undefined' && profileId) {
    try {
      lastId = window.localStorage.getItem(`${SPOTLIGHT_PREFIX}:${profileId}`);
    } catch {
      // Variety is best-effort when auxiliary storage is unavailable.
    }
  }

  const highAttention = candidates.filter(item => item.importance === 'high' && item.kind === 'attention');
  const others = candidates.filter(item => item.importance !== 'high' || item.kind !== 'attention');
  const pool = highAttention.length && others.length
    ? highAttention.some(item => item.id === lastId) ? others : highAttention
    : candidates;
  const alternatives = pool.length > 1 ? pool.filter(item => item.id !== lastId) : pool;
  const options = alternatives.length > 0 ? alternatives : pool;
  const chosen = options[Math.floor(Math.random() * options.length)];

  if (typeof window !== 'undefined' && profileId) {
    try {
      window.localStorage.setItem(`${SPOTLIGHT_PREFIX}:${profileId}`, chosen.id);
    } catch {
      // A failed write only means a future opening may repeat sooner.
    }
  }
  return chosen;
}
