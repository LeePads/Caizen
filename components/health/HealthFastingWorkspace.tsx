'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import FastingSessionModal, { type FastingSessionDraft } from '@/components/modals/FastingSessionModal';
import { PaginationControls } from '@/components/ui/section-kit';
import { HealthBarChart } from '@/components/health/HealthBarChart';
import { HealthDetails } from '@/components/health/HealthDetails';
import { useAppContext } from '@/lib/context';
import { HEALTH_CHART_RANGES, type HealthChartRange } from '@/lib/health/trends';
import {
  deriveFastingAnalyticsForRange,
  FASTING_STRATEGIES,
  formatFastingDuration,
  formatFastingShortDuration,
  getActiveFastingSession,
  getFastingElapsedMs,
  type FastingStrategyPreset,
} from '@/lib/health/fasting';
import type { FastingSession } from '@/lib/types';

const PAGE_SIZE = 10;

export default function HealthFastingWorkspace() {
  const {
    currentProfileId,
    health,
    fastingSessions: contextSessions,
    addFastingSession,
    updateFastingSession,
    deleteFastingSession,
  } = useAppContext();
  const sessions = contextSessions || health.fastingSessions || [];
  const activeSession = getActiveFastingSession(sessions);
  const [now, setNow] = useState(() => Date.now());
  const [modal, setModal] = useState<{
    mode: 'start' | 'edit' | 'stop' | 'past';
    session: FastingSession | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<FastingSession | null>(null);
  const [preset, setPreset] = useState<FastingStrategyPreset | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<HealthChartRange>('month');
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    if (!activeSession) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeSession?.id]);

  const sortedHistory = useMemo(
    () => [...sessions].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
    [sessions],
  );
  const totalPages = Math.max(1, Math.ceil(sortedHistory.length / PAGE_SIZE));
  const paginatedHistory = sortedHistory.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE);
  const analytics = deriveFastingAnalyticsForRange(sessions, analyticsRange, new Date(now));
  const analyticsRangeConfig = HEALTH_CHART_RANGES.find(item => item.id === analyticsRange) || HEALTH_CHART_RANGES[0];
  const chartPoints = analytics.points.map(point => {
    const duration = formatFastingShortDuration(point.durationMinutes * 60 * 1000);
    const completedFastLabel = `${point.completedFastCount} completed ${point.completedFastCount === 1 ? 'fast' : 'fasts'}`;
    return {
      label: point.label,
      value: point.durationMinutes,
      hasData: point.hasData,
      title: analyticsRange === 'week'
        ? point.hasData
          ? `${point.label}: longest completed fast was ${duration} (${completedFastLabel}).`
          : `No completed fast started on ${point.label}.`
        : point.hasData
          ? `${point.label}: average completed fasting duration was ${duration} across ${completedFastLabel}.`
          : `No completed fasts during ${point.label}.`,
    };
  });
  const activeElapsed = activeSession ? getFastingElapsedMs(activeSession, new Date(now)) : 0;

  useEffect(() => setHistoryPage(page => Math.min(page, totalPages)), [totalPages]);
  useEffect(() => setHistoryPage(1), [currentProfileId]);

  const openModal = (mode: 'start' | 'edit' | 'stop' | 'past', session: FastingSession | null = null, nextPreset: FastingStrategyPreset | null = null) => {
    setPreset(nextPreset);
    setModal({ mode, session });
  };
  const closeModal = () => {
    setModal(null);
    setPreset(null);
  };
  const saveSession = (draft: FastingSessionDraft) => {
    if (draft.id) {
      const saved = updateFastingSession(draft.id, draft);
      if (!saved) return false;
      closeModal();
      return true;
    }
    const id = addFastingSession(draft);
    if (id) closeModal();
    return Boolean(id);
  };

  return (
    <>
      <section className="section-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-section-title">Fasting</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">Use a simple timer to record fasting windows. Targets are reminders only and never stop a fast automatically.</p>
          </div>
        </div>

        <div className="mt-5 border-y border-border/50 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-label text-muted-foreground">{activeSession ? 'Fast in progress' : 'No active fast'}</p>
              {activeSession ? <>
                <p className="mt-2 break-words text-4xl font-bold tracking-tight tabular-nums">{formatFastingDuration(activeElapsed)}</p>
                <p className="mt-2 text-sm text-muted-foreground">Started {activeSession.startedAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{activeSession.targetMinutes ? ` · Target ${formatFastingShortDuration(activeSession.targetMinutes * 60 * 1000)}` : ''}</p>
              </> : <>
                <p className="mt-2 text-2xl font-black tracking-tight">Ready to fast?</p>
                <p className="mt-1 text-sm text-muted-foreground">Start whenever you’re ready.</p>
              </>}
            </div>
            <div className="flex flex-wrap gap-2">
              {activeSession ? <>
                <button type="button" onClick={() => openModal('stop', activeSession)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground">Stop fast</button>
                <button type="button" onClick={() => openModal('edit', activeSession)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border/70 px-4 py-2 text-xs font-black">Edit</button>
              </> : <button type="button" onClick={() => openModal('start')} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground">Start fast</button>}
            </div>
          </div>
          <p className="sr-only" aria-live="polite">{activeSession ? `Fast elapsed ${formatFastingDuration(activeElapsed)}` : 'No active fast. Ready to start.'}</p>
        </div>
        {sessions.filter(session => !session.endedAt).length > 1 ? <p className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">More than one active fast was found. Edit or stop each record explicitly.</p> : null}

        <HealthDetails title="Quick-start strategies" className="mt-5">
          <p className="text-sm text-muted-foreground">Choose a target, then adjust it before saving.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {FASTING_STRATEGIES.map(strategy => <button key={strategy.id} type="button" onClick={() => openModal('start', null, strategy)} className="rounded-xl border border-border/60 bg-background/25 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"><span className="text-sm font-black">{strategy.label}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{strategy.guidance}</span></button>)}
          </div>
        </HealthDetails>

        <div className="mt-6 grid gap-x-4 gap-y-3 border-y border-border/50 py-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Completed', String(analytics.completedCount)],
            ['Average duration', analytics.averageDurationMinutes === null ? '—' : formatFastingShortDuration(analytics.averageDurationMinutes * 60 * 1000)],
            ['Longest duration', analytics.longestDurationMinutes === null ? '—' : formatFastingShortDuration(analytics.longestDurationMinutes * 60 * 1000)],
            ['History window', analyticsRangeConfig.windowLabel],
          ].map(([label, value]) => <div key={label} className="min-w-0"><p className="text-label text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-bold">{value}</p></div>)}
        </div>

        <section className="mt-6 border-t border-border/50 pt-5" aria-labelledby="fasting-history-trends-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h3 id="fasting-history-trends-heading" className="text-section-title">History &amp; trends</h3><p className="mt-1 text-sm text-muted-foreground">Review recent fasting duration and completed records.</p></div>
            <div className="flex rounded-xl border border-border/60 bg-background/35 p-1" role="group" aria-label="Fasting history range">
              {HEALTH_CHART_RANGES.map(({ id, label, windowLabel }) => <button key={id} type="button" aria-pressed={analyticsRange === id} aria-label={`${label} (${windowLabel})`} onClick={() => setAnalyticsRange(id)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${analyticsRange === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
            </div>
          </div>
          <div className="mt-4 space-y-5">
            {!analytics.completedCount ? <p className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">Complete a fast to see duration history here.</p> : <>
              <HealthBarChart
                colorClass="bg-amber-500/75"
                chartLabel="Fasting duration chart"
                points={chartPoints}
              />
              <ul className="sr-only" aria-label={analyticsRange === 'week' ? 'Daily fasting duration values' : analyticsRange === 'month' ? 'Weekly average fasting duration values' : 'Monthly average fasting duration values'}>{chartPoints.map(point => <li key={point.label}>{point.title}</li>)}</ul>
            </>}
            <div className="border-y border-border/60">
              <div className="flex flex-col items-start gap-3 border-b border-border/50 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-card-title">Fasting history</h3><p className="mt-1 text-xs text-muted-foreground">Most recent records first.</p></div><button type="button" onClick={() => openModal('past')} className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-border/70 px-3 text-sm font-semibold"><Plus className="mr-1.5 h-4 w-4" />Add past fast</button></div>
              {sessions.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No fasting sessions yet.</p> : <div className="divide-y divide-border/50">{paginatedHistory.map(session => <div key={session.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{session.startedAt.toLocaleDateString()} · {formatFastingDuration(getFastingElapsedMs(session, new Date(now)))}</p><p className="mt-1 text-xs text-muted-foreground">{session.startedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – {session.endedAt ? session.endedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'Active'}{session.targetMinutes ? ` · Target ${formatFastingShortDuration(session.targetMinutes * 60 * 1000)}` : ''}</p></div><div className="flex gap-2"><button type="button" onClick={() => openModal('edit', session)} className="min-h-11 rounded-xl border border-border/70 px-3 text-xs font-black">Edit</button><button type="button" onClick={() => setDeleting(session)} className="min-h-11 rounded-xl border border-destructive/30 px-3 text-xs font-black">Delete</button></div></div>)}</div>}
              {totalPages > 1 ? <PaginationControls page={historyPage} totalPages={totalPages} totalItems={sortedHistory.length} pageSize={PAGE_SIZE} onPageChange={setHistoryPage} /> : null}
            </div>
          </div>
        </section>
      </section>

      <FastingSessionModal isOpen={Boolean(modal)} mode={modal?.mode || 'start'} session={modal?.session} initialTargetMinutes={preset?.targetMinutes} initialNotes={preset?.guidance} onSave={saveSession} onClose={closeModal} />
      <ConfirmDialog isOpen={Boolean(deleting)} title="Delete fasting session?" message="Delete this fasting record? This does not change any food or workout history." confirmText="Delete" cancelText="Cancel" isDangerous onConfirm={() => { if (deleting) deleteFastingSession(deleting.id); setDeleting(null); }} onCancel={() => setDeleting(null)} />
    </>
  );
}
