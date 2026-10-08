import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseClient } = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient,
}));

import {
  buildCaizenMediaStoragePath,
  caizenPrivateMediaExists,
  deleteCaizenMediaAssetMetadata,
  uploadCaizenPrivateMedia,
  upsertCaizenMediaAsset,
} from '@/lib/caizen-cloud-repository';

const mediaInput = {
  id: 'media-1',
  profileId: 'profile-1',
  recordType: 'inventory',
  recordId: 'record-1',
  role: 'attachment' as const,
  originalName: 'renamed.png',
  mimeType: 'image/png',
  sizeBytes: 128,
};

describe('private Cloud media ownership', () => {
  beforeEach(() => {
    getSupabaseClient.mockReset();
  });

  it('uses the media ID and MIME extension for generated object keys', () => {
    expect(buildCaizenMediaStoragePath(
      'user-1',
      'profile-1',
      'media-1',
      'image/png',
    )).toBe('user-1/profile-1/media-1/media-1.png');
    expect(buildCaizenMediaStoragePath(
      'user-1',
      'profile-1',
      'media-2',
      'image/jpeg',
    )).toBe('user-1/profile-1/media-2/media-2.jpg');
    expect(buildCaizenMediaStoragePath(
      'user-1',
      'profile-1',
      'media-3',
      'application/octet-stream',
    )).toBe('user-1/profile-1/media-3/media-3.bin');
  });

  it('keeps unsafe, Unicode, spaced, and duplicate original names as metadata only', async () => {
    const upsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => ({
      select: () => ({
        single: () => Promise.resolve({
          data: {
            id: payload.id,
            user_id: 'user-1',
            profile_id: payload.profile_id,
            record_type: payload.record_type,
            record_id: payload.record_id,
            role: payload.role,
            storage_path: payload.storage_path,
            original_name: payload.original_name,
            mime_type: payload.mime_type,
            size_bytes: payload.size_bytes,
            checksum: null,
            width: null,
            height: null,
            created_at: '2026-08-09T00:00:00.000Z',
            updated_at: '2026-08-09T00:01:00.000Z',
            deleted_at: null,
          },
          error: null,
        }),
      }),
    }));
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: () => ({ upsert }),
    });

    await upsertCaizenMediaAsset({
      ...mediaInput,
      id: 'media-braces',
      originalName: '{A441AB9D-5936-4F8F-B1DE-8F33B55C7961}.png',
    });
    await upsertCaizenMediaAsset({
      ...mediaInput,
      id: 'media-spaces',
      originalName: 'my photo (final) é.png',
    });

    expect(upsert.mock.calls[0][0]).toMatchObject({
      storage_path: 'user-1/profile-1/media-braces/media-braces.png',
      original_name: '{A441AB9D-5936-4F8F-B1DE-8F33B55C7961}.png',
    });
    expect(upsert.mock.calls[1][0]).toMatchObject({
      storage_path: 'user-1/profile-1/media-spaces/media-spaces.png',
      original_name: 'my photo (final) é.png',
    });
    expect(upsert.mock.calls[0][0].storage_path).not.toBe(upsert.mock.calls[1][0].storage_path);
  });

  it('preserves an existing owned path when file metadata changes', async () => {
    const upsert = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({
          data: {
            id: 'media-1',
            user_id: 'user-1',
            profile_id: 'profile-1',
            record_type: 'inventory',
            record_id: 'record-1',
            role: 'attachment',
            storage_path: 'user-1/profile-1/media-1/original.png',
            original_name: 'renamed.png',
            mime_type: 'image/png',
            size_bytes: 128,
            checksum: null,
            width: null,
            height: null,
            created_at: '2026-08-09T00:00:00.000Z',
            updated_at: '2026-08-09T00:01:00.000Z',
            deleted_at: null,
          },
          error: null,
        }),
      }),
    });
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: () => ({ upsert }),
    });

    await upsertCaizenMediaAsset({
      ...mediaInput,
      storagePath: 'user-1/profile-1/media-1/original.png',
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        profile_id: 'profile-1',
        storage_path: 'user-1/profile-1/media-1/original.png',
        original_name: 'renamed.png',
      }),
      { onConflict: 'user_id,id' },
    );
  });

  it('rejects metadata paths outside the signed-in profile boundary', async () => {
    const from = vi.fn();
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from,
    });

    await expect(upsertCaizenMediaAsset({
      ...mediaInput,
      storagePath: 'user-1/another-profile/media-1/original.png',
    })).rejects.toThrow('outside the signed-in user storage boundary');

    expect(from).not.toHaveBeenCalled();
  });

  it('rejects object writes through mismatched legacy metadata paths', async () => {
    const from = vi.fn();
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      storage: { from },
    });

    await expect(uploadCaizenPrivateMedia(
      'user-1/another-profile/media-1/original.png',
      new Blob(['private']),
      'image/png',
      { profileId: 'profile-1', mediaAssetId: 'media-1' },
    )).rejects.toThrow('outside the signed-in user storage boundary');

    expect(from).not.toHaveBeenCalled();
  });

  it('checks full-object existence within the authenticated asset folder', async () => {
    const list = vi.fn().mockResolvedValue({ data: [{ name: 'media-1.png' }], error: null });
    const storageFrom = vi.fn().mockReturnValue({ list });
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      storage: { from: storageFrom },
    });

    await expect(caizenPrivateMediaExists(
      'user-1/profile-1/media-1/media-1.png',
      { profileId: 'profile-1', mediaAssetId: 'media-1' },
    )).resolves.toBe(true);
    expect(list).toHaveBeenCalledWith('user-1/profile-1/media-1', {
      limit: 1,
      search: 'media-1.png',
    });
  });

  it('hard-deletes only the signed-in user media metadata row', async () => {
    const eq = vi.fn();
    const deletion = {
      eq,
    };
    eq.mockReturnValueOnce(deletion).mockResolvedValueOnce({ error: null });
    const deleteOperation = vi.fn().mockReturnValue(deletion);
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({ delete: deleteOperation }),
    });

    await deleteCaizenMediaAssetMetadata('media-1');

    expect(deleteOperation).toHaveBeenCalledOnce();
    expect(eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1');
    expect(eq).toHaveBeenNthCalledWith(2, 'id', 'media-1');
  });
});
