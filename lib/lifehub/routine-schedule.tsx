import type {
  DailyChecklistItem,
  RoutineCompletionEntry,
  RoutineOccurrenceStatus,
} from '@/lib/types';
import {
  addLocalDays,
  addLocalMonthsClamped,
  differenceInCalendarDays,
  isSameCalendarMonth,
  isSameCalendarWeek,
  startOfLocalDay,
  startOfWeek,
  toLocalDateKey,
} from './date-utils';

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export function weekdayNameToIndex(value?: string): number | null {
  const index = WEEKDAY_NAMES.indexOf((value || '').toLowerCase() as (typeof WEEKDAY_NAMES)[number]);
  return index >= 0 ? index : null;
}

export function normalizeRoutineFrequency(value?: string): DailyChecklistItem['frequency'] {
  if (
    value === 'daily' ||
    value === 'weekdays' ||
    value === 'weekly' ||
    value === 'biweekly' ||
    value === 'monthly' ||
    value === 'every_x_days' ||
    value === 'specific_weekday'
  ) {
    return value;
  }
  return 'daily';
}

export function getRoutineHistory(item: DailyChecklistItem): RoutineCompletionEntry[] {
  return Array.isArray(item.completionHistory) ? item.completionHistory : [];
}

/**
 * The first date on which a routine may be due. Keeping this in the schedule
 * primitive prevents Today, calendar projections, and reminders from drifting
 * apart when a routine has an explicit anchor date.
 */
export function getRoutineAnchorDate(item: DailyChecklistItem): Date {
  const raw = item.anchorDate || item.createdAt;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? startOfLocalDay(new Date()) : startOfLocalDay(parsed);
}

type RoutineScheduleLike = Pick<DailyChecklistItem, 'frequency' | 'weekdays' | 'weekday' | 'intervalDays' | 'anchorDate' | 'dayOfMonth'>;

function getRoutineRevisionForDate(item: DailyChecklistItem, date: Date) {
  const dateKey = toLocalDateKey(date);
  if (item.scheduleTrackingStartedAt && dateKey < item.scheduleTrackingStartedAt) return null;
  let active: NonNullable<DailyChecklistItem['scheduleRevisions']>[number] | undefined;
  for (const revision of item.scheduleRevisions || []) {
    if (revision.effectiveFrom > dateKey) break;
    active = revision;
  }
  return active;
}

function getRoutineScheduleForDate(item: DailyChecklistItem, date: Date): RoutineScheduleLike | null {
  const dateKey = toLocalDateKey(date);
  if (item.scheduleTrackingStartedAt && dateKey < item.scheduleTrackingStartedAt) return null;
  const revision = getRoutineRevisionForDate(item, date);
  if (revision) return revision;
  return item.scheduleTrackingStartedAt ? null : item;
}

function getAnchorForSchedule(item: DailyChecklistItem, schedule: RoutineScheduleLike): Date {
  const raw = schedule.anchorDate || item.anchorDate || item.createdAt;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? startOfLocalDay(new Date()) : startOfLocalDay(parsed);
}

function scheduleSignature(item: RoutineScheduleLike): string {
  return JSON.stringify({
    frequency: item.frequency,
    weekdays: item.weekdays || [],
    weekday: item.weekday || '',
    intervalDays: item.intervalDays || null,
    anchorDate: item.anchorDate ? toLocalDateKey(new Date(item.anchorDate)) : '',
    dayOfMonth: item.dayOfMonth || null,
  });
}

/** Records only future cadence changes; older occurrences stay dated legacy outcomes. */
export function recordRoutineScheduleRevision(
  current: DailyChecklistItem,
  next: DailyChecklistItem,
  effectiveDate = new Date(),
): DailyChecklistItem {
  if (scheduleSignature(current) === scheduleSignature(next)) return next;
  const effectiveFrom = toLocalDateKey(effectiveDate);
  const revision = {
    effectiveFrom,
    frequency: normalizeRoutineFrequency(next.frequency),
    weekdays: next.weekdays ? [...next.weekdays] : undefined,
    weekday: next.weekday,
    intervalDays: next.intervalDays,
    anchorDate: next.anchorDate,
    dayOfMonth: next.dayOfMonth,
  };
  const revisions = [...(current.scheduleRevisions || [])].filter(entry => entry.effectiveFrom !== effectiveFrom);
  revisions.push(revision);
  revisions.sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  return {
    ...next,
    scheduleTrackingStartedAt: current.scheduleTrackingStartedAt || effectiveFrom,
    scheduleRevisions: revisions,
  };
}

export function getRoutineMonthlyDate(item: DailyChecklistItem, date: Date): Date {
  const anchor = getRoutineAnchorDate(item);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const targetDay = Math.max(1, Math.min(lastDay, Number(item.dayOfMonth || anchor.getDate() || 1)));
  return new Date(date.getFullYear(), date.getMonth(), targetDay, 12);
}

function getBiweeklyPeriodStart(item: DailyChecklistItem, date: Date, schedule: RoutineScheduleLike): Date {
  const anchor = getAnchorForSchedule(item, schedule);
  const anchorWeek = startOfWeek(anchor);
  const elapsedWeeks = Math.floor(differenceInCalendarDays(startOfWeek(date), anchorWeek) / 7);
  return addLocalDays(anchorWeek, Math.floor(Math.max(0, elapsedWeeks) / 2) * 14);
}

function getRoutineSuggestedDate(item: DailyChecklistItem, date: Date): Date | null {
  const schedule = getRoutineScheduleForDate(item, date);
  if (!schedule) return null;
  const frequency = normalizeRoutineFrequency(schedule.frequency);
  const anchor = getAnchorForSchedule(item, schedule);

  if (frequency === 'biweekly') {
    const periodStart = getBiweeklyPeriodStart(item, date, schedule);
    return addLocalDays(periodStart, differenceInCalendarDays(anchor, startOfWeek(anchor)));
  }

  if (frequency === 'monthly') {
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const targetDay = Math.max(1, Math.min(lastDay, Number(schedule.dayOfMonth || anchor.getDate() || 1)));
    return new Date(date.getFullYear(), date.getMonth(), targetDay, 12);
  }

  return null;
}

export function getRoutineOccurrenceKey(item: DailyChecklistItem, date: Date): string {
  const schedule = getRoutineScheduleForDate(item, date);
  if (!schedule) return `legacy:${toLocalDateKey(date)}`;
  const frequency = normalizeRoutineFrequency(schedule.frequency);
  let occurrenceKey: string;
  if (frequency === 'biweekly') {
    occurrenceKey = `week:${toLocalDateKey(getBiweeklyPeriodStart(item, date, schedule))}`;
  } else if (frequency === 'weekly') {
    occurrenceKey = `week:${toLocalDateKey(startOfWeek(date))}`;
  } else if (frequency === 'monthly') {
    occurrenceKey = `month:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  } else if (frequency === 'every_x_days') {
    const anchor = getAnchorForSchedule(item, schedule);
    const interval = Math.max(1, Number(schedule.intervalDays || 1));
    const elapsed = differenceInCalendarDays(date, anchor);
    const periodStart = elapsed < 0
      ? anchor
      : addLocalDays(anchor, Math.floor(elapsed / interval) * interval);
    occurrenceKey = `interval:${toLocalDateKey(periodStart)}`;
  } else {
    occurrenceKey = `day:${toLocalDateKey(date)}`;
  }
  const revision = getRoutineRevisionForDate(item, date);
  return revision ? `revision:${revision.effectiveFrom}:${occurrenceKey}` : occurrenceKey;
}

export function getRoutineOccurrence(
  item: DailyChecklistItem,
  date: Date,
): RoutineCompletionEntry | undefined {
  const occurrenceKey = getRoutineOccurrenceKey(item, date);
  const dateKey = toLocalDateKey(date);
  const history = getRoutineHistory(item);
  return history.find(entry => {
    if (entry.periodKey && entry.periodKey === occurrenceKey) return true;
    // Older schedule edits cannot be reconstructed from their saved period
    // keys. Keep their dated outcome visible without assigning a new cadence.
    if (entry.date === dateKey) return true;
    if (entry.periodKey) return false;
    const entryDate = new Date(`${entry.date}T12:00:00`);
    const schedule = getRoutineScheduleForDate(item, date);
    if (!schedule) return false;
    if (normalizeRoutineFrequency(schedule.frequency) === 'biweekly') {
      return getRoutineOccurrenceKey(item, entryDate) === occurrenceKey;
    }
    if (occurrenceKey.startsWith('week:')) return isSameCalendarWeek(entryDate, date);
    if (occurrenceKey.startsWith('month:')) return isSameCalendarMonth(entryDate, date);
    return entry.date === toLocalDateKey(date);
  });
}

/**
 * Remove an explicit skipped occurrence without turning it into a completion.
 * Keeping this as a pure schedule operation makes the persisted recovery path
 * share the same period-key and legacy-date matching rules as skip/complete.
 */
export function recoverSkippedRoutineOccurrence(
  item: DailyChecklistItem,
  date: Date,
): DailyChecklistItem {
  if (getRoutineOccurrence(item, date)?.status !== 'skipped') return item;

  const occurrence = getRoutineOccurrence(item, date);
  const history = getRoutineHistory(item).filter(entry => {
    return entry !== occurrence;
  });
  const legacyOffset = Math.max(
    0,
    Number(item.completionCount || 0) -
      history.filter(entry => entry.status === 'done').length,
  );

  return {
    ...item,
    completionHistory: history,
    completionCount:
      legacyOffset + history.filter(entry => entry.status === 'done').length,
  };
}

export function isRoutineDoneForDate(item: DailyChecklistItem, date: Date): boolean {
  const schedule = getRoutineScheduleForDate(item, date);
  if (!schedule) return getRoutineOccurrence(item, date)?.status === 'done';
  const frequency = normalizeRoutineFrequency(schedule.frequency);
  if (differenceInCalendarDays(date, getAnchorForSchedule(item, schedule)) < 0) return false;
  if (frequency === 'monthly' || frequency === 'every_x_days' || frequency === 'biweekly') {
    if (!isRoutineDueForDate(item, date)) return false;
  }

  const entry = getRoutineOccurrence(item, date);
  if (entry) return entry.status === 'done';

  // Once a routine has explicit occurrence history, an old scalar completedAt
  // value must not make another date appear completed. That scalar is retained
  // only as a fallback for legacy records that have no history yet.
  const history = getRoutineHistory(item);
  if (history.some(historyEntry => historyEntry.status === 'done')) {
    return false;
  }

  if (!item.completedAt) return false;
  const completedAt = new Date(item.completedAt);
  if (frequency === 'biweekly') {
    return getRoutineOccurrenceKey(item, completedAt) === getRoutineOccurrenceKey(item, date);
  }
  if (frequency === 'weekly') {
    return isSameCalendarWeek(completedAt, date);
  }
  if (frequency === 'monthly') return isSameCalendarMonth(completedAt, date);
  return toLocalDateKey(completedAt) === toLocalDateKey(date);
}

export function isRoutineSkippedForDate(item: DailyChecklistItem, date: Date): boolean {
  return getRoutineOccurrence(item, date)?.status === 'skipped';
}

export function isRoutineDueForDate(item: DailyChecklistItem, date: Date): boolean {
  if (item.active === false) return false;
  const schedule = getRoutineScheduleForDate(item, date);
  if (!schedule) return false;
  const anchor = getAnchorForSchedule(item, schedule);
  if (differenceInCalendarDays(date, anchor) < 0) return false;
  const frequency = normalizeRoutineFrequency(schedule.frequency);
  const weekdays = schedule.weekdays?.length ? schedule.weekdays : item.reminderDays;

  if (frequency === 'daily') return true;
  if (frequency === 'weekdays') {
    const selected = weekdays?.length ? weekdays : [1, 2, 3, 4, 5];
    return selected.includes(date.getDay());
  }
  if (frequency === 'specific_weekday') {
    const index = weekdayNameToIndex(schedule.weekday);
    return index === null ? date.getDay() === 1 : date.getDay() === index;
  }
  if (frequency === 'weekly') return true;
  if (frequency === 'biweekly') {
    const weeks = Math.floor(differenceInCalendarDays(startOfWeek(date), startOfWeek(anchor)) / 7);
    return weeks >= 0 && weeks % 2 === 0;
  }
  if (frequency === 'monthly') {
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const targetDay = Math.max(1, Math.min(lastDay, Number(schedule.dayOfMonth || anchor.getDate() || 1)));
    return date.getDate() === targetDay;
  }
  if (frequency === 'every_x_days') {
    const interval = Math.max(1, Number(schedule.intervalDays || 1));
    return differenceInCalendarDays(date, anchor) % interval === 0;
  }
  return true;
}

export function getRoutineCompletionCount(item: DailyChecklistItem): number {
  const historyCount = getRoutineHistory(item).filter(entry => {
    if (entry.status !== 'done') return false;
    if (!item.progressBaselineDate) return true;
    return entry.date >= toLocalDateKey(item.progressBaselineDate);
  }).length;
  if (item.progressBaselineDate) return historyCount;
  return Math.max(historyCount, Number(item.completionCount || 0));
}

/**
 * Monthly and biweekly routines have a single suggested day per occurrence,
 * but the window to complete that occurrence should stay open through the
 * rest of its period (the remainder of the month, or the "off" week right
 * after a biweekly due week) rather than closing the moment the suggested
 * day passes. `getRoutineOccurrenceKey` already groups that whole window
 * under one period key, so a late completion still lands on the correct,
 * already-open occurrence instead of silently starting a new one.
 */
function isRoutineOccurrenceWindowOpen(item: DailyChecklistItem, date: Date): boolean {
  const schedule = getRoutineScheduleForDate(item, date);
  if (!schedule) return false;
  const frequency = normalizeRoutineFrequency(schedule.frequency);
  if (frequency !== 'monthly' && frequency !== 'biweekly') return false;
  if (item.active === false) return false;
  const anchor = getAnchorForSchedule(item, schedule);
  if (differenceInCalendarDays(date, anchor) < 0) return false;
  const suggested = getRoutineSuggestedDate(item, date);
  if (!suggested) return false;
  return toLocalDateKey(date) >= toLocalDateKey(suggested);
}

export function getRoutineStatusForDate(
  item: DailyChecklistItem,
  date: Date,
): RoutineOccurrenceStatus | 'pending' | 'not-due' {
  if (!isRoutineDueForDate(item, date) && !isRoutineOccurrenceWindowOpen(item, date)) return 'not-due';
  const entry = getRoutineOccurrence(item, date);
  return entry?.status || (isRoutineDoneForDate(item, date) ? 'done' : 'pending');
}

export type RoutineUrgencyState =
  | 'normal'
  | 'at-risk'
  | 'missed'
  | 'skipped'
  | 'paused'
  | 'not-due'
  | 'completed';

function scheduledTimeMinutes(value?: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Presentation-only lateness check for a routine's explicit scheduled time. */
export function isRoutineScheduledTimePast(
  item: DailyChecklistItem,
  now = new Date(),
): boolean {
  const minutes = scheduledTimeMinutes(item.scheduledTime);
  if (minutes === null) return false;
  const scheduledAt = new Date(now);
  scheduledAt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return now.getTime() > scheduledAt.getTime();
}

/**
 * Derives urgency for one occurrence without persisting a new routine state.
 * Completion and skip status always win over lateness so history is never
 * presented as missed after the fact.
 */
export function getRoutineUrgencyState(
  item: DailyChecklistItem,
  date: Date,
  now = new Date(),
): RoutineUrgencyState {
  // An explicit skip remains visible as skipped even if the routine is later
  // paused; it must never be reclassified as missed.
  if (isRoutineSkippedForDate(item, date)) return 'skipped';
  if (item.active === false) return 'paused';

  const status = getRoutineStatusForDate(item, date);
  if (status === 'not-due') return 'not-due';
  if (status === 'done') return 'completed';

  const dateStart = startOfLocalDay(date);
  const todayStart = startOfLocalDay(now);
  if (dateStart < todayStart) return 'missed';
  if (dateStart > todayStart) return 'not-due';
  return isRoutineScheduledTimePast(item, now) ? 'at-risk' : 'normal';
}

export function isRoutinePendingUrgency(
  state: RoutineUrgencyState,
): state is 'normal' | 'at-risk' {
  return state === 'normal' || state === 'at-risk';
}

export function getRoutinePendingItemsForDate(
  items: readonly DailyChecklistItem[],
  date: Date,
  now = new Date(),
): DailyChecklistItem[] {
  return items.filter(item => isRoutinePendingUrgency(getRoutineUrgencyState(item, date, now)));
}

export type RoutineAttentionSummary = {
  pendingCount: number;
  atRiskCount: number;
  remainingMessage: string | null;
  atRiskMessage: string | null;
};

export function getRoutineAttentionSummary(
  items: readonly DailyChecklistItem[],
  now = new Date(),
): RoutineAttentionSummary {
  const pendingItems = getRoutinePendingItemsForDate(items, now, now);
  const atRiskCount = pendingItems.filter(item =>
    getRoutineUrgencyState(item, now, now) === 'at-risk',
  ).length;
  const pendingCount = pendingItems.length;

  return {
    pendingCount,
    atRiskCount,
    remainingMessage: pendingCount
      ? `${pendingCount} routine${pendingCount === 1 ? '' : 's'} still need attention today.`
      : null,
    atRiskMessage: atRiskCount
      ? `${atRiskCount} routine${atRiskCount === 1 ? ' is' : 's are'} past the scheduled time.`
      : null,
  };
}

export function getRoutinePeriodGuidance(item: DailyChecklistItem, date: Date): string | null {
  const schedule = getRoutineScheduleForDate(item, date);
  if (!schedule) return null;
  const frequency = normalizeRoutineFrequency(schedule.frequency);
  if (frequency !== 'biweekly' && frequency !== 'monthly') return null;
  if (isRoutineDoneForDate(item, date)) return 'Completed for this period';

  const suggestedDate = getRoutineSuggestedDate(item, date);
  if (!suggestedDate) return null;
  const daysUntilSuggested = differenceInCalendarDays(suggestedDate, date);
  if (daysUntilSuggested === 0) return 'Suggested today';
  if (daysUntilSuggested > 0) {
    return `${daysUntilSuggested} day${daysUntilSuggested === 1 ? '' : 's'} until suggested date`;
  }
  const daysPastSuggested = Math.abs(daysUntilSuggested);
  return `${daysPastSuggested} day${daysPastSuggested === 1 ? '' : 's'} past suggested date`;
}

export function getRoutineWeekStrip(item: DailyChecklistItem, date = new Date()) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => {
    const day = addLocalDays(start, index);
    return {
      date: day,
      dateKey: toLocalDateKey(day),
      status: getRoutineStatusForDate(item, day),
    };
  });
}

export type RoutineFilter = 'all' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type RoutineIndicatorState =
  | 'completed'
  | 'due'
  | 'at-risk'
  | 'missed'
  | 'skipped'
  | 'not-scheduled'
  | 'future';

export type RoutineIndicatorMarker = {
  key: string;
  label: string;
  date: Date;
  state: RoutineIndicatorState;
  accessibleLabel: string;
};

export function getRoutineFilter(item: DailyChecklistItem): Exclude<RoutineFilter, 'all'> | 'other' {
  const frequency = normalizeRoutineFrequency(item.frequency);
  if (frequency === 'daily' || frequency === 'weekdays' || frequency === 'specific_weekday') {
    return 'daily';
  }
  if (frequency === 'weekly' || frequency === 'biweekly' || frequency === 'monthly') {
    return frequency;
  }
  return 'other';
}

export function routineMatchesFilter(item: DailyChecklistItem, filter: RoutineFilter): boolean {
  return filter === 'all' || getRoutineFilter(item) === filter;
}

export type RoutinePeriodWindow = { start: Date; end: Date };
export type RoutinePeriodSummary = { due: number; done: number; skipped: number; progress: number };

export function getRoutinePeriodWindow(filter: RoutineFilter, selectedDate: Date): RoutinePeriodWindow {
  const selected = startOfLocalDay(selectedDate);
  if (filter === 'weekly') {
    const start = startOfWeek(selected);
    return { start, end: addLocalDays(start, 6) };
  }
  if (filter === 'biweekly') {
    const start = startOfWeek(selected);
    return { start, end: addLocalDays(start, 13) };
  }
  if (filter === 'monthly') {
    return {
      start: new Date(selected.getFullYear(), selected.getMonth(), 1, 12),
      end: new Date(selected.getFullYear(), selected.getMonth() + 1, 0, 12),
    };
  }
  return { start: selected, end: selected };
}

export function shiftRoutinePeriodDate(
  filter: RoutineFilter,
  selectedDate: Date,
  direction: -1 | 1,
  preferredDayOfMonth?: number,
): Date {
  if (filter === 'weekly') return addLocalDays(selectedDate, direction * 7);
  if (filter === 'biweekly') return addLocalDays(selectedDate, direction * 14);
  if (filter === 'monthly') return addLocalMonthsClamped(selectedDate, direction, preferredDayOfMonth);
  return addLocalDays(selectedDate, direction);
}

/** Aggregate only scheduled occurrences, deduplicating cadence periods by their persisted-compatible keys. */
export function getRoutinePeriodSummary(
  items: DailyChecklistItem[],
  filter: RoutineFilter,
  selectedDate: Date,
): RoutinePeriodSummary {
  const window = getRoutinePeriodWindow(filter, selectedDate);
  const occurrences = new Map<string, { item: DailyChecklistItem; date: Date }>();
  const matchingItems = items.filter(item => routineMatchesFilter(item, filter));

  for (let date = window.start; date <= window.end; date = addLocalDays(date, 1)) {
    for (const item of matchingItems) {
      if (!isRoutineDueForDate(item, date)) continue;
      const occurrenceKey = getRoutineOccurrenceKey(item, date);
      const uniqueKey = `${item.id}\u0000${occurrenceKey}`;
      if (!occurrences.has(uniqueKey)) occurrences.set(uniqueKey, { item, date });
    }
  }

  const due = occurrences.size;
  let done = 0;
  let skipped = 0;
  for (const { item, date } of occurrences.values()) {
    if (isRoutineDoneForDate(item, date)) done += 1;
    else if (isRoutineSkippedForDate(item, date)) skipped += 1;
  }

  return { due, done, skipped, progress: due ? Math.round((done / due) * 100) : 0 };
}

function indicatorState(item: DailyChecklistItem, date: Date, today: Date): RoutineIndicatorState {
  const urgency = getRoutineUrgencyState(item, date, today);
  if (urgency === 'not-due' || urgency === 'paused') return 'not-scheduled';
  if (urgency === 'completed') return 'completed';
  if (urgency === 'skipped') return 'skipped';
  if (urgency === 'missed') return 'missed';
  if (urgency === 'at-risk') return 'at-risk';
  return startOfLocalDay(date) > startOfLocalDay(today) ? 'future' : 'due';
}

function marker(
  item: DailyChecklistItem,
  label: string,
  date: Date,
  today: Date,
): RoutineIndicatorMarker {
  const state = indicatorState(item, date, today);
  return {
    key: `${label}:${toLocalDateKey(date)}`,
    label,
    date,
    state,
    accessibleLabel: `${label}, ${toLocalDateKey(date)}: ${state.replace('-', ' ')}`,
  };
}

/** Compact, schedule-aware markers used by routine cards. */
export function getRoutineScheduleIndicator(
  item: DailyChecklistItem,
  displayedDate = new Date(),
  today = new Date(),
): RoutineIndicatorMarker[] {
  const filter = getRoutineFilter(item);
  if (filter === 'daily' || filter === 'other') {
    return getRoutineWeekStrip(item, displayedDate).map((entry, index) =>
      marker(item, ['M', 'T', 'W', 'T', 'F', 'S', 'S'][index], entry.date, today),
    );
  }

  if (filter === 'monthly') {
    const targetDay = Math.max(
      1,
      Math.min(
        new Date(displayedDate.getFullYear(), displayedDate.getMonth() + 1, 0).getDate(),
        Number(item.dayOfMonth || getRoutineAnchorDate(item).getDate() || 1),
      ),
    );
    return [marker(item, '1', new Date(displayedDate.getFullYear(), displayedDate.getMonth(), targetDay, 12), today)];
  }

  if (filter === 'biweekly') {
    const monthStart = new Date(displayedDate.getFullYear(), displayedDate.getMonth(), 1, 12);
    const firstWeek = startOfWeek(monthStart);
    return [0, 1].map(index => marker(item, String(index + 1), addLocalDays(firstWeek, index * 7), today));
  }

  const daysInMonth = new Date(displayedDate.getFullYear(), displayedDate.getMonth() + 1, 0).getDate();
  const periods = daysInMonth >= 29 ? 5 : 4;
  return Array.from({ length: periods }, (_, index) =>
    marker(item, String(index + 1), new Date(displayedDate.getFullYear(), displayedDate.getMonth(), 1 + index * 7, 12), today),
  );
}

export function getNextRoutineDueDate(item: DailyChecklistItem, from = new Date()): Date | null {
  for (let offset = 0; offset <= 370; offset += 1) {
    const candidate = addLocalDays(from, offset);
    if (isRoutineDueForDate(item, candidate) && !isRoutineDoneForDate(item, candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Returns the next date on which a reminder should fire. Reminder days are a
 * notification preference, not a second routine schedule: due-state still
 * comes from isRoutineDueForDate and only the reminder's candidate day is
 * narrowed here.
 */
export function getNextRoutineReminderDate(item: DailyChecklistItem, from = new Date()): Date | null {
  const frequency = normalizeRoutineFrequency(item.frequency);
  const configuredReminderDays = item.reminderDays?.length ? item.reminderDays : null;
  const anchor = getRoutineAnchorDate(item);
  const fallbackWeekday = anchor.getDay();

  for (let offset = 0; offset <= 370; offset += 1) {
    const candidate = addLocalDays(from, offset);
    if (!isRoutineDueForDate(item, candidate) || isRoutineDoneForDate(item, candidate)) continue;

    if (configuredReminderDays && !configuredReminderDays.includes(candidate.getDay())) continue;
    if (frequency === 'weekly' || frequency === 'biweekly') {
      if (candidate.getDay() !== fallbackWeekday) continue;
    }
    return candidate;
  }
  return null;
}
