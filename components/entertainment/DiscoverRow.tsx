'use client';

import {
  AlertCircle,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import CatalogResultCard from '@/components/entertainment/CatalogResultCard';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';
import type {
  CatalogSearchResult,
  DiscoverSectionDescriptor,
} from '@/lib/entertainment/types';
import type { EntertainmentPreferences } from '@/lib/entertainment/preferences';

export type DiscoverRowState = {
  results: CatalogSearchResult[];
  loading: boolean;
  error?: string;
  deferred?: boolean;
};

export default function DiscoverRow({
  descriptor,
  state,
  duplicateKeys,
  preferences,
  onSelect,
  onSeeAll,
  onRetry,
}: {
  descriptor: DiscoverSectionDescriptor;
  state: DiscoverRowState;
  duplicateKeys: Set<string>;
  preferences: EntertainmentPreferences;
  onSelect: (item: CatalogSearchResult) => void;
  onSeeAll: () => void;
  onRetry: () => void;
}) {
  const collectionRevealRef = useCollectionReveal(
    state.results.map(item => `${item.provider}:${item.externalId}`),
    [descriptor.key, preferences.cardDensity],
  );
  return (
    <section className="caizen-discover-row space-y-4" aria-labelledby={`discover-row-title-${descriptor.key}`} aria-busy={state.loading}>
      <header className="flex items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <h3 id={`discover-row-title-${descriptor.key}`} className="break-words text-xl font-black tracking-tight sm:text-2xl">
            {descriptor.title}
          </h3>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground sm:text-sm">
            {descriptor.description}
          </p>
        </div>
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-xs font-black text-primary transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          See all <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      {state.error && state.results.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs">
          <p role="alert" className="text-muted-foreground">Couldn’t refresh this section.</p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 shrink-0 rounded-xl border border-border/60 px-3 font-black text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Retry
          </button>
        </div>
      ) : null}

      {state.error && state.results.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5 px-5 text-center">
          <div>
            <AlertCircle className="mx-auto h-5 w-5 text-red-400" />
            <p className="mt-2 text-sm font-bold">Couldn’t load this section.</p>
            <p className="mt-1 text-xs text-muted-foreground">{state.error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs font-black"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        </div>
      ) : state.loading && state.results.length === 0 ? (
        <div role="status" aria-label={`Loading ${descriptor.title}`} className="flex gap-4 overflow-hidden pb-3">
          {Array.from({ length: preferences.dataSaver ? 5 : 7 }, (_, index) => (
            <div key={index} className="w-[158px] shrink-0 sm:w-[180px]">
              <div className="aspect-[2/3] animate-pulse rounded-xl bg-muted/70" />
              <div className="mt-3 h-4 animate-pulse rounded bg-muted/70" />
              <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-muted/50" />
            </div>
          ))}
        </div>
      ) : state.results.length > 0 ? (
        <div className="relative">
          <div ref={collectionRevealRef} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 pr-3 [scrollbar-width:thin]">
            {state.results.map(item => {
              const key = `${item.provider}:${item.externalId}`;
              return (
                <div key={key} data-caizen-collection-item="true" className="snap-start">
                  <CatalogResultCard
                    item={item}
                    duplicate={duplicateKeys.has(key)}
                    onSelect={() => onSelect(item)}
                    density={preferences.cardDensity}
                    titleLanguage={preferences.titleLanguage}
                    showScores={preferences.showScores}
                    showGenres={preferences.showGenres}
                    showReleaseStatus={preferences.showReleaseStatus}
                    showEpisodeCounts={preferences.showEpisodeCounts}
                    showAiringCountdown={preferences.showAiringCountdown}
                    showPopularity={preferences.showPopularity}
                  />
                </div>
              );
            })}
            {state.loading ? (
              <div role="status" aria-label={`Loading more ${descriptor.title}`} className="flex w-24 shrink-0 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              </div>
            ) : null}
          </div>
          <div className="pointer-events-none absolute bottom-4 right-0 top-0 w-12 bg-gradient-to-l from-background to-transparent" />
        </div>
      ) : state.deferred ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/35 px-5 py-8 text-center text-sm text-muted-foreground">
          Scroll to load this section.
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/35 px-5 py-10 text-center text-sm text-muted-foreground">
          No titles were returned for this row.
        </div>
      )}
    </section>
  );
}
