import { isNativeApp } from '@/lib/platform';

const IS_CAPACITOR_BUILD = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === '1';
const configuredOrigin = (process.env.NEXT_PUBLIC_APP_URL || '').trim();

function resolveHostedOrigin(value: string) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

const hostedOrigin = resolveHostedOrigin(configuredOrigin);
const inflightRequests = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const CLIENT_CACHE_MS = 60_000;

export type RawgGameResult = {
  rawgId: string;
  title: string;
  image?: string;
  releaseDate?: string;
  providerPlatforms: string[];
  genre?: string;
  genres?: RawgGenre[];
  rating?: number;
  metacritic?: number;
  website?: string;
  rawgUrl?: string;
};

export type RawgGenre = {
  id: string;
  slug: string;
  name: string;
};

export type RawgGamePage = {
  results: RawgGameResult[];
  page: number;
  hasNextPage: boolean;
  totalResults?: number;
};

export type RawgGameDetails = RawgGameResult & {
  description?: string;
  developers?: string[];
  publishers?: string[];
  screenshots?: string[];
  stores?: Array<{ name: string; url: string }>;
};

export type DiscoverPreset =
  | 'popular'
  | 'anticipated'
  | 'coming-soon'
  | 'top-rated'
  | 'critics'
  | 'recently-released'
  | 'genre'
  | 'search'
  | 'upcoming';

export type RawgSearchSort = 'best-match' | 'popular' | 'top-rated' | 'critics' | 'newest';
export type RawgSearchPreset = Exclude<DiscoverPreset, 'search' | 'genre' | 'upcoming'>;

function endpoint(path: string) {
  const native = IS_CAPACITOR_BUILD || isNativeApp();
  if (native && !hostedOrigin) {
    throw new Error('Online game discovery is not configured for this Android build. Manual Add remains available.');
  }
  return native ? `${hostedOrigin}${path}` : path;
}

async function requestUncached<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new Error('Game catalog request was cancelled.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Game discovery is unavailable while offline. Manual Add remains available.');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10_000);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(endpoint(path), { signal: controller.signal });
    const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok || !body) {
      throw new Error(body?.error || 'Game discovery is temporarily unavailable.');
    }
    return body;
  } catch (error) {
    if (signal?.aborted) throw new Error('Game catalog request was cancelled.');
    if (timedOut) throw new Error('Game discovery timed out. Try again later or add the game manually.');
    throw error instanceof Error
      ? error
      : new Error('Game discovery is temporarily unavailable.');
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const cached = responseCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value as T);
  if (cached) responseCache.delete(path);

  const pending = inflightRequests.get(path);
  if (pending) return pending as Promise<T>;

  const requestPromise = requestUncached<T>(path, signal)
    .then(value => {
      responseCache.set(path, { expiresAt: Date.now() + CLIENT_CACHE_MS, value });
      return value;
    })
    .finally(() => inflightRequests.delete(path));
  inflightRequests.set(path, requestPromise);
  return requestPromise;
}

function query(params: Record<string, string | number | undefined>) {
  const values = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') values.set(key, String(value));
  });
  return values.toString();
}

export function searchRawgGames(queryText: string, page = 1, signal?: AbortSignal) {
  const params = query({ mode: 'search', q: queryText.trim(), page: Math.max(1, page) });
  return request<RawgGamePage>(`/api/games/rawg?${params}`, signal);
}

export function getRawgSearchGames({
  query: queryText,
  platform = 'all',
  genre,
  sort = 'best-match',
  preset,
  releaseWindow,
  page = 1,
}: {
  query: string;
  platform?: 'all' | 'pc' | 'mobile' | 'console';
  genre?: string;
  sort?: RawgSearchSort;
  preset?: RawgSearchPreset;
  releaseWindow?: string;
  page?: number;
}, signal?: AbortSignal) {
  const params = query({ mode: 'search', q: queryText.trim(), platform, genre, sort, preset, window: releaseWindow, page: Math.max(1, page) });
  return request<RawgGamePage>(`/api/games/rawg?${params}`, signal);
}

export function getRawgDiscoverGames({
  preset,
  platform = 'all',
  genre,
  query: queryText,
  days,
  releaseWindow,
  sort,
  page = 1,
  pageSize,
}: {
  preset: Exclude<DiscoverPreset, 'search'>;
  platform?: 'all' | 'pc' | 'mobile' | 'console';
  genre?: string;
  query?: string;
  days?: string;
  releaseWindow?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}, signal?: AbortSignal) {
  const params = query({
    mode: 'discover',
    preset,
    platform,
    genre,
    q: queryText?.trim(),
    days,
    window: releaseWindow,
    sort,
    page: Math.max(1, page),
    page_size: pageSize,
  });
  return request<RawgGamePage>(`/api/games/rawg?${params}`, signal);
}

export function getRawgGenres(signal?: AbortSignal) {
  return request<{ results: RawgGenre[] }>('/api/games/rawg?mode=genres', signal);
}

export function getRawgUpcomingGames({
  from,
  to,
  platform,
  query: queryText,
  page = 1,
}: {
  from: string;
  to: string;
  platform?: 'all' | 'pc' | 'mobile' | 'console';
  query?: string;
  page?: number;
}, signal?: AbortSignal) {
  const params = query({
    mode: 'upcoming',
    from,
    to,
    platform,
    q: queryText?.trim(),
    page: Math.max(1, page),
  });
  return request<RawgGamePage>(`/api/games/rawg?${params}`, signal);
}

export function getRawgGameDetails(rawgId: string, signal?: AbortSignal) {
  const params = query({ mode: 'details', id: rawgId.trim() });
  return request<RawgGameDetails>(`/api/games/rawg?${params}`, signal);
}
