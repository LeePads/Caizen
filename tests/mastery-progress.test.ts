import { describe, expect, it } from 'vitest';

import {
  bondLevelForXp,
  categoryLevelForXp,
  cumulativeXpForLevel,
  getBondXpTotal,
  getCategoryProgress,
  getEffectiveMasteryRankName,
  migrateMasteryProgress,
  masterySkinEligibility,
  normalizeMasterySkinSelection,
  rankForCategoryXp,
  recordCategoryXpEvent,
  recordMasteryBondEvent,
} from '@/lib/mastery/progress';
import type { Profile } from '@/lib/types';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-test',
    name: 'Test',
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
    pet: undefined,
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    ...overrides,
  };
}

describe('mastery progress', () => {
  it('uses the approved Category XP curve and rank boundaries', () => {
    expect(cumulativeXpForLevel(10)).toBe(1000);
    expect(categoryLevelForXp(1000)).toBe(10);
    expect(rankForCategoryXp(999)).toBe('Adept');
    expect(rankForCategoryXp(1000)).toBe('Expert');
    expect(rankForCategoryXp(2999)).toBe('Expert');
    expect(rankForCategoryXp(3000)).toBe('Master');
    expect(rankForCategoryXp(7875)).toBe('Mythic');
  });

  it('keeps Category XP local and idempotent with ordinary activity caps', () => {
    const first = recordCategoryXpEvent(profile(), {
      category: 'productivity',
      sourceType: 'task',
      sourceId: 'task-1',
      xp: 25,
      occurredAt: new Date('2026-08-10T08:00:00'),
    });
    const duplicate = recordCategoryXpEvent(first, {
      category: 'productivity',
      sourceType: 'task',
      sourceId: 'task-1',
      xp: 25,
      occurredAt: new Date('2026-08-10T08:00:00'),
    });
    const second = recordCategoryXpEvent(first, {
      category: 'productivity',
      sourceType: 'task',
      sourceId: 'task-2',
      xp: 25,
      occurredAt: new Date('2026-08-10T09:00:00'),
    });

    expect(duplicate.categoryXpEvents).toHaveLength(1);
    expect(second.categoryXpEvents?.map(event => event.xp)).toEqual([25, 12]);
    expect(getCategoryProgress(second, 'productivity').totalXp).toBe(37);
    expect(getCategoryProgress(second, 'wellness').totalXp).toBe(0);
  });

  it('preserves a historical floor during migration without reward side effects', () => {
    const migrated = migrateMasteryProgress(
      profile({
        masteryRankFloors: { reflection: 'Expert' },
        achievementUnlocks: [
          {
            achievementId: 'reflection-foundation',
            unlockedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
        pet: undefined,
      }),
      [
        { id: 'reflection-foundation', category: 'reflection', type: 'Foundation' },
      ],
    );

    expect(getEffectiveMasteryRankName(migrated, 'reflection')).toBe('Expert');
    expect(migrated.masteryBondXpEvents).toEqual([]);
    expect(migrated.masteryBondClaims).toEqual([]);
    expect(migrated.achievementUnlocks).toHaveLength(1);
  });
});

describe('active mastery companion Bond XP', () => {
  it('routes Bond XP to the active companion rather than the action category', () => {
    const start = profile({
      activeMasteryCompanion: 'reflection',
      masteryRankFloors: { reflection: 'Expert', productivity: 'Expert' },
    });
    const next = recordMasteryBondEvent(start, {
      sourceType: 'task',
      sourceId: 'task-123',
      xp: 10,
    });

    expect(next.masteryBondXpEvents?.[0]).toMatchObject({
      recipient: 'reflection',
      id: 'bond:reflection:task:task-123',
      xp: 10,
    });
    expect(getBondXpTotal(next, 'productivity')).toBe(0);
    expect(getBondXpTotal(next, 'reflection')).toBe(10);
  });

  it('prevents a processed action from rewarding a second companion after switching', () => {
    const first = recordMasteryBondEvent(
      profile({ activeMasteryCompanion: 'reflection', masteryRankFloors: { reflection: 'Expert', productivity: 'Expert' } }),
      { sourceType: 'task', sourceId: 'task-123', xp: 10 },
    );
    const switched = { ...first, activeMasteryCompanion: 'productivity' as const };
    const retried = recordMasteryBondEvent(switched, {
      sourceType: 'task',
      sourceId: 'task-123',
      xp: 10,
    });

    expect(retried.masteryBondXpEvents).toHaveLength(1);
    expect(getBondXpTotal(retried, 'reflection')).toBe(10);
    expect(getBondXpTotal(retried, 'productivity')).toBe(0);
  });

  it('records a no-recipient claim when no companion is active', () => {
    const consumed = recordMasteryBondEvent(profile(), {
      sourceType: 'daily-check-in',
      sourceId: 'daily-check-in:2026-08-10',
      xp: 10,
    });
    const laterSelection = recordMasteryBondEvent(
      { ...consumed, activeMasteryCompanion: 'reflection', masteryRankFloors: { reflection: 'Expert' } },
      { sourceType: 'daily-check-in', sourceId: 'daily-check-in:2026-08-10', xp: 10 },
    );

    expect(consumed.masteryBondXpEvents).toEqual([]);
    expect(consumed.masteryBondClaims).toHaveLength(1);
    expect(laterSelection.masteryBondXpEvents).toEqual([]);
  });

  it('keeps Bond Level uncapped and mastery skin eligibility rank-derived', () => {
    expect(bondLevelForXp(0)).toBe(1);
    expect(bondLevelForXp(100)).toBe(2);
    expect(bondLevelForXp(100000)).toBe(1001);
    expect(masterySkinEligibility('Expert')).toEqual(['base']);
    expect(masterySkinEligibility('Master')).toEqual(['base', 'evolved']);
    expect(masterySkinEligibility('Mythic')).toEqual(['base', 'evolved', 'resonance']);
  });

  it('keeps skin selection user-controlled and enforces the profile-wide Bond cap', () => {
    const base = profile({
      activeMasteryCompanion: 'reflection',
      masteryRankFloors: { reflection: 'Mythic' },
      masteryCompanionPreferences: {
        reflection: { selectedSkin: 'base' },
      },
    });
    expect(normalizeMasterySkinSelection(base, 'reflection')).toBe('base');

    let next = base;
    next = recordMasteryBondEvent(next, { sourceType: 'daily-check-in', sourceId: 'day', xp: 10 });
    next = recordMasteryBondEvent(next, { sourceType: 'journal', sourceId: 'journal-day', xp: 15 });
    next = recordMasteryBondEvent(next, { sourceType: 'task', sourceId: 'task-1', xp: 10 });
    next = recordMasteryBondEvent(next, { sourceType: 'task', sourceId: 'task-2', xp: 10 });
    next = recordMasteryBondEvent(next, { sourceType: 'routine', sourceId: 'routine-day', xp: 3 });

    const total = getBondXpTotal(next, 'reflection');
    expect(total).toBeLessThanOrEqual(40);
    expect(next.masteryBondXpEvents?.find(event => event.sourceId === 'task-2')?.xp).toBe(5);
  });
});
