package app.caizen.life;

import android.content.Context;
import android.content.SharedPreferences;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import org.json.JSONObject;

/** Private per-widget configuration; never a source of domain truth. */
public final class WidgetBindingStore {
    private static final String PREFS_NAME = "caizen_widget_bindings";
    private static final String KEY_PREFIX = "widget:";
    private static final String PROFILE_ID = "profileId";
    private static final String PRIVACY_MODE = "privacyMode";
    private static final String PROVIDER_KIND = "providerKind";
    private static final String INCLUDE_ROUTINES = "includeRoutines";
    private static final String ROUTINE_FILTER = "routineFilter";
    private static final String APPEARANCE = "appearance";
    public static final String APPEARANCE_SYSTEM = "system";
    public static final String APPEARANCE_LIGHT = "minimalLight";
    public static final String APPEARANCE_DARK = "minimalDark";
    public static final String REDACTED = "redacted";
    public static final String NAMES = "names";
    public static final String CALENDAR = "calendar";
    public static final String ROUTINES = "routines";
    public static final String TODAY = "today";
    public static final String WORK_TASKS = "workTasks";
    public static final String ROUTINE_FILTER_ALL = "all";
    public static final String ROUTINE_FILTER_DAILY = "daily";
    public static final String ROUTINE_FILTER_WEEKLY = "weekly";
    public static final String ROUTINE_FILTER_BIWEEKLY = "biweekly";
    public static final String ROUTINE_FILTER_MONTHLY = "monthly";

    private WidgetBindingStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static boolean bind(Context context, int widgetId, String profileId, String privacyMode) {
        return bind(context, widgetId, providerKindForWidget(context, widgetId), profileId,
            privacyMode, true);
    }

    public static boolean bind(
        Context context,
        int widgetId,
        String providerKind,
        String profileId,
        String privacyMode,
        boolean includeRoutines
    ) {
        return bind(context, widgetId, providerKind, profileId, privacyMode,
            includeRoutines, ROUTINE_FILTER_ALL);
    }

    public static boolean bind(
        Context context,
        int widgetId,
        String providerKind,
        String profileId,
        String privacyMode,
        boolean includeRoutines,
        String routineFilter
    ) {
        return bind(context, widgetId, providerKind, profileId, privacyMode,
            includeRoutines, routineFilter, appearance(read(context, widgetId)));
    }

    public static boolean bind(
        Context context,
        int widgetId,
        String providerKind,
        String profileId,
        String privacyMode,
        boolean includeRoutines,
        String routineFilter,
        String appearance
    ) {
        if (widgetId < 0 || empty(profileId)) return false;
        if (!isProviderKind(providerKind)) return false;
        String mode = NAMES.equals(privacyMode) ? NAMES : REDACTED;
        String filter = normalizeRoutineFilter(routineFilter);
        try {
            JSONObject value = new JSONObject()
                .put(PROFILE_ID, profileId.trim())
                .put(PRIVACY_MODE, mode)
                .put(PROVIDER_KIND, providerKind)
                .put(INCLUDE_ROUTINES, includeRoutines)
                .put(ROUTINE_FILTER, filter)
                .put(APPEARANCE, normalizeAppearance(appearance));
            return prefs(context).edit().putString(KEY_PREFIX + widgetId, value.toString()).commit();
        } catch (Exception ignored) {
            // A malformed configuration must never affect the domain store.
            return false;
        }
    }

    public static JSONObject read(Context context, int widgetId) {
        if (widgetId < 0) return null;
        try {
            String raw = prefs(context).getString(KEY_PREFIX + widgetId, null);
            if (raw == null || raw.trim().isEmpty()) return null;
            JSONObject value = new JSONObject(raw);
            if (empty(value.optString(PROFILE_ID, ""))) return null;
            String provider = value.optString(PROVIDER_KIND, "").trim();
            if (!isProviderKind(provider)) value.put(PROVIDER_KIND, providerKindForWidget(context, widgetId));
            if (!value.has(INCLUDE_ROUTINES)) value.put(INCLUDE_ROUTINES, true);
            value.put(ROUTINE_FILTER, normalizeRoutineFilter(value.optString(ROUTINE_FILTER, ROUTINE_FILTER_ALL)));
            // Old bindings safely resolve to system without rewriting profile/privacy data.
            value.put(APPEARANCE, appearance(value));
            return value;
        } catch (Exception ignored) {
            return null;
        }
    }

    public static void remove(Context context, int widgetId) {
        if (widgetId >= 0) prefs(context).edit().remove(KEY_PREFIX + widgetId).commit();
    }

    public static String providerKindForWidget(Context context, int widgetId) {
        if (widgetId < 0) return CALENDAR;
        try {
            AppWidgetProviderInfo info = AppWidgetManager.getInstance(context).getAppWidgetInfo(widgetId);
            if (info != null && info.provider != null) {
                String className = info.provider.getClassName();
                if (CaizenRoutinesWidget.class.getName().equals(className)) return ROUTINES;
                if ("app.caizen.life.CaizenTodayWidget".equals(className)) return TODAY;
                if (CaizenWorkTasksWidget.class.getName().equals(className)) return WORK_TASKS;
                if (CaizenCalendarWidget.class.getName().equals(className)) return CALENDAR;
            }
        } catch (Exception ignored) {
            // A host lookup failure must not change the binding or domain data.
        }
        return CALENDAR;
    }

    private static boolean isProviderKind(String value) {
        return CALENDAR.equals(value) || ROUTINES.equals(value) || TODAY.equals(value)
            || WORK_TASKS.equals(value);
    }

    public static String routineFilter(JSONObject binding) {
        return binding == null
            ? ROUTINE_FILTER_ALL
            : normalizeRoutineFilter(binding.optString(ROUTINE_FILTER, ROUTINE_FILTER_ALL));
    }

    public static String appearance(JSONObject binding) {
        return normalizeAppearance(binding == null ? null : binding.optString(APPEARANCE));
    }

    private static String normalizeAppearance(String value) {
        if (APPEARANCE_LIGHT.equals(value) || APPEARANCE_DARK.equals(value)) return value;
        return APPEARANCE_SYSTEM;
    }

    public static boolean routineMatchesFilter(JSONObject routine, String filter) {
        if (ROUTINE_FILTER_ALL.equals(filter)) return true;
        return filter.equals(routine == null ? "" : routine.optString("frequency", "other"));
    }

    private static String normalizeRoutineFilter(String value) {
        if (ROUTINE_FILTER_DAILY.equals(value)
            || ROUTINE_FILTER_WEEKLY.equals(value)
            || ROUTINE_FILTER_BIWEEKLY.equals(value)
            || ROUTINE_FILTER_MONTHLY.equals(value)) return value;
        return ROUTINE_FILTER_ALL;
    }

    private static boolean empty(String value) {
        return value == null || value.trim().isEmpty();
    }
}
