'use client';

import {
  Archive,
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  Inbox,
  Lightbulb,
  Link2,
  ListChecks,
  MoreVertical,
  Music,
  Pencil,
  Pin,
  Plus,
  Repeat2,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import ConfirmDialog from '@/components/common/ConfirmDialog';
import LifeHubDateModal, { type LifeHubDateDraft } from '@/components/modals/LifeHubDateModal';
import LifeHubDayPlannerModal from '@/components/modals/LifeHubDayPlannerModal';
import LifeHubRoutineModal, { type LifeHubRoutineDraft } from '@/components/modals/LifeHubRoutineModal';
import SkincareRoutineCompletionModal from '@/components/modals/SkincareRoutineCompletionModal';
import SupplementRoutineCompletionModal from '@/components/modals/SupplementRoutineCompletionModal';
import LifeHubTaskModal, { type LifeHubTaskDraft } from '@/components/modals/LifeHubTaskModal';
import LifeHubActivityWorkspace, { type ActivityView } from '@/components/lifehub/LifeHubActivityWorkspace';
import LifeHubTodayView, { type TodayFocusPin } from '@/components/lifehub/LifeHubTodayView';
import JournalSection from '@/components/sections/JournalSection';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import { AndroidMonthGrid } from '@/components/native/AndroidMonthGrid';
import { AndroidAdaptiveSelect, CaizenBottomSheet } from '@/components/native/android-design';
import { HealthOverflowMenu } from '@/components/health/HealthOverflowMenu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CaizenFormDialog, Toolbar } from '@/components/ui/section-kit';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterBar, FilterChip, SegmentedControl } from '@/components/ui/collection-controls';
import { SearchField } from '@/components/ui/search-field';
import {
  CALENDAR_WORK_STATUSES,
  getCalendarWorkStatus,
  isCalendarWorkStatus,
  type CalendarWorkStatus,
} from '@/lib/calendar-work-status';
import {
  buildLifeHubCalendarEvents,
  eventsForDay,
  getAgendaGroups,
  isActionableCalendarDate,
  type CalendarSourceKey,
  type LifeHubCalendarEvent,
} from '@/lib/lifehub/calendar-events';
import type { DerivedActivityEntry } from '@/lib/lifehub/activity-timeline';
import {
  addLocalDays,
  daysFromToday,
  formatDate,
  formatRelativeDate,
  getMonthGrid,
  nextMonday,
  parseLocalDateKey,
  resolveCalendarDaySelection,
  startOfLocalDay,
  toLocalDateKey,
} from '@/lib/lifehub/date-utils';
import {
  getRoutineAttentionSummary,
  getRoutineCompletionCount,
  getRoutinePeriodSummary,
  getRoutinePeriodWindow,
  getRoutinePeriodGuidance,
  getRoutineOccurrence,
  getRoutineScheduleIndicator,
  getRoutineStatusForDate,
  getRoutineUrgencyState,
  isRoutineDoneForDate,
  routineMatchesFilter,
  shiftRoutinePeriodDate,
  type RoutineFilter,
} from '@/lib/lifehub/routine-schedule';
import { getRoutineProgressForDate, routineGoalUnitLabel } from '@/lib/lifehub/progress-history';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { isNativeApp } from '@/lib/platform';
import { useAppContext } from '@/lib/context';
import { mediaStorage } from '@/lib/storage/media-storage';
import { processPendingMediaCleanup, queueMediaCleanup } from '@/lib/storage/media-cleanup';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import { getMusicPlaybackCapabilities, useMusicPlayer } from '@/lib/music-player';
import { getMusicLinkIdentity } from '@/lib/music-links';
import {
  compareRoutinePlannedTime,
  deriveLifeHubTodaySummary,
  isLifeHubRoutinePlannedToday,
  isOpenLifeHubTask,
} from '@/lib/lifehub/today-summary';
import {
  getGameIdFromLifeHubRecord,
  getUpcomingMoneyIdFromLifeHubRecord,
  getHealthTargetFromLifeHubRecord,
  getLifeHubLinkedContextNavigationDetail,
  getLifeHubLinkedContextLabel,
  getSkincareProductIdsFromLifeHubRecord,
  getSupplementIdsFromLifeHubRecord,
  getWorkItemIdFromLifeHubRecord,
  resolveEffectiveLinkedLifeHubLink,
} from '@/lib/lifehub/linked-context';
import {
  ROUTINE_TEMPLATES,
  type RoutineTemplatePreset,
} from '@/lib/lifehub/routine-templates';
import { resolveHealthTarget, type ResolvedHealthTarget } from '@/lib/health/lifehub-activity';
import { balanceTargetStateLabel, resolveUpcomingMoneyTarget, type ResolvedBalanceTarget } from '@/lib/balance/lifehub-activity';
import { isSupplementExpired } from '@/lib/supplements/lifehub-activity';
import { isSupplementCompletionNote } from '@/lib/supplements/lifehub-completion';
import { resolveWorkTarget, workTargetStateLabel, type ResolvedWorkTarget } from '@/lib/work/lifehub-activity';
import { notifyLegacy as toast } from '@/lib/feedback/notify';
import {
  claimRequestSignal,
  isProfileBoundRequestReady,
} from '@/lib/section-feature-request';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useCalendarGridNavigation } from '@/hooks/use-calendar-grid-navigation';
import { formatLabel } from '@/lib/utils';
import { JOURNAL_MOODS } from '@/lib/journal-moods';
import { deriveJournalPresentation, getJournalPreview } from '@/lib/journal-content';
import type {
  BookItem,
  DailyChecklistItem,
  Game,
  ImportantDateItem,
  Supplement,
  ProductivityItem,
  ProductivityPriority,
  ProductivityStatus,
  ProductivityType,
  MediaItem,
  SkincareProduct,
  TrashItem,
  WorkStatusType,
} from '@/lib/types';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

const WORK_STATUS_TYPES = Object.keys(CALENDAR_WORK_STATUSES) as CalendarWorkStatus[];
const ACTIVE_TASK_STATUSES: ProductivityStatus[] = ['pending', 'in-progress', 'deferred'];
const HISTORY_TASK_STATUSES: ProductivityStatus[] = ['completed', 'failed', 'dropped'];

const DEFAULT_CALENDAR_FILTERS: Record<CalendarSourceKey, boolean> = {
  dates: true,
  tasks: true,
  inventory: false,
  wishlist: false,
  skincare: false,
  supplements: true,
  health: true,
  vault: true,
  work: false,
  history: false,
};

const CALENDAR_SOURCE_GROUPS = [
  { key: 'planning', label: 'Planning', description: 'Dates and tasks.', sections: ['dates', 'tasks'] as CalendarSourceKey[] },
  { key: 'health', label: 'Health', description: 'Health, supplements, and skincare.', sections: ['health', 'supplements', 'skincare'] as CalendarSourceKey[] },
  { key: 'personal', label: 'Personal', description: 'Private reference dates.', sections: ['vault'] as CalendarSourceKey[] },
  { key: 'work', label: 'Work', description: 'Project and work dates.', sections: ['work'] as CalendarSourceKey[] },
  { key: 'history', label: 'History', description: 'Completed historical items.', sections: ['history'] as CalendarSourceKey[] },
] as const;

type LifeHubTab = 'today' | 'tasks' | 'routine' | 'dates' | 'activity' | 'journal';
type InboxType = 'task' | 'idea' | 'reminder';
type TaskSort = 'smart' | 'due' | 'priority' | 'newest' | 'oldest';
type CalendarView = 'month' | 'agenda';
type CalendarSubTab = 'schedule' | 'activity';
type WeekStartsOn = 0 | 1;

type DeleteTarget =
  | { kind: 'task'; item: ProductivityItem }
  | { kind: 'routine'; item: DailyChecklistItem }
  | { kind: 'date'; item: ImportantDateItem }
  | { kind: 'streak-event'; event: LifeHubCalendarEvent };

type Props = {
  openTaskSignal?: number;
  onAddJournal?: () => void;
  compactMobileMode?: boolean;
  androidPresentation?: boolean;
  requestedProfileId?: string;
  requestedView?: string;
  requestedViewSignal?: number;
  requestedRecordId?: string;
  requestedDateKey?: string;
  onRequestedViewConsumed?: (signal: number) => void;
};

const priorityRank: Record<ProductivityPriority, number> = {
  critical: 4,
  important: 3,
  normal: 2,
  optional: 1,
};

const priorityLabel: Record<ProductivityPriority, string> = {
  critical: 'Urgent',
  important: 'High',
  normal: 'Medium',
  optional: 'Low',
};

const priorityClass: Record<ProductivityPriority, string> = {
  critical: 'border-red-500/25 bg-red-500/10 text-red-500',
  important: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  normal: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300',
  optional: 'border-border/60 bg-muted/50 text-muted-foreground',
};

const eventPriorityRank = (value?: string) => {
  if (value === 'critical' || value === 'urgent') return 5;
  if (value === 'important' || value === 'high') return 4;
  if (value === 'normal' || value === 'medium') return 3;
  if (value === 'low' || value === 'optional') return 2;
  return 1;
};

type CalendarEventVisual = {
  label: string;
  chipClass: string;
  markerClass: string;
};

const CALENDAR_EVENT_VISUALS: Record<string, CalendarEventVisual> = {
  planning: {
    label: 'Planning',
    chipClass: 'bg-primary/15 text-primary',
    markerClass: 'bg-primary',
  },
  task: {
    label: 'Task',
    chipClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
    markerClass: 'bg-blue-500',
  },
  health: {
    label: 'Health',
    chipClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    markerClass: 'bg-emerald-500',
  },
  work: {
    label: 'Work',
    chipClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    markerClass: 'bg-cyan-500',
  },
  personal: {
    label: 'Personal',
    chipClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
    markerClass: 'bg-violet-500',
  },
  money: {
    label: 'Money',
    chipClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    markerClass: 'bg-amber-500',
  },
  urgent: {
    label: 'Urgent',
    chipClass: 'bg-red-500/15 text-red-600 dark:text-red-300',
    markerClass: 'bg-red-500',
  },
  history: {
    label: 'History',
    chipClass: 'bg-muted text-muted-foreground',
    markerClass: 'bg-muted-foreground',
  },
};

function getCalendarEventVisual(event: LifeHubCalendarEvent): CalendarEventVisual {
  const priority = eventPriorityRank(event.priority);
  if (priority >= 5) return CALENDAR_EVENT_VISUALS.urgent;
  if (event.section === 'history') return CALENDAR_EVENT_VISUALS.history;
  if (event.source === 'task') return CALENDAR_EVENT_VISUALS.task;
  if (event.source === 'work') return CALENDAR_EVENT_VISUALS.work;
  if (['health', 'supplements', 'skincare', 'routine', 'streak'].includes(event.source)) {
    return CALENDAR_EVENT_VISUALS.health;
  }
  if (['vault', 'inventory', 'wishlist'].includes(event.source)) {
    return event.source === 'vault'
      ? CALENDAR_EVENT_VISUALS.personal
      : CALENDAR_EVENT_VISUALS.money;
  }
  if (['bill', 'subscription', 'renewal', 'sale'].includes(event.type)) {
    return CALENDAR_EVENT_VISUALS.money;
  }
  return CALENDAR_EVENT_VISUALS.planning;
}

function getAndroidEventTone(event: LifeHubCalendarEvent) {
  const priority = eventPriorityRank(event.priority);
  if (priority >= 5) return 'danger' as const;
  if (priority >= 4) return 'warn' as const;
  if (event.source === 'task') return 'primary' as const;
  return 'muted' as const;
}


/* Visible labels only. The stored frequency values stay untouched, so `biweekly`
   is still `biweekly` in the record and only reads as "Bi-weekly" here. `All`
   keeps custom schedules (every X days) reachable. */
const ROUTINE_FILTER_TABS: Array<[RoutineFilter, string]> = [
  ['all', 'All'],
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['biweekly', 'Bi-weekly'],
  ['monthly', 'Monthly'],
];

const routineFilterLabel = (filter: RoutineFilter) =>
  ROUTINE_FILTER_TABS.find(([value]) => value === filter)?.[1] ?? formatLabel(filter);

function smartTaskSort(items: ProductivityItem[], sort: TaskSort) {
  return [...items].sort((a, b) => {
    if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sort === 'priority') return priorityRank[b.priority] - priorityRank[a.priority];
    if (sort === 'due') {
      const aDue = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    }

    const score = (item: ProductivityItem) => {
      const days = item.deadline ? daysFromToday(item.deadline) : 99;
      const urgency = days < 0 ? 100 + Math.abs(days) : days === 0 ? 90 : days <= 3 ? 70 - days : 20;
      return urgency + priorityRank[item.priority] * 5 + (item.status === 'deferred' ? -3 : 0);
    };
    return score(b) - score(a);
  });
}

type TaskTimingGroup = 'today' | 'upcoming' | 'anytime';

function getTaskTimingGroup(item: ProductivityItem): TaskTimingGroup {
  if (!item.deadline) return 'anytime';
  return daysFromToday(item.deadline) > 0 ? 'upcoming' : 'today';
}

function getTaskTimingSubgroup(item: ProductivityItem) {
  return item.deadline && daysFromToday(item.deadline) < 0 ? 'Overdue' : 'Due today';
}

function formatTaskDueLabel(item: ProductivityItem) {
  if (!item.deadline) return 'No due date';
  const days = daysFromToday(item.deadline);
  if (days < 0) {
    const count = Math.abs(days);
    return `Overdue · ${count} day${count === 1 ? '' : 's'}`;
  }
  return formatRelativeDate(item.deadline);
}

function formatTaskLinkedProducts(label: string, names: string[], noun: string) {
  if (names.length === 1) return `${label} · ${names[0]}`;
  return `${label} · ${names.length} ${noun} linked · ${names[0]} + ${names.length - 1} more`;
}

function reminderGroupLabel(item: ProductivityItem) {
  if (!item.deadline) return 'Later';
  const offset = daysFromToday(item.deadline);
  if (offset < 0) return 'Past / Dismissed';
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset < 7) return 'Later this week';
  return 'Later';
}

function isTrackableOverdue(event: LifeHubCalendarEvent) {
  return isActionableCalendarDate(event) && event.status !== 'completed' && event.status !== 'dismissed';
}

function getEventTypeSummary(events: LifeHubCalendarEvent[]) {
  const types = Array.from(new Set(events.map(event => formatLabel(event.type))));
  if (!types.length) return null;
  const visible = types.slice(0, 3);
  const remainder = types.length - visible.length;
  return `Types: ${visible.join(', ')}${remainder > 0 ? `, and ${remainder} more` : ''}`;
}

export default function LifeHubSection({
  openTaskSignal = 0,
  onAddJournal,
  compactMobileMode = false,
  androidPresentation = false,
  requestedProfileId,
  requestedView,
  requestedViewSignal = 0,
  requestedRecordId,
  requestedDateKey,
  onRequestedViewConsumed,
}: Props) {
  const {
    currentProfileId,
    productivityItems = [],
    addProductivityItem,
    updateProductivityItem,
    completeProductivityItem,
    deferProductivityItem,
    dropProductivityItem,
    reopenProductivityItem,
    convertIdeaToTask,
    deleteProductivityItem,
    dailyChecklistItems = [],
    games = [],
    addDailyChecklistItem,
    updateDailyChecklistItem,
    deleteDailyChecklistItem,
    toggleRoutineOccurrence,
    setRoutineProgress,
    adjustRoutineProgress,
    skipRoutineOccurrence,
    recoverRoutineOccurrence,
    completeSkincareRoutineOccurrence,
    completeSupplementRoutineOccurrence,
    importantDates = [],
    addImportantDate,
    updateImportantDate,
    deleteImportantDate,
    resolveImportantDate,
    inventoryItems = [],
    wishlistItems = [],
    journalEntries = [],
    musicItems = [],
    skincareProducts = [],
    supplements = [],
    upcomingMoneyItems = [],
    transactions = [],
    mediaItems = [],
    books = [],
    personalVaultItems = [],
    workItems = [],
    trashItems = [],
    skincareUsageEvents = [],
    health,
    isHydrated,
    updateNoXTracker,
  } = useAppContext();
  const { playItems } = useMusicPlayer();

  const [activeTab, setActiveTab] = useState<LifeHubTab>('today');
  const previousActiveTabRef = useRef<LifeHubTab>('today');
  const inboxPanelRef = useRef<HTMLElement>(null);
  const previousInboxTypeRef = useRef<InboxType>('task');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const consumedRequestSignalRef = useRef<number | null>(null);
  const [journalOpenRequest, setJournalOpenRequest] = useState<{
    recordId?: string;
    dateKey?: string;
    signal: number;
  } | null>(null);
  const [activityInitialView, setActivityInitialView] = useState<ActivityView>('timeline');

  const todayJournalEntry = useMemo(() => {
    const todayKey = toLocalDateKey(new Date());
    return [...journalEntries]
      .filter(entry => toLocalDateKey(entry.date) === todayKey)
      .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())[0];
  }, [journalEntries]);
  const todayJournalPresentation = todayJournalEntry
    ? deriveJournalPresentation(todayJournalEntry, normalizeExternalWebUrl)
    : null;
  const todayJournalMood = todayJournalPresentation?.mood
    ? JOURNAL_MOODS.find(item => item.value === todayJournalPresentation.mood)?.label
    : null;
  const todayJournalPreview = todayJournalPresentation
    ? getJournalPreview(todayJournalPresentation.content)
    : '';
  const todayJournalAssetId = todayJournalEntry?.photoAssetIds?.find(id => typeof id === 'string' && id.trim())?.trim();
  const todayJournalImageUrl = todayJournalEntry && typeof todayJournalEntry.image === 'string'
    ? normalizeExternalWebUrl(todayJournalEntry.image.trim())
    : null;
  const todayJournalMusicLink = todayJournalPresentation?.usableMusicLinks[0] || null;
  const todayJournalMusic = useMemo(() => {
    const identity = todayJournalMusicLink ? getMusicLinkIdentity(todayJournalMusicLink) : null;
    return identity ? musicItems.find(item => getMusicLinkIdentity(item.url) === identity) : undefined;
  }, [musicItems, todayJournalMusicLink]);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProductivityItem | null>(null);
  const [taskInitialType, setTaskInitialType] = useState<ProductivityType>('task');
  const [taskInitialDeadline, setTaskInitialDeadline] = useState<string | undefined>();
  const [pendingConvertedTaskId, setPendingConvertedTaskId] = useState<string | null>(null);

  const [routineModalOpen, setRoutineModalOpen] = useState(false);
  const [routineTemplateOpen, setRoutineTemplateOpen] = useState(false);
  const [routineTemplate, setRoutineTemplate] = useState<RoutineTemplatePreset | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<DailyChecklistItem | null>(null);
  const [skincareCompletionRoutine, setSkincareCompletionRoutine] = useState<DailyChecklistItem | null>(null);
  const [skincareCompletionDate, setSkincareCompletionDate] = useState(() => startOfLocalDay(new Date()));
  const [supplementCompletionRoutine, setSupplementCompletionRoutine] = useState<DailyChecklistItem | null>(null);
  const [supplementCompletionDate, setSupplementCompletionDate] = useState(() => startOfLocalDay(new Date()));
  const [selectedRoutineDate, setSelectedRoutineDate] = useState(() => startOfLocalDay(new Date()));
  const preferredRoutineMonthDay = useRef(new Date().getDate());
  const [showPausedRoutines, setShowPausedRoutines] = useState(false);
  const [routineFilter, setRoutineFilter] = useState<RoutineFilter>('daily');
  const [todayFocusPin, setTodayFocusPin] = useState<TodayFocusPin | null>(null);

  const setRoutineDate = (value: Date, updatePreferredMonthDay = true) => {
    const date = startOfLocalDay(value);
    if (updatePreferredMonthDay) preferredRoutineMonthDay.current = date.getDate();
    setSelectedRoutineDate(date);
  };

  useEffect(() => {
    if (activeTab === 'routine' && previousActiveTabRef.current !== 'routine') {
      setRoutineFilter('daily');
    }
    previousActiveTabRef.current = activeTab;
  }, [activeTab]);

  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<ImportantDateItem | null>(null);
  const [dateInitialDate, setDateInitialDate] = useState<string | undefined>();
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [calendarSubTab] = useState<CalendarSubTab>('schedule');
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>(0);
  const [calendarSearchOpen, setCalendarSearchOpen] = useState(false);
  const [calendarSearch, setCalendarSearch] = useState('');
  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false);
  const [calendarSourcesOpen, setCalendarSourcesOpen] = useState(false);
  const [showWorkStatuses, setShowWorkStatuses] = useState(true);
  const [loadedPreferencesProfileId, setLoadedPreferencesProfileId] = useState<string | null>(null);

  const [inboxType, setInboxType] = useState<InboxType>('task');
  useEffect(() => {
    if (previousInboxTypeRef.current === inboxType) return;
    previousInboxTypeRef.current = inboxType;
    const panel = inboxPanelRef.current;
    if (!panel) return;
    panel.classList.remove('caizen-tab-panel-motion');
    void panel.offsetWidth;
    panel.classList.add('caizen-tab-panel-motion');
  }, [inboxType]);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskTagFilter, setTaskTagFilter] = useState('all');
  const [taskSort, setTaskSort] = useState<TaskSort>('smart');
  const [showArchivedIdeas, setShowArchivedIdeas] = useState(false);
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const [calendarFilters, setCalendarFilters] = useState<Record<CalendarSourceKey, boolean>>(() => ({ ...DEFAULT_CALENDAR_FILTERS }));
  const calendarSearchPanelRef = useRef<HTMLDivElement>(null);

  useOverlayLifecycle(calendarSearchOpen, () => {
    setCalendarSearchOpen(false);
    setCalendarSearch('');
  }, {
    containerRef: calendarSearchPanelRef,
    lockScroll: false,
    trapFocus: false,
    restoreFocus: false,
    autoFocus: false,
  });
  const lastOpenTaskSignal = useRef(openTaskSignal);

  useEffect(() => {
    setLoadedPreferencesProfileId(null);
    if (!currentProfileId) {
      setCalendarView('month');
      setWeekStartsOn(0);
      setCalendarFilters({ ...DEFAULT_CALENDAR_FILTERS });
      setShowWorkStatuses(true);
      setTodayFocusPin(null);
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem(`lifehub-preferences:${currentProfileId}`) || '{}');
      const focusPin = stored.todayFocusPin;
      setTodayFocusPin(
        focusPin &&
          typeof focusPin.dateKey === 'string' &&
          (focusPin.kind === 'task' || focusPin.kind === 'routine') &&
          typeof focusPin.recordId === 'string'
          ? focusPin as TodayFocusPin
          : null,
      );
      if (stored.calendarView === 'month' || stored.calendarView === 'agenda') {
        setCalendarView(stored.calendarView);
      } else {
        setCalendarView('month');
      }
      setWeekStartsOn(stored.weekStartsOn === 1 ? 1 : 0);
      if (stored.calendarFilters && typeof stored.calendarFilters === 'object') {
        setCalendarFilters({ ...DEFAULT_CALENDAR_FILTERS, ...stored.calendarFilters });
      } else setCalendarFilters({ ...DEFAULT_CALENDAR_FILTERS });
      if (stored.taskSort) setTaskSort(stored.taskSort);
      setShowWorkStatuses(stored.showWorkStatuses !== false);
    } catch {
      setTodayFocusPin(null);
      setCalendarView('month');
      setWeekStartsOn(0);
      setCalendarFilters({ ...DEFAULT_CALENDAR_FILTERS });
      setShowWorkStatuses(true);
      // Invalid local preference data is ignored.
    } finally {
      setLoadedPreferencesProfileId(currentProfileId);
    }
  }, [currentProfileId]);

  useEffect(() => {
    if (!currentProfileId || loadedPreferencesProfileId !== currentProfileId) return;
    localStorage.setItem(
      `lifehub-preferences:${currentProfileId}`,
      JSON.stringify({
        calendarView,
        weekStartsOn,
        calendarFilters,
        taskSort,
        showWorkStatuses,
        ...(todayFocusPin ? { todayFocusPin } : {}),
      }),
    );
    window.dispatchEvent(
      new CustomEvent('life-manager:lifehub-preferences-changed', {
        detail: { profileId: currentProfileId, showWorkStatuses },
      }),
    );
  }, [calendarFilters, calendarView, currentProfileId, loadedPreferencesProfileId, showWorkStatuses, taskSort, todayFocusPin, weekStartsOn]);

  const openNewTask = (type: ProductivityType = 'task', deadline?: string) => {
    setEditingTask(null);
    setTaskInitialType(type);
    setTaskInitialDeadline(deadline);
    setTaskModalOpen(true);
    setQuickAddOpen(false);
  };

  const openNewRoutine = () => {
    setEditingRoutine(null);
    setRoutineTemplate(null);
    setRoutineTemplateOpen(true);
    setQuickAddOpen(false);
  };

  const openRoutineTemplate = (template: RoutineTemplatePreset) => {
    setEditingRoutine(null);
    setRoutineTemplate(template);
    setRoutineTemplateOpen(false);
    setRoutineModalOpen(true);
  };

  const openNewDate = (date?: Date) => {
    setEditingDate(null);
    setDateInitialDate(date ? toLocalDateKey(date) : undefined);
    setDateModalOpen(true);
    setQuickAddOpen(false);
  };

  const openTodayJournal = () => {
    if (!todayJournalEntry) {
      onAddJournal?.();
      return;
    }
    setActiveTab('journal');
    setJournalOpenRequest({
      recordId: todayJournalEntry.id,
      dateKey: toLocalDateKey(new Date()),
      signal: Date.now(),
    });
  };

  useEffect(() => {
    if (!openTaskSignal || openTaskSignal === lastOpenTaskSignal.current) return;
    lastOpenTaskSignal.current = openTaskSignal;
    setActiveTab('tasks');
    openNewTask('task');
  }, [openTaskSignal]);

  useEffect(() => {
    if (!pendingConvertedTaskId) return;
    const convertedTask = productivityItems.find(item => item.id === pendingConvertedTaskId);
    if (!convertedTask) return;
    setEditingTask(convertedTask);
    setTaskInitialType('task');
    setTaskInitialDeadline(undefined);
    setTaskModalOpen(true);
    setPendingConvertedTaskId(null);
  }, [pendingConvertedTaskId, productivityItems]);

  useEffect(() => {
    const handleQuickAdd = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (type === 'task') {
        openNewTask('task');
      } else if (type === 'idea') {
        openNewTask('idea');
      } else if (type === 'reminder') {
        openNewTask('reminder');
      } else if (type === 'routine') {
        openNewRoutine();
      } else if (type === 'date') {
        openNewDate();
      }
    };

    window.addEventListener('life-manager:quick-add', handleQuickAdd);
    return () => window.removeEventListener('life-manager:quick-add', handleQuickAdd);
  }, []);

  useEffect(() => {
    if (!isProfileBoundRequestReady({
      isHydrated,
      requestedProfileId,
      currentProfileId,
      signal: requestedViewSignal,
    }) || !requestedView) return;
    if (requestedView === 'journal' || requestedView === 'journal-entry') {
      setActiveTab('journal');
      return;
    }
    if (!claimRequestSignal(consumedRequestSignalRef, requestedViewSignal)) return;

    if (requestedView === 'activity' || requestedView === 'activity-outcomes') {
      setActivityInitialView(requestedView === 'activity-outcomes' ? 'outcomes' : 'timeline');
      setActiveTab('activity');
      onRequestedViewConsumed?.(requestedViewSignal);
      return;
    }

    if (requestedRecordId) {
      const requestedDate = parseLocalDateKey(requestedRecordId);
      if (requestedView === 'dates' && requestedDate) {
        setActiveTab('dates');
        setSelectedDay(requestedDate);
        setCalendarMonth(
          new Date(
            requestedDate.getFullYear(),
            requestedDate.getMonth(),
            1,
            12,
          ),
        );
        onRequestedViewConsumed?.(requestedViewSignal);
        return;
      }

      const task = productivityItems.find(item => item.id === requestedRecordId);
      if (task) {
        setActiveTab('tasks');
        openEditTask(task);
        onRequestedViewConsumed?.(requestedViewSignal);
        return;
      }

      const routine = dailyChecklistItems.find(
        item => item.id === requestedRecordId,
      );
      if (routine) {
        setActiveTab('routine');
        openEditRoutine(routine);
        onRequestedViewConsumed?.(requestedViewSignal);
        return;
      }

      const importantDate = importantDates.find(
        item => item.id === requestedRecordId,
      );
      if (importantDate) {
        setActiveTab('dates');
        openEditDate(importantDate);
      }
      onRequestedViewConsumed?.(requestedViewSignal);
      return;
    }

    if (
      requestedView === 'today' ||
      requestedView === 'tasks' ||
      requestedView === 'routine' ||
      requestedView === 'dates'
    ) {
      setActiveTab(requestedView);
      onRequestedViewConsumed?.(requestedViewSignal);
      return;
    }
    if (requestedView === 'task' || requestedView === 'add-task') {
      setActiveTab('tasks');
      openNewTask('task');
      onRequestedViewConsumed?.(requestedViewSignal);
      return;
    }
    if (requestedView === 'idea' || requestedView === 'add-idea') {
      setActiveTab('tasks');
      openNewTask('idea');
      onRequestedViewConsumed?.(requestedViewSignal);
      return;
    }
    if (requestedView === 'reminder' || requestedView === 'add-reminder') {
      setActiveTab('tasks');
      openNewTask('reminder');
      onRequestedViewConsumed?.(requestedViewSignal);
      return;
    }
    if (requestedView === 'add-routine') {
      setActiveTab('routine');
      openNewRoutine();
      onRequestedViewConsumed?.(requestedViewSignal);
      return;
    }
    if (requestedView === 'open-date') {
      setActiveTab('dates');
      onRequestedViewConsumed?.(requestedViewSignal);
      return;
    }
    if (requestedView === 'date' || requestedView === 'add-date') {
      setActiveTab('dates');
      openNewDate();
      onRequestedViewConsumed?.(requestedViewSignal);
      return;
    }
    onRequestedViewConsumed?.(requestedViewSignal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentProfileId,
    dailyChecklistItems,
    importantDates,
    isHydrated,
    onRequestedViewConsumed,
    productivityItems,
    requestedProfileId,
    requestedRecordId,
    requestedView,
    requestedViewSignal,
  ]);

  const taskItems = useMemo(
    () => productivityItems.filter(item => ['task', 'idea', 'reminder'].includes(item.type)),
    [productivityItems],
  );
  const activeTasks = taskItems.filter(item =>
    ACTIVE_TASK_STATUSES.includes(item.status) && !(item.type === 'idea' && item.archivedAt),
  );
  const upcomingReminderCount = activeTasks.filter(item =>
    item.type === 'reminder' && (!item.deadline || daysFromToday(item.deadline) >= 0),
  ).length;
  const inboxTabOptions = [
    { value: 'task' as const, label: 'Tasks', count: activeTasks.filter(item => item.type === 'task').length, countLabel: 'open', icon: ListChecks },
    { value: 'idea' as const, label: 'Ideas', count: activeTasks.filter(item => item.type === 'idea').length, countLabel: 'captured', icon: Lightbulb },
    { value: 'reminder' as const, label: 'Reminders', count: upcomingReminderCount, countLabel: 'upcoming', icon: Bell },
  ] as const;
  const inboxViewCopy = {
    task: {
      title: 'Open tasks',
      description: 'Plan and finish the next actions that move things forward.',
      searchLabel: 'Task search',
      placeholder: 'Search tasks...',
    },
    idea: {
      title: 'Captured ideas',
      description: 'Keep useful thoughts close until you are ready to shape them.',
      searchLabel: 'Search ideas',
      placeholder: 'Search ideas...',
    },
    reminder: {
      title: 'Active reminders',
      description: 'Keep time-sensitive reminders visible in chronological order.',
      searchLabel: 'Search reminders',
      placeholder: 'Search reminders...',
    },
  } as const;
  const archivedIdeas = taskItems.filter(item =>
    item.type === 'idea' && (
      Boolean(item.archivedAt) ||
      Boolean(item.convertedToTaskId) ||
      HISTORY_TASK_STATUSES.includes(item.status)
    ),
  );
  const availableTaskTags = Array.from(new Map(
    taskItems
      .filter(item => item.type === 'task')
      .flatMap(item => (item.tags || []).map(tag => [tag.trim().toLocaleLowerCase(), tag.trim()] as const))
      .filter(([key, value]) => key && value),
  ).entries());
  const personalTasks = activeTasks.filter(item => item.type === 'task');
  const matchingOpenTasks = useMemo(() => {
    const normalizedSearch = taskSearch.trim().toLowerCase();
    return activeTasks
      .filter(item => item.type === 'task')
      .filter(item => taskTagFilter === 'all' || (item.tags || []).some(tag => `tag:${tag.trim().toLocaleLowerCase()}` === taskTagFilter))
      .filter(item => !normalizedSearch || `${item.title} ${item.description || ''} ${item.notes || ''} ${(item.tags || []).join(' ')}`.toLowerCase().includes(normalizedSearch));
  }, [activeTasks, taskSearch, taskTagFilter]);
  const taskGroups = useMemo(() => {
    const overdue = matchingOpenTasks.filter(item => item.deadline && daysFromToday(item.deadline) < 0);
    const dueToday = matchingOpenTasks.filter(item => item.deadline && daysFromToday(item.deadline) === 0);
    const upcoming = matchingOpenTasks.filter(item => item.deadline && daysFromToday(item.deadline) > 0);
    const anytime = matchingOpenTasks.filter(item => !item.deadline);
    return [
      { key: 'today' as const, label: 'Today', items: [...smartTaskSort(overdue, taskSort), ...smartTaskSort(dueToday, taskSort)] },
      { key: 'upcoming' as const, label: 'Upcoming', items: smartTaskSort(upcoming, taskSort) },
      { key: 'anytime' as const, label: 'Anytime', items: smartTaskSort(anytime, taskSort) },
    ].filter(group => group.items.length > 0);
  }, [matchingOpenTasks, taskSort]);
  const matchingDueTodayCount = matchingOpenTasks.filter(item => item.deadline && daysFromToday(item.deadline) === 0).length;
  const matchingOverdueCount = matchingOpenTasks.filter(item => item.deadline && daysFromToday(item.deadline) < 0).length;
  const taskSummary = matchingOpenTasks.length > 0
    ? [
        `${matchingOpenTasks.length} open`,
        matchingDueTodayCount > 0 ? `${matchingDueTodayCount} today` : null,
        matchingOverdueCount > 0 ? `${matchingOverdueCount} overdue` : null,
      ].filter(Boolean).join(' · ')
    : null;
  const visibleInboxItems = useMemo(() => {
    const normalizedSearch = taskSearch.trim().toLowerCase();
    if (inboxType === 'task') return taskGroups.flatMap(group => group.items);
    const items = activeTasks.filter(item => item.type === inboxType).filter(item => {
      if (!normalizedSearch) return true;
      return `${item.title} ${item.description || ''} ${item.notes || ''} ${(item.tags || []).join(' ')}`.toLowerCase().includes(normalizedSearch);
    });
    if (inboxType === 'idea') {
      return [...items].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    }
    if (inboxType === 'reminder') {
      return [...items].sort((left, right) => {
        const reminderTime = (item: ProductivityItem) => {
          const date = item.deadline ? toLocalDateKey(item.deadline) : '9999-12-31';
          const time = item.reminderTime || '23:59';
          return `${date}T${time}`;
        };
        return reminderTime(left).localeCompare(reminderTime(right));
      });
    }
    return smartTaskSort(items, taskSort);
  }, [activeTasks, inboxType, taskGroups, taskSearch, taskSort]);

  const routines = dailyChecklistItems.filter(item => item.active !== false || showPausedRoutines);
  const filteredRoutines = routines
    .filter(item => routineMatchesFilter(item, routineFilter))
    .sort(compareRoutinePlannedTime);
  const now = new Date();
  const today = startOfLocalDay(now);
  const todaySummary = deriveLifeHubTodaySummary(taskItems, dailyChecklistItems, now);
  const pendingRoutinesToday = todaySummary.routines.pending;
  const skippedRoutinesToday = todaySummary.routines.skipped;
  const routineAttentionSummary = getRoutineAttentionSummary(dailyChecklistItems, now);
  const dueTodayTasks = todaySummary.dueTasks.filter(isOpenLifeHubTask);
  const overdueTasks = todaySummary.overdueTasks;
  const noDeadlineTasks = personalTasks.filter(item => !item.deadline);
  const routinePeriodWindow = getRoutinePeriodWindow(routineFilter, selectedRoutineDate);
  const routinePeriodSummary = getRoutinePeriodSummary(routines, routineFilter, selectedRoutineDate);
  const selectedRoutineDayLabel = toLocalDateKey(selectedRoutineDate) === toLocalDateKey(today)
    ? 'Today'
    : formatDate(selectedRoutineDate);
  const routinePeriodTitle = routineFilter === 'monthly'
    ? selectedRoutineDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : routineFilter === 'weekly' || routineFilter === 'biweekly'
      ? `${formatDate(routinePeriodWindow.start)} – ${formatDate(routinePeriodWindow.end)}`
      : selectedRoutineDayLabel;

  const rangeStart = useMemo(
    () => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 2, 1, 12),
    [calendarMonth],
  );
  const rangeEnd = useMemo(
    () => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 4, 0, 12),
    [calendarMonth],
  );

  const calendarEvents = useMemo(
    () => buildLifeHubCalendarEvents({
      importantDates,
      productivityItems,
      inventoryItems,
      wishlistItems,
      skincareProducts,
      supplements,
      personalVaultItems,
      workItems,
      dailyChecklistItems,
      health,
      rangeStart,
      rangeEnd,
      filters: calendarFilters,
    }).filter(event => !isCalendarWorkStatus(event.type)),
    [calendarFilters, dailyChecklistItems, health, importantDates, inventoryItems, personalVaultItems, productivityItems, rangeEnd, rangeStart, skincareProducts, supplements, wishlistItems, workItems],
  );

  const upcomingEvents = calendarEvents
    .filter(event => daysFromToday(event.date) >= 0 && daysFromToday(event.date) <= 14)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const overdueEvents = calendarEvents
    .filter(event => isTrackableOverdue(event) && daysFromToday(event.date) < 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const subscriptions = importantDates.filter(item => item.type === 'subscription' && item.status !== 'dismissed');

  const normalizedCalendarSearch = calendarSearch.trim().toLowerCase();
  const calendarSearchResults = normalizedCalendarSearch
    ? calendarEvents
        .filter(event =>
          `${event.title} ${event.type} ${event.notes || ''} ${event.projectName || ''} ${event.source}`
            .toLowerCase()
            .includes(normalizedCalendarSearch),
        )
        .slice(0, 20)
    : [];

  const activeTodayFocusPin = loadedPreferencesProfileId === currentProfileId ? todayFocusPin : null;
  const pinnedFocus = activeTodayFocusPin?.dateKey === todaySummary.dateKey
    ? activeTodayFocusPin.kind === 'task'
      ? [...overdueTasks, ...todaySummary.dueTasks].find(item => item.id === activeTodayFocusPin.recordId && isOpenLifeHubTask(item))
      : pendingRoutinesToday.find(item => item.id === activeTodayFocusPin.recordId && isLifeHubRoutinePlannedToday(item, now))
    : undefined;
  const automaticTodayFocus = smartTaskSort([...overdueTasks, ...dueTodayTasks], 'smart')[0] || pendingRoutinesToday[0];
  const todayFocus = pinnedFocus || automaticTodayFocus;
  const todayFocusReason = todayFocus
    ? pinnedFocus
      ? 'Pinned for today'
      : 'deadline' in todayFocus
        ? todayFocus.deadline && toLocalDateKey(new Date(todayFocus.deadline)) < todaySummary.dateKey ? 'Overdue' : 'Due today'
        : 'scheduledTime' in todayFocus && todayFocus.scheduledTime ? `Scheduled · ${todayFocus.scheduledTime}` : 'Scheduled'
    : null;

  const toggleTodayFocusPin = (kind: TodayFocusPin['kind'], recordId: string) => {
    setTodayFocusPin(current =>
      current?.dateKey === todaySummary.dateKey && current.kind === kind && current.recordId === recordId
        ? null
        : { dateKey: todaySummary.dateKey, kind, recordId },
    );
  };

  const calendarDays = getMonthGrid(calendarMonth, weekStartsOn);
  const calendarWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .map((_, index, weekdays) => weekdays[(index + weekStartsOn) % weekdays.length]);
  const calendarRows = Array.from({ length: calendarDays.length / 7 }, (_, index) =>
    calendarDays.slice(index * 7, index * 7 + 7),
  );
  const selectedDayEvents = selectedDay ? eventsForDay(calendarEvents, selectedDay) : [];
  const agendaEvents = calendarEvents.filter(event => daysFromToday(event.date) >= 0 && daysFromToday(event.date) <= 90);
  const timelineEvents = [...overdueEvents, ...agendaEvents];
  const agendaGroups = getAgendaGroups(timelineEvents);
  const prioritizedTimelineEvents = agendaGroups.flatMap(group => group.events);
  const monthTimelineGroups = getAgendaGroups(prioritizedTimelineEvents.slice(0, 8));
  const activeCalendarSourceCount = CALENDAR_SOURCE_GROUPS.filter(group =>
    group.sections.some(section => calendarFilters[section] !== false),
  ).length;
  const calendarSourcesDifferFromDefault = (Object.keys(DEFAULT_CALENDAR_FILTERS) as CalendarSourceKey[])
    .some(key => calendarFilters[key] !== DEFAULT_CALENDAR_FILTERS[key]);
  const calendarNavigation = useCalendarGridNavigation({
    days: calendarDays,
    month: calendarMonth,
    selectedKey: selectedDay ? toLocalDateKey(selectedDay) : undefined,
    weekStartsOn,
    onMonthChange: setCalendarMonth,
  });

  const getWorkStatusForDate = (date: Date): CalendarWorkStatus | null => {
    const entry = importantDates.find(item =>
      WORK_STATUS_TYPES.includes(item.type as CalendarWorkStatus) &&
      toLocalDateKey(item.date) === toLocalDateKey(date),
    );
    return (entry?.type as CalendarWorkStatus) || null;
  };

  const setWorkStatusForDate = (date: Date, status: CalendarWorkStatus | null) => {
    const existing = importantDates.find(item =>
      WORK_STATUS_TYPES.includes(item.type as CalendarWorkStatus) &&
      toLocalDateKey(item.date) === toLocalDateKey(date),
    );
    if (!status) {
      if (existing) deleteImportantDate(existing.id);
      return;
    }
    const meta = CALENDAR_WORK_STATUSES[status];
    if (existing) {
      updateImportantDate(existing.id, {
        title: meta.label,
        type: status as WorkStatusType,
        date,
        status: 'upcoming',
      });
      return;
    }
    addImportantDate({
      title: meta.label,
      type: status as WorkStatusType,
      date,
      repeat: 'none',
      priority: 'none',
      status: 'upcoming',
      trackAsOverdue: false,
    });
  };

  const ensureReminderPermissionFor = (description: string) => {
    if (!isNativeApp()) return;
    void ensureNotificationPermission().then(granted => {
      if (!granted) toast({
        title: 'Reminder permission is off',
        description,
        variant: 'warning',
      });
    }).catch(() => toast({
      title: 'Reminder permission could not be checked',
      description,
      variant: 'warning',
    }));
  };

  const saveTask = async (draft: LifeHubTaskDraft) => {
    const isFirstTask = !editingTask && draft.type === 'task' && productivityItems.length === 0;
    const deadline = draft.deadline ? parseLocalDateKey(draft.deadline) || undefined : undefined;
    const previousAssetIds = editingTask?.photoAssetIds || [];
    const payload = {
      title: draft.title,
      description: draft.description,
      notes: draft.description,
      type: draft.type,
      priority: draft.type === 'task' ? draft.priority : 'normal' as const,
      deadline: draft.type === 'idea' ? undefined : deadline,
      estimatedMinutes: draft.type === 'task' ? draft.estimatedMinutes : undefined,
      tags: draft.type === 'task' ? draft.tags : undefined,
      reminderEnabled: draft.type !== 'idea' && draft.reminderEnabled && Boolean(deadline),
      reminderTime: draft.type === 'idea' ? undefined : draft.reminderTime,
      showInCalendar: draft.type === 'reminder' ? draft.showInCalendar : undefined,
      linkedContext: draft.type === 'task' ? draft.linkedContext : undefined,
      photoAssetIds: draft.pendingVisualImage ? undefined : draft.photoAssetIds,
      visualReferenceUrl: draft.pendingVisualImage
        ? undefined
        : normalizeExternalWebUrl(draft.visualReferenceUrl) || undefined,
      archivedAt: draft.type === 'idea' ? editingTask?.archivedAt ?? null : undefined,
    };
    if (payload.reminderEnabled) {
      ensureReminderPermissionFor('The item was saved, but Android will not show its reminder until notification permission is enabled.');
    }

    const itemId = editingTask?.id || addProductivityItem({ ...payload, status: 'pending' });
    if (!itemId) return;
    if (editingTask) updateProductivityItem(itemId, payload);

    let finalAssetIds = payload.photoAssetIds || [];
    if (draft.pendingVisualImage && currentProfileId) {
      try {
        const asset = await mediaStorage.save(draft.pendingVisualImage.blob, {
          profileId: currentProfileId,
          ownerType: 'other',
          ownerId: itemId,
          role: 'primary',
          fileName: draft.pendingVisualImage.fileName,
        });
        finalAssetIds = [asset.id];
        updateProductivityItem(itemId, {
          photoAssetIds: finalAssetIds,
          visualReferenceUrl: undefined,
        });
      } catch (caught) {
        toast({
          title: 'Item saved without its image',
          description: caught instanceof Error ? caught.message : 'The visual reference could not be attached.',
          variant: 'warning',
        });
      }
    }

    const detachedAssetIds = previousAssetIds.filter(assetId => !finalAssetIds.includes(assetId));
    if (detachedAssetIds.length && currentProfileId) {
      queueMediaCleanup({ profileId: currentProfileId, assetIds: detachedAssetIds, reason: 'attachment-detached' });
      void processPendingMediaCleanup();
    }

    if (isFirstTask) {
      toast({
        title: 'Your first task is on the board',
        description: 'A clear next step, ready when you are.',
      });
    }
    setTaskModalOpen(false);
    setEditingTask(null);
  };

  const saveRoutine = (draft: LifeHubRoutineDraft) => {
    const payload = {
      title: draft.title,
      category: draft.category,
      frequency: draft.frequency,
      weekday: draft.weekday,
      weekdays: draft.weekdays,
      intervalDays: draft.intervalDays,
      anchorDate: draft.anchorDate ? parseLocalDateKey(draft.anchorDate) || undefined : undefined,
      dayOfMonth: draft.dayOfMonth,
      active: draft.active,
      scheduledTime: draft.scheduledTime,
      reminderEnabled: draft.reminderEnabled,
      reminderTime: draft.reminderTime,
      reminderDays: draft.reminderDays,
      linkedSection: draft.linkedSection,
      linkedView: draft.linkedView,
      linkedGameId: draft.linkedGameId,
      linkedContext: draft.linkedContext,
      healthRoutineEvidence: draft.healthRoutineEvidence,
      goal: draft.goal,
    };
    if (payload.reminderEnabled) {
      ensureReminderPermissionFor('The routine was saved, but Android will not show its reminder until notification permission is enabled.');
    }

    if (editingRoutine) {
      updateDailyChecklistItem(editingRoutine.id, payload);
    } else {
      addDailyChecklistItem({
        ...payload,
        completedAt: null,
        completionHistory: [],
        completionCount: 0,
      });
    }
    toast({ title: 'Saved locally', description: `${draft.title} is ready in Life Hub.` });
    setRoutineModalOpen(false);
    setEditingRoutine(null);
    setRoutineTemplate(null);
  };

  const saveDate = (draft: LifeHubDateDraft) => {
    const date = parseLocalDateKey(draft.date);
    if (!date) return;
    const payload = {
      title: draft.title,
      type: draft.type,
      date,
      endDate: draft.endDate ? parseLocalDateKey(draft.endDate) : null,
      repeat: draft.repeat,
      priority: draft.priority,
      reminder: draft.reminder,
      customReminderDays: draft.customReminderDays,
      reminderEnabled: draft.reminderEnabled,
      reminderTime: draft.reminderTime,
      trackAsOverdue: draft.trackAsOverdue,
      amount: draft.amount,
      link: draft.link,
      notes: draft.notes,
    };
    if (payload.reminderEnabled) {
      ensureReminderPermissionFor('The calendar item was saved, but Android will not show its reminder until notification permission is enabled.');
    }

    if (editingDate) updateImportantDate(editingDate.id, payload);
    else addImportantDate({ ...payload, status: 'upcoming' });
    setDateModalOpen(false);
    setEditingDate(null);
  };

  const openEditTask = (item: ProductivityItem) => {
    setEditingTask(item);
    setTaskInitialType(item.type);
    setTaskInitialDeadline(undefined);
    setTaskModalOpen(true);
    setOpenTaskMenuId(null);
  };

  const openEditRoutine = (item: DailyChecklistItem) => {
    setEditingRoutine(item);
    setRoutineTemplate(null);
    setRoutineModalOpen(true);
  };

  const openEditDate = (eventOrItem: LifeHubCalendarEvent | ImportantDateItem) => {
    const id = 'recordId' in eventOrItem ? eventOrItem.recordId : eventOrItem.id;
    const item = importantDates.find(date => date.id === id);
    if (!item) return;
    setEditingDate(item);
    setDateInitialDate(undefined);
    setDateModalOpen(true);
    setSelectedDay(null);
  };

  const resolveDateEvent = (event: LifeHubCalendarEvent) => {
    if (!isActionableCalendarDate(event)) return;
    resolveImportantDate(event.recordId, 'completed', event.date);
  };

  const navigateTo = (section: string, feature?: string, recordId?: string, dateKey?: string) => {
    window.dispatchEvent(
      new CustomEvent('life-manager:navigate', {
        detail: feature || recordId ? { section, feature, recordId, dateKey } : section,
      }),
    );
  };

  const openActivityEntry = (entry: DerivedActivityEntry) => {
    if (entry.ownerState !== 'live' || !entry.ownerLink) return;
    navigateTo(entry.ownerLink.section, entry.ownerLink.feature, entry.ownerLink.recordId, entry.ownerLink.dateKey);
  };

  const availableSkincareProduct = (item: DailyChecklistItem | ProductivityItem) =>
    getSkincareProductIdsFromLifeHubRecord(item)
      .map(id => skincareProducts.find(product => product.id === id))
      .find((product): product is SkincareProduct => Boolean(product));

  const availableSupplement = (item: DailyChecklistItem | ProductivityItem) =>
    getSupplementIdsFromLifeHubRecord(item)
      .map(id => supplements.find(supplement => supplement.id === id))
      .find((supplement): supplement is Supplement => Boolean(supplement));

  const linkedSkincareProductLabels = (item: DailyChecklistItem | ProductivityItem) =>
    getSkincareProductIdsFromLifeHubRecord(item).map(id => {
      const product = skincareProducts.find(entry => entry.id === id);
      return product ? `${product.name}${product.status === 'emptied' ? ' · Finished' : ''}` : `Unavailable · ${id}`;
    });

  const linkedSupplementLabels = (item: DailyChecklistItem | ProductivityItem) =>
    getSupplementIdsFromLifeHubRecord(item).map(id => {
      const supplement = supplements.find(entry => entry.id === id);
      return supplement ? `${supplement.name}${isSupplementExpired(supplement) ? ' · Expired' : ''}` : `Unavailable · ${id}`;
    });

  const openRoutineContext = (item: DailyChecklistItem, date = new Date()) => {
    const link = resolveEffectiveLinkedLifeHubLink(item);
    if (link.kind === 'context') {
      if (link.context.section === 'journal') {
        navigateTo('lifehub', 'journal-entry', undefined, toLocalDateKey(date));
        return;
      }
      if (link.context.section === 'work' && link.context.type === 'work-item') {
        const target = resolveWorkTarget(link.context.entityId, workItems, trashItems);
        if (!target || target.state === 'in-trash') return;
      }
      if (link.context.section === 'health') {
        const target = resolveHealthTarget(link.context.type, link.context.entityId, health?.workoutPlans || [], health?.workoutRoutines || []);
        if (!target) return;
      }
      if (link.context.section === 'balance') {
        const target = resolveUpcomingMoneyTarget(link.context.entityId, upcomingMoneyItems);
        if (!target) return;
      }
      if (link.context.section === 'skincare') {
        const product = availableSkincareProduct(item);
        if (product) navigateTo('skincare', 'product', product.id);
        else navigateTo('skincare');
        return;
      }
      if (link.context.section === 'supplements') {
        const supplement = availableSupplement(item);
        if (supplement) navigateTo('health', 'supplements', supplement.id);
        else navigateTo('health', 'supplements');
        return;
      }
      const detail = getLifeHubLinkedContextNavigationDetail(link.context);
      navigateTo(detail.section, detail.feature, detail.recordId);
      return;
    }
    if (link.kind === 'legacy-view') {
      navigateTo(link.section, link.view);
      return;
    }
    openEditRoutine(item);
  };

  const completeRoutineFromUi = (item: DailyChecklistItem, date: Date) => {
    const link = resolveEffectiveLinkedLifeHubLink(item);
    if (link.kind === 'context' && link.context.section === 'skincare' && link.context.type === 'product' && !isRoutineDoneForDate(item, date)) {
      setRoutineDate(date, false);
      setSkincareCompletionDate(startOfLocalDay(date));
      setSkincareCompletionRoutine(item);
      return;
    }
    if (link.kind === 'context' && link.context.section === 'supplements' && link.context.type === 'supplement' && !isRoutineDoneForDate(item, date)) {
      setRoutineDate(date, false);
      setSupplementCompletionDate(startOfLocalDay(date));
      setSupplementCompletionRoutine(item);
      return;
    }
    toggleRoutineOccurrence(item.id, date);
  };

  const openCalendarDay = (date: Date) => {
    // Always derive the selection from the clicked day's own Date instance
    // (never a day-of-month number recombined with the currently displayed
    // month) so clicking a leading/trailing day from an adjacent month opens
    // that exact date, even though it's rendered inside this month's grid.
    const { selectedDay, calendarMonth: nextCalendarMonth } = resolveCalendarDaySelection(date);
    setCalendarMonth(nextCalendarMonth);
    setSelectedDay(selectedDay);
  };

  const openCalendarSource = (event: LifeHubCalendarEvent) => {
    if (event.source === 'routine') {
      const routine = dailyChecklistItems.find(item => item.id === event.recordId);
      if (routine?.linkedEntityType === 'workout-routine') {
        setSelectedDay(null);
        navigateTo('health', 'workout-routine', routine.linkedEntityId, toLocalDateKey(event.date));
        return;
      }
      if (routine) {
        setSelectedDay(null);
        setActiveTab('routine');
        openEditRoutine(routine);
        return;
      }
      setSelectedDay(null);
      navigateTo('health', 'workout', event.linkedEntityId || event.recordId);
      return;
    }
    if (event.source === 'streak') {
      setSelectedDay(null);
      navigateTo('health', 'streaks', event.recordId);
      return;
    }
    if (event.source === 'task') {
      const task = productivityItems.find(item => item.id === event.recordId);
      if (task) {
        setSelectedDay(null);
        setActiveTab('tasks');
        openEditTask(task);
      }
      return;
    }
    if (event.source === 'date') {
      const date = importantDates.find(item => item.id === event.recordId);
      if (date) {
        setSelectedDay(null);
        openEditDate(date);
      }
      return;
    }
    const targets: Record<string, string> = {
      inventory: 'inventory',
      wishlist: 'wishlist',
      skincare: 'skincare',
      supplements: 'health',
      vault: 'vault',
      work: 'workhub',
    };
    const target = targets[event.source];
    if (target) navigateTo(target, event.source === 'supplements' ? 'supplements' : undefined, event.recordId);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'task') deleteProductivityItem(deleteTarget.item.id);
    if (deleteTarget.kind === 'routine') deleteDailyChecklistItem(deleteTarget.item.id);
    if (deleteTarget.kind === 'date') deleteImportantDate(deleteTarget.item.id);
    if (deleteTarget.kind === 'streak-event' && deleteTarget.event.streakTimelineEntry && updateNoXTracker) {
      const tracker = health?.noXTrackers?.find(item => item.id === deleteTarget.event.recordId);
      if (tracker) {
        const entry = deleteTarget.event.streakTimelineEntry;
        if (entry.kind === 'pause') {
          const pauseHistory = (tracker.pauseHistory || []).filter(period => period.id !== entry.id);
          const openPause = pauseHistory.find(period => !period.resumedAt);
          updateNoXTracker(tracker.id, {
            pauseHistory,
            pausedAt: openPause?.pausedAt || null,
            resumeDate: null,
            pauseReason: openPause?.reason || '',
            updatedAt: new Date(),
          });
        } else {
          updateNoXTracker(tracker.id, {
            resetHistory: (tracker.resetHistory || []).filter((_, index) => index !== entry.index),
            updatedAt: new Date(),
          });
        }
      }
    }
    setDeleteTarget(null);
    setSelectedDay(null);
  };

  const toggleCalendarSourceGroup = (sections: readonly CalendarSourceKey[]) => {
    const active = sections.some(section => calendarFilters[section] !== false);
    setCalendarFilters(current => {
      const next = { ...current };
      sections.forEach(section => { next[section] = !active; });
      return next;
    });
  };

  const calendarSourcesContent = (
    <div className="space-y-2">
      {CALENDAR_SOURCE_GROUPS.map(group => {
        const active = group.sections.some(section => calendarFilters[section] !== false);
        return (
          <button key={group.key} type="button" aria-pressed={active} onClick={() => toggleCalendarSourceGroup(group.sections)} className="flex min-h-12 w-full items-center justify-between gap-4 rounded-xl px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="min-w-0">
              <span className="block text-sm font-black">{group.label}</span>
              <span className="block text-xs text-muted-foreground">{group.description}</span>
            </span>
            <span className={`text-xs font-black ${active ? 'text-primary' : 'text-muted-foreground'}`}>{active ? 'On' : 'Off'}</span>
          </button>
        );
      })}
      {calendarSourcesDifferFromDefault ? (
        <Button type="button" variant="outline" className="mt-2 w-full rounded-xl" onClick={() => setCalendarFilters({ ...DEFAULT_CALENDAR_FILTERS })}>
          <RotateCcw className="mr-2 h-4 w-4" /> Reset sources
        </Button>
      ) : null}
    </div>
  );

  const calendarSettingsContent = (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-sm font-black">Default view</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">Choose the view remembered for this profile.</span>
        <AndroidAdaptiveSelect
          label="Default calendar view"
          value={calendarView}
          onChange={value => setCalendarView(value as CalendarView)}
          className="control-input mt-2 h-11 w-full"
          options={[{ value: 'month', label: 'Month' }, { value: 'agenda', label: 'Agenda' }]}
        />
      </label>
      <label className="block border-t border-border/50 pt-3">
        <span className="block text-sm font-black">Week starts on</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">Only changes the calendar grid order.</span>
        <AndroidAdaptiveSelect
          label="Week starts on"
          value={String(weekStartsOn)}
          onChange={value => setWeekStartsOn(Number(value) as WeekStartsOn)}
          className="control-input mt-2 h-11 w-full"
          options={[{ value: '0', label: 'Sunday' }, { value: '1', label: 'Monday' }]}
        />
      </label>
      <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black">Work status colors</span>
          <span id="lifehub-work-status-description" className="mt-0.5 block text-xs leading-snug text-muted-foreground">Show Office, WFH, Travel, Holiday, and Leave on calendar dates.</span>
        </span>
        <Switch checked={showWorkStatuses} onCheckedChange={setShowWorkStatuses} aria-describedby="lifehub-work-status-description" aria-label="Show work status colors on calendar dates" />
      </div>
    </div>
  );

  const renderTimeline = (groups: ReturnType<typeof getAgendaGroups>) => (
    <div className="space-y-4">
      {groups.length === 0 ? <EmptyPanel>No visible events in the next 90 days.</EmptyPanel> : groups.map(group => (
        <section key={group.key} aria-labelledby={`calendar-timeline-${group.key}`}>
          <h3 id={`calendar-timeline-${group.key}`} className={`text-sm font-black ${group.key === 'overdue' ? 'text-red-500' : ''}`}>{group.label}</h3>
          <div className="mt-2 space-y-2">
            {group.events.map(event => {
              const visual = getCalendarEventVisual(event);
              return (
                <button key={`${group.key}-${event.source}-${event.id}-${toLocalDateKey(event.date)}`} type="button" onClick={() => openCalendarSource(event)} className="flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-background/45 p-3 text-left hover:border-border hover:bg-muted">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${visual.chipClass}`}><CalendarDays className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <OverflowTooltip text={event.title}><span className="block truncate text-sm font-black">{event.title}</span></OverflowTooltip>
                    <span className="mt-1 block text-xs text-muted-foreground">{formatDate(event.date)}{event.hasScheduledTime ? ` · ${event.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''} · {formatLabel(event.type)}</span>
                  </span>
                  <span className={`shrink-0 text-xs font-black ${group.key === 'overdue' ? 'text-red-500' : 'text-muted-foreground'}`}>{formatRelativeDate(event.date)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  const tabs: Array<{ id: LifeHubTab; label: string; icon: typeof Target }> = [
    { id: 'today', label: 'Today', icon: Target },
    { id: 'tasks', label: 'Tasks', icon: Inbox },
    { id: 'routine', label: 'Routines', icon: Repeat2 },
    { id: 'dates', label: 'Calendar', icon: CalendarDays },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'journal', label: 'Journal', icon: BookOpen },
  ];

  const hasExternalJournalRequest = requestedView === 'journal' || requestedView === 'journal-entry';
  const journalRequest = hasExternalJournalRequest
    ? {
        profileId: requestedProfileId,
        feature: requestedView,
        recordId: requestedRecordId,
        dateKey: requestedDateKey,
        signal: requestedViewSignal,
      }
    : journalOpenRequest
      ? {
          profileId: currentProfileId,
          feature: 'journal-entry',
          recordId: journalOpenRequest.recordId,
          dateKey: journalOpenRequest.dateKey,
          signal: journalOpenRequest.signal,
        }
      : null;

  return (
    <div
      className={`lifehub-screen ${androidPresentation ? 'workspace-standard' : 'workspace-wide'} space-y-4 lg:space-y-5 ${compactMobileMode ? 'compact-section' : ''} ${androidPresentation ? 'android-lifehub' : ''}`}
      data-android-screen={androidPresentation ? 'lifehub' : undefined}
    >
      <header className="sticky top-0 z-30 -mx-2 rounded-2xl border border-border/60 bg-background/90 p-3 backdrop-blur-xl sm:static sm:mx-0 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-page-title">Your day</h1>
            {!compactMobileMode ? (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Tasks, routines, and commitments in one place.</p>
            ) : null}
          </div>

          {activeTab === 'today' ? (
            <DropdownMenu open={quickAddOpen} onOpenChange={setQuickAddOpen}>
              <DropdownMenuTrigger asChild>
                <Button type="button" className="min-h-11">
                  <Plus className="mr-2 h-4 w-4" /> Add
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52" data-caizen-overlay="open">
                {[
                  { label: 'Task', icon: ListChecks, action: () => { openNewTask('task'); } },
                  { label: 'Idea', icon: Lightbulb, action: () => { openNewTask('idea'); } },
                  { label: 'Reminder', icon: Clock3, action: () => { openNewTask('reminder'); } },
                  { label: 'Routine', icon: Repeat2, action: () => { openNewRoutine(); } },
                  { label: 'Calendar event', icon: CalendarDays, action: () => { openNewDate(); } },
                  { label: 'Journal entry', icon: BookOpen, action: () => { setQuickAddOpen(false); openTodayJournal(); } },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.label}
                      onClick={item.action}
                      className="min-h-11 font-semibold"
                    >
                      <Icon className="h-4 w-4 text-primary" /> {item.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <nav className="surface-tabs lifehub-tabs mt-4 flex min-w-0 gap-1 overflow-x-auto rounded-2xl p-1 scrollbar-hide" role="tablist" aria-label="Life Hub sections">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                id={`lifehub-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`lifehub-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={event => {
                  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const currentIndex = tabs.findIndex(item => item.id === tab.id);
                  const nextIndex = event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                  const nextTab = tabs[nextIndex];
                  setActiveTab(nextTab.id);
                  window.requestAnimationFrame(() => document.getElementById(`lifehub-tab-${nextTab.id}`)?.focus({ preventScroll: true }));
                }}
                aria-label={compactMobileMode ? tab.label : undefined}
                className={`lifehub-primary-tab caizen-tab inline-flex min-h-11 min-w-[6.25rem] shrink-0 items-center justify-center rounded-xl px-3 text-xs font-black transition-colors sm:flex-1 sm:text-sm ${
                  activeTab === tab.id
                    ? 'caizen-tab-active text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <Icon className="h-4 w-4" />
                  <span className={compactMobileMode ? 'hidden min-[390px]:inline' : ''}>{tab.label}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {activeTab === 'today' ? (
        <section id="lifehub-panel-today" role="tabpanel" aria-labelledby="lifehub-tab-today" className="motion-panel caizen-tab-panel-motion space-y-5" data-state="active" data-caizen-feature="today">
          <LifeHubTodayView
            summary={todaySummary}
            focusTitle={todayFocus?.title}
            focusDescription={todayFocus ? `${todayFocusReason} · ${'type' in todayFocus ? priorityLabel[todayFocus.priority] : 'Routine'}` : undefined}
            focusKind={todayFocus ? ('type' in todayFocus && todayFocus.type === 'task' ? 'task' : 'routine') : undefined}
            focusIsPinned={Boolean(pinnedFocus)}
            focusPin={activeTodayFocusPin}
            dueTasks={smartTaskSort(dueTodayTasks, 'smart')}
            overdueTasks={smartTaskSort(overdueTasks, 'smart')}
            pendingRoutines={pendingRoutinesToday}
            skippedRoutines={skippedRoutinesToday}
            noDeadlineTaskCount={noDeadlineTasks.length}
            attention={routineAttentionSummary}
            estimatedMinutes={todaySummary.dueTasks.reduce((sum, item) => sum + (item.estimatedMinutes || 0), 0)}
            estimatedTaskCount={todaySummary.dueTasks.filter(item => item.estimatedMinutes).length}
            upcomingEvents={upcomingEvents}
            renderTaskRow={(item, pinned) => (
              <TodayTaskRow
                key={item.id}
                item={item}
                pinned={pinned}
                onPin={() => toggleTodayFocusPin('task', item.id)}
                onComplete={() => completeProductivityItem(item.id)}
                onOpen={() => openEditTask(item)}
              />
            )}
            renderRoutineRow={(item, pinned) => (
              <RoutineTodayRow
                key={item.id}
                item={item}
                now={now}
                linkedSupplementNames={linkedSupplementLabels(item)}
                linkedSkincareNames={linkedSkincareProductLabels(item)}
                linkedEntertainmentLabel={getRoutineEntertainmentLabel(item, mediaItems, books, trashItems)}
                pinned={pinned}
                onPin={() => toggleTodayFocusPin('routine', item.id)}
                onDone={() => completeRoutineFromUi(item, new Date())}
                onAdjustProgress={delta => adjustRoutineProgress(item.id, new Date(), delta)}
                onSetProgress={value => setRoutineProgress(item.id, new Date(), value)}
                onOpen={() => openRoutineContext(item)}
              />
            )}
            onCompleteFocus={() => {
              if (!todayFocus) return;
              if ('type' in todayFocus && todayFocus.type === 'task') completeProductivityItem(todayFocus.id);
              else completeRoutineFromUi(todayFocus as unknown as DailyChecklistItem, new Date());
            }}
            onOpenFocus={() => {
              if (!todayFocus) return;
              if ('type' in todayFocus && todayFocus.type === 'task') openEditTask(todayFocus);
              else {
                setActiveTab('routine');
                setRoutineDate(new Date());
              }
            }}
            onToggleFocusPin={() => {
              if (!todayFocus) return;
              toggleTodayFocusPin('type' in todayFocus && todayFocus.type === 'task' ? 'task' : 'routine', todayFocus.id);
            }}
            onAddTask={() => openNewTask('task')}
            onOpenTasks={() => setActiveTab('tasks')}
            onOpenRoutines={() => setActiveTab('routine')}
            onOpenCalendar={() => setActiveTab('dates')}
            onOpenEvent={openCalendarSource}
          />
          <section className="section-surface overflow-hidden p-4 sm:p-5" aria-labelledby="lifehub-today-journal-title">
            <div className="grid gap-4 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-center">
              {todayJournalEntry && (todayJournalAssetId || todayJournalImageUrl) ? (
                todayJournalAssetId ? (
                  <MediaAssetImage assetId={todayJournalAssetId} profileId={currentProfileId} alt="Today Journal memory" className="h-24 w-full rounded-2xl object-cover sm:h-20" />
                ) : (
                  <img src={todayJournalImageUrl || undefined} alt="Today Journal memory" className="h-24 w-full rounded-2xl object-cover sm:h-20" loading="lazy" referrerPolicy="no-referrer" />
                )
              ) : (
                <span className="grid h-20 w-full place-items-center rounded-2xl border border-border/60 bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-label text-muted-foreground">Journal check-in</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 id="lifehub-today-journal-title" className="text-card-title">{todayJournalEntry ? (todayJournalEntry.title || 'Today’s reflection') : 'No entry yet'}</h2>
                  {todayJournalMood ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{todayJournalMood}</span> : null}
                </div>
                {todayJournalPreview ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{todayJournalPreview}</p> : null}
                {todayJournalEntry && (todayJournalMusic || todayJournalMusicLink) ? (
                  <div className="mt-2 flex max-w-md items-center gap-2 rounded-xl border border-border/50 bg-background/45 px-2.5 py-1.5">
                    <Music className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <OverflowTooltip text={todayJournalMusic?.title || 'Linked music'}><p className="truncate text-xs font-black">{todayJournalMusic?.title || 'Linked music'}</p></OverflowTooltip>
                      {todayJournalMusic?.artist ? <OverflowTooltip text={todayJournalMusic.artist}><p className="truncate text-[11px] text-muted-foreground">{todayJournalMusic.artist}</p></OverflowTooltip> : null}
                    </div>
                    <button type="button" onClick={() => { if (todayJournalMusic && getMusicPlaybackCapabilities(todayJournalMusic).canControlPlayback) playItems(todayJournalMusic.id, [todayJournalMusic]); else { const destination = normalizeExternalWebUrl(todayJournalMusic?.url || todayJournalMusicLink || ''); if (destination) void openExternalLink(destination); } }} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={todayJournalMusic && getMusicPlaybackCapabilities(todayJournalMusic).canControlPlayback ? `Play ${todayJournalMusic.title}` : 'Open linked music'}>{todayJournalMusic && getMusicPlaybackCapabilities(todayJournalMusic).canControlPlayback ? 'Play' : 'Open'}</button>
                  </div>
                ) : null}
              </div>
              <Button type="button" variant={todayJournalEntry ? 'outline' : 'default'} onClick={openTodayJournal} className="w-full shrink-0 rounded-xl sm:w-auto">{todayJournalEntry ? 'Open Journal' : 'Write'}</Button>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === 'tasks' ? (
        <section id="lifehub-panel-tasks" role="tabpanel" aria-labelledby="lifehub-tab-tasks" className="motion-panel caizen-tab-panel-motion space-y-5" data-state="active" data-caizen-feature="tasks">
          <div className="section-surface p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-section-title">Tasks</h2>
                <p className="mt-1 mb-4 max-w-2xl text-sm text-muted-foreground">{inboxViewCopy[inboxType].description}</p>
              </div>
              <Button type="button" onClick={() => openNewTask(inboxType)} className="control-button-primary shrink-0 rounded-2xl">
                <Plus className="mr-2 h-4 w-4" /> Add {inboxType === 'task' ? 'Task' : inboxType === 'idea' ? 'Idea' : 'Reminder'}
              </Button>
            </div>

            <div className="android-lifehub-inbox-tabs grid grid-cols-3 gap-1" role="tablist" aria-label="Tasks, ideas, and reminders">
              {inboxTabOptions.map(({ value, label, count, countLabel, icon: Icon }) => {
                return (
                  <button key={value} id={`lifehub-inbox-tab-${value}`} type="button" role="tab" aria-selected={inboxType === value} aria-label={`${label}, ${count} ${countLabel}`} aria-controls="lifehub-inbox-panel" tabIndex={inboxType === value ? 0 : -1} onClick={() => setInboxType(value)} onKeyDown={event => {
                    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const values = ['task', 'idea', 'reminder'] as const;
                    const currentIndex = values.indexOf(value);
                    const nextIndex = event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? values.length - 1
                        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length;
                    const nextValue = values[nextIndex];
                    setInboxType(nextValue);
                    window.requestAnimationFrame(() => document.getElementById(`lifehub-inbox-tab-${nextValue}`)?.focus({ preventScroll: true }));
                  }} className={`android-lifehub-inbox-tab caizen-tab ${androidPresentation ? 'grid min-h-[4.25rem] grid-rows-[minmax(0,1fr)_auto] content-center items-center justify-items-center gap-0.5 px-1.5 sm:min-h-[4.5rem] sm:px-3 sm:text-sm' : 'inline-flex min-h-11 items-center justify-center gap-1.5 px-2 py-2'} rounded-xl text-center text-xs font-black transition-colors ${inboxType === value ? 'caizen-tab-active text-foreground' : 'text-muted-foreground'}`}>
                    <span className="inline-flex min-w-0 items-center justify-center gap-1.5 leading-none">
                      <Icon className={`size-4 shrink-0 ${inboxType === value ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                      <span>{label}</span>
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold leading-none sm:text-[11px] ${inboxType === value ? 'text-foreground/75' : 'text-muted-foreground/80'}`}><span className="android-inbox-count-number">{count}</span>{androidPresentation ? <span className="android-inbox-count-label"> {countLabel}</span> : null}</span>
                  </button>
                );
              })}
            </div>

          </div>

          <section ref={inboxPanelRef} id="lifehub-inbox-panel" role="tabpanel" aria-labelledby={`lifehub-inbox-tab-${inboxType}`} className="caizen-tab-panel-motion section-surface p-4 sm:p-5" data-state="active">
            <SectionTitle title={inboxViewCopy[inboxType].title} subtitle={inboxType === 'task' ? undefined : inboxType === 'idea' ? `${visibleInboxItems.length} captured idea${visibleInboxItems.length === 1 ? '' : 's'} · Newest first · Keep ideas here until you convert or archive them` : `${visibleInboxItems.length} active reminder${visibleInboxItems.length === 1 ? '' : 's'} · Chronological`} />
            {inboxType === 'task' && taskSummary ? (
              <p className="mb-4 border-b border-border/50 pb-3 text-sm font-bold text-muted-foreground" aria-live="polite">{taskSummary}</p>
            ) : null}
            <div className={`mb-4 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center ${inboxType === 'task' ? 'md:justify-between' : 'md:justify-start'}`}>
              <SearchField
                wrapperClassName="w-full md:w-auto md:min-w-[14rem] md:max-w-[26.25rem] md:flex-1"
                aria-label={inboxViewCopy[inboxType].searchLabel}
                value={taskSearch}
                onChange={setTaskSearch}
                placeholder={inboxViewCopy[inboxType].placeholder}
              />
              {inboxType === 'task' ? (
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end md:ml-auto md:w-auto md:min-w-0 md:flex-none">
                  {availableTaskTags.length ? (
                    <Select value={taskTagFilter} onValueChange={setTaskTagFilter}>
                      <SelectTrigger aria-label="Filter tasks by tag" className="h-11 w-full sm:w-auto sm:min-w-[10rem]">
                        <SelectValue placeholder="All tags" />
                      </SelectTrigger>
                      <SelectContent className="w-[var(--radix-select-trigger-width)]">
                        <SelectItem value="all">All tags</SelectItem>
                        {availableTaskTags.map(([key, label]) => <SelectItem key={key} value={`tag:${key}`}>{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Select value={taskSort} onValueChange={value => setTaskSort(value as TaskSort)}>
                    <SelectTrigger aria-label="Sort tasks" className="h-11 w-full sm:w-auto sm:min-w-[10rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="w-[var(--radix-select-trigger-width)]">
                      <SelectItem value="smart">Smart order</SelectItem>
                      <SelectItem value="due">Due date</SelectItem>
                      <SelectItem value="priority">Priority</SelectItem>
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="oldest">Oldest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="space-y-3">
              {visibleInboxItems.length === 0 ? (
                <EmptyPanel>{taskSearch ? 'No items match your search.' : inboxType === 'task' ? 'No open tasks. Add something you need to do.' : inboxType === 'idea' ? 'No ideas captured. Save something before you forget it.' : 'No upcoming reminders. Add something you want Caizen to remind you about.'}</EmptyPanel>
              ) : visibleInboxItems.map((item, index) => (
                <div key={item.id}>
                  {inboxType === 'task' && (index === 0 || getTaskTimingGroup(visibleInboxItems[index - 1]) !== getTaskTimingGroup(item)) ? (
                    <h3 className={`${index === 0 ? '' : 'mt-6 '}mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground`}>{getTaskTimingGroup(item) === 'today' ? 'Today' : getTaskTimingGroup(item) === 'upcoming' ? 'Upcoming' : 'Anytime'}</h3>
                  ) : null}
                  {inboxType === 'task' && getTaskTimingGroup(item) === 'today' && (index === 0 || getTaskTimingGroup(visibleInboxItems[index - 1]) !== 'today' || getTaskTimingSubgroup(visibleInboxItems[index - 1]) !== getTaskTimingSubgroup(item)) ? (
                    <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-muted-foreground/80">{getTaskTimingSubgroup(item)}</p>
                  ) : null}
                  {inboxType === 'reminder' && (index === 0 || reminderGroupLabel(visibleInboxItems[index - 1]) !== reminderGroupLabel(item)) ? (
                    <h3 className={`${index === 0 ? '' : 'mt-5 '}mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground`}>{reminderGroupLabel(item)}</h3>
                  ) : null}
                  <TaskCard
                  item={item}
                  androidPresentation={androidPresentation}
                  profileId={currentProfileId}
                  menuOpen={openTaskMenuId === item.id}
                  onToggleMenu={() => setOpenTaskMenuId(current => current === item.id ? null : item.id)}
                  onOpen={() => openEditTask(item)}
                  onOpenConvertedTask={item.convertedToTaskId && productivityItems.some(candidate => candidate.id === item.convertedToTaskId)
                    ? () => {
                        const convertedTask = productivityItems.find(candidate => candidate.id === item.convertedToTaskId);
                        if (convertedTask) {
                          setInboxType('task');
                          openEditTask(convertedTask);
                        }
                      }
                    : undefined}
                  onComplete={() => {
                    if (item.type === 'reminder') {
                      updateProductivityItem(item.id, { status: 'completed', completedAt: new Date(), failedAt: null, deferredAt: null });
                    } else {
                      completeProductivityItem(item.id);
                    }
                  }}
                  onDismiss={() => updateProductivityItem(item.id, { status: 'dropped', failedAt: new Date(), completedAt: null, deferredAt: null })}
                  onConvert={() => {
                    const convertedTaskId = convertIdeaToTask(item.id, item.deadline || null);
                    if (convertedTaskId) setPendingConvertedTaskId(convertedTaskId);
                    setInboxType('task');
                  }}
                  onConvertReminder={() => {
                    setEditingTask({ ...item, type: 'reminder', status: 'pending', deadline: undefined, reminderEnabled: true, showInCalendar: true });
                    setTaskInitialType('reminder');
                    setTaskInitialDeadline(undefined);
                    setTaskModalOpen(true);
                  }}
                  onArchive={() => updateProductivityItem(item.id, { archivedAt: new Date() })}
                  onUnarchive={() => updateProductivityItem(item.id, { archivedAt: null })}
                  onDeferTomorrow={() => {
                    deferProductivityItem(item.id, addLocalDays(new Date(), 1));
                    setOpenTaskMenuId(null);
                  }}
                  onDeferMonday={() => {
                    deferProductivityItem(item.id, nextMonday());
                    setOpenTaskMenuId(null);
                  }}
                  onDrop={() => {
                    dropProductivityItem(item.id);
                    setOpenTaskMenuId(null);
                  }}
                  onDelete={() => {
                    setDeleteTarget({ kind: 'task', item });
                    setOpenTaskMenuId(null);
                  }}
                   linkedGame={getGameIdFromLifeHubRecord(item) ? games.find(game => game.id === getGameIdFromLifeHubRecord(item)) : undefined}
                   onOpenGame={() => {
                     const gameId = getGameIdFromLifeHubRecord(item);
                     if (gameId) navigateTo('entertainment', 'game', gameId);
                   }}
                   linkedSupplement={availableSupplement(item)}
                   linkedSupplementNames={linkedSupplementLabels(item)}
                   onOpenSupplement={() => {
                     const supplementId = availableSupplement(item)?.id;
                     if (supplementId) navigateTo('health', 'supplements', supplementId);
                     else if (getSupplementIdsFromLifeHubRecord(item).length) navigateTo('health', 'supplements');
                   }}
                   linkedSkincareProduct={availableSkincareProduct(item)}
                   linkedSkincareNames={linkedSkincareProductLabels(item)}
                   onOpenSkincareProduct={() => {
                     const productId = availableSkincareProduct(item)?.id;
                     if (productId) navigateTo('skincare', 'product', productId);
                     else if (getSkincareProductIdsFromLifeHubRecord(item).length) navigateTo('skincare');
                   }}
                   linkedBalanceId={getUpcomingMoneyIdFromLifeHubRecord(item)}
                   linkedBalance={(() => {
                     const balanceId = getUpcomingMoneyIdFromLifeHubRecord(item);
                     return balanceId ? resolveUpcomingMoneyTarget(balanceId, upcomingMoneyItems) : undefined;
                   })()}
                   onOpenBalance={() => {
                     const balanceId = getUpcomingMoneyIdFromLifeHubRecord(item);
                     if (balanceId && resolveUpcomingMoneyTarget(balanceId, upcomingMoneyItems)) navigateTo('balance', 'money-item', balanceId);
                   }}
                   linkedWorkId={getWorkItemIdFromLifeHubRecord(item)}
                   linkedWork={(() => {
                     const workItemId = getWorkItemIdFromLifeHubRecord(item);
                     return workItemId ? resolveWorkTarget(workItemId, workItems, trashItems) : undefined;
                   })()}
                   onOpenWork={() => {
                     const workItemId = getWorkItemIdFromLifeHubRecord(item);
                     const target = workItemId ? resolveWorkTarget(workItemId, workItems, trashItems) : undefined;
                     if (workItemId && target && target.state !== 'in-trash') navigateTo('workhub', 'work-item', workItemId);
                   }}
                   linkedHealthId={getHealthTargetFromLifeHubRecord(item)?.entityId}
                   linkedHealth={(() => {
                     const target = getHealthTargetFromLifeHubRecord(item);
                     return target ? resolveHealthTarget(target.type, target.entityId, health?.workoutPlans || [], health?.workoutRoutines || []) : undefined;
                   })()}
                   onOpenHealth={() => {
                     const target = getHealthTargetFromLifeHubRecord(item);
                     if (target && resolveHealthTarget(target.type, target.entityId, health?.workoutPlans || [], health?.workoutRoutines || [])) {
                       navigateTo('health', target.type, target.entityId);
                     }
                   }}
                  />
                </div>
              ))}
           </div>
          </section>

          {inboxType === 'idea' && archivedIdeas.length > 0 ? (
            <section className="section-surface p-4 sm:p-5">
              <button type="button" onClick={() => setShowArchivedIdeas(current => !current)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
                <span>
                  <span className="block text-lg font-black">Archived ideas</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Converted and archived captures stay available here.</span>
                </span>
                <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${showArchivedIdeas ? 'rotate-90' : ''}`} />
              </button>
              {showArchivedIdeas ? (
                <div className="mt-4 space-y-3">
                  {archivedIdeas.map(item => (
                    <TaskCard
                      key={item.id}
                      item={item}
                      androidPresentation={androidPresentation}
                      archived
                      menuOpen={openTaskMenuId === item.id}
                      onToggleMenu={() => setOpenTaskMenuId(current => current === item.id ? null : item.id)}
                      onOpen={() => openEditTask(item)}
                      onOpenConvertedTask={item.convertedToTaskId && productivityItems.some(candidate => candidate.id === item.convertedToTaskId)
                    ? () => {
                        const convertedTask = productivityItems.find(candidate => candidate.id === item.convertedToTaskId);
                        if (convertedTask) {
                          setInboxType('task');
                          openEditTask(convertedTask);
                        }
                      }
                    : undefined}
                      onComplete={() => completeProductivityItem(item.id)}
                      onDismiss={() => undefined}
                      onConvert={() => undefined}
                      onConvertReminder={() => undefined}
                      onArchive={() => undefined}
                      onUnarchive={() => updateProductivityItem(item.id, { archivedAt: null })}
                      onDeferTomorrow={() => undefined}
                      onDeferMonday={() => undefined}
                      onDrop={() => undefined}
                      onDelete={() => {
                    setDeleteTarget({ kind: 'task', item });
                    setOpenTaskMenuId(null);
                  }}
                      profileId={currentProfileId}
                      onOpenGame={() => undefined}
                      onOpenSupplement={() => undefined}
                      onOpenSkincareProduct={() => undefined}
                      onOpenBalance={() => undefined}
                      onOpenWork={() => undefined}
                      onOpenHealth={() => undefined}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="section-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="text-base font-black">Task history</h2>
              <p className="mt-1 text-sm text-muted-foreground">Completed and dropped tasks are grouped with routine outcomes in Activity.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setActiveTab('activity')} className="min-h-11 shrink-0 rounded-xl">Open Activity</Button>
          </section>
        </section>
      ) : null}

      {activeTab === 'routine' ? (
        <section id="lifehub-panel-routine" role="tabpanel" aria-labelledby="lifehub-tab-routine" className="motion-panel caizen-tab-panel-motion space-y-5" data-state="active" data-caizen-feature="routines">
          <Toolbar
            title="Routines"
            description="Schedule realistic repetitions and keep a truthful occurrence history. Skipping is allowed."
          />

            <div id="lifehub-routine-panel-schedule" role="tabpanel" aria-labelledby="lifehub-routine-tab-schedule" className="space-y-5">
              <div className="android-routine-filters scrollbar-hide -mx-1 overflow-x-auto px-1">
                <FilterBar label="Filter routines by frequency" className="min-w-max">
                  {ROUTINE_FILTER_TABS.map(([filter, label]) => (
                    <FilterChip
                      key={filter}
                      selected={routineFilter === filter}
                      onSelectedChange={() => {
                        if (filter === 'monthly') preferredRoutineMonthDay.current = selectedRoutineDate.getDate();
                        setRoutineFilter(filter);
                      }}
                      className="min-h-10 rounded-xl px-4 text-xs font-black sm:text-sm"
                    >
                      {label}
                    </FilterChip>
                  ))}
                </FilterBar>
              </div>

              <section className="android-routine-date-summary section-surface p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-label text-muted-foreground">{routineFilterLabel(routineFilter)} period</p>
                    <h2 className="mt-1 text-section-title">{routinePeriodTitle}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Metrics cover this period. Routine actions apply to {selectedRoutineDayLabel}.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" aria-label={`Previous ${routineFilterLabel(routineFilter).toLowerCase()} period`} onClick={() => setSelectedRoutineDate(current => shiftRoutinePeriodDate(routineFilter, current, -1, preferredRoutineMonthDay.current))} className="rounded-xl"><ChevronLeft className="h-4 w-4" /></Button>
                    {toLocalDateKey(selectedRoutineDate) !== toLocalDateKey(today) ? (
                      <Button type="button" variant="outline" onClick={() => setRoutineDate(new Date())} className="rounded-xl">Go to today</Button>
                    ) : null}
                    <Button type="button" variant="outline" aria-label={`Next ${routineFilterLabel(routineFilter).toLowerCase()} period`} onClick={() => setSelectedRoutineDate(current => shiftRoutinePeriodDate(routineFilter, current, 1, preferredRoutineMonthDay.current))} className="rounded-xl"><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>

                <div className="android-routine-metric-grid mt-4 grid grid-cols-2 divide-x divide-y divide-border/50 border-y border-border/50 sm:grid-cols-4 sm:divide-y-0">
                  {[
                    ['Due', routinePeriodSummary.due],
                    ['Done', routinePeriodSummary.done],
                    ['Skipped', routinePeriodSummary.skipped],
                    ['Progress', `${routinePeriodSummary.progress}%`],
                  ].map(([label, value]) => (
                    <div key={label} className="android-routine-metric-cell p-3 first:pl-0 sm:px-3 sm:first:pl-0">
                      <p className="text-label text-muted-foreground">{label}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
                {toLocalDateKey(selectedRoutineDate) === toLocalDateKey(today) && routineAttentionSummary.remainingMessage ? (
                  <div className="mt-4 rounded-2xl border border-border/60 bg-background/35 px-3 py-2.5" role="status">
                    <p className="text-sm font-bold text-foreground">{routineAttentionSummary.remainingMessage}</p>
                    {routineAttentionSummary.atRiskMessage ? (
                      <p className="mt-1 text-xs font-bold text-amber-600 dark:text-amber-300">{routineAttentionSummary.atRiskMessage}</p>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <div className="flex flex-col gap-3 border-b border-border/50 pb-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-section-title">Scheduled routines</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Routines for {selectedRoutineDayLabel}; actions apply to this day.</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                  {dailyChecklistItems.length ? (
                    <div className="flex items-center gap-2">
                      <label htmlFor="lifehub-show-paused" className="text-xs font-bold text-muted-foreground">Show paused</label>
                      <Switch id="lifehub-show-paused" checked={showPausedRoutines} onCheckedChange={setShowPausedRoutines} />
                    </div>
                  ) : null}
                  <Button type="button" onClick={openNewRoutine} className="control-button-primary rounded-2xl"><Plus className="mr-2 h-4 w-4" /> Add Routine</Button>
                </div>
              </div>

              {dailyChecklistItems.length === 0 ? (
                <section className="section-surface p-8 text-center">
                  <Repeat2 className="mx-auto h-8 w-8 text-primary" />
                  <h2 className="mt-3 text-xl font-black">Build your first routine set</h2>
                  <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Choose one useful starting point, then shape its schedule and reminders around your real life.</p>
                  <Button type="button" variant="outline" onClick={openNewRoutine} className="mt-5 rounded-xl">Choose a Routine Template</Button>
                </section>
              ) : filteredRoutines.length === 0 ? (
                <EmptyPanel>{routineFilter === 'all' ? 'No routines match this filter.' : `No ${routineFilterLabel(routineFilter).toLowerCase()} routines yet.`}</EmptyPanel>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                        {filteredRoutines.map(item => (
                          <RoutineCard
                            key={item.id}
                            item={item}
                            androidPresentation={androidPresentation}
                            selectedDate={selectedRoutineDate}
                            now={now}
                            onToggle={() => completeRoutineFromUi(item, selectedRoutineDate)}
                            onAdjustProgress={delta => adjustRoutineProgress(item.id, selectedRoutineDate, delta)}
                            onSetProgress={value => setRoutineProgress(item.id, selectedRoutineDate, value)}
                            onSkip={() => skipRoutineOccurrence(item.id, selectedRoutineDate)}
                            onRecover={() => recoverRoutineOccurrence(item.id, selectedRoutineDate)}
                            onResume={() => updateDailyChecklistItem(item.id, { active: true })}
                            onPause={() => updateDailyChecklistItem(item.id, { active: false })}
                            onEdit={() => openEditRoutine(item)}
                            onDelete={() => setDeleteTarget({ kind: 'routine', item })}
                            onOpenLinked={() => openRoutineContext(item, selectedRoutineDate)}
                            linkedEntertainmentLabel={getRoutineEntertainmentLabel(item, mediaItems, books, trashItems)}
                            linkedGame={getGameIdFromLifeHubRecord(item) ? games.find(game => game.id === getGameIdFromLifeHubRecord(item)) : undefined}
                            onOpenGame={() => {
                     const gameId = getGameIdFromLifeHubRecord(item);
                     if (gameId) navigateTo('entertainment', 'game', gameId);
                   }}
                            linkedSupplement={availableSupplement(item)}
                            linkedSupplementNames={linkedSupplementLabels(item)}
                            supplementCompletionNote={getRoutineOccurrence(item, selectedRoutineDate)?.note}
                            onOpenSupplement={() => {
                     const supplementId = availableSupplement(item)?.id;
                     if (supplementId) navigateTo('health', 'supplements', supplementId);
                     else if (getSupplementIdsFromLifeHubRecord(item).length) navigateTo('health', 'supplements');
                   }}
                            linkedSkincareProduct={availableSkincareProduct(item)}
                            linkedSkincareNames={linkedSkincareProductLabels(item)}
                            onOpenSkincareProduct={() => {
                     const productId = availableSkincareProduct(item)?.id;
                     if (productId) navigateTo('skincare', 'product', productId);
                     else if (getSkincareProductIdsFromLifeHubRecord(item).length) navigateTo('skincare');
                   }}
                            linkedBalanceId={getUpcomingMoneyIdFromLifeHubRecord(item)}
                            linkedBalance={(() => {
                     const balanceId = getUpcomingMoneyIdFromLifeHubRecord(item);
                     return balanceId ? resolveUpcomingMoneyTarget(balanceId, upcomingMoneyItems) : undefined;
                   })()}
                            onOpenBalance={() => {
                     const balanceId = getUpcomingMoneyIdFromLifeHubRecord(item);
                     if (balanceId && resolveUpcomingMoneyTarget(balanceId, upcomingMoneyItems)) navigateTo('balance', 'money-item', balanceId);
                   }}
                            linkedWorkId={getWorkItemIdFromLifeHubRecord(item)}
                            linkedWork={(() => {
                     const workItemId = getWorkItemIdFromLifeHubRecord(item);
                     return workItemId ? resolveWorkTarget(workItemId, workItems, trashItems) : undefined;
                   })()}
                            onOpenWork={() => {
                     const workItemId = getWorkItemIdFromLifeHubRecord(item);
                     const target = workItemId ? resolveWorkTarget(workItemId, workItems, trashItems) : undefined;
                     if (workItemId && target && target.state !== 'in-trash') navigateTo('workhub', 'work-item', workItemId);
                   }}
                            linkedHealthId={getHealthTargetFromLifeHubRecord(item)?.entityId}
                            linkedHealth={(() => {
                     const target = getHealthTargetFromLifeHubRecord(item);
                     return target ? resolveHealthTarget(target.type, target.entityId, health?.workoutPlans || [], health?.workoutRoutines || []) : undefined;
                   })()}
                            onOpenHealth={() => {
                     const target = getHealthTargetFromLifeHubRecord(item);
                     if (target && resolveHealthTarget(target.type, target.entityId, health?.workoutPlans || [], health?.workoutRoutines || [])) {
                       navigateTo('health', target.type, target.entityId);
                     }
                   }}
                          />
                        ))}
                </div>
              )}
            </div>

        </section>
      ) : null}

      {activeTab === 'journal' ? (
        <section id="lifehub-panel-journal" role="tabpanel" aria-labelledby="lifehub-tab-journal" className="motion-panel caizen-tab-panel-motion" data-state="active" data-caizen-feature="journal">
          <JournalSection
            onAddClick={() => onAddJournal?.()}
            compactMobileMode={false}
            androidPresentation={androidPresentation}
            requestedProfileId={journalRequest?.profileId}
            requestedFeature={journalRequest?.feature}
            requestedRecordId={journalRequest?.recordId}
            requestedDateKey={journalRequest?.dateKey}
            requestedRecordSignal={journalRequest?.signal}
            onRequestedRecordConsumed={signal => {
              if (journalOpenRequest?.signal === signal) setJournalOpenRequest(null);
              onRequestedViewConsumed?.(signal);
            }}
          />
        </section>
      ) : null}

      {activeTab === 'dates' ? (
        <section id="lifehub-panel-dates" role="tabpanel" aria-labelledby="lifehub-tab-dates" className="motion-panel caizen-tab-panel-motion space-y-5" data-state="active" data-caizen-feature="calendar">
          <section className="section-surface p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-black">Calendar</h2>
                <p className="mt-1 text-sm text-muted-foreground">Planning first. Historical purchases stay optional and off by default.</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" onClick={() => { setActivityInitialView('timeline'); setActiveTab('activity'); }} className="min-h-11 rounded-xl">Open Activity</Button>
                <Button type="button" onClick={() => openNewDate()} className="control-button-primary rounded-2xl">
                  <Plus className="mr-2 h-4 w-4" /> Add Event
                </Button>
              </div>
            </div>

          <div className="android-calendar-controls mt-4 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <span className="px-2 text-xs font-bold text-muted-foreground">Calendar schedule</span>
            </div>

            {calendarSubTab === 'schedule' ? (
              <div className="android-calendar-schedule-tools flex flex-wrap items-center gap-2 sm:ml-auto">
                <SegmentedControl
                  label="Calendar view"
                  value={calendarView}
                  onValueChange={value => setCalendarView(value as 'month' | 'agenda')}
                  size="compact"
                  options={[{ value: 'month', label: 'Month' }, { value: 'agenda', label: 'Agenda' }]}
                  className="android-calendar-view-toggle rounded-xl border-0 bg-muted/40 p-1"
                />

                <div className="android-calendar-action-buttons flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarSearchOpen(current => !current);
                      if (calendarSearchOpen) setCalendarSearch('');
                    }}
                    aria-expanded={calendarSearchOpen}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black ${calendarSearchOpen ? 'border-primary/35 bg-primary/10 text-primary' : 'border-border/60 text-muted-foreground hover:text-foreground'}`}
                  >
                    <Search className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="android-calendar-control-label">Find event</span>
                  </button>
                  {androidPresentation ? (
                    <button type="button" onClick={() => setCalendarSourcesOpen(true)} aria-expanded={calendarSourcesOpen} aria-label={`Calendar sources, ${activeCalendarSourceCount} of 5 active`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground">
                      <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="android-calendar-control-label">Sources · {activeCalendarSourceCount} active</span>
                    </button>
                  ) : (
                    <Popover open={calendarSourcesOpen} onOpenChange={setCalendarSourcesOpen}>
                      <PopoverTrigger asChild>
                        <button type="button" aria-label={`Calendar sources, ${activeCalendarSourceCount} of 5 active`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground">
                          <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="android-calendar-control-label">Sources · {activeCalendarSourceCount} active</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80 p-2">{calendarSourcesContent}</PopoverContent>
                    </Popover>
                  )}
                  {androidPresentation ? (
                    <button type="button" onClick={() => setCalendarSettingsOpen(true)} aria-expanded={calendarSettingsOpen} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground">
                      <Settings2 className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="android-calendar-control-label">Settings</span>
                    </button>
                  ) : (
                    <Popover open={calendarSettingsOpen} onOpenChange={setCalendarSettingsOpen}>
                      <PopoverTrigger asChild>
                        <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground">
                          <Settings2 className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="android-calendar-control-label">Settings</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80 p-4">{calendarSettingsContent}</PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {calendarSubTab === 'schedule' ? (
            <div className="mt-3">
            {calendarSearchOpen ? (
              <div ref={calendarSearchPanelRef} className="calendar-search-panel mt-4 rounded-2xl border border-border/60 bg-background/45 p-3 sm:p-4">
                <SearchField
                  autoFocus
                  aria-label="Search calendar events"
                  value={calendarSearch}
                  onChange={setCalendarSearch}
                  placeholder="Search event title, type, notes, or project..."
                />

                {normalizedCalendarSearch ? (
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {calendarSearchResults.length ? calendarSearchResults.map(event => {
                      const visual = getCalendarEventVisual(event);
                      return (
                        <button
                          key={`search-${event.source}-${event.id}`}
                          type="button"
                          onClick={() => openCalendarSource(event)}
                          className="flex w-full items-center gap-3 rounded-xl border border-border/50 bg-card/55 p-3 text-left hover:border-border hover:bg-muted"
                        >
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${visual.markerClass}`} />
                          <span className="min-w-0 flex-1">
                            <OverflowTooltip text={event.title}><span className="block truncate text-sm font-black">{event.title}</span></OverflowTooltip>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{formatDate(event.date)}{event.hasScheduledTime ? ` · ${event.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''} · {formatLabel(event.type)}</span>
                          </span>
                          <span className="shrink-0 text-xs font-black text-muted-foreground">{formatRelativeDate(event.date)}</span>
                        </button>
                      );
                    }) : (
                      <EmptyPanel>No events match “{calendarSearch.trim()}”.</EmptyPanel>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">Search uses the active calendar filters.</p>
                )}
              </div>
            ) : null}
            </div>
          ) : null}
          </section>

          {calendarSubTab === 'schedule' ? (
            <>
          {calendarView === 'month' ? (
            <>
              <section className="calendar-layout section-surface overflow-hidden p-3 sm:p-5">
                {androidPresentation ? (
                  <AndroidMonthGrid
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    weekStartsOn={weekStartsOn}
                    selected={selectedDay ? toLocalDateKey(selectedDay) : undefined}
                    onSelectDay={(_key, date) => openCalendarDay(date)}
                    compactOverviewGuidance
                    getDayMeta={(_key, date) => {
                      const dayEvents = eventsForDay(calendarEvents, date);
                      const workStatus = showWorkStatuses ? getWorkStatusForDate(date) : null;
                      const workMeta = getCalendarWorkStatus(workStatus);
                      if (!dayEvents.length && !workStatus) return undefined;
                      return {
                        dots: dayEvents.slice(0, 3).map((event, index) => ({
                          key: `${event.source}-${event.id}-${index}`,
                          tone: getAndroidEventTone(event),
                        })),
                        count: dayEvents.length,
                        state: dayEvents.length ? 'has-entry' : undefined,
                        workStatus: workMeta?.tone,
                        label: [
                          dayEvents.length ? `${dayEvents.length} item${dayEvents.length === 1 ? '' : 's'}` : null,
                          getEventTypeSummary(dayEvents),
                          workMeta ? `Work status: ${workMeta.label}` : null,
                        ].filter(Boolean).join(', '),
                      };
                    }}
                  />
                ) : (
                  <>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <button type="button" onClick={() => calendarNavigation.changeMonthFromToolbar(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1, 12))} className="rounded-xl border border-border/60 p-2 text-muted-foreground hover:text-foreground" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button>
                      <h2 aria-live="polite" className="text-lg font-black sm:text-xl">{calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
                      <button type="button" onClick={() => calendarNavigation.changeMonthFromToolbar(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1, 12))} className="rounded-xl border border-border/60 p-2 text-muted-foreground hover:text-foreground" aria-label="Next month"><ChevronRight className="h-5 w-5" /></button>
                    </div>
                    <div role="grid" aria-label={`${calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} calendar`} className="space-y-1 sm:space-y-2">
                      <div role="row" className="grid grid-cols-7 gap-1 text-center text-xs font-black uppercase tracking-wider text-muted-foreground sm:gap-2">
                        {calendarWeekdays.map(day => <div role="columnheader" key={day} className="py-2">{day}</div>)}
                      </div>
                      {calendarRows.map((row, rowIndex) => (
                        <div role="row" className="grid grid-cols-7 gap-1 sm:gap-2" key={`calendar-row-${rowIndex}`}>
                        {row.map(day => {
                        const dayEvents = eventsForDay(calendarEvents, day);
                        const currentMonth = day.getMonth() === calendarMonth.getMonth();
                        const today = toLocalDateKey(day) === toLocalDateKey(new Date());
                        const workStatus = showWorkStatuses ? getWorkStatusForDate(day) : null;
                        const workMeta = getCalendarWorkStatus(workStatus);
                        return (
                          <button
                            {...calendarNavigation.getCellProps(day)}
                            key={toLocalDateKey(day)}
                            type="button"
                            role="gridcell"
                            onClick={() => openCalendarDay(day)}
                            aria-label={`${formatDate(day)}${dayEvents.length ? `, ${dayEvents.length} calendar item${dayEvents.length === 1 ? '' : 's'}` : ''}${getEventTypeSummary(dayEvents) ? `, ${getEventTypeSummary(dayEvents)}` : ''}${workMeta ? `, work status ${workMeta.label}` : ''}`}
                            aria-current={today ? 'date' : undefined}
                            aria-selected={selectedDay ? toLocalDateKey(selectedDay) === toLocalDateKey(day) : false}
                            data-work-status={workStatus || undefined}
                            data-today={today || undefined}
                            className={`lifehub-calendar-day relative min-h-[66px] rounded-xl border p-1.5 text-left sm:min-h-[118px] sm:p-2 ${
                              today ? 'border-primary bg-primary/10 ring-1 ring-primary/40' : 'border-border/45 bg-background/40'
                            } ${currentMonth ? '' : 'opacity-35'} hover:border-primary/35`}
                          >
                            <span className="text-xs font-black sm:text-sm">{day.getDate()}</span>
                            {workMeta ? (
                              <span
                                data-work-status={workStatus || undefined}
                                className="lifehub-work-status-badge absolute right-1 top-1 rounded-full border px-1.5 py-0.5 text-[11px] font-black sm:right-2 sm:top-2"
                              >
                                {workMeta.shortLabel}
                              </span>
                            ) : null}
                            <div className="mt-2 space-y-1">
                              {dayEvents.slice(0, 3).map(event => {
                                const visual = getCalendarEventVisual(event);
                                return (
                                  <span key={`${event.source}-${event.id}`} className={`block h-1.5 rounded-full sm:h-auto sm:truncate sm:px-1.5 sm:py-1 sm:text-[11px] sm:font-bold ${visual.chipClass}`}>
                                    <span className="hidden sm:inline">{event.title}</span>
                                  </span>
                                );
                              })}
                              {dayEvents.length > 3 ? <span className="block text-[11px] font-bold text-muted-foreground">+{dayEvents.length - 3}</span> : null}
                            </div>
                          </button>
                        );
                        })}
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-bold text-muted-foreground">
                      {[
                        CALENDAR_EVENT_VISUALS.planning,
                        CALENDAR_EVENT_VISUALS.task,
                        CALENDAR_EVENT_VISUALS.health,
                        CALENDAR_EVENT_VISUALS.work,
                        CALENDAR_EVENT_VISUALS.personal,
                      ].map(item => (
                        <span key={item.label} className="inline-flex items-center gap-1.5">
                          <i className={`h-2 w-2 rounded-full ${item.markerClass}`} /> {item.label}
                        </span>
                      ))}
                    </div>
                    {showWorkStatuses ? (
                      <div className="caizen-calendar-legend" aria-label="Work status colors">
                        {(Object.entries(CALENDAR_WORK_STATUSES) as Array<[CalendarWorkStatus, (typeof CALENDAR_WORK_STATUSES)[CalendarWorkStatus]]>).map(([status, meta]) => (
                          <span key={status}><i data-work-status={status} /> {meta.shortLabel}</span>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            </>
          ) : (
            <section className="calendar-agenda space-y-4">
              <section className="section-surface p-4 sm:p-5">
                <SectionTitle title="Prioritized timeline" subtitle="All visible overdue and upcoming events through the next 90 days." />
                {renderTimeline(agendaGroups)}
              </section>
            </section>
          )}

          {calendarView === 'month' ? (
            <section className="calendar-timeline section-surface p-4 sm:p-5">
              <SectionTitle title="Prioritized timeline" subtitle="Overdue items first, then what is coming through the next 90 days." />
              {renderTimeline(monthTimelineGroups)}
              {prioritizedTimelineEvents.length > 8 ? (
                <Button type="button" variant="outline" className="mt-4 rounded-xl" onClick={() => setCalendarView('agenda')}>Open Agenda</Button>
              ) : null}
            </section>
          ) : null}

          <div className="calendar-summary grid grid-cols-3 gap-2">
            <SmallMetric label="Due soon" value={upcomingEvents.length} />
            <SmallMetric label="Overdue" value={overdueEvents.length} tone={overdueEvents.length ? 'danger' : 'neutral'} />
            <SmallMetric label="Subscriptions" value={subscriptions.length} />
          </div>

          {androidPresentation ? (
            <>
              <CaizenBottomSheet open={calendarSourcesOpen} title="Calendar sources" description={`${activeCalendarSourceCount} of 5 active`} onClose={() => setCalendarSourcesOpen(false)}>
                {calendarSourcesContent}
              </CaizenBottomSheet>
              <CaizenBottomSheet open={calendarSettingsOpen} title="Calendar settings" description="Profile-specific calendar preferences." onClose={() => setCalendarSettingsOpen(false)}>
                {calendarSettingsContent}
              </CaizenBottomSheet>
            </>
          ) : null}

            </>
          ) : null}

        </section>
      ) : null}

      {activeTab === 'activity' ? (
        <section id="lifehub-panel-activity" role="tabpanel" aria-labelledby="lifehub-tab-activity" className={androidPresentation ? 'android-lifehub-activity-panel caizen-tab-panel-motion' : 'caizen-tab-panel-motion'} data-state="active" data-caizen-feature="activity">
          <LifeHubActivityWorkspace
            androidPresentation={androidPresentation}
            initialView={activityInitialView}
            onNavigate={openActivityEntry}
            onOpenTask={item => {
              setActiveTab('tasks');
              openEditTask(item);
            }}
            onReopenTask={item => reopenProductivityItem(item.id)}
            onDeleteTask={item => setDeleteTarget({ kind: 'task', item })}
            onOpenRoutine={item => {
              setActiveTab('routine');
              openEditRoutine(item);
            }}
          />
        </section>
      ) : null}

      <LifeHubTaskModal
        isOpen={taskModalOpen}
        item={editingTask}
        profileId={currentProfileId}
        initialType={taskInitialType}
        initialDeadline={taskInitialDeadline}
        games={games}
        supplements={supplements}
        skincareProducts={skincareProducts}
        workItems={workItems}
        upcomingMoneyItems={upcomingMoneyItems}
        workoutPlans={health?.workoutPlans || []}
        workoutRoutines={health?.workoutRoutines || []}
        trashItems={trashItems}
        androidPresentation={androidPresentation}
        onSave={saveTask}
        onClose={() => {
          setTaskModalOpen(false);
          setEditingTask(null);
        }}
      />

      <RoutineTemplatePicker
        isOpen={routineTemplateOpen}
        onSelect={openRoutineTemplate}
        onClose={() => setRoutineTemplateOpen(false)}
      />

      <LifeHubRoutineModal
        isOpen={routineModalOpen}
        item={editingRoutine}
        template={routineTemplate}
        games={games}
        mediaItems={mediaItems}
        books={books}
        supplements={supplements}
        skincareProducts={skincareProducts}
        workItems={workItems}
        upcomingMoneyItems={upcomingMoneyItems}
        workoutPlans={health?.workoutPlans || []}
        workoutRoutines={health?.workoutRoutines || []}
        trashItems={trashItems}
        androidPresentation={androidPresentation}
        onSave={saveRoutine}
        onClose={() => {
          setRoutineModalOpen(false);
          setEditingRoutine(null);
          setRoutineTemplate(null);
        }}
      />

      <SkincareRoutineCompletionModal
        isOpen={Boolean(skincareCompletionRoutine)}
        routine={skincareCompletionRoutine}
        products={skincareProducts}
        onComplete={productIds => {
          if (skincareCompletionRoutine) {
            completeSkincareRoutineOccurrence(skincareCompletionRoutine.id, skincareCompletionDate, productIds);
          }
          setSkincareCompletionRoutine(null);
        }}
        onClose={() => setSkincareCompletionRoutine(null)}
      />

      <SupplementRoutineCompletionModal
        isOpen={Boolean(supplementCompletionRoutine)}
        routine={supplementCompletionRoutine}
        supplements={supplements}
        onComplete={supplementIds => {
          if (supplementCompletionRoutine) {
            completeSupplementRoutineOccurrence(supplementCompletionRoutine.id, supplementCompletionDate, supplementIds);
          }
          setSupplementCompletionRoutine(null);
        }}
        onClose={() => setSupplementCompletionRoutine(null)}
      />

      <LifeHubDateModal
        isOpen={dateModalOpen}
        item={editingDate}
        initialDate={dateInitialDate}
        androidPresentation={androidPresentation}
        onSave={saveDate}
        onClose={() => {
          setDateModalOpen(false);
          setEditingDate(null);
        }}
      />

      <LifeHubDayPlannerModal
        isOpen={Boolean(selectedDay)}
        date={selectedDay || new Date()}
        events={selectedDayEvents}
        selectedWorkStatus={showWorkStatuses && selectedDay ? getWorkStatusForDate(selectedDay) : null}
        showWorkStatuses={showWorkStatuses}
        onSetWorkStatus={status => selectedDay && setWorkStatusForDate(selectedDay, status)}
        onAddEvent={() => {
          if (!selectedDay) return;
          const date = selectedDay;
          setSelectedDay(null);
          openNewDate(date);
        }}
        onAddTask={() => {
          if (!selectedDay) return;
          setSelectedDay(null);
          openNewTask('task', toLocalDateKey(selectedDay));
        }}
        onEditEvent={openEditDate}
        onResolveEvent={resolveDateEvent}
        onReopenEvent={event => {
          if (isActionableCalendarDate(event)) resolveImportantDate(event.recordId, 'upcoming');
        }}
        onCompleteTask={event => {
          if (event.source !== 'task' || event.type !== 'task deadline') return;
          completeProductivityItem(event.recordId);
          setSelectedDay(null);
        }}
        onDeleteEvent={event => {
          if (event.source === 'task') {
            const item = productivityItems.find(entry => entry.id === event.recordId);
            if (item) setDeleteTarget({ kind: 'task', item });
          } else if (event.source === 'date') {
            const item = importantDates.find(entry => entry.id === event.recordId);
            if (item) setDeleteTarget({ kind: 'date', item });
          } else if (event.source === 'streak' && event.streakTimelineEntry) {
            setDeleteTarget({ kind: 'streak-event', event });
          }
        }}
        onOpenSource={openCalendarSource}
        onClose={() => setSelectedDay(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={deleteTarget?.kind === 'task' ? 'Delete Life Hub item?' : deleteTarget?.kind === 'routine' ? 'Delete routine?' : deleteTarget?.kind === 'streak-event' ? 'Delete streak timeline entry?' : 'Delete calendar item?'}
        message={deleteTarget?.kind === 'streak-event' ? 'This removes the underlying editable Health streak timeline record and its Calendar projection.' : deleteTarget ? `“${deleteTarget.item.title}” will be moved to Trash.` : 'Delete this item?'}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

    </div>
  );
}

function RoutineTemplatePicker({
  isOpen,
  onSelect,
  onClose,
}: {
  isOpen: boolean;
  onSelect: (template: RoutineTemplatePreset) => void;
  onClose: () => void;
}) {
  if (!isOpen) return null;
  return (
    <CaizenFormDialog
      title="Choose a routine starting point"
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      bodyClassName="max-h-[72dvh] overflow-y-auto"
    >
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Tracking templates connect to evidence Caizen can verify. Every title, schedule, and reminder remains yours to edit.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2" role="list">
        {ROUTINE_TEMPLATES.map(template => (
          <button
            key={template.id}
            type="button"
            role="listitem"
            onClick={() => onSelect(template)}
            className="group flex min-h-20 items-start gap-3 rounded-xl border border-border/60 px-3.5 py-3 text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              {template.automatic ? <Link2 className="size-4" aria-hidden="true" /> : <Repeat2 className="size-4" aria-hidden="true" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-black text-foreground">{template.title}</span>
                {template.automatic ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-300">Auto</span> : null}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{template.description}</span>
            </span>
          </button>
        ))}
      </div>
    </CaizenFormDialog>
  );
}

function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="lifehub-section-title mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-black">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action ? <div className="lifehub-section-title-action max-w-full">{action}</div> : null}
    </div>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border/60 bg-background/35 p-5 text-center text-sm text-muted-foreground">{children}</div>;
}

function SmallMetric({ label, value, tone = 'neutral' }: { label: string; value: number | string; tone?: 'neutral' | 'danger' | 'warning' }) {
  const toneClass = tone === 'danger'
    ? 'border-red-500/20 bg-red-500/5'
    : tone === 'warning'
      ? 'border-amber-500/25 bg-amber-500/5'
      : 'border-border/60 bg-card/55';
  const valueClass = tone === 'danger'
    ? 'text-red-400'
    : tone === 'warning'
      ? 'text-amber-600 dark:text-amber-300'
      : '';
  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function ConnectedBadge({ item }: { item: ProductivityItem | DailyChecklistItem }) {
  const label = getLifeHubLinkedContextLabel(item);
  if (!label) return null;
  return (
    <span aria-label={`Connected to ${label}`} className="inline-flex min-h-6 items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary">
      <Link2 className="size-3" aria-hidden="true" /> {label}
    </span>
  );
}

function AutomationBadges({ item }: { item: DailyChecklistItem }) {
  const link = resolveEffectiveLinkedLifeHubLink(item);
  const journalAutomatic = link.kind === 'context' && link.context.section === 'journal' && link.context.type === 'journal-entry';
  if (!item.healthRoutineEvidence && !journalAutomatic) return null;
  return (
    <>
      {item.healthRoutineEvidence ? (
        <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/[0.06] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
          <Sparkles className="size-3" aria-hidden="true" /> Auto · Health
        </span>
      ) : null}
      {journalAutomatic ? (
        <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-violet-500/25 bg-violet-500/[0.06] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-600 dark:text-violet-300">
          <Sparkles className="size-3" aria-hidden="true" /> Auto · Journal
        </span>
      ) : null}
    </>
  );
}

function LinkedProductSummary({ label, names }: { label: string; names: string[] }) {
  if (!names.length) return null;
  return (
    <span className="mt-2 flex max-w-full flex-wrap items-center gap-1.5 text-xs font-bold text-muted-foreground">
      <span className="mr-0.5 shrink-0">{label}:</span>
      {names.map((name, index) => (
        <span key={`${name}-${index}`} className="inline-flex max-w-full items-center rounded-full border border-border/60 bg-background/35 px-2 py-1">
          <OverflowTooltip text={name}><span className="truncate">{name}</span></OverflowTooltip>
        </span>
      ))}
      {names.length > 1 ? <span className="shrink-0 text-[10px] font-black uppercase text-primary">{names.length} linked</span> : null}
    </span>
  );
}

function TodayTaskRow({ item, pinned = false, onPin, onComplete, onOpen }: { item: ProductivityItem; pinned?: boolean; onPin: () => void; onComplete: () => void; onOpen: () => void }) {
  const days = item.deadline ? daysFromToday(item.deadline) : null;
  return (
    <div className="motion-pop flex min-w-0 w-full items-center gap-3 rounded-2xl border border-border/60 bg-background/45 p-3">
      <button type="button" onClick={onComplete} aria-label={`Complete ${item.title}`} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-500"><Circle className="h-4 w-4" /></button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <OverflowTooltip text={item.title}><h3 className="truncate text-sm font-black">{item.title}</h3></OverflowTooltip>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className={`text-xs font-bold ${days != null && days < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>{days == null ? 'No deadline' : formatRelativeDate(item.deadline!)}</p>
          {item.estimatedMinutes ? <span className="text-xs text-muted-foreground">{item.estimatedMinutes} min</span> : null}
          <ConnectedBadge item={item} />
        </div>
      </button>
      <button type="button" onClick={onPin} aria-pressed={pinned} aria-label={pinned ? `Unpin ${item.title} for today` : `Pin ${item.title} for today`} className={`grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${pinned ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Pin className="h-4 w-4" aria-hidden="true" /></button>
      <span className={`max-w-full shrink-0 rounded-full border px-2 py-1 text-[11px] font-black uppercase ${priorityClass[item.priority]}`}>{priorityLabel[item.priority]}</span>
    </div>
  );
}

function RoutineTodayRow({ item, now, linkedSupplementNames, linkedSkincareNames, linkedEntertainmentLabel, pinned = false, onPin, onDone, onAdjustProgress, onSetProgress, onOpen }: { item: DailyChecklistItem; now: Date; linkedSupplementNames: string[]; linkedSkincareNames: string[]; linkedEntertainmentLabel?: string; pinned?: boolean; onPin: () => void; onDone: () => void; onAdjustProgress: (delta: number) => void; onSetProgress: (value: number) => void; onOpen: () => void }) {
  const urgency = getRoutineUrgencyState(item, now, now);
  return (
    <div className="motion-pop flex min-w-0 w-full items-center gap-3 rounded-2xl border border-border/60 bg-background/45 p-3">
      <button type="button" onClick={onDone} aria-label={`Complete ${item.title} for today`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-500"><Circle className="h-4 w-4" /></button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <OverflowTooltip text={item.title}><h3 className="truncate text-sm font-black">{item.title}</h3></OverflowTooltip>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">{item.scheduledTime ? `${item.scheduledTime} · ` : ''}{describeRoutineSchedule(item)}</p>
          <ConnectedBadge item={item} />
          <AutomationBadges item={item} />
        </div>
        <LinkedProductSummary label="Supplement" names={linkedSupplementNames} />
        <LinkedProductSummary label="Skincare" names={linkedSkincareNames} />
        {linkedEntertainmentLabel ? <OverflowTooltip text={linkedEntertainmentLabel}><span className="mt-1 block truncate text-xs font-semibold text-muted-foreground">{linkedEntertainmentLabel}</span></OverflowTooltip> : null}
      </button>
      <button type="button" onClick={onPin} aria-pressed={pinned} aria-label={pinned ? `Unpin ${item.title} for today` : `Pin ${item.title} for today`} className={`grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${pinned ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Pin className="h-4 w-4" aria-hidden="true" /></button>
      {urgency === 'at-risk' ? <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-black uppercase text-amber-600 dark:text-amber-300">Past time</span> : null}
      {item.goal ? <RoutineProgressControls item={item} date={now} onAdjust={onAdjustProgress} onSet={onSetProgress} compact /> : null}
    </div>
  );
}

function getRoutineEntertainmentLabel(item: DailyChecklistItem, mediaItems: MediaItem[], books: BookItem[], trashItems: TrashItem[]): string | undefined {
  const context = item.linkedContext;
  if (context?.section !== 'entertainment') return undefined;
  if (context.type === 'media-item') {
    const media = mediaItems.find(entry => entry.id === context.entityId);
    if (media) return `Media · ${media.title}`;
    const trashed = trashItems.find(entry => entry.source === 'mediaItems' && entry.itemId === context.entityId);
    const data = trashed?.data as { title?: unknown } | undefined;
    return `Media · ${typeof data?.title === 'string' ? data.title : 'Unavailable'}${trashed ? ' · In Trash' : ''}`;
  }
  const book = books.find(entry => entry.id === context.entityId);
  if (book) return `Book · ${book.title}`;
  const trashed = trashItems.find(entry => entry.source === 'books' && entry.itemId === context.entityId);
  const data = trashed?.data as { title?: unknown } | undefined;
  return `Book · ${typeof data?.title === 'string' ? data.title : 'Unavailable'}${trashed ? ' · In Trash' : ''}`;
}

function RoutineProgressControls({ item, date, onAdjust, onSet, compact = false }: { item: DailyChecklistItem; date: Date; onAdjust: (delta: number) => void; onSet: (value: number) => void; compact?: boolean }) {
  const saved = getRoutineProgressForDate(item, date);
  const value = saved?.value ?? 0;
  const target = saved?.target ?? item.goal?.target ?? 1;
  const unit = routineGoalUnitLabel(saved?.unit ?? item.goal?.unit ?? 'items', saved?.customUnit ?? item.goal?.customUnit);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'justify-end' : ''}`}>
      <span className="min-h-8 inline-flex items-center rounded-lg bg-primary/5 px-2 text-xs font-black tabular-nums text-foreground" aria-live="polite">
        {value} / {target} {unit}
      </span>
      <button type="button" disabled={value <= 0} onClick={() => onAdjust(-1)} aria-label={`Reduce ${item.title} progress by one ${unit}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-border/60 text-xs font-black disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">−1</button>
      <button type="button" onClick={() => onAdjust(1)} aria-label={`Add one ${unit} to ${item.title}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-primary/10 text-xs font-black text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">+1</button>
      <button type="button" onClick={() => { setDraft(String(value)); setEditing(current => !current); }} aria-expanded={editing} className="min-h-11 rounded-xl px-2 text-xs font-black text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">{editing ? 'Close amount' : 'Edit amount'}</button>
      {editing ? (
        <form className="flex w-full flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); const parsed = Number(draft); if (Number.isFinite(parsed) && parsed >= 0) { onSet(parsed); setEditing(false); } }}>
          <label className="min-w-28 flex-1 text-xs font-bold text-muted-foreground">
            Amount for this occurrence
            <input type="number" min="0" step="any" inputMode="decimal" value={draft} onChange={event => setDraft(event.target.value)} className="control-input mt-1" aria-label={`Progress amount for ${item.title}`} />
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground">Save</button>
          <button type="button" onClick={() => { setEditing(false); setDraft(String(value)); }} className="min-h-11 rounded-xl border border-border/60 px-3 text-xs font-black">Cancel</button>
        </form>
      ) : null}
    </div>
  );
}

function TaskCard({
  item,
  androidPresentation = false,
  archived = false,
  profileId,
  menuOpen,
  onToggleMenu,
  onOpen,
  onOpenConvertedTask,
  onComplete,
  onDismiss,
  onConvert,
  onConvertReminder,
  onArchive,
  onUnarchive,
  onDeferTomorrow,
  onDeferMonday,
  onDrop,
  onDelete,
  linkedGame,
  onOpenGame,
  linkedSupplement,
  linkedSupplementNames = [],
  onOpenSupplement,
  linkedSkincareProduct,
  linkedSkincareNames = [],
  onOpenSkincareProduct,
  linkedBalanceId,
  linkedBalance,
  onOpenBalance,
  linkedWorkId,
  linkedWork,
  onOpenWork,
  linkedHealthId,
  linkedHealth,
  onOpenHealth,
}: {
  item: ProductivityItem;
  androidPresentation?: boolean;
  archived?: boolean;
  profileId?: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpen: () => void;
  onOpenConvertedTask?: () => void;
  onComplete: () => void;
  onDismiss: () => void;
  onConvert: () => void;
  onConvertReminder: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDeferTomorrow: () => void;
  onDeferMonday: () => void;
  onDrop: () => void;
  onDelete: () => void;
  linkedGame?: Game;
  onOpenGame: () => void;
  linkedSupplement?: Supplement;
  linkedSupplementNames?: string[];
  onOpenSupplement: () => void;
  linkedSkincareProduct?: SkincareProduct;
  linkedSkincareNames?: string[];
  onOpenSkincareProduct: () => void;
  linkedBalanceId?: string;
  linkedBalance?: ResolvedBalanceTarget;
  onOpenBalance: () => void;
  linkedWorkId?: string;
  linkedWork?: ResolvedWorkTarget;
  onOpenWork: () => void;
  linkedHealthId?: string;
  linkedHealth?: ResolvedHealthTarget;
  onOpenHealth: () => void;
}) {
  const Icon = item.type === 'idea' ? Lightbulb : item.type === 'reminder' ? Clock3 : ListChecks;
  const overdue = item.deadline ? daysFromToday(item.deadline) < 0 : false;
  const notePreview = item.description?.split(/\r?\n/).map(line => line.trim()).find(Boolean);
  const linkedContextLines: Array<{ text: string; unavailable?: boolean }> = [];
  if (linkedGame) {
    linkedContextLines.push({ text: `Games · ${linkedGame.title}${linkedGame.hidden ? ' · Archived' : ''}` });
  } else if (linkedSupplementNames.length) {
    linkedContextLines.push({ text: formatTaskLinkedProducts('Supplements', linkedSupplementNames, 'supplements') });
  } else if (linkedSupplement) {
    linkedContextLines.push({ text: `Supplements · ${linkedSupplement.name}${isSupplementExpired(linkedSupplement) ? ' · Expired' : ''}` });
  } else if (linkedSkincareNames.length) {
    linkedContextLines.push({ text: formatTaskLinkedProducts('Skincare', linkedSkincareNames, 'products') });
  } else if (linkedSkincareProduct) {
    linkedContextLines.push({ text: `Skincare · ${linkedSkincareProduct.name}${linkedSkincareProduct.status === 'emptied' ? ' · Finished' : ''}` });
  } else if (linkedBalance) {
    linkedContextLines.push({ text: `Money · ${linkedBalance.title} · ${balanceTargetStateLabel(linkedBalance)}` });
  } else if (linkedBalanceId) {
    linkedContextLines.push({ text: 'Money item unavailable', unavailable: true });
  } else if (linkedWork) {
    linkedContextLines.push({ text: `Work · ${linkedWork.title} · ${workTargetStateLabel(linkedWork.state)}` });
  } else if (linkedWorkId) {
    linkedContextLines.push({ text: 'Work target unavailable', unavailable: true });
  } else if (linkedHealth) {
    linkedContextLines.push({ text: `Health · ${linkedHealth.title} · ${linkedHealth.type === 'workout-plan' ? 'Workout plan' : 'Workout routine'}${linkedHealth.state === 'archived' ? ' · Archived' : ''}` });
  } else if (linkedHealthId) {
    linkedContextLines.push({ text: 'Health target unavailable', unavailable: true });
  }

  if (item.type === 'idea') {
    return (
      <IdeaCard
        item={item}
        androidPresentation={androidPresentation}
        archived={archived}
        profileId={profileId}
        menuOpen={menuOpen}
        onToggleMenu={onToggleMenu}
        onOpen={onOpen}
        onOpenConvertedTask={onOpenConvertedTask}
        onConvert={onConvert}
        onConvertReminder={onConvertReminder}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onDelete={onDelete}
      />
    );
  }

  if (item.type === 'reminder') {
    return (
      <ReminderCard
        item={item}
        androidPresentation={androidPresentation}
        menuOpen={menuOpen}
        onToggleMenu={onToggleMenu}
        onOpen={onOpen}
        onComplete={onComplete}
        onDismiss={onDismiss}
        onDelete={onDelete}
      />
    );
  }

  return (
    <article className="motion-pop relative rounded-2xl border border-border/60 bg-card/55 p-4 transition-colors hover:border-primary/25">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/10 text-primary">
          {item.photoAssetIds?.[0] && profileId ? <MediaAssetImage assetId={item.photoAssetIds[0]} profileId={profileId} alt={`Visual reference for ${item.title}`} className="h-full w-full object-cover" fallback={<Icon className="h-4 w-4" aria-hidden="true" />} /> : normalizeExternalWebUrl(item.visualReferenceUrl) ? <img src={normalizeExternalWebUrl(item.visualReferenceUrl) || undefined} alt={`Visual reference for ${item.title}`} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
        </span>
        <button type="button" onClick={onOpen} aria-label={`Edit task ${item.title}`} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold">
            <Tooltip><TooltipTrigger asChild><span className={overdue ? 'text-red-500 dark:text-red-300' : 'text-foreground'}>{formatTaskDueLabel(item)}</span></TooltipTrigger><TooltipContent>{item.deadline ? `Due ${formatDate(item.deadline)}` : 'No due date'}</TooltipContent></Tooltip>
            <ConnectedBadge item={item} />
            <span className={`font-black ${priorityClass[item.priority].split(' ').find(className => className.startsWith('text-')) || 'text-muted-foreground'}`}>{priorityLabel[item.priority]}</span>
            {item.estimatedMinutes ? <span className="text-muted-foreground">{item.estimatedMinutes} min</span> : null}
            {item.status === 'deferred' ? <span className="text-violet-600 dark:text-violet-300">Deferred</span> : null}
          </div>
          <h3 className="mt-2 break-words font-black">{item.title}</h3>
          {item.tags?.length ? <span className="mt-1 flex flex-wrap gap-1">{item.tags.slice(0, 3).map(tag => <span key={tag} className="rounded-md bg-muted/65 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{tag}</span>)}</span> : null}
          {linkedContextLines[0] ? <p className={`mt-1 line-clamp-1 text-xs font-bold ${linkedContextLines[0].unavailable ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>{linkedContextLines[0].text}</p> : notePreview ? <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{notePreview}</p> : null}
        </button>

        {androidPresentation ? <HealthOverflowMenu
          title="Task actions"
          ariaLabel={`More actions for ${item.title}`}
          androidPresentation
          actions={[
            { label: 'Edit', icon: Pencil, onSelect: onOpen },
            { label: 'Defer to tomorrow', icon: CalendarDays, onSelect: onDeferTomorrow },
            { label: 'Defer to next Monday', icon: CalendarDays, onSelect: onDeferMonday },
            { label: 'Drop task', icon: XCircle, onSelect: onDrop },
            { label: 'Delete task', icon: Trash2, destructive: true, onSelect: onDelete },
          ]}
        /> : <DropdownMenu open={menuOpen} onOpenChange={(next) => { if (next !== menuOpen) onToggleMenu(); }}>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`More actions for ${item.title}`} className="min-h-11 min-w-11 rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><MoreVertical className="h-4 w-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={onOpen} className="text-xs font-black">Edit</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDeferTomorrow} className="text-xs font-black">Defer to tomorrow</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDeferMonday} className="text-xs font-black">Defer to next Monday</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDrop} className="text-xs font-black">Drop task</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete} variant="destructive" className="text-xs font-black">Delete task</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-3">
        <button type="button" onClick={onComplete} aria-label={`Complete ${item.title}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700"><Check className="h-4 w-4" aria-hidden="true" /> Complete</button>
        {linkedGame ? <button type="button" onClick={onOpenGame} aria-label={`Open Games for ${item.title}`} className="min-h-10 rounded-xl border border-primary/25 px-3 text-xs font-black text-primary hover:bg-primary/5">Open game</button> : null}
        {linkedSupplement ? <button type="button" onClick={onOpenSupplement} aria-label={`Open Supplements for ${item.title}`} className="min-h-10 rounded-xl border border-primary/25 px-3 text-xs font-black text-primary hover:bg-primary/5">Open supplement</button> : null}
        {linkedSkincareProduct ? <button type="button" onClick={onOpenSkincareProduct} aria-label={`Open Skincare for ${item.title}`} className="min-h-10 rounded-xl border border-primary/25 px-3 text-xs font-black text-primary hover:bg-primary/5">Open skincare</button> : null}
        {linkedBalance ? <button type="button" onClick={onOpenBalance} aria-label={`Open Money for ${item.title}`} className="min-h-10 rounded-xl border border-primary/25 px-3 text-xs font-black text-primary hover:bg-primary/5">Open Money</button> : null}
        {linkedWork && linkedWork.state !== 'in-trash' ? <button type="button" onClick={onOpenWork} aria-label={`Open Work for ${item.title}`} className="min-h-10 rounded-xl border border-primary/25 px-3 text-xs font-black text-primary hover:bg-primary/5">Open Work</button> : null}
        {linkedHealth ? <button type="button" onClick={onOpenHealth} aria-label={`Open Health for ${item.title}`} className="min-h-10 rounded-xl border border-primary/25 px-3 text-xs font-black text-primary hover:bg-primary/5">Open Health</button> : null}
      </div>
    </article>
  );
}

function IdeaCard({ item, androidPresentation = false, archived, profileId, menuOpen, onToggleMenu, onOpen, onOpenConvertedTask, onConvert, onConvertReminder, onArchive, onUnarchive, onDelete }: {
  item: ProductivityItem;
  androidPresentation?: boolean;
  archived: boolean;
  profileId?: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpen: () => void;
  onOpenConvertedTask?: () => void;
  onConvert: () => void;
  onConvertReminder: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  const visualUrl = normalizeExternalWebUrl(item.visualReferenceUrl) || undefined;
  const visualAssetId = item.photoAssetIds?.[0];
  const converted = Boolean(item.convertedToTaskId);

  return (
    <article className="motion-pop rounded-2xl border border-border/60 bg-card/55 p-4 transition-colors hover:border-primary/25">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          {(visualAssetId || visualUrl) ? (
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted/45">
              {visualAssetId && profileId ? <MediaAssetImage assetId={visualAssetId} profileId={profileId} alt={`Visual reference for ${item.title}`} className="h-full w-full object-cover" fallback={<span className="text-[10px] text-muted-foreground">Unavailable</span>} /> : visualUrl ? <img src={visualUrl} alt={`Visual reference for ${item.title}`} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <span className="text-[10px] text-muted-foreground">Unavailable</span>}
            </span>
          ) : null}
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-primary"><Lightbulb className="size-3" aria-hidden="true" /> Idea</span>
              {converted ? <span className="text-[11px] font-bold text-muted-foreground">Converted to Task</span> : null}
            </span>
            <span className="mt-2 block break-words font-black">{item.title}</span>
            {item.description || item.notes ? <span className="mt-1 block line-clamp-3 text-sm text-muted-foreground">{item.description || item.notes}</span> : null}
            <span className="mt-2 block text-xs font-bold text-muted-foreground">Captured {formatDate(new Date(item.createdAt))}</span>
          </span>
        </button>
        {androidPresentation ? <HealthOverflowMenu
          title="Idea actions"
          ariaLabel={`More actions for ${item.title}`}
          androidPresentation
          actions={[
            { label: 'Edit idea', icon: Pencil, onSelect: onOpen },
            ...(!converted && !archived ? [
              { label: 'Convert to Task', icon: Target, onSelect: onConvert },
              { label: 'Convert to Reminder', icon: Clock3, onSelect: onConvertReminder },
            ] : []),
            ...(!converted && !archived ? [{ label: 'Archive idea', icon: Archive, onSelect: onArchive }] : []),
            ...(archived && !converted ? [{ label: 'Unarchive idea', icon: RotateCcw, onSelect: onUnarchive }] : []),
            { label: 'Delete idea', icon: Trash2, destructive: true, onSelect: onDelete },
          ]}
        /> : <DropdownMenu open={menuOpen} onOpenChange={(next) => { if (next !== menuOpen) onToggleMenu(); }}>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`More actions for ${item.title}`} className="min-h-11 min-w-11 rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><MoreVertical className="size-4" aria-hidden="true" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onOpen} className="text-xs font-black">Edit idea</DropdownMenuItem>
            {!converted && !archived ? <DropdownMenuItem onSelect={onArchive} className="text-xs font-black">Archive idea</DropdownMenuItem> : null}
            {archived && !converted ? <DropdownMenuItem onSelect={onUnarchive} className="text-xs font-black">Unarchive idea</DropdownMenuItem> : null}
            <DropdownMenuItem onSelect={onDelete} variant="destructive" className="text-xs font-black">Delete idea</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
      {!androidPresentation && !archived && !converted ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onConvert} aria-label={`Convert ${item.title} to a task`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground"><Target className="size-4" aria-hidden="true" /> Convert to Task</button>
          <button type="button" onClick={onConvertReminder} aria-label={`Convert ${item.title} to a reminder`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/25 px-3 text-xs font-black text-primary hover:bg-primary/5"><Clock3 className="size-4" aria-hidden="true" /> Convert to Reminder</button>
          <button type="button" onClick={onArchive} aria-label={`Archive ${item.title}`} className="min-h-10 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground">Archive</button>
        </div>
      ) : null}
      {converted ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          {onOpenConvertedTask ? (
            <button type="button" onClick={onOpenConvertedTask} className="min-h-11 rounded-xl border border-primary/25 px-3 text-xs font-black text-primary hover:bg-primary/5">Open converted task</button>
          ) : (
            <span className="text-xs text-muted-foreground">The linked task is no longer available.</span>
          )}
          <span className="text-xs text-muted-foreground">This idea remains linked to its converted task.</span>
        </div>
      ) : null}
    </article>
  );
}

function ReminderCard({ item, androidPresentation = false, menuOpen, onToggleMenu, onOpen, onComplete, onDismiss, onDelete }: {
  item: ProductivityItem;
  androidPresentation?: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpen: () => void;
  onComplete: () => void;
  onDismiss: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="motion-pop rounded-2xl border border-border/60 bg-card/55 p-4 transition-colors hover:border-primary/25">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Clock3 className="size-4" aria-hidden="true" /></span>
          <span className="min-w-0">
            <span className="block break-words font-black">{item.title}</span>
            <span className="mt-1 block text-sm font-bold text-muted-foreground">{item.deadline ? formatDate(new Date(item.deadline)) : 'No date'} · {item.reminderTime || '09:00'}</span>
            <span className="mt-1 block text-xs text-muted-foreground">Notification {item.reminderEnabled && item.deadline ? 'on' : 'off'} · Calendar {item.showInCalendar === false ? 'off' : 'on'}</span>
            {item.description || item.notes ? <span className="mt-2 block line-clamp-2 text-sm text-muted-foreground">{item.description || item.notes}</span> : null}
          </span>
        </button>
        {androidPresentation ? <HealthOverflowMenu
          title="Reminder actions"
          ariaLabel={`More actions for ${item.title}`}
          androidPresentation
          actions={[
            { label: 'Edit reminder', icon: Pencil, onSelect: onOpen },
            { label: 'Mark reminder done', icon: Check, onSelect: onComplete },
            { label: 'Dismiss reminder', icon: XCircle, onSelect: onDismiss },
            { label: 'Delete reminder', icon: Trash2, destructive: true, onSelect: onDelete },
          ]}
        /> : <DropdownMenu open={menuOpen} onOpenChange={(next) => { if (next !== menuOpen) onToggleMenu(); }}>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`More actions for ${item.title}`} className="min-h-11 min-w-11 rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><MoreVertical className="size-4" aria-hidden="true" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onOpen} className="text-xs font-black">Edit reminder</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDismiss} className="text-xs font-black">Dismiss reminder</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete} variant="destructive" className="text-xs font-black">Delete reminder</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
      {!androidPresentation ? <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onComplete} aria-label={`Mark reminder ${item.title} done`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-500/10 px-3 text-xs font-black text-emerald-600 dark:text-emerald-300"><Check className="size-4" aria-hidden="true" /> Done</button>
        <button type="button" onClick={onDismiss} aria-label={`Dismiss reminder ${item.title}`} className="min-h-10 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground">Dismiss</button>
        <button type="button" onClick={onOpen} aria-label={`Edit reminder ${item.title}`} className="min-h-10 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground">Edit</button>
      </div> : null}
    </article>
  );
}

function RoutineCard({
  item,
  androidPresentation = false,
  selectedDate,
  now,
  onToggle,
  onAdjustProgress,
  onSetProgress,
  onSkip,
  onRecover,
  onResume,
  onPause,
  onEdit,
  onDelete,
  onOpenLinked,
  linkedEntertainmentLabel,
  linkedGame,
  onOpenGame,
  linkedSupplement,
  linkedSupplementNames = [],
  supplementCompletionNote,
  onOpenSupplement,
  linkedSkincareProduct,
  linkedSkincareNames = [],
  onOpenSkincareProduct,
  linkedBalanceId,
  linkedBalance,
  onOpenBalance,
  linkedWorkId,
  linkedWork,
  onOpenWork,
  linkedHealthId,
  linkedHealth,
  onOpenHealth,
}: {
  item: DailyChecklistItem;
  androidPresentation?: boolean;
  selectedDate: Date;
  now: Date;
  onToggle: () => void;
  onAdjustProgress: (delta: number) => void;
  onSetProgress: (value: number) => void;
  onSkip: () => void;
  onRecover: () => void;
  onResume: () => void;
  onPause: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenLinked: () => void;
  linkedEntertainmentLabel?: string;
  linkedGame?: Game;
  onOpenGame: () => void;
  linkedSupplement?: Supplement;
  linkedSupplementNames?: string[];
  supplementCompletionNote?: string;
  onOpenSupplement: () => void;
  linkedSkincareProduct?: SkincareProduct;
  linkedSkincareNames?: string[];
  onOpenSkincareProduct: () => void;
  linkedBalanceId?: string;
  linkedBalance?: ResolvedBalanceTarget;
  onOpenBalance: () => void;
  linkedWorkId?: string;
  linkedWork?: ResolvedWorkTarget;
  onOpenWork: () => void;
  linkedHealthId?: string;
  linkedHealth?: ResolvedHealthTarget;
  onOpenHealth: () => void;
}) {
  const status = getRoutineStatusForDate(item, selectedDate);
  const urgency = getRoutineUrgencyState(item, selectedDate, now);
  const periodGuidance = getRoutinePeriodGuidance(item, selectedDate);
  const indicators = getRoutineScheduleIndicator(item, selectedDate);
  const measuredProgress = item.goal ? getRoutineProgressForDate(item, selectedDate) : undefined;
  const linkedGameId = getGameIdFromLifeHubRecord(item);
  const hasLinkedContext = Boolean(item.linkedSection || item.linkedContext || item.linkedGameId || item.linkedEntityId);
  const isJournalLinked = resolveEffectiveLinkedLifeHubLink(item).kind === 'context' && item.linkedContext?.section === 'journal';
  const canOpenLinked = !(linkedWorkId && (!linkedWork || linkedWork.state === 'in-trash')) && !(linkedHealthId && !linkedHealth);
  const hasNonWorkLinkedContext = hasLinkedContext && !isJournalLinked && !linkedWorkId && !linkedHealthId && !linkedBalanceId;
  const displayedSupplementCompletionNote = isSupplementCompletionNote(supplementCompletionNote)
    ? supplementCompletionNote
    : undefined;
  const cardTone = status === 'done'
    ? 'border-emerald-500/25 bg-emerald-500/5'
    : status === 'skipped'
      ? 'border-border/60 bg-muted/30'
      : urgency === 'at-risk'
        ? 'border-amber-500/35 bg-card/55'
        : urgency === 'missed'
          ? 'border-red-500/35 bg-red-500/[0.035]'
          : urgency === 'paused'
            ? 'border-border/45 bg-muted/20'
            : 'border-border/60 bg-card/55';
  const renderLinkedProductSummary = (label: string, names: string[], noun: string, onOpen: () => void) => {
    if (!names.length) return null;
    const summary = names.length === 1
      ? `${label} · ${names[0]}`
      : `${label} · ${names.length} ${noun} linked`;
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mt-2 block min-h-10 max-w-full text-left text-xs font-bold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        aria-label={`Open ${names.length} linked ${noun}`}
      >
        <OverflowTooltip text={summary}><span className="block truncate">{summary}</span></OverflowTooltip>
        {names.length > 1 ? <span className="mt-0.5 block truncate text-[11px] font-semibold text-muted-foreground/80">{names[0]} + {names.length - 1} more</span> : null}
      </button>
    );
  };
  return (
    <article
      className={`caizen-routine-card android-routine-card flex h-full flex-col rounded-3xl border p-4 transition-[background-color,border-color,box-shadow,transform] duration-300 ${cardTone}`}
      data-routine-status={status}
    >
      <div className="min-w-0">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="rounded-full border border-border/55 bg-background/40 px-2 py-0.5 font-bold text-muted-foreground">{formatLabel(item.category || 'personal')}</span>
            <ConnectedBadge item={item} />
            {item.healthRoutineEvidence || isJournalLinked ? (
              <span aria-label="Automatic completion" className="inline-flex min-h-6 items-center gap-1 rounded-full border border-border/60 bg-muted/45 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                <Sparkles className="size-3" aria-hidden="true" /> Automatic
              </span>
            ) : null}
            <span className="text-muted-foreground">· {describeRoutineSchedule(item)}</span>
            {item.scheduledTime ? <span className="font-black text-foreground">· {item.scheduledTime}</span> : null}
            {item.active === false ? <span className="font-bold text-muted-foreground">· Paused</span> : null}
            {urgency === 'at-risk' ? <span className="font-bold text-amber-600 dark:text-amber-300">· Past scheduled time</span> : null}
            {urgency === 'missed' ? <span className="font-bold text-red-600 dark:text-red-300">· Missed</span> : null}
            {urgency === 'skipped' ? <span className="font-semibold text-muted-foreground">· Skipped</span> : null}
            {urgency === 'not-due' && item.active !== false ? <span className="font-semibold text-muted-foreground/70">· Not due</span> : null}
          </div>
          <h3 className="mt-2 text-lg font-black">{item.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{getRoutineCompletionCount(item)} completed occurrence{getRoutineCompletionCount(item) === 1 ? '' : 's'}</p>
          {item.goal ? <p className="mt-1 text-xs font-bold text-primary">{measuredProgress?.value ?? 0} / {measuredProgress?.target ?? item.goal.target} {routineGoalUnitLabel(measuredProgress?.unit ?? item.goal.unit, measuredProgress?.customUnit ?? item.goal.customUnit)} for this occurrence</p> : null}
          {linkedEntertainmentLabel ? <p className="mt-1 text-xs font-semibold text-muted-foreground">{linkedEntertainmentLabel}</p> : null}
          {linkedGame ? (
            <button type="button" onClick={onOpenGame} className="mt-2 inline-flex min-h-10 max-w-full items-center text-left text-xs font-bold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
              Game: {linkedGame.title}{linkedGame.hidden ? ' · Archived' : ''}
            </button>
          ) : linkedGameId ? (
            <span className="mt-2 inline-flex min-h-10 items-center rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 text-xs font-bold text-amber-700 dark:text-amber-300">Related game unavailable</span>
          ) : null}
          {linkedSupplementNames.length ? renderLinkedProductSummary('Supplement', linkedSupplementNames, 'supplements', onOpenSupplement) : linkedSupplement ? (
            <button type="button" onClick={onOpenSupplement} className="mt-2 inline-flex min-h-10 max-w-full items-center text-left text-xs font-bold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
              Supplement: {linkedSupplement.name}
            </button>
          ) : null}
          {displayedSupplementCompletionNote ? (
            <p className="mt-1 text-xs font-semibold text-muted-foreground/80">{displayedSupplementCompletionNote}</p>
          ) : null}
          {linkedSkincareNames.length ? renderLinkedProductSummary('Skincare', linkedSkincareNames, 'products', onOpenSkincareProduct) : linkedSkincareProduct ? (
            <button type="button" onClick={onOpenSkincareProduct} className="mt-2 inline-flex min-h-10 max-w-full items-center text-left text-xs font-bold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
              Skincare: {linkedSkincareProduct.name}{linkedSkincareProduct.status === 'emptied' ? ' · Finished' : ''}
            </button>
          ) : null}
          {linkedBalance ? (
            <button type="button" onClick={onOpenBalance} className="mt-2 inline-flex min-h-10 max-w-full items-center text-left text-xs font-bold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
              Balance: <OverflowTooltip text={linkedBalance.title}><span className="ml-1 truncate">{linkedBalance.title}</span></OverflowTooltip> · {balanceTargetStateLabel(linkedBalance)}
            </button>
          ) : linkedBalanceId ? (
            <span className="mt-2 inline-flex min-h-10 items-center rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 text-xs font-bold text-amber-700 dark:text-amber-300">Balance item unavailable</span>
          ) : null}
          {linkedWork ? (
            <span className="mt-2 inline-flex min-h-10 max-w-full items-center text-xs font-bold text-muted-foreground">
              Work: <OverflowTooltip text={linkedWork.title}><span className="truncate">{linkedWork.title}</span></OverflowTooltip> · {workTargetStateLabel(linkedWork.state)}
            </span>
          ) : linkedWorkId ? (
            <span className="mt-2 inline-flex min-h-10 items-center rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 text-xs font-bold text-amber-700 dark:text-amber-300">Work target unavailable</span>
          ) : null}
          {linkedHealth ? (
            <span className="mt-2 inline-flex min-h-10 items-center text-xs font-bold text-muted-foreground">
              Health: {linkedHealth.title} · {linkedHealth.type === 'workout-plan' ? 'Workout plan' : 'Workout routine'}{linkedHealth.state === 'archived' ? ' · Archived' : ''}
            </span>
          ) : linkedHealthId ? (
            <span className="mt-2 inline-flex min-h-10 items-center rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 text-xs font-bold text-amber-700 dark:text-amber-300">Health target unavailable</span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex gap-1.5" aria-label={`${item.title} schedule status`}>
        {indicators.map(indicator => (
          <Tooltip key={indicator.key}><TooltipTrigger asChild><span
            aria-label={indicator.accessibleLabel}
            className={`grid h-7 min-w-7 place-items-center rounded-full border px-1 text-[10px] font-black ${
              indicator.state === 'completed'
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-500'
                : indicator.state === 'skipped'
                  ? 'border-border/60 bg-muted text-muted-foreground'
                  : indicator.state === 'missed'
                    ? 'border-red-500/35 bg-red-500/10 text-red-600 dark:text-red-300'
                    : indicator.state === 'at-risk'
                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                      : indicator.state === 'not-scheduled'
                        ? 'border-transparent text-muted-foreground/35'
                        : indicator.state === 'future'
                          ? 'border-border/45 bg-background/30 text-muted-foreground/60'
                          : 'border-primary/35 bg-primary/10 text-primary'
            }`}
          >
            {indicator.label}
          </span></TooltipTrigger><TooltipContent>{indicator.accessibleLabel}</TooltipContent></Tooltip>
        ))}
      </div>

      <div className="android-routine-card-actions mt-auto flex flex-wrap items-center gap-2 pt-4">
        {item.goal ? <RoutineProgressControls item={item} date={selectedDate} onAdjust={onAdjustProgress} onSet={onSetProgress} /> : null}
        {item.active === false ? (
          <button type="button" onClick={onResume} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary/10 px-3 text-xs font-black text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Resume routine
          </button>
        ) : status !== 'not-due' ? (
          <>
            <button type="button" onClick={status === 'skipped' ? onRecover : onToggle} aria-pressed={status === 'done'} aria-label={status === 'done' ? `Undo completion for ${item.title}` : status === 'skipped' ? `Recover ${item.title} for ${formatDate(selectedDate)}` : `Complete ${item.title} for ${formatDate(selectedDate)}`} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${status === 'done' ? 'border border-border/60 text-muted-foreground' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'}`}>
              {status === 'done' ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {status === 'done' ? 'Undo' : status === 'skipped' ? 'Recover' : 'Complete'}
            </button>
            {status !== 'done' ? <button type="button" onClick={onSkip} className="min-h-10 rounded-xl border border-border/60 px-3 text-xs font-black text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">Skip</button> : null}
          </>
        ) : periodGuidance ? null : <span className="inline-flex min-h-10 items-center text-xs font-bold text-muted-foreground">Not scheduled for this date</span>}
        {periodGuidance ? <span className="inline-flex min-h-10 items-center text-xs font-bold text-muted-foreground">{periodGuidance}</span> : null}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {linkedWork && linkedWork.state !== 'in-trash' ? <button type="button" onClick={onOpenWork} className="inline-flex min-h-10 items-center gap-2 rounded-xl text-xs font-black text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">Open Work</button> : null}
          {linkedHealth ? <button type="button" onClick={onOpenHealth} className="inline-flex min-h-10 items-center gap-2 rounded-xl text-xs font-black text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">Open Health</button> : null}
          {linkedBalance ? <button type="button" onClick={onOpenBalance} className="inline-flex min-h-10 items-center gap-2 rounded-xl text-xs font-black text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">Open Money</button> : null}
          {isJournalLinked ? <button type="button" onClick={onOpenLinked} className="inline-flex min-h-10 items-center gap-2 rounded-xl text-xs font-black text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"><ExternalLink className="h-4 w-4" aria-hidden="true" /> Open Journal</button> : null}
          {hasNonWorkLinkedContext && canOpenLinked ? <button type="button" onClick={onOpenLinked} className="inline-flex min-h-10 items-center gap-2 rounded-xl text-xs font-black text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"><ExternalLink className="h-4 w-4" aria-hidden="true" /> Open Linked</button> : null}
          {androidPresentation ? <HealthOverflowMenu
            title="Routine actions"
            ariaLabel={`More actions for ${item.title}`}
            androidPresentation
            actions={[
              { label: 'Edit', icon: Pencil, onSelect: onEdit },
              item.active === false
                ? { label: 'Resume routine', icon: RotateCcw, onSelect: onResume }
                : { label: 'Pause routine', icon: Clock3, onSelect: onPause },
              { label: 'Delete', icon: Trash2, destructive: true, onSelect: onDelete },
            ]}
          /> : <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`More actions for ${item.title}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem onSelect={item.active === false ? onResume : onPause}>{item.active === false ? 'Resume routine' : 'Pause routine'}</DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>
      </div>
    </article>
  );
}

function describeRoutineSchedule(item: DailyChecklistItem) {
  if (item.frequency === 'daily') return 'Every day';
  if (item.frequency === 'weekdays') {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (item.weekdays?.length ? item.weekdays : [1, 2, 3, 4, 5]).map(day => labels[day]).join(', ');
  }
  if (item.frequency === 'weekly') return 'Once each week';
  if (item.frequency === 'biweekly') return 'Every two weeks';
  if (item.frequency === 'monthly') return `Monthly · day ${item.dayOfMonth || new Date(item.anchorDate || item.createdAt).getDate()}`;
  if (item.frequency === 'every_x_days') return `Every ${item.intervalDays || 1} days`;
  if (item.frequency === 'specific_weekday') return `Every ${formatLabel(item.weekday || 'Monday')}`;
  return formatLabel(item.frequency);
}
