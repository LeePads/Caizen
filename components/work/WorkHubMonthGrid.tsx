'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { AndroidMonthGrid } from '@/components/native/AndroidMonthGrid';
import { toLocalDateKey } from '@/lib/utils';
import type { ImportantDateItem, WorkItem } from '@/lib/types';

export type WorkCalendarEntry = {
  id: string;
  title: string;
  type: string;
  date: Date;
  endDate?: Date | null;
  notes?: string;
  source: 'event' | 'task' | 'resource';
  item: ImportantDateItem | WorkItem;
};

type WorkHubMonthGridProps = {
  androidPresentation: boolean;
  month: Date;
  onMonth: (value: Date) => void;
  selectedDate: Date;
  onSelectedDate: (value: Date) => void;
  entries: WorkCalendarEntry[];
  dayStart: (value: Date | string) => Date;
  sameDay: (a: Date | string, b: Date | string) => boolean;
  tone: (type: string) => string;
};

export function WorkHubMonthGrid({
  androidPresentation,
  month,
  onMonth,
  selectedDate,
  onSelectedDate,
  entries,
  dayStart,
  sameDay,
  tone,
}: WorkHubMonthGridProps) {
  if (androidPresentation) {
    return (
      <AndroidMonthGrid
        month={month}
        onMonthChange={onMonth}
        selected={toLocalDateKey(selectedDate)}
        onSelectDay={(_key, date) => onSelectedDate(date)}
        getDayMeta={(_key, date) => {
          const dayEntries = entries.filter(entry => {
            const start = dayStart(entry.date);
            const end = entry.endDate
              ? dayStart(entry.endDate)
              : start;
            const cursor = dayStart(date);
            return cursor >= start && cursor <= end;
          });
          if (!dayEntries.length) return undefined;

          return {
            dots: dayEntries.slice(0, 3).map((entry, index) => ({
              key: `${entry.id}-${index}`,
              tone:
                entry.type === 'work_home'
                  ? 'wfh'
                  : entry.type === 'office'
                    ? 'office'
                    : entry.type === 'holiday'
                      ? 'holiday'
                      : entry.type === 'leave'
                        ? 'leave'
                        : entry.type === 'travel'
                          ? 'travel'
                          : entry.type === 'deadline'
                            ? 'danger'
                            : 'primary',
            })),
            count: dayEntries.length,
            state: 'has-entry',
            label: `${dayEntries.length} scheduled item${
              dayEntries.length === 1 ? '' : 's'
            }`,
          };
        }}
      />
    );
  }

  const first = new Date(
    month.getFullYear(),
    month.getMonth(),
    1,
  );
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const focusDate = days.some(date => sameDay(date, selectedDate)) ? selectedDate : first;

  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() =>
            onMonth(
              new Date(
                month.getFullYear(),
                month.getMonth() - 1,
                1,
              ),
            )
          }
          className="inline-flex size-11 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="min-w-0 text-center font-semibold [overflow-wrap:anywhere]">
          {month.toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </h3>
        <button
          type="button"
          onClick={() =>
            onMonth(
              new Date(
                month.getFullYear(),
                month.getMonth() + 1,
                1,
              ),
            )
          }
          className="inline-flex size-11 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-caption font-semibold text-muted-foreground">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="py-2">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Calendar dates. Use arrow keys to move by day or week.">
        {days.map(date => {
          const inMonth = date.getMonth() === month.getMonth();
          const selected = sameDay(date, selectedDate);
          const dayEntries = entries.filter(entry => {
            const entryStart = dayStart(entry.date);
            const entryEnd = entry.endDate
              ? dayStart(entry.endDate)
              : entryStart;
            const cursor = dayStart(date);
            return cursor >= entryStart && cursor <= entryEnd;
          });

          return (
            <button
              key={date.toISOString()}
              type="button"
              data-work-calendar-date={toLocalDateKey(date)}
              tabIndex={sameDay(date, focusDate) ? 0 : -1}
              onClick={() => onSelectedDate(date)}
              onKeyDown={event => {
                if (event.altKey || event.ctrlKey || event.metaKey) return;
                const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -date.getDay(), End: 6 - date.getDay() };
                if (!(event.key in offsets)) return;
                event.preventDefault();
                const next = new Date(date);
                next.setDate(next.getDate() + offsets[event.key]);
                const container = event.currentTarget.parentElement;
                if (next.getMonth() !== month.getMonth() || next.getFullYear() !== month.getFullYear()) onMonth(new Date(next.getFullYear(), next.getMonth(), 1));
                onSelectedDate(next);
                window.requestAnimationFrame(() => container?.querySelector<HTMLButtonElement>(`[data-work-calendar-date="${toLocalDateKey(next)}"]`)?.focus({ preventScroll: true }));
              }}
              className={`flex min-h-14 min-w-0 flex-col rounded-lg border p-1 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @min-[28rem]/workspace:min-h-20 @min-[28rem]/workspace:rounded-xl @min-[28rem]/workspace:p-2 ${
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent hover:bg-muted/50'
              } ${inMonth ? '' : 'opacity-45'}`}
              aria-label={`${date.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}${dayEntries.length ? `, ${dayEntries.length} scheduled item${dayEntries.length === 1 ? '' : 's'}` : ', no scheduled items'}`}
              aria-pressed={selected}
              aria-current={sameDay(date, new Date()) ? 'date' : undefined}
            >
              <span className="text-xs font-semibold">{date.getDate()}</span>
              <span className="mt-2 flex flex-wrap gap-1">
                {dayEntries.slice(0, 3).map(entry => (
                  <i
                    key={entry.id}
                    className={`h-1.5 w-1.5 rounded-full ${tone(entry.type)}`}
                  />
                ))}
              </span>
              {dayEntries.length > 3 && (
                <span className="mt-1 block text-caption font-bold text-muted-foreground">
                  +{dayEntries.length - 3}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
