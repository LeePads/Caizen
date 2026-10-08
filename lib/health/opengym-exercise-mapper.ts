import type { WorkoutExerciseDefinition } from '../types';
import { deriveWorkoutExerciseCategory, inferWorkoutLoadMode } from './workout-taxonomy';

/** Trimmed, English-only shape of an upstream openGym dataset record (see scripts/import-opengym-exercises.mjs). */
export interface OpenGymSourceExercise {
  id: string;
  name: string;
  bodyPart: string;
  equipment: string;
  instructions: string;
  instructionSteps: string[];
  muscleGroup: string;
  secondaryMuscles: string[];
  target: string;
  /** Opaque upstream media identifier (e.g. "2gPfomN"), never a URL. Used only to resolve remote animation media at runtime. */
  mediaId?: string;
}

export const OPENGYM_ID_PREFIX = 'opengym-';

export function openGymExerciseId(sourceId: string): string {
  return `${OPENGYM_ID_PREFIX}${sourceId}`;
}

/**
 * Maps one openGym dataset record into Caizen's WorkoutExerciseDefinition shape.
 *
 * Fields mapped directly from the source: name, equipment, instructions,
 * instructionSteps, and body area (bodyPart -> category). `target` (the
 * source's "primary target muscle") maps to primaryMuscle; secondaryMuscles
 * maps 1:1. The source's `muscleGroup` (a separate "primary synergist"
 * concept) has no unambiguous Caizen field and is intentionally left unmapped
 * rather than merged into either muscle field.
 *
 * Fields the source does not provide use conservative, deterministic
 * fallbacks (documented inline) rather than invented per-exercise values:
 * difficulty, defaultSets, and defaultRestSeconds always use the same
 * fallback Caizen's own builtin catalog uses; targetMode/defaultReps/
 * defaultDurationSeconds are derived only from the source's body area
 * (cardio vs. not), never guessed per exercise.
 */
export function mapOpenGymExercise(source: OpenGymSourceExercise): WorkoutExerciseDefinition {
  const isCardio = source.bodyPart === 'cardio';
  const exerciseCategory = deriveWorkoutExerciseCategory({
    kind: 'exercise',
    name: source.name,
    category: source.bodyPart,
    exerciseCategory: undefined,
  });

  return {
    id: openGymExerciseId(source.id),
    name: source.name,
    kind: 'exercise',
    category: source.bodyPart,
    exerciseCategory: isCardio ? 'cardio' : exerciseCategory,
    equipment: source.equipment,
    loadMode: inferWorkoutLoadMode(source.equipment, source.name),
    // Not provided by the source; a single conservative default, same as Caizen's own builtin catalog.
    difficulty: 'moderate',
    targetMode: isCardio ? 'timed' : 'reps',
    defaultReps: isCardio ? undefined : 10,
    defaultDurationSeconds: isCardio ? 30 : undefined,
    defaultSets: 1,
    defaultRestSeconds: 30,
    instructions: source.instructions || undefined,
    instructionSteps: source.instructionSteps.length ? source.instructionSteps : undefined,
    primaryMuscle: source.target || undefined,
    secondaryMuscles: source.secondaryMuscles.length ? source.secondaryMuscles : undefined,
    source: 'builtin',
    catalogSource: 'opengym',
    catalogSourceId: source.id,
    catalogMediaId: source.mediaId || undefined,
  };
}
