/**
 * Explicit, bounded root-section history for the Android hardware back
 * button - deliberately NOT backed by window.history.
 *
 * Pushing a browser history entry on every bottom-tab tap was prototyped and
 * reverted in an earlier pass: it made Back require one press per tab switch
 * to ever reach Dashboard, instead of returning to the previous root section
 * (or Dashboard) in a single press. This module tracks only the current and
 * immediately-previous root section - never a growing stack - so repeated
 * tab switching cannot accumulate into a long Back chain, and the previous
 * root can be returned to at most once before Back falls through to
 * Dashboard.
 */

let currentRoot: string | null = null;
let previousRoot: string | null = null;

export function recordRootSection(section: string): void {
  if (section === currentRoot) return;
  previousRoot = currentRoot;
  currentRoot = section;
}

export function hasPreviousRootSection(): boolean {
  return previousRoot !== null;
}

/**
 * Returns and clears the previous root - consumable at most once. Also
 * advances currentRoot to the popped value, so the subsequent
 * recordRootSection() call the section-change effect makes (once React
 * actually navigates there) is a no-op instead of pushing currentRoot back
 * onto previousRoot and creating a two-step ping-pong.
 */
export function consumePreviousRootSection(): string | null {
  const value = previousRoot;
  previousRoot = null;
  if (value !== null) currentRoot = value;
  return value;
}

export function resetRootSectionHistory(): void {
  currentRoot = null;
  previousRoot = null;
}

/**
 * Back fell through to Dashboard because there was no previous root to
 * return to. This is a deliberate fallback, not a real forward navigation,
 * so it must not leave a previousRoot behind - otherwise the very next Back
 * press from Dashboard would return to the section just left instead of
 * showing the exit confirmation.
 */
export function landOnDashboardViaBack(): void {
  currentRoot = 'dashboard';
  previousRoot = null;
}
