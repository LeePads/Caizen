import type { MediaItem } from '@/lib/types';
import {
  getAvailableUnitCount,
  getReleaseDateInfo,
  type EntertainmentCalendarEvent,
} from '@/lib/entertainment/derived';

type ReleasePresentationItem = Pick<
  MediaItem,
  'type' | 'unitLabel' | 'nextEpisodeNumber' | 'nextEpisodeAt'
> & Pick<MediaItem, 'nextEpisodeDate' | 'releaseDate'> & { catalogProvider?: MediaItem['catalogProvider'] };

export interface MediaUnitWords {
  singular: string;
  plural: string;
}

export function getMediaUnitWords(
  item: Pick<MediaItem, 'type' | 'unitLabel'>,
): MediaUnitWords {
  switch (item.unitLabel) {
    case 'chapters':
      return { singular: 'chapter', plural: 'chapters' };
    case 'volumes':
      return { singular: 'volume', plural: 'volumes' };
    case 'episodes':
      return { singular: 'episode', plural: 'episodes' };
    default:
      return item.type === 'manga'
        ? { singular: 'chapter', plural: 'chapters' }
        : { singular: 'episode', plural: 'episodes' };
  }
}

export function isMediaUpdate(
  item: Pick<MediaItem, 'status' | 'newUnitsAvailable' | 'hasNewSeason'>,
): boolean {
  return item.status !== 'dropped'
    && (Number(item.newUnitsAvailable || 0) > 0 || Boolean(item.hasNewSeason));
}

export function getMediaUpdateCount(
  items: readonly Pick<MediaItem, 'status' | 'newUnitsAvailable' | 'hasNewSeason'>[],
): number {
  return items.filter(isMediaUpdate).length;
}

export function formatMediaUpdateDescription(
  item: Pick<MediaItem, 'type' | 'unitLabel' | 'newUnitsAvailable' | 'availableUnits' | 'hasNewSeason'>,
): string {
  const parts: string[] = [];
  const count = Number(item.newUnitsAvailable || 0);
  const unit = getMediaUnitWords(item);

  if (Number(item.availableUnits) > 0) {
    const latest = Number(item.availableUnits);
    const singular = unit.singular.charAt(0).toUpperCase() + unit.singular.slice(1);
    parts.push(`${singular} ${latest} available`);
  }
  if (count > 0) {
    parts.push(`${count} new ${count === 1 ? unit.singular : unit.plural}`);
  }
  if (item.hasNewSeason) parts.push('New season available');
  return parts.join(' · ');
}

export function formatMediaProgressAction(
  item: Pick<MediaItem, 'type' | 'unitLabel'>,
): string {
  return `+1 ${getMediaUnitWords(item).singular}`;
}

export function formatMediaAvailability(item: MediaItem): string {
  const count = getAvailableUnitCount(item);
  if (!count) return '';
  const unit = getMediaUnitWords(item);
  return `${count} ${count === 1 ? unit.singular : unit.plural} available`;
}

function releaseLabel(
  item: Pick<MediaItem, 'type' | 'unitLabel'> & { nextEpisodeNumber?: number },
  unitNumber?: number,
): string {
  if (item.type === 'movie') return 'Movie release';
  const unit = getMediaUnitWords(item).singular;
  const number = unitNumber ?? item.nextEpisodeNumber;
  return number
    ? `${unit.charAt(0).toUpperCase()}${unit.slice(1)} ${number}`
    : `${unit.charAt(0).toUpperCase()}${unit.slice(1)}`;
}

export function formatCalendarEventUnit(
  event: Pick<EntertainmentCalendarEvent, 'item' | 'unitNumber'>,
): string {
  return releaseLabel(event.item, event.unitNumber);
}

export function formatCalendarEventMeta(event: EntertainmentCalendarEvent): string {
  const unit = formatCalendarEventUnit(event);
  if (event.precision === 'date') return unit;

  const timeLabel = event.date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${unit} · Airs ${timeLabel}`;
}

export function formatCalendarCellDetail(event: EntertainmentCalendarEvent): string {
  if (event.precision === 'date') return formatCalendarEventUnit(event);
  return event.date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getCalendarCellPreviews(
  events: EntertainmentCalendarEvent[],
  limit = 2,
): { visible: EntertainmentCalendarEvent[]; remaining: number } {
  const safeLimit = Math.max(0, Math.floor(limit));
  return {
    visible: events.slice(0, safeLimit),
    remaining: Math.max(0, events.length - safeLimit),
  };
}

export function formatReleaseSchedule(
  item: ReleasePresentationItem,
): string {
  const info = getReleaseDateInfo(item);
  if (!info) return '';

  const release = releaseLabel(item);
  const dateLabel = info.date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  if (info.precision === 'date') return `${release} · ${dateLabel}`;

  const timeLabel = info.date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${release} · ${dateLabel}, ${timeLabel}`;
}

export function formatNextRelease(
  item: ReleasePresentationItem,
): string {
  const schedule = formatReleaseSchedule(item);
  return schedule ? `Next: ${schedule}` : '';
}
