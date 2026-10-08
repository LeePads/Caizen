import { sanitizeFileName, validateMediaBlob } from '@/lib/storage/media-validation';

export type WalletImageBlob = {
  blob: Blob;
  fileName: string;
};

export function normalizeWalletImageUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' && url.hostname ? url.href : null;
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

export async function fetchWalletImageFromUrl(
  value: string,
  fetcher: typeof fetch = fetch,
): Promise<WalletImageBlob> {
  const url = normalizeWalletImageUrl(value);
  if (!url) throw new Error('Enter a valid HTTPS image URL.');

  const response = await fetcher(url, { credentials: 'omit' });
  if (!response.ok) throw new Error('The image URL could not be loaded.');

  const responseUrl = response.url ? new URL(response.url) : new URL(url);
  if (responseUrl.protocol !== 'https:') {
    throw new Error('The image URL must remain HTTPS after redirects.');
  }

  const blob = await response.blob();
  if (!blob.type.toLowerCase().startsWith('image/')) {
    throw new Error('The URL did not return an image.');
  }
  await validateMediaBlob(blob, `wallet-url.${extensionForImageType(blob.type.toLowerCase())}`);

  return {
    blob,
    fileName: sanitizeFileName(`wallet-url.${extensionForImageType(blob.type.toLowerCase())}`),
  };
}

export function getWalletImageFromPaste(
  event: Pick<globalThis.ClipboardEvent, 'clipboardData'>,
): WalletImageBlob | null {
  const imageItem = Array.from(event.clipboardData?.items || []).find(item => (
    item.kind === 'file' && item.type.toLowerCase().startsWith('image/')
  ));
  const file = imageItem?.getAsFile();
  if (!file) return null;

  return {
    blob: file,
    fileName: sanitizeFileName(file.name || 'wallet-clipboard.png'),
  };
}

export async function validateWalletImageBlob(input: WalletImageBlob): Promise<WalletImageBlob> {
  if (!input.blob.type.toLowerCase().startsWith('image/')) {
    throw new Error('The pasted file is not an image.');
  }
  await validateMediaBlob(input.blob, input.fileName);
  return input;
}
