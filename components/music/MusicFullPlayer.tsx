'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import {
  ChevronDown,
  ExternalLink,
  ArrowDown,
  Keyboard,
  ListMusic,
  ListPlus,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { ResilientImage } from '@/components/media/ResilientImage';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import {
  getMusicArtwork,
  getRepeatLabel,
  getSpotifyUnavailableCopy,
  type MusicPlaybackCapabilities,
  type MusicPlaybackMode,
  type MusicPlaybackState,
  type RepeatMode,
} from '@/lib/music-player';
import type { MusicItem } from '@/lib/types';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type PlayerTab = 'queue' | 'playlists' | 'lyrics';

type TimedLyric = {
  id: string;
  time: number;
  text: string;
};

type AnchorRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const VIEWPORT_PADDING = 12;
const MENU_GAP = 8;
const LYRICS_FOLLOW_KEY = 'caizen-music-lyrics-follow';
const FULL_PLAYER_QUEUE_BATCH_SIZE = 50;

function parseLrc(lyrics?: string): TimedLyric[] {
  if (!lyrics) return [];

  const offsetMatch = lyrics.match(/\[offset:([+-]?\d+)\]/i);
  const offsetSeconds = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const timedLines: TimedLyric[] = [];

  lyrics.split(/\r?\n/).forEach((line, lineIndex) => {
    const timestampMatches = Array.from(
      line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g),
    );

    if (timestampMatches.length === 0) return;

    const text =
      line
        .replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '')
        .trim() || '♪';

    timestampMatches.forEach((match, timestampIndex) => {
      const fractionText = match[3] || '0';
      const fraction =
        Number(fractionText) / Math.pow(10, fractionText.length);
      const rawTime =
        Number(match[1]) * 60 + Number(match[2]) + fraction + offsetSeconds;

      timedLines.push({
        id: `${lineIndex}-${timestampIndex}-${match[1]}-${match[2]}-${fractionText}`,
        time: Math.max(0, rawTime),
        text,
      });
    });
  });

  return timedLines.sort((a, b) => a.time - b.time);
}

function isYouTubeItem(item: MusicItem) {
  return /(?:youtube\.com|youtu\.be)/i.test(item.url || '');
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function getPreferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}

function scrollChildWithinContainer(
  container: HTMLElement | null,
  child: HTMLElement | null,
) {
  if (!container || !child) return;

  const containerRect = container.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  const targetTop =
    container.scrollTop +
    childRect.top -
    containerRect.top -
    container.clientHeight / 2 +
    childRect.height / 2;

  container.scrollTo({
    top: Math.max(0, targetTop),
    behavior: getPreferredScrollBehavior(),
  });
}

export type QueueRowAction =
  | 'play-next'
  | 'move-to-end'
  | 'add-to-queue'
  | 'remove'
  | 'edit'
  | 'delete'
  | 'open-source'
  | 'open-youtube'
  | 'open-youtube-music';

/**
 * Dedicated full-player surface.
 *
 * The provider owns the persistent media iframe. This component supplies a
 * stable video slot, metadata, transport actions, queue, playlists and lyrics.
 * Minimising the full player should preserve the provider playback session;
 * Stop is the explicit action that ends playback.
 */
export function MusicFullPlayer({
  activeItem,
  artwork,
  capabilityText,
  capabilities,
  spotifyEmbedType,
  playbackMode,
  playbackError,
  spotifyUnavailableReason,
  isBuffering,
  progress,
  onSeek,
  isPlaying,
  shuffleEnabled,
  repeatMode,
  queueItems,
  activeId,
  playlists,
  onSelectPlaylist,
  onClose,
  onOpenSource,
  onTogglePlayback,
  onNext,
  onPrevious,
  onShuffle,
  onRepeat,
  onSelectQueueItem,
  onClearQueue,
  onStop,
  onRowAction,
}: {
  activeItem: MusicItem;
  artwork: string;
  capabilityText: string;
  capabilities: MusicPlaybackCapabilities;
  spotifyEmbedType?: string;
  playbackMode: MusicPlaybackMode;
  playbackError: string | null;
  spotifyUnavailableReason: MusicPlaybackState['unavailableReason'];
  isBuffering: boolean;
  progress: { position: number; duration: number };
  onSeek: (seconds: number) => void;
  isPlaying: boolean;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  queueItems: MusicItem[];
  activeId: string | null;
  playlists: string[];
  onSelectPlaylist: (playlist: string) => void;
  onClose: () => void;
  onOpenSource: () => void;
  onTogglePlayback: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onShuffle: () => void;
  onRepeat: () => void;
  onSelectQueueItem: (id: string) => void;
  onClearQueue: () => void;
  onStop: () => void;
  onRowAction: (action: QueueRowAction, item: MusicItem) => void;
}) {
  const [tab, setTab] = useState<PlayerTab>('queue');
  const [queueVisibleCount, setQueueVisibleCount] = useState(
    FULL_PLAYER_QUEUE_BATCH_SIZE,
  );
  const [menuItem, setMenuItem] = useState<MusicItem | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const [menuPosition, setMenuPosition] = useState({
    x: VIEWPORT_PADDING,
    y: VIEWPORT_PADDING,
  });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MusicItem | null>(null);
  const [lyricsFollowEnabled, setLyricsFollowEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(LYRICS_FOLLOW_KEY) !== 'false';
  });
  const [lyricsOffsetSeconds, setLyricsOffsetSeconds] = useState(0);

  const playerRef = useRef<HTMLElement>(null);
  const minimizeButtonRef = useRef<HTMLButtonElement>(null);
  const shortcutsButtonRef = useRef<HTMLButtonElement>(null);
  const shortcutsCloseRef = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const shortcutsPanelRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Record<PlayerTab, HTMLButtonElement | null>>({
    queue: null,
    playlists: null,
    lyrics: null,
  });
  const fullPlayerListRef = useRef<HTMLDivElement>(null);
  const activeQueueRowRef = useRef<HTMLDivElement>(null);
  const lyricLineRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const availableTabs: PlayerTab[] = activeItem.lyrics
    ? ['queue', 'playlists', 'lyrics']
    : ['queue', 'playlists'];
  const activeTab = availableTabs.includes(tab) ? tab : 'queue';
  const activeQueueIndex = useMemo(
    () =>
      activeId
        ? queueItems.findIndex(queueItem => queueItem.id === activeId)
        : -1,
    [activeId, queueItems],
  );
  const renderedQueueCount = Math.min(queueItems.length, queueVisibleCount);
  const queueWindowStart =
    activeQueueIndex >= renderedQueueCount
      ? Math.max(0, activeQueueIndex - Math.floor(renderedQueueCount / 2))
      : 0;
  const visibleQueueItems = queueItems.slice(
    queueWindowStart,
    queueWindowStart + renderedQueueCount,
  );

  const timedLyrics = useMemo(
    () => parseLrc(activeItem.lyrics),
    [activeItem.lyrics],
  );

  const activeLyricIndex = useMemo(
    () =>
      timedLyrics.reduce(
        (current, line, index) =>
          line.time <= progress.position + lyricsOffsetSeconds
            ? index
            : current,
        -1,
      ),
    [lyricsOffsetSeconds, progress.position, timedLyrics],
  );

  const menuQueueIndex = useMemo(
    () =>
      menuItem
        ? queueItems.findIndex(queueItem => queueItem.id === menuItem.id)
        : -1,
    [menuItem, queueItems],
  );

  const closeShortcuts = useCallback(() => {
    setShowShortcuts(false);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuItem(null);
    setMenuAnchor(null);
    requestAnimationFrame(() => menuTriggerRef.current?.focus({ preventScroll: true }));
  }, []);

  const playerStyle = {
    '--cz-player-artwork': artwork
      ? `url(${JSON.stringify(artwork)})`
      : 'none',
  } as CSSProperties;

  useOverlayLifecycle(true, onClose, {
    containerRef: playerRef,
    initialFocusRef: minimizeButtonRef,
  });

  useOverlayLifecycle(Boolean(menuItem), closeMenu, {
    containerRef: menuRef,
    initialFocusSelector: 'button:not([disabled])',
  });

  useOverlayLifecycle(showShortcuts, closeShortcuts, {
    containerRef: shortcutsPanelRef,
    initialFocusRef: shortcutsCloseRef,
  });

  useEffect(() => {
    window.localStorage.setItem(
      LYRICS_FOLLOW_KEY,
      String(lyricsFollowEnabled),
    );
  }, [lyricsFollowEnabled]);

  useEffect(() => {
    setLyricsOffsetSeconds(0);
  }, [activeItem.id]);

  useEffect(() => {
    if (tab === 'lyrics' && !activeItem.lyrics) {
      setTab('queue');
    }
  }, [activeItem.id, activeItem.lyrics, tab]);

  useEffect(() => {
    setQueueVisibleCount(FULL_PLAYER_QUEUE_BATCH_SIZE);
  }, [queueItems]);

  useEffect(() => {
    if (activeTab !== 'queue' || !activeId) return;

    requestAnimationFrame(() => {
      scrollChildWithinContainer(
        fullPlayerListRef.current,
        activeQueueRowRef.current,
      );
    });
  }, [activeId, activeTab, queueWindowStart, renderedQueueCount]);

  useEffect(() => {
    if (
      activeTab !== 'lyrics' ||
      !lyricsFollowEnabled ||
      activeLyricIndex < 0
    ) {
      return;
    }

    requestAnimationFrame(() => {
      scrollChildWithinContainer(
        fullPlayerListRef.current,
        lyricLineRefs.current[activeLyricIndex],
      );
    });
  }, [activeLyricIndex, activeTab, lyricsFollowEnabled]);

  useEffect(() => {
    if (!menuItem) return;

    const closeAnchoredMenu = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        // The menu owns its scroll surface. Scrolling it must not be treated as
        // an outside dismissal.
        return;
      }

      setMenuItem(null);
      setMenuAnchor(null);
    };

    window.addEventListener('resize', closeAnchoredMenu);
    window.addEventListener('scroll', closeAnchoredMenu, true);

    return () => {
      window.removeEventListener('resize', closeAnchoredMenu);
      window.removeEventListener('scroll', closeAnchoredMenu, true);
    };
  }, [menuItem]);

  useLayoutEffect(() => {
    if (!menuItem || !menuAnchor || !menuRef.current) return;

    const menu = menuRef.current;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;

    let x = menuAnchor.right - width;
    let y = menuAnchor.bottom + MENU_GAP;

    if (x < VIEWPORT_PADDING) {
      x = menuAnchor.left;
    }

    if (x + width > window.innerWidth - VIEWPORT_PADDING) {
      x = window.innerWidth - width - VIEWPORT_PADDING;
    }

    if (y + height > window.innerHeight - VIEWPORT_PADDING) {
      y = menuAnchor.top - height - MENU_GAP;
    }

    setMenuPosition({
      x: Math.max(
        VIEWPORT_PADDING,
        Math.min(x, window.innerWidth - width - VIEWPORT_PADDING),
      ),
      y: Math.max(
        VIEWPORT_PADDING,
        Math.min(y, window.innerHeight - height - VIEWPORT_PADDING),
      ),
    });
  }, [menuAnchor, menuItem]);

  const runAction = (action: QueueRowAction, item: MusicItem) => {
    if (action === 'delete') {
      closeMenu();
      setPendingDelete(item);
      return;
    }

    closeMenu();
    onRowAction(action, item);
  };

  const openMenu = (
    event: MouseEvent<HTMLButtonElement>,
    item: MusicItem,
  ) => {
    menuTriggerRef.current = event.currentTarget;
    const rect = event.currentTarget.getBoundingClientRect();

    setMenuAnchor({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    });
    setMenuItem(item);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: PlayerTab,
  ) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();

    const currentIndex = availableTabs.indexOf(currentTab);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? availableTabs.length - 1
          : (currentIndex +
              (event.key === 'ArrowRight' ? 1 : -1) +
              availableTabs.length) %
            availableTabs.length;
    const nextTab = availableTabs[nextIndex];
    if (!nextTab) return;

    setTab(nextTab);
    requestAnimationFrame(() => tabRefs.current[nextTab]?.focus());
  };

  return (
    <>
      <button
        type="button"
        className="cz-full-player-backdrop"
        onClick={onClose}
        aria-label="Minimize full player"
      />

      <section
        ref={playerRef}
        className="cz-full-player"
        role="dialog"
        aria-modal="true"
        aria-label={`Player: ${activeItem.title}`}
        data-caizen-overlay="open"
        data-has-artwork={artwork ? 'true' : undefined}
        data-playing={isPlaying ? 'true' : undefined}
        style={playerStyle}
      >
        <header className="cz-full-player-bar">
          <Tooltip><TooltipTrigger asChild><button
            ref={minimizeButtonRef}
            type="button"
            onClick={onClose}
            className="cz-full-player-icon"
            aria-label="Minimize player"
          >
            <ChevronDown className="h-5 w-5" />
          </button></TooltipTrigger><TooltipContent>{"Minimize player"}</TooltipContent></Tooltip>

          <div className="cz-full-player-bar-copy">
            <span>Now playing</span>
            <OverflowTooltip text={activeItem.title}><strong>{activeItem.title}</strong></OverflowTooltip>
          </div>

          <Tooltip><TooltipTrigger asChild><button
            ref={shortcutsButtonRef}
            type="button"
            onClick={() => setShowShortcuts(true)}
            className="cz-full-player-icon"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard className="h-5 w-5" />
          </button></TooltipTrigger><TooltipContent>{"Keyboard shortcuts"}</TooltipContent></Tooltip>

          <Tooltip><TooltipTrigger asChild><button
            type="button"
            onClick={event => openMenu(event, activeItem)}
            className="cz-full-player-icon"
            aria-label="Track actions"
          >
            <MoreVertical className="h-5 w-5" />
          </button></TooltipTrigger><TooltipContent>{"Track actions"}</TooltipContent></Tooltip>
        </header>

        <div className="cz-full-player-stagearea">
          <div
            className="cz-full-player-video-slot"
            data-mode={playbackMode}
            data-spotify-type={spotifyEmbedType}
          >
            {playbackMode === 'external' && (
              <div className="cz-full-player-fallback">
                {artwork ? (
                  <ResilientImage
                    src={artwork}
                    alt=""
                    loading="eager"
                    decoding="async"
                    fallback={<ListMusic className="h-10 w-10" aria-hidden="true" />}
                  />
                ) : (
                  <ListMusic className="h-10 w-10" />
                )}
                <p>This source has no in-app player.</p>
                <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/70 px-3 text-xs font-black hover:bg-muted" onClick={onOpenSource}>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open source
                </button>
              </div>
            )}
          </div>

          <div className="cz-full-player-meta">
            <OverflowTooltip text={activeItem.title} mode="clamped"><strong>{activeItem.title}</strong></OverflowTooltip>
            <OverflowTooltip text={activeItem.artist || 'Unknown artist'}><span>{activeItem.artist || 'Unknown artist'}</span></OverflowTooltip>
            <small>{capabilityText}</small>
          </div>

          {isBuffering && capabilities.canControlPlayback && (
            <p className="cz-full-player-status" role="status">
              Buffering…
            </p>
          )}

          {capabilities.canSeek && (
            <>
              {playbackMode === 'youtube' && (
                <p className="cz-full-player-note">
                  Playback controls are managed by Caizen.
                </p>
              )}
              {progress.duration > 0 && (
                <label className="cz-full-player-seek">
                  <span className="sr-only">Seek through track</span>
                  <span className="cz-full-player-time" aria-hidden="true">{formatTime(progress.position)}</span>
                  <input
                    type="range"
                    min="0"
                    max={progress.duration}
                    step="1"
                    value={Math.min(progress.position, progress.duration)}
                    onChange={event => onSeek(Number(event.target.value))}
                    aria-label={`Seek through ${activeItem.title}`}
                  />
                  <span className="cz-full-player-time" aria-hidden="true">{formatTime(progress.duration)}</span>
                </label>
              )}
            </>
          )}

          {playbackMode === 'spotify' && spotifyUnavailableReason ? (
            <div
              className="mx-auto max-w-[34rem] rounded-2xl border border-dashed border-border/60 bg-background/50 px-4 py-3 text-center"
              role="status"
            >
              <p className="text-xs font-black text-foreground">
                {getSpotifyUnavailableCopy(spotifyUnavailableReason).title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {getSpotifyUnavailableCopy(spotifyUnavailableReason).message}
              </p>
              <button
                type="button"
                className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border/60 px-3 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={onOpenSource}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Resume in Spotify
              </button>
            </div>
          ) : playbackError ? (
            <div className="flex flex-wrap items-center justify-center gap-2" role="alert">
              <p className="cz-full-player-error">{playbackError}</p>
            </div>
          ) : null}

          <div className="cz-full-player-controls">
            <Tooltip><TooltipTrigger asChild><button
              type="button"
              onClick={onShuffle}
              className="cz-full-player-secondary"
              data-active={shuffleEnabled || undefined}
              aria-label="Toggle shuffle"
              aria-pressed={shuffleEnabled}
            >
              <Shuffle className="h-5 w-5" />
            </button></TooltipTrigger><TooltipContent>{"Shuffle"}</TooltipContent></Tooltip>

            <Tooltip><TooltipTrigger asChild><button
              type="button"
              onClick={onPrevious}
              className="cz-full-player-primary"
              aria-label="Select previous queue item"
            >
              <SkipBack className="h-6 w-6" />
            </button></TooltipTrigger><TooltipContent>{"Previous queue item"}</TooltipContent></Tooltip>

            {(capabilities.canControlPlayback || playbackMode === 'spotify') && (
              <Tooltip><TooltipTrigger asChild><button
                type="button"
                onClick={onTogglePlayback}
                disabled={!capabilities.canControlPlayback}
                className="cz-full-player-play"
                aria-label={isPlaying ? 'Pause track' : 'Play track'}
              >
                {isPlaying ? (
                  <Pause className="h-7 w-7" />
                ) : (
                  <Play className="h-7 w-7" />
                )}
              </button></TooltipTrigger><TooltipContent>{isPlaying ? 'Pause track' : 'Play track'}</TooltipContent></Tooltip>
            )}

            <Tooltip><TooltipTrigger asChild><button
              type="button"
              onClick={onNext}
              className="cz-full-player-primary"
              aria-label="Select next queue item"
            >
              <SkipForward className="h-6 w-6" />
            </button></TooltipTrigger><TooltipContent>{"Next queue item"}</TooltipContent></Tooltip>

            <Tooltip><TooltipTrigger asChild><button
              type="button"
              onClick={onRepeat}
              className="cz-full-player-secondary"
              data-active={repeatMode !== 'off' || undefined}
              aria-label={`Repeat: ${getRepeatLabel(repeatMode)}`}
              aria-pressed={repeatMode !== 'off'}
            >
              <Repeat className="h-5 w-5" />
              {repeatMode === 'one' && <small>1</small>}
            </button></TooltipTrigger><TooltipContent>{`Repeat: ${getRepeatLabel(repeatMode)}`}</TooltipContent></Tooltip>
          </div>
        </div>

        <div className="cz-full-player-sheet">
          <div
            className="cz-full-player-tabs"
            role="tablist"
            aria-label="Player views"
            aria-orientation="horizontal"
          >
            <button
              ref={element => {
                tabRefs.current.queue = element;
              }}
              type="button"
              role="tab"
              id="caizen-music-player-tab-queue"
              aria-selected={activeTab === 'queue'}
              aria-controls="caizen-music-player-panel-queue"
              tabIndex={activeTab === 'queue' ? 0 : -1}
              onClick={() => setTab('queue')}
              onKeyDown={event => handleTabKeyDown(event, 'queue')}
              data-active={activeTab === 'queue' || undefined}
            >
              Queue
              <span>{queueItems.length}</span>
            </button>

            <button
              ref={element => {
                tabRefs.current.playlists = element;
              }}
              type="button"
              role="tab"
              id="caizen-music-player-tab-playlists"
              aria-selected={activeTab === 'playlists'}
              aria-controls="caizen-music-player-panel-playlists"
              tabIndex={activeTab === 'playlists' ? 0 : -1}
              onClick={() => setTab('playlists')}
              onKeyDown={event => handleTabKeyDown(event, 'playlists')}
              data-active={activeTab === 'playlists' || undefined}
            >
              Playlists
              <span>{playlists.length}</span>
            </button>

            {activeItem.lyrics && (
              <button
                ref={element => {
                  tabRefs.current.lyrics = element;
                }}
                type="button"
                role="tab"
                id="caizen-music-player-tab-lyrics"
                aria-selected={activeTab === 'lyrics'}
                aria-controls="caizen-music-player-panel-lyrics"
                tabIndex={activeTab === 'lyrics' ? 0 : -1}
                onClick={() => setTab('lyrics')}
                onKeyDown={event => handleTabKeyDown(event, 'lyrics')}
                data-active={activeTab === 'lyrics' || undefined}
              >
                Lyrics
              </button>
            )}

            <span className="cz-full-player-tabs-spacer" />

            {activeTab === 'queue' && queueItems.length > 0 && (
              <button
                type="button"
                className="cz-full-player-tabs-action"
                onClick={onClearQueue}
              >
                Clear
              </button>
            )}

            <button
              type="button"
              className="cz-full-player-tabs-action"
              onClick={onStop}
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          </div>

          <div ref={fullPlayerListRef} className="cz-full-player-list">
            <div
              id="caizen-music-player-panel-queue"
              role="tabpanel"
              aria-labelledby="caizen-music-player-tab-queue"
              tabIndex={0}
              hidden={activeTab !== 'queue'}
            >
            {activeTab === 'queue' && queueItems.length === 0 && (
              <div className="cz-full-player-empty">
                <ListMusic className="h-7 w-7" />
                <strong>Your queue is empty</strong>
                <span>Pick a playlist or song to start a queue.</span>
              </div>
            )}

            {activeTab === 'queue' &&
              visibleQueueItems.map(item => {
                const rowArtwork = getMusicArtwork(item);
                const isActive = item.id === activeId;

                return (
                  <div
                    ref={isActive ? activeQueueRowRef : undefined}
                    key={item.id}
                    className="cz-queue-row"
                    data-active={isActive || undefined}
                    data-playing={isActive && isPlaying ? 'true' : undefined}
                  >
                    <button
                      type="button"
                      className="cz-queue-main"
                      onClick={() => onSelectQueueItem(item.id)}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <span className="cz-queue-art">
                        {rowArtwork ? (
                          <ResilientImage
                            src={rowArtwork}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            fallback={<ListMusic className="h-4 w-4" aria-hidden="true" />}
                          />
                        ) : (
                          <ListMusic className="h-4 w-4" />
                        )}

                        {isActive && (
                          <span
                            className="cz-queue-equalizer"
                            data-playing={isPlaying || undefined}
                            aria-hidden="true"
                          >
                            <i />
                            <i />
                            <i />
                          </span>
                        )}
                      </span>

                      <span className="cz-queue-copy">
                        <OverflowTooltip text={item.title}><strong>{item.title}</strong></OverflowTooltip>
                        <OverflowTooltip text={`${item.artist || 'Unknown artist'}${isActive ? ` · ${isPlaying ? 'Playing' : 'Paused'}` : ''}`}><span>
                          {item.artist || 'Unknown artist'}
                          {isActive
                            ? ` · ${isPlaying ? 'Playing' : 'Paused'}`
                            : ''}
                        </span></OverflowTooltip>
                      </span>
                    </button>

                    <Tooltip><TooltipTrigger asChild><button
                      type="button"
                      className="cz-queue-icon cz-queue-remove"
                      onClick={() => onRowAction('remove', item)}
                      aria-label={`Remove ${item.title} from queue`}
                    >
                      <X className="h-4 w-4" />
                    </button></TooltipTrigger><TooltipContent>{"Remove from queue"}</TooltipContent></Tooltip>

                    <Tooltip><TooltipTrigger asChild><button
                      type="button"
                      className="cz-queue-icon"
                      onClick={event => openMenu(event, item)}
                      aria-label={`More actions for ${item.title}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button></TooltipTrigger><TooltipContent>{"More actions"}</TooltipContent></Tooltip>
                  </div>
                );
              })}

            {activeTab === 'queue' && renderedQueueCount < queueItems.length && (
              <button
                type="button"
                className="cz-queue-load-more"
                onClick={() =>
                  setQueueVisibleCount(current =>
                    Math.min(
                      queueItems.length,
                      Math.max(current, renderedQueueCount) +
                        FULL_PLAYER_QUEUE_BATCH_SIZE,
                    ),
                  )
                }
              >
                Load more queue items ({queueItems.length - renderedQueueCount} remaining)
              </button>
            )}
            </div>

            <div
              id="caizen-music-player-panel-playlists"
              role="tabpanel"
              aria-labelledby="caizen-music-player-tab-playlists"
              tabIndex={0}
              hidden={activeTab !== 'playlists'}
            >
            {activeTab === 'playlists' && playlists.length === 0 && (
              <div className="cz-full-player-empty">
                <ListMusic className="h-7 w-7" />
                <strong>No playlists yet</strong>
                <span>Assign songs to a playlist in Music.</span>
              </div>
            )}

            {activeTab === 'playlists' &&
              playlists.map(playlist => (
                <button
                  key={playlist}
                  type="button"
                  className="cz-queue-row cz-playlist-row"
                  onClick={() => onSelectPlaylist(playlist)}
                >
                  <span className="cz-queue-art">
                    <ListMusic className="h-4 w-4" />
                  </span>
                  <span className="cz-queue-copy">
                    <OverflowTooltip text={playlist}><strong>{playlist}</strong></OverflowTooltip>
                    <span>Play this playlist</span>
                  </span>
                  <Play className="h-4 w-4" aria-hidden="true" />
                </button>
              ))}
            </div>

            <div
              id="caizen-music-player-panel-lyrics"
              role="tabpanel"
              aria-labelledby="caizen-music-player-tab-lyrics"
              tabIndex={0}
              hidden={activeTab !== 'lyrics'}
            >
            {activeTab === 'lyrics' && activeItem.lyrics && (
              <div className="cz-player-lyrics-panel">
                {timedLyrics.length > 0 && (
                  <div className="cz-lyrics-toolbar">
                    <button
                      type="button"
                      className="cz-lyrics-follow"
                      data-active={lyricsFollowEnabled || undefined}
                      aria-pressed={lyricsFollowEnabled}
                      onClick={() =>
                        setLyricsFollowEnabled(current => !current)
                      }
                    >
                      Follow {lyricsFollowEnabled ? 'on' : 'off'}
                    </button>

                    <div
                      className="cz-lyrics-offset"
                      aria-label="Lyrics timing offset"
                    >
                      <Tooltip><TooltipTrigger asChild><button
                        type="button"
                        onClick={() =>
                          setLyricsOffsetSeconds(current =>
                            Math.max(-5, current - 0.5),
                          )
                        }
                        aria-label="Show lyrics later by half a second"
                      >
                        −0.5s
                      </button></TooltipTrigger><TooltipContent>{"Lyrics later"}</TooltipContent></Tooltip>

                      <Tooltip><TooltipTrigger asChild><button aria-label="Reset lyric timing"
                        type="button"
                        className="cz-lyrics-offset-value"
                        onClick={() => setLyricsOffsetSeconds(0)}
                      >
                        Sync {lyricsOffsetSeconds > 0 ? '+' : ''}
                        {lyricsOffsetSeconds.toFixed(1)}s
                      </button></TooltipTrigger><TooltipContent>{"Reset lyric timing"}</TooltipContent></Tooltip>

                      <Tooltip><TooltipTrigger asChild><button
                        type="button"
                        onClick={() =>
                          setLyricsOffsetSeconds(current =>
                            Math.min(5, current + 0.5),
                          )
                        }
                        aria-label="Show lyrics earlier by half a second"
                      >
                        +0.5s
                      </button></TooltipTrigger><TooltipContent>{"Lyrics earlier"}</TooltipContent></Tooltip>
                    </div>
                  </div>
                )}

                <div
                  className="cz-player-lyrics"
                  data-synchronized={timedLyrics.length > 0 || undefined}
                  data-following={lyricsFollowEnabled || undefined}
                >
                  {timedLyrics.length > 0 ? (
                    timedLyrics.map((line, index) => {
                      const active =
                        lyricsFollowEnabled && index === activeLyricIndex;

                      return (
                        <button
                          ref={element => {
                            lyricLineRefs.current[index] = element;
                          }}
                          key={line.id}
                          type="button"
                          data-active={active || undefined}
                          aria-current={active ? 'true' : undefined}
                          onClick={() =>
                            onSeek(
                              Math.max(0, line.time - lyricsOffsetSeconds),
                            )
                          }
                        >
                          {line.text}
                        </button>
                      );
                    })
                  ) : (
                    <p>{activeItem.lyrics}</p>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
        </div>

        {menuItem && typeof document !== 'undefined' ? createPortal((
          <div
            className="cz-sheet-root cz-player-menu-layer"
            data-caizen-overlay="open"
            data-anchored="true"
            data-overlay-surface="music-menu"
          >
            <button
              type="button"
              className="cz-sheet-backdrop"
              aria-label="Close actions"
              onClick={closeMenu}
            />

            <section
              ref={menuRef}
              className="cz-sheet cz-sheet-anchored cz-player-menu"
              style={{ left: menuPosition.x, top: menuPosition.y }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="caizen-music-actions-title"
            >
              <header className="cz-sheet-header">
                <div>
                  <h2 id="caizen-music-actions-title">{menuItem.title}</h2>
                  <p>{menuItem.artist || 'Unknown artist'}</p>
                </div>
                <button
                  type="button"
                  onClick={closeMenu}
                  className="cz-sheet-close"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="cz-sheet-actions">
                {menuQueueIndex < 0 && (
                  <button
                    type="button"
                    className="cz-sheet-action"
                    onClick={() => runAction('add-to-queue', menuItem)}
                  >
                    <ListPlus className="h-5 w-5" />
                    <span>
                      <strong>Add to queue</strong>
                    </span>
                  </button>
                )}

                {menuQueueIndex >= 0 && (
                  <>
                    {menuItem.id !== activeId && (
                      <>
                        <button
                          type="button"
                          className="cz-sheet-action"
                          onClick={() => runAction('play-next', menuItem)}
                        >
                          <ListPlus className="h-5 w-5" />
                          <span>
                            <strong>Play next</strong>
                          </span>
                        </button>

                        <button
                          type="button"
                          className="cz-sheet-action"
                          onClick={() => runAction('move-to-end', menuItem)}
                        >
                          <ArrowDown className="h-5 w-5" />
                          <span>
                            <strong>Move to end</strong>
                          </span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      className="cz-sheet-action"
                      onClick={() => runAction('remove', menuItem)}
                    >
                      <X className="h-5 w-5" />
                      <span>
                        <strong>Remove from queue</strong>
                      </span>
                    </button>
                  </>
                )}

                <div className="cz-sheet-separator" />

                <button
                  type="button"
                  className="cz-sheet-action"
                  onClick={() => runAction('edit', menuItem)}
                >
                  <Pencil className="h-5 w-5" />
                  <span>
                    <strong>Edit metadata</strong>
                  </span>
                </button>

                {menuItem.url && (
                  <button
                    type="button"
                    className="cz-sheet-action"
                    onClick={() => runAction('open-source', menuItem)}
                  >
                    <ExternalLink className="h-5 w-5" />
                    <span>
                      <strong>Open source</strong>
                    </span>
                  </button>
                )}

                {isYouTubeItem(menuItem) && (
                  <>
                    <button
                      type="button"
                      className="cz-sheet-action"
                      onClick={() => runAction('open-youtube', menuItem)}
                    >
                      <ExternalLink className="h-5 w-5" />
                      <span>
                        <strong>Open in YouTube</strong>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="cz-sheet-action"
                      onClick={() =>
                        runAction('open-youtube-music', menuItem)
                      }
                    >
                      <ExternalLink className="h-5 w-5" />
                      <span>
                        <strong>Open in YouTube Music</strong>
                      </span>
                    </button>
                  </>
                )}

                <div className="cz-sheet-separator" />

                <button
                  type="button"
                  className="cz-sheet-action"
                  data-destructive="true"
                  onClick={() => runAction('delete', menuItem)}
                >
                  <Trash2 className="h-5 w-5" />
                  <span>
                    <strong>Move to Trash</strong>
                    <small>Can be restored until Trash expires</small>
                  </span>
                </button>
              </div>
            </section>
          </div>
        ), document.body) : null}

        {showShortcuts && typeof document !== 'undefined' ? createPortal((
          <div
            className="fixed inset-0 z-[11200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
            data-caizen-overlay="open"
          >
            <button
              type="button"
              className="absolute inset-0"
              aria-label="Close keyboard shortcuts"
              onClick={closeShortcuts}
            />
            <section
              ref={shortcutsPanelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="caizen-music-shortcuts-title"
              className="relative z-10 w-full max-w-sm rounded-2xl border border-border/70 bg-card p-5 shadow-2xl"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Music</p>
                  <h2 id="caizen-music-shortcuts-title" className="mt-1 text-lg font-black">Keyboard shortcuts</h2>
                </div>
                <button
                  ref={shortcutsCloseRef}
                  type="button"
                  onClick={closeShortcuts}
                  className="grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close keyboard shortcuts"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                {[
                  ['Play / pause', 'Space'],
                  ['Next track', 'Arrow Right'],
                  ['Previous track', 'Arrow Left'],
                  ['Toggle queue', 'Q'],
                  ['Stop playback', 'S'],
                  ['Close the open player surface', 'Escape'],
                ].map(([label, key]) => (
                  <div key={label} className="flex items-center justify-between gap-4 rounded-xl bg-background/60 px-3 py-2.5">
                    <span className="font-semibold text-muted-foreground">{label}</span>
                    <kbd className="rounded-lg border border-border/70 bg-muted px-2 py-1 text-xs font-black text-foreground">{key}</kbd>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Shortcuts are disabled while typing.</p>
            </section>
          </div>
        ), document.body) : null}

        <ConfirmDialog
          isOpen={Boolean(pendingDelete)}
          title="Move song to Trash?"
          message={
            pendingDelete
              ? `"${pendingDelete.title}" will move to Trash and can be restored until Trash expires.`
              : 'This song will move to Trash and remain recoverable until it expires.'
          }
          confirmText="Move to Trash"
          cancelText="Cancel"
          isDangerous
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (pendingDelete) {
              onRowAction('delete', pendingDelete);
            }
            setPendingDelete(null);
          }}
        />
      </section>
    </>
  );
}
