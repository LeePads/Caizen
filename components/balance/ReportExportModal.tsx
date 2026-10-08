'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { SectionExportModal } from '@/components/reports/SectionExportModal';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  buildFinancialExportDocument,
  buildTransactionCsv,
  buildXlsxReport,
  getFinancialExportFileName,
  resolveExportPeriod,
  type ExportPeriodChoice,
  type FinancialExportFormat,
} from '@/lib/finance/exports';
import { downloadFinanceBlob } from '@/lib/finance/export-delivery';
import PrintableFinancialReport from './PrintableFinancialReport';
import { getBaseCurrency, getEffectiveMoneyInputCurrency } from '@/lib/currency';
import {
  getReportPeriodBounds,
  shiftReportPeriod,
  type ReportPeriod,
  type ReportPeriodKind,
} from '@/lib/finance/reports';
import { toLocalDateKey } from '@/lib/date-utils';
import type { Budget, CurrencyCode, FinancialCategory, Transaction, Wallet } from '@/lib/types';

type Props = {
  transactions: Transaction[];
  categories: FinancialCategory[];
  wallets: Wallet[];
  budgets: Budget[];
  currency: CurrencyCode;
  initialPeriod: ReportPeriod;
  initialFormat: FinancialExportFormat;
  allowAll: boolean;
  onClose: () => void;
};

const FORMAT_OPTIONS: Array<{ value: FinancialExportFormat; label: string; description: string }> = [
  { value: 'csv', label: 'Transaction CSV', description: 'One portable row per transaction, or two rows for a transfer.' },
  { value: 'xlsx', label: 'Excel report', description: 'Summary, transactions, breakdowns, and balance trend worksheets.' },
  { value: 'pdf', label: 'PDF / Print report', description: 'Open the print dialog to print the report or save it as a PDF.' },
];

const PERIOD_OPTIONS: Array<{ value: ExportPeriodChoice; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
  { value: 'all', label: 'All transactions' },
];

function monthPeriod(dateKey = toLocalDateKey()): ReportPeriod {
  return { kind: 'month', anchorDateKey: dateKey };
}

function periodLabel(period: ReportPeriod) {
  const bounds = getReportPeriodBounds(period);
  if (!bounds) return 'Choose valid dates';
  if (period.kind === 'month') {
    return new Date(`${bounds.startDateKey}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (period.kind === 'year') return bounds.startDateKey.slice(0, 4);
  if (period.kind === 'quarter') {
    const month = Number(bounds.startDateKey.slice(5, 7));
    return `Q${Math.floor((month - 1) / 3) + 1} ${bounds.startDateKey.slice(0, 4)}`;
  }
  return `${bounds.startDateKey} to ${bounds.endDateKey}`;
}

export default function ReportExportModal({
  transactions,
  categories,
  wallets,
  budgets,
  currency,
  initialPeriod,
  initialFormat,
  allowAll,
  onClose,
}: Props) {
  const [format, setFormat] = useState<FinancialExportFormat>(initialFormat);
  const [periodChoice, setPeriodChoice] = useState<ExportPeriodChoice>(initialPeriod.kind);
  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod);
  const [includeDetails, setIncludeDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [printDocument, setPrintDocument] = useState<ReturnType<typeof buildFinancialExportDocument> | null>(null);
  const finishPrint = useCallback(() => {
    setPrintDocument(null);
    setBusy(false);
    setSuccess('Print dialog closed.');
  }, []);

  const availablePeriodOptions = allowAll ? PERIOD_OPTIONS : PERIOD_OPTIONS.filter(option => option.value !== 'all');
  const resolvedPeriod = useMemo(
    () => periodChoice === 'all' ? resolveExportPeriod('all', transactions) : period,
    [period, periodChoice, transactions],
  );
  const fileName = getFinancialExportFileName(format, resolvedPeriod);

  const selectPeriod = (value: string) => {
    const next = value as ExportPeriodChoice;
    setError('');
    setSuccess('');
    if (next === 'all') {
      setPeriodChoice(next);
      return;
    }
    if (next === 'custom') {
      const bounds = getReportPeriodBounds(monthPeriod(period.anchorDateKey));
      setPeriodChoice(next);
      setPeriod(current => ({
        kind: 'custom',
        anchorDateKey: current.anchorDateKey,
        startDateKey: bounds?.startDateKey,
        endDateKey: bounds?.endDateKey,
      }));
      return;
    }
    setPeriodChoice(next);
    setPeriod(current => ({ kind: next as ReportPeriodKind, anchorDateKey: current.anchorDateKey }));
  };

  const resetCurrent = () => {
    const today = toLocalDateKey();
    setError('');
    setSuccess('');
    if (periodChoice === 'all') return;
    if (periodChoice === 'custom') {
      const bounds = getReportPeriodBounds(monthPeriod(today));
      setPeriod({ kind: 'custom', anchorDateKey: today, startDateKey: bounds?.startDateKey, endDateKey: bounds?.endDateKey });
      return;
    }
    setPeriod(current => ({ ...current, anchorDateKey: today }));
  };

  const createDocument = () => buildFinancialExportDocument({
    transactions,
    categories,
    wallets,
    budgets,
    currency: format === 'csv'
      ? getBaseCurrency()
      : getEffectiveMoneyInputCurrency(currency),
    period: resolvedPeriod,
  });

  const exportFile = () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const reportDocument = createDocument();
      if (format === 'pdf') {
        setPrintDocument(reportDocument);
        return;
      }
      const blob = format === 'csv'
          ? new Blob([buildTransactionCsv(reportDocument)], { type: 'text/csv;charset=utf-8' })
          : buildXlsxReport(reportDocument);
      downloadFinanceBlob(blob, fileName);
      setSuccess(`Export complete: ${fileName}`);
      setBusy(false);
    } catch (exportError) {
      setBusy(false);
      setError(exportError instanceof Error ? exportError.message : 'The export could not be prepared. Try again or choose another format.');
    }
  };

  return (
    <>
      <SectionExportModal
        panelClassName="balance-form @container/balance-form"
        title="Export financial data"
        onClose={onClose}
        format={format}
        formatOptions={FORMAT_OPTIONS}
        onFormatChange={value => { setFormat(value as FinancialExportFormat); setSuccess(''); setError(''); }}
        fileName={fileName}
        busy={busy}
        error={error}
        success={success}
        onExport={exportFile}
        printFormat="pdf"
        canExport={!(periodChoice === 'custom' && !getReportPeriodBounds(period))}
        notice={<div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">Exports contain financial amounts even when Balance amounts are hidden.</div>}
      >
        <p className="text-sm text-muted-foreground">Choose a period and file format for your financial data.</p>
        <div className="grid gap-4">
          <AndroidAdaptiveSelect
            label="Export period"
            value={periodChoice}
            options={availablePeriodOptions}
            onChange={selectPeriod}
            searchable={false}
          />
        </div>

        {periodChoice === 'custom' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <DatePicker label="From" value={period.startDateKey || ''} onChange={value => setPeriod(current => ({ ...current, startDateKey: value }))} />
            <DatePicker label="To" value={period.endDateKey || ''} onChange={value => setPeriod(current => ({ ...current, endDateKey: value }))} />
          </div>
        ) : periodChoice === 'all' ? (
          <p className="text-xs text-muted-foreground">All valid transaction dates will be included.</p>
        ) : (
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            <Button type="button" size="icon" variant="outline" aria-label="Previous export period" onClick={() => { setPeriod(current => shiftReportPeriod(current, -1)); setSuccess(''); }}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-0 text-center text-sm font-bold">{periodLabel(period)}</span>
            <Button type="button" size="icon" variant="outline" aria-label="Next export period" onClick={() => { setPeriod(current => shiftReportPeriod(current, 1)); setSuccess(''); }}><ChevronRight className="h-4 w-4" /></Button>
            <Button type="button" size="sm" variant="ghost" className="col-span-3 min-h-11 whitespace-normal" onClick={resetCurrent}>Show current period</Button>
          </div>
        )}

        {format === 'pdf' ? (
          <div className="space-y-2">
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 px-3 text-sm font-semibold">
            <input type="checkbox" checked={includeDetails} onChange={event => setIncludeDetails(event.target.checked)} />
            Include transactions
            </label>
            <p className="text-xs text-muted-foreground">Choose Save as PDF in the print dialog. The dialog controls the final file name.</p>
          </div>
        ) : null}

      </SectionExportModal>
      {printDocument ? <PrintableFinancialReport reportDocument={printDocument} includeDetails={includeDetails} onAfterPrint={finishPrint} /> : null}
    </>
  );
}
