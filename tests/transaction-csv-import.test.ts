import { describe, expect, it } from 'vitest';

import { toLocalDateKey } from '@/lib/date-utils';
import {
  buildTransactionCsvImport,
  parseTransactionCsv,
  type TransactionCsvReviewDecision,
} from '@/lib/finance/transaction-csv-import';
import { transactionWalletDeltas } from '@/lib/transactions';
import { prepareImport } from '@/lib/storage/import-integrity';
import type { Profile } from '@/lib/types';

const profile = (overrides: Record<string, unknown> = {}) => ({
  id: 'profile-money',
  name: 'Money',
  wallets: [
    { id: 'cash', name: 'Cash', balance: 1000, color: '#000', type: 'cash_on_hand', createdAt: new Date('2026-01-01') },
    { id: 'savings', name: 'Savings', balance: 500, color: '#111', type: 'savings', createdAt: new Date('2026-01-01') },
    { id: 'landbank', name: 'Landbank', balance: 250, color: '#222', type: 'savings', createdAt: new Date('2026-01-01') },
  ],
  transactions: [],
  financialCategories: [{ id: 'food', type: 'expense', name: 'Food', total: '0', kind: 'neutral', subcategories: [{ id: 'groceries', name: 'Groceries', total: '0' }] }],
  ...overrides,
}) as unknown as Profile;

const csv = [
  'ID,Note,Amount,Category,Account,Currency,Date,Event,Exclude Report',
  'ml-1,"Weekly groceries, market",-125,Groceries,Cash,PHP,18/08/2026,,True',
  'ml-2,Salary,5000,Income,Cash,PHP,19/08/2026,,False',
].join('\n');

describe('Transaction CSV import', () => {
  it('parses the real date format, uses signed amount direction, and preserves exclusions', () => {
    const result = parseTransactionCsv(csv);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      account: 'Cash',
      amount: 125,
      signedAmount: -125,
      categoryName: 'Groceries',
      type: 'expense',
      excludeFromReports: true,
    });
    expect(toLocalDateKey(result.rows[0].date)).toBe('2026-08-18');
    expect(result.rows[1]).toMatchObject({ signedAmount: 5000, type: 'income' });
    expect(result.rows[1].event).toBe('');
    expect(result.warnings).toEqual([]);
    expect(result.categories).toEqual(['Groceries', 'Income']);
    expect(result.incomeCandidates).toBe(1);
    expect(result.expenseCandidates).toBe(1);
    expect(result.transferCandidates).toBe(0);
  });

  it('matches only a mutually unique transfer pair and keeps it out of reports', () => {
    const transferCsv = [
      'ID,Note,Amount,Category,Account,Currency,Date,Event,Exclude Report',
      'out-1,Send to savings,-2000,Outgoing transfer,Cash,PHP,18/08/2026,,True',
      'in-1,Received from cash,2000,Incoming transfer,Savings,PHP,18/08/2026,,False',
    ].join('\n');
    const result = buildTransactionCsvImport(
      profile(),
      parseTransactionCsv(transferCsv),
      { Cash: 'cash', Savings: 'savings' },
      'PHP',
    );

    expect(result.strictTransferPairs).toBe(1);
    expect(result.unmatchedTransferRows).toHaveLength(0);
    expect(result.ambiguousTransferRows).toHaveLength(0);
    expect(result.readyRowCount).toBe(2);
    expect(result.importedCount).toBe(1);
    expect(result.transactions.filter(transaction => transaction.type === 'transfer')).toHaveLength(1);
    expect(result.transactions.find(transaction => transaction.type === 'transfer')).toMatchObject({
      type: 'transfer',
      amount: 2000,
      walletId: 'cash',
      destinationWalletId: 'savings',
      excludeFromReports: true,
    });
  });

  it('leaves ambiguous and unmatched transfer rows out of the ledger', () => {
    const transferCsv = [
      'ID,Note,Amount,Category,Account,Currency,Date,Event,Exclude Report',
      'out-1,Send,-300,Outgoing transfer,Cash,PHP,18/08/2026,,False',
      'in-1,Receive one,300,Incoming transfer,Savings,PHP,18/08/2026,,False',
      'in-2,Receive two,300,Incoming transfer,Landbank,PHP,18/08/2026,,False',
      'out-2,No matching row,-600,Outgoing transfer,Cash,PHP,19/08/2026,,False',
    ].join('\n');
    const result = buildTransactionCsvImport(
      profile(),
      parseTransactionCsv(transferCsv),
      { Cash: 'cash', Savings: 'savings', Landbank: 'landbank' },
      'PHP',
    );

    expect(result.strictTransferPairs).toBe(0);
    expect(result.ambiguousTransferRows).toHaveLength(3);
    expect(result.unmatchedTransferRows).toHaveLength(1);
    expect(result.unsupportedRows).toHaveLength(4);
    expect(result.importedCount).toBe(0);
    expect(result.profile.transactions).toHaveLength(0);
    expect(result.ambiguousTransferRows[0].reviewReason).toContain('ambiguous');
    expect(result.unmatchedTransferRows[0].reviewReason).toContain('unmatched');
  });

  it('anchors imported history with an explicit adjustment and preserves wallet balance', () => {
    const parsed = parseTransactionCsv(csv);
    const result = buildTransactionCsvImport(profile(), parsed, { Cash: 'cash' }, 'PHP');

    expect(result.importedCount).toBe(2);
    expect(result.readyRowCount).toBe(2);
    expect(result.unsupportedRows).toHaveLength(0);
    expect(result.currencyMismatches).toHaveLength(0);
    expect(result.profile.transactions).toHaveLength(3);
    expect(result.profile.transactions[0]).toMatchObject({ type: 'adjustment', amount: 4875, excludeFromReports: true });
    expect(result.profile.transactions.find(transaction => transaction.sourceKey?.endsWith('ml-1'))).toMatchObject({ type: 'expense', amount: 125, excludeFromReports: true });
    expect(result.profile.wallets[0].balance).toBe(1000);
  });

  it('reports the real category cardinality without requiring Event values', () => {
    const rows = Array.from({ length: 72 }, (_, index) =>
      `ml-${index + 1},,-${index + 1},Category ${index + 1},Cash,PHP,01/08/2026,,False`,
    );
    const result = parseTransactionCsv([
      'ID,Note,Amount,Category,Account,Currency,Date,Event,Exclude Report',
      ...rows,
    ].join('\n'));

    expect(result.rows).toHaveLength(72);
    expect(result.categories).toHaveLength(72);
    expect(result.expenseCandidates).toBe(72);
    expect(result.warnings).toEqual([]);
  });

  it('rejects mismatched currencies and makes a second import idempotent', () => {
    const first = buildTransactionCsvImport(
      profile(),
      parseTransactionCsv(csv.replace('PHP,18/08/2026', 'USD,18/08/2026')),
      { Cash: 'cash' },
      'PHP',
    );
    expect(first.currencyMismatches).toHaveLength(1);
    expect(first.importedCount).toBe(1);

    const second = buildTransactionCsvImport(first.profile, parseTransactionCsv(csv), { Cash: 'cash' }, 'PHP');
    expect(second.duplicateSourceKeys).toHaveLength(1);
    expect(second.importedCount).toBe(1);
    expect(second.transactions.filter(transaction => transaction.type !== 'adjustment')).toHaveLength(1);
  });

  it('uses the data-only import envelope accepted by the transactional restore path', () => {
    const built = buildTransactionCsvImport(profile(), parseTransactionCsv(csv), { Cash: 'cash' }, 'PHP');
    const prepared = prepareImport({
      format: 'caizen-data',
      version: 3,
      data: { profiles: [built.profile], currentProfileId: built.profile.id },
    });

    expect(prepared.report.canImport).toBe(true);
    expect(prepared.state.profiles[0].transactions).toHaveLength(3);
  });

  it('turns an unmatched outgoing marker into one manual transfer and preserves provenance', () => {
    const unmatched = parseTransactionCsv([
      'ID,Note,Amount,Category,Account,Currency,Date,Event,Exclude Report',
      'manual-out,Move to savings,-300,Groceries,Cash,PHP,18/08/2026,Outgoing transfer,True',
    ].join('\n'));
    const decision: TransactionCsvReviewDecision = {
      rowNumber: 2,
      action: 'transfer',
      walletReference: { kind: 'wallet', walletId: 'savings' },
    };
    const result = buildTransactionCsvImport(profile(), unmatched, { Cash: 'cash' }, 'PHP', [decision]);
    const transfer = result.transactions.find(transaction => transaction.type === 'transfer');

    expect(transfer).toMatchObject({
      type: 'transfer',
      amount: 300,
      walletId: 'cash',
      destinationWalletId: 'savings',
      notes: 'Move to savings',
      source: 'transaction-csv',
      excludeFromReports: true,
    });
    expect(transfer?.fee).toBeUndefined();
    expect(result.manualTransferCount).toBe(1);
    expect(result.resolvedReviewRows).toBe(1);
    expect(result.summary.unresolvedRows).toBe(0);
    expect(result.summary.importedSourceRows).toBe(1);
    expect(result.profile.wallets.find(wallet => wallet.id === 'cash')?.balance).toBe(1000);
    expect(result.profile.wallets.find(wallet => wallet.id === 'savings')?.balance).toBe(500);
  });

  it('allows an unmatched row to select a newly mapped account as the other wallet', () => {
    const parsed = parseTransactionCsv([
      'ID,Note,Amount,Category,Account,Currency,Date,Event,Exclude Report',
      'manual-in,Received from savings,125,,Cash,PHP,18/08/2026,Incoming transfer,False',
    ].join('\n'));
    const result = buildTransactionCsvImport(
      profile(),
      parsed,
      { Cash: 'cash', Savings: 'new' },
      'PHP',
      [{
        rowNumber: 2,
        action: 'transfer',
        walletReference: { kind: 'account', account: 'Savings' },
      }],
    );
    const transfer = result.transactions.find(transaction => transaction.type === 'transfer');
    const savings = result.newWallets.find(wallet => wallet.name === 'Savings');

    expect(savings).toBeDefined();
    expect(transfer).toMatchObject({
      walletId: savings?.id,
      destinationWalletId: 'cash',
      amount: 125,
    });
    expect(result.newWallets.map(wallet => wallet.name)).toContain('Savings');
  });

  it('resolves an ambiguous pair once and prevents either row from being reused', () => {
    const transferCsv = [
      'ID,Note,Amount,Category,Account,Currency,Date,Event,Exclude Report',
      'out-1,Send,-300,Outgoing transfer,Cash,PHP,18/08/2026,,False',
      'in-1,Receive one,300,Incoming transfer,Savings,PHP,18/08/2026,,False',
      'in-2,Receive two,300,Incoming transfer,Landbank,PHP,18/08/2026,,False',
      'out-2,No matching row,-600,Outgoing transfer,Cash,PHP,19/08/2026,,False',
    ].join('\n');
    const decisions: TransactionCsvReviewDecision[] = [
      { rowNumber: 2, action: 'transfer', counterpartRowNumber: 3 },
      { rowNumber: 4, action: 'transfer', counterpartRowNumber: 2 },
    ];
    const result = buildTransactionCsvImport(
      profile(),
      parseTransactionCsv(transferCsv),
      { Cash: 'cash', Savings: 'savings', Landbank: 'landbank' },
      'PHP',
      decisions,
    );

    expect(result.transactions.filter(transaction => transaction.type === 'transfer')).toHaveLength(1);
    expect(result.manualTransferCount).toBe(1);
    expect(result.resolvedReviewRows).toBe(2);
    expect(result.ambiguousTransferRows.map(row => row.rowNumber)).toContain(4);
    expect(result.unmatchedTransferRows.map(row => row.rowNumber)).toContain(5);
    expect(result.summary.unresolvedRows).toBe(2);
  });

  it('supports income, expense, and skip decisions without importing skipped rows', () => {
    const parsed = parseTransactionCsv([
      'ID,Note,Amount,Category,Account,Currency,Date,Event,Exclude Report',
      'review-income,Manual income,100,Income,Cash,PHP,18/08/2026,Incoming transfer,False',
      'review-expense,Manual expense,-75,Food,Cash,PHP,18/08/2026,Outgoing transfer,True',
      'review-skip,Ignore this,-50,Food,Cash,PHP,18/08/2026,Outgoing transfer,False',
    ].join('\n'));
    const decisions: TransactionCsvReviewDecision[] = [
      { rowNumber: 2, action: 'income' },
      { rowNumber: 3, action: 'expense' },
      { rowNumber: 4, action: 'skip' },
    ];
    const result = buildTransactionCsvImport(profile(), parsed, { Cash: 'cash' }, 'PHP', decisions);

    expect(result.transactions.filter(transaction => transaction.type === 'income')).toHaveLength(1);
    expect(result.transactions.filter(transaction => transaction.type === 'expense')).toHaveLength(1);
    expect(result.transactions.some(transaction => transaction.notes === 'Ignore this')).toBe(false);
    expect(result.resolvedReviewRows).toBe(2);
    expect(result.skippedReviewRows).toBe(1);
    expect(result.summary.unresolvedRows).toBe(0);
    expect(result.summary.skippedRows).toBe(1);
  });

  it('keeps manual review idempotent and reconciles wallet deltas exactly once', () => {
    const parsed = parseTransactionCsv([
      'ID,Note,Amount,Category,Account,Currency,Date,Event,Exclude Report',
      'manual-out,Move,-300,,Cash,PHP,18/08/2026,Outgoing transfer,False',
    ].join('\n'));
    const decisions: TransactionCsvReviewDecision[] = [{
      rowNumber: 2,
      action: 'transfer',
      walletReference: { kind: 'wallet', walletId: 'savings' },
    }];
    const first = buildTransactionCsvImport(profile(), parsed, { Cash: 'cash' }, 'PHP', decisions);
    const second = buildTransactionCsvImport(first.profile, parsed, { Cash: 'cash' }, 'PHP', decisions);

    expect(second.importedCount).toBe(0);
    expect(second.duplicateSourceKeys).toHaveLength(1);
    expect(second.profile.transactions).toHaveLength(first.profile.transactions.length);

    const deltas = new Map<string, number>();
    for (const transaction of first.transactions) {
      for (const [walletId, delta] of transactionWalletDeltas(transaction)) {
        deltas.set(walletId, (deltas.get(walletId) || 0) + delta);
      }
    }
    expect(deltas.get('cash')).toBe(0);
    expect(deltas.get('savings')).toBe(0);
    expect(first.summary.reconciliationAdjustments).toBe(2);
  });

  it('recognizes legacy imported source keys after the CSV naming cleanup', () => {
    const first = buildTransactionCsvImport(profile(), parseTransactionCsv(csv), { Cash: 'cash' }, 'PHP');
    const legacyProfile = structuredClone(first.profile) as Profile;
    legacyProfile.transactions = legacyProfile.transactions.map(transaction => ({
      ...transaction,
      sourceKey: transaction.sourceKey?.replace(/^transaction-csv:/, 'money-lover:'),
    }));

    const second = buildTransactionCsvImport(legacyProfile, parseTransactionCsv(csv), { Cash: 'cash' }, 'PHP');
    expect(second.importedCount).toBe(0);
    expect(second.duplicateSourceKeys.length).toBeGreaterThan(0);
  });
});
