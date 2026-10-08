import { describe, expect, it } from 'vitest';

import {
  buildCategoryBreakdown,
  buildFinancialReport,
  buildMonthlyTrend,
  buildReportComparison,
  buildReportTimeline,
  buildWalletBreakdown,
  filterTransactionsByReportPeriod,
  getReportBudgetData,
  getReportPeriodBounds,
  getReportTimelineBucketPeriod,
  getReportTimelineGranularity,
  type ReportPeriod,
  summarizeReportTransactions,
} from '@/lib/finance/reports';
import type { Budget, FinancialCategory, Transaction, Wallet } from '@/lib/types';

const categories: FinancialCategory[] = [
  {
    id: 'food',
    type: 'expense',
    name: 'Food',
    total: '0',
    kind: 'neutral',
    subcategories: [
      { id: 'dining', name: 'Dining', total: '0' },
      { id: 'groceries', name: 'Groceries', total: '0' },
    ],
  },
  {
    id: 'salary',
    type: 'income',
    name: 'Salary',
    total: '0',
    kind: 'neutral',
    subcategories: [],
  },
];

const wallets: Wallet[] = [
  { id: 'cash', name: 'Cash', balance: 1000, color: '#000', type: 'cash_on_hand', createdAt: new Date('2026-01-01') },
  { id: 'savings', name: 'Savings', balance: 0, color: '#000', type: 'savings', createdAt: new Date('2026-01-01') },
];

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${Math.random()}`,
  type: 'expense',
  amount: 10,
  walletId: 'cash',
  date: new Date(2026, 7, 15, 12),
  createdAt: new Date(2026, 7, 15, 12),
  ...overrides,
});

const monthPeriod = (month = '2026-08'): ReportPeriod => ({
  kind: 'month',
  anchorDateKey: `${month}-15`,
});

const budget = (overrides: Partial<Budget> = {}): Budget => ({
  id: 'budget-food',
  month: '2026-08',
  categoryId: 'food',
  allocated: 100,
  createdAt: new Date('2026-08-01T12:00:00'),
  updatedAt: new Date('2026-08-01T12:00:00'),
  ...overrides,
});

describe('finance report periods', () => {
  const now = new Date(2026, 7, 23, 9);

  it('resolves Monday-based week, month, quarter, and year bounds', () => {
    expect(getReportPeriodBounds({ kind: 'week', anchorDateKey: '2026-08-23' }, now)).toEqual({
      startDateKey: '2026-08-17',
      endDateKey: '2026-08-23',
    });
    expect(getReportPeriodBounds({ kind: 'month', anchorDateKey: '2026-08-23' }, now)).toEqual({
      startDateKey: '2026-08-01',
      endDateKey: '2026-08-31',
    });
    expect(getReportPeriodBounds({ kind: 'quarter', anchorDateKey: '2026-08-23' }, now)).toEqual({
      startDateKey: '2026-07-01',
      endDateKey: '2026-09-30',
    });
    expect(getReportPeriodBounds({ kind: 'year', anchorDateKey: '2026-08-23' }, now)).toEqual({
      startDateKey: '2026-01-01',
      endDateKey: '2026-12-31',
    });
  });

  it('validates inclusive custom ranges and preserves local calendar dates', () => {
    const period: ReportPeriod = {
      kind: 'custom',
      anchorDateKey: '2026-08-10',
      startDateKey: '2026-08-10',
      endDateKey: '2026-08-12',
    };
    const rows = [
      transaction({ id: 'start', date: new Date(2026, 7, 10, 0, 5) }),
      transaction({ id: 'end', date: new Date(2026, 7, 12, 23, 55) }),
      transaction({ id: 'outside', date: new Date(2026, 7, 13, 0, 1) }),
    ];

    expect(getReportPeriodBounds(period)).toEqual({ startDateKey: '2026-08-10', endDateKey: '2026-08-12' });
    expect(filterTransactionsByReportPeriod(rows, period).map(row => row.id)).toEqual(['start', 'end']);
    expect(getReportPeriodBounds({ ...period, endDateKey: '2026-08-09' })).toBeNull();
  });

  it('handles leap-day month boundaries', () => {
    expect(getReportPeriodBounds({ kind: 'month', anchorDateKey: '2028-02-15' })).toEqual({
      startDateKey: '2028-02-01',
      endDateKey: '2028-02-29',
    });
  });
});

describe('finance report calculations', () => {
  const rows = [
    transaction({ id: 'income', type: 'income', amount: 1000, categoryId: 'salary', date: new Date(2026, 7, 2, 12) }),
    transaction({ id: 'dining', amount: 12.1, categoryId: 'food', subcategoryId: 'dining', date: new Date(2026, 7, 10, 12) }),
    transaction({ id: 'groceries', amount: 17.9, categoryId: 'food', subcategoryId: 'groceries', date: new Date(2026, 7, 10, 13) }),
    transaction({ id: 'uncategorized', amount: 5, categoryId: undefined, date: new Date(2026, 7, 20, 12) }),
    transaction({ id: 'excluded', amount: 80, categoryId: 'food', excludeFromReports: true, date: new Date(2026, 7, 21, 12) }),
    transaction({ id: 'adjustment', type: 'adjustment', amount: 100, adjustmentDirection: 'decrease', date: new Date(2026, 7, 22, 12) }),
    transaction({ id: 'transfer', type: 'transfer', amount: 300, fee: 3, destinationWalletId: 'savings', date: new Date(2026, 7, 23, 12) }),
    transaction({ id: 'previous-month', amount: 50, date: new Date(2026, 6, 31, 23, 30) }),
  ];

  it('uses reportable income, ordinary expense, and transfer fee semantics with cent precision', () => {
    expect(summarizeReportTransactions(rows.slice(0, 7))).toEqual({
      income: 1000,
      expense: 38,
      net: 962,
    });
  });

  it('aggregates category totals across subcategories and handles uncategorized rows', () => {
    expect(buildCategoryBreakdown(rows.slice(0, 7), categories, 'expense')).toEqual([
      expect.objectContaining({ id: 'food', label: 'Food', amount: 30, percentage: expect.closeTo(78.947, 3) }),
      expect.objectContaining({ id: '__uncategorized__', label: 'Uncategorized', amount: 8, percentage: expect.closeTo(21.0526, 3) }),
    ]);
    expect(buildCategoryBreakdown(rows.slice(0, 7), categories, 'income')).toEqual([
      expect.objectContaining({ id: 'salary', label: 'Salary', amount: 1000, percentage: 100 }),
    ]);
  });

  it('attributes reportable wallet movement to the source wallet for transfer fees', () => {
    expect(buildWalletBreakdown(rows.slice(0, 7), wallets)).toEqual([
      expect.objectContaining({ id: 'cash', income: 1000, expense: 38, net: 962 }),
    ]);
  });

  it('excludes ordinary excluded income from report summaries and breakdowns', () => {
    const excludedIncome = transaction({
      id: 'excluded-income',
      type: 'income',
      amount: 250,
      categoryId: 'salary',
      excludeFromReports: true,
      date: new Date(2026, 7, 12, 12),
    });
    const report = buildFinancialReport({
      transactions: [excludedIncome],
      categories,
      wallets,
      period: monthPeriod(),
    });

    expect(report.summary).toEqual({ income: 0, expense: 0, net: 0 });
    expect(buildCategoryBreakdown([excludedIncome], categories, 'income')).toEqual([]);
    expect(buildWalletBreakdown([excludedIncome], wallets)).toEqual([]);
    expect(report.timeline.find(bucket => bucket.startDateKey === '2026-08-12')).toMatchObject({
      income: 0,
      expense: 0,
      net: 0,
      transactionCount: 0,
    });
  });

  it('creates twelve month trend points and keeps zero months', () => {
    const trend = buildMonthlyTrend(rows, 2026);
    expect(trend).toHaveLength(12);
    expect(trend[6]).toMatchObject({ monthKey: '2026-07', expense: 50, net: -50 });
    expect(trend[7]).toMatchObject({ monthKey: '2026-08', income: 1000, expense: 38, net: 962 });
    expect(trend[0]).toMatchObject({ monthKey: '2026-01', income: 0, expense: 0, net: 0 });
  });

  it('compares the selected month with the previous month', () => {
    const comparison = buildReportComparison(monthPeriod(), rows);
    expect(comparison).toMatchObject({
      kind: 'month',
      current: { income: 1000, expense: 38, net: 962 },
      previous: { income: 0, expense: 50, net: -50 },
      delta: { income: 1000, expense: -12, net: 1012 },
    });
    expect(comparison?.percent.income).toBeNull();
    expect(comparison?.percent.expense).toBeCloseTo(-24, 5);
  });

  it('derives budget data only for an exact selected month', () => {
    const month = getReportBudgetData(monthPeriod(), [budget()], rows);
    expect(month?.month).toBe('2026-08');
    expect(month?.summary).toEqual({ allocated: 100, spent: 30, remaining: 70, overBy: 0 });
    expect(getReportBudgetData({ kind: 'week', anchorDateKey: '2026-08-23' }, [budget()], rows)).toBeNull();
  });

  it('builds the complete derived report without changing source arrays', () => {
    const originalRows = [...rows];
    const report = buildFinancialReport({
      transactions: rows,
      categories,
      wallets,
      budgets: [budget()],
      period: monthPeriod(),
    });

    expect(report.periodTransactionCount).toBe(7);
    expect(report.hasReportableMovement).toBe(true);
    expect(report.budget?.metrics[0].spent).toBe(30);
    expect(rows).toEqual(originalRows);
  });
});

describe('finance report timelines', () => {
  const now = new Date(2026, 7, 23, 9);
  const timelineRows = [
    transaction({ id: 'timeline-income', type: 'income', amount: 1000, categoryId: 'salary', date: new Date(2026, 7, 2, 12) }),
    transaction({ id: 'timeline-expense', amount: 30, categoryId: 'food', date: new Date(2026, 7, 10, 12) }),
    transaction({ id: 'timeline-transfer', type: 'transfer', amount: 300, fee: 3, destinationWalletId: 'savings', date: new Date(2026, 7, 23, 12) }),
    transaction({ id: 'timeline-excluded', amount: 80, excludeFromReports: true, date: new Date(2026, 7, 21, 12) }),
    transaction({ id: 'timeline-adjustment', type: 'adjustment', amount: 100, adjustmentDirection: 'decrease', date: new Date(2026, 7, 22, 12) }),
    transaction({ id: 'timeline-previous', amount: 50, date: new Date(2026, 6, 31, 23, 30) }),
  ];

  it('builds seven Monday-based daily buckets for a week', () => {
    const timeline = buildReportTimeline([], { kind: 'week', anchorDateKey: '2026-08-23' }, now);
    expect(timeline).toHaveLength(7);
    expect(timeline[0]).toMatchObject({ startDateKey: '2026-08-17', endDateKey: '2026-08-17', shortLabel: 'Aug 17' });
    expect(timeline[6]).toMatchObject({ startDateKey: '2026-08-23', endDateKey: '2026-08-23' });
  });

  it('builds every local calendar day for month periods', () => {
    expect(buildReportTimeline([], { kind: 'month', anchorDateKey: '2026-02-15' })).toHaveLength(28);
    expect(buildReportTimeline([], { kind: 'month', anchorDateKey: '2028-02-15' })).toHaveLength(29);
    expect(buildReportTimeline([], { kind: 'month', anchorDateKey: '2026-04-15' })).toHaveLength(30);
    expect(buildReportTimeline([], { kind: 'month', anchorDateKey: '2026-08-15' })).toHaveLength(31);
  });

  it('builds exactly three quarter buckets and twelve year buckets', () => {
    const quarter = buildReportTimeline([], { kind: 'quarter', anchorDateKey: '2026-08-23' }, now);
    const year = buildReportTimeline([], { kind: 'year', anchorDateKey: '2026-08-23' }, now);
    expect(quarter.map(bucket => bucket.startDateKey)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
    expect(year).toHaveLength(12);
    expect(year[0].startDateKey).toBe('2026-01-01');
    expect(year[11].endDateKey).toBe('2026-12-31');
  });

  it('uses the fixed custom-period granularity thresholds', () => {
    const custom = (endDateKey: string): ReportPeriod => ({
      kind: 'custom',
      anchorDateKey: '2026-01-01',
      startDateKey: '2026-01-01',
      endDateKey,
    });

    expect(getReportTimelineGranularity(custom('2026-01-31'))).toBe('day');
    expect(getReportTimelineGranularity(custom('2026-02-01'))).toBe('week');
    expect(getReportTimelineGranularity(custom('2026-06-29'))).toBe('week');
    expect(getReportTimelineGranularity(custom('2026-06-30'))).toBe('month');
  });

  it('clips custom weekly and monthly buckets to the selected bounds', () => {
    const weeklyPeriod: ReportPeriod = {
      kind: 'custom',
      anchorDateKey: '2026-01-03',
      startDateKey: '2026-01-03',
      endDateKey: '2026-02-03',
    };
    const weekly = buildReportTimeline([], weeklyPeriod);
    expect(weekly[0]).toMatchObject({ startDateKey: '2026-01-03', endDateKey: '2026-01-04' });
    expect(weekly.at(-1)).toMatchObject({ startDateKey: '2026-02-02', endDateKey: '2026-02-03' });

    const monthlyPeriod: ReportPeriod = {
      kind: 'custom',
      anchorDateKey: '2026-01-15',
      startDateKey: '2026-01-15',
      endDateKey: '2026-07-15',
    };
    const monthly = buildReportTimeline([], monthlyPeriod);
    expect(monthly[0]).toMatchObject({ startDateKey: '2026-01-15', endDateKey: '2026-01-31' });
    expect(monthly.at(-1)).toMatchObject({ startDateKey: '2026-07-01', endDateKey: '2026-07-15' });
  });

  it('keeps timeline totals equal to the parent report totals', () => {
    const report = buildFinancialReport({
      transactions: timelineRows,
      categories,
      wallets,
      budgets: [budget()],
      period: { kind: 'year', anchorDateKey: '2026-08-23' },
      now,
    });
    expect(report.timeline).toHaveLength(12);
    expect(report.timeline.reduce((sum, point) => sum + point.income, 0)).toBe(report.summary.income);
    expect(report.timeline.reduce((sum, point) => sum + point.expense, 0)).toBe(report.summary.expense);
    expect(report.timeline.reduce((sum, point) => sum + point.net, 0)).toBe(report.summary.net);
    expect(report.timeline.find(point => point.startDateKey === '2026-08-01')?.expense).toBe(33);
    expect(report.timeline.find(point => point.startDateKey === '2026-01-01')?.income).toBe(0);
  });

  it('counts only reportable transactions in timeline buckets', () => {
    const rows = [
      transaction({ id: 'count-income', type: 'income', amount: 100, date: new Date(2026, 7, 2, 12) }),
      transaction({ id: 'count-expense', amount: 25, date: new Date(2026, 7, 3, 12) }),
      transaction({ id: 'count-excluded', amount: 50, excludeFromReports: true, date: new Date(2026, 7, 4, 12) }),
      transaction({ id: 'count-adjustment', type: 'adjustment', amount: 10, adjustmentDirection: 'increase', date: new Date(2026, 7, 5, 12) }),
      transaction({ id: 'count-transfer', type: 'transfer', amount: 80, destinationWalletId: 'savings', date: new Date(2026, 7, 6, 12) }),
      transaction({ id: 'count-transfer-fee', type: 'transfer', amount: 80, fee: 2, destinationWalletId: 'savings', date: new Date(2026, 7, 7, 12) }),
    ];
    const timeline = buildReportTimeline(rows, { kind: 'month', anchorDateKey: '2026-08-23' });

    expect(timeline.reduce((total, bucket) => total + bucket.transactionCount, 0)).toBe(3);
    expect(timeline.find(bucket => bucket.startDateKey === '2026-08-04')?.transactionCount).toBe(0);
    expect(timeline.find(bucket => bucket.startDateKey === '2026-08-05')?.transactionCount).toBe(0);
    expect(timeline.find(bucket => bucket.startDateKey === '2026-08-06')?.transactionCount).toBe(0);
    expect(timeline.find(bucket => bucket.startDateKey === '2026-08-07')?.transactionCount).toBe(1);
  });

  it('maps timeline buckets to focused month and exact custom periods', () => {
    const yearPeriod: ReportPeriod = { kind: 'year', anchorDateKey: '2026-08-23' };
    const yearTimeline = buildReportTimeline(timelineRows, yearPeriod, now);
    const august = yearTimeline.find(bucket => bucket.startDateKey === '2026-08-01');
    expect(august).toBeDefined();
    expect(getReportTimelineBucketPeriod(august!, yearPeriod)).toEqual({
      kind: 'month',
      anchorDateKey: '2026-08-01',
    });

    const monthPeriod: ReportPeriod = { kind: 'month', anchorDateKey: '2026-08-23' };
    const day = buildReportTimeline(timelineRows, monthPeriod, now).find(bucket => bucket.startDateKey === '2026-08-10');
    expect(day).toBeDefined();
    expect(getReportTimelineBucketPeriod(day!, monthPeriod)).toEqual({
      kind: 'custom',
      anchorDateKey: '2026-08-10',
      startDateKey: '2026-08-10',
      endDateKey: '2026-08-10',
    });
  });

  it('shows month budget data when a year bucket is focused', () => {
    const yearPeriod: ReportPeriod = { kind: 'year', anchorDateKey: '2026-08-23' };
    const august = buildReportTimeline(timelineRows, yearPeriod, now).find(bucket => bucket.startDateKey === '2026-08-01');
    const focusedPeriod = getReportTimelineBucketPeriod(august!, yearPeriod);
    const focused = buildFinancialReport({
      transactions: timelineRows,
      categories,
      wallets,
      budgets: [budget()],
      period: focusedPeriod,
      now,
    });
    expect(focusedPeriod.kind).toBe('month');
    expect(focused.budget?.month).toBe('2026-08');
    expect(focused.comparison?.kind).toBe('month');
  });

  it('handles a 4,000-transaction report without changing timeline shape', () => {
    const largeRows = Array.from({ length: 4000 }, (_, index) => transaction({
      id: `large-${index}`,
      amount: index % 2 ? 1.25 : 2.5,
      date: new Date(2026, index % 12, (index % 27) + 1, 12),
      categoryId: index % 2 ? 'food' : undefined,
    }));
    const report = buildFinancialReport({
      transactions: largeRows,
      categories,
      wallets,
      period: { kind: 'year', anchorDateKey: '2026-08-23' },
      now,
    });
    expect(report.periodTransactionCount).toBe(4000);
    expect(report.timeline).toHaveLength(12);
    expect(report.timeline.reduce((sum, point) => sum + point.expense, 0)).toBe(report.summary.expense);
  });
});
