import type { MediaAsset } from '../types';
import {
  deleteStoreValue,
  getAllStoreValues,
  getStoreValue,
  openCaizenDatabase,
  putStoreValue,
  transactionDone,
} from './database';
import { STORES } from './schema';

export async function putMediaAsset(asset: MediaAsset): Promise<void> {
  await putStoreValue(STORES.media, asset);
}

export async function getMediaAsset(id: string): Promise<MediaAsset | undefined> {
  return getStoreValue<MediaAsset>(STORES.media, id);
}

export async function listMediaAssets(profileId?: string): Promise<MediaAsset[]> {
  if (profileId) {
    const db = await openCaizenDatabase();
    const transaction = db.transaction(STORES.media, 'readonly');
    const index = transaction.objectStore(STORES.media).index('profileId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(profileId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  const assets = await getAllStoreValues<MediaAsset>(STORES.media);
  return assets;
}

export async function listOwnerMedia(ownerType: string, ownerId: string): Promise<MediaAsset[]> {
  const db = await openCaizenDatabase();
  const transaction = db.transaction(STORES.media, 'readonly');
  const index = transaction.objectStore(STORES.media).index('owner');
  return new Promise((resolve, reject) => {
    const request = index.getAll([ownerType, ownerId]);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMediaAssetRecord(id: string): Promise<void> {
  await deleteStoreValue(STORES.media, id);
}

export async function putMediaBlob(id: string, blob: Blob, variant: 'full' | 'thumbnail') {
  await putStoreValue(STORES.mediaBlobs, { id: `${id}:${variant}`, blob });
}

export async function getMediaBlob(id: string, variant: 'full' | 'thumbnail') {
  return (await getStoreValue<{ id: string; blob: Blob }>(
    STORES.mediaBlobs,
    `${id}:${variant}`,
  ))?.blob;
}

export async function deleteMediaBlobs(id: string): Promise<void> {
  const db = await openCaizenDatabase();
  const transaction = db.transaction(STORES.mediaBlobs, 'readwrite');
  transaction.objectStore(STORES.mediaBlobs).delete(`${id}:full`);
  transaction.objectStore(STORES.mediaBlobs).delete(`${id}:thumbnail`);
  await transactionDone(transaction);
}
