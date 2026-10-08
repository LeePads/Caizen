import type { MediaItem } from '@/lib/types';

export const ENTERTAINMENT_AUTO_REFRESH_LIMIT = 8;
export const ENTERTAINMENT_AUTO_REFRESH_DELAY_MS = 250;

export function isEntertainmentItemStale(
  item: Pick<MediaItem, 'lastSyncedAt'>,
  now = Date.now(),
  hours = 12,
): boolean {
  if (!item.lastSyncedAt) return true;
  return now - new Date(item.lastSyncedAt).getTime() > hours * 60 * 60 * 1000;
}

export function getAutomaticEntertainmentRefreshCandidates(
  items: readonly MediaItem[],
  now = Date.now(),
  limit = ENTERTAINMENT_AUTO_REFRESH_LIMIT,
): MediaItem[] {
  return items
    .filter(item =>
      item.catalogProvider &&
      item.catalogProvider !== 'manual' &&
      item.catalogId &&
      !['completed', 'dropped'].includes(item.status) &&
      isEntertainmentItemStale(item, now),
    )
    .slice(0, Math.max(0, limit));
}

export function shouldStartEntertainmentAutoRefresh(
  profileId: string | null | undefined,
  refreshedProfileId: string | null,
  itemCount: number,
): boolean {
  return Boolean(profileId && itemCount > 0 && profileId !== refreshedProfileId);
}
