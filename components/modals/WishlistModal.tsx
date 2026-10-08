'use client';

import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  Archive,
  CheckCircle2,
  Link2,
  Sparkles,
  X,
} from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { RecordImageField } from '@/components/common/RecordImageField';
import { PhotoSourceSheet } from '@/components/common/PhotoSourceSheet';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/money-input';
import { CreatableCombobox } from '@/components/ui/combobox';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { Switch } from '@/components/ui/switch';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { usePhotoSource } from '@/hooks/use-photo-source';
import { useAppContext } from '@/lib/context';
import {
  convertMoneyInputToBase,
  formatMoneyInputValue,
  formatPHP,
  getActiveCurrency,
  getEffectiveMoneyInputCurrency,
} from '@/lib/currency';
import { useProfileModuleTaxonomy } from '@/lib/module-taxonomy';
import { mediaStorage } from '@/lib/storage/media-storage';
import { collectMediaReferenceIds } from '@/lib/storage/media-references';
import { scheduleMediaCleanup } from '@/lib/storage/media-cleanup';
import { toLocalDateKey } from '@/lib/utils';
import type { CurrencyCode, PlanType, PriorityLevel } from '@/lib/types';

const DEFAULT_CATEGORIES = [
  'Personal Tech',
  'Home',
  'Wearables',
  'Health & Care',
  'Entertainment',
  'Travel',
  'Gifts',
  'Software',
  'Other',
];

type WishlistStatus = 'wanted' | 'bought' | 'archived';
const MONEY_PRIVACY_EVENT = 'caizen:money-privacy-change';

function handleRadioKey<T extends string>(
  event: KeyboardEvent<HTMLButtonElement>,
  values: readonly T[],
  onSelect: (value: T) => void,
) {
  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const enabledButtons = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') || [])];
  if (enabledButtons.length === 0) return;
  const currentIndex = Math.max(0, enabledButtons.indexOf(event.currentTarget));
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? enabledButtons.length - 1
      : (currentIndex + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + enabledButtons.length) % enabledButtons.length;
  const nextButton = enabledButtons[nextIndex];
  const nextValue = values.find(value => nextButton.dataset.value === value);
  if (!nextValue) return;
  onSelect(nextValue);
  nextButton.focus();
}

function subscribeToMoneyPrivacy(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(MONEY_PRIVACY_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(MONEY_PRIVACY_EVENT, onStoreChange);
  };
}

const PLAN_TYPES: Array<{ value: PlanType; label: string; description: string }> = [
  { value: 'item', label: 'Item', description: 'A physical purchase that may enter Inventory.' },
  { value: 'subscription', label: 'Subscription', description: 'A recurring or ongoing service cost.' },
  { value: 'health', label: 'Health', description: 'A future health-related expense.' },
  { value: 'service', label: 'Service', description: 'A planned service or professional cost.' },
  { value: 'travel', label: 'Travel', description: 'A future travel expense.' },
  { value: 'experience', label: 'Experience', description: 'An activity or event you want to fund.' },
  { value: 'other', label: 'Other', description: 'Another kind of future financial intent.' },
];

interface WishlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId?: string | null;
  startAsCompleted?: boolean;
  hideBalances?: boolean;
  currency?: CurrencyCode;
}

const inputStyle = `
  h-11 sm:h-10 w-full rounded-xl border border-border/70 bg-background
  px-3 text-sm outline-none transition-[border-color,box-shadow,background-color]
  focus:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0
`;

const textareaStyle = `
  min-h-24 w-full rounded-xl border border-border/70 bg-background
  px-3 py-2.5 text-sm outline-none transition-[border-color,box-shadow,background-color]
  focus:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/60 focus-visible:ring-0
`;

function Field({
  label,
  hint,
  htmlFor,
  labelId,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  labelId?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <label id={labelId} htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </label>
        {hint ? (
          <p className="mt-0.5 text-xs text-muted-foreground/80">{hint}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function dateInputValue(value?: Date | string | null) {
  if (!value) return '';
  return toLocalDateKey(value);
}

function createDraftId() {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `wish-${Date.now()}-${suffix}`;
}

export default function WishlistModal({
  isOpen,
  onClose,
  itemId,
  startAsCompleted = false,
  hideBalances,
  currency,
}: WishlistModalProps) {
  const {
    wishlistItems,
    wallets,
    currentProfileId,
    addWishlistItem,
    updateWishlistItem,
    completeWishlistItemToInventory,
  } = useAppContext();

  const item = itemId
    ? wishlistItems.find(entry => entry.id === itemId)
    : undefined;
  const isEditing = Boolean(item);
  const privacyKey = `money-hide-balances-${currentProfileId}`;
  const getPrivacySnapshot = useCallback(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(privacyKey) === 'true';
    } catch {
      return false;
    }
  }, [privacyKey]);
  const storedHideBalances = useSyncExternalStore(subscribeToMoneyPrivacy, getPrivacySnapshot, () => false);
  const balancesHidden = hideBalances ?? storedHideBalances;
  const purchaseLocked = Boolean(
    item?.destinationItemId || item?.walletDeductedAmount,
  );

  const taxonomy = useProfileModuleTaxonomy(
    'wishlist',
    DEFAULT_CATEGORIES,
    wishlistItems.map(entry => ({ category: entry.category })),
  );

  const eligibleWallets = useMemo(
    () =>
      wallets.filter(
        wallet =>
          wallet.useForWishlist === true ||
          (wallet.useForWishlist === undefined &&
            ['free_spending', 'cash_on_hand'].includes(wallet.type)),
      ),
    [wallets],
  );

  const fileRef = useRef<HTMLInputElement | null>(null);
  const initialSnapshotRef = useRef('');
  const initializedPlanKeyRef = useRef('');
  const moneyInputCurrencyRef = useRef<CurrencyCode>(
    getEffectiveMoneyInputCurrency(currency || getActiveCurrency()),
  );
  const moneyInputCurrency = moneyInputCurrencyRef.current;

  const [draftItemId, setDraftItemId] = useState('');
  const [name, setName] = useState('');
  const [planType, setPlanType] = useState<PlanType>('item');
  const [estimatedPrice, setEstimatedPrice] = useState('');
  const [actualPrice, setActualPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [walletId, setWalletId] = useState('');
  const [status, setStatus] = useState<WishlistStatus>('wanted');
  const [selected, setSelected] = useState(false);
  const [addToInventory, setAddToInventory] = useState(false);
  const [notes, setNotes] = useState('');
  const [productLink, setProductLink] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [photoAssetIds, setPhotoAssetIds] = useState<string[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const submitInFlightRef = useRef(false);

  const persistedMediaIds = useMemo(
    () => new Set(collectMediaReferenceIds(item || {})),
    [item],
  );
  const cleanupDraftMedia = useCallback(
    (
      assetIds: Iterable<string>,
      reason: 'attachment-detached' | 'draft-cancelled' = 'draft-cancelled',
    ) => {
      const draftOnlyIds = [...new Set(assetIds)].filter(
        assetId => !persistedMediaIds.has(assetId),
      );
      if (draftOnlyIds.length === 0) return;
      scheduleMediaCleanup({ profileId: currentProfileId, assetIds: draftOnlyIds, reason });
    },
    [currentProfileId, persistedMediaIds],
  );

  const discardDraftMedia = () => cleanupDraftMedia(photoAssetIds, 'draft-cancelled');

  const getSnapshot = useCallback(
    () =>
      JSON.stringify({
        name,
        planType,
        estimatedPrice,
        actualPrice,
        purchaseDate,
        targetDate,
        category,
        priority,
        walletId,
        status,
        selected,
        addToInventory,
        notes,
        productLink,
        imageUrl,
        image,
        photoAssetIds,
      }),
    [
      name,
      planType,
      estimatedPrice,
      actualPrice,
      purchaseDate,
      targetDate,
      category,
      priority,
      walletId,
      status,
      selected,
      addToInventory,
      notes,
      productLink,
      imageUrl,
      image,
      photoAssetIds,
    ],
  );

  const hasUnsavedChanges =
    isOpen &&
    Boolean(initialSnapshotRef.current) &&
    getSnapshot() !== initialSnapshotRef.current;

  const resetForm = useCallback(() => {
    setDraftItemId(createDraftId());
    setName('');
    setPlanType('item');
    setEstimatedPrice('');
    setActualPrice('');
    setPurchaseDate('');
    setTargetDate('');
    setCategory(DEFAULT_CATEGORIES[0]);
    setPriority('medium');
    setWalletId('');
    setStatus('wanted');
    setSelected(false);
    setAddToInventory(false);
    setNotes('');
    setProductLink('');
    setImageUrl('');
    setImage(null);
    setPhotoAssetIds([]);
    setMediaBusy(false);
    setMediaError(null);
    setSaveError(null);
    setShowUnsavedDialog(false);
    submitInFlightRef.current = false;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      initializedPlanKeyRef.current = '';
      return;
    }

    const planKey = `${item?.id || 'new'}:${startAsCompleted ? 'complete' : 'edit'}`;
    if (initializedPlanKeyRef.current === planKey) return;
    initializedPlanKeyRef.current = planKey;
    moneyInputCurrencyRef.current = getEffectiveMoneyInputCurrency(
      currency || getActiveCurrency(),
    );
    const nextMoneyCurrency = moneyInputCurrencyRef.current;

    if (item) {
      const nextStatus: WishlistStatus = startAsCompleted
        ? 'bought'
        : item.isArchived
          ? 'archived'
          : item.isBought
            ? 'bought'
            : 'wanted';
      const nextPurchaseDate = startAsCompleted
        ? dateInputValue(item.purchaseDate || item.purchaseCompletedAt || new Date())
        : dateInputValue(item.purchaseDate || item.purchaseCompletedAt);
      const nextActualPrice = startAsCompleted
        ? formatMoneyInputValue(item.actualPrice ?? item.estimatedPrice, nextMoneyCurrency)
        : formatMoneyInputValue(item.actualPrice, nextMoneyCurrency);
      const nextImage = item.image || null;
      const nextImageUrl = item.image?.startsWith('http') ? item.image : '';
      const nextPhotoIds = item.photoAssetIds || [];

      setDraftItemId(item.id);
      setName(item.name || '');
      setPlanType(item.type || 'item');
      setEstimatedPrice(formatMoneyInputValue(item.estimatedPrice, nextMoneyCurrency));
      setActualPrice(nextActualPrice);
      setPurchaseDate(nextPurchaseDate);
      setTargetDate(dateInputValue(item.targetDate));
      setCategory(item.category || DEFAULT_CATEGORIES[0]);
      setPriority(item.priority || 'medium');
      setWalletId(item.walletId || '');
      setStatus(nextStatus);
      setSelected(Boolean(item.selected));
      setAddToInventory(Boolean(item.destinationType === 'inventory' && item.destinationItemId));
      setNotes(item.notes || '');
      setProductLink(item.productLink || '');
      setImageUrl(nextImageUrl);
      setImage(nextImage);
      setPhotoAssetIds(nextPhotoIds);
      setMediaError(null);
      setSaveError(null);

      initialSnapshotRef.current = JSON.stringify({
        name: item.name || '',
        planType: item.type || 'item',
        estimatedPrice: formatMoneyInputValue(item.estimatedPrice, nextMoneyCurrency),
        actualPrice: nextActualPrice,
        purchaseDate: nextPurchaseDate,
        targetDate: dateInputValue(item.targetDate),
        category: item.category || DEFAULT_CATEGORIES[0],
        priority: item.priority || 'medium',
        walletId: item.walletId || '',
        status: nextStatus,
        selected: Boolean(item.selected),
        addToInventory: Boolean(item.destinationType === 'inventory' && item.destinationItemId),
        notes: item.notes || '',
        productLink: item.productLink || '',
        imageUrl: nextImageUrl,
        image: nextImage,
        photoAssetIds: nextPhotoIds,
      });
      return;
    }

    resetForm();
    const nextDraftId = createDraftId();
    setDraftItemId(nextDraftId);
    initialSnapshotRef.current = JSON.stringify({
      name: '',
      planType: 'item',
      estimatedPrice: '',
      actualPrice: '',
      purchaseDate: '',
      targetDate: '',
      category: DEFAULT_CATEGORIES[0],
      priority: 'medium',
      walletId: '',
      status: 'wanted',
      selected: false,
      addToInventory: false,
      notes: '',
      productLink: '',
      imageUrl: '',
      image: null,
      photoAssetIds: [],
    });
  }, [isOpen, item, resetForm, startAsCompleted]);

  const closeCleanly = useCallback(() => {
    initializedPlanKeyRef.current = '';
    initialSnapshotRef.current = '';
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const attemptClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return;
    }
    closeCleanly();
  }, [closeCleanly, hasUnsavedChanges]);

  const modalPanelRef = useRef<HTMLDivElement>(null);
  useOverlayLifecycle(isOpen, attemptClose, { containerRef: modalPanelRef });

  const savePhoto = useCallback(
    async (blob: Blob, fileName: string) => {
      if (!draftItemId) return;
      setMediaBusy(true);
      setMediaError(null);
      try {
        const asset = await mediaStorage.save(blob, {
          profileId: currentProfileId,
          ownerType: 'wishlist',
          ownerId: draftItemId,
          role: 'primary',
          fileName,
        });
        scheduleMediaCleanup({
          profileId: currentProfileId,
          assetIds: [asset.id],
          reason: 'draft-cancelled',
        });
        cleanupDraftMedia(photoAssetIds, 'attachment-detached');
        setPhotoAssetIds([asset.id]);
        setImage(null);
        setImageUrl('');
      } catch (error) {
        setMediaError(
          error instanceof Error
            ? error.message
            : 'The item photo could not be saved.',
        );
      } finally {
        setMediaBusy(false);
      }
    },
    [cleanupDraftMedia, currentProfileId, draftItemId, photoAssetIds],
  );

  const photoSource = usePhotoSource(async blob => {
    await savePhoto(
      blob,
      `wishlist-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`,
    );
  });

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await savePhoto(file, file.name);
  };

  const handleStatusChange = (nextStatus: WishlistStatus) => {
    if (purchaseLocked && nextStatus !== 'bought') return;
    setStatus(nextStatus);
    if (nextStatus !== 'wanted') setSelected(false);
    if (nextStatus === 'bought' && !purchaseDate) {
      setPurchaseDate(toLocalDateKey(new Date()));
      if (!actualPrice && estimatedPrice) setActualPrice(estimatedPrice);
    }
    if (nextStatus !== 'bought') setAddToInventory(false);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || submitInFlightRef.current) return;
    if (mediaBusy) {
      setSaveError('Wait for the plan image to finish saving, then try again.');
      return;
    }
    const parsedEstimatedPrice = estimatedPrice.trim() ? Number(estimatedPrice) : 0;
    const parsedActualPrice = actualPrice.trim() ? Number(actualPrice) : undefined;
    if (!Number.isFinite(parsedEstimatedPrice) || parsedEstimatedPrice < 0) {
      setSaveError('Enter a valid estimated cost of zero or more.');
      return;
    }
    if (parsedActualPrice !== undefined && (!Number.isFinite(parsedActualPrice) || parsedActualPrice < 0)) {
      setSaveError('Enter a valid actual cost of zero or more.');
      return;
    }
    const estimatedPriceBase = convertMoneyInputToBase(estimatedPrice, moneyInputCurrency);
    const actualPriceBase = convertMoneyInputToBase(actualPrice, moneyInputCurrency);
    if ((estimatedPrice.trim() && estimatedPriceBase === undefined) || (actualPrice.trim() && actualPriceBase === undefined)) {
      setSaveError('Enter valid cost amounts.');
      return;
    }
    submitInFlightRef.current = true;
    setSaveError(null);

    const payload = {
      id: draftItemId,
      profileId: currentProfileId,
      name: name.trim(),
      type: planType,
      estimatedPrice: estimatedPrice.trim() ? estimatedPriceBase : 0,
      actualPrice: actualPrice.trim() ? actualPriceBase : undefined,
      purchaseDate: purchaseDate || undefined,
      purchaseCompletedAt: status === 'bought'
        ? purchaseDate || item?.purchaseCompletedAt || undefined
        : item?.purchaseCompletedAt,
      targetDate: targetDate || undefined,
      category,
      priority,
      walletId: walletId || undefined,
      selected: status === 'wanted' ? selected : false,
      isBought: status === 'bought',
      isArchived: status === 'archived',
      notes,
      productLink,
      image,
      photoAssetIds,
    };

    try {
      if (status === 'bought' && planType === 'item' && addToInventory) {
        const inventoryItemId = completeWishlistItemToInventory(draftItemId, payload);
        if (!inventoryItemId) {
          setSaveError('The plan could not be linked to Inventory. Review the plan, then try again.');
          submitInFlightRef.current = false;
          return;
        }
      } else if (item) {
        updateWishlistItem(item.id, payload);
      } else {
        addWishlistItem(payload);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The plan could not be saved.');
      submitInFlightRef.current = false;
      return;
    }

    submitInFlightRef.current = false;
    closeCleanly();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <ConfirmDialog
        isOpen={showUnsavedDialog}
        title="Discard purchase plan changes?"
        message="Your unsaved purchase plan changes will be lost."
        confirmText="Discard changes"
        cancelText="Continue Editing"
        isDangerous
        onConfirm={() => {
          setShowUnsavedDialog(false);
          discardDraftMedia();
          closeCleanly();
        }}
        onCancel={() => setShowUnsavedDialog(false)}
      />

      <div className="fixed inset-0 z-[9999] overflow-y-auto">
        <div aria-hidden="true" className="fixed inset-0 bg-black/70 backdrop-blur-sm" />

        <div
          className="caizen-form-modal-root relative flex min-h-full items-center justify-center p-3 sm:p-4"
        >
          <div
            ref={modalPanelRef}
            tabIndex={-1}
            className="caizen-form-modal modal-card-enter relative flex max-h-[min(92dvh,56rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-border/70 bg-background shadow-2xl shadow-black/30"
            role="dialog"
            aria-modal="true"
            aria-labelledby="spending-plan-modal-title"
            aria-describedby="spending-plan-modal-description"
            onClick={event => event.stopPropagation()}
          >
            <div className="relative flex shrink-0 items-start justify-between gap-4 border-b border-border/50 px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <h2 id="spending-plan-modal-title" className="text-xl font-bold tracking-tight sm:text-2xl">
                  {isEditing ? 'Edit purchase plan' : 'Add purchase plan'}
                </h2>
                <p id="spending-plan-modal-description" className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  Plan a future purchase, service, or experience with an estimated cost and target date.
                </p>
              </div>

              <button
                type="button"
                onClick={attemptClose}
                aria-label="Close purchase plan editor"
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="relative flex min-h-0 flex-1 flex-col">
              <div className="caizen-form-modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
                  <div className="space-y-5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Plan basics</p>
                      <p className="mt-1 text-xs text-muted-foreground">The essentials for finding and prioritizing this plan.</p>
                    </div>
                    <Field label="Plan name" htmlFor="wishlist-item-name">
                      <input
                        id="wishlist-item-name"
                        value={name}
                        onChange={event => setName(event.target.value)}
                        placeholder="e.g. Noise-cancelling headphones"
                        className={inputStyle}
                        required
                      />
                    </Field>

                    <Field label="Type" hint="Choose the kind of future spending this represents." htmlFor="wishlist-plan-type">
                      <AndroidAdaptiveSelect
                        id="wishlist-plan-type"
                        label="Plan type"
                        value={planType}
                        onChange={value => {
                          setPlanType(value as PlanType);
                          if (value !== 'item') setAddToInventory(false);
                        }}
                        className={inputStyle}
                        options={PLAN_TYPES.map(option => ({
                          value: option.value,
                          label: option.label,
                          description: option.description,
                        }))}
                      />
                    </Field>

                    <div>
                      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-primary">Classification</p>
                      <div className="grid gap-4 md:grid-cols-2">
                      <Field
                        label="Estimated cost"
                        hint="The amount you expect to pay."
                        htmlFor="wishlist-estimated-price"
                      >
                        <MoneyInput
                          id="wishlist-estimated-price"
                          currency={moneyInputCurrency}
                          type={balancesHidden ? 'password' : 'number'}
                          inputMode="decimal"
                          autoComplete="off"
                          min="0"
                          step="0.01"
                          value={estimatedPrice}
                          onChange={event => setEstimatedPrice(event.target.value)}
                          placeholder="0"
                        />
                      </Field>

                      <Field label="Priority" htmlFor="wishlist-priority">
                        <AndroidAdaptiveSelect
                          id="wishlist-priority"
                          label="Priority"
                          value={priority}
                          onChange={value => setPriority(value as PriorityLevel)}
                          className={inputStyle}
                          options={[
                            { value: 'high', label: 'High priority' },
                            { value: 'medium', label: 'Medium priority' },
                            { value: 'low', label: 'Low priority' },
                          ]}
                        />
                      </Field>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Category" htmlFor="wishlist-category">
                        <CreatableCombobox
                          id="wishlist-category"
                          ariaLabel="Category"
                          value={category}
                          onChange={value => {
                            taxonomy.addCategory(value);
                            setCategory(value.trim());
                          }}
                          options={taxonomy.activeCategories.map(entry => ({
                            value: entry.name,
                            label: entry.name,
                          }))}
                          className={inputStyle}
                        />
                      </Field>

                      <Field label="Funding wallet" hint="Optional." htmlFor="wishlist-wallet">
                        <AndroidAdaptiveSelect
                          id="wishlist-wallet"
                          label="Funding wallet"
                          value={walletId}
                          onChange={setWalletId}
                          className={inputStyle}
                          options={[
                            { value: '', label: 'Any funding wallet' },
                            ...eligibleWallets.map(wallet => ({
                              value: wallet.id,
                              label: balancesHidden ? `${wallet.name} · Balance hidden` : `${wallet.name} · ${formatPHP(wallet.balance)}`,
                            })),
                          ]}
                        />
                      </Field>
                    </div>

                    <div>
                      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-primary">Status and completion</p>
                    <Field label="Status" labelId="wishlist-status-label">
                      <div id="wishlist-status" role="radiogroup" aria-labelledby="wishlist-status-label" className="grid gap-2 sm:grid-cols-3">
                        {[
                          { key: 'wanted', label: 'Planned', icon: Sparkles },
                          { key: 'bought', label: planType === 'item' ? 'Purchased' : 'Completed', icon: CheckCircle2 },
                          { key: 'archived', label: 'Archived', icon: Archive },
                        ].map(option => {
                          const Icon = option.icon;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              role="radio"
                              aria-checked={status === option.key}
                              data-value={option.key}
                              tabIndex={status === option.key ? 0 : -1}
                              disabled={purchaseLocked && option.key !== 'bought'}
                              onKeyDown={event => handleRadioKey(
                                event,
                                ['wanted', 'bought', 'archived'] as const,
                                handleStatusChange,
                              )}
                              onClick={() =>
                                handleStatusChange(option.key as WishlistStatus)
                              }
                              className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                status === option.key
                                  ? 'border-primary/40 bg-primary/10 text-foreground'
                                  : 'border-border/50 bg-background/50 text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <p className="text-sm font-bold">{option.label}</p>
                            </button>
                          );
                        })}
                      </div>
                      {purchaseLocked ? (
                        <p className="text-xs text-muted-foreground">
                          This purchase is linked to another module or wallet deduction.
                          Its completed status is locked to protect those records.
                        </p>
                      ) : null}
                    </Field>
                    </div>

                    {status === 'wanted' ? (
                      <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-bold">Select for simulation</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              Compare this plan’s cost with your available purchase funds. No money is reserved.
                            </p>
                          </div>
                          <Switch
                            checked={selected}
                            onCheckedChange={setSelected}
                            aria-label="Select for simulation"
                          />
                        </div>
                      </div>
                    ) : null}

                    {status === 'bought' ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Actual cost" htmlFor="wishlist-actual-price">
                          <MoneyInput
                            id="wishlist-actual-price"
                            currency={moneyInputCurrency}
                            type={balancesHidden ? 'password' : 'number'}
                            inputMode="decimal"
                            autoComplete="off"
                            min="0"
                            step="0.01"
                            value={actualPrice}
                            onChange={event => setActualPrice(event.target.value)}
                            placeholder="0"
                          />
                        </Field>
                        <Field label={planType === 'item' ? 'Purchased date' : 'Completed date'} htmlFor="wishlist-purchase-date">
                          <AdaptiveDatePicker
                            id="wishlist-purchase-date"
                            label={planType === 'item' ? 'Purchased date' : 'Completed date'}
                            value={purchaseDate}
                            onChange={setPurchaseDate}
                            className={inputStyle}
                          />
                        </Field>
                      </div>
                    ) : null}

                    {status === 'bought' && planType === 'item' ? (
                      <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-bold">Add to Inventory</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              Create an Inventory item when you save this completed purchase.
                            </p>
                          </div>
                          <Switch
                            checked={addToInventory}
                            onCheckedChange={setAddToInventory}
                            disabled={Boolean(item?.destinationItemId)}
                            aria-label="Add completed item to Inventory"
                          />
                        </div>
                        {item?.destinationItemId ? (
                          <p className="mt-2 text-xs text-muted-foreground">This plan is already linked to Inventory.</p>
                        ) : null}
                      </div>
                    ) : null}

                    <Field label="Target date" hint="Optional. This does not create a calendar event." htmlFor="wishlist-target-date">
                      <AdaptiveDatePicker
                        id="wishlist-target-date"
                        label="Target date"
                        value={targetDate}
                        onChange={setTargetDate}
                        className={inputStyle}
                      />
                    </Field>

                    <Field label="Reference URL" htmlFor="wishlist-product-link">
                      <div className="relative">
                        <Link2 className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                        <input
                          id="wishlist-product-link"
                          value={productLink}
                          onChange={event => setProductLink(event.target.value)}
                          placeholder="https://..."
                          className={`${inputStyle} pl-11`}
                        />
                      </div>
                    </Field>

                    <Field label="Notes" htmlFor="wishlist-notes">
                      <textarea
                        id="wishlist-notes"
                        value={notes}
                        onChange={event => setNotes(event.target.value)}
                        maxLength={1000}
                        placeholder={'Why I want it\nWhen to buy\nBest price target'}
                        className={textareaStyle}
                      />
                      <p className="text-right text-xs text-muted-foreground">
                        {notes.length} / 1000
                      </p>
                    </Field>
                  </div>

                  <div className="space-y-4 lg:sticky lg:top-0">
                    <section className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
                      <RecordImageField
                        preview={photoAssetIds[0] ? (
                          <MediaAssetImage
                            profileId={currentProfileId}
                            assetId={photoAssetIds[0]}
                            alt={name || 'Plan'}
                            variant="full"
                            className="h-full w-full object-cover"
                          />
                        ) : image ? (
                          <img src={image} alt={name || 'Plan'} className="h-full w-full object-cover" />
                        ) : null}
                        hasPreview={Boolean(photoAssetIds.length || image)}
                        alt={`${name || 'Plan'} image`}
                        label="Plan image"
                        description="Upload, take a photo, or use an image URL."
                        chooseLabel="Add plan image"
                        onChoose={() => photoSource.supportsNativeCapture ? photoSource.open() : fileRef.current?.click()}
                        onRemove={() => {
                          cleanupDraftMedia(photoAssetIds, 'attachment-detached');
                          setPhotoAssetIds([]);
                          setImage(null);
                          setImageUrl('');
                        }}
                        disabled={mediaBusy}
                        controls={(
                          <>
                            <input ref={fileRef} type="file" hidden accept="image/*" onChange={handleUpload} />
                            <Field label="Image URL" htmlFor="wishlist-image-url">
                              <input
                                id="wishlist-image-url"
                                value={imageUrl}
                                onChange={event => {
                                  const value = event.target.value;
                                  setImageUrl(value);
                                  setImage(value.trim() || null);
                                  if (value.trim()) setPhotoAssetIds([]);
                                }}
                                placeholder="https://example.com/image.jpg"
                                className={inputStyle}
                              />
                            </Field>
                          </>
                        )}
                      />

                      {mediaError ? (
                        <p className="mt-3 text-sm text-destructive" role="alert">
                          {mediaError}
                        </p>
                      ) : null}
                    </section>

                  </div>
                </div>
              </div>

              {saveError ? (
                <p className="px-4 pb-3 text-sm font-semibold text-destructive sm:px-5" role="alert">
                  {saveError}
                </p>
              ) : null}

              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/50 bg-background px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={attemptClose}
                  className="h-11 rounded-xl px-5 sm:h-10"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!name.trim() || mediaBusy}
                  className="h-11 rounded-xl px-5 font-semibold sm:h-10"
                >
                  {isEditing ? 'Save Changes' : 'Add purchase plan'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <PhotoSourceSheet
        open={photoSource.sheetOpen}
        title="Item photo"
        canRemove={Boolean(photoAssetIds.length || image || imageUrl)}
        onCamera={photoSource.chooseCamera}
        onGallery={photoSource.chooseGallery}
        onRemove={() => {
          cleanupDraftMedia(photoAssetIds, 'attachment-detached');
          setPhotoAssetIds([]);
          setImage(null);
          setImageUrl('');
          photoSource.close();
        }}
        onClose={photoSource.close}
      />
    </>,
    document.body,
  );
}
