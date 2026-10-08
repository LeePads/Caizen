import { describe, expect, it } from 'vitest';
import { getSupplementEstimatedDailyCost, getSupplementEstimatedMonthlyCost } from '@/lib/collections/supplement-metrics';
import type { Supplement } from '@/lib/types';

const supplement = (overrides: Partial<Supplement> = {}): Supplement => ({
  id: 'supplement-1',
  name: 'Vitamin D',
  purchasePrice: 300,
  startDate: new Date('2026-08-01'),
  dosage: '30 capsules, 1x daily',
  dosageAmount: 30,
  dosageUnit: 'capsules',
  dailyIntake: 1,
  quantityRemaining: 30,
  createdAt: new Date('2026-08-01'),
  ...overrides,
});

describe('supplement purchase-cost metrics', () => {
  it('uses purchase price, package quantity, and daily intake only', () => {
    const item = supplement({ purchasePrice: 300, currentPrice: 900, dosageAmount: 30, dailyIntake: 2 });
    expect(getSupplementEstimatedDailyCost(item)).toBe(20);
    expect(getSupplementEstimatedMonthlyCost(item)).toBe(600);
  });

  it('returns null when cost inputs are incomplete or invalid', () => {
    expect(getSupplementEstimatedDailyCost(supplement({ purchasePrice: 0 }))).toBeNull();
    expect(getSupplementEstimatedDailyCost(supplement({ dosageAmount: 0 }))).toBeNull();
    expect(getSupplementEstimatedDailyCost(supplement({ dailyIntake: undefined }))).toBeNull();
    expect(getSupplementEstimatedDailyCost(supplement({ purchasePrice: Number.NaN }))).toBeNull();
  });
});
