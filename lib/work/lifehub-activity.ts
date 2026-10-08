import type {
  DailyChecklistItem,
  ProductivityItem,
  RoutineCompletionEntry,
  TrashItem,
  WorkItem,
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
import {
  getWorkItemIdsFromTrashData,
  linkedContextIncludesEntity,
  routineCurrentlyLinkedToEntity,
  routineHistoryIncludesEntity,
  resolveEffectiveLinkedLifeHubLink,
} from '@/lib/lifehub/linked-context';

export type WorkRoutineState =
  | 'completed'
  | 'skipped'
  | 'due'
  | 'missed'
  | 'paused'
  | 'not-due';

export type WorkRoutineProjection = {
  routineId: string;
  title: string;
  state: WorkRoutineState;
  nextDueDate?: Date;
};

export type WorkTaskProjection = {
  taskId: string;
  title: string;
  state: 'pending' | 'completed';
  status: ProductivityItem['status'];
  priority: ProductivityItem['priority'];
  deadline?: Date;
  dueState?: 'overdue' | 'due-today' | 'upcoming';
};

export type WorkLifeHubActivity = {
  linkedRoutineCount: number;
  linkedTaskCount: number;
  completedToday: number;
  pendingToday: number;
  skippedToday: number;
  currentState?: WorkRoutineState;
  nextDueDate?: Date;
  lastExplicitRoutineActivityAt?: Date;
  routines: WorkRoutineProjection[];
  tasks: WorkTaskProjection[];
};

export type WorkTargetState = 'active' | 'completed' | 'archived' | 'in-trash';

export type ResolvedWorkTarget = {
  id: string;
  title: string;
  type: 'project' | 'task';
  state: WorkTargetState;
  status: WorkItem['status'];
  item?: WorkItem;
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
): WorkRoutineState {
  if (item.active === false) return 'paused';
  if (status === 'done') return 'completed';
  if (status === 'skipped') return 'skipped';
  if (urgency === 'missed') return 'missed';
  if (status === 'pending') return 'due';
  return 'not-due';
}

function routineStateRank(state: WorkRoutineState) {
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

function workTargetState(item: WorkItem): WorkTargetState {
  if (item.status === 'archived') return 'archived';
  if (item.status === 'done') return 'completed';
  return 'active';
}

function workItemsFromTrash(trashItems: readonly TrashItem[], workItemId: string) {
  return trashItems
    .filter(item => item.source === 'workItems')
    .flatMap(item => {
      const records = Array.isArray(item.data) ? item.data : [item.data];
      return records.filter((record): record is WorkItem => Boolean(
        record &&
        typeof record === 'object' &&
        typeof record.id === 'string' &&
        record.id === workItemId &&
        (record.type === 'project' || record.type === 'task'),
      ));
    });
}

/** Resolves Work identity/state without changing the canonical linkedContext shape. */
export function resolveWorkTarget(
  workItemId: string,
  workItems: readonly WorkItem[],
  trashItems: readonly TrashItem[] = [],
): ResolvedWorkTarget | undefined {
  const activeRecord = workItems.find(item => item.id === workItemId);
  if (activeRecord && (activeRecord.type === 'project' || activeRecord.type === 'task')) {
    return {
      id: activeRecord.id,
      title: activeRecord.title,
      type: activeRecord.type,
      state: workTargetState(activeRecord),
      status: activeRecord.status,
      item: activeRecord,
    };
  }

  const trashedRecord = workItemsFromTrash(trashItems, workItemId)[0];
  if (!trashedRecord) return undefined;
  return {
    id: trashedRecord.id,
    title: trashedRecord.title,
    type: trashedRecord.type === 'project' ? 'project' : 'task',
    state: 'in-trash',
    status: trashedRecord.status,
  };
}

/** Returns only navigable Project and project-child Task targets for new links. */
export function isWorkItemEligibleForNewLink(
  item: WorkItem,
  workItems: readonly WorkItem[],
): boolean {
  if (item.type !== 'project' && item.type !== 'task') return false;
  if (item.status === 'done' || item.status === 'archived') return false;
  if (item.type === 'project') return true;

  const parent = workItems.find(candidate => candidate.id === item.projectId);
  return Boolean(
    parent &&
    parent.type === 'project' &&
    parent.status !== 'done' &&
    parent.status !== 'archived',
  );
}

export function workTargetStateLabel(state: WorkTargetState) {
  switch (state) {
    case 'completed':
      return 'Completed';
    case 'archived':
      return 'Archived';
    case 'in-trash':
      return 'In Trash';
    default:
      return 'Active';
  }
}

/** Read-only Life Hub projection for one Work Project or Work Task. */
export function deriveWorkLifeHubActivity(
  workItemId: string,
  routines: readonly DailyChecklistItem[],
  tasks: readonly ProductivityItem[],
  now = new Date(),
): WorkLifeHubActivity {
  const linkedRoutines = routines.filter(item => {
    return routineCurrentlyLinkedToEntity(item, 'work', 'work-item', workItemId) ||
      routineHistoryIncludesEntity(item, 'work', 'work-item', workItemId);
  });
  const linkedTasks = tasks.filter(item => {
    if (item.type !== 'task') return false;
    const link = resolveEffectiveLinkedLifeHubLink(item);
    return link.kind === 'context' &&
      link.context.section === 'work' &&
      link.context.type === 'work-item' &&
      link.context.entityId === workItemId;
  });

  const today = startOfLocalDay(now);
  let completedToday = 0;
  let pendingToday = 0;
  let skippedToday = 0;
  let lastExplicitRoutineActivityAt: Date | undefined;

  for (const routine of linkedRoutines) {
    const status = getRoutineStatusForWorkTarget(routine, today, workItemId);
    if (status === 'done') completedToday += 1;
    if (status === 'pending') pendingToday += 1;
    if (status === 'skipped') skippedToday += 1;

    for (const entry of getRoutineHistory(routine)) {
      if (!linkedContextIncludesEntity(entry.linkedContext, 'work', 'work-item', workItemId)) continue;
      const activityDate = explicitActivityDate(entry);
      if (!activityDate) continue;
      if (!lastExplicitRoutineActivityAt || activityDate > lastExplicitRoutineActivityAt) {
        lastExplicitRoutineActivityAt = activityDate;
      }
    }
  }

  const routineProjections = linkedRoutines.map(item => {
    const isCurrentlyLinked = routineCurrentlyLinkedToEntity(item, 'work', 'work-item', workItemId);
    const status = getRoutineStatusForWorkTarget(item, today, workItemId);
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
        priority: item.priority,
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

function getRoutineStatusForWorkTarget(item: DailyChecklistItem, date: Date, workItemId: string) {
  const isCurrentlyLinked = routineCurrentlyLinkedToEntity(item, 'work', 'work-item', workItemId);
  const status = getRoutineStatusForDate(item, date);
  if (status !== 'done' && status !== 'skipped') return isCurrentlyLinked ? status : 'not-due';
  const occurrence = getRoutineOccurrence(item, date);
  const matches = linkedContextIncludesEntity(occurrence?.linkedContext, 'work', 'work-item', workItemId);
  return matches ? status : isCurrentlyLinked && isRoutineDueForDate(item, date) ? 'pending' : 'not-due';
}

export function workIdsInTrashItem(trashItem: TrashItem): string[] {
  return trashItem.source === 'workItems' ? getWorkItemIdsFromTrashData(trashItem.data) : [];
}
