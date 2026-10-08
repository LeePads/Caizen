import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeNotifications = vi.hoisted(() => ({
  cancel: vi.fn<(args: NotificationCancel) => Promise<void>>(async () => undefined),
  areEnabled: vi.fn(async () => ({ value: true })),
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  createChannel: vi.fn(async () => undefined),
  getPending: vi.fn<() => Promise<NotificationSchedule>>(async () => ({ notifications: [] })),
  registerActionTypes: vi.fn(async () => undefined),
  schedule: vi.fn<(args: NotificationSchedule) => Promise<void>>(async () => undefined),
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: nativeNotifications,
}));

vi.mock('@/lib/platform', () => ({
  dispatchNativeEvent: vi.fn(),
  isNativeApp: () => true,
}));

import {
  getUpcomingMoneyReminderNotification,
  reconcileNotifications,
  stableNotificationId,
} from '@/lib/native/notifications';
import { enqueueNativeReminderRoute, takePendingNativeRoute } from '@/lib/native/startup-route-queue';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/lib/native/notification-settings';
import {
  getUpcomingMoneyReminderAt,
  normalizeUpcomingMoneyItem,
} from '@/lib/upcoming-money';
import { toLocalDateKey } from '@/lib/date-utils';
import type { Profile, UpcomingMoneyItem } from '@/lib/types';
import { prepareImport } from '@/lib/storage/import-integrity';

type NotificationSchema = {
  id: number;
  [key: string]: unknown;
};

type NotificationSchedule = {
  notifications: NotificationSchema[];
};

type NotificationCancel = {
  notifications: Array<{ id: number }>;
};

const futureDateKey = (days = 5) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
};

const profile = (id: string, item?: UpcomingMoneyItem): Profile => ({
  id,
  name: id,
  wallets: [],
  transactions: [],
  inventoryItems: [],
  wishlistItems: [],
  upcomingMoneyItems: item ? [item] : [],
  journalEntries: [],
  games: [],
  gameGuides: [],
  productivityItems: [],
  mediaItems: [],
  musicItems: [],
  workItems: [],
  personalVaultItems: [],
  trashItems: [],
  skincareProducts: [],
  dailyChecklistItems: [],
  importantDates: [],
  supplements: [],
  health: {} as Profile['health'],
  createdAt: new Date(),
});

const moneyItem = (overrides: Partial<UpcomingMoneyItem> = {}) =>
  normalizeUpcomingMoneyItem({
    id: 'money-1',
    title: 'Rent',
    direction: 'outgoing',
    amount: 1000,
    recordedAmount: 0,
    status: 'planned',
    dueDate: new Date(`${futureDateKey()}T00:00:00`),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

const settings = {
  ...DEFAULT_NOTIFICATION_SETTINGS,
  masterEnabled: true,
  categories: {
    ...DEFAULT_NOTIFICATION_SETTINGS.categories,
    deadlines: true,
    summary: false,
  },
};

describe('BM-P2-03 manual Money reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeNotifications.checkPermissions.mockResolvedValue({ display: 'granted' });
    nativeNotifications.getPending.mockResolvedValue({ notifications: [] });
  });

  it('does not infer a reminder from a due date or other Money metadata', () => {
    const normalized = moneyItem({
      dueDate: new Date(`${futureDateKey(10)}T00:00:00`),
      reminderEnabled: undefined,
    });

    expect(normalized.reminderEnabled).toBe(false);
    expect(normalized.reminderDate).toBeUndefined();
    expect(normalized.reminderTime).toBeUndefined();
    expect(getUpcomingMoneyReminderNotification(profile('profile-a', normalized), normalized, settings)).toBeNull();
  });

  it('preserves explicit local date/time and rejects incomplete legacy flags', () => {
    const explicit = moneyItem({
      reminderEnabled: true,
      reminderDate: futureDateKey(8),
      reminderTime: '09:00',
    });
    const at = getUpcomingMoneyReminderAt(explicit.reminderDate, explicit.reminderTime);

    expect(explicit.reminderEnabled).toBe(true);
    expect(explicit.reminderDate).toBe(futureDateKey(8));
    expect(explicit.reminderTime).toBe('09:00');
    expect(at?.getFullYear()).toBe(new Date(`${futureDateKey(8)}T12:00:00`).getFullYear());
    expect(at?.getHours()).toBe(9);

    const incompleteLegacy = moneyItem({ reminderEnabled: true });
    expect(incompleteLegacy.reminderEnabled).toBe(false);
    expect(incompleteLegacy.reminderDate).toBeUndefined();
    expect(incompleteLegacy.reminderTime).toBeUndefined();

    const malformed = moneyItem({
      reminderEnabled: true,
      reminderDate: '2026-02-30',
      reminderTime: '25:90',
    });
    expect(malformed.reminderEnabled).toBe(false);
  });

  it('normalizes imported legacy and malformed reminder state without blocking valid Money data', () => {
    const prepared = prepareImport({
      profiles: [{
        id: 'profile-a',
        name: 'Profile A',
        upcomingMoneyItems: [{
          id: 'money-1',
          title: 'Rent',
          direction: 'outgoing',
          amount: 1000,
          recordedAmount: 0,
          status: 'planned',
          dueDate: futureDateKey(10),
          reminderEnabled: true,
          reminderDate: futureDateKey(8),
          reminderTime: 'not-a-time',
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        health: {},
      }],
      currentProfileId: 'profile-a',
    });
    const imported = prepared.state.profiles[0].upcomingMoneyItems[0];

    expect(prepared.report.canImport).toBe(true);
    expect(imported.reminderEnabled).toBe(false);
    expect(imported.reminderDate).toBeUndefined();
    expect(imported.reminderTime).toBeUndefined();

    const validPrepared = prepareImport({
      profiles: [{
        id: 'profile-a',
        name: 'Profile A',
        upcomingMoneyItems: [{
          id: 'money-2',
          title: 'Insurance',
          direction: 'outgoing',
          amount: 123.45,
          recordedAmount: 0,
          status: 'planned',
          dueDate: futureDateKey(12),
          reminderEnabled: true,
          reminderDate: futureDateKey(9),
          reminderTime: '18:20',
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        health: {},
      }],
      currentProfileId: 'profile-a',
    });
    const validImported = validPrepared.state.profiles[0].upcomingMoneyItems[0];

    expect(validPrepared.report.canImport).toBe(true);
    expect(validImported.reminderEnabled).toBe(true);
    expect(validImported.reminderDate).toBe(futureDateKey(9));
    expect(validImported.reminderTime).toBe('18:20');
  });

  it('builds one stable exact Balance target for an explicit reminder', () => {
    const item = moneyItem({
      reminderEnabled: true,
      reminderDate: futureDateKey(6),
      reminderTime: '09:15',
    });
    const notification = getUpcomingMoneyReminderNotification(profile('profile-a', item), item, settings);

    expect(notification).toMatchObject({
      id: stableNotificationId('profile-a', item.id, 'money'),
      extra: {
        profileId: 'profile-a',
        recordId: item.id,
        section: 'balance',
        kind: 'deadline',
      },
    });
    expect(notification?.schedule).toMatchObject({ allowWhileIdle: true });
    expect((notification?.schedule as { at: Date }).at.getHours()).toBe(9);
    expect(getUpcomingMoneyReminderNotification(profile('profile-a', {
      ...item,
      status: 'paid',
    }), { ...item, status: 'paid' }, settings)).toBeNull();
  });

  it('reconciles create, repeat-save, reschedule, disable, and profile removal without duplicates', async () => {
    const item = moneyItem({
      reminderEnabled: true,
      reminderDate: futureDateKey(7),
      reminderTime: '09:30',
    });
    const firstProfile = profile('profile-a', item);

    await reconcileNotifications([firstProfile], firstProfile.id, settings);
    expect(nativeNotifications.schedule).toHaveBeenCalledTimes(1);
    const firstSchema = nativeNotifications.schedule.mock.calls[0]![0].notifications[0]!;
    const firstId = firstSchema.id;

    nativeNotifications.schedule.mockClear();
    nativeNotifications.getPending.mockResolvedValue({ notifications: [firstSchema] });
    await reconcileNotifications([firstProfile], firstProfile.id, settings);
    expect(nativeNotifications.schedule).not.toHaveBeenCalled();
    expect(nativeNotifications.cancel).not.toHaveBeenCalled();

    const rescheduledProfile = profile('profile-a', {
      ...item,
      reminderTime: '10:00',
    });
    await reconcileNotifications([rescheduledProfile], rescheduledProfile.id, settings);
    expect(nativeNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: firstId }] });
    expect(nativeNotifications.schedule).toHaveBeenCalledTimes(1);
    expect(nativeNotifications.schedule.mock.calls[0][0].notifications[0].id).toBe(firstId);

    nativeNotifications.cancel.mockClear();
    nativeNotifications.schedule.mockClear();
    nativeNotifications.getPending.mockResolvedValue({ notifications: [firstSchema] });
    await reconcileNotifications([profile('profile-a')], 'profile-a', settings);
    expect(nativeNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: firstId }] });
    expect(nativeNotifications.schedule).not.toHaveBeenCalled();

    nativeNotifications.cancel.mockClear();
    nativeNotifications.getPending.mockResolvedValue({ notifications: [] });
    const sameIdOtherProfile = moneyItem({
      reminderEnabled: true,
      reminderDate: futureDateKey(7),
      reminderTime: '09:30',
    });
    await reconcileNotifications(
      [profile('profile-a', item), profile('profile-b', sameIdOtherProfile)],
      'profile-b',
      settings,
    );
    const ids = nativeNotifications.schedule.mock.calls[0]![0].notifications.map((entry: { id: number }) => entry.id);
    expect(ids).toEqual([
      stableNotificationId('profile-a', 'money-1', 'money'),
      stableNotificationId('profile-b', 'money-1', 'money'),
    ]);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('does not schedule while permission is denied but preserves explicit intent', async () => {
    nativeNotifications.checkPermissions.mockResolvedValue({ display: 'denied' });
    const item = moneyItem({
      reminderEnabled: true,
      reminderDate: futureDateKey(4),
      reminderTime: '08:00',
    });

    await reconcileNotifications([profile('profile-a', item)], 'profile-a', settings);

    expect(nativeNotifications.schedule).not.toHaveBeenCalled();
    expect(item.reminderEnabled).toBe(true);
    expect(item.reminderDate).toBe(futureDateKey(4));
  });

  it('routes a Money reminder to the exact Balance record', () => {
    enqueueNativeReminderRoute({
      profileId: 'profile-a',
      section: 'balance',
      recordId: 'money-1',
      kind: 'deadline',
    });

    expect(takePendingNativeRoute()).toEqual({
      profileId: 'profile-a',
      section: 'balance',
      recordId: 'money-1',
      action: 'money-item',
      source: 'notification',
    });
  });
});
