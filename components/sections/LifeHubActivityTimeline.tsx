'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pill,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { formatCurrency } from '@/lib/currency';
import {
  ACTIVITY_SECTION_FILTERS,
  deriveCalendarActivityTimeline,
  type ActivitySection,
  type ActivitySectionFilter,
  type DerivedActivityEntry,
  type ActivityTimelineSources,
} from '@/lib/lifehub/activity-timeline';
import {
  addLocalDays,
  parseLocalDateKey,
  startOfLocalDay,
  toLocalDateKey,
} from '@/lib/lifehub/date-utils';

type Props = ActivityTimelineSources & {
  currentProfileId: string;
  isHydrated: boolean;
  androidPresentation?: boolean;
  onNavigate: (entry: DerivedActivityEntry) => void;
};

type ActivityGroup = {
  primary: DerivedActivityEntry;
  supporting: DerivedActivityEntry[];
};

const ANDROID_ACTIVITY_PAGE_SIZE = 10;

const SECTION_META: Record<ActivitySection, { label: string }> = {
  lifehub: {
    label: 'Life Hub',
  },
  health: {
    label: 'Health',
  },
  balance: {
    label: 'Money',
  },
  entertainment: {
    label: 'Entertainment',
  },
  'personal-care': {
    label: 'Personal Care',
  },
};

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

function groupEntries(entries: DerivedActivityEntry[]): ActivityGroup[] {
  const groups = new Map<string, DerivedActivityEntry[]>();
  for (const entry of entries) {
    const key = entry.groupKey || entry.id;
    const current = groups.get(key);
    if (current) current.push(entry);
    else groups.set(key, [entry]);
  }

  return Array.from(groups.values()).map(group => {
    const primary = group.find(entry => entry.kind === 'routine-completed') || group[0];
    return {
      primary,
      supporting: group.filter(entry => entry.id !== primary.id),
    };
  });
}

function supportingDetail(entry: DerivedActivityEntry): string | undefined {
  if (!entry.detail) return undefined;
  if (entry.kind === 'skincare-used') return `Skincare · ${entry.detail}`;
  if (entry.kind === 'supplement-taken') return `Supplements · ${entry.detail}`;
  return entry.detail;
}

function formatEntryDetails(entry: DerivedActivityEntry, supporting: DerivedActivityEntry[]): string[] {
  const details = [entry.detail, ...supporting.map(supportingDetail)]
    .filter((value): value is string => Boolean(value));
  if (entry.amount !== undefined) {
    details.push(formatCurrency(entry.amount));
  }
  if (entry.effectiveDateKey && entry.effectiveDateKey !== entry.dateKey) {
    const effectiveDate = parseLocalDateKey(entry.effectiveDateKey);
    if (effectiveDate) details.push(`For ${effectiveDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
  }
  return Array.from(new Set(details));
}

function sectionMetaFor(entry: DerivedActivityEntry) {
  return SECTION_META[entry.section];
}

export default function LifeHubActivityTimeline({
  currentProfileId,
  isHydrated,
  androidPresentation = false,
  onNavigate,
  productivityItems = [],
  dailyChecklistItems = [],
  transactions = [],
  mediaItems = [],
  skincareProducts = [],
  skincareUsageEvents = [],
  importantDates = [],
  journalEntries = [],
  health,
  trashItems = [],
}: Props) {
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
  const [filter, setFilter] = useState<ActivitySectionFilter>('all');
  const [page, setPage] = useState(1);
  const previousProfileIdRef = useRef(currentProfileId);

  useEffect(() => {
    if (previousProfileIdRef.current === currentProfileId) return;
    previousProfileIdRef.current = currentProfileId;
    setSelectedDate(startOfLocalDay(new Date()));
    setFilter('all');
    setPage(1);
  }, [currentProfileId]);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const selectedDateKey = toLocalDateKey(selectedDate);
  const todayKey = toLocalDateKey(today);
  const isSelectedToday = selectedDateKey === todayKey;
  const rangeEnd = useMemo(() => addLocalDays(selectedDate, 1), [selectedDate]);
  const timelineSources = useMemo(() => ({
    productivityItems,
    dailyChecklistItems,
    transactions,
    mediaItems,
    skincareProducts,
    skincareUsageEvents,
    importantDates,
    journalEntries,
    health,
    trashItems,
  }), [dailyChecklistItems, health, importantDates, journalEntries, mediaItems, productivityItems, skincareProducts, skincareUsageEvents, trashItems, transactions]);
  const entries = useMemo(
    () => deriveCalendarActivityTimeline(timelineSources, {
      rangeStart: selectedDate,
      rangeEnd,
      filter,
    }),
    [filter, rangeEnd, selectedDate, timelineSources],
  );
  const groups = useMemo(() => groupEntries(entries), [entries]);
  const totalPages = androidPresentation
    ? Math.max(1, Math.ceil(groups.length / ANDROID_ACTIVITY_PAGE_SIZE))
    : 1;
  const currentPage = Math.min(page, totalPages);
  const visibleGroups = androidPresentation
    ? groups.slice((currentPage - 1) * ANDROID_ACTIVITY_PAGE_SIZE, currentPage * ANDROID_ACTIVITY_PAGE_SIZE)
    : groups;

  useEffect(() => {
    setPage(1);
  }, [filter, selectedDateKey]);

  useEffect(() => {
    if (page <= totalPages) return;
    setPage(totalPages);
  }, [page, totalPages]);

  if (!isHydrated) {
    return (
      <section className="section-surface p-5" aria-label="Calendar activity loading">
        <p className="text-sm font-bold text-muted-foreground">Loading activity…</p>
      </section>
    );
  }

  return (
    <section className={`android-activity-workspace w-full min-w-0 space-y-4 ${androidPresentation ? 'android-activity-workspace--native' : ''}`} aria-label="Calendar activity timeline">
      <section className="calendar-source-panel section-surface p-3 sm:p-4">
        <div>
          <h2 className="text-base font-black">What you actually did</h2>
          <p className="mt-1 text-sm text-muted-foreground">Meaningful completed and logged actions from your sections.</p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-border/50 bg-background/35 p-2" aria-label="Activity day navigation">
          <button
            type="button"
            onClick={() => setSelectedDate(current => addLocalDays(current, -1))}
            className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-black">
              {DATE_FORMATTER.format(selectedDate)}
              {isSelectedToday ? <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">Today</span> : null}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Activity for this day</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate(current => addLocalDays(current, 1))}
            className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Next day"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {!isSelectedToday ? (
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className="min-h-9 rounded-xl px-3 text-xs font-black text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Return to today
            </button>
          </div>
        ) : null}

        <div className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter activity by section">
          {ACTIVITY_SECTION_FILTERS.map(option => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                filter === option.id
                  ? 'border-primary/35 bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="android-activity-list-surface section-surface w-full min-w-0 overflow-hidden p-3 sm:p-5">
        {visibleGroups.length ? (
          <section aria-labelledby={`activity-date-${selectedDateKey}`}>
            <h3 id={`activity-date-${selectedDateKey}`} className="mb-2 px-1 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
              {isSelectedToday ? 'Today' : DATE_FORMATTER.format(selectedDate)}
            </h3>
            <div className={`divide-y divide-border/50 ${androidPresentation ? 'android-activity-list' : ''}`}>
              {visibleGroups.map(group => {
                      const entry = group.primary;
                      const meta = sectionMetaFor(entry);
                      const details = formatEntryDetails(entry, group.supporting);
                      const isNavigable = Boolean(entry.ownerLink) && entry.ownerState === 'live';
                      return (
                        <div key={entry.groupKey || entry.id} className={`flex gap-3 py-3 first:pt-2 last:pb-2 ${androidPresentation ? 'android-activity-row' : ''}`}>
                          <div className="android-activity-time w-[4.8rem] shrink-0 pt-1 text-right text-xs font-bold text-muted-foreground">
                            {entry.occurredAt ? TIME_FORMATTER.format(entry.occurredAt) : 'Time not recorded'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-black leading-snug">{entry.title}</p>
                                <p className="mt-0.5 text-xs font-bold text-muted-foreground">{meta.label}</p>
                              </div>
                              {isNavigable ? (
                                <button
                                  type="button"
                                  onClick={() => onNavigate(entry)}
                                  className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-black text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label={`Open ${entry.title}`}
                                >
                                  Open <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              ) : entry.ownerState === 'in-trash' ? (
                                <span className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-black text-muted-foreground">
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> In Trash
                                </span>
                              ) : entry.ownerState === 'unavailable' ? (
                                <span className="inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-black text-muted-foreground">Unavailable</span>
                              ) : null}
                            </div>
                            {details.length ? <p className="android-activity-details mt-1 text-sm text-muted-foreground">{details.join(' · ')}</p> : null}
                          </div>
                        </div>
                      );
              })}
            </div>
          </section>
        ) : (
          <div className="py-10 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Pill className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-3 text-sm font-black">No activity for this day.</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Choose another day or return to today.</p>
          </div>
        )}
        {androidPresentation && totalPages > 1 ? (
          <nav className="android-activity-pagination mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-3" aria-label="Activity pagination">
            <button
              type="button"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="min-h-10 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
            >
              Previous
            </button>
            <span className="min-w-0 text-center text-xs font-black text-muted-foreground" aria-live="polite">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="min-h-10 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
            >
              Next
            </button>
          </nav>
        ) : null}
      </section>

      {androidPresentation ? <p className="px-1 text-center text-[11px] font-bold text-muted-foreground">Activity is derived from this profile’s saved records.</p> : null}
    </section>
  );
}
