import type { CatalogSearchResult } from '@/lib/entertainment/types';

const CACHE_PREFIX = 'caizen-entertainment-discover-v2';

export interface DiscoverCacheValue<T = CatalogSearchResult> {
  fetchedAt: number;
  results: T[];
}

const MAX_CACHED_KEYS_PER_PROFILE = 24;

function cacheKey(profileId: string, key: string) {
  return `${CACHE_PREFIX}:${profileId || 'default'}:${key}`;
}

export function readDiscoverCache<T = CatalogSearchResult>(
  profileId: string,
  key: string,
): DiscoverCacheValue<T> | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(cacheKey(profileId, key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DiscoverCacheValue<T>;
    if (!Array.isArray(parsed.results) || !Number.isFinite(parsed.fetchedAt)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDiscoverCache<T = CatalogSearchResult>(
  profileId: string,
  key: string,
  results: T[],
) {
  if (typeof window === 'undefined') return;

  try {
    const storageKey = cacheKey(profileId, key);
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        fetchedAt: Date.now(),
        results,
      } satisfies DiscoverCacheValue<T>),
    );

    const prefix = `${CACHE_PREFIX}:${profileId || 'default'}:`;
    const entries: Array<{ key: string; fetchedAt: number }> = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const candidate = window.localStorage.key(index);
      if (!candidate?.startsWith(prefix)) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(candidate) || '') as Partial<DiscoverCacheValue<T>>;
        if (Number.isFinite(parsed.fetchedAt)) entries.push({ key: candidate, fetchedAt: Number(parsed.fetchedAt) });
      } catch {
        // Ignore malformed cache values; normal reads already treat them as misses.
      }
    }
    entries.sort((left, right) => right.fetchedAt - left.fetchedAt);
    entries.slice(MAX_CACHED_KEYS_PER_PROFILE).forEach(entry => window.localStorage.removeItem(entry.key));
  } catch {
    // Catalog caching is best-effort and should never block the main library.
  }
}

export function clearDiscoverCache(profileId: string) {
  if (typeof window === 'undefined') return;
  const prefix = `${CACHE_PREFIX}:${profileId || 'default'}:`;

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) {
      window.localStorage.removeItem(key);
    }
  }
}

export function isDiscoverCacheFresh(
  value: DiscoverCacheValue,
  refreshHours: number,
) {
  return Date.now() - value.fetchedAt < refreshHours * 60 * 60 * 1000;
}
