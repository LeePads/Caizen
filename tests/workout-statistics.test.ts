import { describe, expect, it } from 'vitest';
import type { ActivityEntry, WorkoutSession } from '@/lib/types';
import { deriveWorkoutStatistics } from '@/lib/health/workout-statistics';

const manual = (id: string, date: Date, durationMinutes?: number): ActivityEntry => ({
  id,
  date,
  activity: 'Quick Add movement',
  caloriesBurned: 0,
  durationMinutes,
  createdAt: date,
});

const guided = (id: string, completedAt: Date, durationMinutes: number): WorkoutSession => ({
  id,
  routineName: 'Guided routine',
  startedAt: new Date(completedAt.getTime() - durationMinutes * 60_000),
  completedAt,
  durationMinutes,
  status: 'completed',
  exercises: [],
  completedExerciseCount: 1,
  totalExerciseCount: 1,
  roundsCompleted: 1,
  createdAt: completedAt,
});

describe('workout statistics', () => {
  it('normalizes sessions to a seven-day rate using represented days, not named weeks', () => {
    const anchor = new Date(2026, 7, 30, 12);
    const stats = deriveWorkoutStatistics([
      manual('one', new Date(2026, 7, 24, 9)),
      manual('two', new Date(2026, 7, 30, 9)),
    ], [], [], '7d', anchor);

    expect(stats.sessions).toBe(2);
    expect(stats.averageSessionsPerWeek).toBe(2);
  });

  it('keeps calendar-day and workout-day averages separate and ignores durationless minutes', () => {
    const anchor = new Date(2026, 7, 30, 12);
    const stats = deriveWorkoutStatistics([
      manual('duration', new Date(2026, 7, 24, 9), 30),
      manual('quick', new Date(2026, 7, 26, 9)),
    ], [guided('guided', new Date(2026, 7, 30, 9), 20)], [], '7d', anchor);

    expect(stats.sessions).toBe(3);
    expect(stats.totalMinutes).toBe(50);
    expect(stats.averageSessionMinutes).toBe(25);
    expect(stats.averageWorkoutDayMinutes).toBe(25);
    expect(stats.averageDayMinutes).toBe(50 / 7);
    expect(stats.averageSessionsPerWeek).toBe(3);
  });

  it('uses the exact represented local day count for longer ranges', () => {
    const anchor = new Date(2026, 7, 30, 12);
    const stats = deriveWorkoutStatistics([
      manual('one', new Date(2026, 7, 1, 9)),
      manual('two', new Date(2026, 7, 30, 9)),
    ], [], [], '30d', anchor);

    expect(stats.averageSessionsPerWeek).toBeCloseTo(2 / (30 / 7));
    expect(stats.averageDayMinutes).toBe(0);
  });
});
