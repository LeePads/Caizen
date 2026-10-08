import type { Supplement } from '@/lib/types';

export function getSupplementEstimatedDailyCost(supplement: Supplement): number | null {
  const purchasePrice = Number(supplement.purchasePrice);
  const dosageAmount = Number(supplement.dosageAmount);
  const dailyIntake = Number(supplement.dailyIntake);

  if (
    !Number.isFinite(purchasePrice) ||
    purchasePrice <= 0 ||
    !Number.isFinite(dosageAmount) ||
    dosageAmount <= 0 ||
    !Number.isFinite(dailyIntake) ||
    dailyIntake <= 0
  ) {
    return null;
  }

  const dailyCost = (purchasePrice * dailyIntake) / dosageAmount;
  return Number.isFinite(dailyCost) && dailyCost >= 0 ? dailyCost : null;
}

export function getSupplementEstimatedMonthlyCost(supplement: Supplement): number | null {
  const dailyCost = getSupplementEstimatedDailyCost(supplement);
  return dailyCost === null ? null : dailyCost * 30;
}
