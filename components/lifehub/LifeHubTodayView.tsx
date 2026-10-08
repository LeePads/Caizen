'use client';

import type { ReactNode } from 'react';
import { Check, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { LifeHubTodaySummary } from '@/lib/lifehub/today-summary';
import { formatRelativeDate } from '@/lib/lifehub/date-utils';
import type { RoutineAttentionSummary } from '@/lib/lifehub/routine-schedule';
import type { LifeHubCalendarEvent } from '@/lib/lifehub/calendar-events';
import { formatLabel } from '@/lib/utils';
import type { DailyChecklistItem, ProductivityItem } from '@/lib/types';

export type TodayFocusPin = {
  dateKey: string;
  kind: 'task' | 'routine';
  recordId: string;
};

type Props = {
  summary: LifeHubTodaySummary;
  focusTitle?: string;
  focusDescription?: string;
  focusKind?: TodayFocusPin['kind'];
  focusIsPinned: boolean;
  focusPin: TodayFocusPin | null;
  dueTasks: ProductivityItem[];
  overdueTasks: ProductivityItem[];
  pendingRoutines: DailyChecklistItem[];
  skippedRoutines: DailyChecklistItem[];
  noDeadlineTaskCount: number;
  attention: RoutineAttentionSummary;
  estimatedMinutes: number;
  estimatedTaskCount: number;
  upcomingEvents: LifeHubCalendarEvent[];
  renderTaskRow: (item: ProductivityItem, pinned: boolean) => ReactNode;
  renderRoutineRow: (item: DailyChecklistItem, pinned: boolean) => ReactNode;
  onCompleteFocus: () => void;
  onOpenFocus: () => void;
  onToggleFocusPin: () => void;
  onAddTask: () => void;
  onOpenTasks: () => void;
  onOpenRoutines: () => void;
  onOpenCalendar: () => void;
  onOpenEvent: (event: LifeHubCalendarEvent) => void;
};

function SectionHeading({ title, subtitle, action }: { title: string; subtitle: string; action: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-black">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed border-border/60 p-3 text-center text-sm text-muted-foreground">{children}</p>;
}

export default function LifeHubTodayView({
  summary,
  focusTitle,
  focusDescription,
  focusKind,
  focusIsPinned,
  focusPin,
  dueTasks,
  overdueTasks,
  pendingRoutines,
  skippedRoutines,
  noDeadlineTaskCount,
  attention,
  estimatedMinutes,
  estimatedTaskCount,
  upcomingEvents,
  renderTaskRow,
  renderRoutineRow,
  onCompleteFocus,
  onOpenFocus,
  onToggleFocusPin,
  onAddTask,
  onOpenTasks,
  onOpenRoutines,
  onOpenCalendar,
  onOpenEvent,
}: Props) {
  const isPinned = (kind: TodayFocusPin['kind'], id: string) =>
    focusPin?.dateKey === summary.dateKey && focusPin.kind === kind && focusPin.recordId === id;

  return (
    <div className="space-y-5" aria-label="Today plan">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <section className="section-surface overflow-hidden p-4 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Next priority</p>
          <h2 className="mt-1 text-xl font-black sm:text-2xl">{focusTitle || 'Nothing urgent right now'}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {focusDescription || 'Add a task or routine when something needs your attention.'}
          </p>
          {focusKind ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" onClick={onCompleteFocus} className="rounded-xl">
                <Check className="mr-2 h-4 w-4" /> {focusKind === 'task' ? 'Complete' : 'Complete for today'}
              </Button>
              <Button type="button" variant="outline" onClick={onOpenFocus} className="rounded-xl">Open Details</Button>
              <Button type="button" variant="ghost" onClick={onToggleFocusPin} className="min-h-11 rounded-xl" aria-pressed={focusIsPinned}>
                {focusIsPinned ? 'Unpin for today' : 'Pin for today'}
              </Button>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button type="button" onClick={onAddTask} className="rounded-xl"><Plus className="mr-2 h-4 w-4" /> Add a task</Button>
              <span className="text-xs text-muted-foreground">Tasks, routines, and dates appear here as you add them.</span>
            </div>
          )}
        </section>

        <section className="section-surface p-4 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Today progress</p>
          {summary.plannedCount ? (
            <>
              <h2 className="mt-1 text-2xl font-black">{summary.completedCount}/{summary.plannedCount}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Planned tasks and routines completed</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Today planned outcomes" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.progressRate ?? 0}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${summary.progressRate ?? 0}%` }} />
              </div>
            </>
          ) : <p className="mt-2 text-sm font-semibold text-muted-foreground">No planned outcomes today.</p>}
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-background/45 p-2.5">
              <p className="text-xs font-bold text-muted-foreground">Still due</p>
              <p className="mt-1 text-lg font-black tabular-nums">{dueTasks.length + pendingRoutines.length}</p>
            </div>
            <div className="rounded-xl bg-background/45 p-2.5">
              <p className="text-xs font-bold text-muted-foreground">At risk</p>
              <p className="mt-1 text-lg font-black tabular-nums">{attention.atRiskCount}</p>
            </div>
          </div>
          {skippedRoutines.length ? <p className="mt-3 text-xs text-muted-foreground">{skippedRoutines.length} routine{skippedRoutines.length === 1 ? '' : 's'} skipped · kept separate from progress</p> : null}
          {estimatedMinutes > 0 ? <p className="mt-2 text-xs text-muted-foreground">{estimatedMinutes} estimated minutes across {estimatedTaskCount} task{estimatedTaskCount === 1 ? '' : 's'}</p> : null}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="section-surface p-4 sm:p-5">
          <SectionHeading title="Overdue" subtitle="Open tasks from earlier dates." action={<button type="button" onClick={onOpenTasks} className="min-h-11 text-xs font-black text-primary">Open Tasks</button>} />
          <div className="space-y-2">
            {overdueTasks.length ? overdueTasks.slice(0, 3).map(item => renderTaskRow(item, isPinned('task', item.id))) : <EmptyState>No overdue tasks.</EmptyState>}
          </div>
          {noDeadlineTaskCount ? <button type="button" onClick={onOpenTasks} className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-border/60 px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground">{noDeadlineTaskCount} open task{noDeadlineTaskCount === 1 ? '' : 's'} without a deadline</button> : null}
        </section>

        <section className="section-surface p-4 sm:p-5">
          <SectionHeading title="Due today" subtitle="Tasks planned for this date." action={<button type="button" onClick={onOpenTasks} className="min-h-11 text-xs font-black text-primary">Open Tasks</button>} />
          <div className="space-y-2">
            {dueTasks.length ? dueTasks.slice(0, 3).map(item => renderTaskRow(item, isPinned('task', item.id))) : <EmptyState>No open tasks due today.</EmptyState>}
          </div>
        </section>

        <section className="section-surface p-4 sm:p-5">
          <SectionHeading title="Routine queue" subtitle="Pending routines for today." action={<button type="button" onClick={onOpenRoutines} className="min-h-11 text-xs font-black text-primary">Open Routines</button>} />
          {attention.remainingMessage ? <div className="mb-3 rounded-xl border border-border/60 bg-background/35 px-3 py-2.5" role="status"><p className="text-sm font-bold">{attention.remainingMessage}</p>{attention.atRiskMessage ? <p className="mt-1 text-xs font-bold text-amber-600 dark:text-amber-300">{attention.atRiskMessage}</p> : null}</div> : null}
          <div className="space-y-2">
            {pendingRoutines.length ? pendingRoutines.slice(0, 3).map(item => renderRoutineRow(item, isPinned('routine', item.id))) : <EmptyState>All scheduled routines are clear for today.</EmptyState>}
          </div>
          {skippedRoutines.length ? <p className="mt-3 text-xs text-muted-foreground">Skipped: {skippedRoutines.map(item => item.title).join(', ')}</p> : null}
        </section>
      </div>

      <section className="section-surface p-4 sm:p-5">
        <SectionHeading title="Coming up" subtitle="The next two weeks, without historical clutter." action={<button type="button" onClick={onOpenCalendar} className="min-h-11 text-xs font-black text-primary">Open Calendar</button>} />
        {upcomingEvents.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {upcomingEvents.slice(0, 3).map(event => (
              <button key={`${event.source}-${event.id}`} type="button" onClick={() => onOpenEvent(event)} className="rounded-2xl border border-border/60 bg-background/45 p-3 text-left hover:border-border hover:bg-muted">
                <p className="text-[10px] font-black uppercase tracking-wider text-primary">{formatLabel(event.type)}</p>
                <h3 className="mt-1 line-clamp-1 font-black">{event.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{formatRelativeDate(event.date)}</p>
              </button>
            ))}
          </div>
        ) : <EmptyState>No commitments in the next 14 days. Add a date when one matters.</EmptyState>}
      </section>
    </div>
  );
}
