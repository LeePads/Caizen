import type { WorkoutExerciseDefinition, WorkoutRoutine, WorkoutRoutineItem } from '../types';

export type WorkoutDurationSummary = {
  workSeconds: number;
  restSeconds: number;
  totalSeconds: number;
  hasUntimedWork: boolean;
};

const positiveInteger = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

const nonNegativeInteger = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
};

/**
 * Mirrors the runner's slot construction without inventing time for reps or
 * manual exercises. Left/right metadata is intentionally not doubled because
 * the runner keeps it as one slot and asks the user to switch sides manually.
 */
export function calculateWorkoutDuration(
  routine: Pick<WorkoutRoutine, 'items' | 'rounds' | 'defaultRestSeconds'>,
  exercises: Iterable<WorkoutExerciseDefinition> = [],
): WorkoutDurationSummary {
  const exerciseMap = new Map<string, WorkoutExerciseDefinition>(Array.from(exercises, exercise => [exercise.id, exercise] as const));
  const restBySlot: number[] = [];
  let workSeconds = 0;
  let hasUntimedWork = false;
  const rounds = positiveInteger(routine.rounds, 1);

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    routine.items.forEach((item: WorkoutRoutineItem) => {
      const exercise = exerciseMap.get(item.exerciseId);
      const sets = positiveInteger(item.sets ?? exercise?.defaultSets, 1);
      const targetMode = item.targetMode || exercise?.targetMode || 'manual';
      const workSecondsForSlot = targetMode === 'timed' || targetMode === 'hold'
        ? nonNegativeInteger(item.durationSeconds ?? exercise?.defaultDurationSeconds)
        : 0;

      if (targetMode !== 'timed' && targetMode !== 'hold') hasUntimedWork = true;

      for (let setIndex = 0; setIndex < sets; setIndex += 1) {
        workSeconds += workSecondsForSlot;
        restBySlot.push(nonNegativeInteger(item.restSeconds ?? routine.defaultRestSeconds ?? exercise?.defaultRestSeconds));
      }
    });
  }

  // The runner only applies rest when another slot follows; this excludes the
  // trailing rest after the final set of the final round.
  const restSeconds = restBySlot.slice(0, -1).reduce((sum, value) => sum + value, 0);
  return {
    workSeconds,
    restSeconds,
    totalSeconds: workSeconds + restSeconds,
    hasUntimedWork,
  };
}

function formatSeconds(seconds: number) {
  if (seconds === 0) return '0 min';
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round((seconds / 60) * 10) / 10;
  return `${minutes} min`;
}

export function formatWorkoutDuration(summary: WorkoutDurationSummary) {
  const value = formatSeconds(summary.totalSeconds);
  return summary.hasUntimedWork
    ? summary.totalSeconds > 0 ? `Timed portion: ${value}` : 'No timed portion'
    : value;
}
