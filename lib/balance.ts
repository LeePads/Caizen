import type {
  BalanceCheckIn,
  BalanceProjectionRow,
  Budget,
  FinancialCategory,
  FinancialKind,
  Transaction,
  UpcomingMoneyDirection,
  UpcomingMoneyItem,
  Wallet,
  WalletType,
} from './types';
import { summarizeUpcomingMoney } from './upcoming-money';
import { addMoney, sumMoney, toFiniteMoney } from './money';
import { parseLocalDateValue, toLocalDateKey } from './date-utils';
import { getRecurringForecastAmount, normalizeBalanceProjectionRecurrence } from './finance/recurring-transactions';
import { normalizeFinancialIconId } from './finance/category-icons';

export type FinancialCategoryMutationResult = {
  categories: FinancialCategory[];
  transactions: Transaction[];
  budgets: Budget[];
  projectionRows?: BalanceProjectionRow[];
  affectedTransactionCount: number;
  affectedBudgetCount: number;
  affectedRecurringCount?: number;
};

/**
 * Validate the raw values entered in the balance check-in form. Blank and
 * non-finite values are errors rather than zeroes so a reconciliation can
 * never silently overwrite a wallet with an unintended amount.
 * Negative balances remain valid because the balance model supports them.
 */
export function getBalanceCheckInInputErrors(
  wallets: Pick<Wallet, 'id'>[],
  values: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    wallets.flatMap(wallet => {
      const raw = values[wallet.id];
      if (raw === undefined || raw.trim() === '') {
        return [[wallet.id, 'Enter a current balance.']];
      }
      const parsed = Number(raw);
      return Number.isFinite(parsed)
        ? []
        : [[wallet.id, 'Enter a valid number.']];
    }),
  );
}

export function walletBalancesMatchOpening(
  wallets: Pick<Wallet, 'id' | 'balance'>[],
  openingBalances: Record<string, number>,
): boolean {
  const walletIds = wallets.map(wallet => wallet.id).sort();
  const openingIds = Object.keys(openingBalances).sort();
  if (walletIds.length !== openingIds.length || walletIds.some((id, index) => id !== openingIds[index])) {
    return false;
  }

  return wallets.every(wallet => {
    const openingBalance = openingBalances[wallet.id];
    const currentBalance = Number(wallet.balance);
    return Number.isFinite(openingBalance) && Number.isFinite(currentBalance) && currentBalance === openingBalance;
  });
}

const comparableFinancialName = (value: string) => value.trim().toLocaleLowerCase();

export function isReservedFinancialFallbackName(value: string) {
  return comparableFinancialName(value) === 'uncategorized';
}

const normalizedFinancialName = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export type FinancialCategoryNormalizationResult = {
  categories: FinancialCategory[];
  transactions: Transaction[];
};

/**
 * Cleans malformed profile taxonomy without changing any transaction money
 * fields. Invalid references are cleared rather than converted into a new
 * persisted category.
 */
export function normalizeFinancialCategoriesAndReferences(
  input: unknown,
  transactions: Transaction[],
  fallbackIdForIndex: (index: number) => string,
): FinancialCategoryNormalizationResult {
  const rawCategories = Array.isArray(input) ? input : [];
  const removedCategoryIds = new Set<string>();
  const removedSubcategoryIds = new Set<string>();
  const categories: FinancialCategory[] = [];

  rawCategories.forEach((item, index) => {
    const source = item && typeof item === 'object'
      ? item as Record<string, unknown>
      : {};
    const name = normalizedFinancialName(source.name);
    const sourceId = typeof source.id === 'string' && source.id.trim()
      ? source.id
      : undefined;

    if (!name) {
      if (sourceId) removedCategoryIds.add(sourceId);
      const subcategories = Array.isArray(source.subcategories)
        ? source.subcategories
        : [];
      subcategories.forEach(subcategory => {
        if (subcategory && typeof subcategory === 'object') {
          const id = (subcategory as Record<string, unknown>).id;
          if (typeof id === 'string' && id.trim()) removedSubcategoryIds.add(id);
        }
      });
      return;
    }

    const rawSubcategories = Array.isArray(source.subcategories)
      ? source.subcategories
      : [];
    const validSubcategories = rawSubcategories.filter(subcategory => {
      const subcategoryName = subcategory && typeof subcategory === 'object'
        ? normalizedFinancialName((subcategory as Record<string, unknown>).name)
        : undefined;
      if (subcategoryName) return true;
      if (subcategory && typeof subcategory === 'object') {
        const id = (subcategory as Record<string, unknown>).id;
        if (typeof id === 'string' && id.trim()) removedSubcategoryIds.add(id);
      }
      return false;
    });

    categories.push(normalizeFinancialCategory({
      ...source,
      name,
      subcategories: validSubcategories.map(subcategory => ({
        ...(subcategory as Record<string, unknown>),
        name: normalizedFinancialName((subcategory as Record<string, unknown>).name),
      })),
    }, sourceId || fallbackIdForIndex(index)));
  });

  return {
    categories,
    transactions: transactions.map(transaction => {
      if (transaction.categoryId && removedCategoryIds.has(transaction.categoryId)) {
        return { ...transaction, categoryId: undefined, subcategoryId: undefined };
      }
      if (transaction.subcategoryId && removedSubcategoryIds.has(transaction.subcategoryId)) {
        return { ...transaction, subcategoryId: undefined };
      }
      return transaction;
    }),
  };
}

export function hasDuplicateFinancialCategoryName(
  categories: FinancialCategory[],
  type: FinancialCategory['type'],
  name: string,
  excludedCategoryId?: string,
) {
  const comparableName = comparableFinancialName(name);
  if (!comparableName) return false;
  return categories.some(category =>
    category.id !== excludedCategoryId &&
    category.type === type &&
    comparableFinancialName(category.name) === comparableName,
  );
}

export function hasDuplicateFinancialSubcategoryName(
  category: FinancialCategory,
  name: string,
  excludedSubcategoryId?: string,
) {
  const comparableName = comparableFinancialName(name);
  if (!comparableName) return false;
  return (category.subcategories || []).some(subcategory =>
    subcategory.id !== excludedSubcategoryId &&
    comparableFinancialName(subcategory.name) === comparableName,
  );
}

export function renameFinancialCategory(
  categories: FinancialCategory[],
  transactions: Transaction[],
  categoryId: string,
  name: string,
  budgets: Budget[] = [],
): FinancialCategoryMutationResult {
  return {
    categories: categories.map(category =>
      category.id === categoryId ? { ...category, name: name.trim() } : category,
    ),
    transactions,
    budgets,
    affectedTransactionCount: 0,
    affectedBudgetCount: 0,
  };
}

export function renameFinancialSubcategory(
  categories: FinancialCategory[],
  transactions: Transaction[],
  categoryId: string,
  subcategoryId: string,
  name: string,
  budgets: Budget[] = [],
): FinancialCategoryMutationResult {
  return {
    categories: categories.map(category =>
      category.id !== categoryId
        ? category
        : {
            ...category,
            subcategories: (category.subcategories || []).map(subcategory =>
              subcategory.id === subcategoryId
                ? { ...subcategory, name: name.trim() }
                : subcategory,
            ),
          },
    ),
    transactions,
    budgets,
    affectedTransactionCount: 0,
    affectedBudgetCount: 0,
  };
}

export function deleteFinancialCategory(
  categories: FinancialCategory[],
  transactions: Transaction[],
  categoryId: string,
  budgets: Budget[] = [],
): FinancialCategoryMutationResult {
  const category = categories.find(item => item.id === categoryId);
  if (!category) {
    return {
      categories,
      transactions,
      budgets,
      affectedTransactionCount: 0,
      affectedBudgetCount: 0,
    };
  }

  const subcategoryIds = new Set((category.subcategories || []).map(item => item.id));
  const affectsTransaction = (transaction: Transaction) =>
    transaction.categoryId === categoryId ||
    (transaction.subcategoryId ? subcategoryIds.has(transaction.subcategoryId) : false);
  const affectedTransactionCount = transactions.filter(affectsTransaction).length;
  const affectedBudgetCount = budgets.filter(budget =>
    budget.categoryId === categoryId ||
    (budget.subcategoryId ? subcategoryIds.has(budget.subcategoryId) : false),
  ).length;
  const nextTransactions = affectedTransactionCount === 0
    ? transactions
    : transactions.map(transaction =>
        affectsTransaction(transaction)
          ? {
              ...transaction,
              categoryId: undefined,
              subcategoryId: undefined,
              updatedAt: new Date(),
            }
          : transaction,
      );

  return {
    categories: categories.filter(item => item.id !== categoryId),
    transactions: nextTransactions,
    budgets: budgets.filter(budget =>
      budget.categoryId !== categoryId &&
      !(budget.subcategoryId ? subcategoryIds.has(budget.subcategoryId) : false),
    ),
    affectedTransactionCount,
    affectedBudgetCount,
  };
}

export function deleteFinancialSubcategory(
  categories: FinancialCategory[],
  transactions: Transaction[],
  categoryId: string,
  subcategoryId: string,
  budgets: Budget[] = [],
): FinancialCategoryMutationResult {
  const category = categories.find(item => item.id === categoryId);
  if (!category) {
    return {
      categories,
      transactions,
      budgets,
      affectedTransactionCount: 0,
      affectedBudgetCount: 0,
    };
  }

  const affectedTransactionCount = transactions.filter(transaction =>
    transaction.subcategoryId === subcategoryId,
  ).length;
  const affectedBudgetCount = budgets.filter(budget =>
    budget.categoryId === categoryId && budget.subcategoryId === subcategoryId,
  ).length;
  const nextTransactions = affectedTransactionCount === 0
    ? transactions
    : transactions.map(transaction =>
        transaction.subcategoryId === subcategoryId
          ? { ...transaction, subcategoryId: undefined, updatedAt: new Date() }
          : transaction,
      );

  return {
    categories: categories.map(item =>
      item.id === categoryId
        ? {
            ...item,
            subcategories: (item.subcategories || []).filter(
              subcategory => subcategory.id !== subcategoryId,
            ),
          }
        : item,
    ),
    transactions: nextTransactions,
    budgets: budgets.filter(budget => !(
      budget.categoryId === categoryId && budget.subcategoryId === subcategoryId
    )),
    affectedTransactionCount,
    affectedBudgetCount,
  };
}

export function clearRecurringProjectionReferences(
  projectionRows: BalanceProjectionRow[],
  categoryId: string,
  subcategoryIds: string[] = [],
  removeCategory = false,
) {
  const subcategorySet = new Set(subcategoryIds);
  let affectedRecurringCount = 0;
  const nextProjectionRows = projectionRows.map(row => {
    const recurrence = row.recurrence;
    if (!recurrence) return row;
    const affected = removeCategory
      ? recurrence.categoryId === categoryId || Boolean(recurrence.subcategoryId && subcategorySet.has(recurrence.subcategoryId))
      : recurrence.categoryId === categoryId && Boolean(recurrence.subcategoryId && subcategorySet.has(recurrence.subcategoryId));
    if (!affected) return row;
    affectedRecurringCount += 1;
    return {
      ...row,
      updatedAt: new Date(),
      recurrence: {
        ...recurrence,
        ...(removeCategory ? { categoryId: undefined, subcategoryId: undefined } : { subcategoryId: undefined }),
      },
    };
  });

  return { projectionRows: nextProjectionRows, affectedRecurringCount };
}

export function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getWeekKey(date = new Date()) {
  const local = new Date(date);
  local.setHours(0, 0, 0, 0);
  local.setDate(local.getDate() - ((local.getDay() + 6) % 7));
  return [
    local.getFullYear(),
    String(local.getMonth() + 1).padStart(2, '0'),
    String(local.getDate()).padStart(2, '0'),
  ].join('-');
}

export const toNumber = (value: unknown) => toFiniteMoney(value);

export const normalizeWalletType = (value: unknown): WalletType =>
  value === 'cash_on_hand' ||
  value === 'free_spending' ||
  value === 'savings' ||
  value === 'investment'
    ? value
    : 'free_spending';

const normalizeMoneyString = (value: unknown) => String(Math.max(0, toNumber(value)));

const isMonthKey = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-(\d{2})$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
};

const isDateKey = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Boolean(toLocalDateKey(value));

const hasFiniteValue = (value: unknown) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

const validKind = (value: unknown): FinancialKind | undefined =>
  value === 'good' || value === 'leak' || value === 'neutral' ? value : undefined;

export function normalizeBalanceProjectionRow(
  input: unknown,
  fallbackId: string,
): BalanceProjectionRow {
  const source = input && typeof input === 'object'
    ? input as Record<string, unknown>
    : {};
  const amount = Math.max(0, toNumber(source.amount));
  const hasAllocated = source.allocated !== undefined && source.allocated !== '';
  const allocated = Math.min(amount, Math.max(0, toNumber(source.allocated)));
  const dueDay = toNumber(source.dueDay);
  const recurrence = normalizeBalanceProjectionRecurrence(source.recurrence);
  const createdAt = parseLocalDateValue(
    source.createdAt as Date | string | number | null | undefined,
  );
  const updatedAt = parseLocalDateValue(
    source.updatedAt as Date | string | number | null | undefined,
  );
  const normalizedSource = { ...source };
  delete normalizedSource.recurrence;
  delete normalizedSource.createdAt;
  delete normalizedSource.updatedAt;

  return {
    ...normalizedSource,
    id: typeof source.id === 'string' && source.id ? source.id : fallbackId,
    label: typeof source.label === 'string' ? source.label : '',
    amount: normalizeMoneyString(amount),
    allocated: hasAllocated ? normalizeMoneyString(allocated) : '',
    type: source.type === 'income' ? 'income' : 'expense',
    dueDay: dueDay > 0 ? Math.max(1, Math.min(31, Math.floor(dueDay))) : undefined,
    active: source.active !== false,
    cycleKey: isMonthKey(source.cycleKey) ? source.cycleKey : undefined,
    ...(recurrence ? { recurrence } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  } as BalanceProjectionRow;
}

export function normalizeFinancialCategory(
  input: unknown,
  fallbackId: string,
): FinancialCategory {
  const source = input && typeof input === 'object'
    ? input as Record<string, unknown>
    : {};
  const rawSubcategories = Array.isArray(source.subcategories)
    ? source.subcategories
    : [];

  return {
    ...source,
    id: typeof source.id === 'string' && source.id ? source.id : fallbackId,
    type: source.type === 'income' ? 'income' : 'expense',
    name: typeof source.name === 'string' ? source.name.trim() || 'Other' : 'Other',
    ...(normalizeFinancialIconId(source.icon)
      ? { icon: normalizeFinancialIconId(source.icon) }
      : {}),
    total: normalizeMoneyString(source.total),
    kind: validKind(source.kind) || 'neutral',
    subcategories: rawSubcategories.map((item, index) => {
      const subcategory = item && typeof item === 'object'
        ? item as Record<string, unknown>
        : {};
      return {
        ...subcategory,
        id:
          typeof subcategory.id === 'string' && subcategory.id
            ? subcategory.id
            : `${fallbackId}-subcategory-${index}`,
        name: typeof subcategory.name === 'string' ? subcategory.name.trim() || 'Other' : 'Other',
        ...(normalizeFinancialIconId(subcategory.icon)
          ? { icon: normalizeFinancialIconId(subcategory.icon) }
          : {}),
        total: normalizeMoneyString(subcategory.total),
        kind: validKind(subcategory.kind),
      };
    }),
  } as FinancialCategory;
}

export function normalizeBalanceCheckIn(
  input: unknown,
  fallbackId: string,
): BalanceCheckIn {
  const source = input && typeof input === 'object'
    ? input as Record<string, unknown>
    : {};
  const completedAt = parseLocalDateValue(
    source.completedAt instanceof Date ||
      typeof source.completedAt === 'string' ||
      typeof source.completedAt === 'number'
      ? source.completedAt
      : null,
  ) || new Date();
  const walletBalances = (Array.isArray(source.walletBalances)
    ? source.walletBalances
    : []
  ).map((item, index) => {
    const snapshot = item && typeof item === 'object'
      ? item as Record<string, unknown>
      : {};
    return {
      ...snapshot,
      walletId:
        typeof snapshot.walletId === 'string' && snapshot.walletId
          ? snapshot.walletId
          : `${fallbackId}-wallet-${index}`,
      name: typeof snapshot.name === 'string' && snapshot.name ? snapshot.name : 'Wallet',
      balance: toNumber(snapshot.balance),
    };
  });
  const snapshotTotal = sumMoney(walletBalances.map(item => item.balance));
  const totalWalletBalance = hasFiniteValue(source.totalWalletBalance)
    ? toNumber(source.totalWalletBalance)
    : snapshotTotal;
  const spendableBalance = toNumber(source.spendableBalance);
  const protectedBalance = toNumber(source.protectedBalance);
  const remainingCommitments = Math.max(0, toNumber(source.remainingCommitments));
  const safeToSpend = hasFiniteValue(source.safeToSpend)
    ? toNumber(source.safeToSpend)
    : addMoney(spendableBalance, -remainingCommitments);

  return {
    ...source,
    id: typeof source.id === 'string' && source.id ? source.id : fallbackId,
    weekKey: isDateKey(source.weekKey) ? source.weekKey : getWeekKey(completedAt),
    completedAt,
    walletBalances,
    totalWalletBalance,
    spendableBalance,
    protectedBalance,
    remainingCommitments,
    safeToSpend,
  } as BalanceCheckIn;
}

export type UpcomingMoneyPanelRequest = {
  signal: number;
  requestedItemId?: string;
  requestedDirection?: UpcomingMoneyDirection;
};

export function resolveUpcomingMoneyRequest(
  items: UpcomingMoneyItem[],
  request: UpcomingMoneyPanelRequest,
  consumedSignal: number,
) {
  if (!request.signal || request.signal <= consumedSignal) return null;
  if (request.requestedItemId) {
    const item = items.find(candidate => candidate.id === request.requestedItemId);
    return item ? { signal: request.signal, item } : null;
  }
  if (request.requestedDirection) {
    return { signal: request.signal, direction: request.requestedDirection };
  }
  return null;
}

export function getCurrentAllocation(
  row: BalanceProjectionRow,
  monthKey = getMonthKey(),
) {
  if (!row.cycleKey || row.cycleKey === monthKey) {
    return Math.max(0, toNumber(row.allocated));
  }
  return 0;
}

export function getRemainingAmount(
  row: BalanceProjectionRow,
  monthKey = getMonthKey(),
) {
  if (row.active === false) return 0;
  if (row.recurrence) return getRecurringForecastAmount(row, monthKey);
  return Math.max(
    0,
    toNumber(row.amount) - getCurrentAllocation(row, monthKey),
  );
}

export function getTreasuryTotals(
  wallets: Wallet[],
  rows: BalanceProjectionRow[],
  includeAllWallets = false,
  monthKey = getMonthKey(),
) {
  const totalWalletBalance = sumMoney(wallets.map(wallet => wallet.balance));
  const spendableBalance = wallets
    .filter(
      wallet =>
        wallet.includeInSpendable ??
        ['cash_on_hand', 'free_spending'].includes(
          wallet.type || 'free_spending',
        ),
    )
    .reduce((sum, wallet) => addMoney(sum, wallet.balance), 0);
  const protectedBalance = wallets
    .filter(
      wallet =>
        wallet.isProtected ??
        ['savings', 'investment'].includes(wallet.type || 'free_spending'),
    )
    .reduce((sum, wallet) => addMoney(sum, wallet.balance), 0);
  const plannerBase = includeAllWallets
    ? totalWalletBalance
    : spendableBalance;
  const remainingIncome = rows
    .filter(row => row.type === 'income')
    .reduce((sum, row) => addMoney(sum, getRemainingAmount(row, monthKey)), 0);
  const remainingExpenses = rows
    .filter(row => row.type === 'expense')
    .reduce((sum, row) => addMoney(sum, getRemainingAmount(row, monthKey)), 0);

  return {
    totalWalletBalance,
    spendableBalance,
    protectedBalance,
    plannerBase,
    remainingIncome,
    remainingExpenses,
    projectedBudget: addMoney(addMoney(plannerBase, remainingIncome), -remainingExpenses),
    safeToSpend: addMoney(spendableBalance, -remainingExpenses),
  };
}

export function getUnifiedPlanTotals(
  wallets: Wallet[],
  rows: BalanceProjectionRow[],
  upcomingMoneyItems: UpcomingMoneyItem[],
  monthKey = getMonthKey(),
) {
  const treasury = getTreasuryTotals(wallets, rows, false, monthKey);
  const oneTime = summarizeUpcomingMoney(upcomingMoneyItems);
  const stillToPay = treasury.remainingExpenses + oneTime.reservedOutgoing;
  const expectedLater = treasury.remainingIncome + oneTime.incomingRemaining;
  const availableAfterPlans = addMoney(treasury.spendableBalance, -stillToPay);
  const projectedAfterIncoming = addMoney(availableAfterPlans, expectedLater);
  const purchaseWalletBalance = sumMoney(
    wallets
      .filter(wallet => wallet.useForWishlist ?? ['cash_on_hand', 'free_spending'].includes(wallet.type || 'free_spending'))
      .map(wallet => wallet.balance),
  );
  // Purchase eligibility is independent of spendable/protected wallet flags.
  // Keep existing payment commitments reserved and expected income excluded.
  const availableForPurchases = addMoney(purchaseWalletBalance, -stillToPay);

  return {
    ...treasury,
    oneTime,
    availableNow: treasury.spendableBalance,
    recurringStillToPay: treasury.remainingExpenses,
    oneTimeStillToPay: oneTime.reservedOutgoing,
    stillToPay,
    recurringExpectedLater: treasury.remainingIncome,
    oneTimeExpectedLater: oneTime.incomingRemaining,
    expectedLater,
    availableAfterPlans,
    projectedAfterIncoming,
    purchaseWalletBalance,
    availableForPurchases,
  };
}

export function getCheckInStreak(
  checkIns: BalanceCheckIn[],
  now = new Date(),
) {
  const weekKeys = new Set(checkIns.map(item => item.weekKey));
  const cursor = new Date(`${getWeekKey(now)}T00:00:00`);
  if (!weekKeys.has(getWeekKey(cursor))) cursor.setDate(cursor.getDate() - 7);
  let streak = 0;
  while (weekKeys.has(getWeekKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

export function upsertCheckIn(
  checkIns: BalanceCheckIn[],
  next: BalanceCheckIn,
) {
  return [next, ...checkIns.filter(item => item.weekKey !== next.weekKey)]
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey))
    .slice(0, 104);
}
