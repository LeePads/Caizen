import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

import { buildFinancialExportDocument, buildXlsxReport } from '@/lib/finance/exports';
import { buildFinancialReport, buildReportBalanceTrend } from '@/lib/finance/reports';
import type { FinancialCategory, Transaction, Wallet } from '@/lib/types';

const wallets: Wallet[] = [
  { id: 'cash', name: 'Cash', balance: 775, color: '#000', type: 'cash_on_hand', createdAt: new Date('2026-01-01') },
  { id: 'savings', name: 'Savings', balance: 800, color: '#111', type: 'savings', createdAt: new Date('2026-01-01') },
];

const categories: FinancialCategory[] = [
  { id: 'salary', type: 'income', name: 'Salary', total: '0', kind: 'neutral', subcategories: [] },
  { id: 'food', type: 'expense', name: 'Food', total: '0', kind: 'neutral', subcategories: [] },
];

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: `tx-${Math.random()}`,
  type: 'expense',
  amount: 10,
  walletId: 'cash',
  date: new Date('2026-08-01T12:00:00'),
  createdAt: new Date('2026-08-01T12:00:00'),
  ...overrides,
});

const transactions: Transaction[] = [
  transaction({ id: 'income', type: 'income', amount: 100, categoryId: 'salary', date: new Date('2026-08-02T12:00:00') }),
  transaction({ id: 'expense', amount: 20, categoryId: 'food', date: new Date('2026-08-03T12:00:00') }),
  transaction({ id: 'transfer', type: 'transfer', amount: 300, destinationWalletId: 'savings', fee: 5, date: new Date('2026-08-04T12:00:00') }),
];

const period = { kind: 'month' as const, anchorDateKey: '2026-08-15' };

describe('Balance report cleanup', () => {
  it('reconstructs available/protected balances without counting transfer principal twice', () => {
    const trend = buildReportBalanceTrend(transactions, wallets, period);
    const beforeTransfer = trend.points.find(point => point.startDateKey === '2026-08-03');
    const afterTransfer = trend.points.find(point => point.startDateKey === '2026-08-04');

    expect(beforeTransfer).toMatchObject({ available: 1080, protected: 500, total: 1580 });
    expect(afterTransfer).toMatchObject({ available: 775, protected: 800, total: 1575 });
    expect(trend.hasProtectedSeries).toBe(true);
  });

  it('shares balance trend and category totals with every export format', async () => {
    const report = buildFinancialReport({ transactions, categories, wallets, period });
    const document = buildFinancialExportDocument({ transactions, categories, wallets, currency: 'PHP', period });
    const files = unzipSync(new Uint8Array(await buildXlsxReport(document).arrayBuffer()));
    const workbook = strFromU8(files['xl/workbook.xml']);

    expect(document.report.summary).toEqual(report.summary);
    expect(document.report.balanceTrend.points).toEqual(report.balanceTrend.points);
    expect(workbook).toContain('name="Expense Breakdown"');
    expect(workbook).toContain('name="Income Breakdown"');
    expect(workbook).toContain('name="Balance Trend"');
    expect(strFromU8(files['xl/worksheets/sheet5.xml'])).toContain('Available balance');
  });

  it('keeps the requested cleanup visible in the owning components', () => {
    const balance = readFileSync('components/sections/BalanceSection.tsx', 'utf8');
    const calendar = readFileSync('components/modals/LifeHubDateModal.tsx', 'utf8');
    const reports = readFileSync('components/balance/ReportsPanel.tsx', 'utf8');

    expect(balance).toContain('selectedTransactionDate');
    expect(balance).toContain('No transactions for this day.');
    expect(balance).toContain('Clear transaction history');
    expect(balance).not.toContain('Filter transactions by period');
    expect(calendar).toContain('options={DATE_TYPES}');
    expect(calendar).not.toContain('<select');
    expect(reports).toContain('Balance trend');
    expect(reports).toContain('Expense');
    expect(reports).toContain('Income');
    expect(reports).toContain('aria-pressed={value === \'pie\'}');
  });

  it('keeps Transactions progressive disclosure focused without dropping controls', () => {
    const balance = readFileSync('components/sections/BalanceSection.tsx', 'utf8');

    expect(balance).toContain('aria-label="More transaction actions"');
    expect(balance).toContain('Manage categories');
    expect(balance).toContain('Import transactions');
    expect(balance).toContain('Export transactions');
    expect(balance).toContain('Filter transactions');
    expect(balance).toContain('aria-label="Selected transaction actions"');
    expect(balance).toContain('aria-label="Exit selection mode"');
    expect(balance).not.toContain('Clear selection');
    expect(balance).not.toContain('Selected transaction day controls');
  });
});
