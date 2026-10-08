// Lightweight, profile-scoped "seen/dismissed" state for discovery
// suggestions. Follows the existing `<prefix>:<profileId>` localStorage
// idiom used by lib/dashboard-preferences.ts and friends — this is a
// cosmetic UI flag, not a domain model, so plain localStorage is enough.

const STORAGE_PREFIX = 'discovery-dismissed';

function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}:${profileId}`;
}

type DismissedMap = Record<string, number>;

function readDismissed(profileId: string): DismissedMap {
  if (typeof window === 'undefined' || !profileId) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const DEFAULT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** True when the suggestion was dismissed within the cooldown window. */
export function isDiscoverySuggestionDismissed(
  profileId: string,
  id: string,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): boolean {
  const dismissedAt = readDismissed(profileId)[id];
  return typeof dismissedAt === 'number' && Date.now() - dismissedAt < cooldownMs;
}

export function dismissDiscoverySuggestion(profileId: string, id: string): void {
  if (typeof window === 'undefined' || !profileId) return;
  try {
    const dismissed = readDismissed(profileId);
    dismissed[id] = Date.now();
    window.localStorage.setItem(storageKey(profileId), JSON.stringify(dismissed));
  } catch {
    // Best-effort only; a failed write just means the suggestion may repeat.
  }
}
