import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { sumNutrition } from '@/lib/health/nutrition';
import { HEALTH_LIMITS, validateHealthText } from '@/lib/health/validation';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('Food modal submit regression', () => {
  const foodModal = read('components/modals/FoodModal.tsx');
  const healthSection = read('components/sections/HealthSection.tsx');
  const context = read('lib/context.tsx');
  const submit = foodModal.slice(
    foodModal.indexOf('const saveFood'),
    foodModal.indexOf('if (!isOpen) return null;'),
  );

  it('does not treat a valid new-food name as a validation error', () => {
    const errors: { name?: string } = {};
    const nameError = validateHealthText('Regression Eggs', {
      label: 'Food name',
      maxLength: 100,
      required: true,
    });

    if (nameError) errors.name = nameError;

    expect(errors).toEqual({});
    expect(foodModal).toContain("const nameError = validateHealthText(name");
    expect(foodModal).toContain('if (nameError) newErrors.name = nameError;');
  });

  it('keeps an invalid food name visible to the user', () => {
    expect(validateHealthText('', {
      label: 'Food name',
      maxLength: 100,
      required: true,
    })).toContain('required');
    expect(foodModal).toMatch(/<p[^>]*role="alert"/);
  });

  it('does not auto-enable saving a new food as a template', () => {
    const foodNameStart = foodModal.indexOf('<Field label="Food Name *"');
    const foodNameChangeStart = foodModal.indexOf('onChange={e =>', foodNameStart);
    const foodNameChange = foodModal.slice(foodNameChangeStart, foodModal.indexOf('className={`', foodNameChangeStart));

    expect(foodNameChange).toContain('setName(value);');
    expect(foodNameChange).not.toContain('setCreateAsTemplate(true)');
  });

  it('keeps the successful submit wired to one append using the selected date', () => {
    expect(submit.match(/addFoodEntry\(\{/g)).toHaveLength(1);
    expect(submit).toContain('if (!validateForm()) return;');
    expect(submit).toContain('date: date ? parseLocalDateInput(date) : new Date(),');
    expect(healthSection).toContain('defaultDate={foodLogDate}');
    expect(context).toContain('foodEntries: [...currentHealth.foodEntries, ...newEntries]');
  });

  it('keeps cancel side-effect free and edit as an update rather than an append', () => {
    expect(foodModal).toContain('onClick={attemptClose}');

    const editStart = submit.indexOf('if (isEditEntryMode && foodEntry)');
    const addStart = submit.indexOf('addFoodEntry({');
    expect(editStart).toBeGreaterThanOrEqual(0);
    expect(addStart).toBeGreaterThan(editStart);
    expect(submit.slice(editStart, addStart)).toContain('updateFoodEntry(foodEntry.id');
    expect(submit.slice(editStart, addStart)).toContain('finishClose();');
    expect(submit.slice(editStart, addStart)).toContain('return;');
  });

  it('retains nutrition totals for the values submitted by FoodModal', () => {
    expect(sumNutrition([
      { calories: 450, protein: 30, carbs: 20, fat: 15, sodium: 300, fiber: 4, sugar: 6 },
    ])).toEqual({
      calories: 450,
      protein: 30,
      carbs: 20,
      fat: 15,
      sodium: 300,
      fiber: 4,
      sugar: 6,
    });
    expect(HEALTH_LIMITS.foodCalories.max).toBeGreaterThan(450);
  });
});
