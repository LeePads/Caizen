'use client';
import { getSectionDiscoveryMeta } from '@/lib/discovery/section-meta';
import { createPortal } from 'react-dom';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import NotesModal from '@/components/modals/NotesModal';
import InventoryExportModal from '@/components/modals/InventoryExportModal';
import {
  BookOpen,
  Building2,
  ChevronDown,
  Cpu,
  Image as ImageIcon,
  Link2,
  LayoutGrid,
  List,
  MoreVertical,
  Package,
  Search,
  Shield,
  TrendingDown,
  TrendingUp,
  Wrench,
  X,
} from 'lucide-react';

import { useAppContext } from '@/lib/context';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';

import {
  Card,
  CardContent,
} from '@/components/ui/card';

import { Button } from '@/components/ui/button';

import InventoryModal from '@/components/modals/InventoryModal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';
import { EntryActionSheet, type EntryAction } from '@/components/common/EntryActionSheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import InventoryCategoryDashboard from './InventoryCategoryDashboard';

import { formatItemAge } from '@/lib/utils-age';

import { formatPHP } from '@/lib/currency';
import { MonetaryMotionProvider, MonetaryNumber } from '@/components/ui/monetary-number';
import {
  getInventoryCurrentValue,
  getInventoryCurrentValueIfKnown,
  getInventoryPurchaseCostIfKnown,
  getInventoryPurchaseCost,
  getInventoryQuantity,
  getInventorySavingsPerUnit,
  sumInventorySavings,
} from '@/lib/collections/inventory-metrics';
import {
  getInventoryCategoryEditorValue,
  INVENTORY_TAXONOMY_DEFAULTS,
  normalizeInventoryCategoryKey,
} from '@/lib/collections/inventory-taxonomy';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { SearchField } from '@/components/ui/search-field';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';
import { CollectionToolbar } from '@/components/ui/collection-controls';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import { listRecoveredInventoryPhotos } from '@/lib/native/inventory-photo-recovery';
import { ViewModeToggle } from '@/components/ui/view-mode-toggle';
import { useProfileModuleTaxonomy } from '@/lib/module-taxonomy';
import { TaxonomySettingsButton } from '@/components/common/TaxonomySettingsButton';
import { InventoryStorageLocationSettingsButton } from '@/components/common/InventoryStorageLocationSettingsButton';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import type { InventoryItem } from '@/lib/types';
import { buildLinkedRecordTransactionMap } from '@/lib/transactions';
import { navigateToTransaction } from '@/lib/balance/linked-record';
import type { InventoryExportFilters } from '@/lib/collections/inventory-exports';
import {
  composeInventoryStorageLocations,
  INVENTORY_STORAGE_LOCATION_MODULE,
  normalizeStorageLocation,
} from '@/lib/inventory-storage-locations';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface InventorySectionProps {
  onAddClick: () => void;
  compactMobileMode?: boolean;
  androidPresentation?: boolean;
  requestedRecordId?: string;
  requestedRecordSignal?: number;
  onRequestedRecordConsumed?: (signal: number) => void;
}

// InventoryCategoryDashboard groups subcategory tags case/whitespace-
// insensitively and shows a synthetic "Uncategorized" tag for items with no
// subCategory. Selecting a tag must filter with the same rule, or clicking a
// tag can show fewer (or zero) items than the count it displayed.
function normalizeSubCategoryLabel(value?: string) {
  return (value?.trim() || 'Uncategorized').toLocaleLowerCase().replace(/\s+/g, ' ');
}


/* =========================================
   CATEGORY UI
========================================= */

const getCategoryUI = (
  cat: string
) => {
  switch (cat) {
    case 'personal_tech':
      return {
        label:
          'Personal Tech',

        icon: Cpu,

        color:
          'bg-blue-500/10 text-blue-400 border-blue-500/20',

        glow:
          'bg-blue-500/20',

        surface:
          'from-blue-500/20 via-sky-500/10 to-background',
      };

    case 'utilities':
      return {
        label:
          'Utilities',

        icon: Wrench,

        color:
          'bg-purple-500/10 text-purple-400 border-purple-500/20',

        glow:
          'bg-purple-500/20',

        surface:
          'from-purple-500/20 via-fuchsia-500/10 to-background',
      };

    case 'wearables':
      return {
        label:
          'Wearables',

        icon: Shield,

        color:
          'bg-pink-500/10 text-pink-400 border-pink-500/20',

        glow:
          'bg-pink-500/20',

        surface:
          'from-pink-500/20 via-rose-500/10 to-background',
      };

    case 'home':
      return {
        label:
          'Home',

        icon: Building2,

        color:
          'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',

        glow:
          'bg-emerald-500/20',

        surface:
          'from-emerald-500/20 via-teal-500/10 to-background',
      };

    default:
      return {
        label:
          'Other',

        icon: Package,

        color:
          'bg-muted text-muted-foreground border-border',

        glow:
          'bg-muted',

        surface:
          'from-muted/60 via-muted/20 to-background',
      };
  }
};

/* =========================================
   STATUS UI
========================================= */

const getStatusUI = (status?: string) => {
  switch (status) {
    case 'using':
      return { label: 'Using', color: 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300' };
    case 'stored':
      return { label: 'Stored', color: 'border-border/60 bg-muted/45 text-muted-foreground' };
    case 'maintenance':
      return { label: 'Maintenance', color: 'border-amber-500/25 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300' };
    case 'replace':
      return { label: 'Replace soon', color: 'border-amber-500/25 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300' };
    case 'retired':
    case 'broken':
      return { label: 'Retired', color: 'bg-muted text-muted-foreground border-border/60' };
    case 'archived':
      return { label: 'Archived', color: 'border-border/60 bg-muted/45 text-muted-foreground' };
    default:
      return null;
  }
};

/* =========================================
   AGE COLOR
========================================= */

const getAgeColor = (date: Date) => {
  void date;
  return 'text-muted-foreground';
};

/* =========================================
   RARITY SYSTEM
========================================= */

const getRarity = (
  value: number
) => {
  if (value >= 100000)
    return {
      label:
        'Mythic',

      border:
        'border-yellow-500/30',

      glow:
        'bg-yellow-500/20',

      text:
        'text-yellow-400',

      shadow:
        'group-hover:shadow-yellow-500/25',
    };

  if (value >= 50000)
    return {
      label:
        'Legendary',

      border:
        'border-orange-500/30',

      glow:
        'bg-orange-500/20',

      text:
        'text-orange-400',

      shadow:
        'group-hover:shadow-orange-500/25',
    };

  if (value >= 15000)
    return {
      label:
        'Epic',

      border:
        'border-purple-500/30',

      glow:
        'bg-purple-500/20',

      text:
        'text-purple-400',

      shadow:
        'group-hover:shadow-purple-500/25',
    };

  if (value >= 5000)
    return {
      label:
        'Rare',

      border:
        'border-blue-500/30',

      glow:
        'bg-blue-500/20',

      text:
        'text-blue-400',

      shadow:
        'group-hover:shadow-blue-500/25',
    };

  return {
    label:
      'Common',

    border:
      'border-border',

    glow:
      'bg-muted',

    text:
      'text-muted-foreground',

    shadow:
      'group-hover:shadow-muted/20',
  };
};

function getValueLabel(
  item: InventoryItem
) {
  const value = getInventoryPurchaseCostIfKnown(item);
  if (value !== null) return formatPHP(value);
  return 'Not entered';
}

function formatKnownInventoryMoney(value: number | null) {
  return value === null ? 'Not entered' : formatPHP(value);
}

function getSavingsLabel(value: number | null) {
  if (value === null) return 'Not available';
  if (value === 0) return 'No difference';
  return `${formatPHP(Math.abs(value))} ${value > 0 ? 'saved' : 'above current price'}`;
}

function formatNotesPreview(
  notes?: string
) {
  if (!notes) return '';

  return notes
    .split('\n')
    .slice(0, 3)
    .map(line => {
      const trimmed =
        line.trim();

      if (
        trimmed.startsWith('- ') ||
        trimmed.startsWith('* ')
      ) {
        return `• ${trimmed.substring(2)}`;
      }

      return trimmed;
    })
    .join('\n');
}

function getCategoryLabel(category: string) {
  switch (category) {
    case 'personal_tech':
      return 'Personal Tech';
    case 'utilities':
      return 'Utilities';
    case 'wearables':
      return 'Wearables';
    case 'home':
      return 'Home';
    default:
      return category.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) || 'Other';
  }
}

function getFinancialTone(value: number | null) {
  if (value === null || value === 0) return 'text-foreground';
  return value > 0
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-destructive';
}

function compareInventoryCurrentValue(a: InventoryItem, b: InventoryItem, direction: 1 | -1) {
  const valueA = getInventoryCurrentValueIfKnown(a);
  const valueB = getInventoryCurrentValueIfKnown(b);
  if (valueA === null) return valueB === null ? 0 : 1;
  if (valueB === null) return -1;
  return direction * (valueA - valueB);
}

type InventoryRecordCardProps = {
  item: InventoryItem;
  currentProfileId: string;
  viewMode: 'grid' | 'list';
  detailMode: 'full' | 'simple';
  hasSourcePlan: boolean;
  onOpenSourcePlan: () => void;
  hasLinkedBook: boolean;
  onPreview: (value: string) => void;
  actionMenu: ReactNode;
  onNotes: () => void;
};

function InventoryRecordCard({
  item,
  currentProfileId,
  viewMode,
  detailMode,
  hasSourcePlan,
  onOpenSourcePlan,
  hasLinkedBook,
  onPreview,
  actionMenu,
  onNotes,
}: InventoryRecordCardProps) {
  const purchaseDate = new Date(item.purchaseDate);
  const currentValue = getInventoryCurrentValueIfKnown(item);
  const savings = getInventorySavingsPerUnit(item);
  const status = getStatusUI(item.status);
  const categoryLabel = getCategoryLabel(normalizeInventoryCategoryKey(item.category));
  const hasPreviewImage = Boolean(item.photoAssetIds?.[0] || item.image);
  const productLink = normalizeExternalWebUrl(item.productLink);
  const categoryDetail = [categoryLabel, item.subCategory?.trim()].filter(Boolean).join(' · ');
  const financialTone = getFinancialTone(savings);

  const nameContent = (
    <OverflowTooltip text={item.name}>
      {productLink ? (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            void openExternalLink(productLink).catch(() => toast({
              title: 'Could not open link',
              description: 'Check the saved inventory link and try again.',
            }));
          }}
          className="block min-h-11 max-w-full truncate text-left text-lg font-bold tracking-tight hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-xl"
          aria-label={`Open website for ${item.name}`}
        >
          {item.name}
        </button>
      ) : (
        <h3 className="truncate text-lg font-bold tracking-tight sm:text-xl">{item.name}</h3>
      )}
    </OverflowTooltip>
  );

  const metadata = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>{categoryDetail}</span>
      {status ? <span className={`rounded-md border px-2 py-1 font-medium ${status.color}`}>{status.label}</span> : null}
      {item.storageLocation ? <span>Location: {item.storageLocation}</span> : null}
      {hasSourcePlan ? (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onOpenSourcePlan();
          }}
          className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Open Plan for ${item.name}`}
        >
          Planned purchase
        </button>
      ) : null}
      {hasLinkedBook ? (
        <Tooltip><TooltipTrigger asChild><span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 font-semibold text-primary">
          <BookOpen className="h-3 w-3" aria-hidden="true" /> Linked to Books
        </span></TooltipTrigger><TooltipContent>{"Linked to a Books entry"}</TooltipContent></Tooltip>
      ) : null}
    </div>
  );

  if (viewMode === 'list') {
    return (
      <Card data-caizen-collection-item="true" data-caizen-interactive-record="true" className="inventory-record-card overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-muted-foreground">{categoryDetail}</p>
                  {nameContent}
                </div>
                {actionMenu}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Age: {formatItemAge(purchaseDate)}</span>
                <span>Quantity: {item.quantity || 1}</span>
                {status ? <span className={`rounded-md border px-2 py-1 font-medium ${status.color}`}>{status.label}</span> : null}
                {item.storageLocation ? <span>Location: {item.storageLocation}</span> : null}
                {hasSourcePlan ? (
                  <button type="button" onClick={onOpenSourcePlan} className="font-semibold text-primary hover:underline">
                    Planned purchase
                  </button>
                ) : null}
                {hasLinkedBook ? (
                  <Tooltip><TooltipTrigger asChild><span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 font-semibold text-primary">
                    <BookOpen className="h-3 w-3" aria-hidden="true" /> Linked to Books
                  </span></TooltipTrigger><TooltipContent>{"Linked to a Books entry"}</TooltipContent></Tooltip>
                ) : null}
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-x-5 gap-y-3 border-t border-border/50 pt-3 text-sm sm:min-w-[29rem] sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
              <div>
                <dt className="text-xs text-muted-foreground">Purchase Cost</dt>
                <dd className="mt-1 font-semibold">{getValueLabel(item)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Current Value</dt>
                <dd className="mt-1 font-semibold">{formatKnownInventoryMoney(currentValue)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Savings</dt>
                <dd className={`mt-1 font-semibold ${financialTone}`}>{getSavingsLabel(savings)}</dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-caizen-collection-item="true" data-caizen-interactive-record="true" className="inventory-record-card overflow-hidden">
      <div className="relative h-44 overflow-hidden border-b border-border/50 bg-muted/30">
        {hasPreviewImage ? (
          <button
            type="button"
            aria-label={`Preview image for ${item.name}`}
            onClick={event => {
              event.stopPropagation();
              onPreview(item.photoAssetIds?.[0] ? `asset:${item.photoAssetIds[0]}` : item.image || '');
            }}
            className="absolute inset-0 z-10 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          />
        ) : null}
        {item.photoAssetIds?.[0] ? (
          <MediaAssetImage profileId={currentProfileId} assetId={item.photoAssetIds[0]} alt={item.name} className="h-full w-full object-cover" />
        ) : item.image ? (
          <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/35">
            <ImageIcon className="h-9 w-9" aria-hidden="true" />
          </div>
        )}
      </div>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs text-muted-foreground">{categoryDetail}</p>
            {nameContent}
          </div>
          {actionMenu}
        </div>

        {detailMode === 'full' ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/50 py-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Purchase Cost</dt>
              <dd className="mt-1 font-semibold">{getValueLabel(item)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Current Value</dt>
              <dd className="mt-1 font-semibold">{formatKnownInventoryMoney(currentValue)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Age</dt>
              <dd className="mt-1 font-medium">{formatItemAge(purchaseDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Quantity</dt>
              <dd className="mt-1 font-medium">{item.quantity || 1}{item.unit ? ` ${item.unit}` : ''}</dd>
            </div>
          </dl>
        ) : (
          <div className="grid grid-cols-2 gap-4 border-y border-border/50 py-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Purchase Cost</p>
              <p className="mt-1 font-semibold">{getValueLabel(item)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current Value</p>
              <p className="mt-1 font-semibold">{formatKnownInventoryMoney(currentValue)}</p>
            </div>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Savings</span>
          <span className={`text-right font-semibold ${financialTone}`}>{getSavingsLabel(savings)}</span>
        </div>

        {metadata}

        {detailMode === 'full' && item.notes?.trim() ? (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onNotes();
            }}
            className="w-full border-t border-border/50 pt-3 text-left text-xs leading-relaxed text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="font-semibold text-foreground">Notes</span>
            <span className="mt-1 block line-clamp-2 whitespace-pre-line">{formatNotesPreview(item.notes)}</span>
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'using', label: 'Using' },
  { value: 'stored', label: 'Stored' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'replace', label: 'Replace soon' },
  { value: 'retired', label: 'Retired' },
  { value: 'archived', label: 'Archived' },
];

/* =========================================
   COMPONENT
========================================= */

export default function InventorySection({
  onAddClick,
  compactMobileMode = false,
  androidPresentation = false,
  requestedRecordId,
  requestedRecordSignal = 0,
  onRequestedRecordConsumed,
}: InventorySectionProps) {
  const {
    inventoryItems,
    wishlistItems,
    books,
    transactions,
    deleteInventoryItem,
    renameInventoryCategoryRecords,
    renameInventorySubcategoryRecords,
    profiles,
    currentProfileId,
    isHydrated,
  } = useAppContext();
  const [recoveryNotice, setRecoveryNotice] = useState<{ profileId: string; count: number; failed: boolean } | null>(null);
  const [recoveryRetry, setRecoveryRetry] = useState(0);
  useEffect(() => {
    if (!androidPresentation) return;
    let cancelled = false;
    let readId = 0;
    setRecoveryNotice(null);
    const refresh = () => {
      const currentRead = ++readId;
      void listRecoveredInventoryPhotos().then(photos => {
        if (!cancelled && currentRead === readId) setRecoveryNotice({
          profileId: currentProfileId,
          count: photos.filter(photo => photo.profileId === currentProfileId).length,
          failed: false,
        });
      }).catch(() => {
        if (!cancelled && currentRead === readId) setRecoveryNotice({ profileId: currentProfileId, count: 0, failed: true });
      });
    };
    refresh();
    window.addEventListener('caizen:inventory-photo-recovered', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('caizen:inventory-photo-recovered', refresh);
    };
  }, [androidPresentation, currentProfileId, recoveryRetry]);
  // Inventory never stores a transaction reference itself - the reverse
  // link is derived by scanning Transactions for a matching linkedRecord,
  // built once per render instead of per card.
  const transactionByInventoryId = useMemo(
    () => buildLinkedRecordTransactionMap(transactions, 'inventory'),
    [transactions],
  );
  const sourcePlanByInventoryId = useMemo(
    () => new Map(
      wishlistItems
        .filter(item => item.destinationType === 'inventory' && item.destinationItemId)
        .map(item => [item.destinationItemId as string, item]),
    ),
    [wishlistItems],
  );
  const linkedBookByInventoryId = useMemo(
    () => new Map(
      books
        .filter(book => book.linkedInventoryItemId)
        .map(book => [book.linkedInventoryItemId as string, book]),
    ),
    [books],
  );
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const openSourcePlan = (inventoryId: string) => {
    const plan = sourcePlanByInventoryId.get(inventoryId);
    if (!plan) return;
    window.dispatchEvent(new CustomEvent('life-manager:navigate', {
      detail: { section: 'balance', feature: 'plan-item', recordId: plan.id },
    }));
  };
  const getInventoryActions = (item: InventoryItem): EntryAction[] => [
    ...(sourcePlanByInventoryId.has(item.id) ? [{
      id: 'source' as const,
      label: 'Open source Plan',
      onSelect: () => openSourcePlan(item.id),
    }] : []),
    ...(normalizeExternalWebUrl(item.productLink) ? [{
      id: 'open' as const,
      label: 'Open website',
      onSelect: () => {
        const destination = normalizeExternalWebUrl(item.productLink);
        if (destination) void openExternalLink(destination).catch(() => toast({ title: 'Could not open link', description: 'Check the saved inventory link and try again.' }));
      },
    }] : []),
    {
      id: 'edit' as const,
      label: 'Edit item',
      onSelect: () => setEditingItem(item.id),
    },
    {
      id: 'delete' as const,
      label: 'Move item to Trash',
      destructive: true,
      confirm: false,
      onSelect: () => setInventoryItemToDelete(item),
    },
  ];
  const renderInventoryActionMenu = (item: InventoryItem) => androidPresentation ? (
    <button
      type="button"
      data-entry-actions
      onClick={event => {
        event.stopPropagation();
        setActionItemId(item.id);
      }}
      className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`Actions for ${item.name}`}
    >
      <MoreVertical className="h-5 w-5" aria-hidden="true" />
    </button>
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-entry-actions
          onClick={event => event.stopPropagation()}
          className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Actions for ${item.name}`}
        >
          <MoreVertical className="h-5 w-5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-52">
        {sourcePlanByInventoryId.has(item.id) ? <DropdownMenuItem onSelect={() => openSourcePlan(item.id)}>Open source Plan</DropdownMenuItem> : null}
        {normalizeExternalWebUrl(item.productLink) ? (
          <DropdownMenuItem onSelect={() => {
            const destination = normalizeExternalWebUrl(item.productLink);
            if (destination) void openExternalLink(destination).catch(() => toast({ title: 'Could not open link', description: 'Check the saved inventory link and try again.' }));
          }}>
            Open website
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => setEditingItem(item.id)}>Edit item</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setInventoryItemToDelete(item)} variant="destructive">Move item to Trash</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const taxonomy = useProfileModuleTaxonomy('inventory', INVENTORY_TAXONOMY_DEFAULTS, inventoryItems.map(item => ({ category: getInventoryCategoryEditorValue(item.category), subcategory: item.subCategory })));

  const [
    searchTerm,
    setSearchTerm,
  ] = useState('');

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState('all');

  const [
    selectedSubCategory,
    setSelectedSubCategory,
  ] = useState('all');

  const [
    selectedStatus,
    setSelectedStatus,
  ] = useState('all');

  const [selectedLocation, setSelectedLocation] = useState('all');

  const [
    sortBy,
    setSortBy,
  ] = useState(
    'date_desc'
  );
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [
    viewMode,
    setViewMode,
  ] = useState<
    'grid' | 'list'
  >(() => {
    if (typeof window === 'undefined') return androidPresentation ? 'list' : 'grid';
    const stored = window.localStorage.getItem(`inventory-view-mode:${currentProfileId}`);
    return stored === 'grid' || stored === 'list' ? stored : (androidPresentation ? 'list' : 'grid');
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`inventory-view-mode:${currentProfileId}`, viewMode);
  }, [viewMode, currentProfileId]);

  const [
    detailMode,
    setDetailMode,
  ] = useState<'full' | 'simple'>(() => {
    if (typeof window === 'undefined') return androidPresentation ? 'simple' : 'full';
    const stored = window.localStorage.getItem(`inventory-detail-mode:${currentProfileId}`);
    return stored === 'full' || stored === 'simple' ? stored : (androidPresentation ? 'simple' : 'full');
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`inventory-detail-mode:${currentProfileId}`, detailMode);
  }, [detailMode, currentProfileId]);

  const [
    editingItem,
    setEditingItem,
  ] = useState<
    string | null
  >(null);
  const consumedRequestSignalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!requestedRecordSignal || consumedRequestSignalRef.current === requestedRecordSignal) return;
    consumedRequestSignalRef.current = requestedRecordSignal;
    if (requestedRecordId && inventoryItems.some(item => item.id === requestedRecordId)) {
      setEditingItem(requestedRecordId);
    }
    onRequestedRecordConsumed?.(requestedRecordSignal);
  }, [inventoryItems, onRequestedRecordConsumed, requestedRecordId, requestedRecordSignal]);

  const [inventoryItemToDelete, setInventoryItemToDelete] = useState<InventoryItem | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const actionItem = actionItemId ? inventoryItems.find(item => item.id === actionItemId) : undefined;
  const actionActions = actionItem ? getInventoryActions(actionItem) : [];

  const [
    selectedNotes,
    setSelectedNotes,
  ] = useState<string | null>(null);

  const [
    enlargedImage,
    setEnlargedImage,
  ] = useState<string | null>(null);
  const imagePreviewRef = useRef<HTMLDivElement>(null);
  const { close: closeImagePreview, isClosing: imagePreviewIsClosing } = useAnimatedOverlayClose({
    isOpen: Boolean(enlargedImage),
    onClose: () => setEnlargedImage(null),
  });
  useOverlayLifecycle(Boolean(enlargedImage), closeImagePreview, {
    containerRef: imagePreviewRef,
  });


  const ITEMS_PER_PAGE = 15;
  const ANDROID_ITEMS_PER_PAGE = 20;

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1);

  const [showDashboard, setShowDashboard] =
    useState(() => {
      if (typeof window === 'undefined') return true;

      return (
        localStorage.getItem('inventory-dashboard-open') !==
        'false'
      );
    });

  useEffect(() => {
    localStorage.setItem(
      'inventory-dashboard-open',
      String(showDashboard)
    );
  }, [showDashboard]);
  /* =========================================
     PROFILE
  ========================================= */

  const currentProfile =
    profiles.find(
      p =>
        p.id ===
        currentProfileId
    );

  const profileName =
    currentProfile?.name ||
    'Inventory';
  const exportCurrency = currentProfile?.currency || currentProfile?.baseCurrency || 'PHP';

  const availableSubCategories =
    selectedCategory !== 'all'
      ? taxonomy.categories.find(category => normalizeInventoryCategoryKey(category.name) === normalizeInventoryCategoryKey(selectedCategory))?.subcategories || []
      : taxonomy.activeCategories.flatMap(category => category.subcategories);

  const composedStorageLocations = composeInventoryStorageLocations(
    currentProfile?.moduleTaxonomies?.[INVENTORY_STORAGE_LOCATION_MODULE],
    inventoryItems,
  );
  const availableLocations = composedStorageLocations
    .filter(location =>
      !location.archived ||
      inventoryItems.some(item => normalizeStorageLocation(item.storageLocation) === normalizeStorageLocation(location.name)),
    )
    .map(location => location.name);

  /* =========================================
     FILTERED ITEMS
  ========================================= */

  const filteredItems =
    inventoryItems
      .filter(item => {
        const normalizedCat = normalizeInventoryCategoryKey(item.category);
        const term = searchTerm.trim().toLocaleLowerCase();
        const matchesSearch = !term || [
          item.name,
          item.category,
          item.subCategory,
          item.storageLocation,
          item.notes,
        ].some(value => String(value || '').toLocaleLowerCase().includes(term));

        return (
          matchesSearch &&
          (selectedCategory ===
            'all' ||
            normalizedCat === normalizeInventoryCategoryKey(selectedCategory)) &&
          (selectedSubCategory ===
            'all' ||
            normalizeSubCategoryLabel(item.subCategory) ===
            normalizeSubCategoryLabel(selectedSubCategory)) &&
          (selectedStatus ===
            'all' ||
            item.status ===
            selectedStatus) &&
          (selectedLocation === 'all' || normalizeStorageLocation(item.storageLocation) === normalizeStorageLocation(selectedLocation))
        );
      })
      .sort((a, b) => {
        const dateA =
          new Date(
            a.purchaseDate
          ).getTime();

        const dateB =
          new Date(
            b.purchaseDate
          ).getTime();

        switch (sortBy) {
          case 'date_desc':
            return (
              dateB - dateA
            );

          case 'date_asc':
            return (
              dateA - dateB
            );

          case 'price_high':
            return compareInventoryCurrentValue(a, b, -1);

          case 'price_low':
            return compareInventoryCurrentValue(a, b, 1);

          default:
            return 0;
        }
      });
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedCategory,
    selectedSubCategory,
    selectedStatus,
    selectedLocation,
    sortBy,
  ]);
  /* =========================================
     TOTAL VALUE
  ========================================= */
  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredItems.length /
      ITEMS_PER_PAGE
    )
  );

  const paginatedItems =
    filteredItems.slice(
      (currentPage - 1) *
      ITEMS_PER_PAGE,
      currentPage *
      ITEMS_PER_PAGE
    );
  const androidTotalPages = Math.max(1, Math.ceil(filteredItems.length / ANDROID_ITEMS_PER_PAGE));
  const androidPaginatedItems = filteredItems.slice(
    (currentPage - 1) * ANDROID_ITEMS_PER_PAGE,
    currentPage * ANDROID_ITEMS_PER_PAGE,
  );
  const collectionRevealRef = useCollectionReveal(
    (compactMobileMode || androidPresentation ? androidPaginatedItems : paginatedItems).map(item => item.id),
    [currentProfileId, selectedCategory, selectedSubCategory, selectedStatus, selectedLocation, sortBy, currentPage, viewMode, detailMode],
  );
  const exportFilters: InventoryExportFilters = {
    search: searchTerm,
    category: selectedCategory,
    subcategory: selectedSubCategory,
    status: selectedStatus,
    location: selectedLocation,
    sort: sortBy,
  };
  const hasActiveInventoryFilters = Boolean(
    searchTerm.trim() ||
    selectedCategory !== 'all' ||
    selectedSubCategory !== 'all' ||
    selectedStatus !== 'all' ||
    selectedLocation !== 'all',
  );
  const currentHoldings = inventoryItems.filter(item => item.status !== 'archived');
  const totalUnits = currentHoldings.reduce((sum, item) => sum + getInventoryQuantity(item), 0);
  const purchaseCostKnownCount = currentHoldings.filter(item => getInventoryPurchaseCostIfKnown(item) !== null).length;
  const currentValueKnownCount = currentHoldings.filter(item => getInventoryCurrentValueIfKnown(item) !== null).length;
  const savingsKnownCount = currentHoldings.filter(item => getInventorySavingsPerUnit(item) !== null).length;
  const totalPurchaseValue = purchaseCostKnownCount
    ? currentHoldings.reduce((sum, item) => sum + (getInventoryPurchaseCostIfKnown(item) ?? 0) * getInventoryQuantity(item), 0)
    : null;
  const totalCurrentValue = currentValueKnownCount
    ? currentHoldings.reduce((sum, item) => sum + (getInventoryCurrentValueIfKnown(item) ?? 0) * getInventoryQuantity(item), 0)
    : null;
  const totalSavings = sumInventorySavings(currentHoldings);
  const clearInventoryFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedSubCategory('all');
    setSelectedStatus('all');
    setSelectedLocation('all');
    setSortBy('date_desc');
    setCurrentPage(1);
  };

  if (compactMobileMode || androidPresentation) {
    return (
      <MonetaryMotionProvider revision={`${currentProfileId}:inventory`} ready={isHydrated}>
      <div className="compact-section space-y-3" data-android-screen="inventory-home">
        <div className="compact-sticky-header">
          <div>
            <h1 className="text-lg font-black">Inventory</h1>
            <p className="text-xs text-muted-foreground">
              {currentHoldings.length} active records · {totalUnits} units · {new Set(currentHoldings.map(item => normalizeInventoryCategoryKey(item.category))).size} categories
            </p>
          </div>
          <button type="button" onClick={() => setShowExportModal(true)} className="min-h-11 rounded-2xl border border-border/60 bg-card px-3 py-2 text-sm font-black text-foreground">
            Export
          </button>
        </div>

        {androidPresentation && recoveryNotice?.profileId === currentProfileId && recoveryNotice.count > 0 && (
          <div className="compact-card border border-primary/30" role="status">
            <p className="text-sm font-bold">{recoveryNotice.count === 1 ? 'Recovered camera photo' : `${recoveryNotice.count} recovered camera photos`}</p>
            <p className="mt-1 text-sm text-muted-foreground">Open an existing item to attach or discard {recoveryNotice.count === 1 ? 'it' : 'them'}, or add a new item to review.</p>
            <button type="button" onClick={onAddClick} className="mt-3 min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
              Add item to review
            </button>
          </div>
        )}
        {androidPresentation && recoveryNotice?.profileId === currentProfileId && recoveryNotice.failed && (
          <div className="compact-card border border-destructive/30" role="status">
            <p className="text-sm">Recovered photos could not be checked.</p>
            <button type="button" onClick={() => setRecoveryRetry(value => value + 1)} className="mt-2 min-h-11 rounded-xl border border-border px-4 text-sm font-bold">Retry</button>
          </div>
        )}

        <div className="android-stat-grid">
          <div><span>Purchase cost · {purchaseCostKnownCount}/{currentHoldings.length} valued</span><strong><MonetaryNumber formatted={formatKnownInventoryMoney(totalPurchaseValue)} hidden={false} /></strong></div>
          <div><span>Current value · {currentValueKnownCount}/{currentHoldings.length} valued</span><strong><MonetaryNumber formatted={formatKnownInventoryMoney(totalCurrentValue)} hidden={false} /></strong></div>
          <div><span>Savings · {savingsKnownCount}/{currentHoldings.length} comparable</span><strong className={getFinancialTone(totalSavings)}><MonetaryNumber formatted={getSavingsLabel(totalSavings)} hidden={false} /></strong></div>
          <div><span>Records · units</span><strong>{currentHoldings.length} · {totalUnits}</strong></div>
        </div>

        <div className="self-end">
          <ViewModeToggle value={viewMode} onChange={setViewMode} label="Inventory view" />
        </div>

        <div className="compact-card space-y-2">
          <SearchField
            deferred
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search inventory..."
            aria-label="Search inventory"
          />
          <AndroidAdaptiveSelect
            label="Category"
            value={selectedCategory}
            onChange={setSelectedCategory}
            className="control-input h-10"
            options={[
              { value: 'all', label: 'All categories' },
              ...taxonomy.activeCategories.map(category => ({ value: category.name, label: category.name.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) })),
            ]}
          />
          <details className="android-filter-details">
            <summary>More filters</summary>
            <div>
              <AndroidAdaptiveSelect
                label="Sub-category"
                value={selectedSubCategory}
                onChange={setSelectedSubCategory}
                searchable={availableSubCategories.length > 8}
                options={[
                  { value: 'all', label: 'All sub-categories' },
                  ...availableSubCategories.map(sub => ({ value: sub, label: sub })),
                ]}
              />
              <AndroidAdaptiveSelect
                label="Status"
                value={selectedStatus}
                onChange={setSelectedStatus}
                options={[
                  ...STATUS_OPTIONS,
                ]}
              />
              <AndroidAdaptiveSelect
                label="Location"
                value={selectedLocation}
                onChange={setSelectedLocation}
                options={[
                  { value: 'all', label: 'All locations' },
                  ...availableLocations.map(location => ({ value: location, label: location })),
                ]}
              />
              <AndroidAdaptiveSelect
                label="Sort"
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: 'date_desc', label: 'Newest' },
                  { value: 'date_asc', label: 'Oldest' },
                  { value: 'price_high', label: 'Highest value' },
                  { value: 'price_low', label: 'Lowest value' },
                ]}
              />
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            {androidPresentation ? (
              <>
                <TaxonomySettingsButton
                  module="inventory"
                  defaults={INVENTORY_TAXONOMY_DEFAULTS}
                  observed={inventoryItems.map(item => ({ category: getInventoryCategoryEditorValue(item.category), subcategory: item.subCategory }))}
                  androidPresentation
                  onRenameCategory={renameInventoryCategoryRecords}
                  onRenameSubcategory={renameInventorySubcategoryRecords}
                />
                <InventoryStorageLocationSettingsButton />
              </>
            ) : null}
            <button type="button" onClick={onAddClick} className="min-h-11 rounded-2xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground">
              Add item
            </button>
          </div>
        </div>

        {androidPaginatedItems.length === 0 ? (
          <div className="compact-empty">
            {inventoryItems.length === 0 ? (
              <p>No items yet. Add your first item to start tracking what you own.</p>
            ) : (
              <>
                <p>No items match these filters.</p>
                <button
                  type="button"
                  onClick={clearInventoryFilters}
                  className="mt-3 min-h-11 rounded-xl border border-border/60 px-4 text-sm font-bold text-foreground hover:border-primary/40 hover:text-primary"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div ref={collectionRevealRef} className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {androidPaginatedItems.map(item => (
              <article key={item.id} data-caizen-collection-item="true" className="compact-card android-record-row relative overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setEditingItem(item.id)}
                  className="block w-full text-left"
                >
                  <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted/40">
                  {item.photoAssetIds?.[0] ? (
                    <MediaAssetImage profileId={currentProfileId} assetId={item.photoAssetIds[0]} alt={item.name} className="h-full w-full object-cover" />
                  ) : item.image ? (
                    <img src={item.image} alt={item.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" aria-hidden />
                  )}
                  </div>
                  <div className="space-y-0.5 p-2 pr-12">
                    <OverflowTooltip text={item.name}><span className="block truncate text-xs font-black">{item.name}</span></OverflowTooltip>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {normalizeInventoryCategoryKey(item.category).replace(/_/g, ' ')} · {formatItemAge(new Date(item.purchaseDate))}
                    </span>
                    <span className="block text-[11px] font-bold text-muted-foreground">{getValueLabel(item)}</span>
                    {sourcePlanByInventoryId.has(item.id) ? <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-primary" aria-label="Added to Inventory from a planned purchase."><Link2 className="h-3 w-3" aria-hidden="true" /> Planned purchase</span> : null}
                    {transactionByInventoryId.has(item.id) ? (
                      <button
                        type="button"
                        onClick={event => { event.stopPropagation(); navigateToTransaction(transactionByInventoryId.get(item.id)!.id); }}
                        className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-primary hover:underline"
                        aria-label={`Open linked transaction for ${formatPHP(transactionByInventoryId.get(item.id)!.amount)}`}
                      >
                        <Link2 className="h-3 w-3" aria-hidden="true" /> Transaction · {formatPHP(transactionByInventoryId.get(item.id)!.amount)}
                      </button>
                    ) : null}
                  </div>
                </button>
                <div className="absolute bottom-1.5 right-1.5">
                  {renderInventoryActionMenu(item)}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div ref={collectionRevealRef} className="space-y-2">
            {androidPaginatedItems.map(item => (
              <div key={item.id} data-caizen-collection-item="true" className="compact-list-row android-record-row gap-1 p-1 pl-3">
                <button
                  type="button"
                  onClick={() => setEditingItem(item.id)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2 text-left"
                >
                  <span className="min-w-0">
                    <OverflowTooltip text={item.name}><span className="block truncate text-sm font-black">{item.name}</span></OverflowTooltip>
                    <span className="block truncate text-xs text-muted-foreground">
                      {normalizeInventoryCategoryKey(item.category).replace(/_/g, ' ')} · {formatItemAge(new Date(item.purchaseDate))}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-muted-foreground">
                    {getValueLabel(item)}
                    {sourcePlanByInventoryId.has(item.id) ? <span className="mt-1 block text-[9px] font-black uppercase tracking-wide text-primary" aria-label="Added to Inventory from a planned purchase.">Planned purchase</span> : null}
                  </span>
                </button>
                {renderInventoryActionMenu(item)}
              </div>
            ))}
          </div>
        )}

        {filteredItems.length > 0 ? (
          <div className="android-inventory-pagination flex flex-col items-center gap-2 pb-2 pt-1">
            <p className="text-xs font-bold text-muted-foreground" aria-live="polite">
              Showing {(currentPage - 1) * ANDROID_ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ANDROID_ITEMS_PER_PAGE, filteredItems.length)} of {filteredItems.length}
            </p>
            <div className="flex w-full items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="min-h-11 rounded-xl border border-border/60 bg-card px-4 text-sm font-black text-foreground disabled:cursor-not-allowed disabled:opacity-45"
              >
                Previous
              </button>
              <span className="text-xs font-black text-muted-foreground" aria-label={`Page ${currentPage} of ${androidTotalPages}`}>
                Page {currentPage} of {androidTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(page => Math.min(androidTotalPages, page + 1))}
                disabled={currentPage === androidTotalPages}
                className="min-h-11 rounded-xl border border-border/60 bg-card px-4 text-sm font-black text-foreground disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        {editingItem && (
          <InventoryModal isOpen itemId={editingItem} androidPresentation={androidPresentation} onClose={() => setEditingItem(null)} />
        )}
        <EntryActionSheet
          androidPresentation={androidPresentation}
          open={Boolean(actionItem)}
          title={actionItem?.name || 'Inventory item'}
          subtitle="Inventory"
          onClose={() => setActionItemId(null)}
          actions={actionActions}
        />
        <ConfirmDialog
          isOpen={Boolean(inventoryItemToDelete)}
          title="Delete this entry?"
          message="This item and its managed photos or receipts will move to Trash and remain recoverable through the existing Trash flow."
          confirmText="Move item to Trash"
          cancelText="Cancel"
          isDangerous
          onCancel={() => setInventoryItemToDelete(null)}
          onConfirm={() => {
            if (inventoryItemToDelete) deleteInventoryItem(inventoryItemToDelete.id);
            setInventoryItemToDelete(null);
          }}
        />
        {showExportModal ? (
          <InventoryExportModal
            items={inventoryItems}
            currentItems={filteredItems}
            locationOptions={availableLocations}
            profileName={profileName}
            currency={exportCurrency}
            filters={exportFilters}
            initialScope={hasActiveInventoryFilters ? 'current' : 'all'}
            onClose={() => setShowExportModal(false)}
          />
        ) : null}
      </div>
      </MonetaryMotionProvider>
    );
  }

  return (
    <MonetaryMotionProvider revision={`${currentProfileId}:inventory`} ready={isHydrated}>
    <div className={`${androidPresentation ? 'workspace-standard' : 'workspace-wide'} caizen-collection-page caizen-inventory-page space-y-4 lg:space-y-5`}>

      {/* =========================================
          HERO
      ========================================= */}

      <section
        className="section-surface p-4 sm:p-5"
      >

        <div className="relative">

          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

            {/* LEFT */}
            <div>

              <h1
                className="
                  text-page-title
                "
              >

                Inventory

              </h1>

              <p
                className="
                  mt-1
                  max-w-xl
                  text-sm
                  leading-relaxed
                  text-muted-foreground
                "
              >

                Keep a clear record of what you own and what it is worth.

              </p>

            </div>

            {/* RIGHT */}
            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[34rem]">

              <div className="border-t border-border/50 px-1 py-3">
                <p className="text-xs text-muted-foreground">Known Purchase Cost</p>
                <p className="mt-1 text-lg font-bold tabular-nums"><MonetaryNumber formatted={formatKnownInventoryMoney(totalPurchaseValue)} hidden={false} /></p>
                <p className="mt-1 text-xs text-muted-foreground">Known for {purchaseCostKnownCount} of {currentHoldings.length} records</p>
              </div>

              <div className="border-t border-border/50 px-1 py-3">
                <p className="text-xs text-muted-foreground">Known Current Value</p>
                <p className="mt-1 text-lg font-bold tabular-nums"><MonetaryNumber formatted={formatKnownInventoryMoney(totalCurrentValue)} hidden={false} /></p>
                <p className="mt-1 text-xs text-muted-foreground">Known for {currentValueKnownCount} of {currentHoldings.length} records</p>
              </div>

              <div className="border-t border-border/50 px-1 py-3">
                <p className="text-xs text-muted-foreground">Savings · {savingsKnownCount}/{currentHoldings.length} comparable</p>
                <p className={`mt-1 text-lg font-bold tabular-nums ${getFinancialTone(totalSavings)}`}>
                  <MonetaryNumber formatted={getSavingsLabel(totalSavings)} hidden={false} />
                </p>
              </div>

            </div>

          </div>

        </div>

      </section>

      {/* =========================================
          CATEGORY DASHBOARD
      ========================================= */}

      <section className="section-surface p-4">
        <button
          type="button"
          onClick={() =>
            setShowDashboard(prev => !prev)
          }
          className="
      flex
      w-full
      items-center
      justify-between
      gap-3
      text-left
    "
        >
          <div>
            <h2 className="text-lg font-black">
              Category overview
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              Current value, savings, and recent purchases by category.
            </p>
          </div>

          <ChevronDown
            className={`
        h-5
        w-5
        text-muted-foreground
        transition-transform
        ${showDashboard
                ? 'rotate-180'
                : ''
              }
      `}
          />
        </button>

        {showDashboard && (
          <div className="mt-5">
            <InventoryCategoryDashboard
              onCategorySelect={category => {
                setSelectedCategory(category);
                setSelectedSubCategory('all');
                setSelectedStatus('all');
                setCurrentPage(1);
              }}
              onSubCategorySelect={(category, subCategory) => {
                setSelectedCategory(category);
                setSelectedSubCategory(subCategory);
                setSelectedStatus('all');
                setCurrentPage(1);
              }}
              onItemSelect={itemId => {
                setEditingItem(itemId);
              }}
              onShowAll={() => {
                clearInventoryFilters();
              }}
            />
          </div>
        )}
      </section>

      {/* =========================================
          AI INSIGHTS
      ========================================= */}

      {/* =========================================
    COMMAND CENTER
========================================= */}

      <section className="section-surface p-5">

        <div className="flex flex-col gap-4">
          <CollectionToolbar
            layout="two-row"
            search={<SearchField
              aria-label="Search inventory"
              placeholder="Search inventory..."
              value={searchTerm}
              onChange={setSearchTerm}
              deferred
              wrapperClassName="lg:max-w-md"
              className="bg-background/55"
            />}
            filters={<button
              type="button"
              className="android-only android-filter-summary"
              aria-expanded={showMobileFilters}
              onClick={() => setShowMobileFilters(value => !value)}
            >
              Filters
              <span>
                {[
                  selectedCategory,
                  selectedSubCategory,
                  selectedStatus,
                  selectedLocation,
                ].filter(value => value !== 'all').length || 'All'}
              </span>
            </button>}
            utilities={<>
              <TaxonomySettingsButton
                module="inventory"
                defaults={INVENTORY_TAXONOMY_DEFAULTS}
                observed={inventoryItems.map(item => ({ category: getInventoryCategoryEditorValue(item.category), subcategory: item.subCategory }))}
                onRenameCategory={renameInventoryCategoryRecords}
                onRenameSubcategory={renameInventorySubcategoryRecords}
              />
              <InventoryStorageLocationSettingsButton />
              <Button type="button" variant="outline" onClick={() => setShowExportModal(true)} className="min-h-11 w-full lg:w-auto">
                Export inventory
              </Button>
            </>}
            primaryAction={<Button type="button" onClick={onAddClick} className="min-h-11 w-full lg:w-auto">
              Add item
            </Button>}
          />

          {/* FILTER ROW */}
          <div
            className="
    flex
    flex-col
    gap-3

    xl:flex-row
    xl:items-center
    xl:justify-between
  "
          >

            {/* LEFT FILTERS */}
            <div
              data-open={showMobileFilters || undefined}
              className="
      android-inventory-filter-panel
      grid
      grid-cols-1
      gap-3

      sm:grid-cols-2
      lg:grid-cols-5
    "
            >

              <AndroidAdaptiveSelect
                label="Category"
                value={selectedCategory}
                onChange={value => {
                  setSelectedCategory(value);
                  setSelectedSubCategory('all');
                }}
                className="control-input combobox-trigger-transparent h-12"
                options={[
              { value: 'all', label: 'All categories' },
              ...taxonomy.activeCategories.map(category => ({ value: category.name, label: category.name.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) })),
            ]}
              />

              <AndroidAdaptiveSelect
                label="Sub-category"
                value={selectedSubCategory}
                onChange={setSelectedSubCategory}
                className="control-input combobox-trigger-transparent h-12"
                searchable={availableSubCategories.length > 8}
                options={[
                  { value: 'all', label: 'All sub-categories' },
                  ...availableSubCategories.map(sub => ({ value: sub, label: sub })),
                ]}
              />

              <AndroidAdaptiveSelect
                label="Status"
                value={selectedStatus}
                onChange={setSelectedStatus}
                className="control-input combobox-trigger-transparent h-12"
                options={[
                  ...STATUS_OPTIONS,
                ]}
              />

              <AndroidAdaptiveSelect
                label="Location"
                value={selectedLocation}
                onChange={setSelectedLocation}
                className="control-input combobox-trigger-transparent h-12"
                options={[
                  { value: 'all', label: 'All locations' },
                  ...availableLocations.map(location => ({ value: location, label: location })),
                ]}
              />

              <AndroidAdaptiveSelect
                label="Sort"
                value={sortBy}
                onChange={setSortBy}
                className="control-input combobox-trigger-transparent h-12"
                options={[
                  { value: 'date_desc', label: 'Newest' },
                  { value: 'date_asc', label: 'Oldest' },
                  { value: 'price_high', label: 'Highest value' },
                  { value: 'price_low', label: 'Lowest value' },
                ]}
              />

            </div>

            {/* RIGHT VIEW CONTROLS */}
            <div
              className="
      flex
      flex-wrap
      items-center
      gap-3
      xl:justify-end
    "
            >

              {/* DETAIL MODE */}
              {viewMode !== 'list' ? (
                <div className="view-toggle">
                  <button
                    type="button"
                    onClick={() =>
                      setDetailMode('full')
                    }
                    className={`view-toggle-button !min-h-11 ${detailMode === 'full'
                      ? 'view-toggle-button-active'
                      : ''
                      }`}
                  >
                    Detailed
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDetailMode('simple')
                    }
                    className={`view-toggle-button !min-h-11 ${detailMode === 'simple'
                      ? 'view-toggle-button-active'
                      : ''
                      }`}
                  >
                    Compact
                  </button>
                </div>
              ) : null}

              {/* VIEW MODE */}
              <div className="view-toggle">
                <Tooltip><TooltipTrigger asChild><button
                  type="button"
                  onClick={() =>
                    setViewMode('grid')
                  }
                  aria-label="Grid view"
                  className={`view-toggle-button !min-h-11 !min-w-11 ${viewMode === 'grid'
                    ? 'view-toggle-button-active'
                    : ''
                    }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button></TooltipTrigger><TooltipContent>{"Grid view"}</TooltipContent></Tooltip>

                <Tooltip><TooltipTrigger asChild><button
                  type="button"
                  onClick={() =>
                    setViewMode('list')
                  }
                  aria-label="List view"
                  className={`view-toggle-button !min-h-11 !min-w-11 ${viewMode === 'list'
                    ? 'view-toggle-button-active'
                    : ''
                    }`}
                >
                  <List className="h-4 w-4" />
                </button></TooltipTrigger><TooltipContent>{"List view"}</TooltipContent></Tooltip>
              </div>

            </div>

          </div>
        </div>
      </section>

      {filteredItems.length > 0 ? (
        <section aria-label="Inventory items">
          <div ref={collectionRevealRef} className={viewMode === 'grid' ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
            {paginatedItems.map(item => (
              <InventoryRecordCard
                key={item.id}
                item={item}
                currentProfileId={currentProfileId}
                viewMode={viewMode}
                detailMode={detailMode}
                hasSourcePlan={sourcePlanByInventoryId.has(item.id)}
                onOpenSourcePlan={() => openSourcePlan(item.id)}
                hasLinkedBook={linkedBookByInventoryId.has(item.id)}
                onPreview={setEnlargedImage}
                actionMenu={renderInventoryActionMenu(item)}
                onNotes={() => setSelectedNotes(item.notes || '')}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* =========================================
          EMPTY STATE
      ========================================= */}

      {filteredItems.length ===
        0 && (

          <Card className="border-dashed border-border/60 bg-card/95 shadow-none">
            <CardContent className="py-14 text-center">

              {inventoryItems.length === 0 ? (
                <>
                  <h3 className="text-lg font-bold">No inventory items yet</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {getSectionDiscoveryMeta('inventory')?.purpose}
                  </p>
                  <Button type="button" onClick={onAddClick} className="mt-5 min-h-11">
                    {getSectionDiscoveryMeta('inventory')?.firstActionLabel}
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold">No items match these filters</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {searchTerm.trim()
                      ? `No items match “${searchTerm.trim()}”.`
                      : 'Try clearing one or more filters to see your inventory.'}
                  </p>
                  <Button type="button" variant="outline" onClick={clearInventoryFilters} className="mt-5 min-h-11">
                    Clear filters
                  </Button>
                </>
              )}
            </CardContent>

          </Card>

        )}

      {/* =========================================
          GRID VIEW
      ========================================= */}

      {false && viewMode ===
        'grid' &&
        filteredItems.length >
        0 && (

          <div
            className="
            grid gap-5
            md:grid-cols-2
            xl:grid-cols-3
          "
          >

            {paginatedItems.map(
              item => {
                const normalizedCat =
                  normalizeInventoryCategoryKey(
                    item.category
                  );

                const categoryUI =
                  getCategoryUI(
                    normalizedCat
                  );

                const statusUI =
                  getStatusUI(
                    item.status
                  );

                const purchaseDate =
                  new Date(
                    item.purchaseDate
                  );

                const ageColor =
                  getAgeColor(
                    purchaseDate
                  );

                const purchaseCost =
                  getInventoryPurchaseCost(item);

                const currentValue =
                  getInventoryCurrentValue(item);

                const priceDiff = getInventorySavingsPerUnit(item);

                const percentDiff =
                  priceDiff !== null && purchaseCost
                    ? (priceDiff / purchaseCost) * 100
                    : null;
                const hasPreviewImage = Boolean(item.photoAssetIds?.[0] || item.image);

                const rarity =
                  getRarity(
                    currentValue ||
                    0
                  );

                const CategoryIcon =
                  categoryUI.icon;

                return (
                  <Card
                    key={item.id}
                    className={`
                    group
                    card-modern
                    inventory-rpg-card
                    motion-card
                    relative
                    overflow-hidden
                    ${rarity.border}
                    ${rarity.shadow}
                    hover:shadow-2xl
                  `}
                  >

                    {/* GLOW */}
                    <div
                      className="
                      absolute
                      inset-0
                      opacity-0
                      transition-all
                      duration-500
                      group-hover:opacity-100
                    "
                    >

                      <div
                        className={`
                        absolute
                        -right-10
                        -top-10
                        h-40
                        w-40
                        rounded-full
                        blur-3xl
                        ${rarity.glow}
                      `}
                      />

                    </div>

                    <CardContent className="relative p-0">

                      {/* IMAGE */}
                      <div
                        className="
    inventory-slot-frame
    relative
    h-48
    overflow-hidden
    border-b border-border/50
  "
                      >

                        {hasPreviewImage && (
                          <button
                            type="button"
                            aria-label={`Preview image for ${item.name}`}
                            onClick={event => {
                              event.stopPropagation();
                              setEnlargedImage(item.photoAssetIds?.[0] ? `asset:${item.photoAssetIds[0]}` : item.image || null);
                            }}
                            className="absolute inset-0 z-[1] cursor-zoom-in rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                          />
                        )}

                        {item.photoAssetIds?.[0] ? (
                          <MediaAssetImage
                            profileId={currentProfileId}
                            assetId={item.photoAssetIds[0]}
                            alt={item.name}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div
                            className={`
                              flex
                              h-full
                              items-center
                              justify-center
                              bg-gradient-to-br
                              ${categoryUI.surface}
                            `}
                          >
                            <CategoryIcon
                              className="
                                h-16
                                w-16
                                text-foreground/35
                                transition-transform
                                duration-500
                                group-hover:scale-110
                              "
                            />
                          </div>
                        )}

                        {/* RARITY */}
                        <div
                          className="
                          absolute
                          left-4
                          top-4
                          z-10
                          "
                        >

                          <div
                            className={`
                            rounded-full
                            border
                            px-3 py-1
                            text-[11px]
                            font-bold
                            uppercase
                            tracking-wider
                            backdrop-blur-xl
                            ${rarity.text}
                            ${rarity.border}
                            bg-background/70
                          `}
                          >

                            {
                              `Value tier · ${rarity.label}`
                            }

                          </div>

                        </div>

                      </div>

                      {/* CONTENT */}
                      {/* SIMPLE CONTENT */}
                      {detailMode === 'simple' ? (
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-muted-foreground">
                                {categoryUI.label}
                                {item.subCategory
                                  ? ` • ${item.subCategory}`
                                  : ''}
                              </p>

                              {normalizeExternalWebUrl(item.productLink) ? (
                                <OverflowTooltip text={item.name}>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void openExternalLink(normalizeExternalWebUrl(item.productLink)!).catch(() => toast({ title: 'Could not open link', description: 'Check the saved inventory link and try again.' }));
                                    }}
                                    className="mt-2 block min-h-11 max-w-full truncate text-left text-xl font-black hover:text-primary"
                                    aria-label={`Open website for ${item.name}`}
                                  >
                                    {item.name}
                                  </button>
                                </OverflowTooltip>
                              ) : (
                                <OverflowTooltip text={item.name}>
                                  <h3 className="mt-2 truncate text-xl font-black">{item.name}</h3>
                                </OverflowTooltip>
                              )}

                              <p
                                className={`
            mt-2
            text-sm
            font-semibold
            ${ageColor}
          `}
                              >
                                {formatItemAge(
                                  purchaseDate
                                )}
                              </p>
                            </div>

                             <div className="flex items-start gap-2">
                               <div className="text-right">
                                 <p className="text-xs text-muted-foreground">
                                   Value
                                 </p>

                                 <p className="mt-1 text-lg font-black">
                                   {getValueLabel(item)}
                                 </p>
                               </div>

                                {renderInventoryActionMenu(item)}
                             </div>
                           </div>

                           <div className="mt-4 flex flex-wrap gap-2">
                            {statusUI && (
                              <span
                                className={`
            rounded-full
            border
            px-3 py-1
            text-xs
            font-semibold
            ${statusUI.color}
          `}
                              >
                                {statusUI.label}
                              </span>
                            )}

                            {item.storageLocation && (
                              <span
                                className="
            rounded-full
            border border-border/50
            bg-background/60
            px-3 py-1
            text-xs
            font-semibold
            text-muted-foreground
          "
                              >
                                {item.storageLocation}
                              </span>
                             )}
                           </div>

                           {sourcePlanByInventoryId.has(item.id) ? (
                             <button type="button" onClick={event => { event.stopPropagation(); openSourcePlan(item.id); }} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 text-xs font-black uppercase tracking-wide text-primary hover:bg-primary/10" aria-label={`Added to Inventory from a planned purchase. Open Plan for ${item.name}`}>
                               <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Planned purchase
                             </button>
                           ) : null}
                           <p className="mt-4 text-xs font-semibold text-muted-foreground">
                             Savings vs Current Price: <span className="text-foreground">{getSavingsLabel(priceDiff)}</span>
                           </p>
                         </div>
                      ) : (
                        <div className="p-5">

                          {/* TOP */}
                          <div
                            className="
                          flex
                          items-start
                          justify-between
                        "
                          >

                            <div>

                              <div
                                className="
                              flex
                              items-center
                              gap-2
                            "
                              >

                                <CategoryIcon className="h-4 w-4 text-primary" />

                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              }
            )}

          </div>
        )}

                                {/* LIST VIEW */}

      {false && viewMode ===
        'list' &&
        filteredItems.length >
        0 && (

          <div className="space-y-3">

            {paginatedItems.map(
              item => {
                const normalizedCat =
                  normalizeInventoryCategoryKey(
                    item.category
                  );

                const categoryUI =
                  getCategoryUI(
                    normalizedCat
                  );

                const statusUI =
                  getStatusUI(
                    item.status
                  );

                const rarity =
                  getRarity(
                    getInventoryCurrentValue(item) ||
                    0
                  );

                const CategoryIcon =
                  categoryUI.icon;

                return (
                  <Card
                    key={item.id}
                    className={`
                    card-modern
                    ${rarity.border}
                  `}
                  >

                    <CardContent className="p-4">

                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">

                        {/* LEFT */}
                        <div
                          className="
                          flex
                          items-center
                          gap-4
                        "
                        >

                          <div
                            className="
                            flex
                            h-14
                            w-14
                            items-center
                            justify-center
                            rounded-2xl
                            bg-primary/10
                          "
                          >

                            <CategoryIcon className="h-6 w-6 text-primary" />

                          </div>

                          <div>

                            <div
                                className="
                              flex
                              items-center
                              gap-2
                            "
                              >

                              <h3 className="text-lg font-bold">

                                {
                                  item.name
                                }

                              </h3>

                              <span
                                className={`
                                text-xs
                                font-bold
                                ${rarity.text}
                              `}
                              >

                                {
                                  rarity.label
                                }

                              </span>

                            </div>

                            <div
                              className="
                              mt-2
                              flex
                              flex-wrap
                              gap-2
                            "
                            >

                              <span
                                className={`
                                rounded-full
                                border
                                px-2 py-1
                                text-xs
                                ${categoryUI.color}
                              `}
                              >

                                {
                                  categoryUI.label
                                }

                              </span>

                              {statusUI && (

                                <span
                                  className={`
                                  rounded-full
                                  border
                                  px-2 py-1
                                  text-xs
                                  ${statusUI.color}
                                `}
                                >

                                  {
                                    statusUI.label
                                  }

                                </span>

                              )}

                              {sourcePlanByInventoryId.has(item.id) ? (
                                <button type="button" onClick={event => { event.stopPropagation(); openSourcePlan(item.id); }} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-xs font-black uppercase tracking-wide text-primary" aria-label={`Added to Inventory from a planned purchase. Open Plan for ${item.name}`}>
                                  <Link2 className="h-3 w-3" aria-hidden="true" /> Planned purchase
                                </button>
                              ) : null}

                            </div>

                          </div>

                        </div>

                        {/* RIGHT */}
                        <div
                          className="
                          flex
                          items-center
                          gap-6
                        "
                        >

                          <div className="text-right">

                            <p className="text-xs text-muted-foreground">

                              Value

                            </p>

                            <p
                              className="text-lg font-black"
                            >

                              {getValueLabel(item)}

                            </p>

                          </div>

                          {renderInventoryActionMenu(item)}

                        </div>

                      </div>

                    </CardContent>

                  </Card>
                );
              }
            )}

          </div>

        )}
      {filteredItems.length > 0 && (
        <div
          className="
      flex
      flex-col
      gap-4
      rounded-3xl
      border
      border-border/50
      bg-background/60
      p-4
      backdrop-blur-xl

      sm:flex-row
      sm:items-center
      sm:justify-between
    "
        >
          <div
            className="
        text-sm
        text-muted-foreground
      "
          >
            Showing{' '}
            {(currentPage - 1) *
              ITEMS_PER_PAGE +
              1}
            -
            {Math.min(
              currentPage *
              ITEMS_PER_PAGE,
              filteredItems.length
            )}{' '}
            of{' '}
            {filteredItems.length}{' '}
            items
          </div>

          <div
            className="
        flex
        flex-wrap
        items-center
        gap-2
      "
          >
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() =>
                setCurrentPage(
                  currentPage - 1
                )
              }
            >
              Previous
            </Button>

            {Array.from(
              {
                length: totalPages,
              },
              (_, i) => i + 1
            ).map(page => (
              <Button
                key={page}
                size="sm"
                variant={
                  currentPage ===
                    page
                    ? 'default'
                    : 'outline'
                }
                onClick={() =>
                  setCurrentPage(
                    page
                  )
                }
              >
                {page}
              </Button>
            ))}

            <Button
              variant="outline"
              size="sm"
              disabled={
                currentPage ===
                totalPages
              }
              onClick={() =>
                setCurrentPage(
                  currentPage + 1
                )
              }
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {/* =========================================
          EDIT MODAL
      ========================================= */}
      {enlargedImage &&
        createPortal(
          <div
            ref={imagePreviewRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            data-caizen-overlay={imagePreviewIsClosing ? 'closing' : 'open'}
            data-state={imagePreviewIsClosing ? 'closed' : 'open'}
            className="
        fixed
        inset-0
        z-[99999]
        flex
        items-center
        justify-center
        bg-black/85
        p-4
        backdrop-blur-md
      "
            onClick={closeImagePreview}
          >
            <button
              type="button"
              onClick={closeImagePreview}
              className="
          absolute
          right-5
          top-5
          z-10
          rounded-full
          bg-white/10
          p-3
          text-white
          backdrop-blur-md
          transition-all
          hover:bg-white/20
        "
            >
              <X className="h-5 w-5" />
            </button>

            <div data-caizen-overlay-panel="true">
            {enlargedImage.startsWith('asset:') ? (
              <MediaAssetImage
                profileId={currentProfileId}
                assetId={enlargedImage.slice('asset:'.length)}
                alt="Preview"
                variant="full"
                className="block max-h-[88vh] max-w-[92vw] rounded-3xl object-contain shadow-2xl"
              />
            ) : (
              <img
                src={enlargedImage}
                alt="Preview"
                onClick={e => e.stopPropagation()}
                className="block max-h-[88vh] max-w-[92vw] rounded-3xl object-contain shadow-2xl"
              />
            )}
            </div>
          </div>,
          document.body
        )}
      {editingItem && (

        <InventoryModal
          isOpen
          itemId={editingItem}
          onClose={() => setEditingItem(null)}
          androidPresentation={androidPresentation}
        />

      )}
      <ConfirmDialog
          isOpen={Boolean(inventoryItemToDelete)}
          title="Delete this entry?"
          message="This item and its managed photos or receipts will move to Trash and remain recoverable through the existing Trash flow."
          confirmText="Move item to Trash"
          cancelText="Cancel"
          isDangerous
          onCancel={() => setInventoryItemToDelete(null)}
          onConfirm={() => {
            if (inventoryItemToDelete) deleteInventoryItem(inventoryItemToDelete.id);
            setInventoryItemToDelete(null);
          }}
        />
      <NotesModal
        isOpen={selectedNotes !== null}
        notes={selectedNotes || ''}
        onClose={() =>
          setSelectedNotes(null)
        }
      />
      {showExportModal ? (
        <InventoryExportModal
            items={inventoryItems}
            currentItems={filteredItems}
            locationOptions={availableLocations}
            profileName={profileName}
            currency={exportCurrency}
            filters={exportFilters}
            initialScope={hasActiveInventoryFilters ? 'current' : 'all'}
            onClose={() => setShowExportModal(false)}
          />
      ) : null}

    </div>
    </MonetaryMotionProvider>
  );
}
