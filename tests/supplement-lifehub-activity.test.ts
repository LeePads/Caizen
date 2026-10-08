import { describe, expect, it } from 'vitest';
import type { DailyChecklistItem, ProductivityItem, Profile, Supplement } from '@/lib/types';
import { deriveSupplementLifeHubActivity, isSupplementExpired } from '@/lib/supplements/lifehub-activity';
import { completeSupplementRoutineOccurrenceInProfile } from '@/lib/supplements/lifehub-completion';

const now = new Date('2026-08-27T15:00:00');

function supplement(overrides: Partial<Supplement> = {}): Supplement {
  return {
    id: 'supplement-a',
    name: 'Magnesium',
    purchasePrice: 500,
    startDate: new Date('2026-08-01T12:00:00'),
    dosage: '1 capsule',
    quantityRemaining: 30,
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  };
}

function routine(overrides: Partial<DailyChecklistItem> = {}): DailyChecklistItem {
  return {
    id: 'routine-a',
    title: 'Take magnesium',
    frequency: 'daily',
    active: true,
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  };
}

function task(overrides: Partial<ProductivityItem> = {}): ProductivityItem {
  return {
    id: 'task-a',
    title: 'Buy magnesium',
    type: 'task',
    priority: 'normal',
    status: 'pending',
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
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

describe('Supplement Life Hub activity projection', () => {
  it('projects canonical routine and task links without changing domain records', () => {
    const linkedRoutine = routine({
      linkedContext: { section: 'supplements', type: 'supplement', entityId: 'supplement-a' },
      completionHistory: [{ date: '2026-08-27', status: 'done', completedAt: new Date('2026-08-27T09:00:00'), linkedContext: { section: 'supplements', type: 'supplement', entityId: 'supplement-a' } }],
    });
    const legacyRoutine = routine({
      id: 'routine-legacy',
      linkedContext: { section: 'supplements', type: 'supplement', entityId: 'supplement-a' },
      completionHistory: [{ date: '2026-08-27', status: 'done' }],
    });
    const linkedTask = task({
      linkedContext: { section: 'supplements', type: 'supplement', entityId: 'supplement-a' },
    });
    const unrelated = routine({
      id: 'game-routine',
      linkedContext: { section: 'games', type: 'game', entityId: 'game-a' },
    });
    const snapshot = structuredClone({ linkedRoutine, linkedTask });

    const activity = deriveSupplementLifeHubActivity('supplement-a', [linkedRoutine, legacyRoutine, unrelated], [linkedTask], now);

    expect(activity).toMatchObject({
      linkedRoutineCount: 2,
      linkedTaskCount: 1,
      completedToday: 1,
      pendingToday: 1,
    });
    expect(activity.routines.find(item => item.routineId === 'routine-a')).toMatchObject({ state: 'completed' });
    expect(activity.routines.find(item => item.routineId === 'routine-legacy')).toMatchObject({ state: 'due' });
    expect(activity.tasks[0]).toMatchObject({ taskId: 'task-a', state: 'pending' });
    expect({ linkedRoutine, linkedTask }).toEqual(snapshot);
  });

  it('keeps zero quantity selectable and excludes only expired supplements from new choices', () => {
    expect(isSupplementExpired(supplement({ quantityRemaining: 0 }), now)).toBe(false);
    expect(isSupplementExpired(supplement({ expiryDate: new Date('2026-08-26T23:59:00') }), now)).toBe(true);
    expect(isSupplementExpired(supplement({ expiryDate: new Date('2026-08-27T23:59:00') }), now)).toBe(false);
  });

  it('orders pending tasks before completed tasks and caps the compact projection', () => {
    const tasks = [
      ...Array.from({ length: 4 }, (_, index) => task({
        id: `pending-${index}`,
        title: `Pending ${index}`,
        linkedContext: { section: 'supplements', type: 'supplement', entityId: 'supplement-a' },
      })),
      task({
        id: 'completed',
        title: 'Completed',
        status: 'completed',
        linkedContext: { section: 'supplements', type: 'supplement', entityId: 'supplement-a' },
      }),
    ];

    const activity = deriveSupplementLifeHubActivity('supplement-a', [], tasks, now);
    expect(activity.linkedTaskCount).toBe(5);
    expect(activity.tasks).toHaveLength(3);
    expect(activity.tasks.every(item => item.state === 'pending')).toBe(true);
  });

  it('records selected linked supplements on the completed occurrence without changing the link', () => {
    const linkedContext = {
      section: 'supplements' as const,
      type: 'supplement' as const,
      entityId: 'supplement-a',
      entityIds: ['supplement-a', 'supplement-b'],
    };
    const source = profile({
      supplements: [
        supplement(),
        supplement({ id: 'supplement-b', name: 'Omega 3' }),
      ],
      dailyChecklistItems: [routine({ linkedContext })],
    });

    const result = completeSupplementRoutineOccurrenceInProfile(
      source,
      'routine-a',
      now,
      ['supplement-a', 'supplement-b'],
      now,
    );

    expect(result.status).toBe('applied');
    expect(result.profile.dailyChecklistItems[0].linkedContext).toEqual(linkedContext);
    expect(result.profile.dailyChecklistItems[0].completionHistory?.[0]).toMatchObject({
      status: 'done',
      note: 'Supplements taken: Magnesium, Omega 3',
    });
  });
});
