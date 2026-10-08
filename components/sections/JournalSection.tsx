
'use client';

import { createPortal } from 'react-dom';
import { AndroidMonthGrid } from '@/components/native/AndroidMonthGrid';
import { AndroidDismissibleBackdrop, CaizenBottomSheet } from '@/components/native/android-design';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flame,
  Grid3X3,
  ImageIcon,
  List,
  Music,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';

import { useAppContext } from '@/lib/context';
import { JournalEntry, MusicItem, MoodType } from '@/lib/types';
import { JOURNAL_MOODS } from '@/lib/journal-moods';
import {
  decodeJournalContent,
  deriveJournalPresentation,
  getJournalPreview,
  JournalContentDraft,
  JournalPresentationState,
} from '@/lib/journal-content';
import { getMusicLinkIdentity } from '@/lib/music-links';
import { parseLocalDateKey, parseLocalDateValue, toLocalDateKey } from '@/lib/lifehub/date-utils';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import {
  claimRequestSignal,
  isProfileBoundRequestReady,
} from '@/lib/section-feature-request';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { isAndroid } from '@/lib/platform';

import { Card } from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/collection-controls';

import JournalModal from '@/components/modals/JournalModal';
import { getMusicPlaybackCapabilities, useMusicPlayer } from '@/lib/music-player';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

/* =========================================
   MONTHS
========================================= */

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type JournalViewData = JournalPresentationState;

type JournalViewModal = {
  entry: JournalEntry;
  data: JournalViewData;
};

type JournalMemoryPreview = {
  assetId?: string;
  imageUrl?: string;
};

type JournalSectionProps = {
  onAddClick: () => void;
  compactMobileMode?: boolean;
  androidPresentation?: boolean;
  requestedProfileId?: string;
  requestedFeature?: string;
  requestedRecordId?: string;
  requestedDateKey?: string;
  requestedRecordSignal?: number;
  onRequestedRecordConsumed?: (signal: number) => void;
};

function findLatestJournalEntry(entries: JournalEntry[], date: Date): JournalEntry | undefined {
  return entries
    .filter(entry => toLocalDateKey(entry.date) === toLocalDateKey(date))
    .sort((a, b) => {
      const timeDifference = new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime();
      return timeDifference || String(b.id).localeCompare(String(a.id));
    })[0];
}

function findLinkedMusicItem(link: string, items: MusicItem[]) {
  const identity = getMusicLinkIdentity(link);
  if (!identity) return undefined;
  return items.find(item => getMusicLinkIdentity(item.url) === identity);
}

function getMusicProviderLabel(provider: MusicItem['provider']) {
  return provider === 'youtube' ? 'YouTube' : provider === 'spotify' ? 'Spotify' : 'Link';
}

function getJournalPresentationState(entry: JournalEntry): JournalPresentationState {
  return deriveJournalPresentation(entry, normalizeExternalWebUrl);
}

function JournalMonthDayVisual({
  date,
  entry,
  presentation,
  profileId,
}: {
  date: Date;
  entry: JournalEntry;
  presentation: JournalPresentationState;
  profileId?: string;
}) {
  const photoAssetId = entry.photoAssetIds?.find(id => typeof id === 'string' && id.trim())?.trim();
  const photoUrl = typeof entry.image === 'string'
    ? normalizeExternalWebUrl(entry.image.trim())
    : null;
  const hasPhoto = Boolean((photoAssetId && profileId) || photoUrl);
  const dateLabel = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className={`journal-month-day-visual ${hasPhoto ? 'journal-month-day-visual--photo' : ''}`}>
      {hasPhoto ? (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {photoAssetId && profileId ? (
            <MediaAssetImage
              assetId={photoAssetId}
              profileId={profileId}
              alt={`Journal memory for ${dateLabel}`}
              className="h-full w-full object-cover"
              fallback={photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : undefined}
            />
          ) : photoUrl ? (
            <img src={photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          ) : null}
          <span className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/5 to-black/60" />
        </div>
      ) : null}

      <div className="relative z-10 flex items-start justify-between gap-2">
        <span className="journal-month-day-number">{date.getDate()}</span>
        {presentation.mood ? <i className="journal-month-day-mood-dot" data-mood={presentation.mood} aria-hidden="true" /> : null}
      </div>

    </div>
  );
}

/* =========================================
   COMPONENT
========================================= */

export default function JournalSection({
  onAddClick,
  compactMobileMode = false,
  androidPresentation = false,
  requestedProfileId,
  requestedFeature,
  requestedRecordId,
  requestedDateKey,
  requestedRecordSignal = 0,
  onRequestedRecordConsumed,
}: JournalSectionProps) {
  const {
    journalEntries,
    musicItems,
    currentProfileId,
    isHydrated,
    deleteJournalEntry,
  } = useAppContext();
  const { playItems } = useMusicPlayer();

  const today =
    new Date();

  /* =========================================
     STATE
  ========================================= */

  const [
    editingId,
    setEditingId,
  ] = useState<string | null>(null);

  const consumedRequestSignalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isProfileBoundRequestReady({
      isHydrated,
      requestedProfileId,
      currentProfileId,
      signal: requestedRecordSignal,
    })) return;
    if (!claimRequestSignal(consumedRequestSignalRef, requestedRecordSignal)) return;

    if (requestedRecordId && journalEntries.some(entry => entry.id === requestedRecordId)) {
      setEditingId(requestedRecordId);
      setShowEditModal(true);
    } else if (requestedFeature === 'journal-entry' && requestedDateKey) {
      const requestedDate = parseLocalDateKey(requestedDateKey);
      if (requestedDate) {
        const existing = findLatestJournalEntry(journalEntries, requestedDate);
        if (existing) {
          setEditingId(existing.id);
          setShowEditModal(true);
        } else {
          setNewEntryDate(requestedDate);
        }
      }
    }
    onRequestedRecordConsumed?.(requestedRecordSignal);
  }, [
    currentProfileId,
    isHydrated,
    journalEntries,
    onRequestedRecordConsumed,
    requestedProfileId,
    requestedFeature,
    requestedRecordId,
    requestedDateKey,
    requestedRecordSignal,
  ]);

  const [
    showEditModal,
    setShowEditModal,
  ] = useState(false);

  const [
    deletingId,
    setDeletingId,
  ] = useState<string | null>(null);

  const [
    musicModal,
    setMusicModal,
  ] = useState<string[] | null>(null);

  const [
    viewModal,
    setViewModal,
  ] = useState<JournalViewModal | null>(null);

  const [memoryPreview, setMemoryPreview] = useState<JournalMemoryPreview | null>(null);

  const viewOverlayRef = useRef<HTMLDivElement>(null);
  const memoryOverlayRef = useRef<HTMLDivElement>(null);
  const musicOverlayRef = useRef<HTMLDivElement>(null);

  const [
    alreadyLoggedModal,
    setAlreadyLoggedModal,
  ] = useState(false);

  const [
    currentDate,
    setCurrentDate,
  ] = useState(
    new Date()
  );

  const [viewMode, setViewMode] =
    useState(androidPresentation ? 'list' : 'week');

  const [timelinePeriod, setTimelinePeriod] =
    useState<'all' | 1 | 2 | 3 | 4 | 5>('all');

  const [dayDetailDate, setDayDetailDate] =
    useState<Date | null>(null);

  const [newEntryDate, setNewEntryDate] =
    useState<Date | null>(null);

  const [searchQuery, setSearchQuery] =
    useState('');

  const closeJournalEditor = () => {
    setShowEditModal(false);
    setEditingId(null);
    setViewModal(null);
    setDayDetailDate(null);
  };

  useOverlayLifecycle(
    viewModal !== null,
    () => setViewModal(null),
    { containerRef: viewOverlayRef },
  );

  useOverlayLifecycle(
    musicModal !== null,
    () => setMusicModal(null),
    { containerRef: musicOverlayRef },
  );

  /* =========================================
     HELPERS
  ========================================= */

  const month =
    currentDate.getMonth();

  const year =
    currentDate.getFullYear();

  const isSameDay = (d1: Date | string, d2: Date | string) =>
    toLocalDateKey(d1) === toLocalDateKey(d2);

  const todayEntry =
    useMemo(
      () =>
        findLatestJournalEntry(journalEntries, today),
      [journalEntries, today]
    );

  const journalStreak =
    useMemo(() => {
      const loggedDays = new Set(
        journalEntries.map(entry =>
          toLocalDateKey(entry.date)
        )
      );

      let streak = 0;
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);

      while (loggedDays.has(toLocalDateKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }

      return streak;
    }, [journalEntries]);

  const currentWeek =
    Math.ceil(
      today.getDate() / 7
    );

  const [
    selectedWeek,
    setSelectedWeek,
  ] = useState(
    currentWeek
  );

  /* =========================================
     MONTH NAV
  ========================================= */

  const previousMonth = () => {
    setCurrentDate(
      prev =>
        new Date(
          prev.getFullYear(),
          prev.getMonth() - 1,
          1
        )
    );
  };

  const nextMonth = () => {
    setCurrentDate(
      prev =>
        new Date(
          prev.getFullYear(),
          prev.getMonth() + 1,
          1
        )
    );
  };

  /* =========================================
     TODAY ENTRY CHECK
  ========================================= */

  const handleAddClick =
    () => {
      const latestTodayEntry = findLatestJournalEntry(journalEntries, today);
      if (latestTodayEntry) {
        setEditingId(latestTodayEntry.id);
        setShowEditModal(true);

        return;
      }

      onAddClick();
    };

  const openCreateForDate = (date: Date) => {
    const existingEntry = findLatestJournalEntry(journalEntries, date);
    if (existingEntry) {
      setNewEntryDate(null);
      setEditingId(existingEntry.id);
      setShowEditModal(true);
      return;
    }

    setNewEntryDate(new Date(date.getTime()));
  };

  /* =========================================
     DAYS
  ========================================= */

  const daysInMonth =
    new Date(
      year,
      month + 1,
      0
    ).getDate();

  const maxWeek = Math.max(1, Math.ceil(daysInMonth / 7));
  const effectiveSelectedWeek = Math.min(selectedWeek, maxWeek);

  useEffect(() => {
    if (selectedWeek > maxWeek) setSelectedWeek(maxWeek);
  }, [maxWeek, selectedWeek]);

  const weekRanges = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, 28],
    [29, daysInMonth],
  ];

  const selectedRange =
    weekRanges[
    effectiveSelectedWeek - 1
    ];

  const start = selectedRange?.[0] || 1;

  const end = Math.max(start, Math.min(selectedRange?.[1] || daysInMonth, daysInMonth));

  const selectedWeekDays = useMemo(
    () => Array.from(
      { length: end - start + 1 },
      (_, i) => new Date(year, month, start + i),
    ),
    [end, month, start, year],
  );

  const daysArray =
    useMemo(() => {
      if (
        viewMode ===
        'month'
      ) {
        return Array.from(
          {
            length:
              daysInMonth,
          },
          (_, i) =>
            new Date(
              year,
              month,
              i + 1
            )
        );
      }

      return timelinePeriod === 'all'
        ? Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
        : selectedWeekDays;
    }, [
      viewMode,
      month,
      year,
      daysInMonth,
      selectedWeekDays,
      timelinePeriod,
    ]);

  const firstWeekday = new Date(year, month, 1).getDay();

  /* =========================================
     FIND ENTRY
  ========================================= */

  const findEntry = (date: Date) => findLatestJournalEntry(journalEntries, date);

  /* =========================================
     MOODS
  ========================================= */

  const moodChip: Record<MoodType, string> = {
    rough:
      'bg-red-500/10 text-red-600 dark:text-red-300 border border-red-500/20',

    okay:
      'bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/20',

    good:
      'bg-green-500/10 text-green-600 dark:text-green-300 border border-green-500/20',
  };
  const moodAccent: Record<MoodType, string> = {
    rough: 'border-l-rose-400',
    okay: 'border-l-slate-400',
    good: 'border-l-emerald-400',
  };
  /* =========================================
     PARSE CONTENT
  ========================================= */

  const parseContent = decodeJournalContent;

  const weeklyMoodSummary =
    selectedWeekDays.reduce(
      (summary, day) => {
        const entry = findEntry(day);
        if (!entry) return summary;

        const mood = getJournalPresentationState(entry).mood;
        if (!mood) return summary;
        return {
          ...summary,
          [mood]: summary[mood] + 1,
        };
      },
      { rough: 0, okay: 0, good: 0 }
    );

  const normalizedSearch =
    searchQuery.trim().toLowerCase();

  const matchesSearch = (
    entry: JournalEntry,
    data: JournalContentDraft
  ) =>
    !normalizedSearch ||
    [
      entry.content,
      entry.mood,
      data.mattered,
      data.wentWell,
      data.didntGoWell,
      data.tomorrow,
      ...(data.musicLinks || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);

  const monthEntries = useMemo(
    () => journalEntries.filter(entry => {
      const date = parseLocalDateValue(entry.date);
      return Boolean(date && date.getFullYear() === year && date.getMonth() === month);
    }),
    [journalEntries, month, year],
  );

  useOverlayLifecycle(
    memoryPreview !== null,
    () => setMemoryPreview(null),
    { containerRef: memoryOverlayRef },
  );

  useOverlayLifecycle(
    alreadyLoggedModal && isAndroid(),
    () => setAlreadyLoggedModal(false),
  );

  const moodCounts = [
    { value: 'rough' as const, count: weeklyMoodSummary.rough },
    { value: 'okay' as const, count: weeklyMoodSummary.okay },
    { value: 'good' as const, count: weeklyMoodSummary.good },
  ];
  const maxMoodCount = Math.max(...moodCounts.map(item => item.count));
  const leadingMoods = moodCounts.filter(item => item.count === maxMoodCount && item.count > 0);
  const weeklyMoodLabel = leadingMoods.length === 1
    ? `${JOURNAL_MOODS.find(item => item.value === leadingMoods[0].value)?.label} · ${leadingMoods[0].count}`
    : leadingMoods.length > 1
      ? 'Mixed'
      : 'No mood recorded';

  const searchMatchesInView = !normalizedSearch || daysArray.some(day => {
    const entry = findEntry(day);
    return Boolean(entry && matchesSearch(entry, parseContent(entry.content)));
  });

  const modalRoot =
    typeof document !== 'undefined'
      ? document.body
      : null;

  if (androidPresentation) {
    const recentEntries = [...journalEntries]
      .filter((entry) => matchesSearch(entry, parseContent(entry.content)))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const isCalendar = viewMode === 'month';

    return (
      <section className="android-module-home" data-android-screen={isCalendar ? 'journal-calendar' : 'journal-list'}>
        <div className="android-page-heading">
          <div><h1>Journal</h1><p>{journalEntries.length} entr{journalEntries.length === 1 ? 'y' : 'ies'}</p></div>
          <button type="button" onClick={handleAddClick} className="android-primary-button">New Entry</button>
        </div>

        <SegmentedControl
          label="Journal view"
          value={isCalendar ? 'month' : 'list'}
          onValueChange={value => setViewMode(value === 'month' ? 'month' : 'list')}
          size="compact"
          className="android-journal-view-switch"
          options={[
            { value: 'list', label: <><List className="size-4" aria-hidden="true" /><span>Timeline</span></> },
            { value: 'month', label: <><Grid3X3 className="size-4" aria-hidden="true" /><span>Calendar</span></> },
          ]}
        />

        {!isCalendar ? (
          <>
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              aria-label="Search journal"
              placeholder="Search entries"
              surface="solid"
            />
            <div className="android-compact-list">
              {recentEntries.length === 0 ? (
                <div className="android-empty-row">
                  <p>No journal entries yet.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Write a thought or moment to keep with the day.</p>
                  <button type="button" className="android-primary-button mt-3" onClick={handleAddClick}>+ Add Entry</button>
                </div>
              ) : recentEntries.map((entry) => {
                const presentation = getJournalPresentationState(entry);
                const data = presentation.content;
                const moodLabel = presentation.mood
                  ? JOURNAL_MOODS.find(item => item.value === presentation.mood)?.label
                  : null;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="motion-pop android-record-row"
                    onClick={() => {
                      setEditingId(entry.id);
                      setShowEditModal(true);
                    }}
                  >
                    <span className="android-record-copy">
                      <strong>{parseLocalDateValue(entry.date)?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                      <small>{data.mattered || data.wentWell || (moodLabel ? `${moodLabel} mood` : 'Journal entry')}</small>
                    </span>
                    {presentation.mood ? (
                      <span className="android-mood-dot" data-mood={presentation.mood} aria-label={`Mood: ${moodLabel}`} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="android-journal-calendar">
            {/* Converged on the shared month grid so Journal, Life Hub and
                Work Hub cannot drift apart again. */}
            <AndroidMonthGrid
              month={new Date(year, month, 1)}
              onMonthChange={setCurrentDate}
              onSelectDay={(_key, day) => setDayDetailDate(day)}
              renderDayContent={({ date }) => {
                const entry = findEntry(date);
                if (!entry) {
                  return <span className="journal-month-day-empty-number">{date.getDate()}</span>;
                }
                const presentation = getJournalPresentationState(entry);
                return (
                  <JournalMonthDayVisual
                    date={date}
                    entry={entry}
                    presentation={presentation}
                    profileId={currentProfileId}
                  />
                );
              }}
              getDayMeta={(_key, day) => {
                const entry = findEntry(day);
                if (!entry) return { label: 'no entry yet' };
                const presentation = getJournalPresentationState(entry);
                const moodLabel = presentation.mood
                  ? JOURNAL_MOODS.find(item => item.value === presentation.mood)?.label
                  : null;
                return {
                  state: 'has-entry',
                  ...(presentation.mood ? { mood: presentation.mood } : {}),
                  label: [
                    'Journal entry',
                    moodLabel ? `mood: ${moodLabel}` : null,
                    presentation.hasMemory ? 'memory photo' : null,
                    presentation.hasMusic ? 'music' : null,
                  ].filter(Boolean).join(', '),
                };
              }}
              footer={
                <>
                  <div className="journal-mood-legend" aria-label="Mood legend">
                    {JOURNAL_MOODS.map((mood) => <span key={mood.value}><i data-mood={mood.value} />{mood.label}</span>)}
                  </div>
                  <p className="android-calendar-hint">Tap a date to see its entry or add one.</p>
                </>
              }
            />
          </div>
        )}

        <CaizenBottomSheet
          open={dayDetailDate !== null}
          title={dayDetailDate?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) ?? 'Day'}
          onClose={() => setDayDetailDate(null)}
          dismissOnBackdrop
        >
          {dayDetailDate && (() => {
            const entry = findEntry(dayDetailDate);
            const isToday = isSameDay(dayDetailDate, today);
            const isFuture = dayDetailDate.getTime() > new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate(),
              23,
              59,
              59,
              999,
            ).getTime();
            return entry ? (
              (() => {
                const presentation = getJournalPresentationState(entry);
                const moodLabel = presentation.mood
                  ? JOURNAL_MOODS.find(item => item.value === presentation.mood)?.label
                  : null;
                const reflections = [
                  ['Reflection', presentation.content.mattered],
                  ['What went well?', presentation.content.wentWell],
                  ["What didn't go well?", presentation.content.didntGoWell],
                  ['Tomorrow', presentation.content.tomorrow],
                ] as const;
                const assetId = entry.photoAssetIds?.find(id => typeof id === 'string' && id.trim())?.trim();
                const imageUrl = typeof entry.image === 'string'
                  ? normalizeExternalWebUrl(entry.image.trim())
                  : null;
                const memoryPreviewValue = assetId
                  ? { assetId }
                  : imageUrl
                    ? { imageUrl }
                    : null;

                return (
                  <div className="android-journal-detail space-y-4">
                    <div>
                      <p className="text-card-title">{moodLabel || 'Journal entry'}</p>
                      {presentation.mood ? <span className="mt-2 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{moodLabel}</span> : null}
                    </div>

                    {reflections.some(([, content]) => content.trim()) ? (
                      <div className="space-y-3">
                        {reflections.map(([label, content]) => content.trim() ? (
                          <section key={label} className="border-t border-border/50 pt-3 first:border-t-0 first:pt-0">
                            <h3 className="text-label text-muted-foreground">{label}</h3>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
                          </section>
                        ) : null)}
                      </div>
                    ) : <p className="rounded-xl border border-dashed border-border/50 px-3 py-3 text-sm text-muted-foreground">No written reflection</p>}

                    {presentation.hasMemory ? (
                      <section className="border-t border-border/50 pt-4">
                        <h3 className="text-label text-muted-foreground">Memory</h3>
                        {memoryPreviewValue ? (
                          <button
                            type="button"
                            className="mt-2 block w-full overflow-hidden rounded-xl border border-border/50 bg-background/40 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            onClick={() => setMemoryPreview(memoryPreviewValue)}
                            aria-label="Open memory photo"
                          >
                            {assetId && currentProfileId ? (
                              <MediaAssetImage assetId={assetId} profileId={currentProfileId} alt="Journal memory" className="max-h-56 w-full object-cover" fallback={imageUrl ? <img src={imageUrl} alt="" className="max-h-56 w-full object-cover" /> : undefined} />
                            ) : imageUrl ? <img src={imageUrl} alt="Journal memory" className="max-h-56 w-full object-cover" /> : null}
                            <span className="block px-3 py-2 text-xs font-bold text-muted-foreground">Tap to view the full image.</span>
                          </button>
                        ) : <p className="mt-2 text-sm text-muted-foreground">Memory saved for this day.</p>}
                      </section>
                    ) : null}

                    {presentation.hasMusic ? (
                      <section className="border-t border-border/50 pt-4">
                        <h3 className="text-label text-muted-foreground">Music Today</h3>
                        <div className="mt-2 space-y-2">
                          {presentation.usableMusicLinks.map((link, index) => {
                            const linkedItem = findLinkedMusicItem(link, musicItems);
                            const canPlay = Boolean(linkedItem && getMusicPlaybackCapabilities(linkedItem).canControlPlayback);
                            return (
                              <div key={index} className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/40 p-2">
                                {linkedItem?.image ? <img src={linkedItem.image} alt="" aria-hidden="true" className="size-9 shrink-0 rounded-lg object-cover" /> : <Music className="ml-1 size-4 shrink-0 text-primary" aria-hidden="true" />}
                                <div className="min-w-0 flex-1">
                                  <OverflowTooltip text={linkedItem?.title || link}><p className="truncate text-sm font-bold">{linkedItem?.title || link}</p></OverflowTooltip>
                                  {linkedItem ? <p className="truncate text-xs text-muted-foreground">{linkedItem.artist || 'Unknown artist'} · {getMusicProviderLabel(linkedItem.provider)}</p> : null}
                                </div>
                                {canPlay && linkedItem ? <button type="button" onClick={() => playItems(linkedItem.id, [linkedItem])} className="min-h-10 shrink-0 rounded-lg border border-border/50 px-2.5 text-xs font-bold" aria-label={`Play ${linkedItem.title}`}>Play</button> : null}
                                <button type="button" onClick={() => void openExternalLink(link)} className="min-h-10 shrink-0 rounded-lg border border-border/50 px-2.5 text-xs font-bold" aria-label={`${canPlay ? 'Open source for' : 'Open'} music link ${index + 1}`}>Open</button>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ) : null}
                  </div>
                );
              })()
            ) : (
              <div className="android-empty-row">
                <p>No entry for this date yet.</p>
                {!isFuture && (
                  <button type="button" className="android-primary-button" onClick={() => {
                    if (isToday) {
                      handleAddClick();
                    } else {
                      openCreateForDate(dayDetailDate);
                    }
                    setDayDetailDate(null);
                  }}>
                    + Add Entry
                  </button>
                )}
              </div>
            );
          })()}
        </CaizenBottomSheet>

        {editingId && (
          <JournalModal
            isOpen={showEditModal}
            onClose={closeJournalEditor}
            entryId={editingId}
          />
        )}

        {newEntryDate && (
          <JournalModal
            isOpen
            initialDate={newEntryDate}
            onClose={() => setNewEntryDate(null)}
          />
        )}
      </section>
    );
  }

  if (compactMobileMode) {
    const recentEntries = [...journalEntries]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);

    return (
      <section className="compact-section space-y-3">
        <div className="compact-sticky-header">
          <div>
            <h1 className="text-page-title">Journal</h1>
            <p className="text-xs text-muted-foreground">
              {todayEntry ? "Today's entry ready" : "Today's entry"}
            </p>
          </div>
          <button type="button" onClick={handleAddClick} className="rounded-2xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground">
            {todayEntry ? 'Edit' : '+ Entry'}
          </button>
        </div>

        {todayEntry && (
          <button
            type="button"
            onClick={() => {
              setEditingId(todayEntry.id);
              setShowEditModal(true);
            }}
            className="compact-card w-full text-left"
          >
            <p className="text-xs font-black uppercase tracking-wide text-primary">Today</p>
            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
              {parseContent(todayEntry.content).mattered || todayEntry.content || 'Open today entry'}
            </p>
          </button>
        )}

        <div className="compact-card">
          <p className="mb-2 text-label text-muted-foreground">Recent</p>
          <div className="space-y-2">
            {recentEntries.length === 0 ? (
              <div className="compact-empty space-y-2">
                <p>No journal entries yet. Write a thought or moment to keep with the day.</p>
                <button type="button" className="rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground" onClick={handleAddClick}>
                  + Add entry
                </button>
              </div>
            ) : (
              recentEntries.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                      setEditingId(entry.id);
                      setShowEditModal(true);
                    }}
                  className="motion-pop compact-list-row"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{parseLocalDateValue(entry.date)?.toLocaleDateString()}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {getJournalPresentationState(entry).mood
                        ? JOURNAL_MOODS.find(item => item.value === getJournalPresentationState(entry).mood)?.label
                        : 'Journal entry'}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">Edit</span>
                </button>
              ))
            )}
          </div>
        </div>

        {editingId && (
          <JournalModal
            isOpen={showEditModal}
            onClose={closeJournalEditor}
            entryId={editingId}
          />
        )}

        {newEntryDate && (
          <JournalModal
            isOpen
            initialDate={newEntryDate}
            onClose={() => setNewEntryDate(null)}
          />
        )}

        <ConfirmDialog
          isOpen={deletingId !== null}
          title="Delete Journal"
          message="Are you sure?"
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous
          onConfirm={() => {
            if (deletingId) {
              deleteJournalEntry(deletingId);
            }
            setDeletingId(null);
          }}
          onCancel={() => setDeletingId(null)}
        />
      </section>
    );
  }

  return (
    <div className="workspace-standard space-y-4 lg:space-y-5">
      {/* =========================================
          HERO
      ========================================= */}

      <div
        className="
          relative

          overflow-hidden

          rounded-2xl

          border border-border/50

          bg-card/70

          p-4
          sm:p-5
        "
      >

        <div className="relative">

          {/* TOP */}
          <div
            className="
              flex
              flex-col
              gap-4

              lg:flex-row
              lg:items-center
              lg:justify-between
            "
          >

            <div>

              <h1 className="text-page-title">

                Journal

              </h1>

              <p
                className="
                  mt-3
                  max-w-2xl

                  text-sm
                  leading-relaxed
                  text-muted-foreground
                "
              >

                Capture thoughts, moods, memories, and music.

              </p>

            </div>

            <Button
              onClick={handleAddClick}
              className="
                h-12
                rounded-2xl
                px-6
                font-semibold
              "
            >

              {todayEntry
                ? "Edit today's entry"
                : 'New Entry'}

            </Button>

          </div>

          {/* NAV */}
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="border-t border-border/50 px-1 py-3">
              <p className="text-metadata text-muted-foreground">
                Today
              </p>
              <p className="mt-1 text-sm font-semibold">
                {todayEntry ? 'Logged today' : 'Not logged today'}
              </p>
            </div>

            <div className="border-t border-border/50 px-1 py-3">
              <p className="text-metadata text-muted-foreground">
                This month
              </p>
              <p className="mt-1 text-sm font-semibold">
                {monthEntries.length} entr{monthEntries.length === 1 ? 'y' : 'ies'}
              </p>
            </div>

            <div className="border-t border-border/50 px-1 py-3">
              <p className="text-metadata text-muted-foreground">
                Weekly Mood
              </p>
              <p className="mt-1 text-sm font-bold">
                {weeklyMoodLabel}
              </p>
            </div>
          </div>
          {journalStreak > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Flame className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {journalStreak}-day Journal streak
            </p>
          ) : null}

          <div role="group" aria-label="Journal navigation and view" className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-background/60 p-2">
            <div role="group" className="flex h-11 shrink-0 items-center rounded-xl bg-muted/50" aria-label="Journal month">
              <button type="button" onClick={previousMonth} aria-label="Previous month" className="journal-calendar-control flex h-11 w-11 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="min-w-32 px-1 text-center text-sm font-bold sm:min-w-36">{months[month]} {year}</h2>
              <button type="button" onClick={nextMonth} aria-label="Next month" className="journal-calendar-control flex h-11 w-11 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <SearchField
              wrapperClassName="min-w-40 flex-1 sm:min-w-48"
              value={searchQuery}
              onChange={setSearchQuery}
              aria-label="Search journal entries"
              placeholder="Search journal..."
              surface="solid"
            />

            {viewMode === 'week' ? (
              <Select value={timelinePeriod === 'all' ? 'all' : String(effectiveSelectedWeek)} onValueChange={value => {
                if (value === 'all') {
                  setTimelinePeriod('all');
                } else {
                  const week = Number(value) as 1 | 2 | 3 | 4 | 5;
                  setSelectedWeek(week);
                  setTimelinePeriod(week);
                }
              }}>
                <SelectTrigger aria-label="Journal timeline period" className="h-11 w-32 shrink-0 rounded-xl border-0 bg-muted/50 shadow-none focus-visible:ring-2 focus-visible:ring-ring">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All month</SelectItem>
                  {[1, 2, 3, 4, 5].filter(week => (week - 1) * 7 + 1 <= daysInMonth).map(week => (
                    <SelectItem key={week} value={String(week)}>Week {week}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <SegmentedControl
              label="Journal view"
              value={viewMode}
              onValueChange={value => setViewMode(value as 'week' | 'month')}
              size="compact"
              className="journal-calendar-control"
              options={[
                { value: 'week', label: <><List className="size-4" aria-hidden="true" /><span>Timeline</span></> },
                { value: 'month', label: <><Grid3X3 className="size-4" aria-hidden="true" /><span>Calendar</span></> },
              ]}
            />
          </div>

        </div>

      </div>

      {/* =========================================
          CONTENT
      ========================================= */}

      <div className={viewMode === 'month' ? 'mobile-calendar-scroll' : ''}>
      {viewMode === 'month' ? (
        <div className="mb-2 grid grid-cols-7 gap-3 px-1 text-center text-xs font-medium text-muted-foreground" aria-hidden="true">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}
        </div>
      ) : null}
      <div
        className={
          viewMode ===
            'month'
            ? `
              mobile-calendar-grid
              grid
              grid-cols-7
              gap-3
            `
            : `
              space-y-5
            `
        }
      >

        {!normalizedSearch && viewMode === 'week' && timelinePeriod === 'all' && monthEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/50 bg-muted/20 p-8 text-center">
            <p className="text-card-title">No entries this month</p>
            <p className="mt-1 text-sm text-muted-foreground">Capture a thought, memory, or mood to start your Journal.</p>
            <Button type="button" onClick={handleAddClick} className="mt-4 rounded-xl">New Entry</Button>
          </div>
        ) : normalizedSearch && !searchMatchesInView ? (
          <div className="rounded-2xl border border-dashed border-border/50 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            <p>No entries match your search.</p>
            <Button type="button" variant="ghost" onClick={() => setSearchQuery('')} className="mt-3 text-primary">Clear search</Button>
          </div>
        ) : (
          <>
          {viewMode === 'month' && firstWeekday > 0 ? Array.from({ length: firstWeekday }, (_, index) => <div key={`offset-${index}`} aria-hidden="true" />) : null}
          {daysArray.map(
          (
            day,
            index
          ) => {
            const entry =
              findEntry(
                day
              );

            const presentation = entry
              ? getJournalPresentationState(entry)
              : null;
            const data = presentation?.content || decodeJournalContent('');

            if (
              normalizedSearch &&
              (!entry || !matchesSearch(entry, data))
            ) {
              return viewMode === 'month'
                ? <div key={index} aria-hidden="true" className="h-24 rounded-2xl border border-transparent opacity-0" />
                : null;
            }

            const moodKey = presentation?.mood || null;
            const moodLabel = moodKey
              ? JOURNAL_MOODS.find(item => item.value === moodKey)?.label
              : null;

            const isToday =
              isSameDay(
                day,
                today
              );
            const isSelected = viewMode === 'month' && dayDetailDate
              ? isSameDay(day, dayDetailDate)
              : false;

            /* =========================================
               EMPTY
            ========================================= */

            if (!entry) {
              const isFuture = !isToday && day.getTime() > today.getTime();
              const canCreate = !isFuture;
              const startCreate = () => {
                if (isToday) handleAddClick();
                else openCreateForDate(day);
              };

              if (viewMode === 'week') {
                if (timelinePeriod === 'all') return null;
                return (
                  <div
                    key={index}
                    className={`flex min-h-16 items-center gap-3 rounded-2xl border border-dashed px-3 py-3 sm:px-4 ${
                      isToday ? 'border-white/80 ring-2 ring-white/60' : 'border-border/50 bg-muted/20'
                    }`}
                  >
                    <div className="w-20 shrink-0 sm:w-28">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {day.toLocaleDateString(undefined, { weekday: 'short' })}
                      </p>
                      <p className="mt-1 text-sm font-black">
                        {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                      {isFuture ? 'No entry' : 'No entry yet'}
                    </p>
                    {canCreate ? (
                      <button
                        type="button"
                        onClick={startCreate}
                        className="flex h-10 shrink-0 items-center rounded-xl border border-primary/30 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`Add journal entry for ${day.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`}
                      >
                        Add
                      </button>
                    ) : null}
                  </div>
                );
              }

              return (
                <Card
                  key={index}
                  role={canCreate ? 'button' : undefined}
                  tabIndex={canCreate ? 0 : undefined}
                  onClick={canCreate ? startCreate : undefined}
                  onKeyDown={canCreate ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      startCreate();
                    }
                  } : undefined}
                  className={`
                    border-dashed

                    bg-muted/20

                    ${isToday ? 'ring-2 ring-white/80 shadow-lg shadow-white/20 border-white/80' : ''}

                    ${isSelected ? 'ring-2 ring-primary/60 border-primary/60' : ''}

                    ${canCreate ? 'cursor-pointer transition-colors hover:border-primary/60 hover:bg-muted/30' : ''}

                    ${viewMode ===
                      'month'
                      ? `
                          flex
                          h-24
                          items-center
                          justify-center
                        `
                      : `
                          p-8
                        `
                    }
                  `}
                  aria-current={isToday ? 'date' : undefined}
                  aria-selected={viewMode === 'month' ? isSelected : undefined}
                  aria-label={`${day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${isFuture ? 'future day' : canCreate ? 'empty day, add journal entry' : 'empty day'}`}
                >

                  {viewMode ===
                    'month' ? (

                    <p
                      className="
                        text-sm
                        font-bold
                        text-muted-foreground
                      "
                    >

                      {day.getDate()}

                    </p>

                  ) : (

                    <div>

                      <p
                        className="
                          text-lg
                          font-bold
                        "
                      >

                        {day.toLocaleDateString(
                          undefined,
                          {
                            weekday:
                              'long',
                          }
                        )}

                      </p>

                      <p className="mt-2 text-sm text-muted-foreground">

                        {isFuture
                          ? 'No journal entry for this day yet.'
                          : 'No journal entry for this day. Add one when you want to record it.'}

                      </p>

                      {canCreate ? (
                        <p className="mt-3 text-sm font-black text-primary">
                          {isToday
                            ? 'Add entry for today'
                            : `Add entry for ${day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                        </p>
                      ) : null}

                    </div>

                  )}

                </Card>
              );
            }

            /* =========================================
               ENTRY
            ========================================= */

            if (viewMode === 'week') {
              const preview = getJournalPreview(data);
              const firstMusicLink = presentation?.usableMusicLinks[0];
              const linkedMusic = firstMusicLink
                ? findLinkedMusicItem(firstMusicLink, musicItems)
                : undefined;
              const linkedMusicCanPlay = Boolean(
                linkedMusic && getMusicPlaybackCapabilities(linkedMusic).canControlPlayback,
              );
              const safeMusicLink = firstMusicLink || null;
              const hasMemory = Boolean(presentation?.hasMemory);
              const hasMusic = Boolean(presentation?.hasMusic);
              const moodLabel = moodKey
                ? JOURNAL_MOODS.find(item => item.value === moodKey)?.label
                : null;

              return (
                <div
                  key={entry.id}
                  data-mood={moodKey || undefined}
                  className={`journal-mood-surface flex min-h-20 items-center gap-3 rounded-2xl border bg-card/60 px-3 py-3 sm:gap-4 sm:px-4 ${
                    isToday ? 'border-white/80 ring-2 ring-white/60' : `${moodKey ? moodAccent[moodKey] : 'border-l-transparent'} border-border/50`
                  }`}
                >
                  <div className="w-20 shrink-0 sm:w-28">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {day.toLocaleDateString(undefined, { weekday: 'short' })}
                    </p>
                    <p className="mt-1 text-sm font-black">
                      {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setViewModal({ entry, data: presentation! })}
                    className="min-w-0 flex-1 rounded-xl px-2 py-1 text-left transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Open journal entry for ${day.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {moodLabel && moodKey ? <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${moodChip[moodKey]}`}>{moodLabel}</span> : null}
                      {hasMemory ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-label="Has memory photo"><ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />Memory</span> : null}
                      {hasMusic ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-label="Has music"><Music className="h-3.5 w-3.5" aria-hidden="true" />Music</span> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {preview || 'Mood recorded'}
                    </p>
                    {linkedMusic ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {linkedMusic.title}
                        {linkedMusic.artist ? ` · ${linkedMusic.artist}` : ''}
                        {` · ${getMusicProviderLabel(linkedMusic.provider)}`}
                      </p>
                    ) : null}
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {hasMusic && firstMusicLink && (linkedMusic || safeMusicLink) ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (linkedMusicCanPlay && linkedMusic) playItems(linkedMusic.id, [linkedMusic]);
                          else if (safeMusicLink) void openExternalLink(safeMusicLink);
                        }}
                        aria-label={linkedMusicCanPlay && linkedMusic ? `Play ${linkedMusic.title}` : 'Open linked music'}
                        className="flex h-10 items-center justify-center rounded-xl border border-border/50 px-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {linkedMusicCanPlay ? 'Play' : 'Open'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                      setEditingId(entry.id);
                      setShowEditModal(true);
                    }}
                      aria-label="Edit journal entry"
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(entry.id)}
                      aria-label="Delete journal entry"
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 transition-colors hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            }

            const monthIndicatorLabel = [
              moodKey ? JOURNAL_MOODS.find(item => item.value === moodKey)?.label : null,
              presentation?.hasMemory ? 'memory' : null,
              presentation?.hasMusic ? 'music' : null,
            ].filter(Boolean).join(', ');
            return (
              <Card
                key={entry.id}
                onClick={() =>
                  setViewModal(
                    {
                      entry,
                      data: presentation!,
                    }
                  )
                }
                role="button"
                tabIndex={0}
                data-mood={moodKey || undefined}
                aria-current={isToday ? 'date' : undefined}
                aria-selected={viewMode === 'month' ? isSelected : undefined}
                aria-label={`Open journal entry for ${day.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}${monthIndicatorLabel ? `, ${monthIndicatorLabel}` : ''}`}
                onKeyDown={event => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setViewModal({ entry, data: presentation! });
                  }
                }}
                className={`
                  journal-mood-surface
                  cursor-pointer

                  overflow-hidden

                  border

                  transition-all
                  duration-300

                  hover:border-primary/20

                  ${isToday ? 'ring-2 ring-white/80 shadow-lg shadow-white/20 border-white/80' : ''}

                  ${isSelected ? 'ring-2 ring-primary/60 border-primary/60' : ''}

                  ${!isToday && moodKey ? `border-l-2 ${moodAccent[moodKey]}` : ''}

                  h-24
                  p-0
                `}
              >

                <JournalMonthDayVisual
                  date={day}
                  entry={entry}
                  presentation={presentation!}
                  profileId={currentProfileId}
                />

              </Card>
            );
          }
          )}
          </>
        )}

      </div>
      </div>

      {/* =========================================
          VIEW MODAL
      ========================================= */}

      {viewModal && modalRoot && createPortal((

        <div
          data-caizen-overlay="open"
          className="
            journal-dialog-root fixed inset-0
            z-50

            flex
            items-center
            justify-center

            bg-black/40
            backdrop-blur-sm

            p-4
          "
          onClick={() =>
            setViewModal(
              null
            )
          }
        >

          <div
            ref={viewOverlayRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="journal-view-title"
            onClick={e =>
              e.stopPropagation()
            }
            className="
              journal-dialog-panel flex min-h-0 flex-col w-full
              max-w-2xl

              overflow-hidden

              rounded-[2rem]

              border border-border/50

              bg-card/95

              shadow-2xl

              backdrop-blur-xl
            "
          >

            <div
              className="
                flex
                items-center
                justify-between

                shrink-0 border-b border-border/50

                p-6
              "
            >

              <div>

                <h3
                  id="journal-view-title"
                  className="
                    text-2xl
                    font-bold
                  "
                >

                  {new Date(viewModal.entry.date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}

                </h3>

                {viewModal.data.mood ? (
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${moodChip[viewModal.data.mood]}`}>
                    {JOURNAL_MOODS.find(item => item.value === viewModal.data.mood)?.label}
                  </span>
                ) : null}

              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(viewModal.entry.id);
                    setShowEditModal(true);
                    setViewModal(null);
                  }}
                  className="
                    flex size-12 shrink-0 items-center justify-center
                    rounded-2xl
                    border border-border/50
                    bg-background/60
                    text-muted-foreground
                    transition-all
                    hover:text-foreground
                  "
                  aria-label="Edit journal entry"
                >
                  <Pencil className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  aria-label="Close journal entry"
                  onClick={() =>
            setViewModal(
              null
            )
          }
                  className="
                  grid size-12 shrink-0 place-items-center rounded-xl
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
                  text-muted-foreground

                  hover:text-foreground
                "
                >

                  <X className="h-5 w-5" />

                </button>
              </div>

            </div>

            <div
              className="
                min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain

                p-6
              "
            >

              <Section
                title="Reflection"
                content={
                  viewModal.data.content.mattered
                }
              />

              <Section
                title="What went well?"
                content={
                  viewModal.data.content.wentWell
                }
              />

              <Section
                title="What didn't go well?"
                content={
                  viewModal.data.content.didntGoWell
                }
              />

              <Section
                title="What will I do better tomorrow?"
                content={
                  viewModal.data.content.tomorrow
                }
              />

              {!viewModal.data.hasReflection ? (
                <p className="mt-5 rounded-xl border border-dashed border-border/50 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  No written reflection
                </p>
              ) : null}

              {viewModal.data.hasMemory ? (
                <section className="mt-6 border-t border-border/50 pt-5" aria-labelledby="journal-view-memory-title">
                  <h4 id="journal-view-memory-title" className="mb-3 text-sm font-semibold">Memory</h4>
                  {(() => {
                    const assetId = viewModal.entry.photoAssetIds?.find(id => typeof id === 'string' && id.trim())?.trim();
                    const imageUrl = typeof viewModal.entry.image === 'string'
                      ? normalizeExternalWebUrl(viewModal.entry.image.trim())
                      : null;
                    const preview = assetId ? { assetId } : imageUrl ? { imageUrl } : null;
                    return (
                      <button
                        type="button"
                        onClick={() => preview && setMemoryPreview(preview)}
                        disabled={!preview}
                        className="group w-full overflow-hidden rounded-2xl border border-border/50 bg-background/40 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
                        aria-label={preview ? 'Open memory photo' : 'Memory saved for this day'}
                      >
                        {assetId ? (
                          <MediaAssetImage
                            assetId={assetId}
                            profileId={currentProfileId}
                            alt="Journal memory"
                            className="aspect-video max-h-80 w-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
                          />
                        ) : imageUrl ? (
                          <img src={imageUrl} alt="Journal memory" className="aspect-video max-h-80 w-full object-cover transition-transform duration-300 group-hover:scale-[1.01]" loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="grid h-28 place-items-center"><ImageIcon className="h-6 w-6 text-primary" aria-hidden="true" /></span>
                        )}
                        <span className="block min-w-0 px-4 py-3">
                          <span className="block text-sm font-semibold">{preview ? 'Open memory photo' : 'Memory saved for this day.'}</span>
                          {preview ? <span className="mt-1 block text-xs text-muted-foreground">Tap to view the full image.</span> : null}
                        </span>
                      </button>
                    );
                  })()}
                </section>
              ) : null}

              {viewModal.data.hasMusic ? (
                <section className="mt-6 border-t border-border/50 pt-5" aria-labelledby="journal-view-music-title">
                  <h4 id="journal-view-music-title" className="mb-3 text-sm font-semibold">Music Today</h4>
                  <div className="space-y-2">
                    {viewModal.data.usableMusicLinks.map((link, index) => {
                      const safeLink = link;
                      const linkedItem = findLinkedMusicItem(link, musicItems);
                      const canPlay = Boolean(linkedItem && getMusicPlaybackCapabilities(linkedItem).canControlPlayback);

                      return (
                        <div key={index} className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 p-2">
                          {linkedItem?.image ? <img src={linkedItem.image} alt="" aria-hidden="true" className="h-9 w-9 rounded-lg object-cover" /> : <Music className="ml-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                          <div className="min-w-0 flex-1">
                            <OverflowTooltip text={linkedItem?.title || link}><p className="truncate text-sm font-semibold">{linkedItem?.title || link}</p></OverflowTooltip>
                            {linkedItem ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {linkedItem.artist || 'Unknown artist'} · {getMusicProviderLabel(linkedItem.provider)}
                              </p>
                            ) : null}
                          </div>
                          {canPlay && linkedItem ? (
                            <button type="button" onClick={() => playItems(linkedItem.id, [linkedItem])} className="rounded-lg border border-border/50 px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground" aria-label={`Play ${linkedItem.title}`}>Play</button>
                          ) : (
                            <button type="button" onClick={() => void openExternalLink(safeLink)} className="rounded-lg border border-border/50 px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground" aria-label={`Open music link ${index + 1}`}>Open</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

            </div>

          </div>

        </div>

      ), modalRoot)}

      {memoryPreview && modalRoot && createPortal((
        <div
          data-caizen-overlay="open"
          className="journal-dialog-root fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setMemoryPreview(null)}
        >
          <div
            ref={memoryOverlayRef}
            role="dialog"
            aria-modal="true"
            aria-label="Journal memory photo"
            onClick={event => event.stopPropagation()}
            className="journal-memory-dialog relative flex max-h-full max-w-full items-center justify-center rounded-2xl border border-border/50 bg-background/80 p-2 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setMemoryPreview(null)}
              className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-xl bg-background/85 text-muted-foreground shadow-lg hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close memory photo"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            {memoryPreview.assetId ? (
              <MediaAssetImage
                assetId={memoryPreview.assetId}
                profileId={currentProfileId}
                alt="Journal memory"
                variant="full"
                className="max-h-[88dvh] max-w-[90vw] rounded-xl object-contain"
              />
            ) : memoryPreview.imageUrl ? (
              <img src={memoryPreview.imageUrl} alt="Journal memory" className="max-h-[88dvh] max-w-[90vw] rounded-xl object-contain" />
            ) : null}
          </div>
        </div>
      ), modalRoot)}

      {/* =========================================
          MUSIC MODAL
      ========================================= */}

      {musicModal && modalRoot && createPortal((

        <div
          data-caizen-overlay="open"
          className="
            journal-dialog-root fixed inset-0
            z-50

            flex
            items-center
            justify-center

            bg-black/40
            backdrop-blur-sm

            p-4
          "
          onClick={() =>
            setMusicModal(
              null
            )
          }
        >

          <div
            ref={musicOverlayRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="journal-music-title"
            onClick={e =>
              e.stopPropagation()
            }
            className="
              journal-dialog-panel flex min-h-0 flex-col overflow-hidden w-full
              max-w-lg

              rounded-[2rem]

              border border-border/50

              bg-card/95

              p-6

              shadow-2xl

              backdrop-blur-xl
            "
          >

            <div
              className="
                shrink-0 flex
                items-center
                justify-between
              "
            >

              <h3
                id="journal-music-title"
                className="
                  text-xl
                  font-bold
                "
              >

                Music Today

              </h3>

              <button
                type="button"
                aria-label="Close Music Today"
                className="grid size-12 shrink-0 place-items-center rounded-xl text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() =>
            setMusicModal(
              null
            )
          }
              >

                <X className="h-5 w-5" />

              </button>

            </div>

            <div className="mt-6 min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain">

              {musicModal.map(
                (
                  link,
                  index
                ) => {
                  const safeLink = normalizeExternalWebUrl(link);
                  const linkedItem = findLinkedMusicItem(link, musicItems);
                  const canPlay = Boolean(linkedItem && getMusicPlaybackCapabilities(linkedItem).canControlPlayback);

                  return safeLink ? (
                    <div key={index} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/40 px-3 py-3 text-sm">
                      {linkedItem?.image ? (
                        <img src={linkedItem.image} alt="" aria-hidden="true" className="h-10 w-10 rounded-xl object-cover" />
                      ) : (
                        <Music className="ml-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <OverflowTooltip text={linkedItem?.title || link}><p className="truncate font-semibold">{linkedItem?.title || link}</p></OverflowTooltip>
                        {linkedItem ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {linkedItem.artist || 'Unknown artist'} · {getMusicProviderLabel(linkedItem.provider)}
                          </p>
                        ) : null}
                      </div>
                      {canPlay && linkedItem ? (
                        <button
                          type="button"
                          onClick={() => playItems(linkedItem.id, [linkedItem])}
                          className="flex h-10 shrink-0 items-center rounded-xl border border-border/50 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          aria-label={`Play ${linkedItem.title}`}
                        >
                          Play
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void openExternalLink(safeLink)}
                          className="flex h-10 shrink-0 items-center rounded-xl border border-border/50 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          aria-label={`Open music link ${index + 1}`}
                        >
                          Open
                        </button>
                      )}
                    </div>
                  ) : (
                    <p key={index} className="rounded-2xl border border-border/50 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
                      Saved music link {index + 1} is unavailable.
                    </p>
                  );
                }
              )}

            </div>

          </div>

        </div>

      ), modalRoot)}

      {/* =========================================
          EDIT
      ========================================= */}

      {editingId && (

        <JournalModal
            isOpen={showEditModal}
            onClose={closeJournalEditor}
            entryId={editingId}
          />

      )}

      {newEntryDate && (
        <JournalModal
            isOpen
            initialDate={newEntryDate}
            onClose={() => setNewEntryDate(null)}
          />
      )}

      {/* =========================================
          DELETE
      ========================================= */}

      <ConfirmDialog
          isOpen={deletingId !== null}
          title="Delete Journal"
          message="Are you sure?"
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous
          onConfirm={() => {
            if (deletingId) {
              deleteJournalEntry(deletingId);
            }
            setDeletingId(null);
          }}
          onCancel={() => setDeletingId(null)}
        />

      {/* =========================================
          ALREADY LOGGED
      ========================================= */}

      {alreadyLoggedModal && modalRoot && createPortal((

        <div
          data-caizen-overlay="open"
          className="journal-dialog-root fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <AndroidDismissibleBackdrop
            onClose={() => setAlreadyLoggedModal(false)}
            ariaLabel="Close already logged message"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          <div
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Already logged"
            className="
              journal-dialog-panel relative z-10 w-full overflow-y-auto overscroll-contain
              max-w-sm

              rounded-[2rem]

              border border-border/50

              bg-card/95

              p-6

              shadow-2xl
            "
          >

            <h3
              className="
                          text-lg
                          font-bold
                        "
            >

              Already Logged

            </h3>

            <p className="mt-2 text-sm text-muted-foreground">

              You already logged
              today.

            </p>

            <Button
              onClick={() =>
                setAlreadyLoggedModal(
                  false
                )
              }
              className="
                mt-5
                w-full
              "
            >

              Okay

            </Button>

          </div>

        </div>

      ), modalRoot)}

    </div>
  );
}

/* =========================================
   SECTION
========================================= */

function Section({
  title,
  content,
}) {
  if (!content) return null;

  return (
    <div className="mb-6">

      <h4
        className="
          mb-2

          text-sm
          font-semibold
        "
      >

        {title}

      </h4>

      <p
        className="
          whitespace-pre-wrap

          text-sm
          leading-relaxed
          text-muted-foreground
        "
      >

        {content}

      </p>

    </div>
  );
}


