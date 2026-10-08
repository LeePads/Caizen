import { useMemo, useRef, useState } from 'react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { CategoryIcon } from '@/components/balance/CategoryIcon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { LocalSuggestionInput } from '@/components/ui/local-suggestion-input';
import { useAppContext } from '@/lib/context';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { MoneyInput } from '@/components/ui/money-input';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import {
  convertMoneyInputToBase,
  formatMoneyInputValue,
  getActiveCurrency,
  getEffectiveMoneyInputCurrency,
} from '@/lib/currency';
import { getRecurringDateOnOrAfter } from '@/lib/finance/recurring-transactions';
import { isValidLocalDateKey, toLocalDateKey } from '@/lib/date-utils';
import type {
  BalanceProjectionRow,
  CurrencyCode,
  FinancialCategory,
  RecurrenceFrequency,
  Wallet,
} from '@/lib/types';

type RecurringTransactionModalProps = {
  row: BalanceProjectionRow | null;
  wallets: Wallet[];
  categories: FinancialCategory[];
  hideBalances?: boolean;
  currency?: CurrencyCode;
  onSave: (row: BalanceProjectionRow) => void | boolean;
  onClose: () => void;
};

const frequencyOptions = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const dateOrToday = (value?: string) => value || toLocalDateKey();

const dateForCurrentMonthDueDay = (dueDay?: number) => {
  if (!dueDay) return undefined;
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12, 0, 0, 0).getDate();
  return toLocalDateKey(new Date(
    now.getFullYear(),
    now.getMonth(),
    Math.min(dueDay, lastDay),
    12,
    0,
    0,
    0,
  ));
};

export default function RecurringTransactionModal({
  row,
  wallets,
  categories,
  hideBalances = false,
  currency,
  onSave,
  onClose,
}: RecurringTransactionModalProps) {
  const { transactions } = useAppContext();
  const initialStart = dateOrToday(row?.recurrence?.startDateKey || dateForCurrentMonthDueDay(row?.dueDay));
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(currency || getActiveCurrency()),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;
  const initialAmount = formatMoneyInputValue(
    row?.amount ? Number(row.amount) : undefined,
    moneyInputCurrency,
  );
  const [label, setLabel] = useState(row?.label || '');
  const [type, setType] = useState<BalanceProjectionRow['type']>(row?.type || 'expense');
  const [amount, setAmount] = useState(initialAmount);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(row?.recurrence?.frequency || 'monthly');
  const [startDateKey, setStartDateKey] = useState(initialStart);
  const [endDateKey, setEndDateKey] = useState(row?.recurrence?.endDateKey || '');
  const [walletId, setWalletId] = useState(row?.recurrence?.walletId || wallets[0]?.id || '');
  const [categoryId, setCategoryId] = useState(row?.recurrence?.categoryId || '');
  const [subcategoryId, setSubcategoryId] = useState(row?.recurrence?.subcategoryId || '');
  const [payee, setPayee] = useState(row?.recurrence?.payee || '');
  const [notes, setNotes] = useState(row?.recurrence?.notes || '');
  const [active, setActive] = useState(row?.active !== false);
  const [error, setError] = useState('');
  const submittedRef = useRef(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const initialSnapshot = useRef(JSON.stringify({
    label: row?.label || '',
    type: row?.type || 'expense',
    amount: initialAmount,
    frequency: row?.recurrence?.frequency || 'monthly',
    startDateKey: initialStart,
    endDateKey: row?.recurrence?.endDateKey || '',
    walletId: row?.recurrence?.walletId || wallets[0]?.id || '',
    categoryId: row?.recurrence?.categoryId || '',
    subcategoryId: row?.recurrence?.subcategoryId || '',
    payee: row?.recurrence?.payee || '',
    notes: row?.recurrence?.notes || '',
    active: row?.active !== false,
  }));
  const changed = JSON.stringify({
    label,
    type,
    amount,
    frequency,
    startDateKey,
    endDateKey,
    walletId,
    categoryId,
    subcategoryId,
    payee,
    notes,
    active,
  }) !== initialSnapshot.current;

  const canClose = () => {
    if (changed) {
      setShowDiscard(true);
      return false;
    }
    return true;
  };

  const matchingCategories = useMemo(
    () => categories.filter(category => category.type === type),
    [categories, type],
  );
  const selectedCategory = matchingCategories.find(category => category.id === categoryId);
  const subcategories = selectedCategory?.subcategories || [];

  const save = () => {
    if (submittedRef.current) return;
    const numericAmount = Number(amount);
    if (!label.trim()) return setError('Enter a recurring item name.');
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError('Enter an amount greater than zero.');
    if (!walletId || !wallets.some(wallet => wallet.id === walletId)) return setError('Choose a wallet.');
    if (!isValidLocalDateKey(startDateKey)) return setError('Choose a valid start date.');
    if (endDateKey && !isValidLocalDateKey(endDateKey)) return setError('Choose a valid end date or clear the date.');
    if (endDateKey && endDateKey < startDateKey) return setError('End date must be on or after the start date.');
    if (categoryId && !selectedCategory) return setError('Choose a valid category for this transaction type.');
    if (subcategoryId && !subcategories.some(item => item.id === subcategoryId)) return setError('Choose a valid subcategory.');
    const baseAmount = convertMoneyInputToBase(amount, moneyInputCurrency);
    if (baseAmount === undefined || baseAmount <= 0) return setError('Enter an amount of at least 0.01 in your base currency.');

    const now = new Date();
    const nextDueDateKey = row?.recurrence &&
      row.recurrence.startDateKey === startDateKey &&
      row.recurrence.frequency === frequency
      ? row.recurrence.nextDueDateKey
      : getRecurringDateOnOrAfter({
          frequency,
          startDateKey,
          endDateKey: endDateKey || undefined,
          nextDueDateKey: startDateKey,
          walletId,
        }, toLocalDateKey());

    if (!nextDueDateKey) return setError('Choose a valid recurring schedule.');

    submittedRef.current = true;
    try {
      const saved = onSave({
        id: row?.id || `projection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: label.trim(),
        amount: String(Math.max(0, baseAmount)),
        allocated: '',
        type,
        dueDay: Number(startDateKey.slice(8)) || undefined,
        active,
        cycleKey: undefined,
        createdAt: row?.createdAt || now,
        updatedAt: now,
        recurrence: {
          frequency,
          startDateKey,
          endDateKey: endDateKey || undefined,
          nextDueDateKey,
          walletId,
          categoryId: categoryId || undefined,
          subcategoryId: subcategoryId || undefined,
          payee: payee.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      });
      if (saved === false) {
        submittedRef.current = false;
        setError('The recurring transaction could not be saved. Review its details, then try again.');
        return;
      }
      onClose();
    } catch {
      submittedRef.current = false;
      setError('The recurring transaction could not be saved. Your input is kept; review the schedule and try again.');
    }
  };

  return (
    <>
      <CaizenFormDialog
        panelClassName="balance-form @container/balance-form"
        title={row?.recurrence ? 'Edit recurring transaction' : 'Add recurring transaction'}
        description="Saving sets the schedule. Wallet balances change only when you record a transaction."
        onClose={onClose}
        onBeforeClose={canClose}
        maxWidthClass="max-w-2xl"
        bodyClassName="max-h-[calc(88dvh-5rem)] overflow-y-auto"
      footer={(
        <div className="flex flex-col-reverse gap-2 @min-[30rem]/balance-form:flex-row @min-[30rem]/balance-form:justify-end">
          <Button type="button" variant="outline" onClick={() => { if (canClose()) onClose(); }}>Cancel</Button>
          <Button type="button" onClick={save}>Save recurring transaction</Button>
        </div>
      )}
      >
        <div className="space-y-5">
        <section className="grid gap-4 rounded-2xl border border-border/55 bg-background/35 p-4 @min-[30rem]/balance-form:grid-cols-2">
          <label className="space-y-2 @min-[30rem]/balance-form:col-span-2">
            <span className="text-label text-muted-foreground">Name</span>
            <Input value={label} onChange={event => setLabel(event.target.value)} autoFocus placeholder="Salary, rent, subscription…" />
          </label>
          <AndroidAdaptiveSelect
            label="Type"
            value={type}
            onChange={value => {
              setType(value as BalanceProjectionRow['type']);
              setCategoryId('');
              setSubcategoryId('');
            }}
            options={[
              { value: 'income', label: 'Income' },
              { value: 'expense', label: 'Expense' },
            ]}
          />
          <label className="space-y-2">
            <span className="text-label text-muted-foreground">Amount</span>
            <MoneyInput currency={moneyInputCurrency} type={hideBalances ? 'password' : 'number'} inputMode="decimal" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} />
          </label>
          <AndroidAdaptiveSelect
            label="Frequency"
            value={frequency}
            onChange={value => setFrequency(value as RecurrenceFrequency)}
            options={frequencyOptions}
          />
          <AndroidAdaptiveSelect
            label="Wallet"
            value={walletId}
            onChange={setWalletId}
            options={[
              { value: '', label: 'Choose a wallet' },
              ...wallets.map(wallet => ({ value: wallet.id, label: wallet.name })),
            ]}
            searchable={wallets.length > 8}
          />
        </section>

        <section className="grid gap-4 rounded-2xl border border-border/55 bg-background/35 p-4 @min-[30rem]/balance-form:grid-cols-2">
          <AdaptiveDatePicker label="Start date" value={startDateKey} onChange={value => setStartDateKey(value)} />
          <AdaptiveDatePicker label="End date (optional)" value={endDateKey} onChange={value => setEndDateKey(value)} />
          <AndroidAdaptiveSelect
            label="Category (optional)"
            value={categoryId}
            onChange={value => {
              setCategoryId(value);
              setSubcategoryId('');
            }}
            options={[
              { value: '', label: 'Uncategorized' },
              ...matchingCategories.map(category => ({
                value: category.id,
                label: category.name,
                icon: <CategoryIcon iconId={category.icon} size="xs" containerClassName="h-6 w-6 rounded-md" />,
              })),
            ]}
            searchable={matchingCategories.length > 8}
          />
          <AndroidAdaptiveSelect
            label="Subcategory (optional)"
            value={subcategoryId}
            onChange={setSubcategoryId}
            disabled={!selectedCategory || subcategories.length === 0}
            options={[
              { value: '', label: selectedCategory ? 'No subcategory' : 'Choose a category first' },
              ...subcategories.map(item => ({
                value: item.id,
                label: item.name,
                icon: <CategoryIcon iconId={item.icon || selectedCategory?.icon} size="xs" containerClassName="h-6 w-6 rounded-md" />,
              })),
            ]}
          />
        </section>

        <section className="grid gap-4 rounded-2xl border border-border/55 bg-background/35 p-4 @min-[30rem]/balance-form:grid-cols-2">
          <label className="space-y-2">
            <span className="text-label text-muted-foreground">{type === 'income' ? 'Received from (optional)' : 'Paid to (optional)'}</span>
            <LocalSuggestionInput value={payee} aria-label={type === 'income' ? 'Received from (optional)' : 'Paid to (optional)'} candidates={transactions.filter(entry => entry.type === type).map(entry => entry.payee || '')} onValueChange={setPayee} placeholder="Employer or merchant" />
          </label>
          <label className="space-y-2">
            <span className="text-label text-muted-foreground">Notes (optional)</span>
            <Input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Helpful context" />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-border/55 bg-card/55 p-3 @min-[30rem]/balance-form:col-span-2">
            <Checkbox checked={active} onCheckedChange={checked => setActive(checked === true)} />
            <span>
              <span className="block text-sm font-bold">Active</span>
              <span className="text-xs text-muted-foreground">Pause to stop showing due transactions and including this amount in the forecast.</span>
            </span>
          </label>
        </section>

        {error ? <p className="text-sm font-semibold text-destructive" role="alert">{error}</p> : null}

      </div>
      </CaizenFormDialog>
      <ConfirmDialog
        isOpen={showDiscard}
        title="Discard recurring transaction changes?"
        message="Your unsaved changes will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        isDangerous
        onConfirm={onClose}
        onCancel={() => setShowDiscard(false)}
      />
    </>
  );
}
