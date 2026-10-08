import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('physical Android widget remediation contracts', () => {
  it('uses a Caizen-styled, provider-aware configuration surface', () => {
    const activity = read('android/app/src/main/java/app/caizen/life/CaizenWidgetConfigureActivity.java');
    const format = read('android/app/src/main/java/app/caizen/life/CaizenWidgetFormat.java');
    const calendar = read('android/app/src/main/res/xml/widget_calendar_info.xml');
    const routines = read('android/app/src/main/res/xml/widget_routines_info.xml');

    expect(activity).toContain('Configure Routines');
    expect(activity).toContain('Configure Calendar');
    expect(activity).toContain('Show names on this widget');
    expect(activity).toContain('boolean existingNames');
    expect(activity).toContain('namesSwitch.setChecked(existingNames)');
    expect(activity).toContain('SwitchCompat');
    expect(activity).toContain('WindowCompat.setDecorFitsSystemWindows');
    expect(activity).toContain('setResult(RESULT_CANCELED, resultIntent())');
    expect(activity).toContain('WidgetBindingStore.REDACTED');
    expect(activity).toContain('WidgetBindingStore.NAMES');
    expect(activity).toContain('WidgetSnapshotStore.readIndex');
    expect(format).toContain('public static int paletteColor');
    for (const provider of [calendar, routines]) {
      expect(provider).toContain('android:widgetFeatures="reconfigurable"');
      expect(provider).toContain('android:configure="app.caizen.life.CaizenWidgetConfigureActivity"');
    }
  });

  it('renders accepted-local completion separately from canonical sync', () => {
    const store = read('android/app/src/main/java/app/caizen/life/WidgetActionStore.java');
    const routines = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesWidget.java');
    const updater = read('android/app/src/main/java/app/caizen/life/CaizenWidgetUpdater.java');
    const plugin = read('android/app/src/main/java/app/caizen/life/CaizenNativePlugin.java');
    const strings = read('android/app/src/main/res/values/caizen_widget.xml');

    expect(store).toContain('KEY_ACCEPTED = "accepted"');
    expect(store).toContain('listAccepted');
    expect(store).toContain('putString(KEY_ACCEPTED, accepted.toString())');
    expect(store).toContain('clearAccepted');
    expect(store).toContain('markSynced');
    expect(store).toContain('persistence_failed');
    expect(routines).toContain('WidgetActionStore.listAccepted(context)');
    expect(routines).toContain('effectiveDone');
    expect(routines).toContain('widget_routines_accepted');
    expect(routines).toContain('syncState');
    expect(routines).toContain('containsMatchingAction');
    expect(routines).toContain('refreshRoutines(context)');
    expect(routines).not.toContain('Saving in Caizen...');
    expect(updater).toContain('public static void refreshRoutines');
    expect(plugin).toContain('CaizenWidgetUpdater.refreshRoutines(getContext())');
    expect(strings).toContain('Completed · sync pending');
    expect(strings).toContain('Sync pending');
    expect(strings).not.toContain('Saving in Caizen...');
  });

  it('keeps accepted actions profile/revision/occurrence scoped and refreshes only routines', () => {
    const routines = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesWidget.java');
    const updater = read('android/app/src/main/java/app/caizen/life/CaizenWidgetUpdater.java');

    expect(routines).toContain('profileId.equals(action.optString("profileId", ""))');
    expect(routines).toContain('snapshotRevision.equals(action.optString("snapshotRevision", ""))');
    expect(routines).toContain('occurrenceKey.equals(action.optString("occurrenceKey", ""))');
    expect(updater).toContain('if (routinesOnly && provider != CaizenRoutinesWidget.class) continue;');
  });

  it('hands a quiet Cloud recovery notice to the explicit review surface', () => {
    const page = read('app/app/page.tsx');

    expect(page).toContain('data-testid="cloud-continuity-notice"');
    expect(page).toContain('Review backup');
    expect(page).toContain('setCloudRecoveryOffer(cloudContinuityNotice);');
    expect(page).toContain('setShowMobileTools(false);');
  });

  it('keeps Calendar large event rows visible for legacy or malformed identities', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenCalendarWidget.java');
    const row = read('android/app/src/main/res/layout/widget_calendar_upcoming_row.xml');
    const strings = read('android/app/src/main/res/values/caizen_widget.xml');

    expect(widget).toContain('if (id.isEmpty()) id = WidgetSnapshotStore.optString(event, "recordId");');
    expect(widget).toContain('widget_calendar_time_unavailable');
    expect(widget).toContain('row.setViewVisibility(R.id.widget_up_title, View.VISIBLE);');
    expect(widget).toContain('row.setViewVisibility(R.id.widget_up_time, View.VISIBLE);');
    expect(widget).toContain('if (!id.isEmpty())');
    expect(row).toContain('widget_up_title');
    expect(row).toContain('widget_up_time');
    expect(strings).toContain('widget_calendar_time_unavailable');
  });

  it('uses the responsive update path and explicit collection action contract', () => {
    const today = read('android/app/src/main/java/app/caizen/life/CaizenTodayWidget.java');
    const work = read('android/app/src/main/java/app/caizen/life/CaizenWorkTasksWidget.java');
    const routines = read('android/app/src/main/java/app/caizen/life/CaizenRoutinesWidget.java');
    const manifest = read('android/app/src/main/AndroidManifest.xml');

    for (const provider of [today, work]) {
      expect(provider).toContain('public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds)');
      expect(provider).toContain('renderSafely(context, manager, widgetId);');
      expect(provider).toContain('buildFallbackForSize');
    }
    expect(routines).toContain('.setPackage(context.getPackageName())');
    expect(routines).toContain('putExtra(EXTRA_APP_WIDGET_ID, widgetId)');
    expect(routines).toContain('PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE');
    expect(manifest).toContain('app.caizen.life.ROUTINE_ROW');
  });
});
