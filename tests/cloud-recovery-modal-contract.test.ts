import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Cloud recovery decision surface contract', () => {
  it('keeps review and final restore as separate explicit actions', () => {
    const modal = readFileSync('components/modals/CloudRecoveryModal.tsx', 'utf8');
    expect(modal).toContain('Review backup');
    expect(modal).toContain('Replace Cloud backup?');
    expect(modal).toContain('Keep this device’s version');
    expect(modal).toContain("Replace Cloud backup");
    expect(modal).toContain('Replace profile on this device');
    expect(modal).toContain('cloudRestoreAction(review)');
    expect(modal).toContain('reviewCloudRecoveryCandidate');
    expect(modal).toContain('restoreReviewedCloudProfile');
    expect(modal).toContain('retryReviewedCloudMedia');
    expect(modal).toContain('<CaizenFormDialog');
    expect(modal).toContain('closeDisabled={busy}');
    expect(modal).toContain('discovery.localProfileCount === 0');
    expect(modal).toContain("!fresh ? <Button");
    expect(modal).toContain("review.restoreType === 'replace-matching-profile' ? setConfirm(true) : void runRestore()");
    expect(modal).toContain('onRestored()');
    expect(modal).not.toContain('onClick={onClose}');
  });

  it('does not expose the full profile name before review', () => {
    const modal = readFileSync('components/modals/CloudRecoveryModal.tsx', 'utf8');
    const choices = modal.slice(modal.indexOf('{!mustReload ? review ?'), modal.indexOf('<ConfirmDialog isOpen={confirm}'));
    expect(choices.length).toBeGreaterThan(0);
    expect(choices).toContain('profileId.slice(-8)');
    expect(choices).not.toContain('profileName');
    expect(modal).toContain('<CloudBackupReview review={review} />');
  });
});
