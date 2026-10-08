import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Health linked-context UI contracts', () => {
  it('extends the shared selector with stable Health targets and lifecycle labels', () => {
    const selector = read('components/common/LifeHubLinkedContextSelector.tsx');
    expect(selector).toContain("{ value: 'health', label: 'Health' }");
    expect(selector).toContain("value: 'workout-plan'");
    expect(selector).toContain("value: 'workout-routine'");
    expect(selector).toContain('isHealthTargetEligibleForNewLink');
    expect(selector).toContain('Archived');
    expect(selector).not.toContain('linkedHealthId');
  });

  it('keeps evidence configuration on Routines and out of Tasks', () => {
    const routineModal = read('components/modals/LifeHubRoutineModal.tsx');
    const taskModal = read('components/modals/LifeHubTaskModal.tsx');
    expect(routineModal).toContain('healthRoutineEvidence');
    expect(routineModal).toContain('Automatic completion');
    expect(routineModal).toContain('Health evidence');
    expect(routineModal).toContain('linked-workout-routine');
    expect(taskModal).not.toContain('healthRoutineEvidence');
  });

  it('keeps Health deletion relationship-only and projections compact', () => {
    const context = read('lib/context.tsx');
    const linkedContext = read('lib/lifehub/linked-context.ts');
    const activity = read('lib/health/lifehub-activity.ts');
    expect(context).toContain('clearHealthLinksAndEvidenceFromRoutines');
    expect(context).toContain('clearHealthLinksFromTasks');
    expect(linkedContext).toContain('healthRoutineEvidence: undefined');
    expect(activity).toContain('.slice(0, 3)');
    expect(activity).not.toContain('week');
    expect(activity).not.toContain('month');
  });
});
