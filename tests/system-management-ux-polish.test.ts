import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('system-management UX polish contracts', () => {
  it('opens Cloud Backup directly from Command/Search', () => {
    const page = read('app/app/page.tsx');
    const action = page.match(/id: 'open-backup',[\s\S]*?action: \(\) => \{([\s\S]*?)\n      \},/);

    expect(action?.[1]).toContain('setShowCloudSyncModal(true)');
    expect(action?.[1]).not.toContain('setShowSettingsHub(true)');
  });

  it('uses authenticated Cloud summary vocabulary without treating a timestamp as auth', () => {
    const page = read('app/app/page.tsx');
    const profileSwitcher = read('components/layout/ProfileSwitcher.tsx');
    const settings = read('components/settings/SettingsHub.tsx');
    const android = read('components/native/AndroidSettingsHub.tsx');

    for (const status of ['Unavailable', 'Signed out', 'Signed in / not backed up', 'Backed up with date:', 'Needs attention']) {
      expect(page).toContain(status);
    }
    expect(page).toContain('cloudSignedIn');
    expect(page).toContain('cloudStatus={cloudStatusSummary}');
    expect(page).not.toContain("getLastSuccessfulBackupTimestamp(currentProfile.id) ? 'Cloud connected'");
    expect(profileSwitcher).not.toContain('Cloud connected');
    expect(settings).not.toContain('Last backup available');
    expect(android).not.toContain('Last backup: Never');
  });

  it('labels direct hard deletes as bypassing Trash', () => {
    const settings = read('components/settings/SettingsHub.tsx');
    const profileSwitcher = read('components/layout/ProfileSwitcher.tsx');
    const balance = read('components/sections/BalanceSection.tsx');

    expect(settings).toContain('This bypasses Recently Deleted');
    expect(settings).toContain("actionLabel: 'Clear Journal data'");
    expect(profileSwitcher).toContain('This bypasses Recently Deleted');
    expect(profileSwitcher).toContain('Cloud Backup snapshot is not automatically deleted');
    expect(balance).toContain('Transactions bypass Recently Deleted');
    expect(balance).toContain('confirmText="Clear transaction history"');
  });

  it('gives Trash and Profile modal panels dialog semantics and labeled controls', () => {
    const trash = read('components/modals/GlobalTrashModal.tsx');
    const profile = read('components/modals/ProfileModal.tsx');

    for (const source of [trash, profile]) {
      expect(source).toContain('role="dialog"');
      expect(source).toContain('aria-modal="true"');
      expect(source).toContain('aria-labelledby=');
    }
    expect(trash).toContain('aria-label="Search deleted records"');
    expect(trash).toContain('aria-label="Filter deleted records by section"');
    expect(trash).toContain('aria-label="Sort deleted records"');
  });

  it('makes Global Trash scope explicit for the current profile', () => {
    const trash = read('components/modals/GlobalTrashModal.tsx');

    expect(trash).toContain('Recently deleted in {profileName}');
    expect(trash).toContain('Permanently delete all');
    expect(trash).not.toContain('on this device</p>');
  });

  it('hides import destinations and Import when the report is blocked', () => {
    const preview = read('components/storage/ImportPreviewScreen.tsx');

    expect(preview).toContain('{!completedMessage && report.canImport ? <fieldset');
    expect(preview).toContain('{!completedMessage && report.canImport ? <button');
    expect(preview).toContain('Nothing on this device');
    expect(preview).toContain('onCancel');
  });

  it('discloses incomplete .caizen media before confirmation and gates Replace', () => {
    const preview = read('components/storage/ImportPreviewScreen.tsx');
    const backupModal = read('components/modals/BackupManagerModal.tsx');

    expect(preview).toContain('This is not a complete backup');
    expect(preview).toContain('missing managed media');
    expect(preview).toContain('needsIncompleteBackupConfirmation');
    expect(preview).toContain('incompleteBackupConfirmed');
    expect(backupModal).toContain('missingMedia={selected.kind === \'complete\' ? selected.preview.missingMedia : undefined}');
    expect(backupModal).toContain("? 'Incomplete archive'");
  });

  it('distinguishes structured recovery from managed-media compensation failures', () => {
    const backup = read('lib/storage/backup-repository.ts');

    expect(backup).toContain('structured-data restore did not complete cleanly');
    expect(backup).toContain('staged managed media');
    expect(backup).toContain('local recovery copy covers structured data only');
  });

  it('guards every non-collection Trash restore destination against duplicate IDs', () => {
    const context = read('lib/context.tsx');

    expect(context).toContain('const hasDestinationIdCollision');
    const restoreStart = context.indexOf('const restoreToSource');
    for (const source of ['productivityItems', 'importantDates', 'dailyChecklistItems', 'workItems']) {
      const sourceStart = context.indexOf(`source === "${source}"`, restoreStart);
      expect(sourceStart).toBeGreaterThan(-1);
      const sourceBlock = context.slice(sourceStart, sourceStart + 600);
      expect(sourceBlock).toContain('hasDestinationIdCollision');
    }
    expect(context).toContain('hasDestinationIdCollision(normalized, (profile as any).personalVaultItems || [])');
    expect(context.slice(restoreStart)).toContain('hasDestinationIdCollision');
  });

  it('clears Work links when Settings removes Work data', () => {
    const settings = read('components/settings/SettingsHub.tsx');

    expect(settings).toContain("{ id: 'workItems', label: 'Work', actionLabel: 'Clear Work data' }");
    expect(settings).toContain('clearWorkLinksFromRoutines');
    expect(settings).toContain('clearWorkLinksFromTasks');
  });
});
