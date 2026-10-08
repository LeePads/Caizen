import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearExerciseMediaCache, resolveRemoteExerciseAnimation } from '@/lib/health/exercise-media-provider';

const openGymExercise = { catalogSource: 'opengym' as const, catalogMediaId: '2gPfomN' };

afterEach(() => {
  clearExerciseMediaCache();
  vi.unstubAllGlobals();
});

describe('resolveRemoteExerciseAnimation', () => {
  it('resolves the current gifUrl for an openGym exercise via Caizen\'s own same-origin media route', async () => {
    const fetchMock = vi.fn(async (_input: string | URL) => new Response(JSON.stringify({ gifUrl: 'https://static.exercisedb.dev/media/2gPfomN.gif' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const url = await resolveRemoteExerciseAnimation(openGymExercise);
    expect(url).toBe('https://static.exercisedb.dev/media/2gPfomN.gif');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    // Same-origin proxy path, never the third-party host directly — avoids
    // depending on that host's undocumented CORS behavior.
    expect(requestedUrl).toContain('/api/health/exercise-media');
    expect(requestedUrl).toContain('mediaId=2gPfomN');
    expect(requestedUrl).not.toContain('oss.exercisedb.dev');
  });

  it('never returns a non-https or malformed URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ gifUrl: 'not-a-url' }), { status: 200 })));
    expect(await resolveRemoteExerciseAnimation({ catalogSource: 'opengym', catalogMediaId: 'bad-url' })).toBeNull();
  });

  it('falls back to null on a non-200 response, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    await expect(resolveRemoteExerciseAnimation({ catalogSource: 'opengym', catalogMediaId: 'server-error' })).resolves.toBeNull();
  });

  it('falls back to null on network failure/timeout, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('The operation was aborted', 'AbortError'); }));
    await expect(resolveRemoteExerciseAnimation({ catalogSource: 'opengym', catalogMediaId: 'timeout-case' })).resolves.toBeNull();
  });

  it('falls back to null on a malformed JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(resolveRemoteExerciseAnimation({ catalogSource: 'opengym', catalogMediaId: 'malformed' })).resolves.toBeNull();
  });

  it('never calls the network for non-openGym exercises or exercises without a media id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveRemoteExerciseAnimation({ catalogSource: undefined, catalogMediaId: 'abc' })).toBeNull();
    expect(await resolveRemoteExerciseAnimation({ catalogSource: 'opengym', catalogMediaId: undefined })).toBeNull();
    expect(await resolveRemoteExerciseAnimation(undefined)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent requests for the same exercise into a single network call', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ gifUrl: 'https://static.exercisedb.dev/media/dedupe.gif' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b, c] = await Promise.all([
      resolveRemoteExerciseAnimation({ catalogSource: 'opengym', catalogMediaId: 'dedupe-id' }),
      resolveRemoteExerciseAnimation({ catalogSource: 'opengym', catalogMediaId: 'dedupe-id' }),
      resolveRemoteExerciseAnimation({ catalogSource: 'opengym', catalogMediaId: 'dedupe-id' }),
    ]);
    expect([a, b, c]).toEqual(['https://static.exercisedb.dev/media/dedupe.gif', 'https://static.exercisedb.dev/media/dedupe.gif', 'https://static.exercisedb.dev/media/dedupe.gif']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves a second lookup from the in-memory cache without a second network call', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ gifUrl: 'https://static.exercisedb.dev/media/cached.gif' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await resolveRemoteExerciseAnimation({ catalogSource: 'opengym', catalogMediaId: 'cache-id' });
    await resolveRemoteExerciseAnimation({ catalogSource: 'opengym', catalogMediaId: 'cache-id' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never persists the resolved URL to localStorage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ gifUrl: 'https://static.exercisedb.dev/media/no-persist.gif' }), { status: 200 })));
    const before = localStorage.length;
    await resolveRemoteExerciseAnimation({ catalogSource: 'opengym', catalogMediaId: 'no-persist' });
    expect(localStorage.length).toBe(before);
  });
});
