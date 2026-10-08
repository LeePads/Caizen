import { describe, expect, it } from 'vitest';

import {
  FINANCIAL_ICON_CATALOG,
  FINANCIAL_ICON_FALLBACK,
  getFinancialIconDefinition,
  normalizeFinancialIconId,
  resolveFinancialClassificationIconId,
  resolveFinancialIconId,
  searchFinancialIcons,
  suggestFinancialIcons,
} from '@/lib/finance/category-icons';

describe('financial category icon catalog', () => {
  it('has unique stable keys and a valid fallback', () => {
    const keys = FINANCIAL_ICON_CATALOG.map(icon => icon.id);
    expect(new Set(keys).size).toBe(keys.length);
    expect(getFinancialIconDefinition(FINANCIAL_ICON_FALLBACK)?.id).toBe(FINANCIAL_ICON_FALLBACK);
  });

  it('searches labels, keys, and local keywords in catalog order', () => {
    expect(searchFinancialIcons('coffee').map(icon => icon.id)).toContain('coffee');
    expect(searchFinancialIcons('wallet-cards').map(icon => icon.id)).toContain('wallet-cards');
    expect(searchFinancialIcons('wallet cards').map(icon => icon.id)).toContain('wallet-cards');
    expect(searchFinancialIcons('internet').map(icon => icon.id)).toContain('wifi');
    expect(searchFinancialIcons('this-does-not-exist')).toEqual([]);
    expect(searchFinancialIcons('')).toEqual(FINANCIAL_ICON_CATALOG);
  });

  it('returns deterministic name-based suggestions capped at three', () => {
    const first = suggestFinancialIcons('coffee shop');
    const second = suggestFinancialIcons('coffee shop');
    expect(first).toHaveLength(3);
    expect(first).toEqual(second);
    expect(first.every(icon => icon.id)).toBe(true);
  });

  it('normalizes persisted identifiers without rejecting unknown future keys', () => {
    expect(normalizeFinancialIconId('  restaurant  ')).toBe('restaurant');
    expect(normalizeFinancialIconId('   ')).toBeUndefined();
    expect(normalizeFinancialIconId(42)).toBeUndefined();
    expect(resolveFinancialIconId(undefined)).toBe(FINANCIAL_ICON_FALLBACK);
    expect(resolveFinancialIconId('unknown-future-icon')).toBe(FINANCIAL_ICON_FALLBACK);
    expect(resolveFinancialIconId(' utensils ')).toBe('utensils');
  });

  it('prefers a valid subcategory icon, then the parent, then fallback', () => {
    expect(resolveFinancialClassificationIconId('utensils', 'coffee')).toBe('coffee');
    expect(resolveFinancialClassificationIconId('wallet', undefined)).toBe('wallet');
    expect(resolveFinancialClassificationIconId('unknown', 'also-unknown')).toBe(FINANCIAL_ICON_FALLBACK);
  });
});
