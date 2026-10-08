import { describe, expect, it } from 'vitest';
import {
  formatLocalDateInput,
  formatLocalDateTimeInput,
  parseLocalDateInput,
  parseLocalDateKey,
  parseLocalDateTimeInput,
  parseLocalDateValue,
  toLocalDateKey,
} from '@/lib/date-utils';

describe('canonical local date and local wall-clock helpers', () => {
  it.each(['2026-01-05', '2026-08-12', '2024-02-29', '2028-02-29'])(
    'round-trips date-only key %s without UTC conversion',
    key => {
      const parsed = parseLocalDateKey(key);
      expect(parsed).not.toBeNull();
      expect(toLocalDateKey(parsed)).toBe(key);
      expect(formatLocalDateInput(parsed)).toBe(key);
      expect(toLocalDateKey(parseLocalDateInput(key))).toBe(key);
      expect(toLocalDateKey(parseLocalDateValue(key))).toBe(key);
    },
  );

  it('rejects invalid month, day, and local wall-clock values', () => {
    expect(parseLocalDateKey('2026-02-29')).toBeNull();
    expect(parseLocalDateInput('2026-02-30').getTime()).toBeNaN();
    expect(parseLocalDateTimeInput('2026-08-12T09:30').getHours()).toBe(9);
    expect(parseLocalDateTimeInput('2026-08-12T09:30').getMinutes()).toBe(30);
    expect(parseLocalDateTimeInput('2026-08-12T24:00').getTime()).toBeNaN();
  });

  it('keeps true timestamp values as instants while formatting them locally', () => {
    const timestamp = '2026-08-12T01:30:00.000Z';
    const parsed = parseLocalDateValue(timestamp);
    expect(parsed?.toISOString()).toBe(timestamp);
    expect(formatLocalDateTimeInput(parsed)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
