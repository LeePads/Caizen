import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveAppState } from '@/lib/storage/app-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import { getMediaAsset, putMediaAsset, putMediaBlob } from '@/lib/storage/media-repository';
import { mediaStorage } from '@/lib/storage/media-storage';
import {
  listPendingMediaCleanupJobs,
  processPendingMediaCleanup,
  queueMediaCleanup,
} from '@/lib/storage/media-cleanup';
import {
  collectMediaReferenceIds,
  remapMediaReferences,
  sanitizeMediaReferences,
} from '@/lib/storage/media-references';

const asset = (id: string, profileId: string) => ({
  id,
  profileId,
  ownerType: 'inventory' as const,
  ownerId: 'record-1',
  role: 'primary' as const,
  fileName: `${id}.txt`,
  mimeType: 'text/plain',
  sizeBytes: 5,
  syncStatus: 'local-only' as const,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
});

const profile = (id: string, photoAssetIds: string[] = []) => ({
  id,
  name: id,
  createdAt: '2026-08-11T00:00:00.000Z',
  wallets: [],
  transactions: [],
  inventoryItems: photoAssetIds.length ? [{ id: 'record-1', photoAssetIds }] : [],
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
  health: {},
});

afterEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  await resetCaizenDatabaseForTests();
});

describe('media reference isolation', () => {
  it('collects, remaps, and strips only recognized media reference fields', () => {
    const source = {
      photoAssetIds: ['asset-a', 'asset-b'],
      nested: { avatarAssetId: 'asset-c', unrelatedId: 'asset-keep' },
    };
    expect([...collectMediaReferenceIds(source)]).toEqual(['asset-a', 'asset-b', 'asset-c']);
    expect(remapMediaReferences(source, new Map([['asset-a', 'asset-new']]))).toEqual({
      photoAssetIds: ['asset-new', 'asset-b'],
      nested: { avatarAssetId: 'asset-c', unrelatedId: 'asset-keep' },
    });
    expect(sanitizeMediaReferences(source, new Set(['asset-b']))).toEqual({
      photoAssetIds: ['asset-b'],
      nested: { unrelatedId: 'asset-keep' },
    });
  });

  it('treats Journal managed photos and attachments as portable references', () => {
    const source = {
      journalEntries: [{
        id: 'journal-1',
        photoAssetIds: ['journal-photo'],
        attachmentAssetIds: ['journal-attachment'],
      }],
    };
    expect([...collectMediaReferenceIds(source)]).toEqual([
      'journal-photo',
      'journal-attachment',
    ]);
    expect(remapMediaReferences(source, new Map([['journal-photo', 'restored-photo']]))).toEqual({
      journalEntries: [{
        id: 'journal-1',
        photoAssetIds: ['restored-photo'],
        attachmentAssetIds: ['journal-attachment'],
      }],
    });
  });

  it('does not delete referenced or foreign-profile queued media', async () => {
    await saveAppState({ profiles: [profile('profile-b', ['shared']) as any], currentProfileId: 'profile-b' });
    await putMediaAsset(asset('shared', 'profile-a'));
    await putMediaAsset(asset('unreferenced', 'profile-a'));
    await putMediaBlob('shared', new Blob(['shared']), 'full');
    await putMediaBlob('unreferenced', new Blob(['orphan']), 'full');

    queueMediaCleanup({ profileId: 'profile-a', assetIds: ['shared', 'unreferenced'], reason: 'record-deleted' });
    const result = await processPendingMediaCleanup();

    expect(result.deleted).toBe(1);
    expect(await getMediaAsset('shared')).toBeDefined();
    expect(await getMediaAsset('unreferenced')).toBeUndefined();
    expect(listPendingMediaCleanupJobs()).toEqual([]);
  });

  it('retains a failed cleanup for a later retry', async () => {
    await putMediaAsset(asset('retry-me', 'profile-a'));
    await putMediaBlob('retry-me', new Blob(['retry']), 'full');
    queueMediaCleanup({ profileId: 'profile-a', assetIds: ['retry-me'], reason: 'workspace-cleared' });

    const deleteSpy = vi.spyOn(mediaStorage, 'delete')
      .mockRejectedValueOnce(new Error('temporary quota failure'))
      .mockImplementationOnce(async (id: string) => {
        const actual = (await getMediaAsset(id));
        if (actual) {
          const { deleteMediaAssetRecord, deleteMediaBlobs } = await import('@/lib/storage/media-repository');
          await deleteMediaAssetRecord(id);
          await deleteMediaBlobs(id);
        }
      });

    await expect(processPendingMediaCleanup()).resolves.toMatchObject({ pendingJobs: 1, failedIds: ['retry-me'] });
    expect(listPendingMediaCleanupJobs()[0].assetIds).toEqual(['retry-me']);
    await expect(processPendingMediaCleanup()).resolves.toMatchObject({ deleted: 1, pendingJobs: 0 });
    expect(deleteSpy).toHaveBeenCalledTimes(2);
  });
});
