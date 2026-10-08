import { describe, expect, it } from 'vitest';

import {
  getRoutineAttentionSummary,
  getRoutineCompletionCount,
  getNextRoutineDueDate,
  getRoutineFilter,
  getRoutineOccurrence,
  getRoutinePendingItemsForDate,
  getRoutineScheduleIndicator,
  getRoutineStatusForDate,
  getRoutineUrgencyState,
  isRoutineDoneForDate,
  isRoutineDueForDate,
  isRoutineSkippedForDate,
  recoverSkippedRoutineOccurrence,
  routineMatchesFilter,
} from '@/lib/lifehub/routine-schedule';
import type { DailyChecklistItem } from '@/lib/types';

const routine = (patch: Partial<DailyChecklistItem> = {}): DailyChecklistItem => ({
  id: 'routine-1',
  title: 'Routine',
  frequency: 'daily',
  active: true,
  createdAt: new Date(2026, 0, 1, 12),
  completionHistory: [],
  ...patch,
});

describe('routine schedule filters and indicators', () => {
  it('groups selected weekdays and specific weekdays under Daily', () => {
    expect(routineMatchesFilter(routine({ frequency: 'weekdays' }), 'daily')).toBe(true);
    expect(routineMatchesFilter(routine({ frequency: 'specific_weekday' }), 'daily')).toBe(true);
    expect(routineMatchesFilter(routine({ frequency: 'every_x_days' }), 'daily')).toBe(false);
    expect(routineMatchesFilter(routine({ frequency: 'every_x_days' }), 'all')).toBe(true);
  });

  it('normalizes every supported widget frequency and malformed values safely', () => {
    expect(getRoutineFilter(routine({ frequency: 'daily' }))).toBe('daily');
    expect(getRoutineFilter(routine({ frequency: 'weekdays' }))).toBe('daily');
    expect(getRoutineFilter(routine({ frequency: 'specific_weekday' }))).toBe('daily');
    expect(getRoutineFilter(routine({ frequency: 'weekly' }))).toBe('weekly');
    expect(getRoutineFilter(routine({ frequency: 'biweekly' }))).toBe('biweekly');
    expect(getRoutineFilter(routine({ frequency: 'monthly' }))).toBe('monthly');
    expect(getRoutineFilter(routine({ frequency: 'every_x_days' }))).toBe('other');
    expect(getRoutineFilter(routine({ frequency: 'not-a-frequency' as never }))).toBe('daily');
  });

  it('renders the current Monday-first week with non-color status labels', () => {
    const displayed = new Date(2026, 7, 6, 12);
    const markers = getRoutineScheduleIndicator(
      routine({
        frequency: 'weekdays',
        weekdays: [1, 3],
        completionHistory: [{ date: '2026-08-03', status: 'done' }],
      }),
      displayed,
      displayed,
    );

    expect(markers.map(item => item.label)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(markers[0].state).toBe('completed');
    expect(markers[1].state).toBe('not-scheduled');
    expect(markers[2].state).toBe('missed');
    expect(markers[4].state).toBe('not-scheduled');
    expect(markers[0].accessibleLabel).toContain('completed');
  });

  it('shows a fifth weekly period only for months with a day 29', () => {
    expect(getRoutineScheduleIndicator(routine({ frequency: 'weekly' }), new Date(2026, 1, 10), new Date(2026, 1, 10))).toHaveLength(4);
    expect(getRoutineScheduleIndicator(routine({ frequency: 'weekly' }), new Date(2028, 1, 10), new Date(2028, 1, 10))).toHaveLength(5);
  });

  it('uses the anchor parity so only one adjacent biweekly period is scheduled', () => {
    const markers = getRoutineScheduleIndicator(
      routine({ frequency: 'biweekly', anchorDate: new Date(2026, 7, 3, 12) }),
      new Date(2026, 7, 6, 12),
      new Date(2026, 7, 6, 12),
    );
    expect(markers.filter(item => item.state === 'not-scheduled')).toHaveLength(1);
    expect(markers.filter(item => item.state !== 'not-scheduled')).toHaveLength(1);
  });

  it('schedules every-X-day routines only on interval dates', () => {
    const item = routine({
      frequency: 'every_x_days',
      anchorDate: new Date(2026, 7, 1, 12),
      intervalDays: 3,
    });

    expect(isRoutineDueForDate(item, new Date(2026, 7, 1, 12))).toBe(true);
    expect(isRoutineDueForDate(item, new Date(2026, 7, 2, 12))).toBe(false);
    expect(isRoutineDueForDate(item, new Date(2026, 7, 4, 12))).toBe(true);
    expect(isRoutineDueForDate(item, new Date(2026, 6, 31, 12))).toBe(false);
    expect(getNextRoutineDueDate(item, new Date(2026, 7, 2, 12))).toEqual(new Date(2026, 7, 4));
  });

  it('clamps monthly routines to the last day of short months', () => {
    const item = routine({
      frequency: 'monthly',
      anchorDate: new Date(2028, 0, 31, 12),
      dayOfMonth: 31,
    });

    expect(isRoutineDueForDate(item, new Date(2028, 1, 29, 12))).toBe(true);
    expect(isRoutineDueForDate(item, new Date(2028, 1, 28, 12))).toBe(false);
    expect(isRoutineDueForDate(item, new Date(2028, 2, 31, 12))).toBe(true);
  });

  it('respects start boundaries for monthly routines and completion state', () => {
    const item = routine({
      frequency: 'monthly',
      anchorDate: new Date(2026, 7, 15, 12),
      dayOfMonth: 15,
      completionHistory: [{ date: '2026-08-15', status: 'done' }],
    });

    expect(isRoutineDueForDate(item, new Date(2026, 6, 15, 12))).toBe(false);
    expect(isRoutineDoneForDate(item, new Date(2026, 6, 15, 12))).toBe(false);
    expect(isRoutineDoneForDate(item, new Date(2026, 7, 15, 12))).toBe(true);
  });

  it('does not expose paused routines as due', () => {
    const item = routine({ active: false });
    expect(isRoutineDueForDate(item, new Date(2026, 0, 2, 12))).toBe(false);
  });

  it('recovers a skipped occurrence without marking it complete', () => {
    const date = new Date(2026, 7, 6, 12);
    const item = routine({
      completionCount: 2,
      completionHistory: [
        { date: '2026-08-05', periodKey: 'day:2026-08-05', status: 'done' },
        { date: '2026-08-06', periodKey: 'day:2026-08-06', status: 'skipped' },
      ],
    });

    const recovered = recoverSkippedRoutineOccurrence(item, date);

    expect(getRoutineOccurrence(recovered, date)).toBeUndefined();
    expect(isRoutineSkippedForDate(recovered, date)).toBe(false);
    expect(getRoutineStatusForDate(recovered, date)).toBe('pending');
    expect(recovered.completionHistory).toHaveLength(1);
    expect(recovered.completionHistory?.[0].status).toBe('done');
    expect(recovered.completionCount).toBe(2);
  });

  it('supports a non-destructive current-progress baseline', () => {
    const item = routine({
      completionCount: 4,
      completionHistory: [
        { date: '2026-08-04', status: 'done' },
        { date: '2026-08-05', status: 'skipped' },
        { date: '2026-08-20', status: 'done' },
      ],
      progressBaselineDate: new Date(2026, 7, 20, 12),
    });

    expect(getRoutineCompletionCount(item)).toBe(1);
    expect(item.completionCount).toBe(4);
    expect(item.completionHistory).toHaveLength(3);
    expect(isRoutineSkippedForDate(item, new Date(2026, 7, 5, 12))).toBe(true);
    expect(isRoutineDoneForDate(item, new Date(2026, 7, 4, 12))).toBe(true);
  });

  it('keeps recovery idempotent after the undo window or a repeated recovery', () => {
    const date = new Date(2026, 7, 6, 12);
    const item = routine({
      completionHistory: [{ date: '2026-08-06', status: 'skipped' }],
    });

    const recovered = recoverSkippedRoutineOccurrence(item, date);
    expect(recoverSkippedRoutineOccurrence(recovered, date)).toBe(recovered);
    expect(recovered.completionHistory).toEqual([]);
  });

  it('only changes the selected profile record when profiles share a routine id', () => {
    const date = new Date(2026, 7, 6, 12);
    const profileA = routine({
      completionHistory: [{ date: '2026-08-06', status: 'skipped' }],
    });
    const profileB = routine({
      completionHistory: [{ date: '2026-08-06', status: 'skipped' }],
    });

    const nextProfileA = recoverSkippedRoutineOccurrence(profileA, date);

    expect(isRoutineSkippedForDate(nextProfileA, date)).toBe(false);
    expect(isRoutineSkippedForDate(profileB, date)).toBe(true);
  });
});

describe('routine urgency presentation', () => {
  const today = new Date(2026, 7, 19, 10, 0, 0, 0);

  it('marks a timed pending routine at risk only after its scheduled time', () => {
    expect(getRoutineUrgencyState(routine({ scheduledTime: '09:30' }), today, today)).toBe('at-risk');
    expect(getRoutineUrgencyState(routine({ scheduledTime: '10:30' }), today, today)).toBe('normal');
    expect(getRoutineUrgencyState(routine({ scheduledTime: '10:00' }), today, today)).toBe('normal');
  });

  it('keeps untimed pending routines normal and includes them in today attention counts', () => {
    const untimed = routine({ id: 'untimed' });
    const timed = routine({ id: 'timed', scheduledTime: '09:00' });
    const pending = getRoutinePendingItemsForDate([untimed, timed], today, today);
    const summary = getRoutineAttentionSummary([untimed, timed], today);

    expect(pending.map(item => item.id)).toEqual(['untimed', 'timed']);
    expect(summary).toEqual({
      pendingCount: 2,
      atRiskCount: 1,
      remainingMessage: '2 routines still need attention today.',
      atRiskMessage: '1 routine is past the scheduled time.',
    });
  });

  it('marks a pending due occurrence missed only after its local due day passes', () => {
    const item = routine();
    expect(getRoutineUrgencyState(item, new Date(2026, 7, 18, 23, 59), today)).toBe('missed');
    expect(getRoutineUrgencyState(item, today, today)).toBe('normal');
    expect(getRoutineUrgencyState(item, new Date(2026, 7, 20, 0, 1), today)).toBe('not-due');
  });

  it('keeps skipped and paused occurrences out of missed and urgent states', () => {
    const skipped = routine({
      completionHistory: [{ date: '2026-08-18', periodKey: 'day:2026-08-18', status: 'skipped' }],
    });
    const paused = routine({ active: false });
    const pausedSkipped = routine({
      active: false,
      completionHistory: [{ date: '2026-08-18', periodKey: 'day:2026-08-18', status: 'skipped' }],
    });
    const skippedToday = routine({
      completionHistory: [{ date: '2026-08-19', periodKey: 'day:2026-08-19', status: 'skipped' }],
    });

    expect(getRoutineUrgencyState(skipped, new Date(2026, 7, 18, 12), today)).toBe('skipped');
    expect(getRoutineUrgencyState(paused, new Date(2026, 7, 18, 12), today)).toBe('paused');
    expect(getRoutineUrgencyState(pausedSkipped, new Date(2026, 7, 18, 12), today)).toBe('skipped');
    expect(getRoutineAttentionSummary([skippedToday, paused], today).pendingCount).toBe(0);
  });

  it('keeps future due dates neutral rather than at risk', () => {
    expect(getRoutineUrgencyState(routine(), new Date(2026, 7, 20, 12), today)).toBe('not-due');
  });

  it('preserves due behavior across every supported recurrence type', () => {
    const cases: Array<[DailyChecklistItem['frequency'], Partial<DailyChecklistItem>]> = [
      ['daily', {}],
      ['weekdays', { weekdays: [3] }],
      ['specific_weekday', { weekday: 'Wednesday' }],
      ['weekly', {}],
      ['biweekly', { anchorDate: new Date(2026, 7, 5, 12) }],
      ['monthly', { anchorDate: new Date(2026, 0, 19, 12), dayOfMonth: 19 }],
      ['every_x_days', { anchorDate: new Date(2026, 7, 1, 12), intervalDays: 3 }],
    ];

    for (const [frequency, patch] of cases) {
      const item = routine({ frequency, ...patch });
      expect(isRoutineDueForDate(item, today), frequency).toBe(true);
      expect(getRoutineUrgencyState(item, today, today), frequency).toBe('normal');
    }
  });

  it('uses local date and time boundaries for midnight transitions', () => {
    const justAfterMidnight = new Date(2026, 7, 19, 0, 1);
    const midnightRoutine = routine({ scheduledTime: '00:00' });
    expect(getRoutineUrgencyState(midnightRoutine, justAfterMidnight, justAfterMidnight)).toBe('at-risk');
    expect(getRoutineUrgencyState(midnightRoutine, new Date(2026, 7, 18, 23, 59), justAfterMidnight)).toBe('missed');
  });

  it('surfaces derived missed and at-risk states in the compact schedule markers', () => {
    const markers = getRoutineScheduleIndicator(
      routine({ scheduledTime: '09:00' }),
      today,
      today,
    );

    expect(markers[0].state).toBe('missed');
    expect(markers[2].state).toBe('at-risk');
  });
});
