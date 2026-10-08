'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  Image as ImageIcon,
  ListPlus,
  MoreVertical,
  Pencil,
  Plus,
  SquareCheckBig,
  Trash2,
  X,
} from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import NotesModal from '@/components/modals/NotesModal';
import WishlistModal from '@/components/modals/WishlistModal';
import WishlistExportModal from '@/components/modals/WishlistExportModal';
import { EntryActionSheet, type EntryAction } from '@/components/common/EntryActionSheet';
import { TaxonomySettingsButton } from '@/components/common/TaxonomySettingsButton';
import { AndroidAdaptiveSelect, CaizenBottomSheet } from '@/components/native/android-design';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ViewModeToggle } from '@/components/ui/view-mode-toggle';
import { FilterBar, FilterChip } from '@/components/ui/collection-controls';
import { SearchField } from '@/components/ui/search-field';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';
import { MonetaryNumber } from '@/components/ui/monetary-number';
import { useAppContext } from '@/lib/context';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { formatPHP } from '@/lib/currency';
import { useProfileModuleTaxonomy } from '@/lib/module-taxonomy';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import { calculateWishlistBudgetMetrics } from '@/lib/collections/wishlist-simulator';
import type { CurrencyCode, PlanType, WishlistItem } from '@/lib/types';

const PLAN_TYPES: Array<{ value: PlanType; label: string }> = [
  { value: 'item', label: 'Item' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'health', label: 'Health' },
  { value: 'service', label: 'Service' },
  { value: 'travel', label: 'Travel' },
  { value: 'experience', label: 'Experience' },
  { value: 'other', label: 'Other' },
];

type PlanStatus = 'planned' | 'completed' | 'archived';
type LegacyStatus = 'wanted' | 'bought' | 'archived';

const PLAN_TYPE_LABELS = Object.fromEntries(PLAN_TYPES.map(option => [option.value, option.label])) as Record<PlanType, string>;

function getPlanType(item: WishlistItem): PlanType {
  return item.type && PLAN_TYPES.some(option => option.value === item.type) ? item.type : 'item';
}

function getPlanStatus(item: WishlistItem): PlanStatus {
  if (item.isArchived) return 'archived';
  if (item.isBought) return 'completed';
  return 'planned';
}

function getStatusLabel(item: WishlistItem) {
  const status = getPlanStatus(item);
  return status === 'completed' && getPlanType(item) === 'item'
    ? 'Purchased'
    : status === 'completed'
      ? 'Completed'
      : status === 'archived'
        ? 'Archived'
        : 'Planned';
}

function toLegacyStatus(status: PlanStatus): LegacyStatus {
  return status === 'completed' ? 'bought' : status === 'archived' ? 'archived' : 'wanted';
}

function dateLabel(value?: Date | string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function displayMoney(value: number | undefined, hidden: boolean) {
  return hidden ? '••••••' : formatPHP(value || 0);
}

function navigate(detail: { section: string; feature?: string; recordId?: string }) {
  window.dispatchEvent(new CustomEvent('life-manager:navigate', { detail }));
}

interface WishlistSectionProps {
  androidPresentation?: boolean;
  embedded?: boolean;
  availableFunds?: number;
  fundsDescription?: string;
  eligibleWalletBalance?: number;
  reservedPayments?: number;
  hideBalances?: boolean;
  currency?: CurrencyCode;
  requestedFeature?: string;
  requestedRecordId?: string;
  requestedRecordSignal?: number;
}

export default function WishlistSection({
  androidPresentation = false,
  embedded = false,
  availableFunds = 0,
  fundsDescription = 'Funds available for this simulation.',
  eligibleWalletBalance,
  reservedPayments,
  hideBalances = false,
  currency,
  requestedFeature,
  requestedRecordId,
  requestedRecordSignal = 0,
}: WishlistSectionProps) {
  const {
    wishlistItems,
    inventoryItems,
    profiles,
    currentProfileId,
    deleteWishlistItem,
    updateWishlistItem,
    renameWishlistCategoryRecords,
    addUpcomingMoneyItem,
  } = useAppContext();
  const currentProfile = profiles.find(profile => profile.id === currentProfileId);
  const taxonomy = useProfileModuleTaxonomy(
    'wishlist',
    ['Personal Tech', 'Home', 'Wearables', 'Health', 'Other'],
    wishlistItems.map(item => ({ category: item.category })),
  );
  const categories = taxonomy.activeCategories.map(category => category.name);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [completionItemId, setCompletionItemId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeStatus, setActiveStatus] = useState<PlanStatus>('planned');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('targetDate');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(androidPresentation ? 'list' : 'grid');
  const [showSimulator, setShowSimulator] = useState(false);
  const [showAndroidFilters, setShowAndroidFilters] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<string | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WishlistItem | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const consumedRequestSignalRef = useRef<number | null>(null);
  const imagePreviewRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const { close: closeImagePreview, isClosing: imagePreviewIsClosing } = useAnimatedOverlayClose({
    isOpen: Boolean(enlargedImage),
    onClose: () => setEnlargedImage(null),
  });
  useOverlayLifecycle(Boolean(enlargedImage), closeImagePreview, {
    containerRef: imagePreviewRef,
  });

  useEffect(() => {
    if (!requestedRecordSignal || consumedRequestSignalRef.current === requestedRecordSignal) return;
    if (requestedFeature === 'add-plan') {
      consumedRequestSignalRef.current = requestedRecordSignal;
      setEditingItemId(null);
      setShowModal(true);
    } else if (requestedFeature === 'plan-item' && requestedRecordId && wishlistItems.some(item => item.id === requestedRecordId)) {
      consumedRequestSignalRef.current = requestedRecordSignal;
      setEditingItemId(requestedRecordId);
      setShowModal(true);
    }
  }, [requestedFeature, requestedRecordId, requestedRecordSignal, wishlistItems]);

  const inventoryById = useMemo(
    () => new Map(inventoryItems.map(item => [item.id, item])),
    [inventoryItems],
  );
  const processedItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const data = wishlistItems
      .filter(item => getPlanStatus(item) === activeStatus)
      .filter(item => typeFilter === 'all' || getPlanType(item) === typeFilter)
      .filter(item => !categoryFilter || item.category === categoryFilter)
      .filter(item => {
        if (!normalizedSearch) return true;
        return [
          item.name,
          item.category,
          item.notes,
          item.productLink,
          PLAN_TYPE_LABELS[getPlanType(item)],
        ].filter(Boolean).join(' ').toLocaleLowerCase().includes(normalizedSearch);
      });

    return data.sort((left, right) => {
      if (sortBy === 'costHigh') return (right.estimatedPrice || 0) - (left.estimatedPrice || 0);
      if (sortBy === 'costLow') return (left.estimatedPrice || 0) - (right.estimatedPrice || 0);
      if (sortBy === 'priority') {
        const rank = { high: 0, medium: 1, low: 2 };
        return rank[left.priority] - rank[right.priority];
      }
      if (sortBy === 'recent') return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      if (sortBy === 'completed') return new Date(right.purchaseDate || right.purchaseCompletedAt || 0).getTime() - new Date(left.purchaseDate || left.purchaseCompletedAt || 0).getTime();
      const leftDate = left.targetDate ? new Date(left.targetDate).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDate = right.targetDate ? new Date(right.targetDate).getTime() : Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate;
    });
  }, [activeStatus, categoryFilter, search, sortBy, typeFilter, wishlistItems]);
  const collectionRevealRef = useCollectionReveal<HTMLElement>(
    processedItems.map(item => item.id),
    [currentProfileId, activeStatus, categoryFilter, typeFilter, sortBy, viewMode],
  );

  const selectedItems = useMemo(
    () => wishlistItems.filter(item => getPlanStatus(item) === 'planned' && item.selected),
    [wishlistItems],
  );
  const selectedCost = selectedItems.reduce((sum, item) => sum + Number(item.estimatedPrice || 0), 0);
  const budgetMetrics = calculateWishlistBudgetMetrics(availableFunds, selectedCost);
  const activeItems = wishlistItems.filter(item => getPlanStatus(item) === 'planned');
  const plannedTotal = activeItems.reduce((sum, item) => sum + Number(item.estimatedPrice || 0), 0);
  const Heading = embedded ? 'h2' : 'h1';
  const showAffordabilityWarning = !hideBalances && budgetMetrics.isOverBudget;

  const openAdd = () => {
    setEditingItemId(null);
    setShowModal(true);
  };
  const openEdit = (id: string) => {
    setEditingItemId(id);
    setShowModal(true);
  };
  const closeModal = () => {
    setEditingItemId(null);
    setCompletionItemId(null);
    setShowModal(false);
  };
  const toggleSelected = (item: WishlistItem) => {
    if (getPlanStatus(item) !== 'planned') return;
    updateWishlistItem(item.id, { selected: !item.selected });
  };
  const openCompletion = (item: WishlistItem) => {
    setEditingItemId(item.id);
    setCompletionItemId(item.id);
    setShowModal(true);
  };
  const planPayment = (item: WishlistItem) => {
    if (item.plannedPaymentId) {
      navigate({ section: 'balance', feature: 'money-item', recordId: item.plannedPaymentId });
      return;
    }
    const paymentId = addUpcomingMoneyItem({
      title: item.name,
      direction: 'outgoing',
      amount: Number(item.actualPrice || item.estimatedPrice || 0),
      dueDate: item.purchaseDate ? new Date(item.purchaseDate) : undefined,
      category: 'purchase',
      walletId: item.walletId || undefined,
      status: 'planned',
      recordedAmount: 0,
      reserveFunds: true,
      reminderEnabled: Boolean(item.purchaseDate),
      linkedWishlistItemId: item.id,
      notes: item.notes || undefined,
      archived: false,
    });
    if (paymentId) updateWishlistItem(item.id, { plannedPaymentId: paymentId, selected: false });
  };
  const openInventory = (item: WishlistItem) => {
    if (!item.destinationItemId || item.destinationType !== 'inventory') return;
    navigate({ section: 'inventory', feature: 'inventory-item', recordId: item.destinationItemId });
  };
  const openLink = (link?: string) => {
    const valid = normalizeExternalWebUrl(link);
    if (!valid) {
      toast({ title: 'Invalid link', description: 'Add a valid HTTPS reference URL and try again.' });
      return;
    }
    void openExternalLink(valid).catch(() => toast({ title: 'Could not open link', description: 'Try again or copy the reference URL into your browser.' }));
  };
  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setCategoryFilter('');
  };
  const activeAndroidFilterCount = Number(typeFilter !== 'all') + Number(Boolean(categoryFilter)) + Number(sortBy !== 'targetDate');
  const clearAndroidFilters = () => {
    setTypeFilter('all');
    setCategoryFilter('');
    setSortBy('targetDate');
  };

  const exportFilters = {
    search,
    category: categoryFilter || undefined,
    status: toLegacyStatus(activeStatus),
    sort: sortBy,
  };

  const getPlanActions = (item: WishlistItem): EntryAction[] => {
    const actionInventory = item.destinationItemId ? inventoryById.get(item.destinationItemId) : undefined;
    return [
      {
        id: 'edit',
        label: 'Edit purchase plan',
        onSelect: () => openEdit(item.id),
      },
      ...(normalizeExternalWebUrl(item.productLink) ? [{
        id: 'source' as const,
        label: 'Open reference URL',
        onSelect: () => openLink(item.productLink),
      }] : []),
      ...(getPlanStatus(item) === 'planned' ? [{
        id: 'queue' as const,
        label: item.plannedPaymentId ? 'Open planned payment' : 'Plan payment',
        onSelect: () => planPayment(item),
      }] : []),
      ...(getPlanStatus(item) === 'planned' ? [{
        id: 'complete' as const,
        label: getPlanType(item) === 'item' ? 'Mark purchased' : 'Mark completed',
        onSelect: () => openCompletion(item),
      }] : []),
      {
        id: 'archive' as const,
        label: getPlanStatus(item) === 'archived' ? 'Restore purchase plan' : 'Archive purchase plan',
        onSelect: () => updateWishlistItem(item.id, {
          isArchived: getPlanStatus(item) !== 'archived',
          selected: false,
        }),
      },
      ...(actionInventory ? [{
        id: 'open' as const,
        label: 'Open Inventory',
        onSelect: () => openInventory(item),
      }] : []),
      {
        id: 'delete' as const,
        label: 'Move purchase plan to Trash',
        destructive: true,
        onSelect: () => {
          deleteWishlistItem(item.id);
          setActionItemId(null);
        },
      },
    ];
  };

  const actionItem = actionItemId ? wishlistItems.find(item => item.id === actionItemId) : undefined;
  const actionActions = actionItem ? getPlanActions(actionItem) : [];

  const renderEmpty = () => (
    <section className="section-surface p-8 text-center sm:p-12">
      <div className="mx-auto flex max-w-xl flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <CircleDollarSign className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-section-title">No active purchase plans</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Capture a future purchase, service, subscription, or experience.
        </p>
        <Button type="button" onClick={openAdd} className="mt-5 min-h-11 rounded-xl px-5">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add purchase plan
        </Button>
      </div>
    </section>
  );

  const renderPlan = (item: WishlistItem) => {
    const planType = getPlanType(item);
    const status = getPlanStatus(item);
    const linkedInventory = item.destinationType === 'inventory' && item.destinationItemId
      ? inventoryById.get(item.destinationItemId)
      : undefined;
    const imageSource = item.photoAssetIds?.[0] ? `asset:${item.photoAssetIds[0]}` : item.image || null;
    const referenceLink = normalizeExternalWebUrl(item.productLink);
    const hasRelatedActions = Boolean(
      linkedInventory
      || item.movedToInventory
      || (item.destinationType === 'inventory' && item.destinationItemId && !linkedInventory)
      || item.plannedPaymentId
      || item.notes
      || referenceLink,
    );

    const imageContent = item.photoAssetIds?.[0] ? (
      <MediaAssetImage profileId={currentProfileId} assetId={item.photoAssetIds[0]} alt="" className="h-full w-full object-cover" />
    ) : item.image ? (
      <img src={item.image} alt="" className="h-full w-full object-cover" />
    ) : (
      <span className="grid h-full w-full place-items-center bg-primary/[0.035]">
        <ImageIcon className="h-8 w-8 text-primary/35" aria-hidden="true" />
      </span>
    );
    const selectionControl = (placementClassName: string) => status === 'planned' ? (
      <button
        type="button"
        onClick={() => toggleSelected(item)}
        aria-label={item.selected ? `Deselect ${item.name}` : `Select ${item.name}`}
        aria-pressed={item.selected}
        className={`android-touch-target grid size-12 shrink-0 place-items-center rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${placementClassName}`}
      >
        <span className={`grid size-9 place-items-center rounded-full border shadow-sm transition-colors ${item.selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70 bg-background/90 text-muted-foreground hover:border-primary/45 hover:text-primary'}`}>
          {item.selected ? <Check className="size-4" aria-hidden="true" /> : null}
        </span>
      </button>
    ) : null;

    return (
      <article
        key={item.id}
        data-caizen-collection-item="true"
        data-caizen-interactive-record="true"
        onClick={event => {
          if (status !== 'planned') return;
          if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [role="button"], [role="link"], [role="menuitem"], [contenteditable="true"]')) return;
          toggleSelected(item);
        }}
        className={`group relative min-w-0 rounded-2xl border bg-card transition-[border-color,box-shadow] hover:border-primary/35 ${item.selected ? 'border-primary/45 bg-primary/[0.02]' : 'border-border/60'} ${viewMode === 'list' ? 'p-4 md:flex md:items-center md:gap-4' : 'flex flex-col overflow-hidden'}`}
      >
        {viewMode === 'grid' ? selectionControl('absolute right-1.5 top-1.5 z-20') : null}
        <div className={`flex min-w-0 gap-3 ${viewMode === 'list' ? 'md:flex-1' : 'flex-col'}`}>
          <button
            type="button"
            onClick={() => imageSource && setEnlargedImage(imageSource)}
            disabled={!imageSource}
            className={viewMode === 'grid'
              ? 'relative aspect-[16/9] w-full shrink-0 overflow-hidden border-b border-border/45 bg-muted/25 disabled:cursor-default'
              : 'grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-muted/25 disabled:cursor-default'}
            aria-label={imageSource ? `Preview image for ${item.name}` : undefined}
          >
            {imageContent}
          </button>
          <div className={`min-w-0 flex-1 ${viewMode === 'grid' ? 'p-4' : ''}`}>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{item.category || 'Other'}</span>
                <span aria-hidden="true">·</span>
                <span>{getStatusLabel(item)}</span>
              </div>
              {viewMode === 'list' ? selectionControl('') : null}
            </div>
            <h3 className="mt-1 break-words text-base font-bold tracking-tight">{item.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Type: {PLAN_TYPE_LABELS[planType]}</span>
              <span>Priority: {item.priority || 'medium'}</span>
              {item.targetDate ? <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Target {dateLabel(item.targetDate)}</span> : null}
              {status === 'completed' && (item.purchaseDate || item.purchaseCompletedAt) ? <span>Completed {dateLabel(item.purchaseDate || item.purchaseCompletedAt)}</span> : null}
            </div>
          </div>
        </div>

        <div className={`mt-4 flex items-end justify-between gap-3 ${viewMode === 'list' ? 'md:mt-0 md:min-w-[15rem] md:justify-end' : `px-4 ${hasRelatedActions ? '' : 'pb-4'}`}`}>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {status === 'completed' ? 'Actual cost' : 'Estimated cost'}
            </p>
            <p className="mt-1 break-words text-xl font-bold tabular-nums">
              {displayMoney(status === 'completed' ? item.actualPrice ?? item.estimatedPrice : item.estimatedPrice, hideBalances)}
            </p>
            {!hideBalances && status === 'completed' && item.actualPrice !== undefined && item.estimatedPrice !== undefined && item.actualPrice !== item.estimatedPrice ? (
              <p className="mt-0.5 break-words text-xs text-muted-foreground">Estimated {displayMoney(item.estimatedPrice, hideBalances)}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {androidPresentation || isMobile ? (
              <button
                type="button"
                onClick={() => setActionItemId(item.id)}
                className="android-touch-target grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                aria-label={`Actions for ${item.name}`}
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Actions for ${item.name}`}
                  >
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className="min-w-52">
                  {getPlanActions(item).map(action => {
                    const Icon = action.id === 'edit'
                      ? Pencil
                      : action.id === 'source' || action.id === 'open'
                        ? ExternalLink
                        : action.id === 'queue'
                          ? ListPlus
                          : action.id === 'complete'
                            ? SquareCheckBig
                            : action.id === 'archive'
                              ? Archive
                              : Trash2;
                    return (
                      <DropdownMenuItem
                        key={action.id}
                        variant={action.id === 'delete' ? 'destructive' : 'default'}
                        onSelect={() => {
                          if (action.id === 'delete') {
                            setDeleteTarget(item);
                            return;
                          }
                          action.onSelect();
                        }}
                      >
                        <Icon className="size-4" />
                        {action.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {hasRelatedActions ? <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/45 pt-3 text-xs ${viewMode === 'grid' ? 'mx-4 mb-4' : 'mt-3'}`}>
          {linkedInventory ? (
            <button type="button" onClick={() => openInventory(item)} className="min-h-9 font-semibold text-primary underline-offset-4 hover:underline">
              In inventory
            </button>
          ) : item.movedToInventory ? (
            <span className="min-h-9 py-2 text-muted-foreground">
              Added to inventory
            </span>
          ) : null}
          {item.destinationType === 'inventory' && item.destinationItemId && !linkedInventory ? (
            <span className="min-h-9 py-2 text-muted-foreground">
              Inventory link unavailable
            </span>
          ) : null}
          {item.plannedPaymentId ? (
            <button type="button" onClick={() => planPayment(item)} className="min-h-9 font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Open planned payment
            </button>
          ) : null}
          {item.notes ? (
            <button type="button" onClick={() => setSelectedNotes(item.notes || '')} className="min-h-9 font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              View notes
            </button>
          ) : null}
          {referenceLink ? (
            <button type="button" onClick={() => openLink(item.productLink)} className="min-h-9 font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Reference URL
            </button>
          ) : null}
        </div> : null}
      </article>
    );
  };

  return (
    <div className={androidPresentation ? 'android-module-home space-y-4' : `${embedded ? 'min-w-0' : 'workspace-standard'} caizen-collection-page space-y-4 lg:space-y-5`} data-android-screen="spending-plans">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Heading className={embedded ? 'text-section-title' : 'text-page-title'}>Purchase plans</Heading>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Plan future purchases, services, and experiences.</p>
          <p className="mt-3 text-sm font-semibold text-muted-foreground">
            {activeItems.length} active {activeItems.length === 1 ? 'plan' : 'plans'} · <MonetaryNumber formatted={hideBalances ? '' : displayMoney(plannedTotal, false)} hidden={hideBalances} revision={activeStatus} /> planned
          </p>
        </div>
      </header>

      <FilterBar label="Plan status">
        {([
          ['planned', 'Planned'],
          ['completed', 'Completed'],
          ['archived', 'Archived'],
        ] as const).map(([value, label]) => (
          <FilterChip
            key={value}
            selected={activeStatus === value}
            onSelectedChange={() => setActiveStatus(value)}
            className="min-h-11 rounded-xl px-4 text-sm font-black"
          >
            {label}
          </FilterChip>
        ))}
      </FilterBar>

      {androidPresentation ? (
        <>
          <section className="toolbar-surface w-full" style={{ backgroundColor: 'var(--surface-section)' }} data-android-plan-toolbar="true">
            <div className="flex flex-col gap-2">
              <SearchField id="plans-search" wrapperClassName="w-full" value={search} onChange={setSearch} aria-label="Search plans" placeholder="Search plans..." />
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <button type="button" onClick={() => setShowAndroidFilters(true)} className="control-input flex min-h-11 items-center justify-between rounded-xl px-3 text-left font-semibold" aria-label={`Plan filters${activeAndroidFilterCount ? `, ${activeAndroidFilterCount} active` : ''}`}>
                  <span>Filters{activeAndroidFilterCount ? ` (${activeAndroidFilterCount})` : ''}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </button>
                <ViewModeToggle value={viewMode} onChange={setViewMode} label="Plans view" />
              </div>
              <div className="flex flex-wrap gap-2">
                <TaxonomySettingsButton module="wishlist" displayName="Plan" defaults={['Personal Tech', 'Home', 'Wearables', 'Health', 'Other']} observed={wishlistItems.map(item => ({ category: item.category }))} onRenameCategory={renameWishlistCategoryRecords} androidPresentation={androidPresentation} showSubcategories={false} />
                <Button type="button" variant="outline" onClick={() => setShowExportModal(true)} className="min-h-11 rounded-xl">Export</Button>
                <Button type="button" onClick={openAdd} className="min-h-11 rounded-xl"><Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add purchase plan</Button>
              </div>
            </div>
          </section>
          <CaizenBottomSheet
            open={showAndroidFilters}
            title="Plan filters"
            description="Narrow the plans shown on this screen."
            onClose={() => setShowAndroidFilters(false)}
            fullHeight
          >
            <div className="space-y-3" data-android-plan-filters="true">
              <AndroidAdaptiveSelect label="Type" value={typeFilter} onChange={setTypeFilter} options={[{ value: 'all', label: 'All types' }, ...PLAN_TYPES.map(option => ({ value: option.value, label: option.label }))]} />
              <AndroidAdaptiveSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} searchable={categories.length > 8} options={[{ value: '', label: 'All categories' }, ...categories.map(category => ({ value: category, label: category }))]} />
              <AndroidAdaptiveSelect label="Target date" value={sortBy} onChange={setSortBy} options={[
                { value: 'targetDate', label: 'Target date' },
                { value: 'costHigh', label: 'Cost: highest first' },
                { value: 'costLow', label: 'Cost: lowest first' },
                { value: 'priority', label: 'Priority' },
                { value: 'recent', label: 'Recently added' },
                { value: 'completed', label: 'Recently completed' },
              ]} />
              <button type="button" onClick={clearAndroidFilters} disabled={!activeAndroidFilterCount} className="min-h-11 w-full rounded-xl border border-border/60 px-3 text-sm font-bold text-muted-foreground disabled:opacity-50">Clear filters</button>
            </div>
          </CaizenBottomSheet>
        </>
      ) : (
        <section className="toolbar-surface w-full" style={{ backgroundColor: 'var(--surface-section)' }}>
          <div className="flex min-w-0 flex-col gap-3">
            <SearchField id="plans-search" wrapperClassName="w-full" value={search} onChange={setSearch} aria-label="Search plans" placeholder="Search plans..." />
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <AndroidAdaptiveSelect label="Type" value={typeFilter} onChange={setTypeFilter} className="control-input combobox-trigger-transparent w-full sm:w-32 sm:max-w-32 sm:flex-none" options={[{ value: 'all', label: 'All types' }, ...PLAN_TYPES.map(option => ({ value: option.value, label: option.label }))]} />
              <AndroidAdaptiveSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} className="control-input combobox-trigger-transparent w-full sm:w-36 sm:max-w-36 sm:flex-none" searchable={categories.length > 8} options={[{ value: '', label: 'All categories' }, ...categories.map(category => ({ value: category, label: category }))]} />
              <AndroidAdaptiveSelect label="Target date" value={sortBy} onChange={setSortBy} className="control-input combobox-trigger-transparent w-full sm:w-36 sm:max-w-36 sm:flex-none" options={[
                { value: 'targetDate', label: 'Target date' },
                { value: 'costHigh', label: 'Cost: highest first' },
                { value: 'costLow', label: 'Cost: lowest first' },
                { value: 'priority', label: 'Priority' },
                { value: 'recent', label: 'Recently added' },
                { value: 'completed', label: 'Recently completed' },
              ]} />
              <ViewModeToggle value={viewMode} onChange={setViewMode} label="Plans view" className="self-start shrink-0 xl:self-auto" />
              <div className="flex flex-wrap gap-2 xl:flex-nowrap xl:shrink-0">
                <TaxonomySettingsButton module="wishlist" displayName="Plan" defaults={['Personal Tech', 'Home', 'Wearables', 'Health', 'Other']} observed={wishlistItems.map(item => ({ category: item.category }))} onRenameCategory={renameWishlistCategoryRecords} androidPresentation={androidPresentation} showSubcategories={false} />
                <Button type="button" variant="outline" onClick={() => setShowExportModal(true)} className="min-h-11 rounded-xl">Export</Button>
                <Button type="button" onClick={openAdd} className="min-h-11 rounded-xl"><Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add purchase plan</Button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="section-surface overflow-hidden" aria-labelledby="plan-simulator-title">
        <button
          type="button"
          onClick={() => setShowSimulator(value => !value)}
          className="flex min-h-14 w-full items-center justify-between gap-4 px-4 text-left sm:px-5"
          aria-expanded={showSimulator}
          aria-controls="plan-simulator-content"
        >
          <span className="min-w-0">
            <span id="plan-simulator-title" className="block text-sm font-bold">Purchase plan simulator</span>
            <span className="mt-1 block break-words text-xs text-muted-foreground">
              {selectedItems.length === 0
                ? 'Select plans to compare estimated cost with available funds'
                : `${selectedItems.length} ${selectedItems.length === 1 ? 'plan' : 'plans'} selected · ${displayMoney(selectedCost, hideBalances)} estimated`}
            </span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${showSimulator ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {showSimulator ? (
          <div id="plan-simulator-content" className="border-t border-border/45 px-4 py-4 sm:px-5 sm:py-5">
            {selectedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Select one or more plans to compare their estimated cost with your available funds.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Available for purchases</p>
                    <p className="mt-1 break-words text-xl font-bold tabular-nums"><MonetaryNumber formatted={hideBalances ? '' : displayMoney(availableFunds, false)} hidden={hideBalances} revision={activeStatus} /></p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{fundsDescription}</p>
                    {eligibleWalletBalance !== undefined && reservedPayments !== undefined ? (
                      <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <div className="flex justify-between gap-3"><dt>Eligible wallets</dt><dd className="tabular-nums">{displayMoney(eligibleWalletBalance, hideBalances)}</dd></div>
                        <div className="flex justify-between gap-3"><dt>Upcoming payments</dt><dd className="tabular-nums">{displayMoney(reservedPayments, hideBalances)}</dd></div>
                      </dl>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Selected total</p>
                    <p className="mt-1 break-words text-xl font-bold tabular-nums"><MonetaryNumber formatted={hideBalances ? '' : displayMoney(selectedCost, false)} hidden={hideBalances} revision={activeStatus} /></p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Estimated cost</p>
                  </div>
                </div>

                <div className="grid gap-4 border-t border-border/45 pt-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${showAffordabilityWarning ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {hideBalances ? 'After selected plans' : budgetMetrics.isOverBudget ? 'Shortfall' : 'Remaining'}
                    </p>
                    <p className={`mt-1 break-words text-lg font-bold tabular-nums ${showAffordabilityWarning ? 'text-destructive' : ''}`}>
                      <MonetaryNumber formatted={hideBalances ? '' : displayMoney(Math.abs(budgetMetrics.remaining), false)} hidden={hideBalances} revision={activeStatus} />
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {hideBalances ? 'Amounts hidden' : budgetMetrics.isOverBudget ? 'more than available for purchases' : 'available after selected plans'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Available funds used</p>
                    <p className={`mt-1 break-words text-lg font-bold ${showAffordabilityWarning ? 'text-destructive' : ''}`}>
                      {hideBalances ? 'Amounts hidden' : budgetMetrics.isOverBudget ? 'Exceeds available funds' : `${Math.round(budgetMetrics.usagePercent)}% used`}
                    </p>
                    {!hideBalances ? (
                      <div
                        className="mt-2 h-2 overflow-hidden rounded-full bg-muted/70"
                        role="progressbar"
                        aria-label="Available purchase funds used"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={budgetMetrics.displayProgressPercent}
                        aria-valuetext={budgetMetrics.isOverBudget ? 'Exceeds available funds' : `${Math.round(budgetMetrics.usagePercent)}% used`}
                      >
                        <div className={`h-full rounded-full transition-[width] ${budgetMetrics.isOverBudget ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${budgetMetrics.displayProgressPercent}%` }} />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/45 pt-3">
                  <p className="text-xs text-muted-foreground">Simulation only; no funds are reserved.</p>
                  <button type="button" onClick={() => selectedItems.forEach(item => updateWishlistItem(item.id, { selected: false }))} className="min-h-10 text-sm font-semibold text-primary underline-offset-4 hover:underline">Clear selection</button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>

      {wishlistItems.length === 0 ? renderEmpty() : processedItems.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border/60 bg-background/35 px-4 py-10 text-center">
          <h2 className="text-section-title">No {activeStatus} plans match</h2>
          <p className="mt-2 text-sm text-muted-foreground">Try clearing one or more filters, or add a purchase plan.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" onClick={clearFilters} className="min-h-11 rounded-xl">Clear filters</Button>
            <Button type="button" onClick={openAdd} className="min-h-11 rounded-xl"><Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add purchase plan</Button>
          </div>
        </section>
      ) : (
        <section ref={collectionRevealRef} className={viewMode === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3' : 'flex flex-col gap-3'}>
          {processedItems.map(renderPlan)}
        </section>
      )}

      <WishlistModal isOpen={showModal} itemId={editingItemId} startAsCompleted={Boolean(completionItemId && completionItemId === editingItemId)} hideBalances={hideBalances} currency={currency} onClose={closeModal} />
      {showExportModal ? <WishlistExportModal items={wishlistItems} currentItems={processedItems} profileName={currentProfile?.name || 'Plans'} currency={currentProfile?.currency || currentProfile?.baseCurrency || 'PHP'} filters={exportFilters} initialScope="current" onClose={() => setShowExportModal(false)} /> : null}
      <NotesModal isOpen={selectedNotes !== null} notes={selectedNotes || ''} onClose={() => setSelectedNotes(null)} />
      {androidPresentation || isMobile ? <EntryActionSheet androidPresentation={androidPresentation} open={Boolean(actionItemId)} title={actionItem?.name || 'Plan'} subtitle="Plans" deleteMessage="This purchase plan will move to Trash, where you can restore it. Linked Inventory items stay in place." onClose={() => setActionItemId(null)} actions={actionActions} /> : null}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Move purchase plan to Trash?"
        message="This purchase plan will move to Trash, where you can restore it. Linked Inventory items stay in place."
        confirmText="Move to Trash"
        cancelText="Keep"
        isDangerous
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteWishlistItem(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
      {enlargedImage && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4" data-caizen-overlay={imagePreviewIsClosing ? 'closing' : 'open'} data-state={imagePreviewIsClosing ? 'closed' : 'open'} onClick={closeImagePreview}>
          <div ref={imagePreviewRef} className="relative max-h-[90dvh] max-w-[94vw]" data-caizen-overlay-panel="true" onClick={event => event.stopPropagation()}>
            <button type="button" onClick={closeImagePreview} aria-label="Close image preview" className="absolute -right-2 -top-2 z-10 grid h-10 w-10 place-items-center rounded-full bg-background text-foreground shadow-lg"><X className="h-5 w-5" aria-hidden="true" /></button>
            {enlargedImage.startsWith('asset:') ? <MediaAssetImage profileId={currentProfileId} assetId={enlargedImage.slice(6)} alt="Plan preview" variant="full" className="max-h-[88dvh] max-w-[94vw] rounded-2xl object-contain" /> : <img src={enlargedImage} alt="Plan preview" className="max-h-[88dvh] max-w-[94vw] rounded-2xl object-contain" />}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
