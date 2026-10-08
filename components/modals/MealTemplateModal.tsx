'use client';

import healthResponsive from '@/components/health/health-responsive.module.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Plus, Trash2, Utensils, X } from 'lucide-react';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { CreatableCombobox } from '@/components/ui/combobox';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { createEntityId } from '@/lib/utils';
import { ALL_NUTRITION_FIELDS, calculateMealRowNutrition, isNutritionFieldMissing, normalizeNutrition as normalizeFoodNutrition, sumNutrition } from '@/lib/health/nutrition';
import { guardHealthNumberChange, guardHealthTextChange, HEALTH_LIMITS, validateHealthNumber, validateHealthText } from '@/lib/health/validation';
import { AndroidBooleanControl, AndroidDismissibleBackdrop } from '@/components/native/android-design';

import type {
  FoodMeasurementUnit,
  FoodNutritionSnapshot,
  FoodTemplate,
  MealTemplate,
  MealTemplateFoodSnapshot,
  MealTemplateRow,
  MealType,
  NutritionField,
} from '@/lib/types';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type Props = {
  isOpen: boolean;
  foods: FoodTemplate[];
  initialTemplate?: MealTemplate | null;
  androidPresentation?: boolean;
  onClose: () => void;
  onSave: (template: Omit<MealTemplate, 'id' | 'createdAt'>, existingId?: string) => void;
  onSaveFood: (food: Omit<FoodTemplate, 'id' | 'createdAt'>) => void;
};

const UNITS: { value: FoodMeasurementUnit; label: string }[] = [
  { value: 'g', label: 'grams' },
  { value: 'quantity', label: 'quantity' },
  { value: 'tablespoon', label: 'tablespoon' },
  { value: 'teaspoon', label: 'teaspoon' },
  { value: 'ml', label: 'ml' },
  { value: 'serving', label: 'serving' },
  { value: 'can', label: 'can' },
];

function normalizeNutrition(value: Partial<FoodNutritionSnapshot>): FoodNutritionSnapshot {
  return normalizeFoodNutrition(value);
}

type CustomDraft = {
  name: string;
  amount: string;
  unit: FoodMeasurementUnit;
  conversionGrams: string;
  nutrition: Record<NutritionField, string>;
  saveToFoods: boolean;
};

function snapshotFromSavedFood(food: FoodTemplate): MealTemplateFoodSnapshot {
  const baseWeightGrams = Math.max(1, Number(food.referenceWeightGrams || 100));
  return {
    name: food.name,
    baseWeightGrams,
    nutrientsPerBaseWeight: {
      calories: food.caloriesPerGram * baseWeightGrams,
      protein: food.proteinPerGram * baseWeightGrams,
      carbs: food.carbsPerGram * baseWeightGrams,
      fat: food.fatPerGram * baseWeightGrams,
      sodium: food.sodiumPerGram * baseWeightGrams,
      fiber: (food.fiberPerGram ?? 0) * baseWeightGrams,
      sugar: food.sugarPerGram === undefined ? undefined : food.sugarPerGram * baseWeightGrams,
      nutritionMissing: food.nutritionMissing,
    },
    measurementOptions: [
      { unit: 'g', label: 'grams', grams: 1 },
      ...(food.measurementOptions || []).filter(option => option.unit !== 'g'),
    ],
  };
}

function rowNutrition(row: MealTemplateRow): FoodNutritionSnapshot {
  return calculateMealRowNutrition(row);
}

function compactNutritionSummary(values: FoodNutritionSnapshot): string {
  const part = (field: NutritionField, format: (value: number) => string) =>
    isNutritionFieldMissing(values, field) ? `${field} —` : format(values[field] ?? 0);
  return [
    part('calories', value => `${Math.round(value)} cal`),
    part('protein', value => `${value.toFixed(1)}g protein`),
    part('carbs', value => `${value.toFixed(1)}g carbs`),
    part('fat', value => `${value.toFixed(1)}g fat`),
    part('sodium', value => `${Math.round(value)}mg sodium`),
  ].join(' · ');
}

function NutritionGrid({ values }: { values: FoodNutritionSnapshot }) {
  const items: Array<{ label: string; field: NutritionField; value: string; suffix: string }> = [
    { label: 'Calories', field: 'calories', value: String(Math.round(values.calories)), suffix: '' },
    { label: 'Protein', field: 'protein', value: values.protein.toFixed(1), suffix: 'g' },
    { label: 'Carbs', field: 'carbs', value: values.carbs.toFixed(1), suffix: 'g' },
    { label: 'Fat', field: 'fat', value: values.fat.toFixed(1), suffix: 'g' },
    { label: 'Sodium', field: 'sodium', value: Math.round(values.sodium).toString(), suffix: 'mg' },
    { label: 'Fiber', field: 'fiber', value: values.fiber.toFixed(1), suffix: 'g' },
  ];
  if (values.sugar !== undefined || isNutritionFieldMissing(values, 'sugar')) {
    items.push({ label: 'Sugar', field: 'sugar', value: (values.sugar ?? 0).toFixed(1), suffix: 'g' });
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map(item => (
        <div key={item.label} className="rounded-xl border border-border/50 bg-background/50 p-2.5">
          <p className="text-xs font-bold uppercase text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-sm font-black">{isNutritionFieldMissing(values, item.field) ? 'Not entered' : `${item.value}${item.suffix}`}</p>
        </div>
      ))}
    </div>
  );
}

export default function MealTemplateModal({ isOpen, foods, initialTemplate, androidPresentation = false, onClose, onSave, onSaveFood }: Props) {
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [rows, setRows] = useState<MealTemplateRow[]>([]);
  const [custom, setCustom] = useState<CustomDraft | null>(null);
  const [error, setError] = useState('');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const initialDraft = useMemo(() => ({
    name: initialTemplate?.name || '',
    mealType: initialTemplate?.mealType || 'breakfast',
    rows: initialTemplate?.rows || [],
  }), [initialTemplate]);

  const hasUnsavedChanges =
    JSON.stringify({ name, mealType, rows }) !== JSON.stringify(initialDraft) ||
    custom !== null;

  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });
  const attemptClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return;
    }
    close();
  };

  const modalPanelRef = useRef<HTMLFormElement>(null);

  useOverlayLifecycle(isOpen, attemptClose, { lockScroll: false, autoFocus: false, containerRef: modalPanelRef });

  useEffect(() => {
    if (!isOpen) return;
    setName(initialTemplate?.name || '');
    setMealType(initialTemplate?.mealType || 'breakfast');
    setRows(initialTemplate?.rows?.map(row => ({
      ...row,
      food: row.food
        ? {
            ...row.food,
            nutrientsPerBaseWeight: { ...row.food.nutrientsPerBaseWeight },
            measurementOptions: [...row.food.measurementOptions],
          }
        : undefined,
    })) || []);
    setCustom(null); setError(''); setShowUnsavedDialog(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, initialTemplate]);

  useEffect(() => {
    if (!isOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || showUnsavedDialog) return;
      event.preventDefault();
      attemptClose();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [isOpen, showUnsavedDialog, hasUnsavedChanges]);

  const totals = useMemo(() => sumNutrition(rows.map(rowNutrition)), [rows]);

  const addSavedFood = (food: FoodTemplate) => {
    setRows(current => [...current, {
      id: createEntityId('meal-row'),
      foodId: food.id,
      food: snapshotFromSavedFood(food),
      amount: Math.max(1, Number(food.referenceWeightGrams || 100)),
      unit: 'g',
    }]);
    setError('');
  };

  const startCustomFood = (foodName: string) => setCustom({
    name: foodName.trim(), amount: '1', unit: 'serving', conversionGrams: '',
    nutrition: { calories: '', protein: '', carbs: '', fat: '', sodium: '', fiber: '', sugar: '' },
    saveToFoods: false,
  });

  const updateCustomText = (value: string) => {
    if (!custom) return;
    const result = guardHealthTextChange(custom.name, value, { label: 'Food name', maxLength: 100 });
    if (!result.accepted) {
      setError(result.error || 'Check the food name.');
      return;
    }
    setCustom({ ...custom, name: result.value });
    setError('');
  };

  const updateCustomNumber = (key: 'amount' | 'conversionGrams', value: string) => {
    if (!custom) return;
    const result = guardHealthNumberChange(custom[key], value, { label: key === 'amount' ? 'Amount' : 'Grams per unit', ...HEALTH_LIMITS.foodAmount, allowBlank: true });
    if (!result.accepted) {
      setError(result.error || 'Enter a valid amount.');
      return;
    }
    setCustom({ ...custom, [key]: result.value });
    setError('');
  };

  const updateCustomNutrition = (key: NutritionField, value: string) => {
    if (!custom) return;
    const options = key === 'sodium' ? HEALTH_LIMITS.sodium : key === 'calories' ? HEALTH_LIMITS.foodCalories : HEALTH_LIMITS.foodMacro;
    const result = guardHealthNumberChange(custom.nutrition[key], value, { label: key[0].toUpperCase() + key.slice(1), ...options, allowBlank: true });
    if (!result.accepted) {
      setError(result.error || 'Enter a valid nutrition value.');
      return;
    }
    setCustom({ ...custom, nutrition: { ...custom.nutrition, [key]: result.value } });
    setError('');
  };

  const addCustomFood = () => {
    if (!custom) return;
    const nameError = validateHealthText(custom.name, { label: 'Food name', maxLength: 100, required: true });
    if (nameError) return setError(nameError);
    const amountError = validateHealthNumber(custom.amount, { label: 'Amount', ...HEALTH_LIMITS.foodAmount });
    if (amountError) return setError(amountError);
    const amount = Number(custom.amount);
    if (custom.conversionGrams.trim()) {
      const conversionError = validateHealthNumber(custom.conversionGrams, { label: 'Grams per unit', ...HEALTH_LIMITS.foodAmount });
      if (conversionError) return setError(conversionError);
    }
    if (custom.saveToFoods && custom.unit !== 'g' && !custom.conversionGrams.trim()) {
      return setError('Add grams per unit before saving a non-gram food.');
    }
    const nutritionKeys = Object.keys(custom.nutrition) as NutritionField[];
    const nutritionOptions = new Set(['sodium']);
    for (const key of nutritionKeys) {
      const nutritionError = validateHealthNumber(custom.nutrition[key], {
        label: key[0].toUpperCase() + key.slice(1),
        ...(nutritionOptions.has(key) ? HEALTH_LIMITS.sodium : key === 'calories' ? HEALTH_LIMITS.foodCalories : HEALTH_LIMITS.foodMacro),
        allowBlank: true,
      });
      if (nutritionError) return setError(nutritionError);
    }
    const nutrition = normalizeNutrition(
      {
        ...Object.fromEntries(
          Object.entries(custom.nutrition).map(([key, value]) => [key, Number(value.trim() || 0)]),
        ),
        nutritionMissing: ALL_NUTRITION_FIELDS.filter(field => !custom.nutrition[field].trim()),
      } as Partial<FoodNutritionSnapshot>,
    );
    if (!custom.nutrition.calories.trim()) return setError('Calories are required for a custom food.');

    const conversion = custom.unit === 'g' ? 1 : Number(custom.conversionGrams || 0);
    const selectedGrams = conversion > 0 ? conversion * amount : 0;
    const baseWeightGrams = selectedGrams || Math.max(1, amount);
    const snapshot: MealTemplateFoodSnapshot = {
      name: custom.name.trim(),
      baseWeightGrams,
      nutrientsPerBaseWeight: nutrition,
      measurementOptions: [
        { unit: 'g', label: 'grams', grams: 1 },
        ...(custom.unit === 'g' ? [] : [{ unit: custom.unit, label: custom.unit, grams: conversion || undefined }]),
      ],
    };
    const row: MealTemplateRow = {
      id: createEntityId('meal-row'),
      food: snapshot,
      amount,
      unit: custom.unit,
      ...(!conversion ? { manualNutrition: nutrition, manualNutritionBaseAmount: amount } : {}),
    };
    setRows(current => [...current, row]);

    if (custom.saveToFoods && selectedGrams > 0) {
      onSaveFood({
        name: snapshot.name,
        referenceWeightGrams: selectedGrams,
        caloriesPerGram: nutrition.calories / selectedGrams,
        proteinPerGram: nutrition.protein / selectedGrams,
        carbsPerGram: nutrition.carbs / selectedGrams,
        fatPerGram: nutrition.fat / selectedGrams,
        sodiumPerGram: nutrition.sodium / selectedGrams,
        fiberPerGram: nutrition.fiber / selectedGrams,
        ...(nutrition.sugar === undefined || isNutritionFieldMissing(nutrition, 'sugar') ? {} : { sugarPerGram: nutrition.sugar / selectedGrams }),
        nutritionMissing: nutrition.nutritionMissing,
        measurementOptions: snapshot.measurementOptions,
      });
    }

    setCustom(null); setError('');
  };

  const handleFoodSelection = (value: string) => {
    setCustom(null);
    const savedFood = foods.find(food => food.id === value);
    if (savedFood) {
      addSavedFood(savedFood);
      return;
    }
    startCustomFood(value);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const submitErrors: string[] = [];
    const nameError = validateHealthText(name, { label: 'Template name', maxLength: 100, required: true });
    if (nameError) submitErrors.push(nameError);
    if (!rows.length) submitErrors.push('Add at least one food.');
    if (rows.some(row => Boolean(validateHealthNumber(String(row.amount), { label: 'Food amount', ...HEALTH_LIMITS.foodAmount })))) submitErrors.push('Every food amount must be between 0.01 and 100,000.');
    const hasUnsupportedUnit = rows.some(row =>
      row.unit !== 'g' &&
      !row.manualNutrition &&
      !row.food?.measurementOptions.some(option => option.unit === row.unit && option.grams)
    );
    if (hasUnsupportedUnit) {
      submitErrors.push('Choose grams or provide conversion/manual nutrition for every selected unit.');
    }
    if (submitErrors.length) {
      setError(submitErrors.join(' '));
      return;
    }
    onSave({ name: name.trim(), mealType, rows }, initialTemplate?.id);
    close();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
    <div
      className={`meal-template-modal-root fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-3 sm:p-5 ${androidPresentation ? 'android-meal-template-modal-root' : ''}`}
      data-caizen-overlay={isClosing ? 'closing' : 'open'}
      data-state={isClosing ? 'closed' : 'open'}
    >
      <AndroidDismissibleBackdrop
        onClose={attemptClose}
        ariaLabel="Close meal template builder"
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
      />
      <form ref={modalPanelRef} tabIndex={-1} noValidate onSubmit={submit} data-caizen-overlay-panel="true" className={`${healthResponsive.dialog} meal-template-modal-panel relative z-10 mx-auto flex h-auto max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl ${androidPresentation ? 'android-meal-template-modal-panel' : ''}`}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 p-3 sm:p-5">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Utensils className="h-5 w-5" /></div><div className="min-w-0"><h2 className="text-lg font-black sm:text-xl">{initialTemplate ? 'Edit meal template' : 'Add meal template'}</h2><p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">Combine foods once, then add the full meal in one tap.</p></div></div>
          <Tooltip><TooltipTrigger asChild><button type="button" onClick={attemptClose} aria-label="Close meal template builder" className="rounded-xl p-2 hover:bg-muted"><X className="h-5 w-5" /></button></TooltipTrigger><TooltipContent>{"Close"}</TooltipContent></Tooltip>
        </header>

        <div className="meal-template-modal-content grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[380px_minmax(0,1fr)] lg:overflow-hidden">
          <section className="meal-template-modal-source space-y-4 border-b border-border/50 p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r sm:p-5">
            <div><label className="mb-1.5 block text-sm font-bold" htmlFor="meal-template-name">Template Name</label><input id="meal-template-name" value={name} onChange={event => { const result = guardHealthTextChange(name, event.target.value, { label: 'Template name', maxLength: 100 }); if (!result.accepted) return setError(result.error || 'Check the template name.'); setName(result.value); setError(''); }} className="control-input" placeholder="Weekday breakfast" aria-invalid={Boolean(error)} aria-describedby="meal-template-error" /><div className="min-h-[20px] pt-0.5">{error ? <p id="meal-template-error" role="alert" className="text-xs font-semibold text-destructive">{error}</p> : null}</div></div>
            <div><label className="mb-1.5 block text-sm font-bold">Meal Type</label><select value={mealType} onChange={event => setMealType(event.target.value as typeof mealType)} className="control-input"><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option></select></div>
            <div>
              <label className="mb-1.5 block text-sm font-bold">Add Food</label>
              <CreatableCombobox
                value=""
                options={foods.map(food => ({ value: food.id, label: food.name }))}
                onChange={handleFoodSelection}
                placeholder="Type to search or create..."
                searchPlaceholder="Search saved foods..."
                ariaLabel="Add food to saved meal"
                createLabel={value => `Create “${value}”`}
                className="h-11 w-full"
              />
            </div>

            {custom && (
              <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <h3 className="font-black">New Custom Food</h3>
                <input value={custom.name} onChange={event => updateCustomText(event.target.value)} className="control-input" placeholder="Food name" />
                <div className="grid grid-cols-2 gap-2"><input type="text" inputMode="decimal" value={custom.amount} onChange={event => updateCustomNumber('amount', event.target.value)} onBlur={() => setError(validateHealthNumber(custom.amount, { label: 'Amount', ...HEALTH_LIMITS.foodAmount, allowBlank: true }) || '')} className="control-input health-number-input" placeholder="Enter amount" /><select value={custom.unit} onChange={event => setCustom({ ...custom, unit: event.target.value as FoodMeasurementUnit, conversionGrams: '' })} className="control-input">{UNITS.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></div>
                {custom.unit !== 'g' && <div><label className="mb-1 block text-xs font-bold">Grams per {custom.unit} (optional)</label><input type="text" inputMode="decimal" value={custom.conversionGrams} onChange={event => updateCustomNumber('conversionGrams', event.target.value)} onBlur={() => setError(validateHealthNumber(custom.conversionGrams, { label: 'Grams per unit', ...HEALTH_LIMITS.foodAmount, allowBlank: true }) || '')} className="control-input health-number-input" placeholder="Optional" /><p className="mt-1 text-xs text-muted-foreground">Without this conversion, nutrition is stored manually for the entered amount.</p></div>}
                <p className="text-xs font-bold text-muted-foreground">Nutrition for the entered amount</p>
                <div className="grid grid-cols-2 gap-2">{(Object.keys(custom.nutrition) as NutritionField[]).map(key => <input key={key} type="text" inputMode={key === 'sodium' ? 'numeric' : 'decimal'} value={custom.nutrition[key]} onChange={event => updateCustomNutrition(key, event.target.value)} className="control-input health-number-input" placeholder={key[0].toUpperCase() + key.slice(1)} aria-label={key[0].toUpperCase() + key.slice(1)} />)}</div>
                <label className="flex items-center gap-2 text-sm font-bold"><AndroidBooleanControl checked={custom.saveToFoods} onCheckedChange={checked => setCustom({ ...custom, saveToFoods: checked })} />Save to Food Library</label>
                {custom.saveToFoods && custom.unit !== 'g' && !Number(custom.conversionGrams) && <p className="flex gap-2 text-xs font-bold text-amber-600 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" />A grams conversion is required to save this food.</p>}
                <div className="flex gap-2"><button type="button" onClick={() => setCustom(null)} className="flex-1 rounded-xl border border-border px-3 py-2 text-sm font-bold">Cancel</button><button type="button" onClick={addCustomFood} disabled={custom.saveToFoods && custom.unit !== 'g' && !Number(custom.conversionGrams)} className="control-button-primary flex-1 rounded-xl px-3 py-2 text-sm font-black disabled:opacity-50">Add Food</button></div>
              </div>
            )}
          </section>

          <section className="meal-template-selected-foods flex h-[65dvh] min-h-[360px] shrink-0 flex-col lg:h-auto lg:min-h-0 lg:shrink">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 sm:px-5"><h3 className="font-black">Selected Foods</h3><span className="text-xs font-bold text-muted-foreground">{rows.length} items</span></div>
            <div className="meal-template-selected-foods-list min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 sm:p-4">
              {!rows.length ? <div className="flex h-full min-h-48 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">Search for a saved food or create a custom one.</div> : rows.map(row => {
                const values = rowNutrition(row);
                const conversion = row.unit === 'g' || row.manualNutrition || row.food?.measurementOptions.some(option => option.unit === row.unit && option.grams);
                return <article key={row.id || `${row.foodId}-${row.amount}`} className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">{row.food?.name || 'Legacy saved food'}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{compactNutritionSummary(values)}</p>
                    </div>
                    <input type="text" inputMode="decimal" value={row.amount} onChange={event => { const value = event.target.value; if (/^\d*(?:\.\d{0,2})?$/u.test(value)) setRows(current => current.map(item => item.id === row.id ? { ...item, amount: Number(value) } : item)); }} aria-label={`Amount for ${row.food?.name || 'food'}`} className="control-input health-number-input !w-16 shrink-0 !h-9 px-2 text-sm" />
                    <select value={row.unit} onChange={event => setRows(current => current.map(item => item.id === row.id ? { ...item, unit: event.target.value as FoodMeasurementUnit } : item))} aria-label={`Unit for ${row.food?.name || 'food'}`} className="control-input !w-32 shrink-0 !h-9 !pr-7 pl-2 text-sm">{UNITS.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select>
                    <Tooltip><TooltipTrigger asChild><button type="button" onClick={() => setRows(current => current.filter(item => item.id !== row.id))} aria-label={`Remove ${row.food?.name || 'food'}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></TooltipTrigger><TooltipContent>{"Remove food"}</TooltipContent></Tooltip>
                  </div>
                  {!conversion && <p className="mt-1.5 flex gap-2 text-xs font-bold text-amber-600 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" />No grams conversion for {row.unit}. Choose grams or add this food as custom with manual nutrition.</p>}
                </article>;
              })}
            </div>
            <div className="shrink-0 border-t border-border/50 bg-card p-3 sm:p-4"><h3 className="mb-2 font-black">Template Totals</h3><NutritionGrid values={totals} /></div>
          </section>
        </div>

        <footer className="flex shrink-0 flex-col gap-2 border-t border-border/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 sm:px-5"><p role="alert" className="text-sm font-bold text-red-500">{error}</p><div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><button type="button" onClick={attemptClose} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-bold sm:w-auto">Cancel</button><button type="submit" className="control-button-primary w-full rounded-xl px-4 py-2.5 text-sm font-black sm:w-auto">Save meal</button></div></footer>
      </form>
    </div>
    <ConfirmDialog
      isOpen={showUnsavedDialog}
      title="Discard Meal Template?"
      message="You have unsaved changes that will be lost."
      confirmText="Discard"
      cancelText="Continue Editing"
      isDangerous
      onConfirm={() => {
        setShowUnsavedDialog(false);
        close();
      }}
      onCancel={() => setShowUnsavedDialog(false)}
    />
    </>, document.body
  );
}
