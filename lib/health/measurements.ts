export type WeightUnit = 'kg' | 'lb';
export type HeightUnit = 'cm' | 'ft-in';

export type HealthMeasurementPreferences = {
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
};

export const DEFAULT_HEALTH_MEASUREMENT_PREFERENCES: HealthMeasurementPreferences = {
  weightUnit: 'kg',
  heightUnit: 'cm',
};

export const HEALTH_MEASUREMENT_PREFERENCE_KEY = (profileId: string) =>
  `health-measurements:${profileId}`;

export const KG_MIN = 20;
export const KG_MAX = 400;
export const CM_MIN = 80;
export const CM_MAX = 250;
export const LB_PER_KG = 2.2046226218;
export const CM_PER_INCH = 2.54;

export function roundMeasurement(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateBmi(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || Number(weightKg) <= 0 || Number(heightCm) <= 0) return null;
  const heightMeters = Number(heightCm) / 100;
  return roundMeasurement(Number(weightKg) / (heightMeters ** 2), 1);
}

export function kgToLb(valueKg: number): number {
  return valueKg * LB_PER_KG;
}

export function lbToKg(valueLb: number): number {
  return valueLb / LB_PER_KG;
}

export function cmToInches(valueCm: number): number {
  return valueCm / CM_PER_INCH;
}

export function inchesToCm(valueInches: number): number {
  return valueInches * CM_PER_INCH;
}

export function cmToFeetInches(valueCm: number): { feet: number; inches: number } {
  const totalInches = cmToInches(valueCm);
  let feet = Math.floor(totalInches / 12);
  let inches = roundMeasurement(totalInches - feet * 12, 1);
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return inchesToCm(feet * 12 + inches);
}

export function weightToKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? lbToKg(value) : value;
}

export function kgToWeight(valueKg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kgToLb(valueKg) : valueKg;
}

export function canonicalWeightFromDraft(value: number, unit: WeightUnit): number {
  return roundMeasurement(weightToKg(value, unit), 2);
}

export function canonicalHeightFromDraft(
  value: number | { feet: number; inches: number },
  unit: HeightUnit,
): number {
  if (unit === 'ft-in') {
    const parts = value as { feet: number; inches: number };
    return roundMeasurement(feetInchesToCm(parts.feet, parts.inches), 1);
  }
  return roundMeasurement(value as number, 1);
}

export function isCanonicalWeight(valueKg: number): boolean {
  return Number.isFinite(valueKg) && valueKg >= KG_MIN && valueKg <= KG_MAX;
}

export function isCanonicalHeight(valueCm: number): boolean {
  return Number.isFinite(valueCm) && valueCm >= CM_MIN && valueCm <= CM_MAX;
}

export function getWeightBounds(unit: WeightUnit) {
  return {
    min: kgToWeight(KG_MIN, unit),
    max: kgToWeight(KG_MAX, unit),
    displayMin: roundMeasurement(kgToWeight(KG_MIN, unit), 2),
    displayMax: roundMeasurement(kgToWeight(KG_MAX, unit), 2),
  };
}

export function getHeightImperialBounds() {
  return {
    min: cmToFeetInches(CM_MIN),
    max: cmToFeetInches(CM_MAX),
    minTotalInches: cmToInches(CM_MIN),
    maxTotalInches: cmToInches(CM_MAX),
  };
}

export function formatMeasurementNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

export function formatWeight(valueKg: number, unit: WeightUnit): string {
  return `${formatMeasurementNumber(kgToWeight(valueKg, unit), 2)} ${unit}`;
}

export function formatHeight(valueCm: number, unit: HeightUnit): string {
  if (unit === 'cm') return `${formatMeasurementNumber(valueCm, 1)} cm`;
  const parts = cmToFeetInches(valueCm);
  const inches = formatMeasurementNumber(parts.inches, 1);
  return `${parts.feet} ft ${inches} in`;
}

export function readHealthMeasurementPreferences(profileId: string): HealthMeasurementPreferences {
  if (typeof window === 'undefined') return DEFAULT_HEALTH_MEASUREMENT_PREFERENCES;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HEALTH_MEASUREMENT_PREFERENCE_KEY(profileId)) || '{}') as Partial<HealthMeasurementPreferences>;
    return {
      weightUnit: parsed.weightUnit === 'lb' ? 'lb' : 'kg',
      heightUnit: parsed.heightUnit === 'ft-in' ? 'ft-in' : 'cm',
    };
  } catch {
    return DEFAULT_HEALTH_MEASUREMENT_PREFERENCES;
  }
}

export function writeHealthMeasurementPreferences(
  profileId: string,
  preferences: HealthMeasurementPreferences,
): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    HEALTH_MEASUREMENT_PREFERENCE_KEY(profileId),
    JSON.stringify(preferences),
  );
}
