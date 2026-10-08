import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchMusicLyrics } from '@/lib/music-lyrics';

describe('Music lyrics lookup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('queries LRCLIB with the title and artist and prefers a confident synced match', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          trackName: 'Song (Live)',
          artistName: 'Artist',
          plainLyrics: 'A partial match',
        },
        {
          trackName: 'Song',
          artistName: 'Artist',
          plainLyrics: 'Plain lyrics',
          syncedLyrics: '[00:01.00]Synced lyrics',
        },
        {
          trackName: 'Song',
          artistName: 'Artist',
          instrumental: true,
          plainLyrics: 'Instrumental should not win',
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    const signal = new AbortController().signal;
    await expect(
      fetchMusicLyrics({
        title: 'Song',
        artist: 'Artist',
        signal,
      }),
    ).resolves.toBe('[00:01.00]Synced lyrics');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('track_name=Song'),
      expect.objectContaining({
        signal,
        headers: {
          'Lrclib-Client': 'Caizen/1.0 (https://www.caizen.space)',
        },
      }),
    );
    expect(fetchMock.mock.calls[0][0]).toContain('artist_name=Artist');
  });

  it('returns null for missing artist or low-confidence results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          trackName: 'Another track',
          artistName: 'Different singer',
          plainLyrics: 'Not a safe match',
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchMusicLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
    await expect(
      fetchMusicLyrics({ title: 'Song', artist: '' }),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for provider failures without inventing lyrics', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => [],
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchMusicLyrics({ title: 'Song', artist: 'Artist' }),
    ).resolves.toBeNull();
  });

  it('preserves abort behavior for callers that cancel a lookup', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchMusicLyrics({
        title: 'Song',
        artist: 'Artist',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
