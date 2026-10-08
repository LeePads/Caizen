import type { WorkoutLoadMode, WorkoutSession, WorkoutSessionExerciseSnapshot } from '../types';

const sessionTimestamp = (session: WorkoutSession) => {
  const value = session.completedAt || session.startedAt;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

/** Most recent completed (not partial) session containing a snapshot for this exercise. Read-only: never mutates history. */
export function getMostRecentCompletedSessionForExercise(
  exerciseId: string,
  sessions: WorkoutSession[],
): WorkoutSession | null {
  const candidates = sessions
    .filter(session => session.status === 'completed' && session.exercises.some(exercise => exercise.exerciseId === exerciseId))
    .sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a));
  return candidates[0] || null;
}

export type PreviousSetPerformance = {
  loadMode?: WorkoutLoadMode;
  actualReps?: number;
  actualRepsLeft?: number;
  actualRepsRight?: number;
  actualWeight?: number;
  actualWeightLeft?: number;
  actualWeightRight?: number;
  actualDurationSeconds?: number;
};

/**
 * Working-set (non-warm-up) actuals from the most recent completed session
 * for this exercise, keyed by set position. Used to prefill the next
 * session's inputs — never to overwrite a routine's planned targets.
 */
export function getPreviousSetPerformance(
  exerciseId: string,
  sessions: WorkoutSession[],
): Map<number, PreviousSetPerformance> {
  const session = getMostRecentCompletedSessionForExercise(exerciseId, sessions);
  const result = new Map<number, PreviousSetPerformance>();
  if (!session) return result;
  session.exercises
    .filter(exercise => exercise.exerciseId === exerciseId && !exercise.warmup && exercise.status === 'completed')
    .forEach(exercise => {
      if (!result.has(exercise.setIndex)) {
        result.set(exercise.setIndex, {
          loadMode: exercise.loadMode,
          actualReps: exercise.actualReps,
          actualRepsLeft: exercise.actualRepsLeft,
          actualRepsRight: exercise.actualRepsRight,
          actualWeight: exercise.actualWeight,
          actualWeightLeft: exercise.actualWeightLeft,
          actualWeightRight: exercise.actualWeightRight,
          actualDurationSeconds: exercise.actualDurationSeconds,
        });
      }
    });
  return result;
}

export type RecentExerciseSession = {
  session: WorkoutSession;
  sets: WorkoutSessionExerciseSnapshot[];
};

/** Two most recent completed workout sessions with recordable working sets for this exercise. */
export function getRecentCompletedExerciseSessions(
  exerciseId: string,
  sessions: WorkoutSession[],
  limit = 2,
): RecentExerciseSession[] {
  return sessions
    .filter(session => session.status === 'completed')
    .map(session => ({
      session,
      sets: session.exercises.filter(set => set.exerciseId === exerciseId && set.status === 'completed' && !set.warmup),
    }))
    .filter(group => group.sets.length > 0)
    .sort((a, b) => sessionTimestamp(b.session) - sessionTimestamp(a.session))
    .slice(0, Math.max(0, limit));
}

export type LastExerciseSummary = {
  date: Date;
  sets: WorkoutSessionExerciseSnapshot[];
};

/** "Last time" summary for an exercise detail/runner view. Includes warm-ups, each labeled via `.warmup`. */
export function getLastExerciseSummary(
  exerciseId: string,
  sessions: WorkoutSession[],
): LastExerciseSummary | null {
  const session = getMostRecentCompletedSessionForExercise(exerciseId, sessions);
  if (!session) return null;
  const sets = session.exercises
    .filter(exercise => exercise.exerciseId === exerciseId)
    .sort((a, b) => a.roundIndex - b.roundIndex || a.setIndex - b.setIndex);
  if (!sets.length) return null;
  return { date: new Date(session.completedAt || session.startedAt), sets };
}

export type SessionHighlight = {
  exerciseName: string;
  detail: string;
};

/**
 * Factual highlights for the post-workout summary: notable load/reps among
 * completed, non-warm-up sets. Never estimates calories, fatigue, or
 * recovery — only reports what was actually recorded.
 */
export function getSessionHighlights(session: Pick<WorkoutSession, 'exercises'>): SessionHighlight[] {
  const workingSets = session.exercises.filter(exercise => exercise.status === 'completed' && !exercise.warmup);
  const highlights: SessionHighlight[] = [];

  const heaviest = [...workingSets]
    .filter(exercise => exercise.actualWeight !== undefined)
    .sort((a, b) => (b.actualWeight || 0) - (a.actualWeight || 0))[0];
  if (heaviest) {
    highlights.push({
      exerciseName: heaviest.exerciseName,
      detail: `${heaviest.actualWeight}${heaviest.actualReps !== undefined ? ` x ${heaviest.actualReps}` : ''} (heaviest set)`,
    });
  }

  const mostReps = [...workingSets]
    .filter(exercise => exercise.actualReps !== undefined && exercise.actualWeight === undefined)
    .sort((a, b) => (b.actualReps || 0) - (a.actualReps || 0))[0];
  if (mostReps) {
    highlights.push({ exerciseName: mostReps.exerciseName, detail: `${mostReps.actualReps} reps (most reps)` });
  }

  return highlights;
}
