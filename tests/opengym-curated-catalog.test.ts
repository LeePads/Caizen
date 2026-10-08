import { describe, expect, it } from 'vitest';
import { OPENGYM_CURATED_EXERCISE_IDS, OPENGYM_CURATED_SOURCE_IDS, isCuratedOpenGymExerciseId } from '@/lib/health/opengym-curated-ids';
import { OPENGYM_CURATED_WORKOUT_CATALOG, OPENGYM_WORKOUT_CATALOG, getOpenGymWorkoutExerciseBySourceId } from '@/lib/health/opengym-catalog';
import { isExerciseDifficultyFilterable } from '@/lib/health/workout-taxonomy';
import type { WorkoutExerciseDefinition } from '@/lib/types';

describe('OPENGYM_CURATED_SOURCE_IDS', () => {
  it('targets roughly 100 exercises', () => {
    expect(OPENGYM_CURATED_SOURCE_IDS.length).toBeGreaterThanOrEqual(90);
    expect(OPENGYM_CURATED_SOURCE_IDS.length).toBeLessThanOrEqual(110);
  });

  it('has no duplicate ids', () => {
    expect(new Set(OPENGYM_CURATED_SOURCE_IDS).size).toBe(OPENGYM_CURATED_SOURCE_IDS.length);
  });

  it('every id resolves to a real, mapped catalog exercise with a media id', () => {
    OPENGYM_CURATED_SOURCE_IDS.forEach(sourceId => {
      const exercise = getOpenGymWorkoutExerciseBySourceId(sourceId);
      expect(exercise, `missing mapped exercise for source id ${sourceId}`).toBeDefined();
      expect(exercise?.catalogMediaId, `missing catalogMediaId for ${sourceId}`).toBeTruthy();
    });
  });
});

describe('OPENGYM_CURATED_WORKOUT_CATALOG', () => {
  it('is the curated subset, not the full dataset', () => {
    expect(OPENGYM_CURATED_WORKOUT_CATALOG.length).toBe(OPENGYM_CURATED_SOURCE_IDS.length);
    expect(OPENGYM_CURATED_WORKOUT_CATALOG.length).toBeLessThan(OPENGYM_WORKOUT_CATALOG.length);
  });

  it('does not shrink the full openGym catalog', () => {
    expect(OPENGYM_WORKOUT_CATALOG.length).toBe(1324);
  });

  it('covers every openGym body area present in the full dataset', () => {
    const fullBodyParts = new Set(OPENGYM_WORKOUT_CATALOG.map(exercise => exercise.category));
    const curatedBodyParts = new Set(OPENGYM_CURATED_WORKOUT_CATALOG.map(exercise => exercise.category));
    expect(curatedBodyParts).toEqual(fullBodyParts);
  });

  it('spans more than one equipment type', () => {
    const equipment = new Set(OPENGYM_CURATED_WORKOUT_CATALOG.map(exercise => exercise.equipment));
    expect(equipment.size).toBeGreaterThan(3);
  });

  it('every curated exercise is flagged as curated by isCuratedOpenGymExerciseId', () => {
    OPENGYM_CURATED_WORKOUT_CATALOG.forEach(exercise => {
      expect(isCuratedOpenGymExerciseId(exercise.id)).toBe(true);
    });
  });

  it('a non-curated openGym exercise is not flagged as curated but still resolves in the full catalog', () => {
    const nonCurated = OPENGYM_WORKOUT_CATALOG.find(exercise => !OPENGYM_CURATED_EXERCISE_IDS.has(exercise.id));
    expect(nonCurated).toBeDefined();
    expect(isCuratedOpenGymExerciseId(nonCurated!.id)).toBe(false);
    expect(OPENGYM_WORKOUT_CATALOG.some(exercise => exercise.id === nonCurated!.id)).toBe(true);
  });
});

describe('isExerciseDifficultyFilterable', () => {
  const openGymExercise: Pick<WorkoutExerciseDefinition, 'catalogSource'> = { catalogSource: 'opengym' };
  const caizenExercise: Pick<WorkoutExerciseDefinition, 'catalogSource'> = { catalogSource: undefined };
  const customExercise: Pick<WorkoutExerciseDefinition, 'catalogSource'> = { catalogSource: undefined };

  it('excludes openGym exercises, which have no real source difficulty data', () => {
    expect(isExerciseDifficultyFilterable(openGymExercise)).toBe(false);
  });

  it('includes Caizen and custom exercises, whose difficulty is real/user-set', () => {
    expect(isExerciseDifficultyFilterable(caizenExercise)).toBe(true);
    expect(isExerciseDifficultyFilterable(customExercise)).toBe(true);
  });
});
