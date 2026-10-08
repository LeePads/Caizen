import type { ActivityEntry, WorkoutRoutine, WorkoutSession } from '../types';
import { getHealthTrendBuckets, type HealthTrendBucket, type HealthTrendRange } from './trends';
import { parseLocalDateValue, toLocalDateKey } from '../date-utils';

type WorkoutRecord = {
  id: string;
  kind: 'manual' | 'guided';
  date: Date;
  minutes: number;
  durationBearing: boolean;
  routineId?: string;
  routineName: string;
};

export type WorkoutStatistics = {
  range: HealthTrendRange;
  buckets: HealthTrendBucket[];
  sessions: number;
  totalMinutes: number;
  activeDays: number;
  averageSessionMinutes: number | null;
  averageWorkoutDayMinutes: number | null;
  averageDayMinutes: number | null;
  averageSessionsPerWeek: number;
  timePoints: Array<{ label: string; minutes: number }>;
  frequencyPoints: Array<{ label: string; sessions: number }>;
  routineBreakdown: Array<{ id: string; name: string; sessions: number; minutes: number }>;
};

const numeric = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const localDate = (value: Date | string | number | null | undefined) => parseLocalDateValue(value);

const sessionDate = (session: WorkoutSession) => localDate(session.completedAt) || localDate(session.startedAt);

const representedDayCount = (buckets: HealthTrendBucket[]) => {
  const first = buckets[0]?.start;
  const last = buckets.at(-1)?.end;
  if (!first || !last) return 0;
  const firstDate = new Date(first);
  const lastDate = new Date(last);
  const firstCalendarDay = Date.UTC(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
  const lastCalendarDay = Date.UTC(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
  return Math.max(1, Math.round((lastCalendarDay - firstCalendarDay) / 86_400_000) + 1);
};

const bucketForDate = (date: Date, buckets: HealthTrendBucket[]) => {
  const time = date.getTime();
  return buckets.find(bucket => time >= bucket.start.getTime() && time <= bucket.end.getTime());
};

export function deriveWorkoutStatistics(
  entries: ActivityEntry[],
  sessions: WorkoutSession[],
  routines: WorkoutRoutine[] = [],
  range: HealthTrendRange = '7d',
  anchor = new Date(),
): WorkoutStatistics {
  const buckets = getHealthTrendBuckets(range, anchor);
  const records: WorkoutRecord[] = [
    ...entries.flatMap(entry => {
      const date = localDate(entry.date);
      if (!date || !bucketForDate(date, buckets)) return [];
      const minutes = numeric(entry.durationMinutes);
      const routineId = entry.linkedRoutineId || entry.workoutPlanId;
      const routine = routineId ? routines.find(item => item.id === routineId) : undefined;
      return [{
        id: entry.id,
        kind: 'manual' as const,
        date,
        minutes,
        durationBearing: minutes > 0,
        routineId,
        routineName: routine?.name || 'Manual activity',
      }];
    }),
    ...sessions.flatMap(session => {
      if (session.status !== 'completed') return [];
      const date = sessionDate(session);
      if (!date || !bucketForDate(date, buckets)) return [];
      const minutes = numeric(session.durationMinutes);
      const routineId = session.sourceRoutineId || session.routineId;
      return [{
        id: session.id,
        kind: 'guided' as const,
        date,
        minutes,
        durationBearing: minutes > 0,
        routineId,
        routineName: session.routineName || 'Workout',
      }];
    }),
  ];

  const durationRecords = records.filter(record => record.durationBearing);
  const totalMinutes = durationRecords.reduce((sum, record) => sum + record.minutes, 0);
  const durationDays = new Set(durationRecords.map(record => toLocalDateKey(record.date)));
  const dayCount = representedDayCount(buckets);
  const routineMap = new Map<string, { id: string; name: string; sessions: number; minutes: number }>();

  records.forEach(record => {
    const id = record.routineId || `manual:${record.routineName}`;
    const current = routineMap.get(id) || { id, name: record.routineName, sessions: 0, minutes: 0 };
    current.sessions += 1;
    current.minutes += record.minutes;
    routineMap.set(id, current);
  });

  return {
    range,
    buckets,
    sessions: records.length,
    totalMinutes,
    activeDays: new Set(records.map(record => toLocalDateKey(record.date))).size,
    averageSessionMinutes: durationRecords.length ? totalMinutes / durationRecords.length : null,
    averageWorkoutDayMinutes: durationDays.size ? totalMinutes / durationDays.size : null,
    averageDayMinutes: dayCount ? totalMinutes / dayCount : null,
    averageSessionsPerWeek: dayCount ? records.length / (dayCount / 7) : 0,
    timePoints: buckets.map(bucket => ({
      label: bucket.label,
      minutes: Math.round(records.filter(record => bucketForDate(record.date, [bucket])).reduce((sum, record) => sum + record.minutes, 0)),
    })),
    frequencyPoints: buckets.map(bucket => ({
      label: bucket.label,
      sessions: records.filter(record => bucketForDate(record.date, [bucket])).length,
    })),
    routineBreakdown: Array.from(routineMap.values()).sort((a, b) => b.sessions - a.sessions || b.minutes - a.minutes),
  };
}
