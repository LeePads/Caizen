'use client';

import {
  CalendarDays,
  Check,
  ExternalLink,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';

import { CaizenFormDialog } from '@/components/ui/section-kit';
import {
  isActionableCalendarDate,
  type LifeHubCalendarEvent,
} from '@/lib/lifehub/calendar-events';
import { formatDate } from '@/lib/lifehub/date-utils';
import { formatPHP } from '@/lib/currency';
import { formatLabel } from '@/lib/utils';
import {
  CALENDAR_WORK_STATUSES,
  type CalendarWorkStatus,
} from '@/lib/calendar-work-status';

type Props = {
  isOpen: boolean;
  date: Date;
  events: LifeHubCalendarEvent[];
  selectedWorkStatus?: CalendarWorkStatus | null;
  showWorkStatuses?: boolean;
  onSetWorkStatus: (status: CalendarWorkStatus | null) => void;
  onAddEvent: () => void;
  onAddTask: () => void;
  onEditEvent: (event: LifeHubCalendarEvent) => void;
  onResolveEvent: (event: LifeHubCalendarEvent) => void;
  onReopenEvent: (event: LifeHubCalendarEvent) => void;
  onCompleteTask: (event: LifeHubCalendarEvent) => void;
  onDeleteEvent: (event: LifeHubCalendarEvent) => void;
  onOpenSource: (event: LifeHubCalendarEvent) => void;
  onClose: () => void;
};


export default function LifeHubDayPlannerModal({
  isOpen,
  date,
  events,
  selectedWorkStatus,
  showWorkStatuses = true,
  onSetWorkStatus,
  onAddEvent,
  onAddTask,
  onEditEvent,
  onResolveEvent,
  onReopenEvent,
  onCompleteTask,
  onDeleteEvent,
  onOpenSource,
  onClose,
}: Props) {
  if (!isOpen) return null;

  return (
    <CaizenFormDialog
      eyebrow="Day planner"
      title={formatDate(date)}
      onClose={onClose}
    >
      <div className="grid gap-5">
        <p className="-mt-3 text-sm text-muted-foreground">
          {events.length} item{events.length === 1 ? '' : 's'} on this day
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onAddEvent}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground"
          >
            <CalendarDays className="h-4 w-4" /> Add Event
          </button>
          <button
            type="button"
            onClick={onAddTask}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-4 text-sm font-black hover:border-border hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Add Task
          </button>
        </div>

        {showWorkStatuses ? (
          <section className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black">Work status</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Optional calendar context for this day.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                Object.entries(CALENDAR_WORK_STATUSES) as Array<
                  [
                    CalendarWorkStatus,
                    (typeof CALENDAR_WORK_STATUSES)[CalendarWorkStatus],
                  ]
                >
              ).map(([status, meta]) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onSetWorkStatus(selectedWorkStatus === status ? null : status)}
                  aria-pressed={selectedWorkStatus === status}
                  data-work-status={status}
                  data-selected={selectedWorkStatus === status || undefined}
                  className="lifehub-work-status-option min-h-10 rounded-xl border px-2 text-xs font-black transition-colors"
                >
                  {meta.shortLabel}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          {events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              Nothing planned for this day.
            </div>
          ) : (
            events.map(event => {
              const historicalVirtualDate =
                event.source === 'date' &&
                event.section === 'history' &&
                event.virtual;
              const editableDate =
                event.source === 'date' && !historicalVirtualDate;
              const actionableDate = isActionableCalendarDate(event);
              const taskDeadline = event.source === 'task' && event.type === 'task deadline';

              return (
              <article
                key={`${event.source}-${event.id}`}
                className="rounded-2xl border border-border/60 bg-card/60 p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary">
                      {formatLabel(event.type)}
                    </span>
                    {event.status === 'completed' ? (
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-500">
                        {actionableDate ? 'Resolved' : 'Completed'}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-2 break-words font-black">{event.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(event.date)}{event.hasScheduledTime ? ` · ${event.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
                  {event.projectName ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.projectName}
                    </p>
                  ) : null}
                  {event.amount != null ? (
                    <p className="mt-2 text-sm font-black text-primary">
                      {formatPHP(Number(event.amount))}
                    </p>
                  ) : null}
                  {event.notes ? (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {event.notes}
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {actionableDate && event.status !== 'completed' ? (
                    <button
                      type="button"
                      onClick={() => onResolveEvent(event)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-500/10 px-3 text-xs font-black text-emerald-600 dark:text-emerald-300"
                    >
                      <Check className="h-4 w-4" /> Mark Resolved
                    </button>
                  ) : null}

                  {actionableDate && event.status === 'completed' ? (
                    <button
                      type="button"
                      onClick={() => onReopenEvent(event)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-4 w-4" /> Reopen
                    </button>
                  ) : null}

                  {taskDeadline ? (
                    <button
                      type="button"
                      onClick={() => onCompleteTask(event)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-500/10 px-3 text-xs font-black text-emerald-600 dark:text-emerald-300"
                    >
                      <Check className="h-4 w-4" /> Complete
                    </button>
                  ) : null}

                  {editableDate ? (
                    <button
                      type="button"
                      onClick={() => onEditEvent(event)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenSource(event)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" /> {event.source === 'streak' ? 'Manage in Health' : 'Open Source'}
                    </button>
                  )}

                  {editableDate || event.source === 'task' || Boolean(event.streakTimelineEntry) ? (
                    <button
                      type="button"
                      onClick={() => onDeleteEvent(event)}
                      className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-500/25 px-3 text-xs font-black text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  ) : null}
                </div>
              </article>
              );
            })
          )}
        </section>
      </div>
    </CaizenFormDialog>
  );
}
