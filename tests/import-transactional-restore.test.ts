import { afterEach, describe, expect, it } from 'vitest';
import { createProfilesForImport, parseAndPrepareImport } from '@/lib/storage/import-integrity';
import { loadAppState, replaceAppState, saveAppState, type StoredAppState } from '@/lib/storage/app-repository';
import {
  getPreImportRecovery,
  restoreDataOnlyImport,
  restorePreImportSnapshot,
} from '@/lib/storage/backup-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import { getMediaAsset, getMediaBlob, putMediaAsset, putMediaBlob } from '@/lib/storage/media-repository';
import { mediaStorage } from '@/lib/storage/media-storage';

const profile = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  createdAt: '2024-01-01T08:00:00+08:00',
  wallets: [],
  transactions: [],
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
  balanceCheckIns: [],
  health: {
    weightEntries: [],
    nutritionEntries: [],
    foodEntries: [],
    foodTemplates: [],
    activityEntries: [],
    noXTrackers: [],
  },
  ...overrides,
});

const envelope = (profiles: unknown[], currentProfileId = 'p1') =>
  JSON.stringify({
    format: 'caizen-data',
    version: 3,
    createdAt: '2026-07-30T12:00:00+08:00',
    data: { profiles, currentProfileId },
  });

 
const asState = (profiles: unknown[]): StoredAppState => ({ profiles: profiles as any, currentProfileId: 'p1' });

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('merge resolves conflicts by newest updatedAt', () => {
  const local = asState([
    profile('p1', {
      transactions: [
        { id: 'tx-1', date: '2026-03-05', amount: 100, updatedAt: '2026-07-20T00:00:00.000Z' },
        { id: 'tx-2', date: '2026-03-06', amount: 200, updatedAt: '2026-07-20T00:00:00.000Z' },
        { id: 'tx-3', date: '2026-03-07', amount: 300 },
      ],
    }),
  ]);

  it('keeps the imported row when it is newer', () => {
    const imported = asState([
      profile('p1', {
        transactions: [
          { id: 'tx-1', date: '2026-03-05', amount: 999, updatedAt: '2026-07-25T00:00:00.000Z' },
        ],
      }),
    ]);
    const merged = createProfilesForImport(imported, local, 'merge');
     
    const rows = (merged.profiles[0] as any).transactions;
    expect(rows.find((row: { id: string }) => row.id === 'tx-1').amount).toBe(999);
  });

  it('keeps the local row when the imported one is older', () => {
    const imported = asState([
      profile('p1', {
        transactions: [
          { id: 'tx-2', date: '2026-03-06', amount: 111, updatedAt: '2026-07-01T00:00:00.000Z' },
        ],
      }),
    ]);
    const merged = createProfilesForImport(imported, local, 'merge');
     
    const rows = (merged.profiles[0] as any).transactions;
    expect(rows.find((row: { id: string }) => row.id === 'tx-2').amount).toBe(200);
  });

  it('keeps the local row on an exact tie', () => {
    const imported = asState([
      profile('p1', {
        transactions: [
          { id: 'tx-1', date: '2026-03-05', amount: 555, updatedAt: '2026-07-20T00:00:00.000Z' },
        ],
      }),
    ]);
    const merged = createProfilesForImport(imported, local, 'merge');
     
    const rows = (merged.profiles[0] as any).transactions;
    expect(rows.find((row: { id: string }) => row.id === 'tx-1').amount).toBe(100);
  });

  it('keeps the local row when neither side has a usable timestamp', () => {
    const imported = asState([
      profile('p1', { transactions: [{ id: 'tx-3', date: '2026-03-07', amount: 777 }] }),
    ]);
    const merged = createProfilesForImport(imported, local, 'merge');
     
    const rows = (merged.profiles[0] as any).transactions;
    expect(rows.find((row: { id: string }) => row.id === 'tx-3').amount).toBe(300);
  });

  it('still adds rows whose IDs do not exist locally', () => {
    const imported = asState([
      profile('p1', { transactions: [{ id: 'tx-new', date: '2026-05-01', amount: 42 }] }),
    ]);
    const merged = createProfilesForImport(imported, local, 'merge');
     
    const rows = (merged.profiles[0] as any).transactions;
    expect(rows).toHaveLength(4);
    expect(rows.find((row: { id: string }) => row.id === 'tx-new').amount).toBe(42);
  });

  it('is idempotent: re-importing the same file changes nothing', () => {
    const imported = asState([
      profile('p1', {
        transactions: [
          { id: 'tx-1', date: '2026-03-05', amount: 999, updatedAt: '2026-07-25T00:00:00.000Z' },
        ],
      }),
    ]);
    const once = createProfilesForImport(imported, local, 'merge');
    const twice = createProfilesForImport(imported, once, 'merge');
    expect(twice.profiles).toEqual(once.profiles);
  });
});

describe('transactional restore and recovery', () => {
  it('preserves real media bytes across a temporary Demo replacement and return', async () => {
    const original = asState([profile('p1')]);
    await saveAppState(original);
    await putMediaAsset({
      id: 'real-photo', profileId: 'p1', ownerType: 'inventory', ownerId: 'item-1',
      role: 'primary', fileName: 'photo.txt', mimeType: 'text/plain', sizeBytes: 5,
      syncStatus: 'local-only', createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    });
    await putMediaBlob('real-photo', new Blob(['photo']), 'full');

    const demo = parseAndPrepareImport(envelope([profile('demo')], 'demo'));
    await restoreDataOnlyImport(demo, 'replace', { preserveExistingMedia: true });
    expect(await getMediaAsset('real-photo')).toBeDefined();
    expect(await getMediaBlob('real-photo', 'full')).toBeDefined();

    await replaceAppState(original);
    expect((await loadAppState())?.profiles[0].id).toBe('p1');
    expect(await getMediaAsset('real-photo')).toBeDefined();
  });

  it('strips data-only media references when importing a new profile', async () => {
    await saveAppState(asState([profile('local-profile')]));
    await putMediaAsset({
      id: 'source-media',
      profileId: 'local-profile',
      ownerType: 'inventory',
      ownerId: 'local-record',
      role: 'primary',
      fileName: 'source.txt',
      mimeType: 'text/plain',
      sizeBytes: 6,
      syncStatus: 'local-only',
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    });
    await putMediaBlob('source-media', new Blob(['source']), 'full');

    const prepared = parseAndPrepareImport(
      envelope([profile('imported-profile', {
        inventoryItems: [{ id: 'imported-record', createdAt: '2026-08-11T00:00:00.000Z', purchaseDate: '2026-08-11', photoAssetIds: ['source-media'] }],
      })], 'imported-profile'),
    );
    await restoreDataOnlyImport(prepared, 'new-profiles');

    const restored = await loadAppState();
    const imported = restored?.profiles.find(item => item.id === 'imported-profile') as any;
    expect(imported.inventoryItems[0].photoAssetIds).toEqual([]);
    await expect(mediaStorage.read('source-media', 'imported-profile')).rejects.toThrow(/another profile/);
  });

  it('writes nothing when validation fails', async () => {
    await saveAppState(asState([profile('p1', { transactions: [{ id: 'keep', date: '2026-01-01' }] })]));

    const prepared = parseAndPrepareImport(
      envelope([profile('p9', { transactions: [{ id: 'bad', date: { nope: 1 } }] })], 'p9'),
    );
    expect(prepared.report.canImport).toBe(false);

    await expect(restoreDataOnlyImport(prepared, 'replace')).rejects.toThrow();

    const after = await loadAppState();
    expect(after?.profiles.map((p) => p.id)).toEqual(['p1']);
     
    expect((after?.profiles[0] as any).transactions[0].id).toBe('keep');
  });

  it('captures a recovery snapshot and can roll back a successful import', async () => {
    await saveAppState(asState([profile('p1', { transactions: [{ id: 'original', date: '2026-01-01' }] })]));
    expect(await getPreImportRecovery()).toBeNull();

    const prepared = parseAndPrepareImport(
      envelope([profile('p2', { transactions: [{ id: 'imported', date: '2026-02-02' }] })], 'p2'),
    );
    await restoreDataOnlyImport(prepared, 'replace');

    const replaced = await loadAppState();
    expect(replaced?.profiles.map((p) => p.id)).toEqual(['p2']);

    const snapshot = await getPreImportRecovery();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.profileCount).toBe(1);

    await restorePreImportSnapshot();
    const rolledBack = await loadAppState();
    expect(rolledBack?.profiles.map((p) => p.id)).toEqual(['p1']);
     
    expect((rolledBack?.profiles[0] as any).transactions[0].id).toBe('original');
  });

  it('refuses to roll back when no snapshot exists', async () => {
    await saveAppState(asState([profile('p1')]));
    await expect(restorePreImportSnapshot()).rejects.toThrow(/No recovery snapshot/);
  });

  it('import as new profile keeps existing profiles and remaps a colliding id', async () => {
    await saveAppState(asState([profile('p1', { transactions: [{ id: 'local', date: '2026-01-01' }] })]));

    const prepared = parseAndPrepareImport(
      envelope([profile('p1', { transactions: [{ id: 'incoming', date: '2026-02-02' }] })]),
      ['p1'],
    );
    await restoreDataOnlyImport(prepared, 'new-profiles');

    const after = await loadAppState();
    expect(after?.profiles).toHaveLength(2);
    expect(after?.profiles[0].id).toBe('p1');
    expect(after?.profiles[1].id).not.toBe('p1');
    expect(after?.profiles[1].name).toContain('Imported');
  });
});
