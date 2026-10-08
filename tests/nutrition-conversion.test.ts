import { describe, expect, it } from 'vitest';
import { calculateFoodTemplateNutrition, calculateMealRowNutrition, getMeasurementGrams, normalizeNutrition } from '@/lib/health/nutrition';

describe('Health nutrition conversion boundary', () => {
  const food = {
    id: 'food-1',
    name: 'Oats',
    referenceWeightGrams: 100,
    caloriesPerGram: 3.5,
    proteinPerGram: 0.13,
    carbsPerGram: 0.6,
    fatPerGram: 0.07,
    sodiumPerGram: 0.001,
    fiberPerGram: 0.1,
    sugarPerGram: 0.02,
    measurementOptions: [{ unit: 'tablespoon' as const, label: 'tablespoon', grams: 8 }],
    createdAt: new Date(),
  };

  it('uses grams for canonical Saved Food calculations', () => {
    expect(calculateFoodTemplateNutrition(food, 50)).toMatchObject({ calories: 175, protein: 6.5, sugar: 1 });
  });

  it('requires an explicit food-specific conversion for non-gram units', () => {
    expect(getMeasurementGrams('tablespoon', food.measurementOptions)).toBe(8);
    expect(getMeasurementGrams('serving', food.measurementOptions)).toBeNull();
    expect(calculateMealRowNutrition({ amount: 1, unit: 'serving', food: {
      name: food.name,
      baseWeightGrams: 100,
      nutrientsPerBaseWeight: { calories: 350, protein: 13, carbs: 60, fat: 7, sodium: 0.1, fiber: 10 },
      measurementOptions: [],
    } })).toMatchObject({ calories: 0, protein: 0 });
  });

  it('preserves missing Sugar instead of inventing zero data', () => {
    expect(normalizeNutrition({ calories: 10 }).sugar).toBeUndefined();
    expect(normalizeNutrition({ calories: 10, sugar: 2 }).sugar).toBe(2);
  });
});
