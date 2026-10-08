import { cleanupProfileMedia } from './profile-media-cleanup';
import { saveAppState, type StoredAppState } from './app-repository';
import { endRuntimeTrace, startRuntimeTrace } from '../performance-trace';
import { clearMochiProfileState } from '../mochi/profile-state';

const LOCAL_MODIFIED_KEY = 'life-manager-local-modified-at';

export type ProfilePersistenceController = {
  schedule: (snapshot: StoredAppState, loadedExistingState: boolean) => void;
  flush: () => Promise<void>;
  beginExternalReplace: (snapshot: StoredAppState) => Promise<() => void>;
  markProfileForCleanup: (profileId: string) => void;
  clearPendingProfileCleanup: () => void;
  clearWorkspace: (currentSnapshot: StoredAppState) => Promise<StoredAppState>;
  dispose: () => void;
};

const isSameSnapshot = (first: StoredAppState | null, second: StoredAppState) =>
  Boolean(
    first &&
      first.profiles === second.profiles &&
      first.currentProfileId === second.currentProfileId,
  );

export function createProfilePersistence(): ProfilePersistenceController {
  let lastSavedSnapshot: StoredAppState | null = null;
  let queuedSnapshot: StoredAppState | null = null;
  const pendingProfileCleanup = new Set<string>();
  let paused = false;
  let saveInProgress = false;
  let retryTimer: number | null = null;

  const emitStorageError = (error: unknown) => {
    if (typeof window === 'undefined') return;
    const message =
      error instanceof Error
        ? error.message
        : 'Caizen could not save your latest changes.';
    window.dispatchEvent(new CustomEvent('caizen-storage-error', { detail: message }));
  };

  const flush = async () => {
    if (paused || saveInProgress || typeof window === 'undefined') return;
    saveInProgress = true;

    try {
      while (queuedSnapshot) {
        const pending = queuedSnapshot;
        queuedSnapshot = null;
        let lastError: unknown;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const indexedDbStartedAt = startRuntimeTrace('indexeddb-save');
            try {
              await saveAppState(pending);
            } finally {
              endRuntimeTrace('indexeddb-save', indexedDbStartedAt);
            }
            const queuedAfterCommitProfiles =
              (queuedSnapshot as StoredAppState | null)?.profiles ?? [];
            const cleanupProfileIds = [...pendingProfileCleanup].filter(
              profileId =>
                !pending.profiles.some(profile => profile.id === profileId) &&
                !queuedAfterCommitProfiles.some(profile => profile.id === profileId),
            );

            for (const profileId of pendingProfileCleanup) {
              if (queuedAfterCommitProfiles.some(profile => profile.id === profileId)) {
                pendingProfileCleanup.delete(profileId);
              }
            }

            if (cleanupProfileIds.length > 0) {
              const { clearCloudProfileLocalState } = await import('../cloud-backup');
              for (const profileId of cleanupProfileIds) {
                let mediaFailures: string[] = [];
                try {
                  mediaFailures = (await cleanupProfileMedia(profileId)).failedIds;
                } catch (error) {
                  mediaFailures = [
                    error instanceof Error
                      ? error.message
                      : 'Managed media could not be enumerated.',
                  ];
                }
                clearCloudProfileLocalState(profileId);
                clearMochiProfileState(profileId);
                if (mediaFailures.length === 0) pendingProfileCleanup.delete(profileId);
                if (mediaFailures.length && typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent('caizen:storage-warning', {
                      detail: {
                        message: `Profile deleted, but ${mediaFailures.length} media file(s) could not be removed.`,
                      },
                    }),
                  );
                }
              }
            }

            const previousById = new Map(
              lastSavedSnapshot?.profiles.map(profile => [profile.id, profile]) ?? [],
            );
            const changedProfileIds = pending.profiles
              .filter(profile => previousById.get(profile.id) !== profile)
              .map(profile => profile.id);
            const committedAt = new Date().toISOString();

            if (changedProfileIds.length > 0) {
              localStorage.setItem(LOCAL_MODIFIED_KEY, committedAt);
              changedProfileIds.forEach(profileId => {
                localStorage.setItem(`${LOCAL_MODIFIED_KEY}:${profileId}`, committedAt);
              });
            }

            lastSavedSnapshot = pending;
            window.dispatchEvent(
              new CustomEvent('caizen:local-save-complete', {
                detail: { changedProfileIds, committedAt },
              }),
            );
            lastError = undefined;
            if (retryTimer !== null) {
              window.clearTimeout(retryTimer);
              retryTimer = null;
            }
            break;
          } catch (error) {
            lastError = error;
            if (attempt < 2) {
              await new Promise(resolve => window.setTimeout(resolve, 300 * (attempt + 1)));
            }
          }
        }

        if (lastError) {
          if (!queuedSnapshot) queuedSnapshot = pending;
          emitStorageError(lastError);
          if (retryTimer === null) {
            retryTimer = window.setTimeout(() => {
              retryTimer = null;
              void flush();
            }, 15_000);
          }
          break;
        }
      }
    } finally {
      saveInProgress = false;
      if (queuedSnapshot && retryTimer === null) {
        window.queueMicrotask(() => void flush());
      }
    }
  };

  const schedule = (snapshot: StoredAppState, loadedExistingState: boolean) => {
    const schedulingStartedAt = startRuntimeTrace('persistence-schedule');
    try {
      if (typeof window === 'undefined') return;
      if (paused) {
        queuedSnapshot = snapshot;
        return;
      }
      if (!lastSavedSnapshot && loadedExistingState) {
        lastSavedSnapshot = snapshot;
        return;
      }
      if (isSameSnapshot(lastSavedSnapshot, snapshot)) {
        if (saveInProgress || queuedSnapshot) {
          queuedSnapshot = snapshot;
          void flush();
        }
        return;
      }
      queuedSnapshot = snapshot;
      void flush();
    } finally {
      endRuntimeTrace('persistence-schedule', schedulingStartedAt);
    }
  };

  // Demo and Cloud restore replace the repository outside AppProvider. Commit the latest React
  // snapshot first, then hold provider writes until the replacement reloads or
  // the caller restores the previous state and resumes normal persistence.
  const beginExternalReplace = async (snapshot: StoredAppState) => {
    if (typeof window === 'undefined' || paused) {
      throw new Error('Local profile storage is busy. Try again.');
    }
    schedule(snapshot, false);
    paused = true;
    let released = false;
    const resume = () => {
      if (released) return;
      released = true;
      paused = false;
      if (queuedSnapshot) void flush();
    };
    try {
      const deadline = Date.now() + 15_000;
      while (saveInProgress) {
        if (Date.now() >= deadline) {
          throw new Error('The latest profile changes could not be confirmed in local storage. Try again.');
        }
        await new Promise(resolve => window.setTimeout(resolve, 25));
      }
      if (!isSameSnapshot(lastSavedSnapshot, snapshot) || queuedSnapshot) {
        throw new Error('The latest profile changes could not be confirmed in local storage. Try again.');
      }
      return resume;
    } catch (error) {
      resume();
      throw error;
    }
  };

  const clearWorkspace = async (currentSnapshot: StoredAppState) => {
    if (typeof window === 'undefined') {
      throw new Error('Workspace storage is unavailable.');
    }
    if (paused) {
      throw new Error('Local profile storage is busy. Try again.');
    }

    paused = true;
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    queuedSnapshot = null;

    try {
      while (saveInProgress) {
        await new Promise(resolve => window.setTimeout(resolve, 25));
      }
      queuedSnapshot = null;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }

      const emptySnapshot: StoredAppState = { profiles: [], currentProfileId: '' };
      await saveAppState(emptySnapshot);
      lastSavedSnapshot = emptySnapshot;
      pendingProfileCleanup.clear();
      return emptySnapshot;
    } catch (error) {
      queuedSnapshot = currentSnapshot;
      throw error;
    } finally {
      paused = false;
      if (queuedSnapshot) window.queueMicrotask(() => void flush());
    }
  };

  return {
    schedule,
    flush,
    beginExternalReplace,
    markProfileForCleanup: profileId => pendingProfileCleanup.add(profileId),
    clearPendingProfileCleanup: () => pendingProfileCleanup.clear(),
    clearWorkspace,
    dispose: () => {
      if (retryTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    },
  };
}
