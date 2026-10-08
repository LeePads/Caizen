import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('Settings/Profile remediation contracts', () => {
  it('reveals hash-selected sections on mobile and responds to history navigation', () => {
    const settings = source('components/settings/SettingsHub.tsx');
    expect(settings).toContain("window.matchMedia('(max-width: 767px)').matches");
    expect(settings).toContain("window.addEventListener('popstate', restoreHashSection)");
    expect(settings).toContain('setMobileSettingsDetail(true)');
  });

  it('keeps Appearance labels associated and instance IDs unique', () => {
    const settings = source('components/settings/AppearanceSettings.tsx');
    expect(settings).toContain('const appearanceId = useId()');
    expect(settings).toContain('aria-labelledby={accentLabelId}');
    expect(settings).toContain('htmlFor={backgroundPhotoId}');
    expect(settings).toContain('id={backgroundPhotoId}');
  });

  it('uses one canonical Health date-range operation for count and mutation', () => {
    const settings = source('components/settings/SettingsHub.tsx');
    const healthDeletion = source('lib/health/date-range-deletion.ts');
    expect(settings).toContain('countHealthDataInDateRange(health, healthDateRange)');
    expect(settings).toContain('deleteHealthDataInDateRange(');
    expect(healthDeletion).toContain("'sleepEntries'");
    expect(healthDeletion).toContain("'foodLogExcludedDates'");
    expect(healthDeletion).toContain("'noXTrackers'");
  });

  it('does not use the legacy snapshot key for the web storage status', () => {
    const page = source('app/app/page.tsx');
    expect(page).toContain('getStorageEstimateLabel');
    expect(page).not.toContain('const settingsLocalData');
    expect(page).not.toContain('const settingsStorageUsed = settingsLocalData');
  });

  it('keeps Android preference failures recoverable and announced', () => {
    const android = source('components/native/AndroidSettingsHub.tsx');
    const notificationHook = source('lib/native/notification-settings.ts');
    expect(android).toContain('role="alert"');
    expect(android).toContain('Try again');
    expect(android).toContain('showNativeFailure');
    expect(notificationHook).toContain('await saveNotificationSettings(next)');
    expect(notificationHook).toContain('setSettings(previous)');
  });

  it('removes the confirmed Settings encoding artifacts and clarifies Cloud entry actions', () => {
    const settings = source('components/settings/SettingsHub.tsx') + source('components/settings/SettingsDataPanel.tsx');
    expect(settings).not.toContain('Â·');
    expect(settings).toContain('Manage Cloud Backup');
    expect(settings).not.toContain('Open Cloud Backup to back up');
    expect(settings).not.toContain('Open Cloud Backup to restore');
    expect(settings).not.toContain("lastBackup ? 'Cloud connected'");
  });

  it('groups Settings content and preserves the safety/accessibility contracts', () => {
    const settings = source('components/settings/SettingsHub.tsx') + source('components/settings/AppearanceSettings.tsx') + source('components/settings/SettingsDataPanel.tsx');
    expect(settings).toContain('Background and surfaces');
    expect(settings).toContain('Navigation and layout indicators');
    expect(settings).toContain('settings-advanced');
    expect(settings).toContain('Local transfer');
    expect(settings).toContain('Cloud Backup and storage');
    expect(settings).toContain('Danger Zone');
    expect(settings).toContain('Clear all local data');
    expect(settings).toContain('cannot be undone locally.');
    expect(settings).toContain('flex h-11 w-11 shrink-0 items-center justify-center');
    expect(settings).toContain('aria-label="Close settings"');
    expect(settings).toContain('aria-live="polite"');
    expect(settings).toContain('setCustomHue(hexToHue(savedAccent))');
  });

  it('keeps the web detail pane compact and groups secondary layout controls', () => {
    const settings = source('components/settings/SettingsHub.tsx') + source('components/settings/AppearanceSettings.tsx');
    const styles = source('app/globals.css');

    expect(settings).toContain('settings-appearance-panel');
    expect(settings).toContain('settings-disclosure');
    expect(settings).toContain('settings-page-body');
    expect(settings).not.toContain('Profile & General');
    expect(settings).not.toContain('Ultra Compact Mobile');
    expect(styles).toContain('.settings-page-body');
    expect(styles).toContain('.settings-disclosure');
    expect(styles).toContain('border-bottom: 1px solid color-mix(in oklch, var(--border) 42%, transparent);');
  });
});
