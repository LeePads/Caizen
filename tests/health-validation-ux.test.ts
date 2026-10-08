import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { guardHealthNumberChange, guardHealthTextChange } from '@/lib/health/validation';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('Health validation UX contracts', () => {
  it('preserves accepted drafts when an oversized or emoji paste is rejected', () => {
    expect(guardHealthNumberChange('125', '125000', { label: 'Calories', min: 0, max: 20000, allowBlank: true })).toMatchObject({
      value: '125',
      accepted: false,
    });
    expect(guardHealthTextChange('Rice', 'Rice 🍚', { label: 'Food name', maxLength: 100 })).toMatchObject({
      value: 'Rice',
      accepted: false,
    });
  });

  it('keeps target fields blank by default and disables browser submit validation', () => {
    const targets = read('components/modals/EditHealthTargetsModal.tsx');
    expect(targets).toContain('noValidate');
    for (const example of ['170', '65', '2100', '2300', '120', '3000', '150']) {
      expect(targets).not.toContain(`placeholder="${example}"`);
    }
    expect(targets).toContain('guardHealthNumberChange');
    expect(targets).toContain('<FormField asGroup label="Height" error={errors.heightCm || errors.heightFeet || errors.heightInches}>');
  });

  it('uses semantic Health numeric placeholders without changing draft semantics', () => {
    const targets = read('components/modals/EditHealthTargetsModal.tsx');
    const weight = read('components/modals/WeightModal.tsx');
    const food = read('components/modals/FoodModal.tsx');
    const workout = read('components/modals/WorkoutModal.tsx');
    const workoutPlan = read('components/modals/WorkoutPlanModal.tsx');

    expect(targets).toContain('placeholder="Not set"');
    expect(targets).toContain('placeholder="Hours"');
    expect(targets).toContain('placeholder="Minutes"');
    expect(targets).not.toContain('placeholder=""');
    expect(weight).toContain('placeholder="Enter weight"');
    expect(food).toContain('placeholder="Enter amount"');
    expect(food).toContain('placeholder="Optional"');
    expect(workout).toContain('placeholder="Enter minutes"');
    expect(workoutPlan).toContain('placeholder="Enter sets"');
    expect(workoutPlan).toContain('placeholder="Enter reps"');
    expect(workoutPlan).toContain('placeholder="Enter seconds"');
    expect(workoutPlan).not.toMatch(/placeholder="(?:0|\d+(?:\.\d+)?)"/u);
  });

  it('uses shared error slots and avoids native validation patterns in Health editors', () => {
    expect(read('components/common/FormPatterns.tsx')).toContain('id={errorId} role="alert"');
    expect(read('components/modals/FoodModal.tsx')).toContain('noValidate');
    expect(read('components/modals/MealTemplateModal.tsx')).toContain('noValidate');
    expect(read('components/modals/WeightModal.tsx')).toContain('noValidate');
    expect(read('components/modals/SupplementModal.tsx')).toContain('noValidate');
    const sleep = read('components/modals/SleepModal.tsx');
    expect(sleep).not.toContain('pattern=');
    expect(sleep).toContain('guardHealthNumberChange');
    expect(sleep).toContain('min-h-[20px]');
  });

  it('aggregates submit errors instead of stopping at the first invalid field', () => {
    expect(read('components/modals/WorkoutModal.tsx')).toContain(".filter((message): message is string => Boolean(message)).join(' ')");
    expect(read('components/modals/SupplementModal.tsx')).toContain(".filter((message): message is string => Boolean(message))");
    expect(read('components/modals/MealTemplateModal.tsx')).toContain('const submitErrors: string[] = []');
  });
});
