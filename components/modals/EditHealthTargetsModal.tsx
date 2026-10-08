'use client';

import healthResponsive from '@/components/health/health-responsive.module.css';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { FormField } from '@/components/common/FormPatterns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { useAppContext } from '@/lib/context';
import {
  canonicalHeightFromDraft,
  canonicalWeightFromDraft,
  cmToFeetInches,
  formatMeasurementNumber,
  getHeightImperialBounds,
  getWeightBounds,
  kgToWeight,
  readHealthMeasurementPreferences,
  roundMeasurement,
  writeHealthMeasurementPreferences,
  type HeightUnit,
  type WeightUnit,
} from '@/lib/health/measurements';
import { guardHealthNumberChange, HEALTH_LIMITS, validateHealthNumber, type HealthNumberOptions } from '@/lib/health/validation';
import { AndroidAdaptiveSelect, AndroidDismissibleBackdrop } from '@/components/native/android-design';

type Draft = {
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  targetWeightKg: string;
  targetCalories: string;
  maintenanceCalories: string;
  targetProtein: string;
  targetCarbs: string;
  targetFat: string;
  targetFiber: string;
  sugarLimit: string;
  targetWaterMl: string;
  sodiumLimitMg: string;
  sleepTargetHours: string;
  sleepTargetMinutes: string;
  targetExerciseMinutesPerWeek: string;
};

type DraftKey = keyof Draft;

type ErrorMap = Partial<Record<DraftKey, string>>;

function toDraft(value: number | undefined) {
  return value == null ? '' : String(value);
}

function toSleepTargetDraft(value: number | undefined) {
  if (value == null) return { hours: '', minutes: '' };
  return {
    hours: String(Math.floor(value / 60)),
    minutes: String(value % 60).padStart(2, '0'),
  };
}

function buildDraft(
  health: ReturnType<typeof useAppContext>['health'] | undefined,
  weightUnit: WeightUnit,
  heightUnit: HeightUnit,
): Draft {
  const height = health?.heightCm;
  const imperialHeight = typeof height === 'number' && Number.isFinite(height)
    ? cmToFeetInches(height)
    : null;
  const sleepTarget = toSleepTargetDraft(health?.sleepTargetMinutes);
  return {
    heightCm: heightUnit === 'cm' && height != null ? String(height) : '',
    heightFeet: heightUnit === 'ft-in' && imperialHeight ? String(imperialHeight.feet) : '',
    heightInches: heightUnit === 'ft-in' && imperialHeight ? String(roundMeasurement(imperialHeight.inches, 1)) : '',
    targetWeightKg: health?.targetWeightKg == null
      ? ''
      : String(roundMeasurement(kgToWeight(health.targetWeightKg, weightUnit), 2)),
    targetCalories: toDraft(health?.targetCalories),
    maintenanceCalories: toDraft(health?.maintenanceCalories),
    targetProtein: toDraft(health?.targetProtein),
    targetCarbs: toDraft(health?.targetCarbs),
    targetFat: toDraft(health?.targetFat),
    targetFiber: toDraft(health?.targetFiber),
    sugarLimit: toDraft(health?.sugarLimit),
    targetWaterMl: toDraft(health?.targetWaterMl),
    sodiumLimitMg: toDraft(health?.sodiumLimitMg),
    sleepTargetHours: sleepTarget.hours,
    sleepTargetMinutes: sleepTarget.minutes,
    targetExerciseMinutesPerWeek: toDraft(health?.targetExerciseMinutesPerWeek),
  };
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function EditHealthTargetsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { health, currentProfileId, getCurrentProfile, updateProfile } = useAppContext();
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');
  const [draft, setDraft] = useState<Draft>(() => buildDraft(health, 'kg', 'cm'));
  const [initialComparable, setInitialComparable] = useState('');
  const [initialCanonical, setInitialCanonical] = useState<{ heightCm?: number; targetWeightKg?: number }>({});
  const [errors, setErrors] = useState<ErrorMap>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const modalPanelRef = useRef<HTMLFormElement>(null);
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });

  useEffect(() => {
    if (!isOpen) return;
    const preferences = currentProfileId
      ? readHealthMeasurementPreferences(currentProfileId)
      : { weightUnit: 'kg' as const, heightUnit: 'cm' as const };
    const nextDraft = buildDraft(health, preferences.weightUnit, preferences.heightUnit);
    setWeightUnit(preferences.weightUnit);
    setHeightUnit(preferences.heightUnit);
    setDraft(nextDraft);
    setInitialCanonical({
      heightCm: health?.heightCm,
      targetWeightKg: health?.targetWeightKg,
    });
    setInitialComparable(JSON.stringify({
      ...nextDraft,
      weightUnit: preferences.weightUnit,
      heightUnit: preferences.heightUnit,
    }));
    setErrors({});
    setConfirmDiscard(false);
  }, [currentProfileId, health, isOpen]);

  const hasChanges = initialComparable !== '' && JSON.stringify({ ...draft, weightUnit, heightUnit }) !== initialComparable;

  const attemptClose = () => {
    if (hasChanges) {
      setConfirmDiscard(true);
      return;
    }
    close();
  };
  useOverlayLifecycle(isOpen, attemptClose, {
    containerRef: modalPanelRef,
    initialFocusRef: modalPanelRef,
  });

  const weightBounds = getWeightBounds(weightUnit);
  const imperialHeightBounds = getHeightImperialBounds();

  const getNumberOptions = (key: DraftKey): Omit<HealthNumberOptions, 'label'> => {
    switch (key) {
      case 'heightCm':
        return { min: 80, max: 250, precision: 1, allowBlank: true, unit: 'cm' };
      case 'heightFeet':
        return { min: 0, max: 20, integer: true, allowBlank: true, unit: 'ft' };
      case 'heightInches':
        return { min: 0, max: 11.9, precision: 1, allowBlank: true, unit: 'in' };
      case 'targetWeightKg':
        return { min: weightBounds.min, max: weightBounds.max, precision: 2, allowBlank: true, unit: weightUnit };
      case 'targetCalories':
      case 'maintenanceCalories':
        return { ...HEALTH_LIMITS.targetCalories, allowBlank: true, unit: 'kcal' };
      case 'targetProtein':
        return { ...HEALTH_LIMITS.targetProtein, allowBlank: true, unit: 'g' };
      case 'targetCarbs':
      case 'targetFat':
      case 'targetFiber':
      case 'sugarLimit':
        return { min: 1, max: 2000, precision: 1, allowBlank: true, unit: 'g' };
      case 'targetWaterMl':
        return { ...HEALTH_LIMITS.targetWater, allowBlank: true, unit: 'mL' };
      case 'sodiumLimitMg':
        return { min: 100, max: 10000, integer: true, allowBlank: true, unit: 'mg' };
      case 'sleepTargetHours':
        return { min: 0, max: 24, integer: true, allowBlank: true, unit: 'hours' };
      case 'sleepTargetMinutes':
        return { min: 0, max: 59, integer: true, allowBlank: true, unit: 'minutes' };
      case 'targetExerciseMinutesPerWeek':
        return { ...HEALTH_LIMITS.exerciseTarget, allowBlank: true, unit: 'minutes' };
    }
  };

  const labels: Record<DraftKey, string> = {
    heightCm: 'Height',
    heightFeet: 'Height feet',
    heightInches: 'Height inches',
    targetWeightKg: 'Target weight',
    targetCalories: 'Calorie target',
    maintenanceCalories: 'Maintenance calories',
    targetProtein: 'Protein target',
    targetCarbs: 'Carbohydrates target',
    targetFat: 'Fat target',
    targetFiber: 'Fiber target',
    sugarLimit: 'Sugar limit',
    targetWaterMl: 'Water target',
    sodiumLimitMg: 'Sodium limit',
    sleepTargetHours: 'Sleep target hours',
    sleepTargetMinutes: 'Sleep target minutes',
    targetExerciseMinutesPerWeek: 'Exercise target',
  };

  const setFieldError = (key: DraftKey, error?: string) => {
    setErrors(current => ({ ...current, [key]: error }));
  };

  const update = (key: DraftKey, value: string) => {
    const result = guardHealthNumberChange(draft[key], value, { label: labels[key], ...getNumberOptions(key) });
    if (!result.accepted) {
      setFieldError(key, result.error);
      return;
    }
    setDraft(current => ({ ...current, [key]: result.value }));
    setFieldError(key);
  };

  const blurValidate = (key: DraftKey) => {
    setFieldError(key, validateHealthNumber(draft[key], { label: labels[key], ...getNumberOptions(key) }));
  };

  const updateWeightUnit = (nextUnit: WeightUnit) => {
    const current = Number(draft.targetWeightKg);
    if (draft.targetWeightKg.trim() && Number.isFinite(current)) {
      const canonical = canonicalWeightFromDraft(current, weightUnit);
      if (canonical >= 20 && canonical <= 400) {
        setDraft(currentDraft => ({
          ...currentDraft,
          targetWeightKg: String(roundMeasurement(kgToWeight(canonical, nextUnit), 2)),
        }));
      }
    }
    setWeightUnit(nextUnit);
    if (currentProfileId) {
      writeHealthMeasurementPreferences(currentProfileId, { weightUnit: nextUnit, heightUnit });
    }
    setFieldError('targetWeightKg');
  };

  const updateHeightUnit = (nextUnit: HeightUnit) => {
    if (heightUnit === nextUnit) return;
    let canonical: number | null | undefined = null;
    if (heightUnit === 'cm') {
      const value = Number(draft.heightCm);
      if (!draft.heightCm.trim()) canonical = undefined;
      else if (!Number.isFinite(value)) canonical = null;
      else canonical = canonicalHeightFromDraft(value, 'cm');
    } else {
      const feet = Number(draft.heightFeet);
      const inches = Number(draft.heightInches);
      if (!draft.heightFeet.trim() && !draft.heightInches.trim()) canonical = undefined;
      else if (Number.isFinite(feet) && Number.isFinite(inches)) canonical = canonicalHeightFromDraft({ feet, inches }, 'ft-in');
    }
    if (canonical === null) return;
    if (nextUnit === 'cm') {
      setDraft(current => ({
        ...current,
        heightCm: canonical === undefined ? '' : String(roundMeasurement(canonical, 1)),
        heightFeet: '',
        heightInches: '',
      }));
    } else {
      const parts = canonical === undefined ? null : cmToFeetInches(canonical);
      setDraft(current => ({
        ...current,
        heightCm: '',
        heightFeet: parts ? String(parts.feet) : '',
        heightInches: parts ? String(roundMeasurement(parts.inches, 1)) : '',
      }));
    }
    setHeightUnit(nextUnit);
    if (currentProfileId) {
      writeHealthMeasurementPreferences(currentProfileId, { weightUnit, heightUnit: nextUnit });
    }
    setErrors(current => ({ ...current, heightCm: undefined, heightFeet: undefined, heightInches: undefined }));
  };

  const validate = () => {
    const next: ErrorMap = {};

    const check = (key: DraftKey) => {
      const error = validateHealthNumber(draft[key], { label: labels[key], ...getNumberOptions(key) });
      if (error) next[key] = error;
    };

    if (heightUnit === 'cm') {
      check('heightCm');
    } else {
      const hasFeet = Boolean(draft.heightFeet.trim());
      const hasInches = Boolean(draft.heightInches.trim());
      if (hasFeet !== hasInches) {
        next.heightFeet = hasFeet ? undefined : 'Enter feet and inches together.';
        next.heightInches = hasInches ? undefined : 'Enter feet and inches together.';
      }
      check('heightFeet');
      check('heightInches');
      if (hasFeet && hasInches) {
        const feet = Number(draft.heightFeet);
        const inches = Number(draft.heightInches);
        const totalInches = feet * 12 + inches;
        if (Number.isFinite(totalInches) && (totalInches < imperialHeightBounds.minTotalInches || totalInches > imperialHeightBounds.maxTotalInches)) {
          const min = `${imperialHeightBounds.min.feet} ft ${formatMeasurementNumber(imperialHeightBounds.min.inches, 1)} in`;
          const max = `${imperialHeightBounds.max.feet} ft ${formatMeasurementNumber(imperialHeightBounds.max.inches, 1)} in`;
          next.heightFeet = `Enter a height from ${min} to ${max}.`;
        }
      }
    }
    check('targetWeightKg');
    check('targetCalories');
    check('maintenanceCalories');
    check('targetProtein');
    check('targetCarbs');
    check('targetFat');
    check('targetFiber');
    check('sugarLimit');
    check('targetWaterMl');
    check('sodiumLimitMg');

    const sleepHoursInput = draft.sleepTargetHours.trim();
    const sleepMinutesInput = draft.sleepTargetMinutes.trim();
    if (sleepHoursInput || sleepMinutesInput) {
      const hoursError = validateHealthNumber(sleepHoursInput, { label: 'Sleep target hours', ...getNumberOptions('sleepTargetHours') });
      const minutesError = validateHealthNumber(sleepMinutesInput, { label: 'Sleep target minutes', ...getNumberOptions('sleepTargetMinutes') });
      if (hoursError) next.sleepTargetHours = hoursError;
      if (minutesError) next.sleepTargetMinutes = minutesError;
      const hours = sleepHoursInput ? Number(sleepHoursInput) : 0;
      const minutes = sleepMinutesInput ? Number(sleepMinutesInput) : 0;
      const total = hours * 60 + minutes;
      if (
        Number.isInteger(hours) &&
        Number.isInteger(minutes) &&
        (total < 1 || total > 1440 || (hours === 24 && minutes > 0))
      ) {
        next.sleepTargetHours = 'Sleep target must be between 1 minute and 24 hours.';
      }
    }

    const exerciseTargetInput = draft.targetExerciseMinutesPerWeek.trim();
    const exerciseError = validateHealthNumber(exerciseTargetInput, { label: 'Exercise target', ...getNumberOptions('targetExerciseMinutesPerWeek') });
    if (exerciseError) next.targetExerciseMinutesPerWeek = exerciseError;

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    const profile = getCurrentProfile();
    if (!profile) return;

    const sleepHoursInput = draft.sleepTargetHours.trim();
    const sleepMinutesInput = draft.sleepTargetMinutes.trim();
    const sleepTargetMinutes = sleepHoursInput || sleepMinutesInput
      ? Number(sleepHoursInput || 0) * 60 + Number(sleepMinutesInput || 0)
      : undefined;

    const parsedHeight = heightUnit === 'cm'
      ? optionalNumber(draft.heightCm)
      : draft.heightFeet.trim() && draft.heightInches.trim()
        ? canonicalHeightFromDraft({ feet: Number(draft.heightFeet), inches: Number(draft.heightInches) }, 'ft-in')
        : undefined;
    const parsedWeight = draft.targetWeightKg.trim()
      ? canonicalWeightFromDraft(Number(draft.targetWeightKg), weightUnit)
      : undefined;
    const heightCm = parsedHeight !== undefined && initialCanonical.heightCm !== undefined && Math.abs(parsedHeight - initialCanonical.heightCm) < 0.15
      ? initialCanonical.heightCm
      : parsedHeight;
    const targetWeightKg = parsedWeight !== undefined && initialCanonical.targetWeightKg !== undefined && Math.abs(parsedWeight - initialCanonical.targetWeightKg) < 0.005
      ? initialCanonical.targetWeightKg
      : parsedWeight;

    updateProfile(profile.id, {
      health: {
        ...profile.health,
        heightCm,
        targetWeightKg,
        targetCalories: optionalNumber(draft.targetCalories),
        maintenanceCalories: optionalNumber(draft.maintenanceCalories),
        targetProtein: optionalNumber(draft.targetProtein),
        targetCarbs: optionalNumber(draft.targetCarbs),
        targetFat: optionalNumber(draft.targetFat),
        targetFiber: optionalNumber(draft.targetFiber),
        sugarLimit: optionalNumber(draft.sugarLimit),
        targetWaterMl: optionalNumber(draft.targetWaterMl),
        sodiumLimitMg: optionalNumber(draft.sodiumLimitMg),
        sleepTargetMinutes,
        targetExerciseMinutesPerWeek: draft.targetExerciseMinutesPerWeek.trim()
          ? Number(draft.targetExerciseMinutesPerWeek)
          : undefined,
      },
    });

    close();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9999] overflow-hidden p-2 sm:p-6"
        data-caizen-overlay={isClosing ? 'closing' : 'open'}
        data-state={isClosing ? 'closed' : 'open'}
      >
        <AndroidDismissibleBackdrop
          onClose={attemptClose}
          ariaLabel="Close health targets"
          className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        />
        <div className="flex h-[min(var(--cz-vh,100dvh),100dvh)] items-end justify-center sm:items-center">
          <form
            ref={modalPanelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="health-targets-title"
            aria-describedby="health-targets-description"
            noValidate
            onSubmit={submit}
            data-caizen-overlay-panel="true"
            className={healthResponsive.dialog + " caizen-modal-fade-up android-fullscreen-form health-targets-modal relative z-10 flex max-h-[calc(min(var(--cz-vh,100dvh),100dvh)-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl sm:max-h-[88dvh]"}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/50 p-5 sm:p-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <SlidersHorizontal className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="health-targets-title" className="text-xl font-black sm:text-2xl">Health targets</h2>
                  <p id="health-targets-description" className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Only set the values you actively want to track. Blank targets stay disabled and do not create warnings.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={attemptClose}
                aria-label="Close health targets"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
              <section className="space-y-4">
                <div>
                  <h3 className="font-black">Body and weight</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Used for BMI estimates and directional weight progress.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField asGroup label="Height" error={errors.heightCm || errors.heightFeet || errors.heightInches}>
                    {({ describedBy, invalid }) => (
                      <div>
                        {heightUnit === 'cm' ? (
                          <div data-caizen-focus-shell="true" className="health-measurement-field">
                            <Input id="health-height-cm" aria-label="Height in centimeters" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="decimal" value={draft.heightCm} onChange={event => update('heightCm', event.target.value)} onBlur={() => blurValidate('heightCm')} data-caizen-focus-inner="true" className="health-number-input" placeholder="Not set" />
                            <AndroidAdaptiveSelect id="health-height-unit" label="Height unit" value={heightUnit} onChange={value => updateHeightUnit(value as HeightUnit)} className="health-measurement-unit-trigger" options={[{ value: 'cm', label: 'cm' }, { value: 'ft-in', label: 'ft / in' }]} />
                          </div>
                        ) : (
                          <div data-caizen-focus-shell="true" className="health-measurement-field health-measurement-field-imperial">
                            <div className="health-measurement-input-pair">
                              <label className="sr-only" htmlFor="height-feet">Feet</label>
                              <div className="health-measurement-input-part">
                                <Input id="height-feet" type="text" inputMode="numeric" value={draft.heightFeet} onChange={event => update('heightFeet', event.target.value)} onBlur={() => blurValidate('heightFeet')} data-caizen-focus-inner="true" className="health-number-input" aria-label="Height feet" aria-describedby={describedBy} aria-invalid={invalid || undefined} />
                                <span className="health-measurement-input-unit" aria-hidden="true">ft</span>
                              </div>
                              <label className="sr-only" htmlFor="height-inches">Inches</label>
                              <div className="health-measurement-input-part">
                                <Input id="height-inches" type="text" inputMode="decimal" value={draft.heightInches} onChange={event => update('heightInches', event.target.value)} onBlur={() => blurValidate('heightInches')} data-caizen-focus-inner="true" className="health-number-input" aria-label="Height inches" aria-describedby={describedBy} aria-invalid={invalid || undefined} />
                                <span className="health-measurement-input-unit" aria-hidden="true">in</span>
                              </div>
                            </div>
                            <AndroidAdaptiveSelect id="health-height-unit" label="Height unit" value={heightUnit} onChange={value => updateHeightUnit(value as HeightUnit)} className="health-measurement-unit-trigger" options={[{ value: 'cm', label: 'cm' }, { value: 'ft-in', label: 'ft / in' }]} />
                          </div>
                        )}
                      </div>
                    )}
                  </FormField>
                  <FormField asGroup label="Target weight" error={errors.targetWeightKg}>
                    {({ describedBy, invalid }) => (
                      <div data-caizen-focus-shell="true" className="health-measurement-field">
                        <Input id="health-target-weight" aria-label="Target weight" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="decimal" value={draft.targetWeightKg} onChange={event => update('targetWeightKg', event.target.value)} onBlur={() => blurValidate('targetWeightKg')} data-caizen-focus-inner="true" className="health-number-input" placeholder="Not set" />
                        <AndroidAdaptiveSelect id="health-weight-unit" label="Weight unit" value={weightUnit} onChange={value => updateWeightUnit(value as WeightUnit)} className="health-measurement-unit-trigger" options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
                      </div>
                    )}
                  </FormField>
                </div>
              </section>

              <section className="mt-7 space-y-5 border-t border-border/50 pt-7">
                <div>
                  <h3 className="font-black">Nutrition</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Targets are amounts to work toward. Limits are amounts to stay under. These are personal settings, not medical recommendations.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField asGroup label="Daily calorie target" error={errors.targetCalories}>
                    {({ describedBy, invalid }) => <InputGroup className="health-target-unit-group h-11 rounded-xl">
                      <InputGroupInput id="health-target-calories" aria-label="Daily calorie target, kcal" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="numeric" value={draft.targetCalories} onChange={event => update('targetCalories', event.target.value)} onBlur={() => blurValidate('targetCalories')} className="health-number-input" placeholder="Not set" />
                      <InputGroupAddon align="inline-end" className="text-xs">kcal</InputGroupAddon>
                    </InputGroup>}
                  </FormField>
                  <FormField asGroup label="Maintenance estimate" error={errors.maintenanceCalories}>
                    {({ describedBy, invalid }) => <InputGroup className="health-target-unit-group h-11 rounded-xl">
                      <InputGroupInput id="health-maintenance-calories" aria-label="Maintenance estimate, kcal" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="numeric" value={draft.maintenanceCalories} onChange={event => update('maintenanceCalories', event.target.value)} onBlur={() => blurValidate('maintenanceCalories')} className="health-number-input" placeholder="Not set" />
                      <InputGroupAddon align="inline-end" className="text-xs">kcal</InputGroupAddon>
                    </InputGroup>}
                  </FormField>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Targets</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField asGroup label="Protein target" error={errors.targetProtein}>
                      {({ describedBy, invalid }) => <InputGroup className="health-target-unit-group h-11 rounded-xl">
                        <InputGroupInput id="health-target-protein" aria-label="Protein target, grams" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="decimal" value={draft.targetProtein} onChange={event => update('targetProtein', event.target.value)} onBlur={() => blurValidate('targetProtein')} className="health-number-input" placeholder="Not set" />
                        <InputGroupAddon align="inline-end" className="text-xs">g</InputGroupAddon>
                      </InputGroup>}
                    </FormField>
                    <FormField asGroup label="Carbohydrates target" error={errors.targetCarbs}>
                      {({ describedBy, invalid }) => <InputGroup className="health-target-unit-group h-11 rounded-xl">
                        <InputGroupInput id="health-target-carbs" aria-label="Carbohydrates target, grams" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="decimal" value={draft.targetCarbs} onChange={event => update('targetCarbs', event.target.value)} onBlur={() => blurValidate('targetCarbs')} className="health-number-input" placeholder="Not set" />
                        <InputGroupAddon align="inline-end" className="text-xs">g</InputGroupAddon>
                      </InputGroup>}
                    </FormField>
                    <FormField asGroup label="Fat target" error={errors.targetFat}>
                      {({ describedBy, invalid }) => <InputGroup className="health-target-unit-group h-11 rounded-xl">
                        <InputGroupInput id="health-target-fat" aria-label="Fat target, grams" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="decimal" value={draft.targetFat} onChange={event => update('targetFat', event.target.value)} onBlur={() => blurValidate('targetFat')} className="health-number-input" placeholder="Not set" />
                        <InputGroupAddon align="inline-end" className="text-xs">g</InputGroupAddon>
                      </InputGroup>}
                    </FormField>
                    <FormField asGroup label="Fiber target" error={errors.targetFiber}>
                      {({ describedBy, invalid }) => <InputGroup className="health-target-unit-group h-11 rounded-xl">
                        <InputGroupInput id="health-target-fiber" aria-label="Fiber target, grams" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="decimal" value={draft.targetFiber} onChange={event => update('targetFiber', event.target.value)} onBlur={() => blurValidate('targetFiber')} className="health-number-input" placeholder="Not set" />
                        <InputGroupAddon align="inline-end" className="text-xs">g</InputGroupAddon>
                      </InputGroup>}
                    </FormField>
                    <FormField asGroup label="Water target" hint="Optional" error={errors.targetWaterMl}>
                      {({ describedBy, invalid }) => <InputGroup className="health-target-unit-group h-11 rounded-xl">
                        <InputGroupInput id="health-target-water" aria-label="Water target, milliliters" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="numeric" value={draft.targetWaterMl} onChange={event => update('targetWaterMl', event.target.value)} onBlur={() => blurValidate('targetWaterMl')} className="health-number-input" placeholder="Not set" />
                        <InputGroupAddon align="inline-end" className="text-xs">mL</InputGroupAddon>
                      </InputGroup>}
                    </FormField>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Limits</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField asGroup label="Sodium limit" error={errors.sodiumLimitMg}>
                      {({ describedBy, invalid }) => <InputGroup className="health-target-unit-group h-11 rounded-xl">
                        <InputGroupInput id="health-sodium-limit" aria-label="Sodium limit, milligrams" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="numeric" value={draft.sodiumLimitMg} onChange={event => update('sodiumLimitMg', event.target.value)} onBlur={() => blurValidate('sodiumLimitMg')} className="health-number-input" placeholder="Not set" />
                        <InputGroupAddon align="inline-end" className="text-xs">mg</InputGroupAddon>
                      </InputGroup>}
                    </FormField>
                    <FormField asGroup label="Sugar limit" hint="Total sugar" error={errors.sugarLimit}>
                      {({ describedBy, invalid }) => <InputGroup className="health-target-unit-group h-11 rounded-xl">
                        <InputGroupInput id="health-sugar-limit" aria-label="Sugar limit, grams" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="decimal" value={draft.sugarLimit} onChange={event => update('sugarLimit', event.target.value)} onBlur={() => blurValidate('sugarLimit')} className="health-number-input" placeholder="Not set" />
                        <InputGroupAddon align="inline-end" className="text-xs">g</InputGroupAddon>
                      </InputGroup>}
                    </FormField>
                  </div>
                </div>
              </section>

              <section className="mt-7 space-y-4 border-t border-border/50 pt-7">
                <div>
                  <h3 className="font-black">Wellness</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Optional targets stay quiet until you choose to track them.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <FormField asGroup label="Sleep target">
                      <InputGroup className="health-target-unit-group h-11 rounded-xl">
                        <div className="flex min-w-0 flex-1 items-center">
                          <InputGroupInput id="health-sleep-hours" aria-label="Sleep target hours" aria-describedby={errors.sleepTargetHours ? 'health-sleep-hours-error' : undefined} aria-invalid={errors.sleepTargetHours ? true : undefined} type="text" inputMode="numeric" value={draft.sleepTargetHours} onChange={event => update('sleepTargetHours', event.target.value)} onBlur={() => blurValidate('sleepTargetHours')} className="health-number-input min-w-0" placeholder="Hours" />
                          <InputGroupAddon align="inline-end" className="text-xs">hr</InputGroupAddon>
                        </div>
                        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border/70" />
                        <div className="flex min-w-0 flex-1 items-center">
                          <InputGroupInput id="health-sleep-minutes" aria-label="Sleep target minutes" aria-describedby={errors.sleepTargetMinutes ? 'health-sleep-minutes-error' : undefined} aria-invalid={errors.sleepTargetMinutes ? true : undefined} type="text" inputMode="numeric" value={draft.sleepTargetMinutes} onChange={event => update('sleepTargetMinutes', event.target.value)} onBlur={() => blurValidate('sleepTargetMinutes')} className="health-number-input min-w-0" placeholder="Minutes" />
                          <InputGroupAddon align="inline-end" className="text-xs">min</InputGroupAddon>
                        </div>
                      </InputGroup>
                      {errors.sleepTargetHours || errors.sleepTargetMinutes ? (
                        <div className="grid grid-cols-2 gap-3">
                          <p id="health-sleep-hours-error" role="alert" className="text-body-sm font-semibold text-destructive">{errors.sleepTargetHours}</p>
                          <p id="health-sleep-minutes-error" role="alert" className="text-body-sm font-semibold text-destructive">{errors.sleepTargetMinutes}</p>
                        </div>
                      ) : null}
                    </FormField>
                  </div>
                  <FormField asGroup label="Weekly exercise target" error={errors.targetExerciseMinutesPerWeek}>
                    {({ describedBy, invalid }) => <InputGroup className="health-target-unit-group h-11 rounded-xl">
                      <InputGroupInput id="health-weekly-exercise" aria-label="Weekly exercise target, minutes per week" aria-describedby={describedBy} aria-invalid={invalid || undefined} type="text" inputMode="numeric" value={draft.targetExerciseMinutesPerWeek} onChange={event => update('targetExerciseMinutesPerWeek', event.target.value)} onBlur={() => blurValidate('targetExerciseMinutesPerWeek')} className="health-number-input" placeholder="Not set" />
                      <InputGroupAddon align="inline-end" className="text-xs">min / week</InputGroupAddon>
                    </InputGroup>}
                  </FormField>
                </div>
              </section>
            </div>

            <footer className="health-platform-modal-actions flex shrink-0 flex-col-reverse gap-2 border-t border-border/50 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:p-5">
              <Button type="button" variant="outline" onClick={attemptClose}>Cancel</Button>
              <Button type="submit">Save targets</Button>
            </footer>
          </form>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDiscard}
        title="Discard target changes?"
        message="Your unsaved health target changes will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        isDangerous
        onConfirm={() => {
          setConfirmDiscard(false);
          close();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>,
    document.body,
  );
}
