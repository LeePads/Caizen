import { describe, expect, it, vi } from 'vitest';

const { getCloudUser, getCloudSyncMarker, getLocalProfileModifiedAt, isCloudBootstrapPristine } = vi.hoisted(() => ({
  getCloudUser: vi.fn(),
  getCloudSyncMarker: vi.fn(),
  getLocalProfileModifiedAt: vi.fn(),
  isCloudBootstrapPristine: vi.fn(),
}));
const { listCaizenMediaAssetMetadata, listCaizenProfileBackupMetadata } = vi.hoisted(() => ({
  listCaizenMediaAssetMetadata: vi.fn(),
  listCaizenProfileBackupMetadata: vi.fn(),
}));
const { loadAppState } = vi.hoisted(() => ({ loadAppState: vi.fn() }));

vi.mock('@/lib/cloud-backup', () => ({
  getCloudUser,
  getCloudSyncMarker,
  getLocalProfileModifiedAt,
  isCloudBootstrapPristine,
}));
vi.mock('@/lib/caizen-cloud-repository', () => ({
  listCaizenMediaAssetMetadata,
  listCaizenProfileBackupMetadata,
}));
vi.mock('@/lib/storage/app-repository', () => ({ loadAppState }));

import { discoverCloudRecovery } from '@/lib/cloud-recovery';

describe('Cloud metadata discovery lifecycle', () => {
  it('discovers profile identity and media aggregates without loading a snapshot', async () => {
    getCloudUser.mockResolvedValue({ id: 'user-1' });
    loadAppState.mockResolvedValue({
      currentProfileId: 'local-1',
      profiles: [{ id: 'local-1' }],
    });
    isCloudBootstrapPristine.mockReturnValue(false);
    getLocalProfileModifiedAt.mockResolvedValue('2026-08-15T00:00:00.000Z');
    getCloudSyncMarker.mockReturnValue({
      userId: 'user-1',
      profileId: 'local-1',
      localUpdatedAt: '2026-08-15T00:00:00.000Z',
      cloudUpdatedAt: '2026-08-15T00:00:00.000Z',
      syncedAt: '2026-08-15T00:00:00.000Z',
    });
    listCaizenProfileBackupMetadata.mockResolvedValue([
      {
        id: 'backup-cloud-only',
        userId: 'user-1',
        profileId: 'cloud-only',
        schemaVersion: 3,
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
      {
        id: 'backup-newer',
        userId: 'user-1',
        profileId: 'profile-z',
        schemaVersion: 3,
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-16T00:00:00.000Z',
      },
      {
        id: 'backup-local',
        userId: 'user-1',
        profileId: 'local-1',
        schemaVersion: 3,
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:00.000Z',
      },
    ]);
    listCaizenMediaAssetMetadata.mockResolvedValue([
      { profileId: 'local-1', sizeBytes: 10 },
      { profileId: 'local-1', sizeBytes: 20 },
      { profileId: 'cloud-only', sizeBytes: 5 },
      { profileId: 'profile-z', sizeBytes: 7 },
      { profileId: 'local-1', sizeBytes: -1 },
    ]);

    const discovery = await discoverCloudRecovery();

    expect(discovery.userId).toBe('user-1');
    expect(discovery.mediaByProfile['local-1']).toEqual({ count: 2, bytes: 30 });
    expect(discovery.candidates.map(candidate => candidate.backup?.id)).toEqual([
      'backup-newer',
      'backup-local',
      'backup-cloud-only',
    ]);
    expect(discovery.candidates.map(candidate => candidate.classification)).toEqual([
      'cloud-only-profile',
      'matching-equal',
      'cloud-only-profile',
    ]);
    expect(discovery.candidates[2]?.media).toEqual({ count: 1, bytes: 5 });
  });
});

