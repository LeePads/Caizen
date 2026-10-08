import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { clampHealthDate, shiftHealthDate } from '@/lib/health/date-navigation';
import {
  CORE_NUTRITION_FIELDS,
  hasCompleteNutrition,
  isNutritionFieldMissing,
} from '@/lib/health/nutrition';
import type { FoodEntry } from '@/lib/types';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const completeFood = (overrides: Partial<FoodEntry> = {}): FoodEntry => ({
  id: 'food-1',
  name: 'Complete food',
  mealType: 'lunch',
  date: new Date('2026-09-02T12:00:00'),
  calories: 500,
  protein: 30,
  carbs: 45,
  fat: 18,
  sodium: 250,
  fiber: 5,
  createdAt: new Date('2026-09-02T12:00:00'),
  ...overrides,
});

describe('Health Today, Food Log, and Log Meal UX contracts', () => {
  it('bounds Health day navigation at the current local day', () => {
    expect(shiftHealthDate('2026-09-01', 1, '2026-09-02')).toBe('2026-09-02');
    expect(shiftHealthDate('2026-09-02', 1, '2026-09-02')).toBe('2026-09-02');
    expect(shiftHealthDate('2026-09-02', -1, '2026-09-02')).toBe('2026-09-01');
    expect(clampHealthDate('2026-09-03', '2026-09-02')).toBe('2026-09-02');
    expect(clampHealthDate('2026-09-01', '2026-09-02')).toBe('2026-09-01');
  });

  it('keeps the existing six-field completion rule and treats sugar as optional', () => {
    expect(CORE_NUTRITION_FIELDS).toEqual(['calories', 'protein', 'carbs', 'fat', 'sodium', 'fiber']);
    expect(hasCompleteNutrition(completeFood())).toBe(true);
    expect(hasCompleteNutrition(completeFood({ nutritionMissing: ['fiber'] }))).toBe(false);
    expect(hasCompleteNutrition(completeFood({ nutritionMissing: ['sugar'] }))).toBe(true);
    expect(isNutritionFieldMissing(completeFood({ nutritionMissing: ['fiber'] }), 'fiber')).toBe(true);
  });

  it('keeps Today expanded and gives both Today and Food Log the shared day navigator', () => {
    const overview = read('components/health/HealthOverviewPanel.tsx');
    const health = read('components/sections/HealthSection.tsx');
    const navigator = read('components/health/HealthDayNavigator.tsx');

    expect(overview).toContain('<HealthDayNavigator');
    expect(overview).not.toContain('showDashboard');
    expect(overview).not.toContain('onToggleDashboard');
    expect(health).toContain('selectedDate={foodLogDate}');
    expect(health).toContain('onPreviousDay={() => shiftFoodLogDate(-1)}');
    expect(health).toContain('onNextDay={() => shiftFoodLogDate(1)}');
    expect(navigator).toContain('disabled={isToday}');
    expect(navigator).toContain('onClick={onToday}');
    expect(navigator).toContain('max={today}');
  });

  it('uses day-completion copy and exposes missing-nutrition recovery', () => {
    const overview = read('components/health/HealthOverviewPanel.tsx');
    const health = read('components/sections/HealthSection.tsx');

    for (const forbidden of ['Include in trends', 'Included in trends', 'Complete nutrition to include', 'include this day in trends']) {
      expect(health).not.toContain(forbidden);
      expect(overview).not.toContain(forbidden);
    }
    // Day-completion controls were retired; meal review remains accessible.
    expect(health).toContain('android-food-entry-actions');
    expect(health).toContain('android-food-action-row');
    expect(health).toContain('const markFoodLogComplete');
    expect(health).not.toContain('toggleFoodLogComplete');
    expect(health).not.toContain('Mark day complete');
    expect(health).toContain('todayFoodEntries');
    expect(overview).toContain('Day complete. Nutrition is included in your health history.');
  });

  it('makes recent food selection reversible without discarding later manual edits', () => {
    const modal = read('components/modals/FoodModal.tsx');

    expect(modal).toContain('recentFoodSelectionRef');
    expect(modal).toContain('current[field] === applied[field]');
    expect(modal).toContain('applyFoodFormState(restored as FoodFormState)');
    expect(modal).toContain('repeatSource?.id === entry.id ? deselectRecentFood(entry) : applyRecentFood(entry)');
    expect(modal).toContain('aria-pressed={repeatSource?.id === entry.id}');
    expect(modal).toContain('aria-label={repeatSource?.id === entry.id ? `Deselect ${entry.name}` : `Repeat ${entry.name}`}');
    expect(modal).toContain('<TooltipContent>{entry.name}</TooltipContent>');
  });

  it('supports repeated entry, an accessible saved-food checkbox, and a compact two-column modal', () => {
    const modal = read('components/modals/FoodModal.tsx');

    expect(modal).toContain('onClick={() => saveFood(true)}');
    expect(modal).toContain('if (keepOpen)');
    expect(modal).toContain('mealType: mealType || \'breakfast\'');
    expect(modal).toContain('date,');
    expect(modal).toContain('setMealType(values.mealType);');
    expect(modal).toContain('<Checkbox');
    expect(modal).not.toContain('type="checkbox"');
    expect(modal).toContain('lg:divide-x lg:divide-y-0');
    expect(modal).toContain('max-w-4xl');
    expect(modal).not.toContain('border-primary/20');
    expect(modal).toContain('placeholder="Enter amount"');
    expect(modal).toContain('guardHealthNumberChange');
    expect(modal).toContain('placeholder="Optional"');
    expect(modal).toContain('Add &amp; add another');
    expect(modal).toContain(": 'Add'}");
  });
});
