import type {
  DailyChecklistItem,
  ProductivityItem,
  WorkoutPlan,
  WorkoutRoutine,
} from '@/lib/types';
import { differenceInCalendarDays, parseLocalDateKey, startOfLocalDay } from '@/lib/lifehub/date-utils';
import {
  getNextRoutineDueDate,
  getRoutineHistory,
  getRoutineOccurrence,
  getRoutineStatusForDate,
  getRoutineUrgencyState,
  isRoutineDueForDate,
  type RoutineUrgencyState,
} from '@/lib/lifehub/routine-schedule';
import { getHealthTargetFromLifeHubRecord, linkedContextIncludesEntity, routineCurrentlyLinkedToEntity, routineHistoryIncludesEntity, type HealthLinkedTarget } from '@/lib/lifehub/linked-context';

export type HealthTargetState = 'active' | 'archived';

export type ResolvedHealthTarget = {
  id: string;
  title: string;
  type: HealthLinkedTarget['type'];
  state: HealthTargetState;
  item: WorkoutPlan | WorkoutRoutine;
};

export type HealthRoutineState =
  | 'completed'
  | 'skipped'
  | 'due'
  | 'missed'
  | 'paused'
  | 'not-due';

export type HealthRoutineProjection = {
  routineId: string;
  title: string;
  state: HealthRoutineState;
  nextDueDate?: Date;
  navigation: { section: 'lifehub'; feature: 'routine'; recordId: string };
};

export type HealthTaskProjection = {
  taskId: string;
  title: string;
  state: 'pending' | 'completed';
  status: ProductivityItem['status'];
  priority: ProductivityItem['priority'];
  deadline?: Date;
  dueState?: 'overdue' | 'due-today' | 'upcoming';
  navigation: { section: 'lifehub'; feature: 'tasks'; recordId: string };
};

export type HealthLifeHubActivity = {
  linkedRoutineCount: number;
  linkedTaskCount: number;
  completedToday: number;
  pendingToday: number;
  skippedToday: number;
  currentState?: HealthRoutineState;
  nextDueDate?: Date;
  lastExplicitRoutineActivityAt?: Date;
  routines: HealthRoutineProjection[];
  tasks: HealthTaskProjection[];
};

function targetMatches(target: HealthLinkedTarget, type: HealthLinkedTarget['type'], entityId: string) {
  return target.type === type && target.entityId === entityId;
}

export function isHealthTargetEligibleForNewLink(
  target: WorkoutPlan | WorkoutRoutine,
): boolean {
  if ('exercises' in target) return !target.archived;
  return target.source === 'custom' && !target.archived;
}

/** Resolves only stable profile-owned Health targets; built-ins are excluded. */
export function resolveHealthTarget(
  type: HealthLinkedTarget['type'],
  entityId: string,
  workoutPlans: readonly WorkoutPlan[],
  workoutRoutines: readonly WorkoutRoutine[],
): ResolvedHealthTarget | undefined {
  if (type === 'workout-plan') {
    const plan = workoutPlans.find(item => item.id === entityId);
    return plan
      ? { id: plan.id, title: plan.name, type, state: plan.archived ? 'archived' : 'active', item: plan }
      : undefined;
  }
  const routine = workoutRoutines.find(item => item.id === entityId && item.source === 'custom');
  return routine
    ? { id: routine.id, title: routine.name, type, state: routine.archived ? 'archived' : 'active', item: routine }
    : undefined;
}

export function healthTargetStateLabel(state: HealthTargetState) {
  return state === 'archived' ? 'Archived' : 'Active';
}

function explicitActivityDate(entry: ReturnType<typeof getRoutineHistory>[number]): Date | null {
  const completedAt = entry.completedAt ? new Date(entry.completedAt) : null;
  if (completedAt && !Number.isNaN(completedAt.getTime())) return completedAt;
  return parseLocalDateKey(entry.date);
}

function routineState(
  status: ReturnType<typeof getRoutineStatusForDate>,
  urgency: RoutineUrgencyState,
  item: DailyChecklistItem,
): HealthRoutineState {
  if (item.active === false) return 'paused';
  if (status === 'done') return 'completed';
  if (status === 'skipped') return 'skipped';
  if (urgency === 'missed') return 'missed';
  if (status === 'pending') return 'due';
  return 'not-due';
}

function routineStateRank(state: HealthRoutineState) {
  switch (state) {
    case 'missed':
    case 'due': return 0;
    case 'not-due': return 1;
    case 'completed':
    case 'skipped': return 2;
    case 'paused': return 3;
  }
}

function taskRank(item: ProductivityItem) {
  switch (item.status) {
    case 'pending':
    case 'in-progress': return 0;
    case 'deferred': return 1;
    case 'failed': return 2;
    case 'completed': return 3;
    case 'dropped': return 4;
    default: return 5;
  }
}

/** Read-only Life Hub projection for one stable Health target. */
export function deriveHealthLifeHubActivity(
  target: Pick<HealthLinkedTarget, 'type' | 'entityId'>,
  routines: readonly DailyChecklistItem[],
  tasks: readonly ProductivityItem[],
  now = new Date(),
): HealthLifeHubActivity {
  const linkedRoutines = routines.filter(item => {
    const link = getHealthTargetFromLifeHubRecord(item);
    return Boolean(link && targetMatches(link, target.type, target.entityId)) ||
      routineHistoryIncludesEntity(item, 'health', target.type, target.entityId);
  });
  const linkedTasks = tasks.filter(item => {
    if (item.type !== 'task') return false;
    const link = getHealthTargetFromLifeHubRecord(item);
    return Boolean(link && targetMatches(link, target.type, target.entityId));
  });

  const today = startOfLocalDay(now);
  let completedToday = 0;
  let pendingToday = 0;
  let skippedToday = 0;
  let lastExplicitRoutineActivityAt: Date | undefined;

  for (const routine of linkedRoutines) {
    const status = getRoutineStatusForHealthTarget(routine, today, target.type, target.entityId);
    if (status === 'done') completedToday += 1;
    if (status === 'pending') pendingToday += 1;
    if (status === 'skipped') skippedToday += 1;
    for (const entry of getRoutineHistory(routine)) {
      if (!linkedContextIncludesEntity(entry.linkedContext, 'health', target.type, target.entityId)) continue;
      const activityDate = explicitActivityDate(entry);
      if (activityDate && (!lastExplicitRoutineActivityAt || activityDate > lastExplicitRoutineActivityAt)) {
        lastExplicitRoutineActivityAt = activityDate;
      }
    }
  }

  const routineProjections = linkedRoutines.map(item => {
    const isCurrentlyLinked = routineCurrentlyLinkedToEntity(item, 'health', target.type, target.entityId);
    const status = getRoutineStatusForHealthTarget(item, today, target.type, target.entityId);
    const state = routineState(status, isCurrentlyLinked ? getRoutineUrgencyState(item, today, now) : 'not-due', item);
    return {
      routineId: item.id,
      title: item.title,
      state,
      nextDueDate: !isCurrentlyLinked || state === 'completed' || state === 'skipped' || state === 'paused'
        ? undefined
        : getNextRoutineDueDate(item, today) || undefined,
      navigation: { section: 'lifehub' as const, feature: 'routine' as const, recordId: item.id },
    };
  }).sort((left, right) =>
    routineStateRank(left.state) - routineStateRank(right.state) ||
    (left.nextDueDate?.getTime() || Number.MAX_SAFE_INTEGER) - (right.nextDueDate?.getTime() || Number.MAX_SAFE_INTEGER) ||
    left.title.localeCompare(right.title),
  );

  const taskProjections = [...linkedTasks]
    .sort((left, right) => {
      const rank = taskRank(left) - taskRank(right);
      if (rank) return rank;
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
        priority: item.priority,
        deadline,
        dueState: days === undefined ? undefined : days < 0 ? 'overdue' as const : days === 0 ? 'due-today' as const : 'upcoming' as const,
        navigation: { section: 'lifehub' as const, feature: 'tasks' as const, recordId: item.id },
      };
    });

  const nextDueDate = routineProjections
    .map(item => item.nextDueDate)
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

function getRoutineStatusForHealthTarget(
  item: DailyChecklistItem,
  date: Date,
  type: HealthLinkedTarget['type'],
  entityId: string,
) {
  const isCurrentlyLinked = routineCurrentlyLinkedToEntity(item, 'health', type, entityId);
  const status = getRoutineStatusForDate(item, date);
  if (status !== 'done' && status !== 'skipped') return isCurrentlyLinked ? status : 'not-due';
  const occurrence = getRoutineOccurrence(item, date);
  const matches = linkedContextIncludesEntity(occurrence?.linkedContext, 'health', type, entityId);
  return matches ? status : isCurrentlyLinked && isRoutineDueForDate(item, date) ? 'pending' : 'not-due';
}
