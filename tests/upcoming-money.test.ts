import { describe, expect, it } from 'vitest';
import {
  applyUpcomingMoneyProgress,
  getUpcomingMoneyRemaining,
  getUpcomingMoneyStatus,
  normalizeUpcomingMoneyItem,
  summarizeUpcomingMoney,
} from '@/lib/upcoming-money';
import { formatLocalDateInput } from '@/lib/date-utils';
import type { UpcomingMoneyItem } from '@/lib/types';

const item = (overrides: Partial<UpcomingMoneyItem> = {}): UpcomingMoneyItem => ({
  id: 'money-1',
  title: 'Test item',
  direction: 'outgoing',
  amount: 5000,
  category: 'purchase',
  status: 'planned',
  recordedAmount: 0,
  reserveFunds: true,
  createdAt: new Date('2026-08-01T00:00:00'),
  updatedAt: new Date('2026-08-01T00:00:00'),
  ...overrides,
});

describe('upcoming money', () => {
  it('keeps expected incoming money out of conservative reserved funds', () => {
    const summary = summarizeUpcomingMoney([
      item(),
      item({ id: 'incoming', direction: 'incoming', amount: 4500, reserveFunds: false }),
    ]);

    expect(summary.reservedOutgoing).toBe(5000);
    expect(summary.incomingRemaining).toBe(4500);
  });

  it('supports partial payments and completion', () => {
    const partial = applyUpcomingMoneyProgress(item(), 2000);
    expect(getUpcomingMoneyRemaining(partial)).toBe(3000);
    expect(partial.status).toBe('partially-paid');

    const paid = applyUpcomingMoneyProgress(partial, 3000);
    expect(getUpcomingMoneyRemaining(paid)).toBe(0);
    expect(paid.status).toBe('paid');
  });

  it('derives overdue status without mutating the saved status', () => {
    const overdue = item({ dueDate: new Date('2026-07-01T00:00:00') });
    expect(getUpcomingMoneyStatus(overdue, new Date('2026-08-02T00:00:00'))).toBe('overdue');
    expect(overdue.status).toBe('planned');
  });

  it('keeps imported date-only due dates on their canonical local calendar day', () => {
    const normalized = normalizeUpcomingMoneyItem({
      id: 'date-only',
      title: 'Imported due date',
      direction: 'outgoing',
      dueDate: '2026-08-12' as unknown as Date,
    });

    expect(formatLocalDateInput(normalized.dueDate)).toBe('2026-08-12');
    expect(normalized.dueDate?.getHours()).toBe(12);
  });

  it('rounds decimal progress and summary totals deterministically', () => {
    const decimal = item({ amount: 0.3, recordedAmount: 0.1 });
    const next = applyUpcomingMoneyProgress(decimal, 0.2);

    expect(next.recordedAmount).toBe(0.3);
    expect(getUpcomingMoneyRemaining(next)).toBe(0);
    expect(summarizeUpcomingMoney([
      item({ id: 'a', amount: 0.1 }),
      item({ id: 'b', amount: 0.2 }),
    ]).outgoingRemaining).toBe(0.3);
  });
});
