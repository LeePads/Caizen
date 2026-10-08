import { describe, expect, it } from 'vitest';
import {
  isSupportedMimeType,
  sanitizeFileName,
  validateMediaBlob,
} from '@/lib/storage/media-validation';

describe('media validation', () => {
  it('sanitizes filenames and rejects executable-looking names', async () => {
    expect(sanitizeFileName('../my: receipt?.jpg')).toBe('my- receipt-.jpg');
    await expect(
      validateMediaBlob(new Blob(['alert(1)'], { type: 'text/plain' }), 'payload.js'),
    ).rejects.toThrow(/not accepted/);
  });

  it('validates JPEG signatures', async () => {
    const valid = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], { type: 'image/jpeg' });
    await expect(validateMediaBlob(valid, 'photo.jpg')).resolves.toBeUndefined();
    const invalid = new Blob(['not-a-jpeg'], { type: 'image/jpeg' });
    await expect(validateMediaBlob(invalid, 'photo.jpg')).rejects.toThrow(/contents/);
  });

  it('rejects unsupported MIME types and oversized files', async () => {
    expect(isSupportedMimeType('image/svg+xml')).toBe(false);
    await expect(
      validateMediaBlob(new Blob(['svg'], { type: 'image/svg+xml' }), 'image.svg'),
    ).rejects.toThrow();
    const tooLarge = new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: 'image/png' });
    await expect(validateMediaBlob(tooLarge, 'large.png')).rejects.toThrow(/25 MB/);
  });
});
