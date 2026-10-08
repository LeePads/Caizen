import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DailyChecklistItem, ProductivityItem, UpcomingMoneyItem } from '@/lib/types';
import {
  clearUpcomingMoneyLinksFromRoutines,
  clearUpcomingMoneyLinksFromTasks,
  getLifeHubLinkedContextNavigationDetail,
  getUpcomingMoneyIdFromLifeHubRecord,
  normalizeLifeHubLinkedContext,
} from '@/lib/lifehub/linked-context';
import {
  balanceTargetStateLabel,
  isUpcomingMoneyEligibleForNewLink,
  resolveUpcomingMoneyTarget,
} from '@/lib/balance/lifehub-activity';

const balanceLink = {
  section: 'balance' as const,
  type: 'upcoming-money' as const,
  entityId: 'money-a',
};

function moneyItem(overrides: Partial<UpcomingMoneyItem> = {}): UpcomingMoneyItem {
  return {
    id: 'money-a',
    title: 'Electricity bill',
    direction: 'outgoing',
    amount: 100,
    category: 'other',
    status: 'planned',
    recordedAmount: 0,
    createdAt: new Date('2026-08-01T08:00:00'),
    updatedAt: new Date('2026-08-01T08:00:00'),
    ...overrides,
  };
}

function routine(overrides: Partial<DailyChecklistItem> = {}): DailyChecklistItem {
  return {
    id: 'routine-a',
    title: 'Pay bill',
    frequency: 'daily',
    active: true,
    createdAt: new Date('2026-08-01T08:00:00'),
    ...overrides,
  };
}

function task(overrides: Partial<ProductivityItem> = {}): ProductivityItem {
  return {
    id: 'task-a',
    title: 'Review bill',
    type: 'task',
    priority: 'normal',
    status: 'pending',
    createdAt: new Date('2026-08-01T08:00:00'),
    ...overrides,
  };
}

describe('Balance linked-context contract', () => {
  it('wires Balance through the shared selector, existing Life Hub cards, and deletion path', () => {
    const selector = readFileSync('components/common/LifeHubLinkedContextSelector.tsx', 'utf8');
    const lifeHub = readFileSync('components/sections/LifeHubSection.tsx', 'utf8');
    const context = readFileSync('lib/context.tsx', 'utf8');
    const panel = readFileSync('components/balance/UpcomingMoneyPanel.tsx', 'utf8');
    const balanceContext = readFileSync('components/balance/BalanceLifeHubContext.tsx', 'utf8');

    expect(selector).toContain("{ value: 'balance', label: 'Money' }");
    expect(selector).toContain('isUpcomingMoneyEligibleForNewLink(item)');
    expect(selector).toContain("type: 'upcoming-money', entityId: nextId");
    expect(selector).not.toContain('linkedBalanceId');
    expect(lifeHub).toContain('linkedBalance={');
    expect(lifeHub).toContain("navigateTo('balance', 'money-item', balanceId)");
    expect(context).toContain('clearUpcomingMoneyLinksFromRoutines');
    expect(context).toContain('clearUpcomingMoneyLinksFromTasks');
    expect(panel).toContain('<BalanceLifeHubContext item={item} />');
    expect(balanceContext).not.toContain('addTransaction');
    expect(balanceContext).not.toContain('updateUpcomingMoneyItem');
  });

  it('accepts the canonical Balance target without checking profile existence', () => {
    expect(normalizeLifeHubLinkedContext(balanceLink)).toEqual(balanceLink);
    expect(normalizeLifeHubLinkedContext({
      section: 'balance',
      type: 'money-item',
      entityId: 'money-a',
    })).toBeUndefined();
    expect(normalizeLifeHubLinkedContext({
      section: 'balance',
      type: 'upcoming-money',
      entityId: 'missing-after-delete',
    })).toEqual({
      section: 'balance',
      type: 'upcoming-money',
      entityId: 'missing-after-delete',
    });
    expect(normalizeLifeHubLinkedContext({
      section: 'balance',
      type: 'upcoming-money',
      entityId: '  ',
    })).toBeUndefined();
  });

  it('keeps active, partial, overdue, and zero-amount items eligible while excluding closed items', () => {
    const now = new Date('2026-08-27T15:00:00');
    expect(isUpcomingMoneyEligibleForNewLink(moneyItem())).toBe(true);
    expect(isUpcomingMoneyEligibleForNewLink(moneyItem({ amount: 0 }))).toBe(true);
    expect(isUpcomingMoneyEligibleForNewLink(moneyItem({ recordedAmount: 25, status: 'partially-paid' }))).toBe(true);
    expect(isUpcomingMoneyEligibleForNewLink(moneyItem({ dueDate: new Date('2026-08-20T00:00:00') }))).toBe(true);
    expect(isUpcomingMoneyEligibleForNewLink(moneyItem({ status: 'paid', recordedAmount: 100, archived: true }))).toBe(false);
    expect(isUpcomingMoneyEligibleForNewLink(moneyItem({ status: 'received', direction: 'incoming', recordedAmount: 100 }))).toBe(false);
    expect(isUpcomingMoneyEligibleForNewLink(moneyItem({ status: 'cancelled' }))).toBe(false);
    expect(isUpcomingMoneyEligibleForNewLink(moneyItem({ archived: true }))).toBe(false);

    expect(resolveUpcomingMoneyTarget('money-a', [moneyItem({ dueDate: new Date('2026-08-20T00:00:00') })], now)).toMatchObject({
      state: 'overdue',
      status: 'overdue',
    });
    const paid = resolveUpcomingMoneyTarget('money-a', [moneyItem({ status: 'paid', recordedAmount: 100, archived: true })], now);
    expect(paid).toMatchObject({ state: 'archived', status: 'paid' });
    expect(balanceTargetStateLabel(paid!)).toBe('Paid · Archived');
  });

  it('maps Balance navigation to the existing exact money-item request', () => {
    expect(getLifeHubLinkedContextNavigationDetail(balanceLink)).toEqual({
      section: 'balance',
      feature: 'money-item',
      recordId: 'money-a',
    });
  });

  it('clears only matching Balance links while preserving Life Hub records and unrelated links', () => {
    const linkedRoutine = routine({
      linkedContext: balanceLink,
      completionHistory: [{ date: '2026-08-27', status: 'done' }],
    });
    const unrelatedRoutine = routine({
      id: 'routine-b',
      linkedContext: { ...balanceLink, entityId: 'money-b' },
    });
    const linkedTask = task({ linkedContext: balanceLink });
    const unrelatedTask = task({ id: 'task-b', linkedContext: { ...balanceLink, entityId: 'money-b' } });

    const clearedRoutines = clearUpcomingMoneyLinksFromRoutines(
      [linkedRoutine, unrelatedRoutine],
      'money-a',
    );
    const clearedTasks = clearUpcomingMoneyLinksFromTasks(
      [linkedTask, unrelatedTask],
      'money-a',
    );

    expect(getUpcomingMoneyIdFromLifeHubRecord(linkedRoutine)).toBe('money-a');
    expect(clearedRoutines[0].linkedContext).toBeUndefined();
    expect(clearedRoutines[0].completionHistory).toEqual(linkedRoutine.completionHistory);
    expect(clearedRoutines[1].linkedContext).toEqual(unrelatedRoutine.linkedContext);
    expect(clearedTasks[0].linkedContext).toBeUndefined();
    expect(clearedTasks[1].linkedContext).toEqual(unrelatedTask.linkedContext);
  });
});
