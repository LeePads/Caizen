'use client';

import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Download,
  EyeOff,
  List,
  PieChart,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';

import ReportMovementChart from '@/components/balance/ReportMovementChart';
import ReportBreakdownChart from '@/components/balance/ReportBreakdownChart';
import { CategoryIcon } from '@/components/balance/CategoryIcon';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { MonetaryNumber } from '@/components/ui/monetary-number';
import {
  buildFinancialReport,
  getReportPeriodBounds,
  getReportTimelineBucketPeriod,
  shiftReportPeriod,
  type FinancialReport,
  type ReportBreakdownRow,
  type ReportPeriod,
  type ReportPeriodKind,
  type ReportTimelineBucket,
  type ReportWalletRow,
} from '@/lib/finance/reports';
import { formatPHP } from '@/lib/currency';
import { parseLocalDateKey, toLocalDateKey } from '@/lib/date-utils';
import type {
  Budget,
  FinancialCategory,
  Transaction,
  Wallet,
} from '@/lib/types';
import { cn } from '@/lib/utils';

type ReportsPanelProps = {
  transactions: Transaction[];
  categories: FinancialCategory[];
  wallets: Wallet[];
  budgets: Budget[];
  hidden: boolean;
  androidPresentation?: boolean;
  onAddTransaction: () => void;
  onExport: (period: ReportPeriod) => void;
};

const PERIOD_OPTIONS: Array<{ value: ReportPeriodKind; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
];

function getMonthBounds(monthKey: string) {
  return getReportPeriodBounds({
    kind: 'month',
    anchorDateKey: `${monthKey}-01`,
  });
}

function createInitialPeriod(): ReportPeriod {
  const today = toLocalDateKey();
  return {
    kind: 'month',
    anchorDateKey: today,
  };
}

function formatDateKey(value?: string) {
  const date = value ? parseLocalDateKey(value) : null;
  return date?.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) || value || 'Choose a date';
}

function periodLabel(period: ReportPeriod, report: FinancialReport) {
  const bounds = report.bounds;
  if (!bounds) return 'Choose valid dates';
  if (period.kind === 'custom') {
    return `${formatDateKey(bounds.startDateKey)} – ${formatDateKey(bounds.endDateKey)}`;
  }
  if (period.kind === 'year') {
    return bounds.startDateKey.slice(0, 4);
  }
  if (period.kind === 'quarter') {
    const month = Number(bounds.startDateKey.slice(5, 7));
    return `Q${Math.floor((month - 1) / 3) + 1} ${bounds.startDateKey.slice(0, 4)}`;
  }
  if (period.kind === 'month') {
    const date = parseLocalDateKey(bounds.startDateKey);
    return date?.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) || bounds.startDateKey;
  }
  return `${formatDateKey(bounds.startDateKey)} – ${formatDateKey(bounds.endDateKey)}`;
}

function timelineSubtitle(report: FinancialReport) {
  const movementLabel = 'Balance trend';
  return `${movementLabel} · ${periodLabel(report.period, report)}`;
}

function displayAmount(value: number, hidden: boolean) {
  return hidden ? '••••••' : formatPHP(value);
}

function displaySignedAmount(value: number, hidden: boolean) {
  if (hidden) return '••••••';
  if (value === 0) return formatPHP(0);
  return `${value > 0 ? '+' : '−'}${formatPHP(Math.abs(value))}`;
}

function changeLabel(value: number | null, hidden: boolean) {
  if (hidden) return '••••••';
  if (value === null) return 'No prior data';
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPHP(Math.abs(value))}`;
}

function percentLabel(value: number | null, hidden: boolean) {
  if (hidden) return '••••••';
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(0)}%`;
}

function comparisonTone(label: string, value: number, kind: 'amount' | 'percent') {
  if (value === 0) return 'text-muted-foreground';
  if (kind === 'percent' && !Number.isFinite(value)) return 'text-muted-foreground';
  if (label === 'Expense') return value > 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300';
  return value > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive';
}

function ReportSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('section-surface @container/report min-w-0', className)}>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  hidden,
  tone,
  revision,
}: {
  label: string;
  value: number;
  detail: string;
  hidden: boolean;
  tone: 'income' | 'expense' | 'net';
  revision: string;
}) {
  const toneClass = tone === 'income'
    ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'expense'
      ? 'text-destructive'
      : value >= 0
        ? 'text-foreground'
        : 'text-destructive';

  return (
    <div className="min-w-0 px-1 py-2">
      <p className="text-label text-muted-foreground">{label}</p>
      <p className={cn('mt-2 break-words text-2xl font-bold tabular-nums', !hidden && toneClass)}>
        <MonetaryNumber formatted={hidden ? '' : displaySignedAmount(tone === 'expense' ? -value : value, false)} hidden={hidden} revision={revision} />
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function HiddenAmounts({ label = 'Amounts hidden' }: { label?: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-background/35 px-4 text-center">
      <EyeOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">Show balances to view report values.</p>
    </div>
  );
}

function BreakdownList({
  rows,
  categories,
  hidden,
}: {
  rows: ReportBreakdownRow[];
  categories: FinancialCategory[];
  hidden: boolean;
}) {
  if (hidden) return <HiddenAmounts />;
  if (!rows.length) {
    return <p className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-sm text-muted-foreground">No income or expenses included in reports for this period.</p>;
  }

  return (
    <div className="space-y-4">
      {rows.map(row => (
        <div key={row.id} className="min-w-0">
          <div className="flex flex-col items-start justify-between gap-2 text-sm @min-[26rem]/report:flex-row @min-[26rem]/report:items-center">
            <span className="flex min-w-0 items-center gap-2">
              <CategoryIcon
                categoryIconId={categories.find(category => category.id === row.id)?.icon}
                size="sm"
                containerClassName="h-7 w-7 rounded-lg"
              />
              <span className="min-w-0 break-words font-bold">{row.label}</span>
            </span>
            <span className="min-w-0 break-words font-bold tabular-nums @min-[26rem]/report:text-right">{formatPHP(row.amount)}</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.min(100, Math.max(0, row.percentage))}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-muted-foreground">
              {row.percentage.toFixed(0)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BreakdownViewToggle({
  value,
  onChange,
  label,
}: {
  value: 'list' | 'pie';
  onChange: (value: 'list' | 'pie') => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-xl border border-border/60 bg-background/45 p-0.5" role="group" aria-label={`${label} view`}>
      <button
        type="button"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
        className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', value === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
      >
        <List className="h-3.5 w-3.5" aria-hidden="true" /> List
      </button>
      <button
        type="button"
        aria-pressed={value === 'pie'}
        onClick={() => onChange('pie')}
        className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', value === 'pie' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
      >
        <PieChart className="h-3.5 w-3.5" aria-hidden="true" /> Pie
      </button>
    </div>
  );
}

function WalletMovementList({ rows, hidden }: { rows: ReportWalletRow[]; hidden: boolean }) {
  if (hidden) return <HiddenAmounts />;
  if (!rows.length) {
    return <p className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-sm text-muted-foreground">No wallet movement in this period.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] gap-3 border-b border-border/55 px-3 pb-2 text-label text-muted-foreground @min-[36rem]/report:grid">
          <span>Wallet</span>
          <span className="text-right">Income</span>
          <span className="text-right">Expense</span>
          <span className="text-right">Net</span>
      </div>
      {rows.map(row => (
        <div key={row.id} className="grid min-w-0 gap-2 border-b border-border/45 px-1 py-3 text-sm last:border-0 @min-[36rem]/report:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] @min-[36rem]/report:gap-3 @min-[36rem]/report:px-3">
          <span className="min-w-0 break-words font-bold">{row.label}</span>
          <span className="flex min-w-0 justify-between gap-2 break-words font-semibold tabular-nums text-emerald-700 dark:text-emerald-300 @min-[36rem]/report:block @min-[36rem]/report:text-right"><span className="text-xs font-normal text-muted-foreground @min-[36rem]/report:hidden">Income</span>{formatPHP(row.income)}</span>
          <span className="flex min-w-0 justify-between gap-2 break-words font-semibold tabular-nums text-destructive @min-[36rem]/report:block @min-[36rem]/report:text-right"><span className="text-xs font-normal text-muted-foreground @min-[36rem]/report:hidden">Expense</span>{formatPHP(row.expense)}</span>
          <span className="flex min-w-0 justify-between gap-2 break-words font-bold tabular-nums @min-[36rem]/report:block @min-[36rem]/report:text-right"><span className="text-xs font-normal text-muted-foreground @min-[36rem]/report:hidden">Net</span>{displaySignedAmount(row.net, false)}</span>
        </div>
      ))}
    </div>
  );
}

function BudgetRows({ report, categories, hidden }: { report: FinancialReport; categories: FinancialCategory[]; hidden: boolean }) {
  if (!report.budget) return null;
  const categoryLabel = (categoryId: string, subcategoryId?: string) => {
    const category = categories.find(item => item.id === categoryId);
    const subcategory = category?.subcategories.find(item => item.id === subcategoryId);
    return subcategory ? `${category?.name} › ${subcategory.name}` : category?.name || 'Category';
  };

  return (
    <div className="space-y-3">
      {report.budget.metrics.map(metrics => (
        <div key={metrics.budget.id} className="rounded-2xl border border-border/55 bg-background/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              {(() => {
                const category = categories.find(item => item.id === metrics.budget.categoryId);
                const subcategory = category?.subcategories.find(item => item.id === metrics.budget.subcategoryId);
                return <CategoryIcon categoryIconId={category?.icon} subcategoryIconId={subcategory?.icon} size="sm" containerClassName="h-7 w-7 rounded-lg" />;
              })()}
              <div className="min-w-0">
                <p className="break-words text-sm font-bold">{categoryLabel(metrics.budget.categoryId, metrics.budget.subcategoryId)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{hidden ? 'Amounts hidden' : metrics.status === 'over-budget' ? 'Over budget' : 'On track'}</p>
              </div>
            </div>
            <p className={cn('min-w-0 break-words text-sm font-bold tabular-nums', !hidden && metrics.status === 'over-budget' ? 'text-destructive' : 'text-foreground')}>
              {hidden ? '••••••' : metrics.status === 'over-budget' ? `Over by ${formatPHP(metrics.overBy)}` : `${formatPHP(metrics.remaining)} left`}
            </p>
          </div>
          {!hidden ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className={cn('h-full rounded-full', metrics.status === 'over-budget' ? 'bg-destructive' : 'bg-primary')} style={{ width: `${metrics.displayProgressPercent}%` }} />
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
            <span>{hidden ? 'Hidden' : `${formatPHP(metrics.spent)} spent`}</span>
            <span>{hidden ? 'Hidden' : `${formatPHP(metrics.allocated)} allocated`}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPanel({
  transactions,
  categories,
  wallets,
  budgets,
  hidden,
  androidPresentation = false,
  onAddTransaction,
  onExport,
}: ReportsPanelProps) {
  const [period, setPeriod] = useState<ReportPeriod>(createInitialPeriod);
  const [focusedBucketKey, setFocusedBucketKey] = useState<string | null>(null);
  const [expenseView, setExpenseView] = useState<'list' | 'pie'>('list');
  const [incomeView, setIncomeView] = useState<'list' | 'pie'>('list');
  const report = useMemo(
    () => buildFinancialReport({ transactions, categories, wallets, budgets, period }),
    [transactions, categories, wallets, budgets, period],
  );
  const focusedBucket = useMemo<ReportTimelineBucket | null>(
    () => report.timeline.find(bucket => bucket.key === focusedBucketKey) || null,
    [focusedBucketKey, report.timeline],
  );
  const focusedPeriod = useMemo(
    () => focusedBucket ? getReportTimelineBucketPeriod(focusedBucket, period) : null,
    [focusedBucket, period],
  );
  const focusedReport = useMemo(
    () => focusedPeriod
      ? buildFinancialReport({ transactions, categories, wallets, budgets, period: focusedPeriod })
      : null,
    [transactions, categories, wallets, budgets, focusedPeriod],
  );
  const detailReport = focusedReport || report;
  const reportMotionRevision = `${period.kind}:${period.anchorDateKey}:${period.startDateKey}:${period.endDateKey}:${focusedBucketKey}`;
  const customDateError = period.kind === 'custom' && !report.bounds;
  const hasTransactions = transactions.length > 0;
  const hasPeriodTransactions = report.periodTransactionCount > 0;
  const hasFocusedTransactions = !focusedBucket || Boolean(focusedReport?.periodTransactionCount);

  useEffect(() => {
    if (focusedBucketKey && !focusedBucket) setFocusedBucketKey(null);
  }, [focusedBucket, focusedBucketKey]);

  const updateParentPeriod = (next: SetStateAction<ReportPeriod>) => {
    setFocusedBucketKey(null);
    setPeriod(next);
  };

  const handleSelectBucket = useCallback((bucketKey: string | null) => {
    setFocusedBucketKey(bucketKey);
  }, []);

  const clearFocusedBucket = useCallback(() => {
    setFocusedBucketKey(null);
  }, []);

  const selectPeriodKind = (value: string) => {
    const kind = value as ReportPeriodKind;
    if (kind === 'custom') {
      const monthBounds = getMonthBounds(period.anchorDateKey.slice(0, 7)) || getMonthBounds(toLocalDateKey().slice(0, 7));
      updateParentPeriod({
        kind,
        anchorDateKey: period.anchorDateKey,
        startDateKey: monthBounds?.startDateKey,
        endDateKey: monthBounds?.endDateKey,
      });
      return;
    }
    updateParentPeriod({ kind, anchorDateKey: period.anchorDateKey });
  };

  const resetCurrentPeriod = () => {
    const today = toLocalDateKey();
    if (period.kind === 'custom') {
      const monthBounds = getMonthBounds(today.slice(0, 7));
      updateParentPeriod({
        kind: 'custom',
        anchorDateKey: today,
        startDateKey: monthBounds?.startDateKey,
        endDateKey: monthBounds?.endDateKey,
      });
      return;
    }
    updateParentPeriod(current => ({ ...current, anchorDateKey: today }));
  };

  return (
    <div className="space-y-4">
      <ReportSurface className="p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <h2 className="text-section-title">Reports</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Understand what came in, what went out, and where your money moved.</p>
          </div>
          <div className="grid min-w-0 gap-2 @min-[32rem]/report:grid-cols-2 @min-[56rem]/report:grid-cols-[9rem_minmax(0,1fr)_auto_auto] @min-[56rem]/report:items-end">
            <div className="min-w-0">
              <label htmlFor="balance-report-period" className="mb-1 block text-xs font-bold text-muted-foreground">Period</label>
              <AndroidAdaptiveSelect
                id="balance-report-period"
                label="Report period"
                value={period.kind}
                options={PERIOD_OPTIONS}
                onChange={selectPeriodKind}
                className="w-full"
              />
            </div>
            {period.kind === 'custom' ? (
              <div className="grid min-w-0 gap-2 @min-[40rem]/report:grid-cols-2">
                <DatePicker label="From" value={period.startDateKey || ''} onChange={value => updateParentPeriod(current => ({ ...current, startDateKey: value }))} />
                <DatePicker label="To" value={period.endDateKey || ''} onChange={value => updateParentPeriod(current => ({ ...current, endDateKey: value }))} />
              </div>
            ) : (
              <div className="android-report-period-navigation flex min-w-0 items-center gap-1 rounded-xl border border-border/60 bg-background/45 p-0.5">
                <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0" onClick={() => updateParentPeriod(current => shiftReportPeriod(current, -1))} aria-label="Previous report period"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="min-w-0 flex-1 px-2 text-center text-sm font-bold">{periodLabel(period, report)}</span>
                <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0" onClick={() => updateParentPeriod(current => shiftReportPeriod(current, 1))} aria-label="Next report period"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
            <Button type="button" variant="outline" onClick={resetCurrentPeriod} className="min-h-11">Show current period</Button>
            <Button type="button" variant="outline" onClick={() => onExport(period)} className="min-h-11">
              <Download className="mr-2 h-4 w-4" /> Export report
            </Button>
          </div>
        </div>
        {period.kind === 'custom' ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarRange className="h-4 w-4" aria-hidden="true" />
            <span>{customDateError ? 'Choose a valid start and end date.' : periodLabel(period, report)}</span>
          </div>
        ) : null}
        {customDateError ? <p className="mt-2 text-xs font-semibold text-destructive" role="alert">The start date must be on or before the end date.</p> : null}
      </ReportSurface>

      {!hasTransactions ? (
        <ReportSurface className="p-8 text-center sm:p-12">
          <TrendingUp className="mx-auto h-9 w-9 text-primary" aria-hidden="true" />
          <h3 className="mt-4 text-section-title">No transaction data yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Add an income or expense to see your money patterns here.</p>
          <Button type="button" className="mt-5" onClick={onAddTransaction}>Add transaction</Button>
        </ReportSurface>
      ) : !hasPeriodTransactions ? (
        <ReportSurface className="p-8 text-center sm:p-12">
          <CalendarRange className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-4 text-section-title">No transactions for this period</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Try another period to see the transactions already in this profile.</p>
          <Button type="button" variant="outline" className="mt-5" onClick={resetCurrentPeriod}>Show current period</Button>
        </ReportSurface>
      ) : (
        <>
          <ReportSurface className="p-4 sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-section-title">Period summary</h3>
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {focusedPeriod && focusedReport ? `Focused: ${periodLabel(focusedPeriod, focusedReport)}` : periodLabel(period, report)}
                </p>
                {focusedPeriod ? <p className="mt-1 text-xs text-muted-foreground">Focused within {periodLabel(period, report)}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <p className="text-xs font-bold text-muted-foreground">{detailReport.periodTransactionCount.toLocaleString()} transaction{detailReport.periodTransactionCount === 1 ? '' : 's'}</p>
                {focusedBucket ? <Button type="button" size="sm" variant="outline" onClick={clearFocusedBucket}>Back to {periodLabel(period, report)}</Button> : null}
              </div>
            </div>
            {focusedBucket && !hasFocusedTransactions ? <p className="mt-4 rounded-xl border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">No transactions in the selected part of this period.</p> : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label="Income" value={detailReport.summary.income} detail="Income included in reports" hidden={hidden} tone="income" revision={reportMotionRevision} />
              <Metric label="Expense" value={detailReport.summary.expense} detail="Ordinary spending and fees" hidden={hidden} tone="expense" revision={reportMotionRevision} />
              <Metric label="Net" value={detailReport.summary.net} detail="Income less expense" hidden={hidden} tone="net" revision={reportMotionRevision} />
            </div>
            {detailReport.comparison ? (
              <div className="mt-5 border-t border-border/55 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold">Compared with previous {detailReport.comparison.kind}</p>
                  <p className="text-xs text-muted-foreground">Change</p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {([
                    ['Income', detailReport.comparison.delta.income, detailReport.comparison.percent.income],
                    ['Expense', detailReport.comparison.delta.expense, detailReport.comparison.percent.expense],
                    ['Net', detailReport.comparison.delta.net, detailReport.comparison.percent.net],
                  ] as const).map(([label, delta, percent]) => (
                    <div key={label} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-bold tabular-nums">
                        <span className={!hidden ? comparisonTone(label, delta, 'amount') : undefined}>{changeLabel(delta, hidden)}</span>
                        <span className={cn('ml-1', hidden || percent === null ? 'text-muted-foreground' : comparisonTone(label, percent, 'percent'))}>{percentLabel(percent, hidden)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </ReportSurface>

          {report.balanceTrend.points.length ? (
            <ReportSurface className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title">Balance trend</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{timelineSubtitle(report)}</p>
                </div>
                <TrendingUp className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              </div>
              <div className="mt-4">
                  <ReportMovementChart
                    points={report.balanceTrend.points}
                    hasProtectedSeries={report.balanceTrend.hasProtectedSeries}
                    hidden={hidden}
                    selectedPointKey={focusedBucketKey ? `balance:${focusedBucketKey}` : null}
                    onSelectPoint={pointKey => {
                      const bucketKey = pointKey?.replace(/^balance:/, '') || null;
                      handleSelectBucket(bucketKey);
                    }}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{report.balanceTrend.note}</p>
            </ReportSurface>
          ) : (
            <ReportSurface className="p-5">
              <p className="text-sm text-muted-foreground">Add a wallet in the Wallets tab to see its balance trend.</p>
            </ReportSurface>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <ReportSurface className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title">Expense</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Expenses by category</p>
                </div>
                <div className="flex items-center gap-2">
                  <BreakdownViewToggle value={expenseView} onChange={setExpenseView} label="Expense breakdown" />
                  <TrendingDown className="hidden h-5 w-5 text-destructive sm:block" aria-hidden="true" />
                </div>
              </div>
              <div className="mt-5">
                {expenseView === 'list' ? <BreakdownList rows={detailReport.expenseCategories} categories={categories} hidden={hidden} /> : <ReportBreakdownChart rows={detailReport.expenseCategories} hidden={hidden} direction="expense" androidPresentation={androidPresentation} />}
              </div>
            </ReportSurface>
            <ReportSurface className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title">Income</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Income by category</p>
                </div>
                <div className="flex items-center gap-2">
                  <BreakdownViewToggle value={incomeView} onChange={setIncomeView} label="Income breakdown" />
                  <TrendingUp className="hidden h-5 w-5 text-emerald-700 dark:text-emerald-300 sm:block" aria-hidden="true" />
                </div>
              </div>
              <div className="mt-5">
                {incomeView === 'list' ? <BreakdownList rows={detailReport.incomeCategories} categories={categories} hidden={hidden} /> : <ReportBreakdownChart rows={detailReport.incomeCategories} hidden={hidden} direction="income" androidPresentation={androidPresentation} />}
              </div>
            </ReportSurface>
          </div>

          <ReportSurface className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-section-title">Wallet movement</h3>
                <p className="mt-1 text-sm text-muted-foreground">Money movement included in reports for this period. These totals show changes, rather than current balances.</p>
              </div>
              <WalletCards className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-5"><WalletMovementList rows={detailReport.wallets} hidden={hidden} /></div>
          </ReportSurface>

          {detailReport.budget ? (
            <ReportSurface className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-section-title">Budget versus actual</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDateKey(`${detailReport.budget.month}-01`)} · spending derived from transactions</p>
                </div>
                <p className="text-sm font-bold tabular-nums">{hidden ? '••••••' : `${formatPHP(detailReport.budget.summary.spent)} spent`}</p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="min-w-0 px-1 py-2"><p className="text-xs font-bold text-muted-foreground">Allocated</p><p className="mt-1 break-words font-bold tabular-nums"><MonetaryNumber formatted={hidden ? '' : displayAmount(detailReport.budget.summary.allocated, false)} hidden={hidden} revision={reportMotionRevision} /></p></div>
                <div className="min-w-0 px-1 py-2"><p className="text-xs font-bold text-muted-foreground">Spent</p><p className="mt-1 break-words font-bold tabular-nums"><MonetaryNumber formatted={hidden ? '' : displayAmount(detailReport.budget.summary.spent, false)} hidden={hidden} revision={reportMotionRevision} /></p></div>
                <div className="min-w-0 px-1 py-2"><p className="text-xs font-bold text-muted-foreground">Remaining</p><p className="mt-1 break-words font-bold tabular-nums"><MonetaryNumber formatted={hidden ? '' : displaySignedAmount(detailReport.budget.summary.remaining, false)} hidden={hidden} revision={reportMotionRevision} /></p></div>
              </div>
              <div className="mt-4"><BudgetRows report={detailReport} categories={categories} hidden={hidden} /></div>
            </ReportSurface>
          ) : null}
        </>
      )}
    </div>
  );
}
