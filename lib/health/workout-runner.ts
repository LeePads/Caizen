import type {
  WorkoutExerciseDefinition,
  WorkoutRoutine,
  WorkoutSession,
  WorkoutSessionExerciseSnapshot,
  WorkoutTargetMode,
  WorkoutLoadMode,
} from '../types';
import { inferWorkoutLoadMode } from './workout-taxonomy';

export type WorkoutRunnerPhase = 'READY' | 'WORK' | 'REST' | 'PAUSED' | 'COMPLETE';
export type WorkoutRunnerSlotStatus = 'pending' | 'completed' | 'skipped';

/** What actually happened on a set. Only ever set when the user recorded it — absent means not recorded, not zero. */
export type WorkoutRunnerSlotActualData = {
  actualReps?: number;
  actualWeight?: number;
  actualDurationSeconds?: number;
  actualRepsLeft?: number;
  actualRepsRight?: number;
  actualWeightLeft?: number;
  actualWeightRight?: number;
  rir?: number;
  rpe?: number;
};

export type WorkoutRunnerSlot = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  kind: WorkoutExerciseDefinition['kind'];
  targetMode: WorkoutTargetMode;
  durationSeconds?: number;
  reps?: number;
  /** Planned load, when the routine item specified one. Never derived from the exercise definition. */
  targetWeight?: number;
  loadMode?: WorkoutLoadMode;
  restSeconds: number;
  setIndex: number;
  roundIndex: number;
  status: WorkoutRunnerSlotStatus;
  /** A warm-up set: recordable, but excluded from working-set prefill, PR detection, and volume totals. */
  warmup?: boolean;
  /** Adjacent slots sharing this id belong to the same superset group and share one rest at the end of the group. */
  supersetGroupId?: string;
} & WorkoutRunnerSlotActualData;

export type WorkoutRunnerState = {
  routine: WorkoutRoutine;
  slots: WorkoutRunnerSlot[];
  currentSlotIndex: number;
  phase: WorkoutRunnerPhase;
  phaseBeforePause?: 'WORK' | 'REST';
  phaseDeadlineAt?: number;
  phaseRemainingSeconds?: number;
  startedAt: number;
  lastActiveAt?: number;
  sequence: number;
};

export type WorkoutRunnerTransition = {
  state: WorkoutRunnerState;
  event: 'start' | 'pause' | 'resume' | 'done' | 'skip' | 'skip-rest' | 'previous' | 'tick' | 'complete';
};

export function hasMeaningfulWorkoutProgress(state: Pick<WorkoutRunnerState, 'phase' | 'slots'>) {
  return state.phase !== 'READY' || state.slots.some(slot => slot.status !== 'pending');
}

const positiveInteger = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

const nonNegativeInteger = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
};

function buildSlot(
  item: WorkoutRoutine['items'][number],
  exercise: WorkoutExerciseDefinition | undefined,
  setIndex: number,
  roundIndex: number,
  restSeconds: number,
  slotIndexInItems: number,
): WorkoutRunnerSlot {
  const targetMode = item.targetMode || exercise?.targetMode || 'manual';
  return {
    id: `${roundIndex}:${slotIndexInItems}:${setIndex}:${item.id}`,
    exerciseId: item.exerciseId,
    exerciseName: item.exerciseNameSnapshot || exercise?.name || 'Unavailable exercise',
    kind: exercise?.kind || 'exercise',
    targetMode,
    durationSeconds: targetMode === 'timed' || targetMode === 'hold'
      ? nonNegativeInteger(item.durationSeconds ?? exercise?.defaultDurationSeconds, 0)
      : undefined,
    reps: targetMode === 'reps'
      ? positiveInteger(item.reps ?? exercise?.defaultReps, 1)
      : undefined,
    targetWeight: item.targetWeight,
    loadMode: exercise?.loadMode ?? inferWorkoutLoadMode(exercise?.equipment, exercise?.name),
    restSeconds,
    setIndex,
    roundIndex,
    status: 'pending',
    warmup: setIndex < nonNegativeInteger(item.warmupSets, 0),
    supersetGroupId: item.supersetGroupId,
  };
}

/**
 * Groups adjacent routine items sharing a non-empty supersetGroupId. A
 * singleton group (length 1) is the ordinary, non-superset case.
 */
function groupRoutineItems(items: WorkoutRoutine['items']): Array<{ items: WorkoutRoutine['items']; startIndex: number }> {
  const groups: Array<{ items: WorkoutRoutine['items']; startIndex: number }> = [];
  let index = 0;
  while (index < items.length) {
    const groupId = items[index].supersetGroupId;
    let end = index;
    if (groupId) {
      while (end + 1 < items.length && items[end + 1].supersetGroupId === groupId) end += 1;
    }
    groups.push({ items: items.slice(index, end + 1), startIndex: index });
    index = end + 1;
  }
  return groups;
}

export function createWorkoutRunnerState(
  routine: WorkoutRoutine,
  exercises: WorkoutExerciseDefinition[],
  now = Date.now(),
): WorkoutRunnerState {
  const exerciseMap = new Map(exercises.map(exercise => [exercise.id, exercise]));
  const slots: WorkoutRunnerSlot[] = [];
  const rounds = positiveInteger(routine.rounds, 1);
  const groups = groupRoutineItems(routine.items);

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    groups.forEach(group => {
      if (group.items.length === 1) {
        const item = group.items[0];
        const exercise = exerciseMap.get(item.exerciseId);
        const sets = positiveInteger(item.sets ?? exercise?.defaultSets, 1);
        for (let setIndex = 0; setIndex < sets; setIndex += 1) {
          const restSeconds = nonNegativeInteger(item.restSeconds ?? routine.defaultRestSeconds ?? exercise?.defaultRestSeconds, 0);
          slots.push(buildSlot(item, exercise, setIndex, roundIndex, restSeconds, group.startIndex));
        }
        return;
      }

      // Superset: interleave one set per member per pass (A -> B -> ... ->
      // rest), instead of finishing every set of A before starting B. Rest
      // only follows the last member that still has a set at this pass.
      const memberSets = group.items.map(member => positiveInteger(member.sets ?? exerciseMap.get(member.exerciseId)?.defaultSets, 1));
      const maxSets = Math.max(...memberSets);
      for (let setIndex = 0; setIndex < maxSets; setIndex += 1) {
        let lastContributingLocalIndex = -1;
        memberSets.forEach((memberSetCount, localIndex) => {
          if (setIndex < memberSetCount) lastContributingLocalIndex = localIndex;
        });
        group.items.forEach((member, localIndex) => {
          if (setIndex >= memberSets[localIndex]) return;
          const exercise = exerciseMap.get(member.exerciseId);
          const isLastInPass = localIndex === lastContributingLocalIndex;
          const restSeconds = isLastInPass
            ? nonNegativeInteger(member.restSeconds ?? routine.defaultRestSeconds ?? exercise?.defaultRestSeconds, 0)
            : 0;
          slots.push(buildSlot(member, exercise, setIndex, roundIndex, restSeconds, group.startIndex + localIndex));
        });
      }
    });
  }

  return {
    routine,
    slots,
    currentSlotIndex: 0,
    phase: 'READY',
    startedAt: now,
    sequence: 0,
  };
}

function currentSlot(state: WorkoutRunnerState) {
  return state.slots[state.currentSlotIndex];
}

function withSequence(state: WorkoutRunnerState, updates: Partial<WorkoutRunnerState>): WorkoutRunnerState {
  return { ...state, ...updates, sequence: state.sequence + 1 };
}

function workDeadline(slot: WorkoutRunnerSlot | undefined, now: number) {
  if (!slot || (slot.targetMode !== 'timed' && slot.targetMode !== 'hold')) return undefined;
  if (!slot.durationSeconds) return undefined;
  return now + slot.durationSeconds * 1000;
}

function enterWork(state: WorkoutRunnerState, slotIndex: number, now: number): WorkoutRunnerState {
  const slot = state.slots[slotIndex];
  if (!slot) return withSequence(state, { phase: 'COMPLETE', phaseDeadlineAt: undefined, lastActiveAt: undefined });
  return withSequence(state, {
    currentSlotIndex: slotIndex,
    phase: 'WORK',
    phaseBeforePause: undefined,
    phaseDeadlineAt: workDeadline(slot, now),
    phaseRemainingSeconds: undefined,
    lastActiveAt: now,
  });
}

function advanceFromSlot(state: WorkoutRunnerState, now: number, allowRest = true): WorkoutRunnerState {
  const slot = currentSlot(state);
  const nextIndex = state.currentSlotIndex + 1;
  if (!slot || nextIndex >= state.slots.length) {
    return withSequence(state, {
      phase: 'COMPLETE',
      phaseDeadlineAt: undefined,
      lastActiveAt: undefined,
      phaseRemainingSeconds: undefined,
    });
  }

  if (allowRest && slot.restSeconds > 0) {
    return withSequence(state, {
      currentSlotIndex: nextIndex,
      phase: 'REST',
      phaseDeadlineAt: now + slot.restSeconds * 1000,
      phaseRemainingSeconds: undefined,
      lastActiveAt: undefined,
    });
  }
  return enterWork(state, nextIndex, now);
}

export function startWorkout(state: WorkoutRunnerState, now = Date.now()): WorkoutRunnerTransition {
  if (state.phase === 'READY') return { state: enterWork(state, state.currentSlotIndex, now), event: 'start' };
  return { state, event: 'start' };
}

export function pauseWorkout(state: WorkoutRunnerState, now = Date.now()): WorkoutRunnerTransition {
  if (state.phase !== 'WORK' && state.phase !== 'REST') return { state, event: 'pause' };
  return {
    state: withSequence(state, {
      phase: 'PAUSED',
      phaseBeforePause: state.phase,
      phaseRemainingSeconds: getRemainingSeconds(state, now) ?? undefined,
      phaseDeadlineAt: undefined,
      lastActiveAt: undefined,
    }),
    event: 'pause',
  };
}

export function resumeWorkout(state: WorkoutRunnerState, now = Date.now()): WorkoutRunnerTransition {
  if (state.phase !== 'PAUSED') return { state, event: 'resume' };
  const phase = state.phaseBeforePause || 'WORK';
  return {
    state: withSequence(state, {
      phase,
      phaseDeadlineAt: state.phaseRemainingSeconds === undefined
        ? undefined
        : now + state.phaseRemainingSeconds * 1000,
      phaseRemainingSeconds: undefined,
      lastActiveAt: phase === 'WORK' ? now : undefined,
    }),
    event: 'resume',
  };
}

export function completeCurrentWorkoutSlot(
  state: WorkoutRunnerState,
  now = Date.now(),
  actualData?: WorkoutRunnerSlotActualData,
): WorkoutRunnerTransition {
  if (state.phase !== 'WORK') return { state, event: 'done' };
  const activeSlot = currentSlot(state);
  // A timed/hold set's actual duration is derived from the clock rather than
  // asked of the caller: elapsed time if finished early, the full target if
  // it ran out naturally (tickWorkout drives that path with no actualData).
  const remaining = getRemainingSeconds(state, now);
  const derivedDurationSeconds = activeSlot?.durationSeconds !== undefined
    ? Math.max(0, activeSlot.durationSeconds - Math.max(0, remaining ?? 0))
    : undefined;
  const slots = state.slots.map((slot, index) => index === state.currentSlotIndex ? {
    ...slot,
    status: 'completed' as const,
    ...actualData,
    actualDurationSeconds: actualData?.actualDurationSeconds ?? derivedDurationSeconds,
  } : slot);
  const advanced = advanceFromSlot({ ...state, slots }, now);
  return { state: { ...advanced, sequence: state.sequence + 1 }, event: advanced.phase === 'COMPLETE' ? 'complete' : 'done' };
}

export function skipWorkoutSlot(state: WorkoutRunnerState, now = Date.now()): WorkoutRunnerTransition {
  if (state.phase !== 'WORK') return { state, event: 'skip' };
  const slots = state.slots.map((slot, index) => index === state.currentSlotIndex ? { ...slot, status: 'skipped' as const } : slot);
  const advanced = advanceFromSlot({ ...state, slots }, now, false);
  return { state: { ...advanced, sequence: state.sequence + 1 }, event: advanced.phase === 'COMPLETE' ? 'complete' : 'skip' };
}

export function skipWorkoutRest(state: WorkoutRunnerState, now = Date.now()): WorkoutRunnerTransition {
  if (state.phase !== 'REST') return { state, event: 'skip-rest' };
  return { state: enterWork(state, state.currentSlotIndex, now), event: 'skip-rest' };
}

export function previousWorkoutSlot(state: WorkoutRunnerState, now = Date.now()): WorkoutRunnerTransition {
  if (state.phase === 'READY' || state.currentSlotIndex <= 0) return { state, event: 'previous' };
  return { state: enterWork(state, state.currentSlotIndex - 1, now), event: 'previous' };
}

export function tickWorkout(state: WorkoutRunnerState, now = Date.now()): WorkoutRunnerTransition {
  const remaining = getRemainingSeconds(state, now);
  if ((state.phase === 'WORK' || state.phase === 'REST') && remaining !== null && remaining <= 0) {
    return state.phase === 'WORK'
      ? completeCurrentWorkoutSlot(state, now)
      : skipWorkoutRest(state, now);
  }
  return { state, event: 'tick' };
}

export function getRemainingSeconds(state: WorkoutRunnerState, now = Date.now()): number | null {
  if (state.phaseDeadlineAt === undefined) return null;
  const remaining = Math.ceil((state.phaseDeadlineAt - now) / 1000);
  return Math.max(0, remaining);
}

export function buildWorkoutSession(
  state: WorkoutRunnerState,
  status: 'completed' | 'partial',
  now = Date.now(),
): Omit<WorkoutSession, 'id' | 'createdAt'> {
  const snapshots: WorkoutSessionExerciseSnapshot[] = state.slots.map(slot => ({
    slotId: slot.id,
    exerciseId: slot.exerciseId,
    exerciseName: slot.exerciseName,
    kind: slot.kind,
    targetMode: slot.targetMode,
    targetDurationSeconds: slot.durationSeconds,
    targetReps: slot.reps,
    targetWeight: slot.targetWeight,
    loadMode: slot.loadMode,
    setIndex: slot.setIndex,
    roundIndex: slot.roundIndex,
    status: slot.status,
    completedAt: slot.status === 'completed' ? new Date(now) : undefined,
    warmup: slot.warmup,
    actualReps: slot.actualReps,
    actualWeight: slot.actualWeight,
    actualDurationSeconds: slot.actualDurationSeconds,
    actualRepsLeft: slot.actualRepsLeft,
    actualRepsRight: slot.actualRepsRight,
    actualWeightLeft: slot.actualWeightLeft,
    actualWeightRight: slot.actualWeightRight,
    rir: slot.rir,
    rpe: slot.rpe,
  }));
  const completedExerciseCount = snapshots.filter(slot => slot.status === 'completed').length;
  const hasUnfinishedSlots = snapshots.some(slot => slot.status !== 'completed');
  const persistedStatus = status === 'completed' && !hasUnfinishedSlots ? 'completed' : 'partial';
  const completedRounds = new Set(
    state.slots
      .filter(slot => slot.status === 'completed')
      .map(slot => slot.roundIndex),
  ).size;
  return {
    routineId: state.routine.id,
    sourceRoutineId: state.routine.id,
    routineName: state.routine.name,
    startedAt: new Date(state.startedAt),
    completedAt: persistedStatus === 'completed' ? new Date(now) : undefined,
    durationMinutes: Math.max(1, Math.round((now - state.startedAt) / 60000)),
    status: persistedStatus,
    exercises: snapshots,
    completedExerciseCount,
    totalExerciseCount: snapshots.length,
    roundsCompleted: completedRounds,
  };
}
