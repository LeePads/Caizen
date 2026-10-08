import type { MediaItem } from '@/lib/types';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';

/** Returns the user's preferred viewing/reading destination, if one is safe. */
export function getPreferredWatchLink(
  item: Pick<MediaItem, 'website' | 'links'>,
): string | null {
  const candidates = [
    item.website,
    ...(item.links || []).map(link => link.url),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeExternalWebUrl(candidate);
    if (normalized) return normalized;
  }

  return null;
}
