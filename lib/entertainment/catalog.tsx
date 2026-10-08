import type { MediaItem } from '@/lib/types';
import type {
  CatalogBrowseFilters,
  CatalogBrowseRequest,
  CatalogMediaDetails,
  CatalogMediaType,
  CatalogSearchPage,
  CatalogSearchResult,
  CatalogSeason,
  CatalogSyncPatch,
  DiscoverSectionDescriptor,
  DiscoverSectionKey,
} from '@/lib/entertainment/types';
import {
  browseAniList,
  getAniListDetails,
  getAniListGenres,
  searchAniList,
} from '@/lib/entertainment/providers/anilist';
import {
  browseTmdb,
  getTmdbDetails,
  getTmdbGenreOptions,
  searchTmdb,
} from '@/lib/entertainment/providers/tmdb';
import { mergeReleaseHistory } from '@/lib/entertainment/derived';

const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();
const SEARCH_TTL = 6 * 60 * 60 * 1000;
const DETAILS_TTL = 6 * 60 * 60 * 1000;
const GENRE_TTL = 7 * 24 * 60 * 60 * 1000;

function cacheKey(parts: Array<string | number | undefined>) {
  return parts.filter(value => value !== undefined).join(':').toLowerCase();
}

function getCached<T>(key: string): T | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttl: number) {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttl });
}

function compactFilters(filters?: CatalogBrowseFilters) {
  if (!filters) return '';
  return JSON.stringify({
    ...filters,
    genres: [...(filters.genres || [])].sort(),
    formats: [...(filters.formats || [])].sort(),
  });
}

export async function searchCatalog(
  query: string,
  mediaType: CatalogMediaType,
  page = 1,
  signal?: AbortSignal,
): Promise<CatalogSearchPage> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { results: [], page: 1, hasNextPage: false };

  const key = cacheKey(['search', mediaType, page, trimmed]);
  const cached = getCached<CatalogSearchPage>(key);
  if (cached) return cached;

  const result = mediaType === 'anime' || mediaType === 'manga'
    ? await searchAniList(trimmed, mediaType, page, signal)
    : await searchTmdb(trimmed, mediaType, page, signal);

  setCached(key, result, SEARCH_TTL);
  return result;
}

export async function browseCatalog(
  request: CatalogBrowseRequest,
  signal?: AbortSignal,
  force = false,
): Promise<CatalogSearchPage> {
  const page = request.page || request.filters?.page || 1;
  const key = cacheKey([
    'browse',
    request.mediaType,
    request.preset,
    page,
    request.perPage,
    compactFilters(request.filters),
  ]);

  if (!force) {
    const cached = getCached<CatalogSearchPage>(key);
    if (cached) return cached;
  }

  const result = request.mediaType === 'anime' || request.mediaType === 'manga'
    ? await browseAniList(request, signal)
    : await browseTmdb(request, signal);

  setCached(key, result, SEARCH_TTL);
  return result;
}

export async function getCatalogGenreOptions(
  mediaType: CatalogMediaType,
  signal?: AbortSignal,
) {
  const key = cacheKey(['genres', mediaType]);
  const cached = getCached<string[]>(key);
  if (cached) return cached;

  const genres = mediaType === 'anime' || mediaType === 'manga'
    ? await getAniListGenres(signal)
    : getTmdbGenreOptions(mediaType);

  setCached(key, genres, GENRE_TTL);
  return genres;
}

export async function getCatalogDetails(
  item: Pick<CatalogSearchResult, 'provider' | 'externalId' | 'mediaType'>,
  signal?: AbortSignal,
  force = false,
): Promise<CatalogMediaDetails> {
  const key = cacheKey(['details', item.provider, item.mediaType, item.externalId]);
  if (!force) {
    const cached = getCached<CatalogMediaDetails>(key);
    if (cached) return cached;
  }

  const result = item.provider === 'anilist'
    ? await getAniListDetails(
        item.externalId,
        item.mediaType === 'manga' ? 'manga' : 'anime',
        signal,
      )
    : await getTmdbDetails(
        item.externalId,
        item.mediaType === 'movie' ? 'movie' : 'series',
        signal,
      );

  setCached(key, result, DETAILS_TTL);
  return result;
}

export function getAnimeSeason(date = new Date()): {
  season: CatalogSeason;
  year: number;
} {
  const month = date.getMonth();
  const year = date.getFullYear();

  if (month <= 1) return { season: 'WINTER', year };
  if (month <= 4) return { season: 'SPRING', year };
  if (month <= 7) return { season: 'SUMMER', year };
  if (month <= 10) return { season: 'FALL', year };
  return { season: 'WINTER', year: year + 1 };
}

export function getNextAnimeSeason(date = new Date()): {
  season: CatalogSeason;
  year: number;
} {
  const current = getAnimeSeason(date);
  if (current.season === 'WINTER') return { season: 'SPRING', year: current.year };
  if (current.season === 'SPRING') return { season: 'SUMMER', year: current.year };
  if (current.season === 'SUMMER') return { season: 'FALL', year: current.year };
  return { season: 'WINTER', year: current.year + 1 };
}

function dateToFuzzyInt(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return Number(`${year}${month}${day}`);
}

function descriptor(
  key: DiscoverSectionKey,
  title: string,
  description: string,
  request: CatalogBrowseRequest,
): DiscoverSectionDescriptor {
  return { key, title, description, request };
}

export function getDiscoverSectionOptions(
  mediaType: CatalogMediaType,
  date = new Date(),
): DiscoverSectionDescriptor[] {
  const current = getAnimeSeason(date);
  const next = getNextAnimeSeason(date);
  const currentLabel = `${current.season.charAt(0)}${current.season.slice(1).toLowerCase()} ${current.year}`;
  const nextLabel = `${next.season.charAt(0)}${next.season.slice(1).toLowerCase()} ${next.year}`;
  const ninetyDaysAgo = new Date(date);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  if (mediaType === 'anime') {
    return [
      descriptor('trending', 'Trending Now', 'The anime drawing the most attention right now.', {
        mediaType,
        preset: 'trending',
        filters: { sort: 'trending' },
      }),
      descriptor('popularSeason', `Popular ${currentLabel}`, 'The most popular anime from the current season.', {
        mediaType,
        preset: 'popularSeason',
        filters: { season: current.season, year: current.year, sort: 'popular' },
      }),
      descriptor('newPopular', 'New & Popular', 'Recent releases with strong audience interest.', {
        mediaType,
        preset: 'newPopular',
        filters: { startDateGreater: dateToFuzzyInt(ninetyDaysAgo), sort: 'popular' },
      }),
      descriptor('airing', 'Currently Airing', 'Series releasing new episodes this season.', {
        mediaType,
        preset: 'airing',
        filters: {
          season: current.season,
          year: current.year,
          releaseStatus: 'airing',
          sort: 'trending',
        },
      }),
      descriptor('upcoming', `Upcoming ${nextLabel}`, 'Popular anime announced for the next season.', {
        mediaType,
        preset: 'upcoming',
        filters: {
          season: next.season,
          year: next.year,
          releaseStatus: 'upcoming',
          sort: 'popular',
        },
      }),
      descriptor('topRated', 'Top Rated', 'Highly rated anime across the catalog.', {
        mediaType,
        preset: 'topRated',
        filters: { sort: 'score' },
      }),
      descriptor('specialFormats', 'Movies, OVAs & Specials', 'Popular anime outside the standard TV format.', {
        mediaType,
        preset: 'specialFormats',
        filters: { formats: ['MOVIE', 'OVA', 'ONA', 'SPECIAL'], sort: 'popular' },
      }),
      descriptor('popularAllTime', 'Most Popular All Time', 'Long-running favorites and widely watched classics.', {
        mediaType,
        preset: 'popularAllTime',
        filters: { sort: 'popular' },
      }),
    ];
  }

  if (mediaType === 'manga') {
    return [
      descriptor('trending', 'Trending Manga', 'Manga drawing the most attention right now.', {
        mediaType,
        preset: 'trending',
        filters: { sort: 'trending' },
      }),
      descriptor('popular', 'Popular Manga', 'Widely read manga across AniList.', {
        mediaType,
        preset: 'popular',
        filters: { sort: 'popular' },
      }),
      descriptor('newPopular', 'New & Popular', 'Recent manga releases gaining momentum.', {
        mediaType,
        preset: 'newPopular',
        filters: { startDateGreater: dateToFuzzyInt(ninetyDaysAgo), sort: 'popular' },
      }),
      descriptor('topRated', 'Top Rated Manga', 'Reader favorites with strong average scores.', {
        mediaType,
        preset: 'topRated',
        filters: { sort: 'score' },
      }),
      descriptor('lightNovels', 'Light Novels', 'Popular novels and light novels.', {
        mediaType,
        preset: 'lightNovels',
        filters: { formats: ['NOVEL'], sort: 'popular' },
      }),
      descriptor('oneShots', 'One-Shots', 'Short standalone manga to finish quickly.', {
        mediaType,
        preset: 'oneShots',
        filters: { formats: ['ONE_SHOT'], sort: 'popular' },
      }),
    ];
  }

  if (mediaType === 'series') {
    return [
      descriptor('trending', 'Trending Series', 'Television series trending this week.', {
        mediaType,
        preset: 'trending',
      }),
      descriptor('popularDrama', 'Popular Dramas', 'Popular drama series from around the world.', {
        mediaType,
        preset: 'popularDrama',
        filters: { genres: ['Drama'], sort: 'popular' },
      }),
      descriptor('onAir', 'On the Air', 'Series with episodes airing now or soon.', {
        mediaType,
        preset: 'onAir',
      }),
      descriptor('topRated', 'Top Rated Series', 'Highly rated television series.', {
        mediaType,
        preset: 'topRated',
      }),
      descriptor('koreanDrama', 'Korean Dramas', 'Popular Korean-language drama series.', {
        mediaType,
        preset: 'koreanDrama',
        filters: { genres: ['Drama'], originalLanguage: 'ko', sort: 'popular' },
      }),
      descriptor('japaneseDrama', 'Japanese Dramas', 'Popular Japanese-language drama series.', {
        mediaType,
        preset: 'japaneseDrama',
        filters: { genres: ['Drama'], originalLanguage: 'ja', sort: 'popular' },
      }),
      descriptor('chineseDrama', 'Chinese Dramas', 'Popular Chinese-language drama series.', {
        mediaType,
        preset: 'chineseDrama',
        filters: { genres: ['Drama'], originalLanguage: 'zh', sort: 'popular' },
      }),
    ];
  }

  return [
    descriptor('trending', 'Trending Movies', 'Movies trending this week.', {
      mediaType,
      preset: 'trending',
    }),
    descriptor('popular', 'Popular Movies', 'Popular movies across TMDB.', {
      mediaType,
      preset: 'popular',
    }),
    descriptor('nowPlaying', 'Now Playing', 'Movies currently showing in cinemas.', {
      mediaType,
      preset: 'nowPlaying',
    }),
    descriptor('upcoming', 'Upcoming Movies', 'Movies scheduled for release soon.', {
      mediaType,
      preset: 'upcoming',
    }),
    descriptor('topRated', 'Top Rated Movies', 'Highly rated films from across the catalog.', {
      mediaType,
      preset: 'topRated',
    }),
    descriptor('dramaMovies', 'Popular Drama Movies', 'Popular films in the drama genre.', {
      mediaType,
      preset: 'dramaMovies',
      filters: { genres: ['Drama'], sort: 'popular' },
    }),
  ];
}

function normalizeSeason(value?: string) {
  if (value === 'Winter' || value === 'Spring' || value === 'Summer' || value === 'Fall') {
    return value;
  }
  return 'Unknown' as const;
}

export function catalogDetailsToMediaPayload(
  details: CatalogMediaDetails,
  user: {
    status: MediaItem['status'];
    progress?: number;
    currentSeason?: number;
    currentEpisode?: number;
    website?: string;
    favorite?: boolean;
    notes?: string;
  },
): Omit<MediaItem, 'id' | 'createdAt'> {
  const initialAvailable = details.availableUnits;

  return {
    title: details.title,
    type: details.mediaType,
    status: user.status,
    episodes: details.unitLabel === 'episodes' ? details.totalUnits : undefined,
    totalUnits: details.totalUnits,
    unitLabel: details.unitLabel,
    year: details.year ? String(details.year) : undefined,
    season: normalizeSeason(details.season),
    progress: Math.max(0, Number(user.progress || 0)),
    currentSeason: user.currentSeason,
    currentEpisode: user.currentEpisode,
    // Provider scores are displayed in the catalog review surface. MediaItem.rating
    // is personal, so catalog scores stay out of the saved record.
    image: details.image,
    backdrop: details.backdrop,
    genre: details.genres?.[0],
    genres: details.genres || [],
    synopsis: details.synopsis,
    notes: user.notes,
    website: user.website,
    favorite: user.favorite,
    catalogProvider: details.provider,
    catalogId: details.externalId,
    catalogUrl: details.catalogUrl,
    canonicalTitle: details.title,
    originalTitle: details.originalTitle,
    alternateTitles: details.alternateTitles || [],
    sourceStatus: details.sourceStatus,
    totalSeasons: details.totalSeasons,
    availableUnits: initialAvailable,
    acknowledgedAvailableUnits: initialAvailable,
    newUnitsAvailable: 0,
    hasNewSeason: false,
    nextEpisodeNumber: details.nextEpisodeNumber,
    nextEpisodeAt: details.nextEpisodeAt ? new Date(details.nextEpisodeAt) : null,
    nextEpisodeDate: details.nextEpisodeDate || null,
    releaseDate: details.mediaType === 'movie' ? details.startDate || null : null,
    releaseHistory: details.releaseEvents || [],
    relations: details.relations || [],
    seasonDetails: details.seasons || [],
    watchProviders: details.watchProviders || [],
    countryOfOrigin: details.countryOfOrigin,
    runtimeMinutes: details.runtimeMinutes,
    lastSyncedAt: new Date(),
    metadataUpdatedAt: new Date(),
  };
}

export async function syncCatalogItem(
  item: MediaItem,
  signal?: AbortSignal,
): Promise<CatalogSyncPatch> {
  if (!item.catalogProvider || item.catalogProvider === 'manual' || !item.catalogId) {
    throw new Error('This title was added manually and has no catalog source.');
  }

  const details = await getCatalogDetails({
    provider: item.catalogProvider,
    externalId: item.catalogId,
    mediaType: item.type,
  }, signal, true);

  const previousAvailable = Math.max(0, Number(item.availableUnits || 0));
  const reportedAvailable = details.availableUnits;
  // AniList and TMDB report cumulative released units. Keep a confirmed high-water
  // count when a later response is sparse or temporarily regresses.
  const nextAvailable = Number.isFinite(reportedAvailable) && Number(reportedAvailable) >= 0
    ? Math.max(previousAvailable, Math.floor(Number(reportedAvailable)))
    : item.availableUnits;
  const acknowledged = item.acknowledgedAvailableUnits == null
    ? previousAvailable
    : Math.max(0, Number(item.acknowledgedAvailableUnits));
  const previousSeasons = Math.max(0, Number(item.totalSeasons || 0));
  const nextSeasons = details.totalSeasons;
  const scheduleIsAuthoritative = Boolean(details.releaseScheduleAuthoritative);

  return {
    title: details.title || item.title,
    originalTitle: details.originalTitle || item.originalTitle,
    alternateTitles: details.alternateTitles?.length ? details.alternateTitles : item.alternateTitles || [],
    image: details.image || item.image,
    backdrop: details.backdrop || item.backdrop,
    synopsis: details.synopsis || item.synopsis,
    year: details.year ? String(details.year) : item.year,
    season: details.season ? normalizeSeason(details.season) : item.season,
    episodes: details.unitLabel === 'episodes' && details.totalUnits != null ? details.totalUnits : item.episodes,
    totalUnits: details.totalUnits ?? item.totalUnits ?? item.episodes,
    unitLabel: details.unitLabel || item.unitLabel,
    rating: details.rating ?? item.rating,
    genre: details.genres?.[0] || item.genre,
    genres: details.genres?.length ? details.genres : item.genres || [],
    sourceStatus: details.sourceStatus ?? item.sourceStatus,
    totalSeasons: nextSeasons ?? item.totalSeasons,
    availableUnits: nextAvailable,
    acknowledgedAvailableUnits: acknowledged,
    newUnitsAvailable:
      nextAvailable == null ? Number(item.newUnitsAvailable || 0) : Math.max(0, nextAvailable - acknowledged),
    hasNewSeason:
      Boolean(item.hasNewSeason) ||
      (nextSeasons != null && previousSeasons > 0 && nextSeasons > previousSeasons),
    nextEpisodeNumber: details.nextEpisodeNumber ?? (scheduleIsAuthoritative ? undefined : item.nextEpisodeNumber),
    nextEpisodeAt: details.nextEpisodeAt
      ? new Date(details.nextEpisodeAt)
      : scheduleIsAuthoritative ? null : item.nextEpisodeAt || null,
    nextEpisodeDate: details.nextEpisodeDate || (scheduleIsAuthoritative ? null : item.nextEpisodeDate || null),
    ...(details.mediaType === 'movie' ? { releaseDate: details.startDate || item.releaseDate || null } : {}),
    releaseHistory: mergeReleaseHistory(item.releaseHistory, details.releaseEvents || [], {
      source: item.catalogProvider === 'tmdb' ? 'tmdb' : 'anilist',
      replaceFuture: Boolean(details.releaseScheduleAuthoritative),
    }),
    relations: details.relations?.length ? details.relations : item.relations || [],
    seasonDetails: details.seasons?.length ? details.seasons : item.seasonDetails || [],
    watchProviders: details.watchProviders?.length ? details.watchProviders : item.watchProviders || [],
    catalogUrl: details.catalogUrl || item.catalogUrl,
    countryOfOrigin: details.countryOfOrigin || item.countryOfOrigin,
    runtimeMinutes: details.runtimeMinutes ?? item.runtimeMinutes,
    lastSyncedAt: new Date(),
    metadataUpdatedAt: new Date(),
  };
}

export function isCatalogDuplicate(
  items: MediaItem[],
  result: Pick<CatalogSearchResult, 'provider' | 'externalId'>,
) {
  return items.some(item =>
    item.catalogProvider === result.provider &&
    item.catalogId === result.externalId,
  );
}
