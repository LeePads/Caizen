import { describe, expect, it } from 'vitest';

import {
  normalizeFallbackProfile,
  normalizeLoadedProfile,
  normalizeAndMigrateProfile,
  type ProfileNormalizationAdapters,
} from '@/lib/profile/normalize-profile';
import { getCategoryXpTotal, getEffectiveMasteryRankName } from '@/lib/mastery/progress';
import { prepareImport } from '@/lib/storage/import-integrity';
import type { PetCompanionData, Profile } from '@/lib/types';

const adapters: ProfileNormalizationAdapters = {
  normalizeInventoryItem: item => item,
  normalizeProductivityItem: item => item,
  normalizeRoutineItem: item => item,
  normalizeImportantDateItem: item => item,
  normalizeHealth: value => (value || {}) as Profile['health'],
  normalizePet: pet => (pet || {}) as PetCompanionData,
  normalizeMediaItem: item => item,
};

const legacyProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 'profile-normalization',
  name: 'Legacy profile',
  wallets: [],
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
  health: {},
  createdAt: '2026-08-10T00:00:00.000Z',
  ...overrides,
});

describe('profile normalization ownership', () => {
  it('keeps an empty taxonomy empty for the provider initialization boundary', () => {
    const loaded = normalizeLoadedProfile(
      legacyProfile({ financialCategories: [] }),
      adapters,
    );

    expect(loaded.financialCategories).toEqual([]);
  });

  it('fills optional defaults without emitting rewards or feedback', () => {
    const profile = normalizeAndMigrateProfile(
      legacyProfile({ feedbackPreferences: { showToasts: 'invalid' } }),
      adapters,
    );

    expect(profile.feedbackPreferences).toEqual({
      showToasts: true,
      showRewardDetails: true,
    });
    expect(profile.categoryXpEvents).toEqual([]);
    expect(profile.masteryBondXpEvents).toEqual([]);
    expect(profile.masteryBondClaims).toEqual([]);
    expect(profile.achievementUnlocks).toEqual([]);
  });

  it('normalizes recurring taxonomy references through loaded and fallback boundaries', () => {
    const input = legacyProfile({
      wallets: [{
        id: 'cash', name: 'Cash', balance: 100, color: '#000', type: 'cash_on_hand',
      }],
      financialCategories: [{
        id: 'food', type: 'expense', name: 'Food', total: '0', kind: 'neutral',
        subcategories: [{ id: 'dining', name: 'Dining', total: '0' }],
      }],
      balanceProjectionRows: [{
        id: 'recurring', label: 'Rent', amount: '100', allocated: '', type: 'expense',
        recurrence: {
          frequency: 'monthly', startDateKey: '2026-08-01', nextDueDateKey: '2026-08-01',
          walletId: 'cash', categoryId: 'missing', subcategoryId: 'missing-sub',
        },
      }],
    });

    const loaded = normalizeLoadedProfile(input, adapters);
    const fallback = normalizeFallbackProfile(input, adapters);
    expect(loaded.balanceProjectionRows?.[0].recurrence).toMatchObject({ walletId: 'cash' });
    expect(loaded.balanceProjectionRows?.[0].recurrence?.categoryId).toBeUndefined();
    expect(fallback.balanceProjectionRows?.[0].recurrence?.categoryId).toBeUndefined();
  });

  it('preserves mastery floors and valid active companion state', () => {
    const profile = normalizeAndMigrateProfile(
      legacyProfile({
        masteryRankFloors: { reflection: 'Expert' },
        activeMasteryCompanion: 'reflection',
      }),
      adapters,
    );

    expect(profile.masteryRankFloors?.reflection).toBe('Expert');
    expect(profile.activeMasteryCompanion).toBe('reflection');
    expect(profile.createdAt).toEqual(new Date('2026-08-10T00:00:00.000Z'));
  });

  it('keeps fallback normalization deterministic and migration-safe', () => {
    const input = legacyProfile({
      id: 'fallback-profile',
      feedbackPreferences: { showRewardDetails: false },
      masteryRankFloors: { wellness: 'Master' },
    });
    const first = normalizeFallbackProfile(input, adapters);
    const second = normalizeFallbackProfile(input, adapters);

    expect(first.id).toBe('fallback-profile');
    expect(first.feedbackPreferences).toEqual({
      showToasts: true,
      showRewardDetails: false,
    });
    expect(first.masteryRankFloors?.wellness).toBe('Master');
    expect(first.categoryXpEvents?.map(({ id, xp, sourceType }) => ({ id, xp, sourceType })))
      .toEqual(second.categoryXpEvents?.map(({ id, xp, sourceType }) => ({ id, xp, sourceType })));
    expect(first.masteryBondXpEvents).toEqual(second.masteryBondXpEvents);
  });

  it('uses the loaded-profile boundary without replaying legacy progression', () => {
    const now = new Date('2026-08-12T00:00:00.000Z');
    const input = legacyProfile({
      achievementMigrationVersion: 1,
      achievementUnlocks: [
        { achievementId: 'reflection-first-note', unlockedAt: '2026-01-01T00:00:00.000Z' },
      ],
      masteryRankFloors: { reflection: 'Expert' },
      activeMasteryCompanion: 'reflection',
      categoryXpEvents: [{
        id: 'mastery:reflection:activity:existing',
        category: 'reflection',
        sourceType: 'journal',
        sourceId: 'existing',
        requestedXp: 17,
        xp: 17,
        occurredAt: '2026-08-11T00:00:00.000Z',
      }],
      masteryBondXpEvents: [{
        id: 'bond:reflection:journal:existing',
        recipient: 'reflection',
        sourceType: 'journal',
        sourceId: 'existing',
        claimId: 'journal:existing',
        requestedXp: 8,
        xp: 8,
        occurredAt: '2026-08-11T00:00:00.000Z',
      }],
      masteryBondClaims: [{
        claimId: 'journal:existing',
        eventId: 'bond:reflection:journal:existing',
        processedAt: '2026-08-11T00:00:00.000Z',
      }],
    });

    const first = normalizeLoadedProfile(input, adapters, now);
    const second = normalizeLoadedProfile(first, adapters, now);

    expect(first.categoryXpEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'mastery:reflection:activity:existing',
        xp: 17,
      }),
    ]));
    expect(first.categoryXpEvents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mastery:reflection:achievement:reflection-first-note' }),
      expect.objectContaining({ id: 'mastery:reflection:migration:floor:Expert' }),
    ]));
    expect(getCategoryXpTotal(first, 'reflection')).toBe(17);
    expect(getEffectiveMasteryRankName(first, 'reflection')).toBe('Expert');
    expect(first.activeMasteryCompanion).toBe('reflection');
    expect(first.masteryBondXpEvents).toHaveLength(1);
    expect(first.masteryBondClaims).toHaveLength(1);
    expect(second).toEqual(first);
    expect(second.categoryXpEvents).toHaveLength(first.categoryXpEvents?.length || 0);
    expect(second.masteryBondXpEvents).toHaveLength(1);
  });

  it('normalizes an imported legacy profile through the same loaded boundary', () => {
    const prepared = prepareImport({
      format: 'caizen-data',
      version: 3,
      data: {
        currentProfileId: 'profile-normalization',
        profiles: [legacyProfile({
          achievementUnlocks: [{
            achievementId: 'productivity-first-shape',
            unlockedAt: '2026-01-02T00:00:00.000Z',
          }],
          masteryRankFloors: { productivity: 'Apprentice' },
        })],
      },
    });

    const loaded = normalizeLoadedProfile(
      prepared.state.profiles[0],
      adapters,
      new Date('2026-08-12T00:00:00.000Z'),
    );

    expect(loaded.categoryXpEvents).toEqual([]);
    expect(loaded.achievementUnlocks).toHaveLength(1);
    expect(loaded.masteryBondXpEvents).toEqual([]);
  });

  it('preserves valid project/task attachment references while stripping unsupported Work fields', () => {
    const profile = normalizeAndMigrateProfile(
      legacyProfile({
        workItems: [
          {
            id: 'project-with-media',
            type: 'project',
            title: 'Project',
            attachmentAssetIds: ['asset-a', 'asset-a', ' ', 4],
          },
          {
            id: 'resource-with-media',
            type: 'file',
            title: 'External link',
            attachmentAssetIds: ['must-not-survive'],
          },
        ],
      }),
      adapters,
    );

    expect(profile.workItems[0].attachmentAssetIds).toEqual(['asset-a']);
    expect(profile.workItems[1]).not.toHaveProperty('attachmentAssetIds');
  });

  it('normalizes malformed financial records at reload and restore boundaries', () => {
    const loaded = normalizeLoadedProfile(
      legacyProfile({
        wallets: [
          { id: 'wallet-invalid', name: 'Invalid', balance: 'NaN', type: 'free_spending' },
          { id: 'wallet-negative', name: 'Negative', balance: '-25', type: 'cash_on_hand' },
        ],
        balanceProjectionRows: [{
          id: 'row-invalid',
          label: 'Invalid plan',
          amount: 'Infinity',
          allocated: '999',
          type: 'unknown',
          dueDay: 99,
        }],
        budgets: [
          { id: 'valid-budget', month: '2026-08', categoryId: 'food', allocated: '80', createdAt: '2026-08-01', updatedAt: '2026-08-01' },
          { id: 'invalid-budget', month: '2026-13', categoryId: 'food', allocated: 50 },
        ],
        financialCategories: [{
          id: 'category-invalid',
          type: 'unknown',
          name: 'Invalid category',
          total: 'NaN',
          kind: 'invalid',
          subcategories: [{ id: 'subcategory-invalid', name: 'Invalid', total: 'Infinity' }],
        }],
        balanceCheckIns: [{
          id: 'checkin-invalid',
          weekKey: 'invalid',
          completedAt: '2026-08-12',
          walletBalances: [{ walletId: 'wallet-invalid', name: 'Invalid', balance: 'NaN' }],
          totalWalletBalance: 'NaN',
          spendableBalance: '4.10',
          protectedBalance: 'Infinity',
          remainingCommitments: '2.10',
          safeToSpend: 'NaN',
        }],
      }),
      adapters,
      new Date('2026-08-12T00:00:00.000Z'),
    );

    expect(loaded.wallets.map(wallet => wallet.balance)).toEqual([0, -25]);
    expect(loaded.balanceProjectionRows?.[0]).toMatchObject({
      amount: '0',
      allocated: '0',
      type: 'expense',
      dueDay: 31,
    });
    expect(loaded.budgets).toEqual([]);
    expect(loaded.financialCategories?.[0]).toMatchObject({ total: '0', kind: 'neutral' });
    expect(loaded.balanceCheckIns?.[0]).toMatchObject({
      totalWalletBalance: 0,
      protectedBalance: 0,
      safeToSpend: 2,
    });
  });

  it('cleans invalid financial taxonomy through loaded and fallback hydration', () => {
    const source = legacyProfile({
      transactions: [{
        id: 'transaction-food',
        type: 'expense',
        amount: 20,
        walletId: 'wallet',
        categoryId: 'food',
        subcategoryId: 'blank-subcategory',
        date: '2026-08-20',
        createdAt: '2026-08-20',
      }],
      financialCategories: [
        {
          id: 'food',
          type: 'expense',
          name: '  Food ',
          icon: '  utensils  ',
          subcategories: [
            { id: 'blank-subcategory', name: '  ', icon: '   ' },
            { id: 'groceries', name: ' Groceries ', icon: '  shopping-cart ' },
          ],
        },
        { id: 'invalid-category', type: 'expense', name: ' \t', subcategories: [] },
      ],
    });

    for (const normalize of [normalizeLoadedProfile, normalizeFallbackProfile]) {
      const profile = normalize(source, adapters);
      expect(profile.financialCategories).toEqual([
        expect.objectContaining({
          id: 'food',
          name: 'Food',
          icon: 'utensils',
          subcategories: [expect.objectContaining({ id: 'groceries', name: 'Groceries', icon: 'shopping-cart' })],
        }),
      ]);
      expect(profile.transactions?.[0]).toMatchObject({ amount: 20, categoryId: 'food' });
      expect(profile.transactions?.[0].subcategoryId).toBeUndefined();
    }
  });

  it('preserves compatibility-only companion state without activating it', () => {
    const loaded = normalizeLoadedProfile(
      legacyProfile({
        activeMasteryCompanion: 'finance',
        categoryXpEvents: [{
          id: 'mastery:reflection:activity:kept',
          category: 'reflection',
          sourceType: 'journal',
          sourceId: 'kept',
          requestedXp: 12,
          xp: 12,
          occurredAt: '2026-08-11T00:00:00.000Z',
        }],
        masteryCompanionPreferences: { reflection: { selectedSkin: 'base' } },
      }),
      adapters,
      new Date('2026-08-12T00:00:00.000Z'),
    );

    expect(loaded.activeMasteryCompanion).toBe('finance');
    expect(loaded.masteryCompanionPreferences?.reflection?.selectedSkin).toBe('base');
    expect(getCategoryXpTotal(loaded, 'reflection')).toBe(12);
  });
});
