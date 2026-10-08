import { describe, expect, it } from 'vitest';
import {
  FALLBACK_STORAGE_LABEL,
  formatStorageEstimate,
} from '@/lib/storage/storage-usage';

describe('browser storage status', () => {
  it('uses an honest origin-level estimate without implying profile-level precision', () => {
    expect(formatStorageEstimate(0)).toBe('Approx. 0 B browser storage used');
    expect(formatStorageEstimate(2048)).toBe('Approx. 2 KB browser storage used');
    expect(formatStorageEstimate(2 * 1024 * 1024)).toBe('Approx. 2.0 MB browser storage used');
  });

  it('falls back honestly when the browser cannot provide an estimate', () => {
    expect(formatStorageEstimate(undefined)).toBe(FALLBACK_STORAGE_LABEL);
    expect(formatStorageEstimate(Number.NaN)).toBe(FALLBACK_STORAGE_LABEL);
  });
});
