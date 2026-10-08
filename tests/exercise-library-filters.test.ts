import { describe, expect, it } from 'vitest';
import {
  deriveAvailableBodyAreas,
  deriveAvailableEquipment,
  deriveAvailableKinds,
  deriveAvailableTargetModes,
  deriveAvailableTrainingCategories,
  deriveWorkoutExerciseCategory,
  formatExerciseDisplayName,
} from '@/lib/health/workout-taxonomy';
import { OPENGYM_CURATED_WORKOUT_CATALOG } from '@/lib/health/opengym-catalog';
import { BUILTIN_WORKOUT_CATALOG } from '@/lib/health/workout-catalog';
import type { WorkoutExerciseDefinition } from '@/lib/types';

const stretch: WorkoutExerciseDefinition = {
  id: 'stretch-1',
  name: 'Neck stretch',
  kind: 'stretch',
  category: 'Neck',
  equipment: 'None',
  difficulty: 'easy',
  targetMode: 'hold',
  source: 'builtin',
};
const bandExercise: WorkoutExerciseDefinition = {
  id: 'band-1',
  name: 'Band row',
  kind: 'exercise',
  category: 'Back',
  equipment: 'Resistance band',
  difficulty: 'moderate',
  targetMode: 'reps',
  source: 'custom',
};

describe('dynamic Exercise Library filter options', () => {
  it('never returns a training category with zero matching exercises', () => {
    const pool = [bandExercise, stretch];
    const categories = deriveAvailableTrainingCategories(pool);
    categories.forEach(category => {
      expect(pool.some(exercise => deriveWorkoutExerciseCategory(exercise) === category)).toBe(true);
    });
    expect(deriveAvailableTrainingCategories([bandExercise])).not.toContain('stretching');
    expect(deriveAvailableTrainingCategories([bandExercise])).not.toContain('mobility');
  });

  it('includes stretching only when a stretch is actually present', () => {
    expect(deriveAvailableTrainingCategories([bandExercise])).not.toContain('stretching');
    expect(deriveAvailableTrainingCategories([bandExercise, stretch])).toContain('stretching');
  });

  it('derives body areas only from the given exercises, sorted', () => {
    expect(deriveAvailableBodyAreas([bandExercise, stretch])).toEqual(['Back', 'Neck']);
    expect(deriveAvailableBodyAreas([bandExercise])).toEqual(['Back']);
    expect(deriveAvailableBodyAreas([])).toEqual([]);
  });

  it('derives equipment only from the given exercises, sorted, without duplicates', () => {
    expect(deriveAvailableEquipment([bandExercise, bandExercise, stretch])).toEqual(['None', 'Resistance band']);
  });

  it('derives target modes in a stable canonical order, omitting absent modes', () => {
    expect(deriveAvailableTargetModes([bandExercise])).toEqual(['reps']);
    expect(deriveAvailableTargetModes([bandExercise, stretch])).toEqual(['reps', 'hold']);
    expect(deriveAvailableTargetModes([])).toEqual([]);
  });

  it('derives kinds in canonical order, omitting absent kinds', () => {
    expect(deriveAvailableKinds([bandExercise])).toEqual(['exercise']);
    expect(deriveAvailableKinds([stretch])).toEqual(['stretch']);
    expect(deriveAvailableKinds([bandExercise, stretch])).toEqual(['exercise', 'stretch']);
  });

  it('scopes correctly for the real curated openGym catalog (exercises only, no stretches)', () => {
    expect(deriveAvailableKinds(OPENGYM_CURATED_WORKOUT_CATALOG)).toEqual(['exercise']);
    expect(deriveAvailableBodyAreas(OPENGYM_CURATED_WORKOUT_CATALOG).length).toBeGreaterThan(1);
  });

  it('scopes correctly for the real Caizen builtin catalog, which does include stretches', () => {
    expect(deriveAvailableKinds(BUILTIN_WORKOUT_CATALOG)).toEqual(['exercise', 'stretch']);
  });

  it('title-cases exercise names for display, preserving the catalog\'s own hyphen style (e.g. "Push-up")', () => {
    expect(formatExerciseDisplayName('air bike')).toBe('Air Bike');
    expect(formatExerciseDisplayName('barbell bench press')).toBe('Barbell Bench Press');
    expect(formatExerciseDisplayName('barbell bent over row')).toBe('Barbell Bent Over Row');
    expect(formatExerciseDisplayName('3/4 sit-up')).toBe('3/4 Sit-up');
    expect(formatExerciseDisplayName('45° side bend')).toBe('45° Side Bend');
    expect(formatExerciseDisplayName('Push-up')).toBe('Push-up');
    expect(formatExerciseDisplayName('')).toBe('');
  });
});
