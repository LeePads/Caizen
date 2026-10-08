import type {
  CaizenCloudBackup,
  CaizenMediaAsset,
  CaizenMediaRole,
  Profile,
} from './types';
import { getSupabaseClient } from './supabase';

const PROFILE_BACKUPS_TABLE = 'caizen_profile_backups';
const MEDIA_ASSETS_TABLE = 'caizen_media_assets';
const PRIVATE_MEDIA_BUCKET = 'caizen-private';
const CLOUD_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

const PROFILE_BACKUP_COLUMNS =
  'id, user_id, profile_id, schema_version, data, created_at, updated_at';
const PROFILE_BACKUP_METADATA_COLUMNS =
  'id, user_id, profile_id, schema_version, created_at, updated_at';
const MEDIA_ASSET_COLUMNS =
  'id, user_id, profile_id, record_type, record_id, role, storage_path, original_name, mime_type, size_bytes, checksum, width, height, created_at, updated_at, deleted_at';
const MEDIA_ASSET_METADATA_COLUMNS = 'profile_id, size_bytes';

const FORBIDDEN_BACKUP_KEYS = new Set([
  '__proto__',
  'constructor',
  'localPath',
  'prototype',
  'thumbnailPath',
]);
const DEVICE_ONLY_URI = /^(?:blob:|capacitor:|content:|file:)/i;
const BASE64_FILE = /^(?:data:[^;,]+;base64,|\/9j\/|iVBORw0KGgo|JVBERi0|UklGR)/i;
const DEVICE_FILE_PATH = /^(?:[a-z]:[\\/]|\\\\|\/(?:data|private|sdcard|storage|users|var)\/)/i;

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

type ProfileBackupRow = {
  id: string;
  user_id: string;
  profile_id: string;
  schema_version: number;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ProfileBackupMetadataRow = {
  id: string;
  user_id: string;
  profile_id: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
};

type MediaAssetRow = {
  id: string;
  user_id: string;
  profile_id: string;
  record_type: string;
  record_id: string;
  role: CaizenMediaRole;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  checksum: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type MediaAssetMetadataRow = {
  profile_id: string;
  size_bytes: number;
};

export type CaizenCloudProfileBackupMetadata = {
  id: string;
  userId: string;
  profileId: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type CaizenCloudSnapshotMedia = CaizenCloudProfileBackupMetadata & {
  media: unknown;
};

export type CaizenCloudMediaAssetMetadata = {
  profileId: string;
  sizeBytes: number;
};

export type UpsertCaizenProfileBackupInput = {
  profileId: Profile['id'];
  schemaVersion?: number;
  data: Record<string, unknown>;
  /**
   * The Cloud timestamp observed before the upload began. `null` means that
   * the caller is creating the first snapshot for this profile.
   */
  expectedUpdatedAt?: string | null;
};

export class CloudBackupBaselineChangedError extends Error {
  readonly code = 'cloud-backup-baseline-changed';

  constructor() {
    super('The Cloud snapshot changed while this backup was uploading.');
    this.name = 'CloudBackupBaselineChangedError';
  }
}

export type UpsertCaizenMediaAssetInput = {
  id: string;
  profileId: Profile['id'];
  recordType: string;
  recordId: string;
  role: CaizenMediaRole;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string | null;
  width?: number | null;
  height?: number | null;
  /** Preserve an existing owned object path when replacing its contents. */
  storagePath?: string;
};

let cachedCurrentUserId: string | undefined;
let currentUserLookup: Promise<string> | null = null;
let currentUserLookupGeneration = 0;
let metadataRevision = 0;
let backupMetadataFlight: {
  userId: string; revision: number; promise: Promise<CaizenCloudProfileBackupMetadata[]>;
} | null = null;
let mediaMetadataFlight: {
  userId: string; revision: number; promise: Promise<CaizenCloudMediaAssetMetadata[]>;
} | null = null;

const invalidateMetadataFlights = () => {
  metadataRevision += 1;
  backupMetadataFlight = null;
  mediaMetadataFlight = null;
};

/** Clears the repository-level auth lookup cache on sign-out/account change. */
export const invalidateCaizenCloudUserCache = (): void => {
  invalidateMetadataFlights();
  currentUserLookupGeneration += 1;
  cachedCurrentUserId = undefined;
  currentUserLookup = null;
};

const requireCurrentUserId = async (): Promise<string> => {
  if (cachedCurrentUserId) return cachedCurrentUserId;
  if (currentUserLookup) return currentUserLookup;

  const lookupGeneration = currentUserLookupGeneration;
  const lookup = (async () => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Please sign in before using cloud backup.');
    if (lookupGeneration !== currentUserLookupGeneration) {
      throw new Error('The Cloud session changed before the request completed.');
    }

    cachedCurrentUserId = data.user.id;
    return data.user.id;
  })();
  currentUserLookup = lookup;
  try {
    return await lookup;
  } finally {
    if (currentUserLookup === lookup) currentUserLookup = null;
  }
};

const assertPathSegment = (value: string, label: string) => {
  if (!value.trim() || /[\\/]/.test(value)) {
    throw new Error(`${label} must be a non-empty storage path segment.`);
  }
};

const assertOwnedStoragePath = (
  storagePath: string,
  userId: string,
  expected?: { profileId: string; mediaAssetId: string },
) => {
  const segments = storagePath.split('/');
  if (
    segments.length !== 4 ||
    segments.some((segment) => !segment) ||
    segments[0] !== userId ||
    (expected && (
      segments[1] !== expected.profileId ||
      segments[2] !== expected.mediaAssetId
    ))
  ) {
    throw new Error('The cloud media path is outside the signed-in user storage boundary.');
  }
};

const assertSafeBackupData = (
  value: unknown,
  seen = new WeakSet<object>(),
): void => {
  if (value === null || typeof value === 'boolean') return;

  if (typeof value === 'string') {
    if (
      DEVICE_ONLY_URI.test(value) ||
      BASE64_FILE.test(value) ||
      DEVICE_FILE_PATH.test(value) ||
      isTemporarySignedUrl(value)
    ) {
      throw new Error('Cloud backup data contains a device-only or inline file value.');
    }
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cloud backup data can only contain finite numbers.');
    }
    return;
  }

  if (typeof value !== 'object') {
    throw new Error('Cloud backup data must contain only serialized JSON values.');
  }

  if (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
  ) {
    throw new Error('Cloud backup data cannot contain binary file content.');
  }

  if (seen.has(value)) {
    throw new Error('Cloud backup data must be valid JSON without circular references.');
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => assertSafeBackupData(item, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Cloud backup data must be serialized before it is uploaded.');
    }
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_BACKUP_KEYS.has(key)) {
        throw new Error(`Cloud backup data cannot contain the ${key} field.`);
      }
      assertSafeBackupData(child, seen);
    }
  }

  seen.delete(value);
};

const mapProfileBackup = (row: ProfileBackupRow): CaizenCloudBackup => ({
  id: row.id,
  userId: row.user_id,
  profileId: row.profile_id,
  schemaVersion: row.schema_version,
  data: row.data,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapProfileBackupMetadata = (
  row: ProfileBackupMetadataRow,
): CaizenCloudProfileBackupMetadata => ({
  id: row.id,
  userId: row.user_id,
  profileId: row.profile_id,
  schemaVersion: row.schema_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapMediaAsset = (row: MediaAssetRow): CaizenMediaAsset => ({
  id: row.id,
  userId: row.user_id,
  profileId: row.profile_id,
  recordType: row.record_type,
  recordId: row.record_id,
  role: row.role,
  storagePath: row.storage_path,
  originalName: row.original_name,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  checksum: row.checksum,
  width: row.width,
  height: row.height,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

const mapMediaAssetMetadata = (
  row: MediaAssetMetadataRow,
): CaizenCloudMediaAssetMetadata => ({
  profileId: row.profile_id,
  sizeBytes: row.size_bytes,
});

export const buildCaizenMediaStoragePath = (
  userId: string,
  profileId: Profile['id'],
  mediaAssetId: string,
  mimeType: string,
): string => {
  assertPathSegment(userId, 'User ID');
  assertPathSegment(profileId, 'Profile ID');
  assertPathSegment(mediaAssetId, 'Media asset ID');

  const extension = CLOUD_EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? 'bin';
  return [
    userId,
    profileId,
    mediaAssetId,
    `${mediaAssetId}.${extension}`,
  ].join('/');
};

/** Deterministic private thumbnail object path; no database column is needed. */
export const buildCaizenMediaThumbnailStoragePath = (
  userId: string,
  profileId: Profile['id'],
  mediaAssetId: string,
  version?: string,
): string => {
  assertPathSegment(userId, 'User ID');
  assertPathSegment(profileId, 'Profile ID');
  assertPathSegment(mediaAssetId, 'Media asset ID');
  if (version != null) assertPathSegment(version, 'Media version');
  return `${userId}/${profileId}/${mediaAssetId}/${mediaAssetId}-thumbnail${version ? `-${version}` : ''}.webp`;
};

/**
 * Returns whether an authenticated private object exists without downloading
 * its contents. Supabase Storage's list operation is scoped to the validated
 * user/profile/asset folder, so a missing object can be repaired safely by a
 * later backup attempt.
 */
export async function caizenPrivateMediaExists(
  storagePath: string,
  expected?: { profileId: string; mediaAssetId: string },
): Promise<boolean> {
  const userId = await requireCurrentUserId();
  assertOwnedStoragePath(storagePath, userId, expected);
  const segments = storagePath.split('/');
  const folder = segments.slice(0, 3).join('/');
  const fileName = segments[3];
  const { data, error } = await getSupabaseClient().storage
    .from(PRIVATE_MEDIA_BUCKET)
    .list(folder, { limit: 1, search: fileName });

  if (error) throw new Error(error.message);
  return Boolean(data?.some((entry) => entry.name === fileName));
}

/** Enumerate one owned asset folder completely so full and thumbnail checks share a request. */
export async function listCaizenPrivateMediaFolder(
  storagePath: string,
  expected: { profileId: string; mediaAssetId: string },
): Promise<Set<string>> {
  const userId = await requireCurrentUserId();
  assertOwnedStoragePath(storagePath, userId, expected);
  const folder = storagePath.split('/').slice(0, 3).join('/');
  const names = new Set<string>();
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await getSupabaseClient().storage
      .from(PRIVATE_MEDIA_BUCKET)
      .list(folder, { limit: pageSize, offset });
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Cloud media folder could not be enumerated.');
    data.forEach(entry => names.add(entry.name));
    if (data.length < pageSize) return names;
  }
}

export async function upsertCaizenProfileBackup(
  input: UpsertCaizenProfileBackupInput,
): Promise<CaizenCloudProfileBackupMetadata> {
  assertPathSegment(input.profileId, 'Profile ID');
  assertSafeBackupData(input.data);

  const schemaVersion = input.schemaVersion ?? 1;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > 100) {
    throw new Error('Cloud backup schema version must be an integer from 1 to 100.');
  }

  const userId = await requireCurrentUserId();
  const payload = {
    user_id: userId,
    profile_id: input.profileId,
    schema_version: schemaVersion,
    data: input.data,
  };

  const query = getSupabaseClient().from(PROFILE_BACKUPS_TABLE);
  const { data, error } = input.expectedUpdatedAt === undefined
    ? await query
        .upsert(payload, { onConflict: 'user_id,profile_id' })
        .select(PROFILE_BACKUP_METADATA_COLUMNS)
        .single()
    : input.expectedUpdatedAt === null
      ? await query
          .insert(payload)
          .select(PROFILE_BACKUP_METADATA_COLUMNS)
          .single()
      : await query
          .update({
            schema_version: schemaVersion,
            data: input.data,
          })
          .eq('user_id', userId)
          .eq('profile_id', input.profileId)
          .eq('updated_at', input.expectedUpdatedAt)
          .select(PROFILE_BACKUP_METADATA_COLUMNS)
          .maybeSingle();

  if (
    input.expectedUpdatedAt !== undefined &&
    error?.code === '23505'
  ) {
    throw new CloudBackupBaselineChangedError();
  }

  if (input.expectedUpdatedAt !== undefined && !data && !error) {
    throw new CloudBackupBaselineChangedError();
  }

  if (error) throw new Error(error.message);
  invalidateMetadataFlights();
  return mapProfileBackupMetadata(data as ProfileBackupMetadataRow);
}

export async function getCaizenProfileBackupMetadata(profileId: Profile['id']): Promise<CaizenCloudProfileBackupMetadata | null> {
  const userId = await requireCurrentUserId();
  const { data, error } = await getSupabaseClient()
    .from(PROFILE_BACKUPS_TABLE)
    .select(PROFILE_BACKUP_METADATA_COLUMNS)
    .eq('user_id', userId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapProfileBackupMetadata(data as ProfileBackupMetadataRow) : null;
}

export async function listCaizenSnapshotMedia(): Promise<CaizenCloudSnapshotMedia[]> {
  const userId = await requireCurrentUserId();
  const rows: CaizenCloudSnapshotMedia[] = [];
  const pageSize = 500;
  for (let offset = 0; ;) {
    const { data, error, count } = await getSupabaseClient()
      .from(PROFILE_BACKUPS_TABLE)
      .select('id, user_id, profile_id, schema_version, created_at, updated_at, media:data->media', { count: 'exact' })
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || count == null || (data.length === 0 && offset < count)) {
      throw new Error('Cloud snapshot references could not be fully enumerated.');
    }
    rows.push(...data.map(row => ({
      ...mapProfileBackupMetadata(row as ProfileBackupMetadataRow),
      media: (row as { media?: unknown }).media,
    })));
    offset += data.length;
    if (offset >= count) return rows;
  }
}

export async function getCaizenProfileBackup(
  profileId: Profile['id'],
): Promise<CaizenCloudBackup | null> {
  const userId = await requireCurrentUserId();
  const { data, error } = await getSupabaseClient()
    .from(PROFILE_BACKUPS_TABLE)
    .select(PROFILE_BACKUP_COLUMNS)
    .eq('user_id', userId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapProfileBackup(data as ProfileBackupRow) : null;
}

export async function listCaizenProfileBackups(): Promise<CaizenCloudBackup[]> {
  const userId = await requireCurrentUserId();
  const { data, error } = await getSupabaseClient()
    .from(PROFILE_BACKUPS_TABLE)
    .select(PROFILE_BACKUP_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as ProfileBackupRow[]).map(mapProfileBackup);
}

/**
 * Lists only the fields needed to discover possible recovery candidates.
 * Snapshot data is intentionally excluded; full validation remains an
 * explicit Review/restore operation in the Cloud Backup surface.
 */
export async function listCaizenProfileBackupMetadata(): Promise<
  CaizenCloudProfileBackupMetadata[]
> {
  const userId = await requireCurrentUserId();
  const revision = metadataRevision;
  if (backupMetadataFlight?.userId === userId && backupMetadataFlight.revision === revision) {
    return backupMetadataFlight.promise;
  }
  const promise = (async () => {
    const rows: CaizenCloudProfileBackupMetadata[] = [];
    const pageSize = 500;
    for (let offset = 0; ;) {
      const { data, error, count } = await getSupabaseClient()
        .from(PROFILE_BACKUPS_TABLE)
        .select(PROFILE_BACKUP_METADATA_COLUMNS, { count: 'exact' })
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!data || count == null || (data.length === 0 && offset < count)) {
        throw new Error('Cloud backups could not be fully enumerated.');
      }
      rows.push(...(data as ProfileBackupMetadataRow[]).map(mapProfileBackupMetadata));
      offset += data.length;
      if (offset >= count) return rows;
    }
  })();
  backupMetadataFlight = { userId, revision, promise };
  try { return await promise; }
  finally { if (backupMetadataFlight?.promise === promise) backupMetadataFlight = null; }
}

export async function deleteCaizenProfileBackup(
  profileId: Profile['id'],
  expected?: { id?: string; updatedAt?: string },
): Promise<void> {
  const userId = await requireCurrentUserId();
  let query = getSupabaseClient()
    .from(PROFILE_BACKUPS_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('profile_id', profileId);
  if (expected?.id) query = query.eq('id', expected.id);
  if (expected?.updatedAt) query = query.eq('updated_at', expected.updatedAt);

  if (expected && (expected.id || expected.updatedAt)) {
    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new CloudBackupBaselineChangedError();
    invalidateMetadataFlights();
    return;
  }

  const { error } = await query;
  if (error) throw new Error(error.message);
  invalidateMetadataFlights();
}

export async function upsertCaizenMediaAsset(
  input: UpsertCaizenMediaAssetInput,
): Promise<CaizenMediaAsset> {
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) {
    throw new Error('Media size must be a non-negative safe integer.');
  }
  for (const [label, value] of [
    ['Record type', input.recordType],
    ['Record ID', input.recordId],
    ['Original name', input.originalName],
    ['MIME type', input.mimeType],
  ] as const) {
    if (!value.trim()) throw new Error(`${label} is required.`);
  }
  for (const [label, value] of [
    ['Width', input.width],
    ['Height', input.height],
  ] as const) {
    if (value != null && (!Number.isInteger(value) || value <= 0)) {
      throw new Error(`${label} must be a positive integer when provided.`);
    }
  }

  const userId = await requireCurrentUserId();
  const storagePath = input.storagePath ?? buildCaizenMediaStoragePath(
    userId,
    input.profileId,
    input.id,
    input.mimeType,
  );
  assertOwnedStoragePath(storagePath, userId, {
    profileId: input.profileId,
    mediaAssetId: input.id,
  });
  const { data, error } = await getSupabaseClient()
    .from(MEDIA_ASSETS_TABLE)
    .upsert(
      {
        id: input.id,
        user_id: userId,
        profile_id: input.profileId,
        record_type: input.recordType,
        record_id: input.recordId,
        role: input.role,
        storage_path: storagePath,
        original_name: input.originalName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        checksum: input.checksum ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        deleted_at: null,
      },
      { onConflict: 'user_id,id' },
    )
    .select(MEDIA_ASSET_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  invalidateMetadataFlights();
  return mapMediaAsset(data as MediaAssetRow);
}

export async function listCaizenMediaAssets(
  profileId: Profile['id'],
  options: { includeDeleted?: boolean } = {},
): Promise<CaizenMediaAsset[]> {
  const userId = await requireCurrentUserId();
  const rows: CaizenMediaAsset[] = [];
  const pageSize = 500;
  for (let offset = 0; ;) {
    let query = getSupabaseClient()
      .from(MEDIA_ASSETS_TABLE)
      .select(MEDIA_ASSET_COLUMNS, { count: 'exact' })
      .eq('user_id', userId)
      .eq('profile_id', profileId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (!options.includeDeleted) query = query.is('deleted_at', null);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    if (!data || count == null || (data.length === 0 && offset < count)) {
      throw new Error('Cloud media rows could not be fully enumerated.');
    }
    rows.push(...(data as MediaAssetRow[]).map(mapMediaAsset));
    offset += data.length;
    if (offset >= count) return rows;
  }
}

export async function listAllCaizenMediaAssets(): Promise<CaizenMediaAsset[]> {
  const userId = await requireCurrentUserId();
  const { data, error } = await getSupabaseClient()
    .from(MEDIA_ASSETS_TABLE)
    .select(MEDIA_ASSET_COLUMNS)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as MediaAssetRow[]).map(mapMediaAsset);
}

/**
 * Returns aggregate-safe active media metadata for recovery discovery. File
 * names, storage paths and record ownership are deliberately not selected.
 */
export async function listCaizenMediaAssetMetadata(): Promise<
  CaizenCloudMediaAssetMetadata[]
> {
  const userId = await requireCurrentUserId();
  const revision = metadataRevision;
  if (mediaMetadataFlight?.userId === userId && mediaMetadataFlight.revision === revision) {
    return mediaMetadataFlight.promise;
  }
  const promise = (async () => {
    const rows: CaizenCloudMediaAssetMetadata[] = [];
    const pageSize = 500;
    for (let offset = 0; ;) {
      const { data, error, count } = await getSupabaseClient()
        .from(MEDIA_ASSETS_TABLE)
        .select(MEDIA_ASSET_METADATA_COLUMNS, { count: 'exact' })
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!data || count == null || (data.length === 0 && offset < count)) {
        throw new Error('Cloud media totals could not be fully enumerated.');
      }
      rows.push(...(data as MediaAssetMetadataRow[]).map(mapMediaAssetMetadata));
      offset += data.length;
      if (offset >= count) return rows;
    }
  })();
  mediaMetadataFlight = { userId, revision, promise };
  try { return await promise; }
  finally { if (mediaMetadataFlight?.promise === promise) mediaMetadataFlight = null; }
}

export async function softDeleteCaizenMediaAsset(
  mediaAssetId: string,
  expected?: { profileId?: string },
): Promise<CaizenMediaAsset> {
  const userId = await requireCurrentUserId();
  let query = getSupabaseClient()
    .from(MEDIA_ASSETS_TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', mediaAssetId);
  if (expected?.profileId) query = query.eq('profile_id', expected.profileId);
  const { data, error } = await query.select(MEDIA_ASSET_COLUMNS).single();

  if (error) throw new Error(error.message);
  invalidateMetadataFlights();
  return mapMediaAsset(data as MediaAssetRow);
}

/** Permanently removes a user's cloud media ownership row after its object is gone. */
export async function deleteCaizenMediaAssetMetadata(
  mediaAssetId: string,
  expected?: { profileId?: string },
): Promise<void> {
  const userId = await requireCurrentUserId();
  let query = getSupabaseClient()
    .from(MEDIA_ASSETS_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('id', mediaAssetId);
  if (expected?.profileId) query = query.eq('profile_id', expected.profileId);
  const { error } = await query;

  if (error) throw new Error(error.message);
  invalidateMetadataFlights();
}

export async function uploadCaizenPrivateMedia(
  storagePath: string,
  blob: Blob,
  mimeType: string,
  expected?: { profileId: string; mediaAssetId: string },
): Promise<void> {
  const userId = await requireCurrentUserId();
  assertOwnedStoragePath(storagePath, userId, expected);

  const { error } = await getSupabaseClient().storage
    .from(PRIVATE_MEDIA_BUCKET)
    .upload(storagePath, blob, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) throw new Error(error.message);
}

export async function downloadCaizenPrivateMedia(
  storagePath: string,
  expected?: { profileId: string; mediaAssetId: string },
  signal?: AbortSignal,
): Promise<Blob> {
  const userId = await requireCurrentUserId();
  assertOwnedStoragePath(storagePath, userId, expected);

  const { data, error } = await getSupabaseClient().storage
    .from(PRIVATE_MEDIA_BUCKET)
    .download(storagePath, {}, signal ? { signal } : undefined);

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCaizenPrivateMedia(
  storagePath: string,
  expected?: { profileId: string; mediaAssetId: string },
): Promise<void> {
  const userId = await requireCurrentUserId();
  assertOwnedStoragePath(storagePath, userId, expected);

  const { error } = await getSupabaseClient().storage
    .from(PRIVATE_MEDIA_BUCKET)
    .remove([storagePath]);

  if (error) throw new Error(error.message);
}
