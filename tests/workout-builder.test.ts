import { describe, expect, it } from 'vitest';
import { appendRoutineDraftExercise, getWorkoutRoutineNotes, selectedExercisesToRoutineItems, serializeWorkoutRoutineNotes } from '@/lib/health/workout-builder';
import { createRoutineFromWorkoutTemplate, WORKOUT_ROUTINE_TEMPLATES } from '@/lib/health/workout-templates';
import { BUILTIN_WORKOUT_CATALOG } from '@/lib/health/workout-catalog';
import type { WorkoutExerciseDefinition, WorkoutRoutineItem } from '@/lib/types';

describe('workout routine draft transitions', () => {
  it('preserves existing draft items and makes the newly created exercise available', () => {
    const existing: WorkoutRoutineItem = {
      id: 'existing-item',
      exerciseId: 'push-up',
      exerciseNameSnapshot: 'Push-up',
      targetMode: 'reps',
      reps: 10,
      sets: 2,
    };
    const newExercise: WorkoutExerciseDefinition = {
      id: 'custom-movement',
      name: 'Custom movement',
      kind: 'exercise',
      category: 'Core',
      equipment: 'Mat',
      difficulty: 'moderate',
      targetMode: 'timed',
      defaultDurationSeconds: 30,
      defaultSets: 1,
      defaultRestSeconds: 20,
      source: 'custom',
    };

    const next = appendRoutineDraftExercise([existing], newExercise);

    expect(next).toHaveLength(2);
    expect(next[0]).toBe(existing);
    expect(next[1]).toMatchObject({
      exerciseId: 'custom-movement',
      exerciseNameSnapshot: 'Custom movement',
      targetMode: 'timed',
    });
  });

  it('keeps legacy routine description text when the visible Notes field is used', () => {
    expect(getWorkoutRoutineNotes({ description: 'Legacy description', notes: 'Personal note' })).toBe('Personal note\n\nLegacy description');
    expect(serializeWorkoutRoutineNotes('Updated notes', { description: 'Legacy description' })).toEqual({ notes: 'Updated notes', description: 'Updated notes' });
    expect(serializeWorkoutRoutineNotes('')).toEqual({ notes: undefined, description: undefined });
  });

  it('keeps template presets creation-only and editable', () => {
    expect(WORKOUT_ROUTINE_TEMPLATES.map(template => template.name)).toContain('Custom');
    const preset = createRoutineFromWorkoutTemplate('workout');
    expect(preset.source).toBe('custom');
    expect(preset.items.length).toBeGreaterThan(0);
    expect('id' in preset).toBe(false);
  });
});

describe('selectedExercisesToRoutineItems (Exercise Library -> Routine Builder)', () => {
  it('maps only the selected exercise ids, in selection order, into routine items', () => {
    const [first, second, third] = BUILTIN_WORKOUT_CATALOG;
    const items = selectedExercisesToRoutineItems(BUILTIN_WORKOUT_CATALOG, new Set([third.id, first.id]));
    expect(items.map(item => item.exerciseId)).toEqual([third.id, first.id]);
    expect(items.every(item => item.id)).toBe(true);
    expect(items.map(item => item.exerciseId)).not.toContain(second.id);
  });

  it('returns an empty array when nothing is selected', () => {
    expect(selectedExercisesToRoutineItems(BUILTIN_WORKOUT_CATALOG, new Set())).toEqual([]);
  });

  it('ignores selected ids that no longer exist in the exercise pool', () => {
    const items = selectedExercisesToRoutineItems(BUILTIN_WORKOUT_CATALOG, new Set(['does-not-exist', BUILTIN_WORKOUT_CATALOG[0].id]));
    expect(items).toHaveLength(1);
    expect(items[0].exerciseId).toBe(BUILTIN_WORKOUT_CATALOG[0].id);
  });

  it('carries each selected exercise\'s own targets into the routine item, same as the single-exercise path', () => {
    const exercise = BUILTIN_WORKOUT_CATALOG.find(item => item.targetMode === 'reps')!;
    const [item] = selectedExercisesToRoutineItems(BUILTIN_WORKOUT_CATALOG, new Set([exercise.id]));
    expect(item.reps).toBe(exercise.defaultReps);
    expect(item.sets).toBe(exercise.defaultSets || 1);
    expect(item.exerciseNameSnapshot).toBe(exercise.name);
  });
});
