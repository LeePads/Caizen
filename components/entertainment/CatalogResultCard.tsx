'use client';

import {
  Check,
  Clock3,
  Plus,
  Star,
} from 'lucide-react';
import { ResilientImage } from '@/components/media/ResilientImage';
import type { CatalogSearchResult } from '@/lib/entertainment/types';
import { parseLocalDateKey } from '@/lib/date-utils';
import type {
  EntertainmentCardDensity,
  EntertainmentTitleLanguage,
} from '@/lib/entertainment/preferences';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

function displayTitle(
  item: CatalogSearchResult,
  language: EntertainmentTitleLanguage,
) {
  if (language === 'native') {
    return item.nativeTitle || item.originalTitle || item.title;
  }
  if (language === 'romaji') {
    return item.romajiTitle || item.title;
  }
  return item.englishTitle || item.title;
}

function formatStatus(value?: string) {
  if (!value || value === 'unknown') return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function nextAiringText(item: CatalogSearchResult) {
  if (item.nextEpisodeDate) {
    const date = parseLocalDateKey(item.nextEpisodeDate);
    return date
      ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
  }
  if (!('nextEpisodeAt' in item) || !item.nextEpisodeAt) return '';
  const date = new Date(item.nextEpisodeAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export default function CatalogResultCard({
  item,
  duplicate,
  onSelect,
  density = 'comfortable',
  titleLanguage = 'english',
  showScores = true,
  showGenres = true,
  showReleaseStatus = true,
  showEpisodeCounts = true,
  showAiringCountdown = true,
  showPopularity = false,
  fluid = false,
}: {
  item: CatalogSearchResult;
  duplicate: boolean;
  onSelect: () => void;
  density?: EntertainmentCardDensity;
  titleLanguage?: EntertainmentTitleLanguage;
  showScores?: boolean;
  showGenres?: boolean;
  showReleaseStatus?: boolean;
  showEpisodeCounts?: boolean;
  showAiringCountdown?: boolean;
  showPopularity?: boolean;
  fluid?: boolean;
}) {
  const title = displayTitle(item, titleLanguage) || 'Untitled title';
  const widthClass = fluid
    ? 'w-full'
    : density === 'compact'
      ? 'w-[132px] sm:w-[146px]'
      : density === 'large'
        ? 'w-[188px] sm:w-[220px]'
        : 'w-[158px] sm:w-[180px]';
  const airingText = nextAiringText(item);

  return (
    <article data-caizen-collection-item="true" className={`caizen-catalog-result-card group min-w-0 shrink-0 ${widthClass}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Open ${title}`}
        className="relative block aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-muted text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <div
          className="caizen-catalog-poster-visual absolute inset-0"
        >
          <ResilientImage
            src={item.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
            fallback={<div className="flex h-full items-center justify-center px-5 text-center text-xs font-bold text-muted-foreground">No poster available</div>}
          />
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />

        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {duplicate ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-500/85 px-2 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg backdrop-blur">
              <Check className="h-3 w-3" /> Library
            </span>
          ) : null}
          {showScores && item.rating ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-2 py-1 text-xs font-black text-white backdrop-blur">
              <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
              {item.rating.toFixed(1)}
            </span>
          ) : null}
        </div>

        {!duplicate ? (
          <span className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white opacity-100 shadow-lg backdrop-blur transition sm:opacity-0 sm:group-hover:opacity-100">
            <Plus className="h-4 w-4" />
          </span>
        ) : null}

        <div className="absolute bottom-0 left-0 right-0 p-3.5">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-white/70">
            {item.format ? <span className="break-words">{item.format.replaceAll('_', ' ')}</span> : <span>{item.mediaType}</span>}
            {item.year ? <><span>•</span><span>{item.year}</span></> : null}
          </div>
          {showAiringCountdown && airingText ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-white/80">
              <Clock3 className="h-3 w-3" /> {airingText}
            </p>
          ) : null}
        </div>
      </button>

      <button type="button" onClick={onSelect} aria-label={`Open ${title}`} className="mt-3 block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <OverflowTooltip text={title} mode="clamped"><h3 className="line-clamp-2 text-sm font-black leading-snug text-foreground transition group-hover:text-primary sm:text-sm">
          {title}
        </h3></OverflowTooltip>

        <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {showReleaseStatus && formatStatus(item.sourceStatus) ? (
              <span className="break-words">{formatStatus(item.sourceStatus)}</span>
          ) : null}
          {showEpisodeCounts && item.totalUnits ? (
            <>
              {showReleaseStatus && formatStatus(item.sourceStatus) ? <span>•</span> : null}
              <span className="break-words">{item.totalUnits} {item.unitLabel}</span>
            </>
          ) : null}
        </div>

        {showGenres && item.genres?.length ? (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {item.genres.slice(0, 2).join(' · ')}
          </p>
        ) : null}
        {showPopularity && item.popularity ? (
          <p className="mt-1 text-xs font-bold text-muted-foreground">
            Popularity {new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(item.popularity)}
          </p>
        ) : null}
      </button>
    </article>
  );
}
