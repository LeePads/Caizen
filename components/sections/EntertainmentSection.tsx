'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Clapperboard,
  Edit3,
  ExternalLink,
  Film,
  Gamepad2,
  Heart,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Star,
  Trash2,
  Tv,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import type { MediaItem, MediaStatus, MediaType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { SectionTabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchField } from '@/components/ui/search-field';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';
import { FilterBar, FilterChip } from '@/components/ui/collection-controls';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';
import { ResilientImage } from '@/components/media/ResilientImage';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import {
  EntryActionSheet,
  type EntryAction,
} from '@/components/common/EntryActionSheet';
import EntertainmentModal from '@/components/modals/EntertainmentModal';
import CatalogSearch from '@/components/entertainment/CatalogSearch';
import CatalogDetailsSheet from '@/components/entertainment/CatalogDetailsSheet';
import EntertainmentUpdates from '@/components/entertainment/EntertainmentUpdates';
import EntertainmentCalendar from '@/components/entertainment/EntertainmentCalendar';
import BooksWorkspace from '@/components/entertainment/BooksWorkspace';
import GamingSection from '@/components/sections/GamingSection';
import { PaginationControls } from '@/components/ui/section-kit';
import {
  catalogDetailsToMediaPayload,
  isCatalogDuplicate,
  syncCatalogItem,
} from '@/lib/entertainment/catalog';
import {
  adjustMediaProgress,
  catchUpMediaProgress,
  getKnownMediaTotal,
  getMediaProgressValue as progressValue,
} from '@/lib/entertainment/progress';
import {
  ENTERTAINMENT_AUTO_REFRESH_DELAY_MS,
  getAutomaticEntertainmentRefreshCandidates,
  shouldStartEntertainmentAutoRefresh,
} from '@/lib/entertainment/refresh';
import { getPreferredWatchLink } from '@/lib/entertainment/links';
import { formatMediaAvailability, formatNextRelease, getMediaUnitWords, isMediaUpdate } from '@/lib/entertainment/presentation';
import type {
  CatalogMediaDetails,
  CatalogSearchResult,
} from '@/lib/entertainment/types';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import { AndroidAdaptiveSelect, CaizenBottomSheet } from '@/components/native/android-design';

interface EntertainmentSectionProps {
  onAddClick?: () => void;
  androidPresentation?: boolean;
  requestedRecordId?: string;
  requestedRecordType?: string;
  requestedRecordSignal?: number;
  requestedProfileId?: string;
  onRequestedRecordConsumed?: (signal: number) => void;
}

type MainTab = 'library' | 'updates' | 'calendar' | 'discover';
type StatusFilter = 'watching' | 'planned' | 'paused' | 'completed' | 'dropped' | 'all';
type TypeFilter = 'all' | MediaType;
type AndroidMediaSort = 'updates' | 'title' | 'recent';
type CatalogAssistedMediaDraft = ReturnType<typeof catalogDetailsToMediaPayload>;
type InitialRefreshPhase = 'idle' | 'verifying' | 'settled';
type InitialRefreshPresentation = {
  profileId: string | null;
  phase: InitialRefreshPhase;
  checkingCount: number;
  failedCount: number;
};

const TYPE_ICON: Record<MediaType, typeof Tv> = {
  anime: Tv,
  manga: BookOpen,
  movie: Clapperboard,
  series: Film,
};

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'watching', label: 'Watching' },
  { value: 'planned', label: 'Planned' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'all', label: 'All' },
];

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'anime', label: 'Anime' },
  { value: 'manga', label: 'Manga' },
  { value: 'series', label: 'Series' },
  { value: 'movie', label: 'Movies' },
];

const MEDIA_PAGE_SIZE = 12;

function openEntertainmentLink(value?: string, title = 'entertainment link') {
  const destination = normalizeExternalWebUrl(value);
  if (!destination) {
    toast({ title: 'Invalid link', description: 'Add a valid HTTPS link and try again.' });
    return;
  }
  void openExternalLink(destination).catch(() => toast({ title: 'Could not open link', description: `Caizen could not open this ${title}.` }));
}

function matchesStatus(item: MediaItem, filter: StatusFilter) {
  if (filter === 'all') return true;
  if (filter === 'watching') return item.status === 'watching' || item.status === 'reading';
  return item.status === filter;
}

function progressLabel(item: MediaItem) {
  if (item.type === 'movie') return item.status === 'completed' ? 'Watched' : 'Not watched';
  if (item.type === 'series') {
    return `S${Math.max(1, Number(item.currentSeason || 1))} · E${progressValue(item)}`;
  }
  const unit = item.unitLabel || (item.type === 'manga' ? 'chapters' : 'episodes');
  const current = progressValue(item);
  return item.totalUnits
    ? current > item.totalUnits
      ? `${current} logged · ${item.totalUnits} listed`
      : `${current} / ${item.totalUnits} ${unit}`
    : `${current} ${unit}`;
}

function displayStatus(status: MediaStatus) {
  if (status === 'reading') return 'Reading';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function nextAiringLabel(item: MediaItem) {
  return formatNextRelease(item);
}

export default function EntertainmentSection({
  onAddClick,
  androidPresentation = false,
  requestedRecordId,
  requestedRecordSignal = 0,
  requestedRecordType,
  requestedProfileId,
  onRequestedRecordConsumed,
}: EntertainmentSectionProps) {
  const {
    mediaItems,
    updateMediaItem,
    deleteMediaItem,
    currentProfileId,
    isHydrated,
  } = useAppContext();

  const [mainTab, setMainTab] = useState<MainTab>('library');
  const mainTabPanelRef = useRef<HTMLDivElement>(null);
  const previousMainTabRef = useRef(mainTab);
  useEffect(() => {
    if (previousMainTabRef.current === mainTab) return;
    previousMainTabRef.current = mainTab;
    const panel = mainTabPanelRef.current;
    if (!panel) return;
    panel.classList.remove('caizen-tab-panel-motion');
    void panel.offsetWidth;
    panel.classList.add('caizen-tab-panel-motion');
  }, [mainTab]);
  const [workspaceTab, setWorkspaceTab] = useState<'media' | 'games' | 'books'>('media');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('watching');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [androidMediaSort, setAndroidMediaSort] = useState<AndroidMediaSort>('updates');
  const [showAndroidMediaFilters, setShowAndroidMediaFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [mediaPage, setMediaPage] = useState(1);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogSearchResult | null>(null);
  const [catalogDraft, setCatalogDraft] = useState<CatalogAssistedMediaDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [initialRefreshPresentation, setInitialRefreshPresentation] = useState<InitialRefreshPresentation>({
    profileId: null,
    phase: 'idle',
    checkingCount: 0,
    failedCount: 0,
  });
  const [stableUpdateSnapshot, setStableUpdateSnapshot] = useState<{ profileId: string; items: MediaItem[] } | null>(null);
  const autoSyncProfileIdRef = useRef<string | null>(null);
  const consumedRequestSignalRef = useRef<number | null>(null);
  const acknowledgementRevisionsRef = useRef(new Map<string, number>());
  const safeItems = useMemo(
    () => (Array.isArray(mediaItems) ? mediaItems : []),
    [mediaItems],
  );
  const safeItemsRef = useRef(safeItems);
  const currentProfileIdRef = useRef(currentProfileId);
  safeItemsRef.current = safeItems;
  currentProfileIdRef.current = currentProfileId;

  useEffect(() => {
    if (
      !requestedRecordSignal ||
      !isHydrated ||
      !currentProfileId ||
      requestedProfileId !== currentProfileId ||
      consumedRequestSignalRef.current === requestedRecordSignal
    ) return;
    if (requestedRecordType && ['game', 'game-guide', 'add-game', 'games', 'wishlist', 'discover'].includes(requestedRecordType)) {
      setWorkspaceTab('games');
      return;
    }
    if (requestedRecordType && ['book', 'books', 'add-book'].includes(requestedRecordType)) {
      setWorkspaceTab('books');
      if (requestedRecordType === 'books') onRequestedRecordConsumed?.(requestedRecordSignal);
      return;
    }
    if (!requestedRecordId) return;
    consumedRequestSignalRef.current = requestedRecordSignal;
    if (safeItems.some(item => item.id === requestedRecordId)) {
      setCatalogDraft(null);
      setEditingId(requestedRecordId);
      setShowManualModal(true);
    }
    onRequestedRecordConsumed?.(requestedRecordSignal);
  }, [currentProfileId, isHydrated, onRequestedRecordConsumed, requestedProfileId, requestedRecordId, requestedRecordSignal, requestedRecordType, safeItems]);

  const duplicateKeys = useMemo(
    () => new Set(
      safeItems
        .filter(item => item.catalogProvider && item.catalogProvider !== 'manual' && item.catalogId)
        .map(item => `${item.catalogProvider}:${item.catalogId}`),
    ),
    [safeItems],
  );

  const updateItems = useMemo(
    () => safeItems.filter(isMediaUpdate),
    [safeItems],
  );

  const isInitialRefreshVerifying = initialRefreshPresentation.profileId === currentProfileId
    && initialRefreshPresentation.phase === 'verifying';
  const presentationUpdateItems = isInitialRefreshVerifying && stableUpdateSnapshot?.profileId === currentProfileId
    ? stableUpdateSnapshot.items
    : updateItems;

  const updateWatchLinks = useMemo(() => {
    const links = new Map<string, string>();
    presentationUpdateItems.forEach(item => {
      const link = getPreferredWatchLink(item);
      if (link) links.set(item.id, link);
    });
    return links;
  }, [presentationUpdateItems]);

  const counts = useMemo(() => ({
    watching: safeItems.filter(item => item.status === 'watching' || item.status === 'reading').length,
    planned: safeItems.filter(item => item.status === 'planned').length,
    completed: safeItems.filter(item => item.status === 'completed').length,
    updates: presentationUpdateItems.length,
  }), [safeItems, presentationUpdateItems.length]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return safeItems
      .filter(item => matchesStatus(item, statusFilter))
      .filter(item => typeFilter === 'all' || item.type === typeFilter)
      .filter(item => {
        if (!needle) return true;
        return [
          item.title,
          item.canonicalTitle,
          item.originalTitle,
          ...(item.alternateTitles || []),
          item.genre,
          ...(item.genres || []),
          item.year,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        if (androidPresentation && androidMediaSort === 'title') {
          return a.title.localeCompare(b.title);
        }
        if (androidPresentation && androidMediaSort === 'recent') {
          return (b.updatedAt?.getTime() ?? b.createdAt.getTime()) - (a.updatedAt?.getTime() ?? a.createdAt.getTime());
        }
        const aUpdate = Number(a.newUnitsAvailable || 0) + (a.hasNewSeason ? 10 : 0);
        const bUpdate = Number(b.newUnitsAvailable || 0) + (b.hasNewSeason ? 10 : 0);
        if (aUpdate !== bUpdate) return bUpdate - aUpdate;
        if (Boolean(a.favorite) !== Boolean(b.favorite)) return a.favorite ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [androidMediaSort, androidPresentation, safeItems, search, statusFilter, typeFilter]);

  const mediaTotalPages = Math.max(1, Math.ceil(filtered.length / MEDIA_PAGE_SIZE));
  const visibleMedia = filtered.slice((mediaPage - 1) * MEDIA_PAGE_SIZE, mediaPage * MEDIA_PAGE_SIZE);
  const collectionRevealRef = useCollectionReveal(
    visibleMedia.map(item => item.id),
    [currentProfileId, mainTab, workspaceTab, statusFilter, typeFilter, androidMediaSort, mediaPage],
  );

  useEffect(() => {
    setMediaPage(1);
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    if (mediaPage > mediaTotalPages) setMediaPage(mediaTotalPages);
  }, [mediaPage, mediaTotalPages]);

  const syncOne = async (item: MediaItem, silent = false) => {
    if (!item.catalogProvider || item.catalogProvider === 'manual' || !item.catalogId) {
      if (!silent) {
        toast({ title: 'Manual title', description: 'This entry has no external catalog metadata to refresh.' });
      }
      return false;
    }

    const requestProfileId = currentProfileIdRef.current;
    const acknowledgementKey = `${requestProfileId || ''}:${item.id}`;
    const acknowledgementRevisionAtStart = acknowledgementRevisionsRef.current.get(acknowledgementKey) || 0;
    setSyncingIds(current => new Set(current).add(item.id));
    try {
      const patch = await syncCatalogItem(item);
      if (!requestProfileId || currentProfileIdRef.current !== requestProfileId) return false;
      const latestItem = safeItemsRef.current.find(candidate => candidate.id === item.id);
      if (!latestItem) return false;

      // Catalog requests can outlive a user acknowledgement or progress edit.
      // Rebase these fields on the latest profile record before committing.
      const availableUnits = latestItem.availableUnits == null && patch.availableUnits == null
        ? undefined
        : Math.max(Number(latestItem.availableUnits || 0), Number(patch.availableUnits || 0));
      const acknowledgedAvailableUnits = latestItem.acknowledgedAvailableUnits == null
        ? latestItem.availableUnits
        : latestItem.acknowledgedAvailableUnits;
      // Acknowledgement is a user action; a request started earlier must not resurrect it.
      const userAcknowledgedDuringRequest =
        (acknowledgementRevisionsRef.current.get(acknowledgementKey) || 0) > acknowledgementRevisionAtStart;
      const acknowledgementChangedInFlight = userAcknowledgedDuringRequest ||
        latestItem.hasNewSeason !== item.hasNewSeason ||
        Number(latestItem.acknowledgedAvailableUnits ?? latestItem.availableUnits ?? 0)
          !== Number(item.acknowledgedAvailableUnits ?? item.availableUnits ?? 0);
      const acknowledgedUnitsForPatch = userAcknowledgedDuringRequest
        ? availableUnits ?? acknowledgedAvailableUnits
        : acknowledgedAvailableUnits;
      const reconciledPatch = {
        ...patch,
        availableUnits,
        acknowledgedAvailableUnits: acknowledgedUnitsForPatch,
        newUnitsAvailable: userAcknowledgedDuringRequest
          ? 0
          : availableUnits == null
            ? Number(latestItem.newUnitsAvailable || 0)
            : Math.max(0, availableUnits - Number(acknowledgedUnitsForPatch || 0)),
        hasNewSeason: userAcknowledgedDuringRequest
          ? false
          : acknowledgementChangedInFlight
          ? Boolean(latestItem.hasNewSeason)
          : Boolean(latestItem.hasNewSeason || patch.hasNewSeason),
      };
      if (latestItem.status === 'dropped') {
        reconciledPatch.newUnitsAvailable = 0;
        reconciledPatch.hasNewSeason = false;
      }
      updateMediaItem(item.id, reconciledPatch);
      if (!silent) {
        const newCount = Number(reconciledPatch.newUnitsAvailable || 0);
        toast({
          title: newCount > 0 || reconciledPatch.hasNewSeason ? 'New catalog update found' : 'Metadata refreshed',
          description:
            newCount > 0
              ? `${newCount} new ${newCount === 1 ? 'episode or chapter' : 'episodes or chapters'} detected for ${item.title}.`
              : reconciledPatch.hasNewSeason
                ? `A new season was detected for ${item.title}.`
                : `${item.title} is up to date.`,
        });
      }
      return true;
    } catch (error) {
      if (!silent) {
        toast({
          title: 'Refresh failed',
          description: error instanceof Error ? error.message : 'Could not refresh catalog metadata.',
        });
      }
      return false;
    } finally {
      setSyncingIds(current => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  useEffect(() => {
    if (
      !isHydrated ||
      !shouldStartEntertainmentAutoRefresh(
        currentProfileId,
        autoSyncProfileIdRef.current,
        safeItems.length,
      )
    ) return;

    autoSyncProfileIdRef.current = currentProfileId;
    const eligible = getAutomaticEntertainmentRefreshCandidates(safeItems);
    if (eligible.length === 0) {
      setInitialRefreshPresentation({ profileId: currentProfileId, phase: 'settled', checkingCount: 0, failedCount: 0 });
      setStableUpdateSnapshot(null);
      return;
    }

    setStableUpdateSnapshot({
      profileId: currentProfileId,
      items: safeItems.filter(isMediaUpdate),
    });
    setInitialRefreshPresentation({
      profileId: currentProfileId,
      phase: 'verifying',
      checkingCount: eligible.length,
      failedCount: 0,
    });

    let cancelled = false;
    void (async () => {
      let failedCount = 0;
      for (const item of eligible) {
        if (cancelled) break;
        if (!await syncOne(item, true)) failedCount += 1;
        await new Promise(resolve => window.setTimeout(resolve, ENTERTAINMENT_AUTO_REFRESH_DELAY_MS));
      }
      if (!cancelled && currentProfileIdRef.current === currentProfileId) {
        setInitialRefreshPresentation({
          profileId: currentProfileId,
          phase: 'settled',
          checkingCount: eligible.length,
          failedCount,
        });
        setStableUpdateSnapshot(null);
      }
    })();

    return () => {
      cancelled = true;
      if (autoSyncProfileIdRef.current === currentProfileId) autoSyncProfileIdRef.current = null;
    };
    // Initial hydration-only sync. Later changes are handled by explicit refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfileId, isHydrated, safeItems.length]);

  const addCatalogItem = (
    details: CatalogMediaDetails,
    user: Parameters<typeof catalogDetailsToMediaPayload>[1],
  ) => {
    if (isCatalogDuplicate(safeItems, details)) {
      toast({ title: 'Already in library', description: `${details.title} is already being tracked.` });
      setSelectedCatalog(null);
      return;
    }

    const payload = catalogDetailsToMediaPayload(details, user);
    setCatalogDraft(payload);
    setSelectedCatalog(null);
    setMainTab('library');
    setStatusFilter('all');
    setShowManualModal(true);
    toast({ title: 'Review before adding', description: 'Catalog details are ready to edit. The title will be saved after you confirm the form.' });
  };

  const incrementProgress = (item: MediaItem) => {
    const latestItem = safeItemsRef.current.find(candidate => candidate.id === item.id) || item;
    if (latestItem.type === 'movie') {
      updateMediaItem(latestItem.id, {
        status: 'completed',
        completedAt: new Date(),
        progress: 1,
      });
      toast({ title: 'Marked watched', description: latestItem.title });
      return;
    }

    const adjustment = adjustMediaProgress(latestItem, 1);
    if (!adjustment.changed) return;
    updateMediaItem(latestItem.id, adjustment.patch);
    toast({
      title: adjustment.patch.status === 'completed'
        ? 'Marked complete'
        : `Progress updated to ${adjustment.patch.progress}`,
      description: latestItem.title,
    });
  };

  const decrementProgress = (item: MediaItem) => {
    const latestItem = safeItemsRef.current.find(candidate => candidate.id === item.id) || item;
    const adjustment = adjustMediaProgress(latestItem, -1);
    if (!adjustment.changed) return;
    updateMediaItem(latestItem.id, adjustment.patch);
  };

  const catchUpProgress = (item: MediaItem) => {
    const latestItem = safeItemsRef.current.find(candidate => candidate.id === item.id) || item;
    const adjustment = catchUpMediaProgress(latestItem);
    if (!adjustment.changed || adjustment.patch.progress == null) return;
    updateMediaItem(latestItem.id, adjustment.patch);
    const unit = getMediaUnitWords(latestItem).singular;
    toast({
      title: 'Caught up',
      description: `${unit.charAt(0).toUpperCase()}${unit.slice(1)} ${adjustment.patch.progress}`,
    });
  };

  const acknowledgeUpdate = (item: MediaItem) => {
    const latestItem = safeItemsRef.current.find(candidate => candidate.id === item.id) || item;
    const acknowledgementKey = `${currentProfileId || ''}:${latestItem.id}`;
    acknowledgementRevisionsRef.current.set(acknowledgementKey, (acknowledgementRevisionsRef.current.get(acknowledgementKey) || 0) + 1);
    updateMediaItem(latestItem.id, {
      acknowledgedAvailableUnits: latestItem.availableUnits,
      newUnitsAvailable: 0,
      hasNewSeason: false,
    });
    setStableUpdateSnapshot(snapshot => snapshot?.profileId === currentProfileId
      ? { ...snapshot, items: snapshot.items.filter(candidate => candidate.id !== latestItem.id) }
      : snapshot);
  };

  const refreshAll = async () => {
    if (refreshingAll) return;
    const eligible = safeItems.filter(item =>
      item.catalogProvider && item.catalogProvider !== 'manual' && item.catalogId && !['dropped'].includes(item.status),
    );
    if (eligible.length === 0) {
      toast({ title: 'Nothing to refresh', description: 'Add a title from Discover first.' });
      return;
    }

    setRefreshingAll(true);
    for (const item of eligible) {
      await syncOne(item, true);
      await new Promise(resolve => window.setTimeout(resolve, 250));
    }
    setRefreshingAll(false);
    toast({ title: 'Catalog refresh finished', description: `${eligible.length} linked ${eligible.length === 1 ? 'title was' : 'titles were'} checked.` });
  };

  const openManualAdd = () => {
    setCatalogDraft(null);
    if (onAddClick) onAddClick();
    else setShowManualModal(true);
  };

  return (
    <div
      className={androidPresentation ? 'android-media-section space-y-4' : 'workspace-wide caizen-media-page caizen-entertainment-page space-y-4 lg:space-y-5'}
      data-android-screen={androidPresentation ? 'entertainment' : undefined}
    >
      <SectionTabs
        mode="navigation"
        label="Entertainment workspaces"
        value={workspaceTab}
        onValueChange={value => setWorkspaceTab(value as 'media' | 'games' | 'books')}
        className="module-sticky-nav"
        items={[
          { value: 'media', label: 'Media', icon: Film },
          { value: 'games', label: 'Games', icon: Gamepad2 },
          { value: 'books', label: 'Books', icon: BookOpen },
        ]}
      />

      {workspaceTab === 'media' ? (
        <div className="space-y-6">
        <>
      <header className="border-b border-border/50 px-1 pb-4 text-foreground sm:px-2">
        <div>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-page-title">
                Your watchlist
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Track what you're watching and what comes next.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={refreshAll} disabled={refreshingAll} className="android-touch-target h-11">
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshingAll ? 'animate-spin' : ''}`} />
                Refresh Library
              </Button>
              <Button type="button" onClick={openManualAdd} className="android-touch-target h-11">
                <Plus className="mr-2 h-4 w-4" /> Manual Entry
              </Button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-border/55 pt-4 text-xs font-bold text-muted-foreground dark:border-white/10 dark:text-white/70">
            <span>Watching <strong className="text-foreground dark:text-white">{counts.watching}</strong></span>
            <span className={counts.updates ? 'text-rose-700 dark:text-rose-200' : undefined}>Updates <strong className="text-foreground dark:text-white">{counts.updates}</strong></span>
            <span>Planned <strong className="text-foreground dark:text-white">{counts.planned}</strong></span>
            <span>Completed <strong className="text-foreground dark:text-white">{counts.completed}</strong></span>
          </div>
        </div>
      </header>

      <SectionTabs
        mode="panels"
        value={mainTab}
        onValueChange={value => setMainTab(value as MainTab)}
        className="min-w-0 gap-0"
      >
      <TabsList className="w-full max-w-full gap-1 overflow-x-auto p-1" aria-label="Entertainment views">
        {([
          ['library', 'My Library'],
          ['updates', `Updates${counts.updates ? ` (${counts.updates})` : ''}`],
          ['calendar', 'Calendar'],
          ['discover', 'Discover'],
        ] as Array<[MainTab, string]>).map(([value, label]) => (
          <TabsTrigger
            key={value}
            value={value}
            className={`caizen-tab min-h-11 shrink-0 rounded-xl px-4 transition-colors caizen-tab-motion-indicator ${mainTab === value ? 'caizen-tab-active' : ''}`}
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent ref={mainTabPanelRef} value={mainTab} tabIndex={0} className="caizen-entertainment-tab-panel min-w-0 focus-visible:outline-none" data-entertainment-tab={mainTab}>
      {mainTab === 'discover' ? (
        <CatalogSearch
          duplicateKeys={duplicateKeys}
          onSelect={setSelectedCatalog}
          profileId={currentProfileId}
          androidPresentation={androidPresentation}
        />
      ) : mainTab === 'updates' ? (
          <EntertainmentUpdates
            items={presentationUpdateItems}
            androidPresentation={androidPresentation}
            watchLinks={updateWatchLinks}
            syncingIds={syncingIds}
            refreshPhase={initialRefreshPresentation.profileId === currentProfileId ? initialRefreshPresentation.phase : 'idle'}
            checkingCount={initialRefreshPresentation.profileId === currentProfileId ? initialRefreshPresentation.checkingCount : 0}
            failedCount={initialRefreshPresentation.profileId === currentProfileId ? initialRefreshPresentation.failedCount : 0}
            hydrated={Boolean(isHydrated && currentProfileId)}
            onRefresh={(item: MediaItem) => void syncOne(item)}
            onAcknowledge={acknowledgeUpdate}
            onProgress={incrementProgress}
            onWatch={(item: MediaItem) => {
              const link = updateWatchLinks.get(item.id);
              if (link) openEntertainmentLink(link, 'watch link');
            }}
            onOpen={(item: MediaItem) => setEditingId(item.id)}
          />
      ) : mainTab === 'calendar' ? (
        <EntertainmentCalendar
          items={safeItems}
          profileId={currentProfileId}
          androidPresentation={androidPresentation}
          onOpen={item => setEditingId(item.id)}
        />
      ) : (
        <>
          <section className="caizen-entertainment-library-toolbar toolbar-surface space-y-2 p-2.5 sm:p-3">
            <SearchField
              aria-label="Search entertainment library"
              value={search}
              onChange={setSearch}
              placeholder="Search your library..."
              wrapperClassName="w-full sm:max-w-lg"
            />

            {androidPresentation ? (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAndroidMediaFilters(true)}
                    className="inline-flex min-h-11 items-center justify-between rounded-xl border border-border/55 bg-background/45 px-3 text-left text-sm font-black"
                    aria-label={`Filter library${statusFilter !== 'watching' || typeFilter !== 'all' || androidMediaSort !== 'updates' ? ', filters active' : ''}`}
                  >
                    <span className="inline-flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" /> Filters</span>
                    <span className="text-xs font-bold text-muted-foreground">{statusFilter === 'watching' ? 'Watching' : statusFilter === 'all' ? 'All statuses' : STATUS_OPTIONS.find(option => option.value === statusFilter)?.label}</span>
                  </button>
                  <span className="inline-flex min-h-11 items-center rounded-xl border border-border/45 bg-muted/20 px-3 text-xs font-bold text-muted-foreground" aria-label={`${filtered.length} titles shown`}>{filtered.length}</span>
                </div>
                <FilterBar label="Entertainment status filters">
                  {STATUS_OPTIONS.filter(option => option.value !== 'dropped').map(option => {
                    const count = safeItems.filter(item => matchesStatus(item, option.value)).length;
                    return (
                      <FilterChip key={option.value} selected={statusFilter === option.value} onSelectedChange={() => setStatusFilter(option.value)} count={count} className="!min-h-11 rounded-lg px-2.5 text-xs font-bold">
                        {option.label}
                      </FilterChip>
                    );
                  })}
                </FilterBar>
                <CaizenBottomSheet open={showAndroidMediaFilters} title="Filter library" description="Choose how your media library is shown." onClose={() => setShowAndroidMediaFilters(false)}>
                  <div className="space-y-3" data-android-media-filters="true">
                    <AndroidAdaptiveSelect label="Status" value={statusFilter} onChange={value => setStatusFilter(value as StatusFilter)} options={STATUS_OPTIONS} />
                    <AndroidAdaptiveSelect label="Type" value={typeFilter} onChange={value => setTypeFilter(value as TypeFilter)} options={TYPE_OPTIONS} />
                    <AndroidAdaptiveSelect label="Sort" value={androidMediaSort} onChange={value => setAndroidMediaSort(value as AndroidMediaSort)} options={[{ value: 'updates', label: 'Updates first' }, { value: 'title', label: 'Title A–Z' }, { value: 'recent', label: 'Recently updated' }]} />
                    <button type="button" onClick={() => { setStatusFilter('watching'); setTypeFilter('all'); setAndroidMediaSort('updates'); }} className="min-h-11 w-full rounded-xl border border-border/60 px-3 text-sm font-bold text-muted-foreground">Reset</button>
                  </div>
                </CaizenBottomSheet>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-12 shrink-0 text-label text-muted-foreground">Status</span>
                  <AndroidAdaptiveSelect
                    label="Status"
                    value={statusFilter}
                    onChange={value => setStatusFilter(value as StatusFilter)}
                    options={STATUS_OPTIONS}
                    className="control-input combobox-trigger-transparent h-11 min-w-0 flex-1"
                  />
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-12 shrink-0 text-label text-muted-foreground">Type</span>
                  <AndroidAdaptiveSelect
                    label="Type"
                    value={typeFilter}
                    onChange={value => setTypeFilter(value as TypeFilter)}
                    options={TYPE_OPTIONS}
                    className="control-input combobox-trigger-transparent h-11 min-w-0 flex-1"
                  />
                </div>
              </div>
            )}
          </section>

          {filtered.length === 0 ? (
            <div className={androidPresentation ? 'rounded-3xl border border-dashed border-border/60 bg-card/45 px-5 py-16 text-center' : 'mt-6 rounded-3xl border border-dashed border-border/60 bg-card/45 px-5 py-16 text-center'}>
              <Film className="mx-auto h-9 w-9 text-muted-foreground" />
              <h2 className="mt-4 text-section-title">
                {safeItems.length === 0 ? 'Start your entertainment library' : 'No matching titles'}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {safeItems.length === 0
                  ? 'Keep track of what you plan to watch, are watching, and have finished. Add a title from the catalog or create one yourself.'
                  : 'Try another search or filter, or search the catalog to import a title or create a manual entry.'}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {safeItems.length > 0 ? <Button type="button" variant="outline" onClick={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); }}>Clear filters</Button> : null}
                <Button type="button" variant="outline" onClick={openManualAdd} className="rounded-xl">Manual Entry</Button>
                <Button type="button" onClick={() => setMainTab('discover')} className="rounded-xl">Discover</Button>
              </div>
            </div>
          ) : (
            <div ref={collectionRevealRef} className={androidPresentation ? 'grid gap-5 sm:grid-cols-2 xl:grid-cols-4' : 'mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4'}>
              {visibleMedia.map(item => (
                <MediaCard
                  key={item.id}
                  item={item}
                  profileId={currentProfileId}
                  syncing={syncingIds.has(item.id)}
                  onIncrement={() => incrementProgress(item)}
                  onDecrement={() => decrementProgress(item)}
                  onCatchUp={() => catchUpProgress(item)}
                  onRefresh={() => void syncOne(item)}
                  onEdit={() => setEditingId(item.id)}
                  onDelete={() => setDeleteTarget(item)}
                  onDeleteConfirmed={() => deleteMediaItem(item.id)}
                  onAcknowledge={() => acknowledgeUpdate(item)}
                  androidPresentation={androidPresentation}
                />
              ))}
            </div>
          )}
          {filtered.length > MEDIA_PAGE_SIZE ? <PaginationControls page={mediaPage} totalPages={mediaTotalPages} totalItems={filtered.length} pageSize={MEDIA_PAGE_SIZE} onPageChange={setMediaPage} /> : null}
        </>
      )}
      </TabsContent>
      </SectionTabs>

      <CatalogDetailsSheet
        item={selectedCatalog}
        onClose={() => setSelectedCatalog(null)}
        onAdd={addCatalogItem}
      />

      {editingId ? (
        <EntertainmentModal
          isOpen
          mediaId={editingId}
          onClose={() => setEditingId(null)}
        />
      ) : null}

      {showManualModal ? (
        <EntertainmentModal
          isOpen
          initialDraft={catalogDraft}
          onClose={() => { setShowManualModal(false); setCatalogDraft(null); }}
        />
      ) : null}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Move title to Trash?"
        message={deleteTarget ? `This moves “${deleteTarget.title}” to Trash. You can restore it from Trash later.` : ''}
        confirmText="Move to Trash"
        cancelText="Cancel"
        isDangerous
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMediaItem(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
        </>
        </div>
      ) : workspaceTab === 'books' ? (
        <div className="min-w-0">
          <BooksWorkspace androidPresentation={androidPresentation} requestedProfileId={requestedProfileId} requestedRecordId={requestedRecordId} requestedRecordType={requestedRecordType} requestedRecordSignal={requestedRecordSignal} onRequestedRecordConsumed={onRequestedRecordConsumed} />
        </div>
      ) : (
        <div className="min-w-0">
          <GamingSection
            androidPresentation={androidPresentation}
            requestedProfileId={requestedProfileId}
            requestedRecordId={requestedRecordId}
            requestedRecordType={requestedRecordType}
            requestedRecordSignal={requestedRecordSignal}
            onRequestedRecordConsumed={onRequestedRecordConsumed}
          />
        </div>
      )}
    </div>
  );
}

/** Compact progress control for series and manga cards. */
function EpisodeProgress({
  item,
  current,
  total,
  onIncrement,
  onDecrement,
  onCatchUp,
}: {
  item: MediaItem;
  current: number;
  total: number | undefined;
  onIncrement: () => void;
  onDecrement: () => void;
  onCatchUp?: () => void;
}) {
  const unit = item.type === 'manga' ? 'chapter' : 'episode';
  const unitPlural = item.unitLabel || (item.type === 'manga' ? 'chapters' : 'episodes');
  const progressText = total === undefined
    ? (item.type === 'manga' ? 'Ch ' : 'Ep ') + current
    : current > total
      ? current + ' logged \u00B7 ' + total + ' listed'
      : current + ' / ' + total + ' ' + unitPlural;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={item.title + ' progress'}>
      <div className="flex min-w-[9.5rem] flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onDecrement}
          disabled={current <= 0}
          className="android-touch-target grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-base font-black disabled:opacity-35 md:h-9 md:w-9"
          aria-label={'Decrease ' + unit}
        >
          &#8722;
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-xs font-bold leading-tight text-muted-foreground" aria-live="polite">
          {progressText}
        </span>
        <button
          type="button"
          onClick={onIncrement}
          disabled={total !== undefined && current === total}
          className="android-touch-target grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-base font-black disabled:opacity-35 md:h-9 md:w-9"
          aria-label={'Increase ' + unit}
        >
          +
        </button>
      </div>
      {onCatchUp ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onCatchUp}
          className="android-touch-target h-10 min-h-10 shrink-0 whitespace-nowrap rounded-lg px-2 text-xs font-bold text-muted-foreground md:h-9 md:min-h-9"
        >
          Catch up
        </Button>
      ) : null}
    </div>
  );
}

function MediaCard({
  item,
  profileId,
  syncing,
  onIncrement,
  onDecrement,
  onCatchUp,
  onRefresh,
  onEdit,
  onDelete,
  onDeleteConfirmed,
  onAcknowledge,
  androidPresentation,
}: {
  item: MediaItem;
  profileId: string;
  syncing: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  onCatchUp: () => void;
  onRefresh: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteConfirmed: () => void;
  onAcknowledge: () => void;
  androidPresentation: boolean;
}) {
  const Icon = TYPE_ICON[item.type] || Film;
  const link = item.status === 'dropped' ? undefined : getPreferredWatchLink(item);
  const total = getKnownMediaTotal(item);
  const current = progressValue(item);
  const percentage = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const availabilityLabel = formatMediaAvailability(item);
  const canCatchUp = Boolean(availabilityLabel) && item.type !== 'movie' && (item.status === 'watching' || item.status === 'reading');
  const secondaryLine = item.status === 'dropped' ? undefined : availabilityLabel || nextAiringLabel(item);
  const hasUpdate = item.status !== 'dropped' && (Number(item.newUnitsAvailable || 0) > 0 || item.hasNewSeason);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const androidActions: EntryAction[] = [
    {
      id: 'open',
      label: 'Open details',
      onSelect: onEdit,
    },
    ...(item.catalogProvider && item.catalogProvider !== 'manual'
      ? [{
          id: 'edit' as const,
          label: 'Refresh metadata',
          onSelect: onRefresh,
        }]
      : []),
    ...(item.catalogUrl
      ? [{
          id: 'source' as const,
          label: 'Open catalog page',
          onSelect: () => openEntertainmentLink(item.catalogUrl, 'catalog link'),
        }]
      : []),
    ...(hasUpdate ? [{ id: 'finish' as const, label: 'Mark Seen', onSelect: onAcknowledge }] : []),
    {
      id: 'delete',
      label: 'Remove from library',
      destructive: true,
      onSelect: onDeleteConfirmed,
    },
  ];

  if (androidPresentation) {
    return (
      <>
        <article
          data-caizen-interactive-record="true"
          className="android-entertainment-card overflow-hidden rounded-[1.25rem] border border-border/60 bg-card/80 shadow-sm"
          data-entry-row="true"
        >
          <div className="grid grid-cols-[minmax(6.5rem,38%)_minmax(0,1fr)] gap-3 p-3">
            <div className="relative min-h-36 overflow-hidden rounded-xl bg-muted">
              {item.imageAssetId ? (
                <MediaAssetImage
                  assetId={item.imageAssetId}
                  profileId={profileId}
                  alt=""
                  className="h-full w-full object-cover"
                  fallback={(
                    <div aria-hidden="true" className="flex h-full min-h-36 flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Icon className="h-9 w-9 opacity-40" />
                      <span className="text-xs font-bold">No poster</span>
                    </div>
                  )}
                />
              ) : (
                <ResilientImage
                  src={item.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                  fallback={(
                    <div aria-hidden="true" className="flex h-full min-h-36 flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Icon className="h-9 w-9 opacity-40" />
                      <span className="text-xs font-bold">No poster</span>
                    </div>
                  )}
                />
              )}
              <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
                {item.favorite ? (
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400 text-black" aria-label="Favorite">
                    <Star className="h-3.5 w-3.5 fill-current" />
                  </span>
                ) : null}
                {hasUpdate ? (
                  <span className="min-h-8 rounded-lg bg-primary px-2 py-1.5 text-xs font-black text-primary-foreground">
                    {item.hasNewSeason ? 'New season' : `+${item.newUnitsAvailable} new`}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex min-w-0 flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    <span>{item.type}</span>
                    {item.year ? <span>· {item.year}</span> : null}
                  </p>
                  <OverflowTooltip text={item.title} mode="clamped"><h3 className="mt-1.5 line-clamp-3 text-card-title text-foreground">{item.title}</h3></OverflowTooltip>
                </div>
                <button
                  type="button"
                  onClick={() => setActionSheetOpen(true)}
                  className="android-touch-target grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Title actions"
                  data-entry-actions="true"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-bold">
                <span className="rounded-lg bg-primary/10 px-2 py-1 text-primary">{displayStatus(item.status)}</span>
                <span className="text-muted-foreground">{progressLabel(item)}</span>
              </div>
              {secondaryLine ? (
                <p className={`mt-2 line-clamp-2 text-xs leading-snug ${availabilityLabel ? 'font-black text-primary' : 'text-muted-foreground'}`}>{secondaryLine}</p>
              ) : null}
              {total !== undefined && item.type !== 'movie' ? (
                <div className="mt-auto pt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-violet-400" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2.5 border-t border-border/50 p-3">
            {item.type !== 'movie' ? (
              <EpisodeProgress
                item={item}
                current={current}
                total={total}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
              />
            ) : item.status !== 'completed' ? (
              <Button type="button" onClick={onIncrement} className="android-touch-target h-11 w-full rounded-xl">
                <Check className="mr-2 h-4 w-4" /> Watched
              </Button>
            ) : null}

            {canCatchUp ? (
              <Button type="button" variant="outline" onClick={onCatchUp} className="android-touch-target h-11 w-full rounded-xl text-xs font-bold">
                Catch up
              </Button>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              {link ? (
                <Button type="button" onClick={() => openEntertainmentLink(link)} className="android-touch-target h-11 min-w-0 rounded-xl px-3" aria-label={`Open website for ${item.title}`}>
                  <Play className="mr-1.5 h-4 w-4 shrink-0" /> Continue
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={onEdit} className="android-touch-target h-11 min-w-0 rounded-xl px-3">
                  <Plus className="mr-1.5 h-4 w-4 shrink-0" /> Add Link
                </Button>
              )}
              {syncing ? <span role="status" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Refreshing</span> : null}
            </div>
          </div>
        </article>
        <EntryActionSheet
          open={actionSheetOpen}
          androidPresentation={androidPresentation}
          title={item.title}
          subtitle={`${displayStatus(item.status)} · ${progressLabel(item)}`}
          onClose={() => setActionSheetOpen(false)}
          deleteMessage={`“${item.title}” and its personal progress will be removed.`}
          actions={androidActions}
        />
      </>
    );
  }

  return (
    <>
    <article
      data-caizen-collection-item="true"
      data-caizen-interactive-record="true"
      className="group android-record-row relative flex self-start flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 transition-[border-color,box-shadow] duration-150 hover:border-primary/25"
      data-entry-row={androidPresentation ? 'true' : undefined}
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-muted">
        {item.imageAssetId ? (
          <MediaAssetImage
            assetId={item.imageAssetId}
            profileId={profileId}
            alt=""
            className="h-full w-full object-cover"
            fallback={(
              <div aria-hidden="true" className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Icon className="h-12 w-12 opacity-40" />
                <span className="text-xs font-bold">No poster</span>
              </div>
            )}
          />
        ) : (
          <ResilientImage
            src={item.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
            fallback={(
              <div aria-hidden="true" className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Icon className="h-12 w-12 opacity-40" />
                <span className="text-xs font-bold">No poster</span>
              </div>
            )}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {item.favorite ? (
            <span className="rounded-full bg-amber-400 p-2 text-black"><Star className="h-3.5 w-3.5 fill-current" /></span>
          ) : null}
          {hasUpdate ? (
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-black text-primary-foreground shadow-lg">
              {item.hasNewSeason ? 'New season' : `+${item.newUnitsAvailable} new`}
            </span>
          ) : null}
        </div>

        <div className="absolute right-3 top-3">
          <button
            type="button"
            onClick={() => {
              if (androidPresentation) {
                setActionSheetOpen(true);
              } else {
                setMenuOpen(value => !value);
              }
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur"
            aria-label="Title actions"
            data-entry-actions={androidPresentation ? 'true' : undefined}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && !androidPresentation ? (
            <div className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-2xl border border-white/10 bg-black/90 p-1 text-white shadow-2xl backdrop-blur-xl">
              <MenuButton icon={Edit3} label="Edit" onClick={() => { setMenuOpen(false); onEdit(); }} />
              {item.catalogProvider && item.catalogProvider !== 'manual' ? (
                <MenuButton icon={RefreshCw} label="Refresh metadata" onClick={() => { setMenuOpen(false); onRefresh(); }} />
              ) : null}
              {item.catalogUrl ? (
                <MenuButton icon={ExternalLink} label="Catalog page" onClick={() => { setMenuOpen(false); openEntertainmentLink(item.catalogUrl, 'catalog link'); }} />
              ) : null}
              {hasUpdate ? <MenuButton icon={Check} label="Mark Seen" onClick={() => { setMenuOpen(false); onAcknowledge(); }} /> : null}
              <MenuButton icon={Trash2} label="Remove" danger onClick={() => { setMenuOpen(false); onDelete(); }} />
            </div>
          ) : null}
        </div>

        <div className="absolute bottom-0 left-0 w-full p-4 text-white">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-white/85">
            <Icon className="h-3.5 w-3.5" />
            <span>{item.type}</span>
            {item.year ? <span>• {item.year}</span> : null}
          </div>
          <OverflowTooltip text={item.title} mode="clamped"><button type="button" onClick={onEdit} className="mt-2 line-clamp-2 max-w-full break-words text-left text-xl font-black leading-tight text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open details for ${item.title}`}>{item.title}</button></OverflowTooltip>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs">
            <span className="rounded-full bg-white/15 px-2.5 py-1 font-bold backdrop-blur">{displayStatus(item.status)}</span>
            <span className="font-bold text-white/75">{progressLabel(item)}</span>
          </div>
          {secondaryLine ? <p className={`mt-2 line-clamp-1 text-xs ${availabilityLabel ? 'font-black text-primary-foreground' : 'text-white/65'}`}>{secondaryLine}</p> : null}
          {total !== undefined && item.type !== 'movie' ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-violet-400" style={{ width: `${percentage}%` }} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 p-3">
        {item.type !== 'movie' ? (
          <EpisodeProgress
            item={item}
            current={current}
            total={total}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            onCatchUp={canCatchUp ? onCatchUp : undefined}
          />
        ) : item.status !== 'completed' ? (
          <Button type="button" variant="outline" onClick={onIncrement} className="h-9 w-full rounded-xl text-xs"><Check className="mr-2 h-4 w-4" />Mark Watched</Button>
        ) : null}

        {link ? (
          <Button type="button" onClick={() => openEntertainmentLink(link)} className="h-11 w-full rounded-xl" aria-label={`Open website for ${item.title}`}>
            <Play className="mr-2 h-4 w-4" />Continue
          </Button>
        ) : (
          <Button type="button" onClick={onEdit} className="h-11 w-full rounded-xl">
            <Plus className="mr-2 h-4 w-4" />Add Link
          </Button>
        )}
        {syncing ? <span role="status" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Refreshing…</span> : null}
      </div>
    </article>
      <EntryActionSheet
        open={actionSheetOpen}
        androidPresentation={androidPresentation}
        title={item.title}
        subtitle={`${displayStatus(item.status)} · ${progressLabel(item)}`}
        onClose={() => setActionSheetOpen(false)}
        deleteMessage={`“${item.title}” and its personal progress will be removed.`}
        actions={androidActions}
      />
    </>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof Heart;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition ${danger ? 'text-red-300 hover:bg-red-500/15' : 'hover:bg-white/10'}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
