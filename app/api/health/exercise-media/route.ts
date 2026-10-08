export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Server-side proxy for resolving one openGym exercise's current GIF
 * animation from the free hosted ExerciseDB V1 API (AscendAPI,
 * https://oss.exercisedb.dev/api/v1). Calling the third party from the
 * server rather than directly from the browser/WebView avoids depending on
 * that host's CORS behavior (undocumented for the free/oss tier) and keeps
 * the failure mode contained to a single, testable place — mirrors the
 * existing RAWG (app/api/games/rawg) and music-metadata proxy pattern.
 *
 * Never returns an error status for a normal "no media" outcome: any
 * upstream failure (timeout, non-200, malformed body, missing gifUrl)
 * resolves to `{ gifUrl: null }` so the caller can fall back quietly.
 */

const API_BASE = 'https://oss.exercisedb.dev/api/v1';
const REQUEST_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 256;
const MEDIA_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

const CAPACITOR_ORIGINS = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost']);

function corsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get('origin') || '';
  return CAPACITOR_ORIGINS.has(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'content-type',
        vary: 'Origin',
      }
    : {};
}

function json(data: unknown, status: number, request?: Request) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': status === 200 ? 'private, max-age=3600, stale-while-revalidate=86400' : 'no-store',
      ...corsHeaders(request),
    },
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

type CacheEntry = { expiresAt: number; gifUrl: string | null };
const mediaCache = new Map<string, CacheEntry>();

function looksLikeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Tolerant extraction: the free/oss endpoint's exact response envelope is
 * not guaranteed (bare object, `{ data: {...} }`, or `{ data: [...] }` have
 * all been observed across this API family). Never assume a fixed shape.
 */
function extractGifUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (looksLikeHttpsUrl(record.gifUrl)) return record.gifUrl;

  const data = record.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = (data as Record<string, unknown>).gifUrl;
    if (looksLikeHttpsUrl(nested)) return nested;
  }
  const list = Array.isArray(data) ? data : Array.isArray(record.data) ? record.data : null;
  if (list) {
    const first = list[0] as Record<string, unknown> | undefined;
    if (first && looksLikeHttpsUrl(first.gifUrl)) return first.gifUrl as string;
  }
  return null;
}

async function fetchGifUrl(mediaId: string, signal: AbortSignal): Promise<string | null> {
  const response = await fetch(`${API_BASE}/exercises/${encodeURIComponent(mediaId)}`, {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return extractGifUrl(payload);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mediaId = params.get('mediaId')?.trim() || '';
  if (!MEDIA_ID_PATTERN.test(mediaId)) return json({ gifUrl: null }, 400, request);

  const cached = mediaCache.get(mediaId);
  if (cached && cached.expiresAt > Date.now()) return json({ gifUrl: cached.gifUrl }, 200, request);
  if (cached) mediaCache.delete(mediaId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const gifUrl = await fetchGifUrl(mediaId, controller.signal);
    if (mediaCache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = mediaCache.keys().next().value;
      if (typeof oldestKey === 'string') mediaCache.delete(oldestKey);
    }
    mediaCache.set(mediaId, { expiresAt: Date.now() + CACHE_TTL_MS, gifUrl });
    return json({ gifUrl }, 200, request);
  } catch {
    // Timeout/abort/network failure: a graceful "no media", never a hard error.
    return json({ gifUrl: null }, 200, request);
  } finally {
    clearTimeout(timeout);
  }
}
