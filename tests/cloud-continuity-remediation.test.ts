import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Cloud continuity remediation contracts', () => {
  it('uses a passive, deliberate notice for ordinary newer snapshots', () => {
    const page = read('app/app/page.tsx');

    expect(page).toContain('Cloud backup changed');
    expect(page).toContain('Another profile backup is available');
    expect(page).toContain('data-testid="cloud-continuity-notice"');
    expect(page).toContain('Review backup');
    expect(page).not.toContain('Review Cloud Backup');
    expect(page).toContain('recordCloudRecoveryCandidateDecision');
    expect(page).toContain('cloudRecoveryNoticeKeysRef.current.clear()');
    expect(page).not.toContain('recovery: { discovery, candidate }');
  });

  it('keeps bounded checks on resume and out of media hydration', () => {
    const page = read('app/app/page.tsx');
    const start = page.indexOf('const runCloudReconciliation = useCallback');
    const end = page.indexOf('const scheduleCloudReconciliation = useCallback', start);
    const coordinator = page.slice(start, end);

    expect(page).toContain("window.addEventListener('caizen:app-state', onNativeState)");
    expect(page).toContain("document.addEventListener('visibilitychange', onVisibility)");
    expect(page).toContain("window.addEventListener('pageshow', onResume)");
    expect(coordinator).toContain('discoverCloudRecovery');
    expect(coordinator).not.toContain('downloadCaizenPrivateMedia');
    expect(coordinator).not.toContain('restoreCloudMediaToLocal');
    expect(coordinator).not.toContain('restoreCloudDataToLocal');
  });

  it('does not offer Keep this device for a fresh device with no local profiles', () => {
    const modal = read('components/modals/CloudRecoveryModal.tsx');
    const page = read('app/app/page.tsx');

    expect(modal).toContain('discovery.localProfileCount === 0');
    expect(modal).toContain("!fresh ? <Button");
    expect(modal).toContain("selected.classification === 'pristine-device-backup'");
    expect(modal).toContain('Keep this device’s version');
    expect(page).toContain('isFreshDevice && cloudOnlyCandidateCount === 1');
  });

  it('passes the reviewed account and snapshot identity through every restore entry point', () => {
    const modal = read('components/modals/CloudSyncModal.tsx');
    const page = read('app/app/page.tsx');
    const service = read('lib/cloud-recovery.ts');

    expect(modal).toContain('expectedBackupId: backup.id');
    expect(modal).toContain('expectedUpdatedAt: backup.updatedAt');
    expect(modal).toContain('expectedUserId: backup.userId');
    expect(service).toContain('expectedBackupId: review.backupId');
    expect(service).toContain('expectedUpdatedAt: review.expectedUpdatedAt');
    expect(service).toContain('expectedUserId: review.userId');
    expect(service).toContain('expectedLocalModifiedAt: review.expectedLocalModifiedAt');
    expect(service).toContain('expectedFingerprint: review.expectedFingerprint');
    expect(page).toContain('<CloudRecoveryModal');
    expect(modal).toContain('restoreReviewedCloudProfile');
  });
});
