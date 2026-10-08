export type ParsedSpotifyLink = {
  type: 'track' | 'album' | 'playlist' | 'episode' | 'show';
  id: string;
  url: string;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_TYPES = new Set<ParsedSpotifyLink['type']>([
  'track',
  'album',
  'playlist',
  'episode',
  'show',
]);

function parseUrl(value?: string) {
  const input = value?.trim();
  if (!input) return null;

  try {
    return new URL(input);
  } catch {
    try {
      return new URL(`https://${input}`);
    } catch {
      return null;
    }
  }
}

export function getYouTubeId(value?: string) {
  const parsed = parseUrl(value);
  if (!parsed) return '';

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const parts = parsed.pathname.split('/').filter(Boolean);
  let candidate = '';

  if (host === 'youtu.be') {
    candidate = parts[0] || '';
  } else if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    candidate =
      parsed.searchParams.get('v') ||
      (['embed', 'shorts', 'live'].includes(parts[0] || '')
        ? parts[1] || ''
        : '');
  }

  return YOUTUBE_ID.test(candidate) ? candidate : '';
}

export function getSpotifyLink(value?: string): ParsedSpotifyLink | null {
  const parsed = parseUrl(value);
  if (!parsed) return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'open.spotify.com' && host !== 'spotify.com') return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  const offset = parts[0]?.startsWith('intl-') ? 1 : 0;
  const type = parts[offset] as ParsedSpotifyLink['type'] | undefined;
  const id = parts[offset + 1]?.trim();

  if (!type || !SPOTIFY_TYPES.has(type) || !id || !/^[A-Za-z0-9]+$/.test(id)) {
    return null;
  }

  return {
    type,
    id,
    url: `https://open.spotify.com/${type}/${id}`,
  };
}

export function detectMusicProvider(value?: string) {
  if (getYouTubeId(value)) return 'youtube' as const;
  if (getSpotifyLink(value)) return 'spotify' as const;
  return 'link' as const;
}

/**
 * A stable identity for duplicate detection. IDs remain case-sensitive; only
 * URL host/protocol and known tracking parameters are normalized.
 */
export function getMusicLinkIdentity(value?: string) {
  const youtubeId = getYouTubeId(value);
  if (youtubeId) return `youtube:${youtubeId}`;

  const spotify = getSpotifyLink(value);
  if (spotify) return `spotify:${spotify.type}:${spotify.id}`;

  const parsed = parseUrl(value);
  if (!parsed) return value?.trim() || '';

  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();

  for (const key of Array.from(parsed.searchParams.keys())) {
    if (
      key.toLowerCase().startsWith('utm_') ||
      ['si', 'feature', 'pp'].includes(key.toLowerCase())
    ) {
      parsed.searchParams.delete(key);
    }
  }

  if (parsed.pathname !== '/') {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  return parsed.toString();
}

