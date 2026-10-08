import { createEntityId } from '../utils';
import type { WorkoutExerciseDefinition, WorkoutRoutine, WorkoutRoutineItem } from '../types';

export function getWorkoutRoutineNotes(routine?: Pick<WorkoutRoutine, 'description' | 'notes'> | null): string {
  if (!routine) return '';
  const notes = routine.notes?.trim() || '';
  const description = routine.description?.trim() || '';
  if (!notes) return description;
  if (!description || notes === description) return notes;
  return `${notes}\n\n${description}`;
}

export function serializeWorkoutRoutineNotes(
  notes: string,
  existing?: Pick<WorkoutRoutine, 'description'> | null,
): Pick<WorkoutRoutine, 'description' | 'notes'> {
  const value = notes.trim();
  if (!value) return { notes: undefined, description: undefined };
  return {
    notes: value,
    description: existing?.description?.trim() ? value : undefined,
  };
}

export const createWorkoutRoutineItem = (exercise: WorkoutExerciseDefinition): WorkoutRoutineItem => ({
  id: createEntityId('workout-routine-item'),
  exerciseId: exercise.id,
  exerciseNameSnapshot: exercise.name,
  targetMode: exercise.targetMode,
  durationSeconds: exercise.defaultDurationSeconds,
  reps: exercise.defaultReps,
  sets: exercise.defaultSets || 1,
  // Left undefined so the routine/exercise default rest fallback applies until overridden.
});

export const appendRoutineDraftExercise = (
  items: WorkoutRoutineItem[],
  exercise: WorkoutExerciseDefinition,
) => [...items, createWorkoutRoutineItem(exercise)];

/**
 * Maps selected exercise ids from the Exercise Library into routine items,
 * preserving the Set's selection order and ignoring duplicate or unavailable ids.
 * Exercise Library selection is purely by id, so this is the single place
 * that turns a selection back into concrete routine items for the existing
 * Routine Builder — no second routine-building implementation.
 */
export const selectedExercisesToRoutineItems = (
  exercises: WorkoutExerciseDefinition[],
  selectedExerciseIds: ReadonlySet<string>,
): WorkoutRoutineItem[] => {
  const byId = new Map<string, WorkoutExerciseDefinition>();
  exercises.forEach(exercise => {
    if (!byId.has(exercise.id)) byId.set(exercise.id, exercise);
  });
  const seen = new Set<string>();
  const selected: WorkoutExerciseDefinition[] = [];
  selectedExerciseIds.forEach(id => {
    if (seen.has(id)) return;
    seen.add(id);
    const exercise = byId.get(id);
    if (exercise) selected.push(exercise);
  });
  return selected.map(createWorkoutRoutineItem);
};
