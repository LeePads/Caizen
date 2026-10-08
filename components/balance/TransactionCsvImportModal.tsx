'use client';

import { useMemo, useRef, useState, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import {
  buildTransactionCsvImport,
  parseTransactionCsv,
  type TransactionCsvImportSummary,
  type TransactionCsvParseResult,
  type TransactionCsvReviewAction,
  type TransactionCsvReviewDecision,
  type TransactionCsvReviewItem,
  type TransactionCsvWalletReference,
} from '@/lib/finance/transaction-csv-import';
import { prepareImport } from '@/lib/storage/import-integrity';
import { restoreDataOnlyImport } from '@/lib/storage/backup-repository';
import type { Profile, Wallet } from '@/lib/types';

type Props = {
  profile: Profile;
  wallets: Wallet[];
  baseCurrency: string;
  onClose: () => void;
  onImported: (summary: TransactionCsvImportSummary) => void;
};

type WalletChoice = {
  value: string;
  label: string;
};

const actionLabels: Record<TransactionCsvReviewAction, string> = {
  transfer: 'Match as Transfer',
  income: 'Treat as Income',
  expense: 'Treat as Expense',
  skip: 'Skip',
};

const formatReviewDate = (date: Date | null) =>
  date ? date.toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Invalid date';

const formatReviewAmount = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const walletReferenceValue = (reference: TransactionCsvWalletReference) =>
  reference.kind === 'wallet'
    ? `wallet:${reference.walletId}`
    : `account:${encodeURIComponent(reference.account)}`;

const walletReferenceFromValue = (value: string): TransactionCsvWalletReference | undefined => {
  if (value.startsWith('wallet:')) {
    return { kind: 'wallet', walletId: value.slice('wallet:'.length) };
  }
  if (value.startsWith('account:')) {
    return {
      kind: 'account',
      account: decodeURIComponent(value.slice('account:'.length)),
    };
  }
  return undefined;
};

function Summary({ label, value, tone }: { label: string; value: string | number; tone?: 'warn' | 'good' }) {
  return (
    <div className="rounded-2xl border border-border/55 bg-background/45 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={tone === 'warn' ? 'mt-1 text-sm font-bold text-amber-700 dark:text-amber-300' : tone === 'good' ? 'mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-300' : 'mt-1 text-sm font-bold'}>{value}</p>
    </div>
  );
}

function ReviewRowDetails({ item, currency }: { item: TransactionCsvReviewItem; currency: string }) {
  const { row } = item;
  return (
    <div className="mt-3 grid min-w-0 gap-x-3 gap-y-2 text-xs text-muted-foreground @min-[30rem]/balance-form:grid-cols-2 @min-[44rem]/balance-form:grid-cols-4">
      <span className="break-words">{formatReviewDate(row.date)}</span>
      <span className="break-words">Amount: {formatReviewAmount(row.amount, currency)}</span>
      <span className="break-words">Direction: {row.transferDirection === 'incoming' ? 'Incoming' : 'Outgoing'}</span>
      <span className="break-words">Wallet: {row.account || 'Unknown account'}</span>
      <span className="break-words">Category: {row.categoryName || 'Uncategorized'}</span>
      <span className="break-words @min-[30rem]/balance-form:col-span-2 @min-[44rem]/balance-form:col-span-4">Note: {row.note || 'No note'}</span>
    </div>
  );
}

export default function TransactionCsvImportModal({
  profile,
  wallets,
  baseCurrency,
  onClose,
  onImported,
}: Props) {
  const [parsed, setParsed] = useState<TransactionCsvParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [reviewDecisions, setReviewDecisions] = useState<TransactionCsvReviewDecision[]>([]);
  const [transferTargets, setTransferTargets] = useState<Record<number, string>>({});
  const [reviewPage, setReviewPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [completedSummary, setCompletedSummary] = useState<TransactionCsvImportSummary | null>(null);

  const reviewPlan = useMemo(
    () => parsed ? buildTransactionCsvImport(profile, parsed, mapping, baseCurrency) : null,
    [profile, parsed, mapping, baseCurrency],
  );

  const build = useMemo(
    () => parsed ? buildTransactionCsvImport(profile, parsed, mapping, baseCurrency, reviewDecisions) : null,
    [profile, parsed, mapping, baseCurrency, reviewDecisions],
  );

  const reviewPageSize = 25;
  const reviewPageCount = reviewPlan ? Math.max(1, Math.ceil(reviewPlan.reviewRows.length / reviewPageSize)) : 1;
  const safeReviewPage = Math.min(reviewPage, reviewPageCount);
  const visibleReviewRows = reviewPlan
    ? reviewPlan.reviewRows.slice((safeReviewPage - 1) * reviewPageSize, safeReviewPage * reviewPageSize)
    : [];

  const walletChoices = useMemo<WalletChoice[]>(() => {
    if (!parsed) return [];
    const choices: WalletChoice[] = wallets.map(wallet => ({
      value: walletReferenceValue({ kind: 'wallet', walletId: wallet.id }),
      label: wallet.name,
    }));
    const existingValues = new Set(choices.map(choice => choice.value));
    parsed.accounts.forEach(account => {
      if ((mapping[account] || 'new') !== 'new') return;
      const reference: TransactionCsvWalletReference = { kind: 'account', account };
      const value = walletReferenceValue(reference);
      if (existingValues.has(value)) return;
      existingValues.add(value);
      choices.push({ label: `${account} (new wallet)`, value });
    });
    return choices;
  }, [parsed, wallets, mapping]);

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setCompletedSummary(null);
    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Choose a CSV file smaller than 10 MiB. Split larger histories into separate files.');
      }
      const result = parseTransactionCsv(await file.text());
      const nextMapping: Record<string, string> = {};
      result.accounts.forEach(account => {
        const existing = wallets.find(wallet => wallet.name.trim().toLowerCase() === account.trim().toLowerCase());
        nextMapping[account] = existing?.id || 'new';
      });
      setFileName(file.name);
      setParsed(result);
      setMapping(nextMapping);
      setReviewDecisions([]);
      setTransferTargets({});
      setReviewPage(1);
    } catch (caught) {
      setParsed(null);
      setError(caught instanceof Error ? caught.message : 'The CSV file could not be read. Check its format or choose another file.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const decisionForRow = (rowNumber: number) =>
    reviewDecisions.find(decision => decision.rowNumber === rowNumber || decision.counterpartRowNumber === rowNumber);

  const clearDecisionForRow = (rowNumber: number) => {
    setReviewDecisions(current => current.filter(decision => decision.rowNumber !== rowNumber && decision.counterpartRowNumber !== rowNumber));
    setTransferTargets(current => {
      const next = { ...current };
      delete next[rowNumber];
      return next;
    });
  };

  const saveDirectDecision = (rowNumber: number, action: 'income' | 'expense' | 'skip') => {
    clearDecisionForRow(rowNumber);
    setReviewDecisions(current => [...current, { rowNumber, action }]);
  };

  const candidateIsClaimed = (rowNumber: number, ownerRowNumber: number) =>
    reviewDecisions.some(decision =>
      decision.rowNumber !== ownerRowNumber &&
      (decision.rowNumber === rowNumber || decision.counterpartRowNumber === rowNumber),
    );

  const applyTransferDecision = (item: TransactionCsvReviewItem) => {
    const target = transferTargets[item.row.rowNumber];
    if (!target) {
      setError(`Choose a counterpart or wallet for row ${item.row.rowNumber}.`);
      return;
    }

    const decision: TransactionCsvReviewDecision = target.startsWith('row:')
      ? {
          rowNumber: item.row.rowNumber,
          action: 'transfer',
          counterpartRowNumber: Number(target.slice('row:'.length)),
        }
      : {
          rowNumber: item.row.rowNumber,
          action: 'transfer',
          walletReference: walletReferenceFromValue(target),
        };

    if (decision.walletReference === undefined && decision.counterpartRowNumber === undefined) {
      setError(`The transfer target for row ${item.row.rowNumber} is invalid.`);
      return;
    }
    clearDecisionForRow(item.row.rowNumber);
    setReviewDecisions(current => [...current, decision]);
    setError('');
  };

  const commit = async () => {
    if (!build || busyRef.current || completedSummary) return;
    const hasImportWork = build.importedCount > 0 || build.duplicateSourceKeys.length > 0;
    if (!hasImportWork) {
      setError('No rows are ready to import. Review a transfer row or choose a different CSV file.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const prepared = prepareImport({
        format: 'caizen-data',
        version: 3,
        data: {
          profiles: [build.profile],
          currentProfileId: build.profile.id,
        },
      }, [profile.id]);
      if (!prepared.report.canImport) {
        throw new Error(prepared.report.warnings[0] || 'The imported transaction data failed validation.');
      }
      await restoreDataOnlyImport(prepared, 'merge');
      setCompletedSummary(build.summary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import could not be completed. Review your history before retrying; recovery is available in Backup Manager.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const finish = () => {
    if (completedSummary) onImported(completedSummary);
    else onClose();
  };

  return (
    <CaizenFormDialog
      panelClassName="balance-form @container/balance-form"
      title="Import transaction CSV"
      description="Review the file and wallet matches before importing."
      onClose={finish}
      onBeforeClose={() => !busyRef.current}
      maxWidthClass="max-w-6xl"
      bodyClassName="max-h-[calc(88dvh-5rem)] overflow-y-auto"
    >
      {completedSummary ? (
        <div className="space-y-5" role="status" aria-live="polite">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <h2 className="text-emerald-800 dark:text-emerald-200 text-section-title">Transaction history imported</h2>
            <p className="mt-1 text-sm text-muted-foreground">The source CSV was not modified. Skipped rows and rows still needing review were not imported.</p>
          </div>
          <div className="grid gap-3 @min-[30rem]/balance-form:grid-cols-2 @min-[44rem]/balance-form:grid-cols-4">
            <Summary label="Source rows" value={completedSummary.sourceRows.toLocaleString()} />
            <Summary label="Imported transactions" value={completedSummary.importedTransactions.toLocaleString()} tone="good" />
            <Summary label="Transfers" value={completedSummary.transfers.toLocaleString()} />
            <Summary label="Imported source rows" value={completedSummary.importedSourceRows.toLocaleString()} />
            <Summary label="Skipped" value={completedSummary.skippedRows.toLocaleString()} />
            <Summary label="Unresolved" value={completedSummary.unresolvedRows.toLocaleString()} tone={completedSummary.unresolvedRows ? 'warn' : 'good'} />
            <Summary label="Duplicates" value={completedSummary.duplicates.toLocaleString()} />
            <Summary label="Reconciliation adjustments" value={completedSummary.reconciliationAdjustments.toLocaleString()} />
          </div>
          <div className="flex justify-end border-t border-border/55 pt-4">
            <Button type="button" onClick={finish}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            Imported history is matched to your existing wallet balances without changing those balances.
          </div>

          <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-5 text-center">
            <p className="break-words text-sm font-bold">{fileName || 'Import transactions'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Choose a CSV file, then review its transactions and wallet matches before importing.</p>
            <label className="mt-4 inline-flex cursor-pointer items-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
              Choose CSV file
              <input className="sr-only" type="file" accept=".csv,text/csv" onChange={selectFile} disabled={busy} />
            </label>
            <p className="mt-3 text-xs text-muted-foreground">Your source file will never be modified.</p>
          </div>
          <details className="rounded-2xl border border-border/55 bg-background/30 p-4 text-sm">
            <summary className="cursor-pointer font-bold">CSV requirements</summary>
            <p className="mt-2 text-xs text-muted-foreground">Required columns are Amount, Account, and Date. Event is optional; direction comes from the signed Amount unless a transfer marker is present. Currency must match {baseCurrency}.</p>
          </details>

          {parsed ? (
            <>
              <div className="grid min-w-0 gap-3 @min-[30rem]/balance-form:grid-cols-2 @min-[44rem]/balance-form:grid-cols-4">
                <Summary label="Rows" value={parsed.rows.length.toLocaleString()} />
                <Summary label="Accounts" value={parsed.accounts.length.toLocaleString()} />
                <Summary label="Currencies" value={parsed.currencies.join(', ') || 'Not provided'} />
                <Summary label="Categories" value={parsed.categories.length.toLocaleString()} />
              </div>

              <div className="rounded-2xl border border-border/55 bg-background/35 p-4 text-sm">
                <p><strong>{parsed.incomeCandidates.toLocaleString()}</strong> incoming candidates · <strong>{parsed.expenseCandidates.toLocaleString()}</strong> outgoing candidates · <strong>{parsed.transferCandidates.toLocaleString()}</strong> transfer rows</p>
                <p className="mt-1 text-xs text-muted-foreground">Blank Event values are accepted. Transfer rows are paired only when the date, amount, direction, and distinct wallets identify one mutual match.</p>
              </div>

              <div className="space-y-3">
                <h3 className="text-card-title">Match accounts to wallets</h3>
                {parsed.accounts.map(account => (
                  <label key={account} className="grid gap-2 @min-[30rem]/balance-form:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
                    <span className="text-sm font-semibold">{account}</span>
                    <select className="control-input" value={mapping[account] || 'new'} onChange={event => setMapping(current => ({ ...current, [account]: event.target.value }))}>
                      <option value="new">Create new wallet</option>
                      {wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>

              {build ? (
                <div className="space-y-3 rounded-2xl border border-border/55 bg-background/35 p-4">
                  <div className="grid gap-2 text-sm @min-[38rem]/balance-form:grid-cols-4">
                    <p><strong>{build.readyRowCount.toLocaleString()}</strong> ready</p>
                    <p><strong>{Math.max(0, build.reviewTotalRowCount - build.resolvedReviewRows - build.skippedReviewRows).toLocaleString()}</strong> needs review</p>
                    <p><strong>{build.resolvedReviewRows.toLocaleString()}</strong> resolved</p>
                    <p><strong>{build.skippedReviewRows.toLocaleString()}</strong> skipped</p>
                  </div>
                  <div className="grid gap-2 text-xs text-muted-foreground @min-[36rem]/balance-form:grid-cols-3">
                    <p><strong>{build.importedCount.toLocaleString()}</strong> new transactions</p>
                    <p><strong>{build.transferCount.toLocaleString()}</strong> transfers</p>
                    <p><strong>{build.duplicateSourceKeys.length.toLocaleString()}</strong> duplicates</p>
                  </div>
                  <div className="grid gap-2 text-xs text-muted-foreground @min-[30rem]/balance-form:grid-cols-2">
                    <p><strong>{build.mappedCategoryRows.toLocaleString()}</strong> category mappings · <strong>{build.unmappedCategoryRows.toLocaleString()}</strong> uncategorized rows</p>
                    <p><strong>{build.unmatchedTransferRows.length.toLocaleString()}</strong> unmatched · <strong>{build.ambiguousTransferRows.length.toLocaleString()}</strong> ambiguous remaining</p>
                  </div>
                  {build.reviewTotalRowCount ? <p className="text-sm text-amber-700 dark:text-amber-300">Ready rows can be imported now. Rows needing review are left out until you choose how to import them.</p> : null}
                </div>
              ) : null}

              {reviewPlan?.reviewRows.length ? (
                <section className="space-y-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4" aria-labelledby="transaction-csv-review-title">
                  <div>
                    <h3 id="transaction-csv-review-title" className="text-card-title">Transfer review</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Choose how to import each transfer row. To match two rows as a transfer, review the rows with the same date and amount in different wallets.</p>
                  </div>
                  <div className="space-y-3">
                    {visibleReviewRows.map(item => {
                      const decision = decisionForRow(item.row.rowNumber);
                      const isCompleted = Boolean(decision);
                      const selectedTarget = transferTargets[item.row.rowNumber] || '';
                      const currentMapping = mapping[item.row.account] || 'new';
                      const currentWalletValue = currentMapping === 'new'
                        ? walletReferenceValue({ kind: 'account', account: item.row.account })
                        : walletReferenceValue({ kind: 'wallet', walletId: currentMapping });
                      const availableWalletChoices = walletChoices.filter(choice => choice.value !== currentWalletValue);
                      const availableCandidates = item.candidates.filter(candidate => !candidateIsClaimed(candidate.rowNumber, item.row.rowNumber));

                      return (
                        <article
                          key={item.row.rowNumber}
                          className={`grid min-w-0 gap-4 rounded-2xl border border-border/55 bg-background/55 p-4 @min-[44rem]/balance-form:grid-cols-[minmax(0,1fr)_minmax(18rem,25rem)] ${isCompleted ? '@min-[44rem]/balance-form:items-center' : ''}`}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold">Row {item.row.rowNumber}</p>
                              <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                                {item.reviewReason === 'ambiguous' ? 'Ambiguous transfer' : 'Unmatched transfer'}
                              </span>
                            </div>
                            <ReviewRowDetails item={item} currency={baseCurrency} />
                          </div>

                          <div className="min-w-0 border-t border-border/45 pt-3 @min-[44rem]/balance-form:border-l @min-[44rem]/balance-form:border-t-0 @min-[44rem]/balance-form:pl-4 @min-[44rem]/balance-form:pt-0">
                            {isCompleted ? (
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="rounded-full bg-muted px-2 py-1 text-xs font-bold">{decision?.action === 'transfer' ? 'Transfer' : decision ? actionLabels[decision.action] : 'Resolved'}</span>
                                <Button type="button" size="sm" variant="ghost" onClick={() => clearDecisionForRow(item.row.rowNumber)} aria-label={`Change review decision for row ${item.row.rowNumber}`}>Change</Button>
                              </div>
                            ) : (
                              <label className="block text-xs font-bold text-muted-foreground">
                                Review action
                                <select
                                  className="control-input mt-1 w-full"
                                  value={selectedTarget ? 'transfer' : ''}
                                  aria-label={`Choose review action for row ${item.row.rowNumber}`}
                                  onChange={event => {
                                    const action = event.target.value as TransactionCsvReviewAction;
                                    if (action === 'income' || action === 'expense' || action === 'skip') saveDirectDecision(item.row.rowNumber, action);
                                    else if (action === 'transfer') {
                                      setTransferTargets(current => ({ ...current, [item.row.rowNumber]: '' }));
                                      setError('');
                                    }
                                  }}
                                >
                                  <option value="">Choose action</option>
                                  <option value="transfer">Match as Transfer</option>
                                  <option value="income">Treat as Income</option>
                                  <option value="expense">Treat as Expense</option>
                                  <option value="skip">Skip</option>
                                </select>
                              </label>
                            )}
                          </div>

                          {!isCompleted && item.reviewReason === 'ambiguous' ? (
                            <div className="min-w-0 space-y-2 border-t border-border/45 pt-3 @min-[44rem]/balance-form:col-span-2">
                              <p className="text-label text-muted-foreground">Matching transfer rows</p>
                              {availableCandidates.length ? availableCandidates.map(candidate => {
                                const value = `row:${candidate.rowNumber}`;
                                return (
                                  <button key={candidate.rowNumber} type="button" className={`block w-full min-w-0 rounded-xl border p-3 text-left text-xs ${selectedTarget === value ? 'border-primary bg-primary/10' : 'border-border/55 bg-background/35'}`} aria-pressed={selectedTarget === value} onClick={() => setTransferTargets(current => ({ ...current, [item.row.rowNumber]: value }))}>
                                    <span className="block break-words font-bold">Row {candidate.rowNumber}</span>
                                    <span className="mt-1 grid min-w-0 gap-x-3 gap-y-1 text-muted-foreground @min-[30rem]/balance-form:grid-cols-2 @min-[44rem]/balance-form:grid-cols-4">
                                      <span className="break-words">{formatReviewDate(candidate.date)}</span>
                                      <span className="break-words">{formatReviewAmount(candidate.amount, baseCurrency)}</span>
                                      <span className="break-words">Wallet: {candidate.account || 'Unknown'}</span>
                                      <span className="break-words">Category: {candidate.categoryName || 'Uncategorized'}</span>
                                      <span className="break-words @min-[30rem]/balance-form:col-span-2 @min-[44rem]/balance-form:col-span-4">Note: {candidate.note || 'No note'}</span>
                                    </span>
                                  </button>
                                );
                              }) : <p className="text-xs text-muted-foreground">No unmatched transfer rows remain. Choose another review action.</p>}
                              <Button type="button" size="sm" onClick={() => applyTransferDecision(item)} disabled={!selectedTarget.startsWith('row:')}>Confirm transfer match</Button>
                            </div>
                          ) : null}

                          {!isCompleted && item.reviewReason === 'unmatched' ? (
                            <div className="min-w-0 space-y-2 border-t border-border/45 pt-3 @min-[44rem]/balance-form:col-span-2 sm:flex sm:items-end sm:gap-3 sm:space-y-0">
                              <label className="min-w-0 flex-1 text-xs font-bold text-muted-foreground">
                                Other wallet
                                <select className="control-input mt-1 w-full" value={selectedTarget} onChange={event => setTransferTargets(current => ({ ...current, [item.row.rowNumber]: event.target.value }))} aria-label={`Choose other wallet for row ${item.row.rowNumber}`}>
                                  <option value="">Choose wallet</option>
                                  {availableWalletChoices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                                </select>
                              </label>
                              <Button type="button" size="sm" className="w-full sm:w-auto" onClick={() => applyTransferDecision(item)} disabled={!selectedTarget || selectedTarget.startsWith('row:')}>Confirm transfer</Button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                  {reviewPlan.reviewRows.length > reviewPageSize ? (
                    <div className="flex flex-col gap-2 border-t border-border/45 pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <p>Showing {(safeReviewPage - 1) * reviewPageSize + 1}–{Math.min(safeReviewPage * reviewPageSize, reviewPlan.reviewRows.length)} of {reviewPlan.reviewRows.length} needing review</p>
                      <div className="flex items-center gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setReviewPage(page => Math.max(1, page - 1))} disabled={safeReviewPage === 1}>Previous</Button>
                        <span className="min-w-20 text-center font-semibold">Page {safeReviewPage} of {reviewPageCount}</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => setReviewPage(page => Math.min(reviewPageCount, page + 1))} disabled={safeReviewPage === reviewPageCount}>Next</Button>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}

          {error ? <p className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert">{error}</p> : null}

          <div className="flex flex-col-reverse gap-2 border-t border-border/55 pt-4 @min-[30rem]/balance-form:flex-row @min-[30rem]/balance-form:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="button" onClick={() => void commit()} disabled={!build || busy || (build.importedCount === 0 && build.duplicateSourceKeys.length === 0)}>{busy ? 'Importing transactions…' : `Import ${build?.importedCount || 0} new transactions`}</Button>
          </div>
        </div>
      )}
    </CaizenFormDialog>
  );
}
