import { describe, expect, it } from 'vitest';
import { BUILTIN_WORKOUT_CATALOG, BUILTIN_WORKOUT_EXERCISES, BUILTIN_WORKOUT_ROUTINES, BUILTIN_WORKOUT_STRETCHES } from '@/lib/health/workout-catalog';
import { validateWorkoutExerciseDefinition, validateWorkoutRoutine } from '@/lib/health/guided-workout-validation';
import { normalizeHealth } from '@/lib/health/normalization';
import { clearWorkoutCheckpoint, getWorkoutCheckpointKey, readWorkoutCheckpoint, writeWorkoutCheckpoint } from '@/lib/health/workout-checkpoint';
import { getWorkoutWeekSummary } from '@/lib/health/workout-summary';
import {
  buildWorkoutSession,
  completeCurrentWorkoutSlot,
  createWorkoutRunnerState,
  getRemainingSeconds,
  hasMeaningfulWorkoutProgress,
  pauseWorkout,
  previousWorkoutSlot,
  resumeWorkout,
  skipWorkoutRest,
  skipWorkoutSlot,
  startWorkout,
  tickWorkout,
} from '@/lib/health/workout-runner';

describe('guided workout catalog', () => {
  it('contains the exact built-in movement counts and stable ids', () => {
    expect(BUILTIN_WORKOUT_EXERCISES).toHaveLength(30);
    expect(BUILTIN_WORKOUT_STRETCHES).toHaveLength(20);
    expect(BUILTIN_WORKOUT_ROUTINES).toHaveLength(8);
    expect(BUILTIN_WORKOUT_CATALOG.map(item => item.id)).toEqual(
      expect.arrayContaining(['push-up', 'plank', 'neck-side-stretch', 'knee-to-chest-stretch']),
    );
    expect(new Set(BUILTIN_WORKOUT_CATALOG.map(item => item.id)).size).toBe(50);
    expect(BUILTIN_WORKOUT_CATALOG.every(item => (
      item.purpose
      && item.instructionSteps && item.instructionSteps.length >= 2
      && item.formCues && item.formCues.length >= 1
    ))).toBe(true);
  });
});

describe('guided workout validation', () => {
  it('requires named exercises and non-empty routines', () => {
    expect(validateWorkoutExerciseDefinition({ name: '', targetMode: 'reps' }).name).toBeTruthy();
    expect(validateWorkoutRoutine({ name: 'Empty', items: [] }).items).toBeTruthy();
    expect(validateWorkoutRoutine({ name: 'Good', items: [{ id: 'i', exerciseId: 'push-up', exerciseNameSnapshot: 'Push-up' }] })).toEqual({});
  });
});

describe('guided workout compatibility', () => {
  it('preserves pending snapshots while normalizing older skipped snapshots', () => {
    const normalized = normalizeHealth({
      activityEntries: [],
      foodEntries: [],
      foodTemplates: [],
      noXTrackers: [],
      workoutSessions: [{
        id: 'session',
        routineName: 'Recovery',
        startedAt: new Date('2026-08-25T08:00:00Z'),
        status: 'partial',
        completedExerciseCount: 0,
        totalExerciseCount: 2,
        roundsCompleted: 0,
        createdAt: new Date('2026-08-25T08:00:00Z'),
        exercises: [
          { slotId: 'a', exerciseName: 'Push-up', kind: 'exercise', targetMode: 'reps', setIndex: 0, roundIndex: 0, status: 'pending' },
          { slotId: 'b', exerciseName: 'Plank', kind: 'exercise', targetMode: 'hold', setIndex: 0, roundIndex: 0, status: 'skipped' },
        ],
      }],
    });
    expect(normalized.workoutSessions?.[0].exercises.map(item => item.status)).toEqual(['pending', 'skipped']);
  });

  it('keeps optional movement guidance backward compatible', () => {
    const normalized = normalizeHealth({
      activityEntries: [],
      foodEntries: [],
      foodTemplates: [],
      noXTrackers: [],
      workoutExercises: [{ id: 'old', name: 'Old movement', kind: 'exercise', category: 'Core', equipment: 'None', difficulty: 'easy', targetMode: 'manual', instructions: 'Use a steady pace.', source: 'custom' }],
    });
    expect(normalized.workoutExercises?.[0].instructions).toBe('Use a steady pace.');
    expect(normalized.workoutExercises?.[0].instructionSteps).toEqual([]);
    expect(normalized.workoutExercises?.[0].formCues).toEqual([]);
  });
});

describe('guided workout summaries and recovery', () => {
  it('excludes partial sessions from completed weekly summaries', () => {
    const start = new Date('2026-08-24T00:00:00+08:00');
    const end = new Date('2026-08-30T23:59:59+08:00');
    const summary = getWorkoutWeekSummary([
      { id: 'complete', routineName: 'Complete', startedAt: new Date('2026-08-25T08:00:00+08:00'), status: 'completed', durationMinutes: 20, exercises: [], completedExerciseCount: 1, totalExerciseCount: 1, roundsCompleted: 1, createdAt: new Date('2026-08-25T08:00:00+08:00') },
      { id: 'partial', routineName: 'Partial', startedAt: new Date('2026-08-26T08:00:00+08:00'), status: 'partial', durationMinutes: 30, exercises: [], completedExerciseCount: 0, totalExerciseCount: 1, roundsCompleted: 0, createdAt: new Date('2026-08-26T08:00:00+08:00') },
    ], [], start, end);
    expect(summary.sessions).toBe(1);
    expect(summary.movementMinutes).toBe(20);
  });

  it('rejects a stale checkpoint whose slot is not part of its routine', () => {
    const originalWindow = globalThis.window;
    Object.assign(globalThis, { window: globalThis });
    const state = startWorkout(createWorkoutRunnerState(BUILTIN_WORKOUT_ROUTINES[0], BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    state.slots[0].exerciseId = 'missing-exercise';
    writeWorkoutCheckpoint('profile-a', state);
    expect(readWorkoutCheckpoint('profile-a')).toBeNull();
    expect(localStorage.getItem(getWorkoutCheckpointKey('profile-a'))).toBeNull();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  });
});

describe('guided workout runner', () => {
  const routine = {
    id: 'test-routine',
    name: 'Test routine',
    source: 'custom' as const,
    rounds: 1,
    defaultRestSeconds: 5,
    items: [
      { id: 'one', exerciseId: 'jumping-jack', exerciseNameSnapshot: 'Jumping Jack', targetMode: 'timed' as const, durationSeconds: 10, sets: 1 },
      { id: 'two', exerciseId: 'push-up', exerciseNameSnapshot: 'Push-up', targetMode: 'reps' as const, reps: 5, sets: 1 },
    ],
  };

  it('uses deadline time and transitions through rest and completion', () => {
    const ready = createWorkoutRunnerState(routine, BUILTIN_WORKOUT_CATALOG, 1_000);
    const started = startWorkout(ready, 1_000).state;
    expect(started.phase).toBe('WORK');
    expect(getRemainingSeconds(started, 6_000)).toBe(5);
    const rest = completeCurrentWorkoutSlot(started, 11_000).state;
    expect(rest.phase).toBe('REST');
    expect(getRemainingSeconds(rest, 14_000)).toBe(2);
    const work = skipWorkoutRest(rest, 14_000).state;
    expect(work.phase).toBe('WORK');
    const complete = completeCurrentWorkoutSlot(work, 15_000).state;
    expect(complete.phase).toBe('COMPLETE');
    expect(buildWorkoutSession(complete, 'completed', 16_000).completedExerciseCount).toBe(2);
  });

  it('supports pause/resume, previous, and partial snapshots without mutation', () => {
    const started = startWorkout(createWorkoutRunnerState(routine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    const paused = pauseWorkout(started, 4_000).state;
    expect(paused.phase).toBe('PAUSED');
    expect(resumeWorkout(paused, 10_000).state.phase).toBe('WORK');
    const firstDone = completeCurrentWorkoutSlot(started, 11_000).state;
    const back = previousWorkoutSlot(skipWorkoutRest(firstDone, 11_000).state, 12_000).state;
    expect(back.currentSlotIndex).toBe(0);
    const partial = buildWorkoutSession(firstDone, 'partial', 12_000);
    expect(partial.status).toBe('partial');
    expect(partial.exercises[0].status).toBe('completed');
    expect(partial.exercises[1].status).toBe('pending');
    expect(partial.completedExerciseCount).toBe(1);
  });

  it('requires confirmation after progress, preserves Keep & leave checkpoints, and never completes on Back', () => {
    const originalWindow = globalThis.window;
    Object.assign(globalThis, { window: globalThis });
    const ready = createWorkoutRunnerState(routine, BUILTIN_WORKOUT_CATALOG, 1_000);
    const started = startWorkout(ready, 1_000).state;

    expect(hasMeaningfulWorkoutProgress(ready)).toBe(false);
    expect(hasMeaningfulWorkoutProgress(started)).toBe(true);
    writeWorkoutCheckpoint('profile-runner', started);
    expect(readWorkoutCheckpoint('profile-runner')).toMatchObject({ phase: 'WORK', startedAt: 1_000 });
    expect(buildWorkoutSession(started, 'completed', 2_000).status).toBe('partial');

    clearWorkoutCheckpoint('profile-runner');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  });

  it('never records skipped or unfinished slots as a completed session', () => {
    const started = startWorkout(createWorkoutRunnerState(routine, BUILTIN_WORKOUT_CATALOG, 1_000), 1_000).state;
    const skipped = buildWorkoutSession(skipWorkoutSlot(started, 2_000).state, 'completed', 12_000);
    expect(skipped.status).toBe('partial');
    expect(skipped.completedAt).toBeUndefined();
    expect(skipped.exercises[0].status).toBe('skipped');
    expect(skipped.exercises[1].status).toBe('pending');
  });

  it('recalculates an expired deadline on visibility/tick recovery', () => {
    const started = startWorkout(createWorkoutRunnerState(routine, BUILTIN_WORKOUT_CATALOG, 100), 100).state;
    const transition = tickWorkout(started, 10_100);
    expect(transition.state.slots[0].status).toBe('completed');
    expect(transition.state.phase).toBe('REST');
  });
});
