import {
  getCloudSyncMarker,
  getCloudUser,
  getLocalProfileModifiedAt,
  isCloudBootstrapPristine,
  rememberReviewedCloudSnapshot,
  restoreCloudDataToLocal,
  restoreCloudMediaToLocal,
  type CloudSyncMarker,
} from './cloud-backup';
import {
  getCaizenProfileBackup,
  listCaizenMediaAssets,
  listCaizenMediaAssetMetadata,
  listCaizenProfileBackupMetadata,
  type CaizenCloudMediaAssetMetadata,
  type CaizenCloudProfileBackupMetadata,
} from './caizen-cloud-repository';
import { CAIZEN_BACKUP_SCHEMA_VERSION } from './storage/backup-schema';
import {
  MAX_DATA_ONLY_JSON_BYTES,
} from './storage/backup-repository';
import { prepareImport, type PreparedImport } from './storage/import-integrity';
import { loadAppState, type StoredAppState } from './storage/app-repository';
import { listMediaAssets } from './storage/media-repository';
import { collectMediaReferenceIds } from './storage/media-references';
import type { CaizenRestoreResult } from './types';
import {
  getCloudRecoveryFingerprint,
  recordCloudRecoveryDecision,
} from './cloud-recovery-state';

export type CloudRecoveryClassification =
  | 'no-backup'
  | 'pristine-device-backup'
  | 'matching-cloud-newer'
  | 'matching-local-newer'
  | 'matching-equal'
  | 'matching-no-baseline'
  | 'both-changed'
  | 'cloud-only-profile';

export type CloudRecoveryPrompt = 'modal' | 'notice' | 'none';

export type CloudRecoveryMediaSummary = {
  count: number;
  bytes: number;
};

export type CloudRecoveryCandidate = {
  backup: CaizenCloudProfileBackupMetadata | null;
  classification: CloudRecoveryClassification;
  prompt: CloudRecoveryPrompt;
  isCurrentProfile: boolean;
  localUpdatedAt: string | null;
  cloudUpdatedAt: string | null;
  media: CloudRecoveryMediaSummary;
};

export type CloudRecoveryDiscovery = {
  userId: string;
  discoveredAt: string;
  localProfileCount?: number;
  candidates: CloudRecoveryCandidate[];
  mediaByProfile: Record<string, CloudRecoveryMediaSummary>;
};

export type CloudRecoveryClassificationInput = {
  backup: CaizenCloudProfileBackupMetadata | null;
  localProfileExists: boolean;
  isCurrentProfile: boolean;
  isPristine: boolean;
  localUpdatedAt: string | null;
  marker: CloudSyncMarker | null;
};

const promptForClassification = (
  classification: CloudRecoveryClassification,
): CloudRecoveryPrompt => {
  if (
    classification === 'pristine-device-backup' ||
    classification === 'matching-no-baseline' ||
    classification === 'both-changed'
  ) return 'modal';
  if (
    classification === 'matching-cloud-newer' ||
    classification === 'cloud-only-profile'
  ) return 'notice';
  return 'none';
};

export const getCloudRecoveryPrompt = promptForClassification;

/**
 * Compares local operational markers with Cloud metadata. A classification is
 * never an authorization to restore or overwrite either side.
 */
export const classifyCloudRecovery = (
  input: CloudRecoveryClassificationInput,
): CloudRecoveryClassification => {
  if (!input.backup) return 'no-backup';
  if (input.isPristine) return 'pristine-device-backup';
  if (!input.localProfileExists) return 'cloud-only-profile';

  const cloudUpdatedAt = input.backup.updatedAt;
  if (!input.marker && input.localUpdatedAt && input.localUpdatedAt === cloudUpdatedAt) {
    return 'matching-equal';
  }
  if (!input.marker || !input.localUpdatedAt) return 'matching-no-baseline';

  const localChanged = input.localUpdatedAt !== input.marker.localUpdatedAt;
  const cloudChanged = cloudUpdatedAt !== input.marker.cloudUpdatedAt;
  if (localChanged && cloudChanged) return 'both-changed';
  if (cloudChanged) return 'matching-cloud-newer';
  if (localChanged) return 'matching-local-newer';
  return 'matching-equal';
};

const emptyMediaSummary = (): CloudRecoveryMediaSummary => ({ count: 0, bytes: 0 });

const summarizeMedia = (
  media: CaizenCloudMediaAssetMetadata[],
): Record<string, CloudRecoveryMediaSummary> => {
  const result: Record<string, CloudRecoveryMediaSummary> = {};
  for (const asset of media) {
    if (!asset.profileId || !Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes < 0) {
      continue;
    }
    const summary = result[asset.profileId] ?? emptyMediaSummary();
    summary.count += 1;
    summary.bytes += asset.sizeBytes;
    result[asset.profileId] = summary;
  }
  return result;
};

const candidateFor = async (input: {
  backup: CaizenCloudProfileBackupMetadata | null;
  state: StoredAppState | null;
  profileId: string | null;
  userId: string;
  media: CloudRecoveryMediaSummary;
  pristine: boolean;
}): Promise<CloudRecoveryCandidate> => {
  const localProfileExists = Boolean(
    input.profileId && input.state?.profiles.some(profile => profile.id === input.profileId),
  );
  const localUpdatedAt = localProfileExists && input.profileId
    ? await getLocalProfileModifiedAt(input.profileId)
    : null;
  const marker = localProfileExists && input.profileId
    ? getCloudSyncMarker(input.userId, input.profileId)
    : null;
  const classification = classifyCloudRecovery({
    backup: input.backup,
    localProfileExists,
    isCurrentProfile: input.profileId === input.state?.currentProfileId,
    isPristine: input.pristine,
    localUpdatedAt,
    marker,
  });
  return {
    backup: input.backup,
    classification,
    prompt: promptForClassification(classification),
    isCurrentProfile: input.profileId === input.state?.currentProfileId,
    localUpdatedAt,
    cloudUpdatedAt: input.backup?.updatedAt ?? null,
    media: input.media,
  };
};

/**
 * Performs the safe background Cloud check. It selects backup identity and
 * aggregate media metadata only. Full snapshots and media bytes are reserved
 * for explicit Review/restore or manual Cloud Backup actions.
 */
export const discoverCloudRecovery = async (): Promise<CloudRecoveryDiscovery> => {
  const user = await getCloudUser();
  if (!user) throw new Error('Please sign in before checking Cloud Backup.');

  const state = await loadAppState();
  const [backups, media] = await Promise.all([
    listCaizenProfileBackupMetadata(),
    listCaizenMediaAssetMetadata(),
  ]);
  const mediaByProfile = summarizeMedia(media);
  const localProfileIds = new Set(state?.profiles.map(profile => profile.id) ?? []);
  const pristine = isCloudBootstrapPristine(state);
  const candidates: CloudRecoveryCandidate[] = [];

  const orderedBackups = [...backups].sort((first, second) =>
    new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime() ||
    first.profileId.localeCompare(second.profileId) ||
    first.id.localeCompare(second.id),
  );

  for (const backup of orderedBackups) {
    candidates.push(await candidateFor({
      backup,
      state,
      profileId: localProfileIds.has(backup.profileId) ? backup.profileId : null,
      userId: user.id,
      media: mediaByProfile[backup.profileId] ?? emptyMediaSummary(),
      pristine,
    }));
  }

  const currentProfileId = state?.currentProfileId ?? null;
  if (currentProfileId && !orderedBackups.some(backup => backup.profileId === currentProfileId)) {
    candidates.push(await candidateFor({
      backup: null,
      state,
      profileId: currentProfileId,
      userId: user.id,
      media: emptyMediaSummary(),
      pristine: false,
    }));
  }

  return {
    userId: user.id,
    discoveredAt: new Date().toISOString(),
    localProfileCount: state?.profiles.length ?? 0,
    candidates,
    mediaByProfile,
  };
};

export const getPrimaryCloudRecoveryCandidate = (
  discovery: CloudRecoveryDiscovery,
): CloudRecoveryCandidate | null =>
  discovery.candidates.find(candidate => candidate.prompt === 'modal') ?? null;

export type CloudRecoveryRestoreType =
  | 'replace-matching-profile'
  | 'replace-pristine-placeholder'
  | 'add-cloud-profile';

export type CloudRecoveryReview = {
  userId: string;
  backupId: string;
  profileId: string;
  expectedUpdatedAt: string;
  expectedLocalModifiedAt: string | null;
  expectedCurrentProfileId: string | null;
  expectedFingerprint: string;
  schemaVersion: number;
  profileName: string;
  localProfileName?: string | null;
  // Presentation-only summary captured within the existing review revision fence.
  localSummary?: {
    recordCounts: Record<string, number> | null;
    media: CloudRecoveryMediaSummary | null;
  } | null;
  structuredSizeBytes: number;
  recordCounts: Record<string, number>;
  media: CloudRecoveryMediaSummary;
  missingMediaCount: number;
  warnings: string[];
  restoreType: CloudRecoveryRestoreType;
  placeholderProfileId: string | null;
  reviewedAt: string;
};

export class CloudRecoveryLocalChangedError extends Error {
  readonly code = 'cloud-recovery-local-changed';

  constructor() {
    super('This device changed while the recovery offer was open. Review the Cloud profile again before restoring.');
    this.name = 'CloudRecoveryLocalChangedError';
  }
}

const serializedSize = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const isValidSchemaVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 100;

const profileNameFromPrepared = (prepared: PreparedImport): string => {
  const name = prepared.state.profiles[0]?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : 'Cloud profile';
};

const mediaReferencesFromPrepared = (prepared: PreparedImport): string[] => {
  const references: string[] = [];
  for (const item of prepared.media) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = (item as Record<string, unknown>).id;
    if (typeof id === 'string' && id.trim()) {
      references.push(id);
    }
  }
  return references;
};

const validateReviewedMedia = async (
  profileId: string,
  prepared: PreparedImport,
): Promise<{
  media: CloudRecoveryMediaSummary;
  missingMediaCount: number;
  warnings: string[];
}> => {
  const activeMedia = await listCaizenMediaAssets(profileId);
  const mediaById = new Map(activeMedia.map(asset => [asset.id, asset]));
  const snapshotMediaById = new Map(
    prepared.media
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map(item => {
        const record = item as Record<string, unknown>;
        return [
          typeof record.id === 'string' ? record.id : '',
          record,
        ] as const;
      })
      .filter(([id]) => Boolean(id)),
  );
  const references = mediaReferencesFromPrepared(prepared);
  const uniqueReferences = new Set(references);
  const warnings: string[] = [];

  if (references.length !== uniqueReferences.size) {
    warnings.push('The snapshot contains duplicate media references; duplicates will be restored once.');
  }

  let missingMediaCount = 0;
  let bytes = 0;
  let count = 0;
  for (const mediaId of uniqueReferences) {
    const snapshotItem = snapshotMediaById.get(mediaId);
    const snapshotSize = snapshotItem?.sizeBytes;
    const sizeBytes = Number.isSafeInteger(snapshotSize) && (snapshotSize as number) >= 0
      ? snapshotSize as number
      : mediaById.get(mediaId)?.sizeBytes;
    if (sizeBytes == null) {
      missingMediaCount += 1;
      continue;
    }
    count += 1;
    bytes += sizeBytes;
  }
  if (missingMediaCount > 0) {
    warnings.push(
      `${missingMediaCount} referenced media file${missingMediaCount === 1 ? '' : 's'} is unavailable in Cloud and may need attention after restore.`,
    );
  }
  return { media: { count, bytes }, missingMediaCount, warnings };
};

/**
 * Downloads and validates one full snapshot for explicit Review only. This
 * function prepares a clone in memory and intentionally performs no IndexedDB
 * or media-storage writes.
 */
export const reviewCloudRecoveryCandidate = async (
  candidate: CloudRecoveryCandidate,
): Promise<CloudRecoveryReview> => {
  const metadata = candidate.backup;
  if (!metadata) throw new Error('The selected Cloud profile is unavailable.');

  const user = await getCloudUser();
  if (!user || user.id !== metadata.userId) {
    throw new Error('The selected Cloud profile does not belong to the signed-in account.');
  }
  const backup = await getCaizenProfileBackup(metadata.profileId);
  if (!backup?.data) throw new Error('The selected Cloud profile is no longer available.');
  if (backup.userId !== user.id || backup.profileId !== metadata.profileId) {
    throw new Error('The selected Cloud profile does not match the reviewed account or profile.');
  }
  if (backup.id !== metadata.id || backup.updatedAt !== metadata.updatedAt) {
    throw new Error('This Cloud backup changed after discovery. Review it again.');
  }
  if (!isValidSchemaVersion(backup.schemaVersion)) {
    throw new Error('This Cloud backup has an unsupported schema version.');
  }
  if (backup.schemaVersion > CAIZEN_BACKUP_SCHEMA_VERSION) {
    throw new Error('This Cloud backup was created by a newer Caizen version. Update Caizen before restoring it.');
  }

  const structuredSizeBytes = serializedSize(backup.data);
  if (structuredSizeBytes > MAX_DATA_ONLY_JSON_BYTES) {
    throw new Error('This Cloud backup is larger than Caizen can safely review on this device.');
  }

  const expectedLocalModifiedAt = await getLocalProfileModifiedAt(metadata.profileId);
  const current = await loadAppState();
  const existingProfileIds = current?.profiles.map(profile => profile.id) ?? [];
  let prepared: PreparedImport;
  try {
    prepared = prepareImport(backup.data, existingProfileIds);
  } catch (error) {
    throw new Error(
      `Cloud backup validation failed: ${error instanceof Error ? error.message : 'the snapshot shape is invalid.'}`,
    );
  }
  if (!prepared.report.canImport) {
    throw new Error(
      `Cloud backup validation failed: ${prepared.report.warnings[0] || 'the snapshot contains invalid records.'}`,
    );
  }
  if (prepared.state.profiles.length !== 1 || prepared.state.profiles[0]?.id !== metadata.profileId) {
    throw new Error('The Cloud snapshot does not match the selected profile.');
  }

  const currentProfile = current?.profiles.find(profile => profile.id === metadata.profileId);
  let localSummary: CloudRecoveryReview['localSummary'] = null;
  if (currentProfile) {
    let recordCounts: Record<string, number> | null = null;
    try {
      // Use the same count definitions as Cloud, without writing normalized data.
      recordCounts = prepareImport({ profiles: [currentProfile], currentProfileId: currentProfile.id }).report.recordCounts;
    } catch { /* An unavailable display summary must not change restore authorization. */ }
    const references = collectMediaReferenceIds(currentProfile);
    const assets = await listMediaAssets(currentProfile.id).catch(() => null);
    const referenced = assets?.filter(asset => references.has(asset.id));
    localSummary = {
      recordCounts,
      media: referenced ? { count: referenced.length, bytes: referenced.reduce((total, asset) => total + asset.sizeBytes, 0) } : null,
    };
  }
  const pristine = isCloudBootstrapPristine(current);
  const placeholderProfileId = pristine ? current?.profiles[0]?.id ?? null : null;
  const restoreType: CloudRecoveryRestoreType = currentProfile
    ? 'replace-matching-profile'
    : pristine
      ? 'replace-pristine-placeholder'
      : 'add-cloud-profile';
  const media = await validateReviewedMedia(metadata.profileId, prepared);
  const latest = await loadAppState();
  const latestRevision = await getLocalProfileModifiedAt(metadata.profileId);
  const latestUser = await getCloudUser();
  if (latest?.currentProfileId !== current?.currentProfileId || latestRevision !== expectedLocalModifiedAt) {
    throw new CloudRecoveryLocalChangedError();
  }
  if (latestUser?.id !== user.id) throw new Error('The Cloud account changed during Review. Review the backup again.');
  const expectedCurrentProfileId = current?.currentProfileId ?? null;
  const fingerprint = getCloudRecoveryFingerprint({
    backupId: backup.id,
    profileId: backup.profileId,
    schemaVersion: backup.schemaVersion,
    updatedAt: backup.updatedAt,
  });
  rememberReviewedCloudSnapshot(backup, prepared);

  return {
    userId: user.id,
    backupId: backup.id,
    profileId: backup.profileId,
    expectedUpdatedAt: backup.updatedAt,
    expectedLocalModifiedAt,
    expectedCurrentProfileId,
    expectedFingerprint: fingerprint,
    schemaVersion: backup.schemaVersion,
    profileName: profileNameFromPrepared(prepared),
    localProfileName: currentProfile?.name ?? null,
    localSummary,
    structuredSizeBytes,
    recordCounts: { ...prepared.report.recordCounts },
    media: media.media,
    missingMediaCount: media.missingMediaCount,
    warnings: [...prepared.report.warnings, ...media.warnings],
    restoreType,
    placeholderProfileId,
    reviewedAt: new Date().toISOString(),
  };
};

export const restoreReviewedCloudProfile = async (
  review: CloudRecoveryReview,
  options: { onProgress?: (progress: import('./cloud-backup').CloudTransferProgress) => void; beforeReplace?: () => Promise<void>; assertBeforeReplace?: () => void } = {},
): Promise<CaizenRestoreResult> => {
  const current = await loadAppState();
  let removeProfileIds: string[] = [];
  if (review.restoreType === 'replace-pristine-placeholder') {
    if (
      !current ||
      !isCloudBootstrapPristine(current) ||
      !review.placeholderProfileId ||
      current.profiles[0]?.id !== review.placeholderProfileId
    ) {
      throw new CloudRecoveryLocalChangedError();
    }
    removeProfileIds = [review.placeholderProfileId];
  }

  const assertPristineBeforeReplace = async () => {
    await options.beforeReplace?.();
    if (review.restoreType !== 'replace-pristine-placeholder') return;
    const latest = await loadAppState();
    if (
      !latest ||
      !isCloudBootstrapPristine(latest) ||
      latest.profiles[0]?.id !== review.placeholderProfileId
    ) {
      throw new CloudRecoveryLocalChangedError();
    }
  };

  return restoreCloudDataToLocal({
    profileId: review.profileId,
    expectedBackupId: review.backupId,
    expectedUpdatedAt: review.expectedUpdatedAt,
    expectedLocalModifiedAt: review.expectedLocalModifiedAt,
    expectedCurrentProfileId: review.expectedCurrentProfileId,
    expectedUserId: review.userId,
    expectedFingerprint: review.expectedFingerprint,
    removeProfileIds,
    beforeReplace: assertPristineBeforeReplace,
    assertBeforeReplace: options.assertBeforeReplace,
    // Keep the legacy hook populated for older recovery-surface callers while
    // the repository-level beforeReplace callback supplies the real fence.
    beforeCommit: assertPristineBeforeReplace,
    onProgress: options.onProgress,
  });
};

export const retryReviewedCloudMedia = async (
  review: CloudRecoveryReview,
  options: { onProgress?: (progress: import('./cloud-backup').CloudTransferProgress) => void } = {},
) => restoreCloudMediaToLocal(review.profileId, {
  expectedBackupId: review.backupId,
  expectedUpdatedAt: review.expectedUpdatedAt,
  expectedUserId: review.userId,
  expectedFingerprint: review.expectedFingerprint,
  onProgress: options.onProgress,
});

export const recordCloudRecoveryReview = async (
  review: CloudRecoveryReview,
  decision: 'reviewed' | 'kept-local' | 'dismissed' | 'restored',
) => recordCloudRecoveryDecision({
  accountId: review.userId,
  fingerprint: review.expectedFingerprint,
  profileId: review.profileId,
  decision,
});

export const recordCloudRecoveryCandidateDecision = async (
  accountId: string,
  backup: CaizenCloudProfileBackupMetadata,
  decision: 'kept-local' | 'dismissed',
) => recordCloudRecoveryDecision({
  accountId,
  fingerprint: getCloudRecoveryFingerprint({
    backupId: backup.id,
    profileId: backup.profileId,
    schemaVersion: backup.schemaVersion,
    updatedAt: backup.updatedAt,
  }),
  profileId: backup.profileId,
  decision,
});

/**
 * Resolves the complete first-device candidate set without restoring or
 * deleting any non-selected profile. The selected profile keeps its actual
 * decision; the remaining candidates are suppressed only for this onboarding
 * discovery and remain available from the explicit Cloud Backup surface.
 */
export const resolveCloudRecoveryOnboarding = async (
  discovery: CloudRecoveryDiscovery,
  selectedBackupId: string,
  selectedDecision: 'kept-local' | 'dismissed' | 'restored',
): Promise<void> => {
  const candidates = discovery.candidates.filter(candidate => candidate.backup);
  for (const candidate of candidates) {
    const backup = candidate.backup!;
    await recordCloudRecoveryDecision({
      accountId: discovery.userId,
      fingerprint: getCloudRecoveryFingerprint({
        backupId: backup.id,
        profileId: backup.profileId,
        schemaVersion: backup.schemaVersion,
        updatedAt: backup.updatedAt,
      }),
      profileId: backup.profileId,
      decision: backup.id === selectedBackupId ? selectedDecision : 'dismissed',
    });
  }
};
