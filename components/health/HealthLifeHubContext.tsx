'use client';

import type { HealthLifeHubActivity, HealthRoutineState } from '@/lib/health/lifehub-activity';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

function routineStateLabel(state: HealthRoutineState) {
  switch (state) {
    case 'completed': return 'Completed';
    case 'skipped': return 'Skipped';
    case 'missed': return 'Missed';
    case 'paused': return 'Paused';
    case 'not-due': return 'Not due';
    default: return 'Due';
  }
}

function taskStateLabel(status: HealthLifeHubActivity['tasks'][number]['status']) {
  return status === 'completed' ? 'Completed' : status === 'in-progress' ? 'In progress' : 'Pending';
}

export default function HealthLifeHubContext({
  activity,
  targetLabel,
  onOpenRoutine,
  onOpenTask,
  onOpenLifeHub,
}: {
  activity: HealthLifeHubActivity;
  targetLabel: string;
  onOpenRoutine: (routineId: string) => void;
  onOpenTask: (taskId: string) => void;
  onOpenLifeHub: () => void;
}) {
  if (!activity.routines.length && !activity.tasks.length) return null;

  return (
    <section className="mt-auto rounded-2xl border border-primary/15 bg-primary/[0.035] p-3" aria-label={`${activity.routines.length ? 'Linked routine' : 'Linked task'} for ${targetLabel}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">{activity.routines.length ? 'Linked routine' : 'Linked task'}</p>
        <button type="button" onClick={onOpenLifeHub} className="min-h-11 shrink-0 text-[11px] font-black text-primary hover:underline">Open in Life Hub</button>
      </div>

      <div className="mt-2 grid gap-1.5">
        {activity.routines.map(routine => (
          <button key={routine.routineId} type="button" onClick={() => onOpenRoutine(routine.routineId)} aria-label={`Open routine ${routine.title}`} className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 text-left text-xs hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            <OverflowTooltip text={routine.title}><span className="min-w-0 truncate font-bold">{routine.title}</span></OverflowTooltip>
            <span className="shrink-0 text-[10px] font-black uppercase text-muted-foreground">{routineStateLabel(routine.state)}</span>
          </button>
        ))}
        {activity.tasks.map(task => (
          <button key={task.taskId} type="button" onClick={() => onOpenTask(task.taskId)} aria-label={`Open Life Hub task ${task.title}`} className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 text-left text-xs hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            <OverflowTooltip text={task.title}><span className="min-w-0 truncate font-bold">{task.title}</span></OverflowTooltip>
            <span className="shrink-0 text-[10px] font-black uppercase text-muted-foreground">{taskStateLabel(task.status)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
