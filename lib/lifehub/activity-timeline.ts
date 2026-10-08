import {
  getRoutineHistory,
  getRoutineOccurrenceKey,
} from '@/lib/lifehub/routine-schedule';
import {
  addLocalDays,
  parseLocalDateKey,
  parseLocalDateValue,
  startOfLocalDay,
  toLocalDateKey,
} from '@/lib/lifehub/date-utils';
import { isSupplementCompletionNote } from '@/lib/supplements/lifehub-completion';
import { isActionableCalendarDate } from '@/lib/lifehub/calendar-events';
import type {
  DailyChecklistItem,
  HealthProfile,
  ImportantDateItem,
  JournalEntry,
  MediaItem,
  ProductivityItem,
  SkincareProduct,
  SkincareUsageEvent,
  Transaction,
  TrashItem,
} from '@/lib/types';

export type ActivitySection =
  | 'lifehub'
  | 'health'
  | 'balance'
  | 'entertainment'
  | 'personal-care';

export type ActivitySectionFilter = 'all' | ActivitySection;

export type ActivityKind =
  | 'task-completed'
  | 'routine-completed'
  | 'meal-logged'
  | 'weight-logged'
  | 'sleep-logged'
  | 'water-logged'
  | 'fast-completed'
  | 'journal-entry-saved'
  | 'important-date-resolved'
  | 'exercise-logged'
  | 'workout-completed'
  | 'skincare-used'
  | 'supplement-taken'
  | 'transaction-recorded'
  | 'media-completed';

export type ActivityTimePrecision = 'timestamp' | 'date-only';

export type ActivityOwnerLink = {
  section: string;
  feature?: string;
  recordId?: string;
  dateKey?: string;
};

export type ActivitySourceRef = {
  collection: string;
  recordId: string;
  occurrenceKey?: string;
};

/**
 * Render-time Activity projection. This type is intentionally not part of a
 * Profile or an IndexedDB collection: sourceRefs remain the authority.
 */
export type DerivedActivityEntry = {
  id: string;
  dateKey: string;
  occurredAt?: Date;
  timePrecision: ActivityTimePrecision;
  section: ActivitySection;
  kind: ActivityKind;
  title: string;
  detail?: string;
  effectiveDateKey?: string;
  amount?: number;
  groupKey?: string;
  sourceRefs: ActivitySourceRef[];
  ownerLink?: ActivityOwnerLink;
  ownerState: 'live' | 'in-trash' | 'unavailable';
};

export type ActivityTimelineSources = {
  productivityItems?: readonly ProductivityItem[];
  dailyChecklistItems?: readonly DailyChecklistItem[];
  transactions?: readonly Transaction[];
  mediaItems?: readonly MediaItem[];
  skincareProducts?: readonly SkincareProduct[];
  skincareUsageEvents?: readonly SkincareUsageEvent[];
  importantDates?: readonly ImportantDateItem[];
  journalEntries?: readonly JournalEntry[];
  health?: Pick<HealthProfile, 'foodEntries' | 'activityEntries' | 'workoutSessions' | 'weightEntries' | 'sleepEntries' | 'fastingSessions' | 'waterEntries'> | null;
  trashItems?: readonly TrashItem[];
};

export type ActivityTimelineOptions = {
  rangeStart: Date;
  rangeEnd: Date;
  filter?: ActivitySectionFilter;
  now?: Date;
};

export const ACTIVITY_SECTION_FILTERS: ReadonlyArray<{
  id: ActivitySectionFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'lifehub', label: 'Life Hub' },
  { id: 'health', label: 'Health' },
  { id: 'balance', label: 'Money' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'personal-care', label: 'Personal Care' },
];

export function getRecentActivityRange(
  now = new Date(),
  days = 30,
): { rangeStart: Date; rangeEnd: Date } {
  const today = startOfLocalDay(now);
  return {
    rangeStart: addLocalDays(today, -(Math.max(1, days) - 1)),
    rangeEnd: addLocalDays(today, 1),
  };
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
    return parseLocalDateValue(value);
  }
  return null;
}

function validDate(value: unknown): Date | null {
  const date = parseDate(value);
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

type ActivityTiming = {
  dateKey: string;
  occurredAt?: Date;
  timePrecision: ActivityTimePrecision;
};

function exactOrDate(exactValue: unknown, dateValue: unknown): ActivityTiming | null {
  const exact = validDate(exactValue);
  if (exact) {
    return {
      dateKey: toLocalDateKey(exact),
      occurredAt: exact,
      timePrecision: 'timestamp',
    };
  }
  const date = validDate(dateValue);
  const dateKey = date ? toLocalDateKey(date) : '';
  return dateKey ? { dateKey, timePrecision: 'date-only' } : null;
}

function exactOnly(value: unknown): ActivityTiming | null {
  const date = validDate(value);
  return date
    ? { dateKey: toLocalDateKey(date), occurredAt: date, timePrecision: 'timestamp' }
    : null;
}

function inRange(timing: ActivityTiming, rangeStart: Date, rangeEnd: Date): boolean {
  if (timing.occurredAt) {
    const time = timing.occurredAt.getTime();
    return time >= rangeStart.getTime() && time < rangeEnd.getTime();
  }
  const startKey = toLocalDateKey(rangeStart);
  const endKey = toLocalDateKey(rangeEnd);
  return Boolean(startKey && endKey && timing.dateKey >= startKey && timing.dateKey < endKey);
}

function filterMatches(section: ActivitySection, filter: ActivitySectionFilter): boolean {
  return filter === 'all' || filter === section;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function trashSnapshot<T extends { id: string }>(item: TrashItem): T | null {
  if (!isRecord(item.data)) return null;
  return { ...item.data, id: item.itemId } as T;
}

function isTrashAvailable(item: TrashItem, now: Date): boolean {
  const deleteAfter = validDate(item.deleteAfter);
  return !deleteAfter || deleteAfter.getTime() > now.getTime();
}

function compareEntries(left: DerivedActivityEntry, right: DerivedActivityEntry): number {
  const dateOrder = right.dateKey.localeCompare(left.dateKey);
  if (dateOrder) return dateOrder;

  const leftTime = left.occurredAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightTime = right.occurredAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (rightTime !== leftTime) return rightTime - leftTime;
  return left.id.localeCompare(right.id);
}

function addEntry(
  entries: DerivedActivityEntry[],
  entry: DerivedActivityEntry,
  options: ActivityTimelineOptions,
) {
  if (!inRange(entry, options.rangeStart, options.rangeEnd)) return;
  if (!filterMatches(entry.section, options.filter || 'all')) return;
  entries.push(entry);
}

function sourceRef(collection: string, recordId: string, occurrenceKey?: string): ActivitySourceRef {
  return { collection, recordId, ...(occurrenceKey ? { occurrenceKey } : {}) };
}

function activityId(kind: ActivityKind, collection: string, recordId: string, occurrenceKey?: string) {
  return [kind, collection, recordId, occurrenceKey].filter(Boolean).join(':');
}

function routineOccurrenceKey(item: DailyChecklistItem, date: Date, periodKey?: string): string {
  if (periodKey) return periodKey;
  try {
    return getRoutineOccurrenceKey(item, date);
  } catch {
    return `date:${toLocalDateKey(date)}`;
  }
}

function supplementNoteDetail(note?: string): string | undefined {
  if (!isSupplementCompletionNote(note)) return undefined;
  const detail = note?.replace(/^Supplements taken:\s*/, '').trim();
  return detail || undefined;
}

function mediaCompletionLabel(item: MediaItem): string {
  return item.type === 'movie' ? `Watched ${item.title}` : `Completed ${item.title}`;
}

type RoutineSource = {
  item: DailyChecklistItem;
  ownerState: 'live' | 'in-trash';
};

function buildRoutineEntries(
  entries: DerivedActivityEntry[],
  routines: readonly RoutineSource[],
  routineGroups: Map<string, string>,
  options: ActivityTimelineOptions,
) {
  for (const { item, ownerState } of routines) {
    for (const completion of getRoutineHistory(item)) {
      if (completion.status !== 'done') continue;
      const occurrenceDate = parseLocalDateKey(completion.date);
      if (!occurrenceDate) continue;
      const occurrenceKey = routineOccurrenceKey(item, occurrenceDate, completion.periodKey);
      const groupKey = `routine:${item.id}:${occurrenceKey}`;
      const completionId = `${item.id}:${occurrenceKey}`;
      const timing = exactOrDate(completion.completedAt, completion.date);
      if (!timing) continue;

      routineGroups.set(completionId, groupKey);
      routineGroups.set(`${item.id}:${timing.dateKey}`, groupKey);

      addEntry(entries, {
        id: activityId('routine-completed', 'dailyChecklistItems', item.id, occurrenceKey),
        ...timing,
        section: 'lifehub',
        kind: 'routine-completed',
        title: `Completed ${item.title}`,
        groupKey,
        sourceRefs: [sourceRef('dailyChecklistItems', item.id, occurrenceKey)],
        ownerLink: ownerState === 'live'
          ? { section: 'lifehub', feature: 'routine', recordId: item.id }
          : undefined,
        ownerState,
      }, options);

      const supplementDetail = supplementNoteDetail(completion.note);
      if (supplementDetail || isSupplementCompletionNote(completion.note)) {
        addEntry(entries, {
          id: activityId('supplement-taken', 'dailyChecklistItems', item.id, occurrenceKey),
          ...timing,
          section: 'personal-care',
          kind: 'supplement-taken',
          title: 'Took supplements',
          detail: supplementDetail,
          groupKey,
          sourceRefs: [sourceRef('dailyChecklistItems', item.id, occurrenceKey)],
          ownerLink: ownerState === 'live'
            ? { section: 'lifehub', feature: 'routine', recordId: item.id }
            : undefined,
          ownerState,
        }, options);
      }
    }
  }
}

export function deriveCalendarActivityTimeline(
  sources: ActivityTimelineSources,
  options: ActivityTimelineOptions,
): DerivedActivityEntry[] {
  const entries: DerivedActivityEntry[] = [];
  const now = validDate(options.now) || new Date();
  const productivityItems = sources.productivityItems || [];
  const dailyChecklistItems = sources.dailyChecklistItems || [];
  const transactions = sources.transactions || [];
  const mediaItems = sources.mediaItems || [];
  const skincareProducts = sources.skincareProducts || [];
  const skincareUsageEvents = sources.skincareUsageEvents || [];
  const importantDates = sources.importantDates || [];
  const journalEntries = sources.journalEntries || [];
  const trashItems = (sources.trashItems || []).filter(item => isTrashAvailable(item, now));
  const productById = new Map(skincareProducts.map(product => [product.id, product]));

  const liveTaskIds = new Set(productivityItems.map(item => item.id));
  const liveRoutineIds = new Set(dailyChecklistItems.map(item => item.id));
  const liveMediaIds = new Set(mediaItems.map(item => item.id));

  const taskSources: Array<{ item: ProductivityItem; ownerState: 'live' | 'in-trash' }> = [
    ...productivityItems.map(item => ({ item, ownerState: 'live' as const })),
    ...trashItems
      .filter(item => item.source === 'productivityItems' && !liveTaskIds.has(item.itemId))
      .map(item => {
        const snapshot = trashSnapshot<ProductivityItem>(item);
        return snapshot ? { item: snapshot, ownerState: 'in-trash' as const } : null;
      })
      .filter((item): item is { item: ProductivityItem; ownerState: 'in-trash' } => Boolean(item)),
  ];

  for (const { item, ownerState } of taskSources) {
    if (item.type !== 'task' || item.status !== 'completed') continue;
    const timing = exactOnly(item.completedAt);
    if (!timing) continue;
    addEntry(entries, {
      id: activityId('task-completed', 'productivityItems', item.id),
      ...timing,
      section: 'lifehub',
      kind: 'task-completed',
      title: `Completed ${item.title}`,
      sourceRefs: [sourceRef('productivityItems', item.id)],
      ownerLink: ownerState === 'live'
        ? { section: 'lifehub', feature: 'tasks', recordId: item.id }
        : undefined,
      ownerState,
    }, options);
  }

  const routineSources: RoutineSource[] = [
    ...dailyChecklistItems.map(item => ({ item, ownerState: 'live' as const })),
    ...trashItems
      .filter(item => item.source === 'dailyChecklistItems' && !liveRoutineIds.has(item.itemId))
      .map(item => {
        const snapshot = trashSnapshot<DailyChecklistItem>(item);
        return snapshot ? { item: snapshot, ownerState: 'in-trash' as const } : null;
      })
      .filter((item): item is { item: DailyChecklistItem; ownerState: 'in-trash' } => Boolean(item)),
  ];
  const routineGroups = new Map<string, string>();
  buildRoutineEntries(entries, routineSources, routineGroups, options);

  const health = sources.health;
  for (const item of health?.weightEntries || []) {
    const timing = exactOrDate(item.createdAt, item.date);
    if (!timing) continue;
    addEntry(entries, {
      id: activityId('weight-logged', 'health.weightEntries', item.id),
      ...timing,
      section: 'health',
      kind: 'weight-logged',
      title: 'Logged weight',
      effectiveDateKey: toLocalDateKey(item.date),
      sourceRefs: [sourceRef('health.weightEntries', item.id)],
      ownerLink: { section: 'health', feature: 'weight-entry', recordId: item.id },
      ownerState: 'live',
    }, options);
  }

  for (const item of health?.sleepEntries || []) {
    const timing = exactOrDate(item.createdAt, item.date);
    if (!timing) continue;
    addEntry(entries, {
      id: activityId('sleep-logged', 'health.sleepEntries', item.id),
      ...timing,
      section: 'health',
      kind: 'sleep-logged',
      title: 'Logged sleep',
      effectiveDateKey: toLocalDateKey(item.date),
      sourceRefs: [sourceRef('health.sleepEntries', item.id)],
      ownerLink: { section: 'health', feature: 'sleep-entry', recordId: item.id },
      ownerState: 'live',
    }, options);
  }

  for (const item of health?.waterEntries || []) {
    const timing = exactOrDate(item.createdAt, item.date);
    if (!timing) continue;
    addEntry(entries, {
      id: activityId('water-logged', 'health.waterEntries', item.id),
      ...timing,
      section: 'health',
      kind: 'water-logged',
      title: 'Logged water',
      effectiveDateKey: toLocalDateKey(item.date),
      sourceRefs: [sourceRef('health.waterEntries', item.id)],
      ownerLink: { section: 'health' },
      ownerState: 'live',
    }, options);
  }

  for (const item of health?.fastingSessions || []) {
    if (!item.endedAt) continue;
    const timing = exactOnly(item.endedAt);
    if (!timing) continue;
    addEntry(entries, {
      id: activityId('fast-completed', 'health.fastingSessions', item.id),
      ...timing,
      section: 'health',
      kind: 'fast-completed',
      title: 'Completed fast',
      sourceRefs: [sourceRef('health.fastingSessions', item.id)],
      ownerLink: { section: 'health', feature: 'fasting' },
      ownerState: 'live',
    }, options);
  }

  for (const item of importantDates) {
    if (!isActionableCalendarDate({
      source: 'date',
      section: 'dates',
      type: item.type,
      trackAsOverdue: item.trackAsOverdue,
    })) continue;
    const resolutions = item.resolutionHistory?.length
      ? item.resolutionHistory
      : item.resolvedAt && item.status && item.status !== 'upcoming'
        ? [{ occurrenceDate: item.date, resolvedAt: item.resolvedAt, status: item.status }]
        : [];
    const seenResolutions = new Set<string>();
    for (const resolution of resolutions) {
      const timing = exactOnly(resolution.resolvedAt);
      const occurrenceDate = validDate(resolution.occurrenceDate);
      if (!timing || !occurrenceDate) continue;
      const effectiveDateKey = toLocalDateKey(occurrenceDate);
      const occurrenceKey = `${effectiveDateKey}:${resolution.status}`;
      if (!effectiveDateKey || seenResolutions.has(occurrenceKey)) continue;
      seenResolutions.add(occurrenceKey);
      addEntry(entries, {
        id: activityId('important-date-resolved', 'importantDates', item.id, occurrenceKey),
        ...timing,
        section: 'lifehub',
        kind: 'important-date-resolved',
        title: `${resolution.status === 'dismissed' ? 'Dismissed' : 'Resolved'} ${item.title}`,
        effectiveDateKey,
        sourceRefs: [sourceRef('importantDates', item.id, occurrenceKey)],
        ownerLink: { section: 'lifehub', feature: 'date', recordId: item.id, dateKey: effectiveDateKey },
        ownerState: 'live',
      }, options);
    }
  }

  for (const item of journalEntries) {
    if (!item.title?.trim() && !item.content?.trim()) continue;
    const timing = exactOrDate(item.createdAt, item.date);
    if (!timing) continue;
    addEntry(entries, {
      id: activityId('journal-entry-saved', 'journalEntries', item.id),
      ...timing,
      section: 'lifehub',
      kind: 'journal-entry-saved',
      title: 'Saved a journal entry',
      effectiveDateKey: toLocalDateKey(item.date),
      sourceRefs: [sourceRef('journalEntries', item.id)],
      ownerLink: { section: 'lifehub', feature: 'journal-entry', recordId: item.id, dateKey: toLocalDateKey(item.date) },
      ownerState: 'live',
    }, options);
  }

  for (const item of health?.foodEntries || []) {
    const timing = exactOrDate(item.createdAt, item.date);
    if (!timing) continue;
    addEntry(entries, {
      id: activityId('meal-logged', 'health.foodEntries', item.id),
      ...timing,
      section: 'health',
      kind: 'meal-logged',
      title: item.mealType ? `Logged ${item.mealType}` : 'Logged meal',
      detail: item.name || undefined,
      effectiveDateKey: toLocalDateKey(item.date),
      sourceRefs: [sourceRef('health.foodEntries', item.id)],
      ownerLink: { section: 'health', feature: 'food-entry', recordId: item.id },
      ownerState: 'live',
    }, options);
  }

  for (const item of health?.activityEntries || []) {
    const timing = exactOrDate(item.createdAt, item.date);
    if (!timing) continue;
    addEntry(entries, {
      id: activityId('exercise-logged', 'health.activityEntries', item.id),
      ...timing,
      section: 'health',
      kind: 'exercise-logged',
      title: `Logged ${item.activity}`,
      detail: item.durationMinutes ? `${item.durationMinutes} min` : undefined,
      effectiveDateKey: toLocalDateKey(item.date),
      sourceRefs: [sourceRef('health.activityEntries', item.id)],
      ownerLink: { section: 'health', feature: 'activity-entry', recordId: item.id },
      ownerState: 'live',
    }, options);
  }

  for (const item of health?.workoutSessions || []) {
    if (item.status !== 'completed') continue;
    const timing = exactOrDate(item.completedAt, item.startedAt);
    if (!timing) continue;
    addEntry(entries, {
      id: activityId('workout-completed', 'health.workoutSessions', item.id),
      ...timing,
      section: 'health',
      kind: 'workout-completed',
      title: 'Completed workout',
      detail: [item.routineName, item.durationMinutes ? `${item.durationMinutes} min` : undefined]
        .filter(Boolean)
        .join(' · ') || undefined,
      sourceRefs: [sourceRef('health.workoutSessions', item.id)],
      ownerLink: { section: 'health', feature: 'workout-session', recordId: item.id },
      ownerState: 'live',
    }, options);
  }

  const routineUsageGroups = new Map<string, string>();
  for (const event of skincareUsageEvents) {
    if (event.source !== 'routine') continue;
    const groupKey = event.routineCompletionId
      ? routineGroups.get(event.routineCompletionId)
      : event.routineId
        ? routineGroups.get(`${event.routineId}:${toLocalDateKey(event.usedAt)}`)
        : undefined;
    if (groupKey) routineUsageGroups.set(event.id, groupKey);
  }

  for (const event of skincareUsageEvents) {
    const timing = exactOnly(event.usedAt);
    if (!timing) continue;
    const groupKey = routineUsageGroups.get(event.id);
    const product = productById.get(event.productId);
    addEntry(entries, {
      id: activityId('skincare-used', 'skincareUsageEvents', event.id),
      ...timing,
      section: 'personal-care',
      kind: 'skincare-used',
      title: 'Logged skincare usage',
      detail: product?.name || event.productNameSnapshot || 'Unavailable product',
      groupKey,
      sourceRefs: [sourceRef('skincareUsageEvents', event.id)],
      ownerLink: product
        ? { section: 'skincare', feature: 'product', recordId: product.id }
        : undefined,
      ownerState: product ? 'live' : 'unavailable',
    }, options);
  }

  for (const transaction of transactions) {
    const timing = exactOrDate(transaction.createdAt, transaction.date);
    if (!timing) continue;
    const effectiveDateKey = toLocalDateKey(transaction.date);
    addEntry(entries, {
      id: activityId('transaction-recorded', 'transactions', transaction.id),
      ...timing,
      section: 'balance',
      kind: 'transaction-recorded',
      title: `Recorded ${transaction.type}`,
      detail: transaction.payee || transaction.notes || undefined,
      effectiveDateKey: effectiveDateKey || undefined,
      amount: Number.isFinite(transaction.amount) ? transaction.amount : undefined,
      sourceRefs: [sourceRef('transactions', transaction.id)],
      ownerLink: { section: 'balance', feature: 'transactions' },
      ownerState: 'live',
    }, options);
  }

  const mediaSources: Array<{ item: MediaItem; ownerState: 'live' | 'in-trash' }> = [
    ...mediaItems.map(item => ({ item, ownerState: 'live' as const })),
    ...trashItems
      .filter(item => item.source === 'mediaItems' && !liveMediaIds.has(item.itemId))
      .map(item => {
        const snapshot = trashSnapshot<MediaItem>(item);
        return snapshot ? { item: snapshot, ownerState: 'in-trash' as const } : null;
      })
      .filter((item): item is { item: MediaItem; ownerState: 'in-trash' } => Boolean(item)),
  ];

  for (const { item, ownerState } of mediaSources) {
    if (!['anime', 'movie', 'series'].includes(item.type) || item.status !== 'completed') continue;
    const timing = exactOnly(item.completedAt);
    if (!timing) continue;
    addEntry(entries, {
      id: activityId('media-completed', 'mediaItems', item.id),
      ...timing,
      section: 'entertainment',
      kind: 'media-completed',
      title: mediaCompletionLabel(item),
      sourceRefs: [sourceRef('mediaItems', item.id)],
      ownerLink: ownerState === 'live'
        ? { section: 'entertainment', feature: 'media', recordId: item.id }
        : undefined,
      ownerState,
    }, options);
  }

  return entries.sort(compareEntries);
}
