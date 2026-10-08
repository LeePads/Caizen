import { describe, expect, it } from 'vitest';

import {
  addCalendarMonths,
  getCalendarGridDestination,
} from '@/hooks/use-calendar-grid-navigation';
import {
  getAgendaGroups,
  type LifeHubCalendarEvent,
} from '@/lib/lifehub/calendar-events';
import { toLocalDateKey } from '@/lib/lifehub/date-utils';

const key = (date: Date | null) => date ? toLocalDateKey(date) : null;

const event = (id: string, date: Date): LifeHubCalendarEvent => ({
  id,
  recordId: id,
  title: id,
  date,
  type: 'deadline',
  source: 'date',
  section: 'dates',
  priority: 'normal',
});

describe('Life Hub month grid navigation', () => {
  const date = new Date(2026, 7, 19, 12);

  it('moves by local calendar day for every arrow direction', () => {
    expect(key(getCalendarGridDestination(date, 'ArrowLeft', 0))).toBe('2026-08-18');
    expect(key(getCalendarGridDestination(date, 'ArrowRight', 0))).toBe('2026-08-20');
    expect(key(getCalendarGridDestination(date, 'ArrowUp', 0))).toBe('2026-08-12');
    expect(key(getCalendarGridDestination(date, 'ArrowDown', 0))).toBe('2026-08-26');
  });

  it('moves Home and End to the configured week boundaries', () => {
    expect(key(getCalendarGridDestination(date, 'Home', 0))).toBe('2026-08-16');
    expect(key(getCalendarGridDestination(date, 'End', 0))).toBe('2026-08-22');
    expect(key(getCalendarGridDestination(date, 'Home', 1))).toBe('2026-08-17');
    expect(key(getCalendarGridDestination(date, 'End', 1))).toBe('2026-08-23');
  });

  it('clamps PageUp and PageDown at month ends across years and leap years', () => {
    expect(key(addCalendarMonths(new Date(2026, 0, 31, 12), 1))).toBe('2026-02-28');
    expect(key(addCalendarMonths(new Date(2024, 0, 31, 12), 1))).toBe('2024-02-29');
    expect(key(addCalendarMonths(new Date(2026, 0, 15, 12), -1))).toBe('2025-12-15');
    expect(key(addCalendarMonths(new Date(2026, 11, 15, 12), 1))).toBe('2027-01-15');
  });

  it('crosses adjacent months with arrow navigation', () => {
    expect(key(getCalendarGridDestination(new Date(2026, 7, 31, 12), 'ArrowRight', 0))).toBe('2026-09-01');
    expect(key(getCalendarGridDestination(new Date(2026, 7, 1, 12), 'ArrowLeft', 0))).toBe('2026-07-31');
  });
});

describe('Life Hub prioritized agenda groups', () => {
  it('orders overdue, today, tomorrow, this week, and later while deduplicating', () => {
    const now = new Date(2026, 7, 19, 12);
    const duplicate = event('today', new Date(2026, 7, 19, 12));
    const tomorrowEvening = event('tomorrow-evening', new Date(2026, 7, 20, 22));
    const groups = getAgendaGroups([
      event('later', new Date(2026, 8, 5, 12)),
      duplicate,
      event('overdue', new Date(2026, 7, 18, 12)),
      event('week', new Date(2026, 7, 23, 12)),
      event('tomorrow', new Date(2026, 7, 20, 12)),
      tomorrowEvening,
      { ...duplicate },
    ], now);

    expect(groups.map(group => group.key)).toEqual(['overdue', 'today', 'tomorrow', 'week', 'later']);
    expect(groups.flatMap(group => group.events).filter(item => item.id === 'today')).toHaveLength(1);
    expect(groups.find(group => group.key === 'tomorrow')?.events.some(item => item.id === tomorrowEvening.id)).toBe(true);
    expect(groups.find(group => group.key === 'week')?.events.some(item => item.id === tomorrowEvening.id)).toBe(false);
  });
});
