import type {
  ProductivityItem,
  ProductivityPriority,
  ProductivityStatus,
} from '@/lib/types';
import { differenceInCalendarDays } from '@/lib/lifehub/date-utils';
import { resolveEffectiveLinkedLifeHubLink } from '@/lib/lifehub/linked-context';

export type GameTaskDueState = 'overdue' | 'due-today' | 'upcoming';

export type GameTaskProjectionRow = {
  taskId: string;
  title: string;
  state: 'pending' | 'completed';
  status: ProductivityStatus;
  deadline?: Date;
  dueState?: GameTaskDueState;
  priority: ProductivityPriority;
  completedAt?: Date;
};

export type GameTaskProjection = {
  linkedTaskCount: number;
  tasks: GameTaskProjectionRow[];
};

export function getGameTaskNavigationDetail(taskId: string) {
  return { section: 'lifehub' as const, feature: 'tasks' as const, recordId: taskId };
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

function activityTime(item: ProductivityItem) {
  return new Date(item.completedAt || item.createdAt).getTime();
}

/**
 * Read-only projection of Life Hub Tasks related to one Game. Life Hub owns
 * the Task record and history; Games only receives a compact summary.
 */
export function deriveGameTaskProjection(
  gameId: string,
  tasks: readonly ProductivityItem[],
  now = new Date(),
): GameTaskProjection {
  const linkedTasks = tasks.filter(item => {
    if (item.type !== 'task') return false;
    const link = resolveEffectiveLinkedLifeHubLink(item);
    return link.kind === 'context' &&
      link.context.section === 'games' &&
      link.context.type === 'game' &&
      link.context.entityId === gameId;
  });

  const projectedTasks = [...linkedTasks]
    .sort((left, right) => {
      const rankDifference = taskRank(left) - taskRank(right);
      if (rankDifference) return rankDifference;

      if (left.status === 'completed' && right.status === 'completed') {
        return activityTime(right) - activityTime(left) || left.title.localeCompare(right.title);
      }

      const leftDue = left.deadline ? new Date(left.deadline).getTime() : Number.POSITIVE_INFINITY;
      const rightDue = right.deadline ? new Date(right.deadline).getTime() : Number.POSITIVE_INFINITY;
      return leftDue - rightDue || left.title.localeCompare(right.title);
    })
    .slice(0, 4)
    .map(item => {
      const deadline = item.deadline ? new Date(item.deadline) : undefined;
      const days = deadline && item.status !== 'completed'
        ? differenceInCalendarDays(deadline, now)
        : undefined;
      const state: GameTaskProjectionRow['state'] = item.status === 'completed' ? 'completed' : 'pending';
      const dueState: GameTaskDueState | undefined = days === undefined
        ? undefined
        : days < 0
          ? 'overdue'
          : days === 0
            ? 'due-today'
            : 'upcoming';

      return {
        taskId: item.id,
        title: item.title,
        state,
        status: item.status,
        deadline,
        dueState,
        priority: item.priority,
        completedAt: item.completedAt ? new Date(item.completedAt) : undefined,
      };
    });

  return {
    linkedTaskCount: linkedTasks.length,
    tasks: projectedTasks,
  };
}
