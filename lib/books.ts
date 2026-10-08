import type { BookFormat, BookItem, BookSource, BookStatus } from './types';
import { parseLocalDateValue } from './date-utils';
import { normalizeExternalWebUrl } from './native/open-link';
import { createEntityId } from './utils';

export const BOOK_STATUS_OPTIONS: Array<{ value: BookStatus; label: string }> = [
  { value: 'reading', label: 'Reading' },
  { value: 'want-to-read', label: 'Want to Read' },
  { value: 'completed', label: 'Completed' },
  { value: 'paused', label: 'Paused' },
  { value: 'dropped', label: 'Dropped' },
];

export const BOOK_FORMAT_OPTIONS: Array<{ value: BookFormat; label: string }> = [
  { value: 'physical', label: 'Physical' },
  { value: 'ebook', label: 'Ebook' },
  { value: 'audiobook', label: 'Audiobook' },
  { value: 'other', label: 'Other' },
];

const BOOK_STATUSES = new Set<BookStatus>(BOOK_STATUS_OPTIONS.map(option => option.value));
const BOOK_FORMATS = new Set<BookFormat>(BOOK_FORMAT_OPTIONS.map(option => option.value));

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.trim())
    .filter(Boolean)));
}

function finiteInteger(value: unknown, minimum = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.round(number)) : undefined;
}

function positiveInteger(value: unknown) {
  const number = finiteInteger(value, 1);
  return number && number > 0 ? number : undefined;
}

function optionalRating(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(5, Math.max(0, Math.round(number * 2) / 2));
}

function optionalDate(value: unknown) {
  return parseLocalDateValue(value as Date | string | number | null | undefined);
}

export function normalizeBook(value: unknown, fallbackId = createEntityId('book')): BookItem {
  const input = record(value);
  const totalPages = positiveInteger(input.totalPages);
  const currentPage = Math.min(
    totalPages ?? Number.MAX_SAFE_INTEGER,
    finiteInteger(input.currentPage, 0) ?? 0,
  );
  const rawStatus = input.status as BookStatus;
  const rawFormat = input.format as BookFormat;
  const source = input.source === 'openlibrary' ? 'openlibrary' : 'manual';
  const publicationYear = positiveInteger(input.publicationYear);

  return {
    ...input,
    id: cleanString(input.id) || fallbackId,
    title: cleanString(input.title) || 'Untitled book',
    authors: cleanStringList(input.authors).length
      ? cleanStringList(input.authors)
      : (cleanString(input.author) ? [cleanString(input.author)!] : []),
    cover: normalizeExternalWebUrl(cleanString(input.cover)) || undefined,
    externalId: cleanString(input.externalId),
    isbn: cleanString(input.isbn),
    isbn13: cleanString(input.isbn13),
    publicationYear,
    subjects: cleanStringList(input.subjects),
    totalPages,
    source: source as BookSource,
    status: BOOK_STATUSES.has(rawStatus) ? rawStatus : 'want-to-read',
    owned: Boolean(input.owned),
    format: BOOK_FORMATS.has(rawFormat) ? rawFormat : 'other',
    currentPage,
    startedAt: optionalDate(input.startedAt),
    finishedAt: optionalDate(input.finishedAt),
    rating: optionalRating(input.rating),
    notes: cleanString(input.notes),
    linkedInventoryItemId: cleanString(input.linkedInventoryItemId),
    createdAt: optionalDate(input.createdAt) || new Date(),
    updatedAt: optionalDate(input.updatedAt) || undefined,
  };
}

export function normalizeBooks(value: unknown): BookItem[] {
  return (Array.isArray(value) ? value : []).map((item, index) =>
    normalizeBook(item, `book-${index + 1}`),
  );
}

export function getBookProgress(book: Pick<BookItem, 'currentPage' | 'totalPages'>) {
  const currentPage = Math.max(0, Math.round(Number(book.currentPage) || 0));
  const totalPages = positiveInteger(book.totalPages);
  return {
    currentPage: totalPages ? Math.min(currentPage, totalPages) : currentPage,
    totalPages,
    percentage: totalPages ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : undefined,
  };
}

export function formatBookProgress(book: Pick<BookItem, 'currentPage' | 'totalPages'>) {
  const progress = getBookProgress(book);
  if (!progress.totalPages) return `${progress.currentPage} pages`;
  return `${progress.currentPage} / ${progress.totalPages} pages (${progress.percentage}%)`;
}
