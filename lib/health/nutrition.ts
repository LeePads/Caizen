import type {
  FoodEntry,
  FoodMeasurementOption,
  FoodMeasurementUnit,
  FoodNutritionSnapshot,
  FoodTemplate,
  MealTemplateFoodSnapshot,
  MealTemplateRow,
  NutritionField,
} from '../types';

export const CORE_NUTRITION_FIELDS: NutritionField[] = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'sodium',
  'fiber',
];

export const ALL_NUTRITION_FIELDS: NutritionField[] = [
  ...CORE_NUTRITION_FIELDS,
  'sugar',
];

export function getNutritionMissingFields(
  value: { nutritionMissing?: NutritionField[] } | null | undefined,
): NutritionField[] {
  if (!Array.isArray(value?.nutritionMissing)) return [];
  return ALL_NUTRITION_FIELDS.filter(field => value.nutritionMissing?.includes(field));
}

export function isNutritionFieldMissing(
  value: { nutritionMissing?: NutritionField[] } | null | undefined,
  field: NutritionField,
) {
  return getNutritionMissingFields(value).includes(field);
}

/**
 * A field is known when it has a finite value and is not explicitly marked as
 * missing. This keeps an entered numeric zero distinct from an empty field.
 */
export function isNutritionFieldKnown(
  value: { nutritionMissing?: NutritionField[] } | null | undefined,
  field: NutritionField,
) {
  if (!value || isNutritionFieldMissing(value, field)) return false;

  const rawValue = (value as Partial<Record<NutritionField, unknown>>)[field];
  if (rawValue === undefined || rawValue === null || rawValue === '') return false;

  const number = typeof rawValue === 'number'
    ? rawValue
    : typeof rawValue === 'string' && rawValue.trim()
      ? Number(rawValue)
      : Number.NaN;

  return Number.isFinite(number);
}

export function hasCompleteNutrition(
  value: { nutritionMissing?: NutritionField[] } | null | undefined,
) {
  const missing = getNutritionMissingFields(value);
  return CORE_NUTRITION_FIELDS.every(field => !missing.includes(field));
}

export function scaleFoodEntryNutrition(
  entry: FoodEntry,
  amount: number,
  originalAmount: number | null,
): FoodNutritionSnapshot | null {
  if (!Number.isFinite(amount) || amount <= 0 || !originalAmount) return null;
  const ratio = amount / originalAmount;
  return normalizeNutrition({
    calories: nonNegative(entry.calories) * ratio,
    protein: nonNegative(entry.protein) * ratio,
    carbs: nonNegative(entry.carbs) * ratio,
    fat: nonNegative(entry.fat) * ratio,
    sodium: nonNegative(entry.sodium) * ratio,
    fiber: nonNegative(entry.fiber) * ratio,
    sugar: entry.sugar === undefined ? undefined : nonNegative(entry.sugar) * ratio,
    nutritionMissing: entry.nutritionMissing,
  });
}

export const EMPTY_NUTRITION: FoodNutritionSnapshot = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  sodium: 0,
  fiber: 0,
};

const nonNegative = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

export type NutritionAggregation = {
  totals: FoodNutritionSnapshot;
  knownCounts: Record<NutritionField, number>;
};

export function normalizeNutrition(
  value: Partial<FoodNutritionSnapshot> | null | undefined,
): FoodNutritionSnapshot {
  const normalized: FoodNutritionSnapshot = {
    ...EMPTY_NUTRITION,
    ...value,
    calories: nonNegative(value?.calories),
    protein: nonNegative(value?.protein),
    carbs: nonNegative(value?.carbs),
    fat: nonNegative(value?.fat),
    sodium: nonNegative(value?.sodium),
    fiber: nonNegative(value?.fiber),
  };
  const sugarValue: unknown = value?.sugar;
  if (sugarValue !== undefined && sugarValue !== null && sugarValue !== '') {
    normalized.sugar = nonNegative(sugarValue);
  } else {
    delete normalized.sugar;
  }
  const nutritionMissing = getNutritionMissingFields(value);
  if (nutritionMissing.length) normalized.nutritionMissing = nutritionMissing;
  else delete normalized.nutritionMissing;
  return normalized;
}

export function aggregateNutrition<T extends { nutritionMissing?: NutritionField[] }>(
  values: readonly T[],
): NutritionAggregation {
  const knownCounts = Object.fromEntries(
    ALL_NUTRITION_FIELDS.map(field => [field, 0]),
  ) as Record<NutritionField, number>;

  const sumKnownField = (field: NutritionField) => values.reduce(
    (sum, value) => {
      if (!isNutritionFieldKnown(value, field)) return sum;
      knownCounts[field] += 1;
      const rawValue = (value as Partial<Record<NutritionField, unknown>>)[field];
      return sum + nonNegative(rawValue);
    },
    0,
  );

  const sugar = sumKnownField('sugar');

  const totals: FoodNutritionSnapshot = {
    calories: sumKnownField('calories'),
    protein: sumKnownField('protein'),
    carbs: sumKnownField('carbs'),
    fat: sumKnownField('fat'),
    sodium: sumKnownField('sodium'),
    fiber: sumKnownField('fiber'),
    ...(knownCounts.sugar > 0
      ? { sugar }
      : {}),
    ...(
      values.length > 0
        ? {
            nutritionMissing: ALL_NUTRITION_FIELDS.filter(field => knownCounts[field] === 0),
          }
        : {}
    ),
  };

  return {
    totals: normalizeNutrition(totals),
    knownCounts,
  };
}

export function sumNutrition(
  values: readonly FoodNutritionSnapshot[],
): FoodNutritionSnapshot {
  return aggregateNutrition(values).totals;
}

export function getMeasurementGrams(
  unit: FoodMeasurementUnit,
  options: FoodMeasurementOption[] | undefined,
): number | null {
  if (unit === 'g') return 1;
  const option = options?.find(item => item.unit === unit);
  return option?.grams && option.grams > 0 ? option.grams : null;
}

export function foodTemplateToSnapshot(
  food: FoodTemplate,
): MealTemplateFoodSnapshot {
  const baseWeightGrams = Math.max(1, nonNegative(food.referenceWeightGrams) || 100);
  return {
    name: food.name,
    baseWeightGrams,
    nutrientsPerBaseWeight: normalizeNutrition({
      calories: food.caloriesPerGram * baseWeightGrams,
      protein: food.proteinPerGram * baseWeightGrams,
      carbs: food.carbsPerGram * baseWeightGrams,
      fat: food.fatPerGram * baseWeightGrams,
      sodium: food.sodiumPerGram * baseWeightGrams,
      fiber: (food.fiberPerGram ?? 0) * baseWeightGrams,
      sugar: food.sugarPerGram === undefined ? undefined : food.sugarPerGram * baseWeightGrams,
      nutritionMissing: food.nutritionMissing,
    }),
    measurementOptions: [
      { unit: 'g', label: 'grams', grams: 1 },
      ...(food.measurementOptions || []).filter(option => option.unit !== 'g'),
    ],
  };
}

export function calculateMealRowNutrition(
  row: MealTemplateRow,
  fallbackFood?: FoodTemplate,
): FoodNutritionSnapshot {
  if (row.manualNutrition) {
    const ratio = nonNegative(row.amount) / Math.max(0.0001, nonNegative(row.manualNutritionBaseAmount || row.amount || 1));
    return normalizeNutrition({
      ...Object.fromEntries(
        Object.entries(row.manualNutrition)
          .filter(([key]) => key !== 'nutritionMissing')
          .map(([key, value]) => [key, nonNegative(value) * ratio]),
      ),
      nutritionMissing: row.manualNutrition.nutritionMissing,
    } as Partial<FoodNutritionSnapshot>);
  }

  const food = row.food || (fallbackFood ? foodTemplateToSnapshot(fallbackFood) : undefined);
  if (!food) return { ...EMPTY_NUTRITION };
  const gramsPerUnit = getMeasurementGrams(row.unit, food.measurementOptions);
  if (!gramsPerUnit) return { ...EMPTY_NUTRITION };
  const ratio = (nonNegative(row.amount) * gramsPerUnit) / Math.max(1, nonNegative(food.baseWeightGrams) || 100);
  return normalizeNutrition({
    ...Object.fromEntries(
      Object.entries(food.nutrientsPerBaseWeight)
        .filter(([key]) => key !== 'nutritionMissing')
        .map(([key, value]) => [key, nonNegative(value) * ratio]),
    ),
    nutritionMissing: food.nutrientsPerBaseWeight.nutritionMissing,
  } as Partial<FoodNutritionSnapshot>);
}

export function calculateFoodTemplateNutrition(food: FoodTemplate, amountGrams: number) {
  const grams = Math.max(0, nonNegative(amountGrams));
  return normalizeNutrition({
    calories: food.caloriesPerGram * grams,
    protein: food.proteinPerGram * grams,
    carbs: food.carbsPerGram * grams,
    fat: food.fatPerGram * grams,
    sodium: food.sodiumPerGram * grams,
    fiber: (food.fiberPerGram ?? 0) * grams,
    sugar: food.sugarPerGram === undefined ? undefined : food.sugarPerGram * grams,
    nutritionMissing: food.nutritionMissing,
  });
}
