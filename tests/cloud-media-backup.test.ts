import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSupabaseClient,
  getCaizenProfileBackup,
  listCaizenMediaAssets,
  upsertCaizenMediaAsset,
  upsertCaizenProfileBackup,
  uploadCaizenPrivateMedia,
  deleteCaizenPrivateMedia,
  loadAppState,
  createDataOnlyExport,
  putStoreValue,
  listMediaAssets,
  putMediaAsset,
  readMedia,
  validateMediaBlob,
  buildCaizenMediaStoragePath,
  caizenPrivateMediaExists,
} = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  getCaizenProfileBackup: vi.fn(),
  listCaizenMediaAssets: vi.fn(),
  upsertCaizenMediaAsset: vi.fn(),
  upsertCaizenProfileBackup: vi.fn(),
  uploadCaizenPrivateMedia: vi.fn(),
  deleteCaizenPrivateMedia: vi.fn(),
  loadAppState: vi.fn(),
  createDataOnlyExport: vi.fn(),
  putStoreValue: vi.fn(),
  listMediaAssets: vi.fn(),
  putMediaAsset: vi.fn(),
  readMedia: vi.fn(),
  validateMediaBlob: vi.fn(),
  buildCaizenMediaStoragePath: vi.fn(
    (userId: string, profileId: string, mediaAssetId: string, mimeType: string) =>
      `${userId}/${profileId}/${mediaAssetId}/${mediaAssetId}.${mimeType === 'image/png' ? 'png' : 'bin'}`,
  ),
  caizenPrivateMediaExists: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient,
  getCloudAuthRedirectUrl: vi.fn(() => 'https://example.test/auth'),
}));

vi.mock('@/lib/caizen-cloud-repository', () => ({
  buildCaizenMediaStoragePath,
  caizenPrivateMediaExists,
  listCaizenPrivateMediaFolder: async (path: string, expected: unknown) => await caizenPrivateMediaExists(path, expected) ? new Set([path.split('/').at(-1)]) : new Set(),
  listCaizenSnapshotMedia: async () => {
    const backup = await getCaizenProfileBackup();
    return backup ? [{ ...backup, media: backup.data.media }] : [];
  },
  CloudBackupBaselineChangedError: class CloudBackupBaselineChangedError extends Error {},
  deleteCaizenMediaAssetMetadata: vi.fn(),
  deleteCaizenPrivateMedia,
  deleteCaizenProfileBackup: vi.fn(),
  downloadCaizenPrivateMedia: vi.fn(),
  getCaizenProfileBackup,
  getCaizenProfileBackupMetadata: (...args: unknown[]) => getCaizenProfileBackup(...args),
  listAllCaizenMediaAssets: vi.fn(),
  listCaizenMediaAssets,
  listCaizenProfileBackups: vi.fn(),
  softDeleteCaizenMediaAsset: vi.fn(),
  uploadCaizenPrivateMedia,
  upsertCaizenMediaAsset,
  upsertCaizenProfileBackup,
}));

vi.mock('@/lib/storage/app-repository', () => ({ loadAppState }));
vi.mock('@/lib/storage/backup-repository', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/storage/backup-repository')>();
  return { createDataOnlyExport, createDataOnlyEnvelope: actual.createDataOnlyEnvelope };
});
vi.mock('@/lib/storage/database', () => ({ getStoreValue: vi.fn(), putStoreValue }));
vi.mock('@/lib/storage/media-repository', () => ({ listMediaAssets, putMediaAsset }));
vi.mock('@/lib/storage/media-storage', () => ({
  mediaStorage: {
    read: readMedia,
    restore: vi.fn(),
  },
}));
vi.mock('@/lib/storage/media-validation', () => ({ validateMediaBlob }));

import {
  backupLocalDataToCloud,
  getPendingCloudMediaCount,
} from '@/lib/cloud-backup';
import { getCloudRecoveryFingerprint } from '@/lib/cloud-recovery-state';

type TestAsset = {
  id: string;
  profileId: string;
  ownerType: 'inventory';
  ownerId: string;
  role: 'primary';
  fileName: string;
  mimeType: 'image/png';
  sizeBytes: number;
  checksum: string;
  remotePath?: string;
  syncStatus: 'pending' | 'synced';
  createdAt: string;
  updatedAt: string;
};

const profile = {
  id: 'profile-1',
  name: 'Profile One',
  photoAssetIds: ['media-1', 'media-2'],
  inventoryItems: [],
  wishlistItems: [],
};

const profileB = {
  id: 'profile-2',
  name: 'Profile Two',
  photoAssetIds: ['media-b'],
  inventoryItems: [],
  wishlistItems: [],
};

const asset = (id: string, profileId = 'profile-1'): TestAsset => ({
  id,
  profileId,
  ownerType: 'inventory',
  ownerId: `record-${id}`,
  role: 'primary',
  fileName: `${id}.png`,
  mimeType: 'image/png',
  sizeBytes: 12,
  checksum: `checksum-${id}`,
  syncStatus: 'pending',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
});

afterEach(() => vi.unstubAllGlobals());

describe('Cloud managed media backup', () => {
  let localAssets: Map<string, TestAsset>;
  let remoteAssets: Array<Record<string, unknown>>;
  let cloudBackup: Record<string, unknown> | null;
  let failedIds: Set<string>;
  let uploadedPaths: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal('window', { localStorage, dispatchEvent: vi.fn() });
    localAssets = new Map([
      ['media-1', asset('media-1')],
      ['media-2', asset('media-2')],
      ['media-b', asset('media-b', 'profile-2')],
    ]);
    remoteAssets = [];
    cloudBackup = null;
    failedIds = new Set();
    uploadedPaths = [];

    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    });
    loadAppState.mockResolvedValue({
      profiles: [profile, profileB],
      currentProfileId: profile.id,
    });
    listMediaAssets.mockImplementation(async (profileId?: string) =>
      [...localAssets.values()].filter(assetItem => !profileId || assetItem.profileId === profileId),
    );
    putMediaAsset.mockImplementation(async (next: TestAsset) => {
      localAssets.set(next.id, next);
    });
    readMedia.mockImplementation(async (id: string) =>
      new Blob([`bytes-${id}`], { type: 'image/png' }),
    );
    validateMediaBlob.mockResolvedValue(undefined);
    getCaizenProfileBackup.mockImplementation(async () => cloudBackup);
    listCaizenMediaAssets.mockImplementation(async () => [...remoteAssets]);
    uploadCaizenPrivateMedia.mockImplementation(async (path: string) => {
      const mediaId = path.split('/')[2];
      if (failedIds.has(mediaId)) throw new Error(`Invalid key: ${path}`);
      uploadedPaths.push(path);
    });
    deleteCaizenPrivateMedia.mockResolvedValue(undefined);
    upsertCaizenMediaAsset.mockImplementation(async (input: Record<string, unknown>) => {
      const next = {
        id: input.id,
        userId: 'user-1',
        profileId: input.profileId,
        recordType: input.recordType,
        recordId: input.recordId,
        role: input.role,
        storagePath: input.storagePath,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum ?? null,
        width: null,
        height: null,
        createdAt: '2026-08-11T00:00:00.000Z',
        updatedAt: '2026-08-11T00:01:00.000Z',
        deletedAt: null,
      };
      remoteAssets.push(next);
      return next;
    });
    upsertCaizenProfileBackup.mockImplementation(async (input: Record<string, unknown>) => {
      cloudBackup = {
        id: 'backup-1',
        userId: 'user-1',
        profileId: input.profileId,
        schemaVersion: 3,
        data: input.data,
        createdAt: '2026-08-11T00:00:00.000Z',
        updatedAt: `2026-08-11T00:0${cloudBackup ? '2' : '1'}:00.000Z`,
      };
      return cloudBackup;
    });
    createDataOnlyExport.mockImplementation(async () => ({
      text: async () => JSON.stringify({
        format: 'caizen-data',
        version: 3,
        createdAt: '2026-08-11T00:00:00.000Z',
        data: { profiles: [profile, profileB], currentProfileId: profile.id },
        media: [...localAssets.values()],
      }),
    }));
  });

  it('keeps pending media profile-scoped', async () => {
    expect(await getPendingCloudMediaCount('profile-1')).toBe(2);
    expect(await getPendingCloudMediaCount('profile-2')).toBe(1);
  });

  it('rejects a reviewed device-version publish when Cloud changed before it started', async () => {
    const reviewed = {
      id: 'backup-reviewed',
      userId: 'user-1',
      profileId: 'profile-1',
      schemaVersion: 3,
      data: { profiles: [profile], currentProfileId: profile.id },
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:01:00.000Z',
    };
    cloudBackup = {
      ...reviewed,
      id: 'backup-newer',
      updatedAt: '2026-08-11T00:02:00.000Z',
    };
    const fingerprint = getCloudRecoveryFingerprint({
      backupId: reviewed.id,
      profileId: reviewed.profileId,
      schemaVersion: reviewed.schemaVersion,
      updatedAt: reviewed.updatedAt,
    });

    await expect(backupLocalDataToCloud({
      force: true,
      mode: 'manual',
      expectedUserId: reviewed.userId,
      expectedProfileId: reviewed.profileId,
      expectedBackupId: reviewed.id,
      expectedUpdatedAt: reviewed.updatedAt,
      expectedFingerprint: fingerprint,
    })).rejects.toThrow('changed after Review');

    expect(uploadCaizenPrivateMedia).not.toHaveBeenCalled();
    expect(upsertCaizenProfileBackup).not.toHaveBeenCalled();
  });

  it('keeps a partial upload local and retries only the failed media', async () => {
    failedIds.add('media-2');

    const partial = await backupLocalDataToCloud({ force: true, mode: 'manual' });

    expect(partial.status).toBe('partial');
    expect(partial.failedMedia).toHaveLength(1);
    expect(partial.failedMedia[0].mediaAssetId).toBe('media-2');
    expect(uploadedPaths).toHaveLength(1);
    expect(uploadedPaths[0]).toMatch(/^user-1\/profile-1\/media-1\/media-1\.staged-[0-9a-f-]+\.png$/);
    expect(localAssets.get('media-1')?.syncStatus).toBe('synced');
    expect(localAssets.get('media-2')?.syncStatus).toBe('pending');
    expect(localAssets.has('media-2')).toBe(true);
    expect(upsertCaizenMediaAsset).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'media-2' }));
    expect(deleteCaizenPrivateMedia).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/profile-1\/media-2\/media-2\.staged-[0-9a-f-]+\.png$/),
      { profileId: 'profile-1', mediaAssetId: 'media-2' },
    );
    expect(uploadedPaths.every(path => !path.includes('media-b'))).toBe(true);
    expect(readMedia).not.toHaveBeenCalledWith('media-b', 'profile-2');
    expect(putMediaAsset).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'media-b' }));

    failedIds.clear();
    const retry = await backupLocalDataToCloud({
      force: true,
      mode: 'manual',
      retryMedia: true,
    });

    expect(retry.status, JSON.stringify(retry.failedMedia)).toBe('success');
    expect(retry.failedMedia).toEqual([]);
    expect(localAssets.get('media-2')?.syncStatus).toBe('synced');
    expect(uploadedPaths).toHaveLength(2);
    expect(uploadedPaths[1]).toMatch(/^user-1\/profile-1\/media-2\/media-2\.staged-[0-9a-f-]+\.png$/);
    expect(uploadedPaths.filter(path => path.includes('/media-1/'))).toHaveLength(1);
  });

  it('rejects overlapping backup operations without deleting the winning snapshot media', async () => {
    const baseline = {
      id: 'backup-baseline',
      userId: 'user-1',
      profileId: 'profile-1',
      schemaVersion: 3,
      data: { profiles: [profile], currentProfileId: profile.id },
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:01:00.000Z',
    };
    cloudBackup = baseline;
    localAssets = new Map([['media-1', asset('media-1')]]);
    remoteAssets = [{
      id: 'media-1',
      userId: 'user-1',
      profileId: 'profile-1',
      recordType: 'inventory',
      recordId: 'record-media-1',
      role: 'primary',
      storagePath: 'user-1/profile-1/media-1/media-1.png',
      originalName: 'media-1.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      checksum: 'old-checksum',
      width: null,
      height: null,
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:01:00.000Z',
      deletedAt: null,
    }];
    caizenPrivateMediaExists.mockResolvedValue(true);
    upsertCaizenProfileBackup.mockImplementation(async (input: Record<string, unknown>) => {
      cloudBackup = {
        ...baseline,
        data: input.data,
        id: 'backup-winner',
        updatedAt: '2026-08-11T00:02:00.000Z',
      };
      return cloudBackup;
    });

    const outcomes = await Promise.allSettled([
      backupLocalDataToCloud({ force: true, mode: 'manual' }),
      backupLocalDataToCloud({ force: true, mode: 'manual' }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(upsertCaizenMediaAsset).toHaveBeenCalledTimes(1);
    const committed = remoteAssets.filter((asset) => String(asset.storagePath).includes('.staged-'));
    expect(committed).toHaveLength(1);
    const winnerPath = String((committed[0] as Record<string, unknown>).storagePath);
    expect(winnerPath).toMatch(/\.staged-[0-9a-f-]+\.png$/);
    const rejected = outcomes.find(outcome => outcome.status === 'rejected');
    expect(rejected?.reason.message).toContain('Cloud Backup is busy');
    expect(uploadedPaths).toEqual([winnerPath]);
    expect(deleteCaizenPrivateMedia.mock.calls.some(([path]) => path === winnerPath)).toBe(false);
  });

  it('cleans unpublished staged objects after a snapshot CAS loss', async () => {
    localAssets = new Map([['media-1', asset('media-1')]]);
    upsertCaizenProfileBackup.mockRejectedValueOnce(new Error('Cloud backup baseline changed.'));
    await expect(backupLocalDataToCloud({ force: true, mode: 'manual' })).rejects.toThrow('baseline changed');
    expect(uploadedPaths).toHaveLength(1);
    expect(uploadedPaths[0]).toContain('.staged-');
    expect(deleteCaizenPrivateMedia).toHaveBeenCalledWith(uploadedPaths[0], { profileId: 'profile-1', mediaAssetId: 'media-1' });
    expect(upsertCaizenMediaAsset).not.toHaveBeenCalled();
    expect(cloudBackup).toBeNull();
  });

  it('keeps CAS-winner media snapshot-owned when metadata publication fails', async () => {
    upsertCaizenMediaAsset.mockRejectedValueOnce(new Error('metadata publication unavailable'));

    const result = await backupLocalDataToCloud({ force: true, mode: 'manual' });

    expect(result.status).toBe('partial');
    expect(result.failedMedia).toEqual(expect.arrayContaining([
      expect.objectContaining({ mediaAssetId: 'media-1', operation: 'metadata' }),
    ]));
    const stagedPath = uploadedPaths.find(path => path.includes('/media-1/'));
    expect(stagedPath).toMatch(/\.staged-[0-9a-f-]+\.png$/);
    expect(deleteCaizenPrivateMedia).not.toHaveBeenCalledWith(
      stagedPath,
      { profileId: 'profile-1', mediaAssetId: 'media-1' },
    );
    expect(cloudBackup?.data).toEqual(expect.objectContaining({
      media: expect.arrayContaining([
        expect.objectContaining({ id: 'media-1', remotePath: stagedPath }),
      ]),
    }));
    const localUpdate = [...putMediaAsset.mock.calls]
      .map(([value]) => value as TestAsset)
      .find(value => value.id === 'media-1');
    expect(localUpdate).toMatchObject({ syncStatus: 'pending' });
    expect(localUpdate?.remotePath).toBeUndefined();
    expect(localStorage.getItem('cloud-last-successful-backup:profile-1')).toBeNull();
    expect(localStorage.getItem('cloud-last-successful-backup')).toBeNull();
  });

  it('can retry a post-CAS metadata interruption without deleting the first snapshot-owned object', async () => {
    upsertCaizenMediaAsset.mockRejectedValueOnce(new Error('interrupted after CAS'));

    const first = await backupLocalDataToCloud({ force: true, mode: 'manual' });
    expect(first.status).toBe('partial');
    const firstPath = uploadedPaths.find(path => path.includes('/media-1/'));
    expect(firstPath).toBeDefined();

    const second = await backupLocalDataToCloud({ force: true, mode: 'manual' });

    expect(second.status, JSON.stringify(second.failedMedia)).toBe('success');
    const secondPath = uploadedPaths.filter(path => path.includes('/media-1/'))[1];
    expect(secondPath).toBeDefined();
    expect(secondPath).not.toBe(firstPath);
    expect(deleteCaizenPrivateMedia).not.toHaveBeenCalledWith(
      firstPath,
      { profileId: 'profile-1', mediaAssetId: 'media-1' },
    );
    expect(upsertCaizenMediaAsset).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'media-1',
      storagePath: secondPath,
    }));
    expect(localAssets.get('media-1')?.syncStatus).toBe('synced');
  });

  it('repairs unchanged metadata when the full Cloud object is missing', async () => {
    const baseline = {
      id: 'backup-baseline',
      userId: 'user-1',
      profileId: 'profile-1',
      schemaVersion: 3,
      data: { profiles: [profile], currentProfileId: profile.id },
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:01:00.000Z',
    };
    cloudBackup = baseline;
    localAssets = new Map([['media-1', asset('media-1')]]);
    remoteAssets = [{
      id: 'media-1',
      userId: 'user-1',
      profileId: 'profile-1',
      recordType: 'inventory',
      recordId: 'record-media-1',
      role: 'primary',
      storagePath: 'user-1/profile-1/media-1/media-1.png',
      originalName: 'media-1.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      checksum: 'checksum-media-1',
      width: null,
      height: null,
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:01:00.000Z',
      deletedAt: null,
    }];
    caizenPrivateMediaExists.mockResolvedValue(false);

    const result = await backupLocalDataToCloud({ force: true, mode: 'manual' });

    expect(result.status, JSON.stringify(result.failedMedia)).toBe('success');
    expect(upsertCaizenMediaAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: 'media-1',
      storagePath: expect.stringMatching(/\.staged-[0-9a-f-]+\.png$/),
    }));
  });

  it('reuses a verified local remotePath and repairs a missing canonical row after CAS', async () => {
    const verifiedPath = 'user-1/profile-1/media-1/media-1.png';
    const remoteOnly = { ...asset('media-1'), remotePath: verifiedPath, syncStatus: 'synced' as const };
    localAssets = new Map([['media-1', remoteOnly]]);
    readMedia.mockRejectedValue(new Error('local bytes are not present'));
    remoteAssets = [];
    caizenPrivateMediaExists.mockResolvedValue(true);

    const result = await backupLocalDataToCloud({ force: true, mode: 'manual' });

    expect(result.status, JSON.stringify(result.failedMedia)).toBe('success');
    expect(uploadCaizenPrivateMedia).not.toHaveBeenCalled();
    expect(upsertCaizenMediaAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: 'media-1',
      storagePath: verifiedPath,
    }));
    expect(localAssets.get('media-1')?.remotePath).toBe(verifiedPath);
    expect(localAssets.get('media-1')?.syncStatus).toBe('synced');
  });

  it('reports incomplete backup when a missing full object has no recoverable local bytes', async () => {
    const baseline = {
      id: 'backup-baseline',
      userId: 'user-1',
      profileId: 'profile-1',
      schemaVersion: 3,
      data: { profiles: [profile], currentProfileId: profile.id },
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:01:00.000Z',
    };
    cloudBackup = baseline;
    localAssets = new Map([['media-1', asset('media-1')]]);
    remoteAssets = [{
      id: 'media-1',
      userId: 'user-1',
      profileId: 'profile-1',
      recordType: 'inventory',
      recordId: 'record-media-1',
      role: 'primary',
      storagePath: 'user-1/profile-1/media-1/media-1.png',
      originalName: 'media-1.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      checksum: 'checksum-media-1',
      width: null,
      height: null,
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:01:00.000Z',
      deletedAt: null,
    }];
    caizenPrivateMediaExists.mockResolvedValue(false);
    readMedia.mockRejectedValue(new Error('local bytes unavailable'));

    const result = await backupLocalDataToCloud({ force: true, mode: 'manual' });

    expect(result.status).toBe('partial');
    expect(result.failedMedia).toEqual(expect.arrayContaining([
      expect.objectContaining({ mediaAssetId: 'media-1' }),
    ]));
    expect(upsertCaizenMediaAsset).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'media-1' }));
  });
});
