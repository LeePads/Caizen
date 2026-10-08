import { toLocalDateKey } from '@/lib/date-utils';
import { toFiniteMoney } from '@/lib/money';
import { buildXlsxWorkbook, xlsxHeader, xlsxMoneyCell, type XlsxCell } from '@/lib/reports/xlsx-workbook';
import { getLocalReportDateLabel, sanitizeExportFileName } from '@/lib/reports/export-utils';
import { csvCell } from '@/lib/reports/csv-cell';
import { convertFromBaseCurrency, getEffectiveMoneyInputCurrency } from '@/lib/currency';
import type { CurrencyCode, Supplement, SupplementSchedule } from '@/lib/types';

export type SupplementExportFormat = 'pdf' | 'xlsx' | 'csv';
export type SupplementExportScope = 'all' | 'current' | 'custom';
export type SupplementExpiryState = 'all' | 'missing' | 'expired' | 'soon' | 'later';
export type SupplementExportCustomFilters = { type: 'all' | string; schedule: 'all' | SupplementSchedule; dosageUnit: string; reminderEnabled: 'all' | 'yes' | 'no'; expiryState: SupplementExpiryState; minPrice?: number; maxPrice?: number };
export type SupplementExportPdfOptions = { includeDetails: boolean; includeNotes: boolean };
export type SupplementExportFilters = { search?: string; type?: string; schedule?: string; dosageUnit?: string; reminderEnabled?: string; expiryState?: string; sort?: string; minPrice?: number; maxPrice?: number };

export type SupplementExportItem = {
  name: string; type: string; dosageAmount?: number; dosageUnit: string; dosageText: string; dailyIntake?: number; remaining?: number;
  schedule: string; startDate: string; expiryDate: string; purchasePrice?: number; currentPrice?: number; reminderEnabled: boolean; reminderTime: string; reminderDays: string; notes: string; productLink: string;
};
export type SupplementExportScheduleRow = { schedule: string; itemRecords: number; products: string[] };
export type SupplementExportDocument = {
  title: 'Supplements Report'; profileName: string; generatedAt: Date; scope: SupplementExportScope; scopeLabel: string; filters: SupplementExportFilters; filterSummary: string; currency: string;
  items: SupplementExportItem[]; schedules: SupplementExportScheduleRow[];
  summary: { itemRecords: number; expiringSoonCount: number; reminderCount: number; typeCount: number; purchaseTotal: number | null };
};

const ITEM_HEADERS = ['Supplement', 'Type', 'Dosage Amount', 'Dosage Unit', 'Daily Intake', 'Remaining', 'Schedule', 'Start Date', 'Expiry Date', 'Purchase Price', 'Current Price', 'Reminder Enabled', 'Reminder Time', 'Reminder Days', 'Notes', 'Product Link'] as const;
export const SUPPLEMENT_CSV_HEADERS = ITEM_HEADERS;
const SCHEDULE_HEADERS = ['Schedule', 'Item records', 'Products'] as const;
const TYPE_LABELS: Record<string, string> = { vitamin: 'Vitamin', mineral: 'Mineral', herb: 'Herb', protein: 'Protein', probiotic: 'Probiotic', other: 'Other' };
// A custom Supplement Type (added through the flat supplement-types
// taxonomy) has no entry above; format it for display instead of collapsing
// it to "Other", which would hide the user's actual chosen type.
const formatTypeLabel = (value: string) =>
  value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, character => character.toUpperCase());
const SCHEDULE_LABELS: Record<string, string> = { morning: 'Morning', night: 'Night', 'with-meals': 'With meals', custom: 'Custom' };
const optionalNumber = (value: unknown) => { if (value === undefined || value === null || value === '') return undefined; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined; };
const optionalMoney = (value: unknown) => { const parsed = optionalNumber(value); return parsed === undefined ? undefined : toFiniteMoney(parsed); };
const sumKnown = (values: Array<number | undefined | null>) => { const known = values.filter((value): value is number => value !== undefined && value !== null); return known.length ? toFiniteMoney(known.reduce((sum, value) => sum + value, 0)) : null; };
const dateValue = (value?: Date | null) => value ? toLocalDateKey(value) : '';

function expiryState(value?: Date | null, today = new Date()): Exclude<SupplementExpiryState, 'all'> {
  if (!value) return 'missing';
  const expiryDay = new Date(value); expiryDay.setHours(0, 0, 0, 0);
  const todayDay = new Date(today); todayDay.setHours(0, 0, 0, 0);
  const days = (expiryDay.getTime() - todayDay.getTime()) / 86_400_000;
  if (days < 0) return 'expired';
  if (days <= 14) return 'soon';
  return 'later';
}
function project(item: Supplement): SupplementExportItem {
  const dosageAmount = optionalNumber(item.dosageAmount);
  const dosageUnit = item.dosageUnit?.trim() || '';
  return {
    name: item.name?.trim() || 'Untitled supplement', type: item.type ? (TYPE_LABELS[item.type] || formatTypeLabel(item.type)) : 'Not set', dosageAmount, dosageUnit, dosageText: item.dosage?.trim() || '', dailyIntake: optionalNumber(item.dailyIntake), remaining: optionalNumber(item.quantityRemaining), schedule: SCHEDULE_LABELS[item.schedule || 'custom'] || 'Custom', startDate: dateValue(item.startDate), expiryDate: dateValue(item.expiryDate), purchasePrice: optionalMoney(item.purchasePrice), currentPrice: optionalMoney(item.currentPrice), reminderEnabled: Boolean(item.reminderEnabled), reminderTime: item.reminderTime || '', reminderDays: item.reminderDays?.join(', ') || '', notes: item.effects || '', productLink: item.productLink?.trim() || '',
  };
}
export function validateSupplementExportCustomFilters(filters: SupplementExportCustomFilters) {
  if (filters.minPrice !== undefined && (!Number.isFinite(filters.minPrice) || filters.minPrice < 0)) return 'Minimum price must be a non-negative number.';
  if (filters.maxPrice !== undefined && (!Number.isFinite(filters.maxPrice) || filters.maxPrice < 0)) return 'Maximum price must be a non-negative number.';
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) return 'Minimum price cannot be greater than maximum price.';
  return null;
}
export function filterSupplementsForExport(items: Supplement[], filters: SupplementExportCustomFilters, today = new Date()) {
  const error = validateSupplementExportCustomFilters(filters); if (error) throw new Error(error);
  return items.filter(item => {
    if (filters.type !== 'all' && (item.type || 'other') !== filters.type) return false;
    if (filters.schedule !== 'all' && (item.schedule || 'custom') !== filters.schedule) return false;
    if (filters.dosageUnit !== 'all' && (item.dosageUnit?.trim() || '') !== filters.dosageUnit) return false;
    if (filters.reminderEnabled !== 'all' && (Boolean(item.reminderEnabled) ? 'yes' : 'no') !== filters.reminderEnabled) return false;
    if (filters.expiryState !== 'all' && expiryState(item.expiryDate, today) !== filters.expiryState) return false;
    if (filters.minPrice === undefined && filters.maxPrice === undefined) return true;
    const value = optionalNumber(item.purchasePrice); if (value === undefined) return false;
    return (filters.minPrice === undefined || value >= filters.minPrice) && (filters.maxPrice === undefined || value <= filters.maxPrice);
  });
}
export function resolveSupplementExportItems({ scope, items, currentItems, customFilters, today }: { scope: SupplementExportScope; items: Supplement[]; currentItems: Supplement[]; customFilters: SupplementExportCustomFilters; today?: Date }) {
  if (scope === 'current') return currentItems; if (scope === 'custom') return filterSupplementsForExport(items, customFilters, today); return items;
}
function filterSummary(filters: SupplementExportFilters) { const entries = [filters.search ? `Search: ${filters.search}` : '', filters.type ? `Type: ${filters.type}` : '', filters.schedule ? `Schedule: ${filters.schedule}` : '', filters.dosageUnit ? `Dosage unit: ${filters.dosageUnit}` : '', filters.reminderEnabled ? `Reminder: ${filters.reminderEnabled}` : '', filters.expiryState ? `Expiry: ${filters.expiryState}` : '', filters.sort ? `Sort: ${filters.sort}` : '', filters.minPrice !== undefined ? `Purchase price from ${filters.minPrice.toLocaleString()}` : '', filters.maxPrice !== undefined ? `Purchase price up to ${filters.maxPrice.toLocaleString()}` : ''].filter(Boolean); return entries.length ? entries.join(' · ') : 'All filters'; }

export function buildSupplementExportDocument({ items, profileName = 'Supplements', scope = 'all', filters = {}, currency = 'PHP', generatedAt = new Date() }: { items: Supplement[]; profileName?: string; scope?: SupplementExportScope; filters?: SupplementExportFilters; currency?: string; generatedAt?: Date }): SupplementExportDocument {
  const generated = new Date(generatedAt); const projected = items.map(project); const scheduleMap = new Map<string, SupplementExportScheduleRow>();
  projected.forEach(item => { const row = scheduleMap.get(item.schedule) || { schedule: item.schedule, itemRecords: 0, products: [] }; row.itemRecords += 1; row.products.push(item.name); scheduleMap.set(item.schedule, row); });
  const scheduleOrder = ['Morning', 'Night', 'With meals', 'Custom'];
  const schedules = [...scheduleMap.values()].sort((a, b) => scheduleOrder.indexOf(a.schedule) - scheduleOrder.indexOf(b.schedule));
  return {
    title: 'Supplements Report', profileName: profileName.trim() || 'Supplements', generatedAt: generated, scope, scopeLabel: scope === 'current' ? 'Current view' : scope === 'custom' ? 'Custom report' : 'All supplements', filters, filterSummary: filterSummary(filters), currency, items: projected, schedules,
    summary: { itemRecords: projected.length, expiringSoonCount: items.filter(item => expiryState(item.expiryDate, generated) === 'soon').length, reminderCount: projected.filter(item => item.reminderEnabled).length, typeCount: new Set(projected.map(item => item.type)).size, purchaseTotal: sumKnown(projected.map(item => item.purchasePrice)) },
  };
}
const moneyCell = (value: number | undefined | null, currency: string): XlsxCell => value === undefined || value === null ? { value: '' } : xlsxMoneyCell(convertFromBaseCurrency(value, getEffectiveMoneyInputCurrency(currency as CurrencyCode)));
export function buildSupplementCsv(document: SupplementExportDocument) { const rows = [ITEM_HEADERS, ...document.items.map(item => [item.name, item.type, item.dosageAmount, item.dosageUnit, item.dailyIntake, item.remaining, item.schedule, item.startDate, item.expiryDate, item.purchasePrice, item.currentPrice, item.reminderEnabled, item.reminderTime, item.reminderDays, item.notes, item.productLink])]; return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`; }
function summaryRows(document: SupplementExportDocument): XlsxCell[][] { const { summary } = document; return [[{ value: 'Caizen Supplements Report', style: 1 }], [{ value: 'Profile' }, { value: document.profileName }], [{ value: 'Scope' }, { value: document.scopeLabel }], [{ value: 'Filters' }, { value: document.filterSummary }], [{ value: 'Generated' }, { value: getLocalReportDateLabel(document.generatedAt) }], [], xlsxHeader(['Summary', 'Value']), [{ value: 'Supplement records' }, { value: summary.itemRecords }], [{ value: 'Expiring soon' }, { value: summary.expiringSoonCount }], [{ value: 'Reminders enabled' }, { value: summary.reminderCount }], [{ value: 'Type count' }, { value: summary.typeCount }], [{ value: 'Purchase cost total' }, moneyCell(summary.purchaseTotal, document.currency)]]; }
function itemRows(document: SupplementExportDocument): XlsxCell[][] { return [xlsxHeader([...ITEM_HEADERS]), ...document.items.map(item => [{ value: item.name }, { value: item.type }, item.dosageAmount === undefined ? { value: '' } : { value: item.dosageAmount }, { value: item.dosageUnit }, item.dailyIntake === undefined ? { value: '' } : { value: item.dailyIntake }, item.remaining === undefined ? { value: '' } : { value: item.remaining }, { value: item.schedule }, { value: item.startDate }, { value: item.expiryDate }, moneyCell(item.purchasePrice, document.currency), moneyCell(item.currentPrice, document.currency), { value: item.reminderEnabled }, { value: item.reminderTime }, { value: item.reminderDays }, { value: item.notes }, { value: item.productLink }])]; }
function scheduleRows(document: SupplementExportDocument): XlsxCell[][] { return [xlsxHeader([...SCHEDULE_HEADERS]), ...document.schedules.map(row => [{ value: row.schedule }, { value: row.itemRecords }, { value: row.products.join(', ') }])]; }
export function buildSupplementXlsx(document: SupplementExportDocument) { return buildXlsxWorkbook([{ name: 'Summary', rows: summaryRows(document), widths: [30, 34] }, { name: 'Supplements', rows: itemRows(document), widths: [28, 16, 16, 16, 14, 14, 18, 16, 16, 18, 18, 18, 16, 22, 42, 42], filter: true }, { name: 'Schedule', rows: scheduleRows(document), widths: [18, 16, 70], filter: true }]); }
export function getSupplementExportFileName(format: SupplementExportFormat, generatedAt = new Date()) { return `${sanitizeExportFileName(`Caizen-Supplements-${getLocalReportDateLabel(generatedAt)}`)}.${format}`; }
