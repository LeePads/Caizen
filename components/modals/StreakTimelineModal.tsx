'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getStreakActiveDays,
  normalizePauseHistory,
  validatePauseHistory,
} from '@/lib/health/streak-timeline';
import { toLocalDateKey } from '@/lib/lifehub/date-utils';
import type { NoXTracker, StreakPausePeriod } from '@/lib/types';
import { guardHealthTextChange, validateHealthTextIfChanged } from '@/lib/health/validation';
import { isAndroid } from '@/lib/platform';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';

type Props = {
  isOpen: boolean;
  streak: NoXTracker | null;
  onClose: () => void;
  onSave: (patch: Partial<NoXTracker>) => void;
};

type PauseDraft = {
  id: string;
  pausedAt: string;
  resumedAt: string;
  reason: string;
};

const createPauseDraft = (): PauseDraft => ({
  id: `streak-pause-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  pausedAt: toLocalDateKey(new Date()),
  resumedAt: '',
  reason: '',
});

function isNestedOverlayTarget(target: EventTarget | null) {
  return typeof Element !== 'undefined' && target instanceof Element && Boolean(target.closest('.caizen-sheet-root'));
}

export default function StreakTimelineModal({
  isOpen,
  streak,
  onClose,
  onSave,
}: Props) {
  const initial = useMemo(() => ({
    startDate: streak ? toLocalDateKey(streak.startDate) : toLocalDateKey(new Date()),
    notes: streak?.notes || '',
    showMilestonesInCalendar: streak?.showMilestonesInCalendar !== false,
    periods: streak
      ? normalizePauseHistory(streak).map(period => ({
          id: period.id,
          pausedAt: toLocalDateKey(period.pausedAt),
          resumedAt: period.resumedAt ? toLocalDateKey(period.resumedAt) : '',
          reason: period.reason || '',
        }))
      : [],
  }), [streak]);

  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [datePickerOpen, setDatePickerOpenState] = useState(false);
  const datePickerOpenRef = useRef(false);

  const setDatePickerOpen = (open: boolean) => {
    datePickerOpenRef.current = open;
    setDatePickerOpenState(open);
  };

  useEffect(() => {
    if (!isOpen) {
      setDatePickerOpen(false);
      return;
    }
    setDraft(initial);
    setError(null);
    setShowUnsaved(false);
  }, [initial, isOpen]);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(initial);
  const requestClose = () => {
    if (datePickerOpenRef.current) return;
    if (isAndroid() && hasChanges) {
      setShowUnsaved(true);
      return;
    }
    onClose();
  };

  useOverlayLifecycle(isOpen && isAndroid(), requestClose, { autoFocus: false, trapFocus: false });

  if (!streak) return null;

  const parsedPeriods: StreakPausePeriod[] = draft.periods
    .filter(period => period.pausedAt)
    .map(period => ({
      id: period.id,
      pausedAt: new Date(`${period.pausedAt}T12:00:00`),
      resumedAt: period.resumedAt ? new Date(`${period.resumedAt}T12:00:00`) : null,
      reason: period.reason.trim() || undefined,
    }));

  const preview: NoXTracker = {
    ...streak,
    startDate: new Date(`${draft.startDate}T12:00:00`),
    pauseHistory: parsedPeriods,
    pausedAt: parsedPeriods.find(period => !period.resumedAt)?.pausedAt || null,
  };

  const submit = () => {
    const notesError = validateHealthTextIfChanged(draft.notes, initial.notes, { label: 'Notes', maxLength: 1000, mode: 'multiline' });
    const reasonError = draft.periods
      .map(period => validateHealthTextIfChanged(
        period.reason,
        initial.periods.find(item => item.id === period.id)?.reason || '',
        { label: 'Pause reason', maxLength: 300, mode: 'multiline' },
      ))
      .find(Boolean);
    if (notesError || reasonError) {
      setError(notesError || reasonError || 'Check the timeline text.');
      return;
    }
    const startDate = new Date(`${draft.startDate}T12:00:00`);
    const validation = validatePauseHistory(startDate, parsedPeriods);
    if (validation) {
      setError(validation);
      return;
    }

    const openPause = parsedPeriods.find(period => !period.resumedAt);
    const completedPausedDays = parsedPeriods.reduce((sum, period) => {
      if (!period.resumedAt) return sum;
      const start = new Date(period.pausedAt);
      const end = new Date(period.resumedAt);
      return sum + Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    }, 0);

    onSave({
      startDate,
      notes: draft.notes.trim() || undefined,
      showMilestonesInCalendar: draft.showMilestonesInCalendar,
      pauseHistory: parsedPeriods,
      pausedAt: openPause?.pausedAt || null,
      resumeDate: null,
      pauseReason: openPause?.reason || '',
      accumulatedPausedDays: completedPausedDays,
      updatedAt: new Date(),
    });
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={open => !open && requestClose()}>
      <DialogContent
        allowOutsideDismiss={isAndroid() && !datePickerOpen}
        onPointerDownOutside={event => {
          if (datePickerOpenRef.current || isNestedOverlayTarget(event.target)) event.preventDefault();
        }}
        onInteractOutside={event => {
          if (datePickerOpenRef.current || isNestedOverlayTarget(event.target)) event.preventDefault();
        }}
        className="max-h-[92vh] max-w-2xl overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Edit {streak.name} timeline</DialogTitle>
          <DialogDescription>
            Correct the start and pause periods. The day count is always calculated automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold">Started on</span>
              <AdaptiveDatePicker
                label="Started on"
                max={toLocalDateKey(new Date())}
                value={draft.startDate}
                onChange={value => setDraft(current => ({ ...current, startDate: value }))}
                onOpenChange={setDatePickerOpen}
                className="control-input"
              />
            </label>
            <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current total</p>
              <p className="mt-2 text-3xl font-black">{getStreakActiveDays(preview)} days</p>
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-bold">Notes</span>
            <textarea
              value={draft.notes}
              onChange={event => {
                const result = guardHealthTextChange(draft.notes, event.target.value, { label: 'Notes', maxLength: 1000, mode: 'multiline' });
                if (!result.accepted) return setError(result.error || 'Check the notes.');
                setDraft(current => ({ ...current, notes: result.value }));
                setError(result.error || null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby="streak-notes-error"
              className="control-input min-h-20 py-3"
            />
            <div className="min-h-[20px] pt-0.5">{error ? <p id="streak-notes-error" role="alert" className="text-xs font-semibold text-destructive">{error}</p> : null}</div>
          </label>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/40 p-4">
            <div>
              <p className="font-bold">Show milestones in calendar</p>
              <p className="mt-1 text-xs text-muted-foreground">Keep this streak's milestone markers visible in Life Hub.</p>
            </div>
            <Switch
              checked={draft.showMilestonesInCalendar}
              onCheckedChange={checked => setDraft(current => ({ ...current, showMilestonesInCalendar: checked }))}
              aria-label="Show milestones in calendar"
            />
          </div>

          <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black">Paused periods</h3>
                <p className="text-xs text-muted-foreground">Leave the resume date empty only for the current pause.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDraft(current => ({
                  ...current,
                  periods: [...current.periods, createPauseDraft()],
                }))}
              >
                <Plus className="mr-2 size-4" /> Add
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {draft.periods.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                  No paused periods. Every calendar day since the start counts.
                </p>
              ) : draft.periods.map((period, index) => (
                <div key={period.id} className="grid gap-3 rounded-xl border border-border/50 bg-card p-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-bold text-muted-foreground">Paused</span>
                    <AdaptiveDatePicker
                      label="Paused"
                      value={period.pausedAt}
                      onChange={value => setDraft(current => ({
                        ...current,
                        periods: current.periods.map(item =>
                          item.id === period.id ? { ...item, pausedAt: value } : item,
                        ),
                      }))}
                      onOpenChange={setDatePickerOpen}
                      className="control-input"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-bold text-muted-foreground">Resumed</span>
                    <AdaptiveDatePicker
                      label="Resumed"
                      value={period.resumedAt}
                      onChange={value => setDraft(current => ({
                        ...current,
                        periods: current.periods.map(item =>
                          item.id === period.id ? { ...item, resumedAt: value } : item,
                        ),
                      }))}
                      onOpenChange={setDatePickerOpen}
                      className="control-input"
                    />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-bold text-muted-foreground">Reason</span>
                    <div className="flex gap-2">
                      <input
                        value={period.reason}
                        onChange={event => {
                          const result = guardHealthTextChange(period.reason, event.target.value, { label: 'Pause reason', maxLength: 300 });
                          if (!result.accepted) return setError(result.error || 'Check the pause reason.');
                          setDraft(current => ({
                            ...current,
                            periods: current.periods.map(item =>
                              item.id === period.id ? { ...item, reason: result.value } : item,
                            ),
                          }));
                          setError(result.error || null);
                        }}
                        placeholder={`Pause ${index + 1} reason (optional)`}
                        aria-invalid={Boolean(error)}
                        aria-describedby="streak-reason-error"
                        className="control-input"
                      />
                      <button
                        type="button"
                        onClick={() => setDraft(current => ({
                          ...current,
                          periods: current.periods.filter(item => item.id !== period.id),
                        }))}
                        className="grid size-11 shrink-0 place-items-center rounded-xl border border-red-500/30 text-red-500"
                        aria-label={`Remove pause ${index + 1}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          </section>

          {error ? (
            <p id="streak-reason-error" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-500">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={requestClose}>Cancel</Button>
          <Button type="button" onClick={submit}>Save Timeline</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      isOpen={showUnsaved}
      title="Discard unsaved timeline changes?"
      message="Your streak timeline edits have not been saved yet."
      confirmText="Discard changes"
      cancelText="Keep editing"
      isDangerous={false}
      onCancel={() => setShowUnsaved(false)}
      onConfirm={() => {
        setShowUnsaved(false);
        onClose();
      }}
    />
    </>
  );
}
