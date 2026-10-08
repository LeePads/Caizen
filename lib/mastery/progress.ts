import type {
  AchievementPath,
  CategoryXpEvent,
  CategoryXpSourceType,
  MasteryBondClaim,
  MasteryBondXpEvent,
  Profile,
} from '../types';
import { MASTERY_CATEGORY_ORDER } from './category-metadata';

export type MasteryRankName =
  | 'Unstarted'
  | 'Apprentice'
  | 'Adept'
  | 'Expert'
  | 'Master'
  | 'Mythic';

export const CATEGORY_ORDER = MASTERY_CATEGORY_ORDER;

export const CATEGORY_XP_DAILY_CAP = 40;
export const CATEGORY_XP_WEEKLY_CAP = 100;
export const MASTERY_BOND_DAILY_CAP = 40;
export const BOND_XP_PER_LEVEL = 100;

const RANKS: readonly MasteryRankName[] = [
  'Unstarted',
  'Apprentice',
  'Adept',
  'Expert',
  'Master',
  'Mythic',
];

const RANK_LEVELS: Readonly<Record<MasteryRankName, number>> = {
  Unstarted: 0,
  Apprentice: 1,
  Adept: 5,
  Expert: 10,
  Master: 20,
  Mythic: 35,
};

const ACHIEVEMENT_XP_BY_TYPE: Readonly<Record<string, number>> = {
  Foundation: 150,
  Practice: 500,
  Breadth: 800,
  Landmark: 1250,
  Signature: 2000,
};

const VALID_CATEGORIES = new Set<AchievementPath>(CATEGORY_ORDER);

function clampNonNegative(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function cumulativeXpForLevel(level: number) {
  const normalized = Math.max(0, Math.floor(level));
  return 50 * normalized + 5 * normalized * normalized;
}

export function categoryLevelForXp(totalXp: number) {
  const normalized = clampNonNegative(totalXp);
  let level = 0;
  while (level < 50 && cumulativeXpForLevel(level + 1) <= normalized) level += 1;
  return level;
}

export function rankForCategoryXp(totalXp: number): MasteryRankName {
  const level = categoryLevelForXp(totalXp);
  return [...RANKS].reverse().find(rank => level >= RANK_LEVELS[rank]) || 'Unstarted';
}

export function masteryRankIndex(rank: MasteryRankName) {
  return RANKS.indexOf(rank);
}

export function maxMasteryRank(first: MasteryRankName, second: MasteryRankName) {
  return masteryRankIndex(first) >= masteryRankIndex(second) ? first : second;
}

function isAchievementPath(value: unknown): value is AchievementPath {
  return typeof value === 'string' && VALID_CATEGORIES.has(value as AchievementPath);
}

function localDateKey(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weekKey(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return localDateKey(start);
}

function normalizeCategoryEvents(events: unknown): CategoryXpEvent[] {
  if (!Array.isArray(events)) return [];
  return events
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const value = item as Partial<CategoryXpEvent>;
      return {
        id: String(value.id || ''),
        category: isAchievementPath(value.category) ? value.category : 'discipline',
        sourceType: (value.sourceType || 'activity') as CategoryXpSourceType,
        sourceId: String(value.sourceId || value.id || ''),
        requestedXp: clampNonNegative(value.requestedXp),
        xp: clampNonNegative(value.xp),
        occurredAt: new Date(value.occurredAt || new Date()),
      };
    })
    .filter(item => item.id && !Number.isNaN(item.occurredAt.getTime()));
}

function normalizeBondEvents(events: unknown): MasteryBondXpEvent[] {
  if (!Array.isArray(events)) return [];
  return events
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const value = item as Partial<MasteryBondXpEvent>;
      return {
        id: String(value.id || ''),
        recipient: isAchievementPath(value.recipient) ? value.recipient : 'discipline',
        sourceType: (value.sourceType || 'task') as MasteryBondXpEvent['sourceType'],
        sourceId: String(value.sourceId || ''),
        claimId: String(value.claimId || value.sourceId || value.id || ''),
        requestedXp: clampNonNegative(value.requestedXp),
        xp: clampNonNegative(value.xp),
        occurredAt: new Date(value.occurredAt || new Date()),
      };
    })
    .filter(item => item.id && item.claimId && !Number.isNaN(item.occurredAt.getTime()));
}

function normalizeBondClaims(claims: unknown): MasteryBondClaim[] {
  if (!Array.isArray(claims)) return [];
  return claims
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const value = item as Partial<MasteryBondClaim>;
      return {
        claimId: String(value.claimId || ''),
        eventId: value.eventId ? String(value.eventId) : undefined,
        processedAt: new Date(value.processedAt || new Date()),
      };
    })
    .filter(item => item.claimId && !Number.isNaN(item.processedAt.getTime()));
}

export function normalizeMasteryProgress(profile: Profile): Profile {
  const categoryXpEvents = normalizeCategoryEvents(profile.categoryXpEvents);
  const masteryBondXpEvents = normalizeBondEvents(profile.masteryBondXpEvents);
  const masteryBondClaims = normalizeBondClaims(profile.masteryBondClaims);
  const active = isAchievementPath(profile.activeMasteryCompanion)
    && getEffectiveMasteryRankName(
      { ...profile, categoryXpEvents, masteryBondXpEvents, masteryBondClaims },
      profile.activeMasteryCompanion,
    ) !== 'Unstarted'
    && masteryRankIndex(
      getEffectiveMasteryRankName(
        { ...profile, categoryXpEvents, masteryBondXpEvents, masteryBondClaims },
        profile.activeMasteryCompanion,
      ),
    ) >= masteryRankIndex('Expert')
    ? profile.activeMasteryCompanion
    : undefined;

  return {
    ...profile,
    categoryXpEvents,
    masteryBondXpEvents,
    masteryBondClaims,
    masteryCompanionPreferences: profile.masteryCompanionPreferences || {},
    activeMasteryCompanion: active,
  };
}

export function migrateMasteryProgress(
  profile: Profile,
  achievements: ReadonlyArray<{ id: string; category: AchievementPath; type: string }>,
  now = new Date(),
): Profile {
  let next = normalizeMasteryProgress(profile);
  const events = [...(next.categoryXpEvents || [])];
  const ids = new Set(events.map(event => event.id));
  const unlocks = new Map((next.achievementUnlocks || []).map(item => [item.achievementId, item]));

  achievements.forEach(achievement => {
    const unlock = unlocks.get(achievement.id);
    const xp = ACHIEVEMENT_XP_BY_TYPE[achievement.type];
    const id = `mastery:${achievement.category}:achievement:${achievement.id}`;
    if (!unlock || !xp || ids.has(id)) return;
    events.push({
      id,
      category: achievement.category,
      sourceType: 'achievement',
      sourceId: achievement.id,
      requestedXp: xp,
      xp,
      occurredAt: new Date(unlock.unlockedAt || now),
    });
    ids.add(id);
  });

  CATEGORY_ORDER.forEach(category => {
    const floor = (next.masteryRankFloors?.[category] || 'Unstarted') as MasteryRankName;
    if (floor === 'Unstarted') return;
    const id = `mastery:${category}:migration:floor:${floor}`;
    if (ids.has(id)) return;
    const currentXp = events
      .filter(event => event.category === category)
      .reduce((sum, event) => sum + event.xp, 0);
    const threshold = cumulativeXpForLevel(RANK_LEVELS[floor]);
    const xp = Math.max(0, threshold - currentXp);
    events.push({
      id,
      category,
      sourceType: 'migration',
      sourceId: id,
      requestedXp: xp,
      xp,
      occurredAt: new Date(now),
    });
    ids.add(id);
  });

  next = { ...next, categoryXpEvents: events };
  return normalizeMasteryProgress(next);
}

export function getCategoryXpTotal(profile: Profile, category: AchievementPath) {
  return (profile.categoryXpEvents || [])
    .filter(event => event.category === category)
    .reduce((sum, event) => sum + clampNonNegative(event.xp), 0);
}

export function getBondXpTotal(profile: Profile, category: AchievementPath) {
  return (profile.masteryBondXpEvents || [])
    .filter(event => event.recipient === category)
    .reduce((sum, event) => sum + clampNonNegative(event.xp), 0);
}

export function getEffectiveMasteryRankName(profile: Profile, category: AchievementPath): MasteryRankName {
  const derived = rankForCategoryXp(getCategoryXpTotal(profile, category));
  const floor = (profile.masteryRankFloors?.[category] || 'Unstarted') as MasteryRankName;
  return maxMasteryRank(derived, floor);
}

export function getCategoryProgress(profile: Profile, category: AchievementPath) {
  const totalXp = getCategoryXpTotal(profile, category);
  const level = categoryLevelForXp(totalXp);
  const currentLevelXp = Math.max(0, totalXp - cumulativeXpForLevel(level));
  const nextLevelTarget = level >= 50 ? cumulativeXpForLevel(50) : cumulativeXpForLevel(level + 1);
  const rank = getEffectiveMasteryRankName(profile, category);
  const nextRank = RANKS[masteryRankIndex(rank) + 1];
  const nextRankXp = nextRank ? cumulativeXpForLevel(RANK_LEVELS[nextRank]) : cumulativeXpForLevel(50);
  const momentumSince = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const momentumXp = (profile.categoryXpEvents || [])
    .filter(event => event.category === category && new Date(event.occurredAt).getTime() >= momentumSince)
    .reduce((sum, event) => sum + event.xp, 0);
  return {
    totalXp,
    level,
    currentLevelXp,
    nextLevelXp: Math.max(0, nextLevelTarget - cumulativeXpForLevel(level)),
    nextRank,
    nextRankXp,
    xpToNextRank: nextRank ? Math.max(0, nextRankXp - totalXp) : 0,
    momentumXp,
    rank,
  };
}

function sameDay<T extends { occurredAt: Date }>(events: T[], date: Date) {
  const key = localDateKey(date);
  return events.filter(event => localDateKey(event.occurredAt) === key);
}

function sameWeek<T extends { occurredAt: Date }>(events: T[], date: Date) {
  const key = weekKey(date);
  return events.filter(event => weekKey(event.occurredAt) === key);
}

function diminishingMultiplier(count: number) {
  if (count <= 0) return 1;
  if (count === 1) return 0.5;
  return 0;
}

export function recordCategoryXpEvent(
  profile: Profile,
  input: {
    category: AchievementPath;
    sourceId: string;
    sourceType: CategoryXpSourceType;
    xp: number;
    eventId?: string;
    occurredAt?: Date;
    bypassCaps?: boolean;
  },
): Profile {
  const occurredAt = input.occurredAt || new Date();
  const events = [...(profile.categoryXpEvents || [])];
  const eventId = input.eventId || `mastery:${input.category}:${input.sourceType}:${input.sourceId}`;
  if (events.some(event => event.id === eventId)) return profile;

  const requestedXp = clampNonNegative(input.xp);
  let awardedXp = requestedXp;
  if (!input.bypassCaps && input.sourceType !== 'achievement' && input.sourceType !== 'migration') {
    const today = sameDay(events.filter(event => event.category === input.category), occurredAt);
    const week = sameWeek(events.filter(event => event.category === input.category), occurredAt);
    const multiplier = diminishingMultiplier(today.length);
    const usedToday = today.reduce((sum, event) => sum + event.xp, 0);
    const usedWeek = week.reduce((sum, event) => sum + event.xp, 0);
    awardedXp = Math.min(
      Math.floor(requestedXp * multiplier),
      Math.max(0, CATEGORY_XP_DAILY_CAP - usedToday),
      Math.max(0, CATEGORY_XP_WEEKLY_CAP - usedWeek),
    );
  }

  return {
    ...profile,
    categoryXpEvents: [
      ...events,
      {
        id: eventId,
        category: input.category,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        requestedXp,
        xp: awardedXp,
        occurredAt: new Date(occurredAt),
      },
    ],
  };
}

export function recordMasteryBondEvent(
  profile: Profile,
  input: {
    sourceId: string;
    sourceType: MasteryBondXpEvent['sourceType'];
    xp: number;
    claimId?: string;
    occurredAt?: Date;
  },
): Profile {
  const occurredAt = input.occurredAt || new Date();
  const claimId = input.claimId || `${input.sourceType}:${input.sourceId}`;
  const claims = [...(profile.masteryBondClaims || [])];
  if (claims.some(claim => claim.claimId === claimId)) return profile;

  const active = profile.activeMasteryCompanion;
  const events = [...(profile.masteryBondXpEvents || [])];
  if (!active || masteryRankIndex(getEffectiveMasteryRankName(profile, active)) < masteryRankIndex('Expert')) {
    return {
      ...profile,
      masteryBondXpEvents: events,
      masteryBondClaims: [...claims, { claimId, processedAt: new Date(occurredAt) }],
    };
  }

  const today = sameDay(events, occurredAt);
  const sameType = today.filter(event => event.sourceType === input.sourceType);
  const usedToday = today.reduce((sum, event) => sum + event.xp, 0);
  const requestedXp = clampNonNegative(input.xp);
  const awardedXp = Math.min(
    Math.floor(requestedXp * diminishingMultiplier(sameType.length)),
    Math.max(0, MASTERY_BOND_DAILY_CAP - usedToday),
  );
  const eventId = `bond:${active}:${input.sourceType}:${input.sourceId}`;
  const event: MasteryBondXpEvent = {
    id: eventId,
    recipient: active,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    claimId,
    requestedXp,
    xp: awardedXp,
    occurredAt: new Date(occurredAt),
  };
  return {
    ...profile,
    masteryBondXpEvents: [...events, event],
    masteryBondClaims: [...claims, { claimId, eventId, processedAt: new Date(occurredAt) }],
  };
}

export function masterySkinEligibility(rank: MasteryRankName) {
  const index = masteryRankIndex(rank);
  return [
    ...(index >= masteryRankIndex('Expert') ? ['base' as const] : []),
    ...(index >= masteryRankIndex('Master') ? ['evolved' as const] : []),
    ...(index >= masteryRankIndex('Mythic') ? ['resonance' as const] : []),
  ];
}

export function bondLevelForXp(totalXp: number) {
  return Math.floor(clampNonNegative(totalXp) / BOND_XP_PER_LEVEL) + 1;
}

export function normalizeMasterySkinSelection(
  profile: Profile,
  category: AchievementPath,
) {
  const eligible = masterySkinEligibility(getEffectiveMasteryRankName(profile, category));
  const selected = profile.masteryCompanionPreferences?.[category]?.selectedSkin;
  return selected && eligible.includes(selected) ? selected : eligible[0] || null;
}

export const achievementXpForType = (type: string) => ACHIEVEMENT_XP_BY_TYPE[type] || 0;
export const masteryRankLevels = RANK_LEVELS;
export const masteryRankNames = RANKS;
export const isMasteryCategory = isAchievementPath;
export const normalizeMasteryBondClaims = normalizeBondClaims;
