import type { WorkoutExerciseCategory, WorkoutRoutineItem, WorkoutRoutine } from '../types';
import { BUILTIN_WORKOUT_CATALOG } from './workout-catalog';
import { createWorkoutRoutineItem } from './workout-builder';

export type WorkoutRoutineTemplateId =
  | 'custom'
  | 'track-sleep'
  | 'track-breakfast'
  | 'track-lunch'
  | 'track-dinner'
  | 'daily-food-log'
  | 'workout'
  | 'stretch';

export type WorkoutRoutineTemplate = {
  id: WorkoutRoutineTemplateId;
  name: string;
  description: string;
  category: WorkoutExerciseCategory;
  exerciseIds: string[];
  rounds: number;
  defaultRestSeconds: number;
};

/** Creation presets only; IDs are never persisted in a routine record. */
export const WORKOUT_ROUTINE_TEMPLATES: readonly WorkoutRoutineTemplate[] = [
  { id: 'custom', name: 'Custom', description: 'Start with a blank routine.', category: 'strength', exerciseIds: [], rounds: 1, defaultRestSeconds: 30 },
  { id: 'track-sleep', name: 'Track Sleep', description: 'A gentle wind-down check-in.', category: 'mobility', exerciseIds: ['childs-pose', 'cat-cow'], rounds: 1, defaultRestSeconds: 0 },
  { id: 'track-breakfast', name: 'Track Breakfast', description: 'A short morning activation routine.', category: 'mobility', exerciseIds: ['standing-side-bend', 'ankle-circles'], rounds: 1, defaultRestSeconds: 0 },
  { id: 'track-lunch', name: 'Track Lunch', description: 'Reset posture and energy midday.', category: 'mobility', exerciseIds: ['shoulder-cross-body-stretch', 'standing-side-bend'], rounds: 1, defaultRestSeconds: 0 },
  { id: 'track-dinner', name: 'Track Dinner', description: 'A calm evening movement reset.', category: 'stretching', exerciseIds: ['childs-pose', 'hamstring-stretch'], rounds: 1, defaultRestSeconds: 0 },
  { id: 'daily-food-log', name: 'Complete Daily Food Log', description: 'A reminder to review your food log.', category: 'mobility', exerciseIds: [], rounds: 1, defaultRestSeconds: 0 },
  { id: 'workout', name: 'Complete Workout', description: 'A focused full-body session.', category: 'strength', exerciseIds: ['bodyweight-squat', 'incline-push-up', 'glute-bridge', 'bird-dog'], rounds: 1, defaultRestSeconds: 30 },
  { id: 'stretch', name: 'Complete Stretch', description: 'A short mobility reset.', category: 'stretching', exerciseIds: ['cat-cow', 'hamstring-stretch', 'hip-flexor-stretch'], rounds: 1, defaultRestSeconds: 0 },
];

export function getWorkoutRoutineTemplate(id: WorkoutRoutineTemplateId): WorkoutRoutineTemplate {
  return WORKOUT_ROUTINE_TEMPLATES.find(template => template.id === id) || WORKOUT_ROUTINE_TEMPLATES[0];
}

export function createRoutineFromWorkoutTemplate(
  id: WorkoutRoutineTemplateId,
  exercises = BUILTIN_WORKOUT_CATALOG,
): Pick<WorkoutRoutine, 'name' | 'description' | 'items' | 'rounds' | 'defaultRestSeconds' | 'source'> {
  const template = getWorkoutRoutineTemplate(id);
  const items: WorkoutRoutineItem[] = template.exerciseIds
    .map(exerciseId => exercises.find(exercise => exercise.id === exerciseId))
    .filter(Boolean)
    .map(exercise => createWorkoutRoutineItem(exercise!));
  return {
    name: template.id === 'custom' ? '' : template.name,
    description: template.description,
    items,
    rounds: template.rounds,
    defaultRestSeconds: template.defaultRestSeconds,
    source: 'custom',
  };
}
