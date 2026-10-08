import { describe, expect, it, vi } from 'vitest';
import { formatBookProgress, getBookProgress, normalizeBook } from '@/lib/books';
import { discoverOpenLibraryBooks, searchOpenLibraryBooks } from '@/lib/books/open-library';

describe('Books', () => {
  it('normalizes page progress, clamps known totals, and omits unknown percentages', () => {
    const clamped = normalizeBook({
      id: 'book-1',
      title: 'A Book',
      currentPage: 500,
      totalPages: 100,
      status: 'reading',
    });

    expect(getBookProgress(clamped)).toMatchObject({
      currentPage: 100,
      totalPages: 100,
      percentage: 100,
    });
    expect(formatBookProgress(clamped)).toBe('100 / 100 pages (100%)');

    const unknownTotal = normalizeBook({ title: 'Unpaginated', currentPage: -4 });
    expect(getBookProgress(unknownTotal)).toMatchObject({ currentPage: 0, totalPages: undefined, percentage: undefined });
    expect(formatBookProgress(unknownTotal)).toBe('0 pages');
  });

  it('maps Open Library metadata and keeps requests bounded', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        numFound: 21,
        docs: [{
          key: '/works/OL123W',
          title: 'The Example Book',
          author_name: ['Example Author'],
          first_publish_year: 2026,
          isbn: ['1234567890'],
          isbn13: ['9781234567890'],
          cover_i: 42,
          number_of_pages_median: 240,
          subject: ['Fiction', 'Example'],
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const page = await searchOpenLibraryBooks('1234567890');
    const request = new URL(fetchMock.mock.calls[0][0] as string);

    expect(request.searchParams.get('isbn')).toBe('1234567890');
    expect(request.searchParams.get('limit')).toBe('20');
    expect(page).toMatchObject({ page: 1, hasNextPage: false });
    expect(page.results[0]).toMatchObject({
      title: 'The Example Book',
      authors: ['Example Author'],
      externalId: '/works/OL123W',
      isbn: '1234567890',
      isbn13: '9781234567890',
      totalPages: 240,
      cover: 'https://covers.openlibrary.org/b/id/42-M.jpg',
      source: 'openlibrary',
    });

    vi.unstubAllGlobals();
  });

  it('uses Open Library trending periods and provider-supported discovery ordering', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        works: [{
          key: '/works/OL456W',
          title: 'Trending Example',
          authors: [{ name: 'Trending Author' }],
          first_publish_year: 2026,
          cover_i: 84,
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const trending = await discoverOpenLibraryBooks({ mode: 'trending', trendingWindow: 'month', page: 2 });
    const trendingRequest = new URL(fetchMock.mock.calls[0][0] as string);
    expect(trendingRequest.pathname).toBe('/trending/monthly.json');
    expect(trendingRequest.searchParams.get('page')).toBe('2');
    expect(trendingRequest.searchParams.get('limit')).toBe('20');
    expect(trending.results[0]).toMatchObject({ title: 'Trending Example', authors: ['Trending Author'] });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        numFound: 21,
        docs: [{
          key: '/works/OL789W',
          title: 'Highly Rated Example',
          ratings_average: 4.7,
          ratings_count: 125,
        }],
      }),
    });
    const topRated = await discoverOpenLibraryBooks({ mode: 'top-rated' });
    const topRatedRequest = new URL(fetchMock.mock.calls[1][0] as string);
    expect(topRatedRequest.searchParams.get('sort')).toBe('rating');
    expect(topRatedRequest.searchParams.get('q')).toBe('ratings_count:[1 TO *]');
    expect(topRated.results[0]).toMatchObject({ providerRating: 4.7, providerRatingCount: 125 });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ docs: [] }),
    });
    await discoverOpenLibraryBooks({ mode: 'recent', year: 2025 });
    const recentRequest = new URL(fetchMock.mock.calls[2][0] as string);
    expect(recentRequest.searchParams.get('sort')).toBe('new');
    expect(recentRequest.searchParams.get('q')).toBe('first_publish_year:[2025 TO 2025]');

    vi.unstubAllGlobals();
  });
});
