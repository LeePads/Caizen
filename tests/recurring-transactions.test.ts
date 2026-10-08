import { describe, expect, it } from 'vitest';

import {
  clearRecurringProjectionReferences,
  getTreasuryTotals,
  normalizeBalanceProjectionRow,
} from '@/lib/balance';
import {
  advanceRecurringProjectionRow,
  getNextRecurringDate,
  getRecurringOccurrenceState,
  getRecurringOccurrencesBetween,
  getRecurringForecastAmount,
  normalizeBalanceProjectionRecurrence,
  resumeRecurringProjectionRow,
} from '@/lib/finance/recurring-transactions';
import type { BalanceProjectionRow, Wallet } from '@/lib/types';

const recurrence = (overrides: Partial<NonNullable<BalanceProjectionRow['recurrence']>> = {}) => ({
  frequency: 'monthly' as const,
  startDateKey: '2026-01-31',
  nextDueDateKey: '2026-01-31',
  walletId: 'cash',
  ...overrides,
});

const row = (overrides: Partial<BalanceProjectionRow> = {}): BalanceProjectionRow => ({
  id: 'recurring-1',
  label: 'Rent',
  amount: '100',
  allocated: '',
  type: 'expense',
  active: true,
  recurrence: recurrence(),
  ...overrides,
});

const wallets: Wallet[] = [{
  id: 'cash',
  name: 'Cash',
  balance: 1000,
  color: '#000',
  type: 'cash_on_hand',
  createdAt: new Date('2026-01-01'),
}];

describe('recurring transaction scheduling', () => {
  it('keeps weekly occurrences on the same local weekday', () => {
    const weekly = recurrence({
      frequency: 'weekly',
      startDateKey: '2026-08-03',
      nextDueDateKey: '2026-08-03',
    });
    expect(getNextRecurringDate(weekly)).toBe('2026-08-10');
    expect(getRecurringOccurrencesBetween(weekly, '2026-08-01', '2026-08-31')).toEqual([
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
    ]);
  });

  it('clamps monthly schedules to month end without losing the anchor day', () => {
    expect(getNextRecurringDate(recurrence())).toBe('2026-02-28');
    expect(getNextRecurringDate(recurrence(), '2026-02-28')).toBe('2026-03-31');
    expect(getNextRecurringDate(recurrence({ startDateKey: '2026-04-30', nextDueDateKey: '2026-04-30' }))).toBe('2026-05-30');
  });

  it('restores February 29 in leap years for yearly schedules', () => {
    const yearly = recurrence({
      frequency: 'yearly',
      startDateKey: '2024-02-29',
      nextDueDateKey: '2024-02-29',
    });
    expect(getNextRecurringDate(yearly)).toBe('2025-02-28');
    expect(getNextRecurringDate(yearly, '2025-02-28')).toBe('2026-02-28');
    expect(getNextRecurringDate(yearly, '2027-02-28')).toBe('2028-02-29');
    expect(getNextRecurringDate(yearly, '2028-02-28')).toBe('2029-02-28');
  });

  it('derives occurrence states and resumes after missed paused dates', () => {
    expect(getRecurringOccurrenceState(row(), '2026-01-30')).toBe('upcoming');
    expect(getRecurringOccurrenceState(row(), '2026-01-31')).toBe('due-today');
    expect(getRecurringOccurrenceState(row(), '2026-02-01')).toBe('overdue');
    expect(getRecurringOccurrenceState({ ...row(), active: false }, '2026-01-31')).toBe('paused');
    expect(resumeRecurringProjectionRow({
      ...row(),
      active: false,
      recurrence: recurrence({ nextDueDateKey: '2026-01-31' }),
    }, '2026-02-01').recurrence?.nextDueDateKey).toBe('2026-02-28');
  });

  it('advances one occurrence without creating a transaction history', () => {
    const next = advanceRecurringProjectionRow(row());
    expect(next.recurrence?.nextDueDateKey).toBe('2026-02-28');
    expect(next.id).toBe(row().id);
  });

  it('derives forecast amounts from pending occurrences only', () => {
    const weekly = row({
      amount: '0.10',
      recurrence: recurrence({
        frequency: 'weekly',
        startDateKey: '2026-08-03',
        nextDueDateKey: '2026-08-03',
      }),
    });
    expect(getRecurringForecastAmount(weekly, '2026-08')).toBe(0.5);
    expect(getTreasuryTotals(wallets, [weekly], false, '2026-08')).toMatchObject({
      remainingExpenses: 0.5,
      safeToSpend: 999.5,
    });
  });
});

describe('recurring compatibility and reference safety', () => {
  it('strips malformed recurrence metadata while preserving the forecast row', () => {
    const normalized = normalizeBalanceProjectionRow({
      id: 'legacy-row',
      label: 'Legacy forecast',
      amount: '100',
      allocated: '',
      type: 'expense',
      recurrence: {
        frequency: 'daily',
        startDateKey: '2026-08-01',
        nextDueDateKey: '2026-08-01',
        walletId: '',
      },
    }, 'fallback');
    expect(normalized.id).toBe('legacy-row');
    expect(normalized.recurrence).toBeUndefined();
    expect(normalizeBalanceProjectionRecurrence({
      frequency: 'monthly',
      startDateKey: '2026-08-31',
      endDateKey: '2026-08-01',
      nextDueDateKey: '2026-08-31',
      walletId: 'cash',
    })).toBeUndefined();
  });

  it('clears deleted category references without changing the recurring row identity', () => {
    const result = clearRecurringProjectionReferences(
      [row({ recurrence: recurrence({ categoryId: 'food', subcategoryId: 'dining' }) })],
      'food',
      ['dining'],
      true,
    );
    expect(result.affectedRecurringCount).toBe(1);
    expect(result.projectionRows[0]).toMatchObject({
      id: 'recurring-1',
      amount: '100',
      recurrence: { walletId: 'cash' },
    });
    expect(result.projectionRows[0].recurrence?.categoryId).toBeUndefined();
  });

  it('clears only a deleted subcategory reference', () => {
    const result = clearRecurringProjectionReferences(
      [row({ recurrence: recurrence({ categoryId: 'food', subcategoryId: 'dining' }) })],
      'food',
      ['dining'],
      false,
    );
    expect(result.projectionRows[0].recurrence).toMatchObject({
      categoryId: 'food',
      walletId: 'cash',
    });
    expect(result.projectionRows[0].recurrence?.subcategoryId).toBeUndefined();
  });
});
