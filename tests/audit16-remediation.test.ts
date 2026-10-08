import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  applyPetReward,
  normalizePet,
  purchasePetShopState,
} from '@/lib/pets/normalization';
import { PET_SHOP_CATALOG } from '@/lib/pets/catalog';
import {
  normalizeAndMigrateProfile,
  type ProfileNormalizationAdapters,
} from '@/lib/profile/normalize-profile';
import { prepareImport, createProfilesForImport } from '@/lib/storage/import-integrity';
import type { PetCompanionData, Profile } from '@/lib/types';

const adapters: ProfileNormalizationAdapters = {
  normalizeInventoryItem: item => item,
  normalizeProductivityItem: item => item,
  normalizeRoutineItem: item => item,
  normalizeImportantDateItem: item => item,
  normalizeHealth: value => (value || {}) as Profile['health'],
  normalizePet,
  normalizeMediaItem: item => item,
};

const basePet = (overrides: Partial<PetCompanionData> = {}): PetCompanionData => ({
  name: 'Mochi',
  activePetId: 'mochi',
  ownedPetIds: ['mochi'],
  costume: 'default',
  ownedCostumes: ['default'],
  purchasedShopItemIds: [],
  level: 1,
  xp: 0,
  gold: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  showFloatingPet: true,
  rewardedItemIds: [],
  recentRewards: [],
  ...overrides,
});

const baseProfile = (id: string, pet: unknown): Record<string, unknown> => ({
  id,
  name: id,
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
  personalVaultTaxonomy: [],
  trashItems: [],
  skincareProducts: [],
  dailyChecklistItems: [],
  importantDates: [],
  supplements: [],
  balanceProjectionRows: [],
  financialCategories: [],
  balanceCheckIns: [],
  achievementUnlocks: [],
  masteryMilestones: [],
  categoryXpEvents: [],
  masteryBondXpEvents: [],
  masteryBondClaims: [],
  masteryCompanionPreferences: {},
  activeMasteryCompanion: 'reflection',
  pet,
  health: {},
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('Audit #16 Pet normalization', () => {
  it('preserves a valid current Pet state and is idempotent', () => {
    const valid = basePet({
      costume: 'wizard',
      ownedCostumes: ['default', 'wizard'],
      purchasedShopItemIds: ['skin:mochi:wizard'],
      level: 3,
      xp: 42,
      gold: 7,
      rewardedItemIds: ['task:one'],
      recentRewards: [{
        id: 'reward-1',
        sourceId: 'task:one',
        sourceType: 'task',
        label: 'Task',
        xp: 5,
        gold: 2,
        earnedAt: new Date('2026-02-01T10:00:00.000Z'),
      }],
    });

    const normalized = normalizePet(valid);
    expect(normalized).toMatchObject(valid);
    expect(normalizePet(normalized)).toEqual(normalized);
  });

  it('degrades malformed arrays, numerics, dates, IDs, and equipped state safely', () => {
    const normalized = normalizePet({
      name: 'Pixel',
      level: 'Infinity',
      xp: Number.NaN,
      gold: '-Infinity',
      costume: 'wizard',
      ownedCostumes: ['default', 'default', null, 'unknown'],
      purchasedShopItemIds: ['skin:mochi:dracula', 'skin:mochi:dracula', null],
      rewardedItemIds: ['old', 'old', '', null],
      recentRewards: [
        { id: 'valid', sourceId: 'reward:valid', sourceType: 'task', xp: 4, gold: 1, earnedAt: '2026-02-02' },
        { id: 'bad', sourceId: 'reward:bad', sourceType: 'task', xp: Infinity, gold: 'bad', earnedAt: { invalid: true } },
        { malformed: true },
      ],
      createdAt: 'not-a-date',
    });

    expect(normalized.name).toBe('Mochi');
    expect(normalized.level).toBe(1);
    expect(normalized.xp).toBe(0);
    expect(normalized.gold).toBe(0);
    expect(normalized.ownedCostumes).toEqual(['default', 'dracula']);
    expect(normalized.purchasedShopItemIds).toEqual(['skin:mochi:dracula']);
    expect(normalized.costume).toBe('default');
    expect(normalized.recentRewards).toHaveLength(2);
    expect(normalized.recentRewards.every(reward => Number.isFinite(reward.xp) && Number.isFinite(reward.gold))).toBe(true);
    expect(normalized.createdAt.getTime()).toBe(0);
    expect(normalizePet(normalized)).toEqual(normalized);
  });

  it('preserves an old costume-only record while rejecting stale equipped state in a current shape', () => {
    expect(normalizePet({ costume: 'wizard' }).ownedCostumes).toEqual(['default', 'wizard']);
    expect(normalizePet({ costume: 'wizard', ownedCostumes: ['default'], purchasedShopItemIds: [] }).costume)
      .toBe('default');
  });
});

describe('Audit #16 Pet purchase and ownership integrity', () => {
  it('uses the catalog price and commits balance, ownership, purchase, and equip together', () => {
    const purchase = purchasePetShopState(basePet({ gold: 2 }), 'skin:mochi:wizard', {
      costume: 'wizard',
    });

    expect(purchase.status).toBe('purchased');
    if (purchase.status !== 'purchased') return;
    expect(purchase.price).toBe(PET_SHOP_CATALOG.find(item => item.id === 'wizard')?.price);
    expect(purchase.pet.gold).toBe(1);
    expect(purchase.pet.ownedCostumes).toContain('wizard');
    expect(purchase.pet.purchasedShopItemIds).toContain('skin:mochi:wizard');
    expect(purchase.pet.costume).toBe('wizard');
  });

  it('does not charge insufficient or invalid purchases and does not double-charge owned items', () => {
    const insufficient = purchasePetShopState(basePet({ gold: 0 }), 'skin:mochi:wizard', { costume: 'wizard' });
    expect(insufficient.status).toBe('insufficient-funds');
    if (insufficient.status === 'insufficient-funds') expect(insufficient.pet.gold).toBe(0);

    const invalid = purchasePetShopState(basePet({ gold: 99 }), 'skin:mochi:wizard', { costume: 'dracula' });
    expect(invalid.status).toBe('invalid');

    const alreadyOwned = purchasePetShopState(
      basePet({ gold: 9, ownedCostumes: ['default', 'wizard'], purchasedShopItemIds: [] }),
      'skin:mochi:wizard',
      { costume: 'wizard' },
    );
    expect(alreadyOwned.status).toBe('already-owned');
    if (alreadyOwned.status === 'already-owned') expect(alreadyOwned.pet.gold).toBe(9);
  });

  it('conservatively reconciles either legacy ledger direction without minting a second charge', () => {
    const ownershipOnly = normalizePet({
      gold: 4,
      costume: 'wizard',
      ownedCostumes: ['default', 'wizard'],
      purchasedShopItemIds: [],
    });
    expect(ownershipOnly.ownedCostumes).toContain('wizard');
    expect(ownershipOnly.purchasedShopItemIds).toContain('skin:mochi:wizard');
    expect(purchasePetShopState(ownershipOnly, 'skin:mochi:wizard', { costume: 'wizard' }).status)
      .toBe('already-owned');

    const purchaseOnly = normalizePet({
      gold: 4,
      costume: 'default',
      ownedCostumes: ['default'],
      purchasedShopItemIds: ['skin:mochi:wizard'],
    });
    expect(purchaseOnly.ownedCostumes).toContain('wizard');
    expect(purchaseOnly.costume).toBe('default');
    expect(purchasePetShopState(purchaseOnly, 'skin:mochi:wizard', { costume: 'wizard' }).status)
      .toBe('already-owned');
  });
});

describe('Audit #16 permanent legacy reward idempotency', () => {
  it('deduplicates one-time sources permanently beyond the old 500-entry boundary', () => {
    let pet = basePet();
    const oldSource = 'achievement:old';
    pet = normalizePet({ ...pet, rewardedItemIds: [oldSource] });

    for (let index = 0; index < 501; index += 1) {
      pet = applyPetReward(pet, {
        sourceId: `routine:daily:${index}`,
        sourceType: 'routine',
        label: `Routine ${index}`,
        xp: 1,
        gold: 1,
      })!;
    }

    const beforeReplay = { xp: pet.xp, gold: pet.gold, level: pet.level };
    expect(applyPetReward(pet, {
      sourceId: oldSource,
      sourceType: 'achievement',
      label: 'Old achievement',
      xp: 100,
      gold: 100,
    })).toBeNull();
    expect({ xp: pet.xp, gold: pet.gold, level: pet.level }).toEqual(beforeReplay);
    expect(pet.rewardedItemIds).toHaveLength(502);
  });

  it('keeps legitimate repeatable occurrences distinct while blocking the same occurrence', () => {
    const first = applyPetReward(basePet(), {
      sourceId: 'check-in:2026-08-01',
      sourceType: 'check-in',
      label: 'Daily check-in',
      xp: 10,
      gold: 0,
    })!;
    const second = applyPetReward(first, {
      sourceId: 'check-in:2026-08-02',
      sourceType: 'check-in',
      label: 'Daily check-in',
      xp: 10,
      gold: 0,
    });
    expect(second).not.toBeNull();
    expect(applyPetReward(first, {
      sourceId: 'check-in:2026-08-01',
      sourceType: 'check-in',
      label: 'Daily check-in',
      xp: 10,
      gold: 0,
    })).toBeNull();
  });
});

describe('Audit #16 profile/import/Mastery boundaries', () => {
  it('normalizes imported profiles before persistence and keeps profiles isolated', () => {
    const prepared = prepareImport({
      format: 'caizen-data',
      version: 3,
      data: {
        currentProfileId: 'pet-a',
        profiles: [baseProfile('pet-a', { gold: 'Infinity', costume: 'wizard' })],
      },
    });

    expect(prepared.report.canImport).toBe(true);
    const importedPet = prepared.state.profiles[0].pet!;
    expect(importedPet.gold).toBe(0);
    expect(importedPet.costume).toBe('wizard');
    expect(importedPet.ownedCostumes).toContain('wizard');

    const current = {
      currentProfileId: 'pet-b',
      profiles: [baseProfile('pet-b', basePet({ gold: 8, costume: 'dracula', ownedCostumes: ['default', 'dracula'] })) as unknown as Profile],
    };
    const replaced = createProfilesForImport(prepared.state, current, 'replace');
    expect(replaced.profiles[0].id).toBe('pet-a');
    expect((replaced.profiles[0].pet as PetCompanionData).gold).toBe(0);
    expect(replaced.profiles.some(profile => profile.id === 'pet-b')).toBe(false);
    expect(current.profiles[0].pet?.gold).toBe(8);
  });

  it('preserves canonical Mastery state while normalizing legacy Pet state', () => {
    const normalized = normalizeAndMigrateProfile(
      baseProfile('mastery-boundary', {
        gold: 'bad',
        xp: Number.POSITIVE_INFINITY,
        costume: 'wizard',
        ownedCostumes: ['default'],
      }),
      adapters,
    );

    expect(normalized.activeMasteryCompanion).toBe('reflection');
    expect(normalized.categoryXpEvents).toEqual([]);
    expect(normalized.masteryBondXpEvents).toEqual([]);
    expect(normalized.pet?.gold).toBe(0);
    expect(normalized.pet?.xp).toBe(0);
  });
});

describe('Audit #16 Pet accessibility contract', () => {
  it('exposes transient Mochi reaction state without active reward controls', () => {
    const source = readFileSync(
      resolve(__dirname, '..', 'components/pets/PetCompanion.tsx'),
      'utf8',
    );
    expect(source).toContain('MochiReaction');
    expect(source).toContain('mochiReaction');
    expect(source).toContain('pet-sprite-reaction-happy');
    expect(source).toContain('pet-sprite-reaction-focus');
    expect(source).not.toContain('role="tablist"');
    expect(source).not.toContain('purchasePetShopItem');
  });
});
