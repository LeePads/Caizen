// Profile-scoped, local-only visibility state for the floating Dashboard
// companion. Same idiom as lib/discovery/dismissal.ts and
// lib/dashboard-preferences.ts: a plain localStorage flag plus a window
// event so other mounted components (Dashboard's bubble, the Mochi modal's
// toggle) can react without a shared state store.

const STORAGE_PREFIX = 'mochi-floating-hidden';
const VISIBILITY_EVENT = 'life-manager:mochi-floating-visibility';

function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}:${profileId}`;
}

export function isMochiFloatingHidden(profileId: string): boolean {
  if (typeof window === 'undefined' || !profileId) return false;
  try {
    return window.localStorage.getItem(storageKey(profileId)) === 'true';
  } catch {
    return false;
  }
}

export function setMochiFloatingHidden(profileId: string, hidden: boolean): void {
  if (typeof window === 'undefined' || !profileId) return;
  try {
    window.localStorage.setItem(storageKey(profileId), String(hidden));
  } catch {
    // Best-effort only.
  }
  window.dispatchEvent(new Event(VISIBILITY_EVENT));
}

export function addMochiFloatingVisibilityListener(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(VISIBILITY_EVENT, listener);
  return () => window.removeEventListener(VISIBILITY_EVENT, listener);
}
