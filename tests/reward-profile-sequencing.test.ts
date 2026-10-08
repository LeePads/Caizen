import { describe, expect, it } from 'vitest';

import { collectMediaReferenceIds } from '@/lib/storage/media-references';
import { applyPetRewardToProfiles } from '@/lib/rewards/action-outcome';
import { normalizePet } from '@/lib/pets/normalization';
import type { PetCompanionData, Profile, Wallet } from '@/lib/types';

const basePet = (): PetCompanionData => normalizePet({
  name: 'Mochi',
  level: 1,
  xp: 0,
  gold: 0,
  rewardedItemIds: [],
  recentRewards: [],
});

const profile = (overrides: Partial<Profile> = {}) => ({
  id: 'profile-balance',
  name: 'Balance test',
  pet: basePet(),
  wallets: [],
  transactions: [],
  inventoryItems: [],
  wishlistItems: [],
  upcomingMoneyItems: [],
  balanceProjectionRows: [],
  balanceCheckIns: [],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
}) as Profile;

const wallet = (overrides: Partial<Wallet> = {}) => ({
  id: 'wallet',
  name: 'Wallet',
  balance: 0,
  color: '#000000',
  type: 'free_spending' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
}) as Wallet;

const reward = (sourceId: string) => ({
  sourceId,
  sourceType: 'check-in' as const,
  label: 'Balance action',
  xp: 10,
  gold: 2,
});

describe('Balance reward/profile sequencing', () => {
  it('retains reconciled wallet balances and the first check-in snapshot', () => {
    const latest = profile({
      wallets: [wallet({ id: 'wallet-1', name: 'Cash', balance: 125 })],
      balanceCheckIns: [{
        id: 'check-in-1',
        weekKey: '2026-W35',
        completedAt: new Date('2026-08-31T00:00:00.000Z'),
        walletBalances: [{ walletId: 'wallet-1', name: 'Cash', balance: 125 }],
        totalWalletBalance: 125,
        spendableBalance: 125,
        protectedBalance: 0,
        remainingCommitments: 0,
        safeToSpend: 125,
      }],
    });

    const result = applyPetRewardToProfiles([latest], latest.id, reward('check-in-1'));
    const next = result.profiles[0];

    expect(next.wallets).toEqual(latest.wallets);
    expect(next.balanceCheckIns).toEqual(latest.balanceCheckIns);
    expect(next.pet?.rewardedItemIds).toContain('check-in-1');
  });

  it('retains the first forecast item while awarding its reward', () => {
    const latest = profile({
      balanceProjectionRows: [{
        id: 'forecast-1',
        label: 'Rent estimate',
        amount: '500',
        allocated: '500',
        type: 'expense',
      }],
    });

    const result = applyPetRewardToProfiles([latest], latest.id, reward('forecast-1'));
    expect(result.profiles[0].balanceProjectionRows).toEqual(latest.balanceProjectionRows);
    expect(result.profiles[0].pet?.rewardedItemIds).toContain('forecast-1');
  });

  it('retains a new wallet image and keeps its media reference live', () => {
    const latest = profile({
      wallets: [wallet({
        id: 'wallet-new',
        name: 'New wallet',
        balance: 50,
        avatarAssetId: 'asset-wallet-new',
      })],
    });

    const result = applyPetRewardToProfiles([latest], latest.id, reward('wallet-new'));
    const next = result.profiles[0];

    expect(next.wallets[0]).toEqual(latest.wallets[0]);
    expect(collectMediaReferenceIds(next).has('asset-wallet-new')).toBe(true);
    expect(next.pet?.rewardedItemIds).toContain('wallet-new');
  });

  it('retains a wallet goal threshold edit while awarding its reward', () => {
    const latest = profile({
      wallets: [wallet({ id: 'wallet-goal', name: 'Savings', balance: 80, goalTarget: 250 })],
    });

    const result = applyPetRewardToProfiles([latest], latest.id, reward('wallet-goal'));
    expect(result.profiles[0].wallets[0].goalTarget).toBe(250);
    expect(result.profiles[0].pet?.rewardedItemIds).toContain('wallet-goal');
  });
});
