import type { CaizenMediaAsset, MediaAsset } from '../types';
import {
  buildCaizenMediaThumbnailStoragePath,
  downloadCaizenPrivateMedia,
} from '../caizen-cloud-repository';
import { getCloudUser } from '../cloud-backup';
import { isNativeApp } from '../platform';
import { writePrivateMedia } from '../native/media-filesystem';
import { getMediaAsset, putMediaAsset, putMediaBlob } from './media-repository';
import {
  mediaStorage,
  releaseMediaDisplayUrl,
  retainMediaDisplayUrl,
} from './media-storage';
import { enforceCloudMediaCacheLimit, touchCloudMediaCache } from './media-cache';
import { hasLocalMediaCopy, hasLocalMediaThumbnail } from './media-residency';
import { validateMediaBlob } from './media-validation';
import {
  getMediaSessionGeneration,
  getMediaSessionUserId,
  getMediaSessionToken,
  isMediaSessionCurrent,
  isMediaSessionSuspended,
  MediaSessionInvalidatedError,
  setMediaSessionUser,
  withMediaSessionCommit,
} from './media-session';

export type MediaResolutionVariant = 'thumbnail' | 'full';
export type MediaResolutionPurpose = 'display' | 'explicit-open';
export type MediaResolution = {
  state: 'local' | 'remote' | 'unavailable';
  url?: string;
  release?: () => void;
  retryable?: boolean;
  message?: string;
};

export const CLOUD_MEDIA_RESOLUTION_TIMEOUT_MS = 15_000;

type InFlightEntry = {
  promise: Promise<MediaResolution>;
  consumers: number;
  settled: boolean;
  allocatedLeases: number;
};

const inFlight = new Map<string, InFlightEntry>();

const unavailable = (message: string, retryable = true): MediaResolution => ({
  state: 'unavailable',
  retryable,
  message,
});

const withTimeout = async <T>(
  operation: (signal?: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(new Error('Cloud media is taking too long to respond. Try again.'));
    }, CLOUD_MEDIA_RESOLUTION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation(controller?.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const thumbnailPathFromRemote = (asset: MediaAsset, userId: string) => {
  if (!asset.remotePath) return null;
  const fileName = asset.remotePath.split('/').pop() || '';
  const versionPrefix = `${asset.id}.staged-`;
  if (fileName.startsWith(versionPrefix)) {
    const version = fileName.slice(versionPrefix.length).split('.')[0];
    if (version) {
      return `${userId}/${asset.profileId}/${asset.id}/${asset.id}-thumbnail-staged-${version}.webp`;
    }
  }
  return buildCaizenMediaThumbnailStoragePath(userId, asset.profileId, asset.id);
};

const cloudAssetFromLocal = (asset: MediaAsset, userId: string): CaizenMediaAsset => ({
  id: asset.id,
  userId,
  profileId: asset.profileId,
  recordType: asset.ownerType,
  recordId: asset.ownerId,
  role: asset.role,
  storagePath: asset.remotePath || '',
  originalName: asset.fileName,
  mimeType: asset.mimeType,
  sizeBytes: asset.sizeBytes,
  checksum: asset.checksum ?? null,
  width: asset.width ?? null,
  height: asset.height ?? null,
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt,
  deletedAt: null,
});

const sha256Blob = async (blob: Blob): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
};

/** Validate Cloud bytes before they enter the local media cache. */
const validateDownloadedMedia = async (blob: Blob, asset: MediaAsset): Promise<Blob> => {
  const normalized = blob.type.toLowerCase() === asset.mimeType.toLowerCase()
    ? blob
    : new Blob([await blob.arrayBuffer()], { type: asset.mimeType });
  await validateMediaBlob(normalized, asset.fileName);
  if (normalized.size !== asset.sizeBytes) {
    throw new Error('The Cloud media bytes do not match the recorded size.');
  }
  if (asset.checksum && await sha256Blob(normalized) !== asset.checksum) {
    throw new Error('The Cloud media bytes do not match the recorded checksum.');
  }
  return normalized;
};

const cacheThumbnail = async (asset: MediaAsset, blob: Blob, userId: string) => {
  const thumbnailPath = thumbnailPathFromRemote(asset, userId);
  if (!thumbnailPath) throw new Error('The Cloud media path is missing.');
  if (isNativeApp()) {
    await writePrivateMedia(thumbnailPath.replace(`${userId}/`, 'media/'), blob);
    await putMediaAsset({ ...asset, thumbnailPath: thumbnailPath.replace(`${userId}/`, 'media/') });
  } else {
    await putMediaBlob(asset.id, blob, 'thumbnail');
  }
  touchCloudMediaCache(asset);
};

const downloadAndCacheFull = async (
  asset: MediaAsset,
  userId: string,
  session: ReturnType<typeof getMediaSessionToken>,
): Promise<void> => {
  const downloaded = await withTimeout((signal) => downloadCaizenPrivateMedia(asset.remotePath!, {
    profileId: asset.profileId,
    mediaAssetId: asset.id,
  }, signal));
  const blob = await validateDownloadedMedia(downloaded, asset);
  return withMediaSessionCommit(session, async () => {
    await mediaStorage.restore(blob, cloudAssetFromLocal(asset, userId));
    const refreshed = await getMediaAsset(asset.id);
    if (refreshed) touchCloudMediaCache(refreshed);
    await enforceCloudMediaCacheLimit();
  });
};

const resolveRemote = async (
  asset: MediaAsset,
  variant: MediaResolutionVariant,
  purpose: MediaResolutionPurpose,
): Promise<MediaResolution> => {
  if (!asset.remotePath) return unavailable('This media is not available on this device.', false);
  let user: Awaited<ReturnType<typeof getCloudUser>>;
  try {
    user = await withTimeout(() => getCloudUser());
  } catch (error) {
    return unavailable(
      error instanceof Error ? error.message : 'Cloud media could not be loaded. Try again.',
    );
  }
  if (!user) return unavailable('Sign in to Cloud to restore this media.', false);

  // getCloudUser establishes the current session as part of its authenticated
  // lookup. Capture the generation only after that bootstrap has completed;
  // otherwise the first legitimate request invalidates itself. If another
  // account is already active, never overwrite it just to satisfy this read.
  const activeUserId = getMediaSessionUserId();
  if (activeUserId && activeUserId !== user.id) {
    return unavailable('The Cloud media session changed. Try again.');
  }
  if (!activeUserId) setMediaSessionUser(user.id);
  const session = getMediaSessionToken(user.id);
  if (!isMediaSessionCurrent(session)) return unavailable('The Cloud media session changed. Try again.');

  if (variant === 'thumbnail') {
    const thumbnailPath = thumbnailPathFromRemote(asset, user.id);
    if (!thumbnailPath) return unavailable('The Cloud media path is missing.', false);
    try {
      const thumbnail = await withTimeout((signal) => downloadCaizenPrivateMedia(thumbnailPath, {
        profileId: asset.profileId,
        mediaAssetId: asset.id,
      }, signal));
      const url = await withMediaSessionCommit(session, async () => {
        await cacheThumbnail(asset, thumbnail, user.id);
        const displayUrl = await mediaStorage.getDisplayUrl(asset.id, 'thumbnail', asset.profileId);
        await enforceCloudMediaCacheLimit();
        return displayUrl;
      });
      return {
        state: 'remote',
        url,
        release: () => releaseMediaDisplayUrl(asset.id, 'thumbnail'),
      };
    } catch (error) {
      if (error instanceof MediaSessionInvalidatedError) {
        return unavailable('The Cloud media session changed. Try again.');
      }
      // Normal card/library rendering must never pull a full original just
      // because a thumbnail is missing; on a new device that would download
      // the whole library to draw a grid. The caller keeps its existing
      // placeholder and the full object stays remotely available.
      if (purpose !== 'explicit-open') {
        return unavailable(
          'This Cloud image has no thumbnail yet. Open it to download the full copy.',
        );
      }
      // Existing Cloud objects may predate deterministic thumbnail uploads.
      // The full object remains authoritative, so an explicit open recovers it
      // and lets the storage boundary use it as the thumbnail fallback on both
      // Web and Android. This keeps older managed media renderable without
      // changing its asset ID or regenerating the Cloud object.
      try {
        await downloadAndCacheFull(asset, user.id, session);
        return {
          state: 'remote',
          url: await mediaStorage.getDisplayUrl(asset.id, 'thumbnail', asset.profileId),
          release: () => releaseMediaDisplayUrl(asset.id, 'thumbnail'),
        };
      } catch (fallbackError) {
        if (fallbackError instanceof MediaSessionInvalidatedError) {
          return unavailable('The Cloud media session changed. Try again.');
        }
        return unavailable(
          fallbackError instanceof Error
            ? fallbackError.message
            : error instanceof Error
              ? error.message
              : 'The Cloud media is unavailable. Try again.',
        );
      }
    }
  }

  if (purpose !== 'explicit-open') {
    return unavailable('Open the media to download its Cloud copy.', false);
  }
  try {
    await downloadAndCacheFull(asset, user.id, session);
    return {
      state: 'remote',
      url: await mediaStorage.getDisplayUrl(asset.id, 'full', asset.profileId),
      release: () => releaseMediaDisplayUrl(asset.id, 'full'),
    };
  } catch (error) {
    return unavailable(
      error instanceof MediaSessionInvalidatedError
        ? 'The Cloud media session changed. Try again.'
        : error instanceof Error
          ? error.message
          : 'Cloud media could not be loaded. Try again.',
    );
  }
};

const acquireInFlightLeases = (
  entry: InFlightEntry,
  assetId: string,
  variant: MediaResolutionVariant,
): boolean => {
  // resolveRemote owns the first object-URL lease returned by getDisplayUrl.
  // Reserve the remaining leases before any consumer continuation can run;
  // otherwise an early unmount can revoke the URL before a sibling consumer
  // has reached the old retainMediaDisplayUrl call.
  if (entry.allocatedLeases >= entry.consumers) return true;
  while (entry.allocatedLeases < entry.consumers) {
    if (
      entry.allocatedLeases > 0 &&
      !retainMediaDisplayUrl(assetId, variant) &&
      !isNativeApp()
    ) {
      return false;
    }
    entry.allocatedLeases += 1;
  }
  return true;
};

const releaseInFlightLeases = (
  entry: InFlightEntry,
  assetId: string,
  variant: MediaResolutionVariant,
) => {
  for (let index = 0; index < entry.allocatedLeases; index += 1) {
    releaseMediaDisplayUrl(assetId, variant);
  }
  entry.allocatedLeases = 0;
};

const leaseInFlightResolution = (
  resolved: MediaResolution,
  assetId: string,
  variant: MediaResolutionVariant,
): MediaResolution => {
  if (!resolved.url) return resolved;
  let released = false;
  return {
    ...resolved,
    release: () => {
      if (released) return;
      released = true;
      releaseMediaDisplayUrl(assetId, variant);
    },
  };
};

/**
 * Resolves local media first, then authenticated Cloud media. Temporary
 * object URLs are released by the returned callback and are never persisted.
 */
export async function resolveMedia(
  assetId: string,
  options: {
    variant?: MediaResolutionVariant;
    purpose?: MediaResolutionPurpose;
    expectedProfileId?: string;
  } = {},
): Promise<MediaResolution> {
  const variant = options.variant ?? 'thumbnail';
  const purpose = options.purpose ?? 'display';
  const asset = await getMediaAsset(assetId);
  if (!asset) return { state: 'unavailable' };
  if (options.expectedProfileId && asset.profileId !== options.expectedProfileId) {
    return { state: 'unavailable' };
  }

  const key = `${asset.id}:${asset.profileId}:${variant}:${purpose}:${getMediaSessionGeneration()}`;
  let entry = inFlight.get(key);
  if (!entry) {
    entry = {
      promise: Promise.resolve(unavailable('Cloud media could not be loaded.')),
      consumers: 1,
      settled: false,
      allocatedLeases: 0,
    };
    const request = (async () => {
      const localRequestGeneration = getMediaSessionGeneration();
      const localAvailable = variant === 'thumbnail'
        ? await hasLocalMediaThumbnail(asset)
        : await hasLocalMediaCopy(asset);
      if (localAvailable) {
        try {
          const url = await mediaStorage.getDisplayUrl(asset.id, variant, options.expectedProfileId);
          if (
            asset.remotePath &&
            localRequestGeneration === getMediaSessionGeneration() &&
            !isMediaSessionSuspended()
          ) {
            touchCloudMediaCache(asset);
          }
          return {
            state: 'local' as const,
            url,
            release: () => releaseMediaDisplayUrl(asset.id, variant),
          };
        } catch {
          // Fall through to Cloud resolution when the local metadata points to
          // a file that disappeared between the existence check and display
          // read.
        }
      }
      return resolveRemote(asset, variant, purpose);
    })()
      .then((resolved) => {
        entry!.settled = true;
        if (resolved.url) {
          entry!.allocatedLeases = 1;
          if (!acquireInFlightLeases(entry!, asset.id, variant)) {
            releaseInFlightLeases(entry!, asset.id, variant);
            return unavailable('The media display URL is no longer available. Try again.');
          }
        }
        return resolved;
      })
      .finally(() => inFlight.delete(key));
    entry.promise = request;
    inFlight.set(key, entry);
  } else {
    entry.consumers += 1;
    // The map is normally removed in the same settlement turn. This guard
    // keeps a late sibling safe if it observes the settled entry first.
    if (entry.settled) acquireInFlightLeases(entry, asset.id, variant);
  }

  const resolved = await entry.promise;
  if (resolved.url && entry.settled && !acquireInFlightLeases(entry, asset.id, variant)) {
    return unavailable('The media display URL is no longer available. Try again.');
  }
  return leaseInFlightResolution(resolved, asset.id, variant);
}

export function releaseResolvedMedia(assetId: string, variant: MediaResolutionVariant): void {
  releaseMediaDisplayUrl(assetId, variant);
}
