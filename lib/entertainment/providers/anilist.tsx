import type {
  CatalogBrowseRequest,
  CatalogMediaDetails,
  CatalogMediaType,
  CatalogSearchPage,
  CatalogSearchResult,
  CatalogSort,
} from '@/lib/entertainment/types';
import { CatalogApiError } from '@/lib/entertainment/types';
import type { MediaReleaseEvent } from '@/lib/types';

const ANILIST_URL = 'https://graphql.anilist.co';

const MEDIA_FIELDS = `
  id
  siteUrl
  title { romaji english native }
  synonyms
  type
  format
  status
  episodes
  chapters
  volumes
  duration
  season
  seasonYear
  startDate { year month day }
  description(asHtml: false)
  coverImage { extraLarge large medium color }
  bannerImage
  genres
  averageScore
  popularity
  favourites
  trending
  countryOfOrigin
  nextAiringEpisode { episode airingAt }
`;

const DETAILS_MEDIA_FIELDS = `
  ${MEDIA_FIELDS}
  airingSchedule(page: 1, perPage: 25) {
    nodes { id episode airingAt }
  }
`;

const SEARCH_QUERY = `
  query SearchCatalog($search: String!, $type: MediaType!, $page: Int!) {
    Page(page: $page, perPage: 20) {
      pageInfo { currentPage hasNextPage total }
      media(search: $search, type: $type, sort: SEARCH_MATCH, isAdult: false) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;


type BrowseQueryInput = {
  page: number;
  perPage: number;
  type: 'ANIME' | 'MANGA';
  search?: string;
  season?: string;
  seasonYear?: number;
  formats?: string[];
  status?: string;
  genres?: string[];
  startDateGreater?: number;
  startDateLesser?: number;
  sort: string[];
  averageScoreGreater?: number;
  isAdult: boolean;
};

function buildBrowseQuery(input: BrowseQueryInput) {
  const declarations = [
    '$page: Int!',
    '$perPage: Int!',
    '$type: MediaType!',
    '$sort: [MediaSort]!',
    '$isAdult: Boolean!',
  ];

  const argumentsList = [
    'type: $type',
    'sort: $sort',
    'isAdult: $isAdult',
  ];

  const variables: Record<string, unknown> = {
    page: input.page,
    perPage: input.perPage,
    type: input.type,
    sort: input.sort,
    isAdult: input.isAdult,
  };

  const add = (
    variableName: string,
    graphqlType: string,
    argumentName: string,
    value: unknown,
  ) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;

    declarations.push(`$${variableName}: ${graphqlType}`);
    argumentsList.push(`${argumentName}: $${variableName}`);
    variables[variableName] = value;
  };

  add('search', 'String', 'search', input.search);
  add('season', 'MediaSeason', 'season', input.season);
  add('seasonYear', 'Int', 'seasonYear', input.seasonYear);
  add('formats', '[MediaFormat]', 'format_in', input.formats);
  add('status', 'MediaStatus', 'status', input.status);
  add('genres', '[String]', 'genre_in', input.genres);
  add(
    'startDateGreater',
    'FuzzyDateInt',
    'startDate_greater',
    input.startDateGreater,
  );
  add(
    'startDateLesser',
    'FuzzyDateInt',
    'startDate_lesser',
    input.startDateLesser,
  );
  add(
    'averageScoreGreater',
    'Int',
    'averageScore_greater',
    input.averageScoreGreater,
  );

  const query = `
    query BrowseCatalog(
      ${declarations.join('\n      ')}
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { currentPage hasNextPage total }
        media(
          ${argumentsList.join('\n          ')}
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  return { query, variables };
}

const DETAILS_QUERY = `
  query CatalogDetails($id: Int!, $type: MediaType!) {
    Media(id: $id, type: $type) {
      ${DETAILS_MEDIA_FIELDS}
      relations {
        edges {
          relationType
          node {
            id
            siteUrl
            title { romaji english native }
            type
            format
            status
            episodes
            chapters
            coverImage { large medium }
          }
        }
      }
    }
  }
`;

const GENRE_QUERY = `
  query GenreCollection {
    GenreCollection
  }
`;

type AniListTitle = {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
};

type AniListMedia = {
  id: number;
  siteUrl?: string | null;
  title?: AniListTitle | null;
  synonyms?: string[] | null;
  type?: 'ANIME' | 'MANGA' | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  duration?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  startDate?: {
    year?: number | null;
    month?: number | null;
    day?: number | null;
  } | null;
  description?: string | null;
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
    color?: string | null;
  } | null;
  bannerImage?: string | null;
  genres?: string[] | null;
  averageScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  trending?: number | null;
  countryOfOrigin?: string | null;
  nextAiringEpisode?: {
    episode?: number | null;
    airingAt?: number | null;
  } | null;
  airingSchedule?: {
    nodes?: Array<{
      id?: number | null;
      episode?: number | null;
      airingAt?: number | null;
    } | null> | null;
  } | null;
  relations?: {
    edges?: Array<{
      relationType?: string | null;
      node?: AniListMedia | null;
    }> | null;
  } | null;
};

function cleanDescription(value?: string | null) {
  if (!value) return undefined;
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function titleFor(media: AniListMedia) {
  return (
    media.title?.english ||
    media.title?.romaji ||
    media.title?.native ||
    'Untitled'
  );
}

function releaseEventsFor(media: AniListMedia, includeSchedule: boolean): MediaReleaseEvent[] {
  if (!includeSchedule) return [];

  const events = (media.airingSchedule?.nodes || []).flatMap(node => {
    if (!node?.airingAt || !node.episode) return [];
    return [{
      id: node.id
        ? `anilist:${node.id}`
        : `anilist:${media.id}:${node.episode}:${node.airingAt}`,
      source: 'anilist' as const,
      unitNumber: node.episode,
      date: new Date(node.airingAt * 1000).toISOString(),
      precision: 'timestamp' as const,
    }];
  });

  const next = media.nextAiringEpisode;
  if (next?.airingAt && next.episode && !events.some(event => event.unitNumber === next.episode)) {
    events.push({
      id: `anilist:${media.id}:next:${next.episode}`,
      source: 'anilist',
      unitNumber: next.episode,
      date: new Date(next.airingAt * 1000).toISOString(),
      precision: 'timestamp',
    });
  }

  return events;
}

function mapStatus(value?: string | null) {
  switch (value) {
    case 'RELEASING':
      return 'airing' as const;
    case 'NOT_YET_RELEASED':
      return 'upcoming' as const;
    case 'FINISHED':
      return 'finished' as const;
    case 'CANCELLED':
      return 'cancelled' as const;
    case 'HIATUS':
      return 'hiatus' as const;
    default:
      return 'unknown' as const;
  }
}

function mapSeason(value?: string | null) {
  if (!value) return undefined;
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function mapMediaType(value?: string | null): CatalogMediaType {
  return value === 'MANGA' ? 'manga' : 'anime';
}

function totalUnits(media: AniListMedia) {
  return media.type === 'MANGA'
    ? media.chapters || undefined
    : media.episodes || undefined;
}

function unitLabel(media: AniListMedia) {
  return media.type === 'MANGA' ? ('chapters' as const) : ('episodes' as const);
}

function availableUnits(media: AniListMedia) {
  if (media.type === 'MANGA') return undefined;

  const beforeNext = media.nextAiringEpisode?.episode
    ? Math.max(0, media.nextAiringEpisode.episode - 1)
    : 0;

  if (beforeNext) return beforeNext;
  if (media.status === 'FINISHED') return media.episodes || undefined;
  return undefined;
}

function alternateTitles(media: AniListMedia) {
  return Array.from(
    new Set(
      [
        media.title?.romaji,
        media.title?.english,
        media.title?.native,
        ...(media.synonyms || []),
      ].filter((value): value is string => Boolean(value?.trim())),
    ),
  ).filter(value => value !== titleFor(media));
}

function fuzzyDate(value?: AniListMedia['startDate']) {
  if (!value?.year) return undefined;
  const month = String(value.month || 1).padStart(2, '0');
  const day = String(value.day || 1).padStart(2, '0');
  return `${value.year}-${month}-${day}`;
}

function mapSearchResult(media: AniListMedia): CatalogSearchResult {
  return {
    provider: 'anilist',
    externalId: String(media.id),
    mediaType: mapMediaType(media.type),
    title: titleFor(media),
    englishTitle: media.title?.english || undefined,
    romajiTitle: media.title?.romaji || undefined,
    nativeTitle: media.title?.native || undefined,
    originalTitle: media.title?.native || media.title?.romaji || undefined,
    alternateTitles: alternateTitles(media),
    image: media.coverImage?.extraLarge || media.coverImage?.large || undefined,
    backdrop: media.bannerImage || undefined,
    accentColor: media.coverImage?.color || undefined,
    synopsis: cleanDescription(media.description),
    year: media.seasonYear || media.startDate?.year || undefined,
    season: mapSeason(media.season),
    sourceStatus: mapStatus(media.status),
    totalUnits: totalUnits(media),
    unitLabel: unitLabel(media),
    rating: media.averageScore ? media.averageScore / 10 : undefined,
    popularity: media.popularity || undefined,
    favorites: media.favourites || undefined,
    trending: media.trending || undefined,
    genres: media.genres || [],
    format: media.format || undefined,
    catalogUrl: media.siteUrl || undefined,
    startDate: fuzzyDate(media.startDate),
    originalLanguage: media.countryOfOrigin || undefined,
    nextEpisodeNumber: media.nextAiringEpisode?.episode || undefined,
    nextEpisodeAt: media.nextAiringEpisode?.airingAt
      ? new Date(media.nextAiringEpisode.airingAt * 1000).toISOString()
      : undefined,
  };
}

function relationName(value?: string | null) {
  switch (value) {
    case 'PREQUEL':
      return 'prequel' as const;
    case 'SEQUEL':
      return 'sequel' as const;
    case 'SIDE_STORY':
      return 'side_story' as const;
    case 'SPIN_OFF':
      return 'spin_off' as const;
    case 'ADAPTATION':
      return 'adaptation' as const;
    default:
      return 'other' as const;
  }
}

function mapSort(value?: CatalogSort) {
  switch (value) {
    case 'popular':
      return ['POPULARITY_DESC', 'SCORE_DESC'];
    case 'score':
      return ['SCORE_DESC', 'POPULARITY_DESC'];
    case 'newest':
      return ['START_DATE_DESC', 'POPULARITY_DESC'];
    case 'oldest':
      return ['START_DATE', 'POPULARITY_DESC'];
    case 'title':
      return ['TITLE_ROMAJI'];
    case 'favorites':
      return ['FAVOURITES_DESC', 'POPULARITY_DESC'];
    case 'trending':
    default:
      return ['TRENDING_DESC', 'POPULARITY_DESC'];
  }
}

function mapReleaseStatus(value?: string) {
  switch (value) {
    case 'airing': return 'RELEASING';
    case 'finished': return 'FINISHED';
    case 'upcoming': return 'NOT_YET_RELEASED';
    case 'cancelled': return 'CANCELLED';
    case 'hiatus': return 'HIATUS';
    default: return undefined;
  }
}

async function requestAniList<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {
      throw error;
    }

    throw new CatalogApiError(
      'AniList could not be reached. Check your connection and try again.',
      'network',
    );
  }

  let payload: {
    data?: T;
    errors?: Array<{
      message?: string;
      status?: number;
      locations?: Array<{
        line?: number;
        column?: number;
      }>;
    }>;
  } = {};

  try {
    payload = await response.json();
  } catch {
    // The status fallback below will handle non-JSON responses.
  }

  const apiMessage =
    payload.errors
      ?.map(error => error.message)
      .filter(Boolean)
      .join(' ') || '';

  if (
    response.status === 429 ||
    payload.errors?.some(error => error.status === 429)
  ) {
    throw new CatalogApiError(
      apiMessage ||
        'AniList is rate-limiting requests. Try again shortly.',
      'rate_limited',
    );
  }

  if (response.status === 404) {
    throw new CatalogApiError(
      apiMessage ||
        'This AniList title could not be found.',
      'not_found',
    );
  }

  if (!response.ok) {
    throw new CatalogApiError(
      apiMessage ||
        `AniList returned ${response.status}.`,
      'invalid_response',
    );
  }

  if (!payload.data || payload.errors?.length) {
    throw new CatalogApiError(
      apiMessage ||
        'AniList returned an invalid response.',
      'invalid_response',
    );
  }

  return payload.data;
}

export async function searchAniList(
  query: string,
  mediaType: Extract<CatalogMediaType, 'anime' | 'manga'>,
  page = 1,
  signal?: AbortSignal,
): Promise<CatalogSearchPage> {
  const data = await requestAniList<{
    Page: {
      pageInfo?: { currentPage?: number; hasNextPage?: boolean; total?: number };
      media?: AniListMedia[];
    };
  }>(
    SEARCH_QUERY,
    {
      search: query,
      type: mediaType === 'manga' ? 'MANGA' : 'ANIME',
      page,
    },
    signal,
  );

  return {
    results: (data.Page.media || []).map(mapSearchResult),
    page: data.Page.pageInfo?.currentPage || page,
    hasNextPage: Boolean(data.Page.pageInfo?.hasNextPage),
    totalResults: data.Page.pageInfo?.total,
  };
}

export async function browseAniList(
  request: CatalogBrowseRequest,
  signal?: AbortSignal,
): Promise<CatalogSearchPage> {
  const mediaType = request.mediaType === 'manga' ? 'MANGA' : 'ANIME';
  const filters = request.filters || {};
  const page = request.page || filters.page || 1;
  const perPage = Math.max(
    1,
    Math.min(50, request.perPage || filters.perPage || 20),
  );
  const year = filters.year;

  const startDateGreater =
    filters.startDateGreater ??
    (year && !filters.season ? year * 10000 : undefined);

  const startDateLesser =
    filters.startDateLesser ??
    (year && !filters.season ? (year + 1) * 10000 : undefined);

  const averageScoreGreater = filters.minScore
    ? Math.max(0, Math.round(filters.minScore * 10) - 1)
    : undefined;

  const operation = buildBrowseQuery({
    page,
    perPage,
    type: mediaType,
    search: filters.query?.trim() || undefined,
    season: filters.season || undefined,
    seasonYear:
      filters.season && year ? year : undefined,
    formats: filters.formats?.length
      ? filters.formats
      : undefined,
    status: mapReleaseStatus(filters.releaseStatus),
    genres: filters.genres?.length
      ? filters.genres
      : undefined,
    startDateGreater,
    startDateLesser,
    sort: mapSort(filters.sort),
    averageScoreGreater,
    isAdult: false,
  });

  const data = await requestAniList<{
    Page: {
      pageInfo?: {
        currentPage?: number;
        hasNextPage?: boolean;
        total?: number;
      };
      media?: AniListMedia[];
    };
  }>(operation.query, operation.variables, signal);

  return {
    results: (data.Page.media || []).map(mapSearchResult),
    page: data.Page.pageInfo?.currentPage || page,
    hasNextPage: Boolean(data.Page.pageInfo?.hasNextPage),
    totalResults: data.Page.pageInfo?.total,
  };
}

export async function getAniListGenres(signal?: AbortSignal) {
  const data = await requestAniList<{ GenreCollection?: string[] }>(
    GENRE_QUERY,
    {},
    signal,
  );
  return (data.GenreCollection || []).filter(Boolean).sort();
}

export async function getAniListDetails(
  externalId: string,
  mediaType: Extract<CatalogMediaType, 'anime' | 'manga'>,
  signal?: AbortSignal,
): Promise<CatalogMediaDetails> {
  const id = Number(externalId);
  if (!Number.isInteger(id)) {
    throw new CatalogApiError('Invalid AniList ID.', 'not_found');
  }

  const data = await requestAniList<{ Media: AniListMedia }>(
    DETAILS_QUERY,
    {
      id,
      type: mediaType === 'manga' ? 'MANGA' : 'ANIME',
    },
    signal,
  );

  const media = data.Media;
  const base = mapSearchResult(media);

  return {
    ...base,
    availableUnits: availableUnits(media),
    nextEpisodeNumber: media.nextAiringEpisode?.episode || undefined,
    nextEpisodeAt: media.nextAiringEpisode?.airingAt
      ? new Date(media.nextAiringEpisode.airingAt * 1000).toISOString()
      : undefined,
    releaseEvents: releaseEventsFor(media, mediaType === 'anime'),
    releaseScheduleAuthoritative: mediaType === 'anime',
    countryOfOrigin: media.countryOfOrigin || undefined,
    runtimeMinutes: media.duration || undefined,
    relations: (media.relations?.edges || [])
      .filter(edge => edge.node)
      .map(edge => ({
        provider: 'anilist' as const,
        externalId: String(edge.node!.id),
        relation: relationName(edge.relationType),
        title: titleFor(edge.node!),
        type: mapMediaType(edge.node!.type),
        image: edge.node!.coverImage?.large || edge.node!.coverImage?.medium || undefined,
        catalogUrl: edge.node!.siteUrl || undefined,
      })),
  };
}
