'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Gamepad2, X } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import type { Game, GameGenre, GamePlatform } from '@/lib/types';
import type { RawgGameResult } from '@/lib/games/rawg';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { Button } from '@/components/ui/button';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { GAME_GENRES, gameGenreLabel, providerGenre, wishlistGameFields } from '@/lib/games/game-form';
import { ResilientImage } from '@/components/media/ResilientImage';

const PLATFORM_OPTIONS = [
  { value: 'pc', label: 'PC' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'console', label: 'Console' },
];

const GENRE_OPTIONS = GAME_GENRES.map(value => ({
  value,
  label: gameGenreLabel(value),
}));

function dateLabel(value?: string) {
  if (!value) return 'Release date unavailable';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? 'Release date unavailable'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function GameWishlistReviewDialog({
  isOpen,
  result,
  onClose,
  onOpenGame,
}: {
  isOpen: boolean;
  result: RawgGameResult;
  onClose: () => void;
  onOpenGame: (game: Game) => void;
}) {
  const { games, addGame } = useAppContext();
  const [platform, setPlatform] = useState<GamePlatform>('pc');
  const [genre, setGenre] = useState<GameGenre>('other');
  const [notes, setNotes] = useState('');
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPlatform('pc');
    setGenre(providerGenre(result.genre));
    setNotes('');
  }, [isOpen, result]);

  const { close, closeAfter, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });
  useOverlayLifecycle(isOpen, close, { lockScroll: false, autoFocus: true, containerRef: panelRef });

  const save = () => {
    const exactMatch = games.find(game => game.rawgId && game.rawgId === result.rawgId);
    if (exactMatch) {
      closeAfter(() => onOpenGame(exactMatch));
      return;
    }
    addGame(wishlistGameFields(result, platform, genre, notes));
    toast({ title: 'Added to wishlist', description: `${result.title} is ready in your Games workspace.` });
    close();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[11500] flex items-end justify-center bg-transparent p-3 sm:items-center sm:p-4"
      data-caizen-overlay={isClosing ? 'closing' : 'open'}
      data-state={isClosing ? 'closed' : 'open'}
      onMouseDown={event => { if (event.target === event.currentTarget) close(); }}
    >
      <button type="button" aria-label="Close wishlist review backdrop" onClick={close} className="motion-modal-backdrop absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="wishlist-review-title" aria-describedby="wishlist-review-description" className="caizen-sheet-panel relative flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border/60 bg-card shadow-2xl sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/50 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="wishlist-review-title" className="text-2xl font-black tracking-tight">Add to Wishlist</h2>
            <p id="wishlist-review-description" className="mt-1 text-sm text-muted-foreground">Save the game with a few personal details.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close wishlist review" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-5" /></button>
        </header>

        <div className="min-h-0 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-6">
          <div className="flex items-center gap-3 rounded-2xl border border-border/55 bg-background/35 p-3">
            <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
              <ResilientImage src={result.image} alt="" loading="eager" decoding="async" className="h-full w-full object-cover" fallback={<div className="grid h-full place-items-center"><Gamepad2 className="size-8 text-muted-foreground/40" aria-hidden="true" /></div>} />
            </div>
            <div className="min-w-0">
              <h3 className="break-words text-lg font-black">{result.title || 'Untitled game'}</h3>
            </div>
          </div>

          <section className="mt-5 space-y-3" aria-labelledby="wishlist-catalog-details">
            <h3 id="wishlist-catalog-details" className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Catalog details</h3>
            <div className="grid gap-2 rounded-xl border border-border/50 bg-background/25 p-3 text-xs sm:grid-cols-2">
              <p className="inline-flex items-center gap-2 text-muted-foreground"><CalendarDays className="size-3.5" /><span><strong className="text-foreground">Release:</strong> {dateLabel(result.releaseDate)}</span></p>
              <p className="break-words text-muted-foreground"><strong className="text-foreground">Platforms:</strong> {result.providerPlatforms.length ? result.providerPlatforms.slice(0, 4).join(', ') : 'Unavailable'}</p>
              {result.genre ? <p className="break-words text-muted-foreground sm:col-span-2"><strong className="text-foreground">Catalog genre:</strong> {result.genre}</p> : null}
            </div>
            <p className="text-xs text-muted-foreground">Game data and images from <a href="https://rawg.io" target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2">RAWG</a></p>
          </section>

          <section className="mt-5 space-y-3" aria-labelledby="wishlist-personal-details">
            <h3 id="wishlist-personal-details" className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Personal details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <AndroidAdaptiveSelect label="Personal platform" value={platform} onChange={value => setPlatform(value as GamePlatform)} className="control-input" options={PLATFORM_OPTIONS} />
              <AndroidAdaptiveSelect label="Personal genre" value={genre} onChange={value => setGenre(value as GameGenre)} className="control-input" options={GENRE_OPTIONS} />
            </div>
            <label className="block"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes (optional)</span><textarea value={notes} onChange={event => setNotes(event.target.value.slice(0, 2000))} maxLength={2000} className="mt-2 min-h-24 w-full rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Why do you want to play it?" /></label>
          </section>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-border/50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5 sm:pb-5">
          <Button type="button" variant="outline" onClick={onClose} className="min-h-11 rounded-xl">Cancel</Button>
          <Button type="button" onClick={save} className="min-h-11 rounded-xl">Add to Wishlist</Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
