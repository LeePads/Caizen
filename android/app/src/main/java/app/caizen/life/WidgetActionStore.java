package app.caizen.life;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bounded native transport for direct widget actions. IndexedDB stays authoritative. */
public final class WidgetActionStore {
    public static final int MAX_ACTIONS = 32;
    private static final long MAX_ACTION_AGE_MS = 2L * 24L * 60L * 60L * 1000L;
    private static final String PREFS_NAME = "caizen_widget_actions";
    private static final String KEY_ACTIONS = "actions";
    private static final String KEY_ACCEPTED = "accepted";
    private static final String KEY_FAILURES = "failures";

    private WidgetActionStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static JSONArray readActions(Context context) {
        try {
            JSONArray source = new JSONArray(prefs(context).getString(KEY_ACTIONS, "[]"));
            JSONArray valid = new JSONArray();
            for (int index = 0; index < source.length() && valid.length() < MAX_ACTIONS; index += 1) {
                JSONObject action = source.optJSONObject(index);
                if (validAction(action)) valid.put(action);
            }
            return valid;
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private static JSONArray readAccepted(Context context) {
        try {
            JSONArray source = new JSONArray(prefs(context).getString(KEY_ACCEPTED, "[]"));
            JSONArray valid = new JSONArray();
            for (int index = 0; index < source.length() && valid.length() < MAX_ACTIONS; index += 1) {
                JSONObject action = source.optJSONObject(index);
                if (validAction(action)) valid.put(action);
            }
            return valid;
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    public static synchronized JSONArray list(Context context) {
        return readActions(context);
    }

    /** Bounded local-completion overlay; IndexedDB remains authoritative. */
    public static synchronized JSONArray listAccepted(Context context) {
        JSONArray accepted = readAccepted(context);
        JSONArray queued = readActions(context);
        boolean changed = false;
        for (int index = 0; index < queued.length(); index += 1) {
            JSONObject action = queued.optJSONObject(index);
            if (action != null && !contains(accepted, action.optString("actionId", ""))) {
                accepted.put(action);
                changed = true;
            }
        }
        if (changed) prefs(context).edit().putString(KEY_ACCEPTED, accepted.toString()).commit();
        return accepted;
    }

    public static synchronized boolean enqueue(Context context, JSONObject action) {
        if (!validateForWidget(context, action)) return false;
        JSONArray current = readActions(context);
        JSONArray accepted = readAccepted(context);
        String actionId = action.optString("actionId", "");
        for (int index = 0; index < current.length(); index += 1) {
            if (actionId.equals(current.optJSONObject(index).optString("actionId", ""))) {
                if (!contains(accepted, actionId)) {
                    accepted.put(action);
                    boolean persisted = prefs(context).edit()
                        .putString(KEY_ACCEPTED, accepted.toString())
                        .commit();
                    if (!persisted) recordFailure(context, actionId, "persistence_failed");
                    return persisted;
                }
                return true;
            }
        }
        if (current.length() >= MAX_ACTIONS) {
            recordFailure(context, actionId, "queue_full");
            return false;
        }
        current.put(action);
        accepted.put(action);
        boolean persisted = prefs(context).edit()
            .putString(KEY_ACTIONS, current.toString())
            .putString(KEY_ACCEPTED, accepted.toString())
            .commit();
        if (!persisted) recordFailure(context, actionId, "persistence_failed");
        return persisted;
    }

    public static synchronized boolean acknowledge(Context context, JSONArray results) {
        JSONArray current = readActions(context);
        JSONArray accepted = readAccepted(context);
        JSONArray remaining = new JSONArray();
        for (int index = 0; index < current.length(); index += 1) {
            JSONObject action = current.optJSONObject(index);
            if (action == null) continue;
            JSONObject result = resultFor(results, action.optString("actionId", ""));
            String status = result == null ? "" : result.optString("status", "");
            if (result == null || "retryableFailure".equals(status)
                || (!"applied".equals(status) && !"alreadyApplied".equals(status)
                    && !"rejected".equals(status))) {
                remaining.put(action);
            } else if ("rejected".equals(status)) {
                remove(accepted, action.optString("actionId", ""));
                recordFailure(context, action.optString("actionId", ""), result.optString("reason", "rejected"));
            } else {
                markSynced(accepted, action.optString("actionId", ""));
            }
        }
        return prefs(context).edit()
            .putString(KEY_ACTIONS, remaining.toString())
            .putString(KEY_ACCEPTED, accepted.toString())
            .commit();
    }

    /** Clears the overlay after the canonical projection visibly contains it. */
    public static synchronized boolean clearAccepted(Context context, String actionId) {
        JSONArray accepted = readAccepted(context);
        if (!remove(accepted, actionId)) return true;
        return prefs(context).edit().putString(KEY_ACCEPTED, accepted.toString()).commit();
    }

    public static synchronized JSONObject failure(Context context, String actionId) {
        try {
            JSONObject failures = new JSONObject(prefs(context).getString(KEY_FAILURES, "{}"));
            return failures.optJSONObject(actionId);
        } catch (Exception ignored) {
            return null;
        }
    }

    public static synchronized void clearFailures(Context context) {
        prefs(context).edit().remove(KEY_FAILURES).commit();
    }

    private static void recordFailure(Context context, String actionId, String reason) {
        if (actionId == null || actionId.trim().isEmpty()) return;
        try {
            JSONObject failures = new JSONObject(prefs(context).getString(KEY_FAILURES, "{}"));
            failures.put(actionId, new JSONObject().put("reason", reason).put("at", System.currentTimeMillis()));
            prefs(context).edit().putString(KEY_FAILURES, failures.toString()).commit();
        } catch (Exception ignored) {
            // Failure feedback is best effort; the action remains non-successful.
        }
    }

    private static JSONObject resultFor(JSONArray results, String actionId) {
        if (results == null) return null;
        for (int index = 0; index < results.length(); index += 1) {
            JSONObject result = results.optJSONObject(index);
            if (result != null && actionId.equals(result.optString("actionId", ""))) return result;
        }
        return null;
    }

    private static boolean contains(JSONArray actions, String actionId) {
        for (int index = 0; index < actions.length(); index += 1) {
            JSONObject action = actions.optJSONObject(index);
            if (action != null && actionId.equals(action.optString("actionId", ""))) return true;
        }
        return false;
    }

    private static void markSynced(JSONArray actions, String actionId) {
        for (int index = 0; index < actions.length(); index += 1) {
            JSONObject action = actions.optJSONObject(index);
            if (action == null || !actionId.equals(action.optString("actionId", ""))) continue;
            try {
                action.put("syncState", "synced");
            } catch (Exception ignored) {
                // The action remains accepted-local if its presentation marker cannot update.
            }
        }
    }

    private static boolean remove(JSONArray actions, String actionId) {
        boolean removed = false;
        JSONArray remaining = new JSONArray();
        for (int index = 0; index < actions.length(); index += 1) {
            JSONObject action = actions.optJSONObject(index);
            if (action == null || actionId.equals(action.optString("actionId", ""))) {
                removed = true;
                continue;
            }
            remaining.put(action);
        }
        if (removed) {
            while (actions.length() > 0) actions.remove(actions.length() - 1);
            for (int index = 0; index < remaining.length(); index += 1) {
                actions.put(remaining.optJSONObject(index));
            }
        }
        return removed;
    }

    private static boolean validAction(JSONObject action) {
        if (action == null || action.optInt("schemaVersion", -1) != 1) return false;
        String actionType = action.optString("actionType", "");
        if (!"routine.complete".equals(actionType)
            && !"task.complete".equals(actionType)
            && !"workTask.complete".equals(actionType)) return false;
        if (action.optInt("sourceWidgetId", -1) < 0) return false;
        if (("task.complete".equals(actionType) || "workTask.complete".equals(actionType))
            && !"once".equals(action.optString("occurrenceKey", ""))) return false;
        return nonEmpty(action, "actionId")
            && nonEmpty(action, "profileId")
            && nonEmpty(action, "recordId")
            && nonEmpty(action, "localDateKey")
            && nonEmpty(action, "occurrenceKey")
            && nonEmpty(action, "snapshotRevision")
            && action.optLong("createdAt", 0L) > 0L
            && action.optLong("createdAt", 0L) <= System.currentTimeMillis()
            && System.currentTimeMillis() - action.optLong("createdAt", 0L) <= MAX_ACTION_AGE_MS;
    }

    /**
     * Native transport validation is provider-aware and projection-aware. The
     * WebView validates again against IndexedDB; this layer only prevents a
     * launcher intent from crossing a widget/profile/action boundary.
     */
    public static boolean validateForWidget(Context context, JSONObject action) {
        if (!validAction(action)) return false;
        int widgetId = action.optInt("sourceWidgetId", -1);
        JSONObject binding = WidgetBindingStore.read(context, widgetId);
        if (binding == null) return false;

        String provider = binding.optString("providerKind", "").trim();
        if (provider.isEmpty()) provider = WidgetBindingStore.providerKindForWidget(context, widgetId);
        String type = action.optString("actionType", "");
        if (!allowed(provider, type)) return false;
        if (!action.optString("profileId", "").equals(binding.optString("profileId", ""))) return false;

        JSONObject snapshot = WidgetSnapshotStore.readForWidget(context, widgetId);
        if (snapshot == null || WidgetSnapshotStore.isRedacted(snapshot)
            || WidgetSnapshotStore.isConfigurationRequired(snapshot)) return false;
        if (!action.optString("profileId", "").equals(WidgetSnapshotStore.optString(snapshot, "profileId"))) return false;
        if (!action.optString("snapshotRevision", "").equals(WidgetSnapshotStore.optString(snapshot, "revision"))) return false;
        if (!localTodayKey().equals(action.optString("localDateKey", ""))) return false;

        String recordId = action.optString("recordId", "");
        String occurrenceKey = action.optString("occurrenceKey", "");
        JSONArray values;
        String expectedId;
        if ("routine.complete".equals(type)) {
            JSONObject today = WidgetBindingStore.TODAY.equals(provider)
                ? WidgetSnapshotStore.optObject(snapshot, "today") : null;
            values = today == null
                ? WidgetSnapshotStore.optArray(snapshot, "routines")
                : WidgetSnapshotStore.optArray(today, "items");
            expectedId = WidgetActionIds.routineComplete(action.optString("profileId", ""), recordId, occurrenceKey);
        } else if ("task.complete".equals(type)) {
            JSONObject today = WidgetSnapshotStore.optObject(snapshot, "today");
            values = today == null ? new JSONArray() : WidgetSnapshotStore.optArray(today, "items");
            expectedId = WidgetActionIds.taskComplete(action.optString("profileId", ""), recordId, occurrenceKey);
        } else {
            JSONObject work = WidgetSnapshotStore.optObject(snapshot, "workTasks");
            values = work == null ? new JSONArray() : WidgetSnapshotStore.optArray(work, "items");
            expectedId = WidgetActionIds.workTaskComplete(action.optString("profileId", ""), recordId, occurrenceKey);
        }
        if (!expectedId.equals(action.optString("actionId", ""))) return false;

        for (int index = 0; index < values.length(); index += 1) {
            JSONObject value = values.optJSONObject(index);
            if (value == null || !recordId.equals(WidgetSnapshotStore.optString(value, "id"))) continue;
            if ("routine.complete".equals(type)
                && WidgetBindingStore.ROUTINES.equals(provider)
                && !WidgetBindingStore.routineMatchesFilter(value, WidgetBindingStore.routineFilter(binding))) {
                return false;
            }
            if (value.optBoolean("done", false)) return false;
            if (!occurrenceKey.equals(WidgetSnapshotStore.optString(value, "occurrenceKey"))) return false;
            if (!action.optString("localDateKey", "").equals(WidgetSnapshotStore.optString(value, "dateKey"))) return false;
            if ("task.complete".equals(type) && !"task".equals(WidgetSnapshotStore.optString(value, "kind"))) return false;
            if ("routine.complete".equals(type) && WidgetBindingStore.TODAY.equals(provider)) return false;
            return true;
        }
        return false;
    }

    private static boolean allowed(String provider, String actionType) {
        if (WidgetBindingStore.ROUTINES.equals(provider)) return "routine.complete".equals(actionType);
        if (WidgetBindingStore.TODAY.equals(provider)) return "task.complete".equals(actionType);
        if (WidgetBindingStore.WORK_TASKS.equals(provider)) return "workTask.complete".equals(actionType);
        return false;
    }

    private static String localTodayKey() {
        return new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
    }

    private static boolean nonEmpty(JSONObject object, String key) {
        return object.optString(key, "").trim().length() > 0;
    }
}
