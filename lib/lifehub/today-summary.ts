import type { DailyChecklistItem, ProductivityItem } from '@/lib/types';
import { toLocalDateKey } from '@/lib/lifehub/date-utils';
import {
  isRoutineDoneForDate,
  isRoutineDueForDate,
  isRoutineSkippedForDate,
} from '@/lib/lifehub/routine-schedule';

const OPEN_TASK_STATUSES = new Set(['pending', 'in-progress', 'deferred']);

export type TodayRoutineSummary = {
  due: DailyChecklistItem[];
  pending: DailyChecklistItem[];
  completed: DailyChecklistItem[];
  skipped: DailyChecklistItem[];
};

export type LifeHubTodaySummary = {
  dateKey: string;
  dueTasks: ProductivityItem[];
  overdueTasks: ProductivityItem[];
  routines: TodayRoutineSummary;
  plannedCount: number;
  completedCount: number;
  progressRate: number | null;
};

function compareScheduledTime(left: DailyChecklistItem, right: DailyChecklistItem): number {
  const leftTime = left.scheduledTime;
  const rightTime = right.scheduledTime;
  if (leftTime && rightTime) return leftTime.localeCompare(rightTime);
  if (leftTime) return -1;
  if (rightTime) return 1;
  return 0;
}

/**
 * Derives the items that belong in today's plan. Ideas, reminders, undated
 * tasks, inactive tasks, and informational calendar events are intentionally
 * outside the completion denominator.
 */
export function deriveLifeHubTodaySummary(
  productivityItems: readonly ProductivityItem[],
  dailyChecklistItems: readonly DailyChecklistItem[],
  now = new Date(),
): LifeHubTodaySummary {
  const dateKey = toLocalDateKey(now);
  const taskDeadlineKey = (item: ProductivityItem): string | null => {
    if (!item.deadline) return null;
    const deadline = new Date(item.deadline);
    if (Number.isNaN(deadline.getTime())) return null;
    return toLocalDateKey(deadline) || null;
  };
  const dueTasks = productivityItems.filter(item =>
    item.type === 'task' &&
    taskDeadlineKey(item) === dateKey &&
    (OPEN_TASK_STATUSES.has(item.status) || item.status === 'completed'),
  );
  const overdueTasks = productivityItems.filter(item => {
    const deadlineKey = taskDeadlineKey(item);
    return item.type === 'task' &&
      deadlineKey !== null &&
      deadlineKey < dateKey &&
      OPEN_TASK_STATUSES.has(item.status);
  });

  const dueRoutines = dailyChecklistItems
    .filter(item => isRoutineDueForDate(item, now))
    .sort(compareScheduledTime);
  const completedRoutines = dueRoutines.filter(item => isRoutineDoneForDate(item, now));
  const skippedRoutines = dueRoutines.filter(item => isRoutineSkippedForDate(item, now));
  const pendingRoutines = dueRoutines.filter(item =>
    !isRoutineDoneForDate(item, now) && !isRoutineSkippedForDate(item, now),
  );
  const activeOrCompletedTasks = dueTasks;
  const plannedCount = activeOrCompletedTasks.length + dueRoutines.length - skippedRoutines.length;
  const completedCount = activeOrCompletedTasks.filter(item => item.status === 'completed').length + completedRoutines.length;

  return {
    dateKey,
    dueTasks,
    overdueTasks,
    routines: {
      due: dueRoutines,
      pending: pendingRoutines,
      completed: completedRoutines,
      skipped: skippedRoutines,
    },
    plannedCount,
    completedCount,
    progressRate: plannedCount ? Math.round((completedCount / plannedCount) * 100) : null,
  };
}

export function compareRoutinePlannedTime(left: DailyChecklistItem, right: DailyChecklistItem): number {
  return compareScheduledTime(left, right);
}

export function isOpenLifeHubTask(item: ProductivityItem): boolean {
  return item.type === 'task' && OPEN_TASK_STATUSES.has(item.status);
}

export function isLifeHubRoutinePlannedToday(item: DailyChecklistItem, now = new Date()): boolean {
  return isRoutineDueForDate(item, now) &&
    !isRoutineDoneForDate(item, now) &&
    !isRoutineSkippedForDate(item, now);
}

