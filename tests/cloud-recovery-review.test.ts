import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCloudUser: vi.fn(),
  getCloudSyncMarker: vi.fn(),
  getLocalProfileModifiedAt: vi.fn(),
  isCloudBootstrapPristine: vi.fn(),
  restoreCloudDataToLocal: vi.fn(),
  restoreCloudMediaToLocal: vi.fn(),
  getCaizenProfileBackup: vi.fn(),
  listCaizenMediaAssets: vi.fn(),
  listCaizenMediaAssetMetadata: vi.fn(),
  listCaizenProfileBackupMetadata: vi.fn(),
  loadAppState: vi.fn(),
  prepareImport: vi.fn(),
  recordCloudRecoveryDecision: vi.fn(),
}));

vi.mock('@/lib/cloud-backup', () => ({
  rememberReviewedCloudSnapshot: vi.fn(),
  getCloudUser: mocks.getCloudUser,
  getCloudSyncMarker: mocks.getCloudSyncMarker,
  getLocalProfileModifiedAt: mocks.getLocalProfileModifiedAt,
  isCloudBootstrapPristine: mocks.isCloudBootstrapPristine,
  restoreCloudDataToLocal: mocks.restoreCloudDataToLocal,
  restoreCloudMediaToLocal: mocks.restoreCloudMediaToLocal,
}));
vi.mock('@/lib/caizen-cloud-repository', () => ({
  getCaizenProfileBackup: mocks.getCaizenProfileBackup,
  listCaizenMediaAssets: mocks.listCaizenMediaAssets,
  listCaizenMediaAssetMetadata: mocks.listCaizenMediaAssetMetadata,
  listCaizenProfileBackupMetadata: mocks.listCaizenProfileBackupMetadata,
}));
vi.mock('@/lib/storage/app-repository', () => ({ loadAppState: mocks.loadAppState }));
vi.mock('@/lib/storage/import-integrity', () => ({ prepareImport: mocks.prepareImport }));
vi.mock('@/lib/cloud-recovery-state', () => ({
  getCloudRecoveryFingerprint: vi.fn((input: Record<string, unknown>) => JSON.stringify([
    input.backupId,
    input.profileId,
    input.schemaVersion,
    input.updatedAt,
  ])),
  recordCloudRecoveryDecision: mocks.recordCloudRecoveryDecision,
}));

import {
  restoreReviewedCloudProfile,
  reviewCloudRecoveryCandidate,
  retryReviewedCloudMedia,
} from '@/lib/cloud-recovery';

const metadata = {
  id: 'backup-1',
  userId: 'user-1',
  profileId: 'cloud-profile-1',
  schemaVersion: 3,
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

const candidate = {
  backup: metadata,
  classification: 'pristine-device-backup' as const,
  prompt: 'modal' as const,
  isCurrentProfile: false,
  localUpdatedAt: null,
  cloudUpdatedAt: metadata.updatedAt,
  media: { count: 1, bytes: 20 },
};

const validPrepared = {
  state: {
    profiles: [{ id: metadata.profileId, name: 'Cai' }],
    currentProfileId: metadata.profileId,
  },
  media: [{ id: 'media-1', fileName: 'avatar.png' }],
  report: {
    canImport: true,
    warnings: [],
    recordCounts: { transactions: 2 },
  },
};

describe('explicit Cloud recovery review and restore contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCloudUser.mockResolvedValue({ id: 'user-1' });
    mocks.getCloudSyncMarker.mockReturnValue(null);
    mocks.getLocalProfileModifiedAt.mockResolvedValue(null);
    mocks.getCaizenProfileBackup.mockResolvedValue({
      ...metadata,
      data: { profiles: validPrepared.state.profiles, currentProfileId: metadata.profileId, media: validPrepared.media },
    });
    mocks.listCaizenMediaAssets.mockResolvedValue([{
      id: 'media-1',
      profileId: metadata.profileId,
      sizeBytes: 20,
    }]);
    mocks.loadAppState.mockResolvedValue({
      profiles: [{ id: 'placeholder', name: 'My Profile' }],
      currentProfileId: 'placeholder',
    });
    mocks.isCloudBootstrapPristine.mockReturnValue(true);
    mocks.prepareImport.mockReturnValue(validPrepared);
  });

  it('reviews full data in memory without replacing IndexedDB or media', async () => {
    const review = await reviewCloudRecoveryCandidate(candidate);

    expect(review.profileName).toBe('Cai');
    expect(review.restoreType).toBe('replace-pristine-placeholder');
    expect(review.media).toEqual({ count: 1, bytes: 20 });
    expect(mocks.restoreCloudDataToLocal).not.toHaveBeenCalled();
    expect(mocks.restoreCloudMediaToLocal).not.toHaveBeenCalled();
  });

  it('rejects a snapshot that changed after metadata discovery', async () => {
    mocks.getCaizenProfileBackup.mockResolvedValueOnce({
      ...metadata,
      id: 'new-backup',
      data: { profiles: validPrepared.state.profiles },
    });

    await expect(reviewCloudRecoveryCandidate(candidate)).rejects.toThrow('changed after discovery');
    expect(mocks.prepareImport).not.toHaveBeenCalled();
  });

  it('passes the reviewed account, identity and placeholder guard into the transactional restore', async () => {
    const review = await reviewCloudRecoveryCandidate(candidate);
    mocks.restoreCloudDataToLocal.mockResolvedValue({
      status: 'success',
      backupId: review.backupId,
      profileId: review.profileId,
      schemaVersion: review.schemaVersion,
      restoredAt: '2026-08-15T01:00:00.000Z',
      downloadedFileCount: 1,
      failedMedia: [],
    });

    await restoreReviewedCloudProfile(review);

    expect(mocks.restoreCloudDataToLocal).toHaveBeenCalledWith(expect.objectContaining({
      profileId: review.profileId,
      expectedBackupId: review.backupId,
      expectedUpdatedAt: review.expectedUpdatedAt,
      expectedUserId: review.userId,
      expectedFingerprint: review.expectedFingerprint,
      removeProfileIds: ['placeholder'],
      beforeCommit: expect.any(Function),
    }));
  });

  it('uses the same reviewed snapshot guard for media-only retry', async () => {
    const review = await reviewCloudRecoveryCandidate(candidate);
    mocks.restoreCloudMediaToLocal.mockResolvedValue({ downloadedFileCount: 1, failedMedia: [] });

    await retryReviewedCloudMedia(review);

    expect(mocks.restoreCloudMediaToLocal).toHaveBeenCalledWith(review.profileId, expect.objectContaining({
      expectedBackupId: review.backupId,
      expectedUpdatedAt: review.expectedUpdatedAt,
      expectedUserId: review.userId,
      expectedFingerprint: review.expectedFingerprint,
    }));
  });
});
