import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { MediaItem } from '@/lib/types';
import {
  ENTERTAINMENT_AUTO_REFRESH_DELAY_MS,
  ENTERTAINMENT_AUTO_REFRESH_LIMIT,
  getAutomaticEntertainmentRefreshCandidates,
  shouldStartEntertainmentAutoRefresh,
} from '@/lib/entertainment/refresh';

const source = (path: string) => readFileSync(path, 'utf8');
const now = new Date('2026-08-19T12:00:00').getTime();

const item = (id: string, overrides: Partial<MediaItem> = {}): MediaItem => ({
  id,
  title: id,
  type: 'series',
  status: 'watching',
  catalogProvider: 'tmdb',
  catalogId: id,
  lastSyncedAt: new Date(now - 13 * 60 * 60 * 1000),
  createdAt: new Date('2026-01-01T12:00:00'),
  ...overrides,
});

describe('Entertainment automatic refresh eligibility', () => {
  it('selects stale linked items, skips fresh/manual/completed/dropped items, and preserves order', () => {
    const candidates = getAutomaticEntertainmentRefreshCandidates([
      item('stale-1'),
      item('fresh', { lastSyncedAt: new Date(now - 2 * 60 * 60 * 1000) }),
      item('manual', { catalogProvider: 'manual', catalogId: undefined }),
      item('completed', { status: 'completed' }),
      item('dropped', { status: 'dropped' }),
      item('stale-2'),
    ], now);

    expect(candidates.map(candidate => candidate.id)).toEqual(['stale-1', 'stale-2']);
  });

  it('keeps the bounded automatic refresh cap', () => {
    const candidates = getAutomaticEntertainmentRefreshCandidates(
      Array.from({ length: ENTERTAINMENT_AUTO_REFRESH_LIMIT + 3 }, (_, index) => item(`stale-${index}`)),
      now,
    );

    expect(candidates).toHaveLength(ENTERTAINMENT_AUTO_REFRESH_LIMIT);
    expect(candidates[0].id).toBe('stale-0');
    expect(candidates[candidates.length - 1].id).toBe(`stale-${ENTERTAINMENT_AUTO_REFRESH_LIMIT - 1}`);
  });

  it('resets eligibility for a new profile but not repeated renders of the same profile', () => {
    expect(shouldStartEntertainmentAutoRefresh('profile-a', null, 2)).toBe(true);
    expect(shouldStartEntertainmentAutoRefresh('profile-a', 'profile-a', 2)).toBe(false);
    expect(shouldStartEntertainmentAutoRefresh('profile-b', 'profile-a', 2)).toBe(true);
    expect(shouldStartEntertainmentAutoRefresh('profile-b', 'profile-a', 0)).toBe(false);
  });

  it('preserves the existing sequential, manual-refresh, and persistence paths', () => {
    const entertainment = source('components/sections/EntertainmentSection.tsx');

    expect(ENTERTAINMENT_AUTO_REFRESH_DELAY_MS).toBe(250);
    expect(entertainment).toContain('for (const item of eligible)');
    expect(entertainment).toContain('await syncOne(item, true)');
    expect(entertainment).toContain('onClick={refreshAll}');
    expect(entertainment).toContain('onRefresh={(item: MediaItem) => void syncOne(item)}');
    expect(entertainment).toContain('const patch = await syncCatalogItem(item);');
    expect(entertainment).toContain('updateMediaItem(item.id, reconciledPatch)');
  });
});
