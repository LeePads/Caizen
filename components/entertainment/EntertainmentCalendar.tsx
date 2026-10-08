'use client';

import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayButton } from 'react-day-picker';
import type { MediaItem } from '@/lib/types';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import AndroidMonthGrid from '@/components/native/AndroidMonthGrid';
import {
  deriveEntertainmentCalendarEvents,
  type EntertainmentCalendarEvent,
} from '@/lib/entertainment/derived';
import {
  formatCalendarEventMeta,
  getCalendarCellPreviews,
} from '@/lib/entertainment/presentation';
import { addLocalDays, parseLocalDateKey, startOfWeek, toLocalDateKey } from '@/lib/lifehub/date-utils';
import { cn } from '@/lib/utils';
import { ResilientImage } from '@/components/media/ResilientImage';

type WeekStartsOn = 0 | 1;
type CalendarView = 'week' | 'month';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function readWeekStartsOn(profileId: string): WeekStartsOn {
  if (typeof window === 'undefined') return 0;
  try {
    const preferences = JSON.parse(
      window.localStorage.getItem(`lifehub-preferences:${profileId}`) || '{}',
    ) as { weekStartsOn?: unknown };
    return preferences.weekStartsOn === 1 ? 1 : 0;
  } catch {
    return 0;
  }
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function formatWeekRange(start: Date, end: Date) {
  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.toLocaleDateString(undefined, { month: 'short' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatDayHeading(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function isSameMonth(date: Date, month: Date) {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

type ReleaseDayButtonProps = ComponentProps<typeof DayButton> & {
  releaseEvents: EntertainmentCalendarEvent[];
};

function ReleaseDayButton({
  releaseEvents,
  children,
  className,
  modifiers,
  ...props
}: ReleaseDayButtonProps) {
  const releaseCountLabel = releaseEvents.length
    ? `${releaseEvents.length} ${releaseEvents.length === 1 ? 'release' : 'releases'}`
    : '';
  const releaseDetailsLabel = releaseEvents
    .map(event => `${event.item.title}, ${formatCalendarEventMeta(event)}`)
    .join('; ');
  const dayAriaLabel = releaseCountLabel
    ? `${props['aria-label'] || 'Calendar day'}, ${releaseCountLabel}: ${releaseDetailsLabel}. Select to view releases.`
    : props['aria-label'];

  return (
    <CalendarDayButton
      {...props}
      modifiers={modifiers}
      aria-label={dayAriaLabel}
      aria-current={modifiers?.today ? 'date' : undefined}
      data-today={modifiers?.today ? 'true' : undefined}
      data-release-day={releaseEvents.length > 0 ? 'true' : undefined}
      data-release-count={releaseEvents.length || undefined}
      className={cn(className, 'caizen-entertainment-month-day')}
    >
      <span className="caizen-entertainment-month-day__number">{children}</span>
      {releaseEvents.length > 0 ? (
        <span className="caizen-entertainment-month-day__markers" aria-hidden="true">
          <span className="caizen-entertainment-month-day__marker" />
          {releaseEvents.length > 1 ? <span className="caizen-entertainment-month-day__count">{releaseEvents.length}</span> : null}
        </span>
      ) : null}
    </CalendarDayButton>
  );
}

function ReleaseRow({
  event,
  onOpen,
}: {
  event: EntertainmentCalendarEvent;
  onOpen: (item: MediaItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event.item)}
      className="caizen-entertainment-release-row"
      aria-label={`Open ${event.item.title}, ${formatCalendarEventMeta(event)}`}
    >
      <span className="caizen-entertainment-release-row__cover" aria-hidden="true">
        <ResilientImage src={event.item.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<span>—</span>} />
      </span>
      <span className="caizen-entertainment-release-row__body">
        <span className="caizen-entertainment-release-row__title">{event.item.title}</span>
        <span className="caizen-entertainment-release-row__meta">{formatCalendarEventMeta(event)}</span>
      </span>
    </button>
  );
}

function DayPreviewList({
  date,
  events,
  selected,
  onSelect,
  onOpen,
  onMore,
}: {
  date: Date;
  events: EntertainmentCalendarEvent[];
  selected: boolean;
  onSelect: (date: Date) => void;
  onOpen: (item: MediaItem) => void;
  onMore: (date: Date) => void;
}) {
  const previews = getCalendarCellPreviews(events, 3);
  const today = toLocalDateKey(date) === toLocalDateKey(new Date());

  return (
    <section className={cn(
      'caizen-entertainment-week-day',
      events.length > 0 && 'has-releases',
      selected && 'is-selected',
      today && 'is-today',
    )}>
      <button
        type="button"
        className="caizen-entertainment-week-day__heading"
        onClick={() => onSelect(date)}
        aria-pressed={selected}
        aria-current={today ? 'date' : undefined}
        aria-label={`${formatDayHeading(date)}${events.length ? `, ${events.length} ${events.length === 1 ? 'release' : 'releases'}` : ', no releases'}`}
      >
        <span>{WEEKDAY_SHORT[date.getDay()]}</span>
        <strong>{date.getDate()}</strong>
      </button>
      <div className="caizen-entertainment-week-day__events">
        {previews.visible.map(event => (
          <button
            type="button"
            key={event.id}
            className="caizen-entertainment-week-release"
            onClick={() => onOpen(event.item)}
            aria-label={`Open ${event.item.title}, ${formatCalendarEventMeta(event)}`}
          >
            <span className="caizen-entertainment-week-release__cover" aria-hidden="true">
              <ResilientImage src={event.item.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" fallback={<span>—</span>} />
            </span>
            <span className="caizen-entertainment-week-release__body">
              <span className="caizen-entertainment-week-release__title">{event.item.title}</span>
              <span className="caizen-entertainment-week-release__meta">{formatCalendarEventMeta(event)}</span>
            </span>
          </button>
        ))}
        {previews.remaining > 0 ? (
          <button type="button" className="caizen-entertainment-week-more" onClick={() => onMore(date)} aria-label={`Show ${previews.remaining} more releases for ${formatDayHeading(date)}`}>
            +{previews.remaining} more
          </button>
        ) : null}
        {!events.length ? <span className="caizen-entertainment-week-day__empty">No releases</span> : null}
      </div>
    </section>
  );
}

function SelectedDayAgenda({
  date,
  events,
  weekHasEvents,
  monthHasEvents,
  agendaId,
  onOpen,
}: {
  date: Date;
  events: EntertainmentCalendarEvent[];
  weekHasEvents: boolean;
  monthHasEvents?: boolean;
  agendaId: string;
  onOpen: (item: MediaItem) => void;
}) {
  const emptyMonth = monthHasEvents === false;
  const emptyDay = !emptyMonth && !events.length;

  return (
    <aside id={agendaId} tabIndex={-1} className="caizen-entertainment-selected-agenda" aria-label="Selected day releases">
      <header className="caizen-entertainment-selected-agenda__header">
        <div>
          <h3>{formatDayHeading(date)}</h3>
        </div>
        {events.length ? (
          <span>{events.length} {events.length === 1 ? 'release' : 'releases'}</span>
        ) : null}
      </header>

      {emptyMonth ? (
        <div className="caizen-entertainment-calendar-empty">
          <p>No known releases this month.</p>
        </div>
      ) : emptyDay ? (
        <div className="caizen-entertainment-calendar-empty">
          <p>Nothing scheduled for this day.</p>
          <span>Choose a highlighted date to see releases.</span>
        </div>
      ) : (
        <div className={cn('caizen-entertainment-selected-agenda__list', !weekHasEvents && 'is-empty-week')}>
          {events.map(event => <ReleaseRow key={event.id} event={event} onOpen={onOpen} />)}
        </div>
      )}
    </aside>
  );
}

export default function EntertainmentCalendar({
  items,
  profileId,
  androidPresentation = false,
  onOpen,
}: {
  items: MediaItem[];
  profileId: string;
  androidPresentation?: boolean;
  onOpen: (item: MediaItem) => void;
}) {
  const [view, setView] = useState<CalendarView>('week');
  const [selectedKey, setSelectedKey] = useState(() => toLocalDateKey(new Date()));
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>(0);
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [focusAgenda, setFocusAgenda] = useState(false);

  useEffect(() => {
    const refreshPreferences = () => setWeekStartsOn(readWeekStartsOn(profileId));
    refreshPreferences();
    window.addEventListener('life-manager:lifehub-preferences-changed', refreshPreferences);
    return () => window.removeEventListener('life-manager:lifehub-preferences-changed', refreshPreferences);
  }, [profileId]);

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
  }, []);

  const events = useMemo(() => deriveEntertainmentCalendarEvents(items), [items]);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, EntertainmentCalendarEvent[]>();
    events.forEach(event => {
      const current = grouped.get(event.dateKey) || [];
      current.push(event);
      grouped.set(event.dateKey, current);
    });
    return grouped;
  }, [events]);

  const selectedDate = parseLocalDateKey(selectedKey) || new Date();
  const weekStart = startOfWeek(selectedDate, weekStartsOn);
  const weekDays = Array.from({ length: 7 }, (_, index) => addLocalDays(weekStart, index));
  const weekEvents = weekDays.flatMap(day => eventsByDate.get(toLocalDateKey(day)) || []);
  const monthEvents = events.filter(event => isSameMonth(event.date, month));
  const selectedEvents = eventsByDate.get(selectedKey) || [];
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const rangeLabel = view === 'week' ? formatWeekRange(weekStart, weekDays[6]) : monthLabel;
  const agendaId = `entertainment-calendar-agenda-${profileId}`;

  useEffect(() => {
    if (!focusAgenda) return;
    document.getElementById(agendaId)?.focus({ preventScroll: true });
    setFocusAgenda(false);
  }, [agendaId, focusAgenda]);

  const selectDate = (date: Date, switchToWeek = false) => {
    setSelectedKey(toLocalDateKey(date));
    setMonth(startOfMonth(date));
    if (switchToWeek) setView('week');
  };

  const movePeriod = (delta: number) => {
    if (view === 'week') {
      selectDate(addLocalDays(selectedDate, delta * 7));
    } else {
      setMonth(current => shiftMonth(current, delta));
    }
  };

  const dayMeta = (dateKey: string) => {
    const count = eventsByDate.get(dateKey)?.length || 0;
    return count > 0
      ? {
          count,
          dots: [{ key: 'release', tone: 'primary' as const }],
          label: `${count} ${count === 1 ? 'release' : 'releases'}`,
        }
      : undefined;
  };

  const handleMonthDateSelection = (date: Date) => {
    const key = toLocalDateKey(date);
    setSelectedKey(key);
    setMonth(startOfMonth(date));
  };

  return (
    <section
      className="caizen-entertainment-calendar rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5"
      aria-label="Entertainment release calendar"
    >
      <header className="caizen-entertainment-calendar__header">
        <div className="caizen-entertainment-calendar__heading">
          <div className="caizen-entertainment-calendar__title-row">
            <button type="button" onClick={() => movePeriod(-1)} className="caizen-entertainment-calendar__nav-button" aria-label={view === 'week' ? 'Previous week' : 'Previous month'}>
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <h2 aria-live="polite">{rangeLabel}</h2>
            <button type="button" onClick={() => movePeriod(1)} className="caizen-entertainment-calendar__nav-button" aria-label={view === 'week' ? 'Next week' : 'Next month'}>
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
          <p>Upcoming and recent releases from your library.</p>
        </div>
        <div className="caizen-entertainment-calendar__utilities">
          {timeZone ? <span>Local time · {timeZone}</span> : null}
          <div className="caizen-entertainment-calendar__view-toggle" role="group" aria-label="Calendar view">
            <button type="button" onClick={() => setView('week')} aria-pressed={view === 'week'}>Week</button>
            <button type="button" onClick={() => setView('month')} aria-pressed={view === 'month'}>Month</button>
          </div>
          <button type="button" onClick={() => selectDate(new Date())} className="caizen-entertainment-calendar__today">Today</button>
        </div>
      </header>

      <p className="caizen-entertainment-calendar__supporting-copy">
        {view === 'week' ? 'Your release schedule for the week.' : 'A quick look at release days.'}
      </p>

      {view === 'week' ? (
        <div className="caizen-entertainment-calendar__week-body">
          <div className="caizen-entertainment-week-grid" aria-label={`Releases for ${rangeLabel}`}>
            {weekDays.map(day => (
              <DayPreviewList
                key={toLocalDateKey(day)}
                date={day}
                events={eventsByDate.get(toLocalDateKey(day)) || []}
                selected={selectedKey === toLocalDateKey(day)}
                onSelect={selectDate}
                onOpen={onOpen}
                onMore={date => {
                  selectDate(date);
                  setFocusAgenda(true);
                }}
              />
            ))}
          </div>
          <SelectedDayAgenda
            agendaId={agendaId}
            date={selectedDate}
            events={selectedEvents}
            weekHasEvents={weekEvents.length > 0}
            onOpen={onOpen}
          />
        </div>
      ) : (
        <div className="caizen-entertainment-calendar__month-body">
          {androidPresentation ? (
            <div className="caizen-entertainment-calendar__android">
              <AndroidMonthGrid
                month={month}
                onMonthChange={nextMonth => setMonth(startOfMonth(nextMonth))}
                selected={selectedKey}
                weekStartsOn={weekStartsOn}
                onSelectDay={(key, date) => {
                  setSelectedKey(key);
                  setMonth(startOfMonth(date));
                }}
                getDayMeta={dayMeta}
              />
            </div>
          ) : (
            <div className="caizen-entertainment-calendar__web">
              <Calendar
                mode="single"
                month={month}
                onMonthChange={nextMonth => setMonth(startOfMonth(nextMonth))}
                selected={selectedDate}
                onSelect={date => {
                  if (!date) return;
                  handleMonthDateSelection(date);
                }}
                onDayClick={handleMonthDateSelection}
                weekStartsOn={weekStartsOn}
                showOutsideDays={false}
                hideNavigation
                fixedWeeks
                className="caizen-entertainment-calendar-grid !w-full !max-w-none"
                classNames={{
                  root: 'caizen-entertainment-calendar-grid !w-full',
                  month_caption: 'sr-only',
                  caption_label: 'sr-only',
                }}
                components={{
                  DayButton: props => (
                    <ReleaseDayButton
                      {...props}
                      releaseEvents={eventsByDate.get(toLocalDateKey(props.day.date)) || []}
                    />
                  ),
                }}
                aria-label={`${monthLabel} release calendar`}
              />
            </div>
          )}
          <SelectedDayAgenda
            agendaId={agendaId}
            date={selectedDate}
            events={selectedEvents}
            weekHasEvents={weekEvents.length > 0}
            monthHasEvents={monthEvents.length > 0}
            onOpen={onOpen}
          />
        </div>
      )}
    </section>
  );
}
