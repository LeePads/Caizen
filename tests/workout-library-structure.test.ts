import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { getBuiltinWorkoutReferenceImage } from '@/lib/health/workout-media';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('Workout library structure', () => {
  const workspace = read('components/health/WorkoutWorkspace.tsx');
  const media = read('components/health/WorkoutReferenceMedia.tsx');
  const runner = read('components/health/WorkoutRunner.tsx');
  const healthSection = read('components/sections/HealthSection.tsx');
  const taxonomy = read('lib/health/workout-taxonomy.ts');
  const contextSource = read('lib/context.tsx');

  it('uses stable offline paths for predefined exercise reference images', () => {
    expect(getBuiltinWorkoutReferenceImage('cat-cow')).toBe('/workout-references/cat-cow.png');
    expect(getBuiltinWorkoutReferenceImage('push-up')).toBe('/workout-references/push-up.png');
  });

  it('keeps the personal workout and exercise collection actions explicit', () => {
    expect(workspace).toContain("useState<WorkoutView>('today')");
    expect(workspace).toContain("useState<ExerciseScope>('caizen')");
    expect(workspace).toContain("['today', 'Today', Sparkles]");
    expect(workspace).toContain("['mine', 'My Exercises'");
    expect(workspace).toContain("['mine', 'My Workouts'");
    expect(workspace).toContain("['starter', 'Starter Workouts'");
    expect(workspace).toContain('My Workouts');
    expect(workspace).toContain('Copy &amp; edit');
    expect(workspace).toContain('Save to My Workouts');
    expect(workspace).toContain("scope === 'mine'");
    expect(workspace).toContain('variant="card"');
    expect(workspace).toContain('routine.referencePhotoAssetId');
    expect(workspace).toContain('copyMode ? createEntityId');
    expect(healthSection).toContain("compactMobileMode && activeTab === 'food'");
    expect(runner).toContain('variant="stage"');
    expect(media).toContain('referencePhotoAssetId && !photoError');
    expect(media).toContain('canUseAnimation ? animationUrl!');
    expect(media).toContain('aria-controls');
    expect(media).toContain('Reference photo coming soon');
    expect(media).toContain('Reference photo unavailable');
  });

  it('makes Exercises a primary Workout nav destination, not a buried sub-tab', () => {
    expect(workspace).toContain("['today', 'Today', Sparkles], ['routines', 'Routines', Library], ['history', 'History', History], ['library', 'Exercises', Dumbbell]");
    expect(workspace).toContain("onClick={() => setView('library')}");
  });

  it('hides exercise scope-tab counts and only shows a result count while searching/filtering', () => {
    expect(workspace).toContain("[['all', 'All'], ['caizen', 'Caizen'], ['mine', 'My Exercises']]");
    expect(workspace).toContain('searchOrFilterActive');
  });

  it('adds a Create Routine entry point and multi-select action bar to the Exercise Library', () => {
    expect(workspace).toContain('Create Routine');
    expect(workspace).toContain('selectedExerciseIds.size > 0');
    expect(workspace).toContain('selectedExercisesToRoutineItems');
    expect(workspace).toContain('onToggleSelect');
  });

  it('derives Exercise Library filter options dynamically instead of hardcoding them', () => {
    expect(workspace).toContain('deriveAvailableTrainingCategories');
    expect(workspace).toContain('deriveAvailableBodyAreas');
    expect(workspace).toContain('trainingCategoryOptions');
    expect(workspace).toContain('showBodyAreaFilter');
  });

  it('improves the zero-result empty state with a clear-filters recovery action', () => {
    expect(workspace).toContain('No exercises found');
    expect(workspace).toContain('Try removing a filter or changing your search.');
  });

  it('merges the OpenGym curated set into the user-facing Caizen scope instead of its own tab', () => {
    expect(workspace).toContain("type ExerciseScope = 'all' | 'caizen' | 'mine';");
    expect(workspace).not.toMatch(/\['opengym', 'OpenGym'\]/);
    expect(workspace).toContain("if (scope === 'caizen') return exercise.source === 'builtin';");
  });

  it('uses accessible selects for Equipment and Target in the Exercise Library', () => {
    expect(workspace).toContain('label="Filter by equipment"');
    expect(workspace).toContain('label="Filter by target"');
    expect(workspace).toContain("label: 'All equipment'");
    expect(workspace).toContain("label: 'All targets'");
  });

  it('keeps exercise creation and filters ahead of the result cards', () => {
    const createBandIndex = workspace.indexOf('Create Exercise');
    const resultsIndex = workspace.indexOf('primaryPageItems.map(exercise =>');
    const equipmentBandIndex = workspace.indexOf('label="Filter by equipment"');
    expect(equipmentBandIndex).toBeGreaterThan(0);
    expect(createBandIndex).toBeGreaterThan(0);
    expect(resultsIndex).toBeGreaterThan(createBandIndex);
  });

  it('gives exercise cards a large, uncropped, contain-fit media region instead of a small square', () => {
    expect(media).toContain('w-full object-contain');
    expect(media).toContain("isShowingAnimation ? 'object-contain' : 'object-cover'");
  });

  it('caps Workout Runner hero media height on mobile while giving it real desktop presence', () => {
    const styles = read('styles/workout-session.css');
    expect(styles).toContain('height: clamp(9rem, 24dvh, 15rem)');
    expect(styles).toContain('height: clamp(15rem, 42dvh, 28rem)');
    expect(runner).toContain('fit="contain"');
  });

  it('renders the Workout Runner as a two-column cockpit on desktop without forcing two columns on mobile', () => {
    const styles = read('styles/workout-session.css');
    expect(styles).toContain('@media (min-width: 900px)');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)');
    expect(styles).toContain('grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr)');
    expect(runner).toContain("animationPreference === 'off' && !hasHeroPhoto ? 'workout-cockpit--no-media'");
  });

  it('uses secondary-weight nav buttons for Previous/Skip/Pause, keeping Complete Set the primary CTA', () => {
    expect(runner).toContain('className={secondaryButtonClass} onClick={onPrevious}');
    expect(runner).toContain('className={secondaryButtonClass} onClick={onSkip}');
    expect(runner).toContain('className={secondaryButtonClass} onClick={onPause}');
    expect(runner).toContain('Skip set');
    expect(runner).toContain("onClick={onDone}");
    expect(runner).toContain('Complete Set');
  });

  it('shows type-aware target and previous-performance text next to the current set', () => {
    expect(runner).toContain('const targetDisplayText = (slot:');
    expect(runner).toContain('const previousDisplayText = (');
    expect(runner).toContain('modeAwareTargetDisplayText(slot, currentLoadMode)');
    expect(runner).toContain('previousDisplayText(previousSetPerformance, slot, currentLoadMode)');
  });

  it('badges warm-up sets without altering the underlying warmup flag', () => {
    expect(runner).toContain('slot?.warmup ? <span className="workout-warmup">Warm-up</span>');
  });

  it('moves the Sound and Animation toggles into an overflow menu, keeping Back/name/End as the primary header', () => {
    expect(runner).toContain('<HealthOverflowMenu');
    expect(runner).toContain("title=\"Workout settings\"");
    expect(runner).toContain("label: soundEnabled ? 'Sound: On' : 'Sound: Off'");
    expect(runner).not.toMatch(/aria-label=\{soundEnabled \? 'Sound on' : 'Sound off'\}/);
  });

  it('capitalizes exercise names for display via a shared, non-persisting helper', () => {
    expect(taxonomy).toContain('export function formatExerciseDisplayName(name: string): string {');
    expect(runner).toContain('formatWorkoutExerciseName(slot.exerciseName, slot.exerciseId)');
    expect(workspace).toContain('formatWorkoutExerciseName(exercise.name, exercise.id)');
    expect(workspace).toContain('const [name, setName] = useState(initialExercise?.name');
  });

  it('gives OpenGym/builtin exercises a Customize entry point instead of a dead-end "add a reference photo" prompt', () => {
    expect(workspace).toContain("exercise.source !== 'custom' ? <button type=\"button\" className={control} onClick={() => { pendingActionRef.current = 'customize'; setOpen(false); }}");
    expect(workspace).toContain('function ExerciseCustomizeForm({');
    expect(workspace).toContain('onSave: (updates: Partial<WorkoutExerciseDefinition>) => void;');
  });

  it('preserves OpenGym/builtin source identity when only a personal customization is saved', () => {
    expect(contextSource).toContain('source: updates.source ?? exercise.source');
    expect(contextSource).not.toContain("source: 'custom' as const, updatedAt: new Date() } : exercise");
    expect(workspace).toContain('context.updateWorkoutExercise(customizeExercise.id, updates)');
  });

  it('leaves the workout state machine, recording, and prefill logic untouched by the UI overhaul', () => {
    expect(runner).toContain('getPreviousSetPerformance');
    expect(runner).toContain('onStart');
    expect(runner).toContain('onDone');
    expect(runner).toContain('onSkipRest');
    expect(runner).toContain('onResume');
    expect(runner).toContain('onPause');
    expect(runner).toContain('onPrevious');
    expect(runner).toContain('onSkip');
    expect(runner).toContain("save(canSaveCompleted ? 'completed' : 'partial')");
  });
});
