import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { getPreferredWatchLink } from '@/lib/entertainment/links';
import {
  formatMediaProgressAction,
  formatMediaUpdateDescription,
  formatNextRelease,
} from '@/lib/entertainment/presentation';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Entertainment refinement', () => {
  it('prefers the personal website and falls back to the first valid legacy link', () => {
    expect(getPreferredWatchLink({
      website: 'preferred.example/watch',
      links: [{ id: 'legacy', label: 'Legacy', url: 'https://legacy.example/watch' }],
    })).toBe('https://preferred.example/watch');

    expect(getPreferredWatchLink({
      website: '',
      links: [
        { id: 'bad', label: 'Bad', url: 'javascript:alert(1)' },
        { id: 'legacy', label: 'Legacy', url: 'legacy.example/watch' },
      ],
    })).toBe('https://legacy.example/watch');
  });

  it('rejects missing and unsafe personal links without using catalog fields', () => {
    expect(getPreferredWatchLink({
      website: 'javascript:alert(1)',
      links: [{ id: 'bad', label: 'Bad', url: 'http://legacy.example/watch' }],
    })).toBeNull();
  });

  it('keeps the Media header compact and removes the Discover decoration', () => {
    const section = source('components/sections/EntertainmentSection.tsx');

    expect(section).toContain('Your watchlist');
    expect(section).toContain("Track what you're watching and what comes next.");
    expect(section).toContain('MEDIA_PAGE_SIZE = 12');
    expect(section).toContain('PaginationControls');
    expect(section).not.toContain('Your watchlist, all in one place.');
    expect(section).not.toContain("Track what you're watching, discover something new, and pick up where you left off.");
    expect(section).not.toContain('Your watchlist, now connected to a real catalog.');
    expect(section).not.toContain('Discover anime through AniList');
    expect(section).not.toContain('Sparkles');
    expect(section).not.toContain('-right-24 -top-24 h-72 w-72 rounded-full');
    expect(section).not.toContain('-bottom-28 left-1/3 h-64 w-64 rounded-full');
    expect(section).not.toContain('inline-flex items-center gap-2 rounded-full border border-rose-300/35');
  });

  it('uses canonical media units for update and progress wording', () => {
    expect(formatMediaUpdateDescription({ type: 'series', unitLabel: 'episodes', newUnitsAvailable: 1 })).toBe('1 new episode');
    expect(formatMediaUpdateDescription({ type: 'manga', unitLabel: 'chapters', newUnitsAvailable: 2 })).toBe('2 new chapters');
    expect(formatMediaUpdateDescription({ type: 'manga', unitLabel: 'volumes', newUnitsAvailable: 3 })).toBe('3 new volumes');
    expect(formatMediaUpdateDescription({ type: 'series', unitLabel: 'episodes', hasNewSeason: true })).toBe('New season available');

    expect(formatMediaProgressAction({ type: 'series', unitLabel: 'episodes' })).toBe('+1 episode');
    expect(formatMediaProgressAction({ type: 'manga', unitLabel: 'chapters' })).toBe('+1 chapter');
    expect(formatMediaProgressAction({ type: 'manga', unitLabel: 'volumes' })).toBe('+1 volume');
  });

  it('formats next releases locally without seconds or changing the timestamp', () => {
    const formatted = formatNextRelease({
      type: 'series',
      unitLabel: 'episodes',
      nextEpisodeNumber: 8,
      nextEpisodeAt: new Date('2026-08-22T13:00:00'),
    });

    expect(formatted).toMatch(/^Next: Episode 8 · /);
    expect(formatted).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(formatted).toContain(new Date('2026-08-22T13:00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }));
  });

  it('renders Watch only through the derived valid-link contract', () => {
    const section = source('components/sections/EntertainmentSection.tsx');
    const updates = source('components/entertainment/EntertainmentUpdates.tsx');

    expect(section).toContain("import { getPreferredWatchLink } from '@/lib/entertainment/links';");
    expect(section).toContain('watchLinks={updateWatchLinks}');
    expect(section).toContain('onWatch={(item: MediaItem) =>');
    expect(updates).toContain('watchLinks: ReadonlyMap<string, string>;');
    expect(updates).toContain('watchLinks.has(item.id)');
    expect(updates).toContain('aria-label={`Watch ${item.title}`}');
    expect(updates).toContain('formatMediaUpdateDescription(item)');
    expect(updates).toContain('formatMediaProgressAction(item)');
    expect(updates).toContain('formatNextRelease(item)');
    expect(updates).not.toContain('Catalog update');
    expect(updates).not.toContain('new season detected');
    expect(updates).not.toContain('toLocaleString');
    expect(updates).toContain('onWatch(item)');
    expect(updates).toContain('onProgress(item)');
    expect(updates).toContain('onAcknowledge(item)');
    expect(updates).toContain('onRefresh(item)');
  });

  it('keeps entertainment navigation and libraries bounded', () => {
    const section = source('components/sections/EntertainmentSection.tsx');
    const games = source('components/sections/GamingSection.tsx');
    const books = source('components/entertainment/BooksWorkspace.tsx');

    expect(section).toContain('label="Entertainment workspaces"');
    expect(section).toContain("{ value: 'media', label: 'Media', icon: Film }");
    expect(section).toContain("{ value: 'games', label: 'Games', icon: Gamepad2 }");
    expect(section).toContain("{ value: 'books', label: 'Books', icon: BookOpen }");
    expect(games).toContain('GAME_PAGE_SIZE = 12');
    expect(games).toContain('visibleLibraryGames');
    expect(books).toContain('label="Books views"');
    expect(books).toContain("{ value: 'library', label: 'My Library', icon: BookOpen }");
    expect(books).toContain("{ value: 'discover', label: 'Discover', icon: Search }");
    expect(books).toContain("{ value: 'trending', label: 'Trending' }");
    expect(books).toContain("{ value: 'top-rated', label: 'Top Rated' }");
    expect(books).toContain("{ value: 'recent', label: 'New & Recent' }");
    expect(books).toContain('title="No books found"');
    expect(books).toContain('variant="compact"');
    expect(books).toContain('Book discovery is temporarily unavailable. Your Caizen library is still available.');
    expect(books).toContain('PaginationControls');
    expect(books).toContain('DISCOVERY_PAGE_SIZE = 20');
  });
});
