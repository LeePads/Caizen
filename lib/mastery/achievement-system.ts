import type {
  AchievementPath,
  AchievementUnlock,
  BalanceCheckIn,
  Profile,
} from '../types';
import { getPetMasteryStage, type PetMasteryStage } from './pet-stage';
import { getCategoryProgress } from './progress';
import { MASTERY_CATEGORY_ORDER } from './category-metadata';

export type AchievementType =
  | 'Foundation'
  | 'Practice'
  | 'Breadth'
  | 'Landmark'
  | 'Signature';

export type MasteryRankName =
  | 'Unstarted'
  | 'Apprentice'
  | 'Adept'
  | 'Expert'
  | 'Master'
  | 'Mythic';

export type MasteryMaterial =
  | 'Stone'
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Iridescent';

export type AchievementMigrationClassification =
  | 'DIRECT'
  | 'EVIDENCE'
  | 'LEGACY'
  | 'RETIRED';

export type AchievementEvaluation = {
  current: number;
  target: number;
  progress: number;
  completed: boolean;
};

export type AchievementDefinition = {
  id: string;
  name: string;
  category: AchievementPath;
  type: AchievementType;
  description: string;
  requirement: string;
  scoreWeight: number;
  petXp: number;
  gold: number;
  evaluate: (profile: Profile) => AchievementEvaluation;
};

export type EvaluatedAchievement = AchievementDefinition & {
  current: number;
  target: number;
  progress: number;
  currentlySatisfied: boolean;
  unlocked: boolean;
  /** Evidence is complete, but an earlier mastery gate still blocks it. */
  banked: boolean;
  /** Evidence is complete and all earlier gates are recorded. */
  readyToUnlock: boolean;
  unlockedAt?: Date;
  seenAt?: Date;
};

export type MasteryRank = {
  name: MasteryRankName;
  material: MasteryMaterial;
  progress: number;
  score: number;
  nextRank?: MasteryRankName;
  nextAchievementId?: string;
  completedGateTypes: AchievementType[];
  incompleteGateTypes: AchievementType[];
};

export type CategoryMastery = {
  category: AchievementPath;
  achievements: EvaluatedAchievement[];
  unlocked: number;
  total: number;
  score: number;
  rank: MasteryRank;
  /** Rank from the current evidence only, without the historical floor. */
  evidenceRank: MasteryRank;
  historicalRankFloor: MasteryRankName;
  nextAchievement?: EvaluatedAchievement;
  categoryXp: number;
  categoryLevel: number;
  categoryLevelXp: number;
  categoryNextLevelXp: number;
  categoryXpToNextRank: number;
  momentumXp: number;
};

export type LegacyAchievementRecord = {
  id: string;
  title: string;
  category: AchievementPath;
  classification: AchievementMigrationClassification;
  unlockedAt?: Date;
  activeAchievementId?: string;
};

export type AchievementSystemState = {
  achievements: EvaluatedAchievement[];
  categories: CategoryMastery[];
  legacyAchievements: LegacyAchievementRecord[];
  totalScore: number;
  overallRank: MasteryRank;
};

export type PetMasteryEligibility = {
  category: AchievementPath;
  rank: MasteryRankName;
  stage: PetMasteryStage;
  companionUnlocked: boolean;
  evolutionEligible: boolean;
  mythicResonanceEligible: boolean;
  /** Compatibility aliases for existing callers. */
  bonded: boolean;
  accessoryEligible: boolean;
  evolved: boolean;
  mature: boolean;
  resonance: boolean;
};

export const ACHIEVEMENT_MIGRATION_VERSION = 2 as const;

const TYPE_ORDER: AchievementType[] = [
  'Foundation',
  'Practice',
  'Breadth',
  'Landmark',
  'Signature',
];

const SCORE_WEIGHTS: Record<AchievementType, number> = {
  Foundation: 10,
  Practice: 20,
  Breadth: 20,
  Landmark: 25,
  Signature: 25,
};

const RANK_MATERIAL: Record<MasteryRankName, MasteryMaterial> = {
  Unstarted: 'Stone',
  Apprentice: 'Bronze',
  Adept: 'Silver',
  Expert: 'Gold',
  Master: 'Diamond',
  Mythic: 'Iridescent',
};

const RANKS: MasteryRankName[] = [
  'Unstarted',
  'Apprentice',
  'Adept',
  'Expert',
  'Master',
  'Mythic',
];

const CATEGORY_ORDER = MASTERY_CATEGORY_ORDER;

const clampProgress = (value: number) =>
  Math.min(100, Math.max(0, Math.round(value)));

const evaluation = (
  current: number,
  target: number,
  completed = current >= target,
  progress = (current / Math.max(1, target)) * 100,
): AchievementEvaluation => ({
  current: Math.max(0, current),
  target: Math.max(1, target),
  completed,
  progress: clampProgress(progress),
});

const validDate = (value: unknown): Date | null => {
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayKey = (value: unknown) => {
  const date = validDate(value);
  return date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    : null;
};

const monthKey = (value: unknown) => {
  const date = validDate(value);
  return date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    : null;
};

const weekKey = (value: unknown) => {
  const date = validDate(value);
  if (!date) return null;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return dayKey(start);
};

const uniqueKeys = (values: Array<string | null>) =>
  new Set(values.filter((value): value is string => Boolean(value)));

const nonEmpty = (value: unknown) =>
  typeof value === 'string' ? value.trim().length > 0 : Boolean(value);

type ActivityEvent = {
  date: Date;
  category: AchievementPath;
  kind: string;
};

type ProductivityEvidence = {
  created: boolean;
  completionEvents: ActivityEvent[];
  routineWeeks: Set<string>;
  completionTypesByWeek: Map<string, Set<string>>;
  plannedWeeks: Set<string>;
  resolvedCount: number;
  datedResolutionCount: number;
  resolvedMonths: Set<string>;
  completionWeeks: Set<string>;
  completionMonths: Set<string>;
  activityTypes: Set<string>;
  multiTypeWeeks: number;
};

type WellnessEvidence = {
  dimensions: Set<string>;
  weeks: Set<string>;
  months: Set<string>;
  contextRichEntries: number;
  contextRichMonths: Set<string>;
  events: ActivityEvent[];
};

type FinanceEvidence = {
  checkIns: BalanceCheckIn[];
  checkInWeeks: Set<string>;
  checkInMonths: Set<string>;
  channels: Set<string>;
  qualifiedGoals: number;
  commitmentMaintained: boolean;
  events: ActivityEvent[];
};

type CollectionEvidence = {
  surfaces: Set<string>;
  meaningfulSurfaces: Set<string>;
  weeks: Set<string>;
  meaningfulWeeks: Set<string>;
  months: Set<string>;
  meaningfulMonths: Set<string>;
  meaningfulRecords: number;
  completedArchivedPurchased: number;
  completionMonths: Set<string>;
  events: ActivityEvent[];
};

type ReflectionEvidence = {
  entries: NonNullable<Profile['journalEntries']>;
  days: Set<string>;
  weeks: Set<string>;
  months: Set<string>;
  enrichedEntries: number;
  enrichedMonths: Set<string>;
  events: ActivityEvent[];
};

const completionDate = (value: unknown, fallback?: unknown) =>
  validDate(value) || validDate(fallback);

function productivityEvidence(profile: Profile): ProductivityEvidence {
  const tasks = profile.productivityItems || [];
  const routines = profile.dailyChecklistItems || [];
  const workItems = profile.workItems || [];
  const completionEvents: ActivityEvent[] = [];
  const plannedWeeks = new Set<string>();

  tasks.forEach(item => {
    if (item.status !== 'completed') return;
    const date = completionDate(item.completedAt, item.createdAt);
    if (!date) return;
    completionEvents.push({ date, category: 'productivity', kind: 'task' });
    const week = weekKey(date);
    if (week) plannedWeeks.add(week);
  });

  const routineWeeks = uniqueKeys(
    routines.flatMap(item =>
      (item.completionHistory || [])
        .filter(entry => entry.status === 'done')
        .map(entry => weekKey(entry.date)),
    ),
  );
  const completionTypesByWeek = new Map<string, Set<string>>();
  routines.forEach(item => {
    (item.completionHistory || [])
      .filter(entry => entry.status === 'done')
      .forEach(entry => {
        const date = completionDate(entry.completedAt, entry.date);
        const key = weekKey(date);
        if (!date || !key) return;
        completionEvents.push({ date, category: 'productivity', kind: 'routine' });
        plannedWeeks.add(key);
        const types = completionTypesByWeek.get(key) || new Set<string>();
        types.add('routine');
        completionTypesByWeek.set(key, types);
      });
  });

  workItems.forEach(item => {
    if (item.type !== 'task' || item.status !== 'done') return;
    const date = completionDate(item.date, item.dueDate || item.createdAt);
    if (!date) return;
    completionEvents.push({ date, category: 'productivity', kind: 'work' });
    if (item.date || item.dueDate) {
      const week = weekKey(date);
      if (week) plannedWeeks.add(week);
    }
  });

  completionEvents.forEach(event => {
    const key = weekKey(event.date);
    if (!key) return;
    const types = completionTypesByWeek.get(key) || new Set<string>();
    types.add(event.kind);
    completionTypesByWeek.set(key, types);
  });

  const resolvedTaskIds = new Set(
    tasks.filter(item => item.status === 'completed').map(item => item.id),
  );
  const resolvedWorkIds = new Set(
    workItems
      .filter(item => item.type === 'task' && item.status === 'done')
      .map(item => item.id),
  );
  const resolvedDateIds = new Set(
    (profile.importantDates || [])
      .filter(item => item.status === 'completed' || item.resolvedAt || (item.resolutionHistory || []).length > 0)
      .map(item => item.id),
  );
  const resolvedCount = resolvedTaskIds.size + resolvedWorkIds.size + resolvedDateIds.size;
  const datedResolutionCount =
    tasks.filter(item => item.status === 'completed' && item.deadline).length +
    workItems.filter(item => item.type === 'task' && item.status === 'done' && (item.date || item.dueDate)).length +
    (profile.importantDates || []).filter(item =>
      item.status === 'completed' || item.resolvedAt || (item.resolutionHistory || []).length > 0,
    ).length;
  const resolvedMonths = uniqueKeys([
    ...tasks
      .filter(item => item.status === 'completed')
      .map(item => monthKey(completionDate(item.completedAt, item.createdAt))),
    ...workItems
      .filter(item => item.type === 'task' && item.status === 'done')
      .map(item => monthKey(completionDate(item.date, item.dueDate || item.createdAt))),
    ...(profile.importantDates || [])
      .filter(item => item.status === 'completed' || item.resolvedAt || (item.resolutionHistory || []).length > 0)
      .map(item => monthKey(item.resolvedAt || item.date)),
  ]);
  const completionWeeks = new Set(
    completionEvents
      .map(event => weekKey(event.date))
      .filter((value): value is string => Boolean(value)),
  );
  const completionMonths = uniqueKeys(completionEvents.map(event => monthKey(event.date)));
  const activityTypes = new Set(completionEvents.map(event => event.kind));

  return {
    created: tasks.some(item => nonEmpty(item.title)) ||
      routines.some(item => nonEmpty(item.title)) ||
      workItems.some(item => nonEmpty(item.title)),
    completionEvents,
    routineWeeks,
    completionTypesByWeek,
    plannedWeeks,
    resolvedCount,
    datedResolutionCount,
    resolvedMonths,
    completionWeeks,
    completionMonths,
    activityTypes,
    multiTypeWeeks: [...completionTypesByWeek.values()].filter(types => types.size >= 2).length,
  };
}

function wellnessEvidence(profile: Profile): WellnessEvidence {
  const health = profile.health || ({} as Profile['health']);
  const dimensions = new Set<string>();
  const weeks = new Set<string>();
  const months = new Set<string>();
  const contextRichMonths = new Set<string>();
  const events: ActivityEvent[] = [];
  let contextRichEntries = 0;

  const add = (dimension: string, dateValue: unknown, context = false, kind = dimension) => {
    const date = validDate(dateValue);
    if (!date) return;
    dimensions.add(dimension);
    const week = weekKey(date);
    const month = monthKey(date);
    if (week) weeks.add(week);
    if (month) months.add(month);
    if (context) {
      contextRichEntries += 1;
      if (month) contextRichMonths.add(month);
    }
    events.push({ date, category: 'wellness', kind });
  };

  (health.foodEntries || []).forEach(item => add('nutrition', item.date, nonEmpty(item.notes), 'nutrition'));
  (health.nutritionEntries || []).forEach(item => add('nutrition', item.date, nonEmpty(item.notes), 'nutrition'));
  (health.activityEntries || []).forEach(item => add('movement', item.date, nonEmpty(item.notes), 'movement'));
  (health.sleepEntries || []).forEach(item => add('sleep', item.date, nonEmpty(item.notes), 'sleep'));
  (profile.supplements || []).forEach(item => add('supplements', item.startDate || item.createdAt, nonEmpty(item.effects), 'supplements'));
  (profile.skincareProducts || []).forEach(item => add('skincare', item.startDate || item.createdAt, nonEmpty(item.effects || item.emptiedNotes), 'skincare'));

  return { dimensions, weeks, months, contextRichEntries, contextRichMonths, events };
}

function financeEvidence(profile: Profile): FinanceEvidence {
  const checkIns = profile.balanceCheckIns || [];
  const checkInWeeks = uniqueKeys(checkIns.map(item => weekKey(item.completedAt)));
  const checkInMonths = uniqueKeys(checkIns.map(item => monthKey(item.completedAt)));
  const channels = new Set<string>();
  if ((profile.wallets || []).length) channels.add('wallet');
  if ((profile.balanceProjectionRows || []).some(item => item.active !== false)) channels.add('plan');
  if ((profile.upcomingMoneyItems || []).some(item => !item.archived)) channels.add('upcoming');
  if ((profile.wallets || []).some(wallet => Number(wallet.goalTarget || 0) > 0)) channels.add('goal');
  if (checkIns.length) channels.add('check-in');
  const activePlan = (profile.balanceProjectionRows || []).some(item => item.active !== false);
  const plannedWalletIds = new Set(
    (profile.upcomingMoneyItems || [])
      .filter(item => !item.archived && item.status !== 'cancelled' && item.walletId)
      .map(item => item.walletId as string),
  );
  const qualifyingGoalWallets = (profile.wallets || []).filter(wallet => {
    const target = Number(wallet.goalTarget || 0);
    if (target <= 0 || (wallet.type !== 'savings' && !wallet.isProtected)) return false;
    const snapshots = checkIns.filter(checkIn =>
      checkIn.walletBalances.some(snapshot => snapshot.walletId === wallet.id),
    );
    const reviewedWeeks = uniqueKeys(snapshots.map(item => weekKey(item.completedAt)));
    const reviewedMonths = uniqueKeys(snapshots.map(item => monthKey(item.completedAt)));
    const completed = Number(wallet.balance || 0) >= target || snapshots.some(checkIn =>
      checkIn.walletBalances.some(snapshot => snapshot.walletId === wallet.id && snapshot.balance >= target),
    );
    const connectedToPlanning = activePlan || plannedWalletIds.has(wallet.id);
    return reviewedWeeks.size >= 3 && reviewedMonths.size >= 2 && connectedToPlanning && completed;
  });
  const commitmentMaintained = activePlan ||
    (profile.upcomingMoneyItems || []).some(item =>
      ['partially-paid', 'paid', 'received'].includes(item.status),
    ) || qualifyingGoalWallets.length > 0;
  const events = checkIns
    .map(item => validDate(item.completedAt))
    .filter((date): date is Date => Boolean(date))
    .map(date => ({ date, category: 'finance' as const, kind: 'review' }));
  return { checkIns, checkInWeeks, checkInMonths, channels, qualifiedGoals: qualifyingGoalWallets.length, commitmentMaintained, events };
}

function collectionEvidence(profile: Profile): CollectionEvidence {
  const surfaces = new Set<string>();
  const meaningfulSurfaces = new Set<string>();
  const weeks = new Set<string>();
  const meaningfulWeeks = new Set<string>();
  const months = new Set<string>();
  const meaningfulMonths = new Set<string>();
  const events: ActivityEvent[] = [];
  let meaningfulRecords = 0;
  let completedArchivedPurchased = 0;
  const completionMonths = new Set<string>();

  const add = (
    surface: string,
    records: Array<Record<string, unknown>>,
    detail: (record: Record<string, unknown>) => boolean,
    completed: (record: Record<string, unknown>) => boolean,
  ) => {
    records.forEach(record => {
      const date = validDate(record.createdAt) || validDate(record.purchaseCompletedAt) || validDate(record.completedAt);
      if (!date) return;
      surfaces.add(surface);
      const week = weekKey(date);
      const month = monthKey(date);
      if (week) weeks.add(week);
      if (month) months.add(month);
      const isMeaningful = detail(record);
      if (isMeaningful) {
        meaningfulRecords += 1;
        meaningfulSurfaces.add(surface);
        if (week) meaningfulWeeks.add(week);
        if (month) meaningfulMonths.add(month);
      }
      if (completed(record)) {
        completedArchivedPurchased += 1;
        if (month) completionMonths.add(month);
      }
      if (isMeaningful || completed(record)) {
        events.push({ date, category: 'collection', kind: surface });
      }
    });
  };

  add('inventory', (profile.inventoryItems || []) as unknown as Array<Record<string, unknown>>, item =>
    nonEmpty(item.category) && (nonEmpty(item.notes) || nonEmpty(item.image) || nonEmpty(item.productLink)),
  item => ['archived', 'retired'].includes(String(item.status)));
  add('wishlist', (profile.wishlistItems || []) as unknown as Array<Record<string, unknown>>, item =>
    nonEmpty(item.category) && (nonEmpty(item.notes) || nonEmpty(item.image) || nonEmpty(item.productLink)),
  item => Boolean(item.isBought || item.purchaseCompletedAt || item.movedToInventory));
  add('vault', (profile.personalVaultItems || []) as unknown as Array<Record<string, unknown>>, item =>
    nonEmpty(item.type) && (nonEmpty(item.notes) || nonEmpty(item.image) || nonEmpty(item.link)),
  () => false);
  add('media', (profile.mediaItems || []) as unknown as Array<Record<string, unknown>>, item =>
    nonEmpty(item.type) && (nonEmpty(item.notes) || nonEmpty(item.rating) || nonEmpty(item.image) || nonEmpty(item.catalogId)),
  item => String(item.status) === 'completed');
  add('games', (profile.games || []) as unknown as Array<Record<string, unknown>>, item =>
    nonEmpty(item.genre) && (nonEmpty(item.notes) || nonEmpty(item.image) || nonEmpty(item.website)),
  item => ['completed', 'finished', 'done'].includes(String(item.status)));
  add('music', (profile.musicItems || []) as unknown as Array<Record<string, unknown>>, item =>
    nonEmpty(item.type || item.genre || item.playlist) && (nonEmpty(item.notes) || nonEmpty(item.image) || nonEmpty(item.url)),
  () => false);

  return {
    surfaces,
    meaningfulSurfaces,
    weeks,
    meaningfulWeeks,
    months,
    meaningfulMonths,
    meaningfulRecords,
    completedArchivedPurchased,
    completionMonths,
    events,
  };
}

function reflectionEvidence(profile: Profile): ReflectionEvidence {
  const entries = (profile.journalEntries || []).filter(item => nonEmpty(item.content));
  const days = uniqueKeys(entries.map(item => dayKey(item.date)));
  const weeks = uniqueKeys(entries.map(item => weekKey(item.date)));
  const months = uniqueKeys(entries.map(item => monthKey(item.date)));
  const enrichedEntries = entries.filter(item =>
    nonEmpty(item.title) || nonEmpty(item.mood) || nonEmpty(item.image) ||
    (item.photoAssetIds || []).length > 0 || (item.attachmentAssetIds || []).length > 0,
  ).length;
  const enrichedMonths = uniqueKeys(entries
    .filter(item =>
      nonEmpty(item.title) || nonEmpty(item.mood) || nonEmpty(item.image) ||
      (item.photoAssetIds || []).length > 0 || (item.attachmentAssetIds || []).length > 0,
    )
    .map(item => monthKey(item.date)));
  const events = entries
    .map(item => validDate(item.date))
    .filter((date): date is Date => Boolean(date))
    .map(date => ({ date, category: 'reflection' as const, kind: 'journal' }));
  return { entries, days, weeks, months, enrichedEntries, enrichedMonths, events };
}

function disciplineEvents(
  productivity: ProductivityEvidence,
  wellness: WellnessEvidence,
  finance: FinanceEvidence,
  collection: CollectionEvidence,
  reflection: ReflectionEvidence,
) {
  const events = [
    ...productivity.completionEvents,
    ...wellness.events,
    ...finance.events,
    ...collection.events,
    ...reflection.events,
  ];
  const deduped = new Map<string, ActivityEvent>();
  events.forEach(event => {
    const key = `${event.category}:${event.kind}:${dayKey(event.date)}`;
    if (!deduped.has(key)) deduped.set(key, event);
  });
  return [...deduped.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

const p = (profile: Profile) => productivityEvidence(profile);
const w = (profile: Profile) => wellnessEvidence(profile);
const f = (profile: Profile) => financeEvidence(profile);
const c = (profile: Profile) => collectionEvidence(profile);
const r = (profile: Profile) => reflectionEvidence(profile);

export const ACTIVE_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'productivity-first-shape', name: 'First Shape', category: 'productivity', type: 'Foundation',
    description: 'Shape one intention, then follow it through.',
    requirement: 'Create a personal task or routine, then complete one planned task, routine occurrence, or Work Hub item.',
    scoreWeight: SCORE_WEIGHTS.Foundation, petXp: 4, gold: 2,
    evaluate: profile => { const e = p(profile); return evaluation(e.created && e.completionEvents.length > 0 ? 1 : 0, 1); },
  },
  {
    id: 'productivity-steady-rhythm', name: 'Steady Rhythm', category: 'productivity', type: 'Practice',
    description: 'A repeatable rhythm is taking shape.',
    requirement: 'Record meaningful productivity activity in 6 distinct calendar weeks, including planned or scheduled activity in at least 4 weeks.',
    scoreWeight: SCORE_WEIGHTS.Practice, petXp: 6, gold: 4,
    evaluate: profile => { const e = p(profile); return evaluation(Math.min(e.completionWeeks.size, 6), 6, e.completionWeeks.size >= 6 && e.plannedWeeks.size >= 4, Math.min(e.completionWeeks.size / 6, e.plannedWeeks.size / 4) * 100); },
  },
  {
    id: 'productivity-three-ways-forward', name: 'Three Ways Forward', category: 'productivity', type: 'Breadth',
    description: 'Use more than one way to move life forward.',
    requirement: 'Use personal tasks, routines, and Work Hub across at least 8 distinct weeks, with each activity type represented more than once.',
    scoreWeight: SCORE_WEIGHTS.Breadth, petXp: 8, gold: 6,
    evaluate: profile => {
      const e = p(profile);
      const types = new Set(e.completionEvents.map(item => item.kind));
      const counts = new Map<string, number>();
      e.completionEvents.forEach(event => counts.set(event.kind, (counts.get(event.kind) || 0) + 1));
      const repeatedTypes = [...counts.values()].filter(count => count > 1).length;
      return evaluation(Math.min(e.completionWeeks.size, 8), 8, types.has('task') && types.has('routine') && types.has('work') && e.completionWeeks.size >= 8 && repeatedTypes >= 3, Math.min(e.completionWeeks.size / 8, types.size / 3, repeatedTypes / 3) * 100);
    },
  },
  {
    id: 'productivity-clear-runway', name: 'Clear the Runway', category: 'productivity', type: 'Landmark',
    description: 'Dated commitments are being resolved with care.',
    requirement: 'Resolve approximately 12 meaningful planned or date-aware items, including several deadline-aware completions, across at least 3 calendar months.',
    scoreWeight: SCORE_WEIGHTS.Landmark, petXp: 12, gold: 10,
    evaluate: profile => { const e = p(profile); return evaluation(Math.min(e.resolvedCount, 12), 12, e.resolvedCount >= 12 && e.datedResolutionCount >= 4 && e.resolvedMonths.size >= 3, Math.min(e.resolvedCount / 12, e.datedResolutionCount / 4, e.resolvedMonths.size / 3) * 100); },
  },
  {
    id: 'productivity-week-that-holds', name: 'A Week That Holds', category: 'productivity', type: 'Signature',
    description: 'Your plans hold across time and more than one kind of work.',
    requirement: 'Record meaningful productivity activity across approximately 36 distinct weeks spanning at least 9 calendar months, with multiple activity types appearing throughout.',
    scoreWeight: SCORE_WEIGHTS.Signature, petXp: 18, gold: 18,
    evaluate: profile => { const e = p(profile); return evaluation(Math.min(e.completionWeeks.size, 36), 36, e.completionWeeks.size >= 36 && e.completionMonths.size >= 9 && e.activityTypes.size >= 2 && e.multiTypeWeeks >= 6, Math.min(e.completionWeeks.size / 36, e.completionMonths.size / 9, e.activityTypes.size / 2, e.multiTypeWeeks / 6) * 100); },
  },
  {
    id: 'wellness-first-care', name: 'First Care', category: 'wellness', type: 'Foundation',
    description: 'Begin a record of caring attention.',
    requirement: 'Save one supported wellness record.',
    scoreWeight: SCORE_WEIGHTS.Foundation, petXp: 4, gold: 2,
    evaluate: profile => evaluation(w(profile).events.length > 0 ? 1 : 0, 1),
  },
  {
    id: 'wellness-gentle-rhythm', name: 'Gentle Rhythm', category: 'wellness', type: 'Practice',
    description: 'Care is returning without pressure.',
    requirement: 'Record wellness activity in 6 distinct calendar weeks, without requiring a streak.',
    scoreWeight: SCORE_WEIGHTS.Practice, petXp: 6, gold: 4,
    evaluate: profile => evaluation(w(profile).weeks.size, 6),
  },
  {
    id: 'wellness-whole-self', name: 'Whole Self', category: 'wellness', type: 'Breadth',
    description: 'Notice more than one dimension of wellbeing.',
    requirement: 'Use at least 3 supported wellness dimensions across approximately 10 distinct calendar weeks.',
    scoreWeight: SCORE_WEIGHTS.Breadth, petXp: 8, gold: 6,
    evaluate: profile => { const e = w(profile); return evaluation(Math.min(e.dimensions.size, 3), 3, e.dimensions.size >= 3 && e.weeks.size >= 10, Math.min(e.dimensions.size / 3, e.weeks.size / 10) * 100); },
  },
  {
    id: 'wellness-care-baseline', name: 'Care Baseline', category: 'wellness', type: 'Landmark',
    description: 'A broad, grounded picture of care is emerging.',
    requirement: 'Use at least 4 dimensions across approximately 16 distinct weeks and 4 calendar months, with several context-rich entries.',
    scoreWeight: SCORE_WEIGHTS.Landmark, petXp: 12, gold: 10,
    evaluate: profile => { const e = w(profile); return evaluation(Math.min(e.dimensions.size, 4), 4, e.dimensions.size >= 4 && e.weeks.size >= 16 && e.months.size >= 4 && e.contextRichEntries >= 4, Math.min(e.dimensions.size / 4, e.weeks.size / 16, e.months.size / 4, e.contextRichEntries / 4) * 100); },
  },
  {
    id: 'wellness-sustainable-care', name: 'Sustainable Care', category: 'wellness', type: 'Signature',
    description: 'Care has become a sustainable part of your life.',
    requirement: 'Record care across approximately 36 distinct weeks and 9 calendar months, using at least 4 dimensions with context-rich entries distributed throughout.',
    scoreWeight: SCORE_WEIGHTS.Signature, petXp: 18, gold: 18,
    evaluate: profile => { const e = w(profile); return evaluation(Math.min(e.weeks.size, 36), 36, e.weeks.size >= 36 && e.months.size >= 9 && e.dimensions.size >= 4 && e.contextRichEntries >= 6 && e.contextRichMonths.size >= 4, Math.min(e.weeks.size / 36, e.months.size / 9, e.dimensions.size / 4, e.contextRichEntries / 6, e.contextRichMonths.size / 4) * 100); },
  },
  {
    id: 'finance-first-ledger', name: 'First Ledger', category: 'finance', type: 'Foundation',
    description: 'See your money clearly enough to begin.',
    requirement: 'Create a wallet and complete the first balance check-in.',
    scoreWeight: SCORE_WEIGHTS.Foundation, petXp: 4, gold: 2,
    evaluate: profile => evaluation((profile.wallets || []).length > 0 && (profile.balanceCheckIns || []).length > 0 ? 1 : 0, 1),
  },
  {
    id: 'finance-money-rhythm', name: 'Money Rhythm', category: 'finance', type: 'Practice',
    description: 'Your money snapshot is becoming a habit of clarity.',
    requirement: 'Complete balance check-ins in approximately 6 distinct calendar weeks.',
    scoreWeight: SCORE_WEIGHTS.Practice, petXp: 6, gold: 4,
    evaluate: profile => evaluation(f(profile).checkInWeeks.size, 6),
  },
  {
    id: 'finance-clear-channels', name: 'Clear Channels', category: 'finance', type: 'Breadth',
    description: 'Use several tools to understand and direct your money.',
    requirement: 'Use at least 3 finance planning surfaces, with evidence distributed across approximately 2 calendar months.',
    scoreWeight: SCORE_WEIGHTS.Breadth, petXp: 8, gold: 6,
    evaluate: profile => { const e = f(profile); return evaluation(Math.min(e.channels.size, 3), 3, e.channels.size >= 3 && e.checkInMonths.size >= 2, Math.min(e.channels.size / 3, e.checkInMonths.size / 2) * 100); },
  },
  {
    id: 'finance-protected-goal', name: 'Protected Goal', category: 'finance', type: 'Landmark',
    description: 'One goal has been given a clear place to land.',
    requirement: 'Complete a qualifying savings goal after it has appeared in multiple review periods and is connected to actual planning.',
    scoreWeight: SCORE_WEIGHTS.Landmark, petXp: 12, gold: 10,
    evaluate: profile => evaluation(Math.min(f(profile).qualifiedGoals, 1), 1),
  },
  {
    id: 'finance-prepared-season', name: 'Prepared Season', category: 'finance', type: 'Signature',
    description: 'Your financial picture is reviewed across a real season.',
    requirement: 'Review finances across approximately 9 calendar months, use multiple planning tools, and complete or maintain one meaningful financial commitment.',
    scoreWeight: SCORE_WEIGHTS.Signature, petXp: 18, gold: 18,
    evaluate: profile => { const e = f(profile); return evaluation(Math.min(e.checkInMonths.size, 9), 9, e.checkInMonths.size >= 9 && e.channels.size >= 3 && e.commitmentMaintained, Math.min(e.checkInMonths.size / 9, e.channels.size / 3, e.commitmentMaintained ? 1 : 0) * 100); },
  },
  {
    id: 'collection-first-keepsake', name: 'First Keepsake', category: 'collection', type: 'Foundation',
    description: 'Give one thing that matters a place in your system.',
    requirement: 'Create one meaningful record in a supported Collection surface.',
    scoreWeight: SCORE_WEIGHTS.Foundation, petXp: 4, gold: 2,
    evaluate: profile => evaluation(c(profile).meaningfulRecords > 0 ? 1 : 0, 1),
  },
  {
    id: 'collection-curated-rhythm', name: 'Curated Rhythm', category: 'collection', type: 'Practice',
    description: 'Your collection is being tended over time.',
    requirement: 'Create or complete meaningful collection activity in 6 distinct calendar weeks.',
    scoreWeight: SCORE_WEIGHTS.Practice, petXp: 6, gold: 4,
    evaluate: profile => evaluation(c(profile).meaningfulWeeks.size, 6),
  },
  {
    id: 'collection-many-rooms', name: 'Many Rooms', category: 'collection', type: 'Breadth',
    description: 'Curiosity and care have more than one home.',
    requirement: 'Use at least 4 collection surfaces, with activity distributed across approximately 2 calendar months.',
    scoreWeight: SCORE_WEIGHTS.Breadth, petXp: 8, gold: 6,
    evaluate: profile => { const e = c(profile); return evaluation(Math.min(e.meaningfulSurfaces.size, 4), 4, e.meaningfulSurfaces.size >= 4 && e.meaningfulMonths.size >= 2, Math.min(e.meaningfulSurfaces.size / 4, e.meaningfulMonths.size / 2) * 100); },
  },
  {
    id: 'collection-context-kept', name: 'Context Kept', category: 'collection', type: 'Landmark',
    description: 'Your records carry enough context to remain useful.',
    requirement: 'Maintain meaningful contextual records across multiple collection surfaces for approximately 4 calendar months.',
    scoreWeight: SCORE_WEIGHTS.Landmark, petXp: 12, gold: 10,
    evaluate: profile => { const e = c(profile); return evaluation(Math.min(e.meaningfulMonths.size, 4), 4, e.meaningfulMonths.size >= 4 && e.meaningfulSurfaces.size >= 3 && e.meaningfulRecords >= 4, Math.min(e.meaningfulMonths.size / 4, e.meaningfulSurfaces.size / 3, e.meaningfulRecords / 4) * 100); },
  },
  {
    id: 'collection-living-archive', name: 'Living Archive', category: 'collection', type: 'Signature',
    description: 'Your archive reflects a life being actively curated.',
    requirement: 'Sustain meaningful collection activity across approximately 9 calendar months, use at least 4 surfaces, and distribute meaningful completion, archive, purchase, or status activity over time.',
    scoreWeight: SCORE_WEIGHTS.Signature, petXp: 18, gold: 18,
    evaluate: profile => { const e = c(profile); return evaluation(Math.min(e.meaningfulMonths.size, 9), 9, e.meaningfulMonths.size >= 9 && e.meaningfulSurfaces.size >= 4 && e.completionMonths.size >= 3, Math.min(e.meaningfulMonths.size / 9, e.meaningfulSurfaces.size / 4, e.completionMonths.size / 3) * 100); },
  },
  {
    id: 'reflection-first-note', name: 'First Note', category: 'reflection', type: 'Foundation',
    description: 'Make room for one honest note.',
    requirement: 'Write a first non-empty Journal entry.',
    scoreWeight: SCORE_WEIGHTS.Foundation, petXp: 4, gold: 2,
    evaluate: profile => evaluation(r(profile).entries.some(item => nonEmpty(item.content)) ? 1 : 0, 1),
  },
  {
    id: 'reflection-returning-page', name: 'Returning Page', category: 'reflection', type: 'Practice',
    description: 'Reflection is becoming something you return to.',
    requirement: 'Write on approximately 10 distinct dates spanning at least 6 calendar weeks.',
    scoreWeight: SCORE_WEIGHTS.Practice, petXp: 6, gold: 4,
    evaluate: profile => { const e = r(profile); return evaluation(Math.min(e.days.size, 10), 10, e.days.size >= 10 && e.weeks.size >= 6, Math.min(e.days.size / 10, e.weeks.size / 6) * 100); },
  },
  {
    id: 'reflection-fuller-view', name: 'Fuller View', category: 'reflection', type: 'Breadth',
    description: 'Your notes hold more than a single point of view.',
    requirement: 'Write richer, enriched reflections distributed across approximately 3 calendar months.',
    scoreWeight: SCORE_WEIGHTS.Breadth, petXp: 8, gold: 6,
    evaluate: profile => { const e = r(profile); return evaluation(Math.min(e.enrichedEntries, 5), 5, e.enrichedEntries >= 5 && e.enrichedMonths.size >= 3, Math.min(e.enrichedEntries / 5, e.enrichedMonths.size / 3) * 100); },
  },
  {
    id: 'reflection-inner-chronicle', name: 'Inner Chronicle', category: 'reflection', type: 'Landmark',
    description: 'A broader record of life is taking shape.',
    requirement: 'Write on approximately 30 distinct dates across at least 6 calendar months, including enriched entries throughout.',
    scoreWeight: SCORE_WEIGHTS.Landmark, petXp: 12, gold: 10,
    evaluate: profile => { const e = r(profile); return evaluation(Math.min(e.days.size, 30), 30, e.days.size >= 30 && e.months.size >= 6 && e.enrichedEntries >= 6 && e.enrichedMonths.size >= 3, Math.min(e.days.size / 30, e.months.size / 6, e.enrichedEntries / 6, e.enrichedMonths.size / 3) * 100); },
  },
  {
    id: 'reflection-look-back-carry-forward', name: 'Look Back, Carry Forward', category: 'reflection', type: 'Signature',
    description: 'Reflection has become a durable thread through your seasons.',
    requirement: 'Sustain meaningful reflection across approximately 9 calendar months, with distinct dates and enriched entries distributed throughout.',
    scoreWeight: SCORE_WEIGHTS.Signature, petXp: 18, gold: 18,
    evaluate: profile => { const e = r(profile); return evaluation(Math.min(e.days.size, 36), 36, e.days.size >= 36 && e.months.size >= 9 && e.enrichedEntries >= 9 && e.enrichedMonths.size >= 6, Math.min(e.days.size / 36, e.months.size / 9, e.enrichedEntries / 9, e.enrichedMonths.size / 6) * 100); },
  },
  {
    id: 'discipline-three-threads', name: 'Three Threads', category: 'discipline', type: 'Foundation',
    description: 'Different parts of life are beginning to connect.',
    requirement: 'Create meaningful records or actions in 3 distinct mastery categories.',
    scoreWeight: SCORE_WEIGHTS.Foundation, petXp: 4, gold: 2,
    evaluate: profile => { const events = disciplineEvents(p(profile), w(profile), f(profile), c(profile), r(profile)); return evaluation(new Set(events.map(item => item.category)).size, 3); },
  },
  {
    id: 'discipline-return-to-work', name: 'Return to the Work', category: 'discipline', type: 'Practice',
    description: 'Returning matters more than never missing.',
    requirement: 'Record meaningful actions in 3 or more categories across approximately 6 distinct weeks, including a genuine return after an inactive period.',
    scoreWeight: SCORE_WEIGHTS.Practice, petXp: 6, gold: 4,
    evaluate: profile => {
      const events = disciplineEvents(p(profile), w(profile), f(profile), c(profile), r(profile));
      const weeks = uniqueKeys(events.map(item => weekKey(item.date)));
      const categories = new Set(events.map(item => item.category));
      const days = [...new Set(events.map(item => dayKey(item.date)).filter((value): value is string => Boolean(value)))]
        .map(value => new Date(`${value}T12:00:00`)).sort((a, b) => a.getTime() - b.getTime());
      const returned = days.some((date, index) => index > 0 && date.getTime() - days[index - 1].getTime() >= 8 * 86_400_000);
      return evaluation(Math.min(weeks.size, 6), 6, weeks.size >= 6 && categories.size >= 3 && returned, Math.min(weeks.size / 6, categories.size / 3, returned ? 1 : 0) * 100);
    },
  },
  {
    id: 'discipline-connected-practice', name: 'Connected Practice', category: 'discipline', type: 'Breadth',
    description: 'Several areas are supporting one another.',
    requirement: 'Take meaningful actions in at least 4 categories, distributed across approximately 3 calendar months.',
    scoreWeight: SCORE_WEIGHTS.Breadth, petXp: 8, gold: 6,
    evaluate: profile => { const events = disciplineEvents(p(profile), w(profile), f(profile), c(profile), r(profile)); const categories = new Set(events.map(item => item.category)); const months = uniqueKeys(events.map(item => monthKey(item.date))); return evaluation(Math.min(categories.size, 4), 4, categories.size >= 4 && months.size >= 3, Math.min(categories.size / 4, months.size / 3) * 100); },
  },
  {
    id: 'discipline-follow-through', name: 'Follow Through', category: 'discipline', type: 'Landmark',
    description: 'Follow-through is visible across more than one part of life.',
    requirement: 'Complete or review meaningful activity across at least 4 categories and multiple action types, distributed across approximately 6 calendar months.',
    scoreWeight: SCORE_WEIGHTS.Landmark, petXp: 12, gold: 10,
    evaluate: profile => { const events = disciplineEvents(p(profile), w(profile), f(profile), c(profile), r(profile)); const categories = new Set(events.map(item => item.category)); const kinds = new Set(events.map(item => item.kind)); const months = uniqueKeys(events.map(item => monthKey(item.date))); return evaluation(Math.min(events.length, 12), 12, events.length >= 12 && categories.size >= 4 && kinds.size >= 3 && months.size >= 6, Math.min(events.length / 12, categories.size / 4, kinds.size / 3, months.size / 6) * 100); },
  },
  {
    id: 'discipline-balanced-season', name: 'Balanced Season', category: 'discipline', type: 'Signature',
    description: 'Your system supports a balanced season of life.',
    requirement: 'Sustain integrated activity across at least 4 categories for approximately 9 calendar months, distributed over the season without requiring perfect weekly coverage.',
    scoreWeight: SCORE_WEIGHTS.Signature, petXp: 18, gold: 18,
    evaluate: profile => {
      const events = disciplineEvents(p(profile), w(profile), f(profile), c(profile), r(profile));
      const months = new Map<string, Set<AchievementPath>>();
      events.forEach(event => { const key = monthKey(event.date); if (!key) return; const categories = months.get(key) || new Set<AchievementPath>(); categories.add(event.category); months.set(key, categories); });
      const contributing = new Set(events.map(item => item.category));
      const multiAreaMonths = [...months.values()].filter(categories => categories.size >= 2).length;
      return evaluation(Math.min(months.size, 9), 9, months.size >= 9 && contributing.size >= 4 && multiAreaMonths >= 6, Math.min(months.size / 9, contributing.size / 4, multiAreaMonths / 6) * 100);
    },
  },
] as const;

type LegacyMapping = {
  id: string;
  title: string;
  category: AchievementPath;
  classification: AchievementMigrationClassification;
  activeAchievementId?: string;
  sourceIds?: string[];
};

export const LEGACY_ACHIEVEMENTS: readonly LegacyMapping[] = [
  { id: 'productivity-first-task', title: 'Quest Accepted', category: 'productivity', classification: 'EVIDENCE', activeAchievementId: 'productivity-first-shape' },
  { id: 'productivity-first-completion', title: 'First Step', category: 'productivity', classification: 'DIRECT', activeAchievementId: 'productivity-first-shape' },
  { id: 'productivity-clear-deck', title: 'Clear the Deck', category: 'productivity', classification: 'RETIRED' },
  { id: 'productivity-ahead-10', title: 'Ahead of Schedule', category: 'productivity', classification: 'EVIDENCE', activeAchievementId: 'productivity-clear-runway' },
  { id: 'productivity-complete-10', title: 'Momentum Maker', category: 'productivity', classification: 'RETIRED' },
  { id: 'productivity-complete-25', title: 'Deadline Slayer', category: 'productivity', classification: 'EVIDENCE', activeAchievementId: 'productivity-clear-runway' },
  { id: 'productivity-complete-100', title: 'Execution Engine', category: 'productivity', classification: 'RETIRED' },
  { id: 'productivity-first-routine', title: 'Daily Anchor', category: 'productivity', classification: 'EVIDENCE', activeAchievementId: 'productivity-first-shape' },
  { id: 'productivity-routine-days-7', title: 'Consistent Rhythm', category: 'productivity', classification: 'EVIDENCE', activeAchievementId: 'productivity-steady-rhythm' },
  { id: 'productivity-life-admin-5', title: 'Life Admin', category: 'productivity', classification: 'EVIDENCE', activeAchievementId: 'productivity-clear-runway' },
  { id: 'productivity-routine-50', title: 'Rhythm Keeper', category: 'productivity', classification: 'EVIDENCE', activeAchievementId: 'productivity-steady-rhythm' },
  { id: 'productivity-first-project', title: 'Project Spark', category: 'productivity', classification: 'EVIDENCE', activeAchievementId: 'productivity-three-ways-forward' },
  { id: 'productivity-work-done-10', title: 'Delivery Line', category: 'productivity', classification: 'EVIDENCE', activeAchievementId: 'productivity-three-ways-forward' },
  { id: 'wellness-first-food', title: 'First Fuel Log', category: 'wellness', classification: 'DIRECT', activeAchievementId: 'wellness-first-care' },
  { id: 'wellness-food-days-7', title: 'One Week Logged', category: 'wellness', classification: 'EVIDENCE', activeAchievementId: 'wellness-gentle-rhythm' },
  { id: 'wellness-food-days-30', title: 'Nutrition Rhythm', category: 'wellness', classification: 'RETIRED', activeAchievementId: 'wellness-gentle-rhythm' },
  { id: 'wellness-first-activity', title: 'First Movement', category: 'wellness', classification: 'DIRECT', activeAchievementId: 'wellness-first-care' },
  { id: 'wellness-active-days-10', title: 'Active Days', category: 'wellness', classification: 'EVIDENCE', activeAchievementId: 'wellness-gentle-rhythm' },
  { id: 'wellness-sleep-7', title: 'Rest Ritual', category: 'wellness', classification: 'EVIDENCE', activeAchievementId: 'wellness-whole-self' },
  { id: 'wellness-weight-4', title: 'Trend Starter', category: 'wellness', classification: 'EVIDENCE', activeAchievementId: 'wellness-whole-self' },
  { id: 'wellness-supplement-5', title: 'Wellness Cabinet', category: 'wellness', classification: 'EVIDENCE', activeAchievementId: 'wellness-whole-self' },
  { id: 'finance-first-wallet', title: 'First Wallet', category: 'finance', classification: 'EVIDENCE', activeAchievementId: 'finance-first-ledger' },
  { id: 'finance-first-plan', title: 'Clear Plan', category: 'finance', classification: 'EVIDENCE', activeAchievementId: 'finance-clear-channels' },
  { id: 'finance-first-review', title: 'First Snapshot', category: 'finance', classification: 'EVIDENCE', activeAchievementId: 'finance-first-ledger' },
  { id: 'finance-review-4', title: 'Money Rhythm', category: 'finance', classification: 'EVIDENCE', activeAchievementId: 'finance-money-rhythm' },
  { id: 'finance-review-12', title: 'Prepared Year', category: 'finance', classification: 'EVIDENCE', activeAchievementId: 'finance-prepared-season' },
  { id: 'finance-goal', title: 'Protected Goal', category: 'finance', classification: 'EVIDENCE', activeAchievementId: 'finance-protected-goal' },
  { id: 'finance-goal-complete', title: 'Goal Reached', category: 'finance', classification: 'DIRECT', activeAchievementId: 'finance-protected-goal' },
  { id: 'collection-first-item', title: 'First Gear Logged', category: 'collection', classification: 'DIRECT', activeAchievementId: 'collection-first-keepsake' },
  { id: 'collection-inventory-10', title: 'Gear Keeper', category: 'collection', classification: 'EVIDENCE', activeAchievementId: 'collection-context-kept' },
  { id: 'collection-vault-10', title: 'Archive Guardian', category: 'collection', classification: 'EVIDENCE', activeAchievementId: 'collection-context-kept' },
  { id: 'collection-catalog-first', title: 'Opening Credits', category: 'collection', classification: 'EVIDENCE', activeAchievementId: 'collection-many-rooms' },
  { id: 'collection-active-media-5', title: 'Currently Watching', category: 'collection', classification: 'EVIDENCE', activeAchievementId: 'collection-curated-rhythm' },
  { id: 'collection-media-first-complete', title: 'Season Finale', category: 'collection', classification: 'EVIDENCE', activeAchievementId: 'collection-curated-rhythm' },
  { id: 'collection-media-5', title: 'Credits Rolled', category: 'collection', classification: 'EVIDENCE', activeAchievementId: 'collection-living-archive' },
  { id: 'collection-across-mediums', title: 'Across Mediums', category: 'collection', classification: 'EVIDENCE', activeAchievementId: 'collection-many-rooms' },
  { id: 'reflection-media-notes-10', title: 'Thoughtful Viewer', category: 'reflection', classification: 'EVIDENCE', activeAchievementId: 'reflection-fuller-view' },
  { id: 'collection-games-5', title: 'Campaign Finisher', category: 'collection', classification: 'EVIDENCE', activeAchievementId: 'collection-living-archive' },
  { id: 'collection-playlists-3', title: 'Playlist Curator', category: 'collection', classification: 'EVIDENCE', activeAchievementId: 'collection-many-rooms' },
  { id: 'collection-archive-50', title: 'Personal Archivist', category: 'collection', classification: 'RETIRED' },
  { id: 'reflection-first', title: 'First Reflection', category: 'reflection', classification: 'DIRECT', activeAchievementId: 'reflection-first-note' },
  { id: 'reflection-days-7', title: 'Memory Scribe', category: 'reflection', classification: 'EVIDENCE', activeAchievementId: 'reflection-returning-page' },
  { id: 'reflection-days-30', title: 'Inner Chronicle', category: 'reflection', classification: 'EVIDENCE', activeAchievementId: 'reflection-inner-chronicle' },
  { id: 'reflection-days-100', title: 'Life Historian', category: 'reflection', classification: 'RETIRED', activeAchievementId: 'reflection-look-back-carry-forward' },
  { id: 'discipline-three-areas', title: 'Life OS Online', category: 'discipline', classification: 'EVIDENCE', activeAchievementId: 'discipline-three-threads' },
  { id: 'discipline-six-areas', title: 'Connected Life', category: 'discipline', classification: 'EVIDENCE', activeAchievementId: 'discipline-connected-practice' },
  { id: 'discipline-nine-areas', title: 'Whole System', category: 'discipline', classification: 'RETIRED' },
  { id: 'discipline-actions-25', title: 'Follow Through', category: 'discipline', classification: 'EVIDENCE', activeAchievementId: 'discipline-follow-through' },
  { id: 'discipline-actions-100', title: 'Steady Operator', category: 'discipline', classification: 'EVIDENCE', activeAchievementId: 'discipline-follow-through' },
  { id: 'discipline-clear-day', title: 'Clear Runway', category: 'discipline', classification: 'LEGACY' },
] as const;

const ACTIVE_BY_ID = new Map(ACTIVE_ACHIEVEMENTS.map(item => [item.id, item]));
const LEGACY_BY_ID = new Map(LEGACY_ACHIEVEMENTS.map(item => [item.id, item]));

function rankForAchievements(achievements: EvaluatedAchievement[]): MasteryRank {
  const completedTypes = new Set(
    achievements.filter(item => item.unlocked).map(item => item.type),
  );
  let rankIndex = completedTypes.has('Foundation') ? 1 : 0;
  if (rankIndex && completedTypes.has('Practice')) rankIndex = 2;
  if (rankIndex >= 2 && completedTypes.has('Breadth')) rankIndex = 3;
  if (rankIndex >= 3 && completedTypes.has('Landmark')) rankIndex = 4;
  if (rankIndex >= 4 && completedTypes.has('Signature')) rankIndex = 5;
  const name = RANKS[rankIndex];
  const score = achievements.reduce((sum, item) => sum + (item.unlocked ? item.scoreWeight : 0), 0);
  const nextType = TYPE_ORDER[rankIndex === 0 ? 0 : rankIndex];
  const incompleteGateTypes = TYPE_ORDER.filter(type => !completedTypes.has(type));
  const completedGateTypes = TYPE_ORDER.filter(type => completedTypes.has(type));
  const nextAchievement = achievements.find(item => item.type === nextType && !item.unlocked);
  return {
    name,
    material: RANK_MATERIAL[name],
    progress: clampProgress(score),
    score,
    nextRank: RANKS[rankIndex + 1],
    nextAchievementId: nextAchievement?.id,
    completedGateTypes,
    incompleteGateTypes,
  };
}

function rankForEvidence(achievements: EvaluatedAchievement[]): MasteryRank {
  let gateOpen = true;
  const evidenceAchievements = achievements.map(item => {
    const unlocked = gateOpen && item.currentlySatisfied;
    gateOpen = unlocked;
    return { ...item, unlocked };
  });
  return rankForAchievements(evidenceAchievements);
}

function maxRankName(first: MasteryRankName, second: MasteryRankName) {
  return RANKS[Math.max(RANKS.indexOf(first), RANKS.indexOf(second))];
}

function historicalRankFloor(profile: Profile, category: AchievementPath): MasteryRankName {
  return profile.masteryRankFloors?.[category] || 'Unstarted';
}

function legacyRecords(profile: Profile, activeIds: Set<string>): LegacyAchievementRecord[] {
  const unlockMap = new Map((profile.achievementUnlocks || []).map(item => [item.achievementId, item]));
  return [...unlockMap.entries()]
    .filter(([id]) => !activeIds.has(id))
    .map(([id, unlock]) => {
      const known = LEGACY_BY_ID.get(id);
      return {
        id,
        title: known?.title || 'Legacy achievement',
        category: known?.category || 'discipline',
        classification: known?.classification || 'LEGACY',
        unlockedAt: unlock.unlockedAt ? new Date(unlock.unlockedAt) : undefined,
        activeAchievementId: known?.activeAchievementId,
      };
    })
    .sort((a, b) => (b.unlockedAt?.getTime() || 0) - (a.unlockedAt?.getTime() || 0));
}

export function evaluateAchievementSystem(profile: Profile): AchievementSystemState {
  const persisted = new Map((profile.achievementUnlocks || []).map(item => [item.achievementId, item]));
  const achievements = CATEGORY_ORDER.flatMap(category => {
    const floorIndex = RANKS.indexOf(historicalRankFloor(profile, category));
    const definitions = ACTIVE_ACHIEVEMENTS.filter(item => item.category === category);
    return definitions.map((definition, index) => {
      const result = definition.evaluate(profile);
      const unlock = persisted.get(definition.id);
      const historical = floorIndex > index;
      const previousGateRecorded = index === 0 ||
        Boolean(persisted.has(definitions[index - 1].id)) || floorIndex >= index;
      const readyToUnlock = !historical && !unlock && result.completed && previousGateRecorded;
      const unlocked = Boolean(unlock || historical || readyToUnlock);
      return {
        ...definition,
        ...result,
        currentlySatisfied: result.completed,
        unlocked,
        banked: result.completed && !unlocked,
        readyToUnlock,
        unlockedAt: unlock?.unlockedAt ? new Date(unlock.unlockedAt) : undefined,
        seenAt: unlock?.seenAt ? new Date(unlock.seenAt) : undefined,
      };
    });
  });
  const categories = CATEGORY_ORDER.map(category => {
    const related = achievements.filter(item => item.category === category);
    const rank = rankForAchievements(related);
    const evidenceRank = rankForEvidence(related);
    const floor = historicalRankFloor(profile, category);
    const progress = getCategoryProgress(profile, category);
    const hasCategoryXp = (profile.categoryXpEvents || []).some(item => item.category === category);
    const effectiveName = hasCategoryXp ? progress.rank : maxRankName(rank.name, floor);
    const effectiveRank: MasteryRank = {
      ...rank,
      name: effectiveName,
      material: RANK_MATERIAL[effectiveName],
      progress: hasCategoryXp
        ? progress.nextRank
          ? Math.min(100, Math.round((progress.totalXp / progress.nextRankXp) * 100))
          : 100
        : rank.progress,
      nextRank: hasCategoryXp ? progress.nextRank : RANKS[RANKS.indexOf(effectiveName) + 1],
    };
    const nextAchievement = related.find(item => item.id === effectiveRank.nextAchievementId) || related.find(item => !item.unlocked);
    return {
      category,
      achievements: related,
      unlocked: related.filter(item => item.unlocked).length,
      total: related.length,
      score: rank.score,
      rank: effectiveRank,
      evidenceRank,
      historicalRankFloor: floor,
      nextAchievement,
      categoryXp: progress.totalXp,
      categoryLevel: progress.level,
      categoryLevelXp: progress.currentLevelXp,
      categoryNextLevelXp: progress.nextLevelXp,
      categoryXpToNextRank: hasCategoryXp
        ? progress.xpToNextRank
        : Math.max(0, progress.nextRankXp - progress.totalXp),
      momentumXp: progress.momentumXp,
    };
  });
  const strongest = [...categories].sort((a, b) => b.score - a.score)[0];
  return {
    achievements,
    categories,
    legacyAchievements: legacyRecords(profile, new Set(ACTIVE_ACHIEVEMENTS.map(item => item.id))),
    totalScore: categories.reduce((sum, item) => sum + item.score, 0),
    // Display-only compatibility summary. Category rank remains authoritative.
    overallRank: strongest?.rank || rankForAchievements([]),
  };
}

/**
 * Returns the canonical, deterministic set of achievements that still need
 * their durable unlock mutation. Presentation may choose to suppress a
 * startup notification, but it must never suppress this state transition.
 */
export function getReadyAchievementUnlocks(
  achievements: ReadonlyArray<EvaluatedAchievement>,
  persistedUnlocks: ReadonlyArray<AchievementUnlock>,
): EvaluatedAchievement[] {
  const persistedIds = new Set(persistedUnlocks.map(item => item.achievementId));
  return achievements
    .filter(item => item.readyToUnlock && !persistedIds.has(item.id))
    .sort((first, second) => first.id.localeCompare(second.id));
}

function earliestUnlock(unlocks: AchievementUnlock[]) {
  return [...unlocks].sort((a, b) => new Date(a.unlockedAt).getTime() - new Date(b.unlockedAt).getTime())[0];
}

export function migrateAchievementProfile(profile: Profile): Profile {
  const existing = [...(profile.achievementUnlocks || [])];
  const byId = new Map(existing.map(item => [item.achievementId, item]));
  const migrationVersion = profile.achievementMigrationVersion || 0;
  if (migrationVersion >= ACHIEVEMENT_MIGRATION_VERSION) return profile;
  const addMigrated = (activeId: string, sourceIds: string[]) => {
    if (byId.has(activeId)) return;
    const sources = sourceIds.map(id => byId.get(id)).filter((item): item is AchievementUnlock => Boolean(item));
    if (sources.length !== sourceIds.length) return;
    const earliest = earliestUnlock(sources);
    byId.set(activeId, {
      achievementId: activeId,
      unlockedAt: new Date(earliest.unlockedAt),
      migratedFrom: sourceIds,
    });
  };

  if (migrationVersion < 1) {
    LEGACY_ACHIEVEMENTS
      .filter(item => item.classification === 'DIRECT' && item.activeAchievementId)
      .forEach(item => addMigrated(item.activeAchievementId!, item.sourceIds || [item.id]));
    addMigrated('finance-first-ledger', ['finance-first-wallet', 'finance-first-review']);
  }

  const floors = { ...(profile.masteryRankFloors || {}) };
  CATEGORY_ORDER.forEach(category => {
    const related = ACTIVE_ACHIEVEMENTS.filter(item => item.category === category);
    const unlockedTypes = new Set(
      related.filter(item => byId.has(item.id)).map(item => item.type),
    );
    let rankIndex = 0;
    if (unlockedTypes.has('Foundation')) rankIndex = 1;
    if (rankIndex >= 1 && unlockedTypes.has('Practice')) rankIndex = 2;
    if (rankIndex >= 2 && unlockedTypes.has('Breadth')) rankIndex = 3;
    if (rankIndex >= 3 && unlockedTypes.has('Landmark')) rankIndex = 4;
    if (rankIndex >= 4 && unlockedTypes.has('Signature')) rankIndex = 5;
    const historicalMilestoneIndex = (profile.masteryMilestones || [])
      .filter(item => item.category === category)
      .reduce((highest, item) => Math.max(highest, RANKS.indexOf(item.rank)), 0);
    const existingFloorIndex = RANKS.indexOf(floors[category] || 'Unstarted');
    const nextIndex = Math.max(rankIndex, historicalMilestoneIndex, existingFloorIndex);
    if (nextIndex > 0) floors[category] = RANKS[nextIndex] as Exclude<MasteryRankName, 'Unstarted'>;
  });

  return {
    ...profile,
    achievementUnlocks: [...byId.values()],
    achievementMigrationVersion: ACHIEVEMENT_MIGRATION_VERSION,
    ...(Object.keys(floors).length ? { masteryRankFloors: floors } : {}),
  };
}

export function ensureMasteryMilestones(
  profile: Profile,
  state: AchievementSystemState,
  now = new Date(),
): Profile {
  const existing = [...(profile.masteryMilestones || [])];
  const keys = new Set(existing.map(item => `${item.category}:${item.rank}`));
  const nextFloors = { ...(profile.masteryRankFloors || {}) };
  const additions = state.categories.flatMap(category => {
    const rankIndex = RANKS.indexOf(category.rank.name);
    const existingFloor = RANKS.indexOf(nextFloors[category.category] || 'Unstarted');
    const nextFloor = Math.max(existingFloor, rankIndex);
    if (nextFloor > 0) {
      nextFloors[category.category] = RANKS[nextFloor] as Exclude<MasteryRankName, 'Unstarted'>;
    }
    return RANKS.slice(1, rankIndex + 1)
      .filter(rank => !keys.has(`${category.category}:${rank}`))
      .map(rank => ({
        category: category.category,
        rank: rank as Exclude<MasteryRankName, 'Unstarted'>,
        reachedAt: new Date(now),
      }));
  });
  const floorsChanged = CATEGORY_ORDER.some(category =>
    nextFloors[category] !== profile.masteryRankFloors?.[category],
  );
  return additions.length || floorsChanged
    ? {
        ...profile,
        masteryMilestones: [...existing, ...additions],
        masteryRankFloors: nextFloors,
      }
    : profile;
}

export function getPetMasteryEligibility(profile: Profile): PetMasteryEligibility[] {
  return evaluateAchievementSystem(profile).categories.map(category => {
    const stage = getPetMasteryStage(category.rank.name);
    const companionUnlocked = stage !== 'locked';
    const evolutionEligible = stage === 'evolved' || stage === 'resonance';
    const mythicResonanceEligible = stage === 'resonance';
    return {
      category: category.category,
      rank: category.rank.name,
      stage,
      companionUnlocked,
      evolutionEligible,
      mythicResonanceEligible,
      bonded: companionUnlocked,
      accessoryEligible: companionUnlocked,
      evolved: evolutionEligible,
      mature: mythicResonanceEligible,
      resonance: mythicResonanceEligible,
    };
  });
}

export function isActiveAchievementId(id: string) {
  return ACTIVE_BY_ID.has(id);
}

export function getAchievementDefinition(id: string) {
  return ACTIVE_BY_ID.get(id);
}
