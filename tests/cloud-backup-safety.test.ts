import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bucketMigration = readFileSync(
  new URL('../supabase/migrations/202608110001_caizen_private_bucket.sql', import.meta.url),
  'utf8',
);
const cloudBackupModal = readFileSync(
  new URL('../components/modals/CloudSyncModal.tsx', import.meta.url),
  'utf8',
);
const cloudBackup = readFileSync(
  new URL('../lib/cloud-backup.ts', import.meta.url),
  'utf8',
);
const appPage = readFileSync(
  new URL('../app/app/page.tsx', import.meta.url),
  'utf8',
);

describe('Cloud Backup deployment safety', () => {
  it('provisions the private bucket with the same media boundary as the app', () => {
    expect(bucketMigration).toContain("'caizen-private'");
    expect(bucketMigration).toContain('public');
    expect(bucketMigration).toContain('26214400');
    expect(bucketMigration).toContain("'application/pdf'");
    expect(bucketMigration).toContain('on conflict (id) do update');
  });

  it('keeps partial media operations visibly incomplete and retryable', () => {
    expect(cloudBackupModal).toContain('Profile backed up');
    expect(cloudBackupModal).toContain('Some files could not be backed up.');
    expect(cloudBackupModal).toContain('Retry files');
    expect(cloudBackupModal).toContain('diagnostics');
    expect(cloudBackupModal).not.toContain('Retry incomplete media');
    expect(cloudBackupModal).toContain("setRetry({ kind: 'backup', userId, profileId })");
    expect(cloudBackupModal).toContain("kind: 'files'");
    expect(cloudBackupModal).toContain('expectedBackupId: backup.id');
    expect(cloudBackupModal).toContain('expectedUpdatedAt: backup.updatedAt');
    expect(cloudBackupModal).toContain('expectedUserId: backup.userId');
  });

  it('does not pause automatic backup for a media-only partial upload', () => {
    expect(cloudBackup).not.toContain('paused after a partial media transfer');
    expect(appPage).not.toContain('Cloud backup completed, but some media needs manual attention.');
    expect(appPage).toContain('getPendingCloudMediaCount');
    expect(appPage).toContain('retryMedia: true');
    expect(appPage).toContain("/^media:/.test(autoState.pausedReason ?? '')");
  });
});
