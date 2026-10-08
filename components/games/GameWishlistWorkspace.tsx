'use client';

import { useMemo, useState } from 'react';
import { Gamepad2, Library, Search, Sparkles } from 'lucide-react';
import type { Game } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { toLocalDateKey } from '@/lib/date-utils';
import GameCatalogCard from '@/components/games/GameCatalogCard';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';

type SortMode = 'release' | 'recent' | 'title';

export default function GameWishlistWorkspace({
  games,
  onEdit,
  onUpdateStatus,
  onDiscover,
  onAddManual,
}: {
  games: Game[];
  onEdit: (game: Game) => void;
  onUpdateStatus: (game: Game, status: 'backlog' | 'playing') => void;
  onDiscover: () => void;
  onAddManual: () => void;
}) {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('all');
  const [releaseState, setReleaseState] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('release');
  const wishlistGames = useMemo(() => games.filter(game => game.status === 'wishlist' || game.status === 'upcoming'), [games]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const today = toLocalDateKey(new Date());
    return [...wishlistGames]
      .filter(game => platform === 'all' || game.platform === platform)
      .filter(game => releaseState === 'all' || (releaseState === 'released' ? Boolean(game.releaseDate && toLocalDateKey(game.releaseDate)! <= today) : Boolean(game.releaseDate && toLocalDateKey(game.releaseDate)! > today)))
      .filter(game => !needle || `${game.title} ${game.genre} ${game.notes || ''} ${(game.providerPlatforms || []).join(' ')}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => {
        if (sortMode === 'title') return a.title.localeCompare(b.title);
        if (sortMode === 'recent') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        const aDate = a.releaseDate ? new Date(a.releaseDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.releaseDate ? new Date(b.releaseDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aDate - bDate || a.title.localeCompare(b.title);
      });
  }, [platform, query, releaseState, sortMode, wishlistGames]);
  const collectionRevealRef = useCollectionReveal(
    filtered.map(game => game.id),
    [platform, releaseState, sortMode],
  );

  return (
    <section className="space-y-5" aria-labelledby="games-wishlist-title">
      <div className="rounded-2xl border border-border/55 bg-card/70 p-4 sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="games-wishlist-title" className="text-2xl font-black tracking-tight">Wishlist</h2><p className="mt-1 text-sm text-muted-foreground">Games you want to play later.</p></div><span className="text-xs font-bold text-muted-foreground">{wishlistGames.length} saved</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_170px_170px]"><label className="relative block sm:col-span-2 lg:col-span-1"><Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input aria-label="Search wishlist" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} className="control-input pl-11" placeholder="Search wishlist…" /></label><AndroidAdaptiveSelect label="Filter wishlist by platform" value={platform} onChange={setPlatform} className="control-input" options={[{ value: 'all', label: 'All platforms' }, { value: 'pc', label: 'PC' }, { value: 'mobile', label: 'Mobile' }, { value: 'console', label: 'Console' }]} /><AndroidAdaptiveSelect label="Sort wishlist" value={sortMode} onChange={value => setSortMode(value as SortMode)} className="control-input" options={[{ value: 'release', label: 'Release date' }, { value: 'recent', label: 'Recently added' }, { value: 'title', label: 'Title A–Z' }]} /></div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Wishlist release filters">{(['all', 'released', 'unreleased'] as const).map(value => <button key={value} type="button" onClick={() => setReleaseState(value)} aria-pressed={releaseState === value} className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${releaseState === value ? 'border-primary/20 bg-primary/12 text-primary' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{value === 'all' ? 'All releases' : value === 'released' ? 'Released' : 'Unreleased'}</button>)}</div>
      </div>

      {!wishlistGames.length ? <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-6 py-16 text-center"><Sparkles className="mx-auto size-10 text-muted-foreground/50" /><h2 className="mt-4 text-xl font-black">No games on your wishlist</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Save games you want to play later.</p><div className="mt-5 flex justify-center gap-2"><Button type="button" onClick={onDiscover} className="min-h-11 rounded-xl">Discover games</Button><Button type="button" variant="outline" onClick={onAddManual} className="min-h-11 rounded-xl">Add manually</Button></div></div> : !filtered.length ? <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center"><Gamepad2 className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm text-muted-foreground">No wishlist games match these filters.</p><button type="button" onClick={() => { setQuery(''); setPlatform('all'); setReleaseState('all'); }} className="mt-3 min-h-11 rounded-xl border border-border/60 px-3 text-xs font-black text-primary">Clear filters</button></div> : <div ref={collectionRevealRef} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(game => <GameCatalogCard key={game.id} game={game} onSelect={() => onEdit(game)} footer={<><div className="flex flex-wrap gap-2 border-t border-border/45 pt-3"><button type="button" onClick={() => onUpdateStatus(game, 'backlog')} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-black text-muted-foreground hover:bg-muted hover:text-foreground"><Library className="size-4" /> Add to Library</button><button type="button" onClick={() => onUpdateStatus(game, 'playing')} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 text-xs font-black text-primary-foreground">Start Playing</button></div>{game.notes?.trim() ? <p className="border-t border-border/45 pt-3 text-xs text-muted-foreground">{game.notes.trim()}</p> : null}</>} />)}</div>}
    </section>
  );
}
