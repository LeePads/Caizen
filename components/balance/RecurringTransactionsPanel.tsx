import { useEffect, useMemo, useState } from 'react';
import { Check, MoreHorizontal, Pause, Pencil, Play, Plus, SkipForward, Trash2 } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { CategoryIcon } from '@/components/balance/CategoryIcon';
import RecurringOccurrenceModal from '@/components/balance/RecurringOccurrenceModal';
import RecurringTransactionModal from '@/components/balance/RecurringTransactionModal';
import { CaizenBottomSheet } from '@/components/native/android-design';
import { Button } from '@/components/ui/button';
import { formatPHP } from '@/lib/currency';
import {
  getRecurringOccurrenceState,
  type RecurringOccurrenceState,
} from '@/lib/finance/recurring-transactions';
import type {
  BalanceProjectionRow,
  CurrencyCode,
  FinancialCategory,
  RecurringActionResult,
  RecurringOccurrenceOverrides,
  Wallet,
} from '@/lib/types';

type RecurringTransactionsPanelProps = {
  rows: BalanceProjectionRow[];
  wallets: Wallet[];
  categories: FinancialCategory[];
  hidden: boolean;
  currency?: CurrencyCode;
  androidPresentation?: boolean;
  initialRow?: BalanceProjectionRow | null;
  onSave: (row: BalanceProjectionRow) => void | boolean;
  onDelete: (row: BalanceProjectionRow) => void;
  onToggleActive: (row: BalanceProjectionRow) => void;
  onRecord: (rowId: string, overrides: RecurringOccurrenceOverrides) => RecurringActionResult;
  onResolve: (rowId: string, action: 'skip' | 'already-recorded') => RecurringActionResult;
  onInitialRowConsumed?: () => void;
};

const frequencyLabel = (frequency?: string) =>
  frequency === 'weekly' ? 'Weekly' : frequency === 'yearly' ? 'Yearly' : 'Monthly';

const stateLabel: Record<RecurringOccurrenceState, string> = {
  paused: 'Paused',
  ended: 'Ended',
  overdue: 'Overdue',
  'due-today': 'Due today',
  upcoming: 'Upcoming',
};

const stateClass: Record<RecurringOccurrenceState, string> = {
  paused: 'text-muted-foreground',
  ended: 'text-muted-foreground',
  overdue: 'text-destructive',
  'due-today': 'text-primary',
  upcoming: 'text-muted-foreground',
};

export default function RecurringTransactionsPanel({
  rows,
  wallets,
  categories,
  hidden,
  currency,
  androidPresentation = false,
  initialRow = null,
  onSave,
  onDelete,
  onToggleActive,
  onRecord,
  onResolve,
  onInitialRowConsumed,
}: RecurringTransactionsPanelProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorRow, setEditorRow] = useState<BalanceProjectionRow | null>(null);
  const [occurrenceRow, setOccurrenceRow] = useState<BalanceProjectionRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<BalanceProjectionRow | null>(null);
  const [actionRow, setActionRow] = useState<BalanceProjectionRow | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!initialRow) return;
    setEditorRow(initialRow);
    setEditorOpen(true);
    onInitialRowConsumed?.();
  }, [initialRow, onInitialRowConsumed]);

  const recurringRows = useMemo(
    () => rows
      .filter(row => Boolean(row.recurrence))
      .sort((left, right) => (left.recurrence?.nextDueDateKey || '').localeCompare(right.recurrence?.nextDueDateKey || '')),
    [rows],
  );
  const incomeRows = recurringRows.filter(row => row.type === 'income');
  const expenseRows = recurringRows.filter(row => row.type === 'expense');

  const runResolve = (row: BalanceProjectionRow, action: 'skip' | 'already-recorded') => {
    const result = onResolve(row.id, action);
    if (!result.ok) setActionError(result.error || 'The due transaction could not be updated. Review its schedule, then try again.');
    else setActionError('');
  };

  const renderRow = (row: BalanceProjectionRow) => {
    const recurrence = row.recurrence;
    if (!recurrence) return null;
    const state = getRecurringOccurrenceState(row) || 'upcoming';
    const wallet = wallets.find(item => item.id === recurrence.walletId);
    const category = categories.find(item => item.id === recurrence.categoryId);
    const subcategory = category?.subcategories.find(item => item.id === recurrence.subcategoryId);
    const classification = subcategory ? `${category?.name} › ${subcategory.name}` : category?.name || 'Uncategorized';

    return (
      <article key={row.id} className="@container/recurring min-w-0 border-b border-border/55 py-4 last:border-0">
        <div className="flex min-w-0 flex-col gap-3 @min-[36rem]/recurring:flex-row @min-[36rem]/recurring:items-start @min-[36rem]/recurring:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-card-title">{row.label || 'Untitled recurring transaction'}</h3>
              <span className={`text-xs font-bold ${stateClass[state]}`}>{stateLabel[state]}</span>
            </div>
            <p className="mt-1 flex items-start gap-2 break-words text-xs text-muted-foreground">
              <CategoryIcon categoryIconId={category?.icon} subcategoryIconId={subcategory?.icon} size="xs" containerClassName="h-6 w-6 rounded-md" />
              {frequencyLabel(recurrence.frequency)} · {wallet?.name || 'Wallet needs attention'} · {classification}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Next due {recurrence.nextDueDateKey}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className={`min-w-0 break-words text-lg font-bold tabular-nums ${row.type === 'income' ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>
              {hidden ? '••••••' : `${row.type === 'income' ? '+' : '−'}${formatPHP(Number(row.amount || 0))}`}
            </span>
            {androidPresentation ? (
              <Button type="button" size="icon" variant="ghost" className="size-11" onClick={() => setActionRow(row)} aria-label={`Actions for recurring transaction ${row.label}`}>
                <MoreHorizontal className="size-5" />
              </Button>
            ) : (
              <>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setEditorRow(row); setEditorOpen(true); }} aria-label={`Edit recurring transaction ${row.label}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteRow(row)} aria-label={`Delete recurring transaction ${row.label}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/45 pt-3">
          {state === 'overdue' || state === 'due-today' ? (
            <>
              <Button type="button" size="sm" onClick={() => setOccurrenceRow(row)}>
                <Check className="mr-1.5 h-4 w-4" /> Record transaction
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => runResolve(row, 'skip')}>
                <SkipForward className="mr-1.5 h-4 w-4" /> Skip this date
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => runResolve(row, 'already-recorded')}>
                Already recorded
              </Button>
            </>
          ) : null}
          {state === 'upcoming' ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setOccurrenceRow(row)}>
              Record early
            </Button>
          ) : null}
          {state !== 'ended' ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onToggleActive(row)}>
              {row.active === false ? <Play className="mr-1.5 h-4 w-4" /> : <Pause className="mr-1.5 h-4 w-4" />}
              {row.active === false ? 'Resume' : 'Pause'}
            </Button>
          ) : null}
        </div>
      </article>
    );
  };

  const renderGroup = (title: string, groupRows: BalanceProjectionRow[]) => (
    <section>
      <h3 className="text-card-title">{title}</h3>
      <div className="mt-3 space-y-3">
        {groupRows.length ? groupRows.map(renderRow) : (
          <p className="rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
            No recurring {title.toLowerCase()} yet.
          </p>
        )}
      </div>
    </section>
  );

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-section-title">Recurring transactions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Record each payment or income when it happens. Skip and Already recorded move the schedule forward without changing balances.</p>
          </div>
          <Button type="button" onClick={() => { setEditorRow(null); setEditorOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add recurring transaction
          </Button>
        </div>
        {actionError ? <p className="text-sm font-semibold text-destructive" role="alert">{actionError}</p> : null}
        <div className="space-y-6">
          {renderGroup('Income', incomeRows)}
          {renderGroup('Expenses', expenseRows)}
        </div>
      </div>

      {actionRow ? (
        <CaizenBottomSheet
          open
          title={actionRow.label || 'Recurring transaction'}
          description="Recurring transaction actions"
          onClose={() => setActionRow(null)}
        >
          <div className="android-balance-action-list">
            <button
              type="button"
              className="android-balance-action"
              onClick={() => {
                setActionRow(null);
                setEditorRow(actionRow);
                setEditorOpen(true);
              }}
            >
              <Pencil className="size-5 shrink-0" aria-hidden="true" />
              <span className="text-left font-bold">Edit recurring transaction</span>
            </button>
            {actionRow.recurrence && getRecurringOccurrenceState(actionRow) !== 'ended' ? (
              <button
                type="button"
                className="android-balance-action"
                onClick={() => {
                  setActionRow(null);
                  onToggleActive(actionRow);
                }}
              >
                {actionRow.active === false ? <Play className="size-5 shrink-0" aria-hidden="true" /> : <Pause className="size-5 shrink-0" aria-hidden="true" />}
                <span className="text-left font-bold">{actionRow.active === false ? 'Resume' : 'Pause'}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="android-balance-action android-balance-action-destructive"
              onClick={() => {
                setActionRow(null);
                setDeleteRow(actionRow);
              }}
            >
              <Trash2 className="size-5 shrink-0" aria-hidden="true" />
              <span className="text-left font-bold">Delete recurring transaction</span>
            </button>
          </div>
        </CaizenBottomSheet>
      ) : null}

      {editorOpen ? (
        <RecurringTransactionModal
          row={editorRow}
          wallets={wallets}
          categories={categories}
          hideBalances={hidden}
          currency={currency}
          onSave={row => onSave(row)}
          onClose={() => {
            setEditorOpen(false);
            setEditorRow(null);
          }}
        />
      ) : null}

      {occurrenceRow ? (
        <RecurringOccurrenceModal
          row={occurrenceRow}
          wallets={wallets}
          categories={categories}
          hideBalances={hidden}
          currency={currency}
          onSave={overrides => onRecord(occurrenceRow.id, overrides)}
          onClose={() => setOccurrenceRow(null)}
        />
      ) : null}

      <ConfirmDialog
        isOpen={Boolean(deleteRow)}
        title={`Delete ${deleteRow?.label || 'recurring transaction'}?`}
        message="This deletes the schedule and stops future due transactions. Previously recorded transactions and wallet balances remain unchanged."
        confirmText="Delete recurring transaction"
        cancelText="Keep"
        isDangerous
        onConfirm={() => {
          if (deleteRow) onDelete(deleteRow);
          setDeleteRow(null);
        }}
        onCancel={() => setDeleteRow(null)}
      />
    </>
  );
}
