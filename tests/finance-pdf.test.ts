import { describe, expect, it } from 'vitest';

import { buildFinancialExportDocument, getFinancialExportFileName } from '@/lib/finance/exports';
import { buildFinancialPdf } from '@/lib/finance/pdf';
import type { FinancialCategory, Transaction, Wallet } from '@/lib/types';

const wallets: Wallet[] = [
  { id: 'cash', name: 'Cash', balance: 1200, color: '#568985', type: 'cash_on_hand', createdAt: new Date('2026-01-01') },
];

const categories: FinancialCategory[] = [
  { id: 'food', type: 'expense', name: 'Food', total: '0', kind: 'neutral', subcategories: [] },
  { id: 'salary', type: 'income', name: 'Salary', total: '0', kind: 'neutral', subcategories: [] },
];

const transactions: Transaction[] = [
  {
    id: 'income-1', type: 'income', amount: 500, walletId: 'cash', categoryId: 'salary',
    date: new Date('2026-08-18T12:00:00'), createdAt: new Date('2026-08-18T12:00:00'), updatedAt: new Date('2026-08-18T12:00:00'),
  },
  {
    id: 'expense-1', type: 'expense', amount: 125.5, walletId: 'cash', categoryId: 'food',
    date: new Date('2026-08-19T12:00:00'), createdAt: new Date('2026-08-19T12:00:00'), updatedAt: new Date('2026-08-19T12:00:00'),
  },
];

function makeDocument() {
  return buildFinancialExportDocument({
    transactions,
    categories,
    wallets,
    currency: 'PHP',
    period: { kind: 'month', anchorDateKey: '2026-08-20' },
    generatedAt: new Date('2026-09-03T10:43:00'),
    now: new Date('2026-09-03T10:43:00'),
  });
}

describe('direct financial PDF export', () => {
  it('creates a Caizen PDF without a browser print surface', async () => {
    const blob = buildFinancialPdf(makeDocument(), true);
    const source = new TextDecoder().decode(await blob.arrayBuffer());

    expect(blob.type).toBe('application/pdf');
    expect(source.startsWith('%PDF-1.4')).toBe(true);
    expect(source).toContain('Money Report');
    expect(source).toContain('Summary');
    expect(source).toContain('Balance Trend');
    expect(source).toContain('Expense breakdown');
    expect(source).toContain('Income breakdown');
    expect(source).toContain('Page 1 of');
    expect(source).not.toContain('https://');
    expect(source).not.toContain('window.print');
  });

  it('keeps an empty-period report valid and uses a clear PDF filename', async () => {
    const document = buildFinancialExportDocument({
      transactions: [],
      categories,
      wallets: [],
      currency: 'PHP',
      period: { kind: 'month', anchorDateKey: '2026-08-20' },
      generatedAt: new Date('2026-09-03T10:43:00'),
      now: new Date('2026-09-03T10:43:00'),
    });
    const source = new TextDecoder().decode(await buildFinancialPdf(document).arrayBuffer());

    expect(source.startsWith('%PDF-1.4')).toBe(true);
    expect(source).toContain('No expense data in this period.');
    expect(source).toContain('No income data in this period.');
    expect(source).toContain('No wallet balance trend is available for this period.');
    expect(getFinancialExportFileName('pdf', document.period)).toBe('Caizen-Balance-Report-2026-08.pdf');
  });
});

