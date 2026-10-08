'use client';

import { useEffect, useRef, useState } from 'react';
import { Gamepad2, Loader2, Plus, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import type { Game } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { FilterBar, FilterChip } from '@/components/ui/collection-controls';
import { SearchField } from '@/components/ui/search-field';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';
import { AndroidAdaptiveSelect, CaizenBottomSheet } from '@/components/native/android-design';
import { DiscoverPreset, getRawgDiscoverGames, getRawgGenres, getRawgSearchGames, type RawgGenre, type RawgGameResult, type RawgSearchSort } from '@/lib/games/rawg';
import { readDiscoverCache, writeDiscoverCache } from '@/lib/entertainment/discover-cache';
import { exactRawgGameMatch, gamePlatformLabel, gameStatusLabel, possibleRawgGameMatch } from '@/lib/games/game-form';
import { ResilientImage } from '@/components/media/ResilientImage';
import GameCatalogCard from '@/components/games/GameCatalogCard';
import GamePreviewDialog from '@/components/games/GamePreviewDialog';
import GameWishlistReviewDialog from '@/components/games/GameWishlistReviewDialog';
import ConfirmDialog from '@/components/common/ConfirmDialog';

type DiscoverCategory = Exclude<DiscoverPreset, 'search' | 'genre' | 'upcoming'>;
type PlatformFilter = 'all' | 'pc' | 'mobile' | 'console';
type SortMode = 'preset' | 'newest';
type SearchSort = RawgSearchSort;
type ReleaseWindow = 'last-7' | 'last-30' | 'last-60' | 'last-90' | 'last-year' | 'last-3-years' | 'last-5-years' | 'all' | 'next-30' | 'next-90' | 'next-180' | 'next-6-months' | 'next-year';
type PendingAdd = { result: RawgGameResult; status: 'wishlist' | 'backlog'; possible: Game };

const CATEGORY_TABS: Array<{ preset: DiscoverCategory; label: string; title: string; description: string }> = [
  { preset: 'popular', label: 'Popular', title: 'Popular Games', description: 'A strong starting point for your next play.' },
  { preset: 'anticipated', label: 'Anticipated', title: 'Most Anticipated', description: 'Upcoming games already drawing attention.' },
  { preset: 'coming-soon', label: 'Coming Soon', title: 'Coming Soon', description: 'The next releases, ordered by date.' },
  { preset: 'top-rated', label: 'Top Rated', title: 'Top Rated', description: 'Highly rated games with a usable player score.' },
  { preset: 'critics', label: 'Critics', title: "Critics' Picks", description: 'Games with a strong Metacritic score.' },
  { preset: 'recently-released', label: 'Recent', title: 'Recently Released', description: 'New releases from the selected window.' },
];

const DEFAULT_RELEASE_WINDOWS: Record<DiscoverCategory, ReleaseWindow> = {
  popular: 'last-year',
  anticipated: 'next-year',
  'coming-soon': 'next-90',
  'top-rated': 'all',
  critics: 'all',
  'recently-released': 'last-60',
};

function platformOptions() {
  return [
    { value: 'all', label: 'All platforms' },
    { value: 'pc', label: 'PC' },
    { value: 'mobile', label: 'Mobile' },
    { value: 'console', label: 'Console' },
  ];
}

function normalizeSearchTerm(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function searchSortOptions() {
  return [
    { value: 'best-match', label: 'Best match' },
    { value: 'popular', label: 'Popular' },
    { value: 'top-rated', label: 'Top Rated' },
    { value: 'critics', label: 'Critics' },
    { value: 'newest', label: 'Newest' },
  ];
}

function releaseWindowOptions(preset: DiscoverCategory) {
  switch (preset) {
    case 'popular':
      return [
        { value: 'last-30', label: 'Last 30 days' },
        { value: 'last-90', label: 'Last 90 days' },
        { value: 'last-year', label: 'Last year' },
        { value: 'last-3-years', label: 'Last 3 years' },
        { value: 'all', label: 'All time' },
      ];
    case 'anticipated':
      return [
        { value: 'next-30', label: 'Next 30 days' },
        { value: 'next-90', label: 'Next 90 days' },
        { value: 'next-6-months', label: 'Next 6 months' },
        { value: 'next-year', label: 'Next year' },
      ];
    case 'coming-soon':
      return [
        { value: 'next-30', label: 'Next 30 days' },
        { value: 'next-90', label: 'Next 90 days' },
        { value: 'next-180', label: 'Next 180 days' },
      ];
    case 'top-rated':
    case 'critics':
      return [
        { value: 'last-year', label: 'Last year' },
        { value: 'last-3-years', label: 'Last 3 years' },
        { value: 'last-5-years', label: 'Last 5 years' },
        { value: 'all', label: 'All time' },
      ];
    case 'recently-released':
      return [
        { value: 'last-7', label: 'Last 7 days' },
        { value: 'last-30', label: 'Last 30 days' },
        { value: 'last-60', label: 'Last 60 days' },
        { value: 'last-90', label: 'Last 90 days' },
      ];
  }
}

function sortOptions(preset: DiscoverCategory) {
  return preset === 'popular'
    ? [{ value: 'preset', label: 'Popular' }, { value: 'newest', label: 'Newest' }]
    : [];
}

function contextLabel(preset: DiscoverCategory) {
  switch (preset) {
    case 'anticipated': return 'Upcoming order';
    case 'coming-soon': return 'Release date';
    case 'top-rated': return 'Top rated';
    case 'critics': return 'Metacritic';
    case 'recently-released': return 'Newest releases';
    default: return 'Popular';
  }
}

function searchCategoryLabel(preset: DiscoverCategory) {
  switch (preset) {
    case 'popular': return 'Popular matches';
    case 'anticipated': return 'Anticipated matches';
    case 'coming-soon': return 'Coming soon matches';
    case 'top-rated': return 'Top-rated matches';
    case 'critics': return "Critics' picks";
    case 'recently-released': return 'Recently released matches';
  }
}

function windowLabel(preset: DiscoverCategory, value: ReleaseWindow) {
  return releaseWindowOptions(preset).find(option => option.value === value)?.label || 'Selected window';
}

function SectionSkeleton() {
  return <div role="status" aria-label="Loading game catalog" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map(index => <div key={index} className="overflow-hidden rounded-2xl border border-border/45 bg-card/55"><div className="aspect-[16/10] animate-pulse bg-muted/70" /><div className="space-y-2 p-4"><div className="h-3 w-2/3 animate-pulse rounded bg-muted" /><div className="h-3 w-1/2 animate-pulse rounded bg-muted" /><div className="h-3 w-1/3 animate-pulse rounded bg-muted" /></div></div>)}</div>;
}

export default function GameDiscoverWorkspace({
  androidPresentation = false,
  games,
  profileId,
  onAddCatalog,
  onOpenGame,
  onUpdateStatus,
  onAddManual,
}: {
  androidPresentation?: boolean;
  games: Game[];
  profileId: string;
  onAddCatalog: (result: RawgGameResult, status: 'wishlist' | 'backlog') => void;
  onOpenGame: (game: Game) => void;
  onUpdateStatus: (game: Game, status: 'backlog' | 'playing') => void;
  onAddManual: () => void;
}) {
  const [activePreset, setActivePreset] = useState<DiscoverCategory>('popular');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [genreSlug, setGenreSlug] = useState('');
  const [releaseWindows, setReleaseWindows] = useState(DEFAULT_RELEASE_WINDOWS);
  const [sort, setSort] = useState<SortMode>('preset');
  const [searchSort, setSearchSort] = useState<SearchSort>('best-match');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RawgGameResult[]>([]);
  const [completedBrowseControls, setCompletedBrowseControls] = useState('');
  const collectionRevealRef = useCollectionReveal(
    results.map(result => result.rawgId),
    [profileId, completedBrowseControls],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usingCache, setUsingCache] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [genres, setGenres] = useState<RawgGenre[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [genreError, setGenreError] = useState('');
  const [genreRetryNonce, setGenreRetryNonce] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [preview, setPreview] = useState<RawgGameResult | null>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [wishlistReview, setWishlistReview] = useState<RawgGameResult | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const genreRequestGenerationRef = useRef(0);
  const requestGenerationRef = useRef(0);

  const releaseWindow = releaseWindows[activePreset];
  const trimmedQuery = query.trim();
  const isSearch = trimmedQuery.length >= 2;
  const isSearchPending = trimmedQuery.length === 1;
  const selectedGenre = genres.find(genre => genre.slug === genreSlug);
  const genreIntent = isSearch ? genres.find(genre => normalizeSearchTerm(genre.name) === normalizeSearchTerm(trimmedQuery)) : undefined;
  const category = CATEGORY_TABS.find(item => item.preset === activePreset) || CATEGORY_TABS[0];
  const currentSortOptions = isSearch ? searchSortOptions() : sortOptions(activePreset);
  const activeFilterCount = [
    platform !== 'all',
    Boolean(genreSlug),
    releaseWindow !== DEFAULT_RELEASE_WINDOWS[activePreset],
    isSearch ? searchSort !== 'best-match' : sort !== 'preset',
  ].filter(Boolean).length;

  useEffect(() => {
    const requestGeneration = ++genreRequestGenerationRef.current;
    const cached = readDiscoverCache<RawgGenre>(profileId, 'games:genre-list');
    if (cached?.results?.length) setGenres(cached.results);
    setGenreLoading(!cached?.results?.length);
    setGenreError('');
    const controller = new AbortController();
    void getRawgGenres(controller.signal)
      .then(pageValue => {
        if (controller.signal.aborted || requestGeneration !== genreRequestGenerationRef.current) return;
        setGenres(pageValue.results);
        writeDiscoverCache(profileId, 'games:genre-list', pageValue.results);
      })
      .catch(reason => {
        if (controller.signal.aborted || requestGeneration !== genreRequestGenerationRef.current) return;
        setGenreError(reason instanceof Error ? reason.message : 'Genres are temporarily unavailable.');
      })
      .finally(() => {
        if (!controller.signal.aborted && requestGeneration === genreRequestGenerationRef.current) setGenreLoading(false);
      });
    return () => {
      controller.abort();
      if (requestGeneration === genreRequestGenerationRef.current) genreRequestGenerationRef.current += 1;
    };
  }, [genreRetryNonce, profileId]);

  useEffect(() => {
    setPage(1);
    setResults([]);
    setLoading(false);
    setHasNextPage(false);
    setError('');
    setUsingCache(false);
  }, [activePreset, genreSlug, platform, query, releaseWindow, searchSort, sort]);

  useEffect(() => {
    const requestGeneration = ++requestGenerationRef.current;
    if (isSearchPending) {
      return () => {
        if (requestGeneration === requestGenerationRef.current) requestGenerationRef.current += 1;
      };
    }
    const controller = new AbortController();
    const cacheKey = isSearch
      ? `games:search:${normalizeSearchTerm(trimmedQuery)}:${activePreset}:${releaseWindow}:${platform}:${genreSlug}:${searchSort}:${page}`
      : `games:browse:${activePreset}:${platform}:${genreSlug}:${releaseWindow}:${sort}:${page}`;
    const cached = readDiscoverCache<RawgGameResult>(profileId, cacheKey);
    if (cached?.results?.length && requestGeneration === requestGenerationRef.current) {
      setResults(current => page === 1 ? cached.results : [...current, ...cached.results]);
      setCompletedBrowseControls(JSON.stringify([activePreset, platform, genreSlug, releaseWindow, isSearch ? searchSort : sort, page]));
      setUsingCache(true);
    }
    if (isSearch) setLoading(true);
    const timer = window.setTimeout(() => {
      if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return;
      setLoading(true);
      setError('');
      const request = isSearch
        ? getRawgSearchGames({ query: trimmedQuery, platform, genre: genreSlug || undefined, sort: searchSort, preset: activePreset, releaseWindow, page }, controller.signal)
        : getRawgDiscoverGames({
            preset: activePreset,
            platform,
            genre: genreSlug || undefined,
            releaseWindow,
            sort: activePreset === 'popular' && sort === 'newest' ? 'newest' : undefined,
            page,
            pageSize: 24,
          }, controller.signal);
      void request
        .then(pageValue => {
          if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return;
          setResults(current => page === 1 ? pageValue.results : [...current, ...pageValue.results]);
          setCompletedBrowseControls(JSON.stringify([activePreset, platform, genreSlug, releaseWindow, isSearch ? searchSort : sort, pageValue.page]));
          setHasNextPage(pageValue.hasNextPage);
          setUsingCache(false);
          setError('');
          writeDiscoverCache(profileId, cacheKey, pageValue.results);
        })
        .catch(reason => {
          if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return;
          setError(reason instanceof Error ? reason.message : 'This catalog is temporarily unavailable.');
        })
        .finally(() => {
          if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current) setLoading(false);
        });
    }, isSearch ? 400 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (requestGeneration === requestGenerationRef.current) requestGenerationRef.current += 1;
    };
  }, [activePreset, genreSlug, isSearch, isSearchPending, page, platform, profileId, releaseWindow, reloadNonce, searchSort, sort, trimmedQuery]);

  const selectPreset = (preset: DiscoverCategory) => {
    setActivePreset(preset);
    setSort('preset');
  };

  const selectReleaseWindow = (value: string) => {
    setReleaseWindows(current => ({ ...current, [activePreset]: value as ReleaseWindow }));
  };

  const browseGenreIntent = () => {
    if (!genreIntent) return;
    setGenreSlug(genreIntent.slug);
    setQuery('');
  };

  const retry = () => {
    setPage(1);
    setResults([]);
    setHasNextPage(false);
    setUsingCache(false);
    setReloadNonce(value => value + 1);
  };

  const continueAdd = (result: RawgGameResult, status: 'wishlist' | 'backlog') => {
    setPreview(null);
    if (status === 'wishlist') setWishlistReview(result);
    else onAddCatalog(result, status);
  };

  const handleAdd = (result: RawgGameResult, status: 'wishlist' | 'backlog') => {
    const exactMatch = exactRawgGameMatch(games, result);
    if (exactMatch) {
      setPreview(null);
      onOpenGame(exactMatch);
      return;
    }
    const possible = possibleRawgGameMatch(games, result);
    if (possible) {
      setPendingAdd({ result, status, possible });
      return;
    }
    continueAdd(result, status);
  };

  const previewExisting = preview ? exactRawgGameMatch(games, preview) : undefined;
  const previewPossible = preview && !previewExisting ? possibleRawgGameMatch(games, preview) : undefined;
  const resultTitle = isSearch ? `Search results for "${trimmedQuery}"` : selectedGenre ? `${category.title}: ${selectedGenre.name}` : category.title;
  const resultDescription = isSearch
    ? `${searchCategoryLabel(activePreset)}${selectedGenre ? ` filtered to ${selectedGenre.name}.` : ' across the available game catalog.'}`
    : selectedGenre ? `${category.description} Filtered to ${selectedGenre.name}.` : `${category.description} ${windowLabel(activePreset, releaseWindow)}.`;

  return (
    <section className={`${androidPresentation ? 'android-game-discover' : ''} space-y-5`} aria-labelledby="games-discover-title">
      <header className="rounded-2xl border border-border/55 bg-card/70 p-4 sm:p-6">
        <div>
          <h2 id="games-discover-title" className="text-3xl font-black tracking-tight">Discover</h2>
          <p className="mt-1 text-sm text-muted-foreground">Find something worth playing next.</p>
        </div>
        <SearchField
          aria-label="Search games"
          value={query}
          onChange={setQuery}
          maxLength={200}
          placeholder="Search the full catalog"
          wrapperClassName="mt-5 w-full max-w-3xl"
        />

        {genreIntent ? <div className="mt-3 flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/[0.05] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-primary">Catalog genre match</p><p className="mt-0.5 text-xs text-muted-foreground">This looks like the {genreIntent.name} genre.</p></div><button type="button" onClick={browseGenreIntent} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-xs font-black text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Browse {genreIntent.name} games</button></div> : null}

        <div className={`mt-5 overflow-x-auto border-b border-border/45 ${androidPresentation ? 'scrollbar-hide' : ''}`}>
          <FilterBar label="Discover categories" className="min-w-max gap-3">
            {CATEGORY_TABS.map(tab => <FilterChip
              key={tab.preset}
              selected={activePreset === tab.preset}
              onSelectedChange={() => selectPreset(tab.preset)}
              className="min-h-11 shrink-0 text-sm font-black"
            >{tab.label}</FilterChip>)}
          </FilterBar>
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen(androidPresentation ? true : !filtersOpen)}
          aria-expanded={filtersOpen}
          aria-controls="games-discover-filters"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border/45 bg-muted/25 px-3 text-sm font-black text-foreground hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="inline-flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</span>
          <span className="text-xs font-bold text-muted-foreground">{filtersOpen && !androidPresentation ? 'Hide filters' : 'Refine results'}</span>
        </button>

        <div id="games-discover-filters" className={`${androidPresentation ? 'hidden' : `mt-2 gap-2 rounded-xl border border-border/35 bg-muted/15 p-2 sm:grid-cols-2 lg:grid-cols-4 ${filtersOpen ? 'grid' : 'hidden'}`} md:mt-3`}>
          {currentSortOptions.length ? <AndroidAdaptiveSelect label={isSearch ? 'Sort search results' : 'Sort discover results'} value={isSearch ? searchSort : sort} onChange={value => isSearch ? setSearchSort(value as SearchSort) : setSort(value as SortMode)} className="control-input" options={currentSortOptions} /> : <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border/50 bg-background/35 px-3 text-xs font-bold text-muted-foreground"><SlidersHorizontal className="size-4 shrink-0" /> {contextLabel(activePreset)}</div>}
          <AndroidAdaptiveSelect label="Filter games by platform" value={platform} onChange={value => setPlatform(value as PlatformFilter)} className="control-input" options={platformOptions()} />
          <div className="relative">
            <AndroidAdaptiveSelect label="Filter games by genre" value={genreSlug} onChange={setGenreSlug} className="control-input" options={[{ value: '', label: 'All genres' }, ...genres.map(genre => ({ value: genre.slug, label: genre.name }))]} searchable={genres.length > 8} disabled={genreLoading && !genres.length} />
            {genreLoading ? <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
          </div>
          <AndroidAdaptiveSelect label="Filter by release window" value={releaseWindow} onChange={selectReleaseWindow} className="control-input" options={releaseWindowOptions(activePreset)} />
        </div>
        {androidPresentation ? (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Active game filters">
              {platform !== 'all' ? <button type="button" onClick={() => setPlatform('all')} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2 text-[11px] font-black text-primary" aria-label={`Remove ${platform} filter`}>{platformOptions().find(option => option.value === platform)?.label}<X className="size-3" /></button> : null}
              {genreSlug ? <button type="button" onClick={() => setGenreSlug('')} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2 text-[11px] font-black text-primary" aria-label="Remove genre filter">{selectedGenre?.name || 'Genre'}<X className="size-3" /></button> : null}
              {releaseWindow !== DEFAULT_RELEASE_WINDOWS[activePreset] ? <button type="button" onClick={() => setReleaseWindows(current => ({ ...current, [activePreset]: DEFAULT_RELEASE_WINDOWS[activePreset] }))} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2 text-[11px] font-black text-primary" aria-label="Remove release window filter">{windowLabel(activePreset, releaseWindow)}<X className="size-3" /></button> : null}
              {(isSearch ? searchSort !== 'best-match' : sort !== 'preset') ? <button type="button" onClick={() => isSearch ? setSearchSort('best-match') : setSort('preset')} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2 text-[11px] font-black text-primary" aria-label="Remove sort filter">{isSearch ? searchSortOptions().find(option => option.value === searchSort)?.label : 'Newest'}<X className="size-3" /></button> : null}
            </div>
            <CaizenBottomSheet open={filtersOpen} title="Filter games" description="Refine the catalog without leaving Discover." onClose={() => setFiltersOpen(false)} fullHeight>
              <div className="space-y-3" data-android-games-filters="true">
                <AndroidAdaptiveSelect label={isSearch ? 'Sort search results' : 'Sort discover results'} value={isSearch ? searchSort : sort} onChange={value => isSearch ? setSearchSort(value as SearchSort) : setSort(value as SortMode)} options={currentSortOptions.length ? currentSortOptions : [{ value: sort, label: contextLabel(activePreset) }]} />
                <AndroidAdaptiveSelect label="Platform" value={platform} onChange={value => setPlatform(value as PlatformFilter)} options={platformOptions()} />
                <AndroidAdaptiveSelect label="Genre" value={genreSlug} onChange={setGenreSlug} options={[{ value: '', label: 'All genres' }, ...genres.map(genre => ({ value: genre.slug, label: genre.name }))]} searchable={genres.length > 8} disabled={genreLoading && !genres.length} />
                <AndroidAdaptiveSelect label="Release window" value={releaseWindow} onChange={selectReleaseWindow} options={releaseWindowOptions(activePreset)} />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button type="button" onClick={() => { setPlatform('all'); setGenreSlug(''); setReleaseWindows(current => ({ ...current, [activePreset]: DEFAULT_RELEASE_WINDOWS[activePreset] })); setSort('preset'); setSearchSort('best-match'); }} className="min-h-11 rounded-xl border border-border/60 px-3 text-sm font-bold text-muted-foreground">Reset</button>
                  <button type="button" onClick={() => setFiltersOpen(false)} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-black text-primary-foreground">Show results</button>
                </div>
              </div>
            </CaizenBottomSheet>
          </>
        ) : null}
        {isSearchPending ? <p className="mt-3 text-xs font-bold text-muted-foreground">Enter at least two characters to search the full catalog.</p> : null}
        {genreError && !genres.length ? <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground"><span>Genres are temporarily unavailable. All genres remains available.</span><button type="button" onClick={() => setGenreRetryNonce(value => value + 1)} className="min-h-11 rounded-lg px-3 font-black text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Retry genres</button></div> : null}
      </header>

      <div id="games-discover-results" aria-live="polite" className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0"><h3 className="break-words text-xl font-black tracking-tight">{resultTitle}</h3><p className="mt-1 break-words text-sm text-muted-foreground">{resultDescription}</p></div>
          {loading && results.length ? <p role="status" className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Updating</p> : null}
        </div>

        {usingCache && results.length ? <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-muted-foreground"><span>Showing the last saved catalog while this view refreshes.</span><button type="button" onClick={retry} className="inline-flex min-h-11 shrink-0 items-center gap-1 font-black text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><RefreshCw className="size-3.5" /> Retry</button></div> : null}
        {error && results.length ? <div role="alert" className="flex flex-col items-start justify-between gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs sm:flex-row sm:items-center"><span className="break-words text-muted-foreground">Couldn’t refresh this catalog. {error}</span><button type="button" onClick={retry} disabled={loading} className="min-h-11 shrink-0 rounded-lg px-3 font-black text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Retry</button></div> : null}
        {loading && !results.length ? <SectionSkeleton /> : error && !results.length ? <UnavailablePanel message={error} onRetry={retry} onManual={onAddManual} /> : results.length ? <>
          <div ref={collectionRevealRef} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{results.map(result => <CatalogResultCard key={`${result.rawgId}-${result.title}`} result={result} games={games} androidPresentation={androidPresentation} onPreview={setPreview} onAdd={handleAdd} onOpenGame={onOpenGame} onUpdateStatus={onUpdateStatus} />)}</div>
          {loading ? <p role="status" className="flex items-center justify-center gap-2 py-3 text-xs font-bold text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading more games...</p> : null}
          {hasNextPage ? <div className="flex justify-center"><Button type="button" variant="outline" onClick={() => setPage(value => value + 1)} disabled={loading} className="min-h-11 rounded-xl">Load more</Button></div> : null}
        </> : isSearchPending ? <EmptyPanel title="Keep typing to search" message="Search starts after two characters." /> : <EmptyPanel title="No games found" message={isSearch ? 'Try a different title or clear the search.' : 'Try another filter or clear a filter.'} />}
      </div>

      {!preview ? <Attribution /> : null}
      {preview ? <GamePreviewDialog result={preview} existing={previewExisting} possibleMatch={previewPossible} onClose={() => setPreview(null)} onAddCatalog={handleAdd} onOpenGame={game => { setPreview(null); onOpenGame(game); }} onUpdateStatus={(game, status) => { onUpdateStatus(game, status); setPreview(null); }} /> : null}
      {wishlistReview ? <GameWishlistReviewDialog isOpen result={wishlistReview} onClose={() => setWishlistReview(null)} onOpenGame={game => { setWishlistReview(null); onOpenGame(game); }} /> : null}
      {pendingAdd ? <ConfirmDialog
        isOpen
        title="Possible duplicate"
        message={`"${pendingAdd.result.title}" may already exist in your Games.`}
        confirmText="Open existing"
        cancelText="Cancel"
        isDangerous={false}
        tone="warning"
        details={<DuplicateDetails match={pendingAdd.possible} onAddAnyway={() => { const next = pendingAdd; setPendingAdd(null); continueAdd(next.result, next.status); }} />}
        onCancel={() => setPendingAdd(null)}
        onConfirm={() => { const match = pendingAdd.possible; setPendingAdd(null); setPreview(null); onOpenGame(match); }}
      /> : null}
    </section>
  );
}

function CatalogResultCard({ result, games, androidPresentation, onPreview, onAdd, onOpenGame, onUpdateStatus }: { result: RawgGameResult; games: Game[]; androidPresentation: boolean; onPreview: (result: RawgGameResult) => void; onAdd: (result: RawgGameResult, status: 'wishlist' | 'backlog') => void; onOpenGame: (game: Game) => void; onUpdateStatus: (game: Game, status: 'backlog' | 'playing') => void }) {
  const existing = exactRawgGameMatch(games, result);
  const isWishlist = existing?.status === 'wishlist' || existing?.status === 'upcoming';
  const actionRowClass = androidPresentation ? 'grid gap-2' : 'grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center';
  const actionButtonClass = `min-h-12 w-full rounded-xl ${androidPresentation ? '' : 'sm:w-auto'}`;
  return <GameCatalogCard
    result={result}
    onSelect={() => onPreview(result)}
    footer={existing
      ? isWishlist
        ? <div className={actionRowClass}><span className="text-xs font-black text-primary">✓ In Wishlist</span><Button type="button" variant="outline" onClick={() => onUpdateStatus(existing, 'backlog')} className={actionButtonClass}>Add to Library</Button></div>
        : <div className={actionRowClass}><span className="text-xs font-black text-primary">In Library · {gameStatusLabel(existing.status)}</span><Button type="button" variant="outline" onClick={() => onOpenGame(existing)} className={actionButtonClass}>Open</Button></div>
      : <div className={androidPresentation ? 'grid gap-2' : 'grid gap-2 sm:grid-cols-2'}><Button type="button" variant="outline" onClick={() => onAdd(result, 'backlog')} className="min-h-12 w-full rounded-xl">Add to Library</Button><Button type="button" onClick={() => onAdd(result, 'wishlist')} className="min-h-12 w-full rounded-xl">Wishlist</Button></div>}
  />;
}

function EmptyPanel({ title, message }: { title: string; message: string }) {
  return <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-10 text-center"><Gamepad2 className="mx-auto size-9 text-muted-foreground/45" /><h3 className="mt-3 text-lg font-black">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{message}</p></div>;
}

function DuplicateDetails({ match, onAddAnyway }: { match: Game; onAddAnyway: () => void }) {
  const status = gameStatusLabel(match.status);
  const platform = gamePlatformLabel(match.platform);
  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border/50 bg-background/35 p-3">
        <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
          <ResilientImage src={match.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<Gamepad2 className="m-4 size-6 text-muted-foreground/40" aria-hidden="true" />} />
        </div>
        <div className="min-w-0">
          <p className="break-words text-sm font-black">{match.title}</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{status} · {platform}</p>
        </div>
      </div>
      <Button type="button" variant="outline" onClick={onAddAnyway} className="min-h-11 w-full rounded-xl">Add anyway</Button>
    </div>
  );
}

function UnavailablePanel({ message, onRetry, onManual }: { message: string; onRetry: () => void; onManual: () => void }) {
  return <div role="alert" className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-8 text-center"><Gamepad2 className="mx-auto size-9 text-muted-foreground/45" /><h3 className="mt-3 text-lg font-black">Discover is temporarily unavailable</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{message}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Button type="button" variant="outline" onClick={onRetry} className="min-h-11 rounded-xl"><RefreshCw className="mr-2 size-4" /> Retry</Button><Button type="button" onClick={onManual} className="min-h-11 rounded-xl"><Plus className="mr-2 size-4" /> Add manually</Button></div></div>;
}

function Attribution() {
  return <p className="pt-1 text-center text-xs text-muted-foreground">Game data and images from <a href="https://rawg.io" target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2">RAWG</a></p>;
}
