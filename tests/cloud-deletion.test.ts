import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseClient } = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient,
  getCloudAuthRedirectUrl: vi.fn(() => 'https://example.test/auth'),
}));

import { deleteCloudProfileData } from '@/lib/cloud-backup';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import { getMediaAsset, getMediaBlob, putMediaAsset, putMediaBlob } from '@/lib/storage/media-repository';
import type { MediaAsset } from '@/lib/types';

describe('Cloud profile deletion', () => {
  beforeEach(() => {
    getSupabaseClient.mockReset();
  });

  afterEach(async () => {
    await resetCaizenDatabaseForTests();
  });

  it('deletes full and deterministic thumbnail objects while preserving local bytes', async () => {
    const remoteAsset = {
      id: 'media-1',
      user_id: 'user-1',
      profile_id: 'profile-1',
      record_type: 'inventory',
      record_id: 'record-1',
      role: 'primary',
      storage_path: 'user-1/profile-1/media-1/photo.png',
      original_name: 'photo.png',
      mime_type: 'image/png',
      size_bytes: 12,
      checksum: null,
      width: null,
      height: null,
      created_at: '2026-08-11T00:00:00.000Z',
      updated_at: '2026-08-11T00:00:00.000Z',
      deleted_at: null,
    };
    let snapshotActive = true;
    const backupRow = {
      id: 'backup-1',
      user_id: 'user-1',
      profile_id: 'profile-1',
      schema_version: 3,
      data: {
        profiles: [{ id: 'profile-1' }],
        currentProfileId: 'profile-1',
        media: [{
          id: 'media-1',
          profileId: 'profile-1',
          ownerType: 'inventory',
          ownerId: 'record-1',
          role: 'primary',
          fileName: 'photo.png',
          mimeType: 'image/png',
          sizeBytes: 12,
          remotePath: remoteAsset.storage_path,
          createdAt: remoteAsset.created_at,
          updatedAt: remoteAsset.updated_at,
        }],
      },
      created_at: remoteAsset.created_at,
      updated_at: remoteAsset.updated_at,
    };
    let deleting = false;
    const chain = (table: string) => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.order = vi.fn(() => query);
      query.range = vi.fn(() => query);
      query.is = vi.fn(() => query);
      query.then = vi.fn((resolve: (value: unknown) => unknown) => {
        const data = table === 'caizen_profile_backups' ? (snapshotActive ? [{ ...backupRow, media: backupRow.data.media }] : []) : [remoteAsset];
        return Promise.resolve({ data, error: null, count: data.length }).then(resolve);
      });
      query.maybeSingle = vi.fn(async () => {
        const data = snapshotActive ? backupRow : null;
        if (deleting) snapshotActive = false;
        return { data, error: null };
      });
      query.delete = vi.fn(() => query);
      return query;
    };
    const from = vi.fn((table: string) => {
      const query = chain(table);
      if (table === 'caizen_profile_backups') {
        query.order.mockReturnValue(query);
        query.maybeSingle.mockImplementation(async () => {
          const data = snapshotActive ? backupRow : null;
          if (deleting) snapshotActive = false;
          return { data, error: null };
        });
        query.select.mockImplementation(() => query);
        query.delete.mockImplementation(() => {
          deleting = true;
          return query;
        });
      }
      return query;
    });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const storageFrom = vi.fn().mockReturnValue({ remove });
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from,
      storage: { from: storageFrom },
    });

    const localAsset: MediaAsset = {
      id: 'media-1',
      profileId: 'profile-1',
      ownerType: 'inventory',
      ownerId: 'record-1',
      role: 'primary',
      fileName: 'photo.png',
      mimeType: 'image/png',
      sizeBytes: 3,
      remotePath: remoteAsset.storage_path,
      syncStatus: 'synced',
      createdAt: remoteAsset.created_at,
      updatedAt: remoteAsset.updated_at,
    };
    await putMediaAsset(localAsset);
    await putMediaBlob(localAsset.id, new Blob(['abc'], { type: localAsset.mimeType }), 'full');
    await putMediaBlob(localAsset.id, new Blob(['thumb'], { type: 'image/webp' }), 'thumbnail');

    await expect(deleteCloudProfileData('profile-1')).resolves.toMatchObject({
      status: 'success',
      deletedMediaCount: 1,
    });
    expect(remove).toHaveBeenNthCalledWith(1, [remoteAsset.storage_path]);
    expect(remove).toHaveBeenNthCalledWith(2, ['user-1/profile-1/media-1/media-1-thumbnail.webp']);
    expect(await getMediaBlob(localAsset.id, 'full')).toBeDefined();
    expect(await getMediaBlob(localAsset.id, 'thumbnail')).toBeDefined();
    expect(await getMediaAsset(localAsset.id)).toMatchObject({
      remotePath: undefined,
      syncStatus: 'local-only',
    });
  });

  it('retires the snapshot before reporting Storage cleanup as orphaned P2', async () => {
    let snapshotActive = true;
    const remoteAsset = {
        id: 'media-1',
        user_id: 'user-1',
        profile_id: 'profile-1',
        record_type: 'inventory',
        record_id: 'record-1',
        role: 'primary',
        storage_path: 'user-1/profile-1/media-1/photo.png',
        original_name: 'photo.png',
        mime_type: 'image/png',
        size_bytes: 12,
        checksum: null,
        width: null,
        height: null,
        created_at: '2026-08-11T00:00:00.000Z',
        updated_at: '2026-08-11T00:00:00.000Z',
        deleted_at: null,
    };
    const backupRow = {
      id: 'backup-1',
      user_id: 'user-1',
      profile_id: 'profile-1',
      schema_version: 3,
      data: { profiles: [{ id: 'profile-1' }], currentProfileId: 'profile-1' },
      created_at: remoteAsset.created_at,
      updated_at: remoteAsset.updated_at,
    };
    const from = vi.fn((table: string) => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {};
      let deleting = false;
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.delete = vi.fn(() => { deleting = true; return query; });
      query.maybeSingle = vi.fn(async () => {
        const data = snapshotActive ? backupRow : null;
        if (deleting) snapshotActive = false;
        return { data, error: null };
      });
      query.order = vi.fn(() => query);
      query.range = vi.fn(() => query);
      query.is = vi.fn(() => query);
      query.then = vi.fn((resolve: (value: unknown) => unknown) => {
        const data = table === 'caizen_profile_backups' ? (snapshotActive ? [{ ...backupRow, media: [] }] : []) : [remoteAsset];
        return Promise.resolve({ data, error: null, count: data.length }).then(resolve);
      });
      return query;
    });
    const remove = vi.fn().mockResolvedValue({ error: { message: 'storage unavailable' } });
    const storageFrom = vi.fn().mockReturnValue({ remove });

    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from,
      storage: { from: storageFrom },
    });

    const result = await deleteCloudProfileData('profile-1');

    expect(result).toMatchObject({
      status: 'partial',
      profileId: 'profile-1',
      deletedMediaCount: 0,
    });
    expect(result.failedMedia[0]).toMatchObject({ mediaAssetId: 'media-1', operation: 'delete' });
    expect(storageFrom).toHaveBeenCalledWith('caizen-private');
    expect(snapshotActive).toBe(false);
  });
});
