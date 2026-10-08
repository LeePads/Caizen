import { toLocalDateKey } from '@/lib/date-utils';
import { toFiniteMoney } from '@/lib/money';
import { buildXlsxWorkbook, xlsxHeader, xlsxMoneyCell, type XlsxCell } from '@/lib/reports/xlsx-workbook';
import { getLocalReportDateLabel, sanitizeExportFileName } from '@/lib/reports/export-utils';
import { csvCell } from '@/lib/reports/csv-cell';
import { convertFromBaseCurrency, getEffectiveMoneyInputCurrency } from '@/lib/currency';
import type { CurrencyCode, SkincareFrequency, SkincareProduct, SkincareProductType, SkincareSchedule } from '@/lib/types';

export type SkincareExportFormat = 'pdf' | 'xlsx' | 'csv';
export type SkincareExportScope = 'all' | 'current' | 'custom';
export type SkincareExportCustomFilters = {
  category: string;
  productType: 'all' | SkincareProductType;
  schedule: 'all' | SkincareSchedule;
  frequency: 'all' | SkincareFrequency;
  status: 'all' | 'active' | 'emptied';
  minPrice?: number;
  maxPrice?: number;
};
export type SkincareExportPdfOptions = { includeDetails: boolean; includeNotes: boolean; includeCategoryChart: boolean };
export type SkincareExportFilters = { search?: string; category?: string; productType?: string; schedule?: string; frequency?: string; status?: string; sort?: string; minPrice?: number; maxPrice?: number };

export type SkincareExportItem = {
  name: string; category: string; productType: string; purchasePrice?: number; currentPrice?: number; size: string;
  frequency: string; schedule: string; status: string; purchaseDate: string; startDate: string; finishedDate: string;
  notes: string; finishedNotes: string; wouldRepurchase: string; productLink: string;
};
export type SkincareExportCategory = { category: string; itemRecords: number; share: number; chartColorIndex: number };
export type SkincareExportChartSegment = { label: string; value: number; colorIndex: number; isOther?: boolean };
export type SkincareExportDocument = {
  title: 'Skincare Report'; profileName: string; generatedAt: Date; scope: SkincareExportScope; scopeLabel: string;
  filters: SkincareExportFilters; filterSummary: string; currency: string; items: SkincareExportItem[]; categories: SkincareExportCategory[];
  chart: { totalProducts: number; segments: SkincareExportChartSegment[] };
  routine: { morning: SkincareExportItem[]; evening: SkincareExportItem[] };
  summary: { itemRecords: number; activeCount: number; finishedCount: number; categoryCount: number; purchaseTotal: number | null; currentTotal: number | null };
};

const ITEM_HEADERS = ['Product', 'Category', 'Product Type', 'Purchase Price', 'Current/SRP', 'Size', 'Frequency', 'Routine', 'Status', 'Purchase Date', 'Start Date', 'Finished Date', 'Notes', 'Finished Notes', 'Would Repurchase', 'Product Link'] as const;
export const SKINCARE_CSV_HEADERS = ITEM_HEADERS;
const ROUTINE_HEADERS = ['Routine', 'Product', 'Category', 'Product Type', 'Status'] as const;
const PRODUCT_TYPES: Record<string, string> = { cleanser: 'Cleanser', moisturizer: 'Moisturizer', serum: 'Serum', sunscreen: 'Sunscreen', toner: 'Toner', mask: 'Mask', treatment: 'Treatment', shampoo: 'Shampoo', conditioner: 'Conditioner', 'body-wash': 'Body wash', deodorant: 'Deodorant', 'oral-care': 'Oral care', other: 'Other' };
const SCHEDULES: Record<string, string> = { morning: 'Morning', night: 'Night', both: 'Morning & night' };
const FREQUENCIES: Record<string, string> = { Daily: 'Daily', Weekly: 'Weekly', Custom: 'Custom' };
const optionalMoney = (value: unknown) => { if (value === undefined || value === null || value === '') return undefined; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? toFiniteMoney(parsed) : undefined; };
const sumKnown = (values: Array<number | undefined | null>) => { const known = values.filter((value): value is number => value !== undefined && value !== null); return known.length ? toFiniteMoney(known.reduce((sum, value) => sum + value, 0)) : null; };
const dateValue = (value?: Date | null) => value ? toLocalDateKey(value) : '';

function project(product: SkincareProduct): SkincareExportItem {
  return {
    name: product.name?.trim() || 'Untitled product', category: product.category?.trim() || 'Other', productType: PRODUCT_TYPES[product.productType || 'other'] || 'Other',
    purchasePrice: optionalMoney(product.purchasePrice), currentPrice: optionalMoney(product.currentPrice), size: product.size?.trim() || '', frequency: FREQUENCIES[product.frequency || 'Daily'] || 'Daily',
    schedule: SCHEDULES[product.schedule || 'both'] || 'Morning & night', status: product.status === 'emptied' ? 'Finished' : 'Active', purchaseDate: dateValue(product.purchaseDate), startDate: dateValue(product.startDate), finishedDate: dateValue(product.emptiedAt),
    notes: product.effects || '', finishedNotes: product.emptiedNotes || '', wouldRepurchase: product.wouldRepurchase ? ({ yes: 'Yes', no: 'No', maybe: 'Maybe' }[product.wouldRepurchase] || '') : '', productLink: product.productLink?.trim() || '',
  };
}

export function validateSkincareExportCustomFilters(filters: SkincareExportCustomFilters) {
  if (filters.minPrice !== undefined && (!Number.isFinite(filters.minPrice) || filters.minPrice < 0)) return 'Minimum price must be a non-negative number.';
  if (filters.maxPrice !== undefined && (!Number.isFinite(filters.maxPrice) || filters.maxPrice < 0)) return 'Maximum price must be a non-negative number.';
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) return 'Minimum price cannot be greater than maximum price.';
  return null;
}
export function filterSkincareProductsForExport(items: SkincareProduct[], filters: SkincareExportCustomFilters) {
  const error = validateSkincareExportCustomFilters(filters); if (error) throw new Error(error);
  return items.filter(item => {
    if (filters.category !== 'all' && (item.category?.trim() || 'Other') !== filters.category) return false;
    if (filters.productType !== 'all' && (item.productType || 'other') !== filters.productType) return false;
    if (filters.schedule !== 'all' && (item.schedule || 'both') !== filters.schedule) return false;
    if (filters.frequency !== 'all' && (item.frequency || 'Daily') !== filters.frequency) return false;
    if (filters.status !== 'all' && (item.status || 'active') !== filters.status) return false;
    if (filters.minPrice === undefined && filters.maxPrice === undefined) return true;
    const value = optionalMoney(item.purchasePrice); if (value === undefined) return false;
    return (filters.minPrice === undefined || value >= filters.minPrice) && (filters.maxPrice === undefined || value <= filters.maxPrice);
  });
}
export function resolveSkincareExportItems({ scope, items, currentItems, customFilters }: { scope: SkincareExportScope; items: SkincareProduct[]; currentItems: SkincareProduct[]; customFilters: SkincareExportCustomFilters }) {
  if (scope === 'current') return currentItems; if (scope === 'custom') return filterSkincareProductsForExport(items, customFilters); return items;
}

function chartFor(categories: SkincareExportCategory[]) {
  const ranked = [...categories].sort((a, b) => b.itemRecords - a.itemRecords || a.category.localeCompare(b.category));
  const top = ranked.slice(0, 6); const tail = ranked.slice(6); const segments: SkincareExportChartSegment[] = top.map((category, index) => ({ label: category.category, value: category.itemRecords, colorIndex: index }));
  if (tail.length) segments.push({ label: 'Other', value: tail.reduce((sum, category) => sum + category.itemRecords, 0), colorIndex: 6, isOther: true });
  const total = categories.reduce((sum, category) => sum + category.itemRecords, 0);
  categories.forEach(category => { const index = top.findIndex(entry => entry.category === category.category); category.chartColorIndex = index >= 0 ? index : 6; category.share = total ? category.itemRecords / total * 100 : 0; });
  return { totalProducts: total, segments };
}
function filterSummary(filters: SkincareExportFilters) {
  const entries = [filters.search ? `Search: ${filters.search}` : '', filters.category ? `Category: ${filters.category}` : '', filters.productType ? `Product type: ${filters.productType}` : '', filters.schedule ? `Routine: ${filters.schedule}` : '', filters.frequency ? `Frequency: ${filters.frequency}` : '', filters.status ? `Status: ${filters.status}` : '', filters.sort ? `Sort: ${filters.sort}` : '', filters.minPrice !== undefined ? `Purchase price from ${filters.minPrice.toLocaleString()}` : '', filters.maxPrice !== undefined ? `Purchase price up to ${filters.maxPrice.toLocaleString()}` : ''].filter(Boolean);
  return entries.length ? entries.join(' · ') : 'All filters';
}

export function buildSkincareExportDocument({ items, profileName = 'Skincare', scope = 'all', filters = {}, currency = 'PHP', generatedAt = new Date() }: { items: SkincareProduct[]; profileName?: string; scope?: SkincareExportScope; filters?: SkincareExportFilters; currency?: string; generatedAt?: Date }): SkincareExportDocument {
  const projected = items.map(project); const map = new Map<string, SkincareExportCategory>();
  projected.forEach(item => { const category = map.get(item.category) || { category: item.category, itemRecords: 0, share: 0, chartColorIndex: 6 }; category.itemRecords += 1; map.set(item.category, category); });
  const categories = [...map.values()].sort((a, b) => a.category.localeCompare(b.category)); const chart = chartFor(categories);
  const morning = projected.filter(item => item.schedule === 'Morning' || item.schedule === 'Morning & night'); const evening = projected.filter(item => item.schedule === 'Night' || item.schedule === 'Morning & night');
  return {
    title: 'Skincare Report', profileName: profileName.trim() || 'Skincare', generatedAt: new Date(generatedAt), scope, scopeLabel: scope === 'current' ? 'Current view' : scope === 'custom' ? 'Custom report' : 'All skincare', filters, filterSummary: filterSummary(filters), currency, items: projected, categories, chart, routine: { morning, evening },
    summary: { itemRecords: projected.length, activeCount: projected.filter(item => item.status === 'Active').length, finishedCount: projected.filter(item => item.status === 'Finished').length, categoryCount: categories.length, purchaseTotal: sumKnown(projected.map(item => item.purchasePrice)), currentTotal: sumKnown(projected.map(item => item.currentPrice)) },
  };
}

const moneyCell = (value: number | undefined | null, currency: string): XlsxCell => value === undefined || value === null ? { value: '' } : xlsxMoneyCell(convertFromBaseCurrency(value, getEffectiveMoneyInputCurrency(currency as CurrencyCode)));
export function buildSkincareCsv(document: SkincareExportDocument) { const rows = [ITEM_HEADERS, ...document.items.map(item => [item.name, item.category, item.productType, item.purchasePrice, item.currentPrice, item.size, item.frequency, item.schedule, item.status, item.purchaseDate, item.startDate, item.finishedDate, item.notes, item.finishedNotes, item.wouldRepurchase, item.productLink])]; return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`; }
function summaryRows(document: SkincareExportDocument): XlsxCell[][] { const { summary } = document; return [[{ value: 'Caizen Skincare Report', style: 1 }], [{ value: 'Profile' }, { value: document.profileName }], [{ value: 'Scope' }, { value: document.scopeLabel }], [{ value: 'Filters' }, { value: document.filterSummary }], [{ value: 'Generated' }, { value: getLocalReportDateLabel(document.generatedAt) }], [], xlsxHeader(['Summary', 'Value']), [{ value: 'Products' }, { value: summary.itemRecords }], [{ value: 'Active' }, { value: summary.activeCount }], [{ value: 'Finished' }, { value: summary.finishedCount }], [{ value: 'Category count' }, { value: summary.categoryCount }], [{ value: 'Purchase cost total' }, moneyCell(summary.purchaseTotal, document.currency)], [{ value: 'Current/SRP total' }, moneyCell(summary.currentTotal, document.currency)]]; }
function itemRows(document: SkincareExportDocument): XlsxCell[][] { return [xlsxHeader([...ITEM_HEADERS]), ...document.items.map(item => [{ value: item.name }, { value: item.category }, { value: item.productType }, moneyCell(item.purchasePrice, document.currency), moneyCell(item.currentPrice, document.currency), { value: item.size }, { value: item.frequency }, { value: item.schedule }, { value: item.status }, { value: item.purchaseDate }, { value: item.startDate }, { value: item.finishedDate }, { value: item.notes }, { value: item.finishedNotes }, { value: item.wouldRepurchase }, { value: item.productLink }])]; }
function routineRows(document: SkincareExportDocument): XlsxCell[][] { const rows: XlsxCell[][] = [xlsxHeader([...ROUTINE_HEADERS])]; [...document.routine.morning.map(item => ['Morning', item]), ...document.routine.evening.map(item => ['Evening', item])].forEach(([routine, item]) => { const product = item as SkincareExportItem; rows.push([{ value: routine as string }, { value: product.name }, { value: product.category }, { value: product.productType }, { value: product.status }]); }); return rows; }
export function buildSkincareXlsx(document: SkincareExportDocument) { return buildXlsxWorkbook([{ name: 'Summary', rows: summaryRows(document), widths: [30, 34] }, { name: 'Products', rows: itemRows(document), widths: [28, 18, 18, 18, 16, 14, 14, 18, 14, 16, 16, 16, 42, 42, 18, 42], filter: true }, { name: 'Routine', rows: routineRows(document), widths: [16, 28, 20, 18, 14], filter: true }]); }
export function getSkincareExportFileName(format: SkincareExportFormat, generatedAt = new Date()) { return `${sanitizeExportFileName(`Caizen-Skincare-${getLocalReportDateLabel(generatedAt)}`)}.${format}`; }
