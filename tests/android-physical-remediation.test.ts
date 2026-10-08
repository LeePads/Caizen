import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

describe('Android physical-device remediation contracts', () => {
  it('keeps Dashboard actions wired while using a compact native setup sheet', () => {
    const source = read('components/sections/Dashboard.tsx');

    expect(source).toContain('onClick={openDashboardSettings}');
    expect(source).toContain('setDashboardSetupStep(1)');
    expect(source).not.toContain('showAndroidDetails');
    expect(source).toContain('{(androidCompact || hasReviewContent) && (');
    expect(source).not.toMatch(/className="android-dashboard-setup[^\n]*min-h-full/);
  });

  it('contains Health selectors, saved meals, and template editors in their owned overlays', () => {
    const health = read('components/sections/HealthSection.tsx');
    const picker = read('components/modals/MealTemplatePickerModal.tsx');
    const supplement = read('components/modals/SupplementModal.tsx');
    const supplements = read('components/sections/SupplementsSection.tsx');

    expect(health).toContain("key={`meal-template-${mealTemplateEditor?.mode === 'edit' ? mealTemplateEditor.template.id : 'new'}`}");
    expect(health).toContain('androidPresentation={androidPresentation}');
    expect(picker).toContain('android-meal-template-picker-root');
    expect(picker).toContain('meal-template-picker-panel relative z-10');
    expect(supplement).toContain('<CaizenSelectionSheet open={unitSheetOpen}');
    expect(supplement).toContain('<CaizenSelectionSheet open={intakeSheetOpen}');
    expect(supplements).toContain('data-view={viewMode}');
  });

  it('keeps nested streak dates above the parent close guard and routine close cancellable', () => {
    const streak = read('components/modals/StreakTimelineModal.tsx');
    const workout = read('components/health/WorkoutWorkspace.tsx');

    expect(streak).toContain("target.closest('.caizen-sheet-root')");
    expect(streak).toContain('useOverlayLifecycle(isOpen && isAndroid(), requestClose');
    expect(streak).not.toContain('tone="warning"');
    expect(workout).toContain("useState<'idle' | 'confirming'>('idle')");
    expect(workout).toContain('onBeforeClose={allowShellClose}');
    expect(workout).toContain('<ConfirmDialog isOpen={closeState === \'confirming\'}');
  });

  it('uses native filter sheets and adaptive recurring dates without changing web controls', () => {
    const balance = read('components/sections/BalanceSection.tsx');
    const skincare = read('components/sections/SkincareSection.tsx');
    const recurring = read('components/balance/RecurringTransactionModal.tsx');

    expect(balance).toContain('title="Filter transactions"');
    expect(balance).toContain('{!androidPresentation ? <Popover');
    expect(skincare).toContain('title="Skincare filters"');
    expect(skincare).toContain('androidPresentation ? <Button');
    expect(recurring).toContain('<AdaptiveDatePicker label="Start date"');
    expect(recurring).toContain('<AdaptiveDatePicker label="End date (optional)"');
  });

  it('uses Android-only centered settings, restrained navigation, and UI-only player hiding', () => {
    const styles = read('app/globals.css');
    const settings = read('components/entertainment/EntertainmentSettings.tsx');
    const player = read('lib/music-player.tsx');

    expect(styles).toContain("html[data-capacitor='true'] .entertainment-settings-root");
    expect(styles).toContain("html[data-capacitor='true'] :is(.caizen-mobile-tab-active");
    expect(styles).toContain('width: 1.5rem;');
    expect(settings).toContain('onClick={requestClose}');
    expect(player).toContain('distance >= 56 || velocity >= 0.45');
    expect(player).toContain('if (drag.dragging) miniPlayerSuppressClickRef.current = true;');
    expect(player).toContain('setHidden(true)');
  });
});
