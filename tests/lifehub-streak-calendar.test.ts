import { describe, expect, it } from 'vitest';

import { buildLifeHubCalendarEvents } from '@/lib/lifehub/calendar-events';

describe('Health streak calendar projections', () => {
  it('identifies editable pause/reset records without making generated events deletable', () => {
    const events = buildLifeHubCalendarEvents({
      rangeStart: new Date(2026, 7, 1, 12),
      rangeEnd: new Date(2026, 7, 12, 12),
      filters: { health: true },
      health: {
        noXTrackers: [{
          id: 'streak-1',
          name: 'No X',
          startDate: new Date(2026, 7, 1, 12),
          createdAt: new Date(2026, 7, 1, 12),
          pauseHistory: [{
            id: 'pause-1',
            pausedAt: new Date(2026, 7, 3, 12),
            resumedAt: new Date(2026, 7, 5, 12),
          }],
          resetHistory: [{
            resetAt: new Date(2026, 7, 9, 12),
            previousStartDate: new Date(2026, 6, 1, 12),
            previousDays: 30,
          }],
        }],
      } as any,
    });

    const pauseEvents = events.filter(event => event.type === 'streak paused' || event.type === 'streak resumed');
    expect(pauseEvents).toHaveLength(2);
    expect(pauseEvents.every(event => event.streakTimelineEntry?.kind === 'pause')).toBe(true);
    expect(events.find(event => event.type === 'streak reset')?.streakTimelineEntry).toEqual({ kind: 'reset', index: 0 });
    expect(events.find(event => event.type === 'streak start')?.streakTimelineEntry).toBeUndefined();
    expect(events.filter(event => event.type.includes('milestone')).every(event => !event.streakTimelineEntry)).toBe(true);
  });

  it('does not project recurring dates before their original start date', () => {
    const events = buildLifeHubCalendarEvents({
      importantDates: [{
        id: 'date-1',
        title: 'Monthly bill',
        type: 'bill',
        date: new Date(2026, 7, 15, 12),
        repeat: 'monthly',
        priority: 'important',
        status: 'upcoming',
      } as any],
      rangeStart: new Date(2026, 6, 1, 12),
      rangeEnd: new Date(2026, 8, 30, 12),
      filters: { dates: true },
    });

    expect(events.map(event => event.date.getDate())).toEqual([15, 15]);
    expect(events.every(event => event.date >= new Date(2026, 7, 15))).toBe(true);
  });

  it('clamps recurring leap-day dates in non-leap years', () => {
    const events = buildLifeHubCalendarEvents({
      importantDates: [{
        id: 'date-2',
        title: 'Leap day',
        type: 'personal',
        date: new Date(2028, 1, 29, 12),
        repeat: 'yearly',
        priority: 'normal',
        status: 'upcoming',
      } as any],
      rangeStart: new Date(2029, 0, 1, 12),
      rangeEnd: new Date(2029, 11, 31, 12),
      filters: { dates: true },
    });

    expect(events).toHaveLength(1);
    expect(events[0].date).toEqual(new Date(2029, 1, 28, 12));
  });
});
