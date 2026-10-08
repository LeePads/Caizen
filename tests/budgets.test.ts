import { describe, expect, it } from 'vitest';

import {
  calculateBudgetMetrics,
  calculateBudgetSummary,
  getBudgetScopeValidationError,
  getBudgetSpent,
  normalizeBudgets,
} from '@/lib/finance/budgets';
import { deleteFinancialCategory, deleteFinancialSubcategory } from '@/lib/balance';
import type { Budget, FinancialCategory, Transaction } from '@/lib/types';

const categories: FinancialCategory[] = [{
  id: 'food',
  type: 'expense',
  name: 'Food',
  total: '0',
  kind: 'neutral',
  subcategories: [
    { id: 'dining', name: 'Dining', total: '0' },
    { id: 'groceries', name: 'Groceries', total: '0' },
  ],
}, {
  id: 'salary',
  type: 'income',
  name: 'Salary',
  total: '0',
  kind: 'neutral',
  subcategories: [],
}];

const budget = (overrides: Partial<Budget> = {}): Budget => ({
  id: 'budget-food',
  month: '2026-08',
  categoryId: 'food',
  allocated: 100,
  createdAt: new Date('2026-08-01T00:00:00'),
  updatedAt: new Date('2026-08-01T00:00:00'),
  ...overrides,
});

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: `tx-${Math.random()}`,
  type: 'expense',
  amount: 10,
  walletId: 'cash',
  date: new Date('2026-08-15T12:00:00'),
  createdAt: new Date('2026-08-15T12:00:00'),
  ...overrides,
});

describe('monthly budgets', () => {
  it('normalizes valid budgets and drops invalid taxonomy or allocation records', () => {
    const result = normalizeBudgets([
      { id: 'valid', month: '2026-08', categoryId: 'food', allocated: '80', createdAt: '2026-08-01', updatedAt: '2026-08-01' },
      { id: 'income', month: '2026-08', categoryId: 'salary', allocated: 50 },
      { id: 'blank-month', month: '2026-13', categoryId: 'food', allocated: 50 },
      { id: 'bad-subcategory', month: '2026-08', categoryId: 'food', subcategoryId: 'missing', allocated: 50 },
      { id: 'zero', month: '2026-08', categoryId: 'food', allocated: 0 },
    ], categories);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'valid', allocated: 80, categoryId: 'food' });
    expect(result[0].createdAt).toBeInstanceOf(Date);
  });

  it('counts category spending across all subcategories but scopes subcategory budgets exactly', () => {
    const transactions = [
      transaction({ id: 'dining', categoryId: 'food', subcategoryId: 'dining', amount: 25 }),
      transaction({ id: 'groceries', categoryId: 'food', subcategoryId: 'groceries', amount: 15 }),
      transaction({ id: 'uncategorized', categoryId: undefined, amount: 50 }),
    ];

    expect(getBudgetSpent(budget(), transactions)).toBe(40);
    expect(getBudgetSpent(budget({ id: 'dining-budget', subcategoryId: 'dining' }), transactions)).toBe(25);
  });

  it('uses local calendar months and excludes non-reportable movement', () => {
    const transactions = [
      transaction({ id: 'income', type: 'income', amount: 500, categoryId: 'salary' }),
      transaction({ id: 'excluded', amount: 20, categoryId: 'food', excludeFromReports: true }),
      transaction({ id: 'adjustment', type: 'adjustment', amount: 20, categoryId: 'food', adjustmentDirection: 'decrease' }),
      transaction({ id: 'transfer', type: 'transfer', amount: 40, fee: 3, categoryId: 'food', excludeFromReports: true }),
      transaction({ id: 'previous-month', amount: 30, categoryId: 'food', date: new Date('2026-07-31T23:30:00') }),
    ];

    expect(getBudgetSpent(budget(), transactions)).toBe(3);
  });

  it('calculates cent-precise metrics and leaves over-budget progress uncapped', () => {
    const metrics = calculateBudgetMetrics(
      budget({ allocated: 5 }),
      [transaction({ amount: 6.2, categoryId: 'food' })],
    );

    expect(metrics.spent).toBe(6.2);
    expect(metrics.remaining).toBe(-1.2);
    expect(metrics.overBy).toBe(1.2);
    expect(metrics.progressPercent).toBe(124);
    expect(metrics.displayProgressPercent).toBe(100);
    expect(metrics.status).toBe('over-budget');
  });

  it('summarizes only budgets in the selected month', () => {
    const result = calculateBudgetSummary(
      [budget({ allocated: 80 }), budget({ id: 'next', month: '2026-09', allocated: 50 })],
      [transaction({ amount: 20, categoryId: 'food' })],
      '2026-08',
    );

    expect(result).toEqual({ allocated: 80, spent: 20, remaining: 60, overBy: 0 });
  });

  it('rejects duplicate and parent/child-overlapping scopes', () => {
    const parent = budget();
    expect(getBudgetScopeValidationError(parent, categories, [parent], parent.id)).toBeNull();
    expect(getBudgetScopeValidationError(parent, categories, [parent])).toBe('duplicate');
    expect(getBudgetScopeValidationError(
      budget({ id: 'dining-budget', subcategoryId: 'dining' }),
      categories,
      [parent],
    )).toBe('overlapping-category-scope');
  });

  it('removes taxonomy-linked budgets without changing transaction money fields', () => {
    const transactions = [transaction({ id: 'food-tx', categoryId: 'food', subcategoryId: 'dining', amount: 42 })];
    const budgets = [
      budget(),
      budget({ id: 'dining-budget', subcategoryId: 'dining' }),
      budget({ id: 'next-month', month: '2026-09' }),
    ];
    const subcategoryResult = deleteFinancialSubcategory(categories, transactions, 'food', 'dining', budgets);
    expect(subcategoryResult.budgets.map(item => item.id)).toEqual(['budget-food', 'next-month']);
    expect(subcategoryResult.transactions[0]).toMatchObject({ amount: 42, categoryId: 'food' });
    expect(subcategoryResult.transactions[0].subcategoryId).toBeUndefined();

    const categoryResult = deleteFinancialCategory(categories, transactions, 'food', budgets);
    expect(categoryResult.budgets).toHaveLength(0);
    expect(categoryResult.transactions[0]).toMatchObject({ amount: 42, walletId: 'cash' });
    expect(categoryResult.transactions[0].categoryId).toBeUndefined();
  });
});
