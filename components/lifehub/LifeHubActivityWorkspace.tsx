'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, Check, Circle, Trash2, XCircle } from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import LifeHubActivityTimeline from '@/components/sections/LifeHubActivityTimeline';
import { useAppContext } from '@/lib/context';
import { deriveProgressHistory, routineGoalUnitLabel, type ProgressHistoryRange } from '@/lib/lifehub/progress-history';
import { getPresentationHistoryClearUpdates } from '@/lib/lifehub/history-presentation';
import { formatDate } from '@/lib/lifehub/date-utils';
import type { DailyChecklistItem, ProductivityItem } from '@/lib/types';
import type { DerivedActivityEntry } from '@/lib/lifehub/activity-timeline';

type Props = {
  androidPresentation?: boolean;
  initialView?: ActivityView;
  onNavigate: (entry: DerivedActivityEntry) => void;
  onOpenTask: (item: ProductivityItem) => void;
  onReopenTask: (item: ProductivityItem) => void;
  onDeleteTask: (item: ProductivityItem) => void;
  onOpenRoutine: (item: DailyChecklistItem) => void;
};

export type ActivityView = 'timeline' | 'outcomes';

const OUTCOME_STATUSES = new Set(['completed', 'failed', 'dropped']);

export default function LifeHubActivityWorkspace({
  androidPresentation = false,
  initialView = 'timeline',
  onNavigate,
  onOpenTask,
  onReopenTask,
  onDeleteTask,
  onOpenRoutine,
}: Props) {
  const {
    currentProfileId,
    productivityItems = [],
    dailyChecklistItems = [],
    transactions = [],
    mediaItems = [],
    skincareProducts = [],
    skincareUsageEvents = [],
    importantDates = [],
    journalEntries = [],
    health,
    trashItems = [],
    isHydrated,
    updateProfile,
  } = useAppContext();
  const [view, setView] = useState<ActivityView>(initialView);
  const [range, setRange] = useState<ProgressHistoryRange>('week');
  const [showOutcomes, setShowOutcomes] = useState(false);
  const [confirmHideHistory, setConfirmHideHistory] = useState(false);

  const taskItems = useMemo(
    () => productivityItems.filter(item => ['task', 'idea', 'reminder'].includes(item.type)),
    [productivityItems],
  );
  const historyTasks = taskItems.filter(item =>
    item.type !== 'idea' && OUTCOME_STATUSES.has(item.status) && !item.hiddenFromHistory,
  );
  const progress = useMemo(
    () => deriveProgressHistory(taskItems, dailyChecklistItems, range, new Date()),
    [dailyChecklistItems, range, taskItems],
  );

  useEffect(() => setView(initialView), [initialView]);

  const clearHistory = () => {
    if (!currentProfileId) return;
    const hiddenIds = new Set(getPresentationHistoryClearUpdates(historyTasks).map(update => update.id));
    updateProfile(currentProfileId, {
      productivityItems: productivityItems.map(item =>
        hiddenIds.has(item.id) ? { ...item, hiddenFromHistory: true } : item,
      ),
    });
    setConfirmHideHistory(false);
  };

  return (
    <section className="motion-panel space-y-4" aria-label="Life Hub activity">
      <header className="section-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">What happened and how plans are going.</p>
        </div>
        <div className="flex rounded-xl border border-border/60 bg-background/40 p-1" role="tablist" aria-label="Activity views">
          {([
            ['timeline', 'Timeline'],
            ['outcomes', 'Outcomes'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`min-h-11 rounded-lg px-4 text-xs font-black sm:text-sm ${view === id ? 'caizen-tab-active text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {!isHydrated ? (
        <section className="section-surface p-5" aria-live="polite">
          <p className="text-sm font-bold text-muted-foreground">Loading Activity…</p>
        </section>
      ) : view === 'timeline' ? (
        <LifeHubActivityTimeline
          currentProfileId={currentProfileId}
          isHydrated={isHydrated}
          androidPresentation={androidPresentation}
          productivityItems={productivityItems}
          dailyChecklistItems={dailyChecklistItems}
          transactions={transactions}
          mediaItems={mediaItems}
          skincareProducts={skincareProducts}
          skincareUsageEvents={skincareUsageEvents}
          importantDates={importantDates}
          journalEntries={journalEntries}
          health={health}
          trashItems={trashItems}
          onNavigate={onNavigate}
        />
      ) : (
        <section className="space-y-4" aria-label="Planning outcomes">
          <section className="section-surface p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-black">Follow-through</h3>
                <p className="mt-1 text-sm text-muted-foreground">Completed planned tasks and routine occurrences, with explicit skips excluded.</p>
              </div>
              <div className="flex rounded-xl border border-border/60 bg-background/40 p-1" role="group" aria-label="Outcome history range">
                {(['week', 'month'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={range === option}
                    onClick={() => setRange(option)}
                    className={`min-h-11 rounded-lg px-3 text-xs font-black capitalize ${range === option ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 border-y border-border/50 py-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground">Follow-through</p>
                <p className="mt-1 text-2xl font-black tabular-nums">
                  {progress.followThrough.rate === null ? '—' : `${progress.followThrough.rate}%`}
                </p>
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">
                {progress.followThrough.rate === null
                  ? 'No planned outcomes were recorded in this range.'
                  : `${progress.followThrough.completed} of ${progress.followThrough.expected} planned outcomes completed. ${progress.followThrough.remaining} remain unfinished.`}
              </p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-y divide-border/50 sm:grid-cols-4 sm:divide-y-0">
              {[
                ['Tasks completed', progress.completedTasks],
                ['Tasks dropped', progress.droppedTasks],
                ['Routines done', progress.completedRoutines],
                ['Routines skipped', progress.skippedRoutines],
              ].map(([label, value]) => (
                <div key={label} className="p-3 first:pl-0 sm:px-3 sm:first:pl-0">
                  <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-black tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="section-surface p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black">Task history</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {historyTasks.filter(item => item.status === 'completed').length} completed · {historyTasks.filter(item => item.status !== 'completed').length} dropped or not completed
                </p>
              </div>
              {historyTasks.length ? (
                <button type="button" onClick={() => setConfirmHideHistory(true)} className="min-h-11 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground">
                  Clear history
                </button>
              ) : null}
            </div>
            {historyTasks.length ? (
              <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {[...historyTasks]
                  .sort((a, b) => new Date(b.completedAt || b.failedAt || b.createdAt).getTime() - new Date(a.completedAt || a.failedAt || a.createdAt).getTime())
                  .map(item => (
                    <article key={item.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/45 p-3">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                        {item.status === 'completed' ? <Check className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
                      </span>
                      <button type="button" onClick={() => onOpenTask(item)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-black">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {item.status === 'failed' ? 'Not completed' : item.status === 'dropped' ? 'Dropped' : 'Completed'} · {formatDate(item.completedAt || item.failedAt || item.createdAt)}
                        </span>
                      </button>
                      <button type="button" onClick={() => onReopenTask(item)} className="min-h-11 shrink-0 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground">Reopen</button>
                      <button type="button" onClick={() => onDeleteTask(item)} aria-label={`Delete ${item.title}`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-red-500/10 hover:text-red-400"><Trash2 className="size-4" aria-hidden="true" /></button>
                    </article>
                  ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">Completed and dropped tasks will appear here.</p>
            )}
          </section>

          <section className="section-surface p-4 sm:p-5">
            <button type="button" onClick={() => setShowOutcomes(current => !current)} aria-expanded={showOutcomes} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
              <span>
                <span className="block text-base font-black">Routine outcomes</span>
                <span className="mt-1 block text-sm text-muted-foreground">Completed, skipped, and measured occurrences from the selected range.</span>
              </span>
              <span className="text-xs font-black text-primary">{showOutcomes ? 'Hide' : 'Show'}</span>
            </button>
            {showOutcomes ? (
              <div className="mt-3 space-y-2">
                {progress.entries.filter(entry => entry.source === 'routine').slice(0, 16).length ? (
                  progress.entries.filter(entry => entry.source === 'routine').slice(0, 16).map(entry => {
                    const routine = dailyChecklistItems.find(item => item.id === entry.recordId);
                    const Icon = entry.status === 'completed' ? Check : entry.status === 'skipped' ? XCircle : Circle;
                    return (
                      <button key={entry.id} type="button" onClick={() => routine && onOpenRoutine(routine)} className="flex w-full items-center gap-3 rounded-xl border border-border/55 bg-background/35 px-3 py-2.5 text-left hover:bg-muted/40">
                        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black">{entry.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {entry.status === 'completed' ? 'Completed' : entry.status === 'skipped' ? 'Skipped' : entry.status === 'in-progress' ? 'In progress' : 'Dropped'} · {formatDate(entry.date)}
                            {entry.measuredProgress ? ` · ${entry.measuredProgress.value} / ${entry.measuredProgress.target} ${routineGoalUnitLabel(entry.measuredProgress.unit, entry.measuredProgress.customUnit)}` : ''}
                            {entry.legacyPeriod ? ' · Legacy period' : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">No routine outcomes in this range.</p>
                )}
              </div>
            ) : null}
          </section>
        </section>
      )}

      <ConfirmDialog
        isOpen={confirmHideHistory}
        title="Clear task history?"
        message={`This hides ${historyTasks.length} completed or dropped item${historyTasks.length === 1 ? '' : 's'} from Activity. Your records and completion evidence remain available.`}
        confirmText="Clear history"
        cancelText="Cancel"
        onCancel={() => setConfirmHideHistory(false)}
        onConfirm={clearHistory}
      />
    </section>
  );
}
