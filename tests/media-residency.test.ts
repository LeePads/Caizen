import { afterEach, describe, expect, it } from 'vitest';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import { getMediaResidency } from '@/lib/storage/media-residency';
import { shouldAttachCloudMediaRemotePath } from '@/lib/cloud-backup';
import { getMediaAsset, getMediaBlob, putMediaAsset, putMediaBlob } from '@/lib/storage/media-repository';
import { enforceCloudMediaCacheLimit, touchCloudMediaCache } from '@/lib/storage/media-cache';
import type { MediaAsset } from '@/lib/types';

const makeAsset = (id: string, remotePath?: string): MediaAsset => ({
  id,
  profileId: 'profile-1',
  ownerType: 'other',
  ownerId: 'record-1',
  role: 'primary',
  fileName: `${id}.txt`,
  mimeType: 'text/plain',
  sizeBytes: 3,
  remotePath,
  syncStatus: 'pending',
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z',
});

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('derived media residency', () => {
  it('derives local-only from local bytes and no remote path', async () => {
    const asset = makeAsset('local');
    await putMediaAsset(asset);
    await putMediaBlob(asset.id, new Blob(['abc'], { type: asset.mimeType }), 'full');
    expect(await getMediaResidency(asset)).toBe('local-only');
  });

  it('distinguishes Cloud-backed uncached and cached media', async () => {
    const uncached = makeAsset('uncached', 'user/profile-1/uncached/uncached.txt');
    await putMediaAsset(uncached);
    expect(await getMediaResidency(uncached)).toBe('cloud-uncached');

    const cached = makeAsset('cached', 'user/profile-1/cached/cached.txt');
    await putMediaAsset(cached);
    await putMediaBlob(cached.id, new Blob(['abc'], { type: cached.mimeType }), 'full');
    expect(await getMediaResidency(cached)).toBe('cloud-cached');
  });

  it('reports unavailable when neither local bytes nor a remote path exists', async () => {
    const asset = makeAsset('missing');
    await putMediaAsset(asset);
    expect(await getMediaResidency(asset)).toBe('unavailable');
  });

  it('evicts only Cloud-derived bytes and keeps their metadata', async () => {
    const localOnly = makeAsset('authoritative');
    await putMediaAsset(localOnly);
    await putMediaBlob(localOnly.id, new Blob(['abc'], { type: localOnly.mimeType }), 'full');

    const cached = makeAsset('cached-for-eviction', 'user/profile-1/cached-for-eviction/cached-for-eviction.txt');
    await putMediaAsset(cached);
    await putMediaBlob(cached.id, new Blob(['abc'], { type: cached.mimeType }), 'full');
    touchCloudMediaCache(cached);

    await enforceCloudMediaCacheLimit(0);

    expect(await getMediaResidency(localOnly)).toBe('local-only');
    expect(await getMediaBlob(cached.id, 'full')).toBeUndefined();
    expect((await getMediaAsset(cached.id))?.remotePath).toBe(cached.remotePath);
    expect(await getMediaResidency(cached)).toBe('cloud-uncached');
  });

  it('keeps checksum-unknown local-authoritative bytes local-only', () => {
    expect(shouldAttachCloudMediaRemotePath({
      existing: { remotePath: undefined, checksum: undefined },
      existingHasLocal: true,
      remoteChecksum: 'remote-checksum',
    })).toBe(false);
    expect(shouldAttachCloudMediaRemotePath({
      existing: { remotePath: undefined, checksum: 'same-checksum' },
      existingHasLocal: true,
      remoteChecksum: 'same-checksum',
    })).toBe(true);
    expect(shouldAttachCloudMediaRemotePath({
      existing: { remotePath: 'user/profile/asset/old.png', checksum: undefined },
      existingHasLocal: true,
      remotePath: 'user/profile/asset/new.png',
      remoteChecksum: undefined,
    })).toBe(false);
    expect(shouldAttachCloudMediaRemotePath({
      existing: { remotePath: 'user/profile/asset/same.png', checksum: 'old-checksum' },
      existingHasLocal: true,
      remotePath: 'user/profile/asset/same.png',
      remoteChecksum: 'new-checksum',
    })).toBe(false);
  });
});
