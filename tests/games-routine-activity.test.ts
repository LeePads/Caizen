import { describe, expect, it } from 'vitest';
import type { DailyChecklistItem } from '@/lib/types';
import { normalizeRoutineItem } from '@/lib/lifehub/normalization';
import { clearGameRoutineLinks, deriveGameRoutineActivity } from '@/lib/games/routine-activity';

const now = new Date('2026-08-27T15:00:00');

function routine(overrides: Partial<DailyChecklistItem> = {}): DailyChecklistItem {
  return {
    id: 'routine-base',
    title: 'Play routine',
    frequency: 'daily',
    active: true,
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  };
}

describe('Game routine activity projection', () => {
  it('counts explicit local completion and skip history without inferring skips', () => {
    const activity = deriveGameRoutineActivity('game-a', [
      routine({
        id: 'routine-daily',
        linkedGameId: 'game-a',
        completionHistory: [
          { date: '2026-08-27', status: 'done', completedAt: new Date('2026-08-27T09:30:00'), linkedContext: { section: 'games', type: 'game', entityId: 'game-a' } },
          { date: '2026-08-26', status: 'skipped', linkedContext: { section: 'games', type: 'game', entityId: 'game-a' } },
          { date: '2026-08-24', status: 'done', linkedContext: { section: 'games', type: 'game', entityId: 'game-a' } },
        ],
      }),
      routine({
        id: 'routine-pending',
        title: 'Pending play routine',
        linkedGameId: 'game-a',
      }),
      routine({
        id: 'routine-skipped',
        title: 'Skipped play routine',
        linkedGameId: 'game-a',
        completionHistory: [{ date: '2026-08-27', status: 'skipped', linkedContext: { section: 'games', type: 'game', entityId: 'game-a' } }],
      }),
      routine({
        id: 'routine-legacy',
        title: 'Legacy play routine',
        linkedGameId: 'game-a',
        completionHistory: [{ date: '2026-08-27', status: 'done' }],
      }),
      routine({
        id: 'routine-unrelated',
        linkedGameId: 'game-b',
        completionHistory: [{ date: '2026-08-27', status: 'done' }],
      }),
    ], now);

    expect(activity.linkedRoutineCount).toBe(4);
    expect(activity.completedToday).toBe(1);
    expect(activity.completedThisWeek).toBe(2);
    expect(activity.completedThisMonth).toBe(2);
    expect(activity.skippedToday).toBe(1);
    expect(activity.skippedThisWeek).toBe(2);
    expect(activity.pendingToday).toBe(2);
    expect(activity.mostRecentActivityAt).toEqual(new Date('2026-08-27T12:00:00'));
    expect(activity.routines.find(item => item.routineId === 'routine-daily')?.state).toBe('completed');
    expect(activity.routines.find(item => item.routineId === 'routine-pending')?.state).toBe('due');
  });

  it('exposes paused and upcoming linked routines while retaining them in the count', () => {
    const activity = deriveGameRoutineActivity('game-a', [
      routine({ id: 'paused', title: 'Paused routine', linkedGameId: 'game-a', active: false }),
      routine({
        id: 'upcoming',
        title: 'Monday routine',
        linkedGameId: 'game-a',
        frequency: 'weekdays',
        weekdays: [1],
      }),
    ], now);

    expect(activity.linkedRoutineCount).toBe(2);
    expect(activity.pendingToday).toBe(0);
    expect(activity.routines.find(item => item.routineId === 'paused')?.state).toBe('paused');
    expect(activity.routines.find(item => item.routineId === 'upcoming')).toMatchObject({
      state: 'not-due',
      nextDueDate: new Date('2026-08-31T00:00:00'),
    });
  });
});

describe('Game routine link lifecycle', () => {
  it('normalizes invalid links and clears only the relationship', () => {
    expect(normalizeRoutineItem({ id: 'empty', title: 'Empty', frequency: 'daily', linkedGameId: '   ' }).linkedGameId).toBeUndefined();
    expect(normalizeRoutineItem({ id: 'valid', title: 'Valid', frequency: 'daily', linkedGameId: ' game-a ' }).linkedGameId).toBe('game-a');

    const original = routine({
      id: 'routine-a',
      linkedGameId: 'game-a',
      completionHistory: [{ date: '2026-08-27', status: 'done' }],
    });
    const cleared = clearGameRoutineLinks([original, routine({ id: 'routine-b', linkedGameId: 'game-b' })], 'game-a');

    expect(cleared[0]).toMatchObject({ id: 'routine-a', linkedGameId: undefined });
    expect(cleared[0].completionHistory).toEqual(original.completionHistory);
    expect(cleared[1].linkedGameId).toBe('game-b');
  });
});
