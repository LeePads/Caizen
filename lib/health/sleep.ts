import type { MorningMood, SleepQuality } from '@/lib/types';

export const MAX_SLEEP_DURATION_MINUTES = 24 * 60;
export const MAX_SLEEP_SCORE = 100;
// A conservative entry cap for a manual sleep-log metric. Historical values
// are still normalized as non-negative integers; this only bounds new UI input.
export const MAX_TIMES_AWAKENED = 99;

type SleepDurationSource = {
  sleepDurationMinutes?: unknown;
  hours?: unknown;
};

const finiteNumber = (value: unknown): number | null => {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function parseSleepTime(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

export function calculateSleepDurationMinutes(
  bedTime: string,
  wakeTime: string,
): number | null {
  const bedMinutes = parseSleepTime(bedTime);
  const wakeMinutes = parseSleepTime(wakeTime);
  if (bedMinutes === null || wakeMinutes === null || bedMinutes === wakeMinutes) {
    return null;
  }

  return wakeMinutes > bedMinutes
    ? wakeMinutes - bedMinutes
    : 24 * 60 - bedMinutes + wakeMinutes;
}

export function parseSleepDurationParts(
  hoursValue: unknown,
  minutesValue: unknown,
): number | null {
  const hours = finiteNumber(hoursValue);
  const minutes = finiteNumber(minutesValue);
  if (
    hours === null ||
    minutes === null ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 24 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const total = hours * 60 + minutes;
  if (
    total <= 0 ||
    total > MAX_SLEEP_DURATION_MINUTES ||
    (hours === 24 && minutes > 0)
  ) {
    return null;
  }
  return total;
}

export function normalizeSleepDurationMinutes(
  source: SleepDurationSource,
): number {
  const canonical = finiteNumber(source.sleepDurationMinutes);
  if (canonical !== null) {
    const rounded = Math.round(canonical);
    if (rounded > 0 && rounded <= MAX_SLEEP_DURATION_MINUTES) return rounded;
  }

  const legacyHours = finiteNumber(source.hours);
  if (legacyHours === null || legacyHours <= 0 || legacyHours > 24) return 0;

  const rounded = Math.round(legacyHours * 60);
  return rounded > 0 && rounded <= MAX_SLEEP_DURATION_MINUTES ? rounded : 0;
}

export function getSleepDurationMinutes(source: SleepDurationSource): number {
  return normalizeSleepDurationMinutes(source);
}

export function formatSleepDuration(value: number): string {
  const minutes = Math.max(0, Math.round(value));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${String(remainingMinutes).padStart(2, '0')}m`;
}

const SLEEP_QUALITY_LABELS: Record<SleepQuality, string> = {
  poor: 'Poor',
  fair: 'Fair',
  good: 'Good',
  great: 'Great',
};

/** Format stored sleep-quality values for display without changing their meaning. */
export function formatSleepQuality(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized in SLEEP_QUALITY_LABELS) {
    return SLEEP_QUALITY_LABELS[normalized as SleepQuality];
  }
  return normalized.replace(/(^|[\s_-])([\p{L}\p{N}])/gu, (_match, separator: string, character: string) =>
    `${separator}${character.toUpperCase()}`,
  );
}

export function averageSleepDurationMinutes(
  entries: SleepDurationSource[],
): number {
  if (entries.length === 0) return 0;
  const total = entries.reduce(
    (sum, entry) => sum + getSleepDurationMinutes(entry),
    0,
  );
  return Math.round(total / entries.length);
}

export function averageOptionalSleepMetric(
  entries: Array<{ sleepScore?: unknown; timesAwakened?: unknown }>,
  key: 'sleepScore' | 'timesAwakened',
): number | null {
  const values = entries
    .map(entry => finiteNumber(entry[key]))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function normalizeOptionalSleepScore(value: unknown): number | undefined {
  const score = finiteNumber(value);
  return score !== null && Number.isInteger(score) && score >= 0 && score <= MAX_SLEEP_SCORE
    ? score
    : undefined;
}

export function normalizeOptionalTimesAwakened(value: unknown): number | undefined {
  const count = finiteNumber(value);
  return count !== null && Number.isInteger(count) && count >= 0
    ? count
    : undefined;
}

export const MORNING_MOOD_OPTIONS: Array<{ value: MorningMood; label: string }> = [
  { value: 'poor', label: 'Poor' },
  { value: 'okay', label: 'Okay' },
  { value: 'good', label: 'Good' },
  { value: 'great', label: 'Great' },
];

export function normalizeOptionalMorningMood(value: unknown): MorningMood | undefined {
  return value === 'poor' || value === 'okay' || value === 'good' || value === 'great'
    ? value
    : undefined;
}

export function formatMorningMood(mood: MorningMood | undefined): string {
  const match = MORNING_MOOD_OPTIONS.find(option => option.value === mood);
  return match ? match.label : 'Not recorded';
}

/**
 * Averages times-of-day (in minutes since midnight) using circular/vector
 * averaging so a mix like 11:30 PM, 12:00 AM, 12:30 AM correctly centers on
 * midnight instead of collapsing toward an unrelated daytime mean.
 */
export function circularAverageMinutesOfDay(valuesInMinutes: number[]): number | null {
  if (valuesInMinutes.length === 0) return null;
  let sumSin = 0;
  let sumCos = 0;
  for (const minutes of valuesInMinutes) {
    const angle = (minutes / (24 * 60)) * 2 * Math.PI;
    sumSin += Math.sin(angle);
    sumCos += Math.cos(angle);
  }
  if (sumSin === 0 && sumCos === 0) return null;
  const meanAngle = Math.atan2(sumSin, sumCos);
  const normalizedAngle = meanAngle < 0 ? meanAngle + 2 * Math.PI : meanAngle;
  return Math.round((normalizedAngle / (2 * Math.PI)) * 24 * 60) % (24 * 60);
}

export function averageSleepClockTime(
  entries: Array<{ bedTime?: string; wakeTime?: string }>,
  key: 'bedTime' | 'wakeTime',
): number | null {
  const minutesList = entries
    .map(entry => (entry[key] ? parseSleepTime(entry[key] as string) : null))
    .filter((value): value is number => value !== null);
  return circularAverageMinutesOfDay(minutesList);
}

export function formatClockMinutes(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
}

export function normalizeSleepEntryRecord<T extends Record<string, unknown>>(
  entry: T,
): T & {
  sleepDurationMinutes: number;
  hours: number;
  sleepScore?: number;
  timesAwakened?: number;
  morningMood?: MorningMood;
} {
  const sleepDurationMinutes = normalizeSleepDurationMinutes(entry);
  return {
    ...entry,
    sleepDurationMinutes,
    // Keep the legacy decimal field readable for older callers. It is derived
    // from the canonical minute value and is never the source of truth.
    hours: sleepDurationMinutes / 60,
    sleepScore: normalizeOptionalSleepScore(entry.sleepScore),
    timesAwakened: normalizeOptionalTimesAwakened(entry.timesAwakened),
    morningMood: normalizeOptionalMorningMood(entry.morningMood),
  } as T & {
    sleepDurationMinutes: number;
    hours: number;
    sleepScore?: number;
    timesAwakened?: number;
    morningMood?: MorningMood;
  };
}

const SLEEP_QUALITY_SCORE: Record<SleepQuality, number> = {
  poor: 25,
  fair: 55,
  good: 80,
  great: 100,
};

const MORNING_MOOD_SCORE: Record<MorningMood, number> = {
  poor: 25,
  okay: 55,
  good: 80,
  great: 100,
};

// No target is configured on every profile, so scoring falls back to a
// generic 8-hour reference. This is a scoring convenience only — it is never
// written back as the user's sleep target.
const DEFAULT_SLEEP_SCORE_REFERENCE_MINUTES = 8 * 60;

function awakeningsToScore(timesAwakened: number): number {
  return Math.max(0, 100 - timesAwakened * 20);
}

export type CaizenSleepScoreInput = {
  sleepDurationMinutes: number;
  sleepTargetMinutes?: number | null;
  quality?: SleepQuality;
  timesAwakened?: number;
  morningMood?: MorningMood;
};

export type CaizenSleepScoreResult = {
  score: number;
  /** Human-readable list of the inputs that actually contributed to this score. */
  inputsUsed: string[];
  /** True when one or more optional inputs (quality, awakenings, morning check-in) were missing. */
  isLimitedData: boolean;
};

/**
 * A small, local, explainable heuristic — not a medical score. It only uses
 * data Caizen already has (duration, target, quality, awakenings, and the
 * optional morning check-in), weighted roughly 50/15/10/25. Missing optional
 * inputs are simply left out and the remaining weights are rebalanced, so the
 * score is never padded with a fabricated value.
 */
export function calculateCaizenSleepScore(
  input: CaizenSleepScoreInput,
): CaizenSleepScoreResult | null {
  if (!Number.isFinite(input.sleepDurationMinutes) || input.sleepDurationMinutes <= 0) return null;

  const referenceMinutes = input.sleepTargetMinutes && input.sleepTargetMinutes > 0
    ? input.sleepTargetMinutes
    : DEFAULT_SLEEP_SCORE_REFERENCE_MINUTES;
  const durationScore = Math.min(100, Math.round((input.sleepDurationMinutes / referenceMinutes) * 100));

  const parts: Array<{ weight: number; score: number; label: string }> = [
    { weight: 0.5, score: durationScore, label: 'sleep duration' },
  ];
  if (input.quality) {
    parts.push({ weight: 0.15, score: SLEEP_QUALITY_SCORE[input.quality], label: 'sleep quality' });
  }
  if (typeof input.timesAwakened === 'number' && Number.isFinite(input.timesAwakened)) {
    parts.push({ weight: 0.10, score: awakeningsToScore(input.timesAwakened), label: 'awakenings' });
  }
  if (input.morningMood) {
    parts.push({ weight: 0.25, score: MORNING_MOOD_SCORE[input.morningMood], label: 'your morning check-in' });
  }

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const weightedScore = parts.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight;

  return {
    score: Math.max(0, Math.min(100, Math.round(weightedScore))),
    inputsUsed: parts.map(part => part.label),
    isLimitedData: parts.length < 4,
  };
}
