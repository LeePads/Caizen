package app.caizen.life;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;

/** Supplies the bounded task-only Today queue to medium and large widgets. */
public final class CaizenTodayRemoteViewsService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        int widgetId = intent == null
            ? -1
            : intent.getIntExtra(CaizenTodayWidget.EXTRA_APP_WIDGET_ID, -1);
        String size = intent == null
            ? CaizenTodayWidget.SIZE_LARGE
            : intent.getStringExtra(CaizenTodayWidget.EXTRA_TODAY_SIZE);
        boolean stale = intent != null
            && intent.getBooleanExtra(CaizenTodayWidget.EXTRA_STALE, false);
        return new TodayFactory(getApplicationContext(), widgetId, size, stale);
    }

    private static final class TodayFactory implements RemoteViewsFactory {
        private final Context context;
        private final int widgetId;
        private final String size;
        private boolean stale;
        private boolean redacted;
        private JSONArray items = new JSONArray();
        private JSONArray pending = new JSONArray();
        private JSONArray accepted = new JSONArray();
        private JSONObject snapshot;
        private String profileId = "";
        private String snapshotRevision = "";

        TodayFactory(Context context, int widgetId, String size, boolean stale) {
            this.context = context;
            this.widgetId = widgetId;
            this.size = CaizenTodayWidget.SIZE_MEDIUM.equals(size)
                ? CaizenTodayWidget.SIZE_MEDIUM
                : CaizenTodayWidget.SIZE_LARGE;
            this.stale = stale;
        }

        @Override public void onCreate() { reload(); }
        @Override public void onDataSetChanged() { reload(); }
        @Override public void onDestroy() {
            items = new JSONArray();
            pending = new JSONArray();
            accepted = new JSONArray();
            snapshot = null;
        }

        @Override
        public int getCount() {
            // The v7 projection already caps Today at eight identity-bearing
            // rows. Let the launcher scroll that bounded set at medium/large
            // sizes instead of clipping a LinearLayout.
            return redacted ? 0 : items.length();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            JSONObject item = items.optJSONObject(position);
            if (item == null || redacted) return null;
            return CaizenTodayWidget.buildTodayRow(
                context,
                item,
                snapshot,
                widgetId,
                false,
                stale,
                pending,
                accepted,
                false
            );
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }

        @Override
        public long getItemId(int position) {
            JSONObject item = items.optJSONObject(position);
            if (item == null) return position;
            String identity = WidgetSnapshotStore.optString(item, "kind") + ":"
                + WidgetSnapshotStore.optString(item, "id") + ":"
                + WidgetSnapshotStore.optString(item, "occurrenceKey");
            return identity.hashCode();
        }

        @Override public boolean hasStableIds() { return true; }

        private void reload() {
            snapshot = WidgetSnapshotStore.readForWidget(context, widgetId);
            redacted = WidgetSnapshotStore.isRedacted(snapshot)
                || WidgetSnapshotStore.isConfigurationRequired(snapshot);
            JSONObject today = snapshot == null
                ? null : WidgetSnapshotStore.optObject(snapshot, "today");
            JSONArray source = today == null
                ? new JSONArray() : WidgetSnapshotStore.optArray(today, "items");
            items = new JSONArray();
            for (int index = 0; index < source.length(); index += 1) {
                JSONObject item = source.optJSONObject(index);
                if (item == null) continue;
                if (!"task".equals(WidgetSnapshotStore.optString(item, "kind"))) continue;
                items.put(item);
            }
            profileId = WidgetSnapshotStore.optString(snapshot, "profileId");
            snapshotRevision = WidgetSnapshotStore.optString(snapshot, "revision");
            stale = stale || isStale(snapshot, source);
            pending = WidgetActionStore.list(context);
            accepted = WidgetActionStore.listAccepted(context);
        }

        private boolean isStale(JSONObject snapshot, JSONArray source) {
            if (snapshot == null) return true;
            long updatedAt = snapshot.optLong("updatedAt", 0L);
            if (updatedAt <= 0L
                || System.currentTimeMillis() - updatedAt > 24L * 60L * 60L * 1000L) return true;
            String today = CaizenTodayWidget.localTodayKey();
            for (int index = 0; index < source.length(); index += 1) {
                JSONObject item = source.optJSONObject(index);
                if (item != null && !today.equals(WidgetSnapshotStore.optString(item, "dateKey"))) {
                    return true;
                }
            }
            return false;
        }
    }
}
