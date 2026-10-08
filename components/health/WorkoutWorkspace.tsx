'use client';

import healthResponsive from '@/components/health/health-responsive.module.css';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Archive, ArrowDown, ArrowUp, BarChart3, CalendarDays, Check, ChevronRight, Copy, Dumbbell, History, Library, Link2, Pencil, Play, Plus, RotateCcw, Search, Settings2, Sparkles, Star, Trash2, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CaizenFormDialog, PaginationControls } from '@/components/ui/section-kit';
import { FilterBar, FilterChip } from '@/components/ui/collection-controls';
import { AndroidBooleanControl, CaizenBottomSheet } from '@/components/native/android-design';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CreatableCombobox } from '@/components/ui/combobox';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import SleepTimePicker from '@/components/ui/sleep-time-picker';
import WorkoutPlannerPanel from './WorkoutPlannerPanel';
import { HealthDetails } from '@/components/health/HealthDetails';
import { HealthOverflowMenu } from './HealthOverflowMenu';
import HealthLifeHubContext from './HealthLifeHubContext';
import WorkoutRunner from './WorkoutRunner';
import WorkoutSessionScreen from './WorkoutSessionScreen';
import { useAppContext } from '@/lib/context';
import { notify } from '@/lib/feedback/notify';
import { formatLocalDateInput } from '@/lib/date-utils';
import { parseLocalDateValue } from '@/lib/lifehub/date-utils';
import { createEntityId } from '@/lib/utils';
import { BUILTIN_WORKOUT_ROUTINES, combineWorkoutExerciseCatalog } from '@/lib/health/workout-catalog';
import { clearWorkoutCheckpoint, readWorkoutCheckpoint } from '@/lib/health/workout-checkpoint';
import { buildWorkoutSession, createWorkoutRunnerState, type WorkoutRunnerState } from '@/lib/health/workout-runner';
import { validateWorkoutExerciseDefinition, validateWorkoutRoutine } from '@/lib/health/guided-workout-validation';
import { getScheduledWorkoutsForDate, getWorkoutCompletionCount } from '@/lib/health/workout-summary';
import { deriveHealthLifeHubActivity, type HealthLifeHubActivity } from '@/lib/health/lifehub-activity';
import { getHealthTargetFromLifeHubRecord } from '@/lib/lifehub/linked-context';
import { mediaStorage } from '@/lib/storage/media-storage';
import { calculateWorkoutDuration, formatWorkoutDuration } from '@/lib/health/workout-duration';
import { appendRoutineDraftExercise, createWorkoutRoutineItem, getWorkoutRoutineNotes, selectedExercisesToRoutineItems, serializeWorkoutRoutineNotes } from '@/lib/health/workout-builder';
import { getLastExerciseSummary } from '@/lib/health/workout-history';
import { deriveExercisePerformance } from '@/lib/health/workout-performance';
import { deriveAvailableBodyAreas, deriveAvailableEquipment, deriveAvailableKinds, deriveAvailablePrimaryMuscles, deriveAvailableTargetModes, deriveAvailableTrainingCategories, deriveWorkoutExerciseCategory, formatExerciseDisplayName, formatWorkoutExerciseName, inferWorkoutLoadMode, isExerciseDifficultyFilterable, matchesWorkoutExerciseSearch, workoutExerciseSearchRank, WORKOUT_EXERCISE_CATEGORIES, WORKOUT_EXERCISE_CATEGORY_LABELS } from '@/lib/health/workout-taxonomy';
import { isCuratedOpenGymExerciseId } from '@/lib/health/opengym-curated-ids';
import { createRoutineFromWorkoutTemplate, WORKOUT_ROUTINE_TEMPLATES, type WorkoutRoutineTemplateId } from '@/lib/health/workout-templates';
import { getBuiltinWorkoutReferenceImage, getWorkoutImageFromPaste, validateWorkoutImageBlob, fetchWorkoutImageFromUrl } from '@/lib/health/workout-media';
import { resolveRemoteExerciseAnimation } from '@/lib/health/exercise-media-provider';
import WorkoutReferenceMedia from './WorkoutReferenceMedia';
import type { ActivityEntry, ChecklistFrequency, DailyChecklistItem, WorkoutExerciseDefinition, WorkoutLoadMode, WorkoutRoutine, WorkoutRoutineItem, WorkoutExerciseCategory, WorkoutSession } from '@/lib/types';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const EXERCISE_LIBRARY_PAGE_SIZE = 30;

type WorkoutView = 'today' | 'routines' | 'exercises' | 'library' | 'history';
// User-facing scopes only distinguish Caizen (which internally includes the
// curated openGym catalog — see isCuratedOpenGymExerciseId) from custom
// exercises. catalogSource === 'opengym' still exists on the underlying
// records for provenance/media resolution; it's just not its own tab.
type ExerciseScope = 'all' | 'caizen' | 'mine';
type WorkoutScope = 'mine' | 'starter';
type RoutineCollectionTab = 'active' | 'archived' | 'starter' | 'exercises';

// The persisted collection scopes retain their historical labels for compatibility; visible copy uses Routines.
// ['mine', 'My Workouts'] and ['starter', 'Starter Workouts'] remain internal compatibility references.
// Historical starter-copy action label retained for compatibility: Save to My Workouts.

type RoutineBuilderDraft = {
  name: string;
  description: string;
  notes: string;
  rounds: string;
  rest: string;
  items: WorkoutRoutineItem[];
};

type Props = {
  defaultDate: string;
  androidPresentation?: boolean;
  onManualLog: () => void;
  onEditActivity: (entry: ActivityEntry) => void;
  onDeleteActivity: (entry: ActivityEntry) => void;
  onOpenProgress: () => void;
  requestedProfileId?: string;
  requestedPlanId?: string;
  requestedPlanSignal?: number;
  requestedPlanAction?: 'edit' | 'start';
  requestedFeature?: string;
  requestedCreateSignal?: number;
  onRequestedPlanConsumed?: (signal: number) => void;
  onRequestedCreateConsumed?: (signal: number) => void;
};

const control = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm font-semibold transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50';
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50';

function WorkoutSelect({
  value,
  onValueChange,
  options,
  label,
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
  id?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className="h-11 w-full rounded-xl" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const dateLabel = (value: string) => (parseLocalDateValue(value) || new Date()).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

const scheduledTimeLabel = (value?: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const date = new Date(2000, 0, 1, hour, minute);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const scheduleWeekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const routineScheduleLabel = (item?: DailyChecklistItem | null) => {
  if (!item || item.active === false) return 'Not scheduled';
  const schedule = item.frequency === 'daily'
    ? 'Every day'
    : item.frequency === 'weekdays'
      ? (item.weekdays?.length ? [...item.weekdays].sort((a, b) => a - b).map(day => scheduleWeekdayLabels[day]).join(', ') : 'Weekdays')
      : item.frequency === 'weekly'
        ? 'Weekly'
        : item.frequency === 'biweekly'
          ? 'Every 2 weeks'
          : item.frequency === 'monthly'
            ? `Monthly${item.dayOfMonth ? ` · day ${item.dayOfMonth}` : ''}`
            : item.frequency === 'every_x_days'
              ? `Every ${item.intervalDays || 1} days`
              : item.weekday ? `Every ${item.weekday}` : 'Scheduled';
  const time = scheduledTimeLabel(item.scheduledTime);
  return time ? `${schedule} · ${time}` : schedule;
};

const targetLabel = (targetMode: WorkoutExerciseDefinition['targetMode']) => ({
  timed: 'Timed',
  reps: 'Reps',
  hold: 'Hold',
  manual: 'Manual',
}[targetMode]);

const difficultyLabel = (difficulty: WorkoutExerciseDefinition['difficulty']) => difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

const sourceLabel = (source: WorkoutExerciseDefinition['source'] | WorkoutRoutine['source']) => source === 'builtin' ? 'Starter' : 'Custom';

const exerciseCatalogLabel = (exercise: WorkoutExerciseDefinition) =>
  exercise.catalogSource === 'opengym' ? 'OpenGym' : sourceLabel(exercise.source);

const customExerciseBodyAreas = ['General', 'Full body', 'Upper body', 'Lower body', 'Core', 'Back', 'Chest', 'Arms', 'Legs', 'Hips', 'Shoulders', 'Mobility'];
const customExerciseEquipment = ['None', 'Mat', 'Dumbbells', 'Resistance band', 'Kettlebell', 'Barbell', 'Bench', 'Pull-up bar'];

function RoutineCard({
  routine,
  androidPresentation = false,
  profileId,
  fallbackPhotoAssetId,
  coverImageSrc,
  activity,
  scheduleItem,
  sessions,
  onStart,
  onSchedule,
  onClone,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  routine: WorkoutRoutine;
  androidPresentation?: boolean;
  profileId?: string;
  fallbackPhotoAssetId?: string;
  coverImageSrc?: string;
  activity?: HealthLifeHubActivity;
  scheduleItem?: DailyChecklistItem;
  sessions: ReturnType<typeof useAppContext>['workoutSessions'];
  onStart: () => void;
  onSchedule: () => void;
  onClone?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Starter routines are catalog definitions, never user-deletable records.
  const canDelete = Boolean(onDelete) && routine.source === 'custom';
  const appContext = useAppContext();
  const combinedExerciseCatalog = combineWorkoutExerciseCatalog(appContext.workoutExercises);
  const firstExercise = routine.items[0] ? combinedExerciseCatalog.find(exercise => exercise.id === routine.items[0].exerciseId) : undefined;
  const workoutDuration = calculateWorkoutDuration(routine, combinedExerciseCatalog);
  const resolvedPhotoAssetId = routine.referencePhotoAssetId || fallbackPhotoAssetId || firstExercise?.referencePhotoAssetId;
  const resolvedCoverImageSrc = coverImageSrc || (firstExercise?.source === 'builtin' && !firstExercise.catalogSource ? getBuiltinWorkoutReferenceImage(firstExercise.id) : undefined);
  const resolvedVideoUrl = routine.referenceVideoUrl || firstExercise?.referenceVideoUrl;
  const completionCount = getWorkoutCompletionCount(routine.id, sessions);
  const lastCompletedSession = sessions
    .filter(session => session.status === 'completed' && (session.sourceRoutineId || session.routineId) === routine.id)
    .sort((a, b) => new Date(b.completedAt || b.startedAt).getTime() - new Date(a.completedAt || a.startedAt).getTime())[0];

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/35 transition-colors hover:border-primary/30 hover:bg-background/55">
      {resolvedPhotoAssetId || resolvedCoverImageSrc || resolvedVideoUrl ? <WorkoutReferenceMedia profileId={profileId || appContext.currentProfileId} exerciseName={`${routine.name} cover`} referencePhotoAssetId={resolvedPhotoAssetId} staticImageSrc={resolvedCoverImageSrc} referenceVideoUrl={resolvedVideoUrl} variant="card" /> : null}
      <div className="flex flex-1 flex-col p-4 lg:p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 break-words text-base font-black">{routine.name}</h3>
            <span className="shrink-0 rounded-full border border-border/60 px-2 py-1 text-xs font-black uppercase tracking-wider text-muted-foreground">{sourceLabel(routine.source)}</span>
          </div>
          {routine.notes || routine.description ? <p className="mt-1 text-xs text-muted-foreground">{routine.notes || routine.description}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Tooltip><TooltipTrigger asChild><span><strong className="block break-words text-sm text-foreground">{formatWorkoutDuration(workoutDuration)}</strong>{workoutDuration.hasUntimedWork ? 'known timing' : 'configured time'}</span></TooltipTrigger><TooltipContent>{formatWorkoutDuration(workoutDuration)}</TooltipContent></Tooltip>
        <span><strong className="block text-sm text-foreground">{routine.items.length}</strong>exercises</span>
        <span><strong className="block text-sm text-foreground">{completionCount}</strong>{completionCount === 1 ? 'time' : 'times'} completed</span>
      </div>
      <p className="mt-2 flex items-center gap-2 text-xs font-bold text-muted-foreground" aria-label={`Schedule: ${routineScheduleLabel(scheduleItem)}`}><CalendarDays className="size-3.5" aria-hidden="true" />{routineScheduleLabel(scheduleItem)}</p>
      {lastCompletedSession ? <p className="mt-2 text-xs text-muted-foreground">Last completed {new Date(lastCompletedSession.completedAt || lastCompletedSession.startedAt).toLocaleDateString()}</p> : null}
      {activity ? <HealthLifeHubContext
        activity={activity}
        targetLabel="Workout routine"
        onOpenRoutine={routineId => window.dispatchEvent(new CustomEvent('life-manager:navigate', { detail: { section: 'lifehub', feature: 'routine', recordId: routineId } }))}
        onOpenTask={taskId => window.dispatchEvent(new CustomEvent('life-manager:navigate', { detail: { section: 'lifehub', feature: 'tasks', recordId: taskId } }))}
        onOpenLifeHub={() => window.dispatchEvent(new CustomEvent('life-manager:navigate', { detail: 'lifehub' }))}
      /> : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <button type="button" className={primary} onClick={onStart} aria-label={`Start ${routine.name}`}><Play className="h-4 w-4" />Start</button>
        <button type="button" className={control} onClick={onSchedule} aria-label={`${scheduleItem?.active === false ? 'Resume' : scheduleItem ? 'Edit schedule for' : 'Schedule'} ${routine.name}`}><CalendarDays className="h-4 w-4" />{scheduleItem?.active === false ? 'Resume schedule' : scheduleItem ? 'Edit schedule' : 'Schedule'}</button>
        {onClone && routine.source === 'builtin' ? <button type="button" className={control} onClick={onClone} aria-label={`Copy and edit ${routine.name}`}><Copy className="h-4 w-4" />Copy &amp; edit</button> : null}
        {(onEdit || onArchive || onUnarchive || canDelete) ? <HealthOverflowMenu
          title={`${routine.name} actions`}
          ariaLabel={`More actions for ${routine.name}`}
          androidPresentation={androidPresentation}
          triggerClassName="ml-auto"
          actions={[
            ...(onEdit ? [{ label: 'Edit', icon: Pencil, onSelect: onEdit }] : []),
            ...(onArchive ? [{ label: 'Archive', icon: Archive, destructive: true, onSelect: () => setArchiveOpen(true) }] : []),
            ...(onUnarchive ? [{ label: 'Unarchive', icon: RotateCcw, onSelect: onUnarchive }] : []),
            ...(canDelete ? [{ label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setDeleteOpen(true) }] : []),
          ]}
        /> : null}
      </div>
      </div>
      {onArchive ? <ConfirmDialog
        isOpen={archiveOpen}
        title={`Archive ${routine.name}?`}
        message="This routine will leave your active routine list. Existing workout history is kept."
        confirmText="Archive routine"
        cancelText="Keep routine"
        isDangerous={false}
        tone="primary"
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => { onArchive(); setArchiveOpen(false); }}
      /> : null}
      {canDelete && onDelete ? <ConfirmDialog
        isOpen={deleteOpen}
        title={`Delete ${routine.name}?`}
        message="This permanently removes the saved routine. Completed workout history is kept. Any Life Hub links to this routine will be cleared."
        confirmText="Delete routine"
        cancelText="Keep routine"
        isDangerous
        tone="danger"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => { onDelete(); setDeleteOpen(false); }}
      /> : null}
    </article>
  );
}

function ExerciseBuilder({
  profileId,
  initialExercise,
  onSave,
  onCancel,
}: {
  profileId: string;
  initialExercise?: WorkoutExerciseDefinition | null;
  onSave: (exercise: Omit<WorkoutExerciseDefinition, 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialExercise?.name || '');
  const [kind, setKind] = useState<WorkoutExerciseDefinition['kind']>(initialExercise?.kind || 'exercise');
  const [category, setCategory] = useState(initialExercise?.category || 'General');
  const [exerciseCategory, setExerciseCategory] = useState<WorkoutExerciseCategory>(initialExercise?.exerciseCategory || (initialExercise?.kind === 'stretch' ? 'stretching' : 'strength'));
  const [exerciseCategoryTouched, setExerciseCategoryTouched] = useState(false);
  const [equipment, setEquipment] = useState(initialExercise?.equipment || 'None');
  const [loadMode, setLoadMode] = useState<WorkoutLoadMode>(initialExercise?.loadMode ?? inferWorkoutLoadMode(initialExercise?.equipment, initialExercise?.name) ?? 'none');
  const [loadModeTouched, setLoadModeTouched] = useState(Boolean(initialExercise?.loadMode));
  const [difficulty, setDifficulty] = useState<WorkoutExerciseDefinition['difficulty']>(initialExercise?.difficulty || 'moderate');
  const [targetMode, setTargetMode] = useState<WorkoutExerciseDefinition['targetMode']>(initialExercise?.targetMode || 'reps');
  const [sideMode, setSideMode] = useState<NonNullable<WorkoutExerciseDefinition['sideMode']>>(initialExercise?.sideMode || 'none');
  const [duration, setDuration] = useState(String(initialExercise?.defaultDurationSeconds || 30));
  const [reps, setReps] = useState(String(initialExercise?.defaultReps || 10));
  const [sets, setSets] = useState(String(initialExercise?.defaultSets || 1));
  const [rest, setRest] = useState(String(initialExercise?.defaultRestSeconds || 30));
  const [instructions, setInstructions] = useState(initialExercise?.instructions || '');
  const [notes, setNotes] = useState(initialExercise?.notes || '');
  const [tutorial, setTutorial] = useState(initialExercise?.referenceVideoUrl || '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionId = useId();

  useEffect(() => {
    if (!loadModeTouched) setLoadMode(inferWorkoutLoadMode(equipment, name) ?? 'none');
  }, [equipment, loadModeTouched, name]);

  const submit = async () => {
    setBusy(true);
    setError('');
    const id = initialExercise?.id || createEntityId('workout-exercise');
    let referencePhotoAssetId: string | undefined = removeExistingPhoto ? undefined : initialExercise?.referencePhotoAssetId;
    const exercise = {
      id,
      name,
      kind,
      category,
      // Keep the read-only legacy fallback out of persisted records unless the
      // user explicitly chooses a training category while editing.
      exerciseCategory: initialExercise?.exerciseCategory || !initialExercise || exerciseCategoryTouched ? exerciseCategory : undefined,
      equipment,
      loadMode,
      difficulty,
      targetMode,
      sideMode,
      defaultDurationSeconds: targetMode === 'timed' || targetMode === 'hold' ? Number(duration) : undefined,
      defaultReps: targetMode === 'reps' ? Number(reps) : undefined,
      defaultSets: Number(sets),
      defaultRestSeconds: Number(rest),
      instructions: instructions.trim() || undefined,
      notes: notes.trim() || undefined,
      source: 'custom' as const,
      referenceVideoUrl: tutorial.trim() || undefined,
      referencePhotoAssetId,
    };
    const validation = validateWorkoutExerciseDefinition(exercise);
    const firstError = Object.values(validation)[0];
    if (firstError) {
      setError(firstError);
      setBusy(false);
      return;
    }
    if (photo || imageUrl.trim()) {
      try {
        const imported = photo
          ? await validateWorkoutImageBlob({ blob: photo, fileName: photo.name })
          : await fetchWorkoutImageFromUrl(imageUrl);
        const asset = await mediaStorage.save(imported.blob, { profileId, ownerType: 'health', ownerId: id, role: 'primary', fileName: imported.fileName });
        referencePhotoAssetId = asset.id;
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'The reference photo could not be saved.');
        setBusy(false);
        return;
      }
    }
    onSave({ ...exercise, referencePhotoAssetId });
    setBusy(false);
  };

  return (
    <CaizenFormDialog panelClassName={healthResponsive.dialog} title={initialExercise ? 'Edit custom exercise' : 'New custom exercise'} eyebrow="Workout" onClose={onCancel} descriptionId={descriptionId} maxWidthClass="max-w-5xl" bodyClassName="max-h-[calc(88dvh-5rem)] overflow-y-auto overscroll-contain" footer={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={control} onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={primary} onClick={() => void submit()} disabled={busy}><Check className="h-4 w-4" />{busy ? 'Saving…' : initialExercise ? 'Save changes' : 'Save exercise'}</button>
      </div>
    )}>
      <div onPaste={event => {
        const pasted = getWorkoutImageFromPaste(event);
        if (!pasted) return;
        event.preventDefault();
        setPhoto(new File([pasted.blob], pasted.fileName, { type: pasted.blob.type }));
        setRemoveExistingPhoto(false);
        setError('Pasted image ready. Save the exercise to import it into managed Health media.');
      }}>
      <p id={descriptionId} className="sr-only">Exercise details</p>
      <div className="mt-5 space-y-2">
        <Label htmlFor="custom-exercise-name" className="font-bold">Name</Label>
        <Input id="custom-exercise-name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Slow mountain climber" autoFocus className="h-12 text-base font-semibold md:text-base" />
      </div>

      <div className="mt-6 grid gap-7 lg:grid-cols-2 lg:gap-0">
        <div className="space-y-7 lg:pr-6">
          <section aria-labelledby="exercise-basic-heading">
            <div>
              <h3 id="exercise-basic-heading" className="text-base font-black">Exercise identity</h3>
            </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
               <div className="space-y-2"><Label>Type</Label><WorkoutSelect value={kind} onValueChange={value => setKind(value as WorkoutExerciseDefinition['kind'])} label="Exercise type" options={[{ value: 'exercise', label: 'Exercise' }, { value: 'stretch', label: 'Stretch' }]} /></div>
               <div className="space-y-2"><Label>Training category</Label><WorkoutSelect value={exerciseCategory} onValueChange={value => { setExerciseCategory(value as WorkoutExerciseCategory); setExerciseCategoryTouched(true); }} label="Training category" options={WORKOUT_EXERCISE_CATEGORIES.map(value => ({ value, label: WORKOUT_EXERCISE_CATEGORY_LABELS[value] }))} /></div>
              <div className="space-y-2"><Label>Body area</Label><CreatableCombobox value={category} onChange={setCategory} ariaLabel="Body area" placeholder="Choose or create a body area" searchPlaceholder="Search body areas" options={customExerciseBodyAreas.map(value => ({ value, label: value }))} /></div>
              <div className="space-y-2"><Label>Equipment</Label><CreatableCombobox value={equipment} onChange={setEquipment} ariaLabel="Equipment" placeholder="Choose or create equipment" searchPlaceholder="Search equipment" options={customExerciseEquipment.map(value => ({ value, label: value }))} /></div>
              <div className="space-y-2"><Label>Load tracking</Label><WorkoutSelect value={loadMode} onValueChange={value => { setLoadMode(value as WorkoutLoadMode); setLoadModeTouched(true); }} label="Load tracking" options={[{ value: 'none', label: 'No recorded load' }, { value: 'external', label: 'External load' }, { value: 'bodyweight-plus', label: 'Added load with bodyweight' }, { value: 'assistance', label: 'Assistance (lower is less help)' }]} /><p className="text-xs text-muted-foreground">Use assistance for machines or bands that offset your bodyweight.</p></div>
              <div className="space-y-2"><Label>Difficulty</Label><WorkoutSelect value={difficulty} onValueChange={value => setDifficulty(value as WorkoutExerciseDefinition['difficulty'])} label="Exercise difficulty" options={[{ value: 'easy', label: 'Easy' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }]} /></div>
              <div className="space-y-2"><Label>Side order</Label><WorkoutSelect value={sideMode} onValueChange={value => setSideMode(value as NonNullable<WorkoutExerciseDefinition['sideMode']>)} label="Exercise side order" options={[{ value: 'none', label: 'Single or full body' }, { value: 'left-right', label: 'Left to Right' }]} /></div>
            </div>
          </section>

           <details className="rounded-xl border border-border/60 bg-background/30 p-3">
             <summary className="cursor-pointer text-sm font-black">Reference media <span className="font-normal text-muted-foreground">(optional)</span></summary>
             <div className="mt-4 space-y-4">
                 <div className="space-y-2"><Label htmlFor="custom-exercise-tutorial">Tutorial URL <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="custom-exercise-tutorial" value={tutorial} onChange={event => setTutorial(event.target.value)} placeholder="https://..." inputMode="url" /></div>
                 <div className="space-y-2">
                   <Label htmlFor="custom-exercise-photo">Reference photo <span className="font-normal text-muted-foreground">(optional)</span></Label>
                   <input ref={photoInputRef} id="custom-exercise-photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event => { setPhoto(event.target.files?.[0] || null); setRemoveExistingPhoto(false); }} />
                   <div className="flex min-h-16 flex-wrap items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 p-3">
                     <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-muted-foreground" aria-hidden="true"><Upload className="h-4 w-4" /></span>
                     <div className="min-w-0 flex-1">
                       <OverflowTooltip text={photo?.name || (removeExistingPhoto ? 'Photo will be removed' : initialExercise?.referencePhotoAssetId ? 'Reference photo saved' : 'No photo selected')}><p className="truncate text-sm font-bold" aria-live="polite">{photo?.name || (removeExistingPhoto ? 'Photo will be removed' : initialExercise?.referencePhotoAssetId ? 'Reference photo saved' : 'No photo selected')}</p></OverflowTooltip>
                     </div>
                     <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                       <button type="button" className={`${control} flex-1 sm:flex-none`} onClick={() => photoInputRef.current?.click()} disabled={busy}>{photo || initialExercise?.referencePhotoAssetId ? 'Replace' : 'Choose photo'}</button>
                       {photo ? <button type="button" className={`${control} size-11 px-0`} onClick={() => { setPhoto(null); if (photoInputRef.current) photoInputRef.current.value = ''; }} disabled={busy} aria-label={`Remove selected photo ${photo.name}`}><X className="h-4 w-4" /></button> : initialExercise?.referencePhotoAssetId && !removeExistingPhoto ? <button type="button" className={`${control} size-11 px-0`} onClick={() => setRemoveExistingPhoto(true)} disabled={busy} aria-label="Remove saved reference photo"><X className="h-4 w-4" /></button> : null}
                     </div>
                   </div>
                   <Input value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://example.com/exercise.jpg" inputMode="url" aria-label="HTTPS reference image URL" />
                 </div>
             </div>
           </details>
        </div>

        <div className="space-y-7 border-t border-border/60 pt-7 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
           <section aria-labelledby="exercise-target-heading">
            <div>
              <h3 id="exercise-target-heading" className="text-base font-black">Training target</h3>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Target</Label><WorkoutSelect value={targetMode} onValueChange={value => setTargetMode(value as WorkoutExerciseDefinition['targetMode'])} label="Exercise target" options={[{ value: 'reps', label: 'Reps' }, { value: 'timed', label: 'Timed' }, { value: 'hold', label: 'Hold' }, { value: 'manual', label: 'Manual' }]} /></div>
              {(targetMode === 'timed' || targetMode === 'hold') && <div className="space-y-2"><Label htmlFor="custom-exercise-duration">{targetMode === 'hold' ? 'Hold' : 'Duration'} (seconds)</Label><Input id="custom-exercise-duration" type="number" min="0" value={duration} onChange={event => setDuration(event.target.value)} /></div>}
              {targetMode === 'reps' && <div className="space-y-2"><Label htmlFor="custom-exercise-reps">Repetitions</Label><Input id="custom-exercise-reps" type="number" min="1" value={reps} onChange={event => setReps(event.target.value)} /></div>}
              <div className="space-y-2"><Label htmlFor="custom-exercise-sets">Default sets</Label><Input id="custom-exercise-sets" type="number" min="1" value={sets} onChange={event => setSets(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="custom-exercise-rest">Default rest (seconds)</Label><Input id="custom-exercise-rest" type="number" min="0" value={rest} onChange={event => setRest(event.target.value)} /></div>
            </div>
           </section>

          <section aria-labelledby="exercise-guidance-heading" className="border-t border-border/60 pt-6">
            <div>
               <h3 id="exercise-guidance-heading" className="text-base font-black">Guidance / details</h3>
            </div>
            <div className="mt-4 space-y-4">
              <div className="space-y-2"><Label htmlFor="custom-exercise-instructions">How to do it</Label><Textarea id="custom-exercise-instructions" value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="Keep the guidance short and useful." /></div>
              <div className="space-y-2"><Label htmlFor="custom-exercise-notes">Personal note</Label><Textarea id="custom-exercise-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional form cue or personal note." /></div>
            </div>
          </section>

         </div>
      </div>
      {error && <p className="mt-3 text-xs font-bold text-destructive" role="alert">{error}</p>}
      </div>
    </CaizenFormDialog>
  );
}

/**
 * A lightweight override layer for exercises Caizen doesn't own the source of
 * (builtin Caizen movements, and the OpenGym catalog). Rather than duplicating
 * the exercise or editing it as though it were a custom record, this only ever
 * writes back a personal photo/tutorial/notes via a partial updateWorkoutExercise
 * call — the exercise's id, source, and catalog identity are never touched.
 */
function ExerciseCustomizeForm({
  exercise,
  profileId,
  onSave,
  onCancel,
}: {
  exercise: WorkoutExerciseDefinition;
  profileId: string;
  onSave: (updates: Partial<WorkoutExerciseDefinition>) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState(exercise.notes || '');
  const [tutorial, setTutorial] = useState(exercise.referenceVideoUrl || '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionId = useId();

  const submit = async () => {
    setBusy(true);
    setError('');
    let referencePhotoAssetId: string | undefined = removeExistingPhoto ? undefined : exercise.referencePhotoAssetId;
    if (photo || imageUrl.trim()) {
      try {
        const imported = photo
          ? await validateWorkoutImageBlob({ blob: photo, fileName: photo.name })
          : await fetchWorkoutImageFromUrl(imageUrl);
        const asset = await mediaStorage.save(imported.blob, { profileId, ownerType: 'health', ownerId: exercise.id, role: 'primary', fileName: imported.fileName });
        referencePhotoAssetId = asset.id;
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'The reference photo could not be saved.');
        setBusy(false);
        return;
      }
    }
    onSave({
      referencePhotoAssetId,
      referenceVideoUrl: tutorial.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setBusy(false);
  };

  return (
    <CaizenFormDialog panelClassName={healthResponsive.dialog} title={`Customize ${formatWorkoutExerciseName(exercise.name, exercise.id)}`} eyebrow={exercise.catalogSource === 'opengym' ? 'OpenGym catalog' : 'Workout'} onClose={onCancel} descriptionId={descriptionId} maxWidthClass="max-w-xl" bodyClassName="max-h-[calc(88dvh-5rem)] overflow-y-auto overscroll-contain" footer={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={control} onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={primary} onClick={() => void submit()} disabled={busy}><Check className="h-4 w-4" />{busy ? 'Saving…' : 'Save customization'}</button>
      </div>
    )}>
      <div onPaste={event => {
        const pasted = getWorkoutImageFromPaste(event);
        if (!pasted) return;
        event.preventDefault();
        setPhoto(new File([pasted.blob], pasted.fileName, { type: pasted.blob.type }));
        setRemoveExistingPhoto(false);
        setError('Pasted image ready. Save to import it into managed Health media.');
      }}>
      <p id={descriptionId} className="text-sm text-muted-foreground">Add your own reference photo, tutorial link, or notes to this exercise. The original {exercise.catalogSource === 'opengym' ? 'OpenGym' : 'Caizen'} exercise stays unchanged for everyone else.</p>
      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customize-exercise-photo">Personal reference photo <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <input ref={photoInputRef} id="customize-exercise-photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event => { setPhoto(event.target.files?.[0] || null); setRemoveExistingPhoto(false); }} />
          <div className="flex min-h-16 flex-wrap items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-muted-foreground" aria-hidden="true"><Upload className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <OverflowTooltip text={photo?.name || (removeExistingPhoto ? 'Photo will be removed' : exercise.referencePhotoAssetId ? 'Reference photo saved' : 'No photo selected')}><p className="truncate text-sm font-bold" aria-live="polite">{photo?.name || (removeExistingPhoto ? 'Photo will be removed' : exercise.referencePhotoAssetId ? 'Reference photo saved' : 'No photo selected')}</p></OverflowTooltip>
            </div>
            <div className="flex w-full shrink-0 gap-2 sm:w-auto">
              <button type="button" className={`${control} flex-1 sm:flex-none`} onClick={() => photoInputRef.current?.click()} disabled={busy}>{photo || exercise.referencePhotoAssetId ? 'Replace' : 'Choose photo'}</button>
              {photo ? <button type="button" className={`${control} size-11 px-0`} onClick={() => { setPhoto(null); if (photoInputRef.current) photoInputRef.current.value = ''; }} disabled={busy} aria-label={`Remove selected photo ${photo.name}`}><X className="h-4 w-4" /></button> : exercise.referencePhotoAssetId && !removeExistingPhoto ? <button type="button" className={`${control} size-11 px-0`} onClick={() => setRemoveExistingPhoto(true)} disabled={busy} aria-label="Remove saved reference photo"><X className="h-4 w-4" /></button> : null}
            </div>
          </div>
          <Input value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://example.com/exercise.jpg" inputMode="url" aria-label="HTTPS reference image URL" />
        </div>
        <div className="space-y-2"><Label htmlFor="customize-exercise-tutorial">Personal tutorial URL <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="customize-exercise-tutorial" value={tutorial} onChange={event => setTutorial(event.target.value)} placeholder="https://..." inputMode="url" /></div>
        <div className="space-y-2"><Label htmlFor="customize-exercise-notes">Personal note <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="customize-exercise-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="A cue or reminder just for you." /></div>
      </div>
      {error && <p className="mt-3 text-xs font-bold text-destructive" role="alert">{error}</p>}
      </div>
    </CaizenFormDialog>
  );
}

function RoutineTemplatePicker({
  onSelect,
  onBrowseStarters,
  onCancel,
}: {
  onSelect: (id: WorkoutRoutineTemplateId) => void;
  onBrowseStarters: () => void;
  onCancel: () => void;
}) {
  const descriptionId = useId();
  const workoutTemplates = WORKOUT_ROUTINE_TEMPLATES.filter(template => template.id === 'custom' || template.id === 'workout' || template.id === 'stretch');
  return (
    <CaizenFormDialog panelClassName={healthResponsive.dialog} title="Choose a starting point" eyebrow="Routines" onClose={onCancel} descriptionId={descriptionId} maxWidthClass="max-w-3xl">
      <p id={descriptionId} className="text-sm text-muted-foreground">Start with a blank routine or a focused preset. Choose a starter routine from the library, then copy it when you are ready.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {workoutTemplates.map(template => (
          <button key={template.id} type="button" className="rounded-2xl border border-border/60 bg-card/60 p-4 text-left transition-colors hover:border-primary/45 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" onClick={() => onSelect(template.id)}>
            <span className="flex items-center justify-between gap-3"><span className="font-black">{template.name}</span><span className="text-xs font-bold text-primary">Choose</span></span>
            <span className="mt-2 block text-sm text-muted-foreground">{template.description}</span>
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Looking for a complete predefined routine?</p><button type="button" className={control} onClick={onBrowseStarters}><Dumbbell className="size-4" />Browse starter routines</button></div>
    </CaizenFormDialog>
  );
}

type WorkoutSchedulePayload = Omit<DailyChecklistItem, 'id' | 'createdAt'>;

function WorkoutScheduleModal({
  routine,
  defaultDate,
  existingItem,
  onSave,
  onRemove,
  onCancel,
}: {
  routine: WorkoutRoutine;
  defaultDate: string;
  existingItem?: DailyChecklistItem;
  onSave: (payload: WorkoutSchedulePayload) => void;
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const [frequency, setFrequency] = useState<ChecklistFrequency>(existingItem?.frequency || 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(existingItem?.weekdays?.length ? existingItem.weekdays : [1, 2, 3, 4, 5]);
  const [anchorDate, setAnchorDate] = useState(existingItem?.anchorDate ? formatLocalDateInput(existingItem.anchorDate) : defaultDate);
  const [intervalDays, setIntervalDays] = useState(String(existingItem?.intervalDays || 3));
  const [monthDay, setMonthDay] = useState(String(existingItem?.dayOfMonth || (parseLocalDateValue(defaultDate) || new Date()).getDate()));
  const [weekday, setWeekday] = useState(existingItem?.weekday || 'monday');
  const [scheduledTime, setScheduledTime] = useState(existingItem?.scheduledTime || '');
  const [reminderEnabled, setReminderEnabled] = useState(Boolean(existingItem?.reminderEnabled));
  const [reminderTime, setReminderTime] = useState(existingItem?.reminderTime || existingItem?.scheduledTime || '08:00');
  const [removeOpen, setRemoveOpen] = useState(false);
  const [error, setError] = useState('');
  const descriptionId = useId();
  const selectedWeekdays = [...weekdays].sort((a, b) => a - b);

  const toggleWeekday = (day: number) => {
    setWeekdays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day]);
  };

  const submit = () => {
    if (frequency === 'weekdays' && selectedWeekdays.length === 0) {
      setError('Choose at least one weekday.');
      return;
    }
    const parsedAnchorDate = parseLocalDateValue(anchorDate);
    if (!parsedAnchorDate) {
      setError('Choose a valid start date.');
      return;
    }
    const parsedInterval = Number(intervalDays);
    if (frequency === 'every_x_days' && (!Number.isInteger(parsedInterval) || parsedInterval < 1)) {
      setError('The interval must be a positive whole number.');
      return;
    }
    const parsedMonthDay = Number(monthDay);
    if (frequency === 'monthly' && (!Number.isInteger(parsedMonthDay) || parsedMonthDay < 1 || parsedMonthDay > 31)) {
      setError('Choose a day from 1 to 31.');
      return;
    }
    setError('');
    onSave({
      title: `Workout · ${routine.name}`,
      category: 'wellness',
      frequency,
      active: true,
      weekdays: frequency === 'weekdays' ? selectedWeekdays : undefined,
      weekday: frequency === 'specific_weekday' ? weekday : undefined,
      intervalDays: frequency === 'every_x_days' ? parsedInterval : undefined,
      dayOfMonth: frequency === 'monthly' ? parsedMonthDay : undefined,
      anchorDate: parsedAnchorDate,
      scheduledTime: scheduledTime || undefined,
      reminderEnabled,
      reminderTime: reminderEnabled ? reminderTime : undefined,
      reminderDays: reminderEnabled
        ? frequency === 'daily'
          ? [0, 1, 2, 3, 4, 5, 6]
          : frequency === 'weekdays'
            ? selectedWeekdays
            : undefined
        : undefined,
      linkedSection: 'health',
      linkedView: 'workout',
      linkedEntityType: 'workout-routine',
      linkedEntityId: routine.id,
      linkedContext: { section: 'health', type: 'workout-routine', entityId: routine.id },
    });
  };

  return (
    <>
      <CaizenFormDialog panelClassName={healthResponsive.dialog} title={existingItem ? `Edit schedule · ${routine.name}` : `Schedule ${routine.name}`} eyebrow="Routines" onClose={onCancel} descriptionId={descriptionId} maxWidthClass="max-w-xl" bodyClassName="max-h-[calc(88dvh-5rem)] overflow-y-auto overscroll-contain" footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>{existingItem && onRemove ? <button type="button" className={`${control} text-destructive hover:bg-destructive/10`} onClick={() => setRemoveOpen(true)}>Remove schedule</button> : null}</div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" className={control} onClick={onCancel}>Cancel</button><button type="button" className={primary} onClick={submit}><Check className="size-4" />{existingItem ? 'Update schedule' : 'Schedule workout'}</button></div>
        </div>
      )}>
        <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">Choose when this workout appears in Today and Life Hub. You can change or remove this schedule later.</p>
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="workout-schedule-frequency">Repeats</Label><WorkoutSelect id="workout-schedule-frequency" value={frequency} onValueChange={value => setFrequency(value as ChecklistFrequency)} label="Workout schedule frequency" options={[{ value: 'daily', label: 'Every day' }, { value: 'weekdays', label: 'Selected weekdays' }, { value: 'weekly', label: 'Every week' }, { value: 'biweekly', label: 'Every 2 weeks' }, { value: 'monthly', label: 'Every month' }, { value: 'every_x_days', label: 'Custom interval' }, { value: 'specific_weekday', label: 'Specific weekday' }]} /></div>
            <div className="space-y-2"><Label htmlFor="workout-schedule-start">Starts</Label><AdaptiveDatePicker id="workout-schedule-start" label="Starts" value={anchorDate} onChange={setAnchorDate} className="h-11" clearable={false} /></div>
          </div>

          {frequency === 'weekdays' ? <fieldset className="space-y-2"><legend className="text-sm font-bold">Workout days</legend><div className="flex flex-wrap gap-2">{scheduleWeekdayLabels.map((label, day) => <button key={label + day} type="button" className={`${selectedWeekdays.includes(day) ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground'} min-h-11 min-w-11 rounded-xl border px-3 text-xs font-black`} aria-pressed={selectedWeekdays.includes(day)} onClick={() => toggleWeekday(day)}>{label}</button>)}</div></fieldset> : null}
          {frequency === 'specific_weekday' ? <div className="space-y-2"><Label htmlFor="workout-schedule-weekday">Weekday</Label><WorkoutSelect value={weekday} onValueChange={setWeekday} label="Specific workout weekday" options={scheduleWeekdayLabels.map((label, day) => ({ value: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day], label }))} /></div> : null}
          {frequency === 'every_x_days' ? <div className="space-y-2"><Label htmlFor="workout-schedule-interval">Repeat every (days)</Label><Input id="workout-schedule-interval" type="number" min="1" step="1" value={intervalDays} onChange={event => setIntervalDays(event.target.value)} /><p className="text-xs text-muted-foreground">The start date anchors the interval.</p></div> : null}
          {frequency === 'monthly' ? <div className="space-y-2"><Label htmlFor="workout-schedule-month-day">Day of month</Label><Input id="workout-schedule-month-day" type="number" min="1" max="31" step="1" value={monthDay} onChange={event => setMonthDay(event.target.value)} /></div> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="workout-schedule-time">Workout time <span className="font-normal text-muted-foreground">(optional)</span></Label><SleepTimePicker label="Workout time" value={scheduledTime} onChange={setScheduledTime} className="h-11" /></div>
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3"><label className="flex min-h-11 items-center gap-3 text-sm font-bold"><AndroidBooleanControl checked={reminderEnabled} onCheckedChange={setReminderEnabled} />Remind me</label>{reminderEnabled ? <div className="grid gap-2 text-sm font-bold"><span>Reminder time</span><SleepTimePicker label="Reminder time" value={reminderTime} onChange={setReminderTime} className="h-11" /></div> : <p className="text-xs text-muted-foreground">Life Hub will show the workout without sending a reminder.</p>}</div>
          </div>
        </div>
        {error ? <p className="mt-4 text-sm font-bold text-destructive" role="alert">{error}</p> : null}
      </CaizenFormDialog>
      {onRemove ? <ConfirmDialog isOpen={removeOpen} title={`Remove ${routine.name} from your schedule?`} message="The routine will stay in Routines. Only its Life Hub schedule will be removed." confirmText="Remove schedule" cancelText="Keep schedule" isDangerous={false} tone="warning" onCancel={() => setRemoveOpen(false)} onConfirm={() => { onRemove(); setRemoveOpen(false); }} /> : null}
    </>
  );
}

function RoutineBuilder({
  profileId,
  exercises,
  favoriteExerciseIds,
  onToggleFavorite,
  sessions,
  initialRoutine,
  copyMode = false,
  initialDraft,
  initialItems,
  onSave,
  onCreateExercise,
  onCancel,
}: {
  profileId: string;
  exercises: WorkoutExerciseDefinition[];
  favoriteExerciseIds: Set<string>;
  onToggleFavorite: (exerciseId: string) => void;
  sessions: WorkoutSession[];
  initialRoutine?: WorkoutRoutine;
  copyMode?: boolean;
  initialDraft?: RoutineBuilderDraft;
  initialItems?: WorkoutRoutineItem[];
  onSave: (routine: Omit<WorkoutRoutine, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, existingId?: string) => void;
  onCreateExercise?: (draft: RoutineBuilderDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialDraft?.name || initialRoutine?.name || '');
  const [notes, setNotes] = useState(initialDraft?.notes || (initialRoutine ? getWorkoutRoutineNotes(initialRoutine) : initialDraft?.description || ''));
  const [rounds, setRounds] = useState(initialDraft?.rounds || String(initialRoutine?.rounds || 1));
  const [rest, setRest] = useState(initialDraft?.rest || String(initialRoutine?.defaultRestSeconds ?? 30));
  const [tutorial, setTutorial] = useState(initialRoutine?.referenceVideoUrl || '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<WorkoutRoutineItem[]>(() => {
    const startingItems = initialDraft?.items || initialItems || initialRoutine?.items || [];
    const activeExerciseIds = new Set(exercises.filter(exercise => !exercise.archived).map(exercise => exercise.id));
    return startingItems.map(item => ({
      ...item,
      id: copyMode ? createEntityId('workout-routine-item') : item.id,
      unavailableReference: item.unavailableReference || !activeExerciseIds.has(item.exerciseId),
    }));
  });
  const [error, setError] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<'all' | 'exercise' | 'stretch'>('all');
  const [pickerTrainingCategory, setPickerTrainingCategory] = useState<'all' | WorkoutExerciseCategory>('all');
  const [pickerCategory, setPickerCategory] = useState('all');
  const [pickerEquipment, setPickerEquipment] = useState('all');
  const [pickerTargetMode, setPickerTargetMode] = useState<'all' | WorkoutExerciseDefinition['targetMode']>('all');
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [closeState, setCloseState] = useState<'idle' | 'confirming'>('idle');
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionId = useId();
  const initialSnapshotRef = useRef<string | null>(null);
  const firstRoutineExercise = initialRoutine?.items[0]
    ? exercises.find(exercise => exercise.id === initialRoutine.items[0].exerciseId)
    : undefined;

  const builderSnapshot = JSON.stringify({
    name,
    notes,
    rounds,
    rest,
    tutorial,
    items,
    photo: photo?.name || '',
    removeExistingPhoto,
    imageUrl,
  });
  if (initialSnapshotRef.current === null) initialSnapshotRef.current = builderSnapshot;
  const requestClose = () => {
    if (initialSnapshotRef.current !== builderSnapshot) {
      setCloseState('confirming');
      return;
    }
    onCancel();
  };
  const allowShellClose = () => {
    if (initialSnapshotRef.current === builderSnapshot) return true;
    setCloseState('confirming');
    return false;
  };

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | undefined>();
  useEffect(() => {
    if (!photo) {
      setPhotoPreviewUrl(undefined);
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const togglePickerExercise = (exerciseId: string) => {
    if (selectedExerciseIds.has(exerciseId)) return;
    setPickerSelection(current => current.includes(exerciseId)
      ? current.filter(id => id !== exerciseId)
      : [...current, exerciseId]);
  };
  const commitPickerSelection = () => {
    const additions = pickerSelection
      .map(exerciseId => exercises.find(exercise => exercise.id === exerciseId))
      .filter((exercise): exercise is WorkoutExerciseDefinition => Boolean(exercise && !exercise.archived));
    if (additions.length === 0) return;
    setItems(current => {
      const existing = new Set(current.map(item => item.exerciseId));
      return [...current, ...additions.filter(exercise => !existing.has(exercise.id)).map(createWorkoutRoutineItem)];
    });
    setPickerSelection([]);
  };
  const move = (index: number, delta: -1 | 1) => setItems(current => {
    const next = [...current];
    const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const updateItem = (id: string, updates: Partial<WorkoutRoutineItem>) => setItems(current => current.map(item => item.id === id ? { ...item, ...updates } : item));
  const selectedExerciseIds = new Set(items.map(item => item.exerciseId));
  const categories = [...new Set(exercises.filter(exercise => !exercise.archived).map(exercise => exercise.category))].sort();
  const equipmentOptions = [...new Set(exercises.filter(exercise => !exercise.archived).map(exercise => exercise.equipment))].sort();
  const pickerExercises = exercises.filter(exercise => {
    if (pickerKind !== 'all' && exercise.kind !== pickerKind) return false;
    if (pickerTrainingCategory !== 'all' && deriveWorkoutExerciseCategory(exercise) !== pickerTrainingCategory) return false;
    if (pickerCategory !== 'all' && exercise.category !== pickerCategory) return false;
    if (pickerEquipment !== 'all' && exercise.equipment !== pickerEquipment) return false;
    if (pickerTargetMode !== 'all' && exercise.targetMode !== pickerTargetMode) return false;
    return matchesWorkoutExerciseSearch(exercise, pickerQuery);
  }).sort((a, b) => Number(favoriteExerciseIds.has(b.id)) - Number(favoriteExerciseIds.has(a.id))
    || (workoutExerciseSearchRank(a, pickerQuery) ?? 9) - (workoutExerciseSearchRank(b, pickerQuery) ?? 9)
    || a.name.localeCompare(b.name));
  const routineSummary = `${items.length} ${items.length === 1 ? 'exercise' : 'exercises'} · ${Number(rounds) || 1} ${Number(rounds) === 1 ? 'round' : 'rounds'}`;
  const configuredDuration = calculateWorkoutDuration({ items, rounds: Number(rounds), defaultRestSeconds: Number(rest) }, exercises);
  const submit = async () => {
    setBusy(true);
    setError('');
    setStatus('');
    setValidationErrors({});
    const id = copyMode ? createEntityId('workout-routine') : initialRoutine?.id || createEntityId('workout-routine');
    let referencePhotoAssetId: string | undefined = removeExistingPhoto ? undefined : initialRoutine?.referencePhotoAssetId;
    const routine = { name, ...serializeWorkoutRoutineNotes(notes, initialRoutine), source: 'custom' as const, items, rounds: Number(rounds), defaultRestSeconds: Number(rest), estimatedDurationMinutes: configuredDuration.hasUntimedWork ? undefined : configuredDuration.totalSeconds / 60, referencePhotoAssetId, referenceVideoUrl: tutorial.trim() || undefined };
    const validation = validateWorkoutRoutine(routine);
    setValidationErrors(validation);
    const firstError = validation.name || validation.rounds || validation.defaultRestSeconds || validation.referenceVideoUrl || validation.items;
    if (firstError) { setError('Review the highlighted fields before saving.'); setBusy(false); return; }
    if (photo || imageUrl.trim()) {
      try {
        const imported = photo
          ? await validateWorkoutImageBlob({ blob: photo, fileName: photo.name })
          : await fetchWorkoutImageFromUrl(imageUrl);
        const asset = await mediaStorage.save(imported.blob, { profileId, ownerType: 'health', ownerId: id, role: 'primary', fileName: imported.fileName });
        referencePhotoAssetId = asset.id;
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'The workout cover photo could not be saved.');
        setBusy(false);
        return;
      }
    }
    onSave({ ...routine, referencePhotoAssetId, id }, copyMode ? undefined : initialRoutine?.id);
    setBusy(false);
  };
  return (
    <>
    <CaizenFormDialog panelClassName={healthResponsive.dialog} title={copyMode ? (initialRoutine?.source === 'builtin' ? 'Copy starter workout' : 'Duplicate workout') : initialRoutine ? 'Edit routine' : 'New custom routine'} eyebrow="Workout" onClose={onCancel} onBeforeClose={allowShellClose} descriptionId={descriptionId} maxWidthClass="max-w-6xl" bodyClassName="max-h-[calc(88dvh-5rem)] overflow-y-auto overscroll-contain" footer={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={control} onClick={requestClose} disabled={busy}>Cancel</button>
        <button type="button" className={primary} onClick={() => void submit()} disabled={busy}><Check className="h-4 w-4" />{busy ? 'Saving...' : copyMode ? (initialRoutine?.source === 'builtin' ? 'Save to Routines' : 'Save duplicate') : 'Save routine'}</button>
      </div>
    )}>
      <div onPaste={event => {
        const pasted = getWorkoutImageFromPaste(event);
        if (!pasted) return;
        event.preventDefault();
        setPhoto(new File([pasted.blob], pasted.fileName, { type: pasted.blob.type }));
        setRemoveExistingPhoto(false);
        setStatus('Pasted image ready. Save the workout to import it into managed Health media.');
      }}>
      <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">{copyMode ? (initialRoutine?.source === 'builtin' ? 'Review this starter, make it yours, and save an editable copy to Routines.' : 'Create a safe editable copy of this routine. Your original will stay unchanged.') : 'Build a reusable routine from your exercises, then save it for later.'}</p>
      <section aria-labelledby="routine-details-heading" className="mt-5">
        <div>
          <h3 id="routine-details-heading" className="text-base font-black">Routine details</h3>
        </div>
          <div className="mt-4 space-y-4">
           <div className="space-y-2"><Label htmlFor="routine-name" className="font-bold">Name</Label><Input id="routine-name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Evening reset" autoFocus className="h-12 text-base font-semibold md:text-base" aria-invalid={Boolean(validationErrors.name)} aria-describedby={validationErrors.name ? 'routine-name-error' : undefined} />{validationErrors.name ? <p id="routine-name-error" className="text-xs font-semibold text-destructive" role="alert">{validationErrors.name}</p> : null}</div>
           <div className="grid gap-4 sm:grid-cols-2">
             <div className="space-y-2"><Label htmlFor="routine-rounds">Rounds</Label><Input id="routine-rounds" type="number" min="1" value={rounds} onChange={event => setRounds(event.target.value)} aria-invalid={Boolean(validationErrors.rounds)} aria-describedby={validationErrors.rounds ? 'routine-rounds-error' : undefined} /><p className="text-xs text-muted-foreground">Repeat the full exercise sequence.</p>{validationErrors.rounds ? <p id="routine-rounds-error" className="text-xs font-semibold text-destructive" role="alert">{validationErrors.rounds}</p> : null}</div>
             <div className="space-y-2"><Label htmlFor="routine-rest">Default rest (seconds)</Label><Input id="routine-rest" type="number" min="0" value={rest} onChange={event => setRest(event.target.value)} aria-invalid={Boolean(validationErrors.defaultRestSeconds)} aria-describedby={validationErrors.defaultRestSeconds ? 'routine-rest-error' : undefined} /><p className="text-xs text-muted-foreground">Default rest — used when an exercise item has no rest override.</p>{validationErrors.defaultRestSeconds ? <p id="routine-rest-error" className="text-xs font-semibold text-destructive" role="alert">{validationErrors.defaultRestSeconds}</p> : null}</div>
           </div>
           <div className="space-y-2"><Label htmlFor="routine-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="routine-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Add a personal cue or reminder for this routine." /></div>
           <div aria-live="polite"><p className="text-xs font-bold text-muted-foreground">{routineSummary}</p><p className="mt-1 text-xs text-muted-foreground">{formatWorkoutDuration(configuredDuration)}</p></div>
        </div>
      </section>

      <section aria-labelledby="routine-reference-heading" className="mt-7 border-t border-border/60 pt-7">
        <div>
          <h3 id="routine-reference-heading" className="text-base font-black">Workout cover</h3>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
          <WorkoutReferenceMedia profileId={profileId} exerciseName={`${name || initialRoutine?.name || 'Workout'} cover`} referencePhotoAssetId={photoPreviewUrl || imageUrl.trim() ? undefined : (removeExistingPhoto ? undefined : initialRoutine?.referencePhotoAssetId)} staticImageSrc={photoPreviewUrl || imageUrl.trim() || (firstRoutineExercise?.source === 'builtin' && !firstRoutineExercise.catalogSource ? getBuiltinWorkoutReferenceImage(firstRoutineExercise.id) : undefined)} referenceVideoUrl={tutorial.trim() || undefined} emptyLabel="Choose a cover photo or add a tutorial" variant="card" className="rounded-2xl border border-border/60" />
          <div className="space-y-3">
            <input ref={photoInputRef} id="routine-cover-photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label="Choose routine cover photo" onChange={event => { setPhoto(event.target.files?.[0] || null); setRemoveExistingPhoto(false); }} />
            <div className="flex min-h-16 flex-wrap items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-muted-foreground" aria-hidden="true"><Upload className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <OverflowTooltip text={photo?.name || (removeExistingPhoto ? 'Cover photo will be removed' : initialRoutine?.referencePhotoAssetId ? 'Cover photo saved' : 'No photo selected')}><p className="truncate text-sm font-bold" aria-live="polite">{photo?.name || (removeExistingPhoto ? 'Cover photo will be removed' : initialRoutine?.referencePhotoAssetId ? 'Cover photo saved' : 'No photo selected')}</p></OverflowTooltip>
              </div>
              <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                <button type="button" className={`${control} flex-1 sm:flex-none`} onClick={() => photoInputRef.current?.click()} disabled={busy}>{photo || initialRoutine?.referencePhotoAssetId ? 'Replace' : copyMode ? 'Add personal photo' : 'Choose photo'}</button>
                {photo ? <button type="button" className={`${control} size-11 px-0`} onClick={() => { setPhoto(null); if (photoInputRef.current) photoInputRef.current.value = ''; }} disabled={busy} aria-label={`Remove selected cover photo ${photo.name}`}><X className="h-4 w-4" /></button> : initialRoutine?.referencePhotoAssetId && !removeExistingPhoto ? <button type="button" className={`${control} size-11 px-0`} onClick={() => setRemoveExistingPhoto(true)} disabled={busy} aria-label="Remove saved workout cover photo"><X className="h-4 w-4" /></button> : null}
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="routine-cover-image-url">Image URL <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="routine-cover-image-url" value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://example.com/workout-cover.jpg" inputMode="url" /></div>
            <div className="space-y-2"><Label htmlFor="routine-cover-video">Tutorial video URL <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="routine-cover-video" value={tutorial} onChange={event => setTutorial(event.target.value)} placeholder="https://youtube.com/watch?v=..." inputMode="url" aria-invalid={Boolean(validationErrors.referenceVideoUrl)} aria-describedby={validationErrors.referenceVideoUrl ? 'routine-cover-video-error' : undefined} />{validationErrors.referenceVideoUrl ? <p id="routine-cover-video-error" className="text-xs font-semibold text-destructive" role="alert">{validationErrors.referenceVideoUrl}</p> : null}</div>
          </div>
        </div>
      </section>

      <div className="mt-7 grid gap-7 border-t border-border/60 pt-7 lg:grid-cols-[minmax(0,3fr)_minmax(19rem,2fr)] lg:gap-0">
          <section aria-labelledby="routine-exercises-heading" className="min-w-0 lg:pr-6">
          <div className="flex items-end justify-between gap-3">
            <div>
             <h3 id="routine-exercises-heading" className="text-base font-black">Routine exercises</h3>
             {validationErrors.items ? <p className="mt-2 text-xs font-semibold text-destructive" role="alert">{validationErrors.items}</p> : null}
             </div>
             <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{items.length} {items.length === 1 ? 'exercise' : 'exercises'}</span>
          </div>
          {items.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center">
               <p className="text-sm font-bold">No exercises yet</p>
               <p className="mt-1 text-sm text-muted-foreground">Choose exercises from the library to start building the routine.</p>
            </div>
          ) : (
            <ol className="mt-4 space-y-3">
              {items.map((item, index) => {
                const exercise = exercises.find(candidate => candidate.id === item.exerciseId);
                const targetMode = item.targetMode || exercise?.targetMode || 'manual';
                const itemLoadMode = exercise?.loadMode ?? inferWorkoutLoadMode(exercise?.equipment, exercise?.name);
                const targetLoadLabel = itemLoadMode === 'assistance' ? 'Target assistance'
                  : itemLoadMode === 'bodyweight-plus' ? 'Target added load'
                    : 'Target load';
                const targetSummary = targetMode === 'reps'
                  ? `${item.reps || exercise?.defaultReps || 1} reps`
                  : targetMode === 'manual'
                    ? 'Complete when ready'
                    : `${item.durationSeconds || exercise?.defaultDurationSeconds || 0} sec${targetMode === 'hold' ? ' hold' : ''}`;
                const effectiveRestSeconds = item.restSeconds ?? Number(rest) ?? exercise?.defaultRestSeconds ?? 0;
                const expanded = expandedItemId === item.id;
                const previousExerciseSession = deriveExercisePerformance(item.exerciseId, sessions).history
                  .find(group => group.sets.some(set => set.status === 'completed' && !set.warmup));
                const previousWorkingSets = previousExerciseSession?.sets
                  .filter(set => set.status === 'completed' && !set.warmup)
                  .slice(0, 2) || [];
                const nextItem = items[index + 1];
                const isPairedWithNext = Boolean(item.supersetGroupId && nextItem?.supersetGroupId === item.supersetGroupId);
                const pairWithNext = () => {
                  if (!nextItem) return;
                  const groupId = item.supersetGroupId || nextItem.supersetGroupId || createEntityId('superset');
                  setItems(current => current.map(candidate => (candidate.id === item.id || candidate.id === nextItem.id) ? { ...candidate, supersetGroupId: groupId } : candidate));
                };
                const unpairFromNext = () => setItems(current => current.map(candidate => candidate.id === item.id ? { ...candidate, supersetGroupId: undefined } : candidate));
                const metadataParts = [
                  exercise ? `${WORKOUT_EXERCISE_CATEGORY_LABELS[deriveWorkoutExerciseCategory(exercise)]} · ${exercise.category}` : null,
                  targetSummary,
                  `${item.sets || 1} sets`,
                  `${effectiveRestSeconds}s rest`,
                  item.warmupSets ? `${item.warmupSets} warm-up` : null,
                ].filter(Boolean).join(' · ');
                return (
                <li key={item.id}>
                <div className="rounded-xl border border-border/60 bg-card px-3 py-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-black text-muted-foreground">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <OverflowTooltip text={formatWorkoutExerciseName(item.exerciseNameSnapshot, item.exerciseId)}><p className="truncate text-sm font-bold">{formatWorkoutExerciseName(item.exerciseNameSnapshot, item.exerciseId)}{item.unavailableReference && <span className="ml-1 text-xs font-semibold text-amber-600 dark:text-amber-300">· Unavailable</span>}</p></OverflowTooltip>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{metadataParts}</p>
                      {previousExerciseSession ? <p className="mt-1 truncate text-caption text-muted-foreground">Last logged {new Date(previousExerciseSession.session.completedAt || previousExerciseSession.session.startedAt).toLocaleDateString()}: {previousWorkingSets.map(set => {
                        const mode = set.loadMode ?? exercise?.loadMode ?? inferWorkoutLoadMode(exercise?.equipment, exercise?.name);
                        const prefix = mode === 'assistance' ? 'Assist ' : mode === 'bodyweight-plus' ? 'Added ' : '';
                        return set.actualWeight !== undefined ? `${prefix}${set.actualWeight} × ${set.actualReps ?? '—'}` : set.actualDurationSeconds !== undefined ? `${set.actualDurationSeconds}s` : `${set.actualReps ?? '—'} reps`;
                      }).join(' · ')}</p> : null}
                    </div>
                    <button type="button" className={`${control} size-9 shrink-0 px-0 ${expanded ? 'border-primary/50 bg-primary/10 text-primary' : ''}`} onClick={() => setExpandedItemId(expanded ? null : item.id)} aria-expanded={expanded} aria-controls={`routine-item-config-${item.id}`} aria-label={`${expanded ? 'Hide configuration for' : 'Configure'} ${formatWorkoutExerciseName(item.exerciseNameSnapshot, item.exerciseId)}`}><Settings2 className="h-4 w-4" /></button>
                    <button type="button" className={`${control} size-9 shrink-0 px-0`} onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${formatWorkoutExerciseName(item.exerciseNameSnapshot, item.exerciseId)} up`}><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" className={`${control} size-9 shrink-0 px-0`} onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move ${formatWorkoutExerciseName(item.exerciseNameSnapshot, item.exerciseId)} down`}><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" className={`${control} size-9 shrink-0 px-0 text-destructive hover:bg-destructive/10`} onClick={() => setItems(current => current.filter(candidate => candidate.id !== item.id))} aria-label={`Remove ${formatWorkoutExerciseName(item.exerciseNameSnapshot, item.exerciseId)}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                   {expanded ? <div id={`routine-item-config-${item.id}`} className="mt-3 grid gap-3 border-t border-border/50 pt-3 sm:grid-cols-2 xl:grid-cols-4">
                     <div className="space-y-2"><Label>Target</Label><WorkoutSelect value={targetMode} onValueChange={value => updateItem(item.id, { targetMode: value as WorkoutRoutineItem['targetMode'] })} label={`Target for ${formatWorkoutExerciseName(item.exerciseNameSnapshot, item.exerciseId)}`} options={[{ value: 'reps', label: 'Reps' }, { value: 'timed', label: 'Timed' }, { value: 'hold', label: 'Hold' }, { value: 'manual', label: 'Manual' }]} /></div>
                     <div className="space-y-2"><Label htmlFor={`routine-item-${item.id}-sets`}>Sets per round</Label><Input id={`routine-item-${item.id}-sets`} type="number" min="1" value={item.sets || 1} onChange={event => updateItem(item.id, { sets: Number(event.target.value) })} /></div>
                    {targetMode === 'reps' ? <div className="space-y-2"><Label htmlFor={`routine-item-${item.id}-reps`}>Reps</Label><Input id={`routine-item-${item.id}-reps`} type="number" min="1" value={item.reps || 1} onChange={event => updateItem(item.id, { reps: Number(event.target.value) })} /></div> : targetMode === 'timed' || targetMode === 'hold' ? <div className="space-y-2"><Label htmlFor={`routine-item-${item.id}-seconds`}>{targetMode === 'hold' ? 'Hold' : 'Duration'} (seconds)</Label><Input id={`routine-item-${item.id}-seconds`} type="number" min="0" value={item.durationSeconds || 0} onChange={event => updateItem(item.id, { durationSeconds: Number(event.target.value) })} /></div> : <div className="hidden xl:block" />}
                      <div className="space-y-2"><Label htmlFor={`routine-item-${item.id}-rest`}>Rest after this set</Label><Input id={`routine-item-${item.id}-rest`} type="number" min="0" value={effectiveRestSeconds} onChange={event => updateItem(item.id, { restSeconds: Number(event.target.value) })} /><p className="text-xs text-muted-foreground">Before the next slot when configured.</p></div>
                    {targetMode === 'reps' ? <div className="space-y-2"><Label htmlFor={`routine-item-${item.id}-weight`}>{targetLoadLabel} <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`routine-item-${item.id}-weight`} type="number" min="0" step="0.5" value={item.targetWeight ?? ''} placeholder={itemLoadMode === 'none' ? 'No load' : 'Optional'} onChange={event => updateItem(item.id, { targetWeight: event.target.value === '' ? undefined : Number(event.target.value) })} /></div> : null}
                     <div className="space-y-2"><Label htmlFor={`routine-item-${item.id}-warmup`}>Warm-up sets</Label><Input id={`routine-item-${item.id}-warmup`} type="number" min="0" max={Math.max(0, (item.sets || 1) - 1)} value={item.warmupSets ?? 0} onChange={event => updateItem(item.id, { warmupSets: Number(event.target.value) })} /><p className="text-xs text-muted-foreground">Leading sets excluded from history and PRs.</p></div>
                    <div className="space-y-2 sm:col-span-2 xl:col-span-4"><Label htmlFor={`routine-item-${item.id}-notes`}>Exercise cue <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id={`routine-item-${item.id}-notes`} value={item.notes || ''} onChange={event => updateItem(item.id, { notes: event.target.value || undefined })} placeholder="A reminder to carry into this routine." rows={2} /></div>
                  </div> : null}
                </div>
                {nextItem ? <div className="flex justify-center py-1">
                  {isPairedWithNext ? (
                    <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-caption font-black text-primary" onClick={unpairFromNext}><Link2 className="h-3 w-3" />Superset<X className="h-3 w-3" /></button>
                  ) : (
                    <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-border/60 px-3 py-1 text-caption font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary" onClick={pairWithNext}><Link2 className="h-3 w-3" />Superset with next</button>
                  )}
                </div> : null}
                </li>
                );
              })}
            </ol>
          )}
        </section>

        <section aria-labelledby="routine-library-heading" className="min-w-0 border-t border-border/60 pt-7 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div>
            <h3 id="routine-library-heading" className="text-base font-black">Add exercises</h3>
          </div>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen} modal={false}>
            <PopoverTrigger asChild>
              <button type="button" className={`${control} mt-4 w-full justify-between text-left`} aria-label="Search routine exercises" aria-expanded={pickerOpen}>
                <span className="flex min-w-0 items-center gap-2"><Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className={`truncate ${pickerQuery ? 'text-foreground' : 'text-muted-foreground'}`}>{pickerQuery || 'Find an exercise to add'}</span></span>
                <span className="shrink-0 text-caption text-muted-foreground">{pickerExercises.length}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" collisionPadding={12} onOpenAutoFocus={event => event.preventDefault()} className="w-[var(--radix-popover-trigger-width)] min-w-0 overflow-hidden rounded-xl border-border bg-popover p-0 shadow-xl">
              <Command shouldFilter={false}>
                <CommandInput value={pickerQuery} onValueChange={setPickerQuery} placeholder="Find an exercise to add" />
                <CommandList className="max-h-[min(42dvh,28rem)]">
                  <CommandEmpty>No exercises match those filters.</CommandEmpty>
                  {pickerExercises.map(exercise => {
                    const selected = selectedExerciseIds.has(exercise.id);
                    const pending = pickerSelection.includes(exercise.id);
                    const unavailable = Boolean(exercise.archived);
                    return <div key={exercise.id} className="flex items-center gap-1 px-1">
                      <CommandItem value={exercise.id} onSelect={() => togglePickerExercise(exercise.id)} disabled={unavailable || selected} className={`min-h-11 min-w-0 flex-1 rounded-lg px-3 ${unavailable ? 'border-dashed opacity-60' : selected || pending ? 'bg-primary/5' : ''}`}>
                        <span className="flex min-w-0 flex-1 items-center gap-2"><span className="shrink-0">{selected || pending || unavailable ? <Check className="size-4" /> : <Plus className="size-4" />}</span><OverflowTooltip text={formatWorkoutExerciseName(exercise.name, exercise.id)}><span className="min-w-0 flex-1 truncate">{formatWorkoutExerciseName(exercise.name, exercise.id)}</span></OverflowTooltip><span className="truncate text-caption text-muted-foreground">{exercise.catalogSource === 'opengym' ? 'Starting · ' : ''}{exercise.targetMode === 'reps' ? `${exercise.defaultReps || 1} reps` : exercise.targetMode === 'manual' ? 'Manual' : `${exercise.defaultDurationSeconds || 0}s`}</span></span><span className="max-w-24 truncate text-xs font-semibold text-muted-foreground">{unavailable ? 'Unavailable' : selected ? 'Added' : pending ? 'Pending' : exercise.category}</span>
                      </CommandItem>
                      <button type="button" className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" aria-pressed={favoriteExerciseIds.has(exercise.id)} aria-label={`${favoriteExerciseIds.has(exercise.id) ? 'Remove' : 'Add'} ${formatWorkoutExerciseName(exercise.name, exercise.id)} ${favoriteExerciseIds.has(exercise.id) ? 'from' : 'to'} favorites`} onPointerDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); onToggleFavorite(exercise.id); }}><Star className={`size-4 ${favoriteExerciseIds.has(exercise.id) ? 'fill-current text-primary' : ''}`} aria-hidden="true" /></button>
                    </div>;
                  })}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
           <div className="scrollbar-hide mt-3 flex snap-x snap-proximity scroll-px-1 gap-2 overflow-x-auto overscroll-x-contain pb-1" role="group" aria-label="Filter exercises by training category">
             {[['all', 'All'], ...WORKOUT_EXERCISE_CATEGORIES.map(value => [value, WORKOUT_EXERCISE_CATEGORY_LABELS[value]] as const)].map(([value, label]) => <button key={value} type="button" aria-pressed={pickerTrainingCategory === value} className={`${pickerTrainingCategory === value ? 'border-primary/50 bg-primary/10 text-primary' : ''} ${control} shrink-0`} onClick={() => setPickerTrainingCategory(value as typeof pickerTrainingCategory)}>{label}</button>)}
           </div>
            <div className="mt-3">
              <WorkoutSelect value={pickerCategory} onValueChange={setPickerCategory} label="Filter by body area" options={[{ value: 'all', label: 'All body areas' }, ...categories.map(category => ({ value: category, label: category }))]} />
            </div>
           <details className="mt-3 rounded-xl border border-border/60 bg-background/30 p-1.5">
             <summary className="flex min-h-11 cursor-pointer items-center px-2 py-2 text-xs font-black">More filters</summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <WorkoutSelect value={pickerKind} onValueChange={value => setPickerKind(value as typeof pickerKind)} label="Filter by exercise type" options={[{ value: 'all', label: 'All types' }, { value: 'exercise', label: 'Exercise' }, { value: 'stretch', label: 'Stretch' }]} />
                <WorkoutSelect value={pickerEquipment} onValueChange={setPickerEquipment} label="Filter by equipment" options={[{ value: 'all', label: 'All equipment' }, ...equipmentOptions.map(equipment => ({ value: equipment, label: equipment }))]} />
               <WorkoutSelect value={pickerTargetMode} onValueChange={value => setPickerTargetMode(value as typeof pickerTargetMode)} label="Filter by target" options={[{ value: 'all', label: 'All targets' }, { value: 'timed', label: 'Timed' }, { value: 'reps', label: 'Reps' }, { value: 'hold', label: 'Hold' }, { value: 'manual', label: 'Manual' }]} />
             </div>
           </details>
           {onCreateExercise ? <button type="button" className={`${control} mt-3 w-full`} onClick={() => onCreateExercise({ name, description: '', notes, rounds, rest, items })}><Plus className="h-4 w-4" />New exercise</button> : null}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <p className="text-xs font-bold text-muted-foreground" aria-live="polite">{pickerSelection.length} selected</p>
            <button type="button" className={primary} onClick={commitPickerSelection} disabled={pickerSelection.length === 0}>Add {pickerSelection.length} {pickerSelection.length === 1 ? 'exercise' : 'exercises'}</button>
          </div>
        </section>
      </div>
      {status && <p className="mt-3 text-sm font-semibold text-primary" role="status">{status}</p>}
      {error && <p className="mt-3 text-sm font-bold text-destructive" role="alert">{error}</p>}
      </div>
    </CaizenFormDialog>
    <ConfirmDialog isOpen={closeState === 'confirming'} title="Discard unsaved workout changes?" message="Your routine edits have not been saved yet." confirmText="Discard changes" cancelText="Keep editing" isDangerous={false} onCancel={() => setCloseState('idle')} onConfirm={() => { setCloseState('idle'); onCancel(); }} />
    </>
  );
}

function ExerciseDetail({
  exercise,
  androidPresentation = false,
  profileId,
  sessions,
  onClose,
  onAddToRoutine,
  onCustomize,
  onRestoreFocus,
}: {
  exercise: WorkoutExerciseDefinition;
  androidPresentation?: boolean;
  profileId: string;
  sessions: ReturnType<typeof useAppContext>['workoutSessions'];
  onClose: () => void;
  onAddToRoutine: () => void;
  onCustomize: () => void;
  onRestoreFocus: () => void;
}) {
  const [open, setOpen] = useState(true);
  const pendingActionRef = useRef<'close' | 'add' | 'customize'>('close');
  const exerciseLoadMode = exercise.loadMode ?? inferWorkoutLoadMode(exercise.equipment, exercise.name);
  const resolveExerciseLoadMode = (exerciseId: string) => exerciseId === exercise.id ? exerciseLoadMode : undefined;
  const lastTime = getLastExerciseSummary(exercise.id, sessions);
  const performance = deriveExercisePerformance(exercise.id, sessions, resolveExerciseLoadMode);
  const [animationUrl, setAnimationUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void resolveRemoteExerciseAnimation(exercise).then(url => { if (!cancelled) setAnimationUrl(url); });
    return () => { cancelled = true; };
  }, [exercise]);

  const target = exercise.targetMode === 'reps'
    ? `${exercise.defaultReps || 1} reps`
    : exercise.targetMode === 'manual'
      ? 'Complete when ready'
      : `${exercise.defaultDurationSeconds || 0} sec${exercise.targetMode === 'hold' ? ' hold' : ''}`;
  const steps = exercise.instructionSteps?.length
    ? exercise.instructionSteps
    : exercise.instructions
      ? [exercise.instructions]
      : [`Set up for ${exercise.name.toLocaleLowerCase()} with a steady posture.`, `Move with control for ${target.toLocaleLowerCase()}.`];
  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen) {
          pendingActionRef.current = 'close';
          setOpen(false);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        allowOutsideDismiss={androidPresentation}
        className="max-w-2xl"
        aria-describedby="workout-exercise-detail-description"
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (pendingActionRef.current === 'close') {
            onRestoreFocus();
            onClose();
          } else if (pendingActionRef.current === 'customize') {
            onCustomize();
          } else onAddToRoutine();
        }}
      >
        <DialogHeader>
          <p className="text-xs font-black uppercase tracking-wider text-primary">{exercise.kind === 'stretch' ? 'Stretch' : 'Exercise'} details</p>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-2xl font-black">{formatWorkoutExerciseName(exercise.name, exercise.id)}</DialogTitle>
            {exercise.catalogSource === 'opengym' ? <span className="rounded-full border border-border/60 px-2 py-1 text-label text-muted-foreground">OpenGym catalog</span> : null}
          </div>
          <DialogDescription id="workout-exercise-detail-description">Review the exercise, then add it to a routine when you are ready.</DialogDescription>
        </DialogHeader>
        <button type="button" className={`${control} absolute top-3 right-3`} onClick={() => { pendingActionRef.current = 'close'; setOpen(false); }} aria-label={`Close ${formatWorkoutExerciseName(exercise.name, exercise.id)} details`}><X className="h-4 w-4" /></button>
          <div className="mt-2 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <WorkoutReferenceMedia profileId={profileId} exerciseName={formatWorkoutExerciseName(exercise.name, exercise.id)} referencePhotoAssetId={exercise.referencePhotoAssetId} staticImageSrc={exercise.source === 'builtin' && !exercise.catalogSource ? getBuiltinWorkoutReferenceImage(exercise.id) : undefined} animationUrl={animationUrl} referenceVideoUrl={exercise.referenceVideoUrl} />
          <div className="space-y-3 text-sm">
            <div>
              <h3 className="font-semibold">{exercise.catalogSource === 'opengym' ? 'Starting settings' : 'Exercise setup'}</h3>
              {exercise.catalogSource === 'opengym' ? <p className="mt-1 text-xs text-muted-foreground">OpenGym does not provide exercise-specific prescriptions. Adjust these starting values in your routine.</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="rounded-xl bg-background/50 p-3"><strong className="block text-xs uppercase tracking-wider text-muted-foreground">Target</strong>{target}</span>
              {isExerciseDifficultyFilterable(exercise) ? <span className="rounded-xl bg-background/50 p-3"><strong className="block text-xs uppercase tracking-wider text-muted-foreground">Difficulty</strong>{difficultyLabel(exercise.difficulty)}</span> : null}
              <span className="rounded-xl bg-background/50 p-3"><strong className="block text-xs uppercase tracking-wider text-muted-foreground">Training category</strong>{WORKOUT_EXERCISE_CATEGORY_LABELS[deriveWorkoutExerciseCategory(exercise)]}</span>
              <span className="rounded-xl bg-background/50 p-3"><strong className="block text-xs uppercase tracking-wider text-muted-foreground">Body area</strong>{exercise.category}</span>
              <span className="rounded-xl bg-background/50 p-3"><strong className="block text-xs uppercase tracking-wider text-muted-foreground">Equipment</strong>{exercise.equipment}</span>
              <span className="rounded-xl bg-background/50 p-3"><strong className="block text-xs uppercase tracking-wider text-muted-foreground">{exercise.catalogSource === 'opengym' ? 'Starting sets' : 'Sets'}</strong>{exercise.defaultSets || 1}</span>
              <span className="rounded-xl bg-background/50 p-3"><strong className="block text-xs uppercase tracking-wider text-muted-foreground">{exercise.catalogSource === 'opengym' ? 'Starting rest' : 'Rest'}</strong>{exercise.defaultRestSeconds ?? 0} sec</span>
              {exercise.primaryMuscle && <span className="rounded-xl bg-background/50 p-3"><strong className="block text-xs uppercase tracking-wider text-muted-foreground">Primary target</strong>{formatExerciseDisplayName(exercise.primaryMuscle)}</span>}
              {exercise.secondaryMuscles?.length ? <span className="rounded-xl bg-background/50 p-3"><strong className="block text-xs uppercase tracking-wider text-muted-foreground">Also works</strong>{exercise.secondaryMuscles.map(formatExerciseDisplayName).join(', ')}</span> : null}
              <span className="rounded-xl bg-background/50 p-3"><strong className="block text-xs uppercase tracking-wider text-muted-foreground">Load tracking</strong>{exerciseLoadMode === 'none' ? 'No recorded load' : exerciseLoadMode === 'assistance' ? 'Assistance · lower is less help' : exerciseLoadMode === 'bodyweight-plus' ? 'Added load with bodyweight' : 'External load'}</span>
            </div>
            {exercise.purpose && <p className="rounded-xl border border-border/60 bg-background/35 p-3 text-muted-foreground"><strong className="block text-xs uppercase tracking-wider text-foreground">Purpose</strong><span className="mt-1 block">{exercise.purpose}</span></p>}
            {lastTime && (
              <details className="rounded-xl border border-border/60 bg-background/35 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Last session · {lastTime.date.toLocaleDateString()}</summary>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {lastTime.sets.slice(0, 6).map(set => {
                    const mode = set.loadMode ?? exerciseLoadMode;
                    const prefix = mode === 'assistance' ? 'Assist ' : mode === 'bodyweight-plus' ? 'Added ' : '';
                    const effort = set.rir !== undefined ? ` · RIR ${set.rir}` : set.rpe !== undefined ? ` · RPE ${set.rpe}` : '';
                    return <li key={set.slotId}>Set {set.setIndex + 1}{set.warmup ? ' (warm-up)' : ''}: {set.status !== 'completed' ? set.status : set.actualWeight !== undefined ? `${prefix}${set.actualWeight} × ${set.actualReps ?? '—'}` : set.actualReps !== undefined ? `${set.actualReps} reps` : set.actualDurationSeconds !== undefined ? `${set.actualDurationSeconds}s` : 'recorded'}{effort}</li>;
                  })}
                </ul>
              </details>
            )}
            {performance.history.length ? (
              <details className="rounded-xl border border-border/60 bg-background/35 p-3" aria-label="Exercise performance history">
                <summary className="cursor-pointer text-sm font-semibold">Recent history and progress <span className="text-xs font-normal text-muted-foreground">· loads use your entered scale</span></summary>
                <div className="mt-3">
                {performance.progression ? <p className="mt-2 rounded-lg bg-primary/5 px-2.5 py-2 text-xs leading-5 text-foreground">{performance.progression}</p> : null}
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  {performance.highestLoad ? <p className="rounded-lg bg-background/60 p-2"><strong className="block text-muted-foreground">{exerciseLoadMode === 'bodyweight-plus' ? 'Highest added load' : 'Highest entered load'}</strong>{performance.highestLoad.value}</p> : null}
                  {performance.lowestAssistance ? <p className="rounded-lg bg-background/60 p-2"><strong className="block text-muted-foreground">Least assistance</strong>{performance.lowestAssistance.value}</p> : null}
                  {performance.highestRepsAtLoad ? <p className="rounded-lg bg-background/60 p-2"><strong className="block text-muted-foreground">{exerciseLoadMode === 'assistance' ? `Rep best with ${performance.highestRepsAtLoad.value} assistance` : exerciseLoadMode === 'bodyweight-plus' ? `Rep best at ${performance.highestRepsAtLoad.value} added load` : `Rep best at ${performance.highestRepsAtLoad.value}`}</strong>{performance.highestRepsAtLoad.reps} reps</p> : null}
                  {performance.estimatedOneRepMax ? <p className="rounded-lg bg-background/60 p-2"><strong className="block text-muted-foreground">Estimated 1RM</strong>{performance.estimatedOneRepMax.value.toFixed(1)} entered-load units</p> : null}
                  {performance.longestTimedSet ? <p className="rounded-lg bg-background/60 p-2"><strong className="block text-muted-foreground">Longest timed set</strong>{Math.floor(performance.longestTimedSet.value / 60)}:{String(performance.longestTimedSet.value % 60).padStart(2, '0')}</p> : null}
                </div>
                <ol className="mt-3 max-h-52 space-y-2 overflow-y-auto text-xs">
                  {performance.history.slice(0, 8).map(({ session, sets }) => (
                    <li key={session.id} className="border-t border-border/50 pt-2">
                      <p className="font-bold">{new Date(session.completedAt || session.startedAt).toLocaleDateString()} · {session.routineName}{session.status === 'partial' ? ' · Partial session' : ''}</p>
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {sets.map(set => {
                          const setLoadMode = set.loadMode ?? exerciseLoadMode;
                          const setLoadPrefix = setLoadMode === 'assistance' ? 'Assist ' : setLoadMode === 'bodyweight-plus' ? 'Added ' : '';
                          const sideSummary = set.actualRepsLeft !== undefined || set.actualRepsRight !== undefined
                            ? `L ${set.actualRepsLeft ?? '—'}${set.actualWeightLeft !== undefined ? ` @ ${setLoadPrefix}${set.actualWeightLeft}` : ''} · R ${set.actualRepsRight ?? '—'}${set.actualWeightRight !== undefined ? ` @ ${setLoadPrefix}${set.actualWeightRight}` : ''}`
                            : set.actualWeight !== undefined
                              ? `${setLoadPrefix}${set.actualWeight} × ${set.actualReps ?? '—'}`
                              : set.actualReps !== undefined
                                ? `${set.actualReps} reps`
                                : set.actualDurationSeconds !== undefined
                                  ? `${set.actualDurationSeconds}s`
                                  : set.status;
                          const effort = set.rir !== undefined ? ` · RIR ${set.rir}` : set.rpe !== undefined ? ` · RPE ${set.rpe}` : '';
                          return <li key={set.slotId}>Set {set.setIndex + 1}{set.warmup ? ' · warm-up' : ''}: {sideSummary}{effort}</li>;
                        })}
                      </ul>
                    </li>
                  ))}
                </ol>
                </div>
              </details>
            ) : null}
          </div>
        </div>
        <details className="mt-2 rounded-2xl border border-border/60 bg-background/35 p-4">
          <summary className="cursor-pointer font-semibold">How to do it</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-muted-foreground">{steps.map((step, index) => <li key={`${exercise.id}-step-${index}`}>{step}</li>)}</ol>
          {(exercise.formCues?.length || exercise.notes) && <><h4 className="mt-4 font-black">Form reminders</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">{(exercise.formCues?.length ? exercise.formCues : [exercise.notes!]).map((cue, index) => <li key={`${exercise.id}-cue-${index}`}>{cue}</li>)}</ul></>}
        </details>
        <DialogFooter>
          <button type="button" className={primary} onClick={() => { pendingActionRef.current = 'add'; setOpen(false); }}><Plus className="h-4 w-4" />Add to routine</button>
          {exercise.source !== 'custom' ? <button type="button" className={control} onClick={() => { pendingActionRef.current = 'customize'; setOpen(false); }}><Pencil className="h-4 w-4" />Customize</button> : null}
          <button type="button" className={control} onClick={() => { pendingActionRef.current = 'close'; setOpen(false); }}>Close</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExerciseLibraryCard({
  exercise,
  profileId,
  androidPresentation,
  hasReferencePhoto,
  selected,
  favorite,
  routineReferenceCount,
  onToggleFavorite,
  onToggleSelect,
  onSelect,
  onEdit,
  onDelete,
}: {
  exercise: WorkoutExerciseDefinition;
  profileId: string;
  androidPresentation: boolean;
  hasReferencePhoto: (exercise: WorkoutExerciseDefinition) => boolean;
  selected: boolean;
  favorite: boolean;
  routineReferenceCount: number;
  onToggleFavorite: (exerciseId: string) => void;
  onToggleSelect: (exerciseId: string) => void;
  onSelect: (exercise: WorkoutExerciseDefinition, trigger: HTMLButtonElement) => void;
  onEdit: (exercise: WorkoutExerciseDefinition) => void;
  onDelete: (exercise: WorkoutExerciseDefinition) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [animationUrl, setAnimationUrl] = useState<string | null>(null);
  const staticImageSrc = exercise.source === 'builtin' && !exercise.catalogSource
    ? getBuiltinWorkoutReferenceImage(exercise.id)
    : undefined;

  useEffect(() => {
    if (exercise.catalogSource !== 'opengym' || !exercise.catalogMediaId) return;
    const card = cardRef.current;
    if (!card) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px 0px' });
    observer.observe(card);
    return () => observer.disconnect();
  }, [exercise.catalogMediaId, exercise.catalogSource]);

  useEffect(() => {
    if (!nearViewport || exercise.catalogSource !== 'opengym' || !exercise.catalogMediaId) return;
    let current = true;
    setAnimationUrl(null);
    void resolveRemoteExerciseAnimation({ catalogSource: exercise.catalogSource, catalogMediaId: exercise.catalogMediaId }).then(url => {
      if (current) setAnimationUrl(url);
    });
    return () => { current = false; };
  }, [exercise.catalogMediaId, exercise.catalogSource, nearViewport]);

  return (
    <article ref={cardRef} className={`overflow-hidden rounded-2xl border bg-background/35 transition-colors ${selected ? 'border-primary ring-2 ring-primary/40' : 'border-border/60'}`}>
      <div className="relative">
        <WorkoutReferenceMedia profileId={profileId} exerciseName={formatWorkoutExerciseName(exercise.name, exercise.id)} referencePhotoAssetId={exercise.referencePhotoAssetId} staticImageSrc={staticImageSrc} animationUrl={animationUrl} compactPlaceholder emptyLabel="No reference image" variant="card" />
        <button
          type="button"
          className="absolute top-2 left-2 z-10 grid size-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          onClick={event => { event.stopPropagation(); onToggleSelect(exercise.id); }}
          aria-pressed={selected}
          aria-label={selected ? `Remove ${formatWorkoutExerciseName(exercise.name, exercise.id)} from selection` : `Select ${formatWorkoutExerciseName(exercise.name, exercise.id)}`}
        >
          <span className={`grid size-7 place-items-center rounded-full border shadow-sm transition-colors ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border/80 bg-background/95 text-transparent hover:border-primary/70 hover:text-muted-foreground'}`}>
            <Check className="size-3.5" aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          className={`absolute top-2 right-2 z-10 grid size-11 place-items-center rounded-full border bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${favorite ? 'border-primary/50 text-primary' : 'border-border/70'}`}
          onClick={event => { event.stopPropagation(); onToggleFavorite(exercise.id); }}
          aria-pressed={favorite}
          aria-label={`${favorite ? 'Remove' : 'Add'} ${formatWorkoutExerciseName(exercise.name, exercise.id)} ${favorite ? 'from' : 'to'} favorites`}
        ><Star className={`size-4 ${favorite ? 'fill-current' : ''}`} aria-hidden="true" /></button>
      </div>
      <button type="button" className="block w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 lg:p-3" onClick={event => onSelect(exercise, event.currentTarget)} aria-label={`View details for ${formatWorkoutExerciseName(exercise.name, exercise.id)}`}>
        <div className="min-w-0">
          <OverflowTooltip text={formatWorkoutExerciseName(exercise.name, exercise.id)}><h4 className="truncate text-base font-black">{formatWorkoutExerciseName(exercise.name, exercise.id)}</h4></OverflowTooltip>
          <p className="mt-1 text-sm font-bold text-primary">{exercise.catalogSource === 'opengym' ? 'Starting · ' : ''}{exercise.targetMode === 'reps' ? `${exercise.defaultReps || 1} reps` : exercise.targetMode === 'manual' ? 'Complete when ready' : `${exercise.defaultDurationSeconds || 0} sec${exercise.targetMode === 'hold' ? ' hold' : ''}`}</p>
        </div>
        <p className="mt-2 text-xs font-bold text-muted-foreground">{WORKOUT_EXERCISE_CATEGORY_LABELS[deriveWorkoutExerciseCategory(exercise)]} · {exercise.category}</p>
        <p className="mt-1 text-xs text-muted-foreground">{isExerciseDifficultyFilterable(exercise) ? `${difficultyLabel(exercise.difficulty)} · ` : ''}{exerciseCatalogLabel(exercise)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hasReferencePhoto(exercise) ? 'Photo · ' : ''}{exercise.referenceVideoUrl ? 'Tutorial available' : 'No tutorial'}</p>
      </button>
      {exercise.source === 'custom' ? (
        <div className="flex justify-end px-4 pb-3 lg:px-3">
          <HealthOverflowMenu
            title={`${formatWorkoutExerciseName(exercise.name, exercise.id)} actions`}
            ariaLabel={`More actions for ${formatWorkoutExerciseName(exercise.name, exercise.id)}`}
            androidPresentation={androidPresentation}
            actions={[
              { label: 'Edit', icon: Pencil, onSelect: () => onEdit(exercise) },
              { label: 'Delete exercise', icon: Trash2, destructive: true, onSelect: () => setDeleteOpen(true) },
            ]}
          />
        </div>
      ) : null}
      <ConfirmDialog
        isOpen={deleteOpen}
        title={`Delete ${formatWorkoutExerciseName(exercise.name, exercise.id)}?`}
        message={routineReferenceCount
          ? `This removes the custom exercise from your library. ${routineReferenceCount} saved ${routineReferenceCount === 1 ? 'routine keeps' : 'routines keep'} its history and will mark this exercise as unavailable.`
          : 'This removes the custom exercise from your library. Workout history remains saved.'}
        confirmText="Delete exercise"
        cancelText="Keep exercise"
        isDangerous
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => { onDelete(exercise); setDeleteOpen(false); }}
      />
    </article>
  );
}

function ExerciseLibraryPanel({
  exercises,
  androidPresentation = false,
  profileId,
  scope,
  setScope,
  query,
  setQuery,
  categoryFilter,
  setCategoryFilter,
  bodyAreaFilter,
  setBodyAreaFilter,
  primaryMuscleFilter,
  setPrimaryMuscleFilter,
  equipmentFilter,
  setEquipmentFilter,
  difficultyFilter,
  setDifficultyFilter,
  targetFilter,
  setTargetFilter,
  kindFilter,
  setKindFilter,
  onCreate,
  onSelect,
  onEdit,
  selectedExerciseIds,
  onToggleSelect,
  onClearSelection,
  onCreateRoutine,
  routineReferenceCounts,
  onDelete,
  favoriteExerciseIds,
  onToggleFavorite,
}: {
  exercises: WorkoutExerciseDefinition[];
  androidPresentation?: boolean;
  profileId: string;
  scope: ExerciseScope;
  setScope: (value: ExerciseScope) => void;
  query: string;
  setQuery: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  bodyAreaFilter: string;
  setBodyAreaFilter: (value: string) => void;
  primaryMuscleFilter: string;
  setPrimaryMuscleFilter: (value: string) => void;
  equipmentFilter: string;
  setEquipmentFilter: (value: string) => void;
  difficultyFilter: 'all' | WorkoutExerciseDefinition['difficulty'];
  setDifficultyFilter: (value: 'all' | WorkoutExerciseDefinition['difficulty']) => void;
  targetFilter: 'all' | WorkoutExerciseDefinition['targetMode'];
  setTargetFilter: (value: 'all' | WorkoutExerciseDefinition['targetMode']) => void;
  kindFilter: 'all' | 'exercise' | 'stretch';
  setKindFilter: (value: 'all' | 'exercise' | 'stretch') => void;
  onCreate: () => void;
  onSelect: (exercise: WorkoutExerciseDefinition, trigger: HTMLButtonElement) => void;
  onEdit: (exercise: WorkoutExerciseDefinition) => void;
  selectedExerciseIds: Set<string>;
  onToggleSelect: (exerciseId: string) => void;
  onClearSelection: () => void;
  onCreateRoutine: () => void;
  routineReferenceCounts: Map<string, number>;
  onDelete: (exercise: WorkoutExerciseDefinition) => void;
  favoriteExerciseIds: Set<string>;
  onToggleFavorite: (exerciseId: string) => void;
}) {
  const [fullCatalogOpen, setFullCatalogOpen] = useState(false);
  useEffect(() => { if (!query.trim()) setFullCatalogOpen(false); }, [query]);
  const curatedLibraryExercises = useMemo(
    () => exercises.filter(exercise => exercise.catalogSource !== 'opengym' || isCuratedOpenGymExerciseId(exercise.id)),
    [exercises],
  );
  // Filter OPTIONS are derived from what the current scope actually contains,
  // never hardcoded — an option that would return zero results just doesn't
  // appear, and switching scope recomputes every list below.
  const inCurrentScope = (exercise: WorkoutExerciseDefinition) => {
    if (scope === 'mine') return exercise.source === 'custom';
    // "Caizen" is user-facing shorthand for every non-custom exercise: real
    // Caizen builtins plus the curated openGym set (still catalogSource
    // 'opengym' underneath — see exerciseCatalogLabel for the per-card badge).
    if (scope === 'caizen') return exercise.source === 'builtin';
    return true;
  };
  const scopedExercises = useMemo(() => curatedLibraryExercises.filter(inCurrentScope), [curatedLibraryExercises, inCurrentScope, scope]);
  const expandedCatalogExercises = useMemo(
    () => fullCatalogOpen && query.trim() && scope !== 'mine'
      ? exercises.filter(exercise => exercise.catalogSource === 'opengym' && !isCuratedOpenGymExerciseId(exercise.id) && inCurrentScope(exercise))
      : [],
    [exercises, fullCatalogOpen, inCurrentScope, query, scope],
  );
  const filterOptionExercises = fullCatalogOpen ? [...scopedExercises, ...expandedCatalogExercises] : scopedExercises;
  const trainingCategories = useMemo(() => deriveAvailableTrainingCategories(filterOptionExercises), [filterOptionExercises]);
  const bodyAreas = useMemo(() => deriveAvailableBodyAreas(filterOptionExercises), [filterOptionExercises]);
  const primaryMuscles = useMemo(() => deriveAvailablePrimaryMuscles(filterOptionExercises), [filterOptionExercises]);
  const equipment = useMemo(() => deriveAvailableEquipment(filterOptionExercises), [filterOptionExercises]);
  const availableTargetModes = useMemo(() => deriveAvailableTargetModes(filterOptionExercises), [filterOptionExercises]);
  const availableKinds = useMemo(() => deriveAvailableKinds(filterOptionExercises), [filterOptionExercises]);
  const difficultyOptions = useMemo(
    () => (['easy', 'moderate', 'hard'] as const).filter(difficulty => filterOptionExercises.some(exercise => isExerciseDifficultyFilterable(exercise) && exercise.difficulty === difficulty)),
    [filterOptionExercises],
  );
  const difficultyFilterApplicable = difficultyOptions.length > 1;
  const showBodyAreaFilter = bodyAreas.length > 1;
  const showPrimaryMuscleFilter = primaryMuscles.length > 1;
  const showKindFilter = availableKinds.length > 1;
  const showEquipmentFilter = equipment.length > 1;
  const showTargetFilter = availableTargetModes.length > 1;
  const hasAnyFilterControls = showBodyAreaFilter || showPrimaryMuscleFilter || difficultyFilterApplicable || showKindFilter || showEquipmentFilter || showTargetFilter;

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const matchesFilters = (exercise: WorkoutExerciseDefinition) => {
      if (categoryFilter !== 'all' && deriveWorkoutExerciseCategory(exercise) !== categoryFilter) return false;
      if (bodyAreaFilter !== 'all' && exercise.category !== bodyAreaFilter) return false;
      if (primaryMuscleFilter !== 'all' && exercise.primaryMuscle !== primaryMuscleFilter) return false;
      if (equipmentFilter !== 'all' && exercise.equipment !== equipmentFilter) return false;
      if (difficultyFilter !== 'all') {
        if (!isExerciseDifficultyFilterable(exercise)) return false;
        if (exercise.difficulty !== difficultyFilter) return false;
      }
      if (targetFilter !== 'all' && exercise.targetMode !== targetFilter) return false;
      if (kindFilter !== 'all' && exercise.kind !== kindFilter) return false;
      return matchesWorkoutExerciseSearch(exercise, query);
  };
  const sortMatches = (list: WorkoutExerciseDefinition[]) => list.sort((a, b) => {
    const rankDifference = (workoutExerciseSearchRank(a, query) ?? 9) - (workoutExerciseSearchRank(b, query) ?? 9);
    return (query.trim() && rankDifference ? rankDifference : 0)
      || Number(favoriteExerciseIds.has(b.id)) - Number(favoriteExerciseIds.has(a.id))
      || rankDifference
      || a.name.localeCompare(b.name);
  });
  const primaryMatches = sortMatches(scopedExercises.filter(matchesFilters));
  const additionalOpenGymMatches = sortMatches(expandedCatalogExercises.filter(matchesFilters));
  const filtered = [...primaryMatches, ...additionalOpenGymMatches];
  const pageSize = EXERCISE_LIBRARY_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    setPage(1);
  }, [scope, query, categoryFilter, bodyAreaFilter, primaryMuscleFilter, equipmentFilter, difficultyFilter, targetFilter, kindFilter, fullCatalogOpen]);
  // A filter selection that no longer matches any exercise in the current
  // scope (e.g. after switching scope, or the underlying catalog changing)
  // resets to "all" instead of silently showing zero results.
  useEffect(() => {
    if (categoryFilter !== 'all' && !trainingCategories.includes(categoryFilter as WorkoutExerciseCategory)) setCategoryFilter('all');
  }, [categoryFilter, setCategoryFilter, trainingCategories]);
  useEffect(() => {
    if (!showBodyAreaFilter && bodyAreaFilter !== 'all') { setBodyAreaFilter('all'); return; }
    if (bodyAreaFilter !== 'all' && !bodyAreas.includes(bodyAreaFilter)) setBodyAreaFilter('all');
  }, [bodyAreaFilter, bodyAreas, setBodyAreaFilter, showBodyAreaFilter]);
  useEffect(() => {
    if (!showPrimaryMuscleFilter && primaryMuscleFilter !== 'all') { setPrimaryMuscleFilter('all'); return; }
    if (primaryMuscleFilter !== 'all' && !primaryMuscles.includes(primaryMuscleFilter)) setPrimaryMuscleFilter('all');
  }, [primaryMuscleFilter, primaryMuscles, setPrimaryMuscleFilter, showPrimaryMuscleFilter]);
  useEffect(() => {
    if (!showEquipmentFilter && equipmentFilter !== 'all') { setEquipmentFilter('all'); return; }
    if (equipmentFilter !== 'all' && !equipment.includes(equipmentFilter)) setEquipmentFilter('all');
  }, [equipment, equipmentFilter, setEquipmentFilter, showEquipmentFilter]);
  useEffect(() => {
    if (!showTargetFilter && targetFilter !== 'all') { setTargetFilter('all'); return; }
    if (targetFilter !== 'all' && !availableTargetModes.includes(targetFilter)) setTargetFilter('all');
  }, [availableTargetModes, setTargetFilter, showTargetFilter, targetFilter]);
  useEffect(() => {
    if (!showKindFilter && kindFilter !== 'all') { setKindFilter('all'); return; }
    if (kindFilter !== 'all' && !availableKinds.includes(kindFilter)) setKindFilter('all');
  }, [availableKinds, kindFilter, setKindFilter, showKindFilter]);
  useEffect(() => {
    // Only keep difficulty values that exist as filterable data in the current scope.
    if ((!difficultyFilterApplicable || !difficultyOptions.includes(difficultyFilter as typeof difficultyOptions[number])) && difficultyFilter !== 'all') setDifficultyFilter('all');
  }, [difficultyFilter, difficultyFilterApplicable, difficultyOptions, setDifficultyFilter]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const primaryPageItems = paginated.filter(exercise => !additionalOpenGymMatches.some(extra => extra.id === exercise.id));
  const additionalPageItems = paginated.filter(exercise => additionalOpenGymMatches.some(extra => extra.id === exercise.id));
  const activeSecondaryFilters: Array<{ id: string; label: string; clear: () => void }> = [];
  if (bodyAreaFilter !== 'all') activeSecondaryFilters.push({ id: 'body-area', label: bodyAreaFilter, clear: () => setBodyAreaFilter('all') });
  if (primaryMuscleFilter !== 'all') activeSecondaryFilters.push({ id: 'primary-muscle', label: primaryMuscleFilter, clear: () => setPrimaryMuscleFilter('all') });
  if (equipmentFilter !== 'all') activeSecondaryFilters.push({ id: 'equipment', label: equipmentFilter, clear: () => setEquipmentFilter('all') });
  if (targetFilter !== 'all') activeSecondaryFilters.push({ id: 'target', label: targetLabel(targetFilter), clear: () => setTargetFilter('all') });
  if (difficultyFilter !== 'all') activeSecondaryFilters.push({ id: 'difficulty', label: difficultyLabel(difficultyFilter), clear: () => setDifficultyFilter('all') });
  if (kindFilter !== 'all') activeSecondaryFilters.push({ id: 'kind', label: kindFilter === 'exercise' ? 'Exercise' : 'Stretch', clear: () => setKindFilter('all') });
  const searchOrFilterActive = Boolean(query.trim()) || categoryFilter !== 'all' || activeSecondaryFilters.length > 0;
  const resetFilters = () => { setCategoryFilter('all'); setBodyAreaFilter('all'); setPrimaryMuscleFilter('all'); setEquipmentFilter('all'); setDifficultyFilter('all'); setTargetFilter('all'); setKindFilter('all'); setQuery(''); };

  const heading = scope === 'mine' ? 'My Exercises' : scope === 'caizen' ? 'Caizen Exercises' : 'Exercises';
  const description = scope === 'mine'
    ? 'Your custom movement library, ready to add to a workout.'
    : scope === 'caizen'
      ? "Caizen's starter movements plus the curated exercise library."
      : 'Browse built-in and custom exercises, then narrow the details when you need them.';
  const hasReferencePhoto = (exercise: WorkoutExerciseDefinition) => Boolean(
    exercise.referencePhotoAssetId || (exercise.source === 'builtin' && !exercise.catalogSource && getBuiltinWorkoutReferenceImage(exercise.id)),
  );
  const trainingCategoryOptions: Array<{ value: string; label: string }> = [
    { value: 'all', label: 'All' },
    ...WORKOUT_EXERCISE_CATEGORIES.map(value => ({ value, label: WORKOUT_EXERCISE_CATEGORY_LABELS[value] })),
  ];
  const filterFields = (
    <div className="grid gap-3">
      {showBodyAreaFilter ? <WorkoutSelect value={bodyAreaFilter} onValueChange={setBodyAreaFilter} label="Filter by body area" options={[{ value: 'all', label: 'All body areas' }, ...bodyAreas.map(value => ({ value, label: value }))]} /> : null}
      {showPrimaryMuscleFilter ? <WorkoutSelect value={primaryMuscleFilter} onValueChange={setPrimaryMuscleFilter} label="Filter by primary muscle" options={[{ value: 'all', label: 'All primary muscles' }, ...primaryMuscles.map(value => ({ value, label: formatExerciseDisplayName(value) }))]} /> : null}
      {showEquipmentFilter ? <WorkoutSelect value={equipmentFilter} onValueChange={setEquipmentFilter} label="Filter by equipment" options={[{ value: 'all', label: 'All equipment' }, ...equipment.map(value => ({ value, label: value }))]} /> : null}
      {showTargetFilter ? <WorkoutSelect value={targetFilter} onValueChange={value => setTargetFilter(value as typeof targetFilter)} label="Filter by target" options={[{ value: 'all', label: 'All targets' }, ...availableTargetModes.map(value => ({ value, label: targetLabel(value) }))]} /> : null}
      {difficultyFilterApplicable ? <WorkoutSelect value={difficultyFilter} onValueChange={value => setDifficultyFilter(value as typeof difficultyFilter)} label="Filter by difficulty" options={[{ value: 'all', label: 'All difficulties' }, ...difficultyOptions.map(value => ({ value, label: difficultyLabel(value) }))]} /> : null}
      {showKindFilter ? <WorkoutSelect value={kindFilter} onValueChange={value => setKindFilter(value as typeof kindFilter)} label="Filter by exercise type" options={[{ value: 'all', label: 'All types' }, ...availableKinds.map(value => ({ value, label: value === 'exercise' ? 'Exercise' : 'Stretch' }))]} /> : null}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="section-surface space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-black">{heading}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <button type="button" className={`${control} shrink-0`} onClick={onCreate}><Plus className="h-4 w-4" />Create Exercise</button>
      </div>
      {/* 2. Scope tabs */}
      <FilterBar label="Exercise collection">
          {([['all', 'All'], ['caizen', 'Caizen'], ['mine', 'My Exercises']] as const).map(([value, label]) => (
            <FilterChip key={value} selected={scope === value} onSelectedChange={() => setScope(value)} className="min-h-11 px-3 text-xs font-black">{label}</FilterChip>
          ))}
      </FilterBar>
      </div>

      <div className="section-surface space-y-4 p-4">
      <label className="relative block w-full min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input className="field-input w-full min-w-0 pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search exercises, coaching, equipment…" aria-label="Search exercises" /></label>

      {query.trim() && scope !== 'mine' ? <button type="button" className={`${control} justify-start`} onClick={() => setFullCatalogOpen(value => !value)} aria-expanded={fullCatalogOpen}>
        <Search className="size-4" aria-hidden="true" />{fullCatalogOpen ? 'Hide full openGym results' : `Search full openGym catalog (${exercises.filter(exercise => exercise.catalogSource === 'opengym').length} exercises)`}
      </button> : null}

      {/* Training category stays in view; unavailable categories are disabled for the current scope. */}
      <div>
        <div className="scrollbar-hide -mx-1 snap-x snap-proximity scroll-px-1 overflow-x-auto overscroll-x-contain px-1" role="group" aria-label="Exercise training category">
          <div className="flex min-w-max gap-2">
            {trainingCategoryOptions.map(({ value, label }) => {
              const unavailable = value !== 'all' && !trainingCategories.includes(value as WorkoutExerciseCategory);
              return <button key={value} type="button" aria-pressed={categoryFilter === value} disabled={unavailable} className={`${categoryFilter === value ? 'border-primary/50 bg-primary/10 text-primary' : ''} ${control} snap-start`} onClick={() => setCategoryFilter(value)}>{label}</button>;
            })}
          </div>
        </div>
      </div>

      {hasAnyFilterControls ? (androidPresentation ? (
        <>
          <button type="button" className={control} aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
            <Settings2 className="h-4 w-4" />Filters{activeSecondaryFilters.length ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-caption text-primary">{activeSecondaryFilters.length}</span> : null}
          </button>
          <CaizenBottomSheet open={filtersOpen} title="Exercise filters" description="Narrow the exercise library." onClose={() => setFiltersOpen(false)}>
            <div className="space-y-4 pb-2">
              {filterFields}
              <div className="flex justify-between gap-2 border-t border-border/60 pt-3">
                <button type="button" className={control} onClick={resetFilters}>Clear filters</button>
                <button type="button" className={primary} onClick={() => setFiltersOpen(false)}>Done</button>
              </div>
            </div>
          </CaizenBottomSheet>
        </>
      ) : (
        <div>
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={control} aria-label={`Filters${activeSecondaryFilters.length ? `, ${activeSecondaryFilters.length} active` : ''}`}>
                <Settings2 className="h-4 w-4" />Filters{activeSecondaryFilters.length ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-caption text-primary">{activeSecondaryFilters.length}</span> : null}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] space-y-3 p-3">
              {filterFields}
              <div className="border-t border-border/60 pt-3">
                <button type="button" className="min-h-11 px-2 text-xs font-black text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" onClick={resetFilters}>Clear filters</button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )) : null}
      {activeSecondaryFilters.length ? <div className="flex flex-wrap gap-1.5" aria-label="Active exercise filters">
        {activeSecondaryFilters.map(filter => <button key={filter.id} type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" onClick={filter.clear} aria-label={`Remove ${filter.label} filter`}>{filter.label}<X className="size-3.5" aria-hidden="true" /></button>)}
      </div> : null}
      {searchOrFilterActive ? <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{filtered.length} {filtered.length === 1 ? 'exercise' : 'exercises'}{fullCatalogOpen ? ' across Caizen and openGym' : ''}</p><button type="button" className="min-h-11 px-2 text-xs font-black text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" onClick={resetFilters}>Clear filters</button></div> : null}

      {selectedExerciseIds.size > 0 ? (
        <div className="exercise-library-selection-bar sticky z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur sm:px-4 sm:py-3">
          <p className="text-sm font-black" aria-live="polite">{selectedExerciseIds.size} {selectedExerciseIds.size === 1 ? 'exercise' : 'exercises'} selected</p>
          <div className="flex items-center gap-2">
            <button type="button" className={control} onClick={onClearSelection}>Clear</button>
            <button type="button" className={primary} onClick={onCreateRoutine}><Plus className="h-4 w-4" />Create Routine</button>
          </div>
        </div>
      ) : null}
      </div>

      {/* 6. Results */}
      <div className="section-surface space-y-4 p-4">
      {paginated.length ? (
        <div className="space-y-5">
          {fullCatalogOpen && primaryPageItems.length ? <section aria-label="Caizen, custom, and curated exercise matches"><h4 className="mb-2 text-sm font-semibold">{scope === 'all' ? 'Caizen, custom, and curated matches' : 'Caizen and curated matches'}</h4><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1440px]:grid-cols-4">{primaryPageItems.map(exercise => <ExerciseLibraryCard key={exercise.id} exercise={exercise} profileId={profileId} androidPresentation={androidPresentation} hasReferencePhoto={hasReferencePhoto} selected={selectedExerciseIds.has(exercise.id)} favorite={favoriteExerciseIds.has(exercise.id)} routineReferenceCount={routineReferenceCounts.get(exercise.id) || 0} onToggleFavorite={onToggleFavorite} onToggleSelect={onToggleSelect} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />)}</div></section> : primaryPageItems.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1440px]:grid-cols-4">{primaryPageItems.map(exercise => <ExerciseLibraryCard key={exercise.id} exercise={exercise} profileId={profileId} androidPresentation={androidPresentation} hasReferencePhoto={hasReferencePhoto} selected={selectedExerciseIds.has(exercise.id)} favorite={favoriteExerciseIds.has(exercise.id)} routineReferenceCount={routineReferenceCounts.get(exercise.id) || 0} onToggleFavorite={onToggleFavorite} onToggleSelect={onToggleSelect} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />)}</div> : null}
          {fullCatalogOpen && additionalPageItems.length ? <section aria-label="More exercises from openGym"><h4 className="mb-2 text-sm font-semibold">More from openGym</h4><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1440px]:grid-cols-4">{additionalPageItems.map(exercise => <ExerciseLibraryCard key={exercise.id} exercise={exercise} profileId={profileId} androidPresentation={androidPresentation} hasReferencePhoto={hasReferencePhoto} selected={selectedExerciseIds.has(exercise.id)} favorite={favoriteExerciseIds.has(exercise.id)} routineReferenceCount={routineReferenceCounts.get(exercise.id) || 0} onToggleFavorite={onToggleFavorite} onToggleSelect={onToggleSelect} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />)}</div></section> : null}
        </div>
      ) : scope === 'mine' && !searchOrFilterActive ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">You have not created any custom exercises yet.</div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm font-black">No exercises found</p>
          <p className="mt-1 text-sm text-muted-foreground">Try removing a filter or changing your search.</p>
          <button type="button" className={`${control} mt-4`} onClick={resetFilters}>Clear filters</button>
        </div>
      )}
      {filtered.length > pageSize ? <PaginationControls page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} collectionLabel="exercise results" /> : null}
      </div>
    </div>
  );
}

type TrainingHistoryRecord = {
  id: string;
  name: string;
  date: Date;
  durationMinutes?: number;
  status: 'completed' | 'partial';
  source: 'guided' | 'manual';
  detail: string;
  sessionId?: string;
  exerciseLinks?: Array<{ id: string; name: string }>;
  activity?: ActivityEntry;
};

function UnifiedTrainingHistory({
  sessions,
  entries,
  androidPresentation = false,
  legacyPanel,
  onManualLog,
  onEditActivity,
  onDeleteActivity,
  onDeleteSession,
  onOpenExercise,
}: {
  sessions: ReturnType<typeof useAppContext>['workoutSessions'];
  entries: ActivityEntry[];
  androidPresentation?: boolean;
  legacyPanel: ReactNode;
  onManualLog: () => void;
  onEditActivity: (entry: ActivityEntry) => void;
  onDeleteActivity: (entry: ActivityEntry) => void;
  onDeleteSession: (id: string) => void;
  onOpenExercise: (exerciseId: string, trigger: HTMLButtonElement) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'completed' | 'partial' | 'manual'>('all');
  const [query, setQuery] = useState('');
  const records = useMemo<TrainingHistoryRecord[]>(() => [
    ...sessions.map(session => ({
      id: `guided:${session.id}`,
      name: session.routineName,
      date: new Date(session.completedAt || session.startedAt),
      durationMinutes: session.durationMinutes,
      status: session.status,
      source: 'guided' as const,
      detail: `${session.completedExerciseCount}/${session.totalExerciseCount} exercises · ${session.exercises.filter(exercise => exercise.status === 'completed').length} sets`,
      sessionId: session.id,
      exerciseLinks: [...new Map(session.exercises.flatMap(exercise => exercise.exerciseId
        ? [[exercise.exerciseId, { id: exercise.exerciseId, name: exercise.exerciseName }] as const]
        : [])).values()],
    })),
    ...entries.map(entry => ({
      id: `manual:${entry.id}`,
      name: entry.activity,
      date: new Date(entry.date),
      durationMinutes: entry.durationMinutes,
      status: 'completed' as const,
      source: 'manual' as const,
      detail: 'Recorded outside a guided routine',
      activity: entry,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()), [entries, sessions]);
  const filtered = records.filter(record => {
    if (filter === 'manual' && record.source !== 'manual') return false;
    if (filter === 'completed' && (record.source !== 'guided' || record.status !== 'completed')) return false;
    if (filter === 'partial' && record.status !== 'partial') return false;
    return !query.trim() || record.name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  });

  return (
    <section aria-labelledby="workout-history-title" className="space-y-5 lg:space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="workout-history-title" className="text-xl font-black">Training history</h3>
          <p className="mt-1 text-sm text-muted-foreground">One chronological record for guided workouts and activity logged on your own.</p>
        </div>
        <button type="button" className={control} onClick={onManualLog}><Plus className="h-4 w-4" />Log activity</button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block min-w-0 sm:max-w-xs sm:flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input className="field-input pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search training history" aria-label="Search training history" /></label>
        <div className="scrollbar-hide flex snap-x snap-proximity scroll-px-1 gap-2 overflow-x-auto overscroll-x-contain" role="group" aria-label="Filter training history">
          {([['all', 'All'], ['completed', 'Completed'], ['partial', 'Partial'], ['manual', 'Manual']] as const).map(([value, label]) => <button key={value} type="button" className={`${filter === value ? 'border-primary/50 bg-primary/10 text-primary' : ''} ${control} shrink-0`} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}
        </div>
      </div>
      <div className="space-y-2">
        {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">No training records match this view.</div> : filtered.map(record => {
          const actions = record.source === 'guided' && record.sessionId
            ? [{
                label: 'Delete',
                icon: Trash2,
                destructive: true,
                onSelect: () => {
                  if (window.confirm(`Delete the ${record.name} session?`)) onDeleteSession(record.sessionId!);
                },
              }]
            : record.activity
              ? [
                  { label: 'Edit', icon: Pencil, onSelect: () => onEditActivity(record.activity!) },
                  { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => onDeleteActivity(record.activity!) },
                ]
              : [];

          return (
            <article key={record.id} className="android-training-history-row flex flex-col gap-3 border-b border-border/60 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-black">{record.name}</h4>
                  <span className="rounded-full border border-border/60 px-2 py-1 text-label text-muted-foreground">{record.source === 'guided' ? 'Guided workout' : 'Manual activity'}</span>
                  <span className={`rounded-full px-2 py-1 text-label text-muted-foreground ${record.status === 'partial' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>{record.status === 'partial' ? 'Partial' : 'Completed'}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{record.date.toLocaleDateString()} · {record.durationMinutes === undefined ? 'Duration not recorded' : `${record.durationMinutes} min`} · {record.detail}</p>
                {record.exerciseLinks?.length ? <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`${record.name} exercise history`}>
                  {record.exerciseLinks.map(exercise => <button key={exercise.id} type="button" className="inline-flex min-h-11 items-center rounded-full border border-border/60 bg-background/50 px-3 text-xs font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" onClick={event => onOpenExercise(exercise.id, event.currentTarget)} aria-label={`Open ${exercise.name} history`}>
                    {exercise.name}
                  </button>)}
                </div> : null}
              </div>
              {actions.length ? <HealthOverflowMenu title={`${record.name} actions`} ariaLabel={`More actions for ${record.name}`} androidPresentation={androidPresentation} actions={actions} /> : null}
            </article>
          );
        })}
      </div>
      <details className="border-t border-border/60 pt-4">
        <summary className="cursor-pointer list-none text-sm font-black">Compatibility: legacy workout plans</summary>
        <div className="mt-3"><p className="text-sm text-muted-foreground">Older plan records remain available while new routines use the canonical Routines workflow.</p><div className="mt-4">{legacyPanel}</div></div>
      </details>
    </section>
  );
}

export default function WorkoutWorkspace(props: Props) {
  const {
    defaultDate,
    androidPresentation = false,
    onManualLog,
    onEditActivity,
    onDeleteActivity,
    onOpenProgress,
    requestedProfileId,
    requestedPlanId,
    requestedPlanSignal,
    requestedPlanAction,
    requestedFeature,
    requestedCreateSignal,
    onRequestedPlanConsumed,
    onRequestedCreateConsumed,
  } = props;
  const context = useAppContext();
  const [view, setViewState] = useState<WorkoutView>('today');
  const setView = (next: WorkoutView) => setViewState(next === 'exercises' ? 'library' : next);
  const [query, setQuery] = useState('');
  const [exerciseScope, setExerciseScope] = useState<ExerciseScope>('caizen');
  const [workoutScope, setWorkoutScopeState] = useState<WorkoutScope>('mine');
  // Exercises also has its own primary "Exercises" nav tab (view === 'library');
  // this flag is only for the legacy Routines -> Exercises sub-tab shortcut,
  // which stays available too. Any call that changes which routine collection
  // is showing (mine/starter) means the user wants routines, not exercises,
  // so the wrapper below keeps that flag in sync everywhere without touching
  // each call site individually.
  const [routinesExercisesSelected, setRoutinesExercisesSelected] = useState(false);
  const setWorkoutScope = (next: WorkoutScope) => {
    setRoutinesExercisesSelected(false);
    setWorkoutScopeState(next);
  };
  const [routineArchiveView, setRoutineArchiveView] = useState<'active' | 'archived'>('active');
  const mineRoutinePanelRef = useRef<HTMLElement>(null);
  const previousRoutineArchiveViewRef = useRef(routineArchiveView);
  useEffect(() => {
    if (previousRoutineArchiveViewRef.current === routineArchiveView) return;
    previousRoutineArchiveViewRef.current = routineArchiveView;
    const panel = mineRoutinePanelRef.current;
    if (!panel) return;
    panel.classList.remove('caizen-tab-panel-motion');
    void panel.offsetWidth;
    panel.classList.add('caizen-tab-panel-motion');
  }, [routineArchiveView]);
  const [kindFilter, setKindFilter] = useState<'all' | 'exercise' | 'stretch'>('all');
  const [exerciseCategoryFilter, setExerciseCategoryFilter] = useState('all');
  const [exerciseBodyAreaFilter, setExerciseBodyAreaFilter] = useState('all');
  const [exercisePrimaryMuscleFilter, setExercisePrimaryMuscleFilter] = useState('all');
  const [exerciseEquipmentFilter, setExerciseEquipmentFilter] = useState('all');
  const [exerciseDifficultyFilter, setExerciseDifficultyFilter] = useState<'all' | WorkoutExerciseDefinition['difficulty']>('all');
  const [exerciseTargetFilter, setExerciseTargetFilter] = useState<'all' | WorkoutExerciseDefinition['targetMode']>('all');
  const [activeRunner, setActiveRunner] = useState<WorkoutRunnerState | null>(null);
  const [checkpoint, setCheckpoint] = useState<WorkoutRunnerState | null>(null);
  const [showExerciseBuilder, setShowExerciseBuilder] = useState(false);
  const [editingExercise, setEditingExercise] = useState<WorkoutExerciseDefinition | null>(null);
  const [routineBuilder, setRoutineBuilder] = useState<WorkoutRoutine | 'new' | null>(null);
  const [routineCopySource, setRoutineCopySource] = useState<WorkoutRoutine | null>(null);
  const [routineDraft, setRoutineDraft] = useState<RoutineBuilderDraft | undefined>(undefined);
  const [routineDraftItems, setRoutineDraftItems] = useState<WorkoutRoutineItem[] | undefined>(undefined);
  const [routineReturnTarget, setRoutineReturnTarget] = useState<WorkoutRoutine | 'new' | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [scheduleRoutine, setScheduleRoutine] = useState<WorkoutRoutine | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<WorkoutExerciseDefinition | null>(null);
  const [customizeExercise, setCustomizeExercise] = useState<WorkoutExerciseDefinition | null>(null);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<Set<string>>(new Set());
  const [routineSelectionReturnView, setRoutineSelectionReturnView] = useState<'library' | 'routines' | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'completed' | 'partial'>('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyRange, setHistoryRange] = useState<'all' | '30' | '90'>('all');
  const [historyRoutineId, setHistoryRoutineId] = useState('all');
  const exerciseTriggerRef = useRef<HTMLButtonElement | null>(null);
  const starterRoutinesRef = useRef<HTMLDivElement | null>(null);

  const allExerciseDefinitions = useMemo(() => combineWorkoutExerciseCatalog(context.workoutExercises), [context.workoutExercises]);
  const exercises = useMemo(() => allExerciseDefinitions.filter(item => !item.archived), [allExerciseDefinitions]);
  const routineReferenceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const routine of context.workoutRoutines) {
      for (const exerciseId of new Set(routine.items.map(item => item.exerciseId))) {
        counts.set(exerciseId, (counts.get(exerciseId) || 0) + 1);
      }
    }
    return counts;
  }, [context.workoutRoutines]);
  const favoriteWorkoutExerciseIds = useMemo(() => new Set(context.health.favoriteWorkoutExerciseIds || []), [context.health.favoriteWorkoutExerciseIds]);
  const toggleFavoriteWorkoutExercise = (exerciseId: string) => {
    const next = new Set(context.health.favoriteWorkoutExerciseIds || []);
    if (next.has(exerciseId)) next.delete(exerciseId);
    else next.add(exerciseId);
    context.updateHealthProfile({ favoriteWorkoutExerciseIds: [...next] });
  };
  const routines = useMemo(() => [...BUILTIN_WORKOUT_ROUTINES, ...context.workoutRoutines], [context.workoutRoutines]);
  const customRoutines = useMemo(() => routines.filter(routine => routine.source === 'custom' && !routine.archived), [routines]);
  const archivedCustomRoutines = useMemo(() => routines.filter(routine => routine.source === 'custom' && routine.archived), [routines]);
  const visibleCustomRoutines = routineArchiveView === 'archived' ? archivedCustomRoutines : customRoutines;
  const starterRoutines = useMemo(() => routines.filter(routine => routine.source === 'builtin' && !routine.archived), [routines]);
  const defaultDateIsToday = defaultDate === formatLocalDateInput(new Date());
  const workoutDateContext = defaultDateIsToday ? 'Today' : `Selected day · ${dateLabel(defaultDate)}`;
  const workoutTodayHeading = defaultDateIsToday ? 'What are you doing today?' : `What are you doing on ${dateLabel(defaultDate)}?`;
  const selectedDate = useMemo(() => parseLocalDateValue(defaultDate) || new Date(), [defaultDate]);
  const scheduledWorkouts = useMemo(
    () => getScheduledWorkoutsForDate(context.dailyChecklistItems, selectedDate),
    [context.dailyChecklistItems, selectedDate],
  );
  const scheduledRoutineEntries = useMemo(
    () => scheduledWorkouts.map(entry => {
      const target = getHealthTargetFromLifeHubRecord(entry.item);
      const routine = target?.type === 'workout-routine' ? routines.find(candidate => candidate.id === target.entityId) : undefined;
      if (!routine) return { ...entry, routine: undefined };
      const duration = calculateWorkoutDuration(routine, allExerciseDefinitions);
      return {
        ...entry,
        // Keep the existing preview field only for fully timed routines. A
        // rep/manual routine has no precise work duration to show here.
        routine: duration.hasUntimedWork
          ? { ...routine, estimatedDurationMinutes: undefined }
          : { ...routine, estimatedDurationMinutes: duration.totalSeconds / 60 },
      };
    }),
    [allExerciseDefinitions, routines, scheduledWorkouts],
  );
  const hasCustomRoutine = context.workoutRoutines.some(routine => routine.source === 'custom');
  const hasScheduledCustomRoutine = scheduledWorkouts.some(entry => {
    const target = getHealthTargetFromLifeHubRecord(entry.item);
    return target?.type === 'workout-routine'
      && context.workoutRoutines.some(routine => routine.id === target.entityId && routine.source === 'custom');
  });
  const establishedWorkoutUser = hasCustomRoutine
    || context.workoutSessions.length > 0
    || context.health.activityEntries.length > 0
    || hasScheduledCustomRoutine;
  const legacyPlanRequested = requestedPlanId ? context.workoutPlans.some(plan => plan.id === requestedPlanId) : false;

  const launchRoutineBuilder = (templateId: WorkoutRoutineTemplateId = 'custom') => {
    const preset = createRoutineFromWorkoutTemplate(templateId, exercises);
    setRoutineCopySource(null);
    setRoutineDraft({ name: preset.name, description: preset.description || '', notes: '', rounds: String(preset.rounds || 1), rest: String(preset.defaultRestSeconds ?? 30), items: preset.items });
    setRoutineDraftItems(preset.items);
    setRoutineBuilder('new');
    setTemplatePickerOpen(false);
    setWorkoutScope('mine');
    setView('routines');
  };

  const requestNewRoutine = () => {
    setRoutineCopySource(null);
    setTemplatePickerOpen(true);
  };

  useEffect(() => {
    if (requestedProfileId && requestedProfileId !== context.currentProfileId) return;
    if (requestedFeature === 'workout-session') {
      setView('history');
      if (requestedPlanSignal) onRequestedPlanConsumed?.(requestedPlanSignal);
      return;
    }
    if (requestedFeature === 'workout-exercise') {
      const exercise = requestedPlanId ? exercises.find(item => item.id === requestedPlanId) : undefined;
      setExerciseScope(exercise?.source === 'custom' ? 'mine' : 'caizen');
      // Exercises live inside Routines now, so land on that destination with
      // the Exercises tab selected instead of the retired top-level view.
      setView('routines');
      setRoutinesExercisesSelected(true);
      if (exercise) setQuery(exercise.name);
      if (requestedPlanSignal) onRequestedPlanConsumed?.(requestedPlanSignal);
      return;
    }
    if (legacyPlanRequested && requestedPlanSignal) {
      setView('history');
      return;
    }
    const next = requestedPlanId ? routines.find(item => item.id === requestedPlanId) : undefined;
    if (next && requestedPlanSignal) {
      setView('today');
      if (requestedPlanAction === 'start') setActiveRunner(createWorkoutRunnerState(next, allExerciseDefinitions));
      onRequestedPlanConsumed?.(requestedPlanSignal);
    }
  }, [allExerciseDefinitions, context.currentProfileId, exercises, legacyPlanRequested, onRequestedPlanConsumed, requestedFeature, requestedPlanAction, requestedPlanId, requestedPlanSignal, requestedProfileId, routines]);

  useEffect(() => {
    if (!requestedCreateSignal) return;
    setWorkoutScope('mine');
    setView('routines');
    setTemplatePickerOpen(true);
    onRequestedCreateConsumed?.(requestedCreateSignal);
  }, [onRequestedCreateConsumed, requestedCreateSignal]);

  useEffect(() => {
    setCheckpoint(readWorkoutCheckpoint(context.currentProfileId));
  }, [context.currentProfileId]);

  useEffect(() => {
    if (routineBuilder === 'new' && !routineDraft && !routineDraftItems) {
      setRoutineBuilder(null);
      setTemplatePickerOpen(true);
    }
  }, [routineBuilder, routineDraft, routineDraftItems]);

  const begin = (routine: WorkoutRoutine) => {
    setActiveRunner(createWorkoutRunnerState(routine, allExerciseDefinitions));
    setView('today');
  };
  const addExerciseToRoutine = (exercise: WorkoutExerciseDefinition) => {
    setSelectedExercise(null);
    setRoutineDraftItems(current => appendRoutineDraftExercise(current || [], exercise));
    if (!routineBuilder) setRoutineBuilder('new');
    setWorkoutScope('mine');
    setView('routines');
  };
  const toggleExerciseSelection = (exerciseId: string) => setSelectedExerciseIds(current => {
    const next = new Set(current);
    if (next.has(exerciseId)) next.delete(exerciseId);
    else next.add(exerciseId);
    return next;
  });
  const clearExerciseSelection = () => setSelectedExerciseIds(new Set());
  // The Exercise Library is a faster entry point into the same Routine
  // Builder used by Routines -> New routine: it only pre-fills items, it
  // never introduces a second routine-building implementation.
  const createRoutineFromSelectedExercises = () => {
    setRoutineDraftItems(selectedExercisesToRoutineItems(exercises, selectedExerciseIds));
    setRoutineSelectionReturnView(view === 'library' ? 'library' : 'routines');
    if (!routineBuilder) setRoutineBuilder('new');
    setWorkoutScope('mine');
    setView('routines');
  };

  const saveSession = (session: ReturnType<typeof buildWorkoutSession>) => {
    context.addWorkoutSession({ ...session, scheduleDate: defaultDate });
    setActiveRunner(null);
    setCheckpoint(null);
  };
  const discardSession = () => {
    clearWorkoutCheckpoint(context.currentProfileId);
    setActiveRunner(null);
    setCheckpoint(null);
  };
  const resume = () => {
    if (!checkpoint) return;
    setActiveRunner(checkpoint);
    setCheckpoint(null);
  };
  const scheduleItemForRoutine = (routineId: string) => context.dailyChecklistItems.find(item => {
    const target = getHealthTargetFromLifeHubRecord(item);
    return target?.type === 'workout-routine' && target.entityId === routineId;
  });
  const notifyRoutineOutcome = (routineKey: string, action: string, title: string) => {
    notify({
      actionId: `workout-routine:${routineKey}:${action}:${Date.now()}`,
      kind: 'success',
      title,
      feedbackGroup: `workout-routine:${routineKey}`,
    });
  };
  const openSchedule = (routine: WorkoutRoutine) => {
    setScheduleRoutine(routine);
  };
  const saveSchedule = (routine: WorkoutRoutine, payload: WorkoutSchedulePayload) => {
    const existing = scheduleItemForRoutine(routine.id);
    if (existing) context.updateDailyChecklistItem(existing.id, payload);
    else context.addDailyChecklistItem(payload);
    setScheduleRoutine(null);
    notifyRoutineOutcome(routine.id, existing ? 'schedule-updated' : 'scheduled', `${routine.name} ${existing ? 'schedule updated' : 'scheduled'} in Life Hub`);
  };
  const removeSchedule = (routine: WorkoutRoutine) => {
    const existing = scheduleItemForRoutine(routine.id);
    if (!existing) return;
    context.deleteDailyChecklistItem(existing.id);
    setScheduleRoutine(null);
    notifyRoutineOutcome(routine.id, 'schedule-removed', `${routine.name} removed from the schedule`);
  };
  const saveExercise = (exercise: Omit<WorkoutExerciseDefinition, 'createdAt' | 'updatedAt'> & { id?: string }) => {
    let savedExerciseId: string | undefined;
    if (editingExercise?.id) {
      context.updateWorkoutExercise(editingExercise.id, exercise);
      savedExerciseId = editingExercise.id;
    } else {
      savedExerciseId = context.addWorkoutExercise(exercise);
    }
    setShowExerciseBuilder(false);
    setEditingExercise(null);
    if (routineReturnTarget && savedExerciseId) {
      const savedExercise = { ...exercise, id: savedExerciseId } as WorkoutExerciseDefinition;
      setRoutineDraft(current => current ? { ...current, items: appendRoutineDraftExercise(current.items, savedExercise) } : current);
      setRoutineDraftItems(current => appendRoutineDraftExercise(current || [], savedExercise));
      setRoutineBuilder(routineReturnTarget);
      setRoutineReturnTarget(null);
      setView('routines');
    }
  };
  const saveRoutine = (routine: Omit<WorkoutRoutine, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, existingId?: string) => {
    const { id, ...routineData } = routine;
    const wasCopiedStarter = routineCopySource?.source === 'builtin' && !existingId;
    const wasDuplicatedRoutine = routineCopySource?.source === 'custom' && !existingId;
    let savedRoutineId = existingId;
    if (existingId) context.updateWorkoutRoutine(existingId, routineData);
    else savedRoutineId = context.addWorkoutRoutine({ ...routineData, ...(id ? { id } : {}) });
    if (routineSelectionReturnView) {
      clearExerciseSelection();
      setRoutineSelectionReturnView(null);
    }
    setRoutineBuilder(null);
    setRoutineCopySource(null);
    setRoutineDraft(undefined);
    setRoutineDraftItems(undefined);
    setWorkoutScope('mine');
    if (savedRoutineId) {
      notifyRoutineOutcome(
        savedRoutineId,
        existingId ? 'updated' : wasCopiedStarter ? 'copied' : wasDuplicatedRoutine ? 'duplicated' : 'saved',
        existingId ? `${routine.name} updated` : wasCopiedStarter ? `${routine.name} copied to Routines` : wasDuplicatedRoutine ? `${routine.name} duplicated in Routines` : `${routine.name} saved to Routines`,
      );
    }
  };
  const deleteRoutine = (routine: WorkoutRoutine) => {
    if (routine.source !== 'custom') return;
    // Context owns cleanup: managed media, Life Hub routine links, and task links. Sessions are kept.
    context.deleteWorkoutRoutine(routine.id);
    if (scheduleRoutine?.id === routine.id) setScheduleRoutine(null);
    notifyRoutineOutcome(routine.id, 'deleted', `${routine.name} deleted`);
  };
  const cloneRoutine = (routine: WorkoutRoutine) => {
    setRoutineCopySource(routine);
    setRoutineBuilder(routine);
    setRoutineDraft(undefined);
    setRoutineDraftItems(undefined);
    setWorkoutScope('mine');
    setView('routines');
  };

  const recentSessions = [...context.workoutSessions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const filteredHistorySessions = recentSessions.filter(session => {
    if (historyFilter !== 'all' && session.status !== historyFilter) return false;
    if (historyRoutineId !== 'all' && session.routineId !== historyRoutineId) return false;
    if (historyRange !== 'all' && new Date(session.startedAt).getTime() < Date.now() - Number(historyRange) * 86400000) return false;
    return !historyQuery.trim() || `${session.routineName} ${session.notes || ''}`.toLocaleLowerCase().includes(historyQuery.toLocaleLowerCase());
  });
  const activeCheckpointRoutine = checkpoint ? routines.find(routine => routine.id === checkpoint.routine.id) : undefined;
  const closeExerciseDetail = () => {
    setSelectedExercise(null);
  };
  const restoreExerciseDetailFocus = () => {
    exerciseTriggerRef.current?.focus({ preventScroll: true });
  };
  const saveExerciseCustomization = (updates: Partial<WorkoutExerciseDefinition>) => {
    if (!customizeExercise) return;
    context.updateWorkoutExercise(customizeExercise.id, updates);
    setCustomizeExercise(null);
  };
  const chooseStarterRoutine = () => {
    setWorkoutScope('starter');
    setView('routines');
    window.requestAnimationFrame(() => {
      const target = starterRoutinesRef.current;
      if (!target) return;
      target.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      target.querySelector<HTMLButtonElement>('article button')?.focus({ preventScroll: true });
    });
  };
  const oldPanel = (
    <WorkoutPlannerPanel
      defaultDate={defaultDate}
      androidPresentation={androidPresentation}
      requestedPlanId={legacyPlanRequested ? requestedPlanId : undefined}
      requestedPlanSignal={legacyPlanRequested ? requestedPlanSignal : undefined}
      requestedPlanAction={requestedPlanAction}
      requestedCreateSignal={0}
      requestedProfileId={requestedProfileId || context.currentProfileId}
      onRequestedPlanConsumed={signal => onRequestedPlanConsumed?.(signal)}
      onRequestedCreateConsumed={signal => onRequestedCreateConsumed?.(signal)}
      onManualLog={onManualLog}
      onEditActivity={onEditActivity}
      onDeleteActivity={onDeleteActivity}
    />
  );

  const routineCollectionTabs: RoutineCollectionTab[] = ['active', 'archived', 'starter', 'exercises'];
  const selectRoutineCollectionTab = (tab: RoutineCollectionTab) => {
    if (tab === 'exercises') {
      setRoutinesExercisesSelected(true);
      return;
    }
    if (tab === 'starter') {
      setWorkoutScope('starter');
      return;
    }
    setWorkoutScope('mine');
    setRoutineArchiveView(tab);
  };
  const handleRoutineCollectionTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: RoutineCollectionTab) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = routineCollectionTabs.indexOf(current);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? routineCollectionTabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + routineCollectionTabs.length) % routineCollectionTabs.length;
    const next = routineCollectionTabs[nextIndex];
    selectRoutineCollectionTab(next);
    window.requestAnimationFrame(() => document.getElementById(`workout-routine-tab-${next}`)?.focus({ preventScroll: true }));
  };

  const routineCollectionPanel = view === 'routines' ? (
    <div className="space-y-4">
      {!routinesExercisesSelected && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xl font-black">{workoutScope === 'mine' ? (routineArchiveView === 'active' ? 'Routines' : 'Archived routines') : 'Starter routines'}</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{workoutScope === 'mine' ? 'Your reusable routines, with your cover photos, ready to start or schedule.' : 'Predefined routines you can try now or copy into an editable personal routine.'}</p>
          </div>
          <button type="button" className={primary} onClick={() => { setRoutineDraftItems(undefined); setRoutineBuilder('new'); }}><Plus className="h-4 w-4" />New routine</button>
        </div>
      )}

      <div className="section-surface flex flex-wrap items-center gap-1 p-2" role="tablist" aria-label="Routines and exercises">
        {routineCollectionTabs.map(tab => {
          const selected = tab === 'exercises'
            ? routinesExercisesSelected
            : !routinesExercisesSelected && (tab === 'starter' ? workoutScope === 'starter' : workoutScope === 'mine' && routineArchiveView === tab);
          const label = tab === 'active' ? 'My routines' : tab === 'archived' ? 'Archived routines' : tab === 'starter' ? 'Starter routines' : 'Exercises';
          const count = tab === 'active' ? customRoutines.length : tab === 'archived' ? archivedCustomRoutines.length : tab === 'starter' ? starterRoutines.length : exercises.length;
          return (
            <button
              key={tab}
              id={`workout-routine-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={tab === 'exercises' ? 'workout-scope-panel-exercises' : tab === 'starter' ? 'workout-scope-panel-starter' : 'workout-scope-panel-mine'}
              tabIndex={selected ? 0 : -1}
              className={`caizen-tab ${selected ? 'caizen-tab-active text-foreground' : 'text-muted-foreground'} min-h-11 rounded-xl px-3 text-xs font-black transition-colors ${tab === 'exercises' ? 'sm:ml-auto' : ''}`}
              onClick={() => selectRoutineCollectionTab(tab)}
              onKeyDown={event => handleRoutineCollectionTabKeyDown(event, tab)}
            >
              {label} <span className="ml-1 text-xs font-bold text-muted-foreground">{count}</span>
            </button>
          );
        })}
      </div>

      {routinesExercisesSelected ? (
        <section id="workout-scope-panel-exercises" className="caizen-tab-panel-motion border-t border-border/50 pt-4" role="tabpanel" tabIndex={0} aria-labelledby="workout-routine-tab-exercises" data-state="active">
          <ExerciseLibraryPanel androidPresentation={androidPresentation} profileId={context.currentProfileId} exercises={exercises} scope={exerciseScope} setScope={setExerciseScope} query={query} setQuery={setQuery} categoryFilter={exerciseCategoryFilter} setCategoryFilter={setExerciseCategoryFilter} bodyAreaFilter={exerciseBodyAreaFilter} setBodyAreaFilter={setExerciseBodyAreaFilter} primaryMuscleFilter={exercisePrimaryMuscleFilter} setPrimaryMuscleFilter={setExercisePrimaryMuscleFilter} equipmentFilter={exerciseEquipmentFilter} setEquipmentFilter={setExerciseEquipmentFilter} difficultyFilter={exerciseDifficultyFilter} setDifficultyFilter={value => setExerciseDifficultyFilter(value)} targetFilter={exerciseTargetFilter} setTargetFilter={value => setExerciseTargetFilter(value)} kindFilter={kindFilter} setKindFilter={setKindFilter} onCreate={() => { setEditingExercise(null); setRoutineReturnTarget(null); setShowExerciseBuilder(true); }} onSelect={(exercise, trigger) => { exerciseTriggerRef.current = trigger; setSelectedExercise(exercise); }} onEdit={exercise => { setEditingExercise(exercise); setShowExerciseBuilder(true); }} onDelete={exercise => context.deleteWorkoutExercise(exercise.id)} selectedExerciseIds={selectedExerciseIds} onToggleSelect={toggleExerciseSelection} onClearSelection={clearExerciseSelection} onCreateRoutine={createRoutineFromSelectedExercises} routineReferenceCounts={routineReferenceCounts} favoriteExerciseIds={favoriteWorkoutExerciseIds} onToggleFavorite={toggleFavoriteWorkoutExercise} />
        </section>
      ) : workoutScope === 'mine' ? (
        <section ref={mineRoutinePanelRef} id="workout-scope-panel-mine" className="caizen-tab-panel-motion section-surface p-4" role="tabpanel" tabIndex={0} aria-labelledby={`workout-routine-tab-${routineArchiveView}`} data-state="active">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 id="my-routines-title" className="text-lg font-black">{routineArchiveView === 'active' ? 'Your saved routines' : 'Archived routines'}</h4>
              <p className="mt-1 text-sm text-muted-foreground">{routineArchiveView === 'active' ? 'Personal routines with a visual cover, start, schedule, edit, and archive actions.' : 'Archived routines stay available here, while their workout history is kept.'}</p>
            </div>
            <span className="text-xs font-bold text-muted-foreground">{visibleCustomRoutines.length} {routineArchiveView === 'active' ? 'saved' : 'archived'}</span>
          </div>
          {visibleCustomRoutines.length === 0 ? (
            <div className="mt-4 rounded-3xl border border-dashed border-border/70 bg-background/25 p-8 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Dumbbell className="size-5" aria-hidden="true" /></div>
              <h4 className="mt-4 text-base font-black">{routineArchiveView === 'active' ? 'Your workout shelf is empty' : 'No archived routines'}</h4>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{routineArchiveView === 'active' ? 'Create a personal routine or start with a starter workout. You can add a cover photo while customizing it.' : 'Archived routines will stay available here without appearing in your active routine list.'}</p>
              {routineArchiveView === 'active' ? <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" className={primary} onClick={requestNewRoutine}><Plus className="h-4 w-4" />Create workout</button>
                <button type="button" className={control} onClick={() => setWorkoutScope('starter')}>Browse starters <ChevronRight className="h-4 w-4" /></button>
              </div> : null}
            </div>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleCustomRoutines.map(routine => <RoutineCard key={routine.id} routine={routine} androidPresentation={androidPresentation} profileId={context.currentProfileId} scheduleItem={scheduleItemForRoutine(routine.id)} activity={deriveHealthLifeHubActivity({ type: 'workout-routine', entityId: routine.id }, context.dailyChecklistItems, context.productivityItems)} sessions={context.workoutSessions} onStart={() => begin(routine)} onSchedule={() => openSchedule(routine)} onClone={() => cloneRoutine(routine)} onEdit={() => setRoutineBuilder(routine)} onArchive={routineArchiveView === 'active' ? () => context.updateWorkoutRoutine(routine.id, { archived: true }) : undefined} onUnarchive={routineArchiveView === 'archived' ? () => context.updateWorkoutRoutine(routine.id, { archived: false }) : undefined} onDelete={() => deleteRoutine(routine)} />)}
            </div>
          )}
        </section>
      ) : (
        <section id="workout-scope-panel-starter" className="caizen-tab-panel-motion section-surface p-4" ref={starterRoutinesRef} role="tabpanel" tabIndex={0} aria-labelledby="workout-routine-tab-starter" data-state="active">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 id="starter-templates-title" className="text-lg font-black">Starter routines</h4>
             <p className="mt-1 text-sm text-muted-foreground">Try a predefined routine, or copy one into Routines and edit it first.</p>
            </div>
            <span className="text-xs font-bold text-muted-foreground">{starterRoutines.length} available</span>
          </div>
          {starterRoutines.length === 0 ? <div className="mt-4 rounded-3xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">No starter workouts are available right now.</div> : (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {starterRoutines.map(routine => <RoutineCard key={routine.id} routine={routine} androidPresentation={androidPresentation} profileId={context.currentProfileId} scheduleItem={scheduleItemForRoutine(routine.id)} activity={deriveHealthLifeHubActivity({ type: 'workout-routine', entityId: routine.id }, context.dailyChecklistItems, context.productivityItems)} sessions={context.workoutSessions} onStart={() => begin(routine)} onSchedule={() => openSchedule(routine)} onClone={() => cloneRoutine(routine)} />)}
            </div>
          )}
        </section>
      )}
    </div>
  ) : null;

  if (activeRunner) {
    return (
      <WorkoutSessionScreen>
        <WorkoutRunner profileId={context.currentProfileId} androidPresentation={androidPresentation} initialState={activeRunner} exercises={allExerciseDefinitions} sessions={context.workoutSessions} onSave={saveSession} onDiscard={discardSession} onLeave={() => { setActiveRunner(null); setCheckpoint(readWorkoutCheckpoint(context.currentProfileId)); }} onReviewHistory={() => setView('history')} />
      </WorkoutSessionScreen>
    );
  }

  if (view === 'history') {
    return (
      <section aria-labelledby="workout-progress-title" className={`mx-auto w-full max-w-[1440px] space-y-5 lg:space-y-4 ${androidPresentation ? 'android-health-workspace' : ''}`}>
        <div className="section-surface p-4 md:p-5">
          <div><h2 id="workout-progress-title" className="text-section-title">Your training history</h2><p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">Review guided workouts and activity logged on your own. Use Health Progress for trends and performance records.</p></div>
          <nav aria-label="Workout views" className="scrollbar-hide -mx-1 mt-4 flex max-w-full snap-x snap-proximity scroll-px-1 items-center gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1"><button type="button" className="caizen-tab inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-colors text-muted-foreground" onClick={() => setView('today')}><Sparkles className="h-4 w-4" />Today</button><button type="button" className="caizen-tab inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-colors text-muted-foreground" onClick={() => setView('routines')}><Library className="h-4 w-4" />Routines</button><button type="button" className="caizen-tab caizen-tab-active inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-colors text-foreground" aria-current="page"><History className="h-4 w-4" />History</button><button type="button" className="caizen-tab inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-colors text-muted-foreground" onClick={() => setView('library')}><Dumbbell className="h-4 w-4" />Exercises</button></nav>
        </div>
        <div className="flex items-center gap-2 border-b border-border/60 pb-2" role="group" aria-label="Training history navigation">

          <button type="button" className="caizen-tab inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-muted-foreground" onClick={onOpenProgress}>
            <BarChart3 className="h-4 w-4" />Progress
          </button>
        </div>
        <div id="workout-progress-history-panel" className="section-surface p-4 md:p-5" role="region" aria-label="Training history" tabIndex={0}>
          <UnifiedTrainingHistory sessions={context.workoutSessions} entries={context.health.activityEntries} androidPresentation={androidPresentation} legacyPanel={oldPanel} onManualLog={onManualLog} onEditActivity={onEditActivity} onDeleteActivity={onDeleteActivity} onDeleteSession={context.deleteWorkoutSession} onOpenExercise={(exerciseId, trigger) => {
            const exercise = allExerciseDefinitions.find(item => item.id === exerciseId);
            if (!exercise) return;
            exerciseTriggerRef.current = trigger;
            setSelectedExercise(exercise);
          }} />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="workout-workspace-title" className={`android-health-workspace mx-auto w-full max-w-[1440px] space-y-5 lg:space-y-4`}>
      <div className="section-surface p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 id="workout-workspace-title" className="text-2xl font-black tracking-tight md:text-[1.625rem]">{view === 'today' ? workoutTodayHeading : view === 'routines' ? 'Your routines' : view === 'library' ? 'Find your next exercise' : 'Your training progress'}</h2><p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{view === 'today' ? `Choose a routine, start when ready, and record what happens for ${defaultDateIsToday ? 'today' : 'this selected day'}.` : view === 'routines' ? 'Keep reusable routines close, then start or schedule the one that fits today.' : view === 'library' ? 'Browse your personal exercises first, then explore the full movement library when you need more.' : 'Review what you have done and how consistently you are training.'}</p></div>
          {view === 'today' && <button type="button" className={control} onClick={onManualLog}><Plus className="h-4 w-4" />Log activity</button>}
         </div>
          <nav aria-label="Workout views" className="scrollbar-hide -mx-1 mt-4 flex max-w-full snap-x snap-proximity scroll-px-1 items-center gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1">{([['today', 'Today', Sparkles], ['routines', 'Routines', Library], ['history', 'History', History], ['library', 'Exercises', Dumbbell]] as const).map(([id, label, Icon]) => { const selected = view === id; return <button key={id} type="button" className={`caizen-tab inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-colors ${selected ? 'caizen-tab-active text-foreground' : 'text-muted-foreground'}`} aria-current={selected ? 'page' : undefined} onClick={() => setView(id)}><Icon className="h-4 w-4" />{label}</button>; })}</nav>
      </div>

      {routineCollectionPanel}
      {checkpoint && (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black">Workout in progress</p><p className="mt-1 text-sm font-bold">{activeCheckpointRoutine?.name || checkpoint.routine.name}</p><p className="mt-1 text-xs text-muted-foreground">Resume where you left off, or discard this unfinished workout.</p></div><div className="flex gap-2"><button type="button" className={primary} onClick={resume}><RotateCcw className="h-4 w-4" />Resume</button><button type="button" className={control} onClick={discardSession}>Discard</button></div></div>
      )}
      {templatePickerOpen && <RoutineTemplatePicker onSelect={launchRoutineBuilder} onBrowseStarters={() => { setTemplatePickerOpen(false); setWorkoutScope('starter'); setView('routines'); }} onCancel={() => setTemplatePickerOpen(false)} />}
      {showExerciseBuilder && <ExerciseBuilder profileId={context.currentProfileId} initialExercise={editingExercise} onSave={saveExercise} onCancel={() => { const target = routineReturnTarget; setShowExerciseBuilder(false); setEditingExercise(null); if (target) setRoutineBuilder(target); setRoutineReturnTarget(null); }} />}
      {routineBuilder && <RoutineBuilder profileId={context.currentProfileId} exercises={allExerciseDefinitions} favoriteExerciseIds={favoriteWorkoutExerciseIds} onToggleFavorite={toggleFavoriteWorkoutExercise} sessions={context.workoutSessions} initialRoutine={routineBuilder === 'new' ? undefined : routineBuilder} copyMode={Boolean(routineCopySource)} initialDraft={routineDraft} initialItems={routineDraftItems} onSave={saveRoutine} onCreateExercise={draft => { setRoutineDraft(draft); setRoutineDraftItems(draft.items); setRoutineReturnTarget(routineBuilder); setRoutineBuilder(null); setShowExerciseBuilder(true); }} onCancel={() => { setRoutineBuilder(null); setRoutineCopySource(null); setRoutineDraft(undefined); setRoutineDraftItems(undefined); if (routineSelectionReturnView === 'library') setView('library'); else if (routineSelectionReturnView === 'routines') { setView('routines'); setRoutinesExercisesSelected(true); } setRoutineSelectionReturnView(null); }} />}

      {scheduleRoutine ? <WorkoutScheduleModal routine={scheduleRoutine} defaultDate={defaultDate} existingItem={scheduleItemForRoutine(scheduleRoutine.id)} onSave={payload => saveSchedule(scheduleRoutine, payload)} onRemove={() => removeSchedule(scheduleRoutine)} onCancel={() => setScheduleRoutine(null)} /> : null}

      {view === 'today' && <div className="space-y-5 lg:space-y-4 [&>*+*]:border-t [&>*+*]:border-border/50 [&>*+*]:pt-5">
        <div className="space-y-4">
          <div className="section-surface p-5 lg:p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-muted-foreground">{workoutDateContext}</p>{scheduledRoutineEntries.length > 0 ? <><h3 className="mt-2 text-xl font-black">{scheduledRoutineEntries[0].routine?.name || scheduledRoutineEntries[0].item.title}</h3><p className="mt-2 text-sm text-muted-foreground">Your scheduled workout for this date is ready when you are.</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground">{scheduledTimeLabel(scheduledRoutineEntries[0].item.scheduledTime) && <span>{scheduledTimeLabel(scheduledRoutineEntries[0].item.scheduledTime)}</span>}{scheduledRoutineEntries[0].routine && <span>{scheduledRoutineEntries[0].routine.items.length} exercises</span>}{scheduledRoutineEntries[0].routine?.estimatedDurationMinutes && <span>{scheduledRoutineEntries[0].routine.estimatedDurationMinutes} min</span>}{scheduledRoutineEntries[0].status === 'done' && <span>Calendar occurrence completed</span>}{scheduledRoutineEntries[0].status === 'skipped' && <span>Calendar occurrence skipped</span>}</div></> : <><h3 className="mt-2 text-xl font-black">{customRoutines.length > 0 ? 'Choose one of Routines.' : establishedWorkoutUser ? 'Create your next workout.' : 'Choose a starter workout.'}</h3><p className="mt-2 text-sm text-muted-foreground">{customRoutines.length > 0 ? 'No workout is scheduled for this date. Start a personal workout when you are ready.' : establishedWorkoutUser ? 'No workout is scheduled for this date. Create a personal workout or browse starters.' : 'No workout is scheduled for this date. Pick a starter below to begin; nothing starts until you choose it.'}</p></>}</div></div>{scheduledRoutineEntries.length > 0 ? scheduledRoutineEntries[0].routine ? <button type="button" className={`${primary} mt-4`} onClick={() => begin(scheduledRoutineEntries[0].routine!)} aria-label={`Start ${scheduledRoutineEntries[0].routine.name}`}><Play className="h-4 w-4" />Start {scheduledRoutineEntries[0].routine.name}</button> : <p className="mt-4 rounded-xl border border-dashed border-border/60 px-3 py-2 text-sm font-bold text-muted-foreground">This scheduled routine is unavailable. Open Routines to choose another.</p> : customRoutines.length > 0 ? <button type="button" className={`${primary} mt-4`} onClick={() => setView('routines')}><Library className="h-4 w-4" />Open Routines</button> : establishedWorkoutUser ? <button type="button" className={`${primary} mt-4`} onClick={() => { setRoutineDraftItems(undefined); setRoutineBuilder('new'); }}><Plus className="h-4 w-4" />Create workout</button> : <button type="button" className={`${primary} mt-4`} onClick={chooseStarterRoutine}><Dumbbell className="h-4 w-4" />Choose a starter workout</button>}{scheduledRoutineEntries.length > 1 && <div className="mt-4 border-t border-border/50 pt-4"><p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Also scheduled for this date</p><div className="mt-2 space-y-2">{scheduledRoutineEntries.slice(1).map(entry => entry.routine ? <button key={entry.item.id} type="button" className={`${control} w-full justify-between`} onClick={() => begin(entry.routine!)} aria-label={`Start ${entry.routine.name}`}><OverflowTooltip text={entry.routine.name}><span className="truncate">{entry.routine.name}</span></OverflowTooltip><span className="shrink-0 text-xs text-muted-foreground">Start</span></button> : <p key={entry.item.id} className="rounded-xl border border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground">{entry.item.title} is unavailable.</p>)}</div></div>}</div>
          <HealthDetails title="Recent activity">{recentSessions.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No guided sessions yet. Pick a starter routine to create your first record.</p> : <div className="mt-2 space-y-2">{recentSessions.slice(0, 3).map(session => <div key={session.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 break-words font-bold">{session.routineName}</span><span className="shrink-0 text-xs text-muted-foreground">{session.status === 'partial' ? `${session.completedExerciseCount}/${session.totalExerciseCount} partial` : `${session.completedExerciseCount} done`}</span></div>)}</div>}</HealthDetails>
        </div>
        {customRoutines.length > 0 ? <div><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-lg font-black">Routines</h3><p className="mt-1 text-sm text-muted-foreground">Your personal workouts are ready to start.</p></div><button type="button" className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-black text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" onClick={() => setView('routines')}>View all <ChevronRight className="h-4 w-4" /></button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{customRoutines.slice(0, 4).map(routine => <RoutineCard key={routine.id} routine={routine} androidPresentation={androidPresentation} scheduleItem={scheduleItemForRoutine(routine.id)} sessions={context.workoutSessions} onStart={() => begin(routine)} onSchedule={() => openSchedule(routine)} onClone={() => cloneRoutine(routine)} onEdit={() => setRoutineBuilder(routine)} />)}</div></div> : establishedWorkoutUser ? <div className="rounded-3xl border border-border/60 bg-background/30 p-5 lg:p-4"><h3 className="text-xl font-black">Build your next workout</h3><p className="mt-2 max-w-xl text-sm text-muted-foreground">You have workout history, so your personal workouts take priority here. Create one or browse starter workouts when you want a base.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" className={primary} onClick={() => { setRoutineDraftItems(undefined); setRoutineBuilder('new'); setView('routines'); }}><Plus className="h-4 w-4" />New routine</button><button type="button" className={control} onClick={() => setView('routines')}>Browse starters <ChevronRight className="h-4 w-4" /></button></div></div> : <div ref={starterRoutinesRef}><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-lg font-black">Starter routines</h3><button type="button" className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-black text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" onClick={() => setView('routines')}>View all <ChevronRight className="h-4 w-4" /></button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{starterRoutines.slice(0, 3).map(routine => <RoutineCard key={routine.id} routine={routine} androidPresentation={androidPresentation} scheduleItem={scheduleItemForRoutine(routine.id)} sessions={context.workoutSessions} onStart={() => begin(routine)} onSchedule={() => openSchedule(routine)} onClone={() => cloneRoutine(routine)} />)}</div></div>}
      </div>}

      {view === 'library' && <ExerciseLibraryPanel androidPresentation={androidPresentation} profileId={context.currentProfileId} exercises={exercises} scope={exerciseScope} setScope={setExerciseScope} query={query} setQuery={setQuery} categoryFilter={exerciseCategoryFilter} setCategoryFilter={setExerciseCategoryFilter} bodyAreaFilter={exerciseBodyAreaFilter} setBodyAreaFilter={setExerciseBodyAreaFilter} primaryMuscleFilter={exercisePrimaryMuscleFilter} setPrimaryMuscleFilter={setExercisePrimaryMuscleFilter} equipmentFilter={exerciseEquipmentFilter} setEquipmentFilter={setExerciseEquipmentFilter} difficultyFilter={exerciseDifficultyFilter} setDifficultyFilter={value => setExerciseDifficultyFilter(value)} targetFilter={exerciseTargetFilter} setTargetFilter={value => setExerciseTargetFilter(value)} kindFilter={kindFilter} setKindFilter={setKindFilter} onCreate={() => { setEditingExercise(null); setRoutineReturnTarget(null); setShowExerciseBuilder(true); }} onSelect={(exercise, trigger) => { exerciseTriggerRef.current = trigger; setSelectedExercise(exercise); }} onEdit={exercise => { setEditingExercise(exercise); setShowExerciseBuilder(true); }} selectedExerciseIds={selectedExerciseIds} onToggleSelect={toggleExerciseSelection} onClearSelection={clearExerciseSelection} onCreateRoutine={createRoutineFromSelectedExercises} routineReferenceCounts={routineReferenceCounts} onDelete={exercise => context.deleteWorkoutExercise(exercise.id)} favoriteExerciseIds={favoriteWorkoutExerciseIds} onToggleFavorite={toggleFavoriteWorkoutExercise} />}


      {selectedExercise && <ExerciseDetail exercise={selectedExercise} androidPresentation={androidPresentation} profileId={context.currentProfileId} sessions={context.workoutSessions} onClose={closeExerciseDetail} onRestoreFocus={restoreExerciseDetailFocus} onAddToRoutine={() => addExerciseToRoutine(selectedExercise)} onCustomize={() => { setCustomizeExercise(selectedExercise); setSelectedExercise(null); }} />}
      {customizeExercise && <ExerciseCustomizeForm exercise={customizeExercise} profileId={context.currentProfileId} onSave={saveExerciseCustomization} onCancel={() => setCustomizeExercise(null)} />}
    </section>
  );
}
