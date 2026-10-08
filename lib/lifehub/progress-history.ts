import type { DailyChecklistItem, ProductivityItem, RoutineGoalUnit, RoutineProgressEntry } from '@/lib/types';
import { addLocalDays, startOfLocalDay, toLocalDateKey } from '@/lib/lifehub/date-utils';
import {
  getRoutineOccurrenceKey,
  isRoutineDoneForDate,
  isRoutineDueForDate,
  isRoutineSkippedForDate,
} from '@/lib/lifehub/routine-schedule';

export type ProgressHistoryRange = 'week' | 'month';
export type ProgressHistoryStatus = 'completed' | 'skipped' | 'dropped' | 'in-progress';

export type ProgressHistoryEntry = {
  id: string;
  recordId: string;
  date: Date;
  title: string;
  source: 'task' | 'routine';
  status: ProgressHistoryStatus;
  measuredProgress?: Pick<RoutineProgressEntry, 'value' | 'target' | 'unit' | 'customUnit'>;
  legacyPeriod?: boolean;
};

export type ProgressHistorySummary = {
  entries: ProgressHistoryEntry[];
  completedTasks: number;
  droppedTasks: number;
  completedRoutines: number;
  skippedRoutines: number;
  followThrough: ScheduledFollowThroughSummary;
};

export type FollowThroughRating = 'excellent' | 'productive' | 'building' | 'needs-focus' | 'no-score';

export type DailyFollowThroughPoint = {
  date: Date;
  expected: number;
  completed: number;
  rate: number | null;
};

export type ScheduledFollowThroughSummary = {
  expected: number;
  completed: number;
  remaining: number;
  rate: number | null;
  previousRate: number | null;
  trend: number | null;
  rating: FollowThroughRating;
  daily: DailyFollowThroughPoint[];
};

function rangeStart(range: ProgressHistoryRange, anchor: Date): Date {
  return addLocalDays(startOfLocalDay(anchor), range === 'week' ? -6 : -29);
}

function inRange(date: Date, start: Date, end: Date): boolean {
  const key = toLocalDateKey(date);
  return key >= toLocalDateKey(start) && key <= toLocalDateKey(end);
}

function ratingFor(rate: number | null): FollowThroughRating {
  if (rate === null) return 'no-score';
  if (rate >= 85) return 'excellent';
  if (rate >= 70) return 'productive';
  if (rate >= 50) return 'building';
  return 'needs-focus';
}

export function routineGoalUnitLabel(unit: RoutineGoalUnit, customUnit?: string): string {
  if (unit === 'custom') return customUnit?.trim() || 'units';
  return unit;
}

export function getRoutineProgressForDate(item: DailyChecklistItem, date: Date): RoutineProgressEntry | undefined {
  const periodKey = getRoutineOccurrenceKey(item, date);
  const dateKey = toLocalDateKey(date);
  const entries = item.progressHistory || [];
  return entries.find(entry => entry.periodKey === periodKey) ||
    entries.filter(entry => entry.date === dateKey).sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0];
}

function deriveScheduledRange(
  tasks: ProductivityItem[],
  routines: DailyChecklistItem[],
  start: Date,
  end: Date,
): Omit<ScheduledFollowThroughSummary, 'previousRate' | 'trend' | 'rating'> {
  const daily: DailyFollowThroughPoint[] = [];
  const seenRoutinePeriods = new Set<string>();

  for (let date = startOfLocalDay(start); date <= end; date = addLocalDays(date, 1)) {
    let expected = 0;
    let completed = 0;

    for (const routine of routines) {
      if (!isRoutineDueForDate(routine, date)) continue;
      const occurrenceIdentity = `${routine.id}:${getRoutineOccurrenceKey(routine, date)}`;
      if (seenRoutinePeriods.has(occurrenceIdentity)) continue;
      seenRoutinePeriods.add(occurrenceIdentity);
      if (isRoutineSkippedForDate(routine, date)) continue;
      expected += 1;
      if (isRoutineDoneForDate(routine, date)) completed += 1;
    }

    for (const task of tasks) {
      if (task.type !== 'task' || !task.deadline) continue;
      if (!['pending', 'in-progress', 'deferred', 'completed'].includes(task.status)) continue;
      if (toLocalDateKey(new Date(task.deadline)) !== toLocalDateKey(date)) continue;
      expected += 1;
      if (task.status === 'completed') completed += 1;
    }

    daily.push({
      date,
      expected,
      completed,
      rate: expected ? Math.round((completed / expected) * 100) : null,
    });
  }

  const expected = daily.reduce((sum, point) => sum + point.expected, 0);
  const completed = daily.reduce((sum, point) => sum + point.completed, 0);
  return {
    expected,
    completed,
    remaining: Math.max(0, expected - completed),
    rate: expected ? Math.round((completed / expected) * 100) : null,
    daily,
  };
}

export function deriveProgressHistory(
  tasks: ProductivityItem[],
  routines: DailyChecklistItem[],
  range: ProgressHistoryRange,
  anchor = new Date(),
): ProgressHistorySummary {
  const end = startOfLocalDay(anchor);
  const start = rangeStart(range, end);
  const allEntries: Array<ProgressHistoryEntry & { hidden?: boolean }> = [];

  tasks.forEach(task => {
    if (task.type !== 'task') return;
    if (task.status === 'completed' && task.completedAt && inRange(new Date(task.completedAt), start, end)) {
      allEntries.push({ id: `${task.id}:completed`, recordId: task.id, date: new Date(task.completedAt), title: task.title, source: 'task', status: 'completed', hidden: task.hiddenFromHistory });
    }
    if ((task.status === 'failed' || task.status === 'dropped') && task.failedAt && inRange(new Date(task.failedAt), start, end)) {
      allEntries.push({ id: `${task.id}:dropped`, recordId: task.id, date: new Date(task.failedAt), title: task.title, source: 'task', status: 'dropped', hidden: task.hiddenFromHistory });
    }
  });

  routines.forEach(routine => {
    const representedProgress = new Set<string>();
    (routine.completionHistory || []).forEach((occurrence, index) => {
      const date = new Date(`${occurrence.date}T12:00:00`);
      if (!inRange(date, start, end)) return;
      if (occurrence.status !== 'done' && occurrence.status !== 'skipped') return;
      const measured = routine.progressHistory?.find(progress =>
        occurrence.periodKey ? progress.periodKey === occurrence.periodKey : progress.date === occurrence.date,
      );
      if (measured) representedProgress.add(measured.periodKey);
      allEntries.push({
        id: `${routine.id}:${occurrence.periodKey || occurrence.date}:${index}`,
        recordId: routine.id,
        date,
        title: routine.title,
        source: 'routine',
        status: occurrence.status === 'skipped' ? 'skipped' : 'completed',
        measuredProgress: measured ? {
          value: measured.value,
          target: measured.target,
          unit: measured.unit,
          ...(measured.customUnit ? { customUnit: measured.customUnit } : {}),
        } : undefined,
        legacyPeriod: Boolean(routine.scheduleTrackingStartedAt && occurrence.date < routine.scheduleTrackingStartedAt),
      });
    });
    (routine.progressHistory || []).forEach((measured, index) => {
      if (representedProgress.has(measured.periodKey)) return;
      const date = new Date(`${measured.date}T12:00:00`);
      if (!inRange(date, start, end)) return;
      allEntries.push({
        id: `${routine.id}:${measured.periodKey}:progress:${index}`,
        recordId: routine.id,
        date,
        title: routine.title,
        source: 'routine',
        status: 'in-progress',
        measuredProgress: {
          value: measured.value,
          target: measured.target,
          unit: measured.unit,
          ...(measured.customUnit ? { customUnit: measured.customUnit } : {}),
        },
        legacyPeriod: Boolean(routine.scheduleTrackingStartedAt && measured.date < routine.scheduleTrackingStartedAt),
      });
    });
  });

  allEntries.sort((a, b) => b.date.getTime() - a.date.getTime());
  const entries = allEntries.filter(entry => !entry.hidden).map(entry => ({
    id: entry.id,
    recordId: entry.recordId,
    date: entry.date,
    title: entry.title,
    source: entry.source,
    status: entry.status,
    measuredProgress: entry.measuredProgress,
    legacyPeriod: entry.legacyPeriod,
  }));
  const currentScheduled = deriveScheduledRange(tasks, routines, start, end);
  const rangeDays = range === 'week' ? 7 : 30;
  const previousEnd = addLocalDays(start, -1);
  const previousStart = addLocalDays(previousEnd, -(rangeDays - 1));
  const previousScheduled = deriveScheduledRange(tasks, routines, previousStart, previousEnd);
  const trend = currentScheduled.rate === null || previousScheduled.rate === null
    ? null
    : currentScheduled.rate - previousScheduled.rate;
  return {
    entries,
    completedTasks: allEntries.filter(entry => entry.source === 'task' && entry.status === 'completed').length,
    droppedTasks: allEntries.filter(entry => entry.source === 'task' && entry.status === 'dropped').length,
    completedRoutines: allEntries.filter(entry => entry.source === 'routine' && entry.status === 'completed').length,
    skippedRoutines: allEntries.filter(entry => entry.source === 'routine' && entry.status === 'skipped').length,
    followThrough: {
      ...currentScheduled,
      previousRate: previousScheduled.rate,
      trend,
      rating: ratingFor(currentScheduled.rate),
    },
  };
}
