'use client';

import { useMemo } from 'react';

import type { UpcomingMoneyItem } from '@/lib/types';
import { useAppContext } from '@/lib/context';
import {
  deriveBalanceLifeHubActivity,
  type BalanceRoutineState,
} from '@/lib/balance/lifehub-activity';

const routineStateLabel: Record<BalanceRoutineState, string> = {
  completed: 'Completed',
  skipped: 'Skipped',
  due: 'Due',
  missed: 'Missed',
  paused: 'Paused',
  'not-due': 'Not due',
};

function navigateTo(section: string, feature: string, recordId: string) {
  window.dispatchEvent(
    new CustomEvent('life-manager:navigate', {
      detail: { section, feature, recordId },
    }),
  );
}

export default function BalanceLifeHubContext({ item }: { item: UpcomingMoneyItem }) {
  const context = useAppContext();
  const activity = useMemo(
    () => deriveBalanceLifeHubActivity(
      item.id,
      context.dailyChecklistItems || [],
      context.productivityItems || [],
    ),
    [context.dailyChecklistItems, context.productivityItems, item.id],
  );

  if (!activity.linkedRoutineCount && !activity.linkedTaskCount) return null;

  return (
    <div className="@container/linked mt-3 border-t border-border/45 pt-3" aria-label={`${activity.linkedRoutineCount ? 'Linked routine' : 'Linked task'} for ${item.title}`}>
      <div className="text-label text-muted-foreground">
        {activity.linkedRoutineCount ? 'Linked routine' : 'Linked task'}
      </div>

      <div className="mt-2 space-y-1.5">
        {activity.routines.map(routine => (
            <div key={routine.routineId} className="flex min-w-0 flex-col items-start gap-2 text-xs @min-[24rem]/linked:flex-row @min-[24rem]/linked:items-center">
              <span className="min-w-0 flex-1 break-words">
              <span className="font-bold">{routine.title}</span> · {routineStateLabel[routine.state]}
              </span>
            <button
              type="button"
              onClick={() => navigateTo('lifehub', 'routine', routine.routineId)}
              className="min-h-11 shrink-0 rounded-lg border border-primary/25 px-2.5 text-xs font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label={`Open Routine ${routine.title}`}
            >
                Open in Life Hub
            </button>
          </div>
        ))}

        {activity.tasks.map(task => {
          return (
            <div key={task.taskId} className="flex min-w-0 flex-col items-start gap-2 text-xs @min-[24rem]/linked:flex-row @min-[24rem]/linked:items-center">
              <span className="min-w-0 flex-1 break-words">
                <span className="font-bold">{task.title}</span> · {task.state === 'completed' ? 'Completed' : 'Pending'}
              </span>
              <button
                type="button"
                onClick={() => navigateTo('lifehub', 'tasks', task.taskId)}
                className="min-h-11 shrink-0 rounded-lg border border-primary/25 px-2.5 text-xs font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label={`Open Life Hub Task ${task.title}`}
              >
                Open in Life Hub
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
