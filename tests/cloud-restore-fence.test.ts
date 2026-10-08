import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  getCaizenProfileBackup: vi.fn(),
  listCaizenMediaAssets: vi.fn(),
  downloadCaizenPrivateMedia: vi.fn(),
  loadAppState: vi.fn(),
  prepareImport: vi.fn(),
  restoreCloudProfileImport: vi.fn(),
  mediaStorageRestore: vi.fn(),
  getMediaAsset: vi.fn(),
  putMediaAsset: vi.fn(),
  caizenPrivateMediaExists: vi.fn(),
  mediaSession: (() => {
    let generation = 0;
    let activeUserId: string | null = null;
    let suspended = false;
    class TestMediaSessionInvalidatedError extends Error {
      constructor() {
        super('The Cloud media session changed before the media operation completed.');
        this.name = 'MediaSessionInvalidatedError';
      }
    }
    const setMediaSessionUser = vi.fn((userId: string | null) => {
      suspended = false;
      if (activeUserId === userId) return;
      generation += 1;
      activeUserId = userId;
    });
    return {
      invalidateMediaSession: vi.fn(async () => {
        generation += 1;
        activeUserId = null;
        suspended = true;
      }),
      isMediaSessionSuspended: vi.fn(() => suspended),
      setMediaSessionUser,
      getMediaSessionUserId: vi.fn(() => activeUserId),
      getMediaSessionToken: vi.fn((userId: string) => {
        setMediaSessionUser(userId);
        return { generation, userId };
      }),
      isMediaSessionCurrent: vi.fn((token: { generation: number; userId: string }) =>
        !suspended && token.generation === generation && token.userId === activeUserId),
      withMediaSessionCommit: vi.fn(async (token: { generation: number; userId: string }, operation: () => Promise<unknown>) => {
        if (suspended || token.generation !== generation || token.userId !== activeUserId) {
          throw new TestMediaSessionInvalidatedError();
        }
        return operation();
      }),
      MediaSessionInvalidatedError: TestMediaSessionInvalidatedError,
    };
  })(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
  getCloudAuthRedirectUrl: vi.fn(() => 'https://example.test/auth'),
}));

vi.mock('@/lib/caizen-cloud-repository', () => ({
  buildCaizenMediaStoragePath: vi.fn(() => 'user-1/profile-1/media-1/media-1.png'),
  CloudBackupBaselineChangedError: class CloudBackupBaselineChangedError extends Error {},
  deleteCaizenMediaAssetMetadata: vi.fn(),
  deleteCaizenPrivateMedia: vi.fn(),
  downloadCaizenPrivateMedia: mocks.downloadCaizenPrivateMedia,
  deleteCaizenProfileBackup: vi.fn(),
  getCaizenProfileBackupMetadata: (...args: unknown[]) => mocks.getCaizenProfileBackup(...args),
  getCaizenProfileBackup: mocks.getCaizenProfileBackup,
  caizenPrivateMediaExists: mocks.caizenPrivateMediaExists,
  invalidateCaizenCloudUserCache: vi.fn(),
  listAllCaizenMediaAssets: vi.fn().mockResolvedValue([]),
  listCaizenMediaAssets: mocks.listCaizenMediaAssets,
  listCaizenProfileBackups: vi.fn().mockResolvedValue([]),
  softDeleteCaizenMediaAsset: vi.fn(),
  uploadCaizenPrivateMedia: vi.fn(),
  upsertCaizenMediaAsset: vi.fn(),
  upsertCaizenProfileBackup: vi.fn(),
}));

vi.mock('@/lib/storage/app-repository', () => ({
  loadAppState: mocks.loadAppState,
  saveAppState: vi.fn(),
}));

vi.mock('@/lib/storage/backup-repository', () => ({
  createDataOnlyExport: vi.fn(),
  restoreCloudProfileImport: mocks.restoreCloudProfileImport,
}));

vi.mock('@/lib/storage/import-integrity', () => ({
  prepareImport: mocks.prepareImport,
}));

vi.mock('@/lib/storage/database', () => ({
  getStoreValue: vi.fn(),
  putStoreValue: vi.fn(),
}));

vi.mock('@/lib/storage/media-repository', () => ({
  getMediaAsset: mocks.getMediaAsset,
  listMediaAssets: vi.fn().mockResolvedValue([]),
  putMediaAsset: mocks.putMediaAsset,
}));

vi.mock('@/lib/storage/media-storage', () => ({
  mediaStorage: {
    read: vi.fn(),
    restore: mocks.mediaStorageRestore,
    save: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/storage/media-validation', () => ({
  validateMediaBlob: vi.fn(),
}));

vi.mock('@/lib/storage/schema', () => ({
  STORES: { settings: 'settings' },
}));

vi.mock('@/lib/storage/media-residency', () => ({
  hasLocalMediaCopy: vi.fn().mockResolvedValue(false),
  hasLocalMediaThumbnail: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/storage/legacy-media', () => ({
  dataUrlToBlob: vi.fn(),
  isInlineDataUrl: vi.fn(() => false),
}));

vi.mock('@/lib/storage/media-cache', () => ({
  clearCloudMediaCache: vi.fn(),
  enforceCloudMediaCacheLimit: vi.fn(),
  forgetCloudMediaCacheEntry: vi.fn(),
  touchCloudMediaCache: vi.fn(),
}));

vi.mock('@/lib/storage/media-session', () => ({
  ...mocks.mediaSession,
}));

import {
  invalidateCloudSession,
  restoreCloudDataToLocal,
  restoreCloudMediaToLocal,
  resumeCloudMediaSession,
} from '@/lib/cloud-backup';
import { getCloudRecoveryFingerprint } from '@/lib/cloud-recovery-state';

const expectedBackup = {
  id: 'backup-1',
  userId: 'user-1',
  profileId: 'profile-1',
  schemaVersion: 3,
  data: {
    profiles: [{ id: 'profile-1', name: 'Profile One' }],
    currentProfileId: 'profile-1',
    media: [{
      id: 'media-1',
      profileId: 'profile-1',
      ownerType: 'inventory',
      ownerId: 'record-1',
      role: 'primary',
      fileName: 'media-1.png',
      mimeType: 'image/png',
      sizeBytes: 4,
      checksum: null,
      remotePath: 'user-1/profile-1/media-1/media-1.png',
      createdAt: '2026-08-31T00:00:00.000Z',
      updatedAt: '2026-08-31T00:01:00.000Z',
    }],
  },
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:01:00.000Z',
};

const prepared = {
  state: {
    profiles: [{ id: 'profile-1', name: 'Profile One' }],
    currentProfileId: 'profile-1',
  },
  report: { canImport: true, warnings: [], recordCounts: {} },
  media: [],
};

describe('destructive Cloud restore fences', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await invalidateCloudSession();
    mocks.getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      },
    });
    resumeCloudMediaSession('user-1');
    mocks.loadAppState.mockResolvedValue({
      profiles: [{ id: 'profile-1', name: 'Profile One' }],
      currentProfileId: 'profile-1',
    });
    mocks.prepareImport.mockReturnValue(prepared);
    mocks.getCaizenProfileBackup.mockReset().mockResolvedValue(expectedBackup);
    mocks.listCaizenMediaAssets.mockResolvedValue([]);
    mocks.caizenPrivateMediaExists.mockResolvedValue(true);
    mocks.getMediaAsset.mockResolvedValue(undefined);
    mocks.mediaStorageRestore.mockResolvedValue({ id: 'media-1' });
  });

  it('aborts when the reviewed Cloud snapshot changes before commit', async () => {
    mocks.getCaizenProfileBackup
      .mockResolvedValueOnce(expectedBackup)
      .mockResolvedValueOnce({ ...expectedBackup, id: 'backup-2', updatedAt: '2026-08-31T00:02:00.000Z' });

    await expect(restoreCloudDataToLocal({
      profileId: expectedBackup.profileId,
      expectedBackupId: expectedBackup.id,
      expectedUpdatedAt: expectedBackup.updatedAt,
      expectedUserId: expectedBackup.userId,
    })).rejects.toThrow('changed after Review');

    expect(mocks.restoreCloudProfileImport).not.toHaveBeenCalled();
  });

  it('aborts when the authenticated account changes before commit', async () => {
    await expect(restoreCloudDataToLocal({
      profileId: expectedBackup.profileId,
      expectedBackupId: expectedBackup.id,
      expectedUpdatedAt: expectedBackup.updatedAt,
      expectedUserId: expectedBackup.userId,
      beforeCommit: async () => {
        await invalidateCloudSession();
        mocks.getSupabaseClient.mockReturnValue({
          auth: {
            getUser: () => Promise.resolve({ data: { user: { id: 'user-2' } }, error: null }),
          },
        });
        resumeCloudMediaSession('user-2');
      },
    })).rejects.toThrow('signed-in Cloud account changed');

    expect(mocks.restoreCloudProfileImport).not.toHaveBeenCalled();
  });

  it('revalidates the exact Cloud snapshot after media preparation', async () => {
    let backupLookups = 0;
    mocks.getCaizenProfileBackup.mockImplementation(async () => {
      backupLookups += 1;
      return backupLookups >= 3
        ? { ...expectedBackup, id: 'backup-2', updatedAt: '2026-08-31T00:02:00.000Z' }
        : expectedBackup;
    });

    await expect(restoreCloudDataToLocal({
      profileId: expectedBackup.profileId,
      expectedBackupId: expectedBackup.id,
      expectedUpdatedAt: expectedBackup.updatedAt,
      expectedUserId: expectedBackup.userId,
    })).rejects.toThrow('changed after Review');

    expect(mocks.restoreCloudProfileImport).not.toHaveBeenCalled();
  });

  it('aborts when the authenticated account changes during snapshot validation', async () => {
    mocks.prepareImport.mockImplementationOnce(() => {
      mocks.getSupabaseClient.mockReturnValue({
        auth: {
          getUser: () => Promise.resolve({ data: { user: { id: 'user-2' } }, error: null }),
        },
      });
      resumeCloudMediaSession('user-2');
      return prepared;
    });

    await expect(restoreCloudDataToLocal({
      profileId: expectedBackup.profileId,
      expectedBackupId: expectedBackup.id,
      expectedUpdatedAt: expectedBackup.updatedAt,
      expectedUserId: expectedBackup.userId,
    })).rejects.toThrow('signed-in Cloud account changed');

    expect(mocks.restoreCloudProfileImport).not.toHaveBeenCalled();
  });

  it('runs the local/pristine guard after snapshot preparation', async () => {
    let currentState: unknown = {
      profiles: [{ id: 'profile-1', name: 'Profile One' }],
      currentProfileId: 'profile-1',
    };
    mocks.loadAppState.mockImplementation(async () => currentState);
    mocks.prepareImport.mockImplementationOnce(() => {
      currentState = {
        profiles: [{ id: 'profile-1', name: 'Changed locally' }],
        currentProfileId: 'profile-1',
      };
      return prepared;
    });

    await expect(restoreCloudDataToLocal({
      profileId: expectedBackup.profileId,
      expectedBackupId: expectedBackup.id,
      expectedUpdatedAt: expectedBackup.updatedAt,
      expectedUserId: expectedBackup.userId,
      beforeCommit: async () => {
        const latest = await mocks.loadAppState();
        if ((latest as { profiles: Array<{ name: string }> }).profiles[0]?.name !== 'Profile One') {
          throw new Error('local recovery state changed');
        }
      },
    })).rejects.toThrow('local recovery state changed');

    expect(mocks.restoreCloudProfileImport).not.toHaveBeenCalled();
  });

  it('hydrates from the winning snapshot path even when canonical metadata is stale', async () => {
    mocks.listCaizenMediaAssets.mockResolvedValue([{
      id: 'media-1',
      userId: 'user-1',
      profileId: 'profile-1',
      recordType: 'inventory',
      recordId: 'record-1',
      role: 'primary',
      storagePath: 'user-1/profile-1/media-1/old.png',
      originalName: 'old.png',
      mimeType: 'image/png',
      sizeBytes: 4,
      checksum: null,
      width: null,
      height: null,
      createdAt: expectedBackup.createdAt,
      updatedAt: expectedBackup.updatedAt,
      deletedAt: null,
    }]);

    await restoreCloudDataToLocal({
      profileId: expectedBackup.profileId,
      expectedBackupId: expectedBackup.id,
      expectedUpdatedAt: expectedBackup.updatedAt,
      expectedUserId: expectedBackup.userId,
    });

    expect(mocks.putMediaAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: 'media-1',
      remotePath: 'user-1/profile-1/media-1/media-1.png',
      fileName: 'media-1.png',
    }));
  });

  it('reports a missing snapshot object without attaching a dead remote path', async () => {
    mocks.caizenPrivateMediaExists.mockResolvedValue(false);

    const result = await restoreCloudDataToLocal({
      profileId: expectedBackup.profileId,
      expectedBackupId: expectedBackup.id,
      expectedUpdatedAt: expectedBackup.updatedAt,
      expectedUserId: expectedBackup.userId,
    });

    expect(result.status).toBe('partial');
    expect(result.failedMedia).toEqual(expect.arrayContaining([
      expect.objectContaining({ mediaAssetId: 'media-1' }),
    ]));
    expect(mocks.putMediaAsset).not.toHaveBeenCalledWith(expect.objectContaining({
      id: 'media-1',
      remotePath: expect.any(String),
    }));
  });

  it('fences media retry commits across an account switch', async () => {
    mocks.listCaizenMediaAssets.mockResolvedValue([{
      id: 'media-1',
      userId: 'user-1',
      profileId: 'profile-1',
      recordType: 'inventory',
      recordId: 'record-1',
      role: 'primary',
      storagePath: 'user-1/profile-1/media-1/media-1.png',
      originalName: 'media-1.png',
      mimeType: 'image/png',
      sizeBytes: 4,
      checksum: null,
      width: null,
      height: null,
      createdAt: expectedBackup.createdAt,
      updatedAt: expectedBackup.updatedAt,
      deletedAt: null,
    }]);
    let finishDownload!: (blob: Blob) => void;
    mocks.downloadCaizenPrivateMedia.mockReturnValue(new Promise<Blob>(resolve => {
      finishDownload = resolve;
    }));

    const retry = restoreCloudMediaToLocal(expectedBackup.profileId, {
      expectedBackupId: expectedBackup.id,
      expectedUpdatedAt: expectedBackup.updatedAt,
      expectedUserId: expectedBackup.userId,
    });
    await vi.waitFor(() => expect(mocks.downloadCaizenPrivateMedia).toHaveBeenCalledTimes(1));

    await invalidateCloudSession();
    resumeCloudMediaSession('user-2');
    finishDownload(new Blob(['data'], { type: 'image/png' }));

    await expect(retry).rejects.toThrow('media session');
    expect(mocks.mediaStorageRestore).not.toHaveBeenCalled();
  });

  it('revalidates the reviewed Cloud snapshot immediately before a media retry write', async () => {
    mocks.listCaizenMediaAssets.mockResolvedValue([{
      id: 'media-1',
      userId: 'user-1',
      profileId: 'profile-1',
      recordType: 'inventory',
      recordId: 'record-1',
      role: 'primary',
      storagePath: 'user-1/profile-1/media-1/media-1.png',
      originalName: 'media-1.png',
      mimeType: 'image/png',
      sizeBytes: 4,
      checksum: null,
      width: null,
      height: null,
      createdAt: expectedBackup.createdAt,
      updatedAt: expectedBackup.updatedAt,
      deletedAt: null,
    }]);
    const newerBackup = { ...expectedBackup, id: 'backup-2', updatedAt: '2026-08-31T00:02:00.000Z' };
    mocks.getCaizenProfileBackup
      .mockResolvedValueOnce(expectedBackup)
      .mockResolvedValueOnce(expectedBackup)
      .mockResolvedValueOnce(newerBackup);
    mocks.downloadCaizenPrivateMedia.mockResolvedValue(new Blob(['data'], { type: 'image/png' }));

    await expect(restoreCloudMediaToLocal(expectedBackup.profileId, {
      expectedBackupId: expectedBackup.id,
      expectedUpdatedAt: expectedBackup.updatedAt,
      expectedUserId: expectedBackup.userId,
      expectedFingerprint: getCloudRecoveryFingerprint({
        backupId: expectedBackup.id,
        profileId: expectedBackup.profileId,
        schemaVersion: expectedBackup.schemaVersion,
        updatedAt: expectedBackup.updatedAt,
      }),
    })).rejects.toThrow('changed after Review');

    expect(mocks.mediaStorageRestore).not.toHaveBeenCalled();
  });

  it('allows an unchanged reviewed restore to commit normally', async () => {
    await restoreCloudDataToLocal({
      profileId: expectedBackup.profileId,
      expectedBackupId: expectedBackup.id,
      expectedUpdatedAt: expectedBackup.updatedAt,
      expectedUserId: expectedBackup.userId,
    });

    expect(mocks.restoreCloudProfileImport).toHaveBeenCalledTimes(1);
  });
});
