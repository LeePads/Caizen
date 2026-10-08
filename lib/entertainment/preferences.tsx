import type {
  CatalogMediaType,
  DiscoverSectionKey,
} from '@/lib/entertainment/types';

export type EntertainmentFilterVisibility = 'collapsed' | 'visible' | 'minimal' | 'hidden';
export type EntertainmentTitleLanguage = 'english' | 'romaji' | 'native';
export type EntertainmentCardDensity = 'compact' | 'comfortable' | 'large';

export interface EntertainmentPreferences {
  autoLoadDiscover: boolean;
  backgroundCatalogRefresh: boolean;
  catalogRefreshHours: number;
  defaultCatalogType: CatalogMediaType;
  filterVisibility: EntertainmentFilterVisibility;
  titleLanguage: EntertainmentTitleLanguage;
  cardDensity: EntertainmentCardDensity;
  showScores: boolean;
  showPopularity: boolean;
  showGenres: boolean;
  showReleaseStatus: boolean;
  showEpisodeCounts: boolean;
  showAiringCountdown: boolean;
  markLibraryTitles: boolean;
  hideLibraryTitles: boolean;
  adultContent: boolean;
  dataSaver: boolean;
  preferredDramaRegions: string[];
  visibleSections: Record<CatalogMediaType, DiscoverSectionKey[]>;
}

export const DISCOVER_SECTION_DEFAULTS: Record<CatalogMediaType, DiscoverSectionKey[]> = {
  anime: [
    'trending',
    'popularSeason',
    'newPopular',
    'airing',
    'upcoming',
    'topRated',
    'specialFormats',
  ],
  manga: [
    'trending',
    'popular',
    'newPopular',
    'topRated',
    'lightNovels',
    'oneShots',
  ],
  series: [
    'trending',
    'popularDrama',
    'onAir',
    'topRated',
    'koreanDrama',
    'japaneseDrama',
    'chineseDrama',
  ],
  movie: [
    'trending',
    'popular',
    'nowPlaying',
    'upcoming',
    'topRated',
    'dramaMovies',
  ],
};

export const DEFAULT_ENTERTAINMENT_PREFERENCES: EntertainmentPreferences = {
  autoLoadDiscover: true,
  backgroundCatalogRefresh: true,
  catalogRefreshHours: 6,
  defaultCatalogType: 'anime',
  filterVisibility: 'collapsed',
  titleLanguage: 'english',
  cardDensity: 'comfortable',
  showScores: true,
  showPopularity: false,
  showGenres: true,
  showReleaseStatus: true,
  showEpisodeCounts: true,
  showAiringCountdown: true,
  markLibraryTitles: true,
  hideLibraryTitles: false,
  adultContent: false,
  dataSaver: false,
  preferredDramaRegions: ['ko', 'ja'],
  visibleSections: DISCOVER_SECTION_DEFAULTS,
};

function storageKey(profileId: string) {
  return `entertainment-preferences:${profileId || 'default'}`;
}

function sanitizeSections(
  value: unknown,
): Record<CatalogMediaType, DiscoverSectionKey[]> {
  const incoming = value && typeof value === 'object'
    ? value as Partial<Record<CatalogMediaType, DiscoverSectionKey[]>>
    : {};

  return {
    anime: Array.isArray(incoming.anime)
      ? incoming.anime
      : DISCOVER_SECTION_DEFAULTS.anime,
    manga: Array.isArray(incoming.manga)
      ? incoming.manga
      : DISCOVER_SECTION_DEFAULTS.manga,
    series: Array.isArray(incoming.series)
      ? incoming.series
      : DISCOVER_SECTION_DEFAULTS.series,
    movie: Array.isArray(incoming.movie)
      ? incoming.movie
      : DISCOVER_SECTION_DEFAULTS.movie,
  };
}

export function normalizeEntertainmentPreferences(
  value?: Partial<EntertainmentPreferences> | null,
): EntertainmentPreferences {
  const source = value || {};
  const defaultCatalogType: CatalogMediaType =
    source.defaultCatalogType === 'manga' ||
    source.defaultCatalogType === 'series' ||
    source.defaultCatalogType === 'movie'
      ? source.defaultCatalogType
      : 'anime';

  return {
    ...DEFAULT_ENTERTAINMENT_PREFERENCES,
    ...source,
    defaultCatalogType,
    catalogRefreshHours: Math.max(
      1,
      Math.min(168, Number(source.catalogRefreshHours || 6)),
    ),
    preferredDramaRegions: Array.isArray(source.preferredDramaRegions)
      ? source.preferredDramaRegions.filter(Boolean)
      : DEFAULT_ENTERTAINMENT_PREFERENCES.preferredDramaRegions,
    visibleSections: sanitizeSections(source.visibleSections),
  };
}

export function loadEntertainmentPreferences(
  profileId: string,
): EntertainmentPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_ENTERTAINMENT_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
    if (!raw) return DEFAULT_ENTERTAINMENT_PREFERENCES;
    return normalizeEntertainmentPreferences(
      JSON.parse(raw) as Partial<EntertainmentPreferences>,
    );
  } catch {
    return DEFAULT_ENTERTAINMENT_PREFERENCES;
  }
}

export function saveEntertainmentPreferences(
  profileId: string,
  preferences: EntertainmentPreferences,
) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      storageKey(profileId),
      JSON.stringify(normalizeEntertainmentPreferences(preferences)),
    );
  } catch {
    // Preferences are optional; a storage failure should not break Discover.
  }
}

export function resetEntertainmentPreferences(profileId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey(profileId));
}
