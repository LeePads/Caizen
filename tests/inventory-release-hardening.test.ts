import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  getInventoryCurrentValueIfKnown,
  getInventoryPurchaseCost,
  getInventorySavingsPerUnit,
  getInventorySavingsTotal,
  sumInventorySavings,
} from '@/lib/collections/inventory-metrics';
import type { InventoryItem } from '@/lib/types';

const item = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: `inventory-${Math.random()}`,
  profileId: 'private-profile',
  name: 'Desk item',
  quantity: 1,
  unit: 'pcs',
  category: 'utilities',
  purchaseDate: new Date('2026-08-20T12:00:00'),
  currentPrice: 100,
  purchasePrice: 150,
  status: 'using',
  notes: '',
  createdAt: new Date('2026-08-20T12:00:00'),
  ...overrides,
});

const inventorySource = readFileSync(resolve(process.cwd(), 'components/sections/InventorySection.tsx'), 'utf8');
const categorySource = readFileSync(resolve(process.cwd(), 'components/sections/InventoryCategoryDashboard.tsx'), 'utf8');

describe('Inventory release hardening', () => {
  it('preserves the historical price mapping and calculates savings semantically', () => {
    const record = item({ currentPrice: 100, purchasePrice: 150, quantity: 2 });

    expect(getInventoryPurchaseCost(record)).toBe(100);
    expect(getInventoryCurrentValueIfKnown(record)).toBe(150);
    expect(getInventorySavingsPerUnit(record)).toBe(50);
    expect(getInventorySavingsTotal(record)).toBe(100);
  });

  it('supports positive, negative, neutral, and incomplete savings without false zeros', () => {
    expect(getInventorySavingsPerUnit(item({ currentPrice: 100, purchasePrice: 150 }))).toBe(50);
    expect(getInventorySavingsPerUnit(item({ currentPrice: 150, purchasePrice: 100 }))).toBe(-50);
    expect(getInventorySavingsPerUnit(item({ currentPrice: 100, purchasePrice: 100 }))).toBe(0);
    expect(getInventorySavingsPerUnit(item({ currentPrice: undefined, purchasePrice: 100 }))).toBeNull();
    expect(getInventorySavingsPerUnit(item({ currentPrice: 100, purchasePrice: undefined }))).toBeNull();
  });

  it('aggregates only records with both price values and never includes wallet data', () => {
    const records = [
      item({ id: 'saved', currentPrice: 100, purchasePrice: 150, quantity: 2 }),
      item({ id: 'above', currentPrice: 200, purchasePrice: 150, quantity: 1 }),
      item({ id: 'missing', currentPrice: undefined, purchasePrice: 900, quantity: 10 }),
    ];

    expect(sumInventorySavings(records)).toBe(50);
    expect(sumInventorySavings([item({ currentPrice: undefined, purchasePrice: undefined })])).toBeNull();
  });

  it('keeps the hardening contracts visible in the Inventory surfaces', () => {
    expect(inventorySource).toContain('Actions for ${item.name}');
    expect(inventorySource).toContain('No items match these filters');
    expect(inventorySource).toContain('Clear filters');
    expect(inventorySource).toContain("getSectionDiscoveryMeta('inventory')?.firstActionLabel");
    expect(inventorySource).toContain('Preview image for ${item.name}');
    expect(inventorySource).toContain('Savings vs Current Price');
    expect(inventorySource).not.toContain('Total Assets');
    expect(inventorySource).not.toContain('Add Asset');
    expect(categorySource).toContain('View category');
    expect(categorySource).toContain('aria-label={`View ${cat.label} category`}');
    expect(categorySource).not.toContain('role="button"');
  });

  it('renders grid density controls only for Grid without resetting the saved density', () => {
    expect(inventorySource).toContain("{viewMode !== 'list' ? (");
    expect(inventorySource).not.toContain("viewMode === 'list' ? 'hidden' : ''");
    expect(inventorySource).toContain("setDetailMode('full')");
    expect(inventorySource).toContain("setDetailMode('simple')");
  });
});
