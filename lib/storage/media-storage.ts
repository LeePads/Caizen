import type {
  CaizenMediaAsset,
  MediaAsset,
  MediaAssetRole,
  MediaOwnerType,
} from '../types';
import { isNativeApp } from '../platform';
import {
  deletePrivateMedia,
  privateMediaExists,
  privateMediaUrl,
  readPrivateMedia,
  writePrivateMedia,
} from '../native/media-filesystem';
import {
  deleteMediaAssetRecord,
  deleteMediaBlobs,
  getMediaAsset,
  getMediaBlob,
  listMediaAssets,
  listOwnerMedia,
  putMediaAsset,
  putMediaBlob,
} from './media-repository';
import { mediaLimits, sanitizeFileName, validateMediaBlob } from './media-validation';

export type SaveMediaInput = {
  profileId: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  role: MediaAssetRole;
  fileName: string;
};

export interface MediaStorage {
  save(input: Blob, metadata: SaveMediaInput): Promise<MediaAsset>;
  restore(input: Blob, cloudAsset: CaizenMediaAsset): Promise<MediaAsset>;
  read(assetId: string, expectedProfileId?: string): Promise<Blob>;
  getDisplayUrl(assetId: string, variant?: 'thumbnail' | 'full', expectedProfileId?: string): Promise<string>;
  /** Remove local bytes while retaining Cloud metadata and the remote path. */
  evictLocalCopy(assetId: string, expectedProfileId?: string): Promise<MediaAsset>;
  delete(assetId: string): Promise<void>;
  exists(assetId: string): Promise<boolean>;
}

const extensionFor = (mimeType: string) =>
  ({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
  })[mimeType] ?? 'bin';

const digest = async (blob: Blob) => {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const imageOutputType = (inputType: string) => {
  if (inputType === 'image/png') return 'image/png';
  if (inputType === 'image/webp') return 'image/webp';
  return 'image/jpeg';
};

const resizeImage = async (
  blob: Blob,
  maxDimension: number,
  quality: number,
  outputType = imageOutputType(blob.type),
) => {
  if (!blob.type.startsWith('image/')) return { blob };

  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', {
      alpha: outputType !== 'image/jpeg',
    });
    if (!context) throw new Error('Image processing is unavailable.');
    context.drawImage(bitmap, 0, 0, width, height);

    const output = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        result =>
          result
            ? resolve(result)
            : reject(new Error('Image processing failed.')),
        outputType,
        outputType === 'image/png' ? undefined : quality,
      ),
    );
    return { blob: output, width, height };
  } finally {
    bitmap.close();
  }
};

/** Creates the deterministic Cloud thumbnail rendition without persisting it. */
export async function createMediaThumbnail(blob: Blob): Promise<Blob | undefined> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) return undefined;
  try {
    return (await resizeImage(blob, 480, 0.76, 'image/webp')).blob;
  } catch {
    return undefined;
  }
}

const replaceFileExtension = (fileName: string, extension: string) => {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '') || 'media';
  return `${withoutExtension}.${extension}`;
};

type ObjectUrlEntry = {
  url: string;
  references: number;
};

const objectUrls = new Map<string, ObjectUrlEntry>();

const MEDIA_OWNER_TYPES = new Set<MediaOwnerType>([
  'inventory',
  'journal',
  'health',
  'finance',
  'wishlist',
  'work',
  'document',
  'career',
  'profile',
  'other',
]);

export function releaseMediaDisplayUrl(assetId: string, variant: 'thumbnail' | 'full' = 'thumbnail') {
  const key = `${assetId}:${variant}`;
  const entry = objectUrls.get(key);
  if (!entry) return;
  entry.references -= 1;
  if (entry.references > 0) return;
  URL.revokeObjectURL(entry.url);
  objectUrls.delete(key);
}

/** Acquires another lease on an already shared browser object URL. */
export function retainMediaDisplayUrl(
  assetId: string,
  variant: 'thumbnail' | 'full' = 'thumbnail',
): boolean {
  const entry = objectUrls.get(`${assetId}:${variant}`);
  if (!entry) return false;
  entry.references += 1;
  return true;
}

/** Revokes all leases when the underlying bytes are replaced or removed. */
export function revokeMediaDisplayUrls(
  assetId: string,
  variant?: 'thumbnail' | 'full',
): void {
  const variants = variant ? [variant] : ['thumbnail', 'full'] as const;
  for (const currentVariant of variants) {
    const key = `${assetId}:${currentVariant}`;
    const entry = objectUrls.get(key);
    if (!entry) continue;
    URL.revokeObjectURL(entry.url);
    objectUrls.delete(key);
  }
}

export async function deleteProfileMedia(profileId: string): Promise<string[]> {
  const failures: string[] = [];
  for (const asset of await listMediaAssets(profileId)) {
    try {
      await mediaStorage.delete(asset.id);
    } catch (error) {
      failures.push(`${asset.id}: ${error instanceof Error ? error.message : 'Unable to delete media.'}`);
    }
  }
  return failures;
}

export async function deleteAllManagedMedia(): Promise<string[]> {
  const failures: string[] = [];
  for (const asset of await listMediaAssets()) {
    try {
      await mediaStorage.delete(asset.id);
    } catch (error) {
      failures.push(`${asset.id}: ${error instanceof Error ? error.message : 'Unable to delete media.'}`);
    }
  }
  return failures;
}

class CaizenMediaStorage implements MediaStorage {
  async save(input: Blob, metadata: SaveMediaInput): Promise<MediaAsset> {
    const current = await listOwnerMedia(metadata.ownerType, metadata.ownerId);
    if (current.length >= mediaLimits.maxAssetsPerOwner) {
      throw new Error(`This item already has the ${mediaLimits.maxAssetsPerOwner}-asset limit.`);
    }

    const cleanName = sanitizeFileName(metadata.fileName);
    await validateMediaBlob(input, cleanName);

    const outputType = input.type.startsWith('image/')
      ? imageOutputType(input.type)
      : input.type;
    const processed = input.type.startsWith('image/')
      ? await resizeImage(input, 2560, 0.84, outputType)
      : { blob: input, width: undefined, height: undefined };
    const thumbnailResult = input.type.startsWith('image/')
      ? await resizeImage(processed.blob, 480, 0.76, outputType)
      : undefined;
    const thumbnail = thumbnailResult?.blob;

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const mimeType = processed.blob.type || outputType || input.type;
    const extension = extensionFor(mimeType);
    const basePath = `media/${metadata.profileId}/${id}`;
    const localPath = `${basePath}/${id}.${extension}`;
    const thumbnailPath = thumbnail
      ? `${basePath}/${id}-thumbnail.${extensionFor(thumbnail.type || mimeType)}`
      : undefined;
    const native = isNativeApp();

    try {
      if (native) {
        await writePrivateMedia(localPath, processed.blob);
        if (thumbnail && thumbnailPath) {
          await writePrivateMedia(thumbnailPath, thumbnail);
        }
      } else {
        await putMediaBlob(id, processed.blob, 'full');
        if (thumbnail) await putMediaBlob(id, thumbnail, 'thumbnail');
      }

      const asset: MediaAsset = {
        id,
        profileId: metadata.profileId,
        ownerType: metadata.ownerType,
        ownerId: metadata.ownerId,
        role: metadata.role,
        fileName: replaceFileExtension(cleanName, extension),
        mimeType,
        sizeBytes: processed.blob.size,
        width: processed.width,
        height: processed.height,
        localPath: native ? localPath : undefined,
        thumbnailPath: native ? thumbnailPath : undefined,
        checksum: await digest(processed.blob),
        syncStatus: 'pending',
        createdAt,
        updatedAt: createdAt,
      };

      await putMediaAsset(asset);
      return asset;
    } catch (error) {
      // Roll back files/blobs if metadata could not be committed. This avoids
      // accumulating private orphan files after a storage quota or IDB error.
      if (native) {
        await Promise.all([
          deletePrivateMedia(localPath).catch(() => undefined),
          deletePrivateMedia(thumbnailPath).catch(() => undefined),
        ]);
      } else {
        await deleteMediaBlobs(id).catch(() => undefined);
      }
      throw error;
    }
  }

  async restore(input: Blob, cloudAsset: CaizenMediaAsset): Promise<MediaAsset> {
    const cleanName = sanitizeFileName(cloudAsset.originalName);
    await validateMediaBlob(input, cleanName);
    if (input.size !== cloudAsset.sizeBytes) {
      throw new Error('The downloaded file size does not match its cloud metadata.');
    }
    const checksum = await digest(input);
    if (cloudAsset.checksum && checksum !== cloudAsset.checksum) {
      throw new Error('The downloaded file checksum does not match its cloud metadata.');
    }

    const canCreateThumbnail = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ].includes(input.type);
    let thumbnail: Blob | undefined;
    if (canCreateThumbnail) {
      try {
        thumbnail = (await resizeImage(input, 480, 0.76, input.type)).blob;
      } catch {
        // The full file remains restorable when thumbnail decoding is not
        // available in a particular browser or Android WebView.
      }
    }
    const extension = extensionFor(cloudAsset.mimeType);
    const basePath = `media/${cloudAsset.profileId}/${cloudAsset.id}`;
    const localPath = `${basePath}/${cloudAsset.id}.${extension}`;
    const thumbnailPath = thumbnail
      ? `${basePath}/${cloudAsset.id}-thumbnail.${extensionFor(thumbnail.type)}`
      : undefined;
    const native = isNativeApp();
    const previous = await getMediaAsset(cloudAsset.id);
    let previousFull: Blob | undefined;
    let previousThumbnail: Blob | undefined;
    if (previous) {
      if (native && previous.localPath) {
        previousFull = await readPrivateMedia(previous.localPath, previous.mimeType).catch(() => undefined);
        if (previous.thumbnailPath) {
          previousThumbnail = await readPrivateMedia(previous.thumbnailPath, previous.mimeType).catch(() => undefined);
        }
      } else if (!native) {
        previousFull = await getMediaBlob(previous.id, 'full');
        previousThumbnail = await getMediaBlob(previous.id, 'thumbnail');
      }
    }

    try {
      revokeMediaDisplayUrls(cloudAsset.id);
      if (native) {
        await writePrivateMedia(localPath, input);
        if (thumbnail && thumbnailPath) {
          await writePrivateMedia(thumbnailPath, thumbnail);
        }
      } else {
        await putMediaBlob(cloudAsset.id, input, 'full');
        if (thumbnail) await putMediaBlob(cloudAsset.id, thumbnail, 'thumbnail');
      }

      const ownerType = MEDIA_OWNER_TYPES.has(cloudAsset.recordType as MediaOwnerType)
        ? cloudAsset.recordType as MediaOwnerType
        : 'other';
      const asset: MediaAsset = {
        id: cloudAsset.id,
        profileId: cloudAsset.profileId,
        ownerType,
        ownerId: cloudAsset.recordId,
        role: cloudAsset.role,
        fileName: cleanName,
        mimeType: cloudAsset.mimeType,
        sizeBytes: cloudAsset.sizeBytes,
        width: cloudAsset.width ?? undefined,
        height: cloudAsset.height ?? undefined,
        localPath: native ? localPath : undefined,
        remotePath: cloudAsset.storagePath,
        thumbnailPath: native ? thumbnailPath : undefined,
        checksum,
        cloudExcluded: previous?.cloudExcluded,
        syncStatus: 'synced',
        createdAt: cloudAsset.createdAt,
        updatedAt: cloudAsset.updatedAt,
      };

      await putMediaAsset(asset);
      return asset;
    } catch (error) {
      if (previous) {
        try {
          if (previousFull) {
            if (native && previous.localPath) {
              await writePrivateMedia(previous.localPath, previousFull);
              if (previous.thumbnailPath && previousThumbnail) {
                await writePrivateMedia(previous.thumbnailPath, previousThumbnail);
              }
            } else if (!native) {
              await putMediaBlob(previous.id, previousFull, 'full');
              if (previousThumbnail) await putMediaBlob(previous.id, previousThumbnail, 'thumbnail');
            }
          } else if (native) {
            await Promise.all([
              deletePrivateMedia(localPath).catch(() => undefined),
              deletePrivateMedia(thumbnailPath).catch(() => undefined),
            ]);
          } else {
            await deleteMediaBlobs(cloudAsset.id).catch(() => undefined);
          }
          await putMediaAsset(previous);
        } catch {
          // Preserve the original restore error; callers report that the
          // previous bytes could not be fully compensated separately.
        }
      } else {
        if (native) {
          await Promise.all([
            deletePrivateMedia(localPath).catch(() => undefined),
            deletePrivateMedia(thumbnailPath).catch(() => undefined),
          ]);
        } else {
          await deleteMediaBlobs(cloudAsset.id).catch(() => undefined);
        }
      }
      throw error;
    }
  }

  async read(assetId: string, expectedProfileId?: string): Promise<Blob> {
    const asset = await getMediaAsset(assetId);
    if (!asset) throw new Error('This media record is missing.');
    if (expectedProfileId && asset.profileId !== expectedProfileId) {
      throw new Error('This media asset belongs to another profile.');
    }
    if (isNativeApp()) {
      if (!asset.localPath) throw new Error('This media file is not available on this device.');
      return readPrivateMedia(asset.localPath, asset.mimeType);
    }
    const blob = await getMediaBlob(assetId, 'full');
    if (!blob) throw new Error('This media file is missing. Restore it from a backup or cloud copy.');
    return blob;
  }

  async getDisplayUrl(
    assetId: string,
    variant: 'thumbnail' | 'full' = 'thumbnail',
    expectedProfileId?: string,
  ) {
    const asset = await getMediaAsset(assetId);
    if (!asset) throw new Error('This media record is missing.');
    if (expectedProfileId && asset.profileId !== expectedProfileId) {
      throw new Error('This media asset belongs to another profile.');
    }
    if (isNativeApp()) {
      const thumbnailPath = variant === 'thumbnail' && asset.thumbnailPath && await privateMediaExists(asset.thumbnailPath)
        ? asset.thumbnailPath
        : undefined;
      const path = variant === 'thumbnail' ? thumbnailPath ?? asset.localPath : asset.localPath;
      if (!path || !(await privateMediaExists(path))) {
        throw new Error('This media file is missing from local storage.');
      }
      return privateMediaUrl(path);
    }
    const key = `${assetId}:${variant}`;
    const cached = objectUrls.get(key);
    if (cached) {
      cached.references += 1;
      return cached.url;
    }
    const blob =
      (await getMediaBlob(assetId, variant)) ??
      (variant === 'thumbnail' ? await getMediaBlob(assetId, 'full') : undefined);
    if (!blob) throw new Error('This media file is missing from browser storage.');
    const url = URL.createObjectURL(blob);
    objectUrls.set(key, { url, references: 1 });
    return url;
  }

  async evictLocalCopy(assetId: string, expectedProfileId?: string): Promise<MediaAsset> {
    const asset = await getMediaAsset(assetId);
    if (!asset) throw new Error('This media record is missing.');
    if (expectedProfileId && asset.profileId !== expectedProfileId) {
      throw new Error('This media asset belongs to another profile.');
    }
    if (!asset.remotePath) {
      throw new Error('Authoritative local media cannot be evicted.');
    }

    revokeMediaDisplayUrls(assetId);
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
      await deleteMediaBlobs(assetId);
    }

    const next = {
      ...asset,
      localPath: undefined,
      thumbnailPath: undefined,
    };
    await putMediaAsset(next);
    return next;
  }

  async delete(assetId: string): Promise<void> {
    const asset = await getMediaAsset(assetId);
    if (!asset) return;

    // Remove metadata first. If that fails, the record still points to intact
    // files. File cleanup remains best-effort because an orphan file is safer
    // than a visible record whose bytes have already disappeared, but verify
    // the result so profile/workspace cleanup can report an orphan.
    await deleteMediaAssetRecord(assetId);
    revokeMediaDisplayUrls(assetId);

    try {
      if (isNativeApp()) {
        await Promise.all([
          deletePrivateMedia(asset.localPath).catch(() => undefined),
          deletePrivateMedia(asset.thumbnailPath).catch(() => undefined),
        ]);
        const [fullExists, thumbnailExists] = await Promise.all([
          privateMediaExists(asset.localPath),
          privateMediaExists(asset.thumbnailPath),
        ]);
        if (fullExists || thumbnailExists) {
          throw new Error('One or more local media files could not be deleted.');
        }
      } else {
        await deleteMediaBlobs(assetId);
        const [fullBlob, thumbnailBlob] = await Promise.all([
          getMediaBlob(assetId, 'full'),
          getMediaBlob(assetId, 'thumbnail'),
        ]);
        if (fullBlob || thumbnailBlob) {
          throw new Error('One or more local media blobs could not be deleted.');
        }
      }
    } catch (error) {
      // Keep the ownership record available for a later retry instead of
      // turning a failed byte cleanup into an untraceable orphan.
      await putMediaAsset(asset).catch(() => undefined);
      throw error;
    }
  }

  async exists(assetId: string): Promise<boolean> {
    const asset = await getMediaAsset(assetId);
    if (!asset) return false;
    if (isNativeApp()) return privateMediaExists(asset.localPath);
    return Boolean(await getMediaBlob(assetId, 'full'));
  }
}

export const mediaStorage: MediaStorage = new CaizenMediaStorage();
