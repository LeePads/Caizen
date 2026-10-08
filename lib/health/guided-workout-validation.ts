import type { WorkoutExerciseCategory, WorkoutExerciseDefinition, WorkoutRoutine, WorkoutSideMode, WorkoutTargetMode } from '../types';

const TARGET_MODES = new Set<WorkoutTargetMode>(['timed', 'reps', 'hold', 'manual']);
const DIFFICULTIES = new Set(['easy', 'moderate', 'hard']);
const EXERCISE_CATEGORIES = new Set<WorkoutExerciseCategory>(['strength', 'cardio', 'stretching', 'mobility']);
const SIDE_MODES = new Set<WorkoutSideMode>(['none', 'left-right']);

export type GuidedWorkoutValidationErrors = Record<string, string>;

export function validateWorkoutExerciseDefinition(
  exercise: Partial<WorkoutExerciseDefinition>,
): GuidedWorkoutValidationErrors {
  const errors: GuidedWorkoutValidationErrors = {};
  if (!exercise.name?.trim()) errors.name = 'Exercise name is required.';
  if (exercise.name && exercise.name.trim().length > 120) errors.name = 'Exercise name must be 120 characters or fewer.';
  if (exercise.targetMode && !TARGET_MODES.has(exercise.targetMode)) errors.targetMode = 'Choose a valid target mode.';
  if (exercise.difficulty && !DIFFICULTIES.has(exercise.difficulty)) errors.difficulty = 'Choose a valid difficulty.';
  if (exercise.exerciseCategory !== undefined && !EXERCISE_CATEGORIES.has(exercise.exerciseCategory)) errors.exerciseCategory = 'Choose a valid training category.';
  if (exercise.sideMode !== undefined && !SIDE_MODES.has(exercise.sideMode)) errors.sideMode = 'Choose a valid side order.';
  if (exercise.defaultDurationSeconds !== undefined && (!Number.isInteger(exercise.defaultDurationSeconds) || exercise.defaultDurationSeconds < 0)) {
    errors.defaultDurationSeconds = 'Duration must be a non-negative whole number.';
  }
  if (exercise.defaultReps !== undefined && (!Number.isInteger(exercise.defaultReps) || exercise.defaultReps < 1)) {
    errors.defaultReps = 'Repetitions must be a positive whole number.';
  }
  if (exercise.defaultSets !== undefined && (!Number.isInteger(exercise.defaultSets) || exercise.defaultSets < 1)) {
    errors.defaultSets = 'Sets must be a positive whole number.';
  }
  if (exercise.defaultRestSeconds !== undefined && (!Number.isInteger(exercise.defaultRestSeconds) || exercise.defaultRestSeconds < 0)) {
    errors.defaultRestSeconds = 'Rest must be a non-negative whole number.';
  }
  if (exercise.referenceVideoUrl) {
    try {
      const url = new URL(exercise.referenceVideoUrl);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('invalid');
    } catch {
      errors.referenceVideoUrl = 'Tutorial links must be valid http or https URLs.';
    }
  }
  return errors;
}

export function validateWorkoutRoutine(routine: Partial<WorkoutRoutine>): GuidedWorkoutValidationErrors {
  const errors: GuidedWorkoutValidationErrors = {};
  if (!routine.name?.trim()) errors.name = 'Routine name is required.';
  if (routine.items && routine.items.length === 0) errors.items = 'Add at least one exercise before saving.';
  if (routine.rounds !== undefined && (!Number.isInteger(routine.rounds) || routine.rounds < 1)) errors.rounds = 'Rounds must be a positive whole number.';
  if (routine.defaultRestSeconds !== undefined && (!Number.isInteger(routine.defaultRestSeconds) || routine.defaultRestSeconds < 0)) errors.defaultRestSeconds = 'Rest must be a non-negative whole number.';
  if (routine.referenceVideoUrl) {
    try {
      const url = new URL(routine.referenceVideoUrl);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('invalid');
    } catch {
      errors.referenceVideoUrl = 'Tutorial links must be valid http or https URLs.';
    }
  }
  for (const item of routine.items || []) {
    if (!item.exerciseId || !item.exerciseNameSnapshot?.trim()) errors.items = 'Each routine item needs an exercise reference.';
    if (item.sets !== undefined && (!Number.isInteger(item.sets) || item.sets < 1)) errors.items = 'Sets must be a positive whole number.';
    if (item.reps !== undefined && (!Number.isInteger(item.reps) || item.reps < 1)) errors.items = 'Repetitions must be a positive whole number.';
    if (item.durationSeconds !== undefined && (!Number.isInteger(item.durationSeconds) || item.durationSeconds < 0)) errors.items = 'Durations must be non-negative whole numbers.';
    if (item.restSeconds !== undefined && (!Number.isInteger(item.restSeconds) || item.restSeconds < 0)) errors.items = 'Rest must be a non-negative whole number.';
    if (item.targetWeight !== undefined && (!Number.isFinite(item.targetWeight) || item.targetWeight < 0)) errors.items = 'Target weight must be a non-negative number.';
    if (item.warmupSets !== undefined) {
      if (!Number.isInteger(item.warmupSets) || item.warmupSets < 0) errors.items = 'Warm-up sets must be a non-negative whole number.';
      else if (item.sets !== undefined && item.warmupSets >= item.sets) errors.items = 'Warm-up sets must leave at least one working set.';
    }
  }
  return errors;
}

export function hasGuidedWorkoutValidationErrors(errors: GuidedWorkoutValidationErrors) {
  return Object.keys(errors).length > 0;
}
