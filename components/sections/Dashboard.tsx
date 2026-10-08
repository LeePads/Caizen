'use client';

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Coins,
  Droplets,
  Eye,
  EyeOff,
  Gift,
  Heart,
  ListChecks,
  Moon,
  Plus,
  Repeat2,
  Settings2,
  Shield,
  Wallet,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAppContext } from '@/lib/context';
import { AnimatedMetricValue } from '@/components/common/AnimatedMetricValue';
import { getInventoryCurrentValueIfKnown } from '@/lib/collections/inventory-metrics';
import { MochiDashboardBubble } from '@/components/pets/MochiDashboardBubble';
import { getMochiBriefing } from '@/lib/mochi/briefing';
import type { MochiAnalysisContext } from '@/lib/mochi/section-analysis';
import {
  addMochiFloatingVisibilityListener,
  isMochiFloatingHidden,
  setMochiFloatingHidden,
} from '@/lib/mochi/companion-visibility';
import { DEFAULT_PET_PERSONALITY } from '@/lib/pets/normalization';
import { formatPHP } from '@/lib/currency';
import { getUpcomingMoneyStatus, getUpcomingMoneyRemaining, isUpcomingMoneyComplete } from '@/lib/upcoming-money';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { AndroidDismissibleBackdrop, CaizenBottomSheet } from '@/components/native/android-design';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  type DashboardDetail,
  type DashboardPreferences,
} from '@/lib/dashboard-preferences';
import {
  isRoutineDoneForDate,
  isRoutineDueForDate,
} from '@/lib/lifehub/routine-schedule';
import { startOfLocalDay, toLocalDateKey } from '@/lib/lifehub/date-utils';
import { isCalendarWorkStatus } from '@/lib/calendar-work-status';
import { formatLocalDateInput } from '@/lib/date-utils';
import { getEffectiveMilestoneAchievements, evaluateMilestones, MILESTONE_DEFINITIONS } from '@/lib/milestones';
import { TrophyRoomPanel } from '@/components/sections/TrophyRoom';
import { MediaAssetImage } from '@/components/media/MediaAssetImage';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { getMusicPlaybackCapabilities, useMusicPlayer } from '@/lib/music-player';
import { getMusicLinkIdentity } from '@/lib/music-links';
import { deriveJournalPresentation, getJournalPreview } from '@/lib/journal-content';
import { JOURNAL_MOODS } from '@/lib/journal-moods';
import { normalizeExternalWebUrl, openExternalLink } from '@/lib/native/open-link';
import type { QuickAddKind } from '@/lib/quick-add';
import type { DailyChecklistItem, ImportantDateItem, WorkItem } from '@/lib/types';
import { claimRequestSignal, isProfileBoundRequestReady } from '@/lib/section-feature-request';
import { endRuntimeTrace, startRuntimeTrace } from '@/lib/performance-trace';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';

type DashboardCardId =
  | 'todayFocus'
  | 'todayList'
  | 'upcoming'
  | 'lifePulse'
  | 'petCard'
  | 'achievements'
  | 'weeklyReflection'
  | 'worthChecking'
  | 'insights';

type DashboardNavigationTarget =
  | string
  | { section: string; feature?: string; recordId?: string };

type FocusCandidate = {
  id: string;
  title: string;
  detail: string;
  target: DashboardNavigationTarget;
  urgency: number;
  dueAt?: Date;
  kind: 'task' | 'date' | 'routine' | 'work' | 'review';
};

type TodayItem = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  target: DashboardNavigationTarget;
  tone: 'neutral' | 'warning' | 'danger';
  routineId?: string;
};

type UpcomingItem = {
  id: string;
  title: string;
  date: Date;
  detail: string;
  target: DashboardNavigationTarget;
  tone: 'neutral' | 'warning' | 'danger';
};

type PulseState = 'good' | 'attention' | 'quiet';

type PulseItem = {
  label: string;
  state: PulseState;
  summary: string;
  detail: string;
  target: DashboardNavigationTarget;
};

const DAY_MS = 86_400_000;

const CARD_LABELS: Record<DashboardCardId, string> = {
  todayFocus: 'Today Focus',
  todayList: 'Today',
  upcoming: 'Upcoming',
  lifePulse: 'Life Pulse',
  petCard: 'Mochi',
  achievements: 'Milestones',
  weeklyReflection: 'Weekly Reflection',
  worthChecking: 'Worth Checking',
  insights: 'Insights',
};

const CARD_DESCRIPTIONS: Record<DashboardCardId, string> = {
  todayFocus: 'One clear action to move the day forward.',
  todayList: 'Active routines, due tasks, and important items.',
  upcoming: 'The next commitments on your timeline.',
  lifePulse: 'A calm read on the areas you actually use.',
  petCard: 'A quiet companion for useful days.',
  achievements: 'Ten milestones that remember meaningful progress.',
  weeklyReflection: 'A short interpretation instead of a wall of numbers.',
  worthChecking: 'Only stale or genuinely actionable information.',
  insights: 'Optional numbers and broader snapshots.',
};

type DashboardSettingsCardId = Exclude<DashboardCardId, 'petCard' | 'achievements'> | 'motivation';

const DASHBOARD_SETTINGS_CARDS: ReadonlyArray<{
  id: DashboardSettingsCardId;
  label: string;
  description: string;
}> = [
  { id: 'todayList', label: CARD_LABELS.todayList, description: CARD_DESCRIPTIONS.todayList },
  { id: 'upcoming', label: CARD_LABELS.upcoming, description: CARD_DESCRIPTIONS.upcoming },
  { id: 'lifePulse', label: CARD_LABELS.lifePulse, description: CARD_DESCRIPTIONS.lifePulse },
  { id: 'motivation', label: 'Milestones', description: 'Progress and the most recent milestone reached.' },
  { id: 'weeklyReflection', label: CARD_LABELS.weeklyReflection, description: CARD_DESCRIPTIONS.weeklyReflection },
  { id: 'worthChecking', label: CARD_LABELS.worthChecking, description: CARD_DESCRIPTIONS.worthChecking },
  { id: 'insights', label: CARD_LABELS.insights, description: CARD_DESCRIPTIONS.insights },
];

const CORE_CARDS: DashboardCardId[] = [
  'todayFocus',
  'todayList',
  'upcoming',
  'lifePulse',
];

const BALANCED_CARDS: DashboardCardId[] = [
  ...CORE_CARDS,
  'petCard',
  'achievements',
  'weeklyReflection',
];

const DETAILED_CARDS: DashboardCardId[] = [
  ...BALANCED_CARDS,
  'worthChecking',
  'insights',
];

const DASHBOARD_QUICK_ADD_OPTIONS = [
  { label: 'Task', icon: ListChecks, type: 'task' },
  { label: 'Routine', icon: Repeat2, type: 'routine' },
  { label: 'Journal entry', icon: BookOpen, type: 'journal' },
  { label: 'Important date', icon: CalendarDays, type: 'date' },
  { label: 'Food log', icon: Heart, type: 'food' },
  { label: 'Water', icon: Droplets, type: 'water' },
  { label: 'Sleep', icon: Moon, type: 'sleep' },
  { label: 'Work item', icon: Briefcase, type: 'work' },
] as const;

function startOfDay(value: Date | string) {
  return startOfLocalDay(value);
}

function isSameDay(a: Date | string, b: Date | string = new Date()) {
  return toLocalDateKey(a) === toLocalDateKey(b);
}

function getDaysFromToday(value: Date | string) {
  return Math.round((startOfDay(value).getTime() - startOfDay(new Date()).getTime()) / DAY_MS);
}

function isThisWeek(value: Date | string) {
  const date = startOfDay(value);
  const today = startOfDay(new Date());
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function isChecklistDone(item: DailyChecklistItem) {
  return isRoutineDoneForDate(item, new Date());
}

function getNextOccurrence(item: ImportantDateItem) {
  const date = new Date(item.date);
  const today = startOfDay(new Date());

  if (item.repeat === 'monthly') {
    const next = new Date(today.getFullYear(), today.getMonth(), date.getDate());
    if (next < today) next.setMonth(next.getMonth() + 1);
    return next;
  }

  if (item.repeat === 'yearly') {
    const next = new Date(today.getFullYear(), date.getMonth(), date.getDate());
    if (next < today) next.setFullYear(next.getFullYear() + 1);
    return next;
  }

  return date;
}

function formatRelativeDate(date: Date) {
  const days = getDaysFromToday(date);
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return 'Yesterday';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 6) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function describeFreshness(value?: Date | string | null) {
  if (!value) return 'Never updated';
  const days = Math.abs(getDaysFromToday(value));
  if (days === 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  return `Updated ${days} days ago`;
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="android-dashboard-section-heading mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-label text-label-eyebrow text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h2 className={`${eyebrow ? 'mt-1' : ''} text-section-title text-foreground`}>
          {title}
        </h2>
        {description ? (
          <p className="text-body-sm mt-1 leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-background/35 px-4 py-3 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Dashboard({
  preferences = DEFAULT_DASHBOARD_PREFERENCES,
  onPreferencesChange,
  androidCompact = false,
  learningVisible = false,
  onQuickAdd,
  requestedProfileId,
  requestedFeature,
  requestedFeatureSignal = 0,
  onRequestedFeatureConsumed,
}: {
  preferences?: DashboardPreferences;
  onPreferencesChange?: (preferences: DashboardPreferences) => void;
  androidCompact?: boolean;
  learningVisible?: boolean;
  onQuickAdd?: (kind: QuickAddKind) => void;
  requestedProfileId?: string;
  requestedFeature?: string;
  requestedFeatureSignal?: number;
  onRequestedFeatureConsumed?: (signal: number) => void;
}) {
  const {
    wallets = [],
    wishlistItems = [],
    journalEntries = [],
    productivityItems = [],
    dailyChecklistItems = [],
    importantDates = [],
    inventoryItems = [],
    personalVaultItems = [],
    workItems = [],
    health,
    supplements = [],
    mediaItems = [],
    games = [],
    books = [],
    musicItems = [],
    upcomingMoneyItems = [],
    skincareProducts = [],
    careerSkills = [],
    careerCourses = [],
    careerCredentials = [],
    getCurrentProfile,
    getTotalWalletBalance,
    getTotalAssets,
    getTotalSelectedWishlistCost,
    getRemainingBalance,
    pet,
    mochiReaction,
    updateProfile,
    toggleDailyChecklistItem,
    isHydrated,
  } = useAppContext();
  const { playItems } = useMusicPlayer();
  const dashboardRenderStartedAt = startRuntimeTrace('dashboard-render');

  useEffect(() => {
    endRuntimeTrace('dashboard-render', dashboardRenderStartedAt);
  }, [dashboardRenderStartedAt]);

  const [localPreferences, setLocalPreferences] = useState(preferences);
  const [draftPreferences, setDraftPreferences] = useState(preferences);
  const [editingDashboard, setEditingDashboard] = useState(false);
  const [dashboardSetupStep, setDashboardSetupStep] = useState<0 | 1>(0);
  const [showAchievements, setShowAchievements] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [showWorkStatuses, setShowWorkStatuses] = useState(true);
  const [todayJournalCollapsed, setTodayJournalCollapsed] = useState(false);
  const [todayJournalHidden, setTodayJournalHidden] = useState(false);
  const [confirmDashboardDiscard, setConfirmDashboardDiscard] = useState(false);
  const dashboardSetupPanelRef = useRef<HTMLElement>(null);
  const trophyRoomPanelRef = useRef<HTMLElement>(null);
  const dashboardSetupScrollRef = useRef<HTMLDivElement>(null);
  const dashboardSetupScrollPositions = useRef<[number, number]>([0, 0]);
  const consumedFeatureSignalRef = useRef<number | null>(null);

  const {
    close: closeAchievements,
    isClosing: achievementsIsClosing,
  } = useAnimatedOverlayClose({
    isOpen: showAchievements,
    onClose: () => setShowAchievements(false),
  });

  const requestDashboardSetupBack = () => {
    if (dashboardSetupStep > 0) {
      dashboardSetupScrollPositions.current[dashboardSetupStep] =
        dashboardSetupScrollRef.current?.scrollTop ?? 0;
      setDashboardSetupStep(0);
      return;
    }
    requestDashboardSetupClose();
  };

  useOverlayLifecycle(editingDashboard, requestDashboardSetupBack, {
    containerRef: dashboardSetupPanelRef,
    initialFocusSelector: '[data-dashboard-setup-primary="true"]',
    lockScroll: !androidCompact,
    restoreFocus: !androidCompact,
    autoFocus: !androidCompact,
    trapFocus: !androidCompact,
  });

  useOverlayLifecycle(showAchievements, closeAchievements, {
    containerRef: trophyRoomPanelRef,
  });

  useEffect(() => {
    if (!editingDashboard) return;
    const frame = window.requestAnimationFrame(() => {
      dashboardSetupScrollRef.current?.scrollTo({
        top: dashboardSetupScrollPositions.current[dashboardSetupStep],
      });
      dashboardSetupPanelRef.current
        ?.querySelector<HTMLElement>('[data-dashboard-setup-primary="true"]')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dashboardSetupStep, editingDashboard]);

  const cancelDashboardSettings = () => {
    const hasDraftChanges = JSON.stringify(draftPreferences) !== JSON.stringify(localPreferences);
    if (androidCompact && hasDraftChanges) {
      setConfirmDashboardDiscard(true);
      return;
    }
    discardDashboardSettings();
  };

  const discardDashboardSettings = () => {
    setConfirmDashboardDiscard(false);
    setDraftPreferences(localPreferences);
    setDashboardSetupStep(0);
    if (androidCompact) {
      setEditingDashboard(false);
    } else {
      closeDashboardSetup();
    }
  };

  const requestDashboardSetupClose = () => {
    cancelDashboardSettings();
  };

  const {
    close: closeDashboardSetup,
    isClosing: dashboardSetupIsClosing,
  } = useAnimatedOverlayClose({
    isOpen: editingDashboard && !androidCompact,
    onClose: () => setEditingDashboard(false),
  });


  useEffect(() => {
    setLocalPreferences(preferences);
    setDraftPreferences(preferences);
  }, [preferences]);

  const currentProfile = getCurrentProfile?.();
  const profileName = currentProfile?.name || 'Cai';

  useEffect(() => {
    if (typeof window === 'undefined' || !currentProfile?.id) {
      setShowWorkStatuses(true);
      return;
    }

    const readPreference = () => {
      try {
        const stored = JSON.parse(
          localStorage.getItem(`lifehub-preferences:${currentProfile.id}`) || '{}',
        );
        setShowWorkStatuses(stored.showWorkStatuses !== false);
      } catch {
        setShowWorkStatuses(true);
      }
    };

    const handlePreferenceChange = (event: Event) => {
      const detail = (
        event as CustomEvent<{ profileId?: string; showWorkStatuses?: boolean }>
      ).detail;
      if (detail?.profileId && detail.profileId !== currentProfile.id) return;
      if (typeof detail?.showWorkStatuses === 'boolean') {
        setShowWorkStatuses(detail.showWorkStatuses);
        return;
      }
      readPreference();
    };

    readPreference();
    window.addEventListener(
      'life-manager:lifehub-preferences-changed',
      handlePreferenceChange,
    );
    return () => {
      window.removeEventListener(
        'life-manager:lifehub-preferences-changed',
        handlePreferenceChange,
      );
    };
  }, [currentProfile?.id]);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const commitPreferences = (next: DashboardPreferences) => {
    setLocalPreferences(next);
    setDraftPreferences(next);
    onPreferencesChange?.(next);
  };

  const defaultVisibleForDetail = (detail: DashboardDetail) =>
    detail === 'detailed'
      ? DETAILED_CARDS
      : detail === 'balanced'
        ? BALANCED_CARDS
        : CORE_CARDS;

  const isVisible = (id: DashboardCardId) => {
    const explicit = localPreferences.visibility[id];
    if (typeof explicit === 'boolean') return explicit;
    return defaultVisibleForDetail(localPreferences.detail || 'calm').includes(id);
  };

  const navigateTo = (target: DashboardNavigationTarget) => {
    window.dispatchEvent(
      new CustomEvent('life-manager:navigate', { detail: target }),
    );
  };

  const navigateToFeature = (section: string, feature: string) => {
    navigateTo({ section, feature });
  };

  const lifeHubRecordTarget = (
    feature: 'tasks' | 'routine' | 'dates',
    recordId: string,
  ): DashboardNavigationTarget => ({
    section: 'lifehub',
    feature,
    recordId,
  });

  const totalBalance = getTotalWalletBalance?.() || 0;
  const totalAssets = getTotalAssets?.() || 0;
  const activeInventory = inventoryItems.filter(item => item.status !== 'archived');
  const inventoryWithRecordedValue = activeInventory.filter(item => getInventoryCurrentValueIfKnown(item) !== null).length;
  const selectedWishlistCost = getTotalSelectedWishlistCost?.() || 0;
  const remainingBalance = getRemainingBalance?.() || 0;

  const foodEntries = health?.foodEntries || [];
  const activityEntries = health?.activityEntries || [];
  const weightEntries = health?.weightEntries || [];
  const sleepEntries = (health as any)?.sleepEntries || (currentProfile as any)?.sleepEntries || [];
  const completedFoodLogDates = Array.from(
    new Set(
      (health?.foodLogCompletedDates || []).filter(
        (date): date is string => typeof date === 'string' && Boolean(date),
      ),
    ),
  );

  const hasMeaningfulData = Boolean(
    wallets.length ||
      wishlistItems.length ||
      journalEntries.length ||
      productivityItems.length ||
      dailyChecklistItems.length ||
      importantDates.length ||
      inventoryItems.length ||
      personalVaultItems.length ||
      workItems.length ||
      supplements.length ||
      mediaItems.length ||
      games.length ||
      musicItems.length ||
      foodEntries.length ||
      activityEntries.length ||
      weightEntries.length ||
      sleepEntries.length,
  );
  const showGettingStarted = isHydrated && Boolean(currentProfile?.id) && !hasMeaningfulData;

  const todayKey = toLocalDateKey(new Date());
  const todayJournalEntry = useMemo(
    () => [...journalEntries]
      .filter(entry => isSameDay(entry.date))
      .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())[0],
    [journalEntries, todayKey],
  );
  const todayJournalPresentation = useMemo(
    () => todayJournalEntry ? deriveJournalPresentation(todayJournalEntry, normalizeExternalWebUrl) : null,
    [todayJournalEntry],
  );
  const todayJournalMusic = useMemo(() => {
    const link = todayJournalPresentation?.usableMusicLinks[0];
    const identity = link ? getMusicLinkIdentity(link) : null;
    return identity ? musicItems.find(item => getMusicLinkIdentity(item.url) === identity) : undefined;
  }, [musicItems, todayJournalPresentation]);
  const todayJournalMusicLink = todayJournalPresentation?.usableMusicLinks[0] || null;
  const todayJournalAssetId = todayJournalEntry?.photoAssetIds?.find(id => typeof id === 'string' && id.trim())?.trim();
  const todayJournalImageUrl = todayJournalEntry && typeof todayJournalEntry.image === 'string'
    ? normalizeExternalWebUrl(todayJournalEntry.image.trim())
    : null;
  const todayJournalMood = todayJournalPresentation?.mood
    ? JOURNAL_MOODS.find(item => item.value === todayJournalPresentation.mood)?.label
    : null;

  const taskAndRoutineData = useMemo(() => {
    const personalTasks = productivityItems.filter(item => item.type === 'task');
    const completedTasks = personalTasks.filter(item => item.status === 'completed');
    const activeTasks = personalTasks.filter(item => item.status !== 'completed' && item.status !== 'failed' && item.status !== 'dropped');
    const overdueTasks = activeTasks.filter(item => item.deadline && getDaysFromToday(item.deadline) < 0);
    const dueTodayTasks = activeTasks.filter(item => item.deadline && isSameDay(item.deadline));
    const dueSoonTasks = activeTasks.filter(item => {
      if (!item.deadline) return false;
      const days = getDaysFromToday(item.deadline);
      return days > 0 && days <= 7;
    });
    const activeWorkTasks = (workItems as WorkItem[]).filter(item => item.type === 'task' && !['done', 'archived'].includes(item.status));
    const overdueWorkTasks = activeWorkTasks.filter(item => item.dueDate && getDaysFromToday(item.dueDate) < 0);
    const dueTodayWorkTasks = activeWorkTasks.filter(item => item.dueDate && isSameDay(item.dueDate));
    const activeRoutines = dailyChecklistItems.filter(item => item.active !== false && isRoutineDueForDate(item, new Date()));
    const incompleteRoutines = activeRoutines.filter(item => !isChecklistDone(item));
    const completedRoutineCount = activeRoutines.filter(isChecklistDone).length;
    const datedImportantItems = (importantDates as ImportantDateItem[])
      .map(item => ({ ...item, nextDate: getNextOccurrence(item) }))
      .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
    const actionableImportantItems = datedImportantItems.filter(item =>
      !isCalendarWorkStatus(item.type) && item.status !== 'completed' && item.status !== 'dismissed',
    );
    const todayWorkStatuses = showWorkStatuses
      ? datedImportantItems.filter(item => isCalendarWorkStatus(item.type) && isSameDay(item.nextDate))
      : [];
    const dueTodayDates = actionableImportantItems.filter(item => isSameDay(item.nextDate));
    const overdueDates = actionableImportantItems.filter(item => {
      if (item.repeat !== 'none' || item.trackAsOverdue !== true) return false;
      return getDaysFromToday(item.nextDate) < 0;
    });
    return {
      completedTasks,
      activeTasks,
      overdueTasks,
      dueTodayTasks,
      dueSoonTasks,
      activeWorkTasks,
      overdueWorkTasks,
      dueTodayWorkTasks,
      activeRoutines,
      incompleteRoutines,
      completedRoutineCount,
      actionableImportantItems,
      todayWorkStatuses,
      dueTodayDates,
      overdueDates,
    };
  }, [dailyChecklistItems, importantDates, productivityItems, showWorkStatuses, todayKey, workItems]);

  const {
    completedTasks,
    activeTasks,
    overdueTasks,
    dueTodayTasks,
    dueSoonTasks,
    activeWorkTasks,
    overdueWorkTasks,
    dueTodayWorkTasks,
    activeRoutines,
    incompleteRoutines,
    completedRoutineCount,
    actionableImportantItems,
    todayWorkStatuses,
    dueTodayDates,
    overdueDates,
  } = taskAndRoutineData;

  const focusCandidates = useMemo<FocusCandidate[]>(() => [
    ...overdueTasks.map(item => ({
      id: `task:${item.id}`,
      title: item.title,
      detail: `${Math.abs(getDaysFromToday(item.deadline!))} day${Math.abs(getDaysFromToday(item.deadline!)) === 1 ? '' : 's'} overdue · Personal task`,
      target: lifeHubRecordTarget('tasks', item.id),
      urgency: 100 + Math.abs(getDaysFromToday(item.deadline!)),
      dueAt: new Date(item.deadline!),
      kind: 'task' as const,
    })),
    ...overdueWorkTasks.map(item => ({
      id: `work:${item.id}`,
      title: item.title,
      detail: `${Math.abs(getDaysFromToday(item.dueDate!))} day${Math.abs(getDaysFromToday(item.dueDate!)) === 1 ? '' : 's'} overdue · Work`,
      target: 'workhub',
      urgency: 98 + Math.abs(getDaysFromToday(item.dueDate!)),
      dueAt: new Date(item.dueDate!),
      kind: 'work' as const,
    })),
    ...overdueDates.map(item => ({
      id: `date:${item.id}`,
      title: item.title,
      detail: `${Math.abs(getDaysFromToday(item.nextDate))} day${Math.abs(getDaysFromToday(item.nextDate)) === 1 ? '' : 's'} overdue · ${item.type.replace(/_/g, ' ')}`,
      target: lifeHubRecordTarget('dates', formatLocalDateInput(item.nextDate)),
      urgency: 96 + Math.abs(getDaysFromToday(item.nextDate)),
      dueAt: item.nextDate,
      kind: 'date' as const,
    })),
    ...dueTodayTasks.map(item => ({
      id: `task:${item.id}`,
      title: item.title,
      detail: 'Due today · Personal task',
      target: lifeHubRecordTarget('tasks', item.id),
      urgency: 90,
      dueAt: new Date(item.deadline!),
      kind: 'task' as const,
    })),
    ...dueTodayWorkTasks.map(item => ({
      id: `work:${item.id}`,
      title: item.title,
      detail: 'Due today · Work',
      target: 'workhub',
      urgency: 89,
      dueAt: new Date(item.dueDate!),
      kind: 'work' as const,
    })),
    ...dueTodayDates.map(item => ({
      id: `date:${item.id}`,
      title: item.title,
      detail: `Today · ${item.type.replace(/_/g, ' ')}`,
      target: item.projectId
        ? 'workhub'
        : lifeHubRecordTarget('dates', formatLocalDateInput(item.nextDate)),
      urgency: 88,
      dueAt: item.nextDate,
      kind: 'date' as const,
    })),
    ...dueSoonTasks.map(item => ({
      id: `task:${item.id}`,
      title: item.title,
      detail: `${formatRelativeDate(new Date(item.deadline!))} · Personal task`,
      target: lifeHubRecordTarget('tasks', item.id),
      urgency: 70 - getDaysFromToday(item.deadline!),
      dueAt: new Date(item.deadline!),
      kind: 'task' as const,
    })),
    ...incompleteRoutines.slice(0, 4).map(item => ({
      id: `routine:${item.id}`,
      title: item.title,
      detail: `${item.frequency === 'weekly' ? 'Weekly' : 'Today'} routine`,
      target: lifeHubRecordTarget('routine', item.id),
      urgency: item.frequency === 'daily' ? 50 : 40,
      kind: 'routine' as const,
    })),
  ].sort((a, b) => b.urgency - a.urgency), [
    overdueDates,
    overdueTasks,
    overdueWorkTasks,
    dueSoonTasks,
    dueTodayDates,
    dueTodayTasks,
    dueTodayWorkTasks,
    incompleteRoutines,
    todayKey,
  ]);

  const pinnedFocus = focusCandidates.find(
    item => item.id === localPreferences.focusItemId,
  );
  const focusItem: FocusCandidate =
    pinnedFocus ||
    focusCandidates[0] || {
      id: 'review:clear',
      title: 'Your day is clear',
      detail: 'Nothing needs your attention yet. Add a task or routine when you want to plan the day.',
      target: 'dashboard',
      urgency: 0,
      kind: 'review',
    };
  const todayItems = useMemo<TodayItem[]>(() => [
    ...dueTodayTasks.map(item => ({
      id: `today-task:${item.id}`,
      title: item.title,
      detail: 'Due today',
      done: false,
      target: lifeHubRecordTarget('tasks', item.id),
      tone: 'warning' as const,
    })),
    ...overdueTasks.map(item => ({
      id: `overdue-task:${item.id}`,
      title: item.title,
      detail: `${Math.abs(getDaysFromToday(item.deadline!))}d overdue`,
      done: false,
      target: lifeHubRecordTarget('tasks', item.id),
      tone: 'danger' as const,
    })),
    ...dueTodayWorkTasks.map(item => ({
      id: `today-work:${item.id}`,
      title: item.title,
      detail: 'Work task due today',
      done: false,
      target: 'workhub',
      tone: 'warning' as const,
    })),
    ...dueTodayDates.map(item => ({
      id: `today-date:${item.id}`,
      title: item.title,
      detail: item.type.replace(/_/g, ' '),
      done: false,
      target: item.projectId
        ? 'workhub'
        : lifeHubRecordTarget('dates', formatLocalDateInput(item.nextDate)),
      tone: 'warning' as const,
    })),
    ...todayWorkStatuses.map(item => ({
      id: `today-work-status:${item.id}`,
      title: item.title,
      detail: 'Work status',
      done: false,
      target: lifeHubRecordTarget('dates', formatLocalDateInput(item.nextDate)),
      tone: 'neutral' as const,
    })),
    ...activeRoutines.map(item => ({
      id: `routine:${item.id}`,
      title: item.title,
      detail: item.frequency === 'weekly' ? 'Weekly routine' : 'Daily routine',
      done: isChecklistDone(item),
      target: lifeHubRecordTarget('routine', item.id),
      tone: 'neutral' as const,
      routineId: item.id,
    })),
  ], [
    activeRoutines,
    dueTodayDates,
    dueTodayTasks,
    dueTodayWorkTasks,
    overdueTasks,
    todayWorkStatuses,
    todayKey,
  ]);

  const incompleteTodayItems = useMemo(() => todayItems.filter(item => !item.done).slice(0, 6), [todayItems]);
  const completedTodayItems = useMemo(() => todayItems.filter(item => item.done), [todayItems]);

  const upcomingItems = useMemo<UpcomingItem[]>(() => [
    ...actionableImportantItems
      .filter(item => {
        const days = getDaysFromToday(item.nextDate);
        return days >= 0 && days <= 30;
      })
      .map(item => ({
        id: `date:${item.id}`,
        title: item.title,
        date: item.nextDate,
        detail: item.amount
          ? `${item.type.replace(/_/g, ' ')} · ${formatPHP(Number(item.amount || 0))}`
          : item.type.replace(/_/g, ' '),
        target: item.projectId
          ? 'workhub'
          : lifeHubRecordTarget('dates', formatLocalDateInput(item.nextDate)),
        tone:
          getDaysFromToday(item.nextDate) === 0
            ? ('warning' as const)
            : ('neutral' as const),
      })),
    ...activeTasks
      .filter(item => item.deadline && getDaysFromToday(item.deadline) >= 0 && getDaysFromToday(item.deadline) <= 30)
      .map(item => ({
        id: `task:${item.id}`,
        title: item.title,
        date: new Date(item.deadline!),
        detail: 'Personal task',
        target: lifeHubRecordTarget('tasks', item.id),
        tone: getDaysFromToday(item.deadline!) <= 2 ? ('warning' as const) : ('neutral' as const),
      })),
    ...activeWorkTasks
      .filter(item => item.dueDate && getDaysFromToday(item.dueDate) >= 0 && getDaysFromToday(item.dueDate) <= 30)
      .map(item => ({
        id: `work:${item.id}`,
        title: item.title,
        date: new Date(item.dueDate!),
        detail: 'Work task',
        target: 'workhub',
        tone: getDaysFromToday(item.dueDate!) <= 2 ? ('warning' as const) : ('neutral' as const),
      })),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .filter((item, index, array) => array.findIndex(next => next.id === item.id) === index), [
      activeTasks,
      activeWorkTasks,
      actionableImportantItems,
      todayKey,
    ]);

  const dashboardStatusData = useMemo(() => {
    const foodDoneToday = completedFoodLogDates.includes(todayKey);
    const journalLoggedToday = journalEntries.some(entry => isSameDay(entry.date));
    const activityLoggedThisWeek = activityEntries.some(entry => isThisWeek(entry.date));
    const lastBalanceCheckIn = [...((currentProfile as any)?.balanceCheckIns || [])]
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0];
    const upcomingMoneyItems = ((currentProfile as any)?.upcomingMoneyItems || []) as any[];
    const activeUpcomingMoney = upcomingMoneyItems.filter(item => !item.archived && !isUpcomingMoneyComplete(item));
    const overdueUpcomingMoney = activeUpcomingMoney.filter(item => getUpcomingMoneyStatus(item) === 'overdue');
    const dueSoonUpcomingMoney = activeUpcomingMoney.filter(item => {
      if (!item.dueDate) return false;
      const days = getDaysFromToday(item.dueDate);
      return days >= 0 && days <= 7;
    });
    const upcomingOutgoingTotal = activeUpcomingMoney
      .filter(item => item.direction === 'outgoing' && item.reserveFunds !== false)
      .reduce((sum, item) => sum + getUpcomingMoneyRemaining(item), 0);
    return {
      foodDoneToday,
      journalLoggedToday,
      activityLoggedThisWeek,
      lastBalanceCheckIn,
      overdueUpcomingMoney,
      dueSoonUpcomingMoney,
      upcomingOutgoingTotal,
    };
  }, [activityEntries, completedFoodLogDates, currentProfile, journalEntries, todayKey]);

  const {
    foodDoneToday,
    journalLoggedToday,
    activityLoggedThisWeek,
    lastBalanceCheckIn,
    overdueUpcomingMoney,
    dueSoonUpcomingMoney,
    upcomingOutgoingTotal,
  } = dashboardStatusData;

  const pulseItems = useMemo<PulseItem[]>(() => [
    {
      label: 'Tasks',
      state:
        overdueTasks.length + overdueWorkTasks.length > 0
          ? 'attention'
          : activeTasks.length + activeWorkTasks.length > 0
            ? 'good'
            : 'quiet',
      summary:
        overdueTasks.length + overdueWorkTasks.length > 0
          ? 'Needs attention'
          : activeTasks.length + activeWorkTasks.length > 0
            ? 'Moving'
            : 'Quiet',
      detail:
        overdueTasks.length + overdueWorkTasks.length > 0
          ? `${overdueTasks.length + overdueWorkTasks.length} overdue`
          : `${activeTasks.length + activeWorkTasks.length} active`,
      target: 'lifehub',
    },
    {
      label: 'Health',
      state:
        foodEntries.length + activityEntries.length + sleepEntries.length === 0
          ? 'quiet'
          : foodDoneToday || activityLoggedThisWeek
            ? 'good'
            : 'attention',
      summary:
        foodEntries.length + activityEntries.length + sleepEntries.length === 0
          ? 'Not started'
          : foodDoneToday || activityLoggedThisWeek
            ? 'On track'
            : 'Worth checking',
      detail:
        foodDoneToday
          ? 'Food complete today'
          : activityLoggedThisWeek
            ? 'Activity logged this week'
            : 'No recent check-in',
      target: 'health',
    },
    {
      label: 'Money',
      state:
        wallets.length === 0
          ? 'quiet'
          : remainingBalance < 0
            ? 'attention'
            : 'good',
      summary:
        wallets.length === 0
          ? 'Not started'
          : remainingBalance < 0
            ? 'Needs attention'
            : 'Stable',
      detail:
        wallets.length === 0
          ? 'Add a wallet to track your money'
          : `${formatPHP(remainingBalance)} estimated available`,
      target: 'balance',
    },
    {
      label: 'Work',
      state:
        workItems.length === 0
          ? 'quiet'
          : overdueWorkTasks.length > 0
            ? 'attention'
            : 'good',
      summary:
        workItems.length === 0
          ? 'Quiet'
          : overdueWorkTasks.length > 0
            ? 'Needs attention'
            : 'Active',
      detail:
        overdueWorkTasks.length > 0
          ? `${overdueWorkTasks.length} overdue`
          : `${activeWorkTasks.length} active task${activeWorkTasks.length === 1 ? '' : 's'}`,
      target: 'workhub',
    },
    {
      label: 'Personal',
      state:
        journalEntries.length === 0
          ? 'quiet'
          : journalLoggedToday
            ? 'good'
            : 'quiet',
      summary:
        journalEntries.length === 0
          ? 'Not started'
          : journalLoggedToday
            ? 'Reflected today'
            : 'Quiet',
      detail:
        journalEntries.length === 0
          ? 'No journal entries'
          : journalLoggedToday
            ? 'Journal updated'
            : `${journalEntries.length} saved reflections`,
      target: { section: 'lifehub', feature: 'journal' },
    },
    {
      label: 'Inventory',
      state: inventoryItems.length === 0 ? 'quiet' : 'good',
      summary: inventoryItems.length === 0 ? 'Not started' : 'Tracked',
      detail:
        inventoryItems.length === 0
          ? 'Add something you own to start tracking it'
          : `${inventoryItems.length} item${inventoryItems.length === 1 ? '' : 's'} tracked`,
      target: 'inventory',
    },
  ], [
    activityEntries.length,
    activityLoggedThisWeek,
    activeTasks.length,
    activeWorkTasks.length,
    overdueTasks.length,
    overdueWorkTasks.length,
    foodDoneToday,
    foodEntries.length,
    inventoryItems.length,
    journalEntries.length,
    journalLoggedToday,
    remainingBalance,
    sleepEntries.length,
    wallets.length,
    workItems.length,
  ]);

  const expiringSupplements = useMemo(() => supplements.filter(item => {
    if (!item.expiryDate) return false;
    const days = getDaysFromToday(item.expiryDate);
    return days >= 0 && days <= 14;
  }), [supplements, todayKey]);

  const staleWallets =
    wallets.length > 0 &&
    (!lastBalanceCheckIn || Math.abs(getDaysFromToday(lastBalanceCheckIn.completedAt)) > 14);

  const showLifePulse = localPreferences.detail !== 'calm' && isVisible('lifePulse');
  const showWeeklyReflection = isVisible('weeklyReflection');
  const showMotivationalCard = isVisible('petCard') || isVisible('achievements');
  const showWorthChecking = isVisible('worthChecking');
  const showInsights = isVisible('insights');

  const worthChecking = useMemo(() => {
    if (!showWorthChecking) return [];
    return [
    ...(overdueTasks.length + overdueWorkTasks.length + overdueDates.length > 0
      ? [{
          title: 'Overdue items',
          detail: `${overdueTasks.length + overdueWorkTasks.length + overdueDates.length} item${overdueTasks.length + overdueWorkTasks.length + overdueDates.length === 1 ? '' : 's'} need a decision.`,
          target: 'lifehub',
          icon: AlertTriangle,
        }]
      : []),
    ...(overdueUpcomingMoney.length > 0
      ? [{
          title: 'Upcoming money is overdue',
          detail: `${overdueUpcomingMoney.length} payment${overdueUpcomingMoney.length === 1 ? '' : 's'} or receivable${overdueUpcomingMoney.length === 1 ? '' : 's'} need a decision.`,
          target: 'balance',
          icon: AlertTriangle,
        }]
      : []),
    ...(overdueUpcomingMoney.length === 0 && dueSoonUpcomingMoney.length > 0
      ? [{
          title: 'Money due within 7 days',
          detail: `${dueSoonUpcomingMoney.length} upcoming item${dueSoonUpcomingMoney.length === 1 ? '' : 's'} · ${formatPHP(upcomingOutgoingTotal)} reserved.`,
          target: 'balance',
          icon: Wallet,
        }]
      : []),
    ...(staleWallets
      ? [{
          title: 'Money snapshot is getting stale',
          detail: lastBalanceCheckIn
            ? describeFreshness(lastBalanceCheckIn.completedAt)
            : 'Wallet balances have never been reviewed.',
          target: 'balance',
          icon: Wallet,
        }]
      : []),
    ...(expiringSupplements.length > 0
      ? [{
          title: 'Supplements expiring soon',
          detail: `${expiringSupplements.length} item${expiringSupplements.length === 1 ? '' : 's'} within 14 days.`,
          target: 'health',
          icon: Activity,
        }]
      : []),
    ];
  }, [
    dueSoonUpcomingMoney.length,
    expiringSupplements.length,
    lastBalanceCheckIn,
    overdueDates.length,
    overdueTasks.length,
    overdueUpcomingMoney.length,
    overdueWorkTasks.length,
    showWorthChecking,
    staleWallets,
    upcomingOutgoingTotal,
  ]);

  const persistedMilestoneUnlocks = currentProfile?.milestoneUnlocks || [];
  const milestoneData = useMemo(() => ({
    evaluations: currentProfile
      ? evaluateMilestones(currentProfile)
      : MILESTONE_DEFINITIONS.map(definition => ({
          ...definition,
          achieved: false,
          achievedAt: undefined,
        })),
    achievements: currentProfile ? getEffectiveMilestoneAchievements(currentProfile) : new Map(),
  }), [currentProfile]);
  const { evaluations: milestoneEvaluations, achievements: effectiveMilestoneAchievements } = milestoneData;
  const milestones = useMemo(
    () => milestoneEvaluations.map(item => {
      const achievement = effectiveMilestoneAchievements.get(item.id);
      return {
        ...item,
        achieved: Boolean(achievement),
        achievedAt: achievement?.achievedAt,
        source: achievement?.source,
      };
    }),
    [milestoneEvaluations, effectiveMilestoneAchievements],
  );
  const unlockedMilestones = useMemo(() => milestones.filter(item => item.achieved), [milestones]);
  const unseenMilestones = useMemo(() => persistedMilestoneUnlocks.filter(item => !item.seenAt), [persistedMilestoneUnlocks]);
  const recentMilestone = useMemo(() => [...unlockedMilestones]
    .filter(item => item.achievedAt)
    .sort((a, b) => new Date(b.achievedAt!).getTime() - new Date(a.achievedAt!).getTime())[0], [unlockedMilestones]);
  const milestoneAreaCount = useMemo(() => new Set(milestones.map(item => item.area)).size, [milestones]);

  const mochiAnalysisContext = useMemo<MochiAnalysisContext>(() => ({
    now: new Date(),
    profileId: currentProfile?.id || '',
    wallets,
    upcomingMoneyItems,
    wishlistItems,
    inventoryItems,
    skincareProducts,
    foodEntries: health?.foodEntries || [],
    mealTemplateCount: health?.mealTemplates?.length || 0,
    sleepEntries: health?.sleepEntries || [],
    weightEntries: health?.weightEntries || [],
    fastingSessions: health?.fastingSessions || [],
    workoutSessions: health?.workoutSessions || [],
    noXTrackers: health?.noXTrackers || [],
    supplements,
    foodLogCompletedDates: health?.foodLogCompletedDates || [],
    mediaItems,
    games,
    books,
    musicItems,
    productivityItems,
    dailyChecklistItems,
    journalEntries,
    workItems,
    personalVaultItems,
    careerCourses,
    careerCredentials,
    careerSkills,
  }), [
    books,
    careerCourses,
    careerCredentials,
    careerSkills,
    currentProfile?.id,
    dailyChecklistItems,
    games,
    health,
    inventoryItems,
    journalEntries,
    mediaItems,
    musicItems,
    personalVaultItems,
    productivityItems,
    skincareProducts,
    supplements,
    upcomingMoneyItems,
    wallets,
    wishlistItems,
    workItems,
  ]);

  const mochiBriefing = useMemo(
    () => getMochiBriefing(mochiAnalysisContext),
    [mochiAnalysisContext],
  );

  const openMochi = useCallback((observationId?: string) => {
    window.dispatchEvent(new CustomEvent('life-manager:open-pet-modal', {
      detail: { observationId, profileId: currentProfile?.id },
    }));
  }, [currentProfile?.id]);

  const [mochiFloatingHidden, setMochiFloatingHiddenState] = useState(false);

  useEffect(() => {
    const profileId = currentProfile?.id;
    if (!profileId) return;
    const sync = () => setMochiFloatingHiddenState(isMochiFloatingHidden(profileId));
    sync();
    return addMochiFloatingVisibilityListener(sync);
  }, [currentProfile?.id]);

  const hideMochiFloating = useCallback(() => {
    if (!currentProfile?.id) return;
    setMochiFloatingHidden(currentProfile.id, true);
  }, [currentProfile?.id]);

  const openAchievements = useCallback(() => {
    setShowAchievements(true);

    if (!currentProfile?.id || unseenMilestones.length === 0) return;
    const now = new Date();
    updateProfile(currentProfile.id, {
      milestoneUnlocks: persistedMilestoneUnlocks.map(item => ({
        ...item,
        seenAt: item.seenAt || now,
      })),
    });
  }, [currentProfile?.id, persistedMilestoneUnlocks, unseenMilestones.length, updateProfile]);

  useEffect(() => {
    if (
      requestedFeature !== 'milestones' ||
      !isProfileBoundRequestReady({
        isHydrated,
        requestedProfileId,
        currentProfileId: currentProfile?.id || '',
        signal: requestedFeatureSignal,
      }) ||
      !claimRequestSignal(consumedFeatureSignalRef, requestedFeatureSignal)
    ) return;

    openAchievements();
    onRequestedFeatureConsumed?.(requestedFeatureSignal);
  }, [
    currentProfile?.id,
    isHydrated,
    onRequestedFeatureConsumed,
    openAchievements,
    requestedFeature,
    requestedFeatureSignal,
    requestedProfileId,
  ]);

  const weeklySummary = useMemo(() => {
    const taskText =
      overdueTasks.length + overdueWorkTasks.length > 0
        ? `${overdueTasks.length + overdueWorkTasks.length} overdue item${overdueTasks.length + overdueWorkTasks.length === 1 ? '' : 's'} still need a decision`
        : `${activeTasks.length + activeWorkTasks.length} active task${activeTasks.length + activeWorkTasks.length === 1 ? '' : 's'} remain`;
    const routineText =
      activeRoutines.length > 0
        ? `${completedRoutineCount} of ${activeRoutines.length} current routine checks are complete`
        : 'no routines are currently enabled';
    return {
      title:
        overdueTasks.length + overdueWorkTasks.length > 0
          ? 'A focused reset would help'
          : 'Your system looks manageable',
      body: `Right now, ${taskText}, and ${routineText}. ${
        unlockedMilestones.length
          ? `${unlockedMilestones.length} of ${milestones.length} milestones are already part of your record.`
          : 'Your first milestone will take shape through a meaningful committed action.'
      }`,
    };
  }, [
    overdueTasks.length,
    overdueWorkTasks.length,
    activeTasks.length,
    activeWorkTasks.length,
    completedRoutineCount,
    activeRoutines.length,
    unlockedMilestones.length,
    milestones.length,
  ]);

  const hasReviewContent =
    showLifePulse ||
    showWeeklyReflection ||
    showMotivationalCard ||
    showWorthChecking ||
    showInsights;

  const lifePulseContent = showLifePulse ? (
    <section className="section-surface density-panel">
      <SectionHeading
        eyebrow="Overview"
        title="Life Pulse"
        description="Select a section to see how things are going."
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {pulseItems.map(item => {
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => navigateTo(item.target)}
              className="rounded-2xl border border-border/50 bg-background/45 p-3 text-left transition-all hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    item.state === 'good'
                      ? 'bg-emerald-500'
                      : item.state === 'attention'
                        ? 'bg-amber-500'
                        : 'bg-muted-foreground/40'
                  }`}
                  aria-hidden="true"
                />
              </div>
              <p className="mt-3 text-[0.76rem] font-semibold text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-sm font-bold">{item.summary}</p>
              {localPreferences.detail === 'detailed' ? (
                <OverflowTooltip text={item.detail}><p className="mt-1 truncate text-[0.76rem] text-muted-foreground">{item.detail}</p></OverflowTooltip>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  ) : null;

  const weeklyReflectionContent = showWeeklyReflection ? (
    <section className="section-surface density-panel">
      <SectionHeading
        eyebrow="This week"
        title={weeklySummary.title}
        description="A short interpretation of your current momentum."
      />
      <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
        {weeklySummary.body}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { label: `${completedTasks.length} tasks complete`, icon: CheckCircle2 },
          { label: `${completedRoutineCount}/${activeRoutines.length} routines`, icon: Repeat2 },
          { label: `${unlockedMilestones.length} milestones`, icon: CheckCircle2 },
        ].map(item => {
          const Icon = item.icon;
          return (
            <span
              key={item.label}
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-3 py-1.5 text-[0.76rem] font-bold text-muted-foreground"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {item.label}
            </span>
          );
        })}
      </div>
    </section>
  ) : null;

  const motivationalCardContent = showMotivationalCard ? (
    <section className="section-surface density-panel overflow-hidden">
      <div className="min-w-0">
        <p className="text-[0.76rem] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
          Milestones
        </p>
        <p className="mt-1 text-[0.76rem] text-muted-foreground">Meaningful steps, kept in one place.</p>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {unlockedMilestones.length} of {milestones.length} milestones achieved across {milestoneAreaCount} life areas.
          </p>
          {recentMilestone ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Latest:</span>{' '}
              {recentMilestone.name} · Achieved {recentMilestone.achievedAt?.toLocaleDateString()}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Meaningful activity will be remembered here as milestones take shape.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={openAchievements}
          className="min-h-12 shrink-0 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[0.76rem] font-black text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          View milestones
        </button>
      </div>
    </section>
  ) : null;

  const presetCards = (detail: DashboardDetail) => {
    setDraftPreferences(current => ({
      ...current,
      detail,
      visibility: {},
    }));
  };

  const saveDashboardSettings = () => {
    commitPreferences(draftPreferences);
    if (androidCompact) {
      setEditingDashboard(false);
    } else {
      closeDashboardSetup();
    }
  };

  const openDashboardSettings = () => {
    setDraftPreferences(localPreferences);
    setDashboardSetupStep(0);
    dashboardSetupScrollPositions.current = [0, 0];
    setEditingDashboard(true);
  };

  const coreContent = (
    <>
      {showGettingStarted ? (
        <section className="section-surface density-panel border-primary/20 bg-primary/[0.03]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[0.76rem] font-black uppercase tracking-[0.2em] text-primary">Getting started</p>
              <h2 className="mt-2 text-xl font-black sm:text-2xl">Start with one useful thing.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Add a task, wallet, or journal entry and your dashboard will begin to reflect what matters to you.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              { icon: ListChecks, label: 'Plan a task', detail: 'Life Hub', target: { section: 'lifehub', feature: 'tasks' } },
              { icon: Wallet, label: 'Add a wallet', detail: 'Money', target: { section: 'balance', feature: 'wallets' } },
              { icon: BookOpen, label: 'Write an entry', detail: 'Journal', target: { section: 'lifehub', feature: 'journal' } },
            ].map(({ icon: Icon, label, detail, target }) => (
              <button
                key={label}
                type="button"
                onClick={() => navigateTo(target)}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-background/55 px-3 py-2.5 text-left text-sm font-black transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate">{label}</span>
                  <span className="block text-[0.76rem] font-semibold text-muted-foreground">{detail}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-4">
      {todayJournalEntry && !todayJournalHidden ? (
        <section className="section-surface density-panel" aria-labelledby="dashboard-today-journal-title">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.76rem] font-semibold uppercase tracking-[0.16em] text-primary">Personal</p>
              <h2 id="dashboard-today-journal-title" className="mt-1 text-lg font-black">Today Journal</h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip><TooltipTrigger asChild><button
                type="button"
                onClick={() => setTodayJournalCollapsed(value => !value)}
                className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-expanded={!todayJournalCollapsed}
                aria-controls="dashboard-today-journal-content"
                aria-label={todayJournalCollapsed ? 'Expand Today Journal' : 'Collapse Today Journal'}
              >
                <ChevronDown className={`size-4 transition-transform ${todayJournalCollapsed ? '' : 'rotate-180'}`} aria-hidden="true" />
              </button></TooltipTrigger><TooltipContent>{todayJournalCollapsed ? 'Expand' : 'Collapse'}</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><button
                type="button"
                onClick={() => setTodayJournalHidden(true)}
                className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Hide Today Journal"
              >
                <EyeOff className="size-4" aria-hidden="true" />
              </button></TooltipTrigger><TooltipContent>{"Hide"}</TooltipContent></Tooltip>
            </div>
          </div>
          {!todayJournalCollapsed ? (
            <div id="dashboard-today-journal-content" className="mt-4 overflow-hidden rounded-2xl border border-border/50 bg-background/40">
              <div className={todayJournalAssetId || todayJournalImageUrl ? 'android-dashboard-journal-columns grid sm:grid-cols-[minmax(0,11rem)_1fr]' : ''}>
                {todayJournalAssetId ? (
                  <MediaAssetImage assetId={todayJournalAssetId} profileId={currentProfile?.id || ''} alt="Today Journal memory" className="h-32 w-full object-cover sm:h-full sm:min-h-32" />
                ) : todayJournalImageUrl ? (
                  <img src={todayJournalImageUrl} alt="Today Journal memory" className="h-32 w-full object-cover sm:h-full sm:min-h-32" loading="lazy" referrerPolicy="no-referrer" />
                ) : null}
                <div className="min-w-0 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {todayJournalMood ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{todayJournalMood}</span> : null}
                    <OverflowTooltip text={todayJournalEntry.title || 'Today’s reflection'}><p className="truncate text-sm font-black">{todayJournalEntry.title || 'Today’s reflection'}</p></OverflowTooltip>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{getJournalPreview(todayJournalPresentation?.content || { mattered: '', wentWell: '', didntGoWell: '', tomorrow: '', musicLinks: [] }) || 'A journal entry is saved for today.'}</p>
                  {todayJournalMusic || todayJournalMusicLink ? (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/50 bg-background/55 p-2">
                      <div className="min-w-0 flex-1">
                        <OverflowTooltip text={todayJournalMusic?.title || 'Linked music'}><p className="truncate text-xs font-black">{todayJournalMusic?.title || 'Linked music'}</p></OverflowTooltip>
                        {todayJournalMusic?.artist ? <OverflowTooltip text={todayJournalMusic.artist}><p className="truncate text-[11px] text-muted-foreground">{todayJournalMusic.artist}</p></OverflowTooltip> : null}
                      </div>
                      <button type="button" onClick={() => { if (todayJournalMusic && getMusicPlaybackCapabilities(todayJournalMusic).canControlPlayback) playItems(todayJournalMusic.id, [todayJournalMusic]); else { const destination = normalizeExternalWebUrl(todayJournalMusic?.url || todayJournalMusicLink || ''); if (destination) void openExternalLink(destination); } }} className="min-h-11 shrink-0 rounded-xl border border-border/50 px-3 text-xs font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" aria-label={todayJournalMusic && getMusicPlaybackCapabilities(todayJournalMusic).canControlPlayback ? `Play ${todayJournalMusic.title}` : 'Open linked music'}>{todayJournalMusic && getMusicPlaybackCapabilities(todayJournalMusic).canControlPlayback ? 'Play' : 'Open'}</button>
                    </div>
                  ) : null}
                  <button type="button" onClick={() => navigateTo({ section: 'lifehub', feature: 'journal-entry', recordId: todayJournalEntry.id })} className="mt-3 min-h-11 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">Open Journal</button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : todayJournalHidden && todayJournalEntry ? (
        <button
          type="button"
          onClick={() => setTodayJournalHidden(false)}
          className="self-start rounded-xl border border-border/60 px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Show Today Journal
        </button>
      ) : null}

      <div className="android-dashboard-core-cards grid gap-4 lg:grid-cols-2">
      {isVisible('todayList') ? (
        <section className="section-surface density-panel">
          <SectionHeading
            eyebrow="TODAY"
            title="What needs your attention"
            action={
              <span className="rounded-full border border-border/50 bg-muted px-2.5 py-1 text-[0.76rem] font-semibold text-foreground/75">
                {completedTodayItems.length} complete
              </span>
            }
          />

          <div className="divide-y divide-border/50">
            {incompleteTodayItems.length ? (
              incompleteTodayItems.map(item => (
                <div key={item.id} className="android-dashboard-today-row flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (item.routineId) toggleDailyChecklistItem(item.routineId);
                      else navigateTo(item.target);
                    }}
                    className={`grid size-11 min-h-11 min-w-11 shrink-0 place-items-center rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                      item.tone === 'danger'
                        ? 'border-red-400/25 bg-red-500/10 text-red-600 dark:text-red-300'
                        : 'border-border/60 bg-muted/70 text-muted-foreground hover:border-primary/30 hover:text-primary'
                    }`}
                    aria-label={item.routineId ? `Complete ${item.title}` : `Open ${item.title}`}
                  >
                    {item.routineId ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo(item.target)}
                     className="android-dashboard-today-link group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                     aria-label={`Open ${item.title}`}
                   >
                     <span className="android-dashboard-row-content min-w-0 flex-1">
                       <OverflowTooltip text={item.title}><p className="truncate text-sm font-semibold">{item.title}</p></OverflowTooltip>
                       <OverflowTooltip text={item.detail}><p className="mt-0.5 truncate text-sm text-muted-foreground">{item.detail}</p></OverflowTooltip>
                     </span>
                     <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                   </button>
                </div>
              ))
            ) : (
              <EmptyLine>Your day is clear. Add a task or routine when you are ready.</EmptyLine>
            )}
          </div>

          {completedTodayItems.length ? (
            <details className="mt-4 rounded-2xl border border-border/50 bg-background/40">
              <summary className="min-h-11 cursor-pointer rounded-2xl px-4 py-3 text-[0.76rem] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                {completedTodayItems.length} completed today
              </summary>
              <div className="border-t border-border/50 px-4 py-2">
                {completedTodayItems.map(item => (
                  <div key={item.id} className="android-dashboard-completed-row flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="line-through">{item.title}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {isVisible('upcoming') ? (
        <section className="section-surface density-panel">
          <SectionHeading
            eyebrow="Timeline"
            title="Upcoming"
            description="The next few commitments across your connected sections."
            action={
              <button
                type="button"
                onClick={() => navigateToFeature('lifehub', 'dates')}
                className="min-h-11 rounded-xl border border-border/60 px-3 py-2 text-[0.76rem] font-semibold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Calendar{upcomingItems.length ? ` · ${upcomingItems.length}` : ''}
              </button>
            }
          />

          <div className="space-y-1">
            {upcomingItems.length ? (
              upcomingItems.slice(0, androidCompact ? 4 : 6).map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.target)}
                  className="android-dashboard-upcoming-row motion-pop flex min-h-11 w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <span
                    className={`w-16 shrink-0 text-[0.76rem] font-semibold sm:w-20 ${
                      item.tone === 'warning'
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {formatRelativeDate(item.date)}
                  </span>
                  <span className="android-dashboard-row-content min-w-0 flex-1">
                    <OverflowTooltip text={item.title}><span className="block truncate text-sm font-semibold">{item.title}</span></OverflowTooltip>
                    <OverflowTooltip text={item.detail}><span className="mt-0.5 block truncate text-sm text-muted-foreground">{item.detail}</span></OverflowTooltip>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))
            ) : (
              <EmptyLine>No upcoming commitments yet. Add a date in Life Hub when one matters.</EmptyLine>
            )}
          </div>
          {upcomingItems.length > (androidCompact ? 4 : 6) ? (
            <button
              type="button"
              onClick={() => navigateToFeature('lifehub', 'dates')}
              className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-border/60 px-3 py-2 text-[0.76rem] font-semibold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              View all {upcomingItems.length} upcoming commitments in Life Hub
            </button>
          ) : null}
        </section>
      ) : null}
      </div>

      {androidCompact ? lifePulseContent : null}
      </div>
    </>
  );

  return (
    <div
      className={`caizen-dashboard-root space-y-4 ${androidCompact ? 'android-dashboard' : ''}`}
      data-android-screen={androidCompact ? 'dashboard' : undefined}
    >
     <header className="relative z-[100] flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            {greeting}, {profileName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {focusItem.urgency >= 90
              ? 'One important item deserves your attention.'
              : focusItem.urgency > 0
                ? 'Your next useful step is ready.'
                : 'Your day looks calm right now.'}
          </p>
        </div>

        {!mochiFloatingHidden && !learningVisible ? (
          <MochiDashboardBubble
            petName={pet?.name || 'Mochi'}
            reaction={mochiReaction}
            briefing={mochiBriefing}
            personality={pet?.personality || DEFAULT_PET_PERSONALITY}
            profileId={currentProfile?.id || ''}
            onOpen={openMochi}
            onHide={hideMochiFloating}
          />
        ) : null}

        <div className="relative z-[110] flex flex-wrap gap-2">
          {androidCompact ? (
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Quick add
            </button>
          ) : (
            <Popover open={quickAddOpen} onOpenChange={setQuickAddOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Quick add
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} className="w-56 rounded-2xl border-border/60 bg-background p-2 shadow-2xl">
                {DASHBOARD_QUICK_ADD_OPTIONS.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        onQuickAdd?.(item.type as QuickAddKind);
                      }}
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black transition-all hover:bg-muted"
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      {item.label}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}

          <button
            type="button"
            data-dashboard-customize-trigger="true"
            aria-haspopup="dialog"
            onClick={openDashboardSettings}
            className="dashboard-customize-button inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border/50 bg-transparent px-3 text-[0.76rem] font-bold text-muted-foreground transition-all hover:border-border hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Settings2 className="h-3.5 w-3.5 shrink-0" />
            Customize
          </button>

        </div>

        {androidCompact ? (
          <CaizenBottomSheet
            open={quickAddOpen}
            title="Quick add"
            description="Choose what you want to capture."
            onClose={() => setQuickAddOpen(false)}
          >
            <div className="android-quick-add-sheet-grid">
              {DASHBOARD_QUICK_ADD_OPTIONS.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                        setQuickAddOpen(false);
                        onQuickAdd?.(item.type as QuickAddKind);
                      }}
                    className="android-quick-add-sheet-action"
                  >
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </CaizenBottomSheet>
        ) : null}
      </header>

      {coreContent}

      {(androidCompact || hasReviewContent) && (
        <div className={androidCompact ? 'android-dashboard-review-cards' : 'space-y-4'}>
          {!androidCompact && hasReviewContent ? (
            <div className="border-t border-border/50 px-1 pt-2">
              <p className="text-[0.76rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Review
              </p>
            </div>
          ) : null}

          {!androidCompact && (showLifePulse || showWeeklyReflection) ? (
            <div className={showLifePulse && showWeeklyReflection ? 'grid gap-4 lg:grid-cols-2' : 'space-y-4'}>
              {lifePulseContent}
              {weeklyReflectionContent}
            </div>
          ) : null}

          {motivationalCardContent}

          {androidCompact ? weeklyReflectionContent : null}

          {showWorthChecking ? (
            <section className="section-surface density-panel">
              <SectionHeading
                eyebrow="Optional"
                title="Worth checking"
                description="Only information that is stale, expiring, or actionable."
              />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {worthChecking.length ? (
                  worthChecking.map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => navigateTo(item.target)}
                        className="rounded-2xl border border-border/50 bg-background/45 p-4 text-left transition-all hover:border-primary/30"
                      >
                        <Icon className="h-4 w-4 text-primary" />
                        <p className="mt-3 text-sm font-bold">{item.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                      </button>
                    );
                  })
                ) : (
                  <div className="md:col-span-2 xl:col-span-3">
                    <EmptyLine>Nothing stale or urgent needs a separate check right now.</EmptyLine>
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {showInsights ? (
            <section className="section-surface density-panel">
              <SectionHeading
                eyebrow="Detailed view"
                title="Optional insights"
                description="Useful numbers stay available without dominating the daily experience."
              />

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: 'Wallet balance',
                    value: formatPHP(totalBalance),
                    detail: `${wallets.length} wallet${wallets.length === 1 ? '' : 's'}`,
                    target: 'balance',
                    icon: Wallet,
                  },
                  {
                    label: 'Estimated available',
                    value: formatPHP(remainingBalance),
                    detail: remainingBalance < 0 ? 'Selected plans exceed funds' : 'After selected wishlist costs',
                    target: 'balance',
                    icon: Shield,
                  },
                  {
                    label: 'Estimated assets',
                    value: formatPHP(totalAssets),
                    detail: `Wallets plus current value · ${inventoryWithRecordedValue} of ${activeInventory.length} active records valued`,
                    target: 'inventory',
                    icon: Coins,
                  },
                  {
                    label: 'Selected wishlist',
                    value: formatPHP(selectedWishlistCost),
                    detail: `${wishlistItems.filter(item => item.selected).length} selected item${wishlistItems.filter(item => item.selected).length === 1 ? '' : 's'}`,
                    target: 'wishlist',
                    icon: Gift,
                  },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => navigateTo(item.target)}
                      className="rounded-2xl border border-border/50 bg-background/45 p-4 text-left transition-all hover:border-primary/30"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <p className="mt-3 text-[0.76rem] font-semibold text-muted-foreground">{item.label}</p>
                      <p className="mt-1 truncate text-xl font-bold"><AnimatedMetricValue valueKey={`${item.label}:${item.value}`} ready={isHydrated}>{item.value}</AnimatedMetricValue></p>
                      <Tooltip><TooltipTrigger asChild><p className="mt-1 text-[0.76rem] text-muted-foreground">{item.detail}</p></TooltipTrigger><TooltipContent>{item.detail}</TooltipContent></Tooltip>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

        </div>
      )}

      {showAchievements && typeof document !== 'undefined'
        ? createPortal(
            <TrophyRoomPanel
              panelRef={trophyRoomPanelRef}
              milestones={milestones}
              pet={pet}
              isClosing={achievementsIsClosing}
              onClose={closeAchievements}
            />,
            document.body,
          )
        : null}

      {editingDashboard && typeof document !== 'undefined'
        ? androidCompact ? (
            <CaizenBottomSheet
              open={editingDashboard}
              title={dashboardSetupStep === 0 ? 'Choose your Dashboard view' : 'Choose visible Dashboard cards'}
              description={dashboardSetupStep === 0
                ? 'Presets make the Dashboard calmer without deleting any data.'
                : 'Manual visibility overrides the selected preset without changing your data.'}
              onClose={requestDashboardSetupBack}
              initialFocusSelector='[data-dashboard-setup-primary="true"]'
            >
              <div className="android-dashboard-setup flex flex-col gap-3">
                <div className="min-w-0">
                  {dashboardSetupStep === 0 ? (
                    <div className="grid gap-2">
                      {[
                        { id: 'calm' as const, title: 'Calm', description: 'Daily focus, today, upcoming, and pulse.' },
                        { id: 'balanced' as const, title: 'Balanced', description: 'Adds Milestones and weekly reflection.' },
                        { id: 'detailed' as const, title: 'Detailed', description: 'Adds optional numbers and maintenance prompts.' },
                      ].map(item => (
                        <button
                          key={item.id}
                          type="button"
                          data-dashboard-setup-primary={item.id === 'calm' ? 'true' : undefined}
                          onClick={() => presetCards(item.id)}
                          aria-pressed={draftPreferences.detail === item.id}
                          className={`w-full rounded-xl border p-3 text-left ${draftPreferences.detail === item.id ? 'border-primary/35 bg-primary/10' : 'border-border/60 bg-card/60'}`}
                        >
                          <p className="font-black">{item.title}</p>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {DASHBOARD_SETTINGS_CARDS.map((item, index) => {
                        const draftVisible = (id: DashboardCardId) =>
                          typeof draftPreferences.visibility[id] === 'boolean'
                            ? draftPreferences.visibility[id]
                            : defaultVisibleForDetail(draftPreferences.detail).includes(id);
                        const visible = item.id === 'motivation'
                          ? draftVisible('petCard') || draftVisible('achievements')
                          : draftVisible(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-dashboard-setup-primary={index === 0 ? 'true' : undefined}
                            onClick={() => setDraftPreferences(current => ({
                              ...current,
                              visibility: {
                                ...current.visibility,
                                ...(item.id === 'motivation'
                                  ? { petCard: !visible, achievements: !visible }
                                  : { [item.id]: !visible }),
                              },
                            }))}
                            aria-pressed={visible}
                            aria-label={`${item.label}: ${visible ? 'Visible' : 'Hidden'}`}
                            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background p-3 text-left"
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-black">{item.label}</span>
                              <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
                            </span>
                            <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${visible ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                              {visible ? <Eye className="size-3.5" aria-hidden="true" /> : <EyeOff className="size-3.5" aria-hidden="true" />}
                              <span className="sr-only">{visible ? 'Visible' : 'Hidden'}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <footer className="mt-auto flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
                  {dashboardSetupStep > 0 ? (
                    <Button type="button" variant="outline" onClick={() => setDashboardSetupStep(0)} className="mr-auto text-sm font-bold">
                      <ArrowLeft className="mr-1 inline size-4" /> Back
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" onClick={cancelDashboardSettings} className="text-sm font-bold text-muted-foreground">Cancel</Button>
                  {dashboardSetupStep === 0 ? (
                    <Button type="button" onClick={() => setDashboardSetupStep(1)} className="text-sm font-bold">Continue</Button>
                  ) : (
                    <Button type="button" onClick={saveDashboardSettings} className="text-sm font-bold">Save dashboard</Button>
                  )}
                </footer>
              </div>
            </CaizenBottomSheet>
          ) : createPortal(
            <div className="caizen-form-modal-root fixed inset-0 z-[10600] flex items-center justify-center p-3 sm:p-4" data-caizen-overlay={dashboardSetupIsClosing ? 'closing' : 'open'} data-state={dashboardSetupIsClosing ? 'closed' : 'open'}>
              <AndroidDismissibleBackdrop
                onClose={cancelDashboardSettings}
                ariaLabel="Close Dashboard setup"
                className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              />
              <section
                ref={dashboardSetupPanelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="dashboard-setup-title"
                tabIndex={-1}
                data-caizen-overlay-panel="true"
                className="caizen-form-modal modal-card-enter relative z-10 flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-2xl shadow-black/30"
              >
                <header className="flex items-start justify-between gap-4 border-b border-border/60 px-4 py-3 sm:px-5 sm:py-4">
                  <div>
                    <p className="text-[0.76rem] font-black uppercase tracking-wider text-primary">Dashboard setup</p>
                    <h2 id="dashboard-setup-title" className="mt-0.5 text-xl font-bold tracking-tight">
                      {dashboardSetupStep === 0 ? 'Choose your Dashboard view' : 'Choose visible Dashboard cards'}
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {dashboardSetupStep === 0
                        ? 'Presets make the Dashboard calmer without deleting any data.'
                        : 'Manual visibility overrides the selected preset without changing your data.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-dialog-close
                    onClick={cancelDashboardSettings}
                    aria-label="Close Dashboard setup"
                    className="grid size-11 shrink-0 place-items-center rounded-xl border border-border/60 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </header>

                <div ref={dashboardSetupScrollRef} className="caizen-form-modal-body min-h-0 flex-1 overflow-y-auto p-4 sm:px-5">
                  {dashboardSetupStep === 0 ? (
                    <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { id: 'calm' as const, title: 'Calm', description: 'Daily focus, today, upcoming, and pulse.' },
                      { id: 'balanced' as const, title: 'Balanced', description: 'Adds Milestones and weekly reflection.' },
                      { id: 'detailed' as const, title: 'Detailed', description: 'Adds optional numbers and maintenance prompts.' },
                    ].map(item => (
                      <button
                        key={item.id}
                        type="button"
                        data-dashboard-setup-primary={item.id === 'calm' ? 'true' : undefined}
                        onClick={() => presetCards(item.id)}
                        aria-pressed={draftPreferences.detail === item.id}
                        className={`rounded-xl border p-3 text-left ${
                          draftPreferences.detail === item.id
                            ? 'border-primary/35 bg-primary/10'
                            : 'border-border/60 bg-card/60'
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40`}
                      >
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                      </button>
                    ))}
                  </div>

                    </>
                  ) : (
                  <div>
                    <h3 className="font-black">Manual visibility</h3>
                    <p className="mt-1 text-[0.76rem] text-muted-foreground">
                      Overrides apply on top of the selected preset.
                    </p>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {DASHBOARD_SETTINGS_CARDS.map((item, index) => {
                        const draftVisible = (id: DashboardCardId) =>
                          typeof draftPreferences.visibility[id] === 'boolean'
                            ? draftPreferences.visibility[id]
                            : defaultVisibleForDetail(draftPreferences.detail).includes(id);
                        const visible = item.id === 'motivation'
                          ? draftVisible('petCard') || draftVisible('achievements')
                          : draftVisible(item.id);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-dashboard-setup-primary={index === 0 ? 'true' : undefined}
                            onClick={() => setDraftPreferences(current => ({
                              ...current,
                              visibility: {
                                ...current.visibility,
                                ...(item.id === 'motivation'
                                  ? { petCard: !visible, achievements: !visible }
                                  : { [item.id]: !visible }),
                              },
                            }))}
                            aria-pressed={visible}
                            aria-label={`${item.label}: ${visible ? 'Visible' : 'Hidden'}`}
                            className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border/60 bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          >
                            <span>
                              <span className="block text-sm font-semibold">{item.label}</span>
                              <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
                            </span>
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${visible ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                              {visible ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                              <span className="sr-only">{visible ? 'Visible' : 'Hidden'}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  )}
                </div>

                <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border/60 bg-background px-4 py-3 sm:px-5">
                  {dashboardSetupStep > 0 ? (
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => {
                        dashboardSetupScrollPositions.current[1] = dashboardSetupScrollRef.current?.scrollTop ?? 0;
                        setDashboardSetupStep(0);
                      }}
                      className="mr-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-semibold sm:min-h-10"
                    >
                      <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                  ) : null}
                    <Button
                      variant="outline"
                      type="button"
                      onClick={cancelDashboardSettings}
                    className="min-h-11 rounded-xl border border-border/60 px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 sm:min-h-10"
                  >
                    Cancel
                    </Button>
                  {dashboardSetupStep === 0 ? (
                    <Button
                      type="button"
                      onClick={() => {
                        dashboardSetupScrollPositions.current[0] = dashboardSetupScrollRef.current?.scrollTop ?? 0;
                        setDashboardSetupStep(1);
                      }}
                      className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground sm:min-h-10"
                    >
                      Continue
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={saveDashboardSettings}
                      className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground sm:min-h-10"
                    >
                      Save dashboard
                    </Button>
                  )}
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}

      <ConfirmDialog
        isOpen={androidCompact && confirmDashboardDiscard}
        title="Discard Dashboard changes?"
        message="Your unsaved Dashboard setup changes will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        isDangerous
        onConfirm={discardDashboardSettings}
        onCancel={() => setConfirmDashboardDiscard(false)}
      />

    </div>
  );
}

export default memo(Dashboard);
