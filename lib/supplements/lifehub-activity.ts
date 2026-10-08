import type { DailyChecklistItem, ProductivityItem, Supplement, RoutineCompletionEntry } from '@/lib/types';
import { parseLocalDateKey, startOfLocalDay, startOfWeek, toLocalDateKey } from '@/lib/lifehub/date-utils';
import { getSupplementIdsFromLifeHubRecord, linkedContextIncludesEntity, resolveEffectiveLinkedLifeHubLink, routineCurrentlyLinkedToEntity, routineHistoryIncludesEntity } from '@/lib/lifehub/linked-context';
import {
  getNextRoutineDueDate,
  getRoutineHistory,
  getRoutineOccurrence,
  getRoutineStatusForDate,
  getRoutineUrgencyState,
  isRoutineDueForDate,
  type RoutineUrgencyState,
} from '@/lib/lifehub/routine-schedule';
import { differenceInCalendarDays } from '@/lib/lifehub/date-utils';

export type SupplementRoutineState = 'completed' | 'skipped' | 'due' | 'missed' | 'paused' | 'not-due';

export type SupplementRoutineProjection = {
  routineId: string;
  title: string;
  state: SupplementRoutineState;
  nextDueDate?: Date;
};

export type SupplementTaskProjection = {
  taskId: string;
  title: string;
  state: 'pending' | 'completed';
  status: ProductivityItem['status'];
  deadline?: Date;
  dueState?: 'overdue' | 'due-today' | 'upcoming';
};

export type SupplementLifeHubActivity = {
  linkedRoutineCount: number;
  linkedTaskCount: number;
  completedToday: number;
  completedThisWeek: number;
  completedThisMonth: number;
  skippedToday: number;
  skippedThisWeek: number;
  pendingToday: number;
  mostRecentActivityAt?: Date;
  routines: SupplementRoutineProjection[];
  tasks: SupplementTaskProjection[];
};

function occurrenceDate(entry: RoutineCompletionEntry): Date | null {
  return parseLocalDateKey(entry.date);
}

function activityDate(entry: RoutineCompletionEntry): Date | null {
  const completedAt = entry.completedAt ? new Date(entry.completedAt) : null;
  if (completedAt && !Number.isNaN(completedAt.getTime())) return completedAt;
  return occurrenceDate(entry);
}

function isInMonth(date: Date, reference: Date) {
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
}

function routineState(status: ReturnType<typeof getRoutineStatusForDate>, urgency: RoutineUrgencyState, item: DailyChecklistItem): SupplementRoutineState {
  if (item.active === false) return 'paused';
  if (status === 'done') return 'completed';
  if (status === 'skipped') return 'skipped';
  if (urgency === 'missed') return 'missed';
  if (status === 'pending') return 'due';
  return 'not-due';
}

function taskRank(item: ProductivityItem) {
  switch (item.status) {
    case 'pending':
    case 'in-progress':
      return 0;
    case 'deferred':
      return 1;
    case 'failed':
      return 2;
    case 'completed':
      return 3;
    case 'dropped':
      return 4;
    default:
      return 5;
  }
}

function taskActivityTime(item: ProductivityItem) {
  return new Date(item.completedAt || item.createdAt).getTime();
}

export function isSupplementExpired(supplement: Supplement, now = new Date()): boolean {
  if (!supplement.expiryDate) return false;
  const expiry = new Date(supplement.expiryDate);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() < startOfLocalDay(now).getTime();
}

/** Read-only Life Hub projection for one Supplement. */
export function deriveSupplementLifeHubActivity(
  supplementId: string,
  routines: readonly DailyChecklistItem[],
  tasks: readonly ProductivityItem[],
  now = new Date(),
): SupplementLifeHubActivity {
  const linkedRoutines = routines.filter(item => {
    const link = resolveEffectiveLinkedLifeHubLink(item);
    return (link.kind === 'context' && link.context.section === 'supplements' && link.context.type === 'supplement' && getSupplementIdsFromLifeHubRecord(item).includes(supplementId)) ||
      routineHistoryIncludesEntity(item, 'supplements', 'supplement', supplementId);
  });
  const linkedTasks = tasks.filter(item => {
    if (item.type !== 'task') return false;
    const link = resolveEffectiveLinkedLifeHubLink(item);
    return link.kind === 'context' && link.context.section === 'supplements' && link.context.type === 'supplement' && getSupplementIdsFromLifeHubRecord(item).includes(supplementId);
  });

  const today = startOfLocalDay(now);
  const todayKey = toLocalDateKey(today);
  const weekStart = startOfWeek(today);
  let completedToday = 0;
  let completedThisWeek = 0;
  let completedThisMonth = 0;
  let skippedToday = 0;
  let skippedThisWeek = 0;
  let mostRecentActivityAt: Date | undefined;

  for (const routine of linkedRoutines) {
    for (const entry of getRoutineHistory(routine)) {
      if (!linkedContextIncludesEntity(entry.linkedContext, 'supplements', 'supplement', supplementId)) continue;
      const date = occurrenceDate(entry);
      if (!date) continue;
      const isToday = toLocalDateKey(date) === todayKey;
      if (entry.status === 'done') {
        if (isToday) completedToday += 1;
        if (date >= weekStart) completedThisWeek += 1;
        if (isInMonth(date, today)) completedThisMonth += 1;
      } else if (entry.status === 'skipped') {
        if (isToday) skippedToday += 1;
        if (date >= weekStart) skippedThisWeek += 1;
      }
      const latest = activityDate(entry);
      if (latest && (!mostRecentActivityAt || latest > mostRecentActivityAt)) mostRecentActivityAt = latest;
    }
  }

  const routinesProjection = linkedRoutines.map(item => {
    const isCurrentlyLinked = routineCurrentlyLinkedToEntity(item, 'supplements', 'supplement', supplementId);
    const status = getRoutineStatusForSupplementTarget(item, today, supplementId);
    const urgency = isCurrentlyLinked ? getRoutineUrgencyState(item, today, now) : 'not-due';
    const state = routineState(status, urgency, item);
    return {
      routineId: item.id,
      title: item.title,
      state,
      nextDueDate: !isCurrentlyLinked || state === 'completed' || state === 'skipped' || state === 'paused'
        ? undefined
        : getNextRoutineDueDate(item, today) || undefined,
    };
  });
  const routineRank: Record<SupplementRoutineState, number> = {
    missed: 0,
    due: 0,
    'not-due': 1,
    completed: 2,
    skipped: 2,
    paused: 3,
  };
  routinesProjection.sort((left, right) => routineRank[left.state] - routineRank[right.state] ||
    (left.nextDueDate?.getTime() || Number.MAX_SAFE_INTEGER) - (right.nextDueDate?.getTime() || Number.MAX_SAFE_INTEGER) ||
    left.title.localeCompare(right.title));

  const tasksProjection = [...linkedTasks]
    .sort((left, right) => {
      const rankDifference = taskRank(left) - taskRank(right);
      if (rankDifference) return rankDifference;
      if (left.status === 'completed' && right.status === 'completed') {
        return taskActivityTime(right) - taskActivityTime(left) || left.title.localeCompare(right.title);
      }
      const leftDue = left.deadline ? new Date(left.deadline).getTime() : Number.POSITIVE_INFINITY;
      const rightDue = right.deadline ? new Date(right.deadline).getTime() : Number.POSITIVE_INFINITY;
      return leftDue - rightDue || left.title.localeCompare(right.title);
    })
    .slice(0, 3)
    .map(item => {
      const deadline = item.deadline ? new Date(item.deadline) : undefined;
      const days = deadline && item.status !== 'completed' ? differenceInCalendarDays(deadline, now) : undefined;
      return {
        taskId: item.id,
        title: item.title,
        state: item.status === 'completed' ? 'completed' as const : 'pending' as const,
        status: item.status,
        deadline,
        dueState: days === undefined ? undefined : days < 0 ? 'overdue' as const : days === 0 ? 'due-today' as const : 'upcoming' as const,
      };
    });

  return {
    linkedRoutineCount: linkedRoutines.length,
    linkedTaskCount: linkedTasks.length,
    completedToday,
    completedThisWeek,
    completedThisMonth,
    skippedToday,
    skippedThisWeek,
    pendingToday: linkedRoutines.filter(item => getRoutineStatusForSupplementTarget(item, today, supplementId) === 'pending').length,
    mostRecentActivityAt,
    routines: routinesProjection.slice(0, 3),
    tasks: tasksProjection,
  };
}

function getRoutineStatusForSupplementTarget(item: DailyChecklistItem, date: Date, supplementId: string) {
  const isCurrentlyLinked = routineCurrentlyLinkedToEntity(item, 'supplements', 'supplement', supplementId);
  const status = getRoutineStatusForDate(item, date);
  if (status !== 'done' && status !== 'skipped') return isCurrentlyLinked ? status : 'not-due';
  const occurrence = getRoutineOccurrence(item, date);
  const matches = linkedContextIncludesEntity(occurrence?.linkedContext, 'supplements', 'supplement', supplementId);
  return matches ? status : isCurrentlyLinked && isRoutineDueForDate(item, date) ? 'pending' : 'not-due';
}
