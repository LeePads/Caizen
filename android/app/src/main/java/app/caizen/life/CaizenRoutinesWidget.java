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
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Responsive, action-first Routines widget backed by the sanitized snapshot. */
public class CaizenRoutinesWidget extends CaizenWidgetBase {
    static final String ACTION_COMPLETE = "app.caizen.life.ROUTINE_COMPLETE";
    static final String ACTION_ROW = "app.caizen.life.ROUTINE_ROW";
    static final String EXTRA_ROW_ACTION = "rowAction";
    static final String EXTRA_ACTION_OPEN = "open";
    static final String EXTRA_ACTION_COMPLETE = "complete";
    static final String EXTRA_APP_WIDGET_ID = "appWidgetId";
    static final String EXTRA_ACTION_ID = "actionId";
    static final String EXTRA_PROFILE_ID = "profileId";
    static final String EXTRA_ROUTINE_ID = "routineId";
    static final String EXTRA_DATE_KEY = "dateKey";
    static final String EXTRA_OCCURRENCE_KEY = "occurrenceKey";
    static final String EXTRA_SNAPSHOT_REVISION = "snapshotRevision";
    static final String EXTRA_ROUTINES_SIZE = "routinesSize";
    static final String EXTRA_STALE = "routinesStale";

    static final String SIZE_SMALL = "small";
    static final String SIZE_MEDIUM = "medium";
    static final String SIZE_LARGE = "large";
    private static final long STALE_AFTER_MS = 24L * 60L * 60L * 1000L;

    @Override
    protected String widgetProviderKind() {
        return WidgetBindingStore.ROUTINES;
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
            if (EXTRA_ACTION_OPEN.equals(rowAction)) {
                String routineId = intent.getStringExtra(EXTRA_ROUTINE_ID);
                String profileId = intent.getStringExtra(EXTRA_PROFILE_ID);
                if (valid(routineId) && valid(profileId)) {
                    context.startActivity(deepLinkIntent(context, "routine-widget-" + routineId,
                        "lifehub", "routine", routineId, profileId));
                }
            } else if (EXTRA_ACTION_COMPLETE.equals(rowAction)) {
                enqueueCompletion(context, intent);
            }
            CaizenWidgetUpdater.refreshRoutines(context);
            return;
        }
        if (intent != null && ACTION_COMPLETE.equals(intent.getAction())) {
            enqueueCompletion(context, intent);
            CaizenWidgetUpdater.refreshRoutines(context);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    protected RemoteViews buildViews(Context context, int appWidgetId) {
        Bundle options = appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID
            ? null
            : AppWidgetManager.getInstance(context).getAppWidgetOptions(appWidgetId);
        return buildForSize(context, appWidgetId, sizeForOptions(options), snapshot(context, appWidgetId));
    }

    @Override
    protected RemoteViews buildFallbackViews(Context context, int appWidgetId) {
        Bundle options = appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID
            ? null
            : AppWidgetManager.getInstance(context).getAppWidgetOptions(appWidgetId);
        return buildForSize(context, appWidgetId, sizeForOptions(options), null);
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
        JSONObject current = snapshot(context, widgetId);
        Map<SizeF, RemoteViews> views = new LinkedHashMap<>();
        views.put(new SizeF(110f, 110f), buildForSize(context, widgetId, SIZE_SMALL, current));
        views.put(new SizeF(250f, 110f), buildForSize(context, widgetId, SIZE_MEDIUM, current));
        views.put(new SizeF(250f, 220f), buildForSize(context, widgetId, SIZE_LARGE, current));
        return new RemoteViews(views);
    }

    static String sizeForOptions(Bundle options) {
        if (options == null) return SIZE_LARGE;
        int width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (width > 0 && (width < 180 || height < 150)) return SIZE_SMALL;
        if (width > 0 && (width < 300 || height < 230)) return SIZE_MEDIUM;
        return SIZE_LARGE;
    }

    private RemoteViews buildForSize(
        Context context,
        int widgetId,
        String size,
        JSONObject snapshot
    ) {
        JSONObject index = CaizenWidgetFormat.appearanceForWidget(context, widgetId);
        RemoteViews views = baseViews(context, widgetId, size, snapshot);
        CaizenWidgetFormat.applyRoutinesPalette(context, views, index);
        setHeader(context, views, snapshot);

        if (snapshot == null || WidgetSnapshotStore.isConfigurationRequired(snapshot)) {
            hideContent(views);
            showEmpty(context, views, fallbackMessage(context, snapshot));
            setWidgetDescription(views, fallbackMessage(context, snapshot));
            return views;
        }

        boolean redacted = WidgetSnapshotStore.isRedacted(snapshot);
        boolean stale = isStale(snapshot);
        setStaleState(context, views, stale);
        JSONArray pending = WidgetActionStore.list(context);
        JSONArray accepted = WidgetActionStore.listAccepted(context);
        JSONObject binding = WidgetBindingStore.read(context, widgetId);
        String routineFilter = WidgetBindingStore.routineFilter(binding);
        JSONArray routines = filteredRoutines(snapshot, routineFilter);
        setSummary(context, views, snapshot, routines, accepted, routineFilter);

        if (SIZE_SMALL.equals(size)) {
            hideCollection(views);
            views.removeAllViews(R.id.widget_routines_small_row_container);
            if (redacted || routines.length() == 0) {
                String message = redacted
                    ? context.getString(R.string.widget_routines_names_hidden)
                    : context.getString(R.string.widget_routines_empty);
                showEmpty(context, views, messageForEmpty(context, snapshot, message));
            } else {
                JSONObject next = nextIncomplete(
                    routines,
                    WidgetSnapshotStore.optString(snapshot, "profileId"),
                    WidgetSnapshotStore.optString(snapshot, "revision"),
                    accepted
                );
                if (next == null) {
                    views.setViewVisibility(R.id.widget_routines_empty, View.GONE);
                } else {
                    RemoteViews row = buildRoutineRow(
                        context,
                        next,
                        WidgetSnapshotStore.optString(snapshot, "profileId"),
                        widgetId,
                        WidgetSnapshotStore.optString(snapshot, "revision"),
                        stale,
                        index,
                        pending,
                        accepted,
                        true
                    );
                    views.addView(R.id.widget_routines_small_row_container, row);
                    views.setViewVisibility(R.id.widget_routines_empty, View.GONE);
                }
            }
            setWidgetDescription(views, widgetDescription(context, snapshot, stale, routineFilter));
            return views;
        }

        views.setViewVisibility(R.id.widget_routines_small_row_container, View.GONE);
        configureCollection(context, views, widgetId, size, snapshot, stale, redacted);
        boolean hasVisibleRows = !redacted && routines.length() > 0;
        if (redacted) {
            showEmpty(context, views, context.getString(R.string.widget_routines_names_hidden));
        } else if (!hasVisibleRows) {
            showEmpty(context, views, messageForEmpty(
                context,
                snapshot,
                context.getString(R.string.widget_routines_empty)
            ));
        } else {
            views.setViewVisibility(R.id.widget_routines_empty, View.GONE);
        }
        setWidgetDescription(views, widgetDescription(context, snapshot, stale, routineFilter));
        return views;
    }

    private RemoteViews baseViews(Context context, int widgetId, String size, JSONObject snapshot) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutForSize(size));
        String profileId = WidgetSnapshotStore.optString(snapshot, "profileId");
        views.setOnClickPendingIntent(
            R.id.widget_routines_root,
            deepLink(context, "routines-root-" + widgetId, "lifehub", "routines", null, profileId)
        );
        views.setOnClickPendingIntent(R.id.widget_routines_refresh, refreshIntent(context));
        return views;
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
        String routineFilter = WidgetBindingStore.routineFilter(
            WidgetBindingStore.read(context, widgetId)
        );
        Intent service = new Intent(context, CaizenRoutinesRemoteViewsService.class)
            .putExtra(EXTRA_APP_WIDGET_ID, widgetId)
            .putExtra(EXTRA_ROUTINES_SIZE, size)
            .putExtra(EXTRA_STALE, stale)
            .setData(android.net.Uri.parse(
                "caizen://routines-widget/" + widgetId + "/" + profileId + "/" + size
                    + "/" + routineFilter
            ));
            views.setRemoteAdapter(R.id.widget_routines_list, service);
        // Keep the collection template explicitly addressed to this provider.
        // The launcher supplies only the row-specific fill-in extras; the
        // widget ID is retained in the template as a second source of truth
        // for hosts that do not preserve custom fill-in extras reliably.
        Intent rowTemplate = new Intent(context, CaizenRoutinesWidget.class)
            .setAction(ACTION_ROW)
            .setPackage(context.getPackageName())
            .putExtra(EXTRA_APP_WIDGET_ID, widgetId);
        views.setPendingIntentTemplate(R.id.widget_routines_list,
            PendingIntent.getBroadcast(context, widgetId, rowTemplate,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE));
        views.setEmptyView(R.id.widget_routines_list, R.id.widget_routines_empty);
        views.setViewVisibility(R.id.widget_routines_list, redacted ? View.GONE : View.VISIBLE);
    }

    private void setHeader(Context context, RemoteViews views, JSONObject snapshot) {
        views.setTextViewText(R.id.widget_routines_title, context.getString(R.string.widget_routines_name));
        views.setTextViewText(R.id.widget_routines_context, todayLabel());
        String profileName = WidgetSnapshotStore.isRedacted(snapshot)
            ? "Caizen" : WidgetSnapshotStore.optString(snapshot, "profileName");
        views.setTextViewText(
            R.id.widget_routines_profile,
            profileName.isEmpty() ? "Caizen" : profileName
        );
        views.setContentDescription(R.id.widget_routines_title, "Caizen Routines");
        views.setContentDescription(R.id.widget_routines_context, "Routines for " + todayLabel());
        views.setContentDescription(R.id.widget_routines_refresh, "Refresh Routines");
    }

    private void setSummary(
        Context context,
        RemoteViews views,
        JSONObject snapshot,
        JSONArray routines,
        JSONArray accepted,
        String routineFilter
    ) {
        // total/canonicalDone come from the canonical per-filter totals in
        // the snapshot (routineTotalsByFilter), computed web-side over the
        // FULL due-routine set for this filter — never from routines.length(),
        // which is both capped to MAX_ROUTINES and, for size=SMALL, further
        // reduced to whatever fits the small layout. Using the row array's
        // length as the denominator here previously made the percentage
        // drift whenever the row list didn't equal the true due-routine
        // count for the configured filter.
        int acceptedDone = 0;
        String profileId = WidgetSnapshotStore.optString(snapshot, "profileId");
        String revision = WidgetSnapshotStore.optString(snapshot, "revision");
        for (int index = 0; index < routines.length(); index += 1) {
            JSONObject routine = routines.optJSONObject(index);
            if (routine == null) continue;
            if (!routine.optBoolean("done", false)
                && containsMatchingAction(accepted, profileId, revision, routine)) {
                acceptedDone += 1;
            }
        }

        JSONObject totalsByFilter = snapshot == null
            ? null
            : snapshot.optJSONObject("routineTotalsByFilter");
        JSONObject filterTotals = totalsByFilter == null
            ? null
            : totalsByFilter.optJSONObject(routineFilter);
        int total = filterTotals == null ? routines.length() : filterTotals.optInt("total", routines.length());
        int canonicalDone = filterTotals == null ? 0 : filterTotals.optInt("done", 0);

        int effectiveDone = Math.min(total, canonicalDone + acceptedDone);
        int progress = total == 0 ? 0 : Math.round((effectiveDone * 100f) / total);
        int remaining = Math.max(0, total - effectiveDone);
        String summary;
        if (remaining == 0 && progress == 0 && total == 0) {
            summary = context.getString(R.string.widget_routines_empty);
        } else if (remaining == 0 && progress >= 100) {
            summary = context.getString(R.string.widget_routines_all_done);
        } else {
            summary = progress + "% complete";
            if (remaining > 0) summary += " · " + remaining + " remaining";
        }
        if (snapshot != null && snapshot.optInt("routineRowsOmitted", 0) > 0) {
            summary += " · more in Caizen";
        }
        views.setTextViewText(R.id.widget_routines_summary, summary);
        views.setProgressBar(R.id.widget_routines_progress_bar, 100, progress, false);
        views.setContentDescription(R.id.widget_routines_summary, "Routine progress: " + summary);
        views.setContentDescription(R.id.widget_routines_progress_bar, "Routine progress: " + progress + " percent");
    }

    private void setStaleState(Context context, RemoteViews views, boolean stale) {
        views.setViewVisibility(R.id.widget_routines_stale, stale ? View.VISIBLE : View.GONE);
        views.setTextViewText(
            R.id.widget_routines_stale,
            stale ? context.getString(R.string.widget_routines_stale) : ""
        );
        if (stale) {
            views.setContentDescription(R.id.widget_routines_stale, "Open Caizen to refresh Routine data");
        }
    }

    private void hideContent(RemoteViews views) {
        hideCollection(views);
        views.setViewVisibility(R.id.widget_routines_summary, View.GONE);
        views.setViewVisibility(R.id.widget_routines_progress_bar, View.GONE);
        views.setViewVisibility(R.id.widget_routines_status, View.GONE);
        views.setViewVisibility(R.id.widget_routines_stale, View.GONE);
    }

    private void hideCollection(RemoteViews views) {
        views.setViewVisibility(R.id.widget_routines_list, View.GONE);
        views.setViewVisibility(R.id.widget_routines_small_row_container, View.GONE);
    }

    private void showEmpty(Context context, RemoteViews views, String message) {
        views.setViewVisibility(R.id.widget_routines_empty, View.VISIBLE);
        views.setTextViewText(R.id.widget_routines_empty, message);
        views.setContentDescription(R.id.widget_routines_empty, message);
    }

    private String messageForEmpty(Context context, JSONObject snapshot, String fallback) {
        return snapshot != null && snapshot.optInt("routineRowsOmitted", 0) > 0
            ? context.getString(R.string.widget_routines_more_available)
            : fallback;
    }

    private JSONArray filteredRoutines(JSONObject snapshot, String filter) {
        JSONArray source = WidgetSnapshotStore.optArray(snapshot, "routines");
        JSONArray filtered = new JSONArray();
        for (int index = 0; index < source.length(); index += 1) {
            JSONObject routine = source.optJSONObject(index);
            if (routine != null && WidgetBindingStore.routineMatchesFilter(routine, filter)) {
                filtered.put(routine);
            }
        }
        return filtered;
    }

    private String fallbackMessage(Context context, JSONObject snapshot) {
        if (WidgetSnapshotStore.isConfigurationRequired(snapshot)) {
            return context.getString(R.string.widget_routines_configuration_required);
        }
        return WidgetSnapshotStore.readIndex(context) == null
            ? context.getString(R.string.widget_open_to_sync)
            : context.getString(R.string.widget_routines_preparing);
    }

    private String widgetDescription(
        Context context,
        JSONObject snapshot,
        boolean stale,
        String routineFilter
    ) {
        if (stale) return context.getString(R.string.widget_routines_stale);
        // Match the visible progress bar's denominator: the configured
        // filter's canonical total, not the global unfiltered routineProgress
        // field, which only agrees with the bar when the filter is "all".
        JSONObject totalsByFilter = snapshot == null
            ? null
            : snapshot.optJSONObject("routineTotalsByFilter");
        JSONObject filterTotals = totalsByFilter == null
            ? null
            : totalsByFilter.optJSONObject(routineFilter);
        int progress;
        if (filterTotals != null) {
            int total = filterTotals.optInt("total", 0);
            int done = filterTotals.optInt("done", 0);
            progress = total == 0 ? 0 : Math.round((done * 100f) / total);
        } else {
            progress = WidgetSnapshotStore.optInt(snapshot, "routineProgress");
        }
        String summary = progress + "% complete";
        return WidgetSnapshotStore.isRedacted(snapshot)
            ? "Caizen Routines, names hidden, " + summary
            : "Caizen Routines, " + summary;
    }

    private boolean isStale(JSONObject snapshot) {
        long updatedAt = snapshot == null ? 0L : snapshot.optLong("updatedAt", 0L);
        if (updatedAt <= 0L || System.currentTimeMillis() - updatedAt > STALE_AFTER_MS) return true;
        JSONArray routines = WidgetSnapshotStore.optArray(snapshot, "routines");
        String today = localTodayKey();
        for (int index = 0; index < routines.length(); index += 1) {
            JSONObject routine = routines.optJSONObject(index);
            if (routine != null && !today.equals(WidgetSnapshotStore.optString(routine, "dateKey"))) {
                return true;
            }
        }
        return false;
    }

    private int layoutForSize(String size) {
        if (SIZE_SMALL.equals(size)) return R.layout.widget_routines_small;
        if (SIZE_MEDIUM.equals(size)) return R.layout.widget_routines_medium;
        return R.layout.widget_routines;
    }

    static RemoteViews buildRoutineRow(
        Context context,
        JSONObject routine,
        String profileId,
        int widgetId,
        String snapshotRevision,
        boolean stale,
        JSONObject index,
        JSONArray pending,
        JSONArray accepted,
        boolean directPendingIntents
    ) {
        String routineId = WidgetSnapshotStore.optString(routine, "id");
        String dateKey = WidgetSnapshotStore.optString(routine, "dateKey");
        String occurrenceKey = WidgetSnapshotStore.optString(routine, "occurrenceKey");
        String actionId = WidgetActionIds.routineComplete(profileId, routineId, occurrenceKey);
        boolean done = routine.optBoolean("done", false);
        boolean hasPendingAction = containsAction(pending, actionId);
        JSONObject acceptedAction = matchingAction(accepted, profileId, snapshotRevision, routine);
        boolean isAccepted = acceptedAction != null;
        boolean syncPending = isAccepted
            && !"synced".equals(acceptedAction.optString("syncState", ""));
        boolean isPending = hasPendingAction && !isAccepted;
        boolean failed = WidgetActionStore.failure(context, actionId) != null;
        boolean effectiveDone = done || isAccepted;
        if (done && isAccepted) WidgetActionStore.clearAccepted(context, actionId);
        boolean actionEnabled = !WidgetSnapshotStore.isRedacted(
                WidgetSnapshotStore.readForWidget(context, widgetId))
            && !effectiveDone && !hasPendingAction && !stale
            && localTodayKey().equals(dateKey)
            && valid(profileId) && valid(routineId) && valid(occurrenceKey) && valid(snapshotRevision);
        String state;
        if (effectiveDone && isAccepted && !done && syncPending) {
            state = context.getString(R.string.widget_routines_accepted);
        } else if (effectiveDone) state = context.getString(R.string.widget_routines_done);
        else if (isPending) state = context.getString(R.string.widget_routines_pending);
        else if (failed) state = context.getString(R.string.widget_routines_failed);
        else if (!actionEnabled) state = context.getString(R.string.widget_routines_refresh_needed);
        else state = context.getString(R.string.widget_routines_incomplete);

        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_routine_row);
        String title = WidgetSnapshotStore.optString(routine, "title");
        row.setTextViewText(R.id.widget_routine_title, title.isEmpty() ? "Routine" : title);
        row.setTextViewText(R.id.widget_routine_state, state);
        row.setViewVisibility(R.id.widget_routine_check, effectiveDone ? View.VISIBLE : View.GONE);
        row.setViewVisibility(R.id.widget_routine_complete, actionEnabled ? View.VISIBLE : View.GONE);
        row.setContentDescription(R.id.widget_routine_body, title + ", " + state);
        row.setContentDescription(
            R.id.widget_routine_complete,
            failed ? context.getString(R.string.widget_routines_retry) : context.getString(R.string.widget_routines_complete)
        );
        CaizenWidgetFormat.applyRoutineRowPalette(
            context, row, CaizenWidgetFormat.appearanceForWidget(context, widgetId), effectiveDone, isAccepted, failed, actionEnabled
        );

        Intent open = rowIntent(context, EXTRA_ACTION_OPEN, widgetId, profileId, routineId);
        Intent complete = rowIntent(context, EXTRA_ACTION_COMPLETE, widgetId, profileId, routineId)
            .putExtra(EXTRA_ACTION_ID, actionId)
            .putExtra(EXTRA_DATE_KEY, dateKey)
            .putExtra(EXTRA_OCCURRENCE_KEY, occurrenceKey)
            .putExtra(EXTRA_SNAPSHOT_REVISION, snapshotRevision);
        if (directPendingIntents) {
            row.setOnClickPendingIntent(R.id.widget_routine_body, directIntent(context, open, widgetId, routineId, false));
            if (actionEnabled) {
                row.setOnClickPendingIntent(R.id.widget_routine_complete,
                    directIntent(context, complete, widgetId, routineId, true));
            }
        } else {
            row.setOnClickFillInIntent(R.id.widget_routine_body, open);
            if (actionEnabled) row.setOnClickFillInIntent(R.id.widget_routine_complete, complete);
        }
        return row;
    }

    private static Intent rowIntent(Context context, String action, int widgetId, String profileId, String routineId) {
        return new Intent(context, CaizenRoutinesWidget.class)
            .setAction(ACTION_ROW)
            .setPackage(context.getPackageName())
            .putExtra(EXTRA_ROW_ACTION, action)
            .putExtra(EXTRA_APP_WIDGET_ID, widgetId)
            .putExtra(EXTRA_PROFILE_ID, profileId)
            .putExtra(EXTRA_ROUTINE_ID, routineId);
    }

    private static PendingIntent directIntent(
        Context context,
        Intent intent,
        int widgetId,
        String routineId,
        boolean completion
    ) {
        int requestCode = (routineId + ":" + widgetId + ":" + completion).hashCode();
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static JSONObject nextIncomplete(
        JSONArray routines,
        String profileId,
        String snapshotRevision,
        JSONArray accepted
    ) {
        for (int index = 0; index < routines.length(); index += 1) {
            JSONObject routine = routines.optJSONObject(index);
            if (routine != null && !routine.optBoolean("done", false)
                && !containsMatchingAction(accepted, profileId, snapshotRevision, routine)) {
                return routine;
            }
        }
        return null;
    }

    private static boolean containsAction(JSONArray actions, String actionId) {
        for (int index = 0; index < actions.length(); index += 1) {
            JSONObject action = actions.optJSONObject(index);
            if (action != null && actionId.equals(action.optString("actionId", ""))) return true;
        }
        return false;
    }

    private static boolean containsMatchingAction(
        JSONArray actions,
        String profileId,
        String snapshotRevision,
        JSONObject routine
    ) {
        return matchingAction(actions, profileId, snapshotRevision, routine) != null;
    }

    private static JSONObject matchingAction(
        JSONArray actions,
        String profileId,
        String snapshotRevision,
        JSONObject routine
    ) {
        String routineId = WidgetSnapshotStore.optString(routine, "id");
        String dateKey = WidgetSnapshotStore.optString(routine, "dateKey");
        String occurrenceKey = WidgetSnapshotStore.optString(routine, "occurrenceKey");
        String actionId = WidgetActionIds.routineComplete(profileId, routineId, occurrenceKey);
        for (int index = 0; index < actions.length(); index += 1) {
            JSONObject action = actions.optJSONObject(index);
            if (action == null || !actionId.equals(action.optString("actionId", ""))) continue;
            if (!profileId.equals(action.optString("profileId", ""))) continue;
            // The accepted overlay is an identity-level optimistic state.
            // Canonical projection revisions change after the save, so a
            // revision match here would make an acknowledged action vanish
            // while the launcher still holds the old incomplete projection.
            // In particular, do not use
            // `snapshotRevision.equals(action.optString("snapshotRevision", ""))`.
            if (!dateKey.equals(action.optString("localDateKey", ""))) continue;
            if (!occurrenceKey.equals(action.optString("occurrenceKey", ""))) continue;
            return action;
        }
        return null;
    }

    private static void setWidgetDescription(RemoteViews views, String description) {
        views.setContentDescription(R.id.widget_routines_root, description);
    }

    private static void enqueueCompletion(Context context, Intent intent) {
        int widgetId = intent.getIntExtra(EXTRA_APP_WIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        JSONObject snapshot = WidgetSnapshotStore.readForWidget(context, widgetId);
        String actionId = intent.getStringExtra(EXTRA_ACTION_ID);
        String profileId = intent.getStringExtra(EXTRA_PROFILE_ID);
        String routineId = intent.getStringExtra(EXTRA_ROUTINE_ID);
        String dateKey = intent.getStringExtra(EXTRA_DATE_KEY);
        String occurrenceKey = intent.getStringExtra(EXTRA_OCCURRENCE_KEY);
        String revision = intent.getStringExtra(EXTRA_SNAPSHOT_REVISION);
        if (WidgetSnapshotStore.isRedacted(snapshot) || WidgetSnapshotStore.isConfigurationRequired(snapshot)
            || snapshot == null || !valid(actionId) || !valid(profileId) || !valid(routineId)
            || !valid(dateKey) || !valid(occurrenceKey) || !valid(revision)) return;
        if (!profileId.equals(WidgetSnapshotStore.optString(snapshot, "profileId"))
            || !revision.equals(WidgetSnapshotStore.optString(snapshot, "revision"))
            || !localTodayKey().equals(dateKey)) return;

        JSONArray routines = WidgetSnapshotStore.optArray(snapshot, "routines");
        JSONObject target = null;
        for (int index = 0; index < routines.length(); index += 1) {
            JSONObject candidate = routines.optJSONObject(index);
            if (candidate != null && routineId.equals(WidgetSnapshotStore.optString(candidate, "id"))) {
                target = candidate;
                break;
            }
        }
        if (target == null || target.optBoolean("done", false)
            || !occurrenceKey.equals(WidgetSnapshotStore.optString(target, "occurrenceKey"))) return;
        String expectedActionId = WidgetActionIds.routineComplete(profileId, routineId, occurrenceKey);
        if (!expectedActionId.equals(actionId)) return;

        try {
            JSONObject action = new JSONObject()
                .put("schemaVersion", 1)
                .put("actionId", actionId)
                .put("actionType", "routine.complete")
                .put("sourceWidgetId", widgetId)
                .put("profileId", profileId)
                .put("recordId", routineId)
                .put("localDateKey", dateKey)
                .put("occurrenceKey", occurrenceKey)
                .put("snapshotRevision", revision)
                .put("createdAt", System.currentTimeMillis());
            WidgetActionStore.enqueue(context, action);
        } catch (Exception ignored) {
            // A malformed launcher event must never mutate native or web data.
        }
    }

    private static String todayLabel() {
        return new SimpleDateFormat("EEEE, d MMM", Locale.getDefault()).format(new Date());
    }

    static String localTodayKey() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    private static boolean valid(String value) { return value != null && !value.trim().isEmpty(); }
}
