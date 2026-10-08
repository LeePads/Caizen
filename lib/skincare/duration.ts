import type { SkincareProduct } from '@/lib/types';

function localDay(value: Date | string): Date {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function differenceInCalendarDays(later: Date, earlier: Date): number {
  const utcLater = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  const utcEarlier = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  return Math.round((utcLater - utcEarlier) / 86_400_000);
}

/**
 * Days used for one purchase cycle: start date through today while the
 * cycle is active, or start date through the emptied date once it's
 * finished. This is the single source of truth behind both the "in use"
 * (active) and "actual duration" (finished) figures shown in the UI.
 */
export function getSkincareCycleDaysUsed(product: SkincareProduct, now = new Date()): number | null {
  const isFinished = product.status === 'emptied';
  if (!product.startDate || (isFinished && !product.emptiedAt)) return null;
  const startDate = localDay(product.startDate);
  const endDate = localDay(isFinished && product.emptiedAt ? product.emptiedAt : now);
  const elapsedDays = differenceInCalendarDays(endDate, startDate);
  if (!Number.isFinite(elapsedDays) || elapsedDays < 0) return null;
  return elapsedDays + 1;
}

/** A cycle's final duration, only meaningful once it has actually finished. */
export function getSkincareCompletedCycleDuration(product: SkincareProduct, now = new Date()): number | null {
  if (product.status !== 'emptied') return null;
  return getSkincareCycleDaysUsed(product, now);
}

/**
 * Walks the repurchase chain backward from `product` via `repurchaseOfProductId`,
 * returning every earlier cycle of the same product (most recent prior cycle first).
 * Guards against cyclical/self-referential links in imported or corrupted data.
 */
export function getSkincarePurchaseHistoryChain(
  product: SkincareProduct,
  allProducts: readonly SkincareProduct[],
): SkincareProduct[] {
  const byId = new Map(allProducts.map(item => [item.id, item]));
  const chain: SkincareProduct[] = [];
  const seen = new Set<string>([product.id]);
  let cursor = product.repurchaseOfProductId ? byId.get(product.repurchaseOfProductId) : undefined;
  while (cursor && !seen.has(cursor.id)) {
    chain.push(cursor);
    seen.add(cursor.id);
    cursor = cursor.repurchaseOfProductId ? byId.get(cursor.repurchaseOfProductId) : undefined;
  }
  return chain;
}

/**
 * The product's typical usage duration in days, derived from every completed
 * cycle in its repurchase chain (itself, if finished, plus every prior
 * cycle), as a simple average. Falls back to the legacy `estimatedDuration`
 * field when there is no completed history to derive from.
 */
export function getSkincareTypicalDurationDays(
  product: SkincareProduct,
  allProducts: readonly SkincareProduct[],
  now = new Date(),
): number | null {
  const chain = [product, ...getSkincarePurchaseHistoryChain(product, allProducts)];
  const durations = chain
    .map(item => getSkincareCompletedCycleDuration(item, now))
    .filter((value): value is number => value !== null);
  if (durations.length > 0) {
    return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
  }
  return product.estimatedDuration ?? null;
}
