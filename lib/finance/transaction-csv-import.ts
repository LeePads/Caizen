import { parseLocalDateKey, toLocalDateKey } from '@/lib/date-utils';
import { addMoney, toFiniteMoney } from '@/lib/money';
import { createEntityId } from '@/lib/utils';
import {
  createAdjustmentTransaction,
  normalizeTransaction,
} from '@/lib/transactions';
import type {
  FinancialCategory,
  Profile,
  Transaction,
  Wallet,
} from '@/lib/types';

export type TransactionCsvRow = {
  rowNumber: number;
  sourceId: string;
  note: string;
  amount: number;
  signedAmount: number;
  categoryName: string;
  account: string;
  currency: string;
  date: Date | null;
  event: string;
  excludeFromReports: boolean;
  type: 'income' | 'expense' | 'transfer' | 'review';
  transferDirection?: 'incoming' | 'outgoing';
  caizenType?: 'income' | 'expense' | 'transfer' | 'adjustment';
  subcategoryName?: string;
  payee?: string;
  destinationAccount?: string;
  fee?: number;
  adjustmentDirection?: 'increase' | 'decrease';
  source?: string;
  sourceKey?: string;
  warning?: string;
  reviewReason?: string;
};

export type TransactionCsvParseResult = {
  rows: TransactionCsvRow[];
  accounts: string[];
  currencies: string[];
  categories: string[];
  incomeCandidates: number;
  expenseCandidates: number;
  transferCandidates: number;
  warnings: string[];
  headers: string[];
};

export type TransactionCsvReviewAction =
  | 'transfer'
  | 'income'
  | 'expense'
  | 'skip';

export type TransactionCsvWalletReference =
  | { kind: 'wallet'; walletId: string }
  | { kind: 'account'; account: string };

export type TransactionCsvReviewDecision = {
  rowNumber: number;
  action: TransactionCsvReviewAction;
  counterpartRowNumber?: number;
  walletReference?: TransactionCsvWalletReference;
};

export type TransactionCsvReviewItem = {
  row: TransactionCsvRow;
  reviewReason: 'unmatched' | 'ambiguous';
  candidates: TransactionCsvRow[];
};

export type TransactionCsvImportSummary = {
  sourceRows: number;
  importedTransactions: number;
  importedSourceRows: number;
  transfers: number;
  skippedRows: number;
  unresolvedRows: number;
  duplicates: number;
  reconciliationAdjustments: number;
};

export type TransactionCsvBuildResult = {
  profile: Profile;
  transactions: Transaction[];
  newWallets: Wallet[];
  warnings: string[];
  duplicateSourceKeys: string[];
  unsupportedRows: TransactionCsvRow[];
  currencyMismatches: TransactionCsvRow[];
  importedCount: number;
  readyRowCount: number;
  reviewRowCount: number;
  strictTransferPairs: number;
  unmatchedTransferRows: TransactionCsvRow[];
  ambiguousTransferRows: TransactionCsvRow[];
  mappedCategoryRows: number;
  unmappedCategoryRows: number;
  reviewRows: TransactionCsvReviewItem[];
  reviewTotalRowCount: number;
  resolvedReviewRows: number;
  skippedReviewRows: number;
  importedSourceRows: number;
  manualTransferCount: number;
  transferCount: number;
  reconciliationAdjustmentCount: number;
  summary: TransactionCsvImportSummary;
};

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/[\s_-]+/g, '');

const normalizeText = (value: string) => value.trim().toLowerCase();

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some(value => value.trim())) rows.push(row);
  }
  return rows;
}

function parseAmount(value: string): number {
  const raw = value.trim();
  const parenthesized = /^\(.*\)$/.test(raw);
  const text = raw.replace(/[()]/g, '').replace(/[^\d,.-]/g, '');
  if (!text) return 0;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  const normalized = comma > dot
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(/,/g, '');
  const amount = toFiniteMoney(Number(normalized));
  return parenthesized ? -Math.abs(amount) : amount;
}

function parseDate(value: string): Date | null {
  const text = value.trim();
  if (!text) return null;
  if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(text)) {
    return parseLocalDateKey(text.replaceAll('/', '-'));
  }
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    // Transaction CSV exports may use DD/MM/YYYY. Keep a deterministic fallback for
    // unambiguous MM/DD/YYYY rows without making 01/02 locale-dependent.
    const day = first > 12 && second <= 12 ? first : second > 12 && first <= 12 ? second : first;
    const month = first > 12 && second <= 12 ? second : second > 12 && first <= 12 ? first : second;
    return parseLocalDateKey(`${slash[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function transferDirection(value: string): TransactionCsvRow['transferDirection'] {
  const text = normalizeText(value);
  if (text.includes('incoming transfer')) return 'incoming';
  if (text.includes('outgoing transfer')) return 'outgoing';
  return undefined;
}

function isExcluded(value: string): boolean {
  return /^(1|true|yes|y|x|excluded)$/i.test(value.trim());
}

export function parseTransactionCsv(input: string): TransactionCsvParseResult {
  const rawRows = parseCsvRows(input);
  if (rawRows.length < 2) throw new Error('The Transaction CSV has no transaction rows.');

  const headers = rawRows[0].map(normalizeHeader);
  const indexOf = (...names: string[]) => {
    const wanted = names.map(normalizeHeader);
    return headers.findIndex(header => wanted.includes(header));
  };
  const indexes = {
    id: indexOf('ID', 'transactionid'),
    note: indexOf('Note', 'Notes', 'Description'),
    amount: indexOf('Amount', 'Value'),
    category: indexOf('Category'),
    account: indexOf('Account', 'Wallet'),
    currency: indexOf('Currency'),
    date: indexOf('Date', 'TransactionDate'),
    event: indexOf('Event', 'Type'),
    exclude: indexOf('Exclude Report', 'ExcludeReport', 'Exclude'),
    caizenType: indexOf('Caizen Type', 'CaizenType'),
    subcategory: indexOf('Subcategory', 'Sub Category'),
    payee: indexOf('Payee', 'Merchant'),
    destinationAccount: indexOf('Destination Account', 'Destination Wallet'),
    fee: indexOf('Fee', 'Transfer Fee'),
    adjustmentDirection: indexOf('Adjustment Direction', 'AdjustmentDirection'),
    source: indexOf('Caizen Source', 'Source'),
    sourceKey: indexOf('Caizen Source Key', 'Source Key', 'SourceKey'),
  };
  const missing = ['amount', 'account', 'currency', 'date'].filter(key => indexes[key as keyof typeof indexes] < 0);
  if (missing.length) throw new Error(`The Transaction CSV is missing required columns: ${missing.join(', ')}.`);

  const warnings: string[] = [];
  let incomeCandidates = 0;
  let expenseCandidates = 0;
  let transferCandidates = 0;
  const rows: TransactionCsvRow[] = rawRows.slice(1).map((values, offset) => {
    const get = (index: number) => index < 0 ? '' : String(values[index] || '').trim();
    const event = get(indexes.event);
    const categoryName = get(indexes.category);
    const signedAmount = parseAmount(get(indexes.amount));
    const amount = Math.abs(signedAmount);
    const transfer = transferDirection(categoryName) || transferDirection(event);
    const caizenTypeText = get(indexes.caizenType).toLowerCase();
    const caizenType = caizenTypeText === 'income' || caizenTypeText === 'expense' || caizenTypeText === 'transfer' || caizenTypeText === 'adjustment'
      ? caizenTypeText
      : undefined;
    const parsedAdjustmentDirection = get(indexes.adjustmentDirection).toLowerCase();
    const adjustmentDirection = parsedAdjustmentDirection === 'increase' || parsedAdjustmentDirection === 'decrease'
      ? parsedAdjustmentDirection
      : undefined;
    const type = caizenType === 'transfer' || transfer
      ? 'transfer'
      : caizenType === 'adjustment'
        ? (signedAmount === 0 ? 'review' : signedAmount > 0 ? 'income' : 'expense')
        : caizenType === 'income'
          ? 'income'
          : caizenType === 'expense'
            ? 'expense'
      : signedAmount > 0
        ? 'income'
        : signedAmount < 0
          ? 'expense'
          : 'review';
    if (type === 'income') incomeCandidates += 1;
    if (type === 'expense') expenseCandidates += 1;
    if (type === 'transfer') transferCandidates += 1;
    const row: TransactionCsvRow = {
      rowNumber: offset + 2,
      sourceId: get(indexes.id),
      note: get(indexes.note),
      amount,
      signedAmount,
      categoryName,
      account: get(indexes.account),
      currency: get(indexes.currency),
      date: parseDate(get(indexes.date)),
      event,
      excludeFromReports: isExcluded(get(indexes.exclude)),
      type,
      transferDirection: transfer,
      caizenType,
      subcategoryName: get(indexes.subcategory) || undefined,
      payee: get(indexes.payee) || undefined,
      destinationAccount: get(indexes.destinationAccount) || undefined,
      fee: Math.abs(parseAmount(get(indexes.fee))) || undefined,
      adjustmentDirection,
      source: get(indexes.source) || undefined,
      sourceKey: get(indexes.sourceKey) || undefined,
    };
    const rowWarnings: string[] = [];
    if (!row.sourceId) rowWarnings.push('missing ID; fallback duplicate detection will be used');
    if (!row.amount) rowWarnings.push('amount is zero or unreadable');
    if (!row.date) rowWarnings.push('date is missing or unreadable');
    if (!row.account) rowWarnings.push('account is missing');
    if (!row.currency) rowWarnings.push('currency is missing');
    if (type === 'review') rowWarnings.push('amount is zero or unreadable; direction needs review');
    if (rowWarnings.length) {
      row.warning = rowWarnings.join('; ');
      warnings.push(`Row ${row.rowNumber}: ${row.warning}`);
    }
    return row;
  });

  return {
    rows,
    accounts: [...new Set(rows.map(row => row.account).filter(Boolean))].sort(),
    currencies: [...new Set(rows.map(row => row.currency).filter(Boolean))].sort(),
    categories: [...new Set(rows.map(row => row.categoryName).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    incomeCandidates,
    expenseCandidates,
    transferCandidates,
    warnings,
    headers,
  };
}

const stableRowKey = (row: TransactionCsvRow) => row.sourceId || [
  row.account,
  row.date ? toLocalDateKey(row.date) : '',
  row.amount,
  row.signedAmount,
  row.type,
  row.event,
  row.note,
].join('|');

const categoryMatch = (
  categories: FinancialCategory[],
  row: TransactionCsvRow,
): { categoryId?: string; subcategoryId?: string } => {
  const categoryText = normalizeText(row.categoryName);
  if (!categoryText) return {};
  const category = categories.find(item => normalizeText(item.name) === categoryText);
  if (category) {
    const subcategoryText = normalizeText(row.subcategoryName || '');
    const subcategory = subcategoryText
      ? category.subcategories.find(item => normalizeText(item.name) === subcategoryText)
      : undefined;
    return {
      categoryId: category.id,
      ...(subcategory ? { subcategoryId: subcategory.id } : {}),
    };
  }
  for (const candidate of categories) {
    const subcategory = candidate.subcategories.find(item => normalizeText(item.name) === categoryText);
    if (subcategory) return { categoryId: candidate.id, subcategoryId: subcategory.id };
  }
  return {};
};

const sourceKeyForRow = (row: TransactionCsvRow) =>
  row.sourceKey || `transaction-csv:${stableRowKey(row)}`;

const sourceForRow = (row: TransactionCsvRow) =>
  row.source || 'transaction-csv';

export function buildTransactionCsvImport(
  currentProfile: Profile,
  parsed: TransactionCsvParseResult,
  walletMapping: Record<string, string>,
  baseCurrency: string,
  reviewDecisions: TransactionCsvReviewDecision[] = [],
): TransactionCsvBuildResult {
  const profile = structuredClone(currentProfile) as Profile;
  const existingTransactions = profile.transactions || [];
  const existingSourceKeys = new Set(
    existingTransactions
      .map(transaction => transaction.sourceKey)
      .filter((sourceKey): sourceKey is string => Boolean(sourceKey)),
  );
  const seenSourceKeys = new Set(existingSourceKeys);
  const imported: Transaction[] = [];
  const newWallets: Wallet[] = [];
  const warnings = [...parsed.warnings];
  const duplicateSourceKeys: string[] = [];
  const unsupportedRows: TransactionCsvRow[] = [];
  const currencyMismatches: TransactionCsvRow[] = [];
  const walletDeltas = new Map<string, number>();
  const newWalletByAccount = new Map<string, Wallet>();
  const transferCandidates: Array<{ row: TransactionCsvRow; wallet: Wallet }> = [];
  const unmatchedTransferRows: TransactionCsvRow[] = [];
  const ambiguousTransferRows: TransactionCsvRow[] = [];
  const reviewRows: TransactionCsvReviewItem[] = [];
  const resolvedReviewRowNumbers = new Set<number>();
  const skippedReviewRowNumbers = new Set<number>();
  const unmappedCategoryNames = new Set<string>();
  let mappedCategoryRows = 0;
  let unmappedCategoryRows = 0;
  let readyRowCount = 0;
  let strictTransferPairs = 0;
  let manualTransferCount = 0;
  let importedSourceRows = 0;
  const categories = profile.financialCategories || [];

  const addWalletDelta = (walletId: string, delta: number) => {
    walletDeltas.set(walletId, addMoney(walletDeltas.get(walletId) || 0, delta));
  };

  const sourceKeyAliases = (sourceKey: string) => [
    ...new Set([
      sourceKey,
      sourceKey.replace(/^transaction-csv:/, 'money-lover:'),
      sourceKey.replace(/^money-lover:/, 'transaction-csv:'),
    ]),
  ];

  const addDuplicateOrImport = (sourceKey: string) => {
    const aliases = sourceKeyAliases(sourceKey);
    if (aliases.some(alias => seenSourceKeys.has(alias))) {
      duplicateSourceKeys.push(sourceKey);
      return false;
    }
    aliases.forEach(alias => seenSourceKeys.add(alias));
    return true;
  };

  const walletForAccount = (account: string) => {
    const choice = walletMapping[account];
    if (choice && choice !== 'new') return profile.wallets.find(wallet => wallet.id === choice);
    const existing = newWalletByAccount.get(account);
    if (existing) return existing;
    const wallet: Wallet = {
      id: createEntityId('wallet'),
      name: account || 'Imported wallet',
      balance: 0,
      color: '#64748b',
      type: 'free_spending',
      useForWishlist: true,
      includeInSpendable: true,
      isProtected: false,
      purpose: 'Imported wallet',
      createdAt: new Date(),
    };
    newWalletByAccount.set(account, wallet);
    newWallets.push(wallet);
    return wallet;
  };

  const walletForReference = (reference?: TransactionCsvWalletReference) => {
    if (!reference) return undefined;
    return reference.kind === 'wallet'
      ? profile.wallets.find(wallet => wallet.id === reference.walletId)
      : walletForAccount(reference.account);
  };

  for (const row of parsed.rows) {
    if (row.type === 'review' || !row.date || row.amount <= 0 || !row.account) {
      unsupportedRows.push(row);
      continue;
    }
    if (!row.currency || row.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
      currencyMismatches.push(row);
      continue;
    }
    const wallet = walletForAccount(row.account);
    if (!wallet) {
      warnings.push(`Row ${row.rowNumber}: account "${row.account}" is not mapped to a wallet.`);
      unsupportedRows.push(row);
      continue;
    }

    const matchedCategory = categoryMatch(categories, row);
    if (row.categoryName) {
      if (matchedCategory.categoryId) mappedCategoryRows += 1;
      else {
        unmappedCategoryRows += 1;
        unmappedCategoryNames.add(row.categoryName);
      }
    }

    if (row.type === 'transfer') {
      transferCandidates.push({ row, wallet });
      continue;
    }

    const sourceKey = sourceKeyForRow(row);
    if (!addDuplicateOrImport(sourceKey)) continue;
    const importedType = row.caizenType === 'adjustment' ? 'adjustment' : row.type;
    const adjustmentDirection = importedType === 'adjustment'
      ? row.adjustmentDirection || (row.signedAmount < 0 ? 'decrease' : 'increase')
      : undefined;
    imported.push(normalizeTransaction({
      id: createEntityId('transaction'),
      type: importedType,
      amount: row.amount,
      walletId: wallet.id,
      categoryId: matchedCategory.categoryId,
      subcategoryId: matchedCategory.subcategoryId,
      date: row.date,
      notes: row.note || undefined,
      payee: row.payee,
      excludeFromReports: row.excludeFromReports,
      source: sourceForRow(row),
      sourceKey,
      adjustmentDirection,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const delta = importedType === 'adjustment'
      ? adjustmentDirection === 'decrease' ? -row.amount : row.amount
      : importedType === 'income' ? row.amount : -row.amount;
    addWalletDelta(wallet.id, delta);
    readyRowCount += 1;
    importedSourceRows += 1;
  }

  const transferMatches = (candidate: { row: TransactionCsvRow; wallet: Wallet }) =>
    transferCandidates.filter(other =>
      other.row !== candidate.row &&
      other.row.transferDirection &&
      candidate.row.transferDirection &&
      other.row.transferDirection !== candidate.row.transferDirection &&
      other.wallet.id !== candidate.wallet.id &&
      other.row.date && candidate.row.date &&
      toLocalDateKey(other.row.date) === toLocalDateKey(candidate.row.date) &&
      other.row.amount === candidate.row.amount,
    );

  const pairedTransferRows = new Set<TransactionCsvRow>();
  for (const candidate of transferCandidates) {
    if (pairedTransferRows.has(candidate.row)) continue;
    const matches = transferMatches(candidate);
    if (matches.length !== 1) continue;
    const reciprocal = transferMatches(matches[0]);
    if (reciprocal.length !== 1 || reciprocal[0].row !== candidate.row) continue;

    const other = matches[0];
    const outgoing = candidate.row.transferDirection === 'outgoing' ? candidate : other;
    const incoming = candidate.row.transferDirection === 'incoming' ? candidate : other;
    const sourceKey = outgoing.row.sourceKey && outgoing.row.sourceKey === incoming.row.sourceKey
      ? outgoing.row.sourceKey
      : `transaction-csv:transfer:${stableRowKey(outgoing.row)}:${stableRowKey(incoming.row)}`;
    pairedTransferRows.add(candidate.row);
    pairedTransferRows.add(other.row);
    if (!addDuplicateOrImport(sourceKey)) continue;

    const matchedCategory = categoryMatch(categories, outgoing.row);

    imported.push(normalizeTransaction({
      id: createEntityId('transaction'),
      type: 'transfer',
      amount: outgoing.row.amount,
      walletId: outgoing.wallet.id,
      destinationWalletId: incoming.wallet.id,
      date: outgoing.row.date,
      notes: [outgoing.row.note, incoming.row.note].filter(Boolean).join(' / ') || undefined,
      payee: outgoing.row.payee,
      categoryId: matchedCategory.categoryId,
      subcategoryId: matchedCategory.subcategoryId,
      fee: outgoing.row.fee,
      excludeFromReports: true,
      source: sourceForRow(outgoing.row),
      sourceKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    addWalletDelta(outgoing.wallet.id, -(outgoing.row.amount + (outgoing.row.fee || 0)));
    addWalletDelta(incoming.wallet.id, incoming.row.amount);
    strictTransferPairs += 1;
    readyRowCount += 2;
    importedSourceRows += 2;
  }

  const pairedTransferRowsByNumber = new Set(
    [...pairedTransferRows].map(row => row.rowNumber),
  );
  const reviewCandidateByNumber = new Map(
    transferCandidates
      .filter(candidate => !pairedTransferRows.has(candidate.row))
      .map(candidate => [candidate.row.rowNumber, candidate]),
  );

  for (const candidate of transferCandidates) {
    if (pairedTransferRows.has(candidate.row)) continue;
    const matches = transferMatches(candidate).filter(other => !pairedTransferRows.has(other.row));
    reviewRows.push({
      row: candidate.row,
      reviewReason: matches.length ? 'ambiguous' : 'unmatched',
      candidates: matches.map(match => match.row),
    });
  }

  const decisionByRowNumber = new Map(
    reviewDecisions.map(decision => [decision.rowNumber, decision]),
  );
  const reviewCandidateItems = new Map(
    reviewRows.map(item => [item.row.rowNumber, item]),
  );

  const addReviewedOrdinaryTransaction = (
    row: TransactionCsvRow,
    wallet: Wallet,
    type: 'income' | 'expense',
  ) => {
    const matchedCategory = categoryMatch(categories, row);
    const sourceKey = sourceKeyForRow(row);
    if (!addDuplicateOrImport(sourceKey)) return false;
    imported.push(normalizeTransaction({
      id: createEntityId('transaction'),
      type,
      amount: row.amount,
      walletId: wallet.id,
      categoryId: matchedCategory.categoryId,
      subcategoryId: matchedCategory.subcategoryId,
      date: row.date,
      notes: row.note || undefined,
      payee: row.payee,
      excludeFromReports: row.excludeFromReports,
      source: sourceForRow(row),
      sourceKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    addWalletDelta(wallet.id, type === 'income' ? row.amount : -row.amount);
    importedSourceRows += 1;
    return true;
  };

  const addReviewedTransfer = (
    row: TransactionCsvRow,
    otherWallet: Wallet,
    counterpart?: TransactionCsvRow,
  ) => {
    const currentWallet = walletForAccount(row.account);
    if (!currentWallet || currentWallet.id === otherWallet.id) return false;

    const outgoing = row.transferDirection === 'outgoing';
    const sourceWallet = outgoing ? currentWallet : otherWallet;
    const destinationWallet = outgoing ? otherWallet : currentWallet;
    const sourceKey = counterpart
      ? (() => {
          const outgoingRow = outgoing ? row : counterpart;
          const incomingRow = outgoing ? counterpart : row;
          return outgoingRow.sourceKey && outgoingRow.sourceKey === incomingRow.sourceKey
            ? outgoingRow.sourceKey
            : `transaction-csv:transfer:${stableRowKey(outgoingRow)}:${stableRowKey(incomingRow)}`;
        })()
      : row.sourceKey || `transaction-csv:transfer:manual:${stableRowKey(row)}:${otherWallet.id}`;

    if (!addDuplicateOrImport(sourceKey)) return false;
    imported.push(normalizeTransaction({
      id: createEntityId('transaction'),
      type: 'transfer',
      amount: row.amount,
      walletId: sourceWallet.id,
      destinationWalletId: destinationWallet.id,
      date: outgoing ? row.date : row.date,
      notes: [row.note, counterpart?.note].filter(Boolean).join(' / ') || undefined,
      payee: row.payee,
      categoryId: categoryMatch(categories, row).categoryId,
      subcategoryId: categoryMatch(categories, row).subcategoryId,
      fee: row.fee,
      excludeFromReports: true,
      source: sourceForRow(row),
      sourceKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    addWalletDelta(sourceWallet.id, -(row.amount + (row.fee || 0)));
    addWalletDelta(destinationWallet.id, row.amount);
    importedSourceRows += counterpart ? 2 : 1;
    manualTransferCount += 1;
    return true;
  };

  for (const item of reviewRows) {
    const rowNumber = item.row.rowNumber;
    if (resolvedReviewRowNumbers.has(rowNumber) || skippedReviewRowNumbers.has(rowNumber)) continue;

    const decision = decisionByRowNumber.get(rowNumber);
    if (!decision) continue;

    if (decision.action === 'skip') {
      skippedReviewRowNumbers.add(rowNumber);
      continue;
    }

    const candidate = reviewCandidateByNumber.get(rowNumber);
    if (!candidate) continue;

    if (decision.action === 'income' || decision.action === 'expense') {
      if (addReviewedOrdinaryTransaction(candidate.row, candidate.wallet, decision.action)) {
        resolvedReviewRowNumbers.add(rowNumber);
      } else {
        resolvedReviewRowNumbers.add(rowNumber);
      }
      continue;
    }

    const counterpart = decision.counterpartRowNumber === undefined
      ? undefined
      : reviewCandidateByNumber.get(decision.counterpartRowNumber);
    if (counterpart) {
      const counterpartItem = reviewCandidateItems.get(counterpart.row.rowNumber);
      const validCandidate = Boolean(
        counterpartItem &&
        !pairedTransferRowsByNumber.has(counterpart.row.rowNumber) &&
        !resolvedReviewRowNumbers.has(counterpart.row.rowNumber) &&
        !skippedReviewRowNumbers.has(counterpart.row.rowNumber) &&
        !decisionByRowNumber.has(counterpart.row.rowNumber) &&
        item.candidates.some(match => match.rowNumber === counterpart.row.rowNumber),
      );
      if (validCandidate) {
        addReviewedTransfer(candidate.row, counterpart.wallet, counterpart.row);
        resolvedReviewRowNumbers.add(rowNumber);
        resolvedReviewRowNumbers.add(counterpart.row.rowNumber);
        continue;
      }
    }

    if (decision.walletReference) {
      const otherWallet = walletForReference(decision.walletReference);
      if (otherWallet && otherWallet.id !== candidate.wallet.id) {
        addReviewedTransfer(candidate.row, otherWallet);
        resolvedReviewRowNumbers.add(rowNumber);
      }
    }
  }

  for (const item of reviewRows) {
    const rowNumber = item.row.rowNumber;
    if (resolvedReviewRowNumbers.has(rowNumber)) continue;
    const reviewReason = item.reviewReason === 'ambiguous'
      ? 'ambiguous transfer match; no unique opposite row was selected'
      : 'unmatched transfer; no opposite row with the same date, amount, and distinct wallet was found';
    const reviewRow = {
      ...item.row,
      reviewReason,
      warning: skippedReviewRowNumbers.has(rowNumber)
        ? 'Skipped during transfer review.'
        : reviewReason,
    };
    if (skippedReviewRowNumbers.has(rowNumber)) {
      unsupportedRows.push(reviewRow);
      continue;
    }
    warnings.push(`Row ${reviewRow.rowNumber}: ${reviewReason}.`);
    unsupportedRows.push(reviewRow);
    if (item.reviewReason === 'ambiguous') ambiguousTransferRows.push(reviewRow);
    else unmatchedTransferRows.push(reviewRow);
  }

  if (unmappedCategoryRows) {
    warnings.push(`${unmappedCategoryRows} row(s) use ${unmappedCategoryNames.size} category name(s) not found in Caizen; they will remain uncategorized.`);
  }
  if (strictTransferPairs) warnings.push(`${strictTransferPairs} conservative transfer pair(s) were matched.`);
  if (unmatchedTransferRows.length) warnings.push(`${unmatchedTransferRows.length} transfer row(s) were left unmatched for review.`);
  if (ambiguousTransferRows.length) warnings.push(`${ambiguousTransferRows.length} transfer row(s) were left ambiguous for review.`);
  if (unsupportedRows.length) warnings.push(`${unsupportedRows.length} row(s) need review before import.`);
  if (currencyMismatches.length) warnings.push(`${currencyMismatches.length} row(s) use a currency different from ${baseCurrency}.`);
  if (duplicateSourceKeys.length) warnings.push(`${duplicateSourceKeys.length} duplicate row(s) were detected.`);

  const batchKey = imported.map(item => item.sourceKey).join(',').slice(0, 180);
  const adjustments: Transaction[] = [];
  for (const [walletId, net] of walletDeltas.entries()) {
    if (net === 0) continue;
    adjustments.push(createAdjustmentTransaction(walletId, -net, {
      date: imported[0]?.date,
      notes: 'Transaction CSV import opening reconciliation',
      source: 'transaction-csv',
      sourceKey: `transaction-csv:opening:${walletId}:${batchKey}`,
    }));
  }

  const usedWalletIds = new Set(
    imported
      .flatMap(transaction => [transaction.walletId, transaction.destinationWalletId])
      .filter((walletId): walletId is string => Boolean(walletId)),
  );
  const committedNewWallets = newWallets.filter(wallet => usedWalletIds.has(wallet.id));
  profile.wallets = [...profile.wallets, ...committedNewWallets];
  profile.transactions = [...existingTransactions, ...adjustments, ...imported];

  const unresolvedRows = unmatchedTransferRows.length +
    ambiguousTransferRows.length +
    unsupportedRows.filter(row => !row.reviewReason).length +
    currencyMismatches.length;
  const transferCount = strictTransferPairs + manualTransferCount;
  const summary: TransactionCsvImportSummary = {
    sourceRows: parsed.rows.length,
    importedTransactions: imported.length,
    importedSourceRows,
    transfers: transferCount,
    skippedRows: skippedReviewRowNumbers.size,
    unresolvedRows,
    duplicates: duplicateSourceKeys.length,
    reconciliationAdjustments: adjustments.length,
  };

  return {
    profile,
    transactions: [...adjustments, ...imported],
    newWallets: committedNewWallets,
    warnings,
    duplicateSourceKeys,
    unsupportedRows,
    currencyMismatches,
    importedCount: imported.length,
    readyRowCount,
    reviewRowCount: unsupportedRows.length + currencyMismatches.length,
    strictTransferPairs,
    unmatchedTransferRows,
    ambiguousTransferRows,
    mappedCategoryRows,
    unmappedCategoryRows,
    reviewRows,
    reviewTotalRowCount: reviewRows.length,
    resolvedReviewRows: resolvedReviewRowNumbers.size,
    skippedReviewRows: skippedReviewRowNumbers.size,
    importedSourceRows,
    manualTransferCount,
    transferCount,
    reconciliationAdjustmentCount: adjustments.length,
    summary,
  };
}
