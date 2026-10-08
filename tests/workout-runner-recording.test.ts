import { describe, expect, it } from 'vitest';
import {
  buildWorkoutSession,
  completeCurrentWorkoutSlot,
  createWorkoutRunnerState,
  previousWorkoutSlot,
  skipWorkoutRest,
  startWorkout,
} from '@/lib/health/workout-runner';
import { readWorkoutCheckpoint, writeWorkoutCheckpoint } from '@/lib/health/workout-checkpoint';
import { getPreviousSetPerformance } from '@/lib/health/workout-history';
import { normalizeHealth } from '@/lib/health/normalization';
import { BUILTIN_WORKOUT_CATALOG } from '@/lib/health/workout-catalog';
import type { WorkoutRoutine, WorkoutSession } from '@/lib/types';

const repsRoutine: WorkoutRoutine = {
  id: 'reps-routine',
  name: 'Reps routine',
  source: 'custom',
  rounds: 1,
  defaultRestSeconds: 5,
  items: [
    { id: 'squat-item', exerciseId: 'bodyweight-squat', exerciseNameSnapshot: 'Bodyweight Squat', targetMode: 'reps', reps: 12, sets: 3 },
  ],
};

describe('actual set data recording', () => {
  it('persists actual reps and weight on the slot, then into the built session', () => {
    const started = startWorkout(createWorkoutRunnerState(repsRoutine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    const done = completeCurrentWorkoutSlot(started, 5_000, { actualReps: 10, actualWeight: 20 }).state;
    expect(done.slots[0].actualReps).toBe(10);
    expect(done.slots[0].actualWeight).toBe(20);
    const session = buildWorkoutSession(done, 'partial', 5_000);
    expect(session.exercises[0].actualReps).toBe(10);
    expect(session.exercises[0].actualWeight).toBe(20);
  });

  it('leaves actual fields undefined (not recorded) rather than zero when nothing was entered', () => {
    const started = startWorkout(createWorkoutRunnerState(repsRoutine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    const done = completeCurrentWorkoutSlot(started, 5_000).state;
    const session = buildWorkoutSession(done, 'partial', 5_000);
    expect(session.exercises[0].actualReps).toBeUndefined();
    expect(session.exercises[0].actualWeight).toBeUndefined();
    expect(session.exercises[0].status).toBe('completed');
  });

  it('distinguishes a recorded zero from not-recorded', () => {
    const started = startWorkout(createWorkoutRunnerState(repsRoutine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    const done = completeCurrentWorkoutSlot(started, 5_000, { actualReps: 0 }).state;
    expect(done.slots[0].actualReps).toBe(0);
  });

  it('records unilateral per-side actuals without affecting the shared actualReps field', () => {
    const started = startWorkout(createWorkoutRunnerState(repsRoutine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    const done = completeCurrentWorkoutSlot(started, 5_000, { actualRepsLeft: 8, actualRepsRight: 7 }).state;
    expect(done.slots[0].actualRepsLeft).toBe(8);
    expect(done.slots[0].actualRepsRight).toBe(7);
    expect(done.slots[0].actualReps).toBeUndefined();
  });
});

describe('timed actual duration', () => {
  const timedRoutine: WorkoutRoutine = {
    id: 'timed-routine',
    name: 'Timed routine',
    source: 'custom',
    rounds: 1,
    items: [{ id: 'plank-item', exerciseId: 'plank', exerciseNameSnapshot: 'Plank', targetMode: 'hold', durationSeconds: 30, sets: 1 }],
  };

  it('records the full target duration when the timer runs out naturally', () => {
    const started = startWorkout(createWorkoutRunnerState(timedRoutine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    const done = completeCurrentWorkoutSlot(started, 31_000).state;
    expect(done.slots[0].actualDurationSeconds).toBe(30);
  });

  it('records elapsed time (not the full target) when finished early', () => {
    const started = startWorkout(createWorkoutRunnerState(timedRoutine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    const done = completeCurrentWorkoutSlot(started, 11_000).state; // 10s elapsed of a 30s hold
    expect(done.slots[0].actualDurationSeconds).toBe(10);
  });
});

describe('warm-up sets', () => {
  const warmupRoutine: WorkoutRoutine = {
    id: 'warmup-routine',
    name: 'Warm-up routine',
    source: 'custom',
    rounds: 1,
    items: [{ id: 'squat-item', exerciseId: 'bodyweight-squat', exerciseNameSnapshot: 'Bodyweight Squat', targetMode: 'reps', reps: 10, sets: 3, warmupSets: 1 }],
  };

  it('marks only the leading set(s) as warm-up, leaving the rest as working sets', () => {
    const state = createWorkoutRunnerState(warmupRoutine, BUILTIN_WORKOUT_CATALOG, 1_000);
    expect(state.slots.map(slot => slot.warmup)).toEqual([true, false, false]);
  });

  it('excludes warm-up sets from previous-session prefill', () => {
    const session: WorkoutSession = {
      id: 'session-1',
      routineName: 'Warm-up routine',
      startedAt: new Date('2026-09-01T08:00:00Z'),
      completedAt: new Date('2026-09-01T08:20:00Z'),
      status: 'completed',
      completedExerciseCount: 3,
      totalExerciseCount: 3,
      roundsCompleted: 1,
      createdAt: new Date('2026-09-01T08:20:00Z'),
      exercises: [
        { slotId: 'a', exerciseId: 'bodyweight-squat', exerciseName: 'Bodyweight Squat', kind: 'exercise', targetMode: 'reps', setIndex: 0, roundIndex: 0, status: 'completed', warmup: true, actualReps: 20 },
        { slotId: 'b', exerciseId: 'bodyweight-squat', exerciseName: 'Bodyweight Squat', kind: 'exercise', targetMode: 'reps', setIndex: 1, roundIndex: 0, status: 'completed', actualReps: 10, actualWeight: 20 },
      ],
    };
    const prefill = getPreviousSetPerformance('bodyweight-squat', [session]);
    expect(prefill.has(0)).toBe(false);
    expect(prefill.get(1)).toEqual({ actualReps: 10, actualWeight: 20, actualDurationSeconds: undefined });
  });
});

describe('per-exercise rest and superset rest', () => {
  it('lets an exercise-specific rest override the routine default', () => {
    const routine: WorkoutRoutine = {
      id: 'override-rest',
      name: 'Override rest',
      source: 'custom',
      rounds: 1,
      defaultRestSeconds: 60,
      items: [{ id: 'item', exerciseId: 'push-up', exerciseNameSnapshot: 'Push-up', targetMode: 'reps', reps: 10, sets: 2, restSeconds: 15 }],
    };
    const state = createWorkoutRunnerState(routine, BUILTIN_WORKOUT_CATALOG, 1_000);
    expect(state.slots[0].restSeconds).toBe(15);
  });

  it('interleaves a superset set-by-set and rests only after the last member of a pass', () => {
    const routine: WorkoutRoutine = {
      id: 'superset-routine',
      name: 'Superset routine',
      source: 'custom',
      rounds: 1,
      defaultRestSeconds: 20,
      items: [
        { id: 'a', exerciseId: 'push-up', exerciseNameSnapshot: 'Push-up', targetMode: 'reps', reps: 10, sets: 2, supersetGroupId: 'ss-1' },
        { id: 'b', exerciseId: 'bodyweight-squat', exerciseNameSnapshot: 'Bodyweight Squat', targetMode: 'reps', reps: 10, sets: 2, supersetGroupId: 'ss-1' },
      ],
    };
    const state = createWorkoutRunnerState(routine, BUILTIN_WORKOUT_CATALOG, 1_000);
    expect(state.slots.map(slot => slot.exerciseId)).toEqual(['push-up', 'bodyweight-squat', 'push-up', 'bodyweight-squat']);
    expect(state.slots.map(slot => slot.restSeconds)).toEqual([0, 20, 0, 20]);
  });

  it('the final set of the final exercise needs no rest timer', () => {
    let state = startWorkout(createWorkoutRunnerState(repsRoutine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    state = completeCurrentWorkoutSlot(state, 2_000).state; // set 1 done -> REST before set 2
    expect(state.phase).toBe('REST');
    state = skipWorkoutRest(state, 2_000).state; // set 2 WORK
    state = completeCurrentWorkoutSlot(state, 3_000).state; // set 2 done -> REST before set 3
    expect(state.phase).toBe('REST');
    state = skipWorkoutRest(state, 3_000).state; // set 3 WORK
    state = completeCurrentWorkoutSlot(state, 4_000).state; // set 3 (final) done
    expect(state.phase).toBe('COMPLETE');
  });
});

describe('set completion idempotence', () => {
  it('re-completing a set after navigating Previous overwrites in place instead of duplicating slots', () => {
    const started = startWorkout(createWorkoutRunnerState(repsRoutine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    const firstComplete = completeCurrentWorkoutSlot(started, 2_000, { actualReps: 8 }).state;
    const afterRest = skipWorkoutRest(firstComplete, 2_000).state;
    const backToFirst = previousWorkoutSlot(afterRest, 3_000).state;
    expect(backToFirst.currentSlotIndex).toBe(0);
    const slotCountBefore = backToFirst.slots.length;
    const recompleted = completeCurrentWorkoutSlot(backToFirst, 4_000, { actualReps: 9 }).state;
    expect(recompleted.slots.length).toBe(slotCountBefore);
    expect(recompleted.slots[0].actualReps).toBe(9);
    expect(recompleted.slots[0].status).toBe('completed');
  });
});

describe('checkpoint preserves actual set data', () => {
  it('round-trips actual reps/weight/warmup through write/read', () => {
    const originalWindow = globalThis.window;
    Object.assign(globalThis, { window: globalThis });
    const started = startWorkout(createWorkoutRunnerState(repsRoutine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    const done = completeCurrentWorkoutSlot(started, 2_000, { actualReps: 11, actualWeight: 25 }).state;
    writeWorkoutCheckpoint('profile-actuals', done);
    const recovered = readWorkoutCheckpoint('profile-actuals');
    expect(recovered?.slots[0].actualReps).toBe(11);
    expect(recovered?.slots[0].actualWeight).toBe(25);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  });
});

describe('backward compatibility with old WorkoutSession records', () => {
  it('normalizes a pre-existing session snapshot with none of the new fields', () => {
    const normalized = normalizeHealth({
      workoutSessions: [{
        id: 'legacy-session',
        routineName: 'Legacy',
        startedAt: new Date('2026-01-01T08:00:00Z'),
        status: 'completed',
        completedExerciseCount: 1,
        totalExerciseCount: 1,
        roundsCompleted: 1,
        createdAt: new Date('2026-01-01T08:00:00Z'),
        exercises: [
          { slotId: 'a', exerciseName: 'Push-up', kind: 'exercise', targetMode: 'reps', setIndex: 0, roundIndex: 0, status: 'completed' },
        ],
      }],
    } as any);
    const snapshot = normalized.workoutSessions?.[0].exercises[0];
    expect(snapshot?.status).toBe('completed');
    expect(snapshot?.actualReps).toBeUndefined();
    expect(snapshot?.warmup).toBe(false);
  });

  it('accepts an old-shape checkpoint slot with no new fields', () => {
    const originalWindow = globalThis.window;
    Object.assign(globalThis, { window: globalThis });
    const state = startWorkout(createWorkoutRunnerState(repsRoutine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    // Simulate an older, pre-upgrade checkpoint shape by stripping new fields.
    const legacyState = { ...state, slots: state.slots.map(({ warmup: _warmup, supersetGroupId: _supersetGroupId, targetWeight: _targetWeight, ...rest }) => rest) };
    writeWorkoutCheckpoint('profile-legacy', legacyState as any);
    expect(readWorkoutCheckpoint('profile-legacy')).not.toBeNull();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  });
});
