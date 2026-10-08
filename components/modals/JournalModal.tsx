
'use client';

import {
  useCallback,
  useId,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import {
  Music,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';

import { useAppContext } from '@/lib/context';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import {
  decodeJournalContent,
  encodeJournalContent,
  hasMeaningfulJournalEntry,
} from '@/lib/journal-content';

import { JOURNAL_MOODS } from '@/lib/journal-moods';
import FormattedTextarea from '@/components/common/FormattedTextarea';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { PhotoSourceSheet } from '@/components/common/PhotoSourceSheet';
import { RecordImageField } from '@/components/common/RecordImageField';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { usePhotoSource } from '@/hooks/use-photo-source';
import { mediaStorage } from '@/lib/storage/media-storage';
import { collectMediaReferenceIds } from '@/lib/storage/media-references';
import { processPendingMediaCleanup, queueMediaCleanup } from '@/lib/storage/media-cleanup';
import { createEntityId } from '@/lib/utils';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { Button } from '@/components/ui/button';
import { MoodType } from '@/lib/types';
import { getMusicLinkIdentity } from '@/lib/music-links';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import MusicModal from '@/components/modals/MusicModal';

/* =========================================
   STYLES
========================================= */

const inputStyle = `
  w-full

  rounded-2xl

  border border-border/50

  bg-background/60

  px-4
  py-3

  text-sm

  shadow-sm
  backdrop-blur-xl

  transition-all
  duration-300

  focus:border-primary/20
  focus:outline-none
  focus-visible:outline-2
  focus-visible:outline-offset-2
  focus-visible:outline-ring/60
  focus-visible:ring-0
`;

/* =========================================
   FIELD
========================================= */

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">

      <label
        htmlFor={htmlFor}
        className="
          text-sm
          font-medium
          text-muted-foreground
        "
      >

        {label}

      </label>

      {children}

    </div>
  );
}

/* =========================================
   COMPONENT
========================================= */

const normalizeMood = (
  value?: string | null
): MoodType | null => {
  switch ((value || '').toLowerCase()) {
    case 'bad':
    case 'sad':
    case 'stressed':
    case 'rough':
      return 'rough';

    case 'neutral':
    case 'okay':
      return 'okay';

    case 'great':
    case 'good':
    case 'happy':
    case 'excited':
      return 'good';

    default:
      return null;
  }
};

interface JournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryId?: string | null;
  initialDate?: Date;
}

export default function JournalModal({
  isOpen,
  onClose,
  entryId,
  initialDate,
}: JournalModalProps) {
  const {
    addJournalEntry,
    currentProfileId,
    journalEntries,
    musicItems,
    updateJournalEntry,
  } = useAppContext();

  const isEditing =
    Boolean(entryId);

  const fileRef =
    useRef<HTMLInputElement>(null);

  /* =========================================
     STATE
  ========================================= */

  const [mattered, setMattered] =
    useState('');

  const [wentWell, setWentWell] =
    useState('');

  const [
    didntGoWell,
    setDidntGoWell,
  ] = useState('');

  const [tomorrow, setTomorrow] =
    useState('');

  const [musicLinks, setMusicLinks] =
    useState(['']);

  const [mood, setMood] =
    useState<MoodType | null>(null);

  const [image, setImage] =
    useState<string | undefined>(undefined);

  const [photoAssetIds, setPhotoAssetIds] = useState<string[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [draftEntryId, setDraftEntryId] = useState('');
  const [showGuidedReflection, setShowGuidedReflection] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showManualMusicLink, setShowManualMusicLink] = useState(false);
  const [showMusicAddModal, setShowMusicAddModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [initialSnapshot, setInitialSnapshot] =
    useState('');

  const [showUnsavedDialog, setShowUnsavedDialog] =
    useState(false);

  /* =========================================
     LOAD ENTRY
  ========================================= */

  useEffect(() => {
    if (!isOpen) return;

    if (!isEditing) {
      const next = {
        mattered: '',
        wentWell: '',
        didntGoWell: '',
        tomorrow: '',
        musicLinks: [''],
        mood: null as MoodType | null,
        image: undefined as string | undefined,
        photoAssetIds: [] as string[],
      };
      const nextDraftId = createEntityId('journal');
      setDraftEntryId(nextDraftId);
      setMattered(next.mattered);
      setWentWell(next.wentWell);
      setDidntGoWell(next.didntGoWell);
      setTomorrow(next.tomorrow);
      setMusicLinks(next.musicLinks);
      setMood(next.mood);
      setImage(next.image);
      setPhotoAssetIds(next.photoAssetIds);
      setShowGuidedReflection(false);
      setShowMemory(false);
      setShowMusic(false);
      setShowMusicPicker(false);
      setShowManualMusicLink(false);
      setShowMusicAddModal(false);
      setSubmitError(null);
      setMediaError(null);
      setInitialSnapshot(JSON.stringify(next));
      setShowUnsavedDialog(false);
      return;
    }

    const entry =
      journalEntries.find(
        e => e.id === entryId
      );

    if (!entry) return;

    const next = {
      ...decodeJournalContent(entry.content),
      mood: normalizeMood(entry.mood),
      image: entry.image || undefined,
      photoAssetIds: Array.isArray(entry.photoAssetIds) ? entry.photoAssetIds : [],
    };
    setDraftEntryId(entry.id);

    setMattered(next.mattered);
    setWentWell(next.wentWell);
    setDidntGoWell(next.didntGoWell);
    setTomorrow(next.tomorrow);
    setMusicLinks(next.musicLinks);
    setMood(next.mood);
    setImage(next.image);
    setPhotoAssetIds(next.photoAssetIds);
    setShowGuidedReflection(Boolean(
      next.wentWell.trim() || next.didntGoWell.trim() || next.tomorrow.trim(),
    ));
    setShowMemory(Boolean(next.image || next.photoAssetIds.length));
    setShowMusic(next.musicLinks.some(link => link.trim().length > 0));
    setShowMusicPicker(false);
    setShowManualMusicLink(next.musicLinks.some(link => link.trim().length > 0));
    setShowMusicAddModal(false);
    setSubmitError(null);
    setMediaError(null);
    setInitialSnapshot(JSON.stringify(next));
    setShowUnsavedDialog(false);

  }, [entryId, initialDate, isEditing, isOpen, journalEntries]);

  const currentEntry =
    journalEntries.find(
      e => e.id === entryId
    );

  const persistedMediaIds = useMemo(
    () => new Set(collectMediaReferenceIds(currentEntry || {})),
    [currentEntry],
  );

  const cleanupDraftMedia = useCallback(
    (
      assetIds: Iterable<string>,
      reason: 'attachment-detached' | 'draft-cancelled' = 'draft-cancelled',
    ) => {
      const draftOnlyIds = [...new Set(assetIds)].filter(id => !persistedMediaIds.has(id));
      if (!draftOnlyIds.length) return;
      queueMediaCleanup({ profileId: currentProfileId, assetIds: draftOnlyIds, reason });
      void processPendingMediaCleanup();
    },
    [currentProfileId, persistedMediaIds],
  );

  const currentSnapshot = useMemo(
    () => JSON.stringify({
      mattered,
      wentWell,
      didntGoWell,
      tomorrow,
      musicLinks,
      mood,
      image,
      photoAssetIds,
    }),
    [mattered, wentWell, didntGoWell, tomorrow, musicLinks, mood, image, photoAssetIds],
  );

  const hasUnsavedChanges =
    isOpen &&
    initialSnapshot !== '' &&
    currentSnapshot !== initialSnapshot;

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return;
    }
    close();
  };

  const cancelEdit = () => {
    cleanupDraftMedia(photoAssetIds, 'draft-cancelled');
    setShowUnsavedDialog(false);
    close();
  };

  const closeWithoutSaving = requestClose;
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const dialogTitleId = useId();
  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });
  useOverlayLifecycle(isOpen, closeWithoutSaving, { containerRef: modalPanelRef });

  /* =========================================
     MOODS
  ========================================= */

  const moods = JOURNAL_MOODS;
  const moodField = (
    <div>
      <label className="text-sm font-medium text-muted-foreground">Mood</label>
      <p className="mt-1 text-xs text-muted-foreground">How was your day?</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Mood">
        {moods.map(m => (
          <button
            key={m.label}
            type="button"
            onClick={() => {
              setMood(m.value);
              setSubmitError(null);
            }}
            aria-pressed={mood === m.value}
            className={`min-h-10 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${m.style} ${mood === m.value ? 'ring-2 ring-primary/40' : 'opacity-70'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
  /* =========================================
     MUSIC
  ========================================= */

  const appendMusicLink = (value: string) => {
    const normalized = normalizeExternalWebUrl(value);
    if (!normalized) return;

    const identity = getMusicLinkIdentity(normalized);
    if (musicLinks.some(link => getMusicLinkIdentity(link) === identity)) {
      setShowMusic(true);
      setSubmitError(null);
      return;
    }

    const blankIndex = musicLinks.findIndex(link => !link.trim());
    const updated = [...musicLinks];
    if (blankIndex >= 0) updated[blankIndex] = normalized;
    else updated.push(normalized);

    setMusicLinks(updated);
    setShowMusic(true);
    setSubmitError(null);
  };

  const handleAddMusic = () => {
    setShowMusic(true);
    setShowManualMusicLink(true);
    setSubmitError(null);
    if (!musicLinks.some(link => !link.trim())) setMusicLinks([...musicLinks, '']);
  };

  const removeMusicLink = (index: number) => {
    const updated = [...musicLinks];
    updated[index] = '';
    setMusicLinks(updated);
    setSubmitError(null);
  };

  const librarySongs = musicItems.filter(item => item.type !== 'playlist' && normalizeExternalWebUrl(item.url));
  const firstBlankMusicIndex = musicLinks.findIndex(link => !link.trim());

  const handleMusicChange = (
    index: number,
    value: string
  ) => {
    const updated = [
      ...musicLinks,
    ];

    updated[index] = value;

    setMusicLinks(updated);
    setSubmitError(null);
  };

  /* =========================================
     IMAGE
  ========================================= */

  const savePhoto = useCallback(async (blob: Blob, fileName: string) => {
    if (!draftEntryId) return;
    setMediaBusy(true);
    setMediaError(null);
    setSubmitError(null);
    try {
      cleanupDraftMedia(photoAssetIds, 'attachment-detached');
      const asset = await mediaStorage.save(blob, {
        profileId: currentProfileId,
        ownerType: 'journal',
        ownerId: draftEntryId,
        role: 'primary',
        fileName,
      });
      setPhotoAssetIds([asset.id]);
      setImage(undefined);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'The journal photo could not be saved.');
    } finally {
      setMediaBusy(false);
    }
  }, [cleanupDraftMedia, currentProfileId, draftEntryId, photoAssetIds]);

  const photoSource = usePhotoSource(async (blob, fileName) => {
    await savePhoto(blob, fileName);
  });

  const handleUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      e.target.files?.[0];

    e.target.value = '';
    if (file) await savePhoto(file, file.name);
  };

  const removePhoto = () => {
    cleanupDraftMedia(photoAssetIds, 'attachment-detached');
    setPhotoAssetIds([]);
    setImage(undefined);
    setMediaError(null);
    setSubmitError(null);
  };

  const handleLegacyImageChange = (value: string) => {
    if (photoAssetIds.length) {
      cleanupDraftMedia(photoAssetIds, 'attachment-detached');
      setPhotoAssetIds([]);
    }
    setImage(value || undefined);
    setSubmitError(null);
  };

  /* =========================================
     SUBMIT
  ========================================= */

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const draft = { mattered, wentWell, didntGoWell, tomorrow, musicLinks };
    const hasMeaningfulDraft = hasMeaningfulJournalEntry({
      content: encodeJournalContent(draft),
      mood,
      image,
      photoAssetIds,
    });

    const isUnchangedLegacyEmptyEdit = isEditing && currentSnapshot === initialSnapshot;
    if (!hasMeaningfulDraft && !isUnchangedLegacyEmptyEdit) {
      setSubmitError('Add a mood, reflection, memory, or music before saving.');
      return;
    }
    setSubmitError(null);

    const entryData = {
      date:
        isEditing && currentEntry
          ? currentEntry.date
          : initialDate
            ? new Date(initialDate.getTime())
            : new Date(),

      mood: mood || undefined,

      image,
      photoAssetIds,
      id: draftEntryId,

      content: encodeJournalContent(draft),
    };

    if (isEditing && entryId) {
      updateJournalEntry(
        entryId,
        entryData
      );
    } else {
      addJournalEntry(entryData);
      if (journalEntries.length === 0) {
        toast({
          title: 'Your first reflection is saved',
          description: 'A small record of today, kept in your Journal.',
        });
      }
    }

    close();
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal((
    <>
    <div
      data-caizen-overlay={isClosing ? 'closing' : 'open'}
      data-state={isClosing ? 'closed' : 'open'}
      className="
        fixed inset-0
        z-[1100]
      "
    >

      {/* BACKDROP */}
      <div
        className="modal-card-enter
          absolute inset-0

          bg-black/50
          backdrop-blur-md
        "
      />

      {/* WRAPPER */}
      <div
        className="
          journal-dialog-root fixed inset-0

          flex
          items-center
          justify-center

          p-2
          sm:p-4
        "
      >

        {/* MODAL */}
        <div
          ref={modalPanelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          onClick={e =>
            e.stopPropagation()
          }
          className="
            journal-dialog-panel journal-editor-panel relative

            flex
            w-full
            max-w-6xl
            max-h-[94dvh]

            flex-col
            overflow-hidden
            modal-card-enter

            rounded-[2rem]

            border border-border/50

            bg-card/95

            shadow-2xl

            backdrop-blur-2xl
          "
        >

          {/* GLOW */}
          <div
            className="
              absolute
              right-0
              top-0

              h-72
              w-72

              rounded-full

              bg-primary/5

              blur-3xl
            "
          />

          {/* HEADER */}
          <div
            className="
              journal-editor-header relative
              shrink-0

              border-b border-border/50

              p-4
              sm:p-6
            "
          >

            <div
              className="
                flex
                items-start
                justify-between
                gap-4
              "
            >

              <div>

                <div
                  className="
                    inline-flex
                    items-center
                    gap-2

                    rounded-full

                    border border-primary/10

                    bg-primary/5

                    px-3
                    py-1

                    text-xs
                    font-medium
                    text-muted-foreground
                  "
                >

                  <Music className="h-3 w-3" />

                  DIGITAL SANCTUARY

                </div>

                <h2
                  id={dialogTitleId}
                  className="
                    mt-4
                    text-2xl
                    sm:text-3xl
                    font-black
                  "
                >

                  {isEditing
                    ? 'Edit journal entry'
                    : 'New journal entry'}

                </h2>

                {(currentEntry?.date || initialDate) ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    For {(currentEntry?.date || initialDate)?.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                ) : null}

              </div>

              <button
                type="button"
                onClick={requestClose}
                aria-label="Close journal entry"
                className="
                  rounded-2xl

                  border border-border/50

                  bg-background/60

                  p-3

                  text-muted-foreground

                  transition-all

                  hover:text-foreground
                "
              >

                <X className="h-5 w-5" />

              </button>

            </div>

          </div>

          {/* FORM */}
          <form
            onSubmit={
              handleSubmit
            }
            className="
              flex
              min-h-0
              flex-1
              flex-col
            "
          >

            {/* CONTENT */}
            <div
              className="
                min-h-0
                flex-1
                overflow-x-hidden overflow-y-auto overscroll-contain

                px-4
                py-4
                sm:px-6
                sm:py-6
              "
            >

              <div
                className="
                  grid
                  grid-cols-1
                  gap-5
                  xl:gap-8

                  xl:grid-cols-[1fr_380px]
                "
              >

                {/* LEFT */}
                <div className="space-y-6">

                  {moodField}

                  <Field label="Reflection" htmlFor="journal-mattered">

                    <FormattedTextarea
                      id="journal-mattered"
                      value={mattered}
                      onChange={value => {
                        setMattered(value);
                        setSubmitError(null);
                      }}
                      placeholder="Write about today..."
                      minRows={8}
                    />

                  </Field>

                  <section className="rounded-xl border-0 bg-transparent">
                    <button
                      type="button"
                      onClick={() => setShowGuidedReflection(value => !value)}
                      aria-expanded={showGuidedReflection}
                      aria-controls="journal-guided-reflection"
                      className="flex min-h-10 w-full items-center justify-between gap-3 px-0 py-2 text-left"
                    >
                      <span>
                        <span className="block text-sm font-semibold">Guided reflection</span>
                        <span className="mt-1 block text-xs text-muted-foreground">Optional prompts for a deeper entry</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-primary">
                        {showGuidedReflection ? 'Hide' : 'Open'}
                      </span>
                    </button>

                    {showGuidedReflection ? <div id="journal-guided-reflection" className="space-y-5 border-t border-border/30 px-1 pt-4">
                  <Field label="What went well?" htmlFor="journal-went-well">

                    <FormattedTextarea
                      id="journal-went-well"
                      value={wentWell}
                      onChange={value => {
                        setWentWell(value);
                        setSubmitError(null);
                      }}
                      showToolbar={false}
                      minRows={4}
                    />

                  </Field>

                  <Field label="What didn’t go well?" htmlFor="journal-didnt-go-well">

                    <FormattedTextarea
                      id="journal-didnt-go-well"
                      aria-label="What didn't go well?"
                      value={didntGoWell}
                      onChange={value => {
                        setDidntGoWell(value);
                        setSubmitError(null);
                      }}
                      showToolbar={false}
                      minRows={4}
                    />

                  </Field>

                  <Field label="What will I do better tomorrow?" htmlFor="journal-tomorrow">

                    <FormattedTextarea
                      id="journal-tomorrow"
                      value={tomorrow}
                      onChange={value => {
                        setTomorrow(value);
                        setSubmitError(null);
                      }}
                      showToolbar={false}
                      minRows={4}
                    />

                  </Field>

                    </div> : null}
                  </section>

                </div>

                {/* RIGHT */}
                <div className="space-y-6">

                  {/* MEMORY */}
                  <section className="rounded-xl border-0 bg-transparent">
                    <button
                      type="button"
                      onClick={() => setShowMemory(value => !value)}
                      aria-expanded={showMemory}
                      aria-controls="journal-memory-fields"
                      className="flex min-h-10 w-full items-center justify-between gap-3 px-0 py-2 text-left"
                    >
                      <span>
                        <span className="block text-sm font-semibold">Memory</span>
                        <span className="mt-1 block text-xs text-muted-foreground">Optional photo or image reference</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-primary">
                        {showMemory ? 'Hide' : photoAssetIds.length || image ? 'Added' : 'Add'}
                      </span>
                    </button>

                    {showMemory ? <div id="journal-memory-fields" className="border-t border-border/30 px-1 pt-4">
                      <RecordImageField
                        preview={photoAssetIds[0] ? (
                          <MediaAssetImage
                            profileId={currentProfileId}
                            assetId={photoAssetIds[0]}
                            alt="Journal photo preview"
                            variant="full"
                            className="h-full w-full object-cover"
                          />
                        ) : image ? (
                          <img src={image} alt="Journal image preview" className="h-full w-full object-cover" />
                        ) : null}
                        hasPreview={Boolean(photoAssetIds.length || image)}
                        alt="journal photo"
                        chooseLabel="Upload memory"
                        removeLabel="Remove journal photo"
                        onChoose={() => photoSource.supportsNativeCapture ? photoSource.open() : fileRef.current?.click()}
                        onRemove={removePhoto}
                        disabled={mediaBusy || photoSource.busy}
                        controls={(
                          <>
                            <input ref={fileRef} type="file" hidden accept="image/*" onChange={handleUpload} />
                            <input
                              value={image || ''}
                              onChange={e => handleLegacyImageChange(e.target.value)}
                              placeholder="Or paste a legacy/external image URL"
                              aria-label="Legacy or external image URL"
                              className={inputStyle + ' mt-3'}
                            />
                            {mediaError ? <p role="alert" className="mt-3 text-sm text-destructive">{mediaError}</p> : null}
                          </>
                        )}
                      />
                    </div> : null}
                  </section>

                  {/* MUSIC */}
                  <section className="rounded-xl border-0 bg-transparent">
                    <button
                      type="button"
                      onClick={() => setShowMusic(value => !value)}
                      aria-expanded={showMusic}
                      aria-controls="journal-music-fields"
                      className="flex min-h-10 w-full items-center justify-between gap-3 px-0 py-2 text-left"
                    >
                      <span>
                        <span className="block text-sm font-semibold">Music today</span>
                        <span className="mt-1 block text-xs text-muted-foreground">Optional Spotify or YouTube links</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-primary">
                        {showMusic ? 'Hide' : musicLinks.some(link => link.trim()) ? 'Added' : 'Add'}
                      </span>
                    </button>

                    {showMusic ? <div id="journal-music-fields" className="border-t border-border/30 px-1 pt-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setShowMusicPicker(value => !value)}
                          aria-expanded={showMusicPicker}
                          className="rounded-xl border border-border/50 px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                        >
                          Choose from library
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowMusicAddModal(true)}
                          className="rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                        >
                          Add new music
                        </button>
                        <button
                          type="button"
                          onClick={handleAddMusic}
                          className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          Add link manually
                        </button>
                      </div>

                      {showMusicPicker ? (
                        <div className="mt-3 rounded-2xl border border-border/50 bg-background/40 p-3">
                          <label htmlFor="journal-music-library" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Music library
                          </label>
                          {librarySongs.length > 0 ? (
                            <select
                              id="journal-music-library"
                              value=""
                              onChange={event => {
                                const selected = librarySongs.find(item => item.id === event.target.value);
                                if (selected) appendMusicLink(selected.url);
                              }}
                              className={`${inputStyle} mt-2`}
                            >
                              <option value="">Choose a song</option>
                              {librarySongs.map(item => (
                                <option key={item.id} value={item.id}>
                                  {item.title}{item.artist ? ` — ${item.artist}` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <p className="mt-2 text-sm text-muted-foreground">No songs in Music yet. Add one to your library first.</p>
                          )}
                        </div>
                      ) : null}

                      {musicLinks.some(link => link.trim()) || showManualMusicLink ? (
                        <div className="mt-3 space-y-2">
                          {musicLinks.map((link, index) => {
                            const isVisible = Boolean(link.trim()) || (showManualMusicLink && index === firstBlankMusicIndex);
                            if (!isVisible) return null;
                            const linkedItem = musicItems.find(item => getMusicLinkIdentity(item.url) === getMusicLinkIdentity(link));
                            return (
                              <div key={index} className="flex items-center gap-2 rounded-2xl border border-border/50 bg-background/30 p-2">
                                {linkedItem?.image ? (
                                  <img src={linkedItem.image} alt="" aria-hidden="true" className="h-10 w-10 rounded-xl object-cover" />
                                ) : (
                                  <Music className="ml-2 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                                )}
                                <div className="min-w-0 flex-1">
                                  {linkedItem ? <p className="truncate text-xs font-semibold">{linkedItem.title}{linkedItem.artist ? ` · ${linkedItem.artist}` : ''}</p> : null}
                                  <input
                                    value={link}
                                    onChange={event => handleMusicChange(index, event.target.value)}
                                    aria-label={`Music link ${index + 1}`}
                                    placeholder="Spotify / YouTube link"
                                    className={`${inputStyle} mt-1`}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeMusicLink(index)}
                                  aria-label={`Remove music link ${index + 1}`}
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">Choose a song, add new music, or attach a link from today.</p>
                      )}
                    </div> : null}
                  </section>

                </div>

              </div>

            </div>

            {/* FOOTER */}
            <div
              className="
                journal-editor-footer shrink-0

                border-t border-border/50

                bg-background/80

                px-6
                py-5

                backdrop-blur-2xl
              "
            >

              {submitError ? (
                <p role="alert" className="mb-4 text-sm font-medium text-destructive">
                  {submitError}
                </p>
              ) : null}

              <div
                className="
                  flex
                  flex-col-reverse
                  gap-3

                  sm:flex-row
                  sm:justify-end
                "
              >

                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelEdit}
                  className="
                    h-12
                    rounded-2xl
                    px-6
                  "
                >

                  Cancel

                </Button>

                <Button
                  type="submit"
                  className="
                    h-12
                    rounded-2xl
                    px-6
                    font-semibold
                  "
                >

                  <Sparkles className="mr-2 h-4 w-4" />

                  {isEditing
                    ? 'Save entry'
                    : 'Save entry'}

                </Button>

              </div>

            </div>

          </form>

        </div>

      </div>

    </div>

    <ConfirmDialog
      isOpen={showUnsavedDialog}
      title="Discard Changes?"
      message="You have unsaved journal input. Are you sure you want to close this modal?"
      confirmText="Discard"
      cancelText="Keep Editing"
      isDangerous
      onConfirm={() => {
        cleanupDraftMedia(photoAssetIds, 'draft-cancelled');
        setShowUnsavedDialog(false);
        close();
      }}
      onCancel={() => setShowUnsavedDialog(false)}
    />
    <PhotoSourceSheet
      open={photoSource.sheetOpen}
      title="Journal photo"
      canRemove={Boolean(photoAssetIds.length || image)}
      onCamera={photoSource.chooseCamera}
      onGallery={photoSource.chooseGallery}
      onRemove={() => {
        removePhoto();
        photoSource.close();
      }}
      onClose={photoSource.close}
    />
    <MusicModal
      isOpen={showMusicAddModal}
      onClose={() => setShowMusicAddModal(false)}
      onSaved={(item) => {
        appendMusicLink(item.url);
        setShowMusicAddModal(false);
        setShowMusic(true);
      }}
    />
    </>
  ), document.body);
}

