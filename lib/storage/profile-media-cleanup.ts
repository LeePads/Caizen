import { workspaceCleanupIsProtected } from './workspace-fence';
import { listMediaAssets } from './media-repository';
import { mediaStorage } from './media-storage';
import { loadAppState } from './app-repository';

const PENDING_CLEANUP_KEY = 'caizen-profile-media-cleanup-v1';

export type ProfileMediaCleanupResult = {
  profileId: string;
  attempted: number;
  deleted: number;
  failedIds: string[];
};

type PendingCleanup = {
  profileId: string;
  queuedAt: string;
};

const readPendingCleanups = (): PendingCleanup[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_CLEANUP_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PendingCleanup =>
        Boolean(item && typeof item.profileId === 'string' && item.profileId.trim()),
    );
  } catch {
    return [];
  }
};

const writePendingCleanups = (pending: PendingCleanup[]) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PENDING_CLEANUP_KEY, JSON.stringify(pending));
  } catch {
    // The cleanup itself remains best-effort when auxiliary storage is full.
  }
};

export function queueProfileMediaCleanup(profileId: string): void {
  if (!profileId.trim()) return;
  const pending = readPendingCleanups();
  if (pending.some(item => item.profileId === profileId)) return;
  writePendingCleanups([
    ...pending,
    { profileId, queuedAt: new Date().toISOString() },
  ]);
}

export function clearProfileMediaCleanup(profileId: string): void {
  writePendingCleanups(readPendingCleanups().filter(item => item.profileId !== profileId));
}

export function listPendingProfileMediaCleanups(): string[] {
  return readPendingCleanups().map(item => item.profileId);
}

/**
 * Remove only managed media owned by one profile.
 *
 * Profile data and media live in separate IndexedDB/native stores, so this
 * cannot be an atomic part of the profile save transaction. The caller should
 * surface failures and allow the cleanup to be retried; an orphaned byte is
 * safer than deleting a visible media record first.
 */
export async function cleanupProfileMedia(
  profileId: string,
): Promise<ProfileMediaCleanupResult> {
  if (await workspaceCleanupIsProtected()) return { profileId, attempted: 0, deleted: 0, failedIds: ['__workspace_transition__'] };
  if (!profileId.trim()) throw new Error('Profile ID is required for media cleanup.');

  // Profile state and managed media are separate stores. Never interpret a
  // stale deferred marker as permission to delete media while the profile is
  // present in the persisted state (for example after a failed profile save or
  // an undo/reappearance before a retry).
  const persisted = await loadAppState();
  if (persisted?.profiles.some(profile => profile.id === profileId)) {
    return { profileId, attempted: 0, deleted: 0, failedIds: [] };
  }

  const assets = await listMediaAssets(profileId);
  const failedIds: string[] = [];
  let deleted = 0;

  for (const asset of assets) {
    // Re-check immediately before each cross-store delete so a profile that
    // reappears while cleanup is in flight keeps all remaining media intact.
    if (await workspaceCleanupIsProtected()) { failedIds.push(asset.id); continue; }
    const latest = await loadAppState();
    if (latest?.profiles.some(profile => profile.id === profileId)) break;
    try {
      await mediaStorage.delete(asset.id);
      deleted += 1;
    } catch {
      // Continue so one damaged record does not prevent the other owned
      // assets from being cleaned up. The caller can retry failed IDs by
      // invoking this profile-scoped cleanup again.
      failedIds.push(asset.id);
    }
  }

  return {
    profileId,
    attempted: assets.length,
    deleted,
    failedIds,
  };
}

/** Retry interrupted profile cleanup after the next app hydration. */
export async function processPendingProfileMediaCleanups(): Promise<ProfileMediaCleanupResult[]> {
  if (await workspaceCleanupIsProtected()) return [];
  const results: ProfileMediaCleanupResult[] = [];
  for (const profileId of listPendingProfileMediaCleanups()) {
    try {
      const result = await cleanupProfileMedia(profileId);
      results.push(result);
      if (result.failedIds.length === 0) clearProfileMediaCleanup(profileId);
    } catch {
      results.push({
        profileId,
        attempted: 0,
        deleted: 0,
        failedIds: ['__enumeration__'],
      });
    }
  }
  return results;
}
