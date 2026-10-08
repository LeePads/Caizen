'use client';

import { createPortal } from 'react-dom';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Droplets,
  ExternalLink,
  Link2,
  MoreVertical,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  ShoppingBag,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';
import { EntryActionSheet, type EntryAction } from '@/components/common/EntryActionSheet';
import SkincareModal from '@/components/modals/SkincareModal';
import SkincareLifeHubContext from '@/components/sections/SkincareLifeHubContext';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';
import { Combobox } from '@/components/ui/combobox';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { ViewModeToggle } from '@/components/ui/view-mode-toggle';
import { SegmentedControl } from '@/components/ui/collection-controls';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TaxonomySettingsButton } from '@/components/common/TaxonomySettingsButton';
import { useAppContext } from '@/lib/context';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { parseLocalDateInput } from '@/lib/date-utils';
import { formatPHP } from '@/lib/currency';
import { MonetaryMotionProvider, MonetaryNumber } from '@/components/ui/monetary-number';
import { useProfileModuleTaxonomy } from '@/lib/module-taxonomy';
import { buildLinkedRecordTransactionMap } from '@/lib/transactions';
import { navigateToTransaction } from '@/lib/balance/linked-record';
import type {
  SkincareFrequency,
  SkincareProduct,
  SkincareRepurchaseDecision,
  SkincareSchedule,
} from '@/lib/types';
import { normalizeExternalWebUrl, openExternalLink as openNativeExternalLink } from '@/lib/native/open-link';
import { toLocalDateKey } from '@/lib/utils';
import { calculateSkincareSavings } from '@/lib/skincare/savings';
import { getSkincareCompletedCycleDuration, getSkincarePurchaseHistoryChain } from '@/lib/skincare/duration';
import { deriveSkincareLifeHubActivity } from '@/lib/skincare/lifehub-activity';
import { DEFAULT_SKINCARE_CATEGORIES, SKINCARE_PRODUCT_TYPE_LABELS } from '@/lib/skincare/taxonomy';
import SkincareExportModal from '@/components/modals/SkincareExportModal';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { AndroidAdaptiveSelect, CaizenBottomSheet } from '@/components/native/android-design';

const ITEMS_PER_PAGE = 12;
const SKINCARE_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest started' },
  { value: 'oldest', label: 'Oldest started' },
  { value: 'priceHigh', label: 'Price high to low' },
  { value: 'priceLow', label: 'Price low to high' },
  { value: 'costPerDay', label: 'Cost per day' },
  { value: 'name', label: 'Name' },
];
const normalizeSkincareCategoryKey = (value?: string | null) => (value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

function getPriceComparison(product: SkincareProduct) {
  if (product.purchasePrice === undefined || product.purchasePrice === null ||
      product.currentPrice === undefined || product.currentPrice === null) return null;
  const boughtPrice = Number(product.purchasePrice);
  const currentPrice = Number(product.currentPrice);
  if (!Number.isFinite(boughtPrice) || boughtPrice < 0 || !Number.isFinite(currentPrice) || currentPrice < 0) return null;
  const difference = currentPrice - boughtPrice;
  if (difference > 0) return `Saved ${formatPHP(difference)}`;
  if (difference < 0) return `Paid ${formatPHP(Math.abs(difference))} above current price`;
  return 'Same price';
}

function formatSkincarePrice(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) return 'Not entered';
  return Number(value) === 0 ? `Free · ${formatPHP(0)}` : formatPHP(Number(value));
}

function compareKnownPrices(a?: number | null, b?: number | null, direction: 1 | -1 = 1) {
  const valueA = a == null || !Number.isFinite(Number(a)) ? null : Number(a);
  const valueB = b == null || !Number.isFinite(Number(b)) ? null : Number(b);
  if (valueA === null) return valueB === null ? 0 : 1;
  if (valueB === null) return -1;
  return direction * (valueA - valueB);
}

function openExternalLink(link?: string) {
  if (!link || typeof window === 'undefined') return;
  const url = normalizeExternalWebUrl(link);
  if (url) void openNativeExternalLink(url);
}

function RepurchaseDecision({
  value,
  onChange,
}: {
  value?: SkincareRepurchaseDecision;
  onChange: (value: SkincareRepurchaseDecision) => void;
}) {
  return (
    <div role="group" aria-label="Would you buy it again?" className="grid grid-cols-3 gap-2">
      {([
        ['yes', 'Yes'],
        ['maybe', 'Maybe'],
        ['no', 'No'],
      ] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
            value === key
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/50 bg-background/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ActionMenu({
  product,
  actions,
  androidPresentation = false,
  onAndroidOpen,
}: {
  product: SkincareProduct;
  actions: EntryAction[];
  androidPresentation?: boolean;
  onAndroidOpen?: () => void;
}) {
  if (androidPresentation) {
    return (
      <button
        type="button"
        aria-label={`More actions for ${product.name}`}
        onClick={event => {
          event.stopPropagation();
          onAndroidOpen?.();
        }}
        className="android-touch-target grid size-11 shrink-0 place-items-center rounded-full border border-border/50 bg-background/60 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${product.name}`}
          onClick={event => event.stopPropagation()}
          className="grid h-11 w-11 place-items-center rounded-xl border border-border/50 bg-background/60 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-48">
        {actions
          .filter(action => action.id !== (product.status === 'emptied' ? 'repurchase' : 'log'))
          .map(action => {
            const Icon = action.id === 'finish' || action.id === 'log'
              ? CheckCircle2
              : action.id === 'repurchase'
                ? ShoppingBag
                : action.id === 'link'
                  ? ExternalLink
                  : action.id === 'restore'
                    ? RotateCcw
                    : action.id === 'delete'
                      ? Trash2
                      : Pencil;
            return (
              <DropdownMenuItem
                key={action.id}
                onSelect={action.onSelect}
                variant={action.destructive ? 'destructive' : undefined}
              >
                <Icon className="size-4" />{action.label}
              </DropdownMenuItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SkincareSectionProps {
  onAddClick?: () => void;
  androidPresentation?: boolean;
  requestedRecordId?: string;
  requestedRecordSignal?: number;
  onRequestedRecordConsumed?: (signal: number) => void;
}

export default function SkincareSection({
  onAddClick,
  androidPresentation = false,
  requestedRecordId,
  requestedRecordSignal = 0,
  onRequestedRecordConsumed,
}: SkincareSectionProps) {
  const {
    currentProfileId,
    isHydrated,
    profiles,
    skincareProducts,
    transactions,
    dailyChecklistItems,
    productivityItems,
    deleteSkincareProduct,
    renameSkincareCategoryRecords,
    markSkincareProductEmptied,
    restoreSkincareProduct,
    repurchaseSkincareProduct,
    getSkincareProductStats,
    skincareUsageEvents,
    logSkincareUsage,
  } = useAppContext();
  // Derived, not stored - see Transaction.linkedRecord in lib/types.ts.
  const transactionBySkincareId = useMemo(
    () => buildLinkedRecordTransactionMap(transactions, 'skincare'),
    [transactions],
  );

  const preferenceKey = `caizen-skincare-view:${currentProfileId || 'default'}`;
  const dashboardKey = `caizen-skincare-dashboard:${currentProfileId || 'default'}`;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showAndroidFilters, setShowAndroidFilters] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [activeTab, setActiveTab] = useState<'active' | 'finished'>('active');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return androidPresentation ? 'list' : 'grid';
    const stored = localStorage.getItem(preferenceKey);
    return stored === 'list' || stored === 'grid'
      ? stored
      : androidPresentation
        ? 'list'
        : 'grid';
  });
  const [showDashboard, setShowDashboard] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(dashboardKey) !== 'false';
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
  const [actionProductId, setActionProductId] = useState<string | null>(null);
  const [internalAddOpen, setInternalAddOpen] = useState(false);
  const consumedRequestSignalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!requestedRecordSignal || consumedRequestSignalRef.current === requestedRecordSignal) return;
    consumedRequestSignalRef.current = requestedRecordSignal;
    if (requestedRecordId && skincareProducts.some(product => product.id === requestedRecordId)) {
      setEditingProductId(requestedRecordId);
      setInternalAddOpen(false);
    }
    onRequestedRecordConsumed?.(requestedRecordSignal);
  }, [onRequestedRecordConsumed, requestedRecordId, requestedRecordSignal, skincareProducts]);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [finishProductId, setFinishProductId] = useState<string | null>(null);
  const [repurchaseProductId, setRepurchaseProductId] = useState<string | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const imagePreviewRef = useRef<HTMLDivElement>(null);
  const { close: closeImagePreview, isClosing: imagePreviewIsClosing } = useAnimatedOverlayClose({
    isOpen: Boolean(enlargedImage),
    onClose: () => setEnlargedImage(null),
  });
  useOverlayLifecycle(Boolean(enlargedImage), closeImagePreview, {
    containerRef: imagePreviewRef,
  });
  const [showExportModal, setShowExportModal] = useState(false);

  const [finishDate, setFinishDate] = useState(toLocalDateKey(new Date()));
  const [finishDecision, setFinishDecision] = useState<SkincareRepurchaseDecision | undefined>('maybe');
  const [finishNotes, setFinishNotes] = useState('');
  const [finishError, setFinishError] = useState('');
  const [repurchaseError, setRepurchaseError] = useState('');

  const [repurchasePrice, setRepurchasePrice] = useState('');
  const [repurchaseCurrentPrice, setRepurchaseCurrentPrice] = useState('');
  const [repurchaseDate, setRepurchaseDate] = useState(toLocalDateKey(new Date()));
  const [repurchaseStartDate, setRepurchaseStartDate] = useState('');
  const [repurchaseFrequency, setRepurchaseFrequency] = useState<SkincareFrequency>('Daily');
  const [repurchaseSchedule, setRepurchaseSchedule] = useState<SkincareSchedule>('both');
  const [repurchaseEstimatedDuration, setRepurchaseEstimatedDuration] = useState('');

  const taxonomy = useProfileModuleTaxonomy(
    'skincare',
    DEFAULT_SKINCARE_CATEGORIES,
    skincareProducts.map(product => ({ category: product.category })),
  );
  const categoryByKey = new Map<string, string>();
  taxonomy.activeCategories.forEach(item => {
    const key = normalizeSkincareCategoryKey(item.name);
    if (key && !categoryByKey.has(key)) categoryByKey.set(key, item.name.trim());
  });
  const categories = ['All', ...categoryByKey.values()];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(preferenceKey, viewMode);
  }, [preferenceKey, viewMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(dashboardKey, String(showDashboard));
  }, [dashboardKey, showDashboard]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, categoryFilter, search, sortBy]);

  const activeProducts = useMemo(
    () => skincareProducts.filter(product => (product.status || 'active') === 'active'),
    [skincareProducts],
  );
  const finishedProducts = useMemo(
    () => skincareProducts.filter(product => product.status === 'emptied'),
    [skincareProducts],
  );

  const stats = useMemo(() => {
    const savings = calculateSkincareSavings(skincareProducts);

    const pricedActiveProducts = activeProducts.filter(product => {
      const price = product.purchasePrice;
      return price !== undefined && price !== null && Number.isFinite(Number(price)) && Number(price) >= 0 &&
        getSkincareProductStats(product.id).costPerDay !== null;
    });
    const dailyCost = pricedActiveProducts.length
      ? pricedActiveProducts.reduce((sum, product) => sum + (getSkincareProductStats(product.id).costPerDay || 0), 0)
      : null;

    const monthlyCost = dailyCost === null ? null : dailyCost * 30;
    const typeCounts = activeProducts.reduce((counts, product) => {
      const label = SKINCARE_PRODUCT_TYPE_LABELS[product.productType || 'other'];
      counts.set(label, (counts.get(label) || 0) + 1);
      return counts;
    }, new Map<string, number>());

    const completedDurations = finishedProducts
      .map(product => getSkincareProductStats(product.id).daysUsed)
      .filter((days): days is number => days !== null);

    const averageDuration = completedDurations.length
      ? Math.round(completedDurations.reduce((sum, days) => sum + days, 0) / completedDurations.length)
      : 0;

    const repurchaseDecisions = finishedProducts.filter(product => product.wouldRepurchase);
    const wouldRepurchase = repurchaseDecisions.filter(product => product.wouldRepurchase === 'yes').length;

    return {
      active: activeProducts.length,
      finished: finishedProducts.length,
      savings,
      dailyCost,
      monthlyCost,
      pricedActiveCount: pricedActiveProducts.length,
      activeTypes: [...typeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      averageDuration,
      wouldRepurchase,
      decisionCount: repurchaseDecisions.length,
    };
  }, [activeProducts, finishedProducts, getSkincareProductStats, skincareProducts]);

  const filteredProducts = useMemo(() => {
    const source = activeTab === 'active' ? activeProducts : finishedProducts;
    const term = search.trim().toLowerCase();

    const data = source.filter(product => {
      if (categoryFilter !== 'All' && normalizeSkincareCategoryKey(product.category) !== normalizeSkincareCategoryKey(categoryFilter)) return false;
      if (!term) return true;
      return [
        product.name,
        product.category,
        SKINCARE_PRODUCT_TYPE_LABELS[product.productType || 'other'],
        product.effects,
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(term));
    });

    return [...data].sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.startDate || b.createdAt).getTime() - new Date(a.startDate || a.createdAt).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.startDate || a.createdAt).getTime() - new Date(b.startDate || b.createdAt).getTime();
      }
      if (sortBy === 'priceHigh') return compareKnownPrices(a.purchasePrice, b.purchasePrice, -1);
      if (sortBy === 'priceLow') return compareKnownPrices(a.purchasePrice, b.purchasePrice);
      if (sortBy === 'costPerDay') {
        const aStats = getSkincareProductStats(a.id);
        const bStats = getSkincareProductStats(b.id);
        const aCost = aStats.costPerDay || 0;
        const bCost = bStats.costPerDay || 0;
        return bCost - aCost;
      }
      return a.name.localeCompare(b.name);
    });
  }, [
    activeProducts,
    activeTab,
    categoryFilter,
    finishedProducts,
    getSkincareProductStats,
    search,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );
  const currentProfile = profiles.find(profile => profile.id === currentProfileId);
  const collectionRevealRef = useCollectionReveal(
    paginatedProducts.map(product => product.id),
    [currentProfileId, activeTab, categoryFilter, sortBy, currentPage, viewMode],
  );
  const getLifeHubActivity = (productId: string) =>
    deriveSkincareLifeHubActivity(productId, dailyChecklistItems, productivityItems);
  const openLifeHubRecord = (feature: 'routine' | 'tasks', recordId: string) => {
    window.dispatchEvent(new CustomEvent('life-manager:navigate', {
      detail: { section: 'lifehub', feature, recordId },
    }));
  };
  const exportModal = showExportModal ? (
    <SkincareExportModal
      items={skincareProducts}
      currentItems={filteredProducts}
      profileName={currentProfile?.name || 'Skincare'}
      currency={currentProfile?.currency || currentProfile?.baseCurrency || 'PHP'}
      filters={{ search, category: categoryFilter !== 'All' ? categoryFilter : undefined, status: activeTab, sort: sortBy }}
      initialScope="current"
      onClose={() => setShowExportModal(false)}
    />
  ) : null;

  const finishProduct = skincareProducts.find(product => product.id === finishProductId);
  const repurchaseProduct = skincareProducts.find(product => product.id === repurchaseProductId);
  const { close: closeFinish, isClosing: finishIsClosing } = useAnimatedOverlayClose({
    isOpen: Boolean(finishProductId),
    onClose: () => setFinishProductId(null),
  });
  const { close: closeRepurchase, isClosing: repurchaseIsClosing } = useAnimatedOverlayClose({
    isOpen: Boolean(repurchaseProductId),
    onClose: () => setRepurchaseProductId(null),
  });
  const finishPanelRef = useRef<HTMLDivElement>(null);
  const repurchasePanelRef = useRef<HTMLDivElement>(null);
  useOverlayLifecycle(Boolean(finishProductId), closeFinish, { containerRef: finishPanelRef });
  useOverlayLifecycle(Boolean(repurchaseProductId), closeRepurchase, { containerRef: repurchasePanelRef });

  const openAdd = () => {
    if (onAddClick) {
      onAddClick();
      return;
    }
    setInternalAddOpen(true);
  };

  const openFinish = (product: SkincareProduct) => {
    setFinishProductId(product.id);
    setFinishDate(product.emptiedAt ? toLocalDateKey(product.emptiedAt) : toLocalDateKey(new Date()));
    setFinishDecision(product.wouldRepurchase || (product.status === 'emptied' ? undefined : 'maybe'));
    setFinishNotes(product.emptiedNotes || '');
    setFinishError('');
  };

  const openRepurchase = (product: SkincareProduct) => {
    const today = toLocalDateKey(new Date());
    setRepurchaseProductId(product.id);
    setRepurchasePrice(product.purchasePrice == null ? '' : String(product.purchasePrice));
    setRepurchaseCurrentPrice(product.currentPrice == null ? '' : String(product.currentPrice));
    setRepurchaseDate(today);
    setRepurchaseStartDate('');
    setRepurchaseFrequency(product.frequency || 'Daily');
    setRepurchaseSchedule(product.schedule || 'both');
    const typicalDuration = getSkincareProductStats(product.id).typicalDurationDays;
    setRepurchaseEstimatedDuration(typicalDuration !== null ? String(typicalDuration) : '');
    setRepurchaseError('');
  };

  const getSkincareActions = (product: SkincareProduct): EntryAction[] => {
    const isFinished = product.status === 'emptied';
    return [
      ...(!isFinished ? [{
        id: 'log' as const,
        label: 'Log use now',
        onSelect: () => logSkincareUsage(product.id),
      }, {
        id: 'finish' as const,
        label: 'Mark Finished',
        onSelect: () => openFinish(product),
      }] : [{
        id: 'repurchase' as const,
        label: 'Buy Again',
        onSelect: () => openRepurchase(product),
      }, {
        id: 'edit-finish' as const,
        label: 'Edit finish details',
        onSelect: () => openFinish(product),
      }]),
      ...(normalizeExternalWebUrl(product.productLink) ? [{
        id: 'link' as const,
        label: 'Visit Link',
        onSelect: () => openExternalLink(product.productLink),
      }] : []),
      ...(isFinished ? [{
        id: 'restore' as const,
        label: 'Undo finish',
        onSelect: () => {
          restoreSkincareProduct(product.id);
          setActiveTab('active');
        },
      }] : []),
      {
        id: 'edit' as const,
        label: 'Edit product',
        onSelect: () => setEditingProductId(product.id),
      },
      {
        id: 'delete' as const,
        label: 'Move to Trash',
        destructive: true,
        onSelect: () => {
          if (androidPresentation) deleteSkincareProduct(product.id);
          else setDeletingProductId(product.id);
        },
      },
    ];
  };

  const actionProduct = actionProductId
    ? skincareProducts.find(product => product.id === actionProductId)
    : undefined;

  const statusFor = (product: SkincareProduct) => {
    if (product.status === 'emptied') {
      return {
        label: 'Finished',
        className: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-300',
      };
    }
    return {
      label: 'In use',
      className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    };
  };

  const renderCard = (product: SkincareProduct) => {
    const productStats = getSkincareProductStats(product.id);
    const image = product.photo || product.image;
    const managedImageId = product.photoAssetIds?.[0];
    const status = statusFor(product);
    const isFinished = product.status === 'emptied';
    const typeLabel = SKINCARE_PRODUCT_TYPE_LABELS[product.productType || 'other'];
    const priceComparison = getPriceComparison(product);
    const daysPastTypical = productStats.daysUsed !== null && productStats.typicalDurationDays !== null
      ? productStats.daysUsed - productStats.typicalDurationDays
      : null;
    const productUsage = skincareUsageEvents.filter(event => event.productId === product.id).sort((a, b) => b.usedAt.getTime() - a.usedAt.getTime());
    const today = new Date();
    const todayUses = productUsage.filter(event => toLocalDateKey(event.usedAt) === toLocalDateKey(today)).length;
    const actions = getSkincareActions(product);
    const primaryAction = actions.find(action => action.id === (isFinished ? 'repurchase' : 'log'));

    return (
      <article
        key={product.id}
        data-caizen-collection-item="true"
        data-caizen-interactive-record="true"
        className="skincare-card group flex flex-col overflow-hidden rounded-3xl border border-border/50 bg-card/70 transition-[border-color,box-shadow] duration-150 hover:border-primary/25"
      >
        <button
          type="button"
          aria-label={`View photo for ${product.name}`}
          onClick={event => {
            event.stopPropagation();
            if (managedImageId) setEnlargedImage(`asset:${managedImageId}`);
            else if (image) setEnlargedImage(image);
          }}
          className="relative h-52 overflow-hidden bg-muted/30"
        >
          {managedImageId ? (
            <MediaAssetImage
              assetId={managedImageId}
              profileId={currentProfileId}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : image ? (
            <img
              src={image}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Droplets className="h-10 w-10 text-primary/30" />
            </div>
          )}
        </button>

        <div className="flex flex-1 flex-col p-5">
          <span className={`mb-3 w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${status.className}`}>
            {status.label}
          </span>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <OverflowTooltip text={product.name}>
                {normalizeExternalWebUrl(product.productLink) ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openExternalLink(product.productLink);
                    }}
                    className="block min-h-11 max-w-full truncate text-left text-lg font-bold hover:text-primary"
                    aria-label={`Open ${product.name} link`}
                  >
                    {product.name}
                  </button>
                ) : <h3 className="truncate text-lg font-bold">{product.name}</h3>}
              </OverflowTooltip>
              <p className="mt-1 text-sm text-muted-foreground">
                {product.category} · {typeLabel}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border/45 py-3 text-sm sm:grid-cols-3">
            {isFinished ? (
              <>
                {productStats.daysUsed !== null ? <div><p className="text-xs text-muted-foreground">Actual duration</p><p className="mt-1 font-semibold">{productStats.daysUsed} days</p></div> : null}
                {productStats.costPerDay !== null ? <div><p className="text-xs text-muted-foreground">Actual cost/day</p><p className="mt-1 font-semibold">{formatPHP(productStats.costPerDay)}</p></div> : null}
              </>
            ) : (
              <>
                {productStats.daysUsed !== null ? <div><p className="text-xs text-muted-foreground">Days in use</p><p className="mt-1 font-semibold">{productStats.daysUsed}</p></div> : null}
                {productStats.costPerDay !== null ? <div><p className="text-xs text-muted-foreground">Estimated cost/day</p><p className="mt-1 font-semibold">{formatPHP(productStats.costPerDay)}</p></div> : null}
                {productStats.typicalDurationDays !== null ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Typical duration</p>
                    <p className="mt-1 font-semibold">
                      {daysPastTypical !== null && daysPastTypical > 0
                        ? `${daysPastTypical} ${daysPastTypical === 1 ? 'day' : 'days'} past typical`
                        : daysPastTypical === 0
                          ? 'Typical duration reached'
                        : productStats.estimatedRemainingDays !== null && productStats.estimatedRemainingDays > 0
                          ? `~${productStats.estimatedRemainingDays} days remaining`
                          : `${productStats.typicalDurationDays} days`}
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Paid <strong className="text-foreground">{formatSkincarePrice(product.purchasePrice)}</strong></span>
            <span>Current/SRP <strong className="text-foreground">{formatSkincarePrice(product.currentPrice)}</strong></span>
            {priceComparison ? <span>Recorded price difference · <strong className="text-foreground">{priceComparison}</strong></span> : null}
            {transactionBySkincareId.has(product.id) ? (
              <button
                type="button"
                onClick={event => { event.stopPropagation(); navigateToTransaction(transactionBySkincareId.get(product.id)!.id); }}
                className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
              >
                <Link2 className="h-3 w-3" aria-hidden="true" /> Transaction · {formatPHP(transactionBySkincareId.get(product.id)!.amount)}
              </button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Today - <strong className="text-foreground">{todayUses} uses</strong></span>
            <span>Last used - <strong className="text-foreground">{productUsage[0] ? productUsage[0].usedAt.toLocaleDateString() : 'Not yet'}</strong></span>
          </div>

          {(() => {
            const priorCycles = getSkincarePurchaseHistoryChain(product, skincareProducts);
            if (!priorCycles.length) return null;
            const expanded = expandedHistoryIds.has(product.id);
            return (
              <div className="mt-3 border-t border-border/40 pt-3">
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    setExpandedHistoryIds(current => {
                      const next = new Set(current);
                      if (next.has(product.id)) next.delete(product.id);
                      else next.add(product.id);
                      return next;
                    });
                  }}
                  aria-expanded={expanded}
                  className="flex min-h-8 w-full items-center justify-between text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>Usage history · {priorCycles.length} previous</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded ? (
                  <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex items-center justify-between gap-2">
                      <span>#{priorCycles.length + 1} {product.startDate ? new Date(product.startDate).toLocaleDateString() : '—'} → {isFinished && product.emptiedAt ? new Date(product.emptiedAt).toLocaleDateString() : 'Active'}</span>
                      <span className="shrink-0 font-semibold text-foreground">{isFinished ? `${productStats.daysUsed ?? '—'} days` : 'Active'}</span>
                    </li>
                    {priorCycles.map((cycle, index) => {
                      const duration = getSkincareCompletedCycleDuration(cycle);
                      return (
                        <li key={cycle.id} className="flex items-center justify-between gap-2">
                          <span>#{priorCycles.length - index} {cycle.startDate ? new Date(cycle.startDate).toLocaleDateString() : '—'} → {cycle.emptiedAt ? new Date(cycle.emptiedAt).toLocaleDateString() : '—'}</span>
                          <span className="shrink-0 font-semibold text-foreground">{duration !== null ? `${duration} days` : '—'}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })()}

          <div className="mt-auto border-t border-border/40 pt-4">
            <SkincareLifeHubContext
              activity={getLifeHubActivity(product.id)}
              onOpenRoutine={routineId => openLifeHubRecord('routine', routineId)}
              onOpenTask={taskId => openLifeHubRecord('tasks', taskId)}
              onOpenLifeHub={() => {
                const activity = getLifeHubActivity(product.id);
                const firstRoutine = activity.routines[0];
                if (firstRoutine) openLifeHubRecord('routine', firstRoutine.routineId);
                else if (activity.tasks[0]) openLifeHubRecord('tasks', activity.tasks[0].taskId);
              }}
            />

          <div className="flex min-h-11 items-center justify-end gap-2 pt-4">
            {!androidPresentation && <>
              {!isFinished ? (
                <Button
                  size="sm"
                  onClick={event => {
                    event.stopPropagation();
                    primaryAction?.onSelect();
                  }}
                  className="android-touch-target min-h-11 rounded-xl"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Log use
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={event => {
                    event.stopPropagation();
                    primaryAction?.onSelect();
                  }}
                  className="rounded-xl"
                >
                  <ShoppingBag className="mr-2 h-4 w-4" /> Buy Again
                </Button>
              )}
            </>}

              <ActionMenu
                product={product}
                actions={actions}
                androidPresentation={androidPresentation}
                onAndroidOpen={() => setActionProductId(product.id)}
              />
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderListRow = (product: SkincareProduct) => {
    const productStats = getSkincareProductStats(product.id);
    const image = product.photo || product.image;
    const managedImageId = product.photoAssetIds?.[0];
    const status = statusFor(product);
    const isFinished = product.status === 'emptied';
    const typeLabel = SKINCARE_PRODUCT_TYPE_LABELS[product.productType || 'other'];
    const daysPastTypical = productStats.daysUsed !== null && productStats.typicalDurationDays !== null
      ? productStats.daysUsed - productStats.typicalDurationDays
      : null;
    const durationLabel = isFinished && productStats.daysUsed !== null
      ? `${productStats.daysUsed} days actual`
      : daysPastTypical !== null && daysPastTypical > 0
        ? `${daysPastTypical} ${daysPastTypical === 1 ? 'day' : 'days'} past typical`
        : daysPastTypical === 0
          ? 'Typical duration reached'
        : productStats.daysUsed !== null
          ? `${productStats.daysUsed} days in use`
          : productStats.typicalDurationDays !== null
            ? `Typical ${productStats.typicalDurationDays} days`
            : null;
    const priceComparison = getPriceComparison(product);
    const productUsage = skincareUsageEvents.filter(event => event.productId === product.id).sort((a, b) => b.usedAt.getTime() - a.usedAt.getTime());
    const todayUses = productUsage.filter(event => toLocalDateKey(event.usedAt) === toLocalDateKey(new Date())).length;
    const actions = getSkincareActions(product);
    const primaryAction = actions.find(action => action.id === (isFinished ? 'repurchase' : 'log'));

    return (
      <article
        key={product.id}
        data-caizen-collection-item="true"
        data-caizen-interactive-record="true"
        className="skincare-list-row group flex items-center gap-3 rounded-2xl border border-border/50 bg-card/70 px-3 py-2.5 transition-[border-color,box-shadow] duration-150 hover:border-primary/25"
      >
        <button
          type="button"
          aria-label={`View photo for ${product.name}`}
          onClick={event => {
            event.stopPropagation();
            if (managedImageId) setEnlargedImage(`asset:${managedImageId}`);
            else if (image) setEnlargedImage(image);
          }}
          className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted/30"
        >
          {managedImageId ? (
            <MediaAssetImage assetId={managedImageId} profileId={currentProfileId} alt={product.name} className="h-full w-full object-cover" />
          ) : image ? (
            <img src={image} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Droplets className="h-5 w-5 text-primary/30" />
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <OverflowTooltip text={product.name}><p className="truncate text-sm font-bold">{product.name}</p></OverflowTooltip>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${status.className}`}>
              {status.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {product.category} · {typeLabel}
            {durationLabel ? ` · ${durationLabel}` : ''}
            {productStats.costPerDay !== null ? ` · ${formatPHP(productStats.costPerDay)}/day` : ''}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            Paid {formatSkincarePrice(product.purchasePrice)} · Current/SRP {formatSkincarePrice(product.currentPrice)}
            {priceComparison ? <span className="ml-1">Recorded difference: {priceComparison}</span> : null}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Today - {todayUses} uses - Last used - {productUsage[0] ? productUsage[0].usedAt.toLocaleDateString() : 'Not yet'}</p>
          <SkincareLifeHubContext
            compact
            activity={getLifeHubActivity(product.id)}
            onOpenRoutine={routineId => openLifeHubRecord('routine', routineId)}
            onOpenTask={taskId => openLifeHubRecord('tasks', taskId)}
            onOpenLifeHub={() => {
              const activity = getLifeHubActivity(product.id);
              const firstRoutine = activity.routines[0];
              if (firstRoutine) openLifeHubRecord('routine', firstRoutine.routineId);
              else if (activity.tasks[0]) openLifeHubRecord('tasks', activity.tasks[0].taskId);
            }}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!androidPresentation && (!isFinished ? <Button size="sm" onClick={event => { event.stopPropagation(); primaryAction?.onSelect(); }} className="android-touch-target min-h-11 rounded-xl"><span className="hidden sm:inline">Log use</span><CheckCircle2 className="h-4 w-4 sm:hidden" /></Button> : null)}
          {!androidPresentation && (isFinished ? (
            <Button
              size="sm"
              onClick={event => {
                event.stopPropagation();
                primaryAction?.onSelect();
              }}
              className="android-touch-target min-h-11 rounded-xl"
            >
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">Buy Again</span>
            </Button>
          ) : null)}

          <ActionMenu
            product={product}
            actions={actions}
            androidPresentation={androidPresentation}
            onAndroidOpen={() => setActionProductId(product.id)}
          />
        </div>
      </article>
    );
  };

  return (
    <MonetaryMotionProvider revision={`${currentProfileId}:skincare:${activeTab}`} ready={isHydrated}>
    <div
      className={androidPresentation ? 'android-module-home space-y-4' : 'workspace-wide caizen-collection-page caizen-skincare-page space-y-4 lg:space-y-5'}
      data-android-screen="skincare"
    >
      <header className="border-b border-border/50 px-1 pb-4 sm:px-2">
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-page-title">
              Skincare & Hygiene
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Track products in use, actual usage history, prices, and repurchases.
            </p>
          </div>

        </div>
      </header>

      <section className="section-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-section-title">Shelf Overview</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Practical counts and price totals from the details you have recorded.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDashboard(value => !value)}
            aria-expanded={showDashboard}
            aria-label={showDashboard ? 'Hide Shelf Overview' : 'Show Shelf Overview'}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/40 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={`h-5 w-5 transition-transform ${showDashboard ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showDashboard ? (
          <>
            <div className="mt-5 grid gap-5 border-t border-border/50 pt-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <p className="text-sm font-semibold">Estimated cost</p>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 tabular-nums">
                  <span className="text-base font-semibold">Daily · <MonetaryNumber formatted={stats.dailyCost === null ? 'Not enough data' : `${formatPHP(stats.dailyCost)} / day`} hidden={false} /></span>
                  <span className="text-base font-semibold">Monthly · <MonetaryNumber formatted={stats.monthlyCost === null ? 'Not enough data' : `${formatPHP(stats.monthlyCost)} / month`} hidden={false} /></span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Based on {stats.pricedActiveCount} of {stats.active} active products with a recorded price and typical duration.</p>
              </div>

              <div>
                <p className="text-sm font-semibold">Current shelf</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{stats.active} active products</p>
                {stats.activeTypes.length ? (
                  <p className="mt-1 text-sm text-muted-foreground">{stats.activeTypes.map(([label, count]) => `${label} ${count}`).join(' · ')}</p>
                ) : <p className="mt-1 text-sm text-muted-foreground">No active products</p>}
                <p className="mt-1 text-xs text-muted-foreground">{stats.finished} finished products</p>
              </div>

              {stats.savings.comparableProducts > 0 ? (
                <div className="border-t border-border/45 pt-3 md:border-t-0 md:border-l md:pl-5 md:pt-0">
                  <p className="text-sm font-semibold">Recorded price difference</p>
                  <p className={`mt-2 text-xl font-bold tabular-nums ${stats.savings.amount < 0 ? 'text-orange-500' : 'text-emerald-500'}`}>
                    <MonetaryNumber formatted={stats.savings.amount > 0
                      ? `${formatPHP(stats.savings.amount)} above purchase prices`
                      : stats.savings.amount < 0
                        ? `${formatPHP(Math.abs(stats.savings.amount))} below purchase prices`
                        : 'No recorded difference'} hidden={false} />
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Across {stats.savings.comparableProducts} comparable product cycles; this is not current-shelf savings.</p>
                </div>
              ) : null}
            </div>

            {activeTab === 'finished' && stats.finished > 0 ? (
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 rounded-2xl bg-background/30 px-4 py-3 text-sm text-muted-foreground">
                <span>Average actual duration: <strong className="text-foreground">{stats.averageDuration || '—'} days</strong></span>
                <span>
                  Would repurchase: <strong className="text-foreground">{stats.wouldRepurchase} of {stats.decisionCount || stats.finished}</strong>
                </span>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <SegmentedControl
        label="Skincare status"
        value={activeTab}
        onValueChange={value => setActiveTab(value as 'active' | 'finished')}
        options={[
          { value: 'active', label: <>Active <span className="ml-1 text-xs tabular-nums text-muted-foreground">{activeProducts.length}</span></> },
          { value: 'finished', label: <>Finished <span className="ml-1 text-xs tabular-nums text-muted-foreground">{finishedProducts.length}</span></> },
        ]}
      />

      {androidPresentation ? (
      <div className="caizen-skincare-controls toolbar-surface flex w-full flex-col flex-wrap gap-2.5 p-3 sm:p-3 lg:sticky lg:top-4 lg:z-20 lg:flex-row lg:items-center">
        <SearchField
          wrapperClassName="w-full min-w-0 lg:min-w-[15rem] lg:flex-1"
          aria-label="Search skincare products"
          placeholder="Search products, type, or notes..."
          value={search}
          onChange={setSearch}
          surface="solid"
        />

        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:flex-nowrap">
          {androidPresentation ? <Button type="button" variant="outline" onClick={() => setShowAndroidFilters(true)} className="control-button"><SlidersHorizontal className="mr-2 h-4 w-4" />Filters{categoryFilter !== 'All' || sortBy !== 'newest' ? ' · Active' : ''}</Button> : <><Combobox
            value={categoryFilter}
            onChange={setCategoryFilter}
            ariaLabel="Personal care category filter"
            options={categories.map(value => ({ value, label: value }))}
            className="w-full sm:w-[10rem] lg:w-[9.5rem]"
          />
          <AndroidAdaptiveSelect
            value={sortBy}
            onChange={setSortBy}
            label="Sort personal care products"
            options={SKINCARE_SORT_OPTIONS}
            className="w-full sm:w-[11rem] lg:w-[10.5rem]"
          /></>}
          <TaxonomySettingsButton
            module="skincare"
            defaults={DEFAULT_SKINCARE_CATEGORIES}
            observed={skincareProducts.map(product => ({ category: product.category }))}
            showSubcategories={false}
            onRenameCategory={renameSkincareCategoryRecords}
            androidPresentation={androidPresentation}
          />
          <Button onClick={() => setShowExportModal(true)} variant="outline" className="control-button">
            Export Skincare
          </Button>
          <Button onClick={openAdd} className="control-button-primary">
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            label="Skincare view"
            className="shrink-0"
          />
        </div>
      </div>
      ) : (
        <div className="caizen-skincare-controls section-surface w-full p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <SearchField
                wrapperClassName="w-full lg:max-w-md"
                aria-label="Search skincare products"
                placeholder="Search products, type, or notes..."
                value={search}
                onChange={setSearch}
                surface="solid"
              />
              <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:flex-wrap">
                <TaxonomySettingsButton
                  module="skincare"
                  defaults={DEFAULT_SKINCARE_CATEGORIES}
                  observed={skincareProducts.map(product => ({ category: product.category }))}
                  showSubcategories={false}
                  onRenameCategory={renameSkincareCategoryRecords}
                />
                <Button type="button" onClick={() => setShowExportModal(true)} variant="outline" className="control-button min-h-11 w-full lg:w-auto">
                  Export Skincare
                </Button>
                <Button type="button" onClick={openAdd} className="control-button-primary min-h-11 w-full lg:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <Combobox
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  ariaLabel="Personal care category filter"
                  options={categories.map(value => ({ value, label: value }))}
                  className="w-full sm:w-[10rem] lg:w-[9.5rem]"
                />
                <Combobox
                  value={sortBy}
                  onChange={setSortBy}
                  ariaLabel="Sort personal care products"
                  options={[
                    { value: 'newest', label: 'Newest started' },
                    { value: 'oldest', label: 'Oldest started' },
                    { value: 'priceHigh', label: 'Price high to low' },
                    { value: 'priceLow', label: 'Price low to high' },
                    { value: 'costPerDay', label: 'Cost per day' },
                    { value: 'name', label: 'Name' },
                  ]}
                  className="w-full sm:w-[11rem] lg:w-[10.5rem]"
                />
              </div>
              <ViewModeToggle value={viewMode} onChange={setViewMode} label="Skincare view" className="shrink-0 self-start xl:self-auto" />
            </div>
          </div>
        </div>
      )}

      {androidPresentation ? <CaizenBottomSheet open={showAndroidFilters} title="Skincare filters" description="Narrow and sort your product shelf." onClose={() => setShowAndroidFilters(false)}>
        <div className="space-y-3 pb-2">
          <AndroidAdaptiveSelect label="Area or category" value={categoryFilter} onChange={setCategoryFilter} options={categories.map(value => ({ value, label: value }))} searchable={categories.length > 8} className="control-input" />
          <AndroidAdaptiveSelect label="Status" value={activeTab} onChange={value => setActiveTab(value as typeof activeTab)} options={[{ value: 'active', label: 'Active' }, { value: 'finished', label: 'Finished' }]} className="control-input" />
          <AndroidAdaptiveSelect label="Sort" value={sortBy} onChange={value => setSortBy(value as typeof sortBy)} options={SKINCARE_SORT_OPTIONS} className="control-input" />
          <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3"><Button type="button" variant="outline" onClick={() => { setCategoryFilter('All'); setSortBy('newest'); }}>Clear</Button><Button type="button" onClick={() => setShowAndroidFilters(false)}>Done</Button></div>
        </div>
      </CaizenBottomSheet> : null}

      {paginatedProducts.length ? (
        <div ref={collectionRevealRef} className={viewMode === 'grid' ? 'grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'flex flex-col gap-2'}>
          {viewMode === 'grid'
            ? paginatedProducts.map(renderCard)
            : paginatedProducts.map(renderListRow)}
        </div>
      ) : (
        <section className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-border bg-card/40 px-5 py-16 text-center">
          <Droplets className="h-11 w-11 text-primary/35" />
          <h3 className="mt-4 text-lg font-bold">
            {activeTab === 'active' ? 'No active products found' : 'No finished products found'}
          </h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {search || categoryFilter !== 'All'
              ? 'Clear or adjust the filters to see more products.'
              : activeTab === 'active'
                ? 'Add the first product currently in your routine.'
                : 'Products appear here after you mark them finished.'}
          </p>
          {activeTab === 'active' && !search && categoryFilter === 'All' ? (
            <Button onClick={openAdd} className="mt-5 rounded-2xl">
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          ) : null}
        </section>
      )}

      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 rounded-[1.5rem] border border-border/50 bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <span className="min-w-20 text-center text-sm font-semibold">
              {currentPage} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={deletingProductId !== null}
        title="Move Product to Trash"
        message="This moves the product to Trash for 30 days. Usage history keeps its saved product name snapshot."
        confirmText="Move to Trash"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (deletingProductId) deleteSkincareProduct(deletingProductId);
          setDeletingProductId(null);
        }}
        onCancel={() => setDeletingProductId(null)}
      />

      {editingProductId ? (
        <SkincareModal
          isOpen
          productId={editingProductId}
          androidPresentation={androidPresentation}
          onClose={() => setEditingProductId(null)}
        />
      ) : null}

      {internalAddOpen ? (
        <SkincareModal
          isOpen
          androidPresentation={androidPresentation}
          onClose={() => setInternalAddOpen(false)}
        />
      ) : null}

      <EntryActionSheet
        androidPresentation={androidPresentation}
        open={Boolean(actionProduct)}
        title={actionProduct?.name || 'Skincare product'}
        subtitle="Skincare"
        deleteMessage="This product moves to Trash for 30 days. Usage history keeps its saved product name snapshot."
        onClose={() => setActionProductId(null)}
        actions={actionProduct ? getSkincareActions(actionProduct) : []}
      />

      {enlargedImage && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={imagePreviewRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Image preview"
              data-caizen-overlay={imagePreviewIsClosing ? 'closing' : 'open'}
              data-state={imagePreviewIsClosing ? 'closed' : 'open'}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
              onClick={closeImagePreview}
            >
              <button
                type="button"
                aria-label="Close image preview"
                onClick={closeImagePreview}
                className="absolute right-5 top-5 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </button>
              <div data-caizen-overlay-panel="true">
              {enlargedImage.startsWith('asset:') ? (
                <MediaAssetImage
                  assetId={enlargedImage.slice('asset:'.length)}
                  profileId={currentProfileId}
                  alt="Product full view"
                  variant="full"
                  className="max-h-[88vh] max-w-[92vw] rounded-3xl object-contain shadow-2xl"
                />
              ) : (
                <img
                  src={enlargedImage}
                  alt="Product full view"
                  onClick={event => event.stopPropagation()}
                  className="max-h-[88vh] max-w-[92vw] rounded-3xl object-contain shadow-2xl"
                />
              )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {finishProductId && finishProduct && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[10000] overflow-y-auto" data-caizen-overlay={finishIsClosing ? 'closing' : 'open'} data-state={finishIsClosing ? 'closed' : 'open'}>
              <div data-caizen-overlay-backdrop="true" className="fixed inset-0 bg-black/70 backdrop-blur-md" onClick={closeFinish} />
              <div className="relative flex min-h-full items-center justify-center p-4">
                <div ref={finishPanelRef} role="dialog" aria-modal="true" aria-labelledby="skincare-finish-title" tabIndex={-1} className="w-full max-w-lg rounded-3xl border border-border/50 bg-card p-5 shadow-2xl sm:p-6" data-caizen-overlay-panel="true">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{finishProduct.status === 'emptied' ? 'Finish Details' : 'Finish Product'}</p>
                      <h2 id="skincare-finish-title" className="mt-2 break-words text-section-title">{finishProduct.name}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Preserve this usage cycle in Finished history.
                      </p>
                    </div>
                    <button type="button" onClick={closeFinish} aria-label="Close finish details" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-6 space-y-5">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Finished date</label>
                      <AdaptiveDatePicker
                        label="Finished date"
                        value={finishDate}
                        onChange={setFinishDate}
                        className="h-12 w-full rounded-2xl border border-border/50 bg-background/60 px-4"
                      />
                      {finishError ? <p className="text-sm font-medium text-destructive" role="alert">{finishError}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Would you buy it again?</label>
                      <RepurchaseDecision value={finishDecision} onChange={setFinishDecision} />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="skincare-finish-notes" className="text-label text-muted-foreground">Final notes</label>
                      <textarea
                        id="skincare-finish-notes"
                        value={finishNotes}
                        onChange={event => setFinishNotes(event.target.value)}
                        placeholder="Final thoughts, results, irritation, or why you would or would not repurchase."
                        className="min-h-28 w-full rounded-2xl border border-border/50 bg-background/60 px-4 py-3 text-sm focus:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={closeFinish} className="rounded-2xl">Cancel</Button>
                    <Button
                      onClick={() => {
                        const purchaseKey = finishProduct.purchaseDate ? toLocalDateKey(finishProduct.purchaseDate) : '';
                        const startKey = finishProduct.startDate ? toLocalDateKey(finishProduct.startDate) : '';
                        const invalidChronology = !finishDate ||
                          (purchaseKey && startKey && purchaseKey > startKey) ||
                          (startKey && finishDate < startKey) ||
                          (purchaseKey && finishDate < purchaseKey);
                        if (invalidChronology) {
                          setFinishError(!finishDate
                            ? 'Choose a finished date.'
                            : 'Dates must follow purchase, start, then finish order.');
                          return;
                        }
                        markSkincareProductEmptied(finishProductId, {
                          emptiedAt: parseLocalDateInput(finishDate),
                          emptiedNotes: finishNotes,
                          wouldRepurchase: finishDecision,
                        });
                        closeFinish();
                        setActiveTab('finished');
                        setSearch('');
                        setCategoryFilter('All');
                      }}
                      className="rounded-2xl"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {finishProduct.status === 'emptied' ? 'Save finish details' : 'Mark Finished'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {repurchaseProductId && repurchaseProduct && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[10000] overflow-y-auto" data-caizen-overlay={repurchaseIsClosing ? 'closing' : 'open'} data-state={repurchaseIsClosing ? 'closed' : 'open'}>
              <div data-caizen-overlay-backdrop="true" className="fixed inset-0 bg-black/70 backdrop-blur-md" onClick={closeRepurchase} />
              <div className="relative flex min-h-full items-center justify-center p-4">
                <div ref={repurchasePanelRef} role="dialog" aria-modal="true" aria-labelledby="skincare-repurchase-title" tabIndex={-1} className="w-full max-w-xl rounded-3xl border border-border/50 bg-card p-5 shadow-2xl sm:p-6" data-caizen-overlay-panel="true">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Buy Again</p>
                      <h2 id="skincare-repurchase-title" className="mt-2 break-words text-section-title">{repurchaseProduct.name}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Creates a new active record while keeping the finished one unchanged.
                      </p>
                    </div>
                    <button type="button" onClick={closeRepurchase} aria-label="Close buy again" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {repurchaseProduct.productLink ? (
                    <Button
                      variant="outline"
                      onClick={() => openExternalLink(repurchaseProduct.productLink)}
                      className="mt-5 rounded-2xl"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Product Link
                    </Button>
                  ) : null}

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="skincare-repurchase-price" className="text-label text-muted-foreground">Bought price</label>
                      <input
                        id="skincare-repurchase-price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={repurchasePrice}
                        onChange={event => setRepurchasePrice(event.target.value)}
                        placeholder="Not entered"
                        className="h-12 w-full rounded-2xl border border-border/50 bg-background/60 px-4"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="skincare-repurchase-current-price" className="text-label text-muted-foreground">Current / SRP price</label>
                      <input
                        id="skincare-repurchase-current-price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={repurchaseCurrentPrice}
                        onChange={event => setRepurchaseCurrentPrice(event.target.value)}
                        className="h-12 w-full rounded-2xl border border-border/50 bg-background/60 px-4"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Purchase date</label>
                      <AdaptiveDatePicker
                        label="Purchase date"
                        value={repurchaseDate}
                        onChange={setRepurchaseDate}
                        className="h-12 w-full rounded-2xl border border-border/50 bg-background/60 px-4"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Start date <span className="normal-case tracking-normal">(optional)</span></label>
                      <AdaptiveDatePicker
                        label="Start date"
                        value={repurchaseStartDate}
                        onChange={setRepurchaseStartDate}
                        className="h-12 w-full rounded-2xl border border-border/50 bg-background/60 px-4"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="skincare-repurchase-duration" className="text-label text-muted-foreground">Estimated duration (days) <span className="font-normal">(optional, from usage history)</span></label>
                      <input
                        id="skincare-repurchase-duration"
                        type="number"
                        min="1"
                        step="1"
                        value={repurchaseEstimatedDuration}
                        onChange={event => setRepurchaseEstimatedDuration(event.target.value)}
                        placeholder="No prior usage history"
                        className="h-12 w-full rounded-2xl border border-border/50 bg-background/60 px-4"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Frequency</label>
                      <Combobox
                        value={repurchaseFrequency}
                        onChange={value => setRepurchaseFrequency(value as SkincareFrequency)}
                        ariaLabel="Repurchase usage frequency"
                        options={[
                          { value: 'Daily', label: 'Daily' },
                          { value: 'Weekly', label: 'Weekly' },
                          { value: 'Custom', label: 'Custom' },
                        ]}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Routine</label>
                      <Combobox
                        value={repurchaseSchedule}
                        onChange={value => setRepurchaseSchedule(value as SkincareSchedule)}
                        ariaLabel="Repurchase routine"
                        options={[
                          { value: 'morning', label: 'Morning' },
                          { value: 'night', label: 'Night' },
                          { value: 'both', label: 'Morning & night' },
                        ]}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {repurchaseError ? <p className="mt-4 text-sm font-medium text-destructive" role="alert">{repurchaseError}</p> : null}
                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={closeRepurchase} className="rounded-2xl">Cancel</Button>
                    <Button
                      onClick={() => {
                        if (repurchaseDate && repurchaseStartDate && repurchaseDate > repurchaseStartDate) {
                          setRepurchaseError('Purchase date must be on or before the start date.');
                          return;
                        }
                        const enteredDuration = repurchaseEstimatedDuration.trim() ? Number(repurchaseEstimatedDuration) : null;
                        if (enteredDuration !== null && (!Number.isFinite(enteredDuration) || enteredDuration < 1)) {
                          setRepurchaseError('Estimated duration must be at least one day.');
                          return;
                        }
                        repurchaseSkincareProduct(repurchaseProductId, {
                          purchasePrice: repurchasePrice.trim() && Number.isFinite(Number(repurchasePrice))
                            ? Math.max(0, Number(repurchasePrice))
                            : undefined,
                          currentPrice: repurchaseCurrentPrice.trim()
                            ? Math.max(0, Number(repurchaseCurrentPrice))
                            : null,
                          purchaseDate: parseLocalDateInput(repurchaseDate),
                          startDate: repurchaseStartDate ? parseLocalDateInput(repurchaseStartDate) : undefined,
                          frequency: repurchaseFrequency,
                          schedule: repurchaseSchedule,
                          estimatedDuration: enteredDuration === null ? undefined : Math.max(1, enteredDuration),
                        });
                        closeRepurchase();
                        setActiveTab('active');
                        setSearch('');
                        setCategoryFilter('All');
                        setSortBy('newest');
                      }}
                      className="rounded-2xl"
                    >
                      <ShoppingBag className="mr-2 h-4 w-4" />
                      Create New Active Product
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {exportModal}
    </div>
    </MonetaryMotionProvider>
  );
}
