import { describe, expect, it } from 'vitest';
import {
  getActiveFastingSessions,
  hasConflictingActiveFastingSession,
  hasInvalidFastingInterval,
  formatFastingDuration,
  getFastingElapsedMs,
  isValidFastingSession,
  isValidFastingTarget,
  MAX_FASTING_TARGET_MINUTES,
  FASTING_STRATEGIES,
  deriveFastingAnalytics,
} from '@/lib/health/fasting';
import { normalizeHealth } from '@/lib/health/normalization';

describe('fasting contracts', () => {
  it('accepts optional positive targets only through 48 hours', () => {
    expect(isValidFastingTarget(720)).toBe(true);
    expect(isValidFastingTarget(MAX_FASTING_TARGET_MINUTES)).toBe(true);
    expect(isValidFastingTarget(0)).toBe(false);
    expect(isValidFastingTarget(MAX_FASTING_TARGET_MINUTES + 1)).toBe(false);
    expect(isValidFastingTarget(720.5)).toBe(false);
  });

  it('derives elapsed duration from timestamps without automatically ending a fast', () => {
    const startedAt = new Date('2026-08-28T00:00:00Z');
    const elapsed = getFastingElapsedMs({ id: 'fast', startedAt, targetMinutes: 2_880, createdAt: startedAt }, new Date('2026-08-30T12:00:00Z'));
    expect(elapsed).toBe(216_000_000);
    expect(formatFastingDuration(elapsed)).toBe('60:00:00');
  });

  it('requires valid timestamps and an end no earlier than the start', () => {
    const start = new Date('2026-08-28T00:00:00Z');
    expect(isValidFastingSession({ startedAt: start, endedAt: null })).toBe(true);
    expect(isValidFastingSession({ startedAt: start, endedAt: new Date('2026-08-27T23:59:00Z') })).toBe(false);
    expect(hasInvalidFastingInterval({ startedAt: start, endedAt: new Date('2026-08-27T23:59:00Z') })).toBe(true);
  });

  it('applies the single-active-session policy used by context add and update', () => {
    const active = { id: 'active', startedAt: new Date('2026-08-28T00:00:00Z'), endedAt: null };
    expect(hasConflictingActiveFastingSession([active])).toBe(true);
    expect(hasConflictingActiveFastingSession([active], active.id)).toBe(false);
    expect(hasConflictingActiveFastingSession([{ ...active, endedAt: new Date('2026-08-28T01:00:00Z') }])).toBe(false);
  });

  it('drops impossible completed intervals while preserving duplicate active imports', () => {
    const normalized = normalizeHealth({
      fastingSessions: [
        { id: 'invalid', startedAt: '2026-08-28T02:00:00Z', endedAt: '2026-08-28T01:00:00Z' },
        { id: 'active-a', startedAt: '2026-08-28T00:00:00Z', endedAt: null },
        { id: 'active-b', startedAt: '2026-08-28T01:00:00Z', endedAt: null },
      ],
    } as any);
    expect(normalized.fastingSessions?.map(session => session.id)).toEqual(['active-a', 'active-b']);
    expect(getActiveFastingSessions(normalized.fastingSessions || [])).toHaveLength(2);
  });

  it('provides informational quick-start presets without changing persisted sessions', () => {
    expect(FASTING_STRATEGIES.map(strategy => strategy.targetMinutes)).toEqual([240, 600, 720, 960]);
    expect(FASTING_STRATEGIES.every(strategy => strategy.id && strategy.guidance)).toBe(true);
  });

  it('derives local completed duration analytics and preserves empty buckets', () => {
    const anchor = new Date('2026-08-20T12:00:00+08:00');
    const sessions = [
      { id: 'fast-1', startedAt: new Date('2026-08-19T08:00:00+08:00'), endedAt: new Date('2026-08-19T12:00:00+08:00'), createdAt: anchor },
      { id: 'fast-2', startedAt: new Date('2026-08-20T08:00:00+08:00'), endedAt: new Date('2026-08-20T18:00:00+08:00'), createdAt: anchor },
    ];
    const analytics = deriveFastingAnalytics(sessions, 7, anchor);
    expect(analytics.completedCount).toBe(2);
    expect(analytics.averageDurationMinutes).toBe(420);
    expect(analytics.longestDurationMinutes).toBe(600);
    expect(analytics.points).toHaveLength(7);
    expect(analytics.points.at(-1)?.durationMinutes).toBe(600);
  });
});
