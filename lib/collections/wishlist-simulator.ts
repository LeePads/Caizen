export interface WishlistBudgetMetrics {
  remaining: number;
  usagePercent: number;
  displayProgressPercent: number;
  isOverBudget: boolean;
}

/**
 * Derives display-safe budget state without changing the underlying amounts.
 * The raw usage percentage remains available for logic, while the progress
 * value is always finite and capped for CSS rendering.
 */
export function calculateWishlistBudgetMetrics(
  availableFunds: number,
  selectedTotal: number,
): WishlistBudgetMetrics {
  const remaining = availableFunds - selectedTotal;
  const isOverBudget = remaining < 0;
  const usagePercent = availableFunds > 0
    ? (selectedTotal / availableFunds) * 100
    : selectedTotal > 0
      ? Number.POSITIVE_INFINITY
      : 0;
  const displayProgressPercent = Math.min(
    Math.max(Number.isFinite(usagePercent) ? usagePercent : isOverBudget ? 100 : 0, 0),
    100,
  );

  return {
    remaining,
    usagePercent,
    displayProgressPercent,
    isOverBudget,
  };
}
