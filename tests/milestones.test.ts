import { describe, expect, it } from 'vitest';

import {
  MILESTONE_DEFINITIONS,
  applyMilestoneTransition,
  evaluateMilestones,
  getEffectiveMilestoneAchievements,
  getNewMilestoneUnlocks,
  projectLegacyMilestones,
} from '@/lib/milestones';
import { prepareImport } from '@/lib/storage/import-integrity';
import type { Profile } from '@/lib/types';

const date = (value: string) => new Date(`${value}T12:00:00`);

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'milestone-profile',
    name: 'Milestone profile',
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
    createdAt: date('2026-01-01'),
    ...overrides,
  };
}

const legacyAchievedAt = date('2025-04-12');

function legacyProfile(overrides: Partial<Profile> = {}): Profile {
  return profile({
    achievementUnlocks: [{
      achievementId: 'reflection-first-note',
      unlockedAt: legacyAchievedAt,
    }],
    ...overrides,
  });
}

describe('fixed milestone model', () => {
  it('defines exactly ten deterministic milestones', () => {
    expect(MILESTONE_DEFINITIONS).toHaveLength(10);
    expect(new Set(MILESTONE_DEFINITIONS.map(item => item.id)).size).toBe(10);
    expect(MILESTONE_DEFINITIONS.every(item =>
      item.evidenceSources.length > 0 && item.timestampRule && item.category && item.icon && item.evaluate,
    )).toBe(true);

    const input = profile({
      categoryXpEvents: [{
        id: 'xp', category: 'productivity', sourceId: 'xp', sourceType: 'manual', amount: 999,
        occurredAt: date('2026-01-02'),
      } as any],
      masteryBondXpEvents: [{
        id: 'bond', amount: 999, source: 'manual', occurredAt: date('2026-01-02'),
      } as any],
      masteryRankFloors: { productivity: 'Mythic' },
      pet: { level: 99, xp: 999, gold: 999 } as Profile['pet'],
    });
    const first = evaluateMilestones(input).map(item => [item.id, item.achievedAt?.getTime()]);
    const second = evaluateMilestones({ ...input, categoryXpEvents: [], masteryBondXpEvents: [] });
    expect(second.map(item => [item.id, item.achievedAt?.getTime()])).toEqual(first);
  });

  it('projects an unambiguous legacy milestone without mutating the profile', () => {
    const input = legacyProfile();
    const before = JSON.stringify(input);
    const projections = projectLegacyMilestones(input);
    const effective = getEffectiveMilestoneAchievements(input);

    expect(projections).toContainEqual({
      milestoneId: 'first-useful-step',
      achievedAt: legacyAchievedAt,
      source: 'legacy-projection',
    });
    expect(effective.get('first-useful-step')).toMatchObject({
      achievedAt: legacyAchievedAt,
      source: 'legacy-projection',
    });
    const persistedAt = date('2026-05-01');
    expect(getEffectiveMilestoneAchievements(profile({
      achievementUnlocks: input.achievementUnlocks,
      milestoneUnlocks: [{ milestoneId: 'first-useful-step', achievedAt: persistedAt }],
    })).get('first-useful-step')).toMatchObject({
      achievedAt: persistedAt,
      source: 'persisted',
    });
    expect(input.milestoneUnlocks).toBeUndefined();
    expect(JSON.stringify(input)).toBe(before);
  });

  it('does not re-award a projected milestone or create duplicate effects', () => {
    const before = legacyProfile();
    const after = legacyProfile({
      journalEntries: [{
        id: 'entry-1',
        date: date('2026-02-01'),
        content: 'A later meaningful reflection.',
        createdAt: date('2026-02-01'),
      }],
    });

    expect(getNewMilestoneUnlocks(before, after, date('2026-02-02'))).not.toEqual(
      expect.arrayContaining([{ milestoneId: 'first-useful-step' }]),
    );
    const transition = applyMilestoneTransition(before, after, date('2026-02-02'));
    expect(transition.unlocks).toEqual([]);
    expect(transition.profile.milestoneUnlocks).toBeUndefined();
  });

  it('keeps the projected legacy timestamp while allowing an unrelated new milestone', () => {
    const before = legacyProfile();
    const after = legacyProfile({
      wallets: [{
        id: 'wallet', name: 'Everyday', balance: 100, color: '#000', type: 'cash_on_hand',
        createdAt: date('2026-01-02'),
      }],
      transactions: [{
        id: 'transaction', type: 'income', amount: 100, walletId: 'wallet',
        date: date('2026-01-03'), createdAt: date('2026-01-03'),
      }],
      balanceCheckIns: [
        {
          id: 'review-1', weekKey: '2026-01-04', completedAt: date('2026-01-04'),
          walletBalances: [], totalWalletBalance: 100, spendableBalance: 100,
          protectedBalance: 0, remainingCommitments: 0, safeToSpend: 100,
        },
        {
          id: 'review-2', weekKey: '2026-01-11', completedAt: date('2026-01-11'),
          walletBalances: [], totalWalletBalance: 100, spendableBalance: 100,
          protectedBalance: 0, remainingCommitments: 0, safeToSpend: 100,
        },
      ],
    });

    const transition = applyMilestoneTransition(before, after, date('2026-01-12'));
    expect(transition.unlocks.map(item => item.milestoneId)).toContain('money-in-order');
    expect(transition.unlocks.map(item => item.milestoneId)).not.toContain('first-useful-step');
    expect(transition.profile.milestoneUnlocks).toEqual(
      expect.arrayContaining([{ milestoneId: 'money-in-order', achievedAt: expect.any(Date) }]),
    );
    expect(getEffectiveMilestoneAchievements(transition.profile).get('first-useful-step')).toMatchObject({
      achievedAt: legacyAchievedAt,
      source: 'legacy-projection',
    });
  });

  it('preserves persisted unlock dates through import without materializing projections', () => {
    const persistedAt = date('2026-03-14');
    const seenAt = date('2026-03-15');
    const prepared = prepareImport({
      format: 'caizen-data',
      version: 3,
      data: {
        currentProfileId: 'milestone-profile',
        profiles: [profile({
          achievementUnlocks: [{ achievementId: 'reflection-first-note', unlockedAt: legacyAchievedAt }],
          milestoneUnlocks: [{ milestoneId: 'money-in-order', achievedAt: persistedAt, seenAt }],
        })],
      },
    });
    const imported = prepared.state.profiles[0];

    expect(imported.milestoneUnlocks).toHaveLength(1);
    expect(imported.milestoneUnlocks?.[0].milestoneId).toBe('money-in-order');
    expect(new Date(String(imported.milestoneUnlocks?.[0].achievedAt || '')).getTime()).toBe(persistedAt.getTime());
    expect(new Date(String(imported.milestoneUnlocks?.[0].seenAt || '')).getTime()).toBe(seenAt.getTime());
    expect(getEffectiveMilestoneAchievements(imported).get('first-useful-step')).toMatchObject({
      source: 'legacy-projection',
      achievedAt: legacyAchievedAt,
    });
  });

  it('blocks malformed persisted milestone dates at the import boundary', () => {
    const prepared = prepareImport({
      format: 'caizen-data',
      version: 3,
      data: {
        currentProfileId: 'milestone-profile',
        profiles: [profile({
          milestoneUnlocks: [{ milestoneId: 'first-useful-step', achievedAt: 'not-a-date' } as any],
        })],
      },
    });

    expect(prepared.report.canImport).toBe(false);
    expect(prepared.report.missingDateCount + prepared.report.blockingInvalidCount).toBeGreaterThan(0);
  });
});
