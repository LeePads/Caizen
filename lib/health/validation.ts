/**
 * Validation used by Health editors at the draft/save boundary.
 *
 * Hydration and import intentionally use the older tolerant normalizers. These
 * helpers are for new values (or values the user changed), so invalid legacy
 * values are not silently rewritten while a record is merely opened.
 */

export type HealthTextMode = 'single-line' | 'multiline';

export type HealthTextOptions = {
  label: string;
  maxLength: number;
  mode?: HealthTextMode;
  required?: boolean;
};

export type HealthNumberOptions = {
  label: string;
  min: number;
  max: number;
  unit?: string;
  integer?: boolean;
  precision?: number;
  allowBlank?: boolean;
  allowNegative?: boolean;
};

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const LINE_BREAKS = /[\r\n]/u;
const INVISIBLE_FORMATTING = /[\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u2800\u3000\u3164\uFE00-\uFE0F\uFEFF]/u;
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const NUMBER_PATTERN = /^[+-]?(?:\d+)?(?:\.\d+)?$/u;
const TEMPORARY_NUMBER_PATTERN = /^[+-]?(?:\d+)?(?:\.)?$/u;

const formatLimit = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

function hasUnpairedSurrogate(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      return true;
    }
  }
  return false;
}

export function containsHealthEmoji(value: string) {
  return EXTENDED_PICTOGRAPHIC.test(value) || /[\u200D\u20E3]/u.test(value);
}

export function validateHealthText(value: string, options: HealthTextOptions): string | undefined {
  const mode = options.mode || 'single-line';
  if (options.required && !value.trim()) return `${options.label} is required.`;
  if (value.length > options.maxLength) return `Maximum ${options.maxLength} characters.`;
  if (hasUnpairedSurrogate(value)) return `${options.label} contains invalid text.`;
  if (containsHealthEmoji(value)) return "Emoji aren't supported.";
  if (CONTROL_CHARACTERS.test(value)) return 'Remove control characters.';
  if (INVISIBLE_FORMATTING.test(value)) return 'Remove invisible formatting characters.';
  if (mode === 'single-line' && LINE_BREAKS.test(value)) return 'Keep this field to one line.';
  return undefined;
}

export function validateHealthTextIfChanged(value: string, initialValue: string, options: HealthTextOptions) {
  return value === initialValue ? undefined : validateHealthText(value, options);
}

export function validateHealthNumber(value: string, options: HealthNumberOptions): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return options.allowBlank ? undefined : `${options.label} is required.`;
  if (!NUMBER_PATTERN.test(trimmed)) return 'Enter a valid number.';
  if (!options.allowNegative && trimmed.startsWith('-')) return "Negative values aren't allowed.";

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return 'Enter a valid number.';
  if (options.integer && !Number.isInteger(parsed)) return 'Enter a whole number.';
  if (options.precision !== undefined) {
    const decimalPart = trimmed.replace(/^[+-]?\d*/, '').replace(/^\./, '');
    if (decimalPart.length > options.precision) return `Use up to ${options.precision} decimal place${options.precision === 1 ? '' : 's'}.`;
  }
  if (parsed > options.max) return `Maximum is ${formatLimit(options.max)}${options.unit ? ` ${options.unit}` : ''}.`;
  if (parsed < options.min) return `Enter a value from ${formatLimit(options.min)} to ${formatLimit(options.max)}${options.unit ? ` ${options.unit}` : ''}.`;
  return undefined;
}

export function validateHealthNumberIfChanged(value: string, initialValue: string, options: HealthNumberOptions) {
  return value === initialValue ? undefined : validateHealthNumber(value, options);
}

export function validateHealthReps(value: string, label = 'Reps'): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+(?:-\d+)?$/u.test(trimmed)) return `${label}: use a number or range like 8-12.`;
  const parts = trimmed.split('-').map(Number);
  if (parts.some(part => !Number.isInteger(part) || part < 1 || part > 100) || (parts.length === 2 && parts[1] < parts[0])) {
    return `${label}: use an ascending number or range like 8-12.`;
  }
  return undefined;
}

export type HealthGuardResult = { value: string; error?: string; accepted: boolean };

export function guardHealthTextChange(current: string, proposed: string, options: HealthTextOptions): HealthGuardResult {
  const error = validateHealthText(proposed, options);
  return error ? { value: current, error, accepted: false } : { value: proposed, accepted: true };
}

export function guardHealthNumberChange(current: string, proposed: string, options: HealthNumberOptions): HealthGuardResult {
  const trimmed = proposed.trim();
  if (!trimmed) return { value: proposed, accepted: true };

  if (TEMPORARY_NUMBER_PATTERN.test(trimmed)) {
    if (trimmed === '-' && !options.allowNegative) {
      return { value: current, error: "Negative values aren't allowed.", accepted: false };
    }
    if (trimmed.endsWith('.') && options.integer) {
      return { value: current, error: 'Enter a whole number.', accepted: false };
    }
    if (trimmed === '.' || trimmed === '+' || trimmed === '-') {
      return { value: proposed, accepted: true };
    }
    const base = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
    const structuralError = validateHealthNumber(base, {
      ...options,
      // Minimum and required constraints belong to blur/submit. A live draft
      // may be empty, below the minimum, or otherwise incomplete while it is
      // being constructed.
      min: Number.NEGATIVE_INFINITY,
      allowBlank: true,
    });
    return structuralError
      ? { value: current, error: structuralError, accepted: false }
      : { value: proposed, accepted: true };
  }
  const structuralError = validateHealthNumber(trimmed, {
    ...options,
    min: Number.NEGATIVE_INFINITY,
    allowBlank: true,
  });
  return structuralError
    ? { value: current, error: structuralError, accepted: false }
    : { value: proposed, accepted: true };
}

export const HEALTH_LIMITS = {
  foodAmount: { min: 0.01, max: 100000, precision: 2 },
  foodCalories: { min: 0, max: 20000, precision: 1 },
  foodMacro: { min: 0, max: 2000, precision: 1 },
  sodium: { min: 0, max: 100000, integer: true },
  weight: { min: 20, max: 400, precision: 2 },
  height: { min: 80, max: 250, precision: 1 },
  targetCalories: { min: 500, max: 10000, integer: true },
  targetProtein: { min: 1, max: 500, precision: 1 },
  targetWater: { min: 100, max: 10000, integer: true },
  sleepScore: { min: 0, max: 100, integer: true },
  awakenings: { min: 0, max: 99, integer: true },
  exerciseTarget: { min: 1, max: 10080, integer: true },
  workoutDuration: { min: 1, max: 1440, integer: true },
  workoutCalories: { min: 0, max: 20000, integer: true },
  supplementPrice: { min: 0, max: 10000000, precision: 2 },
  supplementQuantity: { min: 0, max: 100000, precision: 2 },
  dailyIntake: { min: 1, max: 24, integer: true },
} as const;
