import type { AchievementUnlock, MilestoneUnlock, Profile } from './types';
import { toLocalDateKey } from './lifehub/date-utils';

export type MilestoneArea =
  | 'productivity'
  | 'wellness'
  | 'finance'
  | 'collection'
  | 'reflection';

export type MilestoneId =
  | 'first-useful-step'
  | 'rhythm-taking-shape'
  | 'care-in-practice'
  | 'money-in-order'
  | 'goal-carried-through'
  | 'page-to-return'
  | 'room-for-matters'
  | 'many-parts-one-home'
  | 'coming-back'
  | 'season-kept';

export type MilestoneProjection = {
  milestoneId: MilestoneId;
  achievedAt: Date;
  source: 'legacy-projection';
};

export type EffectiveMilestoneAchievement =
  | (MilestoneUnlock & { source: 'persisted' })
  | MilestoneProjection;

export type MilestoneDefinition = {
  id: MilestoneId;
  name: string;
  description: string;
  area: MilestoneArea;
  category: MilestoneArea;
  icon: string;
  evidenceSources: readonly string[];
  timestampRule: string;
  evaluate: (profile: Profile) => Date | undefined;
};

export type EvaluatedMilestone = MilestoneDefinition & {
  achieved: boolean;
  achievedAt?: Date;
};

type ActivityEvent = {
  area: MilestoneArea;
  date: Date;
  kind: string;
  dimension?: string;
  surface?: string;
  scheduled?: boolean;
};

const DAY_MS = 86_400_000;

function validDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : new Date(value);
  }
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function firstDate(...values: unknown[]): Date | undefined {
  for (const value of values) {
    const date = validDate(value);
    if (date) return date;
  }
  return undefined;
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function dateKey(date: Date): string {
  return toLocalDateKey(date);
}

function monthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function weekKey(date: Date): string {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return dateKey(start);
}

function sorted(events: ActivityEvent[]): ActivityEvent[] {
  return [...events].sort((left, right) => left.date.getTime() - right.date.getTime());
}

function healthEvents(profile: Profile): ActivityEvent[] {
  const health = profile.health || ({} as Profile['health']);
  const events: ActivityEvent[] = [];
  const add = (items: unknown, kind: string, dimension: string) => {
    if (!Array.isArray(items)) return;
    items.forEach((item: any) => {
      const date = firstDate(item?.date, item?.completedAt, item?.createdAt);
      if (date) events.push({ area: 'wellness', date, kind, dimension });
    });
  };

  add(health.foodEntries, 'food', 'nutrition');
  add(health.nutritionEntries, 'nutrition', 'nutrition');
  add(health.activityEntries, 'activity', 'movement');
  add(health.weightEntries, 'weight', 'weight');
  add(health.sleepEntries, 'sleep', 'sleep');
  add(health.workoutSessions, 'workout', 'movement');
  add(health.fastingSessions, 'fasting', 'rest');
  add(profile.skincareUsageEvents, 'care', 'care');
  add(profile.skincareProducts, 'care', 'care');
  add(profile.supplements, 'care', 'care');
  return events;
}

function productivityEvents(profile: Profile): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  (profile.productivityItems || []).forEach(item => {
    if (item.status !== 'completed') return;
    const date = firstDate(item.completedAt, item.createdAt);
    if (!date) return;
    events.push({
      area: 'productivity',
      date,
      kind: 'task',
      scheduled: Boolean(item.deadline),
    });
  });

  (profile.dailyChecklistItems || []).forEach(item => {
    (item.completionHistory || []).forEach(entry => {
      if (entry.status !== 'done') return;
      const date = firstDate(entry.completedAt, entry.date);
      if (!date) return;
      events.push({
        area: 'productivity',
        date,
        kind: 'routine',
        scheduled: true,
      });
    });
  });

  (profile.workItems || []).forEach(item => {
    if (item.type !== 'task' || item.status !== 'done') return;
    const date = firstDate(item.date, item.createdAt);
    if (!date) return;
    events.push({
      area: 'productivity',
      date,
      kind: 'work',
      scheduled: Boolean(item.dueDate),
    });
  });
  return events;
}

function financeEvents(profile: Profile): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  (profile.wallets || []).forEach(wallet => {
    const date = firstDate(wallet.createdAt);
    if (date && nonEmpty(wallet.name)) {
      events.push({ area: 'finance', date, kind: 'wallet' });
    }
    if (
      date &&
      numberValue(wallet.goalTarget) > 0 &&
      numberValue(wallet.balance) >= numberValue(wallet.goalTarget)
    ) {
      events.push({ area: 'finance', date, kind: 'goal' });
    }
  });
  (profile.transactions || []).forEach(transaction => {
    const date = firstDate(transaction.date, transaction.createdAt);
    if (date && numberValue(transaction.amount) > 0) {
      events.push({ area: 'finance', date, kind: 'transaction' });
    }
  });
  (profile.balanceCheckIns || []).forEach(checkIn => {
    const date = firstDate(checkIn.completedAt);
    if (date) events.push({ area: 'finance', date, kind: 'review' });
  });
  (profile.balanceProjectionRows || []).forEach(row => {
    const date = firstDate(row.createdAt, row.updatedAt);
    if (date && nonEmpty(row.label)) events.push({ area: 'finance', date, kind: 'plan' });
  });
  (profile.budgets || []).forEach(budget => {
    const date = firstDate(budget.createdAt, budget.updatedAt);
    if (date) events.push({ area: 'finance', date, kind: 'budget' });
  });
  (profile.upcomingMoneyItems || []).forEach(item => {
    const date = firstDate(item.createdAt, item.updatedAt, item.dueDate);
    if (date && nonEmpty(item.title)) events.push({ area: 'finance', date, kind: 'plan' });
  });
  return events;
}

function collectionEvents(profile: Profile): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const add = (items: unknown, surface: string, dateFields: string[] = ['createdAt']) => {
    if (!Array.isArray(items)) return;
    items.forEach((item: any) => {
      if (!nonEmpty(item?.name) && !nonEmpty(item?.title)) return;
      const date = firstDate(...dateFields.map(field => item?.[field]));
      if (date) events.push({ area: 'collection', date, kind: surface, surface });
    });
  };
  add(profile.inventoryItems, 'inventory');
  add(profile.wishlistItems, 'wishlist', ['purchaseDate', 'createdAt']);
  add(profile.games, 'games');
  add(profile.gameGuides, 'guides');
  add(profile.mediaItems, 'media', ['completedAt', 'startedAt', 'createdAt']);
  add(profile.musicItems, 'music');
  add(profile.personalVaultItems, 'vault');
  return events;
}

function reflectionEvents(profile: Profile): ActivityEvent[] {
  return (profile.journalEntries || [])
    .filter(entry => nonEmpty(entry.content) || nonEmpty(entry.title))
    .map((entry): ActivityEvent | undefined => {
      const date = firstDate(entry.date, entry.createdAt);
      return date
        ? { area: 'reflection', date, kind: 'journal' }
        : undefined;
    })
    .filter((event): event is ActivityEvent => Boolean(event));
}

function allEvents(profile: Profile): ActivityEvent[] {
  return [
    ...productivityEvents(profile),
    ...healthEvents(profile),
    ...financeEvents(profile),
    ...collectionEvents(profile),
    ...reflectionEvents(profile),
  ];
}

type ActivityEventSnapshot = {
  productivity: ActivityEvent[];
  health: ActivityEvent[];
  finance: ActivityEvent[];
  collection: ActivityEvent[];
  reflection: ActivityEvent[];
  all: ActivityEvent[];
};

function activityEventSnapshot(profile: Profile): ActivityEventSnapshot {
  const productivity = productivityEvents(profile);
  const health = healthEvents(profile);
  const finance = financeEvents(profile);
  const collection = collectionEvents(profile);
  const reflection = reflectionEvents(profile);
  return {
    productivity,
    health,
    finance,
    collection,
    reflection,
    all: [...productivity, ...health, ...finance, ...collection, ...reflection],
  };
}

function firstUsefulStepFrom(events: ActivityEvent[]): Date | undefined {
  return sorted(events)[0]?.date;
}

function rhythmTakingShapeFrom(events: ActivityEvent[]): Date | undefined {
  const weeks = new Set<string>();
  let scheduled = 0;
  for (const event of sorted(events)) {
    weeks.add(weekKey(event.date));
    if (event.scheduled) scheduled += 1;
    if (weeks.size >= 4 && scheduled >= 2) return event.date;
  }
  return undefined;
}

function careInPracticeFrom(events: ActivityEvent[]): Date | undefined {
  const dates = new Set<string>();
  const dimensions = new Set<string>();
  for (const event of sorted(events)) {
    dates.add(dateKey(event.date));
    if (event.dimension) dimensions.add(event.dimension);
    if (dates.size >= 3 && dimensions.size >= 2) return event.date;
  }
  return undefined;
}

function moneyInOrderFrom(events: ActivityEvent[]): Date | undefined {
  let hasWallet = false;
  let hasPlanning = false;
  const reviewWeeks = new Set<string>();
  for (const event of sorted(events)) {
    if (event.kind === 'wallet') hasWallet = true;
    if (['plan', 'budget', 'transaction'].includes(event.kind)) hasPlanning = true;
    if (event.kind === 'review') reviewWeeks.add(weekKey(event.date));
    if (hasWallet && hasPlanning && reviewWeeks.size >= 2) return event.date;
  }
  return undefined;
}

function goalCarriedThroughFrom(events: ActivityEvent[]): Date | undefined {
  return sorted(events.filter(event => event.kind === 'goal'))[0]?.date;
}

function pageToReturnFrom(events: ActivityEvent[]): Date | undefined {
  const dates = new Set<string>();
  let count = 0;
  for (const event of sorted(events)) {
    count += 1;
    dates.add(dateKey(event.date));
    if (count >= 5 && dates.size >= 3) return event.date;
  }
  return undefined;
}

function roomForMattersFrom(events: ActivityEvent[]): Date | undefined {
  const surfaces = new Set<string>();
  for (const event of sorted(events)) {
    if (event.surface) surfaces.add(event.surface);
    if (surfaces.size >= 2) return event.date;
  }
  return undefined;
}

function manyPartsOneHomeFrom(events: ActivityEvent[]): Date | undefined {
  const areas = new Set<MilestoneArea>();
  for (const event of sorted(events)) {
    areas.add(event.area);
    if (areas.size >= 4) return event.date;
  }
  return undefined;
}

function comingBackFrom(events: ActivityEvent[]): Date | undefined {
  const months = new Set<string>();
  const dates = new Set<string>();
  let previousDate: Date | undefined;
  let hasGap = false;
  for (const event of sorted(events)) {
    months.add(monthKey(event.date));
    const key = dateKey(event.date);
    if (!dates.has(key)) {
      dates.add(key);
      const currentDate = validDate(`${key}T12:00:00`);
      if (currentDate && previousDate && currentDate.getTime() - previousDate.getTime() >= 8 * DAY_MS) {
        hasGap = true;
      }
      if (currentDate) previousDate = currentDate;
    }
    if (months.size >= 3 && hasGap) return event.date;
  }
  return undefined;
}

function seasonKeptFrom(events: ActivityEvent[]): Date | undefined {
  const months = new Set<string>();
  const areas = new Set<MilestoneArea>();
  for (const event of sorted(events)) {
    months.add(monthKey(event.date));
    areas.add(event.area);
    if (months.size >= 6 && areas.size >= 2) return event.date;
  }
  return undefined;
}

function firstUsefulStep(profile: Profile) { return firstUsefulStepFrom(activityEventSnapshot(profile).all); }
function rhythmTakingShape(profile: Profile) { return rhythmTakingShapeFrom(productivityEvents(profile)); }
function careInPractice(profile: Profile) { return careInPracticeFrom(healthEvents(profile)); }
function moneyInOrder(profile: Profile) { return moneyInOrderFrom(financeEvents(profile)); }
function goalCarriedThrough(profile: Profile) { return goalCarriedThroughFrom(financeEvents(profile)); }
function pageToReturn(profile: Profile) { return pageToReturnFrom(reflectionEvents(profile)); }
function roomForMatters(profile: Profile) { return roomForMattersFrom(collectionEvents(profile)); }
function manyPartsOneHome(profile: Profile) { return manyPartsOneHomeFrom(activityEventSnapshot(profile).all); }
function comingBack(profile: Profile) { return comingBackFrom(activityEventSnapshot(profile).all); }
function seasonKept(profile: Profile) { return seasonKeptFrom(activityEventSnapshot(profile).all); }

export const MILESTONE_DEFINITIONS: readonly MilestoneDefinition[] = [
  {
    id: 'first-useful-step',
    name: 'First Useful Step',
    description: 'A meaningful action has found a place in your life.',
    area: 'reflection',
    category: 'reflection',
    icon: 'sparkles',
    evidenceSources: ['productivityItems', 'dailyChecklistItems', 'workItems', 'health', 'wallets', 'transactions', 'inventoryItems', 'journalEntries'],
    timestampRule: 'Earliest dated meaningful event across the five broad areas.',
    evaluate: firstUsefulStep,
  },
  {
    id: 'rhythm-taking-shape',
    name: 'A Rhythm Takes Shape',
    description: 'Productivity is returning across several weeks.',
    area: 'productivity',
    category: 'productivity',
    icon: 'repeat',
    evidenceSources: ['productivityItems', 'dailyChecklistItems', 'workItems'],
    timestampRule: 'Date of the earliest productivity event that completes the four-week and two-planned-completion threshold.',
    evaluate: rhythmTakingShape,
  },
  {
    id: 'care-in-practice',
    name: 'Care in Practice',
    description: 'More than one dimension of care is being noticed.',
    area: 'wellness',
    category: 'wellness',
    icon: 'heart',
    evidenceSources: ['health', 'skincareProducts', 'skincareUsageEvents', 'supplements'],
    timestampRule: 'Date of the third dated wellness record when the two-dimension threshold is first met.',
    evaluate: careInPractice,
  },
  {
    id: 'money-in-order',
    name: 'Money in Order',
    description: 'Your money picture is becoming easier to tend.',
    area: 'finance',
    category: 'finance',
    icon: 'wallet',
    evidenceSources: ['wallets', 'transactions', 'balanceProjectionRows', 'budgets', 'upcomingMoneyItems', 'balanceCheckIns'],
    timestampRule: 'Date of the earliest finance event at which wallet, planning or transaction, and two review weeks are present.',
    evaluate: moneyInOrder,
  },
  {
    id: 'goal-carried-through',
    name: 'A Goal Carried Through',
    description: 'A protected financial goal reached its target.',
    area: 'finance',
    category: 'finance',
    icon: 'target',
    evidenceSources: ['wallets', 'transactions'],
    timestampRule: 'Earliest deterministic wallet goal evidence date; wallet creation is the fallback when no balance-change date exists.',
    evaluate: goalCarriedThrough,
  },
  {
    id: 'page-to-return',
    name: 'A Page to Return To',
    description: 'Reflection has become something you return to.',
    area: 'reflection',
    category: 'reflection',
    icon: 'book-open',
    evidenceSources: ['journalEntries'],
    timestampRule: 'Date of the fifth substantive entry when at least three distinct entry dates are present.',
    evaluate: pageToReturn,
  },
  {
    id: 'room-for-matters',
    name: 'Made Room for What Matters',
    description: 'Meaningful records have more than one home.',
    area: 'collection',
    category: 'collection',
    icon: 'archive',
    evidenceSources: ['inventoryItems', 'wishlistItems', 'games', 'gameGuides', 'mediaItems', 'musicItems', 'personalVaultItems'],
    timestampRule: 'Date of the earliest meaningful record on the second distinct collection surface.',
    evaluate: roomForMatters,
  },
  {
    id: 'many-parts-one-home',
    name: 'Many Parts, One Home',
    description: 'Several parts of life are now connected here.',
    area: 'collection',
    category: 'collection',
    icon: 'layout-grid',
    evidenceSources: ['productivityItems', 'dailyChecklistItems', 'workItems', 'health', 'wallets', 'transactions', 'inventoryItems', 'journalEntries'],
    timestampRule: 'Date of the earliest event that brings the fourth broad area into the effective activity set.',
    evaluate: manyPartsOneHome,
  },
  {
    id: 'coming-back',
    name: 'Coming Back',
    description: 'Returning matters more than never missing.',
    area: 'reflection',
    category: 'reflection',
    icon: 'rotate-ccw',
    evidenceSources: ['productivityItems', 'dailyChecklistItems', 'workItems', 'health', 'wallets', 'transactions', 'inventoryItems', 'journalEntries'],
    timestampRule: 'Date of the event that first establishes three activity months and an eight-day date gap.',
    evaluate: comingBack,
  },
  {
    id: 'season-kept',
    name: 'A Season Kept',
    description: 'Your system has supported a real season of life.',
    area: 'wellness',
    category: 'wellness',
    icon: 'calendar-range',
    evidenceSources: ['productivityItems', 'dailyChecklistItems', 'workItems', 'health', 'wallets', 'transactions', 'inventoryItems', 'journalEntries'],
    timestampRule: 'Date of the event that first establishes six distinct activity months and two represented areas.',
    evaluate: seasonKept,
  },
];

const LEGACY_MILESTONE_SOURCES: Record<MilestoneId, readonly string[]> = {
  'first-useful-step': [
    'productivity-first-shape',
    'productivity-first-completion',
    'wellness-first-care',
    'wellness-first-food',
    'wellness-first-activity',
    'finance-first-ledger',
    'finance-first-wallet',
    'finance-first-review',
    'collection-first-keepsake',
    'collection-first-item',
    'reflection-first-note',
    'reflection-first',
  ],
  'rhythm-taking-shape': [
    'productivity-steady-rhythm',
    'productivity-routine-days-7',
    'productivity-routine-50',
  ],
  'care-in-practice': ['wellness-care-baseline', 'wellness-sustainable-care'],
  'money-in-order': ['finance-clear-channels', 'finance-prepared-season'],
  'goal-carried-through': ['finance-protected-goal', 'finance-goal-complete'],
  'page-to-return': [
    'reflection-returning-page',
    'reflection-inner-chronicle',
    'reflection-look-back-carry-forward',
  ],
  'room-for-matters': [
    'collection-many-rooms',
    'collection-context-kept',
    'collection-living-archive',
  ],
  'many-parts-one-home': [
    'discipline-connected-practice',
    'discipline-follow-through',
    'discipline-balanced-season',
  ],
  'coming-back': ['discipline-return-to-work'],
  'season-kept': [
    'productivity-week-that-holds',
    'wellness-sustainable-care',
    'finance-prepared-season',
    'collection-living-archive',
    'reflection-look-back-carry-forward',
    'discipline-balanced-season',
  ],
};

export function evaluateMilestones(
  profile: Profile,
  records?: Partial<Profile>,
): EvaluatedMilestone[] {
  const snapshot = records
    ? ({ ...profile, ...records, health: { ...profile.health, ...records.health } } as Profile)
    : profile;
  const events = activityEventSnapshot(snapshot);
  const evaluators: Record<MilestoneId, () => Date | undefined> = {
    'first-useful-step': () => firstUsefulStepFrom(events.all),
    'rhythm-taking-shape': () => rhythmTakingShapeFrom(events.productivity),
    'care-in-practice': () => careInPracticeFrom(events.health),
    'money-in-order': () => moneyInOrderFrom(events.finance),
    'goal-carried-through': () => goalCarriedThroughFrom(events.finance),
    'page-to-return': () => pageToReturnFrom(events.reflection),
    'room-for-matters': () => roomForMattersFrom(events.collection),
    'many-parts-one-home': () => manyPartsOneHomeFrom(events.all),
    'coming-back': () => comingBackFrom(events.all),
    'season-kept': () => seasonKeptFrom(events.all),
  };
  return MILESTONE_DEFINITIONS.map(definition => {
    const achievedAt = evaluators[definition.id]();
    return { ...definition, achieved: Boolean(achievedAt), achievedAt };
  });
}

function unlockSources(unlock: AchievementUnlock): string[] {
  return [unlock.achievementId, ...(unlock.migratedFrom || [])];
}

/** Read-only compatibility view. This function never mutates the profile. */
export function projectLegacyMilestones(profile: Profile): MilestoneProjection[] {
  const unlocks = (profile.achievementUnlocks || []).flatMap(unlockSources);
  const projections: MilestoneProjection[] = [];
  (Object.keys(LEGACY_MILESTONE_SOURCES) as MilestoneId[]).forEach(milestoneId => {
    const sources = new Set(LEGACY_MILESTONE_SOURCES[milestoneId]);
    const timestamps = (profile.achievementUnlocks || [])
      .filter(unlock => unlockSources(unlock).some(source => sources.has(source)))
      .map(unlock => validDate(unlock.unlockedAt))
      .filter((date): date is Date => Boolean(date));
    if (timestamps.length === 0 || !unlocks.some(source => sources.has(source))) return;
    const achievedAt = timestamps.sort((left, right) => left.getTime() - right.getTime())[0];
    projections.push({ milestoneId, achievedAt, source: 'legacy-projection' });
  });
  return projections;
}

export function getEffectiveMilestoneAchievements(
  profile: Profile,
): Map<MilestoneId, EffectiveMilestoneAchievement> {
  const effective = new Map<MilestoneId, EffectiveMilestoneAchievement>();
  (profile.milestoneUnlocks || []).forEach(unlock => {
    if (!MILESTONE_DEFINITIONS.some(definition => definition.id === unlock.milestoneId)) return;
    const achievedAt = validDate(unlock.achievedAt);
    if (!achievedAt) return;
    effective.set(unlock.milestoneId as MilestoneId, {
      ...unlock,
      achievedAt,
      source: 'persisted',
    });
  });
  projectLegacyMilestones(profile).forEach(projection => {
    if (!effective.has(projection.milestoneId)) effective.set(projection.milestoneId, projection);
  });
  return effective;
}

export function getNewMilestoneUnlocks(
  beforeState: Profile,
  afterState: Profile,
  occurredAt = new Date(),
): MilestoneUnlock[] {
  const beforeEffective = getEffectiveMilestoneAchievements(beforeState);
  const afterPersistedIds = new Set((afterState.milestoneUnlocks || []).map(item => item.milestoneId));
  const afterLegacyIds = new Set(projectLegacyMilestones(afterState).map(item => item.milestoneId));
  return evaluateMilestones(afterState)
    .filter(item => item.achieved)
    .filter(item => !beforeEffective.has(item.id))
    .filter(item => !afterPersistedIds.has(item.id))
    .filter(item => !afterLegacyIds.has(item.id))
    .map(item => ({
      milestoneId: item.id,
      achievedAt: item.achievedAt || new Date(occurredAt),
    }));
}

export function applyMilestoneTransition(
  beforeState: Profile,
  afterState: Profile,
  occurredAt = new Date(),
): { profile: Profile; unlocks: MilestoneUnlock[] } {
  const priorUnlocks = new Map(
    (beforeState.milestoneUnlocks || []).map(unlock => [unlock.milestoneId, unlock]),
  );
  const timestampPreservedState = afterState.milestoneUnlocks
    ? {
        ...afterState,
        milestoneUnlocks: afterState.milestoneUnlocks.map(unlock => {
          const prior = priorUnlocks.get(unlock.milestoneId);
          return prior ? { ...unlock, achievedAt: prior.achievedAt } : unlock;
        }),
      }
    : afterState;
  const unlocks = getNewMilestoneUnlocks(beforeState, timestampPreservedState, occurredAt);
  if (unlocks.length === 0) return { profile: timestampPreservedState, unlocks };
  const existing = new Set((timestampPreservedState.milestoneUnlocks || []).map(item => item.milestoneId));
  const additions = unlocks.filter(item => !existing.has(item.milestoneId));
  return {
    profile: additions.length
      ? { ...timestampPreservedState, milestoneUnlocks: [...(timestampPreservedState.milestoneUnlocks || []), ...additions] }
      : timestampPreservedState,
    unlocks: additions,
  };
}
