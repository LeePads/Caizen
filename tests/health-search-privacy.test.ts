import { describe, expect, it } from 'vitest';

import {
  isGlobalSearchResultAvailable,
  searchProfileRecords,
} from '@/lib/global-search';
import type { Profile } from '@/lib/types';

const makeHealthProfile = (suffix = 'a') => ({
  health: {
    weightEntries: [{
      id: `weight-${suffix}`,
      weightKg: 72.5,
      date: new Date('2026-02-03'),
      notes: `private weight note ${suffix}`,
    }],
    nutritionEntries: [{
      id: `nutrition-${suffix}`,
      date: new Date('2026-02-03'),
      calories: 999,
      protein: 88,
      foodName: `private nutrition ${suffix}`,
    }],
    foodEntries: [{
      id: `food-${suffix}`,
      name: `Oatmeal ${suffix}`,
      mealType: 'breakfast',
      amount: 125.5,
      date: new Date('2026-02-03'),
      notes: `private food note ${suffix}`,
    }],
    activityEntries: [{
      id: `activity-${suffix}`,
      activity: `Morning mobility ${suffix}`,
      durationMinutes: 47,
      intensity: 'vigorous',
      date: new Date('2026-02-03'),
      notes: `private activity note ${suffix}`,
    }],
    workoutPlans: [{
      id: `plan-${suffix}`,
      name: `Strength plan ${suffix}`,
      description: `private rehab description ${suffix}`,
    }],
    sleepEntries: [{
      id: `sleep-${suffix}`,
      hours: 7.25,
      quality: 'good',
      date: new Date('2026-02-03'),
      notes: `private sleep note ${suffix}`,
    }],
    foodTemplates: [{
      id: `food-template-${suffix}`,
      name: `Oats template ${suffix}`,
      referenceWeightGrams: 88,
    }],
    mealTemplates: [{
      id: `meal-template-${suffix}`,
      name: `Quick breakfast ${suffix}`,
      mealType: 'breakfast',
      rows: [{ amount: 400, unit: 'grams' }],
    }],
  },
  supplements: [{
    id: `supplement-${suffix}`,
    name: `Vitamin D ${suffix}`,
    type: 'vitamin',
    dosage: '400mg',
    schedule: 'bedtime',
  }],
} as unknown as Profile);

describe('Health global Search privacy contract', () => {
  it('keeps low-sensitivity Health metadata discoverable and strips sensitive fields', () => {
    const profile = makeHealthProfile();

    expect(searchProfileRecords(profile, 'Oatmeal a')[0]).toMatchObject({
      recordId: 'food-a',
      recordType: 'food-entry',
      section: 'health',
    });
    expect(searchProfileRecords(profile, 'breakfast').map(result => result.recordId)).toContain('food-a');
    expect(searchProfileRecords(profile, 'Morning mobility a')[0]).toMatchObject({
      recordId: 'activity-a',
      recordType: 'activity-entry',
    });
    expect(searchProfileRecords(profile, 'Strength plan a')[0]).toMatchObject({
      recordId: 'plan-a',
      recordType: 'workout-plan',
    });
    expect(searchProfileRecords(profile, 'Weight')[0]).toMatchObject({
      recordId: 'weight-a',
      title: 'Weight entry',
    });
    expect(searchProfileRecords(profile, 'Sleep')[0]).toMatchObject({
      recordId: 'sleep-a',
      title: 'Sleep entry',
    });
    expect(searchProfileRecords(profile, 'Vitamin D a')[0]).toMatchObject({
      recordId: 'supplement-a',
      recordType: 'supplement',
    });

    for (const sensitiveQuery of [
      '72.5',
      'private weight note a',
      '125.5',
      'private food note a',
      '47',
      'private activity note a',
      'private rehab description a',
      '7.25',
      'private sleep note a',
      '88',
      '400mg',
      'bedtime',
    ]) {
      expect(searchProfileRecords(profile, sensitiveQuery), sensitiveQuery).toEqual([]);
    }
  });

  it('preserves exact record availability and active-profile isolation', () => {
    const profileA = makeHealthProfile('alpha');
    const profileB = makeHealthProfile('beta');
    const result = searchProfileRecords(profileA, 'Morning mobility alpha')[0];

    expect(isGlobalSearchResultAvailable(profileA, result)).toBe(true);
    expect(isGlobalSearchResultAvailable(profileB, result)).toBe(false);
    expect(searchProfileRecords(profileB, 'Morning mobility alpha')).toEqual([]);
    expect(searchProfileRecords(profileA, 'Morning mobility beta')).toEqual([]);
  });
});
