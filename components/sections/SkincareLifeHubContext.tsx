'use client';

import type { SkincareLifeHubActivity } from '@/lib/skincare/lifehub-activity';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

function routineStateLabel(state: SkincareLifeHubActivity['routines'][number]['state']) {
  switch (state) {
    case 'completed': return 'Completed';
    case 'skipped': return 'Skipped';
    case 'missed': return 'Missed';
    case 'paused': return 'Paused';
    case 'not-due': return 'Not due';
    default: return 'Due';
  }
}

function taskStateLabel(status: SkincareLifeHubActivity['tasks'][number]['status']) {
  switch (status) {
    case 'completed': return 'Completed';
    case 'in-progress': return 'In progress';
    case 'deferred': return 'Deferred';
    case 'failed': return 'Failed';
    case 'dropped': return 'Dropped';
    default: return 'Pending';
  }
}

export default function SkincareLifeHubContext({
  activity,
  compact = false,
  onOpenRoutine,
  onOpenTask,
  onOpenLifeHub,
}: {
  activity: SkincareLifeHubActivity;
  compact?: boolean;
  onOpenRoutine: (routineId: string) => void;
  onOpenTask: (taskId: string) => void;
  onOpenLifeHub: () => void;
}) {
  if (!activity.routines.length && !activity.tasks.length) return null;

  if (compact) {
    return (
      <div className="mt-2 min-w-0" onClick={event => event.stopPropagation()}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="shrink-0 font-black uppercase tracking-wide text-primary">Linked</span>
          {activity.routines.map(routine => (
            <button key={routine.routineId} type="button" onClick={() => onOpenRoutine(routine.routineId)} aria-label={`Open routine ${routine.title}`} className="min-h-7 max-w-full truncate font-semibold hover:text-primary">
              {routine.title} <span className="font-medium text-muted-foreground">· {routineStateLabel(routine.state)}</span>
            </button>
          ))}
          {activity.tasks.map(task => (
            <button key={task.taskId} type="button" onClick={() => onOpenTask(task.taskId)} aria-label={`Open task ${task.title}`} className="min-h-7 max-w-full truncate font-semibold hover:text-primary">
              {task.title} <span className="font-medium text-muted-foreground">· {taskStateLabel(task.status)}</span>
            </button>
          ))}
          <button type="button" onClick={onOpenLifeHub} className="min-h-7 shrink-0 font-black text-primary hover:underline">Life Hub →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-auto rounded-2xl border border-primary/15 bg-primary/[0.035] p-3" onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">{activity.routines.length ? 'Linked routine' : 'Linked task'}</p>
        <button type="button" onClick={onOpenLifeHub} className="min-h-9 text-[11px] font-black text-primary hover:underline">Open in Life Hub</button>
      </div>

      <div className="mt-2 grid gap-1.5">
        {activity.routines.map(routine => (
          <button
            key={routine.routineId}
            type="button"
            onClick={() => onOpenRoutine(routine.routineId)}
            aria-label={`Open routine ${routine.title}`}
            className="flex min-h-9 items-center justify-between gap-3 rounded-xl px-2 text-left text-xs hover:bg-primary/10"
          >
            <OverflowTooltip text={routine.title}><span className="min-w-0 truncate font-bold">{routine.title}</span></OverflowTooltip>
            <span className="shrink-0 text-[10px] font-black uppercase text-muted-foreground">{routineStateLabel(routine.state)}</span>
          </button>
        ))}
        {activity.tasks.map(task => (
          <button
            key={task.taskId}
            type="button"
            onClick={() => onOpenTask(task.taskId)}
            aria-label={`Open task ${task.title}`}
            className="flex min-h-9 items-center justify-between gap-3 rounded-xl px-2 text-left text-xs hover:bg-primary/10"
          >
            <OverflowTooltip text={task.title}><span className="min-w-0 truncate font-bold">{task.title}</span></OverflowTooltip>
            <span className="shrink-0 text-[10px] font-black uppercase text-muted-foreground">{taskStateLabel(task.status)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
