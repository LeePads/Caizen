import { afterEach, describe, expect, it } from 'vitest';
import {
  getMediaAsset,
  getMediaBlob,
  putMediaAsset,
  putMediaBlob,
} from '@/lib/storage/media-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import { cleanupProfileMedia } from '@/lib/storage/profile-media-cleanup';

const asset = (id: string, profileId: string) => ({
  id,
  profileId,
  ownerType: 'profile' as const,
  ownerId: profileId,
  role: 'attachment' as const,
  fileName: `${id}.txt`,
  mimeType: 'text/plain',
  sizeBytes: 5,
  syncStatus: 'local-only' as const,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
});

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('profile media cleanup integration', () => {
  it('removes only one profile metadata and web blobs', async () => {
    await putMediaAsset(asset('asset-a', 'profile-a'));
    await putMediaAsset(asset('asset-b', 'profile-b'));
    await putMediaBlob('asset-a', new Blob(['bytes']), 'full');
    await putMediaBlob('asset-b', new Blob(['other']), 'full');

    await expect(cleanupProfileMedia('profile-a')).resolves.toMatchObject({
      attempted: 1,
      deleted: 1,
      failedIds: [],
    });
    await expect(getMediaAsset('asset-a')).resolves.toBeUndefined();
    await expect(getMediaBlob('asset-a', 'full')).resolves.toBeUndefined();
    await expect(getMediaAsset('asset-b')).resolves.toMatchObject({
      profileId: 'profile-b',
    });
    await expect(getMediaBlob('asset-b', 'full')).resolves.toBeInstanceOf(Blob);
  });
});
