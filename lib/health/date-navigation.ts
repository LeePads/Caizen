import { formatLocalDateInput, parseLocalDateInput } from '@/lib/date-utils';

/** Keeps Health day navigation on or before the current local day. */
export function shiftHealthDate(
  dateKey: string,
  days: number,
  maxDateKey: string,
) {
  const nextDate = parseLocalDateInput(dateKey) || parseLocalDateInput(maxDateKey) || new Date();
  nextDate.setDate(nextDate.getDate() + days);
  const nextKey = formatLocalDateInput(nextDate);
  return nextKey > maxDateKey ? maxDateKey : nextKey;
}

export function clampHealthDate(dateKey: string, maxDateKey: string) {
  return dateKey && dateKey <= maxDateKey ? dateKey : maxDateKey;
}
