import { AlertTriangle, ArrowRight, ChevronDown, Dumbbell, Moon, Scale, Target, Utensils } from 'lucide-react';
import { HealthDayNavigator } from '@/components/health/HealthDayNavigator';
import healthResponsive from './health-responsive.module.css';
import { formatSleepDuration, formatSleepQuality } from '@/lib/health/sleep';
import type { SleepQuality } from '@/lib/types';

type OverviewCard = {
  label: string;
  value: string;
  caption: string;
  cardClass: string;
};

export type HealthDashboardTone = 'positive' | 'caution' | 'negative' | 'neutral';

export type HealthDashboardSummaryItem = {
  label: string;
  value: string;
  detail?: string;
  tone?: HealthDashboardTone;
};

type SummaryItem = HealthDashboardSummaryItem;

type HealthOverviewPanelProps = {
  selectedDate: string;
  selectedDateLabel: string;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onDateChange: (value: string) => void;
  onOpenTargets: () => void;
  todaySummaryStatus: string;
  hasCompletedFoodLog: boolean;
  hasTodayFoodLog: boolean;
  todaySummaryItems: SummaryItem[];
  overviewCards: OverviewCard[];
  weeklyHighSodiumDays: number;
  weeklyNutritionGrade: string;
  weeklyCompletedTrendDays: number;
  weeklySleepVisible: boolean;
  weeklySleepGrade: string;
  weeklySleepEntries: number;
  weeklySleepAverageMinutes: number;
  weeklySleepScoreAverage: number | null;
  weeklySleepScoreEntries: number;
  weeklyTimesAwakenedAverage: number | null;
  weeklyTimesAwakenedEntries: number;
  sleepTargetMinutes: number | null;
  sleepTargetProgress: number;
  weeklySleepQualityTrend: Array<{ label: string; quality: SleepQuality | null }>;
  weeklyWorkoutVisible: boolean;
  weeklyMovementGrade: string;
  weeklyMovementMinutes: number;
  targetExerciseMinutesPerWeek: number | null;
  exerciseTargetProgress: number;
  weeklyWeightVisible: boolean;
  weeklyWeightGrade: string;
  weeklyWeightChangeLabel: string | null;
  latestWorkoutLabel: string | null;
  nextWorkoutLabel: string | null;
  activeFastingLabel: string | null;
  activeFastingStartedLabel: string | null;
  onOpenFasting: () => void;
  onOpenWorkout: () => void;
  onLogFood: () => void;
  onAddWeight: () => void;
  onLogWorkout: () => void;
  onLogSleep: () => void;
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

const summaryToneClass = (tone: SummaryItem['tone']) => tone === 'positive'
  ? 'text-emerald-700 dark:text-emerald-300'
  : tone === 'caution'
    ? 'text-amber-700 dark:text-amber-300'
    : tone === 'negative'
      ? 'text-red-700 dark:text-red-300'
      : 'text-foreground';

const reviewToneClass = (tone: SummaryItem['tone']) => summaryToneClass(tone);

const reviewMetricValueClass = (measured: boolean, tone: HealthDashboardTone) =>
  measured
    ? `mt-2 text-2xl font-black tabular-nums ${reviewToneClass(tone)}`
    : 'mt-2 text-base font-bold text-muted-foreground';

const summaryValueClass = (item: SummaryItem) =>
  item.value === 'Not entered' || item.value === 'Not available' || item.value === '—'
    ? 'text-base font-bold text-muted-foreground'
    : `text-xl font-black tabular-nums ${summaryToneClass(item.tone)}`;

export function HealthOverviewPanel({
  selectedDate,
  selectedDateLabel,
  onPreviousDay,
  onNextDay,
  onToday,
  onDateChange,
  onOpenTargets,
  todaySummaryStatus,
  hasCompletedFoodLog,
  hasTodayFoodLog,
  todaySummaryItems,
  overviewCards,
  weeklyHighSodiumDays,
  weeklyNutritionGrade,
  weeklyCompletedTrendDays,
  weeklySleepVisible,
  weeklySleepEntries,
  weeklySleepAverageMinutes,
  weeklySleepScoreAverage,
  weeklyTimesAwakenedAverage,
  sleepTargetMinutes,
  sleepTargetProgress,
  weeklySleepQualityTrend,
  weeklyWorkoutVisible,
  weeklyMovementGrade,
  weeklyMovementMinutes,
  targetExerciseMinutesPerWeek,
  exerciseTargetProgress,
  weeklyWeightVisible,
  weeklyWeightGrade,
  weeklyWeightChangeLabel,
  latestWorkoutLabel,
  nextWorkoutLabel,
  activeFastingLabel,
  activeFastingStartedLabel,
  onOpenFasting,
  onOpenWorkout,
  onLogFood,
  onAddWeight,
  onLogWorkout,
  onLogSleep,
}: HealthOverviewPanelProps) {
  const sleepReviewTone: HealthDashboardTone = weeklySleepQualityTrend.some(point => point.quality === 'poor')
    ? 'negative'
    : weeklySleepQualityTrend.some(point => point.quality === 'fair')
      ? 'caution'
      : weeklySleepAverageMinutes > 0
        ? 'positive'
        : 'neutral';

  return (
    <div className="space-y-5">
      <section className="section-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-section-title">Today</h2>
          <div className="flex w-full shrink-0 sm:w-auto">
            <button
              type="button"
              onClick={onOpenTargets}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border/70 bg-card px-5 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
            >
              <Target className="mr-2 h-4 w-4" />
              Health targets
            </button>
          </div>
        </div>

        <div className="mt-5 border-t border-border/50 pt-4">
          <HealthDayNavigator
            date={selectedDate}
            dateLabel={selectedDateLabel}
            onPrevious={onPreviousDay}
            onNext={onNextDay}
            onToday={onToday}
            onDateChange={onDateChange}
          />
        </div>

            <div className={`${healthResponsive.quickActions} mt-4 flex flex-wrap gap-2`}>
              <button type="button" onClick={onLogFood} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Utensils className="h-4 w-4" aria-hidden="true" /> Log food
              </button>
              <button type="button" onClick={onAddWeight} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/70 bg-card px-3.5 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Scale className="h-4 w-4" aria-hidden="true" /> Add weight
              </button>
              <button type="button" onClick={onLogWorkout} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/70 bg-card px-3.5 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Dumbbell className="h-4 w-4" aria-hidden="true" /> Log workout
              </button>
              <button type="button" onClick={onLogSleep} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/70 bg-card px-3.5 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Moon className="h-4 w-4" aria-hidden="true" /> Log sleep
              </button>
            </div>

        <div className="mt-6 space-y-6">
            <div className="border-y border-border/50 py-5 sm:py-6">
              <div>
                <h3 className="text-2xl font-black tracking-tight">{todaySummaryStatus}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasCompletedFoodLog
                    ? 'Day complete. Nutrition is included in your health history.'
                    : hasTodayFoodLog
                      ? 'Add nutrition details whenever you have them, then mark the day complete.'
                      : 'No food logged for this day.'}
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-5">
                {todaySummaryItems.map(item => (
                  <div key={item.label} className="border-t border-border/50 pt-3">
                    <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
                    <p className={`mt-2 ${summaryValueClass(item)}`}>{item.value}</p>
                    {item.detail ? <p className="mt-1 text-xs font-semibold text-muted-foreground">{item.detail}</p> : null}
                  </div>
                ))}
              </div>
            </div>

            <section aria-labelledby="health-overview-actions-heading" className="border-t border-border/50 pt-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 id="health-overview-actions-heading" className="text-section-title">Next actions</h3>
                </div>

              </div>

              <div className="mt-4 flex flex-col gap-4">
                <div className="flex flex-col gap-4 border-b border-border/50 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-1 shrink-0 text-muted-foreground">
                      <Dumbbell className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="mt-1 truncate text-lg font-black">{nextWorkoutLabel || 'Start a guided workout'}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">{nextWorkoutLabel ? 'Scheduled in Life Hub.' : latestWorkoutLabel ? `Latest: ${latestWorkoutLabel}` : 'Choose a starter routine and record what happens.'}</p>
                    </div>
                  </div>
                  <button type="button" onClick={onOpenWorkout} className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Open workouts <ArrowRight className="ml-2 h-4 w-4" />
                  </button>
                </div>

                {activeFastingLabel ? (
                  <button
                    type="button"
                    onClick={onOpenFasting}
                    className="-mx-2 flex w-[calc(100%+1rem)] flex-col gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-300">Fasting</span>
                      <span className="mt-1 block text-lg font-black">{activeFastingLabel} elapsed</span>
                      {activeFastingStartedLabel ? <span className="mt-1 block text-xs text-muted-foreground">Started {activeFastingStartedLabel} · Open Fasting</span> : null}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                  </button>
                ) : null}
              </div>
            </section>

            <details className="group border-t border-border/50 pt-5">
              <summary className="-mx-2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span>
                  <span className="block text-sm font-black">More today</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">Weight, sleep, activity, and nutrition at a glance.</span>
                </span>
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="mt-4 grid grid-cols-1 divide-y divide-border/50 border-y border-border/50 md:grid-cols-2 md:divide-y-0 xl:grid-cols-5 xl:divide-x xl:divide-y-0">
                {overviewCards.map(item => (
                  <div key={item.label} className="py-3 md:px-4 xl:first:pl-0 xl:last:pr-0">
                    <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
                    <h3 className={`mt-2 tabular-nums ${item.value === 'Not entered' || item.value === 'Not available' || item.value === '—' ? 'text-base font-bold text-muted-foreground' : 'text-2xl font-black'}`}>{item.value}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.caption}</p>
                  </div>
                ))}
              </div>
            </details>

            <details className="group border-t border-border/50 pt-5">
              <summary className="-mx-2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span>
                  <span className="block text-base font-black tracking-tight">7-day review</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Your week at a glance</span>
                </span>
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <section aria-labelledby="health-overview-review-heading" className="mt-5 space-y-6">
              <h3 id="health-overview-review-heading" className="sr-only">7-day health review details</h3>

              {/* Key signals */}
              <div className="border-b border-border/50 pb-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 sm:divide-x sm:divide-border/50">
                  <div className="sm:px-4 sm:first:pl-0 sm:last:pr-0">
                    <p className="text-sm font-semibold text-muted-foreground">Nutrition</p>
                    <p className={reviewMetricValueClass(weeklyCompletedTrendDays > 0, weeklyCompletedTrendDays >= 4 ? 'positive' : weeklyCompletedTrendDays ? 'caution' : 'neutral')}>{weeklyNutritionGrade}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{weeklyCompletedTrendDays > 0 ? `${weeklyCompletedTrendDays} ${weeklyCompletedTrendDays === 1 ? 'day' : 'days'} logged` : 'Log a food day to start tracking.'}</p>
                  </div>
                  {weeklySleepVisible ? (
                    <div className="sm:px-4 sm:first:pl-0 sm:last:pr-0">
                      <p className="text-sm font-semibold text-muted-foreground">Sleep</p>
                      <p className={reviewMetricValueClass(weeklySleepEntries > 0, sleepReviewTone)}>{weeklySleepEntries > 0 ? formatSleepDuration(weeklySleepAverageMinutes) : 'No sleep logged'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {weeklySleepEntries > 0
                          ? sleepTargetMinutes
                            ? `${sleepTargetProgress}% of target`
                            : `${weeklySleepEntries} ${weeklySleepEntries === 1 ? 'night' : 'nights'} logged`
                          : 'Start a sleep log.'}
                      </p>
                    </div>
                  ) : null}
                  {weeklyWorkoutVisible ? (
                    <div className="sm:px-4 sm:first:pl-0 sm:last:pr-0">
                      <p className="text-sm font-semibold text-muted-foreground">Activity</p>
                      <p className={reviewMetricValueClass(weeklyMovementMinutes > 0, targetExerciseMinutesPerWeek ? exerciseTargetProgress >= 100 ? 'positive' : weeklyMovementMinutes ? 'caution' : 'neutral' : weeklyMovementMinutes ? 'positive' : 'neutral')}>{weeklyMovementMinutes > 0 ? `${weeklyMovementMinutes} min` : 'No activity logged'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {weeklyMovementMinutes > 0
                          ? `${weeklyMovementGrade}${targetExerciseMinutesPerWeek ? ` · ${exerciseTargetProgress}% of ${targetExerciseMinutesPerWeek} min target` : ''}`
                          : targetExerciseMinutesPerWeek
                            ? `Exercise target: ${targetExerciseMinutesPerWeek} min this week.`
                            : 'Log a workout to start tracking.'}
                      </p>
                    </div>
                  ) : null}
                  {weeklyWeightVisible ? (
                    <div className="sm:px-4 sm:first:pl-0 sm:last:pr-0">
                      <p className="text-sm font-semibold text-muted-foreground">Weight</p>
                      <p className={reviewMetricValueClass(weeklyWeightChangeLabel !== null, 'positive')}>{weeklyWeightChangeLabel ?? 'Not enough data'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{weeklyWeightGrade}</p>
                    </div>
                  ) : null}
                </div>

                {weeklyHighSodiumDays > 1 ? (
                  <div className="mt-4 flex items-center gap-2 border-t border-amber-500/20 pt-3">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      <span className="font-bold">High sodium pattern</span> · high on {weeklyHighSodiumDays} of the last 7 days
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Sleep - primary analytical section */}
              {weeklySleepVisible ? (
                <div className="rounded-2xl border border-border/50 p-4 sm:p-5">
                  <h4 className="text-sm font-bold">Sleep</h4>

                  {sleepTargetMinutes && weeklySleepAverageMinutes ? (
                    <div className="mt-3">
                      <div className="flex items-end justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                          <span className="text-2xl font-black tabular-nums text-foreground">{formatSleepDuration(weeklySleepAverageMinutes)}</span> average
                        </p>
                        <p className="text-right text-sm text-muted-foreground">
                          <span className="font-bold tabular-nums text-foreground">{formatSleepDuration(sleepTargetMinutes)}</span> target
                        </p>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Sleep target progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={sleepTargetProgress} aria-valuetext={`${formatSleepDuration(weeklySleepAverageMinutes)} of ${formatSleepDuration(sleepTargetMinutes)}`}>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${sleepTargetProgress}%` }} />
                      </div>
                      <p className="mt-1 text-right text-xs text-muted-foreground">{sleepTargetProgress}% of target</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">{sleepTargetMinutes ? `Target ${formatSleepDuration(sleepTargetMinutes)} · log a sleep night to see progress.` : 'Set a target to compare your average sleep.'}</p>
                  )}

                  <div className="mt-5 border-t border-border/40 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">Rested quality</p>
                      <span className="text-xs text-muted-foreground">Last 7 days</span>
                    </div>
                    <div className="mt-3 grid grid-cols-7 gap-1.5">
                      {weeklySleepQualityTrend.map(point => {
                        const barClass = point.quality === 'poor'
                          ? 'bg-red-500/70'
                          : point.quality === 'fair'
                            ? 'bg-amber-500/70'
                            : point.quality === 'good'
                              ? 'bg-emerald-500/70'
                              : point.quality === 'great'
                                ? 'bg-emerald-500'
                                : 'bg-border';
                        const textClass = point.quality === 'poor'
                          ? 'text-red-700 dark:text-red-300'
                          : point.quality === 'fair'
                            ? 'text-amber-700 dark:text-amber-300'
                            : point.quality === 'good' || point.quality === 'great'
                              ? 'text-emerald-700 dark:text-emerald-300'
                              : 'text-muted-foreground';
                        return (
                          <div
                            key={point.label}
                            className="flex min-w-0 flex-col items-center gap-1.5 text-center"
                            aria-label={`${point.label}: ${point.quality ? formatSleepQuality(point.quality) : 'No sleep log'}`}
                          >
                            <p className="text-xs font-semibold text-muted-foreground">{point.label}</p>
                            <span className={`h-1.5 w-full rounded-full ${barClass}`} aria-hidden="true" />
                            <p className={`truncate text-xs font-semibold ${textClass}`} aria-hidden="true">{point.quality ? formatSleepQuality(point.quality) : '—'}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 border-t border-border/40 pt-4">
                    <p className="text-sm font-semibold">Sleep insights</p>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-lg font-black tabular-nums">{weeklySleepScoreAverage === null ? 'No score' : `${formatNumber(weeklySleepScoreAverage)}/100`}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Sleep score</p>
                      </div>
                      <div>
                        <p className="text-lg font-black tabular-nums">{weeklyTimesAwakenedAverage === null ? 'No data' : formatNumber(weeklyTimesAwakenedAverage)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Avg. night wakings</p>
                      </div>
                      <div>
                        <p className="text-lg font-black tabular-nums">{weeklySleepEntries > 0 ? formatSleepDuration(weeklySleepAverageMinutes) : '—'}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Average sleep</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{weeklySleepEntries > 0 ? `Based on ${weeklySleepEntries} logged ${weeklySleepEntries === 1 ? 'night' : 'nights'}` : 'No sleep nights logged this week.'}</p>
                  </div>
                </div>
              ) : null}
            </section>
            </details>
          </div>
      </section>
    </div>
  );
}
