'use client';

import type { ReactNode } from 'react';
import { CalendarDays, Gamepad2, Star } from 'lucide-react';
import { ResilientImage } from '@/components/media/ResilientImage';
import type { Game } from '@/lib/types';
import type { RawgGameResult } from '@/lib/games/rawg';
import { toLocalDateKey } from '@/lib/date-utils';
import { gameGenreLabel, gamePlatformLabel, gameStatusLabel } from '@/lib/games/game-form';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

function formatDate(value?: string | Date) {
  const key = toLocalDateKey(value);
  if (!key) return 'Release date unavailable';
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Release date unavailable';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function releaseLabel(value?: string | Date, personalStatus?: string) {
  if (personalStatus) {
    if (personalStatus === 'upcoming') return 'In Wishlist · Upcoming';
    if (personalStatus === 'wishlist') return 'In Wishlist';
    return gameStatusLabel(personalStatus);
  }
  const key = toLocalDateKey(value);
  if (!key) return 'Release date unavailable';
  return key > toLocalDateKey(new Date()) ? `Coming ${formatDate(value)}` : `Released ${formatDate(value)}`;
}

function platformLabels(game?: Game, result?: RawgGameResult) {
  const values = result?.providerPlatforms?.length ? result.providerPlatforms : game?.providerPlatforms || [];
  if (!values.length && game) return [gamePlatformLabel(game.platform)];
  return values.slice(0, 3);
}

export default function GameCatalogCard({
  result,
  game,
  onSelect,
  footer,
}: {
  result?: RawgGameResult;
  game?: Game;
  onSelect: () => void;
  footer?: ReactNode;
}) {
  const title = result?.title || game?.title || 'Untitled game';
  const image = result?.image || game?.image;
  const releaseDate = result?.releaseDate || game?.releaseDate;
  const platforms = platformLabels(game, result);
  const genre = result?.genre || (game?.genre && gameGenreLabel(game.genre));
  const status = game ? gameStatusLabel(game.status) : null;
  const rating = result?.rating && result.rating > 0 ? result.rating.toFixed(1) : null;
  const metacritic = result?.metacritic && result.metacritic > 0 ? String(result.metacritic) : null;

  return (
    <article data-caizen-collection-item="true" className="group min-w-0 overflow-hidden rounded-2xl border border-border/55 bg-card/75 shadow-sm transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-lg focus-within:border-primary/30 focus-within:shadow-md">
      <div className="relative">
        <button type="button" onClick={onSelect} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" aria-label={`Preview ${title}`}>
          <div className="relative aspect-[16/10] overflow-hidden bg-muted/55">
            <ResilientImage
              src={image}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.035]"
              fallback={<div className="grid h-full place-items-center"><Gamepad2 className="size-10 text-muted-foreground/35" aria-hidden="true" /></div>}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3.5 text-white sm:p-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.13em] text-white/70"><span>{status || (result?.genre || 'Catalog')}</span>{game?.favorite ? <Star className="size-3.5 fill-current text-amber-300" /> : null}</div><OverflowTooltip text={title} mode="clamped"><h3 className="mt-1 line-clamp-2 text-lg font-black leading-tight sm:text-xl">{title}</h3></OverflowTooltip></div>
          </div>
        </button>
      </div>

      <div className="p-3.5 sm:p-4">
        <button type="button" onClick={onSelect} className="block w-full space-y-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-muted-foreground"><CalendarDays className="size-3.5 shrink-0" /><span className="truncate">{releaseLabel(releaseDate, game?.status)}</span></div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">{platforms.map((platform, index) => <span key={`${platform}-${index}`} className="max-w-full break-words rounded-md bg-muted/75 px-1.5 py-1">{platform}</span>)}{((result?.providerPlatforms?.length || game?.providerPlatforms?.length || 0) > 3) ? <span className="rounded-md bg-muted/75 px-1.5 py-1">+{(result?.providerPlatforms || game?.providerPlatforms || []).length - 3}</span> : null}{genre ? <span className="min-w-0 max-w-full break-words">{genre}</span> : null}</div>
          {(rating || metacritic) ? <div className="flex flex-wrap items-center gap-3 text-xs font-black text-foreground">{rating ? <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-current text-amber-500" /> {rating}</span> : null}{metacritic ? <span><span className="text-muted-foreground">Metacritic</span> {metacritic}</span> : null}</div> : null}
        </button>
        {footer ? <div className="mt-3">{footer}</div> : null}
      </div>
    </article>
  );
}
