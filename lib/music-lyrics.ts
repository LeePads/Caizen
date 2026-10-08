type LrclibRecord = {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

export type MusicLyricsLookup = {
  title: string;
  artist?: string | null;
  durationSeconds?: number;
  signal?: AbortSignal;
};

export function normalizeLyricsText(value?: string | null) {
  return (value || '')
    .toLocaleLowerCase()
    .replace(/\([^)]*(official|video|audio|lyrics?|visualizer)[^)]*\)/gi, ' ')
    .replace(/\[[^\]]*(official|video|audio|lyrics?|visualizer)[^\]]*\]/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function scoreLyricsRecord(
  record: LrclibRecord,
  title: string,
  artist: string,
  durationSeconds: number,
) {
  const wantedTitle = normalizeLyricsText(title);
  const wantedArtist = normalizeLyricsText(artist);
  const recordTitle = normalizeLyricsText(record.trackName);
  const recordArtist = normalizeLyricsText(record.artistName);

  let score = 0;

  if (recordTitle === wantedTitle) score += 12;
  else if (
    recordTitle.includes(wantedTitle) ||
    wantedTitle.includes(recordTitle)
  ) score += 6;

  if (wantedArtist && recordArtist === wantedArtist) score += 10;
  else if (
    wantedArtist &&
    (recordArtist.includes(wantedArtist) ||
      wantedArtist.includes(recordArtist))
  ) score += 5;

  if (
    durationSeconds > 0 &&
    typeof record.duration === 'number'
  ) {
    const difference = Math.abs(record.duration - durationSeconds);
    if (difference <= 2) score += 6;
    else if (difference <= 8) score += 3;
  }

  if (record.syncedLyrics?.trim()) score += 3;
  else if (record.plainLyrics?.trim()) score += 1;

  return score;
}

export async function fetchMusicLyrics({
  title,
  artist,
  durationSeconds = 0,
  signal,
}: MusicLyricsLookup): Promise<string | null> {
  const normalizedTitle = title.trim();
  const normalizedArtist = (artist || '').trim();

  if (!normalizedTitle || !normalizedArtist) return null;

  const params = new URLSearchParams({
    track_name: normalizedTitle,
    artist_name: normalizedArtist,
  });

  const response = await fetch(
    `https://lrclib.net/api/search?${params.toString()}`,
    {
      signal,
      headers: {
        'Lrclib-Client': 'Caizen/1.0 (https://caizen.space)',
      },
    },
  );

  if (!response.ok) return null;

  const records = (await response.json()) as LrclibRecord[];
  if (!Array.isArray(records) || records.length === 0) return null;

  const best = records
    .filter(record => !record.instrumental)
    .map(record => ({
      record,
      score: scoreLyricsRecord(
        record,
        normalizedTitle,
        normalizedArtist,
        durationSeconds,
      ),
    }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < 10) return null;

  return (
    best.record.syncedLyrics?.trim() ||
    best.record.plainLyrics?.trim() ||
    null
  );
}
