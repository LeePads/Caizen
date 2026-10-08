import { describe, expect, it } from 'vitest';

import {
  aggregateNutrition,
  isNutritionFieldKnown,
  sumNutrition,
} from '@/lib/health/nutrition';
import type { FoodNutritionSnapshot, NutritionField } from '@/lib/types';

const snapshot = (
  overrides: Partial<FoodNutritionSnapshot> = {},
  missing: NutritionField[] = [],
): FoodNutritionSnapshot => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  sodium: 0,
  fiber: 0,
  ...(missing.length ? { nutritionMissing: missing } : {}),
  ...overrides,
});

describe('Food Log nutrition aggregation', () => {
  it('sums known protein while ignoring a missing entry', () => {
    const result = aggregateNutrition([
      snapshot({ protein: 1.6 }),
      snapshot({ protein: 3.7 }),
      snapshot({}, ['protein']),
    ]);

    expect(result.totals.protein).toBeCloseTo(5.3);
    expect(result.knownCounts.protein).toBe(2);
    expect(isNutritionFieldKnown(result.totals, 'protein')).toBe(true);
  });

  it('keeps an explicit zero known when another entry is missing', () => {
    const result = aggregateNutrition([
      snapshot({ fiber: 0 }),
      snapshot({}, ['fiber']),
    ]);

    expect(result.totals.fiber).toBe(0);
    expect(result.knownCounts.fiber).toBe(1);
    expect(isNutritionFieldKnown(result.totals, 'fiber')).toBe(true);
  });

  it('reports a nutrient as missing when every entry is missing it', () => {
    const result = aggregateNutrition([
      snapshot({}, ['fiber']),
      snapshot({}, ['fiber']),
    ]);

    expect(result.knownCounts.fiber).toBe(0);
    expect(result.totals.nutritionMissing).toContain('fiber');
    expect(isNutritionFieldKnown(result.totals, 'fiber')).toBe(false);
  });

  it('keeps multiple explicit zero values known', () => {
    const result = aggregateNutrition([
      snapshot({ sodium: 0 }),
      snapshot({ sodium: 0 }),
    ]);

    expect(result.totals.sodium).toBe(0);
    expect(result.knownCounts.sodium).toBe(2);
  });

  it('sums positive, zero, and missing values independently', () => {
    const result = aggregateNutrition([
      snapshot({ carbs: 20 }),
      snapshot({ carbs: 0 }),
      snapshot({}, ['carbs']),
    ]);

    expect(result.totals.carbs).toBe(20);
    expect(result.knownCounts.carbs).toBe(2);
  });

  it('rolls meal subtotals into a known day subtotal', () => {
    const breakfast = sumNutrition([
      snapshot({ protein: 1.6 }),
      snapshot({ protein: 3.7 }),
      snapshot({}, ['protein']),
    ]);
    const lunch = sumNutrition([snapshot({ protein: 41.89 })]);
    const dinner = sumNutrition([snapshot({}, ['protein'])]);

    const day = aggregateNutrition([breakfast, lunch, dinner]);

    expect(day.totals.protein).toBeCloseTo(47.19);
    expect(day.knownCounts.protein).toBe(2);
    expect(isNutritionFieldKnown(day.totals, 'protein')).toBe(true);
  });
});
