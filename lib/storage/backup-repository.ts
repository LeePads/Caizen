import { assertRealWorkspace, withRealWorkspaceOperation, type WorkspaceWriteOptions } from './workspace-fence';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { MediaAsset } from '../types';
import { mediaStorage, revokeMediaDisplayUrls } from './media-storage';
import {
  deleteMediaBlobs,
  getMediaBlob,
  getMediaAsset,
  listMediaAssets,
  putMediaAsset,
  putMediaBlob,
} from './media-repository';
import { loadAppState, replaceAppState, saveAppState, type StoredAppState } from './app-repository';
import { isNativeApp } from '../platform';
import { isAndroid } from '../platform';
import {
  deletePrivateMedia,
  privateMediaExists,
  privateMediaSourceUri,
  writePrivateMedia,
} from '../native/media-filesystem';
import { CaizenNative } from '../native/calendar';
import { sanitizeFileName, validateMediaBlob } from './media-validation';
import { putStoreValue, getAllStoreValues, getStoreValue } from './database';
import { STORES } from './schema';
import {
  CAIZEN_BACKUP_SCHEMA_VERSION,
  createProfilesForImport,
  parseAndPrepareImport,
  prepareImport,
  type ImportIntegrityReport,
  type PreparedImport,
} from './import-integrity';
import { APP_VERSION } from '../app-version';
import {
  collectMediaReferenceIds,
  remapMediaReferences,
  sanitizeMediaReferences,
} from './media-references';
import {
  processPendingMediaCleanup,
  queueMediaCleanup,
} from './media-cleanup';
import { dataUrlToBlob, isInlineDataUrl } from './legacy-media';
import {
  queueExpiredTrashMediaCleanup,
  removeExpiredTrashItems,
} from './trash-media';

export const MAX_COMPLETE_BACKUP_BYTES = 512 * 1024 * 1024;
/** Engineering safety bound for text parsing before JSON.parse allocates data. */
export const MAX_DATA_ONLY_JSON_BYTES = 50 * 1024 * 1024;
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_ENTRIES = 5_000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function assertDataOnlyJsonSize(bytes: number): void {
  if (bytes > MAX_DATA_ONLY_JSON_BYTES) {
    throw new Error('Data-only JSON files are limited to 50 MiB so Caizen can restore them. Nothing on this device was changed.');
  }
}
export type CaizenBackupManifest = {
  format: 'caizen-backup';
  version: 1 | 2;
  createdAt: string;
  schemaVersion?: number;
  profiles?: Array<{ id: string; name: string }>;
  media?: Array<{
    id: string;
    archivePath: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    checksum?: string;
  }>;
  appVersion?: string;
  profileCount?: number;
  recordCount?: number;
  mediaCount?: number;
  totalMediaBytes?: number;
};

export type CompleteRestoreResult = {
  status: 'success' | 'partial';
  restoredMediaCount: number;
  failedMedia: Array<{ id: string; fileName: string; message: string }>;
};

export class CompleteBackupPreflightError extends Error {
  readonly unavailable: Array<{ id: string; fileName: string; reason: string }>;

  constructor(unavailable: Array<{ id: string; fileName: string; reason: string }>) {
    super(
      unavailable.length === 1
        ? `Complete backup could not include ${unavailable[0].fileName}: ${unavailable[0].reason}`
        : `Complete backup could not include ${unavailable.length} media files: ${unavailable.map(item => `${item.fileName} (${item.reason})`).join('; ')}`,
    );
    this.name = 'CompleteBackupPreflightError';
    this.unavailable = unavailable;
  }
}

export class CompleteBackupSizeError extends Error {
  constructor() {
    super('The complete backup is larger than the 512 MB import limit, so it was not created.');
    this.name = 'CompleteBackupSizeError';
  }
}

export type CompleteBackupPreflight = {
  localBytes: number;
  remoteDownloads: Array<{ assetId: string; size: number; filename: string }>;
  unavailable: Array<{ assetId: string; fileName: string; reason: string }>;
  canClaimComplete: boolean;
};

export type BackupPreview = {
  manifest: CaizenBackupManifest;
  profiles: Array<{ id: string; name: string }>;
  collisions: string[];
  missingMedia: string[];
  integrity: ImportIntegrityReport;
};

type CompleteLegacyMediaMigration = {
  collection: 'inventoryItems' | 'wishlistItems' | 'skincareProducts' | 'supplements' | 'mediaItems';
  key: 'image' | 'photo';
  referenceKey: 'photoAssetIds' | 'imageAssetId';
  ownerType: MediaAsset['ownerType'];
};

const COMPLETE_LEGACY_MEDIA_MIGRATIONS: CompleteLegacyMediaMigration[] = [
  { collection: 'inventoryItems', key: 'image', referenceKey: 'photoAssetIds', ownerType: 'inventory' },
  { collection: 'wishlistItems', key: 'image', referenceKey: 'photoAssetIds', ownerType: 'wishlist' },
  { collection: 'skincareProducts', key: 'photo', referenceKey: 'photoAssetIds', ownerType: 'health' },
  { collection: 'skincareProducts', key: 'image', referenceKey: 'photoAssetIds', ownerType: 'health' },
  { collection: 'supplements', key: 'image', referenceKey: 'photoAssetIds', ownerType: 'health' },
  { collection: 'mediaItems', key: 'image', referenceKey: 'imageAssetId', ownerType: 'other' },
];

type CompleteLegacyMigrationResult = {
  state: StoredAppState;
  unavailable: CompleteBackupPreflightError['unavailable'];
};

const stateJson = (state: StoredAppState | null | undefined): string =>
  JSON.stringify(state ?? null);

/**
 * Converts the supported legacy inline fields before a complete archive is
 * assembled. The original state is kept until the managed asset and its
 * structured reference have both been read back successfully.
 */
const materializeLegacyInlineMediaForCompleteBackup = async (
  state: StoredAppState,
): Promise<CompleteLegacyMigrationResult> => {
  const original = structuredClone(state);
  const working = structuredClone(state);
  const createdAssetIds: string[] = [];
  const migrated: Array<{
    definition: CompleteLegacyMediaMigration;
    profileId: string;
    recordId: string;
    assetId: string;
  }> = [];
  const unavailable: CompleteBackupPreflightError['unavailable'] = [];

  for (const profile of working.profiles) {
    for (const definition of COMPLETE_LEGACY_MEDIA_MIGRATIONS) {
      const records = (profile[definition.collection] as unknown as Array<Record<string, unknown>> | undefined) || [];
      for (const record of records) {
        const value = record[definition.key];
        if (!isInlineDataUrl(value)) continue;
        const recordId = typeof record.id === 'string' ? record.id : 'unknown';
        const label = `${profile.id}.${definition.collection}.${recordId}.${definition.key}`;
        const blob = dataUrlToBlob(value);
        if (!blob) {
          unavailable.push({
            id: label,
            fileName: label,
            reason: 'The legacy inline media could not be decoded safely.',
          });
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
          migrated.push({ definition, profileId: profile.id, recordId, assetId: asset.id });
        } catch (error) {
          unavailable.push({
            id: label,
            fileName: label,
            reason: error instanceof Error ? error.message : 'The legacy inline media could not be converted safely.',
          });
        }
      }
    }
  }

  if (unavailable.length > 0) {
    await Promise.all(createdAssetIds.map(id => mediaStorage.delete(id).catch(() => undefined)));
    return { state: original, unavailable };
  }
  if (migrated.length === 0) return { state, unavailable: [] };

  try {
    await saveAppState(working);
    const verified = await loadAppState();
    for (const item of migrated) {
      const profile = verified?.profiles.find(candidate => candidate.id === item.profileId);
      const records = (profile?.[item.definition.collection] as unknown as Array<Record<string, unknown>> | undefined) || [];
      const record = records.find(candidate => candidate.id === item.recordId);
      const hasReference = item.definition.referenceKey === 'imageAssetId'
        ? record?.imageAssetId === item.assetId
        : Array.isArray(record?.photoAssetIds) && record.photoAssetIds.includes(item.assetId);
      if (!record || !hasReference || isInlineDataUrl(record[item.definition.key])) {
        throw new Error(`${item.profileId}.${item.definition.collection}.${item.recordId} did not read back after migration.`);
      }
    }
    return { state: verified ?? working, unavailable: [] };
  } catch (error) {
    let restored = false;
    try {
      await saveAppState(original);
      restored = stateJson(await loadAppState()) === stateJson(original);
    } catch {
      restored = false;
    }

    // If the original structured state cannot be proven restored, retain the
    // newly materialized assets. Deleting them could remove the only usable
    // representation after a partially applied structured write.
    if (restored) {
      await Promise.all(createdAssetIds.map(id => mediaStorage.delete(id).catch(() => undefined)));
    }
    return {
      state: restored ? original : (await loadAppState()) ?? working,
      unavailable: [{
        id: `${state.profiles[0]?.id ?? 'profile'}.legacy-media`,
        fileName: 'legacy media migration',
        reason: `${error instanceof Error ? error.message : 'Legacy media migration failed.'}${restored ? '' : ' The original structured state could not be verified after rollback; materialized media was retained.'}`,
      }],
    };
  }
};

const hasForbiddenKey = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  return Object.keys(value).some(
    (key) => FORBIDDEN_KEYS.has(key) || hasForbiddenKey((value as Record<string, unknown>)[key]),
  );
};

const DEVICE_ONLY_URL = /^(?:data:|blob:|content:|capacitor:|file:)/i;
const DEVICE_FILE_PATH = /^(?:[a-z]:[\\/]|\\\\|\/(?:data|private|sdcard|storage|users|var)\/)/i;
const DEVICE_ONLY_KEYS = ['localPath', 'thumbnailPath'];
const SHA256_HEX = /^[a-f0-9]{64}$/i;

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

/**
 * Removes device-local media references before a backup leaves this device.
 *
 * Every non-plain object has to be handled explicitly. `typeof x === 'object'`
 * is true for `Date`, `Map`, `Set`, `RegExp` and typed arrays, and
 * `Object.entries()` returns `[]` for all of them - so the generic recursion
 * below would silently rewrite them as `{}`. Live app state holds real `Date`
 * instances (IndexedDB structured-clone preserves them), which is exactly how
 * every exported timestamp used to become `{}` and then surface on import as
 * `contains an invalid date: "[object Object]"`.
 */
const stripDeviceMediaFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripDeviceMediaFields);

  if (value instanceof Date) {
    // An invalid Date cannot round-trip; drop it so import reports it as
    // missing rather than as a corrupt value.
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (!value || typeof value !== 'object') {
    if (
      typeof value === 'string' &&
      (
        DEVICE_ONLY_URL.test(value) ||
        DEVICE_FILE_PATH.test(value) ||
        isTemporarySignedUrl(value)
      )
    ) return undefined;
    return value;
  }

  if (value instanceof Map) return stripDeviceMediaFields(Object.fromEntries(value));
  if (value instanceof Set) return stripDeviceMediaFields(Array.from(value));
  if (value instanceof RegExp) return value.source;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    // Binary payloads belong in the archive's media entries, never inline.
    return undefined;
  }

  // Anything that defines its own JSON form (and is not a plain object) is
  // trusted to serialise itself rather than being flattened key by key.
  const maybeSerialisable = value as { toJSON?: () => unknown };
  if (typeof maybeSerialisable.toJSON === 'function') {
    return stripDeviceMediaFields(maybeSerialisable.toJSON());
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key) || DEVICE_ONLY_KEYS.includes(key)) continue;
    const stripped = stripDeviceMediaFields(child);
    if (stripped !== undefined) output[key] = stripped;
  }
  return output;
};

export function createDataOnlyEnvelope(state: StoredAppState, assets: MediaAsset[]) {
  const media = assets.map((asset) => ({
    ...asset,
    localPath: undefined,
    thumbnailPath: undefined,
    remotePath:
      asset.remotePath &&
      !DEVICE_ONLY_URL.test(asset.remotePath) &&
      !DEVICE_FILE_PATH.test(asset.remotePath) &&
      !isTemporarySignedUrl(asset.remotePath)
        ? asset.remotePath
        : undefined,
  }));
  return {
    format: 'caizen-data',
    version: CAIZEN_BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    data: stripDeviceMediaFields(state),
    media,
    mediaNotice:
      'Local-only photos and attachments are not included. Use a .caizen backup to transfer files.',
  };
}

export async function createDataOnlyExport(): Promise<Blob> {
  const state = await loadAppState();
  if (!state) throw new Error('No Caizen data is available to export.');
  const media = await listMediaAssets();
  return new Blob(
    [JSON.stringify(createDataOnlyEnvelope(state, media), null, 2)],
    { type: 'application/json' },
  );
}

const sha256Bytes = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const sha256Blob = async (blob: Blob): Promise<string> =>
  sha256Bytes(new Uint8Array(await blob.arrayBuffer()));

/**
 * Checks whether a complete archive can be self-contained before any archive
 * bytes are assembled. Remote-only assets are reported explicitly so the UI
 * can explain the required authenticated downloads.
 */
export async function preflightCompleteBackup(): Promise<CompleteBackupPreflight> {
  const initialState = await loadAppState();
  let legacyUnavailable: CompleteBackupPreflight['unavailable'] = [];
  if (initialState) {
    const migrated = await materializeLegacyInlineMediaForCompleteBackup(initialState);
    legacyUnavailable = migrated.unavailable.map(item => ({
      assetId: item.id,
      fileName: item.fileName,
      reason: item.reason,
    }));
  }
  const assets = await listMediaAssets();
  let localBytes = 0;
  const remoteDownloads: CompleteBackupPreflight['remoteDownloads'] = [];
  const unavailable: CompleteBackupPreflight['unavailable'] = [...legacyUnavailable];
  let cloudSignedIn = false;
  if (assets.some(asset => asset.remotePath)) {
    try {
      const { getCloudUser } = await import('../cloud-backup');
      cloudSignedIn = Boolean(await getCloudUser());
    } catch {
      cloudSignedIn = false;
    }
  }

  for (const asset of assets) {
    try {
      const blob = await mediaStorage.read(asset.id, asset.profileId);
      localBytes += blob.size;
      continue;
    } catch {
      if (asset.remotePath && cloudSignedIn) {
        remoteDownloads.push({ assetId: asset.id, size: asset.sizeBytes, filename: asset.fileName });
      } else {
        unavailable.push({
          assetId: asset.id,
          fileName: asset.fileName,
          reason: asset.remotePath
            ? 'Sign in to Cloud to include this remote-only media.'
            : 'The local media bytes are unavailable on this device.',
        });
      }
    }
  }

  return {
    localBytes,
    remoteDownloads,
    unavailable,
    canClaimComplete: unavailable.length === 0,
  };
}

export async function createCompleteBackup(
  onProgress?: (completed: number, total: number) => void,
): Promise<Blob> {
  const loadedState = await loadAppState();
  if (!loadedState) throw new Error('No Caizen data is available to back up.');
  const migrated = await materializeLegacyInlineMediaForCompleteBackup(loadedState);
  if (migrated.unavailable.length > 0) {
    throw new CompleteBackupPreflightError(migrated.unavailable);
  }
  const state = migrated.state;
  const assets = await listMediaAssets();
  const entries: Record<string, Uint8Array> = {};
  const index: MediaAsset[] = [];
  const manifestMedia: NonNullable<CaizenBackupManifest['media']> = [];
  const unavailable: CompleteBackupPreflightError['unavailable'] = [];

  let cloudDownload: ((
    storagePath: string,
    expected: { profileId: string; mediaAssetId: string },
  ) => Promise<Blob>) | null = null;
  let cloudUserId: string | null = null;
  const loadCloudDownload = async () => {
    if (cloudDownload || cloudUserId) return;
    try {
      const [{ downloadCaizenPrivateMedia }, { getCloudUser }] = await Promise.all([
        import('../caizen-cloud-repository'),
        import('../cloud-backup'),
      ]);
      const user = await getCloudUser();
      cloudDownload = downloadCaizenPrivateMedia;
      cloudUserId = user?.id ?? null;
    } catch {
      cloudDownload = null;
      cloudUserId = null;
    }
  };

  for (let indexNumber = 0; indexNumber < assets.length; indexNumber += 1) {
    const asset = assets[indexNumber];
    let blob: Blob | null = null;
    try {
      blob = await mediaStorage.read(asset.id, asset.profileId);
    } catch {
      if (asset.remotePath) {
        await loadCloudDownload();
        if (cloudDownload && cloudUserId) {
          try {
            const download = cloudDownload as (
              (storagePath: string, expected: { profileId: string; mediaAssetId: string }) => Promise<Blob>
            );
            const downloaded = await download(asset.remotePath, {
              profileId: asset.profileId,
              mediaAssetId: asset.id,
            });
            blob = downloaded.type === asset.mimeType
              ? downloaded
              : new Blob([await downloaded.arrayBuffer()], { type: asset.mimeType });
          } catch (error) {
            unavailable.push({
              id: asset.id,
              fileName: asset.fileName,
              reason: error instanceof Error ? error.message : 'The Cloud object could not be downloaded.',
            });
          }
        } else {
          unavailable.push({
            id: asset.id,
            fileName: asset.fileName,
            reason: 'Sign in to Cloud to include this remote-only media.',
          });
        }
      } else {
        unavailable.push({
          id: asset.id,
          fileName: asset.fileName,
          reason: 'The local media bytes are unavailable on this device.',
        });
      }
    }

    if (blob) {
      try {
        await validateMediaBlob(blob, asset.fileName);
        if (blob.size !== asset.sizeBytes) {
          throw new Error('The media bytes do not match the recorded size.');
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const checksum = await sha256Bytes(bytes);
        if (asset.checksum && checksum !== asset.checksum) {
          throw new Error('The media bytes do not match the recorded checksum.');
        }
        const extension = sanitizeFileName(asset.fileName).split('.').pop() || 'bin';
        const archivePath = `media/files/${encodeURIComponent(asset.id)}.${extension}`;
        entries[archivePath] = bytes;
      index.push({
        ...asset,
        localPath: undefined,
        thumbnailPath: undefined,
        checksum,
      });
      manifestMedia.push({
        id: asset.id,
        archivePath,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: blob.size,
        checksum,
        });
      } catch (error) {
        unavailable.push({
          id: asset.id,
          fileName: asset.fileName,
          reason: error instanceof Error ? error.message : 'The media bytes failed validation.',
        });
      }
    }
    if (!blob || unavailable.some(item => item.id === asset.id)) {
      index.push({ ...asset, localPath: undefined, thumbnailPath: undefined });
      manifestMedia.push({
        id: asset.id,
        archivePath: null,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        checksum: asset.checksum,
      });
    }
    onProgress?.(indexNumber + 1, assets.length);
  }

  if (unavailable.length > 0) {
    throw new CompleteBackupPreflightError(unavailable);
  }

  const manifest: CaizenBackupManifest = {
    format: 'caizen-backup',
    version: 2,
    createdAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    schemaVersion: CAIZEN_BACKUP_SCHEMA_VERSION,
    profiles: state.profiles.map(profile => ({ id: profile.id, name: profile.name })),
    media: manifestMedia,
    profileCount: state.profiles.length,
    recordCount: state.profiles.reduce((sum, profile) => sum + countProfileRecords(profile), 0),
    mediaCount: manifestMedia.length,
    totalMediaBytes: manifestMedia.reduce((sum, item) => sum + item.sizeBytes, 0),
  };
  entries['manifest.json'] = strToU8(JSON.stringify(manifest));
  entries['data.json'] = strToU8(JSON.stringify(stripDeviceMediaFields(state)));
  entries['media/index.json'] = strToU8(JSON.stringify(index));
  const zipped = zipSync(entries, { level: 6 });
  for (const key of Object.keys(entries)) delete entries[key];
  const completed = new Blob([zipped], { type: 'application/vnd.caizen.backup' });
  if (completed.size > MAX_COMPLETE_BACKUP_BYTES) throw new CompleteBackupSizeError();
  try {
    const finalPreview = await previewCompleteBackup(completed);
    if (finalPreview.missingMedia.length > 0 || !finalPreview.integrity.canImport) {
      throw new Error('The complete backup failed final validation and was not created.');
    }
  } catch (error) {
    if (error instanceof CompleteBackupSizeError) throw error;
    throw new Error(
      `The complete backup failed final validation and was not created: ${error instanceof Error ? error.message : 'invalid archive.'}`,
    );
  }
  await putStoreValue(STORES.settings, {
    key: 'lastSuccessfulBackup',
    value: manifest.createdAt,
  });
  return completed;
}

const safeArchivePath = (path: string) =>
  Boolean(path) &&
  !path.includes('\\') &&
  !path.startsWith('/') &&
  !/^[a-z]:/i.test(path) &&
  !path.split('/').some((part) => part === '..' || part === '.' || part === '');

async function readArchive(file: Blob) {
  if (file.size > MAX_COMPLETE_BACKUP_BYTES) throw new Error('The backup is larger than 512 MB.');
  const compressed = new Uint8Array(await file.arrayBuffer());
  const archive = unzipSync(compressed, {
    filter: (entry) => {
      if (!safeArchivePath(entry.name)) throw new Error('The backup contains an unsafe path.');
      if (entry.originalSize > MAX_ENTRY_BYTES) throw new Error('A backup entry exceeds 25 MB.');
      if (entry.size > 0 && entry.originalSize / entry.size > 250) {
        throw new Error('The backup has a suspicious compression ratio.');
      }
      return true;
    },
  });
  const names = Object.keys(archive);
  if (names.length > MAX_ENTRIES) throw new Error('The backup contains too many files.');
  if (!archive['manifest.json'] || !archive['data.json'] || !archive['media/index.json']) {
    throw new Error('The backup manifest, data, or media index is missing.');
  }
  return archive;
}

export async function previewCompleteBackup(file: Blob): Promise<BackupPreview> {
  const archive = await readArchive(file);
  const manifest = JSON.parse(strFromU8(archive['manifest.json'])) as CaizenBackupManifest;
  const rawState = JSON.parse(strFromU8(archive['data.json'])) as StoredAppState;
  const media = JSON.parse(strFromU8(archive['media/index.json'])) as MediaAsset[];
  const validCurrentManifest =
    manifest.version === 2 &&
    Number.isInteger(manifest.schemaVersion) &&
    (manifest.schemaVersion ?? 0) >= 1 &&
    (manifest.schemaVersion ?? 0) <= CAIZEN_BACKUP_SCHEMA_VERSION &&
    Array.isArray(manifest.profiles) &&
    manifest.profiles.every(profile =>
      typeof profile.id === 'string' &&
      typeof profile.name === 'string',
    ) &&
    Array.isArray(manifest.media) &&
    manifest.media.every(item =>
      typeof item.id === 'string' &&
      (item.archivePath === null || (
        typeof item.archivePath === 'string' &&
        item.archivePath.startsWith('media/') &&
        safeArchivePath(item.archivePath)
      )) &&
      typeof item.fileName === 'string' &&
      typeof item.mimeType === 'string' &&
      Number.isSafeInteger(item.sizeBytes) &&
      item.sizeBytes >= 0 &&
      (item.checksum === undefined || (typeof item.checksum === 'string' && SHA256_HEX.test(item.checksum))),
    );
  if (
    manifest.format !== 'caizen-backup' ||
    (manifest.version !== 1 && !validCurrentManifest) ||
    !Array.isArray(rawState.profiles) ||
    !Array.isArray(media) ||
    hasForbiddenKey(manifest) ||
    hasForbiddenKey(rawState) ||
    hasForbiddenKey(media)
  ) {
    throw new Error('The backup format or schema is invalid.');
  }
  const existingProfileIds =
    (await loadAppState())?.profiles.map((profile) => profile.id) ?? [];
  const existingIds = new Set(existingProfileIds);
  const prepared = prepareImport(rawState, existingProfileIds);
  if (manifest.version === 2) {
    const manifestProfiles = manifest.profiles ?? [];
    const profilesMatch =
      manifestProfiles.length === prepared.state.profiles.length &&
      prepared.state.profiles.every(profile =>
        manifestProfiles.some(item => item.id === profile.id && item.name === profile.name),
      );
    const manifestMediaIds = manifest.media?.map(item => item.id) ?? [];
    const mediaMatch =
      manifestMediaIds.length === media.length &&
      new Set(manifestMediaIds).size === manifestMediaIds.length &&
      media.every(asset => manifestMediaIds.includes(asset.id));
    if (!profilesMatch || !mediaMatch) {
      throw new Error('The backup manifest does not match its data or media index.');
    }
  }
  for (const asset of media) {
    const manifestItem = manifest.media?.find(item => item.id === asset.id);
    if (
      manifestItem?.checksum &&
      asset.checksum &&
      manifestItem.checksum !== asset.checksum
    ) {
      throw new Error('The backup manifest checksum does not match its media index.');
    }
    const expectedChecksum = manifestItem?.checksum ?? asset.checksum;
    const archivePath = manifestItem?.archivePath;
    if (!expectedChecksum || !archivePath || !archive[archivePath]) continue;
    if (await sha256Bytes(archive[archivePath]) !== expectedChecksum) {
      throw new Error(`The media bytes for ${asset.fileName} do not match the recorded checksum.`);
    }
  }
  const mediaEntries = new Set(Object.keys(archive).filter((name) => name.startsWith('media/files/')));
  return {
    manifest,
    profiles: prepared.state.profiles.map((profile) => ({ id: profile.id, name: profile.name })),
    collisions: prepared.state.profiles
      .filter((profile) => existingIds.has(profile.id))
      .map((profile) => profile.id),
    missingMedia: media
      .filter((asset) => {
        const manifestItem = manifest.media?.find(item => item.id === asset.id);
        const hasArchiveFile = manifest.version === 2
          ? Boolean(manifestItem?.archivePath && archive[manifestItem.archivePath])
          : [...mediaEntries].some((name) => name.startsWith(`media/files/${asset.id}.`));
        // A remotePath is useful to a live resolver, but it does not make a
        // local archive self-contained. Complete backups must contain bytes.
        return !hasArchiveFile;
      })
      .map((asset) => asset.id),
    integrity: prepared.report,
  };
}

export type RecoverySnapshot = {
  createdAt: string;
  schemaVersion: number;
  profileCount: number;
  source: 'json' | 'complete-backup' | 'cloud';
};

const RECOVERY_KEY = 'preImportRecovery';

/**
 * The snapshot taken immediately before an import overwrites local data.
 *
 * This was previously write-only - nothing in the codebase ever read it - so a
 * failed import left the user with no way back. `restorePreImportSnapshot`
 * below is the recovery path the import UI offers.
 */
export async function getPreImportRecovery(): Promise<RecoverySnapshot | null> {
  const stored = await getStoreValue<{
    key: string;
    value: StoredAppState | null;
    createdAt?: string;
    schemaVersion?: number;
    source?: RecoverySnapshot['source'];
  }>(STORES.settings, RECOVERY_KEY);
  if (!stored?.value?.profiles?.length) return null;
  return {
    createdAt: stored.createdAt ?? '',
    schemaVersion: stored.schemaVersion ?? CAIZEN_BACKUP_SCHEMA_VERSION,
    profileCount: stored.value.profiles.length,
    source: stored.source ?? 'json',
  };
}

/** Rolls the database back to the snapshot taken before the last import. */
export async function restorePreImportSnapshot(): Promise<void> {
  return withRealWorkspaceOperation(restorePreImportSnapshotInternal);
}
async function restorePreImportSnapshotInternal(): Promise<void> {
  const stored = await getStoreValue<{ key: string; value: StoredAppState | null }>(
    STORES.settings,
    RECOVERY_KEY,
  );
  if (!stored?.value?.profiles?.length) {
    throw new Error('No recovery snapshot is available on this device.');
  }
  assertRealWorkspace();
  await replaceAppState(stored.value);
}

async function commitPreparedImport(
  prepared: PreparedImport,
  mode: 'new-profiles' | 'merge' | 'replace' | 'replace-profile',
  source: RecoverySnapshot['source'] = 'json',
  options: {
    workspaceWrite?: WorkspaceWriteOptions;
    preserveRecovery?: boolean;
    removeProfileIds?: string[];
    /** Final destructive-commit fence, invoked after recovery is durable. */
    beforeReplace?: () => Promise<void>;
    /** Synchronous last-moment assertion immediately before replacement. */
    assertBeforeReplace?: () => void;
  } = {},
) {
  if (!prepared.report.canImport) {
    throw new Error(
      'The import contains invalid, missing, or duplicate record dates. Review the warning report before importing.',
    );
  }
  const current = await loadAppState();

  const importedState: StoredAppState = mode === 'replace-profile'
    ? (() => {
        const incoming = prepared.state.profiles[0];
        if (!incoming || prepared.state.profiles.length !== 1) {
          throw new Error('A profile cloud backup must contain exactly one profile.');
        }
        if (!current) return structuredClone(prepared.state);
        const exists = current.profiles.some((profile) => profile.id === incoming.id);
        const removeIds = new Set(options.removeProfileIds ?? []);
        if (removeIds.has(incoming.id)) {
          throw new Error('A Cloud restore cannot remove the profile it is restoring.');
        }
        return {
          profiles: [
            ...current.profiles.filter(profile => !removeIds.has(profile.id)),
            ...(exists ? [] : [structuredClone(incoming)]),
          ].map(profile =>
            profile.id === incoming.id ? structuredClone(incoming) : profile,
          ),
          currentProfileId: incoming.id,
        };
      })()
    : createProfilesForImport(
        prepared.state,
        current,
      mode,
    );

  for (const profile of importedState.profiles) {
    queueExpiredTrashMediaCleanup(profile.id, profile.trashItems);
  }

  const nextState: StoredAppState = {
    ...importedState,
    profiles: importedState.profiles.map(profile => ({
      ...profile,
      trashItems: removeExpiredTrashItems(profile.trashItems),
    })),
  };

  const expectedRecordTotal = Object.values(
    prepared.report.recordCounts as Record<string, number>,
  ).reduce((sum, count) => sum + count, 0);
  if (expectedRecordTotal > 0 && nextState.profiles.every((p) => countProfileRecords(p) === 0)) {
    // Matches failure mode "success reported when zero records were written":
    // the preview promised records but the state about to be committed has
    // none of them anywhere, in any profile. Fail loudly instead of writing
    // an empty result and reporting success.
    throw new Error(
      'Import aborted: the prepared state contains no records even though the preview reported ' +
        `${expectedRecordTotal}. This indicates a profile-ID mapping or merge bug, not a data problem.`,
    );
  }

  // Snapshot before touching anything, so the recovery path exists even if the
  // write below fails in a way the compensating rewrite cannot undo.
  if (!options.preserveRecovery) await putStoreValue(STORES.settings, {
    key: RECOVERY_KEY,
    value: current,
    createdAt: new Date().toISOString(),
    schemaVersion: CAIZEN_BACKUP_SCHEMA_VERSION,
    source,
  });

  // Cloud restore supplies an exact account/snapshot/local-state assertion at
  // this boundary. The recovery snapshot is already durable, and no
  // destructive replacement is attempted when the assertion rejects.
  await options.beforeReplace?.();
  // Keep this synchronous hook directly adjacent to replaceAppState. Cloud
  // restore uses it for the media-session token so an account switch cannot
  // slip between the async fence and the destructive local mutation.
  options.assertBeforeReplace?.();

  try {
    // saveAppState uses one IndexedDB transaction for profiles, records, and settings.
    await replaceAppState(nextState, options.workspaceWrite);
  } catch (error) {
    if (current && !options.workspaceWrite) {
      try {
        await replaceAppState(current);
      } catch {
        // The compensating rewrite itself failed. The snapshot above is still
        // intact, so surface the recovery path rather than the raw failure.
        throw new Error(
          'The import failed and local data could not be restored automatically. ' +
            'Use "Restore previous data" to roll back to the snapshot taken before this import.',
        );
      }
    }
    throw error;
  }

  // Read back immediately, bypassing React state, and verify that the database
  // contains the profiles and records we just committed. A resolved IndexedDB
  // transaction is not enough if a browser/storage failure silently produced
  // an incomplete result.
  const verified = await loadAppState();
  const expectedProfileIds = new Set(nextState.profiles.map((profile) => profile.id));
  const verifiedProfileIds = new Set(
    (verified?.profiles || []).map((profile) => profile.id),
  );
  const expectedStoredRecords = nextState.profiles.reduce(
    (sum, profile) => sum + countProfileRecords(profile),
    0,
  );
  const verifiedStoredRecords = (verified?.profiles || []).reduce(
    (sum, profile) => sum + countProfileRecords(profile),
    0,
  );
  const profileIdsMatch =
    expectedProfileIds.size === verifiedProfileIds.size &&
    [...expectedProfileIds].every((id) => verifiedProfileIds.has(id));
  const currentProfileMatches =
    verified?.currentProfileId === nextState.currentProfileId;

  if (
    !verified ||
    !profileIdsMatch ||
    !currentProfileMatches ||
    verifiedStoredRecords !== expectedStoredRecords
  ) {
    if (options.workspaceWrite) throw new Error('Demo import verification failed.');
    try {
      await replaceAppState(current ?? { profiles: [], currentProfileId: '' });
    } catch {
      throw new Error(
        'The import verification failed and local data could not be restored automatically. ' +
          'Use "Restore previous data" to roll back to the recovery snapshot.',
      );
    }

    throw new Error(
      'The import could not be verified after saving, so the previous local data was restored. ' +
        'No imported changes were kept.',
    );
  }

  return { current, nextState };
}

/** Counts array-valued records inside a profile and its `health` sub-object. Diagnostics only. */
function countProfileRecords(profile: unknown): number {
  if (!profile || typeof profile !== 'object') return 0;
  const record = profile as Record<string, unknown>;
  let total = 0;
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) total += value.length;
  }
  const health = record.health;
  if (health && typeof health === 'object') {
    for (const value of Object.values(health as Record<string, unknown>)) {
      if (Array.isArray(value)) total += value.length;
    }
  }
  return total;
}

export async function previewDataOnlyImport(
  json: string,
): Promise<PreparedImport> {
  assertDataOnlyJsonSize(new Blob([json]).size);
  const existingProfileIds =
    (await loadAppState())?.profiles.map((profile) => profile.id) ?? [];
  return parseAndPrepareImport(json, existingProfileIds);
}

async function sanitizeDataOnlyImport(
  prepared: PreparedImport,
  mode: 'new-profiles' | 'merge' | 'replace',
): Promise<PreparedImport> {
  const current = await loadAppState();
  const localAssets = await listMediaAssets();
  const localIdsByProfile = new Map<string, Set<string>>();
  for (const asset of localAssets) {
    const ids = localIdsByProfile.get(asset.profileId) || new Set<string>();
    ids.add(asset.id);
    localIdsByProfile.set(asset.profileId, ids);
  }
  const currentProfileIds = new Set(current?.profiles.map((profile) => profile.id) || []);

  const profiles = prepared.state.profiles.map((profile) => {
    // New-profile and replace imports have no portable media bytes. Merge may
    // retain references only when the target profile already exists locally.
    const allowedIds =
      mode === 'merge' && currentProfileIds.has(profile.id)
        ? localIdsByProfile.get(profile.id) || new Set<string>()
        : new Set<string>();
    return sanitizeMediaReferences(profile, allowedIds) as typeof profile;
  });

  return {
    ...prepared,
    state: {
      ...prepared.state,
      profiles,
    },
  };
}

export async function restoreDataOnlyImport(...args: Parameters<typeof restoreDataOnlyImportInternal>): Promise<void> {
  if (args[2]?.workspaceWrite) return restoreDataOnlyImportInternal(...args);
  return withRealWorkspaceOperation(() => restoreDataOnlyImportInternal(...args));
}

async function restoreDataOnlyImportInternal(
  prepared: PreparedImport,
  mode: 'new-profiles' | 'merge' | 'replace',
  options: { preserveExistingMedia?: boolean; workspaceWrite?: WorkspaceWriteOptions; preserveRecovery?: boolean } = {},
): Promise<void> {
  const current = await loadAppState();
  const currentMedia = await listMediaAssets();
  const sanitized = await sanitizeDataOnlyImport(prepared, mode);
  const committed = await commitPreparedImport(sanitized, mode, 'json', options);

  const retainedIds = collectMediaReferenceIds(committed.nextState);
  if (mode === 'replace' && !options.preserveExistingMedia) {
    for (const asset of currentMedia) {
      if (!retainedIds.has(asset.id)) {
        // Keep old media deletion profile-scoped and retryable after the
        // structured replacement has committed.
        queueMediaCleanup({
          profileId: asset.profileId,
          assetIds: [asset.id],
          reason: 'import-replaced',
        });
      }
    }
    try {
      await processPendingMediaCleanup();
    } catch {
      // The structured import is already committed. The durable cleanup queue
      // remains available for the next hydration/save retry and must not make
      // a successful data restore appear to have failed.
    }
  } else if (!current) {
    // Keep the branch explicit: a new-profile import on an empty workspace
    // still has no portable media and must never resolve stale local IDs.
    try {
      await processPendingMediaCleanup();
    } catch {
      // There is no structured state to roll back; retryable cleanup remains
      // durable if a prior job was present.
    }
  }
  if (!options.workspaceWrite) await putStoreValue(STORES.settings, {
    key: 'lastSuccessfulRestore',
    value: new Date().toISOString(),
    schemaVersion: CAIZEN_BACKUP_SCHEMA_VERSION,
    source: 'json',
  });
}

export async function restoreCloudProfileImport(
  prepared: PreparedImport,
  options: {
    removeProfileIds?: string[];
    beforeReplace?: () => Promise<void>;
    assertBeforeReplace?: () => void;
  } = {},
): Promise<void> {
  await commitPreparedImport(prepared, 'replace-profile', 'cloud', options);
  await putStoreValue(STORES.settings, {
    key: 'lastSuccessfulRestore',
    value: new Date().toISOString(),
    schemaVersion: CAIZEN_BACKUP_SCHEMA_VERSION,
    source: 'cloud',
  });
}

export async function restoreCompleteBackup(...args: Parameters<typeof restoreCompleteBackupInternal>): Promise<CompleteRestoreResult> {
  return withRealWorkspaceOperation(() => restoreCompleteBackupInternal(...args));
}

async function restoreCompleteBackupInternal(
  file: Blob,
  mode: 'new-profiles' | 'merge' | 'replace',
): Promise<CompleteRestoreResult> {
  const archive = await readArchive(file);
  const preview = await previewCompleteBackup(file);
  if (!preview.integrity.canImport) {
    throw new Error(
      'This backup contains invalid or missing dates. Review the import warnings before restoring.',
    );
  }
  const manifest = JSON.parse(strFromU8(archive['manifest.json'])) as CaizenBackupManifest;
  const imported = JSON.parse(strFromU8(archive['data.json'])) as StoredAppState;
  const media = JSON.parse(strFromU8(archive['media/index.json'])) as MediaAsset[];
  const prepared = prepareImport(
    imported,
    (await loadAppState())?.profiles.map((profile) => profile.id) ?? [],
  );

  const validatedMedia: Array<{ asset: MediaAsset; blob: Blob; fileName: string }> = [];
  const failedMedia: CompleteRestoreResult['failedMedia'] = [];
  const sourceProfileIds = new Set(prepared.state.profiles.map((profile) => profile.id));
  if (manifest.version === 2) {
    const indexedMediaIds = new Set(media.map((asset) => asset.id));
    const danglingReferences = [...collectMediaReferenceIds(prepared.state)].filter(
      (id) => !indexedMediaIds.has(id),
    );
    if (danglingReferences.length > 0) {
      throw new Error(
        `The backup references ${danglingReferences.length} media asset(s) missing from its media index.`,
      );
    }
  }
  const seenMediaIds = new Set<string>();
  for (const asset of media) {
    if (seenMediaIds.has(asset.id)) {
      failedMedia.push({
        id: asset.id,
        fileName: asset.fileName,
        message: 'The backup contains duplicate media metadata for this asset.',
      });
      continue;
    }
    seenMediaIds.add(asset.id);
    if (!sourceProfileIds.has(asset.profileId)) {
      failedMedia.push({
        id: asset.id,
        fileName: asset.fileName,
        message: 'The media asset belongs to a profile that is not present in this backup.',
      });
      continue;
    }
    const manifestPath = manifest.version === 2
      ? manifest.media?.find(item => item.id === asset.id)?.archivePath
      : null;
    const fileName = manifest.version === 2
      ? manifestPath ?? undefined
      : Object.keys(archive).find(name => name.startsWith(`media/files/${asset.id}.`));
    if (!fileName || !archive[fileName]) {
      failedMedia.push({
        id: asset.id,
        fileName: asset.fileName,
        message: 'The media bytes are not present in this archive.',
      });
      continue;
    }
    try {
      const blob = new Blob([archive[fileName]], { type: asset.mimeType });
      const manifestItem = manifest.version === 2
        ? manifest.media?.find((item) => item.id === asset.id)
        : undefined;
      if (manifestItem && blob.size !== manifestItem.sizeBytes) {
        throw new Error('The media bytes do not match the size recorded in the backup manifest.');
      }
      const expectedChecksum = manifestItem?.checksum ?? asset.checksum;
      if (expectedChecksum && await sha256Blob(blob) !== expectedChecksum) {
        throw new Error('The media bytes do not match the recorded checksum in the backup.');
      }
      await validateMediaBlob(blob, asset.fileName);
      validatedMedia.push({ asset, blob, fileName });
    } catch (error) {
      failedMedia.push({
        id: asset.id,
        fileName: asset.fileName,
        message: error instanceof Error ? error.message : 'Media validation failed.',
      });
    }
  }

  // Resolve the post-import profile IDs without writing anything, so media can
  // be staged to its final location BEFORE the profile commit. Writing media
  // after the commit meant a media failure rolled profiles back but left the
  // already-written blobs orphaned on disk.
  const currentBefore = await loadAppState();
  const currentMedia = await listMediaAssets();
  const currentMediaById = new Map(currentMedia.map((asset) => [asset.id, asset]));
  const usedMediaIds = new Set(currentMediaById.keys());
  const mediaIdMap = new Map<string, string>();
  const incomingMediaIds = new Set([
    ...media.map((asset) => asset.id),
    ...collectMediaReferenceIds(prepared.state),
  ]);
  for (const mediaId of incomingMediaIds) {
    const existing = currentMediaById.get(mediaId);
    if (!existing) continue;
    const incomingAsset = media.find((asset) => asset.id === mediaId);
    // A merge of the same profile treats an existing asset ID as the same
    // logical file and may update it in place. New-profile and full-replace
    // imports must isolate every collision because their ownership changes.
    if (mode === 'merge' && incomingAsset?.profileId === existing.profileId) {
      continue;
    }

    let nextId = crypto.randomUUID();
    while (usedMediaIds.has(nextId)) nextId = crypto.randomUUID();
    usedMediaIds.add(nextId);
    mediaIdMap.set(mediaId, nextId);
  }
  if (mediaIdMap.size > 0) {
    prepared.state = remapMediaReferences(prepared.state, mediaIdMap) as StoredAppState;
  }
  const projected = createProfilesForImport(prepared.state, currentBefore, mode);
  const projectedImported =
    mode === 'new-profiles' && currentBefore
      ? projected.profiles.slice(currentBefore.profiles.length)
      : projected.profiles;
  const idMap = new Map(
    prepared.state.profiles.map((profile, index) => [
      profile.id,
      projectedImported[index]?.id ?? profile.id,
    ]),
  );

  let restoredMediaCount = 0;
  const stagedMedia: Array<{
    asset: MediaAsset;
    previous?: MediaAsset;
    previousBlob?: Blob;
    previousThumbnail?: Blob;
  }> = [];
  for (const { asset, blob } of validatedMedia) {
    let restoredAsset: MediaAsset | undefined;
    let previous: MediaAsset | undefined;
    let previousBlob: Blob | undefined;
    let previousThumbnail: Blob | undefined;
    let nativePath: string | undefined;
    let bytesWritten = false;
    try {
      const profileId = idMap.get(asset.profileId) ?? asset.profileId;
      restoredAsset = {
        ...asset,
        id: mediaIdMap.get(asset.id) ?? asset.id,
        profileId,
        // Bytes from a complete portable archive are authoritative on this
        // device. The source remotePath remains in the archive provenance, but
        // it must not make the restored copy eligible for Cloud cache eviction.
        remotePath: undefined,
        syncStatus: 'local-only',
      };
      previous = await getMediaAsset(restoredAsset.id);
      if (previous) {
        previousThumbnail = await getMediaBlob(restoredAsset.id, 'thumbnail');
        try {
          previousBlob = await mediaStorage.read(restoredAsset.id, restoredAsset.profileId);
        } catch {
          if (!previous.remotePath) {
            throw new Error(
              'The existing local media file could not be read, so this restore skipped it to protect the current copy.',
            );
          }
          // A remote-backed row without a readable local copy is a
          // rebuildable Cloud cache. The portable archive is authoritative
          // for this restore, so it may replace that metadata and cache.
        }
      }
      // Replacing a cached blob must not leave an object URL pointing at the
      // old bytes. Consumers will acquire a fresh URL after the commit.
      revokeMediaDisplayUrls(restoredAsset.id);
      if (isNativeApp()) {
        const extension = sanitizeFileName(asset.fileName).split('.').pop() || 'bin';
        const localPath = `media/${profileId}/${restoredAsset.id}/${restoredAsset.id}.${extension}`;
        nativePath = localPath;
        await writePrivateMedia(localPath, blob);
        bytesWritten = true;
        await putMediaAsset({ ...restoredAsset, localPath, thumbnailPath: undefined });
      } else {
        await putMediaBlob(restoredAsset.id, blob, 'full');
        bytesWritten = true;
        await putMediaAsset({ ...restoredAsset, localPath: undefined, thumbnailPath: undefined });
      }
      stagedMedia.push({ asset: restoredAsset, previous, previousBlob, previousThumbnail });
      restoredMediaCount += 1;
    } catch (error) {
      // A failed metadata write must also remove the bytes just staged for
      // this asset. `mediaStorage.delete` intentionally no-ops without a
      // metadata row, so compensate the pre-commit write directly in that
      // case; otherwise a failed restore quietly leaves an orphan blob/file.
      let compensationFailure: string | null = null;
      if (
        restoredAsset &&
        (bytesWritten || nativePath) &&
        !stagedMedia.some(({ asset: staged }) => staged.id === restoredAsset?.id)
      ) {
        try {
          if (previous && previousBlob) {
            await putMediaAsset(previous);
            if (isNativeApp() && previous.localPath) {
              await writePrivateMedia(previous.localPath, previousBlob);
              if (nativePath !== previous.localPath) {
                await deletePrivateMedia(nativePath);
              }
            } else {
              await putMediaBlob(previous.id, previousBlob, 'full');
            }
          } else if (previous) {
            await putMediaAsset(previous);
            if (isNativeApp() && nativePath) {
              await deletePrivateMedia(nativePath);
            } else if (!isNativeApp() && bytesWritten) {
              await deleteMediaBlobs(restoredAsset.id);
              if (previousThumbnail) {
                await putMediaBlob(restoredAsset.id, previousThumbnail, 'thumbnail');
              }
            }
          } else {
            const committed = await getMediaAsset(restoredAsset.id).catch(() => undefined);
            if (committed) {
              await mediaStorage.delete(restoredAsset.id);
            } else if (nativePath) {
              await deletePrivateMedia(nativePath);
            } else if (bytesWritten) {
              await deleteMediaBlobs(restoredAsset.id);
            }
          }
        } catch (compensationError) {
          compensationFailure = compensationError instanceof Error
            ? compensationError.message
            : 'The previous media copy could not be restored.';
        }
      }
      const message = error instanceof Error ? error.message : 'Media restore failed.';
      failedMedia.push({
        id: asset.id,
        fileName: asset.fileName,
        message: compensationFailure
          ? `${message} Cleanup also failed: ${compensationFailure}`
          : message,
      });
    }
  }

  const mediaRollbackFailures: string[] = [];
  try {
    await commitPreparedImport(prepared, mode, 'complete-backup');
  } catch (error) {
    for (const staged of stagedMedia.reverse()) {
      try {
        if (staged.previous) {
          await putMediaAsset(staged.previous);
          if (staged.previousBlob) {
            if (isNativeApp() && staged.previous.localPath) {
              await writePrivateMedia(staged.previous.localPath, staged.previousBlob);
              if (
                staged.asset.localPath &&
                staged.asset.localPath !== staged.previous.localPath
              ) {
                await deletePrivateMedia(staged.asset.localPath);
              }
            } else {
              await putMediaBlob(staged.previous.id, staged.previousBlob, 'full');
            }
          } else if (!isNativeApp()) {
            await deleteMediaBlobs(staged.asset.id);
            if (staged.previousThumbnail) {
              await putMediaBlob(staged.asset.id, staged.previousThumbnail, 'thumbnail');
            }
          } else if (staged.asset.localPath) {
            await deletePrivateMedia(staged.asset.localPath);
          }
        } else {
          await mediaStorage.delete(staged.asset.id);
        }
      } catch (compensationError) {
        mediaRollbackFailures.push(
          compensationError instanceof Error
            ? compensationError.message
            : 'The staged media could not be rolled back.',
        );
      }
    }
    if (mediaRollbackFailures.length > 0) {
      throw new Error(
        `${error instanceof Error ? error.message : 'The structured import failed.'} ` +
          `The structured-data restore did not complete cleanly, and ${mediaRollbackFailures.length} staged managed media ` +
          `${mediaRollbackFailures.length === 1 ? 'file could not' : 'files could not'} be rolled back. ` +
          'The local recovery copy covers structured data only; review the media diagnostics before retrying.',
      );
    }
    throw error;
  }

  // A complete backup may contain an already-expired collection Trash row.
  // The commit removes that row after queueing its references; run the same
  // reference-aware worker now so those restored bytes do not wait for a
  // later launch, while shared/current references remain protected.
  try {
    await processPendingMediaCleanup();
  } catch {
    // The durable queue remains available for the next hydration/save retry.
  }

  if (isNativeApp()) {
    for (const staged of stagedMedia) {
      const oldPath = staged.previous?.localPath;
      if (!oldPath || oldPath === staged.asset.localPath) continue;
      await deletePrivateMedia(oldPath);
      if (await privateMediaExists(oldPath)) {
        failedMedia.push({
          id: staged.asset.id,
          fileName: staged.asset.fileName,
          message: 'The restored media is available, but its previous local file could not be removed.',
        });
      }
    }
  }

  // A partial archive must not turn an old, still-readable local asset into
  // data loss merely because its replacement bytes were absent or invalid.
  // Only prune the old replace target after every imported asset committed.
  if (mode === 'replace' && failedMedia.length === 0) {
    const restoredMediaIds = new Set(
      stagedMedia.map(({ asset }) => asset.id),
    );
    for (const existing of currentMedia) {
      if (restoredMediaIds.has(existing.id)) continue;
      try {
        await mediaStorage.delete(existing.id);
      } catch (error) {
        failedMedia.push({
          id: existing.id,
          fileName: existing.fileName,
          message: error instanceof Error
            ? `The previous media file could not be removed: ${error.message}`
            : 'The previous media file could not be removed.',
        });
      }
    }
  }

  await putStoreValue(STORES.settings, {
    key: 'lastSuccessfulRestore',
    value: new Date().toISOString(),
    schemaVersion: CAIZEN_BACKUP_SCHEMA_VERSION,
    source: 'complete-backup',
  });
  return {
    status: failedMedia.length ? 'partial' : 'success',
    restoredMediaCount,
    failedMedia,
  };
}

export async function getBackupHistory() {
  return getAllStoreValues(STORES.backupHistory);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const safeFileName = sanitizeFileName(fileName);
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(blob);
  try {
    anchor.href = url;
    anchor.download = safeFileName;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Give the browser time to consume the URL after the download handoff.
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

/** Uses ACTION_CREATE_DOCUMENT on Android while preserving browser downloads. */
export async function downloadBackupBlob(
  blob: Blob,
  fileName: string,
  mimeType = 'application/vnd.caizen.backup',
): Promise<void> {
  if (!isAndroid()) {
    downloadBlob(blob, fileName);
    return;
  }

  const tempPath = `backups/${crypto.randomUUID()}.caizen`;
  await writePrivateMedia(tempPath, blob);
  try {
    await CaizenNative.saveAs({
      sourcePath: await privateMediaSourceUri(tempPath),
      fileName: sanitizeFileName(fileName),
      mimeType,
    });
  } finally {
    await deletePrivateMedia(tempPath);
  }
}
