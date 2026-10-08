export const DAY_MS = 86_400_000;

export function isValidLocalDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
  return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day;
}

export function parseLocalDateKey(value?: string | null): Date | null {
  if (!value) return null;
  if (isValidLocalDateKey(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Parses a persisted or form value without letting a bare calendar date enter
 * JavaScript's UTC date parser. Full timestamps remain instants.
 */
export function parseLocalDateValue(
  value: Date | string | number | null | undefined,
): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseLocalDateKey(value);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toLocalDateKey(value: Date | string | number | null | undefined = new Date()): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return isValidLocalDateKey(value) ? value : '';
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? NaN);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const formatLocalDateInput = (
  date: Date | string | number | null | undefined,
): string => toLocalDateKey(date);

export const parseLocalDateInput = (value: string): Date =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseLocalDateKey(value) ?? new Date(Number.NaN)
    : new Date(Number.NaN);

export const parseLocalDateInputOrUndefined = (value: string): Date | undefined =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseLocalDateKey(value) ?? undefined : undefined;

/** Local wall-clock date/time input. Unlike an ISO timestamp, no offset is
 * implied: 09:30 means 09:30 in the user's current local timezone. */
export function parseLocalDateTimeInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return new Date(Number.NaN);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText || 0);
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second
    ? date
    : new Date(Number.NaN);
}

export function formatLocalDateTimeInput(
  value: Date | string | number | null | undefined,
): string {
  const date = parseLocalDateValue(value);
  if (!date) return '';
  return `${toLocalDateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
