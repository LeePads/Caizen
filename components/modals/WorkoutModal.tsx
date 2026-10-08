'use client';

import healthResponsive from '@/components/health/health-responsive.module.css';

import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Activity, Bike, Dumbbell, Footprints } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import FormattedTextarea from '@/components/common/FormattedTextarea';
import {
  CancelButton,
  FormField,
  ModalFooter,
  SaveButton,
} from '@/components/common/FormPatterns';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import type { ActivityEntry, ActivityIntensity } from '@/lib/types';
import { formatLocalDateInput } from '@/lib/date-utils';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { createEntityId } from '@/lib/utils';
import { guardHealthNumberChange, guardHealthTextChange, HEALTH_LIMITS, validateHealthNumber, validateHealthText } from '@/lib/health/validation';

export type WorkoutDraft = {
  recordId: string;
  id?: string;
  createdAt?: Date;
  activity: string;
  durationMinutes?: number;
  intensity?: ActivityIntensity;
  caloriesBurned: number;
  date: string;
  notes: string;
  imageUrl?: string;
  photoAssetIds?: string[];
};

type WorkoutInput = Omit<Partial<ActivityEntry>, 'date'> & {
  date?: Date | string;
};

type Props = {
  isOpen: boolean;
  workout?: WorkoutInput | null;
  defaultDate?: string;
  profileId?: string | null;
  onSave: (draft: WorkoutDraft) => Promise<void> | void;
  onClose: () => void;
};

type WorkoutPreset = {
  label: string;
  activity: string;
  durationMinutes: number;
  intensity: ActivityIntensity;
  icon: typeof Footprints;
};

const WORKOUT_PRESETS: WorkoutPreset[] = [
  {
    label: 'Walk',
    activity: 'Walking',
    durationMinutes: 30,
    intensity: 'light',
    icon: Footprints,
  },
  {
    label: 'Strength',
    activity: 'Strength training',
    durationMinutes: 45,
    intensity: 'moderate',
    icon: Dumbbell,
  },
  {
    label: 'Cycling',
    activity: 'Cycling',
    durationMinutes: 30,
    intensity: 'moderate',
    icon: Bike,
  },
  {
    label: 'Stretch',
    activity: 'Stretching',
    durationMinutes: 15,
    intensity: 'light',
    icon: Activity,
  },
];

const INTENSITY_OPTIONS: Array<{
  value: ActivityIntensity;
  label: string;
  description: string;
}> = [
  { value: 'light', label: 'Light', description: 'Easy pace' },
  { value: 'moderate', label: 'Moderate', description: 'Noticeable effort' },
  { value: 'vigorous', label: 'Hard', description: 'High effort' },
];

function normalizeIntensity(value?: ActivityIntensity) {
  return value === 'light' || value === 'moderate' || value === 'vigorous'
    ? value
    : undefined;
}

export default function WorkoutModal({
  isOpen,
  workout,
  defaultDate,
  onSave,
  onClose,
}: Props) {
  const [activity, setActivity] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [intensity, setIntensity] = useState<ActivityIntensity | undefined>();
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [date, setDate] = useState(
    defaultDate || formatLocalDateInput(new Date()),
  );
  const [notes, setNotes] = useState('');
  const [recordId, setRecordId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [photoAssetIds, setPhotoAssetIds] = useState<string[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ activity?: string; duration?: string; calories?: string; notes?: string }>({});
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [showUnsaved, setShowUnsaved] = useState(false);

  const currentSnapshot = JSON.stringify({
    activity,
    durationMinutes,
    intensity,
    caloriesBurned,
    date,
    notes,
    imageUrl,
    photoAssetIds,
  });

  const hasUnsaved =
    isOpen && initialSnapshot !== '' && currentSnapshot !== initialSnapshot;

  const requestClose = () => {
    if (hasUnsaved) {
      setShowUnsaved(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    const nextActivity = workout?.activity || '';
    const nextDuration =
      workout?.durationMinutes !== undefined &&
      workout?.durationMinutes !== null
        ? String(workout.durationMinutes)
        : '';
    const nextIntensity = normalizeIntensity(workout?.intensity);
    const nextCalories = workout?.caloriesBurned
      ? String(workout.caloriesBurned)
      : '';
    const nextDate = workout?.date
      ? formatLocalDateInput(new Date(workout.date))
      : defaultDate || formatLocalDateInput(new Date());
    const nextNotes = workout?.notes || '';
    const nextRecordId = workout?.id || createEntityId('activity');
    const nextImageUrl = workout?.imageUrl || '';
    const nextPhotoAssetIds = Array.isArray(workout?.photoAssetIds)
      ? workout.photoAssetIds
      : [];

    setRecordId(nextRecordId);
    setActivity(nextActivity);
    setDurationMinutes(nextDuration);
    setIntensity(nextIntensity);
    setCaloriesBurned(nextCalories);
    setDate(nextDate);
    setNotes(nextNotes);
    setImageUrl(nextImageUrl);
    setPhotoAssetIds(nextPhotoAssetIds);
    setSaveBusy(false);
    setShowDetails(Boolean(nextNotes));
    setError('');
    setFieldErrors({});
    setInitialSnapshot(
      JSON.stringify({
        activity: nextActivity,
        durationMinutes: nextDuration,
        intensity: nextIntensity,
        caloriesBurned: nextCalories,
        date: nextDate,
        notes: nextNotes,
        imageUrl: nextImageUrl,
        photoAssetIds: nextPhotoAssetIds,
      }),
    );
    setShowUnsaved(false);
  }, [defaultDate, isOpen, workout]);

  const applyPreset = (preset: WorkoutPreset) => {
    setActivity(preset.activity);
    setDurationMinutes(String(preset.durationMinutes));
    setIntensity(preset.intensity);
    setError('');
  };

  const save = async () => {
    if (saveBusy) return;
    const trimmedActivity = activity.trim();
    const parsedDuration = durationMinutes ? Number(durationMinutes) : undefined;
    const parsedCalories = caloriesBurned ? Number(caloriesBurned) : 0;

    const activityError = validateHealthText(activity, { label: 'Activity name', maxLength: 100, required: true });
    const notesError = validateHealthText(notes, { label: 'Notes', maxLength: 500, mode: 'multiline' });
    const durationError = validateHealthNumber(durationMinutes, { label: 'Duration', ...HEALTH_LIMITS.workoutDuration, allowBlank: true });
    const caloriesError = validateHealthNumber(caloriesBurned, { label: 'Calories burned', ...HEALTH_LIMITS.workoutCalories, allowBlank: true });
    const nextFieldErrors = { activity: activityError, notes: notesError, duration: durationError, calories: caloriesError };
    setFieldErrors(nextFieldErrors);
    if (activityError || notesError || durationError || caloriesError) {
      setError([activityError, notesError, durationError, caloriesError].filter((message): message is string => Boolean(message)).join(' '));
      return;
    }

    if (!date) {
      setError('Choose a workout date.');
      return;
    }

    setSaveBusy(true);
    setError('');
    try {
      await onSave({
        recordId,
        id: workout?.id,
        createdAt: workout?.createdAt,
        activity: trimmedActivity,
        durationMinutes:
          parsedDuration === undefined ? undefined : Math.round(parsedDuration),
        intensity,
        caloriesBurned: Math.round(parsedCalories),
        date,
        notes: notes.trim(),
        imageUrl: imageUrl || undefined,
        photoAssetIds: photoAssetIds.length ? photoAssetIds : undefined,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The workout could not be saved.');
    } finally {
      setSaveBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <CaizenFormDialog panelClassName={healthResponsive.dialog}
        eyebrow={workout ? 'Edit Movement' : 'Add Movement'}
        title="Log activity"
        onClose={onClose}
        onBeforeClose={() => {
          if (hasUnsaved) {
            setShowUnsaved(true);
            return false;
          }
          return true;
        }}
        footer={(
          <ModalFooter>
            <CancelButton onClick={requestClose} />
            <SaveButton onClick={() => void save()}>
              {saveBusy ? 'Saving…' : 'Save Movement'}
            </SaveButton>
          </ModalFooter>
        )}
      >
        <div className="grid gap-5">
          {!workout ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Activity type
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WORKOUT_PRESETS.map(preset => {
                  const Icon = preset.icon;
                  const selected = activity === preset.activity;

                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`rounded-2xl border p-3 text-left transition-colors ${
                        selected
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border/60 bg-background/50 hover:border-primary/25'
                      }`}
                    >
                      <Icon className="size-4" />
                      <span className="mt-3 block text-sm font-black">
                        {preset.label}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {preset.durationMinutes} min
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <FormField label="Movement or Workout" error={fieldErrors.activity}>
            <input
              value={activity}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const result = guardHealthTextChange(activity, event.target.value, { label: 'Activity name', maxLength: 100 });
                if (!result.accepted) return setFieldErrors(current => ({ ...current, activity: result.error }));
                setActivity(result.value);
                setFieldErrors(current => ({ ...current, activity: result.error }));
                setError('');
              }}
              className="control-input"
              placeholder="Walking, gym session, cycling..."
              autoFocus={!workout}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date">
              <AdaptiveDatePicker
                label="Movement date"
                value={date}
                onChange={setDate}
                className="control-input"
              />
            </FormField>

            <FormField label="Duration (Optional)" error={fieldErrors.duration}>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={durationMinutes}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const result = guardHealthNumberChange(durationMinutes, event.target.value, { label: 'Duration', ...HEALTH_LIMITS.workoutDuration, allowBlank: true, unit: 'minutes' });
                    if (!result.accepted) return setFieldErrors(current => ({ ...current, duration: result.error }));
                    setDurationMinutes(result.value);
                    setFieldErrors(current => ({ ...current, duration: result.error }));
                    setError('');
                  }}
                  onBlur={() => setFieldErrors(current => ({ ...current, duration: validateHealthNumber(durationMinutes, { label: 'Duration', ...HEALTH_LIMITS.workoutDuration, allowBlank: true, unit: 'minutes' }) }))}
                  className="control-input health-number-input pr-16"
                  placeholder="Enter minutes"
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-bold text-muted-foreground">
                  min
                </span>
              </div>
              </FormField>

            <FormField label="Calories Burned (Optional)" error={fieldErrors.calories}>
              <input
                type="text"
                inputMode="numeric"
                value={caloriesBurned}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const result = guardHealthNumberChange(caloriesBurned, event.target.value, { label: 'Calories burned', ...HEALTH_LIMITS.workoutCalories, allowBlank: true, unit: 'kcal' });
                  if (!result.accepted) return setFieldErrors(current => ({ ...current, calories: result.error }));
                  setCaloriesBurned(result.value);
                  setFieldErrors(current => ({ ...current, calories: result.error }));
                  setError('');
                }}
                onBlur={() => setFieldErrors(current => ({ ...current, calories: validateHealthNumber(caloriesBurned, { label: 'Calories burned', ...HEALTH_LIMITS.workoutCalories, allowBlank: true, unit: 'kcal' }) }))}
                className="control-input health-number-input"
                placeholder="Leave blank when unknown"
              />
            </FormField>
          </div>

          <FormField label="Intensity" hint="Optional">
            <div className="grid grid-cols-3 gap-2">
              {INTENSITY_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setIntensity(current =>
                      current === option.value ? undefined : option.value,
                    )
                  }
                  className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                    intensity === option.value
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/60 bg-background/50 hover:border-primary/25'
                  }`}
                >
                  <span className="block text-sm font-black">{option.label}</span>
                  <span className="mt-1 hidden text-xs text-muted-foreground sm:block">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </FormField>

          <button
            type="button"
            onClick={() => setShowDetails(current => !current)}
            className="flex min-h-11 items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 text-left text-sm font-black"
            aria-expanded={showDetails}
          >
            <span>Optional details</span>
            <span className="text-xs font-semibold text-muted-foreground">
              {showDetails ? 'Hide' : 'Show'}
            </span>
          </button>

          {showDetails ? (
            <div className="grid gap-4 rounded-2xl border border-border/50 bg-background/35 p-4">
              <FormField label="Notes" error={fieldErrors.notes}>
                <FormattedTextarea
                  value={notes}
                  onChange={value => {
                    const result = guardHealthTextChange(notes, value, { label: 'Notes', maxLength: 500, mode: 'multiline' });
                    if (!result.accepted) return setFieldErrors(current => ({ ...current, notes: result.error }));
                    setNotes(result.value);
                    setFieldErrors(current => ({ ...current, notes: result.error }));
                  }}
                  placeholder="Sets, reps, distance, energy, or anything worth remembering..."
                  minRows={4}
                />
              </FormField>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
              {error}
            </p>
          ) : null}

        </div>
      </CaizenFormDialog>

      <ConfirmDialog
        isOpen={showUnsaved}
        title="Discard movement changes?"
        message="You have unsaved movement inputs. Close without saving?"
        confirmText="Discard"
        cancelText="Keep Editing"
        isDangerous
        onCancel={() => setShowUnsaved(false)}
        onConfirm={() => {
          setShowUnsaved(false);
          onClose();
        }}
      />
    </>
  );
}
