import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildWishlistCsv, buildWishlistExportDocument, buildWishlistXlsx, filterWishlistItemsForExport, getWishlistExportFileName, resolveWishlistExportItems } from '@/lib/collections/wishlist-exports';
import type { WishlistItem } from '@/lib/types';

const item = (overrides: Partial<WishlistItem> = {}): WishlistItem => ({ id: 'wish-secret', name: 'Headphones', category: 'Tech', estimatedPrice: 100, actualPrice: undefined, selected: true, priority: 'high', isBought: false, isArchived: false, notes: 'Line one\nLine two', productLink: 'https://example.test/item', createdAt: new Date('2026-08-20'), ...overrides });

describe('Wishlist exports', () => {
  it('preserves status, priority, optional prices, and summaries', () => {
    const report = buildWishlistExportDocument({ items: [item(), item({ id: 'bought', name: 'Bought item', isBought: true, selected: false, estimatedPrice: 50, actualPrice: 45, category: 'Home' }), item({ id: 'archived', isArchived: true, selected: false, estimatedPrice: 0 })], generatedAt: new Date('2026-08-24') });
    expect(report.summary).toMatchObject({ itemRecords: 3, estimatedTotal: 150, actualPaidTotal: 45, categoryCount: 2 });
    expect(report.summary.statusCounts).toEqual({ Archived: 1, Planned: 1, Purchased: 1 });
    expect(report.items[0]).toMatchObject({ type: 'Item', priority: 'High', status: 'Planned', selected: true });
    expect(report.items[2].actualPrice).toBeUndefined();
  });

  it('filters custom reports and resolves all scopes', () => {
    const all = [item({ id: 'a', category: 'Tech', estimatedPrice: 100 }), item({ id: 'b', category: 'Home', estimatedPrice: 20 }), item({ id: 'c', priority: 'low', estimatedPrice: 50 })];
    const current = [all[1]];
    expect(resolveWishlistExportItems({ scope: 'all', items: all, currentItems: current, customFilters: { category: 'all', status: 'all', priority: 'all' } })).toEqual(all);
    expect(resolveWishlistExportItems({ scope: 'current', items: all, currentItems: current, customFilters: { category: 'all', status: 'all', priority: 'all' } })).toEqual(current);
    expect(filterWishlistItemsForExport(all, { category: 'Tech', status: 'wanted', priority: 'all', minPrice: 80, maxPrice: 120 }).map(value => value.id)).toEqual(['a']);
    expect(() => filterWishlistItemsForExport(all, { category: 'all', status: 'all', priority: 'all', minPrice: 120, maxPrice: 80 })).toThrow('Minimum estimated cost cannot be greater than maximum estimated cost.');
  });

  it('keeps CSV portable and XLSX sheets bounded', async () => {
    const report = buildWishlistExportDocument({ items: [item({ name: 'Comma, "quoted"', notes: 'One\nTwo' })], generatedAt: new Date('2026-08-24') });
    expect(buildWishlistCsv(report)).toContain('\uFEFFPlan,Type,Category,Priority');
    expect(buildWishlistCsv(report)).toContain('"Comma, ""quoted"""');
    expect(getWishlistExportFileName('pdf', report.generatedAt)).toBe('Caizen-Plans-2026-08-24.pdf');
    const workbook = strFromU8(unzipSync(new Uint8Array(await buildWishlistXlsx(report).arrayBuffer()))['xl/workbook.xml']);
    expect([...workbook.matchAll(/<sheet name="([^"]+)"/g)].map(match => match[1])).toEqual(['Summary', 'Plans', 'Categories']);
    expect(JSON.stringify(report)).not.toContain('wish-secret');
  });
});
