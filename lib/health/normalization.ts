import { parseLocalDateValue, isValidLocalDateKey, toLocalDateKey } from '../date-utils';
import { createEntityId } from '../utils';
import type {
  ActivityIntensity,
  FoodMeasurementUnit,
  FoodNutritionSnapshot,
  HealthProfile,
  HealthRoutineEvidence,
  MealType,
  NutritionField,
  SleepQuality,
  WorkoutDifficulty,
  WorkoutExerciseCategory,
  WorkoutExerciseKind,
  WorkoutSideMode,
  WorkoutTargetMode,
} from '../types';
import { normalizeSleepEntryRecord } from './sleep';
import { hasInvalidFastingInterval } from './fasting';
import { normalizeExternalWebUrl } from '../native/open-link';
import { readFoodEntryMealType } from './food-entry';

type HealthRecord = Record<string, any>;

const FOOD_UNITS = new Set<FoodMeasurementUnit>([
  'g',
  'quantity',
  'tablespoon',
  'teaspoon',
  'ml',
  'serving',
  'can',
]);

const NUTRITION_FIELDS = new Set<NutritionField>([
  'calories',
  'protein',
  'carbs',
  'fat',
  'sodium',
  'fiber',
  'sugar',
]);

const normalizeNutritionMissing = (value: unknown): NutritionField[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const fields = Array.from(new Set(
    value.filter((item): item is NutritionField =>
      typeof item === 'string' && NUTRITION_FIELDS.has(item as NutritionField),
    ),
  ));
  return fields.length ? fields : undefined;
};

const ACTIVITY_INTENSITIES = new Set<ActivityIntensity>([
  'light',
  'moderate',
  'vigorous',
]);

const SLEEP_QUALITIES = new Set<SleepQuality>([
  'poor',
  'fair',
  'good',
  'great',
]);

const WORKOUT_TARGET_MODES = new Set<WorkoutTargetMode>(['timed', 'reps', 'hold', 'manual']);
const WORKOUT_DIFFICULTIES = new Set<WorkoutDifficulty>(['easy', 'moderate', 'hard']);
const WORKOUT_KINDS = new Set<WorkoutExerciseKind>(['exercise', 'stretch']);
const WORKOUT_EXERCISE_CATEGORIES = new Set<WorkoutExerciseCategory>(['strength', 'cardio', 'stretching', 'mobility']);
const WORKOUT_SIDE_MODES = new Set<WorkoutSideMode>(['none', 'left-right']);

const asRecord = (value: unknown): HealthRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as HealthRecord
    : null;

/** Structural-only normalizer. It intentionally does not inspect profile data. */
export function normalizeHealthRoutineEvidence(value: unknown): HealthRoutineEvidence | undefined {
  const item = asRecord(value);
  if (!item || typeof item.mode !== 'string') return undefined;

  if (item.mode === 'sleep-tracked' || item.mode === 'meals-complete') {
    return { mode: item.mode };
  }
  if (item.mode === 'meal-tracked' &&
      (item.meal === 'breakfast' || item.meal === 'lunch' || item.meal === 'dinner')) {
    return { mode: 'meal-tracked', meal: item.meal };
  }
  if ((item.mode === 'workout-completed' || item.mode === 'stretch-completed') &&
      (item.scope === 'any' || item.scope === 'linked-workout-routine')) {
    return { mode: item.mode, scope: item.scope };
  }
  if (item.mode === 'weight-logged' || item.mode === 'fast-completed' || item.mode === 'water-target-reached') {
    return { mode: item.mode };
  }
  return undefined;
}

const records = (value: unknown): HealthRecord[] =>
  Array.isArray(value)
    ? value.map(asRecord).filter((item): item is HealthRecord => item !== null)
    : [];

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim())
    : [];

const cloneDate = (value: Date) => new Date(value.getTime());

export function normalizeHealthNumber(value: unknown, fallback = 0): number {
  if (value === '' || value == null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeHealthNonNegative(value: unknown, fallback = 0): number {
  return Math.max(0, normalizeHealthNumber(value, fallback));
}

const normalizeHealthOptionalPositive = (value: unknown): number | undefined => {
  if (value === '' || value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const normalizeHealthOptionalNonNegative = (value: unknown): number | undefined => {
  if (value === '' || value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

const normalizeHealthOptionalMinimum = (
  value: unknown,
  minimum: number,
): number | undefined => {
  const number = normalizeHealthOptionalNonNegative(value);
  return number === undefined ? undefined : Math.max(minimum, number);
};

const normalizeHealthOptionalIntegerRange = (
  value: unknown,
  minimum: number,
  maximum?: number,
): number | undefined => {
  const number = normalizeHealthOptionalNonNegative(value);
  if (number === undefined || !Number.isInteger(number) || number < minimum) return undefined;
  return maximum === undefined || number <= maximum ? number : undefined;
};

const normalizeHealthId = (value: unknown, prefix: string): string => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return createEntityId(prefix);
};

const normalizeHealthDate = (value: unknown, fallback: Date): Date =>
  parseLocalDateValue(value as Date | string | number | null | undefined) || cloneDate(fallback);

const normalizeOptionalHealthDate = (value: unknown): Date | null =>
  parseLocalDateValue(value as Date | string | number | null | undefined);

const normalizeHealthMediaIds = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const ids = Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))));
  return ids.length ? ids : undefined;
};

const normalizeFastingSession = (value: unknown, now: Date) => {
  const item = asRecord(value) || {};
  const startedAt = normalizeHealthDate(item.startedAt, now);
  const endedAt = normalizeOptionalHealthDate(item.endedAt);
  return {
    ...item,
    id: normalizeHealthId(item.id, 'fasting-session'),
    startedAt,
    endedAt,
    targetMinutes: normalizeHealthOptionalIntegerRange(item.targetMinutes, 1, 2880),
    notes: typeof item.notes === 'string' && item.notes.trim()
      ? item.notes.trim().slice(0, 500)
      : undefined,
    createdAt: normalizeHealthDate(item.createdAt, now),
    updatedAt: normalizeOptionalHealthDate(item.updatedAt) || undefined,
  };
};

const normalizeDateKeyList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map(item => {
          if (typeof item === 'string' && isValidLocalDateKey(item)) return item;
          const date = parseLocalDateValue(item as Date | string | number | null | undefined);
          return date ? toLocalDateKey(date) : '';
        })
        .filter(Boolean),
    ),
  ).sort();
};

const normalizeHealthNutrition = (
  value: unknown,
): FoodNutritionSnapshot => {
  const record = asRecord(value) || {};
  const normalized: FoodNutritionSnapshot = {
    ...record,
    calories: normalizeHealthNonNegative(record.calories),
    protein: normalizeHealthNonNegative(record.protein),
    carbs: normalizeHealthNonNegative(record.carbs),
    fat: normalizeHealthNonNegative(record.fat),
    sodium: normalizeHealthNonNegative(record.sodium),
    fiber: normalizeHealthNonNegative(record.fiber),
  };
  if (record.sugar !== undefined && record.sugar !== null && record.sugar !== '') {
    normalized.sugar = normalizeHealthNonNegative(record.sugar);
  } else {
    delete normalized.sugar;
  }
  const nutritionMissing = normalizeNutritionMissing(record.nutritionMissing);
  if (nutritionMissing) normalized.nutritionMissing = nutritionMissing;
  else delete normalized.nutritionMissing;
  return normalized;
};

const normalizeFoodUnit = (value: unknown): FoodMeasurementUnit =>
  typeof value === 'string' && FOOD_UNITS.has(value as FoodMeasurementUnit)
    ? value as FoodMeasurementUnit
    : 'quantity';

const normalizeMeasurementOptions = (value: unknown) =>
  Array.isArray(value)
    ? records(value).map(option => ({
        ...option,
        unit: normalizeFoodUnit(option.unit),
        grams: normalizeHealthOptionalNonNegative(option.grams),
      }))
    : undefined;

const normalizeFoodTemplate = (value: unknown, now: Date) => {
  const item = asRecord(value) || {};
  const { nutritionMissing: rawNutritionMissing, ...legacyFields } = item;
  const createdAt = normalizeHealthDate(item.createdAt, now);
  const nutritionMissing = normalizeNutritionMissing(rawNutritionMissing);
  return {
    ...legacyFields,
    id: normalizeHealthId(item.id, 'food-template'),
    name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Untitled food',
    referenceWeightGrams: normalizeHealthNonNegative(item.referenceWeightGrams),
    caloriesPerGram: normalizeHealthNonNegative(item.caloriesPerGram),
    proteinPerGram: normalizeHealthNonNegative(item.proteinPerGram),
    carbsPerGram: normalizeHealthNonNegative(item.carbsPerGram),
    fatPerGram: normalizeHealthNonNegative(item.fatPerGram),
    sodiumPerGram: normalizeHealthNonNegative(item.sodiumPerGram),
    fiberPerGram: normalizeHealthNonNegative(item.fiberPerGram),
    ...(nutritionMissing ? { nutritionMissing } : {}),
    ...(item.sugarPerGram === undefined || item.sugarPerGram === null || item.sugarPerGram === ''
      ? {}
      : { sugarPerGram: normalizeHealthNonNegative(item.sugarPerGram) }),
    measurementOptions: normalizeMeasurementOptions(item.measurementOptions),
    createdAt,
  };
};

const normalizeMealRow = (value: unknown) => {
  const row = asRecord(value) || {};
  const food = asRecord(row.food);
  return {
    ...row,
    id: normalizeHealthId(row.id, 'meal-row'),
    foodId: typeof row.foodId === 'string' ? row.foodId : undefined,
    amount: normalizeHealthNonNegative(row.amount),
    unit: normalizeFoodUnit(row.unit),
    food: food
      ? {
          ...food,
          name: typeof food.name === 'string' && food.name.trim() ? food.name : 'Food',
          baseWeightGrams: normalizeHealthOptionalPositive(food.baseWeightGrams) || 100,
          nutrientsPerBaseWeight: normalizeHealthNutrition(food.nutrientsPerBaseWeight),
          measurementOptions: normalizeMeasurementOptions(food.measurementOptions) || [],
        }
      : undefined,
    manualNutrition: row.manualNutrition
      ? normalizeHealthNutrition(row.manualNutrition)
      : undefined,
    manualNutritionBaseAmount: normalizeHealthOptionalPositive(row.manualNutritionBaseAmount),
  };
};

const normalizeWorkoutPlanExercise = (value: unknown) => {
  const exercise = asRecord(value) || {};
  return {
    ...exercise,
    id: normalizeHealthId(exercise.id, 'exercise'),
    name: typeof exercise.name === 'string' && exercise.name.trim() ? exercise.name : 'Exercise',
    sets: normalizeHealthOptionalMinimum(exercise.sets, 1),
    durationMinutes: normalizeHealthOptionalNonNegative(exercise.durationMinutes),
    distanceKm: normalizeHealthOptionalNonNegative(exercise.distanceKm),
    restSeconds: normalizeHealthOptionalNonNegative(exercise.restSeconds),
  };
};

const normalizeHealthActivityIntensity = (value: unknown): ActivityIntensity | undefined =>
  typeof value === 'string' && ACTIVITY_INTENSITIES.has(value as ActivityIntensity)
    ? value as ActivityIntensity
    : undefined;

const normalizeHealthMealType = (value: unknown): MealType | undefined =>
  readFoodEntryMealType(value) || undefined;

const normalizeHealthSleepQuality = (value: unknown): SleepQuality => {
  if (value === 'okay') return 'fair';
  return typeof value === 'string' && SLEEP_QUALITIES.has(value as SleepQuality)
    ? value as SleepQuality
    : 'good';
};

const normalizeWorkoutTargetMode = (value: unknown): WorkoutTargetMode =>
  typeof value === 'string' && WORKOUT_TARGET_MODES.has(value as WorkoutTargetMode)
    ? value as WorkoutTargetMode
    : 'manual';

const normalizeWorkoutDifficulty = (value: unknown): WorkoutDifficulty =>
  typeof value === 'string' && WORKOUT_DIFFICULTIES.has(value as WorkoutDifficulty)
    ? value as WorkoutDifficulty
    : 'moderate';

const normalizeWorkoutKind = (value: unknown): WorkoutExerciseKind =>
  typeof value === 'string' && WORKOUT_KINDS.has(value as WorkoutExerciseKind)
    ? value as WorkoutExerciseKind
    : 'exercise';

const normalizeWorkoutSideMode = (value: unknown): WorkoutSideMode | undefined =>
  typeof value === 'string' && WORKOUT_SIDE_MODES.has(value as WorkoutSideMode)
    ? value as WorkoutSideMode
    : undefined;

export const normalizeWorkoutExerciseCategory = (value: unknown): WorkoutExerciseCategory | undefined =>
  typeof value === 'string' && WORKOUT_EXERCISE_CATEGORIES.has(value as WorkoutExerciseCategory)
    ? value as WorkoutExerciseCategory
    : undefined;

const normalizeWorkoutExercise = (value: unknown, now: Date) => {
  const item = asRecord(value) || {};
  const safeItem = { ...item };
  delete safeItem.referencePhotoUrl;
  delete safeItem.referenceImageUrl;
  delete safeItem.imageUrl;
  return {
    ...safeItem,
    id: normalizeHealthId(item.id, 'workout-exercise'),
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Exercise',
    kind: normalizeWorkoutKind(item.kind),
    category: typeof item.category === 'string' && item.category.trim() ? item.category.trim() : 'General',
    exerciseCategory: normalizeWorkoutExerciseCategory(item.exerciseCategory),
    equipment: typeof item.equipment === 'string' && item.equipment.trim() ? item.equipment.trim() : 'None',
    difficulty: normalizeWorkoutDifficulty(item.difficulty),
    targetMode: normalizeWorkoutTargetMode(item.targetMode),
    sideMode: normalizeWorkoutSideMode(item.sideMode),
    loadMode: item.loadMode === 'none' || item.loadMode === 'external' || item.loadMode === 'bodyweight-plus' || item.loadMode === 'assistance'
      ? item.loadMode
      : undefined,
    defaultDurationSeconds: normalizeHealthOptionalNonNegative(item.defaultDurationSeconds),
    defaultReps: normalizeHealthOptionalMinimum(item.defaultReps, 1),
    defaultSets: normalizeHealthOptionalMinimum(item.defaultSets, 1),
    defaultRestSeconds: normalizeHealthOptionalNonNegative(item.defaultRestSeconds),
    purpose: typeof item.purpose === 'string' && item.purpose.trim() ? item.purpose.trim() : undefined,
    instructions: typeof item.instructions === 'string' && item.instructions.trim() ? item.instructions.trim() : undefined,
    instructionSteps: strings(item.instructionSteps).slice(0, 4),
    formCues: strings(item.formCues).slice(0, 2),
    notes: typeof item.notes === 'string' && item.notes.trim() ? item.notes.trim() : undefined,
    catalogMediaId: typeof item.catalogMediaId === 'string' && item.catalogMediaId.trim() ? item.catalogMediaId.trim() : undefined,
    referenceVideoUrl: (() => {
      if (typeof item.referenceVideoUrl !== 'string' || !item.referenceVideoUrl.trim()) return undefined;
      try {
        const url = new URL(item.referenceVideoUrl);
        return ['http:', 'https:'].includes(url.protocol) && url.hostname ? item.referenceVideoUrl.trim() : undefined;
      } catch {
        return undefined;
      }
    })(),
    createdAt: normalizeHealthDate(item.createdAt, now),
    updatedAt: normalizeHealthDate(item.updatedAt, now),
  };
};

const normalizeWorkoutRoutineItem = (value: unknown) => {
  const item = asRecord(value) || {};
  return {
    ...item,
    id: normalizeHealthId(item.id, 'workout-routine-item'),
    exerciseId: typeof item.exerciseId === 'string' ? item.exerciseId : '',
    exerciseNameSnapshot: typeof item.exerciseNameSnapshot === 'string' && item.exerciseNameSnapshot.trim()
      ? item.exerciseNameSnapshot.trim()
      : 'Unavailable exercise',
    targetMode: item.targetMode === undefined ? undefined : normalizeWorkoutTargetMode(item.targetMode),
    durationSeconds: normalizeHealthOptionalNonNegative(item.durationSeconds),
    reps: normalizeHealthOptionalMinimum(item.reps, 1),
    targetWeight: normalizeHealthOptionalNonNegative(item.targetWeight),
    sets: normalizeHealthOptionalMinimum(item.sets, 1),
    restSeconds: normalizeHealthOptionalNonNegative(item.restSeconds),
    warmupSets: normalizeHealthOptionalNonNegative(item.warmupSets),
    supersetGroupId: typeof item.supersetGroupId === 'string' && item.supersetGroupId.trim() ? item.supersetGroupId.trim() : undefined,
    unavailableReference: item.unavailableReference === true,
  };
};

const normalizeWorkoutRoutine = (value: unknown, now: Date) => {
  const item = asRecord(value) || {};
  return {
    ...item,
    id: normalizeHealthId(item.id, 'workout-routine'),
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Untitled routine',
    source: item.source === 'custom' ? 'custom' : 'builtin',
    referencePhotoAssetId: typeof item.referencePhotoAssetId === 'string' && item.referencePhotoAssetId.trim()
      ? item.referencePhotoAssetId.trim()
      : undefined,
    referenceVideoUrl: (() => {
      if (typeof item.referenceVideoUrl !== 'string' || !item.referenceVideoUrl.trim()) return undefined;
      try {
        const url = new URL(item.referenceVideoUrl.trim());
        return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.toString() : undefined;
      } catch {
        return undefined;
      }
    })(),
    items: records(item.items).map(normalizeWorkoutRoutineItem),
    rounds: normalizeHealthOptionalMinimum(item.rounds, 1),
    defaultRestSeconds: normalizeHealthOptionalNonNegative(item.defaultRestSeconds),
    estimatedDurationMinutes: normalizeHealthOptionalNonNegative(item.estimatedDurationMinutes),
    createdAt: normalizeHealthDate(item.createdAt, now),
    updatedAt: normalizeHealthDate(item.updatedAt, now),
  };
};

const normalizeWorkoutSessionSnapshot = (value: unknown) => {
  const item = asRecord(value) || {};
  return {
    ...item,
    slotId: normalizeHealthId(item.slotId, 'workout-slot'),
    exerciseId: typeof item.exerciseId === 'string' ? item.exerciseId : undefined,
    exerciseName: typeof item.exerciseName === 'string' && item.exerciseName.trim() ? item.exerciseName.trim() : 'Exercise',
    kind: normalizeWorkoutKind(item.kind),
    targetMode: normalizeWorkoutTargetMode(item.targetMode),
    targetDurationSeconds: normalizeHealthOptionalNonNegative(item.targetDurationSeconds),
    targetReps: normalizeHealthOptionalMinimum(item.targetReps, 1),
    targetWeight: normalizeHealthOptionalNonNegative(item.targetWeight),
    loadMode: item.loadMode === 'none' || item.loadMode === 'external' || item.loadMode === 'bodyweight-plus' || item.loadMode === 'assistance'
      ? item.loadMode
      : undefined,
    setIndex: normalizeHealthNonNegative(item.setIndex),
    roundIndex: normalizeHealthNonNegative(item.roundIndex),
    status: item.status === 'completed' || item.status === 'pending' ? item.status : 'skipped',
    completedAt: normalizeOptionalHealthDate(item.completedAt) || undefined,
    warmup: item.warmup === true,
    actualReps: normalizeHealthOptionalNonNegative(item.actualReps),
    actualWeight: normalizeHealthOptionalNonNegative(item.actualWeight),
    actualDurationSeconds: normalizeHealthOptionalNonNegative(item.actualDurationSeconds),
    actualRepsLeft: normalizeHealthOptionalNonNegative(item.actualRepsLeft),
    actualRepsRight: normalizeHealthOptionalNonNegative(item.actualRepsRight),
    actualWeightLeft: normalizeHealthOptionalNonNegative(item.actualWeightLeft),
    actualWeightRight: normalizeHealthOptionalNonNegative(item.actualWeightRight),
    rir: normalizeHealthOptionalIntegerRange(item.rir, 0, 10),
    rpe: normalizeHealthOptionalIntegerRange(item.rpe, 0, 10),
  };
};

const normalizeWorkoutSession = (value: unknown, now: Date) => {
  const item = asRecord(value) || {};
  const exercises = records(item.exercises).map(record => normalizeWorkoutSessionSnapshot(record));
  const completedExerciseCount = exercises.filter(exercise => exercise.status === 'completed').length;
  return {
    ...item,
    id: normalizeHealthId(item.id, 'workout-session'),
    routineId: typeof item.routineId === 'string' ? item.routineId : undefined,
    sourceRoutineId: typeof item.sourceRoutineId === 'string' ? item.sourceRoutineId : undefined,
    routineName: typeof item.routineName === 'string' && item.routineName.trim() ? item.routineName.trim() : 'Workout',
    startedAt: normalizeHealthDate(item.startedAt, now),
    completedAt: normalizeOptionalHealthDate(item.completedAt) || undefined,
    durationMinutes: normalizeHealthOptionalNonNegative(item.durationMinutes),
    status: item.status === 'completed' ? 'completed' : 'partial',
    exercises,
    completedExerciseCount,
    totalExerciseCount: exercises.length,
    roundsCompleted: normalizeHealthNonNegative(item.roundsCompleted),
    difficulty: WORKOUT_DIFFICULTIES.has(item.difficulty as WorkoutDifficulty) ? item.difficulty : undefined,
    createdAt: normalizeHealthDate(item.createdAt, now),
  };
};

export function normalizeHealth(
  value?: Partial<HealthProfile> | null,
): HealthProfile {
  const health = asRecord(value) || {};
  const now = new Date();

  const normalizeRecordDates = (item: HealthRecord, dateKey: 'date' | 'startDate') => {
    const createdAt = normalizeHealthDate(item.createdAt, now);
    return {
      createdAt,
      date: dateKey === 'date'
        ? normalizeHealthDate(item.date, createdAt)
        : undefined,
      startDate: dateKey === 'startDate'
        ? normalizeHealthDate(item.startDate, createdAt)
        : undefined,
    };
  };

  const weightEntries = records(health.weightEntries).map(item => ({
    ...item,
    id: normalizeHealthId(item.id, 'weight'),
    weightKg: normalizeHealthNumber(item.weightKg) > 0
      ? normalizeHealthNumber(item.weightKg)
      : 0,
    ...normalizeRecordDates(item, 'date'),
  }));

  const waterEntries = records(health.waterEntries).flatMap(item => {
    const amountMl = normalizeHealthOptionalPositive(item.amountMl);
    if (amountMl === undefined) return [];
    return [{
      ...item,
      id: normalizeHealthId(item.id, 'water'),
      amountMl,
      ...normalizeRecordDates(item, 'date'),
    }];
  });

  const bodyMeasurementEntries = records(health.bodyMeasurementEntries).map(item => {
    const normalizeCm = (value: unknown) => {
      const number = normalizeHealthOptionalPositive(value);
      return number !== undefined && number <= 300 ? number : undefined;
    };
    const rawBodyFat = normalizeHealthOptionalNonNegative(item.bodyFatPercent);
    return {
      ...item,
      id: normalizeHealthId(item.id, 'body-measurement'),
      waistCm: normalizeCm(item.waistCm),
      bodyFatPercent: rawBodyFat !== undefined && rawBodyFat <= 100 ? rawBodyFat : undefined,
      chestCm: normalizeCm(item.chestCm),
      hipsCm: normalizeCm(item.hipsCm),
      upperArmCm: normalizeCm(item.upperArmCm),
      thighCm: normalizeCm(item.thighCm),
      ...normalizeRecordDates(item, 'date'),
    };
  }).filter(item => [item.waistCm, item.bodyFatPercent, item.chestCm, item.hipsCm, item.upperArmCm, item.thighCm].some(value => value !== undefined));

  const nutritionEntries = records(health.nutritionEntries).map(item => ({
    ...item,
    id: normalizeHealthId(item.id, 'nutrition'),
    calories: normalizeHealthNonNegative(item.calories),
    protein: normalizeHealthNonNegative(item.protein),
    carbs: normalizeHealthNonNegative(item.carbs),
    fat: normalizeHealthNonNegative(item.fat),
    sodium: normalizeHealthNonNegative(item.sodium),
    ...normalizeRecordDates(item, 'date'),
  }));

  const foodEntries = records(health.foodEntries).map(item => {
    const {
      mealTypeSource,
      nutritionMissing: rawNutritionMissing,
      ...legacyFields
    } = item;
    const nutritionMissing = normalizeNutritionMissing(rawNutritionMissing);
    const mealType = normalizeHealthMealType(item.mealType);
    return {
      ...legacyFields,
      id: normalizeHealthId(item.id, 'food'),
      name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Food',
      ...(mealType ? { mealType } : {}),
      ...(mealTypeSource === 'explicit' ? { mealTypeSource: 'explicit' as const } : {}),
      calories: normalizeHealthNonNegative(item.calories),
      protein: normalizeHealthNonNegative(item.protein),
      carbs: normalizeHealthNonNegative(item.carbs),
      fat: normalizeHealthNonNegative(item.fat),
      sodium: normalizeHealthNonNegative(item.sodium),
      fiber: normalizeHealthNonNegative(item.fiber),
      ...(nutritionMissing ? { nutritionMissing } : {}),
      ...(item.sugar === undefined || item.sugar === null || item.sugar === ''
        ? {}
        : { sugar: normalizeHealthNonNegative(item.sugar) }),
      amount: normalizeHealthOptionalNonNegative(item.amount),
      unit: item.unit === undefined ? undefined : normalizeFoodUnit(item.unit),
      ...normalizeRecordDates(item, 'date'),
    };
  });

  const foodTemplates = records(health.foodTemplates).map(item =>
    normalizeFoodTemplate(item, now),
  );

  const mealTemplates = records(health.mealTemplates).map(item => ({
    ...item,
    id: normalizeHealthId(item.id, 'meal-template'),
    name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Untitled meal',
    mealType: normalizeHealthMealType(item.mealType) || 'breakfast',
    rows: records(item.rows).map(normalizeMealRow),
    createdAt: normalizeHealthDate(item.createdAt, now),
  }));

  const activityEntries = records(health.activityEntries).map(item => ({
    ...item,
    id: normalizeHealthId(item.id, 'activity'),
    activity: typeof item.activity === 'string' && item.activity.trim() ? item.activity : 'Movement',
    caloriesBurned: normalizeHealthNonNegative(item.caloriesBurned),
    durationMinutes: normalizeHealthOptionalNonNegative(item.durationMinutes),
    intensity: normalizeHealthActivityIntensity(item.intensity),
    imageUrl: normalizeExternalWebUrl(item.imageUrl) || undefined,
    photoAssetIds: normalizeHealthMediaIds(item.photoAssetIds),
    ...normalizeRecordDates(item, 'date'),
  }));

  const fastingSessions = records(health.fastingSessions)
    .map(item => normalizeFastingSession(item, now))
    .filter(item => !hasInvalidFastingInterval(item));

  const workoutPlans = records(health.workoutPlans).map(item => ({
    ...item,
    id: normalizeHealthId(item.id, 'workout-plan'),
    name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Untitled workout',
    exercises: records(item.exercises).map(normalizeWorkoutPlanExercise),
    estimatedDurationMinutes: normalizeHealthOptionalNonNegative(item.estimatedDurationMinutes),
    estimatedCalories: normalizeHealthOptionalNonNegative(item.estimatedCalories),
    defaultIntensity: normalizeHealthActivityIntensity(item.defaultIntensity),
    createdAt: normalizeHealthDate(item.createdAt, now),
    updatedAt: normalizeHealthDate(item.updatedAt, now),
  }));

  const workoutExercises = records(health.workoutExercises).map(item => normalizeWorkoutExercise(item, now));
  const workoutRoutines = records(health.workoutRoutines).map(item => normalizeWorkoutRoutine(item, now));
  const workoutSessions = records(health.workoutSessions).map(item => normalizeWorkoutSession(item, now));

  const sleepEntries = records(health.sleepEntries).map(item => ({
    ...normalizeSleepEntryRecord(item),
    id: normalizeHealthId(item.id, 'sleep'),
    quality: normalizeHealthSleepQuality(item.quality),
    ...normalizeRecordDates(item, 'date'),
  }));

  const noXTrackers = records(health.noXTrackers).map(item => ({
    ...item,
    id: normalizeHealthId(item.id, 'nox'),
    name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Tracker',
    accumulatedPausedDays: normalizeHealthNonNegative(item.accumulatedPausedDays),
    ...normalizeRecordDates(item, 'startDate'),
    pausedAt: normalizeOptionalHealthDate(item.pausedAt),
    resumeDate: normalizeOptionalHealthDate(item.resumeDate),
    pauseHistory: records(item.pauseHistory).map(period => ({
      ...period,
      id: normalizeHealthId(period.id, 'streak-pause'),
      pausedAt: normalizeHealthDate(period.pausedAt, now),
      resumedAt: normalizeOptionalHealthDate(period.resumedAt),
    })),
    resetHistory: records(item.resetHistory).map(reset => ({
      ...reset,
      resetAt: normalizeHealthDate(reset.resetAt, now),
      previousStartDate: normalizeHealthDate(reset.previousStartDate, now),
      previousDays: normalizeHealthNonNegative(reset.previousDays),
    })),
    // Missing and malformed legacy values retain the historical projection.
    showMilestonesInCalendar: item.showMilestonesInCalendar !== false,
    updatedAt: normalizeOptionalHealthDate(item.updatedAt) || undefined,
  }));

  const rawVapeTracker = asRecord(health.vapeTracker) || {};

  return {
    ...health,
    heightCm: normalizeHealthOptionalPositive(health.heightCm),
    targetCalories: normalizeHealthOptionalPositive(health.targetCalories),
    maintenanceCalories: normalizeHealthOptionalPositive(health.maintenanceCalories),
    targetProtein: normalizeHealthOptionalPositive(health.targetProtein),
    targetCarbs: normalizeHealthOptionalPositive(health.targetCarbs),
    targetFat: normalizeHealthOptionalPositive(health.targetFat),
    targetFiber: normalizeHealthOptionalPositive(health.targetFiber),
    sugarLimit: normalizeHealthOptionalPositive(health.sugarLimit),
    targetWaterMl: normalizeHealthOptionalPositive(health.targetWaterMl),
    sodiumLimitMg: normalizeHealthOptionalPositive(health.sodiumLimitMg),
    targetWeightKg: normalizeHealthOptionalPositive(health.targetWeightKg),
    sleepTargetMinutes: normalizeHealthOptionalIntegerRange(health.sleepTargetMinutes, 1, 1440),
    targetExerciseMinutesPerWeek: normalizeHealthOptionalIntegerRange(health.targetExerciseMinutesPerWeek, 1),
    vapeTracker: {
      ...rawVapeTracker,
      quitDate: normalizeOptionalHealthDate(rawVapeTracker.quitDate),
      dailySpendBefore: normalizeHealthNonNegative(rawVapeTracker.dailySpendBefore),
    },
    weightEntries,
    waterEntries,
    bodyMeasurementEntries,
    nutritionEntries,
    foodEntries,
    foodLogCompletedDates: normalizeDateKeyList(health.foodLogCompletedDates),
    foodLogExcludedDates: normalizeDateKeyList(health.foodLogExcludedDates),
    foodTemplates,
    mealTemplates,
    favoriteFoodTemplateIds: Array.from(
      new Set(
        Array.isArray(health.favoriteFoodTemplateIds)
          ? health.favoriteFoodTemplateIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          : [],
      ),
    ),
    favoriteMealTemplateIds: Array.from(
      new Set(
        Array.isArray(health.favoriteMealTemplateIds)
          ? health.favoriteMealTemplateIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          : [],
      ),
    ),
    favoriteWorkoutExerciseIds: Array.from(
      new Set(
        Array.isArray(health.favoriteWorkoutExerciseIds)
          ? health.favoriteWorkoutExerciseIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map(id => id.trim())
          : [],
      ),
    ),
    activityEntries,
    fastingSessions,
    workoutPlans,
    workoutExercises,
    workoutRoutines,
    workoutSessions,
    sleepEntries,
    noXTrackers,
  } as unknown as HealthProfile;
}
