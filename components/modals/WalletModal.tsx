'use client';

import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { usePhotoSource } from '@/hooks/use-photo-source';
import { PhotoSourceSheet } from '@/components/common/PhotoSourceSheet';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';

import {
  Check,
  Target,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { FormField } from '@/components/common/FormPatterns';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { RecordImageField } from '@/components/common/RecordImageField';
import {
  convertMoneyInputToBase,
  formatCurrency,
  formatMoneyInputValue,
  getActiveCurrency,
  getBaseCurrency,
  getEffectiveMoneyInputCurrency,
  useCurrencyState,
} from '@/lib/currency';
import { Switch } from '@/components/ui/switch';
import { fetchWalletImageFromUrl, getWalletImageFromPaste, validateWalletImageBlob } from '@/lib/wallet-image';

import {
  CurrencyCode,
  Wallet,
  WalletType,
} from '@/lib/types';

const WALLET_COLORS = [
  '#3B82F6',
  '#EC4899',
  '#8B5CF6',
  '#06B6D4',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#22C55E',
];

const WALLET_COLOR_LABELS: Record<string, string> = {
  '#3B82F6': 'blue',
  '#EC4899': 'pink',
  '#8B5CF6': 'purple',
  '#06B6D4': 'cyan',
  '#10B981': 'teal',
  '#F59E0B': 'amber',
  '#EF4444': 'red',
  '#22C55E': 'green',
};

const WALLET_TYPES: {
  value: WalletType;
  label: string;
  description: string;
}[] = [
  {
    value: 'free_spending',
    label: 'Free spending',
    description: 'Personal wants and flexible purchases.',
  },
  {
    value: 'cash_on_hand',
    label: 'Cash on hand',
    description: 'Cash, payroll, or available money.',
  },
  {
    value: 'savings',
    label: 'Savings',
    description: 'Protected savings or goal money.',
  },
  {
    value: 'investment',
    label: 'Investment',
    description: 'Long-term money and future funds.',
  },
];

const PURPOSE_OPTIONS = [
  'Daily Spending',
  'Payroll',
  'Free Spending',
  'Food Budget',
  'Bills',
  'Travel',
  'House Fund',
  'Emergency Fund',
  'Tax / Annual Fees',
  'Investment',
  'Cash',
  'Other',
];

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileId?: string;
  wallet?: Wallet | null;
  hideBalances?: boolean;
  currency?: CurrencyCode;
  onSave: (wallet: {
    name: string;
    balance: number;
    color: string;
    type: WalletType;
    useForWishlist: boolean;
    includeInSpendable?: boolean;
    isProtected?: boolean;
    purpose?: string;
    avatarAssetId?: string;
    pendingImage?: { blob: Blob; fileName: string };
    removeImage?: boolean;
  }) => void | Promise<void>;
}

export default function WalletModal({
  isOpen,
  onClose,
  profileId,
  wallet,
  hideBalances = false,
  currency,
  onSave,
}: WalletModalProps) {
  const isEditing = Boolean(wallet);
  useCurrencyState();
  const baseCurrency = getBaseCurrency();
  const displayCurrency = getActiveCurrency();
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(currency || displayCurrency),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;

  const [name, setName] =
    useState('');

  const [balance, setBalance] =
    useState('0');

  const [type, setType] =
    useState<WalletType>('free_spending');

  const [
    useForWishlist,
    setUseForWishlist,
  ] = useState(true);

  const [
    includeInSpendable,
    setIncludeInSpendable,
  ] = useState(true);

  const [
    isProtected,
    setIsProtected,
  ] = useState(false);

  const [
    purpose,
    setPurpose,
  ] = useState('Free Spending');

  const [avatarAssetId, setAvatarAssetId] = useState('');
  const [pendingImage, setPendingImage] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const lastImageUrlAttemptedRef = useRef('');
  const [imageBusy, setImageBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const saveInFlightRef = useRef(false);
  const imageInFlightRef = useRef(false);
  const initializedWalletKeyRef = useRef('');

  const [
    selectedColor,
    setSelectedColor,
  ] = useState(WALLET_COLORS[0]);

  const [
    showUnsavedDialog,
    setShowUnsavedDialog,
  ] = useState(false);

  const initialSnapshotRef = useRef('');

  const getDefaultsForType = (
    walletType: WalletType
  ) => {
    const isFlexible =
      ['free_spending', 'cash_on_hand'].includes(
        walletType
      );

    const isProtectedType =
      ['savings', 'investment'].includes(
        walletType
      );

    return {
      useForWishlist: isFlexible,
      includeInSpendable: isFlexible,
      isProtected: isProtectedType,
      purpose:
        walletType === 'free_spending'
          ? 'Free Spending'
          : walletType === 'cash_on_hand'
            ? 'Cash'
            : walletType === 'savings'
              ? 'Emergency Fund'
              : 'Investment',
    };
  };

  const snapshotOf = (fields: {
    name: string;
    balance: string;
    type: WalletType;
    selectedColor: string;
    useForWishlist: boolean;
    includeInSpendable: boolean;
    isProtected: boolean;
    purpose: string;
    avatarAssetId: string;
  }) => JSON.stringify({
    ...fields,
    hasPendingImage: false,
    removeImage: false,
    imageUrl: '',
  });

  useEffect(() => {
    if (!isOpen) {
      saveInFlightRef.current = false;
      initializedWalletKeyRef.current = '';
      initialSnapshotRef.current = '';
      return;
    }

    const walletKey = wallet?.id || 'new';
    if (initializedWalletKeyRef.current === walletKey) return;
    initializedWalletKeyRef.current = walletKey;
    moneyInputCurrencyRef.current = getEffectiveMoneyInputCurrency(
      currency || getActiveCurrency(),
    );
    const nextMoneyCurrency = moneyInputCurrencyRef.current;

    if (wallet) {
      const walletAny =
        wallet as any;

      const walletType =
        wallet.type || 'free_spending';

      const defaults =
        getDefaultsForType(walletType);

      const nextFields = {
        name: wallet.name || '',
        balance: formatMoneyInputValue(wallet.balance ?? 0, nextMoneyCurrency),
        type: walletType,
        selectedColor: wallet.color || WALLET_COLORS[0],
        useForWishlist: wallet.useForWishlist ?? defaults.useForWishlist,
        includeInSpendable: walletAny.includeInSpendable ?? defaults.includeInSpendable,
        isProtected: walletAny.isProtected ?? defaults.isProtected,
        purpose: walletAny.purpose || defaults.purpose,
        avatarAssetId: wallet.avatarAssetId || '',
      };

      setName(nextFields.name);
      setBalance(nextFields.balance);
      setType(nextFields.type);
      setSelectedColor(nextFields.selectedColor);
      setUseForWishlist(nextFields.useForWishlist);
      setIncludeInSpendable(nextFields.includeInSpendable);
      setIsProtected(nextFields.isProtected);
      setPurpose(nextFields.purpose);
      setAvatarAssetId(nextFields.avatarAssetId);
      setPendingImage(null);
      setRemoveImage(false);
      setImageUrl('');
      setSaveError('');
      initialSnapshotRef.current = snapshotOf(nextFields);

      return;
    }

    const defaults =
      getDefaultsForType('free_spending');

    const nextFields = {
      name: '',
      balance: '0',
      type: 'free_spending' as WalletType,
      selectedColor: WALLET_COLORS[0],
      useForWishlist: defaults.useForWishlist,
      includeInSpendable: defaults.includeInSpendable,
      isProtected: defaults.isProtected,
      purpose: defaults.purpose,
      avatarAssetId: '',
    };

    setName(nextFields.name);
    setBalance(nextFields.balance);
    setType(nextFields.type);
    setUseForWishlist(nextFields.useForWishlist);
    setIncludeInSpendable(nextFields.includeInSpendable);
    setIsProtected(nextFields.isProtected);
    setPurpose(nextFields.purpose);
    setAvatarAssetId(nextFields.avatarAssetId);
    setPendingImage(null);
    setRemoveImage(false);
    setImageUrl('');
    setSaveError('');
    setSelectedColor(nextFields.selectedColor);
    initialSnapshotRef.current = snapshotOf(nextFields);
  }, [isOpen, wallet, currency]);

  useEffect(() => {
    if (!pendingImage) {
      setPendingImagePreview('');
      return;
    }
    const url = URL.createObjectURL(pendingImage.blob);
    setPendingImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  const onImageBlob = useCallback((blob: Blob, fileName: string) => {
    setPendingImage({ blob, fileName });
    setAvatarAssetId('');
    setRemoveImage(false);
    setImageUrl('');
    lastImageUrlAttemptedRef.current = '';
    setSaveError('');
  }, []);
  const photoSource = usePhotoSource(onImageBlob);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void acceptImage({ blob: file, fileName: file.name });
  };

  const acceptImage = async (input: { blob: Blob; fileName: string }) => {
    if (imageInFlightRef.current || saveInFlightRef.current || photoSource.busy) return;
    imageInFlightRef.current = true;
    setImageBusy(true);
    setSaveError('');
    try {
      const validated = await validateWalletImageBlob(input);
      onImageBlob(validated.blob, validated.fileName);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The wallet image could not be used.');
    } finally {
      imageInFlightRef.current = false;
      setImageBusy(false);
    }
  };

  const handleImageUrl = async () => {
    const requestedUrl = imageUrl.trim();
    if (!requestedUrl || imageInFlightRef.current || saveInFlightRef.current || photoSource.busy) return;
    imageInFlightRef.current = true;
    lastImageUrlAttemptedRef.current = requestedUrl;
    setImageBusy(true);
    setSaveError('');
    try {
      const image = await fetchWalletImageFromUrl(requestedUrl);
      onImageBlob(image.blob, image.fileName);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The image URL could not be used.');
    } finally {
      imageInFlightRef.current = false;
      setImageBusy(false);
    }
  };

  const handleImagePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pastedImage = getWalletImageFromPaste(event);
    if (!pastedImage) return;
    event.preventDefault();
    void acceptImage(pastedImage);
  };

  const handleTypeChange = (
    newType: WalletType
  ) => {
    const defaults =
      getDefaultsForType(newType);

    setType(newType);
    setUseForWishlist(defaults.useForWishlist);
    setIncludeInSpendable(
      defaults.includeInSpendable
    );
    setIsProtected(defaults.isProtected);
    setPurpose(defaults.purpose);
  };

  const handleRadioKey = <T extends string,>(
    event: KeyboardEvent<HTMLButtonElement>,
    values: readonly T[],
    selectedValue: T,
    onSelect: (value: T) => void,
  ) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = Math.max(0, values.indexOf(selectedValue));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? values.length - 1
        : (currentIndex + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + values.length) % values.length;
    onSelect(values[nextIndex]);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[nextIndex]?.focus();
  };

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();
    if (saveInFlightRef.current) return;

    if (!name.trim()) return;

    const parsedBalance = Number(balance);
    if (balance.trim() === '' || !Number.isFinite(parsedBalance)) {
      setSaveError('Enter a valid wallet balance.');
      return;
    }
    const baseBalance = convertMoneyInputToBase(balance, moneyInputCurrency);
    if (baseBalance === undefined) {
      setSaveError('Enter valid money amounts.');
      return;
    }
    if (imageInFlightRef.current || photoSource.busy) {
      setSaveError('Wait for the wallet image to finish loading, then try again.');
      return;
    }

    saveInFlightRef.current = true;
    setSaveBusy(true);
    setSaveError('');
    try {
      await onSave({
        name: name.trim(),
        balance: baseBalance,
        color: selectedColor,
        type,
        useForWishlist,
        includeInSpendable,
        isProtected,
        purpose,
        avatarAssetId: avatarAssetId || undefined,
        pendingImage: pendingImage || undefined,
        removeImage,
      });
      onClose();
    } catch (error) {
      saveInFlightRef.current = false;
      setSaveError(error instanceof Error ? error.message : 'The wallet could not be saved. Review its details, then try again.');
    } finally {
      setSaveBusy(false);
    }
  };

  const currentSnapshot = JSON.stringify({
    name,
    balance,
    type,
    selectedColor,
    useForWishlist,
    includeInSpendable,
    isProtected,
    purpose,
    avatarAssetId,
    hasPendingImage: Boolean(pendingImage),
    removeImage,
    imageUrl: imageUrl.trim(),
  });
  const hasUnsavedChanges =
    initialSnapshotRef.current !== '' &&
    currentSnapshot !== initialSnapshotRef.current;

  const attemptClose = () => {
    if (saveInFlightRef.current || imageInFlightRef.current || photoSource.busy) return;
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return;
    }

    onClose();
  };

  // The nested "Discard Changes?" ConfirmDialog registers with the same
  // overlay stack, so while it is open it is topmost and this Escape/Back
  // registration for the wallet form itself is simply not consulted - no
  // need to manually guard on showUnsavedDialog.
  if (
    !isOpen ||
    typeof document === 'undefined'
  ) {
    return null;
  }

  return (
    <>
      <CaizenFormDialog
        panelClassName="balance-form @container/balance-form"
        title={isEditing ? 'Edit wallet' : 'Add wallet'}
        descriptionId="wallet-modal-description"
        description="Choose which totals this wallet contributes to and update its current balance."
        onClose={onClose}
        onBeforeClose={() => {
          if (saveInFlightRef.current || imageInFlightRef.current || photoSource.busy) return false;
          if (hasUnsavedChanges) {
            setShowUnsavedDialog(true);
            return false;
          }
          return true;
        }}
        maxWidthClass="max-w-3xl"
        maxHeightClass="max-h-[90dvh]"
        bodyClassName="p-0"
        footer={(
          <div className="flex flex-col-reverse gap-2 @min-[30rem]/balance-form:flex-row @min-[30rem]/balance-form:justify-end">
            <Button type="button" variant="outline" onClick={attemptClose} className="h-11 rounded-xl px-5 sm:h-10">Cancel</Button>
            <Button type="submit" form="wallet-edit-form" disabled={!name.trim() || saveBusy || imageBusy || photoSource.busy} className="h-11 rounded-xl px-5 font-semibold sm:h-10">
              {saveBusy ? 'Saving…' : isEditing ? 'Save wallet' : 'Add wallet'}
            </Button>
          </div>
        )}
      >
          <form
            id="wallet-edit-form"
            onSubmit={handleSubmit}
            className="relative min-w-0"
          >
            <div className="caizen-form-modal-body p-4 sm:p-5">
            <div className="grid min-w-0 gap-5 @min-[38rem]/balance-form:grid-cols-2">
              <div className="min-w-0 space-y-4">
                <FormField label="Wallet name">
                  <Input
                    type="text"
                    autoComplete="off"
                    data-caizen-character-pop="on"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Free Spending"
                    className="h-11 bg-background sm:h-10"
                  />
                </FormField>

                <div
                  className="rounded-2xl border border-border/55 bg-card/45 p-3 focus-within:border-primary/40"
                  onPaste={handleImagePaste}
                  tabIndex={0}
                  aria-label="Wallet image controls"
                >
                  <RecordImageField
                    preview={pendingImagePreview ? (
                      <img src={pendingImagePreview} alt="Wallet image preview" className="h-full w-full object-cover" />
                    ) : avatarAssetId && profileId && !removeImage ? (
                      <MediaAssetImage profileId={profileId} assetId={avatarAssetId} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Target className="size-5 text-muted-foreground" aria-hidden="true" />
                    )}
                    hasPreview={Boolean(pendingImagePreview || (avatarAssetId && !removeImage))}
                    alt="wallet image"
                    label="Wallet image"
                    chooseLabel="Choose image"
                    onChoose={() => photoSource.supportsNativeCapture ? photoSource.open() : fileRef.current?.click()}
                    onRemove={() => { setPendingImage(null); setAvatarAssetId(''); setRemoveImage(true); }}
                    disabled={saveBusy || imageBusy || photoSource.busy}
                    controls={(
                      <>
                        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleFile} />
                        <div>
                          <label htmlFor="wallet-image-url" className="sr-only">Wallet image URL</label>
                          <Input
                            id="wallet-image-url"
                            type="url"
                            value={imageUrl}
                            disabled={saveBusy || imageBusy || photoSource.busy}
                            onChange={event => {
                              lastImageUrlAttemptedRef.current = '';
                              setImageUrl(event.target.value);
                              setSaveError('');
                            }}
                            onKeyDown={event => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              void handleImageUrl();
                            }}
                            onBlur={() => {
                              const nextUrl = imageUrl.trim();
                              if (nextUrl && nextUrl !== lastImageUrlAttemptedRef.current) {
                                void handleImageUrl();
                              }
                            }}
                            placeholder="https://example.com/wallet.png"
                            className="min-h-11 min-w-0 flex-1"
                          />
                        </div>
                        {imageBusy ? <p className="text-xs text-muted-foreground" role="status">Fetching image…</p> : null}
                        {photoSource.error ? <p className="text-xs font-semibold text-destructive" role="alert">{photoSource.error}</p> : null}
                      </>
                    )}
                  />
                </div>

                <FormField
                  label="Balance"
                  hint={(
                    <>
                      Saved in {baseCurrency}.
                      {!hideBalances && moneyInputCurrency !== baseCurrency && Number(balance) > 0
                        ? ` Stored as ${formatCurrency(convertMoneyInputToBase(balance, moneyInputCurrency))}.`
                        : ' Changing display currency does not rewrite this balance.'}
                    </>
                  )}
                >
                    <MoneyInput
                      type={hideBalances ? 'password' : 'number'}
                      inputMode="decimal"
                      autoComplete="off"
                      value={balance}
                      onChange={e =>
                        setBalance(e.target.value)
                      }
                      step="0.01"
                      placeholder="0.00"
                      currency={moneyInputCurrency}
                    />
                </FormField>

                <FormField label="Purpose">
                  <AndroidAdaptiveSelect
                    label="Purpose"
                    value={purpose}
                    onChange={setPurpose}
                    className="h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-colors focus:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0 sm:h-10"
                    options={PURPOSE_OPTIONS.map(item => ({
                      value: item,
                      label: item,
                    }))}
                  />
                </FormField>

                <div className="divide-y divide-border/50">
                  <WalletRuleToggle
                    title="Count as available money"
                    description="Counts toward Available now and Available after payments."
                    checked={includeInSpendable}
                    onChange={() =>
                      setIncludeInSpendable(prev => !prev)
                    }
                  />

                  <WalletRuleToggle
                    title="Use for purchase plans"
                    description="Counts toward purchase affordability before upcoming payments are deducted."
                    checked={useForWishlist}
                    onChange={() =>
                      setUseForWishlist(prev => !prev)
                    }
                  />

                  <WalletRuleToggle
                    title="Protected wallet"
                    description="Marks this as savings, emergency, house fund, or long-term money."
                    checked={isProtected}
                    onChange={() =>
                      setIsProtected(prev => !prev)
                    }
                  />
                  <p className="pb-1 text-xs leading-relaxed text-muted-foreground">
                    Available money and protected money are independent labels; a wallet can count toward both.
                  </p>
                </div>
              </div>

              <div className="min-w-0 space-y-4">
                <div>
                  <label className="mb-1.5 block text-label text-muted-foreground">
                    Wallet type
                  </label>

                  <div className="grid gap-2 @min-[30rem]/balance-form:grid-cols-2" role="radiogroup" aria-label="Wallet type">
                    {WALLET_TYPES.map(item => (
                      <button
                        key={item.value}
                        type="button"
                        role="radio"
                        aria-checked={type === item.value}
                        tabIndex={type === item.value ? 0 : -1}
                        onKeyDown={event => handleRadioKey(
                          event,
                          WALLET_TYPES.map(option => option.value),
                          type,
                          handleTypeChange,
                        )}
                        onClick={() =>
                          handleTypeChange(item.value)
                        }
                        className={`
                          rounded-xl border p-3 text-left transition-colors
                          ${
                            type === item.value
                              ? 'border-primary/40 bg-primary/10 text-foreground'
                              : 'border-border/50 bg-background/50 text-muted-foreground hover:text-foreground'
                          }
                        `}
                      >
                        <p className="text-sm font-bold">
                          {item.label}
                        </p>

                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-label text-muted-foreground">
                    Wallet color
                  </label>

                  <div className="grid grid-cols-4 gap-3" role="radiogroup" aria-label="Wallet color">
                    {WALLET_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        role="radio"
                        aria-checked={selectedColor === color}
                        tabIndex={selectedColor === color ? 0 : -1}
                        onKeyDown={event => handleRadioKey(
                          event,
                          WALLET_COLORS,
                          selectedColor,
                          setSelectedColor,
                        )}
                        aria-label={`Wallet color ${WALLET_COLOR_LABELS[color] || color}`}
                        onClick={() =>
                          setSelectedColor(color)
                        }
                        className={`
                          mx-auto grid size-11 place-items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                          ${
                            selectedColor === color
                              ? 'border-foreground ring-2 ring-foreground ring-offset-2 ring-offset-background'
                              : 'border-border/50 hover:border-foreground/50'
                          }
                        `}
                        style={{
                          backgroundColor: color,
                        }}
                      >
                        {selectedColor === color ? <Check className="size-4 rounded-full bg-background p-0.5 text-foreground shadow-sm" aria-hidden="true" /> : null}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </div>
            </div>

            {saveError ? <p className="px-4 pb-3 text-sm font-semibold text-destructive" role="alert">{saveError}</p> : null}

          </form>
      </CaizenFormDialog>

      <PhotoSourceSheet
        open={photoSource.sheetOpen}
        title="Wallet image"
        canRemove={Boolean(avatarAssetId || pendingImage)}
        onCamera={photoSource.chooseCamera}
        onGallery={photoSource.chooseGallery}
        onRemove={() => {
          setPendingImage(null);
          setAvatarAssetId('');
          setRemoveImage(true);
          photoSource.close();
        }}
        onClose={photoSource.close}
      />

      <ConfirmDialog
        isOpen={showUnsavedDialog}
        title="Discard wallet changes?"
        message="Your unsaved wallet changes will be lost."
        confirmText="Discard"
        cancelText="Continue Editing"
        isDangerous
        onConfirm={() => {
          setShowUnsavedDialog(false);
          onClose();
        }}
        onCancel={() =>
          setShowUnsavedDialog(false)
        }
      />
    </>
  );
}

function WalletRuleToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold">
            {title}
          </p>

          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>

        <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
      </div>
    </div>
  );
}
