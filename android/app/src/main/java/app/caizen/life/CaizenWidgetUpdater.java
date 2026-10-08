package app.caizen.life;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import org.json.JSONArray;
import org.json.JSONObject;

/** Requests an immediate redraw of every installed Caizen widget. */
public final class CaizenWidgetUpdater {
    @SuppressWarnings("unchecked")
    private static final Class<? extends android.appwidget.AppWidgetProvider>[] PROVIDERS =
        new Class[] {
            CaizenCalendarWidget.class,
            CaizenRoutinesWidget.class,
            CaizenTodayWidget.class,
            CaizenWorkTasksWidget.class,
        };

    private CaizenWidgetUpdater() {
    }

    public static void refreshAll(Context context) {
        refresh(context, false);
    }

    /** Refreshes only Routines after a routine action; Calendar is untouched. */
    public static void refreshRoutines(Context context) {
        refresh(context, true);
    }

    /** Refreshes only installed Routines instances bound to a profile. */
    public static void refreshRoutinesForProfile(Context context, String profileId) {
        refreshProviderForProfile(context, CaizenRoutinesWidget.class, profileId, true, false);
    }

    /** Refreshes only installed Today instances bound to a profile. */
    public static void refreshTodayForProfile(Context context, String profileId) {
        refreshProviderForProfile(context, CaizenTodayWidget.class, profileId, false, true);
    }

    /** Refreshes only installed Work Tasks instances bound to a profile. */
    public static void refreshWorkTasksForProfile(Context context, String profileId) {
        refreshProviderForProfile(context, CaizenWorkTasksWidget.class, profileId, false, false);
    }

    /** Scopes acknowledgement redraws to the provider affected by each action. */
    public static void refreshForActions(Context context, JSONArray actions, JSONArray results) {
        if (actions == null || results == null) return;
        for (int index = 0; index < results.length(); index += 1) {
            JSONObject result = results.optJSONObject(index);
            if (result == null) continue;
            JSONObject action = actionFor(actions, result.optString("actionId", ""));
            if (action == null) continue;
            String profileId = action.optString("profileId", "");
            String type = action.optString("actionType", "");
            if ("routine.complete".equals(type)) {
                refreshTodayForProfile(context, profileId);
                refreshRoutinesForProfile(context, profileId);
            }
            else if ("task.complete".equals(type)) refreshTodayForProfile(context, profileId);
            else if ("workTask.complete".equals(type)) refreshWorkTasksForProfile(context, profileId);
        }
    }

    private static void refresh(Context context, boolean routinesOnly) {
        Context appContext = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(appContext);

        for (Class<? extends android.appwidget.AppWidgetProvider> provider : PROVIDERS) {
            if (routinesOnly && provider != CaizenRoutinesWidget.class) continue;
            int[] ids = manager.getAppWidgetIds(new ComponentName(appContext, provider));
            if (ids == null || ids.length == 0) continue;

            if (provider == CaizenRoutinesWidget.class) {
                manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_routines_list);
            }
            if (provider == CaizenTodayWidget.class) {
                manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_today_rows);
            }

            Intent intent = new Intent(appContext, provider)
                .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                .addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
            appContext.sendBroadcast(intent);
        }
    }

    private static void refreshProviderForProfile(
        Context context,
        Class<? extends android.appwidget.AppWidgetProvider> provider,
        String profileId,
        boolean routinesList,
        boolean todayList
    ) {
        if (profileId == null || profileId.trim().isEmpty()) return;
        Context appContext = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(appContext);
        int[] ids = manager.getAppWidgetIds(new ComponentName(appContext, provider));
        if (ids == null || ids.length == 0) return;
        java.util.ArrayList<Integer> matching = new java.util.ArrayList<>();
        for (int id : ids) {
            JSONObject binding = WidgetBindingStore.read(appContext, id);
            if (binding != null && profileId.equals(binding.optString("profileId", ""))) matching.add(id);
        }
        if (matching.isEmpty()) return;
        int[] targetIds = new int[matching.size()];
        for (int index = 0; index < matching.size(); index += 1) targetIds[index] = matching.get(index);
        if (routinesList) manager.notifyAppWidgetViewDataChanged(targetIds, R.id.widget_routines_list);
        if (todayList) manager.notifyAppWidgetViewDataChanged(targetIds, R.id.widget_today_rows);
        Intent intent = new Intent(appContext, provider)
            .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, targetIds)
            .addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        appContext.sendBroadcast(intent);
    }

    private static JSONObject actionFor(JSONArray actions, String actionId) {
        if (actionId == null || actionId.isEmpty()) return null;
        for (int index = 0; index < actions.length(); index += 1) {
            JSONObject action = actions.optJSONObject(index);
            if (action != null && actionId.equals(action.optString("actionId", ""))) return action;
        }
        return null;
    }
}
