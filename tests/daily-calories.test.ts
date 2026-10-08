import { describe, expect, it } from 'vitest';

import { deriveDailyCalorieSummary } from '@/lib/health/daily-calories';
import type { ActivityEntry, FoodEntry } from '@/lib/types';

const day = new Date('2026-09-01T12:00:00');

const food = (id: string, date: string, calories: number, nutritionMissing?: FoodEntry['nutritionMissing']) => ({
  id,
  date: new Date(date),
  name: id,
  calories,
  protein: 0,
  carbs: 0,
  fat: 0,
  sodium: 0,
  nutritionMissing,
  createdAt: new Date(date),
} as FoodEntry);

const activity = (id: string, date: string, caloriesBurned: number) => ({
  id,
  date: new Date(date),
  activity: id,
  caloriesBurned,
  createdAt: new Date(date),
} as ActivityEntry);

describe('daily calorie summary', () => {
  it('uses same-day food and explicit activity calories only', () => {
    expect(deriveDailyCalorieSummary(
      [food('food-today', '2026-09-01T08:00:00', 700), food('food-tomorrow', '2026-09-02T08:00:00', 900)],
      [activity('activity-today', '2026-09-01T18:00:00', 250), activity('activity-tomorrow', '2026-09-02T18:00:00', 500)],
      day,
    )).toMatchObject({
      caloriesEaten: 700,
      exerciseBurned: 250,
      netCalories: 450,
      hasFoodEntries: true,
      hasKnownCalories: true,
    });
  });

  it('normalizes negative burn values and reports unknown intake', () => {
    expect(deriveDailyCalorieSummary(
      [food('food', '2026-09-01T08:00:00', 0, ['calories'])],
      [activity('activity', '2026-09-01T18:00:00', -100)],
      day,
    )).toMatchObject({
      caloriesEaten: 0,
      exerciseBurned: 0,
      netCalories: 0,
      hasFoodEntries: true,
      hasKnownCalories: false,
    });
  });

  it('keeps known intake visible when another same-day food is missing calories', () => {
    expect(deriveDailyCalorieSummary(
      [food('known-food', '2026-09-01T08:00:00', 450), food('missing-food', '2026-09-01T12:00:00', 0, ['calories'])],
      [],
      day,
    )).toMatchObject({
      caloriesEaten: 450,
      netCalories: 450,
      hasFoodEntries: true,
      hasKnownCalories: true,
    });
  });

  it('does not invent calories for activity-only or workout-session-only days', () => {
    expect(deriveDailyCalorieSummary([], [activity('activity', '2026-09-01T18:00:00', 300)], day)).toMatchObject({
      caloriesEaten: 0,
      exerciseBurned: 300,
      netCalories: -300,
      hasFoodEntries: false,
      hasKnownCalories: false,
    });
  });
});
