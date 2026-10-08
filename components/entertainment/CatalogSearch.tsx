'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Film,
  Loader2,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Tv,
  BookOpen,
  Clapperboard,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import CatalogResultCard from '@/components/entertainment/CatalogResultCard';
import DiscoverHome from '@/components/entertainment/DiscoverHome';
import DiscoverFilters from '@/components/entertainment/DiscoverFilters';
import EntertainmentSettings from '@/components/entertainment/EntertainmentSettings';
import {
  browseCatalog,
  getCatalogGenreOptions,
} from '@/lib/entertainment/catalog';
import type {
  CatalogBrowseFilters,
  CatalogBrowseRequest,
  DiscoverSectionKey,
  CatalogMediaType,
  CatalogSearchResult,
} from '@/lib/entertainment/types';
import {
  loadEntertainmentPreferences,
  saveEntertainmentPreferences,
  type EntertainmentPreferences,
} from '@/lib/entertainment/preferences';

const TYPES: Array<{
  value: CatalogMediaType;
  label: string;
  icon: typeof Tv;
  accent: string;
}> = [
  { value: 'anime', label: 'Anime', icon: Tv, accent: 'text-amber-300' },
  { value: 'manga', label: 'Manga', icon: BookOpen, accent: 'text-violet-300' },
  { value: 'series', label: 'Series', icon: Film, accent: 'text-sky-300' },
  { value: 'movie', label: 'Movies', icon: Clapperboard, accent: 'text-rose-300' },
];

function activeFilterCount(filters: CatalogBrowseFilters) {
  return [
    filters.year,
    filters.season,
    filters.formats?.length,
    filters.genres?.length,
    filters.releaseStatus,
    filters.originalLanguage,
    filters.minScore,
    filters.sort && filters.sort !== 'trending' ? filters.sort : undefined,
  ].filter(Boolean).length;
}

function hasBrowseFilters(filters: CatalogBrowseFilters) {
  return activeFilterCount(filters) > 0;
}

function removeFilter(
  filters: CatalogBrowseFilters,
  key: keyof CatalogBrowseFilters,
) {
  const next = { ...filters };
  delete next[key];
  return next;
}

export default function CatalogSearch({
  duplicateKeys,
  onSelect,
  profileId = 'default',
  androidPresentation = false,
}: {
  duplicateKeys: Set<string>;
  onSelect: (item: CatalogSearchResult) => void;
  profileId?: string;
  androidPresentation?: boolean;
}) {
  const [preferences, setPreferences] = useState<EntertainmentPreferences>(() =>
    loadEntertainmentPreferences(profileId),
  );
  const [type, setType] = useState<CatalogMediaType>(() =>
    loadEntertainmentPreferences(profileId).defaultCatalogType,
  );
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filters, setFilters] = useState<CatalogBrowseFilters>({ sort: 'trending' });
  const [browsePreset, setBrowsePreset] = useState<DiscoverSectionKey | undefined>(undefined);
  const [genres, setGenres] = useState<string[]>([]);
  const [genreError, setGenreError] = useState('');
  const [genreRetryNonce, setGenreRetryNonce] = useState(0);
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState<number | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const genreRequestGenerationRef = useRef(0);
  const requestGenerationRef = useRef(0);
  const loadMoreRequestRef = useRef<{ generation: number; controller: AbortController } | null>(null);
  const [completedBrowseControls, setCompletedBrowseControls] = useState('');
  const collectionRevealRef = useCollectionReveal(
    results.map(item => `${item.provider}:${item.externalId}`),
    [profileId, completedBrowseControls],
  );

  useEffect(() => {
    const next = loadEntertainmentPreferences(profileId);
    setPreferences(next);
    setType(next.defaultCatalogType);
  }, [profileId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 450);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const requestGeneration = ++genreRequestGenerationRef.current;
    const controller = new AbortController();
    setGenres([]);
    setGenreError('');
    getCatalogGenreOptions(type, controller.signal)
      .then(nextGenres => {
        if (controller.signal.aborted || requestGeneration !== genreRequestGenerationRef.current) return;
        setGenres(nextGenres);
      })
      .catch(caught => {
        if (controller.signal.aborted || requestGeneration !== genreRequestGenerationRef.current) return;
        setGenres([]);
        setGenreError(caught instanceof Error ? caught.message : 'Could not load genre filters.');
      });
    return () => controller.abort();
  }, [genreRetryNonce, type]);

  useEffect(() => {
    setPage(1);
    setResults([]);
    setTotalResults(undefined);
    setHasNextPage(false);
    setError('');
    setFilters({ sort: 'trending' });
    setBrowsePreset(undefined);
  }, [type]);

  const filteredMode = debouncedQuery.length >= 2 || hasBrowseFilters(filters) || Boolean(browsePreset);
  const filterCount = activeFilterCount(filters);
  const browseIntentKey = JSON.stringify([type, debouncedQuery, browsePreset || null, filters]);

  useEffect(() => {
    const requestGeneration = ++requestGenerationRef.current;
    loadMoreRequestRef.current?.controller.abort();
    loadMoreRequestRef.current = null;
    setLoadingMore(false);

    if (!filteredMode) {
      setResults([]);
      setTotalResults(undefined);
      setHasNextPage(false);
      setLoading(false);
      setError('');
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');

    browseCatalog({
      mediaType: type,
      preset: debouncedQuery.length >= 2 ? undefined : browsePreset,
      page: 1,
      perPage: preferences.dataSaver ? 12 : 24,
      filters: {
        ...filters,
        query: debouncedQuery.length >= 2 ? debouncedQuery : undefined,
        page: 1,
        perPage: preferences.dataSaver ? 12 : 24,
      },
    }, controller.signal)
      .then(response => {
        if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return;
        const visible = preferences.hideLibraryTitles
          ? response.results.filter(item => !duplicateKeys.has(`${item.provider}:${item.externalId}`))
          : response.results;
        setResults(visible);
        setCompletedBrowseControls(JSON.stringify([type, browsePreset || null, filters, response.page]));
        setPage(response.page);
        setHasNextPage(response.hasNextPage);
        setTotalResults(response.totalResults);
      })
      .catch(caught => {
        if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return;
        setError(caught instanceof Error ? caught.message : 'Catalog browse failed.');
      })
      .finally(() => {
        if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
      if (loadMoreRequestRef.current?.generation === requestGeneration) {
        loadMoreRequestRef.current.controller.abort();
        loadMoreRequestRef.current = null;
      }
      if (requestGeneration === requestGenerationRef.current) requestGenerationRef.current += 1;
    };
  }, [browseIntentKey, browsePreset, debouncedQuery, duplicateKeys, filteredMode, filters, preferences.dataSaver, preferences.hideLibraryTitles, retryNonce, type]);

  const loadMore = async () => {
    if (!hasNextPage || loadingMore || loadMoreRequestRef.current) return;
    const requestGeneration = requestGenerationRef.current;
    const controller = new AbortController();
    loadMoreRequestRef.current = { generation: requestGeneration, controller };
    setLoadingMore(true);
    setError('');
    try {
      const response = await browseCatalog({
        mediaType: type,
        preset: debouncedQuery.length >= 2 ? undefined : browsePreset,
        page: page + 1,
        perPage: preferences.dataSaver ? 12 : 24,
        filters: {
          ...filters,
          query: debouncedQuery.length >= 2 ? debouncedQuery : undefined,
          page: page + 1,
          perPage: preferences.dataSaver ? 12 : 24,
        },
      }, controller.signal);
      if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return;
      setResults(current => {
        const seen = new Set(current.map(item => `${item.provider}:${item.externalId}`));
        return [
          ...current,
          ...response.results.filter(item => {
            const key = `${item.provider}:${item.externalId}`;
            if (seen.has(key)) return false;
            if (preferences.hideLibraryTitles && duplicateKeys.has(key)) return false;
            return true;
          }),
        ];
      });
      setPage(response.page);
      setCompletedBrowseControls(JSON.stringify([type, browsePreset || null, filters, response.page]));
      setHasNextPage(response.hasNextPage);
      setTotalResults(response.totalResults);
    } catch (caught) {
      if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Could not load more results.');
    } finally {
      if (requestGeneration === requestGenerationRef.current && loadMoreRequestRef.current?.controller === controller) {
        loadMoreRequestRef.current = null;
        setLoadingMore(false);
      }
    }
  };

  const savePreferences = (next: EntertainmentPreferences) => {
    setPreferences(next);
    saveEntertainmentPreferences(profileId, next);
  };

  const activeChips = useMemo(() => {
    const chips: Array<{ key: keyof CatalogBrowseFilters; label: string }> = [];
    if (filters.year) chips.push({ key: 'year', label: String(filters.year) });
    if (filters.season) chips.push({ key: 'season', label: filters.season.charAt(0) + filters.season.slice(1).toLowerCase() });
    if (filters.releaseStatus) chips.push({ key: 'releaseStatus', label: filters.releaseStatus.replaceAll('_', ' ') });
    if (filters.formats?.length) chips.push({ key: 'formats', label: filters.formats.map(value => value.replaceAll('_', ' ')).join(', ') });
    if (filters.genres?.length) chips.push({ key: 'genres', label: filters.genres.join(', ') });
    if (filters.originalLanguage) chips.push({ key: 'originalLanguage', label: `Language: ${filters.originalLanguage.toUpperCase()}` });
    if (filters.minScore) chips.push({ key: 'minScore', label: `Rating ${filters.minScore}+` });
    if (filters.sort && filters.sort !== 'trending') chips.push({ key: 'sort', label: `Sort: ${filters.sort}` });
    return chips;
  }, [filters]);

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/75 shadow-sm">
        <div className="border-b border-border/50 bg-muted/30 p-3 sm:p-4">
          <div role="tablist" aria-label="Catalog media type" className="grid grid-cols-2 gap-2 rounded-2xl border border-border/40 bg-background/80 p-1.5 sm:grid-cols-4">
            {TYPES.map((option, index) => {
              const Icon = option.icon;
              const active = type === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  id={`catalog-type-tab-${option.value}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls="catalog-results-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => setType(option.value)}
                  onKeyDown={event => {
                    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const offset = event.key === 'Home' ? 0 : event.key === 'End' ? TYPES.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + TYPES.length) % TYPES.length;
                    const next = TYPES[offset];
                    setType(next.value);
                    window.requestAnimationFrame(() => document.getElementById(`catalog-type-tab-${next.value}`)?.focus());
                  }}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm ${
                    active
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? '' : option.accent}`} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <SearchField
              wrapperClassName="min-w-0 flex-1"
              value={query}
              maxLength={200}
              onChange={value => { setQuery(value); setBrowsePreset(undefined); }}
              aria-label={`Search ${type === 'movie' ? 'movies' : type}`}
              placeholder={`Search ${type === 'movie' ? 'movies' : type}...`}
              autoComplete="off"
            />

            <div className="flex gap-2">
              {preferences.filterVisibility !== 'hidden' ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFiltersOpen(true)}
                  className="h-12 flex-1 rounded-xl lg:flex-none"
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Filters{filterCount ? ` ${filterCount}` : ''}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                className="h-12 rounded-xl px-4"
                aria-label="Entertainment settings"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {preferences.filterVisibility === 'visible' ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <AndroidAdaptiveSelect
                id="catalog-year-filter"
                label="Filter catalog by year"
                value={filters.year ? String(filters.year) : ''}
                onChange={value => { setBrowsePreset(undefined); setFilters(current => ({
                  ...current,
                  year: value ? Number(value) : undefined,
                })); }}
                options={[
                  { value: '', label: 'Any year' },
                  ...Array.from({ length: 27 }, (_, index) => new Date().getFullYear() + 1 - index).map(year => ({ value: String(year), label: String(year) })),
                ]}
                className="control-input combobox-trigger-transparent h-10"
              />
              <AndroidAdaptiveSelect
                id="catalog-sort-filter"
                label="Sort catalog results"
                value={filters.sort || 'trending'}
                onChange={value => { setBrowsePreset(undefined); setFilters(current => ({
                  ...current,
                  sort: value as CatalogBrowseFilters['sort'],
                })); }}
                options={[
                  { value: 'trending', label: 'Trending' },
                  { value: 'popular', label: 'Most Popular' },
                  { value: 'score', label: 'Highest Rated' },
                  { value: 'newest', label: 'Newest' },
                ]}
                className="control-input combobox-trigger-transparent h-10"
              />
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="min-h-11 rounded-xl border border-border/60 bg-background/40 text-xs font-black hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                More filters
              </button>
            </div>
          ) : preferences.filterVisibility === 'minimal' ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {['Action', 'Drama', 'Comedy', 'Romance', 'Fantasy'].map(genre => (
                <button
                  key={genre}
                  type="button"
                  aria-pressed={filters.genres?.includes(genre) || false}
                  onClick={() => { setBrowsePreset(undefined); setFilters(current => ({ ...current, genres: [genre] })); }}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    filters.genres?.includes(genre)
                      ? 'border-primary/35 bg-primary/10 text-primary'
                      : 'border-border/55 text-muted-foreground'
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          ) : null}

          {activeChips.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeChips.map(chip => (
                <button
                  key={chip.key}
                  type="button"
                  aria-label={`Remove filter ${chip.label}`}
                  onClick={() => { setBrowsePreset(undefined); setFilters(current => removeFilter(current, chip.key)); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5 text-xs font-black capitalize text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {chip.label} <X className="h-3 w-3" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setBrowsePreset(undefined); setFilters({ sort: 'trending' }); }}
                className="min-h-10 rounded-full px-3 py-1.5 text-xs font-black text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Reset all
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <div id="catalog-results-panel" role="tabpanel" tabIndex={0} aria-labelledby={`catalog-type-tab-${type}`} aria-busy={loading} className="space-y-7">
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button type="button" variant="outline" onClick={() => setRetryNonce(value => value + 1)} disabled={loading} className="min-h-11 rounded-xl sm:shrink-0">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      ) : null}

      {!filteredMode ? (
        <DiscoverHome
          mediaType={type}
          profileId={profileId}
          duplicateKeys={duplicateKeys}
          preferences={preferences}
          onSelect={onSelect}
          androidPresentation={androidPresentation}
          onExplore={(request: CatalogBrowseRequest) => {
            setBrowsePreset(request.preset);
            setFilters({ ...(request.filters || {}) });
            window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
          }}
        />
      ) : (
        <section className="space-y-5">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="break-words text-2xl font-black tracking-tight">
                {debouncedQuery.length >= 2 ? `Results for “${debouncedQuery}”` : 'Filtered Catalog'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {totalResults != null ? `${totalResults.toLocaleString()} catalog matches` : `${results.length} titles loaded`}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuery('');
                setBrowsePreset(undefined);
                setFilters({ sort: 'trending' });
              }}
              className="rounded-xl"
            >
              <Sparkles className="mr-2 h-4 w-4" /> Back to Discover
            </Button>
          </header>

          {loading ? (
            <div role="status" aria-live="polite" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              <span className="sr-only">Loading catalog results</span>
              {Array.from({ length: preferences.dataSaver ? 8 : 12 }, (_, index) => (
                <div key={index}>
                  <div className="aspect-[2/3] animate-pulse rounded-xl bg-muted/70" />
                  <div className="mt-3 h-4 animate-pulse rounded bg-muted/70" />
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div ref={collectionRevealRef} className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {results.map(item => {
                const key = `${item.provider}:${item.externalId}`;
                return (
                  <CatalogResultCard
                    key={key}
                    item={item}
                    duplicate={preferences.markLibraryTitles && duplicateKeys.has(key)}
                    onSelect={() => onSelect(item)}
                    density="large"
                    titleLanguage={preferences.titleLanguage}
                    showScores={preferences.showScores}
                    showGenres={preferences.showGenres}
                    showReleaseStatus={preferences.showReleaseStatus}
                    showEpisodeCounts={preferences.showEpisodeCounts}
                    showAiringCountdown={preferences.showAiringCountdown}
                    showPopularity={preferences.showPopularity}
                    fluid
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/35 px-6 py-16 text-center">
              <Film className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-black">No catalog results found</h3>
              <p className="mt-2 text-sm text-muted-foreground">Try removing a filter or using another title.</p>
            </div>
          )}

          {hasNextPage && !loading ? (
            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore} className="rounded-xl px-6">
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load More
              </Button>
            </div>
          ) : null}
        </section>
      )}
      </div>

      <DiscoverFilters
        isOpen={filtersOpen}
        mediaType={type}
        filters={filters}
        genres={genres}
        genreError={genreError}
        onRetryGenres={() => setGenreRetryNonce(value => value + 1)}
        onApply={nextFilters => { setBrowsePreset(undefined); setFilters(nextFilters); }}
        onClose={() => setFiltersOpen(false)}
      />

      <EntertainmentSettings
        isOpen={settingsOpen}
        mediaType={type}
        preferences={preferences}
        onSave={savePreferences}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
