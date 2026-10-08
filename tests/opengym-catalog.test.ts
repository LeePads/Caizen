import { describe, expect, it } from 'vitest';
import { mapOpenGymExercise, openGymExerciseId, type OpenGymSourceExercise } from '@/lib/health/opengym-exercise-mapper';
import { OPENGYM_WORKOUT_CATALOG, getOpenGymWorkoutExerciseBySourceId } from '@/lib/health/opengym-catalog';
import { BUILTIN_WORKOUT_CATALOG, combineWorkoutExerciseCatalog } from '@/lib/health/workout-catalog';
import { matchesWorkoutExerciseSearch } from '@/lib/health/workout-taxonomy';
import type { WorkoutExerciseDefinition } from '@/lib/types';

const sampleSource: OpenGymSourceExercise = {
  id: '0001',
  name: '3/4 sit-up',
  bodyPart: 'waist',
  equipment: 'body weight',
  instructions: 'Lie flat on your back. Curl forward. Return to start.',
  instructionSteps: ['Lie flat on your back.', 'Curl forward.', 'Return to start.'],
  muscleGroup: 'hip flexors',
  secondaryMuscles: ['hip flexors', 'lower back'],
  target: 'abs',
};

describe('mapOpenGymExercise', () => {
  it('maps a representative record into Caizen shape', () => {
    const mapped = mapOpenGymExercise(sampleSource);
    expect(mapped.name).toBe('3/4 sit-up');
    expect(mapped.category).toBe('waist');
    expect(mapped.equipment).toBe('body weight');
    expect(mapped.kind).toBe('exercise');
  });

  it('namespaces the id so it never collides with Caizen or custom ids', () => {
    const mapped = mapOpenGymExercise(sampleSource);
    expect(mapped.id).toBe('opengym-0001');
    expect(openGymExerciseId('0001')).toBe('opengym-0001');
    expect(BUILTIN_WORKOUT_CATALOG.some(exercise => exercise.id === mapped.id)).toBe(false);
  });

  it('sets provenance fields while keeping source builtin', () => {
    const mapped = mapOpenGymExercise(sampleSource);
    expect(mapped.source).toBe('builtin');
    expect(mapped.catalogSource).toBe('opengym');
    expect(mapped.catalogSourceId).toBe('0001');
  });

  it('carries the full instructions and per-step breakdown verbatim', () => {
    const mapped = mapOpenGymExercise(sampleSource);
    expect(mapped.instructions).toBe(sampleSource.instructions);
    expect(mapped.instructionSteps).toEqual(sampleSource.instructionSteps);
  });

  it('maps target to primaryMuscle and secondary_muscles to secondaryMuscles', () => {
    const mapped = mapOpenGymExercise(sampleSource);
    expect(mapped.primaryMuscle).toBe('abs');
    expect(mapped.secondaryMuscles).toEqual(['hip flexors', 'lower back']);
  });

  it('derives cardio target mode only from body area, applying the same fallback to every cardio record', () => {
    const cardio = mapOpenGymExercise({ ...sampleSource, id: '0002', bodyPart: 'cardio' });
    expect(cardio.targetMode).toBe('timed');
    expect(cardio.defaultDurationSeconds).toBe(30);
    expect(cardio.defaultReps).toBeUndefined();

    const strength = mapOpenGymExercise(sampleSource);
    expect(strength.targetMode).toBe('reps');
    expect(strength.defaultReps).toBe(10);
    expect(strength.defaultDurationSeconds).toBeUndefined();
  });

  it('leaves optional fields undefined rather than inventing values when the source has none', () => {
    const mapped = mapOpenGymExercise({ ...sampleSource, secondaryMuscles: [], instructionSteps: [] });
    expect(mapped.secondaryMuscles).toBeUndefined();
    expect(mapped.instructionSteps).toBeUndefined();
    expect(mapped.purpose).toBeUndefined();
    expect(mapped.formCues).toBeUndefined();
    expect(mapped.referencePhotoAssetId).toBeUndefined();
    expect(mapped.referenceVideoUrl).toBeUndefined();
  });
});

describe('OPENGYM_WORKOUT_CATALOG', () => {
  it('is non-empty, read-only catalog data built from the vendored dataset', () => {
    expect(OPENGYM_WORKOUT_CATALOG.length).toBeGreaterThan(1000);
    expect(OPENGYM_WORKOUT_CATALOG.every(exercise => exercise.source === 'builtin')).toBe(true);
    expect(OPENGYM_WORKOUT_CATALOG.every(exercise => exercise.catalogSource === 'opengym')).toBe(true);
  });

  it('has no id collisions with the Caizen builtin catalog', () => {
    const builtinIds = new Set(BUILTIN_WORKOUT_CATALOG.map(exercise => exercise.id));
    expect(OPENGYM_WORKOUT_CATALOG.some(exercise => builtinIds.has(exercise.id))).toBe(false);
  });

  it('looks up a known dataset record by its original source id', () => {
    const exercise = getOpenGymWorkoutExerciseBySourceId('0001');
    expect(exercise?.id).toBe('opengym-0001');
    expect(exercise?.name).toBe('3/4 sit-up');
  });
});

describe('combineWorkoutExerciseCatalog (source filtering)', () => {
  const custom: WorkoutExerciseDefinition = {
    id: 'custom-1',
    name: 'My exercise',
    kind: 'exercise',
    category: 'Core',
    equipment: 'None',
    difficulty: 'easy',
    targetMode: 'manual',
    source: 'custom',
  };

  it('concatenates Caizen built-ins, the openGym catalog, and custom exercises in that order', () => {
    const combined = combineWorkoutExerciseCatalog([custom]);
    expect(combined.length).toBe(BUILTIN_WORKOUT_CATALOG.length + OPENGYM_WORKOUT_CATALOG.length + 1);
    expect(combined.slice(0, BUILTIN_WORKOUT_CATALOG.length)).toEqual(BUILTIN_WORKOUT_CATALOG);
    expect(combined.at(-1)).toEqual(custom);
  });

  it('lets each source bucket be distinguished by source/catalogSource', () => {
    const combined = combineWorkoutExerciseCatalog([custom]);
    const caizen = combined.filter(exercise => exercise.source === 'builtin' && exercise.catalogSource !== 'opengym');
    const opengym = combined.filter(exercise => exercise.catalogSource === 'opengym');
    const mine = combined.filter(exercise => exercise.source === 'custom');
    expect(caizen.length).toBe(BUILTIN_WORKOUT_CATALOG.length);
    expect(opengym.length).toBe(OPENGYM_WORKOUT_CATALOG.length);
    expect(mine).toEqual([custom]);
  });

  it('preserves custom exercise behavior: custom records stay editable and independent of the catalogs', () => {
    const combined = combineWorkoutExerciseCatalog([custom]);
    const found = combined.find(exercise => exercise.id === 'custom-1')!;
    expect(found.source).toBe('custom');
    expect(found.catalogSource).toBeUndefined();
  });
});

describe('search against mapped openGym metadata', () => {
  it('matches on primary and secondary muscle fields', () => {
    const mapped = mapOpenGymExercise(sampleSource);
    expect(matchesWorkoutExerciseSearch(mapped, 'abs')).toBe(true);
    expect(matchesWorkoutExerciseSearch(mapped, 'lower back')).toBe(true);
    expect(matchesWorkoutExerciseSearch(mapped, 'does-not-exist')).toBe(false);
  });

  it('still matches on name, body area, equipment, and instructions', () => {
    const mapped = mapOpenGymExercise(sampleSource);
    expect(matchesWorkoutExerciseSearch(mapped, 'sit-up')).toBe(true);
    expect(matchesWorkoutExerciseSearch(mapped, 'waist')).toBe(true);
    expect(matchesWorkoutExerciseSearch(mapped, 'body weight')).toBe(true);
    expect(matchesWorkoutExerciseSearch(mapped, 'curl forward')).toBe(true);
  });
});
