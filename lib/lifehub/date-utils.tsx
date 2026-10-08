import {
  DAY_MS,
  formatLocalDateTimeInput,
  parseLocalDateInput,
  parseLocalDateKey,
  parseLocalDateTimeInput,
  parseLocalDateValue,
  toLocalDateKey,
} from '../date-utils';

export {
  DAY_MS,
  formatLocalDateTimeInput,
  parseLocalDateInput,
  parseLocalDateKey,
  parseLocalDateTimeInput,
  parseLocalDateValue,
  toLocalDateKey,
};

export function startOfLocalDay(value: Date | string | number = new Date()): Date {
  const parsed = parseLocalDateValue(value);
  const date = !parsed || Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfLocalDay(value: Date | string | number = new Date()): Date {
  const date = startOfLocalDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function addLocalDays(value: Date | string | number, amount: number): Date {
  const date = startOfLocalDay(value);
  date.setDate(date.getDate() + amount);
  return date;
}

/** Shift by calendar month while clamping to the target month's final day. */
export function addLocalMonthsClamped(
  value: Date | string | number,
  amount: number,
  preferredDay = startOfLocalDay(value).getDate(),
): Date {
  const date = startOfLocalDay(value);
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  return new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(Math.max(1, preferredDay), lastDay), 12);
}

export function differenceInCalendarDays(
  later: Date | string | number,
  earlier: Date | string | number,
): number {
  const a = startOfLocalDay(later);
  const b = startOfLocalDay(earlier);
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((aUtc - bUtc) / DAY_MS);
}

export function daysFromToday(value: Date | string | number): number {
  return differenceInCalendarDays(value, new Date());
}

export function isSameLocalDay(
  a: Date | string | number,
  b: Date | string | number = new Date(),
): boolean {
  return toLocalDateKey(a) === toLocalDateKey(b);
}

export function startOfWeek(value: Date | string | number, weekStartsOn = 1): Date {
  const date = startOfLocalDay(value);
  const distance = (date.getDay() - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - distance);
  return date;
}

export function isSameCalendarWeek(
  a: Date | string | number,
  b: Date | string | number,
  weekStartsOn = 1,
): boolean {
  return toLocalDateKey(startOfWeek(a, weekStartsOn)) === toLocalDateKey(startOfWeek(b, weekStartsOn));
}

export function isSameCalendarMonth(
  a: Date | string | number,
  b: Date | string | number,
): boolean {
  const left = parseLocalDateValue(a);
  const right = parseLocalDateValue(b);
  if (!left || !right) return false;
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

export function getMonthGrid(month: Date, weekStartsOn: 0 | 1 = 0): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const start = new Date(first);
  const leadingDays = (first.getDay() - weekStartsOn + 7) % 7;
  start.setDate(first.getDate() - leadingDays);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

/**
 * Resolves what a month-grid day click should do: select the exact clicked
 * date (never a day-of-month number recombined with the currently displayed
 * month) and re-center the visible month on that date's own year/month.
 *
 * Centralized here so every calendar surface that lets a user click a
 * leading/trailing (adjacent-month) day cell derives the same, correct
 * behavior from a single, unit-tested source instead of re-deriving it
 * ad hoc per screen.
 */
export function resolveCalendarDaySelection(date: Date): {
  selectedDay: Date;
  calendarMonth: Date;
} {
  const selectedDay = startOfLocalDay(date);
  const calendarMonth = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1, 12);
  return { selectedDay, calendarMonth };
}

export function formatRelativeDate(value: Date | string | number): string {
  const days = daysFromToday(value);
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return 'Yesterday';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  const date = parseLocalDateValue(value);
  if (!date) return 'No date';
  if (days <= 6) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDate(value: Date | string | number): string {
  const date = parseLocalDateValue(value);
  if (!date) return 'No date';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function nextMonday(from = new Date()): Date {
  const date = startOfLocalDay(from);
  const daysUntilMonday = ((8 - date.getDay()) % 7) || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return date;
}
