import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeEntertainmentMetadata,
  normalizeGameGuides,
  normalizeGames,
  normalizeMusicItems,
} from '@/lib/catalog/normalization';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import { parseLocalDateInputOrUndefined, toLocalDateKey } from '@/lib/date-utils';
import { prepareImport } from '@/lib/storage/import-integrity';
import { isGlobalSearchResultAvailable, searchProfileRecords } from '@/lib/global-search';
import type { Profile } from '@/lib/types';

const profileWithCatalog = (overrides: Partial<Profile> = {}) => ({
  id: 'profile-a',
  name: 'A',
  games: [],
  gameGuides: [],
  musicItems: [],
  ...overrides,
}) as unknown as Profile;

describe('Audit #15 catalog identity and normalization', () => {
  it('repairs missing and duplicate IDs deterministically without changing valid IDs', () => {
    const rawGames = [
      { id: 'game-fixed', title: 'Fixed', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'game-duplicate', title: 'First' },
      { id: 'game-duplicate', title: 'Second' },
      { title: 'Missing ID', createdAt: '2026-01-02T00:00:00.000Z' },
    ];
    const first = normalizeGames(rawGames);
    const second = normalizeGames(first);

    expect(first.map(item => item.id)).toEqual([
      'game-fixed',
      'game-duplicate',
      'game-duplicate~2',
      expect.stringMatching(/^game-/),
    ]);
    expect(new Set(first.map(item => item.id)).size).toBe(4);
    expect(second).toEqual(first);
    expect(first[0].title).toBe('Fixed');
  });

  it('degrades malformed Games, Guides, and Music records safely', () => {
    const games = normalizeGames([{ id: null, title: null, status: 'unknown', platform: 'bad', genre: 'bad', hoursPlayed: Infinity, website: 'javascript:alert(1)', playingSince: '2026-02-29' }]);
    const guides = normalizeGameGuides([{ id: 'guide', title: null, category: 'bad', sections: [{ items: [{ title: null, resources: [{ type: 'link', value: 'http://unsafe.example' }, { type: 'link', value: 'https://safe.example' }] }] }] }]);
    const music = normalizeMusicItems([{ id: 'music', title: null, url: 'http://unsafe.example', playCount: NaN, image: 'javascript:bad', lyricsUrl: 'not a url' }]);

    expect(games[0]).toMatchObject({ title: 'Untitled game', status: 'backlog', platform: 'pc', genre: 'other', hoursPlayed: 0 });
    expect(games[0].playingSince).toBeNull();
    expect(guides[0].sections[0].items[0].resources).toHaveLength(1);
    expect(music[0]).toMatchObject({ title: 'Untitled track', url: '', playCount: 0 });
    expect(Number.isFinite(music[0].playCount)).toBe(true);
  });

  it('normalizes finite Entertainment metadata by field semantics', () => {
    expect(normalizeEntertainmentMetadata({ rating: 7.5, currentSeason: 2, availableUnits: 12 })).toMatchObject({ rating: 7.5, currentSeason: 2, availableUnits: 12 });
    expect(normalizeEntertainmentMetadata({ rating: Infinity, currentSeason: NaN, totalSeasons: '-Infinity', runtimeMinutes: 'bad' })).toMatchObject({ rating: undefined, currentSeason: undefined, totalSeasons: undefined, runtimeMinutes: undefined, newUnitsAvailable: 0 });
    expect(normalizeEntertainmentMetadata({ rating: -4, currentSeason: 0, nextEpisodeNumber: -2 })).toMatchObject({ rating: 0, currentSeason: 1, nextEpisodeNumber: 1 });
  });

  it('repairs catalog import collisions before persistence while retaining a blocking warning', () => {
    const prepared = prepareImport({
      profiles: [{ id: 'profile-a', name: 'A', games: [{ id: 'same', title: 'One' }, { id: 'same', title: 'Two' }], gameGuides: [], musicItems: [] }],
      currentProfileId: 'profile-a',
    });
    const games = prepared.state.profiles[0].games;
    expect(games.map(game => game.id)).toEqual(['same', 'same~2']);
    expect(prepared.report.duplicateIds).toContain('profile-a:games:same');
    expect(prepared.report.canImport).toBe(false);
  });

  it('keeps Search exact identity available after catalog ID repair', () => {
    const [game] = normalizeGames([{ title: 'Searchable Game', status: 'playing' }]);
    const profile = profileWithCatalog({ games: [game] });
    const result = searchProfileRecords(profile, 'Searchable Game')[0];
    expect(result).toMatchObject({ section: 'entertainment', recordType: 'game', recordId: game.id });
    expect(isGlobalSearchResultAvailable(profile, result)).toBe(true);
    expect(isGlobalSearchResultAvailable(profile, { ...result, recordId: 'deleted' })).toBe(false);
  });

  it('uses the canonical HTTPS URL policy for manual and restored catalog links', () => {
    expect(normalizeExternalWebUrl('safe.example/path')).toBe('https://safe.example/path');
    expect(normalizeExternalWebUrl('https://safe.example/path')).toBe('https://safe.example/path');
    expect(normalizeExternalWebUrl('http://unsafe.example')).toBeNull();
    expect(normalizeExternalWebUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeExternalWebUrl('not a url')).toBeNull();
  });

  it('preserves selected Game date-only values across local calendar boundaries', () => {
    const selected = '2024-02-29';
    const stored = parseLocalDateInputOrUndefined(selected);
    expect(stored).toBeDefined();
    expect(toLocalDateKey(stored)).toBe(selected);
    expect(toLocalDateKey(parseLocalDateInputOrUndefined('2025-01-01'))).toBe('2025-01-01');

    const gameModal = readFileSync(resolve(process.cwd(), 'components/modals/GameModal.tsx'), 'utf8');
    expect(gameModal).toContain('parseLocalDateInputOrUndefined');
    expect(gameModal).not.toContain('toISOString().slice(0, 10)');
  });
});

describe('Audit #15 profile-scoped Search request contracts', () => {
  it('guards and consumes the affected catalog requests', () => {
    const files = [
      'components/sections/GamingSection.tsx',
      'components/sections/EntertainmentSection.tsx',
      'components/sections/MusicSection.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source).toContain('requestedProfileId');
      expect(source).toContain('onRequestedRecordConsumed');
      expect(source).toContain('isHydrated');
      expect(source).toContain('consumedRequestSignalRef');
    }
  });
});
