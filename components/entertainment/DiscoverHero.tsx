'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Star,
} from 'lucide-react';
import { ArrowFlyThrough, Button } from '@/components/ui/button';
import { ResilientImage } from '@/components/media/ResilientImage';
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion-preference';
import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled';
import type { CatalogSearchResult } from '@/lib/entertainment/types';
import type { EntertainmentTitleLanguage } from '@/lib/entertainment/preferences';

function preferredTitle(
  item: CatalogSearchResult,
  language: EntertainmentTitleLanguage,
) {
  if (language === 'native') return item.nativeTitle || item.originalTitle || item.title;
  if (language === 'romaji') return item.romajiTitle || item.title;
  return item.englishTitle || item.title;
}

export default function DiscoverHero({
  items,
  duplicateKeys,
  titleLanguage,
  onSelect,
  androidPresentation = false,
  enableCharacterBlur = false,
}: {
  items: CatalogSearchResult[];
  duplicateKeys: Set<string>;
  titleLanguage: EntertainmentTitleLanguage;
  onSelect: (item: CatalogSearchResult) => void;
  androidPresentation?: boolean;
  enableCharacterBlur?: boolean;
}) {
  const heroRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInView, setIsInView] = useState(true);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const reduceMotion = useReducedMotionPreference();
  const motionMode = useCaizenMotionMode();
  const [characterBlurSlideKey, setCharacterBlurSlideKey] = useState<string | null>(null);
  const itemCount = items.length;

  useEffect(() => {
    setActiveIndex(current => Math.min(current, Math.max(0, itemCount - 1)));
  }, [itemCount]);

  useEffect(() => {
    if (motionMode !== 'full') setCharacterBlurSlideKey(null);
  }, [motionMode]);

  useEffect(() => {
    const node = heroRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry?.isIntersecting ?? true);
    }, { threshold: 0.2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const syncVisibility = () => setIsDocumentVisible(document.visibilityState === 'visible');
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);

  useEffect(() => {
    if (reduceMotion || itemCount < 2 || !isInView || !isDocumentVisible) return;
    const timer = window.setInterval(() => {
      setCharacterBlurSlideKey(null);
      setActiveIndex(current => (current + 1) % itemCount);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [isDocumentVisible, isInView, itemCount, reduceMotion]);

  if (!itemCount) return null;

  const item = items[activeIndex] || items[0];
  const title = preferredTitle(item, titleLanguage) || 'Untitled title';
  const backdrop = item.backdrop || item.image;
  const duplicate = duplicateKeys.has(`${item.provider}:${item.externalId}`);
  const slideKey = `${item.provider}:${item.externalId}`;
  const selectSlide = (index: number, moveFocus = false) => {
    const nextIndex = (index + itemCount) % itemCount;
    const nextItem = items[nextIndex];
    setActiveIndex(nextIndex);
    const nextTitle = nextItem ? preferredTitle(nextItem, titleLanguage) || 'Untitled title' : null;
    setCharacterBlurSlideKey(
      nextItem && nextIndex !== activeIndex && nextTitle !== title
        ? `${nextItem.provider}:${nextItem.externalId}`
        : null,
    );
    if (moveFocus) {
      window.requestAnimationFrame(() => document.getElementById(`featured-catalog-tab-${nextIndex}`)?.focus());
    }
  };
  const safeCharacterBlurTitle = enableCharacterBlur
    && !androidPresentation
    && motionMode === 'full'
    && characterBlurSlideKey === slideKey
    && title.length > 0
    && title.length <= 32
    && /^[A-Za-z0-9][A-Za-z0-9 '&:.,!?-]*$/.test(title);
  const renderDots = () => (
    <div className="caizen-discover-hero-dots flex items-center gap-1 px-1" role="tablist" aria-label="Featured catalog titles">
      {items.map((featuredItem, index) => (
        <button
          key={`${featuredItem.provider}:${featuredItem.externalId}`}
          type="button"
          id={`featured-catalog-tab-${index}`}
          role="tab"
          aria-selected={activeIndex === index}
          aria-controls="featured-catalog-slide"
          aria-label={`Show ${preferredTitle(featuredItem, titleLanguage) || `featured title ${index + 1}`}`}
          tabIndex={activeIndex === index ? 0 : -1}
          onClick={() => selectSlide(index)}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? itemCount - 1 : activeIndex + (event.key === 'ArrowLeft' ? -1 : 1);
            selectSlide(nextIndex, true);
          }}
          className="group/dot inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <span aria-hidden="true" className={`caizen-discover-hero-dot block h-1.5 rounded-full transition-[width,background-color] duration-200 ${activeIndex === index ? 'is-active w-4 bg-primary' : 'w-1.5 bg-white/45 group-hover/dot:bg-white/80'}`} />
        </button>
      ))}
    </div>
  );

  return (
    <section ref={heroRef} className="caizen-discover-hero group relative min-h-[360px] overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-xl sm:min-h-[420px]" aria-roledescription="carousel" aria-label={`Featured catalog titles, ${activeIndex + 1} of ${itemCount}`}>
      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={slideKey}
          className="caizen-discover-hero-slide absolute inset-0"
          aria-hidden="true"
          initial={motionMode === 'reduced' ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: motionMode === 'reduced' ? 0 : motionMode === 'full' ? 0.22 : 0.14,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {backdrop ? (
            <ResilientImage
              src={backdrop}
              alt=""
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-1000 group-hover:scale-[1.02]"
              fallback={<div className="absolute inset-0 bg-muted" />}
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,4,7,0.98)_0%,rgba(4,4,7,0.86)_38%,rgba(4,4,7,0.42)_68%,rgba(4,4,7,0.68)_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />
        </motion.div>
      </AnimatePresence>

      {itemCount > 1 ? (
        <>
          <div className={androidPresentation ? 'caizen-discover-hero-controls absolute right-5 top-5 z-20 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 p-1 backdrop-blur sm:right-8 sm:top-8' : 'pointer-events-none absolute inset-x-3 top-1/2 z-20 flex -translate-y-1/2 items-center justify-between sm:inset-x-5'}>
            <button type="button" onClick={() => selectSlide(activeIndex - 1)} className={`${androidPresentation ? '' : 'pointer-events-auto border border-white/20 bg-black/35 shadow-lg backdrop-blur-md'} caizen-discover-hero-control caizen-arrow-fly-through-trigger ${androidPresentation ? 'caizen-arrow-fly-through-static' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80`} aria-label="Previous featured title">
              <ArrowFlyThrough direction="left"><ChevronLeft className="h-4 w-4" /></ArrowFlyThrough>
            </button>
            {androidPresentation ? renderDots() : null}
            <button type="button" onClick={() => selectSlide(activeIndex + 1)} className={`${androidPresentation ? '' : 'pointer-events-auto border border-white/20 bg-black/35 shadow-lg backdrop-blur-md'} caizen-discover-hero-control caizen-arrow-fly-through-trigger ${androidPresentation ? 'caizen-arrow-fly-through-static' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80`} aria-label="Next featured title">
              <ArrowFlyThrough direction="right"><ChevronRight className="h-4 w-4" /></ArrowFlyThrough>
            </button>
          </div>
          {!androidPresentation ? <div className="pointer-events-auto absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-black/45 p-1 shadow-lg backdrop-blur-sm">{renderDots()}</div> : null}
        </>
      ) : null}

      <div id="featured-catalog-slide" role="tabpanel" aria-live="polite" aria-labelledby={itemCount > 1 ? `featured-catalog-tab-${activeIndex}` : undefined} className="caizen-discover-hero-content relative flex min-h-[360px] items-end p-5 sm:min-h-[420px] sm:p-8 lg:p-10">
        <div className="grid w-full items-end gap-6 md:grid-cols-[170px_minmax(0,1fr)] lg:grid-cols-[210px_minmax(0,1fr)]">
          <div className="hidden aspect-[2/3] overflow-hidden rounded-[1.5rem] border border-white/15 bg-black/30 shadow-2xl md:block">
            <ResilientImage src={item.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<div className="grid h-full place-items-center px-4 text-center text-xs text-white/65">No poster available</div>} />
          </div>

          <div className="max-w-3xl text-white">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/65">
              <span>{item.mediaType}</span>
              {item.year ? <><span>•</span><span>{item.year}</span></> : null}
              {item.format ? <><span>•</span><span>{item.format.replaceAll('_', ' ')}</span></> : null}
            </div>

            <h2 className="mt-3 max-w-3xl break-words text-3xl font-black leading-[0.98] tracking-tight sm:text-5xl lg:text-6xl">
              {safeCharacterBlurTitle ? (
                <>
                  <span className="sr-only">{title}</span>
                  <span aria-hidden="true" className="caizen-character-blur-text">
                    {Array.from(title).map((character, index) => (
                      <span key={`${slideKey}:${index}`} style={{ animationDelay: `${Math.min(index * 9, 135)}ms` }}>
                        {character}
                      </span>
                    ))}
                  </span>
                </>
              ) : title}
            </h2>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-white/75">
              {item.rating ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur">
                  <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                  {item.rating.toFixed(1)}
                </span>
              ) : null}
              {(item.genres || []).slice(0, 3).map(genre => (
                <span key={genre} className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 backdrop-blur">
                  {genre}
                </span>
              ))}
            </div>

            <p className="mt-5 line-clamp-3 max-w-2xl text-sm leading-7 text-white/72 sm:text-base">
              {item.synopsis || 'Open the title to review its catalog details and add it to your personal library.'}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => onSelect(item)}
                className="h-11 rounded-xl bg-white px-5 font-black text-black hover:bg-white/90"
              >
                {duplicate ? <Check className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {duplicate ? 'View Library Title' : 'Review & Add'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
