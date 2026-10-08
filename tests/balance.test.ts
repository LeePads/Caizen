import { describe, expect, it } from 'vitest';

import {
  getTreasuryTotals,
  getBalanceCheckInInputErrors,
  normalizeBalanceCheckIn,
  normalizeBalanceProjectionRow,
  normalizeFinancialCategoriesAndReferences,
  normalizeFinancialCategory,
  resolveUpcomingMoneyRequest,
  toNumber,
  walletBalancesMatchOpening,
} from '@/lib/balance';
import type { BalanceProjectionRow, Transaction, UpcomingMoneyItem, Wallet } from '@/lib/types';

const wallet = (id: string, balance: number, type: Wallet['type'] = 'free_spending'): Wallet => ({
  id,
  name: id,
  balance,
  color: '#000000',
  type,
  createdAt: new Date('2026-08-01T00:00:00'),
});

const row = (overrides: Partial<BalanceProjectionRow> = {}): BalanceProjectionRow => ({
  id: 'row-1',
  label: 'Expense',
  amount: '0',
  allocated: '',
  type: 'expense',
  active: true,
  ...overrides,
});

const moneyItem = (overrides: Partial<UpcomingMoneyItem> = {}): UpcomingMoneyItem => ({
  id: 'money-1',
  title: 'Money item',
  direction: 'outgoing',
  amount: 10,
  category: 'purchase',
  status: 'planned',
  recordedAmount: 0,
  createdAt: new Date('2026-08-01T00:00:00'),
  updatedAt: new Date('2026-08-01T00:00:00'),
  ...overrides,
});

describe('balance domain invariants', () => {
  it('keeps wallet and recurring-plan totals exact at decimal boundaries', () => {
    const totals = getTreasuryTotals(
      [wallet('cash', 0.1), wallet('spend', 0.2)],
      [row({ amount: '0.3' })],
      false,
      '2026-08',
    );

    expect(totals.totalWalletBalance).toBe(0.3);
    expect(totals.spendableBalance).toBe(0.3);
    expect(totals.remainingExpenses).toBe(0.3);
    expect(totals.projectedBudget).toBe(0);
    expect(totals.safeToSpend).toBe(0);
  });

  it('preserves supported negative balances while rejecting non-finite values', () => {
    expect(toNumber(-25.5)).toBe(-25.5);
    expect(toNumber('not-a-number')).toBe(0);
    expect(toNumber(Infinity)).toBe(0);
  });

  it('rejects blank or non-finite check-in inputs without rejecting negatives', () => {
    expect(getBalanceCheckInInputErrors(
      [{ id: 'cash' }, { id: 'savings' }, { id: 'overdraft' }],
      { cash: '', savings: 'Infinity', overdraft: '-25.5' },
    )).toEqual({
      cash: 'Enter a current balance.',
      savings: 'Enter a valid number.',
    });
  });

  it('rejects check-in reconciliation when wallet IDs or opening balances are stale', () => {
    const wallets = [wallet('cash', 100), wallet('savings', 250, 'savings')];
    expect(walletBalancesMatchOpening(wallets, { cash: 100, savings: 250 })).toBe(true);
    expect(walletBalancesMatchOpening([{ ...wallets[0], balance: 125 }, wallets[1]], { cash: 100, savings: 250 })).toBe(false);
    expect(walletBalancesMatchOpening(wallets, { cash: 100 })).toBe(false);
    expect(walletBalancesMatchOpening(wallets, { cash: 100, savings: 250, extra: 1 })).toBe(false);
  });

  it('normalizes malformed projection, category, and check-in records safely', () => {
    const projection = normalizeBalanceProjectionRow({
      id: 'projection-bad',
      label: 'Bad row',
      amount: 'Infinity',
      allocated: '999',
      type: 'unknown',
      dueDay: 99,
      cycleKey: '2026-99',
    }, 'projection-fallback');
    const category = normalizeFinancialCategory({
      id: 'category-bad',
      type: 'unknown',
      name: 'Bad category',
      total: 'NaN',
      kind: 'invalid',
      subcategories: [{ id: 'sub-bad', name: 'Bad', total: 'Infinity' }],
    }, 'category-fallback');
    const checkIn = normalizeBalanceCheckIn({
      id: 'checkin-bad',
      weekKey: 'not-a-date',
      completedAt: '2026-08-12',
      walletBalances: [{ walletId: 'wallet-bad', name: 'Bad', balance: 'NaN' }],
      totalWalletBalance: 'NaN',
      spendableBalance: '4.10',
      protectedBalance: 'Infinity',
      remainingCommitments: '2.10',
      safeToSpend: 'NaN',
    }, 'checkin-fallback');

    expect(projection).toMatchObject({ amount: '0', allocated: '0', type: 'expense', dueDay: 31 });
    expect(category).toMatchObject({ type: 'expense', total: '0', kind: 'neutral' });
    expect(category.subcategories[0].total).toBe('0');
    expect(checkIn.totalWalletBalance).toBe(0);
    expect(checkIn.protectedBalance).toBe(0);
    expect(checkIn.safeToSpend).toBe(2);
    expect(checkIn.walletBalances[0].balance).toBe(0);
  });

  it('drops invalid taxonomy and clears only the affected transaction references', () => {
    const transactions: Transaction[] = [
      {
        id: 'categorized', type: 'expense', amount: 12, walletId: 'cash', categoryId: 'food', subcategoryId: 'groceries',
        date: new Date('2026-08-20'), createdAt: new Date('2026-08-20'), updatedAt: new Date('2026-08-20'), notes: 'Keep me',
      },
      {
        id: 'blank-subcategory', type: 'expense', amount: 8, walletId: 'cash', categoryId: 'food', subcategoryId: 'blank-subcategory',
        date: new Date('2026-08-20'), createdAt: new Date('2026-08-20'), updatedAt: new Date('2026-08-20'),
      },
      {
        id: 'blank-category', type: 'expense', amount: 5, walletId: 'cash', categoryId: 'blank-category', subcategoryId: 'orphan-subcategory',
        date: new Date('2026-08-20'), createdAt: new Date('2026-08-20'), updatedAt: new Date('2026-08-20'),
      },
    ];
    const result = normalizeFinancialCategoriesAndReferences([
      {
        id: 'food', type: 'expense', name: '  Food  ', total: '0', kind: 'neutral',
        subcategories: [
          { id: 'groceries', name: '  Groceries  ', total: '0' },
          { id: 'blank-subcategory', name: '   ', total: '0' },
        ],
      },
      {
        id: 'blank-category', type: 'expense', name: ' \t', total: '0', kind: 'neutral',
        subcategories: [{ id: 'orphan-subcategory', name: 'Orphan', total: '0' }],
      },
    ], transactions, index => `category-${index}`);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]).toMatchObject({ id: 'food', name: 'Food' });
    expect(result.categories[0].subcategories).toEqual([
      expect.objectContaining({ id: 'groceries', name: 'Groceries' }),
    ]);
    expect(result.transactions[0]).toMatchObject({ categoryId: 'food', subcategoryId: 'groceries', amount: 12, notes: 'Keep me' });
    expect(result.transactions[1]).toMatchObject({ categoryId: 'food', amount: 8 });
    expect(result.transactions[1].subcategoryId).toBeUndefined();
    expect(result.transactions[2]).toMatchObject({ amount: 5 });
    expect(result.transactions[2].categoryId).toBeUndefined();
    expect(result.transactions[2].subcategoryId).toBeUndefined();
  });

  it('consumes exact Search/Quick Add money requests once and preserves type', () => {
    const item = moneyItem({ id: 'exact-record', direction: 'incoming' });

    const exact = resolveUpcomingMoneyRequest(
      [item],
      { signal: 7, requestedItemId: 'exact-record' },
      0,
    );
    expect(exact).toEqual({ signal: 7, item });
    expect(resolveUpcomingMoneyRequest(
      [item],
      { signal: 7, requestedItemId: 'exact-record' },
      7,
    )).toBeNull();

    expect(resolveUpcomingMoneyRequest(
      [],
      { signal: 8, requestedDirection: 'outgoing' },
      7,
    )).toEqual({ signal: 8, direction: 'outgoing' });
    expect(resolveUpcomingMoneyRequest(
      [item],
      { signal: 9, requestedItemId: 'missing' },
      8,
    )).toBeNull();
  });
});
