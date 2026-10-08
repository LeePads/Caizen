export interface GamePreferences {
  autoLoadDiscover: boolean;
  catalogRefreshHours: number;
  dataSaver: boolean;
  filtersCollapsed: boolean;
  showPopular: boolean;
  showNewReleases: boolean;
  showUpcoming: boolean;
  showTopRated: boolean;
  libraryDensity: 'comfortable' | 'compact';
}

export const DEFAULT_GAME_PREFERENCES: GamePreferences = {
  autoLoadDiscover: true,
  catalogRefreshHours: 12,
  dataSaver: false,
  filtersCollapsed: true,
  showPopular: true,
  showNewReleases: true,
  showUpcoming: true,
  showTopRated: true,
  libraryDensity: 'comfortable',
};

function preferenceKey(profileId: string) {
  return `caizen-game-preferences:${profileId || 'default'}`;
}

export function readGamePreferences(profileId: string): GamePreferences {
  if (typeof window === 'undefined') return DEFAULT_GAME_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(preferenceKey(profileId));
    if (!raw) return DEFAULT_GAME_PREFERENCES;
    return {
      ...DEFAULT_GAME_PREFERENCES,
      ...(JSON.parse(raw) as Partial<GamePreferences>),
    };
  } catch {
    return DEFAULT_GAME_PREFERENCES;
  }
}

export function writeGamePreferences(
  profileId: string,
  preferences: GamePreferences,
) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    preferenceKey(profileId),
    JSON.stringify(preferences),
  );
}
