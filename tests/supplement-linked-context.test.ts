import { describe, expect, it } from 'vitest';
import type { DailyChecklistItem, ProductivityItem } from '@/lib/types';
import {
  clearSupplementLinksFromRoutines,
  clearSupplementLinksFromTasks,
  getLifeHubLinkedContextNavigationDetail,
} from '@/lib/lifehub/linked-context';

function routine(id: string, linkedContext?: DailyChecklistItem['linkedContext']): DailyChecklistItem {
  return {
    id,
    title: id,
    frequency: 'daily',
    active: true,
    createdAt: new Date('2026-08-01T12:00:00'),
    linkedContext,
    completionHistory: [{ date: '2026-08-27', status: 'done' }],
  };
}

function task(id: string, linkedContext?: ProductivityItem['linkedContext']): ProductivityItem {
  return {
    id,
    title: id,
    type: 'task',
    priority: 'normal',
    status: 'pending',
    createdAt: new Date('2026-08-01T12:00:00'),
    linkedContext,
  };
}

describe('Supplement linked-context lifecycle', () => {
  it('clears only matching canonical links while preserving Life Hub records and history', () => {
    const routines = [
      routine('linked', { section: 'supplements', type: 'supplement', entityId: 'supplement-a' }),
      routine('kept', { section: 'supplements', type: 'supplement', entityId: 'supplement-b' }),
    ];
    const tasks = [task('task-linked', { section: 'supplements', type: 'supplement', entityId: 'supplement-a' })];

    const clearedRoutines = clearSupplementLinksFromRoutines(routines, 'supplement-a');
    const clearedTasks = clearSupplementLinksFromTasks(tasks, 'supplement-a');

    expect(clearedRoutines.map(item => item.id)).toEqual(['linked', 'kept']);
    expect(clearedRoutines[0].linkedContext).toBeUndefined();
    expect(clearedRoutines[0].completionHistory).toEqual(routines[0].completionHistory);
    expect(clearedRoutines[1].linkedContext).toEqual(routines[1].linkedContext);
    expect(clearedTasks[0].linkedContext).toBeUndefined();
  });

  it('uses the verified navigation contracts in both directions', () => {
    expect(getLifeHubLinkedContextNavigationDetail({ section: 'supplements', type: 'supplement', entityId: 'supplement-a' })).toEqual({
      section: 'health',
      feature: 'supplements',
      recordId: 'supplement-a',
    });
    expect(getLifeHubLinkedContextNavigationDetail({ section: 'games', type: 'game', entityId: 'game-a' })).toEqual({
      section: 'entertainment',
      feature: 'game',
      recordId: 'game-a',
    });
  });
});
