import { describe, expect, it } from 'vitest';
import {
  getNextRecurringNotificationDate,
  getImportantDateReminderTarget,
  reconcileNotifications,
  shiftForQuietHours,
  stableNotificationId,
} from '@/lib/native/notifications';
import { applyQuietHours, DEFAULT_NOTIFICATION_SETTINGS } from '@/lib/native/notification-settings';
import { createCalendarReview } from '@/lib/native/calendar';

describe('native integration utilities', () => {
  it('creates stable positive notification IDs without simple collisions', () => {
    const first = stableNotificationId('profile-a', 'task-1', 'task');
    expect(first).toBe(stableNotificationId('profile-a', 'task-1', 'task'));
    expect(first).toBeGreaterThan(0);
    expect(first).not.toBe(stableNotificationId('profile-a', 'task-2', 'task'));
    // Different reminder kinds for the same record must not collide, since a
    // routine can have one scheduled id per weekday salt.
    expect(first).not.toBe(stableNotificationId('profile-a', 'task-1', 'routine:1'));
  });

  it('leaves a reminder time untouched when it falls outside quiet hours', () => {
    const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' };
    const at = new Date('2026-08-01T12:00:00');
    expect(applyQuietHours(at, settings).getTime()).toBe(at.getTime());
  });

  it('pushes a reminder scheduled inside quiet hours to the end of the window', () => {
    const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' };
    const at = new Date('2026-08-01T23:30:00');
    const shifted = applyQuietHours(at, settings);
    expect(shifted.getHours()).toBe(7);
    expect(shifted.getMinutes()).toBe(0);
    expect(shifted.getTime()).toBeGreaterThan(at.getTime());
  });

  it('preserves the next-day weekday when recurring reminders cross overnight quiet hours', () => {
    const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' };
    const shifted = shiftForQuietHours(23, 30, settings, new Date('2026-08-01T12:00:00'));
    expect(shifted).toEqual({ hour: 7, minute: 0, dayOffset: 1 });
  });

  it('preserves quiet-hour day shifts at a month boundary', () => {
    const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' };
    const shifted = shiftForQuietHours(23, 30, settings, new Date(2026, 0, 31, 12));
    expect(shifted).toEqual({ hour: 7, minute: 0, dayOffset: 1 });
  });

  it('clamps recurring leap-day notifications and respects the start date', () => {
    const item = {
      id: 'date-1',
      title: 'Leap day',
      type: 'personal',
      date: new Date(2028, 1, 29, 12),
      repeat: 'yearly',
      status: 'upcoming',
    } as any;
    expect(getNextRecurringNotificationDate(item, 9, 0, new Date(2029, 0, 1, 8))).toEqual(
      new Date(2029, 1, 28, 9),
    );
  });

  it('reconciliation is a safe no-op outside the installed Android app', async () => {
    await expect(
      reconcileNotifications([], 'profile-a', DEFAULT_NOTIFICATION_SETTINGS),
    ).resolves.toBeUndefined();
  });

  it('keeps Work Hub reminder taps in Work Hub while preserving Life Hub routing', () => {
    const profile = { id: 'profile-1' } as any;
    expect(getImportantDateReminderTarget(profile, {
      id: 'work-event-1',
      title: 'Release review',
      type: 'meeting',
      projectId: 'project-1',
    } as any)).toMatchObject({ section: 'workhub', kind: 'calendar' });
    expect(getImportantDateReminderTarget(profile, {
      id: 'life-event-1',
      title: 'Birthday',
      type: 'personal',
    } as any)).toMatchObject({ section: 'lifehub', kind: 'calendar' });
  });

  it('normalizes calendar payloads and excludes unspecified sensitive fields', () => {
    const event = createCalendarReview({
      title: '  Bill due  ',
      startAt: '2026-08-01T09:00:00+08:00',
    });
    expect(event.title).toBe('Bill due');
    expect(event.description).toBeUndefined();
    expect(event.startAt).toBe('2026-08-01T01:00:00.000Z');
  });

  it('rejects invalid calendar events', () => {
    expect(() => createCalendarReview({ title: '', startAt: 'invalid' })).toThrow();
  });
});
