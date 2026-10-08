const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_FILE_NAME_LENGTH = 120;

const MIME_SIGNATURES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'image/heic': [],
  'image/heif': [],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]],
  'text/plain': [],
};

const FORBIDDEN_EXTENSIONS =
  /\.(?:apk|app|bat|cmd|com|dll|dmg|exe|html?|jar|js|mjs|ps1|scr|sh|svg|vbs)$/i;

export function sanitizeFileName(input: string): string {
  const normalized = input
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^[.\-\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH);
  return normalized || 'attachment';
}

export function isSupportedMimeType(mimeType: string): boolean {
  return Object.hasOwn(MIME_SIGNATURES, mimeType.toLowerCase());
}

export async function validateMediaBlob(blob: Blob, fileName: string): Promise<void> {
  if (blob.size <= 0) throw new Error('The selected file is empty.');
  if (blob.size > MAX_MEDIA_BYTES) throw new Error('The selected file is larger than 25 MB.');
  if (FORBIDDEN_EXTENSIONS.test(fileName)) {
    throw new Error('Executable, HTML, JavaScript, and SVG files are not accepted.');
  }
  const mimeType = blob.type.toLowerCase();
  if (!isSupportedMimeType(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType || 'unknown'}.`);
  }
  const signatures = MIME_SIGNATURES[mimeType];
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    const boxType = String.fromCharCode(...bytes.slice(4, 8));
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    const validBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);
    if (boxType !== 'ftyp' || !validBrands.has(brand)) {
      throw new Error('The HEIC/HEIF file signature is invalid.');
    }
    return;
  }
  if (signatures.length === 0) return;
  const valid = signatures.some((signature) =>
    signature.every((value, index) => bytes[index] === value),
  );
  if (!valid) throw new Error('The file contents do not match the declared file type.');
  if (
    mimeType === 'image/webp' &&
    String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP'
  ) {
    throw new Error('The WebP file signature is invalid.');
  }
}

export const mediaLimits = {
  maxBytes: MAX_MEDIA_BYTES,
  maxAssetsPerOwner: 20,
};
