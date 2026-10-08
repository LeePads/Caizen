import type { FoodEntry, MealType } from '../types';

const MEAL_TYPES = new Set<MealType>(['breakfast', 'lunch', 'dinner', 'snack']);

/** Reads canonical and case-variant legacy meal values without inventing one. */
export function readFoodEntryMealType(value: unknown): MealType | '' {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  return MEAL_TYPES.has(normalized as MealType) ? normalized as MealType : '';
}

/** Returns the existing recent-meal choices, newest first and deduplicated by name. */
export function getRecentFoodEntries(entries: readonly FoodEntry[], limit = 4): FoodEntry[] {
  const recentByName = new Map<string, FoodEntry>();
  entries
    .filter(entry => entry.name?.trim())
    .sort((left, right) => new Date(right.createdAt || right.date).getTime() - new Date(left.createdAt || left.date).getTime())
    .forEach(entry => {
      const key = entry.name.trim().toLowerCase();
      if (!recentByName.has(key)) recentByName.set(key, entry);
    });
  return Array.from(recentByName.values()).slice(0, limit);
}

/** Keeps the persisted meal classification when an edit does not change it. */
export function preserveFoodEntryMealType(
  entry: Pick<FoodEntry, 'mealType'>,
  updates: Partial<FoodEntry>,
): Partial<FoodEntry> {
  const next = { ...updates };
  const requested = Object.prototype.hasOwnProperty.call(updates, 'mealType')
    ? updates.mealType
    : entry.mealType;
  const mealType = readFoodEntryMealType(requested);
  if (mealType) next.mealType = mealType;
  else {
    const existingMealType = readFoodEntryMealType(entry.mealType);
    if (existingMealType) next.mealType = existingMealType;
    else delete next.mealType;
  }
  return next;
}
