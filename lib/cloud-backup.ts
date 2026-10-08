import { withRealWorkspaceOperation } from './storage/workspace-fence';
import { CloudOperationBusyError, isCloudManagementOpen, withCloudOperation } from './cloud-operation';
import { assertCloudAuthOutsideDemo, cancelCloudGoogleSignIn, withCloudAuthLock } from './cloud-google-auth';
import {
  getCloudAuthRedirectUrl,
  getSupabaseClient,
} from './supabase';
import type {
  CaizenBackupResult,
  CaizenCloudBackup,
  CaizenMediaTransferFailure,
  CaizenRestoreResult,
  MediaAsset,
  Profile,
} from './types';
import {
  buildCaizenMediaStoragePath,
  caizenPrivateMediaExists,
  CloudBackupBaselineChangedError,
  deleteCaizenMediaAssetMetadata,
  deleteCaizenPrivateMedia,
  deleteCaizenProfileBackup,
  downloadCaizenPrivateMedia,
  getCaizenProfileBackup,
  getCaizenProfileBackupMetadata,
  invalidateCaizenCloudUserCache,
  listAllCaizenMediaAssets,
  listCaizenMediaAssets,
  listCaizenProfileBackups,
  listCaizenProfileBackupMetadata,
  listCaizenMediaAssetMetadata,
  listCaizenPrivateMediaFolder,
  listCaizenSnapshotMedia,
  softDeleteCaizenMediaAsset,
  uploadCaizenPrivateMedia,
  upsertCaizenMediaAsset,
  upsertCaizenProfileBackup,
  type UpsertCaizenMediaAssetInput,
} from './caizen-cloud-repository';
import { loadAppState, saveAppState, type StoredAppState } from './storage/app-repository';
import { CAIZEN_BACKUP_SCHEMA_VERSION } from './storage/backup-schema';
import { createDataOnlyEnvelope, createDataOnlyExport } from './storage/backup-repository';
import { mapWithConcurrency } from './storage/bounded-concurrency';
import { getStoreValue, putStoreValue } from './storage/database';
import { getMediaAsset, listMediaAssets, putMediaAsset } from './storage/media-repository';
import { mediaStorage } from './storage/media-storage';
import { validateMediaBlob } from './storage/media-validation';
import { STORES } from './storage/schema';
import { hasLocalMediaCopy, hasLocalMediaThumbnail } from './storage/media-residency';
import { dataUrlToBlob, isInlineDataUrl } from './storage/legacy-media';
import {
  clearCloudMediaCache,
  enforceCloudMediaCacheLimit,
  forgetCloudMediaCacheEntry,
  touchCloudMediaCache,
} from './storage/media-cache';
import type { User } from '@supabase/supabase-js';
import {
  invalidateMediaSession,
  getMediaSessionToken,
  getMediaSessionUserId,
  isMediaSessionCurrent,
  isMediaSessionSuspended,
  setMediaSessionUser,
  withMediaSessionCommit,
  MediaSessionInvalidatedError,
  type MediaSessionToken,
} from './storage/media-session';
import { getCloudRecoveryFingerprint } from './cloud-recovery-state';
import type { PreparedImport } from './storage/import-integrity';
import { DEFAULT_PET_PERSONALITY } from './pets/normalization';

const LOCAL_MODIFIED_KEY =
  'life-manager-local-modified-at';
const LOCAL_PROFILE_MODIFIED_KEY_PREFIX = 'life-manager-local-modified-at:';

type BackupOptions = {
  force?: boolean;
  mode?: 'manual' | 'auto';
  retryMedia?: boolean;
  /** Used by background reconciliation to prevent account-switch races. */
  expectedUserId?: string;
  /** Used by reviewed conflict resolution to fence the exact Cloud version. */
  expectedBackupId?: string;
  expectedUpdatedAt?: string | null;
  expectedFingerprint?: string;
  expectedProfileId?: string;
  /** Device revision captured by the review authorizing a Cloud replacement. */
  expectedLocalModifiedAt?: string | null;
  onProgress?: (progress: CloudTransferProgress) => void;
};

export type RestoreOptions = Pick<BackupOptions, 'onProgress'> & {
  profileId?: string;
  expectedBackupId?: string;
  expectedUpdatedAt?: string;
  expectedUserId?: string;
  expectedFingerprint?: string;
  /** Local profile revision observed when the destructive action was reviewed. */
  expectedLocalModifiedAt?: string | null;
  /** Current-profile identity observed with the destructive review. */
  expectedCurrentProfileId?: string | null;
  removeProfileIds?: string[];
  /** Final guard retained inside the import repository commit boundary. */
  beforeReplace?: () => Promise<void>;
  assertBeforeReplace?: () => void;
  /** Backward-compatible pre-commit hook for existing callers/tests. */
  beforeCommit?: () => Promise<void>;
};

export type CloudTransferProgress = {
  operation: 'backup' | 'restore';
  phase: 'preparing' | 'media' | 'snapshot' | 'text' | 'complete';
  completed: number;
  total: number;
  message: string;
};

export type CaizenCloudDeletionResult = {
  status: 'success' | 'partial';
  profileId: string;
  deletedMediaCount: number;
  failedMedia: CaizenMediaTransferFailure[];
  remainingTargets: CloudDeletionRetryTarget[];
};

export type CloudDeletionRetryTarget = {
  id: string;
  profileId: string;
  storagePath: string;
  thumbnailPath: string;
};

type PortableEnvelope = {
  format: string;
  version: number;
  createdAt: string;
  data: StoredAppState;
  media: MediaAsset[];
  mediaNotice?: string;
};

type MediaUploadCandidate = {
  input: UpsertCaizenMediaAssetInput;
  read: () => Promise<Blob>;
  localAsset?: MediaAsset;
  applySnapshotReference?: () => void;
};

const CLOUD_MEDIA_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const createCloudThumbnail = async (blob: Blob): Promise<Blob | undefined> => {
  // Keep thumbnail generation optional for older/native builds and test
  // doubles that only implement the original media-storage surface.
  try {
    const mediaStorageModule = await import('./storage/media-storage') as typeof import('./storage/media-storage') & {
      createMediaThumbnail?: (input: Blob) => Promise<Blob | undefined>;
    };
    return typeof mediaStorageModule.createMediaThumbnail === 'function'
      ? mediaStorageModule.createMediaThumbnail(blob)
      : undefined;
  } catch {
    return undefined;
  }
};

type RemoteMediaAsset = Awaited<ReturnType<typeof listCaizenMediaAssets>>[number];

/**
 * A media reference carried by the winning snapshot.  Canonical media rows
 * are only an index/cache; restore must be able to proceed when that row is
 * missing or still contains the path/checksum from an older publication.
 */
type SnapshotMediaReference = {
  id: string;
  userId: string;
  profileId: string;
  recordType: string;
  recordId: string;
  role: MediaAsset['role'];
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  storagePath: string;
  checksum: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
};

type CloudMediaReference = SnapshotMediaReference;

type PendingCloudMediaCommit = {
  candidate: MediaUploadCandidate;
  existing?: RemoteMediaAsset;
  storagePath: string;
  thumbnailPath: string;
};

type PendingCloudMediaRepair = {
  candidate: MediaUploadCandidate;
  storagePath: string;
};

type PendingLocalMediaUpdate = {
  asset: MediaAsset;
  remotePath: string;
  updatedAt?: string;
};

const uploadCloudThumbnail = async (
  userId: string,
  profileId: string,
  mediaAssetId: string,
  blob: Blob,
  storagePath?: string,
): Promise<void> => {
  const thumbnail = await createCloudThumbnail(blob);
  if (!thumbnail) return;
  await uploadCaizenPrivateMedia(
    storagePath ?? `${userId}/${profileId}/${mediaAssetId}/${mediaAssetId}-thumbnail.webp`,
    thumbnail,
    'image/webp',
    { profileId, mediaAssetId },
  );
};

const buildStagedMediaStoragePath = (
  userId: string,
  profileId: string,
  mediaAssetId: string,
  mimeType: string,
  attemptId: string,
): string => {
  const canonical = buildCaizenMediaStoragePath(userId, profileId, mediaAssetId, mimeType);
  const segments = canonical.split('/');
  const extension = segments[3].split('.').pop() || 'bin';
  segments[3] = `${mediaAssetId}.staged-${attemptId}.${extension}`;
  return segments.join('/');
};

const thumbnailPathForMedia = (
  userId: string,
  asset: Pick<RemoteMediaAsset, 'profileId' | 'id' | 'storagePath'>,
): string => {
  const fileName = asset.storagePath.split('/').pop() || '';
  const versionPrefix = `${asset.id}.staged-`;
  if (fileName.startsWith(versionPrefix)) {
    const version = fileName.slice(versionPrefix.length).split('.')[0];
    if (version) {
      return `${userId}/${asset.profileId}/${asset.id}/${asset.id}-thumbnail-staged-${version}.webp`;
    }
  }
  return `${userId}/${asset.profileId}/${asset.id}/${asset.id}-thumbnail.webp`;
};

const isOwnedCloudStoragePath = (
  storagePath: string,
  userId: string,
  profileId: string,
  mediaAssetId: string,
): boolean => {
  const segments = storagePath.split('/');
  return (
    segments.length === 4 &&
    segments.every(Boolean) &&
    segments[0] === userId &&
    segments[1] === profileId &&
    segments[2] === mediaAssetId
  );
};

const checksumShape = /^[a-f0-9]{64}$/i;

const asSnapshotMediaReference = (
  value: unknown,
  userId: string,
  profileId: string,
): SnapshotMediaReference => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The Cloud snapshot contains invalid media metadata.');
  }
  const item = value as Record<string, unknown>;
  const id = typeof item.id === 'string' ? item.id : '';
  const itemProfileId = typeof item.profileId === 'string' ? item.profileId : '';
  const storagePath = typeof item.remotePath === 'string' ? item.remotePath : '';
  const recordType = typeof item.ownerType === 'string'
    ? item.ownerType
    : typeof item.recordType === 'string' ? item.recordType : '';
  const recordId = typeof item.ownerId === 'string'
    ? item.ownerId
    : typeof item.recordId === 'string' ? item.recordId : '';
  const role = typeof item.role === 'string' ? item.role : '';
  const originalName = typeof item.fileName === 'string'
    ? item.fileName
    : typeof item.originalName === 'string' ? item.originalName : '';
  const mimeType = typeof item.mimeType === 'string' ? item.mimeType.toLowerCase() : '';
  const sizeBytes = item.sizeBytes;
  const width = item.width == null ? null : item.width;
  const height = item.height == null ? null : item.height;
  const checksum = item.checksum == null ? null : item.checksum;
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt : '';
  const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : '';

  const allowedRoles = new Set<MediaAsset['role']>([
    'primary', 'gallery', 'receipt', 'attachment', 'thumbnail',
  ]);
  if (!id || itemProfileId !== profileId || !recordType || !recordId || !role || !originalName) {
    throw new Error('The Cloud snapshot contains incomplete media metadata.');
  }
  if (!allowedRoles.has(role as MediaAsset['role'])) {
    throw new Error('The Cloud snapshot contains an unsupported media role.');
  }
  if (!isOwnedCloudStoragePath(storagePath, userId, profileId, id)) {
    throw new Error('The Cloud snapshot media path is outside the selected account/profile boundary.');
  }
  if (!CLOUD_MEDIA_MIME_TYPES.has(mimeType)) {
    throw new Error(`Cloud Storage does not support ${mimeType || 'this media type'}.`);
  }
  if (!Number.isSafeInteger(sizeBytes) || (sizeBytes as number) < 0) {
    throw new Error('Cloud media metadata has an invalid byte size.');
  }
  if (
    (width !== null && (!Number.isSafeInteger(width) || (width as number) <= 0)) ||
    (height !== null && (!Number.isSafeInteger(height) || (height as number) <= 0))
  ) {
    throw new Error('Cloud media dimensions must be positive safe integers.');
  }
  if (checksum !== null && (typeof checksum !== 'string' || !checksumShape.test(checksum))) {
    throw new Error('Cloud media checksum has an invalid shape.');
  }
  if (
    !createdAt ||
    !updatedAt ||
    !Number.isFinite(Date.parse(createdAt)) ||
    !Number.isFinite(Date.parse(updatedAt))
  ) {
    throw new Error('The Cloud snapshot contains incomplete media timestamps.');
  }

  return {
    id,
    userId,
    profileId,
    recordType,
    recordId,
    role: role as MediaAsset['role'],
    originalName,
    mimeType,
    sizeBytes: sizeBytes as number,
    width: width as number | null,
    height: height as number | null,
    storagePath,
    checksum: checksum as string | null,
    createdAt,
    updatedAt,
    deletedAt: null,
  };
};

const verifyCloudMediaObjectExists = async (
  storagePath: string,
  expected: { profileId: string; mediaAssetId: string },
): Promise<boolean> => {
  // Older test doubles and embedded integrations may not expose list yet; the
  // production Supabase repository always does. Keep those callers compatible
  // while treating the real authenticated check as authoritative.
  if (typeof caizenPrivateMediaExists !== 'function') return true;
  return caizenPrivateMediaExists(storagePath, expected);
};

const snapshotMediaMatchesCandidate = (
  reference: SnapshotMediaReference,
  candidate: MediaUploadCandidate,
  localBytesPresent: boolean,
  localBytesPresenceKnown: boolean,
): boolean => {
  if (!localBytesPresenceKnown) return false;
  if (
    reference.profileId !== candidate.input.profileId ||
    reference.mimeType !== candidate.input.mimeType.toLowerCase() ||
    reference.sizeBytes !== candidate.input.sizeBytes
  ) return false;
  if (candidate.input.checksum && reference.checksum) {
    return candidate.input.checksum.toLowerCase() === reference.checksum.toLowerCase();
  }
  // Without matching checksums, only a remote-only local asset may reuse the
  // snapshot path. Local bytes remain authoritative when equivalence is not
  // provable, so a fresh staged upload is required in that case.
  return !localBytesPresent;
};

type LegacyMediaMigration = {
  collection: 'inventoryItems' | 'wishlistItems' | 'skincareProducts' | 'supplements' | 'mediaItems';
  key: 'image' | 'photo';
  referenceKey: 'photoAssetIds' | 'imageAssetId';
  ownerType: MediaAsset['ownerType'];
};

const LEGACY_MEDIA_MIGRATIONS: LegacyMediaMigration[] = [
  { collection: 'inventoryItems', key: 'image', referenceKey: 'photoAssetIds', ownerType: 'inventory' },
  { collection: 'wishlistItems', key: 'image', referenceKey: 'photoAssetIds', ownerType: 'wishlist' },
  { collection: 'skincareProducts', key: 'photo', referenceKey: 'photoAssetIds', ownerType: 'health' },
  { collection: 'skincareProducts', key: 'image', referenceKey: 'photoAssetIds', ownerType: 'health' },
  { collection: 'supplements', key: 'image', referenceKey: 'photoAssetIds', ownerType: 'health' },
  { collection: 'mediaItems', key: 'image', referenceKey: 'imageAssetId', ownerType: 'other' },
];

/**
 * Materializes old inline data-URI producers before a Cloud snapshot is
 * serialized. The inline value is removed only after the managed bytes and
 * structured reference have been durably written and read back.
 */
const migrateLegacyInlineMedia = async (
  state: StoredAppState,
  profile: Profile,
): Promise<CaizenMediaTransferFailure[]> => {
  const failures: CaizenMediaTransferFailure[] = [];
  const hasLegacyInlineMedia = LEGACY_MEDIA_MIGRATIONS.some(definition => {
    const records = (profile[definition.collection] as unknown as Array<Record<string, unknown>> | undefined) || [];
    return records.some(record => isInlineDataUrl(record[definition.key]));
  });
  if (!hasLegacyInlineMedia) return failures;
  const createdAssetIds: string[] = [];
  const migratedRecords: Array<{ definition: LegacyMediaMigration; recordId: string; assetId: string }> = [];
  const originalState = structuredClone(state);
  const workingState = structuredClone(state);
  const workingProfile = workingState.profiles.find(item => item.id === profile.id);
  if (!workingProfile) return failures;
  let changed = false;

  for (const definition of LEGACY_MEDIA_MIGRATIONS) {
    const records = (workingProfile[definition.collection] as unknown as Array<Record<string, unknown>> | undefined) || [];
    for (const record of records) {
      const value = record[definition.key];
      if (!isInlineDataUrl(value)) continue;
      const blob = dataUrlToBlob(value);
      const recordId = typeof record.id === 'string' ? record.id : 'unknown';
      if (!blob) {
        failures.push(failure(
          'legacy',
          `${definition.collection}.${recordId}.${definition.key} could not be decoded; the inline value was preserved.`,
          null,
          `${definition.collection}.${recordId}`,
        ));
        continue;
      }
      try {
        const asset = await mediaStorage.save(blob, {
          profileId: profile.id,
          ownerType: definition.ownerType,
          ownerId: recordId,
          role: 'primary',
          fileName: `legacy-${definition.collection}-${recordId}.${blob.type.split('/')[1] || 'bin'}`,
        });
        createdAssetIds.push(asset.id);
        if (definition.referenceKey === 'imageAssetId') {
          record.imageAssetId = asset.id;
        } else {
          const ids = Array.isArray(record.photoAssetIds)
            ? record.photoAssetIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
            : [];
          record.photoAssetIds = ids.includes(asset.id) ? ids : [...ids, asset.id];
        }
        delete record[definition.key];
        if (
          definition.collection === 'skincareProducts' &&
          definition.key === 'photo' &&
          record.image === value
        ) {
          delete record.image;
        }
        migratedRecords.push({ definition, recordId, assetId: asset.id });
        changed = true;
      } catch (error) {
        failures.push(failure(
          'legacy',
          `${definition.collection}.${recordId}.${definition.key} could not be converted: ${errorMessage(error)}. The inline value was preserved.`,
          null,
          `${definition.collection}.${recordId}`,
        ));
      }
    }
  }

  if (!changed) return failures;
  try {
    await saveAppState(workingState);
    const verified = await loadAppState();
    const verifiedProfile = verified?.profiles.find(item => item.id === profile.id);
    for (const migrated of migratedRecords) {
      const verifiedRecords = (verifiedProfile?.[migrated.definition.collection] as unknown as Array<Record<string, unknown>> | undefined) || [];
      const persisted = verifiedRecords.find(item => item.id === migrated.recordId);
      const persistedReference = migrated.definition.referenceKey === 'imageAssetId'
        ? persisted?.imageAssetId === migrated.assetId
        : Array.isArray(persisted?.photoAssetIds) && persisted.photoAssetIds.includes(migrated.assetId);
      if (!persisted || !persistedReference || isInlineDataUrl(persisted[migrated.definition.key])) {
        throw new Error(`${migrated.definition.collection}.${migrated.recordId} did not read back after migration.`);
      }
    }
  } catch (error) {
    // Restore the original structured state and only remove the created assets
    // after that restoration is verified. If the structured rollback fails,
    // deleting those assets could remove the only usable representation.
    let restored = false;
    try {
      await saveAppState(originalState);
      const rollback = await loadAppState();
      restored = JSON.stringify(rollback) === JSON.stringify(originalState);
    } catch {
      restored = false;
    }
    if (restored && typeof mediaStorage.delete === 'function') {
      await Promise.all(createdAssetIds.map(id => mediaStorage.delete(id).catch(() => undefined)));
    }
    failures.push(failure(
      'legacy',
      `${errorMessage(error)}${restored ? '' : ' The original structured state could not be verified after rollback; materialized media was retained.'}`,
      null,
      profile.name,
    ));
  }
  return failures;
};
const LEGACY_MEDIA_VALUE = /^(?:data:[^;,]+;base64,|blob:|content:|file:|capacitor:|[a-z]:[\\/]|\\\\|\/(?:data|private|sdcard|storage)\/)/i;
const LAST_SUCCESSFUL_BACKUP_KEY = 'cloud-last-successful-backup';
const AUTO_BACKUP_KEY_PREFIX = 'cloud-auto-backup:';
const AUTO_BACKUP_PAUSE_KEY_PREFIX = 'cloud-auto-backup-paused:';
const AUTO_BACKUP_CHECK_KEY_PREFIX = 'cloud-auto-backup-check:';
const MANUAL_BACKUP_KEY_PREFIX = 'cloud-manual-backup-complete:';
const LAST_PROFILE_BACKUP_KEY_PREFIX = 'cloud-last-successful-backup:';
const CLOUD_SYNC_MARKER_KEY_PREFIX = 'cloud-sync-marker:';
const CLOUD_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

export type CloudProfileBackupSummary = {
  userId: string;
  id: string;
  profileId: string;
  profileName: string;
  profileNameSource?: 'local' | 'reviewed' | 'unknown';
  schemaVersion: number;
  updatedAt: string;
  structuredSizeBytes: number;
  mediaCount: number | null;
  mediaSizeBytes: number | null;
  validation: 'unreviewed' | 'valid' | 'invalid';
  warning: string | null;
};

export type CloudBackupOverview = {
  currentProfile: {
    id: string;
    name: string;
    localModifiedAt: string | null;
    structuredSizeBytes: number;
  } | null;
  backups: CloudProfileBackupSummary[];
  matchingBackup: CloudProfileBackupSummary | null;
  otherBackups: CloudProfileBackupSummary[];
};

export type CloudReconciliation = {
  action: 'none' | 'upload' | 'restore' | 'conflict';
  reason: 'unchanged' | 'local-newer' | 'cloud-newer' | 'both-changed' | 'no-baseline' | 'no-cloud';
  userId: string;
  profileId: string;
  cloudBackupId: string | null;
  cloudBackupFingerprint?: string;
  cloudSchemaVersion?: number;
  localUpdatedAt: string | null;
  cloudUpdatedAt: string | null;
};

export type CloudSyncMarker = {
  userId: string;
  profileId: string;
  localUpdatedAt: string;
  cloudUpdatedAt: string;
  syncedAt: string;
};

export type CloudAutoBackupCheck = {
  userId: string;
  profileId: string;
  checkedAt: string;
  outcome: 'current' | 'uploaded' | 'partial' | 'attention';
  cloudUpdatedAt: string | null;
};

export const CLOUD_AUTO_BACKUP_STATUS_EVENT = 'caizen:cloud-auto-backup-status';

const autoBackupCheckKey = (userId: string, profileId: string) =>
  `${AUTO_BACKUP_CHECK_KEY_PREFIX}${userId}:${profileId}`;

export const getCloudAutoBackupCheck = (userId: string, profileId: string): CloudAutoBackupCheck | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(localStorage.getItem(autoBackupCheckKey(userId, profileId)) || 'null') as Partial<CloudAutoBackupCheck> | null;
    if (value?.userId !== userId || value.profileId !== profileId ||
      typeof value.checkedAt !== 'string' || !Number.isFinite(Date.parse(value.checkedAt)) ||
      !['current', 'uploaded', 'partial', 'attention'].includes(value.outcome || '') ||
      (value.cloudUpdatedAt !== null && typeof value.cloudUpdatedAt !== 'string')) return null;
    return value as CloudAutoBackupCheck;
  } catch {
    return null;
  }
};

export const recordCloudAutoBackupCheck = (
  userId: string,
  profileId: string,
  outcome: CloudAutoBackupCheck['outcome'],
  cloudUpdatedAt: string | null = null,
) => {
  if (typeof window === 'undefined') return;
  const value: CloudAutoBackupCheck = {
    userId, profileId, checkedAt: new Date().toISOString(), outcome, cloudUpdatedAt,
  };
  try {
    localStorage.setItem(autoBackupCheckKey(userId, profileId), JSON.stringify(value));
  } catch {
    // Auxiliary diagnostics must never interrupt reconciliation.
  }
  window.dispatchEvent(new CustomEvent(CLOUD_AUTO_BACKUP_STATUS_EVENT, {
    detail: { userId, profileId, checking: false, recorded: true },
  }));
};

export const announceCloudAutoBackupChecking = (userId: string, profileId: string, checking: boolean) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CLOUD_AUTO_BACKUP_STATUS_EVENT, {
    detail: { userId, profileId, checking },
  }));
};

const profileStorageKey = (prefix: string, profileId: string) =>
  `${prefix}${profileId}`;

export const getLastSuccessfulBackupTimestamp = (scope: CloudBackupScope): string | null => {
  if (typeof window === 'undefined') return null;
  return readCloudBackupPreferences(scope).lastCompleteBackupAt;
};

export { CloudBackupBaselineChangedError } from './caizen-cloud-repository';

export const isCloudBackupBaselineChangedError = (error: unknown): boolean =>
  error instanceof CloudBackupBaselineChangedError ||
  (error instanceof Error && error.name === 'CloudBackupBaselineChangedError');

const cloudSyncMarkerKey = (userId: string, profileId: string) =>
  `${CLOUD_SYNC_MARKER_KEY_PREFIX}${userId}:${profileId}`;

export const getCloudSyncMarker = (
  userId: string,
  profileId: string,
): CloudSyncMarker | null => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(cloudSyncMarkerKey(userId, profileId)) || 'null',
    ) as Partial<CloudSyncMarker> | null;
    if (
      parsed?.userId !== userId ||
      parsed.profileId !== profileId ||
      typeof parsed.localUpdatedAt !== 'string' ||
      typeof parsed.cloudUpdatedAt !== 'string' ||
      typeof parsed.syncedAt !== 'string'
    ) return null;
    return parsed as CloudSyncMarker;
  } catch {
    return null;
  }
};

const writeCloudSyncMarker = (
  userId: string,
  profileId: string,
  localTimestamp: string,
  cloudTimestamp = localTimestamp,
) => {
  if (typeof window === 'undefined') return;
  const marker: CloudSyncMarker = {
    userId,
    profileId,
    localUpdatedAt: localTimestamp,
    cloudUpdatedAt: cloudTimestamp,
    syncedAt: new Date().toISOString(),
  };
  localStorage.setItem(
    cloudSyncMarkerKey(userId, profileId),
    JSON.stringify(marker),
  );
};

export const getLocalProfileModifiedAt = async (profileId: string) => {
  const profileScoped = localStorage.getItem(
    profileStorageKey(LOCAL_PROFILE_MODIFIED_KEY_PREFIX, profileId),
  );
  if (profileScoped) return profileScoped;

  // The unscoped setting predates multi-profile Cloud Sync. Restrict its use
  // to the original single-profile workspace and never let it become the
  // baseline for a profile created after that legacy timestamp.
  const state = await loadAppState();
  if (!state || state.profiles.length !== 1 || state.currentProfileId !== profileId) {
    return null;
  }
  const legacy = (
    await getStoreValue<{ key: string; value: string }>(
      STORES.settings,
      'localModifiedAt',
    )
  )?.value;
  if (!legacy) return null;
  const profileCreatedAt = new Date(state.profiles[0].createdAt).getTime();
  const legacyAt = new Date(legacy).getTime();
  if (
    Number.isFinite(profileCreatedAt) &&
    Number.isFinite(legacyAt) &&
    profileCreatedAt > legacyAt
  ) {
    return null;
  }
  return legacy;
};

const isDefaultHealthState = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return true;
  const health = value as Record<string, unknown>;
  const knownKeys = new Set([
    'heightCm', 'targetCalories', 'maintenanceCalories', 'targetProtein',
    'targetWaterMl', 'sodiumLimitMg', 'targetWeightKg', 'vapeTracker',
    'weightEntries', 'waterEntries', 'bodyMeasurementEntries', 'nutritionEntries', 'foodEntries', 'foodLogCompletedDates',
    'foodLogExcludedDates', 'foodTemplates', 'mealTemplates',
    'favoriteFoodTemplateIds', 'favoriteMealTemplateIds', 'favoriteWorkoutExerciseIds', 'activityEntries',
    'workoutPlans', 'sleepEntries', 'noXTrackers',
    'workoutExercises', 'workoutRoutines', 'workoutSessions',
    'fastingSessions',
  ]);
  if (Object.entries(health).some(([key, child]) => !knownKeys.has(key) && child != null)) {
    return false;
  }
  const emptyList = (key: string) => {
    const items = health[key];
    return items == null || (Array.isArray(items) && items.length === 0);
  };
  const vapeTracker = health.vapeTracker;
  const defaultVapeTracker =
    vapeTracker == null ||
    (typeof vapeTracker === 'object' &&
      (vapeTracker as Record<string, unknown>).quitDate == null &&
      ((vapeTracker as Record<string, unknown>).dailySpendBefore == null ||
        (vapeTracker as Record<string, unknown>).dailySpendBefore === 0));

  return (
    health.heightCm == null &&
    health.targetCalories == null &&
    health.maintenanceCalories == null &&
    health.targetProtein == null &&
    health.targetWaterMl == null &&
    health.sodiumLimitMg == null &&
    health.targetWeightKg == null &&
    defaultVapeTracker &&
    emptyList('weightEntries') &&
    emptyList('waterEntries') &&
    emptyList('bodyMeasurementEntries') &&
    emptyList('nutritionEntries') &&
    emptyList('foodEntries') &&
    emptyList('foodLogCompletedDates') &&
    emptyList('foodLogExcludedDates') &&
    emptyList('foodTemplates') &&
    emptyList('mealTemplates') &&
    emptyList('favoriteFoodTemplateIds') &&
    emptyList('favoriteMealTemplateIds') &&
    emptyList('favoriteWorkoutExerciseIds') &&
    emptyList('activityEntries') &&
    emptyList('workoutPlans') &&
    emptyList('workoutExercises') &&
    emptyList('workoutRoutines') &&
    emptyList('workoutSessions') &&
    emptyList('fastingSessions') &&
    emptyList('sleepEntries') &&
    emptyList('noXTrackers')
  );
};

const isDefaultPetState = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return true;
  const pet = value as Record<string, unknown>;
  const sameList = (key: string, expected: string[]) =>
    Array.isArray(pet[key]) &&
    pet[key].length === expected.length &&
    pet[key].every((item, index) => item === expected[index]);
  return (
    pet.name === 'Mochi' &&
    (pet.personality === undefined || pet.personality === DEFAULT_PET_PERSONALITY) &&
    pet.activePetId === 'mochi' &&
    pet.costume === 'default' &&
    pet.level === 1 &&
    pet.xp === 0 &&
    pet.gold === 0 &&
    pet.showFloatingPet === true &&
    sameList('ownedPetIds', ['mochi']) &&
    sameList('ownedCostumes', ['default']) &&
    sameList('purchasedShopItemIds', []) &&
    sameList('rewardedItemIds', []) &&
    sameList('recentRewards', [])
  );
};

export const isCloudBootstrapPristine = (state: StoredAppState | null): boolean =>
  Boolean(
    state?.profiles.length === 1 &&
    state.currentProfileId === state.profiles[0]?.id &&
    state.profiles.every(profile => {
      // Mochi is the app default companion, but custom pet progress is user
      // data and blocks silent first-device replacement.
      const {
        id: _id,
        createdAt: _createdAt,
        pet,
        health,
        name,
        avatar,
        avatarAssetId,
        baseCurrency,
        currency,
        balanceProjectionIncludeAllWallets,
        ...profileCollections
      } = profile;
      return (
        name === 'My Profile' &&
        avatar == null &&
        avatarAssetId == null &&
        (baseCurrency == null || baseCurrency === 'PHP') &&
        (currency == null || currency === 'PHP') &&
        (balanceProjectionIncludeAllWallets == null ||
          balanceProjectionIncludeAllWallets === false) &&
        isDefaultPetState(pet) &&
        isDefaultHealthState(health) &&
        Object.values(profileCollections).every(value =>
          value == null || (Array.isArray(value) && value.length === 0),
        )
      );
    }),
  );

/**
 * A fresh device has a generated local profile ID, so it cannot use the
 * normal per-profile marker immediately after login. Only bootstrap when the
 * workspace contains no collection data and the account has exactly one valid
 * Cloud profile; ambiguous or non-empty workspaces remain conflict-safe.
 */
export const getCloudBootstrapBackup = async (): Promise<CaizenCloudBackup | null> => {
  const user = await getCloudUser();
  if (!user) return null;
  const state = await loadAppState();
  if (!isCloudBootstrapPristine(state)) return null;

  const backups = await listCaizenProfileBackups();
  const { prepareImport } = await import('./storage/import-integrity');
  const valid = backups.filter(backup => {
    try {
      const prepared = prepareImport(
        backup.data,
        state?.profiles.map(profile => profile.id) ?? [],
      );
      return (
        prepared.report.canImport &&
        prepared.state.profiles.length === 1 &&
        prepared.state.profiles[0]?.id === backup.profileId
      );
    } catch {
      return false;
    }
  });

  const candidate = valid.length === 1 ? valid[0] : null;
  if (!candidate || getCloudSyncMarker(user.id, candidate.profileId)) return null;
  return candidate;
};

export type CloudBackupScope = { userId: string; profileId: string };
type CloudBackupPreferences = {
  version: 1;
  enabled: boolean;
  manualBackupCompletedAt: string | null;
  lastCompleteBackupAt: string | null;
  pausedReason: string | null;
};
const CLOUD_PREFERENCES_PREFIX = 'cloud-backup-preferences-v1:';
const preferenceKey = ({ userId, profileId }: CloudBackupScope) => `${CLOUD_PREFERENCES_PREFIX}${userId}:${profileId}`;
const emptyCloudPreferences = (): CloudBackupPreferences => ({ version: 1, enabled: false, manualBackupCompletedAt: null, lastCompleteBackupAt: null, pausedReason: null });
const readCloudBackupPreferences = (scope: CloudBackupScope): CloudBackupPreferences => {
  if (typeof window === 'undefined') return emptyCloudPreferences();
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey(scope)) || 'null') as Partial<CloudBackupPreferences> | null;
    const validDate = (date: unknown) => date === null || (typeof date === 'string' && Number.isFinite(Date.parse(date)));
    if (value?.version !== 1 || typeof value.enabled !== 'boolean' ||
      !validDate(value.manualBackupCompletedAt) || !validDate(value.lastCompleteBackupAt) ||
      (value.pausedReason !== null && typeof value.pausedReason !== 'string')) return emptyCloudPreferences();
    return value as CloudBackupPreferences;
  } catch { return emptyCloudPreferences(); }
};
const writeCloudBackupPreferences = (scope: CloudBackupScope, update: Partial<CloudBackupPreferences>) => {
  const value = { ...readCloudBackupPreferences(scope), ...update, version: 1 };
  localStorage.setItem(preferenceKey(scope), JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(CLOUD_AUTO_BACKUP_STATUS_EVENT, { detail: scope }));
};
export const getCloudAutoBackupState = (scope: CloudBackupScope) => {
  const value = readCloudBackupPreferences(scope);
  let legacyEnabled = false;
  try {
    legacyEnabled = typeof window !== 'undefined' && !value.manualBackupCompletedAt && localStorage.getItem(profileStorageKey(AUTO_BACKUP_KEY_PREFIX, scope.profileId)) === 'true';
  } catch { /* Unavailable auxiliary storage cannot establish consent. */ }
  return {
    enabled: value.enabled,
    eligible: Boolean(value.manualBackupCompletedAt),
    pausedReason: value.pausedReason,
    legacyEnabled,
  };
};

export const setCloudAutoBackupEnabled = (scope: CloudBackupScope, enabled: boolean) => {
  if (typeof window === 'undefined') return;
  const state = getCloudAutoBackupState(scope);
  if (enabled && !state.eligible) {
    throw new Error('Create one successful manual backup for this profile first.');
  }
  writeCloudBackupPreferences(scope, { enabled, pausedReason: null });
};

export const setCloudAutoBackupPaused = (
  scope: CloudBackupScope,
  reason: string | null,
) => {
  if (typeof window === 'undefined') return;
  if (!getCloudAutoBackupState(scope).enabled) return;
  writeCloudBackupPreferences(scope, { pausedReason: reason });
};

export const clearCloudProfileLocalState = (profileId: string) => {
  if (typeof window === 'undefined') return;
  for (const prefix of [
    LOCAL_PROFILE_MODIFIED_KEY_PREFIX,
    LAST_PROFILE_BACKUP_KEY_PREFIX,
    MANUAL_BACKUP_KEY_PREFIX,
    AUTO_BACKUP_KEY_PREFIX,
    AUTO_BACKUP_PAUSE_KEY_PREFIX,
  ]) {
    localStorage.removeItem(profileStorageKey(prefix, profileId));
  }
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (
      key?.startsWith(`${CLOUD_SYNC_MARKER_KEY_PREFIX}`) &&
      key.endsWith(`:${profileId}`)
    ) {
      localStorage.removeItem(key);
    }
    if (key?.startsWith(AUTO_BACKUP_CHECK_KEY_PREFIX) && key.endsWith(`:${profileId}`)) {
      localStorage.removeItem(key);
    }
    if (key?.startsWith(CLOUD_PREFERENCES_PREFIX) && key.endsWith(`:${profileId}`)) localStorage.removeItem(key);
  }
};

const failure = (
  operation: CaizenMediaTransferFailure['operation'],
  message: string,
  mediaAssetId: string | null = null,
  originalName: string | null = null,
): CaizenMediaTransferFailure => ({
  operation,
  message,
  mediaAssetId,
  originalName,
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'An unknown cloud media error occurred.';

const deleteCloudMediaObjects = async (
  userId: string,
  asset: Awaited<ReturnType<typeof listCaizenMediaAssets>>[number],
): Promise<void> => {
  await deleteCaizenPrivateMedia(asset.storagePath, {
    profileId: asset.profileId,
    mediaAssetId: asset.id,
  });
  // Thumbnails use a deterministic sibling object rather than a database
  // column. Delete it as part of the same authoritative Cloud-media fence.
  await deleteCaizenPrivateMedia(
    thumbnailPathForMedia(userId, asset),
    { profileId: asset.profileId, mediaAssetId: asset.id },
  );
};

const clearDeletedCloudLocalMetadata = async (
  asset: Awaited<ReturnType<typeof listCaizenMediaAssets>>[number],
): Promise<void> => {
  await clearCloudLocalRemotePath(asset.id, asset.profileId, asset.storagePath);
};

const clearCloudLocalRemotePath = async (
  mediaAssetId: string,
  profileId: string,
  storagePath: string,
): Promise<void> => {
  const localAsset = await getMediaAsset(mediaAssetId);
  if (
    !localAsset ||
    localAsset.profileId !== profileId ||
    localAsset.remotePath !== storagePath
  ) return;

  const [hasLocal, hasThumbnail] = await Promise.all([
    hasLocalMediaCopy(localAsset),
    hasLocalMediaThumbnail(localAsset),
  ]);
  await putMediaAsset({
    ...localAsset,
    remotePath: undefined,
    localPath: hasLocal ? localAsset.localPath : undefined,
    thumbnailPath: hasThumbnail ? localAsset.thumbnailPath : undefined,
    syncStatus: 'local-only',
  });
};

type CloudDeletionTarget = {
  id: string;
  profileId: string;
  storagePath: string;
  thumbnailPath: string;
  canonical?: RemoteMediaAsset;
};

const snapshotMediaEntries = (backup: CaizenCloudBackup): unknown[] => {
  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) return [];
  const media = (backup.data as { media?: unknown }).media;
  return Array.isArray(media) ? media : [];
};

let reviewedSnapshot: { backup: CaizenCloudBackup; prepared?: PreparedImport } | null = null;

const reviewedProfileNames = new Map<string, string>();
const reviewedNameKey = (backup: { userId: string; id: string; updatedAt: string; schemaVersion: number }) =>
  JSON.stringify([backup.userId, backup.id, backup.updatedAt, backup.schemaVersion]);
export const rememberReviewedCloudSnapshot = (backup: CaizenCloudBackup, prepared?: PreparedImport): void => {
  reviewedSnapshot = { backup, prepared };
  const name = prepared?.state.profiles[0]?.name?.trim();
  if (name) {
    reviewedProfileNames.set(reviewedNameKey(backup), name);
    if (reviewedProfileNames.size > 32) reviewedProfileNames.delete(reviewedProfileNames.keys().next().value!);
  }
};

export const clearReviewedCloudSnapshot = (): void => {
  reviewedSnapshot = null;
};

const getReviewedCloudSnapshot = (
  userId: string,
  profileId: string,
  expectedBackupId?: string,
  expectedUpdatedAt?: string,
): CaizenCloudBackup | null => {
  const backup = reviewedSnapshot?.backup;
  return backup && expectedBackupId && expectedUpdatedAt &&
    backup.userId === userId && backup.profileId === profileId &&
    backup.id === expectedBackupId && backup.updatedAt === expectedUpdatedAt
    ? backup : null;
};

const collectSnapshotPaths = (
  backup: CaizenCloudBackup,
  userId: string,
  expectedProfileId?: string,
): CloudDeletionTarget[] => {
  const targets: CloudDeletionTarget[] = [];
  for (const value of snapshotMediaEntries(backup)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('The Cloud snapshot contains invalid media metadata; deletion was not started.');
    }
    const item = value as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : '';
    const profileId = typeof item.profileId === 'string' ? item.profileId : '';
    const storagePath = typeof item.remotePath === 'string' ? item.remotePath : '';
    // Pathless legacy entries do not identify a Storage object and can be
    // retired with the snapshot. Once an entry carries any path/identity
    // fragment, however, it must be complete and validated; silently
    // skipping a malformed path could make it eligible for deletion while
    // another active snapshot still depends on it.
    if (!id && !profileId && !storagePath) continue;
    if (!id || !profileId || !storagePath) {
      throw new Error('The Cloud snapshot contains incomplete media path metadata; deletion was not started.');
    }
    if (expectedProfileId && profileId !== expectedProfileId) {
      throw new Error('The Cloud snapshot contains media outside the selected profile.');
    }
    if (!isOwnedCloudStoragePath(storagePath, userId, profileId, id)) {
      throw new Error('The Cloud snapshot media path is outside the signed-in user boundary.');
    }
    targets.push({
      id,
      profileId,
      storagePath,
      thumbnailPath: thumbnailPathForMedia(userId, {
        profileId,
        id,
        storagePath,
      }),
    });
  }
  return targets;
};

const collectActiveSnapshotProtectedPaths = async (
  userId: string,
): Promise<Set<string>> => {
  const protectedPaths = new Set<string>();
  const backups = typeof listCaizenSnapshotMedia === 'function'
    ? await listCaizenSnapshotMedia()
    : (await listCaizenProfileBackups()).map(backup => ({
        ...backup, media: (backup.data as { media?: unknown }).media,
      }));
  for (const backup of backups) {
    if (backup.userId !== userId) continue;
    const reference = { ...backup, data: { media: backup.media } } as CaizenCloudBackup;
    for (const target of collectSnapshotPaths(reference, userId)) {
      protectedPaths.add(target.storagePath);
      protectedPaths.add(target.thumbnailPath);
    }
  }
  return protectedPaths;
};

const assertExpectedCloudRestore = async (
  profileId: string,
  options: Pick<RestoreOptions, 'expectedBackupId' | 'expectedUpdatedAt' | 'expectedUserId' | 'expectedFingerprint'>,
) => {
  const user = await getCloudUser();
  if (!user) throw new Error('Please sign in before restoring Cloud data.');
  if (options.expectedUserId && user.id !== options.expectedUserId) {
    throw new Error('The signed-in Cloud account changed. Review this backup again.');
  }
  if (!options.expectedUpdatedAt && !options.expectedBackupId && !options.expectedFingerprint) return;
  const currentBackup = typeof getCaizenProfileBackupMetadata === 'function'
    ? await getCaizenProfileBackupMetadata(profileId)
    : await getCaizenProfileBackup(profileId);
  if (
    !currentBackup ||
    currentBackup.profileId !== profileId ||
    (options.expectedBackupId && currentBackup.id !== options.expectedBackupId) ||
    (options.expectedUpdatedAt && currentBackup.updatedAt !== options.expectedUpdatedAt) ||
    (options.expectedFingerprint && getCloudRecoveryFingerprint({
      backupId: currentBackup.id,
      profileId: currentBackup.profileId,
      schemaVersion: currentBackup.schemaVersion,
      updatedAt: currentBackup.updatedAt,
    }) !== options.expectedFingerprint)
  ) {
    throw new Error('This Cloud backup changed after Review. Review it again before restoring.');
  }
};

const collectReferencedMediaIds = (
  value: unknown,
  knownIds: Set<string>,
  output = new Set<string>(),
): Set<string> => {
  if (typeof value === 'string') {
    if (knownIds.has(value)) output.add(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((child) => collectReferencedMediaIds(child, knownIds, output));
    return output;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((child) =>
      collectReferencedMediaIds(child, knownIds, output),
    );
  }
  return output;
};

/** Returns referenced local media that still needs a Cloud transfer. */
export const getPendingCloudMediaCount = async (profileId: string): Promise<number> => {
  const state = await loadAppState();
  const profile = state?.profiles.find((item) => item.id === profileId);
  if (!profile) return 0;

  const localMedia = await listMediaAssets(profileId);
  const knownIds = new Set(localMedia.map((asset) => asset.id));
  const referencedIds = collectReferencedMediaIds(profile, knownIds);
  return localMedia.filter(
    (asset) => referencedIds.has(asset.id) && (
      asset.cloudExcluded ? Boolean(asset.remotePath) : asset.syncStatus !== 'synced'
    ),
  ).length;
};

const sha256 = async (blob: Blob) => {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
};

const stableUuid = async (seed: string) => {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)),
  ).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const extensionForMime = (mimeType: string) =>
  CLOUD_EXTENSION_BY_MIME[mimeType] ?? 'bin';

const isTemporarySignedUrl = (value: string) => {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.pathname.includes('/storage/v1/object/sign/') ||
      url.searchParams.has('token') ||
      url.searchParams.has('X-Amz-Signature')
    );
  } catch {
    return false;
  }
};

const appendAssetId = (record: Record<string, unknown>, key: string, id: string) => {
  const current = Array.isArray(record[key])
    ? record[key].filter((value): value is string => typeof value === 'string')
    : [];
  if (!current.includes(id)) record[key] = [...current, id];
};

const legacyCandidate = async ({
  value,
  profileId,
  recordType,
  recordId,
  label,
  applySnapshotReference,
}: {
  value: unknown;
  profileId: string;
  recordType: string;
  recordId: string;
  label: string;
  applySnapshotReference: (id: string) => void;
}): Promise<{ candidate?: MediaUploadCandidate; issue?: CaizenMediaTransferFailure }> => {
  if (
    typeof value !== 'string' ||
    (!LEGACY_MEDIA_VALUE.test(value) && !isTemporarySignedUrl(value))
  ) return {};
  if (!/^(?:data:[^;,]+;base64,|blob:)/i.test(value)) {
    return {
      issue: failure(
        'legacy',
        `${label} uses a temporary device path that cannot be safely reopened. The local value was preserved.`,
      ),
    };
  }

  try {
    const response = await fetch(value);
    if (!response.ok) throw new Error('the temporary value is no longer readable');
    const blob = await response.blob();
    if (!CLOUD_MEDIA_MIME_TYPES.has(blob.type)) {
      throw new Error(`unsupported file type ${blob.type || 'unknown'}`);
    }
    await validateMediaBlob(blob, `legacy.${extensionForMime(blob.type)}`);
    const checksum = await sha256(blob);
    const id = await stableUuid(`${profileId}:${recordType}:${recordId}:${label}:${checksum}`);
    const originalName = `legacy-${recordType}-${recordId}.${extensionForMime(blob.type)}`;
    return {
      candidate: {
        input: {
          id,
          profileId,
          recordType,
          recordId,
          role: 'primary',
          originalName,
          mimeType: blob.type,
          sizeBytes: blob.size,
          checksum,
        },
        read: async () => blob,
        applySnapshotReference: () => applySnapshotReference(id),
      },
    };
  } catch (error) {
    return {
      issue: failure(
        'legacy',
        `${label} could not be converted: ${errorMessage(error)}. The local value was preserved.`,
      ),
    };
  }
};

const buildLegacyCandidates = async (
  source: Profile,
  snapshot: Profile,
): Promise<{ candidates: MediaUploadCandidate[]; failures: CaizenMediaTransferFailure[] }> => {
  const candidates: MediaUploadCandidate[] = [];
  const failures: CaizenMediaTransferFailure[] = [];
  const handledValues = new Set<string>();
  const add = async (
    value: unknown,
    recordType: string,
    recordId: string,
    label: string,
    applySnapshotReference: (id: string) => void,
  ) => {
    if (
      typeof value === 'string' &&
      (LEGACY_MEDIA_VALUE.test(value) || isTemporarySignedUrl(value))
    ) handledValues.add(value);
    const result = await legacyCandidate({
      value,
      profileId: source.id,
      recordType,
      recordId,
      label,
      applySnapshotReference,
    });
    if (result.candidate) candidates.push(result.candidate);
    if (result.issue) failures.push(result.issue);
  };

  for (const [collection, recordType, imageKey] of [
    ['inventoryItems', 'inventory', 'image'],
    ['wishlistItems', 'wishlist', 'image'],
  ] as const) {
    const sourceRecords = source[collection] as unknown as Array<Record<string, unknown>>;
    const snapshotRecords = snapshot[collection] as unknown as Array<Record<string, unknown>>;
    for (const sourceRecord of sourceRecords) {
      const recordId = String(sourceRecord.id || 'unknown');
      const snapshotRecord = snapshotRecords.find((record) => record.id === recordId);
      if (!snapshotRecord) continue;
      const legacyValue = sourceRecord[imageKey];
      await add(
        legacyValue,
        recordType,
        recordId,
        `${collection}.${recordId}.${imageKey}`,
        (id) => appendAssetId(snapshotRecord, 'photoAssetIds', id),
      );
    }
  }

  const reportUnsupported = (value: unknown, path = 'profile') => {
    if (typeof value === 'string') {
      if (
        (LEGACY_MEDIA_VALUE.test(value) || isTemporarySignedUrl(value)) &&
        !handledValues.has(value)
      ) {
        failures.push(failure(
          'legacy',
          `${path} contains legacy media without a stable asset field. It was omitted from the cloud snapshot and left unchanged locally.`,
        ));
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => reportUnsupported(child, `${path}.${index}`));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, child]) =>
        reportUnsupported(child, `${path}.${key}`),
      );
    }
  };
  reportUnsupported(source);

  return { candidates, failures };
};

let cachedCloudUser: User | null | undefined;
let cloudUserLookup: Promise<User | null> | null = null;
let cloudUserCacheGeneration = 0;

const invalidateCloudUserCache = (): void => {
  cloudUserCacheGeneration += 1;
  cachedCloudUser = undefined;
  cloudUserLookup = null;
};

export const invalidateCloudSession = async (): Promise<void> => {
  reviewedSnapshot = null;
  invalidateCloudUserCache();
  if (typeof invalidateCaizenCloudUserCache === 'function') {
    invalidateCaizenCloudUserCache();
  }
  await invalidateMediaSession();
};

export const getCloudUser = async (): Promise<User | null> => {
  if (isMediaSessionSuspended()) return null;
  if (cachedCloudUser !== undefined) return cachedCloudUser;
  if (cloudUserLookup) return cloudUserLookup;

  const lookupGeneration = cloudUserCacheGeneration;
  const lookup = (async () => {
    const supabase = getSupabaseClient();
    const {
      data,
      error,
    } = await supabase.auth.getUser();

    if (error) throw new Error(error.message);
    if (lookupGeneration !== cloudUserCacheGeneration) return null;

    cachedCloudUser = data.user;
    setMediaSessionUser(data.user?.id ?? null);
    return data.user;
  })();
  cloudUserLookup = lookup;
  try {
    return await lookup;
  } finally {
    if (cloudUserLookup === lookup) cloudUserLookup = null;
  }
};

const assertExpectedCloudBackup = async (
  profileId: string,
  options: Pick<BackupOptions, 'expectedBackupId' | 'expectedUpdatedAt' | 'expectedFingerprint' | 'expectedUserId' | 'expectedProfileId' | 'expectedLocalModifiedAt'>,
  observed?: CaizenCloudBackup | null,
) => {
  const user = await getCloudUser();
  if (!user) throw new Error('Please sign in before backing up Cloud data.');
  if (options.expectedUserId && user.id !== options.expectedUserId) {
    throw new Error('The signed-in Cloud account changed before backup completed.');
  }
  if (options.expectedProfileId && options.expectedProfileId !== profileId) {
    throw new Error('The selected local profile changed before backup completed.');
  }
  if (options.expectedLocalModifiedAt !== undefined && await getLocalProfileModifiedAt(profileId) !== options.expectedLocalModifiedAt) {
    throw new Error('The local profile changed after Review. Review before replacing Cloud data.');
  }
  if (!options.expectedBackupId && options.expectedUpdatedAt === undefined && !options.expectedFingerprint) return;
  const currentBackup = observed === undefined
    ? typeof getCaizenProfileBackupMetadata === 'function'
      ? await getCaizenProfileBackupMetadata(profileId)
      : await getCaizenProfileBackup(profileId)
    : observed;
  if (options.expectedUpdatedAt === null) {
    if (currentBackup) throw new Error('A Cloud backup appeared after the review. Refresh before publishing.');
    return;
  }
  if (
    !currentBackup ||
    currentBackup.profileId !== profileId ||
    (options.expectedBackupId && currentBackup.id !== options.expectedBackupId) ||
    (options.expectedUpdatedAt && currentBackup.updatedAt !== options.expectedUpdatedAt) ||
    (options.expectedFingerprint && getCloudRecoveryFingerprint({
      backupId: currentBackup.id,
      profileId: currentBackup.profileId,
      schemaVersion: currentBackup.schemaVersion,
      updatedAt: currentBackup.updatedAt,
    }) !== options.expectedFingerprint)
  ) {
    throw new Error('This Cloud backup changed after Review. Review it again before publishing the device version.');
  }
};

/** Resumes Cloud-derived media work after an authenticated session is known. */
export const resumeCloudMediaSession = (userId: string): void => {
  setMediaSessionUser(userId);
};

export const getRestoredCloudUser = async () => {
  const supabase = getSupabaseClient();
  const {
    data,
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  const user = data.session?.user ?? null;
  if (user && cachedCloudUser?.id !== user.id) {
    await invalidateCloudSession();
  }
  if (user) {
    cachedCloudUser = user;
    setMediaSessionUser(user.id);
  } else {
    await invalidateCloudSession();
  }
  return user;
};

export const signUpForCloudSync = async (
  email: string,
  password: string
) => {
  assertCloudAuthOutsideDemo();
  await cancelCloudGoogleSignIn();
  assertCloudAuthOutsideDemo();
  await invalidateCloudSession();
  await clearCloudMediaCache();
  const supabase = getSupabaseClient();
  const {
    data,
    error,
  } = await withCloudAuthLock(() => supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getCloudAuthRedirectUrl(),
    },
  }));

  if (error) {
    throw new Error(error.message);
  }

  invalidateCloudUserCache();
  setMediaSessionUser(data.user?.id ?? null);
  return data.user;
};

export const signInToCloudSync = async (
  email: string,
  password: string
) => {
  assertCloudAuthOutsideDemo();
  await cancelCloudGoogleSignIn();
  assertCloudAuthOutsideDemo();
  await invalidateCloudSession();
  await clearCloudMediaCache();
  const supabase = getSupabaseClient();
  const {
    data,
    error,
  } = await withCloudAuthLock(() => supabase.auth.signInWithPassword({
    email,
    password,
  }));

  if (error) {
    throw new Error(error.message);
  }

  invalidateCloudUserCache();
  cachedCloudUser = data.user;
  setMediaSessionUser(data.user?.id ?? null);
  return data.user;
};

export const signOutFromCloudSync = async () => {
  await cancelCloudGoogleSignIn();
  // Fence and drain Cloud work before clearing the rebuildable cache. This
  // prevents a late Account A resolver from writing after sign-out or after a
  // subsequent Account B sign-in. Assets without remotePath remain
  // authoritative local media and are never touched.
  await invalidateCloudSession();
  let cleanupError: unknown = null;
  try {
    await clearCloudMediaCache();
  } catch (error) {
    cleanupError = error;
  }
  const supabase = getSupabaseClient();
  const { error } =
    await withCloudAuthLock(() => supabase.auth.signOut());

  if (error) {
    throw new Error(error.message);
  }
  if (cleanupError) throw cleanupError;
};

export const requestCloudPasswordReset = async (email: string) => {
  assertCloudAuthOutsideDemo();
  await cancelCloudGoogleSignIn();
  assertCloudAuthOutsideDemo();
  const supabase = getSupabaseClient();
  const { error } = await withCloudAuthLock(() => supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getCloudAuthRedirectUrl(),
  }));
  if (error) throw new Error(error.message);
};

const backupLocalDataToCloudInternal = async (
  options: BackupOptions = {}
): Promise<CaizenBackupResult> => {
  const user = await getCloudUser();

  if (!user) {
    throw new Error(
      'Please sign in before backing up.'
    );
  }
  if (options.expectedUserId && options.expectedUserId !== user.id) {
    throw new Error('The signed-in Cloud account changed before backup began.');
  }

  const localState = await loadAppState();
  if (!localState) {
    throw new Error(
      'No local data found to back up.'
    );
  }
  const profile = localState.profiles.find(
    (item) => item.id === localState.currentProfileId,
  );
  if (!profile) throw new Error('The selected profile could not be loaded.');
  if (options.expectedProfileId && options.expectedProfileId !== profile.id) {
    throw new Error('The selected local profile changed before backup began.');
  }
  if (options.mode === 'auto') {
    const consent = getCloudAutoBackupState({ userId: user.id, profileId: profile.id });
    if (!consent.enabled || !consent.eligible) throw new Error('Automatic Cloud Backup needs consent and a complete manual backup for this account.');
  }
  const capturedProfile = JSON.stringify(profile);
  const capturedLocalModifiedAt = await getLocalProfileModifiedAt(profile.id);
  if (options.expectedLocalModifiedAt !== undefined && capturedLocalModifiedAt !== options.expectedLocalModifiedAt) {
    throw new Error('The local profile changed after Review. Review the backup again before replacing Cloud data.');
  }
  const session = getMediaSessionToken(user.id);
  if (!isMediaSessionCurrent(session)) throw new MediaSessionInvalidatedError();

  // Capture the Cloud baseline before any media work begins. The final
  // structured write uses this exact timestamp as a compare-and-swap guard so
  // a slower device cannot overwrite a newer snapshot.
  const existingBackup = await getCaizenProfileBackup(profile.id);
  await assertExpectedCloudBackup(profile.id, options, existingBackup);

  options.onProgress?.({
    operation: 'backup',
    phase: 'preparing',
    completed: 0,
    total: 0,
    message: `Preparing ${profile.name || 'selected profile'}…`,
  });

  if (!options.force) {
    const localModifiedAt = await getLocalProfileModifiedAt(profile.id);
    const marker = getCloudSyncMarker(user.id, profile.id);
    const cloudMatchesBaseline = Boolean(existingBackup && marker?.cloudUpdatedAt === existingBackup.updatedAt);
    const localMatchesBaseline = Boolean(cloudMatchesBaseline && localModifiedAt === marker?.localUpdatedAt);

    if (options.mode === 'auto' && (!existingBackup || !marker)) {
      throw new Error(
        'Automatic Cloud Backup needs a reviewed baseline for this Cloud account and profile.',
      );
    }

    if (
      existingBackup && !cloudMatchesBaseline && localModifiedAt !== existingBackup.updatedAt
    ) {
      throw new Error(
        'The Cloud backup changed or its comparison is unknown. Review before replacing it.'
      );
    }

    if (
      options.mode === 'auto' &&
      existingBackup?.updatedAt &&
      localModifiedAt && localMatchesBaseline &&
      !options.retryMedia
    ) {
      return {
        status: 'skipped',
        backupId: existingBackup.id,
        profileId: existingBackup.profileId,
        schemaVersion: existingBackup.schemaVersion,
        updatedAt: existingBackup.updatedAt,
        uploadedFileCount: 0,
        skippedFileCount: 0,
        deletedFileCount: 0,
        failedMedia: [],
      };
    }
  }

  const legacyMigrationFailures = await migrateLegacyInlineMedia(localState, profile);
  const exportState = await loadAppState();
  if (!exportState) throw new Error('Local data changed before backup preparation finished.');
  const localMedia = await listMediaAssets(profile.id);
  const portable = typeof createDataOnlyEnvelope === 'function'
    ? createDataOnlyEnvelope(exportState, localMedia) as unknown as PortableEnvelope
    : JSON.parse(await (await createDataOnlyExport()).text()) as PortableEnvelope;
  const snapshotProfile = portable.data.profiles.find(
    (item) => item.id === profile.id,
  );
  if (!snapshotProfile) {
    throw new Error('The selected profile was missing from the serialized backup.');
  }

  portable.data = {
    profiles: [snapshotProfile],
    currentProfileId: profile.id,
  };

  const localMediaById = new Map(localMedia.map((asset) => [asset.id, asset]));
  const referencedIds = collectReferencedMediaIds(
    snapshotProfile,
    new Set(localMediaById.keys()),
  );
  const referencedLocalMedia = localMedia.filter((asset) => referencedIds.has(asset.id));
  const uploadableReferencedMedia = referencedLocalMedia.filter((asset) => !asset.cloudExcluded);
  portable.media = portable.media.filter(
    (asset) => asset.profileId === profile.id &&
      referencedIds.has(asset.id) &&
      !localMediaById.get(asset.id)?.cloudExcluded,
  );

  const failures: CaizenMediaTransferFailure[] = [...legacyMigrationFailures];
  const candidates: MediaUploadCandidate[] = uploadableReferencedMedia.map((asset) => ({
    input: {
      id: asset.id,
      profileId: asset.profileId,
      recordType: asset.ownerType,
      recordId: asset.ownerId,
      role: asset.role,
      originalName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      checksum: asset.checksum ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
    },
    read: () => mediaStorage.read(asset.id, asset.profileId),
    localAsset: asset,
  }));
  const legacy = await buildLegacyCandidates(profile, snapshotProfile);
  candidates.push(...legacy.candidates);
  failures.push(...legacy.failures);

  // The deployed snapshot constraint is 10 MiB. Leave headroom for staged
  // Storage paths and status fields added to the envelope during this attempt.
  if (serializedSize(portable) + candidates.length * 512 > 10 * 1024 * 1024) {
    throw new Error('This profile snapshot exceeds the Cloud size limit. Local data remains available.');
  }

  const remoteMedia = await listCaizenMediaAssets(profile.id);
  const remoteById = new Map(remoteMedia.map((asset) => [asset.id, asset]));
  const snapshotMediaById = new Map<string, SnapshotMediaReference>();
  if (existingBackup) {
    for (const item of snapshotMediaEntries(existingBackup)) {
      try {
        const reference = asSnapshotMediaReference(item, user.id, profile.id);
        if (!snapshotMediaById.has(reference.id)) snapshotMediaById.set(reference.id, reference);
      } catch {
        // An older/partial snapshot entry is not a safe reuse candidate. The
        // current backup will stage a fresh object when local bytes exist.
      }
    }
  }
  const retainedIds = new Set(
    [...referencedIds].filter((id) => !localMediaById.get(id)?.cloudExcluded),
  );
  // A lock is committed only after local residency is confirmed in the UI.
  // Keep an older remote copy retained if local bytes later go missing (for
  // example, after importing a data-only export); deleting it would lose the
  // only surviving copy. A later backup can retire it after local restore.
  for (const asset of referencedLocalMedia) {
    if (!asset.cloudExcluded || !asset.remotePath) continue;
    const hasLocalCopy = await hasLocalMediaCopy(asset).catch(() => false);
    if (!hasLocalCopy) retainedIds.add(asset.id);
  }
  const backupAttemptId = crypto.randomUUID();
  const stagedMedia: PendingCloudMediaCommit[] = [];
  const repairedMedia: PendingCloudMediaRepair[] = [];
  const failedMediaPublicationIds = new Set<string>();
  const replacedMedia: RemoteMediaAsset[] = [];
  const failedLocalResidencyUpdateIds = new Set<string>();
  const pendingThumbnails: Array<{
    candidate: MediaUploadCandidate;
    storagePath: string;
  }> = [];
  const pendingLocalUpdates: PendingLocalMediaUpdate[] = [];
  let uploadedFileCount = 0;
  let skippedFileCount = 0;
  let deletedFileCount = 0;

  // One authenticated existence probe per path per attempt. Several candidate
  // branches below can name the same object, and repeating that round trip was
  // pure waste.
  const folderContents = new Map<string, Promise<Set<string>>>();
  const objectExists = (
    storagePath: string,
    expected: { profileId: string; mediaAssetId: string },
  ): Promise<boolean> => {
    if (typeof listCaizenPrivateMediaFolder !== 'function') {
      return verifyCloudMediaObjectExists(storagePath, expected);
    }
    const folder = storagePath.split('/').slice(0, 3).join('/');
    let names = folderContents.get(folder);
    if (!names) {
      names = listCaizenPrivateMediaFolder(storagePath, expected);
      folderContents.set(folder, names);
      names.catch(() => folderContents.delete(folder));
    }
    return names.then(entries => entries.has(storagePath.split('/')[3])
      ? true
      : verifyCloudMediaObjectExists(storagePath, expected));
  };

  // Residency and existence probes are independent reads, so a few run at a
  // time instead of one serial round trip per asset. The decisions they
  // produce are applied sequentially below, keeping snapshot ordering and all
  // reuse/replace rules exactly as before.
  let probedCount = 0;
  const probes = await mapWithConcurrency(candidates, async (candidate) => {
    const existing = remoteById.get(candidate.input.id);
    let reusedRemotePath: string | undefined;
    const snapshotReference = snapshotMediaById.get(candidate.input.id);
    let localBytesPresent = !candidate.localAsset;
    let localBytesPresenceKnown = true;
    if (candidate.localAsset) {
      try {
        localBytesPresent = await hasLocalMediaCopy(candidate.localAsset);
      } catch {
        // An inconclusive local-residency check must not permit reuse of a
        // Cloud path when local bytes may still be authoritative.
        localBytesPresent = true;
        localBytesPresenceKnown = false;
      }
    }

    // A prior winning snapshot may already be the only durable copy when its
    // canonical row publication was interrupted. Reuse that verified path and
    // repair the row after the next snapshot CAS instead of requiring local
    // bytes (or uploading a needless replacement).
    if (!existing && candidate.localAsset?.remotePath) {
      const candidatePath = candidate.localAsset.remotePath;
      if (isOwnedCloudStoragePath(
        candidatePath,
        user.id,
        candidate.input.profileId,
        candidate.input.id,
      )) {
        const pathMetadataMatches = !localBytesPresent ||
          candidate.localAsset?.syncStatus === 'synced' ||
          Boolean(snapshotReference && snapshotMediaMatchesCandidate(
            snapshotReference,
            candidate,
            localBytesPresent,
            localBytesPresenceKnown,
          ));
        try {
          if (pathMetadataMatches && await objectExists(candidatePath, {
            profileId: candidate.input.profileId,
            mediaAssetId: candidate.input.id,
          })) {
            reusedRemotePath = candidatePath;
          }
        } catch {
          // An inconclusive check is treated as a repairable upload change.
        }
      }
    }
    if (!reusedRemotePath) {
      if (snapshotReference) {
        if (snapshotMediaMatchesCandidate(
          snapshotReference,
          candidate,
          localBytesPresent,
          localBytesPresenceKnown,
        )) {
          try {
            if (await objectExists(snapshotReference.storagePath, {
              profileId: candidate.input.profileId,
              mediaAssetId: candidate.input.id,
            })) {
              reusedRemotePath = snapshotReference.storagePath;
            }
          } catch {
            // An inconclusive existence check is treated as a repairable upload
            // change, not as authority to publish a dead path.
          }
        }
      }
    }

    let unchanged = Boolean(
      existing &&
      existing.mimeType === candidate.input.mimeType &&
      existing.sizeBytes === candidate.input.sizeBytes &&
      (
        candidate.input.checksum
          ? existing.checksum === candidate.input.checksum
          : existing.originalName === candidate.input.originalName
      ),
    );

    if (unchanged && existing) {
      try {
        unchanged = await objectExists(existing.storagePath, {
          profileId: candidate.input.profileId,
          mediaAssetId: candidate.input.id,
        });
      } catch {
        // An inconclusive existence check is treated as a repairable change.
        unchanged = false;
      }
    }

    probedCount += 1;
    options.onProgress?.({
      operation: 'backup',
      phase: 'media',
      completed: probedCount,
      total: candidates.length,
      message: `Checking file ${probedCount} of ${candidates.length}…`,
    });
    return {
      existing,
      reusedRemotePath,
      unchanged,
      localBytesPresent,
      localBytesPresenceKnown,
    };
  });

  type MediaUploadTask = {
    candidate: MediaUploadCandidate;
    existing?: RemoteMediaAsset;
    storagePath: string;
    thumbnailPath: string;
  };
  const uploadTasks: MediaUploadTask[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const {
      existing,
      reusedRemotePath,
      unchanged,
      localBytesPresent,
      localBytesPresenceKnown,
    } = probes[index];

    if (unchanged) {
      skippedFileCount += 1;
      retainedIds.add(candidate.input.id);
      candidate.applySnapshotReference?.();
      if (candidate.localAsset && existing) {
        const portableAsset = portable.media.find((asset) => asset.id === candidate.input.id);
        if (portableAsset) {
          portableAsset.remotePath = existing.storagePath;
          portableAsset.syncStatus = 'synced';
        } else if (existing) {
          const now = new Date().toISOString();
          portable.media.push({
            id: candidate.input.id,
            profileId: candidate.input.profileId,
            ownerType: candidate.input.recordType as MediaAsset['ownerType'],
            ownerId: candidate.input.recordId,
            role: candidate.input.role,
            fileName: candidate.input.originalName,
            mimeType: candidate.input.mimeType,
            sizeBytes: candidate.input.sizeBytes,
            width: candidate.input.width ?? undefined,
            height: candidate.input.height ?? undefined,
            remotePath: existing.storagePath,
            checksum: candidate.input.checksum ?? undefined,
            syncStatus: 'synced',
            createdAt: now,
            updatedAt: now,
          });
        }
        pendingLocalUpdates.push({
          asset: candidate.localAsset,
          remotePath: existing.storagePath,
        });
        pendingThumbnails.push({
          candidate,
          storagePath: thumbnailPathForMedia(user.id, existing),
        });
      }
      continue;
    }

    if (reusedRemotePath) {
      skippedFileCount += 1;
      retainedIds.add(candidate.input.id);
      candidate.applySnapshotReference?.();
      const portableAsset = portable.media.find((asset) => asset.id === candidate.input.id);
      if (portableAsset) {
        portableAsset.remotePath = reusedRemotePath;
        portableAsset.syncStatus = 'synced';
      } else {
        const now = new Date().toISOString();
        portable.media.push({
          id: candidate.input.id,
          profileId: candidate.input.profileId,
          ownerType: candidate.input.recordType as MediaAsset['ownerType'],
          ownerId: candidate.input.recordId,
          role: candidate.input.role,
          fileName: candidate.input.originalName,
          mimeType: candidate.input.mimeType,
          sizeBytes: candidate.input.sizeBytes,
          width: candidate.input.width ?? undefined,
          height: candidate.input.height ?? undefined,
          remotePath: reusedRemotePath,
          checksum: candidate.input.checksum ?? undefined,
          syncStatus: 'synced',
          createdAt: now,
          updatedAt: now,
        });
      }
      repairedMedia.push({ candidate, storagePath: reusedRemotePath });
      if (candidate.localAsset) {
        pendingLocalUpdates.push({
          asset: candidate.localAsset,
          remotePath: reusedRemotePath,
        });
      }
      if (localBytesPresent && localBytesPresenceKnown) {
        pendingThumbnails.push({
          candidate,
          storagePath: thumbnailPathForMedia(user.id, {
            profileId: candidate.input.profileId,
            id: candidate.input.id,
            storagePath: reusedRemotePath,
          }),
        });
      }
      continue;
    }

    // Do not carry a previously recorded path into the new winning snapshot
    // when its object could not be verified. A new staged upload below may
    // replace it; a read/upload failure must leave the entry pending instead
    // of publishing a dead remotePath.
    if (candidate.localAsset?.remotePath) {
      const portableAsset = portable.media.find((asset) => asset.id === candidate.input.id);
      if (portableAsset) {
        portableAsset.remotePath = undefined;
        portableAsset.syncStatus = 'pending';
      }
    }

    if (!CLOUD_MEDIA_MIME_TYPES.has(candidate.input.mimeType)) {
      failures.push(failure(
        'upload',
        `Cloud Storage does not accept ${candidate.input.mimeType || 'this file type'}.`,
        candidate.input.id,
        candidate.input.originalName,
      ));
      continue;
    }

    uploadTasks.push({
      candidate,
      existing,
      storagePath: buildStagedMediaStoragePath(
        user.id,
        candidate.input.profileId,
        candidate.input.id,
        candidate.input.mimeType,
        backupAttemptId,
      ),
      thumbnailPath: `${user.id}/${candidate.input.profileId}/${candidate.input.id}/${candidate.input.id}-thumbnail-staged-${backupAttemptId}.webp`,
    });
  }

  // Staged uploads target a per-attempt path that is unique to one asset, so
  // running a few at a time cannot collide. Every failure still compensates its
  // own staged object, and nothing is published until the snapshot CAS below.
  let uploadedCount = 0;
  const uploadResults = await mapWithConcurrency(uploadTasks, async (task) => {
    const { candidate, storagePath, thumbnailPath: stagedThumbnailPath } = task;
    const finish = () => {
      uploadedCount += 1;
      options.onProgress?.({
        operation: 'backup',
        phase: 'media',
        completed: uploadedCount,
        total: uploadTasks.length,
        message: `Backing up file ${uploadedCount} of ${uploadTasks.length}…`,
      });
    };

    let blob: Blob;
    try {
      blob = await candidate.read();
      await validateMediaBlob(blob, candidate.input.originalName);
    } catch (error) {
      failures.push(failure(
        'read',
        errorMessage(error),
        candidate.input.id,
        candidate.input.originalName,
      ));
      finish();
      return false;
    }

    try {
      await uploadCaizenPrivateMedia(
        storagePath,
        blob,
        candidate.input.mimeType,
        {
          profileId: candidate.input.profileId,
          mediaAssetId: candidate.input.id,
        },
      );
    } catch (error) {
      failures.push(failure(
        'upload',
        errorMessage(error),
        candidate.input.id,
        candidate.input.originalName,
      ));
      await deleteCaizenPrivateMedia(storagePath, {
        profileId: candidate.input.profileId,
        mediaAssetId: candidate.input.id,
      }).catch(() => undefined);
      finish();
      return false;
    }

    try {
      await uploadCloudThumbnail(
        user.id,
        candidate.input.profileId,
        candidate.input.id,
        blob,
        stagedThumbnailPath,
      );
    } catch (error) {
      failures.push(failure(
        'upload',
        `Thumbnail upload failed: ${errorMessage(error)}`,
        candidate.input.id,
        candidate.input.originalName,
      ));
    }
    finish();
    return true;
  });

  // Snapshot/bookkeeping mutations stay sequential and in candidate order so
  // the serialized envelope is unaffected by upload completion order.
  for (let index = 0; index < uploadTasks.length; index += 1) {
    if (!uploadResults[index]) continue;
    const { candidate, existing, storagePath, thumbnailPath: stagedThumbnailPath } = uploadTasks[index];
    try {
      stagedMedia.push({
        candidate,
        existing,
        storagePath,
        thumbnailPath: stagedThumbnailPath,
      });
      candidate.applySnapshotReference?.();
      const portableAsset = portable.media.find((asset) => asset.id === candidate.input.id);
      if (portableAsset) {
        portableAsset.remotePath = storagePath;
        portableAsset.syncStatus = 'synced';
      } else {
        const now = new Date().toISOString();
        portable.media.push({
          id: candidate.input.id,
          profileId: candidate.input.profileId,
          ownerType: candidate.input.recordType as MediaAsset['ownerType'],
          ownerId: candidate.input.recordId,
          role: candidate.input.role,
          fileName: candidate.input.originalName,
          mimeType: candidate.input.mimeType,
          sizeBytes: candidate.input.sizeBytes,
          width: candidate.input.width ?? undefined,
          height: candidate.input.height ?? undefined,
          remotePath: storagePath,
          checksum: candidate.input.checksum ?? undefined,
          syncStatus: 'synced',
          createdAt: now,
          updatedAt: now,
        });
      }
      if (candidate.localAsset) {
        pendingLocalUpdates.push({
          asset: candidate.localAsset,
          remotePath: storagePath,
        });
      }
    } catch (error) {
      failures.push(failure(
        'metadata',
        errorMessage(error),
        candidate.input.id,
        candidate.input.originalName,
      ));
      await Promise.all([
        deleteCaizenPrivateMedia(storagePath, {
          profileId: candidate.input.profileId,
          mediaAssetId: candidate.input.id,
        }).catch(() => undefined),
        deleteCaizenPrivateMedia(stagedThumbnailPath, {
          profileId: candidate.input.profileId,
          mediaAssetId: candidate.input.id,
        }).catch(() => undefined),
      ]);
    }
  }

  const updatedAt = new Date().toISOString();
  portable.createdAt = updatedAt;
  options.onProgress?.({
    operation: 'backup',
    phase: 'snapshot',
    completed: candidates.length,
    total: candidates.length,
    message: 'Saving the profile snapshot…',
  });
  const serializedEnvelope = JSON.parse(
    JSON.stringify(portable),
  ) as Record<string, unknown>;
  let backup: Awaited<ReturnType<typeof upsertCaizenProfileBackup>>;
  try {
    if (!isMediaSessionCurrent(session)) throw new MediaSessionInvalidatedError();
    const selectedNow = await loadAppState();
    if (selectedNow?.currentProfileId !== profile.id) {
      throw new Error('The selected local profile changed while Cloud media was uploading.');
    }
    await assertExpectedCloudBackup(profile.id, options);
    if (!isMediaSessionCurrent(session)) throw new MediaSessionInvalidatedError();
    // Canonical media metadata and objects are committed only after this CAS
    // succeeds. A losing device has only isolated staged objects to clean up.
    backup = await upsertCaizenProfileBackup({
      profileId: profile.id,
      schemaVersion: CAIZEN_BACKUP_SCHEMA_VERSION,
      data: serializedEnvelope,
      expectedUpdatedAt: existingBackup?.updatedAt ?? null,
    });
  } catch (error) {
    // A lost response does not prove CAS failed. Keep staged objects whenever
    // publication cannot be ruled out, so a winning snapshot never loses media.
    const current = await getCaizenProfileBackup(profile.id).catch(() => undefined);
    const knownUnpublished = current !== undefined && !stagedMedia.some(item =>
      (current ? snapshotMediaEntries(current) : []).some(value =>
        value && typeof value === 'object' &&
        (value as { remotePath?: unknown }).remotePath === item.storagePath,
      ),
    );
    if (knownUnpublished) {
      await Promise.all(stagedMedia.flatMap((item) => [
        deleteCaizenPrivateMedia(item.storagePath, {
          profileId: item.candidate.input.profileId,
          mediaAssetId: item.candidate.input.id,
        }).catch(() => undefined),
        deleteCaizenPrivateMedia(item.thumbnailPath, {
          profileId: item.candidate.input.profileId,
          mediaAssetId: item.candidate.input.id,
        }).catch(() => undefined),
      ]));
    }
    throw error;
  }

  const finishAfterSessionChange = (): CaizenBackupResult => ({
    status: 'partial', backupId: backup.id, profileId: backup.profileId,
    schemaVersion: backup.schemaVersion, updatedAt: backup.updatedAt,
    uploadedFileCount, skippedFileCount, deletedFileCount,
    failedMedia: [...failures, failure('metadata', 'The snapshot was published, but account changes stopped remaining media work.')],
  });
  if (!isMediaSessionCurrent(session)) return finishAfterSessionChange();

  // Repair canonical rows for already-verified snapshot objects only after the
  // snapshot CAS. A failed repair leaves the winning snapshot/path intact and
  // keeps local residency pending for the next reconciliation.
  const publications = [
    ...repairedMedia.map(item => ({ ...item, existing: undefined as RemoteMediaAsset | undefined, staged: false })),
    ...stagedMedia.map(item => ({ ...item, staged: true })),
  ];
  const publicationResults = await mapWithConcurrency(publications, async item => {
    try {
      if (!isMediaSessionCurrent(session)) throw new MediaSessionInvalidatedError();
      return { asset: await upsertCaizenMediaAsset({
        ...item.candidate.input,
        storagePath: item.storagePath,
      }) };
    } catch (error) {
      return { error };
    }
  });
  publicationResults.forEach((result, index) => {
    const item = publications[index];
    if (!result.asset) {
      failures.push(failure('metadata', errorMessage(result.error), item.candidate.input.id, item.candidate.input.originalName));
      // CAS succeeded: these objects remain snapshot-owned even on row failure.
      failedMediaPublicationIds.add(item.candidate.input.id);
      return;
    }
    const cloudAsset = result.asset;
    retainedIds.add(item.candidate.input.id);
    remoteById.set(cloudAsset.id, cloudAsset);
    if (item.staged) uploadedFileCount += 1;
    if (item.staged && item.existing && item.existing.storagePath !== cloudAsset.storagePath) {
      replacedMedia.push(item.existing);
    }
    const localUpdate = pendingLocalUpdates.find(pending => pending.asset.id === item.candidate.input.id);
    if (localUpdate) localUpdate.updatedAt = cloudAsset.updatedAt;
  });
  if (!isMediaSessionCurrent(session)) return finishAfterSessionChange();

  for (const pending of pendingLocalUpdates) {
    const publicationFailed = failedMediaPublicationIds.has(pending.asset.id);
    await withMediaSessionCommit(session, () => putMediaAsset({
      ...pending.asset,
      ...(publicationFailed
        ? {
            remotePath: undefined,
            syncStatus: 'pending' as const,
          }
        : {
            remotePath: pending.remotePath,
            syncStatus: 'synced' as const,
            ...(pending.updatedAt ? { updatedAt: pending.updatedAt } : {}),
          }),
    })).catch((error) => {
      failedLocalResidencyUpdateIds.add(pending.asset.id);
      failures.push(failure(
        'metadata',
        errorMessage(error),
        pending.asset.id,
        pending.asset.fileName,
      ));
    });
  }
  if (!isMediaSessionCurrent(session)) return finishAfterSessionChange();

  for (const replacement of replacedMedia) {
    try {
      if (!isMediaSessionCurrent(session)) return finishAfterSessionChange();
      if (failedLocalResidencyUpdateIds.has(replacement.id)) {
        failures.push(failure(
          'delete',
          'The superseded media object was retained because local Cloud metadata could not be updated safely.',
          replacement.id,
          replacement.originalName,
        ));
        continue;
      }
      const protectedPaths = await collectActiveSnapshotProtectedPaths(user.id);
      const replacementPaths = new Set([
        replacement.storagePath,
        thumbnailPathForMedia(user.id, replacement),
      ]);
      if ([...replacementPaths].some(path => protectedPaths.has(path))) {
        failures.push(failure(
          'delete',
          'The superseded media object is still referenced by an active Cloud snapshot; cleanup was skipped.',
          replacement.id,
          replacement.originalName,
        ));
        continue;
      }
      // The new version is already canonical in metadata and the winning
      // snapshot. Only then is the superseded object safe to remove.
      await deleteCloudMediaObjects(user.id, replacement);
    } catch (error) {
      failures.push(failure(
        'delete',
        errorMessage(error),
        replacement.id,
        replacement.originalName,
      ));
    }
  }

  const obsolete = remoteMedia.filter((asset) => !retainedIds.has(asset.id));
  for (const asset of obsolete) {
    try {
      if (!isMediaSessionCurrent(session)) return finishAfterSessionChange();
      const protectedPaths = await collectActiveSnapshotProtectedPaths(user.id);
      if (
        protectedPaths.has(asset.storagePath) ||
        protectedPaths.has(thumbnailPathForMedia(user.id, asset))
      ) {
        failures.push(failure(
          'delete',
          'Obsolete media is still referenced by an active Cloud snapshot; cleanup was skipped.',
          asset.id,
          asset.originalName,
        ));
        continue;
      }
      // Detach any valid local bytes before remote cleanup. If a later Cloud
      // delete fails, the local copy is already authoritative and cannot be
      // evicted by a retry or cache-clear path.
      await clearDeletedCloudLocalMetadata(asset);
      await deleteCloudMediaObjects(user.id, asset);
      // Keep metadata active until the private object is gone. A failed
      // object deletion will therefore be retried by the next reconciliation.
      await softDeleteCaizenMediaAsset(asset.id);
      forgetCloudMediaCacheEntry(asset.id);
      deletedFileCount += 1;
    } catch (error) {
      failures.push(failure(
        'delete',
        errorMessage(error),
        asset.id,
        asset.originalName,
      ));
    }
  }

  // The structured snapshot is the reconciliation baseline even when one or
  // more media files failed. Otherwise our successful snapshot upload is
  // misread as an independent Cloud edit on the next reconciliation.
  try {
    const latestState = await loadAppState();
    const latestProfile = latestState?.profiles.find(item => item.id === profile.id);
    const latestModifiedAt = await getLocalProfileModifiedAt(profile.id);
    let localChangedDuringBackup = latestModifiedAt !== capturedLocalModifiedAt ||
      JSON.stringify(latestProfile) !== capturedProfile;
    if (!isMediaSessionCurrent(session)) throw new MediaSessionInvalidatedError();
    // Close the gap between the final state read and an initial-marker write.
    if (!capturedLocalModifiedAt && await getLocalProfileModifiedAt(profile.id) !== null) {
      localChangedDuringBackup = true;
    }
    const baselineLocalAt = localChangedDuringBackup && latestModifiedAt === capturedLocalModifiedAt
      ? `unpublished:${backup.updatedAt}`
      : capturedLocalModifiedAt ?? backup.updatedAt;
    if (!localChangedDuringBackup && !capturedLocalModifiedAt) {
      localStorage.setItem(LOCAL_MODIFIED_KEY, baselineLocalAt);
      localStorage.setItem(profileStorageKey(LOCAL_PROFILE_MODIFIED_KEY_PREFIX, profile.id), baselineLocalAt);
      await putStoreValue(STORES.settings, { key: 'localModifiedAt', value: baselineLocalAt });
    }
    writeCloudSyncMarker(user.id, profile.id, baselineLocalAt, backup.updatedAt);
    if (failures.length === 0) {
      localStorage.setItem(LAST_SUCCESSFUL_BACKUP_KEY, backup.updatedAt);
      localStorage.setItem(profileStorageKey(LAST_PROFILE_BACKUP_KEY_PREFIX, profile.id), backup.updatedAt);
      if (options.mode !== 'auto') {
        localStorage.setItem(profileStorageKey(MANUAL_BACKUP_KEY_PREFIX, profile.id), backup.updatedAt);
      }
      writeCloudBackupPreferences({ userId: user.id, profileId: profile.id }, {
        lastCompleteBackupAt: backup.updatedAt,
        ...(options.mode !== 'auto' ? { manualBackupCompletedAt: backup.updatedAt } : {}),
        pausedReason: null,
      });
    }
  } catch (error) {
    failures.push(failure('metadata', `The snapshot was published, but local Cloud status needs reconciliation: ${errorMessage(error)}`));
  }

  options.onProgress?.({
    operation: 'backup',
    phase: 'complete',
    completed: candidates.length,
    total: candidates.length,
    message: failures.length ? 'Backup completed with file warnings.' : 'Backup complete.',
  });

  // Full media and the snapshot are already durable. Thumbnail backfill may
  // finish after the core result and is fenced against account changes.
  void mapWithConcurrency(pendingThumbnails, async pending => {
    try {
      if (!isMediaSessionCurrent(session)) return;
      if (await objectExists(pending.storagePath, {
        profileId: pending.candidate.input.profileId,
        mediaAssetId: pending.candidate.input.id,
      })) return;
      if (!isMediaSessionCurrent(session)) return;
      await uploadCloudThumbnail(
        user.id,
        pending.candidate.input.profileId,
        pending.candidate.input.id,
        await pending.candidate.read(),
        pending.storagePath,
      );
    } catch {
      // Optional thumbnail failure does not invalidate verified full media.
    }
  }).catch(() => undefined);

  return {
    status: failures.length ? 'partial' : 'success',
    backupId: backup.id,
    profileId: backup.profileId,
    schemaVersion: backup.schemaVersion,
    updatedAt: backup.updatedAt,
    uploadedFileCount,
    skippedFileCount,
    deletedFileCount,
    failedMedia: failures,
    thumbnailBackfillPendingCount: pendingThumbnails.length,
  };
};

/**
 * Permanently removes one profile's Cloud snapshot and its private media.
 * The snapshot is retired first so Storage cleanup can never leave an active
 * recovery anchor pointing at an object that this operation already removed.
 */
const deleteCloudProfileDataInternal = async (
  profileId: string,
  retryTargets: CloudDeletionRetryTarget[] = [],
  options: { expectedUserId?: string; expectedBackupId?: string; expectedUpdatedAt?: string; expectedCurrentProfileId?: string | null } = {},
): Promise<CaizenCloudDeletionResult> => {
  const user = await getCloudUser();
  if (!user) throw new Error('Please sign in before deleting Cloud data.');
  if (options.expectedUserId && options.expectedUserId !== user.id) throw new Error('The Cloud account changed. Review the backup before deleting.');
  const assertInitiatingProfile = async () => {
    if (options.expectedCurrentProfileId !== undefined && (await loadAppState())?.currentProfileId !== options.expectedCurrentProfileId) {
      throw new Error('The local profile changed. Review the backup before deleting.');
    }
  };
  await assertInitiatingProfile();
  const session = getMediaSessionToken(user.id);

  // Capture the exact snapshot and every canonical row before any destructive
  // operation. This capture is the deletion fence and retry boundary.
  const observedBackup = await getCaizenProfileBackup(profileId);
  if (retryTargets.length === 0 && (options.expectedBackupId || options.expectedUpdatedAt) &&
    (!observedBackup || (options.expectedBackupId && observedBackup.id !== options.expectedBackupId) || (options.expectedUpdatedAt && observedBackup.updatedAt !== options.expectedUpdatedAt))) {
    throw new Error('The Cloud backup changed after confirmation. Refresh before deleting.');
  }
  if (retryTargets.length > 0 && observedBackup) {
    return {
      status: 'partial', profileId, deletedMediaCount: 0,
      failedMedia: [failure('delete', 'A new Cloud snapshot exists. Review it before deleting any further objects.')],
      remainingTargets: retryTargets,
    };
  }
  if (
    observedBackup &&
    (observedBackup.userId !== user.id || observedBackup.profileId !== profileId)
  ) {
    throw new Error('The Cloud snapshot is outside the signed-in user/profile boundary.');
  }
  const remoteMedia = await listCaizenMediaAssets(profileId, { includeDeleted: true });
  const failedMedia: CaizenMediaTransferFailure[] = [];
  let deletedMediaCount = 0;
  const targets = new Map<string, CloudDeletionTarget>();
  const failedTargetKeys = new Set<string>();

  for (const target of retryTargets) {
    if (target.profileId !== profileId ||
      !isOwnedCloudStoragePath(target.storagePath, user.id, profileId, target.id) ||
      target.thumbnailPath !== thumbnailPathForMedia(user.id, target)) {
      throw new Error('A Cloud deletion retry target is outside the selected account/profile boundary.');
    }
    targets.set(`${target.id}:${target.storagePath}`, target);
  }

  if (observedBackup) {
    for (const target of collectSnapshotPaths(observedBackup, user.id, profileId)) {
      targets.set(`${target.id}:${target.storagePath}`, target);
    }
  }

  for (const asset of remoteMedia) {
    if (
      asset.userId !== user.id ||
      asset.profileId !== profileId ||
      !isOwnedCloudStoragePath(asset.storagePath, user.id, profileId, asset.id)
    ) {
      throw new Error('The Cloud media metadata is outside the signed-in user/profile boundary.');
    }
    const target: CloudDeletionTarget = {
      id: asset.id,
      profileId: asset.profileId,
      storagePath: asset.storagePath,
      thumbnailPath: thumbnailPathForMedia(user.id, asset),
      canonical: asset,
    };
    const key = `${target.id}:${target.storagePath}`;
    targets.set(key, { ...targets.get(key), ...target });
  }

  // Re-read immediately before retiring metadata. A changed snapshot is left
  // completely untouched so the caller must review the new Cloud version.
  const latestBackup = await getCaizenProfileBackup(profileId);
  if (
    latestBackup &&
    (latestBackup.userId !== user.id || latestBackup.profileId !== profileId)
  ) {
    throw new Error('The Cloud snapshot is outside the signed-in user/profile boundary.');
  }
  if (
    (observedBackup && (
      !latestBackup ||
      latestBackup.id !== observedBackup.id ||
      latestBackup.updatedAt !== observedBackup.updatedAt
    )) ||
    (!observedBackup && latestBackup)
  ) {
    failedMedia.push(failure(
      'delete',
      'The Cloud snapshot changed while deletion was being prepared. Review it again before deleting.',
      null,
      'Cloud snapshot',
    ));
    return { status: 'partial', profileId, deletedMediaCount, failedMedia, remainingTargets: retryTargets };
  }

  // Retire the authoritative snapshot first. Conditional deletion ensures a
  // concurrent writer cannot replace the snapshot between the two reads.
  if (observedBackup) {
    try {
      await assertInitiatingProfile();
      if (!isMediaSessionCurrent(session)) throw new MediaSessionInvalidatedError();
      await deleteCaizenProfileBackup(profileId, {
        id: observedBackup.id,
        updatedAt: observedBackup.updatedAt,
      });
    } catch (error) {
      failedMedia.push(failure('delete', errorMessage(error), null, 'Cloud snapshot'));
      return { status: 'partial', profileId, deletedMediaCount, failedMedia, remainingTargets: retryTargets };
    }
  }

  // Canonical rows are retired only after the authoritative snapshot is gone.
  // If a row cannot be removed or retired, its objects remain untouched.
  const metadataReady = new Set<string>();
  for (const target of targets.values()) {
    const targetKey = `${target.id}:${target.storagePath}`;
    if (!isMediaSessionCurrent(session)) {
      failedTargetKeys.add(targetKey);
      failedMedia.push(failure('delete', 'The Cloud account changed; remaining deletion was stopped.', target.id));
      continue;
    }
    if (!target.canonical) {
      metadataReady.add(targetKey);
      continue;
    }
    try {
      await deleteCaizenMediaAssetMetadata(target.id, { profileId });
      metadataReady.add(targetKey);
    } catch (deleteError) {
      try {
        await softDeleteCaizenMediaAsset(target.id, { profileId });
        metadataReady.add(targetKey);
      } catch (retireError) {
        failedTargetKeys.add(targetKey);
        failedMedia.push(failure(
          'delete',
          `${errorMessage(deleteError)} ${errorMessage(retireError)}`,
          target.id,
          target.canonical.originalName,
        ));
      }
    }
  }

  // Re-read active snapshots before each target's Storage cleanup. Any path
  // still referenced by another current snapshot is protected and remains a
  // bounded cleanup/P2 candidate instead of being deleted optimistically.
  for (const target of targets.values()) {
    const targetKey = `${target.id}:${target.storagePath}`;
    if (!metadataReady.has(targetKey)) continue;
    if (!isMediaSessionCurrent(session)) {
      failedTargetKeys.add(targetKey);
      failedMedia.push(failure('delete', 'The Cloud account changed; remaining Storage cleanup was stopped.', target.id));
      continue;
    }
    let protectedPaths: Set<string>;
    try {
      protectedPaths = await collectActiveSnapshotProtectedPaths(user.id);
    } catch (error) {
      failedTargetKeys.add(targetKey);
      failedMedia.push(failure(
        'delete',
        `Active snapshot references could not be verified; Storage cleanup was skipped. ${errorMessage(error)}`,
        target.id,
        target.canonical?.originalName ?? null,
      ));
      continue;
    }

    const paths = [target.storagePath, target.thumbnailPath];
    const unprotected = paths.filter(path => !protectedPaths.has(path));
    if (unprotected.length !== paths.length) {
      failedTargetKeys.add(targetKey);
      failedMedia.push(failure(
        'delete',
        'Storage object retained because another active Cloud snapshot references it; cleanup remains a bounded P2 candidate.',
        target.id,
        target.canonical?.originalName ?? null,
      ));
    }

    try {
      // Detach the local Cloud-cache marker first, even when the canonical row
      // was already absent. A valid local copy then remains authoritative if
      // Storage cleanup is interrupted and never retains a dead remotePath.
      await withMediaSessionCommit(session, () => clearCloudLocalRemotePath(target.id, target.profileId, target.storagePath));
      for (const path of unprotected) {
        if (!isMediaSessionCurrent(session)) throw new MediaSessionInvalidatedError();
        await deleteCaizenPrivateMedia(path, {
          profileId: target.profileId,
          mediaAssetId: target.id,
        });
      }
      forgetCloudMediaCacheEntry(target.id);
      if (unprotected.length === paths.length) deletedMediaCount += 1;
    } catch (error) {
      failedTargetKeys.add(targetKey);
      failedMedia.push({
        mediaAssetId: target.id,
        originalName: target.canonical?.originalName ?? null,
        operation: 'delete',
        message: `The snapshot was retired, but Storage cleanup failed; remaining objects are orphaned cleanup (P2). ${errorMessage(error)}`,
      });
    }
  }

  return {
    status: failedMedia.length === 0 ? 'success' : 'partial',
    profileId,
    deletedMediaCount,
    failedMedia,
    remainingTargets: [...targets.values()]
      .filter(target => failedTargetKeys.has(`${target.id}:${target.storagePath}`))
      .map(({ id, profileId: targetProfileId, storagePath, thumbnailPath }) => ({
        id, profileId: targetProfileId, storagePath, thumbnailPath,
      })),
  };
};

type CloudMediaRestoreBatch = {
  remoteMedia: CloudMediaReference[];
  failures: CaizenMediaTransferFailure[];
};

const prepareCloudMediaRestore = async (
  profileId: string,
  backup: CaizenCloudBackup,
): Promise<CloudMediaRestoreBatch> => {
  const failures: CaizenMediaTransferFailure[] = [];
  const remoteMedia: CloudMediaReference[] = [];
  const user = await getCloudUser();
  if (!user) {
    failures.push(failure('metadata', 'Please sign in before restoring Cloud media.'));
    return { remoteMedia, failures };
  }
  const backupData = backup.data && typeof backup.data === 'object' && !Array.isArray(backup.data)
    ? backup.data as { media?: unknown }
    : null;
  const envelopeMedia = Array.isArray(backupData?.media)
    ? backupData.media
    : [];
  const seenIds = new Set<string>();
  type ParsedSnapshotEntry = {
    id: string | null;
    originalName: string | null;
    reference?: CloudMediaReference;
    parseError?: unknown;
  };
  const parsed: ParsedSnapshotEntry[] = [];
  for (const item of envelopeMedia) {
    const itemId = item && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>).id
      : null;
    const originalName = item && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>).fileName
      : null;
    const entry: ParsedSnapshotEntry = {
      id: typeof itemId === 'string' ? itemId : null,
      originalName: typeof originalName === 'string' ? originalName : null,
    };
    try {
      const reference = asSnapshotMediaReference(item, user.id, profileId);
      if (seenIds.has(reference.id)) {
        throw new Error('The Cloud snapshot contains duplicate media references.');
      }
      seenIds.add(reference.id);
      entry.reference = reference;
    } catch (error) {
      entry.parseError = error;
    }
    parsed.push(entry);
  }

  for (const entry of parsed) {
    if (!entry.reference) {
      failures.push(failure(
        'metadata',
        errorMessage(entry.parseError),
        entry.id,
        entry.originalName,
      ));
      continue;
    }
    remoteMedia.push(entry.reference);
  }

  return {
    remoteMedia,
    failures,
  };
};

const restoreRemoteMedia = async (
  remoteMedia: CloudMediaReference[],
  failures: CaizenMediaTransferFailure[],
  options: Pick<RestoreOptions, 'onProgress'> & {
    session: MediaSessionToken;
    assertCurrent?: () => Promise<void>;
  },
) => {
  let downloadedFileCount = 0;
  let completed = 0;
  const total = remoteMedia.length;
  const report = (message: string) => {
    options.onProgress?.({
      operation: 'restore',
      phase: 'media',
      completed,
      total,
      message,
    });
  };

  // This is the explicit "restore the media too" path, so a few transfers run
  // in parallel instead of one at a time. Validation, session fencing and the
  // guarded commit are unchanged and still happen per file.
  await mapWithConcurrency(remoteMedia, async (asset) => {
    const existing = await getMediaAsset(asset.id);
    if (existing && existing.profileId !== asset.profileId) {
      failures.push(failure('metadata', 'A local media ID belongs to another profile; it was preserved.', asset.id, asset.originalName));
      completed += 1;
      return;
    }
    const localCopy = existing ? await hasLocalMediaCopy(existing) : false;
    const matchingLocalCopy = existing && localCopy && shouldAttachCloudMediaRemotePath({
      existing,
      existingHasLocal: true,
      remoteChecksum: asset.checksum,
      remotePath: asset.storagePath,
    });
    if (existing && localCopy && !matchingLocalCopy) {
      failures.push(failure('metadata', 'The local media copy has different or unverified bytes and was preserved.', asset.id, asset.originalName));
      completed += 1;
      return;
    }
    if (matchingLocalCopy) {
      completed += 1;
      report(`Keeping local copy ${completed} of ${total}...`);
      return;
    }

    report(`Restoring file ${Math.min(completed + 1, total)} of ${total}…`);
    let blob: Blob;
    try {
      const downloaded = await downloadCaizenPrivateMedia(asset.storagePath, {
        profileId: asset.profileId,
        mediaAssetId: asset.id,
      });
      blob = downloaded.type === asset.mimeType
        ? downloaded
        : new Blob([await downloaded.arrayBuffer()], { type: asset.mimeType });
    } catch (error) {
      failures.push(failure('download', errorMessage(error), asset.id, asset.originalName));
      completed += 1;
      report(`Restored ${completed} of ${total} files…`);
      return;
    }
    await options.assertCurrent?.();
    try {
      await withMediaSessionCommit(options.session, async () => {
        const restored = await mediaStorage.restore(blob, asset);
        touchCloudMediaCache(restored);
        await enforceCloudMediaCacheLimit();
      });
      downloadedFileCount += 1;
    } catch (error) {
      if (error instanceof MediaSessionInvalidatedError) throw error;
      failures.push(failure('restore', errorMessage(error), asset.id, asset.originalName));
    }
    completed += 1;
    report(`Restored ${completed} of ${total} files…`);
  });
  return downloadedFileCount;
};

const cloudOwnerType = (recordType: string): MediaAsset['ownerType'] => {
  const allowed: MediaAsset['ownerType'][] = [
    'inventory',
    'journal',
    'health',
    'finance',
    'wishlist',
    'work',
    'document',
    'career',
    'profile',
    'other',
  ];
  return allowed.includes(recordType as MediaAsset['ownerType'])
    ? recordType as MediaAsset['ownerType']
    : 'other';
};

export const shouldAttachCloudMediaRemotePath = (input: {
  existing?: Pick<MediaAsset, 'remotePath' | 'checksum'>;
  existingHasLocal: boolean;
  remoteChecksum: string | null | undefined;
  remotePath?: string;
}): boolean => {
  if (!input.existing || !input.existingHasLocal) return true;
  if (input.existing.remotePath) {
    if (input.existing.remotePath === input.remotePath) {
      if (input.existing.checksum && input.remoteChecksum) {
        return input.existing.checksum === input.remoteChecksum;
      }
      return true;
    }
    if (input.existing.checksum && input.remoteChecksum) {
      return input.existing.checksum === input.remoteChecksum;
    }
    // A local byte copy with unknown equivalence remains authoritative when a
    // new Cloud path/checksum cannot prove it is the same file.
    return false;
  }
  return Boolean(
    input.existing.checksum &&
    input.remoteChecksum &&
    input.existing.checksum === input.remoteChecksum,
  );
};

/**
 * Restores Cloud media identity without downloading bytes. Existing local
 * copies are retained and become Cloud-backed cached assets through the
 * derived remotePath/local-byte residency model.
 */
const hydrateCloudMediaMetadata = async (
  remoteMedia: CloudMediaReference[],
  failures: CaizenMediaTransferFailure[],
  expectedUserId: string,
  expectedProfileId: string,
  session: MediaSessionToken,
  assertCurrent?: () => Promise<void>,
): Promise<number> => {
  let hydrated = 0;
  // Metadata hydration is what makes a new device usable, so its per-asset
  // existence check and metadata write run a few at a time. Each asset still
  // verifies its own object immediately before its own remotePath is attached.
  await mapWithConcurrency(remoteMedia, async (remote) => {
    await assertCurrent?.();
    try {
      const pathSegments = remote.storagePath.split('/');
      if (
        pathSegments.length !== 4 ||
        pathSegments[0] !== expectedUserId ||
        pathSegments[1] !== expectedProfileId ||
        pathSegments[2] !== remote.id ||
        pathSegments.some(segment => !segment)
      ) {
        throw new Error('The Cloud media path is outside the selected account/profile boundary.');
      }
      if (!CLOUD_MEDIA_MIME_TYPES.has(remote.mimeType.toLowerCase())) {
        throw new Error(`Cloud Storage does not support ${remote.mimeType || 'this media type'}.`);
      }
      if (!Number.isSafeInteger(remote.sizeBytes) || remote.sizeBytes < 0) {
        throw new Error('Cloud media metadata has an invalid byte size.');
      }
      // The object check is repeated at the point where remotePath is about
      // to be attached. Preparation may have completed earlier, and a
      // transient deletion in between must not create a dead local path.
      if (!await verifyCloudMediaObjectExists(remote.storagePath, {
        profileId: remote.profileId,
        mediaAssetId: remote.id,
      })) {
        throw new Error('The Cloud media object is unavailable.');
      }
      const existing = await getMediaAsset(remote.id);
      if (existing && existing.profileId !== remote.profileId) {
        throw new Error('A Cloud media ID collides with media owned by another local profile; the local asset was preserved.');
      }
      const existingHasLocal = existing ? await hasLocalMediaCopy(existing) : false;
      if (!shouldAttachCloudMediaRemotePath({
        existing,
        existingHasLocal,
        remoteChecksum: remote.checksum,
        remotePath: remote.storagePath,
      })) {
        failures.push(failure(
          'metadata',
          existing?.checksum && remote.checksum
            ? 'A local-only media asset uses the same ID with different bytes; the local copy was preserved.'
            : 'A local-only media asset uses the same ID but byte equivalence is unknown; the local copy was preserved.',
          remote.id,
          remote.originalName,
        ));
        return;
      }

      await withMediaSessionCommit(session, () => putMediaAsset({
          id: remote.id,
          profileId: remote.profileId,
          ownerType: cloudOwnerType(remote.recordType),
          ownerId: remote.recordId,
          role: remote.role,
          fileName: remote.originalName,
          mimeType: remote.mimeType,
          sizeBytes: remote.sizeBytes,
          width: remote.width ?? undefined,
          height: remote.height ?? undefined,
          localPath: existingHasLocal ? existing?.localPath : undefined,
          thumbnailPath: existingHasLocal ? existing?.thumbnailPath : undefined,
          remotePath: remote.storagePath,
          checksum: remote.checksum ?? existing?.checksum ?? undefined,
          syncStatus: 'synced',
          createdAt: existing?.createdAt ?? remote.createdAt,
          updatedAt: remote.updatedAt,
      }));
      hydrated += 1;
    } catch (error) {
      failures.push(failure('metadata', errorMessage(error), remote.id, remote.originalName));
    }
  });
  return hydrated;
};

const restoreCloudMediaToLocalInternal = async (
  profileId: string,
  options: Pick<RestoreOptions, 'onProgress' | 'expectedBackupId' | 'expectedUpdatedAt' | 'expectedUserId' | 'expectedFingerprint'> = {},
): Promise<{ downloadedFileCount: number; failedMedia: CaizenMediaTransferFailure[] }> => {
  const user = await getCloudUser();
  if (!user) throw new Error('Please sign in before restoring Cloud media.');
  if (options.expectedUserId && options.expectedUserId !== user.id) {
    throw new Error('The signed-in Cloud account changed. Review this backup again.');
  }
  const session = getMediaSessionToken(user.id);
  if (!isMediaSessionCurrent(session)) {
    throw new MediaSessionInvalidatedError();
  }
  const backup = getReviewedCloudSnapshot(user.id, profileId, options.expectedBackupId, options.expectedUpdatedAt)
    ?? await getCaizenProfileBackup(profileId);
  if (!backup?.data) throw new Error('No cloud backup was found for the selected profile.');
  await assertExpectedCloudRestore(profileId, options);
  if (backup.schemaVersion > CAIZEN_BACKUP_SCHEMA_VERSION) {
    throw new Error(
      'This Cloud backup was created by a newer Caizen version. Update the app before syncing media.',
    );
  }

  const prepared = await prepareCloudMediaRestore(profileId, backup);
  await assertExpectedCloudRestore(profileId, options);
  const downloadedFileCount = await restoreRemoteMedia(
    prepared.remoteMedia,
    prepared.failures,
    { ...options, session, assertCurrent: () => assertExpectedCloudRestore(profileId, options) },
  );
  if (!isMediaSessionCurrent(session)) throw new MediaSessionInvalidatedError();
  if (prepared.failures.length === 0) {
    setCloudAutoBackupPaused({ userId: user.id, profileId }, null);
  } else if (getCloudAutoBackupState({ userId: user.id, profileId }).enabled) {
    setCloudAutoBackupPaused(
      { userId: user.id, profileId },
      'media: Automatic Cloud Backup paused because some Cloud media could not be restored.',
    );
  }
  return {
    downloadedFileCount,
    failedMedia: prepared.failures,
  };
};

const restoreCloudDataToLocalInternal = async (
  options: RestoreOptions = {},
): Promise<CaizenRestoreResult> => {
  const user = await getCloudUser();

  if (!user) {
    throw new Error(
      'Please sign in before restoring.'
    );
  }
  if (options.expectedUserId && options.expectedUserId !== user.id) {
    throw new Error('The signed-in Cloud account changed. Review this backup again.');
  }
  const session = getMediaSessionToken(user.id);
  if (!isMediaSessionCurrent(session)) throw new MediaSessionInvalidatedError();

  const current = await loadAppState();
  const profileId = options.profileId ?? current?.currentProfileId;
  if (!profileId) throw new Error('The selected profile could not be loaded.');
  const expectedCurrentProfileId = options.expectedCurrentProfileId === undefined
    ? current?.currentProfileId ?? null
    : options.expectedCurrentProfileId;
  const expectedLocalModifiedAt = options.expectedLocalModifiedAt === undefined
    ? await getLocalProfileModifiedAt(profileId)
    : options.expectedLocalModifiedAt;

  options.onProgress?.({
    operation: 'restore',
    phase: 'preparing',
    completed: 0,
    total: 0,
    message: 'Fetching and validating the profile snapshot…',
  });
  const backup = getReviewedCloudSnapshot(user.id, profileId, options.expectedBackupId, options.expectedUpdatedAt)
    ?? await getCaizenProfileBackup(profileId);
  if (!backup?.data) {
    throw new Error(
      'No cloud backup was found for the selected profile.'
    );
  }
  if (
    (options.expectedBackupId && backup.id !== options.expectedBackupId) ||
    (options.expectedUpdatedAt && backup.updatedAt !== options.expectedUpdatedAt)
  ) {
    throw new Error('This Cloud backup changed after Review. Review it again before restoring.');
  }

  if (
    backup.schemaVersion > CAIZEN_BACKUP_SCHEMA_VERSION
  ) {
    throw new Error(
      'This Cloud backup was created by a newer Caizen version. Update the app before restoring.',
    );
  }
  const existingProfileIds = current?.profiles.map((profile) => profile.id) ?? [];
  const { prepareImport } = await import('./storage/import-integrity');
  const prepared = reviewedSnapshot?.backup === backup && reviewedSnapshot.prepared
    ? reviewedSnapshot.prepared
    : prepareImport(backup.data, existingProfileIds);
  if (!prepared.report.canImport) {
    throw new Error(
      `Cloud backup validation failed: ${prepared.report.warnings[0] || 'record dates are invalid.'}`,
    );
  }
  if (
    prepared.state.profiles.length !== 1 ||
    prepared.state.profiles[0]?.id !== profileId
  ) {
    throw new Error('The cloud snapshot does not match the selected profile.');
  }

  await assertExpectedCloudRestore(profileId, options);
  const mediaBatch = await prepareCloudMediaRestore(profileId, backup);
  const failures = mediaBatch.failures;
  const remoteMedia = mediaBatch.remoteMedia;

  // Keep the local/pristine guard and exact Cloud snapshot check after all
  // network-backed preparation and immediately before the destructive import.
  await options.beforeCommit?.();
  await assertExpectedCloudRestore(profileId, options);
  if (!isMediaSessionCurrent(session)) {
    const sessionUserId = getMediaSessionUserId();
    if (options.expectedUserId && sessionUserId && sessionUserId !== options.expectedUserId) {
      throw new Error('The signed-in Cloud account changed. Review this backup again.');
    }
    throw new MediaSessionInvalidatedError();
  }

  options.onProgress?.({
    operation: 'restore',
    phase: 'text',
    completed: 0,
    total: remoteMedia.length,
    message: 'Restoring validated profile data…',
  });
  const { restoreCloudProfileImport } = await import('./storage/backup-repository');
  await withMediaSessionCommit(session, () => restoreCloudProfileImport(prepared, {
    removeProfileIds: options.removeProfileIds,
    beforeReplace: async () => {
      // This callback runs inside commitPreparedImport after preImportRecovery
      // has been written and immediately before replaceAppState(nextState).
      await options.beforeReplace?.();
      await assertExpectedCloudRestore(profileId, options);
      const latestLocalModifiedAt = await getLocalProfileModifiedAt(profileId);
      if (latestLocalModifiedAt !== expectedLocalModifiedAt) {
        throw new Error('This device changed while the Cloud restore was preparing. Review it again before restoring.');
      }
      const latestLocalState = await loadAppState();
      if ((latestLocalState?.currentProfileId ?? null) !== expectedCurrentProfileId) {
        throw new Error('The current local profile changed while the Cloud restore was preparing. Review it again before restoring.');
      }
      if (!isMediaSessionCurrent(session)) throw new MediaSessionInvalidatedError();
    },
    assertBeforeReplace: () => {
      if (!isMediaSessionCurrent(session)) throw new MediaSessionInvalidatedError();
      options.assertBeforeReplace?.();
    },
  }));

  // Normal Cloud restore is metadata-first. Full objects are fetched only by
  // the explicit media-retry path or the shared lazy resolver.
  options.onProgress?.({
    operation: 'restore',
    phase: 'media',
    completed: 0,
    total: remoteMedia.length,
    message: remoteMedia.length
      ? `Linking ${remoteMedia.length} Cloud media file${remoteMedia.length === 1 ? '' : 's'}…`
      : 'Linking Cloud media…',
  });
  let restoredMediaMetadataCount = 0;
  try {
    restoredMediaMetadataCount = await hydrateCloudMediaMetadata(
      remoteMedia,
      failures,
      user.id,
      profileId,
      session,
      () => assertExpectedCloudRestore(profileId, options),
    );
  } catch (error) {
    failures.push(failure('metadata', `Structured profile was restored, but media linking stopped: ${errorMessage(error)}`));
  }
  if (!isMediaSessionCurrent(session)) {
    failures.push(failure('metadata', 'Structured profile was restored; Cloud media linking stopped after the account changed.'));
    return {
      status: 'partial', backupId: backup.id, profileId,
      schemaVersion: backup.schemaVersion, restoredAt: new Date().toISOString(),
      downloadedFileCount: 0, failedMedia: failures,
    };
  }
  // Media bytes stay in Cloud and are fetched by resolveMedia when a page
  // actually needs them, so a normal restore downloads no originals.
  const downloadedFileCount = 0;

  try {
    localStorage.setItem(LOCAL_MODIFIED_KEY, backup.updatedAt);
    localStorage.setItem(profileStorageKey(LOCAL_PROFILE_MODIFIED_KEY_PREFIX, profileId), backup.updatedAt);
    localStorage.setItem(profileStorageKey(LAST_PROFILE_BACKUP_KEY_PREFIX, profileId), backup.updatedAt);
    await putStoreValue(STORES.settings, { key: 'localModifiedAt', value: backup.updatedAt });
    writeCloudSyncMarker(user.id, profileId, backup.updatedAt);
    if (failures.length === 0) {
      setCloudAutoBackupPaused({ userId: user.id, profileId }, null);
    } else if (getCloudAutoBackupState({ userId: user.id, profileId }).enabled) {
      setCloudAutoBackupPaused({ userId: user.id, profileId }, 'media: Automatic Cloud Backup paused because some Cloud media could not be restored.');
    }
  } catch (error) {
    failures.push(failure('metadata', `Structured profile was restored, but Cloud status could not be saved: ${errorMessage(error)}`));
  }
  options.onProgress?.({
    operation: 'restore',
    phase: 'complete',
    completed: restoredMediaMetadataCount,
    total: remoteMedia.length,
    message: failures.length
      ? 'Profile restored with media warnings. Images stay in Cloud and download when opened.'
      : 'Restore complete. Images stay in Cloud and download when opened.',
  });

  return {
    status: failures.length ? 'partial' : 'success',
    backupId: backup.id,
    profileId,
    schemaVersion: backup.schemaVersion,
    restoredAt: new Date().toISOString(),
    downloadedFileCount,
    failedMedia: failures,
  };
};

const serializedSize = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

export const inspectCloudReconciliation = async (): Promise<CloudReconciliation> => {
  const user = await getCloudUser();
  if (!user) throw new Error('Please sign in before syncing.');

  const state = await loadAppState();
  const profileId = state?.currentProfileId;
  if (!state || !profileId || !state.profiles.some(profile => profile.id === profileId)) {
    throw new Error('The selected local profile could not be loaded.');
  }

  const localUpdatedAt = await getLocalProfileModifiedAt(profileId);
  const backup = await getCaizenProfileBackup(profileId);
  if (!backup?.data) {
    return {
      action: 'none',
      reason: 'no-cloud',
      userId: user.id,
      profileId,
      cloudBackupId: null,
      localUpdatedAt,
      cloudUpdatedAt: null,
    };
  }
  if (backup.schemaVersion > CAIZEN_BACKUP_SCHEMA_VERSION) {
    throw new Error(
      'This Cloud backup was created by a newer Caizen version. Update the app before syncing.',
    );
  }

  const { prepareImport } = await import('./storage/import-integrity');
  const prepared = prepareImport(
    backup.data,
    state.profiles.map(profile => profile.id),
  );
  if (
    !prepared.report.canImport ||
    prepared.state.profiles.length !== 1 ||
    prepared.state.profiles[0]?.id !== profileId
  ) {
    throw new Error(
      `Cloud backup validation failed: ${prepared.report.warnings[0] || 'the snapshot does not match this profile.'}`,
    );
  }

  const cloudUpdatedAt = backup.updatedAt;
  let marker = getCloudSyncMarker(user.id, profileId);
  if (!marker) {
    const legacyBaseline = localStorage.getItem(
      profileStorageKey(LAST_PROFILE_BACKUP_KEY_PREFIX, profileId),
    );
    if (legacyBaseline) {
      writeCloudSyncMarker(user.id, profileId, legacyBaseline);
      marker = getCloudSyncMarker(user.id, profileId);
    }
  }

  if (!marker && localUpdatedAt === cloudUpdatedAt) {
    writeCloudSyncMarker(user.id, profileId, cloudUpdatedAt);
    marker = getCloudSyncMarker(user.id, profileId);
  }

  if (!marker || !localUpdatedAt) {
    return {
      action: 'conflict',
      reason: 'no-baseline',
      userId: user.id,
      profileId,
      cloudBackupId: backup.id,
      cloudBackupFingerprint: getCloudRecoveryFingerprint({
        backupId: backup.id,
        profileId: backup.profileId,
        schemaVersion: backup.schemaVersion,
        updatedAt: backup.updatedAt,
      }),
      cloudSchemaVersion: backup.schemaVersion,
      localUpdatedAt,
      cloudUpdatedAt,
    };
  }

  const localChanged = localUpdatedAt !== marker.localUpdatedAt;
  const cloudChanged = cloudUpdatedAt !== marker.cloudUpdatedAt;
  const action = localChanged && cloudChanged
    ? 'conflict'
    : cloudChanged
      ? 'restore'
      : localChanged
        ? 'upload'
        : 'none';

  return {
    action,
    reason: action === 'conflict'
      ? 'both-changed'
      : action === 'restore'
        ? 'cloud-newer'
        : action === 'upload'
          ? 'local-newer'
          : 'unchanged',
    userId: user.id,
    profileId,
    cloudBackupId: backup.id,
    cloudBackupFingerprint: getCloudRecoveryFingerprint({
      backupId: backup.id,
      profileId: backup.profileId,
      schemaVersion: backup.schemaVersion,
      updatedAt: backup.updatedAt,
    }),
    cloudSchemaVersion: backup.schemaVersion,
    localUpdatedAt,
    cloudUpdatedAt,
  };
};

export const getCloudMediaTotals = async (): Promise<Record<string, { count: number; bytes: number }>> => {
  const media = await listCaizenMediaAssetMetadata();
  const totals: Record<string, { count: number; bytes: number }> = {};
  for (const asset of media) {
    const entry = totals[asset.profileId] ?? { count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes += asset.sizeBytes;
    totals[asset.profileId] = entry;
  }
  return totals;
};

export const getCloudBackupOverview = async (
  options: { includeMediaTotals?: boolean } = {},
): Promise<CloudBackupOverview> => {
  const user = await getCloudUser();
  if (!user) throw new Error('Please sign in before loading cloud backups.');

  const [state, backups, media] = await Promise.all([
    loadAppState(),
    typeof listCaizenProfileBackupMetadata === 'function'
      ? listCaizenProfileBackupMetadata()
      : listCaizenProfileBackups(),
    options.includeMediaTotals === false
      ? Promise.resolve(null)
      : (typeof listCaizenMediaAssetMetadata === 'function'
        ? listCaizenMediaAssetMetadata()
        : listAllCaizenMediaAssets()
      ).catch(() => null),
  ]);
  const currentProfileId = state?.currentProfileId;
  const localModifiedAt = currentProfileId
    ? await getLocalProfileModifiedAt(currentProfileId)
    : null;
  const mediaByProfile = new Map<string, { count: number; bytes: number }>();
  for (const asset of media ?? []) {
    const currentMedia = mediaByProfile.get(asset.profileId) ?? { count: 0, bytes: 0 };
    currentMedia.count += 1;
    currentMedia.bytes += asset.sizeBytes;
    mediaByProfile.set(asset.profileId, currentMedia);
  }
  const summaries = backups.map((backup): CloudProfileBackupSummary => {
    const localProfile = state?.profiles.find(profile => profile.id === backup.profileId);
    const reviewedName = reviewedProfileNames.get(reviewedNameKey(backup));
    const localName = localProfile?.name?.trim();
    const profileName = reviewedName || localName || 'Backup';
    const profileMedia = media === null
      ? null
      : mediaByProfile.get(backup.profileId) ?? { count: 0, bytes: 0 };
    return {
      userId: backup.userId,
      id: backup.id,
      profileId: backup.profileId,
      profileName,
      profileNameSource: reviewedName ? 'reviewed' : localName ? 'local' : 'unknown',
      schemaVersion: backup.schemaVersion,
      updatedAt: backup.updatedAt,
      structuredSizeBytes: 0,
      mediaCount: profileMedia?.count ?? null,
      mediaSizeBytes: profileMedia?.bytes ?? null,
      validation: 'unreviewed',
      warning: null,
    };
  });
  const currentProfile = state?.profiles.find(
    (profile) => profile.id === state.currentProfileId,
  );
  const matchingBackup = currentProfile
    ? summaries.find((backup) => backup.profileId === currentProfile.id) ?? null
    : null;

  return {
    currentProfile: currentProfile
      ? {
          id: currentProfile.id,
          name: currentProfile.name,
          localModifiedAt,
          structuredSizeBytes: serializedSize(currentProfile),
        }
      : null,
    backups: summaries,
    matchingBackup,
    otherBackups: summaries.filter(
      (backup) => backup.profileId !== currentProfile?.id,
    ),
  };
};

export const getCloudBackupPreview = async () => {
  const user = await getCloudUser();
  if (!user) throw new Error('Please sign in before previewing a backup.');
  const state = await loadAppState();
  if (!state?.currentProfileId) return null;
  const backup = await getCaizenProfileBackup(state.currentProfileId);
  if (!backup?.data) return null;
  const existingProfileIds = state.profiles.map((profile) => profile.id);
  const { prepareImport } = await import('./storage/import-integrity');
  const prepared = prepareImport(backup.data, existingProfileIds);
  return {
    updatedAt: backup.updatedAt,
    schemaVersion: backup.schemaVersion,
    report: prepared.report,
  };
};

export const reviewCloudBackupForRestore = async (
  expected: Pick<CloudProfileBackupSummary, 'id' | 'profileId' | 'updatedAt' | 'userId'>,
): Promise<CloudProfileBackupSummary> => {
  const user = await getCloudUser();
  if (!user || user.id !== expected.userId) throw new Error('The Cloud account changed. Review this backup again.');
  const backup = await getCaizenProfileBackup(expected.profileId);
  if (!backup || backup.id !== expected.id || backup.updatedAt !== expected.updatedAt) {
    throw new Error('The Cloud backup changed. Refresh and review it again.');
  }
  if (backup.schemaVersion > CAIZEN_BACKUP_SCHEMA_VERSION) {
    throw new Error('This Cloud backup was created by a newer Caizen version.');
  }
  const state = await loadAppState();
  const { prepareImport } = await import('./storage/import-integrity');
  const prepared = prepareImport(backup.data, state?.profiles.map(profile => profile.id) ?? []);
  const profile = prepared.state.profiles[0];
  if (!prepared.report.canImport || prepared.state.profiles.length !== 1 || profile?.id !== backup.profileId) {
    throw new Error(prepared.report.warnings[0] || 'This Cloud backup failed validation.');
  }
  rememberReviewedCloudSnapshot(backup, prepared);
  return {
    userId: backup.userId,
    id: backup.id,
    profileId: backup.profileId,
    profileName: profile.name?.trim() || 'Unnamed profile',
    schemaVersion: backup.schemaVersion,
    updatedAt: backup.updatedAt,
    structuredSizeBytes: serializedSize(backup.data),
    mediaCount: Array.isArray((backup.data as { media?: unknown }).media)
      ? (backup.data as { media: unknown[] }).media.length : null,
    mediaSizeBytes: null,
    validation: 'valid',
    warning: null,
  };
};

export const getCloudBackupMeta = async () => {
  const user = await getCloudUser();

  if (!user) {
    return null;
  }
  const state = await loadAppState();
  if (!state?.currentProfileId) return null;
  const backup = await getCaizenProfileBackup(state.currentProfileId);
  return backup
    ? {
        schema_version: backup.schemaVersion,
        updated_at: backup.updatedAt,
      }
    : null;
};

export const backupLocalDataToCloud = (...args: Parameters<typeof backupLocalDataToCloudInternal>) => {
  if (args[0]?.mode === 'auto' && isCloudManagementOpen()) return Promise.reject(new CloudOperationBusyError());
  return withCloudOperation('backup', () => withRealWorkspaceOperation(() => backupLocalDataToCloudInternal(...args)));
};

export const deleteCloudProfileData = (...args: Parameters<typeof deleteCloudProfileDataInternal>) => withCloudOperation('delete', () => withRealWorkspaceOperation(() => deleteCloudProfileDataInternal(...args)));

export const restoreCloudDataToLocal = (...args: Parameters<typeof restoreCloudDataToLocalInternal>) => withCloudOperation('restore', () => withRealWorkspaceOperation(() => restoreCloudDataToLocalInternal(...args)));

export const restoreCloudMediaToLocal = (...args: Parameters<typeof restoreCloudMediaToLocalInternal>) => withCloudOperation('files', () => withRealWorkspaceOperation(() => restoreCloudMediaToLocalInternal(...args)));
