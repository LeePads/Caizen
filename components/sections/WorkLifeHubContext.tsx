'use client';

import type { WorkLifeHubActivity } from '@/lib/work/lifehub-activity';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

function routineStateLabel(state: WorkLifeHubActivity['routines'][number]['state']) {
  switch (state) {
    case 'completed': return 'Completed';
    case 'skipped': return 'Skipped';
    case 'missed': return 'Missed';
    case 'paused': return 'Paused';
    case 'not-due': return 'Not due';
    default: return 'Due';
  }
}

function taskStateLabel(status: WorkLifeHubActivity['tasks'][number]['status']) {
  switch (status) {
    case 'completed': return 'Completed';
    case 'in-progress': return 'In progress';
    case 'deferred': return 'Deferred';
    case 'failed': return 'Failed';
    case 'dropped': return 'Dropped';
    default: return 'Pending';
  }
}

export default function WorkLifeHubContext({
  activity,
  onOpenRoutine,
  onOpenTask,
  onOpenLifeHub,
}: {
  activity: WorkLifeHubActivity;
  onOpenRoutine: (routineId: string) => void;
  onOpenTask: (taskId: string) => void;
  onOpenLifeHub: () => void;
}) {
  if (!activity.routines.length && !activity.tasks.length) return null;

  return (
    <section
      className="mt-5 min-w-0 border-t border-border/55 pt-4"
      aria-label="Related Life Hub"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">
          Life Hub activity
        </h2>
        <button
          type="button"
          onClick={onOpenLifeHub}
          className="min-h-11 text-caption font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Open in Life Hub
        </button>
      </div>

      <div className="mt-2 grid gap-1.5">
        {activity.routines.map(routine => (
          <button
            key={routine.routineId}
            type="button"
            onClick={() => onOpenRoutine(routine.routineId)}
            aria-label={`Open routine ${routine.title}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 text-left text-xs hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <OverflowTooltip text={routine.title} mode="clamped"><span className="min-w-0 flex-1 line-clamp-2 font-semibold [overflow-wrap:anywhere]">{routine.title}</span></OverflowTooltip>
            <span className="shrink-0 text-caption font-medium text-muted-foreground">{routineStateLabel(routine.state)}</span>
          </button>
        ))}
        {activity.tasks.map(task => (
          <button
            key={task.taskId}
            type="button"
            onClick={() => onOpenTask(task.taskId)}
            aria-label={`Open Life Hub task ${task.title}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 text-left text-xs hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <OverflowTooltip text={task.title} mode="clamped"><span className="min-w-0 flex-1 line-clamp-2 font-semibold [overflow-wrap:anywhere]">{task.title}</span></OverflowTooltip>
            <span className="shrink-0 text-caption font-medium text-muted-foreground">{taskStateLabel(task.status)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
