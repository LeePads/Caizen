import { parseLocalDateKey, toLocalDateKey, isValidLocalDateKey } from '../date-utils';
import { addMoney, sumMoney } from '../money';
import type {
  Budget,
  FinancialCategory,
  Transaction,
  Wallet,
} from '../types';
import {
  getTransactionReportableAmounts,
  transactionWalletDeltas,
  type TransactionHistorySummary,
} from '../transactions';
import {
  calculateBudgetMetrics,
  calculateBudgetSummary,
  type BudgetMetrics,
  type BudgetSummary,
} from './budgets';

export type ReportPeriodKind =
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'custom';

export type ReportPeriod = {
  kind: ReportPeriodKind;
  anchorDateKey: string;
  startDateKey?: string;
  endDateKey?: string;
};

export type ReportPeriodBounds = {
  startDateKey: string;
  endDateKey: string;
};

export type ReportSummary = TransactionHistorySummary;

export type ReportBreakdownDirection = 'income' | 'expense';

export type ReportBreakdownRow = {
  id: string;
  label: string;
  amount: number;
  percentage: number;
  transactionCount: number;
};

export type ReportWalletRow = {
  id: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
};

export type ReportMonthlyTrendPoint = {
  monthKey: string;
  income: number;
  expense: number;
  net: number;
};

export type ReportTimelineGranularity = 'day' | 'week' | 'month';

export type ReportTimelineBucket = {
  key: string;
  label: string;
  shortLabel: string;
  granularity: ReportTimelineGranularity;
  startDateKey: string;
  endDateKey: string;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
};

export type ReportBalanceTrendPoint = {
  key: string;
  label: string;
  shortLabel: string;
  granularity: ReportTimelineGranularity;
  startDateKey: string;
  endDateKey: string;
  available: number;
  protected: number;
  total: number;
};

export type ReportBalanceTrend = {
  points: ReportBalanceTrendPoint[];
  hasProtectedSeries: boolean;
  note: string;
};

export type ReportComparison = {
  kind: 'month' | 'year';
  current: ReportSummary;
  previous: ReportSummary;
  delta: ReportSummary;
  percent: {
    income: number | null;
    expense: number | null;
    net: number | null;
  };
};

export type ReportBudgetData = {
  month: string;
  summary: BudgetSummary;
  metrics: BudgetMetrics[];
};

export type FinancialReport = {
  period: ReportPeriod;
  bounds: ReportPeriodBounds | null;
  transactions: Transaction[];
  summary: ReportSummary;
  incomeCategories: ReportBreakdownRow[];
  expenseCategories: ReportBreakdownRow[];
  wallets: ReportWalletRow[];
  monthlyTrend: ReportMonthlyTrendPoint[];
  timeline: ReportTimelineBucket[];
  balanceTrend: ReportBalanceTrend;
  comparison: ReportComparison | null;
  budget: ReportBudgetData | null;
  periodTransactionCount: number;
  hasReportableMovement: boolean;
};

export type BuildFinancialReportInput = {
  transactions: Transaction[];
  categories: FinancialCategory[];
  wallets: Wallet[];
  budgets?: Budget[];
  period: ReportPeriod;
  now?: Date;
};

const UNCATEGORIZED_ID = '__uncategorized__';

const DAY_MS = 24 * 60 * 60 * 1000;

function localNoon(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function dateKeyAt(year: number, month: number, day: number) {
  return toLocalDateKey(new Date(year, month, day, 12, 0, 0, 0));
}

function addLocalDays(dateKey: string, days: number) {
  const date = parseLocalDateKey(dateKey);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

function addLocalMonths(dateKey: string, months: number) {
  const date = parseLocalDateKey(dateKey);
  if (!date) return '';
  date.setDate(1);
  date.setMonth(date.getMonth() + months, 1);
  return toLocalDateKey(date);
}

function daysBetweenInclusive(startDateKey: string, endDateKey: string) {
  const start = parseLocalDateKey(startDateKey);
  const end = parseLocalDateKey(endDateKey);
  if (!start || !end) return 0;
  return Math.round((localNoon(end).getTime() - localNoon(start).getTime()) / DAY_MS) + 1;
}

function mondayOnOrBefore(dateKey: string) {
  const date = parseLocalDateKey(dateKey);
  if (!date) return '';
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return toLocalDateKey(date);
}

function endOfMonth(dateKey: string) {
  const date = parseLocalDateKey(dateKey);
  if (!date) return '';
  return dateKeyAt(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatTimelineDate(dateKey: string, options: Intl.DateTimeFormatOptions) {
  const date = parseLocalDateKey(dateKey);
  return date?.toLocaleDateString(undefined, options) || dateKey;
}

function getAnchorDate(period: ReportPeriod, now: Date) {
  const parsed = parseLocalDateKey(period.anchorDateKey);
  return localNoon(parsed || now);
}

function getPeriodDateKeys(
  period: Exclude<ReportPeriodKind, 'custom'>,
  anchor: Date,
): ReportPeriodBounds {
  if (period === 'week') {
    const mondayOffset = (anchor.getDay() + 6) % 7;
    return {
      startDateKey: dateKeyAt(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - mondayOffset),
      endDateKey: dateKeyAt(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - mondayOffset + 6),
    };
  }

  if (period === 'month') {
    return {
      startDateKey: dateKeyAt(anchor.getFullYear(), anchor.getMonth(), 1),
      endDateKey: dateKeyAt(anchor.getFullYear(), anchor.getMonth() + 1, 0),
    };
  }

  if (period === 'quarter') {
    const quarterStartMonth = Math.floor(anchor.getMonth() / 3) * 3;
    return {
      startDateKey: dateKeyAt(anchor.getFullYear(), quarterStartMonth, 1),
      endDateKey: dateKeyAt(anchor.getFullYear(), quarterStartMonth + 3, 0),
    };
  }

  return {
    startDateKey: dateKeyAt(anchor.getFullYear(), 0, 1),
    endDateKey: dateKeyAt(anchor.getFullYear() + 1, 0, 0),
  };
}

export function getReportPeriodBounds(
  period: ReportPeriod,
  now = new Date(),
): ReportPeriodBounds | null {
  if (period.kind === 'custom') {
    if (
      !isValidLocalDateKey(period.startDateKey) ||
      !isValidLocalDateKey(period.endDateKey) ||
      period.startDateKey > period.endDateKey
    ) {
      return null;
    }
    return {
      startDateKey: period.startDateKey,
      endDateKey: period.endDateKey,
    };
  }

  return getPeriodDateKeys(period.kind, getAnchorDate(period, now));
}

export function getReportTimelineGranularity(
  period: ReportPeriod,
  bounds = getReportPeriodBounds(period),
): ReportTimelineGranularity {
  if (period.kind === 'week' || period.kind === 'month') return 'day';
  if (period.kind === 'quarter' || period.kind === 'year') return 'month';
  const dayCount = bounds ? daysBetweenInclusive(bounds.startDateKey, bounds.endDateKey) : 0;
  if (dayCount <= 31) return 'day';
  if (dayCount <= 180) return 'week';
  return 'month';
}

function createTimelineBucket(
  granularity: ReportTimelineGranularity,
  startDateKey: string,
  endDateKey: string,
): ReportTimelineBucket {
  const startLabel = formatTimelineDate(startDateKey, {
    month: 'short',
    day: 'numeric',
  });
  const endLabel = formatTimelineDate(endDateKey, {
    month: 'short',
    day: 'numeric',
  });
  const label = granularity === 'day'
    ? formatTimelineDate(startDateKey, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : granularity === 'month'
      ? formatTimelineDate(startDateKey, { month: 'long', year: 'numeric' })
      : `${startLabel} – ${endLabel}`;
  const shortLabel = granularity === 'day'
    ? startLabel
    : granularity === 'month'
      ? formatTimelineDate(startDateKey, { month: 'short' })
      : `${startLabel}–${endLabel}`;

  return {
    key: `${granularity}:${startDateKey}:${endDateKey}`,
    label,
    shortLabel,
    granularity,
    startDateKey,
    endDateKey,
    income: 0,
    expense: 0,
    net: 0,
    transactionCount: 0,
  };
}

function buildTimelineSkeleton(
  period: ReportPeriod,
  bounds: ReportPeriodBounds,
): ReportTimelineBucket[] {
  const granularity = getReportTimelineGranularity(period, bounds);
  const buckets: ReportTimelineBucket[] = [];

  if (granularity === 'day') {
    let cursor = bounds.startDateKey;
    while (cursor && cursor <= bounds.endDateKey) {
      buckets.push(createTimelineBucket(granularity, cursor, cursor));
      cursor = addLocalDays(cursor, 1);
    }
    return buckets;
  }

  if (granularity === 'month') {
    let cursor = `${bounds.startDateKey.slice(0, 7)}-01`;
    while (cursor && cursor <= bounds.endDateKey) {
      const monthEnd = endOfMonth(cursor);
      buckets.push(createTimelineBucket(
        granularity,
        cursor < bounds.startDateKey ? bounds.startDateKey : cursor,
        monthEnd > bounds.endDateKey ? bounds.endDateKey : monthEnd,
      ));
      cursor = addLocalMonths(cursor, 1);
    }
    return buckets;
  }

  let cursor = mondayOnOrBefore(bounds.startDateKey);
  while (cursor && cursor <= bounds.endDateKey) {
    const weekEnd = addLocalDays(cursor, 6);
    buckets.push(createTimelineBucket(
      granularity,
      cursor < bounds.startDateKey ? bounds.startDateKey : cursor,
      weekEnd > bounds.endDateKey ? bounds.endDateKey : weekEnd,
    ));
    cursor = addLocalDays(cursor, 7);
  }
  return buckets;
}

function populateTimelineBuckets(
  buckets: ReportTimelineBucket[],
  transactions: Transaction[],
) {
  const bucketByDate = new Map<string, ReportTimelineBucket>();
  buckets.forEach(bucket => {
    let cursor = bucket.startDateKey;
    while (cursor && cursor <= bucket.endDateKey) {
      bucketByDate.set(cursor, bucket);
      cursor = addLocalDays(cursor, 1);
    }
  });

  transactions.forEach(transaction => {
    const bucket = bucketByDate.get(toLocalDateKey(transaction.date));
    if (!bucket) return;
    const amounts = getTransactionReportableAmounts(transaction);
    if (amounts.income > 0 || amounts.expense > 0) {
      bucket.transactionCount += 1;
    }
    bucket.income = addMoney(bucket.income, amounts.income);
    bucket.expense = addMoney(bucket.expense, amounts.expense);
    bucket.net = addMoney(bucket.income, -bucket.expense);
  });

  return buckets;
}

function buildTimelineFromTransactions(
  transactions: Transaction[],
  period: ReportPeriod,
  bounds: ReportPeriodBounds,
) {
  return populateTimelineBuckets(buildTimelineSkeleton(period, bounds), transactions);
}

export function buildReportTimeline(
  transactions: Transaction[],
  period: ReportPeriod,
  now = new Date(),
) {
  const bounds = getReportPeriodBounds(period, now);
  if (!bounds) return [];
  return buildTimelineFromTransactions(
    filterTransactionsByReportPeriod(transactions, period, now),
    period,
    bounds,
  );
}

function reportWalletIsProtected(wallet: Wallet) {
  if (wallet.isProtected !== undefined) return wallet.isProtected;
  return wallet.type === 'savings' || wallet.type === 'investment';
}

function reportWalletIsSpendable(wallet: Wallet) {
  if (wallet.includeInSpendable !== undefined) return wallet.includeInSpendable;
  return wallet.type === 'free_spending' || wallet.type === 'cash_on_hand';
}

/**
 * Reconstructs end-of-bucket wallet balances from the current wallet values
 * and the existing transaction ledger. This stays derived-only: no snapshots
 * are written, and transfers use the same wallet deltas as balance updates.
 */
export function buildReportBalanceTrend(
  transactions: Transaction[],
  wallets: Wallet[],
  period: ReportPeriod,
  now = new Date(),
): ReportBalanceTrend {
  const bounds = getReportPeriodBounds(period, now);
  if (!bounds || wallets.length === 0) {
    return {
      points: [],
      hasProtectedSeries: false,
      note: 'A balance trend needs at least one wallet with a current balance.',
    };
  }

  const buckets = buildTimelineSkeleton(period, bounds);
  const currentBalances = new Map(
    wallets.map(wallet => [wallet.id, Number.isFinite(Number(wallet.balance)) ? Number(wallet.balance) : 0]),
  );
  const hasProtectedSeries = wallets.some(reportWalletIsProtected);
  const points = buckets.map(bucket => {
    const postBucketDeltas = new Map<string, number>();

    transactions.forEach(transaction => {
      const dateKey = toLocalDateKey(transaction.date);
      if (!dateKey || dateKey <= bucket.endDateKey) return;
      transactionWalletDeltas(transaction).forEach((delta, walletId) => {
        postBucketDeltas.set(walletId, addMoney(postBucketDeltas.get(walletId) || 0, delta));
      });
    });

    const balanceAtEnd = (wallet: Wallet) => addMoney(
      currentBalances.get(wallet.id) || 0,
      -(postBucketDeltas.get(wallet.id) || 0),
    );
    const available = sumMoney(wallets.filter(reportWalletIsSpendable).map(balanceAtEnd));
    const protectedBalance = sumMoney(wallets.filter(reportWalletIsProtected).map(balanceAtEnd));
    const total = sumMoney(wallets.map(balanceAtEnd));

    return {
      key: `balance:${bucket.key}`,
      label: bucket.label,
      shortLabel: bucket.shortLabel,
      granularity: bucket.granularity,
      startDateKey: bucket.startDateKey,
      endDateKey: bucket.endDateKey,
      available,
      protected: protectedBalance,
      total,
    };
  });

  return {
    points,
    hasProtectedSeries,
    note: 'Reconstructed from current wallet balances and recorded wallet effects. Balance changes without a transaction cannot be inferred.',
  };
}

export function getReportTimelineBucketPeriod(
  bucket: ReportTimelineBucket,
  parentPeriod: ReportPeriod,
): ReportPeriod {
  const isFullMonthBucket = bucket.granularity === 'month' &&
    bucket.startDateKey.endsWith('-01') &&
    bucket.endDateKey === endOfMonth(bucket.startDateKey);

  if ((parentPeriod.kind === 'quarter' || parentPeriod.kind === 'year') && isFullMonthBucket) {
    return {
      kind: 'month',
      anchorDateKey: bucket.startDateKey,
    };
  }

  return {
    kind: 'custom',
    anchorDateKey: bucket.startDateKey,
    startDateKey: bucket.startDateKey,
    endDateKey: bucket.endDateKey,
  };
}

export function filterTransactionsByReportPeriod(
  transactions: Transaction[],
  period: ReportPeriod,
  now = new Date(),
) {
  const bounds = getReportPeriodBounds(period, now);
  if (!bounds) return [];

  return transactions.filter(transaction => {
    const dateKey = toLocalDateKey(transaction.date);
    return Boolean(
      dateKey &&
        dateKey >= bounds.startDateKey &&
        dateKey <= bounds.endDateKey,
    );
  });
}

export function summarizeReportTransactions(
  transactions: Transaction[],
): ReportSummary {
  let income = 0;
  let expense = 0;

  transactions.forEach(transaction => {
    const amounts = getTransactionReportableAmounts(transaction);
    income = addMoney(income, amounts.income);
    expense = addMoney(expense, amounts.expense);
  });

  return {
    income,
    expense,
    net: addMoney(income, -expense),
  };
}

type ReportLookups = {
  categoryById: Map<string, FinancialCategory>;
  walletById: Map<string, Wallet>;
};

type ReportAggregation = {
  summary: ReportSummary;
  incomeCategories: Map<string, ReportBreakdownRow>;
  expenseCategories: Map<string, ReportBreakdownRow>;
  wallets: Map<string, ReportWalletRow>;
};

function createReportLookups(
  categories: FinancialCategory[],
  wallets: Wallet[],
): ReportLookups {
  return {
    categoryById: new Map(categories.map(category => [category.id, category])),
    walletById: new Map(wallets.map(wallet => [wallet.id, wallet])),
  };
}

function aggregateReportTransactions(
  transactions: Transaction[],
  lookups: ReportLookups,
  timelineBuckets?: ReportTimelineBucket[],
): ReportAggregation {
  let income = 0;
  let expense = 0;
  const incomeCategories = new Map<string, ReportBreakdownRow>();
  const expenseCategories = new Map<string, ReportBreakdownRow>();
  const wallets = new Map<string, ReportWalletRow>();
  const bucketByDate = timelineBuckets ? new Map<string, ReportTimelineBucket>() : null;
  timelineBuckets?.forEach(bucket => {
    let cursor = bucket.startDateKey;
    while (cursor && cursor <= bucket.endDateKey) {
      bucketByDate?.set(cursor, bucket);
      cursor = addLocalDays(cursor, 1);
    }
  });

  const addCategoryAmount = (
    map: Map<string, ReportBreakdownRow>,
    transaction: Transaction,
    amount: number,
  ) => {
    if (amount <= 0) return;
    const category = lookups.categoryById.get(transaction.categoryId || '');
    const id = category?.id || UNCATEGORIZED_ID;
    const current = map.get(id) || {
      id,
      label: category?.name?.trim() || 'Uncategorized',
      amount: 0,
      percentage: 0,
      transactionCount: 0,
    };
    current.amount = addMoney(current.amount, amount);
    current.transactionCount += 1;
    map.set(id, current);
  };

  transactions.forEach(transaction => {
    const timelineBucket = bucketByDate?.get(toLocalDateKey(transaction.date));
    const amounts = getTransactionReportableAmounts(transaction);
    if (timelineBucket) {
      if (amounts.income > 0 || amounts.expense > 0) {
        timelineBucket.transactionCount += 1;
      }
      timelineBucket.income = addMoney(timelineBucket.income, amounts.income);
      timelineBucket.expense = addMoney(timelineBucket.expense, amounts.expense);
      timelineBucket.net = addMoney(timelineBucket.income, -timelineBucket.expense);
    }
    income = addMoney(income, amounts.income);
    expense = addMoney(expense, amounts.expense);
    addCategoryAmount(incomeCategories, transaction, amounts.income);
    addCategoryAmount(expenseCategories, transaction, amounts.expense);

    if (amounts.income <= 0 && amounts.expense <= 0) return;
    const wallet = lookups.walletById.get(transaction.walletId || '');
    const id = transaction.walletId || '__unknown__';
    const current = wallets.get(id) || {
      id,
      label: wallet?.name?.trim() || 'Unknown wallet',
      income: 0,
      expense: 0,
      net: 0,
      transactionCount: 0,
    };
    current.income = addMoney(current.income, amounts.income);
    current.expense = addMoney(current.expense, amounts.expense);
    current.net = addMoney(current.income, -current.expense);
    current.transactionCount += 1;
    wallets.set(id, current);
  });

  return {
    summary: {
      income,
      expense,
      net: addMoney(income, -expense),
    },
    incomeCategories,
    expenseCategories,
    wallets,
  };
}

function finalizeCategoryMap(
  map: Map<string, ReportBreakdownRow>,
): ReportBreakdownRow[] {
  const total = sumMoney([...map.values()].map(row => row.amount));
  return [...map.values()]
    .map(row => ({
      ...row,
      percentage: total > 0 ? (row.amount / total) * 100 : 0,
    }))
    .sort((left, right) =>
      right.amount - left.amount || left.label.localeCompare(right.label),
    );
}

function finalizeWalletMap(map: Map<string, ReportWalletRow>) {
  return [...map.values()].sort((left, right) =>
    Math.abs(right.net) - Math.abs(left.net) || left.label.localeCompare(right.label),
  );
}

export function buildCategoryBreakdown(
  transactions: Transaction[],
  categories: FinancialCategory[],
  direction: ReportBreakdownDirection,
): ReportBreakdownRow[] {
  const aggregation = aggregateReportTransactions(
    transactions,
    createReportLookups(categories, []),
  );
  return finalizeCategoryMap(
    direction === 'income' ? aggregation.incomeCategories : aggregation.expenseCategories,
  );
}

export function buildWalletBreakdown(
  transactions: Transaction[],
  wallets: Wallet[],
): ReportWalletRow[] {
  const aggregation = aggregateReportTransactions(
    transactions,
    createReportLookups([], wallets),
  );
  return finalizeWalletMap(aggregation.wallets);
}

export function buildMonthlyTrend(
  transactions: Transaction[],
  year: number,
): ReportMonthlyTrendPoint[] {
  const yearText = String(year).padStart(4, '0');
  const points = Array.from({ length: 12 }, (_, month) => ({
    monthKey: `${yearText}-${String(month + 1).padStart(2, '0')}`,
    income: 0,
    expense: 0,
    net: 0,
  }));

  transactions.forEach(transaction => {
    const dateKey = toLocalDateKey(transaction.date);
    if (!dateKey.startsWith(`${yearText}-`)) return;

    const monthIndex = Number(dateKey.slice(5, 7)) - 1;
    const point = points[monthIndex];
    if (!point) return;

    const amounts = getTransactionReportableAmounts(transaction);
    point.income = addMoney(point.income, amounts.income);
    point.expense = addMoney(point.expense, amounts.expense);
    point.net = addMoney(point.income, -point.expense);
  });

  return points;
}

export function shiftReportPeriod(
  period: ReportPeriod,
  delta: number,
): ReportPeriod {
  if (period.kind === 'custom') return period;

  const date = getAnchorDate(period, new Date());
  if (period.kind === 'week') date.setDate(date.getDate() + delta * 7);
  if (period.kind === 'month') date.setMonth(date.getMonth() + delta, 1);
  if (period.kind === 'quarter') date.setMonth(date.getMonth() + delta * 3, 1);
  if (period.kind === 'year') date.setFullYear(date.getFullYear() + delta, 0, 1);

  return {
    ...period,
    anchorDateKey: toLocalDateKey(date),
  };
}

export function getComparableReportPeriod(
  period: ReportPeriod,
): ReportPeriod | null {
  if (period.kind !== 'month' && period.kind !== 'year') return null;
  return shiftReportPeriod(period, -1);
}

function getPercentageChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function buildReportComparison(
  period: ReportPeriod,
  transactions: Transaction[],
  now = new Date(),
): ReportComparison | null {
  const current = summarizeReportTransactions(
    filterTransactionsByReportPeriod(transactions, period, now),
  );
  return buildReportComparisonFromCurrent(period, current, transactions, now);
}

function buildReportComparisonFromCurrent(
  period: ReportPeriod,
  current: ReportSummary,
  transactions: Transaction[],
  now: Date,
): ReportComparison | null {
  const previousPeriod = getComparableReportPeriod(period);
  if (!previousPeriod) return null;

  const previous = summarizeReportTransactions(
    filterTransactionsByReportPeriod(transactions, previousPeriod, now),
  );

  return {
    kind: period.kind === 'month' ? 'month' : 'year',
    current,
    previous,
    delta: {
      income: addMoney(current.income, -previous.income),
      expense: addMoney(current.expense, -previous.expense),
      net: addMoney(current.net, -previous.net),
    },
    percent: {
      income: getPercentageChange(current.income, previous.income),
      expense: getPercentageChange(current.expense, previous.expense),
      net: getPercentageChange(current.net, previous.net),
    },
  };
}

export function getReportBudgetData(
  period: ReportPeriod,
  budgets: Budget[],
  transactions: Transaction[],
  now = new Date(),
  scopedTransactions?: Transaction[],
): ReportBudgetData | null {
  if (period.kind !== 'month') return null;

  const bounds = getReportPeriodBounds(period, now);
  const month = bounds?.startDateKey.slice(0, 7);
  if (!month) return null;

  const monthBudgets = budgets.filter(budget => budget.month === month);
  if (monthBudgets.length === 0) return null;

  return {
    month,
    summary: calculateBudgetSummary(budgets, scopedTransactions || transactions, month),
    metrics: monthBudgets.map(budget => calculateBudgetMetrics(budget, scopedTransactions || transactions)),
  };
}

export function buildFinancialReport({
  transactions,
  categories,
  wallets,
  budgets = [],
  period,
  now = new Date(),
}: BuildFinancialReportInput): FinancialReport {
  const bounds = getReportPeriodBounds(period, now);
  const periodTransactions = filterTransactionsByReportPeriod(transactions, period, now);
  const timeline = bounds ? buildTimelineSkeleton(period, bounds) : [];
  const aggregation = aggregateReportTransactions(
    periodTransactions,
    createReportLookups(categories, wallets),
    timeline,
  );
  const anchor = getAnchorDate(period, now);

  return {
    period,
    bounds,
    transactions: periodTransactions,
    summary: aggregation.summary,
    incomeCategories: finalizeCategoryMap(aggregation.incomeCategories),
    expenseCategories: finalizeCategoryMap(aggregation.expenseCategories),
    wallets: finalizeWalletMap(aggregation.wallets),
    monthlyTrend: buildMonthlyTrend(transactions, anchor.getFullYear()),
    timeline,
    balanceTrend: buildReportBalanceTrend(transactions, wallets, period, now),
    comparison: buildReportComparisonFromCurrent(period, aggregation.summary, transactions, now),
    budget: getReportBudgetData(period, budgets, transactions, now, periodTransactions),
    periodTransactionCount: periodTransactions.length,
    hasReportableMovement: aggregation.summary.income > 0 || aggregation.summary.expense > 0,
  };
}

export function getReportMonthLabel(monthKey: string) {
  const date = parseLocalDateKey(`${monthKey}-01`);
  return date?.toLocaleDateString(undefined, { month: 'short' }) || monthKey;
}
