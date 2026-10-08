import { describe, expect, it } from 'vitest';

import {
  BALANCE_VIEW_OPTIONS,
  buildBalanceViewHash,
  isMoneyView,
  parseBalanceViewHash,
} from '@/lib/balance-navigation';

describe('Balance view navigation', () => {
  it('keeps the Balance destinations addressable without renaming internal keys', () => {
    expect(BALANCE_VIEW_OPTIONS.map(option => option.id)).toEqual([
      'overview',
      'wallets',
      'transactions',
      'plan',
      'reports',
      'plans',
    ]);
    expect(BALANCE_VIEW_OPTIONS.find(option => option.id === 'plan')?.label).toBe('Cash flow');
    expect(BALANCE_VIEW_OPTIONS.find(option => option.id === 'plans')?.label).toBe('Purchase plans');
  });

  it('builds and parses the namespaced Balance hash', () => {
    expect(buildBalanceViewHash('transactions')).toBe('#balance/transactions');
    expect(parseBalanceViewHash('#balance/reports')).toBe('reports');
    expect(parseBalanceViewHash('#balance/plan')).toBe('plan');
    expect(parseBalanceViewHash('#balance/plans')).toBe('plans');
  });

  it('rejects unrelated, malformed, and unknown hashes', () => {
    expect(parseBalanceViewHash('')).toBeNull();
    expect(parseBalanceViewHash('#settings/layout')).toBeNull();
    expect(parseBalanceViewHash('#balance/unknown')).toBeNull();
    expect(parseBalanceViewHash('#balance/transactions/extra')).toBeNull();
    expect(isMoneyView('reports')).toBe(true);
    expect(isMoneyView('report')).toBe(false);
    expect(isMoneyView(null)).toBe(false);
  });
});
