import { describe, expect, it } from 'vitest';
import {
  adjustMediaProgress,
  catchUpMediaProgress,
  getKnownMediaTotal,
  getMediaProgressValue,
  normalizeMediaProgress,
} from '@/lib/entertainment/progress';

const series = (overrides: Record<string, unknown> = {}) => ({
  type: 'series' as const,
  totalUnits: 3,
  progress: 1,
  currentEpisode: 1,
  status: 'watching' as const,
  completedAt: null,
  ...overrides,
});

describe('Entertainment progress invariant', () => {
  it('reads a positive total and preserves zero/unknown totals as unbounded', () => {
    expect(getKnownMediaTotal({ totalUnits: 4 })).toBe(4);
    expect(getKnownMediaTotal({ totalUnits: 0, episodes: 8 })).toBeUndefined();
    expect(getKnownMediaTotal({ totalUnits: undefined, episodes: 0 })).toBeUndefined();
  });

  it('normalizes progress below a known total', () => {
    expect(normalizeMediaProgress(series({ progress: 2, currentEpisode: 2 }))).toMatchObject({
      progress: 2,
      currentEpisode: 2,
      status: 'watching',
    });
  });

  it('completes exactly at the known total and cannot increment again', () => {
    const atBoundary = adjustMediaProgress(series({ progress: 2, currentEpisode: 2 }), 1, new Date('2026-08-12T00:00:00Z'));
    expect(atBoundary).toMatchObject({
      changed: true,
      patch: {
        progress: 3,
        currentEpisode: 3,
        status: 'completed',
      },
    });
    expect(atBoundary.patch.completedAt).toEqual(new Date('2026-08-12T00:00:00Z'));

    const alreadyComplete = adjustMediaProgress({ ...series({ progress: 3, currentEpisode: 3, status: 'completed' }), completedAt: new Date('2026-08-12T00:00:00Z') }, 1);
    expect(alreadyComplete.changed).toBe(false);
    expect(alreadyComplete.patch.progress).toBe(3);
  });

  it('preserves logged history and status when a provider total is revised downward', () => {
    const normalized = normalizeMediaProgress(series({ progress: 99, currentEpisode: 99 }));
    expect(normalized).toMatchObject({ progress: 99, currentEpisode: 99, status: 'watching' });
  });

  it('supports unknown totals without inventing a boundary', () => {
    const item = { ...series({ totalUnits: 0, progress: 8, currentEpisode: 8 }) };
    expect(getMediaProgressValue(item)).toBe(8);
    expect(adjustMediaProgress(item, 1).patch).toMatchObject({ progress: 9, currentEpisode: 9, status: 'watching' });
  });

  it('reopens a completed item when progress is decremented', () => {
    const reopened = adjustMediaProgress({
      ...series({ progress: 3, currentEpisode: 3, status: 'completed' }),
      completedAt: new Date('2026-08-12T00:00:00Z'),
    }, -1);
    expect(reopened.patch).toMatchObject({
      progress: 2,
      currentEpisode: 2,
      status: 'watching',
      completedAt: null,
    });
  });

  it('jumps active episodic progress to the latest available unit', () => {
    expect(catchUpMediaProgress({
      ...series({ progress: 4, currentEpisode: 4, totalUnits: 12 }),
      availableUnits: 8,
    }, new Date('2026-08-12T00:00:00Z'))).toMatchObject({
      changed: true,
      patch: { progress: 8, currentEpisode: 8, status: 'watching' },
    });

    expect(catchUpMediaProgress({
      ...series({ type: 'manga', status: 'reading', progress: 10, totalUnits: 20 }),
      availableUnits: 15,
    }).patch).toMatchObject({ progress: 15, status: 'reading' });
  });

  it('does not catch up ineligible or already current items', () => {
    const cases = [
      series({ status: 'planned', availableUnits: 8 }),
      series({ status: 'paused', availableUnits: 8 }),
      series({ status: 'dropped', availableUnits: 8 }),
      series({ status: 'completed', availableUnits: 8 }),
      series({ progress: 8, currentEpisode: 8, availableUnits: 8 }),
      series({ progress: 9, currentEpisode: 9, availableUnits: 8 }),
      series({ type: 'movie', availableUnits: 8 }),
      series({ availableUnits: 1.5 }),
    ];

    for (const item of cases) {
      expect(catchUpMediaProgress(item).changed).toBe(false);
      expect(catchUpMediaProgress(item).patch).toEqual({});
    }
  });

  it('accepts provider-confirmed availability beyond a stale catalog total', () => {
    expect(catchUpMediaProgress(series({ availableUnits: 13 })).patch.progress).toBe(13);
  });

  it('completes through the existing forward-progress semantics at the known total', () => {
    const adjustment = catchUpMediaProgress({
      ...series({ progress: 4, currentEpisode: 4, totalUnits: 8 }),
      availableUnits: 8,
    }, new Date('2026-08-12T00:00:00Z'));

    expect(adjustment.patch).toMatchObject({ progress: 8, currentEpisode: 8, status: 'completed' });
    expect(adjustment.patch.completedAt).toEqual(new Date('2026-08-12T00:00:00Z'));
  });
});
