import type { WorkoutLoadMode, WorkoutSession, WorkoutSessionExerciseSnapshot } from '../types';

const timestamp = (value: Date | string | undefined) => {
  const date = value instanceof Date ? value : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const completedWorkingSets = (session: WorkoutSession, exerciseId: string) =>
  session.exercises.filter(set =>
    set.exerciseId === exerciseId && set.status === 'completed' && !set.warmup,
  );

type RepOutcome = { side: 'both' | 'left' | 'right'; load?: number; reps?: number; loadMode?: WorkoutLoadMode };
export type WorkoutLoadModeResolver = (exerciseId: string) => WorkoutLoadMode | undefined;

const positiveLoad = (value?: number) => Number.isFinite(value) && Number(value) > 0 ? Number(value) : undefined;

/** Preserve independently entered unilateral results while supporting older/common-load snapshots. */
const repOutcomes = (set: WorkoutSessionExerciseSnapshot, fallbackLoadMode?: WorkoutLoadMode): RepOutcome[] => {
  const loadMode = set.loadMode ?? fallbackLoadMode;
  const load = (value?: number) => {
    if (loadMode === 'none' || !Number.isFinite(value)) return undefined;
    const numeric = Number(value);
    return loadMode === 'assistance' ? numeric >= 0 ? numeric : undefined : positiveLoad(numeric);
  };
  const hasSideValues = set.actualRepsLeft !== undefined || set.actualRepsRight !== undefined ||
    set.actualWeightLeft !== undefined || set.actualWeightRight !== undefined;
  if (!hasSideValues) return [{ side: 'both', load: load(set.actualWeight), reps: set.actualReps, loadMode }];
  return [
    { side: 'left', load: load(set.actualWeightLeft) ?? load(set.actualWeight), reps: set.actualRepsLeft ?? set.actualReps, loadMode },
    { side: 'right', load: load(set.actualWeightRight) ?? load(set.actualWeight), reps: set.actualRepsRight ?? set.actualReps, loadMode },
  ];
};

const loadOutcomes = (set: WorkoutSessionExerciseSnapshot, fallbackLoadMode?: WorkoutLoadMode) => repOutcomes(set, fallbackLoadMode).filter(
  (outcome): outcome is RepOutcome & { load: number } => outcome.load !== undefined,
);

export type ExerciseRecord = {
  value: number;
  reps?: number;
  date: Date;
  routineName: string;
};

export type ExerciseHistoryGroup = {
  session: WorkoutSession;
  sets: WorkoutSessionExerciseSnapshot[];
};

export type ExercisePerformance = {
  history: ExerciseHistoryGroup[];
  highestLoad: ExerciseRecord | null;
  lowestAssistance: ExerciseRecord | null;
  highestRepsAtLoad: ExerciseRecord | null;
  estimatedOneRepMax: ExerciseRecord | null;
  longestTimedSet: ExerciseRecord | null;
  progression: string | null;
};

/** Derived exercise history and records. Warm-ups, skipped sets, and pending sets never contribute. */
export function deriveExercisePerformance(
  exerciseId: string,
  sessions: WorkoutSession[],
  resolveLoadMode?: WorkoutLoadModeResolver,
): ExercisePerformance {
  const history = sessions
    .map(session => ({ session, sets: session.exercises.filter(set => set.exerciseId === exerciseId) }))
    .filter(group => group.sets.length > 0)
    .sort((a, b) => timestamp(b.session.completedAt || b.session.startedAt) - timestamp(a.session.completedAt || a.session.startedAt));

  let bestLoad: ExerciseRecord | null = null;
  let lowestAssistance: ExerciseRecord | null = null;
  let highestRepsAtLoad: ExerciseRecord | null = null;
  const repsByLoad = new Map<number, ExerciseRecord>();
  let estimatedOneRepMax: ExerciseRecord | null = null;
  let longestTimedSet: ExerciseRecord | null = null;
  const expectedLoadMode = resolveLoadMode?.(exerciseId);

  for (const { session } of history) {
    const date = new Date(session.completedAt || session.startedAt);
    for (const set of completedWorkingSets(session, exerciseId)) {
      for (const outcome of loadOutcomes(set, resolveLoadMode?.(exerciseId))) {
        const load = outcome.load;
        const comparableMode = expectedLoadMode !== undefined && outcome.loadMode === expectedLoadMode;
        if (comparableMode && outcome.loadMode === 'assistance') {
          if (!lowestAssistance || load < lowestAssistance.value) {
            lowestAssistance = { value: load, reps: outcome.reps, date, routineName: session.routineName };
          }
        } else if (comparableMode && (outcome.loadMode === 'external' || outcome.loadMode === 'bodyweight-plus') && (!bestLoad || load > bestLoad.value)) {
          bestLoad = { value: load, reps: outcome.reps, date, routineName: session.routineName };
        }
        if (comparableMode && outcome.reps !== undefined && outcome.reps > 0) {
          const priorAtLoad = repsByLoad.get(load);
          if (!priorAtLoad || outcome.reps > (priorAtLoad.reps || 0)) {
            repsByLoad.set(load, { value: load, reps: outcome.reps, date, routineName: session.routineName });
          }
        }
        if (comparableMode && outcome.loadMode === 'external' && outcome.reps !== undefined && outcome.reps >= 1 && outcome.reps <= 10) {
          const estimate = load * (1 + outcome.reps / 30);
          if (!estimatedOneRepMax || estimate > estimatedOneRepMax.value) {
            estimatedOneRepMax = { value: estimate, reps: outcome.reps, date, routineName: session.routineName };
          }
        }
      }
      if ((set.targetMode === 'timed' || set.targetMode === 'hold') && Number(set.actualDurationSeconds) > 0) {
        const duration = Number(set.actualDurationSeconds);
        if (!longestTimedSet || duration > longestTimedSet.value) {
          longestTimedSet = { value: duration, date, routineName: session.routineName };
        }
      }
    }
  }

  highestRepsAtLoad = [...repsByLoad.values()].reduce<ExerciseRecord | null>(
    (best, record) => !best || (record.reps || 0) > (best.reps || 0) ? record : best,
    null,
  );

  const comparableSessions = history
    .filter(group => group.session.status === 'completed' && completedWorkingSets(group.session, exerciseId).length > 0)
    .slice(0, 2);
  let progression: string | null = null;
  if (comparableSessions.length === 2) {
    const [latest, previous] = comparableSessions;
    const latestSets = completedWorkingSets(latest.session, exerciseId);
    const previousSets = completedWorkingSets(previous.session, exerciseId);
    const previousByPosition = new Map(previousSets.map(set => [`${set.roundIndex}:${set.setIndex}`, set]));
    const matched = latestSets.flatMap(set => {
      const old = previousByPosition.get(`${set.roundIndex}:${set.setIndex}`);
      if (!old) return [];
      const previousBySide = new Map(repOutcomes(old, resolveLoadMode?.(exerciseId)).map(outcome => [outcome.side, outcome]));
      return repOutcomes(set, resolveLoadMode?.(exerciseId)).flatMap(current => {
        const previous = previousBySide.get(current.side);
        return previous ? [{ current, previous }] : [];
      });
    });
    const sameLoadRepGain = matched.some(({ current, previous }) =>
      current.loadMode !== undefined && current.loadMode === previous.loadMode && current.load !== undefined && current.load === previous.load &&
      current.reps !== undefined && previous.reps !== undefined && current.reps > previous.reps,
    );
    const lessAssistance = matched.some(({ current, previous }) => current.loadMode === 'assistance'
      && previous.loadMode === 'assistance' && current.load !== undefined && previous.load !== undefined && current.load < previous.load);
    const metTargets = latestSets.length > 0 && latestSets.every(set =>
      set.targetMode === 'reps' && set.targetReps !== undefined && repOutcomes(set).every(outcome => outcome.reps !== undefined && outcome.reps >= set.targetReps!),
    );
    const effortComfortable = latestSets.some(set => set.rir !== undefined && set.rir >= 2 || set.rpe !== undefined && set.rpe >= 1 && set.rpe <= 8);
    const performanceDropped = matched.some(({ current, previous }) => {
      const currentValue = current.reps;
      const previousValue = previous.reps;
      const sameLoadMode = current.loadMode !== undefined && current.loadMode === previous.loadMode;
      const repDrop = sameLoadMode && currentValue !== undefined && previousValue !== undefined && currentValue < previousValue;
      const loadDrop = sameLoadMode && current.load !== undefined && previous.load !== undefined &&
        (current.loadMode === 'assistance' ? current.load > previous.load : current.loadMode !== 'none' && current.load < previous.load);
      return repDrop || loadDrop;
    });
    if (sameLoadRepGain) progression = 'You completed more reps at the same load than last time.';
    else if (lessAssistance) progression = 'You used less assistance than last time.';
    else if (expectedLoadMode !== undefined && metTargets && effortComfortable) progression = 'You met your work-set targets with room to spare. Consider a small progression next time if it still feels comfortable.';
    else if (performanceDropped) progression = 'Performance was lower than last time. Keeping the planned load steady is a reasonable next step.';
  }

  return {
    history,
    highestLoad: bestLoad,
    lowestAssistance,
    highestRepsAtLoad,
    estimatedOneRepMax,
    longestTimedSet,
    progression,
  };
}

export function getSessionPersonalRecordHighlights(
  session: Pick<WorkoutSession, 'exercises'>,
  previousSessions: WorkoutSession[],
  resolveLoadMode?: WorkoutLoadModeResolver,
): Array<{ exerciseName: string; detail: string }> {
  const highlights: Array<{ exerciseName: string; detail: string }> = [];
  const exercisedIds = new Set(session.exercises.flatMap(set => set.exerciseId ? [set.exerciseId] : []));
  for (const exerciseId of exercisedIds) {
    const currentSets = session.exercises.filter(set => set.exerciseId === exerciseId && set.status === 'completed' && !set.warmup);
    const previous = deriveExercisePerformance(exerciseId, previousSessions, resolveLoadMode);
    for (const set of currentSets) {
      const mode = set.loadMode ?? resolveLoadMode?.(exerciseId);
      const outcomes = loadOutcomes(set, resolveLoadMode?.(exerciseId));
      const loads = outcomes.map(outcome => outcome.load);
      if (mode === 'assistance' && loads.some(load => load !== undefined && (!previous.lowestAssistance || load < previous.lowestAssistance.value))) {
        highlights.push({ exerciseName: set.exerciseName, detail: previous.lowestAssistance ? 'Used less assistance than before' : 'Lowest assistance recorded' });
      } else if ((mode === 'external' || mode === 'bodyweight-plus') && loads.some(load => load !== undefined && (!previous.highestLoad || load > previous.highestLoad.value))) {
        highlights.push({ exerciseName: set.exerciseName, detail: mode === 'bodyweight-plus' ? 'New highest added load' : 'New highest entered load' });
      }
      if (outcomes.some(outcome => outcome.loadMode !== undefined && outcome.loadMode === mode && outcome.load !== undefined && outcome.reps !== undefined && outcome.reps > 0 && (() => {
        const load = outcome.load;
        const previousAtLoad = previous.history.flatMap(group => completedWorkingSets(group.session, exerciseId))
          .filter(oldSet => !oldSet.warmup)
          .flatMap(oldSet => loadOutcomes(oldSet, resolveLoadMode?.(exerciseId)).filter(oldOutcome => oldOutcome.loadMode === outcome.loadMode && oldOutcome.load === load).map(oldOutcome => oldOutcome.reps ?? 0));
        return outcome.reps! > Math.max(0, ...previousAtLoad);
      })())) {
        highlights.push({ exerciseName: set.exerciseName, detail: 'New rep best at this load' });
      }
      if (mode === 'external' && outcomes.some(outcome => outcome.reps !== undefined && outcome.reps >= 1 && outcome.reps <= 10 && (() => {
        const estimate = outcome.load * (1 + outcome.reps! / 30);
        return !previous.estimatedOneRepMax || estimate > previous.estimatedOneRepMax.value;
      })())) {
        highlights.push({ exerciseName: set.exerciseName, detail: 'New estimated 1RM best' });
      }
      if ((set.targetMode === 'timed' || set.targetMode === 'hold') && Number(set.actualDurationSeconds) > (previous.longestTimedSet?.value || 0)) {
        highlights.push({ exerciseName: set.exerciseName, detail: 'New longest timed set' });
      }
    }
  }
  return [...new Map(highlights.map(item => [`${item.exerciseName}:${item.detail}`, item])).values()].slice(0, 4);
}

/** Short, factual comparison signals for the completion summary. */
export function getSessionProgressionHighlights(
  session: Pick<WorkoutSession, 'exercises'>,
  previousSessions: WorkoutSession[],
  resolveLoadMode?: WorkoutLoadModeResolver,
): Array<{ exerciseName: string; detail: string }> {
  const highlights: Array<{ exerciseName: string; detail: string }> = [];
  const exerciseIds = new Set(session.exercises.flatMap(set => set.exerciseId ? [set.exerciseId] : []));
  for (const exerciseId of exerciseIds) {
    const currentSets = session.exercises.filter(set => set.exerciseId === exerciseId && set.status === 'completed' && !set.warmup);
    if (!currentSets.length) continue;
    const previous = deriveExercisePerformance(exerciseId, previousSessions, resolveLoadMode).history
      .find(group => group.session.status === 'completed' && group.sets.some(set => set.status === 'completed' && !set.warmup));
    if (!previous) continue;
    const previousByPosition = new Map(completedWorkingSets(previous.session, exerciseId).map(set => [`${set.roundIndex}:${set.setIndex}`, set]));
    const matched = currentSets.flatMap(current => {
      const old = previousByPosition.get(`${current.roundIndex}:${current.setIndex}`);
      if (!old) return [];
      const oldBySide = new Map(repOutcomes(old, resolveLoadMode?.(exerciseId)).map(outcome => [outcome.side, outcome]));
      return repOutcomes(current, resolveLoadMode?.(exerciseId)).flatMap(outcome => {
        const prior = oldBySide.get(outcome.side);
        return prior ? [{ current: outcome, old: prior }] : [];
      });
    });
    if (!matched.length) continue;
    const sameLoadRepGain = matched.some(({ current, old }) =>
      current.loadMode !== undefined && current.loadMode === old.loadMode && current.load !== undefined && current.load === old.load &&
      current.reps !== undefined && old.reps !== undefined && current.reps > old.reps,
    );
    const lessAssistance = matched.some(({ current, old }) => current.loadMode === 'assistance'
      && old.loadMode === 'assistance' && current.load !== undefined && old.load !== undefined && current.load < old.load);
    const performanceDropped = matched.some(({ current, old }) => {
      const sameLoadMode = current.loadMode !== undefined && current.loadMode === old.loadMode;
      const repDrop = sameLoadMode && current.reps !== undefined && old.reps !== undefined && current.reps < old.reps;
      const loadDrop = sameLoadMode && current.load !== undefined && old.load !== undefined &&
        (current.loadMode === 'assistance' ? current.load > old.load : current.loadMode !== 'none' && current.load < old.load);
      return repDrop || loadDrop;
    });
    const metTargets = currentSets.every(set =>
      set.targetMode === 'reps' && set.targetReps !== undefined && repOutcomes(set).every(outcome => outcome.reps !== undefined && outcome.reps >= set.targetReps!),
    );
    const comfortable = currentSets.some(set => set.rir !== undefined && set.rir >= 2 || set.rpe !== undefined && set.rpe >= 1 && set.rpe <= 8);
    const exerciseName = currentSets[0].exerciseName;
    if (sameLoadRepGain) highlights.push({ exerciseName, detail: 'More reps at the same load than last time.' });
    else if (lessAssistance) highlights.push({ exerciseName, detail: 'Less assistance than last time.' });
    else if (performanceDropped) highlights.push({ exerciseName, detail: 'Performance was lower than last time; keeping the planned load steady is reasonable.' });
    else if (resolveLoadMode?.(exerciseId) !== undefined && metTargets && comfortable) highlights.push({ exerciseName, detail: 'Work-set targets were completed with room to spare. Consider a small progression if it still feels comfortable.' });
  }
  return highlights.slice(0, 3);
}

/** A small, optional rep-only suggestion derived from fully completed, comfortably rated sets. */
export function getSessionNextRepTargets(session: Pick<WorkoutSession, 'exercises'>): Array<{ exerciseName: string; detail: string }> {
  const exerciseIds = new Set(session.exercises.flatMap(set => set.exerciseId ? [set.exerciseId] : []));
  const targets: Array<{ exerciseName: string; detail: string }> = [];
  for (const exerciseId of exerciseIds) {
    const plannedWorkSets = session.exercises.filter(set => set.exerciseId === exerciseId && !set.warmup);
    if (!plannedWorkSets.length || plannedWorkSets.some(set =>
      set.status !== 'completed' || set.targetMode !== 'reps' || set.targetReps === undefined ||
      !(set.rir !== undefined && set.rir >= 2 || set.rpe !== undefined && set.rpe >= 1 && set.rpe <= 8),
    )) continue;
    const allTargetsMet = plannedWorkSets.every(set => {
      const hasSideResults = set.actualRepsLeft !== undefined || set.actualRepsRight !== undefined;
      if (hasSideResults) return set.actualRepsLeft !== undefined && set.actualRepsRight !== undefined
        && set.actualRepsLeft >= set.targetReps! && set.actualRepsRight >= set.targetReps!;
      return set.actualReps !== undefined && set.actualReps >= set.targetReps!;
    });
    if (!allTargetsMet) continue;
    const unilateral = plannedWorkSets.some(set => set.actualRepsLeft !== undefined || set.actualRepsRight !== undefined);
    const loadModes = new Set(plannedWorkSets.map(set => set.loadMode));
    const loadContext = loadModes.size === 1
      ? loadModes.has('assistance') ? 'at the same assistance amount'
        : loadModes.has('bodyweight-plus') ? 'at the same added load'
          : loadModes.has('external') ? 'at the same entered load'
            : 'with the same setup'
      : 'with the same setup';
    targets.push({
      exerciseName: plannedWorkSets[0].exerciseName,
      detail: unilateral
        ? `Next time: add 1 rep per side on each working set ${loadContext}.`
        : `Next time: add 1 rep to each working set ${loadContext}.`,
    });
  }
  return targets.slice(0, 4);
}
