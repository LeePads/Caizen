'use client';

import healthResponsive from '@/components/health/health-responsive.module.css';

import { useEffect, useMemo, useState } from 'react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import FormattedTextarea from '@/components/common/FormattedTextarea';
import {
  CancelButton,
  FormField,
  ModalFooter,
  SaveButton,
} from '@/components/common/FormPatterns';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import SleepTimePicker from '@/components/ui/sleep-time-picker';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import type { MorningMood, SleepEntry, SleepQuality } from '@/lib/types';
import {
  calculateSleepDurationMinutes,
  formatSleepDuration,
  getSleepDurationMinutes,
  MAX_SLEEP_SCORE,
  MAX_SLEEP_DURATION_MINUTES,
  MAX_TIMES_AWAKENED,
  MORNING_MOOD_OPTIONS,
  parseSleepDurationParts,
} from '@/lib/health/sleep';
import { formatLocalDateInput } from '@/lib/date-utils';
import { guardHealthNumberChange, guardHealthTextChange, HEALTH_LIMITS, validateHealthNumber, validateHealthText } from '@/lib/health/validation';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export type SleepDraft = {
  id?: string;
  createdAt?: Date;
  date: string;
  sleepDurationMinutes: number;
  quality: SleepQuality;
  bedTime?: string;
  wakeTime?: string;
  sleepScore?: number;
  timesAwakened?: number;
  morningMood?: MorningMood;
  notes?: string;
};

type SleepEntryInput = Omit<Partial<SleepEntry>, 'date' | 'quality'> & {
  date?: Date | string;
  quality?: SleepQuality | 'okay';
};

type Props = {
  isOpen: boolean;
  sleepEntry?: SleepEntryInput | null;
  defaultDate?: string;
  onSave: (draft: SleepDraft) => void;
  onClose: () => void;
};

const QUALITY_OPTIONS: Array<{
  value: SleepQuality;
  label: string;
  description: string;
}> = [
  { value: 'poor', label: 'Poor', description: 'Restless or very interrupted' },
  { value: 'fair', label: 'Fair', description: 'Some interruptions or low energy' },
  { value: 'good', label: 'Good', description: 'Mostly rested' },
  { value: 'great', label: 'Great', description: 'Deep and refreshing' },
];

function normalizeQuality(value?: SleepQuality | 'okay'): SleepQuality {
  if (value === 'okay') return 'fair';
  if (value === 'poor' || value === 'fair' || value === 'good' || value === 'great') {
    return value;
  }
  return 'good';
}

function splitDurationMinutes(value: number) {
  return {
    hours: String(Math.floor(value / 60)),
    minutes: String(value % 60).padStart(2, '0'),
  };
}

export default function SleepModal({
  isOpen,
  sleepEntry,
  defaultDate,
  onSave,
  onClose,
}: Props) {
  const [date, setDate] = useState(defaultDate || formatLocalDateInput(new Date()));
  const [durationMinutes, setDurationMinutes] = useState('');
  const [quality, setQuality] = useState<SleepQuality>('good');
  const [bedTime, setBedTime] = useState('');
  const [wakeTime, setWakeTime] = useState('');
  const [sleepScore, setSleepScore] = useState('');
  const [timesAwakened, setTimesAwakened] = useState('');
  const [morningMood, setMorningMood] = useState<MorningMood | ''>('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationEditHours, setDurationEditHours] = useState('0');
  const [durationEditMinutes, setDurationEditMinutes] = useState('00');
  const [durationEditError, setDurationEditError] = useState('');
  const [durationManuallyEdited, setDurationManuallyEdited] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ score?: string; awakened?: string; notes?: string }>({});
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [showUnsaved, setShowUnsaved] = useState(false);

  const calculatedDurationMinutes = useMemo(
    () => calculateSleepDurationMinutes(bedTime, wakeTime),
    [bedTime, wakeTime],
  );

  const currentSnapshot = JSON.stringify({
    date,
    durationMinutes,
    quality,
    bedTime,
    wakeTime,
    sleepScore,
    timesAwakened,
    morningMood,
    notes,
  });

  const hasUnsaved =
    isOpen && initialSnapshot !== '' && currentSnapshot !== initialSnapshot;

  const canClose = () => {
    if (hasUnsaved) {
      setShowUnsaved(true);
      return false;
    }
    return true;
  };

  const requestClose = () => {
    if (canClose()) onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    const nextDate = sleepEntry?.date
      ? formatLocalDateInput(new Date(sleepEntry.date))
      : defaultDate || formatLocalDateInput(new Date());
    const nextDuration = getSleepDurationMinutes(sleepEntry || {});
    const nextDurationMinutes = nextDuration > 0 ? String(nextDuration) : '';
    const nextQuality = normalizeQuality(sleepEntry?.quality);
    const nextBedTime = sleepEntry?.bedTime || '';
    const nextWakeTime = sleepEntry?.wakeTime || '';
    const nextSleepScore =
      sleepEntry?.sleepScore !== undefined && sleepEntry.sleepScore !== null
        ? String(sleepEntry.sleepScore)
        : '';
    const nextTimesAwakened =
      sleepEntry?.timesAwakened !== undefined && sleepEntry.timesAwakened !== null
        ? String(sleepEntry.timesAwakened)
        : '';
    const nextMorningMood = sleepEntry?.morningMood || '';
    const nextNotes = sleepEntry?.notes || '';
    const nextCalculated = calculateSleepDurationMinutes(nextBedTime, nextWakeTime);

    setDate(nextDate);
    setDurationMinutes(nextDurationMinutes);
    setQuality(nextQuality);
    setBedTime(nextBedTime);
    setWakeTime(nextWakeTime);
    setSleepScore(nextSleepScore);
    setTimesAwakened(nextTimesAwakened);
    setMorningMood(nextMorningMood);
    setNotes(nextNotes);
    setShowNotes(Boolean(nextNotes));
    setEditingDuration(false);
    setDurationEditError('');
    setDurationManuallyEdited(
      nextDuration > 0 &&
        (nextCalculated === null || nextCalculated !== nextDuration),
    );
    setError('');
    setFieldErrors({});
    setInitialSnapshot(
      JSON.stringify({
        date: nextDate,
        durationMinutes: nextDurationMinutes,
        quality: nextQuality,
        bedTime: nextBedTime,
        wakeTime: nextWakeTime,
        sleepScore: nextSleepScore,
        timesAwakened: nextTimesAwakened,
        morningMood: nextMorningMood,
        notes: nextNotes,
      }),
    );
    setShowUnsaved(false);
  }, [defaultDate, isOpen, sleepEntry]);

  const updateBedTime = (value: string) => {
    setBedTime(value);
    const nextCalculated = calculateSleepDurationMinutes(value, wakeTime);
    if (!durationManuallyEdited) {
      setDurationMinutes(nextCalculated === null ? '' : String(nextCalculated));
    }
    setError('');
  };

  const updateWakeTime = (value: string) => {
    setWakeTime(value);
    const nextCalculated = calculateSleepDurationMinutes(bedTime, value);
    if (!durationManuallyEdited) {
      setDurationMinutes(nextCalculated === null ? '' : String(nextCalculated));
    }
    setError('');
  };

  const beginDurationEdit = () => {
    const current = Number(durationMinutes);
    const parts = Number.isInteger(current) && current > 0
      ? splitDurationMinutes(current)
      : { hours: '0', minutes: '00' };
    setDurationEditHours(parts.hours);
    setDurationEditMinutes(parts.minutes);
    setDurationEditError('');
    setEditingDuration(true);
  };

  const applyDurationEdit = () => {
    const total = parseSleepDurationParts(durationEditHours, durationEditMinutes);
    if (total === null) {
      setDurationEditError('Enter a duration from 1 minute to 24 hours.');
      return;
    }

    setDurationMinutes(String(total));
    setDurationManuallyEdited(true);
    setDurationEditError('');
    setEditingDuration(false);
    setError('');
  };

  const updateSleepScore = (value: string) => {
    const result = guardHealthNumberChange(sleepScore, value, {
      label: 'Sleep Score', ...HEALTH_LIMITS.sleepScore, allowBlank: true,
    });
    if (!result.accepted) {
      setFieldErrors(current => ({ ...current, score: result.error }));
      return;
    }
    setSleepScore(result.value);
    setFieldErrors(current => ({ ...current, score: result.error }));
  };

  const updateTimesAwakened = (value: string) => {
    const result = guardHealthNumberChange(timesAwakened, value, {
      label: 'Times awakened', ...HEALTH_LIMITS.awakenings, allowBlank: true,
    });
    if (!result.accepted) {
      setFieldErrors(current => ({ ...current, awakened: result.error }));
      return;
    }
    setTimesAwakened(result.value);
    setFieldErrors(current => ({ ...current, awakened: result.error }));
  };

  const updateNotes = (value: string) => {
    const result = guardHealthTextChange(notes, value, { label: 'Notes', maxLength: 1000, mode: 'multiline' });
    if (!result.accepted) {
      setFieldErrors(current => ({ ...current, notes: result.error }));
      return;
    }
    setNotes(result.value);
    setFieldErrors(current => ({ ...current, notes: result.error }));
  };

  const updateDurationEditHours = (value: string) => {
    const result = guardHealthNumberChange(durationEditHours, value, { label: 'Duration hours', min: 0, max: 24, integer: true, allowBlank: true, unit: 'hours' });
    if (!result.accepted) {
      setDurationEditError(result.error || 'Enter whole hours from 0 to 24.');
      return;
    }
    setDurationEditHours(result.value);
    setDurationEditError(result.error || '');
  };

  const updateDurationEditMinutes = (value: string) => {
    const result = guardHealthNumberChange(durationEditMinutes, value, { label: 'Duration minutes', min: 0, max: 59, integer: true, allowBlank: true, unit: 'minutes' });
    if (!result.accepted) {
      setDurationEditError(result.error || 'Enter whole minutes from 0 to 59.');
      return;
    }
    setDurationEditMinutes(result.value);
    setDurationEditError(result.error || '');
  };

  const save = () => {
    const effectiveDuration = durationMinutes
      ? Number(durationMinutes)
      : calculatedDurationMinutes;
    const parsedSleepScore = sleepScore === '' ? undefined : Number(sleepScore);
    const parsedTimesAwakened = timesAwakened === '' ? undefined : Number(timesAwakened);
    const notesError = validateHealthText(notes, { label: 'Notes', maxLength: 1000, mode: 'multiline' });

    const dateError = !date ? 'Choose a sleep date.' : undefined;
    const durationError = (
      effectiveDuration === null ||
      !Number.isInteger(effectiveDuration) ||
      effectiveDuration <= 0 ||
      effectiveDuration > MAX_SLEEP_DURATION_MINUTES
    ) ? 'Enter total sleep, or choose both sleep and wake times.' : undefined;

    const scoreError = validateHealthNumber(sleepScore, { label: 'Sleep Score', ...HEALTH_LIMITS.sleepScore, allowBlank: true }) || (
      sleepScore !== '' && (parsedSleepScore === undefined || !Number.isInteger(parsedSleepScore) || parsedSleepScore < 0 || parsedSleepScore > MAX_SLEEP_SCORE)
        ? 'Sleep Score must be an integer from 0 to 100.'
        : undefined
    );
    const awakenedError = validateHealthNumber(timesAwakened, { label: 'Times awakened', ...HEALTH_LIMITS.awakenings, allowBlank: true }) || (
      timesAwakened !== '' && (parsedTimesAwakened === undefined || !Number.isInteger(parsedTimesAwakened) || parsedTimesAwakened < 0 || parsedTimesAwakened > MAX_TIMES_AWAKENED)
        ? 'Times awakened must be an integer from 0 to 99.'
        : undefined
    );
    const nextFieldErrors = { score: scoreError, awakened: awakenedError, notes: notesError };
    setFieldErrors(nextFieldErrors);
    if (dateError || durationError || scoreError || awakenedError || notesError) {
      setError(dateError || durationError || 'Check the highlighted fields.');
      return;
    }

    onSave({
      id: sleepEntry?.id,
      createdAt: sleepEntry?.createdAt,
      date,
      sleepDurationMinutes: effectiveDuration ?? 0,
      quality,
      bedTime: bedTime || undefined,
      wakeTime: wakeTime || undefined,
      sleepScore: parsedSleepScore,
      timesAwakened: parsedTimesAwakened,
      morningMood: morningMood || undefined,
      notes: notes.trim() || undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <CaizenFormDialog panelClassName={healthResponsive.dialog}
        eyebrow={sleepEntry ? 'Edit Sleep' : 'Add Sleep'}
        title="Sleep Log"
        onClose={onClose}
        onBeforeClose={canClose}
        footer={(
          <ModalFooter>
            <CancelButton onClick={requestClose} />
            <SaveButton onClick={save}>Save Sleep</SaveButton>
          </ModalFooter>
        )}
      >
        <div className="grid gap-5">
          <FormField label="Date">
            <AdaptiveDatePicker
              label="Sleep date"
              value={date}
              onChange={setDate}
              className="control-input"
              clearable={false}
            />
          </FormField>

          <section className="grid gap-3" aria-labelledby="sleep-time-heading">
            <div>
              <p
                id="sleep-time-heading"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Sleep time
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter sleep and wake times, or adjust total sleep manually.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Bedtime">
                <SleepTimePicker
                  label="Bedtime"
                  value={bedTime}
                  onChange={updateBedTime}
                  className="control-input"
                />
              </FormField>
              <FormField label="Wake time">
                <SleepTimePicker
                  label="Wake time"
                  value={wakeTime}
                  onChange={updateWakeTime}
                  className="control-input"
                />
              </FormField>
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total sleep
                </p>
                <p className="mt-1 text-2xl font-black tracking-tight">
                  {durationMinutes
                    ? formatSleepDuration(Number(durationMinutes))
                    : 'Not set'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {calculatedDurationMinutes !== null && !durationManuallyEdited
                    ? 'Calculated from your sleep times'
                    : 'Use Edit to enter actual time asleep'}
                </p>
              </div>
              <button
                type="button"
                onClick={beginDurationEdit}
                className="min-h-10 shrink-0 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-black text-primary"
              >
                {durationMinutes ? 'Edit' : 'Add duration'}
              </button>
            </div>

            {editingDuration ? (
              <div className="mt-4 grid gap-3 border-t border-border/50 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs font-bold text-muted-foreground">
                    Hours
                    <input
                      type="text"
                      inputMode="numeric"
                      value={durationEditHours}
                      onChange={event => updateDurationEditHours(event.target.value)}
                      onBlur={() => setDurationEditError(validateHealthNumber(durationEditHours, { label: 'Duration hours', min: 0, max: 24, integer: true, allowBlank: true, unit: 'hours' }) || '')}
                      placeholder="Hours"
                      className="control-input health-number-input"
                      aria-label="Sleep duration hours"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-muted-foreground">
                    Minutes
                    <input
                      type="text"
                      inputMode="numeric"
                      value={durationEditMinutes}
                      onChange={event => updateDurationEditMinutes(event.target.value)}
                      onBlur={() => setDurationEditError(validateHealthNumber(durationEditMinutes, { label: 'Duration minutes', min: 0, max: 59, integer: true, allowBlank: true, unit: 'minutes' }) || '')}
                      placeholder="Minutes"
                      className="control-input health-number-input"
                      aria-label="Sleep duration minutes"
                    />
                  </label>
                </div>
                <div className="min-h-[20px] pt-0.5">
                  {durationEditError ? <p role="alert" className="text-xs font-bold text-destructive">{durationEditError}</p> : null}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDuration(false);
                      setDurationEditError('');
                    }}
                    className="min-h-10 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyDurationEdit}
                    className="min-h-10 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground"
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <FormField label="How Rested Did You Feel?">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {QUALITY_OPTIONS.map(option => (
                <Tooltip key={option.value}><TooltipTrigger asChild><button
                  type="button"
                  onClick={() => setQuality(option.value)}
                  className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                    quality === option.value
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/60 bg-background/50 hover:border-primary/25'
                  }`}
                >
                  <span className="block text-sm font-black">{option.label}</span>
                  <span className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                    {option.description}
                  </span>
                </button></TooltipTrigger><TooltipContent>{option.description}</TooltipContent></Tooltip>
              ))}
            </div>
          </FormField>

          <FormField label="How did you feel after waking?" hint="Optional">
            <div className="grid grid-cols-4 gap-2">
              {MORNING_MOOD_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMorningMood(current => (current === option.value ? '' : option.value))}
                  className={`rounded-xl border px-2 py-2.5 text-center text-sm font-bold transition-colors ${
                    morningMood === option.value
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/60 bg-background/50 hover:border-primary/25'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Personal sleep score" hint="Your own number, e.g. from an app you use" error={fieldErrors.score}>
              <input
                type="text"
                inputMode="numeric"
                value={sleepScore}
                onChange={event => updateSleepScore(event.target.value)}
                onBlur={() => setFieldErrors(current => ({ ...current, score: validateHealthNumber(sleepScore, { label: 'Sleep Score', ...HEALTH_LIMITS.sleepScore, allowBlank: true }) }))}
                className="control-input health-number-input"
                placeholder="Optional"
              />
            </FormField>
            <FormField label="Times awakened" error={fieldErrors.awakened}>
              <input
                type="text"
                inputMode="numeric"
                value={timesAwakened}
                onChange={event => updateTimesAwakened(event.target.value)}
                onBlur={() => setFieldErrors(current => ({ ...current, awakened: validateHealthNumber(timesAwakened, { label: 'Times awakened', ...HEALTH_LIMITS.awakenings, allowBlank: true }) }))}
                className="control-input health-number-input"
                placeholder="Optional"
              />
            </FormField>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowNotes(current => !current)}
              className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 text-left text-sm font-black"
              aria-expanded={showNotes}
            >
              <span>
                Notes{' '}
                <span className="font-semibold text-muted-foreground">Optional</span>
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                {showNotes ? 'Hide' : 'Show'}
              </span>
            </button>

            {showNotes ? (
              <div className="mt-3 rounded-2xl border border-border/50 bg-background/35 p-4">
                <FormattedTextarea
                  value={notes}
                  onChange={updateNotes}
                  placeholder="Interruptions, dreams, energy after waking..."
                  minRows={4}
                 />
                <div className="min-h-[20px] pt-0.5">
                  {fieldErrors.notes ? <p role="alert" className="text-xs font-semibold text-destructive">{fieldErrors.notes}</p> : null}
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
              {error}
            </p>
          ) : null}

        </div>
      </CaizenFormDialog>

      <ConfirmDialog
        isOpen={showUnsaved}
        title="Discard sleep changes?"
        message="You have unsaved sleep inputs. Close without saving?"
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
