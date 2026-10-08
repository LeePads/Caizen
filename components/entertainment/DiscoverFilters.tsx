'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import type {
  CatalogBrowseFilters,
  CatalogMediaType,
  CatalogReleaseFilter,
  CatalogSeason,
  CatalogSort,
} from '@/lib/entertainment/types';

const ANIME_FORMATS = [
  { value: 'TV', label: 'TV' },
  { value: 'TV_SHORT', label: 'TV Short' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'MUSIC', label: 'Music' },
];

const MANGA_FORMATS = [
  { value: 'MANGA', label: 'Manga' },
  { value: 'NOVEL', label: 'Light Novel' },
  { value: 'ONE_SHOT', label: 'One-Shot' },
];

const SORT_OPTIONS: Array<{ value: CatalogSort; label: string }> = [
  { value: 'trending', label: 'Trending' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'score', label: 'Highest Rated' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'favorites', label: 'Most Favorites' },
];

const STATUS_OPTIONS: Array<{ value: CatalogReleaseFilter; label: string }> = [
  { value: 'airing', label: 'Currently Airing' },
  { value: 'finished', label: 'Finished' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'hiatus', label: 'Hiatus' },
];

const LANGUAGE_OPTIONS = [
  { value: '', label: 'Any language' },
  { value: 'ko', label: 'Korean' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'th', label: 'Thai' },
  { value: 'en', label: 'English' },
];

function toggleValue(values: string[] | undefined, value: string) {
  const set = new Set(values || []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return Array.from(set);
}

export default function DiscoverFilters({
  isOpen,
  mediaType,
  filters,
  genres,
  genreError,
  onRetryGenres,
  onApply,
  onClose,
}: {
  isOpen: boolean;
  mediaType: CatalogMediaType;
  filters: CatalogBrowseFilters;
  genres: string[];
  genreError?: string;
  onRetryGenres?: () => void;
  onApply: (filters: CatalogBrowseFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CatalogBrowseFilters>(filters);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isOpen) setDraft(filters);
  }, [filters, isOpen]);

  const years = useMemo(() => {
    const current = new Date().getFullYear() + 1;
    return Array.from({ length: current - 1959 }, (_, index) => current - index);
  }, []);

  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });
  useOverlayLifecycle(isOpen, close, { containerRef: panelRef });

  if (!isOpen) return null;

  const formats = mediaType === 'anime'
    ? ANIME_FORMATS
    : mediaType === 'manga'
      ? MANGA_FORMATS
      : [];
  const supportsSeason = mediaType === 'anime';
  const supportsStatus = mediaType === 'anime' || mediaType === 'manga';
  const supportsLanguage = mediaType === 'series' || mediaType === 'movie';

  return createPortal(
    <div className="fixed inset-0 z-[10020] flex items-end justify-center sm:items-center sm:p-5" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
      <button
        type="button"
        aria-label="Close filters"
        onClick={close}
        className="motion-modal-backdrop absolute inset-0 bg-black/75 backdrop-blur-md"
      />

      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entertainment-filters-title"
        aria-describedby="entertainment-filters-description"
        className="caizen-sheet-panel relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border/60 bg-card shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-4 sm:px-6">
          <div>
            <h2 id="entertainment-filters-title" className="flex items-center gap-2 text-xl font-black">
              <SlidersHorizontal className="h-5 w-5" /> Filters
            </h2>
            <p id="entertainment-filters-description" className="sr-only">Refine catalog results by year, format, genre, release details, rating, and sort order.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border/60 bg-background/50 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
              Year
              <AndroidAdaptiveSelect
                id="discover-filter-year"
                label="Year"
                value={draft.year ? String(draft.year) : ''}
                onChange={value => setDraft(current => ({
                  ...current,
                  year: value ? Number(value) : undefined,
                }))}
                options={[
                  { value: '', label: 'Any year' },
                  ...years.map(year => ({ value: String(year), label: String(year) })),
                ]}
                className="control-input mt-2"
              />
            </label>

            <label className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
              Sort by
              <AndroidAdaptiveSelect
                id="discover-filter-sort"
                label="Sort by"
                value={draft.sort || 'trending'}
                onChange={value => setDraft(current => ({
                  ...current,
                  sort: value as CatalogSort,
                }))}
                options={SORT_OPTIONS}
                className="control-input mt-2"
              />
            </label>

            {supportsSeason ? (
              <label className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Season
                <AndroidAdaptiveSelect
                  id="discover-filter-season"
                  label="Season"
                  value={draft.season || ''}
                  onChange={value => setDraft(current => ({
                    ...current,
                    season: value
                      ? value as CatalogSeason
                      : undefined,
                  }))}
                  options={[
                    { value: '', label: 'Any season' },
                    { value: 'WINTER', label: 'Winter' },
                    { value: 'SPRING', label: 'Spring' },
                    { value: 'SUMMER', label: 'Summer' },
                    { value: 'FALL', label: 'Fall' },
                  ]}
                  className="control-input mt-2"
                />
              </label>
            ) : null}

            {supportsStatus ? (
              <label className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Release status
                <AndroidAdaptiveSelect
                  id="discover-filter-status"
                  label="Release status"
                  value={draft.releaseStatus || ''}
                  onChange={value => setDraft(current => ({
                    ...current,
                    releaseStatus: value
                      ? value as CatalogReleaseFilter
                      : undefined,
                  }))}
                  options={[{ value: '', label: 'Any status' }, ...STATUS_OPTIONS]}
                  className="control-input mt-2"
                />
              </label>
            ) : null}

            {supportsLanguage ? (
              <label className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Original language
                <AndroidAdaptiveSelect
                  id="discover-filter-language"
                  label="Original language"
                  value={draft.originalLanguage || ''}
                  onChange={value => setDraft(current => ({
                    ...current,
                    originalLanguage: value || undefined,
                  }))}
                  options={LANGUAGE_OPTIONS}
                  className="control-input mt-2"
                />
              </label>
            ) : null}

            <label className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
              Minimum rating
              <AndroidAdaptiveSelect
                id="discover-filter-min-score"
                label="Minimum rating"
                value={draft.minScore ? String(draft.minScore) : ''}
                onChange={value => setDraft(current => ({
                  ...current,
                  minScore: value ? Number(value) : undefined,
                }))}
                options={[
                  { value: '', label: 'Any rating' },
                  { value: '5', label: '5+' },
                  { value: '6', label: '6+' },
                  { value: '7', label: '7+' },
                  { value: '8', label: '8+' },
                  { value: '9', label: '9+' },
                ]}
                className="control-input mt-2"
              />
            </label>
          </div>

          {formats.length ? (
            <section>
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Format</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {formats.map(option => {
                  const active = draft.formats?.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setDraft(current => ({
                        ...current,
                        formats: toggleValue(current.formats, option.value),
                      }))}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        active
                          ? 'border-primary/40 bg-primary/12 text-primary'
                          : 'border-border/60 bg-background/45 text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      {active ? <Check className="h-3.5 w-3.5" /> : null}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Genres</h3>
            <div className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-2xl border border-border/50 bg-background/25 p-3">
              {genreError ? (
                <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs">
                  <p role="alert" className="text-destructive">Couldn’t load genre filters.</p>
                  {onRetryGenres ? <button type="button" onClick={onRetryGenres} className="min-h-11 shrink-0 rounded-xl border border-border/60 px-3 font-black text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Retry</button> : null}
                </div>
              ) : genres.length ? genres.map(genre => {
                const active = draft.genres?.includes(genre);
                return (
                    <button
                      key={genre}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setDraft(current => ({
                      ...current,
                      genres: toggleValue(current.genres, genre),
                    }))}
                    className={`inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? 'border-primary/35 bg-primary/12 text-primary'
                        : 'border-border/50 bg-card/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                    <span className="break-words">{genre}</span>
                  </button>
                );
              }) : (
                <p className="p-3 text-xs text-muted-foreground">Genre options are loading.</p>
              )}
            </div>
          </section>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-border/60 bg-card/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-between sm:px-6 sm:pb-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDraft({ sort: 'trending' })}
            className="min-h-11 rounded-xl"
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Reset
          </Button>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="min-h-11 flex-1 rounded-xl sm:flex-none">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onApply(draft);
                close();
              }}
              className="min-h-11 flex-1 rounded-xl sm:flex-none"
            >
              Apply Filters
            </Button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
