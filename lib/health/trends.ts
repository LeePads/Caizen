import type { ActivityEntry, FoodEntry, NutritionField, SleepEntry, SleepQuality, WeightEntry, WorkoutSession } from '../types';
import { ALL_NUTRITION_FIELDS, hasCompleteNutrition, isNutritionFieldMissing } from './nutrition';
import { averageOptionalSleepMetric, averageSleepDurationMinutes, getSleepDurationMinutes } from './sleep';
import { toLocalDateKey } from '../utils';

export type HealthTrendRange = '7d' | '30d' | '3m' | '1y';

/** User-facing chart ranges: 7 daily, 4 weekly, or 12 monthly buckets. */
export type HealthChartRange = 'week' | 'month' | 'year';

export const HEALTH_CHART_RANGES: ReadonlyArray<{ id: HealthChartRange; label: string; windowLabel: string; bucketUnit: 'day' | 'week' | 'month' }> = [
  { id: 'week', label: 'Week', windowLabel: '7 days', bucketUnit: 'day' },
  { id: 'month', label: 'Month', windowLabel: '4 weeks', bucketUnit: 'week' },
  { id: 'year', label: 'Year', windowLabel: '12 months', bucketUnit: 'month' },
];

export type HealthTrendBucket = {
  key: string;
  start: Date;
  end: Date;
  label: string;
};

export type NutritionTrendPoint = {
  date: Date;
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sodium: number;
  fiber: number;
  sugar?: number;
  isComplete: boolean;
  hasCompleteData?: boolean;
  knownNutrientDayCount: Partial<Record<NutritionField, number>>;
  isExcluded?: boolean;
  entryCount: number;
  includedDayCount?: number;
  incompleteDayCount?: number;
  excludedDayCount?: number;
  notIncludedDayCount?: number;
};

export type WeightTrendSummary = {
  latest: number | null;
  average: number | null;
  change: number | null;
  count: number;
  points: Array<{ date: Date; label: string; value: number }>;
};

export type SleepTrendSummary = {
  averageMinutes: number;
  scoreAverage: number | null;
  awakeningsAverage: number | null;
  quality: SleepQuality | null;
  count: number;
  points: Array<{ date: Date; label: string; minutes: number; hasData: boolean }>;
};

export type WorkoutTrendSummary = {
  sessions: number;
  activeMinutes: number;
  averageSessionMinutes: number | null;
  caloriesBurned: number | null;
  points: Array<{ date: Date; label: string; sessions: number; activeMinutes: number }>;
};

const nonNegative = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

const hasNutritionValue = (entry: FoodEntry, field: NutritionField) => (
  !isNutritionFieldMissing(entry, field) &&
  entry[field] !== undefined &&
  entry[field] !== null
);

type NutritionDayTotal = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sodium: number;
  fiber: number;
  sugar?: number;
  entries: number;
  hasCompleteData: boolean;
  knownNutrients: Set<NutritionField>;
};

export function getLocalTrendDates(days: number, anchor = new Date()): Date[] {
  const end = new Date(anchor);
  end.setHours(0, 0, 0, 0);
  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (days - 1 - index));
    return date;
  });
}

function labelFor(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function startOfLocalWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const mondayOffset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - mondayOffset);
  return result;
}

function endOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function getHealthTrendBuckets(range: HealthTrendRange, anchor = new Date()): HealthTrendBucket[] {
  const end = new Date(anchor);
  end.setHours(0, 0, 0, 0);

  if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30;
    return Array.from({ length: days }, (_, index) => {
      const start = new Date(end);
      start.setDate(end.getDate() - (days - 1 - index));
      return { key: toLocalDateKey(start), start, end: endOfLocalDay(start), label: labelFor(start) };
    });
  }

  if (range === '3m') {
    const currentWeek = startOfLocalWeek(end);
    return Array.from({ length: 13 }, (_, index) => {
      const start = new Date(currentWeek);
      start.setDate(currentWeek.getDate() - (12 - index) * 7);
      const bucketEnd = new Date(start);
      bucketEnd.setDate(start.getDate() + 6);
      return { key: toLocalDateKey(start), start, end: index === 12 ? endOfLocalDay(end) : endOfLocalDay(bucketEnd), label: labelFor(start) };
    });
  }

  const currentMonth = new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0, 0);
  return Array.from({ length: 12 }, (_, index) => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - (11 - index), 1, 0, 0, 0, 0);
    const bucketEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    return { key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, start, end: index === 11 ? endOfLocalDay(end) : bucketEnd, label: monthLabel(start) };
  });
}

function rollingWeekLabel(start: Date, end: Date) {
  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  const startLabel = labelFor(start);
  const endLabel = sameMonth ? String(end.getDate()) : labelFor(end);
  return `${startLabel}–${endLabel}`;
}

/**
 * Buckets for the user-facing Week / Month / Year charts.
 * Week: the last 7 local days. Month: 4 rolling 7-day buckets covering the
 * last 28 days, ending today. Year: the last 12 calendar months, ending with
 * the current month through today.
 */
export function getHealthChartBuckets(range: HealthChartRange, anchor = new Date()): HealthTrendBucket[] {
  if (range === 'week') return getHealthTrendBuckets('7d', anchor);

  if (range === 'month') {
    const end = new Date(anchor);
    end.setHours(0, 0, 0, 0);
    return Array.from({ length: 4 }, (_, index) => {
      const bucketEndDay = new Date(end);
      bucketEndDay.setDate(end.getDate() - (3 - index) * 7);
      const start = new Date(bucketEndDay);
      start.setDate(bucketEndDay.getDate() - 6);
      return { key: toLocalDateKey(start), start, end: endOfLocalDay(bucketEndDay), label: rollingWeekLabel(start, bucketEndDay) };
    });
  }

  return getHealthTrendBuckets('1y', anchor).map(bucket => ({
    ...bucket,
    label: bucket.start.toLocaleDateString('en-US', { month: 'short' }),
  }));
}

export function deriveNutritionTrend(
  entries: FoodEntry[],
  includedDateKeys: string[],
  dates: Date[],
  excludedDateKeys: string[] = [],
): NutritionTrendPoint[] {
  const included = new Set(includedDateKeys);
  const excluded = new Set(excludedDateKeys);
  return dates.map(date => {
    const dateKey = toLocalDateKey(date);
    const dayEntries = entries.filter(entry => toLocalDateKey(new Date(entry.date)) === dateKey);
    const isComplete = included.has(dateKey);
    const hasCompleteData = dayEntries.length > 0 && dayEntries.every(hasCompleteNutrition);
    const totals: NutritionDayTotal = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      sodium: 0,
      fiber: 0,
      entries: dayEntries.length,
      hasCompleteData,
      knownNutrients: new Set<NutritionField>(),
    };
    dayEntries.forEach(entry => {
      ALL_NUTRITION_FIELDS.forEach(field => {
        if (!hasNutritionValue(entry, field)) return;
        totals[field] = nonNegative(totals[field]) + nonNegative(entry[field]);
        totals.knownNutrients.add(field);
      });
    });
    const knownNutrientDayCount = Object.fromEntries(
      ALL_NUTRITION_FIELDS.map(field => [field, isComplete && totals.knownNutrients.has(field) ? 1 : 0]),
    ) as Partial<Record<NutritionField, number>>;
    return {
      date,
      label: labelFor(date),
      calories: isComplete && totals.knownNutrients.has('calories') ? totals.calories : 0,
      protein: isComplete && totals.knownNutrients.has('protein') ? totals.protein : 0,
      carbs: isComplete && totals.knownNutrients.has('carbs') ? totals.carbs : 0,
      fat: isComplete && totals.knownNutrients.has('fat') ? totals.fat : 0,
      sodium: isComplete && totals.knownNutrients.has('sodium') ? totals.sodium : 0,
      fiber: isComplete && totals.knownNutrients.has('fiber') ? totals.fiber : 0,
      ...(isComplete && totals.knownNutrients.has('sugar') ? { sugar: totals.sugar } : {}),
      isComplete,
      hasCompleteData,
      knownNutrientDayCount,
      isExcluded: dayEntries.length > 0 && !isComplete && excluded.has(dateKey),
      entryCount: dayEntries.length,
      includedDayCount: isComplete ? 1 : 0,
      incompleteDayCount: dayEntries.length > 0 && !hasCompleteData ? 1 : 0,
      excludedDayCount: dayEntries.length > 0 && !isComplete && excluded.has(dateKey) ? 1 : 0,
      notIncludedDayCount: dayEntries.length > 0 && !isComplete && !excluded.has(dateKey) ? 1 : 0,
    };
  });
}

export function deriveWeightTrend(entries: WeightEntry[], dates: Date[]): WeightTrendSummary {
  const start = dates[0];
  const end = dates[dates.length - 1];
  const points = entries
    .filter(entry => {
      const date = new Date(entry.date);
      return date >= start && date < new Date(end.getTime() + 86400000) && nonNegative(entry.weightKg) > 0;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(entry => ({ date: new Date(entry.date), label: labelFor(new Date(entry.date)), value: nonNegative(entry.weightKg) }));
  const values = points.map(point => point.value);
  return {
    latest: values.at(-1) ?? null,
    average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    change: values.length > 1 ? values.at(-1)! - values[0] : null,
    count: values.length,
    points,
  };
}

export function deriveSleepTrend(entries: SleepEntry[], dates: Date[]): SleepTrendSummary {
  const dateKeys = new Set(dates.map(toLocalDateKey));
  const inRange = entries.filter(entry => dateKeys.has(toLocalDateKey(new Date(entry.date))));
  const withDuration = inRange.filter(entry => getSleepDurationMinutes(entry) > 0);
  const qualities = inRange.map(entry => entry.quality).filter(Boolean);
  const quality = qualities.length
    ? qualities[qualities.length - 1] || null
    : null;
  return {
    averageMinutes: averageSleepDurationMinutes(withDuration),
    scoreAverage: averageOptionalSleepMetric(inRange, 'sleepScore'),
    awakeningsAverage: averageOptionalSleepMetric(inRange, 'timesAwakened'),
    quality,
    count: withDuration.length,
    points: dates.map(date => {
      const day = inRange.filter(entry => toLocalDateKey(new Date(entry.date)) === toLocalDateKey(date));
      const minutes = day.length ? getSleepDurationMinutes(day[day.length - 1]) : 0;
      return { date, label: labelFor(date), minutes, hasData: day.length > 0 };
    }),
  };
}

function bucketForDate(date: Date, buckets: HealthTrendBucket[]): HealthTrendBucket | undefined {
  return buckets.find(bucket => date >= bucket.start && date <= bucket.end);
}

export function deriveNutritionTrendForBuckets(
  entries: FoodEntry[],
  includedDateKeys: string[],
  buckets: HealthTrendBucket[],
  excludedDateKeys: string[] = [],
): NutritionTrendPoint[] {
  const included = new Set(includedDateKeys);
  const excluded = new Set(excludedDateKeys);
  return buckets.map(bucket => {
    const dayTotals = new Map<string, NutritionDayTotal>();
    entries.forEach(entry => {
      const date = new Date(entry.date);
      if (!bucketForDate(date, [bucket])) return;
      const key = toLocalDateKey(date);
      const current = dayTotals.get(key) || { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, fiber: 0, entries: 0, hasCompleteData: true, knownNutrients: new Set<NutritionField>() };
      ALL_NUTRITION_FIELDS.forEach(field => {
        if (!hasNutritionValue(entry, field)) return;
        current[field] = nonNegative(current[field]) + nonNegative(entry[field]);
        current.knownNutrients.add(field);
      });
      current.entries += 1;
      current.hasCompleteData = current.hasCompleteData && hasCompleteNutrition(entry);
      dayTotals.set(key, current);
    });
    const completeDays = [...dayTotals.entries()].filter(([key]) => included.has(key));
    const average = (field: NutritionField) => {
      const knownDays = completeDays.filter(([, value]) => value.knownNutrients.has(field));
      return knownDays.length
        ? knownDays.reduce((sum, [, value]) => sum + nonNegative(value[field]), 0) / knownDays.length
        : 0;
    };
    const knownNutrientDayCount = Object.fromEntries(
      ALL_NUTRITION_FIELDS.map(field => [field, completeDays.filter(([, value]) => value.knownNutrients.has(field)).length]),
    ) as Partial<Record<NutritionField, number>>;
    const incompleteDayCount = [...dayTotals.values()].filter(value => !value.hasCompleteData).length;
    const excludedDayCount = [...dayTotals.entries()].filter(([key]) => !included.has(key) && excluded.has(key)).length;
    const notIncludedDayCount = [...dayTotals.entries()].filter(([key]) => !included.has(key) && !excluded.has(key)).length;
    return {
      date: bucket.start,
      label: bucket.label,
      calories: average('calories'),
      protein: average('protein'),
      carbs: average('carbs'),
      fat: average('fat'),
      sodium: average('sodium'),
      fiber: average('fiber'),
      ...(knownNutrientDayCount.sugar ? { sugar: average('sugar') } : {}),
      isComplete: completeDays.length > 0,
      knownNutrientDayCount,
      hasCompleteData: [...dayTotals.values()].some(value => value.hasCompleteData),
      isExcluded: completeDays.length === 0 && excludedDayCount > 0 && incompleteDayCount === 0 && notIncludedDayCount === 0,
      entryCount: [...dayTotals.values()].reduce((sum, value) => sum + value.entries, 0),
      includedDayCount: completeDays.length,
      incompleteDayCount,
      excludedDayCount,
      notIncludedDayCount,
    };
  });
}

export function deriveSleepTrendForBuckets(entries: SleepEntry[], buckets: HealthTrendBucket[]): SleepTrendSummary {
  const inRange = entries.filter(entry => bucketForDate(new Date(entry.date), buckets));
  const withDuration = inRange.filter(entry => getSleepDurationMinutes(entry) > 0);
  const quality = inRange.map(entry => entry.quality).filter(Boolean).at(-1) || null;
  return {
    averageMinutes: averageSleepDurationMinutes(withDuration),
    scoreAverage: averageOptionalSleepMetric(inRange, 'sleepScore'),
    awakeningsAverage: averageOptionalSleepMetric(inRange, 'timesAwakened'),
    quality,
    count: withDuration.length,
    points: buckets.map(bucket => {
      const bucketEntries = inRange.filter(entry => bucketForDate(new Date(entry.date), [bucket]));
      const durationEntries = bucketEntries.filter(entry => getSleepDurationMinutes(entry) > 0);
      const minutes = durationEntries.length
        ? durationEntries.reduce((sum, entry) => sum + getSleepDurationMinutes(entry), 0) / durationEntries.length
        : 0;
      return { date: bucket.start, label: bucket.label, minutes, hasData: bucketEntries.length > 0 };
    }),
  };
}

export function deriveWorkoutTrendForBuckets(
  entries: ActivityEntry[],
  buckets: HealthTrendBucket[],
  sessions: WorkoutSession[] = [],
): WorkoutTrendSummary {
  const inRange = entries.filter(entry => bucketForDate(new Date(entry.date), buckets));
  const completedSessions = sessions.filter(session => session.status === 'completed' && bucketForDate(new Date(session.startedAt), buckets));
  const durationEntries = inRange.filter(entry => nonNegative(entry.durationMinutes) > 0);
  const loggedCalories = inRange.filter(entry => nonNegative(entry.caloriesBurned) > 0);
  const points = buckets.map(bucket => {
    const bucketEntries = inRange.filter(entry => bucketForDate(new Date(entry.date), [bucket]));
    const bucketSessions = completedSessions.filter(session => bucketForDate(new Date(session.startedAt), [bucket]));
    return {
      date: bucket.start,
      label: bucket.label,
      sessions: bucketEntries.length + bucketSessions.length,
      activeMinutes: Math.round(bucketEntries.reduce((sum, entry) => sum + nonNegative(entry.durationMinutes), 0) + bucketSessions.reduce((sum, session) => sum + nonNegative(session.durationMinutes), 0)),
    };
  });
  return {
    sessions: inRange.length + completedSessions.length,
    activeMinutes: Math.round(durationEntries.reduce((sum, entry) => sum + nonNegative(entry.durationMinutes), 0) + completedSessions.reduce((sum, session) => sum + nonNegative(session.durationMinutes), 0)),
    averageSessionMinutes: durationEntries.length + completedSessions.length
      ? (durationEntries.reduce((sum, entry) => sum + nonNegative(entry.durationMinutes), 0) + completedSessions.reduce((sum, session) => sum + nonNegative(session.durationMinutes), 0)) / (durationEntries.length + completedSessions.length)
      : null,
    caloriesBurned: loggedCalories.length ? loggedCalories.reduce((sum, entry) => sum + nonNegative(entry.caloriesBurned), 0) : null,
    points,
  };
}

export function sumExerciseMinutes(entries: ActivityEntry[], dates: Date[]) {
  const keys = new Set(dates.map(toLocalDateKey));
  return Math.round(entries.reduce((sum, entry) => (
    keys.has(toLocalDateKey(new Date(entry.date))) ? sum + nonNegative(entry.durationMinutes) : sum
  ), 0));
}

export function deriveWorkoutTrend(entries: ActivityEntry[], dates: Date[], sessions: WorkoutSession[] = []): WorkoutTrendSummary {
  const dateKeys = new Set(dates.map(toLocalDateKey));
  const inRange = entries.filter(entry => dateKeys.has(toLocalDateKey(new Date(entry.date))));
  const completedSessions = sessions.filter(session => session.status === 'completed' && dateKeys.has(toLocalDateKey(new Date(session.startedAt))));
  const durationEntries = inRange.filter(entry => nonNegative(entry.durationMinutes) > 0);
  const loggedCalories = inRange.filter(entry => nonNegative(entry.caloriesBurned) > 0);
  const points = dates.map(date => {
    const dayKey = toLocalDateKey(date);
    const dayEntries = inRange.filter(entry => toLocalDateKey(new Date(entry.date)) === dayKey);
    const daySessions = completedSessions.filter(session => toLocalDateKey(new Date(session.startedAt)) === dayKey);
    return {
      date,
      label: labelFor(date),
      sessions: dayEntries.length + daySessions.length,
      activeMinutes: Math.round(dayEntries.reduce((sum, entry) => sum + nonNegative(entry.durationMinutes), 0) + daySessions.reduce((sum, session) => sum + nonNegative(session.durationMinutes), 0)),
    };
  });

  return {
    sessions: inRange.length + completedSessions.length,
    activeMinutes: Math.round(durationEntries.reduce((sum, entry) => sum + nonNegative(entry.durationMinutes), 0) + completedSessions.reduce((sum, session) => sum + nonNegative(session.durationMinutes), 0)),
    averageSessionMinutes: durationEntries.length + completedSessions.length
      ? (durationEntries.reduce((sum, entry) => sum + nonNegative(entry.durationMinutes), 0) + completedSessions.reduce((sum, session) => sum + nonNegative(session.durationMinutes), 0)) / (durationEntries.length + completedSessions.length)
      : null,
    caloriesBurned: loggedCalories.length
      ? loggedCalories.reduce((sum, entry) => sum + nonNegative(entry.caloriesBurned), 0)
      : null,
    points,
  };
}
