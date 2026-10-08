import type { CloudBackupOverview, CloudProfileBackupSummary, CloudSyncMarker } from './cloud-backup';
import { classifyCloudRecovery } from './cloud-recovery';

export function formatCloudDate(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not available';
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function cloudBackupLabel(backup: CloudProfileBackupSummary, ordered: CloudProfileBackupSummary[]) {
  if (backup.profileNameSource !== 'unknown') return backup.profileName;
  const date = formatCloudDate(backup.updatedAt);
  const sameDate = ordered.filter(item => item.profileNameSource === 'unknown' && formatCloudDate(item.updatedAt) === date);
  return `${sameDate.length > 1 ? `Backup ${sameDate.findIndex(item => item.id === backup.id) + 1}` : 'Backup'} · ${date}`;
}

export function cloudProgressMessage(event: import('./cloud-backup').CloudTransferProgress) {
  if (event.operation === 'backup') {
    if (event.phase === 'preparing') return 'Preparing backup…';
    if (event.phase === 'snapshot') return 'Finishing backup…';
    if (event.phase === 'media') {
      const checking = /check|inspect/i.test(event.message);
      return `${checking ? 'Checking files' : 'Backing up files'}${event.total > 0 ? ` · file ${event.completed} of ${event.total}` : '…'}`;
    }
  }
  return event.message.replace(/snapshot/gi, 'backup');
}

export function cloudBackupStatus(overview: CloudBackupOverview, pendingFiles: number | null, marker: CloudSyncMarker | null) {
  const backup = overview.matchingBackup;
  const classification = classifyCloudRecovery({
    backup: backup ? { ...backup, createdAt: backup.updatedAt } : null,
    localProfileExists: Boolean(overview.currentProfile),
    isCurrentProfile: true,
    isPristine: false,
    localUpdatedAt: overview.currentProfile?.localModifiedAt ?? null,
    marker,
  });
  switch (classification) {
    case 'no-backup': return { title: 'No Cloud backup yet', detail: 'Create your first backup for this profile.', needsReview: false, primaryAction: 'backup' as const };
    case 'matching-local-newer': return { title: 'Device changes not backed up', detail: 'Back up now to save this profile’s latest changes to Cloud.', needsReview: false, primaryAction: 'backup' as const };
    case 'matching-cloud-newer': return { title: 'Cloud backup changed', detail: 'Review the backup before choosing which version to keep.', needsReview: true, primaryAction: 'review' as const };
    case 'both-changed': return { title: 'Device and Cloud versions changed', detail: 'Review both saved versions before choosing one. Changes are not merged.', needsReview: true, primaryAction: 'review' as const };
    case 'matching-equal':
      if (!marker || pendingFiles === null) return { title: 'Backup status unconfirmed', detail: !marker ? 'Caizen could not confirm whether the saved versions match. Review the backup before replacing either version.' : 'Caizen could not confirm whether all files are backed up. Review the backup before continuing.', needsReview: true, primaryAction: 'review' as const };
      return pendingFiles === 0
        ? { title: 'Backed up', detail: 'No saved changes are waiting to be backed up.', needsReview: false, primaryAction: 'none' as const }
        : { title: 'Files not backed up', detail: `${pendingFiles} file${pendingFiles === 1 ? ' still needs' : 's still need'} backup. Choose Back up now to retry.`, needsReview: false, primaryAction: 'backup' as const };
    default: return { title: 'Backup status unconfirmed', detail: 'Review this backup before choosing which saved version to keep.', needsReview: true, primaryAction: 'review' as const };
  }
}

export function cloudAuthenticationNeedsRecovery(error: unknown) {
  const detail = error instanceof Error ? error.message.toLowerCase() : '';
  return /sign in|expired|jwt|invalid refresh|refresh token/.test(detail);
}

export function cloudFailureMessage(error: unknown, action: string) {
  const detail = error instanceof Error ? error.message.toLowerCase() : '';
  if (detail.includes('changed')) return 'The account, profile, or backup changed. Refresh Cloud Backup and review the backup again.';
  if (detail.includes('baseline')) return 'The saved versions could not be compared. Refresh Cloud Backup and review the backup again.';
  if (detail.includes('newer caizen') || detail.includes('newer version') || detail.includes('schema')) return 'Update Caizen before reviewing this backup.';
  if (cloudAuthenticationNeedsRecovery(error)) return 'Sign in again to continue using Cloud Backup.';
  if (detail.includes('busy')) return 'Cloud Backup is busy. Try again when the current operation finishes.';
  if (detail.includes('size limit') || detail.includes('larger than')) return 'This backup exceeds the supported size. Your local workspace remains available.';
  const task = /review/i.test(action) ? 'Backup review' : /files/i.test(action) ? 'File restore' : /restor/i.test(action) ? 'Profile restore' : /delet/i.test(action) ? 'Cloud backup deletion' : /backup/i.test(action) ? 'Backup' : action.replace(/…$/, '');
  return `${task} could not finish. Check your connection and try again.`;
}
