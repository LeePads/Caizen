'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  Check,
  Clock3,
  Dumbbell,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Repeat2,
  Trash2,
} from 'lucide-react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import WorkoutPlanModal, {
  type WorkoutPlanSaveDraft,
} from '@/components/modals/WorkoutPlanModal';
import HealthLifeHubContext from '@/components/health/HealthLifeHubContext';
import { HealthOverflowMenu } from '@/components/health/HealthOverflowMenu';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppContext } from '@/lib/context';
import { parseLocalDateKey, parseLocalDateValue } from '@/lib/lifehub/date-utils';
import { normalizeHealthNonNegative } from '@/lib/health/normalization';
import { guardHealthNumberChange, guardHealthTextChange, HEALTH_LIMITS, validateHealthNumber, validateHealthText } from '@/lib/health/validation';
import {
  claimRequestSignal,
  isProfileBoundRequestReady,
} from '@/lib/section-feature-request';
import {
  isRoutineDoneForDate,
  isRoutineDueForDate,
} from '@/lib/lifehub/routine-schedule';
import { deriveHealthLifeHubActivity } from '@/lib/health/lifehub-activity';
import { getHealthTargetFromLifeHubRecord, type HealthLinkedTarget } from '@/lib/lifehub/linked-context';
import type {
  ActivityEntry,
  ActivityIntensity,
  DailyChecklistItem,
  WorkoutPlan,
} from '@/lib/types';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

type WorkoutView = 'today' | 'plans' | 'history';

type Props = {
  defaultDate: string;
  androidPresentation?: boolean;
  onManualLog: () => void;
  onEditActivity: (entry: ActivityEntry) => void;
  onDeleteActivity: (entry: ActivityEntry) => void;
  requestedProfileId?: string;
  requestedPlanId?: string;
  requestedPlanSignal?: number;
  requestedPlanAction?: 'edit' | 'start';
  requestedCreateSignal?: number;
  onRequestedPlanConsumed?: (signal: number) => void;
  onRequestedCreateConsumed?: (signal: number) => void;
};

const formatDate = (value: Date | string) =>
  (parseLocalDateValue(value) || new Date(Number.NaN)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const scheduleLabel = (routine?: DailyChecklistItem) => {
  if (!routine) return 'Not scheduled';
  if (routine.frequency === 'daily') return `Daily${routine.scheduledTime ? ` · ${routine.scheduledTime}` : ''}`;
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = (routine.weekdays || []).map(day => names[day]).join(', ');
  return `${days || 'Selected days'}${routine.scheduledTime ? ` · ${routine.scheduledTime}` : ''}`;
};

export default function WorkoutPlannerPanel({
  defaultDate,
  androidPresentation = false,
  onManualLog,
  onEditActivity,
  onDeleteActivity,
  requestedProfileId,
  requestedPlanId,
  requestedPlanSignal = 0,
  requestedPlanAction = 'edit',
  requestedCreateSignal = 0,
  onRequestedPlanConsumed,
  onRequestedCreateConsumed,
}: Props) {
  const context = useAppContext();
  const {
    workoutPlans,
    addWorkoutPlan,
    updateWorkoutPlan,
    deleteWorkoutPlan,
    dailyChecklistItems,
    addDailyChecklistItem,
    updateDailyChecklistItem,
    deleteDailyChecklistItem,
    addActivityEntry,
    health,
    currentProfileId,
    isHydrated,
  } = context;

  const [view, setView] = useState<WorkoutView>('today');
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<WorkoutPlan | null>(null);
  const [completingPlan, setCompletingPlan] = useState<WorkoutPlan | null>(null);
  const [completion, setCompletion] = useState({
    durationMinutes: '',
    caloriesBurned: '',
    intensity: 'moderate' as ActivityIntensity,
    notes: '',
  });
  const [completionError, setCompletionError] = useState('');
  const [completionFieldErrors, setCompletionFieldErrors] = useState<{ duration?: string; calories?: string; notes?: string }>({});
  const consumedPlanRequestRef = useRef<number | null>(null);
  const consumedCreateRequestRef = useRef<number | null>(null);

  const startCompletion = useCallback((plan: WorkoutPlan) => {
    setCompletingPlan(plan);
    setCompletion({
      durationMinutes: plan.estimatedDurationMinutes
        ? String(plan.estimatedDurationMinutes)
        : '',
      caloriesBurned: plan.estimatedCalories
        ? String(plan.estimatedCalories)
        : '',
      intensity: plan.defaultIntensity || 'moderate',
      notes: '',
    });
    setCompletionError('');
    setCompletionFieldErrors({});
  }, []);

  const openCreatePlan = useCallback(() => {
    setEditingPlan(null);
    setShowPlanModal(true);
  }, []);

  useEffect(() => {
    if (!isProfileBoundRequestReady({
      isHydrated,
      requestedProfileId,
      currentProfileId,
      signal: requestedPlanSignal,
    }) || !requestedPlanId) return;
    if (!claimRequestSignal(consumedPlanRequestRef, requestedPlanSignal)) return;
    const plan = workoutPlans.find(item => item.id === requestedPlanId);
    if (plan) {
      if (requestedPlanAction === 'start') {
        setView('today');
        startCompletion(plan);
      } else {
        setView('plans');
        setEditingPlan(plan);
        setShowPlanModal(true);
      }
    }
    consumedPlanRequestRef.current = requestedPlanSignal;
    onRequestedPlanConsumed?.(requestedPlanSignal);
  }, [
    currentProfileId,
    isHydrated,
    onRequestedPlanConsumed,
    requestedPlanId,
    requestedPlanAction,
    requestedPlanSignal,
    requestedProfileId,
    startCompletion,
    workoutPlans,
  ]);

  useEffect(() => {
    if (!requestedCreateSignal || !isHydrated || !requestedProfileId || requestedProfileId !== currentProfileId) return;
    if (consumedCreateRequestRef.current === requestedCreateSignal) return;
    consumedCreateRequestRef.current = requestedCreateSignal;
    setView('plans');
    openCreatePlan();
    onRequestedCreateConsumed?.(requestedCreateSignal);
  }, [currentProfileId, isHydrated, onRequestedCreateConsumed, openCreatePlan, requestedCreateSignal, requestedProfileId]);

  const selectedDate = defaultDate
    ? parseLocalDateKey(defaultDate) || new Date()
    : new Date();

  const routinesByPlan = useMemo(
    () => new Map(
      dailyChecklistItems
        .map(item => [getHealthTargetFromLifeHubRecord(item), item] as const)
        .filter((entry): entry is [HealthLinkedTarget, DailyChecklistItem] => entry[0]?.section === 'health' && entry[0].type === 'workout-plan')
        .map(([target, item]) => [target.entityId, item] as const),
    ),
    [dailyChecklistItems],
  );

  const activePlans = workoutPlans.filter(plan => !plan.archived);
  const scheduledToday = activePlans
    .map(plan => ({ plan, routine: routinesByPlan.get(plan.id) }))
    .filter(item => item.routine && isRoutineDueForDate(item.routine, selectedDate));

  const history = [...(health.activityEntries || [])]
    .sort((a, b) => (parseLocalDateValue(b.date)?.getTime() || 0) - (parseLocalDateValue(a.date)?.getTime() || 0));

  const savePlan = ({ plan, schedule }: WorkoutPlanSaveDraft) => {
    const existingId = plan.id;
    const planId = existingId || addWorkoutPlan(plan);
    if (!planId) return;

    if (existingId) updateWorkoutPlan(existingId, plan);

    const linkedRoutine = routinesByPlan.get(planId);
    if (!schedule.enabled) {
      if (linkedRoutine) deleteDailyChecklistItem(linkedRoutine.id);
    } else {
      const routinePayload: Omit<DailyChecklistItem, 'id' | 'createdAt'> = {
        title: plan.name,
        category: 'wellness',
        frequency: schedule.frequency,
        weekdays:
          schedule.frequency === 'weekdays'
            ? schedule.weekdays.length ? schedule.weekdays : [1, 3, 5]
            : undefined,
        anchorDate: linkedRoutine?.anchorDate || new Date(),
        active: schedule.active,
        targetCount: 1,
        linkedSection: 'health',
        linkedView: 'workout',
        linkedEntityType: 'workout-plan',
        linkedEntityId: planId,
        linkedContext: { section: 'health', type: 'workout-plan', entityId: planId },
        scheduledTime: schedule.scheduledTime || undefined,
        reminderEnabled: schedule.reminderEnabled,
        reminderTime: schedule.reminderEnabled ? schedule.reminderTime : linkedRoutine?.reminderTime,
        reminderDays:
          schedule.frequency === 'weekdays'
            ? schedule.weekdays.length ? schedule.weekdays : [1, 3, 5]
            : undefined,
        completionCount: linkedRoutine?.completionCount || 0,
        completionHistory: linkedRoutine?.completionHistory || [],
        completedAt: linkedRoutine?.completedAt || null,
      };

      if (linkedRoutine) updateDailyChecklistItem(linkedRoutine.id, routinePayload);
      else addDailyChecklistItem(routinePayload);
    }

    setShowPlanModal(false);
    setEditingPlan(null);
    setView('plans');
  };

  const completeWorkout = () => {
    if (!completingPlan) return;
    const durationError = validateHealthNumber(completion.durationMinutes, { label: 'Duration', ...HEALTH_LIMITS.workoutDuration, allowBlank: true });
    const caloriesError = validateHealthNumber(completion.caloriesBurned, { label: 'Calories burned', ...HEALTH_LIMITS.workoutCalories, allowBlank: true });
    const notesError = validateHealthText(completion.notes, { label: 'Notes', maxLength: 500, mode: 'multiline' });
    setCompletionFieldErrors({ duration: durationError, calories: caloriesError, notes: notesError });
    if (durationError || caloriesError || notesError) {
      setCompletionError([durationError, caloriesError, notesError].filter((message): message is string => Boolean(message)).join(' '));
      return;
    }
    const routine = routinesByPlan.get(completingPlan.id);
    addActivityEntry({
      activity: completingPlan.name,
      workoutPlanId: completingPlan.id,
      linkedRoutineId: routine?.id,
      date: selectedDate,
      durationMinutes: completion.durationMinutes
        ? normalizeHealthNonNegative(completion.durationMinutes)
        : undefined,
      caloriesBurned: normalizeHealthNonNegative(completion.caloriesBurned),
      intensity: completion.intensity,
      notes: completion.notes.trim() || undefined,
    });

    setCompletingPlan(null);
    setCompletionError('');
    setView('history');
  };

  const tabs: Array<{ id: WorkoutView; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'plans', label: 'Plans' },
    { id: 'history', label: 'History' },
  ];

  return (
    <section className="rounded-[2rem] border border-border/50 bg-card/70 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Workout Planner</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Build reusable plans, schedule them through Life Hub, and keep completed sessions in Health.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onManualLog}>Manual Log</Button>
          <Button type="button" onClick={openCreatePlan}>
            <Plus className="mr-2 size-4" /> Create Plan
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 rounded-2xl border border-border/50 bg-background/45 p-1" role="group" aria-label="Legacy workout planner views">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={view === tab.id}
            onClick={() => setView(tab.id)}
            className={`min-h-11 rounded-xl px-3 py-2 text-sm font-black ${
              view === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === 'today' ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Scheduled" value={String(scheduledToday.length)} icon={CalendarDays} />
            <Stat
              label="Completed"
              value={String(scheduledToday.filter(item => item.routine && isRoutineDoneForDate(item.routine, selectedDate)).length)}
              icon={Check}
            />
            <Stat
              label="Total plans"
              value={String(activePlans.length)}
              icon={Repeat2}
            />
          </div>

          {scheduledToday.length === 0 ? (
            <Empty
              title="No workout scheduled"
              detail="Create a plan and choose Schedule in Life Hub. You can still start any plan manually."
              action={<Button type="button" onClick={() => setView('plans')}>Browse Plans</Button>}
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {scheduledToday.map(({ plan, routine }) => {
                const done = routine ? isRoutineDoneForDate(routine, selectedDate) : false;
                return (
                  <article key={plan.id} className="flex flex-col rounded-2xl border border-border/55 bg-background/45 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-primary">{done ? 'Completed' : 'Scheduled today'}</p>
                        <h3 className="mt-1 text-lg font-black">{plan.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{scheduleLabel(routine)}</p>
                      </div>
                      <span className={`grid size-10 place-items-center rounded-xl ${done ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'}`}>
                        {done ? <Check className="size-4" /> : <Clock3 className="size-4" />}
                      </span>
                    </div>
                    <PlanSummary plan={plan} />
                    <Button
                      type="button"
                      disabled={done}
                      onClick={() => startCompletion(plan)}
                      className="mt-4 w-full"
                    >
                      <Play className="mr-2 size-4" /> {done ? 'Workout Completed' : 'Complete Workout'}
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {view === 'plans' ? (
        <div className="mt-5">
          {activePlans.length === 0 ? (
            <Empty
              title="No workout plans"
              detail="Create a reusable plan once, then schedule or complete it whenever needed."
              action={<Button type="button" onClick={openCreatePlan}>Create First Plan</Button>}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activePlans.map(plan => {
                const routine = routinesByPlan.get(plan.id);
                return (
                  <article key={plan.id} className="rounded-2xl border border-border/55 bg-background/45 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <OverflowTooltip text={plan.name}><h3 className="truncate text-lg font-black">{plan.name}</h3></OverflowTooltip>
                        <p className="mt-1 text-xs text-muted-foreground">{scheduleLabel(routine)}</p>
                      </div>
                      {androidPresentation ? <HealthOverflowMenu
                        title={`${plan.name} actions`}
                        ariaLabel={`Actions for ${plan.name}`}
                        androidPresentation
                        actions={[
                          { label: 'Edit', icon: Pencil, onSelect: () => { setEditingPlan(plan); setShowPlanModal(true); } },
                          { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setPlanToDelete(plan) },
                        ]}
                      /> : <details className="relative">
                        <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-xl border border-border text-muted-foreground">
                          <MoreVertical className="size-4" />
                        </summary>
                        <div className="absolute right-0 top-11 z-20 w-40 rounded-xl border border-border bg-popover p-1 shadow-xl">
                          <button
                            type="button"
                            onClick={() => { setEditingPlan(plan); setShowPlanModal(true); }}
                            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold hover:bg-muted"
                          >
                            <Pencil className="size-4" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlanToDelete(plan)}
                            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="size-4" /> Delete
                          </button>
                        </div>
                      </details>}
                    </div>
                    {plan.description ? <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{plan.description}</p> : null}
                    <PlanSummary plan={plan} />
                    <HealthLifeHubContext
                      activity={deriveHealthLifeHubActivity({ type: 'workout-plan', entityId: plan.id }, context.dailyChecklistItems, context.productivityItems)}
                      targetLabel="Workout plan"
                      onOpenRoutine={routineId => window.dispatchEvent(new CustomEvent('life-manager:navigate', { detail: { section: 'lifehub', feature: 'routine', recordId: routineId } }))}
                      onOpenTask={taskId => window.dispatchEvent(new CustomEvent('life-manager:navigate', { detail: { section: 'lifehub', feature: 'tasks', recordId: taskId } }))}
                      onOpenLifeHub={() => window.dispatchEvent(new CustomEvent('life-manager:navigate', { detail: 'lifehub' }))}
                    />
                    <Button type="button" onClick={() => startCompletion(plan)} className="mt-4 w-full">
                      <Play className="mr-2 size-4" /> Start / Complete
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {view === 'history' ? (
        <div className="mt-5 space-y-3">
          {history.length === 0 ? (
            <Empty
              title="No workout history"
              detail="Completed plans and manual workout logs will appear here."
              action={<Button type="button" onClick={onManualLog}>Quick Add</Button>}
            />
          ) : history.map(entry => (
            <article key={entry.id} className="android-legacy-history-row flex flex-col gap-3 rounded-2xl border border-border/55 bg-background/45 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="font-black">{entry.activity}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(entry.date)}
                  {entry.durationMinutes ? ` · ${entry.durationMinutes} min` : ''}
                  {entry.caloriesBurned ? ` · ${entry.caloriesBurned} cal` : ''}
                </p>
                {entry.notes ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{entry.notes}</p> : null}
              </div>
              <div className="android-legacy-history-actions flex gap-2">
                {androidPresentation ? <>
                  <Tooltip><TooltipTrigger asChild><button type="button" className="android-compact-action-button" aria-label={`Edit ${entry.activity}`} onClick={() => onEditActivity(entry)}><Pencil className="size-4" aria-hidden="true" /></button></TooltipTrigger><TooltipContent>{"Edit activity"}</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild><button type="button" className="android-compact-action-button android-compact-action-button--destructive" aria-label={`Delete ${entry.activity}`} onClick={() => onDeleteActivity(entry)}><Trash2 className="size-4" aria-hidden="true" /></button></TooltipTrigger><TooltipContent>{"Delete activity"}</TooltipContent></Tooltip>
                </> : <>
                  <Button type="button" size="sm" variant="outline" onClick={() => onEditActivity(entry)}>Edit</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onDeleteActivity(entry)} className="text-red-500">Delete</Button>
                </>}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <WorkoutPlanModal
        isOpen={showPlanModal}
        androidPresentation={androidPresentation}
        plan={editingPlan}
        routine={editingPlan ? routinesByPlan.get(editingPlan.id) || null : null}
        onClose={() => { setShowPlanModal(false); setEditingPlan(null); }}
        onSave={savePlan}
      />

      <Dialog open={Boolean(completingPlan)} onOpenChange={open => !open && setCompletingPlan(null)}>
        <DialogContent allowOutsideDismiss={androidPresentation}>
          <DialogHeader>
            <DialogTitle>Complete {completingPlan?.name}</DialogTitle>
            <DialogDescription>Save the actual session. The linked Life Hub routine will be completed too.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold">Duration (minutes)</span>
              <input type="text" inputMode="numeric" value={completion.durationMinutes} onChange={event => { const result = guardHealthNumberChange(completion.durationMinutes, event.target.value, { label: 'Duration', ...HEALTH_LIMITS.workoutDuration, allowBlank: true, unit: 'minutes' }); if (!result.accepted) return setCompletionFieldErrors(current => ({ ...current, duration: result.error })); setCompletion(current => ({ ...current, durationMinutes: result.value })); setCompletionFieldErrors(current => ({ ...current, duration: result.error })); setCompletionError(''); }} onBlur={() => setCompletionFieldErrors(current => ({ ...current, duration: validateHealthNumber(completion.durationMinutes, { label: 'Duration', ...HEALTH_LIMITS.workoutDuration, allowBlank: true, unit: 'minutes' }) }))} placeholder="Optional" className="control-input health-number-input" aria-invalid={Boolean(completionFieldErrors.duration)} aria-describedby="completion-duration-error" />
              <div className="min-h-[20px] pt-0.5">{completionFieldErrors.duration ? <p id="completion-duration-error" role="alert" className="text-xs font-semibold text-destructive">{completionFieldErrors.duration}</p> : null}</div>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold">Calories burned</span>
              <input type="text" inputMode="numeric" value={completion.caloriesBurned} onChange={event => { const result = guardHealthNumberChange(completion.caloriesBurned, event.target.value, { label: 'Calories burned', ...HEALTH_LIMITS.workoutCalories, allowBlank: true, unit: 'kcal' }); if (!result.accepted) return setCompletionFieldErrors(current => ({ ...current, calories: result.error })); setCompletion(current => ({ ...current, caloriesBurned: result.value })); setCompletionFieldErrors(current => ({ ...current, calories: result.error })); setCompletionError(''); }} onBlur={() => setCompletionFieldErrors(current => ({ ...current, calories: validateHealthNumber(completion.caloriesBurned, { label: 'Calories burned', ...HEALTH_LIMITS.workoutCalories, allowBlank: true, unit: 'kcal' }) }))} placeholder="Optional" className="control-input health-number-input" aria-invalid={Boolean(completionFieldErrors.calories)} aria-describedby="completion-calories-error" />
              <div className="min-h-[20px] pt-0.5">{completionFieldErrors.calories ? <p id="completion-calories-error" role="alert" className="text-xs font-semibold text-destructive">{completionFieldErrors.calories}</p> : null}</div>
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-bold">Intensity</span>
              <Select value={completion.intensity} onValueChange={value => setCompletion(current => ({ ...current, intensity: value as ActivityIntensity }))}>
                <SelectTrigger className="control-input w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="vigorous">Vigorous</SelectItem></SelectContent>
              </Select>
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-bold">Notes</span>
              <textarea value={completion.notes} onChange={event => { const result = guardHealthTextChange(completion.notes, event.target.value, { label: 'Notes', maxLength: 500, mode: 'multiline' }); if (!result.accepted) return setCompletionFieldErrors(current => ({ ...current, notes: result.error })); setCompletion(current => ({ ...current, notes: result.value })); setCompletionFieldErrors(current => ({ ...current, notes: result.error })); setCompletionError(''); }} className="control-input min-h-20 py-3" aria-invalid={Boolean(completionFieldErrors.notes)} aria-describedby="completion-notes-error" />
              <div className="min-h-[20px] pt-0.5">{completionFieldErrors.notes ? <p id="completion-notes-error" role="alert" className="text-xs font-semibold text-destructive">{completionFieldErrors.notes}</p> : null}</div>
            </label>
          </div>
          {completionError ? <p className="text-sm font-semibold text-destructive" role="alert">{completionError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCompletingPlan(null)}>Cancel</Button>
            <Button type="button" onClick={completeWorkout}>Save Workout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(planToDelete)}
        title="Delete workout plan?"
        message={planToDelete ? `Delete “${planToDelete.name}” and its linked Life Hub routine? Completed workout history will remain.` : 'Delete this workout plan?'}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onCancel={() => setPlanToDelete(null)}
        onConfirm={() => {
          if (planToDelete) deleteWorkoutPlan(planToDelete.id);
          setPlanToDelete(null);
        }}
      />
    </section>
  );
}

function PlanSummary({ plan }: { plan: WorkoutPlan }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
      <div className="rounded-xl bg-muted/50 p-2"><strong className="block text-base">{plan.exercises.length}</strong> exercises</div>
      <div className="rounded-xl bg-muted/50 p-2"><strong className="block text-base">{plan.estimatedDurationMinutes || '—'}</strong> minutes</div>
      <div className="rounded-xl bg-muted/50 p-2"><strong className="block text-base">{plan.estimatedCalories || '—'}</strong> calories</div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof CalendarDays }) {
  return (
    <div className="rounded-2xl border border-border/55 bg-background/45 p-4">
      <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p><Icon className="size-4 text-primary" /></div>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-background/35 p-7 text-center">
      <Dumbbell className="mx-auto size-7 text-muted-foreground" />
      <h3 className="mt-3 font-black">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
