'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  BookOpen,
  Clapperboard,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Link2,
  Star,
  Trash2,
  Tv,
  Upload,
  X,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import type { MediaItem, MediaStatus, MediaType, MediaUnitLabel } from '@/lib/types';
import type { CatalogSearchResult } from '@/lib/entertainment/types';
import { catalogDetailsToMediaPayload, getCatalogDetails, isCatalogDuplicate, searchCatalog } from '@/lib/entertainment/catalog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/common/FormPatterns';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import CatalogAssist from '@/components/entertainment/CatalogAssist';
import { ResilientImage } from '@/components/media/ResilientImage';
import { normalizeCatalogImageSource } from '@/lib/catalog/normalization';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import { createEntityId } from '@/lib/utils';
import { dataUrlToBlob, isInlineDataUrl } from '@/lib/storage/legacy-media';
import { mediaStorage } from '@/lib/storage/media-storage';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';

interface EntertainmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaId?: string | null;
  initialDraft?: Partial<MediaItem> | null;
}

const MEDIA_TYPES: Array<{ value: MediaType; label: string; icon: typeof Tv }> = [
  { value: 'anime', label: 'Anime', icon: Tv },
  { value: 'manga', label: 'Manga', icon: BookOpen },
  { value: 'movie', label: 'Movie', icon: Clapperboard },
  { value: 'series', label: 'Series', icon: Film },
];

const INPUT = 'h-11 w-full';

const UNIT_OPTIONS = [
  { value: 'episodes', label: 'Episodes' },
  { value: 'chapters', label: 'Chapters' },
  { value: 'volumes', label: 'Volumes' },
];

const RELEASE_SEASON_OPTIONS = [
  { value: 'Unknown', label: 'Unknown' },
  { value: 'Winter', label: 'Winter' },
  { value: 'Spring', label: 'Spring' },
  { value: 'Summer', label: 'Summer' },
  { value: 'Fall', label: 'Fall' },
];

function defaultStatus(type: MediaType): MediaStatus {
  return type === 'manga' ? 'reading' : 'watching';
}

function defaultUnit(type: MediaType): MediaUnitLabel {
  return type === 'manga' ? 'chapters' : 'episodes';
}

function statusOptions(type: MediaType) {
  return type === 'manga'
    ? [
        ['reading', 'Reading'],
        ['planned', 'Planned'],
        ['paused', 'Paused'],
        ['completed', 'Completed'],
        ['dropped', 'Dropped'],
      ] as const
    : [
        ['watching', 'Watching'],
        ['planned', 'Planned'],
        ['paused', 'Paused'],
        ['completed', 'Completed'],
        ['dropped', 'Dropped'],
      ] as const;
}

function isValidWebUrl(value: string) {
  return !value.trim() || Boolean(normalizeExternalWebUrl(value));
}

function snapshot(values: Record<string, unknown>) {
  return JSON.stringify(values);
}

export default function EntertainmentModal({
  isOpen,
  onClose,
  mediaId,
  initialDraft,
}: EntertainmentModalProps) {
  const {
    mediaItems,
    currentProfileId,
    addMediaItem,
    updateMediaItem,
    deleteMediaItem,
  } = useAppContext();

  const media = mediaId ? mediaItems.find(item => item.id === mediaId) : undefined;
  const isEditMode = Boolean(media);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const catalogRequestRef = useRef<AbortController | null>(null);
  const catalogRequestGenerationRef = useRef(0);

  const [mounted, setMounted] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [type, setType] = useState<MediaType>('anime');
  const [status, setStatus] = useState<MediaStatus>('watching');
  const [unitLabel, setUnitLabel] = useState<MediaUnitLabel>('episodes');
  const [totalUnits, setTotalUnits] = useState('');
  const [progress, setProgress] = useState('0');
  const [currentSeason, setCurrentSeason] = useState('1');
  const [currentEpisode, setCurrentEpisode] = useState('0');
  const [year, setYear] = useState('');
  const [releaseSeason, setReleaseSeason] = useState<MediaItem['season']>('Unknown');
  const [genres, setGenres] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [imageAssetId, setImageAssetId] = useState<string | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogSearchResult[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogLoadingLabel, setCatalogLoadingLabel] = useState('Searching the catalog...');
  const [catalogError, setCatalogError] = useState('');
  const [catalogHasSearched, setCatalogHasSearched] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState<Partial<MediaItem> | null>(null);
  const [selectedCatalogIdentity, setSelectedCatalogIdentity] = useState<Pick<CatalogSearchResult, 'provider' | 'externalId' | 'mediaType'> | null>(null);

  useEffect(() => setMounted(true), []);

  const values = useMemo(() => ({
    title,
    type,
    status,
    unitLabel,
    totalUnits,
    progress,
    currentSeason,
    currentEpisode,
    year,
    releaseSeason,
    genres,
    website,
    notes,
    rating,
    favorite,
    image,
    imageAssetId,
  }), [
    title,
    type,
    status,
    unitLabel,
    totalUnits,
    progress,
    currentSeason,
    currentEpisode,
    year,
    releaseSeason,
    genres,
    website,
    notes,
    rating,
    favorite,
    image,
    imageAssetId,
  ]);

  const hasUnsavedChanges = isOpen && initialSnapshot !== '' && snapshot(values) !== initialSnapshot;

  useEffect(() => {
    if (!isOpen) return;

    const initialItem = media || initialDraft;
    const nextType = initialItem?.type || 'anime';
    catalogRequestRef.current?.abort();
    const nextValues = {
      title: initialItem?.title || '',
      type: nextType,
      status: initialItem?.status || defaultStatus(nextType),
      unitLabel: initialItem?.unitLabel || defaultUnit(nextType),
      totalUnits: initialItem?.totalUnits == null ? '' : String(initialItem.totalUnits),
      progress: String(initialItem?.progress || 0),
      currentSeason: String(initialItem?.currentSeason || 1),
      currentEpisode: String(initialItem?.currentEpisode ?? initialItem?.progress ?? 0),
      year: initialItem?.year || '',
      releaseSeason: initialItem?.season || 'Unknown',
      genres: (initialItem?.genres?.length ? initialItem.genres : initialItem?.genre ? [initialItem.genre] : []).join(', '),
      website: initialItem?.website || '',
      notes: initialItem?.notes || '',
      rating: initialItem?.rating == null ? '' : String(initialItem.rating),
      favorite: Boolean(initialItem?.favorite),
      image: initialItem?.image || null,
      imageAssetId: initialItem?.imageAssetId,
    };

    setTitle(nextValues.title);
    setType(nextValues.type);
    setStatus(nextValues.status);
    setUnitLabel(nextValues.unitLabel);
    setTotalUnits(nextValues.totalUnits);
    setProgress(nextValues.progress);
    setCurrentSeason(nextValues.currentSeason);
    setCurrentEpisode(nextValues.currentEpisode);
    setYear(nextValues.year);
    setReleaseSeason(nextValues.releaseSeason);
    setGenres(nextValues.genres);
    setWebsite(nextValues.website);
    setNotes(nextValues.notes);
    setRating(nextValues.rating);
    setFavorite(nextValues.favorite);
    setImage(nextValues.image);
    setImageAssetId(nextValues.imageAssetId);
    setImageUrl(initialItem?.image?.startsWith('http') ? initialItem.image : '');
    setCatalogQuery(initialItem?.title || '');
    setCatalogResults([]);
    setCatalogLoading(false);
    setCatalogLoadingLabel('Searching the catalog...');
    setCatalogError('');
    setCatalogHasSearched(false);
    setCatalogDraft(null);
    setSelectedCatalogIdentity(
      initialItem?.catalogProvider && initialItem.catalogProvider !== 'manual' && initialItem.catalogId
        ? { provider: initialItem.catalogProvider, externalId: initialItem.catalogId, mediaType: nextType }
        : null,
    );
    setError('');
    setShowUnsavedConfirm(false);
    setShowDeleteConfirm(false);
    setSelectedImage(null);
    setInitialSnapshot(snapshot(nextValues));
  }, [initialDraft, isOpen, media]);

  useEffect(() => () => {
    catalogRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (isOpen) return;
    catalogRequestGenerationRef.current += 1;
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
  }, [isOpen]);

  const requestClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedConfirm(true);
      return;
    }
    close();
  };

  const { close, isClosing } = useAnimatedOverlayClose({ isOpen, onClose });
  const { close: closeImagePreview, isClosing: imagePreviewIsClosing } = useAnimatedOverlayClose({
    isOpen: Boolean(selectedImage),
    onClose: () => setSelectedImage(null),
  });

  const requestOverlayClose = () => {
    if (selectedImage) {
      closeImagePreview();
      return;
    }
    requestClose();
  };

  const modalPanelRef = useRef<HTMLElement | null>(null);

  useOverlayLifecycle(isOpen, requestOverlayClose, { lockScroll: false, autoFocus: false, containerRef: modalPanelRef });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selectedImage) {
        closeImagePreview();
        return;
      }
      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
        return;
      }
      if (showUnsavedConfirm) {
        setShowUnsavedConfirm(false);
        return;
      }
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, selectedImage, showDeleteConfirm, showUnsavedConfirm, hasUnsavedChanges, closeImagePreview]);

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose a valid image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Use an image smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result || ''));
      setImageUrl('');
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const applyImageUrl = () => {
    if (!isValidWebUrl(imageUrl)) {
      setError('Use a valid HTTPS image address.');
      return;
    }
    setImage(normalizeCatalogImageSource(imageUrl) || null);
    setError('');
  };

  const cancelCatalogRequest = () => {
    catalogRequestGenerationRef.current += 1;
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
  };

  const updateCatalogQuery = (value: string) => {
    cancelCatalogRequest();
    setCatalogQuery(value);
    setCatalogResults([]);
    setCatalogLoading(false);
    setCatalogError('');
    setCatalogHasSearched(false);
  };

  const runCatalogSearch = async () => {
    const normalizedQuery = catalogQuery.trim();
    if (normalizedQuery.length < 2) return;

    cancelCatalogRequest();
    const requestGeneration = catalogRequestGenerationRef.current;
    const controller = new AbortController();
    catalogRequestRef.current = controller;
    setCatalogLoading(true);
    setCatalogLoadingLabel('Searching the catalog...');
    setCatalogError('');
    setCatalogResults([]);
    setCatalogHasSearched(false);

    try {
      const page = await searchCatalog(normalizedQuery, type, 1, controller.signal);
      if (controller.signal.aborted || requestGeneration !== catalogRequestGenerationRef.current) return;
      setCatalogResults(page.results);
      setCatalogHasSearched(true);
    } catch (caught) {
      if (controller.signal.aborted || requestGeneration !== catalogRequestGenerationRef.current) return;
      setCatalogError(caught instanceof Error ? caught.message : 'Catalog search is temporarily unavailable. You can continue manually.');
      setCatalogHasSearched(true);
    } finally {
      if (requestGeneration === catalogRequestGenerationRef.current && catalogRequestRef.current === controller) {
        catalogRequestRef.current = null;
        setCatalogLoading(false);
      }
    }
  };

  const selectCatalogResult = async (result: CatalogSearchResult) => {
    if (isCatalogDuplicate(mediaItems, result)) {
      setCatalogError('This catalog title is already in your library. Choose another result or continue manually.');
      return;
    }

    cancelCatalogRequest();
    const requestGeneration = catalogRequestGenerationRef.current;
    const controller = new AbortController();
    catalogRequestRef.current = controller;
    setCatalogLoading(true);
    setCatalogLoadingLabel('Loading catalog details...');
    setCatalogError('');

    try {
      const details = await getCatalogDetails(result, controller.signal);
      if (controller.signal.aborted || requestGeneration !== catalogRequestGenerationRef.current) return;
      const draft = catalogDetailsToMediaPayload(details, {
        status,
        progress: Number(progress || 0),
        currentSeason: Number(currentSeason || 1),
        currentEpisode: Number(currentEpisode || 0),
        website,
        favorite,
        notes,
      });

      setCatalogDraft(draft);
      setSelectedCatalogIdentity(result);
      setTitle(draft.title);
      setType(draft.type);
      setUnitLabel(draft.unitLabel || defaultUnit(draft.type));
      setTotalUnits(draft.totalUnits == null ? '' : String(draft.totalUnits));
      setYear(draft.year || '');
      setReleaseSeason(draft.season || 'Unknown');
      setGenres((draft.genres || []).join(', '));
      setImage(draft.image || null);
      setImageAssetId(undefined);
      setImageUrl(draft.image || '');
      setCatalogQuery(draft.title);
      setCatalogResults([]);
      setCatalogHasSearched(false);
      setError('');
      titleInputRef.current?.focus();
    } catch (caught) {
      if (controller.signal.aborted || requestGeneration !== catalogRequestGenerationRef.current) return;
      setCatalogError(caught instanceof Error ? caught.message : 'Catalog details are temporarily unavailable. You can continue manually.');
    } finally {
      if (requestGeneration === catalogRequestGenerationRef.current && catalogRequestRef.current === controller) {
        catalogRequestRef.current = null;
        setCatalogLoading(false);
      }
    }
  };

  const handleTypeChange = (nextType: MediaType) => {
    if (nextType === type) return;
    cancelCatalogRequest();
    setCatalogResults([]);
    setCatalogLoading(false);
    setCatalogError('');
    setCatalogHasSearched(false);
    setType(nextType);
    setStatus(defaultStatus(nextType));
    setUnitLabel(defaultUnit(nextType));
  };

  const renderMediaTypePicker = (compact = false) => (
    <div role="group" aria-label="Media type" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {MEDIA_TYPES.map(option => {
        const Icon = option.icon;
        const active = type === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleTypeChange(option.value)}
            aria-pressed={active}
            className={`flex ${compact ? 'min-h-11 gap-1.5 rounded-xl px-2 py-2' : 'min-h-20 flex-col gap-2 rounded-2xl'} items-center justify-center border text-xs font-black transition ${
              active ? 'border-primary/35 bg-primary/10 text-primary' : 'border-border/60 bg-background/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className={compact ? 'size-4 shrink-0' : 'h-5 w-5'} />
            {option.label}
          </button>
        );
      })}
    </div>
  );

  const save = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Title is required.');
      return;
    }
    if (!isEditMode && selectedCatalogIdentity && isCatalogDuplicate(mediaItems, selectedCatalogIdentity)) {
      setError('This catalog title is already in your library. Choose another result or continue manually.');
      return;
    }
    const normalizedWebsite = website.trim() ? normalizeExternalWebUrl(website) || undefined : undefined;
    if (website.trim() && !normalizedWebsite) {
      setError('Use a valid watch or reading link.');
      return;
    }

    const total = totalUnits.trim() ? Number(totalUnits) : undefined;
    const progressValue = type === 'series' ? currentEpisode : progress;
    const currentProgress = Math.max(0, Number(progressValue || 0));
    const rawRating = rating.trim() ? Number(rating) : undefined;
    const parsedRating = rawRating === undefined
      ? undefined
      : Number.isFinite(rawRating)
        ? Math.max(0, Math.min(10, rawRating))
        : undefined;
    if (rating.trim() && parsedRating === undefined) {
      setError('Rating must be a finite number from 0 to 10.');
      return;
    }
    if (total != null && (!Number.isFinite(total) || total < 0)) {
      setError(`Total ${unitLabel} must be a non-negative number.`);
      return;
    }
    if (!Number.isFinite(currentProgress)) {
      setError('Progress must be a non-negative number.');
      return;
    }
    if (total != null && currentProgress > total) {
      setError(`Progress cannot be greater than total ${unitLabel}.`);
      return;
    }

    const genreList = genres
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);

    const mediaRecordId = media?.id || createEntityId('media');
    let nextImage = normalizeCatalogImageSource(image) || undefined;
    let nextImageAssetId = imageAssetId;
    if (isInlineDataUrl(nextImage)) {
      const blob = dataUrlToBlob(nextImage);
      if (!blob) {
        setError('The selected poster could not be read.');
        return;
      }
      try {
        const asset = await mediaStorage.save(blob, {
          profileId: currentProfileId,
          ownerType: 'other',
          ownerId: mediaRecordId,
          role: 'primary',
          fileName: 'entertainment-poster.jpg',
        });
        nextImageAssetId = asset.id;
        nextImage = undefined;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'The poster could not be saved.');
        return;
      }
    } else if (nextImage) {
      // An external URL replaces a managed poster. Keep an existing managed
      // ID when the editor has no new URL and the user did not remove it.
      nextImageAssetId = undefined;
    } else if (!imageAssetId) {
      nextImageAssetId = undefined;
    }

    const payload: Partial<MediaItem> & Pick<MediaItem, 'title' | 'type' | 'status'> = {
      ...initialDraft,
      ...catalogDraft,
      id: mediaRecordId,
      title: cleanTitle,
      type,
      status,
      totalUnits: total,
      episodes: unitLabel === 'episodes' ? total : undefined,
      unitLabel,
      progress: type === 'series' ? Math.max(0, Number(currentEpisode || 0)) : currentProgress,
      currentSeason: type === 'series' ? Math.max(1, Number(currentSeason || 1)) : undefined,
      currentEpisode: type === 'series' ? Math.max(0, Number(currentEpisode || 0)) : undefined,
      year: year.trim() || undefined,
      season: releaseSeason,
      genres: genreList,
      genre: genreList[0],
      website: normalizedWebsite,
      notes: notes.trim() || undefined,
      rating: parsedRating,
      favorite,
      image: nextImage,
      imageAssetId: nextImageAssetId,
      catalogProvider: media?.catalogProvider || catalogDraft?.catalogProvider || initialDraft?.catalogProvider || 'manual',
    };

    if (isEditMode && media) {
      updateMediaItem(media.id, payload);
    } else {
      addMediaItem(payload as Omit<MediaItem, 'id' | 'createdAt'>);
    }
    close();
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center sm:p-4" data-caizen-overlay={isClosing ? 'closing' : 'open'} data-state={isClosing ? 'closed' : 'open'}>
        <div aria-hidden="true" className="absolute inset-0 bg-black/75 backdrop-blur-md" />

        <section ref={modalPanelRef} tabIndex={-1} data-caizen-overlay-panel="true" className="relative z-10 flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[2rem] border border-border/60 bg-card shadow-2xl sm:rounded-[2rem]">
          <header className="flex items-start justify-between gap-4 border-b border-border/60 px-4 py-4 sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                {(media?.catalogProvider || initialDraft?.catalogProvider) && (media?.catalogProvider || initialDraft?.catalogProvider) !== 'manual' ? `${media?.catalogProvider || initialDraft?.catalogProvider} catalog item` : 'Manual library item'}
              </p>
              <h2 className="mt-1 text-2xl font-black">{isEditMode ? 'Edit Entertainment' : initialDraft?.catalogProvider && initialDraft.catalogProvider !== 'manual' ? 'Review & Add' : 'Add Manually'}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Personal status, progress, links, rating, and notes stay under your control.
              </p>
            </div>
            <div className="flex gap-2">
              {isEditMode ? (
                <button type="button" onClick={() => setShowDeleteConfirm(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/25 text-red-400 hover:bg-red-500/10" aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
              <button type="button" onClick={requestClose} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 text-muted-foreground hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {error ? <div className="mb-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300">{error}</div> : null}

            {!isEditMode ? (
              <CatalogAssist
                id="media-catalog-assist"
                providerLabel="media catalog"
                query={catalogQuery}
                onQueryChange={updateCatalogQuery}
                onSearch={() => void runCatalogSearch()}
                loading={catalogLoading}
                loadingLabel={catalogLoadingLabel}
                error={catalogError}
                noResults={catalogHasSearched && catalogResults.length === 0}
                toolbar={renderMediaTypePicker(true)}
                onContinueManually={() => {
                  if (!title.trim()) setTitle(catalogQuery.trim());
                  titleInputRef.current?.focus();
                }}
              >
                {catalogDraft ? <p role="status" className="text-xs font-semibold text-primary">Catalog details loaded for {catalogDraft.title}. Review the editable fields below.</p> : null}
                {catalogResults.length ? (
                  <ul aria-label="Media catalog search results" className="max-h-64 space-y-2 overflow-y-auto overscroll-contain pr-1">
                    {catalogResults.map(result => {
                      const duplicate = isCatalogDuplicate(mediaItems, result);
                      const resultType = MEDIA_TYPES.find(option => option.value === result.mediaType)?.label || result.mediaType;
                      const resultMeta = [resultType, result.year, result.totalUnits ? `${result.totalUnits} ${result.unitLabel}` : undefined, result.genres?.slice(0, 2).join(', '), result.rating ? `Catalog score ${result.rating.toFixed(1)}/10` : undefined]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <li key={`${result.provider}:${result.externalId}`}>
                          <button
                            type="button"
                            onClick={() => void selectCatalogResult(result)}
                            disabled={duplicate || catalogLoading}
                            aria-label={duplicate ? `${result.title}, already in your library` : `Review ${result.title} from ${result.provider}`}
                            className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border/50 bg-background/45 p-2 text-left transition hover:border-primary/35 hover:bg-background/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                              {result.image ? <ResilientImage src={result.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<ImageIcon className="m-auto size-5 text-muted-foreground/50" />} /> : <span className="grid h-full place-items-center"><ImageIcon className="size-5 text-muted-foreground/50" /></span>}
                            </span>
                            <span className="min-w-0 flex-1">
                              <strong className="block line-clamp-2 text-sm font-bold">{result.title}</strong>
                              <span className="mt-1 block truncate text-xs text-muted-foreground">{resultMeta}</span>
                            </span>
                            {duplicate ? <span className="shrink-0 text-xs font-bold text-muted-foreground">In library</span> : <span className="shrink-0 text-xs font-black text-primary">Select</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </CatalogAssist>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="min-w-0 space-y-5">
                <FormField label="Title">
                  <Input ref={titleInputRef} value={title} onChange={event => { setTitle(event.target.value); if (!isEditMode) updateCatalogQuery(event.target.value); }} placeholder="Title" />
                </FormField>

                {isEditMode ? renderMediaTypePicker() : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Status">
                    <AndroidAdaptiveSelect
                      label="Status"
                      value={status}
                      onChange={value => setStatus(value as MediaStatus)}
                      options={[
                        ...statusOptions(type).map(option => ({ value: option[0], label: option[1] })),
                        ...(statusOptions(type).some(option => option[0] === status) ? [] : [{ value: status, label: `${status.charAt(0).toUpperCase()}${status.slice(1)} (current status)` }]),
                      ]}
                      className={INPUT}
                    />
                  </FormField>

                  <FormField label="Unit">
                    <AndroidAdaptiveSelect
                      label="Unit"
                      value={unitLabel}
                      onChange={value => setUnitLabel(value as MediaUnitLabel)}
                      options={UNIT_OPTIONS}
                      className={INPUT}
                    />
                  </FormField>
                </div>

                {type === 'series' ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField label="Current season"><Input type="number" min="1" value={currentSeason} onChange={event => setCurrentSeason(event.target.value)} /></FormField>
                    <FormField label="Current episode"><Input type="number" min="0" value={currentEpisode} onChange={event => setCurrentEpisode(event.target.value)} /></FormField>
                    <FormField label="Total episodes"><Input type="number" min="0" value={totalUnits} onChange={event => setTotalUnits(event.target.value)} /></FormField>
                  </div>
                ) : type === 'movie' ? null : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Current progress"><Input type="number" min="0" value={progress} onChange={event => setProgress(event.target.value)} /></FormField>
                    <FormField label={`Total ${unitLabel}`}><Input type="number" min="0" value={totalUnits} onChange={event => setTotalUnits(event.target.value)} /></FormField>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField label="Year"><Input inputMode="numeric" value={year} onChange={event => setYear(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2026" /></FormField>
                  <FormField label="Release season">
                    <AndroidAdaptiveSelect
                      label="Release season"
                      value={releaseSeason || 'Unknown'}
                      onChange={value => setReleaseSeason(value as MediaItem['season'])}
                      options={RELEASE_SEASON_OPTIONS}
                      className={INPUT}
                    />
                  </FormField>
                  <FormField label="Rating / 10"><Input type="number" min="0" max="10" step="0.5" value={rating} onChange={event => setRating(event.target.value)} /></FormField>
                </div>

                <FormField label="Genres"><Input value={genres} onChange={event => setGenres(event.target.value)} placeholder="Fantasy, Adventure, Drama" /></FormField>
                <FormField label="My watch or reading link"><Input type="url" value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://..." /></FormField>
                <FormField label="Personal notes"><Textarea value={notes} onChange={event => setNotes(event.target.value)} className="min-h-28" placeholder="Thoughts, where you stopped, preferred subtitles..." /></FormField>

                <label className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/40 p-4 text-sm font-bold">
                  <Checkbox checked={favorite} onCheckedChange={checked => setFavorite(checked === true)} />
                  <Star className={`h-4 w-4 ${favorite ? 'fill-amber-300 text-amber-300' : 'text-muted-foreground'}`} />
                  Favorite
                </label>

                {normalizeExternalWebUrl(media?.catalogUrl || initialDraft?.catalogUrl) ? (
                  <a href={normalizeExternalWebUrl(media?.catalogUrl || initialDraft?.catalogUrl)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
                    <ExternalLink className="h-4 w-4" /> Open catalog page
                  </a>
                ) : null}
              </div>

              <aside className="min-w-0 space-y-3">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
                <div className="aspect-[2/3] overflow-hidden rounded-3xl border border-border/60 bg-muted">
                  {image || imageAssetId ? (
                    <button type="button" onClick={() => setSelectedImage(image)} className="h-full w-full">
                      {image ? <img src={image} alt={title || 'Poster'} className="h-full w-full object-cover" /> : <MediaAssetImage assetId={imageAssetId!} profileId={currentProfileId} alt={title || 'Poster'} className="h-full w-full object-cover" />}
                    </button>
                  ) : (
                    <button type="button" onClick={() => fileRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
                      <ImageIcon className="h-8 w-8" />
                      <span className="text-xs font-bold">Add poster</span>
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input type="url" value={imageUrl} onChange={event => setImageUrl(event.target.value)} className="min-w-0 flex-1" placeholder="Poster URL" />
                  <Button type="button" variant="outline" onClick={applyImageUrl} className="rounded-xl px-3"><Link2 className="h-4 w-4" /></Button>
                </div>
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="w-full rounded-xl"><Upload className="mr-2 h-4 w-4" />Upload Image</Button>
                {(image || imageAssetId) ? <Button type="button" variant="ghost" onClick={() => { setImage(null); setImageUrl(''); setImageAssetId(undefined); }} className="w-full rounded-xl text-red-400"><Trash2 className="mr-2 h-4 w-4" />Remove Poster</Button> : null}
              </aside>
            </div>
          </div>

          <footer className="flex justify-end gap-3 border-t border-border/60 px-4 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={requestClose} className="rounded-xl">Cancel</Button>
            <Button type="button" onClick={save} className="rounded-xl">{isEditMode ? 'Save Changes' : 'Add Entry'}</Button>
          </footer>
        </section>
      </div>

      <ConfirmDialog
        isOpen={showUnsavedConfirm}
        title="Discard entertainment changes?"
        message="You have unsaved changes. Close without saving?"
        confirmText="Discard"
        cancelText="Keep Editing"
        isDangerous
        onCancel={() => setShowUnsavedConfirm(false)}
        onConfirm={() => { setShowUnsavedConfirm(false); close(); }}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Move entertainment entry to Trash?"
        message="This removes the title from your library. You can restore it from Trash later."
        confirmText="Move to Trash"
        cancelText="Cancel"
        isDangerous
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          if (!media) return;
          deleteMediaItem(media.id);
          setShowDeleteConfirm(false);
          close();
        }}
      />

      {selectedImage ? (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 p-4" data-caizen-overlay={imagePreviewIsClosing ? 'closing' : 'open'} data-state={imagePreviewIsClosing ? 'closed' : 'open'} onClick={closeImagePreview}>
          <button type="button" aria-label="Close image" className="absolute right-5 top-5 rounded-xl bg-white/10 p-3 text-white" onClick={closeImagePreview}><X className="h-5 w-5" /></button>
          <img src={selectedImage} alt="Expanded poster" className="max-h-[90vh] max-w-[95vw] rounded-3xl object-contain" onClick={event => event.stopPropagation()} />
        </div>
      ) : null}
    </>,
    document.body,
  );
}
