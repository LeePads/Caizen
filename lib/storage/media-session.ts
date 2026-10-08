/**
 * In-memory fence for Cloud-derived media work.
 *
 * The generation changes before sign-out/account changes clear the cache. A
 * resolver may finish its network request after that point, but it cannot
 * enter a guarded media commit with the old token. Commits already in
 * progress are drained before cache cleanup starts.
 */
export type MediaSessionToken = {
  generation: number;
  userId: string;
};

let generation = 0;
let activeUserId: string | null = null;
let suspended = false;
let activeCommits = 0;
let drainPromise: Promise<void> | null = null;
let resolveDrain: (() => void) | null = null;

export class MediaSessionInvalidatedError extends Error {
  constructor() {
    super('The Cloud media session changed before the media operation completed.');
    this.name = 'MediaSessionInvalidatedError';
  }
}

export function setMediaSessionUser(userId: string | null): void {
  suspended = false;
  if (activeUserId === userId) return;
  generation += 1;
  activeUserId = userId;
}

export function getMediaSessionToken(userId: string): MediaSessionToken {
  setMediaSessionUser(userId);
  return { generation, userId };
}

export function getMediaSessionGeneration(): number {
  return generation;
}

export function getMediaSessionUserId(): string | null {
  return activeUserId;
}

export function isMediaSessionSuspended(): boolean {
  return suspended;
}

export function isMediaSessionCurrent(token: MediaSessionToken): boolean {
  return !suspended && token.generation === generation && token.userId === activeUserId;
}

/** Invalidates old work and waits for any already-guarded commit to finish. */
export async function invalidateMediaSession(): Promise<void> {
  generation += 1;
  activeUserId = null;
  suspended = true;
  if (activeCommits === 0) return;
  if (!drainPromise) {
    drainPromise = new Promise<void>((resolve) => {
      resolveDrain = resolve;
    });
  }
  await drainPromise;
}

export async function withMediaSessionCommit<T>(
  token: MediaSessionToken,
  operation: () => Promise<T>,
): Promise<T> {
  if (!isMediaSessionCurrent(token)) throw new MediaSessionInvalidatedError();
  activeCommits += 1;
  try {
    if (!isMediaSessionCurrent(token)) throw new MediaSessionInvalidatedError();
    return await operation();
  } finally {
    activeCommits -= 1;
    if (activeCommits === 0 && resolveDrain) {
      const resolve = resolveDrain;
      resolveDrain = null;
      drainPromise = null;
      resolve();
    }
  }
}
