import { describe, expect, it } from 'vitest';
import { normalizeHealthRoutineEvidence } from '@/lib/health/normalization';
import { normalizeRoutineItem } from '@/lib/lifehub/normalization';

describe('Health Routine evidence foundation', () => {
  it('normalizes only the approved structural evidence shapes', () => {
    expect(normalizeHealthRoutineEvidence({ mode: 'sleep-tracked' })).toEqual({ mode: 'sleep-tracked' });
    expect(normalizeHealthRoutineEvidence({ mode: 'meal-tracked', meal: 'dinner' })).toEqual({ mode: 'meal-tracked', meal: 'dinner' });
    expect(normalizeHealthRoutineEvidence({ mode: 'meals-complete' })).toEqual({ mode: 'meals-complete' });
    expect(normalizeHealthRoutineEvidence({ mode: 'workout-completed', scope: 'linked-workout-routine' })).toEqual({ mode: 'workout-completed', scope: 'linked-workout-routine' });
    expect(normalizeHealthRoutineEvidence({ mode: 'stretch-completed', scope: 'any' })).toEqual({ mode: 'stretch-completed', scope: 'any' });
    expect(normalizeHealthRoutineEvidence({ mode: 'meal-tracked', meal: 'snack' })).toBeUndefined();
    expect(normalizeHealthRoutineEvidence({ mode: 'workout-completed', scope: 'missing' })).toBeUndefined();
    expect(normalizeHealthRoutineEvidence({ mode: 'sleep-tracked', entityId: 'health-1' })).toEqual({ mode: 'sleep-tracked' });
  });

  it('persists normalized evidence on routines only', () => {
    const normalized = normalizeRoutineItem({
      id: 'routine-1',
      title: 'Dinner log',
      frequency: 'daily',
      createdAt: new Date('2026-08-27T08:00:00'),
      healthRoutineEvidence: { mode: 'meal-tracked', meal: 'lunch' },
    });
    expect(normalized.healthRoutineEvidence).toEqual({ mode: 'meal-tracked', meal: 'lunch' });
  });

  it('retains weight, fasting, and water-target evidence through routine normalization', () => {
    for (const mode of ['weight-logged', 'fast-completed', 'water-target-reached'] as const) {
      const evidence = normalizeHealthRoutineEvidence({ mode });
      expect(evidence).toEqual({ mode });
      expect(normalizeRoutineItem({
        id: `routine-${mode}`,
        title: 'Health evidence',
        frequency: 'daily',
        createdAt: new Date('2026-08-27T08:00:00'),
        healthRoutineEvidence: evidence,
      }).healthRoutineEvidence).toEqual({ mode });
    }
  });
});
