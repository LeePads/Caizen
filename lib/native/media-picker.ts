import {
  Camera,
  CameraDirection,
  CameraResultType,
  CameraSource,
} from '@capacitor/camera';
import { isNativeApp } from '../platform';

export type MediaSource = 'camera' | 'gallery';
export type PickedPhoto = {
  blob: Blob;
  fileName: string;
};

/**
 * Raised when the user backed out of the camera or picker.
 *
 * Cancellation is a normal outcome, not a failure, so callers can swallow it
 * silently instead of showing an error for a deliberate back press.
 */
export class MediaPickerCancelled extends Error {
  constructor() {
    super('Media selection was cancelled.');
    this.name = 'MediaPickerCancelled';
  }
}

/**
 * `@capacitor/camera` v8 exposes `getPhoto({ source })` and `pickImages()`.
 * There is no `takePhoto()` / `chooseFromGallery()` in this version.
 *
 * CameraSource.Prompt (the plugin default) is deliberately never used: its
 * native chooser is inconsistent across OEM builds and gives Caizen no control
 * over labels or cancellation. Callers pass a concrete source and Caizen shows
 * its own action sheet instead.
 */
export const photoToMedia = async (
  photo: { webPath?: string; path?: string; format?: string },
  source: MediaSource,
): Promise<PickedPhoto> => {
  if (!photo.webPath) {
    throw new Error('The selected photo did not provide readable data.');
  }
  const response = await fetch(photo.webPath);
  if (!response.ok) throw new Error('The selected photo could not be read.');
  const received = await response.blob();
  const mimeType = received.type || `image/${photo.format || 'jpeg'}`;
  const blob = received.type === mimeType
    ? received
    : new Blob([await received.arrayBuffer()], { type: mimeType });
  const candidateName = photo.path
    ?.split(/[\\/]/)
    .pop()
    ?.split(/[?#]/)[0];
  const extension = photo.format === 'jpeg' ? 'jpg' : photo.format || 'jpg';
  let fileName = `${source}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
  if (candidateName && /\.[a-z0-9]{2,5}$/i.test(candidateName)) {
    try {
      fileName = decodeURIComponent(candidateName);
    } catch {
      fileName = candidateName;
    }
  }
  return { blob, fileName };
};

const CANCEL_PATTERNS = [
  'cancel',
  'user cancelled',
  'user denied',
  'no image picked',
  'no image selected',
];

export async function pickPhoto(source: MediaSource): Promise<PickedPhoto | null> {
  if (!isNativeApp()) return null;

  try {
    if (source === 'gallery') {
      const result = await Camera.pickImages({ quality: 90, correctOrientation: true, width: 2560, height: 2560, limit: 1 });
      const photo = result.photos[0];
      if (!photo) throw new MediaPickerCancelled();
      return await photoToMedia(photo, source);
    }

    const current = await Camera.checkPermissions();
    const permissions = current.camera === 'granted'
      ? current
      : await Camera.requestPermissions({ permissions: ['camera'] });
    if (permissions.camera !== 'granted') {
      throw new Error('Camera permission was denied. Allow camera access in Android settings and try again.');
    }

    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      direction: CameraDirection.Rear,
      quality: 90,
      correctOrientation: true,
      saveToGallery: false,
      allowEditing: false,
      width: 2560,
      height: 2560,
    });

    return await photoToMedia(photo, source);
  } catch (error) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : '';

    if (CANCEL_PATTERNS.some((pattern) => message.includes(pattern))) {
      throw new MediaPickerCancelled();
    }

    if (message.includes('permission')) {
      throw new Error(
        source === 'camera'
          ? 'Camera permission was denied. Allow camera access in Android settings and try again.'
          : 'Photo permission was denied. Allow photo access in Android settings and try again.',
      );
    }

    // Raised when no activity can service ACTION_IMAGE_CAPTURE.
    if (
      message.includes('no camera') ||
      message.includes('activity not found') ||
      message.includes('no activity found')
    ) {
      throw new Error(
        'No camera app is available on this device. Choose from the gallery instead.',
      );
    }

    // A FileProvider misconfiguration surfaces this way. Naming it concretely
    // keeps that failure obvious instead of looking like a generic camera bug.
    if (
      message.includes('configured root') ||
      message.includes('fileprovider')
    ) {
      throw new Error(
        'The camera could not save its photo on this device. Please report this.',
      );
    }

    throw error instanceof Error
      ? error
      : new Error('The photo could not be captured.');
  }
}

export async function getMediaPermissionStatus() {
  if (!isNativeApp()) return { camera: 'unavailable', photos: 'unavailable' };
  try {
    const status = await Camera.checkPermissions();
    return { camera: status.camera, photos: status.photos };
  } catch {
    return { camera: 'unavailable', photos: 'unavailable' };
  }
}
