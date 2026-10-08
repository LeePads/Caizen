'use client';

import healthResponsive from '@/components/health/health-responsive.module.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Scale, X } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { useAppContext } from '@/lib/context';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { AndroidAdaptiveSelect, AndroidDismissibleBackdrop, CaizenBottomSheet } from '@/components/native/android-design';
import { formatLocalDateInput, parseLocalDateInput } from '@/lib/date-utils';
import { guardHealthNumberChange, guardHealthTextChange, validateHealthNumber, validateHealthText } from '@/lib/health/validation';
import {
  canonicalWeightFromDraft,
  formatMeasurementNumber,
  getWeightBounds,
  kgToWeight,
  readHealthMeasurementPreferences,
  roundMeasurement,
  weightToKg,
  writeHealthMeasurementPreferences,
  type WeightUnit,
} from '@/lib/health/measurements';
import type { WeightEntry } from '@/lib/types';

const inputClass =
  'h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-sm outline-none transition-colors focus:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0';

function entryDateKey(value?: Date | string | null) {
  const parsed = typeof value === 'string'
    ? parseLocalDateInput(value)
    : value ? new Date(value) : new Date();
  return formatLocalDateInput(parsed) || formatLocalDateInput(new Date());
}

export default function WeightModal({
  isOpen,
  weightEntry,
  onClose,
  androidPresentation = false,
}: {
  isOpen: boolean;
  weightEntry?: WeightEntry | null;
  onClose: () => void;
  androidPresentation?: boolean;
}) {
  const { addWeightEntry, updateWeightEntry, health, currentProfileId } = useAppContext();
  const isEditMode = Boolean(weightEntry);

  const initial = useMemo(
    () => ({
      date: entryDateKey(weightEntry?.date),
      notes: weightEntry?.notes || '',
    }),
    [weightEntry],
  );

  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [weightKg, setWeightKg] = useState('');
  const [date, setDate] = useState(initial.date);
  const [notes, setNotes] = useState(initial.notes);
  const [initialDraft, setInitialDraft] = useState({ weight: '', date: initial.date, notes: initial.notes });
  const [initialCanonicalWeight, setInitialCanonicalWeight] = useState<number | undefined>(weightEntry?.weightKg);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ weight?: string; notes?: string }>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const preferences = currentProfileId
      ? readHealthMeasurementPreferences(currentProfileId)
      : { weightUnit: 'kg' as const, heightUnit: 'cm' as const };
    const nextWeight = weightEntry?.weightKg == null
      ? ''
      : String(roundMeasurement(kgToWeight(weightEntry.weightKg, preferences.weightUnit), 2));
    setWeightUnit(preferences.weightUnit);
    setWeightKg(nextWeight);
    setDate(initial.date);
    setNotes(initial.notes);
    setInitialDraft({ weight: nextWeight, date: initial.date, notes: initial.notes });
    setInitialCanonicalWeight(weightEntry?.weightKg);
    setError('');
    setFieldErrors({});
    setConfirmDiscard(false);
  }, [currentProfileId, initial, isOpen, weightEntry]);

  const hasChanges =
    weightKg !== initialDraft.weight ||
    date !== initialDraft.date ||
    notes !== initialDraft.notes;

  const attemptClose = () => {
    if (hasChanges) {
      setConfirmDiscard(true);
      return;
    }
    closeSurface();
  };

  const modalPanelRef = useRef<HTMLFormElement>(null);
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen: isOpen && !androidPresentation, onClose });
  const closeSurface = () => androidPresentation ? onClose() : close();
  useOverlayLifecycle(isOpen && !androidPresentation, attemptClose, { lockScroll: false, autoFocus: false, containerRef: modalPanelRef });

  useEffect(() => {
    if (!isOpen || androidPresentation) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || confirmDiscard) return;
      event.preventDefault();
      attemptClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [androidPresentation, isOpen, hasChanges, confirmDiscard]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const bounds = getWeightBounds(weightUnit);

    const weightError = validateHealthNumber(weightKg, {
      label: 'Weight',
      min: bounds.min,
      max: bounds.max,
      precision: 2,
      unit: weightUnit,
    });
    const notesError = validateHealthText(notes, { label: 'Notes', maxLength: 300, mode: 'multiline' });
    setFieldErrors({ weight: weightError, notes: notesError });
    if (weightError || notesError) {
      setError(weightError || notesError || 'Check the highlighted fields.');
      return;
    }

    const parsedWeight = canonicalWeightFromDraft(Number(weightKg), weightUnit);
    const canonicalWeight = initialCanonicalWeight !== undefined && Math.abs(parsedWeight - initialCanonicalWeight) < 0.005
      ? initialCanonicalWeight
      : parsedWeight;
    const payload = {
      weightKg: canonicalWeight,
      date: parseLocalDateInput(date || formatLocalDateInput(new Date())),
      notes: notes.trim() || undefined,
    };

    if (weightEntry) {
      updateWeightEntry(weightEntry.id, payload);
    } else {
      addWeightEntry(payload);
      if ((health?.weightEntries?.length || 0) === 0) {
        toast({
          title: 'Your first health record is saved',
          description: 'A starting point for useful trends over time.',
        });
      }
    }

    closeSurface();
  };

  const target = health?.targetWeightKg;
  const preview = Number(weightKg);
  const previewKg = Number.isFinite(preview) ? weightToKg(preview, weightUnit) : Number.NaN;
  const difference = Number.isFinite(previewKg) && target
    ? roundMeasurement(kgToWeight(previewKg - target, weightUnit), 2)
    : null;

  const bounds = getWeightBounds(weightUnit);
  const validateWeightField = (value: string) => validateHealthNumber(value, {
    label: 'Weight',
    min: bounds.min,
    max: bounds.max,
    precision: 2,
    unit: weightUnit,
  });

  if (!isOpen || typeof document === 'undefined') return null;

  const weightForm = (
    <form
      ref={modalPanelRef}
      tabIndex={-1}
      noValidate
      onSubmit={submit}
      aria-labelledby="weight-modal-title"
      data-caizen-overlay-panel="true"
      className={`${healthResponsive.dialog} ${androidPresentation ? 'android-weight-sheet-form flex min-h-0 flex-1 flex-col' : 'android-weight-modal-panel flex min-h-0 max-h-[calc(var(--cz-vh,100dvh)_-_1.5rem)] flex-col sm:max-h-[calc(var(--cz-vh,100dvh)_-_3rem)]'} relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl`}
    >
      <header className="android-weight-modal-header flex items-start justify-between gap-4 border-b border-border/50 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Scale className="h-5 w-5" />
          </span>
          <div>
            <h2 id="weight-modal-title" className="text-xl font-black">{isEditMode ? 'Edit weight' : 'Add weight'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use a consistent time and condition for more useful trends.</p>
          </div>
        </div>
        <button type="button" onClick={attemptClose} aria-label="Close weight form" className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className={`android-weight-modal-body min-h-0 ${androidPresentation ? 'space-y-3 p-3' : 'flex-1 space-y-4 overflow-y-auto overscroll-contain p-4'}`}>
        <div className="space-y-2">
          <label htmlFor="weight-value" className="block text-sm font-bold">Weight</label>
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
            <input
              id="weight-value"
              autoFocus
              type="text"
              inputMode="decimal"
              value={weightKg}
              onChange={event => {
                const result = guardHealthNumberChange(weightKg, event.target.value, {
                  label: 'Weight', min: bounds.min, max: bounds.max, precision: 2, unit: weightUnit,
                });
                if (!result.accepted) {
                  setFieldErrors(current => ({ ...current, weight: result.error }));
                  return;
                }
                setWeightKg(result.value);
                setFieldErrors(current => ({ ...current, weight: result.error }));
                setError('');
              }}
              onBlur={() => setFieldErrors(current => ({ ...current, weight: validateWeightField(weightKg) }))}
              placeholder="Enter weight"
              aria-invalid={Boolean(fieldErrors.weight)}
              aria-describedby="weight-error"
              className={`${inputClass} health-number-input ${fieldErrors.weight ? 'border-destructive' : ''}`}
            />
            <AndroidAdaptiveSelect
              label="Weight unit"
              value={weightUnit}
              onChange={value => {
                const nextUnit = value as WeightUnit;
                const current = Number(weightKg);
                if (weightKg.trim() && Number.isFinite(current)) {
                  const canonical = weightToKg(current, weightUnit);
                  if (canonical >= 20 && canonical <= 400) setWeightKg(String(roundMeasurement(kgToWeight(canonical, nextUnit), 2)));
                }
                setWeightUnit(nextUnit);
                if (currentProfileId) writeHealthMeasurementPreferences(currentProfileId, { weightUnit: nextUnit, heightUnit: readHealthMeasurementPreferences(currentProfileId).heightUnit });
                setFieldErrors(currentErrors => ({ ...currentErrors, weight: undefined }));
              }}
              options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
              className={inputClass + ' px-2 text-xs font-bold'}
            />
          </div>
          {fieldErrors.weight ? <span id="weight-error" role="alert" className="block text-xs font-semibold text-destructive">{fieldErrors.weight}</span> : null}
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-bold">Date</span>
          <AdaptiveDatePicker label="Date" value={date} onChange={setDate} className={inputClass} />
        </label>

        <label className="block space-y-2">
          <span className="flex items-center justify-between gap-3"><span className="text-sm font-bold">Notes</span><span className="text-xs text-muted-foreground">Optional</span></span>
          <textarea
            value={notes}
            onChange={event => {
              const result = guardHealthTextChange(notes, event.target.value, { label: 'Notes', maxLength: 300, mode: 'multiline' });
              if (!result.accepted) {
                setFieldErrors(current => ({ ...current, notes: result.error }));
                return;
              }
              setNotes(result.value);
              setFieldErrors(current => ({ ...current, notes: result.error }));
            }}
            aria-invalid={Boolean(fieldErrors.notes)}
            aria-describedby="weight-notes-error"
            className="android-weight-notes min-h-20 w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-3 text-sm outline-none transition-colors focus:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0"
            placeholder="Morning measurement, after waking…"
          />
          {fieldErrors.notes ? <span id="weight-notes-error" role="alert" className="block text-xs font-semibold text-destructive">{fieldErrors.notes}</span> : null}
        </label>

        {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}

        {!androidPresentation && Number.isFinite(preview) && preview > 0 ? (
          <div className="rounded-xl border border-border/50 bg-background/50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Preview</p>
            <p className="mt-2 text-3xl font-black">{formatMeasurementNumber(preview, 2)} {weightUnit}</p>
            {difference !== null ? <p className="mt-1 text-sm text-muted-foreground">{Math.abs(difference) < 0.05 ? 'At your current target' : `${formatMeasurementNumber(Math.abs(difference), 2)} ${weightUnit} ${difference > 0 ? 'above' : 'below'} your target`}</p> : <p className="mt-1 text-sm text-muted-foreground">Set a target to see directional progress.</p>}
          </div>
        ) : null}
      </div>

      <footer className="android-weight-modal-footer flex shrink-0 flex-col-reverse gap-2 border-t border-border/50 p-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={attemptClose}>Cancel</Button>
        <Button type="submit">{isEditMode ? 'Save changes' : 'Add weight'}</Button>
      </footer>
    </form>
  );

  return createPortal(
    <>
      {androidPresentation ? (
        <CaizenBottomSheet
          open={isOpen}
          title={isEditMode ? 'Edit weight' : 'Add weight'}
          description="Use a consistent time and condition for more useful trends."
          onClose={attemptClose}
          initialFocusSelector=".health-number-input"
        >
          <div className="flex h-full min-h-0 flex-col">{weightForm}</div>
        </CaizenBottomSheet>
      ) : (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-3 sm:p-6" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
          <AndroidDismissibleBackdrop onClose={attemptClose} ariaLabel="Close weight form" className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
          {weightForm}
        </div>
      )}

      {/*
            <header className="android-weight-modal-header flex items-start justify-between gap-4 border-b border-border/50 p-5">
            <header className="android-weight-modal-header flex items-start justify-between gap-4 border-b border-border/50 p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Scale className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-black">{isEditMode ? 'Edit weight' : 'Add weight'}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Use a consistent time and condition for more useful trends.</p>
                </div>
              </div>
              <button type="button" onClick={attemptClose} aria-label="Close weight form" className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className={`android-weight-modal-body ${androidPresentation ? 'space-y-3 p-3' : 'space-y-5 p-5'}`}>
              <label className="block space-y-2">
                <span className="text-sm font-bold">Weight</span>
                <div className="relative">
                  <input
                    autoFocus
                    type="text"
                    inputMode="decimal"
                    value={weightKg}
                    onChange={event => {
                      const result = guardHealthNumberChange(weightKg, event.target.value, {
                        label: 'Weight',
                        min: bounds.min,
                        max: bounds.max,
                        precision: 2,
                        unit: weightUnit,
                      });
                      if (!result.accepted) {
                        setFieldErrors(current => ({ ...current, weight: result.error }));
                        return;
                      }
                      setWeightKg(result.value);
                      setFieldErrors(current => ({ ...current, weight: result.error }));
                      setError('');
                    }}
                    onBlur={() => setFieldErrors(current => ({ ...current, weight: validateWeightField(weightKg) }))}
                    placeholder="Enter weight"
                    aria-invalid={Boolean(fieldErrors.weight)}
                    aria-describedby="weight-error"
                    className={`${inputClass} health-number-input pr-20 ${fieldErrors.weight ? 'border-destructive' : ''}`}
                  />
                  <select
                    value={weightUnit}
                    onChange={event => {
                      const nextUnit = event.target.value as WeightUnit;
                      const current = Number(weightKg);
                      if (weightKg.trim() && Number.isFinite(current)) {
                        const canonical = weightToKg(current, weightUnit);
                        if (canonical >= 20 && canonical <= 400) {
                          setWeightKg(String(roundMeasurement(kgToWeight(canonical, nextUnit), 2)));
                        }
                      }
                      setWeightUnit(nextUnit);
                      if (currentProfileId) {
                        writeHealthMeasurementPreferences(currentProfileId, {
                          weightUnit: nextUnit,
                          heightUnit: readHealthMeasurementPreferences(currentProfileId).heightUnit,
                        });
                      }
                      setFieldErrors(currentErrors => ({ ...currentErrors, weight: undefined }));
                    }}
                    aria-label="Weight unit"
                    className="absolute right-2 top-2 h-7 rounded-lg border-0 bg-transparent px-1 text-xs font-bold text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0"
                  >
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                </div>
                <div className="min-h-[20px] pt-0.5">
                  {fieldErrors.weight ? <span id="weight-error" role="alert" className="block text-xs font-semibold text-destructive">{fieldErrors.weight}</span> : null}
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-bold">Date</span>
                <AdaptiveDatePicker label="Date" value={date} onChange={setDate} className={inputClass} />
              </label>

              <label className="block space-y-2">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold">Notes</span>
                  <span className="text-xs text-muted-foreground">Optional</span>
                </span>
              <textarea
                  value={notes}
                  onChange={event => {
                    const result = guardHealthTextChange(notes, event.target.value, { label: 'Notes', maxLength: 300, mode: 'multiline' });
                    if (!result.accepted) {
                      setFieldErrors(current => ({ ...current, notes: result.error }));
                      return;
                    }
                    setNotes(result.value);
                    setFieldErrors(current => ({ ...current, notes: result.error }));
                  }}
                  aria-invalid={Boolean(fieldErrors.notes)}
                  aria-describedby="weight-notes-error"
                  className="min-h-24 w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-3 text-sm outline-none transition-colors focus:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0"
                  placeholder="Morning measurement, after waking…"
                />
                <div className="min-h-[20px] pt-0.5">
                  {fieldErrors.notes ? <span id="weight-notes-error" role="alert" className="block text-xs font-semibold text-destructive">{fieldErrors.notes}</span> : null}
                </div>
              </label>

              <div className="min-h-[20px] pt-0.5">
                {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
              </div>

              {Number.isFinite(preview) && preview > 0 ? (
                <div className="rounded-xl border border-border/50 bg-background/50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Preview</p>
                  <p className="mt-2 text-3xl font-black">{formatMeasurementNumber(preview, 2)} {weightUnit}</p>
                  {difference !== null ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {Math.abs(difference) < 0.05
                        ? 'At your current target'
                        : `${formatMeasurementNumber(Math.abs(difference), 2)} ${weightUnit} ${difference > 0 ? 'above' : 'below'} your target`}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">Set a target to see directional progress.</p>
                  )}
                </div>
              ) : null}
            </div>

            <footer className="android-weight-modal-footer flex flex-col-reverse gap-2 border-t border-border/50 p-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={attemptClose}>Cancel</Button>
              <Button type="submit">{isEditMode ? 'Save changes' : 'Add weight'}</Button>
            </footer>
          </form>
        </div>
      */}

      <ConfirmDialog
        isOpen={confirmDiscard}
        title="Discard weight changes?"
        message="Your unsaved weight entry will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        isDangerous
        onConfirm={() => {
          setConfirmDiscard(false);
          closeSurface();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>,
    document.body,
  );
}
