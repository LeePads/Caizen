import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('Cloud Backup UX polish contracts', () => {
  it('coordinates operation progress and disables conflicting actions', () => {
    const modal = read('components/modals/CloudSyncModal.tsx');
    expect(modal).toContain('useSyncExternalStore(subscribeCloudOperation, getCloudOperation, getServerCloudOperation)');
    expect(modal).toContain('const busy = Boolean(operation || sharedOperation || refreshing || googleBusy)');
    expect(modal).toContain('setOperation(label); setFeedback(null); setRetry(null)');
    expect(modal).toContain('finally { admitted.current = false; if (alive.current) setOperation(null); }');
    expect(modal).toContain('aria-live="polite" aria-atomic="true" role="status"');
    expect(modal).toContain('disabled={busy} onClick={() => void refresh()}>Refresh Cloud Backup');
  });
  it('uses explicit review and replacement decisions', () => {
    const recovery = read('components/modals/CloudRecoveryModal.tsx');
    const review = read('components/common/CloudBackupReview.tsx');
    const page = read('app/app/page.tsx');
    expect(recovery).toContain('Review backup');
    expect(page).toContain('Review backup');
    expect(recovery).toContain('cloudRestoreAction(review)');
    expect(review).toContain('Replace profile on this device');
    expect(review).toContain('Restore profile');
    expect(recovery).toContain('Keep this device’s version');
    expect(recovery).toContain('Replace Cloud backup?');
  });
  it('explains deferral and shows paused attention only for enabled Automatic Backup', () => {
    const modal = read('components/modals/CloudSyncModal.tsx');
    const recovery = read('components/modals/CloudRecoveryModal.tsx');
    expect(recovery).toContain('Not now leaves this backup available in Cloud Backup.');
    expect(recovery).toContain('Keeping this device’s version leaves Cloud unchanged.');
    expect(modal).toContain('const automaticPaused = automatic?.enabled &&');
    expect(modal).toContain("automatic?.enabled ? automaticPaused ? 'On · Paused' : 'On' : 'Off'");
  });
  it('distinguishes complete and partial results with retryable file diagnostics', () => {
    const modal = read('components/modals/CloudSyncModal.tsx');
    expect(modal).toContain("result.status === 'partial' ? 'warning' : 'success'");
    expect(modal).toContain('Some files could not be backed up.');
    expect(modal).toContain('Backup complete.');
    expect(modal).toContain("if (result.status === 'partial') setRetry({ kind: 'backup', userId, profileId })");
    expect(modal).toContain('diagnostics(result.failedMedia)');
  });
});
