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
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Responsive Calendar widget backed by the sanitized widget snapshot. */
public class CaizenCalendarWidget extends CaizenWidgetBase {
    private static final String ACTION_STEP_MONTH = "app.caizen.life.CALENDAR_STEP_MONTH";
    private static final String EXTRA_STEP = "step";
    private static final String PREFS = "caizen_calendar_widget";
    private static final int MIN_OFFSET = -1;
    private static final int MAX_OFFSET = 2;
    private static final long STALE_AFTER_MS = 24L * 60L * 60L * 1000L;
    static final String SIZE_SMALL = "small";
    static final String SIZE_MEDIUM = "medium";
    static final String SIZE_LARGE = "large";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        if (widgetIds == null) return;
        for (int widgetId : widgetIds) {
            migrateExistingBinding(context, widgetId);
            renderSafely(context, manager, widgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && ACTION_STEP_MONTH.equals(intent.getAction())) {
            int widgetId = intent.getIntExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID
            );
            if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                int step = intent.getIntExtra(EXTRA_STEP, 0);
                writeOffset(context, widgetId, readOffset(context, widgetId) + step);
                renderSafely(context, AppWidgetManager.getInstance(context), widgetId);
            }
            return;
        }
        super.onReceive(context, intent);
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
    public void onDeleted(Context context, int[] widgetIds) {
        super.onDeleted(context, widgetIds);
        if (widgetIds == null) return;
        for (int widgetId : widgetIds) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(String.valueOf(widgetId))
                .apply();
        }
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

    static String calendarSizeForOptions(Bundle options) {
        if (options == null) return SIZE_LARGE;
        int width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (width > 0 && (width < 180 || height < 150)) return SIZE_SMALL;
        if (width > 0 && (width < 300 || height < 230)) return SIZE_MEDIUM;
        return SIZE_LARGE;
    }

    private static int readOffset(Context context, int widgetId) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getInt(String.valueOf(widgetId), 0);
    }

    private static void writeOffset(Context context, int widgetId, int offset) {
        int clamped = Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, offset));
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(String.valueOf(widgetId), clamped)
            .apply();
    }

    @Override
    protected RemoteViews buildViews(Context context, int widgetId) {
        Bundle options = widgetId == AppWidgetManager.INVALID_APPWIDGET_ID
            ? null
            : AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId);
        return buildForSize(context, widgetId, calendarSizeForOptions(options), snapshot(context, widgetId));
    }

    @Override
    protected RemoteViews buildFallbackViews(Context context, int widgetId) {
        Bundle options = widgetId == AppWidgetManager.INVALID_APPWIDGET_ID
            ? null
            : AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId);
        return buildForSize(context, widgetId, calendarSizeForOptions(options), null);
    }

    private RemoteViews buildForSize(Context context, int widgetId, String size, JSONObject snapshot) {
        if (snapshot == null || WidgetSnapshotStore.isConfigurationRequired(snapshot)) {
            return buildFallbackForSize(context, widgetId, size, snapshot);
        }

        int offset = widgetId == AppWidgetManager.INVALID_APPWIDGET_ID
            ? 0
            : readOffset(context, widgetId);
        Calendar month = Calendar.getInstance();
        month.set(Calendar.DAY_OF_MONTH, 1);
        month.add(Calendar.MONTH, offset);
        String profileId = WidgetSnapshotStore.optString(snapshot, "profileId");
        JSONObject index = CaizenWidgetFormat.appearanceForWidget(context, widgetId);
        RemoteViews views = baseViews(context, widgetId, offset, profileId, layoutForSize(size));
        CaizenWidgetFormat.applyCalendarPalette(context, views, index);
        setHeader(context, views, month, offset, snapshot, index);
        setStaleState(context, views, snapshot);

        if (SIZE_SMALL.equals(size)) {
            hideCalendarCollections(views);
            setSummary(context, views, snapshot, 1);
        } else if (SIZE_MEDIUM.equals(size)) {
            hideLargeCalendarCollections(views);
            buildDayStrip(context, views, month, offset, snapshot, profileId, index);
            setSummary(context, views, snapshot, 2);
            buildUpcoming(context, views, snapshot, profileId, 2, index);
        } else {
            buildWeekdayHeader(context, views, index);
            buildGrid(context, views, month, snapshot, profileId, index);
            setSummary(context, views, snapshot, 3);
            buildUpcoming(context, views, snapshot, profileId, 3, index);
        }

        views.setViewVisibility(R.id.widget_calendar_empty, View.GONE);
        views.setContentDescription(
            R.id.widget_calendar_root,
            WidgetSnapshotStore.isRedacted(snapshot)
                ? "Caizen Calendar, names hidden"
                : "Caizen Calendar for " + WidgetSnapshotStore.optString(snapshot, "profileName")
        );
        return views;
    }

    private RemoteViews buildFallbackForSize(
        Context context,
        int widgetId,
        String size,
        JSONObject state
    ) {
        Calendar month = Calendar.getInstance();
        month.set(Calendar.DAY_OF_MONTH, 1);
        RemoteViews views = baseViews(context, widgetId, 0, null, layoutForSize(size));
        JSONObject appearance = CaizenWidgetFormat.appearanceForWidget(context, widgetId);
        CaizenWidgetFormat.applyCalendarPalette(context, views, appearance);
        setHeader(context, views, month, 0, null, appearance);
        views.setViewVisibility(R.id.widget_calendar_status, View.GONE);
        views.setViewVisibility(R.id.widget_calendar_stale, View.GONE);
        hideCalendarCollections(views);
        views.setViewVisibility(R.id.widget_calendar_empty, View.VISIBLE);
        views.setTextViewText(R.id.widget_calendar_empty, fallbackMessage(context, state));
        views.setContentDescription(R.id.widget_calendar_root, fallbackMessage(context, state));
        return views;
    }

    private String fallbackMessage(Context context, JSONObject state) {
        if (WidgetSnapshotStore.isConfigurationRequired(state)) {
            return context.getString(R.string.widget_calendar_configuration_required);
        }
        return WidgetSnapshotStore.readIndex(context) == null
            ? context.getString(R.string.widget_open_to_sync)
            : context.getString(R.string.widget_calendar_preparing);
    }

    private int layoutForSize(String size) {
        if (SIZE_SMALL.equals(size)) return R.layout.widget_calendar_small;
        if (SIZE_MEDIUM.equals(size)) return R.layout.widget_calendar_medium;
        return R.layout.widget_calendar;
    }

    private RemoteViews baseViews(
        Context context,
        int widgetId,
        int offset,
        String profileId,
        int layoutId
    ) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutId);
        views.setOnClickPendingIntent(
            R.id.widget_calendar_root,
            deepLink(context, "calendar-root", "lifehub", "dates", null, profileId)
        );
        views.setOnClickPendingIntent(
            R.id.widget_calendar_month,
            deepLink(context, "calendar-month", "lifehub", "dates", null, profileId)
        );
        views.setOnClickPendingIntent(R.id.widget_calendar_refresh, refreshIntent(context));
        views.setViewVisibility(
            R.id.widget_calendar_prev,
            offset <= MIN_OFFSET ? View.INVISIBLE : View.VISIBLE
        );
        views.setViewVisibility(
            R.id.widget_calendar_next,
            offset >= MAX_OFFSET ? View.INVISIBLE : View.VISIBLE
        );
        if (offset > MIN_OFFSET) {
            views.setOnClickPendingIntent(R.id.widget_calendar_prev, stepIntent(context, widgetId, -1));
        }
        if (offset < MAX_OFFSET) {
            views.setOnClickPendingIntent(R.id.widget_calendar_next, stepIntent(context, widgetId, 1));
        }
        return views;
    }

    private void setHeader(
        Context context,
        RemoteViews views,
        Calendar month,
        int offset,
        JSONObject snapshot,
        JSONObject appearance
    ) {
        Calendar today = Calendar.getInstance();
        String monthLabel = new SimpleDateFormat("MMMM yyyy", Locale.getDefault()).format(month.getTime());
        String dateLabel = offset == 0
            ? new SimpleDateFormat("EEEE, d MMM", Locale.getDefault()).format(today.getTime())
            : monthLabel;
        views.setTextViewText(R.id.widget_calendar_month, monthLabel);
        views.setTextViewText(R.id.widget_calendar_context, dateLabel);
        views.setContentDescription(R.id.widget_calendar_month, "Open " + monthLabel + " calendar");
        String status = snapshot == null ? "" : WidgetSnapshotStore.optString(snapshot, "workStatus");
        views.setTextViewText(
            R.id.widget_calendar_status,
            status.isEmpty() ? "" : CaizenWidgetFormat.workStatusLabel(context, status)
        );
        views.setViewVisibility(R.id.widget_calendar_status, status.isEmpty() ? View.GONE : View.VISIBLE);
        if (!status.isEmpty()) {
            views.setTextColor(R.id.widget_calendar_status, CaizenWidgetFormat.paletteColor(
                context, appearance, "mutedForeground", R.color.caizen_widget_muted));
        }
    }

    private void setStaleState(Context context, RemoteViews views, JSONObject snapshot) {
        boolean stale = snapshot != null
            && snapshot.optLong("updatedAt", 0L) > 0L
            && System.currentTimeMillis() - snapshot.optLong("updatedAt", 0L) > STALE_AFTER_MS;
        views.setViewVisibility(R.id.widget_calendar_stale, stale ? View.VISIBLE : View.GONE);
        if (stale) {
            views.setTextViewText(R.id.widget_calendar_stale, context.getString(R.string.widget_calendar_stale));
            views.setContentDescription(R.id.widget_calendar_stale, "Open Caizen to refresh Calendar data");
        }
    }

    private void setSummary(Context context, RemoteViews views, JSONObject snapshot, int maxEvents) {
        if (snapshot == null) {
            views.setTextViewText(R.id.widget_calendar_summary, "");
            views.setViewVisibility(R.id.widget_calendar_summary, View.GONE);
            return;
        }
        JSONArray events = WidgetSnapshotStore.optArray(snapshot, "events");
        JSONObject first = events.length() == 0 ? null : events.optJSONObject(0);
        String summary;
        if (first == null) {
            summary = context.getString(R.string.widget_calendar_no_upcoming);
        } else {
            String title = WidgetSnapshotStore.optString(first, "title");
            if (title.isEmpty()) title = context.getString(R.string.widget_untitled_event);
            int remaining = Math.max(0, Math.min(events.length(), maxEvents) - 1);
            summary = title + " · " + CaizenWidgetFormat.timestamp(first.optLong("startAt", 0L));
            if (remaining > 0) summary += "  +" + remaining;
        }
        views.setTextViewText(R.id.widget_calendar_summary, summary);
        views.setViewVisibility(R.id.widget_calendar_summary, View.VISIBLE);
        views.setContentDescription(R.id.widget_calendar_summary, "Upcoming calendar summary: " + summary);
    }

    private void hideCalendarCollections(RemoteViews views) {
        views.setViewVisibility(R.id.widget_calendar_day_strip, View.GONE);
        views.setViewVisibility(R.id.widget_calendar_weekdays, View.GONE);
        views.setViewVisibility(R.id.widget_calendar_grid, View.GONE);
        views.setViewVisibility(R.id.widget_calendar_upcoming, View.GONE);
    }

    private void hideLargeCalendarCollections(RemoteViews views) {
        views.setViewVisibility(R.id.widget_calendar_weekdays, View.GONE);
        views.setViewVisibility(R.id.widget_calendar_grid, View.GONE);
    }

    private void buildWeekdayHeader(Context context, RemoteViews views, JSONObject appearanceIndex) {
        views.setViewVisibility(R.id.widget_calendar_day_strip, View.GONE);
        views.setViewVisibility(R.id.widget_calendar_weekdays, View.VISIBLE);
        views.setViewVisibility(R.id.widget_calendar_grid, View.VISIBLE);
        views.removeAllViews(R.id.widget_calendar_weekdays);
        Calendar cursor = Calendar.getInstance();
        int firstDay = cursor.getFirstDayOfWeek();
        SimpleDateFormat format = new SimpleDateFormat("EEEEE", Locale.getDefault());

        for (int index = 0; index < 7; index += 1) {
            cursor.set(Calendar.DAY_OF_WEEK, ((firstDay - 1 + index) % 7) + 1);
            RemoteViews label = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_weekday);
            label.setTextViewText(R.id.widget_weekday_label, format.format(cursor.getTime()));
            label.setTextColor(R.id.widget_weekday_label, CaizenWidgetFormat.paletteColor(
                context, appearanceIndex, "mutedForeground", R.color.caizen_widget_muted));
            views.addView(R.id.widget_calendar_weekdays, label);
        }
    }

    private void buildDayStrip(
        Context context,
        RemoteViews views,
        Calendar month,
        int offset,
        JSONObject snapshot,
        String profileId,
        JSONObject appearanceIndex
    ) {
        views.setViewVisibility(R.id.widget_calendar_day_strip, View.VISIBLE);
        views.setViewVisibility(R.id.widget_calendar_upcoming, View.VISIBLE);
        views.removeAllViews(R.id.widget_calendar_day_strip);
        JSONObject days = snapshot == null ? null : snapshot.optJSONObject("days");
        Calendar start = (Calendar) month.clone();
        if (offset == 0) start = Calendar.getInstance();
        start.set(Calendar.DAY_OF_WEEK, start.getFirstDayOfWeek());
        SimpleDateFormat weekday = new SimpleDateFormat("EEEEE", Locale.getDefault());
        Calendar today = Calendar.getInstance();
        for (int index = 0; index < 7; index += 1) {
            Calendar date = (Calendar) start.clone();
            date.add(Calendar.DAY_OF_MONTH, index);
            String key = localDayKey(date);
            JSONObject marker = days == null ? null : days.optJSONObject(key);
            RemoteViews item = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_day_strip_item);
            item.setTextViewText(R.id.widget_strip_weekday, weekday.format(date.getTime()));
            item.setTextViewText(R.id.widget_strip_day, String.valueOf(date.get(Calendar.DAY_OF_MONTH)));
            boolean isToday = isSameDay(date, today);
            item.setInt(R.id.widget_strip_day, "setBackgroundResource", isToday ? R.drawable.widget_day_today : 0);
            item.setViewVisibility(
                R.id.widget_strip_marker,
                marker != null && marker.optBoolean("e", false) ? View.VISIBLE : View.INVISIBLE
            );
            item.setOnClickPendingIntent(
                R.id.widget_strip_item,
                deepLink(context, "calendar-strip-" + key, "lifehub", "dates", key, profileId)
            );
            item.setContentDescription(
                R.id.widget_strip_item,
                "Open calendar for " + new SimpleDateFormat("EEEE, d MMM", Locale.getDefault()).format(date.getTime())
            );
            CaizenWidgetFormat.applyCalendarStripPalette(context, item, appearanceIndex, isToday);
            views.addView(R.id.widget_calendar_day_strip, item);
        }
    }

    private void buildGrid(
        Context context,
        RemoteViews views,
        Calendar month,
        JSONObject snapshot,
        String profileId,
        JSONObject appearanceIndex
    ) {
        views.removeAllViews(R.id.widget_calendar_grid);
        JSONObject days = snapshot == null ? null : snapshot.optJSONObject("days");
        Calendar first = (Calendar) month.clone();
        first.set(Calendar.DAY_OF_MONTH, 1);
        int leading = (first.get(Calendar.DAY_OF_WEEK) - first.getFirstDayOfWeek() + 7) % 7;
        int daysInMonth = first.getActualMaximum(Calendar.DAY_OF_MONTH);
        int weeks = (int) Math.ceil((leading + daysInMonth) / 7.0);
        Calendar today = Calendar.getInstance();
        int day = 1;
        for (int week = 0; week < weeks; week += 1) {
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_row);
            for (int column = 0; column < 7; column += 1) {
                RemoteViews cell = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_cell);
                int slot = week * 7 + column;
                if (slot < leading || day > daysInMonth) {
                    cell.setTextViewText(R.id.widget_cell_day, "");
                    cell.setViewVisibility(R.id.widget_cell_work_marker, View.INVISIBLE);
                    cell.setViewVisibility(R.id.widget_cell_event_marker, View.INVISIBLE);
                    row.addView(R.id.widget_calendar_week, cell);
                    continue;
                }
                Calendar cellDate = (Calendar) first.clone();
                cellDate.set(Calendar.DAY_OF_MONTH, day);
                cell.setTextViewText(R.id.widget_cell_day, String.valueOf(day));
                boolean isToday = isSameDay(cellDate, today);
                cell.setInt(R.id.widget_cell_day, "setBackgroundResource", isToday ? R.drawable.widget_day_today : 0);
                String key = localDayKey(cellDate);
                JSONObject marker = days == null ? null : days.optJSONObject(key);
                int workDrawable = workMarkerDrawable(marker);
                boolean hasEvent = marker != null && marker.optBoolean("e", false);
                cell.setViewVisibility(R.id.widget_cell_work_marker, workDrawable == 0 ? View.INVISIBLE : View.VISIBLE);
                if (workDrawable != 0) {
                    cell.setInt(R.id.widget_cell_work_marker, "setBackgroundResource", workDrawable);
                }
                cell.setViewVisibility(R.id.widget_cell_event_marker, hasEvent ? View.VISIBLE : View.INVISIBLE);
                cell.setOnClickPendingIntent(
                    R.id.widget_cell_root,
                    deepLink(context, "calendar-day-" + key, "lifehub", "dates", key, profileId)
                );
                cell.setContentDescription(
                    R.id.widget_cell_root,
                    "Open calendar for " + new SimpleDateFormat("EEEE, d MMM", Locale.getDefault()).format(cellDate.getTime())
                );
                CaizenWidgetFormat.applyCalendarCellPalette(context, cell, appearanceIndex, isToday);
                row.addView(R.id.widget_calendar_week, cell);
                day += 1;
            }
            views.addView(R.id.widget_calendar_grid, row);
        }
    }

    private static boolean isSameDay(Calendar first, Calendar second) {
        return first.get(Calendar.YEAR) == second.get(Calendar.YEAR)
            && first.get(Calendar.DAY_OF_YEAR) == second.get(Calendar.DAY_OF_YEAR);
    }

    private static String localDayKey(Calendar date) {
        return String.format(
            Locale.US,
            "%04d-%02d-%02d",
            date.get(Calendar.YEAR),
            date.get(Calendar.MONTH) + 1,
            date.get(Calendar.DAY_OF_MONTH)
        );
    }

    private static int workMarkerDrawable(JSONObject marker) {
        if (marker == null) return 0;
        String work = marker.optString("w", "");
        if ("office".equals(work)) return R.drawable.widget_marker_office;
        if ("work_home".equals(work)) return R.drawable.widget_marker_wfh;
        if ("travel".equals(work)) return R.drawable.widget_marker_travel;
        if ("holiday".equals(work)) return R.drawable.widget_marker_holiday;
        if ("leave".equals(work)) return R.drawable.widget_marker_leave;
        return 0;
    }

    private void buildUpcoming(
        Context context,
        RemoteViews views,
        JSONObject snapshot,
        String profileId,
        int maxRows,
        JSONObject appearanceIndex
    ) {
        views.removeAllViews(R.id.widget_calendar_upcoming);
        JSONArray events = WidgetSnapshotStore.optArray(snapshot, "events");
        int shown = 0;
        for (int eventIndex = 0; eventIndex < events.length() && shown < maxRows; eventIndex += 1) {
            JSONObject event = events.optJSONObject(eventIndex);
            if (event == null) continue;
            String id = WidgetSnapshotStore.optString(event, "id");
            // v5/v6 and malformed imported projections may not carry the
            // canonical id field. Keep the row visible with safe content;
            // exact navigation is only attached when an identity is present.
            if (id.isEmpty()) id = WidgetSnapshotStore.optString(event, "recordId");
            String title = WidgetSnapshotStore.optString(event, "title");
            if (title.isEmpty()) title = context.getString(R.string.widget_untitled_event);
            long startAt = event.optLong("startAt", 0L);
            String time = CaizenWidgetFormat.timestamp(startAt);
            if (time.isEmpty()) time = context.getString(R.string.widget_calendar_time_unavailable);
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_upcoming_row);
            row.setTextViewText(R.id.widget_up_title, title);
            row.setTextViewText(R.id.widget_up_time, time);
            row.setViewVisibility(R.id.widget_up_title, View.VISIBLE);
            row.setViewVisibility(R.id.widget_up_time, View.VISIBLE);
            if (!id.isEmpty()) {
                row.setOnClickPendingIntent(
                    R.id.widget_up_row,
                    deepLink(context, "calendar-event-" + id + "-" + eventIndex, "lifehub", "open-date", id, profileId)
                );
            }
            row.setContentDescription(R.id.widget_up_row, "Open event " + title);
            CaizenWidgetFormat.applyCalendarUpcomingPalette(context, row, appearanceIndex);
            views.addView(R.id.widget_calendar_upcoming, row);
            shown += 1;
        }
        views.setViewVisibility(R.id.widget_calendar_upcoming, shown > 0 ? View.VISIBLE : View.GONE);
    }

    private PendingIntent stepIntent(Context context, int widgetId, int step) {
        Intent intent = new Intent(context, CaizenCalendarWidget.class)
            .setAction(ACTION_STEP_MONTH)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .putExtra(EXTRA_STEP, step);
        return PendingIntent.getBroadcast(
            context,
            ("cal-step-" + widgetId + "-" + step).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
