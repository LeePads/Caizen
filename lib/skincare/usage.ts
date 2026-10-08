import type { Profile, SkincareProduct, SkincareUsageEvent, SkincareUsageSource } from '@/lib/types';
import { createEntityId } from '@/lib/utils';

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function normalizeSkincareUsageEvent(input: unknown, now = new Date()): SkincareUsageEvent | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const productId = typeof value.productId === 'string' && value.productId.trim() ? value.productId.trim() : undefined;
  const usedAtValue = value.usedAt instanceof Date ? value.usedAt : new Date(value.usedAt as string | number);
  if (!productId || Number.isNaN(usedAtValue.getTime())) return null;
  const createdAtValue = value.createdAt instanceof Date ? value.createdAt : new Date(value.createdAt as string | number);
  const createdAt = Number.isNaN(createdAtValue.getTime()) ? new Date(now) : createdAtValue;
  const source: SkincareUsageSource = value.source === 'routine' ? 'routine' : 'manual';
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : createEntityId('skincare-use');
  return {
    ...value,
    id,
    productId,
    usedAt: new Date(usedAtValue),
    source,
    routineId: typeof value.routineId === 'string' && value.routineId.trim() ? value.routineId.trim() : undefined,
    routineCompletionId: typeof value.routineCompletionId === 'string' && value.routineCompletionId.trim() ? value.routineCompletionId.trim() : undefined,
    productNameSnapshot: typeof value.productNameSnapshot === 'string' && value.productNameSnapshot.trim() ? value.productNameSnapshot.trim() : undefined,
    createdAt: new Date(createdAt),
  };
}

export function normalizeSkincareUsageEvents(input: unknown, now = new Date()): SkincareUsageEvent[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.flatMap(item => {
    const event = normalizeSkincareUsageEvent(item, now);
    if (!event || seen.has(event.id)) return [];
    seen.add(event.id);
    return [event];
  });
}

export function routineSkincareUsageEventId(routineCompletionId: string, productId: string): string {
  return `skincare-routine-use:${routineCompletionId}:${productId}`;
}

export function getSkincareUsageEventsForProduct(events: readonly SkincareUsageEvent[], productId: string): SkincareUsageEvent[] {
  return events
    .filter(event => event.productId === productId)
    .sort((left, right) => right.usedAt.getTime() - left.usedAt.getTime());
}

export function getSkincareUsageSummary(events: readonly SkincareUsageEvent[], productId: string, now = new Date()) {
  const productEvents = getSkincareUsageEventsForProduct(events, productId);
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const todayUses = productEvents.filter(event => {
    const date = event.usedAt;
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` === todayKey;
  }).length;
  return {
    todayUses,
    totalUses: productEvents.length,
    lastUsedAt: productEvents[0]?.usedAt,
  };
}

export type SkincareUsageRange = 'daily' | 'weekly' | 'monthly';

export type SkincareUsageBucket = { key: string; start: Date; end: Date; count: number };

export type SkincareUsageOverallSummary = {
  totalUses: number;
  todayUses: number;
  weekUses: number;
  monthUses: number;
  lastUsedAt?: Date;
  mostUsedProduct?: {
    productId: string;
    productName: string;
    count: number;
  };
};

function localDayStart(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
}

function currentWeekStart(value: Date): Date {
  const start = localDayStart(value);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function currentMonthStart(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function usageBucketStart(value: Date, range: SkincareUsageRange): Date {
  if (range === 'daily') return localDayStart(value);
  if (range === 'weekly') return currentWeekStart(value);
  return currentMonthStart(value);
}

function addUsageBucketUnits(value: Date, range: SkincareUsageRange, amount: number): Date {
  const next = new Date(value);
  if (range === 'daily') next.setDate(next.getDate() + amount);
  else if (range === 'weekly') next.setDate(next.getDate() + amount * 7);
  else next.setMonth(next.getMonth() + amount);
  return next;
}

function usageBucketDistance(start: Date, end: Date, range: SkincareUsageRange): number {
  let count = 0;
  let cursor = new Date(start);
  while (cursor < end) {
    cursor = addUsageBucketUnits(cursor, range, 1);
    count += 1;
  }
  return count;
}

export function getSkincareUsagePeriod(
  range: SkincareUsageRange,
  now = new Date(),
): { start: Date; end: Date } {
  const today = localDayStart(now);
  const start = range === 'daily'
    ? new Date(today)
    : range === 'weekly'
      ? currentWeekStart(today)
      : currentMonthStart(today);

  if (range === 'daily') start.setDate(start.getDate() - 29);
  if (range === 'weekly') start.setDate(start.getDate() - 11 * 7);
  if (range === 'monthly') start.setMonth(start.getMonth() - 11);

  const end = new Date(today);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function getSkincareUsageEventsForPeriod(
  events: readonly SkincareUsageEvent[],
  range: SkincareUsageRange,
  now = new Date(),
): SkincareUsageEvent[] {
  const { start, end } = getSkincareUsagePeriod(range, now);
  return events
    .filter(event => event.usedAt >= start && event.usedAt < end)
    .sort((left, right) => right.usedAt.getTime() - left.usedAt.getTime());
}

export function getSkincareUsageOverallSummary(
  events: readonly SkincareUsageEvent[],
  products: readonly SkincareProduct[],
  range: SkincareUsageRange,
  now = new Date(),
): SkincareUsageOverallSummary {
  const periodEvents = getSkincareUsageEventsForPeriod(events, range, now);
  const productNames = new Map(products.map(product => [product.id, product.name]));
  const counts = new Map<string, { productName: string; count: number; lastUsedAt: Date }>();

  periodEvents.forEach(event => {
    const previous = counts.get(event.productId);
    const productName = productNames.get(event.productId) || event.productNameSnapshot || 'Deleted product';
    counts.set(event.productId, {
      productName,
      count: (previous?.count || 0) + 1,
      lastUsedAt: previous?.lastUsedAt || event.usedAt,
    });
  });

  const mostUsed = [...counts.entries()].sort((left, right) =>
    right[1].count - left[1].count ||
    right[1].lastUsedAt.getTime() - left[1].lastUsedAt.getTime() ||
    left[1].productName.localeCompare(right[1].productName),
  )[0];
  const weekStart = currentWeekStart(now);
  const monthStart = currentMonthStart(now);

  return {
    totalUses: periodEvents.length,
    todayUses: periodEvents.filter(event => isSameLocalDay(event.usedAt, now)).length,
    weekUses: periodEvents.filter(event => event.usedAt >= weekStart).length,
    monthUses: periodEvents.filter(event => event.usedAt >= monthStart).length,
    lastUsedAt: periodEvents[0]?.usedAt,
    mostUsedProduct: mostUsed
      ? { productId: mostUsed[0], productName: mostUsed[1].productName, count: mostUsed[1].count }
      : undefined,
  };
}

/** Returns bounded local-calendar buckets around the selected period's activity. */
export function getSkincareUsageBuckets(
  events: readonly SkincareUsageEvent[],
  productId: string,
  range: SkincareUsageRange,
  now = new Date(),
): SkincareUsageBucket[] {
  return getSkincareUsageBucketsForEvents(
    events.filter(event => event.productId === productId),
    range,
    now,
  );
}

export function getSkincareUsageBucketsForEvents(
  events: readonly SkincareUsageEvent[],
  range: SkincareUsageRange,
  now = new Date(),
): SkincareUsageBucket[] {
  const { start: periodStart, end: periodEnd } = getSkincareUsagePeriod(range, now);
  const periodEvents = events.filter(event => event.usedAt >= periodStart && event.usedAt < periodEnd);
  if (!periodEvents.length) return [];

  const earliestEvent = periodEvents.reduce((earliest, event) => event.usedAt < earliest.usedAt ? event : earliest);
  const latestEvent = periodEvents.reduce((latest, event) => event.usedAt > latest.usedAt ? event : latest);
  const earliestBucket = usageBucketStart(earliestEvent.usedAt, range);
  const latestBucket = usageBucketStart(latestEvent.usedAt, range);
  const activitySpan = usageBucketDistance(earliestBucket, latestBucket, range) + 1;
  const minimumBuckets = range === 'monthly' ? 3 : 4;
  const maximumBuckets = range === 'daily' ? 14 : range === 'weekly' ? 8 : 6;
  const bucketCount = Math.min(maximumBuckets, Math.max(minimumBuckets, activitySpan + 2));
  const periodStartBucket = usageBucketStart(periodStart, range);
  let chartStart = addUsageBucketUnits(latestBucket, range, -(bucketCount - 1));
  if (chartStart < periodStartBucket) chartStart = periodStartBucket;
  const visibleBucketCount = usageBucketDistance(chartStart, latestBucket, range) + 1;
  const buckets: SkincareUsageBucket[] = [];
  const keyFor = (date: Date) => {
    if (range === 'monthly') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (range === 'weekly') {
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      return `week:${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    }
    return `day:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const addBucket = (start: Date, end: Date) => {
    const key = keyFor(start);
    buckets.push({ key, start, end, count: periodEvents.filter(event => event.usedAt >= start && event.usedAt < end).length });
  };
  for (let index = 0; index < visibleBucketCount; index += 1) {
    const start = addUsageBucketUnits(chartStart, range, index);
    const end = addUsageBucketUnits(start, range, 1);
    addBucket(start, end);
  }
  return buckets;
}

export const deriveSkincareUsageBuckets = getSkincareUsageBuckets;

export function addSkincareUsageEvent(
  profile: Profile,
  input: Omit<SkincareUsageEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: Date },
): Profile {
  const usedAt = validDate(input.usedAt) ? input.usedAt : new Date();
  const event = normalizeSkincareUsageEvent({ ...input, id: input.id || createEntityId('skincare-use'), usedAt, createdAt: input.createdAt || new Date() });
  if (!event) return profile;
  const existing = profile.skincareUsageEvents || [];
  if (existing.some(item => item.id === event.id)) return profile;
  return { ...profile, skincareUsageEvents: [...existing, event] };
}
