import {
  LocalNotifications,
  type Importance,
  type LocalNotificationSchema,
  type PermissionStatus,
} from '@capacitor/local-notifications';
import type {
  DailyChecklistItem,
  ImportantDateItem,
  ProductivityItem,
  Profile,
  Supplement,
  UpcomingMoneyItem,
} from '../types';
import { dispatchNativeEvent, isAndroid, isNativeApp } from '../platform';
import { CaizenNative } from './calendar';
import {
  applyQuietHours,
  type NotificationSettings,
} from './notification-settings';
import { addLocalDays, parseLocalDateKey, toLocalDateKey } from '../lifehub/date-utils';
import {
  getNextRoutineReminderDate,
  isRoutineDoneForDate,
  isRoutineDueForDate,
} from '../lifehub/routine-schedule';
import {
  getUpcomingMoneyReminderAt,
  isUpcomingMoneyComplete,
} from '../upcoming-money';

export type ReminderKind = 'task' | 'routine' | 'calendar' | 'deadline' | 'health' | 'summary';

export type ReminderTarget = {
  recordId: string;
  profileId: string;
  section: string;
  kind: ReminderKind;
  occurrenceDateKey?: string;
};

export const NOTIFICATION_RECONCILIATION_ERROR_EVENT =
  'caizen:notification-reconciliation-error';

export const CHANNELS: Record<
  ReminderKind,
  { id: string; name: string; description: string; importance: Importance }
> = {
  task: {
    id: 'caizen-tasks',
    name: 'Caizen Tasks',
    description: 'Reminders for tasks you have scheduled',
    importance: 3,
  },
  routine: {
    id: 'caizen-routines',
    name: 'Caizen Routines',
    description: 'Reminders for your daily and weekly routines',
    importance: 3,
  },
  calendar: {
    id: 'caizen-calendar',
    name: 'Caizen Calendar',
    description: 'Reminders for upcoming calendar events',
    importance: 3,
  },
  health: {
    id: 'caizen-health',
    name: 'Caizen Health',
    description: 'Supplement and health reminders',
    importance: 3,
  },
  deadline: {
    id: 'caizen-deadlines',
    name: 'Caizen Deadlines',
    description: 'Deadline, planned money and subscription reminders',
    importance: 4,
  },
  summary: {
    id: 'caizen-summary',
    name: 'Caizen Summary',
    description: 'An optional daily summary of what needs attention',
    importance: 2,
  },
};

const ACTION_TYPE_ID = 'caizen-reminder';

/** FNV-1a hash, kept deterministic and free of Math.random so the same
 * (profile, record, salt) triple always maps to the same Android notification id. */
function hashToId(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2_000_000_000 || 1;
}

export function stableNotificationId(profileId: string, recordId: string, salt: string): number {
  return hashToId(`${profileId}:${recordId}:${salt}`);
}

export async function getNotificationPermission(): Promise<PermissionStatus> {
  if (!isNativeApp()) {
    return { display: 'Notification' in window && Notification.permission === 'granted' ? 'granted' : 'denied' };
  }
  return LocalNotifications.checkPermissions();
}

export async function getNotificationAvailability(): Promise<{
  runtimeGranted: boolean;
  appEnabled: boolean;
}> {
  if (isAndroid()) return CaizenNative.getNotificationAvailability();
  const permission = await getNotificationPermission();
  return { runtimeGranted: permission.display === 'granted', appEnabled: permission.display === 'granted' };
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) {
    if (!('Notification' in window)) return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
  return (await LocalNotifications.requestPermissions()).display === 'granted';
}

/** Call when the user explicitly turns notifications on, or creates their
 * first reminder. Never call this during app startup. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await getNotificationPermission();
  const granted = current.display === 'granted' || await requestNotificationPermission();
  return granted && (!isNativeApp() || (await LocalNotifications.areEnabled()).value);
}

const CHANNEL_SCHEMA_VERSION = 2;
const createdChannelVariants = new Set<string>();

function channelIdFor(kind: ReminderKind, vibration: boolean): string {
  return `${CHANNELS[kind].id}-v${CHANNEL_SCHEMA_VERSION}-${
    vibration ? 'vibrate' : 'silent'
  }`;
}

/**
 * Android notification-channel behavior is immutable after creation. Use a
 * versioned channel variant instead of deleting a user's existing channel,
 * which would erase their Android-level sound and importance choices.
 */
export async function ensureChannelsCreated(vibration = true): Promise<void> {
  if (!isNativeApp()) return;

  const variantKey = `${CHANNEL_SCHEMA_VERSION}:${vibration}`;
  if (createdChannelVariants.has(variantKey)) return;

  for (const [kind, channel] of Object.entries(CHANNELS) as Array<
    [ReminderKind, (typeof CHANNELS)[ReminderKind]]
  >) {
    await LocalNotifications.createChannel({
      id: channelIdFor(kind, vibration),
      name: channel.name,
      description: channel.description,
      importance: channel.importance,
      visibility: 0,
      vibration,
    });
  }

  createdChannelVariants.add(variantKey);
}

let actionsRegistered = false;
async function ensureActionsRegistered(): Promise<void> {
  if (!isNativeApp() || actionsRegistered) return;

  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: ACTION_TYPE_ID,
        actions: [
          { id: 'snooze-10', title: 'Snooze 10m' },
          { id: 'snooze-30', title: 'Snooze 30m' },
          { id: 'snooze-60', title: 'Snooze 1h' },
          { id: 'snooze-tomorrow', title: 'Tomorrow' },
        ],
      },
    ],
  });

  actionsRegistered = true;
}

const SNOOZE_MINUTES: Record<string, number | 'tomorrow'> = {
  'snooze-10': 10,
  'snooze-30': 30,
  'snooze-60': 60,
  'snooze-tomorrow': 'tomorrow',
};

async function snoozeNotification(
  id: number,
  channelId: string,
  title: string,
  body: string,
  extra: ReminderTarget,
  actionId: string,
): Promise<void> {
  const offset = SNOOZE_MINUTES[actionId];
  if (offset === undefined) return;
  const at = new Date();
  if (offset === 'tomorrow') {
    at.setDate(at.getDate() + 1);
  } else {
    at.setMinutes(at.getMinutes() + offset);
  }
  await LocalNotifications.schedule({
    notifications: [
      {
        id: stableNotificationId(
          extra.profileId,
          extra.recordId,
          `snooze:${Date.now()}:${actionId}`,
        ),
        title,
        body,
        channelId,
        extra: {
          ...extra,
          caizenSnooze: true,
          snoozedFromId: id,
        },
        actionTypeId: ACTION_TYPE_ID,
        schedule: { at, allowWhileIdle: true },
      },
    ],
  }).catch(() => undefined);
}

/**
 * Registers Android notification channels, action types, and the tap/action
 * listener. `onTarget` receives the reminder target whenever the user taps
 * the notification (or its "Open" action) so the caller can handle
 * profile-switching and navigation with full app context.
 */
export async function registerNotificationActions(
  onTarget: (target: ReminderTarget) => void,
): Promise<() => Promise<void>> {
  if (!isNativeApp()) return async () => undefined;
  const listener = await LocalNotifications.addListener(
    'localNotificationActionPerformed',
    ({ actionId, notification }) => {
      const target = notification.extra as ReminderTarget | undefined;
      if (!target?.recordId || !target.profileId || !target.section) return;

      if (actionId in SNOOZE_MINUTES) {
        void snoozeNotification(
          notification.id,
          notification.channelId ?? channelIdFor(target.kind, true),
          notification.title ?? 'Caizen',
          notification.body ?? '',
          target,
          actionId,
        );
        return;
      }

      onTarget(target);
    },
  );

  try {
    await ensureChannelsCreated();
    await ensureActionsRegistered();
  } catch (error) {
    await listener.remove();
    throw error;
  }
  return () => listener.remove();
}

// ---- Reminder scheduling math -------------------------------------------------

type OnSchedule = { weekday?: number; day?: number; month?: number; hour: number; minute: number };
type Schedule =
  | { at: Date; allowWhileIdle: true }
  | { on: OnSchedule; repeats: true; allowWhileIdle: true };

interface DesiredNotification {
  id: number;
  channelId: string;
  title: string;
  body: string;
  schedule: Schedule;
  extra: ReminderTarget;
}

const GENERIC_PREVIEW: Record<ReminderKind, string> = {
  task: 'A task is due',
  routine: 'You have a routine reminder',
  calendar: 'You have an upcoming event',
  deadline: 'A deadline is coming up',
  health: 'A health reminder is due',
  summary: 'Your Caizen daily summary is ready',
};

function buildText(kind: ReminderKind, recordTitle: string | undefined, settings: NotificationSettings) {
  // Health content is always privacy-safe: supplement/health record names can
  // reveal medical information even when the general preview toggle is off.
  if (settings.privacySafePreviews || kind === 'health' || !recordTitle) {
    return { title: 'Caizen', body: GENERIC_PREVIEW[kind] };
  }
  return { title: 'Caizen', body: recordTitle.slice(0, 120) };
}

function isValidTime(value: string | undefined): value is string {
  return Boolean(value && /^\d{2}:\d{2}$/.test(value));
}

function leadMinutesFromReminderChoice(item: ImportantDateItem): number {
  switch (item.reminder) {
    case '1_day_before':
      return 1440;
    case '3_days_before':
      return 4320;
    case '1_week_before':
      return 10_080;
    case 'custom':
      return Math.max(0, item.customReminderDays ?? 1) * 1440;
    case 'same_day':
    default:
      return 0;
  }
}

export type QuietHoursShift = {
  hour: number;
  minute: number;
  dayOffset: number;
};

export function shiftForQuietHours(
  hour: number,
  minute: number,
  settings: NotificationSettings,
  referenceDate = new Date(),
): QuietHoursShift {
  const reference = new Date(referenceDate);
  reference.setHours(hour, minute, 0, 0);
  const adjusted = applyQuietHours(reference, settings);
  const startOfReference = new Date(reference);
  startOfReference.setHours(0, 0, 0, 0);
  const startOfAdjusted = new Date(adjusted);
  startOfAdjusted.setHours(0, 0, 0, 0);
  return {
    hour: adjusted.getHours(),
    minute: adjusted.getMinutes(),
    dayOffset: Math.round(
      (startOfAdjusted.getTime() - startOfReference.getTime()) / 86_400_000,
    ),
  };
}

function taskDesired(
  profile: Profile,
  item: ProductivityItem,
  settings: NotificationSettings,
): DesiredNotification | null {
  if (!item.reminderEnabled || ['completed', 'failed', 'dropped'].includes(item.status) || !item.deadline) return null;

  const [hour, minute] = isValidTime(item.reminderTime) ? item.reminderTime.split(':').map(Number) : [9, 0];
  const base = new Date(item.deadline);
  if (Number.isNaN(base.getTime())) return null;
  base.setHours(hour, minute, 0, 0);
  const lead = item.reminderLeadMinutes ?? settings.defaultLeadMinutes;
  let at: Date | null = new Date(base.getTime() - lead * 60_000);

  at = applyQuietHours(at, settings);
  if (at.getTime() <= Date.now()) return null;

  const { title, body } = buildText('task', item.title, settings);
  return {
    id: stableNotificationId(profile.id, item.id, 'task'),
    channelId: channelIdFor('task', settings.vibrationEnabled),
    title,
    body,
    schedule: { at, allowWhileIdle: true },
    extra: { profileId: profile.id, recordId: item.id, section: 'lifehub', kind: 'task' },
  };
}

function routineDesired(
  profile: Profile,
  item: DailyChecklistItem,
  settings: NotificationSettings,
): DesiredNotification[] {
  if (!item.reminderEnabled || item.active === false || !isValidTime(item.reminderTime)) return [];

  const [hour, minute] = item.reminderTime.split(':').map(Number);
  const { title, body } = buildText('routine', item.title, settings);
  const extra: ReminderTarget = {
    profileId: profile.id,
    recordId: item.id,
    section: 'lifehub',
    kind: 'routine',
  };

  // Keep a small set of exact occurrences so reminders continue when the app
  // is not opened immediately after the first one fires.
  // A reminder from yesterday can still be pending today after quiet hours
  // move its delivery past midnight.
  const searchFrom = addLocalDays(new Date(), -1);
  searchFrom.setHours(0, 0, 0, 0);
  let next = getNextRoutineReminderDate(item, searchFrom);
  const desired: DesiredNotification[] = [];
  for (let attempt = 0; attempt < 372 && next; attempt += 1) {
    const nextAt = new Date(next);
    nextAt.setHours(hour, minute, 0, 0);
    const candidate = applyQuietHours(nextAt, settings);
    if (candidate.getTime() > Date.now()) {
      const occurrenceDateKey = toLocalDateKey(next);
      desired.push({
        id: stableNotificationId(profile.id, item.id, `routine:${occurrenceDateKey}`),
        channelId: channelIdFor('routine', settings.vibrationEnabled),
        title,
        body,
        schedule: { at: candidate, allowWhileIdle: true },
        extra: { ...extra, occurrenceDateKey },
      });
      if (desired.length === 3) break;
    }
    next = getNextRoutineReminderDate(item, addLocalDays(next, 1));
  }
  return desired;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** Exact next occurrence for recurring important dates. */
export function getNextRecurringNotificationDate(
  item: ImportantDateItem,
  hour: number,
  minute: number,
  from = new Date(),
): Date | null {
  const base = new Date(item.date);
  if (Number.isNaN(base.getTime()) || (item.repeat !== 'monthly' && item.repeat !== 'yearly')) return null;

  const firstAllowed = new Date(base);
  firstAllowed.setHours(0, 0, 0, 0);
  const lastAllowed = item.endDate ? new Date(item.endDate) : null;
  if (lastAllowed) lastAllowed.setHours(23, 59, 59, 999);

  if (item.repeat === 'monthly') {
    const startMonth = Math.max(
      base.getFullYear() * 12 + base.getMonth(),
      from.getFullYear() * 12 + from.getMonth(),
    );
    for (let index = 0; index <= 240; index += 1) {
      const monthIndex = startMonth + index;
      const year = Math.floor(monthIndex / 12);
      const month = monthIndex % 12;
      const candidate = new Date(year, month, Math.min(base.getDate(), daysInMonth(year, month)), hour, minute, 0, 0);
      if (candidate < firstAllowed || (lastAllowed && candidate > lastAllowed)) continue;
      if (candidate >= from) return candidate;
    }
    return null;
  }

  const startYear = Math.max(base.getFullYear(), from.getFullYear());
  for (let year = startYear; year <= startYear + 20; year += 1) {
    const candidate = new Date(
      year,
      base.getMonth(),
      Math.min(base.getDate(), daysInMonth(year, base.getMonth())),
      hour,
      minute,
      0,
      0,
    );
    if (candidate < firstAllowed || (lastAllowed && candidate > lastAllowed)) continue;
    if (candidate >= from) return candidate;
  }
  return null;
}

export function getImportantDateReminderTarget(
  profile: Profile,
  item: ImportantDateItem,
): ReminderTarget {
  const isWorkHubItem = Boolean(item.projectId) ||
    ['office', 'work_home', 'leave', 'travel', 'holiday'].includes(item.type);
  const isDeadlineLike = item.type === 'deadline' || item.type === 'subscription' || item.type === 'renewal';
  return {
    profileId: profile.id,
    recordId: item.id,
    section: isWorkHubItem ? 'workhub' : 'lifehub',
    kind: isDeadlineLike ? 'deadline' : 'calendar',
  };
}

function importantDateDesired(
  profile: Profile,
  item: ImportantDateItem,
  settings: NotificationSettings,
): DesiredNotification[] {
  if (!item.reminderEnabled || !item.date || item.status === 'completed' || item.status === 'dismissed') return [];

  const isDeadlineLike = item.type === 'deadline' || item.type === 'subscription' || item.type === 'renewal';
  const kind: ReminderKind = isDeadlineLike ? 'deadline' : 'calendar';
  const [hour, minute] = isValidTime(item.reminderTime) ? item.reminderTime.split(':').map(Number) : [9, 0];
  const { title, body } = buildText(kind, item.title, settings);
  const channelId = channelIdFor(kind, settings.vibrationEnabled);
  const extra: ReminderTarget = getImportantDateReminderTarget(profile, item);
  const id = stableNotificationId(profile.id, item.id, 'date');
  const eventDate = new Date(item.date);

  if (item.repeat === 'none') {
    const base = new Date(eventDate);
    base.setHours(hour, minute, 0, 0);
    const lead = leadMinutesFromReminderChoice(item);
    let at = new Date(base.getTime() - lead * 60_000);
    at = applyQuietHours(at, settings);
    if (at.getTime() <= Date.now()) return [];
    return [{ id, channelId, title, body, schedule: { at, allowWhileIdle: true }, extra }];
  }

  // Monthly/yearly repeats are scheduled as the next exact occurrence. A
  // repeating Android `on` schedule cannot represent clamped short months or
  // a quiet-hours shift that crosses into the next month/year.
  const desired: DesiredNotification[] = [];
  const searchFrom = addLocalDays(new Date(), -1);
  searchFrom.setHours(0, 0, 0, 0);
  let next = getNextRecurringNotificationDate(item, hour, minute, searchFrom);
  for (let attempt = 0; attempt < 3 && next && desired.length < 2; attempt += 1) {
    const occurrenceDateKey = toLocalDateKey(next);
    const adjusted = applyQuietHours(next, settings);
    if (adjusted.getTime() > Date.now()) {
      desired.push({
        id: stableNotificationId(profile.id, item.id, `date:${occurrenceDateKey}`),
        channelId,
        title,
        body,
        schedule: { at: adjusted, allowWhileIdle: true },
        extra: { ...extra, occurrenceDateKey },
      });
    }
    next = getNextRecurringNotificationDate(item, hour, minute, new Date(next.getTime() + 1000));
  }
  return desired;
}

/** Explicit Money reminders reuse the existing deadline channel and settings. */
export function getUpcomingMoneyReminderNotification(
  profile: Profile,
  item: UpcomingMoneyItem,
  settings: NotificationSettings,
): DesiredNotification | null {
  if (
    item.reminderEnabled !== true ||
    item.archived === true ||
    isUpcomingMoneyComplete(item)
  ) {
    return null;
  }

  const at = getUpcomingMoneyReminderAt(item.reminderDate, item.reminderTime);
  if (!at) return null;

  const adjusted = applyQuietHours(new Date(at), settings);
  if (adjusted.getTime() <= Date.now()) return null;

  const { title, body } = buildText('deadline', item.title, settings);
  return {
    id: stableNotificationId(profile.id, item.id, 'money'),
    channelId: channelIdFor('deadline', settings.vibrationEnabled),
    title,
    body,
    schedule: { at: adjusted, allowWhileIdle: true },
    extra: {
      profileId: profile.id,
      recordId: item.id,
      section: 'balance',
      kind: 'deadline',
    },
  };
}

function supplementDesired(
  profile: Profile,
  item: Supplement,
  settings: NotificationSettings,
): DesiredNotification[] {
  if (!item.reminderEnabled || !isValidTime(item.reminderTime)) return [];
  const days = item.reminderDays?.length ? item.reminderDays : [0, 1, 2, 3, 4, 5, 6];
  const [hour, minute] = item.reminderTime.split(':').map(Number);
  const shifted = shiftForQuietHours(hour, minute, settings);
  const { title, body } = buildText('health', item.name, settings);

  return days.map((day) => {
    const shiftedDay = (day + shifted.dayOffset + 7) % 7;
    return {
      id: stableNotificationId(profile.id, item.id, `health:${shiftedDay}`),
      channelId: channelIdFor('health', settings.vibrationEnabled),
      title,
      body,
      schedule: {
        on: { weekday: shiftedDay + 1, hour: shifted.hour, minute: shifted.minute },
        repeats: true,
        allowWhileIdle: true,
      },
      extra: { profileId: profile.id, recordId: item.id, section: 'health', kind: 'health' },
    };
  });
}

function summaryDesired(profile: Profile, settings: NotificationSettings): DesiredNotification | null {
  if (!settings.categories.summary || !isValidTime(settings.dailySummaryTime)) return null;
  const [hour, minute] = settings.dailySummaryTime.split(':').map(Number);

  const shifted = shiftForQuietHours(hour, minute, settings);
  return {
    id: stableNotificationId(profile.id, 'daily-summary', 'summary'),
    channelId: channelIdFor('summary', settings.vibrationEnabled),
    title: 'Caizen daily summary',
    body: 'Your Caizen daily summary is ready.',
    schedule: {
      on: { hour: shifted.hour, minute: shifted.minute },
      repeats: true,
      allowWhileIdle: true,
    },
    extra: { profileId: profile.id, recordId: 'daily-summary', section: 'dashboard', kind: 'summary' },
  };
}

function isSnoozeSourceValid(
  extra: Record<string, unknown>,
  profiles: Profile[],
  activeProfileId: string,
  settings: NotificationSettings,
): boolean {
  if (typeof extra.profileId !== 'string' || typeof extra.recordId !== 'string') return false;
  const profile = profiles.find(entry => entry.id === extra.profileId);
  if (!profile) return false;
  const recordId = extra.recordId;
  switch (extra.kind) {
    case 'task': {
      if (!settings.categories.tasks) return false;
      const item = profile.productivityItems?.find(entry => entry.id === recordId);
      return Boolean(item?.reminderEnabled && !['completed', 'failed', 'dropped'].includes(item.status));
    }
    case 'routine': {
      if (!settings.categories.routines) return false;
      const item = profile.dailyChecklistItems?.find(entry => entry.id === recordId);
      if (!item?.reminderEnabled || item.active === false) return false;
      const date = typeof extra.occurrenceDateKey === 'string'
        ? parseLocalDateKey(extra.occurrenceDateKey)
        : new Date();
      return Boolean(date && isRoutineDueForDate(item, date) && !isRoutineDoneForDate(item, date));
    }
    case 'calendar':
    case 'deadline': {
      if (!settings.categories[extra.kind === 'calendar' ? 'calendar' : 'deadlines']) return false;
      const item = profile.importantDates?.find(entry => entry.id === recordId);
      if (item) return Boolean(item.reminderEnabled &&
        getImportantDateReminderTarget(profile, item).kind === extra.kind &&
        item.status !== 'completed' && item.status !== 'dismissed');
      if (extra.kind !== 'deadline') return false;
      const money = profile.upcomingMoneyItems?.find(entry => entry.id === recordId);
      return Boolean(money?.reminderEnabled && !money.archived && !isUpcomingMoneyComplete(money));
    }
    case 'health': {
      if (!settings.categories.health) return false;
      const item = profile.supplements?.find(entry => entry.id === recordId);
      return Boolean(item?.reminderEnabled);
    }
    case 'summary':
      return settings.categories.summary && profile.id === activeProfileId && recordId === 'daily-summary';
    default:
      return false;
  }
}

/**
 * Recomputes every reminder that should currently be scheduled, across all
 * profiles, and reconciles it against what Android already has pending.
 * Safe to call often (startup, profile switch, settings change, after a
 * save, after import) since it only fires on Local Notifications' own
 * pending list and never touches notifications from other apps.
 */
async function reconcileNotificationsNow(
  profiles: Profile[],
  activeProfileId: string,
  settings: NotificationSettings,
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await ensureChannelsCreated(settings.vibrationEnabled);

    if (!settings.masterEnabled) {
      const pending = await LocalNotifications.getPending();
      const caizenIds = pending.notifications
        .filter(notification => {
          const extra = (notification.extra || {}) as Record<string, unknown>;
          return (
            extra.caizenManaged === true ||
            extra.caizenSnooze === true ||
            (typeof extra.profileId === 'string' &&
              typeof extra.recordId === 'string' &&
              typeof extra.section === 'string' &&
              typeof extra.kind === 'string')
          );
        })
        .map(notification => ({ id: notification.id }));

      if (caizenIds.length) {
        await LocalNotifications.cancel({ notifications: caizenIds });
      }
      return;
    }

    const permission = await getNotificationPermission();
    if (permission.display !== 'granted' || !(await LocalNotifications.areEnabled()).value) {
      const pending = await LocalNotifications.getPending();
      const invalidSnoozes = pending.notifications.filter(notification => {
        const extra = (notification.extra || {}) as Record<string, unknown>;
        return extra.caizenSnooze === true &&
          !isSnoozeSourceValid(extra, profiles, activeProfileId, settings);
      });
      if (invalidSnoozes.length) {
        await LocalNotifications.cancel({ notifications: invalidSnoozes.map(({ id }) => ({ id })) });
      }
      return;
    }

    const desired: DesiredNotification[] = [];
    for (const profile of profiles) {
      if (settings.categories.tasks) {
        for (const item of profile.productivityItems || []) {
          const entry = taskDesired(profile, item, settings);
          if (entry) desired.push(entry);
        }
      }
      if (settings.categories.routines) {
        for (const item of profile.dailyChecklistItems || []) {
          desired.push(...routineDesired(profile, item, settings));
        }
      }
      if (settings.categories.calendar || settings.categories.deadlines) {
        for (const item of profile.importantDates || []) {
          for (const entry of importantDateDesired(profile, item, settings)) {
            if (entry.extra.kind === 'deadline' && !settings.categories.deadlines) continue;
            if (entry.extra.kind === 'calendar' && !settings.categories.calendar) continue;
            desired.push(entry);
          }
        }
      }
      if (settings.categories.health) {
        for (const item of profile.supplements || []) {
          desired.push(...supplementDesired(profile, item, settings));
        }
      }
      if (settings.categories.deadlines) {
        for (const item of profile.upcomingMoneyItems || []) {
          const entry = getUpcomingMoneyReminderNotification(profile, item, settings);
          if (entry) desired.push(entry);
        }
      }
    }
    const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
    if (activeProfile) {
      const summary = summaryDesired(activeProfile, settings);
      if (summary) desired.push(summary);
    }

    const signatureFor = (entry: DesiredNotification) =>
      JSON.stringify({
        title: entry.title,
        body: entry.body,
        channelId: entry.channelId,
        schedule: entry.schedule,
        extra: entry.extra,
      });

    const desiredWithSignature = desired.map(entry => ({
      entry,
      signature: signatureFor(entry),
    }));
    const desiredById = new Map(
      desiredWithSignature.map(value => [value.entry.id, value]),
    );

    const pending = await LocalNotifications.getPending();
    const idsToCancel: number[] = [];
    const unchangedIds = new Set<number>();

    for (const notification of pending.notifications) {
      const extra = (notification.extra || {}) as Record<string, unknown>;

      // A snooze is a user-requested one-off reminder. Preserve it during
      // ordinary profile edits instead of deleting it in the next reconcile.
      if (extra.caizenSnooze === true) {
        if (!isSnoozeSourceValid(extra, profiles, activeProfileId, settings)) {
          idsToCancel.push(notification.id);
        }
        continue;
      }

      // Leave unrelated/test notifications alone. Older Caizen reminders did
      // not carry caizenManaged, so recognize their reminder-target metadata
      // and replace them once with the new signed representation.
      const isLegacyCaizenReminder =
        typeof extra.profileId === 'string' &&
        typeof extra.recordId === 'string' &&
        typeof extra.section === 'string' &&
        typeof extra.kind === 'string';
      if (extra.caizenManaged !== true && !isLegacyCaizenReminder) continue;

      const desiredEntry = desiredById.get(notification.id);
      if (
        desiredEntry &&
        extra.caizenManaged === true &&
        extra.caizenSignature === desiredEntry.signature
      ) {
        unchangedIds.add(notification.id);
      } else {
        idsToCancel.push(notification.id);
      }
    }

    if (idsToCancel.length) {
      await LocalNotifications.cancel({
        notifications: idsToCancel.map(id => ({ id })),
      });
    }

    const schemas: LocalNotificationSchema[] = desiredWithSignature
      .filter(({ entry }) => !unchangedIds.has(entry.id))
      .map(({ entry, signature }) => ({
        id: entry.id,
        title: entry.title,
        body: entry.body,
        channelId: entry.channelId,
        extra: {
          ...entry.extra,
          caizenManaged: true,
          caizenSignature: signature,
        },
        actionTypeId: ACTION_TYPE_ID,
        schedule: entry.schedule,
      }));

    // Android local notifications are scheduled in batches to stay well
    // under the platform's per-call limits on very large profiles.
    const BATCH_SIZE = 100;
    for (let index = 0; index < schemas.length; index += BATCH_SIZE) {
      await LocalNotifications.schedule({
        notifications: schemas.slice(index, index + BATCH_SIZE),
      });
    }
  } catch (error) {
    console.warn('Caizen notification reconciliation recovered from an error.', error);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(NOTIFICATION_RECONCILIATION_ERROR_EVENT, {
        detail: {
          message: 'Caizen could not refresh local reminders. Check notification permission and try again.',
        },
      }));
    }
  }
}

let queuedReconciliation: {
  profiles: Profile[];
  activeProfileId: string;
  settings: NotificationSettings;
} | null = null;
let reconciliationRun: Promise<void> | null = null;

/** Serialize native pending-list edits and keep only the newest requested state. */
export function reconcileNotifications(
  profiles: Profile[],
  activeProfileId: string,
  settings: NotificationSettings,
): Promise<void> {
  queuedReconciliation = { profiles, activeProfileId, settings };
  if (!reconciliationRun) {
    reconciliationRun = (async () => {
      while (queuedReconciliation) {
        const next = queuedReconciliation;
        queuedReconciliation = null;
        await reconcileNotificationsNow(next.profiles, next.activeProfileId, next.settings);
      }
    })().finally(() => { reconciliationRun = null; });
  }
  return reconciliationRun;
}

export async function sendTestNotification(settings: NotificationSettings): Promise<void> {
  if (!isNativeApp()) return;
  if (!settings.masterEnabled) throw new Error('Caizen notifications are turned off.');
  if ((await getNotificationPermission()).display !== 'granted' ||
      !(await LocalNotifications.areEnabled()).value) {
    throw new Error('Android notifications are blocked.');
  }
  await ensureChannelsCreated(settings.vibrationEnabled);
  const at = new Date(Date.now() + 3000);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: stableNotificationId('test', 'test', 'test'),
        title: 'Caizen',
        body: settings.privacySafePreviews
          ? 'A Caizen reminder is ready.'
          : 'This is a test notification.',
        channelId: channelIdFor('task', settings.vibrationEnabled),
        schedule: { at, allowWhileIdle: true },
      },
    ],
  });
}

export function dispatchReminderTap(target: ReminderTarget): void {
  dispatchNativeEvent('reminder-tap', target);
}
