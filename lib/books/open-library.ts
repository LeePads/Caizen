import type { BookItem } from '@/lib/types';

const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json';
const OPEN_LIBRARY_TRENDING_URL = 'https://openlibrary.org/trending';
const MAX_RESULTS = 20;

export type OpenLibraryBookResult = Pick<
  BookItem,
  'title' | 'authors' | 'cover' | 'externalId' | 'isbn' | 'isbn13' | 'publicationYear' | 'totalPages' | 'subjects'
> & {
  source: 'openlibrary';
  providerRating?: number;
  providerRatingCount?: number;
};

export function openLibraryBookToDraft(result: OpenLibraryBookResult): Partial<BookItem> {
  return {
    title: result.title,
    authors: result.authors,
    cover: result.cover,
    externalId: result.externalId,
    isbn: result.isbn,
    isbn13: result.isbn13,
    publicationYear: result.publicationYear,
    totalPages: result.totalPages,
    subjects: result.subjects,
    source: 'openlibrary',
    status: 'want-to-read',
    owned: false,
    format: 'other',
    currentPage: 0,
  };
}

export type OpenLibraryTrendingWindow = 'now' | 'today' | 'week' | 'month' | 'year' | 'all-time';
export type OpenLibraryDiscoveryMode = 'trending' | 'top-rated' | 'recent';

export interface OpenLibrarySearchPage {
  results: OpenLibraryBookResult[];
  page: number;
  hasNextPage: boolean;
  totalResults?: number;
}

export class OpenLibraryApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenLibraryApiError';
  }
}

type OpenLibraryDocument = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  edition_key?: string[];
  isbn?: string[];
  isbn13?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  subject?: string[];
  subjects?: string[];
  authors?: Array<{ name?: string }>;
  ratings_average?: number;
  ratings_count?: number;
};

function normalizedQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function isIsbnQuery(value: string) {
  return /^[\dXx-]{10,17}$/.test(value) && value.replace(/-/g, '').length >= 10;
}

function coverUrl(coverId?: number) {
  return Number.isInteger(coverId) && Number(coverId) > 0
    ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
    : undefined;
}

function mapDocument(document: OpenLibraryDocument): OpenLibraryBookResult | null {
  const title = document.title?.trim();
  const externalId = document.key?.trim() || document.edition_key?.[0]?.trim();
  if (!title || !externalId) return null;

  const isbn = document.isbn?.find(value => value?.trim())?.trim();
  const isbn13 = document.isbn13?.find(value => value?.trim())?.trim();
  const pages = Number(document.number_of_pages_median);
  const year = Number(document.first_publish_year);
  const rating = Number(document.ratings_average);
  const ratingCount = Number(document.ratings_count);

  return {
    title,
    authors: Array.from(new Set([
      ...(document.author_name || []),
      ...(document.authors || []).map(author => author.name || ''),
    ].map(value => value.trim()).filter(Boolean))),
    cover: coverUrl(document.cover_i),
    externalId,
    isbn,
    isbn13,
    publicationYear: Number.isInteger(year) && year > 0 ? year : undefined,
    totalPages: Number.isInteger(pages) && pages > 0 ? pages : undefined,
    subjects: Array.from(new Set([
      ...(document.subject || []),
      ...(document.subjects || []),
    ].map(value => value.trim()).filter(Boolean))).slice(0, 8),
    providerRating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
    providerRatingCount: Number.isInteger(ratingCount) && ratingCount > 0 ? ratingCount : undefined,
    source: 'openlibrary',
  };
}

function getTrendingPeriod(window: OpenLibraryTrendingWindow) {
  return {
    now: 'now',
    today: 'daily',
    week: 'weekly',
    month: 'monthly',
    year: 'yearly',
    'all-time': 'forever',
  }[window];
}

async function requestOpenLibraryPage(
  url: URL,
  safePage: number,
  signal?: AbortSignal,
): Promise<OpenLibrarySearchPage> {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new OpenLibraryApiError('Open Library could not be reached. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new OpenLibraryApiError(`Open Library returned ${response.status}. Try again shortly.`);
  }

  let payload: {
    docs?: OpenLibraryDocument[];
    works?: OpenLibraryDocument[];
    numFound?: number;
    num_found?: number;
    total?: number;
  } | OpenLibraryDocument[];
  try {
    payload = await response.json() as typeof payload;
  } catch {
    throw new OpenLibraryApiError('Open Library returned an invalid response.');
  }

  const documents = Array.isArray(payload) ? payload : payload.docs || payload.works || [];
  const results = documents.map(mapDocument).filter((item): item is OpenLibraryBookResult => Boolean(item));
  const totalResults = Array.isArray(payload) ? Number.NaN : Number(payload.numFound ?? payload.num_found ?? payload.total);
  return {
    results,
    page: safePage,
    hasNextPage: results.length === MAX_RESULTS && (!Number.isFinite(totalResults) || safePage * MAX_RESULTS < totalResults),
    totalResults: Number.isFinite(totalResults) ? totalResults : undefined,
  };
}

export async function searchOpenLibraryBooks(
  query: string,
  page = 1,
  signal?: AbortSignal,
): Promise<OpenLibrarySearchPage> {
  const normalized = normalizedQuery(query);
  const safePage = Math.max(1, Math.floor(page));
  if (normalized.length < 2) return { results: [], page: 1, hasNextPage: false };

  const url = new URL(OPEN_LIBRARY_SEARCH_URL);
  url.searchParams.set(isIsbnQuery(normalized) ? 'isbn' : 'q', normalized);
  url.searchParams.set('page', String(safePage));
  url.searchParams.set('limit', String(MAX_RESULTS));
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year,edition_key,isbn,isbn13,cover_i,number_of_pages_median,subject,ratings_average,ratings_count');
  return requestOpenLibraryPage(url, safePage, signal);
}

export async function discoverOpenLibraryBooks({
  mode,
  page = 1,
  signal,
  trendingWindow = 'week',
  year,
}: {
  mode: OpenLibraryDiscoveryMode;
  page?: number;
  signal?: AbortSignal;
  trendingWindow?: OpenLibraryTrendingWindow;
  year?: number;
}): Promise<OpenLibrarySearchPage> {
  const safePage = Math.max(1, Math.floor(page));
  const url = mode === 'trending'
    ? new URL(`${OPEN_LIBRARY_TRENDING_URL}/${getTrendingPeriod(trendingWindow)}.json`)
    : new URL(OPEN_LIBRARY_SEARCH_URL);

  url.searchParams.set('page', String(safePage));
  url.searchParams.set('limit', String(MAX_RESULTS));

  if (mode === 'top-rated') {
    url.searchParams.set('q', 'ratings_count:[1 TO *]');
    url.searchParams.set('sort', 'rating');
    url.searchParams.set('fields', 'key,title,author_name,first_publish_year,edition_key,isbn,isbn13,cover_i,number_of_pages_median,subject,ratings_average,ratings_count');
  } else if (mode === 'recent') {
    url.searchParams.set('q', Number.isInteger(year) ? `first_publish_year:[${year} TO ${year}]` : '*');
    url.searchParams.set('sort', 'new');
    url.searchParams.set('fields', 'key,title,author_name,first_publish_year,edition_key,isbn,isbn13,cover_i,number_of_pages_median,subject,ratings_average,ratings_count');
  }

  return requestOpenLibraryPage(url, safePage, signal);
}
