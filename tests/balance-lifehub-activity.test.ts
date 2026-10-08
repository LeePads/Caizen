import { describe, expect, it } from 'vitest';
import type { DailyChecklistItem, ProductivityItem } from '@/lib/types';
import { deriveBalanceLifeHubActivity } from '@/lib/balance/lifehub-activity';

const now = new Date('2026-08-27T15:00:00');
const balanceLink = {
  section: 'balance' as const,
  type: 'upcoming-money' as const,
  entityId: 'money-a',
};

function routine(id: string, overrides: Partial<DailyChecklistItem> = {}): DailyChecklistItem {
  return {
    id,
    title: id,
    frequency: 'daily',
    active: true,
    createdAt: new Date('2026-08-01T08:00:00'),
    linkedContext: balanceLink,
    ...overrides,
  };
}

function task(id: string, overrides: Partial<ProductivityItem> = {}): ProductivityItem {
  return {
    id,
    title: id,
    type: 'task',
    priority: 'normal',
    status: 'pending',
    createdAt: new Date('2026-08-01T08:00:00'),
    linkedContext: balanceLink,
    ...overrides,
  };
}

describe('Balance Life Hub activity projection', () => {
  it('derives today counts, current state, next due, last activity, and capped task summaries without mutation', () => {
    const completed = routine('completed', {
      completionHistory: [{
        date: '2026-08-27',
        status: 'done',
        completedAt: new Date('2026-08-27T08:00:00'),
        linkedContext: balanceLink,
      }],
    });
    const skipped = routine('skipped', {
      completionHistory: [{ date: '2026-08-27', status: 'skipped', linkedContext: balanceLink }],
    });
    const legacy = routine('legacy', {
      completionHistory: [{ date: '2026-08-27', status: 'done', completedAt: new Date('2026-08-27T07:00:00') }],
    });
    const pending = routine('pending');
    const tasks = Array.from({ length: 4 }, (_, index) => task(`task-${index}`));
    const completedTask = task('completed-task', {
      status: 'completed',
      completedAt: new Date('2026-08-26T10:00:00'),
    });
    const snapshot = structuredClone({ completed, skipped, legacy, pending, tasks, completedTask });

    const activity = deriveBalanceLifeHubActivity(
      'money-a',
      [completed, skipped, legacy, pending],
      [...tasks, completedTask],
      now,
    );

    expect(activity).toMatchObject({
      linkedRoutineCount: 4,
      linkedTaskCount: 5,
      completedToday: 1,
      pendingToday: 2,
      skippedToday: 1,
      currentState: 'due',
    });
    expect(activity.nextDueDate).toEqual(new Date('2026-08-27T00:00:00'));
    expect(activity.lastExplicitRoutineActivityAt).toEqual(new Date('2026-08-27T12:00:00'));
    expect(activity.routines).toHaveLength(3);
    expect(activity.tasks).toHaveLength(3);
    expect(activity.tasks.every(item => item.state === 'pending')).toBe(true);
    expect({ completed, skipped, legacy, pending, tasks, completedTask }).toEqual(snapshot);
  });

  it('ignores non-task records and keeps completed tasks available after active tasks', () => {
    const completed = task('completed', { status: 'completed' });
    const idea = task('idea', { type: 'idea' });
    const activity = deriveBalanceLifeHubActivity('money-a', [], [completed, idea], now);

    expect(activity.linkedTaskCount).toBe(1);
    expect(activity.tasks).toMatchObject([{ taskId: 'completed', state: 'completed' }]);
  });
});
