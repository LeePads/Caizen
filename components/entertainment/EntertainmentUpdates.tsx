'use client';

import { CalendarClock, Check, MoreVertical, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ResilientImage } from '@/components/media/ResilientImage';
import { EntryActionSheet, type EntryAction } from '@/components/common/EntryActionSheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { MediaItem } from '@/lib/types';
import {
  formatMediaProgressAction,
  formatMediaUpdateDescription,
  formatNextRelease,
} from '@/lib/entertainment/presentation';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

function mediaTypeLabel(type: MediaItem['type']) {
  switch (type) {
    case 'anime': return 'Anime';
    case 'manga': return 'Manga';
    case 'series': return 'TV';
    case 'movie': return 'Movie';
  }
}

export default function EntertainmentUpdates({
  items,
  watchLinks,
  syncingIds,
  onRefresh,
  onAcknowledge,
  onProgress,
  onWatch,
  onOpen,
  refreshPhase = 'idle',
  checkingCount = 0,
  failedCount = 0,
  hydrated = true,
  androidPresentation = false,
}: {
  items: MediaItem[];
  watchLinks: ReadonlyMap<string, string>;
  syncingIds: Set<string>;
  onRefresh: (item: MediaItem) => void;
  onAcknowledge: (item: MediaItem) => void;
  onProgress: (item: MediaItem) => void;
  onWatch: (item: MediaItem) => void;
  onOpen: (item: MediaItem) => void;
  refreshPhase?: 'idle' | 'verifying' | 'settled';
  checkingCount?: number;
  failedCount?: number;
  hydrated?: boolean;
  androidPresentation?: boolean;
}) {
  const statusMessage = refreshPhase === 'verifying'
    ? `Checking ${checkingCount} ${checkingCount === 1 ? 'title' : 'titles'} for updates…`
    : failedCount > 0
      ? `Couldn’t check ${failedCount} ${failedCount === 1 ? 'title' : 'titles'}; showing saved update information.`
      : '';

  if (items.length === 0) {
    const isLoading = !hydrated || refreshPhase === 'verifying';
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 px-5 py-16 text-center">
        {isLoading ? <RefreshCw className="mx-auto h-7 w-7 animate-spin text-muted-foreground" /> : <Check className="mx-auto h-8 w-8 text-emerald-400" />}
        <h3 className="mt-4 text-lg font-black">{!hydrated ? 'Loading saved updates' : refreshPhase === 'verifying' ? 'Checking saved updates' : failedCount > 0 ? 'Saved update information is available' : 'You are caught up'}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {statusMessage || (!hydrated ? 'Your profile’s saved media is loading.' : 'Catalog-linked anime, manga, TV, and movie entries will appear here when their providers report an update.')}
        </p>
      </div>
    );
  }

  if (androidPresentation) {
    return (
      <div className="space-y-3">
        {statusMessage ? <p role="status" className="px-1 text-xs font-semibold text-muted-foreground">{statusMessage}</p> : null}
        <div className="grid gap-3">
          {items.map(item => (
            <AndroidUpdateCard
              key={item.id}
              item={item}
              watchAvailable={watchLinks.has(item.id)}
              syncing={syncingIds.has(item.id)}
              onWatch={() => onWatch(item)}
              onProgress={() => onProgress(item)}
              onAcknowledge={() => onAcknowledge(item)}
              onRefresh={() => onRefresh(item)}
              onOpen={() => onOpen(item)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {statusMessage ? <p role="status" className="px-1 text-xs font-semibold text-muted-foreground">{statusMessage}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map(item => (
        <article key={item.id} className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/75 shadow-sm transition-[border-color,box-shadow] hover:border-primary/25 hover:shadow-md">
          <div className="grid min-w-0 grid-cols-[92px_minmax(0,1fr)] gap-4 p-4">
            <button type="button" onClick={() => onOpen(item)} aria-label={`Open ${item.title}`} className="aspect-[2/3] overflow-hidden rounded-2xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ResilientImage src={item.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<span aria-hidden="true" className="grid h-full place-items-center px-2 text-center text-xs text-muted-foreground">No cover</span>} />
            </button>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">{mediaTypeLabel(item.type)}</p>
              <button type="button" onClick={() => onOpen(item)} aria-label={`Open ${item.title}`} className="min-h-11 max-w-full rounded-md break-words text-left text-lg font-black leading-tight transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {item.title}
              </button>
              <p className="mt-2 break-words text-sm font-bold">{formatMediaUpdateDescription(item)}</p>
              {formatNextRelease(item) ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {formatNextRelease(item)}
                </p>
              ) : null}

              <div className="mt-4 flex items-center gap-2">
                {watchLinks.has(item.id) ? (
                  <Button type="button" size="sm" onClick={() => onWatch(item)} className="min-h-11 w-auto min-w-[8.5rem] max-w-[12rem] flex-none whitespace-nowrap rounded-xl px-3" aria-label={`Watch ${item.title}`}>
                    Watch
                  </Button>
                ) : item.type !== 'movie' ? (
                  <Button type="button" size="sm" onClick={() => onProgress(item)} className="min-h-11 w-auto min-w-[8.5rem] max-w-[12rem] flex-none whitespace-nowrap rounded-xl px-3">
                    {formatMediaProgressAction(item)}
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={() => onOpen(item)} className="min-h-11 w-auto min-w-[8.5rem] max-w-[12rem] flex-none whitespace-nowrap rounded-xl px-3">Details</Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`More actions for ${item.title}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <MoreVertical className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => onOpen(item)}>Details</DropdownMenuItem>
                    {item.type !== 'movie' && watchLinks.has(item.id) ? <DropdownMenuItem onSelect={() => onProgress(item)}>{formatMediaProgressAction(item)}</DropdownMenuItem> : null}
                    <DropdownMenuItem onSelect={() => onAcknowledge(item)}>Mark Seen</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onRefresh(item)} disabled={syncingIds.has(item.id)}>
                      <RefreshCw className={`mr-2 size-4 ${syncingIds.has(item.id) ? 'animate-spin' : ''}`} /> Refresh metadata
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </article>
        ))}
      </div>
    </div>
  );
}

function AndroidUpdateCard({
  item,
  watchAvailable,
  syncing,
  onWatch,
  onProgress,
  onAcknowledge,
  onRefresh,
  onOpen,
}: {
  item: MediaItem;
  watchAvailable: boolean;
  syncing: boolean;
  onWatch: () => void;
  onProgress: () => void;
  onAcknowledge: () => void;
  onRefresh: () => void;
  onOpen: () => void;
}) {
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const actions: EntryAction[] = [
    { id: 'open', label: 'Open details', onSelect: onOpen },
    ...(item.type !== 'movie' ? [{ id: 'log' as const, label: formatMediaProgressAction(item), onSelect: onProgress }] : []),
    { id: 'finish', label: 'Mark Seen', onSelect: onAcknowledge },
    { id: 'source', label: 'Refresh metadata', onSelect: onRefresh },
  ];

  return (
    <>
      <article className="android-entertainment-update-card min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm">
        <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 p-3">
          <button type="button" onClick={onOpen} aria-label={`Open ${item.title}`} className="aspect-[2/3] overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ResilientImage src={item.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<span aria-hidden="true" className="grid h-full place-items-center px-1 text-center text-[10px] text-muted-foreground">No cover</span>} />
          </button>
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">{mediaTypeLabel(item.type)}</p>
                <OverflowTooltip text={item.title} mode="clamped"><h3 className="mt-1 line-clamp-2 break-words text-base font-black leading-tight">{item.title}</h3></OverflowTooltip>
              </div>
              <button type="button" onClick={() => setActionSheetOpen(true)} className="android-touch-target grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Actions for ${item.title}`}>
                <MoreVertical className="size-5" />
              </button>
            </div>
            <p className="mt-2 text-sm font-black">{formatMediaUpdateDescription(item)}</p>
            {formatNextRelease(item) ? <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground"><CalendarClock className="mt-0.5 size-3.5 shrink-0" /> <span>{formatNextRelease(item)}</span></p> : null}
            <div className="mt-3 flex items-center gap-2">
              <Button type="button" onClick={watchAvailable ? onWatch : item.type !== 'movie' ? onProgress : onOpen} className="android-touch-target h-11 min-w-0 flex-1 rounded-xl px-3 text-xs font-black">
                {watchAvailable ? 'Watch' : item.type !== 'movie' ? formatMediaProgressAction(item) : 'Details'}
              </Button>
              {syncing ? <RefreshCw className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Refreshing metadata" /> : null}
            </div>
          </div>
        </div>
      </article>
      <EntryActionSheet
        open={actionSheetOpen}
        androidPresentation
        title={item.title}
        subtitle={`${mediaTypeLabel(item.type)} · ${formatMediaUpdateDescription(item)}`}
        onClose={() => setActionSheetOpen(false)}
        actions={actions}
      />
    </>
  );
}
