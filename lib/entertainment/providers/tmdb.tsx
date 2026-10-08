import type {
  CatalogBrowseRequest,
  CatalogMediaDetails,
  CatalogMediaType,
  CatalogSearchPage,
  CatalogSearchResult,
} from '@/lib/entertainment/types';
import { CatalogApiError } from '@/lib/entertainment/types';
import type { MediaReleaseEvent } from '@/lib/types';

const TMDB_API_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p';
const MAX_QUERY_LENGTH = 120;

function normalizeSearchQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH);
}

const MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 10762: 'Kids', 9648: 'Mystery',
  10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
  10767: 'Talk', 10768: 'War & Politics', 37: 'Western',
};

type TmdbSearchItem = {
  id: number;
  title?: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
};

type TmdbSeason = {
  name?: string;
  season_number?: number;
  episode_count?: number;
  air_date?: string | null;
  poster_path?: string | null;
};

type TmdbEpisode = {
  air_date?: string | null;
  episode_number?: number | null;
  season_number?: number | null;
};

type TmdbSeasonDetails = {
  season_number?: number | null;
  episodes?: TmdbEpisode[];
};

type TmdbProvider = {
  provider_name?: string;
  logo_path?: string | null;
};

type TmdbDetails = TmdbSearchItem & {
  genres?: Array<{ name?: string }>;
  status?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_episodes?: number;
  number_of_seasons?: number;
  seasons?: TmdbSeason[];
  next_episode_to_air?: TmdbEpisode | null;
  last_episode_to_air?: TmdbEpisode | null;
  origin_country?: string[];
  production_countries?: Array<{ iso_3166_1?: string }>;
  belongs_to_collection?: {
    id?: number;
    name?: string;
    poster_path?: string | null;
  } | null;
  'watch/providers'?: {
    results?: Record<string, {
      link?: string;
      flatrate?: TmdbProvider[];
      free?: TmdbProvider[];
      ads?: TmdbProvider[];
      rent?: TmdbProvider[];
      buy?: TmdbProvider[];
    }>;
  };
};

function getApiKey() {
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY?.trim();
  if (!key) {
    throw new CatalogApiError(
      'TMDB is not configured. Add NEXT_PUBLIC_TMDB_API_KEY to .env.local and Vercel.',
      'missing_key',
    );
  }
  return key;
}

function imageUrl(path?: string | null, size = 'w500') {
  return path ? `${TMDB_IMAGE_URL}/${size}${path}` : undefined;
}

function yearFrom(value?: string | null) {
  if (!value) return undefined;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : undefined;
}

function mapStatus(value?: string | null) {
  switch (value) {
    case 'Returning Series': return 'returning' as const;
    case 'In Production':
    case 'Planned':
    case 'Pilot': return 'upcoming' as const;
    case 'Ended':
    case 'Released': return 'finished' as const;
    case 'Canceled': return 'cancelled' as const;
    default: return 'unknown' as const;
  }
}

function titleFor(item: TmdbSearchItem, mediaType: Extract<CatalogMediaType, 'movie' | 'series'>) {
  return mediaType === 'movie'
    ? item.title || item.original_title || 'Untitled'
    : item.name || item.original_name || 'Untitled';
}

function originalTitleFor(item: TmdbSearchItem, mediaType: Extract<CatalogMediaType, 'movie' | 'series'>) {
  return mediaType === 'movie' ? item.original_title : item.original_name;
}

function releaseDateFor(item: TmdbSearchItem, mediaType: Extract<CatalogMediaType, 'movie' | 'series'>) {
  return mediaType === 'movie' ? item.release_date : item.first_air_date;
}

function genreNames(ids: number[] | undefined, mediaType: Extract<CatalogMediaType, 'movie' | 'series'>) {
  const map = mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES;
  return (ids || []).map(id => map[id]).filter((value): value is string => Boolean(value));
}

function genreIds(names: string[] | undefined, mediaType: Extract<CatalogMediaType, 'movie' | 'series'>) {
  if (!names?.length) return undefined;
  const map = mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES;
  const reverse = new Map(Object.entries(map).map(([id, name]) => [name.toLowerCase(), id]));
  const ids = names
    .map(name => reverse.get(name.toLowerCase()))
    .filter((value): value is string => Boolean(value));
  return ids.length ? ids.join(',') : undefined;
}

function mapSearchResult(
  item: TmdbSearchItem,
  mediaType: Extract<CatalogMediaType, 'movie' | 'series'>,
): CatalogSearchResult {
  return {
    provider: 'tmdb',
    externalId: String(item.id),
    mediaType,
    title: titleFor(item, mediaType),
    englishTitle: titleFor(item, mediaType),
    originalTitle: originalTitleFor(item, mediaType) || undefined,
    nativeTitle: originalTitleFor(item, mediaType) || undefined,
    image: imageUrl(item.poster_path),
    backdrop: imageUrl(item.backdrop_path, 'w1280'),
    synopsis: item.overview?.trim() || undefined,
    year: yearFrom(releaseDateFor(item, mediaType)),
    startDate: releaseDateFor(item, mediaType) || undefined,
    unitLabel: 'episodes',
    rating: item.vote_average || undefined,
    popularity: item.popularity || undefined,
    genres: genreNames(item.genre_ids, mediaType),
    originalLanguage: item.original_language || undefined,
    catalogUrl: `https://www.themoviedb.org/${mediaType === 'movie' ? 'movie' : 'tv'}/${item.id}`,
  };
}

async function requestTmdb<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(`${TMDB_API_URL}${path}`);
  url.searchParams.set('api_key', getApiKey());
  url.searchParams.set('language', 'en-US');

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new CatalogApiError('TMDB could not be reached. Check your connection and try again.', 'network');
  }

  if (response.status === 401) {
    throw new CatalogApiError('The configured TMDB API key is invalid.', 'missing_key');
  }
  if (response.status === 404) {
    throw new CatalogApiError('This TMDB title could not be found.', 'not_found');
  }
  if (response.status === 429) {
    throw new CatalogApiError('TMDB is rate-limiting requests. Try again shortly.', 'rate_limited');
  }
  if (!response.ok) {
    throw new CatalogApiError(`TMDB returned ${response.status}.`, 'network');
  }

  return (await response.json()) as T;
}

function providerRows(details: TmdbDetails) {
  const region = details['watch/providers']?.results?.PH;
  if (!region) return [];

  const rows: Array<{
    type: 'subscription' | 'free' | 'ads' | 'rent' | 'buy';
    values?: TmdbProvider[];
  }> = [
    { type: 'subscription', values: region.flatrate },
    { type: 'free', values: region.free },
    { type: 'ads', values: region.ads },
    { type: 'rent', values: region.rent },
    { type: 'buy', values: region.buy },
  ];

  const seen = new Set<string>();
  return rows.flatMap(row =>
    (row.values || []).flatMap(provider => {
      const name = provider.provider_name?.trim();
      if (!name) return [];
      const key = `${row.type}:${name}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        name,
        logo: imageUrl(provider.logo_path, 'w92'),
        type: row.type,
        link: region.link,
      }];
    }),
  );
}

function availableTvEpisodes(details: TmdbDetails) {
  const latest = details.last_episode_to_air;
  if (!latest?.season_number || !latest.episode_number) return undefined;

  const priorSeasons = (details.seasons || [])
    .filter(season =>
      Number(season.season_number || 0) > 0 &&
      Number(season.season_number || 0) < Number(latest.season_number),
    )
    .reduce((sum, season) => sum + Math.max(0, Number(season.episode_count || 0)), 0);

  return priorSeasons + Math.max(0, Number(latest.episode_number));
}

function seasonSummaries(details: TmdbDetails) {
  return (details.seasons || [])
    .filter(season => Number(season.season_number || 0) > 0)
    .map(season => ({
      seasonNumber: Number(season.season_number || 0),
      name: season.name || `Season ${season.season_number}`,
      episodeCount: Number(season.episode_count || 0),
      airDate: season.air_date || undefined,
      poster: imageUrl(season.poster_path),
    }));
}

function releaseEventsForSeason(
  catalogId: string,
  season: TmdbSeasonDetails,
): MediaReleaseEvent[] {
  const seasonNumber = Number(season.season_number || 0);
  if (!Number.isInteger(seasonNumber) || seasonNumber <= 0) return [];

  return (season.episodes || []).flatMap(episode => {
    const episodeNumber = Number(episode.episode_number || 0);
    const date = episode.air_date || '';
    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return [];
    }
    return [{
      id: `tmdb:${catalogId}:s${seasonNumber}:e${episodeNumber}`,
      source: 'tmdb' as const,
      seasonNumber,
      unitNumber: episodeNumber,
      date,
      precision: 'date' as const,
    }];
  });
}

function sortValue(
  value: string | undefined,
  mediaType: Extract<CatalogMediaType, 'movie' | 'series'>,
) {
  switch (value) {
    case 'score': return 'vote_average.desc';
    case 'newest': return mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
    case 'oldest': return mediaType === 'movie' ? 'primary_release_date.asc' : 'first_air_date.asc';
    case 'title': return mediaType === 'movie' ? 'original_title.asc' : 'original_name.asc';
    case 'popular':
    case 'favorites':
    case 'trending':
    default: return 'popularity.desc';
  }
}

function discoverDateKey(mediaType: Extract<CatalogMediaType, 'movie' | 'series'>, suffix: string) {
  return mediaType === 'movie' ? `primary_release_date.${suffix}` : `first_air_date.${suffix}`;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function tmdbPreset(
  request: CatalogBrowseRequest,
  mediaType: Extract<CatalogMediaType, 'movie' | 'series'>,
) {
  const preset = request.preset;

  if (preset === 'trending') {
    return {
      path: `/trending/${mediaType === 'movie' ? 'movie' : 'tv'}/week`,
      params: {},
    };
  }

  if (mediaType === 'movie') {
    if (preset === 'popular') return { path: '/movie/popular', params: { region: 'PH' } };
    if (preset === 'nowPlaying') return { path: '/movie/now_playing', params: { region: 'PH' } };
    if (preset === 'upcoming') return { path: '/movie/upcoming', params: { region: 'PH' } };
    if (preset === 'topRated') return { path: '/movie/top_rated', params: { region: 'PH' } };
  } else {
    if (preset === 'popular') return { path: '/tv/popular', params: {} };
    if (preset === 'onAir') return { path: '/tv/on_the_air', params: {} };
    if (preset === 'topRated') return { path: '/tv/top_rated', params: {} };
  }

  return null;
}

export function getTmdbGenreOptions(
  mediaType: Extract<CatalogMediaType, 'movie' | 'series'>,
) {
  const map = mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES;
  return Object.values(map).sort();
}

export async function searchTmdb(
  query: string,
  mediaType: Extract<CatalogMediaType, 'movie' | 'series'>,
  page = 1,
  signal?: AbortSignal,
): Promise<CatalogSearchPage> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery.length < 2) return { results: [], page: 1, hasNextPage: false };
  const payload = await requestTmdb<{
    page?: number;
    total_pages?: number;
    total_results?: number;
    results?: TmdbSearchItem[];
  }>(
    mediaType === 'movie' ? '/search/movie' : '/search/tv',
    { query: normalizedQuery, page, include_adult: false, region: 'PH' },
    signal,
  );

  return {
    results: (payload.results || []).map(item => mapSearchResult(item, mediaType)),
    page: payload.page || page,
    hasNextPage: (payload.page || page) < (payload.total_pages || 1),
    totalResults: payload.total_results,
  };
}

export async function browseTmdb(
  request: CatalogBrowseRequest,
  signal?: AbortSignal,
): Promise<CatalogSearchPage> {
  const mediaType = request.mediaType === 'movie' ? 'movie' : 'series';
  const filters = request.filters || {};
  const page = request.page || filters.page || 1;

  const normalizedQuery = filters.query ? normalizeSearchQuery(filters.query) : '';
  if (normalizedQuery) {
    const searched = await searchTmdb(normalizedQuery, mediaType, page, signal);
    const filtered = searched.results.filter(item => {
      if (filters.year && item.year !== filters.year) return false;
      if (filters.genres?.length && !filters.genres.every(genre => item.genres?.includes(genre))) {
        return false;
      }
      if (filters.originalLanguage && item.originalLanguage !== filters.originalLanguage) return false;
      if (filters.minScore && Number(item.rating || 0) < filters.minScore) return false;
      return true;
    });
    return { ...searched, results: filtered };
  }

  const preset = tmdbPreset(request, mediaType);
  if (preset) {
    const payload = await requestTmdb<{
      page?: number;
      total_pages?: number;
      total_results?: number;
      results?: TmdbSearchItem[];
    }>(preset.path, { ...preset.params, page }, signal);

    return {
      results: (payload.results || []).map(item => mapSearchResult(item, mediaType)),
      page: payload.page || page,
      hasNextPage: (payload.page || page) < (payload.total_pages || 1),
      totalResults: payload.total_results,
    };
  }

  const params: Record<string, string | number | boolean | undefined> = {
    page,
    include_adult: false,
    include_null_first_air_dates: mediaType === 'series' ? false : undefined,
    region: 'PH',
    sort_by: sortValue(filters.sort, mediaType),
    with_genres: genreIds(filters.genres, mediaType),
    with_original_language: filters.originalLanguage,
    'vote_average.gte': filters.minScore,
  };

  if (filters.year) {
    if (mediaType === 'movie') params.primary_release_year = filters.year;
    else params.first_air_date_year = filters.year;
  }

  if (filters.startDateGreater) {
    const value = String(filters.startDateGreater);
    params[discoverDateKey(mediaType, 'gte')] = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  if (filters.startDateLesser) {
    const value = String(filters.startDateLesser);
    params[discoverDateKey(mediaType, 'lte')] = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  if (request.preset === 'popularDrama' || request.preset === 'dramaMovies') {
    params.with_genres = mediaType === 'movie' ? '18' : '18';
    params['vote_count.gte'] = 50;
  }

  if (request.preset === 'koreanDrama') {
    params.with_genres = '18';
    params.with_original_language = 'ko';
    params['vote_count.gte'] = 20;
  }

  if (request.preset === 'japaneseDrama') {
    params.with_genres = '18';
    params.with_original_language = 'ja';
    params['vote_count.gte'] = 20;
  }

  if (request.preset === 'chineseDrama') {
    params.with_genres = '18';
    params.with_original_language = 'zh';
    params['vote_count.gte'] = 20;
  }

  if (filters.releaseStatus === 'upcoming') {
    params[discoverDateKey(mediaType, 'gte')] = isoToday();
  }

  if (filters.releaseStatus === 'finished') {
    params[discoverDateKey(mediaType, 'lte')] = isoToday();
  }

  const payload = await requestTmdb<{
    page?: number;
    total_pages?: number;
    total_results?: number;
    results?: TmdbSearchItem[];
  }>(
    mediaType === 'movie' ? '/discover/movie' : '/discover/tv',
    params,
    signal,
  );

  return {
    results: (payload.results || []).map(item => mapSearchResult(item, mediaType)),
    page: payload.page || page,
    hasNextPage: (payload.page || page) < (payload.total_pages || 1),
    totalResults: payload.total_results,
  };
}

export async function getTmdbDetails(
  externalId: string,
  mediaType: Extract<CatalogMediaType, 'movie' | 'series'>,
  signal?: AbortSignal,
): Promise<CatalogMediaDetails> {
  const id = Number(externalId);
  if (!Number.isInteger(id)) {
    throw new CatalogApiError('Invalid TMDB ID.', 'not_found');
  }

  const path = mediaType === 'movie' ? `/movie/${id}` : `/tv/${id}`;
  const details = await requestTmdb<TmdbDetails>(
    path,
    { append_to_response: 'watch/providers' },
    signal,
  );

  const base = mapSearchResult(details, mediaType);
  const genres = (details.genres || [])
    .map(genre => genre.name)
    .filter((value): value is string => Boolean(value));
  const nextEpisodeDate = details.next_episode_to_air?.air_date || undefined;
  let releaseEvents: MediaReleaseEvent[] = [];
  let releaseScheduleAuthoritative = false;

  if (mediaType === 'series') {
    const relevantSeason = details.next_episode_to_air?.season_number || details.last_episode_to_air?.season_number;
    if (relevantSeason && relevantSeason > 0) {
      try {
        const season = await requestTmdb<TmdbSeasonDetails>(
          `/tv/${id}/season/${relevantSeason}`,
          {},
          signal,
        );
        releaseEvents = releaseEventsForSeason(String(id), season);
        releaseScheduleAuthoritative = true;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        // The base TV details response still provides the legacy next-release fallback.
      }
    }
  }

  const nextEpisode = details.next_episode_to_air;
  if (nextEpisode?.air_date && nextEpisode.episode_number && nextEpisode.season_number) {
    const fallbackId = `tmdb:${id}:s${nextEpisode.season_number}:e${nextEpisode.episode_number}`;
    if (!releaseEvents.some(event => event.id === fallbackId)) {
      releaseEvents.push({
        id: fallbackId,
        source: 'tmdb',
        seasonNumber: nextEpisode.season_number,
        unitNumber: nextEpisode.episode_number,
        date: nextEpisode.air_date,
        precision: 'date',
      });
    }
  }

  return {
    ...base,
    title: titleFor(details, mediaType),
    originalTitle: originalTitleFor(details, mediaType) || undefined,
    synopsis: details.overview?.trim() || undefined,
    image: imageUrl(details.poster_path),
    backdrop: imageUrl(details.backdrop_path, 'w1280'),
    year: yearFrom(releaseDateFor(details, mediaType)),
    sourceStatus: mapStatus(details.status),
    totalUnits: mediaType === 'movie' ? 1 : details.number_of_episodes || undefined,
    unitLabel: 'episodes',
    totalSeasons: mediaType === 'series' ? details.number_of_seasons || undefined : undefined,
    availableUnits: mediaType === 'movie' ? 1 : availableTvEpisodes(details),
    nextEpisodeNumber: details.next_episode_to_air?.episode_number || undefined,
    nextEpisodeDate,
    releaseEvents,
    releaseScheduleAuthoritative,
    rating: details.vote_average || undefined,
    popularity: details.popularity || undefined,
    genres,
    seasons: mediaType === 'series' ? seasonSummaries(details) : undefined,
    watchProviders: providerRows(details),
    countryOfOrigin:
      details.origin_country?.[0] ||
      details.production_countries?.[0]?.iso_3166_1 ||
      undefined,
    runtimeMinutes:
      details.runtime ||
      details.episode_run_time?.find(value => Number(value) > 0) ||
      undefined,
    catalogUrl: `https://www.themoviedb.org/${mediaType === 'movie' ? 'movie' : 'tv'}/${id}`,
    relations:
      mediaType === 'movie' && details.belongs_to_collection?.id
        ? [{
            provider: 'tmdb',
            externalId: String(details.belongs_to_collection.id),
            relation: 'other',
            title: details.belongs_to_collection.name || 'Collection',
            type: 'movie',
            image: imageUrl(details.belongs_to_collection.poster_path),
            catalogUrl: `https://www.themoviedb.org/collection/${details.belongs_to_collection.id}`,
          }]
        : undefined,
  };
}
