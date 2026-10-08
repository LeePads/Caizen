'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ActivityEntry, BodyMeasurementEntry, FoodEntry, SleepEntry, WaterEntry, WeightEntry, WorkoutExerciseDefinition, WorkoutSession } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HealthDetails } from '@/components/health/HealthDetails';
import { HealthBarChart } from '@/components/health/HealthBarChart';
import { formatSleepDuration, formatSleepQuality } from '@/lib/health/sleep';
import { deriveNutritionTrend, deriveNutritionTrendForBuckets, deriveSleepTrend, deriveSleepTrendForBuckets, deriveWeightTrend, deriveWorkoutTrend, deriveWorkoutTrendForBuckets, getHealthChartBuckets, HEALTH_CHART_RANGES, type HealthChartRange } from '@/lib/health/trends';
import { deriveExercisePerformance } from '@/lib/health/workout-performance';
import { inferWorkoutLoadMode } from '@/lib/health/workout-taxonomy';
import { toLocalDateKey } from '@/lib/date-utils';
import { cmToInches, formatMeasurementNumber, kgToWeight, type HeightUnit, type WeightUnit } from '@/lib/health/measurements';

type TrendTab = 'nutrition' | 'workout' | 'body' | 'sleep';
type Range = HealthChartRange;
type NutritionMetric = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sodium' | 'sugar';

const NUTRITION_METRICS: Array<{ id: NutritionMetric; label: string; unit: 'kcal' | 'g' | 'mg'; color: string }> = [
  { id: 'calories', label: 'Calories', unit: 'kcal', color: 'bg-primary/75' },
  { id: 'protein', label: 'Protein', unit: 'g', color: 'bg-blue-500/75' },
  { id: 'carbs', label: 'Carbs', unit: 'g', color: 'bg-violet-500/75' },
  { id: 'fat', label: 'Fat', unit: 'g', color: 'bg-amber-500/75' },
  { id: 'fiber', label: 'Fiber', unit: 'g', color: 'bg-lime-500/75' },
  { id: 'sodium', label: 'Sodium', unit: 'mg', color: 'bg-orange-500/75' },
  { id: 'sugar', label: 'Sugar', unit: 'g', color: 'bg-rose-500/75' },
];

function format(value: number, decimals = 0) {
  return value.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function nutritionPointStatus(
  point: ReturnType<typeof deriveNutritionTrend>[number],
  value: number,
  metric: { id: NutritionMetric; label: string; unit: string },
  decimals: number,
) {
  const hasMetricData = (point.knownNutrientDayCount[metric.id] || 0) > 0;
  if (point.isComplete) {
    const exclusions = [
      point.excludedDayCount
        ? `${point.excludedDayCount} excluded ${point.excludedDayCount === 1 ? 'day' : 'days'}`
        : '',
      point.notIncludedDayCount
        ? `${point.notIncludedDayCount} logged ${point.notIncludedDayCount === 1 ? 'day' : 'days'} awaiting inclusion`
        : '',
    ].filter(Boolean);
    return hasMetricData
      ? `${format(value, decimals)} ${metric.unit}${exclusions.length ? ` (${exclusions.join('; ')} not included)` : ''}`
      : `${metric.label} not entered`;
  }
  if (point.isExcluded) return `${metric.label} excluded from trends`;
  if (point.entryCount) return 'Logged day not included in trends';
  return 'No food log';
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 py-3">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className={`mt-1.5 break-words tabular-nums ${value === '—' ? 'text-base font-bold text-muted-foreground' : 'text-xl font-bold sm:text-2xl'}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function TrendDataList({
  label,
  items,
}: {
  label: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <ul className="sr-only" aria-label={label}>
      {items.map(item => <li key={item.label}>{item.label}: {item.value}</li>)}
    </ul>
  );
}

export function HealthTrendsPanel({
  foodEntries,
  sleepEntries,
  activityEntries,
  workoutSessions = [],
  workoutExercises = [],
  weightEntries = [],
  bodyMeasurementEntries = [],
  waterEntries = [],
  targetWeightKg,
  targetWaterMl,
  weightUnit = 'kg',
  heightUnit = 'cm',
  includedFoodLogDates,
  excludedFoodLogDates = [],
  maintenanceCalories,
  initialTab,
}: {
  foodEntries: FoodEntry[];
  sleepEntries: SleepEntry[];
  activityEntries: ActivityEntry[];
  workoutSessions?: WorkoutSession[];
  workoutExercises?: WorkoutExerciseDefinition[];
  weightEntries?: WeightEntry[];
  bodyMeasurementEntries?: BodyMeasurementEntry[];
  waterEntries?: WaterEntry[];
  targetWeightKg?: number;
  targetWaterMl?: number;
  weightUnit?: WeightUnit;
  heightUnit?: HeightUnit;
  includedFoodLogDates: string[];
  excludedFoodLogDates?: string[];
  maintenanceCalories?: number;
  initialTab?: TrendTab;
}) {
  const [tab, setTab] = useState<TrendTab>('nutrition');
  const [range, setRange] = useState<Range>('week');
  const [nutritionMetric, setNutritionMetric] = useState<NutritionMetric>('calories');
  const trendPanelRef = useRef<HTMLDivElement>(null);
  const previousTrendTabRef = useRef(tab);
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  useEffect(() => {
    if (previousTrendTabRef.current === tab) return;
    previousTrendTabRef.current = tab;
    const panel = trendPanelRef.current;
    if (!panel) return;
    panel.classList.remove('caizen-tab-panel-motion');
    void panel.offsetWidth;
    panel.classList.add('caizen-tab-panel-motion');
  }, [tab]);
  const buckets = useMemo(() => getHealthChartBuckets(range), [range]);
  const dates = useMemo(() => buckets.map(bucket => bucket.start), [buckets]);
  const isDailyRange = range === 'week';
  const rangeConfig = HEALTH_CHART_RANGES.find(item => item.id === range) || HEALTH_CHART_RANGES[0];
  const bucketAdjective = rangeConfig.bucketUnit === 'day' ? 'Daily' : rangeConfig.bucketUnit === 'week' ? 'Weekly' : 'Monthly';
  const nutrition = useMemo(() => isDailyRange
    ? deriveNutritionTrend(foodEntries, includedFoodLogDates, dates, excludedFoodLogDates)
    : deriveNutritionTrendForBuckets(foodEntries, includedFoodLogDates, buckets, excludedFoodLogDates), [buckets, dates, excludedFoodLogDates, foodEntries, includedFoodLogDates, isDailyRange]);
  const workout = useMemo(() => isDailyRange
    ? deriveWorkoutTrend(activityEntries, dates, workoutSessions)
    : deriveWorkoutTrendForBuckets(activityEntries, buckets, workoutSessions), [activityEntries, buckets, dates, isDailyRange, workoutSessions]);
  const sleep = useMemo(() => isDailyRange
    ? deriveSleepTrend(sleepEntries, dates)
    : deriveSleepTrendForBuckets(sleepEntries, buckets), [buckets, dates, isDailyRange, sleepEntries]);
  const includedNutrition = nutrition.filter(point => point.isComplete);
  const rangeStart = buckets[0]?.start;
  const rangeEnd = buckets[buckets.length - 1]?.end;
  const weightsInRange = useMemo(() => weightEntries.filter(entry =>
    (!rangeStart || entry.date >= rangeStart) && (!rangeEnd || entry.date <= rangeEnd),
  ), [rangeEnd, rangeStart, weightEntries]);
  const weight = useMemo(() => rangeStart && rangeEnd
    ? deriveWeightTrend(weightsInRange, [rangeStart, rangeEnd])
    : { latest: null, average: null, change: null, count: 0, points: [] }, [rangeEnd, rangeStart, weightsInRange]);
  const bodyEntriesInRange = useMemo(() => bodyMeasurementEntries
    .filter(entry => (!rangeStart || entry.date >= rangeStart) && (!rangeEnd || entry.date <= rangeEnd))
    .sort((a, b) => b.date.getTime() - a.date.getTime()), [bodyMeasurementEntries, rangeEnd, rangeStart]);
  const waterTotalsByDay = useMemo(() => {
    const daily = new Map<string, number>();
    waterEntries.forEach(entry => {
      if ((!rangeStart || entry.date < rangeStart) || (!rangeEnd || entry.date > rangeEnd)) return;
      const key = toLocalDateKey(entry.date);
      daily.set(key, (daily.get(key) || 0) + entry.amountMl);
    });
    return daily;
  }, [rangeEnd, rangeStart, waterEntries]);
  const waterLoggedDays = waterTotalsByDay.size;
  const waterAverage = waterLoggedDays
    ? [...waterTotalsByDay.values()].reduce((sum, amount) => sum + amount, 0) / waterLoggedDays
    : null;
  const waterTargetDays = targetWaterMl
    ? [...waterTotalsByDay.values()].filter(amount => amount >= targetWaterMl).length
    : 0;
  const exerciseLoadModes = useMemo(() => new Map(workoutExercises.flatMap(exercise => {
    const mode = exercise.loadMode ?? inferWorkoutLoadMode(exercise.equipment, exercise.name);
    return mode ? [[exercise.id, mode] as const] : [];
  })), [workoutExercises]);
  const exerciseRecords = useMemo(() => {
    const ids = new Map<string, string>();
    workoutSessions.forEach(session => session.exercises.forEach(set => {
      if (set.exerciseId && set.exerciseName) ids.set(set.exerciseId, set.exerciseName);
    }));
    return [...ids.entries()]
      .map(([id, name]) => ({ id, name, performance: deriveExercisePerformance(id, workoutSessions, exerciseId => exerciseLoadModes.get(exerciseId)) }))
      .filter(item => item.performance.history.length)
      .sort((a, b) => {
        const latestDate = (item: typeof a) => new Date(item.performance.history[0]?.session.completedAt || item.performance.history[0]?.session.startedAt || 0).getTime();
        return latestDate(b) - latestDate(a);
      })
      .slice(0, 6);
  }, [exerciseLoadModes, workoutSessions]);
  const knownNutrientDayCount = (metric: NutritionMetric) => nutrition.reduce(
    (sum, point) => sum + (point.isComplete ? point.knownNutrientDayCount[metric] || 0 : 0),
    0,
  );
  const averageNutrient = (metric: NutritionMetric) => {
    const knownDays = knownNutrientDayCount(metric);
    return knownDays
      ? nutrition.reduce((sum, point) => sum + (point.isComplete && (point.knownNutrientDayCount[metric] || 0) > 0 ? Number(point[metric] || 0) * (point.knownNutrientDayCount[metric] || 0) : 0), 0) / knownDays
      : null;
  };
  const averageCalories = averageNutrient('calories');
  const averageProtein = averageNutrient('protein');
  const averageCarbs = averageNutrient('carbs');
  const averageFat = averageNutrient('fat');
  const averageFiber = averageNutrient('fiber');
  const averageSodium = averageNutrient('sodium');
  const averageSugar = averageNutrient('sugar');
  const sugarDayCount = knownNutrientDayCount('sugar');
  const selectedNutritionMetric = NUTRITION_METRICS.find(metric => metric.id === nutritionMetric) || NUTRITION_METRICS[0];
  const metricHasData = nutrition.some(point => point.isComplete && (point.knownNutrientDayCount[nutritionMetric] || 0) > 0);
  const nutritionEligibilityNotes = [
    nutrition.some(point => (point.incompleteDayCount || 0) > 0)
      ? 'Partial nutrition is counted only for nutrients that were entered.'
      : '',
    nutrition.some(point => (point.excludedDayCount || 0) > 0)
      ? 'Days you excluded remain outside averages.'
      : '',
    nutrition.some(point => (point.notIncludedDayCount || 0) > 0)
      ? 'Logged days stay outside averages until you mark them complete.'
      : '',
  ].filter(Boolean);
  const nutrientDayDetail = (metric: NutritionMetric) => {
    const count = knownNutrientDayCount(metric);
    return count ? `${count} day${count === 1 ? '' : 's'} with data` : 'No data in included days';
  };
  const tabLabels: Record<TrendTab, string> = { nutrition: 'Nutrition', workout: 'Training', body: 'Body', sleep: 'Sleep' };
  const trendTabs = Object.keys(tabLabels) as TrendTab[];
  const handleTrendTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? trendTabs.length - 1
        : event.key === 'ArrowRight'
          ? (index + 1) % trendTabs.length
          : (index - 1 + trendTabs.length) % trendTabs.length;
    const nextTab = trendTabs[nextIndex];
    setTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`health-trend-tab-${nextTab}`)?.focus({ preventScroll: true }));
  };

  return (
    <section className="section-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-section-title">Progress</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nutrition, training, body, and sleep trends from your own logs.</p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex max-w-full gap-1 overflow-x-auto" role="tablist" aria-label="Health trend category">
            {trendTabs.map((item, index) => (
              <button key={item} type="button" role="tab" id={`health-trend-tab-${item}`} aria-selected={tab === item} aria-controls={`health-trend-panel-${item}`} tabIndex={tab === item ? 0 : -1} onKeyDown={event => handleTrendTabKeyDown(event, index)} onClick={() => setTab(item)} className={`caizen-tab min-h-11 shrink-0 rounded-lg px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 ${tab === item ? 'caizen-tab-active text-foreground' : 'text-muted-foreground'}`}>
                {tabLabels[item]}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-border/60 bg-background/40 p-1" role="group" aria-label="Trend range">
            {HEALTH_CHART_RANGES.map(({ id, label, windowLabel }) => (
              <button key={id} type="button" aria-pressed={range === id} aria-label={`${label} (${windowLabel})`} onClick={() => setRange(id)} className={`min-h-11 min-w-0 flex-1 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 ${range === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={trendPanelRef} id={`health-trend-panel-${tab}`} role="tabpanel" aria-labelledby={`health-trend-tab-${tab}`} tabIndex={0} data-state="active" className="caizen-tab-panel-motion min-w-0 rounded-xl outline-none">
      {tab === 'nutrition' && (
        <div key={`${tab}-${range}`} className="caizen-health-trends-view mt-5 space-y-5">
          <HealthDetails title="Nutrition averages">
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Average calories" value={averageCalories === null ? '—' : `${format(averageCalories)} kcal`} detail={nutrientDayDetail('calories')} />
            <Metric label="Average protein" value={averageProtein === null ? '—' : `${format(averageProtein, 1)}g`} detail={nutrientDayDetail('protein')} />
            <Metric label="Average carbs" value={averageCarbs === null ? '—' : `${format(averageCarbs, 1)}g`} detail={nutrientDayDetail('carbs')} />
            <Metric label="Average fat" value={averageFat === null ? '—' : `${format(averageFat, 1)}g`} detail={nutrientDayDetail('fat')} />
            <Metric label="Average fiber" value={averageFiber === null ? '—' : `${format(averageFiber, 1)}g`} detail={nutrientDayDetail('fiber')} />
            <Metric label="Average sodium" value={averageSodium === null ? '—' : `${format(averageSodium, 1)} mg`} detail={nutrientDayDetail('sodium')} />
            <Metric label="Average sugar" value={averageSugar === null ? '—' : `${format(averageSugar, 1)}g`} detail={sugarDayCount ? `${sugarDayCount} days with sugar data` : 'No sugar data'} />
          </div>
          </HealthDetails>
          {maintenanceCalories && averageCalories !== null ? <p className="text-sm text-muted-foreground">Average intake is {format(Math.abs(maintenanceCalories - averageCalories))} kcal {averageCalories <= maintenanceCalories ? 'below' : 'above'} the maintenance estimate.</p> : null}
          <div className="grid gap-x-4 gap-y-2 border-y border-border/50 py-2 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Average water on logged days" value={waterAverage === null ? '—' : `${format(waterAverage)} ml`} detail={`${waterLoggedDays} logged ${waterLoggedDays === 1 ? 'day' : 'days'} in this range`} />
            {targetWaterMl ? <Metric label="Water target reached" value={`${waterTargetDays} ${waterTargetDays === 1 ? 'day' : 'days'}`} detail={`Target ${format(targetWaterMl)} ml`} /> : <Metric label="Water target" value="Not set" detail="Set a personal target in Health Today" />}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-card-title">Nutrition by {selectedNutritionMetric.label.toLowerCase()}</p>
              <p className="mt-1 text-xs text-muted-foreground">Included days only · {isDailyRange ? 'daily totals' : `daily average per ${rangeConfig.bucketUnit}`} in {selectedNutritionMetric.unit}</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <span>Chart metric</span>
              <Select value={nutritionMetric} onValueChange={value => setNutritionMetric(value as NutritionMetric)}>
                <SelectTrigger className="h-10 min-w-32" aria-label="Nutrition chart metric"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NUTRITION_METRICS.map(metric => <SelectItem key={metric.id} value={metric.id} disabled={!knownNutrientDayCount(metric.id)}>{metric.label}{!knownNutrientDayCount(metric.id) ? ' (no data)' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>
          {!metricHasData ? <p className="rounded-xl border border-dashed border-border/60 bg-muted/15 p-6 text-center text-sm text-muted-foreground">No {selectedNutritionMetric.label.toLowerCase()} data in the included days.</p> : <HealthBarChart
            colorClass={selectedNutritionMetric.color}
            chartLabel={`${selectedNutritionMetric.label} nutrition chart`}
            points={nutrition.map(point => {
              const value = Number(point[nutritionMetric] || 0);
              const hasMetricData = point.isComplete && (point.knownNutrientDayCount[nutritionMetric] || 0) > 0;
              return {
                label: point.label,
                value,
                hasData: hasMetricData,
                title: `${point.label}: ${nutritionPointStatus(point, value, selectedNutritionMetric, nutritionMetric === 'sodium' ? 0 : 1)}`,
              };
            })}
          />}
          {nutritionEligibilityNotes.length ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-muted/35 px-3 py-2.5 text-xs text-muted-foreground" role="note" aria-label="Nutrition trend eligibility">
              {nutritionEligibilityNotes.map(note => <span key={note}>{note}</span>)}
            </div>
          ) : null}
           {metricHasData ? <TrendDataList label={`${selectedNutritionMetric.label} values`} items={nutrition.map(point => ({ label: point.label, value: nutritionPointStatus(point, Number(point[nutritionMetric] || 0), selectedNutritionMetric, nutritionMetric === 'sodium' ? 0 : 1) }))} /> : null}
        </div>
      )}

      {tab === 'workout' && (
        <div key={`${tab}-${range}`} className="caizen-health-trends-view mt-5 space-y-5">
          <div className={`grid gap-x-4 gap-y-2 border-y border-border/50 py-2 sm:grid-cols-2 ${workout.caloriesBurned === null ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
            <Metric label="Sessions" value={String(workout.sessions)} />
            <Metric label="Active minutes" value={workout.activeMinutes ? `${workout.activeMinutes} min` : '—'} detail={workout.activeMinutes ? 'Recorded duration only' : 'No duration recorded'} />
            <Metric label="Average session" value={workout.averageSessionMinutes === null ? '—' : `${format(workout.averageSessionMinutes, 1)} min`} detail="Sessions with duration" />
            {workout.caloriesBurned !== null ? <Metric label="Exercise calories" value={`${format(workout.caloriesBurned)} kcal`} detail="Logged calories only" /> : null}
          </div>
          {!workout.sessions ? (
            <p className="rounded-xl border border-dashed border-border/60 bg-muted/15 p-6 text-center text-sm text-muted-foreground">No workout activity logged in this period.</p>
          ) : !workout.activeMinutes ? (
            <>
              <p className="rounded-xl border border-dashed border-border/60 bg-muted/15 p-6 text-center text-sm text-muted-foreground">Workout activity is logged, but no active duration is recorded in this period.</p>
              <HealthBarChart
                colorClass="bg-cyan-500/70"
                chartLabel={`${bucketAdjective} active minutes chart`}
                points={workout.points.map(point => ({
                  label: point.label,
                  value: point.activeMinutes,
                  hasData: point.sessions > 0,
                  title: point.sessions > 0
                    ? `${point.label}: ${point.activeMinutes} active minutes`
                    : `${point.label}: No workout logged`,
                }))}
              />
              <TrendDataList label={`${bucketAdjective} active minutes values`} items={workout.points.map(point => ({ label: point.label, value: point.sessions > 0 ? `${point.activeMinutes} active minutes` : 'No workout logged' }))} />
            </>
          ) : (
            <>
              <HealthBarChart
                colorClass="bg-cyan-500/70"
                chartLabel={`${bucketAdjective} active minutes chart`}
                points={workout.points.map(point => ({
                  label: point.label,
                  value: point.activeMinutes,
                  hasData: point.sessions > 0,
                  title: point.sessions > 0
                    ? `${point.label}: ${point.activeMinutes} active minutes`
                    : `${point.label}: No workout logged`,
                }))}
              />
              <TrendDataList label={`${bucketAdjective} active minutes values`} items={workout.points.map(point => ({ label: point.label, value: point.sessions > 0 ? `${point.activeMinutes} active minutes` : 'No workout logged' }))} />
            </>
          )}
          {exerciseRecords.length ? <section className="space-y-3" aria-label="Exercise performance highlights">
            <div><h3 className="text-sm font-black">Exercise performance</h3><p className="mt-1 text-xs text-muted-foreground">Derived from completed working sets. Load uses your entered scale.</p></div>
            <ul className="divide-y divide-border/50 border-y border-border/50">
              {exerciseRecords.map(({ id, name, performance }) => <li key={id} className="py-3">
                <strong className="text-sm">{name}</strong>
                <p className="mt-1 text-xs text-muted-foreground">{[
                  performance.highestLoad ? `${exerciseLoadModes.get(id) === 'bodyweight-plus' ? 'Highest added load' : 'Highest load'} ${format(performance.highestLoad.value)}` : '',
                  performance.lowestAssistance ? `Least assistance ${format(performance.lowestAssistance.value)}` : '',
                  performance.highestRepsAtLoad ? `${performance.highestRepsAtLoad.reps} reps at ${exerciseLoadModes.get(id) === 'assistance' ? 'assistance ' : exerciseLoadModes.get(id) === 'bodyweight-plus' ? 'added load ' : ''}${format(performance.highestRepsAtLoad.value)}` : '',
                  performance.estimatedOneRepMax ? `Est. 1RM ${format(performance.estimatedOneRepMax.value, 1)}` : '',
                  performance.longestTimedSet ? `Longest ${format(performance.longestTimedSet.value)} sec` : '',
                ].filter(Boolean).join(' · ') || 'Completed working sets recorded.'}</p>
                {performance.progression ? <p className="mt-1 text-xs font-semibold text-primary">{performance.progression}</p> : null}
              </li>)}
            </ul>
          </section> : null}
        </div>
      )}

      {tab === 'body' && (
        <div key={`${tab}-${range}`} className="caizen-health-trends-view mt-5 space-y-5">
          <div className="grid gap-x-4 gap-y-2 border-y border-border/50 py-2 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Latest weight" value={weight.latest === null ? '—' : `${formatMeasurementNumber(kgToWeight(weight.latest, weightUnit), 1)} ${weightUnit}`} detail={`${weight.count} weigh-ins in range`} />
            <Metric label="Average weight" value={weight.average === null ? '—' : `${formatMeasurementNumber(kgToWeight(weight.average, weightUnit), 1)} ${weightUnit}`} />
            <Metric label="Change in range" value={weight.change === null ? '—' : `${weight.change > 0 ? '+' : ''}${formatMeasurementNumber(kgToWeight(weight.change, weightUnit), 1)} ${weightUnit}`} />
            <Metric label="Target weight" value={targetWeightKg ? `${formatMeasurementNumber(kgToWeight(targetWeightKg, weightUnit), 1)} ${weightUnit}` : 'Not set'} />
            {weight.latest !== null && targetWeightKg ? <Metric label="Distance to target" value={`${formatMeasurementNumber(Math.abs(kgToWeight(targetWeightKg - weight.latest, weightUnit)), 1)} ${weightUnit}`} detail={Math.abs(targetWeightKg - weight.latest) < 0.05 ? 'Target reached' : undefined} /> : null}
          </div>
          {!weight.points.length ? <p className="rounded-xl border border-dashed border-border/60 bg-muted/15 p-6 text-center text-sm text-muted-foreground">No weight check-ins in this range.</p> : <div className="border-t border-border/50 pt-4"><h3 className="text-sm font-black">Weight check-ins</h3><ul className="mt-2 divide-y divide-border/50">{weight.points.map((point, index) => <li key={`${point.date.toISOString()}-${index}`} className="flex min-h-10 items-center justify-between gap-3 py-2 text-sm"><span className="text-muted-foreground">{point.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span><strong className="tabular-nums">{formatMeasurementNumber(kgToWeight(point.value, weightUnit), 1)} {weightUnit}</strong></li>)}</ul></div>}
          <section className="border-t border-border/50 pt-4">
            <h3 className="text-sm font-black">Optional measurements</h3>
            {!bodyEntriesInRange.length ? <p className="mt-2 text-xs text-muted-foreground">No optional body measurements in this range. Add any measurements you choose under Body.</p> : <ul className="mt-2 divide-y divide-border/50">{bodyEntriesInRange.slice(0, 8).map(entry => {
              const measures = [
                ['Waist', entry.waistCm], ['Chest', entry.chestCm], ['Hips', entry.hipsCm],
                ['Upper arm', entry.upperArmCm], ['Thigh', entry.thighCm],
              ].filter((item): item is [string, number] => item[1] !== undefined).map(([label, value]) => `${label} ${format(heightUnit === 'cm' ? value : cmToInches(value), 1)} ${heightUnit === 'cm' ? 'cm' : 'in'}`);
              if (entry.bodyFatPercent !== undefined) measures.push(`Body fat ${format(entry.bodyFatPercent, 1)}%`);
              return <li key={entry.id} className="py-2 text-xs"><strong>{entry.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong><span className="ml-2 text-muted-foreground">{measures.join(' · ')}</span></li>;
            })}</ul>}
          </section>
        </div>
      )}

      {tab === 'sleep' && (
        <div key={`${tab}-${range}`} className="caizen-health-trends-view mt-5 space-y-5">
          <div className="grid gap-x-4 gap-y-2 border-y border-border/50 py-2 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Average sleep" value={sleep.averageMinutes ? formatSleepDuration(sleep.averageMinutes) : '—'} detail={`${sleep.count} logged ${sleep.count === 1 ? 'night' : 'nights'}`} />
            <Metric label="Personal sleep score" value={sleep.scoreAverage === null ? '—' : `${format(sleep.scoreAverage, 1)}/100`} detail="From nights with a score entered" />
            <Metric label="Night wakings" value={sleep.awakeningsAverage === null ? '—' : format(sleep.awakeningsAverage, 1)} detail="From nights with a count entered" />
            <Metric label="Rested quality" value={formatSleepQuality(sleep.quality) || '—'} />
          </div>
          {!sleep.points.some(point => point.hasData) ? <p className="rounded-xl border border-dashed border-border/60 bg-muted/15 p-6 text-center text-sm text-muted-foreground">No sleep logs in this range yet.</p> : <HealthBarChart
            colorClass="bg-indigo-500/70"
            chartLabel="Sleep duration chart"
            points={sleep.points.map(point => ({
              label: point.label,
              value: point.minutes,
              hasData: point.hasData,
              title: `${point.label}: ${point.hasData ? formatSleepDuration(point.minutes) : 'No log'}`,
            }))}
          />}
          {sleep.points.some(point => point.hasData) ? <TrendDataList label="Sleep duration values" items={sleep.points.map(point => ({ label: point.label, value: point.hasData ? formatSleepDuration(point.minutes) : 'No log' }))} /> : null}
        </div>
      )}
      </div>
    </section>
  );
}
