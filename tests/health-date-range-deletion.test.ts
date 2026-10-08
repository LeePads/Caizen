import { afterEach, describe, expect, it } from 'vitest';
import { loadAppState, saveAppState } from '@/lib/storage/app-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import {
  deleteHealthDataInDateRange,
  type HealthDateRange,
} from '@/lib/health/date-range-deletion';
import type { HealthProfile, Profile } from '@/lib/types';

const localDate = (value: string) => new Date(`${value}T12:00:00`);
const range = (start?: string, end?: string): HealthDateRange => ({
  start: start ? new Date(`${start}T00:00:00`) : undefined,
  end: end ? new Date(`${end}T23:59:59.999`) : undefined,
});

const health = (): HealthProfile => ({
  weightEntries: [
    { id: 'weight-in', date: localDate('2026-02-15'), weightKg: 70, createdAt: localDate('2026-02-15') },
    { id: 'weight-out', date: localDate('2026-03-01'), weightKg: 71, createdAt: localDate('2026-03-01') },
  ],
  nutritionEntries: [
    { id: 'nutrition-in', date: localDate('2026-02-15'), calories: 1, protein: 1, carbs: 1, fat: 1, sodium: 1, createdAt: localDate('2026-02-15') },
    { id: 'nutrition-out', date: localDate('2026-03-01'), calories: 1, protein: 1, carbs: 1, fat: 1, sodium: 1, createdAt: localDate('2026-03-01') },
  ],
  foodEntries: [
    { id: 'food-in', date: localDate('2026-02-15'), mealType: 'lunch', name: 'In range', calories: 1, protein: 1, carbs: 1, fat: 1, sodium: 1, createdAt: localDate('2026-02-15') },
    { id: 'food-out', date: localDate('2026-03-01'), mealType: 'lunch', name: 'Out of range', calories: 1, protein: 1, carbs: 1, fat: 1, sodium: 1, createdAt: localDate('2026-03-01') },
  ],
  foodLogCompletedDates: ['2026-02-15', '2026-03-01'],
  foodLogExcludedDates: ['2026-02-15', '2026-03-01'],
  foodTemplates: [{ id: 'template', name: 'Keep me', referenceWeightGrams: 1, caloriesPerGram: 1, proteinPerGram: 1, carbsPerGram: 1, fatPerGram: 1, sodiumPerGram: 1, createdAt: localDate('2026-02-15') }],
  mealTemplates: [{ id: 'meal-template', name: 'Keep this meal', mealType: 'lunch', rows: [], createdAt: localDate('2026-02-15') }],
  favoriteFoodTemplateIds: ['template'],
  favoriteMealTemplateIds: ['meal-template'],
  activityEntries: [
    { id: 'activity-in', date: localDate('2026-02-15'), activity: 'Walk', caloriesBurned: 1, createdAt: localDate('2026-02-15') },
    { id: 'activity-out', date: localDate('2026-03-01'), activity: 'Run', caloriesBurned: 1, createdAt: localDate('2026-03-01') },
  ],
  workoutPlans: [{ id: 'plan', name: 'Keep this plan', exercises: [], createdAt: localDate('2026-02-15'), updatedAt: localDate('2026-02-15') }],
  workoutSessions: [
    { id: 'session-in', routineName: 'Move', startedAt: localDate('2026-02-15'), status: 'completed', exercises: [], completedExerciseCount: 0, totalExerciseCount: 0, roundsCompleted: 0, createdAt: localDate('2026-02-15') },
    { id: 'session-out', routineName: 'Move', startedAt: localDate('2026-03-01'), status: 'completed', exercises: [], completedExerciseCount: 0, totalExerciseCount: 0, roundsCompleted: 0, createdAt: localDate('2026-03-01') },
  ],
  sleepEntries: [
    { id: 'sleep-in', date: localDate('2026-02-15'), hours: 8, createdAt: localDate('2026-02-15') },
    { id: 'sleep-out', date: localDate('2026-03-01'), hours: 7, createdAt: localDate('2026-03-01') },
  ],
  noXTrackers: [
    { id: 'tracker-in', name: 'In range', startDate: localDate('2026-02-15'), createdAt: localDate('2026-02-15') },
    { id: 'tracker-out', name: 'Out of range', startDate: localDate('2026-03-01'), createdAt: localDate('2026-03-01') },
  ],
});

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('Health date-range deletion', () => {
  it('deletes every dated Health collection at inclusive boundaries and keeps reusable definitions', () => {
    const result = deleteHealthDataInDateRange(health(), range('2026-02-15', '2026-02-15'));

    expect(result.deletedCount).toBe(9);
    expect(result.deletedByCollection).toEqual({
      weightEntries: 1,
      nutritionEntries: 1,
      foodEntries: 1,
      foodLogCompletedDates: 1,
      foodLogExcludedDates: 1,
      activityEntries: 1,
      workoutSessions: 1,
      sleepEntries: 1,
      noXTrackers: 1,
    });
    expect(result.health.weightEntries.map(entry => entry.id)).toEqual(['weight-out']);
    expect(result.health.sleepEntries?.map(entry => entry.id)).toEqual(['sleep-out']);
    expect(result.health.noXTrackers.map(entry => entry.id)).toEqual(['tracker-out']);
    expect(result.health.foodLogCompletedDates).toEqual(['2026-03-01']);
    expect(result.health.foodLogExcludedDates).toEqual(['2026-03-01']);
    expect(result.health.foodTemplates).toHaveLength(1);
    expect(result.health.mealTemplates).toHaveLength(1);
    expect(result.health.workoutPlans).toHaveLength(1);
    expect(result.health.workoutSessions).toHaveLength(1);
  });

  it('keeps data outside a one-sided or empty range and does not mutate the source profile', () => {
    const original = health();
    const result = deleteHealthDataInDateRange(original, range(undefined, '2026-02-14'));

    expect(result.deletedCount).toBe(0);
    expect(result.health).not.toBe(original);
    expect(original.foodEntries).toHaveLength(2);
    expect(result.health.foodEntries).toHaveLength(2);

    const empty = deleteHealthDataInDateRange(original, {});
    expect(empty.deletedCount).toBe(0);
    expect(empty.health.foodEntries).toHaveLength(2);
  });

  it('does not cross profile boundaries when the canonical operation is applied to one profile', () => {
    const first = health();
    const second = health();
    const result = deleteHealthDataInDateRange(first, range('2026-02-15', '2026-02-15'));

    expect(result.health.foodEntries).toHaveLength(1);
    expect(second.foodEntries).toHaveLength(2);
    expect(second.sleepEntries).toHaveLength(2);
  });

  it('persists the canonical result through the IndexedDB repository', async () => {
    const profile = {
      id: 'health-profile',
      name: 'Health profile',
      health: health(),
    } as unknown as Profile;
    await saveAppState({ profiles: [profile], currentProfileId: profile.id });

    const loaded = await loadAppState();
    expect(loaded).not.toBeNull();
    const current = loaded!.profiles[0];
    const deleted = deleteHealthDataInDateRange(current.health, range('2026-02-15', '2026-02-15'));
    await saveAppState({ profiles: [{ ...current, health: deleted.health }], currentProfileId: current.id });

    const persisted = await loadAppState();
    expect(persisted!.profiles[0].health.foodEntries).toHaveLength(1);
    expect(persisted!.profiles[0].health.sleepEntries).toHaveLength(1);
    expect(persisted!.profiles[0].health.noXTrackers).toHaveLength(1);
    expect(persisted!.profiles[0].health.foodTemplates).toHaveLength(1);
  });
});
