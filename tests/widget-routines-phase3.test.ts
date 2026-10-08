import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Profile } from '@/lib/types';
import { buildWidgetSnapshot } from '@/lib/native/widget-snapshot';

const read = (path: string) => readFileSync(path, 'utf8');
const now = new Date('2026-08-01T10:00:00');

function profile(id = 'profile-a'): Profile {
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
    dailyChecklistItems: [
      {
        id: `${id}-routine`,
        title: 'Morning movement',
        frequency: 'daily',
        completedAt: null,
        createdAt: now,
      },
    ] as unknown as Profile['dailyChecklistItems'],
    importantDates: [],
    supplements: [],
    upcomingMoneyItems: [],
    health: {} as Profile['health'],
    createdAt: now,
  } as unknown as Profile;
}

describe('Routines widget Phase 3 contracts', () => {
  it('defines distinct responsive compositions and practical provider sizing', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesWidget.java');
    const provider = read('android/app/src/main/res/xml/widget_routines_info.xml');
    expect(widget).toContain('new SizeF(110f, 110f)');
    expect(widget).toContain('new SizeF(250f, 110f)');
    expect(widget).toContain('new SizeF(250f, 220f)');
    expect(widget).toContain('widget_routines_small');
    expect(widget).toContain('widget_routines_medium');
    expect(widget).toContain('buildRoutineRow');
    expect(provider).toContain('android:minWidth="110dp"');
    expect(provider).toContain('android:targetCellWidth="2"');
    expect(provider).toContain('android:widgetFeatures="reconfigurable"');
  });

  it('keeps redacted mode aggregate-only and names-enabled mode action-capable', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesWidget.java');
    const service = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesRemoteViewsService.java');
    const layouts = [
      'widget_routines_small.xml',
      'widget_routines_medium.xml',
      'widget_routines.xml',
    ].map(name => read(`android/app/src/main/res/layout/${name}`));

    expect(widget).toContain('widget_routines_names_hidden');
    expect(widget).toContain('if (redacted || routines.length() == 0)');
    expect(service).toContain('if (redacted) return 0;');
    expect(service).toContain('CaizenRoutinesWidget.buildRoutineRow');
    expect(widget).toContain('setOnClickPendingIntent');
    expect(widget).toContain('setOnClickFillInIntent');
    for (const layout of layouts) {
      expect(layout).toContain('widget_routines_root');
      expect(layout).toContain('widget_routines_summary');
      expect(layout).toContain('widget_routines_progress_bar');
      expect(layout).toContain('widget_routines_refresh');
    }
  });

  it('keeps direct completion complete-only, profile-scoped, local-day validated, and idempotent', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesWidget.java');
    const actions = read('android/app/src/main/java/app/caizen/life/WidgetActionStore.java');
    const updater = read('android/app/src/main/java/app/caizen/life/CaizenWidgetUpdater.java');
    expect(widget).toContain('WidgetActionIds.routineComplete(profileId, routineId, occurrenceKey)');
    expect(widget).toContain('localTodayKey().equals(dateKey)');
    expect(widget).toContain('target.optBoolean("done", false)');
    expect(widget).not.toContain('toggle');
    expect(actions).toContain('MAX_ACTIONS = 32');
    expect(actions).toContain('recordFailure(context, actionId, "queue_full")');
    expect(updater).toContain('notifyAppWidgetViewDataChanged(ids, R.id.widget_routines_list)');
  });

  it('renders pending, rejected, stale, empty, and configuration recovery contracts', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesWidget.java');
    const service = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesRemoteViewsService.java');
    const format = read('android/app/src/main/java/app/caizen/life/CaizenWidgetFormat.java');
    const strings = read('android/app/src/main/res/values/caizen_widget.xml');
    expect(widget).toContain('WidgetActionStore.failure(context, actionId)');
    expect(widget).toContain('widget_routines_refresh_needed');
    expect(widget).toContain('widget_routines_configuration_required');
    expect(widget).toContain('isStale(snapshot)');
    expect(widget).toContain('EXTRA_DATE_KEY');
    expect(service).toContain('stale = stale || isStale(snapshot)');
    expect(format).toContain('applyRoutinesPalette');
    expect(format).toContain('applyRoutineRowPalette');
    expect(strings).toContain('widget_routines_failed');
    expect(strings).toContain('widget_routines_names_hidden');
    expect(strings).toContain('widget_routines_stale');
  });

  it('derives the visible percentage from canonical per-filter totals, not the capped/filtered row list', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesWidget.java');
    // Regression guard: setSummary previously computed `total` from
    // routines.length() (capped to MAX_ROUTINES and further narrowed by the
    // frequency filter), which diverged from the true due-routine count for
    // that filter. It must now read routineTotalsByFilter instead.
    expect(widget).toContain('routineTotalsByFilter');
    expect(widget).toContain('filterTotals.optInt("total", routines.length())');
    expect(widget).toContain('filterTotals.optInt("done", 0)');
    expect(widget).not.toContain('int total = routines.length();');
    // The accessible description must agree with the visible bar's
    // denominator too, not the global unfiltered routineProgress field.
    expect(widget).toContain('widgetDescription(context, snapshot, stale, routineFilter)');
  });

  it('keeps the v7 projection local-date and bounded without adding sensitive routine fields', () => {
    const snapshot = buildWidgetSnapshot(profile(), { now });
    expect(snapshot.version).toBe(7);
    expect(snapshot.routines[0]).toMatchObject({
      dateKey: '2026-08-01',
      occurrenceKey: 'day:2026-08-01',
    });
    expect(snapshot.routines[0]).not.toHaveProperty('notes');
    expect(JSON.stringify(snapshot)).not.toContain('health');
    expect(JSON.stringify(snapshot)).not.toContain('wallet');
  });

  it('exposes a per-widget frequency filter and honest overflow state', () => {
    const binding = read('android/app/src/main/java/app/caizen/life/WidgetBindingStore.java');
    const configure = read('android/app/src/main/java/app/caizen/life/CaizenWidgetConfigureActivity.java');
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesWidget.java');
    const service = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesRemoteViewsService.java');

    expect(binding).toContain('ROUTINE_FILTER_ALL');
    expect(binding).toContain('routineMatchesFilter');
    expect(configure).toContain('routineFilterSpinner');
    expect(configure).toContain('ROUTINE_FILTER_VALUES');
    expect(widget).toContain('routineRowsOmitted');
    expect(widget).toContain('more in Caizen');
    expect(service).toContain('routineFilter = WidgetBindingStore.routineFilter(binding)');
    expect(service).not.toContain('SIZE_MEDIUM.equals(size) ? 1');
    expect(service).not.toContain('SIZE_LARGE.equals(size) ? 6');
  });

  it('preserves profile bindings and native isolation boundaries', () => {
    const store = read('android/app/src/main/java/app/caizen/life/WidgetSnapshotStore.java');
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const updater = read('android/app/src/main/java/app/caizen/life/CaizenWidgetUpdater.java');
    expect(store).toContain('readForWidget');
    expect(store).toContain('WidgetBindingStore.NAMES');
    expect(manifest).toContain('android:name=".CaizenRoutinesRemoteViewsService"');
    expect(manifest).toContain('android:exported="false"');
    expect(manifest).toContain('android.permission.BIND_REMOTEVIEWS');
    expect(updater).toContain('CaizenRoutinesWidget.class');
    expect(updater).toContain('CaizenCalendarWidget.class');
  });
});
