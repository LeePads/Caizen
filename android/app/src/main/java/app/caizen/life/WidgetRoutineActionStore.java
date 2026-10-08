package app.caizen.life;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;

/** @deprecated Compatibility adapter; WidgetActionStore is authoritative. */
@Deprecated
public final class WidgetRoutineActionStore {
    public static final int MAX_ACTIONS = 32;

    private WidgetRoutineActionStore() {}

    public static synchronized boolean enqueue(
        Context context, String actionId, String profileId, String routineId,
        String dateKey, String occurrenceKey
    ) {
        try {
            JSONObject action = new JSONObject()
                .put("schemaVersion", 1)
                .put("actionId", actionId)
                .put("actionType", "routine.complete")
                .put("sourceWidgetId", -1)
                .put("profileId", profileId)
                .put("recordId", routineId)
                .put("localDateKey", dateKey)
                .put("occurrenceKey", occurrenceKey)
                .put("snapshotRevision", "legacy")
                .put("createdAt", System.currentTimeMillis());
            return WidgetActionStore.enqueue(context, action);
        } catch (Exception error) { return false; }
    }

    public static synchronized JSONArray list(Context context) {
        return WidgetActionStore.list(context);
    }

    public static synchronized boolean acknowledge(Context context, JSONArray actionIds) {
        JSONArray results = new JSONArray();
        if (actionIds != null) {
            for (int index = 0; index < actionIds.length(); index += 1) {
                try {
                    results.put(new JSONObject()
                        .put("actionId", actionIds.optString(index, ""))
                        .put("status", "applied"));
                } catch (Exception ignored) {}
            }
        }
        return WidgetActionStore.acknowledge(context, results);
    }
}
