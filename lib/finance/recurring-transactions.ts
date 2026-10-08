import {
  isValidLocalDateKey,
  parseLocalDateKey,
  toLocalDateKey,
} from '@/lib/date-utils';
import { toFiniteMoney } from '@/lib/money';
import type {
  BalanceProjectionRecurrence,
  BalanceProjectionRow,
  RecurrenceFrequency,
} from '@/lib/types';

export type RecurringOccurrenceState =
  | 'paused'
  | 'ended'
  | 'overdue'
  | 'due-today'
  | 'upcoming';

const FREQUENCIES: RecurrenceFrequency[] = ['weekly', 'monthly', 'yearly'];

const trimText = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const compareDateKeys = (left: string, right: string) => left.localeCompare(right);

const daysInMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0, 12, 0, 0, 0).getDate();

const dateKeyFor = (year: number, monthIndex: number, day: number) =>
  toLocalDateKey(new Date(
    year,
    monthIndex,
    Math.min(day, daysInMonth(year, monthIndex)),
    12,
    0,
    0,
    0,
  ));

const addLocalDays = (dateKey: string, days: number) => {
  const date = parseLocalDateKey(dateKey);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
};

const firstScheduledDateOnOrAfter = (
  recurrence: BalanceProjectionRecurrence,
  targetDateKey: string,
  strictlyAfter = false,
) => {
  if (!isValidLocalDateKey(recurrence.startDateKey) || !isValidLocalDateKey(targetDateKey)) {
    return '';
  }

  let cursor = recurrence.startDateKey;
  const target = strictlyAfter ? addLocalDays(targetDateKey, 1) : targetDateKey;
  if (!target) return '';

  // This loop only advances date keys and is bounded for the supported
  // frequencies. It avoids UTC arithmetic and preserves monthly anchors.
  for (let index = 0; index < 10000 && compareDateKeys(cursor, target) < 0; index += 1) {
    const next = getNextRecurringDate(recurrence, cursor);
    if (!next || next === cursor) return '';
    cursor = next;
  }
  return cursor;
};

export function normalizeBalanceProjectionRecurrence(
  input: unknown,
): BalanceProjectionRecurrence | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const source = input as Record<string, unknown>;
  const frequency = source.frequency;
  const startDateKey = typeof source.startDateKey === 'string'
    ? source.startDateKey
    : '';
  const endDateKey = typeof source.endDateKey === 'string' && source.endDateKey
    ? source.endDateKey
    : undefined;
  const nextDueDateKey = typeof source.nextDueDateKey === 'string'
    ? source.nextDueDateKey
    : '';
  const walletId = trimText(source.walletId);

  if (!FREQUENCIES.includes(frequency as RecurrenceFrequency)) return undefined;
  if (!walletId || !isValidLocalDateKey(startDateKey)) return undefined;
  if (endDateKey && (!isValidLocalDateKey(endDateKey) || endDateKey < startDateKey)) {
    return undefined;
  }

  const recurrence: BalanceProjectionRecurrence = {
    frequency: frequency as RecurrenceFrequency,
    startDateKey,
    endDateKey,
    nextDueDateKey: isValidLocalDateKey(nextDueDateKey) && nextDueDateKey >= startDateKey
      ? nextDueDateKey
      : startDateKey,
    walletId,
    categoryId: trimText(source.categoryId),
    subcategoryId: trimText(source.subcategoryId),
    payee: trimText(source.payee),
    notes: trimText(source.notes),
  };

  if (recurrence.endDateKey && recurrence.nextDueDateKey > recurrence.endDateKey) {
    return recurrence;
  }
  return recurrence;
}

export function getNextRecurringDate(
  recurrence: BalanceProjectionRecurrence,
  occurrenceDateKey = recurrence.nextDueDateKey,
) {
  const occurrence = parseLocalDateKey(occurrenceDateKey);
  const start = parseLocalDateKey(recurrence.startDateKey);
  if (!occurrence || !start) return '';

  if (recurrence.frequency === 'weekly') {
    return addLocalDays(occurrenceDateKey, 7);
  }

  if (recurrence.frequency === 'monthly') {
    const anchorDay = start.getDate();
    return dateKeyFor(
      occurrence.getFullYear(),
      occurrence.getMonth() + 1,
      anchorDay,
    );
  }

  return dateKeyFor(
    occurrence.getFullYear() + 1,
    start.getMonth(),
    start.getDate(),
  );
}

export function getRecurringOccurrencesBetween(
  recurrence: BalanceProjectionRecurrence,
  startDateKey: string,
  endDateKey: string,
) {
  if (!isValidLocalDateKey(startDateKey) || !isValidLocalDateKey(endDateKey)) return [];
  if (startDateKey > endDateKey) return [];

  let cursor = recurrence.nextDueDateKey;
  if (!isValidLocalDateKey(cursor) || cursor > endDateKey) return [];
  const occurrences: string[] = [];

  for (let index = 0; index < 10000 && cursor <= endDateKey; index += 1) {
    if (recurrence.endDateKey && cursor > recurrence.endDateKey) break;
    if (cursor >= startDateKey) occurrences.push(cursor);
    const next = getNextRecurringDate(recurrence, cursor);
    if (!next || next === cursor) break;
    cursor = next;
  }
  return occurrences;
}

export function getRecurringOccurrenceState(
  row: Pick<BalanceProjectionRow, 'active' | 'recurrence'>,
  todayDateKey = toLocalDateKey(),
): RecurringOccurrenceState | null {
  const recurrence = row.recurrence;
  if (!recurrence || !isValidLocalDateKey(todayDateKey)) return null;
  if (row.active === false) return 'paused';
  if (recurrence.endDateKey && recurrence.nextDueDateKey > recurrence.endDateKey) return 'ended';
  if (recurrence.nextDueDateKey < todayDateKey) return 'overdue';
  if (recurrence.nextDueDateKey === todayDateKey) return 'due-today';
  return 'upcoming';
}

export function advanceRecurringProjectionRow(row: BalanceProjectionRow) {
  if (!row.recurrence) return row;
  const nextDueDateKey = getNextRecurringDate(row.recurrence);
  if (!nextDueDateKey) return row;
  return {
    ...row,
    updatedAt: new Date(),
    recurrence: {
      ...row.recurrence,
      nextDueDateKey,
    },
  };
}

export function resumeRecurringProjectionRow(
  row: BalanceProjectionRow,
  todayDateKey = toLocalDateKey(),
) {
  if (!row.recurrence || !isValidLocalDateKey(todayDateKey)) return row;
  const nextDueDateKey = row.recurrence.nextDueDateKey <= todayDateKey
    ? firstScheduledDateOnOrAfter(row.recurrence, todayDateKey, true)
    : row.recurrence.nextDueDateKey;
  return {
    ...row,
    active: true,
    updatedAt: new Date(),
    recurrence: {
      ...row.recurrence,
      nextDueDateKey: nextDueDateKey || row.recurrence.nextDueDateKey,
    },
  };
}

export function getRecurringForecastAmount(
  row: BalanceProjectionRow,
  monthKey: string,
) {
  if (!row.recurrence || row.active === false || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return 0;
  const [year, month] = monthKey.split('-').map(Number);
  const startDateKey = `${monthKey}-01`;
  const endDateKey = dateKeyFor(year, month - 1, daysInMonth(year, month - 1));
  const occurrenceCount = getRecurringOccurrencesBetween(
    row.recurrence,
    startDateKey,
    endDateKey,
  ).length;
  return Math.max(0, toFiniteMoney(row.amount)) * occurrenceCount;
}

export function getRecurringDateOnOrAfter(
  recurrence: BalanceProjectionRecurrence,
  targetDateKey: string,
) {
  return firstScheduledDateOnOrAfter(recurrence, targetDateKey);
}
