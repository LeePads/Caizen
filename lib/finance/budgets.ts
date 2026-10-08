import type { Budget, FinancialCategory, Transaction } from '../types';
import { parseLocalDateKey, toLocalDateKey } from '../date-utils';
import { addMoney, sumMoney, toFiniteMoney } from '../money';
import { getTransactionReportableAmounts } from '../transactions';

export type BudgetStatus = 'on-track' | 'over-budget';

export type BudgetMetrics = {
  budget: Budget;
  allocated: number;
  spent: number;
  remaining: number;
  overBy: number;
  progressPercent: number;
  displayProgressPercent: number;
  status: BudgetStatus;
};

export type BudgetSummary = {
  allocated: number;
  spent: number;
  remaining: number;
  overBy: number;
};

export type BudgetScopeValidationError =
  | 'invalid-month'
  | 'invalid-allocation'
  | 'missing-category'
  | 'income-category'
  | 'missing-subcategory'
  | 'duplicate'
  | 'overlapping-category-scope';

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const normalizeBudgetDate = (value: unknown, fallback: Date): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value);
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(fallback);
};

export function isBudgetMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_KEY_PATTERN.test(value);
}

export function getBudgetScopeKey(
  month: string,
  categoryId: string,
  subcategoryId?: string,
) {
  return `${month}:${categoryId}:${subcategoryId || ''}`;
}

export function normalizeBudget(
  value: unknown,
  categories: FinancialCategory[],
  fallbackId?: string,
  now = new Date(),
): Budget | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === 'string' && source.id.trim()
    ? source.id.trim()
    : fallbackId;
  const month = typeof source.month === 'string' ? source.month.trim() : '';
  const categoryId = typeof source.categoryId === 'string' ? source.categoryId.trim() : '';
  const subcategoryId = typeof source.subcategoryId === 'string'
    ? source.subcategoryId.trim()
    : '';
  const allocated = toFiniteMoney(source.allocated);
  const category = categories.find(item => item.id === categoryId);

  if (!id || !isBudgetMonth(month) || allocated <= 0 || !category || category.type !== 'expense') {
    return null;
  }
  if (subcategoryId && !(category.subcategories || []).some(item => item.id === subcategoryId)) {
    return null;
  }

  const createdAt = normalizeBudgetDate(source.createdAt, now);
  const updatedAt = normalizeBudgetDate(source.updatedAt, createdAt);
  return {
    id,
    month,
    categoryId,
    subcategoryId: subcategoryId || undefined,
    allocated,
    recurring: source.recurring === true,
    createdAt,
    updatedAt,
  };
}

export function normalizeBudgets(
  input: unknown,
  categories: FinancialCategory[],
  now = new Date(),
): Budget[] {
  const seenScopes = new Set<string>();
  return (Array.isArray(input) ? input : [])
    .map((value, index) => normalizeBudget(value, categories, `budget-${index}`, now))
    .filter((budget): budget is Budget => Boolean(budget))
    .filter(budget => {
      const scope = getBudgetScopeKey(budget.month, budget.categoryId, budget.subcategoryId);
      if (seenScopes.has(scope)) return false;
      seenScopes.add(scope);
      return true;
    });
}

function matchingCategory(
  budget: Pick<Budget, 'categoryId' | 'subcategoryId'>,
  transaction: Transaction,
) {
  if (transaction.categoryId !== budget.categoryId) return false;
  if (budget.subcategoryId && transaction.subcategoryId !== budget.subcategoryId) return false;
  return true;
}

export function budgetMatchesTransaction(
  budget: Pick<Budget, 'month' | 'categoryId' | 'subcategoryId'>,
  transaction: Transaction,
) {
  if (!isBudgetMonth(budget.month)) return false;
  if (toLocalDateKey(transaction.date).slice(0, 7) !== budget.month) return false;
  if (!matchingCategory(budget, transaction)) return false;
  return getTransactionReportableAmounts(transaction).expense > 0;
}

export function getBudgetTransactionAmount(transaction: Transaction): number {
  return getTransactionReportableAmounts(transaction).expense;
}

export function getBudgetSpent(budget: Budget, transactions: Transaction[]): number {
  return sumMoney(
    transactions
      .filter(transaction => budgetMatchesTransaction(budget, transaction))
      .map(getBudgetTransactionAmount),
  );
}

export function calculateBudgetMetrics(
  budget: Budget,
  transactions: Transaction[],
): BudgetMetrics {
  const allocated = toFiniteMoney(budget.allocated);
  const spent = getBudgetSpent(budget, transactions);
  const remaining = addMoney(allocated, -spent);
  const overBy = Math.max(0, -remaining);
  const progressPercent = allocated > 0 ? (spent / allocated) * 100 : 0;
  return {
    budget,
    allocated,
    spent,
    remaining,
    overBy,
    progressPercent,
    displayProgressPercent: Math.min(100, Math.max(0, progressPercent)),
    status: overBy > 0 ? 'over-budget' : 'on-track',
  };
}

export function calculateBudgetSummary(
  budgets: Budget[],
  transactions: Transaction[],
  month: string,
): BudgetSummary {
  const metrics = budgets
    .filter(budget => budget.month === month)
    .map(budget => calculateBudgetMetrics(budget, transactions));
  const allocated = sumMoney(metrics.map(item => item.allocated));
  const spent = sumMoney(metrics.map(item => item.spent));
  const remaining = addMoney(allocated, -spent);
  return {
    allocated,
    spent,
    remaining,
    overBy: Math.max(0, -remaining),
  };
}

export function getBudgetScopeValidationError(
  draft: Pick<Budget, 'month' | 'categoryId' | 'subcategoryId' | 'allocated'>,
  categories: FinancialCategory[],
  budgets: Budget[],
  editingBudgetId?: string,
): BudgetScopeValidationError | null {
  if (!isBudgetMonth(draft.month)) return 'invalid-month';
  if (toFiniteMoney(draft.allocated) <= 0) return 'invalid-allocation';

  const category = categories.find(item => item.id === draft.categoryId);
  if (!category) return 'missing-category';
  if (category.type !== 'expense') return 'income-category';

  const subcategoryId = draft.subcategoryId || undefined;
  if (subcategoryId && !(category.subcategories || []).some(item => item.id === subcategoryId)) {
    return 'missing-subcategory';
  }

  const sameMonthCategory = budgets.filter(budget =>
    budget.id !== editingBudgetId &&
    budget.month === draft.month &&
    budget.categoryId === draft.categoryId,
  );
  if (sameMonthCategory.some(budget => (budget.subcategoryId || undefined) === subcategoryId)) {
    return 'duplicate';
  }
  if (sameMonthCategory.some(budget => Boolean(budget.subcategoryId) !== Boolean(subcategoryId))) {
    return 'overlapping-category-scope';
  }
  return null;
}

export function shiftBudgetMonth(month: string, delta: number): string {
  const date = (isBudgetMonth(month)
    ? parseLocalDateKey(`${month}-01`)
    : null) || new Date();
  date.setMonth(date.getMonth() + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Carries a recurring budget's allocation forward into `month` by cloning the
 * most recent prior instance for each (category, subcategory) scope, when
 * that instance is still marked recurring and `month` has no row of its own
 * yet. Mirrors the existing recurring-transaction pattern of advancing one
 * occurrence at a time instead of eagerly backfilling every skipped month.
 */
export function materializeRecurringBudgetsForMonth(
  budgets: Budget[],
  month: string,
  now = new Date(),
  skippedScopes: ReadonlySet<string> = new Set(),
): Budget[] {
  if (!isBudgetMonth(month)) return budgets;

  const existingScopes = new Set(
    budgets
      .filter(budget => budget.month === month)
      .map(budget => getBudgetScopeKey(budget.month, budget.categoryId, budget.subcategoryId)),
  );

  const latestPriorByScope = new Map<string, Budget>();
  budgets.forEach(budget => {
    if (budget.month >= month) return;
    const scope = getBudgetScopeKey(month, budget.categoryId, budget.subcategoryId);
    const current = latestPriorByScope.get(scope);
    if (!current || budget.month > current.month) latestPriorByScope.set(scope, budget);
  });

  const additions: Budget[] = [];
  latestPriorByScope.forEach((source, scope) => {
    // A scope the user explicitly deleted for this exact month must not be
    // recreated here, even though an earlier month is still recurring.
    if (!source.recurring || existingScopes.has(scope) || skippedScopes.has(scope)) return;
    additions.push({
      id: `budget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      month,
      categoryId: source.categoryId,
      subcategoryId: source.subcategoryId,
      allocated: source.allocated,
      recurring: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  return additions.length ? [...budgets, ...additions] : budgets;
}
