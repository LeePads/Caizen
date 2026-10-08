import { describe, expect, it } from 'vitest';
import {
  createDefaultFinancialCategories,
  seedFinancialCategoriesIfEmpty,
} from '@/lib/finance/default-categories';

describe('starter financial taxonomy', () => {
  it('creates the deterministic starter categories and icons', () => {
    const categories = createDefaultFinancialCategories();

    expect(categories).toHaveLength(16);
    expect(categories.filter(category => category.type === 'expense')).toHaveLength(11);
    expect(categories.filter(category => category.type === 'income')).toHaveLength(5);
    expect(categories[0]).toMatchObject({
      id: 'caizen-default-expense-food',
      name: 'Food',
      icon: 'utensils',
      total: '0',
      kind: 'neutral',
    });
    expect(categories[0].subcategories).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Dining', icon: 'pizza' }),
      expect.objectContaining({ name: 'Groceries', icon: 'shopping-basket' }),
      expect.objectContaining({ name: 'Coffee & Snacks', icon: 'coffee' }),
    ]));
    expect(categories.find(category => category.name === 'Salary')).toMatchObject({
      type: 'income',
      icon: 'banknote',
      subcategories: [],
    });
  });

  it('returns fresh records with stable ids on every call', () => {
    const first = createDefaultFinancialCategories();
    const second = createDefaultFinancialCategories();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first[0].subcategories).not.toBe(second[0].subcategories);
  });

  it('seeds only empty taxonomies and is idempotent after initialization', () => {
    const emptyProfile = { id: 'legacy-empty', financialCategories: [] as ReturnType<typeof createDefaultFinancialCategories> };
    const seededProfile = seedFinancialCategoriesIfEmpty(emptyProfile);

    expect(seededProfile.financialCategories).toHaveLength(16);
    expect(seedFinancialCategoriesIfEmpty(seededProfile)).toBe(seededProfile);

    const existingProfile = {
      id: 'existing-taxonomy',
      financialCategories: [seededProfile.financialCategories[0]],
    };
    expect(seedFinancialCategoriesIfEmpty(existingProfile)).toBe(existingProfile);
    expect(existingProfile.financialCategories).toHaveLength(1);
  });
});
