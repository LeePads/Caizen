'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import DiscoverHero from '@/components/entertainment/DiscoverHero';
import DiscoverRow, { type DiscoverRowState } from '@/components/entertainment/DiscoverRow';
import {
  browseCatalog,
  getDiscoverSectionOptions,
} from '@/lib/entertainment/catalog';
import {
  isDiscoverCacheFresh,
  readDiscoverCache,
  writeDiscoverCache,
} from '@/lib/entertainment/discover-cache';
import type {
  CatalogBrowseRequest,
  CatalogMediaType,
  CatalogSearchResult,
  DiscoverSectionDescriptor,
  DiscoverSectionKey,
} from '@/lib/entertainment/types';
import type { EntertainmentPreferences } from '@/lib/entertainment/preferences';

function cacheKey(mediaType: CatalogMediaType, descriptor: DiscoverSectionDescriptor) {
  return `${mediaType}:${descriptor.key}:${JSON.stringify(descriptor.request.filters || {})}`;
}

function initialRows(descriptors: DiscoverSectionDescriptor[]) {
  return Object.fromEntries(
    descriptors.map((descriptor, index) => [
      descriptor.key,
      { results: [], loading: false, deferred: index > 0 } satisfies DiscoverRowState,
    ]),
  ) as Partial<Record<DiscoverSectionKey, DiscoverRowState>>;
}

function LazyDiscoverRow({
  activationKey,
  enabled,
  onVisible,
  children,
}: {
  activationKey: string;
  enabled: boolean;
  onVisible: () => void;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    requestedRef.current = false;
  }, [activationKey]);

  useEffect(() => {
    if (!enabled || requestedRef.current || typeof window === 'undefined') return;
    const row = rowRef.current;
    if (!row) return;

    if (!('IntersectionObserver' in window)) {
      requestedRef.current = true;
      onVisible();
      return;
    }

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      requestedRef.current = true;
      observer.disconnect();
      onVisible();
    }, { rootMargin: '320px 0px' });

    observer.observe(row);
    return () => observer.disconnect();
  }, [activationKey, enabled, onVisible]);

  return <div ref={rowRef}>{children}</div>;
}

export default function DiscoverHome({
  mediaType,
  profileId,
  duplicateKeys,
  preferences,
  onSelect,
  onExplore,
  androidPresentation = false,
}: {
  mediaType: CatalogMediaType;
  profileId: string;
  duplicateKeys: Set<string>;
  preferences: EntertainmentPreferences;
  onSelect: (item: CatalogSearchResult) => void;
  onExplore: (request: CatalogBrowseRequest) => void;
  androidPresentation?: boolean;
}) {
  const descriptors = useMemo(() => {
    const visible = new Set(preferences.visibleSections[mediaType] || []);
    return getDiscoverSectionOptions(mediaType).filter(item => visible.has(item.key));
  }, [mediaType, preferences.visibleSections]);

  const [rows, setRows] = useState<Partial<Record<DiscoverSectionKey, DiscoverRowState>>>(() => initialRows(descriptors));
  const [refreshing, setRefreshing] = useState(false);
  const [manualLoadRequested, setManualLoadRequested] = useState(false);
  const refreshNonce = useRef(0);
  const inFlightRef = useRef(new Map<DiscoverSectionKey, Promise<void>>());
  const controllersRef = useRef(new Map<DiscoverSectionKey, AbortController>());

  useEffect(() => {
    setManualLoadRequested(false);
  }, [descriptors]);

  const abortRequests = useCallback(() => {
    controllersRef.current.forEach(controller => controller.abort());
    controllersRef.current.clear();
    inFlightRef.current.clear();
  }, []);

  const hydrateRows = useCallback(() => {
    const nextRows = Object.fromEntries(descriptors.map((descriptor, index) => {
      const cached = readDiscoverCache(profileId, cacheKey(mediaType, descriptor));
      const cachedResults = cached?.results || [];
      return [descriptor.key, {
        results: preferences.hideLibraryTitles
          ? cachedResults.filter(item => !duplicateKeys.has(`${item.provider}:${item.externalId}`))
          : cachedResults,
        loading: false,
        deferred: index > 0,
      } satisfies DiscoverRowState];
    })) as Partial<Record<DiscoverSectionKey, DiscoverRowState>>;
    setRows(nextRows);
  }, [descriptors, duplicateKeys, mediaType, preferences.hideLibraryTitles, profileId]);

  const loadDescriptor = useCallback((descriptor: DiscoverSectionDescriptor, force = false): Promise<void> => {
    const key = descriptor.key;
    const existing = inFlightRef.current.get(key);
    if (existing) return existing;

    const currentNonce = refreshNonce.current;
    const perPage = preferences.dataSaver ? 8 : 14;
    const cache = readDiscoverCache(profileId, cacheKey(mediaType, descriptor));
    const cachedResults = cache?.results || [];
    const fresh = cache ? isDiscoverCacheFresh(cache, preferences.catalogRefreshHours) : false;
    const visibleCachedResults = preferences.hideLibraryTitles
      ? cachedResults.filter(item => !duplicateKeys.has(`${item.provider}:${item.externalId}`))
      : cachedResults;
    const shouldFetch = force || !cache || (!fresh && preferences.backgroundCatalogRefresh);

    setRows(current => ({
      ...current,
      [key]: {
        results: visibleCachedResults.length ? visibleCachedResults : current[key]?.results || [],
        loading: shouldFetch,
        deferred: false,
        error: undefined,
      },
    }));

    if (!shouldFetch) return Promise.resolve();

    const controller = new AbortController();
    controllersRef.current.set(key, controller);
    const task = browseCatalog(
      {
        ...descriptor.request,
        page: 1,
        perPage,
        filters: {
          ...descriptor.request.filters,
          page: 1,
          perPage,
        },
      },
      controller.signal,
      force,
    )
      .then(response => {
        if (controller.signal.aborted || currentNonce !== refreshNonce.current) return;
        writeDiscoverCache(profileId, cacheKey(mediaType, descriptor), response.results);
        const visibleResults = preferences.hideLibraryTitles
          ? response.results.filter(item => !duplicateKeys.has(`${item.provider}:${item.externalId}`))
          : response.results;
        setRows(current => ({
          ...current,
          [key]: { results: visibleResults, loading: false, deferred: false },
        }));
      })
      .catch(error => {
        if (controller.signal.aborted || currentNonce !== refreshNonce.current) return;
        setRows(current => ({
          ...current,
          [key]: {
            results: current[key]?.results || [],
            loading: false,
            deferred: false,
            error: error instanceof Error ? error.message : 'Could not load this catalog row.',
          },
        }));
      })
      .finally(() => {
        if (controllersRef.current.get(key) === controller) controllersRef.current.delete(key);
        if (inFlightRef.current.get(key) === task) inFlightRef.current.delete(key);
        if (!controller.signal.aborted && currentNonce === refreshNonce.current) {
          setRows(current => ({
            ...current,
            [key]: current[key] ? { ...current[key], loading: false } : current[key],
          }));
        }
      })
      .then(() => undefined);
    inFlightRef.current.set(key, task);
    return task;
  }, [duplicateKeys, mediaType, preferences.backgroundCatalogRefresh, preferences.catalogRefreshHours, preferences.dataSaver, preferences.hideLibraryTitles, profileId]);

  useEffect(() => {
    const currentNonce = ++refreshNonce.current;
    abortRequests();
    hydrateRows();
    if (preferences.autoLoadDiscover || manualLoadRequested) {
      const firstDescriptor = descriptors[0];
      if (firstDescriptor) void loadDescriptor(firstDescriptor);
    }
    return () => {
      abortRequests();
      setRefreshing(false);
      if (currentNonce === refreshNonce.current) refreshNonce.current += 1;
    };
  }, [
    abortRequests,
    descriptors,
    hydrateRows,
    loadDescriptor,
    manualLoadRequested,
    preferences.autoLoadDiscover,
  ]);

  const loadRows = useCallback(async () => {
    const currentNonce = ++refreshNonce.current;
    abortRequests();
    setRefreshing(true);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < descriptors.length) {
        const descriptor = descriptors[nextIndex];
        nextIndex += 1;
        if (descriptor) await loadDescriptor(descriptor, true);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, descriptors.length) }, () => worker()));
    if (currentNonce === refreshNonce.current) setRefreshing(false);
  }, [abortRequests, descriptors, loadDescriptor]);

  const hasAnyResults = descriptors.some(descriptor => (rows[descriptor.key]?.results.length || 0) > 0);

  const featuredItems = useMemo(() => {
    const seen = new Set<string>();
    return descriptors
      .flatMap(descriptor => rows[descriptor.key]?.results || [])
      .filter(item => item.mediaType === mediaType && (item.backdrop || item.image))
      .filter(item => {
        const key = `${item.provider}:${item.externalId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [descriptors, mediaType, rows]);

  if (!descriptors.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/35 px-6 py-16 text-center">
        <Sparkles className="mx-auto h-9 w-9 text-muted-foreground/60" aria-hidden="true" />
        <h2 className="mt-4 text-xl font-black">No Discover rows are enabled</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Open Discover settings and choose at least one row to build your catalog home.
        </p>
      </div>
    );
  }

  if (!preferences.autoLoadDiscover && !manualLoadRequested && !hasAnyResults) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/35 px-6 py-16 text-center">
        <Sparkles className="mx-auto h-9 w-9 text-primary" />
        <h2 className="mt-4 text-xl font-black">Discover auto-load is off</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Load the catalog manually now, or enable automatic loading in Entertainment settings.
        </p>
        <Button type="button" onClick={() => setManualLoadRequested(true)} className="mt-5 min-h-11 rounded-xl">
          Load Discover
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-10" aria-busy={refreshing}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="break-words text-2xl font-black tracking-tight sm:text-3xl">
            Explore {mediaType === 'movie' ? 'Movies' : mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={refreshing}
          onClick={() => void loadRows()}
          aria-label={refreshing ? 'Refreshing catalog' : 'Refresh catalog'}
          className="min-h-11 shrink-0 rounded-xl"
        >
          {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {featuredItems.length > 0 && !preferences.dataSaver ? (
          <DiscoverHero
            items={featuredItems}
            duplicateKeys={duplicateKeys}
            titleLanguage={preferences.titleLanguage}
            onSelect={onSelect}
            androidPresentation={androidPresentation}
            enableCharacterBlur
          />
      ) : null}

      <div className="space-y-10">
        {descriptors.map((descriptor, index) => {
          const row = (
            <DiscoverRow
              descriptor={descriptor}
              state={rows[descriptor.key] || { results: [], loading: true }}
              duplicateKeys={preferences.markLibraryTitles ? duplicateKeys : new Set<string>()}
              preferences={preferences}
              onSelect={onSelect}
              onSeeAll={() => onExplore({
                ...descriptor.request,
                filters: {
                  ...(descriptor.request.filters || {}),
                  sort: descriptor.request.filters?.sort || 'popular',
                },
              })}
              onRetry={() => { void loadDescriptor(descriptor, true); }}
            />
          );
          return index === 0 ? <div key={descriptor.key}>{row}</div> : (
            <LazyDiscoverRow
              key={descriptor.key}
              activationKey={`${mediaType}:${descriptors.map(item => item.key).join(',')}`}
              enabled={preferences.autoLoadDiscover || manualLoadRequested}
              onVisible={() => { void loadDescriptor(descriptor); }}
            >
              {row}
            </LazyDiscoverRow>
          );
        })}
      </div>
    </div>
  );
}
