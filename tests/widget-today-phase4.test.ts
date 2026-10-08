import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Today Android widget Phase 4 contracts', () => {
  it('registers Today with the shared configuration and safe provider boundary', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const provider = read('android/app/src/main/res/xml/widget_today_info.xml');
    const configure = read('android/app/src/main/java/app/caizen/life/CaizenWidgetConfigureActivity.java');

    expect(manifest).toContain('android:name=".CaizenTodayWidget"');
    expect(manifest).toContain('android:resource="@xml/widget_today_info"');
    expect(provider).toContain('android:initialLayout="@layout/widget_today_small"');
    expect(provider).toContain('android:configure="app.caizen.life.CaizenWidgetConfigureActivity"');
    expect(provider).toContain('android:widgetFeatures="reconfigurable"');
    expect(configure).toContain('WidgetBindingStore.TODAY');
    expect(configure).toContain('isTodayWidget');
  });

  it('provides genuine small, medium, and large compositions', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenTodayWidget.java');
    const layouts = ['small', 'medium', 'large'].map(size =>
      read(`android/app/src/main/res/layout/widget_today_${size}.xml`));

    expect(widget).toContain('new SizeF(110f, 110f)');
    expect(widget).toContain('new SizeF(250f, 110f)');
    expect(widget).toContain('new SizeF(250f, 220f)');
    expect(widget).toContain('int limit = SIZE_SMALL.equals(size) ? 1 : SIZE_MEDIUM.equals(size) ? 3 : 5');
    for (const layout of layouts) {
      expect(layout).toContain('widget_today_root');
      expect(layout).toContain('widget_today_progress_summary');
      expect(layout).toContain('widget_today_rows');
      expect(layout).toContain('widget_today_next_context');
    }
  });

  it('keeps Today task-only and leaves future events to Calendar', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenTodayWidget.java');
    const projection = read('lib/native/widget-snapshot.ts');

    expect(widget).not.toContain('includeRoutines');
    expect(widget).not.toContain('today-event-');
    expect(widget).toContain('if (!"task".equals(kind)) continue;');
    expect(widget).toContain('overdueTaskCount');
    expect(widget).toContain('completedDueCount');
    expect(widget).toContain('tasks only');
    expect(projection).toContain('includeRoutines: false');
    expect(projection).toContain('dueTodayTaskCount');
    expect(projection).toContain('dueTodayRoutineCount: 0');
  });

  it('backfills capacity with undated tasks without labeling them as due today', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenTodayWidget.java');
    const projection = read('lib/native/widget-snapshot.ts');

    // Regression guard: an undated fallback row (dueAt: null) previously
    // fell through dueLabel() to the "Today" branch, implying a deadline
    // that doesn't exist.
    expect(widget).toContain('if ("task".equals(kind)) return "No due date";');
    expect(projection).toContain('undatedTaskCandidates');
    expect(projection).toContain('undatedFallbackRows');
    // The fallback must never count toward the due-today denominator.
    expect(projection).toContain('overdueTaskCount: overdueTaskCandidates.length');
    expect(projection).toContain('dueTodayTaskCount: dueTodayTaskCandidates.length + completedDueTodayTaskCount');
  });

  it('keeps privacy redacted and removes nested calendar titles', () => {
    const snapshotStore = read('android/app/src/main/java/app/caizen/life/WidgetSnapshotStore.java');
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenTodayWidget.java');
    const strings = read('android/app/src/main/res/values/caizen_widget.xml');

    expect(snapshotStore).toContain('todayNextEvent.put("title", "Event")');
    expect(widget).toContain('boolean actionEnabled = !redacted');
    expect(widget).toContain('String title = redacted ? label');
    expect(widget).toContain('widget_today_names_hidden');
    expect(strings).toContain('widget_today_names_hidden');
  });

  it('uses the shared complete-only task action lifecycle', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenTodayWidget.java');
    const actions = read('android/app/src/main/java/app/caizen/life/WidgetActionStore.java');

    expect(widget).toContain('WidgetActionIds.taskComplete');
    expect(widget).not.toContain('WidgetActionIds.routineComplete');
    expect(widget).toContain('WidgetActionStore.enqueue(context, action)');
    expect(widget).toContain('localTodayKey().equals(dateKey)');
    expect(widget).not.toContain('toggle');
    expect(actions).toContain('accepted');
    expect(actions).toContain('queue_full');
    expect(actions).toContain('retryableFailure');
  });

  it('refreshes Today by pinned profile without widening Today action scope', () => {
    const updater = read('android/app/src/main/java/app/caizen/life/CaizenWidgetUpdater.java');
    const manifest = read('android/app/src/main/AndroidManifest.xml');

    expect(updater).toContain('CaizenTodayWidget.class');
    expect(updater).toContain('refreshTodayForProfile');
    expect(updater).toContain('refreshProviderForProfile(context, CaizenTodayWidget.class');
    expect(manifest).toContain('CaizenTodayWidget');
  });

  it('preserves exact task routing without routine or calendar-context actions', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenTodayWidget.java');

    expect(widget).toContain('"tasks"');
    expect(widget).not.toContain('"routine"');
    expect(widget).not.toContain('"open-date"');
    expect(widget).toContain('EXTRA_RECORD_ID');
    expect(widget).toContain('EXTRA_APPWIDGET_ID');
  });
});
