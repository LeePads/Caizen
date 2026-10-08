'use client';

import { useEffect, useMemo, useState } from 'react';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LifeHubLinkedContextSelector from '@/components/common/LifeHubLinkedContextSelector';
import {
  CancelButton,
  FormField,
  ModalFooter,
  SaveButton,
} from '@/components/common/FormPatterns';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import SleepTimePicker from '@/components/ui/sleep-time-picker';
import { ChevronDown } from 'lucide-react';
import type { BookItem, ChecklistFrequency, DailyChecklistItem, Game, HealthRoutineEvidence, LifeHubLinkedContext, MediaItem, RoutineGoal, RoutineGoalUnit, SkincareProduct, Supplement, TrashItem, UpcomingMoneyItem, WorkItem, WorkoutPlan, WorkoutRoutine } from '@/lib/types';
import { toLocalDateKey } from '@/lib/lifehub/date-utils';
import { getSkincareProductIdsFromLinkedContext, getSupplementIdsFromLinkedContext, resolveEffectiveLinkedLifeHubLink } from '@/lib/lifehub/linked-context';
import { formatLabel } from '@/lib/utils';
import type { RoutineTemplatePreset } from '@/lib/lifehub/routine-templates';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export type LifeHubRoutineDraft = {
  title: string;
  category: string;
  frequency: ChecklistFrequency;
  weekday?: string;
  weekdays?: number[];
  intervalDays?: number;
  anchorDate?: string;
  dayOfMonth?: number;
  active: boolean;
  scheduledTime?: string;
  reminderEnabled: boolean;
  reminderTime?: string;
  reminderDays?: number[];
  linkedSection?: string;
  linkedView?: string;
  linkedGameId?: string;
  linkedContext?: LifeHubLinkedContext;
  healthRoutineEvidence?: HealthRoutineEvidence;
  goal?: RoutineGoal;
};

type Props = {
  isOpen: boolean;
  item?: DailyChecklistItem | null;
  template?: RoutineTemplatePreset | null;
  games: Game[];
  mediaItems?: MediaItem[];
  books?: BookItem[];
  supplements: Supplement[];
  skincareProducts: SkincareProduct[];
  workItems: WorkItem[];
  upcomingMoneyItems?: UpcomingMoneyItem[];
  workoutPlans?: WorkoutPlan[];
  workoutRoutines?: WorkoutRoutine[];
  trashItems?: TrashItem[];
  androidPresentation?: boolean;
  onSave: (draft: LifeHubRoutineDraft) => void;
  onClose: () => void;
};

const WEEKDAYS = [
  { value: 1, short: 'M', label: 'Monday' },
  { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' },
  { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' },
  { value: 6, short: 'S', label: 'Saturday' },
  { value: 0, short: 'S', label: 'Sunday' },
];

const CATEGORIES = [
  'chores',
  'wellness',
  'tracking',
  'finance',
  'personal',
  'games',
];

const LINKED_SECTIONS = [
  { value: '', label: 'No linked section' },
  { value: 'health', label: 'Health' },
  { value: 'balance', label: 'Money' },
  { value: 'skincare', label: 'Skincare' },
  { value: 'supplements', label: 'Supplements' },
  { value: 'journal', label: 'Journal' },
  { value: 'workhub', label: 'Work Hub' },
];

export default function LifeHubRoutineModal({ isOpen, item, template, games, mediaItems = [], books = [], supplements, skincareProducts, workItems, upcomingMoneyItems = [], workoutPlans = [], workoutRoutines = [], trashItems = [], androidPresentation = false, onSave, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('personal');
  const [frequency, setFrequency] = useState<ChecklistFrequency>('daily');
  const [specificWeekday, setSpecificWeekday] = useState('monday');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [intervalDays, setIntervalDays] = useState('3');
  const [anchorDate, setAnchorDate] = useState(toLocalDateKey(new Date()));
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [active, setActive] = useState(true);
  const [scheduledTime, setScheduledTime] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('08:00');
  const [linkedSection, setLinkedSection] = useState('');
  const [linkedView, setLinkedView] = useState('');
  const [linkedContext, setLinkedContext] = useState<LifeHubLinkedContext | undefined>();
  const [healthRoutineEvidence, setHealthRoutineEvidence] = useState<HealthRoutineEvidence | undefined>();
  const [goalEnabled, setGoalEnabled] = useState(false);
  const [goalTarget, setGoalTarget] = useState('1');
  const [goalUnit, setGoalUnit] = useState<RoutineGoalUnit>('times');
  const [goalCustomUnit, setGoalCustomUnit] = useState('');
  const [linkedGameId, setLinkedGameId] = useState('');
  const [linkChanged, setLinkChanged] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const effectiveLink = item ? resolveEffectiveLinkedLifeHubLink(item) : { kind: 'none' as const };
    const legacyWeekdayIndex = item?.weekday
      ? ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(item.weekday)
      : -1;
    const nextEvidence = item?.healthRoutineEvidence;
    const next = {
      title: item?.title || (template?.id === 'custom' ? '' : template?.title) || '',
      category: item?.category || template?.category || 'personal',
      frequency: item?.frequency || template?.frequency || 'daily',
      specificWeekday: item?.weekday || 'monday',
      weekdays:
        item?.weekdays?.length
          ? item.weekdays
          : item?.reminderDays?.length
            ? item.reminderDays
            : legacyWeekdayIndex >= 0
              ? [legacyWeekdayIndex]
              : [1, 2, 3, 4, 5],
      intervalDays: String(item?.intervalDays || 3),
      anchorDate: item?.anchorDate ? toLocalDateKey(item.anchorDate) : toLocalDateKey(item?.createdAt || new Date()),
      dayOfMonth: String(item?.dayOfMonth || new Date(item?.anchorDate || item?.createdAt || new Date()).getDate()),
      active: item?.active !== false,
      scheduledTime: item?.scheduledTime || '',
      reminderEnabled: Boolean(item?.reminderEnabled),
      reminderTime: item?.reminderTime || (item?.reminderEnabled ? item?.scheduledTime : undefined) || '08:00',
      linkedSection: item?.linkedSection || template?.linkedSection || '',
      linkedView: item?.linkedView || template?.linkedView || '',
      linkedContext: effectiveLink.kind === 'context' ? effectiveLink.context : template?.linkedContext,
      healthRoutineEvidence: nextEvidence || template?.healthRoutineEvidence,
      goal: item?.goal,
    };
    setTitle(next.title);
    setCategory(next.category);
    setFrequency(next.frequency);
    setSpecificWeekday(next.specificWeekday);
    setWeekdays(next.weekdays);
    setIntervalDays(next.intervalDays);
    setAnchorDate(next.anchorDate);
    setDayOfMonth(next.dayOfMonth);
    setActive(next.active);
    setScheduledTime(next.scheduledTime);
    setReminderEnabled(next.reminderEnabled);
    setReminderTime(next.reminderTime);
    setLinkedSection(next.linkedSection);
    setLinkedView(next.linkedView);
    setLinkedContext(next.linkedContext);
    setHealthRoutineEvidence(next.healthRoutineEvidence);
    setGoalEnabled(Boolean(next.goal));
    setGoalTarget(String(next.goal?.target ?? 1));
    setGoalUnit(next.goal?.unit || 'times');
    setGoalCustomUnit(next.goal?.customUnit || '');
    setLinkedGameId(next.linkedContext?.section === 'games' ? next.linkedContext.entityId : '');
    setLinkChanged(false);
    setShowAdvanced(Boolean(next.linkedSection || next.linkedView || next.linkedContext));
    setShowEvidence(Boolean(next.healthRoutineEvidence));
    setInitialSnapshot(JSON.stringify({
      title: next.title,
      category: next.category,
      frequency: next.frequency,
      specificWeekday: next.specificWeekday,
      weekdays: next.weekdays,
      intervalDays: next.intervalDays,
      anchorDate: next.anchorDate,
      dayOfMonth: next.dayOfMonth,
      active: next.active,
      scheduledTime: next.scheduledTime,
      reminderEnabled: next.reminderEnabled,
      reminderTime: next.reminderTime,
      linkedSection: next.linkedSection,
      linkedView: next.linkedView,
      linkedContext: next.linkedContext,
      healthRoutineEvidence: next.healthRoutineEvidence,
      goalEnabled: Boolean(next.goal),
      goalTarget: String(next.goal?.target ?? 1),
      goalUnit: next.goal?.unit || 'times',
      goalCustomUnit: next.goal?.customUnit || '',
    }));
    setShowUnsaved(false);
    setError('');
  }, [isOpen, item, template]);

  const currentSnapshot = useMemo(
    () => JSON.stringify({
      title,
      category,
      frequency,
      specificWeekday,
      weekdays,
      intervalDays,
      anchorDate,
      dayOfMonth,
      active,
      scheduledTime,
      reminderEnabled,
      reminderTime,
      linkedSection,
      linkedView,
      linkedContext,
      healthRoutineEvidence,
      goalEnabled,
      goalTarget,
      goalUnit,
      goalCustomUnit,
    }),
    [active, anchorDate, category, dayOfMonth, frequency, goalCustomUnit, goalEnabled, goalTarget, goalUnit, healthRoutineEvidence, intervalDays, linkedContext, linkedSection, linkedView, reminderEnabled, reminderTime, scheduledTime, specificWeekday, title, weekdays],
  );

  const canClose = () => {
    if (initialSnapshot && currentSnapshot !== initialSnapshot) {
      setShowUnsaved(true);
      return false;
    }
    return true;
  };

  const requestClose = () => {
    if (canClose()) onClose();
  };

  const toggleWeekday = (value: number) => {
    setWeekdays(current =>
      current.includes(value)
        ? current.filter(day => day !== value)
        : [...current, value].sort((a, b) => a - b),
    );
  };

  const submit = () => {
    setError('');
    if (!title.trim()) {
      setError('Enter a routine name before saving.');
      return;
    }
    if (frequency === 'weekdays' && weekdays.length === 0) {
      setError('Choose at least one weekday.');
      return;
    }
    const parsedGoalTarget = Number(goalTarget);
    if (goalEnabled && (!Number.isFinite(parsedGoalTarget) || parsedGoalTarget <= 0)) {
      setError('Enter a goal target greater than zero.');
      return;
    }
    if (goalEnabled && goalUnit === 'custom' && !goalCustomUnit.trim()) {
      setError('Enter a name for the custom goal unit.');
      return;
    }
    const interval = Math.max(1, Number(intervalDays || 1));
    const monthDay = Math.max(1, Math.min(31, Number(dayOfMonth || 1)));
    onSave({
      title: title.trim(),
      category,
      frequency,
      weekday: frequency === 'specific_weekday' ? specificWeekday : undefined,
      weekdays: frequency === 'weekdays' ? weekdays : undefined,
      intervalDays: frequency === 'every_x_days' ? interval : undefined,
      anchorDate,
      dayOfMonth: frequency === 'monthly' ? monthDay : undefined,
      active,
      scheduledTime: scheduledTime || undefined,
      reminderEnabled,
      reminderTime: reminderEnabled ? reminderTime : item?.reminderTime,
      reminderDays:
        reminderEnabled && (frequency === 'weekdays' || frequency === 'daily')
          ? frequency === 'daily'
            ? [0, 1, 2, 3, 4, 5, 6]
            : weekdays
          : undefined,
      linkedSection: linkChanged ? undefined : linkedSection || undefined,
      linkedView: linkChanged ? undefined : linkedView.trim() || undefined,
      linkedGameId: linkedContext?.section === 'games' ? linkedContext.entityId : undefined,
      linkedContext,
      healthRoutineEvidence,
      goal: goalEnabled ? {
        target: parsedGoalTarget,
        unit: goalUnit,
        ...(goalUnit === 'custom' ? { customUnit: goalCustomUnit.trim() } : {}),
      } : undefined,
    });
  };

  const existingLink = item ? resolveEffectiveLinkedLifeHubLink(item) : { kind: 'none' as const };
  const hasRoutineHistory = Boolean(item?.completionHistory?.length || item?.completionCount || item?.completedAt);
  const linkedGame = linkedGameId ? games.find(game => game.id === linkedGameId) : undefined;
  const selectableGames = games.filter(game => !game.hidden || game.id === linkedGameId);
  const hasCustomWorkoutRoutine = workoutRoutines.some(routine => routine.source === 'custom');
  const evidenceMode = healthRoutineEvidence?.mode || 'none';
  const evidenceScope = healthRoutineEvidence &&
    (healthRoutineEvidence.mode === 'workout-completed' || healthRoutineEvidence.mode === 'stretch-completed')
    ? healthRoutineEvidence.scope
    : 'any';
  const hasLinkedCustomWorkoutRoutine = linkedContext?.section === 'health' &&
    linkedContext.type === 'workout-routine' &&
    workoutRoutines.some(routine => routine.source === 'custom' && routine.id === linkedContext.entityId);
  const linkedWorkoutScopeInactive = evidenceScope === 'linked-workout-routine' && !hasLinkedCustomWorkoutRoutine;
  const hasConfiguredHealthEvidence = Boolean(healthRoutineEvidence);
  const hasHealthEvidenceTemplate = Boolean(template?.healthRoutineEvidence);
  const hasSupportedHealthLegacyContext = linkedSection === 'health' && ['sleep', 'food', 'workout'].includes(linkedView.trim().toLowerCase());
  const hasSupportedHealthCanonicalContext = linkedContext?.section === 'health' && (
    linkedContext.type === 'workout-plan' || linkedContext.type === 'workout-routine'
  );
  const showAutomaticCompletion = hasConfiguredHealthEvidence || hasHealthEvidenceTemplate || hasSupportedHealthLegacyContext || hasSupportedHealthCanonicalContext;
  const connectionsSummary = (() => {
    if (!linkedContext) {
      if (linkedSection) return `Legacy · ${formatLabel(linkedSection)}${linkedView ? ` · ${formatLabel(linkedView)}` : ''}`;
      return 'None';
    }
    if (linkedContext.section === 'games') {
      return linkedGame ? `Games · ${linkedGame.title}${linkedGame.hidden ? ' · Archived' : ''}` : 'Games · Unavailable';
    }
    if (linkedContext.section === 'supplements') {
      const names = getSupplementIdsFromLinkedContext(linkedContext)
        .map(id => supplements.find(supplement => supplement.id === id)?.name)
        .filter((name): name is string => Boolean(name));
      return names.length > 1 ? `Supplements · ${names.length} supplements linked` : names[0] ? `Supplements · ${names[0]}` : 'Supplements · Unavailable';
    }
    if (linkedContext.section === 'skincare') {
      const names = getSkincareProductIdsFromLinkedContext(linkedContext)
        .map(id => skincareProducts.find(product => product.id === id)?.name)
        .filter((name): name is string => Boolean(name));
      return names.length > 1 ? `Skincare · ${names.length} products linked` : names[0] ? `Skincare · ${names[0]}` : 'Skincare · Unavailable';
    }
    if (linkedContext.section === 'health') {
      const target = linkedContext.type === 'workout-plan'
        ? workoutPlans.find(plan => plan.id === linkedContext.entityId)
        : workoutRoutines.find(routine => routine.id === linkedContext.entityId);
      return target ? `Health · ${target.name}` : `Health · ${formatLabel(linkedContext.type)}`;
    }
    if (linkedContext.section === 'work') {
      const target = workItems.find(workItem => workItem.id === linkedContext.entityId);
      return target ? `Work · ${target.title}` : 'Work · Unavailable';
    }
    if (linkedContext.section === 'balance') {
      const target = upcomingMoneyItems.find(moneyItem => moneyItem.id === linkedContext.entityId);
      return target ? `Balance · ${target.title}` : 'Balance · Unavailable';
    }
    if (linkedContext.section === 'entertainment') {
      const target = linkedContext.type === 'book'
        ? books.find(book => book.id === linkedContext.entityId)
        : mediaItems.find(media => media.id === linkedContext.entityId);
      const trash = trashItems.find(entry =>
        entry.itemId === linkedContext.entityId &&
        (linkedContext.type === 'book' ? entry.source === 'books' : entry.source === 'mediaItems'),
      );
      const trashTitle = (trash?.data as { title?: unknown } | undefined)?.title;
      const title = target?.title || (typeof trashTitle === 'string' ? trashTitle : undefined);
      return `${linkedContext.type === 'book' ? 'Book' : 'Media'} · ${title || 'Unavailable'}${trash ? ' · In Trash' : ''}`;
    }
    return 'Journal';
  })();
  const evidenceSummary = (() => {
    switch (healthRoutineEvidence?.mode) {
      case 'sleep-tracked':
        return 'Sleep tracked';
      case 'meal-tracked':
        return `Meal tracked · ${formatLabel(healthRoutineEvidence.meal)}`;
      case 'meals-complete':
        return 'Meals complete';
      case 'workout-completed':
        return `Workout completed${healthRoutineEvidence.scope === 'linked-workout-routine' ? ' · Linked routine' : ''}`;
      case 'stretch-completed':
        return `Stretch completed${healthRoutineEvidence.scope === 'linked-workout-routine' ? ' · Linked routine' : ''}`;
      case 'weight-logged':
        return 'Weight logged';
      case 'fast-completed':
        return 'Fast completed';
      case 'water-target-reached':
        return 'Water target reached';
      default:
        return 'No rule';
    }
  })();

  if (!isOpen) return null;

  return (
    <>
      <CaizenFormDialog
        eyebrow={item ? 'Edit routine' : 'Create routine'}
        title={item ? 'Update routine' : 'Create routine'}
        onClose={onClose}
        onBeforeClose={canClose}
        panelClassName={androidPresentation ? 'android-lifehub-modal' : undefined}
        footer={(
          <ModalFooter>
            <CancelButton onClick={requestClose} />
            <SaveButton onClick={submit}>{item ? 'Save changes' : 'Create routine'}</SaveButton>
          </ModalFooter>
        )}
      >
        <div className="space-y-5">
          <div>
            <p className="text-sm font-black">Basics</p>
            <p className="mt-1 text-xs text-muted-foreground">Set the routine&apos;s name, schedule, and active state.</p>
          </div>

          <FormField label="Routine name" error={error} required>
            <Input
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="Example: Sunday budget review"
              autoFocus
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Schedule">
              <AndroidAdaptiveSelect
                label="Schedule"
                value={frequency}
                onChange={value => setFrequency(value as ChecklistFrequency)}
                options={[
                  { value: 'daily', label: 'Every day' },
                  { value: 'weekdays', label: 'Selected weekdays' },
                  { value: 'weekly', label: 'Once each week' },
                  { value: 'biweekly', label: 'Every two weeks' },
                  { value: 'monthly', label: 'Once each month' },
                  { value: 'every_x_days', label: 'Every X days' },
                    ...(item?.frequency === 'specific_weekday'
                      ? [{ value: 'specific_weekday', label: 'Specific weekday (legacy schedule)' }]
                      : []),
                ]}
                className="control-input"
              />
            </FormField>

            <FormField label="Category">
              <AndroidAdaptiveSelect
                label="Category"
                value={category}
                onChange={setCategory}
                options={CATEGORIES.map(value => ({ value, label: formatLabel(value) }))}
                className="control-input"
              />
            </FormField>
          </div>

          {frequency === 'weekdays' ? (
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Days</p>
              <div className="mt-2 grid grid-cols-7 gap-2">
                {WEEKDAYS.map(day => (
                  <Tooltip key={day.value}><TooltipTrigger asChild><button aria-label={day.label}
                    type="button"
                    onClick={() => toggleWeekday(day.value)}
                    aria-pressed={weekdays.includes(day.value)}
                    className={`aspect-square rounded-xl border text-xs font-black transition-colors ${
                      weekdays.includes(day.value)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/60 bg-background/50 text-muted-foreground hover:border-primary/35'
                    }`}
                  >
                    {day.short}
                  </button></TooltipTrigger><TooltipContent>{day.label}</TooltipContent></Tooltip>
                ))}
              </div>
            </div>
          ) : null}

          {frequency === 'specific_weekday' ? (
            <FormField label="Weekday">
              <AndroidAdaptiveSelect
                label="Specific weekday"
                value={specificWeekday}
                onChange={value => setSpecificWeekday(value)}
                className="control-input"
                options={WEEKDAYS.map(day => ({ value: day.label.toLowerCase(), label: day.label }))}
              />
            </FormField>
          ) : null}

          {frequency === 'every_x_days' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Repeat every">
                {({ id, describedBy, invalid, required }) => (
                  <div className="relative">
                    <Input
                      id={id}
                      type="number"
                      min="1"
                      max="365"
                      value={intervalDays}
                      onChange={event => setIntervalDays(event.target.value)}
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                      aria-required={required || undefined}
                      className="pr-20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">days</span>
                  </div>
                )}
              </FormField>
              <FormField label="Start schedule on">
                <AdaptiveDatePicker label="Starts from" value={anchorDate} onChange={setAnchorDate} className="control-input" />
              </FormField>
            </div>
          ) : null}

          {frequency === 'biweekly' ? (
            <FormField label="Anchor week">
              <AdaptiveDatePicker label="Starts from" value={anchorDate} onChange={setAnchorDate} className="control-input" />
            </FormField>
          ) : null}

          {frequency === 'monthly' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Day of month">
                <Input type="number" min="1" max="31" value={dayOfMonth} onChange={event => setDayOfMonth(event.target.value)} />
              </FormField>
              <FormField label="Anchor month">
                <AdaptiveDatePicker label="Starts from" value={anchorDate} onChange={setAnchorDate} className="control-input" />
              </FormField>
            </div>
          ) : null}

          <section className="rounded-2xl border border-border/60 bg-background/35 p-3 sm:p-4">
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-black">Measurable goal</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Track a quantity for each {frequency === 'daily' || frequency === 'weekdays' || frequency === 'specific_weekday' ? 'scheduled day' : frequency === 'weekly' || frequency === 'biweekly' ? 'schedule period' : frequency === 'monthly' ? 'month' : 'interval'}.</span>
              </span>
              <Switch checked={goalEnabled} onCheckedChange={setGoalEnabled} aria-label="Enable measurable routine goal" />
            </label>
            {goalEnabled ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <FormField label="Target quantity" required>
                  <Input type="number" min="0.01" step="any" inputMode="decimal" value={goalTarget} onChange={event => setGoalTarget(event.target.value)} />
                </FormField>
                <FormField label="Unit">
                  <AndroidAdaptiveSelect
                    label="Goal unit"
                    value={goalUnit}
                    onChange={value => setGoalUnit(value as RoutineGoalUnit)}
                    className="control-input"
                    options={[
                      { value: 'times', label: 'times' }, { value: 'episodes', label: 'episodes' },
                      { value: 'chapters', label: 'chapters' }, { value: 'pages', label: 'pages' },
                      { value: 'minutes', label: 'minutes' }, { value: 'hours', label: 'hours' },
                      { value: 'km', label: 'km' }, { value: 'glasses', label: 'glasses' },
                      { value: 'items', label: 'items' }, { value: 'custom', label: 'Custom unit' },
                    ]}
                  />
                </FormField>
                {goalUnit === 'custom' ? (
                  <FormField label="Custom unit" required>
                    <Input value={goalCustomUnit} onChange={event => setGoalCustomUnit(event.target.value)} maxLength={32} placeholder="Example: practice rounds" />
                  </FormField>
                ) : null}
                <p className="text-xs text-muted-foreground sm:col-span-2">Progress resets with this routine&apos;s existing schedule. Saved occurrence targets stay unchanged when you edit this goal later.</p>
              </div>
            ) : null}
          </section>

          <div className={`grid gap-3 border-y border-border/50 py-3 ${androidPresentation ? 'sm:grid-cols-2' : ''}`}>
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-black">Routine active</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Pause without deleting history.</span>
              </span>
              <Switch checked={active} onCheckedChange={setActive} aria-label="Routine active" />
            </label>
            {androidPresentation ? (
              <label className="flex min-h-11 items-center justify-between gap-3">
                <span>
                  <span className="block text-sm font-black">Reminder</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">Notify on scheduled days.</span>
                </span>
                <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} aria-label="Routine reminder" />
              </label>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-black">Planned time</span>
              <SleepTimePicker
                label="Planned time"
                value={scheduledTime}
                onChange={setScheduledTime}
                className="control-input"
                ariaDescribedBy="lifehub-routine-planned-time-help"
              />
              <span id="lifehub-routine-planned-time-help" className="text-xs text-muted-foreground">Optional. Used for Today ordering and Calendar.</span>
            </label>
            {androidPresentation && reminderEnabled ? (
              <div>
                <SleepTimePicker
                  label="Notification time"
                  value={reminderTime}
                  onChange={setReminderTime}
                  className="control-input"
                />
                <p className="mt-1 text-xs text-muted-foreground">Used only for the Android notification.</p>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(current => !current)}
            aria-expanded={showAdvanced}
            aria-controls="lifehub-routine-connections"
            className="flex min-h-11 w-full items-center justify-between gap-3 border-y border-border/50 py-3 text-left text-sm font-black text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <span>
              <span className="block">Connections</span>
              <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">{connectionsSummary}</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showAdvanced ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {showAdvanced ? (
            <div id="lifehub-routine-connections" role="region" aria-label="Routine connections" className="grid gap-4 border-b border-border/50 pb-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <LifeHubLinkedContextSelector
                  value={linkedContext}
                  games={games}
                  mediaItems={mediaItems}
                  books={books}
                  supplements={supplements}
                  skincareProducts={skincareProducts}
                  workItems={workItems}
                  upcomingMoneyItems={upcomingMoneyItems}
                  workoutPlans={workoutPlans}
                  workoutRoutines={workoutRoutines}
                  trashItems={trashItems}
                  allowMultiple
                  onChange={next => {
                    setLinkedContext(next);
                    setLinkedGameId(next?.section === 'games' ? next.entityId : '');
                    setLinkChanged(true);
                  }}
                />
                {linkChanged && hasRoutineHistory && existingLink.kind === 'context' ? (
                  <p className="mt-3 text-xs font-semibold text-amber-600 dark:text-amber-300">Changing the linked section will keep this routine&apos;s existing history, but attribute future activity to the new link.</p>
                ) : null}
              </div>
              <div className="hidden">
              <FormField label="Related game">
                <AndroidAdaptiveSelect
                  label="Related game"
                  value={linkedGameId}
                  onChange={setLinkedGameId}
                  className="control-input"
                  searchable={selectableGames.length > 8}
                  options={[
                    { value: '', label: 'No related game' },
                    ...selectableGames.map(game => ({
                      value: game.id,
                      label: `${game.title}${game.hidden ? ' · Archived' : ''}`,
                    })),
                  ]}
                />
                {linkedGame?.hidden ? <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">This game is archived. It remains linked, but is not offered for new links.</p> : null}
                {item?.linkedGameId && item.linkedGameId !== linkedGameId && (item.completionHistory?.length || item.completionCount || item.completedAt) ? (
                  <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">Changing the game will attribute this routine’s existing history to the new game.</p>
                ) : null}
              </FormField>
              <FormField label="Open section">
                <AndroidAdaptiveSelect
                  label="Open section"
                  value={linkedSection}
                  onChange={setLinkedSection}
                  options={LINKED_SECTIONS}
                  className="control-input"
                />
              </FormField>
              <FormField label="Optional view">
                <Input value={linkedView} onChange={event => setLinkedView(event.target.value)} placeholder="Example: food" />
              </FormField>
              </div>
            </div>
          ) : null}

          {showAutomaticCompletion ? (
            <>
              <button
                type="button"
                onClick={() => setShowEvidence(current => !current)}
                aria-expanded={showEvidence}
                aria-controls="lifehub-routine-automatic-completion"
                className="flex min-h-11 w-full items-center justify-between gap-3 border-y border-border/50 py-3 text-left text-sm font-black text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <span>
                  <span className="block">Automatic completion</span>
                  <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">{evidenceSummary}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showEvidence ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>

              {showEvidence ? (
            <div id="lifehub-routine-automatic-completion" role="region" aria-label="Automatic completion settings" className="grid gap-4 border-b border-border/50 pb-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="text-sm font-black">Health evidence</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Opt in to one clear Health event. Backfilled history and changes that do not log evidence will not complete the routine.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-muted-foreground">Evidence rule</label>
                <AndroidAdaptiveSelect
                  label="Health evidence rule"
                  value={evidenceMode}
                  onChange={nextMode => {
                    if (nextMode === 'none') return setHealthRoutineEvidence(undefined);
                    if (nextMode === 'sleep-tracked' || nextMode === 'meals-complete') {
                      return setHealthRoutineEvidence({ mode: nextMode });
                    }
                    if (nextMode === 'weight-logged' || nextMode === 'fast-completed' || nextMode === 'water-target-reached') {
                      return setHealthRoutineEvidence({ mode: nextMode });
                    }
                    if (nextMode === 'meal-tracked') return setHealthRoutineEvidence({ mode: nextMode, meal: 'breakfast' });
                    if (nextMode === 'workout-completed' || nextMode === 'stretch-completed') {
                      return setHealthRoutineEvidence({ mode: nextMode, scope: 'any' });
                    }
                  }}
                  className="control-input"
                  options={[
                    { value: 'none', label: 'No Health evidence' },
                    { value: 'sleep-tracked', label: 'Sleep tracked' },
                    { value: 'meal-tracked', label: 'Meal tracked' },
                    { value: 'meals-complete', label: 'Meals complete' },
                    { value: 'workout-completed', label: 'Workout completed' },
                    { value: 'stretch-completed', label: 'Stretch completed' },
                    { value: 'weight-logged', label: 'Weight logged' },
                    { value: 'fast-completed', label: 'Fast completed' },
                    { value: 'water-target-reached', label: 'Water target reached' },
                  ]}
                />
              </div>

              {healthRoutineEvidence?.mode === 'meal-tracked' ? (
                <div>
                  <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-muted-foreground">Meal</label>
                  <AndroidAdaptiveSelect
                    label="Meal evidence"
                    value={healthRoutineEvidence.meal}
                    onChange={meal => {
                      if (meal === 'breakfast' || meal === 'lunch' || meal === 'dinner') {
                        setHealthRoutineEvidence({ mode: 'meal-tracked', meal });
                      }
                    }}
                    className="control-input"
                    options={[
                      { value: 'breakfast', label: 'Breakfast' },
                      { value: 'lunch', label: 'Lunch' },
                      { value: 'dinner', label: 'Dinner' },
                    ]}
                  />
                </div>
              ) : null}

              {healthRoutineEvidence?.mode === 'workout-completed' || healthRoutineEvidence?.mode === 'stretch-completed' ? (
                <div>
                  <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-muted-foreground">Workout scope</label>
                  <AndroidAdaptiveSelect
                    label="Workout evidence scope"
                    value={evidenceScope}
                    onChange={scope => {
                      if (scope !== 'any' && scope !== 'linked-workout-routine') return;
                      if (scope === 'linked-workout-routine' && !hasCustomWorkoutRoutine) return;
                      setHealthRoutineEvidence({ mode: healthRoutineEvidence.mode, scope });
                    }}
                    className="control-input"
                    options={[
                      { value: 'any', label: 'Any completed session' },
                      ...(hasCustomWorkoutRoutine || evidenceScope === 'linked-workout-routine'
                        ? [{ value: 'linked-workout-routine', label: hasLinkedCustomWorkoutRoutine ? 'Linked custom routine' : 'Linked custom routine (unavailable)' }]
                        : []),
                    ]}
                  />
                  {linkedWorkoutScopeInactive ? (
                    <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300" role="status">Linked custom routine scope is inactive. Link this routine to a custom WorkoutRoutine, choose Any, or choose No Health evidence to clear it.</p>
                  ) : !hasCustomWorkoutRoutine ? <p className="mt-1 text-xs font-semibold text-muted-foreground">Link a custom WorkoutRoutine to enable linked-routine scope.</p> : null}
                </div>
              ) : null}
            </div>
              ) : null}
            </>
          ) : null}

        </div>
      </CaizenFormDialog>

      <ConfirmDialog
        isOpen={showUnsaved}
        title="Discard routine changes?"
        message="You have unsaved routine inputs. Close without saving?"
        confirmText="Discard"
        cancelText="Keep Editing"
        isDangerous
        onCancel={() => setShowUnsaved(false)}
        onConfirm={() => {
          setShowUnsaved(false);
          onClose();
        }}
      />
    </>
  );
}
