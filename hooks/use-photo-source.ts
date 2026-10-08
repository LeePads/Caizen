'use client';

import { useCallback, useState } from 'react';
import {
  MediaPickerCancelled,
  pickPhoto,
  type MediaSource,
} from '@/lib/native/media-picker';
import { isNativeApp } from '@/lib/platform';

/**
 * Downscales an image before it is stored.
 *
 * Several modals keep their image inline in the profile JSON. A full
 * resolution capture is multiple megabytes of base64 there, which bloats every
 * save and every export, so anything heading for JSON state is bounded first.
 * Modals backed by the media repository pass the original blob instead.
 */
export async function downscaleImage(
  blob: Blob,
  maxEdge = 1280,
  quality = 0.82,
): Promise<string> {
  const bitmapUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The image could not be read.'));
      element.src = bitmapUrl;
    });

    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const context = canvas.getContext('2d');
    if (!context) throw new Error('The image could not be processed.');

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/**
 * Shared photo-source flow: opens Caizen's own chooser, calls the camera or
 * gallery explicitly, and separates cancellation from real errors so backing
 * out never shows an error.
 */
export function usePhotoSource(
  onBlob: (blob: Blob, suggestedName: string) => Promise<void> | void,
) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(() => {
    setError(null);
    setSheetOpen(true);
  }, []);

  const close = useCallback(() => setSheetOpen(false), []);

  const choose = useCallback(
    async (source: MediaSource) => {
      setSheetOpen(false);
      setBusy(true);
      setError(null);

      try {
        const selected = await pickPhoto(source);
        if (!selected) return;

        await onBlob(selected.blob, selected.fileName);
      } catch (caught) {
        // Backing out of the camera is not a failure.
        if (caught instanceof MediaPickerCancelled) return;

        setError(
          caught instanceof Error
            ? caught.message
            : 'The photo could not be selected.',
        );
      } finally {
        setBusy(false);
      }
    },
    [onBlob],
  );

  return {
    sheetOpen,
    busy,
    error,
    setError,
    open,
    close,
    chooseCamera: () => choose('camera'),
    chooseGallery: () => choose('gallery'),
    /** Web keeps the accessible file input; native uses the action sheet. */
    supportsNativeCapture: isNativeApp(),
  };
}
