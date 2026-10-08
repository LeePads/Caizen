import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Profile } from '@/lib/types';
import {
  buildWidgetProfileIndex,
  buildWidgetSnapshot,
  type WidgetAppearance,
} from '@/lib/native/widget-snapshot';

const read = (path: string) => readFileSync(path, 'utf8');

function profile(id: string): Profile {
  return {
    id,
    name: id,
    wallets: [],
    inventoryItems: [],
    wishlistItems: [],
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
    upcomingMoneyItems: [],
    health: {} as Profile['health'],
    createdAt: new Date('2026-08-01T00:00:00'),
  } as unknown as Profile;
}

describe('Calendar widget Phase 2 contracts', () => {
  it('publishes validated semantic appearance without changing profile projection ownership', () => {
    const current = profile('profile-a');
    const snapshot = buildWidgetSnapshot(current, { now: new Date('2026-08-01T10:00:00') });
    const appearance: WidgetAppearance = {
      background: '#10151b',
      card: '#161c23',
      primary: '#e7b34e',
      primaryForeground: '#1a1206',
      foreground: '#eceff1',
      mutedForeground: '#aeb6be',
      border: '#2c3641',
    };
    const index = buildWidgetProfileIndex([current], current.id, [snapshot], appearance);

    expect(index.appearance).toEqual(appearance);
    expect(index.profiles[0].profileId).toBe(current.id);
    expect(snapshot).not.toHaveProperty('appearance');
  });

  it('defines genuine small, medium, and large RemoteViews compositions', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenCalendarWidget.java');
    expect(widget).toContain('manager.updateAppWidget(widgetId, responsiveViews(context, widgetId))');
    expect(widget).toContain('calendarSizeForOptions');
    expect(widget).toContain('widget_calendar_small');
    expect(widget).toContain('widget_calendar_medium');
    expect(widget).toContain('new SizeF(250f, 220f)');
    expect(widget).toContain('buildDayStrip');
    expect(widget).toContain('buildGrid');
  });

  it('keeps Calendar state, privacy, exact navigation, and accessibility bounded', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenCalendarWidget.java');
    const format = read('android/app/src/main/java/app/caizen/life/CaizenWidgetFormat.java');
    const info = read('android/app/src/main/res/xml/widget_calendar_info.xml');
    expect(widget).toContain('widget_calendar_preparing');
    expect(widget).toContain('widget_calendar_stale');
    expect(widget).toContain('WidgetSnapshotStore.isRedacted(snapshot)');
    expect(widget).toContain('deepLink(context, "calendar-event-"');
    expect(widget).toContain('deepLink(context, "calendar-day-"');
    expect(widget).toContain('setContentDescription');
    expect(format).toContain('primaryForeground');
    expect(format).toContain('setBackgroundTintList');
    expect(info).toContain('android:minWidth="110dp"');
    expect(info).toContain('android:targetCellWidth="2"');
    expect(info).toContain('android:widgetFeatures="reconfigurable"');
  });

  it('keeps the native projection/action architecture unchanged', () => {
    const snapshot = read('android/app/src/main/java/app/caizen/life/WidgetSnapshotStore.java');
    const actions = read('android/app/src/main/java/app/caizen/life/WidgetActionStore.java');
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(snapshot).toContain('SUPPORTED_VERSION = 7');
    expect(snapshot).toContain('PREVIOUS_VERSION = 6');
    expect(actions).toContain('MAX_ACTIONS = 32');
    expect(manifest).toContain('android:exported="false"');
    expect(manifest).toContain('android.permission.BIND_REMOTEVIEWS');
    expect(read('android/app/src/main/java/app/caizen/life/CaizenCalendarWidget.java'))
      .not.toMatch(/Media3|Spotify|TodayWidget/);
  });
});
