'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { LocalSuggestionInput } from '@/components/ui/local-suggestion-input';
import { Textarea } from '@/components/ui/textarea';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { CategoryIcon } from '@/components/balance/CategoryIcon';
import WalletIdentity from '@/components/balance/WalletIdentity';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { MoneyInput } from '@/components/ui/money-input';
import {
  convertMoneyInputToBase,
  formatMoneyInputValue,
  formatPHP,
  getActiveCurrency,
  getEffectiveMoneyInputCurrency,
} from '@/lib/currency';
import { isReservedFinancialFallbackName } from '@/lib/balance';
import { LINKED_RECORD_MODULE_OPTIONS, linkedRecordTypeLabel, type LinkedRecordCollections } from '@/lib/balance/linked-record';
import { toLocalDateKey, parseLocalDateInputOrUndefined } from '@/lib/date-utils';
import { useAppContext } from '@/lib/context';
import InventoryModal from '@/components/modals/InventoryModal';
import SkincareModal from '@/components/modals/SkincareModal';
import SupplementModal from '@/components/modals/SupplementModal';
import GameModal from '@/components/modals/GameModal';
import BookModal from '@/components/entertainment/BookModal';
import type {
  FinancialCategory,
  CurrencyCode,
  LinkedRecordModule,
  Transaction,
  TransactionType,
  Wallet,
} from '@/lib/types';

const CREATE_RECORD_VALUE = '__create__';

type TransactionDraft = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type TransactionModalProps = {
  transaction?: Transaction | null;
  initialType?: TransactionType;
  wallets: Wallet[];
  categories: FinancialCategory[];
  hideBalances?: boolean;
  currency?: CurrencyCode;
  androidPresentation?: boolean;
  onClose: () => void;
  onSave: (transaction: TransactionDraft) => void | boolean;
} & LinkedRecordCollections;

const ordinaryTypeOptions: Array<{ value: 'expense' | 'income'; label: string }> = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

export default function TransactionModal({
  transaction,
  initialType = 'expense',
  wallets,
  categories,
  hideBalances = false,
  currency,
  androidPresentation = false,
  onClose,
  onSave,
  inventoryItems,
  skincareProducts,
  supplements,
  books,
  games,
}: TransactionModalProps) {
  const [type, setType] = useState<TransactionType>(transaction?.type || initialType);
  const [amount, setAmount] = useState(String(transaction?.amount || ''));
  const [fee, setFee] = useState(String(transaction?.fee || ''));
  const [walletId, setWalletId] = useState(transaction?.walletId || wallets[0]?.id || '');
  const [destinationWalletId, setDestinationWalletId] = useState(transaction?.destinationWalletId || '');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId || '');
  const [subcategoryId, setSubcategoryId] = useState(transaction?.subcategoryId || '');
  const [date, setDate] = useState(toLocalDateKey(transaction?.date || new Date()));
  const [notes, setNotes] = useState(transaction?.notes || '');
  const [transactionTitle, setTransactionTitle] = useState(transaction?.title || '');
  const [payee, setPayee] = useState(transaction?.payee || '');
  const [excludeFromReports, setExcludeFromReports] = useState(transaction?.excludeFromReports === true);
  const [adjustmentDirection, setAdjustmentDirection] = useState<'increase' | 'decrease'>(transaction?.adjustmentDirection || 'increase');
  const [linkedModule, setLinkedModule] = useState<LinkedRecordModule | ''>(transaction?.linkedRecord?.module || '');
  const [linkedRecordId, setLinkedRecordId] = useState(transaction?.linkedRecord?.recordId || '');
  const [detailsOpen, setDetailsOpen] = useState(Boolean(
    transaction?.title || transaction?.payee || transaction?.notes ||
    transaction?.subcategoryId || transaction?.linkedRecord ||
    (transaction?.type !== 'adjustment' && transaction?.type !== 'transfer' && transaction?.excludeFromReports),
  ));
  // Which target module's creation modal is currently open, stacked over
  // this modal. Selecting "+ Create new ..." in the Record picker opens the
  // existing creation flow for that module; the transaction draft below is
  // untouched while it's open.
  const [creatingModule, setCreatingModule] = useState<LinkedRecordModule | null>(null);
  const { addBook, transactions } = useAppContext();
  const [error, setError] = useState('');
  const submittedRef = useRef(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const initialSnapshot = useRef('');
  const initializedFormKey = useRef('');
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(currency || getActiveCurrency()),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;

  useEffect(() => {
    const formKey = `${transaction?.id || 'new'}:${initialType}`;
    if (initializedFormKey.current === formKey) return;
    initializedFormKey.current = formKey;

    const nextType = transaction?.type || initialType;
    const nextCategoryType = nextType === 'income' ? 'income' : 'expense';
    const nextCategory = nextType === 'income' || nextType === 'expense'
      ? categories.find(item => item.id === transaction?.categoryId && item.type === nextCategoryType)
      : undefined;
    const nextSubcategory = nextCategory?.subcategories.find(
      item => item.id === transaction?.subcategoryId,
    );
    moneyInputCurrencyRef.current = getEffectiveMoneyInputCurrency(
      currency || getActiveCurrency(),
    );
    const nextMoneyCurrency = moneyInputCurrencyRef.current;

    setType(nextType);
    setAmount(
      transaction?.amount === undefined
        ? ''
        : formatMoneyInputValue(transaction.amount, nextMoneyCurrency),
    );
    setFee(
      transaction?.fee === undefined
        ? ''
        : formatMoneyInputValue(transaction.fee, nextMoneyCurrency),
    );
    setWalletId(transaction?.walletId || wallets[0]?.id || '');
    setDestinationWalletId(transaction?.destinationWalletId || '');
    setCategoryId(nextCategory?.id || '');
    setSubcategoryId(nextSubcategory?.id || '');
    setDate(toLocalDateKey(transaction?.date || new Date()));
    setNotes(transaction?.notes || '');
    setTransactionTitle(transaction?.title || '');
    setPayee(transaction?.payee || '');
    setExcludeFromReports(transaction?.excludeFromReports === true || nextType === 'adjustment');
    setAdjustmentDirection(transaction?.adjustmentDirection || 'increase');
    setLinkedModule(transaction?.linkedRecord?.module || '');
    setLinkedRecordId(transaction?.linkedRecord?.recordId || '');
    setDetailsOpen(Boolean(
      transaction?.title || transaction?.payee || transaction?.notes ||
      transaction?.subcategoryId || transaction?.linkedRecord ||
      (nextType !== 'adjustment' && nextType !== 'transfer' && transaction?.excludeFromReports),
    ));
    setError('');
    submittedRef.current = false;
    initialSnapshot.current = JSON.stringify({
      type: nextType,
      amount: transaction?.amount === undefined
        ? ''
        : formatMoneyInputValue(transaction.amount, nextMoneyCurrency),
      fee: transaction?.fee === undefined
        ? ''
        : formatMoneyInputValue(transaction.fee, nextMoneyCurrency),
      walletId: transaction?.walletId || wallets[0]?.id || '',
      destinationWalletId: transaction?.destinationWalletId || '',
      categoryId: nextCategory?.id || '',
      subcategoryId: nextSubcategory?.id || '',
      date: toLocalDateKey(transaction?.date || new Date()),
      notes: transaction?.notes || '',
      title: transaction?.title || '',
      payee: transaction?.payee || '',
      excludeFromReports: transaction?.excludeFromReports === true || nextType === 'adjustment',
      adjustmentDirection: transaction?.adjustmentDirection || 'increase',
      linkedModule: transaction?.linkedRecord?.module || '',
      linkedRecordId: transaction?.linkedRecord?.recordId || '',
    });
  }, [transaction, initialType, wallets, categories]);

  const changed = JSON.stringify({
    type,
    amount,
    fee,
    walletId,
    destinationWalletId,
    categoryId,
    subcategoryId,
    date,
    notes,
    title: transactionTitle,
    payee,
    excludeFromReports,
    adjustmentDirection,
    linkedModule,
    linkedRecordId,
  }) !== initialSnapshot.current;

  const canClose = () => {
    if (changed) {
      setShowDiscard(true);
      return false;
    }
    return true;
  };

  const isTransfer = type === 'transfer';
  const isAdjustment = type === 'adjustment';
  const isSpecialMode = isTransfer || isAdjustment;
  const categoryType = type === 'income' ? 'income' : 'expense';
  const availableCategories = categories.filter(category => category.type === categoryType);
  const selectedCategory = availableCategories.find(category => category.id === categoryId);
  const subcategories = selectedCategory?.subcategories || [];
  const title = transaction
    ? isTransfer ? 'Edit transfer' : isAdjustment ? 'Edit balance adjustment' : 'Edit transaction'
    : isTransfer ? 'Add transfer' : isAdjustment ? 'Adjust balance' : 'Add transaction';
  const description = isTransfer ? 'Move between wallets' : isAdjustment ? 'Reconcile a wallet' : 'Money movement';
  const amountValue = Number(amount);
  const feeValue = Number(fee || 0);

  const canSave = useMemo(
    () => Boolean(walletId) && amountValue > 0 && Number.isFinite(amountValue) &&
      Number.isFinite(feeValue) && feeValue >= 0 &&
      (!isTransfer || (Boolean(destinationWalletId) && destinationWalletId !== walletId)) &&
      (!isAdjustment || Boolean(adjustmentDirection)),
    [walletId, amountValue, feeValue, isTransfer, destinationWalletId, isAdjustment, adjustmentDirection],
  );

  const linkedRecordOptions = useMemo(() => {
    const items: Array<{ value: string; label: string }> = [{ value: '', label: 'Choose a record' }];
    if (linkedModule === 'inventory') items.push(...inventoryItems.map(item => ({ value: item.id, label: item.name })));
    else if (linkedModule === 'skincare') items.push(...skincareProducts.map(item => ({ value: item.id, label: item.name })));
    else if (linkedModule === 'supplements') items.push(...supplements.map(item => ({ value: item.id, label: item.name })));
    else if (linkedModule === 'books') items.push(...books.map(item => ({ value: item.id, label: item.title })));
    else if (linkedModule === 'games') items.push(...games.map(item => ({ value: item.id, label: item.title })));
    // Every currently supported module already has a real creation flow, so
    // the action is always offered once a section is chosen.
    if (linkedModule) items.push({ value: CREATE_RECORD_VALUE, label: `+ Create new ${linkedRecordTypeLabel(linkedModule).toLowerCase()}` });
    return items;
  }, [linkedModule, inventoryItems, skincareProducts, supplements, books, games]);
  const linkedRecordUnavailable = Boolean(linkedRecordId) && !linkedRecordOptions.some(option => option.value === linkedRecordId);

  const handleTypeChange = (nextType: 'income' | 'expense') => {
    setType(nextType);
    setCategoryId('');
    setSubcategoryId('');
    setError('');
  };

  const handleCategoryChange = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    setSubcategoryId('');
  };

  const handleSave = () => {
    if (submittedRef.current) return;
    if (!wallets.some(wallet => wallet.id === walletId) ||
      (isTransfer && !wallets.some(wallet => wallet.id === destinationWalletId))) {
      setError('A selected wallet is no longer available. Choose an available wallet, then try again.');
      return;
    }
    if (!isSpecialMode && ((categoryId && !selectedCategory) ||
      (subcategoryId && !selectedCategory?.subcategories.some(item => item.id === subcategoryId)))) {
      setError('A selected category is no longer available. Choose another category or clear the selection.');
      return;
    }
    if (linkedRecordUnavailable) {
      setError('The linked record is no longer available. Choose another record or clear the link.');
      return;
    }
    if (!canSave) {
      setError(isTransfer && destinationWalletId === walletId
        ? 'Choose a different destination wallet.'
        : isTransfer
          ? 'Choose both wallets, enter an amount greater than zero, and use a fee of zero or more.'
          : 'Choose a wallet and enter an amount greater than zero.');
      return;
    }
    const parsedDate = parseLocalDateInputOrUndefined(date);
    if (!parsedDate) {
      setError('Choose a valid transaction date.');
      return;
    }

    const validCategory = !isSpecialMode && availableCategories.some(category => category.id === categoryId)
      ? categoryId
      : undefined;
    const validSubcategory = validCategory && selectedCategory?.subcategories.some(item => item.id === subcategoryId)
      ? subcategoryId
      : undefined;

    const baseAmount = convertMoneyInputToBase(amount, moneyInputCurrency);
    const baseFee = convertMoneyInputToBase(fee, moneyInputCurrency);
    if (baseAmount === undefined || baseAmount <= 0 || (isTransfer && fee.trim() && baseFee === undefined)) {
      setError('Enter an amount of at least 0.01 in your base currency and a valid fee.');
      return;
    }

    submittedRef.current = true;
    try {
      const saved = onSave({
        id: transaction?.id,
        type,
        amount: Math.max(0, baseAmount),
        fee: isTransfer && baseFee !== undefined && baseFee > 0 ? baseFee : undefined,
        walletId,
        destinationWalletId: isTransfer ? destinationWalletId : undefined,
        adjustmentDirection: isAdjustment ? adjustmentDirection : undefined,
        categoryId: validCategory,
        subcategoryId: validSubcategory,
        date: parsedDate,
        notes: notes.trim() || undefined,
        title: transactionTitle.trim() || undefined,
        payee: !isSpecialMode ? payee.trim() || undefined : undefined,
        excludeFromReports: isSpecialMode ? true : excludeFromReports,
        linkedRecord: linkedModule && linkedRecordId ? { module: linkedModule, recordId: linkedRecordId } : undefined,
        source: transaction?.source,
        sourceKey: transaction?.sourceKey,
        createdAt: transaction?.createdAt,
        updatedAt: new Date(),
      });
      if (saved === false) {
        submittedRef.current = false;
        setError('This transaction could not be saved. Check the wallet and amount, then try again.');
      }
    } catch {
      submittedRef.current = false;
      setError('The transaction could not be saved. Your input is kept; review the wallet and try again.');
    }
  };

  return (
    <>
      <CaizenFormDialog
        title={title}
        description={description}
        onClose={onClose}
        onBeforeClose={canClose}
        maxWidthClass="max-w-2xl"
        panelClassName={`balance-form @container/balance-form ${androidPresentation ? 'android-balance-modal-panel' : ''}`}
        bodyClassName="max-h-[calc(88dvh-5rem)] overflow-y-auto"
        footer={(
          <div className="flex flex-col-reverse gap-2 @min-[30rem]/balance-form:flex-row @min-[30rem]/balance-form:justify-end">
            <Button type="button" variant="outline" onClick={() => { if (canClose()) onClose(); }}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={!wallets.length}>
              {isTransfer ? 'Save transfer' : isAdjustment ? 'Save adjustment' : 'Save transaction'}
            </Button>
          </div>
        )}
      >
      <div className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="sr-only">Transaction</legend>
          <div className="grid gap-4 @min-[30rem]/balance-form:grid-cols-2">
            {!isSpecialMode ? (
              <label className="space-y-2">
                <span className="text-label text-muted-foreground">Type</span>
                <AndroidAdaptiveSelect
                  label="Type"
                  value={type as 'expense' | 'income'}
                  onChange={value => handleTypeChange(value as 'income' | 'expense')}
                  options={ordinaryTypeOptions}
                  className="control-input"
                />
              </label>
            ) : (
              <div className="space-y-2">
                <span className="text-label text-muted-foreground">Mode</span>
                <div className="control-input flex items-center font-semibold" role="status">{isTransfer ? 'Transfer' : 'Balance adjustment'}</div>
              </div>
            )}

            <label className="space-y-2">
              <span className="text-label text-muted-foreground">Amount</span>
              <MoneyInput currency={moneyInputCurrency} type={hideBalances ? 'password' : 'number'} min="0.01" step="0.01" inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" autoFocus />
            </label>

            <label className="space-y-2">
              <span className="text-label text-muted-foreground">{isTransfer ? 'From wallet' : 'Wallet'}</span>
              <AndroidAdaptiveSelect
                label={isTransfer ? 'From wallet' : 'Wallet'}
                value={walletId}
                onChange={setWalletId}
                options={[
                  { value: '', label: 'Choose wallet' },
                  ...wallets.map(wallet => ({ value: wallet.id, label: wallet.name, icon: <WalletIdentity wallet={wallet} size="xs" /> })),
                ]}
                searchable={wallets.length > 8}
                className="control-input"
              />
            </label>

            {isTransfer ? (
              <label className="space-y-2">
                <span className="text-label text-muted-foreground">To wallet</span>
                <AndroidAdaptiveSelect
                  label="To wallet"
                  value={destinationWalletId}
                  onChange={setDestinationWalletId}
                  options={[
                    { value: '', label: 'Choose destination' },
                    ...wallets.filter(wallet => wallet.id !== walletId).map(wallet => ({ value: wallet.id, label: wallet.name, icon: <WalletIdentity wallet={wallet} size="xs" /> })),
                  ]}
                  searchable={wallets.length > 8}
                  className="control-input"
                />
              </label>
            ) : null}

            {isTransfer ? (
              <label className="space-y-2">
                <span className="text-label text-muted-foreground">Transfer fee (optional)</span>
                <MoneyInput currency={moneyInputCurrency} type={hideBalances ? 'password' : 'number'} min="0" step="0.01" inputMode="decimal" autoComplete="off" value={fee} onChange={event => setFee(event.target.value)} placeholder="0.00" />
              </label>
            ) : null}

            {isAdjustment ? (
              <fieldset className="space-y-2">
                <legend className="text-label text-muted-foreground">Balance adjustment</legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Balance adjustment direction">
                  {([
                    { value: 'increase' as const, label: 'Increase balance' },
                    { value: 'decrease' as const, label: 'Decrease balance' },
                  ]).map(option => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={adjustmentDirection === option.value}
                      tabIndex={adjustmentDirection === option.value ? 0 : -1}
                      onKeyDown={event => {
                        if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                        event.preventDefault();
                        const nextDirection = event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Home'
                          ? 'increase'
                          : 'decrease';
                        setAdjustmentDirection(nextDirection);
                        const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
                        buttons?.[nextDirection === 'increase' ? 0 : 1]?.focus();
                      }}
                      onClick={() => setAdjustmentDirection(option.value)}
                      className={`min-h-11 rounded-xl border px-3 text-left text-sm font-bold transition-colors ${adjustmentDirection === option.value ? 'border-primary/45 bg-primary/10 text-foreground' : 'border-border/60 bg-background/45 text-muted-foreground hover:text-foreground'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div className="space-y-2">
              <span className="text-label text-muted-foreground">Date</span>
              <AdaptiveDatePicker label="Transaction date" value={date} onChange={setDate} className="control-input" />
            </div>
          </div>
        </fieldset>

        {isTransfer && amountValue > 0 && Number.isFinite(amountValue) && Number.isFinite(feeValue) && feeValue >= 0 && walletId && destinationWalletId ? (
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-4" role="status" aria-live="polite">
            <p className="text-sm font-bold">{hideBalances ? '••••••' : formatPHP(convertMoneyInputToBase(amount, moneyInputCurrency))} from {wallets.find(wallet => wallet.id === walletId)?.name || 'source wallet'} → {wallets.find(wallet => wallet.id === destinationWalletId)?.name || 'destination wallet'}</p>
            <div className="mt-2 grid gap-1 text-xs text-muted-foreground @min-[36rem]/balance-form:grid-cols-3">
              <span>Fee: {hideBalances ? '••••••' : formatPHP(convertMoneyInputToBase(fee, moneyInputCurrency))}</span>
              <span>{wallets.find(wallet => wallet.id === walletId)?.name || 'Source'} decreases by {hideBalances ? '••••••' : formatPHP((convertMoneyInputToBase(amount, moneyInputCurrency) || 0) + (convertMoneyInputToBase(fee, moneyInputCurrency) || 0))}</span>
              <span>{wallets.find(wallet => wallet.id === destinationWalletId)?.name || 'Destination'} increases by {hideBalances ? '••••••' : formatPHP(convertMoneyInputToBase(amount, moneyInputCurrency))}</span>
            </div>
          </div>
        ) : null}

        {!isSpecialMode ? (
          <fieldset className="space-y-3">
            <legend className="sr-only">Category</legend>
            <div className="grid gap-4 @min-[30rem]/balance-form:grid-cols-2">
              <label className="space-y-2 @min-[30rem]/balance-form:col-span-2">
                <span className="text-label text-muted-foreground">Category</span>
                <AndroidAdaptiveSelect
                  id="transaction-category"
                  label="Category"
                  value={categoryId}
                  onChange={handleCategoryChange}
                  options={[
                    { value: '', label: 'Uncategorized' },
                    ...availableCategories
                      .filter(category => category.name.trim())
                      .map(category => ({
                        value: category.id,
                        label: isReservedFinancialFallbackName(category.name) ? 'Uncategorized (saved category)' : category.name,
                        icon: <CategoryIcon iconId={category.icon} size="xs" containerClassName="h-6 w-6 rounded-md" />,
                      })),
                  ]}
                  searchable={availableCategories.length > 8}
                  className="control-input"
                />
              </label>
            </div>
          </fieldset>
        ) : null}

        <details
          open={detailsOpen}
          onToggle={event => setDetailsOpen(event.currentTarget.open)}
          className="border-t border-border/55 pt-3"
        >
          <summary className="cursor-pointer rounded-lg py-2 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Optional details
            {linkedRecordUnavailable ? <span className="ml-2 text-xs text-amber-600 dark:text-amber-300">Link needs attention</span> : null}
          </summary>
          <div className="mt-3 space-y-4">
        <fieldset className="space-y-3">
          <legend className="sr-only">Optional details</legend>
          <div className="grid gap-4 @min-[30rem]/balance-form:grid-cols-2">
            {!isSpecialMode && subcategories.length > 0 ? (
              <label className="space-y-2 @min-[30rem]/balance-form:col-span-2">
                <span className="text-label text-muted-foreground">Subcategory</span>
                <AndroidAdaptiveSelect
                  id="transaction-subcategory"
                  label="Subcategory"
                  value={subcategoryId}
                  onChange={setSubcategoryId}
                  options={[
                    { value: '', label: 'No subcategory' },
                    ...subcategories
                      .filter(subcategory => subcategory.name.trim())
                      .map(subcategory => ({
                        value: subcategory.id,
                        label: subcategory.name,
                        icon: <CategoryIcon categoryIconId={selectedCategory?.icon} subcategoryIconId={subcategory.icon} size="xs" containerClassName="h-6 w-6 rounded-md" />,
                      })),
                  ]}
                  searchable={subcategories.length > 8}
                  disabled={!selectedCategory}
                  className="control-input"
                />
              </label>
            ) : null}
            {!isSpecialMode ? (
              <label className="space-y-2">
                <span className="text-label text-muted-foreground">Title (optional)</span>
                <Input autoComplete="off" data-caizen-character-pop="on" value={transactionTitle} onChange={event => setTransactionTitle(event.target.value)} placeholder="e.g. Groceries" />
              </label>
            ) : null}

            {!isSpecialMode ? (
              <label className="space-y-2">
                <span className="text-label text-muted-foreground">{type === 'income' ? 'Received from (optional)' : 'Paid to (optional)'}</span>
                <LocalSuggestionInput value={payee} aria-label={type === 'income' ? 'Received from (optional)' : 'Paid to (optional)'} candidates={transactions.filter(entry => entry.id !== transaction?.id && entry.type === type).map(entry => entry.payee || '')} onValueChange={setPayee} placeholder={type === 'income' ? 'e.g. Employer' : 'e.g. Grocery store'} />
              </label>
            ) : null}

            <label className="space-y-2 @min-[30rem]/balance-form:col-span-2">
              <span className="text-label text-muted-foreground">Notes (optional)</span>
              <Textarea className="min-h-20" value={notes} onChange={event => setNotes(event.target.value)} placeholder="e.g. Receipt number or payment details" />
            </label>
          </div>
        </fieldset>

        {!isSpecialMode ? (
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-muted-foreground">Link a record</legend>
            <div className="grid gap-4 @min-[30rem]/balance-form:grid-cols-2">
              <label className="space-y-2">
                <span className="text-label text-muted-foreground">Section</span>
                <AndroidAdaptiveSelect
                  label="Link section"
                  value={linkedModule}
                  onChange={value => {
                    setLinkedModule(value as LinkedRecordModule | '');
                    setLinkedRecordId('');
                  }}
                  options={[{ value: '', label: 'None' }, ...LINKED_RECORD_MODULE_OPTIONS]}
                  className="control-input"
                />
              </label>

              {linkedModule ? (
                <label className="space-y-2">
                  <span className="text-label text-muted-foreground">Record</span>
                  <AndroidAdaptiveSelect
                    label="Linked record"
                    value={linkedRecordId}
                    onChange={value => {
                      if (value === CREATE_RECORD_VALUE) {
                        if (linkedModule) setCreatingModule(linkedModule);
                        return;
                      }
                      setLinkedRecordId(value);
                    }}
                    options={linkedRecordOptions}
                    searchable={linkedRecordOptions.length > 8}
                    className="control-input"
                  />
                  {linkedRecordUnavailable ? (
                    <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">This record is no longer available. Choose another, or clear the link.</p>
                  ) : null}
                </label>
              ) : null}
            </div>
            {linkedModule ? <p className="text-xs text-muted-foreground">A record created here stays in its section even if you cancel this transaction.</p> : null}
          </fieldset>
        ) : null}

        {!isSpecialMode ? (
          <fieldset className="space-y-3">
            <legend className="sr-only">Reporting options</legend>
            <label className="flex items-start gap-3 py-2">
              <Checkbox className="mt-1" checked={excludeFromReports} onCheckedChange={checked => setExcludeFromReports(checked === true)} />
              <span><span className="block text-sm font-semibold">Exclude from reports</span><span className="text-xs text-muted-foreground">This still changes the wallet balance.</span></span>
            </label>
          </fieldset>
        ) : null}
          </div>
        </details>
      </div>

      {error ? <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert">{error}</p> : null}

      </CaizenFormDialog>
      <ConfirmDialog
        isOpen={showDiscard}
        title="Discard transaction changes?"
        message="Your unsaved transaction changes will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        isDangerous
        onConfirm={() => {
          setShowDiscard(false);
          onClose();
        }}
        onCancel={() => setShowDiscard(false)}
      />

      {/* Create-new-record flow: reuses each module's existing creation
          modal, stacked over this one. The transaction draft above is
          untouched; only linkedRecordId changes, on success. */}
      {creatingModule === 'inventory' ? (
        <InventoryModal
          isOpen
          androidPresentation={androidPresentation}
          initialName={transactionTitle.trim() || undefined}
          onSaved={id => { setLinkedRecordId(id); setCreatingModule(null); }}
          onClose={() => setCreatingModule(null)}
        />
      ) : null}
      {creatingModule === 'skincare' ? (
        <SkincareModal
          isOpen
          androidPresentation={androidPresentation}
          initialName={transactionTitle.trim() || undefined}
          onSaved={id => { setLinkedRecordId(id); setCreatingModule(null); }}
          onClose={() => setCreatingModule(null)}
        />
      ) : null}
      {creatingModule === 'supplements' ? (
        <SupplementModal
          isOpen
          initialName={transactionTitle.trim() || undefined}
          onSaved={id => { setLinkedRecordId(id); setCreatingModule(null); }}
          onClose={() => setCreatingModule(null)}
        />
      ) : null}
      {creatingModule === 'books' ? (
        <BookModal
          isOpen
          book={null}
          initialTitle={transactionTitle.trim() || undefined}
          onSave={values => {
            const created = addBook(values);
            if (created) setLinkedRecordId(created.id);
            setCreatingModule(null);
          }}
          onClose={() => setCreatingModule(null)}
        />
      ) : null}
      {creatingModule === 'games' ? (
        <GameModal
          isOpen
          initialTitle={transactionTitle.trim() || undefined}
          onSaved={id => { setLinkedRecordId(id); setCreatingModule(null); }}
          onClose={() => setCreatingModule(null)}
        />
      ) : null}
    </>
  );
}
