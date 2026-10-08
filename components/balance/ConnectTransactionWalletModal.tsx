'use client';

import { useEffect, useRef, useState } from 'react';

import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import WalletIdentity from '@/components/balance/WalletIdentity';
import { Button } from '@/components/ui/button';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import type { Wallet } from '@/lib/types';

type Props = {
  wallets: Wallet[];
  onClose: () => void;
  onConnect: (walletId: string) => boolean;
};

export default function ConnectTransactionWalletModal({
  wallets,
  onClose,
  onConnect,
}: Props) {
  const [walletId, setWalletId] = useState('');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  const submittedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const save = () => {
    if (submittedRef.current) return;
    if (!wallets.some(wallet => wallet.id === walletId)) {
      setError('Choose a wallet first.');
      return;
    }
    submittedRef.current = true;
    try {
      if (!onConnect(walletId)) {
        submittedRef.current = false;
        setError('The wallet could not be connected. Check that the wallet and transaction still exist, then try again.');
        return;
      }
      if (mountedRef.current) onClose();
    } catch {
      submittedRef.current = false;
      setError('The wallet could not be connected. Your selection is kept; review the transaction and try again.');
    }
  };

  return (
    <CaizenFormDialog
      panelClassName="balance-form @container/balance-form"
      title="Connect wallet"
      onClose={onClose}
      maxWidthClass="max-w-md"
      bodyClassName="space-y-5"
      footer={(
        <div className="flex flex-col-reverse gap-2 @min-[30rem]/balance-form:flex-row @min-[30rem]/balance-form:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save} disabled={!wallets.some(wallet => wallet.id === walletId)}>Connect wallet</Button>
        </div>
      )}
    >
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        This links the historical transaction to a wallet for context. Your current wallet balance will not change.
      </div>

      {wallets.length === 0 ? <p className="text-sm text-muted-foreground">Add a wallet in the Wallets tab, then return to connect this transaction.</p> : null}

      <AndroidAdaptiveSelect
        label="Wallet"
        value={walletId}
        onChange={setWalletId}
        options={wallets.map(wallet => ({ value: wallet.id, label: wallet.name, icon: <WalletIdentity wallet={wallet} size="xs" /> }))}
        searchable={wallets.length > 8}
      />

      {error ? <p className="text-sm font-semibold text-destructive" role="alert">{error}</p> : null}

    </CaizenFormDialog>
  );
}
