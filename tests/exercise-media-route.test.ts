import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/exercise-media/route';

function request(search: string) {
  return new Request(`http://localhost/api/health/exercise-media?${search}`);
}

describe('Exercise media route', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves a valid gifUrl from a bare-object upstream response', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      expect(String(input)).toBe('https://oss.exercisedb.dev/api/v1/exercises/EIeI8Vf');
      return new Response(JSON.stringify({ exerciseId: 'EIeI8Vf', name: 'barbell bench press', gifUrl: 'https://static.exercisedb.dev/media/EIeI8Vf.gif' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('mediaId=EIeI8Vf'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ gifUrl: 'https://static.exercisedb.dev/media/EIeI8Vf.gif' });
  });

  it('tolerates a { data: {...} } wrapped upstream response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { gifUrl: 'https://static.exercisedb.dev/media/wrapped.gif' } }), { status: 200 })));
    const response = await GET(request('mediaId=wrapped-id'));
    expect(await response.json()).toEqual({ gifUrl: 'https://static.exercisedb.dev/media/wrapped.gif' });
  });

  it('tolerates a { data: [...] } wrapped upstream response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ gifUrl: 'https://static.exercisedb.dev/media/list.gif' }] }), { status: 200 })));
    const response = await GET(request('mediaId=list-id'));
    expect(await response.json()).toEqual({ gifUrl: 'https://static.exercisedb.dev/media/list.gif' });
  });

  it('returns null gifUrl (not an error) for a malformed JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    const response = await GET(request('mediaId=malformed'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ gifUrl: null });
  });

  it('returns null gifUrl for a non-https/malformed gifUrl value', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ gifUrl: 'not-a-url' }), { status: 200 })));
    expect(await (await GET(request('mediaId=bad-url'))).json()).toEqual({ gifUrl: null });
  });

  it('returns null gifUrl for an upstream non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    expect(await (await GET(request('mediaId=server-error'))).json()).toEqual({ gifUrl: null });
  });

  it('returns null gifUrl (never throws) on a timeout/abort', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('The operation was aborted', 'AbortError'); }));
    const response = await GET(request('mediaId=timeout-case'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ gifUrl: null });
  });

  it('rejects a mediaId outside the safe charset without calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('mediaId=' + encodeURIComponent('../etc/passwd')));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ gifUrl: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves a repeated lookup from the server-side cache without a second upstream call', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ gifUrl: 'https://static.exercisedb.dev/media/cache-id.gif' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await GET(request('mediaId=cache-id-route-test'));
    await GET(request('mediaId=cache-id-route-test'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
