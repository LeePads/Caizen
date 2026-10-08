import { describe, expect, it } from 'vitest';

import {
  ACTIVE_ACHIEVEMENTS,
  LEGACY_ACHIEVEMENTS,
  evaluateAchievementSystem,
  getReadyAchievementUnlocks,
  getPetMasteryEligibility,
  migrateAchievementProfile,
} from '@/lib/mastery/achievement-system';
import { getPetMasteryStage } from '@/lib/mastery/pet-stage';
import {
  missingPetMasteryArtwork,
  PET_MASTERY_ASSETS,
  resolvePetMasteryAsset,
  type PetMasteryAssetRegistry,
} from '@/lib/mastery/pet-assets';
import { prepareImport } from '@/lib/storage/import-integrity';
import type { Profile } from '@/lib/types';

const at = (day: string) => new Date(`${day}T12:00:00`);

const baseProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'profile-test',
  name: 'Test Profile',
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
  balanceCheckIns: [],
  achievementUnlocks: [],
  health: {
    weightEntries: [],
    nutritionEntries: [],
    foodEntries: [],
    foodTemplates: [],
    activityEntries: [],
    sleepEntries: [],
    noXTrackers: [],
  },
  createdAt: at('2026-01-01'),
  ...overrides,
});

const unlocks = (ids: string[]) =>
  ids.map((achievementId, index) => ({
    achievementId,
    unlockedAt: at(`2026-01-${String(index + 1).padStart(2, '0')}`),
  }));

const category = (profile: Profile, name: string) =>
  evaluateAchievementSystem(profile).categories.find(item => item.category === name)!;

describe('approved achievement system', () => {
  it('maps every effective mastery rank to one semantic pet stage', () => {
    expect(getPetMasteryStage('Unstarted')).toBe('locked');
    expect(getPetMasteryStage('Apprentice')).toBe('locked');
    expect(getPetMasteryStage('Adept')).toBe('locked');
    expect(getPetMasteryStage('Expert')).toBe('companion');
    expect(getPetMasteryStage('Master')).toBe('evolved');
    expect(getPetMasteryStage('Mythic')).toBe('resonance');
  });

  it('contains exactly five typed active achievements per category', () => {
    expect(ACTIVE_ACHIEVEMENTS).toHaveLength(30);
    expect(LEGACY_ACHIEVEMENTS).toHaveLength(50);
    for (const path of ['productivity', 'wellness', 'finance', 'collection', 'reflection', 'discipline']) {
      const related = ACTIVE_ACHIEVEMENTS.filter(item => item.category === path);
      expect(related).toHaveLength(5);
      expect(new Set(related.map(item => item.type))).toEqual(
        new Set(['Foundation', 'Practice', 'Breadth', 'Landmark', 'Signature']),
      );
    }
  });

  it('uses authoritative sequential gates rather than score thresholds', () => {
    const ids = [
      'productivity-first-shape',
      'productivity-steady-rhythm',
      'productivity-three-ways-forward',
      'productivity-clear-runway',
      'productivity-week-that-holds',
    ];
    const ranks = ['Apprentice', 'Adept', 'Expert', 'Master', 'Mythic'] as const;
    for (let index = 0; index < ids.length; index += 1) {
      const result = category(baseProfile({ achievementUnlocks: unlocks(ids.slice(0, index + 1)) }), 'productivity');
      expect(result.rank.name).toBe(ranks[index]);
    }
  });

  it('keeps category mastery independent', () => {
    const profile = baseProfile({
      achievementUnlocks: unlocks(ACTIVE_ACHIEVEMENTS.filter(item => item.category === 'finance').map(item => item.id)),
    });
    expect(category(profile, 'finance').rank.name).toBe('Mythic');
    expect(category(profile, 'productivity').rank.name).toBe('Unstarted');
    expect(category(profile, 'wellness').rank.name).toBe('Unstarted');
  });

  it('uses distinct weeks so same-day routine activity cannot farm practice', () => {
    const completionHistory = Array.from({ length: 12 }, (_, index) => ({
      date: '2026-02-04',
      status: 'done' as const,
      completedAt: at('2026-02-04'),
      note: `check-${index}`,
    }));
    const profile = baseProfile({
      dailyChecklistItems: [{
        id: 'routine-1',
        title: 'Routine',
        frequency: 'daily',
        completionHistory,
        createdAt: at('2026-02-01'),
      }],
    });
    const practice = category(profile, 'productivity').achievements.find(item => item.type === 'Practice')!;
    expect(practice.current).toBe(1);
    expect(practice.unlocked).toBe(false);
  });

  it('requires four meaningful Collection surfaces across two months for Breadth', () => {
    const profile = baseProfile({
      inventoryItems: [{ id: 'i', name: 'Item', quantity: 1, unit: 'piece', category: 'home', notes: 'Keep', purchaseDate: at('2026-01-01'), createdAt: at('2026-01-01') }],
      wishlistItems: [{ id: 'w', name: 'Wish', category: 'other', notes: 'Plan', selected: false, priority: 'medium', createdAt: at('2026-01-08') }],
      personalVaultItems: [{ id: 'v', type: 'document', title: 'Reference', notes: 'Useful', createdAt: at('2026-01-15') }],
      mediaItems: [{ id: 'm', title: 'Film', type: 'movie', status: 'planned', notes: 'Watch later', createdAt: at('2026-02-01') }],
    });
    const breadth = category(profile, 'collection').achievements.find(item => item.type === 'Breadth')!;
    expect(breadth.current).toBe(4);
    expect(breadth.currentlySatisfied).toBe(true);
    expect(breadth.banked).toBe(true);
    expect(breadth.unlocked).toBe(false);
  });

  it('does not evaluate Wellness outcomes such as weight change', () => {
    const first = baseProfile({
      health: {
        weightEntries: [{ id: 'w', date: at('2026-01-01'), weightKg: 100, createdAt: at('2026-01-01') }],
        nutritionEntries: [], foodEntries: [], foodTemplates: [], activityEntries: [], sleepEntries: [], noXTrackers: [],
      },
    });
    const second = baseProfile({
      health: {
        weightEntries: [{ id: 'w', date: at('2026-01-01'), weightKg: 50, createdAt: at('2026-01-01') }],
        nutritionEntries: [], foodEntries: [], foodTemplates: [], activityEntries: [], sleepEntries: [], noXTrackers: [],
      },
    });
    expect(category(first, 'wellness').rank).toEqual(category(second, 'wellness').rank);
    expect(category(first, 'wellness').achievements.map(item => item.unlocked)).toEqual(
      category(second, 'wellness').achievements.map(item => item.unlocked),
    );
  });

  it('recognizes return after a break without requiring a streak', () => {
    const profile = baseProfile({
      productivityItems: [
        { id: 't1', title: 'One', type: 'task', priority: 'normal', status: 'completed', completedAt: at('2026-01-01'), createdAt: at('2026-01-01') },
        { id: 't2', title: 'Two', type: 'task', priority: 'normal', status: 'completed', completedAt: at('2026-01-10'), createdAt: at('2026-01-10') },
        { id: 't3', title: 'Three', type: 'task', priority: 'normal', status: 'completed', completedAt: at('2026-01-24'), createdAt: at('2026-01-24') },
      ],
      health: {
        weightEntries: [], nutritionEntries: [], foodEntries: [], foodTemplates: [],
        activityEntries: [
          { id: 'a1', date: at('2026-01-17'), activity: 'Walk', caloriesBurned: 0, createdAt: at('2026-01-17') },
          { id: 'a2', date: at('2026-02-07'), activity: 'Walk', caloriesBurned: 0, createdAt: at('2026-02-07') },
        ],
        sleepEntries: [], noXTrackers: [],
      },
      balanceCheckIns: [
        { id: 'b1', weekKey: '2026-01-31', completedAt: at('2026-01-31'), walletBalances: [], totalWalletBalance: 0, spendableBalance: 0, protectedBalance: 0, remainingCommitments: 0, safeToSpend: 0 },
        { id: 'b2', weekKey: '2026-02-07', completedAt: at('2026-02-07'), walletBalances: [], totalWalletBalance: 0, spendableBalance: 0, protectedBalance: 0, remainingCommitments: 0, safeToSpend: 0 },
      ],
    });
    const practice = category(profile, 'discipline').achievements.find(item => item.type === 'Practice')!;
    expect(practice.current).toBe(6);
    expect(practice.currentlySatisfied).toBe(true);
    expect(practice.banked).toBe(true);
    expect(practice.unlocked).toBe(false);
  });

  it('keeps unlocked achievements permanent and migration idempotent', () => {
    const profile = baseProfile({
      achievementUnlocks: [
        ...unlocks(['productivity-first-completion', 'collection-first-item', 'reflection-first', 'finance-first-wallet', 'finance-first-review']),
        { achievementId: 'productivity-clear-deck', unlockedAt: at('2025-12-01') },
      ],
      pet: {
        name: 'Mochi', activePetId: 'mochi', ownedPetIds: ['mochi'], costume: 'default', ownedCostumes: ['default'],
        purchasedShopItemIds: [], level: 1, xp: 10, gold: 4, createdAt: at('2026-01-01'), recentRewards: [],
      },
    });
    const migrated = migrateAchievementProfile(profile);
    const migratedAgain = migrateAchievementProfile(migrated);
    expect(migratedAgain).toEqual(migrated);
    expect(migrated.achievementUnlocks?.map(item => item.achievementId)).toEqual(expect.arrayContaining([
      'productivity-first-shape',
      'collection-first-keepsake',
      'reflection-first-note',
      'finance-first-ledger',
      'productivity-clear-deck',
    ]));
    expect(migrated.pet).toEqual(profile.pet);
    expect(evaluateAchievementSystem(migrated).legacyAchievements.map(item => item.id)).toContain('productivity-clear-deck');
  });

  it('exposes pet eligibility without changing the active pet or pet rewards', () => {
    const profile = baseProfile({
      achievementUnlocks: unlocks([
        'reflection-first-note',
        'reflection-returning-page',
        'reflection-fuller-view',
      ]),
      pet: {
        name: 'Mochi', activePetId: 'mochi', ownedPetIds: ['mochi'], costume: 'default', ownedCostumes: ['default'],
        purchasedShopItemIds: [], level: 2, xp: 42, gold: 9, createdAt: at('2026-01-01'), recentRewards: [],
      },
    });
    const eligibility = getPetMasteryEligibility(profile).find(item => item.category === 'reflection')!;
    expect(eligibility.companionUnlocked).toBe(true);
    expect(eligibility.evolutionEligible).toBe(false);
    expect(eligibility.evolved).toBe(false);
    expect(eligibility.mature).toBe(false);
    expect(profile.pet?.activePetId).toBe('mochi');
    expect(profile.pet?.xp).toBe(42);
  });

  it('banks later evidence until earlier mastery gates are recorded', () => {
    const dates = [
      '2026-01-01', '2026-01-02', '2026-01-03',
      '2026-02-01', '2026-02-02', '2026-02-03',
      '2026-03-01', '2026-03-02', '2026-03-03',
      '2026-04-01', '2026-04-02', '2026-04-03',
    ];
    const profile = baseProfile({
      productivityItems: dates.map((date, index) => ({
        id: `task-${index}`,
        title: `Planned item ${index}`,
        type: 'task' as const,
        priority: 'normal' as const,
        status: 'completed' as const,
        completedAt: at(date),
        deadline: at(date),
        createdAt: at(date),
      })),
    });
    const achievements = category(profile, 'productivity').achievements;
    const foundation = achievements.find(item => item.type === 'Foundation')!;
    const practice = achievements.find(item => item.type === 'Practice')!;
    const landmark = achievements.find(item => item.type === 'Landmark')!;
    expect(foundation.unlocked).toBe(true);
    expect(practice.currentlySatisfied).toBe(false);
    expect(landmark.currentlySatisfied).toBe(true);
    expect(landmark.banked).toBe(true);
    expect(landmark.unlocked).toBe(false);

    const afterGates = category(baseProfile({
      ...profile,
      achievementUnlocks: unlocks([
        'productivity-first-shape',
        'productivity-steady-rhythm',
        'productivity-three-ways-forward',
      ]),
    }), 'productivity').achievements.find(item => item.type === 'Landmark')!;
    expect(afterGates.currentlySatisfied).toBe(true);
    expect(afterGates.readyToUnlock).toBe(true);
    expect(afterGates.unlocked).toBe(true);
  });

  it('selects startup-ready achievements deterministically without reselecting persisted unlocks', () => {
    const state = evaluateAchievementSystem(baseProfile({
      productivityItems: [{
        id: 'completed-task',
        title: 'Completed task',
        type: 'task',
        priority: 'normal',
        status: 'completed',
        completedAt: at('2026-08-10'),
        createdAt: at('2026-08-10'),
      }],
    }));
    const ready = getReadyAchievementUnlocks(state.achievements, []);

    expect(ready.map(item => item.id)).toEqual(['productivity-first-shape']);
    expect(getReadyAchievementUnlocks(state.achievements, [
      { achievementId: 'productivity-first-shape', unlockedAt: at('2026-08-11') },
    ])).toEqual([]);
  });

  it('uses fixed calendar week and month boundaries', () => {
    const routine = baseProfile({
      dailyChecklistItems: [{
        id: 'routine-boundary',
        title: 'Boundary routine',
        frequency: 'daily',
        completionHistory: [
          { date: '2026-02-01', status: 'done', completedAt: at('2026-02-01') },
          { date: '2026-02-07', status: 'done', completedAt: at('2026-02-07') },
          { date: '2026-02-08', status: 'done', completedAt: at('2026-02-08') },
        ],
        createdAt: at('2026-02-01'),
      }],
    });
    const routinePractice = category(routine, 'productivity').achievements.find(item => item.type === 'Practice')!;
    expect(routinePractice.current).toBe(2);

    const finance = baseProfile({
      wallets: [{ id: 'wallet', name: 'Main', balance: 10, color: '#000', type: 'free_spending', createdAt: at('2026-01-01') }],
      balanceProjectionRows: [{ id: 'plan', label: 'Plan', amount: '10', allocated: '10', type: 'expense', active: true }],
      balanceCheckIns: [
        { id: 'jan', weekKey: '2026-01-25', completedAt: at('2026-01-31'), walletBalances: [], totalWalletBalance: 10, spendableBalance: 10, protectedBalance: 0, remainingCommitments: 0, safeToSpend: 10 },
        { id: 'feb', weekKey: '2026-02-01', completedAt: at('2026-02-01'), walletBalances: [], totalWalletBalance: 10, spendableBalance: 10, protectedBalance: 0, remainingCommitments: 0, safeToSpend: 10 },
      ],
    });
    const channels = category(finance, 'finance').achievements.find(item => item.type === 'Breadth')!;
    expect(channels.current).toBe(3);
    expect(channels.currentlySatisfied).toBe(true);
  });

  it('maps Expert, Master, and Mythic to the category companion stages', () => {
    const ids = ACTIVE_ACHIEVEMENTS.filter(item => item.category === 'reflection').map(item => item.id);
    const locked = getPetMasteryEligibility(baseProfile({ achievementUnlocks: unlocks(ids.slice(0, 2)) })).find(item => item.category === 'reflection')!;
    const expert = getPetMasteryEligibility(baseProfile({ achievementUnlocks: unlocks(ids.slice(0, 3)) })).find(item => item.category === 'reflection')!;
    const master = getPetMasteryEligibility(baseProfile({ achievementUnlocks: unlocks(ids.slice(0, 4)) })).find(item => item.category === 'reflection')!;
    const mythic = getPetMasteryEligibility(baseProfile({ achievementUnlocks: unlocks(ids) })).find(item => item.category === 'reflection')!;
    expect(locked.companionUnlocked).toBe(false);
    expect(locked.stage).toBe('locked');
    expect(expert.companionUnlocked).toBe(true);
    expect(expert.stage).toBe('companion');
    expect(expert.evolutionEligible).toBe(false);
    expect(master.companionUnlocked).toBe(true);
    expect(master.stage).toBe('evolved');
    expect(master.evolutionEligible).toBe(true);
    expect(mythic.mythicResonanceEligible).toBe(true);
    expect(mythic.stage).toBe('resonance');

    const productivity = getPetMasteryEligibility(baseProfile({
      achievementUnlocks: unlocks(ACTIVE_ACHIEVEMENTS.filter(item => item.category === 'productivity').slice(0, 3).map(item => item.id)),
    }));
    expect(productivity.find(item => item.category === 'productivity')?.companionUnlocked).toBe(true);
    expect(productivity.find(item => item.category === 'wellness')?.companionUnlocked).toBe(false);
  });

  it('keeps pet XP and gold unchanged because eligibility is derived', () => {
    const profile = baseProfile({
      achievementUnlocks: unlocks([
        'reflection-first-note',
        'reflection-returning-page',
        'reflection-fuller-view',
      ]),
      pet: {
        name: 'Mochi', activePetId: 'mochi', ownedPetIds: ['mochi'], costume: 'default', ownedCostumes: ['default'],
        purchasedShopItemIds: [], level: 2, xp: 42, gold: 9, createdAt: at('2026-01-01'), recentRewards: [],
      },
    });
    const before = { xp: profile.pet?.xp, gold: profile.pet?.gold };
    getPetMasteryEligibility(profile);
    expect({ xp: profile.pet?.xp, gold: profile.pet?.gold }).toEqual(before);
  });

  it('preserves an existing rank floor across the harder rules and migrates idempotently', () => {
    const oldProfile = baseProfile({
      achievementMigrationVersion: 1,
      achievementUnlocks: unlocks([
        'reflection-first-note',
        'reflection-returning-page',
        'reflection-fuller-view',
      ]),
    });
    const migrated = migrateAchievementProfile(oldProfile);
    const migratedAgain = migrateAchievementProfile(migrated);
    expect(migrated.masteryRankFloors?.reflection).toBe('Expert');
    expect(migratedAgain).toEqual(migrated);
    const reflection = category(migrated, 'reflection');
    expect(reflection.evidenceRank.name).toBe('Unstarted');
    expect(reflection.rank.name).toBe('Expert');
    expect(getPetMasteryEligibility(migrated).find(item => item.category === 'reflection')?.companionUnlocked).toBe(true);
    expect(getPetMasteryEligibility(migrated).find(item => item.category === 'reflection')?.stage).toBe('companion');
  });

  it('never unlocks a mastery pet below Expert, even when other categories advance', () => {
    const productivity = getPetMasteryEligibility(baseProfile({
      achievementUnlocks: unlocks(ACTIVE_ACHIEVEMENTS
        .filter(item => item.category === 'productivity')
        .map(item => item.id)),
    }));
    const lockedCategories = productivity.filter(item => item.category !== 'productivity');
    expect(lockedCategories).toHaveLength(5);
    expect(lockedCategories.every(item => item.stage === 'locked')).toBe(true);
  });

  it('falls back only to the nearest artwork within the same category', () => {
    const registry: PetMasteryAssetRegistry = {
      productivity: { locked: undefined, companion: { src: '/pets/category/base.png', name: 'Base' }, evolved: undefined, resonance: undefined },
      wellness: { locked: undefined, companion: undefined, evolved: undefined, resonance: undefined },
      finance: { locked: undefined, companion: undefined, evolved: undefined, resonance: undefined },
      collection: { locked: undefined, companion: undefined, evolved: undefined, resonance: undefined },
      reflection: { locked: undefined, companion: undefined, evolved: undefined, resonance: undefined },
      discipline: { locked: undefined, companion: undefined, evolved: undefined, resonance: undefined },
    };
    expect(resolvePetMasteryAsset('productivity', 'evolved', registry)).toMatchObject({
      resolvedStage: 'companion',
      isFallback: true,
      asset: { src: '/pets/category/base.png' },
    });
    expect(resolvePetMasteryAsset('wellness', 'resonance', registry).asset).toBeUndefined();
  });

  it('keeps every category and stage explicit while artwork is pending approval', () => {
    expect(Object.keys(PET_MASTERY_ASSETS)).toEqual([
      'productivity',
      'wellness',
      'finance',
      'collection',
      'reflection',
      'discipline',
    ]);
    expect(missingPetMasteryArtwork()).toHaveLength(24);
  });

  it('normalizes mastery dates in older backup imports', () => {
    const prepared = prepareImport({
      format: 'caizen-data',
      version: 3,
      data: {
        currentProfileId: 'profile-test',
        profiles: [{
          ...baseProfile(),
          achievementUnlocks: [{ achievementId: 'reflection-first-note', unlockedAt: '2026-01-01T04:00:00.000Z' }],
          masteryMilestones: [{ category: 'reflection', rank: 'Apprentice', reachedAt: '2026-01-02T04:00:00.000Z' }],
        }],
      },
    });
    const imported = prepared.state.profiles[0];
    expect(imported.achievementUnlocks?.[0].unlockedAt).toBe('2026-01-01T04:00:00.000Z');
    expect(imported.masteryMilestones?.[0].reachedAt).toBe('2026-01-02T04:00:00.000Z');
  });
});
