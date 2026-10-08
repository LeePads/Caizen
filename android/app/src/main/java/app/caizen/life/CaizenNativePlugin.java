package app.caizen.life;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.os.Build;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.provider.CalendarContract;
import android.provider.Settings;
import android.view.Window;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.json.JSONObject;
import org.json.JSONArray;

@CapacitorPlugin(name = "CaizenNative")
public class CaizenNativePlugin extends Plugin {
    @PluginMethod
    public void getNotificationAvailability(PluginCall call) {
        boolean runtimeGranted = Build.VERSION.SDK_INT < 33 ||
            getContext().checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        NotificationManager manager = (NotificationManager) getContext()
            .getSystemService(Activity.NOTIFICATION_SERVICE);
        boolean appEnabled = manager != null && manager.areNotificationsEnabled();
        JSObject result = new JSObject();
        result.put("runtimeGranted", runtimeGranted);
        result.put("appEnabled", appEnabled);
        call.resolve(result);
    }

    @PluginMethod
    public void openCalendarEvent(PluginCall call) {
        String title = trimToNull(call.getString("title"));
        String startAt = trimToNull(call.getString("startAt"));
        if (title == null || startAt == null) {
            call.reject("A title and start date are required.");
            return;
        }

        final long startMillis;
        final Long endMillis;
        try {
            startMillis = parseDateTime(startAt);
            String endAt = trimToNull(call.getString("endAt"));
            endMillis = endAt == null ? null : parseDateTime(endAt);
            if (endMillis != null && endMillis < startMillis) {
                call.reject("The end date cannot be before the start date.");
                return;
            }
        } catch (Exception error) {
            call.reject("The calendar date is invalid.");
            return;
        }

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.reject("Caizen is not ready to open the calendar.");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_INSERT)
                .setData(CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.Events.TITLE, title)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMillis)
                .putExtra(
                    CalendarContract.Events.DESCRIPTION,
                    valueOrEmpty(call.getString("description"))
                )
                .putExtra(
                    CalendarContract.Events.EVENT_LOCATION,
                    valueOrEmpty(call.getString("location"))
                )
                .putExtra(
                    CalendarContract.Events.ALL_DAY,
                    Boolean.TRUE.equals(call.getBoolean("allDay", false))
                );

            if (endMillis != null) {
                intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMillis);
            }

            activity.startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No compatible calendar application is installed.");
        } catch (Exception error) {
            call.reject("The calendar event could not be opened.", error);
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.reject("Caizen is not ready to open notification settings.");
            return;
        }

        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            activity.startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            openApplicationDetails(call, "Could not open notification settings.");
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openApplicationDetails(call, "Could not open app settings.");
    }

    @PluginMethod
    public void writeWidgetSnapshot(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null || payload.trim().isEmpty()) {
            call.reject("A snapshot payload is required.");
            return;
        }

        int byteCount = payload.getBytes(StandardCharsets.UTF_8).length;
        if (byteCount > WidgetSnapshotStore.MAX_PAYLOAD_BYTES) {
            call.reject("The snapshot payload is too large.");
            return;
        }

        try {
            JSONObject snapshot = new JSONObject(payload);
            int version = snapshot.optInt("version", -1);
            if (version != WidgetSnapshotStore.SUPPORTED_VERSION && version != WidgetSnapshotStore.LEGACY_VERSION) {
                call.reject("The widget snapshot version is not supported.");
                return;
            }

            if (!WidgetSnapshotStore.write(getContext(), snapshot.toString())) {
                call.reject("The widget snapshot could not be saved.");
                return;
            }

            CaizenWidgetUpdater.refreshAll(getContext());
            call.resolve();
        } catch (Exception error) {
            // Never log the payload: it can contain personal titles.
            call.reject("The widget snapshot could not be saved.", error);
        }
    }

    @PluginMethod
    public void clearWidgetSnapshot(PluginCall call) {
        try {
            if (!WidgetSnapshotStore.clear(getContext())) {
                call.reject("The widget snapshot could not be cleared.");
                return;
            }
            CaizenWidgetUpdater.refreshAll(getContext());
            call.resolve();
        } catch (Exception error) {
            call.reject("The widget snapshot could not be cleared.", error);
        }
    }

    @PluginMethod
    public void writeWidgetSnapshots(PluginCall call) {
        String indexPayload = call.getString("indexPayload");
        JSONArray projections = call.getArray("projections");
        if (indexPayload == null || indexPayload.trim().isEmpty() || projections == null) {
            call.reject("A widget profile index and projections are required.");
            return;
        }
        if (indexPayload.getBytes(StandardCharsets.UTF_8).length > WidgetSnapshotStore.MAX_PAYLOAD_BYTES) {
            call.reject("The widget profile index is too large.");
            return;
        }
        try {
            if (!WidgetSnapshotStore.writeSnapshots(getContext(), indexPayload, projections)) {
                call.reject("The widget projections could not be saved.");
                return;
            }
            WidgetActionStore.clearFailures(getContext());
            CaizenWidgetUpdater.refreshAll(getContext());
            call.resolve();
        } catch (Exception error) {
            call.reject("The widget projections could not be saved.", error);
        }
    }

    @PluginMethod
    public void clearWidgetSnapshots(PluginCall call) {
        try {
            if (!WidgetSnapshotStore.clearSnapshots(getContext())) {
                call.reject("The widget projections could not be cleared.");
                return;
            }
            CaizenWidgetUpdater.refreshAll(getContext());
            call.resolve();
        } catch (Exception error) {
            call.reject("The widget projections could not be cleared.", error);
        }
    }

    @PluginMethod
    public void getPendingWidgetActions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("actions", WidgetActionStore.list(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void ackWidgetActions(PluginCall call) {
        JSONArray results = call.getArray("results");
        if (results == null) {
            call.reject("Widget action results are required.");
            return;
        }
        JSONArray actions = WidgetActionStore.list(getContext());
        if (!WidgetActionStore.acknowledge(getContext(), results)) {
            call.reject("Widget actions could not be acknowledged.");
            return;
        }
        CaizenWidgetUpdater.refreshForActions(getContext(), actions, results);
        call.resolve();
    }

    @PluginMethod
    public void getPendingRoutineActions(PluginCall call) {
        JSObject result = new JSObject();
        JSONArray legacy = new JSONArray();
        JSONArray actions = WidgetActionStore.list(getContext());
        for (int index = 0; index < actions.length(); index += 1) {
            JSONObject action = actions.optJSONObject(index);
            if (action == null) continue;
            try {
                legacy.put(new JSONObject()
                    .put("actionId", action.optString("actionId", ""))
                    .put("profileId", action.optString("profileId", ""))
                    .put("routineId", action.optString("recordId", ""))
                    .put("dateKey", action.optString("localDateKey", ""))
                    .put("occurrenceKey", action.optString("occurrenceKey", "")));
            } catch (Exception ignored) {}
        }
        result.put("actions", legacy);
        call.resolve(result);
    }

    @PluginMethod
    public void ackPendingRoutineActions(PluginCall call) {
        JSONArray actionIds = call.getArray("actionIds");
        if (actionIds == null) {
            call.reject("A list of routine action IDs is required.");
            return;
        }
        JSONArray results = new JSONArray();
        for (int index = 0; index < actionIds.length(); index += 1) {
            try {
                results.put(new JSONObject()
                    .put("actionId", actionIds.optString(index, ""))
                    .put("status", "applied"));
            } catch (Exception ignored) {}
        }
        if (!WidgetActionStore.acknowledge(getContext(), results)) {
            call.reject("Pending routine actions could not be acknowledged.");
            return;
        }
        CaizenWidgetUpdater.refreshRoutines(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setPrivacyScreen(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.reject("Caizen is not ready to change privacy protection.");
            return;
        }

        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        activity.runOnUiThread(() -> {
            try {
                Window window = activity.getWindow();
                if (enabled) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                }
                call.resolve();
            } catch (Exception error) {
                call.reject("Privacy protection could not be changed.", error);
            }
        });
    }

    @PluginMethod
    public void saveAs(PluginCall call) {
        String sourcePath = trimToNull(call.getString("sourcePath"));
        String fileName = safeFileName(call.getString("fileName"));
        String mimeType = trimToNull(call.getString("mimeType"));

        if (sourcePath == null || fileName == null) {
            call.reject("A source file and name are required.");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(mimeType == null ? "application/octet-stream" : mimeType)
            .putExtra(Intent.EXTRA_TITLE, fileName);

        startActivityForResult(call, intent, "saveAsResult");
    }

    @ActivityCallback
    private void saveAsResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Save cancelled.");
            return;
        }

        Uri destination = result.getData().getData();
        String sourcePath = trimToNull(call.getString("sourcePath"));
        if (destination == null || sourcePath == null) {
            call.reject("The selected destination is unavailable.");
            return;
        }

        try (
            InputStream input = openSource(sourcePath);
            OutputStream output = getContext()
                .getContentResolver()
                .openOutputStream(destination, "w")
        ) {
            if (input == null || output == null) {
                throw new IOException("File stream unavailable.");
            }

            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
            output.flush();

            JSObject response = new JSObject();
            response.put("uri", destination.toString());
            call.resolve(response);
        } catch (Exception error) {
            call.reject("The file could not be saved.", error);
        }
    }

    private void openApplicationDetails(PluginCall call, String errorMessage) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.reject(errorMessage);
            return;
        }

        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:" + getContext().getPackageName()));
            activity.startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject(errorMessage, error);
        }
    }

    private InputStream openSource(String sourcePath) throws IOException {
        Uri uri = Uri.parse(sourcePath);
        String scheme = uri.getScheme();

        if ("content".equalsIgnoreCase(scheme)
            || "android.resource".equalsIgnoreCase(scheme)) {
            InputStream stream = getContext().getContentResolver().openInputStream(uri);
            if (stream == null) throw new IOException("Source stream unavailable.");
            return stream;
        }

        if ("file".equalsIgnoreCase(scheme)) {
            String path = uri.getPath();
            if (path == null) throw new IOException("Invalid file URI.");
            return new FileInputStream(new File(path));
        }

        if (scheme == null || scheme.isEmpty()) {
            return new FileInputStream(new File(sourcePath));
        }

        throw new IOException("Unsupported source URI.");
    }

    private static long parseDateTime(String value) {
        try {
            return Instant.parse(value).toEpochMilli();
        } catch (Exception ignored) {
        }
        try {
            return OffsetDateTime.parse(value).toInstant().toEpochMilli();
        } catch (Exception ignored) {
        }
        try {
            return ZonedDateTime.parse(value).toInstant().toEpochMilli();
        } catch (Exception ignored) {
        }
        try {
            return LocalDateTime.parse(value)
                .atZone(ZoneId.systemDefault())
                .toInstant()
                .toEpochMilli();
        } catch (Exception ignored) {
        }
        return LocalDate.parse(value)
            .atStartOfDay(ZoneId.systemDefault())
            .toInstant()
            .toEpochMilli();
    }

    private static String safeFileName(String value) {
        String name = trimToNull(value);
        if (name == null) return null;
        name = name.replace('\0', '_').replace('/', '_').replace('\\', '_').trim();
        return name.isEmpty() ? null : name;
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }
}
