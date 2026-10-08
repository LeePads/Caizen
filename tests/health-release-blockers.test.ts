import { describe, expect, it } from 'vitest';

import type { FoodEntry } from '@/lib/types';
import { normalizeHealth } from '@/lib/health/normalization';
import {
  hasCompleteNutrition,
  normalizeNutrition,
  scaleFoodEntryNutrition,
} from '@/lib/health/nutrition';
import { deriveNutritionTrend } from '@/lib/health/trends';
import {
  formatFoodServing,
  parseFoodEntryServing,
} from '@/lib/health/food-serving';
import {
  createProfilesForImport,
} from '@/lib/storage/import-integrity';
import type { StoredAppState } from '@/lib/storage/app-repository';

const foodEntry = (overrides: Partial<FoodEntry> = {}): FoodEntry => ({
  id: 'food-1',
  date: new Date('2026-08-20T12:00:00+08:00'),
  mealType: 'breakfast',
  name: 'Meal',
  amount: 1,
  unit: 'g',
  serving: '1g',
  calories: 500,
  protein: 30,
  carbs: 40,
  fat: 10,
  sodium: 100,
  fiber: 3,
  sugar: 4,
  createdAt: new Date('2026-08-20T12:00:00+08:00'),
  ...overrides,
});

const healthState = (health: Record<string, unknown>): StoredAppState => ({
  profiles: [{ id: 'p1', name: 'Profile', health }] as unknown as StoredAppState['profiles'],
  currentProfileId: 'p1',
});

describe('Health release blocker regressions', () => {
  it('distinguishes explicit numeric zero from omitted nutrition', () => {
    const actualZero = normalizeNutrition({ calories: 0 });
    const omitted = normalizeNutrition({ calories: 0, nutritionMissing: ['calories'] });

    expect(actualZero.calories).toBe(0);
    expect(actualZero.nutritionMissing).toBeUndefined();
    expect(omitted.calories).toBe(0);
    expect(omitted.nutritionMissing).toEqual(['calories']);
    expect(hasCompleteNutrition(actualZero)).toBe(true);
    expect(hasCompleteNutrition(omitted)).toBe(false);
  });

  it('keeps legacy nutrition records trusted while retaining new missing markers', () => {
    const normalized = normalizeHealth({
      foodEntries: [
        foodEntry({ id: 'legacy-zero', calories: 0, nutritionMissing: undefined }),
        foodEntry({ id: 'new-unknown', calories: 0, nutritionMissing: ['calories'] }),
      ],
    });

    expect(normalized.foodEntries[0].nutritionMissing).toBeUndefined();
    expect(normalized.foodEntries[0].calories).toBe(0);
    expect(normalized.foodEntries[1].nutritionMissing).toEqual(['calories']);
    expect(hasCompleteNutrition(normalized.foodEntries[0])).toBe(true);
    expect(hasCompleteNutrition(normalized.foodEntries[1])).toBe(false);
  });

  it('includes complete eligible days and excludes incomplete nutrition from trend totals', () => {
    const dates = [
      new Date('2026-08-19T00:00:00+08:00'),
      new Date('2026-08-20T00:00:00+08:00'),
    ];
    const trend = deriveNutritionTrend(
      [
        foodEntry({ id: 'complete', date: dates[0], calories: 400 }),
        foodEntry({ id: 'incomplete', date: dates[1], calories: 0, nutritionMissing: ['calories'] }),
      ],
      ['2026-08-19'],
      dates,
      ['2026-08-20'],
    );

    expect(trend[0]).toMatchObject({
      isComplete: true,
      hasCompleteData: true,
      calories: 400,
      includedDayCount: 1,
    });
    expect(trend[1]).toMatchObject({
      isComplete: false,
      hasCompleteData: false,
      calories: 0,
      entryCount: 1,
      incompleteDayCount: 1,
      excludedDayCount: 1,
    });
  });

  it('scales recognized recent meals without changing missing-field semantics', () => {
    const scaled = scaleFoodEntryNutrition(
      foodEntry({ nutritionMissing: ['sodium'] }),
      2,
      1,
    );

    expect(scaled).toMatchObject({ calories: 1000, protein: 60, sodium: 200 });
    expect(scaled?.nutritionMissing).toEqual(['sodium']);
  });

  it('preserves custom legacy serving labels instead of falling back to grams', () => {
    for (const label of ['bowl', 'bag', 'mug', 'pecan']) {
      const legacy = parseFoodEntryServing(foodEntry({
        amount: undefined,
        unit: undefined,
        serving: `1 ${label}`,
      }));

      expect(legacy).toMatchObject({ amount: 1, unit: 'legacy', legacyLabel: label });
      expect(formatFoodServing('1', legacy.unit, legacy.legacyLabel, legacy.originalServing)).toBe(`1 ${label}`);
      expect(formatFoodServing('2', legacy.unit, legacy.legacyLabel, legacy.originalServing)).toBe(`2 ${label}`);
    }

    const customWithAttachedWord = parseFoodEntryServing(foodEntry({
      amount: undefined,
      unit: undefined,
      serving: '1 bagful',
    }));
    expect(customWithAttachedWord.unit).toBe('legacy');

    const recognized = parseFoodEntryServing(foodEntry({ amount: undefined, unit: undefined, serving: '100g' }));
    expect(recognized.unit).toBe('g');

    for (const unit of ['quantity', 'tablespoon', 'teaspoon', 'ml', 'serving', 'can'] as const) {
      expect(parseFoodEntryServing(foodEntry({ amount: undefined, unit: undefined, serving: `1${unit}` })).unit).toBe(unit);
      expect(parseFoodEntryServing(foodEntry({ amount: undefined, unit: undefined, serving: `1 ${unit}` })).unit).toBe(unit);
    }
  });

  it('merges nested Health records by ID and preserves source and replace semantics', () => {
    const localHealth = {
      foodEntries: [
        { id: 'food-shared', calories: 500, updatedAt: '2026-08-20T00:00:00.000Z' },
        { id: 'food-local', calories: 300, updatedAt: '2026-08-20T00:00:00.000Z' },
      ],
      weightEntries: [
        { id: 'weight-shared', weightKg: 70, updatedAt: '2026-08-22T00:00:00.000Z' },
      ],
      sleepEntries: [{ id: 'sleep-local', minutes: 420 }],
      workoutRoutines: [{ id: 'routine-local', name: 'Local routine' }],
      foodLogCompletedDates: ['2026-08-18'],
      foodLogExcludedDates: ['2026-08-17'],
    };
    const importedHealth = {
      foodEntries: [
        { id: 'food-shared', calories: 600, updatedAt: '2026-08-21T00:00:00.000Z' },
        { id: 'food-imported', calories: 250, updatedAt: '2026-08-21T00:00:00.000Z' },
      ],
      weightEntries: [
        { id: 'weight-shared', weightKg: 69, updatedAt: '2026-08-21T00:00:00.000Z' },
      ],
      fastingSessions: [{ id: 'fast-imported', targetMinutes: 960 }],
      workoutExercises: [{ id: 'exercise-imported', name: 'Imported exercise' }],
      foodTemplates: [{ id: 'template-imported', name: 'Imported food' }],
      foodLogCompletedDates: ['2026-08-19'],
      foodLogExcludedDates: ['2026-08-16'],
    };
    const local = healthState(localHealth);
    const imported = healthState(importedHealth);
    const importedBefore = structuredClone(imported);

    const merged = createProfilesForImport(imported, local, 'merge');
    const mergedHealth = merged.profiles[0].health as unknown as Record<string, unknown>;

    expect(mergedHealth.foodEntries).toEqual([
      { id: 'food-shared', calories: 600, updatedAt: '2026-08-21T00:00:00.000Z' },
      { id: 'food-local', calories: 300, updatedAt: '2026-08-20T00:00:00.000Z' },
      { id: 'food-imported', calories: 250, updatedAt: '2026-08-21T00:00:00.000Z' },
    ]);
    expect(mergedHealth.weightEntries).toEqual([
      { id: 'weight-shared', weightKg: 70, updatedAt: '2026-08-22T00:00:00.000Z' },
    ]);
    expect(mergedHealth.sleepEntries).toEqual(localHealth.sleepEntries);
    expect(mergedHealth.workoutRoutines).toEqual(localHealth.workoutRoutines);
    expect(mergedHealth.fastingSessions).toEqual(importedHealth.fastingSessions);
    expect(mergedHealth.workoutExercises).toEqual(importedHealth.workoutExercises);
    expect(mergedHealth.foodTemplates).toEqual(importedHealth.foodTemplates);
    expect(mergedHealth.foodLogCompletedDates).toEqual(['2026-08-18', '2026-08-19']);
    expect(mergedHealth.foodLogExcludedDates).toEqual(['2026-08-17', '2026-08-16']);
    expect(imported).toEqual(importedBefore);

    const replaced = createProfilesForImport(imported, local, 'replace');
    expect(replaced.profiles[0].health).toEqual(importedHealth);
    expect(replaced.profiles[0].health).not.toEqual(mergedHealth);
  });
});
