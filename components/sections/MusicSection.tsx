'use client';
import { getSectionDiscoveryMeta } from '@/lib/discovery/section-meta';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { createPortal } from 'react-dom';

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Heart,
  List,
  ListMusic,
  MoreVertical,
  Music,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';

import { useAppContext } from '@/lib/context';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PaginationControls } from '@/components/ui/section-kit';
import { SearchField } from '@/components/ui/search-field';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { ResponsiveControlStrip } from '@/components/common/ResponsiveControlStrip';
import MusicModal from '@/components/modals/MusicModal';
import { ResilientImage } from '@/components/media/ResilientImage';
import {
  getMusicArtwork,
  getMusicPlaybackCapabilities,
  getSourceCapabilityText,
  getSpotifyUnavailableCopy,
  isSpotifyItem,
  useMusicPlayer,
} from '@/lib/music-player';
import { detectMusicProvider } from '@/lib/music-links';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import { useTheme } from '@/lib/theme';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import {
  formatMusicMonth,
  getMusicHistoryMonths,
  getMusicMonthKey,
  getMusicMonthlyPlayCounts,
  shiftMusicMonth,
} from '@/lib/music-history';

import {
  MusicItem,
  MusicProvider,
} from '@/lib/types';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

type MusicView =
  | 'all'
  | 'playlists'
  | 'favorites';

type LibraryMode =
  | 'list'
  | 'grid';

type SortMode =
  | 'recent'
  | 'title'
  | 'artist'
  | 'playlist'
  | 'favorites'
  | 'recentlyPlayed'
  | 'mostPlayed';

const ITEMS_PER_PAGE = 10;

const VIEWS: {
  id: MusicView;
  label: string;
}[] = [
    {
      id: 'all',
      label: 'All',
    },
    {
      id: 'playlists',
      label: 'Playlists',
    },
    {
      id: 'favorites',
      label: 'Favorites',
    },
  ];

const SORT_OPTIONS: {
  value: SortMode;
  label: string;
}[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'playlist', label: 'Playlist' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'recentlyPlayed', label: 'Recently played' },
  { value: 'mostPlayed', label: 'Most played' },
];

function openMusicLink(value?: string, title = 'music link') {
  const destination = normalizeExternalWebUrl(value);
  if (!destination) {
    toast({ title: 'Invalid link', description: 'Add a valid HTTPS music link and try again.' });
    return;
  }
  void openExternalLink(destination).catch(() => toast({ title: 'Could not open link', description: `Caizen could not open this ${title}.` }));
}

function getProviderLabel(
  provider?: MusicProvider
) {
  if (provider === 'youtube') return 'YouTube';
  if (provider === 'spotify') return 'Spotify';
  if (provider === 'link') return 'Direct link';

  return 'Other';
}

function isPlaylist(item: MusicItem) {
  return item.type === 'playlist';
}

function getCover(
  item?: MusicItem | null
) {
  return getMusicArtwork(item);
}

function getSongPlaylists(item: MusicItem) {
  if (item.playlists?.length) {
    return item.playlists;
  }

  return [item.playlist || 'Main'];
}


function Equalizer({
  active,
}: {
  active: boolean;
}) {
  return (
    <span className="music-equalizer inline-flex h-5 items-end gap-0.5" data-playing={active || undefined} aria-hidden="true">
      {[1, 2, 3, 4].map((bar, index) => (
        <span
          key={bar}
          className={`
            w-1 rounded-full bg-primary
          `}
          style={{
            height: active
              ? `${8 + ((index + 1) % 3) * 5}px`
              : '5px',
            animationDelay: `${index * 120}ms`,
          }}
        />
      ))}
    </span>
  );
}

export default function MusicSection({
  androidPresentation = false,
  requestedRecordId,
  requestedRecordSignal = 0,
  requestedProfileId,
  onRequestedRecordConsumed,
}: {
  androidPresentation?: boolean;
  requestedRecordId?: string;
  requestedRecordSignal?: number;
  requestedProfileId?: string;
  onRequestedRecordConsumed?: (signal: number) => void;
} = {}) {
  /*
    On the phone the full transport panel used to occupy the entire first
    viewport before any track was visible. It is now collapsed by default and
    expanded on demand - the controls are not removed, and the mini-player
    still routes here to reach them.
  */
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [compactPlayerLayout, setCompactPlayerLayout] = useState(androidPresentation);
  const { useAlbumArtBackground, setUseAlbumArtBackground } = useTheme();

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => {
      const compact = androidPresentation || media.matches;
      setCompactPlayerLayout(compact);
      setShowFullPlayer(false);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [androidPresentation]);
  const {
    musicItems,
    updateMusicItem,
    deleteMusicItem,
    currentProfileId,
    isHydrated,
  } = useAppContext();
  const consumedRequestSignalRef = useRef<number | null>(null);

  const {
    activeItem,
    activeId,
    playbackState,
    isPlaying,
    shuffleEnabled,
    repeatMode,
    setActiveId,
    playItems,
    togglePlayback,
    setShuffleEnabled,
    cycleRepeatMode,
    playNext,
    playPrevious,
    playRandom,
    addToQueue,
    playNextItem,
    openFullPlayer,
  } = useMusicPlayer();

  const basePlaybackCapabilities =
    getMusicPlaybackCapabilities(activeItem);
  const activePlaybackCapabilities = {
    ...basePlaybackCapabilities,
    canControlPlayback:
      basePlaybackCapabilities.canControlPlayback &&
      playbackState.canPlayPause,
    canSeek:
      basePlaybackCapabilities.canSeek &&
      playbackState.canSeek,
  };

  const [showLyrics, setShowLyrics] = useState(false);

  const [
    view,
    setView,
  ] = useState<MusicView>('all');

  const [
    mode,
    setMode,
  ] = useState<LibraryMode>('list');

  const [
    sort,
    setSort,
  ] = useState<SortMode>('recent');

  const [
    search,
    setSearch,
  ] = useState('');

  const [playlist, setPlaylist] = useState(() => {
    if (typeof window === 'undefined')
      return 'all';

    return (
      localStorage.getItem(
        'life-manager-selected-playlist'
      ) || 'all'
    );
  });
  const [
    genre,
    setGenre,
  ] = useState('all');

  const [
    source,
    setSource,
  ] = useState('all');


  const [
    showFilters,
    setShowFilters,
  ] = useState(false);

  const [
    page,
    setPage,
  ] = useState(1);

  const [
    showMusicModal,
    setShowMusicModal,
  ] = useState(false);

  const [showMonthlyHistory, setShowMonthlyHistory] = useState(false);
  const [selectedMusicMonth, setSelectedMusicMonth] = useState(() => getMusicMonthKey(new Date()));

  const [newMusicType, setNewMusicType] = useState<'song' | 'playlist'>('song');

  const [
    editingItem,
    setEditingItem,
  ] = useState<MusicItem | null>(
    null
  );

  const [
    deleteId,
    setDeleteId,
  ] = useState<string | null>(
    null
  );

  const [
    deletePlaylistTarget,
    setDeletePlaylistTarget,
  ] = useState<string | null>(
    null
  );

  const [
    renamePlaylistTarget,
    setRenamePlaylistTarget,
  ] = useState<string | null>(null);

  const [
    renamePlaylistValue,
    setRenamePlaylistValue,
  ] = useState('');

  const [
    renamePlaylistError,
    setRenamePlaylistError,
  ] = useState('');
  const renamePlaylistPanelRef = useRef<HTMLElement>(null);
  const monthlyHistoryPanelRef = useRef<HTMLElement>(null);

  const songs = useMemo(
    () => musicItems.filter(item => !isPlaylist(item)),
    [musicItems],
  );

  const playlistItems = useMemo(
    () => musicItems.filter(isPlaylist),
    [musicItems],
  );

  const playlists = useMemo(() => {
    const names = new Set<string>();

    songs.forEach(item => {
      getSongPlaylists(item).forEach(name => {
        names.add(name);
      });
    });
    playlistItems.forEach(item => {
      if (item.title?.trim()) {
        names.add(item.title.trim());
      }
    });

    return [
      'all',
      ...Array.from(names).sort(),
    ];
  }, [songs, playlistItems]);

  const genres = useMemo(
    () => [
      'all',
      ...Array.from(
        new Set(
          musicItems
            .map(item => item.genre?.trim())
            .filter(Boolean) as string[]
        )
      ).sort(),
    ],
    [musicItems]
  );

  const playlistCards = useMemo(
    () => playlists
      .filter(item => item !== 'all')
      .map(name => {
        const explicit =
          playlistItems.find(
            item =>
              item.title === name ||
              item.playlist === name
          );

        const tracks =
          songs.filter(
            item =>
              getSongPlaylists(item).includes(name)
          );

        return {
          name,
          item: explicit,
          tracks,
          cover: getCover(explicit || tracks[0]),
          genre:
            explicit?.genre ||
            tracks[0]?.genre ||
            'Mixed',
        };
      }),
    [playlistItems, playlists, songs],
  );

  const filteredItems = useMemo(() => {
    const query =
      search.toLowerCase();

    let baseItems: MusicItem[] = songs;

    if (view === 'favorites') {
      baseItems = baseItems.filter(
        item => item.favorite
      );
    }

    if (playlist !== 'all') {
      baseItems = baseItems.filter(
        item =>
          getSongPlaylists(item).includes(playlist)
      );
    }

    return baseItems
      .filter(item =>
        `${item.title} ${item.artist || ''} ${getSongPlaylists(item).join(' ')} ${item.genre || ''}`
          .toLowerCase()
          .includes(query)
      )
      .filter(
        item =>
          genre === 'all' ||
          item.genre === genre
      )
      .filter(
        item =>
          source === 'all' ||
          (item.provider || detectMusicProvider(item.url)) === source
      )

      .sort((a, b) => {
        if (sort === 'title') {
          return a.title.localeCompare(b.title);
        }

        if (sort === 'artist') {
          return (a.artist || '').localeCompare(b.artist || '');
        }

        if (sort === 'playlist') {
          return (a.playlist || '').localeCompare(b.playlist || '');
        }

        if (sort === 'favorites') {
          return Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
        }

        if (sort === 'recentlyPlayed') {
          return (
            new Date(b.lastPlayedAt || 0).getTime() -
            new Date(a.lastPlayedAt || 0).getTime()
          );
        }

        if (sort === 'mostPlayed') {
          return Number(b.playCount || 0) - Number(a.playCount || 0);
        }

        return (
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime()
        );
      });
  }, [
    songs,
    view,
    search,
    playlist,
    genre,
    source,
    sort,
  ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredItems.length /
        ITEMS_PER_PAGE
      )
    );

  const paginatedItems =
    filteredItems.slice(
      (page - 1) * ITEMS_PER_PAGE,
      page * ITEMS_PER_PAGE
    );

  const cover =
    getCover(activeItem);

  useEffect(() => {
    if (!activeItem) setShowFullPlayer(false);
  }, [activeItem]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    playlist,
    genre,
    source,
    sort,
    view,
  ]);

  useEffect(() => {
    setPage(current =>
      Math.min(current, totalPages)
    );
  }, [totalPages]);

  useEffect(() => {
    localStorage.setItem(
      'life-manager-selected-playlist',
      playlist
    );
  }, [playlist]);

  useEffect(() => {
    if (playlist !== 'all' && !playlists.includes(playlist)) {
      setPlaylist('all');
    }
  }, [playlist, playlists]);


  const startAdd = () => {
    setNewMusicType('song');
    setEditingItem(null);
    setShowMusicModal(true);
  };

  const startAddPlaylist = () => {
    setNewMusicType('playlist');
    setEditingItem(null);
    setShowMusicModal(true);
  };

  const startEdit = useCallback((item: MusicItem) => {
    setEditingItem(item);
    setShowMusicModal(true);
  }, []);

  // "Edit metadata" from the full player routes here so library writes always
  // go through the normal Music editing flow rather than a second write path.
  useEffect(() => {
    const handleEditRequest = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;

      const item = musicItems.find(entry => entry.id === id);
      if (item) startEdit(item);
    };

    window.addEventListener('caizen:music-edit-request', handleEditRequest);

    return () =>
      window.removeEventListener(
        'caizen:music-edit-request',
        handleEditRequest,
      );
  }, [musicItems, startEdit]);

  const playSong = useCallback((item: MusicItem, queue: MusicItem[] = filteredItems) => {
    // Selecting a track from a list row plays it without force-opening the
    // full player modal — the row itself is the "select/open" action, not a
    // request to leave the current view.
    playItems(item.id, queue.includes(item) ? queue : [item, ...queue], { expandPlayer: false });

  }, [filteredItems, playItems]);

  useEffect(() => {
    if (
      !requestedRecordSignal ||
      !requestedRecordId ||
      !isHydrated ||
      !currentProfileId ||
      requestedProfileId !== currentProfileId ||
      consumedRequestSignalRef.current === requestedRecordSignal
    ) return;
    consumedRequestSignalRef.current = requestedRecordSignal;
    const item = musicItems.find(entry => entry.id === requestedRecordId);
    if (item) {
      if (item.type !== 'playlist') {
        setView('all');
        setPlaylist('all');
        playSong(item, songs);
      } else {
        setEditingItem(item);
        setShowMusicModal(true);
      }
    }
    onRequestedRecordConsumed?.(requestedRecordSignal);
  }, [currentProfileId, isHydrated, musicItems, onRequestedRecordConsumed, playSong, requestedProfileId, requestedRecordId, requestedRecordSignal, songs]);

  const toggleFavorite = (
    item: MusicItem
  ) => {
    updateMusicItem(item.id, {
      favorite: !item.favorite,
    });
  };

  const playPlaylist = (
    name: string
  ) => {
    setPlaylist(name);
    setView('all');

    const tracks = songs.filter(
        item =>
          getSongPlaylists(item).includes(name)
      );

    const first = tracks[0];

    if (first) {
      playItems(first.id, tracks, { expandPlayer: false });
    }
  };
  const shufflePlaylist = (
    name: string
  ) => {
    setPlaylist(name);
    setView('all');

    playRandom(
      songs.filter(
        item =>
          getSongPlaylists(item).includes(name)
      )
    );
  };
  const openRenamePlaylist = (oldName: string) => {
    setRenamePlaylistTarget(oldName);
    setRenamePlaylistValue(oldName);
    setRenamePlaylistError('');
  };

  const closeRenamePlaylist = () => {
    setRenamePlaylistTarget(null);
    setRenamePlaylistValue('');
    setRenamePlaylistError('');
  };

  useOverlayLifecycle(
    Boolean(renamePlaylistTarget),
    closeRenamePlaylist,
    { containerRef: renamePlaylistPanelRef },
  );

  useOverlayLifecycle(
    showMonthlyHistory,
    () => setShowMonthlyHistory(false),
    { containerRef: monthlyHistoryPanelRef },
  );

  const renamePlaylist = () => {
    if (!renamePlaylistTarget) return;

    const oldName = renamePlaylistTarget;
    const cleanName = renamePlaylistValue.trim().replace(/\s+/g, ' ');

    if (!cleanName) {
      setRenamePlaylistError('Playlist name is required.');
      return;
    }

    if (cleanName.length > 100) {
      setRenamePlaylistError('Playlist names must be 100 characters or fewer.');
      return;
    }

    if (cleanName === oldName) {
      closeRenamePlaylist();
      return;
    }

    const alreadyExists = playlists.some(name =>
      name !== oldName && name.toLocaleLowerCase() === cleanName.toLocaleLowerCase(),
    );

    if (alreadyExists) {
      setRenamePlaylistError('A playlist with this name already exists.');
      return;
    }

    songs.forEach(item => {
      const nextPlaylists = Array.from(
        new Set(
          getSongPlaylists(item).map(name =>
            name === oldName ? cleanName : name
          )
        )
      );

      updateMusicItem(item.id, {
        playlist: nextPlaylists[0] || 'Main',
        playlists: nextPlaylists.length
          ? nextPlaylists
          : ['Main'],
      });
    });

    playlistItems.forEach(item => {
      if (
        item.title === oldName ||
        item.playlist === oldName
      ) {
        updateMusicItem(item.id, {
          title:
            item.title === oldName
              ? cleanName
              : item.title,
          playlist:
            item.playlist === oldName
              ? cleanName
              : item.playlist,
        });
      }
    });

    if (playlist === oldName) {
      setPlaylist(cleanName);
    }

    closeRenamePlaylist();
  };

  const deletePlaylistName = (name: string) => {
    songs.forEach(item => {
      const nextPlaylists =
        getSongPlaylists(item).filter(
          playlistName => playlistName !== name
        );

      const safePlaylists =
        nextPlaylists.length > 0
          ? nextPlaylists
          : ['Main'];

      updateMusicItem(item.id, {
        playlist: safePlaylists[0],
        playlists: safePlaylists,
      });
    });

    playlistItems.forEach(item => {
      if (
        item.title === name ||
        item.playlist === name
      ) {
        deleteMusicItem(item.id);
      }
    });

    if (playlist === name) {
      setPlaylist('all');
    }

    if (
      activeItem &&
      isPlaylist(activeItem) &&
      (
        activeItem.title === name ||
        activeItem.playlist === name
      )
    ) {
      setActiveId(null);
    }
  };
  const clearAllFilters = () => {
    setSearch('');
    setPlaylist('all');
    setGenre('all');
    setSource('all');
    setSort('recent');
  };

  const libraryTitle =
    playlist !== 'all'
      ? `Songs in ${playlist}`
      : view === 'playlists'
        ? 'Playlists'
        : view === 'favorites'
          ? 'Favorites'
          : 'Library';

  const recentlyPlayedItems = filteredItems
    .filter(item => item.lastPlayedAt)
    .sort(
      (a, b) =>
        new Date(b.lastPlayedAt || 0).getTime() -
        new Date(a.lastPlayedAt || 0).getTime()
    )
    .slice(0, 5);

  const mostPlayedItems = filteredItems
    .filter(item => Number(item.playCount || 0) > 0)
    .sort(
      (a, b) =>
        Number(b.playCount || 0) -
        Number(a.playCount || 0)
    )
    .slice(0, 5);

  const musicHistoryMonths = useMemo(() => getMusicHistoryMonths(musicItems), [musicItems]);
  const currentMusicMonth = getMusicMonthKey(new Date());
  const currentMonthMostPlayed = useMemo(
    () => getMusicMonthlyPlayCounts(musicItems, currentMusicMonth).slice(0, 5),
    [currentMusicMonth, musicItems],
  );
  const selectedMonthMostPlayed = useMemo(
    () => getMusicMonthlyPlayCounts(musicItems, selectedMusicMonth).slice(0, 5),
    [musicItems, selectedMusicMonth],
  );
  const oldestMusicMonth = musicHistoryMonths[0] || currentMusicMonth;
  const canGoToPreviousMusicMonth = selectedMusicMonth > oldestMusicMonth;
  const canGoToNextMusicMonth = selectedMusicMonth < currentMusicMonth;

  useEffect(() => {
    if (selectedMusicMonth > currentMusicMonth || selectedMusicMonth < oldestMusicMonth) {
      setSelectedMusicMonth(currentMusicMonth);
    }
  }, [currentMusicMonth, oldestMusicMonth, selectedMusicMonth]);

  const activeFilterCount = [playlist, genre, source]
    .filter(value => value !== 'all')
    .length + (search.trim() ? 1 : 0);

  const listeningOverview = view === 'all' && (recentlyPlayedItems.length > 0 || mostPlayedItems.length > 0) ? (
    <section className="music-overview section-surface space-y-3 p-4 sm:p-5" aria-labelledby="music-listening-overview-title">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Listening overview</p>
        <h2 id="music-listening-overview-title" className="mt-1 text-section-title">Pick up where you left off</h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { title: 'Recently Played', items: recentlyPlayedItems, countLabel: (item: MusicItem) => item.artist || 'Unknown artist' },
          { title: 'Most Played', items: mostPlayedItems, countLabel: (item: MusicItem) => `Played ${item.playCount || 0}x` },
        ].map(group => group.items.length > 0 ? (
          <div key={group.title} className="music-overview-group rounded-2xl p-3 sm:p-4" data-playing={group.items.some(item => item.id === activeItem?.id) && isPlaying ? 'true' : undefined}>
            <h3 className="text-card-title">{group.title}</h3>
            <div className="mt-2">
              {group.items.map(item => (
                <button key={item.id} type="button" onClick={() => playSong(item)} className="music-overview-track flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-active={activeItem?.id === item.id || undefined} data-playing={activeItem?.id === item.id && isPlaying ? 'true' : undefined} aria-current={activeItem?.id === item.id ? 'true' : undefined} aria-label={`Play ${item.title}`}>
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-primary/10">
                    {getCover(item) ? <ResilientImage src={getCover(item)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<Music className="m-2.5 h-5 w-5 text-primary" aria-hidden="true" />} /> : <Music className="m-2.5 h-5 w-5 text-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <OverflowTooltip text={item.title}><p className="truncate text-sm font-semibold">{item.title}</p></OverflowTooltip>
                    <OverflowTooltip text={group.countLabel(item)}><p className="truncate text-metadata text-muted-foreground tabular-nums">{group.countLabel(item)}</p></OverflowTooltip>
                  </div>
                  {activeItem?.id === item.id && <Equalizer active={isPlaying} />}
                </button>
              ))}
            </div>
          </div>
        ) : null)}
      </div>
    </section>
  ) : null;

  return (
    <div
      className={androidPresentation ? 'android-music-section space-y-4' : 'workspace-wide caizen-media-page caizen-music-page space-y-4 lg:space-y-5'}
      data-android-screen={androidPresentation ? 'music' : undefined}
      data-playing={activeItem && isPlaying ? 'true' : undefined}
    >
      {/* Android already supplies the screen title in its app bar, so its
          primary actions stay compact and close to the library. */}
      {androidPresentation && compactPlayerLayout && (
        <section className="android-music-actions">
          <button type="button" onClick={startAdd} className="android-primary-button">
            + Add Music
          </button>
          <button type="button" onClick={startAddPlaylist} className="android-secondary-button">
            Create playlist
          </button>
          <button
            type="button"
            onClick={() => playRandom(filteredItems)}
            disabled={filteredItems.length === 0}
            className="android-secondary-button col-span-2"
          >
            Play random
          </button>
        </section>
      )}

      {!androidPresentation && (
      <header className="music-web-header border-b border-border/50 px-1 pb-4 sm:px-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-page-title text-foreground">
              Music
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Save songs and playlists from YouTube, Spotify, or direct links.
            </p>
          </div>

          <div className="music-header-actions flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => playRandom(filteredItems)}
              disabled={filteredItems.length === 0}
              className="music-header-secondary h-11"
            >
              <Shuffle className="mr-2 h-4 w-4" />
              Play random
            </Button>

            {activeItem && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFullPlayer(value => !value)}
                aria-expanded={showFullPlayer}
                aria-controls="music-expanded-player"
                className="music-header-secondary h-11"
              >
                <ListMusic className="mr-2 h-4 w-4" />
                {showFullPlayer ? 'Hide player' : 'Player'}
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={startAddPlaylist}
              className="music-header-secondary h-11"
            >
              <ListMusic className="mr-2 h-4 w-4" />
              Create playlist
            </Button>

            <Button
              type="button"
              onClick={startAdd}
              className="h-11"
            >
              <Plus className="mr-2 h-4 w-4" />
              {getSectionDiscoveryMeta('music')?.firstActionLabel}
            </Button>
          </div>
        </div>
      </header>
      )}

      <div className={androidPresentation ? 'px-1' : 'flex justify-end px-1'}>
        <div className={androidPresentation ? 'flex min-h-12 w-full items-center gap-3 py-1' : 'flex min-h-12 max-w-full items-center gap-3 rounded-xl border border-border/50 bg-card/45 px-3 py-2'}>
          <div className={androidPresentation ? 'min-w-0 flex-1' : 'min-w-0'}>
            <label htmlFor="music-video-background-toggle" className="block text-sm font-semibold">
              Video background
            </label>
            <p id="music-video-background-description" className="text-xs text-muted-foreground">
              {androidPresentation ? 'Use the playing YouTube video behind Music.' : 'Use a playing YouTube video as the page background.'}
            </p>
          </div>
          <label htmlFor="music-video-background-toggle" className={androidPresentation ? 'flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-end' : 'contents'}>
            <Switch
              id="music-video-background-toggle"
              checked={useAlbumArtBackground}
              onCheckedChange={setUseAlbumArtBackground}
              aria-describedby="music-video-background-description"
            />
          </label>
        </div>
      </div>

      {listeningOverview}

      <section className="music-monthly section-surface p-4 sm:p-5" aria-labelledby="music-monthly-most-played-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Listening history</p>
            <h2 id="music-monthly-most-played-title" className="mt-1 text-section-title">Monthly Most Played</h2>
            <p className="mt-1 text-metadata text-muted-foreground">{formatMusicMonth(currentMusicMonth)} · recorded plays only</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedMusicMonth(currentMusicMonth);
              setShowMonthlyHistory(true);
            }}
            className="music-monthly-history-link min-h-11 rounded-xl px-3 text-label text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View month history
          </button>
        </div>
        {currentMonthMostPlayed.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {currentMonthMostPlayed.map(({ item, count }) => {
              const canPlay = getMusicPlaybackCapabilities(item).canControlPlayback;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => canPlay ? playSong(item) : openMusicLink(item.url, 'music link')}
                  className="music-monthly-track flex min-w-0 items-center gap-2 rounded-xl p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-active={activeItem?.id === item.id || undefined}
                  data-playing={activeItem?.id === item.id && isPlaying ? 'true' : undefined}
                  aria-current={activeItem?.id === item.id ? 'true' : undefined}
                  aria-label={`${canPlay ? 'Play' : 'Open'} ${item.title}, ${count} plays`}
                >
                  <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary/10">
                    {getCover(item) ? <ResilientImage src={getCover(item)!} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<Music className="size-4 text-primary" aria-hidden="true" />} /> : <Music className="size-4 text-primary" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <OverflowTooltip text={item.title}><span className="block truncate text-xs font-semibold">{item.title}</span></OverflowTooltip>
                    <span className="block text-xs text-muted-foreground tabular-nums">{count} play{count === 1 ? '' : 's'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">No tracked plays this month yet.</p>
        )}
      </section>

      {/* Compact now-playing row. Tapping it expands the full transport below,
          so the library stays visible and nothing is unreachable. */}
      {androidPresentation && (
        <button
          type="button"
          className="android-nowplaying-row"
          data-active={activeItem ? 'true' : undefined}
          data-playing={activeItem && isPlaying ? 'true' : undefined}
          aria-expanded={showFullPlayer}
          aria-controls="music-expanded-player"
          aria-label={activeItem ? `${showFullPlayer ? 'Hide' : 'Open'} player for ${activeItem.title}` : 'No track selected'}
          disabled={!activeItem}
          onClick={() => {
            if (activeItem) setShowFullPlayer(value => !value);
          }}
        >
          <span className="android-nowplaying-copy">
            <OverflowTooltip text={activeItem?.title || 'No track selected'}><strong>{activeItem?.title || 'No track selected'}</strong></OverflowTooltip>
            <small>
              {activeItem
                ? activeItem.artist || getProviderLabel(activeItem.provider)
                : 'Pick a song or playlist to start.'}
            </small>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${showFullPlayer ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      )}

      {showFullPlayer && activeItem && (
      <section id="music-expanded-player" className="music-expanded-player section-surface relative overflow-hidden shadow-md" data-playing={isPlaying ? 'true' : undefined}>
        {cover && (
          <ResilientImage
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="music-expanded-player-artwork absolute inset-0 h-full w-full scale-110 object-cover opacity-10 blur-2xl"
            fallback={<span aria-hidden="true" className="absolute inset-0" />}
          />
        )}

        <div className="music-expanded-player-wash absolute inset-0 bg-gradient-to-br from-background via-background/90 to-background/70" />

        {androidPresentation ? (
          <div className="relative flex items-center justify-between gap-3 border-b border-border/45 px-4 py-2.5">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Now playing</span>
            <button
              type="button"
              onClick={() => setShowFullPlayer(false)}
              className="android-touch-target inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-black text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Hide player"
            >
              <ChevronDown className="size-4" />
              Hide player
            </button>
          </div>
        ) : null}

        <div className="music-expanded-player-content relative grid gap-5 p-4 sm:p-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
          <div className="mx-auto flex aspect-square w-full max-w-[220px] items-center justify-center overflow-hidden rounded-2xl bg-primary/10 shadow-sm">
            {cover ? (
              <ResilientImage
                src={cover}
                alt={activeItem?.title || ''}
                loading="eager"
                decoding="async"
                className="h-full w-full object-cover"
                fallback={<ListMusic className="h-16 w-16 text-primary" aria-hidden="true" />}
              />
            ) : (
              <ListMusic className="h-16 w-16 text-primary" />
            )}
          </div>

          <div className="min-w-0 text-center lg:text-left">
            <div className="flex justify-center lg:justify-start">
              <Equalizer
                active={Boolean(
                  activeItem &&
                  isPlaying
                )}
              />
            </div>

            <p className="mt-2 text-xs font-bold uppercase tracking-wider text-primary">
              {activeItem
                ? getProviderLabel(activeItem.provider)
                : 'Now Playing'}
            </p>

            <OverflowTooltip text={activeItem?.title ||
                'No track selected'}><h2 className="mt-2 truncate text-3xl font-bold">
              {activeItem?.title ||
                'No track selected'}
            </h2></OverflowTooltip>

            <p className="mt-2 text-sm text-muted-foreground">
              {activeItem
                ? isPlaylist(activeItem)
                  ? 'Playlist'
                  : `${activeItem.artist || 'Unknown artist'} - ${getSongPlaylists(activeItem).join(', ')}`
                : 'Pick a song or playlist to start.'}
            </p>

            {activeItem &&
              isSpotifyItem(activeItem) &&
              playbackState.unavailableReason ? (
              <div className="mx-auto mt-3 max-w-sm rounded-2xl border border-dashed border-border/60 bg-background/50 px-4 py-3 text-center lg:mx-0 lg:text-left">
                <p className="text-xs font-black text-foreground">
                  {getSpotifyUnavailableCopy(playbackState.unavailableReason).title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {getSpotifyUnavailableCopy(playbackState.unavailableReason).message}
                </p>
                <button
                  type="button"
                  onClick={() => openMusicLink(activeItem.url, 'Spotify link')}
                  className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border/60 px-3 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open Spotify
                </button>
              </div>
            ) : (
              activeItem && !activePlaybackCapabilities.canControlPlayback && (
                <p className="mt-2 text-xs font-semibold text-muted-foreground">
                  {playbackState.error || getSourceCapabilityText(activeItem)}
                </p>
              )
            )}

            {activeItem &&
              activePlaybackCapabilities.canControlPlayback &&
              playbackState.isBuffering && (
                <p className="mt-2 text-xs font-semibold text-muted-foreground" role="status">
                  Buffering…
                </p>
              )}

            <div className="music-player-actions mt-5 flex flex-wrap justify-center gap-2 lg:justify-start">
              {(activePlaybackCapabilities.canControlPlayback ||
                (activeItem && isSpotifyItem(activeItem))) && (
                <Button
                  type="button"
                  onClick={togglePlayback}
                  disabled={!activeItem || !activePlaybackCapabilities.canControlPlayback}
                  className="control-button-primary h-12 px-6"
                >
                  {isPlaying ? (
                    <Pause className="mr-2 h-4 w-4" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {isPlaying ? 'Pause' : 'Play'}
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={playPrevious}
                disabled={!activeItem}
                className="control-button h-12"
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={playNext}
                disabled={!activeItem}
                className="control-button h-12"
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              {activeItem && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    toggleFavorite(activeItem)
                  }
                  aria-pressed={activeItem.favorite}
                  className="control-button h-12"
                >
                  <Heart
                    className={`
                      mr-2 h-4 w-4
                      ${activeItem.favorite ? 'fill-primary text-primary' : ''}
                    `}
                  />
                  Favorite
                </Button>
              )}

              {(activeItem?.lyrics?.trim() || normalizeExternalWebUrl(activeItem?.lyricsUrl)) && (
                <Button type="button" variant="outline" onClick={() => setShowLyrics(value => !value)} aria-expanded={showLyrics} aria-controls="music-compact-lyrics" className="control-button h-12">
                  Lyrics
                </Button>
              )}

              {activeItem && (
                <NowPlayingActionsMenu
                  item={activeItem}
                  onOpen={() => openMusicLink(activeItem.url)}
                  onShowVideo={openFullPlayer}
                  onEdit={() => startEdit(activeItem)}
                />
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      {showLyrics && activeItem && (
        <section id="music-compact-lyrics" className="section-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-primary">Lyrics</p>
              <OverflowTooltip text={activeItem.title} mode="clamped"><h2 className="mt-1 line-clamp-2 text-xl font-black">{activeItem.title}</h2></OverflowTooltip>
            </div>
            <div className="flex gap-2">
              {normalizeExternalWebUrl(activeItem.lyricsUrl) && (
                <a href={normalizeExternalWebUrl(activeItem.lyricsUrl)!} target="_blank" rel="noreferrer" className="control-button inline-flex h-11 items-center border border-border/60 px-4 text-sm font-bold">
                  External lyrics
                </a>
              )}
              <Button type="button" variant="outline" onClick={() => startEdit(activeItem)} className="control-button h-11">Edit lyrics</Button>
            </div>
          </div>
          {activeItem.lyrics ? (
            <div className="mt-5 max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-background p-4 text-[15px] leading-8 sm:p-6">{activeItem.lyrics}</div>
          ) : (
            <p className="mt-5 rounded-2xl bg-background p-6 text-sm text-muted-foreground">No lyrics added</p>
          )}
        </section>
      )}

      <section className="music-library-toolbar toolbar-surface p-4 sm:p-5">
        <div className="mb-4 border-b border-border/50 pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Library</p>
          <h2 className="mt-1 text-section-title">Browse your music</h2>
          <p className="mt-1 text-xs text-muted-foreground">Search, filter, sort, or change how your saved music is displayed.</p>
        </div>
        <ResponsiveControlStrip label="Music views">
          {VIEWS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setView(tab.id);
              }}
              aria-pressed={view === tab.id}
              className={`
                music-library-tab min-h-11 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold
                ${view === tab.id
                  ? 'is-selected bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </ResponsiveControlStrip>

        <div className="responsive-search-filter-row music-search-filter-row mt-4">
          <SearchField
            wrapperClassName="min-w-0 flex-1"
            aria-label="Search music"
            value={search}
            onChange={setSearch}
            placeholder="Search titles, artists, playlists"
          />

          <Button
            type="button"
            variant="outline"
            onClick={() => setShowFilters(value => !value)}
            aria-expanded={showFilters}
            aria-controls="music-filters"
            className={`control-button h-11 shrink-0 font-semibold ${activeFilterCount > 0 ? 'music-filter-active' : ''}`}
          >
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </Button>

          <div className="hidden min-w-[170px] xl:block">
            <AndroidAdaptiveSelect
              label="Sort"
              value={sort}
              onChange={value => setSort(value as SortMode)}
              className="control-input combobox-trigger-transparent"
              options={SORT_OPTIONS}
            />
          </div>

          <div className="surface-tabs music-view-toggle grid grid-cols-2 rounded-xl p-1">
            <Tooltip><TooltipTrigger asChild><button
              type="button"
              onClick={() => setMode('list')}
              aria-label="List view"
              aria-pressed={mode === 'list'}
              className={`music-view-control min-h-11 min-w-11 rounded-lg px-3 py-2 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === 'list' ? 'bg-background text-primary' : ''}`}
            >
              <List className="mx-auto h-4 w-4" />
            </button></TooltipTrigger><TooltipContent>{"List view"}</TooltipContent></Tooltip>

            <Tooltip><TooltipTrigger asChild><button
              type="button"
              onClick={() => setMode('grid')}
              aria-label="Grid view"
              aria-pressed={mode === 'grid'}
              className={`music-view-control min-h-11 min-w-11 rounded-lg px-3 py-2 hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === 'grid' ? 'bg-background text-primary' : ''}`}
            >
              <Grid2X2 className="mx-auto h-4 w-4" />
            </button></TooltipTrigger><TooltipContent>{"Grid view"}</TooltipContent></Tooltip>
          </div>
        </div>

        <div
          id="music-filters"
          className={`music-filter-panel
    mt-4 grid gap-3 xl:grid-cols-[160px_150px_140px_auto]
    ${showFilters ? 'grid music-filter-panel-open' : 'hidden'}
  `}
        >

          <div className="xl:hidden">
            <AndroidAdaptiveSelect
              label="Sort"
              value={sort}
              onChange={value => setSort(value as SortMode)}
              className="control-input combobox-trigger-transparent"
              options={SORT_OPTIONS}
            />
          </div>

          <AndroidAdaptiveSelect
            label="Playlist"
            value={playlist}
            onChange={setPlaylist}
            className="control-input combobox-trigger-transparent"
            searchable={playlists.length > 8}
            options={playlists.map(item => ({
              value: item,
              label: item === 'all' ? 'All playlists' : item,
            }))}
          />

          <AndroidAdaptiveSelect
            label="Genre"
            value={genre}
            onChange={setGenre}
            className="control-input combobox-trigger-transparent"
            searchable={genres.length > 8}
            options={genres.map(item => ({
              value: item,
              label: item === 'all' ? 'All genres' : item,
            }))}
          />

          <AndroidAdaptiveSelect
            label="Source"
            value={source}
            onChange={setSource}
            className="control-input combobox-trigger-transparent"
            options={[
              { value: 'all', label: 'All sources' },
              { value: 'youtube', label: 'YouTube' },
              { value: 'spotify', label: 'Spotify' },
              { value: 'link', label: 'Direct link' },
            ]}
          />

        </div>

        {(playlist !== 'all' ||
          genre !== 'all' ||
          source !== 'all' ||
          search.trim()) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
              <div className="flex min-w-0 max-w-full flex-wrap gap-2">
                {search.trim() && (
                  <span className="max-w-full break-words rounded-full bg-background/70 px-3 py-1 text-xs font-bold text-primary">
                    Search: {search}
                  </span>
                )}

                {playlist !== 'all' && (
                  <span className="max-w-full break-words rounded-full bg-background/70 px-3 py-1 text-xs font-bold text-primary">
                    Playlist: {playlist}
                  </span>
                )}

                {genre !== 'all' && (
                  <span className="max-w-full break-words rounded-full bg-background/70 px-3 py-1 text-xs font-bold text-primary">
                    Genre: {genre}
                  </span>
                )}

                {source !== 'all' && (
                  <span className="max-w-full break-words rounded-full bg-background/70 px-3 py-1 text-xs font-bold text-primary">
                    Source: {source === 'link' ? 'Direct link' : getProviderLabel(source as MusicProvider)}
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={clearAllFilters}
                className="h-9 rounded-xl"
              >
                Clear Filters
              </Button>
            </div>
          )}
      </section>
      {view === 'playlists' && (
        <section className="space-y-3">
          <h2 className="text-section-title">
            Playlists
          </h2>

          {playlistCards.length === 0 ? (
            <EmptyState
              view="playlists"
              onAddMusic={startAdd}
              onCreatePlaylist={startAddPlaylist}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {playlistCards.map(card => (
                <article
                  key={card.name}
                  className="music-playlist-card rounded-2xl border border-border/60 bg-card p-3 transition-colors hover:border-border"
                >
                  <div className="flex gap-3">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-primary/10">
                      {card.cover ? (
                        <ResilientImage
                          src={card.cover}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                          fallback={<ListMusic className="m-6 h-8 w-8 text-primary" aria-hidden="true" />}
                        />
                      ) : (
                        <ListMusic className="m-6 h-8 w-8 text-primary" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <OverflowTooltip text={card.name}><h3 className="truncate text-card-title">
                        {card.name}
                      </h3></OverflowTooltip>

                      <p className="text-xs text-muted-foreground">
                        {card.tracks.length} song{card.tracks.length === 1 ? '' : 's'} - {card.genre}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => playPlaylist(card.name)}
                          disabled={card.tracks.length === 0}
                          className="music-playlist-control flex-1 rounded-2xl"
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Play
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => shufflePlaylist(card.name)}
                          disabled={card.tracks.length === 0}
                          className="music-playlist-control flex-1 rounded-2xl"
                        >
                          <Shuffle className="mr-2 h-4 w-4" />
                          Shuffle
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPlaylist(card.name);
                            setView('all');
                          }}
                          className="music-playlist-control w-full rounded-2xl"
                        >
                          View Songs
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRenamePlaylist(card.name)}
                          className="music-playlist-control rounded-2xl px-3"
                          aria-label={`Rename ${card.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeletePlaylistTarget(card.name)}
                          className="music-playlist-control rounded-2xl px-3 text-destructive hover:text-destructive"
                          aria-label={`Move ${card.name} to Trash`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {view !== 'playlists' && (
        <section className="music-library-results section-surface p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-section-title">
                {libraryTitle} · {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'}
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setShuffleEnabled(value => !value)
                }
                aria-pressed={shuffleEnabled}
                className={`
                control-button h-11 font-bold
                ${shuffleEnabled ? 'border-primary/40 bg-primary/10 text-primary' : ''}
              `}
              >
                <Shuffle className="mr-2 h-4 w-4" />
                Shuffle
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={cycleRepeatMode}
                aria-pressed={repeatMode !== 'off'}
                className={`
                control-button h-11 font-bold
                ${repeatMode !== 'off' ? 'border-primary/40 bg-primary/10 text-primary' : ''}
              `}
              >
                <Repeat className="mr-2 h-4 w-4" />
                {repeatMode === 'one'
                  ? 'Loop 1'
                  : repeatMode === 'all'
                    ? 'Loop'
                    : 'No Loop'}
              </Button>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <EmptyState
              view={view}
              onAddMusic={startAdd}
              onCreatePlaylist={startAddPlaylist}
              hasActiveFilters={Boolean(playlist !== 'all' || genre !== 'all' || source !== 'all' || search.trim())}
            />
          ) : (
            <>
              <div
                className={
                  mode === 'grid'
                    ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-3'
                    : 'music-library-list overflow-hidden rounded-2xl border border-border/60'
                }
              >
                {paginatedItems.map((item, index) => (
                  <MusicRow
                    key={item.id}
                    item={item}
                    index={(page - 1) * ITEMS_PER_PAGE + index + 1}
                    active={activeItem?.id === item.id}
                    playing={activeItem?.id === item.id && isPlaying}
                    mode={mode}
                    onPlay={() => playSong(item)}
                    onFavorite={() => toggleFavorite(item)}
                    onPlayNext={() => playNextItem(item.id)}
                    onAddToQueue={() => addToQueue(item.id)}
                    onOpen={() =>
                      item.url &&
                      openMusicLink(item.url)
                    }
                    onEdit={() => startEdit(item)}
                    onDelete={() => setDeleteId(item.id)}
                  />
                ))}
              </div>

              <div className="music-pagination-controls">
                <PaginationControls
                  page={page}
                  totalPages={totalPages}
                  totalItems={filteredItems.length}
                  pageSize={ITEMS_PER_PAGE}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </section>
      )}

      {showMonthlyHistory && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-4">
          <div className="absolute inset-0" onClick={() => setShowMonthlyHistory(false)} />
          <section
            ref={monthlyHistoryPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="music-monthly-history-title"
            className="relative z-10 w-full max-w-xl rounded-2xl border border-border/70 bg-background p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">Music history</p>
                <h2 id="music-monthly-history-title" className="mt-1 text-section-title">{formatMusicMonth(selectedMusicMonth)}</h2>
              </div>
              <button type="button" onClick={() => setShowMonthlyHistory(false)} className="grid size-11 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close monthly music history">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-y border-border/50 py-2">
              <button type="button" disabled={!canGoToPreviousMusicMonth} onClick={() => setSelectedMusicMonth(month => shiftMusicMonth(month, -1))} className="grid size-11 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous month">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <span className="text-xs font-bold text-muted-foreground">{selectedMonthMostPlayed.reduce((total, entry) => total + entry.count, 0)} tracked plays</span>
              <button type="button" disabled={!canGoToNextMusicMonth} onClick={() => setSelectedMusicMonth(month => shiftMusicMonth(month, 1))} className="grid size-11 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next month">
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>

            {selectedMonthMostPlayed.length ? (
              <div className="mt-4 space-y-2">
                {selectedMonthMostPlayed.map(({ item, count }) => {
                  const canPlay = getMusicPlaybackCapabilities(item).canControlPlayback;
                  return (
                    <div key={item.id} className="music-history-dialog-row flex items-center gap-3 rounded-xl bg-card/50 p-2">
                      <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/10">
                        {getCover(item) ? <ResilientImage src={getCover(item)!} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<Music className="size-5 text-primary" aria-hidden="true" />} /> : <Music className="size-5 text-primary" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <OverflowTooltip text={item.title}><p className="truncate text-sm font-semibold">{item.title}</p></OverflowTooltip>
                        <OverflowTooltip text={`${item.artist || 'Unknown artist'} · ${getProviderLabel(item.provider)} · ${count} play${count === 1 ? '' : 's'}`}><p className="truncate text-xs text-muted-foreground tabular-nums">{item.artist || 'Unknown artist'} · {getProviderLabel(item.provider)} · {count} play{count === 1 ? '' : 's'}</p></OverflowTooltip>
                      </div>
                      <button type="button" onClick={() => canPlay ? playSong(item) : openMusicLink(item.url, 'music link')} className="min-h-11 shrink-0 rounded-xl border border-border/60 px-3 text-xs font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${canPlay ? 'Play' : 'Open'} ${item.title}`}>
                        {canPlay ? 'Play' : 'Open'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">No tracked plays for this month.</p>
            )}
          </section>
        </div>,
        document.body,
      )}

      <ConfirmDialog
        isOpen={Boolean(deletePlaylistTarget)}
        title="Move playlist to Trash?"
        message={`This will move "${deletePlaylistTarget}" to Trash. Songs will stay in your library and can be reassigned.`}
        confirmText="Move to Trash"
        cancelText="Cancel"
        onConfirm={() => {
          if (deletePlaylistTarget) {
            deletePlaylistName(deletePlaylistTarget);
          }

          setDeletePlaylistTarget(null);
        }}
        onCancel={() => setDeletePlaylistTarget(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        title="Move music to Trash?"
        message="This will move the saved song or playlist to Trash. You can restore it until Trash expires."
        confirmText="Move to Trash"
        cancelText="Cancel"
        onConfirm={() => {
          if (deleteId) {
            deleteMusicItem(deleteId);

            if (activeId === deleteId) {
              setActiveId(null);
            }
          }

          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />

      {renamePlaylistTarget && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={closeRenamePlaylist} />
          <section
            ref={renamePlaylistPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="music-rename-playlist-title"
            className="modal-card-enter mobile-modal-panel relative z-10 max-w-md border border-border bg-background/95 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  Playlist
                </p>
                <h3 id="music-rename-playlist-title" className="mt-2 break-words text-section-title">
                  Rename playlist
                </h3>
              </div>
              <button
                type="button"
                onClick={closeRenamePlaylist}
                className="rounded-2xl border border-border/60 bg-background/70 p-3 text-muted-foreground transition-all hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              className="p-4 sm:p-5"
              onSubmit={event => {
                event.preventDefault();
                renamePlaylist();
              }}
            >
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Playlist name
                </span>
                <input
                  id="music-playlist-name"
                  value={renamePlaylistValue}
                  onChange={event => {
                    setRenamePlaylistValue(event.target.value);
                    setRenamePlaylistError('');
                  }}
                  className="control-input"
                  autoFocus
                  required
                  maxLength={100}
                  aria-invalid={Boolean(renamePlaylistError)}
                  aria-describedby={renamePlaylistError ? 'music-rename-playlist-error' : undefined}
                />
              </label>

              {renamePlaylistError && (
                <p id="music-rename-playlist-error" role="alert" className="mt-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
                  {renamePlaylistError}
                </p>
              )}

              <div className="mobile-action-row mt-5 border-t border-border/60 pt-4">
                <Button type="button" variant="outline" onClick={closeRenamePlaylist} className="rounded-2xl">
                  Cancel
                </Button>
                <Button type="submit" className="control-button-primary rounded-2xl">
                  Rename
                </Button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )}

      <MusicModal
        isOpen={showMusicModal}
        item={editingItem}
        initialType={newMusicType}
        onClose={() => {
          setShowMusicModal(false);
          setEditingItem(null);
        }}
      />
    </div>
  );
}

function MusicRow({
  item,
  index,
  active,
  playing,
  mode,
  onPlay,
  onFavorite,
  onPlayNext,
  onAddToQueue,
  onOpen,
  onEdit,
  onDelete,
}: {
  item: MusicItem;
  index: number;
  active: boolean;
  playing: boolean;
  mode: LibraryMode;
  onPlay: () => void;
  onFavorite: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cover = getCover(item);

  const main = (
    <button
      type="button"
      onClick={onPlay}
      className="music-row-main flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${playing ? 'Pause' : 'Play'} ${item.title}`}
      aria-current={active ? 'true' : undefined}
    >
      <span className={`music-row-art flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 ${mode === 'grid' ? 'size-14' : 'size-11'}`}>
        {cover ? (
          <ResilientImage
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            fallback={<Play className="h-4 w-4 text-primary" aria-hidden="true" />}
          />
        ) : (
          <Play className="h-4 w-4 text-primary" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">{index}</span>
          <OverflowTooltip text={item.title}><span className="truncate text-sm font-semibold">{item.title}</span></OverflowTooltip>
          {item.favorite && (
            <Heart className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" aria-hidden="true" />
          )}
        </span>

        {isPlaylist(item) ? (
          <span className="block truncate text-xs text-muted-foreground">Playlist</span>
        ) : (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <OverflowTooltip text={item.artist || 'Unknown artist'}><span className="truncate text-xs text-muted-foreground">
              {item.artist || 'Unknown artist'}
            </span></OverflowTooltip>
            {getSongPlaylists(item).slice(0, 3).map(name => (
              <span key={name} className="music-playlist-chip rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {name}
              </span>
            ))}
            {getSongPlaylists(item).length > 3 && (
              <span className="text-xs font-bold text-muted-foreground">
                +{getSongPlaylists(item).length - 3}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );

  const actions = (
    <>
      <span className="music-provider-chip hidden rounded-full bg-muted/70 px-2.5 py-1 text-xs font-medium text-muted-foreground sm:block">
        {getProviderLabel(item.provider)}
      </span>

      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          onPlay();
        }}
        className={`music-row-play min-h-11 min-w-11 rounded-full px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'bg-muted/70 text-foreground hover:bg-muted'}`}
        aria-label={`${playing ? 'Pause' : 'Play'} ${item.title}`}
      >
        {playing ? <Equalizer active /> : active ? 'Paused' : 'Play'}
      </button>

      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          onFavorite();
        }}
        className="music-row-favorite min-h-11 min-w-11 rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={item.favorite ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`}
        aria-pressed={item.favorite}
      >
        <Heart className={`h-4 w-4 ${item.favorite ? 'fill-primary text-primary' : ''}`} />
      </button>

      <MusicRowActionsMenu
        item={item}
        onPlay={onPlay}
        onPlayNext={onPlayNext}
        onAddToQueue={onAddToQueue}
        onFavorite={onFavorite}
        onOpen={onOpen}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </>
  );

  return (
    <article
      data-music-row="true"
      data-active={active || undefined}
      data-playing={playing || undefined}
      className={
        mode === 'grid'
          ? `music-grid-card rounded-2xl border border-border/60 bg-card p-3 transition-colors hover:border-border hover:bg-muted ${active ? 'is-active' : ''}`
          : `music-list-row grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-3 border-b border-border/50 px-3 py-2 text-left transition-colors last:border-b-0 ${active ? 'is-active' : 'hover:bg-muted/70'}`
      }
    >
      {mode === 'grid' ? (
        <div className="space-y-3">
          {main}
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      ) : (
        <>
          {main}
          {actions}
        </>
      )}
    </article>
  );
}

function MusicRowActionsMenu({
  item,
  onPlay,
  onPlayNext,
  onAddToQueue,
  onFavorite,
  onOpen,
  onEdit,
  onDelete,
}: {
  item: MusicItem;
  onPlay: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onFavorite: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  useOverlayLifecycle(open, () => setOpen(false), {
    lockScroll: false,
    autoFocus: false,
    trapFocus: false,
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="music-row-options min-h-11 min-w-11 rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`More actions for ${item.title}`}
        >
          <MoreVertical className="mx-auto h-4 w-4" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="android-music-menu w-56">
        <DropdownMenuItem onSelect={onPlay}>
          <Play className="h-4 w-4" />
          Play
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onPlayNext}>
          <SkipForward className="h-4 w-4" />
          Play next
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddToQueue}>
          <ListMusic className="h-4 w-4" />
          Add to queue
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onFavorite}>
          <Heart className="h-4 w-4" />
          {item.favorite ? 'Remove favorite' : 'Add to favorites'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className="h-4 w-4" />
          Edit metadata
        </DropdownMenuItem>
        {item.url && (
          <DropdownMenuItem onSelect={onOpen}>
            Open source
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="h-4 w-4" />
          Move to Trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NowPlayingActionsMenu({
  item,
  onOpen,
  onShowVideo,
  onEdit,
}: {
  item: MusicItem;
  onOpen: () => void;
  onShowVideo: () => void;
  onEdit: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="control-button h-12"
          aria-label={`More actions for ${item.title}`}
        >
          <MoreVertical className="mr-2 h-4 w-4" />
          More
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        data-overlay-surface="music-menu"
        className="w-52"
      >
        {item.url && (
          <DropdownMenuItem onSelect={onOpen}>
            Open source
          </DropdownMenuItem>
        )}

        {item.provider === 'youtube' && (
          <DropdownMenuItem onSelect={onShowVideo}>
            Open full player
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onSelect={onEdit}>
          Edit metadata
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyState({
  view,
  onAddMusic,
  onCreatePlaylist,
  hasActiveFilters = false,
}: {
  view: MusicView;
  onAddMusic: () => void;
  onCreatePlaylist?: () => void;
  hasActiveFilters?: boolean;
}) {
  const title =
    view === 'playlists'
      ? 'No playlists yet'
      : view === 'favorites'
        ? 'No favorites yet'
        : hasActiveFilters
          ? 'No music matches these filters'
          : 'Your music library is empty';

  const message =
    view === 'playlists'
      ? 'Create a playlist record, or add songs and assign them to a playlist.'
      : view === 'favorites'
        ? 'Mark songs as favorites so they appear here.'
        : hasActiveFilters
          ? 'Try clearing filters or add a new music link.'
          : getSectionDiscoveryMeta('music')?.purpose;

  return (
    <div className="rounded-3xl border border-dashed border-border/60 bg-background/50 p-8 text-center">
      <Music className="mx-auto h-9 w-9 text-muted-foreground" />

      <p className="mt-3 text-sm font-black">
        {title}
      </p>

      <p className="mx-auto mt-2 max-w-sm text-xs text-muted-foreground">
        {message}
      </p>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          onClick={onAddMusic}
          className="control-button-primary h-10 rounded-2xl font-bold"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Music
        </Button>

        {onCreatePlaylist && view !== 'favorites' && (
          <Button
            type="button"
            variant="outline"
            onClick={onCreatePlaylist}
            className="control-button h-10 rounded-2xl font-bold"
          >
            <ListMusic className="mr-2 h-4 w-4" />
            Create playlist
          </Button>
        )}
      </div>
    </div>
  );
}
