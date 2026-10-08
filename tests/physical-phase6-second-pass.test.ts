import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { selectTodayItems, type WidgetTodayItem } from '@/lib/native/widget-snapshot';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Phase 6 second physical-device remediation contracts', () => {
  it('keeps transient Cloud outages non-blocking and episode-deduplicated', () => {
    const page = read('app/app/page.tsx');
    expect(page).toContain('cloudAvailabilityOutageScopesRef');
    expect(page).toContain('cloudAvailabilityEpisodesRef');
    expect(page).toContain("kind: 'info'");
    expect(page).toContain('Your local data is safe. Caizen will check again automatically.');
    expect(page).toContain('showCloudAvailabilityNotice(`${user.id}:${profileId}`)');
    expect(page).toContain("status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'");
    expect(page).not.toContain('cloudDiscoveryError');
    expect(page).not.toContain('title: \'Cloud Backup is reconnecting\'');
  });

  it('publishes the canonical projection before acknowledging a native action', () => {
    const shell = read('components/native/NativeAppShell.tsx');
    const publishAt = shell.indexOf('const published = await publishWidgetSnapshots(');
    const receiptAt = shell.indexOf('await recordWidgetActionReceipt(action.profileId, action.actionId);', publishAt);
    expect(publishAt).toBeGreaterThan(-1);
    expect(receiptAt).toBeGreaterThan(publishAt);
    expect(shell).toContain("status: 'retryableFailure'");
    expect(shell).toContain("reason: 'save-failed'");

    const today = read('android/app/src/main/java/app/caizen/life/CaizenTodayWidget.java');
    const matching = today.slice(today.indexOf('private static JSONObject matchingAction'));
    expect(matching).toContain('exact action identity');
    expect(matching).toContain('dateKey.equals(action.optString("localDateKey", ""))');
    expect(matching).not.toContain('revision.equals(action.optString("snapshotRevision", ""))');
  });

  it('keeps Today mixed, priority-first, and redacted without blind completion', () => {
    const overdue: WidgetTodayItem = {
      id: 'overdue', kind: 'task', title: 'Overdue', dueAt: 1, done: false,
      dateKey: '2026-08-15', occurrenceKey: 'once',
    };
    const task: WidgetTodayItem = {
      id: 'task', kind: 'task', title: 'Task', dueAt: 10, done: false,
      dateKey: '2026-08-15', occurrenceKey: 'once',
    };
    const routine: WidgetTodayItem = {
      id: 'routine', kind: 'routine', title: 'Routine', dueAt: 20, done: false,
      dateKey: '2026-08-15', occurrenceKey: 'routine-occurrence',
    };
    const selected = selectTodayItems([overdue, task], [routine], 3, 5);
    expect(selected.map(item => item.id)).toEqual(['overdue', 'task', 'routine']);

    const widget = read('android/app/src/main/java/app/caizen/life/CaizenTodayWidget.java');
    expect(widget).toContain('open Caizen to complete');
    expect(widget).toContain('if (redacted) {');
    expect(widget).toContain('views.setViewVisibility(R.id.widget_today_rows, View.GONE);');
  });

  it('uses a bounded Today collection for medium and large launcher sizes', () => {
    const service = read('android/app/src/main/java/app/caizen/life/CaizenTodayRemoteViewsService.java');
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenTodayWidget.java');
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const medium = read('android/app/src/main/res/layout/widget_today_medium.xml');
    const large = read('android/app/src/main/res/layout/widget_today_large.xml');
    expect(service).toContain('RemoteViewsService');
    expect(service).toContain('hasStableIds()');
    expect(service).toContain('buildTodayRow');
    expect(widget).toContain('setRemoteAdapter(R.id.widget_today_rows, service)');
    expect(widget).toContain('setPendingIntentTemplate');
    expect(widget).toContain('setOnClickFillInIntent');
    expect(manifest).toContain('.CaizenTodayRemoteViewsService');
    expect(manifest).toContain('android:permission="android.permission.BIND_REMOTEVIEWS"');
    expect(medium).toContain('<ListView');
    expect(large).toContain('<ListView');
  });
});
