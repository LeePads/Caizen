package app.caizen.life;

import android.content.Context;
import android.content.SharedPreferences;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bounded native projection cache; IndexedDB remains the domain authority. */
public final class WidgetSnapshotStore {
    public static final int SUPPORTED_VERSION = 7;
    public static final int PREVIOUS_VERSION = 6;
    public static final int LEGACY_VERSION = 5;
    public static final int PROFILE_INDEX_VERSION = 1;
    public static final int MAX_PAYLOAD_BYTES = 24 * 1024;

    @Deprecated
    public static final int MAX_PAYLOAD_CHARS = MAX_PAYLOAD_BYTES;

    private static final String PREFS_NAME = "caizen_widget_snapshot";
    private static final String KEY_PAYLOAD = "payload";
    private static final String KEY_UPDATED_AT = "updatedAt";
    private static final String KEY_INDEX = "index";
    private static final String PROFILE_PREFIX = "profile:";

    private WidgetSnapshotStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    /** Compatibility writer for the old single active-profile bridge. */
    @Deprecated
    public static boolean write(Context context, String payload) {
        if (!validPayload(payload, LEGACY_VERSION, null)) return false;
        return prefs(context).edit().putString(KEY_PAYLOAD, payload)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis()).commit();
    }

    /** Replaces the bounded index and all profile projections atomically. */
    public static boolean writeSnapshots(Context context, String indexPayload, JSONArray projections) {
        try {
            JSONObject index = new JSONObject(indexPayload);
            if (index.optInt("version", -1) != PROFILE_INDEX_VERSION || projections == null) return false;
            JSONArray entries = index.optJSONArray("profiles");
            if (entries == null) return false;

            Set<String> incomingIds = new HashSet<>();
            for (int i = 0; i < projections.length(); i += 1) {
                JSONObject projection = projections.optJSONObject(i);
                if (projection == null) return false;
                String profileId = trimToNull(projection.optString("profileId", ""));
                String payload = projection.optString("payload", "");
            if (profileId == null || !validPayload(payload, SUPPORTED_VERSION, profileId)) return false;
                incomingIds.add(profileId);
            }
            for (int i = 0; i < entries.length(); i += 1) {
                JSONObject entry = entries.optJSONObject(i);
                String profileId = entry == null ? null : trimToNull(entry.optString("profileId", ""));
                if (profileId == null || !incomingIds.contains(profileId)) return false;
            }

            SharedPreferences preferences = prefs(context);
            SharedPreferences.Editor editor = preferences.edit();
            try {
                JSONArray previous = new JSONObject(preferences.getString(KEY_INDEX, "{}"))
                    .optJSONArray("profiles");
                if (previous != null) {
                    for (int i = 0; i < previous.length(); i += 1) {
                        JSONObject entry = previous.optJSONObject(i);
                        String profileId = entry == null ? null : trimToNull(entry.optString("profileId", ""));
                        if (profileId != null && !incomingIds.contains(profileId)) {
                            editor.remove(PROFILE_PREFIX + profileId);
                        }
                    }
                }
            } catch (Exception ignored) {
                // Never remove unknown keys after malformed metadata.
            }
            for (int i = 0; i < projections.length(); i += 1) {
                JSONObject projection = projections.optJSONObject(i);
                editor.putString(PROFILE_PREFIX + projection.optString("profileId", "").trim(),
                    projection.optString("payload", ""));
            }
            editor.putString(KEY_INDEX, index.toString())
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .remove(KEY_PAYLOAD);
            return editor.commit();
        } catch (Exception error) {
            return false;
        }
    }

    public static boolean clear(Context context) { return clearSnapshots(context); }

    public static boolean clearSnapshots(Context context) {
        SharedPreferences preferences = prefs(context);
        SharedPreferences.Editor editor = preferences.edit();
        try {
            JSONArray profiles = new JSONObject(preferences.getString(KEY_INDEX, "{}"))
                .optJSONArray("profiles");
            if (profiles != null) {
                for (int i = 0; i < profiles.length(); i += 1) {
                    JSONObject entry = profiles.optJSONObject(i);
                    String profileId = entry == null ? null : trimToNull(entry.optString("profileId", ""));
                    if (profileId != null) editor.remove(PROFILE_PREFIX + profileId);
                }
            }
        } catch (Exception ignored) {}
        return editor.remove(KEY_INDEX).remove(KEY_PAYLOAD).remove(KEY_UPDATED_AT).commit();
    }

    public static long lastUpdatedAt(Context context) {
        return prefs(context).getLong(KEY_UPDATED_AT, 0L);
    }

    public static JSONObject readIndex(Context context) {
        try {
            String raw = prefs(context).getString(KEY_INDEX, null);
            if (raw == null || raw.trim().isEmpty()) return null;
            JSONObject index = new JSONObject(raw);
            return index.optInt("version", -1) == PROFILE_INDEX_VERSION ? index : null;
        } catch (Exception error) { return null; }
    }

    /** Returns the active projection, retaining a v5 compatibility fallback. */
    public static JSONObject read(Context context) {
        JSONObject index = readIndex(context);
        if (index != null) {
            String active = trimToNull(index.optString("activeProfileId", ""));
            if (active != null) return readProjection(context, active);
        }
        return readLegacy(context);
    }

    /** Resolves a widget instance to its private profile/privacy binding. */
    public static JSONObject readForWidget(Context context, int widgetId) {
        JSONObject binding = WidgetBindingStore.read(context, widgetId);
        if (binding != null) {
            String profileId = trimToNull(binding.optString("profileId", ""));
            JSONObject snapshot = profileId == null ? null : readProjection(context, profileId);
            if (snapshot == null) return configurationRequired();
            return WidgetBindingStore.NAMES.equals(binding.optString("privacyMode", ""))
                ? snapshot : redact(snapshot);
        }
        JSONObject snapshot = read(context);
        return snapshot == null ? null : redact(snapshot);
    }

    public static boolean isRedacted(JSONObject snapshot) {
        return snapshot != null && snapshot.optBoolean("redacted", false);
    }

    public static boolean isConfigurationRequired(JSONObject snapshot) {
        return snapshot != null && snapshot.optBoolean("configurationRequired", false);
    }

    private static JSONObject readProjection(Context context, String profileId) {
        try {
            String payload = prefs(context).getString(PROFILE_PREFIX + profileId, null);
            if (!readablePayload(payload, profileId)) return null;
            return new JSONObject(payload);
        } catch (Exception error) { return null; }
    }

    private static JSONObject readLegacy(Context context) {
        try {
            String payload = prefs(context).getString(KEY_PAYLOAD, null);
            if (!readablePayload(payload, null)) return null;
            return new JSONObject(payload);
        } catch (Exception error) { return null; }
    }

    private static JSONObject configurationRequired() {
        try {
            return new JSONObject().put("version", SUPPORTED_VERSION).put("configurationRequired", true);
        } catch (Exception error) { return null; }
    }

    private static JSONObject redact(JSONObject source) {
        try {
            JSONObject copy = new JSONObject(source.toString());
            copy.put("profileName", "Caizen").put("redacted", true);
            redactArray(copy.optJSONArray("tasks"), "Task");
            redactArray(copy.optJSONArray("routines"), "Routine");
            redactArray(copy.optJSONArray("events"), "Event");
            JSONObject today = copy.optJSONObject("today");
            if (today != null) {
                redactArray(today.optJSONArray("items"), "Item");
                JSONObject todayNextEvent = today.optJSONObject("nextEvent");
                if (todayNextEvent != null) todayNextEvent.put("title", "Event");
            }
            JSONObject workTasks = copy.optJSONObject("workTasks");
            if (workTasks != null) redactArray(workTasks.optJSONArray("items"), "Work task");
            JSONObject nextEvent = copy.optJSONObject("nextEvent");
            if (nextEvent != null) nextEvent.put("title", "Event");
            return copy;
        } catch (Exception error) { return null; }
    }

    private static void redactArray(JSONArray values, String label) {
        if (values == null) return;
        for (int i = 0; i < values.length(); i += 1) {
            JSONObject value = values.optJSONObject(i);
            if (value != null) {
                try { value.put("title", label); } catch (Exception ignored) {}
            }
        }
    }

    private static boolean validPayload(String payload, int version, String expectedProfileId) {
        if (payload == null || payload.trim().isEmpty()
            || payload.getBytes(StandardCharsets.UTF_8).length > MAX_PAYLOAD_BYTES) return false;
        try {
            JSONObject value = new JSONObject(payload);
            if (value.optInt("version", -1) != version) return false;
            return expectedProfileId == null
                || expectedProfileId.equals(trimToNull(value.optString("profileId", "")));
        } catch (Exception error) { return false; }
    }

    private static boolean readablePayload(String payload, String expectedProfileId) {
        if (payload == null || payload.trim().isEmpty()
            || payload.getBytes(StandardCharsets.UTF_8).length > MAX_PAYLOAD_BYTES) return false;
        try {
            JSONObject value = new JSONObject(payload);
            int version = value.optInt("version", -1);
            if (version != LEGACY_VERSION && version != PREVIOUS_VERSION && version != SUPPORTED_VERSION) {
                return false;
            }
            return expectedProfileId == null
                || expectedProfileId.equals(trimToNull(value.optString("profileId", "")));
        } catch (Exception error) { return false; }
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public static String optString(JSONObject snapshot, String key) {
        if (snapshot == null) return "";
        String value = snapshot.optString(key, "");
        return value == null ? "" : value.trim();
    }

    public static int optInt(JSONObject snapshot, String key) {
        return snapshot == null ? 0 : snapshot.optInt(key, 0);
    }

    public static JSONArray optArray(JSONObject snapshot, String key) {
        if (snapshot == null) return new JSONArray();
        JSONArray value = snapshot.optJSONArray(key);
        return value == null ? new JSONArray() : value;
    }

    public static JSONObject optObject(JSONObject snapshot, String key) {
        return snapshot == null ? null : snapshot.optJSONObject(key);
    }
}
