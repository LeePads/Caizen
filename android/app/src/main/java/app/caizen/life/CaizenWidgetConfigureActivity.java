package app.caizen.life;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.ArrayAdapter;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.appcompat.widget.SwitchCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Caizen-native profile/privacy configuration for a single widget instance. */
public final class CaizenWidgetConfigureActivity extends Activity {
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private boolean routinesWidget;
    private boolean todayWidget;
    private boolean workTasksWidget;
    private boolean awaitingProfiles;
    private String selectedProfileId = "";
    private SwitchCompat namesSwitch;
    private Spinner routineFilterSpinner;
    private Spinner appearanceSpinner;
    private String selectedAppearance;
    private static final String[] APPEARANCE_VALUES = {
        WidgetBindingStore.APPEARANCE_SYSTEM,
        WidgetBindingStore.APPEARANCE_LIGHT,
        WidgetBindingStore.APPEARANCE_DARK,
    };
    private Button saveButton;
    private final ArrayList<String> profileIds = new ArrayList<>();
    private final Map<String, LinearLayout> profileRows = new HashMap<>();
    private final Map<String, TextView> profileChecks = new HashMap<>();
    private static final String[] ROUTINE_FILTER_VALUES = {
        WidgetBindingStore.ROUTINE_FILTER_ALL,
        WidgetBindingStore.ROUTINE_FILTER_DAILY,
        WidgetBindingStore.ROUTINE_FILTER_WEEKLY,
        WidgetBindingStore.ROUTINE_FILTER_BIWEEKLY,
        WidgetBindingStore.ROUTINE_FILTER_MONTHLY,
    };
    private static final String[] ROUTINE_FILTER_LABELS = {
        "All due today",
        "Daily",
        "Weekly",
        "Biweekly",
        "Monthly",
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        appWidgetId = getIntent().getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        setResult(RESULT_CANCELED, resultIntent());
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        routinesWidget = isRoutinesWidget(appWidgetId);
        todayWidget = isTodayWidget(appWidgetId);
        workTasksWidget = isWorkTasksWidget(appWidgetId);
        if (state != null) {
            selectedProfileId = state.getString("selectedProfileId", "");
            selectedAppearance = state.getString("selectedAppearance");
        }
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (awaitingProfiles && !isFinishing()) render();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        state.putString("selectedProfileId", selectedProfileId);
        if (appearanceSpinner != null) {
            state.putString("selectedAppearance",
                APPEARANCE_VALUES[appearanceSpinner.getSelectedItemPosition()]);
        }
        super.onSaveInstanceState(state);
    }

    @Override
    public void onBackPressed() {
        setResult(RESULT_CANCELED, resultIntent());
        super.onBackPressed();
    }

    private void render() {
        JSONObject index = WidgetSnapshotStore.readIndex(this);
        JSONArray profiles = index == null ? null : index.optJSONArray("profiles");
        profileIds.clear();
        if (profiles != null) {
            for (int i = 0; i < profiles.length(); i += 1) {
                JSONObject entry = profiles.optJSONObject(i);
                if (entry == null) continue;
                String profileId = entry.optString("profileId", "").trim();
                if (!profileId.isEmpty()) profileIds.add(profileId);
            }
        }
        if (profileIds.isEmpty()) {
            renderUnavailable(index);
            return;
        }

        awaitingProfiles = false;
        JSONObject existingBinding = WidgetBindingStore.read(this, appWidgetId);
        if (selectedProfileId.isEmpty() && existingBinding != null) {
            selectedProfileId = existingBinding.optString("profileId", "").trim();
        }
        if (!profileIds.contains(selectedProfileId)) selectedProfileId = profileIds.get(0);
        boolean existingNames = existingBinding != null
            && WidgetBindingStore.NAMES.equals(existingBinding.optString("privacyMode", ""));
        renderAvailable(index, profiles, existingNames);
    }

    private void renderAvailable(JSONObject index, JSONArray profiles, boolean existingNames) {
        int background = CaizenWidgetFormat.paletteColor(
            this, index, "background", R.color.caizen_app_background);
        int surface = CaizenWidgetFormat.paletteColor(
            this, index, "card", R.color.caizen_widget_surface);
        int foreground = CaizenWidgetFormat.paletteColor(
            this, index, "foreground", R.color.caizen_widget_foreground);
        int muted = CaizenWidgetFormat.paletteColor(
            this, index, "mutedForeground", R.color.caizen_widget_muted);
        int accent = CaizenWidgetFormat.paletteColor(
            this, index, "primary", R.color.caizen_widget_accent);
        int accentForeground = CaizenWidgetFormat.paletteColor(
            this, index, "primaryForeground", R.color.caizen_widget_on_accent);
        applyWindowPalette(background);

        ScrollView scroll = createRoot(background);
        LinearLayout content = contentColumn(scroll, background);
        addText(content, "CAIZEN  ·  WIDGETS", 12, accent, Typeface.BOLD, 0, 0);
        addText(content, todayWidget ? "Configure Today"
                : workTasksWidget ? "Configure Work Tasks"
                : routinesWidget ? "Configure Routines" : "Configure Calendar",
            28, foreground, Typeface.BOLD, 10, 0);
        addText(content, "Pin this widget to one profile. Names stay hidden by default for launcher privacy.",
            14, muted, Typeface.NORMAL, 8, 0);

        addSectionLabel(content, "PIN TO PROFILE", muted, 22);
        LinearLayout profileList = new LinearLayout(this);
        profileList.setOrientation(LinearLayout.VERTICAL);
        profileRows.clear();
        profileChecks.clear();
        for (int i = 0; i < profiles.length(); i += 1) {
            JSONObject entry = profiles.optJSONObject(i);
            if (entry == null) continue;
            String profileId = entry.optString("profileId", "").trim();
            if (!profileIds.contains(profileId)) continue;
            String label = entry.optString("displayName", "").trim();
            addProfileRow(profileList, profileId, label.isEmpty() ? "Profile" : label,
                surface, foreground, muted, accent, i == 0 ? 0 : 8);
        }
        content.addView(profileList, fullWidth(0));

        addSectionLabel(content, "LAUNCHER PRIVACY", muted, 22);
        LinearLayout privacy = new LinearLayout(this);
        privacy.setOrientation(LinearLayout.VERTICAL);
        privacy.setPadding(dp(14), dp(10), dp(14), dp(10));
        privacy.setBackground(panel(surface, muted, 1, 16));
        namesSwitch = new SwitchCompat(this);
        namesSwitch.setText("Show names on this widget");
        namesSwitch.setTextColor(foreground);
        namesSwitch.setTextSize(14);
        namesSwitch.setChecked(existingNames);
        namesSwitch.setContentDescription(
            "Show names on this widget. Names are hidden by default for launcher privacy.");
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            namesSwitch.setThumbTintList(tintList(accent, surface));
            namesSwitch.setTrackTintList(tintList(withAlpha(accent, 0.42f), withAlpha(muted, 0.35f)));
        }
        privacy.addView(namesSwitch, fullWidth(0));
        TextView privacyHelp = addText(privacy,
            "Names are hidden by default. Enable this only when the launcher is private.",
            12, muted, Typeface.NORMAL, 4, 0);
        privacyHelp.setMaxLines(2);
        content.addView(privacy, fullWidth(12));

        addSectionLabel(content, getString(R.string.widget_appearance_label), muted, 22);
        appearanceSpinner = new Spinner(this);
        String[] appearanceLabels = {
            getString(R.string.widget_appearance_system),
            getString(R.string.widget_appearance_light),
            getString(R.string.widget_appearance_dark),
        };
        ArrayAdapter<String> appearanceAdapter = new ArrayAdapter<>(
            this, android.R.layout.simple_spinner_item, appearanceLabels);
        appearanceAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        appearanceSpinner.setAdapter(appearanceAdapter);
        appearanceSpinner.setMinimumHeight(dp(48));
        appearanceSpinner.setContentDescription(getString(R.string.widget_appearance_label));
        String appearance = selectedAppearance != null ? selectedAppearance
            : WidgetBindingStore.appearance(WidgetBindingStore.read(this, appWidgetId));
        for (int i = 0; i < APPEARANCE_VALUES.length; i += 1) {
            if (APPEARANCE_VALUES[i].equals(appearance)) appearanceSpinner.setSelection(i);
        }
        content.addView(appearanceSpinner, fullWidth(8));
        addText(content, getString(R.string.widget_appearance_help),
            12, muted, Typeface.NORMAL, 4, 0);

        if (routinesWidget) {
            addSectionLabel(content, "ROUTINE FREQUENCY", muted, 22);
            LinearLayout routineOptions = new LinearLayout(this);
            routineOptions.setOrientation(LinearLayout.VERTICAL);
            routineOptions.setPadding(dp(14), dp(10), dp(14), dp(10));
            routineOptions.setBackground(panel(surface, muted, 1, 16));
            routineFilterSpinner = new Spinner(this);
            ArrayAdapter<String> adapter = new ArrayAdapter<>(
                this,
                android.R.layout.simple_spinner_item,
                ROUTINE_FILTER_LABELS
            );
            adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
            routineFilterSpinner.setAdapter(adapter);
            JSONObject existing = WidgetBindingStore.read(this, appWidgetId);
            String existingFilter = WidgetBindingStore.routineFilter(existing);
            int selectedFilter = 0;
            for (int filterIndex = 0; filterIndex < ROUTINE_FILTER_VALUES.length; filterIndex += 1) {
                if (ROUTINE_FILTER_VALUES[filterIndex].equals(existingFilter)) {
                    selectedFilter = filterIndex;
                    break;
                }
            }
            routineFilterSpinner.setSelection(selectedFilter);
            routineFilterSpinner.setContentDescription(
                "Routine frequency filter. All due today is selected by default."
            );
            routineOptions.addView(routineFilterSpinner, fullWidth(0));
            TextView routineHelp = addText(routineOptions,
                "Choose which due-today routine frequencies appear. All keeps every supported frequency.",
                12, muted, Typeface.NORMAL, 4, 0);
            routineHelp.setMaxLines(3);
            content.addView(routineOptions, fullWidth(12));
        }

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button cancel = actionButton("Cancel", foreground, panel(background, muted, 1, 14));
        cancel.setContentDescription("Cancel widget configuration");
        cancel.setOnClickListener(view -> {
            setResult(RESULT_CANCELED, resultIntent());
            finish();
        });
        saveButton = actionButton("Save", accentForeground, panel(accent, accent, 0, 14));
        saveButton.setContentDescription("Save widget configuration");
        saveButton.setOnClickListener(view -> saveConfiguration());
        actions.addView(cancel, actionParams(0, 8));
        actions.addView(saveButton, actionParams(8, 0));
        content.addView(actions, fullWidth(20));

        setContentView(scroll);
        refreshProfileSelection(accent, foreground, surface, muted);
        ViewCompat.requestApplyInsets(scroll);
    }

    private void addProfileRow(
        LinearLayout parent,
        String profileId,
        String label,
        int surface,
        int foreground,
        int muted,
        int accent,
        int topMargin
    ) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(64));
        row.setPadding(dp(14), dp(8), dp(12), dp(8));
        row.setFocusable(true);
        row.setClickable(true);
        row.setContentDescription("Select profile " + label);
        row.setOnClickListener(view -> {
            selectedProfileId = profileId;
            refreshProfileSelection(accent, currentForeground(), surface, muted);
        });

        LinearLayout text = new LinearLayout(this);
        text.setOrientation(LinearLayout.VERTICAL);
        TextView title = addText(text, label, 15, foreground, Typeface.BOLD, 0, 0);
        title.setMaxLines(1);
        TextView helper = addText(text, "Profile data stays inside Caizen", 11, muted, Typeface.NORMAL, 3, 0);
        helper.setMaxLines(1);
        row.addView(text, weighted(1));

        TextView check = addText(row, "\u2713", 20, accent, Typeface.BOLD, 0, 0);
        check.setGravity(Gravity.CENTER);
        check.setContentDescription("Selected profile");
        check.setLayoutParams(fixed(dp(32)));
        parent.addView(row, fullWidth(topMargin));
        profileRows.put(profileId, row);
        profileChecks.put(profileId, check);
    }

    private void refreshProfileSelection(int accent, int foreground, int surface, int muted) {
        for (String profileId : profileIds) {
            boolean selected = profileId.equals(selectedProfileId);
            LinearLayout row = profileRows.get(profileId);
            TextView check = profileChecks.get(profileId);
            if (row == null || check == null) continue;
            row.setSelected(selected);
            row.setBackground(panel(selected ? withAlpha(accent, 0.14f) : surface,
                selected ? accent : muted, selected ? 2 : 1, 16));
            check.setVisibility(selected ? View.VISIBLE : View.INVISIBLE);
            row.setContentDescription(selected ? "Selected profile" : "Select profile");
        }
        if (saveButton != null) saveButton.setEnabled(!selectedProfileId.isEmpty());
    }

    private void saveConfiguration() {
        if (selectedProfileId.isEmpty()) return;
        String mode = namesSwitch != null && namesSwitch.isChecked()
            ? WidgetBindingStore.NAMES : WidgetBindingStore.REDACTED;
        String providerKind = todayWidget
            ? WidgetBindingStore.TODAY
            : workTasksWidget ? WidgetBindingStore.WORK_TASKS
            : routinesWidget ? WidgetBindingStore.ROUTINES : WidgetBindingStore.CALENDAR;
        boolean includeRoutines = !todayWidget;
        String routineFilter = routinesWidget && routineFilterSpinner != null
            ? ROUTINE_FILTER_VALUES[routineFilterSpinner.getSelectedItemPosition()]
            : WidgetBindingStore.ROUTINE_FILTER_ALL;
        if (!WidgetBindingStore.bind(this, appWidgetId, providerKind, selectedProfileId,
            mode, includeRoutines, routineFilter,
            APPEARANCE_VALUES[appearanceSpinner.getSelectedItemPosition()])) {
            if (saveButton != null) saveButton.setEnabled(false);
            return;
        }
        CaizenWidgetUpdater.refreshAll(this);
        setResult(RESULT_OK, resultIntent());
        finish();
    }

    private void renderUnavailable(JSONObject index) {
        awaitingProfiles = true;
        int background = CaizenWidgetFormat.paletteColor(
            this, index, "background", R.color.caizen_app_background);
        int surface = CaizenWidgetFormat.paletteColor(
            this, index, "card", R.color.caizen_widget_surface);
        int foreground = CaizenWidgetFormat.paletteColor(
            this, index, "foreground", R.color.caizen_widget_foreground);
        int muted = CaizenWidgetFormat.paletteColor(
            this, index, "mutedForeground", R.color.caizen_widget_muted);
        int accent = CaizenWidgetFormat.paletteColor(
            this, index, "primary", R.color.caizen_widget_accent);
        int accentForeground = CaizenWidgetFormat.paletteColor(
            this, index, "primaryForeground", R.color.caizen_widget_on_accent);
        applyWindowPalette(background);
        ScrollView scroll = createRoot(background);
        LinearLayout content = contentColumn(scroll, background);
        addText(content, "CAIZEN  ·  WIDGETS", 12, accent, Typeface.BOLD, 0, 0);
        addText(content, todayWidget ? "Configure Today"
                : workTasksWidget ? "Configure Work Tasks"
                : routinesWidget ? "Configure Routines" : "Configure Calendar",
            28, foreground, Typeface.BOLD, 10, 0);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(16), dp(16), dp(16), dp(16));
        panel.setBackground(panel(surface, muted, 1, 18));
        addText(panel, "Open Caizen to sync profiles before adding this widget.",
            15, foreground, Typeface.BOLD, 0, 0);
        addText(panel, "No profile names or records are shown here until a profile is available.",
            12, muted, Typeface.NORMAL, 6, 0);
        content.addView(panel, fullWidth(24));
        Button open = actionButton("Open Caizen", accentForeground, panel(accent, accent, 0, 14));
        open.setContentDescription("Open Caizen to sync profiles");
        open.setOnClickListener(view -> {
            awaitingProfiles = true;
            startActivity(new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP));
        });
        content.addView(open, fullWidth(16));
        Button cancel = actionButton("Cancel", foreground, panel(background, muted, 1, 14));
        cancel.setOnClickListener(view -> {
            setResult(RESULT_CANCELED, resultIntent());
            finish();
        });
        content.addView(cancel, fullWidth(8));
        setContentView(scroll);
        ViewCompat.requestApplyInsets(scroll);
    }

    private ScrollView createRoot(int background) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setBackgroundColor(background);
        return scroll;
    }

    private LinearLayout contentColumn(ScrollView scroll, int background) {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setBackgroundColor(background);
        int padding = dp(20);
        content.setPadding(padding, dp(24), padding, dp(24));
        scroll.addView(content, new ScrollView.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ViewCompat.setOnApplyWindowInsetsListener(scroll, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            content.setPadding(padding + bars.left, dp(24) + bars.top,
                padding + bars.right, dp(24) + bars.bottom);
            return insets;
        });
        return content;
    }

    private void applyWindowPalette(int background) {
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(background);
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }

    private TextView addText(
        LinearLayout parent,
        String value,
        float size,
        int color,
        int style,
        int topMargin,
        int bottomMargin
    ) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextColor(color);
        text.setTextSize(size);
        text.setTypeface(Typeface.create("sans-serif", style));
        text.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        parent.addView(text, fullWidth(topMargin, bottomMargin));
        return text;
    }

    private void addSectionLabel(LinearLayout parent, String value, int color, int topMargin) {
        TextView label = addText(parent, value, 11, color, Typeface.BOLD, topMargin, 8);
        label.setLetterSpacing(0.12f);
    }

    private Button actionButton(String label, int textColor, GradientDrawable background) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(textColor);
        button.setTextSize(14);
        button.setAllCaps(false);
        button.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        button.setGravity(Gravity.CENTER);
        button.setMinHeight(dp(48));
        button.setPadding(dp(16), 0, dp(16), 0);
        button.setBackground(background);
        return button;
    }

    private GradientDrawable panel(int fill, int stroke, int strokeWidth, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radius));
        if (strokeWidth > 0) drawable.setStroke(dp(strokeWidth), stroke);
        return drawable;
    }

    private ColorStateList tintList(int checked, int unchecked) {
        return new ColorStateList(
            new int[][] { new int[] { android.R.attr.state_checked }, new int[] {} },
            new int[] { checked, unchecked }
        );
    }

    private int currentForeground() {
        return CaizenWidgetFormat.paletteColor(
            this, WidgetSnapshotStore.readIndex(this), "foreground", R.color.caizen_widget_foreground);
    }

    private int withAlpha(int color, float alpha) {
        return Color.argb(Math.round(255 * Math.max(0f, Math.min(1f, alpha))),
            Color.red(color), Color.green(color), Color.blue(color));
    }

    private boolean isRoutinesWidget(int widgetId) {
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId);
        return info != null && info.provider != null
            && CaizenRoutinesWidget.class.getName().equals(info.provider.getClassName());
    }

    private boolean isTodayWidget(int widgetId) {
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId);
        return info != null && info.provider != null
            && CaizenTodayWidget.class.getName().equals(info.provider.getClassName());
    }

    private boolean isWorkTasksWidget(int widgetId) {
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId);
        return info != null && info.provider != null
            && CaizenWorkTasksWidget.class.getName().equals(info.provider.getClassName());
    }

    private Intent resultIntent() {
        return new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
    }

    private LinearLayout.LayoutParams fullWidth(int topMargin) {
        return fullWidth(topMargin, 0);
    }

    private LinearLayout.LayoutParams fullWidth(int topMargin, int bottomMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(topMargin);
        params.bottomMargin = dp(bottomMargin);
        return params;
    }

    private LinearLayout.LayoutParams fixed(int width) {
        return new LinearLayout.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams weighted(float weight) {
        return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, weight);
    }

    private LinearLayout.LayoutParams actionParams(int left, int right) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        params.leftMargin = dp(left);
        params.rightMargin = dp(right);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
