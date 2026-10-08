import type { MediaAsset } from '../types';
import { isNativeApp } from '../platform';
import {
  deletePrivateMedia,
  privateMediaExists,
} from '../native/media-filesystem';
import {
  deleteMediaBlobs,
  getMediaBlob,
  listMediaAssets,
  putMediaAsset,
} from './media-repository';
import { revokeMediaDisplayUrls } from './media-storage';

const CACHE_KEY = 'caizen-cloud-media-cache-v1';
export const CLOUD_MEDIA_CACHE_LIMIT_BYTES = 500 * 1024 * 1024;

type CacheEntry = {
  assetId: string;
  profileId: string;
  sizeBytes: number;
  lastAccessedAt: string;
};

const readEntries = (): CacheEntry[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is CacheEntry => Boolean(
      entry && typeof entry === 'object' &&
      typeof (entry as CacheEntry).assetId === 'string' &&
      typeof (entry as CacheEntry).profileId === 'string' &&
      Number.isSafeInteger((entry as CacheEntry).sizeBytes) &&
      (entry as CacheEntry).sizeBytes >= 0 &&
      typeof (entry as CacheEntry).lastAccessedAt === 'string',
    ));
  } catch {
    return [];
  }
};

const writeEntries = (entries: CacheEntry[]) => {
  if (typeof localStorage === 'undefined') return;
  if (entries.length === 0) {
    localStorage.removeItem(CACHE_KEY);
    return;
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
};

const removeEntry = (assetId: string) => {
  writeEntries(readEntries().filter(entry => entry.assetId !== assetId));
};

export function listCloudMediaCacheEntries(): CacheEntry[] {
  return readEntries().map(entry => ({ ...entry }));
}

export function touchCloudMediaCache(asset: MediaAsset): void {
  if (!asset.remotePath || typeof localStorage === 'undefined') return;
  const entries = readEntries().filter(entry => entry.assetId !== asset.id);
  entries.push({
    assetId: asset.id,
    profileId: asset.profileId,
    sizeBytes: asset.sizeBytes,
    lastAccessedAt: new Date().toISOString(),
  });
  writeEntries(entries);
}

/**
 * Removes only locally cached bytes. The metadata row and remotePath remain,
 * making the asset Cloud-backed uncached rather than deleted.
 */
export async function evictCloudMediaCopy(asset: MediaAsset): Promise<boolean> {
  if (!asset.remotePath) return false;

  revokeMediaDisplayUrls(asset.id);
  if (isNativeApp()) {
    await Promise.all([
      deletePrivateMedia(asset.localPath),
      deletePrivateMedia(asset.thumbnailPath),
    ]);
    const [fullExists, thumbnailExists] = await Promise.all([
      privateMediaExists(asset.localPath),
      privateMediaExists(asset.thumbnailPath),
    ]);
    if (fullExists || thumbnailExists) {
      throw new Error('One or more cached media files could not be evicted.');
    }
  } else {
    await deleteMediaBlobs(asset.id);
  }

  await putMediaAsset({
    ...asset,
    localPath: undefined,
    thumbnailPath: undefined,
  });
  removeEntry(asset.id);
  return true;
}

// Bookkeeping is a read-modify-write over one localStorage key plus eviction.
// Lazy resolution and bounded-concurrency restores can now finish several
// downloads at once, so enforcement runs one at a time to keep the index and
// the eviction decision consistent.
let enforcement: Promise<string[]> = Promise.resolve([]);

export function enforceCloudMediaCacheLimit(
  limitBytes = CLOUD_MEDIA_CACHE_LIMIT_BYTES,
): Promise<string[]> {
  const next = enforcement
    .catch(() => undefined)
    .then(() => runCloudMediaCacheLimit(limitBytes));
  enforcement = next.catch(() => []);
  return next;
}

async function runCloudMediaCacheLimit(limitBytes: number): Promise<string[]> {
  const assets = await listMediaAssets();
  const cloudAssets = assets.filter(asset => asset.remotePath && !asset.cloudExcluded);
  const byId = new Map(cloudAssets.map(asset => [asset.id, asset]));
  const entries = readEntries().filter(entry => byId.has(entry.assetId));
  const knownIds = new Set(entries.map(entry => entry.assetId));

  // Rebuild missing bookkeeping conservatively from metadata. A stale index
  // must never make an authoritative local-only asset eligible for eviction.
  for (const asset of cloudAssets) {
    if (!knownIds.has(asset.id)) {
      const hasLocal = isNativeApp()
        ? Boolean(asset.localPath && await privateMediaExists(asset.localPath))
        : Boolean(await getMediaBlob(asset.id, 'full'));
      if (hasLocal) {
        entries.push({
          assetId: asset.id,
          profileId: asset.profileId,
          sizeBytes: asset.sizeBytes,
          lastAccessedAt: asset.updatedAt,
        });
      }
    }
  }

  let total = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const evicted: string[] = [];
  entries.sort((left, right) => left.lastAccessedAt.localeCompare(right.lastAccessedAt));
  for (const entry of entries) {
    if (total <= limitBytes) break;
    const asset = byId.get(entry.assetId);
    if (!asset) continue;
    if (await evictCloudMediaCopy(asset)) {
      total -= entry.sizeBytes;
      evicted.push(asset.id);
    }
  }

  writeEntries(entries.filter(entry => !evicted.includes(entry.assetId)));
  return evicted;
}

export async function clearCloudMediaCache(profileId?: string): Promise<string[]> {
  const assets = await listMediaAssets(profileId);
  const cleared: string[] = [];
  const failures: string[] = [];
  for (const asset of assets) {
    if (!asset.remotePath || asset.cloudExcluded) continue;
    try {
      if (await evictCloudMediaCopy(asset)) cleared.push(asset.id);
    } catch (error) {
      failures.push(
        `${asset.fileName || asset.id}: ${error instanceof Error ? error.message : 'Unable to clear cached media.'}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Cloud media cache cleanup could not remove ${failures.length} cached file${failures.length === 1 ? '' : 's'}: ${failures.join('; ')}`,
    );
  }
  return cleared;
}

/** Removes an index entry when an authoritative media row is deleted. */
export function forgetCloudMediaCacheEntry(assetId: string): void {
  removeEntry(assetId);
}
