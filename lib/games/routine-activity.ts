import type { DailyChecklistItem, RoutineCompletionEntry } from '@/lib/types';
import { parseLocalDateKey, startOfLocalDay, startOfWeek, toLocalDateKey } from '@/lib/lifehub/date-utils';
import { clearGameLinksFromRoutines, linkedContextIncludesEntity, resolveEffectiveLinkedLifeHubLink, routineCurrentlyLinkedToEntity, routineHistoryIncludesEntity } from '@/lib/lifehub/linked-context';
import {
  getNextRoutineDueDate,
  getRoutineHistory,
  getRoutineOccurrence,
  getRoutineStatusForDate,
  getRoutineUrgencyState,
  isRoutineDueForDate,
} from '@/lib/lifehub/routine-schedule';

export type GameRoutineState =
  | 'completed'
  | 'skipped'
  | 'due'
  | 'missed'
  | 'paused'
  | 'not-due';

export type GameRoutineActivity = {
  linkedRoutineCount: number;
  completedToday: number;
  completedThisWeek: number;
  completedThisMonth: number;
  skippedToday: number;
  skippedThisWeek: number;
  pendingToday: number;
  mostRecentActivityAt?: Date;
  routines: Array<{
    routineId: string;
    title: string;
    state: GameRoutineState;
    nextDueDate?: Date;
  }>;
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

/**
 * Projects Life Hub routine history into a read-only Games summary.
 * Routine completion remains owned by Life Hub and this helper never writes
 * to a routine or a game.
 */
export function deriveGameRoutineActivity(
  gameId: string,
  routines: readonly DailyChecklistItem[],
  now = new Date(),
): GameRoutineActivity {
  const linkedRoutines = routines.filter(item => {
    const link = resolveEffectiveLinkedLifeHubLink(item);
    return (link.kind === 'context' && link.context.section === 'games' && link.context.type === 'game' && link.context.entityId === gameId) ||
      routineHistoryIncludesEntity(item, 'games', 'game', gameId);
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
      if (!linkedContextIncludesEntity(entry.linkedContext, 'games', 'game', gameId)) continue;
      const date = occurrenceDate(entry);
      if (!date) continue;

      const isToday = toLocalDateKey(date) === todayKey;
      const isThisWeek = date >= weekStart;
      const isThisMonth = isInMonth(date, today);

      if (entry.status === 'done') {
        if (isToday) completedToday += 1;
        if (isThisWeek) completedThisWeek += 1;
        if (isThisMonth) completedThisMonth += 1;
      } else if (entry.status === 'skipped') {
        if (isToday) skippedToday += 1;
        if (isThisWeek) skippedThisWeek += 1;
      }

      const latest = activityDate(entry);
      if (latest && (!mostRecentActivityAt || latest > mostRecentActivityAt)) {
        mostRecentActivityAt = latest;
      }
    }
  }

  const projectedRoutines = linkedRoutines.map(item => {
    const isCurrentlyLinked = routineCurrentlyLinkedToEntity(item, 'games', 'game', gameId);
    const status = getRoutineStatusForGameTarget(item, today, gameId);
    const urgency = isCurrentlyLinked ? getRoutineUrgencyState(item, today, now) : 'not-due';
    const state: GameRoutineState = item.active === false
      ? 'paused'
      : status === 'done'
        ? 'completed'
        : status === 'skipped'
          ? 'skipped'
          : urgency === 'missed'
            ? 'missed'
            : status === 'pending'
              ? 'due'
              : 'not-due';

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

  const stateRank: Record<GameRoutineState, number> = {
    missed: 0,
    due: 0,
    'not-due': 1,
    completed: 2,
    skipped: 2,
    paused: 3,
  };

  projectedRoutines.sort((left, right) =>
    stateRank[left.state] - stateRank[right.state] ||
    (left.nextDueDate?.getTime() || Number.MAX_SAFE_INTEGER) - (right.nextDueDate?.getTime() || Number.MAX_SAFE_INTEGER) ||
    left.title.localeCompare(right.title),
  );

  return {
    linkedRoutineCount: linkedRoutines.length,
    completedToday,
    completedThisWeek,
    completedThisMonth,
    skippedToday,
    skippedThisWeek,
    pendingToday: linkedRoutines.filter(item => getRoutineStatusForGameTarget(item, today, gameId) === 'pending').length,
    mostRecentActivityAt,
    routines: projectedRoutines,
  };
}

function getRoutineStatusForGameTarget(item: DailyChecklistItem, date: Date, gameId: string) {
  const isCurrentlyLinked = routineCurrentlyLinkedToEntity(item, 'games', 'game', gameId);
  const status = getRoutineStatusForDate(item, date);
  if (status !== 'done' && status !== 'skipped') return isCurrentlyLinked ? status : 'not-due';
  const occurrence = getRoutineOccurrence(item, date);
  const matches = linkedContextIncludesEntity(occurrence?.linkedContext, 'games', 'game', gameId);
  return matches ? status : isCurrentlyLinked && isRoutineDueForDate(item, date) ? 'pending' : 'not-due';
}

/** Pure relationship cleanup used by the profile mutation path and tests. */
export function clearGameRoutineLinks(
  routines: readonly DailyChecklistItem[],
  gameId: string,
): DailyChecklistItem[] {
  return clearGameLinksFromRoutines(routines, gameId);
}
