'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Edit3, Link2, Loader2, MoreVertical, Package, Plus, Search, SlidersHorizontal, Star, Trash2 } from 'lucide-react';
import type { BookItem, BookStatus, Transaction } from '@/lib/types';
import { useAppContext } from '@/lib/context';
import { buildLinkedRecordTransactionMap } from '@/lib/transactions';
import { navigateToLinkedRecord, navigateToTransaction } from '@/lib/balance/linked-record';
import { formatPHP } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { ResilientImage } from '@/components/media/ResilientImage';
import { AndroidAdaptiveSelect, CaizenBottomSheet } from '@/components/native/android-design';
import { PaginationControls } from '@/components/ui/section-kit';
import { EmptyState } from '@/components/ui/empty';
import { SectionTabs } from '@/components/ui/tabs';
import { CollectionToolbar, FilterBar, FilterChip, SegmentedControl } from '@/components/ui/collection-controls';
import { SearchField } from '@/components/ui/search-field';
import { useCollectionReveal } from '@/hooks/use-collection-reveal';
import BookModal from '@/components/entertainment/BookModal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  BOOK_FORMAT_OPTIONS,
  BOOK_STATUS_OPTIONS,
  formatBookProgress,
  getBookProgress,
} from '@/lib/books';
import {
  OpenLibraryApiError,
  discoverOpenLibraryBooks,
  openLibraryBookToDraft,
  searchOpenLibraryBooks,
  type OpenLibraryBookResult,
  type OpenLibraryDiscoveryMode,
  type OpenLibraryTrendingWindow,
} from '@/lib/books/open-library';

type BooksView = 'library' | 'discover';
type DiscoveryMode = OpenLibraryDiscoveryMode | 'search';
type LibraryStatusFilter = BookStatus | 'all';

const LIBRARY_PAGE_SIZE = 12;
const DISCOVERY_PAGE_SIZE = 20;

const DISCOVERY_MODE_OPTIONS: Array<{ value: DiscoveryMode; label: string }> = [
  { value: 'trending', label: 'Trending' },
  { value: 'top-rated', label: 'Top Rated' },
  { value: 'recent', label: 'New & Recent' },
];

const TRENDING_WINDOW_OPTIONS: Array<{ value: OpenLibraryTrendingWindow; label: string }> = [
  { value: 'now', label: 'Now' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'all-time', label: 'All Time' },
];

const LIBRARY_STATUS_OPTIONS: Array<{ value: LibraryStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  ...BOOK_STATUS_OPTIONS,
];

const formatLabel = (value: BookItem['format']) => BOOK_FORMAT_OPTIONS.find(option => option.value === value)?.label || 'Other';
const statusLabel = (value: BookStatus) => BOOK_STATUS_OPTIONS.find(option => option.value === value)?.label || value;

function matchesSearch(book: BookItem, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [book.title, ...book.authors, book.isbn, book.isbn13].filter(Boolean).join(' ').toLowerCase().includes(needle);
}

type Props = {
  androidPresentation?: boolean;
  requestedProfileId?: string;
  requestedRecordId?: string;
  requestedRecordType?: string;
  requestedRecordSignal?: number;
  onRequestedRecordConsumed?: (signal: number) => void;
};

export default function BooksWorkspace({ androidPresentation = false, requestedProfileId, requestedRecordId, requestedRecordType, requestedRecordSignal = 0, onRequestedRecordConsumed }: Props) {
  const { books, transactions, addBook, updateBook, deleteBook, addInventoryItem, currentProfileId, isHydrated } = useAppContext();
  // Derived, not stored - see Transaction.linkedRecord in lib/types.ts.
  const transactionByBookId = useMemo(
    () => buildLinkedRecordTransactionMap(transactions, 'books'),
    [transactions],
  );
  const [view, setView] = useState<BooksView>('library');
  const [statusFilter, setStatusFilter] = useState<LibraryStatusFilter>('all');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryPage, setLibraryPage] = useState(1);
  const [browseQuery, setBrowseQuery] = useState('');
  const [browseResults, setBrowseResults] = useState<OpenLibraryBookResult[]>([]);
  const [completedBrowseControls, setCompletedBrowseControls] = useState<string>('');
  const [discoverMode, setDiscoverMode] = useState<DiscoveryMode>('trending');
  const [trendingWindow, setTrendingWindow] = useState<OpenLibraryTrendingWindow>('week');
  const [recentYear, setRecentYear] = useState('all');
  const [showAndroidTimeSheet, setShowAndroidTimeSheet] = useState(false);
  const [showAndroidBookFilters, setShowAndroidBookFilters] = useState(false);
  const [browsePage, setBrowsePage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [browseTotalResults, setBrowseTotalResults] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [browseError, setBrowseError] = useState('');
  const [editingBook, setEditingBook] = useState<BookItem | null>(null);
  const [bookDraft, setBookDraft] = useState<Partial<BookItem> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BookItem | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const safeBooks = useMemo(() => (Array.isArray(books) ? books : []), [books]);
  const consumedRequestSignalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!requestedRecordSignal || !isHydrated || !currentProfileId || requestedProfileId !== currentProfileId || consumedRequestSignalRef.current === requestedRecordSignal) return;
    if (requestedRecordType !== 'book' && requestedRecordType !== 'add-book') return;
    const book = requestedRecordType === 'book'
      ? safeBooks.find(item => item.id === requestedRecordId)
      : null;
    if (requestedRecordType === 'book' && !book) return;
    consumedRequestSignalRef.current = requestedRecordSignal;
    setView('library');
    if (requestedRecordType === 'add-book') {
      setEditingBook(null);
      setBookDraft(null);
      setModalOpen(true);
    } else if (book) {
      setBookDraft(null);
      setEditingBook(book);
      setModalOpen(true);
    }
    onRequestedRecordConsumed?.(requestedRecordSignal);
  }, [currentProfileId, isHydrated, onRequestedRecordConsumed, requestedProfileId, requestedRecordId, requestedRecordSignal, requestedRecordType, safeBooks]);
  const filteredBooks = useMemo(() => [...safeBooks]
    .filter(book => statusFilter === 'all' || book.status === statusFilter)
    .filter(book => matchesSearch(book, libraryQuery))
    .sort((a, b) => {
      if (a.status === 'reading' && b.status !== 'reading') return -1;
      if (b.status === 'reading' && a.status !== 'reading') return 1;
      return a.title.localeCompare(b.title);
    }), [libraryQuery, safeBooks, statusFilter]);

  const libraryTotalPages = Math.max(1, Math.ceil(filteredBooks.length / LIBRARY_PAGE_SIZE));
  const visibleBooks = filteredBooks.slice((libraryPage - 1) * LIBRARY_PAGE_SIZE, libraryPage * LIBRARY_PAGE_SIZE);
  const libraryRevealRef = useCollectionReveal(
    visibleBooks.map(book => book.id),
    [currentProfileId, view, statusFilter, libraryPage],
  );
  const browseRevealRef = useCollectionReveal(
    browseResults.map(result => `${result.externalId}-${result.isbn || ''}`),
    [currentProfileId, view, completedBrowseControls],
  );
  const recentYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [
      { value: 'all', label: 'All recent' },
      ...Array.from({ length: 4 }, (_, index) => {
        const year = currentYear - index;
        return { value: String(year), label: String(year) };
      }),
    ];
  }, []);

  const duplicateIds = useMemo(() => new Set(
    safeBooks
      .map(book => book.externalId)
      .filter((externalId): externalId is string => Boolean(externalId)),
  ), [safeBooks]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    setLibraryPage(1);
  }, [libraryQuery, statusFilter]);

  useEffect(() => {
    if (libraryPage > libraryTotalPages) setLibraryPage(libraryTotalPages);
  }, [libraryPage, libraryTotalPages]);

  useEffect(() => {
    requestRef.current?.abort();
    setBrowseError('');
    const normalized = browseQuery.trim();
    if (view !== 'discover' || (discoverMode === 'search' && normalized.length < 2)) {
      if (discoverMode === 'search' && normalized.length < 2) {
        setBrowseResults([]);
        setHasNextPage(false);
        setBrowseTotalResults(undefined);
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = window.setTimeout(() => {
      const request = discoverMode === 'search'
        ? searchOpenLibraryBooks(normalized, browsePage, controller.signal)
        : discoverOpenLibraryBooks({
          mode: discoverMode,
          page: browsePage,
          signal: controller.signal,
          trendingWindow,
          year: recentYear === 'all' ? undefined : Number(recentYear),
        });
      void request
        .then(page => {
          if (controller.signal.aborted) return;
          setBrowseResults(page.results);
          setCompletedBrowseControls(JSON.stringify([discoverMode, trendingWindow, recentYear, page.page]));
          setBrowsePage(page.page);
          setHasNextPage(page.hasNextPage);
          setBrowseTotalResults(page.totalResults);
        })
        .catch(error => {
          if (controller.signal.aborted) return;
          setBrowseError(error instanceof OpenLibraryApiError ? error.message : 'Book discovery is temporarily unavailable.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, discoverMode === 'search' ? 400 : 0);
    return () => window.clearTimeout(timer);
  }, [browsePage, browseQuery, discoverMode, recentYear, trendingWindow, view]);

  const selectDiscoveryMode = (mode: DiscoveryMode) => {
    setDiscoverMode(mode);
    setBrowsePage(1);
    if (mode !== 'search') setBrowseQuery('');
  };

  const selectSearchQuery = (value: string) => {
    setBrowseQuery(value);
    setDiscoverMode('search');
    setBrowsePage(1);
  };

  const openNewBook = () => {
    setEditingBook(null);
    setBookDraft(null);
    setModalOpen(true);
  };

  const openBook = (book: BookItem) => {
    setBookDraft(null);
    setEditingBook(book);
    setModalOpen(true);
  };

  const linkBookToInventory = (bookId: string, title: string) => {
    const created = addInventoryItem({
      name: title,
      quantity: 1,
      unit: 'piece',
      category: 'home',
      subCategory: 'Book',
      acquisitionType: 'bought',
      purchaseDate: new Date(),
    });
    if (created) updateBook(bookId, { linkedInventoryItemId: created.id });
  };

  const saveBook = (values: Omit<BookItem, 'id' | 'createdAt'>, options?: { addToInventory?: boolean }) => {
    if (editingBook) {
      updateBook(editingBook.id, values);
      if (options?.addToInventory && !editingBook.linkedInventoryItemId) linkBookToInventory(editingBook.id, values.title);
    } else {
      const created = addBook(values);
      if (created && options?.addToInventory) linkBookToInventory(created.id, created.title);
    }
    setModalOpen(false);
    setEditingBook(null);
    setBookDraft(null);
  };

  const addBrowseResult = (result: OpenLibraryBookResult) => {
    if (result.externalId && duplicateIds.has(result.externalId)) return;
    setEditingBook(null);
    setBookDraft(openLibraryBookToDraft(result));
    setModalOpen(true);
  };

  return (
    <section className={`${androidPresentation ? 'android-books-workspace' : ''} space-y-5`} aria-labelledby="books-heading">
      <section className="section-surface rounded-[2rem] border-border/65 text-foreground">
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h1 id="books-heading" className="text-3xl font-black leading-none tracking-tight sm:text-4xl">Books</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">Keep your reading list and progress together.</p>
            </div>
            <Button type="button" onClick={openNewBook} className="android-touch-target h-11 rounded-xl"><Plus className="mr-2 size-4" /> Add book</Button>
          </div>
        </div>
      </section>

      <SectionTabs
        mode="navigation"
        label="Books views"
        value={view}
        items={[{ value: 'library', label: 'My Library', icon: BookOpen }, { value: 'discover', label: 'Discover', icon: Search }]}
        listClassName={androidPresentation ? 'scrollbar-hide' : undefined}
        onValueChange={value => {
          const nextView = value as BooksView;
          setView(nextView);
          if (nextView === 'discover') setBrowsePage(1);
        }}
      />

      {view === 'library' ? (
        <>
          <CollectionToolbar
            layout="two-row"
            search={<SearchField aria-label="Search book library" value={libraryQuery} onChange={setLibraryQuery} className="sm:max-w-lg" placeholder="Search titles, authors, or ISBN..." />}
            filters={<FilterBar label="Book status filters">
              {LIBRARY_STATUS_OPTIONS.map(option => {
                const count = option.value === 'all' ? safeBooks.length : safeBooks.filter(book => book.status === option.value).length;
                return <FilterChip key={option.value} selected={statusFilter === option.value} onSelectedChange={() => setStatusFilter(option.value)} count={count} className="rounded-lg px-2.5 text-xs font-bold">{option.label}</FilterChip>;
              })}
            </FilterBar>}
          />

          {!filteredBooks.length ? (
            <EmptyState
              icon={BookOpen}
              title={safeBooks.length ? 'No matching books' : 'Your library is ready'}
              description={safeBooks.length ? 'Try another search or status filter.' : 'Browse Open Library or add a book manually.'}
              actions={<><Button type="button" variant="outline" onClick={openNewBook}>Add manually</Button><Button type="button" onClick={() => setView('discover')}>Discover books</Button></>}
            />
          ) : (
            <div ref={libraryRevealRef} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleBooks.map(book => <BookCard key={book.id} book={book} linkedTransaction={transactionByBookId.get(book.id)} onOpen={() => openBook(book)} onStartReading={() => updateBook(book.id, { status: 'reading', startedAt: book.startedAt || new Date() })} onDelete={() => setDeleteTarget(book)} />)}
            </div>
          )}
          {filteredBooks.length > LIBRARY_PAGE_SIZE ? <PaginationControls page={libraryPage} totalPages={libraryTotalPages} totalItems={filteredBooks.length} pageSize={LIBRARY_PAGE_SIZE} onPageChange={setLibraryPage} /> : null}
        </>
      ) : (
        <section className="space-y-4">
          <div className="toolbar-surface space-y-3 p-3" style={{ backgroundColor: 'var(--surface-section)' }}>
            <SearchField aria-label="Search Open Library books" value={browseQuery} onChange={selectSearchQuery} className="sm:max-w-lg" placeholder="Search by title, author, or ISBN..." />
            <p className="mt-3 text-xs text-muted-foreground">Search Open Library or choose a collection. Results are limited to 20 per page; your library stays local and available offline.</p>
            {androidPresentation ? (
              <>
                <SegmentedControl
                  label="Open Library discovery mode"
                  value={discoverMode}
                  onValueChange={value => selectDiscoveryMode(value as DiscoveryMode)}
                  size="compact"
                  className="max-w-full overflow-x-auto"
                  options={[...DISCOVERY_MODE_OPTIONS, { value: 'search', label: 'Search' }]}
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setShowAndroidTimeSheet(true)} className="inline-flex min-h-11 items-center justify-between rounded-xl border border-border/55 bg-background/45 px-3 text-left text-xs font-black" aria-label={`Time range: ${TRENDING_WINDOW_OPTIONS.find(option => option.value === trendingWindow)?.label}`}>
                    <span>Time: {TRENDING_WINDOW_OPTIONS.find(option => option.value === trendingWindow)?.label}</span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </button>
                  <button type="button" onClick={() => setShowAndroidBookFilters(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/55 bg-background/45 px-3 text-xs font-black" aria-label="Filter books">
                    <SlidersHorizontal className="size-4 text-primary" /> Filters
                  </button>
                </div>
                <CaizenBottomSheet open={showAndroidTimeSheet} title="Time range" onClose={() => setShowAndroidTimeSheet(false)}>
                  <div className="space-y-1" data-android-books-time-range="true">
                    {TRENDING_WINDOW_OPTIONS.map(option => (
                      <button key={option.value} type="button" onClick={() => { setTrendingWindow(option.value); setBrowsePage(1); setShowAndroidTimeSheet(false); }} className={`flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-bold ${trendingWindow === option.value ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`} aria-pressed={trendingWindow === option.value}>
                        {option.label}
                        {trendingWindow === option.value ? <Check className="size-4" /> : null}
                      </button>
                    ))}
                  </div>
                </CaizenBottomSheet>
                <CaizenBottomSheet open={showAndroidBookFilters} title="Filter books" description="Choose the publication window for New & Recent." onClose={() => setShowAndroidBookFilters(false)}>
                  {discoverMode === 'recent' ? (
                    <div className="space-y-1" data-android-books-filters="true">
                      {recentYearOptions.map(option => (
                        <button key={option.value} type="button" onClick={() => { setRecentYear(option.value); setBrowsePage(1); setShowAndroidBookFilters(false); }} className={`flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-bold ${recentYear === option.value ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`} aria-pressed={recentYear === option.value}>
                          {option.label}
                          {recentYear === option.value ? <Check className="size-4" /> : null}
                        </button>
                      ))}
                    </div>
                  ) : <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-sm text-muted-foreground">Choose New & Recent to filter by publication year.</p>}
                </CaizenBottomSheet>
              </>
            ) : (
              <>
                <SegmentedControl
                  label="Open Library discovery mode"
                  value={discoverMode}
                  onValueChange={value => selectDiscoveryMode(value as DiscoveryMode)}
                  size="compact"
                  className="max-w-full overflow-x-auto"
                  options={[...DISCOVERY_MODE_OPTIONS, { value: 'search', label: 'Search' }]}
                />
                {discoverMode === 'trending' ? (
                  <SegmentedControl
                    label="Trending timeframe"
                    value={trendingWindow}
                    onValueChange={value => { setTrendingWindow(value as OpenLibraryTrendingWindow); setBrowsePage(1); }}
                    size="compact"
                    className="mt-3 max-w-full overflow-x-auto"
                    options={TRENDING_WINDOW_OPTIONS}
                  />
                ) : null}
                {discoverMode === 'recent' ? <div className="mt-3 max-w-xs"><AndroidAdaptiveSelect label="Recent publication year" value={recentYear} onChange={value => { setRecentYear(value); setBrowsePage(1); }} className="control-input" options={recentYearOptions} /></div> : null}
              </>
            )}
          </div>
          {loading ? <p className="flex items-center gap-2 px-1 text-sm font-semibold text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" /> {discoverMode === 'search' ? 'Searching Open Library...' : 'Loading Open Library...'}{browseResults.length ? ' Previous results remain until this request settles.' : ''}</p> : null}
          {browseError ? <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert"><p className="font-bold">{browseResults.length ? 'Could not refresh these results. Showing the previous Open Library results.' : 'Book discovery is temporarily unavailable. Your Caizen library is still available.'}</p></div> : null}
          {!loading && !browseError && discoverMode === 'search' && browseQuery.trim().length < 2 ? <EmptyState icon={BookOpen} title="Search Open Library" description="Search by title, author, or ISBN." /> : null}
          {!loading && !browseError && browseResults.length === 0 && (discoverMode !== 'search' || browseQuery.trim().length >= 2) ? <EmptyState title="No books found" variant="compact" /> : null}
          {browseResults.length && (discoverMode !== 'search' || browseQuery.trim().length >= 2) ? <div ref={browseRevealRef} className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${loading ? 'opacity-75' : ''}`}>{browseResults.map(result => <BrowseBookCard key={`${result.externalId}-${result.isbn || ''}`} result={result} alreadySaved={Boolean(result.externalId && duplicateIds.has(result.externalId))} onAdd={() => addBrowseResult(result)} />)}</div> : null}
          {browseResults.length && (browsePage > 1 || hasNextPage) ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-muted-foreground">{browseTotalResults ? `Showing ${(browsePage - 1) * DISCOVERY_PAGE_SIZE + 1}-${Math.min(browsePage * DISCOVERY_PAGE_SIZE, browseTotalResults)} of ${browseTotalResults}` : `Page ${browsePage} · ${DISCOVERY_PAGE_SIZE} results per page`}</p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setBrowsePage(page => Math.max(1, page - 1))} disabled={browsePage === 1 || loading} className="h-10 rounded-xl font-bold"><ChevronLeft className="mr-1 size-4" /> Previous</Button>
                <span className="min-w-16 text-center text-sm font-bold">Page {browsePage}</span>
                <Button type="button" variant="outline" onClick={() => setBrowsePage(page => page + 1)} disabled={!hasNextPage || loading} className="h-10 rounded-xl font-bold">Next <ChevronRight className="ml-1 size-4" /></Button>
              </div>
            </div>
          ) : null}
        </section>
      )}

      <BookModal isOpen={modalOpen} book={editingBook} initialDraft={bookDraft} existingExternalIds={duplicateIds} onClose={() => { setModalOpen(false); setEditingBook(null); setBookDraft(null); }} onSave={saveBook} />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Move book to Trash?"
        message={deleteTarget ? `This moves “${deleteTarget.title}” to Trash. You can restore it from Trash later.${deleteTarget.linkedInventoryItemId ? ' Its linked Inventory item will stay in Inventory.' : ''}` : ''}
        confirmText="Move to Trash"
        cancelText="Cancel"
        isDangerous
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteBook(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </section>
  );
}

function BookCard({ book, linkedTransaction, onOpen, onStartReading, onDelete }: { book: BookItem; linkedTransaction?: Transaction; onOpen: () => void; onStartReading: () => void; onDelete: () => void }) {
  const progress = getBookProgress(book);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <article data-caizen-collection-item="true" data-caizen-interactive-record="true" className="overflow-hidden rounded-2xl border border-border/55 bg-card/75 transition-[border-color,box-shadow] hover:border-primary/25">
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4 sm:p-4">
        <div className="aspect-[2/3] overflow-hidden rounded-xl bg-muted"><ResilientImage src={book.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<div className="grid h-full place-items-center"><BookOpen className="size-7 text-muted-foreground/45" /></div>} /></div>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="inline-flex rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary">{statusLabel(book.status)}</span>
              <OverflowTooltip text={book.title} mode="clamped"><h2 className="mt-2 line-clamp-2 text-base font-black leading-tight sm:text-lg">{book.title}</h2></OverflowTooltip>
              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{book.authors.length ? book.authors.join(', ') : 'Author unknown'}</p>
            </div>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Actions for ${book.title}`}>
                  <MoreVertical className="size-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className="w-52">
                <DropdownMenuItem onSelect={onOpen}><Edit3 className="mr-2 size-4" /> Edit book</DropdownMenuItem>
                {book.linkedInventoryItemId ? <DropdownMenuItem onSelect={() => navigateToLinkedRecord('inventory', book.linkedInventoryItemId!)}><Package className="mr-2 size-4" /> Open Inventory item</DropdownMenuItem> : null}
                {linkedTransaction ? <DropdownMenuItem onSelect={() => navigateToTransaction(linkedTransaction.id)}><Link2 className="mr-2 size-4" /> Balance transaction · {formatPHP(linkedTransaction.amount)}</DropdownMenuItem> : null}
                <DropdownMenuItem onSelect={onDelete} variant="destructive"><Trash2 className="mr-2 size-4" /> Move to Trash</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p className="mt-2 text-[11px] font-semibold text-muted-foreground">{book.owned ? 'Owned' : 'Not owned'} · {formatLabel(book.format)}</p>

          {book.status === 'reading' ? (
            <div className="mt-3">
              <p className="text-xs font-bold">{progress.totalPages ? `${progress.currentPage} / ${progress.totalPages} pages · ${progress.percentage}%` : `${progress.currentPage} pages read`}</p>
              {progress.totalPages ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress.percentage}%` }} /></div> : null}
            </div>
          ) : book.status === 'completed' ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span>{book.finishedAt ? `Finished ${book.finishedAt.toLocaleDateString()}` : 'Finished'}</span>
              {book.rating ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-1 font-bold text-amber-600 dark:text-amber-300"><Star className="size-3 fill-current" />{book.rating.toFixed(book.rating % 1 ? 1 : 0)}</span> : null}
            </div>
          ) : null}

          <Button type="button" variant={book.status === 'completed' ? 'outline' : 'default'} onClick={book.status === 'want-to-read' ? onStartReading : onOpen} className="mt-auto min-h-11 w-full rounded-xl text-xs font-black sm:mt-3">
            {book.status === 'want-to-read' ? 'Start reading' : book.status === 'completed' ? 'Details' : 'Update progress'}
          </Button>
        </div>
      </div>
    </article>
  );
}

function BrowseBookCard({ result, alreadySaved, onAdd }: { result: OpenLibraryBookResult; alreadySaved: boolean; onAdd: () => void }) {
  const hasRating = Number.isFinite(result.providerRating) && Number(result.providerRating) > 0 && Number(result.providerRatingCount) > 0;
  if (hasRating) {
    return (
      <article data-caizen-collection-item="true" className="overflow-hidden rounded-2xl border border-border/55 bg-card/70 shadow-sm">
        <div className="aspect-[3/4] bg-muted"><ResilientImage src={result.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<div className="grid h-full place-items-center"><BookOpen className="size-8 text-muted-foreground/45" /></div>} /></div>
        <div className="space-y-3 p-4">
          <div><OverflowTooltip text={result.title} mode="clamped"><h2 className="line-clamp-2 text-base font-black leading-tight">{result.title}</h2></OverflowTooltip><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{result.authors.length ? result.authors.join(', ') : 'Author unknown'}{result.publicationYear ? ` · ${result.publicationYear}` : ''}</p></div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-300"><Star className="size-3.5 fill-current" /> {Number(result.providerRating).toFixed(1)} <span className="font-normal text-muted-foreground">({Number(result.providerRatingCount).toLocaleString()} ratings)</span></p>
          {result.totalPages ? <p className="text-xs text-muted-foreground">{result.totalPages} pages</p> : null}
          <Button type="button" onClick={onAdd} disabled={alreadySaved} className="h-10 w-full rounded-xl text-xs font-black">{alreadySaved ? 'In Library' : <><Plus className="mr-1.5 size-4" /> Review & Add</>}</Button>
        </div>
      </article>
    );
  }
  return <article data-caizen-collection-item="true" className="overflow-hidden rounded-2xl border border-border/55 bg-card/70 shadow-sm"><div className="aspect-[3/4] bg-muted"><ResilientImage src={result.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<div className="grid h-full place-items-center"><BookOpen className="size-8 text-muted-foreground/45" /></div>} /></div><div className="space-y-3 p-4"><div><OverflowTooltip text={result.title} mode="clamped"><h2 className="line-clamp-2 text-base font-black leading-tight">{result.title}</h2></OverflowTooltip><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{result.authors.length ? result.authors.join(', ') : 'Author unknown'}{result.publicationYear ? ` · ${result.publicationYear}` : ''}</p></div>{result.totalPages ? <p className="text-xs text-muted-foreground">{result.totalPages} pages</p> : null}<Button type="button" onClick={onAdd} disabled={alreadySaved} className="h-10 w-full rounded-xl text-xs font-black">{alreadySaved ? 'In library' : <><Plus className="mr-1.5 size-4" /> Review & Add</>}</Button></div></article>;
}
