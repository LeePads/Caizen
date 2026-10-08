import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('Health routine create-flow regression', () => {
  const workspace = read('components/health/WorkoutWorkspace.tsx');

  it('preserves the complete routine draft while creating a custom exercise', () => {
    expect(workspace).toContain('type RoutineBuilderDraft = {');
    expect(workspace).toContain('initialDraft?: RoutineBuilderDraft;');
    expect(workspace).toContain('onCreateExercise?: (draft: RoutineBuilderDraft) => void;');
    expect(workspace).toContain('setRoutineDraft(draft);');
    expect(workspace).toContain('setRoutineDraft(current => current ? { ...current, items: appendRoutineDraftExercise(current.items, savedExercise) } : current);');
    expect(workspace).toContain('initialDraft={routineDraft}');
  });

  it('keeps routine and exercise saves as separate, non-duplicating writes', () => {
    expect(workspace).toContain('if (existingId) context.updateWorkoutRoutine(existingId, routineData);');
    expect(workspace).toContain('savedRoutineId = context.addWorkoutRoutine({ ...routineData, ...(id ? { id } : {}) });');
    expect(workspace).toContain('else {\n      savedExerciseId = context.addWorkoutExercise(exercise);\n    }');
    expect(workspace).toContain('setRoutineDraft(undefined);');
  });
});
