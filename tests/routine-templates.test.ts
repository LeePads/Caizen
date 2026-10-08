import { describe, expect, it } from 'vitest';
import { ROUTINE_TEMPLATES } from '@/lib/lifehub/routine-templates';

describe('Life Hub routine templates', () => {
  it('provides the approved creation-only catalog', () => {
    expect(ROUTINE_TEMPLATES.map(template => template.id)).toEqual([
      'custom', 'sleep', 'breakfast', 'lunch', 'dinner', 'daily-food-log',
      'workout', 'stretch', 'journal', 'skincare', 'supplements', 'budget-review',
    ]);
  });

  it('maps automated templates to trusted evidence and destinations', () => {
    const byId = new Map(ROUTINE_TEMPLATES.map(template => [template.id, template]));
    expect(byId.get('sleep')?.healthRoutineEvidence).toEqual({ mode: 'sleep-tracked' });
    expect(byId.get('lunch')?.healthRoutineEvidence).toEqual({ mode: 'meal-tracked', meal: 'lunch' });
    expect(byId.get('daily-food-log')?.healthRoutineEvidence).toEqual({ mode: 'meals-complete' });
    expect(byId.get('workout')?.healthRoutineEvidence).toEqual({ mode: 'workout-completed', scope: 'any' });
    expect(byId.get('stretch')?.healthRoutineEvidence).toEqual({ mode: 'stretch-completed', scope: 'any' });
    expect(byId.get('journal')?.linkedContext).toEqual({ section: 'journal', type: 'journal-entry' });
    expect(byId.get('skincare')?.automatic).toBe(false);
    expect(byId.get('budget-review')?.frequency).toBe('weekly');
  });
});
