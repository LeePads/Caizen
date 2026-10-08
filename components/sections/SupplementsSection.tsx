
'use client';

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from 'react';


import {
  Clock3,
  ExternalLink,
  Link2,
  Pill,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';


import { useAppContext } from '@/lib/context';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { SearchField } from '@/components/ui/search-field';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { ViewModeToggle, type ViewMode } from '@/components/ui/view-mode-toggle';
import { HealthOverflowMenu } from '@/components/health/HealthOverflowMenu';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';

import { formatPHP } from '@/lib/currency';
import { MonetaryMotionProvider, MonetaryNumber } from '@/components/ui/monetary-number';
import { getSupplementEstimatedDailyCost } from '@/lib/collections/supplement-metrics';
import {
  filterSupplementsForExport,
  type SupplementExportCustomFilters,
} from '@/lib/collections/supplement-exports';
import type { SupplementSchedule } from '@/lib/types';

import SupplementModal from '@/components/modals/SupplementModal';
import { TaxonomySettingsButton } from '@/components/common/TaxonomySettingsButton';
import { SupplementTypeSettingsButton, DEFAULT_SUPPLEMENT_TYPES } from '@/components/common/SupplementTypeSettingsButton';
import { useProfileModuleTaxonomy } from '@/lib/module-taxonomy';
import { buildLinkedRecordTransactionMap } from '@/lib/transactions';
import { navigateToTransaction } from '@/lib/balance/linked-record';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import SupplementExportModal from '@/components/modals/SupplementExportModal';
import SupplementLifeHubContext from '@/components/sections/SupplementLifeHubContext';
import { deriveSupplementLifeHubActivity } from '@/lib/supplements/lifehub-activity';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';

// Legacy inline compatibility retains the {s.image && ( branch semantics.

const formatSupplementType = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase());

// "Type · quantity unit" subtitle shared by the grid/list/Android card
// presentations, keeping the two concepts visually distinct but adjacent.
const supplementTypeAndDosage = (item: { type?: string; dosageAmount?: number; dosageUnit?: string; quantityRemaining?: number }) => {
  const amount = item.dosageAmount ?? item.quantityRemaining;
  return [
    item.type ? formatSupplementType(item.type) : null,
    amount ? `${amount} ${item.dosageUnit || 'units'}` : null,
  ].filter(Boolean).join(' · ');
};

const SUPPLEMENT_SCHEDULE_OPTIONS: Array<{ value: SupplementExportCustomFilters['schedule']; label: string }> = [
  { value: 'all', label: 'All schedules' },
  { value: 'morning', label: 'Morning' },
  { value: 'night', label: 'Night' },
  { value: 'with-meals', label: 'With meals' },
  { value: 'custom', label: 'Custom' },
];

const SUPPLEMENT_EXPIRY_OPTIONS: Array<{ value: SupplementExportCustomFilters['expiryState']; label: string }> = [
  { value: 'all', label: 'All expiry states' },
  { value: 'missing', label: 'No expiry date' },
  { value: 'expired', label: 'Expired' },
  { value: 'soon', label: 'Expiring within 14 days' },
  { value: 'later', label: 'More than 14 days left' },
];

export default function SupplementsSection({
  onAddClick,
  androidPresentation = false,
}: {
  onAddClick: () => void;
  androidPresentation?: boolean;
}) {
  const {
    supplements,
    transactions,
    dailyChecklistItems,
    productivityItems,
    profiles,
    currentProfileId,
    isHydrated,
    deleteSupplement,
    getSupplementStats,
  } = useAppContext();
  // Derived, not stored - see Transaction.linkedRecord in lib/types.ts.
  const transactionBySupplementId = useMemo(
    () => buildLinkedRecordTransactionMap(transactions, 'supplements'),
    [transactions],
  );

  const [searchTerm, setSearchTerm] =
    useState('');

  const [typeFilter, setTypeFilter] =
    useState<string>('all');

  // The Type filter is driven by the same flat supplement-types taxonomy
  // used in Add/Edit Supplement, not a second hard-coded list. Archived
  // types stay out of the active filter list per existing filter semantics.
  const supplementTypeTaxonomy = useProfileModuleTaxonomy(
    'supplement-types',
    DEFAULT_SUPPLEMENT_TYPES,
    supplements.map(item => ({ category: item.type })),
  );
  const typeFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All types' },
      ...supplementTypeTaxonomy.activeCategories.map(category => ({
        value: category.name,
        label: category.name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, character => character.toUpperCase()),
      })),
    ],
    [supplementTypeTaxonomy.activeCategories],
  );

  const [scheduleFilter, setScheduleFilter] =
    useState<SupplementSchedule | 'all'>('all');

  const [expiryFilter, setExpiryFilter] =
    useState<SupplementExportCustomFilters['expiryState']>('all');

  const [
    editingSupplement,
    setEditingSupplement,
  ] = useState<string | null>(null);

  const [supplementToDelete, setSupplementToDelete] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const [viewMode, setViewMode] =
    useState<ViewMode>('grid');

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1);

  const ITEMS_PER_PAGE = 12;


  const [activeNote, setActiveNote] =
    useState<string | null>(null);

  const [
    enlargedImage,
    setEnlargedImage,
  ] = useState<string | null>(null);

  /* =========================================
     FILTERED
  ========================================= */

  const filtered = useMemo(() => {
    const matchingSearch = supplements.filter(s =>
      s.name
        .toLowerCase()
        .includes(
          searchTerm.toLowerCase()
        )
    );

    return filterSupplementsForExport(matchingSearch, {
      type: typeFilter,
      schedule: scheduleFilter,
      dosageUnit: 'all',
      reminderEnabled: 'all',
      expiryState: expiryFilter,
    });
  }, [expiryFilter, scheduleFilter, searchTerm, supplements, typeFilter]);

  const totalPages =
    Math.ceil(
      filtered.length /
      ITEMS_PER_PAGE
    ) || 1;

  useEffect(() => {
    setCurrentPage(page => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedSupplements =
    filtered.slice(
      (currentPage - 1) *
      ITEMS_PER_PAGE,
      currentPage *
      ITEMS_PER_PAGE
    );
  const currentProfile = profiles.find(profile => profile.id === currentProfileId);
  const collectionRevealRef = useCollectionReveal(
    paginatedSupplements.map(item => item.id),
    [currentProfileId, typeFilter, scheduleFilter, expiryFilter, currentPage, viewMode],
  );
  const getLifeHubActivity = (supplementId: string) =>
    deriveSupplementLifeHubActivity(supplementId, dailyChecklistItems, productivityItems);
  const openLifeHubRecord = (feature: 'routine' | 'tasks', recordId: string) => {
    window.dispatchEvent(new CustomEvent('life-manager:navigate', {
      detail: { section: 'lifehub', feature, recordId },
    }));
  };
  const exportModal = showExportModal ? (
    <SupplementExportModal
      items={supplements}
      currentItems={filtered}
      profileName={currentProfile?.name || 'Supplements'}
      currency={currentProfile?.currency || currentProfile?.baseCurrency || 'PHP'}
      filters={{
        search: searchTerm || undefined,
        type: typeFilter === 'all' ? undefined : typeFilter,
        schedule: scheduleFilter === 'all' ? undefined : scheduleFilter,
        expiryState: expiryFilter === 'all' ? undefined : expiryFilter,
      }}
      initialScope="current"
      onClose={() => setShowExportModal(false)}
    />
  ) : null;

  /* =========================================
     LINK
  ========================================= */

  const openLink = link => {
    const valid = normalizeExternalWebUrl(link);
    if (valid) void openExternalLink(valid);
  };

  /* =========================================
     EXPIRY
  ========================================= */

  const getExpiryData =
    expiryDate => {
      if (!expiryDate)
        return null;

      const today =
        new Date();

      const expiry =
        new Date(expiryDate);

      const diffTime =
        expiry.getTime() -
        today.getTime();

      const days = Math.ceil(
        diffTime /
        (1000 *
          60 *
          60 *
          24)
      );

      if (days < 0) {
        return {
          label: `Expired ${Math.abs(
            days
          )}d ago`,

          color:
            'text-red-400',

          bg:
            'bg-red-500/10 border-red-500/20',
        };
      }

      if (days <= 14) {
        return {
          label: `${days}d left`,

          color:
            'text-amber-400',

          bg:
            'bg-amber-500/10 border-amber-500/20',
        };
      }

      return {
        label: `${days}d left`,

        color:
          'text-emerald-400',

        bg:
          'bg-emerald-500/10 border-emerald-500/20',
      };
    };

  /* =========================================
     STATS
  ========================================= */

  const stats = useMemo(() => {
    const total =
      supplements.length;

    const totalSpent =
      supplements.reduce(
        (sum, s) =>
          sum +
          (s.purchasePrice ||
            0),
        0
      );

    const expiring =
      supplements.filter(s => {
        if (!s.expiryDate)
          return false;

        const diff =
          new Date(
            s.expiryDate
          ).getTime() -
          Date.now();

        const days =
          diff /
          (1000 *
            60 *
            60 *
            24);

        return days <= 14;
      }).length;

    const active =
      supplements.filter(s => {
        const stats =
          getSupplementStats(
            s.id
          );

        return (
          stats.daysUsed <=
          120
        );
      }).length;

    const dailyCosts = supplements
      .map(getSupplementEstimatedDailyCost)
      .filter((value): value is number => value !== null);
    const typeBreakdown = supplements.reduce<Record<string, number>>((counts, item) => {
      const type = item.type || 'other';
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {});

    return {
      total,
      totalSpent,
      expiring,
      active,
      estimatedDailyCost: dailyCosts.length ? dailyCosts.reduce((sum, value) => sum + value, 0) : null,
      knownCostCount: dailyCosts.length,
      typeBreakdown,
    };
  }, [
    supplements,
    getSupplementStats,
  ]);

  /* =========================================
     NOTES FORMAT
  ========================================= */

  const renderFormattedText =
    text => {
      if (!text) return null;

      const lines =
        text.split('\n');

      const isList =
        lines.every(line =>
          line
            .trim()
            .startsWith('-')
        );

      if (isList) {
        return (
          <ul className="list-disc space-y-1 pl-5">

            {lines.map(
              (
                line,
                i
              ) => (
                <li key={i}>

                  {line.replace(
                    /^-\s*/,
                    ''
                  )}

                </li>
              )
            )}

          </ul>
        );
      }

      return (
        <p className="whitespace-pre-wrap leading-relaxed">

          {text}

        </p>
      );
    };

  // The page shell is a plain container now: Summary, the collection
  // toolbar, and the entries each render as their own top-level surface so
  // they read as distinct regions, matching the Inventory collection
  // pattern. A shared outer `.section-surface` would silently flatten a
  // nested one (by design - see the "nested cards" rule in globals.css),
  // which is exactly why the toolbar used to blend into the surrounding
  // section. Android's own layout is untouched: it never relied on that
  // outer surface, so it renders through a Fragment here instead.
  const SummarySurface = androidPresentation ? Fragment : 'section';
  const summarySurfaceProps = androidPresentation ? {} : { className: 'section-surface p-4 sm:p-5 sm:p-6' };

  return (
    <MonetaryMotionProvider revision={`${currentProfileId}:supplements`} ready={isHydrated}>
    <div
      className={androidPresentation ? 'android-module-home android-supplements space-y-4' : 'workspace-standard caizen-collection-page caizen-supplements-page space-y-4 lg:space-y-5'}
      data-android-screen={androidPresentation ? 'supplements' : undefined}
    >

      {/* =========================================
          SUMMARY (Hero + stats + insights)
      ========================================= */}

      <SummarySurface {...summarySurfaceProps}>

      {/* =========================================
          HERO
      ========================================= */}

      <h2 className="text-section-title">Supplements</h2>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-border/50 py-4 md:grid-cols-4">
        {[
          { label: 'Total supplements', value: stats.total },
          { label: 'Active stack', value: stats.active },
          { label: 'Expiring soon', value: stats.expiring },
          { label: 'Est. monthly cost', value: stats.estimatedDailyCost === null ? 'Not enough information' : formatPHP(stats.estimatedDailyCost * 30) },
        ].map(item => (
          <div key={item.label} className="min-w-0">
            <p className="text-label text-muted-foreground">{item.label}</p>
            <p className={'mt-2 break-words tabular-nums ' + (item.value === 'Not enough information' ? 'text-sm text-muted-foreground' : 'text-xl font-bold')}>{typeof item.value === 'string' ? <MonetaryNumber formatted={item.value} hidden={false} /> : item.value}</p>
          </div>
        ))}
      </div>

      {stats.total > 0 ? (
        <details className="border-t border-border/50 pt-4">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View insights</summary>
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 border-y border-border/50 py-3 sm:grid-cols-2">
              <div><p className="text-label text-muted-foreground">Total spending</p><p className="mt-1 text-xl font-semibold tabular-nums"><MonetaryNumber formatted={formatPHP(stats.totalSpent)} hidden={false} /></p></div>
              <div><p className="text-label text-muted-foreground">Est. daily cost</p><p className={stats.estimatedDailyCost === null ? 'mt-1 text-body-sm text-muted-foreground' : 'mt-1 text-xl font-semibold tabular-nums'}><MonetaryNumber formatted={stats.estimatedDailyCost === null ? 'Not enough information' : formatPHP(stats.estimatedDailyCost)} hidden={false} /></p><p className="mt-1 text-body-sm text-muted-foreground">{stats.estimatedDailyCost === null ? 'Add purchase price, quantity, and intake' : `${stats.knownCostCount} of ${stats.total} with enough data`}</p></div>
            </div>
            <div className="border-t border-border/50 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-card-title">Supplement type mix</h3>

            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.typeBreakdown).map(([type, count]) => (
                <span key={type} className="rounded-full border border-border/60 bg-background/45 px-2.5 py-1 text-xs font-bold text-muted-foreground">
                  {type.replace(/-/g, ' ')} · {count}
                </span>
              ))}
            </div>
          </div>
            </div>
          </div>
        </details>
      ) : null}

      </SummarySurface>

      {/* =========================================
          FILTERS
      ========================================= */}

      {androidPresentation ? (
      <div className="android-supplements-toolbar toolbar-surface w-full flex flex-col gap-3 lg:sticky lg:top-4 lg:z-20 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <SearchField
            wrapperClassName="w-full max-w-md"
            value={searchTerm}
            onChange={value => {
              setSearchTerm(value);
              setCurrentPage(1);
            }}
            placeholder="Search supplements..."
            aria-label="Search supplements"
          />
        </div>

        <div className="android-supplements-actions flex flex-wrap items-center gap-2 lg:justify-end">
          <Button onClick={onAddClick} className="control-button-primary">
            <Plus className="mr-2 h-4 w-4" />
            Add Supplement
          </Button>
          <SupplementTypeSettingsButton observed={supplements.map(item => ({ category: item.type }))} androidPresentation={androidPresentation} />
          <TaxonomySettingsButton module="supplements" displayName="Dosage units" manageLabel="Manage units" itemSingular="unit" defaults={['capsules', 'tablets', 'ml']} observed={supplements.map(item => ({ category: item.dosageUnit }))} blockInUseCategoryRename androidPresentation={androidPresentation} showSubcategories={false} />
          <Button onClick={() => setShowExportModal(true)} variant="outline" className="control-button">
            Export Supplements
          </Button>
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            label="Supplements view"
            className="shrink-0"
          />
        </div>
      </div>
      ) : (
        <section className="caizen-supplements-controls section-surface w-full p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <SearchField
                wrapperClassName="w-full lg:max-w-md"
                value={searchTerm}
                onChange={value => {
                  setSearchTerm(value);
                  setCurrentPage(1);
                }}
                placeholder="Search supplements..."
                aria-label="Search supplements"
              />
              <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                <Button type="button" onClick={onAddClick} className="control-button-primary min-h-11 w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Supplement
                </Button>
                <SupplementTypeSettingsButton observed={supplements.map(item => ({ category: item.type }))} />
                <TaxonomySettingsButton module="supplements" displayName="Dosage units" manageLabel="Manage units" itemSingular="unit" defaults={['capsules', 'tablets', 'ml']} observed={supplements.map(item => ({ category: item.dosageUnit }))} blockInUseCategoryRename showSubcategories={false} />
                <Button type="button" onClick={() => setShowExportModal(true)} variant="outline" className="control-button min-h-11">
                  Export Supplements
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AndroidAdaptiveSelect
                  label="Type"
                  value={typeFilter}
                  onChange={value => {
                    setTypeFilter(value);
                    setCurrentPage(1);
                  }}
                  className="control-input combobox-trigger-transparent h-12"
                  options={typeFilterOptions}
                />
                <AndroidAdaptiveSelect
                  label="Schedule"
                  value={scheduleFilter}
                  onChange={value => {
                    setScheduleFilter(value as SupplementSchedule | 'all');
                    setCurrentPage(1);
                  }}
                  className="control-input combobox-trigger-transparent h-12"
                  options={SUPPLEMENT_SCHEDULE_OPTIONS}
                />
                <AndroidAdaptiveSelect
                  label="Expiry state"
                  value={expiryFilter}
                  onChange={value => {
                    setExpiryFilter(value as SupplementExportCustomFilters['expiryState']);
                    setCurrentPage(1);
                  }}
                  className="control-input combobox-trigger-transparent h-12"
                  options={SUPPLEMENT_EXPIRY_OPTIONS}
                />
              </div>
              <ViewModeToggle value={viewMode} onChange={setViewMode} label="Supplements view" className="shrink-0 self-start xl:self-auto" />
            </div>
          </div>
        </section>
      )}

      {/* =========================================
          GRID
      ========================================= */}
      {!paginatedSupplements.length ? (
        <EmptyState
          title={supplements.length ? 'No supplements match' : 'No supplements yet'}
          description={supplements.length ? 'Try another search or adjust your filters.' : 'Use Add Supplement to start your collection.'}
          variant="compact"
        />
      ) : null}


      {androidPresentation ? (
        <div ref={collectionRevealRef} className="android-supplement-list" data-view={viewMode}>
          {paginatedSupplements.map(s => {
            const stats = getSupplementStats(s.id);
            const expiry = getExpiryData(s.expiryDate);
            const productUrl = normalizeExternalWebUrl(s.productLink);
            const activity = getLifeHubActivity(s.id);
            return (
              <article key={s.id} data-caizen-collection-item="true" className="android-supplement-card rounded-2xl border border-border/60 bg-card/55 p-3">
                <div className="android-supplement-card-main flex min-w-0 items-start gap-3">
                  {(s.image || s.photoAssetIds?.[0]) ? (
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        setEnlargedImage(s.image ?? null);
                      }}
                      aria-label={`View ${s.name} image`}
                      className="android-supplement-thumb shrink-0 cursor-zoom-in overflow-hidden rounded-xl bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {s.photoAssetIds?.[0] ? <MediaAssetImage assetId={s.photoAssetIds[0]} profileId={currentProfileId} alt={s.name} className="h-full w-full object-cover" /> : <img src={s.image || undefined} alt={s.name} className="h-full w-full object-cover" />}
                    </button>
                  ) : (
                    <span className="android-supplement-thumb grid shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Pill className="size-5" aria-hidden="true" /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <h3 className="android-supplement-title min-w-0 flex-1 break-words text-sm font-black leading-snug">{s.name}</h3>
                      <HealthOverflowMenu
                        title={`${s.name} actions`}
                        ariaLabel={`More actions for ${s.name}`}
                        androidPresentation
                        actions={[
                          { label: 'Edit', icon: Pencil, onSelect: () => setEditingSupplement(s.id) },
                          ...(productUrl ? [{ label: 'Visit Link', icon: ExternalLink, onSelect: () => openLink(s.productLink) }] : []),
                          { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setSupplementToDelete(s.id) },
                        ]}
                      />
                    </div>
                    {supplementTypeAndDosage(s) ? <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{supplementTypeAndDosage(s)}</p> : null}
                    <p className="android-supplement-meta mt-1 text-xs font-bold text-muted-foreground">
                      {stats.daysUsed}d used · {formatPHP(s.purchasePrice)}{s.currentPrice !== undefined ? ` · Current ${formatPHP(s.currentPrice)}` : ''}
                    </p>
                    {expiry ? <span className={`android-supplement-status mt-2 inline-flex rounded-full border px-2 py-0.5 text-caption font-semibold ${expiry.bg} ${expiry.color}`}>{expiry.label}</span> : null}
                    {s.effects ? <p className="android-supplement-benefits mt-2 line-clamp-1 text-xs text-muted-foreground">{s.effects}</p> : null}
                  </div>
                </div>
                <SupplementLifeHubContext
                  compact
                  activity={activity}
                  onOpenRoutine={routineId => openLifeHubRecord('routine', routineId)}
                  onOpenTask={taskId => openLifeHubRecord('tasks', taskId)}
                  onOpenLifeHub={() => {
                    const first = activity.routines[0];
                    if (first) openLifeHubRecord('routine', first.routineId);
                    else if (activity.tasks[0]) openLifeHubRecord('tasks', activity.tasks[0].taskId);
                  }}
                />
              </article>
            );
          })}
        </div>
      ) : viewMode === 'grid' ? (

        <div
          ref={collectionRevealRef}
          className="
            grid
            grid-cols-1
            gap-6

            md:grid-cols-2
            xl:grid-cols-3
          "
        >

          {paginatedSupplements.map(
            s => {
              const stats =
                getSupplementStats(
                  s.id
                );

              const expiry =
                getExpiryData(
                  s.expiryDate
                );
              const productUrl = normalizeExternalWebUrl(s.productLink);

              return (
                <div
                  key={s.id}
                  data-caizen-collection-item="true"
                  className="
    flex
    flex-col

                  overflow-hidden

                  rounded-2xl

                  border border-border/50

                  bg-card

                  transition-all
                  duration-300

                  hover:border-emerald-500/20

                "
                >

                  {/* IMAGE */}
                  {/* Legacy inline image compatibility remains alongside managed media. */}
                  {(s.image || s.photoAssetIds?.[0]) && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setEnlargedImage(s.image ?? null);
                      }}
                      aria-label={`View ${s.name} image`}
                      className="relative aspect-[2/1] cursor-zoom-in overflow-hidden bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    >
                      {s.photoAssetIds?.[0] ? (
                        <MediaAssetImage assetId={s.photoAssetIds[0]} profileId={currentProfileId} alt={s.name} className="h-full w-full object-cover" />
                      ) : <img src={s.image || undefined} alt={s.name} className="h-full w-full object-cover" />}
                    </button>
                  )}

                  {/* CONTENT */}
                  <div
                    className="
                    flex
                    flex-1
                    flex-col

                    p-4
                  "
                  >

                    <div
                      className="
                      flex
                      items-start
                      justify-between
                      gap-4
                    "
                    >

                      <div className="min-w-0 flex-1">

                        {productUrl && !androidPresentation ? <a
                          href={productUrl}
                          onClick={event => { event.preventDefault(); event.stopPropagation(); openLink(productUrl); }}
                          className="block break-words text-left text-lg font-bold no-underline transition-colors hover:text-primary hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 visited:no-underline"
                          aria-label={`Open product link for ${s.name}`}
                        >
                          {s.name}
                        </a> : <h3
                          className="break-words text-left text-lg font-bold"
                        >

                          {s.name}
                        </h3>}

                        {supplementTypeAndDosage(s) ? <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{supplementTypeAndDosage(s)}</p> : null}

                        {transactionBySupplementId.has(s.id) ? (
                          <button
                            type="button"
                            onClick={event => { event.stopPropagation(); navigateToTransaction(transactionBySupplementId.get(s.id)!.id); }}
                            className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                          >
                            <Link2 className="h-3 w-3" aria-hidden="true" /> Transaction · {formatPHP(transactionBySupplementId.get(s.id)!.amount)}
                          </button>
                        ) : null}

                        {expiry && (

                          <div
                            className={`
                            mt-3

                            inline-flex
                            items-center
                            gap-2

                            rounded-full
                            border

                            px-3
                            py-1

                            text-xs
                            font-medium

                            ${expiry.bg}
                            ${expiry.color}
                          `}
                          >

                            <Clock3 className="h-3 w-3" />

                            {expiry.label}

                          </div>

                        )}

                      </div>

                    </div>

                    {/* INFO */}
                    <div className="mt-5 space-y-3">

                      <div
                        className="
                        flex
                        items-center
                        justify-between
                      "
                      >

                        <span
                          className="
                          text-sm
                          text-muted-foreground
                        "
                        >

                          Days Used

                        </span>

                        <span
                          className="
                          text-sm
                          font-medium
                        "
                        >

                          {
                            stats.daysUsed
                          }
                          d

                        </span>

                      </div>

                      <div
                        className="
                        flex
                        items-center
                        justify-between
                      "
                      >

                        <span
                          className="
                          text-sm
                          text-muted-foreground
                        "
                        >

                          Purchase Price

                        </span>

                        <span
                          className="
                          text-sm
                          font-medium
                        "
                        >

                          {formatPHP(
                            s.purchasePrice
                          )}

                        </span>

                      </div>

                      {s.currentPrice !== undefined ? (
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Current Price</span>
                          <span className="text-sm font-medium">{formatPHP(s.currentPrice)}</span>
                        </div>
                      ) : null}

                    </div>

                    {/* NOTES */}
                    {s.effects && (

                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          setActiveNote(
                            s.effects || ''
                          );
                        }}
                        className="
                        mt-5

                        line-clamp-2

                        text-left
                        text-sm
                        leading-relaxed
                        text-muted-foreground

                        transition-colors

                        hover:text-foreground
                      "
                      >
                        <span className="line-clamp-2 whitespace-pre-wrap">{s.effects}</span>
                      </button>

                    )}

                    <div className="mt-auto pt-4">
                      <SupplementLifeHubContext
                        activity={getLifeHubActivity(s.id)}
                        onOpenRoutine={routineId => openLifeHubRecord('routine', routineId)}
                        onOpenTask={taskId => openLifeHubRecord('tasks', taskId)}
                        onOpenLifeHub={() => {
                          const activity = getLifeHubActivity(s.id);
                          const first = activity.routines[0];
                          if (first) openLifeHubRecord('routine', first.routineId);
                          else if (activity.tasks[0]) openLifeHubRecord('tasks', activity.tasks[0].taskId);
                        }}
                      />

                      {/* ACTIONS */}
                      <div
                        className="
    flex
    justify-end
    pt-6
  "
                      >
                       <HealthOverflowMenu
                         title={`${s.name} actions`}
                         ariaLabel={`More actions for ${s.name}`}
                         androidPresentation={androidPresentation}
                         actions={[
                           { label: 'Edit', icon: Pencil, onSelect: () => setEditingSupplement(s.id) },
                           ...(productUrl ? [{ label: 'Visit Link', icon: ExternalLink, onSelect: () => openLink(s.productLink) }] : []),
                           { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setSupplementToDelete(s.id) },
                         ]}
                       />

                      </div>
                    </div>

                  </div>

                </div>
              );
            })}

        </div>

      ) : (

        /* =========================================
            LIST VIEW
        ========================================= */

        <div
          ref={collectionRevealRef}
          className="
            overflow-hidden
            rounded-2xl
            border border-border/50
            bg-card
          "
        >

          {paginatedSupplements.map(
            s => {
              const stats =
                getSupplementStats(
                  s.id
                );

              const expiry =
                getExpiryData(
                  s.expiryDate
                );
              const productUrl = normalizeExternalWebUrl(s.productLink);

              return (
                <div
                  key={s.id}
                  data-caizen-collection-item="true"
                  className="
    flex
    flex-col
    items-stretch
    justify-between

    border-b border-border/30

    px-4
    py-4

    transition-colors

    hover:bg-background/30
  "
                >

                  <div
                    className="
                    flex
                    items-center
                    gap-4
                  "
                  >

                    {/* Legacy inline image compatibility remains alongside managed media. */}
                    {(s.image || s.photoAssetIds?.[0]) && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setEnlargedImage(s.image ?? null);
                        }}
                        aria-label={`View ${s.name} image`}
                        className="h-14 w-14 shrink-0 cursor-zoom-in overflow-hidden rounded-2xl bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {s.photoAssetIds?.[0] ? (
                          <MediaAssetImage assetId={s.photoAssetIds[0]} profileId={currentProfileId} alt={s.name} className="h-full w-full object-cover" />
                        ) : <img src={s.image || undefined} alt={s.name} className="h-full w-full object-cover" />}
                      </button>
                    )}

                    <div className="min-w-0 flex-1">

                      <div className="flex items-start justify-between gap-2">
                        {productUrl && !androidPresentation ? <a
                          href={productUrl}
                          onClick={event => { event.preventDefault(); event.stopPropagation(); openLink(productUrl); }}
                          className="min-w-0 flex-1 break-words font-semibold no-underline transition-colors hover:text-primary hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 visited:no-underline"
                          aria-label={`Open product link for ${s.name}`}
                        >
                          {s.name}
                        </a> : <p
                          className="min-w-0 flex-1 break-words font-semibold"
                        >

                          {s.name}
                        </p>}

                        <HealthOverflowMenu
                          title={`${s.name} actions`}
                          ariaLabel={`More actions for ${s.name}`}
                          androidPresentation={androidPresentation}
                          actions={[
                            { label: 'Edit', icon: Pencil, onSelect: () => setEditingSupplement(s.id) },
                            ...(productUrl ? [{ label: 'Visit Link', icon: ExternalLink, onSelect: () => openLink(s.productLink) }] : []),
                            { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setSupplementToDelete(s.id) },
                          ]}
                        />
                      </div>

                      {supplementTypeAndDosage(s) ? <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{supplementTypeAndDosage(s)}</p> : null}

                      <p
                        className="
                        mt-1
                        text-sm
                        text-muted-foreground
                      "
                      >

                        {
                          stats.daysUsed
                        }
                        d used •{' '}
                        {formatPHP(
                          s.purchasePrice
                        )}
                        {s.currentPrice !== undefined ? ` · Current ${formatPHP(s.currentPrice)}` : ''}

                      </p>

                    </div>

                  </div>

                  <SupplementLifeHubContext
                    compact
                    activity={getLifeHubActivity(s.id)}
                    onOpenRoutine={routineId => openLifeHubRecord('routine', routineId)}
                    onOpenTask={taskId => openLifeHubRecord('tasks', taskId)}
                    onOpenLifeHub={() => {
                      const activity = getLifeHubActivity(s.id);
                      const first = activity.routines[0];
                      if (first) openLifeHubRecord('routine', first.routineId);
                      else if (activity.tasks[0]) openLifeHubRecord('tasks', activity.tasks[0].taskId);
                    }}
                  />

                  <div
                    className="
                    flex
                    items-center
                    gap-3
                    self-end
                  "
                  >

                    {expiry && (

                      <div
                        className={`
                        rounded-full
                        border

                        px-3
                        py-1

                        text-xs
                        font-medium

                        ${expiry.bg}
                        ${expiry.color}
                      `}
                      >

                        {expiry.label}

                      </div>

                    )}

                  </div>

                </div>
              );
            })}

        </div>

      )}
      {totalPages > 1 && (

        <div
          className="
      flex
      items-center
      justify-center
      gap-2

      pt-2
    "
        >

          <Button
            variant="outline"
            disabled={
              currentPage === 1
            }
            onClick={() =>
              setCurrentPage(
                p => p - 1
              )
            }
          >
            Previous
          </Button>

          {Array.from(
            {
              length: totalPages,
            },
            (_, i) => (
              <Button
                key={i}
                variant={
                  currentPage ===
                    i + 1
                    ? 'default'
                    : 'outline'
                }
                onClick={() =>
                  setCurrentPage(
                    i + 1
                  )
                }
              >
                {i + 1}
              </Button>
            )
          )}

          <Button
            variant="outline"
            disabled={
              currentPage ===
              totalPages
            }
            onClick={() =>
              setCurrentPage(
                p => p + 1
              )
            }
          >
            Next
          </Button>

        </div>

      )}
      <Dialog open={Boolean(enlargedImage)} onOpenChange={open => !open && setEnlargedImage(null)}>
        <DialogContent className="max-w-4xl border-border/70 bg-black/90 p-3 sm:p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>Supplement image preview</DialogTitle>
            <DialogDescription>Full-size view of the selected supplement image.</DialogDescription>
          </DialogHeader>
          {enlargedImage ? <img src={enlargedImage} alt="Supplement full view" className="block max-h-[80dvh] w-full rounded-xl object-contain" /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeNote)} onOpenChange={open => !open && setActiveNote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supplement Notes</DialogTitle>
            <DialogDescription>Additional notes for this supplement.</DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {activeNote ? renderFormattedText(activeNote) : null}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(supplementToDelete)}
        title="Delete Supplement?"
        message={`Permanently delete ${supplementToDelete ? supplements.find(item => item.id === supplementToDelete)?.name || 'this supplement' : 'this supplement'} from this profile? Supplements do not appear in Recently Deleted.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (supplementToDelete) deleteSupplement(supplementToDelete);
          setSupplementToDelete(null);
        }}
        onCancel={() => setSupplementToDelete(null)}
      />

      {/* EDIT */}
      {editingSupplement && (

        <SupplementModal
          isOpen
          supplementId={
            editingSupplement
          }
          onClose={() =>
            setEditingSupplement(
              null
            )
          }
        />

      )}

      {exportModal}

    </div>
    </MonetaryMotionProvider>
  );
}
