import type {
  UpcomingMoneyDirection,
  UpcomingMoneyItem,
  UpcomingMoneyStatus,
} from './types';
import {
  isValidLocalDateKey,
  parseLocalDateKey,
  parseLocalDateValue,
  toLocalDateKey,
} from './date-utils';
import { addMoney, sumMoney, toFiniteMoney } from './money';

const COMPLETED_STATUSES = new Set<UpcomingMoneyStatus>([
  'paid',
  'received',
  'cancelled',
]);

export const toMoneyNumber = (value: unknown): number => {
  return Math.max(0, toFiniteMoney(value));
};

const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const isValidUpcomingMoneyReminderTime = (
  value: unknown,
): value is string =>
  typeof value === 'string' && LOCAL_TIME_PATTERN.test(value.trim());

export const normalizeUpcomingMoneyReminderDate = (
  value: unknown,
): string | undefined => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : toLocalDateKey(value);
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return isValidLocalDateKey(trimmed) ? trimmed : undefined;
};

export const normalizeUpcomingMoneyReminderTime = (
  value: unknown,
): string | undefined => {
  if (!isValidUpcomingMoneyReminderTime(value)) return undefined;
  return value.trim();
};

/** Combines a stored local reminder date and wall-clock time without UTC parsing. */
export const getUpcomingMoneyReminderAt = (
  reminderDate: unknown,
  reminderTime: unknown,
): Date | null => {
  const dateKey = normalizeUpcomingMoneyReminderDate(reminderDate);
  const time = normalizeUpcomingMoneyReminderTime(reminderTime);
  if (!dateKey || !time) return null;
  const date = parseLocalDateKey(dateKey);
  if (!date) return null;
  const [hour, minute] = time.split(':').map(Number);
  date.setHours(hour, minute, 0, 0);
  return date.getHours() === hour && date.getMinutes() === minute ? date : null;
};

export const startOfLocalDay = (value: Date | string | number = new Date()) => {
  const date = parseLocalDateValue(value);
  if (!date) return new Date(Number.NaN);
  date.setHours(0, 0, 0, 0);
  return date;
};

const normalizeOptionalDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const date =
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? parseLocalDateValue(value)
      : null;
  return date || undefined;
};

export const normalizeUpcomingMoneyItem = (
  input: Partial<UpcomingMoneyItem> &
    Pick<UpcomingMoneyItem, 'id' | 'title' | 'direction'>,
): UpcomingMoneyItem => {
  const amount = toMoneyNumber(input.amount);
  const recordedAmount = Math.min(amount, toMoneyNumber(input.recordedAmount));
  const direction: UpcomingMoneyDirection =
    input.direction === 'incoming' ? 'incoming' : 'outgoing';

  let status: UpcomingMoneyStatus = input.status || 'planned';
  if (status !== 'cancelled') {
    if (recordedAmount >= amount && amount > 0) {
      status = direction === 'incoming' ? 'received' : 'paid';
    } else if (recordedAmount > 0) {
      status = 'partially-paid';
    } else if (status === 'paid' || status === 'received') {
      status = 'planned';
    }
  }

  const completed = COMPLETED_STATUSES.has(status);
  const reminderDate = normalizeUpcomingMoneyReminderDate(input.reminderDate);
  const reminderTime = normalizeUpcomingMoneyReminderTime(input.reminderTime);
  const reminderEnabled =
    input.reminderEnabled === true && Boolean(reminderDate && reminderTime);

  return {
    id: input.id,
    title: input.title.trim() || 'Untitled money item',
    direction,
    amount,
    dueDate: normalizeOptionalDate(input.dueDate),
    person: input.person?.trim() || undefined,
    category: input.category || 'other',
    walletId: input.walletId || undefined,
    status,
    recordedAmount,
    reserveFunds:
      direction === 'outgoing' ? input.reserveFunds !== false : false,
    reminderEnabled,
    reminderDate: reminderEnabled ? reminderDate : undefined,
    reminderTime: reminderEnabled ? reminderTime : undefined,
    linkedWishlistItemId: input.linkedWishlistItemId || undefined,
    linkedInventoryItemId: input.linkedInventoryItemId || undefined,
    notes: input.notes?.trim() || undefined,
    archived: Boolean(input.archived),
    completedAt: completed
      ? normalizeOptionalDate(input.completedAt) || new Date()
      : undefined,
    createdAt: normalizeOptionalDate(input.createdAt) || new Date(),
    updatedAt: normalizeOptionalDate(input.updatedAt) || new Date(),
  };
};

export const getUpcomingMoneyRemaining = (item: UpcomingMoneyItem): number =>
  Math.max(
    0,
    toMoneyNumber(item.amount) - toMoneyNumber(item.recordedAmount),
  );

export const isUpcomingMoneyComplete = (item: UpcomingMoneyItem): boolean =>
  COMPLETED_STATUSES.has(item.status) ||
  (toMoneyNumber(item.amount) > 0 && getUpcomingMoneyRemaining(item) <= 0);

export const getUpcomingMoneyStatus = (
  item: UpcomingMoneyItem,
  now: Date = new Date(),
): UpcomingMoneyStatus => {
  if (isUpcomingMoneyComplete(item)) {
    if (item.status === 'cancelled') return 'cancelled';
    return item.direction === 'incoming' ? 'received' : 'paid';
  }

  if (
    item.dueDate &&
    startOfLocalDay(item.dueDate).getTime() < startOfLocalDay(now).getTime()
  ) {
    return 'overdue';
  }

  return toMoneyNumber(item.recordedAmount) > 0
    ? 'partially-paid'
    : 'planned';
};

export const applyUpcomingMoneyProgress = (
  item: UpcomingMoneyItem,
  increment: number,
  at: Date = new Date(),
): UpcomingMoneyItem => {
  const nextRecorded = Math.min(
    toMoneyNumber(item.amount),
    addMoney(toMoneyNumber(item.recordedAmount), toMoneyNumber(increment)),
  );
  const complete = item.amount > 0 && nextRecorded >= item.amount;

  return normalizeUpcomingMoneyItem({
    ...item,
    recordedAmount: nextRecorded,
    status: complete
      ? item.direction === 'incoming'
        ? 'received'
        : 'paid'
      : nextRecorded > 0
        ? 'partially-paid'
        : 'planned',
    archived: complete ? true : item.archived,
    completedAt: complete ? at : undefined,
    updatedAt: at,
  });
};

export const restoreUpcomingMoneyItem = (
  item: UpcomingMoneyItem,
  at: Date = new Date(),
): UpcomingMoneyItem =>
  normalizeUpcomingMoneyItem({
    ...item,
    status: 'planned',
    recordedAmount: 0,
    archived: false,
    completedAt: undefined,
    updatedAt: at,
  });

export const summarizeUpcomingMoney = (
  items: UpcomingMoneyItem[],
  now: Date = new Date(),
) => {
  const active = items.filter(
    item => !item.archived && !isUpcomingMoneyComplete(item),
  );
  const outgoing = active.filter(item => item.direction === 'outgoing');
  const incoming = active.filter(item => item.direction === 'incoming');
  const completed = items
    .filter(isUpcomingMoneyComplete)
    .sort(
      (a, b) =>
        new Date(b.completedAt || b.updatedAt).getTime() -
        new Date(a.completedAt || a.updatedAt).getTime(),
    );

  const outgoingRemaining = sumMoney(outgoing.map(getUpcomingMoneyRemaining));
  const reservedOutgoing = outgoing
    .filter(item => item.reserveFunds !== false)
    .reduce(
      (sum, item) => addMoney(sum, getUpcomingMoneyRemaining(item)),
      0,
    );
  const unreservedOutgoing = Math.max(0, outgoingRemaining - reservedOutgoing);
  const incomingRemaining = sumMoney(incoming.map(getUpcomingMoneyRemaining));
  const overdueCount = active.filter(
    item => getUpcomingMoneyStatus(item, now) === 'overdue',
  ).length;

  return {
    active,
    outgoing,
    incoming,
    completed,
    outgoingRemaining,
    reservedOutgoing,
    unreservedOutgoing,
    incomingRemaining,
    overdueCount,
    completedCount: completed.length,
  };
};
