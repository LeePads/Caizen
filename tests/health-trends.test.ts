import { describe, expect, it } from 'vitest';
import { deriveNutritionTrend, deriveSleepTrend, deriveWeightTrend, deriveWorkoutTrend, getHealthTrendBuckets, getLocalTrendDates, sumExerciseMinutes } from '@/lib/health/trends';

describe('Health trend derivations', () => {
  it('uses local seven-day boundaries and included nutrition days', () => {
    const dates = getLocalTrendDates(7, new Date('2026-08-20T12:00:00+08:00'));
    const trend = deriveNutritionTrend([
      { id: 'food-1', date: new Date('2026-08-20T08:00:00+08:00'), mealType: 'breakfast', name: 'Meal', calories: 500, protein: 20, carbs: 40, fat: 10, sodium: 100, fiber: 3, sugar: 4, createdAt: new Date() },
    ], ['2026-08-20'], dates);
    expect(trend.at(-1)).toMatchObject({ isComplete: true, calories: 500, carbs: 40, fat: 10, sugar: 4 });
    expect(trend.slice(0, -1).every(point => point.calories === 0)).toBe(true);
  });

  it('excludes missing sleep metrics from averages and keeps exact minutes', () => {
    const dates = getLocalTrendDates(7, new Date('2026-08-20T12:00:00+08:00'));
    const summary = deriveSleepTrend([
      { id: 'sleep-1', date: new Date('2026-08-19T00:00:00+08:00'), hours: 7.5, sleepDurationMinutes: 450, quality: 'good', sleepScore: 80, timesAwakened: 2, createdAt: new Date() },
      { id: 'sleep-2', date: new Date('2026-08-20T00:00:00+08:00'), hours: 8, sleepDurationMinutes: 480, quality: 'great', createdAt: new Date() },
    ], dates);
    expect(summary.averageMinutes).toBe(465);
    expect(summary.scoreAverage).toBe(80);
    expect(summary.awakeningsAverage).toBe(2);
  });

  it('derives weight change and counts only activity duration minutes', () => {
    const dates = getLocalTrendDates(7, new Date('2026-08-20T12:00:00+08:00'));
    expect(deriveWeightTrend([
      { id: 'w1', date: new Date('2026-08-15T00:00:00+08:00'), weightKg: 70, createdAt: new Date() },
      { id: 'w2', date: new Date('2026-08-20T00:00:00+08:00'), weightKg: 69.5, createdAt: new Date() },
    ], dates)).toMatchObject({ latest: 69.5, change: -0.5, count: 2 });
    expect(sumExerciseMinutes([
      { id: 'a1', date: new Date('2026-08-20T00:00:00+08:00'), activity: 'Walk', caloriesBurned: 100, durationMinutes: 30, createdAt: new Date() },
      { id: 'a2', date: new Date('2026-08-20T00:00:00+08:00'), activity: 'Lift', caloriesBurned: 100, durationMinutes: undefined, createdAt: new Date() },
    ], dates)).toBe(30);
  });

  it('derives workout sessions, active minutes, average duration, and logged calories', () => {
    const dates = getLocalTrendDates(7, new Date('2026-08-20T12:00:00+08:00'));
    const summary = deriveWorkoutTrend([
      { id: 'a1', date: new Date('2026-08-19T00:00:00+08:00'), activity: 'Walk', caloriesBurned: 100, durationMinutes: 30, createdAt: new Date() },
      { id: 'a2', date: new Date('2026-08-20T00:00:00+08:00'), activity: 'Lift', caloriesBurned: 0, durationMinutes: 45, createdAt: new Date() },
      { id: 'a3', date: new Date('2026-08-20T00:00:00+08:00'), activity: 'Stretch', caloriesBurned: 0, durationMinutes: undefined, createdAt: new Date() },
    ], dates);
    expect(summary).toMatchObject({ sessions: 3, activeMinutes: 75, averageSessionMinutes: 37.5, caloriesBurned: 100 });
    expect(summary.points.at(-1)).toMatchObject({ sessions: 2, activeMinutes: 45 });
  });

  it('keeps an honest empty workout summary when no activities are in range', () => {
    const dates = getLocalTrendDates(7, new Date('2026-08-20T12:00:00+08:00'));
    expect(deriveWorkoutTrend([], dates)).toMatchObject({ sessions: 0, activeMinutes: 0, averageSessionMinutes: null, caloriesBurned: null });
  });

  it('creates bounded local buckets for all supported history ranges', () => {
    const anchor = new Date('2026-08-20T12:00:00+08:00');
    expect(getHealthTrendBuckets('7d', anchor)).toHaveLength(7);
    expect(getHealthTrendBuckets('30d', anchor)).toHaveLength(30);
    expect(getHealthTrendBuckets('3m', anchor)).toHaveLength(13);
    expect(getHealthTrendBuckets('1y', anchor)).toHaveLength(12);
    expect(getHealthTrendBuckets('7d', anchor).at(-1)?.key).toBe('2026-08-20');
    expect(getHealthTrendBuckets('1y', anchor).at(-1)?.key).toBe('2026-08');
  });
});
