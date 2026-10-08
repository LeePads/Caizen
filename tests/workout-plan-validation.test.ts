import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasWorkoutPlanValidationErrors, validateWorkoutPlanDraft } from '@/lib/health/workout-validation';

describe('Workout Plan validation', () => {
  const valid = {
    name: 'Upper body',
    description: '',
    estimatedDurationMinutes: '45',
    estimatedCalories: '300',
    exercises: [{ id: 'ex-1', name: 'Press', sets: 3, reps: '8-12', restSeconds: 60, durationMinutes: 10 }],
  };

  it('accepts bounded plans and rejects oversized or malformed values', () => {
    expect(hasWorkoutPlanValidationErrors(validateWorkoutPlanDraft(valid))).toBe(false);
    const errors = validateWorkoutPlanDraft({ ...valid, estimatedDurationMinutes: '1441', exercises: [{ ...valid.exercises[0], reps: '12-8' }] });
    expect(errors.estimatedDurationMinutes).toBeTruthy();
    expect(errors.exercise['ex-1.reps']).toBeTruthy();
  });

  it('protects required names and exercise limits', () => {
    const errors = validateWorkoutPlanDraft({ ...valid, name: '', exercises: [{ id: 'ex-1', name: 'Bench', sets: 101 }] });
    expect(errors.name).toBeTruthy();
    expect(errors.exercise['ex-1.sets']).toBeTruthy();
  });

  it('uses the shared Caizen time picker for scheduled workout reminders', () => {
    const source = readFileSync('components/modals/WorkoutPlanModal.tsx', 'utf8');
    expect(source).toContain('SleepTimePicker');
    expect(source).not.toContain('type="time"');
  });
});
