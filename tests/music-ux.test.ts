import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  insertQueueItemAfterActive,
  moveQueueItemToEnd,
} from '@/lib/music-player';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Music queue ordering', () => {
  it('inserts a queued item immediately after the active item', () => {
    expect(insertQueueItemAfterActive(['a', 'b', 'c'], 'c', 'a')).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('deduplicates Play next requests and puts an item first without an active track', () => {
    expect(insertQueueItemAfterActive(['a', 'b', 'c'], 'b', null)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('moves only non-active queued items to the end', () => {
    expect(moveQueueItemToEnd(['a', 'b', 'c'], 'b', 'a')).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(moveQueueItemToEnd(['a', 'b', 'c'], 'a', 'a')).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(moveQueueItemToEnd(['a', 'b', 'c'], 'missing', 'a')).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('Music presentation contracts', () => {
  it('wires lyrics autofill into Add and explicit Refresh without changing the manual lyrics contract', () => {
    const modal = read('components/modals/MusicModal.tsx');

    expect(modal).toContain("import { fetchMusicLyrics } from '@/lib/music-lyrics';");
    expect(modal).toContain('void loadMetadata(url, { fetchLyrics: !item });');
    expect(modal).toContain('void loadMetadata(url, { fetchLyrics: true });');
    expect(modal).toContain('Matching lyrics were found, but your existing lyrics were kept.');
    expect(modal).toContain('Refresh can look for matching lyrics after title and artist are available.');
    expect(modal).not.toContain('Caizen does not scrape lyrics.');
  });

  it('keeps the player cache and runtime lookup on the shared lyrics helper', () => {
    const player = read('lib/music-player.tsx');

    expect(player).toContain("import { fetchMusicLyrics, normalizeLyricsText } from '@/lib/music-lyrics';");
    expect(player).toContain('void fetchMusicLyrics({');
    expect(player).toContain("lyricsCache: 'caizen-music-lyrics-cache-v1'");
    expect(player).not.toContain('fetchLyricsForItem(');
  });

  it('uses Played terminology and keeps the compact filter hierarchy', () => {
    const music = read('components/sections/MusicSection.tsx');

    expect(music).toContain('Recently Played');
    expect(music).toContain('Most Played');
    expect(music).toContain("label: 'Recently played'");
    expect(music).toContain("label: 'Most played'");
    expect(music).toContain('Filters{activeFilterCount > 0');
    expect(music).not.toContain('Recently Opened');
    expect(music).not.toContain('Most Opened');
    expect(music).not.toContain('role="button"');
  });

  it('places listening summaries before library browsing controls', () => {
    const music = read('components/sections/MusicSection.tsx');
    const overview = music.indexOf('const listeningOverview');
    const monthly = music.indexOf('Monthly Most Played');
    const browse = music.indexOf('Browse your music');

    expect(overview).toBeGreaterThanOrEqual(0);
    expect(monthly).toBeGreaterThan(overview);
    expect(browse).toBeGreaterThan(monthly);
    expect(music.indexOf('<ResponsiveControlStrip label="Music views">')).toBeGreaterThan(browse);
  });

  it('keeps secondary Now Playing actions behind the existing menu pattern', () => {
    const music = read('components/sections/MusicSection.tsx');

    expect(music).toContain('function NowPlayingActionsMenu');
    expect(music).toContain('<DropdownMenuTrigger asChild>');
    expect(music).toContain('<DropdownMenuContent');
    expect(music).toContain('data-overlay-surface="music-menu"');
    expect(music).toContain('<DropdownMenuItem onSelect={onOpen}>');
    expect(music).toContain('<DropdownMenuItem onSelect={onShowVideo}>');
    expect(music).toContain('<DropdownMenuItem onSelect={onEdit}>');
    expect(music).not.toContain("openContext(event, activeItem, 'now-playing')");
  });

  it('keeps the mini-player focused on transport, Player, and Queue actions', () => {
    const player = read('lib/music-player.tsx');
    const miniPlayerStart = player.indexOf('className="web-mini-player');
    const miniPlayer = player.slice(miniPlayerStart);

    expect(miniPlayer).toContain('aria-label="Previous track"');
    expect(miniPlayer).toContain('aria-label="Next track"');
    expect(miniPlayer).toContain('aria-label="Open full player"');
    expect(miniPlayer).toContain('aria-label="Open queue"');
    expect(miniPlayer).not.toContain('aria-label="Stop playback"');
    expect(miniPlayer).not.toContain('aria-label="Toggle shuffle"');
    expect(miniPlayer).not.toContain('aria-label="Toggle repeat"');
    expect(miniPlayer).not.toContain('aria-label="Open music source"');
  });
});
