import { describe, expect, it } from 'vitest';

import {
  applyHealthEvidenceToProfile,
  hasCompletedStretchEvidence,
  qualifiesCompletedWorkoutSession,
  sessionMatchesCustomWorkoutRoutine,
} from '@/lib/health/lifehub-completion';
import { normalizeHealth } from '@/lib/health/normalization';
import { getRoutineOccurrence } from '@/lib/lifehub/routine-schedule';
import type {
  DailyChecklistItem,
  Profile,
  WorkoutExerciseDefinition,
  WorkoutRoutine,
  WorkoutSession,
} from '@/lib/types';

const today = new Date();
today.setHours(12, 0, 0, 0);
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

const customRoutine = (id: string): WorkoutRoutine => ({
  id,
  name: id,
  source: 'custom',
  items: [{
    id: `${id}-item`,
    exerciseId: `${id}-exercise`,
    exerciseNameSnapshot: id,
  }],
});

const session = (overrides: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: 'session',
  routineId: 'routine-a',
  sourceRoutineId: 'routine-a',
  routineName: 'Routine A',
  startedAt: new Date(today),
  completedAt: new Date(today),
  status: 'completed',
  exercises: [],
  completedExerciseCount: 0,
  totalExerciseCount: 0,
  roundsCompleted: 1,
  createdAt: new Date(today),
  ...overrides,
});

const snapshot = (
  kind: WorkoutExerciseDefinition['kind'],
  status: 'pending' | 'completed' | 'skipped' = 'completed',
) => ({
  slotId: `${kind}-${status}`,
  exerciseId: `${kind}-exercise`,
  exerciseName: kind,
  kind,
  targetMode: 'manual' as const,
  setIndex: 0,
  roundIndex: 0,
  status,
});

const routine = (
  id: string,
  evidence: DailyChecklistItem['healthRoutineEvidence'],
  overrides: Partial<DailyChecklistItem> = {},
): DailyChecklistItem => ({
  id,
  title: id,
  frequency: 'daily',
  active: true,
  createdAt: new Date(today),
  completionHistory: [],
  healthRoutineEvidence: evidence,
  ...overrides,
} as DailyChecklistItem);

const profile = (
  routines: DailyChecklistItem[],
  workoutRoutines: WorkoutRoutine[] = [],
): Profile => ({
  id: 'health-workout-evidence',
  name: 'Health workout evidence',
  dailyChecklistItems: routines,
  productivityItems: [{
    id: 'task',
    type: 'task',
    title: 'Remain manual',
    status: 'pending',
    createdAt: new Date(today),
  }],
  health: normalizeHealth({
    workoutRoutines,
    workoutSessions: [],
  }),
} as Profile);

describe('Phase 6C workout-session predicates', () => {
  it('requires a completed session whose completedAt is today locally', () => {
    expect(qualifiesCompletedWorkoutSession(session(), today)).toBe(true);
    expect(qualifiesCompletedWorkoutSession(session({ status: 'partial' }), today)).toBe(false);
    expect(qualifiesCompletedWorkoutSession(session({ completedAt: yesterday }), today)).toBe(false);
    expect(qualifiesCompletedWorkoutSession(session({ completedAt: tomorrow }), today)).toBe(false);
    expect(qualifiesCompletedWorkoutSession(session({ completedAt: new Date(Number.NaN) }), today)).toBe(false);
  });

  it('counts only completed stretch snapshots from completed sessions', () => {
    expect(hasCompletedStretchEvidence(session({ exercises: [snapshot('stretch')] }))).toBe(true);
    expect(hasCompletedStretchEvidence(session({ exercises: [snapshot('stretch', 'skipped')] }))).toBe(false);
    expect(hasCompletedStretchEvidence(session({ exercises: [snapshot('stretch', 'pending')] }))).toBe(false);
    expect(hasCompletedStretchEvidence(session({ exercises: [snapshot('exercise')] }))).toBe(false);
    expect(hasCompletedStretchEvidence(session({ status: 'partial', exercises: [snapshot('stretch')] }))).toBe(false);
  });

  it('uses sourceRoutineId as canonical identity and routineId only as legacy fallback', () => {
    const target = customRoutine('routine-a');
    expect(sessionMatchesCustomWorkoutRoutine(session(), target)).toBe(true);
    expect(sessionMatchesCustomWorkoutRoutine(session({ sourceRoutineId: undefined, routineId: 'routine-a' }), target)).toBe(true);
    expect(sessionMatchesCustomWorkoutRoutine(session({ sourceRoutineId: 'wrong', routineId: 'routine-a' }), target)).toBe(false);
    expect(sessionMatchesCustomWorkoutRoutine(session(), { ...target, source: 'builtin' })).toBe(false);
    expect(sessionMatchesCustomWorkoutRoutine(session({ routineId: undefined, sourceRoutineId: undefined }), target)).toBe(false);
  });
});

describe('Phase 6C workout and stretch evidence completion', () => {
  it('completes multiple eligible any-scope workout Routines, but never a Task', () => {
    const initial = profile([
      routine('workout-a', { mode: 'workout-completed', scope: 'any' }),
      routine('workout-b', { mode: 'workout-completed', scope: 'any' }),
    ]);
    const result = applyHealthEvidenceToProfile(initial, {
      kind: 'workout-session',
      session: session(),
    }, today);

    expect(result.completedRoutineIds).toEqual(['workout-a', 'workout-b']);
    expect(result.profile.productivityItems?.[0].status).toBe('pending');
    expect(getRoutineOccurrence(result.profile.dailyChecklistItems[0], today)?.status).toBe('done');
    expect(result.profile.dailyChecklistItems[0].completionHistory).toHaveLength(1);
  });

  it('excludes partial, historical, future, skipped, inactive, and not-due sessions or Routines', () => {
    const initial = profile([
      routine('skipped', { mode: 'workout-completed', scope: 'any' }, {
        completionHistory: [{ date: today.toISOString().slice(0, 10), status: 'skipped' }],
      }),
      routine('inactive', { mode: 'workout-completed', scope: 'any' }, { active: false }),
      routine('not-due', { mode: 'workout-completed', scope: 'any' }, { frequency: 'specific_weekday', weekday: 'monday' }),
    ]);

    for (const candidate of [
      session({ status: 'partial' }),
      session({ completedAt: yesterday }),
      session({ completedAt: tomorrow }),
    ]) {
      expect(applyHealthEvidenceToProfile(initial, { kind: 'workout-session', session: candidate }, today).completedRoutineIds).toEqual([]);
    }
  });

  it('requires an exact linked custom WorkoutRoutine and never broadens invalid links to any', () => {
    const initial = profile([
      routine('matching', { mode: 'workout-completed', scope: 'linked-workout-routine' }, {
        linkedContext: { section: 'health', type: 'workout-routine', entityId: 'routine-a' },
      }),
      routine('wrong-target', { mode: 'workout-completed', scope: 'linked-workout-routine' }, {
        linkedContext: { section: 'health', type: 'workout-routine', entityId: 'routine-b' },
      }),
      routine('missing-link', { mode: 'workout-completed', scope: 'linked-workout-routine' }),
      routine('plan-link', { mode: 'workout-completed', scope: 'linked-workout-routine' }, {
        linkedContext: { section: 'health', type: 'workout-plan', entityId: 'plan-a' },
      }),
    ], [customRoutine('routine-a'), customRoutine('routine-b')]);

    expect(applyHealthEvidenceToProfile(initial, {
      kind: 'workout-session',
      session: session({ routineId: 'routine-a', sourceRoutineId: 'routine-a' }),
    }, today).completedRoutineIds).toEqual(['matching']);
  });

  it('supports stretch any and linked scopes independently, including mixed sessions', () => {
    const initial = profile([
      routine('workout', { mode: 'workout-completed', scope: 'any' }),
      routine('stretch-any', { mode: 'stretch-completed', scope: 'any' }),
      routine('stretch-linked', { mode: 'stretch-completed', scope: 'linked-workout-routine' }, {
        linkedContext: { section: 'health', type: 'workout-routine', entityId: 'routine-a' },
      }),
      routine('wrong-stretch-link', { mode: 'stretch-completed', scope: 'linked-workout-routine' }, {
        linkedContext: { section: 'health', type: 'workout-routine', entityId: 'routine-b' },
      }),
    ], [customRoutine('routine-a'), customRoutine('routine-b')]);
    const mixed = applyHealthEvidenceToProfile(initial, {
      kind: 'workout-session',
      session: session({ exercises: [snapshot('exercise'), snapshot('stretch')] }),
    }, today);

    expect(mixed.completedRoutineIds).toEqual(['workout', 'stretch-any', 'stretch-linked']);

    const noStretch = applyHealthEvidenceToProfile(initial, {
      kind: 'workout-session',
      session: session({ exercises: [snapshot('exercise')] }),
    }, today);
    expect(noStretch.completedRoutineIds).toEqual(['workout']);
  });

  it('is idempotent and does not reverse completion after later session changes', () => {
    const initial = profile([routine('workout', { mode: 'workout-completed', scope: 'any' })]);
    const first = applyHealthEvidenceToProfile(initial, { kind: 'workout-session', session: session() }, today);
    const repeated = applyHealthEvidenceToProfile(first.profile, { kind: 'workout-session', session: session({ id: 'another' }) }, today);

    expect(first.completedRoutineIds).toEqual(['workout']);
    expect(repeated.completedRoutineIds).toEqual([]);
    expect(repeated.profile.dailyChecklistItems[0].completionHistory).toHaveLength(1);
    expect(repeated.profile.health?.workoutSessions).toEqual([]);
  });
});
