import type { WorkoutExerciseDefinition } from '../types';
import openGymExerciseData from './data/opengym-exercises.json';
import { mapOpenGymExercise, openGymExerciseId, type OpenGymSourceExercise } from './opengym-exercise-mapper';
import { isCuratedOpenGymExerciseId } from './opengym-curated-ids';

/**
 * Normalized, read-only openGym exercise catalog (metadata + instructions
 * only — no bundled media). Vendored via scripts/import-opengym-exercises.mjs
 * from https://github.com/hasaneyldrm/exercises-dataset (MIT-licensed text).
 *
 * This is the full, unabridged catalog (~1,324 exercises) and stays intact
 * so existing routines/history/exercise lookups that reference any openGym
 * exercise keep resolving. It is not what the Exercise Library browses by
 * default — see OPENGYM_CURATED_WORKOUT_CATALOG for that.
 */
export const OPENGYM_WORKOUT_CATALOG: WorkoutExerciseDefinition[] = (
  openGymExerciseData as OpenGymSourceExercise[]
).map(mapOpenGymExercise);

/** The curated subset presented by default in the Exercise Library. See opengym-curated-ids.ts for selection method. */
export const OPENGYM_CURATED_WORKOUT_CATALOG: WorkoutExerciseDefinition[] = OPENGYM_WORKOUT_CATALOG.filter(
  exercise => isCuratedOpenGymExerciseId(exercise.id),
);

export function getOpenGymWorkoutExercise(id: string) {
  return OPENGYM_WORKOUT_CATALOG.find(exercise => exercise.id === id);
}

export function getOpenGymWorkoutExerciseBySourceId(sourceId: string) {
  return getOpenGymWorkoutExercise(openGymExerciseId(sourceId));
}
