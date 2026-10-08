import { describe, expect, it } from 'vitest';

import { normalizeHealth } from '@/lib/health/normalization';
import {
  applyHealthEvidenceToProfile,
  getTodaysTrustedMealEvidence,
  getTrustedExplicitMealType,
  hasCompleteMealEvidenceToday,
  isQualifyingSleepEvidence,
} from '@/lib/health/lifehub-completion';
import { getRoutineOccurrence } from '@/lib/lifehub/routine-schedule';
import { prepareImport } from '@/lib/storage/import-integrity';
import type { DailyChecklistItem, FoodEntry, Profile, SleepEntry } from '@/lib/types';

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

function routine(
  id: string,
  evidence: DailyChecklistItem['healthRoutineEvidence'],
  overrides: Partial<DailyChecklistItem> = {},
): DailyChecklistItem {
  return {
    id,
    title: id,
    frequency: 'daily',
    active: true,
    createdAt: today,
    completionHistory: [],
    healthRoutineEvidence: evidence,
    ...overrides,
  } as DailyChecklistItem;
}

function food(
  id: string,
  mealType: FoodEntry['mealType'],
  date = today,
  mealTypeSource: FoodEntry['mealTypeSource'] | null = 'explicit',
): FoodEntry {
  return {
    id,
    date,
    mealType,
    ...(mealTypeSource ? { mealTypeSource } : {}),
    name: id,
    calories: 1,
    protein: 1,
    carbs: 1,
    fat: 1,
    sodium: 1,
    createdAt: today,
  };
}

function sleep(
  id: string,
  date = today,
  sleepDurationMinutes = 480,
): SleepEntry {
  return {
    id,
    date,
    hours: sleepDurationMinutes / 60,
    sleepDurationMinutes,
    createdAt: today,
  };
}

function profile(
  routines: DailyChecklistItem[],
  health: Partial<Profile['health']> = {},
): Profile {
  return {
    id: 'profile-health-evidence',
    name: 'Health evidence',
    dailyChecklistItems: routines,
    productivityItems: [{
      id: 'task-1',
      type: 'task',
      title: 'Stay pending',
      status: 'pending',
      createdAt: today,
    }],
    health: normalizeHealth({
      foodEntries: [],
      sleepEntries: [],
      ...health,
    }),
  } as Profile;
}

describe('Phase 6B Health evidence predicates', () => {
  it('requires an explicit positive SleepEntry on today local date', () => {
    expect(isQualifyingSleepEvidence(sleep('today'), today)).toBe(true);
    expect(isQualifyingSleepEvidence(sleep('zero', today, 0), today)).toBe(false);
    expect(isQualifyingSleepEvidence(sleep('yesterday', yesterday), today)).toBe(false);
    expect(isQualifyingSleepEvidence(sleep('tomorrow', tomorrow), today)).toBe(false);
  });

  it('requires trusted explicit meal classification and ignores legacy fallback', () => {
    expect(getTrustedExplicitMealType(food('breakfast', 'breakfast'))).toBe('breakfast');
    expect(getTrustedExplicitMealType(food('legacy', 'breakfast', today, null))).toBeUndefined();
    expect(getTrustedExplicitMealType(food('snack', 'snack'))).toBe('snack');
    expect(getTodaysTrustedMealEvidence([
      food('breakfast', 'breakfast'),
      food('lunch', 'lunch'),
      food('yesterday-dinner', 'dinner', yesterday),
      food('snack', 'snack'),
    ], today)).toEqual(new Set(['breakfast', 'lunch']));
  });

  it('requires all three trusted meals for meals-complete', () => {
    expect(hasCompleteMealEvidenceToday([
      food('breakfast', 'breakfast'),
      food('lunch', 'lunch'),
    ], today)).toBe(false);
    expect(hasCompleteMealEvidenceToday([
      food('breakfast', 'breakfast'),
      food('lunch', 'lunch'),
      food('dinner', 'dinner'),
    ], today)).toBe(true);
    expect(hasCompleteMealEvidenceToday([
      food('legacy-breakfast', 'breakfast', today, null),
      food('lunch', 'lunch'),
      food('dinner', 'dinner'),
    ], today)).toBe(false);
  });
});

describe('Phase 6B Health evidence completion', () => {
  it('completes multiple eligible sleep routines once and never completes the Task', () => {
    const initial = profile([
      routine('sleep-a', { mode: 'sleep-tracked' }),
      routine('sleep-b', { mode: 'sleep-tracked' }),
      routine('workout', { mode: 'workout-completed', scope: 'any' }),
      routine('stretch', { mode: 'stretch-completed', scope: 'any' }),
    ], { sleepEntries: [sleep('saved')] });

    const first = applyHealthEvidenceToProfile(initial, {
      kind: 'sleep',
      entry: sleep('saved'),
    }, now);
    expect(first.completedRoutineIds).toEqual(['sleep-a', 'sleep-b']);
    expect(first.profile.productivityItems?.[0].status).toBe('pending');
    expect(first.completedRoutineIds).not.toContain('workout');
    expect(first.completedRoutineIds).not.toContain('stretch');
    expect(getRoutineOccurrence(first.profile.dailyChecklistItems[0], now)?.status).toBe('done');
    expect(first.profile.dailyChecklistItems[0].completionHistory).toHaveLength(1);

    const second = applyHealthEvidenceToProfile(first.profile, {
      kind: 'sleep',
      entry: sleep('saved'),
    }, now);
    expect(second.completedRoutineIds).toEqual([]);
    expect(second.profile.dailyChecklistItems[0].completionHistory).toHaveLength(1);
  });

  it('does not complete sleep routines for invalid, backdated, future, skipped, inactive, or not-due entries', () => {
    const skipped = routine('skipped', { mode: 'sleep-tracked' }, {
      completionHistory: [{ date: now.toISOString().slice(0, 10), status: 'skipped' }],
    });
    const inactive = routine('inactive', { mode: 'sleep-tracked' }, { active: false });
    const notDue = routine('not-due', { mode: 'sleep-tracked' }, {
      frequency: 'specific_weekday',
      weekday: 'monday',
    });
    const initial = profile([skipped, inactive, notDue]);

    for (const entry of [sleep('zero', today, 0), sleep('yesterday', yesterday), sleep('tomorrow', tomorrow)]) {
      const result = applyHealthEvidenceToProfile(initial, {
        kind: 'sleep',
        entry,
      }, now);
      expect(result.completedRoutineIds).toEqual([]);
    }
  });

  it('matches only the saved meal and completes meals-complete when the third meal makes 3/3', () => {
    const initial = profile([
      routine('breakfast-routine', { mode: 'meal-tracked', meal: 'breakfast' }),
      routine('lunch-routine', { mode: 'meal-tracked', meal: 'lunch' }),
      routine('dinner-routine', { mode: 'meal-tracked', meal: 'dinner' }),
      routine('meals-routine', { mode: 'meals-complete' }),
    ], { foodEntries: [food('breakfast', 'breakfast')] });

    const breakfast = applyHealthEvidenceToProfile(initial, {
      kind: 'food',
      entry: food('breakfast', 'breakfast'),
    }, now);
    expect(breakfast.completedRoutineIds).toEqual(['breakfast-routine']);

    const withLunch = {
      ...breakfast.profile,
      health: normalizeHealth({
        ...breakfast.profile.health,
        foodEntries: [...breakfast.profile.health.foodEntries, food('lunch', 'lunch')],
      }),
    };
    const lunch = applyHealthEvidenceToProfile(withLunch, {
      kind: 'food',
      entry: food('lunch', 'lunch'),
    }, now);
    expect(lunch.completedRoutineIds).toEqual(['lunch-routine']);

    const withDinner = {
      ...lunch.profile,
      health: normalizeHealth({
        ...lunch.profile.health,
        foodEntries: [...lunch.profile.health.foodEntries, food('dinner', 'dinner')],
      }),
    };
    const dinner = applyHealthEvidenceToProfile(withDinner, {
      kind: 'food',
      entry: food('dinner', 'dinner'),
    }, now);
    expect(dinner.completedRoutineIds).toEqual(['dinner-routine', 'meals-routine']);

    const repeated = applyHealthEvidenceToProfile(dinner.profile, {
      kind: 'food',
      entry: food('dinner-again', 'dinner'),
    }, now);
    expect(repeated.completedRoutineIds).toEqual([]);
    expect(dinner.profile.dailyChecklistItems.find(item => item.id === 'meals-routine')?.completionHistory)
      .toHaveLength(1);
  });

  it('does not let a legacy normalized breakfast satisfy combined meals', () => {
    const initial = profile([
      routine('meals-routine', { mode: 'meals-complete' }),
    ], {
      foodEntries: [
        food('legacy-breakfast', 'breakfast', today, null),
        food('lunch', 'lunch'),
      ],
    });
    const result = applyHealthEvidenceToProfile({
      ...initial,
      health: normalizeHealth({
        ...initial.health,
        foodEntries: [...initial.health.foodEntries, food('dinner', 'dinner')],
      }),
    }, {
      kind: 'food',
      entry: food('dinner', 'dinner'),
    }, now);
    expect(result.completedRoutineIds).toEqual([]);
  });

  it('keeps explicit meal metadata through normalization and import without making legacy records explicit', () => {
    const normalized = normalizeHealth({
      foodEntries: [
        { id: 'legacy', date: today, mealType: 'breakfast' },
        { id: 'explicit', date: today, mealType: 'breakfast', mealTypeSource: 'explicit' },
      ],
    } as any);
    expect(normalized.foodEntries[0].mealTypeSource).toBeUndefined();
    expect(normalized.foodEntries[1].mealTypeSource).toBe('explicit');

    const imported = prepareImport({
      format: 'caizen-data',
      version: 3,
      data: {
        currentProfileId: 'import-health',
        profiles: [{
          id: 'import-health',
          name: 'Imported Health',
          health: {
            foodEntries: [
              { id: 'legacy', date: '2026-08-27', mealType: 'breakfast' },
              { id: 'explicit', date: '2026-08-27', mealType: 'lunch', mealTypeSource: 'explicit' },
            ],
          },
        }],
      },
    });
    expect(imported.report.canImport).toBe(true);
    expect((imported.state.profiles[0] as any).health.foodEntries).toMatchObject([
      { id: 'legacy' },
      { id: 'explicit', mealTypeSource: 'explicit' },
    ]);
    expect((imported.state.profiles[0] as any).health.foodEntries[0].mealTypeSource).toBeUndefined();
  });
});
