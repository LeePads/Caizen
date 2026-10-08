import { isValidLocalDateKey } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type JsonRecord = Record<string, unknown>;

const CAPACITOR_ORIGINS = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost']);
const RAWG_BASE_URL = 'https://api.rawg.io/api/games';
const RAWG_GENRES_URL = 'https://api.rawg.io/api/genres';
const PAGE_SIZE = 24;
const MAX_QUERY_LENGTH = 120;
const RAWG_CACHE_TTL_MS = 5 * 60 * 1000;
const RAWG_CACHE_MAX_ENTRIES = 64;
const rawgResponseCache = new Map<string, { expiresAt: number; value: JsonRecord }>();

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

function json(data: unknown, status = 200, request?: Request) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': status === 200 ? 'private, max-age=300, stale-while-revalidate=1800' : 'no-store',
      ...corsHeaders(request),
    },
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function safeUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function rawgUrl(slug: unknown, id: string) {
  const safeSlug = typeof slug === 'string' && /^[a-z0-9-]+$/i.test(slug) ? slug : id;
  return `https://rawg.io/games/${safeSlug}`;
}

function platformLabels(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => {
    if (!item || typeof item !== 'object') return '';
    const platform = (item as JsonRecord).platform;
    return platform && typeof platform === 'object' && typeof (platform as JsonRecord).name === 'string'
      ? String((platform as JsonRecord).name).trim()
      : '';
  }).filter(Boolean))).slice(0, 12);
}

function genres(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const labels = Array.from(new Set(value.map(item => item && typeof item === 'object' && typeof (item as JsonRecord).name === 'string'
    ? String((item as JsonRecord).name).trim()
    : '').filter(Boolean))).slice(0, 8);
  return labels.length ? labels : undefined;
}

function normalizeGenre(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as JsonRecord;
  const id = String(record.id ?? '').trim();
  const slug = typeof record.slug === 'string' ? record.slug.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  return id && slug && name ? { id, slug, name } : null;
}

function normalizeGame(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as JsonRecord;
  const rawgId = String(record.id ?? '').trim();
  const title = typeof record.name === 'string' ? record.name.trim() : '';
  if (!rawgId || !title || rawgId.length > 40) return null;
  const releaseDate = typeof record.released === 'string' && isValidLocalDateKey(record.released)
    ? record.released
    : undefined;
  const genreLabels = genres(record.genres);
  const genreEntries = Array.isArray(record.genres)
    ? record.genres.map(normalizeGenre).filter((item): item is Record<string, string> => Boolean(item)).slice(0, 8)
    : [];
  return {
    rawgId,
    title,
    image: safeUrl(record.background_image),
    releaseDate,
    providerPlatforms: platformLabels(record.platforms),
    genre: genreLabels?.[0],
    genres: genreEntries.length ? genreEntries : undefined,
    rating: typeof record.rating === 'number' && Number.isFinite(record.rating) && record.rating > 0 ? record.rating : undefined,
    metacritic: typeof record.metacritic === 'number' && Number.isFinite(record.metacritic) && record.metacritic > 0 ? record.metacritic : undefined,
    website: safeUrl(record.website),
    rawgUrl: rawgUrl(record.slug, rawgId),
  };
}

function normalizeDetails(value: unknown): Record<string, unknown> | null {
  const base = normalizeGame(value);
  if (!base || !value || typeof value !== 'object') return base;
  const record = value as JsonRecord;
  const list = (input: unknown) => Array.isArray(input)
    ? input.map(item => item && typeof item === 'object' && typeof (item as JsonRecord).name === 'string' ? String((item as JsonRecord).name).trim() : '').filter(Boolean).slice(0, 12)
    : [];
  const screenshots = Array.isArray(record.short_screenshots)
    ? record.short_screenshots.map(item => item && typeof item === 'object' ? safeUrl((item as JsonRecord).image) : undefined).filter((item): item is string => Boolean(item)).slice(0, 8)
    : [];
  const stores = Array.isArray(record.stores)
    ? record.stores.map(item => {
        if (!item || typeof item !== 'object') return null;
        const store = (item as JsonRecord).store;
        const name = store && typeof store === 'object' && typeof (store as JsonRecord).name === 'string'
          ? String((store as JsonRecord).name).trim()
          : '';
        const url = safeUrl((item as JsonRecord).url);
        return name && url ? { name, url } : null;
      }).filter((item): item is { name: string; url: string } => Boolean(item)).slice(0, 8)
    : [];
  return {
    ...base,
    description: typeof record.description_raw === 'string' ? record.description_raw.slice(0, 5000) : undefined,
    developers: list(record.developers),
    publishers: list(record.publishers),
    rating: typeof record.rating === 'number' && Number.isFinite(record.rating) && record.rating > 0 ? record.rating : undefined,
    metacritic: typeof record.metacritic === 'number' && Number.isFinite(record.metacritic) && record.metacritic > 0 ? record.metacritic : undefined,
    screenshots,
    stores,
  };
}

function platformFilter(value: string | null) {
  switch (value) {
    case 'pc': return '4';
    case 'mobile': return '3,21';
    case 'console': return '1,7,8,9,13,18,19,21,27,28,187,186,16,15,14,12,5,6';
    default: return undefined;
  }
}

function pageNumber(value: string | null) {
  const parsed = Number(value || 1);
  return Number.isInteger(parsed) ? Math.min(20, Math.max(1, parsed)) : 1;
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function setDateRange(base: Record<string, string>, today: Date, fromDays: number, toDays: number) {
  base.dates = `${localDateKey(addDays(today, fromDays))},${localDateKey(addDays(today, toDays))}`;
}

function releaseWindowRange(preset: DiscoverPreset, window: string | null) {
  const today = new Date();
  const selected = window?.trim() || '';
  const ranges: Record<string, [number, number] | null> = preset === 'anticipated'
    ? {
        'next-30': [0, 30],
        'next-90': [0, 90],
        'next-6-months': [0, 183],
        'next-year': [0, 365],
      }
    : preset === 'coming-soon'
      ? { 'next-30': [0, 30], 'next-90': [0, 90], 'next-180': [0, 180] }
      : preset === 'recently-released'
        ? { 'last-7': [-7, 0], 'last-30': [-30, 0], 'last-60': [-60, 0], 'last-90': [-90, 0] }
        : { 'last-30': [-30, 0], 'last-90': [-90, 0], 'last-year': [-365, 0], 'last-3-years': [-1095, 0], 'last-5-years': [-1825, 0], all: null };
  const fallback = preset === 'anticipated'
    ? 'next-year'
    : preset === 'coming-soon'
      ? 'next-90'
      : preset === 'recently-released'
        ? 'last-60'
        : preset === 'popular'
          ? 'last-year'
          : 'all';
  const range = ranges[selected] ?? ranges[fallback];
  return { today, range };
}

type DiscoverPreset = 'popular' | 'anticipated' | 'coming-soon' | 'top-rated' | 'critics' | 'recently-released' | 'genre' | 'upcoming';
type SearchPreset = Exclude<DiscoverPreset, 'search' | 'genre' | 'upcoming'>;
const SEARCH_PRESETS: SearchPreset[] = ['popular', 'anticipated', 'coming-soon', 'top-rated', 'critics', 'recently-released'];

function discoverQuery(preset: DiscoverPreset, params: URLSearchParams) {
  const today = new Date();
  const base: Record<string, string> = {
    ordering: preset === 'popular' || preset === 'anticipated' || preset === 'genre' ? '-added'
      : preset === 'top-rated' ? '-rating'
        : preset === 'critics' ? '-metacritic'
          : preset === 'coming-soon' ? 'released'
            : '-released',
    exclude_parents: 'true',
    exclude_additions: 'true',
  };

  if (preset !== 'genre' && preset !== 'upcoming') {
    const dateRange = releaseWindowRange(preset, params.get('window')).range;
    if (dateRange) setDateRange(base, today, dateRange[0], dateRange[1]);
  }
  if (preset === 'critics') base.metacritic = '80,100';
  const genre = params.get('genre')?.trim() || '';
  if (preset === 'genre' || genre) {
    if (!/^[a-z0-9-]{1,80}$/i.test(genre)) return null;
    base.genres = genre;
  }
  if (preset === 'upcoming') {
    const days = Math.min(180, Math.max(30, Number(params.get('days') || 90)));
    base.dates = `${localDateKey(today)},${localDateKey(addDays(today, days))}`;
    base.ordering = 'released';
  }
  if ((preset === 'popular' || preset === 'recently-released') && params.get('sort') === 'newest') base.ordering = '-released';
  return base;
}

async function fetchRawg(url: string, signal: AbortSignal) {
  const cacheUrl = new URL(url);
  cacheUrl.searchParams.delete('key');
  const cacheKey = cacheUrl.toString();
  const cached = rawgResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) rawgResponseCache.delete(cacheKey);

  const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('RAWG request failed.');
  const value = await response.json() as JsonRecord;
  if (rawgResponseCache.size >= RAWG_CACHE_MAX_ENTRIES) {
    const oldestKey = rawgResponseCache.keys().next().value;
    if (typeof oldestKey === 'string') rawgResponseCache.delete(oldestKey);
  }
  rawgResponseCache.set(cacheKey, { expiresAt: Date.now() + RAWG_CACHE_TTL_MS, value });
  return value;
}

export async function GET(request: Request) {
  const apiKey = process.env.RAWG_API_KEY?.trim();
  if (!apiKey) return json({ error: 'Game discovery is temporarily unavailable.' }, 503, request);

  const params = new URL(request.url).searchParams;
  const mode = params.get('mode');
  const page = pageNumber(params.get('page'));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    if (mode === 'details') {
      const id = params.get('id')?.trim() || '';
      if (!/^\d{1,20}$/.test(id)) return json({ error: 'Game details are unavailable.' }, 400, request);
      const result = normalizeDetails(await fetchRawg(`${RAWG_BASE_URL}/${encodeURIComponent(id)}?key=${encodeURIComponent(apiKey)}`, controller.signal));
      return result ? json(result, 200, request) : json({ error: 'Game details are unavailable.' }, 502, request);
    }

    if (mode === 'genres') {
      const response = await fetchRawg(`${RAWG_GENRES_URL}?key=${encodeURIComponent(apiKey)}`, controller.signal);
      const results = Array.isArray(response.results)
        ? response.results.map(normalizeGenre).filter((item): item is Record<string, string> => Boolean(item))
        : [];
      return json({ results }, 200, request);
    }

    if (mode !== 'search' && mode !== 'upcoming' && mode !== 'discover') return json({ error: 'Game discovery is temporarily unavailable.' }, 400, request);
    const query = params.get('q')?.trim() || '';
    if (query.length > MAX_QUERY_LENGTH) return json({ error: 'Game search is temporarily unavailable.' }, 400, request);
    if (mode === 'search' && query.length < 2) return json({ results: [], page: 1, hasNextPage: false }, 200, request);

    const requestedPageSize = Number(params.get('page_size') || PAGE_SIZE);
    const pageSize = Number.isInteger(requestedPageSize) ? Math.min(PAGE_SIZE, Math.max(1, requestedPageSize)) : PAGE_SIZE;
    const searchParams = new URLSearchParams({ key: apiKey, page: String(page), page_size: String(pageSize) });
    if (query) searchParams.set('search', query);
    if (mode === 'upcoming') {
      const from = params.get('from') || '';
      const to = params.get('to') || '';
      if (!isValidLocalDateKey(from) || !isValidLocalDateKey(to)) return json({ error: 'Upcoming games are temporarily unavailable.' }, 400, request);
      searchParams.set('dates', `${from},${to}`);
      searchParams.set('ordering', 'released');
      const platforms = platformFilter(params.get('platform'));
      if (platforms) searchParams.set('platforms', platforms);
    }
    if (mode === 'discover') {
      const preset = params.get('preset') as DiscoverPreset | null;
      if (!preset || !['popular', 'anticipated', 'coming-soon', 'top-rated', 'critics', 'recently-released', 'genre', 'upcoming'].includes(preset)) {
        return json({ error: 'Game discovery is temporarily unavailable.' }, 400, request);
      }
      const presetQuery = discoverQuery(preset, params);
      if (!presetQuery) return json({ error: 'Game discovery is temporarily unavailable.' }, 400, request);
      Object.entries(presetQuery).forEach(([key, value]) => searchParams.set(key, value));
      const platforms = platformFilter(params.get('platform'));
      if (platforms) searchParams.set('platforms', platforms);
    }
    if (mode === 'search') {
      const presetParam = params.get('preset');
      const searchPreset = presetParam && SEARCH_PRESETS.includes(presetParam as SearchPreset)
        ? presetParam as SearchPreset
        : undefined;
      if (presetParam && !searchPreset) return json({ error: 'Game search is temporarily unavailable.' }, 400, request);
      if (searchPreset) {
        const presetQuery = discoverQuery(searchPreset, params);
        if (!presetQuery) return json({ error: 'Game search is temporarily unavailable.' }, 400, request);
        Object.entries(presetQuery).forEach(([key, value]) => searchParams.set(key, value));
      }
      const platforms = platformFilter(params.get('platform'));
      if (platforms) searchParams.set('platforms', platforms);
      const genre = params.get('genre')?.trim() || '';
      if (genre && /^[a-z0-9-]{1,80}$/i.test(genre)) searchParams.set('genres', genre);
      const sort = params.get('sort');
      if (sort === 'popular') searchParams.set('ordering', '-added');
      if (sort === 'top-rated') searchParams.set('ordering', '-rating');
      if (sort === 'critics') searchParams.set('ordering', '-metacritic');
      if (sort === 'newest') searchParams.set('ordering', '-released');
      searchParams.set('exclude_parents', 'true');
      searchParams.set('exclude_additions', 'true');
    }
    const response = await fetchRawg(`${RAWG_BASE_URL}?${searchParams}`, controller.signal);
    const results = Array.isArray(response.results)
      ? response.results.map(normalizeGame).filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    const count = Number(response.count);
    return json({
      results,
      page,
      hasNextPage: Boolean(response.next) && page < 20,
      totalResults: Number.isFinite(count) ? count : undefined,
    }, 200, request);
  } catch {
    return json({ error: 'Game discovery is temporarily unavailable.' }, 502, request);
  } finally {
    clearTimeout(timeout);
  }
}
