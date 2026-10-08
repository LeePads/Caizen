import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  normalizeInventoryItems,
  normalizeWishlistItems,
} from '@/lib/collections/normalization';
import {
  collectExpiredTrashMediaAssetIds,
  collectTrashMediaAssetIds,
  COLLECTION_TRASH_SOURCES,
  removeExpiredTrashItems,
  queueTrashMediaCleanup,
} from '@/lib/storage/trash-media';
import { saveAppState } from '@/lib/storage/app-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import { getMediaAsset, putMediaAsset, putMediaBlob } from '@/lib/storage/media-repository';
import { processPendingMediaCleanup } from '@/lib/storage/media-cleanup';
import { mediaStorage } from '@/lib/storage/media-storage';

const read = (path: string) => readFileSync(path, 'utf8');

const asset = (id: string, profileId = 'profile-a') => ({
  id,
  profileId,
  ownerType: 'inventory' as const,
  ownerId: 'record-1',
  role: 'primary' as const,
  fileName: `${id}.jpg`,
  mimeType: 'image/jpeg',
  sizeBytes: 4,
  syncStatus: 'local-only' as const,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
});

const profile = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  createdAt: '2026-08-11T00:00:00.000Z',
  wallets: [],
  inventoryItems: [],
  wishlistItems: [],
  upcomingMoneyItems: [],
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
  health: {},
  ...overrides,
});

const trashItem = (
  source: 'inventoryItems' | 'wishlistItems',
  assetIds: string[],
  deleteAfter = '2026-09-01T00:00:00.000Z',
) => ({
  id: `trash-${source}-${assetIds.join('-')}`,
  source,
  sourceLabel: source === 'inventoryItems' ? 'Inventory' : 'Wishlist',
  itemId: `${source}-1`,
  title: 'Managed record',
  deletedAt: '2026-08-01T00:00:00.000Z',
  deleteAfter,
  data: { id: `${source}-1`, name: 'Managed record', photoAssetIds: assetIds },
});

afterEach(async () => {
  localStorage.clear();
  await resetCaizenDatabaseForTests();
});

describe('CM-D-01 managed collection Trash lifecycle', () => {
  it('limits the approved managed-media Trash scope and preserves exact references', () => {
    expect([...COLLECTION_TRASH_SOURCES]).toEqual([
      'inventoryItems',
      'skincareProducts',
      'wishlistItems',
      'careerCredentials',
      'mediaItems',
    ]);
    expect(collectTrashMediaAssetIds({
      data: {
        photoAssetIds: ['photo-1', 'photo-1'],
        receiptAssetIds: ['receipt-1'],
        image: 'https://example.com/external.jpg',
      },
    })).toEqual(['photo-1', 'receipt-1']);
  });

  it('deduplicates legacy managed references without changing external URLs', () => {
    const inventory = normalizeInventoryItems([{
      id: 'inventory-1',
      name: 'Camera',
      photoAssetIds: ['photo-1', 'photo-1', ''],
      receiptAssetIds: ['receipt-1', 'receipt-1'],
      image: 'https://example.com/external.jpg',
    }])[0] as any;
    const wishlist = normalizeWishlistItems([{
      id: 'wishlist-1',
      name: 'Headphones',
      photoAssetIds: ['photo-2', 'photo-2'],
      image: 'https://example.com/external-wishlist.jpg',
    }])[0] as any;

    expect(inventory.photoAssetIds).toEqual(['photo-1']);
    expect(inventory.receiptAssetIds).toEqual(['receipt-1']);
    expect(inventory.image).toBe('https://example.com/external.jpg');
    expect(wishlist.photoAssetIds).toEqual(['photo-2']);
    expect(wishlist.image).toBe('https://example.com/external-wishlist.jpg');
  });

  it('queues only expired managed collection Trash references', () => {
    expect(collectExpiredTrashMediaAssetIds([
      trashItem('inventoryItems', ['expired-photo'], '2026-08-01T00:00:00.000Z'),
      trashItem('wishlistItems', ['still-recoverable'], '2026-09-01T00:00:00.000Z'),
      {
        ...trashItem('inventoryItems', ['vault-photo'], '2026-08-01T00:00:00.000Z'),
        source: 'personalVaultItems',
      },
    ], new Date('2026-08-13T00:00:00.000Z'))).toEqual(['expired-photo']);
    expect(removeExpiredTrashItems([
      trashItem('inventoryItems', ['expired-photo'], '2026-08-01T00:00:00.000Z'),
      trashItem('wishlistItems', ['still-recoverable'], '2026-09-01T00:00:00.000Z'),
    ], new Date('2026-08-13T00:00:00.000Z')).map(item => item.itemId)).toEqual([
      'wishlistItems-1',
    ]);
  });

  it('retains shared media while another active or Trash reference exists, then deletes the last reference', async () => {
    await saveAppState({
      profiles: [profile('profile-a', {
        inventoryItems: [{ id: 'inventory-1', photoAssetIds: ['shared-photo'] }],
        trashItems: [
          trashItem('wishlistItems', ['shared-photo', 'trash-only']),
          trashItem('inventoryItems', ['shared-photo']),
        ],
      }) as any],
      currentProfileId: 'profile-a',
    });
    await putMediaAsset(asset('shared-photo'));
    await putMediaAsset(asset('trash-only'));
    await putMediaBlob('shared-photo', new Blob(['data']), 'full');
    await putMediaBlob('trash-only', new Blob(['data']), 'full');

    const deletedTrashItem = trashItem('wishlistItems', ['shared-photo', 'trash-only']);
    queueTrashMediaCleanup('profile-a', deletedTrashItem);
    await saveAppState({
      profiles: [profile('profile-a', {
        inventoryItems: [{ id: 'inventory-1', photoAssetIds: ['shared-photo'] }],
        trashItems: [trashItem('inventoryItems', ['shared-photo'])],
      }) as any],
      currentProfileId: 'profile-a',
    });
    await expect(processPendingMediaCleanup()).resolves.toMatchObject({ deleted: 1, pendingJobs: 0 });
    expect(await getMediaAsset('shared-photo')).toBeDefined();
    expect(await getMediaAsset('trash-only')).toBeUndefined();

    const secondTrashItem = trashItem('inventoryItems', ['shared-photo']);
    queueTrashMediaCleanup('profile-a', secondTrashItem);
    await saveAppState({ profiles: [profile('profile-a') as any], currentProfileId: 'profile-a' });
    await expect(processPendingMediaCleanup()).resolves.toMatchObject({ deleted: 1, pendingJobs: 0 });
    expect(await getMediaAsset('shared-photo')).toBeUndefined();
  });

  it('keeps cleanup durable across a transient delete failure', async () => {
    await saveAppState({ profiles: [profile('profile-a') as any], currentProfileId: 'profile-a' });
    await putMediaAsset(asset('retry-photo'));
    await putMediaBlob('retry-photo', new Blob(['data']), 'full');
    queueTrashMediaCleanup('profile-a', trashItem('inventoryItems', ['retry-photo']));

    const originalDelete = mediaStorage.delete.bind(mediaStorage);
    const deleteSpy = vi.spyOn(mediaStorage, 'delete')
      .mockRejectedValueOnce(new Error('temporary quota failure'))
      .mockImplementationOnce(originalDelete);

    await expect(processPendingMediaCleanup()).resolves.toMatchObject({
      pendingJobs: 1,
      failedIds: ['retry-photo'],
    });
    await expect(processPendingMediaCleanup()).resolves.toMatchObject({
      deleted: 1,
      pendingJobs: 0,
    });
    expect(deleteSpy).toHaveBeenCalledTimes(2);
  });
});

describe('CM-D-01 lifecycle integration contracts', () => {
  it('routes only managed collection deletes through Trash and keeps import/cloud collectors recursive', () => {
    const context = read('lib/context.tsx');
    const backup = read('lib/storage/backup-repository.ts');
    const cloud = read('lib/cloud-backup.ts');
    const modal = read('components/modals/GlobalTrashModal.tsx');

    expect(context).toContain('moveToTrash("inventoryItems", item, "Inventory",');
    expect(context).toContain('moveToTrash("wishlistItems", item, "Wishlist")');
    expect(context).toContain('const restored = normalizeInventoryItems');
    expect(context).toContain('const restored = normalizeWishlistItems');
    expect(context).toContain('queueExpiredTrashMediaCleanup(profile.id, profile.trashItems)');
    expect(backup).toContain('queueExpiredTrashMediaCleanup(profile.id, profile.trashItems)');
    expect(cloud).toContain('collectReferencedMediaIds(');
    expect(modal).toContain('Managed attachments remain recoverable with their records');
    expect(modal).toContain('external image links stay external');
  });
});
