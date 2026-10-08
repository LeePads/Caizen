import type { MediaAsset } from '../types';
import { isNativeApp } from '../platform';
import { privateMediaExists } from '../native/media-filesystem';
import { getMediaBlob } from './media-repository';

/**
 * Residency is deliberately derived from the durable remote path and the
 * presence of local bytes. It is not persisted as a second media status.
 */
export type MediaResidency =
  | 'local-only'
  | 'cloud-uncached'
  | 'cloud-cached'
  | 'unavailable';

export async function hasLocalMediaCopy(asset: MediaAsset): Promise<boolean> {
  if (isNativeApp()) {
    return Boolean(asset.localPath && await privateMediaExists(asset.localPath));
  }
  return Boolean(await getMediaBlob(asset.id, 'full'));
}

export async function hasLocalMediaThumbnail(asset: MediaAsset): Promise<boolean> {
  if (isNativeApp()) {
    if (asset.thumbnailPath && await privateMediaExists(asset.thumbnailPath)) return true;
    return Boolean(asset.localPath && await privateMediaExists(asset.localPath));
  }
  return Boolean(
    await getMediaBlob(asset.id, 'thumbnail') ??
    await getMediaBlob(asset.id, 'full'),
  );
}

export async function getMediaResidency(
  asset: MediaAsset,
  localBytePresence?: boolean,
): Promise<MediaResidency> {
  // Callers that already performed an existence check may provide it to
  // avoid a second filesystem/IndexedDB read; otherwise inspect storage here.
  const local = localBytePresence ?? await hasLocalMediaCopy(asset);
  if (asset.remotePath) return local ? 'cloud-cached' : 'cloud-uncached';
  return local ? 'local-only' : 'unavailable';
}
