import type { MediaItem, MediaStatus } from '../types';

type MediaProgressFields = Pick<
  MediaItem,
  | 'type'
  | 'episodes'
  | 'totalUnits'
  | 'progress'
  | 'currentEpisode'
  | 'status'
  | 'completedAt'
>;

const ACTIVE_STATUSES: ReadonlySet<MediaStatus> = new Set(['reading', 'watching']);

function finiteNonNegative(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : undefined;
}

/** Returns a positive finite total, preserving zero as an unknown/unbounded total. */
export function getKnownMediaTotal(item: Pick<MediaItem, 'totalUnits' | 'episodes'>): number | undefined {
  const rawTotal = item.totalUnits ?? item.episodes;
  const total = finiteNonNegative(rawTotal);
  return total && total > 0 ? total : undefined;
}

export function clampMediaProgress(value: unknown, total?: number): number {
  const progress = finiteNonNegative(value) ?? 0;
  return total === undefined ? progress : Math.min(progress, total);
}

/** Series uses currentEpisode as the canonical displayed progress when present. */
export function getMediaProgressValue(item: Pick<MediaItem, 'type' | 'progress' | 'currentEpisode'>): number {
  const currentEpisode = item.type === 'series' && item.currentEpisode != null
    ? finiteNonNegative(item.currentEpisode)
    : undefined;
  return currentEpisode ?? finiteNonNegative(item.progress) ?? 0;
}

export interface NormalizedMediaProgress {
  progress: number;
  currentEpisode?: number;
  status: MediaStatus;
  completedAt: Date | null;
}

/**
 * Normalizes the user's logged progress without treating provider totals as a
 * reason to rewrite personal history or status. Catalog totals can be corrected
 * after a user has already logged more units than the provider currently lists.
 */
export function normalizeMediaProgress(item: MediaProgressFields): NormalizedMediaProgress {
  const progress = finiteNonNegative(getMediaProgressValue(item)) ?? 0;
  const currentEpisode = item.type === 'series' && item.currentEpisode != null
    ? progress
    : undefined;
  const status = item.status;

  return {
    progress,
    currentEpisode,
    status,
    completedAt: status === 'completed' ? item.completedAt ?? null : null,
  };
}

export interface MediaProgressAdjustment {
  changed: boolean;
  patch: Partial<Pick<MediaItem, 'progress' | 'currentEpisode' | 'status' | 'completedAt'>>;
}

function buildMediaProgressAdjustment(
  item: MediaProgressFields,
  target: number,
  direction: 'forward' | 'backward',
  now: Date,
  allowAboveTotal = false,
): MediaProgressAdjustment {
  const normalized = normalizeMediaProgress(item);
  const total = getKnownMediaTotal(item);
  const alreadyAboveTotal = total !== undefined && normalized.progress > total;
  const requestedProgress = finiteNonNegative(target) ?? 0;
  const nextProgress = allowAboveTotal || alreadyAboveTotal
    ? requestedProgress
    : clampMediaProgress(requestedProgress, total);
  const crossedTotal = total !== undefined && normalized.progress < total && nextProgress >= total;
  const reopening = direction === 'backward' && item.status === 'completed' && nextProgress < normalized.progress;
  const nextStatus = crossedTotal && direction === 'forward'
    ? 'completed'
    : reopening
      ? item.type === 'manga' ? 'reading' : 'watching'
      : item.status;
  const nextCompletedAt = nextStatus === 'completed'
    ? item.completedAt ?? now
    : null;
  const nextEpisode = item.type === 'series' ? nextProgress : undefined;
  const nextCompletedTime = nextCompletedAt?.getTime() ?? null;
  const currentCompletedTime = item.completedAt?.getTime() ?? null;
  const changed =
    nextProgress !== normalized.progress ||
    nextStatus !== item.status ||
    (item.type === 'series' && nextEpisode !== item.currentEpisode) ||
    nextCompletedTime !== currentCompletedTime;

  return {
    changed,
    patch: {
      progress: nextProgress,
      ...(item.type === 'series' ? { currentEpisode: nextEpisode } : {}),
      status: nextStatus,
      completedAt: nextCompletedAt,
    },
  };
}

/** Produces the bounded increment/decrement mutation used by both card layouts. */
export function adjustMediaProgress(
  item: MediaProgressFields,
  delta: 1 | -1,
  now = new Date(),
): MediaProgressAdjustment {
  const normalized = normalizeMediaProgress(item);
  return buildMediaProgressAdjustment(item, normalized.progress + delta, delta > 0 ? 'forward' : 'backward', now);
}

/** Jumps directly to an arbitrary episode/chapter number, e.g. tap-to-set on an episode box row. */
export function setMediaProgress(
  item: MediaProgressFields,
  target: number,
  now = new Date(),
): MediaProgressAdjustment {
  const normalized = normalizeMediaProgress(item);
  const direction: 'forward' | 'backward' = target >= normalized.progress ? 'forward' : 'backward';
  return buildMediaProgressAdjustment(item, target, direction, now);
}

type CatchUpMediaItem = MediaProgressFields & Pick<MediaItem, 'availableUnits'>;

/** Sets active episodic progress to the latest provider-confirmed available unit. */
export function catchUpMediaProgress(
  item: CatchUpMediaItem,
  now = new Date(),
): MediaProgressAdjustment {
  if (item.type === 'movie' || !ACTIVE_STATUSES.has(item.status)) {
    return { changed: false, patch: {} };
  }

  const availableUnits = finiteNonNegative(item.availableUnits);
  const currentProgress = getMediaProgressValue(item);
  if (
    availableUnits === undefined ||
    !Number.isInteger(availableUnits) ||
    availableUnits <= currentProgress
  ) {
    return { changed: false, patch: {} };
  }

  return buildMediaProgressAdjustment(item, availableUnits, 'forward', now, true);
}
