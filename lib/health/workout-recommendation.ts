import { parseLocalDateValue } from '@/lib/date-utils';
import {
  isRoutineDoneForDate,
  isRoutineDueForDate,
} from '@/lib/lifehub/routine-schedule';
import type {
  ActivityEntry,
  DailyChecklistItem,
  WorkoutPlan,
} from '@/lib/types';

export type WorkoutRecommendationReason =
  | 'scheduled-today'
  | 'never-completed'
  | 'least-recently-completed';

export type WorkoutRecommendation = {
  plan: WorkoutPlan;
  reason: WorkoutRecommendationReason;
};

type Candidate = {
  plan: WorkoutPlan;
  index: number;
  latestCompletion: number | null;
  routine?: DailyChecklistItem;
};

function scheduledMinutes(routine?: DailyChecklistItem): number {
  const match = /^(\d{2}):(\d{2})$/.exec(routine?.scheduledTime || '');
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : Number.MAX_SAFE_INTEGER;
}

function latestCompletionFor(
  planId: string,
  activityEntries: readonly ActivityEntry[],
): number | null {
  const timestamps = activityEntries
    .filter(entry => entry && entry.workoutPlanId === planId)
    .map(entry => parseLocalDateValue(entry.date)?.getTime() ?? Number.NaN)
    .filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}

/** Chooses an existing plan only; it never generates exercise content. */
export function recommendNextWorkout(
  plans: readonly WorkoutPlan[],
  routines: readonly DailyChecklistItem[],
  activityEntries: readonly ActivityEntry[],
  today = new Date(),
): WorkoutRecommendation | null {
  const routineByPlan = new Map(
    routines
      .filter(item => item && item.linkedEntityType === 'workout-plan' && item.linkedEntityId)
      .map(item => [item.linkedEntityId as string, item]),
  );
  const candidates: Candidate[] = plans
    .flatMap((plan, index) => {
      if (!plan || typeof plan !== 'object') return [];
      return [{
        plan,
        index,
        routine: routineByPlan.get(plan.id),
        latestCompletion: latestCompletionFor(plan.id, activityEntries),
      }];
    })
    .filter(candidate => Boolean(
      candidate &&
      typeof candidate.plan.id === 'string' &&
      candidate.plan.id &&
      typeof candidate.plan.name === 'string' &&
      candidate.plan.name.trim() &&
      !candidate.plan.archived,
    ));

  const scheduled = candidates
    .filter(({ routine }) => Boolean(routine && isRoutineDueForDate(routine, today) && !isRoutineDoneForDate(routine, today)))
    .sort((a, b) => scheduledMinutes(a.routine) - scheduledMinutes(b.routine) || a.index - b.index || a.plan.id.localeCompare(b.plan.id));
  if (scheduled[0]) return { plan: scheduled[0].plan, reason: 'scheduled-today' };

  const neverCompleted = candidates
    .filter(candidate => candidate.latestCompletion === null)
    .sort((a, b) => a.index - b.index || a.plan.id.localeCompare(b.plan.id));
  if (neverCompleted[0]) return { plan: neverCompleted[0].plan, reason: 'never-completed' };

  const leastRecentlyCompleted = [...candidates]
    .sort((a, b) => (a.latestCompletion || 0) - (b.latestCompletion || 0) || a.index - b.index || a.plan.id.localeCompare(b.plan.id));
  return leastRecentlyCompleted[0]
    ? { plan: leastRecentlyCompleted[0].plan, reason: 'least-recently-completed' }
    : null;
}
