'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ExternalLink, Gamepad2, Library, Loader2, Play, Star, X } from 'lucide-react';
import type { Game } from '@/lib/types';
import { getRawgGameDetails, type RawgGameDetails, type RawgGameResult } from '@/lib/games/rawg';
import { gameStatusLabel } from '@/lib/games/game-form';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { ResilientImage } from '@/components/media/ResilientImage';

function dateLabel(value?: string | Date) {
  if (!value) return 'Release date unavailable';
  const date = new Date(typeof value === 'string' ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? 'Release date unavailable' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function releaseState(value?: string) {
  if (!value) return 'Release date unavailable';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Release date unavailable';
  return date.getTime() > new Date().setHours(12, 0, 0, 0) ? 'Coming soon' : 'Released';
}

function positiveNumber(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export default function GamePreviewDialog({
  result,
  existing,
  possibleMatch,
  onClose,
  onAddCatalog,
  onOpenGame,
  onUpdateStatus,
}: {
  result: RawgGameResult;
  existing?: Game;
  possibleMatch?: Game;
  onClose: () => void;
  onAddCatalog: (result: RawgGameResult, status: 'wishlist' | 'backlog') => void;
  onOpenGame: (game: Game) => void;
  onUpdateStatus: (game: Game, status: 'backlog' | 'playing') => void;
}) {
  const [details, setDetails] = useState<RawgGameDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(Boolean(result.rawgId));
  const [detailsError, setDetailsError] = useState('');
  const panelRef = useRef<HTMLElement | null>(null);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const requestGeneration = ++requestGenerationRef.current;
    const controller = new AbortController();
    setDetails(null);
    setDetailsLoading(true);
    setDetailsError('');
    if (!result.rawgId) {
      setDetailsLoading(false);
      return () => controller.abort();
    }
    void getRawgGameDetails(result.rawgId, controller.signal)
      .then(nextDetails => {
        if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current) setDetails(nextDetails);
      })
      .catch(error => {
        if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current) setDetailsError(error instanceof Error ? error.message : 'Details are temporarily unavailable.');
      })
      .finally(() => { if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current) setDetailsLoading(false); });
    return () => {
      controller.abort();
      if (requestGeneration === requestGenerationRef.current) requestGenerationRef.current += 1;
    };
  }, [result.rawgId]);

  const { close, closeAfter, isClosing } = useAnimatedOverlayClose({ isOpen: true, onClose });
  useOverlayLifecycle(true, close, { lockScroll: false, autoFocus: true, containerRef: panelRef });

  if (typeof document === 'undefined') return null;
  const metadata = details || result;
  const image = metadata.image || result.image;
  const officialWebsite = normalizeExternalWebUrl(details?.website || result.website);
  const trackedLabel = existing ? gameStatusLabel(existing.status) : null;
  const isWishlist = existing && (existing.status === 'wishlist' || existing.status === 'upcoming');
  const rating = positiveNumber(details?.rating || result.rating) ? (details?.rating || result.rating)!.toFixed(1) : null;
  const metacritic = positiveNumber(details?.metacritic || result.metacritic) ? String(details?.metacritic || result.metacritic) : null;
  const genres = details?.genres?.map(genre => genre.name) || result.genres?.map(genre => genre.name) || (result.genre ? [result.genre] : []);
  const stores = (details?.stores || []).filter(store => normalizeExternalWebUrl(store.url));

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-transparent sm:items-center sm:p-4" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
      <button type="button" aria-label="Close game preview backdrop" onClick={close} className="motion-modal-backdrop absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm" />
      <section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="game-preview-title" className="caizen-sheet-panel android-entertainment-sheet-panel relative flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-border/60 bg-card shadow-2xl sm:rounded-2xl">
        <button type="button" onClick={close} aria-label="Close game preview" className="android-touch-target absolute right-3 top-3 z-20 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-black/50 text-white hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"><X className="size-5" /></button>

        <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-0">
          <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="relative aspect-[16/10] min-h-56 overflow-hidden bg-muted sm:min-h-72 lg:aspect-auto lg:min-h-[30rem]">
              <ResilientImage src={image} alt="" loading="eager" decoding="async" className="h-full w-full object-cover" fallback={<div className="grid h-full place-items-center"><Gamepad2 className="size-16 text-muted-foreground/35" aria-hidden="true" /></div>} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6"><p className="text-xs font-black uppercase tracking-[0.14em] text-white/70">{releaseState(metadata.releaseDate)}</p><h2 id="game-preview-title" className="mt-2 break-words text-3xl font-black leading-[0.98] tracking-tight sm:text-4xl">{metadata.title || 'Untitled game'}</h2></div>
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" /> {dateLabel(metadata.releaseDate)}</span>
                {metadata.providerPlatforms.slice(0, 5).map((platform, index) => <span key={`${platform}-${index}`} className="max-w-full break-words rounded-md bg-muted px-2 py-1">{platform}</span>)}
                {metadata.providerPlatforms.length > 5 ? <span className="rounded-md bg-muted px-2 py-1">+{metadata.providerPlatforms.length - 5}</span> : null}
              </div>

              {genres.length ? <div className="flex flex-wrap gap-2">{genres.map(genre => <span key={genre} className="rounded-full border border-border/60 px-2.5 py-1 text-xs font-bold text-muted-foreground">{genre}</span>)}</div> : null}

              {existing ? <div className="flex min-w-0 items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2 text-sm font-bold text-primary"><Check className="size-4 shrink-0" /> <span className="break-words">{trackedLabel}</span> <span className="shrink-0 font-normal text-muted-foreground">in your Games</span></div> : possibleMatch ? <div className="break-words rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-200">Possible match: {possibleMatch.title}. Review before adding a second record.</div> : null}

              <div className="flex flex-wrap gap-2">
                {existing ? isWishlist ? <><button type="button" onClick={() => closeAfter(() => onOpenGame(existing))} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-black text-primary-foreground"><Gamepad2 className="size-4" /> Open Game</button><button type="button" onClick={() => onUpdateStatus(existing, 'backlog')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/60 px-3.5 text-xs font-black hover:bg-muted"><Library className="size-4" /> Add to Library</button><button type="button" onClick={() => onUpdateStatus(existing, 'playing')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/60 px-3.5 text-xs font-black hover:bg-muted"><Play className="size-4" /> Start Playing</button></> : <button type="button" onClick={() => closeAfter(() => onOpenGame(existing))} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-black text-primary-foreground"><Gamepad2 className="size-4" /> Open Game</button> : <><button type="button" onClick={() => onAddCatalog(result, 'wishlist')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-black text-primary-foreground"><Star className="size-4" /> Add to Wishlist</button><button type="button" onClick={() => onAddCatalog(result, 'backlog')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/60 px-3.5 text-xs font-black hover:bg-muted"><Library className="size-4" /> Add to Library</button></>}
              </div>

              {detailsLoading ? <p role="status" className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading game details…</p> : null}
              {detailsError ? <p role="status" className="text-xs text-muted-foreground">Some catalog details are unavailable. The game preview is still usable.</p> : null}

              {details?.description ? <section><h3 className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">About</h3><p className="mt-2 max-w-prose break-words text-sm leading-6 text-foreground/85">{details.description}</p></section> : null}

              <section className="grid gap-3 rounded-xl border border-border/50 bg-background/35 p-3 sm:grid-cols-2"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Details</p><dl className="mt-2 space-y-1.5 text-xs"><div className="flex justify-between gap-3"><dt className="shrink-0 text-muted-foreground">Developer</dt><dd className="min-w-0 break-words text-right font-bold">{details?.developers?.join(', ') || 'Unavailable'}</dd></div><div className="flex justify-between gap-3"><dt className="shrink-0 text-muted-foreground">Publisher</dt><dd className="min-w-0 break-words text-right font-bold">{details?.publishers?.join(', ') || 'Unavailable'}</dd></div><div className="flex justify-between gap-3"><dt className="shrink-0 text-muted-foreground">Release</dt><dd className="min-w-0 break-words text-right font-bold">{dateLabel(metadata.releaseDate)}</dd></div></dl></div><div><p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Ratings</p><div className="mt-2 space-y-1.5 text-xs"><p className="flex justify-between gap-3"><span className="text-muted-foreground">Rating</span><strong>{rating || 'Unavailable'}</strong></p><p className="flex justify-between gap-3"><span className="text-muted-foreground">Metacritic</span><strong>{metacritic || 'Unavailable'}</strong></p></div></div></section>

              {details?.screenshots?.length ? <section><h3 className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Media</h3><div className="mt-2 grid grid-cols-3 gap-2">{details.screenshots.slice(0, 6).map((screenshot, index) => <ResilientImage key={`${screenshot}-${index}`} src={screenshot} alt="" loading="lazy" decoding="async" className="aspect-video w-full rounded-lg object-cover" fallback={<span className="grid aspect-video w-full place-items-center rounded-lg bg-muted text-xs text-muted-foreground">Unavailable</span>} />)}</div></section> : null}

              {stores.length ? <section><h3 className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Available on</h3><div className="mt-2 flex flex-wrap gap-2">{stores.map(store => <button key={`${store.name}-${store.url}`} type="button" onClick={() => { void openExternalLink(normalizeExternalWebUrl(store.url)!); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border/60 px-3 text-xs font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ExternalLink className="size-3.5" /> <span className="break-words">{store.name}</span></button>)}</div></section> : null}
              {officialWebsite ? <button type="button" onClick={() => { void openExternalLink(officialWebsite); }} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-black text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ExternalLink className="size-3.5" /> Official Website</button> : null}
              <p className="text-xs text-muted-foreground">Game data and images from <a href="https://rawg.io" target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2">RAWG</a></p>
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
