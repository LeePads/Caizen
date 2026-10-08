import { describe, expect, it } from 'vitest';
import type { DailyChecklistItem, ProductivityItem } from '@/lib/types';
import { deriveSkincareLifeHubActivity } from '@/lib/skincare/lifehub-activity';

const now = new Date('2026-08-27T15:00:00');

function routine(overrides: Partial<DailyChecklistItem> = {}): DailyChecklistItem {
  return {
    id: 'routine-a',
    title: 'Morning skincare',
    frequency: 'daily',
    active: true,
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  };
}

function task(overrides: Partial<ProductivityItem> = {}): ProductivityItem {
  return {
    id: 'task-a',
    title: 'Replace cleanser',
    type: 'task',
    priority: 'normal',
    status: 'pending',
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  };
}

const skincareLink = {
  section: 'skincare' as const,
  type: 'product' as const,
  entityId: 'product-a',
};

describe('Skincare Life Hub activity projection', () => {
  it('derives today state, next due, last explicit activity, and compact summaries without mutation', () => {
    const linkedRoutine = routine({
      linkedContext: skincareLink,
      completionHistory: [{
        date: '2026-08-26',
        status: 'done',
        completedAt: new Date('2026-08-26T09:00:00'),
        linkedContext: skincareLink,
      }],
    });
    const linkedTask = task({ linkedContext: skincareLink });
    const pendingRoutine = routine({
      id: 'routine-b',
      title: 'Evening skincare',
      linkedContext: skincareLink,
    });
    const snapshot = structuredClone({ linkedRoutine, linkedTask, pendingRoutine });

    const activity = deriveSkincareLifeHubActivity(
      'product-a',
      [linkedRoutine, pendingRoutine],
      [linkedTask],
      now,
    );

    expect(activity).toMatchObject({
      linkedRoutineCount: 2,
      linkedTaskCount: 1,
      completedToday: 0,
      pendingToday: 2,
      skippedToday: 0,
      currentState: 'due',
    });
    expect(activity.nextDueDate).toEqual(new Date('2026-08-27T00:00:00'));
    expect(activity.lastExplicitRoutineActivityAt).toEqual(new Date('2026-08-26T09:00:00'));
    expect(activity.routines).toHaveLength(2);
    expect(activity.tasks[0]).toMatchObject({ taskId: 'task-a', state: 'pending' });
    expect({ linkedRoutine, linkedTask, pendingRoutine }).toEqual(snapshot);
  });

  it('counts explicit completed and skipped occurrences for today and preserves current states', () => {
    const completed = routine({
      id: 'completed',
      linkedContext: skincareLink,
      completionHistory: [{ date: '2026-08-27', status: 'done', completedAt: new Date('2026-08-27T08:00:00'), linkedContext: skincareLink }],
    });
    const skipped = routine({
      id: 'skipped',
      linkedContext: skincareLink,
      completionHistory: [{ date: '2026-08-27', status: 'skipped', linkedContext: skincareLink }],
    });
    const paused = routine({ id: 'paused', active: false, linkedContext: skincareLink });

    const activity = deriveSkincareLifeHubActivity('product-a', [completed, skipped, paused], [], now);

    expect(activity.completedToday).toBe(1);
    expect(activity.pendingToday).toBe(0);
    expect(activity.skippedToday).toBe(1);
    expect(activity.routines.map(item => item.state)).toEqual(['completed', 'skipped', 'paused']);
  });

  it('does not infer a legacy completion for the current linked product', () => {
    const legacy = routine({
      id: 'legacy',
      linkedContext: skincareLink,
      completionHistory: [{ date: '2026-08-27', status: 'done' }],
    });
    const activity = deriveSkincareLifeHubActivity('product-a', [legacy], [], now);

    expect(activity.completedToday).toBe(0);
    expect(activity.pendingToday).toBe(1);
    expect(activity.lastExplicitRoutineActivityAt).toBeUndefined();
  });

  it('ignores non-task items and caps compact related tasks at three with active tasks first', () => {
    const tasks = [
      ...Array.from({ length: 4 }, (_, index) => task({
        id: `pending-${index}`,
        title: `Pending ${index}`,
        linkedContext: skincareLink,
      })),
      task({ id: 'completed', title: 'Completed', status: 'completed', linkedContext: skincareLink }),
      task({ id: 'idea', title: 'Idea', type: 'idea', linkedContext: skincareLink }),
    ];

    const activity = deriveSkincareLifeHubActivity('product-a', [], tasks, now);

    expect(activity.linkedTaskCount).toBe(5);
    expect(activity.tasks).toHaveLength(3);
    expect(activity.tasks.every(item => item.state === 'pending')).toBe(true);
  });
});
