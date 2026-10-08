import type { WorkoutPlanExercise } from '../types';
import {
  validateHealthNumber,
  validateHealthReps,
  validateHealthText,
} from './validation';

export type WorkoutPlanValidationInput = {
  name: string;
  description: string;
  estimatedDurationMinutes: string;
  estimatedCalories: string;
  exercises: WorkoutPlanExercise[];
};

export type WorkoutPlanValidationErrors = {
  form?: string;
  name?: string;
  description?: string;
  estimatedDurationMinutes?: string;
  estimatedCalories?: string;
  exercises?: string;
  exercise: Record<string, string>;
};

export function validateWorkoutPlanDraft(input: WorkoutPlanValidationInput): WorkoutPlanValidationErrors {
  const errors: WorkoutPlanValidationErrors = { exercise: {} };
  errors.name = validateHealthText(input.name, { label: 'Plan name', maxLength: 120, required: true });
  errors.description = validateHealthText(input.description, { label: 'Description', maxLength: 500, mode: 'multiline' });
  errors.estimatedDurationMinutes = validateHealthNumber(input.estimatedDurationMinutes, {
    label: 'Estimated minutes', min: 0, max: 1440, integer: true, allowBlank: true,
  });
  errors.estimatedCalories = validateHealthNumber(input.estimatedCalories, {
    label: 'Estimated calories', min: 0, max: 10000, integer: true, allowBlank: true,
  });
  if (!input.exercises.some(exercise => exercise.name.trim())) errors.exercises = 'Add at least one named exercise.';

  input.exercises.forEach(exercise => {
    const nameError = validateHealthText(exercise.name, { label: 'Exercise name', maxLength: 100 });
    if (nameError) errors.exercise[`${exercise.id}.name`] = nameError;
    if (exercise.sets !== undefined && (!Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 100)) errors.exercise[`${exercise.id}.sets`] = 'Sets must be a whole number from 1 to 100.';
    if (exercise.restSeconds !== undefined && (!Number.isInteger(exercise.restSeconds) || exercise.restSeconds < 0 || exercise.restSeconds > 3600)) errors.exercise[`${exercise.id}.restSeconds`] = 'Rest must be from 0 to 3,600 seconds.';
    if (exercise.durationMinutes !== undefined && (!Number.isInteger(exercise.durationMinutes) || exercise.durationMinutes < 0 || exercise.durationMinutes > 1440)) errors.exercise[`${exercise.id}.durationMinutes`] = 'Minutes must be from 0 to 1,440.';
    const repsError = validateHealthReps(exercise.reps || '');
    if (repsError) errors.exercise[`${exercise.id}.reps`] = repsError;
  });
  return errors;
}

export function hasWorkoutPlanValidationErrors(errors: WorkoutPlanValidationErrors) {
  return Boolean(errors.name || errors.description || errors.estimatedDurationMinutes || errors.estimatedCalories || errors.exercises || Object.keys(errors.exercise).length);
}
