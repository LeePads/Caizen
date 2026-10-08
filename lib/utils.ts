import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { toLocalDateKey as toSharedLocalDateKey } from './date-utils'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function createEntityId(prefix: string): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}

export const formatLabel = (value: string): string =>
  value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

/**
 * `YYYY-MM-DD` for the LOCAL calendar day.
 *
 * Always use this instead of `toISOString().split('T')[0]`, which returns the
 * UTC day. In UTC+08:00 every timestamp before 08:00 UTC falls on the previous
 * UTC day, so UTC bucketing silently files records under the wrong date and
 * makes same-day entries appear split (or different days appear merged).
 *
 * Returns an empty string for missing or unparseable input so it can be bound
 * directly to a date input's `value`.
 */
export function toLocalDateKey(value: Date | string | number | null | undefined): string {
  return toSharedLocalDateKey(value);
}
