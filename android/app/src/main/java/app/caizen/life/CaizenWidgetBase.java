package app.caizen.life;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Shared, defensive behavior for every Caizen home-screen widget. */
public abstract class CaizenWidgetBase extends AppWidgetProvider {
    protected static final String ACTION_REFRESH = "app.caizen.life.WIDGET_REFRESH";

    @Override
    public void onUpdate(
        Context context,
        AppWidgetManager appWidgetManager,
        int[] appWidgetIds
    ) {
        for (int appWidgetId : appWidgetIds) {
            migrateExistingBinding(context, appWidgetId);
            updateSafely(context, appWidgetManager, appWidgetId);
        }
    }

    /** Existing installs had one active-profile projection; pin them once. */
    protected void migrateExistingBinding(Context context, int appWidgetId) {
        if (WidgetBindingStore.read(context, appWidgetId) != null) return;
        JSONObject index = WidgetSnapshotStore.readIndex(context);
        String activeProfileId = WidgetSnapshotStore.optString(index, "activeProfileId");
        if (!activeProfileId.isEmpty()) {
            WidgetBindingStore.bind(context, appWidgetId, widgetProviderKind(), activeProfileId,
                WidgetBindingStore.REDACTED, true);
        }
    }

    protected String widgetProviderKind() {
        return WidgetBindingStore.CALENDAR;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent != null && ACTION_REFRESH.equals(intent.getAction())) {
            CaizenWidgetUpdater.refreshAll(context);
        }
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        super.onDeleted(context, appWidgetIds);
        if (appWidgetIds == null) return;
        for (int widgetId : appWidgetIds) {
            WidgetBindingStore.remove(context, widgetId);
        }
    }

    protected static JSONObject snapshot(Context context, int appWidgetId) {
        return WidgetSnapshotStore.readForWidget(context, appWidgetId);
    }

    protected final void updateSafely(
        Context context,
        AppWidgetManager manager,
        int appWidgetId
    ) {
        try {
            manager.updateAppWidget(appWidgetId, buildViews(context, appWidgetId));
        } catch (Exception error) {
            manager.updateAppWidget(appWidgetId, buildFallbackViews(context, appWidgetId));
        }
    }

    protected abstract RemoteViews buildViews(Context context, int appWidgetId);

    protected abstract RemoteViews buildFallbackViews(Context context, int appWidgetId);

    protected static PendingIntent deepLink(
        Context context,
        String requestKey,
        String section,
        String action,
        String recordId
    ) {
        return deepLink(context, requestKey, section, action, recordId, null);
    }

    protected static PendingIntent deepLink(
        Context context,
        String requestKey,
        String section,
        String action,
        String recordId,
        String profileId
    ) {
        return PendingIntent.getActivity(
            context,
            requestKey.hashCode(),
            deepLinkIntent(context, requestKey, section, action, recordId, profileId),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    protected static Intent deepLinkIntent(
        Context context,
        String requestKey,
        String section,
        String action,
        String recordId,
        String profileId
    ) {
        StringBuilder uri = new StringBuilder("caizen://open?section=")
            .append(Uri.encode(section));
        if (action != null && !action.isEmpty()) {
            uri.append("&action=").append(Uri.encode(action));
        }
        if (recordId != null && !recordId.isEmpty()) {
            uri.append("&record=").append(Uri.encode(recordId));
        }
        if (profileId != null && !profileId.isEmpty()) {
            uri.append("&profile=").append(Uri.encode(profileId));
        }
        uri.append("&source=widget");

        Intent intent = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse(uri.toString()))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        return intent;
    }

    protected PendingIntent refreshIntent(Context context) {
        Intent intent = new Intent(context, getClass()).setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(
            context,
            getClass().getName().hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
