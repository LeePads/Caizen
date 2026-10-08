import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildSkincareCsv, buildSkincareExportDocument, buildSkincareXlsx, filterSkincareProductsForExport } from '@/lib/collections/skincare-exports';
import type { SkincareProduct } from '@/lib/types';

const product = (overrides: Partial<SkincareProduct> = {}): SkincareProduct => ({ id: 'skincare-secret', name: 'Daily Serum', category: 'Face', productType: 'serum', purchasePrice: 500, currentPrice: undefined, frequency: 'Daily', schedule: 'morning', effects: 'Use gently', status: 'active', createdAt: new Date('2026-08-20'), ...overrides });

describe('Skincare exports', () => {
  it('builds routine, status, price, and category data', () => {
    const report = buildSkincareExportDocument({ items: [product(), product({ id: 'finished', name: 'Night Cream', category: 'Body', productType: 'moisturizer', schedule: 'both', status: 'emptied', purchasePrice: 300, currentPrice: 250 })] });
    expect(report.summary).toMatchObject({ itemRecords: 2, activeCount: 1, finishedCount: 1, purchaseTotal: 800, currentTotal: 250 });
    expect(report.routine.morning).toHaveLength(2);
    expect(report.routine.evening).toHaveLength(1);
    expect(report.categories.map(category => category.category)).toEqual(['Body', 'Face']);
  });

  it('filters by existing fields and purchase-price bounds', () => {
    const records = [product({ id: 'match', category: 'Face', productType: 'serum', schedule: 'morning', frequency: 'Daily', purchasePrice: 500 }), product({ id: 'wrong', category: 'Body', purchasePrice: 100 })];
    expect(filterSkincareProductsForExport(records, { category: 'Face', productType: 'serum', schedule: 'morning', frequency: 'Daily', status: 'active', minPrice: 400, maxPrice: 600 }).map(record => record.id)).toEqual(['match']);
    expect(() => filterSkincareProductsForExport(records, { category: 'all', productType: 'all', schedule: 'all', frequency: 'all', status: 'all', minPrice: 600, maxPrice: 400 })).toThrow('Minimum price cannot be greater than maximum price.');
  });

  it('keeps notes and exact XLSX sheets without IDs', async () => {
    const report = buildSkincareExportDocument({ items: [product({ effects: 'Unicode ✓\nLong note' })] });
    expect(buildSkincareCsv(report)).toContain('\uFEFFProduct,Category,Product Type');
    expect(buildSkincareCsv(report)).toContain('Unicode ✓');
    const files = unzipSync(new Uint8Array(await buildSkincareXlsx(report).arrayBuffer()));
    const workbook = strFromU8(files['xl/workbook.xml']);
    expect([...workbook.matchAll(/<sheet name="([^"]+)"/g)].map(match => match[1])).toEqual(['Summary', 'Products', 'Routine']);
    expect(JSON.stringify(report)).not.toContain('skincare-secret');
  });
});
