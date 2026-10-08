'use client';

import { useMemo, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCalendarGridNavigation } from '@/hooks/use-calendar-grid-navigation';
import { toLocalDateKey } from '@/lib/utils';

/**
 * One month grid, shared by Life Hub, Journal and Work Hub.
 *
 * Two independent layout defects motivated this component, both in the old
 * `.mobile-calendar-grid` markup:
 *
 *  1. The grid carried `min-width: min(620px, calc(100vw - 2rem))`, a
 *     viewport-relative width applied to a box already inside page padding, a
 *     card, and a negative-margin scroller. The grid was always wider than its
 *     container, and `overflow-x: auto` plus `.caizen-stage { overflow-x: clip }`
 *     swallowed the difference - so the 7th column (Saturday) was clipped off
 *     screen while document-level overflow checks still reported "no overflow".
 *
 *  2. `html[data-capacitor] .mobile-calendar-grid > * { aspect-ratio: 1 }`
 *     targeted the DIRECT children, which in Life Hub and Work Hub were the two
 *     `grid-cols-7` ROW WRAPPERS rather than the day cells. The ~30px weekday
 *     header row was therefore stretched into a full-width square, producing
 *     the large empty block above the dates.
 *
 * Here the weekday row and the day grid are SIBLINGS, both plain 7-column
 * grids with `minmax(0, 1fr)` tracks and no min-width. There is no selector
 * that can accidentally stretch a row wrapper, and the grid can never be wider
 * than its container.
 */

export type MonthDayMeta = {
  /** Up to three dots rendered under the date number. */
  dots?: Array<{
    key: string;
    tone?: 'primary' | 'warn' | 'danger' | 'muted' | 'office' | 'wfh' | 'travel' | 'holiday' | 'leave';
  }>;
  count?: number;
  state?: 'has-entry' | 'blocked' | 'holiday';
  /** Appended to the cell's accessible name. */
  label?: string;
  /** Independent edge marker so work status never consumes an event dot. */
  workStatus?: 'office' | 'work_home' | 'travel' | 'holiday' | 'leave';
  mood?: 'rough' | 'okay' | 'good';
};

export type MonthDayContentArgs = {
  dateValue: string;
  date: Date;
  outside: boolean;
  isToday: boolean;
  isSelected: boolean;
  meta?: MonthDayMeta;
};

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);

const addMonths = (value: Date, delta: number) =>
  new Date(value.getFullYear(), value.getMonth() + delta, 1);

export type MonthGridDay = {
  /** The exact calendar date for this cell - always a full local Date, never
   *  just a day-of-month number, so a leading/trailing cell from an adjacent
   *  month always carries its own real year/month/day. */
  date: Date;
  key: string;
  /** True when this cell belongs to the previous/next month (a leading or
   *  trailing day shown to fill out the grid), not the currently viewed one. */
  outside: boolean;
};

/**
 * Builds one month's grid of days, local-date-safe throughout (no UTC string
 * parsing). Exported (and unit-tested) so every leading/trailing day cell is
 * provably backed by its own real Date rather than one reconstructed from
 * the day number plus the currently displayed month/year.
 */
export function buildMonthGridDays(month: Date, weekStartsOn: 0 | 1 = 0): MonthGridDay[] {
  const first = startOfMonth(month);
  const leading = (first.getDay() - weekStartsOn + 7) % 7;
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - leading);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  // Five rows when the month fits, six when it does not; never a fixed 42
  // cells, which added an empty trailing week to most months.
  const cellCount = Math.ceil((leading + daysInMonth) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    return {
      date,
      key: toLocalDateKey(date),
      outside: date.getMonth() !== month.getMonth(),
    };
  });
}

export function AndroidMonthGrid({
  month,
  onMonthChange,
  selected,
  weekStartsOn = 0,
  onSelectDay,
  getDayMeta,
  renderDayContent,
  toolbarExtra,
  footer,
  compactOverviewGuidance = false,
}: {
  /** Any date inside the visible month. */
  month: Date;
  onMonthChange: (month: Date) => void;
  /** `yyyy-mm-dd` of the selected day. */
  selected?: string;
  weekStartsOn?: 0 | 1;
  onSelectDay: (dateValue: string, date: Date) => void;
  getDayMeta?: (dateValue: string, date: Date) => MonthDayMeta | undefined;
  renderDayContent?: (args: MonthDayContentArgs) => ReactNode;
  toolbarExtra?: ReactNode;
  footer?: ReactNode;
  compactOverviewGuidance?: boolean;
}) {
  const todayKey = toLocalDateKey(new Date());

  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const dayIndex = (index + weekStartsOn) % 7;
        return { initial: WEEKDAY_INITIALS[dayIndex], name: WEEKDAY_NAMES[dayIndex] };
      }),
    [weekStartsOn],
  );

  const days = useMemo(() => buildMonthGridDays(month, weekStartsOn), [month, weekStartsOn]);

  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const { getCellProps, changeMonthFromToolbar } = useCalendarGridNavigation({
    days: days.map(day => day.date),
    month,
    selectedKey: selected,
    weekStartsOn,
    onMonthChange,
  });
  const rows = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));

  return (
    <div className="cz-month">
      <div className="cz-month-toolbar">
        <button
          type="button"
          onClick={() => changeMonthFromToolbar(addMonths(month, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft aria-hidden size={18} />
        </button>
        <strong aria-live="polite">{monthLabel}</strong>
        <button
          type="button"
          onClick={() => changeMonthFromToolbar(addMonths(month, 1))}
          aria-label="Next month"
        >
          <ChevronRight aria-hidden size={18} />
        </button>
      </div>

      {toolbarExtra}

      <div className="cz-month-grid" role="grid" aria-label={monthLabel}>
        <div className="cz-month-weekdays cz-month-row" role="row">
          {weekdays.map((weekday, index) => (
            <span role="columnheader" aria-label={weekday.name} key={`${weekday.name}-${index}`}>
              {weekday.initial}
            </span>
          ))}
        </div>
        {rows.map((row, rowIndex) => (
          <div className="cz-month-row" role="row" key={`month-row-${rowIndex}`}>
            {row.map(({ date, key, outside }) => {
              const meta = getDayMeta?.(key, date);
              const isSelected = selected === key;
              const isToday = key === todayKey;
              const dots = meta?.dots?.slice(0, 3) ?? [];
              const cellProps = getCellProps(date);
              if (renderDayContent) {
                return (
                  <div
                    {...cellProps}
                    key={key}
                    role="gridcell"
                    data-outside={outside || undefined}
                    data-today={isToday || undefined}
                    data-selected={isSelected || undefined}
                    data-state={meta?.state}
                    data-work-status={meta?.workStatus}
                    data-mood={meta?.mood}
                    aria-current={isToday ? 'date' : undefined}
                    aria-selected={isSelected}
                    aria-label={`${date.toLocaleDateString(undefined, { dateStyle: 'full' })}${
                      meta?.label ? `, ${meta.label}` : ''
                    }`}
                    onClick={() => onSelectDay(key, date)}
                    onKeyDown={(event) => {
                      cellProps.onKeyDown(event);
                      if (event.defaultPrevented || event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectDay(key, date);
                      }
                    }}
                  >
                    {renderDayContent({
                      dateValue: key,
                      date,
                      outside,
                      isToday,
                      isSelected,
                      meta,
                    })}
                  </div>
                );
              }
              return (
                <button
                  {...cellProps}
                  key={key}
                  type="button"
                  role="gridcell"
                  data-outside={outside || undefined}
                  data-today={isToday || undefined}
                  data-selected={isSelected || undefined}
                  data-state={meta?.state}
                  data-work-status={meta?.workStatus}
                  data-mood={meta?.mood}
                  aria-current={isToday ? 'date' : undefined}
                  aria-selected={isSelected}
                  aria-label={`${date.toLocaleDateString(undefined, { dateStyle: 'full' })}${
                    meta?.label ? `, ${meta.label}` : ''
                  }`}
                  onClick={() => onSelectDay(key, date)}
                >
                  <span className="cz-month-daynum">{date.getDate()}</span>
                  {dots.length > 0 && (
                    <span className="cz-month-dots" aria-hidden="true">
                      {dots.map((dot) => (
                        <i key={dot.key} data-tone={dot.tone ?? 'primary'} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {compactOverviewGuidance ? (
        <p className="cz-month-overview-guidance">Select a date to open the full Day Planner.</p>
      ) : null}

      {footer}
    </div>
  );
}

export default AndroidMonthGrid;
