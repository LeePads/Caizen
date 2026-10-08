import { describe, expect, it } from 'vitest';
import type { DailyChecklistItem, ProductivityItem, WorkoutPlan, WorkoutRoutine } from '@/lib/types';
import {
  clearHealthLinksAndEvidenceFromRoutines,
  clearHealthLinksFromRoutines,
  clearHealthLinksFromTasks,
  getHealthTargetFromLifeHubRecord,
  normalizeLifeHubLinkedContext,
} from '@/lib/lifehub/linked-context';
import {
  healthTargetStateLabel,
  isHealthTargetEligibleForNewLink,
  resolveHealthTarget,
} from '@/lib/health/lifehub-activity';

const plan = (overrides: Partial<WorkoutPlan> = {}): WorkoutPlan => ({
  id: 'plan-1',
  name: 'Strength plan',
  exercises: [],
  createdAt: new Date('2026-08-27T08:00:00'),
  updatedAt: new Date('2026-08-27T08:00:00'),
  ...overrides,
});

const routine = (overrides: Partial<WorkoutRoutine> = {}): WorkoutRoutine => ({
  id: 'routine-1',
  name: 'Mobility routine',
  source: 'custom',
  items: [],
  ...overrides,
});

const lifeRoutine = (overrides: Partial<DailyChecklistItem> = {}): DailyChecklistItem => ({
  id: 'life-routine-1',
  title: 'Move today',
  frequency: 'daily',
  createdAt: new Date('2026-08-27T08:00:00'),
  ...overrides,
});

const lifeTask = (overrides: Partial<ProductivityItem> = {}): ProductivityItem => ({
  id: 'life-task-1',
  title: 'Book movement time',
  type: 'task',
  priority: 'normal',
  status: 'pending',
  createdAt: new Date('2026-08-27T08:00:00'),
  ...overrides,
});

describe('Health linked-context foundation', () => {
  it('accepts only canonical Health section/type pairs without checking target existence', () => {
    expect(normalizeLifeHubLinkedContext({ section: 'health', type: 'workout-plan', entityId: 'missing-plan' })).toEqual({
      section: 'health', type: 'workout-plan', entityId: 'missing-plan',
    });
    expect(normalizeLifeHubLinkedContext({ section: 'health', type: 'workout-routine', entityId: 'missing-routine' })).toEqual({
      section: 'health', type: 'workout-routine', entityId: 'missing-routine',
    });
    expect(normalizeLifeHubLinkedContext({ section: 'health', type: 'sleep-entry', entityId: 'sleep-1' })).toBeUndefined();
    expect(normalizeLifeHubLinkedContext({ section: 'health', type: 'workout-plan', entityId: '  ' })).toBeUndefined();
  });

  it('offers active profile-owned plans and custom routines, preserving archived resolution', () => {
    const activePlan = plan();
    const archivedPlan = plan({ id: 'plan-archived', archived: true });
    const activeRoutine = routine();
    const archivedRoutine = routine({ id: 'routine-archived', archived: true });
    const builtinRoutine = routine({ id: 'builtin', source: 'builtin' });

    expect(isHealthTargetEligibleForNewLink(activePlan)).toBe(true);
    expect(isHealthTargetEligibleForNewLink(archivedPlan)).toBe(false);
    expect(isHealthTargetEligibleForNewLink(activeRoutine)).toBe(true);
    expect(isHealthTargetEligibleForNewLink(archivedRoutine)).toBe(false);
    expect(isHealthTargetEligibleForNewLink(builtinRoutine)).toBe(false);
    expect(resolveHealthTarget('workout-plan', archivedPlan.id, [archivedPlan], [])).toMatchObject({ state: 'archived' });
    expect(resolveHealthTarget('workout-routine', archivedRoutine.id, [], [archivedRoutine])).toMatchObject({ state: 'archived' });
    expect(resolveHealthTarget('workout-routine', builtinRoutine.id, [], [builtinRoutine])).toBeUndefined();
    expect(healthTargetStateLabel('archived')).toBe('Archived');
  });

  it('clears matching canonical and legacy targets while preserving Life Hub records', () => {
    const linkedPlan = lifeRoutine({
      linkedContext: { section: 'health', type: 'workout-plan', entityId: 'plan-1' },
      completionHistory: [{ date: '2026-08-27', status: 'done' }],
    });
    const linkedLegacy = lifeRoutine({ id: 'legacy', linkedEntityType: 'workout-routine', linkedEntityId: 'routine-1' });
    const unrelated = lifeRoutine({ id: 'unrelated', linkedContext: { section: 'health', type: 'workout-plan', entityId: 'plan-2' } });
    const linkedTask = lifeTask({ linkedContext: { section: 'health', type: 'workout-routine', entityId: 'routine-1' } });

    const clearedRoutines = clearHealthLinksFromRoutines([linkedPlan, linkedLegacy, unrelated], new Set(['workout-plan:plan-1', 'workout-routine:routine-1']));
    const clearedTasks = clearHealthLinksFromTasks([linkedTask], new Set(['workout-plan:plan-1', 'workout-routine:routine-1']));

    expect(getHealthTargetFromLifeHubRecord(linkedPlan)).toMatchObject({ type: 'workout-plan', entityId: 'plan-1' });
    expect(clearedRoutines[0].linkedContext).toBeUndefined();
    expect(clearedRoutines[0].completionHistory).toEqual(linkedPlan.completionHistory);
    expect(clearedRoutines[1].linkedEntityType).toBeUndefined();
    expect(clearedRoutines[1].linkedEntityId).toBeUndefined();
    expect(clearedRoutines[2].linkedContext).toEqual(unrelated.linkedContext);
    expect(clearedTasks[0].linkedContext).toBeUndefined();
    expect(clearedTasks[0].title).toBe(linkedTask.title);
  });

  it('clears deleted linked-routine evidence without broadening any-scope evidence', () => {
    const linkedEvidence = lifeRoutine({
      linkedContext: { section: 'health', type: 'workout-routine', entityId: 'routine-1' },
      healthRoutineEvidence: { mode: 'workout-completed', scope: 'linked-workout-routine' },
      completionHistory: [{ date: '2026-08-27', status: 'done' }],
    });
    const anyEvidence = lifeRoutine({
      id: 'any-evidence',
      linkedContext: { section: 'health', type: 'workout-routine', entityId: 'routine-1' },
      healthRoutineEvidence: { mode: 'stretch-completed', scope: 'any' },
    });

    const cleared = clearHealthLinksAndEvidenceFromRoutines(
      [linkedEvidence, anyEvidence],
      new Set(['workout-routine:routine-1']),
    );

    expect(cleared[0].linkedContext).toBeUndefined();
    expect(cleared[0].healthRoutineEvidence).toBeUndefined();
    expect(cleared[0].completionHistory).toEqual(linkedEvidence.completionHistory);
    expect(cleared[1].linkedContext).toBeUndefined();
    expect(cleared[1].healthRoutineEvidence).toEqual({ mode: 'stretch-completed', scope: 'any' });
  });
});
