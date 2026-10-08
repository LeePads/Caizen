import type { FastingSession } from '../types';
import { parseLocalDateValue, toLocalDateKey } from '../date-utils';
import { getHealthChartBuckets, type HealthChartRange } from './trends';

export const MAX_FASTING_TARGET_MINUTES = 2_880;

export type FastingStrategyPreset = {
  id: 'four-hour-reset' | 'ten-hour-water' | 'twelve-hour-overnight' | 'sixteen-hour-overnight';
  label: string;
  targetMinutes: number;
  guidance: string;
};

/** Code-defined quick starts. The id is not persisted on FastingSession. */
export const FASTING_STRATEGIES: readonly FastingStrategyPreset[] = [
  { id: 'four-hour-reset', label: '4 hours · no eating', targetMinutes: 240, guidance: 'No food during this fast. Tracking is informational only.' },
  { id: 'ten-hour-water', label: '10 hours · water only', targetMinutes: 600, guidance: 'Water only during this fast. Tracking is informational only.' },
  { id: 'twelve-hour-overnight', label: '12 hours · overnight', targetMinutes: 720, guidance: 'A simple overnight fasting window.' },
  { id: 'sixteen-hour-overnight', label: '16 hours · overnight', targetMinutes: 960, guidance: 'An extended overnight fasting window.' },
];

export type FastingAnalytics = {
  completedCount: number;
  averageDurationMinutes: number | null;
  longestDurationMinutes: number | null;
  points: Array<{ date: Date; label: string; durationMinutes: number; hasData: boolean; completedFastCount: number }>;
};

const timestamp = (value: unknown) => {
  const date = parseLocalDateValue(value as Date | string | number | null | undefined);
  return date && Number.isFinite(date.getTime()) ? date.getTime() : null;
};

export function getActiveFastingSessions(sessions: FastingSession[]) {
  return sessions
    .filter(session => session.endedAt == null && timestamp(session.startedAt) !== null)
    .sort((a, b) => (timestamp(b.startedAt) || 0) - (timestamp(a.startedAt) || 0));
}

export function getActiveFastingSession(sessions: FastingSession[]) {
  return getActiveFastingSessions(sessions)[0] || null;
}

export function hasConflictingActiveFastingSession(
  sessions: Pick<FastingSession, 'id' | 'endedAt'>[],
  excludeId?: string,
) {
  return sessions.some(session => session.id !== excludeId && session.endedAt == null);
}

export function hasInvalidFastingInterval(
  session: { startedAt?: unknown; endedAt?: unknown },
) {
  const startedAt = timestamp(session.startedAt);
  const endedAt = session.endedAt == null ? null : timestamp(session.endedAt);
  return startedAt !== null && endedAt !== null && endedAt < startedAt;
}

export function getFastingElapsedMs(session: FastingSession, now = new Date()) {
  const startedAt = timestamp(session.startedAt);
  if (startedAt === null) return 0;
  const endedAt = session.endedAt == null ? now.getTime() : timestamp(session.endedAt);
  if (endedAt === null) return 0;
  return Math.max(0, endedAt - startedAt);
}

export function getFastingDurationMinutes(session: FastingSession) {
  return Math.floor(getFastingElapsedMs(session) / 60_000);
}

export function formatFastingDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
}

export function formatFastingShortDuration(milliseconds: number) {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function isValidFastingTarget(value: unknown) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= MAX_FASTING_TARGET_MINUTES;
}

export function isValidFastingSession(session: Pick<FastingSession, 'startedAt' | 'endedAt'>) {
  const startedAt = timestamp(session.startedAt);
  const endedAt = session.endedAt == null ? null : timestamp(session.endedAt);
  return startedAt !== null && (session.endedAt == null || endedAt !== null && endedAt >= startedAt);
}

export function fastingDateKey(session: FastingSession) {
  const date = parseLocalDateValue(session.startedAt);
  return date ? toLocalDateKey(date) : '';
}

function formatFastingDateRange(start: Date, end: Date) {
  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(start.getFullYear() !== end.getFullYear() ? { year: 'numeric' as const } : {}),
  });
  const endLabel = end.toLocaleDateString('en-US', {
    ...(sameMonth ? {} : { month: 'short' as const }),
    day: 'numeric',
    ...(start.getFullYear() !== end.getFullYear() ? { year: 'numeric' as const } : {}),
  });
  return `${startLabel}–${endLabel}`;
}

export function deriveFastingAnalytics(
  sessions: FastingSession[],
  days = 30,
  anchor = new Date(),
): FastingAnalytics {
  const end = new Date(anchor);
  end.setHours(0, 0, 0, 0);
  const count = Math.max(1, Math.floor(days));
  const dates = Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (count - 1 - index));
    return date;
  });
  const keys = new Set(dates.map(toLocalDateKey));
  const completed = sessions
    .filter(session => session.endedAt != null && keys.has(fastingDateKey(session)))
    .map(session => ({ session, durationMinutes: Math.floor(getFastingElapsedMs(session, session.endedAt || undefined) / 60_000) }));
  const durations = completed.map(item => item.durationMinutes);
  const completedByDate = new Map<string, typeof completed>();
  completed.forEach(item => {
    const key = fastingDateKey(item.session);
    const values = completedByDate.get(key) || [];
    values.push(item);
    completedByDate.set(key, values);
  });
  const dailyPoints = dates.map(date => {
    const day = completedByDate.get(toLocalDateKey(date)) || [];
    return {
      date,
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      durationMinutes: day.reduce((max, item) => Math.max(max, item.durationMinutes), 0),
      hasData: day.length > 0,
      completedFastCount: day.length,
    };
  });
  const points = count <= 7
    ? dailyPoints
    : Array.from({ length: Math.ceil(count / 7) }, (_, index) => {
      const endIndex = count - 1 - index * 7;
      const startIndex = Math.max(0, endIndex - 6);
      const start = dates[startIndex];
      const end = dates[endIndex];
      const bucketCompleted = dates
        .slice(startIndex, endIndex + 1)
        .flatMap(date => completedByDate.get(toLocalDateKey(date)) || []);
      const totalMinutes = bucketCompleted.reduce((sum, item) => sum + item.durationMinutes, 0);
      return {
        date: start,
        label: formatFastingDateRange(start, end),
        durationMinutes: bucketCompleted.length ? Math.round(totalMinutes / bucketCompleted.length) : 0,
        hasData: bucketCompleted.length > 0,
        completedFastCount: bucketCompleted.length,
      };
    }).reverse();

  return {
    completedCount: completed.length,
    averageDurationMinutes: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    longestDurationMinutes: durations.length ? Math.max(...durations) : null,
    points,
  };
}

/**
 * Fasting analytics for the shared Week / Month / Year chart model.
 * Week plots the longest completed fast started on each of the last 7 days.
 * Month (4 rolling weeks) and Year (12 months) plot the average completed
 * fasting duration per bucket. Summary values cover the whole plotted window.
 */
export function deriveFastingAnalyticsForRange(
  sessions: FastingSession[],
  range: HealthChartRange,
  anchor = new Date(),
): FastingAnalytics {
  const buckets = getHealthChartBuckets(range, anchor);
  const windowStart = buckets[0].start.getTime();
  const windowEnd = buckets[buckets.length - 1].end.getTime();
  const completed = sessions.flatMap(session => {
    if (session.endedAt == null) return [];
    const startedAt = parseLocalDateValue(session.startedAt);
    if (!startedAt) return [];
    const time = startedAt.getTime();
    if (time < windowStart || time > windowEnd) return [];
    return [{ time, durationMinutes: Math.floor(getFastingElapsedMs(session, session.endedAt || undefined) / 60_000) }];
  });
  const durations = completed.map(item => item.durationMinutes);
  const points = buckets.map(bucket => {
    const bucketDurations = completed
      .filter(item => item.time >= bucket.start.getTime() && item.time <= bucket.end.getTime())
      .map(item => item.durationMinutes);
    const durationMinutes = !bucketDurations.length
      ? 0
      : range === 'week'
        ? Math.max(...bucketDurations)
        : Math.round(bucketDurations.reduce((sum, value) => sum + value, 0) / bucketDurations.length);
    return {
      date: bucket.start,
      label: bucket.label,
      durationMinutes,
      hasData: bucketDurations.length > 0,
      completedFastCount: bucketDurations.length,
    };
  });

  return {
    completedCount: completed.length,
    averageDurationMinutes: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    longestDurationMinutes: durations.length ? Math.max(...durations) : null,
    points,
  };
}
