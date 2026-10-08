'use client';

import { memo } from 'react';
import { PiggyBank, Wallet as WalletIcon } from 'lucide-react';

import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import type { Wallet } from '@/lib/types';
import { cn } from '@/lib/utils';

type WalletIdentityProps = {
  wallet?: Wallet | null;
  profileId?: string;
  size?: 'xs' | 'sm' | 'md';
  showName?: boolean;
  className?: string;
};

const sizes = {
  xs: 'size-5 rounded-md',
  sm: 'size-7 rounded-lg',
  md: 'size-10 rounded-xl',
} as const;

export const WalletIdentity = memo(function WalletIdentity({
  wallet,
  profileId,
  size = 'sm',
  showName = false,
  className,
}: WalletIdentityProps) {
  const fallback = wallet?.type === 'savings' || wallet?.type === 'investment'
    ? <PiggyBank className={size === 'md' ? 'size-5' : 'size-3.5'} aria-hidden="true" />
    : <WalletIcon className={size === 'md' ? 'size-5' : 'size-3.5'} aria-hidden="true" />;

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span
        className={cn('grid shrink-0 place-items-center overflow-hidden border border-border/50 bg-card text-muted-foreground', sizes[size])}
        style={{ color: wallet?.color || undefined }}
        aria-hidden={showName ? 'true' : undefined}
      >
        {wallet?.avatarAssetId && profileId ? (
          <MediaAssetImage
            assetId={wallet.avatarAssetId}
            profileId={profileId}
            alt={showName ? '' : `${wallet.name} wallet image`}
            className="h-full w-full object-cover"
            fallback={fallback}
          />
        ) : fallback}
      </span>
      {showName && wallet ? <span className="min-w-0 truncate">{wallet.name}</span> : null}
    </span>
  );
});

export default WalletIdentity;
