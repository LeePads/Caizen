package app.caizen.life;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Urgency-first Work Tasks widget backed by the bounded v7 projection. */
public final class CaizenWorkTasksWidget extends CaizenWidgetBase {
    static final String SIZE_SMALL = "small";
    static final String SIZE_MEDIUM = "medium";
    static final String SIZE_LARGE = "large";

    private static final String ACTION_WORK_TASKS = "app.caizen.life.WORK_TASKS_ACTION";
    private static final String EXTRA_ROW_ACTION = "rowAction";
    private static final String EXTRA_RECORD_ID = "recordId";
    private static final String EXTRA_PROFILE_ID = "profileId";
    private static final String EXTRA_DATE_KEY = "dateKey";
    private static final String EXTRA_OCCURRENCE_KEY = "occurrenceKey";
    private static final String EXTRA_ACTION_ID = "actionId";
    private static final String EXTRA_SNAPSHOT_REVISION = "snapshotRevision";
    private static final String COMPLETE = "complete";
    private static final long STALE_AFTER_MS = 24L * 60L * 60L * 1000L;

    @Override
    protected String widgetProviderKind() {
        return WidgetBindingStore.WORK_TASKS;
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        if (widgetIds == null) return;
        for (int widgetId : widgetIds) {
            migrateExistingBinding(context, widgetId);
            renderSafely(context, manager, widgetId);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(
        Context context,
        AppWidgetManager manager,
        int widgetId,
        Bundle newOptions
    ) {
        renderSafely(context, manager, widgetId);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && ACTION_WORK_TASKS.equals(intent.getAction())) {
            if (COMPLETE.equals(intent.getStringExtra(EXTRA_ROW_ACTION))) {
                enqueueCompletion(context, intent);
            }
            return;
        }
        super.onReceive(context, intent);
    }

    private void renderSafely(Context context, AppWidgetManager manager, int widgetId) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                manager.updateAppWidget(widgetId, responsiveViews(context, widgetId));
            } else {
                updateSafely(context, manager, widgetId);
            }
        } catch (Exception error) {
            updateSafely(context, manager, widgetId);
        }
    }

    private RemoteViews responsiveViews(Context context, int widgetId) {
        JSONObject state = snapshot(context, widgetId);
        java.util.Map<SizeF, RemoteViews> views = new java.util.LinkedHashMap<>();
        views.put(new SizeF(110f, 110f), buildForSize(context, widgetId, SIZE_SMALL, state));
        views.put(new SizeF(250f, 110f), buildForSize(context, widgetId, SIZE_MEDIUM, state));
        views.put(new SizeF(250f, 220f), buildForSize(context, widgetId, SIZE_LARGE, state));
        return new RemoteViews(views);
    }

    static String workTasksSizeForOptions(Bundle options) {
        if (options == null) return SIZE_LARGE;
        int width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (width > 0 && (width < 180 || height < 150)) return SIZE_SMALL;
        if (width > 0 && (width < 300 || height < 230)) return SIZE_MEDIUM;
        return SIZE_LARGE;
    }

    @Override
    protected RemoteViews buildViews(Context context, int widgetId) {
        Bundle options = widgetId == AppWidgetManager.INVALID_APPWIDGET_ID
            ? null : AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId);
        return buildForSize(context, widgetId, workTasksSizeForOptions(options), snapshot(context, widgetId));
    }

    @Override
    protected RemoteViews buildFallbackViews(Context context, int widgetId) {
        Bundle options = widgetId == AppWidgetManager.INVALID_APPWIDGET_ID
            ? null : AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId);
        return buildFallbackForSize(
            context,
            widgetId,
            workTasksSizeForOptions(options),
            snapshot(context, widgetId)
        );
    }

    private RemoteViews buildForSize(
        Context context,
        int widgetId,
        String size,
        JSONObject state
    ) {
        if (state == null || WidgetSnapshotStore.isConfigurationRequired(state)) {
            return buildFallbackForSize(context, widgetId, size, state);
        }

        boolean redacted = WidgetSnapshotStore.isRedacted(state);
        boolean stale = isStale(state);
        RemoteViews views = baseViews(context, widgetId, state, layoutForSize(size));
        CaizenWidgetFormat.applyWorkTasksPalette(context, views, CaizenWidgetFormat.appearanceForWidget(context, widgetId));
        setHeader(context, views, stale);
        setSummary(context, views, state, redacted);
        renderRows(context, views, widgetId, state, redacted, stale, size);
        setStaleState(context, views, stale);
        setWidgetDescription(views, state, stale);
        return views;
    }

    private RemoteViews buildFallbackForSize(
        Context context,
        int widgetId,
        String size,
        JSONObject state
    ) {
        RemoteViews views = baseViews(context, widgetId, state, layoutForSize(size));
        CaizenWidgetFormat.applyWorkTasksPalette(context, views, CaizenWidgetFormat.appearanceForWidget(context, widgetId));
        setHeader(context, views, true);
        hideContent(views);
        views.setViewVisibility(R.id.widget_work_tasks_empty, View.VISIBLE);
        String message = fallbackMessage(context, state);
        views.setTextViewText(R.id.widget_work_tasks_empty, message);
        views.setContentDescription(R.id.widget_work_tasks_root, message);
        return views;
    }

    private RemoteViews baseViews(Context context, int widgetId, JSONObject state, int layout) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        String profileId = WidgetSnapshotStore.optString(state, "profileId");
        views.setOnClickPendingIntent(
            R.id.widget_work_tasks_root,
            deepLink(context, "work-tasks-root-" + widgetId, "workhub", null, null, profileId)
        );
        views.setOnClickPendingIntent(R.id.widget_work_tasks_refresh, refreshIntent(context));
        return views;
    }

    private void setHeader(Context context, RemoteViews views, boolean stale) {
        String date = new SimpleDateFormat("EEEE, d MMM", Locale.getDefault()).format(new Date());
        views.setTextViewText(R.id.widget_work_tasks_title, context.getString(R.string.widget_work_tasks_name));
        views.setTextViewText(R.id.widget_work_tasks_date, date);
        views.setContentDescription(R.id.widget_work_tasks_title, "Caizen Work Tasks");
        views.setContentDescription(R.id.widget_work_tasks_date, "Work Tasks, " + date);
        views.setContentDescription(R.id.widget_work_tasks_refresh, "Refresh Work Tasks widget");
        views.setContentDescription(
            R.id.widget_work_tasks_root,
            stale ? "Caizen Work Tasks, needs refresh" : "Caizen Work Tasks"
        );
    }

    private void setSummary(Context context, RemoteViews views, JSONObject state, boolean redacted) {
        JSONObject work = WidgetSnapshotStore.optObject(state, "workTasks");
        int open = Math.max(0, work == null ? 0 : work.optInt("openCount", 0));
        int overdue = Math.max(0, work == null ? 0 : work.optInt("overdueCount", 0));
        String summary = open + " open";
        views.setTextViewText(R.id.widget_work_tasks_summary, summary);
        views.setContentDescription(R.id.widget_work_tasks_summary, "Work Tasks: " + summary);
        views.setViewVisibility(R.id.widget_work_tasks_overdue, overdue > 0 ? View.VISIBLE : View.GONE);
        if (overdue > 0) {
            String label = overdue + " overdue";
            views.setTextViewText(R.id.widget_work_tasks_overdue, label);
            views.setContentDescription(R.id.widget_work_tasks_overdue, label);
        }
        views.setTextViewText(
            R.id.widget_work_tasks_status,
            redacted ? context.getString(R.string.widget_work_tasks_names_hidden) : ""
        );
        views.setViewVisibility(R.id.widget_work_tasks_status, redacted ? View.VISIBLE : View.GONE);
    }

    private void renderRows(
        Context context,
        RemoteViews views,
        int widgetId,
        JSONObject state,
        boolean redacted,
        boolean stale,
        String size
    ) {
        views.removeAllViews(R.id.widget_work_tasks_rows);
        views.setViewVisibility(R.id.widget_work_tasks_empty, View.GONE);
        JSONObject work = WidgetSnapshotStore.optObject(state, "workTasks");
        JSONArray items = work == null ? new JSONArray() : WidgetSnapshotStore.optArray(work, "items");
        int limit = SIZE_SMALL.equals(size) ? 1 : SIZE_MEDIUM.equals(size) ? 3 : 6;
        int shown = 0;
        JSONArray pending = WidgetActionStore.list(context);
        JSONArray accepted = WidgetActionStore.listAccepted(context);
        for (int index = 0; index < items.length() && shown < limit; index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item == null || !valid(WidgetSnapshotStore.optString(item, "id"))) continue;
            views.addView(
                R.id.widget_work_tasks_rows,
                buildWorkTaskRow(context, item, state, widgetId, redacted, stale, pending, accepted)
            );
            shown += 1;
        }
        if (shown == 0) {
            views.setViewVisibility(R.id.widget_work_tasks_empty, View.VISIBLE);
            int openCount = work == null ? 0 : Math.max(0, work.optInt("openCount", 0));
            String message = openCount == 0
                ? context.getString(R.string.widget_work_tasks_empty)
                : redacted
                ? context.getString(R.string.widget_work_tasks_names_hidden)
                : context.getString(R.string.widget_work_tasks_empty);
            views.setTextViewText(R.id.widget_work_tasks_empty, message);
            views.setContentDescription(R.id.widget_work_tasks_empty, message);
        }
    }

    static RemoteViews buildWorkTaskRow(
        Context context,
        JSONObject item,
        JSONObject state,
        int widgetId,
        boolean redacted,
        boolean stale,
        JSONArray pending,
        JSONArray accepted
    ) {
        String profileId = WidgetSnapshotStore.optString(state, "profileId");
        String revision = WidgetSnapshotStore.optString(state, "revision");
        String recordId = WidgetSnapshotStore.optString(item, "id");
        String dateKey = WidgetSnapshotStore.optString(item, "dateKey");
        String occurrenceKey = WidgetSnapshotStore.optString(item, "occurrenceKey");
        String actionId = WidgetActionIds.workTaskComplete(profileId, recordId, occurrenceKey);
        JSONObject acceptedAction = matchingAction(accepted, actionId, profileId, revision, item);
        boolean acceptedDone = acceptedAction != null;
        boolean queued = containsAction(pending, actionId);
        boolean failed = WidgetActionStore.failure(context, actionId) != null;
        boolean effectiveDone = acceptedDone;
        boolean actionEnabled = !redacted && !effectiveDone && !queued && !stale
            && valid(profileId) && valid(recordId) && valid(dateKey) && valid(occurrenceKey)
            && valid(revision) && localTodayKey().equals(dateKey);

        String title = redacted ? "Work task" : WidgetSnapshotStore.optString(item, "title");
        if (title.isEmpty()) title = "Work task";
        String due = dueLabel(item);
        String priority = WidgetSnapshotStore.optString(item, "priority");
        String meta = due;
        if (!priority.isEmpty()) meta += " \u00b7 " + priority + " priority";
        String stateLabel = statusLabel(WidgetSnapshotStore.optString(item, "status"));
        if (effectiveDone && acceptedDone) stateLabel = context.getString(R.string.widget_work_tasks_accepted);
        else if (queued) stateLabel = context.getString(R.string.widget_work_tasks_pending);
        else if (failed) stateLabel = context.getString(R.string.widget_work_tasks_failed);
        else if (stale) stateLabel = context.getString(R.string.widget_work_tasks_stale);

        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_work_tasks_row);
        row.setTextViewText(R.id.widget_work_task_row_kind, due.toUpperCase(Locale.ROOT));
        row.setTextViewText(R.id.widget_work_task_row_title, title);
        row.setTextViewText(R.id.widget_work_task_row_meta, meta);
        row.setTextViewText(R.id.widget_work_task_row_state, stateLabel);
        row.setViewVisibility(R.id.widget_work_task_row_complete, actionEnabled ? View.VISIBLE : View.GONE);
        row.setContentDescription(
            R.id.widget_work_task_row_body,
            "Work task: " + title + ", " + due + ", " + stateLabel
        );
        row.setContentDescription(
            R.id.widget_work_task_row_complete,
            failed ? context.getString(R.string.widget_work_tasks_retry)
                : context.getString(R.string.widget_work_tasks_complete)
        );
        CaizenWidgetFormat.applyWorkTaskRowPalette(
            context, row, CaizenWidgetFormat.appearanceForWidget(context, widgetId), effectiveDone, acceptedDone, failed, actionEnabled,
            "Overdue".equals(due)
        );

        row.setOnClickPendingIntent(
            R.id.widget_work_task_row_body,
            deepLink(context, "work-task-row-" + widgetId + "-" + recordId,
                "workhub", "task", recordId, profileId)
        );
        if (actionEnabled) {
            Intent complete = new Intent(context, CaizenWorkTasksWidget.class)
                .setAction(ACTION_WORK_TASKS)
                .putExtra(EXTRA_ROW_ACTION, COMPLETE)
                .putExtra(EXTRA_RECORD_ID, recordId)
                .putExtra(EXTRA_PROFILE_ID, profileId)
                .putExtra(EXTRA_DATE_KEY, dateKey)
                .putExtra(EXTRA_OCCURRENCE_KEY, occurrenceKey)
                .putExtra(EXTRA_ACTION_ID, actionId)
                .putExtra(EXTRA_SNAPSHOT_REVISION, revision)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
            row.setOnClickPendingIntent(
                R.id.widget_work_task_row_complete,
                PendingIntent.getBroadcast(
                    context,
                    (actionId + ":" + widgetId).hashCode(),
                    complete,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                )
            );
        }
        return row;
    }

    private void setStaleState(Context context, RemoteViews views, boolean stale) {
        views.setViewVisibility(R.id.widget_work_tasks_stale, stale ? View.VISIBLE : View.GONE);
        if (stale) {
            views.setTextViewText(R.id.widget_work_tasks_stale, context.getString(R.string.widget_work_tasks_stale));
            views.setContentDescription(R.id.widget_work_tasks_stale, "Open Caizen to refresh Work Tasks data");
        }
    }

    private void setWidgetDescription(RemoteViews views, JSONObject state, boolean stale) {
        String description = stale ? "Caizen Work Tasks, needs refresh" : "Caizen Work Tasks";
        if (WidgetSnapshotStore.isRedacted(state)) description += ", names hidden";
        views.setContentDescription(R.id.widget_work_tasks_root, description);
    }

    private void hideContent(RemoteViews views) {
        views.setViewVisibility(R.id.widget_work_tasks_summary, View.GONE);
        views.setViewVisibility(R.id.widget_work_tasks_overdue, View.GONE);
        views.setViewVisibility(R.id.widget_work_tasks_status, View.GONE);
        views.setViewVisibility(R.id.widget_work_tasks_stale, View.GONE);
        views.setViewVisibility(R.id.widget_work_tasks_rows, View.GONE);
    }

    private String fallbackMessage(Context context, JSONObject state) {
        if (WidgetSnapshotStore.isConfigurationRequired(state)) {
            return context.getString(R.string.widget_work_tasks_configuration_required);
        }
        return WidgetSnapshotStore.readIndex(context) == null
            ? context.getString(R.string.widget_open_to_sync)
            : context.getString(R.string.widget_work_tasks_preparing);
    }

    private boolean isStale(JSONObject state) {
        if (state == null) return true;
        long updatedAt = state.optLong("updatedAt", 0L);
        if (updatedAt <= 0L || System.currentTimeMillis() - updatedAt > STALE_AFTER_MS) return true;
        JSONObject work = WidgetSnapshotStore.optObject(state, "workTasks");
        JSONArray items = work == null ? new JSONArray() : WidgetSnapshotStore.optArray(work, "items");
        String todayKey = localTodayKey();
        for (int index = 0; index < items.length(); index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item != null && !todayKey.equals(WidgetSnapshotStore.optString(item, "dateKey"))) return true;
        }
        return false;
    }

    private int layoutForSize(String size) {
        if (SIZE_SMALL.equals(size)) return R.layout.widget_work_tasks_small;
        if (SIZE_MEDIUM.equals(size)) return R.layout.widget_work_tasks_medium;
        return R.layout.widget_work_tasks_large;
    }

    private static String dueLabel(JSONObject item) {
        String status = WidgetSnapshotStore.optString(item, "status");
        if ("waiting".equals(status)) return "Waiting";
        long dueAt = item.optLong("dueAt", 0L);
        if (dueAt <= 0L) return "Undated";
        if (isBeforeToday(dueAt)) return "Overdue";
        if (isToday(dueAt)) return "Today";
        return "Upcoming";
    }

    private static String statusLabel(String value) {
        if (value == null || value.trim().isEmpty()) return "Open";
        String normalized = value.replace('-', ' ').replace('_', ' ').trim();
        return Character.toUpperCase(normalized.charAt(0)) + normalized.substring(1);
    }

    private static boolean isToday(long millis) {
        Calendar target = Calendar.getInstance();
        target.setTimeInMillis(millis);
        Calendar today = Calendar.getInstance();
        return target.get(Calendar.ERA) == today.get(Calendar.ERA)
            && target.get(Calendar.YEAR) == today.get(Calendar.YEAR)
            && target.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR);
    }

    private static boolean isBeforeToday(long millis) {
        Calendar target = Calendar.getInstance();
        target.setTimeInMillis(millis);
        Calendar today = Calendar.getInstance();
        target.set(Calendar.HOUR_OF_DAY, 0);
        target.set(Calendar.MINUTE, 0);
        target.set(Calendar.SECOND, 0);
        target.set(Calendar.MILLISECOND, 0);
        today.set(Calendar.HOUR_OF_DAY, 0);
        today.set(Calendar.MINUTE, 0);
        today.set(Calendar.SECOND, 0);
        today.set(Calendar.MILLISECOND, 0);
        return target.before(today);
    }

    private static boolean containsAction(JSONArray actions, String actionId) {
        for (int index = 0; index < actions.length(); index += 1) {
            JSONObject action = actions.optJSONObject(index);
            if (action != null && actionId.equals(action.optString("actionId", ""))) return true;
        }
        return false;
    }

    private static JSONObject matchingAction(
        JSONArray actions,
        String actionId,
        String profileId,
        String revision,
        JSONObject item
    ) {
        String dateKey = WidgetSnapshotStore.optString(item, "dateKey");
        String occurrenceKey = WidgetSnapshotStore.optString(item, "occurrenceKey");
        for (int index = 0; index < actions.length(); index += 1) {
            JSONObject action = actions.optJSONObject(index);
            if (action == null || !actionId.equals(action.optString("actionId", ""))) continue;
            if (!profileId.equals(action.optString("profileId", ""))
                || !revision.equals(action.optString("snapshotRevision", ""))
                || !dateKey.equals(action.optString("localDateKey", ""))
                || !occurrenceKey.equals(action.optString("occurrenceKey", ""))) continue;
            return action;
        }
        return null;
    }

    private static void enqueueCompletion(Context context, Intent intent) {
        int widgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        JSONObject state = WidgetSnapshotStore.readForWidget(context, widgetId);
        JSONObject binding = WidgetBindingStore.read(context, widgetId);
        String recordId = intent.getStringExtra(EXTRA_RECORD_ID);
        String profileId = intent.getStringExtra(EXTRA_PROFILE_ID);
        String dateKey = intent.getStringExtra(EXTRA_DATE_KEY);
        String occurrenceKey = intent.getStringExtra(EXTRA_OCCURRENCE_KEY);
        String actionId = intent.getStringExtra(EXTRA_ACTION_ID);
        String revision = intent.getStringExtra(EXTRA_SNAPSHOT_REVISION);
        if (state == null || binding == null || WidgetSnapshotStore.isRedacted(state)
            || WidgetSnapshotStore.isConfigurationRequired(state)
            || !WidgetBindingStore.WORK_TASKS.equals(binding.optString("providerKind", ""))
            || !valid(recordId) || !valid(profileId) || !valid(dateKey)
            || !valid(occurrenceKey) || !valid(actionId) || !valid(revision)) return;
        if (!profileId.equals(WidgetSnapshotStore.optString(state, "profileId"))
            || !revision.equals(WidgetSnapshotStore.optString(state, "revision"))
            || !localTodayKey().equals(dateKey)
            || !"once".equals(occurrenceKey)) return;

        JSONObject work = WidgetSnapshotStore.optObject(state, "workTasks");
        JSONArray items = work == null ? new JSONArray() : WidgetSnapshotStore.optArray(work, "items");
        JSONObject target = null;
        for (int index = 0; index < items.length(); index += 1) {
            JSONObject candidate = items.optJSONObject(index);
            if (candidate != null && recordId.equals(WidgetSnapshotStore.optString(candidate, "id"))) {
                target = candidate;
                break;
            }
        }
        if (target == null || !dateKey.equals(WidgetSnapshotStore.optString(target, "dateKey"))) return;
        String expectedActionId = WidgetActionIds.workTaskComplete(profileId, recordId, occurrenceKey);
        if (!expectedActionId.equals(actionId)) return;
        try {
            JSONObject action = new JSONObject()
                .put("schemaVersion", 1)
                .put("actionId", actionId)
                .put("actionType", "workTask.complete")
                .put("sourceWidgetId", widgetId)
                .put("profileId", profileId)
                .put("recordId", recordId)
                .put("localDateKey", dateKey)
                .put("occurrenceKey", occurrenceKey)
                .put("snapshotRevision", revision)
                .put("createdAt", System.currentTimeMillis());
            if (WidgetActionStore.enqueue(context, action)) {
                AppWidgetManager.getInstance(context)
                    .updateAppWidget(widgetId, new CaizenWorkTasksWidget().buildViews(context, widgetId));
            }
        } catch (Exception ignored) {
            // A malformed launcher event must never mutate native or web data.
        }
    }

    static String localTodayKey() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    private static boolean valid(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
