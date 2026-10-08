'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import { formatLocalDateInput } from '@/lib/date-utils';
import healthResponsive from './health-responsive.module.css';

type HealthDayNavigatorProps = {
  date: string;
  dateLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onDateChange: (value: string) => void;
  className?: string;
};

export function HealthDayNavigator({
  date,
  dateLabel,
  onPrevious,
  onNext,
  onToday,
  onDateChange,
  className = '',
}: HealthDayNavigatorProps) {
  const today = formatLocalDateInput(new Date());
  const isToday = date === today;

  return (
    <div className={`${healthResponsive.dayNavigator} health-day-navigator grid w-full max-w-sm items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onPrevious}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border/60 bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="min-w-0">
        <AdaptiveDatePicker
          label="Health date"
          value={date}
          max={today}
          onChange={value => onDateChange(value && value <= today ? value : today)}
          className="h-11 w-full"
          clearable={false}
        />
        <span className="sr-only" aria-live="polite">Viewing {dateLabel}</span>
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={isToday}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border/60 bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>

      {!isToday ? (
        <button
          type="button"
          onClick={onToday}
          className="health-day-today-button col-span-full min-h-11 justify-self-start rounded-xl px-3 text-sm font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Today
        </button>
      ) : null}
    </div>
  );
}
