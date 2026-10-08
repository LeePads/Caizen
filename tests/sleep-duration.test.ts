import { describe, expect, it } from 'vitest';

import { prepareImport } from '@/lib/storage/import-integrity';
import { normalizeHealth } from '@/lib/health/normalization';
import {
  averageSleepDurationMinutes,
  averageOptionalSleepMetric,
  calculateSleepDurationMinutes,
  formatSleepDuration,
  getSleepDurationMinutes,
  normalizeOptionalSleepScore,
  normalizeOptionalTimesAwakened,
  normalizeSleepEntryRecord,
  parseSleepDurationParts,
} from '@/lib/health/sleep';

describe('sleep duration helpers', () => {
  it('calculates exact overnight duration across midnight', () => {
    expect(calculateSleepDurationMinutes('23:47', '07:23')).toBe(456);
  });

  it('calculates same-day duration and rejects equal times', () => {
    expect(calculateSleepDurationMinutes('09:15', '16:45')).toBe(450);
    expect(calculateSleepDurationMinutes('09:15', '09:15')).toBeNull();
  });

  it('supports duration-only entries and rejects a single time without duration', () => {
    expect(parseSleepDurationParts('7', '30')).toBe(450);
    expect(calculateSleepDurationMinutes('23:47', '')).toBeNull();
  });

  it('parses editable hour and minute parts within the existing 24-hour limit', () => {
    expect(parseSleepDurationParts('7', '04')).toBe(424);
    expect(parseSleepDurationParts('0', '30')).toBe(30);
    expect(parseSleepDurationParts('24', '00')).toBe(1440);
    expect(parseSleepDurationParts('24', '01')).toBeNull();
    expect(parseSleepDurationParts('7', '60')).toBeNull();
  });

  it('formats exact durations with minute precision', () => {
    expect(formatSleepDuration(456)).toBe('7h 36m');
    expect(formatSleepDuration(getSleepDurationMinutes({ hours: 7.5 }))).toBe('7h 30m');
  });

  it('prefers canonical minutes and preserves legacy decimal compatibility', () => {
    const normalized = normalizeSleepEntryRecord({
      id: 'sleep-1',
      hours: 7.5,
      sleepDurationMinutes: 456,
    });

    expect(normalized.sleepDurationMinutes).toBe(456);
    expect(normalized.hours).toBe(7.6);
    expect(normalizeSleepEntryRecord(normalized)).toEqual(normalized);
  });

  it('converts legacy hours when canonical minutes are absent', () => {
    const normalized = normalizeHealth({
      sleepEntries: [{ id: 'legacy', date: '2026-08-19', hours: 7.5 }],
    } as any);

    expect(normalized.sleepEntries?.[0]).toMatchObject({
      sleepDurationMinutes: 450,
      hours: 7.5,
    });
  });

  it('averages normalized durations in minutes', () => {
    expect(averageSleepDurationMinutes([
      { hours: 7.5 },
      { sleepDurationMinutes: 456, hours: 0 },
    ])).toBe(453);
  });

  it('averages only populated optional sleep metrics', () => {
    const entries = [
      { sleepScore: 88, timesAwakened: 2 },
      { sleepScore: undefined, timesAwakened: 0 },
      { sleepScore: 92, timesAwakened: undefined },
    ];

    expect(averageOptionalSleepMetric(entries, 'sleepScore')).toBe(90);
    expect(averageOptionalSleepMetric(entries, 'timesAwakened')).toBe(1);
    expect(averageOptionalSleepMetric([], 'sleepScore')).toBeNull();
  });

  it('validates optional wearable metrics', () => {
    expect(normalizeOptionalSleepScore(0)).toBe(0);
    expect(normalizeOptionalSleepScore(100)).toBe(100);
    expect(normalizeOptionalSleepScore(101)).toBeUndefined();
    expect(normalizeOptionalSleepScore(90.5)).toBeUndefined();
    expect(normalizeOptionalTimesAwakened(0)).toBe(0);
    expect(normalizeOptionalTimesAwakened(3)).toBe(3);
    expect(normalizeOptionalTimesAwakened(-1)).toBeUndefined();
    expect(normalizeOptionalTimesAwakened(1.5)).toBeUndefined();
  });
});

describe('sleep import compatibility', () => {
  it('normalizes legacy and exact-minute sleep records during import', () => {
    const prepared = prepareImport({
      format: 'caizen-data',
      version: 3,
      data: {
        currentProfileId: 'profile-sleep',
        profiles: [{
          id: 'profile-sleep',
          name: 'Sleep compatibility',
          health: {
            sleepEntries: [
              { id: 'legacy', date: '2026-08-19', hours: 7.5 },
              {
                id: 'exact',
                date: '2026-08-20',
                sleepDurationMinutes: 424,
                hours: 7,
                sleepScore: 88,
                timesAwakened: 2,
              },
            ],
          },
        }],
      },
    });

    expect(prepared.report.canImport).toBe(true);
    expect((prepared.state.profiles[0] as any).health.sleepEntries).toMatchObject([
      { sleepDurationMinutes: 450, hours: 7.5 },
      {
        sleepDurationMinutes: 424,
        hours: 424 / 60,
        sleepScore: 88,
        timesAwakened: 2,
      },
    ]);
  });
});
