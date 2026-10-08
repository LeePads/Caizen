import type { RestoredListenerEvent } from '@capacitor/app';
import { getNativePreference, removeNativePreference, setNativePreference } from './native-preferences';
import { photoToMedia } from './media-picker';
import { mediaStorage } from '../storage/media-storage';
import { getMediaAsset, listOwnerMedia } from '../storage/media-repository';

const CAMERA_REQUEST_KEY = 'caizen-inventory-camera-request-v1';
const RECOVERED_PHOTOS_KEY = 'caizen-inventory-recovered-photos-v1';

type CameraRequest = { profileId: string; ownerId: string; createdAt: number; requestId?: string };
export type RecoveredInventoryPhoto = { profileId: string; assetId: string; createdAt: number; requestId?: string };

function requestIdentity(request: CameraRequest): string {
  return request.requestId ?? `legacy:${request.profileId}:${request.ownerId}:${request.createdAt}`;
}

function recoveryOwnerId(request: CameraRequest): string {
  return request.requestId ? `inventory-camera-recovery:${request.requestId}` : request.ownerId;
}

function validRequest(value: unknown): value is CameraRequest {
  if (!value || typeof value !== 'object') return false;
  const source = value as Partial<CameraRequest>;
  return typeof source.profileId === 'string' && source.profileId.length > 0 &&
    typeof source.ownerId === 'string' && source.ownerId.length > 0 &&
    typeof source.createdAt === 'number' && Number.isFinite(source.createdAt) &&
    source.createdAt <= Date.now() && Date.now() - source.createdAt <= 48 * 60 * 60 * 1000 &&
    (source.requestId === undefined || (typeof source.requestId === 'string' && source.requestId.length > 0));
}

export async function markInventoryCameraRequest(profileId: string, ownerId: string): Promise<void> {
  await setNativePreference(CAMERA_REQUEST_KEY, JSON.stringify({
    profileId, ownerId, createdAt: Date.now(), requestId: crypto.randomUUID(),
  } satisfies CameraRequest));
}

export async function clearInventoryCameraRequest(): Promise<void> {
  await removeNativePreference(CAMERA_REQUEST_KEY);
}

export async function listRecoveredInventoryPhotos(): Promise<RecoveredInventoryPhoto[]> {
  const raw = await getNativePreference(RECOVERED_PHOTOS_KEY);
  if (!raw) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Recovered photo metadata is unreadable.'); }
  if (!Array.isArray(value)) throw new Error('Recovered photo metadata is invalid.');
  const photos = value.filter((entry): entry is RecoveredInventoryPhoto => {
      if (!entry || typeof entry !== 'object') return false;
      const photo = entry as Partial<RecoveredInventoryPhoto>;
      return typeof photo.profileId === 'string' && photo.profileId.length > 0 &&
        typeof photo.assetId === 'string' && photo.assetId.length > 0 &&
        typeof photo.createdAt === 'number' && Number.isFinite(photo.createdAt) &&
        (photo.requestId === undefined || (typeof photo.requestId === 'string' && photo.requestId.length > 0));
    });
  if (photos.length !== value.length) throw new Error('Recovered photo metadata is invalid.');
  return photos;
}

export async function removeRecoveredInventoryPhoto(assetId: string): Promise<void> {
  const remaining = (await listRecoveredInventoryPhotos()).filter(photo => photo.assetId !== assetId);
  if (remaining.length) await setNativePreference(RECOVERED_PHOTOS_KEY, JSON.stringify(remaining));
  else await removeNativePreference(RECOVERED_PHOTOS_KEY);
  window.dispatchEvent(new CustomEvent('caizen:inventory-photo-recovered'));
}

/** Keep a restored camera result until its original profile can offer attachment. */
export async function recoverInventoryCameraResult(
  result: RestoredListenerEvent,
  knownProfileIds: Set<string>,
): Promise<'recovered' | 'cancelled' | 'unowned'> {
  if (result.pluginId !== 'Camera' || result.methodName !== 'getPhoto') return 'unowned';
  const raw = await getNativePreference(CAMERA_REQUEST_KEY);
  let request: unknown;
  try { request = raw ? JSON.parse(raw) : null; } catch { request = null; }
  if (!validRequest(request) || !knownProfileIds.has(request.profileId)) return 'unowned';
  if (!result.success) {
    await clearInventoryCameraRequest();
    return 'cancelled';
  }
  const requestId = requestIdentity(request);
  const recovered = await listRecoveredInventoryPhotos();
  let existingEntry = recovered.find(photo => photo.requestId === requestId && photo.profileId === request.profileId);
  if (!existingEntry && !request.requestId) {
    // Entries written by v1 did not have a request ID. Match only a photo
    // saved for this draft during the camera request's lifetime.
    const legacyMatches: RecoveredInventoryPhoto[] = [];
    for (const photo of recovered.filter(photo => photo.profileId === request.profileId && !photo.requestId)) {
      const asset = await getMediaAsset(photo.assetId);
      if (asset?.profileId === request.profileId && asset.ownerType === 'inventory' && asset.ownerId === request.ownerId &&
          Date.parse(asset.createdAt) >= request.createdAt) {
        legacyMatches.push(photo);
      }
    }
    if (legacyMatches.length > 1) throw new Error('Camera recovery has multiple possible entries.');
    existingEntry = legacyMatches[0];
  }
  if (existingEntry) {
    const asset = await getMediaAsset(existingEntry.assetId);
    if (asset?.profileId !== request.profileId || asset.ownerType !== 'inventory' ||
        asset.ownerId !== recoveryOwnerId(request)) {
      throw new Error('Recovered camera photo ownership could not be confirmed.');
    }
    if (!await mediaStorage.exists(existingEntry.assetId)) {
      throw new Error('A recovered photo entry has no readable media.');
    }
    await clearInventoryCameraRequest().catch(() => undefined);
    window.dispatchEvent(new CustomEvent('caizen:inventory-photo-recovered'));
    return 'recovered';
  }
  const data = result.data as { webPath?: string; path?: string; format?: string } | undefined;
  if (!data?.webPath) return 'unowned';

  const ownerId = recoveryOwnerId(request);
  const saved = (await listOwnerMedia('inventory', ownerId)).filter(asset =>
    asset.profileId === request.profileId &&
    (request.requestId || Date.parse(asset.createdAt) >= request.createdAt) &&
    asset.role === 'primary');
  if (saved.length > 1) throw new Error('Camera recovery has multiple possible saved photos.');
  let asset = saved[0];
  let newlySaved = false;
  if (asset) {
    if (!await mediaStorage.exists(asset.id)) throw new Error('Saved camera photo is unreadable.');
  } else {
    const photo = await photoToMedia(data, 'camera');
    asset = await mediaStorage.save(photo.blob, {
      profileId: request.profileId,
      ownerType: 'inventory',
      ownerId,
      role: 'primary',
      fileName: photo.fileName,
    });
    newlySaved = true;
  }
  const entry: RecoveredInventoryPhoto = {
    profileId: request.profileId, assetId: asset.id, createdAt: Date.now(), requestId,
  };
  try {
    await setNativePreference(RECOVERED_PHOTOS_KEY, JSON.stringify([
      ...recovered.filter(photo => photo.requestId !== requestId), entry,
    ]));
  } catch (error) {
    // Preferences can reject after committing. Read back before compensating.
    let persisted: boolean;
    try {
      persisted = (await listRecoveredInventoryPhotos()).some(photo =>
        photo.requestId === requestId && photo.assetId === asset.id);
    } catch {
      throw error; // Keep the media until its metadata state can be checked.
    }
    if (!persisted) {
      if (newlySaved) await mediaStorage.delete(asset.id).catch(() => undefined);
      throw error;
    }
  }
  // A failed marker removal must not turn a persisted recovery into a retry save.
  await clearInventoryCameraRequest().catch(() => undefined);
  window.dispatchEvent(new CustomEvent('caizen:inventory-photo-recovered'));
  return 'recovered';
}
