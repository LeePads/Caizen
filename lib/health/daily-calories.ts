import { toLocalDateKey } from '../lifehub/date-utils';
import { isNutritionFieldKnown } from './nutrition';
import { normalizeHealthNonNegative } from './normalization';
import type { ActivityEntry, FoodEntry } from '../types';

export type DailyCalorieSummary = {
  caloriesEaten: number;
  exerciseBurned: number;
  netCalories: number;
  hasFoodEntries: boolean;
  hasKnownCalories: boolean;
};

/**
 * Derives the daily calorie view from explicit logged food and activity only.
 * Workout sessions and plan estimates intentionally do not participate here.
 */
export function deriveDailyCalorieSummary(
  foodEntries: readonly FoodEntry[],
  activityEntries: readonly ActivityEntry[],
  date: Date | string = new Date(),
): DailyCalorieSummary {
  const dateKey = toLocalDateKey(date);
  const foods = foodEntries.filter(entry => toLocalDateKey(entry.date) === dateKey);
  const activities = activityEntries.filter(entry => toLocalDateKey(entry.date) === dateKey);
  const caloriesEaten = foods.reduce(
    (sum, entry) => sum + (
      isNutritionFieldKnown(entry, 'calories')
        ? normalizeHealthNonNegative(entry.calories)
        : 0
    ),
    0,
  );
  const exerciseBurned = activities.reduce(
    (sum, entry) => sum + normalizeHealthNonNegative(entry.caloriesBurned),
    0,
  );

  return {
    caloriesEaten,
    exerciseBurned,
    netCalories: caloriesEaten - exerciseBurned,
    hasFoodEntries: foods.length > 0,
    hasKnownCalories: foods.length > 0 && foods.some(entry => isNutritionFieldKnown(entry, 'calories')),
  };
}
