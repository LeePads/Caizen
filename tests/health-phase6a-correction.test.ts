import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('Phase 6A correction contracts', () => {
  it('preserves unresolved linked-workout-routine evidence in the editor', () => {
    const modal = read('components/modals/LifeHubRoutineModal.tsx');

    expect(modal).toContain('const nextEvidence = item?.healthRoutineEvidence;');
    expect(modal).toContain('healthRoutineEvidence,');
    expect(modal).toContain('Linked custom routine scope is inactive.');
    expect(modal).not.toContain('rawEvidence');
    expect(modal).not.toContain('const normalizedEvidence');
    expect(modal).not.toContain("scope: 'any' as const");
  });

  it('cleans bulk Health deletion through the live Settings Hub', () => {
    const source = read('components/settings/SettingsHub.tsx');
    expect(source).toContain('clearHealthLinksAndEvidenceFromRoutines');
      expect(source).toContain('clearHealthLinksFromTasks');
      expect(source).toContain('healthLinkedTargetKey({ type: \'workout-plan\'');
      expect(source).toContain('type: \'workout-routine\'');
      expect(source).toContain("source === 'custom'");
  });

  it('keeps ActivityEntry saves Health-local', () => {
    const panel = read('components/health/WorkoutPlannerPanel.tsx');

    expect(panel).toContain('addActivityEntry({');
    expect(panel).not.toContain('toggleRoutineOccurrence');
  });
});
