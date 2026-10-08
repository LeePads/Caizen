'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SleepTimePicker from '@/components/ui/sleep-time-picker';
import { AndroidBooleanControl } from '@/components/native/android-design';
import { hasWorkoutPlanValidationErrors, validateWorkoutPlanDraft, type WorkoutPlanValidationErrors } from '@/lib/health/workout-validation';
import { guardHealthNumberChange, guardHealthTextChange } from '@/lib/health/validation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  ActivityIntensity,
  ChecklistFrequency,
  DailyChecklistItem,
  WorkoutPlan,
  WorkoutPlanExercise,
} from '@/lib/types';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export type WorkoutPlanScheduleDraft = {
  enabled: boolean;
  frequency: ChecklistFrequency;
  weekdays: number[];
  reminderEnabled: boolean;
  scheduledTime: string;
  reminderTime: string;
  active: boolean;
};

export type WorkoutPlanSaveDraft = {
  plan: Omit<WorkoutPlan, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
  };
  schedule: WorkoutPlanScheduleDraft;
};

type Props = {
  isOpen: boolean;
  androidPresentation?: boolean;
  plan?: WorkoutPlan | null;
  routine?: DailyChecklistItem | null;
  onClose: () => void;
  onSave: (draft: WorkoutPlanSaveDraft) => void;
};

const WEEKDAYS = [
  { value: 1, short: 'M', label: 'Monday' },
  { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' },
  { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' },
  { value: 6, short: 'S', label: 'Saturday' },
  { value: 0, short: 'S', label: 'Sunday' },
];

const createExercise = (): WorkoutPlanExercise => ({
  id: `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  sets: 3,
  reps: '8-12',
  restSeconds: 60,
});

const toOptionalNumber = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
};

export default function WorkoutPlanModal({
  isOpen,
  androidPresentation = false,
  plan,
  routine,
  onClose,
  onSave,
}: Props) {
  const initial = useMemo(
    () => ({
      name: plan?.name || '',
      description: plan?.description || '',
      estimatedDurationMinutes: plan?.estimatedDurationMinutes
        ? String(plan.estimatedDurationMinutes)
        : '',
      estimatedCalories: plan?.estimatedCalories
        ? String(plan.estimatedCalories)
        : '',
      defaultIntensity: (plan?.defaultIntensity ||
        'moderate') as ActivityIntensity,
      exercises: plan?.exercises?.length
        ? plan.exercises.map(exercise => ({ ...exercise }))
        : [createExercise()],
      schedule: {
        enabled: Boolean(routine),
        frequency: (routine?.frequency ||
          'weekdays') as ChecklistFrequency,
        weekdays: routine?.weekdays?.length
          ? [...routine.weekdays]
          : [1, 3, 5],
        reminderEnabled: Boolean(routine?.reminderEnabled),
        scheduledTime: routine?.scheduledTime || '',
        reminderTime:
          routine?.reminderTime || (routine?.reminderEnabled ? routine?.scheduledTime : undefined) || '18:00',
        active: routine?.active !== false,
      } satisfies WorkoutPlanScheduleDraft,
    }),
    [plan, routine],
  );

  const [draft, setDraft] = useState(initial);
  const [validation, setValidation] = useState<WorkoutPlanValidationErrors>({ exercise: {} });
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(initial);
      setValidation({ exercise: {} });
      setConfirmDiscard(false);
    }
  }, [initial, isOpen]);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(initial);
  const attemptClose = () => {
    if (hasChanges) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const updateExercise = (
    id: string,
    patch: Partial<WorkoutPlanExercise>,
  ) => {
    setDraft(current => ({
      ...current,
      exercises: current.exercises.map(exercise =>
        exercise.id === id ? { ...exercise, ...patch } : exercise,
      ),
    }));
  };

  const updatePlanText = (key: 'name' | 'description', value: string) => {
    const result = guardHealthTextChange(draft[key], value, {
      label: key === 'name' ? 'Plan name' : 'Description',
      maxLength: key === 'name' ? 120 : 500,
      mode: key === 'name' ? 'single-line' : 'multiline',
    });
    if (!result.accepted) {
      setValidation(current => ({ ...current, [key]: result.error }));
      return;
    }
    setDraft(current => ({ ...current, [key]: result.value }));
    setValidation(current => ({ ...current, [key]: result.error }));
  };

  const updatePlanNumber = (key: 'estimatedDurationMinutes' | 'estimatedCalories', value: string) => {
    const result = guardHealthNumberChange(draft[key], value, {
      label: key === 'estimatedDurationMinutes' ? 'Estimated minutes' : 'Estimated calories',
      ...(key === 'estimatedDurationMinutes' ? { min: 0, max: 1440, integer: true, unit: 'minutes' } : { min: 0, max: 10000, integer: true, unit: 'kcal' }),
      allowBlank: true,
    });
    if (!result.accepted) {
      setValidation(current => ({ ...current, [key]: result.error }));
      return;
    }
    setDraft(current => ({ ...current, [key]: result.value }));
    setValidation(current => ({ ...current, [key]: result.error }));
  };

  const updateExerciseNumber = (id: string, key: 'sets' | 'restSeconds' | 'durationMinutes', value: string) => {
    const options = key === 'sets'
      ? { min: 1, max: 100, integer: true }
      : key === 'restSeconds'
        ? { min: 0, max: 3600, integer: true }
        : { min: 0, max: 1440, integer: true };
    const currentExercise = draft.exercises.find(exercise => exercise.id === id);
    const currentValue = currentExercise?.[key] == null ? '' : String(currentExercise[key]);
    const result = guardHealthNumberChange(currentValue, value, { label: key, ...options, allowBlank: true });
    if (!result.accepted) {
      setValidation(current => ({ ...current, exercise: { ...current.exercise, [`${id}.${key}`]: result.error || '' } }));
      return;
    }
    updateExercise(id, { [key]: result.value === '' ? undefined : Number(result.value) });
    setValidation(current => ({ ...current, exercise: { ...current.exercise, [`${id}.${key}`]: result.error || '' } }));
  };

  const addExercise = () => {
    setDraft(current => ({
      ...current,
      exercises: [...current.exercises, createExercise()],
    }));
  };

  const removeExercise = (id: string) => {
    setDraft(current => ({
      ...current,
      exercises: current.exercises.filter(exercise => exercise.id !== id),
    }));
  };

  const toggleWeekday = (weekday: number) => {
    setDraft(current => ({
      ...current,
      schedule: {
        ...current.schedule,
        weekdays: current.schedule.weekdays.includes(weekday)
          ? current.schedule.weekdays.filter(value => value !== weekday)
          : [...current.schedule.weekdays, weekday],
      },
    }));
  };

  const submit = () => {
    const name = draft.name.trim();
    const exercises = draft.exercises
      .map(exercise => ({
        ...exercise,
        name: exercise.name.trim(),
      }))
      .filter(exercise => exercise.name);

    const nextValidation = validateWorkoutPlanDraft({
      name: draft.name,
      description: draft.description,
      estimatedDurationMinutes: draft.estimatedDurationMinutes,
      estimatedCalories: draft.estimatedCalories,
      exercises,
    });
    setValidation(nextValidation);
    if (hasWorkoutPlanValidationErrors(nextValidation)) return;

    onSave({
      plan: {
        id: plan?.id,
        name,
        description: draft.description.trim() || undefined,
        exercises,
        estimatedDurationMinutes: toOptionalNumber(
          draft.estimatedDurationMinutes,
        ),
        estimatedCalories: toOptionalNumber(draft.estimatedCalories),
        defaultIntensity: draft.defaultIntensity,
        archived: plan?.archived || false,
      },
      schedule: draft.schedule,
    });
  };

  const canSave =
    Boolean(draft.name.trim()) &&
    draft.exercises.some(exercise => exercise.name.trim());

  return (
    <>
    <Dialog open={isOpen} onOpenChange={open => !open && attemptClose()}>
      <DialogContent
        allowOutsideDismiss={androidPresentation}
        style={{
          width: 'min(1120px, calc(100vw - 16px))',
          maxWidth: 'none',
          height: 'min(90dvh, 880px)',
        }}
        className="flex !max-w-none flex-col gap-0 overflow-hidden rounded-[1.75rem] border-border/70 bg-background p-0 shadow-2xl [&>button]:right-4 [&>button]:top-4 [&>button]:grid [&>button]:size-10 [&>button]:place-items-center [&>button]:rounded-xl [&>button]:border [&>button]:border-border/70 [&>button]:bg-background/90"
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 pr-16 text-left sm:px-6 sm:py-5 sm:pr-20">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 hidden size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary sm:grid">
              <Dumbbell className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-xl font-black tracking-tight sm:text-2xl">
                {plan ? 'Edit workout plan' : 'Create workout plan'}
              </DialogTitle>
              <DialogDescription className="mt-1 max-w-2xl text-sm leading-5">
                Build the workout here. Add a Life Hub schedule only when you
                want it to repeat.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-4 sm:space-y-5">
            <section className="rounded-2xl border border-border/60 bg-card/45 p-4 sm:p-5">
              <div className="mb-4">
                <h3 className="font-black">Plan details</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Keep the summary short. Exercise details are managed below.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                    Plan name
                  </span>
                  <input
                    autoFocus
                    value={draft.name}
                    onChange={event => updatePlanText('name', event.target.value)}
                    placeholder="Upper Body, Cardio, Full Body..."
                    aria-invalid={Boolean(validation.name)}
                    aria-describedby="workout-plan-name-error"
                    className="control-input h-11 w-full"
                  />
                  <div id="workout-plan-name-error" className="min-h-[20px] pt-0.5">{validation.name ? <span role="alert" className="text-xs font-semibold text-destructive">{validation.name}</span> : null}</div>
                </label>

                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                    Description
                  </span>
                  <textarea
                    value={draft.description}
                    onChange={event => updatePlanText('description', event.target.value)}
                    placeholder="Optional focus or instructions"
                    aria-invalid={Boolean(validation.description)}
                    aria-describedby="workout-plan-description-error"
                    className="control-input min-h-20 w-full resize-y py-3"
                  />
                  <div id="workout-plan-description-error" className="min-h-[20px] pt-0.5">{validation.description ? <span role="alert" className="text-xs font-semibold text-destructive">{validation.description}</span> : null}</div>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                    Estimated minutes
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={draft.estimatedDurationMinutes}
                    onChange={event => updatePlanNumber('estimatedDurationMinutes', event.target.value)}
                    placeholder="Optional"
                    className="control-input health-number-input h-11 w-full"
                  />
                  <div className="min-h-[20px] pt-0.5">{validation.estimatedDurationMinutes ? <span role="alert" className="text-xs font-semibold text-destructive">{validation.estimatedDurationMinutes}</span> : null}</div>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                    Estimated calories
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={draft.estimatedCalories}
                    onChange={event => updatePlanNumber('estimatedCalories', event.target.value)}
                    placeholder="Optional"
                    className="control-input health-number-input h-11 w-full"
                  />
                  <div className="min-h-[20px] pt-0.5">{validation.estimatedCalories ? <span role="alert" className="text-xs font-semibold text-destructive">{validation.estimatedCalories}</span> : null}</div>
                </label>

                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                    Default intensity
                  </span>
                  <Select value={draft.defaultIntensity} onValueChange={value => setDraft(current => ({ ...current, defaultIntensity: value as ActivityIntensity }))}>
                    <SelectTrigger className="control-input h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="vigorous">Vigorous</SelectItem></SelectContent>
                  </Select>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-border/60 bg-card/45 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-black">Exercises</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Each exercise stays in its own compact card, so the modal
                    never scrolls sideways.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addExercise}
                  className="h-10 shrink-0 rounded-xl"
                >
                  <Plus className="mr-2 size-4" />
                  Add
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {draft.exercises.map((exercise, index) => (
                  <article
                    key={exercise.id}
                    className="rounded-2xl border border-border/60 bg-background/60 p-3 sm:p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                        Exercise {index + 1}
                      </p>
                      <button
                        type="button"
                        disabled={draft.exercises.length === 1}
                        onClick={() => removeExercise(exercise.id)}
                        className="grid size-9 place-items-center rounded-xl border border-destructive/25 text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={`Remove exercise ${index + 1}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <label className="block space-y-2">
                      <span className="text-xs font-bold text-muted-foreground">
                        Exercise name
                      </span>
                      <input
                        value={exercise.name}
                        onChange={event => {
                          const result = guardHealthTextChange(exercise.name, event.target.value, { label: 'Exercise name', maxLength: 100 });
                          if (!result.accepted) return setValidation(current => ({ ...current, exercise: { ...current.exercise, [`${exercise.id}.name`]: result.error || '' } }));
                          updateExercise(exercise.id, { name: result.value });
                          setValidation(current => ({ ...current, exercise: { ...current.exercise, [`${exercise.id}.name`]: result.error || '' } }));
                        }}
                        placeholder="Bench press"
                        className="control-input h-11 w-full"
                      />
                      <div className="min-h-[20px] pt-0.5">{validation.exercise[`${exercise.id}.name`] ? <span role="alert" className="text-xs font-semibold text-destructive">{validation.exercise[`${exercise.id}.name`]}</span> : null}</div>
                    </label>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <label className="space-y-2">
                        <span className="text-xs font-bold text-muted-foreground">
                          Sets
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={exercise.sets ?? ''}
                          onChange={event => updateExerciseNumber(exercise.id, 'sets', event.target.value)}
                          placeholder="Enter sets"
                          className="control-input health-number-input h-10 w-full"
                        />
                        <div className="min-h-[20px] pt-0.5">{validation.exercise[`${exercise.id}.sets`] ? <span role="alert" className="text-xs font-semibold text-destructive">{validation.exercise[`${exercise.id}.sets`]}</span> : null}</div>
                      </label>

                      <label className="space-y-2">
                        <span className="text-xs font-bold text-muted-foreground">
                          Reps
                        </span>
                        <input
                          value={exercise.reps || ''}
                          onChange={event => {
                            const result = guardHealthTextChange(exercise.reps || '', event.target.value, { label: 'Reps', maxLength: 7 });
                            if (!result.accepted) return setValidation(current => ({ ...current, exercise: { ...current.exercise, [`${exercise.id}.reps`]: result.error || '' } }));
                            updateExercise(exercise.id, { reps: result.value });
                            setValidation(current => ({ ...current, exercise: { ...current.exercise, [`${exercise.id}.reps`]: result.error || '' } }));
                          }}
                          placeholder="Enter reps"
                          className="control-input h-10 w-full"
                        />
                        <div className="min-h-[20px] pt-0.5">{validation.exercise[`${exercise.id}.reps`] ? <span role="alert" className="text-xs font-semibold text-destructive">{validation.exercise[`${exercise.id}.reps`]}</span> : null}</div>
                      </label>

                      <label className="space-y-2">
                        <span className="text-xs font-bold text-muted-foreground">
                          Rest seconds
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={exercise.restSeconds ?? ''}
                          onChange={event => updateExerciseNumber(exercise.id, 'restSeconds', event.target.value)}
                          placeholder="Enter seconds"
                          className="control-input health-number-input h-10 w-full"
                        />
                        <div className="min-h-[20px] pt-0.5">{validation.exercise[`${exercise.id}.restSeconds`] ? <span role="alert" className="text-xs font-semibold text-destructive">{validation.exercise[`${exercise.id}.restSeconds`]}</span> : null}</div>
                      </label>

                      <label className="space-y-2">
                        <span className="text-xs font-bold text-muted-foreground">
                          Minutes
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={exercise.durationMinutes ?? ''}
                          onChange={event => updateExerciseNumber(exercise.id, 'durationMinutes', event.target.value)}
                          placeholder="Optional"
                          className="control-input health-number-input h-10 w-full"
                        />
                        <div className="min-h-[20px] pt-0.5">{validation.exercise[`${exercise.id}.durationMinutes`] ? <span role="alert" className="text-xs font-semibold text-destructive">{validation.exercise[`${exercise.id}.durationMinutes`]}</span> : null}</div>
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="border-t border-border/60 pt-4 sm:pt-5">
              <label className="flex cursor-pointer items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-black">
                    Schedule in Life Hub
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Create a linked recurring routine and show its occurrences
                    in the Life Hub calendar.
                  </span>
                </span>
                <AndroidBooleanControl
                  checked={draft.schedule.enabled}
                  onCheckedChange={checked => setDraft(current => ({
                      ...current,
                      schedule: {
                        ...current.schedule,
                        enabled: checked,
                      },
                    }))}
                  className="mt-1 size-5 shrink-0 accent-primary"
                />
              </label>

              {draft.schedule.enabled ? (
                <div className="mt-2 border-t border-border/50 pt-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                        Repeat
                      </span>
                      <Select value={draft.schedule.frequency} onValueChange={value => setDraft(current => ({ ...current, schedule: { ...current.schedule, frequency: value as ChecklistFrequency } }))}>
                        <SelectTrigger className="control-input h-10 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="daily">Every day</SelectItem><SelectItem value="weekdays">Selected days</SelectItem></SelectContent>
                      </Select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                        Workout time
                      </span>
                      <SleepTimePicker
                        label="Workout time"
                        value={draft.schedule.scheduledTime}
                        onChange={value =>
                          setDraft(current => ({
                            ...current,
                            schedule: {
                              ...current.schedule,
                              scheduledTime: value,
                            },
                          }))
                        }
                        className="control-input h-10 w-full"
                      />
                    </label>
                    {draft.schedule.reminderEnabled ? (
                      <label className="space-y-1.5">
                        <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                          Notification time
                        </span>
                        <SleepTimePicker
                          label="Notification time"
                          value={draft.schedule.reminderTime}
                          onChange={value =>
                            setDraft(current => ({
                              ...current,
                              schedule: {
                                ...current.schedule,
                                reminderTime: value,
                              },
                            }))
                          }
                          className="control-input h-10 w-full"
                        />
                      </label>
                    ) : null}
                  </div>

                  {draft.schedule.frequency === 'weekdays' ? (
                    <div className="mt-2">
                      <p className="mb-1.5 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                        Days
                      </p>
                      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                        {WEEKDAYS.map(day => {
                          const selected = draft.schedule.weekdays.includes(
                            day.value,
                          );

                          return (
                            <Tooltip key={day.value}><TooltipTrigger asChild><button
                              type="button"
                              aria-label={day.label}
                              aria-pressed={selected}
                              onClick={() => toggleWeekday(day.value)}
                              className={`grid h-10 min-w-0 min-h-11 place-items-center rounded-xl border text-xs font-black transition ${
                                selected
                                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                  : 'border-border/70 bg-background/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                              }`}
                            >
                              {day.short}
                            </button></TooltipTrigger><TooltipContent>{day.label}</TooltipContent></Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/30 px-2.5 py-2">
                    <span>
                      <span className="block text-sm font-bold leading-5">
                        Android reminder
                      </span>
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                        Use the workout time for a local notification.
                      </span>
                    </span>
                    <AndroidBooleanControl
                      checked={draft.schedule.reminderEnabled}
                      onCheckedChange={checked => setDraft(current => ({
                          ...current,
                          schedule: {
                            ...current.schedule,
                            reminderEnabled: checked,
                          },
                        }))}
                      className="size-5 shrink-0 accent-primary"
                    />
                  </label>
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 bg-background/95 px-4 py-3 sm:px-6 sm:py-4">
          <Button
            type="button"
            variant="outline"
            onClick={attemptClose}
            className="h-11 rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={submit}
            className="h-11 rounded-xl"
          >
            {plan ? 'Save changes' : 'Create plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      isOpen={confirmDiscard}
      title="Discard workout plan changes?"
      message="Your unsaved workout plan changes will be lost."
      confirmText="Discard"
      cancelText="Keep editing"
      isDangerous
      onConfirm={() => { setConfirmDiscard(false); onClose(); }}
      onCancel={() => setConfirmDiscard(false)}
    />
    </>
  );
}
