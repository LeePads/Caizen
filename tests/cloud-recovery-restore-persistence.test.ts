import { afterEach, describe, expect, it } from 'vitest';
import { parseAndPrepareImport } from '@/lib/storage/import-integrity';
import { getPreImportRecovery, restoreCloudProfileImport } from '@/lib/storage/backup-repository';
import { loadAppState, saveAppState } from '@/lib/storage/app-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';

const profile = (id: string, name: string, amount: number) => ({
  id,
  name,
  createdAt: '2026-08-01T00:00:00.000Z',
  wallets: [],
  transactions: amount === 0 ? [] : [{ id: `${id}-tx`, date: '2026-08-15', amount, createdAt: '2026-08-15T00:00:00.000Z' }],
  health: {},
});

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('profile-scoped Cloud restore persistence', () => {
  it('removes only a verified placeholder while preserving unrelated profiles', async () => {
    await saveAppState({
      profiles: [
        profile('placeholder', 'My Profile', 0) as any,
        profile('unrelated', 'Other Profile', 15) as any,
      ],
      currentProfileId: 'placeholder',
    });
    const prepared = parseAndPrepareImport(JSON.stringify({
      format: 'caizen-data',
      version: 3,
      createdAt: '2026-08-15T00:00:00.000Z',
      data: {
        profiles: [profile('cloud-profile', 'Recovered Profile', 42)],
        currentProfileId: 'cloud-profile',
      },
    }), ['placeholder', 'unrelated']);

    await restoreCloudProfileImport(prepared, { removeProfileIds: ['placeholder'] });

    const restored = await loadAppState();
    expect(new Set(restored?.profiles.map(item => item.id))).toEqual(new Set(['unrelated', 'cloud-profile']));
    expect(restored?.currentProfileId).toBe('cloud-profile');
    expect((restored?.profiles.find(item => item.id === 'unrelated') as any).transactions).toHaveLength(1);
    expect((restored?.profiles.find(item => item.id === 'cloud-profile') as any).transactions[0].amount).toBe(42);
  });

  it('runs the final fence after recovery is durable and skips replacement when it rejects', async () => {
    const current = {
      profiles: [profile('local', 'Local Profile', 7) as any],
      currentProfileId: 'local',
    };
    await saveAppState(current);
    const prepared = parseAndPrepareImport(JSON.stringify({
      format: 'caizen-data',
      version: 3,
      createdAt: '2026-08-15T00:00:00.000Z',
      data: {
        profiles: [profile('cloud', 'Cloud Profile', 42)],
        currentProfileId: 'cloud',
      },
    }), ['local']);

    await expect(restoreCloudProfileImport(prepared, {
      beforeReplace: async () => {
        expect(await getPreImportRecovery()).not.toBeNull();
        throw new Error('final fence rejected');
      },
    })).rejects.toThrow('final fence rejected');

    expect((await loadAppState())?.profiles[0]?.id).toBe('local');
  });
});
