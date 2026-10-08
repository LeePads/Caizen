import type { HealthProfile } from '../types';
import { parseLocalDateValue } from '../date-utils';

export type HealthDateRange = {
  start?: Date | null;
  end?: Date | null;
};

/**
 * Health collections whose records represent dated activity or dated
 * completion state. Reusable templates, plans, targets, and tracker history
 * are intentionally not inferred from their createdAt fields: deleting a
 * date range must not remove a reusable definition just because it was made
 * during that range.
 */
export const HEALTH_DATE_SCOPED_COLLECTIONS = [
  'weightEntries',
  'waterEntries',
  'bodyMeasurementEntries',
  'nutritionEntries',
  'foodEntries',
  'foodLogCompletedDates',
  'foodLogExcludedDates',
  'activityEntries',
  'fastingSessions',
  'workoutSessions',
  'sleepEntries',
  'noXTrackers',
] as const;

export type HealthDateScopedCollection =
  (typeof HEALTH_DATE_SCOPED_COLLECTIONS)[number];

export type HealthDateRangeDeletion = {
  health: HealthProfile;
  deletedCount: number;
  deletedByCollection: Partial<Record<HealthDateScopedCollection, number>>;
};

const dateValueFor = (collection: HealthDateScopedCollection, item: unknown) => {
  if (collection === 'foodLogCompletedDates' || collection === 'foodLogExcludedDates') {
    return typeof item === 'string' ? item : null;
  }

  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  if (collection === 'workoutSessions' || collection === 'fastingSessions') return record.startedAt;
  return record[collection === 'noXTrackers' ? 'startDate' : 'date'];
};

const timestampFor = (value: unknown) => {
  if (!value) return null;
  const date = parseLocalDateValue(value as Date | string | number);
  return date ? date.getTime() : null;
};

export function isHealthDateInRange(value: unknown, range: HealthDateRange) {
  const timestamp = timestampFor(value);
  if (timestamp === null) return false;

  const start = range.start?.getTime();
  const end = range.end?.getTime();
  if (start !== undefined && start !== null && timestamp < start) return false;
  if (end !== undefined && end !== null && timestamp > end) return false;
  return start !== undefined || end !== undefined;
}

export function deleteHealthDataInDateRange(
  health: HealthProfile,
  range: HealthDateRange,
): HealthDateRangeDeletion {
  const nextHealth = { ...health } as HealthProfile & Record<string, unknown>;
  const deletedByCollection: Partial<Record<HealthDateScopedCollection, number>> = {};
  let deletedCount = 0;

  for (const collection of HEALTH_DATE_SCOPED_COLLECTIONS) {
    const values = Array.isArray(nextHealth[collection])
      ? (nextHealth[collection] as unknown[])
      : [];
    let deletedInCollection = 0;
    const retained = values.filter((item) => {
      if (!isHealthDateInRange(dateValueFor(collection, item), range)) return true;
      deletedInCollection += 1;
      return false;
    });

    (nextHealth as Record<string, unknown>)[collection] = retained;
    if (deletedInCollection > 0) {
      deletedByCollection[collection] = deletedInCollection;
      deletedCount += deletedInCollection;
    }
  }

  return {
    health: nextHealth,
    deletedCount,
    deletedByCollection,
  };
}

export function countHealthDataInDateRange(
  health: HealthProfile,
  range: HealthDateRange,
) {
  return deleteHealthDataInDateRange(health, range).deletedCount;
}
