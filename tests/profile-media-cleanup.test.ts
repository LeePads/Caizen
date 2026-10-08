import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listMediaAssets: vi.fn(),
  deleteMedia: vi.fn(),
  loadAppState: vi.fn(),
}));

vi.mock('@/lib/storage/media-repository', () => ({
  listMediaAssets: mocks.listMediaAssets,
}));

vi.mock('@/lib/storage/media-storage', () => ({
  mediaStorage: { delete: mocks.deleteMedia },
}));

vi.mock('@/lib/storage/app-repository', () => ({
  loadAppState: mocks.loadAppState,
}));

import {
  cleanupProfileMedia,
  listPendingProfileMediaCleanups,
  processPendingProfileMediaCleanups,
  queueProfileMediaCleanup,
} from '@/lib/storage/profile-media-cleanup';

describe('profile media cleanup', () => {
  beforeEach(() => {
    mocks.listMediaAssets.mockReset();
    mocks.deleteMedia.mockReset();
    mocks.loadAppState.mockReset();
    mocks.loadAppState.mockResolvedValue(null);
    localStorage.clear();
  });

  it('enumerates only the requested profile and deletes each owned asset', async () => {
    mocks.listMediaAssets.mockResolvedValue([
      { id: 'asset-a', profileId: 'profile-a' },
      { id: 'asset-b', profileId: 'profile-a' },
    ]);
    mocks.deleteMedia.mockResolvedValue(undefined);

    await expect(cleanupProfileMedia('profile-a')).resolves.toEqual({
      profileId: 'profile-a',
      attempted: 2,
      deleted: 2,
      failedIds: [],
    });
    expect(mocks.listMediaAssets).toHaveBeenCalledWith('profile-a');
    expect(mocks.deleteMedia).toHaveBeenNthCalledWith(1, 'asset-a');
    expect(mocks.deleteMedia).toHaveBeenNthCalledWith(2, 'asset-b');
  });

  it('continues after a failed asset and returns a retryable failure list', async () => {
    mocks.listMediaAssets.mockResolvedValue([
      { id: 'asset-a', profileId: 'profile-a' },
      { id: 'asset-b', profileId: 'profile-a' },
      { id: 'asset-c', profileId: 'profile-a' },
    ]);
    mocks.deleteMedia
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce(undefined);

    await expect(cleanupProfileMedia('profile-a')).resolves.toEqual({
      profileId: 'profile-a',
      attempted: 3,
      deleted: 2,
      failedIds: ['asset-b'],
    });
  });

  it('rejects an empty profile ID before touching storage', async () => {
    await expect(cleanupProfileMedia('  ')).rejects.toThrow(/Profile ID is required/);
    expect(mocks.listMediaAssets).not.toHaveBeenCalled();
  });

  it('queues interrupted cleanup and clears the marker after a successful retry', async () => {
    queueProfileMediaCleanup('profile-a');
    queueProfileMediaCleanup('profile-a');
    expect(listPendingProfileMediaCleanups()).toEqual(['profile-a']);

    mocks.listMediaAssets.mockResolvedValue([{ id: 'asset-a', profileId: 'profile-a' }]);
    mocks.deleteMedia.mockResolvedValue(undefined);
    await expect(processPendingProfileMediaCleanups()).resolves.toMatchObject([
      { profileId: 'profile-a', failedIds: [] },
    ]);
    expect(listPendingProfileMediaCleanups()).toEqual([]);
  });

  it('keeps the marker when a retry still cannot remove media', async () => {
    queueProfileMediaCleanup('profile-a');
    mocks.listMediaAssets.mockResolvedValue([{ id: 'asset-a', profileId: 'profile-a' }]);
    mocks.deleteMedia.mockRejectedValue(new Error('quota'));

    await expect(processPendingProfileMediaCleanups()).resolves.toMatchObject([
      { profileId: 'profile-a', failedIds: ['asset-a'] },
    ]);
    expect(listPendingProfileMediaCleanups()).toEqual(['profile-a']);
  });

  it('does not delete queued media when the profile still exists in persisted state', async () => {
    queueProfileMediaCleanup('profile-a');
    mocks.loadAppState.mockResolvedValue({
      profiles: [{ id: 'profile-a' }],
      currentProfileId: 'profile-a',
    });
    mocks.listMediaAssets.mockResolvedValue([{ id: 'asset-a', profileId: 'profile-a' }]);

    await expect(processPendingProfileMediaCleanups()).resolves.toMatchObject([
      { profileId: 'profile-a', attempted: 0, deleted: 0, failedIds: [] },
    ]);
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
    expect(listPendingProfileMediaCleanups()).toEqual([]);
  });

  it('stops before deleting remaining media if the profile reappears during cleanup', async () => {
    queueProfileMediaCleanup('profile-a');
    mocks.loadAppState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        profiles: [{ id: 'profile-a' }],
        currentProfileId: 'profile-a',
      });
    mocks.listMediaAssets.mockResolvedValue([
      { id: 'asset-a', profileId: 'profile-a' },
      { id: 'asset-b', profileId: 'profile-a' },
    ]);

    await expect(processPendingProfileMediaCleanups()).resolves.toMatchObject([
      { profileId: 'profile-a', attempted: 2, deleted: 0, failedIds: [] },
    ]);
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
  });
});
