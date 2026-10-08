import { workspaceCleanupIsProtected } from './workspace-fence';
import type { MediaAsset } from '../types';
import { loadAppState } from './app-repository';
import { getMediaAsset } from './media-repository';
import { mediaStorage } from './media-storage';
import { collectMediaReferenceIds } from './media-references';

const PENDING_MEDIA_CLEANUP_KEY = 'caizen-media-cleanup-v1';

export type MediaCleanupReason =
  | 'attachment-detached'
  | 'draft-cancelled'
  | 'record-deleted'
  | 'section-deleted'
  | 'import-replaced'
  | 'workspace-cleared';

export type PendingMediaCleanupJob = {
  profileId: string;
  assetIds: string[];
  reason: MediaCleanupReason;
  queuedAt: string;
};

type StoredCleanupQueue = {
  version: 1;
  jobs: PendingMediaCleanupJob[];
};

export type MediaCleanupResult = {
  attempted: number;
  deleted: number;
  failedIds: string[];
  pendingJobs: number;
};

const readQueue = (): PendingMediaCleanupJob[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(
      localStorage.getItem(PENDING_MEDIA_CLEANUP_KEY) || '{}',
    ) as Partial<StoredCleanupQueue>;
    if (parsed.version !== 1 || !Array.isArray(parsed.jobs)) return [];
    return parsed.jobs.filter(
      (job): job is PendingMediaCleanupJob =>
        Boolean(
          job &&
            typeof job.profileId === 'string' &&
            job.profileId.trim() &&
            Array.isArray(job.assetIds) &&
            job.assetIds.every((id) => typeof id === 'string' && id.trim()),
        ),
    );
  } catch {
    return [];
  }
};

const writeQueue = (jobs: PendingMediaCleanupJob[]) => {
  if (typeof localStorage === 'undefined') return;
  if (jobs.length === 0) {
    localStorage.removeItem(PENDING_MEDIA_CLEANUP_KEY);
    return;
  }
  localStorage.setItem(
    PENDING_MEDIA_CLEANUP_KEY,
    JSON.stringify({ version: 1, jobs }),
  );
};

export function listPendingMediaCleanupJobs(): PendingMediaCleanupJob[] {
  return readQueue().map((job) => ({ ...job, assetIds: [...job.assetIds] }));
}

export function queueMediaCleanup(input: {
  profileId: string;
  assetIds: Iterable<string>;
  reason: MediaCleanupReason;
}): void {
  if (!input.profileId.trim()) {
    throw new Error('Profile ID is required for media cleanup.');
  }
  const assetIds = [...new Set([...input.assetIds].filter((id) => id.trim()))];
  if (assetIds.length === 0) return;

  const jobs = readQueue();
  const existing = jobs.find((job) => job.profileId === input.profileId);
  if (existing) {
    existing.assetIds = [...new Set([...existing.assetIds, ...assetIds])];
    existing.reason = input.reason;
  } else {
    jobs.push({
      profileId: input.profileId,
      assetIds,
      reason: input.reason,
      queuedAt: new Date().toISOString(),
    });
  }
  writeQueue(jobs);
}

function reportMediaCleanupFailure(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('caizen-storage-error', { detail: message }));
}

/**
 * Queue cleanup without allowing an auxiliary localStorage failure to make a
 * completed structured mutation look rejected. Processing waits for the
 * existing post-save/startup retry path so IndexedDB reference checks observe
 * the committed profile snapshot rather than stale pre-mutation data.
 */
export function scheduleMediaCleanup(input: Parameters<typeof queueMediaCleanup>[0]): void {
  try {
    queueMediaCleanup(input);
  } catch (error) {
    reportMediaCleanupFailure(
      error instanceof Error
        ? `The record was saved, but managed media cleanup could not be queued: ${error.message}`
        : 'The record was saved, but managed media cleanup could not be queued.',
    );
  }
}

export function queueMediaCleanupForAssets(
  assets: Pick<MediaAsset, 'profileId' | 'id'>[],
  reason: MediaCleanupReason,
): void {
  const byProfile = new Map<string, string[]>();
  for (const asset of assets) {
    const ids = byProfile.get(asset.profileId) || [];
    ids.push(asset.id);
    byProfile.set(asset.profileId, ids);
  }
  for (const [profileId, assetIds] of byProfile) {
    queueMediaCleanup({ profileId, assetIds, reason });
  }
}

/**
 * Deletes only unreferenced assets from the durable queue. A profile mismatch
 * or a current reference is treated as a safe no-op, never as permission to
 * delete another profile's media.
 */
export async function processPendingMediaCleanup(): Promise<MediaCleanupResult> {
  const jobs = readQueue();
  if (await workspaceCleanupIsProtected()) return { attempted: 0, deleted: 0, failedIds: [], pendingJobs: jobs.length };
  if (jobs.length === 0) {
    return { attempted: 0, deleted: 0, failedIds: [], pendingJobs: 0 };
  }

  const state = await loadAppState();
  const referencedIds = collectMediaReferenceIds(state?.profiles || []);
  const nextJobs: PendingMediaCleanupJob[] = [];
  const failedIds: string[] = [];
  let attempted = 0;
  let deleted = 0;

  for (const job of jobs) {
    const remainingIds: string[] = [];
    for (const assetId of job.assetIds) {
      if (await workspaceCleanupIsProtected()) { remainingIds.push(assetId); continue; }
      const asset = await getMediaAsset(assetId);
      if (!asset || asset.profileId !== job.profileId || referencedIds.has(assetId)) {
        continue;
      }

      attempted += 1;
      try {
        await mediaStorage.delete(assetId);
        deleted += 1;
      } catch {
        remainingIds.push(assetId);
        failedIds.push(assetId);
      }
    }
    if (remainingIds.length > 0) {
      nextJobs.push({ ...job, assetIds: remainingIds });
    }
  }

  writeQueue(nextJobs);
  return {
    attempted,
    deleted,
    failedIds,
    pendingJobs: nextJobs.length,
  };
}
