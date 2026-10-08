import { describe, expect, it } from 'vitest';

import { calculateWishlistBudgetMetrics } from '@/lib/collections/wishlist-simulator';

describe('wishlist plan simulator budget metrics', () => {
  it('keeps remaining funds and normal usage within budget', () => {
    expect(calculateWishlistBudgetMetrics(1000, 280)).toMatchObject({
      remaining: 720,
      isOverBudget: false,
    });
    expect(calculateWishlistBudgetMetrics(1000, 280).usagePercent).toBeCloseTo(28, 10);
    expect(calculateWishlistBudgetMetrics(1000, 280).displayProgressPercent).toBeCloseTo(28, 10);
  });

  it('treats an exact budget match as remaining with a full progress bar', () => {
    expect(calculateWishlistBudgetMetrics(1000, 1000)).toEqual({
      remaining: 0,
      usagePercent: 100,
      displayProgressPercent: 100,
      isOverBudget: false,
    });
  });

  it('reports the absolute overage while capping extreme progress values', () => {
    const metrics = calculateWishlistBudgetMetrics(33_811.93, 9_999_999_999);

    expect(metrics.remaining).toBe(-9_999_966_187.07);
    expect(metrics.isOverBudget).toBe(true);
    expect(metrics.usagePercent).toBeGreaterThan(100);
    expect(metrics.displayProgressPercent).toBe(100);
  });

  it('handles zero available funds without exposing an invalid percentage', () => {
    expect(calculateWishlistBudgetMetrics(0, 500)).toMatchObject({
      remaining: -500,
      usagePercent: Number.POSITIVE_INFINITY,
      displayProgressPercent: 100,
      isOverBudget: true,
    });
    expect(calculateWishlistBudgetMetrics(0, 0)).toEqual({
      remaining: 0,
      usagePercent: 0,
      displayProgressPercent: 0,
      isOverBudget: false,
    });
  });
});
