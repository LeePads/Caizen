import type { WorkoutExerciseDefinition } from '../types';
import { isNativeApp } from '../platform';

/**
 * Resolves a *current* remote exercise animation URL for openGym-sourced
 * exercises only, via Caizen's own server-side proxy
 * (app/api/health/exercise-media), which in turn calls the free hosted
 * ExerciseDB V1 API (AscendAPI, https://oss.exercisedb.dev/api/v1).
 *
 * The browser/WebView never calls oss.exercisedb.dev directly: a direct
 * client-side fetch depends on that free/oss host's undocumented CORS
 * behavior, which is exactly the kind of instability its own docs warn
 * about ("exploration only, not for production"). Proxying through
 * Caizen's own origin — the same pattern already used for RAWG game
 * discovery (lib/games/rawg.ts) and music metadata (lib/music-metadata.ts)
 * — removes that dependency entirely: the request is same-origin from the
 * browser's perspective, and only Caizen's own server talks to the
 * upstream API.
 *
 * This module never persists anything itself: no localStorage, no
 * IndexedDB, no profile field, no cloud backup. The in-memory cache below
 * lives only for the current page/session and is intentionally lost on
 * reload. Caizen stores only the stable `catalogMediaId` identifier on the
 * exercise record (see lib/types.ts) — the resolved URL itself is always
 * re-fetched, since the upstream service does not promise a permanent URL.
 */

const IS_CAPACITOR_BUILD = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === '1';
const CONFIGURED_WEB_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || '').trim();

function resolveWebOrigin(value: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

const CAIZEN_WEB_ORIGIN = resolveWebOrigin(CONFIGURED_WEB_ORIGIN);
const REQUEST_TIMEOUT_MS = 6000;

type CacheEntry = { url: string | null };

const memoryCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

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
 * The Android/Capacitor build is a static export with no local API routes
 * (see next.config.mjs), so native calls go to the configured hosted web
 * origin instead — same mechanism as lib/games/rawg.ts. When neither is
 * available, media resolution is simply unavailable rather than an error.
 */
function mediaEndpoint(mediaId: string): string | null {
  const path = `/api/health/exercise-media?mediaId=${encodeURIComponent(mediaId)}`;
  const native = IS_CAPACITOR_BUILD || isNativeApp();
  if (!native) return path;
  return CAIZEN_WEB_ORIGIN ? `${CAIZEN_WEB_ORIGIN}${path}` : null;
}

async function fetchGifUrl(mediaId: string): Promise<string | null> {
  const endpoint = mediaEndpoint(mediaId);
  if (!endpoint) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as { gifUrl?: unknown } | null;
    return looksLikeHttpsUrl(payload?.gifUrl) ? payload!.gifUrl as string : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolves the current remote animation URL for an exercise, or null when
 * unavailable/inapplicable/failed. Deduplicates concurrent callers for the
 * same exercise and caches for the lifetime of the page only.
 */
export async function resolveRemoteExerciseAnimation(
  exercise: Pick<WorkoutExerciseDefinition, 'catalogSource' | 'catalogMediaId'> | undefined | null,
): Promise<string | null> {
  if (!exercise || exercise.catalogSource !== 'opengym' || !exercise.catalogMediaId) return null;
  const mediaId = exercise.catalogMediaId;

  const cached = memoryCache.get(mediaId);
  if (cached) return cached.url;

  const pending = inFlight.get(mediaId);
  if (pending) return pending;

  const request = fetchGifUrl(mediaId)
    .then(url => {
      memoryCache.set(mediaId, { url });
      return url;
    })
    .finally(() => {
      inFlight.delete(mediaId);
    });
  inFlight.set(mediaId, request);
  return request;
}

/** Test/dev-only: clears the in-memory (session-lifetime) cache. */
export function clearExerciseMediaCache(): void {
  memoryCache.clear();
  inFlight.clear();
}
