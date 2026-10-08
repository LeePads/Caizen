'use client';

import healthResponsive from '@/components/health/health-responsive.module.css';

import { useEffect, useId, useState } from 'react';
import { Check } from 'lucide-react';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import SleepTimePicker from '@/components/ui/sleep-time-picker';
import { formatLocalDateInput, formatLocalDateTimeInput, parseLocalDateTimeInput } from '@/lib/date-utils';
import { isValidFastingTarget, MAX_FASTING_TARGET_MINUTES } from '@/lib/health/fasting';
import type { FastingSession } from '@/lib/types';

export type FastingSessionDraft = {
  id?: string;
  startedAt: Date;
  endedAt?: Date | null;
  targetMinutes?: number;
  notes?: string;
};

type Props = {
  isOpen: boolean;
  session?: FastingSession | null;
  mode: 'start' | 'edit' | 'stop' | 'past';
  initialTargetMinutes?: number;
  initialNotes?: string;
  onSave: (draft: FastingSessionDraft) => boolean | void;
  onClose: () => void;
};

const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border/70 px-3 py-2 text-xs font-black transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

const splitDateTime = (value: Date | string | number | null | undefined) => {
  const formatted = formatLocalDateTimeInput(value);
  const [date = '', time = ''] = formatted.split('T');
  return { date, time };
};

const presetValues = [
  { label: '12h', value: 720 },
  { label: '14h', value: 840 },
  { label: '16h', value: 960 },
  { label: '18h', value: 1080 },
];

export default function FastingSessionModal({ isOpen, session, mode, initialTargetMinutes, initialNotes, onSave, onClose }: Props) {
  const [startedDate, setStartedDate] = useState('');
  const [startedTime, setStartedTime] = useState('');
  const [endedDate, setEndedDate] = useState('');
  const [endedTime, setEndedTime] = useState('');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const descriptionId = useId();

  const showEnd = mode === 'stop' || mode === 'past' || Boolean(session?.endedAt);

  useEffect(() => {
    if (!isOpen) return;
    const start = splitDateTime(session?.startedAt || new Date());
    const end = splitDateTime(session?.endedAt || (showEnd ? new Date() : null));
    setStartedDate(start.date || formatLocalDateInput(new Date()));
    setStartedTime(start.time || '12:00');
    setEndedDate(end.date || formatLocalDateInput(new Date()));
    setEndedTime(end.time || '12:00');
    setTarget(session?.targetMinutes ? String(session.targetMinutes) : initialTargetMinutes ? String(initialTargetMinutes) : '');
    setNotes(session?.notes || initialNotes || '');
    setError('');
  }, [initialNotes, initialTargetMinutes, isOpen, session, showEnd]);

  if (!isOpen) return null;

  const save = () => {
    const startedAt = parseLocalDateTimeInput(`${startedDate}T${startedTime}`);
    const endedAt = showEnd ? parseLocalDateTimeInput(`${endedDate}T${endedTime}`) : null;
    if (Number.isNaN(startedAt.getTime())) {
      setError('Choose a valid start date and time.');
      return;
    }
    if (showEnd && Number.isNaN(endedAt?.getTime())) {
      setError('Choose a valid end date and time.');
      return;
    }
    if (showEnd && endedAt && endedAt < startedAt) {
      setError('The end must not be earlier than the start.');
      return;
    }
    const targetMinutes = target.trim() ? Number(target) : undefined;
    if (targetMinutes !== undefined && !isValidFastingTarget(targetMinutes)) {
      setError(`Target must be a positive whole number up to ${MAX_FASTING_TARGET_MINUTES} minutes.`);
      return;
    }
    const saved = onSave({
      id: session?.id,
      startedAt,
      endedAt,
      targetMinutes,
      notes: notes.trim() || undefined,
    });
    if (saved === false) setError('Another active fast already exists. Edit or stop it before starting a new one.');
  };

  const title = mode === 'start'
    ? 'Start fast'
    : mode === 'stop'
      ? 'Stop fast'
      : mode === 'past'
        ? 'Add past fast'
        : 'Edit fast';

  return (
    <CaizenFormDialog panelClassName={healthResponsive.dialog} title={title} eyebrow="Fasting" onClose={onClose} descriptionId={descriptionId} maxWidthClass="max-w-xl" footer={(
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={buttonClass} onClick={onClose}>Cancel</button>
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" onClick={save}><Check className="h-4 w-4" />Save</button>
      </div>
    )}>
      <div className="grid gap-5">
        <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
          Track the timestamps you choose. A target is optional and does not stop the fast automatically.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="field-label">Start date</span>
            <AdaptiveDatePicker label="Start date" value={startedDate} onChange={value => setStartedDate(value || '')} className="control-input h-11" clearable={false} />
          </label>
          <label className="grid gap-2">
            <span className="field-label">Start time</span>
            <SleepTimePicker label="Start time" value={startedTime} onChange={setStartedTime} className="h-11" />
          </label>
        </div>

        {showEnd && (
          <div className="grid gap-4 rounded-2xl border border-border/60 bg-background/40 p-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="field-label">End date</span>
              <AdaptiveDatePicker label="End date" value={endedDate} onChange={value => setEndedDate(value || '')} className="control-input h-11" clearable={false} />
            </label>
            <label className="grid gap-2">
              <span className="field-label">End time</span>
              <SleepTimePicker label="End time" value={endedTime} onChange={setEndedTime} className="h-11" />
            </label>
          </div>
        )}

        <div className="grid gap-3">
          <div>
            <span className="field-label">Target duration <span className="font-normal normal-case tracking-normal">(optional)</span></span>
            <div className="mt-2 flex flex-wrap gap-2">
              {presetValues.map(preset => (
                <button key={preset.value} type="button" className={`${buttonClass} ${target === String(preset.value) ? 'border-primary/50 bg-primary/10 text-primary' : ''}`} onClick={() => setTarget(current => current === String(preset.value) ? '' : String(preset.value))} aria-pressed={target === String(preset.value)}>{preset.label}</button>
              ))}
            </div>
          </div>
          <input className="control-input h-11" type="number" min="1" max={MAX_FASTING_TARGET_MINUTES} step="1" value={target} onChange={event => setTarget(event.target.value)} placeholder="Custom minutes, up to 2,880" aria-label="Custom target duration in minutes" />
        </div>

        <label className="grid gap-2">
          <span className="field-label">Notes <span className="font-normal normal-case tracking-normal">(optional)</span></span>
          <textarea className="control-input min-h-24 resize-y" maxLength={500} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional note" />
        </label>

        {error && <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive" role="alert">{error}</p>}

      </div>
    </CaizenFormDialog>
  );
}
