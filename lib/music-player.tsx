'use client';

import {
  createContext,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import dynamic from 'next/dynamic';

import {
  Heart,
  ExternalLink,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { QueueRowAction } from '@/components/music/MusicFullPlayer';
import { ResilientImage } from '@/components/media/ResilientImage';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion-preference';
import { useAppContext } from '@/lib/context';
import { isTextEditingTarget } from '@/lib/dom/is-text-editing-target';
import { isNativeApp } from '@/lib/platform';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import { useTheme } from '@/lib/theme';
import { MusicItem } from '@/lib/types';
import { getSpotifyLink, getYouTubeId } from '@/lib/music-links';
import { fetchMusicLyrics, normalizeLyricsText } from '@/lib/music-lyrics';
import { notifyLegacy } from '@/lib/feedback/notify';
import { endRuntimeTrace, startRuntimeTrace } from '@/lib/performance-trace';

const MusicFullPlayer = dynamic(
  () =>
    import('@/components/music/MusicFullPlayer').then(
      module => module.MusicFullPlayer,
    ),
  { ssr: false },
);

export { getSpotifyLink, getYouTubeId } from '@/lib/music-links';

const MINI_PLAYER_QUEUE_BATCH_SIZE = 50;

export type RepeatMode = 'off' | 'all' | 'one';

type SpotifyPlaybackUpdate = {
  playingURI: string;
  isPaused: boolean;
  isBuffering: boolean;
  duration: number;
  position: number;
};

type SpotifyPlaybackStarted = {
  playingURI: string;
};

type SpotifyControllerEvent = {
  data?: SpotifyPlaybackUpdate | SpotifyPlaybackStarted;
};

type SpotifyEventName = 'ready' | 'playback_started' | 'playback_update';

type SpotifyEmbedController = {
  loadEntity: (spotifyUriOrUrl: string, preferVideo?: boolean, startAt?: number) => void;
  play: () => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  destroy: () => void;
  addListener: (
    event: SpotifyEventName,
    listener: (event?: SpotifyControllerEvent) => void,
  ) => void;
  removeListener?: (
    event: SpotifyEventName,
    listener: (event?: SpotifyControllerEvent) => void,
  ) => void;
};

type SpotifyIFrameApi = {
  createController: (
    element: HTMLElement,
    options: {
      url?: string;
      uri?: string;
      width?: string | number;
      height?: string | number;
    },
    callback: (controller: SpotifyEmbedController) => void,
  ) => void;
};

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    onSpotifyIframeApiReady?: (api: SpotifyIFrameApi) => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;
let spotifyApiPromise: Promise<SpotifyIFrameApi> | null = null;
let spotifyApiValue: SpotifyIFrameApi | null = null;

function loadYouTubeIframeApi() {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise(resolve => {
      window.onYouTubeIframeAPIReady = () => resolve();

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(script);
    });
  }

  return youtubeApiPromise;
}

const SPOTIFY_IFRAME_API_SRC = 'https://open.spotify.com/embed/iframe-api/v1';

function loadSpotifyIframeApi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Spotify playback is browser-only.'));
  }

  if (spotifyApiValue) return Promise.resolve(spotifyApiValue);
  if (spotifyApiPromise) return spotifyApiPromise;

  spotifyApiPromise = new Promise<SpotifyIFrameApi>((resolve, reject) => {
    let settled = false;
    const previousReadyHandler = window.onSpotifyIframeApiReady;

    const handleReady = (api: SpotifyIFrameApi) => {
      if (settled) return;

      settled = true;
      spotifyApiValue = api;
      resolve(api);

      if (previousReadyHandler && previousReadyHandler !== handleReady) {
        try {
          previousReadyHandler(api);
        } catch {
          // A third-party handler must not break Caizen's shared loader.
        }
      }
    };

    const handleError = () => {
      if (settled) return;

      settled = true;
      spotifyApiPromise = null;
      document
        .querySelector<HTMLScriptElement>(
          'script[data-caizen-spotify-iframe-api="true"]',
        )
        ?.remove();
      if (window.onSpotifyIframeApiReady === handleReady) {
        window.onSpotifyIframeApiReady = previousReadyHandler;
      }
      reject(new Error('The Spotify playback API could not be loaded.'));
    };

    window.onSpotifyIframeApiReady = handleReady;

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[data-caizen-spotify-iframe-api="true"]`,
    );

    if (existingScript) {
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = SPOTIFY_IFRAME_API_SRC;
    script.async = true;
    script.dataset.caizenSpotifyIframeApi = 'true';
    script.addEventListener('error', handleError, { once: true });
    (document.body || document.head).appendChild(script);
  });

  return spotifyApiPromise;
}

type PlaybackBridge = {
  select: (id: string | null, shouldPlay?: boolean) => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  stop: () => void;
};
type RegisterPlaybackBridge = (bridge: PlaybackBridge | null) => void;

type PendingPlaybackSelection = {
  id: string;
  shouldPlay: boolean;
};

export function insertQueueItemAfterActive(
  queueIds: string[],
  id: string,
  activeId: string | null,
) {
  const withoutItem = queueIds.filter(itemId => itemId !== id);

  if (!activeId) return [id, ...withoutItem];

  const activeIndex = withoutItem.indexOf(activeId);
  if (activeIndex < 0) return [id, ...withoutItem];

  return [
    ...withoutItem.slice(0, activeIndex + 1),
    id,
    ...withoutItem.slice(activeIndex + 1),
  ];
}

export function moveQueueItemToEnd(
  queueIds: string[],
  id: string,
  activeId: string | null,
) {
  if (!queueIds.includes(id) || id === activeId) return queueIds;

  return [
    ...queueIds.filter(itemId => itemId !== id),
    id,
  ];
}

type MusicPlayerContextType = {
  activeItem: MusicItem | null;
  activeId: string | null;
  embedUrl: string;
  playbackState: MusicPlaybackState;
  isPlaying: boolean;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  queueItems: MusicItem[];
  fullPlayerOpen: boolean;
  openFullPlayer: () => void;
  closeFullPlayer: () => void;
  setActiveId: (id: string | null) => void;
  playItems: (id: string, items: MusicItem[], options?: { expandPlayer?: boolean }) => void;
  togglePlayback: () => void;
  seekPlayback: (seconds: number) => void;
  stopPlayback: () => void;
  syncPlaybackState: (patch: Partial<MusicPlaybackState>) => void;
  setShuffleEnabled: (
    value: boolean | ((current: boolean) => boolean)
  ) => void;
  cycleRepeatMode: () => void;
  playNext: () => void;
  playPrevious: () => void;
  playRandom: (items?: MusicItem[]) => void;
  addToQueue: (id: string) => void;
  playNextItem: (id: string) => void;
  moveToEnd: (id: string) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
};

const MusicPlayerContext =
  createContext<MusicPlayerContextType | undefined>(
    undefined
  );

const STORAGE_KEYS = {
  shuffle: 'life-manager-music-shuffle',
  repeat: 'life-manager-music-repeat',
  hidden: 'life-manager-music-hidden',
  session: 'caizen-music-session',
  lyricsCache: 'caizen-music-lyrics-cache-v1',
};

function readStorageValue(key: string) {
  if (typeof window === 'undefined') return null;

  return window.localStorage.getItem(key);
}

/**
 * The queue and current track survive an app restart, but `isPlaying`
 * deliberately does not: restoring a session must never start audio the user
 * did not ask for. A restored session loads paused.
 */
type MusicSession = {
  activeId: string | null;
  queueIds: string[];
};

function readMusicSession(): MusicSession {
  const empty: MusicSession = { activeId: null, queueIds: [] };

  try {
    const raw = readStorageValue(STORAGE_KEYS.session);
    if (!raw) return empty;

    const parsed = JSON.parse(raw) as Partial<MusicSession>;

    return {
      activeId:
        typeof parsed.activeId === 'string' ? parsed.activeId : null,
      queueIds: Array.isArray(parsed.queueIds)
        ? parsed.queueIds.filter(
          (id): id is string => typeof id === 'string'
        )
        : [],
    };
  } catch {
    return empty;
  }
}

function writeStorageValue(key: string, value: string) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(key, value);
}

type LyricsCacheEntry = {
  lyrics: string | null;
  fetchedAt: number;
};

type LyricsCache = Record<string, LyricsCacheEntry>;

const LYRICS_SUCCESS_TTL = 1000 * 60 * 60 * 24 * 30;
const LYRICS_MISS_TTL = 1000 * 60 * 60 * 24;

function readLyricsCache(): LyricsCache {
  try {
    const raw = readStorageValue(STORAGE_KEYS.lyricsCache);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as LyricsCache;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLyricsCache(cache: LyricsCache) {
  try {
    writeStorageValue(STORAGE_KEYS.lyricsCache, JSON.stringify(cache));
  } catch {
    // Lyrics lookup is optional. A storage quota failure must not affect music.
  }
}

function getLyricsCacheKey(item: MusicItem) {
  return [
    item.id,
    normalizeLyricsText(item.title),
    normalizeLyricsText(item.artist),
  ].join('|');
}

function isPlaylist(item: MusicItem) {
  return item.type === 'playlist';
}

export function getPlayableItems(items: MusicItem[]) {
  return items.filter(
    item => !isPlaylist(item) && Boolean(item.url)
  );
}

function getYouTubeThumbnail(url?: string) {
  const id = getYouTubeId(url);

  return id
    ? `https://img.youtube.com/vi/${id}/hqdefault.jpg`
    : '';
}

function getYouTubeArtworkFallback(item?: MusicItem | null) {
  return item?.image || getYouTubeThumbnail(item?.url) || '';
}

export function getMusicArtwork(item?: MusicItem | null) {
  if (item?.image) return item.image;

  return item?.playlistCover || getYouTubeArtworkFallback(item);
}

export function isYouTubeItem(item?: MusicItem | null) {
  if (!item?.url) return false;

  return (
    item.provider === 'youtube' ||
    /youtu\.be|youtube\.com/i.test(item.url)
  );
}

export function isSpotifyItem(item?: MusicItem | null) {
  if (!item?.url) return false;

  return (
    item.provider === 'spotify' ||
    /spotify\.com/i.test(item.url)
  );
}

/**
 * Playback mode for the active item.
 *
 * `youtube` and `spotify` are embedded, foreground-only web players. Their
 * controls remain subject to browser/WebView media-session and autoplay
 * support, so nothing in Caizen may claim guaranteed background playback.
 * `external` sources have no embeddable player and can only be opened in
 * their origin app.
 */
export type MusicPlaybackMode = 'youtube' | 'spotify' | 'local' | 'external';
export const isBundledDemoAudio = (item?: MusicItem | null) => item?.url === '/demo-assets/quiet-room.wav';

export type MusicPlaybackCapabilities = {
  playbackOwner: 'caizen' | 'spotify' | 'external';
  canControlPlayback: boolean;
  canSeek: boolean;
  canQueueNavigate: boolean;
};

export type MusicPlaybackState = {
  provider: MusicPlaybackMode | null;
  isReady: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  position: number;
  duration: number;
  canPlayPause: boolean;
  canSeek: boolean;
  error: string | null;
  /**
   * Why Spotify playback is currently unavailable, when it is. This is only
   * ever set for Spotify items - the embed API has no way to tell Caizen
   * whether the visitor is signed in, so `unauthenticated` is inferred from
   * "playback never started for this track" rather than observed directly.
   * `restricted` means playback had started and then stopped/failed, which
   * is more likely an account limit or a Spotify-side interruption.
   * `unknown` covers everything else (the iframe API failed to load, or the
   * entity could not be read) where no cause can be inferred at all.
   */
  unavailableReason: 'unauthenticated' | 'restricted' | 'unknown' | null;
};

export function getPlaybackMode(
  item?: MusicItem | null
): MusicPlaybackMode {
  if (isBundledDemoAudio(item)) return 'local';
  if (isYouTubeItem(item)) return 'youtube';
  if (isSpotifyItem(item)) return 'spotify';

  return 'external';
}

export function getMusicPlaybackCapabilities(
  item?: MusicItem | null,
): MusicPlaybackCapabilities {
  const mode = getPlaybackMode(item);

  if (mode === 'youtube' || mode === 'local') {
    return {
      playbackOwner: 'caizen',
      canControlPlayback: true,
      canSeek: true,
      canQueueNavigate: true,
    };
  }

  if (mode === 'spotify') {
    return {
      playbackOwner: 'spotify',
      canControlPlayback: true,
      canSeek: true,
      canQueueNavigate: true,
    };
  }

  return {
    playbackOwner: 'external',
    canControlPlayback: false,
    canSeek: false,
    canQueueNavigate: true,
  };
}

function createPlaybackState(item?: MusicItem | null): MusicPlaybackState {
  const capabilities = getMusicPlaybackCapabilities(item);
  const provider = item ? getPlaybackMode(item) : null;

  return {
    provider,
    isReady: false,
    isPlaying: false,
    isBuffering: false,
    position: 0,
    duration: 0,
    canPlayPause:
      provider === 'spotify' ? false : capabilities.canControlPlayback,
    canSeek: provider === 'spotify' ? false : capabilities.canSeek,
    error: null,
    unavailableReason: null,
  };
}

/**
 * Muted, informational copy for the Spotify-unavailable states. Kept here so
 * the compact and full players show identical wording.
 */
export function getSpotifyUnavailableCopy(
  reason: NonNullable<MusicPlaybackState['unavailableReason']>,
): { title: string; message: string } {
  if (reason === 'unauthenticated') {
    return {
      title: 'Spotify needs an account',
      message: 'Sign in to Spotify to play music here.',
    };
  }

  if (reason === 'restricted') {
    return {
      title: 'Spotify playback paused',
      message:
        'Playback may be limited by your Spotify account or Spotify playback restrictions. Resume in Spotify to continue.',
    };
  }

  return {
    title: 'Spotify playback unavailable',
    message: "Spotify playback isn't available right now.",
  };
}

export function getRepeatLabel(mode: RepeatMode) {
  if (mode === 'all') return 'Loop Queue';
  if (mode === 'one') return 'Loop One';

  return 'No Loop';
}

function getRepeatToast(mode: RepeatMode) {
  if (mode === 'all') {
    return {
      title: 'Repeat enabled',
      message: 'The queue will loop after the last song.',
    };
  }

  if (mode === 'one') {
    return {
      title: 'Repeat one',
      message: 'The current song will keep replaying.',
    };
  }

  return {
    title: 'Repeat off',
    message: 'Playback will stop at the end of the queue.',
  };
}

export function getSourceCapabilityText(item?: MusicItem | null) {
  if (!item) return 'No active track';
  if (isBundledDemoAudio(item)) return 'Local sample - available offline';

  if (isYouTubeItem(item)) {
    return 'Playback controlled by Caizen · Foreground only';
  }

  if (isSpotifyItem(item)) {
    return 'Spotify embed · availability depends on Spotify';
  }

  if (item.provider === 'link') {
    return 'Direct link · Opens source only';
  }

  return 'External source · Limited playback support';
}

export function getMusicEmbedUrl(item?: MusicItem | null) {
  if (!item?.url) return '';

  try {
    new URL(item.url);

    if (isYouTubeItem(item)) {
      const id = getYouTubeId(item.url);

      const origin =
        typeof window !== 'undefined'
          ? window.location.origin
          : '';

      // Keep the provider chrome hidden. Caizen owns playback actions while
      // the YouTube iframe remains responsible for rendering the video.
      return id
        ? `https://www.youtube.com/embed/${id}?autoplay=0&controls=0&disablekb=1&fs=0&iv_load_policy=3&cc_load_policy=0&modestbranding=1&playsinline=1&enablejsapi=1${origin
          ? `&origin=${encodeURIComponent(origin)}`
          : ''
        }`
        : '';
    }

    if (isSpotifyItem(item)) {
      const spotify = getSpotifyLink(item.url);

      return spotify
        ? `https://open.spotify.com/embed/${spotify.type}/${spotify.id}?utm_source=generator`
        : '';
    }
  } catch {
    return '';
  }

  return '';
}

export function MusicPlayerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { musicItems, recordMusicPlay } = useAppContext();

  /*
   * PersistentMusicPlayer registers the provider bridge here. Selection is
   * dispatched from the original click handler so both embedded providers can
   * make their best user-gesture playback attempt before React effects run.
   */
  const playbackBridgeRef = useRef<PlaybackBridge | null>(null);
  const pendingPlaybackSelectionRef =
    useRef<PendingPlaybackSelection | null>(null);
  const registerPlaybackBridge = useCallback<RegisterPlaybackBridge>(
    bridge => {
      playbackBridgeRef.current = bridge;

      if (!bridge) return;

      const pendingSelection = pendingPlaybackSelectionRef.current;
      if (!pendingSelection) return;

      pendingPlaybackSelectionRef.current = null;
      bridge.select(
        pendingSelection.id,
        pendingSelection.shouldPlay,
      );
    },
    [],
  );

  // Restored synchronously so the mini-player does not flash empty on the
  // first paint after a restart. Playback stays paused - see MusicSession.
  // Read the persisted session once; the active id and queue are derived from
  // the same snapshot rather than parsing localStorage twice on mount.
  const [initialSession] = useState<MusicSession>(() => readMusicSession());
  const [activeId, rawSetActiveId] =
    useState<string | null>(() => initialSession.activeId);

  const [queueIds, setQueueIds] =
    useState<string[]>(() => initialSession.queueIds);

  const [fullPlayerOpen, setFullPlayerOpen] =
    useState(false);

  const [shuffleEnabled, setShuffleEnabled] =
    useState(() =>
      readStorageValue(STORAGE_KEYS.shuffle) === 'true'
    );

  const [repeatMode, setRepeatMode] =
    useState<RepeatMode>(() => {
      const stored =
        readStorageValue(STORAGE_KEYS.repeat);

      return stored === 'all' || stored === 'one'
        ? stored
        : 'off';
    });

  const [playbackState, setPlaybackState] =
    useState<MusicPlaybackState>(() => createPlaybackState());

  const playableItems = useMemo(
    () => getPlayableItems(musicItems),
    [musicItems]
  );

  const activeItem =
    playableItems.find(item => item.id === activeId) ||
    null;

  const isPlaying = playbackState.isPlaying;

  const activePlaybackMode = activeItem
    ? getPlaybackMode(activeItem)
    : null;

  const embedUrl =
    typeof window === 'undefined'
      ? ''
      : getMusicEmbedUrl(activeItem);

  useEffect(() => {
    setPlaybackState(current => {
      if (current.provider === activePlaybackMode) return current;

      return createPlaybackState(activeItem);
    });
  }, [activeItem, activePlaybackMode]);

  const queueItems = useMemo(() => {
    const queuedItems =
      queueIds
        .map(id =>
          playableItems.find(item => item.id === id)
        )
        .filter(Boolean) as MusicItem[];

    return queuedItems;
  }, [queueIds, playableItems]);

  const selectActiveId = useCallback(
    (
      id: string | null,
      options?: { shouldPlay?: boolean },
    ) => {
      const selectedItem = id
        ? playableItems.find(item => item.id === id)
        : null;
      const shouldPlay = options?.shouldPlay ?? Boolean(id);

      rawSetActiveId(id);
      setPlaybackState(createPlaybackState(selectedItem));

      pendingPlaybackSelectionRef.current =
        id && shouldPlay
          ? { id, shouldPlay: true }
          : null;

      const bridge = playbackBridgeRef.current;
      if (!bridge) return;

      pendingPlaybackSelectionRef.current = null;
      bridge.select(id, shouldPlay);
    },
    [playableItems],
  );

  const recordControllablePlay = useCallback((id: string, items: MusicItem[]) => {
    const item = items.find(entry => entry.id === id);
    if (!item || !getMusicPlaybackCapabilities(item).canControlPlayback) return;

    recordMusicPlay(item.id, new Date());
  }, [recordMusicPlay]);

  const setActiveId = useCallback(
    (id: string | null) => {
      if (id) {
        setQueueIds(current =>
          current.includes(id) ? current : [id]
        );
      }

      selectActiveId(id, { shouldPlay: Boolean(id) });
    },
    [selectActiveId]
  );

  const playItems = useCallback(
    (id: string, items: MusicItem[], options?: { expandPlayer?: boolean }) => {
      const selectionStartedAt = startRuntimeTrace('music-play-selection');
      try {
        const nextQueue = getPlayableItems(items);

        if (!nextQueue.some(item => item.id === id)) return;

        setQueueIds(nextQueue.map(item => item.id));
        selectActiveId(id, { shouldPlay: true });
        recordControllablePlay(id, nextQueue);
        // Selecting/playing a track should not itself force the full-screen
        // player open — that's a separate, more deliberate action (playlist
        // "Play", the deep-link handler, saving-and-playing from the editor).
        // Row-level selection (Library/Recently Played/Most Played) opts out.
        if (options?.expandPlayer ?? true) setFullPlayerOpen(true);
      } finally {
        endRuntimeTrace('music-play-selection', selectionStartedAt);
      }
    },
    [recordControllablePlay, selectActiveId]
  );

  const getCurrentQueue = useCallback(() => {
    if (queueItems.length > 0) return queueItems;

    return activeItem ? [activeItem] : [];
  }, [activeItem, queueItems]);

  const stopPlayback = useCallback(() => {
    pendingPlaybackSelectionRef.current = null;
    playbackBridgeRef.current?.stop();
    rawSetActiveId(null);
    setPlaybackState(createPlaybackState());
  }, []);

  const playRandom = useCallback(
    (items?: MusicItem[]) => {
      const pool =
        items && items.length > 0
          ? getPlayableItems(items)
          : getCurrentQueue();

      if (!pool.length) return;

      setQueueIds(pool.map(item => item.id));

      const choices =
        activeId && pool.length > 1
          ? pool.filter(item => item.id !== activeId)
          : pool;

      const random =
        choices[
        Math.floor(
          Math.random() * choices.length
        )
        ];

      selectActiveId(random.id);
    },
    [activeId, getCurrentQueue, selectActiveId]
  );

  const playNext = useCallback(() => {
    const pool = getCurrentQueue();

    if (!pool.length) return;

    if (repeatMode === 'one' && activeItem) {
      selectActiveId(activeItem.id);
      return;
    }

    if (shuffleEnabled) {
      playRandom(pool);
      return;
    }

    const currentIndex =
      pool.findIndex(item => item.id === activeId);

    const isLast =
      currentIndex === pool.length - 1;

    if (repeatMode === 'off' && isLast) {
      playbackBridgeRef.current?.pause();
      setPlaybackState(current => ({
        ...current,
        isPlaying: false,
        isBuffering: false,
      }));
      return;
    }

    const next =
      pool[
      currentIndex >= 0
        ? (currentIndex + 1) % pool.length
        : 0
      ];

    selectActiveId(next.id);
  }, [
    activeId,
    activeItem,
    getCurrentQueue,
    playRandom,
    repeatMode,
    selectActiveId,
    shuffleEnabled,
  ]);

  const playPrevious = useCallback(() => {
    const pool = getCurrentQueue();

    if (!pool.length) return;

    const currentIndex =
      pool.findIndex(item => item.id === activeId);

    if (
      repeatMode === 'off' &&
      currentIndex <= 0
    ) {
      return;
    }

    const previous =
      pool[
      currentIndex > 0
        ? currentIndex - 1
        : pool.length - 1
      ];

    selectActiveId(previous.id);
  }, [
    activeId,
    getCurrentQueue,
    repeatMode,
    selectActiveId,
  ]);

  const addToQueue = useCallback(
    (id: string) => {
      const item =
        playableItems.find(track => track.id === id);

      if (!item) return;

      setQueueIds(current => {
        const base = current.length > 0
          ? current
          : activeId
            ? [activeId]
            : [];

        if (base.includes(id)) return base;

        return [...base, id];
      });
    },
    [activeId, playableItems]
  );

  const playNextItem = useCallback(
    (id: string) => {
      const item =
        playableItems.find(track => track.id === id);

      if (!item) return;

      setQueueIds(current => {
        const base = current.length > 0
          ? current
          : activeId
            ? [activeId]
            : [];

        return insertQueueItemAfterActive(base, id, activeId);
      });

      if (!activeId) {
        selectActiveId(id);
      }
    },
    [
      activeId,
      playableItems,
      selectActiveId,
    ]
  );

  const moveToEnd = useCallback(
    (id: string) => {
      if (!playableItems.some(item => item.id === id)) return;
      if (!queueItems.some(item => item.id === id)) return;

      setQueueIds(current => moveQueueItemToEnd(current, id, activeId));
    },
    [activeId, playableItems, queueItems],
  );

  const removeFromQueue = useCallback(
    (id: string) => {
      const currentIndex = queueItems.findIndex(
        item => item.id === id
      );
      const remaining = queueItems.filter(
        item => item.id !== id
      );

      setQueueIds(remaining.map(item => item.id));

      if (activeId === id) {
        const next =
          remaining[currentIndex] ||
          remaining[currentIndex - 1];

        if (next) {
          selectActiveId(next.id);
        } else {
          stopPlayback();
        }
      }
    },
    [activeId, queueItems, selectActiveId, stopPlayback]
  );

  const clearQueue = useCallback(() => {
    setQueueIds([]);
    stopPlayback();
  }, [stopPlayback]);

  const openFullPlayer = useCallback(
    () => setFullPlayerOpen(true),
    []
  );

  const closeFullPlayer = useCallback(
    () => {
      setFullPlayerOpen(false);
    },
    []
  );

  const togglePlayback = useCallback(() => {
    if (
      !activeItem ||
      !getMusicPlaybackCapabilities(activeItem).canControlPlayback ||
      !playbackState.canPlayPause
    ) return;

    if (isPlaying) {
      playbackBridgeRef.current?.pause();
      return;
    }

    const bridge = playbackBridgeRef.current;
    if (bridge) {
      bridge.play();
      return;
    }

    pendingPlaybackSelectionRef.current = {
      id: activeItem.id,
      shouldPlay: true,
    };
  }, [activeItem, isPlaying, playbackState.canPlayPause]);

  const seekPlayback = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;

    playbackBridgeRef.current?.seek(Math.max(0, seconds));
  }, []);

  const syncPlaybackState = useCallback(
    (patch: Partial<MusicPlaybackState>) => {
      setPlaybackState(current => {
        if (
          patch.provider &&
          patch.provider !== activePlaybackMode
        ) return current;

        return {
          ...current,
          ...patch,
        };
      });
    },
    [activePlaybackMode],
  );

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode(current =>
      current === 'off'
        ? 'all'
        : current === 'all'
          ? 'one'
          : 'off'
    );
  }, []);

  useEffect(() => {
    if (
      activeId &&
      !playableItems.some(item => item.id === activeId)
    ) {
      selectActiveId(null);
    }
  }, [activeId, playableItems, selectActiveId]);

  useEffect(() => {
    setQueueIds(current =>
      current.filter(id =>
        playableItems.some(item => item.id === id)
      )
    );
  }, [playableItems]);

  useEffect(() => {
    writeStorageValue(
      STORAGE_KEYS.shuffle,
      String(shuffleEnabled)
    );
  }, [shuffleEnabled]);

  useEffect(() => {
    writeStorageValue(
      STORAGE_KEYS.repeat,
      repeatMode
    );
  }, [repeatMode]);

  useEffect(() => {
    writeStorageValue(
      STORAGE_KEYS.session,
      JSON.stringify({ activeId, queueIds } satisfies MusicSession)
    );
  }, [activeId, queueIds]);

  // The full player is only meaningful while a track is loaded.
  useEffect(() => {
    if (!activeId) setFullPlayerOpen(false);
  }, [activeId]);

  const value = {
    activeItem,
    activeId,
    embedUrl,
    playbackState,
    isPlaying,
    shuffleEnabled,
    repeatMode,
    queueItems,
    fullPlayerOpen,
    openFullPlayer,
    closeFullPlayer,
    setActiveId,
    playItems,
    togglePlayback,
    seekPlayback,
    stopPlayback,
    syncPlaybackState,
    setShuffleEnabled,
    cycleRepeatMode,
    playNext,
    playPrevious,
    playRandom,
    addToQueue,
    playNextItem,
    moveToEnd,
    removeFromQueue,
    clearQueue,
  };

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
      <PersistentMusicPlayer
        registerPlaybackBridge={registerPlaybackBridge}
      />
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext);

  if (!context) {
    throw new Error(
      'useMusicPlayer must be used within MusicPlayerProvider'
    );
  }

  return context;
}

function PersistentMusicPlayer({
  registerPlaybackBridge,
}: {
  registerPlaybackBridge: RegisterPlaybackBridge;
}) {
  const {
    activeItem,
    activeId,
    embedUrl,
    playbackState,
    isPlaying,
    shuffleEnabled,
    repeatMode,
    queueItems,
    togglePlayback,
    stopPlayback,
    syncPlaybackState,
    seekPlayback,
    setActiveId,
    setShuffleEnabled,
    cycleRepeatMode,
    playNext,
    playPrevious,
    playItems,
    addToQueue,
    playNextItem,
    moveToEnd,
    removeFromQueue,
    clearQueue,
    fullPlayerOpen,
    openFullPlayer,
    closeFullPlayer,
  } = useMusicPlayer();

  const { musicItems, deleteMusicItem } = useAppContext();
  const { useAlbumArtBackground, animationPreference } = useTheme();
  const reduceMotion = useReducedMotionPreference();

  const spotifyHostRef =
    useRef<HTMLDivElement | null>(null);

  const queuePanelRef =
    useRef<HTMLDivElement | null>(null);

  const queueCloseButtonRef =
    useRef<HTMLButtonElement | null>(null);

  const miniQueueActiveRowRef =
    useRef<HTMLDivElement | null>(null);

  const miniPlayerRef = useRef<HTMLElement | null>(null);
  const miniPlayerDragRef = useRef<{ startX: number; startY: number; startedAt: number; dragging: boolean } | null>(null);
  const miniPlayerSuppressClickRef = useRef(false);

  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const spotifyControllerRef =
    useRef<SpotifyEmbedController | null>(null);

  const spotifyControllerGenerationRef = useRef(0);
  const spotifyReadyRef = useRef(false);
  const spotifyPendingPlayRef = useRef<{
    id: string;
    url: string;
    generation: number | null;
  } | null>(null);
  const spotifyPlaybackAttemptRef = useRef<{
    id: string;
    url: string;
    generation: number | null;
    timer: number;
  } | null>(null);
  const spotifyPlaybackConfirmedRef = useRef(false);
  const spotifyPlaybackUnavailableRef = useRef(false);
  const spotifyControllerItemIdRef = useRef<string | null>(null);
  const spotifyControllerItemUrlRef = useRef<string | null>(null);
  /*
   * Whether Spotify has ever actually started audio for the *current*
   * entity. The embed iframe API exposes no auth/account signal at all, so
   * this is the only real evidence available: if playback never started,
   * "needs an account" is the more likely explanation; if it started and
   * later stopped, an account/playback restriction interrupting an
   * in-progress session is the more likely one. Reset whenever a new
   * Spotify entity is loaded.
   */
  const spotifyHasPlayedRef = useRef(false);

  const youtubePlayerRef =
    useRef<any | null>(null);

  const youtubeHostRef =
    useRef<HTMLDivElement | null>(null);

  // The YouTube iframe is created once and reused for every track.
  const playRequestedRef = useRef(false);
  const youtubeReadyRef = useRef(false);
  const loadedVideoIdRef = useRef('');
  const pendingVideoIdRef = useRef('');
  const latestActiveItemRef = useRef<MusicItem | null>(activeItem);
  const latestIsPlayingRef = useRef(isPlaying);
  const latestPlayNextRef = useRef(playNext);
  const latestSyncPlaybackStateRef = useRef(syncPlaybackState);
  const positionsByTrackRef = useRef(new Map<string, number>());

  latestActiveItemRef.current = activeItem;
  latestIsPlayingRef.current = isPlaying;
  latestPlayNextRef.current = playNext;
  latestSyncPlaybackStateRef.current = syncPlaybackState;

  const clearSpotifyPlaybackAttempt = useCallback(() => {
    const attempt = spotifyPlaybackAttemptRef.current;
    if (!attempt) return;
    window.clearTimeout(attempt.timer);
    spotifyPlaybackAttemptRef.current = null;
  }, []);

  const armSpotifyPlaybackAttempt = useCallback((id: string, url: string, generation: number | null) => {
    clearSpotifyPlaybackAttempt();
    spotifyPlaybackConfirmedRef.current = false;
    spotifyPlaybackUnavailableRef.current = false;
    const timer = window.setTimeout(() => {
      const attempt = spotifyPlaybackAttemptRef.current;
      const currentItem = latestActiveItemRef.current;
      if (
        !attempt ||
        attempt.id !== id ||
        attempt.url !== url ||
        attempt.generation !== generation ||
        !currentItem ||
        currentItem.id !== id ||
        currentItem.url !== url ||
        spotifyPlaybackConfirmedRef.current
      ) return;

      spotifyPendingPlayRef.current = null;
      spotifyPlaybackAttemptRef.current = null;
      spotifyPlaybackUnavailableRef.current = true;
      latestSyncPlaybackStateRef.current({
        provider: 'spotify',
        isReady: true,
        isPlaying: false,
        isBuffering: false,
        canPlayPause: false,
        canSeek: false,
        error: 'Spotify could not start playback here. Open in Spotify to continue.',
        unavailableReason: spotifyHasPlayedRef.current
          ? 'restricted'
          : 'unauthenticated',
      });
    }, 4500);
    spotifyPlaybackAttemptRef.current = { id, url, generation, timer };
  }, [clearSpotifyPlaybackAttempt]);

  const progress = {
    position: playbackState.position,
    duration: playbackState.duration,
  };

  const playbackError = playbackState.error;
  const spotifyUnavailableReason = playbackState.unavailableReason;

  const [automaticLyrics, setAutomaticLyrics] =
    useState<Record<string, string>>({});

  const [lyricsLoadingId, setLyricsLoadingId] =
    useState<string | null>(null);

  const lyricsCacheRef = useRef<LyricsCache>(readLyricsCache());

  const [hidden, setHidden] =
    useState(() =>
      readStorageValue(STORAGE_KEYS.hidden) === 'true'
    );

  const [showQueue, setShowQueue] =
    useState(false);

  const [queueVisibleCount, setQueueVisibleCount] =
    useState(MINI_PLAYER_QUEUE_BATCH_SIZE);

  const closeQueue = useCallback(() => {
    setShowQueue(false);
  }, []);

  const activeQueueIndex = activeId
    ? queueItems.findIndex(item => item.id === activeId)
    : -1;
  const renderedQueueCount = Math.min(queueItems.length, queueVisibleCount);
  const queueWindowStart =
    activeQueueIndex >= renderedQueueCount
      ? Math.max(0, activeQueueIndex - Math.floor(renderedQueueCount / 2))
      : 0;
  const visibleQueueItems = queueItems.slice(
    queueWindowStart,
    queueWindowStart + renderedQueueCount,
  );

  useOverlayLifecycle(showQueue, closeQueue, {
    containerRef: queuePanelRef,
    initialFocusRef: queueCloseButtonRef,
  });

  useEffect(() => {
    setQueueVisibleCount(MINI_PLAYER_QUEUE_BATCH_SIZE);
  }, [queueItems]);

  useEffect(() => {
    if (!showQueue || !activeId) return;

    requestAnimationFrame(() => {
      miniQueueActiveRowRef.current?.scrollIntoView({
        block: 'nearest',
      });
    });
  }, [activeId, queueWindowStart, renderedQueueCount, showQueue]);

  const artwork =
    getMusicArtwork(activeItem);

  const playbackMode =
    getPlaybackMode(activeItem);

  const basePlaybackCapabilities =
    getMusicPlaybackCapabilities(activeItem);

  const playbackCapabilities = {
    ...basePlaybackCapabilities,
    canControlPlayback:
      basePlaybackCapabilities.canControlPlayback &&
      playbackState.canPlayPause,
    canSeek:
      basePlaybackCapabilities.canSeek &&
      playbackState.canSeek,
  };

  const spotifyEmbedType =
    activeItem && playbackMode === 'spotify'
      ? getSpotifyLink(activeItem.url)?.type
      : undefined;

  const videoBackgroundActive = Boolean(
    useAlbumArtBackground &&
    animationPreference !== 'reduced' &&
    !reduceMotion &&
    activeItem &&
    playbackMode === 'youtube' &&
    isPlaying &&
    !fullPlayerOpen,
  );

  const resolvedActiveItem = useMemo(() => {
    if (!activeItem || activeItem.lyrics?.trim()) return activeItem;

    const fetchedLyrics = automaticLyrics[activeItem.id];
    return fetchedLyrics
      ? { ...activeItem, lyrics: fetchedLyrics }
      : activeItem;
  }, [activeItem, automaticLyrics]);

  const playlists = useMemo(() => {
    const names = new Set<string>();

    getPlayableItems(musicItems).forEach(item => {
      if (item.playlist) names.add(item.playlist);
      item.playlists?.forEach(name => {
        if (name) names.add(name);
      });
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [musicItems]);

  /**
   * Overflow-menu actions for a queue row or the current track.
   *
   * Edit and delete go through the normal app repository via the Music
   * section, so the player never becomes a second write path for library
   * records.
   */
  const handleRowAction = useCallback(
    (action: QueueRowAction, item: MusicItem) => {
      switch (action) {
        case 'play-next':
          playNextItem(item.id);
          break;
        case 'move-to-end':
          moveToEnd(item.id);
          break;
        case 'add-to-queue':
          addToQueue(item.id);
          break;
        case 'remove':
          removeFromQueue(item.id);
          break;
        case 'open-source':
          if (normalizeExternalWebUrl(item.url)) {
            void openExternalLink(normalizeExternalWebUrl(item.url)!);
          }
          break;
        case 'open-youtube':
          if (normalizeExternalWebUrl(item.url)) void openExternalLink(normalizeExternalWebUrl(item.url)!);
          break;
        case 'open-youtube-music': {
          const videoId = getYouTubeId(item.url);
          if (videoId) {
            void openExternalLink(`https://music.youtube.com/watch?v=${videoId}`);
          }
          break;
        }
        case 'edit':
          closeFullPlayer();
          window.dispatchEvent(
            new CustomEvent('caizen:music-edit-request', {
              detail: { id: item.id },
            }),
          );
          break;
        case 'delete':
          deleteMusicItem(item.id);
          break;
      }
    },
    [
      addToQueue,
      closeFullPlayer,
      deleteMusicItem,
      moveToEnd,
      playNextItem,
      removeFromQueue,
    ],
  );

  useEffect(() => {
    if (
      !fullPlayerOpen ||
      !activeItem ||
      activeItem.lyrics?.trim() ||
      !activeItem.artist?.trim()
    ) {
      return;
    }

    const cacheKey = getLyricsCacheKey(activeItem);
    const cached = lyricsCacheRef.current[cacheKey];
    const now = Date.now();
    const cacheLifetime = cached?.lyrics
      ? LYRICS_SUCCESS_TTL
      : LYRICS_MISS_TTL;

    if (cached && now - cached.fetchedAt < cacheLifetime) {
      if (cached.lyrics) {
        setAutomaticLyrics(current => ({
          ...current,
          [activeItem.id]: cached.lyrics as string,
        }));
      }
      return;
    }

    const controller = new AbortController();
    const itemId = activeItem.id;
    const timer = window.setTimeout(() => {
      setLyricsLoadingId(itemId);

      void fetchMusicLyrics({
        title: activeItem.title,
        artist: activeItem.artist,
        durationSeconds: progress.duration,
        signal: controller.signal,
      })
        .then(lyrics => {
          if (controller.signal.aborted) return;

          lyricsCacheRef.current[cacheKey] = {
            lyrics,
            fetchedAt: Date.now(),
          };
          writeLyricsCache(lyricsCacheRef.current);

          if (lyrics) {
            setAutomaticLyrics(current => ({
              ...current,
              [itemId]: lyrics,
            }));
          }
        })
        .catch(error => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLyricsLoadingId(current =>
              current === itemId ? null : current,
            );
          }
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeItem?.artist,
    activeItem?.id,
    activeItem?.lyrics,
    activeItem?.title,
    fullPlayerOpen,
    progress.duration,
  ]);

  const requestYouTubePlayback = useCallback(
    (id: string | null) => {
      if (!id) {
        playRequestedRef.current = false;
        pendingVideoIdRef.current = '';
        youtubePlayerRef.current?.pauseVideo?.();
        return;
      }

      const item = getPlayableItems(musicItems).find(
        candidate => candidate.id === id,
      );

      if (!item || !isYouTubeItem(item)) return;

      const videoId = getYouTubeId(item.url);
      if (!videoId) return;

      playRequestedRef.current = true;
      pendingVideoIdRef.current = videoId;
      latestSyncPlaybackStateRef.current({ error: null });

      const player = youtubePlayerRef.current;
      if (!youtubeReadyRef.current || !player) return;

      if (loadedVideoIdRef.current === videoId) {
        player.playVideo?.();
        return;
      }

      positionsByTrackRef.current.delete(videoId);
      loadedVideoIdRef.current = videoId;
      pendingVideoIdRef.current = '';
      latestSyncPlaybackStateRef.current({
        position: 0,
        duration: 0,
        isReady: youtubeReadyRef.current,
        canPlayPause: true,
        canSeek: true,
        error: null,
      });
      player.loadVideoById?.(videoId);
    },
    [musicItems],
  );

  const pauseSpotifyPlayback = useCallback(() => {
    spotifyPendingPlayRef.current = null;
    clearSpotifyPlaybackAttempt();
    spotifyPlaybackConfirmedRef.current = false;
    spotifyControllerRef.current?.pause();
  }, [clearSpotifyPlaybackAttempt]);

  const requestSpotifyPlayback = useCallback(
    (id: string, shouldPlay: boolean) => {
      const item = getPlayableItems(musicItems).find(
        candidate => candidate.id === id,
      );

      if (!item || !isSpotifyItem(item)) return;

      clearSpotifyPlaybackAttempt();
      spotifyPlaybackUnavailableRef.current = false;

      spotifyPendingPlayRef.current = shouldPlay
        ? {
          id,
          url: item.url,
          generation: spotifyControllerGenerationRef.current || null,
        }
        : null;

      const controller = spotifyControllerRef.current;
      if (!controller || !spotifyReadyRef.current) return;

      const needsEntityLoad =
        spotifyControllerItemIdRef.current !== id ||
        spotifyControllerItemUrlRef.current !== item.url;

      try {
        if (needsEntityLoad) {
          spotifyControllerItemIdRef.current = id;
          spotifyHasPlayedRef.current = false;
          latestSyncPlaybackStateRef.current({
            provider: 'spotify',
            isReady: true,
            isPlaying: false,
            isBuffering: false,
            position: 0,
            duration: 0,
            canPlayPause: true,
            canSeek: false,
            error: null,
            unavailableReason: null,
          });
          spotifyControllerItemUrlRef.current = item.url;
          controller.loadEntity(item.url);

          // Loading an entity is asynchronous. The pending request is
          // consumed by the first playback update for this entity, where the
          // controller can actually receive resume().
          return;
        }

        if (shouldPlay) {
          spotifyPendingPlayRef.current = null;
          armSpotifyPlaybackAttempt(id, item.url, spotifyControllerGenerationRef.current || null);
          controller.resume();
        }
      } catch {
        spotifyPendingPlayRef.current = null;
        clearSpotifyPlaybackAttempt();
        if (needsEntityLoad) {
          spotifyControllerItemIdRef.current = null;
          spotifyControllerItemUrlRef.current = null;
        }
        latestSyncPlaybackStateRef.current({
          provider: 'spotify',
          isReady: true,
          isPlaying: false,
          isBuffering: false,
          canPlayPause: false,
          canSeek: false,
          error: 'This Spotify item could not be loaded.',
          unavailableReason: 'unknown',
        });
      }
    },
    [armSpotifyPlaybackAttempt, clearSpotifyPlaybackAttempt, musicItems],
  );

  const playLocalSample = useCallback((shouldPlay = true) => {
    let audio = localAudioRef.current;
    if (!audio) {
      audio = new Audio('/demo-assets/quiet-room.wav');
      localAudioRef.current = audio;
      const sync = () => { if (!isBundledDemoAudio(latestActiveItemRef.current)) return; latestSyncPlaybackStateRef.current({ provider: 'local', isReady: true, isPlaying: !audio!.paused, isBuffering: false, position: audio!.currentTime, duration: Number.isFinite(audio!.duration) ? audio!.duration : 0, canPlayPause: true, canSeek: true }); };
      for (const event of ['loadedmetadata', 'play', 'pause', 'timeupdate']) audio.addEventListener(event, sync);
      audio.addEventListener('ended', () => { if (isBundledDemoAudio(latestActiveItemRef.current)) latestPlayNextRef.current(); });
      audio.addEventListener('error', () => latestSyncPlaybackStateRef.current({ error: 'The bundled sample could not be played.', isPlaying: false }));
    }
    if (audio.ended) audio.currentTime = 0;
    if (shouldPlay) void audio.play().catch(() => latestSyncPlaybackStateRef.current({ error: 'Tap Play to start the local sample.', isPlaying: false }));
    else audio.pause();
  }, []);
  useEffect(() => () => { localAudioRef.current?.pause(); localAudioRef.current = null; }, []);

  const selectPlayback = useCallback(
    (id: string | null, shouldPlay = true) => {
      localAudioRef.current?.pause();
      if (!id) {
        requestYouTubePlayback(null);
        pauseSpotifyPlayback();
        return;
      }

      const item = getPlayableItems(musicItems).find(
        candidate => candidate.id === id,
      );

      if (!item) return;
      if (isBundledDemoAudio(item)) { requestYouTubePlayback(null); pauseSpotifyPlayback(); playLocalSample(shouldPlay); return; }

      if (isYouTubeItem(item)) {
        pauseSpotifyPlayback();
        if (shouldPlay) requestYouTubePlayback(id);
        else requestYouTubePlayback(null);
        return;
      }

      if (isSpotifyItem(item)) {
        requestYouTubePlayback(null);
        requestSpotifyPlayback(id, shouldPlay);
        return;
      }

      requestYouTubePlayback(null);
      pauseSpotifyPlayback();
    },
    [
      musicItems,
      playLocalSample,
      pauseSpotifyPlayback,
      requestSpotifyPlayback,
      requestYouTubePlayback,
    ],
  );

  const playCurrent = useCallback(() => {
    const item = latestActiveItemRef.current;
    if (!item) return;
    if (isBundledDemoAudio(item)) { playLocalSample(); return; }

    if (isYouTubeItem(item)) {
      requestYouTubePlayback(item.id);
      return;
    }

    if (isSpotifyItem(item)) {
      requestSpotifyPlayback(item.id, true);
    }
  }, [playLocalSample, requestSpotifyPlayback, requestYouTubePlayback]);

  const pauseCurrent = useCallback(() => {
    localAudioRef.current?.pause();
    const item = latestActiveItemRef.current;
    if (isSpotifyItem(item)) {
      pauseSpotifyPlayback();
      return;
    }

    if (isYouTubeItem(item)) requestYouTubePlayback(null);
  }, [pauseSpotifyPlayback, requestYouTubePlayback]);

  const seekCurrent = useCallback((seconds: number) => {
    const item = latestActiveItemRef.current;
    if (isBundledDemoAudio(item) && localAudioRef.current) { localAudioRef.current.currentTime = Math.max(0, seconds); return; }

    if (isSpotifyItem(item)) {
      const controller = spotifyControllerRef.current;
      if (!controller || !spotifyReadyRef.current) return;

      try {
        controller.seek(Math.max(0, seconds));
      } catch {
        // A provider seek failure leaves the last authoritative state intact.
      }
      return;
    }

    const player = youtubePlayerRef.current;
    if (!player?.seekTo) return;

    player.seekTo(Math.max(0, seconds), true);
    latestSyncPlaybackStateRef.current({
      position: Math.max(0, seconds),
    });
  }, []);

  useEffect(() => {
    registerPlaybackBridge({
      select: selectPlayback,
      play: playCurrent,
      pause: pauseCurrent,
      seek: seekCurrent,
      stop: () => {
        localAudioRef.current?.pause();
        requestYouTubePlayback(null);
        pauseSpotifyPlayback();
      },
    });

    return () => registerPlaybackBridge(null);
  }, [
    pauseCurrent,
    pauseSpotifyPlayback,
    playCurrent,
    registerPlaybackBridge,
    requestYouTubePlayback,
    selectPlayback,
    seekCurrent,
  ]);

  const handleSelectAndPlay = useCallback(
    (id: string) => {
      setActiveId(id);
    },
    [setActiveId],
  );

  const handleSelectPlaylist = useCallback(
    (playlist: string) => {
      const tracks = getPlayableItems(musicItems).filter(
        item =>
          item.playlist === playlist ||
          item.playlists?.includes(playlist)
      );

      if (tracks.length > 0) {
        playItems(tracks[0].id, tracks);
      }
    },
    [musicItems, playItems]
  );

  useEffect(() => {
    document.documentElement.dataset.musicPlayerActive = String(Boolean(activeItem));

    return () => {
      delete document.documentElement.dataset.musicPlayerActive;
    };
  }, [activeItem]);

  const capabilityText =
    getSourceCapabilityText(activeItem);

  const fullPlayerCapabilityText = useMemo(() => {
    if (resolvedActiveItem?.lyrics?.trim()) {
      const source = activeItem?.lyrics?.trim()
        ? 'Saved lyrics'
        : 'Lyrics · LRCLIB';
      return `${capabilityText} · ${source}`;
    }

    if (lyricsLoadingId === activeItem?.id) {
      return `${capabilityText} · Finding lyrics…`;
    }

    return capabilityText;
  }, [
    activeItem?.id,
    activeItem?.lyrics,
    capabilityText,
    lyricsLoadingId,
    resolvedActiveItem?.lyrics,
  ]);

  const openActiveSource = useCallback(() => {
    const destination = normalizeExternalWebUrl(activeItem?.url);
    if (destination) void openExternalLink(destination);
  }, [activeItem?.url]);

  const showToast = useCallback(
    (title: string, message: string) => {
      notifyLegacy({
        title,
        description: message,
      });
    },
    []
  );

  const handleRepeatClick = () => {
    const nextMode: RepeatMode =
      repeatMode === 'off'
        ? 'all'
        : repeatMode === 'all'
          ? 'one'
          : 'off';

    cycleRepeatMode();

    const nextToast =
      getRepeatToast(nextMode);

    showToast(
      nextToast.title,
      nextToast.message
    );
  };

  const handleShuffleClick = () => {
    setShuffleEnabled(current => {
      const next = !current;

      showToast(
        next ? 'Shuffle enabled' : 'Shuffle disabled',
        next
          ? 'Songs will play in a random order.'
          : 'Songs will follow the current queue order.'
      );

      return next;
    });
  };

  const handleStopPlayback = useCallback(() => {
    stopPlayback();
    setShowQueue(false);

    showToast(
      'Playback stopped',
      'The active song was cleared.'
    );
  }, [
    stopPlayback,
    showToast,
  ]);
  useEffect(() => {
    writeStorageValue(
      STORAGE_KEYS.hidden,
      String(hidden)
    );
  }, [hidden]);

  useEffect(() => {
    setHidden(false);
  }, [activeItem?.id]);

  useEffect(() => {
    if (fullPlayerOpen && isNativeApp()) setHidden(false);
  }, [fullPlayerOpen]);

  const finishMiniPlayerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = miniPlayerDragRef.current;
    const panel = miniPlayerRef.current;
    if (!drag || !panel) return;
    const distance = Math.max(0, event.clientY - drag.startY);
    const velocity = distance / Math.max(1, performance.now() - drag.startedAt);
    panel.releasePointerCapture?.(event.pointerId);
    panel.style.removeProperty('transform');
    panel.style.removeProperty('transition');
    miniPlayerDragRef.current = null;
    if (drag.dragging) miniPlayerSuppressClickRef.current = true;
    if (drag.dragging && (distance >= 56 || velocity >= 0.45)) setHidden(true);
  };

  const cancelMiniPlayerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const panel = miniPlayerRef.current;
    panel?.releasePointerCapture?.(event.pointerId);
    panel?.style.removeProperty('transform');
    panel?.style.removeProperty('transition');
    miniPlayerDragRef.current = null;
  };

  // The music widget's "Open player" deep link arrives as a navigate event
  // with feature `open-player`, routed through the same queue as every other
  // destination (see NativeAppShell).
  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = (
        event as CustomEvent<string | { section?: string; feature?: string }>
      ).detail;

      if (typeof detail === 'string') return;

      if (detail?.feature === 'open-player') {
        openFullPlayer();
      }
    };

    window.addEventListener('caizen:navigate', handleNavigate);

    return () => window.removeEventListener('caizen:navigate', handleNavigate);
  }, [openFullPlayer]);

  /*
    The YouTube iframe is created once and reused. Track changes use
    loadVideoById/cueVideoById, so the iframe is not destroyed between songs.
    This keeps autoplay, next/previous and playback position reliable.
  */
  useEffect(() => {
    const host = youtubeHostRef.current;
    if (!host) return;

    let cancelled = false;
    host.innerHTML = '';

    const playerNode = document.createElement('div');
    host.appendChild(playerNode);

    void loadYouTubeIframeApi().then(() => {
      if (
        cancelled ||
        !window.YT?.Player ||
        !playerNode.isConnected
      ) {
        return;
      }

      youtubePlayerRef.current = new window.YT.Player(playerNode, {
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          cc_load_policy: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event: any) => {
            if (cancelled) return;

            youtubeReadyRef.current = true;

            const currentItem = latestActiveItemRef.current;
            if (!currentItem || !isYouTubeItem(currentItem)) return;

            latestSyncPlaybackStateRef.current({
              provider: 'youtube',
              isReady: true,
              canPlayPause: true,
              canSeek: true,
              error: null,
            });

            const videoId =
              pendingVideoIdRef.current || getYouTubeId(currentItem.url);

            if (!videoId) return;

            const shouldPlay =
              playRequestedRef.current || latestIsPlayingRef.current;

            loadedVideoIdRef.current = videoId;
            pendingVideoIdRef.current = '';

            if (shouldPlay) {
              event.target.loadVideoById?.(videoId);
            } else {
              event.target.cueVideoById?.(videoId);
            }
          },
          onStateChange: (event: any) => {
            if (cancelled) return;

            const currentItem = latestActiveItemRef.current;
            if (!currentItem || !isYouTubeItem(currentItem)) return;

            // 0 ended, 1 playing, 2 paused, 5 cued.
            if (event.data === 0) {
              playRequestedRef.current = true;
              latestPlayNextRef.current();
              return;
            }

            if (event.data === 1) {
              playRequestedRef.current = false;
              latestSyncPlaybackStateRef.current({
                provider: 'youtube',
                isReady: true,
                isPlaying: true,
                isBuffering: false,
                canPlayPause: true,
                canSeek: true,
                error: null,
                position: event.target.getCurrentTime?.() || 0,
                duration: event.target.getDuration?.() || 0,
              });
              return;
            }

            if (event.data === 2) {
              if (!playRequestedRef.current) {
                latestSyncPlaybackStateRef.current({
                  provider: 'youtube',
                  isReady: true,
                  isPlaying: false,
                  isBuffering: false,
                  canPlayPause: true,
                  canSeek: true,
                });
              }
              return;
            }

            if (event.data === 5 && playRequestedRef.current) {
              event.target.playVideo?.();
            }
          },
          onError: () => {
            if (cancelled) return;

            const currentItem = latestActiveItemRef.current;
            if (!currentItem || !isYouTubeItem(currentItem)) return;

            playRequestedRef.current = false;
            latestSyncPlaybackStateRef.current({
              provider: 'youtube',
              isReady: true,
              isPlaying: false,
              isBuffering: false,
              canPlayPause: true,
              canSeek: true,
              error:
                'This video is unavailable or cannot be embedded. Open the original source instead.',
            });
          },
        },
      });
    });

    return () => {
      cancelled = true;
      youtubeReadyRef.current = false;
      loadedVideoIdRef.current = '';
      pendingVideoIdRef.current = '';
      youtubePlayerRef.current?.destroy?.();
      youtubePlayerRef.current = null;
      host.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    if (playbackMode !== 'spotify' || !activeItem) return;

    const host = spotifyHostRef.current;
    if (!host) return;

    if (!getSpotifyLink(activeItem.url) || !embedUrl) {
      clearSpotifyPlaybackAttempt();
      spotifyPlaybackConfirmedRef.current = false;
      latestSyncPlaybackStateRef.current({
        provider: 'spotify',
        isReady: false,
        isPlaying: false,
        isBuffering: false,
        canPlayPause: false,
        canSeek: false,
        error: 'This Spotify link could not be read.',
      });
      return;
    }

    let cancelled = false;
    let controller: SpotifyEmbedController | null = null;
    const generation = spotifyControllerGenerationRef.current + 1;
    spotifyControllerGenerationRef.current = generation;
    spotifyReadyRef.current = false;
    clearSpotifyPlaybackAttempt();
    spotifyPlaybackConfirmedRef.current = false;
    spotifyControllerItemIdRef.current = null;

    const pendingPlayback = spotifyPendingPlayRef.current;
    if (
      pendingPlayback &&
      pendingPlayback.id === activeItem.id &&
      pendingPlayback.url === activeItem.url
    ) {
      spotifyPendingPlayRef.current = {
        ...pendingPlayback,
        generation,
      };
    } else {
      spotifyPendingPlayRef.current = null;
    }

    const belongsToCurrentTrack = (playingURI: string) => {
      const currentItem = latestActiveItemRef.current;
      const spotify = currentItem
        ? getSpotifyLink(currentItem.url)
        : null;

      if (!currentItem || !spotify || !isSpotifyItem(currentItem)) return false;
      if (spotify.type !== 'track') return true;

      return playingURI === `spotify:track:${spotify.id}`;
    };

    const attemptPendingPlayback = () => {
      const pending = spotifyPendingPlayRef.current;
      const currentItem = latestActiveItemRef.current;

      if (
        !controller ||
        !currentItem ||
        !pending ||
        pending.id !== currentItem.id ||
        pending.url !== currentItem.url ||
        pending.generation !== generation ||
        spotifyControllerItemIdRef.current !== currentItem.id ||
        spotifyControllerItemUrlRef.current !== currentItem.url
      ) return;

      // Consume the intent before making the one provider request. A blocked
      // autoplay attempt must remain truthfully paused and must not be retried
      // by a later provider event.
      spotifyPendingPlayRef.current = null;
      try {
        armSpotifyPlaybackAttempt(currentItem.id, currentItem.url, generation);
        controller.resume();
      } catch {
        clearSpotifyPlaybackAttempt();
        spotifyPlaybackUnavailableRef.current = true;
        latestSyncPlaybackStateRef.current({
          provider: 'spotify',
          isPlaying: false,
          isBuffering: false,
          canPlayPause: false,
          canSeek: false,
          error: 'Spotify could not start playback here. Open in Spotify to continue.',
          unavailableReason: spotifyHasPlayedRef.current
            ? 'restricted'
            : 'unauthenticated',
        });
      }
    };

    const handleReady = () => {
      if (
        cancelled ||
        generation !== spotifyControllerGenerationRef.current
      ) return;

      spotifyReadyRef.current = true;
      latestSyncPlaybackStateRef.current({
        provider: 'spotify',
        isReady: true,
        isBuffering: false,
        canPlayPause: true,
        error: null,
        unavailableReason: null,
      });

      const currentItem = latestActiveItemRef.current;
      if (!controller || !currentItem) return;

      try {
        if (
          spotifyControllerItemIdRef.current !== currentItem.id ||
          spotifyControllerItemUrlRef.current !== currentItem.url
        ) {
          spotifyControllerItemIdRef.current = currentItem.id;
          spotifyControllerItemUrlRef.current = currentItem.url;
          spotifyHasPlayedRef.current = false;
          controller.loadEntity(currentItem.url);
          if (spotifyPendingPlayRef.current?.id === currentItem.id) {
            armSpotifyPlaybackAttempt(currentItem.id, currentItem.url, generation);
          }

          // Wait for the entity's playback update before attempting resume;
          // ready only establishes controller readiness, not completion of a
          // subsequent loadEntity call.
          return;
        }
      } catch {
        spotifyPendingPlayRef.current = null;
        latestSyncPlaybackStateRef.current({
          provider: 'spotify',
          isPlaying: false,
          isBuffering: false,
          canPlayPause: false,
          canSeek: false,
          error: 'This Spotify item could not be loaded.',
          unavailableReason: 'unknown',
        });
        return;
      }

      attemptPendingPlayback();
    };

    const handlePlaybackStarted = (event?: SpotifyControllerEvent) => {
      if (
        cancelled ||
        generation !== spotifyControllerGenerationRef.current
      ) return;

      const data = event?.data;
      if (!data || !('playingURI' in data) || !data.playingURI) return;
      if (!belongsToCurrentTrack(data.playingURI)) return;

      clearSpotifyPlaybackAttempt();
      spotifyPlaybackConfirmedRef.current = true;
      spotifyPlaybackUnavailableRef.current = false;
      spotifyHasPlayedRef.current = true;

      const pending = spotifyPendingPlayRef.current;
      const currentItem = latestActiveItemRef.current;
      if (
        pending &&
        currentItem &&
        pending.id === currentItem.id &&
        pending.url === currentItem.url &&
        pending.generation === generation
      ) {
        spotifyPendingPlayRef.current = null;
      }

      latestSyncPlaybackStateRef.current({
        provider: 'spotify',
        isReady: true,
        isPlaying: true,
        isBuffering: false,
        canPlayPause: true,
        error: null,
        unavailableReason: null,
      });
    };

    const handlePlaybackUpdate = (event?: SpotifyControllerEvent) => {
      if (
        cancelled ||
        generation !== spotifyControllerGenerationRef.current
      ) return;

      const data = event?.data;
      if (!data || !('isPaused' in data)) return;
      if (data.playingURI && !belongsToCurrentTrack(data.playingURI)) return;

      const duration = Number.isFinite(data.duration)
        ? Math.max(0, data.duration / 1000)
        : 0;
      const position = Number.isFinite(data.position)
        ? Math.max(0, data.position / 1000)
        : 0;

      if (!data.isPaused) {
        clearSpotifyPlaybackAttempt();
        spotifyPlaybackConfirmedRef.current = true;
        spotifyPlaybackUnavailableRef.current = false;
        spotifyHasPlayedRef.current = true;
      } else if (spotifyPlaybackUnavailableRef.current) {
        return;
      }

      latestSyncPlaybackStateRef.current({
        provider: 'spotify',
        isReady: true,
        isPlaying: !data.isPaused,
        isBuffering: Boolean(data.isBuffering),
        position,
        duration,
        canPlayPause: true,
        canSeek: duration > 0,
        error: null,
        unavailableReason: null,
      });

      if (
        data.playingURI &&
        !data.isBuffering &&
        data.isPaused
      ) {
        attemptPendingPlayback();
      } else if (!data.isPaused) {
        const pending = spotifyPendingPlayRef.current;
        const currentItem = latestActiveItemRef.current;
        if (
          pending &&
          currentItem &&
          pending.id === currentItem.id &&
          pending.url === currentItem.url &&
          pending.generation === generation
        ) {
          spotifyPendingPlayRef.current = null;
        }
      }
    };

    void loadSpotifyIframeApi()
      .then(api => {
        if (
          cancelled ||
          generation !== spotifyControllerGenerationRef.current ||
          !host.isConnected
        ) return;

        host.innerHTML = '';
        const spotify = getSpotifyLink(activeItem.url);
        const height = spotify &&
          ['album', 'playlist', 'show'].includes(spotify.type)
          ? 352
          : 152;

        api.createController(
          host,
          {
            url: activeItem.url,
            width: '100%',
            height,
          },
          createdController => {
            if (
              cancelled ||
              generation !== spotifyControllerGenerationRef.current
            ) {
              createdController.destroy();
              return;
            }

            controller = createdController;
            spotifyControllerRef.current = createdController;
            // The createController URL is only the iframe's initial config.
            // Let the ready handler commit the track after the controller is
            // ready, so pending play waits for the matching entity load.
            createdController.addListener('ready', handleReady);
            createdController.addListener(
              'playback_started',
              handlePlaybackStarted,
            );
            createdController.addListener(
              'playback_update',
              handlePlaybackUpdate,
            );
          },
        );
      })
      .catch(() => {
        if (
          cancelled ||
          generation !== spotifyControllerGenerationRef.current
        ) return;

        spotifyPendingPlayRef.current = null;
        spotifyPlaybackUnavailableRef.current = true;

        latestSyncPlaybackStateRef.current({
          provider: 'spotify',
          isReady: false,
          isPlaying: false,
          isBuffering: false,
          canPlayPause: false,
          canSeek: false,
          error: 'Spotify controls are unavailable. Use the embedded player.',
          unavailableReason: 'unknown',
        });
      });

    return () => {
      cancelled = true;
      spotifyControllerGenerationRef.current += 1;
      spotifyReadyRef.current = false;
      spotifyPendingPlayRef.current = null;
      clearSpotifyPlaybackAttempt();
      spotifyPlaybackConfirmedRef.current = false;
      spotifyPlaybackUnavailableRef.current = false;
      spotifyHasPlayedRef.current = false;
      spotifyControllerItemIdRef.current = null;
      spotifyControllerItemUrlRef.current = null;

      if (controller) {
        controller.removeListener?.('ready', handleReady);
        controller.removeListener?.(
          'playback_started',
          handlePlaybackStarted,
        );
        controller.removeListener?.(
          'playback_update',
          handlePlaybackUpdate,
        );
        try {
          controller.pause();
        } catch {
          // Cleanup must continue even if the provider has already closed.
        }
        controller.destroy();
      }

      if (spotifyControllerRef.current === controller) {
        spotifyControllerRef.current = null;
      }

      host.innerHTML = '';
    };
  }, [armSpotifyPlaybackAttempt, clearSpotifyPlaybackAttempt, playbackMode]);

  useEffect(() => {
    if (playbackMode !== 'spotify' || !activeItem) return;

    const controller = spotifyControllerRef.current;
    if (!controller || !spotifyReadyRef.current) return;
    if (
      spotifyControllerItemIdRef.current === activeItem.id &&
      spotifyControllerItemUrlRef.current === activeItem.url
    ) return;

    clearSpotifyPlaybackAttempt();
    spotifyPlaybackConfirmedRef.current = false;
    spotifyControllerItemIdRef.current = activeItem.id;
    spotifyControllerItemUrlRef.current = activeItem.url;
    spotifyHasPlayedRef.current = false;
    latestSyncPlaybackStateRef.current({
      provider: 'spotify',
      isReady: true,
      isPlaying: false,
      isBuffering: false,
      position: 0,
      duration: 0,
      canPlayPause: true,
      canSeek: false,
      error: null,
      unavailableReason: null,
    });

    try {
      controller.loadEntity(activeItem.url);
    } catch {
      const pending = spotifyPendingPlayRef.current;
      if (
        pending?.id === activeItem.id &&
        pending.url === activeItem.url
      ) {
        spotifyPendingPlayRef.current = null;
      }

      latestSyncPlaybackStateRef.current({
        provider: 'spotify',
        isReady: true,
        isPlaying: false,
        isBuffering: false,
        canPlayPause: false,
        canSeek: false,
        error: 'This Spotify item could not be loaded.',
        unavailableReason: 'unknown',
      });
    }
  }, [activeItem?.id, activeItem?.url, clearSpotifyPlaybackAttempt, playbackMode]);

  /*
    Keep the persistent iframe aligned with the active item. Explicit play
    commands normally load synchronously through the registered bridge; this
    effect covers session restore and any state changes made elsewhere.
  */
  useEffect(() => {
    const player = youtubePlayerRef.current;

    if (!activeItem || !isYouTubeItem(activeItem)) {
      if (youtubeReadyRef.current && player) {
        player.stopVideo?.();
      }
      loadedVideoIdRef.current = '';
      pendingVideoIdRef.current = '';
      latestSyncPlaybackStateRef.current({
        provider: 'youtube',
        position: 0,
        duration: 0,
        isPlaying: false,
        isBuffering: false,
      });
      return;
    }

    const videoId = getYouTubeId(activeItem.url);
    if (!videoId) {
      latestSyncPlaybackStateRef.current({
        provider: 'youtube',
        isReady: youtubeReadyRef.current,
        isPlaying: false,
        isBuffering: false,
        canPlayPause: true,
        canSeek: true,
        error:
          'This YouTube link could not be read. Open the original source instead.',
      });
      return;
    }

    if (!youtubeReadyRef.current || !player) {
      pendingVideoIdRef.current = videoId;
      return;
    }

    if (loadedVideoIdRef.current === videoId) {
      if (isPlaying || playRequestedRef.current) {
        player.playVideo?.();
      }
      return;
    }

    const shouldPlay = isPlaying || playRequestedRef.current;
    const rememberedPosition = shouldPlay
      ? 0
      : positionsByTrackRef.current.get(videoId) || 0;

    loadedVideoIdRef.current = videoId;
    pendingVideoIdRef.current = '';
    latestSyncPlaybackStateRef.current({
      provider: 'youtube',
      isPlaying: false,
      isBuffering: false,
      position: rememberedPosition,
      duration: 0,
      canPlayPause: true,
      canSeek: true,
      error: null,
    });

    if (shouldPlay) {
      playRequestedRef.current = true;
      positionsByTrackRef.current.delete(videoId);
      player.loadVideoById?.(videoId);
    } else {
      player.cueVideoById?.({
        videoId,
        startSeconds: rememberedPosition,
      });
    }
  }, [activeItem?.id, activeItem?.url, isPlaying]);

  // Pause/resume the already-loaded player without rebuilding the iframe.
  useEffect(() => {
    const player = youtubePlayerRef.current;
    if (!youtubeReadyRef.current || !player || !isYouTubeItem(activeItem)) {
      return;
    }

    if (isPlaying) {
      playRequestedRef.current = true;
      player.playVideo?.();
      return;
    }

    if (!playRequestedRef.current) {
      player.pauseVideo?.();
    }
  }, [activeItem, isPlaying]);

  // Progress ticker for the seek bar. Only YouTube reports a position; the
  // Spotify embed does not, so its seek bar is absent rather than faked.
  useEffect(() => {
    if (!isPlaying || !isYouTubeItem(activeItem)) return;

    const timer = window.setInterval(() => {
      const player = youtubePlayerRef.current;

      if (!player?.getCurrentTime) return;

      latestSyncPlaybackStateRef.current({
        position: player.getCurrentTime() || 0,
        duration: player.getDuration?.() || 0,
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPlaying, activeItem]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        isTextEditingTarget(event.target) ||
        (event.target instanceof Element && event.target.closest(
          '[data-radix-popper-content-wrapper], [data-caizen-overlay="open"]:not(.cz-full-player), [role="dialog"]:not(.cz-full-player)',
        )) ||
        !activeItem
      ) return;

      if (event.key === ' ') {
        event.preventDefault();
        togglePlayback();
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        playNext();
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        playPrevious();
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleStopPlayback();
      }

      if (event.key.toLowerCase() === 'q') {
        event.preventDefault();
        setShowQueue(current => !current);
      }

      if (event.key === 'Escape') {
        setShowQueue(false);
      }
    };

    window.addEventListener('keydown', handleShortcut);

    return () => {
      window.removeEventListener('keydown', handleShortcut);
    };
  }, [
    activeItem,
    togglePlayback,
    playNext,
    playPrevious,
    handleStopPlayback,
  ]);

  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      !activeItem
    ) {
      return;
    }

    navigator.mediaSession.metadata =
      new MediaMetadata({
        title: activeItem.title,
        artist:
          activeItem.artist ||
          'Unknown artist',
        album:
          activeItem.playlist ||
          'Life Manager',
        artwork: artwork
          ? [
            {
              src: artwork,
              sizes: '512x512',
              type: 'image/png',
            },
          ]
          : undefined,
      });

    navigator.mediaSession.playbackState =
      playbackCapabilities.canControlPlayback
        ? isPlaying
          ? 'playing'
          : 'paused'
        : 'none';
    const setActionHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some browsers expose only a subset of Media Session actions.
      }
    };

    setActionHandler(
      'play',
      playbackCapabilities.canControlPlayback ? togglePlayback : null,
    );

    setActionHandler(
      'pause',
      playbackCapabilities.canControlPlayback ? togglePlayback : null,
    );

    setActionHandler(
      'seekto',
      playbackCapabilities.canSeek
        ? details => {
          if (typeof details.seekTime === 'number') {
            seekPlayback(details.seekTime);
          }
        }
        : null,
    );

    setActionHandler('previoustrack', playPrevious);
    setActionHandler('nexttrack', playNext);

    return () => {
      navigator.mediaSession.playbackState =
        'none';
    };
  }, [
    activeItem,
    artwork,
    isPlaying,
    playbackCapabilities.canControlPlayback,
    playbackCapabilities.canSeek,
    playbackState.error,
    togglePlayback,
    seekPlayback,
    playPrevious,
    playNext,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const android =
      isNativeApp() ||
      document.documentElement.dataset.capacitor === 'true';
    const height = !activeItem
      ? '0rem'
      : android
        ? '4rem'
        : hidden
          ? '3rem'
          : '7.25rem';

    document.documentElement.style.setProperty(
      '--mobile-music-player-height',
      height
    );

    return () => {
      document.documentElement.style.removeProperty(
        '--mobile-music-player-height'
      );
    };
  }, [activeItem, hidden]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (videoBackgroundActive) {
      document.documentElement.dataset.musicVideoBackground = 'true';
    } else {
      delete document.documentElement.dataset.musicVideoBackground;
    }

    return () => {
      delete document.documentElement.dataset.musicVideoBackground;
    };
  }, [videoBackgroundActive]);

  return (
    <>
      {/*
        Keep the YouTube host mounted even with no active track. The iframe is
        pre-initialized and reused, allowing the first song click to call
        loadVideoById during the original user gesture.
      */}
      <div
        className={`cz-player-stage ${
          videoBackgroundActive
            ? 'cz-player-stage-background'
            : activeItem && playbackMode !== 'external' && fullPlayerOpen
            ? 'cz-player-stage-full'
            : 'cz-player-stage-minimized'
        }`}
        data-playback-mode={activeItem ? playbackMode : undefined}
        data-spotify-type={spotifyEmbedType}
        data-background-video={videoBackgroundActive || undefined}
        aria-hidden={!activeItem || playbackMode === 'external' || videoBackgroundActive}
      >
        <div
          ref={youtubeHostRef}
          className="cz-player-stage-frame"
          hidden={Boolean(activeItem) && playbackMode !== 'youtube'}
        />

        <div
          ref={spotifyHostRef}
          className="cz-player-stage-frame cz-spotify-controller-host"
          hidden={
            playbackMode !== 'spotify' ||
            Boolean(playbackError)
          }
          aria-busy={
            playbackMode === 'spotify' &&
            !playbackState.isReady &&
            !playbackError
              ? 'true'
              : undefined
          }
        />

        {activeItem &&
          playbackMode === 'spotify' &&
          embedUrl &&
          playbackError && (
          <iframe
            key={activeItem.id}
            title={`${activeItem.title} Spotify player`}
            src={embedUrl}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading={fullPlayerOpen ? 'eager' : 'lazy'}
            className="cz-player-stage-frame"
          />
        )}
      </div>

      {activeItem && (
        <>
      {fullPlayerOpen && (
        <MusicFullPlayer
          activeItem={resolvedActiveItem || activeItem}
          artwork={artwork}
          capabilityText={fullPlayerCapabilityText}
          capabilities={playbackCapabilities}
          spotifyEmbedType={spotifyEmbedType}
          playbackMode={playbackMode}
          playbackError={playbackError}
          spotifyUnavailableReason={spotifyUnavailableReason}
          isBuffering={playbackState.isBuffering}
          progress={progress}
          onSeek={seekPlayback}
          isPlaying={isPlaying}
          shuffleEnabled={shuffleEnabled}
          repeatMode={repeatMode}
          queueItems={queueItems}
          activeId={activeId}
          playlists={playlists}
          onSelectPlaylist={handleSelectPlaylist}
          onClose={closeFullPlayer}
          onOpenSource={openActiveSource}
          onTogglePlayback={togglePlayback}
          onNext={playNext}
          onPrevious={playPrevious}
          onShuffle={handleShuffleClick}
          onRepeat={handleRepeatClick}
          onSelectQueueItem={handleSelectAndPlay}
          onClearQueue={clearQueue}
          onStop={handleStopPlayback}
          onRowAction={handleRowAction}
        />
      )}

      {showQueue && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm md:items-center"
          data-caizen-overlay="open"
        >
          <div
            ref={queuePanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="caizen-mini-queue-title"
            tabIndex={-1}
            className="motion-pop max-h-[80dvh] w-full max-w-lg overflow-hidden rounded-[2rem] border border-border bg-background shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/60 p-4 sm:p-5">
              <div>
                <p
                  id="caizen-mini-queue-title"
                  className="text-xs font-black uppercase tracking-wider text-primary"
                >
                  Queue
                </p>

                <h3 className="mt-1 text-lg font-black">
                  Up next · {queueItems.length} song{queueItems.length === 1 ? '' : 's'}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  This queue follows the playlist or view you started from.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearQueue}
                  className="rounded-xl px-3 py-2 text-xs font-black text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Clear
                </button>

                <button
                  type="button"
                  ref={queueCloseButtonRef}
                  onClick={closeQueue}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close queue"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[60dvh] space-y-2 overflow-y-auto p-3">
              {queueItems.length === 0 && (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <ListMusic className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-black">Your queue is clear</p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    Choose a song from a playlist or library view to build a new queue.
                  </p>
                </div>
              )}

              {visibleQueueItems.map((item, index) => {
                const itemArtwork =
                  getMusicArtwork(item);

                const active =
                  item.id === activeId;

                return (
                  <div
                    ref={active ? miniQueueActiveRowRef : undefined}
                    key={item.id}
                    className={`flex items-center gap-3 rounded-2xl border p-2 ${active
                      ? 'border-primary/30 bg-primary/10'
                      : 'border-border/50 bg-card/50'
                      }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectAndPlay(item.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10">
                        {itemArtwork ? (
                          <ResilientImage
                            src={itemArtwork}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                            fallback={<ListMusic className="h-5 w-5 text-primary" aria-hidden="true" />}
                          />
                        ) : (
                          <ListMusic className="h-5 w-5 text-primary" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">
                          {active ? 'Now · ' : `${queueWindowStart + index + 1}. `}
                          {item.title}
                        </p>

                        <p className="truncate text-xs text-muted-foreground">
                          {item.artist || 'Unknown artist'}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => removeFromQueue(item.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={`Remove ${item.title} from queue`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}

              {renderedQueueCount < queueItems.length && (
                <button
                  type="button"
                  className="cz-queue-load-more"
                  onClick={() =>
                    setQueueVisibleCount(current =>
                      Math.min(
                        queueItems.length,
                        current + MINI_PLAYER_QUEUE_BATCH_SIZE,
                      ),
                    )
                  }
                >
                  Load more queue items ({queueItems.length - renderedQueueCount} remaining)
                </button>
              )}
            </div>

            <div className="border-t border-border/60 p-3 text-center text-xs font-semibold text-muted-foreground">
              Shortcuts: Space play/pause · ← previous · → next · Q queue · S stop
            </div>
          </div>
        </div>
      )}

      {!hidden && <aside
        ref={miniPlayerRef}
        className="android-only android-mini-player mobile-floating-music fixed"
        data-android-mini-player="true"
        onPointerDown={event => {
          if ((event.target as Element).closest('.android-mini-player-action')) return;
          miniPlayerSuppressClickRef.current = false;
          miniPlayerDragRef.current = { startX: event.clientX, startY: event.clientY, startedAt: performance.now(), dragging: false };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={event => {
          const drag = miniPlayerDragRef.current;
          if (!drag) return;
          const distance = Math.max(0, event.clientY - drag.startY);
          const horizontalDistance = Math.abs(event.clientX - drag.startX);
          if (!drag.dragging && (distance < 6 || horizontalDistance > distance)) return;
          drag.dragging = true;
          event.currentTarget.style.transition = 'none';
          event.currentTarget.style.transform = `translateY(${Math.min(distance, 96)}px)`;
        }}
        onPointerUp={finishMiniPlayerDrag}
        onPointerCancel={cancelMiniPlayerDrag}
      >
        <button
          type="button"
          className="android-mini-player-main"
          onClick={() => {
            if (miniPlayerSuppressClickRef.current) {
              miniPlayerSuppressClickRef.current = false;
              return;
            }
            openFullPlayer();
          }}
          aria-label={`Open full player for ${activeItem.title}`}
        >
          <span className="android-mini-player-art">
            {artwork ? (
              <ResilientImage
                src={artwork}
                alt=""
                loading="eager"
                decoding="async"
                className="h-full w-full object-cover"
                fallback={<ListMusic className="h-5 w-5" aria-hidden="true" />}
              />
            ) : (
              <ListMusic className="h-5 w-5" />
            )}
          </span>
           <span className="android-mini-player-copy">
             <strong>{activeItem.title}</strong>
             <span>{activeItem.artist || 'Unknown artist'}</span>
             {playbackState.isBuffering && (
               <span role="status">Buffering…</span>
             )}
             {!playbackCapabilities.canControlPlayback && !playbackState.isBuffering && (
               <span>{capabilityText}</span>
             )}
           </span>
         </button>
         {playbackCapabilities.canControlPlayback && (
           <button
             type="button"
             className="android-mini-player-action"
             onClick={() => {
               openFullPlayer();
               togglePlayback();
             }}
             aria-label={isPlaying ? 'Pause track' : 'Play track'}
           >
             {isPlaying ? (
               <Pause className="h-5 w-5" />
             ) : (
               <Play className="h-5 w-5" />
             )}
           </button>
         )}
        <button
          type="button"
          className="android-mini-player-action"
          onClick={playNext}
          aria-label="Next track"
        >
          <SkipForward className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="android-mini-player-action"
          onClick={() => setHidden(true)}
          aria-label="Hide mini player"
          title="Hide mini player"
        >
          <X className="h-5 w-5" />
        </button>
      </aside>}

      {hidden && (
        <button
          type="button"
          onClick={() => setHidden(false)}
          className="web-only-player motion-pop mobile-floating-music fixed right-3 z-[45] flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background/95 text-primary shadow-2xl backdrop-blur-2xl transition-all hover:bg-primary hover:text-primary-foreground md:bottom-4 md:z-[70]"
          aria-label="Show mini player"
          title="Show mini player"
        >
          <ListMusic className="h-5 w-5" />
        </button>
      )}

      {!hidden && (
        <aside className="web-mini-player web-only-player motion-pop mobile-floating-music fixed left-3 right-3 z-[45] mx-auto max-w-6xl overflow-hidden rounded-3xl border border-border/60 bg-background/95 shadow-2xl backdrop-blur-2xl md:bottom-4 md:z-[70]">
          <div className="web-mini-player-layout grid gap-2 p-2 md:gap-3 md:p-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="web-mini-player-meta flex min-w-0 items-center gap-2 md:gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 md:h-12 md:w-12">
                {artwork ? (
                  <ResilientImage
                    src={artwork}
                    alt=""
                    loading="eager"
                    decoding="async"
                    className="h-full w-full object-cover"
                    fallback={<ListMusic className="h-5 w-5 text-primary" aria-hidden="true" />}
                  />
                ) : (
                  <ListMusic className="h-5 w-5 text-primary" />
                )}
              </div>

              <div className="min-w-0">
                <p className="truncate text-xs font-black md:text-sm">
                  {activeItem.title}
                </p>

                <p className="truncate text-[11px] text-muted-foreground md:text-xs">
                  {activeItem.artist || 'Unknown artist'} - {activeItem.playlist || 'Main'}
                </p>

                <p className="web-mini-player-capability mt-0.5 truncate text-[10px] font-bold text-primary md:text-[11px]" role={playbackState.isBuffering ? 'status' : undefined}>
                  {playbackState.isBuffering ? 'Buffering…' : playbackError || capabilityText}
                </p>
                {playbackError && playbackMode === 'spotify' && <button type="button" className="mt-1 inline-flex min-h-8 items-center gap-1 rounded-lg border border-primary/35 px-2 text-[10px] font-black text-primary hover:bg-primary/10" onClick={openActiveSource}><ExternalLink className="h-3 w-3" aria-hidden="true" /> Open Spotify</button>}
              </div>

              {activeItem.favorite && (
                <Heart className="hidden h-4 w-4 shrink-0 fill-primary text-primary sm:block" />
              )}
            </div>

            <div className="web-mini-player-controls flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 scrollbar-hide xl:justify-end">
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={playPrevious}
                  aria-label="Previous track"
                  title="Previous track"
                  className="control-button h-9 min-h-9 w-9 rounded-xl p-0 md:h-10 md:min-h-10 md:w-10"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>

                {playbackCapabilities.canControlPlayback && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={togglePlayback}
                    aria-label={isPlaying ? 'Pause track' : 'Play track'}
                    title={isPlaying ? 'Pause track' : 'Play track'}
                    className={`control-button h-9 min-h-9 w-9 rounded-xl p-0 md:h-10 md:min-h-10 md:w-10 ${isPlaying
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : ''
                      }`}
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={playNext}
                  aria-label="Next track"
                  title="Next track"
                  className="control-button h-9 min-h-9 w-9 rounded-xl p-0 md:h-10 md:min-h-10 md:w-10"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>

              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={openFullPlayer}
                  className="control-button flex h-9 min-h-9 items-center justify-center rounded-xl px-2 text-xs font-black md:h-10 md:min-h-10 md:px-3"
                  aria-label="Open full player"
                  title="Open full player"
                >
                  <Maximize2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">
                    Player
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowQueue(true)}
                  className="control-button flex h-9 min-h-9 items-center justify-center rounded-xl px-2 text-xs font-black md:h-10 md:min-h-10 md:px-3"
                  aria-label="Open queue"
                  title="Open queue"
                >
                  <ListMusic className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">
                    Queue · {queueItems.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setHidden(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground md:h-10 md:w-10"
                  aria-label="Minimize mini player"
                  title="Minimize mini player"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}
        </>
      )}
    </>
  );
}
