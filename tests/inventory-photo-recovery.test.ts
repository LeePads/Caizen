import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RestoredListenerEvent } from '@capacitor/app';

const mocks = vi.hoisted(() => ({
  preferences: new Map<string, string>(),
  assets: new Map<string, { id: string; profileId: string; ownerType: string; ownerId: string; role: string; createdAt: string }>(),
  set: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/native/native-preferences', () => ({
  getNativePreference: async (key: string) => mocks.preferences.get(key) ?? null,
  setNativePreference: mocks.set,
  removeNativePreference: mocks.remove,
}));
vi.mock('@/lib/native/media-picker', () => ({
  photoToMedia: async () => ({ blob: new Blob(['photo'], { type: 'image/jpeg' }), fileName: 'camera.jpg' }),
}));
vi.mock('@/lib/storage/media-repository', () => ({
  getMediaAsset: async (id: string) => mocks.assets.get(id),
  listOwnerMedia: async (ownerType: string, ownerId: string) =>
    [...mocks.assets.values()].filter(asset => asset.ownerType === ownerType && asset.ownerId === ownerId),
}));
vi.mock('@/lib/storage/media-storage', () => ({
  mediaStorage: {
    save: mocks.save,
    delete: mocks.delete,
    exists: async (id: string) => mocks.assets.has(id),
  },
}));

import {
  markInventoryCameraRequest,
  recoverInventoryCameraResult,
  listRecoveredInventoryPhotos,
} from '@/lib/native/inventory-photo-recovery';

const requestKey = 'caizen-inventory-camera-request-v1';
const recoveredKey = 'caizen-inventory-recovered-photos-v1';
const restoredPhoto = {
  pluginId: 'Camera', methodName: 'getPhoto', success: true, data: { webPath: 'capacitor://photo' },
} as RestoredListenerEvent;
const profiles = new Set(['profile-a']);

describe('Inventory Camera recovery', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    mocks.preferences.clear();
    mocks.assets.clear();
    mocks.set.mockReset().mockImplementation(async (key: string, value: string) => {
      mocks.preferences.set(key, value);
    });
    mocks.remove.mockReset().mockImplementation(async (key: string) => {
      mocks.preferences.delete(key);
    });
    mocks.save.mockReset().mockImplementation(async (_blob: Blob, metadata: { profileId: string; ownerType: string; ownerId: string; role: string }) => {
      const asset = { id: `asset-${mocks.assets.size + 1}`, ...metadata, createdAt: new Date().toISOString() };
      mocks.assets.set(asset.id, asset);
      return asset;
    });
    mocks.delete.mockReset().mockImplementation(async (id: string) => {
      mocks.assets.delete(id);
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reuses a persisted entry when marker removal fails', async () => {
    await markInventoryCameraRequest('profile-a', 'draft-a');
    mocks.remove.mockRejectedValueOnce(new Error('Preferences unavailable'));

    await expect(recoverInventoryCameraResult(restoredPhoto, profiles)).resolves.toBe('recovered');
    await expect(recoverInventoryCameraResult(restoredPhoto, profiles)).resolves.toBe('recovered');

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(await listRecoveredInventoryPhotos()).toHaveLength(1);
    expect(mocks.preferences.has(requestKey)).toBe(false);
  });

  it('deletes only a newly saved photo when entry persistence fails before commit', async () => {
    await markInventoryCameraRequest('profile-a', 'draft-a');
    mocks.set.mockImplementationOnce(async () => { throw new Error('write failed'); });

    await expect(recoverInventoryCameraResult(restoredPhoto, profiles)).rejects.toThrow('write failed');
    expect(mocks.delete).toHaveBeenCalledWith('asset-1');
    expect(mocks.assets.size).toBe(0);
    expect(mocks.preferences.has(requestKey)).toBe(true);

    await expect(recoverInventoryCameraResult(restoredPhoto, profiles)).resolves.toBe('recovered');
    expect(await listRecoveredInventoryPhotos()).toHaveLength(1);
  });

  it('recognizes a committed entry even if the Preferences write rejects', async () => {
    await markInventoryCameraRequest('profile-a', 'draft-a');
    mocks.set.mockImplementationOnce(async (key: string, value: string) => {
      mocks.preferences.set(key, value);
      throw new Error('late failure');
    });

    await expect(recoverInventoryCameraResult(restoredPhoto, profiles)).resolves.toBe('recovered');
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(await listRecoveredInventoryPhotos()).toHaveLength(1);
  });

  it('reuses the saved asset if compensation fails after an entry write failure', async () => {
    await markInventoryCameraRequest('profile-a', 'draft-a');
    mocks.set.mockImplementationOnce(async () => { throw new Error('write failed'); });
    mocks.delete.mockRejectedValueOnce(new Error('delete failed'));

    await expect(recoverInventoryCameraResult(restoredPhoto, profiles)).rejects.toThrow('write failed');
    expect(mocks.assets.size).toBe(1);

    await expect(recoverInventoryCameraResult(restoredPhoto, profiles)).resolves.toBe('recovered');
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(await listRecoveredInventoryPhotos()).toHaveLength(1);
  });

  it('does not recover into a removed profile', async () => {
    await markInventoryCameraRequest('profile-a', 'draft-a');
    await expect(recoverInventoryCameraResult(restoredPhoto, new Set())).resolves.toBe('unowned');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.preferences.has(requestKey)).toBe(true);
  });

  it('accepts an existing v1 marker and saved photo without saving it twice', async () => {
    const createdAt = Date.now() - 1000;
    mocks.preferences.set(requestKey, JSON.stringify({ profileId: 'profile-a', ownerId: 'draft-a', createdAt }));
    mocks.assets.set('legacy-photo', {
      id: 'legacy-photo', profileId: 'profile-a', ownerType: 'inventory', ownerId: 'draft-a',
      role: 'primary', createdAt: new Date(createdAt + 500).toISOString(),
    });

    await expect(recoverInventoryCameraResult(restoredPhoto, profiles)).resolves.toBe('recovered');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(await listRecoveredInventoryPhotos()).toMatchObject([{ assetId: 'legacy-photo', profileId: 'profile-a' }]);
    expect(mocks.preferences.has(recoveredKey)).toBe(true);
  });

  it('recognizes a v1 recovered-list entry without adding another entry', async () => {
    const createdAt = Date.now() - 1000;
    mocks.preferences.set(requestKey, JSON.stringify({ profileId: 'profile-a', ownerId: 'draft-a', createdAt }));
    mocks.assets.set('legacy-photo', {
      id: 'legacy-photo', profileId: 'profile-a', ownerType: 'inventory', ownerId: 'draft-a',
      role: 'primary', createdAt: new Date(createdAt + 500).toISOString(),
    });
    mocks.preferences.set(recoveredKey, JSON.stringify([{
      profileId: 'profile-a', assetId: 'legacy-photo', createdAt: Date.now(),
    }]));

    await expect(recoverInventoryCameraResult(restoredPhoto, profiles)).resolves.toBe('recovered');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(await listRecoveredInventoryPhotos()).toHaveLength(1);
  });
});
