import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeHealth } from '@/lib/health/normalization';
import { toLocalDateKey } from '@/lib/date-utils';
import { buildLifeHubCalendarEvents } from '@/lib/lifehub/calendar-events';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Health targeted remediation', () => {
  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'keeps date-only Health history on the same local calendar day in %s',
    timezone => {
      const previousTimezone = process.env.TZ;
      process.env.TZ = timezone;
      try {
        const normalized = normalizeHealth({
          weightEntries: [{ id: 'weight-1', date: '2028-02-29', weightKg: 70 }],
          nutritionEntries: [{ id: 'nutrition-1', date: '2028-02-29', calories: 1 }],
          foodEntries: [{ id: 'food-1', date: '2028-02-29', name: 'Boundary meal', calories: 1 }],
          activityEntries: [{ id: 'activity-1', date: '2028-02-29', activity: 'Walk', caloriesBurned: 1 }],
          sleepEntries: [{ id: 'sleep-1', date: '2028-02-29', hours: 8 }],
          noXTrackers: [{ id: 'nox-1', name: 'No X', startDate: '2028-02-29' }],
          foodLogCompletedDates: ['2028-02-29'],
          foodLogExcludedDates: ['2028-02-29'],
        } as any);

        expect(toLocalDateKey(normalized.weightEntries[0].date)).toBe('2028-02-29');
        expect(toLocalDateKey(normalized.nutritionEntries[0].date)).toBe('2028-02-29');
        expect(toLocalDateKey(normalized.foodEntries[0].date)).toBe('2028-02-29');
        expect(toLocalDateKey(normalized.activityEntries[0].date)).toBe('2028-02-29');
        expect(toLocalDateKey(normalized.sleepEntries![0].date)).toBe('2028-02-29');
        expect(normalized.sleepEntries![0].sleepDurationMinutes).toBe(480);
        expect(toLocalDateKey(normalized.noXTrackers[0].startDate)).toBe('2028-02-29');
        expect(normalized.foodLogCompletedDates).toEqual(['2028-02-29']);
        expect(normalized.foodLogExcludedDates).toEqual(['2028-02-29']);
      } finally {
        if (previousTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = previousTimezone;
      }
    },
  );

  it('normalizes malformed collections and numeric values without invalid derived inputs', () => {
    const normalized = normalizeHealth({
      weightEntries: [null, { date: '2026-01-31', weightKg: -70 }],
      nutritionEntries: {},
      foodEntries: [
        null,
        {
          date: '2026-01-31',
          name: 'Malformed meal',
          calories: Number.POSITIVE_INFINITY,
          protein: Number.NaN,
          carbs: -1,
          fat: '2.5',
          sodium: 'not-a-number',
          fiber: 0.25,
        },
      ],
      foodTemplates: [{ name: 'Legacy food', referenceWeightGrams: Number.POSITIVE_INFINITY }],
      mealTemplates: [{ name: 'Legacy meal', rows: {} }],
      activityEntries: [{ activity: 'Legacy movement', caloriesBurned: Number.POSITIVE_INFINITY, durationMinutes: -5 }],
      workoutPlans: [{ name: 'Legacy plan', exercises: [{ name: 'Lift', sets: Number.POSITIVE_INFINITY }] }],
      sleepEntries: [{ date: '2026-01-31', hours: Number.POSITIVE_INFINITY }],
      noXTrackers: [{ name: 'Legacy tracker', startDate: '2026-01-31', accumulatedPausedDays: Number.NaN }],
      targetCalories: Number.POSITIVE_INFINITY,
    } as any);

    expect(normalized.weightEntries).toHaveLength(1);
    expect(normalized.weightEntries[0].weightKg).toBe(0);
    expect(normalized.nutritionEntries).toEqual([]);
    expect(normalized.foodEntries[0]).toMatchObject({
      name: 'Malformed meal',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 2.5,
      sodium: 0,
      fiber: 0.25,
    });
    expect(normalized.activityEntries[0].caloriesBurned).toBe(0);
    expect(normalized.activityEntries[0].durationMinutes).toBeUndefined();
    expect(normalized.sleepEntries![0].hours).toBe(0);
    expect(normalized.sleepEntries![0].sleepDurationMinutes).toBe(0);
    expect(normalized.targetCalories).toBeUndefined();
    expect(normalized.mealTemplates?.[0].rows).toEqual([]);
    expect(normalized.foodTemplates[0].referenceWeightGrams).toBe(0);
    expect(normalized.workoutPlans![0].exercises[0].sets).toBeUndefined();
    expect(normalized.noXTrackers[0].accumulatedPausedDays).toBe(0);

    for (const value of [
      normalized.weightEntries[0].weightKg,
      normalized.foodEntries[0].calories,
      normalized.foodEntries[0].fat,
      normalized.activityEntries[0].caloriesBurned,
      normalized.sleepEntries![0].hours,
      normalized.noXTrackers[0].accumulatedPausedDays,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('normalizes optional sleep and exercise targets without creating defaults', () => {
    const normalized = normalizeHealth({
      sleepTargetMinutes: '480',
      targetExerciseMinutesPerWeek: '150',
    } as any);

    expect(normalized.sleepTargetMinutes).toBe(480);
    expect(normalized.targetExerciseMinutesPerWeek).toBe(150);
    expect(normalizeHealth({ sleepTargetMinutes: 0, targetExerciseMinutesPerWeek: 2.5 } as any))
      .toMatchObject({ sleepTargetMinutes: undefined, targetExerciseMinutesPerWeek: undefined });
    expect(normalizeHealth(normalized)).toEqual(normalized);
  });

  it('is idempotent after one safe normalization pass', () => {
    const once = normalizeHealth({
      weightEntries: [{ id: 'weight-1', date: '2026-12-31', weightKg: 70.25 }],
      foodEntries: [{ id: 'food-1', date: '2026-12-31', name: 'Meal', calories: 350.5 }],
    } as any);

    expect(normalizeHealth(once)).toEqual(once);
  });

  it('preserves legacy milestone visibility while honoring an explicit per-streak opt-out', () => {
    const normalized = normalizeHealth({
      noXTrackers: [
        { id: 'legacy', name: 'Legacy', startDate: '2026-08-01' },
        { id: 'hidden', name: 'Hidden', startDate: '2026-08-01', showMilestonesInCalendar: false },
        { id: 'malformed', name: 'Malformed', startDate: '2026-08-01', showMilestonesInCalendar: 'false' },
      ],
    } as any);

    expect(normalized.noXTrackers.map(item => item.showMilestonesInCalendar)).toEqual([true, false, true]);
    const events = buildLifeHubCalendarEvents({
      rangeStart: new Date(2026, 7, 8, 12),
      rangeEnd: new Date(2026, 7, 8, 12),
      filters: { health: true },
      health: normalized,
    });
    expect(events.filter(event => event.type === 'streak milestone 7').map(event => event.recordId)).toEqual(['legacy', 'malformed']);
  });

  it('keeps the remediation contracts at the write, request, and accessibility boundaries', () => {
    const context = read('lib/context.tsx');
    const health = read('components/sections/HealthSection.tsx').replace(/\r\n/g, '\n');
    const overview = read('components/health/HealthOverviewPanel.tsx');
    const library = read('components/health/HealthLibraryList.tsx');
    const trends = read('components/health/HealthTrendsPanel.tsx');
    const supplements = read('components/sections/SupplementsSection.tsx');
    const page = read('app/app/page.tsx');

    expect(context).toContain('normalizeHealth(updates.health)');
    expect(context).toContain('parseLocalDateValue(entry.date)');
    expect(health).toContain('onRequestedViewConsumed');
    expect(health).toContain('consumedRequestSignalRef');
    expect(health).toContain('role="tablist"');
    expect(health).toContain('role="tab"');
    expect(health).toContain('aria-label={`Delete weight entry from ${formatDate(entry.date)}`}');
    expect(overview).toContain('7-day review');
    expect(overview).toContain('Rested quality');
    expect(overview).toContain('Sleep target');
    expect(overview).toContain('Exercise target');
    expect(overview).not.toContain("Today’s nutrition details");
    expect(health).toContain('const savedFoodValue = (field: NutritionField, value: string | number, suffix = \'\')');
    expect(health).toContain('isNutritionFieldMissing(food, field)');
    expect(health).toContain('const sugarSummary = food.sugarPerGram === undefined');
    expect(health).toContain('role="progressbar"');
    expect(health).toContain('weeklySleepScoreAverage');
    expect(health).toContain('targetExerciseMinutesPerWeek');
    expect(library).toContain('primaryLabel');
    expect(health).toContain('<HealthLibraryList');
    expect(trends).toContain('Nutrition');
    expect(trends).toContain('Workout');
    expect(trends).toContain('Sleep');
    expect(trends).not.toContain("'weight'");
    expect(trends).toContain('No workout activity logged in this period.');
    expect(health).toContain('restrictHealthTabToRow');
    expect(health).toContain('createPortal(\n          <DragOverlay');
    expect(health).toContain('DropdownMenuContent');
    expect(health).not.toContain('absolute right-0 top-10');
    expect(supplements).toContain('Open product link for');
    expect(supplements).toContain('{s.image && (');
    expect(page).toContain('consumeHealthFeatureRequest');
  });
});
