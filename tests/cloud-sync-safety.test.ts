import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearCloudProfileLocalState,
  isCloudBootstrapPristine,
  isCloudBackupBaselineChangedError,
} from '@/lib/cloud-backup';

describe('Cloud Sync safety markers', () => {
  beforeEach(() => {
    Object.assign(globalThis, { window: globalThis });
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    delete (globalThis as { window?: unknown }).window;
  });

  it('clears only the deleted profile local Cloud state', () => {
    localStorage.setItem('life-manager-local-modified-at:deleted', '1');
    localStorage.setItem('cloud-auto-backup:deleted', 'true');
    localStorage.setItem('cloud-sync-marker:user-1:deleted', '{}');
    localStorage.setItem('cloud-auto-backup:kept', 'true');

    clearCloudProfileLocalState('deleted');

    expect(localStorage.getItem('life-manager-local-modified-at:deleted')).toBeNull();
    expect(localStorage.getItem('cloud-auto-backup:deleted')).toBeNull();
    expect(localStorage.getItem('cloud-sync-marker:user-1:deleted')).toBeNull();
    expect(localStorage.getItem('cloud-auto-backup:kept')).toBe('true');
  });

  it('identifies a compare-and-swap baseline rejection', () => {
    const error = new Error('The Cloud snapshot changed while this backup was uploading.');
    error.name = 'CloudBackupBaselineChangedError';

    expect(isCloudBackupBaselineChangedError(error)).toBe(true);
    expect(isCloudBackupBaselineChangedError(new Error('network failed'))).toBe(false);
  });

  it('does not treat edited profile settings as a pristine bootstrap workspace', () => {
    const state = {
      currentProfileId: 'local',
      profiles: [{
        id: 'local',
        name: 'My Profile',
        baseCurrency: 'PHP',
        currency: 'PHP',
        pet: {
          name: 'Mochi',
          activePetId: 'mochi',
          costume: 'default',
          ownedPetIds: ['mochi'],
          ownedCostumes: ['default'],
          purchasedShopItemIds: [],
          level: 1,
          xp: 0,
          gold: 0,
          showFloatingPet: true,
          rewardedItemIds: [],
          recentRewards: [],
        },
        health: { weightEntries: [], nutritionEntries: [], foodEntries: [], foodTemplates: [], activityEntries: [], noXTrackers: [] },
        createdAt: new Date(),
      }],
    } as any;

    expect(isCloudBootstrapPristine(state)).toBe(true);
    expect(isCloudBootstrapPristine({
      ...state,
      profiles: [{ ...state.profiles[0], name: 'Cai' }],
    })).toBe(false);
    expect(isCloudBootstrapPristine({
      ...state,
      profiles: [{ ...state.profiles[0], health: { ...state.profiles[0].health, targetCalories: 2100 } }],
    })).toBe(false);
    expect(isCloudBootstrapPristine({
      ...state,
      profiles: [state.profiles[0], { ...state.profiles[0], id: 'second' }],
    })).toBe(false);
  });
});
