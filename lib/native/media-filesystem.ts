import { Directory, Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read the selected file.'));
    reader.readAsDataURL(blob);
  });

const base64ToBlob = (data: string, mimeType: string) => {
  const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
};

export async function writePrivateMedia(path: string, blob: Blob): Promise<void> {
  await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob),
    directory: Directory.Data,
    recursive: true,
  });
}

export async function readPrivateMedia(path: string, mimeType: string): Promise<Blob> {
  const result = await Filesystem.readFile({ path, directory: Directory.Data });
  if (result.data instanceof Blob) return result.data;
  return base64ToBlob(result.data, mimeType);
}

export async function privateMediaUrl(path: string): Promise<string> {
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  return Capacitor.convertFileSrc(uri);
}

/** Returns the native content URI used by the Android document-export bridge. */
export async function privateMediaSourceUri(path: string): Promise<string> {
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  return uri;
}

export async function deletePrivateMedia(path?: string): Promise<void> {
  if (!path) return;
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  } catch {
    // Already missing is an idempotent delete.
  }
}

export async function privateMediaExists(path?: string): Promise<boolean> {
  if (!path) return false;
  try {
    await Filesystem.stat({ path, directory: Directory.Data });
    return true;
  } catch {
    return false;
  }
}
