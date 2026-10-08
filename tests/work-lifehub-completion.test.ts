import { describe, expect, it } from 'vitest';
import type {
  DailyChecklistItem,
  Profile,
  ProductivityItem,
  WorkItem,
} from '@/lib/types';
import {
  completeProductivityItemInProfile,
  completeRoutineOccurrenceInProfile,
} from '@/lib/lifehub/completion';
import { completeLinkedLifeHubItemsForWorkTask } from '@/lib/work/lifehub-completion';

const completionAt = new Date('2026-08-27T09:30:00');
const workContext = {
  section: 'work' as const,
  type: 'work-item' as const,
  entityId: 'work-task-a',
};

function routine(
  id: string,
  overrides: Partial<DailyChecklistItem> = {},
): DailyChecklistItem {
  return {
    id,
    title: id,
    frequency: 'daily',
    active: true,
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  };
}

function task(
  id: string,
  overrides: Partial<ProductivityItem> = {},
): ProductivityItem {
  return {
    id,
    title: id,
    type: 'task',
    priority: 'normal',
    status: 'pending',
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  };
}

function workItem(
  id: string,
  type: WorkItem['type'],
  status: WorkItem['status'] = 'done',
): WorkItem {
  return {
    id,
    type,
    title: id,
    status,
    createdAt: new Date('2026-08-01T12:00:00'),
  };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-a',
    name: 'Test profile',
    wallets: [],
    transactions: [],
    inventoryItems: [],
    wishlistItems: [],
    upcomingMoneyItems: [],
    journalEntries: [],
    games: [],
    gameGuides: [],
    productivityItems: [],
    mediaItems: [],
    musicItems: [],
    workItems: [],
    personalVaultItems: [],
    trashItems: [],
    skincareProducts: [],
    dailyChecklistItems: [],
    importantDates: [],
    supplements: [],
    health: {} as Profile['health'],
    categoryXpEvents: [],
    masteryBondXpEvents: [],
    masteryBondClaims: [],
    pet: {
      name: 'Mochi',
      activePetId: 'mochi',
      ownedPetIds: ['mochi'],
      costume: 'default',
      ownedCostumes: [],
      purchasedShopItemIds: [],
      level: 1,
      xp: 0,
      gold: 0,
      createdAt: new Date('2026-08-01T12:00:00'),
      recentRewards: [],
      rewardedItemIds: [],
    },
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  };
}

describe('Work task to Life Hub completion', () => {
  it('completes each eligible linked Task and due Routine through canonical helpers', () => {
    const source = profile({
      workItems: [workItem('work-task-a', 'task')],
      productivityItems: [
        task('life-task-a', { linkedContext: workContext }),
        task('life-task-b', { linkedContext: workContext }),
      ],
      dailyChecklistItems: [
        routine('routine-a', { linkedContext: workContext, category: 'wellness' }),
      ],
    });

    const result = completeLinkedLifeHubItemsForWorkTask(
      source,
      'work-task-a',
      completionAt,
    );

    expect(result.completedTaskIds).toEqual(['life-task-a', 'life-task-b']);
    expect(result.completedRoutineIds).toEqual(['routine-a']);
    expect(result.profile.productivityItems.every(item => item.status === 'completed')).toBe(true);
    expect(result.profile.productivityItems[0].completedAt).toEqual(completionAt);
    expect(result.profile.dailyChecklistItems[0].completionHistory).toEqual([
      {
        date: '2026-08-27',
        periodKey: 'day:2026-08-27',
        status: 'done',
        completedAt: completionAt,
        linkedContext: workContext,
        linkedTitleSnapshot: 'work-task-a',
      },
    ]);
    expect(result.profile.workItems[0].status).toBe('done');
  });

  it('does not duplicate already-completed Life Hub records or rewards', () => {
    const source = profile({
      workItems: [workItem('work-task-a', 'task')],
      productivityItems: [
        task('life-task-a', {
          linkedContext: workContext,
          status: 'completed',
          completedAt: new Date('2026-08-26T09:00:00'),
        }),
      ],
      dailyChecklistItems: [
        routine('routine-a', {
          linkedContext: workContext,
          completionHistory: [{
            date: '2026-08-27',
            periodKey: 'day:2026-08-27',
            status: 'done',
            completedAt: new Date('2026-08-27T08:00:00'),
          }],
        }),
      ],
    });

    const result = completeLinkedLifeHubItemsForWorkTask(source, 'work-task-a', completionAt);

    expect(result.completedTaskIds).toEqual([]);
    expect(result.completedRoutineIds).toEqual([]);
    expect(result.profile).toEqual(source);
  });

  it('does not complete skipped, paused, or not-due Routine occurrences', () => {
    const source = profile({
      workItems: [workItem('work-task-a', 'task')],
      dailyChecklistItems: [
        routine('skipped', {
          linkedContext: workContext,
          completionHistory: [{ date: '2026-08-27', status: 'skipped' }],
        }),
        routine('paused', { linkedContext: workContext, active: false }),
        routine('not-due', {
          linkedContext: workContext,
          frequency: 'weekdays',
          weekdays: [1],
        }),
      ],
    });

    const result = completeLinkedLifeHubItemsForWorkTask(source, 'work-task-a', completionAt);

    expect(result.completedRoutineIds).toEqual([]);
    expect(result.profile.dailyChecklistItems).toEqual(source.dailyChecklistItems);
  });

  it('does not allow Projects or unrelated records to trigger completion', () => {
    const source = profile({
      workItems: [workItem('project-a', 'project')],
      productivityItems: [task('life-task-a', {
        linkedContext: { ...workContext, entityId: 'project-a' },
      })],
    });

    const result = completeLinkedLifeHubItemsForWorkTask(source, 'project-a', completionAt);

    expect(result.completedTaskIds).toEqual([]);
    expect(result.profile).toEqual(source);
  });

  it('keeps the generic profile-level helpers usable independently and idempotently', () => {
    const source = profile({
      productivityItems: [task('task-a', { status: 'deferred', deferredAt: completionAt })],
      dailyChecklistItems: [routine('routine-a', { linkedContext: workContext })],
    });

    const taskResult = completeProductivityItemInProfile(source, 'task-a', completionAt);
    expect(taskResult.status).toBe('applied');
    expect(taskResult.profile.productivityItems[0]).toMatchObject({
      status: 'completed',
      progress: 100,
      failedAt: null,
      deferredAt: null,
      completedAt: completionAt,
    });
    expect(completeProductivityItemInProfile(taskResult.profile, 'task-a', completionAt).status)
      .toBe('alreadyApplied');

    const routineResult = completeRoutineOccurrenceInProfile(
      taskResult.profile,
      'routine-a',
      new Date('2026-08-27T12:00:00'),
      completionAt,
      { requireDue: true },
    );
    expect(routineResult.status).toBe('applied');
    expect(completeRoutineOccurrenceInProfile(
      routineResult.profile,
      'routine-a',
      new Date('2026-08-27T12:00:00'),
      completionAt,
      { requireDue: true },
    ).status).toBe('alreadyApplied');
  });
});
