import type { MediaItem, MediaReleaseEvent } from '@/lib/types';
import { getKnownMediaTotal, getMediaProgressValue } from '@/lib/entertainment/progress';
import {
  parseLocalDateKey,
  parseLocalDateValue,
  toLocalDateKey,
} from '@/lib/date-utils';

export type ReleasePrecision = 'timestamp' | 'date';

export interface ReleaseDateInfo {
  date: Date;
  dateKey: string;
  precision: ReleasePrecision;
}

export interface EntertainmentCalendarEvent {
  id: string;
  item: MediaItem;
  date: Date;
  dateKey: string;
  precision: ReleasePrecision;
  unitNumber?: number;
  seasonNumber?: number;
}

export const RELEASE_HISTORY_LIMIT = 50;

const CALENDAR_STATUSES = new Set<MediaItem['status']>([
  'reading',
  'watching',
  'planned',
]);

const RELEASE_SUPPORTED_TYPES = new Set([
  'anilist:anime',
  'tmdb:series',
  'tmdb:movie',
]);

function finiteNonNegative(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function validPositiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function isValidTimestamp(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Boolean(parseLocalDateKey(value));
}

function isHistoricalRelease(event: Pick<MediaReleaseEvent, 'date' | 'precision'>, now: Date) {
  if (event.precision === 'date') {
    return event.date < toLocalDateKey(now);
  }
  return new Date(event.date).getTime() <= now.getTime();
}

function boundReleaseHistory(events: MediaReleaseEvent[], now = new Date()) {
  const future = events.filter(event => !isHistoricalRelease(event, now));
  const historical = events
    .filter(event => isHistoricalRelease(event, now))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return [...future, ...historical].slice(0, RELEASE_HISTORY_LIMIT);
}

export function normalizeReleaseHistory(value: unknown, now = new Date()): MediaReleaseEvent[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry): MediaReleaseEvent | null => {
      if (!entry || typeof entry !== 'object') return null;
      const source = (entry as { source?: unknown }).source;
      const precision = (entry as { precision?: unknown }).precision;
      const id = typeof (entry as { id?: unknown }).id === 'string'
        ? (entry as { id: string }).id.trim()
        : '';
      const date = typeof (entry as { date?: unknown }).date === 'string'
        ? (entry as { date: string }).date.trim()
        : '';

      if (
        !id ||
        (source !== 'anilist' && source !== 'tmdb') ||
        (precision !== 'timestamp' && precision !== 'date') ||
        (precision === 'date' ? !isValidDateKey(date) : !isValidTimestamp(date))
      ) return null;

      const seasonNumber = validPositiveInteger((entry as { seasonNumber?: unknown }).seasonNumber);
      const unitNumber = validPositiveInteger((entry as { unitNumber?: unknown }).unitNumber);

      return {
        id,
        source,
        ...(seasonNumber ? { seasonNumber } : {}),
        ...(unitNumber ? { unitNumber } : {}),
        date,
        precision,
      };
    })
    .filter((entry): entry is MediaReleaseEvent => Boolean(entry));

  return boundReleaseHistory(normalized, now);
}

export function mergeReleaseHistory(
  existing: unknown,
  incoming: MediaReleaseEvent[],
  options: {
    source: MediaReleaseEvent['source'];
    replaceFuture: boolean;
    now?: Date;
  },
): MediaReleaseEvent[] {
  const now = options.now || new Date();
  const current = normalizeReleaseHistory(existing, now);
  const next = normalizeReleaseHistory(incoming, now);
  const retained = options.replaceFuture
    ? current.filter(event => event.source !== options.source || isHistoricalRelease(event, now))
    : current;
  const byId = new Map(retained.map(event => [event.id, event]));

  next.forEach(event => {
    byId.set(event.id, event);
  });

  const merged = Array.from(byId.values());
  const future = merged.filter(event => !isHistoricalRelease(event, now));
  const historical = merged
    .filter(event => isHistoricalRelease(event, now))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return boundReleaseHistory([...future, ...historical], now);
}

/**
 * Reads provider release metadata without converting TMDB's date-only value
 * into an instant. Legacy TMDB rows without nextEpisodeDate intentionally do
 * not produce a date, because their old timestamp cannot be made travel-safe.
 */
export function getReleaseDateInfo(
  item: Pick<MediaItem, 'nextEpisodeAt' | 'nextEpisodeDate' | 'releaseDate'> & {
    catalogProvider?: MediaItem['catalogProvider'];
  },
): ReleaseDateInfo | null {
  if (item.catalogProvider === 'tmdb') {
    if (item.releaseDate) {
      const date = parseLocalDateKey(item.releaseDate);
      return date
        ? { date, dateKey: item.releaseDate, precision: 'date' }
        : null;
    }
    if (!item.nextEpisodeDate) return null;
    const date = parseLocalDateKey(item.nextEpisodeDate);
    return date
      ? { date, dateKey: item.nextEpisodeDate, precision: 'date' }
      : null;
  }

  if (!item.nextEpisodeAt) return null;
  const date = parseLocalDateValue(item.nextEpisodeAt);
  if (!date) return null;
  return {
    date,
    dateKey: toLocalDateKey(date),
    precision: 'timestamp',
  };
}

function isSupportedRelease(item: MediaItem): boolean {
  return Boolean(
    item.catalogProvider &&
    RELEASE_SUPPORTED_TYPES.has(`${item.catalogProvider}:${item.type}`),
  );
}

function releaseDateInfoFromEvent(event: MediaReleaseEvent): ReleaseDateInfo | null {
  if (event.precision === 'date') {
    const date = parseLocalDateKey(event.date);
    return date ? { date, dateKey: event.date, precision: 'date' } : null;
  }

  const date = parseLocalDateValue(event.date);
  return date
    ? { date, dateKey: toLocalDateKey(date), precision: 'timestamp' }
    : null;
}

function fallbackReleaseEvent(item: MediaItem): MediaReleaseEvent | null {
  const info = getReleaseDateInfo(item);
  if (!info || !item.catalogProvider || item.catalogProvider === 'manual') return null;
  return {
    id: `legacy:${item.catalogProvider}:${item.catalogId || item.id}:${item.nextEpisodeNumber || info.dateKey}`,
    source: item.catalogProvider,
    unitNumber: validPositiveInteger(item.nextEpisodeNumber),
    date: info.precision === 'date' ? info.dateKey : info.date.toISOString(),
    precision: info.precision,
  };
}

function matchesLogicalRelease(historyEvent: MediaReleaseEvent, fallbackEvent: MediaReleaseEvent) {
  if (historyEvent.source !== fallbackEvent.source) return false;
  if (historyEvent.id === fallbackEvent.id) return true;
  if (
    historyEvent.seasonNumber !== undefined &&
    fallbackEvent.seasonNumber !== undefined &&
    historyEvent.seasonNumber !== fallbackEvent.seasonNumber
  ) return false;
  return (
    historyEvent.unitNumber !== undefined &&
    fallbackEvent.unitNumber !== undefined &&
    historyEvent.unitNumber === fallbackEvent.unitNumber
  );
}

export function deriveEntertainmentCalendarEvents(
  items: MediaItem[],
  now = new Date(),
): EntertainmentCalendarEvent[] {
  return items
    .flatMap(item => {
      if (!isSupportedRelease(item)) return [];
      const history = normalizeReleaseHistory(item.releaseHistory);
      const fallback = fallbackReleaseEvent(item);
      const fallbackMatchesHistory = fallback
        ? history.some(historyEvent => matchesLogicalRelease(historyEvent, fallback))
        : false;
      const candidates = [
        ...history,
        ...(fallback && !fallbackMatchesHistory && !isHistoricalRelease(fallback, now) ? [fallback] : []),
      ];
      const seen = new Set<string>();
      return candidates.flatMap(release => {
        if (release.source !== item.catalogProvider) return [];
        const info = releaseDateInfoFromEvent(release);
        if (!info || seen.has(release.id)) return [];
        seen.add(release.id);
        const historical = isHistoricalRelease(release, now);
        if (!historical && !CALENDAR_STATUSES.has(item.status)) return [];
        return [{
          id: release.id,
          item,
          date: info.date,
          dateKey: info.dateKey,
          precision: info.precision,
          unitNumber: release.unitNumber,
          seasonNumber: release.seasonNumber,
        } satisfies EntertainmentCalendarEvent];
      });
    })
    .sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      if (a.precision !== b.precision) return a.precision === 'timestamp' ? -1 : 1;
      if (a.precision === 'timestamp' && b.precision === 'timestamp') {
        const difference = a.date.getTime() - b.date.getTime();
        if (difference !== 0) return difference;
      }
      return a.item.title.localeCompare(b.item.title) || a.id.localeCompare(b.id);
    });
}

/**
 * Returns provider-confirmed units available beyond the user's current
 * progress. A known total alone never creates an availability signal.
 */
export function getAvailableUnitCount(item: MediaItem): number | undefined {
  if (item.type === 'movie' || (item.status !== 'watching' && item.status !== 'reading')) {
    return undefined;
  }

  const progress = getMediaProgressValue(item);
  const available = finiteNonNegative(item.availableUnits);
  if (available === undefined || !Number.isInteger(available) || available <= progress) {
    return undefined;
  }

  const count = available - progress;
  return Number.isInteger(count) && count > 0 ? count : undefined;
}
