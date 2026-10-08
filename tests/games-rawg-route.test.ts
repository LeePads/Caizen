import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/games/rawg/route';

process.env.RAWG_API_KEY = 'test-key';

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function request(search: string) {
  return new Request(`http://localhost/api/games/rawg?${search}`);
}

describe('RAWG Games route', () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    ['popular', '-added', -365, 0],
    ['anticipated', '-added', 0, 365],
    ['coming-soon', 'released', 0, 90],
    ['recently-released', '-released', -60, 0],
  ])('maps the %s preset to its documented date window', async (preset, ordering, fromOffset, toOffset) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [], count: 0, next: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await GET(request(`mode=discover&preset=${preset}&page_size=6`));
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    const today = new Date();
    expect(url.searchParams.get('ordering')).toBe(ordering);
    expect(url.searchParams.get('dates')).toBe(`${dateKey(addDays(today, fromOffset))},${dateKey(addDays(today, toOffset))}`);
    expect(url.searchParams.get('exclude_parents')).toBe('true');
    expect(url.searchParams.get('exclude_additions')).toBe('true');
    expect(url.searchParams.get('page_size')).toBe('6');
  });

  it('keeps rating and Metacritic independent and omits unsafe store links', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 42,
      name: 'Preview Game',
      slug: 'preview-game',
      background_image: 'https://cdn.example.com/cover.jpg',
      released: '2026-08-24',
      rating: 4.25,
      metacritic: 87,
      genres: [{ id: 1, slug: 'action', name: 'Action' }],
      platforms: [{ platform: { name: 'PC' } }],
      developers: [{ name: 'Studio' }],
      publishers: [{ name: 'Publisher' }],
      short_screenshots: [{ image: 'https://cdn.example.com/shot.jpg' }, { image: 'http://unsafe.example.com/shot.jpg' }],
      stores: [
        { store: { name: 'Safe Store' }, url: 'https://store.example.com/game' },
        { store: { name: 'Unsafe Store' }, url: 'http://store.example.com/game' },
        { store: { name: 'Generated Store' } },
      ],
      description_raw: 'A factual description.',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request('mode=details&id=42'));
    const body = await response.json();
    expect(body).toMatchObject({ rating: 4.25, metacritic: 87, developers: ['Studio'], publishers: ['Publisher'], screenshots: ['https://cdn.example.com/shot.jpg'] });
    expect(body.stores).toEqual([{ name: 'Safe Store', url: 'https://store.example.com/game' }]);
  });

  it('normalizes provider genres and rejects an unvalidated genre filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ id: 4, slug: 'rpg', name: 'RPG' }, { id: 5, name: 'Missing slug' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const genres = await GET(request('mode=genres'));
    expect(await genres.json()).toEqual({ results: [{ id: '4', slug: 'rpg', name: 'RPG' }] });

    const invalid = await GET(request('mode=discover&preset=genre&genre=not%20a%20slug'));
    expect(invalid.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
