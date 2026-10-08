'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCcw, Wallet as WalletIcon, X } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/money-input';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { addMoney } from '@/lib/money';
import { getBalanceCheckInInputErrors, toNumber, walletBalancesMatchOpening } from '@/lib/balance';
import {
  convertMoneyInputToBase,
  formatCurrency,
  formatMoneyInputValue,
  getActiveCurrency,
  getEffectiveMoneyInputCurrency,
  useCurrencyState,
} from '@/lib/currency';
import type { BalanceCheckIn, CurrencyCode, Wallet } from '@/lib/types';

type SavePayload = {
  walletBalances: Record<string, string>;
  openingWalletBalances: Record<string, number>;
};

export default function BalanceCheckInModal({
  isOpen,
  wallets,
  existingCheckIn,
  hideBalances = false,
  androidPresentation = false,
  onClose,
  onSave,
  onAddWallet,
}: {
  isOpen: boolean;
  wallets: Wallet[];
  existingCheckIn?: BalanceCheckIn;
  hideBalances?: boolean;
  androidPresentation?: boolean;
  onClose: () => void;
  onSave: (payload: SavePayload) => void | boolean;
  onAddWallet?: () => void;
}) {
  const [walletBalances, setWalletBalances] = useState<Record<string, string>>(
    {},
  );
  const [showDiscard, setShowDiscard] = useState(false);
  const [staleError, setStaleError] = useState('');
  const submittedRef = useRef(false);
  const initialSnapshot = useRef('');
  const openedWalletSetRef = useRef<string | null>(null);
  const openingWalletBalancesRef = useRef<Record<string, number>>({});
  const modalPanelRef = useRef<HTMLElement | null>(null);
  useCurrencyState();
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(getActiveCurrency()),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;

  useEffect(() => {
    if (!isOpen) {
      submittedRef.current = false;
      openedWalletSetRef.current = null;
      openingWalletBalancesRef.current = {};
      return;
    }

    if (openedWalletSetRef.current !== null) return;

    const walletSetKey = wallets.map(wallet => wallet.id).sort().join('|');
    openedWalletSetRef.current = walletSetKey;
    moneyInputCurrencyRef.current = getEffectiveMoneyInputCurrency(getActiveCurrency());
    const nextMoneyCurrency = moneyInputCurrencyRef.current;
    openingWalletBalancesRef.current = Object.fromEntries(
      wallets.map(wallet => [wallet.id, Number(wallet.balance)]),
    );

    const next = Object.fromEntries(
      wallets.map(wallet => [
        wallet.id,
        formatMoneyInputValue(wallet.balance ?? 0, nextMoneyCurrency),
      ]),
    );
    setWalletBalances(next);
    initialSnapshot.current = JSON.stringify(next);
    setShowDiscard(false);
    setStaleError('');
  }, [isOpen, wallets]);

  const changed = JSON.stringify(walletBalances) !== initialSnapshot.current;
  const inputErrors = useMemo(
    () => getBalanceCheckInInputErrors(wallets, walletBalances),
    [walletBalances, wallets],
  );

  const updatedTotal = useMemo(
    () => Object.keys(inputErrors).length > 0
      ? null
      : wallets.reduce(
        (sum, wallet) => addMoney(
          sum,
          convertMoneyInputToBase(walletBalances[wallet.id], moneyInputCurrency) ?? 0,
        ),
        0,
      ),
    [inputErrors, walletBalances, wallets, moneyInputCurrency],
  );

  const previousTotal = wallets.reduce(
    (sum, wallet) => addMoney(sum, toNumber(wallet.balance)),
    0,
  );
  const difference = updatedTotal === null ? null : addMoney(updatedTotal, -previousTotal);

  const requestClose = () => {
    if (changed) {
      setShowDiscard(true);
      return;
    }
    close();
  };

  const handleSave = () => {
    if (submittedRef.current) return;
    if (Object.keys(inputErrors).length > 0) return;

    const currentWalletSet = wallets.map(wallet => wallet.id).sort().join('|');
    const openingWalletSet = openedWalletSetRef.current || '';
    if (currentWalletSet !== openingWalletSet || !walletBalancesMatchOpening(wallets, openingWalletBalancesRef.current)) {
      setStaleError('A wallet changed while this check-in was open. Review the current balances, then close and reopen the check-in before saving.');
      return;
    }

    setStaleError('');
    const convertedEntries = wallets.map(wallet => [
      wallet.id,
      convertMoneyInputToBase(walletBalances[wallet.id], moneyInputCurrency),
    ] as const);
    if (convertedEntries.some(([, value]) => value === undefined || !Number.isFinite(value))) {
      setStaleError('One or more balances could not be converted. Enter valid money amounts, then try again.');
      return;
    }
    const convertedBalances = Object.fromEntries(convertedEntries.map(([id, value]) => [id, String(value)]));
    submittedRef.current = true;
    try {
      const saved = onSave({
        walletBalances: convertedBalances,
        openingWalletBalances: { ...openingWalletBalancesRef.current },
      });
      if (saved === false) {
        submittedRef.current = false;
        setStaleError('The check-in could not be saved. Review the current wallets, then close and reopen this form.');
      }
    } catch {
      submittedRef.current = false;
      setStaleError('The check-in could not be saved. Your input is kept; review the balances and try again.');
    }
  };

  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });

  useOverlayLifecycle(isOpen, requestClose, { containerRef: modalPanelRef });

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className={`fixed inset-0 z-[1000] overflow-y-auto ${androidPresentation ? 'android-balance-modal-root' : ''}`}
        data-caizen-overlay={isClosing ? 'closing' : 'open'}
        data-state={isClosing ? 'closed' : 'open'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="refresh-balances-title"
        aria-describedby="refresh-balances-description"
      >
        <div aria-hidden="true" className="fixed inset-0 bg-black/70 backdrop-blur-sm" />

        <div className="relative flex min-h-full items-end justify-center p-2 sm:items-center sm:p-5">
          <section
            ref={modalPanelRef}
            tabIndex={-1}
            className={`modal-card-enter balance-form @container/balance-form relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl ${androidPresentation ? 'android-balance-modal-panel' : ''}`}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 p-4 sm:p-5">
              <div className="min-w-0">
                <h2
                  id="refresh-balances-title"
                  className="text-section-title"
                >
                  Update wallet balances
                </h2>
                <p id="refresh-balances-description" className="mt-1 text-sm text-muted-foreground">
                  Enter each current balance. Saving records balance adjustments
                  and saves this week’s balance-history snapshot.
                </p>
              </div>

              <button
                type="button"
                onClick={requestClose}
                aria-label="Close balance check-in"
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
              {wallets.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-border/60 bg-background/35 p-6 text-center">
                  <WalletIcon className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-3 font-bold">No wallets to update</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add a wallet, then return here to update balances and save your balance history.
                  </p>
                  {onAddWallet ? (
                    <Button type="button" onClick={onAddWallet} className="mt-4 rounded-2xl">
                      Add wallet
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  {wallets.map(wallet => (
                    <label
                      key={wallet.id}
                      className="grid gap-3 rounded-2xl border border-border/55 bg-background/45 p-4 @min-[30rem]/balance-form:grid-cols-[minmax(0,1fr)_minmax(0,180px)] @min-[30rem]/balance-form:items-center"
                    >
                      <span className="min-w-0">
                        <span className="block break-words font-bold">
                          {wallet.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {wallet.purpose || wallet.type.replaceAll('_', ' ')}
                        </span>
                      </span>

                      <div className="min-w-0 space-y-1.5">
                        <MoneyInput
                            type={hideBalances ? 'password' : 'number'}
                            step="0.01"
                            inputMode="decimal"
                            autoComplete="off"
                            value={walletBalances[wallet.id] ?? ''}
                            onChange={event =>
                              setWalletBalances(current => ({
                                ...current,
                                [wallet.id]: event.target.value,
                              }))
                            }
                            aria-label={`${hideBalances ? 'Hidden ' : ''}current balance for ${wallet.name}`}
                            aria-invalid={Boolean(inputErrors[wallet.id])}
                            aria-describedby={inputErrors[wallet.id] ? `balance-error-${wallet.id}` : undefined}
                            currency={moneyInputCurrency}
                          />
                          {inputErrors[wallet.id] ? (
                            <span id={`balance-error-${wallet.id}`} className="block text-xs font-semibold text-destructive" role="alert">
                              {inputErrors[wallet.id]}
                            </span>
                          ) : null}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {staleError ? (
                <p className="mt-4 rounded-2xl border border-destructive/25 bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert">
                  {staleError}
                </p>
              ) : null}

              {wallets.length > 0 && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/55 bg-background/45 p-4">
                    <p className="text-label text-muted-foreground">
                      Updated total
                    </p>
                    <p className="mt-2 text-xl font-bold">
                      {updatedTotal === null ? '—' : hideBalances ? '••••••' : formatCurrency(updatedTotal)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/55 bg-background/45 p-4">
                    <p className="text-label text-muted-foreground">
                      Change from current total
                    </p>
                    <p className="mt-2 text-xl font-bold">
                      {difference === null ? '—' : hideBalances ? '••••••' : `${difference > 0 ? '+' : ''}${formatCurrency(difference)}`}
                    </p>
                  </div>
                </div>
              )}

              {existingCheckIn && (
                <p className="mt-4 text-xs text-muted-foreground">
                  This replaces the snapshot already saved for the current week.
                </p>
              )}
            </div>

            <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-border/60 p-4 sm:flex-row sm:justify-end sm:px-6">
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                className="rounded-2xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={wallets.length === 0 || Object.keys(inputErrors).length > 0}
                onClick={handleSave}
                className="h-auto min-h-11 whitespace-normal rounded-2xl py-2 font-bold"
              >
                <RefreshCcw className="mr-2 h-4 w-4 shrink-0" /> Update balances and save snapshot
              </Button>
            </footer>
          </section>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDiscard}
        title="Discard balance changes?"
        message="The balances entered in this check-in will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        isDangerous
        onConfirm={() => {
          setShowDiscard(false);
          close();
        }}
        onCancel={() => setShowDiscard(false)}
      />
    </>,
    document.body,
  );
}
