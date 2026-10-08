import { sanitizeFileName, validateMediaBlob } from '@/lib/storage/media-validation';

export type WorkoutImageBlob = { blob: Blob; fileName: string };

/**
 * Bundled reference images are optional app assets, not profile media.
 * Keeping the path derived from the stable catalog ID means a new image can
 * be shipped by adding the matching file under public/workout-references.
 */
export function getBuiltinWorkoutReferenceImage(exerciseId: string): string {
  return `/workout-references/${encodeURIComponent(exerciseId)}.png`;
}

export function normalizeWorkoutImageUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' && Boolean(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function extensionForImageType(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/heic') return 'heic';
  if (type === 'image/heif') return 'heif';
  return 'jpg';
}

export async function fetchWorkoutImageFromUrl(
  value: string,
  fetcher: typeof fetch = fetch,
): Promise<WorkoutImageBlob> {
  const trimmed = value.trim();
  if (/^http:\/\//i.test(trimmed)) throw new Error('Reference image URLs must use HTTPS. HTTP URLs are not rewritten.');
  const normalizedUrl = normalizeWorkoutImageUrl(trimmed);
  if (!normalizedUrl) throw new Error('Enter a valid HTTPS image URL.');
  let response: Response;
  try {
    response = await fetcher(normalizedUrl, { credentials: 'omit' });
  } catch {
    throw new Error('The image could not be fetched (it may be blocked by CORS or you may be offline). Check your connection or use Upload/Paste instead.');
  }
  if (!response.ok) throw new Error('The image URL could not be loaded. Use Upload/Paste as a fallback.');
  let responseUrl: URL;
  try {
    responseUrl = new URL(response.url || normalizedUrl);
  } catch {
    throw new Error('The image redirect was invalid. Use Upload/Paste instead.');
  }
  if (responseUrl.protocol !== 'https:') throw new Error('The image URL must remain HTTPS after redirects.');
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    throw new Error('The image response could not be read. Check your connection or use Upload/Paste instead.');
  }
  if (!blob.type.toLowerCase().startsWith('image/')) throw new Error('The URL did not return image content. Use Upload/Paste instead.');
  try {
    await validateMediaBlob(blob, `workout-reference.${extensionForImageType(blob.type.toLowerCase())}`);
  } catch {
    throw new Error('The downloaded image failed Caizen media validation. Use Upload/Paste instead.');
  }
  return { blob, fileName: sanitizeFileName(`workout-reference.${extensionForImageType(blob.type.toLowerCase())}`) };
}

export function getWorkoutImageFromPaste(
  event: Pick<globalThis.ClipboardEvent, 'clipboardData'>,
): WorkoutImageBlob | null {
  const imageItem = Array.from(event.clipboardData?.items || []).find(item => item.kind === 'file' && item.type.toLowerCase().startsWith('image/'));
  const file = imageItem?.getAsFile();
  if (!file) return null;
  return { blob: file, fileName: sanitizeFileName(file.name || 'workout-clipboard.png') };
}

export async function validateWorkoutImageBlob(input: WorkoutImageBlob): Promise<WorkoutImageBlob> {
  if (!input.blob.type.toLowerCase().startsWith('image/')) throw new Error('The selected file is not an image.');
  await validateMediaBlob(input.blob, input.fileName);
  return input;
}

export function tutorialEmbedUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = url.searchParams.get('v') || (parts[0] === 'shorts' || parts[0] === 'embed' ? parts[1] : undefined);
      return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = parts[0] === 'video' ? parts[1] : parts[0];
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}
