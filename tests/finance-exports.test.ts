import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

import {
  buildFinancialExportDocument,
  buildTransactionCsv,
  buildXlsxReport,
  getFinancialExportFileName,
  sanitizeExportFileName,
} from '@/lib/finance/exports';
import { buildTransactionCsvImport, parseTransactionCsv } from '@/lib/finance/transaction-csv-import';
import { buildExpensePrintSlices } from '@/components/balance/PrintableFinancialReport';
import type { FinancialCategory, Profile, Transaction, Wallet } from '@/lib/types';

const printableReportSource = readFileSync(
  new URL('../components/balance/PrintableFinancialReport.tsx', import.meta.url),
  'utf8',
);
const printStylesSource = readFileSync(
  new URL('../app/globals.css', import.meta.url),
  'utf8',
);
const balanceSectionSource = readFileSync(
  new URL('../components/sections/BalanceSection.tsx', import.meta.url),
  'utf8',
);

const wallets: Wallet[] = [
  { id: 'cash', name: 'Cash', balance: 1000, color: '#000', type: 'cash_on_hand', createdAt: new Date('2026-01-01') },
  { id: 'savings', name: 'Savings', balance: 500, color: '#111', type: 'savings', createdAt: new Date('2026-01-01') },
];

const categories: FinancialCategory[] = [
  { id: 'food', type: 'expense', name: 'Food', total: '0', kind: 'neutral', subcategories: [{ id: 'groceries', name: 'Groceries', total: '0' }] },
  { id: 'salary', type: 'income', name: 'Salary', total: '0', kind: 'neutral', subcategories: [] },
];

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: `tx-${Math.random()}`,
  type: 'expense',
  amount: 10,
  walletId: 'cash',
  date: new Date('2026-08-18T12:00:00'),
  createdAt: new Date('2026-08-18T12:00:00'),
  updatedAt: new Date('2026-08-18T12:00:00'),
  ...overrides,
});

const transactions: Transaction[] = [
  transaction({ id: 'income-1', type: 'income', amount: 5000, categoryId: 'salary', notes: 'Monthly salary', source: 'manual', sourceKey: 'manual:income-1' }),
  transaction({ id: 'expense-1', type: 'expense', amount: 125.5, categoryId: 'food', subcategoryId: 'groceries', payee: 'Market', source: 'manual', sourceKey: 'manual:expense-1' }),
  transaction({ id: 'transfer-1', type: 'transfer', amount: 300, walletId: 'cash', destinationWalletId: 'savings', fee: 15, notes: 'Move savings', source: 'manual', sourceKey: 'manual:transfer-1' }),
  transaction({ id: 'adjustment-1', type: 'adjustment', amount: 50, walletId: 'cash', adjustmentDirection: 'increase', source: 'manual', sourceKey: 'manual:adjustment-1' }),
  transaction({ id: 'excluded-1', type: 'expense', amount: 25, walletId: 'cash', excludeFromReports: true, source: 'manual', sourceKey: 'manual:excluded-1' }),
];

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'export-profile',
    name: 'Export profile',
    wallets,
    transactions: [],
    inventoryItems: [],
    wishlistItems: [],
    upcomingMoneyItems: [],
    journalEntries: [],
    games: [],
    gameGuides: [],
    productivityItems: [],
    mediaItems: [],
    musicItems: [],
    workItems: [],
    personalVaultItems: [],
    trashItems: [],
    skincareProducts: [],
    dailyChecklistItems: [],
    importantDates: [],
    supplements: [],
    health: {} as Profile['health'],
    financialCategories: categories,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('professional financial exports', () => {
  it('serializes the report period to an import-compatible transaction CSV', () => {
    const reportDocument = buildFinancialExportDocument({
      transactions,
      categories,
      wallets,
      currency: 'PHP',
      period: { kind: 'month', anchorDateKey: '2026-08-23' },
      generatedAt: new Date('2026-08-23T12:00:00'),
    });
    const csv = buildTransactionCsv(reportDocument);
    const parsed = parseTransactionCsv(csv);

    expect(csv.startsWith('\uFEFFID,Note,Amount')).toBe(true);
    expect(parsed.rows).toHaveLength(6);
    expect(parsed.rows.filter(row => row.caizenType === 'transfer')).toHaveLength(2);
    expect(parsed.rows.find(row => row.event === 'Outgoing transfer')).toMatchObject({ signedAmount: -300, fee: 15, sourceKey: 'manual:transfer-1' });
    expect(parsed.rows.find(row => row.event === 'Incoming transfer')).toMatchObject({ signedAmount: 300, sourceKey: 'manual:transfer-1' });
    expect(parsed.rows.find(row => row.sourceId === 'expense-1')).toMatchObject({ subcategoryName: 'Groceries', payee: 'Market', excludeFromReports: false });
  });

  it('round-trips transfers, adjustments, provenance, exclusions, and duplicate keys safely', () => {
    const reportDocument = buildFinancialExportDocument({
      transactions,
      categories,
      wallets,
      currency: 'PHP',
      period: { kind: 'month', anchorDateKey: '2026-08-23' },
    });
    const parsed = parseTransactionCsv(buildTransactionCsv(reportDocument));
    const first = buildTransactionCsvImport(profile(), parsed, { Cash: 'cash', Savings: 'savings' }, 'PHP');

    expect(first.transactions.filter(item => item.type === 'transfer')).toHaveLength(1);
    expect(first.transactions.find(item => item.type === 'transfer')).toMatchObject({ walletId: 'cash', destinationWalletId: 'savings', amount: 300, fee: 15, sourceKey: 'manual:transfer-1' });
    expect(first.transactions.find(item => item.sourceKey === 'manual:adjustment-1')).toMatchObject({ type: 'adjustment', adjustmentDirection: 'increase' });
    expect(first.transactions.find(item => item.sourceKey === 'manual:expense-1')).toMatchObject({ categoryId: 'food', subcategoryId: 'groceries' });
    expect(first.transactions.find(item => item.sourceKey === 'manual:excluded-1')).toMatchObject({ excludeFromReports: true });

    const second = buildTransactionCsvImport(first.profile, parsed, { Cash: 'cash', Savings: 'savings' }, 'PHP');
    expect(second.importedCount).toBe(0);
    expect(second.duplicateSourceKeys.length).toBeGreaterThanOrEqual(transactions.length);
    expect(second.profile.transactions).toHaveLength(first.profile.transactions.length);
  });

  it('produces a readable OOXML workbook with the expected sheets and tabular headers', async () => {
    const reportDocument = buildFinancialExportDocument({
      transactions,
      categories,
      wallets,
      currency: 'PHP',
      period: { kind: 'month', anchorDateKey: '2026-08-23' },
    });
    const blob = buildXlsxReport(reportDocument);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const workbook = strFromU8(files['xl/workbook.xml']);
    const transactionsSheet = strFromU8(files['xl/worksheets/sheet2.xml']);

    expect(blob.type).toContain('spreadsheetml.sheet');
    expect(workbook).toContain('name="Summary"');
    expect(workbook).toContain('name="Transactions"');
    expect(workbook).toContain('name="Categories"');
    expect(workbook).toContain('name="Wallets"');
    expect(transactionsSheet).toContain('frozen');
    expect(transactionsSheet).toContain('autoFilter');
    expect(transactionsSheet).toContain('Reportable income');
  });

  it('sanitizes filenames and handles thousands of detail rows in memory', () => {
    const manyTransactions = Array.from({ length: 4000 }, (_, index) => transaction({ id: `large-${index}`, sourceKey: `large:${index}` }));
    const reportDocument = buildFinancialExportDocument({
      transactions: manyTransactions,
      categories,
      wallets,
      currency: 'PHP',
      period: { kind: 'month', anchorDateKey: '2026-08-23' },
    });
    const csv = buildTransactionCsv(reportDocument);

    expect(csv.split('\r\n')).toHaveLength(4002);
    expect(sanitizeExportFileName('bad:/name?.csv')).toBe('bad--name-.csv');
    expect(getFinancialExportFileName('csv', reportDocument.period)).toBe('Caizen-Transactions-2026-08.csv');
  });

  it('prepares a top-six expense donut with an exact Other remainder', () => {
    const slices = buildExpensePrintSlices([
      ...Array.from({ length: 7 }, (_, index) => ({
        id: `category-${index}`,
        label: `Category ${index}`,
        amount: index + 1,
        percentage: (index + 1) * 2,
        transactionCount: index + 1,
      })),
    ]);

    expect(slices).toHaveLength(7);
    expect(slices.slice(0, 6).map(item => item.label)).toEqual([
      'Category 0', 'Category 1', 'Category 2', 'Category 3', 'Category 4', 'Category 5',
    ]);
    expect(slices.at(-1)).toMatchObject({ label: 'Other', amount: 7, percentage: 14 });
  });

  it('keeps the printable expense breakdown legend-free and A4-constrained', () => {
    expect(printableReportSource).not.toContain('finance-print-donut-legend');
    expect(printableReportSource).toContain('finance-print-breakdown-table');
    expect(printableReportSource).toContain('const otherSlice = expenseSlices.find(slice => slice.label === \'Other\');');
    expect(printableReportSource).toContain('finance-print-breakdown-note');
    expect(printStylesSource).toContain(
      'grid-template-columns: minmax(10rem, 10.5rem) minmax(0, 1fr);',
    );
    expect(printStylesSource).toContain('grid-column: 2;');
    expect(printStylesSource).toContain('table-layout: fixed;');
    expect(printStylesSource).toContain('overflow-wrap: anywhere;');
  });

  it('keeps transaction actions keyboard-accessible and touch-sized', () => {
    expect(balanceSectionSource).toContain('<DropdownMenuTrigger asChild>');
    expect(balanceSectionSource).toContain('className="android-finance-row-action size-11"');
    expect(balanceSectionSource).toContain('className="android-finance-row-selection mt-0.5 grid shrink-0 place-items-center rounded-xl"');
    expect(printStylesSource).toContain('html[data-capacitor=\'true\'] .android-finance-row-action');
    expect(printStylesSource).toContain('width: var(--android-touch-target);');
  });
});
