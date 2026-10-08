import { afterEach, describe, expect, it } from 'vitest';
import { initializeAppStorage } from '@/lib/storage/localstorage-migration';
import { loadAppState } from '@/lib/storage/app-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import {
  LEGACY_RECOVERY_KEY,
  LEGACY_STORAGE_KEY,
} from '@/lib/storage/schema';

const profile = (id: string) => ({
  id,
  name: id,
  wallets: [],
  inventoryItems: [],
  wishlistItems: [],
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
  health: {
    weightEntries: [],
    nutritionEntries: [],
    foodEntries: [],
    foodTemplates: [],
    activityEntries: [],
    noXTrackers: [],
  },
  createdAt: new Date().toISOString(),
});

afterEach(async () => {
  localStorage.clear();
  await resetCaizenDatabaseForTests();
});

describe('legacy localStorage migration', () => {
  it('migrates multiple profiles and retains a recovery copy', async () => {
    const raw = JSON.stringify({
      profiles: [profile('one'), profile('two')],
      currentProfileId: 'two',
    });
    localStorage.setItem(LEGACY_STORAGE_KEY, raw);

    const result = await initializeAppStorage();

    expect(result.migrated).toBe(true);
    expect(result.state?.profiles.map(({ id }) => id)).toEqual(['one', 'two']);
    expect(result.state?.currentProfileId).toBe('two');
    expect(localStorage.getItem(LEGACY_RECOVERY_KEY)).toBe(raw);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(raw);
  });

  it('is idempotent when migration runs again', async () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ profiles: [profile('one')], currentProfileId: 'one' }),
    );
    await initializeAppStorage();
    const second = await initializeAppStorage();

    expect(second.migrated).toBe(false);
    expect((await loadAppState())?.profiles).toHaveLength(1);
  });

  it('rejects corrupt JSON without deleting it', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, '{"profiles":');
    await expect(initializeAppStorage()).rejects.toThrow();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe('{"profiles":');
    expect(localStorage.getItem(LEGACY_RECOVERY_KEY)).toBe('{"profiles":');
  });

  it('skips one invalid profile while preserving valid profiles', async () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ profiles: [profile('valid'), { name: 'broken' }] }),
    );
    const result = await initializeAppStorage();
    expect(result.state?.profiles.map(({ id }) => id)).toEqual(['valid']);
  });
});
