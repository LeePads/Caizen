import { describe, expect, it } from 'vitest';

import {
  applyTransactionToWallets,
  aggregateTransactionWalletDeltas,
  applyWalletDeltas,
  clearTransactionHistory,
  connectUnlinkedTransactionWallet,
  filterTransactionsByHistoryPeriod,
  filterTransactionsByHistoryScope,
  getTransactionCategoryLabel,
  getTransactionHistoryPeriodBounds,
  getTransactionHistoryScopeBounds,
  getTransactionSignedAmount,
  groupTransactionsByLocalDate,
  normalizeTransaction,
  paginateTransactionHistory,
  summarizeTransactionHistory,
  transactionMatchesListFilter,
  transactionMatchesReportingStatus,
  transactionValidationError,
  transactionWalletDeltas,
} from '@/lib/transactions';
import type { FinancialCategory, Transaction, Wallet } from '@/lib/types';

const wallets: Wallet[] = [
  { id: 'cash', name: 'Cash', balance: 1000, color: '#000', type: 'cash_on_hand', createdAt: new Date('2026-01-01') },
  { id: 'savings', name: 'Savings', balance: 0, color: '#000', type: 'savings', createdAt: new Date('2026-01-01') },
];

const transaction = (overrides: Partial<Transaction> = {}): Transaction => normalizeTransaction({
  id: 'tx-1',
  type: 'expense',
  amount: 125,
  walletId: 'cash',
  date: '2026-08-20',
  createdAt: '2026-08-20T08:00:00Z',
  ...overrides,
}, 'tx-1');

describe('transaction balance rules', () => {
  it('applies income and expense movements using cent precision', () => {
    const income = transaction({ type: 'income', amount: 0.1 });
    const expense = transaction({ type: 'expense', amount: 0.2 });
    const next = applyTransactionToWallets(
      applyTransactionToWallets(wallets, income),
      expense,
    );

    expect(next.find(wallet => wallet.id === 'cash')?.balance).toBe(999.9);
  });

  it('moves transfer principal and charges the fee only to the source', () => {
    const transfer = transaction({
      type: 'transfer',
      amount: 300,
      fee: 5,
      destinationWalletId: 'savings',
    });
    const next = applyTransactionToWallets(wallets, transfer);

    expect(next).toEqual([
      expect.objectContaining({ id: 'cash', balance: 695 }),
      expect.objectContaining({ id: 'savings', balance: 300 }),
    ]);
    expect(transactionWalletDeltas(transfer)).toEqual(new Map([
      ['cash', -305],
      ['savings', 300],
    ]));
  });

  it('aggregates mixed transaction reversals once for batched deletion', () => {
    const selected = [
      transaction({ id: 'batch-income', type: 'income', amount: 10 }),
      transaction({ id: 'batch-expense', type: 'expense', amount: 2 }),
      transaction({ id: 'batch-transfer', type: 'transfer', amount: 3, fee: 0.5, destinationWalletId: 'savings' }),
      transaction({ id: 'batch-adjustment', type: 'adjustment', amount: 1, adjustmentDirection: 'increase' }),
      transaction({ id: 'batch-excluded', type: 'expense', amount: 4, excludeFromReports: true }),
    ];
    const deltas = aggregateTransactionWalletDeltas(selected);
    const next = applyWalletDeltas(wallets, deltas);

    expect(deltas).toEqual(new Map([
      ['cash', 1.5],
      ['savings', 3],
    ]));
    expect(next).toEqual([
      expect.objectContaining({ id: 'cash', balance: 1001.5 }),
      expect.objectContaining({ id: 'savings', balance: 3 }),
    ]);
  });

  it('normalizes legacy values and rejects invalid wallet relationships', () => {
    const normalized = normalizeTransaction({
      id: 'legacy',
      type: 'unknown',
      amount: 'not-a-number',
      walletId: 'cash',
      date: '2026-08-20',
    }, 'fallback');
    expect(normalized).toMatchObject({ id: 'legacy', type: 'expense', amount: 0 });

    expect(transactionValidationError(transaction({ amount: 0 }), wallets)).toContain('amount');
    expect(transactionValidationError(transaction({ type: 'transfer', destinationWalletId: 'cash' }), wallets)).toContain('different');
  });

  it('buckets adjustments by direction while keeping transfers in All', () => {
    const income = transaction({ id: 'income', type: 'income' });
    const expense = transaction({ id: 'expense', type: 'expense' });
    const increase = transaction({ id: 'increase', type: 'adjustment', adjustmentDirection: 'increase' });
    const decrease = transaction({ id: 'decrease', type: 'adjustment', adjustmentDirection: 'decrease' });
    const transfer = transaction({ id: 'transfer', type: 'transfer', destinationWalletId: 'savings' });
    const legacyAdjustment = normalizeTransaction({
      id: 'legacy-adjustment',
      type: 'adjustment',
      amount: 10,
      walletId: 'cash',
      date: '2026-08-20',
    }, 'legacy-adjustment');

    expect(transactionMatchesListFilter(income, 'income')).toBe(true);
    expect(transactionMatchesListFilter(increase, 'income')).toBe(true);
    expect(transactionMatchesListFilter(decrease, 'expense')).toBe(true);
    expect(transactionMatchesListFilter(expense, 'expense')).toBe(true);
    expect(transactionMatchesListFilter(income, 'expense')).toBe(false);
    expect(transactionMatchesListFilter(transfer, 'income')).toBe(false);
    expect(transactionMatchesListFilter(transfer, 'expense')).toBe(false);
    expect(transactionMatchesListFilter(transfer, 'all')).toBe(true);
    expect(legacyAdjustment.adjustmentDirection).toBe('increase');
    expect(transactionMatchesListFilter(legacyAdjustment, 'income')).toBe(true);
  });

  it('clears only transaction history without reversing wallet balances or taxonomy', () => {
    const categories = [{ id: 'food', name: 'Food', type: 'expense', total: '0', kind: 'neutral', subcategories: [] }];
    const profile = {
      id: 'profile-a',
      wallets,
      transactions: [transaction({ id: 'history-1' })],
      financialCategories: categories,
    };

    const cleared = clearTransactionHistory(profile);

    expect(cleared).not.toBe(profile);
    expect(cleared.transactions).toEqual([]);
    expect(cleared.wallets).toBe(profile.wallets);
    expect(cleared.financialCategories).toBe(profile.financialCategories);
    expect(cleared.wallets.map(wallet => wallet.balance)).toEqual([1000, 0]);
  });
});

describe('transaction history helpers', () => {
  type HistoryTransactionOverrides = Omit<
    Partial<Transaction>,
    'date' | 'createdAt' | 'updatedAt'
  > & {
    date?: Date | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  const historyTransaction = (
    id: string,
    overrides: HistoryTransactionOverrides = {},
  ) => transaction({
    id,
    date: '2026-08-20',
    createdAt: '2026-08-20T08:00:00',
    ...overrides,
  } as Partial<Transaction>);

  it('groups local calendar dates and orders groups and rows newest first', () => {
    const older = historyTransaction('older', {
      date: '2026-08-19',
      createdAt: '2026-08-19T22:00:00',
    });
    const earlier = historyTransaction('earlier', {
      createdAt: '2026-08-20T08:00:00',
    });
    const later = historyTransaction('later', {
      createdAt: '2026-08-20T18:00:00',
    });

    const groups = groupTransactionsByLocalDate([older, earlier, later]);

    expect(groups.map(group => group.dateKey)).toEqual(['2026-08-20', '2026-08-19']);
    expect(groups[0].transactions.map(item => item.id)).toEqual(['later', 'earlier']);
    expect(groups[1].transactions.map(item => item.id)).toEqual(['older']);
  });

  it('uses Monday-based week and complete local month boundaries', () => {
    const now = new Date(2026, 7, 23, 9, 0, 0);
    expect(getTransactionHistoryPeriodBounds('this-week', now)).toEqual({
      startDateKey: '2026-08-17',
      endDateKey: '2026-08-23',
    });
    expect(getTransactionHistoryPeriodBounds('this-month', now)).toEqual({
      startDateKey: '2026-08-01',
      endDateKey: '2026-08-31',
    });
    expect(getTransactionHistoryPeriodBounds('last-month', now)).toEqual({
      startDateKey: '2026-07-01',
      endDateKey: '2026-07-31',
    });
    expect(getTransactionHistoryPeriodBounds('all', now)).toEqual({});

    const rows = [
      historyTransaction('before-week', { date: '2026-08-16' }),
      historyTransaction('week-start', { date: '2026-08-17' }),
      historyTransaction('week-end', { date: '2026-08-23' }),
      historyTransaction('next-month', { date: '2026-09-01' }),
      historyTransaction('last-month', { date: '2026-07-31' }),
    ];
    expect(filterTransactionsByHistoryPeriod(rows, 'this-week', now).map(item => item.id)).toEqual([
      'week-start',
      'week-end',
    ]);
    expect(filterTransactionsByHistoryPeriod(rows, 'this-month', now).map(item => item.id)).toEqual([
      'before-week',
      'week-start',
      'week-end',
    ]);
    expect(filterTransactionsByHistoryPeriod(rows, 'last-month', now).map(item => item.id)).toEqual(['last-month']);
    expect(filterTransactionsByHistoryPeriod(rows, 'all', now)).toHaveLength(5);
  });

  it('supports local calendar year periods', () => {
    const now = new Date(2026, 7, 23, 9, 0, 0);
    expect(getTransactionHistoryPeriodBounds('this-year', now)).toEqual({
      startDateKey: '2026-01-01',
      endDateKey: '2026-12-31',
    });
    expect(getTransactionHistoryPeriodBounds('last-year', now)).toEqual({
      startDateKey: '2025-01-01',
      endDateKey: '2025-12-31',
    });
  });

  it('paginates sorted history without changing the complete source result', () => {
    const rows = Array.from({ length: 101 }, (_, index) => historyTransaction(`row-${index}`));
    const page = paginateTransactionHistory(rows, 2, 50);

    expect(page).toMatchObject({
      page: 2,
      pageSize: 50,
      totalItems: 101,
      totalPages: 3,
      startIndex: 50,
      endIndex: 100,
    });
    expect(page.items).toHaveLength(50);
    expect(paginateTransactionHistory(rows, 99, 100).page).toBe(2);
    expect(paginateTransactionHistory(rows, 1, 25).totalPages).toBe(5);
  });

  it('connects only an unlinked ordinary transaction without changing its accounting fields', () => {
    const unlinked = historyTransaction('unlinked', { walletId: '' });
    const connected = connectUnlinkedTransactionWallet(unlinked, 'cash', new Date('2026-08-23T10:00:00'));

    expect(connected).toMatchObject({ id: 'unlinked', walletId: 'cash', amount: unlinked.amount, type: unlinked.type });
    expect(transactionWalletDeltas(unlinked)).toEqual(new Map());
    expect(connectUnlinkedTransactionWallet(transaction({ id: 'linked' }), 'cash')).toBeNull();
    expect(connectUnlinkedTransactionWallet(transaction({ id: 'transfer', type: 'transfer', destinationWalletId: 'savings' }), 'cash')).toBeNull();
  });

  it('summarizes reportable movement with cent precision', () => {
    const rows = [
      historyTransaction('income', { type: 'income', amount: 100 }),
      historyTransaction('expense', { type: 'expense', amount: 25.1 }),
      historyTransaction('excluded', { type: 'expense', amount: 999, excludeFromReports: true }),
      historyTransaction('transfer', { type: 'transfer', amount: 50, fee: 1.25, destinationWalletId: 'savings' }),
      historyTransaction('no-fee-transfer', { type: 'transfer', amount: 20, destinationWalletId: 'savings' }),
      historyTransaction('adjustment', { type: 'adjustment', amount: 10, adjustmentDirection: 'increase' }),
    ];

    expect(summarizeTransactionHistory(rows)).toEqual({
      income: 100,
      expense: 26.35,
      net: 73.65,
    });
    expect(groupTransactionsByLocalDate(rows)[0].summary).toEqual({
      income: 100,
      expense: 26.35,
      net: 73.65,
    });
  });

  it('keeps category fallback and signed display direction deterministic', () => {
    const categories: FinancialCategory[] = [{
      id: 'food',
      type: 'expense',
      name: 'Food',
      total: '0',
      kind: 'neutral',
      subcategories: [{ id: 'dining', name: 'Dining', total: '0' }],
    }];
    const categorized = historyTransaction('categorized', {
      categoryId: 'food',
      subcategoryId: 'dining',
    });
    const uncategorized = historyTransaction('uncategorized', { categoryId: undefined });

    expect(getTransactionCategoryLabel(categorized, categories)).toBe('Food › Dining');
    expect(getTransactionCategoryLabel(historyTransaction('category-only', { categoryId: 'food' }), categories)).toBe('Food');
    expect(getTransactionCategoryLabel(uncategorized, categories)).toBe('Uncategorized');
    expect(getTransactionSignedAmount(historyTransaction('income', { type: 'income', amount: 10 }))).toBe(10);
    expect(getTransactionSignedAmount(historyTransaction('expense', { type: 'expense', amount: 10 }))).toBe(-10);
    expect(getTransactionSignedAmount(historyTransaction('increase', { type: 'adjustment', amount: 10, adjustmentDirection: 'increase' }))).toBe(10);
    expect(getTransactionSignedAmount(historyTransaction('decrease', { type: 'adjustment', amount: 10, adjustmentDirection: 'decrease' }))).toBe(-10);
    expect(getTransactionSignedAmount(historyTransaction('transfer', { type: 'transfer', amount: 10, destinationWalletId: 'savings' }))).toBeNull();
  });

  it('returns an empty period without changing the all-period source list', () => {
    const rows = [historyTransaction('old', { date: '2026-07-10' })];
    const now = new Date(2026, 7, 23, 9, 0, 0);

    expect(filterTransactionsByHistoryPeriod(rows, 'this-month', now)).toEqual([]);
    expect(filterTransactionsByHistoryPeriod(rows, 'all', now)).toEqual(rows);
  });

  it('filters day, month, year, and range scopes with inclusive local boundaries', () => {
    const rows = [
      historyTransaction('year-start', { date: '2026-01-01' }),
      historyTransaction('month-start', { date: '2026-08-01' }),
      historyTransaction('anchor', { date: '2026-08-20' }),
      historyTransaction('month-end', { date: '2026-08-31' }),
      historyTransaction('year-end', { date: '2026-12-31' }),
      historyTransaction('next-year', { date: '2027-01-01' }),
    ];

    expect(getTransactionHistoryScopeBounds('day', '2026-08-20')).toEqual({
      startDateKey: '2026-08-20',
      endDateKey: '2026-08-20',
    });
    expect(getTransactionHistoryScopeBounds('month', '2026-08-20')).toEqual({
      startDateKey: '2026-08-01',
      endDateKey: '2026-08-31',
    });
    expect(getTransactionHistoryScopeBounds('year', '2026-08-20')).toEqual({
      startDateKey: '2026-01-01',
      endDateKey: '2026-12-31',
    });
    expect(getTransactionHistoryScopeBounds('range', '2026-08-20', {
      startDateKey: '2026-08-01',
      endDateKey: '2026-08-31',
    })).toEqual({
      startDateKey: '2026-08-01',
      endDateKey: '2026-08-31',
    });
    expect(getTransactionHistoryScopeBounds('range', '2026-08-20', {
      startDateKey: '2026-08-31',
      endDateKey: '2026-08-01',
    })).toBeNull();

    expect(filterTransactionsByHistoryScope(rows, 'day', '2026-08-20').map(item => item.id)).toEqual(['anchor']);
    expect(filterTransactionsByHistoryScope(rows, 'month', '2026-08-20').map(item => item.id)).toEqual([
      'month-start',
      'anchor',
      'month-end',
    ]);
    expect(filterTransactionsByHistoryScope(rows, 'year', '2026-08-20').map(item => item.id)).toEqual([
      'year-start',
      'month-start',
      'anchor',
      'month-end',
      'year-end',
    ]);
    expect(filterTransactionsByHistoryScope(rows, 'range', '2026-08-20', {
      startDateKey: '2026-08-01',
      endDateKey: '2026-08-31',
    }).map(item => item.id)).toEqual(['month-start', 'anchor', 'month-end']);
    expect(filterTransactionsByHistoryScope(rows, 'all', 'not-a-date')).toEqual(rows);

    (['day', 'month', 'year', 'range', 'all'] as const).forEach(scope => {
      const scopedRows = filterTransactionsByHistoryScope(rows, scope, '2026-08-20', {
        startDateKey: '2026-08-01',
        endDateKey: '2026-08-31',
      });
      expect(paginateTransactionHistory(scopedRows, 1, 2).totalItems).toBe(scopedRows.length);
    });
  });

  it('keeps reporting status filtering aligned with the persisted exclusion flag', () => {
    const included = historyTransaction('included');
    const excluded = historyTransaction('excluded', { excludeFromReports: true });

    expect(transactionMatchesReportingStatus(included, 'all')).toBe(true);
    expect(transactionMatchesReportingStatus(excluded, 'all')).toBe(true);
    expect(transactionMatchesReportingStatus(included, 'included')).toBe(true);
    expect(transactionMatchesReportingStatus(excluded, 'included')).toBe(false);
    expect(transactionMatchesReportingStatus(included, 'excluded')).toBe(false);
    expect(transactionMatchesReportingStatus(excluded, 'excluded')).toBe(true);
  });
});
