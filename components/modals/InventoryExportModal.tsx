'use client';

import { useEffect, useMemo, useState } from 'react';

import PrintableInventoryReport from '@/components/inventory/reports/PrintableInventoryReport';
import { SectionExportModal } from '@/components/reports/SectionExportModal';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { MoneyInput } from '@/components/ui/money-input';
import {
  buildInventoryCsv,
  buildInventoryExportDocument,
  buildInventoryXlsx,
  getInventoryExportFileName,
  resolveInventoryExportItems,
  validateInventoryExportCustomFilters,
  type InventoryExportCustomFilters,
  type InventoryExportDocument,
  type InventoryExportFilters,
  type InventoryExportFormat,
  type InventoryExportPdfOptions,
  type InventoryExportScope,
} from '@/lib/collections/inventory-exports';
import { downloadReportBlob } from '@/lib/reports/export-utils';
import { convertMoneyInputToBase, getBaseCurrency, getEffectiveMoneyInputCurrency } from '@/lib/currency';
import type { CurrencyCode, InventoryItem } from '@/lib/types';

type Props = {
  items: InventoryItem[];
  currentItems: InventoryItem[];
  locationOptions: string[];
  profileName: string;
  currency: string;
  filters: InventoryExportFilters;
  initialScope?: InventoryExportScope;
  onClose: () => void;
};

const FORMAT_OPTIONS = [
  { value: 'pdf' as const, label: 'PDF / Print report', description: 'A clean, multi-page printable inventory report.' },
  { value: 'xlsx' as const, label: 'Excel report', description: 'Summary, item, and category worksheets.' },
  { value: 'csv' as const, label: 'Inventory CSV', description: 'One structured row per inventory item.' },
];

const SCOPE_OPTIONS = [
  { value: 'current', label: 'Current view' },
  { value: 'all', label: 'All inventory' },
  { value: 'custom', label: 'Custom report' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'using', label: 'Using' },
  { value: 'stored', label: 'Stored' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'replace', label: 'Replace soon' },
  { value: 'retired', label: 'Retired' },
  { value: 'archived', label: 'Archived' },
];

const ACQUISITION_OPTIONS = [
  { value: 'all', label: 'All acquisition types' },
  { value: 'bought', label: 'Bought' },
  { value: 'included', label: 'Included' },
  { value: 'gift', label: 'Gift' },
  { value: 'free', label: 'Free' },
  { value: 'unknown', label: 'Unknown' },
];

const VALUE_OPTIONS = [
  { value: 'currentValue', label: 'Current Value' },
  { value: 'purchaseCost', label: 'Purchase Cost' },
  { value: 'replacementCost', label: 'Replacement Cost' },
];

const DEFAULT_CUSTOM_FILTERS: InventoryExportCustomFilters = {
  category: 'all',
  subcategory: 'all',
  status: 'all',
  location: 'all',
  acquisitionType: 'all',
  valueMetric: 'currentValue',
};

function normalizeCategory(value?: string) {
  const normalized = (value || '').trim().toLowerCase().replace(/-/g, '_');
  if (normalized === 'electronics') return 'personal_tech';
  if (['appliances', 'furniture'].includes(normalized)) return 'home';
  if (['clothing', 'bags', 'shoes'].includes(normalized)) return 'wearables';
  return normalized || 'utilities';
}

function categoryLabel(value: string) {
  const labels: Record<string, string> = {
    personal_tech: 'Personal Tech',
    utilities: 'Utilities',
    wearables: 'Wearables',
    home: 'Home',
  };
  return labels[value] || value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function statusLabel(value: string) {
  return STATUS_OPTIONS.find(option => option.value === value)?.label || value;
}

function valueLabel(value: InventoryExportCustomFilters['valueMetric']) {
  return VALUE_OPTIONS.find(option => option.value === value)?.label || 'Current Value';
}

function acquisitionLabel(value: InventoryExportCustomFilters['acquisitionType']) {
  return ACQUISITION_OPTIONS.find(option => option.value === value)?.label || 'Unknown';
}

function parseBound(value: string, currency: CurrencyCode) {
  if (!value.trim()) return undefined;
  return convertMoneyInputToBase(value, currency);
}

export default function InventoryExportModal({
  items,
  currentItems,
  locationOptions: availableLocationValues,
  profileName,
  currency,
  filters,
  initialScope = 'all',
  onClose,
}: Props) {
  const [format, setFormat] = useState<InventoryExportFormat>('pdf');
  const [scope, setScope] = useState<InventoryExportScope>(initialScope);
  const [customFilters, setCustomFilters] = useState<InventoryExportCustomFilters>(DEFAULT_CUSTOM_FILTERS);
  const [minValueText, setMinValueText] = useState('');
  const [maxValueText, setMaxValueText] = useState('');
  const [pdfOptions, setPdfOptions] = useState<InventoryExportPdfOptions>({
    includeDetails: true,
    includeNotes: false,
    includeCategoryChart: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [printDocument, setPrintDocument] = useState<InventoryExportDocument | null>(null);
  const [generatedAt] = useState(() => new Date());
  const moneyInputCurrency = getEffectiveMoneyInputCurrency(currency as CurrencyCode);

  const rangeFilters = useMemo<InventoryExportCustomFilters>(() => ({
    ...customFilters,
    minValue: parseBound(minValueText, moneyInputCurrency),
    maxValue: parseBound(maxValueText, moneyInputCurrency),
  }), [customFilters, maxValueText, minValueText, moneyInputCurrency]);

  const customValidationError = useMemo(
    () => validateInventoryExportCustomFilters(rangeFilters),
    [rangeFilters],
  );

  const categoryOptions = useMemo(() => {
    const categories = [...new Set(items.map(item => normalizeCategory(item.category)))].sort();
    return [
      { value: 'all', label: 'All categories' },
      ...categories.map(category => ({ value: category, label: categoryLabel(category) })),
    ];
  }, [items]);

  const subcategoryOptions = useMemo(() => {
    const available = items
      .filter(item => customFilters.category === 'all' || normalizeCategory(item.category) === customFilters.category)
      .map(item => item.subCategory?.trim() || 'Uncategorized');
    return [
      { value: 'all', label: 'All subcategories' },
      ...[...new Set(available)].sort((a, b) => a.localeCompare(b)).map(value => ({ value, label: value })),
    ];
  }, [customFilters.category, items]);

  const locationOptions = useMemo(() => [
    { value: 'all', label: 'All locations' },
    ...availableLocationValues.map(value => ({ value, label: value })),
  ], [availableLocationValues]);

  useEffect(() => {
    if (customFilters.subcategory === 'all') return;
    if (!subcategoryOptions.some(option => option.value === customFilters.subcategory)) {
      setCustomFilters(current => ({ ...current, subcategory: 'all' }));
    }
  }, [customFilters.subcategory, subcategoryOptions]);

  const selectedItemsForDescription = useMemo(() => {
    if (scope === 'current') return currentItems;
    if (scope === 'all') return items;
    if (customValidationError) return null;
    try {
      return resolveInventoryExportItems({ scope, items, currentItems, customFilters: rangeFilters });
    } catch {
      return null;
    }
  }, [currentItems, customValidationError, items, rangeFilters, scope]);

  const fileName = getInventoryExportFileName(format, generatedAt);

  const activeFilters = useMemo(() => {
    const entries = [
      filters.search?.trim() ? `Search “${filters.search.trim()}”` : '',
      filters.category && filters.category !== 'all' ? `Category ${categoryLabel(normalizeCategory(filters.category))}` : '',
      filters.subcategory && filters.subcategory !== 'all' ? `Subcategory ${filters.subcategory}` : '',
      filters.status && filters.status !== 'all' ? `Status ${statusLabel(filters.status)}` : '',
      filters.location && filters.location !== 'all' ? `Location ${filters.location}` : '',
    ].filter(Boolean);
    return entries.length ? entries.join(' · ') : 'No active filters';
  }, [filters]);

  const customFilterSummary = useMemo(() => {
    const entries = [
      `Category: ${customFilters.category === 'all' ? 'All' : categoryLabel(customFilters.category)}`,
      `Subcategory: ${customFilters.subcategory === 'all' ? 'All' : customFilters.subcategory}`,
      `Status: ${customFilters.status === 'all' ? 'All' : statusLabel(customFilters.status)}`,
      `Location: ${customFilters.location === 'all' ? 'All' : customFilters.location}`,
      `Acquisition: ${customFilters.acquisitionType === 'all' ? 'All' : acquisitionLabel(customFilters.acquisitionType)}`,
    ];
    if (minValueText.trim() || maxValueText.trim()) {
      entries.push(`${valueLabel(customFilters.valueMetric)}: ${minValueText.trim() ? `from ${minValueText}` : ''}${minValueText.trim() && maxValueText.trim() ? ' ' : ''}${maxValueText.trim() ? `up to ${maxValueText}` : ''}`);
    }
    return entries.join(' · ');
  }, [customFilters, maxValueText, minValueText]);

  const scopeDescription = scope === 'current'
    ? `Current view includes all ${currentItems.length.toLocaleString()} matching item${currentItems.length === 1 ? '' : 's'}, not only the visible page.`
    : scope === 'custom'
      ? `${selectedItemsForDescription?.length.toLocaleString() || 0} item${selectedItemsForDescription?.length === 1 ? '' : 's'} match this temporary report.`
      : `All inventory includes ${items.length.toLocaleString()} item${items.length === 1 ? '' : 's'}.`;

  const exportFile = () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const selectedItems = resolveInventoryExportItems({
        scope,
        items,
        currentItems,
        customFilters: rangeFilters,
      });
      const documentFilters: InventoryExportFilters = scope === 'current'
        ? filters
        : scope === 'custom'
          ? {
              category: customFilters.category,
              subcategory: customFilters.subcategory,
              status: customFilters.status,
              location: customFilters.location,
              acquisitionType: customFilters.acquisitionType,
              valueMetric: customFilters.valueMetric,
              minValue: rangeFilters.minValue,
              maxValue: rangeFilters.maxValue,
            }
          : {};
      const document = buildInventoryExportDocument({
        items: selectedItems,
        profileName,
        scope,
        filters: documentFilters,
        currency: format === 'csv'
          ? getBaseCurrency()
          : getEffectiveMoneyInputCurrency(currency as import('@/lib/types').CurrencyCode),
        generatedAt,
      });
      if (format === 'pdf') {
        setPrintDocument(document);
        return;
      }
      const blob = format === 'csv'
        ? new Blob([buildInventoryCsv(document)], { type: 'text/csv;charset=utf-8' })
        : buildInventoryXlsx(document);
      downloadReportBlob(blob, fileName);
      setSuccess(`Export complete: ${fileName}`);
      setBusy(false);
    } catch (exportError) {
      setBusy(false);
      setError(exportError instanceof Error ? exportError.message : 'The inventory export could not be prepared.');
    }
  };

  const updateCustomFilter = <K extends keyof InventoryExportCustomFilters>(key: K, value: InventoryExportCustomFilters[K]) => {
    setCustomFilters(current => ({ ...current, [key]: value }));
    setSuccess('');
    setError('');
  };

  return (
    <>
      <SectionExportModal
        title="Export inventory"
        eyebrow="Local-only export"
        onClose={onClose}
        format={format}
        formatOptions={FORMAT_OPTIONS}
        onFormatChange={value => { setFormat(value); setSuccess(''); setError(''); }}
        fileName={fileName}
        busy={busy}
        error={error || (scope === 'custom' ? customValidationError || '' : '')}
        success={success}
        onExport={exportFile}
        printFormat="pdf"
        canExport={scope !== 'custom' || !customValidationError}
        afterFileNameNotice={<div className="space-y-1 text-xs text-muted-foreground"><p>Images are not included. Product links are included in CSV and Excel only.</p>{format === 'pdf' ? <p>For a clean PDF, turn off Headers and footers in the print dialog.</p> : null}</div>}
      >
        <div className="space-y-5">
          <AndroidAdaptiveSelect
            label="Export scope"
            value={scope}
            options={SCOPE_OPTIONS}
            onChange={value => { setScope(value as InventoryExportScope); setSuccess(''); setError(''); }}
            searchable={false}
          />

          {scope === 'custom' ? (
            <div className="space-y-4">
              <AndroidAdaptiveSelect label="Category" value={customFilters.category} options={categoryOptions} onChange={value => updateCustomFilter('category', value)} searchable={categoryOptions.length > 8} />
              <AndroidAdaptiveSelect label="Subcategory" value={customFilters.subcategory} options={subcategoryOptions} onChange={value => updateCustomFilter('subcategory', value)} searchable={subcategoryOptions.length > 8} />
              <AndroidAdaptiveSelect label="Status" value={customFilters.status} options={STATUS_OPTIONS} onChange={value => updateCustomFilter('status', value as InventoryExportCustomFilters['status'])} searchable={false} />
              <AndroidAdaptiveSelect label="Location" value={customFilters.location} options={locationOptions} onChange={value => updateCustomFilter('location', value)} searchable={locationOptions.length > 8} />
              <AndroidAdaptiveSelect label="Acquisition type" value={customFilters.acquisitionType} options={ACQUISITION_OPTIONS} onChange={value => updateCustomFilter('acquisitionType', value as InventoryExportCustomFilters['acquisitionType'])} searchable={false} />
              <AndroidAdaptiveSelect label="Value based on" value={customFilters.valueMetric} options={VALUE_OPTIONS} onChange={value => updateCustomFilter('valueMetric', value as InventoryExportCustomFilters['valueMetric'])} searchable={false} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-semibold" htmlFor="inventory-export-min-value">
                  <span>Minimum</span>
                  <MoneyInput id="inventory-export-min-value" inputMode="decimal" type="number" min="0" value={minValueText} onChange={event => { setMinValueText(event.target.value); setError(''); setSuccess(''); }} className="w-full" currency={moneyInputCurrency} placeholder="No minimum" />
                </label>
                <label className="space-y-1.5 text-sm font-semibold" htmlFor="inventory-export-max-value">
                  <span>Maximum</span>
                  <MoneyInput id="inventory-export-max-value" inputMode="decimal" type="number" min="0" value={maxValueText} onChange={event => { setMaxValueText(event.target.value); setError(''); setSuccess(''); }} className="w-full" currency={moneyInputCurrency} placeholder="No maximum" />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{customFilterSummary}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{scopeDescription} {scope === 'current' ? activeFilters : ''}</p>
          )}

          {format === 'pdf' ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-bold">Report contents</legend>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 px-3 text-sm font-semibold">
                <input type="checkbox" checked={pdfOptions.includeDetails} onChange={event => setPdfOptions(current => ({ ...current, includeDetails: event.target.checked }))} />
                Item details
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 px-3 text-sm font-semibold">
                <input type="checkbox" checked={pdfOptions.includeNotes} onChange={event => setPdfOptions(current => ({ ...current, includeNotes: event.target.checked }))} />
                Include notes
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 px-3 text-sm font-semibold">
                <input type="checkbox" checked={pdfOptions.includeCategoryChart} onChange={event => setPdfOptions(current => ({ ...current, includeCategoryChart: event.target.checked }))} />
                Category chart
              </label>
            </fieldset>
          ) : null}
        </div>
      </SectionExportModal>
      {printDocument ? (
        <PrintableInventoryReport
          reportDocument={printDocument}
          pdfOptions={pdfOptions}
          onAfterPrint={() => {
            setPrintDocument(null);
            setBusy(false);
            setSuccess('Print dialog closed.');
          }}
        />
      ) : null}
    </>
  );
}
