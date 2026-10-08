import { registerPlugin } from '@capacitor/core';
import { isAndroid } from '../platform';
import { openExternalLink } from './open-link';

type CalendarEventInput = {
  title: string;
  description?: string;
  startAt: string;
  endAt?: string;
  location?: string;
};

interface CaizenNativePlugin {
  getNotificationAvailability(): Promise<{ runtimeGranted: boolean; appEnabled: boolean }>;
  openCalendarEvent(options: CalendarEventInput): Promise<void>;
  setPrivacyScreen(options: { enabled: boolean }): Promise<void>;
  saveAs(options: { sourcePath: string; fileName: string; mimeType: string }): Promise<{ uri?: string }>;
  openNotificationSettings(): Promise<void>;
  openAppSettings(): Promise<void>;
  writeWidgetSnapshot(options: { payload: string }): Promise<void>;
  writeWidgetSnapshots(options: {
    indexPayload: string;
    projections: Array<{ profileId: string; payload: string }>;
  }): Promise<void>;
  clearWidgetSnapshot(): Promise<void>;
  clearWidgetSnapshots(): Promise<void>;
  getPendingRoutineActions(): Promise<{ actions: Array<{ actionId: string; profileId: string; routineId: string; dateKey: string; occurrenceKey: string }> }>;
  ackPendingRoutineActions(options: { actionIds: string[] }): Promise<void>;
  getPendingWidgetActions(): Promise<{ actions: Array<import('./widget-actions').WidgetAction> }>;
  ackWidgetActions(options: { results: import('./widget-actions').WidgetActionResult[] }): Promise<void>;
}

export const CaizenNative = registerPlugin<CaizenNativePlugin>('CaizenNative');

export function createCalendarReview(input: CalendarEventInput): CalendarEventInput {
  const start = new Date(input.startAt);
  if (!input.title.trim() || Number.isNaN(start.getTime())) {
    throw new Error('A title and valid start date are required.');
  }
  return {
    title: input.title.trim().slice(0, 160),
    description: input.description?.trim().slice(0, 1000),
    startAt: start.toISOString(),
    endAt: input.endAt ? new Date(input.endAt).toISOString() : undefined,
    location: input.location?.trim().slice(0, 240),
  };
}

export async function addToCalendar(input: CalendarEventInput): Promise<void> {
  const review = createCalendarReview(input);
  if (isAndroid()) {
    await CaizenNative.openCalendarEvent(review);
    return;
  }
  const dates = `${review.startAt.replace(/[-:]/g, '').replace('.000', '')}/${
    (review.endAt ?? review.startAt).replace(/[-:]/g, '').replace('.000', '')
  }`;
  const query = new URLSearchParams({
    action: 'TEMPLATE',
    text: review.title,
    dates,
    details: review.description ?? '',
    location: review.location ?? '',
  });
  await openExternalLink(`https://calendar.google.com/calendar/render?${query}`);
}

export async function setPrivacyScreen(enabled: boolean): Promise<void> {
  if (isAndroid()) await CaizenNative.setPrivacyScreen({ enabled });
}
