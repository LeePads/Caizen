export type DashboardDensity = 'compact' | 'comfortable';
export type DashboardDetail = 'calm' | 'balanced' | 'detailed';

export interface DashboardPreferences {
  visibility: Record<string, boolean>;
  order: string[];
  collapsed: Record<string, boolean>;
  density: DashboardDensity;
  detail: DashboardDetail;
  focusItemId?: string;
}

export const DASHBOARD_PREFERENCES_KEY = 'layout-dashboard-visibility';

export const DEFAULT_DASHBOARD_ORDER = [
  'todayFocus',
  'todayList',
  'upcoming',
  'lifePulse',
  'petCard',
  'achievements',
  'weeklyReflection',
  'worthChecking',
  'insights',
];

const LEGACY_CARD_MAP: Record<string, string> = {
  nextBestAction: 'todayFocus',
  todayChecklist: 'todayList',
  dailyBrief: 'upcoming',
  todayScore: 'todayList',
  lifePulse: 'lifePulse',
  priorityStack: 'todayFocus',
  weeklyReview: 'weeklyReflection',
  financeSnapshot: 'insights',
  incompleteData: 'worthChecking',
  neglectedAreas: 'worthChecking',
  petCard: 'petCard',
  achievements: 'achievements',
  treasuryTrend: 'insights',
};

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  visibility: {},
  order: DEFAULT_DASHBOARD_ORDER,
  collapsed: {},
  density: 'comfortable',
  detail: 'calm',
};

function normalizeOrder(input: unknown): string[] {
  const incoming = Array.isArray(input)
    ? input.filter((item): item is string => typeof item === 'string')
    : [];

  return Array.from(new Set([
    ...incoming.map(item => LEGACY_CARD_MAP[item] || item),
    ...DEFAULT_DASHBOARD_ORDER,
  ])).filter(item => DEFAULT_DASHBOARD_ORDER.includes(item));
}

function normalizeVisibility(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== 'object') return {};

  const result: Record<string, boolean> = {};
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value !== 'boolean') return;
    result[LEGACY_CARD_MAP[key] || key] = value;
  });
  return result;
}

function normalizeCollapsed(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== 'object') return {};

  const result: Record<string, boolean> = {};
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value !== 'boolean') return;
    result[LEGACY_CARD_MAP[key] || key] = value;
  });
  return result;
}

export function normalizeDashboardPreferences(value: unknown): DashboardPreferences {
  if (!value || typeof value !== 'object') {
    return {
      ...DEFAULT_DASHBOARD_PREFERENCES,
      order: [...DEFAULT_DASHBOARD_ORDER],
      visibility: {},
      collapsed: {},
    };
  }

  const record = value as Record<string, unknown>;
  const structured = Boolean(record.visibility && typeof record.visibility === 'object');
  const rawVisibility = structured ? record.visibility : record;
  const detail: DashboardDetail =
    record.detail === 'balanced' || record.detail === 'detailed'
      ? record.detail
      : 'calm';
  const density: DashboardDensity =
    record.density === 'compact' ? 'compact' : 'comfortable';

  return {
    visibility: normalizeVisibility(rawVisibility),
    order: normalizeOrder(structured ? record.order : undefined),
    collapsed: normalizeCollapsed(structured ? record.collapsed : undefined),
    density,
    detail,
    focusItemId: typeof record.focusItemId === 'string' ? record.focusItemId : undefined,
  };
}

function preferenceKey(profileId?: string | null) {
  return profileId
    ? `${DASHBOARD_PREFERENCES_KEY}:${profileId}`
    : DASHBOARD_PREFERENCES_KEY;
}

export function loadDashboardPreferences(profileId?: string | null): DashboardPreferences {
  if (typeof window === 'undefined') {
    return {
      ...DEFAULT_DASHBOARD_PREFERENCES,
      order: [...DEFAULT_DASHBOARD_ORDER],
      visibility: {},
      collapsed: {},
    };
  }

  try {
    const profileValue = localStorage.getItem(preferenceKey(profileId));
    const legacyValue = localStorage.getItem(DASHBOARD_PREFERENCES_KEY);
    const preferences = normalizeDashboardPreferences(JSON.parse(profileValue || legacyValue || '{}'));
    // The former global switch controlled this card but was never read by the
    // Dashboard. Respect an explicit off choice until this profile sets its
    // own Worth Checking visibility.
    if (
      preferences.visibility.worthChecking === undefined &&
      localStorage.getItem('layout-show-neglected-areas') === 'false'
    ) {
      preferences.visibility.worthChecking = false;
    }
    return preferences;
  } catch {
    return {
      ...DEFAULT_DASHBOARD_PREFERENCES,
      order: [...DEFAULT_DASHBOARD_ORDER],
      visibility: {},
      collapsed: {},
    };
  }
}

export function saveDashboardPreferences(
  preferences: DashboardPreferences,
  profileId?: string | null,
) {
  localStorage.setItem(
    preferenceKey(profileId),
    JSON.stringify(normalizeDashboardPreferences(preferences)),
  );
  window.dispatchEvent(new Event('life-manager:layout-settings'));
}
