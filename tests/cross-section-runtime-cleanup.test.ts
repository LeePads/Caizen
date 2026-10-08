import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizeHealth } from '@/lib/health/normalization';
import { validateWorkoutExerciseDefinition } from '@/lib/health/guided-workout-validation';
import { getSourceCapabilityText } from '@/lib/music-player';
import { getRecentFoodEntries, preserveFoodEntryMealType, readFoodEntryMealType } from '@/lib/health/food-entry';
import { findMatchingFoodTemplate } from '@/lib/health/food-template';
import { getSkincareUsageBucketsForEvents, getSkincareUsageOverallSummary } from '@/lib/skincare/usage';
import type { FoodEntry, MusicItem, SkincareProduct, SkincareUsageEvent } from '@/lib/types';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('cross-section runtime cleanup contracts', () => {
  it('reopens every supported meal type and preserves it through an untouched edit save', () => {
    const supportedTypes = [
      ['breakfast', 'Breakfast'],
      ['lunch', 'Lunch'],
      ['dinner', 'Dinner'],
      ['snack', 'Snack'],
    ] as const;

    supportedTypes.forEach(([canonical, legacyValue]) => {
      const normalized = normalizeHealth({
        foodEntries: [{
          id: `meal-${canonical}`,
          name: `${canonical} meal`,
          mealType: legacyValue as unknown as 'breakfast' | 'lunch' | 'dinner' | 'snack',
          date: new Date('2026-09-01T12:00:00.000Z'),
          calories: 500,
          protein: 20,
          carbs: 60,
          fat: 15,
          sodium: 300,
          createdAt: new Date('2026-09-01T12:00:00.000Z'),
        }],
      });
      const persistedMeal = normalized.foodEntries[0];
      const editValue = readFoodEntryMealType(persistedMeal.mealType);
      const savedEdit = {
        ...persistedMeal,
        ...preserveFoodEntryMealType(persistedMeal, { name: `${canonical} meal updated` }),
      };

      expect(editValue).toBe(canonical);
      expect(savedEdit.mealType).toBe(canonical);
      expect(readFoodEntryMealType(savedEdit.mealType)).toBe(canonical);
    });

    const legacy = normalizeHealth({
      foodEntries: [{
        id: 'meal-legacy',
        name: 'Legacy meal',
        date: new Date('2026-09-01T12:00:00.000Z'),
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        sodium: 0,
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
      }],
    }).foodEntries[0];
    expect(legacy.mealType).toBeUndefined();
    expect(preserveFoodEntryMealType(legacy, { name: 'Legacy meal edited' })).not.toHaveProperty('mealType');
  });

  it.each([
    ['current explicit lowercase', 'lunch', 'explicit', 'lunch'],
    ['legacy explicit casing and whitespace', '  DINNER ', 'explicit', 'dinner'],
    ['legacy casing without source', 'Lunch', undefined, 'lunch'],
    ['current casing without source', 'dinner', undefined, 'dinner'],
  ])('traces %s through normalization, modal state, submit, and persistence', (_label, rawMealType, mealTypeSource, expected) => {
    const normalized = normalizeHealth({
      foodEntries: [{
        id: `meal-${expected}`,
        name: 'Persisted meal',
        date: new Date('2026-09-01T12:00:00.000Z'),
        mealType: rawMealType as unknown as FoodEntry['mealType'],
        ...(mealTypeSource ? { mealTypeSource: mealTypeSource as 'explicit' } : {}),
        calories: 500,
        protein: 20,
        carbs: 60,
        fat: 15,
        sodium: 300,
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
      }],
    });
    const persistedEntry = normalized.foodEntries[0];
    const editValue = readFoodEntryMealType(persistedEntry.mealType) || 'breakfast';
    const submitted = preserveFoodEntryMealType(persistedEntry, { mealType: editValue });
    const saved = normalizeHealth({ foodEntries: [{ ...persistedEntry, ...submitted }] }).foodEntries[0];

    expect(persistedEntry.mealType).toBe(expected);
    expect(editValue).toBe(expected);
    expect(submitted.mealType).toBe(expected);
    expect(saved.mealType).toBe(expected);
  });

  it('canonicalizes a raw legacy edit even when the persisted source marker is absent', () => {
    const legacy = {
      id: 'raw-legacy-meal',
      name: 'Raw legacy meal',
      mealType: '  Lunch ',
    } as unknown as FoodEntry;

    expect(preserveFoodEntryMealType(legacy, { name: 'Edited legacy meal' })).toEqual({
      name: 'Edited legacy meal',
      mealType: 'lunch',
    });
  });

  it('keeps meal editing truthful and allows a deduplicated saved-food update', () => {
    const modal = read('components/modals/FoodModal.tsx');
    const healthSection = read('components/sections/HealthSection.tsx');

    expect(modal).toContain('mealType: readFoodEntryMealType(foodEntry.mealType)');
    expect(modal).toContain("useState<MealType | ''>(() => readFoodEntryMealType(foodEntry?.mealType) || fallbackMealType)");
    expect(healthSection).toContain('key={selectedFoodEntry ? `food-entry-${selectedFoodEntry.id}`');
    expect(modal).toContain('preserveFoodEntryMealType(foodEntry');
    expect(modal).toContain('Repeat a recent meal');
    expect(modal).toContain('recentFoodEntries');
    expect(modal).toContain('applyRecentFood');
    expect(modal).not.toContain('Blank nutrition fields are saved as');
    expect(modal).toContain('max-w-4xl');
    expect(modal).toContain('lg:grid-cols-[1.05fr_0.95fr]');
    expect(modal).toContain('Create or update a saved food from this meal.');
    expect(modal).toContain('if (existing) updateFoodTemplate(existing.id, payload)');
    expect(modal).toContain('saveAsSavedFood(servingValue)');
  });

  it('updates a matching saved food without adding a duplicate during meal editing', () => {
    const templates = [{
      id: 'food-template-1',
      name: 'Chicken Breast',
      referenceWeightGrams: 100,
      caloriesPerGram: 1.2,
      proteinPerGram: 0.2,
      carbsPerGram: 0,
      fatPerGram: 0.03,
      sodiumPerGram: 0.5,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }];

    expect(findMatchingFoodTemplate(templates, ' chicken breast ')?.id).toBe('food-template-1');
    expect(findMatchingFoodTemplate(templates, 'New food')).toBeUndefined();
  });

  it('reuses the newest recent meals without duplicate name cards', () => {
    const recent = getRecentFoodEntries([
      { id: 'old-rice', name: 'Rice bowl', createdAt: new Date('2026-08-01'), date: new Date('2026-08-01') },
      { id: 'new-rice', name: ' Rice Bowl ', createdAt: new Date('2026-09-01'), date: new Date('2026-09-01') },
      { id: 'fruit', name: 'Fruit', createdAt: new Date('2026-08-15'), date: new Date('2026-08-15') },
    ] as FoodEntry[]);

    expect(recent.map(entry => entry.id)).toEqual(['new-rice', 'fruit']);
  });

  it('preserves the reusable workout side cue while retaining existing rest transitions', () => {
    const normalized = normalizeHealth({
      activityEntries: [],
      foodEntries: [],
      foodTemplates: [],
      noXTrackers: [],
      workoutExercises: [{
        id: 'side-cue',
        name: 'Side cue',
        kind: 'exercise',
        category: 'Legs',
        equipment: 'None',
        difficulty: 'easy',
        targetMode: 'reps',
        sideMode: 'left-right',
        source: 'custom',
      }],
    });

    expect(normalized.workoutExercises?.[0].sideMode).toBe('left-right');
    expect(validateWorkoutExerciseDefinition({ name: 'Side cue', sideMode: 'invalid' as never }).sideMode).toBeTruthy();

    const runner = read('components/health/WorkoutRunner.tsx');
    const workspace = read('components/health/WorkoutWorkspace.tsx');
    expect(runner).toContain('Side order: left to right');
    expect(runner).toContain('Complete the left side, then switch to the right.');
    expect(workspace).toContain('Exercise side order');
    expect(read('lib/health/workout-runner.ts')).toContain("phase: 'REST'");
  });

  it('keeps Spotify playback paused until the provider confirms it and exposes recovery', () => {
    const item: MusicItem = {
      id: 'spotify-contract',
      title: 'Spotify contract',
      provider: 'spotify',
      url: 'https://open.spotify.com/track/1234567890123456789012',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    expect(getSourceCapabilityText(item)).toContain('availability depends on Spotify');

    const player = read('lib/music-player.tsx');
    const fullPlayer = read('components/music/MusicFullPlayer.tsx');
    expect(player).toContain('Spotify could not start playback here. Open in Spotify to continue.');
    expect(player).toContain('canPlayPause: false');
    expect(player).toContain('armSpotifyPlaybackAttempt');
    expect(fullPlayer).toContain('onOpenSource');
    expect(fullPlayer).toContain('Resume in Spotify');
  });

  it('keeps Vault edit available in the overflow menu and separates deletion', () => {
    const vault = read('components/sections/PersonalVaultSection.tsx');
    expect(vault).toContain('onEdit={onEdit}');
    expect(vault).toContain('onSelect={onEdit}');
    expect(vault).toContain('<DropdownMenuSeparator />');
  });

  it('renders Skincare usage data only when there is history', () => {
    const skincare = read('components/skincare/SkincareUsageStats.tsx');
    expect(skincare).not.toContain('<Combobox');
    expect(skincare).toContain('All logged products, including retained history for deleted products.');
    expect(skincare).toContain('periodEvents.length > 0 ?');
    expect(skincare).toContain('No usage logged');
    expect(skincare).toContain('Most used');
    expect(skincare).toContain('chartWidthClass');
    expect(skincare).toContain('bucketLabel(bucket, range)');
  });

  it('aggregates Skincare usage by product for the selected period and handles empty periods', () => {
    const now = new Date('2026-09-01T12:00:00.000Z');
    const products = [{
      id: 'cleanser',
      name: 'Daily Cleanser',
      category: 'Face',
      purchasePrice: 10,
      frequency: 'Daily',
      schedule: 'morning',
      createdAt: now,
    }, {
      id: 'serum',
      name: 'Night Serum',
      category: 'Face',
      purchasePrice: 20,
      frequency: 'Daily',
      schedule: 'night',
      createdAt: now,
    }] satisfies SkincareProduct[];
    const event = (id: string, productId: string, usedAt: string, productNameSnapshot?: string): SkincareUsageEvent => ({
      id,
      productId,
      usedAt: new Date(usedAt),
      source: 'manual',
      productNameSnapshot,
      createdAt: now,
    });
    const events = [
      event('use-1', 'cleanser', '2026-09-01T08:00:00.000Z'),
      event('use-2', 'cleanser', '2026-08-31T08:00:00.000Z'),
      event('use-3', 'serum', '2026-09-01T09:00:00.000Z'),
      event('use-deleted', 'deleted', '2026-08-30T08:00:00.000Z', 'Retired Cream'),
    ];

    const summary = getSkincareUsageOverallSummary(events, products, 'daily', now);
    const weeklySummary = getSkincareUsageOverallSummary(events, products, 'weekly', now);
    const monthlySummary = getSkincareUsageOverallSummary(events, products, 'monthly', now);
    const dailyBuckets = getSkincareUsageBucketsForEvents(events, 'daily', now);
    const weeklyBuckets = getSkincareUsageBucketsForEvents(events, 'weekly', now);
    const monthlyBuckets = getSkincareUsageBucketsForEvents(events, 'monthly', now);
    const empty = getSkincareUsageOverallSummary([], products, 'daily', now);
    const emptyBuckets = getSkincareUsageBucketsForEvents([], 'daily', now);

    expect(summary.totalUses).toBe(4);
    expect(summary.mostUsedProduct).toMatchObject({ productId: 'cleanser', productName: 'Daily Cleanser', count: 2 });
    expect(summary.todayUses).toBe(2);
    expect(summary.weekUses).toBe(3);
    expect(summary.monthUses).toBe(2);
    expect(weeklySummary.totalUses).toBe(4);
    expect(monthlySummary.totalUses).toBe(4);
    expect(dailyBuckets.length).toBeGreaterThan(0);
    expect(weeklyBuckets.length).toBeGreaterThan(0);
    expect(monthlyBuckets.length).toBeGreaterThan(0);
    expect(dailyBuckets.length).toBeGreaterThan(weeklyBuckets.length);
    expect(weeklyBuckets.length).toBeGreaterThanOrEqual(monthlyBuckets.length);
    expect(empty.totalUses).toBe(0);
    expect(empty.mostUsedProduct).toBeUndefined();
    expect(emptyBuckets).toEqual([]);

    const tieEvents = [
      event('tie-cleanser', 'cleanser', '2026-09-01T08:00:00.000Z'),
      event('tie-serum', 'serum', '2026-09-01T09:00:00.000Z'),
    ];
    expect(getSkincareUsageOverallSummary(tieEvents, products, 'daily', now).mostUsedProduct?.productId).toBe('serum');
    expect(getSkincareUsageOverallSummary([events[3]], products, 'daily', now).mostUsedProduct).toMatchObject({
      productId: 'deleted',
      productName: 'Retired Cream',
      count: 1,
    });
  });

  it('keeps Balance focus visible while removing the inherited gold focus color', () => {
    const css = read('app/globals.css');
    expect(css).toContain('.balance-view-tabs [data-slot=\'tabs-trigger\']:focus-visible');
    expect(css).toContain('outline-color: color-mix(in oklch, var(--primary) 78%, transparent)');
    expect(css).toContain('color-mix(in oklch, var(--background) 88%, transparent)');
    expect(css).toContain('saturate(0.3)');
  });
});
