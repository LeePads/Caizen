import {
  getSpotifyLink,
  getYouTubeId,
} from '@/lib/music-links';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type JsonRecord = Record<string, unknown>;

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

const CAPACITOR_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
]);

function corsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get('origin') || '';
  return CAPACITOR_ORIGINS.has(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        vary: 'Origin',
      }
    : {};
}

function json(data: unknown, status = 200, request?: Request) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': status === 200
        ? 'private, max-age=300, stale-while-revalidate=3600'
        : 'no-store',
      ...corsHeaders(request),
    },
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

async function fetchJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Metadata provider returned ${response.status}.`);
    }

    return await response.json() as JsonRecord;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSpotifyToken() {
  if (spotifyTokenCache && spotifyTokenCache.expiresAt > Date.now() + 30_000) {
    return spotifyTokenCache.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const token = await fetchJson('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${credentials}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (typeof token.access_token !== 'string') return null;

  spotifyTokenCache = {
    token: token.access_token,
    expiresAt: Date.now() + Math.max(60, Number(token.expires_in || 3600)) * 1000,
  };

  return spotifyTokenCache.token;
}

async function getYouTubeMetadata(url: string) {
  const id = getYouTubeId(url);
  if (!id) return null;

  const canonicalUrl = `https://www.youtube.com/watch?v=${id}`;
  const result = await fetchJson(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
  );

  return {
    provider: 'youtube' as const,
    title: typeof result.title === 'string' ? result.title : '',
    artist: typeof result.author_name === 'string' ? result.author_name : '',
    image: typeof result.thumbnail_url === 'string'
      ? result.thumbnail_url
      : `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    canonicalUrl,
    partial: false,
  };
}

async function getSpotifyMetadata(url: string) {
  const link = getSpotifyLink(url);
  if (!link) return null;

  if (link.type === 'track') {
    try {
      const token = await getSpotifyToken();
      if (token) {
        const track = await fetchJson(`https://api.spotify.com/v1/tracks/${link.id}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const artists = Array.isArray(track.artists)
          ? track.artists
              .map((artist: unknown) => artist && typeof artist === 'object' && 'name' in artist
                ? String((artist as JsonRecord).name || '')
                : '')
              .filter(Boolean)
          : [];
        const album = track.album && typeof track.album === 'object'
          ? track.album as JsonRecord
          : null;
        const images = album && Array.isArray(album.images) ? album.images : [];
        const image = images.find((candidate: unknown) =>
          candidate && typeof candidate === 'object' && typeof (candidate as JsonRecord).url === 'string'
        ) as JsonRecord | undefined;

        return {
          provider: 'spotify' as const,
          title: typeof track.name === 'string' ? track.name : '',
          artist: artists.join(', '),
          image: image ? String(image.url) : '',
          canonicalUrl: link.url,
          partial: false,
        };
      }
    } catch (error) {
      console.warn('Spotify Web API metadata lookup failed; using oEmbed.', error);
    }
  }

  const embed = await fetchJson(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(link.url)}`,
  );

  return {
    provider: 'spotify' as const,
    title: typeof embed.title === 'string' ? embed.title : '',
    artist: '',
    image: typeof embed.thumbnail_url === 'string' ? embed.thumbnail_url : '',
    canonicalUrl: link.url,
    partial: true,
    message: link.type === 'track'
      ? 'Title and artwork were added. Add Spotify server credentials to auto-fill the exact artist.'
      : 'Title and artwork were added. Artist auto-fill is available for Spotify track links.',
  };
}

export async function POST(request: Request) {
  const maxBodyBytes = 8 * 1024;
  let body: unknown;

  try {
    if (Number(request.headers.get('content-length')) > maxBodyBytes) {
      return json({ error: 'Request body is too large.' }, 413, request);
    }
    if (!request.body) return json({ error: 'Expected a JSON request body.' }, 400, request);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBodyBytes) {
          void reader.cancel().catch(() => undefined);
          return json({ error: 'Request body is too large.' }, 413, request);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return json({ error: 'Expected a JSON request body.' }, 400, request);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Expected a JSON object.' }, 400, request);
  }
  const value = (body as JsonRecord).url;
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url || url.length > 2_048) {
    return json({ error: 'Enter a valid YouTube or Spotify link.' }, 400, request);
  }

  try {
    const metadata = getYouTubeId(url)
      ? await getYouTubeMetadata(url)
      : getSpotifyLink(url)
        ? await getSpotifyMetadata(url)
        : null;

    if (!metadata) {
      return json({ error: 'Only YouTube and open.spotify.com links can auto-fill details.' }, 422, request);
    }

    return json(metadata, 200, request);
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'The metadata request timed out. Try again.'
      : 'The source did not return metadata for this link.';
    return json({ error: message }, 502, request);
  }
}
