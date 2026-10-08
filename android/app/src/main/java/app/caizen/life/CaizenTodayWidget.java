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
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Priority-first Today widget backed by the bounded v7 projection. */
public final class CaizenTodayWidget extends CaizenWidgetBase {
    static final String SIZE_SMALL = "small";
    static final String SIZE_MEDIUM = "medium";
    static final String SIZE_LARGE = "large";

    static final String ACTION_TODAY = "app.caizen.life.TODAY_ACTION";
    static final String ACTION_ROW = "app.caizen.life.TODAY_ROW";
    static final String EXTRA_ROW_ACTION = "rowAction";
    static final String EXTRA_KIND = "kind";
    static final String EXTRA_RECORD_ID = "recordId";
    static final String EXTRA_PROFILE_ID = "profileId";
    static final String EXTRA_DATE_KEY = "dateKey";
    static final String EXTRA_OCCURRENCE_KEY = "occurrenceKey";
    static final String EXTRA_ACTION_ID = "actionId";
    static final String EXTRA_SNAPSHOT_REVISION = "snapshotRevision";
    static final String EXTRA_TODAY_SIZE = "todaySize";
    static final String EXTRA_STALE = "todayStale";
    static final String EXTRA_ACTION_OPEN = "open";
    static final String EXTRA_ACTION_COMPLETE = "complete";
    static final String EXTRA_APP_WIDGET_ID = "appWidgetId";
    private static final String COMPLETE = EXTRA_ACTION_COMPLETE;
    private static final long STALE_AFTER_MS = 24L * 60L * 60L * 1000L;

    @Override
    protected String widgetProviderKind() {
        return WidgetBindingStore.TODAY;
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
        if (intent != null && ACTION_ROW.equals(intent.getAction())) {
            String rowAction = intent.getStringExtra(EXTRA_ROW_ACTION);
            String kind = intent.getStringExtra(EXTRA_KIND);
            String recordId = intent.getStringExtra(EXTRA_RECORD_ID);
            String profileId = intent.getStringExtra(EXTRA_PROFILE_ID);
            if (EXTRA_ACTION_OPEN.equals(rowAction)
                && valid(kind) && valid(recordId) && valid(profileId)) {
                if (!"task".equals(kind)) return;
                context.startActivity(deepLinkIntent(
                    context,
                    "today-row-" + recordId,
                    "lifehub",
                    "tasks",
                    recordId,
                    profileId
                ));
            } else if (EXTRA_ACTION_COMPLETE.equals(rowAction)) {
                enqueueCompletion(context, intent);
            }
            if (valid(profileId)) CaizenWidgetUpdater.refreshTodayForProfile(context, profileId);
            return;
        }
        if (intent != null && ACTION_TODAY.equals(intent.getAction())) {
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
        java.util.Map<SizeF, RemoteViews> views = new java.util.LinkedHashMap<>();
        views.put(new SizeF(110f, 110f), buildForSize(context, widgetId, SIZE_SMALL, snapshot(context, widgetId)));
        views.put(new SizeF(250f, 110f), buildForSize(context, widgetId, SIZE_MEDIUM, snapshot(context, widgetId)));
        views.put(new SizeF(250f, 220f), buildForSize(context, widgetId, SIZE_LARGE, snapshot(context, widgetId)));
        return new RemoteViews(views);
    }

    static String todaySizeForOptions(Bundle options) {
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
        return buildForSize(context, widgetId, todaySizeForOptions(options), snapshot(context, widgetId));
    }

    @Override
    protected RemoteViews buildFallbackViews(Context context, int widgetId) {
        Bundle options = widgetId == AppWidgetManager.INVALID_APPWIDGET_ID
            ? null : AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId);
        return buildFallbackForSize(
            context,
            widgetId,
            todaySizeForOptions(options),
            snapshot(context, widgetId)
        );
    }

    private RemoteViews buildForSize(
        Context context,
        int widgetId,
        String size,
        JSONObject snapshot
    ) {
        if (snapshot == null || WidgetSnapshotStore.isConfigurationRequired(snapshot)) {
            return buildFallbackForSize(context, widgetId, size, snapshot);
        }

        boolean redacted = WidgetSnapshotStore.isRedacted(snapshot);
        boolean stale = isStale(snapshot);
        JSONObject index = CaizenWidgetFormat.appearanceForWidget(context, widgetId);
        RemoteViews views = baseViews(context, widgetId, snapshot, layoutForSize(size));
        CaizenWidgetFormat.applyTodayPalette(context, views, index);
        setHeader(context, views, stale);
        setProgress(context, views, snapshot, redacted);
        if (SIZE_SMALL.equals(size)) {
            renderRows(context, views, widgetId, snapshot, redacted, stale, size);
        } else {
            configureCollection(context, views, widgetId, size, snapshot, stale, redacted);
            if (redacted) {
                showTodayEmpty(context, views, redactedTodaySummary(snapshot));
            } else if (!hasVisibleTodayItems(snapshot)) {
                showTodayEmpty(context, views, context.getString(R.string.widget_today_empty));
            } else {
                views.setViewVisibility(R.id.widget_today_empty, View.GONE);
            }
        }
        setStaleState(context, views, stale);
        setWidgetDescription(views, snapshot, stale);
        return views;
    }

    private RemoteViews buildFallbackForSize(
        Context context,
        int widgetId,
        String size,
        JSONObject state
    ) {
        RemoteViews views = baseViews(context, widgetId, state, layoutForSize(size));
        CaizenWidgetFormat.applyTodayPalette(context, views, CaizenWidgetFormat.appearanceForWidget(context, widgetId));
        setHeader(context, views, true);
        hideContent(views);
        views.setViewVisibility(R.id.widget_today_empty, View.VISIBLE);
        String message = fallbackMessage(context, state);
        views.setTextViewText(R.id.widget_today_empty, message);
        views.setContentDescription(R.id.widget_today_root, message);
        return views;
    }

    private RemoteViews baseViews(
        Context context,
        int widgetId,
        JSONObject snapshot,
        int layout
    ) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        String profileId = WidgetSnapshotStore.optString(snapshot, "profileId");
        views.setOnClickPendingIntent(
            R.id.widget_today_root,
            deepLink(context, "today-root-" + widgetId, "lifehub", "today", null, profileId)
        );
        views.setOnClickPendingIntent(R.id.widget_today_refresh, refreshIntent(context));
        return views;
    }

    private void setHeader(Context context, RemoteViews views, boolean stale) {
        String date = new SimpleDateFormat("EEEE, d MMM", Locale.getDefault()).format(new Date());
        views.setTextViewText(R.id.widget_today_title, context.getString(R.string.widget_today_name));
        views.setTextViewText(R.id.widget_today_date, date);
        views.setContentDescription(R.id.widget_today_title, "Caizen Today");
        views.setContentDescription(R.id.widget_today_date, "Today, " + date);
        views.setContentDescription(R.id.widget_today_refresh, "Refresh Today widget");
        views.setContentDescription(
            R.id.widget_today_root,
            stale ? "Caizen Today, needs refresh" : "Caizen Today"
        );
    }

    private void setProgress(
        Context context,
        RemoteViews views,
        JSONObject snapshot,
        boolean redacted
    ) {
        JSONObject today = WidgetSnapshotStore.optObject(snapshot, "today");
        int taskTotal = Math.max(0, today == null ? 0 : today.optInt("dueTodayTaskCount", 0));
        // Legacy v5/v6 snapshots may still carry mixed routine totals. The
        // Today widget is task-only even before the next v7 projection lands.
        int total = taskTotal;

        JSONArray accepted = WidgetActionStore.listAccepted(context);
        int completed = taskCompletedCount(snapshot, today, accepted);
        completed = Math.min(total, Math.max(0, completed));
        int progress = total == 0 ? 0 : Math.round((completed * 100f) / total);
        String summary = completed + " of " + total + " done";
        views.setTextViewText(R.id.widget_today_progress_summary, summary);
        views.setProgressBar(R.id.widget_today_progress, 100, progress, false);
        views.setContentDescription(R.id.widget_today_progress_summary, "Today progress: " + summary);
        views.setContentDescription(R.id.widget_today_progress, "Today progress: " + progress + " percent");

        int overdue = today == null ? 0 : Math.max(0, today.optInt("overdueTaskCount", 0));
        views.setViewVisibility(R.id.widget_today_overdue, overdue > 0 ? View.VISIBLE : View.GONE);
        if (overdue > 0) {
            String label = overdue + " overdue";
            views.setTextViewText(R.id.widget_today_overdue, label);
            views.setContentDescription(R.id.widget_today_overdue, label);
        }
        views.setTextViewText(
            R.id.widget_today_status,
            redacted ? context.getString(R.string.widget_today_names_hidden) : ""
        );
        views.setViewVisibility(R.id.widget_today_status, redacted ? View.VISIBLE : View.GONE);
    }

    private int taskCompletedCount(JSONObject snapshot, JSONObject today, JSONArray accepted) {
        if (today == null) return 0;
        return Math.max(0, today.optInt("completedDueCount", 0))
            + acceptedTaskCount(snapshot, accepted);
    }

    private int acceptedTaskCount(
        JSONObject snapshot,
        JSONArray accepted
    ) {
        JSONObject today = WidgetSnapshotStore.optObject(snapshot, "today");
        JSONArray items = today == null ? new JSONArray() : WidgetSnapshotStore.optArray(today, "items");
        String profileId = WidgetSnapshotStore.optString(snapshot, "profileId");
        String revision = WidgetSnapshotStore.optString(snapshot, "revision");
        int count = 0;
        for (int index = 0; index < items.length(); index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item == null || item.optBoolean("done", false)) continue;
            String kind = WidgetSnapshotStore.optString(item, "kind");
            if (!"task".equals(kind)) continue;
            String occurrence = WidgetSnapshotStore.optString(item, "occurrenceKey");
            String actionId = WidgetActionIds.taskComplete(
                profileId,
                WidgetSnapshotStore.optString(item, "id"),
                occurrence
            );
            if (matchingAction(accepted, actionId, profileId, revision, item) != null) count += 1;
        }
        return count;
    }

    private void renderRows(
        Context context,
        RemoteViews views,
        int widgetId,
        JSONObject snapshot,
        boolean redacted,
        boolean stale,
        String size
    ) {
        if (redacted) {
            views.setViewVisibility(R.id.widget_today_rows, View.GONE);
            showTodayEmpty(context, views, redactedTodaySummary(snapshot));
            return;
        }
        views.removeAllViews(R.id.widget_today_rows);
        views.setViewVisibility(R.id.widget_today_empty, View.GONE);
        JSONObject today = WidgetSnapshotStore.optObject(snapshot, "today");
        JSONArray items = today == null ? new JSONArray() : WidgetSnapshotStore.optArray(today, "items");
        int limit = SIZE_SMALL.equals(size) ? 1 : SIZE_MEDIUM.equals(size) ? 3 : 5;
        int shown = 0;
        JSONArray pending = WidgetActionStore.list(context);
        JSONArray accepted = WidgetActionStore.listAccepted(context);
        for (int index = 0; index < items.length() && shown < limit; index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) continue;
            if (!"task".equals(WidgetSnapshotStore.optString(item, "kind"))) continue;
            views.addView(
                R.id.widget_today_rows,
                buildTodayRow(context, item, snapshot, widgetId, redacted, stale, pending, accepted)
            );
            shown += 1;
        }
        if (shown == 0) {
            views.setViewVisibility(R.id.widget_today_empty, View.VISIBLE);
            String message = redacted
                ? context.getString(R.string.widget_today_names_hidden)
                : context.getString(R.string.widget_today_empty);
            views.setTextViewText(R.id.widget_today_empty, message);
            views.setContentDescription(R.id.widget_today_empty, message);
        }
    }

    private void configureCollection(
        Context context,
        RemoteViews views,
        int widgetId,
        String size,
        JSONObject snapshot,
        boolean stale,
        boolean redacted
    ) {
        String profileId = WidgetSnapshotStore.optString(snapshot, "profileId");
        Intent service = new Intent(context, CaizenTodayRemoteViewsService.class)
            .putExtra(EXTRA_APP_WIDGET_ID, widgetId)
            .putExtra(EXTRA_TODAY_SIZE, size)
            .putExtra(EXTRA_STALE, stale)
            .setData(android.net.Uri.parse(
                "caizen://today-widget/" + widgetId + "/" + profileId + "/" + size
            ));
        views.setRemoteAdapter(R.id.widget_today_rows, service);
        Intent rowTemplate = new Intent(context, CaizenTodayWidget.class)
            .setAction(ACTION_ROW)
            .setPackage(context.getPackageName())
            .putExtra(EXTRA_APP_WIDGET_ID, widgetId);
        views.setPendingIntentTemplate(
            R.id.widget_today_rows,
            PendingIntent.getBroadcast(
                context,
                widgetId,
                rowTemplate,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
            )
        );
        views.setEmptyView(R.id.widget_today_rows, R.id.widget_today_empty);
        views.setViewVisibility(R.id.widget_today_rows, redacted ? View.GONE : View.VISIBLE);
    }

    private static boolean hasVisibleTodayItems(JSONObject snapshot) {
        JSONObject today = WidgetSnapshotStore.optObject(snapshot, "today");
        JSONArray items = today == null ? new JSONArray() : WidgetSnapshotStore.optArray(today, "items");
        for (int index = 0; index < items.length(); index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) continue;
            if ("task".equals(WidgetSnapshotStore.optString(item, "kind"))) return true;
        }
        return false;
    }

    private static String redactedTodaySummary(JSONObject snapshot) {
        JSONObject today = WidgetSnapshotStore.optObject(snapshot, "today");
        int total = today == null ? 0 : Math.max(0, today.optInt("dueTodayTaskCount", 0));
        int completed = today == null ? 0 : Math.max(0, today.optInt("completedDueCount", 0));
        int overdue = today == null ? 0 : Math.max(0, today.optInt("overdueTaskCount", 0));
        int remaining = Math.max(0, total - Math.min(total, completed));
        if (total == 0) return "No due items today";
        String value = remaining + " due today";
        if (overdue > 0) value += " · " + overdue + " overdue";
        return value + " · open Caizen to complete";
    }

    private void showTodayEmpty(Context context, RemoteViews views, String message) {
        views.setViewVisibility(R.id.widget_today_empty, View.VISIBLE);
        views.setTextViewText(R.id.widget_today_empty, message);
        views.setContentDescription(R.id.widget_today_empty, message);
    }

    static RemoteViews buildTodayRow(
        Context context,
        JSONObject item,
        JSONObject snapshot,
        int widgetId,
        boolean redacted,
        boolean stale,
        JSONArray pending,
        JSONArray accepted
    ) {
        return buildTodayRow(
            context, item, snapshot, widgetId, redacted, stale, pending, accepted, true
        );
    }

    static RemoteViews buildTodayRow(
        Context context,
        JSONObject item,
        JSONObject snapshot,
        int widgetId,
        boolean redacted,
        boolean stale,
        JSONArray pending,
        JSONArray accepted,
        boolean directPendingIntents
    ) {
        String kind = WidgetSnapshotStore.optString(item, "kind");
        if (!"task".equals(kind)) return null;
        String profileId = WidgetSnapshotStore.optString(snapshot, "profileId");
        String revision = WidgetSnapshotStore.optString(snapshot, "revision");
        String recordId = WidgetSnapshotStore.optString(item, "id");
        String dateKey = WidgetSnapshotStore.optString(item, "dateKey");
        String occurrenceKey = WidgetSnapshotStore.optString(item, "occurrenceKey");
        String actionId = WidgetActionIds.taskComplete(profileId, recordId, occurrenceKey);
        boolean canonicalDone = item.optBoolean("done", false);
        JSONObject acceptedAction = matchingAction(accepted, actionId, profileId, revision, item);
        boolean acceptedDone = acceptedAction != null;
        if (canonicalDone && acceptedDone) {
            WidgetActionStore.clearAccepted(context, actionId);
            acceptedDone = false;
        }
        boolean queued = containsAction(pending, actionId);
        boolean failed = WidgetActionStore.failure(context, actionId) != null;
        boolean effectiveDone = canonicalDone || acceptedDone;
        boolean actionEnabled = !redacted && !effectiveDone && !queued && !stale
            && valid(profileId) && valid(recordId) && valid(dateKey) && valid(occurrenceKey)
            && valid(revision) && localTodayKey().equals(dateKey);
        String label = "Task";
        String title = redacted ? label : WidgetSnapshotStore.optString(item, "title");
        if (title.isEmpty()) title = label;
        String state;
        if (effectiveDone && acceptedDone) state = context.getString(R.string.widget_today_accepted);
        else if (effectiveDone) state = context.getString(R.string.widget_today_done);
        else if (queued) state = context.getString(R.string.widget_today_pending);
        else if (failed) state = context.getString(R.string.widget_today_failed);
        else if (stale) state = context.getString(R.string.widget_today_stale);
        else state = context.getString(R.string.widget_today_incomplete);

        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_today_row);
        row.setTextViewText(R.id.widget_today_row_kind, label.toUpperCase(Locale.ROOT));
        row.setTextViewText(R.id.widget_today_row_title, title);
        row.setTextViewText(R.id.widget_today_row_meta, dueLabel(item, kind));
        row.setTextViewText(R.id.widget_today_row_state, state);
        row.setViewVisibility(R.id.widget_today_row_complete, actionEnabled ? View.VISIBLE : View.GONE);
        row.setContentDescription(R.id.widget_today_row_body, label + ": " + title + ", " + state);
        row.setContentDescription(
            R.id.widget_today_row_complete,
            failed ? context.getString(R.string.widget_today_retry) : context.getString(R.string.widget_today_complete)
        );
        CaizenWidgetFormat.applyTodayRowPalette(
            context, row, CaizenWidgetFormat.appearanceForWidget(context, widgetId), effectiveDone, acceptedDone, failed, actionEnabled
        );

        Intent open = new Intent(context, CaizenTodayWidget.class)
            .setAction(ACTION_ROW)
            .setPackage(context.getPackageName())
            .putExtra(EXTRA_ROW_ACTION, EXTRA_ACTION_OPEN)
            .putExtra(EXTRA_KIND, kind)
            .putExtra(EXTRA_RECORD_ID, recordId)
            .putExtra(EXTRA_PROFILE_ID, profileId)
            .putExtra(EXTRA_APP_WIDGET_ID, widgetId);
        if (directPendingIntents) {
            row.setOnClickPendingIntent(
                R.id.widget_today_row_body,
                deepLink(context, "today-row-" + widgetId + "-" + recordId, "lifehub", "tasks", recordId, profileId)
            );
        } else {
            row.setOnClickFillInIntent(R.id.widget_today_row_body, open);
        }
        if (actionEnabled) {
            Intent complete = new Intent(context, CaizenTodayWidget.class)
                .setAction(directPendingIntents ? ACTION_TODAY : ACTION_ROW)
                .setPackage(context.getPackageName())
                .putExtra(EXTRA_ROW_ACTION, COMPLETE)
                .putExtra(EXTRA_KIND, kind)
                .putExtra(EXTRA_RECORD_ID, recordId)
                .putExtra(EXTRA_PROFILE_ID, profileId)
                .putExtra(EXTRA_DATE_KEY, dateKey)
                .putExtra(EXTRA_OCCURRENCE_KEY, occurrenceKey)
                .putExtra(EXTRA_ACTION_ID, actionId)
                .putExtra(EXTRA_SNAPSHOT_REVISION, revision)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
            if (directPendingIntents) {
                row.setOnClickPendingIntent(
                    R.id.widget_today_row_complete,
                    PendingIntent.getBroadcast(
                        context,
                        (actionId + ":" + widgetId).hashCode(),
                        complete,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    )
                );
            } else {
                row.setOnClickFillInIntent(R.id.widget_today_row_complete, complete);
            }
        }
        return row;
    }

    private void setStaleState(Context context, RemoteViews views, boolean stale) {
        views.setViewVisibility(R.id.widget_today_stale, stale ? View.VISIBLE : View.GONE);
        if (stale) {
            views.setTextViewText(R.id.widget_today_stale, context.getString(R.string.widget_today_stale));
            views.setContentDescription(R.id.widget_today_stale, "Open Caizen to refresh Today data");
        }
    }

    private void setWidgetDescription(RemoteViews views, JSONObject snapshot, boolean stale) {
        String description = stale ? "Caizen Today, needs refresh" : "Caizen Today";
        if (WidgetSnapshotStore.isRedacted(snapshot)) description += ", names hidden";
        description += ", tasks only";
        views.setContentDescription(R.id.widget_today_root, description);
    }

    private void hideContent(RemoteViews views) {
        views.setViewVisibility(R.id.widget_today_progress_summary, View.GONE);
        views.setViewVisibility(R.id.widget_today_progress, View.GONE);
        views.setViewVisibility(R.id.widget_today_overdue, View.GONE);
        views.setViewVisibility(R.id.widget_today_status, View.GONE);
        views.setViewVisibility(R.id.widget_today_stale, View.GONE);
        views.setViewVisibility(R.id.widget_today_rows, View.GONE);
        views.setViewVisibility(R.id.widget_today_next_context, View.GONE);
    }

    private String fallbackMessage(Context context, JSONObject state) {
        if (WidgetSnapshotStore.isConfigurationRequired(state)) {
            return context.getString(R.string.widget_today_configuration_required);
        }
        return WidgetSnapshotStore.readIndex(context) == null
            ? context.getString(R.string.widget_open_to_sync)
            : context.getString(R.string.widget_today_preparing);
    }

    private boolean isStale(JSONObject snapshot) {
        if (snapshot == null) return true;
        long updatedAt = snapshot.optLong("updatedAt", 0L);
        if (updatedAt <= 0L || System.currentTimeMillis() - updatedAt > STALE_AFTER_MS) return true;
        JSONObject today = WidgetSnapshotStore.optObject(snapshot, "today");
        JSONArray items = today == null ? new JSONArray() : WidgetSnapshotStore.optArray(today, "items");
        String todayKey = localTodayKey();
        for (int index = 0; index < items.length(); index += 1) {
            JSONObject item = items.optJSONObject(index);
            if (item != null && !todayKey.equals(WidgetSnapshotStore.optString(item, "dateKey"))) return true;
        }
        return false;
    }

    private int layoutForSize(String size) {
        if (SIZE_SMALL.equals(size)) return R.layout.widget_today_small;
        if (SIZE_MEDIUM.equals(size)) return R.layout.widget_today_medium;
        return R.layout.widget_today_large;
    }

    private static String dueLabel(JSONObject item, String kind) {
        long dueAt = item.optLong("dueAt", 0L);
        if ("task".equals(kind) && dueAt > 0L && dueAt < System.currentTimeMillis()) return "Overdue";
        if (dueAt > 0L) return CaizenWidgetFormat.timestamp(dueAt);
        // A task row with no dueAt is an undated fallback item (tier 4 of the
        // Today ranking), not a task genuinely due "today" — don't imply a
        // deadline that doesn't exist.
        if ("task".equals(kind)) return "No due date";
        return "Today";
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
            // Accepted state follows the exact action identity until a
            // fresh canonical projection confirms completion. The snapshot
            // revision intentionally is not part of this visual match:
            // canonical completion necessarily creates a new revision.
            if (!profileId.equals(action.optString("profileId", ""))
                || !dateKey.equals(action.optString("localDateKey", ""))
                || !occurrenceKey.equals(action.optString("occurrenceKey", ""))) continue;
            return action;
        }
        return null;
    }

    private static void enqueueCompletion(Context context, Intent intent) {
        int widgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        JSONObject snapshot = WidgetSnapshotStore.readForWidget(context, widgetId);
        JSONObject binding = WidgetBindingStore.read(context, widgetId);
        String kind = intent.getStringExtra(EXTRA_KIND);
        String recordId = intent.getStringExtra(EXTRA_RECORD_ID);
        String profileId = intent.getStringExtra(EXTRA_PROFILE_ID);
        String dateKey = intent.getStringExtra(EXTRA_DATE_KEY);
        String occurrenceKey = intent.getStringExtra(EXTRA_OCCURRENCE_KEY);
        String actionId = intent.getStringExtra(EXTRA_ACTION_ID);
        String revision = intent.getStringExtra(EXTRA_SNAPSHOT_REVISION);
        if (snapshot == null || binding == null || WidgetSnapshotStore.isRedacted(snapshot)
            || WidgetSnapshotStore.isConfigurationRequired(snapshot)
            || !"task".equals(kind)
            || !valid(recordId) || !valid(profileId) || !valid(dateKey)
            || !valid(occurrenceKey) || !valid(actionId) || !valid(revision)
        ) return;
        if (!profileId.equals(WidgetSnapshotStore.optString(snapshot, "profileId"))
            || !revision.equals(WidgetSnapshotStore.optString(snapshot, "revision"))
            || !localTodayKey().equals(dateKey)) return;

        JSONObject today = WidgetSnapshotStore.optObject(snapshot, "today");
        JSONArray items = today == null ? new JSONArray() : WidgetSnapshotStore.optArray(today, "items");
        JSONObject target = null;
        for (int index = 0; index < items.length(); index += 1) {
            JSONObject candidate = items.optJSONObject(index);
            if (candidate != null && recordId.equals(WidgetSnapshotStore.optString(candidate, "id"))
                && kind.equals(WidgetSnapshotStore.optString(candidate, "kind"))) {
                target = candidate;
                break;
            }
        }
        if (target == null || target.optBoolean("done", false)
            || !occurrenceKey.equals(WidgetSnapshotStore.optString(target, "occurrenceKey"))
            || !dateKey.equals(WidgetSnapshotStore.optString(target, "dateKey"))) return;

        String actionType = "task.complete";
        String expectedActionId = WidgetActionIds.taskComplete(profileId, recordId, occurrenceKey);
        if (!expectedActionId.equals(actionId)) return;
        try {
            JSONObject action = new JSONObject()
                .put("schemaVersion", 1)
                .put("actionId", actionId)
                .put("actionType", actionType)
                .put("sourceWidgetId", widgetId)
                .put("profileId", profileId)
                .put("recordId", recordId)
                .put("localDateKey", dateKey)
                .put("occurrenceKey", occurrenceKey)
                .put("snapshotRevision", revision)
                .put("createdAt", System.currentTimeMillis());
            if (WidgetActionStore.enqueue(context, action)) {
                AppWidgetManager.getInstance(context)
                    .updateAppWidget(widgetId, new CaizenTodayWidget().buildViews(context, widgetId));
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
