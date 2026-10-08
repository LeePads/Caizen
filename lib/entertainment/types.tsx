import type {
  MediaCatalogProvider,
  MediaRelation,
  MediaReleaseEvent,
  MediaSeasonSummary,
  MediaSourceStatus,
  MediaType,
  MediaUnitLabel,
  MediaWatchProvider,
} from '@/lib/types';

export type CatalogMediaType = MediaType;
export type CatalogSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
export type CatalogSort =
  | 'trending'
  | 'popular'
  | 'score'
  | 'newest'
  | 'oldest'
  | 'title'
  | 'favorites';
export type CatalogReleaseFilter =
  | 'airing'
  | 'finished'
  | 'upcoming'
  | 'cancelled'
  | 'hiatus';

export type DiscoverSectionKey =
  | 'trending'
  | 'popularSeason'
  | 'newPopular'
  | 'airing'
  | 'upcoming'
  | 'topRated'
  | 'specialFormats'
  | 'popularAllTime'
  | 'popular'
  | 'popularDrama'
  | 'onAir'
  | 'koreanDrama'
  | 'japaneseDrama'
  | 'chineseDrama'
  | 'nowPlaying'
  | 'dramaMovies'
  | 'lightNovels'
  | 'oneShots';

export interface CatalogBrowseFilters {
  query?: string;
  year?: number;
  season?: CatalogSeason;
  formats?: string[];
  genres?: string[];
  releaseStatus?: CatalogReleaseFilter;
  sort?: CatalogSort;
  startDateGreater?: number;
  startDateLesser?: number;
  originalLanguage?: string;
  country?: string;
  minScore?: number;
  page?: number;
  perPage?: number;
}

export interface CatalogBrowseRequest {
  mediaType: CatalogMediaType;
  preset?: DiscoverSectionKey;
  filters?: CatalogBrowseFilters;
  page?: number;
  perPage?: number;
}

export interface CatalogSearchResult {
  provider: Exclude<MediaCatalogProvider, 'manual'>;
  externalId: string;
  mediaType: CatalogMediaType;
  title: string;
  englishTitle?: string;
  romajiTitle?: string;
  nativeTitle?: string;
  originalTitle?: string;
  alternateTitles?: string[];
  image?: string;
  backdrop?: string;
  accentColor?: string;
  synopsis?: string;
  year?: number;
  season?: string;
  sourceStatus?: MediaSourceStatus;
  totalUnits?: number;
  unitLabel: MediaUnitLabel;
  totalSeasons?: number;
  rating?: number;
  popularity?: number;
  favorites?: number;
  trending?: number;
  genres?: string[];
  format?: string;
  catalogUrl?: string;
  startDate?: string;
  originalLanguage?: string;
  nextEpisodeNumber?: number;
  nextEpisodeAt?: string;
  nextEpisodeDate?: string;
}

export interface CatalogMediaDetails extends CatalogSearchResult {
  relations?: MediaRelation[];
  seasons?: MediaSeasonSummary[];
  releaseEvents?: MediaReleaseEvent[];
  releaseScheduleAuthoritative?: boolean;
  watchProviders?: MediaWatchProvider[];
  nextEpisodeNumber?: number;
  nextEpisodeAt?: string;
  nextEpisodeDate?: string;
  availableUnits?: number;
  countryOfOrigin?: string;
  runtimeMinutes?: number;
}

export interface CatalogSearchPage {
  results: CatalogSearchResult[];
  page: number;
  hasNextPage: boolean;
  totalResults?: number;
}

export interface DiscoverSectionDescriptor {
  key: DiscoverSectionKey;
  title: string;
  description: string;
  request: CatalogBrowseRequest;
}

export interface CatalogSyncPatch {
  title: string;
  originalTitle?: string;
  alternateTitles?: string[];
  image?: string;
  backdrop?: string;
  synopsis?: string;
  year?: string;
  season?: 'Winter' | 'Spring' | 'Summer' | 'Fall' | 'Unknown';
  episodes?: number;
  totalUnits?: number;
  unitLabel?: MediaUnitLabel;
  rating?: number;
  genre?: string;
  genres?: string[];
  sourceStatus?: MediaSourceStatus;
  totalSeasons?: number;
  availableUnits?: number;
  acknowledgedAvailableUnits?: number;
  newUnitsAvailable?: number;
  hasNewSeason?: boolean;
  nextEpisodeNumber?: number;
  nextEpisodeAt?: Date | null;
  nextEpisodeDate?: string | null;
  releaseDate?: string | null;
  releaseHistory?: MediaReleaseEvent[];
  relations?: MediaRelation[];
  seasonDetails?: MediaSeasonSummary[];
  watchProviders?: MediaWatchProvider[];
  catalogUrl?: string;
  countryOfOrigin?: string;
  runtimeMinutes?: number;
  lastSyncedAt: Date;
  metadataUpdatedAt: Date;
}

export class CatalogApiError extends Error {
  readonly code: 'missing_key' | 'rate_limited' | 'network' | 'not_found' | 'invalid_response';

  constructor(
    message: string,
    code: CatalogApiError['code'] = 'network',
  ) {
    super(message);
    this.name = 'CatalogApiError';
    this.code = code;
  }
}
