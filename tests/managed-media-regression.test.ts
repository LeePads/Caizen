import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildCaizenMediaThumbnailStoragePath,
  downloadCaizenPrivateMedia,
  getCloudUser,
} = vi.hoisted(() => ({
  buildCaizenMediaThumbnailStoragePath: vi.fn(
    (userId: string, profileId: string, mediaAssetId: string) =>
      `${userId}/${profileId}/${mediaAssetId}/${mediaAssetId}-thumbnail.webp`,
  ),
  downloadCaizenPrivateMedia: vi.fn(),
  getCloudUser: vi.fn(),
}));

vi.mock('@/lib/caizen-cloud-repository', () => ({
  buildCaizenMediaThumbnailStoragePath,
  downloadCaizenPrivateMedia,
}));

vi.mock('@/lib/cloud-backup', () => ({ getCloudUser }));

vi.mock('@/lib/storage/media-cache', () => ({
  enforceCloudMediaCacheLimit: vi.fn(),
  touchCloudMediaCache: vi.fn(),
}));

import type { MediaAsset } from '@/lib/types';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';
import {
  getMediaAsset,
  getMediaBlob,
  putMediaAsset,
  putMediaBlob,
} from '@/lib/storage/media-repository';
import {
  mediaStorage,
  releaseMediaDisplayUrl,
  revokeMediaDisplayUrls,
} from '@/lib/storage/media-storage';
import { resolveMedia } from '@/lib/storage/media-resolver';
import { invalidateMediaSession, setMediaSessionUser } from '@/lib/storage/media-session';

const profileId = 'profile-media-regression';
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let nextObjectUrl = 0;

const asset = (id: string, overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  id,
  profileId,
  ownerType: 'inventory',
  ownerId: `inventory-${id}`,
  role: 'primary',
  fileName: `${id}.png`,
  mimeType: 'image/png',
  sizeBytes: pngBytes.byteLength,
  width: 1,
  height: 1,
  checksum: undefined,
  syncStatus: 'pending',
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z',
  ...overrides,
});

const installObjectUrlSpy = () => {
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) =>
    `blob:managed-media-${(blob as Blob).size}-${nextObjectUrl++}`,
  );
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  return { createObjectUrl, revokeObjectUrl };
};

describe('managed media rendering regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMediaSessionUser(null);
    getCloudUser.mockResolvedValue({ id: 'user-media-regression' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    nextObjectUrl = 0;
    await resetCaizenDatabaseForTests();
  });

  it('resolves newly stored local media immediately and falls back from missing thumbnail to full bytes', async () => {
    const { revokeObjectUrl } = installObjectUrlSpy();
    const id = 'local-media-immediate';
    await putMediaAsset(asset(id));
    await putMediaBlob(id, new Blob([pngBytes], { type: 'image/png' }), 'full');

    const resolved = await resolveMedia(id, { expectedProfileId: profileId });

    expect(resolved.state).toBe('local');
    expect(resolved.url).toMatch(/^blob:managed-media-/);
    expect(downloadCaizenPrivateMedia).not.toHaveBeenCalled();
    resolved.release?.();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('keeps a browser object URL alive until every consumer releases its lease', async () => {
    const { createObjectUrl, revokeObjectUrl } = installObjectUrlSpy();
    const id = 'object-url-leases';
    await putMediaAsset(asset(id));
    await putMediaBlob(id, new Blob([pngBytes], { type: 'image/png' }), 'full');

    const first = await mediaStorage.getDisplayUrl(id, 'thumbnail', profileId);
    const second = await mediaStorage.getDisplayUrl(id, 'thumbnail', profileId);

    expect(second).toBe(first);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    releaseMediaDisplayUrl(id, 'thumbnail');
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    releaseMediaDisplayUrl(id, 'thumbnail');
    expect(revokeObjectUrl).toHaveBeenCalledWith(first);
  });

  it('revokes only an obsolete replacement URL', async () => {
    const { revokeObjectUrl } = installObjectUrlSpy();
    const id = 'object-url-replacement';
    await putMediaAsset(asset(id));
    await putMediaBlob(id, new Blob([pngBytes], { type: 'image/png' }), 'full');

    const oldUrl = await mediaStorage.getDisplayUrl(id, 'full', profileId);
    revokeMediaDisplayUrls(id, 'full');
    const newUrl = await mediaStorage.getDisplayUrl(id, 'full', profileId);

    expect(newUrl).not.toBe(oldUrl);
    expect(revokeObjectUrl).toHaveBeenCalledWith(oldUrl);
    releaseMediaDisplayUrl(id, 'full');
  });

  it('deduplicates remote requests without allowing an early unmount to revoke the sibling URL', async () => {
    const id = 'remote-shared-request';
    await putMediaAsset(asset(id, {
      remotePath: `user-media-regression/${profileId}/${id}/${id}.png`,
      syncStatus: 'synced',
    }));
    let finishDownload!: (blob: Blob) => void;
    const download = new Promise<Blob>((resolve) => { finishDownload = resolve; });
    downloadCaizenPrivateMedia.mockReturnValue(download);
    const { revokeObjectUrl } = installObjectUrlSpy();

    const firstConsumer = resolveMedia(id, { expectedProfileId: profileId });
    const firstUnmount = firstConsumer.then((resolved) => {
      resolved.release?.();
      return resolved;
    });
    const secondConsumer = resolveMedia(id, { expectedProfileId: profileId });
    await vi.waitFor(() => expect(downloadCaizenPrivateMedia).toHaveBeenCalledTimes(1));

    finishDownload(new Blob(['thumbnail'], { type: 'image/webp' }));
    const [first, second] = await Promise.all([firstUnmount, secondConsumer]);

    expect(first.state).toBe('remote');
    expect(second.state).toBe('remote');
    expect(second.url).toBe(first.url);
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    second.release?.();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('bootstraps a restored media session before the first remote request', async () => {
    const id = 'cold-start-remote-media';
    await putMediaAsset(asset(id, {
      remotePath: `user-media-regression/${profileId}/${id}/${id}.png`,
      syncStatus: 'synced',
    }));
    downloadCaizenPrivateMedia.mockResolvedValue(new Blob(['thumbnail'], { type: 'image/webp' }));
    const { revokeObjectUrl } = installObjectUrlSpy();

    const resolved = await resolveMedia(id, { expectedProfileId: profileId });

    expect(resolved.state).toBe('remote');
    expect(downloadCaizenPrivateMedia).toHaveBeenCalledTimes(1);
    resolved.release?.();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('lazily resolves a metadata-only Cloud asset into a local full-media cache', async () => {
    const id = 'remote-full-cache';
    await putMediaAsset(asset(id, {
      remotePath: `user-media-regression/${profileId}/${id}/${id}.png`,
      syncStatus: 'synced',
    }));
    downloadCaizenPrivateMedia.mockResolvedValue(new Blob([pngBytes], { type: 'image/png' }));
    const { revokeObjectUrl } = installObjectUrlSpy();

    const resolved = await resolveMedia(id, {
      variant: 'full',
      purpose: 'explicit-open',
      expectedProfileId: profileId,
    });

    expect(resolved.state).toBe('remote');
    expect(resolved.url).toMatch(/^blob:managed-media-/);
    expect(downloadCaizenPrivateMedia).toHaveBeenCalledWith(
      `user-media-regression/${profileId}/${id}/${id}.png`,
      { profileId, mediaAssetId: id },
      expect.any(AbortSignal),
    );
    resolved.release?.();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('recovers an older Wallet asset when it is explicitly opened and its Cloud thumbnail is missing', async () => {
    const id = 'older-wallet-media';
    const remotePath = `user-media-regression/${profileId}/${id}/${id}.png`;
    await putMediaAsset(asset(id, {
      ownerType: 'finance',
      ownerId: 'wallet-legacy',
      remotePath,
      syncStatus: 'synced',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }));
    // This older object has no deterministic thumbnail in Cloud.
    downloadCaizenPrivateMedia.mockImplementation(async (storagePath: string) =>
      storagePath === remotePath
        ? new Blob([pngBytes], { type: 'image/png' })
        : Promise.reject(new Error('The requested Cloud thumbnail was not found.')),
    );
    const { revokeObjectUrl } = installObjectUrlSpy();

    // Normal display stops at the missing thumbnail so a library grid can
    // never pull full originals; only an explicit open recovers the object.
    const displayed = await resolveMedia(id, {
      expectedProfileId: profileId,
      purpose: 'display',
    });
    expect(displayed.state).toBe('unavailable');
    expect(downloadCaizenPrivateMedia).toHaveBeenCalledTimes(1);

    const resolved = await resolveMedia(id, {
      expectedProfileId: profileId,
      purpose: 'explicit-open',
    });

    expect(resolved.state).toBe('remote');
    expect(resolved.url).toMatch(/^blob:managed-media-/);
    expect(downloadCaizenPrivateMedia).toHaveBeenNthCalledWith(
      2,
      `user-media-regression/${profileId}/${id}/${id}-thumbnail.webp`,
      { profileId, mediaAssetId: id },
      expect.any(AbortSignal),
    );
    expect(downloadCaizenPrivateMedia).toHaveBeenNthCalledWith(
      3,
      remotePath,
      { profileId, mediaAssetId: id },
      expect.any(AbortSignal),
    );
    expect(await getMediaBlob(id, 'full')).toBeInstanceOf(Blob);
    expect((await getMediaAsset(id))?.remotePath).toBe(remotePath);

    resolved.release?.();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('accepts a request for the current Cloud account and rejects work after session invalidation', async () => {
    const acceptedId = 'current-session-media';
    await putMediaAsset(asset(acceptedId, {
      remotePath: `user-media-regression/${profileId}/${acceptedId}/${acceptedId}.png`,
      syncStatus: 'synced',
    }));
    downloadCaizenPrivateMedia.mockResolvedValue(new Blob(['thumbnail'], { type: 'image/webp' }));
    const accepted = await resolveMedia(acceptedId, { expectedProfileId: profileId });
    expect(accepted.state).toBe('remote');
    accepted.release?.();

    const staleId = 'stale-session-media';
    await putMediaAsset(asset(staleId, {
      remotePath: `user-media-regression/${profileId}/${staleId}/${staleId}.png`,
      syncStatus: 'synced',
    }));
    let finishDownload!: (blob: Blob) => void;
    downloadCaizenPrivateMedia.mockReturnValue(new Promise<Blob>((resolve) => { finishDownload = resolve; }));
    const pending = resolveMedia(staleId, { expectedProfileId: profileId });
    await vi.waitFor(() => expect(downloadCaizenPrivateMedia).toHaveBeenCalledTimes(2));
    await invalidateMediaSession();
    finishDownload(new Blob(['thumbnail'], { type: 'image/webp' }));

    const stale = await pending;
    expect(stale.state).toBe('unavailable');
    expect(stale.message).toContain('session changed');
  });

  it('keeps the Android camera-to-managed-media contracts intact', () => {
    const picker = readFileSync('lib/native/media-picker.ts', 'utf8');
    const filesystem = readFileSync('lib/native/media-filesystem.ts', 'utf8');
    const residency = readFileSync('lib/storage/media-residency.ts', 'utf8');
    const storage = readFileSync('lib/storage/media-storage.ts', 'utf8');

    expect(picker).toContain('Camera.getPhoto');
    expect(picker).toContain('resultType: CameraResultType.Uri');
    expect(picker).toContain('fetch(photo.webPath)');
    expect(filesystem).toContain('directory: Directory.Data');
    expect(filesystem).toContain('recursive: true');
    expect(filesystem).toContain('Capacitor.convertFileSrc(uri)');
    expect(residency).toContain('if (asset.thumbnailPath && await privateMediaExists(asset.thumbnailPath)) return true;');
    expect(storage).toContain('thumbnailPath ?? asset.localPath');
  });

  it('keeps Wallet and Inventory on the shared managed-media write and renderer flow', () => {
    const wallet = readFileSync('components/modals/WalletModal.tsx', 'utf8');
    const balance = readFileSync('components/sections/BalanceSection.tsx', 'utf8');
    const inventoryModal = readFileSync('components/modals/InventoryModal.tsx', 'utf8');
    const inventorySection = readFileSync('components/sections/InventorySection.tsx', 'utf8');

    expect(wallet).toContain('MediaAssetImage');
    expect(balance).toContain('mediaStorage.save(pendingImage.blob');
    expect(balance).toContain('avatarAssetId: nextAssetId');
    expect(inventoryModal).toContain('const asset = await mediaStorage.save(blob');
    expect(inventoryModal).toContain('setPhotoAssetIds((current) => [...current, asset.id]);');
    expect(inventorySection).toContain('assetId={item.photoAssetIds[0]}');
    expect(inventorySection).toContain('MediaAssetImage');
  });
});
