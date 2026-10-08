import { toFiniteMoney } from '@/lib/money';
import type { InventoryItem } from '@/lib/types';

/**
 * Inventory keeps these two persisted fields for historical compatibility.
 * The user-facing meaning is intentionally explicit here so UI/report code
 * does not accidentally reinterpret the stored values.
 */
export function getInventoryPurchaseCost(item: Pick<InventoryItem, 'currentPrice'>): number {
  return getKnownMoney(item.currentPrice) ?? 0;
}

export function getInventoryCurrentValue(item: Pick<InventoryItem, 'purchasePrice'>): number {
  return getKnownMoney(item.purchasePrice) ?? 0;
}

export function getInventoryPurchaseCostIfKnown(item: Pick<InventoryItem, 'currentPrice'>): number | null {
  return getKnownMoney(item.currentPrice);
}

export function getInventoryCurrentValueIfKnown(item: Pick<InventoryItem, 'purchasePrice'>): number | null {
  return getKnownMoney(item.purchasePrice);
}

export function getInventoryQuantity(item: Pick<InventoryItem, 'quantity'>): number {
  const quantity = Number(item.quantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

/** Savings per unit: estimated current value minus what the user paid. */
export function getInventorySavingsPerUnit(item: InventoryItem): number | null {
  const purchaseCost = getInventoryPurchaseCostIfKnown(item);
  const currentValue = getInventoryCurrentValueIfKnown(item);
  if (purchaseCost === null || currentValue === null) return null;
  return toFiniteMoney(currentValue - purchaseCost);
}

/** Quantity-weighted savings for one inventory record. */
export function getInventorySavingsTotal(item: InventoryItem): number | null {
  const savingsPerUnit = getInventorySavingsPerUnit(item);
  return savingsPerUnit === null
    ? null
    : toFiniteMoney(savingsPerUnit * getInventoryQuantity(item));
}

/**
 * Aggregate only records with both source values present. Missing values are
 * not treated as zero and do not make the aggregate look more precise.
 */
export function sumInventorySavings(items: InventoryItem[]): number | null {
  const knownSavings = items
    .map(getInventorySavingsTotal)
    .filter((value): value is number => value !== null);

  return knownSavings.length
    ? toFiniteMoney(knownSavings.reduce((sum, value) => sum + value, 0))
    : null;
}

function getKnownMoney(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? toFiniteMoney(number) : null;
}
