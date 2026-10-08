import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

import {
  buildInventoryCsv,
  buildInventoryExportDocument,
  buildInventoryXlsx,
  filterInventoryItemsForExport,
  getInventoryExportFileName,
  resolveInventoryExportItems,
  validateInventoryExportCustomFilters,
} from '@/lib/collections/inventory-exports';
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
  purchasePrice: 80,
  replacementCost: 120,
  status: 'using',
  notes: 'Keep nearby',
  productLink: 'https://example.test/item',
  photoAssetIds: ['photo-secret'],
  receiptAssetIds: ['receipt-secret'],
  createdAt: new Date('2026-08-20T12:00:00'),
  ...overrides,
});

const printableSource = readFileSync(resolve(process.cwd(), 'components/inventory/reports/PrintableInventoryReport.tsx'), 'utf8');
const exportModalSource = readFileSync(resolve(process.cwd(), 'components/modals/InventoryExportModal.tsx'), 'utf8');

describe('Inventory report exports', () => {
  const customFilters = {
    category: 'all',
    subcategory: 'all',
    status: 'all' as const,
    location: 'all',
    acquisitionType: 'all' as const,
    valueMetric: 'currentValue' as const,
  };

  it('keeps quantity and unit on rows without incompatible-unit totals', () => {
    const document = buildInventoryExportDocument({
      profileName: 'Cai',
      scope: 'current',
      filters: { search: 'kit', category: 'utilities', sort: 'price_high' },
      generatedAt: new Date('2026-08-24T12:00:00'),
      items: [
        item({ id: 'pcs', name: 'Cable kit', quantity: 2, unit: 'pcs', currentPrice: 100, purchasePrice: 80, category: 'utilities' }),
        item({ id: 'kg', name: 'Rice', quantity: 3, unit: 'kg', currentPrice: 50, purchasePrice: 40, category: 'home', replacementCost: undefined }),
        item({ id: 'boxes', name: 'Boxes', quantity: 4, unit: 'boxes', currentPrice: 25, purchasePrice: 20, category: 'utilities' }),
        item({ id: 'liters', name: 'Cleaner', quantity: 5, unit: 'liters', currentPrice: 10, purchasePrice: 8, category: 'home' }),
      ],
    });

    expect(document.scopeLabel).toBe('Current view');
    expect(document.filterSummary).toContain('Search: kit');
    expect(document.items.map(row => [row.quantity, row.unit])).toEqual([
      [2, 'pcs'], [3, 'kg'], [4, 'boxes'], [5, 'liters'],
    ]);
    expect(document.summary).toMatchObject({
      itemRecords: 4,
      purchaseCostTotal: 500,
      currentValueTotal: 400,
      replacementCostTotal: 1320,
      replacementEstimateCount: 3,
      savingsVsCurrentPriceTotal: -100,
      savingsEstimateCount: 4,
      categoryCount: 2,
    });
    expect(document.summary).not.toHaveProperty('totalQuantity');
    expect(document.categories[0]).not.toHaveProperty('quantity');
    expect(document.categories.every(category => !('quantity' in category))).toBe(true);
  });

  it('preserves the historical Inventory price mapping and optional fields', () => {
    const document = buildInventoryExportDocument({
      items: [item({ currentPrice: 125.55, purchasePrice: 90.25, replacementCost: undefined, subCategory: undefined, storageLocation: undefined, notes: undefined, productLink: undefined })],
    });
    expect(document.items[0]).toMatchObject({ purchaseCost: 125.55, currentValue: 90.25, savingsVsCurrentPrice: -35.3, replacementCost: undefined, subcategory: '', location: '', notes: '', productLink: '' });
  });

  it('escapes CSV values, includes a BOM, and uses the report filename contract', () => {
    const document = buildInventoryExportDocument({
      generatedAt: new Date('2026-08-24T12:00:00'),
      items: [item({ name: 'Comma, "quote"', notes: 'Line one\nLine two', unit: 'kg' })],
    });
    const csv = buildInventoryCsv(document);
    expect(csv.startsWith('\uFEFFItem,Category,Subcategory')).toBe(true);
    expect(csv).toContain('"Comma, ""quote"""');
    expect(csv).toContain('"Line one\nLine two"');
    expect(csv).toContain(',kg,');
    expect(getInventoryExportFileName('pdf', document.generatedAt)).toBe('Caizen-Inventory-2026-08-24.pdf');
    expect(getInventoryExportFileName('xlsx', document.generatedAt)).toBe('Caizen-Inventory-2026-08-24.xlsx');
    expect(getInventoryExportFileName('csv', document.generatedAt)).toBe('Caizen-Inventory-2026-08-24.csv');
  });

  it('creates exactly Summary, Items, and Categories XLSX sheets', async () => {
    const document = buildInventoryExportDocument({ items: [item({ quantity: 2, unit: 'pcs' })] });
    const files = unzipSync(new Uint8Array(await buildInventoryXlsx(document).arrayBuffer()));
    const workbook = strFromU8(files['xl/workbook.xml']);
    const itemsSheet = strFromU8(files['xl/worksheets/sheet2.xml']);
    const categoriesSheet = strFromU8(files['xl/worksheets/sheet3.xml']);

    expect([...workbook.matchAll(/<sheet name="([^"]+)"/g)].map(match => match[1])).toEqual(['Summary', 'Items', 'Categories']);
    expect(workbook).not.toContain('Wallets');
    expect(itemsSheet).toContain('Quantity');
    expect(itemsSheet).toContain('Unit');
    expect(itemsSheet).toContain('Product Link');
    expect(itemsSheet).toContain('Savings vs Current Price');
    expect(categoriesSheet).toContain('Known purchase cost total');
    expect(categoriesSheet).toContain('Savings vs current price total');
    expect(categoriesSheet).not.toContain('Quantity');
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).not.toContain('Total quantity');
  });

  it('does not serialize IDs, media references, or raw inventory objects', () => {
    const document = buildInventoryExportDocument({ items: [item({ id: 'secret-id', photoAssetIds: ['secret-photo'], receiptAssetIds: ['secret-receipt'] })] });
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain('secret-id');
    expect(serialized).not.toContain('secret-photo');
    expect(serialized).not.toContain('secret-receipt');
    expect(serialized).not.toContain('profileId');
  });

  it('handles 100-plus rows and status aggregation without changing the row shape', () => {
    const document = buildInventoryExportDocument({
      items: Array.from({ length: 125 }, (_, index) => item({ id: `large-${index}`, name: `Asset ${index}`, quantity: index + 1, unit: index % 2 ? 'pcs' : 'boxes', status: index % 2 ? 'stored' : 'using' })),
    });
    expect(document.items).toHaveLength(125);
    expect(document.summary.statusCounts).toEqual({ Stored: 62, Using: 63 });
    expect(document.items[124]).toMatchObject({ quantity: 125, unit: 'boxes' });
  });

  it('filters a custom report using existing fields and keeps the operation ephemeral', () => {
    const records = [
      item({ id: 'match', name: 'Match', category: 'personal_tech', subCategory: 'Device', status: 'using', storageLocation: 'Desk', acquisitionType: 'bought', purchasePrice: 250 }),
      item({ id: 'wrong-category', name: 'Wrong category', category: 'home', subCategory: 'Appliance', storageLocation: 'Desk', acquisitionType: 'bought', purchasePrice: 250 }),
      item({ id: 'wrong-value', name: 'Wrong value', category: 'personal_tech', subCategory: 'Device', storageLocation: 'Desk', acquisitionType: 'bought', purchasePrice: 900 }),
    ];
    const filtered = filterInventoryItemsForExport(records, {
      ...customFilters,
      category: 'personal_tech',
      subcategory: 'Device',
      status: 'using',
      location: 'Desk',
      acquisitionType: 'bought',
      minValue: 200,
      maxValue: 300,
    });
    expect(filtered.map(record => record.id)).toEqual(['match']);
    expect(customFilters.category).toBe('all');
  });

  it('supports all range bounds and rejects invalid bounds', () => {
    const records = [item({ id: 'low', purchasePrice: 10, replacementCost: 20 }), item({ id: 'mid', purchasePrice: 50, replacementCost: 60 }), item({ id: 'high', purchasePrice: 100, replacementCost: 120 })];
    expect(filterInventoryItemsForExport(records, { ...customFilters, minValue: 50 }).map(record => record.id)).toEqual(['mid', 'high']);
    expect(filterInventoryItemsForExport(records, { ...customFilters, maxValue: 50 }).map(record => record.id)).toEqual(['low', 'mid']);
    expect(filterInventoryItemsForExport(records, { ...customFilters, valueMetric: 'replacementCost', minValue: 20, maxValue: 60 }).map(record => record.id)).toEqual(['low', 'mid']);
    expect(validateInventoryExportCustomFilters({ ...customFilters, minValue: 80, maxValue: 20 })).toContain('cannot be greater');
    expect(() => filterInventoryItemsForExport(records, { ...customFilters, minValue: 80, maxValue: 20 })).toThrow();
  });

  it('resolves all, current, and custom scopes before document aggregation', async () => {
    const all = [item({ id: 'all-1', purchasePrice: 10 }), item({ id: 'all-2', purchasePrice: 20 })];
    const current = [all[1]];
    expect(resolveInventoryExportItems({ scope: 'all', items: all, currentItems: current, customFilters })).toEqual(all);
    expect(resolveInventoryExportItems({ scope: 'current', items: all, currentItems: current, customFilters })).toEqual(current);
    const selected = resolveInventoryExportItems({ scope: 'custom', items: all, currentItems: current, customFilters: { ...customFilters, minValue: 20 } });
    const document = buildInventoryExportDocument({ items: selected, scope: 'custom' });
    expect(selected).toEqual([all[1]]);
    expect(document.summary.itemRecords).toBe(1);
    expect(buildInventoryCsv(document)).toContain('Desk item');
    expect(strFromU8(unzipSync(new Uint8Array(await buildInventoryXlsx(document).arrayBuffer()))['xl/worksheets/sheet2.xml'])).toContain('Desk item');
  });

  it('builds top-six plus Other chart data from current value without quantity totals', () => {
    const records = Array.from({ length: 8 }, (_, index) => item({
      id: `category-${index}`,
      category: `category-${index}` as InventoryItem['category'],
      name: `Category asset ${index}`,
      quantity: index + 1,
      purchasePrice: 100 - index,
    }));
    const document = buildInventoryExportDocument({ items: records });
    expect(document.chart.segments).toHaveLength(7);
    expect(document.chart.segments.at(-1)).toMatchObject({ label: 'Other', isOther: true });
    expect(document.categories.every(category => !('quantity' in category))).toBe(true);
  });

  it('preserves missing values as blank/— and does not invent chart data', () => {
    const document = buildInventoryExportDocument({ items: [item({ currentPrice: undefined, purchasePrice: undefined, replacementCost: undefined })] });
    expect(document.items[0]).toMatchObject({ purchaseCost: undefined, currentValue: undefined, savingsVsCurrentPrice: undefined, replacementCost: undefined });
    expect(document.summary.purchaseCostTotal).toBeNull();
    expect(document.summary.currentValueTotal).toBeNull();
    expect(document.summary.savingsVsCurrentPriceTotal).toBeNull();
    expect(document.summary.savingsEstimateCount).toBe(0);
    expect(document.chart.segments).toEqual([]);
    expect(buildInventoryCsv(document)).toContain('Desk item,Utilities,');
  });

  it('keeps missing-value rows in an unbounded custom report', () => {
    const records = [item({ id: 'missing', purchasePrice: undefined }), item({ id: 'known', purchasePrice: 20 })];
    expect(filterInventoryItemsForExport(records, customFilters).map(record => record.id)).toEqual(['missing', 'known']);
  });

  it('keeps PDF-only notes/chart controls and browser guidance out of structured exports', () => {
    expect(exportModalSource).toContain('For a clean PDF, turn off Headers and footers in the print dialog.');
    expect(exportModalSource).toContain('includeNotes: false');
    expect(exportModalSource).toContain('includeCategoryChart: true');
    expect(printableSource).toContain('pdfOptions.includeNotes');
    expect(printableSource).toContain('inventory-print-notes-section');
    expect(printableSource).toContain('Savings vs Current Price');
    expect(printableSource).not.toContain('<th>Product Link</th>');
    expect(printableSource).not.toContain('<th>Notes</th>');
  });
});
