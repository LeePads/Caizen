'use client';

import { useEffect, useId, useState } from 'react';
import { Image as ImageIcon, Play, ExternalLink } from 'lucide-react';
import { isNativeApp } from '@/lib/platform';
import { mediaStorage, releaseMediaDisplayUrl } from '@/lib/storage/media-storage';
import { resolveMedia } from '@/lib/storage/media-resolver';
import { openExternalLink } from '@/lib/native/open-link';
import { tutorialEmbedUrl } from '@/lib/health/workout-media';

type Props = {
  profileId: string;
  exerciseName: string;
  referencePhotoAssetId?: string;
  staticImageSrc?: string;
  referenceVideoUrl?: string;
  /** Already-resolved remote exercise animation URL (see lib/health/exercise-media-provider.ts). Never fetched by this component. */
  animationUrl?: string | null;
  /** Use a short neutral stage for exercise cards without a local/static image. */
  compactPlaceholder?: boolean;
  emptyLabel?: string;
  className?: string;
  variant?: 'detail' | 'card' | 'stage' | 'hero';
  /** Hero-only: how the image fills its box. Defaults to 'cover' to preserve existing callers. */
  fit?: 'cover' | 'contain';
};

export default function WorkoutReferenceMedia({
  profileId,
  exerciseName,
  referencePhotoAssetId,
  staticImageSrc,
  referenceVideoUrl,
  animationUrl,
  compactPlaceholder = false,
  emptyLabel = 'Add a reference photo',
  className = '',
  variant = 'detail',
  fit = 'cover',
}: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [staticImageError, setStaticImageError] = useState(false);
  const [animationError, setAnimationError] = useState(false);
  const [active, setActive] = useState<'photo' | 'tutorial'>(referencePhotoAssetId || staticImageSrc ? 'photo' : 'tutorial');
  const mediaId = useId();
  const embedUrl = tutorialEmbedUrl(referenceVideoUrl);
  const canUseAnimation = Boolean(animationUrl && !animationError);
  const hasPhoto = Boolean(referencePhotoAssetId || staticImageSrc || canUseAnimation);
  const hasTutorial = Boolean(referenceVideoUrl);
  const isCard = variant === 'card';
  const isStage = variant === 'stage';
  const useNativeMediaResolver = isNativeApp();
  // Priority: the user's own photo, then a bundled static image, then the
  // remote animation — each tier skipped once it has errored.
  const photoSource = referencePhotoAssetId && !photoError
    ? photoUrl
    : staticImageSrc && !staticImageError
      ? staticImageSrc
      : canUseAnimation ? animationUrl! : undefined;
  const isLoadingPhoto = Boolean(referencePhotoAssetId && !photoError && !photoUrl);
  const canRenderPhoto = Boolean(photoSource && !isLoadingPhoto);
  const handlePhotoError = () => {
    if (referencePhotoAssetId && !photoError && photoUrl) {
      setPhotoError(true);
      return;
    }
    if (staticImageSrc && !staticImageError) {
      setStaticImageError(true);
      return;
    }
    if (canUseAnimation) setAnimationError(true);
  };

  const openTutorial = () => {
    if (!referenceVideoUrl) return;
    void openExternalLink(referenceVideoUrl).catch(() => undefined);
  };

  useEffect(() => {
    let mounted = true;
    let acquired = false;
    let release: (() => void) | undefined;
    setPhotoUrl(null);
    setPhotoError(false);
    setStaticImageError(false);
    setAnimationError(false);
    setActive(referencePhotoAssetId || staticImageSrc || animationUrl ? 'photo' : 'tutorial');
    if (!referencePhotoAssetId) return undefined;
    const displayVariant = isCard ? 'thumbnail' : 'full';
    const handleResolvedUrl = (url: string, resolvedRelease?: () => void) => {
      if (mounted) {
        acquired = true;
        release = resolvedRelease;
        setPhotoUrl(url);
      } else {
        resolvedRelease?.();
      }
    };
    const mediaPromise = useNativeMediaResolver
      ? resolveMedia(referencePhotoAssetId, {
        variant: displayVariant,
        purpose: displayVariant === 'full' ? 'explicit-open' : 'display',
        expectedProfileId: profileId,
      }).then(resolved => {
        if (resolved.url) {
          handleResolvedUrl(resolved.url, resolved.release);
        } else if (mounted) {
          setPhotoError(true);
        }
      })
      : mediaStorage.getDisplayUrl(referencePhotoAssetId, displayVariant, profileId).then(url => {
        handleResolvedUrl(url);
      });
    void mediaPromise.catch(() => {
      if (mounted) setPhotoError(true);
    });
    return () => {
      mounted = false;
      if (useNativeMediaResolver) {
        release?.();
      } else if (acquired) {
        releaseMediaDisplayUrl(referencePhotoAssetId, displayVariant);
      }
    };
  }, [animationUrl, isCard, profileId, referencePhotoAssetId, referenceVideoUrl, staticImageSrc, useNativeMediaResolver]);

  if (variant === 'hero') {
    return canRenderPhoto ? (
      <img
        src={photoSource || undefined}
        alt={`${exerciseName} reference`}
        className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`}
        onError={handlePhotoError}
      />
    ) : (
      <div className={`h-full w-full bg-gradient-to-br from-muted/40 to-muted/10 ${className}`} />
    );
  }

  if (isCard) {
    const isShowingAnimation = canUseAnimation && photoSource === animationUrl;
    const cardMediaBoxClass = 'aspect-video max-h-56 w-full';
    const hasAvailableStill = Boolean((referencePhotoAssetId && !photoError) || (staticImageSrc && !staticImageError));
    const emptyMediaBoxClass = compactPlaceholder && !hasAvailableStill && !canUseAnimation && !isLoadingPhoto && !referenceVideoUrl
      ? 'h-20 w-full'
      : cardMediaBoxClass;
    return (
      <div className={`overflow-hidden border-b border-border/60 bg-muted/30 ${className}`}>
        {canRenderPhoto ? (
          <div className="relative">
            <img
              src={photoSource || undefined}
              alt={`${exerciseName} reference`}
              className={`${cardMediaBoxClass} ${isShowingAnimation ? 'object-contain' : 'object-cover'}`}
              loading="lazy"
              onError={handlePhotoError}
            />
            {hasTutorial ? <button type="button" className="absolute bottom-3 left-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-xs font-black text-white transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={openTutorial} aria-label={`Open tutorial for ${exerciseName}`}><Play className="size-3.5" aria-hidden="true" />Tutorial</button> : null}
          </div>
        ) : hasTutorial ? (
          <button type="button" className={`grid ${cardMediaBoxClass} place-items-center gap-2 bg-primary/5 px-4 text-center text-sm font-black text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60`} onClick={openTutorial} aria-label={`Open tutorial for ${exerciseName}`}>
            <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground"><Play className="size-5" aria-hidden="true" /></span>
            <span>Watch tutorial</span>
          </button>
        ) : (
          <div className={`grid ${emptyMediaBoxClass} place-items-center gap-2 px-4 text-center text-xs text-muted-foreground`}>
            <span className="grid size-10 place-items-center rounded-full bg-background/70 text-primary" aria-hidden="true"><ImageIcon className="size-5" /></span>
            <span>{isLoadingPhoto ? 'Loading reference photo...' : referencePhotoAssetId && staticImageSrc && !staticImageError ? 'Using bundled reference photo' : referencePhotoAssetId ? 'Reference photo unavailable' : staticImageSrc && !staticImageError ? 'Loading reference photo...' : emptyLabel}</span>
          </div>
        )}
      </div>
    );
  }

  if (!hasPhoto && !hasTutorial) {
    return <div className={`${isStage ? 'flex min-h-24 items-center gap-3 rounded-xl px-4 py-3 text-left sm:min-h-28' : 'flex items-center gap-2 rounded-xl px-3 py-2'} border border-border/60 bg-background/25 text-xs text-muted-foreground ${className}`}><span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted/70 text-primary" aria-hidden="true"><ImageIcon className="size-5" /></span><span>{isStage ? 'Add a reference photo or tutorial to guide this exercise.' : 'No reference media for this exercise.'}</span></div>;
  }

  return (
    <div className={`${isStage ? 'space-y-4' : 'space-y-3'} ${className}`}>
      {hasPhoto && hasTutorial ? (
        <div className="flex gap-1 rounded-xl border border-border/60 bg-background/40 p-1" role="tablist" aria-label={`${exerciseName} reference media`}>
          <button type="button" role="tab" id={`${mediaId}-photo-tab`} aria-controls={`${mediaId}-photo-panel`} aria-selected={active === 'photo'} className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-black sm:text-sm ${active === 'photo' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`} onClick={() => setActive('photo')}><ImageIcon className="mr-1 inline size-4" aria-hidden="true" />Photo</button>
          <button type="button" role="tab" id={`${mediaId}-tutorial-tab`} aria-controls={`${mediaId}-tutorial-panel`} aria-selected={active === 'tutorial'} className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-black sm:text-sm ${active === 'tutorial' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`} onClick={() => setActive('tutorial')}><Play className="mr-1 inline size-4" aria-hidden="true" />Tutorial</button>
        </div>
      ) : null}
      {active === 'photo' && hasPhoto ? (
        <div id={`${mediaId}-photo-panel`} role={hasPhoto && hasTutorial ? 'tabpanel' : undefined} aria-labelledby={hasPhoto && hasTutorial ? `${mediaId}-photo-tab` : undefined} className={`${isStage ? 'min-h-48 sm:min-h-56 lg:min-h-64' : ''} overflow-hidden rounded-2xl border border-border/60 bg-background/30`}>
          {canRenderPhoto ? <img src={photoSource || undefined} alt={`${exerciseName} reference`} className={`${isStage ? 'h-full min-h-48 sm:min-h-56 lg:min-h-64' : 'max-h-[28rem]'} w-full object-contain`} onError={handlePhotoError} /> : <div className={`${isStage ? 'min-h-48 sm:min-h-56 lg:min-h-64' : 'min-h-40'} grid place-items-center p-4 text-center text-sm text-muted-foreground`}>{isLoadingPhoto ? 'Loading reference photo...' : staticImageSrc && !staticImageError ? 'Reference photo coming soon.' : 'Reference photo unavailable.'}</div>}
        </div>
      ) : hasTutorial ? (
        embedUrl ? <div id={`${mediaId}-tutorial-panel`} role={hasPhoto && hasTutorial ? 'tabpanel' : undefined} aria-labelledby={hasPhoto && hasTutorial ? `${mediaId}-tutorial-tab` : undefined} className={`${isStage ? 'min-h-48 sm:min-h-56 lg:min-h-64' : ''} overflow-hidden rounded-2xl border border-border/60 bg-black`}><iframe title={`${exerciseName} tutorial`} src={embedUrl} className={`${isStage ? 'min-h-48 sm:min-h-56 lg:min-h-64' : ''} aspect-video w-full`} allow="fullscreen; picture-in-picture" loading="lazy" /></div> : <div id={`${mediaId}-tutorial-panel`} role={hasPhoto && hasTutorial ? 'tabpanel' : undefined} aria-labelledby={hasPhoto && hasTutorial ? `${mediaId}-tutorial-tab` : undefined} className="flex min-h-11 items-center"><button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 px-3 text-sm font-black text-primary" onClick={() => void openExternalLink(referenceVideoUrl!).catch(() => undefined)}>Open tutorial <ExternalLink className="size-4" aria-hidden="true" /></button></div>
      ) : null}
    </div>
  );
}
