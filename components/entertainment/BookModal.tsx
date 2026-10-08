'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, Package, Star } from 'lucide-react';
import type { BookFormat, BookItem, BookStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/common/FormPatterns';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { ResilientImage } from '@/components/media/ResilientImage';
import { formatLocalDateInput, parseLocalDateInputOrUndefined } from '@/lib/date-utils';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';
import { BOOK_FORMAT_OPTIONS, BOOK_STATUS_OPTIONS } from '@/lib/books';
import CatalogAssist from '@/components/entertainment/CatalogAssist';
import {
  OpenLibraryApiError,
  openLibraryBookToDraft,
  searchOpenLibraryBooks,
  type OpenLibraryBookResult,
} from '@/lib/books/open-library';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

const INPUT = 'h-11 w-full';

type BookValues = Omit<BookItem, 'id' | 'createdAt'>;

export default function BookModal({
  isOpen,
  book,
  onClose,
  onSave,
  initialTitle,
  initialDraft,
  existingExternalIds,
}: {
  isOpen: boolean;
  book: BookItem | null;
  onClose: () => void;
  onSave: (values: BookValues, options?: { addToInventory?: boolean }) => void;
  /** Prefills the Title field when creating a new book (e.g. from the Balance transaction Link picker). Purely a starting value - the user can still change it. */
  initialTitle?: string;
  /** Editable starting values for an unsaved catalog selection. */
  initialDraft?: Partial<BookItem> | null;
  existingExternalIds?: Set<string>;
}) {
  const catalogRequestRef = useRef<AbortController | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [cover, setCover] = useState('');
  const [externalId, setExternalId] = useState('');
  const [isbn, setIsbn] = useState('');
  const [isbn13, setIsbn13] = useState('');
  const [publicationYear, setPublicationYear] = useState('');
  const [subjects, setSubjects] = useState('');
  const [status, setStatus] = useState<BookStatus>('want-to-read');
  const [owned, setOwned] = useState(false);
  const [format, setFormat] = useState<BookFormat>('other');
  const [currentPage, setCurrentPage] = useState('0');
  const [totalPages, setTotalPages] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [finishedAt, setFinishedAt] = useState('');
  const [rating, setRating] = useState('');
  const [notes, setNotes] = useState('');
  const [addToInventory, setAddToInventory] = useState(false);
  const [error, setError] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<OpenLibraryBookResult[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogHasSearched, setCatalogHasSearched] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState<Partial<BookItem> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const initialBook = book || initialDraft;
    catalogRequestRef.current?.abort();
    setTitle(initialBook?.title || initialTitle || '');
    setAuthors(initialBook?.authors?.join(', ') || '');
    setCover(initialBook?.cover || '');
    setExternalId(initialBook?.externalId || '');
    setIsbn(initialBook?.isbn || '');
    setIsbn13(initialBook?.isbn13 || '');
    setPublicationYear(initialBook?.publicationYear ? String(initialBook.publicationYear) : '');
    setSubjects(initialBook?.subjects?.join(', ') || '');
    setStatus(initialBook?.status || 'want-to-read');
    setOwned(Boolean(initialBook?.owned));
    setFormat(initialBook?.format || 'other');
    setCurrentPage(String(initialBook?.currentPage || 0));
    setTotalPages(initialBook?.totalPages ? String(initialBook.totalPages) : '');
    setStartedAt(initialBook?.startedAt ? formatLocalDateInput(initialBook.startedAt) : '');
    setFinishedAt(initialBook?.finishedAt ? formatLocalDateInput(initialBook.finishedAt) : '');
    setRating(initialBook?.rating == null ? '' : String(initialBook.rating));
    setNotes(initialBook?.notes || '');
    setAddToInventory(false);
    setError('');
    setCatalogQuery(initialBook?.title || initialTitle || '');
    setCatalogResults([]);
    setCatalogLoading(false);
    setCatalogError('');
    setCatalogHasSearched(false);
    setCatalogDraft(null);
  }, [book, initialDraft, isOpen, initialTitle]);

  useEffect(() => () => {
    catalogRequestRef.current?.abort();
  }, []);
  useEffect(() => {
    if (isOpen) return;
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
  }, [isOpen]);

  const cancelCatalogRequest = () => {
    catalogRequestRef.current?.abort();
    catalogRequestRef.current = null;
  };

  const updateCatalogQuery = (value: string) => {
    cancelCatalogRequest();
    setCatalogQuery(value);
    setCatalogResults([]);
    setCatalogLoading(false);
    setCatalogError('');
    setCatalogHasSearched(false);
  };

  const searchCatalog = async () => {
    const normalizedQuery = catalogQuery.trim();
    if (normalizedQuery.length < 2) return;

    cancelCatalogRequest();
    const controller = new AbortController();
    catalogRequestRef.current = controller;
    setCatalogLoading(true);
    setCatalogError('');
    setCatalogResults([]);
    setCatalogHasSearched(false);

    try {
      const page = await searchOpenLibraryBooks(normalizedQuery, 1, controller.signal);
      if (controller.signal.aborted || catalogRequestRef.current !== controller) return;
      setCatalogResults(page.results);
      setCatalogHasSearched(true);
    } catch (caught) {
      if (controller.signal.aborted || catalogRequestRef.current !== controller) return;
      setCatalogError(caught instanceof OpenLibraryApiError ? caught.message : 'Open Library search is temporarily unavailable. You can continue manually.');
      setCatalogHasSearched(true);
    } finally {
      if (catalogRequestRef.current === controller) {
        catalogRequestRef.current = null;
        setCatalogLoading(false);
      }
    }
  };

  const selectCatalogBook = (result: OpenLibraryBookResult) => {
    if (result.externalId && existingExternalIds?.has(result.externalId)) {
      setCatalogError('This Open Library book is already in your library. Choose another result or continue manually.');
      return;
    }

    const draft = openLibraryBookToDraft(result);
    setCatalogDraft(draft);
    setTitle(result.title);
    setAuthors((result.authors || []).join(', '));
    setCover(result.cover || '');
    setExternalId(result.externalId || '');
    setIsbn(result.isbn || '');
    setIsbn13(result.isbn13 || '');
    setPublicationYear(result.publicationYear ? String(result.publicationYear) : '');
    setSubjects((result.subjects || []).join(', '));
    setTotalPages(result.totalPages ? String(result.totalPages) : '');
    setCatalogQuery(result.title);
    setCatalogResults([]);
    setCatalogError('');
    setCatalogHasSearched(false);
    setError('');
    titleInputRef.current?.focus();
  };

  if (!isOpen) return null;

  const save = () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError('Book title is required.');
      return;
    }
    if (!book && externalId.trim() && existingExternalIds?.has(externalId.trim())) {
      setError('This book is already in your library. Choose another catalog result or clear the source ID to add it manually.');
      return;
    }

    const parsedCurrentPage = Number(currentPage || 0);
    const parsedTotalPages = totalPages.trim() ? Number(totalPages) : undefined;
    if (!Number.isFinite(parsedCurrentPage) || parsedCurrentPage < 0) {
      setError('Current page must be zero or greater.');
      return;
    }
    if (parsedTotalPages !== undefined && (!Number.isFinite(parsedTotalPages) || parsedTotalPages <= 0)) {
      setError('Total pages must be greater than zero when provided.');
      return;
    }
    if (parsedTotalPages !== undefined && parsedCurrentPage > parsedTotalPages) {
      setError('Current page cannot be past the total page count.');
      return;
    }

    const parsedRating = rating.trim() ? Number(rating) : undefined;
    if (parsedRating !== undefined && (!Number.isFinite(parsedRating) || parsedRating < 0 || parsedRating > 5)) {
      setError('Rating must be between 0 and 5.');
      return;
    }
    const parsedPublicationYear = publicationYear.trim() ? Number(publicationYear) : undefined;
    if (parsedPublicationYear !== undefined && (!Number.isInteger(parsedPublicationYear) || parsedPublicationYear < 1)) {
      setError('Publication year must be a valid year.');
      return;
    }
    const normalizedCover = cover.trim() ? normalizeExternalWebUrl(cover) : undefined;
    if (cover.trim() && !normalizedCover) {
      setError('Use a valid HTTPS cover image address.');
      return;
    }

    onSave({
      title: normalizedTitle,
      authors: authors.split(',').map(author => author.trim()).filter(Boolean),
      cover: normalizedCover || undefined,
      externalId: externalId.trim() || undefined,
      isbn: isbn.trim() || undefined,
      isbn13: isbn13.trim() || undefined,
      publicationYear: parsedPublicationYear,
      subjects: subjects.split(',').map(subject => subject.trim()).filter(Boolean),
      source: book?.source || catalogDraft?.source || initialDraft?.source || 'manual',
      status,
      owned,
      format,
      currentPage: Math.round(parsedCurrentPage),
      totalPages: parsedTotalPages === undefined ? undefined : Math.round(parsedTotalPages),
      startedAt: startedAt ? parseLocalDateInputOrUndefined(startedAt) || null : null,
      finishedAt: finishedAt ? parseLocalDateInputOrUndefined(finishedAt) || null : null,
      rating: parsedRating,
      notes: notes.trim() || undefined,
    }, { addToInventory });
  };

  return (
    <CaizenFormDialog
      title={book ? 'Edit book' : initialDraft?.source === 'openlibrary' ? 'Review book' : 'Add book'}
      eyebrow="Books"
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      bodyClassName="max-h-[calc(88dvh-5rem)] overflow-y-auto"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button type="button" onClick={save} className="rounded-xl">{book ? 'Save changes' : 'Add book'}</Button>
        </div>
      )}
    >
      {!book ? (
        <CatalogAssist
          id="book-catalog-assist"
          providerLabel="Open Library"
          query={catalogQuery}
          onQueryChange={updateCatalogQuery}
          onSearch={() => void searchCatalog()}
          loading={catalogLoading}
          loadingLabel="Searching Open Library..."
          error={catalogError}
          noResults={catalogHasSearched && catalogResults.length === 0}
          onContinueManually={() => {
            if (!title.trim()) setTitle(catalogQuery.trim());
            titleInputRef.current?.focus();
          }}
        >
          {catalogDraft ? <p role="status" className="text-xs font-semibold text-primary">Open Library details loaded for {catalogDraft.title}. Review the editable fields below.</p> : null}
          {catalogResults.length ? (
            <ul aria-label="Open Library search results" className="max-h-64 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {catalogResults.map(result => {
                const duplicate = Boolean(result.externalId && existingExternalIds?.has(result.externalId));
                const meta = [result.publicationYear, result.totalPages ? `${result.totalPages} pages` : undefined, result.isbn13 || result.isbn]
                  .filter(Boolean)
                  .join(' · ');
                const hasProviderRating = Number.isFinite(result.providerRating)
                  && Number(result.providerRating) > 0
                  && Number(result.providerRatingCount) > 0;
                const providerRating = hasProviderRating
                  ? `Open Library rating ${Number(result.providerRating).toFixed(1)} (${Number(result.providerRatingCount).toLocaleString()} ratings)`
                  : '';
                return (
                  <li key={result.externalId}>
                    <button
                      type="button"
                      onClick={() => selectCatalogBook(result)}
                      disabled={duplicate}
                      aria-label={duplicate ? `${result.title}, already in your library` : `Use ${result.title} from Open Library`}
                      className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border/50 bg-background/45 p-2 text-left transition hover:border-primary/35 hover:bg-background/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {result.cover ? <ResilientImage src={result.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<BookOpen className="m-auto size-5 text-muted-foreground/50" />} /> : <span className="grid h-full place-items-center"><BookOpen className="size-5 text-muted-foreground/50" /></span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <OverflowTooltip text={result.title} mode="clamped"><strong className="block line-clamp-2 text-sm font-bold">{result.title}</strong></OverflowTooltip>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{result.authors.length ? result.authors.join(', ') : 'Author unknown'}{meta ? ` · ${meta}` : ''}</span>
                        {providerRating ? <span className="mt-1 block text-[11px] text-muted-foreground">{providerRating} · display only</span> : null}
                      </span>
                      {duplicate ? <span className="shrink-0 text-xs font-bold text-muted-foreground">In library</span> : <span className="shrink-0 text-xs font-black text-primary">Select</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </CatalogAssist>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-border/55 bg-background/40 p-4">
            <h3 className="font-black">Book details</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Title" className="sm:col-span-2">
                <Input ref={titleInputRef} value={title} onChange={event => { setTitle(event.target.value); updateCatalogQuery(event.target.value); }} className={INPUT} placeholder="Book title" autoFocus={Boolean(book)} />
              </Field>
              <Field label="Authors (comma separated)" className="sm:col-span-2">
                <Input value={authors} onChange={event => setAuthors(event.target.value)} className={INPUT} placeholder="Author name" />
              </Field>
              <Field label="Status">
                <AndroidAdaptiveSelect label="Status" value={status} onChange={value => setStatus(value as BookStatus)} className="control-input" options={BOOK_STATUS_OPTIONS} />
              </Field>
              <Field label="Format">
                <AndroidAdaptiveSelect label="Format" value={format} onChange={value => setFormat(value as BookFormat)} className="control-input" options={BOOK_FORMAT_OPTIONS} />
              </Field>
              <Field label="Ownership">
                <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-background/50 px-3 text-sm font-semibold">
                  <Checkbox checked={owned} onCheckedChange={checked => setOwned(checked === true)} />
                  I own this book
                </label>
              </Field>
              <Field label="Rating (0–5)">
                <Input type="number" min="0" max="5" step="0.5" inputMode="decimal" value={rating} onChange={event => setRating(event.target.value)} className={INPUT} placeholder="Optional" />
              </Field>
              <Field label="Inventory">
                {book?.linkedInventoryItemId ? (
                  <p className="flex min-h-11 items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 text-sm font-semibold text-primary">
                    <Package className="size-4 shrink-0" aria-hidden="true" /> In Inventory
                  </p>
                ) : (
                  <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-background/50 px-3 text-sm font-semibold">
                    <Checkbox checked={addToInventory} onCheckedChange={checked => setAddToInventory(checked === true)} />
                    Add to Inventory
                  </label>
                )}
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-border/55 bg-background/40 p-4">
            <h3 className="font-black">Reading progress</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Current page">
                <Input type="number" min="0" step="1" inputMode="numeric" value={currentPage} onChange={event => setCurrentPage(event.target.value)} className={INPUT} />
              </Field>
              <Field label="Total pages (optional)">
                <Input type="number" min="1" step="1" inputMode="numeric" value={totalPages} onChange={event => setTotalPages(event.target.value)} className={INPUT} placeholder="Unknown" />
              </Field>
              <Field label="Started">
                <AdaptiveDatePicker label="Started" value={startedAt} onChange={setStartedAt} className="control-input h-11" />
              </Field>
              <Field label="Finished">
                <AdaptiveDatePicker label="Finished" value={finishedAt} onChange={setFinishedAt} className="control-input h-11" />
              </Field>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Progress is calculated from current page and total pages. Leave total pages blank when the length is unknown.</p>
          </section>

          <section className="rounded-2xl border border-border/55 bg-background/40 p-4">
            <h3 className="font-black">Notes</h3>
            <Textarea value={notes} onChange={event => setNotes(event.target.value)} className="mt-4 min-h-28" placeholder="Thoughts, reading goals, or notes..." />
          </section>

          {error ? <p className="text-sm font-semibold text-destructive" role="alert">{error}</p> : null}
        </div>

        <aside className="order-first lg:order-last">
          <div className="overflow-hidden rounded-2xl border border-border/55 bg-background/45 lg:sticky lg:top-0">
            <div className="aspect-[3/4] bg-muted/50">
              <ResilientImage src={cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><BookOpen className="size-10 opacity-40" /><span className="text-xs font-bold">No cover</span></div>} />
            </div>
            <div className="space-y-3 p-4">
              <p className="font-black">{title || 'Book preview'}</p>
              <p className="text-xs text-muted-foreground">{authors || 'Add an author'}</p>
              <Field label="Cover image URL">
                <Input type="url" value={cover} onChange={event => setCover(event.target.value)} className="h-10 w-full text-xs" placeholder="https://..." />
              </Field>
            </div>
          </div>
        </aside>
      </div>

      {(externalId || isbn || isbn13 || publicationYear || subjects) ? (
        <section className="mt-5 rounded-2xl border border-border/55 bg-background/40 p-4">
          <div className="flex items-center gap-2"><Star className="size-4 text-primary" /><h3 className="font-black">Catalog metadata</h3></div>
          <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
            {externalId ? <p><strong className="text-foreground">Source ID:</strong> {externalId}</p> : null}
            {isbn ? <p><strong className="text-foreground">ISBN:</strong> {isbn}</p> : null}
            {isbn13 ? <p><strong className="text-foreground">ISBN-13:</strong> {isbn13}</p> : null}
            {publicationYear ? <p><strong className="text-foreground">Publication year:</strong> {publicationYear}</p> : null}
            {subjects ? <p className="sm:col-span-2"><strong className="text-foreground">Subjects:</strong> {subjects}</p> : null}
          </div>
        </section>
      ) : null}
    </CaizenFormDialog>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  const hasCheckboxLabel = label === 'Ownership' || label === 'Inventory';
  return (
    <div className={className}>
      <FormField label={label} asGroup={hasCheckboxLabel}>
        {children}
      </FormField>
    </div>
  );
}
