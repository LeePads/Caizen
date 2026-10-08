import { describe, expect, it } from 'vitest';

import {
  deleteFinancialCategory,
  deleteFinancialSubcategory,
  hasDuplicateFinancialCategoryName,
  hasDuplicateFinancialSubcategoryName,
  isReservedFinancialFallbackName,
  renameFinancialCategory,
  renameFinancialSubcategory,
} from '@/lib/balance';
import type { FinancialCategory, Transaction } from '@/lib/types';

const categories: FinancialCategory[] = [
  {
    id: 'food',
    type: 'expense',
    name: 'Food',
    total: '0',
    kind: 'neutral',
    subcategories: [
      { id: 'groceries', name: 'Groceries', total: '0' },
      { id: 'dining', name: 'Dining', total: '0' },
    ],
  },
  {
    id: 'salary',
    type: 'income',
    name: 'Salary',
    total: '0',
    kind: 'neutral',
    subcategories: [],
  },
];

const transactions: Transaction[] = [
  {
    id: 'tx-grocery',
    type: 'expense',
    amount: 25,
    walletId: 'cash',
    categoryId: 'food',
    subcategoryId: 'groceries',
    date: new Date('2026-08-20T00:00:00'),
    createdAt: new Date('2026-08-20T00:00:00'),
  },
  {
    id: 'tx-dining',
    type: 'expense',
    amount: 15,
    walletId: 'cash',
    categoryId: 'food',
    subcategoryId: 'dining',
    excludeFromReports: true,
    sourceKey: 'transaction-csv:2',
    date: new Date('2026-08-21T00:00:00'),
    createdAt: new Date('2026-08-21T00:00:00'),
  },
];

describe('financial category management', () => {
  it('rejects duplicate names within a type or parent category', () => {
    expect(hasDuplicateFinancialCategoryName(categories, 'expense', ' food ')).toBe(true);
    expect(hasDuplicateFinancialCategoryName(categories, 'income', 'Food')).toBe(false);
    expect(hasDuplicateFinancialCategoryName(categories, 'expense', 'Food', 'food')).toBe(false);
    expect(hasDuplicateFinancialSubcategoryName(categories[0], ' groceries ')).toBe(true);
    expect(hasDuplicateFinancialSubcategoryName(categories[0], 'Groceries', 'groceries')).toBe(false);
  });

  it('reserves the synthetic Uncategorized fallback without removing legacy records', () => {
    expect(isReservedFinancialFallbackName(' Uncategorized ')).toBe(true);
    expect(isReservedFinancialFallbackName('Food')).toBe(false);
  });

  it('renames categories and subcategories without changing references', () => {
    const categoryResult = renameFinancialCategory(categories, transactions, 'food', 'Household food');
    expect(categoryResult.categories[0]).toMatchObject({ id: 'food', name: 'Household food' });
    expect(categoryResult.transactions).toBe(transactions);

    const subcategoryResult = renameFinancialSubcategory(
      categoryResult.categories,
      transactions,
      'food',
      'groceries',
      'Market groceries',
    );
    expect(subcategoryResult.categories[0].subcategories[0]).toMatchObject({
      id: 'groceries',
      name: 'Market groceries',
    });
    expect(subcategoryResult.transactions[0]).toMatchObject({ categoryId: 'food', subcategoryId: 'groceries' });
  });

  it('deletes a subcategory while preserving its parent reference', () => {
    const result = deleteFinancialSubcategory(categories, transactions, 'food', 'groceries');

    expect(result.affectedTransactionCount).toBe(1);
    expect(result.categories[0].subcategories.map(item => item.id)).toEqual(['dining']);
    expect(result.transactions[0]).toMatchObject({ categoryId: 'food' });
    expect(result.transactions[0].subcategoryId).toBeUndefined();
    expect(result.transactions[1]).toMatchObject({
      categoryId: 'food',
      subcategoryId: 'dining',
      excludeFromReports: true,
      sourceKey: 'transaction-csv:2',
    });
  });

  it('deletes a category and uncategorizes affected transactions without changing money fields', () => {
    const result = deleteFinancialCategory(categories, transactions, 'food');

    expect(result.affectedTransactionCount).toBe(2);
    expect(result.categories.map(category => category.id)).toEqual(['salary']);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      id: 'tx-grocery',
      amount: 25,
      walletId: 'cash',
    });
    expect(result.transactions[0].categoryId).toBeUndefined();
    expect(result.transactions[0].subcategoryId).toBeUndefined();
    expect(result.transactions[1]).toMatchObject({
      amount: 15,
      excludeFromReports: true,
      sourceKey: 'transaction-csv:2',
    });
    expect(result.transactions[1].categoryId).toBeUndefined();
    expect(result.transactions[1].subcategoryId).toBeUndefined();
  });
});
