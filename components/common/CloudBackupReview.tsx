'use client';

import type { CloudRecoveryReview } from '@/lib/cloud-recovery';
import { formatCloudDate } from '@/lib/cloud-backup-ui';

export function cloudRestoreScope(review: CloudRecoveryReview) {
  if (review.restoreType === 'replace-matching-profile') return `Replace “${review.localProfileName || review.profileName}” on this device with the Cloud backup of “${review.profileName}”. Changes are not merged. Other profiles on this device stay unchanged.`;
  if (review.restoreType === 'replace-pristine-placeholder') return `Replace the empty profile on this device with “${review.profileName}” from Cloud Backup.`;
  return `Add “${review.profileName}” to this device and switch to it. Other profiles on this device stay unchanged.`;
}
export function cloudRestoreAction(review: CloudRecoveryReview) {
  return review.restoreType === 'replace-matching-profile' ? 'Replace profile on this device' : 'Restore profile';
}
export function cloudReplaceBackupScope(review: CloudRecoveryReview, email?: string) {
  return `Replace the Cloud backup of “${review.profileName}”${email ? ` in ${email}` : ''} with this device’s saved profile and files included in Cloud Backup. The previous Cloud version will be overwritten.`;
}
const recordLabels: Record<string, string> = {
  wallets: 'Wallets', transactions: 'Transactions', inventoryItems: 'Inventory items', wishlistItems: 'Wishlist items',
  upcomingMoneyItems: 'Upcoming money entries', journalEntries: 'Journal entries', games: 'Games', gameGuides: 'Game guides',
  productivityItems: 'Productivity items', mediaItems: 'Entertainment', books: 'Books', musicItems: 'Music', workItems: 'Work entries',
  personalVaultItems: 'Vault entries', trashItems: 'Trash items', skincareProducts: 'Skincare products',
  skincareUsageEvents: 'Skincare usage', dailyChecklistItems: 'Daily checklist items', importantDates: 'Important dates',
  supplements: 'Supplements', balanceCheckIns: 'Balance check-ins', balanceProjectionRows: 'Balance projections',
  careerSkills: 'Career skills', careerCourses: 'Career courses', careerCredentials: 'Career credentials', budgets: 'Budgets',
  weightEntries: 'Weight entries', waterEntries: 'Water entries', bodyMeasurementEntries: 'Body measurements',
  nutritionEntries: 'Nutrition entries', foodEntries: 'Food entries', foodTemplates: 'Food templates', mealTemplates: 'Meal templates',
  activityEntries: 'Activity entries', fastingSessions: 'Fasting sessions', workoutEntries: 'Workout entries',
  workoutExercises: 'Exercises', workoutRoutines: 'Workout routines', workoutSessions: 'Workout sessions',
  sleepEntries: 'Sleep entries', noXTrackers: 'No-X trackers', achievementUnlocks: 'Achievements',
  milestoneUnlocks: 'Milestones', masteryMilestones: 'Mastery milestones', 'pet.recentRewards': 'Recent pet rewards',
  categoryXpEvents: 'Category XP activity', masteryBondXpEvents: 'Companion Bond XP activity', masteryBondClaims: 'Companion Bond rewards',
};
const recordLabel = (key: string) => {
  const name = key.replace(/^health\./, '');
  return recordLabels[name] ?? name.replace(/[._]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
};

export default function CloudBackupReview({ review }: { review: CloudRecoveryReview }) {
  const count = Object.values(review.recordCounts).reduce((total, value) => total + value, 0);
  const local = review.localSummary;
  const localCount = local?.recordCounts ? Object.values(local.recordCounts).reduce((total, value) => total + value, 0) : null;
  const matching = review.restoreType === 'replace-matching-profile';
  const categories = [...new Set([...Object.keys(review.recordCounts), ...Object.keys(local?.recordCounts ?? {})])]
    .filter(key => review.recordCounts[key] > 0 || (local?.recordCounts?.[key] ?? 0) > 0);
  const files = (media: CloudRecoveryReview['media'] | null | undefined) => media
    ? `${media.count.toLocaleString()} · ${(media.bytes / 1024 / 1024).toFixed(1)} MB` : 'Not available';
  return <section className="cloud-review flex min-w-0 flex-col gap-5" aria-label="Reviewed backup">
    {!matching ? <h3 className="text-section-title break-words">{review.profileName}</h3> : null}
    {matching ? <div className="cloud-comparison-scroll" tabIndex={0} role="region" aria-label="This device and Cloud backup comparison">
      <table className="cloud-comparison">
        <caption className="text-body-sm mb-3 text-left">Counts show totals, not which entries changed.</caption>
        <thead><tr><td /><th scope="col">This device</th><th scope="col">Cloud backup</th></tr></thead>
        <tbody>
          <tr><th scope="row">Profile</th><td>{review.localProfileName || review.profileName}</td><td>{review.profileName}</td></tr>
          <tr><th scope="row">Last saved</th><td>{formatCloudDate(review.expectedLocalModifiedAt)}</td><td>{formatCloudDate(review.expectedUpdatedAt)}</td></tr>
          <tr><th scope="row">Records</th><td>{localCount === null ? 'Not available' : localCount.toLocaleString()}</td><td>{count.toLocaleString()}</td></tr>
          <tr><th scope="row">Photos and attachments</th><td>{files(local?.media)}</td><td>{files(review.media)}</td></tr>
        </tbody>
      </table>
    </div> : <dl className="cloud-detail-list">
      <div><dt>Cloud backup</dt><dd>{formatCloudDate(review.expectedUpdatedAt)}</dd></div>
      {review.expectedLocalModifiedAt ? <div><dt>This device saved</dt><dd>{formatCloudDate(review.expectedLocalModifiedAt)}</dd></div> : null}
      <div><dt>Records</dt><dd>{count.toLocaleString()}</dd></div>
      <div><dt>Photos and attachments</dt><dd>{review.media.count.toLocaleString()} · {(review.media.bytes / 1024 / 1024).toFixed(1)} MB</dd></div>
    </dl>}
    {categories.length ? <details><summary className="cloud-touch-target text-body-sm cursor-pointer font-semibold">Records by category</summary>
      {matching ? <div className="cloud-comparison-scroll mt-2" tabIndex={0} role="region" aria-label="Record counts by category"><table className="cloud-comparison"><caption className="sr-only">Record counts by category</caption><thead><tr><th scope="col">Category</th><th scope="col">This device</th><th scope="col">Cloud backup</th></tr></thead><tbody>{categories.map(key => <tr key={key}><th scope="row" className="capitalize">{recordLabel(key)}</th><td>{local?.recordCounts ? (local.recordCounts[key] ?? 0).toLocaleString() : 'Not available'}</td><td>{(review.recordCounts[key] ?? 0).toLocaleString()}</td></tr>)}</tbody></table></div>
        : <dl className="cloud-detail-list mt-2">{categories.map(key => <div key={key}><dt className="capitalize">{recordLabel(key)}</dt><dd>{review.recordCounts[key].toLocaleString()}</dd></div>)}</dl>}
    </details> : null}
    <div><h4 className="text-card-title">{matching ? 'If you replace this device’s profile' : 'If you restore this profile'}</h4><p className="text-body-sm mt-2">{cloudRestoreScope(review)}</p><p className="text-body-sm mt-2 text-muted-foreground">Files download when opened and need internet. The recovery copy on this device protects records, not all file contents. Create a complete backup first if you need a copy of your files.</p></div>
    {review.warnings.length ? <div className="cloud-notice" role="note"><p className="font-semibold">Files or records need attention</p><ul className="mt-2 space-y-2 text-body-sm">{review.warnings.map((warning, index) => <li key={index}>{warning.replace(/snapshot/gi, 'backup')}</li>)}</ul></div> : null}
    <details><summary className="cloud-touch-target cursor-pointer text-body-sm text-muted-foreground">Technical details</summary><p className="text-body-sm mt-2 break-all text-muted-foreground">Profile {review.profileId} · Format {review.schemaVersion} · {(review.structuredSizeBytes / 1024).toFixed(1)} KB</p></details>
  </section>;
}
