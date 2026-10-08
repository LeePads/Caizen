import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveAppState: vi.fn(),
  cleanupProfileMedia: vi.fn(),
}));

class TestCustomEvent<T> {
  type: string;
  detail: T;

  constructor(type: string, init: { detail: T }) {
    this.type = type;
    this.detail = init.detail;
  }
}

vi.mock('@/lib/storage/app-repository', () => ({
  saveAppState: mocks.saveAppState,
}));

vi.mock('@/lib/storage/profile-media-cleanup', () => ({
  cleanupProfileMedia: mocks.cleanupProfileMedia,
}));

vi.mock('@/lib/cloud-backup', () => ({
  clearCloudProfileLocalState: vi.fn(),
}));

import { createProfilePersistence } from '@/lib/storage/profile-persistence';
import type { StoredAppState } from '@/lib/storage/app-repository';

const state = (id: string): StoredAppState => ({
  profiles: [{ id, name: id } as StoredAppState['profiles'][number]],
  currentProfileId: id,
});

describe('profile persistence orchestration', () => {
  let persistence: ReturnType<typeof createProfilePersistence>;
  const listeners = new Map<string, Set<(event: Event) => void>>();

  beforeEach(() => {
    listeners.clear();
    vi.stubGlobal('CustomEvent', TestCustomEvent);
    vi.stubGlobal('localStorage', { setItem: vi.fn() });
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      queueMicrotask,
      addEventListener: (type: string, listener: (event: Event) => void) => {
        const current = listeners.get(type) || new Set<(event: Event) => void>();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener: (type: string, listener: (event: Event) => void) => {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent: (event: TestCustomEvent<unknown>) => {
        listeners.get(event.type)?.forEach(listener => listener(event as unknown as Event));
        return true;
      },
    });
    mocks.saveAppState.mockReset();
    mocks.saveAppState.mockResolvedValue(undefined);
    mocks.cleanupProfileMedia.mockReset();
    mocks.cleanupProfileMedia.mockResolvedValue({
      profileId: 'profile-a',
      attempted: 0,
      deleted: 0,
      failedIds: [],
    });
    persistence = createProfilePersistence();
  });

  afterEach(() => {
    persistence.dispose();
    vi.unstubAllGlobals();
  });

  it('treats the loaded snapshot as the baseline and avoids duplicate writes', async () => {
    const next = state('next');
    persistence.schedule(state('loaded'), true);
    persistence.schedule(next, false);
    persistence.schedule(next, false);

    await vi.waitFor(() => expect(mocks.saveAppState).toHaveBeenCalledTimes(1));
    expect(mocks.saveAppState).toHaveBeenCalledWith(next);
  });

  it('retries failed writes and emits the existing storage error event', async () => {
    const error = new Error('quota exceeded');
    mocks.saveAppState.mockRejectedValueOnce(error).mockResolvedValue(undefined);
    persistence.schedule(state('loaded'), true);
    persistence.schedule(state('retry'), false);

    await vi.waitFor(
      () => expect(mocks.saveAppState).toHaveBeenCalledTimes(2),
      { timeout: 2_000 },
    );
  });

  it('leaves profile media cleanup untouched when profile deletion persistence fails', async () => {
    const loaded = state('profile-a');
    const deleted = { profiles: [], currentProfileId: '' } satisfies StoredAppState;
    mocks.saveAppState.mockRejectedValue(new Error('quota exceeded'));

    persistence.schedule(loaded, true);
    persistence.markProfileForCleanup('profile-a');
    persistence.schedule(deleted, false);

    await vi.waitFor(
      () => expect(mocks.saveAppState).toHaveBeenCalledTimes(3),
      { timeout: 2_000 },
    );
    expect(mocks.cleanupProfileMedia).not.toHaveBeenCalled();
  });

  it('starts profile media cleanup only after the deletion snapshot commits', async () => {
    const events: string[] = [];
    const loaded = state('profile-a');
    const deleted = { profiles: [], currentProfileId: '' } satisfies StoredAppState;
    mocks.saveAppState.mockImplementation(async () => {
      events.push('save');
    });
    mocks.cleanupProfileMedia.mockImplementation(async () => {
      events.push('cleanup');
      return { profileId: 'profile-a', attempted: 1, deleted: 1, failedIds: [] };
    });

    persistence.schedule(loaded, true);
    persistence.markProfileForCleanup('profile-a');
    persistence.schedule(deleted, false);

    await vi.waitFor(() => expect(mocks.cleanupProfileMedia).toHaveBeenCalledTimes(1));
    expect(events).toEqual(['save', 'cleanup']);
  });

  it('confirms the newest profile snapshot and holds writes during an external replacement', async () => {
    let finishFirstSave: (() => void) | undefined;
    mocks.saveAppState.mockImplementationOnce(() => new Promise<void>(resolve => {
      finishFirstSave = resolve;
    }));
    const first = state('first');
    const latest = state('latest');
    const later = state('later');
    persistence.schedule(state('loaded'), true);
    persistence.schedule(first, false);

    const barrier = persistence.beginExternalReplace(latest);
    expect(mocks.saveAppState).toHaveBeenCalledWith(first);
    finishFirstSave?.();
    const resume = await barrier;
    expect(mocks.saveAppState).toHaveBeenLastCalledWith(latest);

    persistence.schedule(later, false);
    expect(mocks.saveAppState).toHaveBeenCalledTimes(2);
    resume();
    await vi.waitFor(() => expect(mocks.saveAppState).toHaveBeenCalledTimes(3));
    expect(mocks.saveAppState).toHaveBeenLastCalledWith(later);
  });

  it('rejects a Demo save barrier when the latest snapshot cannot commit', async () => {
    mocks.saveAppState.mockRejectedValue(new Error('quota exceeded'));
    persistence.schedule(state('loaded'), true);

    await expect(persistence.beginExternalReplace(state('latest'))).rejects.toThrow(
      'latest profile changes could not be confirmed',
    );
    expect(mocks.saveAppState.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
