import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deriveEntertainmentCalendarEvents,
  getAvailableUnitCount,
  getReleaseDateInfo,
  mergeReleaseHistory,
  normalizeReleaseHistory,
} from '@/lib/entertainment/derived';
import {
  formatCalendarCellDetail,
  formatCalendarEventMeta,
  formatMediaAvailability,
  formatNextRelease,
  formatReleaseSchedule,
  getCalendarCellPreviews,
} from '@/lib/entertainment/presentation';
import type { EntertainmentCalendarEvent } from '@/lib/entertainment/derived';
import type { MediaItem } from '@/lib/types';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const baseItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: 'item',
  title: 'Example title',
  type: 'series',
  status: 'watching',
  progress: 0,
  totalUnits: 12,
  unitLabel: 'episodes',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const calendarEvent = (
  id: string,
  title: string,
  date: Date,
  precision: EntertainmentCalendarEvent['precision'] = 'timestamp',
): EntertainmentCalendarEvent => ({
  id,
  item: baseItem({ id, title }),
  date,
  dateKey: '2026-08-22',
  precision,
  unitNumber: Number(id.replace(/\D/g, '')) || 7,
});

describe('Entertainment library availability and calendar', () => {
  it('derives only provider-confirmed availability beyond current progress', () => {
    expect(getAvailableUnitCount(baseItem({ progress: 3, availableUnits: 8 }))).toBe(5);
    expect(getAvailableUnitCount(baseItem({ status: 'reading', type: 'manga', unitLabel: 'chapters', progress: 3, availableUnits: 8 }))).toBe(5);
    expect(getAvailableUnitCount(baseItem({ status: 'completed', progress: 2, availableUnits: 5, totalUnits: 12 }))).toBeUndefined();
    expect(getAvailableUnitCount(baseItem({ status: 'planned', progress: 2, availableUnits: 5, totalUnits: 12 }))).toBeUndefined();
    expect(getAvailableUnitCount(baseItem({ status: 'paused', progress: 2, availableUnits: 5, totalUnits: 12 }))).toBeUndefined();
    expect(getAvailableUnitCount(baseItem({ status: 'dropped', progress: 2, availableUnits: 5, totalUnits: 12 }))).toBeUndefined();
    expect(getAvailableUnitCount(baseItem({ totalUnits: 12 }))).toBeUndefined();
    expect(getAvailableUnitCount(baseItem({ progress: 5, availableUnits: 5 }))).toBeUndefined();
    expect(getAvailableUnitCount(baseItem({ progress: 8, availableUnits: 5 }))).toBeUndefined();
    expect(getAvailableUnitCount(baseItem({ progress: 3, totalUnits: 12, availableUnits: 15 }))).toBe(12);
    expect(getAvailableUnitCount(baseItem({ type: 'movie', availableUnits: 1, totalUnits: 1 }))).toBeUndefined();

    expect(formatMediaAvailability(baseItem({ progress: 0, availableUnits: 1 }))).toBe('1 episode available');
    expect(formatMediaAvailability(baseItem({ type: 'manga', unitLabel: 'chapters', availableUnits: 2 }))).toBe('2 chapters available');
    expect(formatMediaAvailability(baseItem({ status: 'completed', progress: 2, availableUnits: 5 }))).toBe('');
  });

  it('derives future events only for eligible active or planned catalog items', () => {
    const now = new Date(2026, 7, 20, 10, 0, 0);
    const events = deriveEntertainmentCalendarEvents([
      baseItem({ id: 'watching-anilist', type: 'anime', catalogProvider: 'anilist', nextEpisodeAt: new Date(2026, 7, 20, 21, 0, 0) }),
      baseItem({ id: 'planned-tmdb', status: 'planned', catalogProvider: 'tmdb', nextEpisodeDate: '2026-08-21' }),
      baseItem({ id: 'paused', status: 'paused', catalogProvider: 'tmdb', nextEpisodeDate: '2026-08-21' }),
      baseItem({ id: 'completed', status: 'completed', catalogProvider: 'tmdb', nextEpisodeDate: '2026-08-21' }),
      baseItem({ id: 'dropped', status: 'dropped', catalogProvider: 'tmdb', nextEpisodeDate: '2026-08-21' }),
      baseItem({ id: 'legacy-tmdb', catalogProvider: 'tmdb', nextEpisodeAt: new Date(2026, 7, 21, 12, 0, 0) }),
      baseItem({ id: 'past-anilist', type: 'anime', catalogProvider: 'anilist', nextEpisodeAt: new Date(2026, 7, 19, 21, 0, 0) }),
    ], now);

    expect(events.map(event => event.item.id)).toEqual(['watching-anilist', 'planned-tmdb']);
    expect(events[0]).toMatchObject({ precision: 'timestamp', dateKey: '2026-08-20' });
    expect(events[1]).toMatchObject({ precision: 'date', dateKey: '2026-08-21' });
  });

  it('uses an existing TMDB movie release date without inventing manga dates', () => {
    const movieEvents = deriveEntertainmentCalendarEvents([
      baseItem({
        id: 'planned-movie',
        type: 'movie',
        status: 'planned',
        catalogProvider: 'tmdb',
        releaseDate: '2026-08-24',
      }),
    ], new Date(2026, 7, 20, 10, 0, 0));

    expect(movieEvents).toMatchObject([
      { item: { id: 'planned-movie' }, precision: 'date', dateKey: '2026-08-24' },
    ]);
    expect(formatCalendarEventMeta(movieEvents[0])).toBe('Movie release');
    expect(deriveEntertainmentCalendarEvents([
      baseItem({ type: 'manga', catalogProvider: 'anilist', status: 'planned' }),
    ], new Date(2026, 7, 20))).toEqual([]);
  });

  it('retains historical provider events across status changes and replaces only refreshed future events', () => {
    const now = new Date(2026, 7, 20, 10, 0, 0);
    const item = baseItem({
      id: 'history-item',
      type: 'anime',
      catalogProvider: 'anilist',
      status: 'completed',
      releaseHistory: [
        { id: 'past-7', source: 'anilist', unitNumber: 7, date: '2026-08-19T21:00:00.000Z', precision: 'timestamp' },
        { id: 'future-old', source: 'anilist', unitNumber: 8, date: '2026-08-22T21:00:00.000Z', precision: 'timestamp' },
      ],
    });

    expect(deriveEntertainmentCalendarEvents([item], now).map(event => event.id)).toEqual(['past-7']);

    const merged = mergeReleaseHistory(item.releaseHistory, [
      { id: 'future-new', source: 'anilist', unitNumber: 9, date: '2026-08-23T21:00:00.000Z', precision: 'timestamp' },
    ], { source: 'anilist', replaceFuture: true, now });

    expect(merged.map(event => event.id)).toEqual(['future-new', 'past-7']);
    expect(merged).not.toContainEqual(expect.objectContaining({ id: 'future-old' }));
    expect(deriveEntertainmentCalendarEvents([{ ...item, releaseHistory: merged, status: 'watching' }], now).map(event => event.id)).toEqual(['past-7', 'future-new']);
  });

  it('bounds normalized release history to the latest compatible payload size', () => {
    const history = Array.from({ length: 60 }, (_, index) => ({
      id: `tmdb-${index}`,
      source: 'tmdb' as const,
      unitNumber: index + 1,
      date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
      precision: 'date' as const,
    }));

    expect(normalizeReleaseHistory(history)).toHaveLength(50);
  });

  it('orders exact local timestamps before date-only events on the same day', () => {
    const events = deriveEntertainmentCalendarEvents([baseItem({
      type: 'anime',
      catalogProvider: 'anilist',
      releaseHistory: [
        { id: 'date-only', source: 'anilist', unitNumber: 8, date: '2026-08-22', precision: 'date' },
        { id: 'late', source: 'anilist', unitNumber: 9, date: '2026-08-22T04:00:00.000Z', precision: 'timestamp' },
        { id: 'early', source: 'anilist', unitNumber: 7, date: '2026-08-22T02:00:00.000Z', precision: 'timestamp' },
      ],
    })], new Date(2026, 7, 20, 10, 0, 0));

    expect(events.map(event => event.id)).toEqual(['early', 'late', 'date-only']);
  });

  it('keeps AniList times precise and TMDB dates date-only', () => {
    const anilist = baseItem({
      type: 'anime',
      catalogProvider: 'anilist',
      nextEpisodeNumber: 8,
      nextEpisodeAt: new Date(2026, 7, 22, 21, 45, 0),
    });
    const tmdb = baseItem({
      catalogProvider: 'tmdb',
      nextEpisodeNumber: 3,
      nextEpisodeDate: '2026-08-23',
    });

    expect(getReleaseDateInfo(anilist)).toMatchObject({ precision: 'timestamp', dateKey: '2026-08-22' });
    expect(getReleaseDateInfo(tmdb)).toMatchObject({ precision: 'date', dateKey: '2026-08-23' });
    expect(formatReleaseSchedule(anilist)).toContain('Episode 8');
    expect(formatReleaseSchedule(anilist)).toMatch(/, [0-9]{1,2}:[0-9]{2}/);
    expect(formatReleaseSchedule(tmdb)).toContain('Episode 3');
    expect(formatReleaseSchedule(tmdb)).toContain('Aug 23');
    expect(formatReleaseSchedule(tmdb)).not.toMatch(/[0-9]{1,2}:[0-9]{2}/);
    expect(formatNextRelease(tmdb)).toContain('Next: Episode 3');
  });

  it('deduplicates a history event against its matching exact-time legacy fallback', () => {
    const item = baseItem({
      type: 'anime',
      catalogProvider: 'anilist',
      nextEpisodeNumber: 8,
      nextEpisodeAt: new Date('2026-08-23T13:00:00.000Z'),
      releaseHistory: [
        { id: 'provider-e8', source: 'anilist', unitNumber: 8, date: '2026-08-23T13:00:00.000Z', precision: 'timestamp' },
      ],
    });

    expect(deriveEntertainmentCalendarEvents([item], new Date(2026, 7, 20, 10, 0, 0))).toMatchObject([
      { id: 'provider-e8', unitNumber: 8 },
    ]);
  });

  it('lets corrected history beat a stale exact-time legacy fallback', () => {
    const item = baseItem({
      type: 'anime',
      catalogProvider: 'anilist',
      nextEpisodeNumber: 8,
      nextEpisodeAt: new Date('2026-08-22T13:00:00.000Z'),
      releaseHistory: [
        { id: 'provider-e8', source: 'anilist', unitNumber: 8, date: '2026-08-29T13:00:00.000Z', precision: 'timestamp' },
      ],
    });

    expect(deriveEntertainmentCalendarEvents([item], new Date(2026, 7, 20, 10, 0, 0))).toMatchObject([
      { id: 'provider-e8', dateKey: '2026-08-29' },
    ]);
  });

  it('keeps legacy-only records and distinct logical episodes', () => {
    const now = new Date(2026, 7, 20, 10, 0, 0);
    const legacyOnly = baseItem({
      id: 'legacy-only',
      type: 'anime',
      catalogProvider: 'anilist',
      nextEpisodeNumber: 8,
      nextEpisodeAt: new Date('2026-08-23T13:00:00.000Z'),
    });
    const distinctEpisodes = baseItem({
      id: 'distinct-episodes',
      type: 'anime',
      catalogProvider: 'anilist',
      nextEpisodeNumber: 8,
      nextEpisodeAt: new Date('2026-08-23T13:00:00.000Z'),
      releaseHistory: [
        { id: 'provider-e7', source: 'anilist', unitNumber: 7, date: '2026-08-22T13:00:00.000Z', precision: 'timestamp' },
      ],
    });

    expect(deriveEntertainmentCalendarEvents([legacyOnly], now)).toHaveLength(1);
    expect(deriveEntertainmentCalendarEvents([distinctEpisodes], now)).toHaveLength(2);
  });

  it('deduplicates matching TMDB date-only history and legacy metadata', () => {
    const item = baseItem({
      type: 'series',
      catalogProvider: 'tmdb',
      nextEpisodeNumber: 2,
      nextEpisodeDate: '2026-08-24',
      releaseHistory: [
        { id: 'tmdb-show-s1-e2', source: 'tmdb', seasonNumber: 1, unitNumber: 2, date: '2026-08-24', precision: 'date' },
      ],
    });

    expect(deriveEntertainmentCalendarEvents([item], new Date(2026, 7, 20, 10, 0, 0))).toMatchObject([
      { id: 'tmdb-show-s1-e2', precision: 'date', dateKey: '2026-08-24' },
    ]);
  });

  it('keeps same-date releases when their logical units differ', () => {
    const item = baseItem({
      type: 'anime',
      catalogProvider: 'anilist',
      nextEpisodeNumber: 8,
      nextEpisodeAt: new Date('2026-08-23T13:00:00.000Z'),
      releaseHistory: [
        { id: 'provider-e7', source: 'anilist', unitNumber: 7, date: '2026-08-23T13:00:00.000Z', precision: 'timestamp' },
      ],
    });

    expect(deriveEntertainmentCalendarEvents([item], new Date(2026, 7, 20, 10, 0, 0))).toHaveLength(2);
  });

  it('formats calendar metadata without duplicate unit text', () => {
    const exact = calendarEvent('event-7', 'Black Torch', new Date(2026, 7, 22, 21, 0, 0));
    const dateOnly = calendarEvent('event-8', 'Other Show', new Date(2026, 7, 22), 'date');

    expect(formatCalendarEventMeta(exact)).toContain('Airs');
    expect(formatCalendarEventMeta(exact)).toMatch(/Episode 7.*Airs [0-9]{1,2}:00/);
    expect(formatCalendarCellDetail(exact)).toMatch(/^[0-9]{1,2}:00/);
    expect(formatCalendarEventMeta(dateOnly)).toBe('Episode 8');
    expect(formatCalendarCellDetail(dateOnly)).toBe('Episode 8');
    expect(formatCalendarEventMeta(dateOnly)).not.toContain('Episode 8 · Episode 8');
  });

  it('keeps the first two ordered events for cell previews and reports the remainder', () => {
    const events = [
      calendarEvent('event-1', 'First', new Date(2026, 7, 22, 18, 0, 0)),
      calendarEvent('event-2', 'Second', new Date(2026, 7, 22, 19, 0, 0)),
      calendarEvent('event-3', 'Third', new Date(2026, 7, 22, 20, 0, 0)),
      calendarEvent('event-4', 'Fourth', new Date(2026, 7, 22, 21, 0, 0)),
      calendarEvent('event-5', 'Fifth', new Date(2026, 7, 22, 22, 0, 0)),
    ];

    const previews = getCalendarCellPreviews(events);
    expect(previews.visible.map(event => event.item.id)).toEqual(['event-1', 'event-2']);
    expect(previews.remaining).toBe(3);

    const singlePreview = getCalendarCellPreviews(events, 1);
    expect(singlePreview.visible.map(event => event.item.id)).toEqual(['event-1']);
    expect(singlePreview.remaining).toBe(4);
  });

  it('keeps the final navigation and the Week-primary calendar surface', () => {
    const section = source('components/sections/EntertainmentSection.tsx');
    const calendar = source('components/entertainment/EntertainmentCalendar.tsx');

    expect(section).toContain("useState<MainTab>('library')");
    expect(section.indexOf("['library', 'My Library']")).toBeLessThan(section.indexOf("['updates',"));
    expect(section.indexOf("['updates',")).toBeLessThan(section.indexOf("['calendar', 'Calendar']"));
    expect(section.indexOf("['calendar', 'Calendar']")).toBeLessThan(section.indexOf("['discover', 'Discover']"));
    expect(section).toContain('overflow-x-auto');
    expect(section).toContain('formatMediaAvailability');
    expect(section).not.toContain("'upNext'");
    expect(section).not.toContain("'releases'");
    expect(calendar).toContain("from '@/components/ui/calendar'");
    expect(calendar).toContain("from '@/components/native/AndroidMonthGrid'");
    expect(calendar).toContain('lifehub-preferences:' + '$' + '{profileId}');
    expect(calendar).toContain('hideNavigation');
    expect(calendar).toContain("month_caption: 'sr-only'");
    expect(calendar).toContain("useState<CalendarView>('week')");
    expect(calendar).toContain("setView('month')");
    expect(calendar).toContain('onDayClick={handleMonthDateSelection}');
    expect(calendar).not.toContain("if (eventsByDate.has(key)) setView('week')");
    expect(calendar).toContain('caizen-entertainment-calendar__month-body');
    expect(calendar).toContain('Week');
    expect(calendar).toContain('Month');
    expect(calendar).toContain('caizen-entertainment-week-grid');
    expect(calendar).toContain('getCalendarCellPreviews(events, 3)');
    expect(calendar).toContain('caizen-entertainment-selected-agenda');
    expect(calendar).toContain('Your release schedule for the week.');
    expect(calendar).toContain('A quick look at release days.');
    expect(calendar).toContain('No known releases this month.');
    expect(calendar).toContain('Choose a highlighted date to see releases.');
    expect(calendar).toContain('Nothing scheduled for this day.');
    expect(calendar).not.toContain('caizen-entertainment-calendar-day__poster-cue');
    expect(calendar).not.toContain('caizen-entertainment-calendar-day__poster-stack');
    expect(calendar).not.toContain('backgroundImage');
    expect(calendar).not.toContain('Watch');
    expect(calendar).not.toContain('max-w-md');

    const styles = source('app/globals.css');
    expect(styles).toContain('.caizen-entertainment-week-grid');
    expect(styles).toContain('.caizen-entertainment-month-day__marker');
    expect(styles).toContain('--caizen-entertainment-calendar-blue');
    expect(styles).toContain('.caizen-entertainment-week-day.has-releases');
    expect(styles).toContain('background: var(--card);');
    expect(styles).toContain('grid-template-columns: minmax(0, 2.05fr) minmax(18rem, 1fr);');
    const calendarStyles = styles.slice(styles.indexOf('/* Entertainment release calendar'));
    expect(calendarStyles).not.toMatch(/\b(?:red|brown|maroon|amber)\b/i);
    expect(styles).toContain('@media (min-width: 64rem)');
    expect(styles).toContain('overflow-y: auto;');
    expect(existsSync(resolve(process.cwd(), 'components/entertainment/EntertainmentUpNext.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'components/entertainment/EntertainmentReleases.tsx'))).toBe(false);
  });

  it('keeps Catch up in the Library without coupling it to update acknowledgement', () => {
    const section = source('components/sections/EntertainmentSection.tsx');
    const progress = source('lib/entertainment/progress.ts');
    const settings = source('components/settings/SettingsHub.tsx');

    expect(section).toContain('catchUpMediaProgress');
    expect(section).toContain('onCatchUp={() => catchUpProgress(item)}');
    expect(section).toContain('Catch up');
    expect(section).not.toContain('Anime and manga metadata is provided by AniList');
    expect(section).not.toContain('This product uses the TMDB API');
    expect(progress).toContain('Sets active episodic progress to the latest provider-confirmed available unit');
    expect(settings).toContain('Data sources');
    expect(settings).toContain('This product uses the TMDB API but is not endorsed or certified by TMDB.');
  });

  it('uses compact semantic filter controls', () => {
    const section = source('components/sections/EntertainmentSection.tsx');

    expect(section).toContain('caizen-entertainment-library-toolbar');
    expect(section).toContain('<FilterBar label="Entertainment status filters">');
    expect(section).toContain('selected={statusFilter === option.value}');
    expect(section).toContain('onSelectedChange={() => setStatusFilter(option.value)}');
    expect(section).toContain('<AndroidAdaptiveSelect label="Type" value={typeFilter}');
    expect(section).toContain('onChange={value => setTypeFilter(value as TypeFilter)}');
    expect(section).not.toContain('bg-foreground text-background');
  });
});
