/**
 * Pure validation for the configurable bottom-navigation destination set
 * (Settings -> Navigation). Kept free of React so an invalid/corrupt saved
 * config (wrong ids, too few/many entries, duplicates) can be tested
 * directly and always resolves to a safe, in-range result instead of
 * crashing or rendering zero/eleven bottom-nav items.
 */

export const PRIMARY_NAV_MIN = 3;
export const PRIMARY_NAV_MAX = 5;

export const DEFAULT_PRIMARY_NAV_TABS = ['dashboard', 'lifehub', 'health', 'balance'];

/**
 * Returns a valid, in-range, deduplicated ordering of primary nav tab ids.
 * Falls back to DEFAULT_PRIMARY_NAV_TABS whenever the input can't be made
 * valid (unknown ids only, wrong count even after dedup, etc).
 */
export function sanitizePrimaryNavTabs(
  candidate: unknown,
  validIds: string[],
): string[] {
  if (!Array.isArray(candidate)) return [...DEFAULT_PRIMARY_NAV_TABS];

  const deduped: string[] = [];
  for (const id of candidate) {
    if (typeof id !== 'string') continue;
    if (!validIds.includes(id)) continue;
    if (deduped.includes(id)) continue;
    deduped.push(id);
  }

  if (deduped.length < PRIMARY_NAV_MIN || deduped.length > PRIMARY_NAV_MAX) {
    return [...DEFAULT_PRIMARY_NAV_TABS];
  }

  return deduped;
}
