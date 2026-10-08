import type { NoXTracker, StreakPausePeriod } from '@/lib/types';
import { parseLocalDateValue } from '@/lib/date-utils';

const DAY_MS = 86_400_000;

export const toLocalDay = (value: Date | string | number) => {
  const date = parseLocalDateValue(value) || new Date(Number.NaN);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const localDayDifference = (later: Date, earlier: Date) => {
  const laterUtc = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  const earlierUtc = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  return Math.max(0, Math.floor((laterUtc - earlierUtc) / DAY_MS));
};

export const normalizePauseHistory = (tracker: NoXTracker): StreakPausePeriod[] => {
  const existing = (tracker.pauseHistory || [])
    .filter(period => period?.pausedAt)
    .map(period => ({
      ...period,
      id: period.id || `streak-pause-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pausedAt: toLocalDay(period.pausedAt),
      resumedAt: period.resumedAt ? toLocalDay(period.resumedAt) : null,
    }));

  if (existing.length > 0 || !tracker.pausedAt) return existing;

  return [{
    id: `streak-pause-legacy-${tracker.id}`,
    pausedAt: toLocalDay(tracker.pausedAt),
    resumedAt: tracker.resumeDate ? toLocalDay(tracker.resumeDate) : null,
    reason: tracker.pauseReason,
  }];
};

export const getPausedDays = (tracker: NoXTracker, now = new Date()) => {
  const start = toLocalDay(tracker.startDate);
  const periods = normalizePauseHistory(tracker);

  if (periods.length === 0) {
    return Math.max(0, Number(tracker.accumulatedPausedDays || 0));
  }

  let completedHistoryDays = 0;
  const historyDays = periods.reduce((sum, period) => {
    const pausedAt = toLocalDay(period.pausedAt);
    const resumedAt = period.resumedAt ? toLocalDay(period.resumedAt) : toLocalDay(now);
    if (resumedAt <= start || pausedAt >= resumedAt) return sum;
    const effectiveStart = pausedAt < start ? start : pausedAt;
    const days = localDayDifference(resumedAt, effectiveStart);
    if (period.resumedAt) completedHistoryDays += days;
    return sum + days;
  }, 0);

  const legacyExtra = Math.max(
    0,
    Number(tracker.accumulatedPausedDays || 0) - completedHistoryDays,
  );
  return historyDays + legacyExtra;
};

export const getStreakActiveDays = (tracker: NoXTracker, now = new Date()) => {
  const start = toLocalDay(tracker.startDate);
  const end = toLocalDay(now);
  return Math.max(0, localDayDifference(end, start) - getPausedDays(tracker, now));
};

export const validatePauseHistory = (
  startDate: Date,
  periods: StreakPausePeriod[],
): string | null => {
  const start = toLocalDay(startDate);
  if (start > toLocalDay(new Date())) return 'The streak start date cannot be in the future.';

  const normalized = periods
    .filter(period => period.pausedAt)
    .map(period => ({
      start: toLocalDay(period.pausedAt),
      end: period.resumedAt ? toLocalDay(period.resumedAt) : null,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (let index = 0; index < normalized.length; index += 1) {
    const period = normalized[index];
    if (period.start < start) return 'A pause period cannot begin before the streak.';
    if (period.end && period.end <= period.start) return 'A resume date must be after its pause date.';
    const next = normalized[index + 1];
    if (next && (!period.end || next.start < period.end)) return 'Pause periods cannot overlap.';
  }

  return null;
};
