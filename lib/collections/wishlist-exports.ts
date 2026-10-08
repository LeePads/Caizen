import { toLocalDateKey } from '@/lib/date-utils';
import { toFiniteMoney } from '@/lib/money';
import {
  buildXlsxWorkbook,
  xlsxHeader,
  xlsxMoneyCell,
  type XlsxCell,
} from '@/lib/reports/xlsx-workbook';
import { getLocalReportDateLabel, sanitizeExportFileName } from '@/lib/reports/export-utils';
import { csvCell } from '@/lib/reports/csv-cell';
import { convertFromBaseCurrency, getEffectiveMoneyInputCurrency } from '@/lib/currency';
import type { CurrencyCode, PlanType, PriorityLevel, WishlistItem, WishlistDestination } from '@/lib/types';

export type WishlistExportFormat = 'pdf' | 'xlsx' | 'csv';
export type WishlistExportScope = 'all' | 'current' | 'custom';

export type WishlistExportCustomFilters = {
  category: string;
  status: 'all' | 'wanted' | 'bought' | 'archived';
  priority: 'all' | PriorityLevel;
  minPrice?: number;
  maxPrice?: number;
};

export type WishlistExportPdfOptions = {
  includeDetails: boolean;
  includeNotes: boolean;
  includeCategoryChart: boolean;
};

export type WishlistExportFilters = {
  search?: string;
  category?: string;
  status?: string;
  priority?: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
};

export type WishlistExportItem = {
  name: string;
  type: string;
  category: string;
  priority: string;
  status: string;
  selected: boolean;
  estimatedPrice?: number;
  actualPrice?: number;
  targetDate: string;
  completedDate: string;
  purchaseDate: string;
  inventorySource: string;
  destination: string;
  notes: string;
  productLink: string;
};

export type WishlistExportCategory = {
  category: string;
  itemRecords: number;
  estimatedTotal: number | null;
  share: number | null;
  chartColorIndex: number;
};

export type WishlistExportChartSegment = {
  label: string;
  value: number;
  colorIndex: number;
  isOther?: boolean;
};

export type WishlistExportDocument = {
  title: 'Plans Report';
  profileName: string;
  generatedAt: Date;
  scope: WishlistExportScope;
  scopeLabel: string;
  filters: WishlistExportFilters;
  filterSummary: string;
  currency: string;
  items: WishlistExportItem[];
  categories: WishlistExportCategory[];
  chart: { totalEstimated: number | null; segments: WishlistExportChartSegment[] };
  summary: {
    itemRecords: number;
    estimatedTotal: number | null;
    actualPaidTotal: number | null;
    categoryCount: number;
    statusCounts: Record<string, number>;
    priorityCounts: Record<string, number>;
  };
};

const ITEM_HEADERS = [
  'Plan', 'Type', 'Category', 'Priority', 'Status', 'Selected', 'Estimated Cost',
  'Actual Cost', 'Target Date', 'Completed Date', 'Inventory Source', 'Destination', 'Notes', 'Reference URL',
] as const;
export const WISHLIST_CSV_HEADERS = ITEM_HEADERS;
const CATEGORY_HEADERS = ['Category', 'Item records', 'Estimated total', 'Share'] as const;

const priorityLabel = (value?: string) => ({ low: 'Low', medium: 'Medium', high: 'High' }[value || ''] || 'Medium');
const planTypeLabel = (value?: PlanType) => ({ item: 'Item', subscription: 'Subscription', health: 'Health', service: 'Service', travel: 'Travel', experience: 'Experience', other: 'Other' }[value || 'item'] || 'Item');
const statusLabel = (item: WishlistItem) => item.isArchived ? 'Archived' : item.isBought ? (item.type === 'item' || !item.type ? 'Purchased' : 'Completed') : 'Planned';
const destinationLabel = (value?: WishlistDestination) => ({
  inventory: 'Inventory', skincare: 'Skincare', supplements: 'Supplements', software: 'Software', subscription: 'Subscription', none: 'None',
}[value || ''] || '');
const optionalMoney = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? toFiniteMoney(parsed) : undefined;
};
const sumKnown = (values: Array<number | undefined | null>) => {
  const known = values.filter((value): value is number => value !== undefined && value !== null);
  return known.length ? toFiniteMoney(known.reduce((sum, value) => sum + value, 0)) : null;
};

function project(item: WishlistItem): WishlistExportItem {
  return {
    name: item.name?.trim() || 'Untitled plan',
    type: planTypeLabel(item.type),
    category: item.category?.trim() || 'Other',
    priority: priorityLabel(item.priority),
    status: statusLabel(item),
    selected: Boolean(item.selected),
    estimatedPrice: optionalMoney(item.estimatedPrice),
    actualPrice: optionalMoney(item.actualPrice),
    targetDate: item.targetDate ? toLocalDateKey(item.targetDate) : '',
    completedDate: item.isBought && (item.purchaseDate || item.purchaseCompletedAt) ? toLocalDateKey(item.purchaseDate || item.purchaseCompletedAt) : '',
    purchaseDate: item.purchaseDate ? toLocalDateKey(item.purchaseDate) : '',
    inventorySource: item.destinationType === 'inventory' && item.destinationItemId ? 'Inventory' : item.movedToInventory ? 'Legacy Wishlist handoff' : '',
    destination: destinationLabel(item.destinationType) || (item.movedToInventory ? 'Inventory' : ''),
    notes: item.notes || '',
    productLink: item.productLink?.trim() || '',
  };
}

export function validateWishlistExportCustomFilters(filters: WishlistExportCustomFilters) {
  if (filters.minPrice !== undefined && (!Number.isFinite(filters.minPrice) || filters.minPrice < 0)) return 'Minimum estimated cost must be a non-negative number.';
  if (filters.maxPrice !== undefined && (!Number.isFinite(filters.maxPrice) || filters.maxPrice < 0)) return 'Maximum estimated cost must be a non-negative number.';
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) return 'Minimum estimated cost cannot be greater than maximum estimated cost.';
  return null;
}

export function filterWishlistItemsForExport(items: WishlistItem[], filters: WishlistExportCustomFilters) {
  const error = validateWishlistExportCustomFilters(filters);
  if (error) throw new Error(error);
  return items.filter(item => {
    if (filters.category !== 'all' && (item.category?.trim() || 'Other') !== filters.category) return false;
    const status = item.isArchived ? 'archived' : item.isBought ? 'bought' : 'wanted';
    if (filters.status !== 'all' && status !== filters.status) return false;
    if (filters.priority !== 'all' && (item.priority || 'medium') !== filters.priority) return false;
    if (filters.minPrice === undefined && filters.maxPrice === undefined) return true;
    const price = optionalMoney(item.estimatedPrice);
    if (price === undefined) return false;
    if (filters.minPrice !== undefined && price < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && price > filters.maxPrice) return false;
    return true;
  });
}

export function resolveWishlistExportItems({ scope, items, currentItems, customFilters }: { scope: WishlistExportScope; items: WishlistItem[]; currentItems: WishlistItem[]; customFilters: WishlistExportCustomFilters }) {
  if (scope === 'current') return currentItems;
  if (scope === 'custom') return filterWishlistItemsForExport(items, customFilters);
  return items;
}

function chartFor(categories: WishlistExportCategory[]) {
  const ranked = categories.filter(category => category.estimatedTotal !== null).sort((a, b) => (b.estimatedTotal || 0) - (a.estimatedTotal || 0) || a.category.localeCompare(b.category));
  const totalEstimated = sumKnown(ranked.map(category => category.estimatedTotal));
  if (totalEstimated === null || totalEstimated === 0) return { totalEstimated, segments: [] as WishlistExportChartSegment[] };
  const top = ranked.slice(0, 6);
  const tail = ranked.slice(6);
  const segments: WishlistExportChartSegment[] = top.map((category, index) => ({ label: category.category, value: category.estimatedTotal || 0, colorIndex: index }));
  if (tail.length) segments.push({ label: 'Other', value: toFiniteMoney(tail.reduce((sum, category) => sum + (category.estimatedTotal || 0), 0)), colorIndex: 6, isOther: true });
  categories.forEach(category => {
    const index = top.findIndex(entry => entry.category === category.category);
    category.chartColorIndex = index >= 0 ? index : 6;
    category.share = category.estimatedTotal === null ? null : category.estimatedTotal / totalEstimated * 100;
  });
  return { totalEstimated, segments };
}

function filterSummary(filters: WishlistExportFilters) {
  const entries = [
    filters.search ? `Search: ${filters.search}` : '',
    filters.category ? `Category: ${filters.category}` : '',
    filters.status ? `Status: ${filters.status}` : '',
    filters.priority ? `Priority: ${filters.priority}` : '',
    filters.sort ? `Sort: ${filters.sort}` : '',
    filters.minPrice !== undefined ? `Estimated cost from ${filters.minPrice.toLocaleString()}` : '',
    filters.maxPrice !== undefined ? `Estimated cost up to ${filters.maxPrice.toLocaleString()}` : '',
  ].filter(Boolean);
  return entries.length ? entries.join(' · ') : 'All filters';
}

export function buildWishlistExportDocument({ items, profileName = 'Plans', scope = 'all', filters = {}, currency = 'PHP', generatedAt = new Date() }: { items: WishlistItem[]; profileName?: string; scope?: WishlistExportScope; filters?: WishlistExportFilters; currency?: string; generatedAt?: Date }): WishlistExportDocument {
  const projected = items.map(project);
  const categoryMap = new Map<string, WishlistExportCategory>();
  projected.forEach(item => {
    const category = categoryMap.get(item.category) || { category: item.category, itemRecords: 0, estimatedTotal: null, share: null, chartColorIndex: 6 };
    category.itemRecords += 1;
    category.estimatedTotal = sumKnown([category.estimatedTotal, item.estimatedPrice]);
    categoryMap.set(item.category, category);
  });
  const categories = [...categoryMap.values()].sort((a, b) => a.category.localeCompare(b.category));
  const statusTotals: Record<string, number> = {};
  const priorityTotals: Record<string, number> = {};
  projected.forEach(item => { statusTotals[item.status] = (statusTotals[item.status] || 0) + 1; priorityTotals[item.priority] = (priorityTotals[item.priority] || 0) + 1; });
  const statusCounts = Object.fromEntries(Object.keys(statusTotals).sort().map(label => [label, statusTotals[label]]));
  const priorityCounts = Object.fromEntries(['Low', 'Medium', 'High'].filter(label => priorityTotals[label]).map(label => [label, priorityTotals[label]]));
  return {
    title: 'Plans Report', profileName: profileName.trim() || 'Plans', generatedAt: new Date(generatedAt), scope,
    scopeLabel: scope === 'current' ? 'Current view' : scope === 'custom' ? 'Custom report' : 'All plans',
    filters, filterSummary: filterSummary(filters), currency, items: projected, categories, chart: chartFor(categories),
    summary: { itemRecords: projected.length, estimatedTotal: sumKnown(projected.map(item => item.estimatedPrice)), actualPaidTotal: sumKnown(projected.map(item => item.actualPrice)), categoryCount: categories.length, statusCounts, priorityCounts },
  };
}

const optionalMoneyCell = (value: number | undefined | null, currency: string): XlsxCell => value === undefined || value === null ? { value: '' } : xlsxMoneyCell(convertFromBaseCurrency(value, getEffectiveMoneyInputCurrency(currency as CurrencyCode)));

export function buildWishlistCsv(document: WishlistExportDocument) {
  const rows = [ITEM_HEADERS, ...document.items.map(item => [item.name, item.type, item.category, item.priority, item.status, item.selected, item.estimatedPrice, item.actualPrice, item.targetDate, item.completedDate, item.inventorySource, item.destination, item.notes, item.productLink])];
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function summaryRows(document: WishlistExportDocument): XlsxCell[][] {
  const { summary } = document;
  const rows: XlsxCell[][] = [
    [{ value: 'Caizen Plans Report', style: 1 }], [{ value: 'Profile' }, { value: document.profileName }], [{ value: 'Scope' }, { value: document.scopeLabel }], [{ value: 'Filters' }, { value: document.filterSummary }], [{ value: 'Generated' }, { value: getLocalReportDateLabel(document.generatedAt) }], [], xlsxHeader(['Summary', 'Value']),
    [{ value: 'Plans' }, { value: summary.itemRecords }], [{ value: 'Estimated total' }, optionalMoneyCell(summary.estimatedTotal, document.currency)], [{ value: 'Actual paid total' }, optionalMoneyCell(summary.actualPaidTotal, document.currency)], [{ value: 'Category count' }, { value: summary.categoryCount }],
  ];
  rows.push([], xlsxHeader(['Status', 'Item records'])); Object.entries(summary.statusCounts).forEach(([status, count]) => rows.push([{ value: status }, { value: count }]));
  rows.push([], xlsxHeader(['Priority', 'Item records'])); Object.entries(summary.priorityCounts).forEach(([priority, count]) => rows.push([{ value: priority }, { value: count }]));
  return rows;
}

function itemRows(document: WishlistExportDocument): XlsxCell[][] {
  return [xlsxHeader([...ITEM_HEADERS]), ...document.items.map(item => [{ value: item.name }, { value: item.type }, { value: item.category }, { value: item.priority }, { value: item.status }, { value: item.selected }, optionalMoneyCell(item.estimatedPrice, document.currency), optionalMoneyCell(item.actualPrice, document.currency), { value: item.targetDate }, { value: item.completedDate }, { value: item.inventorySource }, { value: item.destination }, { value: item.notes }, { value: item.productLink }])];
}

function categoryRows(document: WishlistExportDocument): XlsxCell[][] {
  return [xlsxHeader([...CATEGORY_HEADERS]), ...document.categories.map(category => [{ value: category.category }, { value: category.itemRecords }, optionalMoneyCell(category.estimatedTotal, document.currency), { value: category.share === null ? '' : `${category.share.toFixed(1)}%` }])];
}

export function buildWishlistXlsx(document: WishlistExportDocument) {
  return buildXlsxWorkbook([{ name: 'Summary', rows: summaryRows(document), widths: [30, 34] }, { name: 'Plans', rows: itemRows(document), widths: [28, 16, 22, 14, 14, 12, 18, 16, 16, 18, 20, 18, 42, 42], filter: true }, { name: 'Categories', rows: categoryRows(document), widths: [24, 16, 20, 14], filter: true }]);
}

export function getWishlistExportFileName(format: WishlistExportFormat, generatedAt = new Date()) {
  return `${sanitizeExportFileName(`Caizen-Plans-${getLocalReportDateLabel(generatedAt)}`)}.${format}`;
}
