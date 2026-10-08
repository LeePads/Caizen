import { toLocalDateKey } from '@/lib/date-utils';
import { toFiniteMoney } from '@/lib/money';
import {
  buildXlsxWorkbook,
  xlsxHeader,
  xlsxMoneyCell,
  type XlsxCell,
} from '@/lib/reports/xlsx-workbook';
import { sanitizeExportFileName, getLocalReportDateLabel } from '@/lib/reports/export-utils';
import { csvCell } from '@/lib/reports/csv-cell';
import {
  getInventoryCurrentValueIfKnown,
  getInventoryPurchaseCostIfKnown,
  getInventorySavingsPerUnit,
} from '@/lib/collections/inventory-metrics';
import { normalizeInventoryCategoryKey } from '@/lib/collections/inventory-taxonomy';
import { convertFromBaseCurrency, getEffectiveMoneyInputCurrency } from '@/lib/currency';
import type { CurrencyCode, InventoryItem, InventoryStatus } from '@/lib/types';

export type InventoryExportFormat = 'csv' | 'xlsx' | 'pdf';
export type InventoryExportScope = 'all' | 'current' | 'custom';
export type InventoryExportValueMetric = 'purchaseCost' | 'currentValue' | 'replacementCost';

export type InventoryExportCustomFilters = {
  category: string;
  subcategory: string;
  status: 'all' | InventoryStatus;
  location: string;
  acquisitionType: 'all' | NonNullable<InventoryItem['acquisitionType']>;
  valueMetric: InventoryExportValueMetric;
  minValue?: number;
  maxValue?: number;
};

export type InventoryExportPdfOptions = {
  includeDetails: boolean;
  includeNotes: boolean;
  includeCategoryChart: boolean;
};

export type InventoryExportFilters = {
  search?: string;
  category?: string;
  subcategory?: string;
  status?: string;
  location?: string;
  sort?: string;
  acquisitionType?: string;
  valueMetric?: InventoryExportValueMetric;
  minValue?: number;
  maxValue?: number;
};

export type InventoryExportItem = {
  name: string;
  category: string;
  subcategory: string;
  quantity: number;
  unit: string;
  purchaseCost?: number;
  currentValue?: number;
  savingsVsCurrentPrice?: number;
  replacementCost?: number;
  status: string;
  location: string;
  acquisition: string;
  acquired: string;
  notes: string;
  productLink: string;
};

export type InventoryExportCategory = {
  category: string;
  itemRecords: number;
  purchaseCostKnownCount: number;
  currentValueKnownCount: number;
  purchaseCostTotal: number | null;
  currentValueTotal: number | null;
  savingsVsCurrentPriceTotal: number | null;
  share: number | null;
  chartColorIndex: number;
};

export type InventoryExportChartSegment = {
  label: string;
  value: number;
  colorIndex: number;
  isOther?: boolean;
};

export type InventoryExportSummary = {
  itemRecords: number;
  purchaseCostKnownCount: number;
  currentValueKnownCount: number;
  purchaseCostTotal: number | null;
  currentValueTotal: number | null;
  savingsVsCurrentPriceTotal: number | null;
  savingsEstimateCount: number;
  replacementCostTotal: number | null;
  replacementEstimateCount: number;
  categoryCount: number;
  statusCounts: Record<string, number>;
};

export type InventoryExportDocument = {
  title: 'Inventory Report';
  profileName: string;
  generatedAt: Date;
  scope: InventoryExportScope;
  scopeLabel: string;
  filters: InventoryExportFilters;
  filterSummary: string;
  currency: string;
  items: InventoryExportItem[];
  categories: InventoryExportCategory[];
  chart: {
    totalCurrentValue: number | null;
    segments: InventoryExportChartSegment[];
  };
  summary: InventoryExportSummary;
};

const ITEM_HEADERS = [
  'Item',
  'Category',
  'Subcategory',
  'Quantity',
  'Unit',
  'Purchase Cost (unit)',
  'Current Value (unit)',
  'Savings vs Current Price (unit)',
  'Replacement Cost (unit)',
  'Status',
  'Location',
  'Acquisition',
  'Acquired',
  'Notes',
  'Product Link',
] as const;

export const INVENTORY_CSV_HEADERS = ITEM_HEADERS;

const CATEGORY_HEADERS = ['Category', 'Item records', 'Known purchase cost total', 'Purchase cost records', 'Known current value total', 'Current value records', 'Savings vs current price total'] as const;

function normalizeCategory(category?: string) {
  return normalizeInventoryCategoryKey(category);
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    personal_tech: 'Personal Tech',
    utilities: 'Utilities',
    wearables: 'Wearables',
    home: 'Home',
  };
  return labels[category] || category.replace(/[_-]/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    using: 'Using',
    stored: 'Stored',
    maintenance: 'Maintenance',
    replace: 'Replace soon',
    retired: 'Retired',
    broken: 'Retired',
    archived: 'Archived',
  };
  return labels[status || ''] || 'Using';
}

function acquisitionLabel(value?: InventoryItem['acquisitionType']) {
  const labels: Record<string, string> = {
    bought: 'Bought',
    included: 'Included',
    gift: 'Gift',
    free: 'Free',
    unknown: 'Unknown',
  };
  return labels[value || ''] || 'Unknown';
}

function finiteQuantity(value: unknown) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= 0 ? toFiniteMoney(quantity) : 0;
}

function optionalMoney(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? toFiniteMoney(number) : undefined;
}

function normalizedSubcategory(value?: string) {
  return value?.trim().toLocaleLowerCase() || 'uncategorized';
}

function itemMetricValue(item: InventoryItem, metric: InventoryExportValueMetric) {
  if (metric === 'purchaseCost') return getInventoryPurchaseCostIfKnown(item) ?? undefined;
  if (metric === 'currentValue') return getInventoryCurrentValueIfKnown(item) ?? undefined;
  return optionalMoney(item.replacementCost);
}

export function validateInventoryExportCustomFilters(filters: InventoryExportCustomFilters) {
  const { minValue, maxValue } = filters;
  if (minValue !== undefined && (!Number.isFinite(minValue) || minValue < 0)) {
    return 'Minimum value must be a non-negative number.';
  }
  if (maxValue !== undefined && (!Number.isFinite(maxValue) || maxValue < 0)) {
    return 'Maximum value must be a non-negative number.';
  }
  if (minValue !== undefined && maxValue !== undefined && minValue > maxValue) {
    return 'Minimum value cannot be greater than maximum value.';
  }
  return null;
}

export function filterInventoryItemsForExport(items: InventoryItem[], filters: InventoryExportCustomFilters) {
  const validationError = validateInventoryExportCustomFilters(filters);
  if (validationError) throw new Error(validationError);

  return items.filter(item => {
    const category = normalizeCategory(item.category);
    if (filters.category !== 'all' && category !== normalizeCategory(filters.category)) return false;
    if (filters.subcategory !== 'all' && normalizedSubcategory(item.subCategory) !== normalizedSubcategory(filters.subcategory)) return false;
    const itemStatus = (item.status as string | undefined) === 'broken' ? 'retired' : item.status || 'using';
    if (filters.status !== 'all' && itemStatus !== filters.status) return false;
    if (filters.location !== 'all' && (item.storageLocation?.trim() || '') !== filters.location) return false;
    if (filters.acquisitionType !== 'all' && (item.acquisitionType || 'unknown') !== filters.acquisitionType) return false;

    if (filters.minValue === undefined && filters.maxValue === undefined) return true;
    const value = itemMetricValue(item, filters.valueMetric);
    if (value === undefined) return false;
    if (filters.minValue !== undefined && value < filters.minValue) return false;
    if (filters.maxValue !== undefined && value > filters.maxValue) return false;
    return true;
  });
}

export function resolveInventoryExportItems({
  scope,
  items,
  currentItems,
  customFilters,
}: {
  scope: InventoryExportScope;
  items: InventoryItem[];
  currentItems: InventoryItem[];
  customFilters: InventoryExportCustomFilters;
}) {
  if (scope === 'current') return currentItems;
  if (scope === 'custom') return filterInventoryItemsForExport(items, customFilters);
  return items;
}

function itemProjection(item: InventoryItem): InventoryExportItem {
  const savingsVsCurrentPrice = getInventorySavingsPerUnit(item);
  return {
    name: item.name?.trim() || 'Untitled item',
    category: categoryLabel(normalizeCategory(item.category)),
    subcategory: item.subCategory?.trim() || '',
    quantity: finiteQuantity(item.quantity),
    unit: item.unit?.trim() || 'piece',
    // Existing Inventory records intentionally use these historical mappings.
    purchaseCost: getInventoryPurchaseCostIfKnown(item) ?? undefined,
    currentValue: getInventoryCurrentValueIfKnown(item) ?? undefined,
    savingsVsCurrentPrice: savingsVsCurrentPrice === null ? undefined : savingsVsCurrentPrice,
    replacementCost: optionalMoney(item.replacementCost),
    status: statusLabel(item.status),
    location: item.storageLocation?.trim() || '',
    acquisition: acquisitionLabel(item.acquisitionType),
    acquired: toLocalDateKey(item.purchaseDate) || '',
    notes: item.notes || '',
    productLink: item.productLink?.trim() || '',
  };
}

function filterSummary(filters: InventoryExportFilters) {
  const entries = [
    filters.search ? `Search: ${filters.search}` : '',
    filters.category && filters.category !== 'all' ? `Category: ${categoryLabel(normalizeCategory(filters.category))}` : '',
    filters.subcategory && filters.subcategory !== 'all' ? `Subcategory: ${filters.subcategory}` : '',
    filters.status && filters.status !== 'all' ? `Status: ${statusLabel(filters.status)}` : '',
    filters.location && filters.location !== 'all' ? `Location: ${filters.location}` : '',
    filters.acquisitionType && filters.acquisitionType !== 'all' ? `Acquisition: ${acquisitionLabel(filters.acquisitionType as InventoryItem['acquisitionType'])}` : '',
    filters.valueMetric && (filters.minValue !== undefined || filters.maxValue !== undefined) ? `${filters.valueMetric === 'purchaseCost' ? 'Purchase Cost' : filters.valueMetric === 'currentValue' ? 'Current Value' : 'Replacement Cost'}${filters.minValue !== undefined ? ` from ${filters.minValue.toLocaleString()}` : ''}${filters.maxValue !== undefined ? ` up to ${filters.maxValue.toLocaleString()}` : ''}` : '',
  ].filter(Boolean);
  return entries.length ? entries.join(' · ') : 'All filters';
}

function sumKnown(values: Array<number | undefined | null>) {
  const known = values.filter((value): value is number => value !== undefined && value !== null);
  return known.length ? toFiniteMoney(known.reduce((sum, value) => sum + value, 0)) : null;
}

function buildSummary(items: InventoryExportItem[], categories: InventoryExportCategory[]): InventoryExportSummary {
  let replacementCostTotal = 0;
  let replacementEstimateCount = 0;
  let savingsVsCurrentPriceTotal = 0;
  let savingsEstimateCount = 0;
  const statusCounts: Record<string, number> = {};

  items.forEach(item => {
    if (item.replacementCost !== undefined) {
      replacementCostTotal += item.replacementCost * item.quantity;
      replacementEstimateCount += 1;
    }
    if (item.savingsVsCurrentPrice !== undefined) {
      savingsVsCurrentPriceTotal += item.savingsVsCurrentPrice * item.quantity;
      savingsEstimateCount += 1;
    }
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  });

  return {
    itemRecords: items.length,
    purchaseCostKnownCount: items.filter(item => item.purchaseCost !== undefined).length,
    currentValueKnownCount: items.filter(item => item.currentValue !== undefined).length,
    purchaseCostTotal: sumKnown(items.map(item => item.purchaseCost === undefined ? undefined : item.purchaseCost * item.quantity)),
    currentValueTotal: sumKnown(items.map(item => item.currentValue === undefined ? undefined : item.currentValue * item.quantity)),
    savingsVsCurrentPriceTotal: savingsEstimateCount ? toFiniteMoney(savingsVsCurrentPriceTotal) : null,
    savingsEstimateCount,
    replacementCostTotal: replacementEstimateCount ? toFiniteMoney(replacementCostTotal) : null,
    replacementEstimateCount,
    categoryCount: categories.length,
    statusCounts,
  };
}

function buildChart(categories: InventoryExportCategory[]) {
  const ranked = categories
    .filter(category => category.currentValueTotal !== null)
    .sort((a, b) => (b.currentValueTotal || 0) - (a.currentValueTotal || 0) || a.category.localeCompare(b.category));
  const total = sumKnown(ranked.map(category => category.currentValueTotal));
  if (total === null || total === 0) {
    return { totalCurrentValue: total, segments: [] as InventoryExportChartSegment[] };
  }

  const top = ranked.slice(0, 6);
  const tail = ranked.slice(6);
  const segments: InventoryExportChartSegment[] = top.map((category, index) => ({ label: category.category, value: category.currentValueTotal || 0, colorIndex: index }));
  if (tail.length) {
    segments.push({
      label: 'Other',
      value: toFiniteMoney(tail.reduce((sum, category) => sum + (category.currentValueTotal || 0), 0)),
      colorIndex: 6,
      isOther: true,
    });
  }

  categories.forEach(category => {
    const topIndex = top.findIndex(entry => entry.category === category.category);
    category.chartColorIndex = topIndex >= 0 ? topIndex : 6;
    category.share = category.currentValueTotal === null ? null : category.currentValueTotal / total * 100;
  });
  return { totalCurrentValue: total, segments };
}

export function buildInventoryExportDocument({
  items,
  profileName = 'Inventory',
  scope = 'all',
  filters = {},
  currency = 'PHP',
  generatedAt = new Date(),
}: {
  items: InventoryItem[];
  profileName?: string;
  scope?: InventoryExportScope;
  filters?: InventoryExportFilters;
  currency?: string;
  generatedAt?: Date;
}): InventoryExportDocument {
  const projectedItems = items.map(itemProjection);
  const categoryMap = new Map<string, InventoryExportCategory>();
  projectedItems.forEach(item => {
    const current = categoryMap.get(item.category) || {
      category: item.category,
      itemRecords: 0,
      purchaseCostKnownCount: 0,
      currentValueKnownCount: 0,
      purchaseCostTotal: null,
      currentValueTotal: null,
      savingsVsCurrentPriceTotal: null,
      share: null,
      chartColorIndex: 6,
    };
    current.itemRecords += 1;
    if (item.purchaseCost !== undefined) current.purchaseCostKnownCount += 1;
    if (item.currentValue !== undefined) current.currentValueKnownCount += 1;
    current.purchaseCostTotal = sumKnown([
      current.purchaseCostTotal,
      item.purchaseCost === undefined ? undefined : item.purchaseCost * item.quantity,
    ]);
    current.currentValueTotal = sumKnown([
      current.currentValueTotal,
      item.currentValue === undefined ? undefined : item.currentValue * item.quantity,
    ]);
    current.savingsVsCurrentPriceTotal = sumKnown([
      current.savingsVsCurrentPriceTotal,
      item.savingsVsCurrentPrice === undefined ? undefined : item.savingsVsCurrentPrice * item.quantity,
    ]);
    categoryMap.set(item.category, current);
  });
  const categories = [...categoryMap.values()].sort((a, b) => a.category.localeCompare(b.category));
  const chart = buildChart(categories);

  return {
    title: 'Inventory Report',
    profileName: profileName.trim() || 'Inventory',
    generatedAt: new Date(generatedAt),
    scope,
    scopeLabel: scope === 'current' ? 'Current view' : scope === 'custom' ? 'Custom report' : 'All inventory',
    filters,
    filterSummary: filterSummary(filters),
    currency,
    items: projectedItems,
    categories,
    chart,
    summary: buildSummary(projectedItems, categories),
  };
}

function csvValue(item: InventoryExportItem, key: keyof InventoryExportItem) {
  const value = item[key];
  return value === undefined ? '' : value;
}

export function buildInventoryCsv(document: InventoryExportDocument) {
  const rows = [
    [...INVENTORY_CSV_HEADERS],
    ...document.items.map(item => ITEM_HEADERS.map((_, index) => csvValue(item, [
      'name', 'category', 'subcategory', 'quantity', 'unit', 'purchaseCost', 'currentValue', 'savingsVsCurrentPrice', 'replacementCost',
      'status', 'location', 'acquisition', 'acquired', 'notes', 'productLink',
    ][index] as keyof InventoryExportItem))),
  ];
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function xlsxOptionalMoney(value: number | null | undefined, currency: string): XlsxCell {
  return value === null || value === undefined
    ? { value: '' }
    : xlsxMoneyCell(convertFromBaseCurrency(value, getEffectiveMoneyInputCurrency(currency as CurrencyCode)));
}

function itemRows(document: InventoryExportDocument): XlsxCell[][] {
  return [
    xlsxHeader([...ITEM_HEADERS]),
    ...document.items.map(item => [
      { value: item.name },
      { value: item.category },
      { value: item.subcategory },
      { value: item.quantity },
      { value: item.unit },
      xlsxOptionalMoney(item.purchaseCost, document.currency),
      xlsxOptionalMoney(item.currentValue, document.currency),
      xlsxOptionalMoney(item.savingsVsCurrentPrice, document.currency),
      xlsxOptionalMoney(item.replacementCost, document.currency),
      { value: item.status },
      { value: item.location },
      { value: item.acquisition },
      { value: item.acquired },
      { value: item.notes },
      { value: item.productLink },
    ]),
  ];
}

function summaryRows(document: InventoryExportDocument): XlsxCell[][] {
  const { summary } = document;
  const rows: XlsxCell[][] = [
    [{ value: 'Caizen Inventory Report', style: 1 }],
    [{ value: 'Profile' }, { value: document.profileName }],
    [{ value: 'Scope' }, { value: document.scopeLabel }],
    [{ value: 'Filters' }, { value: document.filterSummary }],
    [{ value: 'Generated' }, { value: getLocalReportDateLabel(document.generatedAt) }],
    [],
    xlsxHeader(['Summary', 'Value']),
    [{ value: 'Item records' }, { value: summary.itemRecords }],
    [{ value: `Known purchase cost total · ${summary.purchaseCostKnownCount}/${summary.itemRecords} records` }, xlsxOptionalMoney(summary.purchaseCostTotal, document.currency)],
    [{ value: `Known current value total · ${summary.currentValueKnownCount}/${summary.itemRecords} records` }, xlsxOptionalMoney(summary.currentValueTotal, document.currency)],
    [{ value: 'Savings vs current price' }, xlsxOptionalMoney(summary.savingsVsCurrentPriceTotal, document.currency)],
    [{ value: 'Total replacement cost' }, xlsxOptionalMoney(summary.replacementCostTotal, document.currency)],
    [{ value: 'Category count' }, { value: summary.categoryCount }],
  ];
  rows.push([], xlsxHeader(['Status', 'Item records']));
  Object.entries(summary.statusCounts).sort(([a], [b]) => a.localeCompare(b)).forEach(([status, count]) => {
    rows.push([{ value: status }, { value: count }]);
  });
  return rows;
}

function categoryRows(document: InventoryExportDocument): XlsxCell[][] {
  return [
    xlsxHeader([...CATEGORY_HEADERS]),
    ...document.categories.map(category => [
      { value: category.category },
      { value: category.itemRecords },
      xlsxOptionalMoney(category.purchaseCostTotal, document.currency),
      { value: category.purchaseCostKnownCount },
      xlsxOptionalMoney(category.currentValueTotal, document.currency),
      { value: category.currentValueKnownCount },
      xlsxOptionalMoney(category.savingsVsCurrentPriceTotal, document.currency),
    ]),
  ];
}

export function buildInventoryXlsx(document: InventoryExportDocument) {
  return buildXlsxWorkbook([
    { name: 'Summary', rows: summaryRows(document), widths: [30, 30] },
    { name: 'Items', rows: itemRows(document), widths: [28, 20, 20, 12, 12, 18, 18, 26, 22, 18, 22, 16, 14, 42, 42], filter: true },
    { name: 'Categories', rows: categoryRows(document), widths: [24, 16, 22, 18, 22, 18, 30], filter: true },
  ]);
}

export const buildInventoryCsvReport = buildInventoryCsv;
export const buildInventoryXlsxReport = buildInventoryXlsx;

export function getInventoryExportFileName(format: InventoryExportFormat, generatedAt = new Date()) {
  const extension = format === 'pdf' ? 'pdf' : format;
  return `${sanitizeExportFileName(`Caizen-Inventory-${getLocalReportDateLabel(generatedAt)}`)}.${extension}`;
}
