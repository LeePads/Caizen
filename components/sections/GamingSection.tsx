'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gamepad2,
  Library,
  Link2,
  ListChecks,
  ListFilter,
  MoreVertical,
  Pencil,
  Plus,
  Star,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import type { Game, GameGuide, GameStatus, Transaction } from '@/lib/types';
import { buildLinkedRecordTransactionMap } from '@/lib/transactions';
import { navigateToTransaction } from '@/lib/balance/linked-record';
import { formatPHP } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { SectionTabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';
import { FilterBar, FilterChip } from '@/components/ui/collection-controls';
import { SearchField } from '@/components/ui/search-field';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';
import GameModal from '@/components/modals/GameModal';
import GuideModal from '@/components/modals/GuideModal';
import GuideViewModal from '@/components/modals/GuideViewModal';
import GameQuickUpdateModal, { type GameQuickUpdateMode } from '@/components/modals/GameQuickUpdateModal';
import GameWishlistWorkspace from '@/components/games/GameWishlistWorkspace';
import GameDiscoverWorkspace from '@/components/games/GameDiscoverWorkspace';
import type { RawgGameResult } from '@/lib/games/rawg';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { PaginationControls } from '@/components/ui/section-kit';
import { ResilientImage } from '@/components/media/ResilientImage';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import { deriveGameRoutineActivity } from '@/lib/games/routine-activity';
import { deriveGameTaskProjection, getGameTaskNavigationDetail, type GameTaskProjection, type GameTaskProjectionRow } from '@/lib/games/task-activity';
import { getGameIdFromLifeHubRecord } from '@/lib/lifehub/linked-context';
import { formatDate } from '@/lib/lifehub/date-utils';

type MainTab = 'library' | 'wishlist' | 'discover' | 'guides';
type StatusFilter = 'all' | GameStatus;
type SortMode = 'recent' | 'status' | 'title';

const GAME_PAGE_SIZE = 12;

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'playing', label: 'Playing' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'upcoming', label: 'Upcoming' },
];

function statusLabel(value: string) {
  if (value === 'active') return 'Playing';
  return value.replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function guideCategoryLabel(value: string) {
  const labels: Record<string, string> = {
    team_lineup: 'Team / Lineup',
    boss_raid: 'Boss / Raid',
    build: 'Build',
    farming: 'Farming Route',
    progression: 'Progression',
    tips: 'Tips',
    checklist: 'Checklist',
    other: 'Quick note',
    builds: 'Build',
    lineups: 'Team / Lineup',
    strategy: 'Strategy',
    settings: 'Settings',
    walkthrough: 'Walkthrough',
    general: 'General',
  };
  return labels[value] || 'Guide';
}

export default function GamingSection({
  androidPresentation = false,
  requestedRecordId,
  requestedRecordType,
  requestedRecordSignal = 0,
  requestedProfileId,
  onRequestedRecordConsumed,
}: {
  androidPresentation?: boolean;
  requestedRecordId?: string;
  requestedRecordType?: string;
  requestedRecordSignal?: number;
  requestedProfileId?: string;
  onRequestedRecordConsumed?: (signal: number) => void;
}) {
  const {
    games,
    gameGuides,
    transactions,
    dailyChecklistItems,
    productivityItems,
    deleteGame,
    deleteGameGuide,
    updateGame,
    isHydrated,
    currentProfileId,
  } = useAppContext();
  // Derived, not stored - see Transaction.linkedRecord in lib/types.ts.
  const transactionByGameId = useMemo(
    () => buildLinkedRecordTransactionMap(transactions, 'games'),
    [transactions],
  );
  const consumedRequestSignalRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<MainTab>('library');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [gamePage, setGamePage] = useState(1);
  const [addGameOpen, setAddGameOpen] = useState(false);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [catalogGame, setCatalogGame] = useState<RawgGameResult | null>(null);
  const [newGameStatus, setNewGameStatus] = useState<'backlog' | 'wishlist'>('backlog');
  const [libraryExpanded, setLibraryExpanded] = useState(false);

  const [guideOpen, setGuideOpen] = useState(false);
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null);
  const [initialGuideGameId, setInitialGuideGameId] = useState<string | null>(null);
  const [viewGuideId, setViewGuideId] = useState<string | null>(null);
  const [guideFilterGameId, setGuideFilterGameId] = useState<string | null>(null);
  const [quickUpdate, setQuickUpdate] = useState<{ game: Game; mode: GameQuickUpdateMode } | null>(null);

  const [gameToDelete, setGameToDelete] = useState<Game | null>(null);
  const [guideToDelete, setGuideToDelete] = useState<GameGuide | null>(null);

  const visibleGames = useMemo(
    () => games.filter(game => !(game as any).hidden),
    [games],
  );

  const libraryGames = useMemo(
    () => visibleGames.filter(game => !['wishlist', 'upcoming'].includes(game.status)),
    [visibleGames],
  );

  const filteredGames = useMemo(() => {
    const statusRank: Record<string, number> = {
      playing: 1,
      backlog: 2,
      paused: 3,
      completed: 4,
      wishlist: 5,
      upcoming: 6,
      dropped: 7,
      active: 1,
    };

    return [...libraryGames]
      .filter(game =>
        statusFilter === 'all' ||
        (statusFilter === 'playing'
          ? ['playing', 'active'].includes(game.status)
          : game.status === statusFilter),
      )
      .filter(game => game.title.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => {
        if (sortMode === 'title') return a.title.localeCompare(b.title);
        if (sortMode === 'status') return (statusRank[a.status] || 99) - (statusRank[b.status] || 99);
        return new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime();
      });
  }, [libraryGames, search, sortMode, statusFilter]);

  const gameTotalPages = Math.max(1, Math.ceil(filteredGames.length / GAME_PAGE_SIZE));
  const visibleLibraryGames = filteredGames.slice((gamePage - 1) * GAME_PAGE_SIZE, gamePage * GAME_PAGE_SIZE);
  const collectionRevealRef = useCollectionReveal(
    visibleLibraryGames.map(game => game.id),
    [currentProfileId, activeTab, statusFilter, sortMode, gamePage],
  );

  useEffect(() => {
    setGamePage(1);
  }, [search, sortMode, statusFilter]);

  useEffect(() => {
    if (gamePage > gameTotalPages) setGamePage(gameTotalPages);
  }, [gamePage, gameTotalPages]);

  const currentlyPlaying = visibleGames.filter(game => ['playing', 'active'].includes(game.status)).length;
  const linkedRoutineCountForDelete = gameToDelete
    ? dailyChecklistItems.filter(item => getGameIdFromLifeHubRecord(item) === gameToDelete.id).length
    : 0;
  const linkedTaskCountForDelete = gameToDelete
    ? productivityItems.filter(item => item.type === 'task' && getGameIdFromLifeHubRecord(item) === gameToDelete.id).length
    : 0;
  const openNewGuide = (gameId?: string) => {
    setActiveTab('guides');
    setEditingGuideId(null);
    setInitialGuideGameId(gameId || null);
    setGuideFilterGameId(gameId || null);
    setGuideOpen(true);
  };

  const openGameEditor = (game: Game) => {
    setActiveTab('library');
    setLibraryExpanded(true);
    setEditingGameId(game.id);
  };

  const openGuidesForGame = (gameId: string) => {
    setActiveTab('guides');
    setGuideFilterGameId(gameId);
    setGuideOpen(false);
    setViewGuideId(null);
  };

  const openGuideForGame = (game: Game) => {
    const guides = gameGuides.filter(guide => guide.gameId === game.id);
    const incompleteGuide = guides.find(guide =>
      guide.sections.some(section => section.items.some(item =>
        (!(item as any).kind || (item as any).kind === 'checklist') && !item.completed,
      )),
    );
    if (!guides.length) {
      openNewGuide(game.id);
    } else if (incompleteGuide) {
      setActiveTab('guides');
      setViewGuideId(incompleteGuide.id);
      setGuideOpen(false);
    } else {
      openGuidesForGame(game.id);
    }
  };

  const saveQuickUpdate = (updates: Partial<Game>) => {
    if (!quickUpdate) return;
    updateGame(quickUpdate.game.id, updates);
    setQuickUpdate(null);
    toast({
      title: 'Saved locally',
      description: `${quickUpdate.game.title} was updated in this profile.`,
    });
  };

  const openRoutine = (routineId: string) => {
    window.dispatchEvent(new CustomEvent('life-manager:navigate', {
      detail: { section: 'lifehub', feature: 'routine', recordId: routineId },
    }));
  };

  const openTask = (taskId: string) => {
    window.dispatchEvent(new CustomEvent('life-manager:navigate', {
      detail: getGameTaskNavigationDetail(taskId),
    }));
  };

  useEffect(() => {
    if (
      !requestedRecordSignal ||
      !isHydrated ||
      !currentProfileId ||
      requestedProfileId !== currentProfileId ||
      consumedRequestSignalRef.current === requestedRecordSignal
    ) return;
    consumedRequestSignalRef.current = requestedRecordSignal;
    if (requestedRecordType === 'add-game') {
      setCatalogGame(null);
      setAddGameOpen(true);
      onRequestedRecordConsumed?.(requestedRecordSignal);
      return;
    }
    if (requestedRecordType === 'wishlist') {
      setActiveTab('wishlist');
      onRequestedRecordConsumed?.(requestedRecordSignal);
      return;
    }
    if (requestedRecordType === 'discover' || requestedRecordType === 'games') {
      setActiveTab(requestedRecordType === 'discover' ? 'discover' : 'library');
      onRequestedRecordConsumed?.(requestedRecordSignal);
      return;
    }
    if (requestedRecordType === 'game') {
      if (!requestedRecordId) {
        onRequestedRecordConsumed?.(requestedRecordSignal);
        return;
      }
      if (games.some(game => game.id === requestedRecordId)) {
        setActiveTab('library');
        setLibraryExpanded(true);
        setEditingGameId(requestedRecordId);
      }
      onRequestedRecordConsumed?.(requestedRecordSignal);
      return;
    }
    if (requestedRecordType === 'game-guide' && gameGuides.some(guide => guide.id === requestedRecordId)) {
      setActiveTab('guides');
      setViewGuideId(requestedRecordId!);
    }
    onRequestedRecordConsumed?.(requestedRecordSignal);
  }, [currentProfileId, gameGuides, games, isHydrated, onRequestedRecordConsumed, requestedProfileId, requestedRecordId, requestedRecordSignal, requestedRecordType]);

  return (
    <div
      className={androidPresentation ? 'android-media-section space-y-4' : 'workspace-wide caizen-media-page caizen-games-page space-y-4 lg:space-y-5'}
      data-android-screen={androidPresentation ? 'games' : undefined}
    >
      <header className="border-b border-border/50 px-1 pb-4 sm:px-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-page-title">Games</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Track what you're playing, plan what comes next, and keep your guides organized.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={() => openNewGuide()} className="min-h-11 rounded-xl text-muted-foreground">
                <BookOpen className="mr-2 h-4 w-4" /> New Guide
              </Button>
              <Button type="button" onClick={() => setAddGameOpen(true)} className="min-h-11 rounded-xl">
                <Plus className="mr-2 h-4 w-4" /> Add Game
              </Button>
            </div>
          </div>
      </header>

      <SectionTabs mode="panels" value={activeTab} onValueChange={value => setActiveTab(value as MainTab)} className="games-tabs">
        <TabsList aria-label="Games views" className={`module-sticky-nav w-full justify-start overflow-x-auto py-1 ${androidPresentation ? 'android-games-tabs-scroll' : ''}`} role="tablist">
          <TabsTrigger value="library" className="caizen-tab min-h-11 flex-none gap-2 px-4 text-nav-label">
            Library
          </TabsTrigger>
          <TabsTrigger value="wishlist" className="caizen-tab min-h-11 flex-none gap-2 px-4 text-nav-label">
            Wishlist
          </TabsTrigger>
          <TabsTrigger value="discover" className="caizen-tab min-h-11 flex-none gap-2 px-4 text-nav-label">
            Discover
          </TabsTrigger>
          <TabsTrigger value="guides" className="caizen-tab min-h-11 flex-none gap-2 px-4 text-nav-label">
            Guides
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wishlist" className="space-y-5">
          <GameWishlistWorkspace
            games={visibleGames}
            onEdit={openGameEditor}
            onUpdateStatus={(game, nextStatus) => {
              updateGame(game.id, { status: nextStatus });
              toast({ title: nextStatus === 'playing' ? 'Now playing' : 'Added to library', description: game.title });
            }}
            onDiscover={() => setActiveTab('discover')}
            onAddManual={() => { setCatalogGame(null); setNewGameStatus('wishlist'); setAddGameOpen(true); }}
          />
        </TabsContent>

        <TabsContent value="discover" className="space-y-5">
          <GameDiscoverWorkspace
            androidPresentation={androidPresentation}
            games={visibleGames}
            profileId={currentProfileId}
            onAddCatalog={(result, status) => { setCatalogGame(result); setNewGameStatus(status); setAddGameOpen(true); }}
            onOpenGame={openGameEditor}
            onUpdateStatus={(game, status) => {
              updateGame(game.id, { status });
              toast({ title: status === 'playing' ? 'Now playing' : 'Added to library', description: game.title });
            }}
            onAddManual={() => { setCatalogGame(null); setNewGameStatus('backlog'); setAddGameOpen(true); }}
          />
        </TabsContent>

      <TabsContent value="library" className="space-y-5">
          <ContinuePlaying
            games={visibleGames}
            guides={gameGuides}
            routines={dailyChecklistItems}
            tasks={productivityItems}
            onQuickUpdate={(game, mode) => setQuickUpdate({ game, mode })}
            onGuide={openGuideForGame}
            onOpenRoutine={openRoutine}
            onOpenTask={openTask}
            onAddGuide={openNewGuide}
            onBrowseLibrary={() => setLibraryExpanded(true)}
          />

          <div className="border-b border-border/50 px-1 pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-section-title">Game Library · {libraryGames.length}</h2><p className="mt-1 text-sm text-muted-foreground">Backlog, paused, completed, dropped, and other tracked games.</p></div>
              <button type="button" onClick={() => setLibraryExpanded(current => !current)} aria-expanded={libraryExpanded} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-primary hover:bg-muted">{libraryExpanded ? 'Collapse library' : 'Browse library'}</button>
            </div>
          </div>

          {libraryExpanded && libraryGames.length ? <div className="toolbar-surface p-3">
            <FilterBar label="Game status filters">
              {statusOptions.map(option => (
                <FilterChip
                  key={option.value}
                  selected={statusFilter === option.value}
                  onSelectedChange={() => setStatusFilter(option.value)}
                  className="min-h-11 rounded-xl px-3 py-2 text-sm font-medium"
                >
                  {option.label}
                </FilterChip>
              ))}
            </FilterBar>

            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <SearchField
                wrapperClassName="md:max-w-lg"
                aria-label="Search games"
                value={search}
                onChange={setSearch}
                placeholder="Search your library…"
              />
              <AndroidAdaptiveSelect
                label="Sort games"
                value={sortMode}
                onChange={value => setSortMode(value as SortMode)}
                className="control-input"
                options={[
                  { value: 'recent', label: 'Recently added' },
                  { value: 'status', label: 'Status' },
                  { value: 'title', label: 'Title A–Z' },
                ]}
              />
            </div>
          </div> : null}

          {!libraryGames.length ? (
            <EmptyPanel icon={Gamepad2} title="No games yet" description="Add a game manually, then mark it Playing when you want it in Continue Playing." actionLabel="Add Game" onAction={() => setAddGameOpen(true)} />
          ) : libraryExpanded && !filteredGames.length ? (
            <EmptyPanel icon={ListFilter} title="No games match" description="Try another status or search term." actionLabel="Clear filters" onAction={() => { setStatusFilter('all'); setSearch(''); }} />
          ) : libraryExpanded ? (
            <div ref={collectionRevealRef} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleLibraryGames.map(game => (
                <GameLibraryCard
                  key={game.id}
                  game={game}
                  linkedTransaction={transactionByGameId.get(game.id)}
                  guideCount={gameGuides.filter(guide => guide.gameId === game.id).length}
                  relatedTaskCount={deriveGameTaskProjection(game.id, productivityItems).linkedTaskCount}
                  onOpenTask={() => {
                    const firstTask = deriveGameTaskProjection(game.id, productivityItems).tasks[0];
                    if (firstTask) openTask(firstTask.taskId);
                  }}
                  onEdit={() => setEditingGameId(game.id)}
                  onDelete={() => setGameToDelete(game)}
                  onGuide={() => openGuidesForGame(game.id)}
                  onAddGuide={() => openNewGuide(game.id)}
                  androidPresentation={androidPresentation}
                />
              ))}
            </div>
          ) : null}
          {libraryExpanded && filteredGames.length > GAME_PAGE_SIZE ? <PaginationControls page={gamePage} totalPages={gameTotalPages} totalItems={filteredGames.length} pageSize={GAME_PAGE_SIZE} onPageChange={setGamePage} /> : null}
          <div className="games-secondary-metrics grid grid-cols-2 gap-3">
            <Metric label="Playing" value={currentlyPlaying} />
            <Metric label="Library" value={libraryGames.length} />
          </div>
        </TabsContent>

      <TabsContent value="guides" className="space-y-5">
      {guideOpen ? (
        <GuideModal
          embedded
          isOpen
          guideId={editingGuideId}
          initialGameId={initialGuideGameId}
          onClose={() => {
            setGuideOpen(false);
            setEditingGuideId(null);
            setInitialGuideGameId(null);
          }}
        />
      ) : viewGuideId ? (
        <GuideViewModal
          embedded
          isOpen
          guideId={viewGuideId}
          onClose={() => setViewGuideId(null)}
          onEdit={() => {
            setEditingGuideId(viewGuideId);
            setViewGuideId(null);
            setGuideOpen(true);
          }}
        />
      ) : (
        <GuidesWorkspace
          games={visibleGames}
          guides={gameGuides}
          initialGameId={guideFilterGameId}
          onAdd={() => openNewGuide()}
          onView={setViewGuideId}
          onEdit={guideId => { setEditingGuideId(guideId); setInitialGuideGameId(null); setGuideOpen(true); }}
          onDelete={setGuideToDelete}
        />
      )}
      </TabsContent>
      </SectionTabs>

      <GameModal
        isOpen={addGameOpen}
        catalogGame={catalogGame}
        initialStatus={newGameStatus}
        onClose={() => { setAddGameOpen(false); setCatalogGame(null); setNewGameStatus('backlog'); }}
        onOpenExistingGame={id => { setAddGameOpen(false); setCatalogGame(null); setNewGameStatus('backlog'); setActiveTab('library'); setLibraryExpanded(true); setEditingGameId(id); }}
      />

      {editingGameId ? (
        <GameModal isOpen gameId={editingGameId} onClose={() => setEditingGameId(null)} />
      ) : null}

      {quickUpdate ? (
        <GameQuickUpdateModal
          game={quickUpdate.game}
          mode={quickUpdate.mode}
          onSave={saveQuickUpdate}
          onClose={() => setQuickUpdate(null)}
        />
      ) : null}

      <ConfirmDialog
        isOpen={Boolean(gameToDelete)}
        title="Delete game?"
        message={`Permanently delete "${gameToDelete?.title || 'this game'}" from this profile? It will not appear in Recently Deleted. ${linkedRoutineCountForDelete} linked routine${linkedRoutineCountForDelete === 1 ? '' : 's'} and ${linkedTaskCountForDelete} linked task${linkedTaskCountForDelete === 1 ? '' : 's'} will be unlinked. Existing guides will remain.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onCancel={() => setGameToDelete(null)}
        onConfirm={() => { if (gameToDelete) deleteGame(gameToDelete.id); setGameToDelete(null); }}
      />

      <ConfirmDialog
        isOpen={Boolean(guideToDelete)}
        title="Delete guide?"
        message={`Permanently delete "${guideToDelete?.title || 'this guide'}" from this profile? Guides do not appear in Recently Deleted.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onCancel={() => setGuideToDelete(null)}
        onConfirm={() => { if (guideToDelete) deleteGameGuide(guideToDelete.id); setGuideToDelete(null); }}
      />

    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 px-1 py-3">
      <p className="text-label text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}

function ContinuePlaying({
  games,
  guides,
  routines,
  tasks,
  onQuickUpdate,
  onGuide,
  onAddGuide,
  onOpenRoutine,
  onOpenTask,
  onBrowseLibrary,
}: {
  games: Game[];
  guides: GameGuide[];
  routines: ReturnType<typeof useAppContext>['dailyChecklistItems'];
  tasks: ReturnType<typeof useAppContext>['productivityItems'];
  onQuickUpdate: (game: Game, mode: GameQuickUpdateMode) => void;
  onGuide: (game: Game) => void;
  onAddGuide: (gameId: string) => void;
  onOpenRoutine: (routineId: string) => void;
  onOpenTask: (taskId: string) => void;
  onBrowseLibrary: () => void;
}) {
  const playingGames = games.filter(game => ['playing', 'active'].includes(game.status));
  if (!playingGames.length) return (
    <section className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-5" aria-labelledby="continue-playing-title">
      <h2 id="continue-playing-title" className="text-section-title">No games in progress</h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose a game from your Library when you're ready to play.</p>
      <button type="button" onClick={onBrowseLibrary} className="mt-4 min-h-11 rounded-xl border border-border/60 px-4 text-xs font-black text-primary hover:bg-muted">Browse Library</button>
    </section>
  );

  return (
    <section className="rounded-[2rem] border border-border/55 bg-card/65 p-4 sm:p-5" aria-labelledby="continue-playing-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="continue-playing-title" className="text-section-title">Continue Playing</h2>
          <p className="mt-1 text-sm text-muted-foreground">Keep the next useful note, guide, or routine close to the game.</p>
        </div>
        <span className="text-xs font-bold text-muted-foreground">{playingGames.length} active game{playingGames.length === 1 ? '' : 's'}</span>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {playingGames.map(game => {
          const gameGuides = guides.filter(guide => guide.gameId === game.id);
          const incompleteGuide = gameGuides.find(guide => guide.sections.some(section => section.items.some(item => (!(item as any).kind || (item as any).kind === 'checklist') && !item.completed)));
          const activity = deriveGameRoutineActivity(game.id, routines);
          const taskProjection = deriveGameTaskProjection(game.id, tasks);
          const guideActionLabel = !gameGuides.length ? 'Add guide' : incompleteGuide ? 'Continue guide' : 'Open guide';

          return (
            <article key={game.id} className="overflow-hidden rounded-2xl border border-border/60 bg-card/85">
              <div className="group relative aspect-video overflow-hidden bg-muted/50">
                {game.image ? <ResilientImage src={game.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" fallback={<div className="grid h-full place-items-center"><Gamepad2 className="size-10 text-muted-foreground/40" /></div>} /> : <div className="grid h-full place-items-center"><Gamepad2 className="size-10 text-muted-foreground/40" /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white/85">{game.platform}</p>
                    <OverflowTooltip text={game.title} mode="clamped"><h3 className="mt-1 line-clamp-2 text-xl font-black leading-tight sm:text-2xl">{game.title}</h3></OverflowTooltip>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-xs font-semibold text-white">{statusLabel(game.status)}</span>
                </div>
              </div>

              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-muted-foreground">{Number(game.hoursPlayed) > 0 ? `${game.hoursPlayed}h played` : 'Playtime not logged'}<span className="mx-1.5">·</span>{gameGuides.length ? `${gameGuides.length} guide${gameGuides.length === 1 ? '' : 's'}${incompleteGuide ? ' · in progress' : ''}` : 'No guide yet'}</p>
                  {activity.pendingToday > 0 ? <button type="button" onClick={() => { const due = activity.routines.find(routine => routine.state === 'due'); if (due) onOpenRoutine(due.routineId); }} className="min-h-11 rounded-lg bg-primary/8 px-2.5 text-left text-xs font-bold text-primary hover:bg-primary/12">Routine due today</button> : null}
                </div>

                {(activity.linkedRoutineCount || taskProjection.linkedTaskCount) ? (
                  <details className="group/links rounded-xl border border-border/45 bg-background/30 px-3">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-muted-foreground [&::-webkit-details-marker]:hidden">
                      <span>Life Hub links</span>
                      <span>{[activity.linkedRoutineCount ? `${activity.linkedRoutineCount} routine${activity.linkedRoutineCount === 1 ? '' : 's'}` : '', taskProjection.linkedTaskCount ? `${taskProjection.linkedTaskCount} task${taskProjection.linkedTaskCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</span>
                    </summary>
                    <div className="-mx-3 border-t border-border/40 px-3 pb-2">
                      {activity.linkedRoutineCount ? (
                        <div className="py-2" aria-label={`${game.title} routine activity`}>
                          <div className="flex items-center justify-between gap-3"><p className="text-label text-muted-foreground">Routines</p><span className="text-xs font-bold text-muted-foreground">{activity.completedThisMonth} this month</span></div>
                          <div className="mt-1 space-y-1">
                            {activity.routines.slice(0, 4).map(routine => {
                              const stateLabel = routine.state === 'due' ? 'Due today' : routine.state === 'missed' ? 'Missed' : routine.state === 'completed' ? 'Completed' : routine.state === 'skipped' ? 'Skipped' : routine.state === 'paused' ? 'Paused' : routine.nextDueDate ? `Next ${formatDate(routine.nextDueDate)}` : 'Not due';
                              return <button key={routine.routineId} type="button" onClick={() => onOpenRoutine(routine.routineId)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-muted/60">{routine.state === 'completed' ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> : routine.state === 'paused' ? <Clock3 className="size-4 shrink-0 text-muted-foreground" /> : <ListChecks className="size-4 shrink-0 text-primary" />}<OverflowTooltip text={routine.title}><span className="min-w-0 flex-1 truncate font-bold">{routine.title}</span></OverflowTooltip><span className="shrink-0 text-muted-foreground">{stateLabel}</span></button>;
                            })}
                          </div>
                          {activity.linkedRoutineCount > 4 && activity.routines[0] ? <button type="button" onClick={() => onOpenRoutine(activity.routines[0].routineId)} className="min-h-11 text-xs font-black text-primary hover:underline">Open in Life Hub · {activity.linkedRoutineCount - 4} more</button> : null}
                        </div>
                      ) : null}
                      {taskProjection.linkedTaskCount ? <RelatedTaskProjection gameTitle={game.title} projection={taskProjection} onOpenTask={onOpenTask} /> : null}
                    </div>
                  </details>
                ) : null}

                <div className="flex items-center gap-2 border-t border-border/45 pt-3">
                  <Button type="button" onClick={() => (incompleteGuide ? onGuide(game) : gameGuides.length ? onGuide(game) : onAddGuide(game.id))} className="min-h-11 flex-1 rounded-xl text-xs font-black"><BookOpen className="mr-2 size-4" />{guideActionLabel}</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><button type="button" aria-label={`More actions for ${game.title}`} className="grid size-11 shrink-0 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MoreVertical className="size-4" /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onSelect={() => onQuickUpdate(game, 'status')}>Update status</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onQuickUpdate(game, 'playtime')}>Add playtime</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onQuickUpdate(game, 'note')}><StickyNote className="mr-2 size-4" /> Quick note</DropdownMenuItem>
                      {gameGuides.length ? <DropdownMenuItem onSelect={() => onGuide(game)}>Open guides</DropdownMenuItem> : null}
                      <DropdownMenuItem onSelect={() => onAddGuide(game.id)}>Add guide</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RelatedTaskProjection({
  gameTitle,
  projection,
  onOpenTask,
}: {
  gameTitle: string;
  projection: GameTaskProjection;
  onOpenTask: (taskId: string) => void;
}) {
  return (
    <div className="border-t border-border/45 px-3 py-3 sm:px-4" aria-label={`${gameTitle} related tasks`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-label text-muted-foreground">Related tasks</p>
        <span className="text-xs font-bold text-muted-foreground">{projection.linkedTaskCount}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {projection.tasks.map(task => (
          <TaskProjectionRow key={task.taskId} task={task} onOpen={() => onOpenTask(task.taskId)} />
        ))}
      </div>
      {projection.linkedTaskCount > projection.tasks.length && projection.tasks[0] ? (
        <button type="button" onClick={() => onOpenTask(projection.tasks[0].taskId)} className="mt-2 min-h-11 text-xs font-black text-primary hover:underline">
          Open in Life Hub · {projection.linkedTaskCount - projection.tasks.length} more
        </button>
      ) : null}
    </div>
  );
}

function TaskProjectionRow({ task, onOpen }: { task: GameTaskProjectionRow; onOpen: () => void }) {
  const statusLabel = task.status === 'in-progress'
    ? 'In progress'
    : task.status === 'deferred'
      ? 'Deferred'
      : task.status === 'failed'
        ? 'Not completed'
        : task.status === 'dropped'
          ? 'Dropped'
          : task.state === 'completed'
            ? 'Completed'
            : 'Pending';
  const dueLabel = task.dueState === 'overdue'
    ? 'Overdue'
    : task.dueState === 'due-today'
      ? 'Due today'
      : task.deadline
        ? formatDate(task.deadline)
        : undefined;

  return (
    <button type="button" onClick={onOpen} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-xs hover:bg-muted/60" aria-label={`Open task ${task.title}`}>
      {task.state === 'completed' ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> : <ListChecks className="size-4 shrink-0 text-primary" />}
      <OverflowTooltip text={task.title}><span className="min-w-0 flex-1 truncate font-bold">{task.title}</span></OverflowTooltip>
      {task.priority !== 'normal' ? <span className="shrink-0 text-muted-foreground">{task.priority === 'critical' ? 'Urgent' : 'High'}</span> : null}
      <span className="shrink-0 text-muted-foreground">{statusLabel}</span>
      {dueLabel ? <span className={`shrink-0 ${task.dueState === 'overdue' ? 'font-black text-red-500' : 'text-muted-foreground'}`}>· {dueLabel}</span> : null}
    </button>
  );
}

function GameLibraryCard({
  game,
  linkedTransaction,
  guideCount,
  relatedTaskCount,
  onOpenTask,
  onEdit,
  onDelete,
  onGuide,
  onAddGuide,
  androidPresentation,
}: {
  game: Game;
  linkedTransaction?: Transaction;
  guideCount: number;
  relatedTaskCount: number;
  onOpenTask: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onGuide: () => void;
  onAddGuide: () => void;
  androidPresentation: boolean;
}) {
  const customMetric = ((game as any).customMetrics || []).find((metric: any) => metric.showOnCard);
  const genreLabel = game.genre ? statusLabel(game.genre) : null;
  const hasPlaytime = Number(game.hoursPlayed) > 0;
  const notesPreview = game.notes?.trim();
  const websiteUrl = normalizeExternalWebUrl(game.website);

  return (
    <article
      data-caizen-collection-item="true"
      data-caizen-interactive-record="true"
      className="group android-record-row overflow-hidden rounded-2xl border border-border/55 bg-card/75 transition-[border-color,box-shadow] duration-150 hover:border-primary/30"
      data-entry-row={androidPresentation ? 'true' : undefined}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted/45">
        {game.image ? <ResilientImage src={game.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" fallback={<div className="flex h-full items-center justify-center"><Gamepad2 className="h-12 w-12 text-muted-foreground/35" /></div>} /> : <div className="flex h-full items-center justify-center"><Gamepad2 className="h-12 w-12 text-muted-foreground/35" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <div className="flex items-center gap-2 text-xs font-medium text-white/85"><span>{game.platform}</span><span>•</span><span>{statusLabel(game.status)}</span>{game.favorite ? <Star className="h-3.5 w-3.5 fill-current text-amber-300" /> : null}</div>
          <OverflowTooltip text={game.title} mode="clamped"><h3 className="mt-1 line-clamp-2 text-xl font-black">{game.title}</h3></OverflowTooltip>
        </div>
      </div>

      <div className="p-4">
        {customMetric ? <SmallStat label={customMetric.label} value={customMetric.value} /> : null}

        {genreLabel || hasPlaytime ? (
          <div className={`${customMetric ? 'mt-3 border-t border-border/45 pt-3' : ''} flex items-center gap-2 text-xs font-bold text-muted-foreground`}>
            {genreLabel ? <span>{genreLabel}</span> : null}
            {genreLabel && hasPlaytime ? <span>•</span> : null}
            {hasPlaytime ? <span>{game.hoursPlayed}h played</span> : null}
          </div>
        ) : null}

        {notesPreview ? <details className="mt-2 rounded-lg px-1"><summary className="min-h-10 cursor-pointer text-xs font-bold text-muted-foreground">Game note</summary><p className="pb-2 text-xs leading-relaxed text-muted-foreground">{notesPreview}</p></details> : null}

        {relatedTaskCount ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/45 bg-background/35 px-3 py-2">
            <span className="text-xs font-bold text-muted-foreground">{relatedTaskCount} related task{relatedTaskCount === 1 ? '' : 's'}</span>
            <button type="button" onClick={onOpenTask} aria-label={`Open related tasks for ${game.title} in Life Hub`} className="min-h-10 shrink-0 rounded-lg px-2 text-xs font-black text-primary hover:bg-primary/5">Open in Life Hub</button>
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2 border-t border-border/45 pt-3">
          <button type="button" onClick={event => { event.stopPropagation(); (guideCount ? onGuide : onAddGuide)(); }} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary/8 px-3 py-2 text-xs font-black text-primary hover:bg-primary/12"><BookOpen className="h-4 w-4" /> {guideCount ? `${guideCount} Guides` : 'Add guide'}</button>
          {relatedTaskCount ? <button type="button" onClick={event => { event.stopPropagation(); onOpenTask(); }} className="min-h-11 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-muted">{relatedTaskCount} task{relatedTaskCount === 1 ? '' : 's'} · Life Hub</button> : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" onClick={event => event.stopPropagation()} className="grid size-11 shrink-0 place-items-center rounded-xl border border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`More actions for ${game.title}`}><MoreVertical className="size-4" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={onEdit}><Pencil className="mr-2 size-4" /> Edit game</DropdownMenuItem>
              {guideCount ? <DropdownMenuItem onSelect={onGuide}>Open guides</DropdownMenuItem> : null}
              <DropdownMenuItem onSelect={onAddGuide}>Add guide</DropdownMenuItem>
              {linkedTransaction ? <DropdownMenuItem onSelect={() => navigateToTransaction(linkedTransaction.id)}><Link2 className="mr-2 size-4" /> Transaction · {formatPHP(linkedTransaction.amount)}</DropdownMenuItem> : null}
              {websiteUrl ? <DropdownMenuItem onSelect={() => { void openExternalLink(websiteUrl).catch(() => toast({ title: 'Could not open link', description: 'Check the saved game website and try again.' })); }}><ExternalLink className="mr-2 size-4" /> Game website</DropdownMenuItem> : null}
              <DropdownMenuItem onSelect={onDelete} variant="destructive"><Trash2 className="mr-2 size-4" /> Delete game</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-background/50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-black">{value}</p></div>;
}

function GuidesWorkspace({
  games,
  guides,
  initialGameId,
  onAdd,
  onView,
  onEdit,
  onDelete,
}: {
  games: Game[];
  guides: GameGuide[];
  initialGameId?: string | null;
  onAdd: () => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (guide: GameGuide) => void;
}) {
  const [query, setQuery] = useState('');
  const [gameId, setGameId] = useState('all');
  const gameMap = new Map(games.map(game => [game.id, game]));
  useEffect(() => {
    setGameId(initialGameId || 'all');
  }, [initialGameId]);
  const filtered = guides.filter(guide => {
    const matchGame = gameId === 'all' || (gameId === 'general' ? !guide.gameId : guide.gameId === gameId);
    const haystack = `${guide.title} ${guide.description || ''} ${guide.category}`.toLowerCase();
    return matchGame && haystack.includes(query.toLowerCase());
  });

  if (!guides.length) return <EmptyPanel icon={BookOpen} title="No guides yet" description="Create a quick note or checklist for a game you want to remember." actionLabel="Create Guide" onAction={onAdd} />;

  return <section className="space-y-5"><div className="rounded-[2rem] border border-border/55 bg-card/65 p-4"><div className="grid gap-3 md:grid-cols-[1fr_240px_auto]"><SearchField aria-label="Search game guides" value={query} onChange={setQuery} placeholder="Search guides..." /><AndroidAdaptiveSelect label="Filter guides by game" value={gameId} onChange={setGameId} className="control-input" searchable={games.length > 8} options={[{ value: 'all', label: 'All games' }, { value: 'general', label: 'General guides' }, ...games.filter(game => guides.some(guide => guide.gameId === game.id)).map(game => ({ value: game.id, label: game.title }))]} /><Button type="button" onClick={onAdd} className="rounded-xl"><Plus className="mr-2 h-4 w-4" /> Add Guide</Button></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(guide => { const items = guide.sections.flatMap(section => section.items).filter(item => !(item as any).kind || (item as any).kind === 'checklist'); const done = items.filter(item => item.completed).length; return <article key={guide.id} className="overflow-hidden rounded-[1.6rem] border border-border/55 bg-card/70"><button type="button" onClick={() => onView(guide.id)} aria-label={`View guide ${guide.title}`} className="block w-full text-left"><div className="relative h-32 overflow-hidden bg-muted/45">{guide.image ? <img src={guide.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><BookOpen className="h-10 w-10 text-muted-foreground/35" /></div>}<div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" /><div className="absolute inset-x-0 bottom-0 p-4 text-white"><p className="text-xs font-medium text-white/85">{gameMap.get(guide.gameId || '')?.title || 'General guide'} · {guideCategoryLabel(guide.category)}</p><OverflowTooltip text={guide.title} mode="clamped"><h3 className="mt-1 line-clamp-2 text-lg font-black">{guide.title}</h3></OverflowTooltip></div></div><div className="p-4"><p className="line-clamp-2 text-sm text-muted-foreground">{guide.description || 'No description.'}</p><div className="mt-3 flex items-center justify-between text-xs font-bold"><span>{items.length ? `${done}/${items.length} checklist items` : 'Reference guide'}</span>{guide.favorite ? <Star className="h-4 w-4 fill-current text-amber-400" /> : null}</div></div></button><div className="flex gap-2 border-t border-border/45 p-2"><button type="button" onClick={() => onEdit(guide.id)} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /> Edit</button><button type="button" onClick={() => onDelete(guide)} aria-label={`Delete guide ${guide.title}`} className="min-h-11 min-w-11 rounded-xl p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div></article>; })}</div>{!filtered.length ? <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center"><p className="text-body-sm text-muted-foreground">{guides.length ? 'No guides match this search.' : 'No guides yet. Add notes or a checklist for your next session.'}</p><button type="button" onClick={() => { if (!guides.length) { onAdd(); return; } setQuery(''); setGameId('all'); }} className="mt-3 min-h-11 rounded-xl border border-border/60 px-3 text-xs font-black text-primary hover:bg-muted">{guides.length ? 'Clear filters' : 'Add guide'}</button></div> : null}</section>;
}

function EmptyPanel({ icon: Icon, title, description, actionLabel, onAction }: { icon: typeof Gamepad2; title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="rounded-[2rem] border border-dashed border-border/60 bg-card/40 px-6 py-16 text-center"><Icon className="mx-auto h-10 w-10 text-muted-foreground/45" /><h2 className="mt-4 text-xl font-black">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>{actionLabel && onAction ? <Button type="button" onClick={onAction} className="mt-5 rounded-xl">{actionLabel}</Button> : null}</div>;
}
