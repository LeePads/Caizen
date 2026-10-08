package app.caizen.life;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;

/** Supplies the bounded, profile-scoped routine collection to the launcher. */
public final class CaizenRoutinesRemoteViewsService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        int widgetId = intent == null ? -1 : intent.getIntExtra(
            CaizenRoutinesWidget.EXTRA_APP_WIDGET_ID, -1);
        String size = intent == null
            ? CaizenRoutinesWidget.SIZE_LARGE
            : intent.getStringExtra(CaizenRoutinesWidget.EXTRA_ROUTINES_SIZE);
        boolean stale = intent != null && intent.getBooleanExtra(CaizenRoutinesWidget.EXTRA_STALE, false);
        return new RoutineFactory(getApplicationContext(), widgetId, size, stale);
    }

    private static final class RoutineFactory implements RemoteViewsFactory {
        private final Context context;
        private final int widgetId;
        private final String size;
        private boolean stale;
        private JSONArray routines = new JSONArray();
        private JSONArray pending = new JSONArray();
        private JSONArray accepted = new JSONArray();
        private String profileId = "";
        private String snapshotRevision = "";
        private String routineFilter = WidgetBindingStore.ROUTINE_FILTER_ALL;
        private JSONObject index;
        private boolean redacted;

        RoutineFactory(Context context, int widgetId, String size, boolean stale) {
            this.context = context;
            this.widgetId = widgetId;
            this.size = CaizenRoutinesWidget.SIZE_MEDIUM.equals(size)
                ? CaizenRoutinesWidget.SIZE_MEDIUM : CaizenRoutinesWidget.SIZE_LARGE;
            this.stale = stale;
        }

        @Override public void onCreate() { reload(); }
        @Override public void onDataSetChanged() { reload(); }
        @Override public void onDestroy() {
            routines = new JSONArray();
            pending = new JSONArray();
            accepted = new JSONArray();
            index = null;
        }

        @Override
        public int getCount() {
            if (redacted) return 0;
            return routines.length();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            JSONObject routine = routines.optJSONObject(position);
            if (routine == null || redacted) return null;
            return CaizenRoutinesWidget.buildRoutineRow(
                context,
                routine,
                profileId,
                widgetId,
                snapshotRevision,
                stale,
                index,
                pending,
                accepted,
                false
            );
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }

        @Override
        public long getItemId(int position) {
            JSONObject routine = routines.optJSONObject(position);
            return routine == null
                ? position
                : WidgetSnapshotStore.optString(routine, "id").hashCode();
        }

        @Override public boolean hasStableIds() { return true; }

        private void reload() {
            JSONObject snapshot = WidgetSnapshotStore.readForWidget(context, widgetId);
            index = WidgetSnapshotStore.readIndex(context);
            JSONObject binding = WidgetBindingStore.read(context, widgetId);
            routineFilter = WidgetBindingStore.routineFilter(binding);
            redacted = WidgetSnapshotStore.isRedacted(snapshot)
                || WidgetSnapshotStore.isConfigurationRequired(snapshot);
            JSONArray source = snapshot == null || redacted
                ? new JSONArray() : WidgetSnapshotStore.optArray(snapshot, "routines");
            routines = new JSONArray();
            for (int index = 0; index < source.length(); index += 1) {
                JSONObject routine = source.optJSONObject(index);
                if (routine != null && WidgetBindingStore.routineMatchesFilter(routine, routineFilter)) {
                    routines.put(routine);
                }
            }
            profileId = WidgetSnapshotStore.optString(snapshot, "profileId");
            snapshotRevision = WidgetSnapshotStore.optString(snapshot, "revision");
            stale = stale || isStale(snapshot);
            pending = WidgetActionStore.list(context);
            accepted = WidgetActionStore.listAccepted(context);
        }

        private boolean isStale(JSONObject snapshot) {
            if (snapshot == null) return true;
            String today = CaizenRoutinesWidget.localTodayKey();
            for (int index = 0; index < routines.length(); index += 1) {
                JSONObject routine = routines.optJSONObject(index);
                if (routine != null && !today.equals(WidgetSnapshotStore.optString(routine, "dateKey"))) {
                    return true;
                }
            }
            return snapshot.optLong("updatedAt", 0L) <= 0L;
        }
    }
}
