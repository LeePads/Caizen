package app.caizen.life;

import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.widget.RemoteViews;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/** Formatting helpers shared by widget providers. */
public final class CaizenWidgetFormat {
    private CaizenWidgetFormat() {
    }

    /** Native palette for one launcher instance, independent of profile/app theme. */
    public static JSONObject appearanceForWidget(Context context, int widgetId) {
        String preference = WidgetBindingStore.appearance(WidgetBindingStore.read(context, widgetId));
        boolean systemDark = (context.getResources().getConfiguration().uiMode
            & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        boolean dark = WidgetBindingStore.APPEARANCE_DARK.equals(preference)
            || (WidgetBindingStore.APPEARANCE_SYSTEM.equals(preference) && systemDark);
        try {
            return new JSONObject().put("appearance", new JSONObject()
                .put("dark", dark)
                .put("background", dark ? "#181917" : "#FAFAF7")
                .put("card", "#00000000")
                .put("foreground", dark ? "#F1F1EC" : "#252621")
                .put("mutedForeground", dark ? "#B1B2A9" : "#62635B")
                .put("primary", dark ? "#D3AD70" : "#805C23")
                .put("primaryForeground", "#21190D")
                .put("outline", dark ? "#24FFFFFF" : "#18252621"));
        } catch (org.json.JSONException impossible) {
            return null;
        }
    }

    private static void applyBackground(RemoteViews views, int rootId, JSONObject index) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        boolean dark = appearance != null && appearance.optBoolean("dark");
        // Explicit resources also work before API 31, when RemoteViews tint is unavailable.
        views.setInt(rootId, "setBackgroundResource", dark
            ? R.drawable.widget_background_dark : R.drawable.widget_background_light);
    }

    public static String timestamp(long millis) {
        if (millis <= 0L) return "";

        Calendar target = Calendar.getInstance();
        target.setTimeInMillis(millis);
        Calendar today = Calendar.getInstance();

        DateFormat time = DateFormat.getTimeInstance(DateFormat.SHORT);
        if (isSameDay(target, today)) {
            return time.format(new Date(millis));
        }

        Calendar startOfToday = startOfDay(today);
        Calendar startOfTarget = startOfDay(target);
        if (startOfTarget.before(startOfToday)) {
            return shortDate(target, millis);
        }

        Calendar weekAhead = (Calendar) startOfToday.clone();
        weekAhead.add(Calendar.DAY_OF_YEAR, 7);
        if (startOfTarget.before(weekAhead)) {
            return new SimpleDateFormat("EEE", Locale.getDefault()).format(new Date(millis))
                + " " + time.format(new Date(millis));
        }

        return shortDate(target, millis);
    }

    private static String shortDate(Calendar target, long millis) {
        Calendar today = Calendar.getInstance();
        String pattern = target.get(Calendar.YEAR) == today.get(Calendar.YEAR)
            ? "d MMM"
            : "d MMM yyyy";
        return new SimpleDateFormat(pattern, Locale.getDefault()).format(new Date(millis));
    }

    private static Calendar startOfDay(Calendar source) {
        Calendar copy = (Calendar) source.clone();
        copy.set(Calendar.HOUR_OF_DAY, 0);
        copy.set(Calendar.MINUTE, 0);
        copy.set(Calendar.SECOND, 0);
        copy.set(Calendar.MILLISECOND, 0);
        return copy;
    }

    private static boolean isSameDay(Calendar a, Calendar b) {
        return a.get(Calendar.YEAR) == b.get(Calendar.YEAR)
            && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
    }

    public static int workStatusColor(Context context, String status) {
        int resource;
        if ("office".equals(status)) {
            resource = R.color.caizen_status_office;
        } else if ("work_home".equals(status)) {
            resource = R.color.caizen_status_wfh;
        } else if ("travel".equals(status)) {
            resource = R.color.caizen_status_travel;
        } else if ("holiday".equals(status)) {
            resource = R.color.caizen_status_holiday;
        } else if ("leave".equals(status)) {
            resource = R.color.caizen_status_leave;
        } else {
            resource = R.color.caizen_widget_muted;
        }
        return context.getResources().getColor(resource, context.getTheme());
    }

    public static String workStatusLabel(Context context, String status) {
        if ("office".equals(status)) return context.getString(R.string.widget_status_office);
        if ("work_home".equals(status)) return context.getString(R.string.widget_status_wfh);
        if ("travel".equals(status)) return context.getString(R.string.widget_status_travel);
        if ("holiday".equals(status)) return context.getString(R.string.widget_status_holiday);
        if ("leave".equals(status)) return context.getString(R.string.widget_status_leave);
        return context.getString(R.string.widget_status_none);
    }

    /** Applies the instance palette to every Calendar size. */
    public static void applyCalendarPalette(Context context, RemoteViews views, JSONObject index) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        int foreground = color(appearance, "foreground", context, R.color.caizen_widget_foreground);
        int muted = color(appearance, "mutedForeground", context, R.color.caizen_widget_muted);
        int card = color(appearance, "card", context, R.color.caizen_widget_surface);

        applyBackground(views, R.id.widget_calendar_root, index);

        views.setTextColor(R.id.widget_calendar_month, foreground);
        views.setTextColor(R.id.widget_calendar_context, muted);
        views.setTextColor(R.id.widget_calendar_summary, foreground);
        views.setTextColor(R.id.widget_calendar_stale, muted);
        views.setTextColor(R.id.widget_calendar_prev, muted);
        views.setTextColor(R.id.widget_calendar_next, muted);
        views.setTextColor(R.id.widget_calendar_refresh, muted);
        views.setTextColor(R.id.widget_calendar_empty, muted);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            tint(views, R.id.widget_calendar_status, card);
            tint(views, R.id.widget_calendar_empty, card);
        }
    }

    public static void applyCalendarCellPalette(
        Context context,
        RemoteViews views,
        JSONObject index,
        boolean isToday
    ) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        int foreground = color(appearance, "foreground", context, R.color.caizen_widget_foreground);
        int primary = color(appearance, "primary", context, R.color.caizen_widget_accent);
        int primaryForeground = color(
            appearance,
            "primaryForeground",
            context,
            R.color.caizen_widget_on_accent
        );
        views.setTextColor(R.id.widget_cell_day, isToday ? primaryForeground : foreground);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            tint(views, R.id.widget_cell_event_marker, primary);
        }
    }

    public static void applyCalendarStripPalette(
        Context context,
        RemoteViews views,
        JSONObject index,
        boolean isToday
    ) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        int foreground = color(appearance, "foreground", context, R.color.caizen_widget_foreground);
        int primaryForeground = color(
            appearance,
            "primaryForeground",
            context,
            R.color.caizen_widget_on_accent
        );
        views.setTextColor(R.id.widget_strip_weekday, color(
            appearance,
            "mutedForeground",
            context,
            R.color.caizen_widget_muted
        ));
        views.setTextColor(R.id.widget_strip_day, isToday ? primaryForeground : foreground);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            tint(
                views,
                R.id.widget_strip_marker,
                color(appearance, "primary", context, R.color.caizen_widget_accent)
            );
        }
    }

    public static void applyCalendarUpcomingPalette(Context context, RemoteViews views, JSONObject index) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        views.setTextColor(
            R.id.widget_up_title,
            color(appearance, "foreground", context, R.color.caizen_widget_foreground)
        );
        views.setTextColor(
            R.id.widget_up_time,
            color(appearance, "mutedForeground", context, R.color.caizen_widget_muted)
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            tint(
                views,
                R.id.widget_up_row,
                color(appearance, "card", context, R.color.caizen_widget_surface)
            );
        }
    }

    /** Applies the same semantic palette to the action-first Routines family. */
    public static void applyRoutinesPalette(Context context, RemoteViews views, JSONObject index) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        int card = color(appearance, "card", context, R.color.caizen_widget_surface);
        int foreground = color(appearance, "foreground", context, R.color.caizen_widget_foreground);
        int muted = color(appearance, "mutedForeground", context, R.color.caizen_widget_muted);
        int primary = color(appearance, "primary", context, R.color.caizen_widget_accent);

        applyBackground(views, R.id.widget_routines_root, index);

        views.setTextColor(R.id.widget_routines_title, foreground);
        views.setTextColor(R.id.widget_routines_profile, muted);
        views.setTextColor(R.id.widget_routines_context, muted);
        views.setTextColor(R.id.widget_routines_summary, foreground);
        views.setTextColor(R.id.widget_routines_status, muted);
        views.setTextColor(R.id.widget_routines_stale, muted);
        views.setTextColor(R.id.widget_routines_empty, muted);
        views.setTextColor(R.id.widget_routines_refresh, muted);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            tint(views, R.id.widget_routines_status, card);
            tint(views, R.id.widget_routines_empty, card);
            tint(views, R.id.widget_routines_progress_bar, primary, "setProgressTintList");
            tint(views, R.id.widget_routines_progress_bar,
                color(appearance, "outline", context, R.color.caizen_widget_outline),
                "setProgressBackgroundTintList");
        }
    }

    /** Applies the same semantic palette to the priority-first Today family. */
    public static void applyTodayPalette(Context context, RemoteViews views, JSONObject index) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        int card = color(appearance, "card", context, R.color.caizen_widget_surface);
        int foreground = color(appearance, "foreground", context, R.color.caizen_widget_foreground);
        int muted = color(appearance, "mutedForeground", context, R.color.caizen_widget_muted);
        int primary = color(appearance, "primary", context, R.color.caizen_widget_accent);

        applyBackground(views, R.id.widget_today_root, index);

        views.setTextColor(R.id.widget_today_title, foreground);
        views.setTextColor(R.id.widget_today_date, muted);
        views.setTextColor(R.id.widget_today_progress_summary, foreground);
        views.setTextColor(R.id.widget_today_overdue, primary);
        views.setTextColor(R.id.widget_today_status, muted);
        views.setTextColor(R.id.widget_today_stale, muted);
        views.setTextColor(R.id.widget_today_empty, muted);
        views.setTextColor(R.id.widget_today_next_context, muted);
        views.setTextColor(R.id.widget_today_refresh, muted);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            tint(views, R.id.widget_today_status, card);
            tint(views, R.id.widget_today_empty, card);
            tint(views, R.id.widget_today_progress, primary, "setProgressTintList");
            tint(views, R.id.widget_today_progress,
                color(appearance, "outline", context, R.color.caizen_widget_outline),
                "setProgressBackgroundTintList");
        }
    }

    /** Applies priority-aware row state colors while retaining the family palette. */
    public static void applyTodayRowPalette(
        Context context,
        RemoteViews row,
        JSONObject index,
        boolean done,
        boolean pending,
        boolean failed,
        boolean actionEnabled
    ) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        int card = color(appearance, "card", context, R.color.caizen_widget_surface);
        int foreground = color(appearance, "foreground", context, R.color.caizen_widget_foreground);
        int muted = color(appearance, "mutedForeground", context, R.color.caizen_widget_muted);
        int primary = color(appearance, "primary", context, R.color.caizen_widget_accent);
        row.setTextColor(R.id.widget_today_row_kind, muted);
        row.setTextColor(R.id.widget_today_row_title, done ? muted : foreground);
        row.setTextColor(R.id.widget_today_row_meta, muted);
        row.setTextColor(R.id.widget_today_row_state, failed || pending ? primary : muted);
        row.setTextColor(R.id.widget_today_row_complete, actionEnabled ? primary : muted);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            tint(row, R.id.widget_today_row_body, card);
        }
    }

    /** Applies the semantic palette to the urgency-first Work Tasks family. */
    public static void applyWorkTasksPalette(Context context, RemoteViews views, JSONObject index) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        int card = color(appearance, "card", context, R.color.caizen_widget_surface);
        int foreground = color(appearance, "foreground", context, R.color.caizen_widget_foreground);
        int muted = color(appearance, "mutedForeground", context, R.color.caizen_widget_muted);
        int primary = color(appearance, "primary", context, R.color.caizen_widget_accent);

        applyBackground(views, R.id.widget_work_tasks_root, index);

        views.setTextColor(R.id.widget_work_tasks_title, foreground);
        views.setTextColor(R.id.widget_work_tasks_date, muted);
        views.setTextColor(R.id.widget_work_tasks_summary, foreground);
        views.setTextColor(R.id.widget_work_tasks_overdue, primary);
        views.setTextColor(R.id.widget_work_tasks_status, muted);
        views.setTextColor(R.id.widget_work_tasks_stale, muted);
        views.setTextColor(R.id.widget_work_tasks_empty, muted);
        views.setTextColor(R.id.widget_work_tasks_refresh, muted);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            tint(views, R.id.widget_work_tasks_status, card);
            tint(views, R.id.widget_work_tasks_empty, card);
        }
    }

    /** Applies restrained urgency and accepted-local state to one Work row. */
    public static void applyWorkTaskRowPalette(
        Context context,
        RemoteViews row,
        JSONObject index,
        boolean done,
        boolean pending,
        boolean failed,
        boolean actionEnabled,
        boolean overdue
    ) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        int card = color(appearance, "card", context, R.color.caizen_widget_surface);
        int foreground = color(appearance, "foreground", context, R.color.caizen_widget_foreground);
        int muted = color(appearance, "mutedForeground", context, R.color.caizen_widget_muted);
        int primary = color(appearance, "primary", context, R.color.caizen_widget_accent);
        row.setTextColor(R.id.widget_work_task_row_kind, overdue ? primary : muted);
        row.setTextColor(R.id.widget_work_task_row_title, done ? muted : foreground);
        row.setTextColor(R.id.widget_work_task_row_meta, muted);
        row.setTextColor(R.id.widget_work_task_row_state, failed || pending ? primary : muted);
        row.setTextColor(R.id.widget_work_task_row_complete, actionEnabled ? primary : muted);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            tint(row, R.id.widget_work_task_row_body, card);
        }
    }

    /** Applies state-aware row colors without introducing a Routines palette. */
    public static void applyRoutineRowPalette(
        Context context,
        RemoteViews row,
        JSONObject index,
        boolean done,
        boolean pending,
        boolean failed,
        boolean actionEnabled
    ) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        int card = color(appearance, "card", context, R.color.caizen_widget_surface);
        int foreground = color(appearance, "foreground", context, R.color.caizen_widget_foreground);
        int muted = color(appearance, "mutedForeground", context, R.color.caizen_widget_muted);
        int primary = color(appearance, "primary", context, R.color.caizen_widget_accent);
        row.setTextColor(R.id.widget_routine_title, done ? muted : foreground);
        row.setTextColor(R.id.widget_routine_state, failed || pending ? primary : muted);
        row.setTextColor(R.id.widget_routine_check, primary);
        row.setTextColor(R.id.widget_routine_complete, actionEnabled ? primary : muted);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            tint(row, R.id.widget_routine_body, card);
        }
    }

    /** Resolves the same sanitized widget appearance for native configuration UI. */
    public static int paletteColor(
        Context context,
        JSONObject index,
        String key,
        int fallback
    ) {
        JSONObject appearance = index == null ? null : index.optJSONObject("appearance");
        return color(appearance, key, context, fallback);
    }

    private static void tint(RemoteViews views, int viewId, int value) {
        views.setColorStateList(viewId, "setBackgroundTintList", ColorStateList.valueOf(value));
    }

    private static void tint(RemoteViews views, int viewId, int value, String method) {
        views.setColorStateList(viewId, method, ColorStateList.valueOf(value));
    }

    private static int color(JSONObject appearance, String key, Context context, int fallback) {
        if (appearance == null) return context.getResources().getColor(fallback, context.getTheme());
        String value = appearance.optString(key, "");
        try {
            if (value.matches("#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}")) return Color.parseColor(value);
        } catch (IllegalArgumentException ignored) {
            // Fall through to the bundled, contrast-safe palette.
        }
        return context.getResources().getColor(fallback, context.getTheme());
    }
}
