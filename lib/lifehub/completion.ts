import type { LifeHubLinkedContext, Profile, RoutineGoalUnit, RoutineProgressEntry } from '@/lib/types';
import {
  getRoutineHistory,
  getRoutineOccurrence,
  getRoutineOccurrenceKey,
  isRoutineDueForDate,
} from '@/lib/lifehub/routine-schedule';
import { toLocalDateKey } from '@/lib/lifehub/date-utils';
import { normalizeProductivityItem, normalizeRoutineItem } from '@/lib/lifehub/normalization';
import { resolveEffectiveLinkedLifeHubLink } from '@/lib/lifehub/linked-context';

export type LifeHubCompletionStatus = 'applied' | 'alreadyApplied' | 'rejected';

export type LifeHubCompletionResult = {
  profile: Profile;
  status: LifeHubCompletionStatus;
  recordId: string;
  periodKey?: string;
  progressValue?: number;
};

function isValidDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function linkedTitleSnapshot(profile: Profile, context?: LifeHubLinkedContext): string | undefined {
  if (!context) return undefined;
  let title: string | undefined;
  if (context.section === 'games') title = profile.games.find(item => item.id === context.entityId)?.title;
  else if (context.section === 'entertainment' && context.type === 'media-item') title = profile.mediaItems.find(item => item.id === context.entityId)?.title;
  else if (context.section === 'entertainment' && context.type === 'book') title = profile.books?.find(item => item.id === context.entityId)?.title;
  else if (context.section === 'supplements') title = profile.supplements.find(item => item.id === context.entityId)?.name;
  else if (context.section === 'skincare') title = profile.skincareProducts.find(item => item.id === context.entityId)?.name;
  else if (context.section === 'work') title = profile.workItems.find(item => item.id === context.entityId)?.title;
  else if (context.section === 'health') {
    title = context.type === 'workout-plan'
      ? profile.health.workoutPlans?.find(item => item.id === context.entityId)?.name
      : profile.health.workoutRoutines?.find(item => item.id === context.entityId)?.name;
  } else if (context.section === 'balance') title = profile.upcomingMoneyItems.find(item => item.id === context.entityId)?.title;
  if (!title) {
    const targetId = context.section === 'journal' ? undefined : context.entityId;
    const trashed = targetId ? profile.trashItems.find(item => item.itemId === targetId) : undefined;
    const data = trashed?.data as { title?: unknown; name?: unknown } | undefined;
    title = typeof data?.title === 'string' ? data.title : typeof data?.name === 'string' ? data.name : undefined;
  }
  return title?.trim().slice(0, 120) || undefined;
}

/**
 * Applies the canonical Life Hub Task completion mutation to one profile.
 * The returned profile is not persisted here, allowing a caller to compose
 * several independent completions into one profile snapshot.
 */
export function completeProductivityItemInProfile(
  profile: Profile,
  id: string,
  completedAt = new Date(),
): LifeHubCompletionResult {
  if (!isValidDate(completedAt)) {
    return { profile, status: 'rejected', recordId: id };
  }

  const currentItem = (profile.productivityItems || []).find(item => item.id === id);
  if (!currentItem || currentItem.type !== 'task') {
    return { profile, status: 'rejected', recordId: id };
  }
  if (currentItem.status === 'completed') {
    return { profile, status: 'alreadyApplied', recordId: id };
  }
  if (!['pending', 'in-progress', 'deferred'].includes(currentItem.status)) {
    return { profile, status: 'rejected', recordId: id };
  }

  const nextItem = normalizeProductivityItem({
    ...currentItem,
    status: 'completed',
    completedAt,
    failedAt: null,
    deferredAt: null,
    progress: 100,
  });
  const nextProfile: Profile = {
    ...profile,
    productivityItems: (profile.productivityItems || []).map(item =>
      item.id === id ? nextItem : item,
    ),
  };

  return {
    profile: nextProfile,
    status: 'applied',
    recordId: id,
  };
}

/**
 * Applies one complete-only Routine occurrence mutation. `requireDue` is
 * reserved for source-specific automation such as Work task completion;
 * ordinary date-based/manual completion retains the existing behavior.
 */
export function completeRoutineOccurrenceInProfile(
  profile: Profile,
  id: string,
  date: Date,
  completedAt = new Date(),
  options: { requireDue?: boolean; note?: string } = {},
): LifeHubCompletionResult {
  if (!isValidDate(date) || !isValidDate(completedAt)) {
    return { profile, status: 'rejected', recordId: id };
  }

  const currentItem = (profile.dailyChecklistItems || []).find(item => item.id === id);
  if (!currentItem) return { profile, status: 'rejected', recordId: id };

  const periodKey = getRoutineOccurrenceKey(currentItem, date);
  const existing = getRoutineOccurrence(currentItem, date);
  if (existing?.status === 'done') {
    return { profile, status: 'alreadyApplied', recordId: id, periodKey };
  }
  if (
    options.requireDue &&
    (!isRoutineDueForDate(currentItem, date) || existing?.status === 'skipped')
  ) {
    return { profile, status: 'rejected', recordId: id, periodKey };
  }

  const dateKey = toLocalDateKey(date);
  const currentLink = resolveEffectiveLinkedLifeHubLink(currentItem);
  const occurrenceContext = currentLink.kind === 'context' ? currentLink.context : undefined;
  const currentHistory = getRoutineHistory(currentItem);
  const legacyOffset = Math.max(
    0,
    Number(currentItem.completionCount || 0) -
      currentHistory.filter(entry => entry.status === 'done').length,
  );
  const completionNote = options.note?.trim();
  const nextHistory = [
    ...currentHistory.filter(entry => {
      if (entry.periodKey) return entry.periodKey !== periodKey;
      return entry.date !== dateKey;
    }),
    {
      date: dateKey,
      periodKey,
      status: 'done' as const,
      completedAt,
      ...(completionNote ? { note: completionNote } : {}),
      ...(occurrenceContext ? {
        linkedContext: occurrenceContext,
        linkedTitleSnapshot: linkedTitleSnapshot(profile, occurrenceContext),
      } : {}),
    },
  ];
  const nextItem = normalizeRoutineItem({
    ...currentItem,
    completionHistory: nextHistory,
    completionCount:
      legacyOffset + nextHistory.filter(entry => entry.status === 'done').length,
    completedAt,
  });
  const nextProfile: Profile = {
    ...profile,
    dailyChecklistItems: (profile.dailyChecklistItems || []).map(item =>
      item.id === id ? nextItem : item,
    ),
  };

  return {
    profile: nextProfile,
    status: 'applied',
    recordId: id,
    periodKey,
  };
}

export type RoutineProgressChange =
  | { kind: 'set'; value: number }
  | { kind: 'adjust'; delta: number };

const ROUTINE_GOAL_UNITS = new Set<RoutineGoalUnit>([
  'times', 'episodes', 'chapters', 'pages', 'minutes', 'hours', 'km', 'glasses', 'items', 'custom',
]);

/** Updates one cadence occurrence and applies completion only on an upward threshold crossing. */
export function changeRoutineProgressInProfile(
  profile: Profile,
  id: string,
  date: Date,
  change: RoutineProgressChange,
  updatedAt = new Date(),
): LifeHubCompletionResult {
  if (!isValidDate(date) || !isValidDate(updatedAt)) return { profile, status: 'rejected', recordId: id };
  const currentItem = profile.dailyChecklistItems.find(item => item.id === id);
  if (!currentItem?.goal) return { profile, status: 'rejected', recordId: id };
  const periodKey = getRoutineOccurrenceKey(currentItem, date);
  const progressHistory = currentItem.progressHistory || [];
  const previous = progressHistory.find(entry => entry.periodKey === periodKey);
  const rawNext = change.kind === 'set' ? change.value : (previous?.value || 0) + change.delta;
  if (!Number.isFinite(rawNext)) return { profile, status: 'rejected', recordId: id, periodKey };
  const value = Math.max(0, rawNext);
  const unit = previous?.unit || currentItem.goal.unit;
  if (!ROUTINE_GOAL_UNITS.has(unit)) return { profile, status: 'rejected', recordId: id, periodKey };
  const target = previous?.target || currentItem.goal.target;
  const customUnit = previous?.customUnit || currentItem.goal.customUnit;
  const entry: RoutineProgressEntry = {
    periodKey,
    date: toLocalDateKey(date),
    value,
    target,
    unit,
    ...(unit === 'custom' && customUnit ? { customUnit } : {}),
    updatedAt,
  };
  const nextItem = normalizeRoutineItem({
    ...currentItem,
    progressHistory: [...progressHistory.filter(item => item.periodKey !== periodKey), entry],
  });
  let nextProfile: Profile = {
    ...profile,
    dailyChecklistItems: profile.dailyChecklistItems.map(item => item.id === id ? nextItem : item),
  };
  const priorValue = previous?.value || 0;
  const occurrence = getRoutineOccurrence(currentItem, date);

  if (value >= target && priorValue < target && occurrence?.status !== 'skipped') {
    const completed = completeRoutineOccurrenceInProfile(nextProfile, id, date, updatedAt);
    if (completed.status === 'applied') nextProfile = completed.profile;
  } else if (value < target && priorValue >= target && occurrence?.status === 'done') {
    const occurrenceIndex = getRoutineHistory(currentItem).indexOf(occurrence);
    const withoutOccurrence = getRoutineHistory(nextItem).filter((_, index) => index !== occurrenceIndex);
    const legacyOffset = Math.max(
      0,
      Number(nextItem.completionCount || 0) - getRoutineHistory(nextItem).filter(item => item.status === 'done').length,
    );
    const correctedItem = normalizeRoutineItem({
      ...nextItem,
      completionHistory: withoutOccurrence,
      completionCount: legacyOffset + withoutOccurrence.filter(item => item.status === 'done').length,
      completedAt: (() => {
        const done = withoutOccurrence.filter(item => item.status === 'done');
        return done.length ? done[done.length - 1].completedAt || null : null;
      })(),
    });
    nextProfile = {
      ...nextProfile,
      dailyChecklistItems: nextProfile.dailyChecklistItems.map(item => item.id === id ? correctedItem : item),
    };
  }
  return { profile: nextProfile, status: 'applied', recordId: id, periodKey, progressValue: value };
}
