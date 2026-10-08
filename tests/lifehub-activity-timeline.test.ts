import { describe, expect, it } from 'vitest';

import {
  deriveCalendarActivityTimeline,
  getRecentActivityRange,
} from '@/lib/lifehub/activity-timeline';
import { addLocalDays, toLocalDateKey } from '@/lib/lifehub/date-utils';

const date = (day: number, hour = 12) => new Date(2026, 7, day, hour, 0, 0, 0);

function sources(overrides: Record<string, unknown> = {}) {
  return {
    productivityItems: [],
    dailyChecklistItems: [],
    transactions: [],
    mediaItems: [],
    skincareProducts: [],
    skincareUsageEvents: [],
    health: {
      foodEntries: [],
      activityEntries: [],
      workoutSessions: [],
    },
    trashItems: [],
    ...overrides,
  } as any;
}

describe('Calendar Activity timeline derivation', () => {
  it('derives the MVP sources with stable ownership links and chronological ordering', () => {
    const now = date(20, 18);
    const range = getRecentActivityRange(now, 30);
    const result = deriveCalendarActivityTimeline(sources({
      productivityItems: [{
        id: 'task-1', title: 'Morning stretch', type: 'task', priority: 'normal', status: 'completed',
        completedAt: date(20, 9), createdAt: date(1),
      }],
      dailyChecklistItems: [{
        id: 'routine-1', title: 'Morning routine', frequency: 'daily', createdAt: date(1),
        completionHistory: [{
          date: '2026-08-20', periodKey: 'day:2026-08-20', status: 'done', completedAt: date(20, 8),
          note: 'Supplements taken: Vitamin D',
        }],
      }],
      transactions: [{
        id: 'transaction-1', type: 'expense', amount: 250, walletId: 'wallet-1', date: date(20, 16), createdAt: date(20, 16),
      }],
      mediaItems: [{
        id: 'movie-1', title: 'A film', type: 'movie', status: 'completed', completedAt: date(20, 17), createdAt: date(1),
      }],
      skincareProducts: [{ id: 'product-1', name: 'Cleanser' }],
      skincareUsageEvents: [{
        id: 'usage-1', productId: 'product-1', usedAt: date(20, 15), source: 'manual',
      }],
      health: {
        foodEntries: [{ id: 'food-1', name: 'Breakfast', mealType: 'breakfast', date: date(20), createdAt: date(20, 7) }],
        activityEntries: [{ id: 'exercise-1', activity: 'Walk', date: date(20), createdAt: date(20, 10), caloriesBurned: 0 }],
        workoutSessions: [{
          id: 'workout-1', routineName: 'Strength', status: 'completed', startedAt: date(20, 13), completedAt: date(20, 14),
          createdAt: date(20, 13), exercises: [], completedExerciseCount: 1, totalExerciseCount: 1, roundsCompleted: 1,
        }],
      },
    }), { ...range, now });

    expect(result.map(entry => entry.kind)).toEqual([
      'media-completed',
      'transaction-recorded',
      'skincare-used',
      'workout-completed',
      'exercise-logged',
      'task-completed',
      'routine-completed',
      'supplement-taken',
      'meal-logged',
    ]);
    expect(result.find(entry => entry.kind === 'task-completed')?.ownerLink).toEqual({
      section: 'lifehub', feature: 'tasks', recordId: 'task-1',
    });
    expect(result.find(entry => entry.kind === 'transaction-recorded')).toMatchObject({ amount: 250, section: 'balance' });
    expect(result.find(entry => entry.kind === 'media-completed')?.ownerLink).toEqual({
      section: 'entertainment', feature: 'media', recordId: 'movie-1',
    });

    const routineEntries = result.filter(entry => entry.groupKey === 'routine:routine-1:day:2026-08-20');
    expect(routineEntries.map(entry => entry.kind)).toEqual(['routine-completed', 'supplement-taken']);
    expect(routineEntries[1].detail).toBe('Vitamin D');
    expect(result.every(entry => entry.ownerState === 'live')).toBe(true);
  });

  it('keeps date-only history date-precise and excludes episode progress', () => {
    const now = date(20, 12);
    const range = getRecentActivityRange(now, 30);
    const result = deriveCalendarActivityTimeline(sources({
      dailyChecklistItems: [{
        id: 'routine-1', title: 'Legacy routine', frequency: 'daily', createdAt: date(1),
        completionHistory: [{ date: '2026-08-18', status: 'done' }],
      }],
      mediaItems: [{
        id: 'anime-1', title: 'Episode progress only', type: 'anime', status: 'watching',
        updatedAt: date(20, 11), createdAt: date(1),
      }],
      health: {
        foodEntries: [{ id: 'food-1', name: 'Backfilled meal', date: date(19), createdAt: new Date(Number.NaN) }],
        activityEntries: [],
        workoutSessions: [],
      },
    }), { ...range, now });

    const routine = result.find(entry => entry.kind === 'routine-completed');
    const meal = result.find(entry => entry.kind === 'meal-logged');
    expect(routine).toMatchObject({ dateKey: '2026-08-18', timePrecision: 'date-only' });
    expect(routine?.occurredAt).toBeUndefined();
    expect(meal).toMatchObject({ dateKey: '2026-08-19', timePrecision: 'date-only' });
    expect(meal?.occurredAt).toBeUndefined();
    expect(result.some(entry => entry.kind === 'media-completed')).toBe(false);
  });

  it('uses the local date of exact timestamps and supports section filters and loaded ranges', () => {
    const now = date(20, 12);
    const range = getRecentActivityRange(now, 30);
    const result = deriveCalendarActivityTimeline(sources({
      transactions: [{
        id: 'transaction-1', type: 'expense', amount: 10, walletId: 'wallet-1', date: date(19), createdAt: date(20, 0),
      }],
      skincareProducts: [{ id: 'product-1', name: 'Serum' }],
      skincareUsageEvents: [{ id: 'usage-1', productId: 'product-1', usedAt: date(18, 9), source: 'manual' }],
    }), { ...range, filter: 'balance', now });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ dateKey: '2026-08-20', effectiveDateKey: '2026-08-19' });

    const earlierRange = {
      rangeStart: addLocalDays(range.rangeStart, -30),
      rangeEnd: range.rangeEnd,
    };
    const personalCare = deriveCalendarActivityTimeline(sources({
      skincareProducts: [{ id: 'product-1', name: 'Serum' }],
      skincareUsageEvents: [{ id: 'usage-1', productId: 'product-1', usedAt: date(18, 9), source: 'manual' }],
    }), { ...earlierRange, filter: 'personal-care', now });
    expect(personalCare[0]).toMatchObject({ section: 'personal-care', dateKey: '2026-08-18' });
    expect(toLocalDateKey(personalCare[0].occurredAt)).toBe('2026-08-18');
  });

  it('uses unexpired Trash snapshots without duplicating live records', () => {
    const now = date(20, 12);
    const range = getRecentActivityRange(now, 30);
    const trashedTask = {
      id: 'task-trash', title: 'Deleted task', type: 'task', priority: 'normal', status: 'completed',
      completedAt: date(18, 9), createdAt: date(1),
    };
    const result = deriveCalendarActivityTimeline(sources({
      trashItems: [{
        id: 'trash-1', source: 'productivityItems', sourceLabel: 'Life Hub Task', itemId: 'task-trash',
        title: 'Deleted task', deletedAt: date(19), deleteAfter: addLocalDays(now, 10), data: trashedTask,
      }],
    }), { ...range, now });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ ownerState: 'in-trash', title: 'Completed Deleted task', ownerLink: undefined });

    const duplicate = deriveCalendarActivityTimeline(sources({
      productivityItems: [{ ...trashedTask }],
      trashItems: [{
        id: 'trash-1', source: 'productivityItems', sourceLabel: 'Life Hub Task', itemId: 'task-trash',
        title: 'Deleted task', deletedAt: date(19), deleteAfter: addLocalDays(now, 10), data: trashedTask,
      }],
    }), { ...range, now });
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0].ownerState).toBe('live');

    const expired = deriveCalendarActivityTimeline(sources({
      trashItems: [{
        id: 'trash-1', source: 'productivityItems', sourceLabel: 'Life Hub Task', itemId: 'task-trash',
        title: 'Deleted task', deletedAt: date(19), deleteAfter: date(20, 11), data: trashedTask,
      }],
    }), { ...range, now });
    expect(expired).toEqual([]);
  });
});
