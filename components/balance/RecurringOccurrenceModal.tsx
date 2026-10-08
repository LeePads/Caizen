import { useMemo, useRef, useState } from 'react';
import { isValidLocalDateKey } from '@/lib/date-utils';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { CategoryIcon } from '@/components/balance/CategoryIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import type {
  BalanceProjectionRow,
  CurrencyCode,
  FinancialCategory,
  RecurringActionResult,
  RecurringOccurrenceOverrides,
  Wallet,
} from '@/lib/types';

type RecurringOccurrenceModalProps = {
  row: BalanceProjectionRow;
  wallets: Wallet[];
  categories: FinancialCategory[];
  hideBalances?: boolean;
  currency?: CurrencyCode;
  onSave: (overrides: RecurringOccurrenceOverrides) => RecurringActionResult;
  onClose: () => void;
};

export default function RecurringOccurrenceModal({
  row,
  wallets,
  categories,
  hideBalances = false,
  currency,
  onSave,
  onClose,
}: RecurringOccurrenceModalProps) {
  const recurrence = row.recurrence;
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(currency || getActiveCurrency()),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;
  const initialAmount = formatMoneyInputValue(Number(row.amount), moneyInputCurrency);
  const [amount, setAmount] = useState(initialAmount);
  const [dateKey, setDateKey] = useState(recurrence?.nextDueDateKey || '');
  const [walletId, setWalletId] = useState(recurrence?.walletId || '');
  const [categoryId, setCategoryId] = useState(recurrence?.categoryId || '');
  const [subcategoryId, setSubcategoryId] = useState(recurrence?.subcategoryId || '');
  const [payee, setPayee] = useState(recurrence?.payee || '');
  const [notes, setNotes] = useState(recurrence?.notes || '');
  const [error, setError] = useState('');
  const submittedRef = useRef(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const initialSnapshot = useRef(JSON.stringify({
    amount: initialAmount,
    dateKey: recurrence?.nextDueDateKey || '',
    walletId: recurrence?.walletId || '',
    categoryId: recurrence?.categoryId || '',
    subcategoryId: recurrence?.subcategoryId || '',
    payee: recurrence?.payee || '',
    notes: recurrence?.notes || '',
  }));
  const changed = JSON.stringify({
    amount,
    dateKey,
    walletId,
    categoryId,
    subcategoryId,
    payee,
    notes,
  }) !== initialSnapshot.current;

  const canClose = () => {
    if (changed) {
      setShowDiscard(true);
      return false;
    }
    return true;
  };

  const matchingCategories = useMemo(
    () => categories.filter(category => category.type === row.type),
    [categories, row.type],
  );
  const selectedCategory = matchingCategories.find(category => category.id === categoryId);
  const subcategories = selectedCategory?.subcategories || [];

  const save = () => {
    if (submittedRef.current) return;
    if (!isValidLocalDateKey(dateKey)) return setError('Choose a valid transaction date.');
    if (!wallets.some(wallet => wallet.id === walletId)) return setError('Choose an available wallet.');
    if (categoryId && !selectedCategory) return setError('Choose an available category or clear the category.');
    if (subcategoryId && !subcategories.some(item => item.id === subcategoryId)) return setError('Choose an available subcategory or clear the subcategory.');
    const baseAmount = convertMoneyInputToBase(amount, moneyInputCurrency);
    if (baseAmount === undefined || baseAmount <= 0) {
      return setError('Enter an amount greater than zero.');
    }
    submittedRef.current = true;
    try {
      const result = onSave({
        amount: baseAmount,
        dateKey,
        walletId,
        categoryId: categoryId || undefined,
        subcategoryId: subcategoryId || undefined,
        payee: payee.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (!result.ok) {
        submittedRef.current = false;
        setError(result.error || 'The transaction could not be recorded. Review the wallet and amount, then try again.');
        return;
      }
      onClose();
    } catch {
      submittedRef.current = false;
      setError('The transaction could not be recorded. Your input is kept; review the wallet and try again.');
    }
  };

  return (
    <>
    <CaizenFormDialog
      panelClassName="balance-form @container/balance-form"
      title={`Record ${row.label || 'recurring transaction'}`}
      description="Review this payment or income before recording it."
      onClose={onClose}
      onBeforeClose={canClose}
      maxWidthClass="max-w-xl"
      bodyClassName="max-h-[calc(88dvh-5rem)] overflow-y-auto"
      footer={(
        <div className="flex flex-col-reverse gap-2 @min-[30rem]/balance-form:flex-row @min-[30rem]/balance-form:justify-end">
          <Button type="button" variant="outline" onClick={() => { if (canClose()) onClose(); }}>Cancel</Button>
          <Button type="button" onClick={save}>Record transaction</Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <p className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4 text-sm text-muted-foreground">
          Recording adds an {row.type} transaction, {row.type === 'income' ? 'increases' : 'decreases'} the selected wallet balance, and moves the schedule to its next due date. These edits apply only to this transaction.
        </p>
        <div className="grid gap-4 @min-[30rem]/balance-form:grid-cols-2">
          <label className="space-y-2">
            <span className="text-label text-muted-foreground">Amount</span>
            <MoneyInput currency={moneyInputCurrency} type={hideBalances ? 'password' : 'number'} inputMode="decimal" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} />
          </label>
          <AdaptiveDatePicker label="Transaction date" value={dateKey} onChange={setDateKey} />
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
          <label className="space-y-2">
            <span className="text-label text-muted-foreground">{row.type === 'income' ? 'Received from (optional)' : 'Paid to (optional)'}</span>
            <Input value={payee} onChange={event => setPayee(event.target.value)} />
          </label>
          <label className="space-y-2 @min-[30rem]/balance-form:col-span-2">
            <span className="text-label text-muted-foreground">Notes (optional)</span>
            <Textarea className="min-h-24" value={notes} onChange={event => setNotes(event.target.value)} />
          </label>
        </div>
        {error ? <p className="text-sm font-semibold text-destructive" role="alert">{error}</p> : null}
      </div>
    </CaizenFormDialog>
    <ConfirmDialog
      isOpen={showDiscard}
      title="Discard transaction changes?"
      message="Your unsaved changes to this transaction will be lost."
      confirmText="Discard changes"
      cancelText="Keep editing"
      isDangerous
      onConfirm={onClose}
      onCancel={() => setShowDiscard(false)}
    />
    </>
  );
}
