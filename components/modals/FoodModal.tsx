'use client';

import healthResponsive from '@/components/health/health-responsive.module.css';

import { createPortal } from 'react-dom';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  X,
} from 'lucide-react';

import { useAppContext } from '@/lib/context';
import { notifyLegacy as toast } from '@/lib/feedback/notify';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  AndroidAdaptiveSelect,
  AndroidDismissibleBackdrop,
  CaizenBottomSheet,
} from '@/components/native/android-design';

import type {
  FoodEntry,
  FoodMeasurementUnit,
  FoodTemplate,
  MealType,
  NutritionField,
} from '@/lib/types';

import { formatLocalDateInput, parseLocalDateInput } from '@/lib/date-utils';
import {
  FOOD_MEASUREMENT_UNITS,
  formatFoodServing,
  parseFoodEntryServing,
  type FoodEntryUnit,
} from '@/lib/health/food-serving';
import { normalizeHealthNonNegative } from '@/lib/health/normalization';
import { getRecentFoodEntries, preserveFoodEntryMealType, readFoodEntryMealType } from '@/lib/health/food-entry';
import { findMatchingFoodTemplate } from '@/lib/health/food-template';
import { ALL_NUTRITION_FIELDS, calculateFoodTemplateNutrition, getMeasurementGrams, isNutritionFieldMissing, scaleFoodEntryNutrition } from '@/lib/health/nutrition';
import { guardHealthNumberChange, guardHealthTextChange, HEALTH_LIMITS, validateHealthNumber, validateHealthText } from '@/lib/health/validation';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

/* =========================================
   CONSTANTS
========================================= */

const MEAL_TYPES: {
  value: MealType;
  label: string;
}[] = [
    {
      value: 'breakfast',
      label: 'Breakfast',
    },
    {
      value: 'lunch',
      label: 'Lunch',
    },
    {
      value: 'dinner',
      label: 'Dinner',
    },
    {
      value: 'snack',
      label: 'Snack',
    },
  ];

type FoodFormValues = {
  name: string;
  mealType: MealType | '';
  date: string;
  servingGrams: string;
  servingUnit: FoodEntryUnit;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  sodium: string;
  fiber: string;
  sugar: string;
  selectedTemplateId: string;
  createAsTemplate: boolean;
};

type FoodFormState = FoodFormValues & {
  legacyServingLabel: string;
  legacyServingText: string;
  legacyServingAmount: number | null;
};

type RecentFoodSelection = {
  entryId: string;
  before: FoodFormState;
  applied: FoodFormState;
};

const serializeFoodForm = (values: FoodFormValues) => JSON.stringify(values);

const foodEntryDateInput = (value: Date | string | number) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : formatLocalDateInput(value);

const foodEntryAmount = (entry: FoodEntry) => {
  return parseFoodEntryServing(entry).amount;
};

const foodEntryUnit = (entry: FoodEntry): FoodEntryUnit => parseFoodEntryServing(entry).unit;

/* =========================================
   STYLES
========================================= */

const inputStyle = `
  h-11
  w-full
  rounded-xl
  border border-border/70
  bg-background
  px-3.5
  text-sm
  transition-colors
  duration-150
  placeholder:text-muted-foreground/80
  hover:border-border
  focus:border-primary/55
  focus:outline-none
  focus-visible:outline-2
  focus-visible:outline-offset-2
  focus-visible:outline-ring/60
  focus-visible:ring-0
  aria-invalid:border-destructive
  aria-invalid:ring-destructive/20
  disabled:cursor-not-allowed
  disabled:bg-muted/40
  disabled:text-muted-foreground
  disabled:opacity-70
`;

/* =========================================
   FIELD
========================================= */

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="flex min-h-4 flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-semibold leading-none text-muted-foreground"
      >
        <span>{label}</span>
      </label>

      {children}
      <div className="min-h-0 pt-0.5">
        {error ? <p id={errorId} role="alert" className="text-xs font-medium text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

function nutritionInputValue(
  source: { nutritionMissing?: NutritionField[] } | null | undefined,
  field: NutritionField,
  value: number | undefined,
) {
  return isNutritionFieldMissing(source, field) || value == null ? '' : String(value);
}

/* =========================================
   COMPONENT
========================================= */

export default function FoodModal({
  isOpen,
  mode = 'log-food',
  foodEntry,
  foodTemplate,
  androidPresentation = false,
  defaultDate,
  defaultMealType,
  onClose,
}: {
  isOpen: boolean;
  mode?: 'log-food' | 'save-template' | 'edit-template';
  foodEntry?: FoodEntry | null;
  foodTemplate?: FoodTemplate | null;
  androidPresentation?: boolean;
  defaultDate?: string;
  defaultMealType?: MealType;
  onClose: () => void;
}) {
  const {
    health,
    addFoodEntry,
    foodTemplates,
    addFoodTemplate,
    updateFoodTemplate,
    updateFoodEntry,
  } = useAppContext() as any;

  const isEditEntryMode =
    !!foodEntry;

  const isSaveTemplateMode =
    mode === 'save-template';

  const isEditTemplateMode =
    !isEditEntryMode &&
    (mode === 'edit-template' || !!foodTemplate);

  const savedFoodTemplates: FoodTemplate[] =
    health?.foodTemplates?.length
      ? health.foodTemplates
      : foodTemplates || [];
  const favoriteFoodTemplates = savedFoodTemplates.filter(template => (health?.favoriteFoodTemplateIds || []).includes(template.id));

  const today = formatLocalDateInput(new Date());
  const fallbackMealType = defaultMealType || 'breakfast';

  /* =========================================
     STATE
  ========================================= */

  const [name, setName] =
    useState('');

  const [mealType, setMealType] =
    useState<MealType | ''>(() => readFoodEntryMealType(foodEntry?.mealType) || fallbackMealType);

  const [date, setDate] =
    useState(defaultDate || today);

  const [servingGrams, setServingGrams] =
    useState('');

  const [servingUnit, setServingUnit] =
    useState<FoodEntryUnit>('g');


  const [calories, setCalories] =
    useState('');

  const [protein, setProtein] =
    useState('');

  const [carbs, setCarbs] =
    useState('');

  const [fat, setFat] =
    useState('');

  const [sodium, setSodium] =
    useState('');

  const [fiber, setFiber] =
    useState('');

  const [sugar, setSugar] =
    useState('');

  const [
    selectedTemplateId,
    setSelectedTemplateId,
  ] = useState('');

  const filteredFoodTemplates =
    savedFoodTemplates.filter(template =>
      name.trim()
        ? template.name
          .toLowerCase()
          .includes(
            name.toLowerCase()
          )
        : true
    );

  const recentFoodEntries = useMemo(
    () => getRecentFoodEntries((health?.foodEntries || []) as FoodEntry[]),
    [health?.foodEntries],
  );

  const [
    createAsTemplate,
    setCreateAsTemplate,
  ] = useState(false);

  const [
    showFoodSuggestions,
    setShowFoodSuggestions,
  ] = useState(false);
  const foodSuggestionsVisible = isOpen && showFoodSuggestions && filteredFoodTemplates.length > 0;

  const [repeatSource, setRepeatSource] = useState<FoodEntry | null>(null);

  const [legacyServingLabel, setLegacyServingLabel] = useState('');

  const [legacyServingText, setLegacyServingText] = useState('');

  const [legacyServingAmount, setLegacyServingAmount] = useState<number | null>(null);

  const [errors, setErrors] = useState<{
    name?: string;
    serving?: string;
    calories?: string;
    protein?: string;
    carbs?: string;
    fat?: string;
    sodium?: string;
    fiber?: string;
    sugar?: string;
  }>({});

  const [
    showUnsavedDialog,
    setShowUnsavedDialog,
  ] = useState(false);

  const foodNameInputRef = useRef<HTMLInputElement>(null);
  const formBaselineRef = useRef<string | null>(null);
  const recentFoodSelectionRef = useRef<RecentFoodSelection | null>(null);
  const currentFormSnapshot = serializeFoodForm({
    name,
    mealType,
    date,
    servingGrams,
    servingUnit,
    calories,
    protein,
    carbs,
    fat,
    sodium,
    fiber,
    sugar,
    selectedTemplateId,
    createAsTemplate,
  });
  const hasUnsavedChanges = formBaselineRef.current !== null && currentFormSnapshot !== formBaselineRef.current;

  const getFoodFormState = (): FoodFormState => ({
    name,
    mealType,
    date,
    servingGrams,
    servingUnit,
    calories,
    protein,
    carbs,
    fat,
    sodium,
    fiber,
    sugar,
    selectedTemplateId,
    createAsTemplate,
    legacyServingLabel,
    legacyServingText,
    legacyServingAmount,
  });

  const applyFoodFormState = (values: FoodFormState) => {
    setName(values.name);
    setMealType(values.mealType);
    setDate(values.date);
    setServingGrams(values.servingGrams);
    setServingUnit(values.servingUnit);
    setCalories(values.calories);
    setProtein(values.protein);
    setCarbs(values.carbs);
    setFat(values.fat);
    setSodium(values.sodium);
    setFiber(values.fiber);
    setSugar(values.sugar);
    setSelectedTemplateId(values.selectedTemplateId);
    setCreateAsTemplate(values.createAsTemplate);
    setLegacyServingLabel(values.legacyServingLabel);
    setLegacyServingText(values.legacyServingText);
    setLegacyServingAmount(values.legacyServingAmount);
  };

  const selectedTemplate =
    savedFoodTemplates.find(
      template =>
        template.id === selectedTemplateId
    );

  const missingNutritionFields = () => {
    const values: Record<NutritionField, string> = {
      calories,
      protein,
      carbs,
      fat,
      sodium,
      fiber,
      sugar,
    };
    return ALL_NUTRITION_FIELDS.filter(field => !values[field].trim());
  };

  const clearNutritionValues = () => {
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setSodium('');
    setFiber('');
    setSugar('');
  };

  const applyRecentFood = (entry: FoodEntry) => {
    const parsedServing = parseFoodEntryServing(entry);
    const before = getFoodFormState();
    const applied: FoodFormState = {
      ...before,
      name: entry.name,
      mealType: readFoodEntryMealType(entry.mealType) || 'breakfast',
      servingGrams: parsedServing.amount?.toString() || '',
      servingUnit: parsedServing.unit,
      legacyServingLabel: parsedServing.legacyLabel || '',
      legacyServingText: parsedServing.originalServing || '',
      legacyServingAmount: parsedServing.amount,
      selectedTemplateId: '',
      calories: nutritionInputValue(entry, 'calories', entry.calories),
      protein: nutritionInputValue(entry, 'protein', entry.protein),
      carbs: nutritionInputValue(entry, 'carbs', entry.carbs),
      fat: nutritionInputValue(entry, 'fat', entry.fat),
      sodium: nutritionInputValue(entry, 'sodium', entry.sodium),
      fiber: nutritionInputValue(entry, 'fiber', entry.fiber),
      sugar: nutritionInputValue(entry, 'sugar', entry.sugar),
      createAsTemplate: false,
    };
    recentFoodSelectionRef.current = { entryId: entry.id, before, applied };
    applyFoodFormState(applied);
    setRepeatSource(entry);
    setShowFoodSuggestions(false);
    setErrors({});
  };

  const deselectRecentFood = (entry: FoodEntry) => {
    const selection = recentFoodSelectionRef.current;
    if (!selection || selection.entryId !== entry.id) {
      applyRecentFood(entry);
      return;
    }

    const current = getFoodFormState();
    const restored = { ...current } as Record<keyof FoodFormState, unknown>;
    const before = selection.before as unknown as Record<keyof FoodFormState, unknown>;
    const applied = selection.applied as unknown as Record<keyof FoodFormState, unknown>;
    (Object.keys(applied) as Array<keyof FoodFormState>).forEach(field => {
      if (current[field] === applied[field]) restored[field] = before[field];
    });

    applyFoodFormState(restored as FoodFormState);
    recentFoodSelectionRef.current = null;
    setRepeatSource(null);
    setShowFoodSuggestions(false);
    setErrors({});
  };

  const roundValue = (value: number) =>
    Number(value.toFixed(1)).toString();

  const calculateFromFoodEntry = (
    entry: FoodEntry,
    amountValue: string
  ) => {
    const amount = Number(amountValue);
    const originalAmount = foodEntryAmount(entry);

    const nutrition = scaleFoodEntryNutrition(entry, amount, originalAmount);
    if (!nutrition) {
      clearNutritionValues();
      return;
    }

    setCalories(isNutritionFieldMissing(entry, 'calories') ? '' : roundValue(nutrition.calories));
    setProtein(isNutritionFieldMissing(entry, 'protein') ? '' : roundValue(nutrition.protein));
    setCarbs(isNutritionFieldMissing(entry, 'carbs') ? '' : roundValue(nutrition.carbs));
    setFat(isNutritionFieldMissing(entry, 'fat') ? '' : roundValue(nutrition.fat));
    setSodium(isNutritionFieldMissing(entry, 'sodium') ? '' : Math.round(nutrition.sodium).toString());
    setFiber(isNutritionFieldMissing(entry, 'fiber') ? '' : roundValue(nutrition.fiber));
    setSugar(isNutritionFieldMissing(entry, 'sugar') ? '' : nutrition.sugar === undefined ? '' : roundValue(nutrition.sugar));
  };

  const calculateFromTemplate = (
    template: FoodTemplate,
    amountValue: string,
    unit: FoodMeasurementUnit = servingUnit === 'legacy' ? 'g' : servingUnit,
  ) => {
    const amount = Number(amountValue);
    const gramsPerUnit = getMeasurementGrams(unit, template?.measurementOptions);
    if (!Number.isFinite(amount) || amount <= 0 || !gramsPerUnit) {
      clearNutritionValues();
      return;
    }
    const nutrition = calculateFoodTemplateNutrition(template, amount * gramsPerUnit);
    setCalories(isNutritionFieldMissing(nutrition, 'calories') ? '' : roundValue(nutrition.calories));
    setProtein(isNutritionFieldMissing(nutrition, 'protein') ? '' : roundValue(nutrition.protein));
    setCarbs(isNutritionFieldMissing(nutrition, 'carbs') ? '' : roundValue(nutrition.carbs));
    setFat(isNutritionFieldMissing(nutrition, 'fat') ? '' : roundValue(nutrition.fat));
    setSodium(isNutritionFieldMissing(nutrition, 'sodium') ? '' : Math.round(nutrition.sodium).toString());
    setFiber(isNutritionFieldMissing(nutrition, 'fiber') ? '' : roundValue(nutrition.fiber));
    setSugar(isNutritionFieldMissing(nutrition, 'sugar') || nutrition.sugar === undefined ? '' : roundValue(nutrition.sugar));
  };

  const chooseFoodTemplate = (template: FoodTemplate) => {
    setSelectedTemplateId(template.id);
    recentFoodSelectionRef.current = null;
    setRepeatSource(null);
    setLegacyServingLabel('');
    setLegacyServingText('');
    setLegacyServingAmount(null);
    setName(template.name);
    setServingGrams(String(template.referenceWeightGrams));
    setServingUnit('g');
    calculateFromTemplate(template, String(template.referenceWeightGrams), 'g');
    setCreateAsTemplate(false);
    setShowFoodSuggestions(false);
  };

  const handleServingChange = (
    value: string
  ) => {
    const result = guardHealthNumberChange(servingGrams, value, {
      label: 'Amount', ...HEALTH_LIMITS.foodAmount, allowBlank: true, unit: servingUnit,
    });
    if (!result.accepted) {
      setErrors(current => ({ ...current, serving: result.error }));
      return;
    }
    setServingGrams(result.value);
    setErrors(current => ({ ...current, serving: result.error }));

    if (servingUnit === 'legacy') {
      if (legacyServingAmount === null || Number(result.value) !== legacyServingAmount) {
        clearNutritionValues();
      }
      return;
    }

    if (selectedTemplate) {
      calculateFromTemplate(
        selectedTemplate,
        result.value,
        servingUnit,
      );
      return;
    }

    if (repeatSource && foodEntryUnit(repeatSource) === servingUnit) {
      calculateFromFoodEntry(repeatSource, result.value);
      return;
    }

    if (foodEntry && foodEntryUnit(foodEntry) === servingUnit) {
      calculateFromFoodEntry(foodEntry, result.value);
    }
  };

  /* =========================================
     RESET
  ========================================= */

  const resetForm = () => {
    formBaselineRef.current = null;
    recentFoodSelectionRef.current = null;
    setName('');
    setMealType(fallbackMealType);
    setDate(
      defaultDate || today
    );
    setServingGrams('');
    setServingUnit('g');
    setLegacyServingLabel('');
    setLegacyServingText('');
    setLegacyServingAmount(null);
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setSodium('');
    setFiber('');
    setSugar('');
    setSelectedTemplateId('');
    setRepeatSource(null);
    setCreateAsTemplate(false);
    setShowFoodSuggestions(false);
    setErrors({});
    setShowUnsavedDialog(false);
  };

  const resetForNextFood = () => {
    const nextValues: FoodFormState = {
      name: '',
      mealType: mealType || 'breakfast',
      date,
      servingGrams: '',
      servingUnit: 'g',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
      sodium: '',
      fiber: '',
      sugar: '',
      selectedTemplateId: '',
      createAsTemplate: false,
      legacyServingLabel: '',
      legacyServingText: '',
      legacyServingAmount: null,
    };
    // Only the FoodFormValues subset belongs in the unsaved-change baseline.
    // Serializing the full FoodFormState (which also carries the legacy
    // serving fields) produced a baseline string that could never match
    // currentFormSnapshot again, permanently stuck the modal in an
    // unsaved-changes state after "Add & add another", and warned on a
    // genuinely blank next entry.
    const { legacyServingLabel: _legacyServingLabel, legacyServingText: _legacyServingText, legacyServingAmount: _legacyServingAmount, ...nextBaselineValues } = nextValues;
    formBaselineRef.current = serializeFoodForm(nextBaselineValues);
    recentFoodSelectionRef.current = null;
    applyFoodFormState(nextValues);
    setRepeatSource(null);
    setShowFoodSuggestions(false);
    setErrors({});
    window.requestAnimationFrame(() => foodNameInputRef.current?.focus());
  };

  /* =========================================
     CLOSE
  ========================================= */

  const attemptClose = () => {
    if (!canClose()) return;
    finishClose();
  };

  const canClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return false;
    }
    return true;
  };

  const finishClose = () => {
    if (androidPresentation) {
      resetForm();
      onClose();
    } else {
      closeAfter(resetForm);
    }
  };

  const modalPanelRef = useRef<HTMLDivElement>(null);
  const foodNameSuggestionWrapperRef = useRef<HTMLDivElement>(null);
  const { closeAfter, isClosing } = useAnimatedOverlayClose({ isOpen: isOpen && !androidPresentation, onClose });

  const consumeFoodSuggestionEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !foodSuggestionsVisible) return false;
    setShowFoodSuggestions(false);
    return true;
  };

  useOverlayLifecycle(isOpen && !androidPresentation, attemptClose, {
    containerRef: modalPanelRef,
    initialFocusRef: modalPanelRef,
    onEscapeKeyDown: consumeFoodSuggestionEscape,
  });

  useEffect(() => {
    if (!foodSuggestionsVisible) return;

    const handlePointerDown = (event: PointerEvent) => {
      const wrapper = foodNameSuggestionWrapperRef.current;
      if (wrapper && event.target instanceof Node && !wrapper.contains(event.target)) {
        setShowFoodSuggestions(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [foodSuggestionsVisible]);

  useEffect(() => {
    if (!isOpen) return;

    resetForm();

    if (foodEntry) {
      const parsedServing = parseFoodEntryServing(foodEntry);
      const initialValues: FoodFormValues = {
        name: foodEntry.name || '',
        // The native/select control cannot represent an empty legacy value;
        // keep its controlled value inside the canonical option set.
        mealType: readFoodEntryMealType(foodEntry.mealType) || 'breakfast',
        date: foodEntryDateInput(foodEntry.date),
        servingGrams: parsedServing.amount?.toString() || '',
        servingUnit: parsedServing.unit,
        calories: nutritionInputValue(foodEntry, 'calories', foodEntry.calories),
        protein: nutritionInputValue(foodEntry, 'protein', foodEntry.protein),
        carbs: nutritionInputValue(foodEntry, 'carbs', foodEntry.carbs),
        fat: nutritionInputValue(foodEntry, 'fat', foodEntry.fat),
        sodium: nutritionInputValue(foodEntry, 'sodium', foodEntry.sodium),
        fiber: nutritionInputValue(foodEntry, 'fiber', foodEntry.fiber),
        sugar: nutritionInputValue(foodEntry, 'sugar', foodEntry.sugar),
        selectedTemplateId: '',
        createAsTemplate: false,
      };
      setName(initialValues.name);
      setMealType(initialValues.mealType);
      setDate(initialValues.date);
      setServingGrams(initialValues.servingGrams);
      setServingUnit(initialValues.servingUnit);
      setLegacyServingLabel(parsedServing.legacyLabel || '');
      setLegacyServingText(parsedServing.originalServing || '');
      setLegacyServingAmount(parsedServing.amount);
      setCalories(initialValues.calories);
      setProtein(initialValues.protein);
      setCarbs(initialValues.carbs);
      setFat(initialValues.fat);
      setSodium(initialValues.sodium);
      setFiber(initialValues.fiber);
      setSugar(initialValues.sugar);
      setSelectedTemplateId(initialValues.selectedTemplateId);
      setCreateAsTemplate(initialValues.createAsTemplate);
      formBaselineRef.current = serializeFoodForm(initialValues);
      return;
    }

    if (!foodTemplate) {
      const initialValues: FoodFormValues = {
        name: '',
        mealType: fallbackMealType,
        date: defaultDate || today,
        servingGrams: '',
        servingUnit: 'g',
        calories: '',
        protein: '',
        carbs: '',
        fat: '',
        sodium: '',
        fiber: '',
        sugar: '',
        selectedTemplateId: '',
        createAsTemplate: false,
      };
      setDate(initialValues.date);
      setLegacyServingLabel('');
      setLegacyServingText('');
      setLegacyServingAmount(null);
      formBaselineRef.current = serializeFoodForm(initialValues);
      return;
    }

    const grams =
      Number(foodTemplate.referenceWeightGrams || 0);
    const initialValues: FoodFormValues = {
      name: foodTemplate.name || '',
      mealType: 'breakfast',
      date: defaultDate || today,
      servingGrams: String(foodTemplate.referenceWeightGrams || ''),
      servingUnit: 'g',
      calories: grams && !isNutritionFieldMissing(foodTemplate, 'calories') ? String(Math.round(foodTemplate.caloriesPerGram * grams)) : '',
      protein: grams && !isNutritionFieldMissing(foodTemplate, 'protein') ? String(Number((foodTemplate.proteinPerGram * grams).toFixed(1))) : '',
      carbs: grams && !isNutritionFieldMissing(foodTemplate, 'carbs') ? String(Number((foodTemplate.carbsPerGram * grams).toFixed(1))) : '',
      fat: grams && !isNutritionFieldMissing(foodTemplate, 'fat') ? String(Number((foodTemplate.fatPerGram * grams).toFixed(1))) : '',
      sodium: grams && !isNutritionFieldMissing(foodTemplate, 'sodium') ? String(Math.round(foodTemplate.sodiumPerGram * grams)) : '',
      fiber: grams && !isNutritionFieldMissing(foodTemplate, 'fiber') ? String(Number(((foodTemplate.fiberPerGram ?? 0) * grams).toFixed(1))) : '',
      sugar: grams && foodTemplate.sugarPerGram !== undefined && !isNutritionFieldMissing(foodTemplate, 'sugar')
        ? String(Number((foodTemplate.sugarPerGram * grams).toFixed(1)))
        : '',
      selectedTemplateId: '',
      createAsTemplate: true,
    };
    setName(initialValues.name);
    setMealType(initialValues.mealType);
    setDate(initialValues.date);
    setServingGrams(initialValues.servingGrams);
    setServingUnit(initialValues.servingUnit);
    setLegacyServingLabel('');
    setLegacyServingText('');
    setLegacyServingAmount(null);
    setCalories(initialValues.calories);
    setProtein(initialValues.protein);
    setCarbs(initialValues.carbs);
    setFat(initialValues.fat);
    setSodium(initialValues.sodium);
    setFiber(initialValues.fiber);
    setSugar(initialValues.sugar);
    setSelectedTemplateId(initialValues.selectedTemplateId);
    setCreateAsTemplate(initialValues.createAsTemplate);
    formBaselineRef.current = serializeFoodForm(initialValues);
  }, [isOpen, foodEntry, foodTemplate, defaultDate, fallbackMealType]);



  /* =========================================
     VALIDATION
  ========================================= */

  const validateForm = () => {
    const newErrors: typeof errors = {};
    const unchanged = (value: string, legacy?: string | number | null) => Boolean((isEditEntryMode || isEditTemplateMode) && value === String(legacy ?? ''));

    if (!unchanged(name, foodEntry?.name || foodTemplate?.name)) {
      const nameError = validateHealthText(name, { label: 'Food name', maxLength: 100, required: true });
      if (nameError) newErrors.name = nameError;
    }

    const nutritionFields = [
      { key: 'calories', label: 'Calories', value: calories, options: HEALTH_LIMITS.foodCalories },
      { key: 'protein', label: 'Protein', value: protein, options: HEALTH_LIMITS.foodMacro },
      { key: 'carbs', label: 'Carbohydrates', value: carbs, options: HEALTH_LIMITS.foodMacro },
      { key: 'fat', label: 'Fat', value: fat, options: HEALTH_LIMITS.foodMacro },
      { key: 'sodium', label: 'Sodium', value: sodium, options: HEALTH_LIMITS.sodium },
      { key: 'fiber', label: 'Fiber', value: fiber, options: HEALTH_LIMITS.foodMacro },
      { key: 'sugar', label: 'Sugar', value: sugar, options: HEALTH_LIMITS.foodMacro },
    ] as const;
    nutritionFields.forEach(field => {
      const legacyValue = foodEntry
        ? ({ calories: foodEntry.calories, protein: foodEntry.protein, carbs: foodEntry.carbs, fat: foodEntry.fat, sodium: foodEntry.sodium, fiber: foodEntry.fiber, sugar: foodEntry.sugar } as Record<string, string | number | undefined>)[field.key]
        : undefined;
      const error = unchanged(field.value, legacyValue)
        ? undefined
        : validateHealthNumber(field.value, { label: field.label, ...field.options, allowBlank: true });
      if (error) newErrors[field.key] = error;
    });

    const legacyServing = foodEntry?.serving !== undefined
      ? String(foodEntry.serving).replace(/[^0-9.]/g, '')
      : foodTemplate?.referenceWeightGrams;
    const requiresGramAmount = isSaveTemplateMode || isEditTemplateMode || createAsTemplate;
    const servingError = unchanged(servingGrams, legacyServing)
      ? undefined
      : validateHealthNumber(servingGrams, {
      label: 'Amount', ...HEALTH_LIMITS.foodAmount, allowBlank: !requiresGramAmount,
      });
    if (servingError) newErrors.serving = servingError;
    const servingValue = Number(servingGrams);
    if (
      requiresGramAmount &&
      (!Number.isFinite(servingValue) || servingValue <= 0)
    ) {
      newErrors.serving = 'Enter an amount in grams to save this food.';
    }

    if (
      (isSaveTemplateMode || isEditTemplateMode || createAsTemplate) &&
      servingUnit !== 'g'
    ) {
      newErrors.serving = 'Foods use grams. Add a non-gram conversion in the meal builder.';
    }

    setErrors(newErrors);

    const errorOrder: Array<keyof typeof newErrors> = [
      'name',
      'serving',
      'calories',
      'protein',
      'carbs',
      'fat',
      'sodium',
      'fiber',
      'sugar',
    ];
    const firstError = errorOrder.find(field => newErrors[field]);
    if (firstError) {
      window.requestAnimationFrame(() => document.getElementById(`food-${firstError}`)?.focus());
    }

    return (
      Object.keys(newErrors)
        .length === 0
    );
  };

  /* =========================================
     SUBMIT
  ========================================= */

  const savedFoodPayload = (servingValue: number): Omit<FoodTemplate, 'id' | 'createdAt'> => ({
    name: name.trim(),
    referenceWeightGrams: servingValue,
    caloriesPerGram: normalizeHealthNonNegative(calories) / servingValue,
    proteinPerGram: normalizeHealthNonNegative(protein) / servingValue,
    carbsPerGram: normalizeHealthNonNegative(carbs) / servingValue,
    fatPerGram: normalizeHealthNonNegative(fat) / servingValue,
    sodiumPerGram: normalizeHealthNonNegative(sodium) / servingValue,
    fiberPerGram: normalizeHealthNonNegative(fiber) / servingValue,
    sugarPerGram: sugar.trim() ? normalizeHealthNonNegative(sugar) / servingValue : undefined,
    nutritionMissing: missingNutritionFields(),
  });

  const saveAsSavedFood = (servingValue: number) => {
    const payload = savedFoodPayload(servingValue);
    const existing = findMatchingFoodTemplate(savedFoodTemplates, payload.name);

    if (existing) updateFoodTemplate(existing.id, payload);
    else addFoodTemplate(payload);
  };

  const saveFood = (keepOpen = false) => {
    const servingValue = Number(servingGrams);

    if (!validateForm()) return;

    if (isEditEntryMode && foodEntry) {
      const servingForSave = formatFoodServing(
        servingGrams,
        servingUnit,
        legacyServingLabel,
        legacyServingText,
      );
      updateFoodEntry(foodEntry.id, preserveFoodEntryMealType(foodEntry, {
        name: name.trim(),

        ...(mealType ? { mealType } : {}),

        date: date ? parseLocalDateInput(date) : new Date(),

        serving: servingForSave,
        amount: servingGrams ? normalizeHealthNonNegative(servingGrams) : undefined,
        unit: servingGrams && servingUnit !== 'legacy' ? servingUnit : undefined,

        calories: normalizeHealthNonNegative(calories),

        protein: normalizeHealthNonNegative(protein),

        carbs: normalizeHealthNonNegative(carbs),

        fat: normalizeHealthNonNegative(fat),

        sodium: normalizeHealthNonNegative(sodium),

        fiber: normalizeHealthNonNegative(fiber),
        sugar: sugar.trim() ? normalizeHealthNonNegative(sugar) : undefined,
        nutritionMissing: missingNutritionFields(),

        notes: foodEntry.notes || '',
      }));

      if (
        createAsTemplate &&
        Number.isFinite(servingValue) &&
        servingValue > 0
      ) {
        saveAsSavedFood(servingValue);
      }

      finishClose();
      return;
    }

    if (
      isEditTemplateMode &&
      foodTemplate &&
      Number.isFinite(servingValue) && servingValue > 0
    ) {
      updateFoodTemplate(foodTemplate.id, {
        name: name.trim(),
        referenceWeightGrams: servingValue,
        caloriesPerGram:
          normalizeHealthNonNegative(calories) / servingValue,
        proteinPerGram:
          normalizeHealthNonNegative(protein) / servingValue,
        carbsPerGram:
          normalizeHealthNonNegative(carbs) / servingValue,
        fatPerGram:
          normalizeHealthNonNegative(fat) / servingValue,
        sodiumPerGram:
          normalizeHealthNonNegative(sodium) / servingValue,
        fiberPerGram:
          normalizeHealthNonNegative(fiber) / servingValue,
        sugarPerGram: sugar.trim() ? normalizeHealthNonNegative(sugar) / servingValue : undefined,
        nutritionMissing: missingNutritionFields(),
      });

      finishClose();
      return;
    }

    if (
      isSaveTemplateMode &&
      Number.isFinite(servingValue) && servingValue > 0
    ) {
      saveAsSavedFood(servingValue);

      finishClose();
      return;
    }

    const isFirstFoodEntry = (health?.foodEntries?.length || 0) === 0;
    const servingForSave = formatFoodServing(
      servingGrams,
      servingUnit,
      legacyServingLabel,
      legacyServingText,
    );
    addFoodEntry({
      name: name.trim(),

      mealType: mealType || 'breakfast',

      date: date ? parseLocalDateInput(date) : new Date(),

      serving: servingForSave,
      amount: servingGrams ? normalizeHealthNonNegative(servingGrams) : undefined,
      unit: servingGrams && servingUnit !== 'legacy' ? servingUnit : undefined,

      calories: normalizeHealthNonNegative(calories),

      protein: normalizeHealthNonNegative(protein),

      carbs: normalizeHealthNonNegative(carbs),

      fat: normalizeHealthNonNegative(fat),

      sodium: normalizeHealthNonNegative(sodium),

      fiber: normalizeHealthNonNegative(fiber),
      ...(sugar.trim() ? { sugar: normalizeHealthNonNegative(sugar) } : {}),
      nutritionMissing: missingNutritionFields(),

      notes: '',
    });

    if (
      createAsTemplate &&
      !selectedTemplate &&
      Number.isFinite(servingValue) && servingValue > 0
    ) {
      saveAsSavedFood(servingValue);
    }

    if (isFirstFoodEntry) {
      toast({
        title: 'Your first health record is saved',
        description: 'Today’s food log is ready to build on.',
      });
    }

    if (keepOpen) {
      resetForNextFood();
      return;
    }

    finishClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveFood();
  };

  if (!isOpen) return null;

  const foodTitle = isEditTemplateMode
    ? 'Edit saved food'
    : isEditEntryMode
      ? 'Edit meal'
      : isSaveTemplateMode
        ? 'Save food'
        : 'Log meal';

  const foodModalContent = (
          <div
            ref={modalPanelRef}
            tabIndex={androidPresentation ? undefined : -1}
            role={androidPresentation ? undefined : 'dialog'}
            aria-modal={androidPresentation ? undefined : 'true'}
            aria-labelledby={androidPresentation ? undefined : 'food-modal-title'}
            aria-describedby={androidPresentation ? undefined : 'food-modal-description'}
            data-caizen-overlay={androidPresentation || !isClosing ? 'open' : 'closing'}
            data-state={isClosing && !androidPresentation ? 'closed' : 'open'}
            onClick={e =>
              e.stopPropagation()
            }
            className={androidPresentation
              ? healthResponsive.dialog + ' android-food-sheet-content flex min-h-full flex-col'
              : healthResponsive.dialog + ' relative flex h-auto max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl modal-card-enter'}
          >
            {/* HEADER */}
            <div
              className={androidPresentation
                ? 'hidden'
                : 'relative border-b border-border/50 p-4 sm:p-6'}
            >
              <div
                className="
                flex
                items-start
                justify-between
                gap-4
              "
              >
                <div>
                  <h2
                    id="food-modal-title"
                    className="
                    text-2xl
                    font-black
                    tracking-tight
                  "
                  >
                    {isEditTemplateMode
                      ? 'Edit saved food'
                      : isEditEntryMode
                        ? 'Edit meal'
                        : isSaveTemplateMode
                        ? 'Save food'
                        : 'Log meal'}
                  </h2>

                  <p
                    id="food-modal-description"
                    className="
                    mt-2
                    text-sm
                    text-muted-foreground
                  "
                  >
                    Log what you ate and track the nutrition that actually matters.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={attemptClose}
                  aria-label="Close"
                  className="
                    grid
                    size-11
                    place-items-center
                    rounded-xl
                    border border-border/50
                    bg-card
                    text-muted-foreground
                    transition-colors
                    hover:bg-muted
                    hover:text-foreground
                    focus-visible:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-ring
                "
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* FORM */}
            <form
              noValidate
              onSubmit={handleSubmit}
              className={androidPresentation
                ? 'android-food-sheet-form flex min-h-0 flex-1 flex-col'
                : 'flex flex-1 flex-col overflow-hidden'}
            >
              {/* CONTENT */}
              <div
                className={androidPresentation
                  ? 'android-food-sheet-fields px-3 py-3'
                  : 'flex-1 overflow-y-auto px-4 py-4 sm:px-4 sm:py-4'}
              >
                <div
                  className="
                  grid
                  grid-cols-1
                  divide-y divide-border/50
                  gap-0
                  lg:grid-cols-[1.05fr_0.95fr]
                  lg:divide-x lg:divide-y-0
                "
                >
                  {/* LEFT */}
                  <div className="space-y-4 overflow-visible pb-6 lg:pr-6 lg:pb-0">
                    {/* BASIC INFO */}
                    <section>
                      <div className="mb-4">
                        <h3 className="text-lg font-bold">
                          Meal details
                        </h3>

                      </div>

                      {!isSaveTemplateMode && !isEditTemplateMode && favoriteFoodTemplates.length ? <div className="mb-4 rounded-xl border border-border/50 bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-black">Favorite foods</h4><span className="text-xs font-black uppercase tracking-wide text-muted-foreground">Saved</span></div>
                        <div className="mt-2 flex flex-wrap gap-2">{favoriteFoodTemplates.slice(0, 6).map(template => <button key={template.id} type="button" onClick={() => chooseFoodTemplate(template)} aria-pressed={selectedTemplateId === template.id} className={`min-h-11 max-w-full rounded-xl border px-3 py-2 text-left text-xs font-bold ${selectedTemplateId === template.id ? 'border-primary/40 bg-primary/10' : 'border-border/60 bg-card/45 hover:bg-muted'}`}><span className="block max-w-52 break-words [overflow-wrap:anywhere]">{template.name}</span><span className="mt-0.5 block text-xs font-medium text-muted-foreground">{template.referenceWeightGrams} g</span></button>)}</div>
                      </div> : null}

                      {!isSaveTemplateMode && !isEditTemplateMode && recentFoodEntries.length > 0 ? (
                        <div className="mb-4 rounded-xl bg-muted/35 p-3" aria-labelledby="recent-meals-heading">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 id="recent-meals-heading" className="text-sm font-black">Repeat a recent meal</h4>
                              <p className="mt-1 text-xs text-muted-foreground">Reuse a recent meal, then adjust the amount or details.</p>
                            </div>
                            <span className="shrink-0 text-xs font-black uppercase tracking-wide text-muted-foreground">Recent</span>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2" role="list" aria-label="Recent meals">
                            {recentFoodEntries.map(entry => (
                              <div key={entry.id} role="listitem">
                                <Tooltip><TooltipTrigger asChild><button
                                  type="button"
                                  onClick={() => repeatSource?.id === entry.id ? deselectRecentFood(entry) : applyRecentFood(entry)}
                                  aria-pressed={repeatSource?.id === entry.id}
                                  className={`min-h-11 w-full rounded-xl border px-3 py-2 text-left text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${repeatSource?.id === entry.id ? 'border-primary/35 bg-primary/10 text-foreground' : 'border-border/60 bg-card/45 hover:border-primary/30 hover:bg-muted/50'}`}
                                  aria-label={repeatSource?.id === entry.id ? `Deselect ${entry.name}` : `Repeat ${entry.name}`}
                                >
                                  <span className="block break-words">{entry.name}</span>
                                  <span className="mt-1 block whitespace-normal break-words text-xs font-medium text-muted-foreground">{entry.serving || 'Amount not set'}</span>
                                </button></TooltipTrigger><TooltipContent>{entry.name}</TooltipContent></Tooltip>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-5">
                        <Field id="food-name" label="Food name *" error={errors.name}>
                          <div ref={foodNameSuggestionWrapperRef} className="relative">
                              <input
                              ref={foodNameInputRef}
                              id="food-name"
                              autoComplete="off"
                              value={name}
                              onFocus={() =>
                                setShowFoodSuggestions(true)
                              }

                              onChange={e => {
                                const result = guardHealthTextChange(name, e.target.value, { label: 'Food name', maxLength: 100, required: false });
                                if (!result.accepted) {
                                  setErrors(prev => ({ ...prev, name: result.error }));
                                  return;
                                }
                                const value = result.value;
                                setName(value);
                                setSelectedTemplateId('');
                                setShowFoodSuggestions(true);
                                setErrors(prev => ({ ...prev, name: result.error }));
                              }}
                              className={`
                              ${inputStyle}
                              ${errors.name
                                  ? 'border-destructive'
                                  : ''
                                }
                            `}
                              aria-invalid={Boolean(errors.name)}
                              aria-describedby={errors.name ? 'food-name-error' : undefined}
                              placeholder="Chicken breast, rice, egg..."
                            />

                            {showFoodSuggestions &&
                              filteredFoodTemplates.length > 0 && (
                                  <div
                                    id="saved-food-suggestions"
                                    role="list"
                                    aria-label="Saved food suggestions"
                                  className="
        absolute
        z-[99999]
        mt-2
        max-h-56
        w-full
        overflow-y-auto
        rounded-xl
        border border-border/50
        bg-popover
        shadow-2xl
      "
                                >
                                  {filteredFoodTemplates
                                    .slice(0, 8)
                                    .map(template => (
                                      <div key={template.id} role="listitem">
                                        <button
                                          type="button"
                                          onClick={() => chooseFoodTemplate(template)}
                                          className="
              block
              w-full
              border-b
              border-border/30
              px-4
              py-3
              text-left
              text-sm
              transition-all
              hover:bg-muted
              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-inset
              focus-visible:ring-ring
            "
                                        >
                                          {template.name}
                                        </button>
                                      </div>
                                    ))}
                                </div>
                              )}
                          </div>
                        </Field>


                        {!isSaveTemplateMode &&
                          !isEditTemplateMode && (
                            <Field id="food-meal-type" label="Meal type">
                              <AndroidAdaptiveSelect
                                id="food-meal-type"
                                label="Meal Type"
                                value={mealType}
                                onChange={value =>
                                  setMealType(value as MealType)
                                }
                                options={MEAL_TYPES}
                                className={inputStyle}
                              />
                            </Field>
                          )}
                        <Field id="food-serving" label="Amount and unit" error={errors.serving}>
                          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-[minmax(0,1fr)_120px]">
                            <input
                              id="food-serving"
                              type="text"
                              inputMode="decimal"
                              value={servingGrams}
                              onChange={e =>
                                handleServingChange(
                                  e.target.value
                                )
                              }
                              onBlur={() => setErrors(current => ({
                                ...current,
                                serving: validateHealthNumber(servingGrams, {
                                  label: 'Amount',
                                  ...HEALTH_LIMITS.foodAmount,
                                  allowBlank: !(isSaveTemplateMode || isEditTemplateMode || createAsTemplate),
                                  unit: servingUnit,
                                }),
                              }))}
                              className={`${inputStyle} health-number-input ${errors.serving ? 'border-destructive' : ''}`}
                              aria-invalid={Boolean(errors.serving)}
                              aria-describedby={errors.serving ? 'food-serving-error' : undefined}
                              placeholder="Enter amount"
                            />
                            <AndroidAdaptiveSelect
                              id="food-serving-unit"
                              label="Unit"
                              value={servingUnit}
                              onChange={value => {
                                const nextUnit = value as FoodEntryUnit;
                                setServingUnit(nextUnit);
                                if (nextUnit !== 'legacy') {
                                  setLegacyServingLabel('');
                                  setLegacyServingText('');
                                  setLegacyServingAmount(null);
                                }
                                if (selectedTemplate && nextUnit !== 'legacy') calculateFromTemplate(selectedTemplate, servingGrams, nextUnit);
                                else if (repeatSource && foodEntryUnit(repeatSource) === nextUnit && nextUnit !== 'legacy') calculateFromFoodEntry(repeatSource, servingGrams);
                              }}
                              options={[
                                ...FOOD_MEASUREMENT_UNITS.map(unit => ({ value: unit, label: unit })),
                                ...(servingUnit === 'legacy'
                                  ? [{ value: 'legacy', label: `${legacyServingLabel || 'Original unit'} (original)` }]
                                  : []),
                              ]}
                              className={inputStyle}
                            />
                          </div>
                          {servingUnit !== 'legacy' && servingUnit !== 'g' && selectedTemplate && !getMeasurementGrams(servingUnit, selectedTemplate.measurementOptions) && (
                            <p className="text-xs text-muted-foreground">
                              This saved food has no grams conversion for {servingUnit}. Nutrition was cleared; enter it manually or choose grams.
                            </p>
                          )}
                          {servingUnit === 'legacy' ? (
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              The original unit “{legacyServingLabel || 'custom serving'}” has no saved grams conversion. Nutrition is kept as entered; changing the amount clears it for manual re-entry.
                            </p>
                          ) : null}
                        </Field>
                      </div>
                    </section>
                  </div>

                  {/* RIGHT */}
                  <div className="space-y-4 pt-6 lg:pl-6 lg:pt-0">
                    {/* NUTRITION */}
                    <section className="p-0">
                      <div>
                        <span className="block text-lg font-bold">Nutrition details</span>
                        <span className="mt-1 block text-sm font-normal text-muted-foreground">Add details if you have them.</span>
                      </div>

                      <div className="mt-4">
                      <div
                        className="
                        grid
                        grid-cols-1
                        gap-4
                        md:grid-cols-2
                      "
                      >
                        <Field id="food-calories" label="Calories" error={errors.calories}>
                          <div>
                            <input
                              id="food-calories"
                              type="text"
                              inputMode="decimal"
                              value={calories}
                              onChange={e => {
                                const result = guardHealthNumberChange(calories, e.target.value, { label: 'Calories', ...HEALTH_LIMITS.foodCalories, allowBlank: true, unit: 'kcal' });
                                if (!result.accepted) return setErrors(prev => ({ ...prev, calories: result.error }));
                                setCalories(result.value);
                                setErrors(prev => ({ ...prev, calories: result.error }));
                              }}
                              onBlur={() => setErrors(prev => ({ ...prev, calories: validateHealthNumber(calories, { label: 'Calories', ...HEALTH_LIMITS.foodCalories, allowBlank: true, unit: 'kcal' }) }))}
                              className={`
                              ${inputStyle}
                              health-number-input
                              ${errors.calories
                                  ? 'border-destructive'
                                  : ''
                                }
                            `}
                              aria-invalid={Boolean(errors.calories)}
                              aria-describedby={errors.calories ? 'food-calories-error' : undefined}
                              placeholder="Optional"
                            />

                          </div>
                        </Field>

                        <Field id="food-protein" label="Protein (g)" error={errors.protein}>
                          <input
                            id="food-protein"
                            type="text"
                            inputMode="decimal"
                            value={protein}

                            onChange={e => {
                              const result = guardHealthNumberChange(protein, e.target.value, { label: 'Protein', ...HEALTH_LIMITS.foodMacro, allowBlank: true, unit: 'g' });
                              if (!result.accepted) return setErrors(prev => ({ ...prev, protein: result.error }));
                              setProtein(result.value);
                              setErrors(prev => ({ ...prev, protein: result.error }));
                            }}
                            onBlur={() => setErrors(prev => ({ ...prev, protein: validateHealthNumber(protein, { label: 'Protein', ...HEALTH_LIMITS.foodMacro, allowBlank: true, unit: 'g' }) }))}
                            className={`${inputStyle} health-number-input`}
                            aria-invalid={Boolean(errors.protein)}
                            aria-describedby={errors.protein ? 'food-protein-error' : undefined}
                            placeholder="Optional"
                          />
                        </Field>

                        <Field id="food-carbs" label="Carbs (g)" error={errors.carbs}>
                          <input
                            id="food-carbs"
                            type="text"
                            inputMode="decimal"
                            value={carbs}

                            onChange={e => {
                              const result = guardHealthNumberChange(carbs, e.target.value, { label: 'Carbohydrates', ...HEALTH_LIMITS.foodMacro, allowBlank: true, unit: 'g' });
                              if (!result.accepted) return setErrors(prev => ({ ...prev, carbs: result.error }));
                              setCarbs(result.value);
                              setErrors(prev => ({ ...prev, carbs: result.error }));
                            }}
                            onBlur={() => setErrors(prev => ({ ...prev, carbs: validateHealthNumber(carbs, { label: 'Carbohydrates', ...HEALTH_LIMITS.foodMacro, allowBlank: true, unit: 'g' }) }))}
                            className={`${inputStyle} health-number-input`}
                            aria-invalid={Boolean(errors.carbs)}
                            aria-describedby={errors.carbs ? 'food-carbs-error' : undefined}
                            placeholder="Optional"
                          />
                        </Field>

                        <Field id="food-fat" label="Fat (g)" error={errors.fat}>
                          <input
                            id="food-fat"
                            type="text"
                            inputMode="decimal"
                            value={fat}

                            onChange={e => {
                              const result = guardHealthNumberChange(fat, e.target.value, { label: 'Fat', ...HEALTH_LIMITS.foodMacro, allowBlank: true, unit: 'g' });
                              if (!result.accepted) return setErrors(prev => ({ ...prev, fat: result.error }));
                              setFat(result.value);
                              setErrors(prev => ({ ...prev, fat: result.error }));
                            }}
                            onBlur={() => setErrors(prev => ({ ...prev, fat: validateHealthNumber(fat, { label: 'Fat', ...HEALTH_LIMITS.foodMacro, allowBlank: true, unit: 'g' }) }))}
                            className={`${inputStyle} health-number-input`}
                            aria-invalid={Boolean(errors.fat)}
                            aria-describedby={errors.fat ? 'food-fat-error' : undefined}
                            placeholder="Optional"
                          />
                        </Field>

                        <Field id="food-sodium" label="Sodium (mg)" error={errors.sodium}>
                          <input
                            id="food-sodium"
                            type="text"
                            inputMode="numeric"
                            value={sodium}

                            onChange={e => {
                              const result = guardHealthNumberChange(sodium, e.target.value, { label: 'Sodium', ...HEALTH_LIMITS.sodium, allowBlank: true, unit: 'mg' });
                              if (!result.accepted) return setErrors(prev => ({ ...prev, sodium: result.error }));
                              setSodium(result.value);
                              setErrors(prev => ({ ...prev, sodium: result.error }));
                            }}
                            onBlur={() => setErrors(prev => ({ ...prev, sodium: validateHealthNumber(sodium, { label: 'Sodium', ...HEALTH_LIMITS.sodium, allowBlank: true, unit: 'mg' }) }))}
                            className={`${inputStyle} health-number-input`}
                            aria-invalid={Boolean(errors.sodium)}
                            aria-describedby={errors.sodium ? 'food-sodium-error' : undefined}
                            placeholder="Optional"
                          />
                        </Field>

                        <Field id="food-fiber" label="Fiber (g)" error={errors.fiber}>
                          <input
                            id="food-fiber"
                            type="text"
                            inputMode="decimal"
                            value={fiber}
                            onChange={e => {
                              const result = guardHealthNumberChange(fiber, e.target.value, { label: 'Fiber', ...HEALTH_LIMITS.foodMacro, allowBlank: true, unit: 'g' });
                              if (!result.accepted) return setErrors(prev => ({ ...prev, fiber: result.error }));
                              setFiber(result.value);
                              setErrors(prev => ({ ...prev, fiber: result.error }));
                            }}
                            onBlur={() => setErrors(prev => ({ ...prev, fiber: validateHealthNumber(fiber, { label: 'Fiber', ...HEALTH_LIMITS.foodMacro, allowBlank: true, unit: 'g' }) }))}
                            className={`${inputStyle} health-number-input`}
                            aria-invalid={Boolean(errors.fiber)}
                            aria-describedby={errors.fiber ? 'food-fiber-error' : undefined}
                            placeholder="Optional"
                          />
                        </Field>

                        <Field id="food-sugar" label="Sugar (g)" error={errors.sugar}>
                          <input
                            id="food-sugar"
                            type="text"
                            inputMode="decimal"
                            value={sugar}
                            onChange={event => {
                              const result = guardHealthNumberChange(sugar, event.target.value, { label: 'Sugar', ...HEALTH_LIMITS.foodMacro, allowBlank: true, unit: 'g' });
                              if (!result.accepted) return setErrors(prev => ({ ...prev, sugar: result.error }));
                              setSugar(result.value);
                              setErrors(prev => ({ ...prev, sugar: result.error }));
                            }}
                            onBlur={() => setErrors(prev => ({ ...prev, sugar: validateHealthNumber(sugar, { label: 'Sugar', ...HEALTH_LIMITS.foodMacro, allowBlank: true, unit: 'g' }) }))}
                            className={`${inputStyle} health-number-input`}
                            aria-invalid={Boolean(errors.sugar)}
                            aria-describedby={errors.sugar ? 'food-sugar-error' : undefined}
                            placeholder="Optional"
                          />
                        </Field>


                      </div>
                      </div>
                    </section>

                    {/* INFO CARD */}


                    {/* TEMPLATE SETTINGS */}
                    {!isSaveTemplateMode &&
                      !isEditTemplateMode &&
                      !selectedTemplate && (
                      <section className={`border-t border-border/50 pt-5 transition-colors ${createAsTemplate ? 'text-foreground' : ''}`}>
                        <label htmlFor="food-save-as-saved" className="flex min-h-11 cursor-pointer items-start gap-4 rounded-xl px-2 py-2 transition-colors hover:bg-muted/40 focus-within:bg-muted/40">
                          <Checkbox
                            id="food-save-as-saved"
                            checked={createAsTemplate}
                            onCheckedChange={checked => setCreateAsTemplate(checked === true)}
                            aria-describedby="food-save-as-saved-description"
                            className="android-meal-library-checkbox mt-0.5 size-5"
                          />

                          <div>
                            <h3 className="font-bold">
                              Save to Food Library
                            </h3>

                            <p id="food-save-as-saved-description" className="mt-1 text-sm text-muted-foreground">
                              {isEditEntryMode
                                ? 'Create or update a saved food from this meal.'
                                : 'Reuse this food later and automatically calculate calories, protein, carbs, fat, sodium, and fiber from serving size.'}
                            </p>
                          </div>
                        </label>
                      </section>
                    )}

                  </div>
                </div>
              </div>

              {/* FOOTER */}
              <div
                className="
                sticky
                bottom-0
                z-20
                flex
                flex-col
                gap-3
                border-t border-border/50
                bg-background/80
                px-4
                pt-4
                pb-[calc(1.25rem+env(safe-area-inset-bottom))]
                backdrop-blur-2xl
                sm:flex-row
                sm:items-center
                sm:justify-between
                sm:px-4
                sm:pb-4
              "
              >
                <Button
                  type="button"
                  variant="outline"
                  onClick={attemptClose}
                  className="
                  min-h-11
                  w-full
                  rounded-xl
                  px-6
                  sm:w-auto
                "
                >
                  Cancel
                </Button>

                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  {!isEditEntryMode && !isSaveTemplateMode && !isEditTemplateMode ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => saveFood(true)}
                      className="min-h-11 w-full rounded-xl px-5 sm:w-auto"
                    >
                      Add &amp; add another
                    </Button>
                  ) : null}

                  <Button
                    type="submit"
                    className="min-h-11 w-full rounded-xl px-6 font-semibold sm:w-auto"
                  >
                    {isEditTemplateMode
                      ? 'Save changes'
                      : isEditEntryMode
                        ? 'Save changes'
                        : isSaveTemplateMode
                          ? 'Save food'
                          : 'Add'}
                  </Button>
                </div>
              </div>
            </form>

            <ConfirmDialog
              isOpen={showUnsavedDialog}
              title="Discard meal changes?"
              message="You have unsaved food details. Are you sure you want to close this modal?"
              confirmText="Discard"
              cancelText="Continue editing"
              isDangerous
              onConfirm={() => {
                setShowUnsavedDialog(false);
                finishClose();
              }}
              onCancel={() => {
                setShowUnsavedDialog(false);
              }}
            />
          </div>
  );

  if (androidPresentation) {
    return (
      <CaizenBottomSheet
        open={isOpen}
          title={foodTitle}
          description="Log what you ate and track the nutrition that actually matters."
          onClose={finishClose}
          onRequestClose={canClose}
          onEscapeKeyDown={consumeFoodSuggestionEscape}
          fullHeight
      >
        {foodModalContent}
      </CaizenBottomSheet>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999]" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
      <AndroidDismissibleBackdrop
        onClose={attemptClose}
        ariaLabel="Close food form"
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
      />
      <div className="relative z-50 flex h-[min(var(--cz-vh,100dvh),100dvh)] items-end justify-center overflow-hidden p-2 sm:items-center sm:p-4">
        {foodModalContent}
      </div>
    </div>,
    document.body,
  );
}

