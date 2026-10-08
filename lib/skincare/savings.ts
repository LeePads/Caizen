import type { SkincareProduct } from '@/lib/types';

export type SkincareSavings = {
  amount: number;
  comparableProducts: number;
};

/**
 * Calculates the net price difference without allowing malformed legacy
 * values to poison the dashboard. Positive values mean the shelf is worth
 * more than it cost; negative values mean the recorded purchase was higher.
 */
export function calculateSkincareSavings(
  products: readonly SkincareProduct[],
): SkincareSavings {
  return products.reduce<SkincareSavings>((result, product) => {
    if (!product || typeof product !== 'object') return result;
    if (product.purchasePrice === undefined || product.purchasePrice === null ||
        product.currentPrice === undefined || product.currentPrice === null) return result;
    const purchase = Number(product.purchasePrice);
    const current = Number(product.currentPrice);
    if (!Number.isFinite(purchase) || purchase < 0) return result;
    if (!Number.isFinite(current) || current < 0) return result;

    return {
      amount: result.amount + current - purchase,
      comparableProducts: result.comparableProducts + 1,
    };
  }, { amount: 0, comparableProducts: 0 });
}
