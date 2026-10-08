import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { normalizeMusicRecord } from '@/lib/catalog/normalization';
import {
  formatMusicMonth,
  getMusicHistoryMonths,
  getMusicMonthlyPlayCounts,
} from '@/lib/music-history';
import type { MusicItem } from '@/lib/types';

const item = (id: string, title: string, playHistory: unknown[] = [], type: 'song' | 'playlist' = 'song') => normalizeMusicRecord({
  id,
  type,
  title,
  provider: 'youtube',
  url: `https://youtube.com/watch?v=${id}`,
  playHistory,
  createdAt: '2024-01-01T00:00:00.000Z',
}, new Date('2026-09-01T00:00:00.000Z'));

describe('Music play history', () => {
  it('records controllable plays centrally and keeps external links out of play history', () => {
    const player = readFileSync(resolve(process.cwd(), 'lib/music-player.tsx'), 'utf8');
    const section = readFileSync(resolve(process.cwd(), 'components/sections/MusicSection.tsx'), 'utf8');

    expect(player).toContain('recordControllablePlay(id, nextQueue)');
    expect(player).toContain('getMusicPlaybackCapabilities(item).canControlPlayback');
    expect(player).toContain('recordMusicPlay(item.id, new Date())');
    expect(section).not.toContain('playCount: Number(item.playCount || 0) + 1');
  });

  it('normalizes valid nested timestamps and ignores malformed events without pruning old history', () => {
    const track = item('track-1', 'Older track', [
      { playedAt: '2020-01-05T12:00:00.000Z' },
      { playedAt: 'not-a-date' },
      { playedAt: '2026-09-05T12:00:00.000Z' },
    ]);

    expect(track.playHistory?.map(event => event.playedAt.toISOString())).toEqual([
      '2020-01-05T12:00:00.000Z',
      '2026-09-05T12:00:00.000Z',
    ]);
  });

  it('derives deterministic monthly counts for every month with actual events', () => {
    const tracks: MusicItem[] = [
      item('b', 'Beta', [
        { playedAt: '2020-01-05T12:00:00.000Z' },
        { playedAt: '2020-01-05T13:00:00.000Z' },
        { playedAt: '2026-09-01T12:00:00.000Z' },
      ]),
      item('a', 'Alpha', [{ playedAt: '2026-09-02T12:00:00.000Z' }]),
      item('playlist', 'Playlist', [{ playedAt: '2026-09-02T12:00:00.000Z' }], 'playlist'),
    ];

    expect(getMusicMonthlyPlayCounts(tracks, '2020-01')).toEqual([
      expect.objectContaining({ item: expect.objectContaining({ id: 'b' }), count: 2 }),
    ]);
    expect(getMusicMonthlyPlayCounts(tracks, '2026-09').map(entry => [entry.item.id, entry.count])).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
  });

  it('exposes an unbounded month range without fabricating pre-tracking plays', () => {
    const tracks = [item('track', 'Tracked', [{ playedAt: '2020-01-05T12:00:00.000Z' }])];
    const months = getMusicHistoryMonths(tracks, new Date('2026-09-01T00:00:00.000Z'));

    expect(months[0]).toBe('2020-01');
    expect(months.at(-1)).toBe('2026-09');
    expect(months).toHaveLength(81);
    expect(getMusicMonthlyPlayCounts([item('legacy', 'Legacy')], '2019-01')).toEqual([]);
    expect(formatMusicMonth('2020-01')).toContain('2020');
  });
});
