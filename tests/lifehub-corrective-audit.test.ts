import { describe, expect, it } from 'vitest';

import {
  isActionableCalendarDate,
  type LifeHubCalendarEvent,
} from '@/lib/lifehub/calendar-events';
import {
  getMonthGrid,
  toLocalDateKey,
} from '@/lib/lifehub/date-utils';

const event = (patch: Partial<LifeHubCalendarEvent> = {}): LifeHubCalendarEvent => ({
  id: 'event-1',
  recordId: 'record-1',
  title: 'Calendar item',
  date: new Date(2026, 7, 19, 12),
  type: 'personal',
  source: 'date',
  section: 'dates',
  priority: 'none',
  ...patch,
});

describe('Life Hub corrective calendar boundaries', () => {
  it('allows resolution only for actionable tracked date types', () => {
    expect(isActionableCalendarDate(event({ type: 'bill', trackAsOverdue: true }))).toBe(true);
    expect(isActionableCalendarDate(event({ type: 'deadline', trackAsOverdue: true }))).toBe(true);
    expect(isActionableCalendarDate(event({ type: 'birthday', trackAsOverdue: true }))).toBe(false);
    expect(isActionableCalendarDate(event({ type: 'personal', trackAsOverdue: false }))).toBe(false);
    expect(isActionableCalendarDate(event({ type: 'office', trackAsOverdue: true, section: 'work' }))).toBe(false);
    expect(isActionableCalendarDate(event({ type: 'bill', trackAsOverdue: true, virtual: true }))).toBe(true);
    expect(isActionableCalendarDate(event({ type: 'bill', trackAsOverdue: true, virtual: true, section: 'history' }))).toBe(false);
    expect(isActionableCalendarDate(event({ source: 'task', type: 'task deadline', trackAsOverdue: true }))).toBe(false);
  });

  it('supports Sunday-first and Monday-first month grids without changing dates', () => {
    const month = new Date(2026, 7, 1, 12);
    const sundayFirst = getMonthGrid(month, 0);
    const mondayFirst = getMonthGrid(month, 1);

    expect(toLocalDateKey(sundayFirst[0])).toBe('2026-07-26');
    expect(toLocalDateKey(mondayFirst[0])).toBe('2026-07-27');
    expect(sundayFirst).toHaveLength(42);
    expect(mondayFirst).toHaveLength(42);
    expect(
      sundayFirst.filter(date => date.getMonth() === 7).map(toLocalDateKey),
    ).toEqual(mondayFirst.filter(date => date.getMonth() === 7).map(toLocalDateKey));
  });
});
