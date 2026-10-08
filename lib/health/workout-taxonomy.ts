import type { WorkoutExerciseCategory, WorkoutExerciseDefinition, WorkoutLoadMode } from '../types';

export const WORKOUT_EXERCISE_CATEGORIES: readonly WorkoutExerciseCategory[] = [
  'strength',
  'cardio',
  'stretching',
  'mobility',
];

export const WORKOUT_EXERCISE_CATEGORY_LABELS: Record<WorkoutExerciseCategory, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  stretching: 'Stretching',
  mobility: 'Mobility',
};

/** Read-only legacy fallback. It deliberately does not mutate or persist the record. */
export function deriveWorkoutExerciseCategory(
  exercise: Pick<WorkoutExerciseDefinition, 'kind' | 'name' | 'category' | 'exerciseCategory'>,
): WorkoutExerciseCategory {
  if (isWorkoutExerciseCategory(exercise.exerciseCategory)) return exercise.exerciseCategory;
  if (exercise.kind === 'stretch') {
    const text = `${exercise.name} ${exercise.category}`.toLocaleLowerCase();
    return /(cat-cow|ankle|spinal|rotation|side bend|mobility|circle)/.test(text) ? 'mobility' : 'stretching';
  }
  const text = `${exercise.name} ${exercise.category}`.toLocaleLowerCase();
  return /(jump|jack|high[- ]knees|kick|climber|burpee|cardio|step-up|run|sprint)/.test(text)
    ? 'cardio'
    : 'strength';
}

export function workoutExerciseCategoryLabel(
  exercise: Pick<WorkoutExerciseDefinition, 'kind' | 'name' | 'category' | 'exerciseCategory'>,
): string {
  return WORKOUT_EXERCISE_CATEGORY_LABELS[deriveWorkoutExerciseCategory(exercise)];
}

export function matchesWorkoutExerciseSearch(
  exercise: Pick<WorkoutExerciseDefinition, 'name' | 'category' | 'equipment' | 'difficulty' | 'targetMode' | 'instructions' | 'notes' | 'kind' | 'exerciseCategory' | 'primaryMuscle' | 'secondaryMuscles'> & { id?: string },
  query: string,
): boolean {
  return workoutExerciseSearchRank(exercise, query) !== null;
}

/** Lower ranks are stronger textual matches, used only for ordering results. */
export function workoutExerciseSearchRank(
  exercise: Pick<WorkoutExerciseDefinition, 'name' | 'category' | 'equipment' | 'difficulty' | 'targetMode' | 'instructions' | 'notes' | 'kind' | 'exerciseCategory' | 'primaryMuscle' | 'secondaryMuscles'> & { id?: string },
  query: string,
): number | null {
  const normalized = query.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return 5;
  const name = exercise.name.toLocaleLowerCase().replace(/\s+/g, ' ');
  if (name === normalized) return 0;
  if (name.startsWith(normalized)) return 1;
  if (name.includes(normalized)) return 2;
  const displayName = formatWorkoutExerciseName(exercise.name, exercise.id).toLocaleLowerCase();
  if (displayName === normalized) return 0;
  if (displayName.startsWith(normalized)) return 1;
  if (displayName.includes(normalized)) return 2;
  const details = [
    exercise.name,
    workoutExerciseCategoryLabel(exercise),
    exercise.category,
    exercise.equipment,
    exercise.difficulty,
    exercise.targetMode,
    exercise.kind,
    exercise.primaryMuscle,
    ...(exercise.secondaryMuscles || []),
  ].filter(Boolean).join(' ').toLocaleLowerCase().replace(/\s+/g, ' ');
  if (details.includes(normalized)) return 3;
  const coaching = [exercise.instructions, exercise.notes].filter(Boolean).join(' ').toLocaleLowerCase().replace(/\s+/g, ' ');
  return coaching.includes(normalized) ? 4 : null;
}

/** Best-effort interpretation for legacy exercise definitions with no explicit setting. */
export function inferWorkoutLoadMode(equipment?: string, exerciseName?: string): WorkoutLoadMode | undefined {
  const equipmentValue = equipment?.trim().toLocaleLowerCase() || '';
  const nameValue = exerciseName?.trim().toLocaleLowerCase() || '';
  if (!equipmentValue && !nameValue) return undefined;
  if (equipmentValue.includes('assist') || nameValue.includes('assist')) return 'assistance';
  if (equipmentValue === 'none' || equipmentValue.includes('no equipment') || equipmentValue.includes('bodyweight') || equipmentValue.includes('body weight')) return 'none';
  return 'external';
}

export function isWorkoutExerciseCategory(value: unknown): value is WorkoutExerciseCategory {
  return typeof value === 'string' && WORKOUT_EXERCISE_CATEGORIES.includes(value as WorkoutExerciseCategory);
}

/**
 * Display-only title case for exercise/category names, e.g. "air bike" ->
 * "Air Bike". Only capitalizes the first character of each space-separated
 * word (never touching hyphen continuations, so "push-up" stays "Push-up" —
 * matching how the builtin catalog itself already styles compound names).
 * An already-capitalized or mixed-case word (an acronym, a stray capital) is
 * otherwise untouched. Never persisted — this must be applied at render
 * time, not written back onto the stored `name`, because OpenGym names are
 * also used for matching/history/search.
 */
export function formatExerciseDisplayName(name: string): string {
  if (!name) return name;
  return name
    .split(' ')
    .map(word => (word ? word.charAt(0).toLocaleUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Display-only alias for the source record describing a bicycle crunch.
 * Never rename stored/catalog records or alias unrelated air-bike exercises.
 */
export function formatWorkoutExerciseName(name: string, exerciseId?: string): string {
  return exerciseId === 'opengym-0003' && name.trim().toLocaleLowerCase() === 'air bike'
    ? 'Bicycle Crunch'
    : formatExerciseDisplayName(name);
}

/**
 * openGym's source dataset has no difficulty rating; the mapper assigns
 * every openGym exercise the same fallback value so the field type stays
 * non-optional. Filtering by difficulty must not treat that fallback as
 * real data, so openGym exercises are excluded from any active difficulty
 * filter rather than matching (or falsely failing to match) on it.
 */
export function isExerciseDifficultyFilterable(
  exercise: Pick<WorkoutExerciseDefinition, 'catalogSource'>,
): boolean {
  return exercise.catalogSource !== 'opengym';
}

/**
 * Exercise Library filter options are always derived from the exercises
 * actually available (in the current scope), never hardcoded — an option
 * that would return zero results simply doesn't appear.
 */
export function deriveAvailableTrainingCategories(
  exercises: Pick<WorkoutExerciseDefinition, 'kind' | 'name' | 'category' | 'exerciseCategory'>[],
): WorkoutExerciseCategory[] {
  return WORKOUT_EXERCISE_CATEGORIES.filter(category => exercises.some(exercise => deriveWorkoutExerciseCategory(exercise) === category));
}

export function deriveAvailableBodyAreas(exercises: Pick<WorkoutExerciseDefinition, 'category'>[]): string[] {
  return [...new Set(exercises.map(exercise => exercise.category))].sort();
}

export function deriveAvailableEquipment(exercises: Pick<WorkoutExerciseDefinition, 'equipment'>[]): string[] {
  return [...new Set(exercises.map(exercise => exercise.equipment))].sort();
}

export function deriveAvailablePrimaryMuscles(exercises: Pick<WorkoutExerciseDefinition, 'primaryMuscle'>[]): string[] {
  const values = new Map<string, string>();
  for (const exercise of exercises) {
    const muscle = exercise.primaryMuscle?.trim();
    if (muscle && !values.has(muscle.toLocaleLowerCase())) values.set(muscle.toLocaleLowerCase(), muscle);
  }
  return [...values.values()].sort((a, b) => a.localeCompare(b));
}

const TARGET_MODE_ORDER: WorkoutExerciseDefinition['targetMode'][] = ['reps', 'timed', 'hold', 'manual'];
const KIND_ORDER: WorkoutExerciseDefinition['kind'][] = ['exercise', 'stretch'];

export function deriveAvailableTargetModes(
  exercises: Pick<WorkoutExerciseDefinition, 'targetMode'>[],
): WorkoutExerciseDefinition['targetMode'][] {
  return TARGET_MODE_ORDER.filter(mode => exercises.some(exercise => exercise.targetMode === mode));
}

export function deriveAvailableKinds(
  exercises: Pick<WorkoutExerciseDefinition, 'kind'>[],
): WorkoutExerciseDefinition['kind'][] {
  return KIND_ORDER.filter(kind => exercises.some(exercise => exercise.kind === kind));
}
