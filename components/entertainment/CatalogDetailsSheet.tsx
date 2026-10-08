'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { getCatalogDetails } from '@/lib/entertainment/catalog';
import type {
  CatalogMediaDetails,
  CatalogSearchResult,
} from '@/lib/entertainment/types';
import type { MediaStatus } from '@/lib/types';
import { parseLocalDateKey } from '@/lib/date-utils';
import { normalizeCatalogImageSource } from '@/lib/catalog/normalization';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { ResilientImage } from '@/components/media/ResilientImage';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

function defaultStatus(type: CatalogSearchResult['mediaType']): MediaStatus {
  return type === 'manga' ? 'reading' : 'watching';
}

function statusOptions(type: CatalogSearchResult['mediaType']) {
  return type === 'manga'
    ? [
        { value: 'reading', label: 'Reading' },
        { value: 'planned', label: 'Planned' },
        { value: 'paused', label: 'Paused' },
        { value: 'completed', label: 'Completed' },
        { value: 'dropped', label: 'Dropped' },
      ]
    : [
        { value: 'watching', label: 'Watching' },
        { value: 'planned', label: 'Planned' },
        { value: 'paused', label: 'Paused' },
        { value: 'completed', label: 'Completed' },
        { value: 'dropped', label: 'Dropped' },
      ];
}

function formatNextEpisode(details: CatalogMediaDetails) {
  if (details.nextEpisodeDate) {
    const date = parseLocalDateKey(details.nextEpisodeDate);
    return date?.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) || '';
  }
  if (!details.nextEpisodeAt) return '';
  const date = new Date(details.nextEpisodeAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function nonNegativeInteger(value: string, fallback = 0, max?: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.max(0, Math.floor(parsed));
  return max == null ? normalized : Math.min(normalized, max);
}

export default function CatalogDetailsSheet({
  item,
  onClose,
  onAdd,
}: {
  item: CatalogSearchResult | null;
  onClose: () => void;
  onAdd: (
    details: CatalogMediaDetails,
    user: {
      status: MediaStatus;
      progress?: number;
      currentSeason?: number;
      currentEpisode?: number;
      website?: string;
      favorite?: boolean;
      notes?: string;
    },
  ) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [details, setDetails] = useState<CatalogMediaDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<MediaStatus>('watching');
  const [progress, setProgress] = useState('0');
  const [currentSeason, setCurrentSeason] = useState('1');
  const [currentEpisode, setCurrentEpisode] = useState('0');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const panelRef = useRef<HTMLElement | null>(null);
  const requestGenerationRef = useRef(0);
  const activeItemKeyRef = useRef<string | null>(null);

  useEffect(() => setMounted(true), []);

  const itemKey = item ? `${item.provider}:${item.mediaType}:${item.externalId}` : null;

  useEffect(() => {
    const requestGeneration = ++requestGenerationRef.current;
    if (!item || !itemKey) {
      activeItemKeyRef.current = null;
      return;
    }

    const controller = new AbortController();
    const sameItemRetry = activeItemKeyRef.current === itemKey;
    activeItemKeyRef.current = itemKey;
    if (!sameItemRetry) setDetails(null);
    setError('');
    setLoading(true);
    if (!sameItemRetry) {
      setStatus(defaultStatus(item.mediaType));
      setProgress('0');
      setCurrentSeason('1');
      setCurrentEpisode('0');
      setWebsite('');
      setNotes('');
      setFavorite(false);
    }

    getCatalogDetails(item, controller.signal)
      .then(nextDetails => {
        if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return;
        setDetails(nextDetails);
      })
      .catch(caught => {
        if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return;
        setError(caught instanceof Error ? caught.message : 'Could not load title details.');
      })
      .finally(() => {
        if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
      if (requestGeneration === requestGenerationRef.current) requestGenerationRef.current += 1;
    };
  }, [item, itemKey, retryNonce]);

  const { close, isClosing } = useAnimatedOverlayClose({ isOpen: Boolean(item), onClose });
  useOverlayLifecycle(Boolean(item), close, {
    containerRef: panelRef,
    initialFocusSelector: 'button[aria-label="Close catalog details"]',
  });

  const active = details || item;
  const previewImage = normalizeCatalogImageSource(details?.image || item?.image);
  const previewTitle = details?.title || item?.title || 'Selected title';
  const previewSynopsis = details?.synopsis || item?.synopsis;
  const totalLabel = useMemo(() => {
    if (!active?.totalUnits) return 'Total unknown';
    return `${active.totalUnits} ${active.unitLabel}`;
  }, [active]);

  if (!mounted || !item) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center sm:p-4" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
      <button
        type="button"
        aria-label="Close catalog details backdrop"
        className="motion-modal-backdrop absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={close}
      />

      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-details-title"
        aria-describedby="catalog-details-description"
        className="caizen-sheet-panel android-entertainment-sheet-panel relative z-10 flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-border/60 bg-card shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-4 sm:px-6">
          <div>
            <h2 id="catalog-details-title" className="text-xl font-black">
              Review before adding
              <span className="ml-2 text-sm font-bold text-muted-foreground">· {item.provider === 'anilist' ? 'AniList' : 'TMDB'}</span>
            </h2>
            <p id="catalog-details-description" className="sr-only">Review catalog information and choose the title status and personal details to save in your library.</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="android-touch-target flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border/60 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close catalog details"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-6">
          {loading && details ? (
            <p role="status" className="mb-4 flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Refreshing catalog details…
            </p>
          ) : null}

          {error && details ? (
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
              <p role="alert" className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
              <Button type="button" variant="outline" onClick={() => setRetryNonce(value => value + 1)} disabled={loading} className="rounded-xl sm:shrink-0">
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          ) : null}

          {loading && !details ? (
            <div className="flex min-h-80 items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p role="status" className="text-sm font-bold text-muted-foreground">Loading title details…</p>
              </div>
            </div>
          ) : error && !details ? (
            <div className="space-y-5 rounded-2xl border border-destructive/25 bg-destructive/10 p-4">
              <div className="flex items-center gap-4">
                <div className="h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                  <ResilientImage src={previewImage} alt="" className="h-full w-full object-cover" fallback={<span aria-hidden="true" className="grid h-full place-items-center text-xs text-muted-foreground">No poster</span>} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">{item.provider === 'anilist' ? 'AniList' : 'TMDB'} Catalog</p>
                  <h3 className="mt-1 truncate text-lg font-black">{previewTitle}</h3>
                  {previewSynopsis ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{previewSynopsis}</p> : null}
                </div>
              </div>
              <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
              <Button type="button" variant="outline" onClick={() => setRetryNonce(value => value + 1)} disabled={loading} className="rounded-xl">
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          ) : details ? (
            <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
              <div>
                <div className="aspect-[2/3] overflow-hidden rounded-2xl bg-muted">
                  <ResilientImage src={normalizeCatalogImageSource(details.image)} alt={details.title} className="h-full w-full object-cover" fallback={<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">No poster available</div>} />
                </div>
                {normalizeExternalWebUrl(details.catalogUrl) ? (
                  <a
                    href={normalizeExternalWebUrl(details.catalogUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/60 text-xs font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open catalog page
                  </a>
                ) : null}
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                    <span>{details.mediaType}</span>
                    {details.year ? <span>• {details.year}</span> : null}
                    {details.sourceStatus ? <span>• {details.sourceStatus}</span> : null}
                    <span>• {totalLabel}</span>
                  </div>
                  <h3 className="mt-2 break-words text-2xl font-black sm:text-3xl">{details.title}</h3>
                  {details.originalTitle && details.originalTitle !== details.title ? (
                    <p className="mt-1 text-sm text-muted-foreground">{details.originalTitle}</p>
                  ) : null}
                  <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                    {details.synopsis || 'No synopsis is available.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(details.genres || []).slice(0, 8).map(genre => (
                    <span key={genre} className="rounded-full border border-border/60 bg-muted/60 px-3 py-1 text-xs font-bold">
                      {genre}
                    </span>
                  ))}
                </div>

                {formatNextEpisode(details) ? (
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">Next episode</p>
                    <p className="mt-1 text-sm font-bold">
                      Episode {details.nextEpisodeNumber || '?'} · {formatNextEpisode(details)}
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-4 rounded-2xl border border-border/60 bg-background/40 p-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-muted-foreground">
                    Library status
                    <AndroidAdaptiveSelect
                      id="catalog-details-status"
                      label="Library status"
                      value={status}
                      onChange={value => setStatus(value as MediaStatus)}
                      options={statusOptions(details.mediaType)}
                      className="control-input mt-2"
                    />
                  </label>

                  {details.mediaType === 'series' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-xs font-bold text-muted-foreground">
                        Season
                        <input
                          type="number"
                          min="1"
                          value={currentSeason}
                          onChange={event => setCurrentSeason(event.target.value.replace(/\D/g, '').slice(0, 4))}
                          inputMode="numeric"
                          className="control-input mt-2"
                        />
                      </label>
                      <label className="text-xs font-bold text-muted-foreground">
                        Episode
                        <input
                          type="number"
                          min="0"
                          value={currentEpisode}
                          onChange={event => setCurrentEpisode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                          inputMode="numeric"
                          className="control-input mt-2"
                        />
                      </label>
                    </div>
                  ) : details.mediaType === 'movie' ? (
                    <div className="flex items-end text-xs text-muted-foreground">
                      Movies use status instead of episode progress.
                    </div>
                  ) : (
                    <label className="text-xs font-bold text-muted-foreground">
                      Current {details.unitLabel === 'chapters' ? 'chapter' : 'episode'}
                      <input
                        type="number"
                        min="0"
                        max={details.totalUnits || undefined}
                        value={progress}
                        onChange={event => setProgress(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        inputMode="numeric"
                        className="control-input mt-2"
                      />
                    </label>
                  )}

                  <label className="text-xs font-bold text-muted-foreground sm:col-span-2">
                    My watch or reading link
                    <input
                      value={website}
                      onChange={event => setWebsite(event.target.value.slice(0, 2048))}
                      placeholder="https://..."
                      inputMode="url"
                      autoComplete="url"
                      className="control-input mt-2"
                    />
                  </label>

                  <label className="text-xs font-bold text-muted-foreground sm:col-span-2">
                    Personal notes
                    <textarea
                      value={notes}
                      onChange={event => setNotes(event.target.value.slice(0, 2000))}
                      maxLength={2000}
                      placeholder="Optional notes..."
                      className="control-input mt-2 min-h-24 py-3"
                    />
                  </label>

                  <label className="flex items-center gap-3 text-sm font-bold sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={favorite}
                      onChange={event => setFavorite(event.target.checked)}
                      className="h-4 w-4"
                    />
                    Mark as favorite
                  </label>
                </div>

                {details.watchProviders?.length ? (
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Available in the Philippines</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {details.watchProviders.slice(0, 10).map(provider => (
                        <span key={`${provider.type}:${provider.name}`} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs font-bold">
                          {normalizeCatalogImageSource(provider.logo) ? <ResilientImage src={normalizeCatalogImageSource(provider.logo)} alt="" className="h-5 w-5 rounded object-cover" fallback={<span className="size-5 rounded bg-muted" />} /> : null}
                          <span className="min-w-0 break-words">{provider.name}</span>
                          <span className="text-muted-foreground">· {provider.type}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {details.relations?.length ? (
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Related titles</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {details.relations.slice(0, 8).map(relation => (
                        normalizeExternalWebUrl(relation.catalogUrl) ? <a
                          key={`${relation.provider}:${relation.externalId}:${relation.relation}`}
                          href={normalizeExternalWebUrl(relation.catalogUrl)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 rounded-2xl border border-border/60 bg-background/40 p-3 text-sm transition hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="text-xs font-black uppercase tracking-[0.12em] text-primary">{relation.relation.replace('_', ' ')}</span>
                          <OverflowTooltip text={relation.title} mode="clamped"><p className="mt-1 line-clamp-2 font-bold">{relation.title}</p></OverflowTooltip>
                        </a> : null
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex justify-end gap-3 border-t border-border/60 bg-card/95 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
          <Button type="button" variant="outline" onClick={close} className="rounded-xl">Cancel</Button>
          <Button
            type="button"
            disabled={!details || loading}
            onClick={() => details && onAdd(details, {
              status,
              progress: details.mediaType === 'series' ? nonNegativeInteger(currentEpisode, 0, details.totalUnits || undefined) : nonNegativeInteger(progress, 0, details.totalUnits || undefined),
              currentSeason: details.mediaType === 'series' ? Math.max(1, nonNegativeInteger(currentSeason, 1)) : undefined,
              currentEpisode: details.mediaType === 'series' ? nonNegativeInteger(currentEpisode, 0, details.totalUnits || undefined) : undefined,
              website: normalizeExternalWebUrl(website.trim()) || undefined,
              favorite,
              notes: notes.trim() || undefined,
            })}
            className="rounded-xl"
          >
            <Plus className="mr-2 h-4 w-4" />
            Review in editor
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
