import type {
  DailyChecklistItem,
  ProductivityItem,
  RoutineCompletionEntry,
} from '@/lib/types';
import {
  differenceInCalendarDays,
  parseLocalDateKey,
  startOfLocalDay,
} from '@/lib/lifehub/date-utils';
import {
  getNextRoutineDueDate,
  getRoutineHistory,
  getRoutineOccurrence,
  getRoutineStatusForDate,
  getRoutineUrgencyState,
  isRoutineDueForDate,
  type RoutineUrgencyState,
} from '@/lib/lifehub/routine-schedule';
import { getSkincareProductIdsFromLifeHubRecord, linkedContextIncludesEntity, resolveEffectiveLinkedLifeHubLink, routineCurrentlyLinkedToEntity, routineHistoryIncludesEntity } from '@/lib/lifehub/linked-context';

export type SkincareRoutineState =
  | 'completed'
  | 'skipped'
  | 'due'
  | 'missed'
  | 'paused'
  | 'not-due';

export type SkincareRoutineProjection = {
  routineId: string;
  title: string;
  state: SkincareRoutineState;
  nextDueDate?: Date;
};

export type SkincareTaskProjection = {
  taskId: string;
  title: string;
  state: 'pending' | 'completed';
  status: ProductivityItem['status'];
  deadline?: Date;
  dueState?: 'overdue' | 'due-today' | 'upcoming';
};

export type SkincareLifeHubActivity = {
  linkedRoutineCount: number;
  linkedTaskCount: number;
  completedToday: number;
  pendingToday: number;
  skippedToday: number;
  currentState?: SkincareRoutineState;
  nextDueDate?: Date;
  lastExplicitRoutineActivityAt?: Date;
  routines: SkincareRoutineProjection[];
  tasks: SkincareTaskProjection[];
};

function occurrenceDate(entry: RoutineCompletionEntry): Date | null {
  return parseLocalDateKey(entry.date);
}

function explicitActivityDate(entry: RoutineCompletionEntry): Date | null {
  const completedAt = entry.completedAt ? new Date(entry.completedAt) : null;
  if (completedAt && !Number.isNaN(completedAt.getTime())) return completedAt;
  return occurrenceDate(entry);
}

function routineState(
  status: ReturnType<typeof getRoutineStatusForDate>,
  urgency: RoutineUrgencyState,
  item: DailyChecklistItem,
): SkincareRoutineState {
  if (item.active === false) return 'paused';
  if (status === 'done') return 'completed';
  if (status === 'skipped') return 'skipped';
  if (urgency === 'missed') return 'missed';
  if (status === 'pending') return 'due';
  return 'not-due';
}

function routineStateRank(state: SkincareRoutineState) {
  switch (state) {
    case 'missed':
    case 'due':
      return 0;
    case 'not-due':
      return 1;
    case 'completed':
    case 'skipped':
      return 2;
    case 'paused':
      return 3;
  }
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

/** Read-only Life Hub projection for one Skincare product. */
export function deriveSkincareLifeHubActivity(
  productId: string,
  routines: readonly DailyChecklistItem[],
  tasks: readonly ProductivityItem[],
  now = new Date(),
): SkincareLifeHubActivity {
  const linkedRoutines = routines.filter(item => {
    const link = resolveEffectiveLinkedLifeHubLink(item);
    return link.kind === 'context' &&
      link.context.section === 'skincare' &&
      link.context.type === 'product' &&
      getSkincareProductIdsFromLifeHubRecord(item).includes(productId) ||
      routineHistoryIncludesEntity(item, 'skincare', 'product', productId);
  });
  const linkedTasks = tasks.filter(item => {
    if (item.type !== 'task') return false;
    const link = resolveEffectiveLinkedLifeHubLink(item);
    return link.kind === 'context' &&
      link.context.section === 'skincare' &&
      link.context.type === 'product' &&
      getSkincareProductIdsFromLifeHubRecord(item).includes(productId);
  });

  const today = startOfLocalDay(now);
  let completedToday = 0;
  let pendingToday = 0;
  let skippedToday = 0;
  let lastExplicitRoutineActivityAt: Date | undefined;

  for (const routine of linkedRoutines) {
    const status = getRoutineStatusForSkincareTarget(routine, today, productId);
    if (status === 'done') completedToday += 1;
    if (status === 'pending') pendingToday += 1;
    if (status === 'skipped') skippedToday += 1;

    for (const entry of getRoutineHistory(routine)) {
      if (!linkedContextIncludesEntity(entry.linkedContext, 'skincare', 'product', productId)) continue;
      const activityDate = explicitActivityDate(entry);
      if (!activityDate) continue;
      if (!lastExplicitRoutineActivityAt || activityDate > lastExplicitRoutineActivityAt) {
        lastExplicitRoutineActivityAt = activityDate;
      }
    }
  }

  const routineProjections = linkedRoutines.map(item => {
    const isCurrentlyLinked = routineCurrentlyLinkedToEntity(item, 'skincare', 'product', productId);
    const status = getRoutineStatusForSkincareTarget(item, today, productId);
    const urgency = isCurrentlyLinked ? getRoutineUrgencyState(item, today, now) : 'not-due';
    const state = routineState(status, urgency, item);
    const nextDueDate = !isCurrentlyLinked || state === 'completed' || state === 'skipped' || state === 'paused'
      ? undefined
      : getNextRoutineDueDate(item, today) || undefined;

    return {
      routineId: item.id,
      title: item.title,
      state,
      nextDueDate,
    };
  });

  routineProjections.sort((left, right) =>
    routineStateRank(left.state) - routineStateRank(right.state) ||
    (left.nextDueDate?.getTime() || Number.MAX_SAFE_INTEGER) -
      (right.nextDueDate?.getTime() || Number.MAX_SAFE_INTEGER) ||
    left.title.localeCompare(right.title),
  );

  const taskProjections = [...linkedTasks]
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
      const days = deadline && item.status !== 'completed'
        ? differenceInCalendarDays(deadline, now)
        : undefined;
      return {
        taskId: item.id,
        title: item.title,
        state: item.status === 'completed' ? 'completed' as const : 'pending' as const,
        status: item.status,
        deadline,
        dueState: days === undefined
          ? undefined
          : days < 0
            ? 'overdue' as const
            : days === 0
              ? 'due-today' as const
              : 'upcoming' as const,
      };
    });

  const nextDueDate = routineProjections
    .map(routine => routine.nextDueDate)
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => left.getTime() - right.getTime())[0];

  return {
    linkedRoutineCount: linkedRoutines.length,
    linkedTaskCount: linkedTasks.length,
    completedToday,
    pendingToday,
    skippedToday,
    currentState: routineProjections[0]?.state,
    nextDueDate,
    lastExplicitRoutineActivityAt,
    routines: routineProjections.slice(0, 3),
    tasks: taskProjections,
  };
}

function getRoutineStatusForSkincareTarget(item: DailyChecklistItem, date: Date, productId: string) {
  const isCurrentlyLinked = routineCurrentlyLinkedToEntity(item, 'skincare', 'product', productId);
  const status = getRoutineStatusForDate(item, date);
  if (status !== 'done' && status !== 'skipped') return isCurrentlyLinked ? status : 'not-due';
  const occurrence = getRoutineOccurrence(item, date);
  const matches = linkedContextIncludesEntity(occurrence?.linkedContext, 'skincare', 'product', productId);
  return matches ? status : isCurrentlyLinked && isRoutineDueForDate(item, date) ? 'pending' : 'not-due';
}
