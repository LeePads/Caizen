import { isValidLocalDateKey, parseLocalDateKey, parseLocalDateValue, toLocalDateKey } from './date-utils';
import { addMoney, toFiniteMoney } from './money';
import { createEntityId } from './utils';
import type {
  AdjustmentDirection,
  FinancialCategory,
  LinkedRecordModule,
  Transaction,
  TransactionLinkedRecord,
  TransactionType,
  Wallet,
} from './types';

type UnknownRecord = Record<string, unknown>;

const TRANSACTION_TYPES: TransactionType[] = [
  'income',
  'expense',
  'transfer',
  'adjustment',
];

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === 'object' ? value as UnknownRecord : {};

const textOrUndefined = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeDirection = (value: unknown): AdjustmentDirection | undefined =>
  value === 'increase' || value === 'decrease' ? value : undefined;

const LINKED_RECORD_MODULES: LinkedRecordModule[] = ['inventory', 'skincare', 'supplements', 'books', 'games'];

// normalizeTransaction rebuilds the record field-by-field rather than
// spreading the source, so an unrecognized/malformed linkedRecord must be
// explicitly handled here or it would be silently dropped on every save.
const normalizeLinkedRecord = (value: unknown): TransactionLinkedRecord | undefined => {
  const record = asRecord(value);
  const moduleValue = record.module;
  const recordId = textOrUndefined(record.recordId);
  if (!recordId || typeof moduleValue !== 'string' || !LINKED_RECORD_MODULES.includes(moduleValue as LinkedRecordModule)) {
    return undefined;
  }
  return { module: moduleValue as LinkedRecordModule, recordId };
};

export type TransactionListFilter = 'all' | 'income' | 'expense';

export type TransactionHistoryPeriod =
  | 'this-week'
  | 'this-month'
  | 'last-month'
  | 'this-year'
  | 'last-year'
  | 'all';

export type TransactionHistoryScope = 'day' | 'month' | 'year' | 'range' | 'all';

export type TransactionHistoryScopeRange = {
  startDateKey?: string;
  endDateKey?: string;
};

export type TransactionReportingStatus = 'all' | 'included' | 'excluded';

export type TransactionHistoryPeriodBounds = {
  startDateKey?: string;
  endDateKey?: string;
};

export type TransactionHistorySummary = {
  income: number;
  expense: number;
  net: number;
};

export type TransactionHistoryGroup = {
  dateKey: string;
  transactions: Transaction[];
  summary: TransactionHistorySummary;
};

export type TransactionHistoryPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
};

const normalizeTransactionType = (value: unknown): TransactionType =>
  typeof value === 'string' && TRANSACTION_TYPES.includes(value as TransactionType)
    ? value as TransactionType
    : 'expense';

export function normalizeTransaction(
  input: unknown,
  fallbackId = createEntityId('transaction'),
  now = new Date(),
): Transaction {
  const source = asRecord(input);
  const type = normalizeTransactionType(source.type);
  const date = parseLocalDateValue(
    source.date as Date | string | number | null | undefined,
  ) || new Date(now);
  const createdAt = parseLocalDateValue(
    source.createdAt as Date | string | number | null | undefined,
  ) || new Date(now);
  const updatedAt = parseLocalDateValue(
    source.updatedAt as Date | string | number | null | undefined,
  ) || undefined;
  const amount = Math.max(0, toFiniteMoney(source.amount));
  const fee = Math.max(0, toFiniteMoney(source.fee));
  const walletId = textOrUndefined(source.walletId) || '';
  const destinationWalletId = textOrUndefined(source.destinationWalletId);
  const adjustmentDirection = type === 'adjustment'
    ? normalizeDirection(source.adjustmentDirection) || 'increase'
    : undefined;

  return {
    id: textOrUndefined(source.id) || fallbackId,
    type,
    amount,
    walletId,
    destinationWalletId,
    fee: fee > 0 ? fee : undefined,
    adjustmentDirection,
    categoryId: textOrUndefined(source.categoryId),
    subcategoryId: textOrUndefined(source.subcategoryId),
    date,
    notes: textOrUndefined(source.notes),
    title: textOrUndefined(source.title),
    payee: textOrUndefined(source.payee),
    excludeFromReports:
      source.excludeFromReports === true ||
      type === 'adjustment' ||
      type === 'transfer',
    source: textOrUndefined(source.source),
    sourceKey: textOrUndefined(source.sourceKey),
    linkedRecord: normalizeLinkedRecord(source.linkedRecord),
    createdAt,
    updatedAt,
  };
}

export function normalizeTransactions(input: unknown): Transaction[] {
  if (!Array.isArray(input)) return [];
  return input.map((value, index) => {
    const source = asRecord(value);
    return normalizeTransaction(
      source,
      textOrUndefined(source.id) || `transaction-${index}`,
    );
  });
}

/**
 * Builds a recordId -> Transaction lookup for one linked-record module so a
 * section can resolve every card's reverse link in one pass instead of
 * scanning the full transaction list per card.
 */
export function buildLinkedRecordTransactionMap(
  transactions: Transaction[],
  module: LinkedRecordModule,
): Map<string, Transaction> {
  const map = new Map<string, Transaction>();
  for (const transaction of transactions) {
    if (transaction.linkedRecord?.module === module) {
      map.set(transaction.linkedRecord.recordId, transaction);
    }
  }
  return map;
}

/**
 * Removes only the current profile's transaction history. Wallet balances are
 * intentionally left untouched; this is a history reset, not a sequence of
 * reverse mutations.
 */
export function clearTransactionHistory<T extends { transactions: Transaction[] }>(profile: T): T {
  return { ...profile, transactions: [] };
}

export function transactionWalletDeltas(
  transaction: Transaction,
): Map<string, number> {
  const deltas = new Map<string, number>();
  const add = (walletId: string | undefined, amount: number) => {
    if (!walletId) return;
    deltas.set(walletId, addMoney(deltas.get(walletId) || 0, amount));
  };

  if (transaction.type === 'income') {
    add(transaction.walletId, transaction.amount);
  } else if (transaction.type === 'expense') {
    add(transaction.walletId, -transaction.amount);
  } else if (transaction.type === 'transfer') {
    add(transaction.walletId, -(transaction.amount + (transaction.fee || 0)));
    add(transaction.destinationWalletId, transaction.amount);
  } else {
    const signed = transaction.adjustmentDirection === 'decrease'
      ? -transaction.amount
      : transaction.amount;
    add(transaction.walletId, signed);
  }

  return deltas;
}

export function applyTransactionToWallets(
  wallets: Wallet[],
  transaction: Transaction,
  multiplier = 1,
): Wallet[] {
  return applyWalletDeltas(wallets, transactionWalletDeltas(transaction), multiplier);
}

export function aggregateTransactionWalletDeltas(
  transactions: Transaction[],
  multiplier = 1,
): Map<string, number> {
  const deltas = new Map<string, number>();
  transactions.forEach(transaction => {
    transactionWalletDeltas(transaction).forEach((delta, walletId) => {
      deltas.set(walletId, addMoney(deltas.get(walletId) || 0, delta * multiplier));
    });
  });
  return deltas;
}

export function applyWalletDeltas(
  wallets: Wallet[],
  deltas: ReadonlyMap<string, number>,
  multiplier = 1,
): Wallet[] {
  return wallets.map(wallet => {
    const delta = deltas.get(wallet.id);
    return delta === undefined
      ? wallet
      : { ...wallet, balance: addMoney(wallet.balance, delta * multiplier) };
  });
}

export function transactionValidationError(
  transaction: Transaction,
  wallets: Wallet[],
): string | null {
  if (!transaction.walletId) return 'Choose a wallet.';
  if (!wallets.some(wallet => wallet.id === transaction.walletId)) {
    return 'The selected wallet no longer exists.';
  }
  if (transaction.amount <= 0) return 'Enter an amount greater than zero.';
  if (transaction.type === 'transfer') {
    if (!transaction.destinationWalletId) return 'Choose a destination wallet.';
    if (transaction.destinationWalletId === transaction.walletId) {
      return 'Source and destination wallets must be different.';
    }
    if (!wallets.some(wallet => wallet.id === transaction.destinationWalletId)) {
      return 'The destination wallet no longer exists.';
    }
  }
  if (
    transaction.type === 'adjustment' &&
    !transaction.adjustmentDirection
  ) {
    return 'Choose whether the adjustment increases or decreases the balance.';
  }
  return null;
}

export function createAdjustmentTransaction(
  walletId: string,
  delta: number,
  details: Partial<Pick<Transaction, 'date' | 'notes' | 'source' | 'sourceKey'>> = {},
): Transaction {
  const amount = Math.abs(toFiniteMoney(delta));
  return normalizeTransaction({
    ...details,
    id: createEntityId('adjustment'),
    type: 'adjustment',
    walletId,
    amount,
    adjustmentDirection: delta < 0 ? 'decrease' : 'increase',
    excludeFromReports: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export function transactionDisplayKind(transaction: Transaction): 'income' | 'expense' | 'transfer' | 'adjustment' {
  return transaction.type;
}

function localNoon(date: Date) {
  const local = new Date(date);
  local.setHours(12, 0, 0, 0);
  return local;
}

function dateKeyFromLocalDate(date: Date) {
  return toLocalDateKey(localNoon(date));
}

export function getTransactionHistoryScopeBounds(
  scope: TransactionHistoryScope,
  anchorDateKey: string,
  range: TransactionHistoryScopeRange = {},
): TransactionHistoryPeriodBounds | null {
  if (scope === 'all') return {};
  if (scope === 'range') {
    if (!isValidLocalDateKey(range.startDateKey) || !isValidLocalDateKey(range.endDateKey)) return null;
    if (range.startDateKey > range.endDateKey) return null;
    return { startDateKey: range.startDateKey, endDateKey: range.endDateKey };
  }
  if (!isValidLocalDateKey(anchorDateKey)) return null;

  const anchor = parseLocalDateKey(anchorDateKey);
  if (!anchor) return null;
  if (scope === 'day') return { startDateKey: anchorDateKey, endDateKey: anchorDateKey };
  if (scope === 'month') {
    return {
      startDateKey: dateKeyFromLocalDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)),
      endDateKey: dateKeyFromLocalDate(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12)),
    };
  }
  return {
    startDateKey: dateKeyFromLocalDate(new Date(anchor.getFullYear(), 0, 1, 12)),
    endDateKey: dateKeyFromLocalDate(new Date(anchor.getFullYear(), 11, 31, 12)),
  };
}

export function filterTransactionsByHistoryScope(
  transactions: Transaction[],
  scope: TransactionHistoryScope,
  anchorDateKey: string,
  range: TransactionHistoryScopeRange = {},
): Transaction[] {
  const bounds = getTransactionHistoryScopeBounds(scope, anchorDateKey, range);
  if (!bounds?.startDateKey || !bounds.endDateKey) return scope === 'all' ? [...transactions] : [];
  return transactions.filter(transaction => {
    const dateKey = toLocalDateKey(transaction.date);
    return Boolean(dateKey && dateKey >= bounds.startDateKey! && dateKey <= bounds.endDateKey!);
  });
}

export function transactionMatchesReportingStatus(
  transaction: Transaction,
  status: TransactionReportingStatus,
) {
  if (status === 'all') return true;
  const excluded = transaction.excludeFromReports === true;
  return status === 'excluded' ? excluded : !excluded;
}

/**
 * Returns inclusive local-calendar bounds for the lightweight history picker.
 * Date-only transaction keys are compared as YYYY-MM-DD strings, so timezone
 * conversion cannot move a transaction into an adjacent period.
 */
export function getTransactionHistoryPeriodBounds(
  period: TransactionHistoryPeriod,
  now = new Date(),
): TransactionHistoryPeriodBounds {
  if (period === 'all') return {};

  const current = localNoon(now);
  if (period === 'this-week') {
    const start = new Date(current);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      startDateKey: dateKeyFromLocalDate(start),
      endDateKey: dateKeyFromLocalDate(end),
    };
  }

  if (period === 'this-month') {
    const start = new Date(current.getFullYear(), current.getMonth(), 1, 12);
    const end = new Date(current.getFullYear(), current.getMonth() + 1, 0, 12);
    return {
      startDateKey: dateKeyFromLocalDate(start),
      endDateKey: dateKeyFromLocalDate(end),
    };
  }

  if (period === 'this-year' || period === 'last-year') {
    const year = current.getFullYear() + (period === 'last-year' ? -1 : 0);
    return {
      startDateKey: dateKeyFromLocalDate(new Date(year, 0, 1, 12)),
      endDateKey: dateKeyFromLocalDate(new Date(year, 11, 31, 12)),
    };
  }

  const start = new Date(current.getFullYear(), current.getMonth() - 1, 1, 12);
  const end = new Date(current.getFullYear(), current.getMonth(), 0, 12);
  return {
    startDateKey: dateKeyFromLocalDate(start),
    endDateKey: dateKeyFromLocalDate(end),
  };
}

export function filterTransactionsByHistoryPeriod(
  transactions: Transaction[],
  period: TransactionHistoryPeriod,
  now = new Date(),
): Transaction[] {
  const { startDateKey, endDateKey } = getTransactionHistoryPeriodBounds(period, now);
  if (!startDateKey || !endDateKey) return [...transactions];

  return transactions.filter(transaction => {
    const dateKey = toLocalDateKey(transaction.date);
    return Boolean(dateKey && dateKey >= startDateKey && dateKey <= endDateKey);
  });
}

export function paginateTransactionHistory<T>(
  items: T[],
  requestedPage: number,
  requestedPageSize: number,
): TransactionHistoryPage<T> {
  const pageSize = Math.max(1, Math.floor(requestedPageSize) || 50);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.floor(requestedPage) || 1));
  const startIndex = totalItems === 0 ? 0 : (page - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return {
    items: pageItems,
    page,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex: startIndex + pageItems.length,
  };
}

/**
 * Historical wallet linking is deliberately separate from normal transaction
 * edits. It fills an empty reference without applying a wallet delta.
 */
export function connectUnlinkedTransactionWallet(
  transaction: Transaction,
  walletId: string,
  updatedAt = new Date(),
): Transaction | null {
  const nextWalletId = typeof walletId === 'string' ? walletId.trim() : '';
  const currentWalletId = typeof transaction.walletId === 'string' ? transaction.walletId.trim() : '';
  if (transaction.type === 'transfer' || currentWalletId || !nextWalletId) {
    return null;
  }

  return {
    ...transaction,
    walletId: nextWalletId,
    updatedAt,
  };
}

/**
 * A transfer's principal is a wallet-to-wallet movement, not income or
 * spending. Its optional fee remains a single reportable expense. Excluded
 * ordinary transactions remain visible to history but are omitted here.
 */
export function getTransactionReportableAmounts(
  transaction: Transaction,
): Pick<TransactionHistorySummary, 'income' | 'expense'> {
  if (transaction.type === 'transfer') {
    return { income: 0, expense: toFiniteMoney(transaction.fee || 0) };
  }

  if (transaction.excludeFromReports || transaction.type === 'adjustment') {
    return { income: 0, expense: 0 };
  }

  if (transaction.type === 'income') {
    return { income: toFiniteMoney(transaction.amount), expense: 0 };
  }

  return { income: 0, expense: toFiniteMoney(transaction.amount) };
}

export function summarizeTransactionHistory(
  transactions: Transaction[],
): TransactionHistorySummary {
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

function compareHistoryTransactions(left: Transaction, right: Transaction) {
  const dateDifference = right.date.getTime() - left.date.getTime();
  if (dateDifference) return dateDifference;

  const createdAtDifference = right.createdAt.getTime() - left.createdAt.getTime();
  if (createdAtDifference) return createdAtDifference;

  return right.id.localeCompare(left.id);
}

export function groupTransactionsByLocalDate(
  transactions: Transaction[],
): TransactionHistoryGroup[] {
  const groups = new Map<string, Transaction[]>();

  transactions.forEach(transaction => {
    const dateKey = toLocalDateKey(transaction.date);
    if (!dateKey) return;
    const current = groups.get(dateKey) || [];
    current.push(transaction);
    groups.set(dateKey, current);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([dateKey, groupTransactions]) => {
      const sortedTransactions = [...groupTransactions].sort(compareHistoryTransactions);
      return {
        dateKey,
        transactions: sortedTransactions,
        summary: summarizeTransactionHistory(sortedTransactions),
      };
    });
}

export function getTransactionCategoryLabel(
  transaction: Transaction,
  categories: FinancialCategory[],
): string {
  const category = categories.find(item => item.id === transaction.categoryId);
  if (!category) return 'Uncategorized';

  const subcategory = category.subcategories.find(
    item => item.id === transaction.subcategoryId,
  );
  return subcategory
    ? `${category.name} › ${subcategory.name}`
    : category.name;
}

export function getTransactionSignedAmount(transaction: Transaction): number | null {
  if (transaction.type === 'transfer') return null;
  if (transaction.type === 'income') return transaction.amount;
  if (transaction.type === 'adjustment') {
    return transaction.adjustmentDirection === 'decrease'
      ? -transaction.amount
      : transaction.amount;
  }
  return -transaction.amount;
}

export function transactionMatchesListFilter(
  transaction: Transaction,
  filter: TransactionListFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'income') {
    return transaction.type === 'income' ||
      (transaction.type === 'adjustment' && transaction.adjustmentDirection === 'increase');
  }
  return transaction.type === 'expense' ||
    (transaction.type === 'adjustment' && transaction.adjustmentDirection === 'decrease');
}
