'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { createPortal } from 'react-dom';

import {
  Heart,
  ImageIcon,
  Loader2,
  ListMusic,
  Music,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { ResilientImage } from '@/components/media/ResilientImage';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import { useAppContext } from '@/lib/context';
import { useMusicPlayer } from '@/lib/music-player';
import {
  detectMusicProvider,
  getMusicLinkIdentity,
} from '@/lib/music-links';
import {
  fetchMusicMetadata,
  supportsMusicMetadata,
} from '@/lib/music-metadata';
import { fetchMusicLyrics } from '@/lib/music-lyrics';
import { normalizeCatalogImageSource } from '@/lib/catalog/normalization';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';

import {
  MusicItem,
  MusicProvider,
} from '@/lib/types';

type MusicKind = 'song' | 'playlist';

type MetadataLoadOptions = {
  fetchLyrics?: boolean;
};

const defaultForm = {
  type: 'song' as MusicKind,
  title: '',
  artist: '',
  playlistsText: 'Main',
  newPlaylist: '',
  provider: 'youtube' as MusicProvider,
  url: '',
  image: '',
  genre: '',
  favorite: false,
  lyrics: '',
  lyricsUrl: '',
};

const MUSIC_TITLE_MAX_LENGTH = 200;
const MUSIC_ARTIST_MAX_LENGTH = 160;
const MUSIC_GENRE_MAX_LENGTH = 80;
const MUSIC_PLAYLIST_MAX_LENGTH = 100;
const MUSIC_URL_MAX_LENGTH = 2048;
const MUSIC_LYRICS_MAX_LENGTH = 20000;

function detectProvider(
  url: string
): MusicProvider {
  return detectMusicProvider(url);
}

function getSnapshot(
  form: typeof defaultForm
) {
  return JSON.stringify({
    type: form.type,
    title: form.title,
    artist: form.artist,
    playlistsText: form.playlistsText,
    newPlaylist: form.newPlaylist,
    provider: form.provider,
    url: form.url,
    image: form.image,
    genre: form.genre,
    favorite: form.favorite,
    lyrics: form.lyrics,
    lyricsUrl: form.lyricsUrl,
  });
}

export default function MusicModal({
  isOpen,
  onClose,
  item,
  onSaved,
  initialType = 'song',
}: {
  isOpen: boolean;
  onClose: () => void;
  item?: MusicItem | null;
  onSaved?: (item: MusicItem) => void;
  initialType?: MusicKind;
}) {
  const {
    musicItems,
    addMusicItem,
    updateMusicItem,
  } = useAppContext();

  const {
    playItems,
  } = useMusicPlayer();

  const [
    form,
    setForm,
  ] = useState(defaultForm);

  const [
    initialSnapshot,
    setInitialSnapshot,
  ] = useState(
    getSnapshot(defaultForm)
  );

  const [
    showUnsaved,
    setShowUnsaved,
  ] = useState(false);

  const [
    showDuplicate,
    setShowDuplicate,
  ] = useState(false);

  const [
    pendingAction,
    setPendingAction,
  ] = useState<
    'close' | 'another' | 'play'
  >('close');

  const [metadataStatus, setMetadataStatus] = useState<
    'idle' | 'loading' | 'success' | 'partial' | 'error'
  >('idle');
  const [metadataMessage, setMetadataMessage] = useState('');
  const [error, setError] = useState('');
  const metadataAbortRef = useRef<AbortController | null>(null);
  const metadataTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInProgressRef = useRef(false);
  const lastAutofilledRef = useRef({ title: '', artist: '', image: '' });
  const initialUrlRef = useRef('');
  const formRef = useRef(defaultForm);
  const [isSaving, setIsSaving] = useState(false);
  formRef.current = form;

  useEffect(() => {
    if (!isOpen) return;

    const nextForm: typeof defaultForm =
      item
        ? {
          ...defaultForm,
          type:
            item.type === 'playlist'
              ? 'playlist'
              : 'song',
          title: item.title || '',
          artist: item.artist || '',
          playlistsText:
            item.playlists?.length
              ? item.playlists.join(', ')
              : item.playlist || 'Main',
          provider:
            item.provider ||
            detectProvider(item.url),
          url: item.url || '',
          image: item.image || '',
          genre: item.genre || '',
          favorite: Boolean(item.favorite),
          lyrics: item.lyrics || '',
          lyricsUrl: item.lyricsUrl || '',
        }
        : {
          ...defaultForm,
          type: initialType,
        };

    setForm(nextForm);
    setInitialSnapshot(
      getSnapshot(nextForm)
    );
    setShowUnsaved(false);
    setShowDuplicate(false);
    setMetadataStatus('idle');
    setMetadataMessage('');
    setError('');
    initialUrlRef.current = nextForm.url;
    lastAutofilledRef.current = { title: '', artist: '', image: '' };
  }, [initialType, isOpen, item]);

  const loadMetadata = useCallback(async (
    url: string,
    options: MetadataLoadOptions = {},
  ) => {
    const shouldFetchLyrics = options.fetchLyrics === true;

    if (metadataTimerRef.current) {
      clearTimeout(metadataTimerRef.current);
      metadataTimerRef.current = null;
    }
    metadataAbortRef.current?.abort();
    const controller = new AbortController();
    metadataAbortRef.current = controller;
    setMetadataStatus('loading');
    setMetadataMessage(
      shouldFetchLyrics
        ? 'Reading title, artist, artwork, and lyrics...'
        : 'Reading title, artist, and artwork...',
    );

    try {
      const metadata = await fetchMusicMetadata(url, controller.signal);
      const currentForm = formRef.current;
      if (
        getMusicLinkIdentity(currentForm.url) !== getMusicLinkIdentity(url)
      ) {
        return;
      }
      const lookupTitle = (metadata.title || currentForm.title).trim();
      const lookupArtist = (metadata.artist || currentForm.artist).trim();

      setForm(current => {
        const previous = lastAutofilledRef.current;
        const mayFill = (field: 'title' | 'artist' | 'image') =>
          !current[field].trim() || current[field] === previous[field];
        const next = { ...current, provider: metadata.provider as MusicProvider };
        const applied = { ...previous };

        if (metadata.title && mayFill('title')) {
          next.title = metadata.title;
          applied.title = metadata.title;
        }
        if (metadata.artist && mayFill('artist')) {
          next.artist = metadata.artist;
          applied.artist = metadata.artist;
        }
        if (metadata.image && mayFill('image')) {
          next.image = metadata.image;
          applied.image = metadata.image;
        }

        lastAutofilledRef.current = applied;
        return next;
      });

      let fetchedLyrics: string | null = null;
      let lyricsLookupFailed = false;

      if (shouldFetchLyrics && lookupTitle && lookupArtist) {
        try {
          fetchedLyrics = await fetchMusicLyrics({
            title: lookupTitle,
            artist: lookupArtist,
            signal: controller.signal,
          });
        } catch {
          if (controller.signal.aborted) return;
          lyricsLookupFailed = true;
        }
      }

      if (controller.signal.aborted) return;
      if (
        getMusicLinkIdentity(formRef.current.url) !== getMusicLinkIdentity(url)
      ) {
        return;
      }

      const existingLyrics = formRef.current.lyrics.trim();
      const shouldInsertLyrics = Boolean(fetchedLyrics && !existingLyrics);
      const preservedExistingLyrics = Boolean(fetchedLyrics && existingLyrics);

      if (shouldInsertLyrics) {
        setForm(current =>
          current.lyrics.trim()
            ? current
            : { ...current, lyrics: fetchedLyrics as string },
        );
      }

      const baseMessage =
        metadata.message || 'Music details added. You can edit them before saving.';
      let nextMessage = baseMessage;

      if (shouldFetchLyrics && lookupTitle && lookupArtist) {
        if (lyricsLookupFailed) {
          nextMessage = `${baseMessage} Lyrics lookup was unavailable; you can still enter them manually.`;
        } else if (shouldInsertLyrics) {
          nextMessage = `${baseMessage} Matching lyrics were added; you can edit them before saving.`;
        } else if (preservedExistingLyrics) {
          nextMessage = `${baseMessage} Matching lyrics were found, but your existing lyrics were kept.`;
        } else {
          nextMessage = `${baseMessage} No confident lyrics match was found.`;
        }
      }

      setMetadataStatus(metadata.partial ? 'partial' : 'success');
      setMetadataMessage(nextMessage);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMetadataStatus('error');
      setMetadataMessage(
        error instanceof Error
          ? error.message
          : 'Could not read music details from this link.',
      );
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (metadataTimerRef.current) clearTimeout(metadataTimerRef.current);
    metadataAbortRef.current?.abort();

    const currentForm = formRef.current;
    const url = normalizeExternalWebUrl(currentForm.url);
    if (!url || !supportsMusicMetadata(url)) {
      setMetadataStatus('idle');
      setMetadataMessage('');
      return;
    }

    const isUnchangedEdit = Boolean(
      item &&
      getMusicLinkIdentity(url) === getMusicLinkIdentity(initialUrlRef.current) &&
      currentForm.title.trim() &&
      currentForm.artist.trim() &&
      currentForm.image.trim()
    );
    if (isUnchangedEdit) return;

    metadataTimerRef.current = setTimeout(() => {
      void loadMetadata(url, { fetchLyrics: !item });
    }, 550);

    return () => {
      if (metadataTimerRef.current) clearTimeout(metadataTimerRef.current);
      metadataAbortRef.current?.abort();
    };
  }, [form.url, isOpen, item, loadMetadata]);

  const hasUnsaved =
    getSnapshot(form) !== initialSnapshot;

  const previewImage = normalizeCatalogImageSource(form.image);

  const parsedPlaylists =
    form.playlistsText
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

  const activePlaylist =
    parsedPlaylists[0] || 'Main';

  const availablePlaylists = Array.from(
    new Set(
      musicItems
        .flatMap(music =>
          music.playlists?.length
            ? music.playlists
            : [music.playlist || 'Main']
        )
        .filter(Boolean)
    )
  ).sort();

  const selectedPlaylists =
    parsedPlaylists.length
      ? parsedPlaylists
      : ['Main'];

  const togglePlaylist = (name: string) => {
    const exists =
      selectedPlaylists.includes(name);

    const next = exists
      ? selectedPlaylists.filter(item => item !== name)
      : [...selectedPlaylists, name];

    setForm(prev => ({
      ...prev,
      playlistsText: next.length
        ? next.join(', ')
        : 'Main',
    }));
  };

  const removePlaylist = (name: string) => {
    const next =
      selectedPlaylists.filter(item => item !== name);

    setForm(prev => ({
      ...prev,
      playlistsText: next.length
        ? next.join(', ')
        : 'Main',
    }));
  };

  const addCustomPlaylist = () => {
    const name = form.newPlaylist.trim();

    if (!name) return;

    const next = Array.from(
      new Set([...selectedPlaylists, name])
    );

    setForm(prev => ({
      ...prev,
      playlistsText: next.join(', '),
      newPlaylist: '',
    }));
  };

  const duplicate =
    musicItems.find(
      music =>
        music.id !== item?.id &&
        Boolean(getMusicLinkIdentity(form.url)) &&
        getMusicLinkIdentity(music.url) ===
        getMusicLinkIdentity(form.url)
    );

  const requestClose = () => {
    if (hasUnsaved) {
      setShowUnsaved(true);
      return;
    }

    onClose();
  };

  if (!isOpen) return null;
  const doSave = (
    action: typeof pendingAction,
    allowDuplicate = false
  ) => {
    if (saveInProgressRef.current) return;

    setError('');
    const title = form.title.trim();
    const urlInput = form.url.trim();

    if (!title) {
      setError('Add a title before saving this music item.');
      return;
    }
    if (!urlInput) {
      setError('Add a music link before saving.');
      return;
    }
    if (urlInput.length > MUSIC_URL_MAX_LENGTH) {
      setError(`Music links must be ${MUSIC_URL_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (title.length > MUSIC_TITLE_MAX_LENGTH) {
      setError(`Titles must be ${MUSIC_TITLE_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (form.artist.trim().length > MUSIC_ARTIST_MAX_LENGTH) {
      setError(`Artist or channel names must be ${MUSIC_ARTIST_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (form.genre.trim().length > MUSIC_GENRE_MAX_LENGTH) {
      setError(`Genres must be ${MUSIC_GENRE_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (form.image.trim().length > MUSIC_URL_MAX_LENGTH) {
      setError(`Artwork addresses must be ${MUSIC_URL_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (form.lyrics.trim().length > MUSIC_LYRICS_MAX_LENGTH) {
      setError(`Lyrics must be ${MUSIC_LYRICS_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (form.lyricsUrl.trim().length > MUSIC_URL_MAX_LENGTH) {
      setError(`Lyrics links must be ${MUSIC_URL_MAX_LENGTH} characters or fewer.`);
      return;
    }

    const normalizedUrl = normalizeExternalWebUrl(form.url);
    const normalizedImage = normalizeCatalogImageSource(form.image);
    const normalizedLyricsUrl = form.lyricsUrl.trim()
      ? normalizeExternalWebUrl(form.lyricsUrl) || undefined
      : undefined;
    if (!normalizedUrl) {
      setError('Use a valid HTTPS music link.');
      return;
    }
    if (form.image.trim() && !normalizedImage) {
      setError('Use a valid HTTPS artwork address or uploaded image.');
      return;
    }
    if (form.lyricsUrl.trim() && !normalizedLyricsUrl) {
      setError('Use a valid HTTPS lyrics link.');
      return;
    }

    if (duplicate && !allowDuplicate) {
      setPendingAction(action);
      setShowDuplicate(true);
      return;
    }
    const isPlaylistItem = form.type === 'playlist';
    saveInProgressRef.current = true;
    setIsSaving(true);

    try {
      const payload = {
        type: isPlaylistItem
          ? ('playlist' as const)
          : ('song' as const),

        title,

        artist: isPlaylistItem
          ? ''
          : form.artist.trim(),

        playlist: isPlaylistItem
          ? title
          : activePlaylist,

        playlists: isPlaylistItem
          ? [title]
          : parsedPlaylists.length
            ? parsedPlaylists
            : ['Main'],

        provider: detectProvider(normalizedUrl),

        url: normalizedUrl,

        image: normalizedImage,

        genre: form.genre.trim(),

        favorite: form.favorite,

        lyrics: form.lyrics.trim(),

        lyricsUrl: normalizedLyricsUrl,
      };

      let savedItem = item;

      if (item) {
        updateMusicItem(item.id, payload);
      } else {
        savedItem = addMusicItem(payload);
        if (!savedItem) {
          setError('Music could not be saved. Your profile is not ready yet; try again.');
          return;
        }
      }

      toast({
        title: item
          ? 'Music updated'
          : isPlaylistItem
            ? 'Playlist created'
            : 'Music added',
        description: `${payload.title} was saved.`,
      });

      const savedMusicItem = savedItem || (item ? { ...item, ...payload } : undefined);
      if (savedMusicItem) onSaved?.(savedMusicItem);

      if (action === 'another') {
        const nextForm: typeof defaultForm = {
          ...defaultForm,
          type: form.type,
          playlistsText: activePlaylist || 'Main',
          genre: form.genre,
        };

        setForm(nextForm);
        setInitialSnapshot(
          getSnapshot(nextForm)
        );
        return;
      }

      if (
        action === 'play' &&
        savedMusicItem?.id
      ) {
        playItems(savedMusicItem.id, [savedMusicItem]);
      }

      onClose();
    } catch {
      setError('Music could not be saved. Check your connection and try again.');
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  };

  return createPortal(
    <CaizenFormDialog
      panelClassName="music-modal-panel"
      eyebrow={
        item
          ? 'Edit Music'
          : form.type === 'playlist'
            ? 'Create Playlist'
            : 'Add Music'
      }
      title={
        item
          ? 'Update music item'
          : form.type === 'playlist'
            ? 'Create a playlist record'
            : 'Save music link'
      }
      onClose={requestClose}
      maxWidthClass="max-w-4xl"
      footer={(
        <div className="flex flex-col-reverse flex-wrap justify-end gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={requestClose} className="control-button h-11 font-bold">Cancel</Button>
          <Button type="button" variant="outline" onClick={() => doSave('another')} disabled={isSaving || !form.title.trim() || !form.url.trim()} className="control-button h-11 font-bold">Save and Add Another</Button>
          {form.type === 'song' ? (
            <Button type="button" variant="outline" onClick={() => doSave('play')} disabled={isSaving || !form.title.trim() || !form.url.trim()} className="control-button h-11 font-bold">Save and Play</Button>
          ) : null}
          <Button type="submit" form="music-edit-form" disabled={isSaving || !form.title.trim() || !form.url.trim()} className="control-button-primary h-11 font-bold">
            {isSaving ? 'Saving…' : item ? 'Save Changes' : form.type === 'playlist' ? 'Create Playlist' : 'Add Music'}
          </Button>
        </div>
      )}
    >
      <form
        id="music-edit-form"
        onSubmit={event => {
          event.preventDefault();
          doSave('close');
        }}
        aria-busy={isSaving}
        noValidate
      >
      <div className="grid gap-3 md:grid-cols-2">
        {error ? <p id="music-form-error" role="alert" className="rounded-2xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive md:col-span-2">{error}</p> : null}
        <div className="music-modal-group rounded-2xl p-3 md:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Save As
          </p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() =>
                setForm(prev => ({
                  ...prev,
                  type: 'song',
                }))
              }
              className={`
                flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                ${form.type === 'song'
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/50 bg-background/60 text-muted-foreground hover:text-foreground'
                }
              `}
              aria-pressed={form.type === 'song'}
            >
              <Music className="h-4 w-4 shrink-0" />

              <div>
                <p className="text-sm font-semibold">
                  Song Link
                </p>

                <p className="text-xs opacity-80">
                  Save a song and assign it to a playlist name.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setForm(prev => ({
                  ...prev,
                  type: 'playlist',
                }))
              }
              className={`
                flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                ${form.type === 'playlist'
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/50 bg-background/60 text-muted-foreground hover:text-foreground'
                }
              `}
              aria-pressed={form.type === 'playlist'}
            >
              <ListMusic className="h-4 w-4 shrink-0" />

              <div>
                <p className="text-sm font-semibold">
                  Playlist
                </p>

                <p className="text-xs opacity-80">
                  Create a playlist record and save its link.
                </p>
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="music-link" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {form.type === 'playlist' ? 'Playlist Link' : 'Music Link'}
          </label>

          <div className="flex gap-2">
            <input
              value={form.url}
              id="music-link"
              onChange={event => {
                const url = event.target.value;
                setError('');
                setForm(prev => ({
                  ...prev,
                  url,
                  provider: detectProvider(url),
                }));
              }}
              placeholder={form.type === 'playlist' ? 'Paste a playlist link' : 'Paste a YouTube or Spotify link'}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              required
              maxLength={MUSIC_URL_MAX_LENGTH}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'music-form-error' : undefined}
              className="control-input flex-1"
            />

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const url = normalizeExternalWebUrl(form.url);
                if (url) void loadMetadata(url, { fetchLyrics: true });
              }}
              disabled={
                metadataStatus === 'loading' ||
                !normalizeExternalWebUrl(form.url) ||
                !supportsMusicMetadata(normalizeExternalWebUrl(form.url) || '')
              }
              className="control-button h-11 shrink-0 px-3 sm:px-4"
              aria-label="Refresh music details"
            >
              {metadataStatus === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">Refresh</span>
            </Button>
          </div>

          {metadataStatus !== 'idle' && (
            <p
              aria-live="polite"
              className={`text-xs ${
                metadataStatus === 'error'
                  ? 'text-destructive'
                  : metadataStatus === 'success'
                    ? 'text-foreground dark:text-emerald-400'
                    : 'text-muted-foreground'
              }`}
            >
              {metadataMessage}
            </p>
          )}
        </div>

        <label className={`space-y-2 ${form.type === 'playlist' ? 'md:col-span-2' : ''}`}><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title</span><input
          id="music-title"
          autoComplete="off"
          data-caizen-character-pop="on"
          value={form.title}
          onChange={event => {
            setError('');
            setForm(prev => ({
              ...prev,
              title: event.target.value,
            }));
          }}
          placeholder={form.type === 'playlist' ? 'Playlist name' : 'Song title'}
          className="control-input"
          required
          maxLength={MUSIC_TITLE_MAX_LENGTH}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'music-form-error' : undefined}
        /></label>


        {form.type === 'song' && (
          <label className="space-y-2"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Artist / Channel</span><input
            id="music-artist"
            value={form.artist}
            onChange={event => {
              setError('');
              setForm(prev => ({
                ...prev,
                artist: event.target.value,
              }));
            }}
            placeholder="Artist / Channel"
            className="control-input"
            maxLength={MUSIC_ARTIST_MAX_LENGTH}
          /></label>
        )}
        
{form.type === 'song' && (
  <div className="music-modal-group space-y-2 rounded-2xl p-3 md:col-span-2">
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Playlists
      </p>

      <p className="mt-1 text-xs text-muted-foreground">
        Select one or more playlists for this song.
      </p>
    </div>

    <div className="flex flex-wrap gap-2">
      {selectedPlaylists.map(name => (
        <button
          key={name}
          type="button"
          onClick={() => removePlaylist(name)}
          className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {name} ×
        </button>
      ))}
    </div>

    {availablePlaylists.length > 0 && (
      <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
        {availablePlaylists.map(name => {
          const selected =
            selectedPlaylists.includes(name);

          return (
            <button
              key={name}
              type="button"
              onClick={() => togglePlaylist(name)}
              aria-pressed={selected}
              className={`
                rounded-full border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                ${
                  selected
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/50 bg-background/70 text-muted-foreground hover:text-foreground'
                }
              `}
            >
              {name}
            </button>
          );
        })}
      </div>
    )}

    <div className="flex gap-2">
      <input
        value={form.newPlaylist}
        aria-label="New playlist name"
        onChange={event => {
          setError('');
          setForm(prev => ({
            ...prev,
            newPlaylist: event.target.value,
          }));
        }}
        placeholder="Add new playlist name"
        className="control-input flex-1"
        maxLength={MUSIC_PLAYLIST_MAX_LENGTH}
      />

      <Button
        type="button"
        variant="outline"
        onClick={addCustomPlaylist}
        disabled={!form.newPlaylist.trim()}
        className="control-button h-11 font-bold"
      >
        Add
      </Button>
    </div>
  </div>
)}

        <label className="space-y-2"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Genre</span><input
          id="music-genre"
          value={form.genre}
          onChange={event => {
            setError('');
            setForm(prev => ({
              ...prev,
              genre: event.target.value,
            }));
          }}
          placeholder="Genre"
          className="control-input"
          maxLength={MUSIC_GENRE_MAX_LENGTH}
        /></label>

        <label className="space-y-2"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Artwork URL</span><input
          id="music-image"
          value={form.image}
        onChange={event => {
          setError('');
          setForm(prev => ({
            ...prev,
            image: event.target.value,
          }));
        }}
          placeholder={
            form.type === 'playlist'
              ? 'Cover Image URL'
              : 'Cover / Artwork URL'
          }
          className="control-input"
          maxLength={MUSIC_URL_MAX_LENGTH}
        /></label>

        <div className="music-modal-group flex flex-wrap items-center gap-3 rounded-2xl p-3 md:col-span-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="music-modal-cover flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10">
              {previewImage ? (
                <ResilientImage
                  src={previewImage}
                  alt="Cover preview"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                  fallback={<ImageIcon className="h-7 w-7 text-primary" aria-hidden="true" />}
                />
              ) : (
                <ImageIcon className="h-7 w-7 text-primary" aria-hidden="true" />
              )}
            </div>

            <div className="min-w-0 text-sm text-muted-foreground">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                Source: {form.provider === 'youtube'
                  ? 'YouTube'
                  : form.provider === 'spotify'
                    ? 'Spotify'
                    : form.url
                      ? 'Direct link'
                      : 'Other'}
              </p>
              <p className="mt-1 text-xs">
                {form.type === 'playlist'
                  ? 'This saves a playlist record with its link. Songs are assigned separately; playlist links do not auto-import songs.'
                  : 'Songs stay in the Library and can be assigned to a playlist name. Playlist links do not auto-import songs.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              setForm(prev => ({
                ...prev,
                favorite: !prev.favorite,
              }))
            }
            aria-pressed={form.favorite}
            className={`
              inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              ${form.favorite
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/50 bg-background/60 text-muted-foreground hover:text-foreground'
              }
            `}
          >
            <Heart
              className={`
                h-4 w-4
                ${form.favorite ? 'fill-primary text-primary' : ''}
              `}
            />
            {form.favorite
              ? 'Favorite'
              : 'Mark as Favorite'}
          </button>
        </div>

        {form.type === 'song' && (
        <div className="music-modal-group space-y-2 rounded-2xl p-3 md:col-span-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Lyrics</p>
            <p className="mt-1 text-xs text-muted-foreground">Refresh can look for matching lyrics after title and artist are available. You can edit the result or add an external lyrics link.</p>
          </div>
          <label htmlFor="music-lyrics" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Lyrics</label><textarea
            id="music-lyrics"
            value={form.lyrics}
            onChange={event => { setError(''); setForm(prev => ({ ...prev, lyrics: event.target.value })); }}
            placeholder="No lyrics added"
            className="control-input min-h-32 resize-y py-3 leading-7"
            maxLength={MUSIC_LYRICS_MAX_LENGTH}
          />
          <label htmlFor="music-lyrics-url" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">External lyrics link</label><input
            id="music-lyrics-url"
            value={form.lyricsUrl}
            onChange={event => { setError(''); setForm(prev => ({ ...prev, lyricsUrl: event.target.value })); }}
            placeholder="External lyrics link (optional)"
            inputMode="url"
            autoCapitalize="none"
            maxLength={MUSIC_URL_MAX_LENGTH}
            className="control-input"
          />
          {form.lyrics && (
            <Button type="button" variant="outline" onClick={() => setForm(prev => ({ ...prev, lyrics: '' }))} className="control-button">Clear lyrics</Button>
          )}
        </div>
        )}

      </div>
      </form>

      <ConfirmDialog
        isOpen={showUnsaved}
        title="Discard music changes?"
        message="You have unsaved music inputs. Close without saving?"
        confirmText="Discard"
        cancelText="Keep Editing"
        isDangerous
        onCancel={() => setShowUnsaved(false)}
        onConfirm={() => { setShowUnsaved(false); onClose(); }}
      />

      <ConfirmDialog
        isOpen={showDuplicate}
        title="Duplicate link found"
        message={`This link already exists as "${duplicate?.title}". Save anyway?`}
        confirmText="Continue"
        cancelText="Cancel"
        isDangerous={false}
        onCancel={() =>
          setShowDuplicate(false)
        }
        onConfirm={() => {
          setShowDuplicate(false);
          doSave(pendingAction, true);
        }}
      />
    </CaizenFormDialog>,
    document.body
  );
}
