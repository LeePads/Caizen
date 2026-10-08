'use client';

import { createPortal } from 'react-dom';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  DragEndEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import EditHealthTargetsModal from '@/components/modals/EditHealthTargetsModal';
import FoodModal from '@/components/modals/FoodModal';
import MealTemplateModal from '@/components/modals/MealTemplateModal';
import MealTemplatePickerModal from '@/components/modals/MealTemplatePickerModal';
import StreakTimelineModal from '@/components/modals/StreakTimelineModal';
import WorkoutWorkspace from '@/components/health/WorkoutWorkspace';
import { HealthOverviewPanel } from '@/components/health/HealthOverviewPanel';
import { HealthDetails } from '@/components/health/HealthDetails';
import healthResponsive from '@/components/health/health-responsive.module.css';
import { HealthDayNavigator } from '@/components/health/HealthDayNavigator';
import { HealthLibraryList } from '@/components/health/HealthLibraryList';
import { HealthTrendsPanel } from '@/components/health/HealthTrendsPanel';
import { HealthHydrationPanel } from '@/components/health/HealthHydrationPanel';
import { HealthBodyMeasurementsPanel } from '@/components/health/HealthBodyMeasurementsPanel';
import HealthFastingWorkspace from '@/components/health/HealthFastingWorkspace';
import { HealthOverflowMenu } from '@/components/health/HealthOverflowMenu';
import WeightModal from '@/components/modals/WeightModal';
import WorkoutModal from '@/components/modals/WorkoutModal';
import SleepModal from '@/components/modals/SleepModal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { AnimatedMetricValue } from '@/components/common/AnimatedMetricValue';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/collection-controls';
import { SearchField } from '@/components/ui/search-field';
import { sectionTabVisualClassName } from '@/components/ui/tabs';
import { DataRecordRow, DataTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty';
import { StatusBadge } from '@/components/ui/badge';
import { PaginationControls } from '@/components/ui/section-kit';
import { Switch } from '@/components/ui/switch';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import SupplementsSection from './SupplementsSection';

import { useAppContext } from '@/lib/context';
import { getSectionDiscoveryMeta } from '@/lib/discovery/section-meta';
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion-preference';
import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled';
import { getStreakActiveDays, normalizePauseHistory } from '@/lib/health/streak-timeline';
import { normalizeHealthNonNegative, normalizeHealthNumber } from '@/lib/health/normalization';
import {
  averageSleepDurationMinutes,
  averageOptionalSleepMetric,
  averageSleepClockTime,
  calculateCaizenSleepScore,
  formatClockMinutes,
  formatSleepQuality,
  formatSleepDuration,
  getSleepDurationMinutes,
  normalizeSleepDurationMinutes,
} from '@/lib/health/sleep';
import { getLatestCompletedWorkout, getNextScheduledWorkout, getWorkoutWeekSummary } from '@/lib/health/workout-summary';
import { combineWorkoutExerciseCatalog } from '@/lib/health/workout-catalog';
import { formatFastingShortDuration, getActiveFastingSession, getFastingElapsedMs } from '@/lib/health/fasting';
import { aggregateNutrition, calculateMealRowNutrition, getNutritionMissingFields, hasCompleteNutrition, isNutritionFieldKnown, isNutritionFieldMissing, sumNutrition } from '@/lib/health/nutrition';
import { deriveDailyCalorieSummary } from '@/lib/health/daily-calories';
import { guardHealthTextChange, validateHealthText } from '@/lib/health/validation';
import {
  calculateBmi,
  kgToWeight,
  formatMeasurementNumber,
  readHealthMeasurementPreferences,
  type HeightUnit,
  type WeightUnit,
} from '@/lib/health/measurements';
import { formatLocalDateInput, parseLocalDateInput, parseLocalDateValue } from '@/lib/date-utils';
import { clampHealthDate, shiftHealthDate } from '@/lib/health/date-navigation';
import { createEntityId } from '@/lib/utils';
import { notify } from '@/lib/feedback/notify';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { collectMediaReferenceIds } from '@/lib/storage/media-references';
import { queueMediaCleanup } from '@/lib/storage/media-cleanup';
import {
  claimRequestSignal,
  isProfileBoundRequestReady,
} from '@/lib/section-feature-request';

import type {
  ActivityEntry,
  FoodEntry,
  FoodNutritionSnapshot,
  FoodTemplate,
  HealthEvidenceEvent,
  MealTemplate,
  MealType,
  HealthProfile,
  NutritionField,
  NoXTracker,
  SleepEntry,
  WeightEntry,
} from '@/lib/types';

const EMPTY_FOOD_ENTRIES: FoodEntry[] = [];
const EMPTY_ACTIVITY_ENTRIES: ActivityEntry[] = [];
const EMPTY_NO_X_TRACKERS: NoXTracker[] = [];
const HEALTH_LIST_PAGE_SIZE = 12;

type MealTemplateEditor =
  | { mode: 'new' }
  | { mode: 'edit'; template: MealTemplate }
  | null;

import {
  Activity,
  ChevronDown,
  ChevronRight,
  Copy,
  Flame,
  HeartPulse,
  LineChart,
  MoreHorizontal,
  MoreVertical,
  ArrowLeft,
  ArrowRight,
  EyeOff,
  Pause,
  PlayCircle,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Timer,
  Trash2,
  Utensils,
  Weight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type HealthView =
  | 'overview'
  | 'food'
  | 'fasting'
  | 'weight'
  | 'workout'
  | 'sleep'
  | 'streaks'
  | 'trends'
  | 'saved'
  | 'supplements';

type HealthTab = HealthView;

type HealthTabPreferences = {
  order: HealthTab[];
  hidden: HealthTab[];
};

const DEFAULT_HEALTH_TAB_ORDER: HealthTab[] = [
  'overview', 'food', 'sleep', 'workout', 'weight', 'fasting', 'saved', 'supplements', 'trends', 'streaks',
];

const DEFAULT_HIDDEN_HEALTH_TABS: HealthTab[] = ['trends', 'streaks'];

// DndContext/DragOverlay modifiers constrain the library transform, but the
// sortable item also renders its own strategy transform. Clamp that final
// render path so the dragged tab cannot acquire a vertical translation.
const restrictHealthTabToRow: Modifier = ({ transform }) => ({
  ...transform,
  y: 0,
});

type HealthSectionProps = {
  onAddSupplementClick: () => void;
  openAddFoodSignal?: number;
  compactMobileMode?: boolean;
  androidPresentation?: boolean;
  requestedProfileId?: string;
  requestedView?: string;
  requestedViewSignal?: number;
  requestedRecordId?: string;
  requestedDateKey?: string;
  onRequestedViewConsumed?: (signal: number) => void;
  onOpenLifeHub?: () => void;
};

const MEAL_ORDER = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
] as const;

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

const lastVisibleHealthTrendDataset = new Map<string, string>();

function HealthWeightTrendLine({
  points,
  datasetSignature,
}: {
  points: string;
  datasetSignature: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGPolylineElement>(null);
  const [drawnDatasetSignature, setDrawnDatasetSignature] = useState<string | null>(null);
  const motionMode = useCaizenMotionMode();

  useEffect(() => {
    if (motionMode === 'reduced' || motionMode === 'constrained') {
      setDrawnDatasetSignature(null);
    }
    if (!datasetSignature) return;
    let isVisible = false;
    const markVisibleDataset = () => {
      if (!isVisible || lastVisibleHealthTrendDataset.get('health-weight-trend') === datasetSignature) return;
      lastVisibleHealthTrendDataset.set('health-weight-trend', datasetSignature);
      if (motionMode === 'full' || motionMode === 'android') setDrawnDatasetSignature(datasetSignature);
    };

    const node = svgRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      isVisible = true;
      markVisibleDataset();
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry?.isIntersecting ?? false;
      markVisibleDataset();
    }, { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [datasetSignature, motionMode]);

  const shouldDraw = (motionMode === 'full' || motionMode === 'android')
    && drawnDatasetSignature === datasetSignature;

  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    const clearCancelledReveal = () => {
      setDrawnDatasetSignature(current => current === datasetSignature ? null : current);
    };
    line.addEventListener('animationcancel', clearCancelledReveal);
    return () => line.removeEventListener('animationcancel', clearCancelledReveal);
  }, [datasetSignature]);

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-36 w-full"
    >
      <polyline
        ref={lineRef}
        key={datasetSignature}
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="1"
        data-caizen-chart-draw={shouldDraw ? 'active' : undefined}
        onAnimationEnd={() => setDrawnDatasetSignature(current => current === datasetSignature ? null : current)}
        style={{ animationDuration: motionMode === 'android' ? '140ms' : '220ms' }}
        className="text-blue-400 caizen-health-trend-line"
      />
    </svg>
  );
}


function isSameDay(
  dateA: Date | string | number | null | undefined,
  dateB: Date | string | number | null | undefined,
) {
  const parsedA = parseLocalDateValue(dateA);
  const parsedB = parseLocalDateValue(dateB);
  return Boolean(parsedA && parsedB && parsedA.toDateString() === parsedB.toDateString());
}

function formatDate(
  value: Date | string
) {
  return (parseLocalDateValue(value) || new Date(Number.NaN))
    .toLocaleDateString(
      'en-US',
      {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }
    );
}

function suggestedMealType(date = new Date()): MealType {
  const hour = date.getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 20) return 'dinner';
  return 'snack';
}

function getStreakDays(streak: NoXTracker) {
  return getStreakActiveDays(streak);
}

function getLastNDays(
  days: number
) {
  return Array.from(
    {
      length: days,
    },
    (_, index) => {
      const date =
        new Date();

      date.setDate(
        date.getDate() -
        (days - 1 - index)
      );

      return date;
    }
  );
}

function formatNumber(
  value: number | string | null | undefined,
  decimals = 0
) {
  return normalizeHealthNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatMacro(
  value: number | string | null | undefined
) {
  return formatNumber(value, 1);
}

function getMealTemplateTotals(
  template: MealTemplate,
  foods: FoodTemplate[]
) {
  return sumNutrition((template.rows || []).map(row => getMealRowNutrition(row, foods)));
}

function getMealRowNutrition(
  row: MealTemplate['rows'][number],
  foods: FoodTemplate[]
): FoodNutritionSnapshot {
  const legacy = row.foodId ? foods.find(item => item.id === row.foodId) : undefined;
  return calculateMealRowNutrition(row, legacy);
}

function formatDisplayNumber(
  value: number | string | null | undefined
) {
  const number = normalizeHealthNumber(value);
  return formatNumber(number, Number.isInteger(number) ? 0 : 1);
}

function hasNoKnownNutrition(
  entries: FoodEntry[],
  field: NutritionField,
) {
  return entries.length > 0 && !entries.some(entry => isNutritionFieldKnown(entry, field));
}

function hasCompleteFoodLogNutrition(entries: FoodEntry[]) {
  return entries.length > 0 && entries.every(entry => hasCompleteNutrition(entry));
}

function formatFoodNutritionValue(
  entries: FoodEntry[],
  field: NutritionField,
  value: number | string | null | undefined,
  suffix = '',
) {
  if (!entries.length) return '—';
  if (hasNoKnownNutrition(entries, field)) return 'Not entered';
  return `${formatDisplayNumber(value)}${suffix}`;
}

type NutritionTargetMode = 'calories' | 'goal' | 'limit';
type NutritionTargetTone = 'positive' | 'caution' | 'negative' | 'neutral';

// Targets (calories, goal) are amounts to work toward: being under is
// "needs more," reaching or passing the number is not a warning. Limits are
// amounts to stay under: approaching or passing the number is the thing that
// should read as caution/negative. The two must never share one tone curve.
function getNutritionTargetTone(
  mode: NutritionTargetMode,
  value: number,
  target: number | undefined,
  known: boolean,
): NutritionTargetTone {
  if (!target || !known) return 'neutral';
  if (mode === 'limit') {
    if (value > target) return 'negative';
    return value >= target * 0.9 ? 'caution' : 'positive';
  }
  if (mode === 'goal') {
    if (value >= target) return 'positive';
    return value >= target * 0.8 ? 'caution' : 'neutral';
  }
  // Calories are a personal budget rather than a safety limit, so going over
  // stays a mild caution instead of the destructive tone used for limits.
  if (value > target) return 'caution';
  return value >= target * 0.8 ? 'positive' : 'neutral';
}

function getNutritionTargetStatus(
  mode: NutritionTargetMode,
  value: number,
  target: number | undefined,
  known: boolean,
  unit: string,
) {
  if (!target) return 'No target set';
  if (!known) return 'Not entered';
  if (mode === 'limit') {
    return value > target
      ? `${formatDisplayNumber(value - target)}${unit} over limit`
      : `${formatDisplayNumber(target - value)}${unit} remaining`;
  }
  if (mode === 'goal') {
    if (value < target) return `${formatDisplayNumber(target - value)}${unit} to target`;
    if (value === target) return 'Target met';
    return `${formatDisplayNumber(value - target)}${unit} above target`;
  }
  return value > target
    ? `${formatDisplayNumber(value - target)}${unit} over target`
    : `${formatDisplayNumber(target - value)}${unit} remaining`;
}

function nutritionToneClass(tone: NutritionTargetTone) {
  return tone === 'positive'
    ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'caution'
      ? 'text-amber-700 dark:text-amber-300'
      : tone === 'negative'
        ? 'text-red-700 dark:text-red-300'
        : 'text-foreground';
}

type FoodSummaryMetric = {
  label: string;
  value: string;
  suffix: string;
  field?: NutritionField;
  target?: number;
  mode?: NutritionTargetMode;
  unit?: string;
  status?: string;
};

function SavedFoodOverflowMenu({
  onEdit,
  onDuplicate,
  onDelete,
  androidPresentation = false,
}: {
  onEdit: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  androidPresentation?: boolean;
}) {
  return <HealthOverflowMenu
    title="Food actions"
    ariaLabel="More food actions"
    androidPresentation={androidPresentation}
    actions={[
      { label: 'Edit', icon: Pencil, onSelect: onEdit },
      ...(onDuplicate ? [{ label: 'Duplicate', icon: Copy, onSelect: onDuplicate }] : []),
      { label: 'Delete', icon: Trash2, destructive: true, onSelect: onDelete },
    ]}
  />;
}

function MealTemplateOverflowMenu({
  onEdit,
  onDelete,
  androidPresentation = false,
}: {
  onEdit: () => void;
  onDelete: () => void;
  androidPresentation?: boolean;
}) {
  return <HealthOverflowMenu
    title="Meal actions"
    ariaLabel="More meal actions"
    androidPresentation={androidPresentation}
    actions={[
      { label: 'Edit', icon: Pencil, onSelect: onEdit },
      { label: 'Delete', icon: Trash2, destructive: true, onSelect: onDelete },
    ]}
  />;
}

function SortableHealthTab({
  tab,
  activeTab,
  setContextTab,
  setContextPosition,
  setHiddenTabsMenuOpen,
  tabOrder,
  registerTabRef,
  onNavigate,
}: {
  tab: { id: HealthTab; label: string; icon: ComponentType<{ className?: string }> };
  activeTab: HealthTab;
  setContextTab: (id: HealthTab | null) => void;
  setContextPosition: (position: { x: number; y: number }) => void;
  setHiddenTabsMenuOpen: (open: boolean) => void;
  tabOrder: HealthTab[];
  registerTabRef: (id: HealthTab, node: HTMLButtonElement | null) => void;
  onNavigate: (id: HealthTab) => void;
}) {
  const motionMode = useCaizenMotionMode();
  const motionEnabled = motionMode === 'full' || motionMode === 'android';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
    disabled: tab.id === 'overview',
  });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (isDragging) return;
    const currentIndex = tabOrder.indexOf(tab.id);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabOrder.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabOrder.length - 1;
    if (nextIndex === null || nextIndex === currentIndex) return;

    event.preventDefault();
    onNavigate(tabOrder[nextIndex]);
  };

  const style = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, y: 0 } : transform,
    ),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 999 : undefined,
  };

  const Icon = tab.icon;

  return (
    <button
      ref={node => {
        setNodeRef(node);
        registerTabRef(tab.id, node);
      }}
      style={style}
      {...attributes}
      {...listeners}
      type="button"
      role="tab"
      id={`health-tab-${tab.id}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`health-panel-${tab.id}`}
      tabIndex={activeTab === tab.id ? 0 : -1}
      onKeyDownCapture={handleKeyDown}
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
        if (tab.id === 'overview') return;
        setHiddenTabsMenuOpen(false);
        setContextTab(tab.id);
        const rect = event.currentTarget.getBoundingClientRect();
        const viewport = window.visualViewport;
        const left = viewport?.offsetLeft || 0;
        const top = viewport?.offsetTop || 0;
        setContextPosition({
          x: Math.max(left + 8, Math.min(event.clientX || rect.left, left + (viewport?.width || window.innerWidth) - 184)),
          y: Math.max(top + 8, Math.min(event.clientY || rect.bottom, top + (viewport?.height || window.innerHeight) - 168)),
        });
      }}
      onClick={() => {
        setContextTab(null);
        onNavigate(tab.id);
      }}
      aria-label={tab.label}
      className={sectionTabVisualClassName({
        active: activeTab === tab.id,
        className: `caizen-tab h-11 min-w-11 snap-start rounded-xl px-3 transition-all duration-170 motion-reduce:transition-none focus-visible:ring-primary/60 sm:px-4 ${isDragging ? 'pointer-events-none opacity-0' : ''} ${activeTab === tab.id ? 'caizen-tab-active caizen-tab-motion-indicator' : ''}`,
      })}
    >
      {activeTab === tab.id ? (
        <motion.span
          aria-hidden="true"
          layoutId="caizen-health-tab-indicator"
          layout={motionEnabled}
          initial={false}
          transition={motionMode === 'full'
            ? { type: 'spring', stiffness: 620, damping: 44, mass: 0.58 }
            : motionMode === 'android'
              ? { type: 'spring', stiffness: 820, damping: 48, mass: 0.45 }
              : { duration: 0 }}
          className="caizen-health-tab-indicator"
        />
      ) : null}
      <Icon className="h-4 w-4 shrink-0" />
      <span className="inline">
        {tab.label}
      </span>
    </button>
  );
}

function HealthTabDragPreview({
  tab,
  activeTab,
}: {
  tab: { id: HealthTab; label: string; icon: ComponentType<{ className?: string }> };
  activeTab: HealthTab;
}) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      className={`flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 text-sm font-semibold sm:px-4 ${activeTab === tab.id ? 'border-primary/20 bg-primary/10 text-foreground' : 'border-border bg-card text-foreground'}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="inline">{tab.label}</span>
    </button>
  );
}

export default function HealthSection({
  onAddSupplementClick,
  openAddFoodSignal = 0,
  compactMobileMode = false,
  androidPresentation = false,
  requestedView,
  requestedViewSignal = 0,
  requestedProfileId,
  requestedRecordId,
  requestedDateKey,
  onRequestedViewConsumed,
}: HealthSectionProps) {
  const reduceMotion = useReducedMotionPreference();
  const {
    health,
    isHydrated,
    updateHealthProfile,
    dailyChecklistItems,
    currentProfileId,
    addFoodEntries,
    deleteFoodEntry,
    deleteFoodEntries,

    addActivityEntry,
    deleteActivityEntry,
    fastingSessions,

    deleteWeightEntry,
    addNoXTracker,
    updateNoXTracker,
    deleteNoXTracker,
    addFoodTemplate,
    deleteFoodTemplate,
  } = useAppContext();
  const workoutExerciseDefinitions = useMemo(() => combineWorkoutExerciseCatalog(health?.workoutExercises || []), [health?.workoutExercises]);

  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');

  useEffect(() => {
    if (!currentProfileId) {
      setWeightUnit('kg');
      setHeightUnit('cm');
      return;
    }
    const preferences = readHealthMeasurementPreferences(currentProfileId);
    setWeightUnit(preferences.weightUnit);
    setHeightUnit(preferences.heightUnit);
  }, [currentProfileId]);

  const [activeTab, setActiveTab] =
    useState<HealthView>('overview');
  const healthPanelRef = useRef<HTMLDivElement>(null);
  const previousHealthTabRef = useRef(activeTab);
  useEffect(() => {
    if (previousHealthTabRef.current === activeTab) return;
    previousHealthTabRef.current = activeTab;
    const panel = healthPanelRef.current;
    if (!panel) return;
    panel.classList.remove('caizen-tab-panel-motion');
    void panel.offsetWidth;
    panel.classList.add('caizen-tab-panel-motion');
  }, [activeTab]);
  const [requestedProgressTab, setRequestedProgressTab] = useState<'nutrition' | 'workout' | 'body' | 'sleep' | null>(null);
  const [workoutStartRequest, setWorkoutStartRequest] = useState<{ planId: string; signal: number } | null>(null);
  const [workoutCreateRequestSignal, setWorkoutCreateRequestSignal] = useState(0);
  const consumedRequestSignalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!requestedView || !isProfileBoundRequestReady({
      isHydrated,
      requestedProfileId,
      currentProfileId,
      signal: requestedViewSignal,
    })) return;
    if (requestedView === 'workout-plan' || requestedView === 'workout-routine') {
      setActiveTab('workout');
      return;
    }
    if (!claimRequestSignal(consumedRequestSignalRef, requestedViewSignal)) return;

    const consumeRequest = () => {
      consumedRequestSignalRef.current = requestedViewSignal;
      onRequestedViewConsumed?.(requestedViewSignal);
    };

    const routeAliases: Record<string, HealthView> = {
      today: 'overview',
      nutrition: 'food',
      body: 'weight',
      progress: 'trends',
      more: 'overview',
      'health-tools': 'overview',
      'workout-statistics': 'trends',
      'personal-streaks': 'streaks',
    };
    if (requestedView === 'workout-statistics') setRequestedProgressTab('workout');
    const requestView = routeAliases[requestedView] || requestedView;
    const supportedViews: HealthView[] = [
      'overview',
      'food',
      'fasting',
      'weight',
      'workout',
      'sleep',
      'streaks',
      'trends',
      'saved',
      'supplements',
    ];
    if (supportedViews.includes(requestView as HealthView)) {
      setActiveTab(requestView as HealthView);
      consumeRequest();
      return;
    }

    // Quick Add widget and launcher shortcuts land directly on the Add/Edit Food modal.
    if (requestedView === 'add-food') {
      setActiveTab('food');
      setSelectedFoodEntry(null);
      setSelectedFoodTemplate(null);
      setAddFoodMode('log-food');
      setShowAddFoodModal(true);
      consumeRequest();
      return;
    }

    if (requestedView === 'add-weight') {
      setActiveTab('weight');
      setShowAddWeightModal(true);
      consumeRequest();
      return;
    }

    if (!requestedRecordId) {
      consumeRequest();
      return;
    }
    if (requestedView === 'weight-entry') {
      const entry = health?.weightEntries?.find(item => item.id === requestedRecordId);
      if (entry) {
        setActiveTab('weight');
        setSelectedWeightEntry(entry);
      }
      consumeRequest();
      return;
    }
    if (requestedView === 'food-entry') {
      const entry = health?.foodEntries?.find(item => item.id === requestedRecordId);
      if (entry) {
        setActiveTab('food');
        setAddFoodMode('log-food');
        setSelectedFoodEntry(entry);
      }
      consumeRequest();
      return;
    }
    if (requestedView === 'activity-entry') {
      const entry = health?.activityEntries?.find(item => item.id === requestedRecordId);
      if (entry) {
        setActiveTab('workout');
        setEditingWorkout(entry);
        setShowWorkoutModal(true);
      }
      consumeRequest();
      return;
    }
    if (requestedView === 'sleep-entry') {
      const entry = health?.sleepEntries?.find(item => item.id === requestedRecordId);
      if (entry) {
        setActiveTab('sleep');
        setEditingSleep(entry);
        setShowSleepModal(true);
      }
      consumeRequest();
      return;
    }
    if (requestedView === 'food-template') {
      const template = health?.foodTemplates?.find(item => item.id === requestedRecordId);
      if (template) {
        setActiveTab('saved');
        setFoodTemplateTab('saved');
        setSelectedFoodTemplate(template);
        setAddFoodMode('edit-template');
        setShowAddFoodModal(true);
      }
      consumeRequest();
      return;
    }
    if (requestedView === 'meal-template') {
      const template = health?.mealTemplates?.find(item => item.id === requestedRecordId);
      if (template) {
        setActiveTab('saved');
        setFoodTemplateTab('meals');
        setMealTemplateSearch(template.name);
      }
      consumeRequest();
    }
  }, [
    currentProfileId,
    health,
    isHydrated,
    onRequestedViewConsumed,
    requestedProfileId,
    requestedRecordId,
    requestedView,
    requestedViewSignal,
  ]);

  useEffect(() => {
    if (activeTab === 'trends' && requestedProgressTab) setRequestedProgressTab(null);
  }, [activeTab, requestedProgressTab]);

  const [streakToReset, setStreakToReset] =
    useState<NoXTracker | null>(null);
  const [streakToEdit, setStreakToEdit] = useState<NoXTracker | null>(null);
  const [streakToPause, setStreakToPause] = useState<NoXTracker | null>(null);
  const [pauseResumeDate, setPauseResumeDate] = useState('');
  const [pauseReason, setPauseReason] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [streakUnsavedAction, setStreakUnsavedAction] = useState<'pause' | 'reset' | null>(null);
  const [streakFormError, setStreakFormError] = useState('');
  const [streakToDelete, setStreakToDelete] = useState<NoXTracker | null>(null);
  const [healthTabPreferences, setHealthTabPreferences] = useState<HealthTabPreferences>({
    order: DEFAULT_HEALTH_TAB_ORDER,
    hidden: [...DEFAULT_HIDDEN_HEALTH_TABS],
  });
  const [loadedHealthPreferencesProfileId, setLoadedHealthPreferencesProfileId] = useState<string | null>(null);
  const [contextTab, setContextTab] = useState<HealthTab | null>(null);
  const [contextPosition, setContextPosition] = useState({ x: 0, y: 0 });
  const [hiddenTabsMenuOpen, setHiddenTabsMenuOpen] = useState(false);
  const hiddenTabsMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const hiddenTabsMenuRef = useRef<HTMLDivElement>(null);
  const [hiddenTabsMenuPosition, setHiddenTabsMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const hiddenHealthTabCount = healthTabPreferences.hidden.filter(tab => tab !== activeTab && tab !== 'overview').length;
  const healthTabRefs = useRef<Partial<Record<HealthTab, HTMLButtonElement | null>>>({});
  const healthTabScrollRef = useRef<HTMLDivElement>(null);

  // Portaled to document.body (like the right-click tab context menu below)
  // instead of positioned absolutely inside the tab strip, since that strip
  // scrolls with `overflow-x-auto`, which also clips vertical overflow and
  // squashed this menu against the row instead of letting it float above it.
  useLayoutEffect(() => {
    if (!hiddenTabsMenuOpen || !hiddenTabsMenuTriggerRef.current) {
      setHiddenTabsMenuPosition(null);
      return;
    }

    const viewportPadding = 8;
    const gap = 8;
    let frame = 0;
    const updatePosition = () => {
      const trigger = hiddenTabsMenuTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = hiddenTabsMenuRef.current?.offsetWidth || 192;
      const menuHeight = hiddenTabsMenuRef.current?.offsetHeight || Math.min(240, hiddenHealthTabCount * 44 + 16);
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const viewportTop = window.visualViewport?.offsetTop || 0;
      const viewportBottom = viewportTop + viewportHeight;
      const below = rect.bottom + gap;
      const above = rect.top - menuHeight - gap;
      const preferredTop = below + menuHeight <= viewportBottom - viewportPadding
        ? below
        : above >= viewportTop + viewportPadding
          ? above
          : Math.min(
              Math.max(viewportTop + viewportPadding, below),
              viewportBottom - menuHeight - viewportPadding,
            );

      setHiddenTabsMenuPosition({
        top: Math.max(viewportTop + viewportPadding, preferredTop),
        left: Math.max(
          viewportPadding,
          Math.min(
            rect.right - menuWidth,
            window.innerWidth - menuWidth - viewportPadding,
          ),
        ),
      });
    };

    updatePosition();
    frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [hiddenHealthTabCount, hiddenTabsMenuOpen]);

  const healthTabSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeHealthDragId, setActiveHealthDragId] = useState<HealthTab | null>(null);

  useEffect(() => {
    const closeMenus = () => {
      setContextTab(null);
      setHiddenTabsMenuOpen(false);
    };
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

  useEffect(() => {
    if (!currentProfileId) return;
    try {
      const stored = JSON.parse(localStorage.getItem(`health-tabs:${currentProfileId}`) || '{}');
      const legacyOrderSource = Array.isArray(stored.legacyOrder)
        ? stored.legacyOrder
        : Array.isArray(stored.order) ? stored.order : [];
      const order = Array.from(new Set([...legacyOrderSource, ...DEFAULT_HEALTH_TAB_ORDER]))
        .filter((tab): tab is HealthTab => DEFAULT_HEALTH_TAB_ORDER.includes(tab as HealthTab));
      const hiddenSource = Array.isArray(stored.hiddenChildren)
        ? stored.hiddenChildren
        : Array.isArray(stored.hidden) ? stored.hidden : DEFAULT_HIDDEN_HEALTH_TABS;
      const hidden = new Set<HealthTab>(hiddenSource.filter((tab: unknown): tab is HealthTab =>
        DEFAULT_HEALTH_TAB_ORDER.includes(tab as HealthTab) && tab !== 'overview',
      ));
      // Preserve choices made in the short-lived grouped navigation when they
      // map cleanly to a direct destination.
      if (Array.isArray(stored.hiddenRoots)) {
        const groupedChildren: Record<string, HealthTab[]> = {
          food: ['food', 'saved'],
          workout: ['workout'],
          sleep: ['sleep'],
          weight: ['weight'],
          more: ['fasting', 'trends', 'supplements', 'streaks'],
        };
        for (const root of stored.hiddenRoots) {
          for (const child of groupedChildren[String(root)] || []) hidden.add(child);
        }
      }
      setHealthTabPreferences({ order, hidden: [...hidden] });
    } catch {
      setHealthTabPreferences({ order: DEFAULT_HEALTH_TAB_ORDER, hidden: [...DEFAULT_HIDDEN_HEALTH_TABS] });
    } finally {
      setLoadedHealthPreferencesProfileId(currentProfileId);
    }
  }, [currentProfileId]);

  useEffect(() => {
    if (!currentProfileId || loadedHealthPreferencesProfileId !== currentProfileId) return;
    const preferenceKey = `health-tabs:${currentProfileId}`;
    let existingPreferences: Record<string, unknown> = {};
    try {
      existingPreferences = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
    } catch {
      // Replace malformed auxiliary preferences with the current safe values.
    }
    localStorage.setItem(preferenceKey, JSON.stringify({
      ...existingPreferences,
      order: healthTabPreferences.order,
      hidden: healthTabPreferences.hidden,
      legacyOrder: healthTabPreferences.order,
      hiddenChildren: healthTabPreferences.hidden,
      rootOrder: [],
      hiddenRoots: [],
    }));
  }, [healthTabPreferences, currentProfileId, loadedHealthPreferencesProfileId]);

  const handleHealthTabDragEnd = (event: DragEndEvent) => {
    setActiveHealthDragId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id) as HealthTab;
    const overId = String(over.id) as HealthTab;
    if (activeId === 'overview' || overId === 'overview' || activeId === overId) return;

    setHealthTabPreferences(current => {
      const oldIndex = current.order.indexOf(activeId);
      const newIndex = current.order.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return current;
      return { ...current, order: arrayMove(current.order, oldIndex, newIndex) };
    });
  };

  const handleHealthTabDragStart = (event: DragStartEvent) => {
    setActiveHealthDragId(String(event.active.id) as HealthTab);
  };

  const moveHealthTab = (id: HealthTab, direction: -1 | 1) => {
    if (id === 'overview') return;
    setHealthTabPreferences(current => {
      const currentIndex = current.order.indexOf(id);
      const nextIndex = currentIndex + direction;
      if (currentIndex <= 0 || nextIndex <= 0 || nextIndex >= current.order.length) return current;
      return { ...current, order: arrayMove(current.order, currentIndex, nextIndex) };
    });
  };

  const hideHealthTab = (id: HealthTab) => {
    if (id === 'overview') return;
    setHealthTabPreferences(current =>
      current.hidden.includes(id) ? current : { ...current, hidden: [...current.hidden, id] },
    );
    setActiveTab(current => (current === id ? 'overview' : current));
  };

  const restoreHealthTab = (id: HealthTab) => {
    setHealthTabPreferences(current => ({ ...current, hidden: current.hidden.filter(item => item !== id) }));
    setActiveTab(id);
    setHiddenTabsMenuOpen(false);
  };

  const [
    showAddFoodModal,
    setShowAddFoodModal,
  ] = useState(false);

  useEffect(() => {
    if (!openAddFoodSignal) return;
    setActiveTab('food');
    setSelectedFoodEntry(null);
    setSelectedFoodTemplate(null);
    setAddFoodMode('log-food');
    setShowAddFoodModal(true);
  }, [openAddFoodSignal]);

  const [
    selectedFoodEntry,
    setSelectedFoodEntry,
  ] = useState<FoodEntry | null>(
    null
  );

  // Future modal states.
  const [
    showAddWeightModal,
    setShowAddWeightModal,
  ] = useState(false);

  const [
    selectedWeightEntry,
    setSelectedWeightEntry,
  ] = useState<WeightEntry | null>(
    null
  );
  const [foodLogDate, setFoodLogDate] =
    useState(() => formatLocalDateInput(new Date()));

  const todayDateKey = formatLocalDateInput(new Date());

  const selectedFoodLogDate =
    useMemo(
      () => parseLocalDateInput(foodLogDate),
      [foodLogDate]
    );

  const shiftFoodLogDate = (days: number) => {
    setFoodLogDate(current => shiftHealthDate(current, days, todayDateKey));
  };

  const setFoodLogDateWithinToday = (value: string) => {
    setFoodLogDate(clampHealthDate(value, todayDateKey));
  };

  const foodEntries: FoodEntry[] =
    health?.foodEntries || EMPTY_FOOD_ENTRIES;


  const completedFoodLogDates: string[] =
    Array.from(
      new Set<string>(
        ((health?.foodLogCompletedDates || []) as unknown[]).filter(
          (date): date is string =>
            typeof date === 'string' && Boolean(date)
        )
      )
    ).sort();

  const excludedFoodLogDates: string[] = Array.from(
    new Set(health?.foodLogExcludedDates || []),
  ).sort();

  const isSelectedFoodLogExplicitlyComplete =
    completedFoodLogDates.includes(foodLogDate);

  const activityEntries =
    health?.activityEntries || EMPTY_ACTIVITY_ENTRIES;

  const healthFastingSessions = fastingSessions || health?.fastingSessions || [];
  const activeFastingSession = getActiveFastingSession(healthFastingSessions);
  const activeFastingSessionId = activeFastingSession?.id;

  useEffect(() => {
    if (!activeFastingSessionId || activeTab !== 'overview') return;
    const interval = window.setInterval(() => setFastingNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeFastingSessionId, activeTab]);

  const weightEntries: WeightEntry[] =
    health?.weightEntries || [];

  const noXTrackers: NoXTracker[] =
    health?.noXTrackers || EMPTY_NO_X_TRACKERS;

  useEffect(() => {
    if (!updateNoXTracker) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    noXTrackers.forEach(streak => {
      if (!streak.pausedAt || !streak.resumeDate) return;
      const resume = parseLocalDateValue(streak.resumeDate);
      if (!resume) return;
      if (resume > today) return;
      const history = normalizePauseHistory(streak);
      const nextHistory = history.map((period, index) =>
        index === history.length - 1 && !period.resumedAt
          ? { ...period, resumedAt: resume }
          : period,
      );
      updateNoXTracker(streak.id, {
        pausedAt: null,
        resumeDate: null,
        pauseReason: '',
        pauseHistory: nextHistory,
        updatedAt: new Date(),
      });
    });
  }, [noXTrackers, updateNoXTracker]);

  const sleepEntries: SleepEntry[] = health?.sleepEntries || [];

  const targetCalories = normalizeHealthNumber(health?.targetCalories);
  const hasCalorieTarget = targetCalories > 0;

  const maintenanceCalories = normalizeHealthNumber(health?.maintenanceCalories);
  const hasMaintenanceTarget = maintenanceCalories > 0;

  const sodiumLimitMg = normalizeHealthNumber(health?.sodiumLimitMg);
  const hasSodiumTarget = sodiumLimitMg > 0;

  const targetProtein = normalizeHealthNumber(health?.targetProtein);
  const hasProteinTarget = targetProtein > 0;

  const targetCarbs = normalizeHealthNumber(health?.targetCarbs);
  const hasCarbsTarget = targetCarbs > 0;

  const targetFat = normalizeHealthNumber(health?.targetFat);
  const hasFatTarget = targetFat > 0;

  const targetFiber = normalizeHealthNumber(health?.targetFiber);
  const hasFiberTarget = targetFiber > 0;

  const sugarLimit = normalizeHealthNumber(health?.sugarLimit);
  const hasSugarLimit = sugarLimit > 0;

  const sleepTargetMinutes = normalizeHealthNumber(health?.sleepTargetMinutes);
  const hasSleepTarget = sleepTargetMinutes > 0;
  const targetExerciseMinutesPerWeek = normalizeHealthNumber(health?.targetExerciseMinutesPerWeek);
  const hasExerciseTarget = targetExerciseMinutesPerWeek > 0;

  const targetWeight =
    health?.targetWeightKg;

  const heightCm =
    health?.heightCm;

  const displayWeight = (value: number | null | undefined, decimals = 1) =>
    value == null
      ? '—'
      : `${formatMeasurementNumber(kgToWeight(value, weightUnit), decimals)} ${weightUnit}`;

  const displayWeightDelta = (value: number, decimals = 1) => {
    const converted = kgToWeight(value, weightUnit);
    return `${converted > 0 ? '+' : ''}${formatMeasurementNumber(converted, decimals)} ${weightUnit}`;
  };

  const todayFoodEntries =
    useMemo(
      () =>
        foodEntries.filter(entry =>
          isSameDay(
            entry.date,
            selectedFoodLogDate
          )
        ),
      [foodEntries, selectedFoodLogDate]
    );

  const todayActivityEntries =
    useMemo(
      () =>
        activityEntries.filter(entry =>
          isSameDay(
            entry.date,
            selectedFoodLogDate
          )
        ),
      [activityEntries, selectedFoodLogDate]
    );

  const dailyCalorieSummary = useMemo(
    () => deriveDailyCalorieSummary(todayFoodEntries, todayActivityEntries, selectedFoodLogDate),
    [selectedFoodLogDate, todayActivityEntries, todayFoodEntries],
  );

  const todayNutritionComplete = hasCompleteFoodLogNutrition(todayFoodEntries);

  const isSelectedFoodLogAutoIncluded =
    foodLogDate < todayDateKey && todayNutritionComplete;
  const isSelectedFoodLogIncluded =
    !excludedFoodLogDates.includes(foodLogDate) &&
    todayFoodEntries.length > 0 &&
    (isSelectedFoodLogExplicitlyComplete || isSelectedFoodLogAutoIncluded);

  const [showEditTargetsModal, setShowEditTargetsModal] =
    useState(false);

  const [newStreakName, setNewStreakName] =
    useState('');

  const [savedFoodSearch, setSavedFoodSearch] =
    useState('');

  const [savedFoodPage, setSavedFoodPage] = useState(1);

  const [foodTemplateTab, setFoodTemplateTab] =
    useState<'saved' | 'meals'>('saved');

  const [mealTemplateSearch, setMealTemplateSearch] =
    useState('');

  const [mealTemplatePage, setMealTemplatePage] = useState(1);

  const [showMealTemplatePicker, setShowMealTemplatePicker] =
    useState(false);

  const [mealTemplateToDelete, setMealTemplateToDelete] =
    useState<MealTemplate | null>(null);

  const [mealTemplateEditor, setMealTemplateEditor] =
    useState<MealTemplateEditor>(null);

  const [selectedFoodTemplate, setSelectedFoodTemplate] =
    useState<any | null>(null);

  const [foodEntryToDelete, setFoodEntryToDelete] =
    useState<FoodEntry | null>(null);

  const [weightEntryToDelete, setWeightEntryToDelete] =
    useState<WeightEntry | null>(null);

  const [weightPage, setWeightPage] = useState(1);

  const [savedFoodToDelete, setSavedFoodToDelete] =
    useState<any | null>(null);


  const [addFoodMode, setAddFoodMode] =
    useState<'log-food' | 'save-template' | 'edit-template'>('log-food');
  const [quickAddMealType, setQuickAddMealType] = useState<MealType>('breakfast');


  const [showWorkoutModal, setShowWorkoutModal] =
    useState(false);

  const [editingWorkout, setEditingWorkout] =
    useState<any | null>(null);

  const [showSleepModal, setShowSleepModal] =
    useState(false);

  const [editingSleep, setEditingSleep] =
    useState<any | null>(null);

  const [sleepToDelete, setSleepToDelete] =
    useState<any | null>(null);

  const [sleepPage, setSleepPage] = useState(1);

  const [activityToDelete, setActivityToDelete] =
    useState<any | null>(null);

  const [fastingNow, setFastingNow] = useState(() => Date.now());

  const [newStreakStartDate, setNewStreakStartDate] =
    useState(() => formatLocalDateInput(new Date()));

  const todayNutrition = useMemo(
    () => aggregateNutrition(todayFoodEntries),
    [todayFoodEntries],
  );

  const todayTotals = todayNutrition.totals;

  const totalCaloriesBurned = dailyCalorieSummary.exerciseBurned;

  const netCalories = dailyCalorieSummary.netCalories;

  const sortedWeights = [...weightEntries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const weightHistory = sortedWeights.map((entry, index) => ({
    entry,
    changeKg: index === 0 ? null : entry.weightKg - sortedWeights[index - 1].weightKg,
  })).reverse();
  const weightTotalPages = Math.max(1, Math.ceil(weightHistory.length / HEALTH_LIST_PAGE_SIZE));
  const paginatedWeightHistory = weightHistory.slice(
    (weightPage - 1) * HEALTH_LIST_PAGE_SIZE,
    weightPage * HEALTH_LIST_PAGE_SIZE,
  );

  const latestWeight = sortedWeights[sortedWeights.length - 1];
  const firstWeight = sortedWeights[0];
  const latestSleepEntry = [...sleepEntries]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .at(-1);
  const todayMovementMinutes = Math.round(
    todayActivityEntries.reduce(
      (sum, entry) => sum + normalizeHealthNonNegative(entry.durationMinutes),
      0,
    ),
  );

  const weightChange = latestWeight && firstWeight
    ? normalizeHealthNumber((latestWeight.weightKg - firstWeight.weightKg).toFixed(1))
    : 0;

  const bmi = calculateBmi(latestWeight?.weightKg, heightCm);

  const bmiCategory = bmi === null
    ? 'Not available'
    : bmi < 18.5
      ? 'Below standard range'
      : bmi < 25
        ? 'Standard range'
        : bmi < 30
          ? 'Above standard range'
          : 'High range';

  const weightGoalDirection = firstWeight && targetWeight
    ? targetWeight > firstWeight.weightKg
      ? 'gain'
      : targetWeight < firstWeight.weightKg
        ? 'lose'
        : 'maintain'
    : null;

  const weightGoalReached = Boolean(latestWeight && targetWeight) && (
    weightGoalDirection === 'gain'
      ? latestWeight!.weightKg >= targetWeight!
      : weightGoalDirection === 'lose'
        ? latestWeight!.weightKg <= targetWeight!
        : Math.abs(latestWeight!.weightKg - targetWeight!) < 0.05
  );

  const weightRemaining = latestWeight && targetWeight
    ? normalizeHealthNumber(Math.abs(targetWeight - latestWeight.weightKg).toFixed(1))
    : null;

  const weightGoalDistance = firstWeight && targetWeight
    ? Math.abs(targetWeight - firstWeight.weightKg)
    : 0;

  const weightGoalProgress = weightRemaining !== null && weightGoalDistance > 0
    ? Math.max(0, Math.min(100, ((weightGoalDistance - weightRemaining) / weightGoalDistance) * 100))
    : weightGoalReached
      ? 100
      : 0;

  const goalProgressText = weightRemaining === null
    ? 'Goal not set'
    : weightGoalReached
      ? 'Goal reached'
      : `${displayWeight(weightRemaining)} remaining`;

  const weightTrendData = sortedWeights.slice(-7);
  const weightTrendDatasetSignature = weightTrendData.length > 1
    ? JSON.stringify(weightTrendData.map(entry => [entry.id, entry.date, entry.weightKg]))
    : '';
  const maxWeight = Math.max(1, ...weightTrendData.map(item => item.weightKg));
  const minWeight = weightTrendData.length
    ? Math.min(...weightTrendData.map(item => item.weightKg))
    : 0;

  const weightTrendPoints = weightTrendData.length > 1
    ? weightTrendData
      .map((entry, index) => {
        const x = (index / (weightTrendData.length - 1)) * 100;
        const range = maxWeight - minWeight || 1;
        const y = 90 - ((entry.weightKg - minWeight) / range) * 70;
        return `${x},${y}`;
      })
      .join(' ')
    : '';

  const automaticallyIncludedFoodDates = Array.from(
    new Set(
      foodEntries
        .filter(entry => hasCompleteNutrition(entry))
        .map(entry => formatLocalDateInput(entry.date))
        .filter(dateKey => dateKey < todayDateKey),
    ),
  );

  const includedFoodLogDates = Array.from(
    new Set([...completedFoodLogDates, ...automaticallyIncludedFoodDates]),
  )
    .filter(dateKey => !excludedFoodLogDates.includes(dateKey))
    .filter(dateKey => foodEntries.some(entry => formatLocalDateInput(entry.date) === dateKey))
    .sort();

  const hasTodayFoodLog = todayFoodEntries.length > 0;
  const hasCompletedFoodLog = isSelectedFoodLogIncluded;

  const caloriesRemaining = hasCalorieTarget
    ? targetCalories - todayTotals.calories
    : 0;

  const proteinRemaining = hasProteinTarget
    ? Math.max(0, targetProtein - todayTotals.protein)
    : 0;

  const hasKnownCalories = dailyCalorieSummary.hasKnownCalories;
  const hasKnownProtein = todayNutrition.knownCounts.protein > 0;
  const hasLoggedSodium = todayNutrition.knownCounts.sodium > 0;
  const hasKnownCarbs = todayNutrition.knownCounts.carbs > 0;
  const hasKnownFat = todayNutrition.knownCounts.fat > 0;
  const hasKnownFiber = todayNutrition.knownCounts.fiber > 0;
  const hasKnownSugar = todayNutrition.knownCounts.sugar > 0;
  const isOverCalories = hasCompletedFoodLog && hasKnownCalories && hasCalorieTarget && todayTotals.calories > targetCalories;
  const isLowProtein = hasCompletedFoodLog && hasKnownProtein && hasProteinTarget && todayTotals.protein < targetProtein;
  const isLowCarbs = hasCompletedFoodLog && hasKnownCarbs && hasCarbsTarget && todayTotals.carbs < targetCarbs;
  const isLowFat = hasCompletedFoodLog && hasKnownFat && hasFatTarget && todayTotals.fat < targetFat;
  const isLowFiber = hasCompletedFoodLog && hasKnownFiber && hasFiberTarget && todayTotals.fiber < targetFiber;
  const isOverSugar = hasCompletedFoodLog && hasKnownSugar && hasSugarLimit && todayTotals.sugar !== undefined && todayTotals.sugar > sugarLimit;
  const sodiumRatio = hasSodiumTarget && hasLoggedSodium ? todayTotals.sodium / sodiumLimitMg : 0;
  const isHighSodium = hasCompletedFoodLog && hasLoggedSodium && hasSodiumTarget && sodiumRatio > 1;
  const isVeryHighSodium = hasCompletedFoodLog && hasLoggedSodium && hasSodiumTarget && sodiumRatio > 1.25;

  // Sodium is a limit, so its status/tone come from the same limit curve used
  // by the Food Log cards below — this is what keeps "Today" and "Food Log"
  // from disagreeing about what counts as near/over.
  const sodiumLimitTone = getNutritionTargetTone('limit', todayTotals.sodium, hasSodiumTarget ? sodiumLimitMg : undefined, hasLoggedSodium);
  const sodiumLimitDetail = getNutritionTargetStatus('limit', todayTotals.sodium, hasSodiumTarget ? sodiumLimitMg : undefined, hasLoggedSodium, 'mg');

  const sodiumStatus = !hasLoggedSodium
    ? todayFoodEntries.length ? 'Not entered' : 'No sodium logged'
    : !hasSodiumTarget
    ? 'No limit set'
    : !hasCompletedFoodLog
      ? 'Provisional'
      : sodiumLimitDetail;

  const needsAttention = [
    {
      active: isOverCalories,
      label: 'Calories above selected target',
      detail: `${formatDisplayNumber(Math.abs(caloriesRemaining))} cal over target`,
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
    },
    {
      active: isVeryHighSodium,
      label: 'Sodium well over selected limit',
      detail: `${formatDisplayNumber(todayTotals.sodium)}mg / ${formatDisplayNumber(sodiumLimitMg)}mg`,
      className: 'border-red-500/30 bg-red-500/10 text-red-400',
    },
    {
      active: isHighSodium && !isVeryHighSodium,
      label: 'Sodium over selected limit',
      detail: `${formatDisplayNumber(todayTotals.sodium)}mg / ${formatDisplayNumber(sodiumLimitMg)}mg`,
      className: 'border-red-500/30 bg-red-500/10 text-red-400',
    },
    {
      active: isLowProtein,
      label: 'Protein below selected target',
      detail: `${formatDisplayNumber(proteinRemaining)}g to target`,
      className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500',
    },
    {
      active: isLowCarbs,
      label: 'Carbohydrates below selected target',
      detail: `${formatDisplayNumber(targetCarbs - todayTotals.carbs)}g to target`,
      className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500',
    },
    {
      active: isLowFat,
      label: 'Fat below selected target',
      detail: `${formatDisplayNumber(targetFat - todayTotals.fat)}g to target`,
      className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500',
    },
    {
      active: isLowFiber,
      label: 'Fiber below selected target',
      detail: `${formatDisplayNumber(targetFiber - todayTotals.fiber)}g to target`,
      className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500',
    },
    {
      active: isOverSugar,
      label: 'Sugar over selected limit',
      detail: `${formatDisplayNumber((todayTotals.sugar || 0) - sugarLimit)}g over limit`,
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
    },
  ].filter(item => item.active);

  const todaySummaryStatus = !hasTodayFoodLog
    ? 'No meals logged'
    : !hasCompletedFoodLog
      ? 'Ready to complete'
      : needsAttention.length
        ? 'Worth checking'
        : 'Within selected targets';

  const sodiumTone = !hasLoggedSodium || !hasSodiumTarget
    ? 'neutral' as const
    : !hasCompletedFoodLog
      ? 'caution' as const
      : sodiumLimitTone;

  const todaySummaryItems = [
    hasCalorieTarget
      ? {
        label: 'Calories',
        value: !hasKnownCalories
          ? 'Not entered'
          : `${formatDisplayNumber(todayTotals.calories)} / ${formatDisplayNumber(targetCalories)} cal`,
        detail: !hasTodayFoodLog
          ? 'No meals logged'
          : !hasKnownCalories
            ? 'Add calorie details'
            : !hasCompletedFoodLog
              ? 'Ready to complete'
              : getNutritionTargetStatus('calories', todayTotals.calories, targetCalories, hasKnownCalories, ' cal'),
        tone: !hasTodayFoodLog
          ? 'neutral' as const
          : !hasKnownCalories
            ? 'caution' as const
            : !hasCompletedFoodLog
              ? 'caution' as const
              : getNutritionTargetTone('calories', todayTotals.calories, targetCalories, hasKnownCalories),
      }
      : { label: 'Calories', value: formatFoodNutritionValue(todayFoodEntries, 'calories', todayTotals.calories), detail: hasTodayFoodLog && !hasKnownCalories ? 'Add calorie details' : undefined, tone: 'neutral' as const },
    {
      label: 'Net calories',
      value: !hasTodayFoodLog
        ? '—'
        : !hasKnownCalories
          ? 'Not entered'
          : `${formatDisplayNumber(netCalories)} cal`,
      detail: hasTodayFoodLog && hasKnownCalories
        ? `${formatDisplayNumber(totalCaloriesBurned)} cal logged exercise`
        : 'Food intake minus logged exercise',
      tone: 'neutral' as const,
    },
    hasProteinTarget
      ? {
        label: 'Protein',
        value: !hasKnownProtein ? 'Not entered' : `${formatMacro(todayTotals.protein)} / ${formatDisplayNumber(targetProtein)}g`,
        detail: !hasTodayFoodLog
          ? 'No meals logged'
          : !hasKnownProtein
            ? 'Add protein details'
            : !hasCompletedFoodLog
              ? 'Ready to complete'
              : getNutritionTargetStatus('goal', todayTotals.protein, targetProtein, hasKnownProtein, 'g'),
        tone: !hasTodayFoodLog
          ? 'neutral' as const
          : !hasKnownProtein
            ? 'caution' as const
            : !hasCompletedFoodLog
              ? 'caution' as const
              : getNutritionTargetTone('goal', todayTotals.protein, targetProtein, hasKnownProtein),
      }
      : { label: 'Protein', value: formatFoodNutritionValue(todayFoodEntries, 'protein', todayTotals.protein, 'g'), detail: hasTodayFoodLog && !hasKnownProtein ? 'Add protein details' : undefined, tone: 'neutral' as const },
    {
      label: 'Sodium',
      value: hasLoggedSodium
        ? hasSodiumTarget
          ? `${formatDisplayNumber(todayTotals.sodium)} / ${formatDisplayNumber(sodiumLimitMg)} mg`
          : `${formatDisplayNumber(todayTotals.sodium)} mg`
        : hasTodayFoodLog ? 'Not entered' : '—',
      detail: sodiumStatus,
      tone: sodiumTone,
    },
    {
      label: 'BMI',
      value: bmi === null ? 'Not available' : formatDisplayNumber(bmi),
      detail: bmi === null ? 'Need height and latest weight' : 'Derived from latest weight',
      tone: 'neutral' as const,
    },
  ];

  const saveHealthPatch = (
    patch: Partial<HealthProfile>,
    evidence?: HealthEvidenceEvent,
  ) => {
    if (!updateHealthProfile || !currentProfileId) return;
    updateHealthProfile(patch, evidence);
  };

  const markFoodLogComplete = () => {
    if (!hasTodayFoodLog) return;

    if (isSelectedFoodLogIncluded) {
      saveHealthPatch({
        foodLogCompletedDates: completedFoodLogDates.filter(date => date !== foodLogDate),
        foodLogExcludedDates: isSelectedFoodLogAutoIncluded
          ? Array.from(new Set([...excludedFoodLogDates, foodLogDate])).sort()
          : excludedFoodLogDates.filter(date => date !== foodLogDate),
      });
      return;
    }

    saveHealthPatch({
      foodLogCompletedDates: Array.from(new Set([...completedFoodLogDates, foodLogDate])).sort(),
      foodLogExcludedDates: excludedFoodLogDates.filter(date => date !== foodLogDate),
    });
  };

  const updateWorkoutEntry = (id: string, patch: Record<string, any>) => {
    const nextEntries = activityEntries.map(entry =>
      entry.id === id
        ? {
          ...entry,
          ...patch,
          date: patch.date ? parseLocalDateValue(patch.date) || entry.date : entry.date,
        }
        : entry
    );
    const previousEntry = activityEntries.find(entry => entry.id === id);
    const nextEntry = nextEntries.find(entry => entry.id === id);
    if (currentProfileId && previousEntry && nextEntry) {
      const previousMedia = collectMediaReferenceIds(previousEntry);
      const nextMedia = collectMediaReferenceIds(nextEntry);
      queueMediaCleanup({
        profileId: currentProfileId,
        assetIds: [...previousMedia].filter(assetId => !nextMedia.has(assetId)),
        reason: 'attachment-detached',
      });
    }
    saveHealthPatch({
      activityEntries: nextEntries,
    });
  };

  const saveSleepEntry = (draft: any) => {
    const nextEntry = {
      ...draft,
      id: draft.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? `sleep-${crypto.randomUUID()}` : `sleep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      date: parseLocalDateValue(draft.date) || new Date(),
      sleepDurationMinutes: normalizeSleepDurationMinutes(draft),
      quality: draft.quality || 'good',
      createdAt: draft.createdAt || new Date(),
    };

    saveHealthPatch({
      sleepEntries: draft.id
        ? sleepEntries.map(entry => entry.id === draft.id ? nextEntry : entry)
        : [...sleepEntries, nextEntry],
    }, { kind: 'sleep', entry: nextEntry });
  };

  const deleteSleepEntry = (id: string) => {
    saveHealthPatch({
      sleepEntries: sleepEntries.filter(entry => entry.id !== id),
    });
  };

  const monthlySleepEntries =
    sleepEntries.filter(entry =>
      getLastNDays(30).some(day =>
        isSameDay(entry.date, day)
      )
    );

  const averageSleepMinutes = averageSleepDurationMinutes(monthlySleepEntries);
  const averageBedtimeMinutes = averageSleepClockTime(monthlySleepEntries, 'bedTime');
  const averageWakeTimeMinutes = averageSleepClockTime(monthlySleepEntries, 'wakeTime');
  const sortedSleepEntries = [...sleepEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const recentSleepEntries = sortedSleepEntries.slice(0, 7);
  const latestSleepEntryForScore = sortedSleepEntries[0];
  const latestCaizenSleepScore = latestSleepEntryForScore
    ? calculateCaizenSleepScore({
      sleepDurationMinutes: getSleepDurationMinutes(latestSleepEntryForScore),
      sleepTargetMinutes: hasSleepTarget ? sleepTargetMinutes : null,
      quality: latestSleepEntryForScore.quality,
      timesAwakened: latestSleepEntryForScore.timesAwakened,
      morningMood: latestSleepEntryForScore.morningMood,
    })
    : null;
  const sleepTotalPages = Math.max(1, Math.ceil(sortedSleepEntries.length / HEALTH_LIST_PAGE_SIZE));
  const paginatedSleepEntries = sortedSleepEntries.slice(
    (sleepPage - 1) * HEALTH_LIST_PAGE_SIZE,
    sleepPage * HEALTH_LIST_PAGE_SIZE,
  );

  useEffect(() => {
    setSavedFoodPage(1);
  }, [savedFoodSearch]);

  useEffect(() => {
    setMealTemplatePage(1);
  }, [mealTemplateSearch]);

  useEffect(() => {
    setWeightPage(page => Math.min(page, weightTotalPages));
  }, [weightTotalPages]);

  useEffect(() => {
    setSleepPage(page => Math.min(page, sleepTotalPages));
  }, [sleepTotalPages]);

  const renderSleepEntry = (entry: SleepEntry) => (
    <DataRecordRow
      key={entry.id}
      primary={formatSleepDuration(getSleepDurationMinutes(entry))}
      value={entry.quality ? <StatusBadge status={['good', 'great', 'excellent'].includes(entry.quality.toLowerCase()) ? 'success' : entry.quality.toLowerCase() === 'fair' ? 'warning' : entry.quality.toLowerCase() === 'poor' ? 'danger' : 'neutral'}>{formatSleepQuality(entry.quality)}</StatusBadge> : undefined}
      metadata={<>
        {formatDate(entry.date)}
        {entry.bedTime || entry.wakeTime ? ` · ${entry.bedTime || '--:--'} to ${entry.wakeTime || '--:--'}` : ''}
        {entry.notes ? ` · ${entry.notes}` : ''}
      </>}
      actions={androidPresentation ? <>
        <Tooltip><TooltipTrigger asChild><button type="button" onClick={() => { setEditingSleep(entry); setShowSleepModal(true); }} aria-label={`Edit sleep log from ${formatDate(entry.date)}`} className="android-compact-action-button"><Pencil className="size-4" aria-hidden="true" /></button></TooltipTrigger><TooltipContent>{"Edit sleep log"}</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><button type="button" onClick={() => setSleepToDelete(entry)} aria-label={`Delete sleep log from ${formatDate(entry.date)}`} className="android-compact-action-button android-compact-action-button--destructive"><Trash2 className="size-4" aria-hidden="true" /></button></TooltipTrigger><TooltipContent>{"Delete sleep log"}</TooltipContent></Tooltip>
      </> : <>
        <Button type="button" variant="outline" size="sm" onClick={() => { setEditingSleep(entry); setShowSleepModal(true); }}>Edit</Button>
        <Button type="button" variant="destructive" size="sm" onClick={() => setSleepToDelete(entry)}>Delete</Button>
      </>}
    />
  );

  const tabs = [
    {
      id: 'overview',
      label: 'Today',
      icon: Activity,
    },
    {
      id: 'food',
      label: 'Food Log',
      icon: Utensils,
    },
    {
      id: 'fasting',
      label: 'Fasting',
      icon: Timer,
    },
    {
      id: 'weight',
      label: 'Weight',
      icon: Weight,
    },
    {
      id: 'workout',
      label: 'Workouts',
      icon: Activity,
    },
    {
      id: 'sleep',
      label: 'Sleep',
      icon: HeartPulse,
    },
    {
      id: 'streaks',
      label: 'Habits & Streaks',
      icon: Flame,
    },
    {
      id: 'trends',
      label: 'Trends',
      icon: LineChart,
    },
    {
      id: 'saved',
      label: 'Food Library',
      icon: Save,
    },
    {
      id: 'supplements',
      label: 'Supplements',
      icon: HeartPulse,
    },
  ] as const;
  const orderedHealthTabs = healthTabPreferences.order
    .map(id => tabs.find(tab => tab.id === id))
    .filter((tab): tab is (typeof tabs)[number] => Boolean(tab));
  const visibleHealthTabs = orderedHealthTabs.filter(tab =>
    !healthTabPreferences.hidden.includes(tab.id) || tab.id === activeTab
  );
  const visibleHealthTabIds = visibleHealthTabs.map(tab => tab.id);
  const visibleHealthTabIdsKey = visibleHealthTabIds.join('|');
  const hiddenHealthTabs = orderedHealthTabs.filter(tab =>
    healthTabPreferences.hidden.includes(tab.id) && tab.id !== activeTab
  );

  const scrollHealthTabIntoView = useCallback((id: HealthTab) => {
    const tab = healthTabRefs.current[id];
    const strip = healthTabScrollRef.current;
    if (!tab || !strip) return;

    const stripRect = strip.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const edgePadding = 8;
    const leftDelta = tabRect.left - stripRect.left - edgePadding;
    const rightDelta = tabRect.right - stripRect.right + edgePadding;
    const delta = leftDelta < 0 ? leftDelta : rightDelta > 0 ? rightDelta : 0;
    if (!delta) return;

    strip.scrollTo({
      left: Math.max(0, strip.scrollLeft + delta),
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [reduceMotion]);

  const navigateHealthTab = (id: HealthTab) => {
    setContextTab(null);
    setHiddenTabsMenuOpen(false);
    setActiveTab(id);
    window.requestAnimationFrame(() => {
      healthTabRefs.current[id]?.focus({ preventScroll: true });
      scrollHealthTabIntoView(id);
    });
  };

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const strip = healthTabScrollRef.current;
      if (!strip) return;
      if (activeTab === 'overview') {
        strip.scrollTo({ left: 0, behavior: 'auto' });
      } else {
        scrollHealthTabIntoView(activeTab);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, scrollHealthTabIntoView, visibleHealthTabIdsKey]);

  const foodSummaryItems: FoodSummaryMetric[] = [
    { label: 'Calories', field: 'calories' as NutritionField, value: formatFoodNutritionValue(todayFoodEntries, 'calories', todayTotals.calories), suffix: ' cal', target: hasCalorieTarget ? targetCalories : undefined, mode: 'calories' as const, unit: 'cal' },
    { label: 'Protein', field: 'protein' as NutritionField, value: formatFoodNutritionValue(todayFoodEntries, 'protein', todayTotals.protein), suffix: 'g', target: hasProteinTarget ? targetProtein : undefined, mode: 'goal' as const, unit: 'g' },
    { label: 'Carbs', field: 'carbs' as NutritionField, value: formatFoodNutritionValue(todayFoodEntries, 'carbs', todayTotals.carbs), suffix: 'g', target: hasCarbsTarget ? targetCarbs : undefined, mode: 'goal' as const, unit: 'g' },
    { label: 'Fat', field: 'fat' as NutritionField, value: formatFoodNutritionValue(todayFoodEntries, 'fat', todayTotals.fat), suffix: 'g', target: hasFatTarget ? targetFat : undefined, mode: 'goal' as const, unit: 'g' },
    { label: 'Fiber', field: 'fiber' as NutritionField, value: formatFoodNutritionValue(todayFoodEntries, 'fiber', todayTotals.fiber), suffix: 'g', target: hasFiberTarget ? targetFiber : undefined, mode: 'goal' as const, unit: 'g' },
    { label: 'Sugar', field: 'sugar' as NutritionField, value: formatFoodNutritionValue(todayFoodEntries, 'sugar', todayTotals.sugar), suffix: 'g', target: hasSugarLimit ? sugarLimit : undefined, mode: 'limit' as const, unit: 'g' },
    { label: 'Sodium', field: 'sodium' as NutritionField, value: formatFoodNutritionValue(todayFoodEntries, 'sodium', todayTotals.sodium), suffix: 'mg', target: hasSodiumTarget ? sodiumLimitMg : undefined, mode: 'limit' as const, unit: 'mg' },
    { label: 'Exercise Burned', value: formatDisplayNumber(totalCaloriesBurned), suffix: ' cal', status: todayActivityEntries.length ? 'Logged activity' : 'No activity logged' },
    { label: 'Net Calories', value: hasNoKnownNutrition(todayFoodEntries, 'calories') ? 'Not entered' : formatDisplayNumber(netCalories), suffix: ' cal', status: hasKnownCalories ? 'Food intake minus exercise' : 'Add calorie details' },
  ].map(item => {
    if (!item.field || !item.mode) return item;
    const known = todayNutrition.knownCounts[item.field] > 0;
    const value = Number(todayTotals[item.field] ?? 0);
    return {
      ...item,
      // Pairing the logged amount with its target/limit makes the relationship
      // legible at a glance instead of requiring the caption to carry it alone.
      value: known && item.target
        ? `${formatDisplayNumber(value)} / ${formatDisplayNumber(item.target)}`
        : item.value,
      status: getNutritionTargetStatus(item.mode, value, item.target, known, item.unit || ''),
    };
  });

  const configuredOverviewCards = [
    { label: 'Carbs', field: 'carbs' as NutritionField, target: hasCarbsTarget ? targetCarbs : undefined, mode: 'goal' as const, unit: 'g' },
    { label: 'Fat', field: 'fat' as NutritionField, target: hasFatTarget ? targetFat : undefined, mode: 'goal' as const, unit: 'g' },
    { label: 'Fiber', field: 'fiber' as NutritionField, target: hasFiberTarget ? targetFiber : undefined, mode: 'goal' as const, unit: 'g' },
    { label: 'Sugar', field: 'sugar' as NutritionField, target: hasSugarLimit ? sugarLimit : undefined, mode: 'limit' as const, unit: 'g' },
  ].flatMap(config => {
    const target = config.target;
    if (!target) return [];
    const known = todayNutrition.knownCounts[config.field] > 0;
    const value = Number(todayTotals[config.field] ?? 0);
    const tone = getNutritionTargetTone(config.mode, value, target, known);
    const toneClass = tone === 'negative'
      ? 'border-red-500/30 bg-red-500/10'
      : tone === 'caution'
        ? 'border-amber-500/30 bg-amber-500/10'
        : tone === 'positive'
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-border/50 bg-background/40';
    return [{
      label: config.label,
      value: formatFoodNutritionValue(todayFoodEntries, config.field, value, config.unit),
      caption: `${getNutritionTargetStatus(config.mode, value, target, known, config.unit)} · ${config.mode === 'limit' ? 'Limit' : 'Target'} ${formatDisplayNumber(target)}${config.unit}`,
      cardClass: toneClass,
    }];
  });

  const overviewCards = [
    {
      label: 'Latest weight',
      value: latestWeight ? displayWeight(latestWeight.weightKg) : '—',
      caption: targetWeight ? `Target ${displayWeight(targetWeight)}` : 'No target set',
      cardClass: latestWeight ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-border/50 bg-background/40',
    },
    {
      label: 'Last sleep',
      value: latestSleepEntry
        ? formatSleepDuration(getSleepDurationMinutes(latestSleepEntry))
        : '—',
      caption: latestSleepEntry ? 'Most recent sleep log' : 'No sleep log',
      cardClass: latestSleepEntry?.quality === 'poor'
        ? 'border-red-500/30 bg-red-500/10'
        : latestSleepEntry?.quality === 'fair'
          ? 'border-amber-500/30 bg-amber-500/10'
          : latestSleepEntry?.quality
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-border/50 bg-background/40',
    },
    {
      label: 'Activity today',
      value: `${todayMovementMinutes} min`,
      caption: todayActivityEntries.length ? 'Logged activity' : 'No activity logged',
      cardClass: todayActivityEntries.length ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-border/50 bg-background/40',
    },
    ...configuredOverviewCards,
  ];

  const uniqueSavedFoods =
    (health?.foodTemplates || []) as FoodTemplate[];

  const mealTemplates: MealTemplate[] = health?.mealTemplates || [];

  const favoriteFoodIds = health?.favoriteFoodTemplateIds || [];
  const favoriteMealIds = health?.favoriteMealTemplateIds || [];
  const recentFoodTemplateIds = Array.from(new Set([...foodEntries]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .flatMap(entry => entry.sourceFoodTemplateId ? [entry.sourceFoodTemplateId] : [])));
  const recentMealTemplateIds = Array.from(new Set([...foodEntries]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .flatMap(entry => entry.sourceMealTemplateId ? [entry.sourceMealTemplateId] : [])));
  const orderedMealTemplates = [...mealTemplates].sort((a, b) => {
    const favoriteOrder = Number(favoriteMealIds.includes(b.id)) - Number(favoriteMealIds.includes(a.id));
    if (favoriteOrder) return favoriteOrder;
    const recentOrder = (recentMealTemplateIds.indexOf(a.id) < 0 ? Number.MAX_SAFE_INTEGER : recentMealTemplateIds.indexOf(a.id))
      - (recentMealTemplateIds.indexOf(b.id) < 0 ? Number.MAX_SAFE_INTEGER : recentMealTemplateIds.indexOf(b.id));
    return recentOrder || a.name.localeCompare(b.name);
  });

  const toggleFoodFavorite = (id: string) => {
    updateHealthProfile({ favoriteFoodTemplateIds: favoriteFoodIds.includes(id) ? favoriteFoodIds.filter(item => item !== id) : [...favoriteFoodIds, id] });
  };
  const toggleMealFavorite = (id: string) => {
    updateHealthProfile({ favoriteMealTemplateIds: favoriteMealIds.includes(id) ? favoriteMealIds.filter(item => item !== id) : [...favoriteMealIds, id] });
  };


  const filteredSavedFoods =
    uniqueSavedFoods.filter(food =>
      food.name
        .toLowerCase()
        .includes(
          savedFoodSearch.toLowerCase()
        )
    ).sort((a, b) => {
      const favoriteOrder = Number(favoriteFoodIds.includes(b.id)) - Number(favoriteFoodIds.includes(a.id));
      if (favoriteOrder) return favoriteOrder;
      const recentOrder = (recentFoodTemplateIds.indexOf(a.id) < 0 ? Number.MAX_SAFE_INTEGER : recentFoodTemplateIds.indexOf(a.id))
        - (recentFoodTemplateIds.indexOf(b.id) < 0 ? Number.MAX_SAFE_INTEGER : recentFoodTemplateIds.indexOf(b.id));
      return recentOrder || a.name.localeCompare(b.name);
    });

  const filteredMealTemplates =
    mealTemplates.filter(template =>
      `${template.name || ''} ${template.mealType || ''}`
        .toLowerCase()
        .includes(mealTemplateSearch.toLowerCase())
    ).sort((a, b) => {
      const favoriteOrder = Number(favoriteMealIds.includes(b.id)) - Number(favoriteMealIds.includes(a.id));
      if (favoriteOrder) return favoriteOrder;
      const recentOrder = (recentMealTemplateIds.indexOf(a.id) < 0 ? Number.MAX_SAFE_INTEGER : recentMealTemplateIds.indexOf(a.id))
        - (recentMealTemplateIds.indexOf(b.id) < 0 ? Number.MAX_SAFE_INTEGER : recentMealTemplateIds.indexOf(b.id));
      return recentOrder || a.name.localeCompare(b.name);
    });

  const savedFoodTotalPages = Math.max(1, Math.ceil(filteredSavedFoods.length / HEALTH_LIST_PAGE_SIZE));
  const mealTemplateTotalPages = Math.max(1, Math.ceil(filteredMealTemplates.length / HEALTH_LIST_PAGE_SIZE));
  const paginatedSavedFoods = filteredSavedFoods.slice(
    (savedFoodPage - 1) * HEALTH_LIST_PAGE_SIZE,
    savedFoodPage * HEALTH_LIST_PAGE_SIZE,
  );
  const paginatedMealTemplates = filteredMealTemplates.slice(
    (mealTemplatePage - 1) * HEALTH_LIST_PAGE_SIZE,
    mealTemplatePage * HEALTH_LIST_PAGE_SIZE,
  );

  useEffect(() => {
    setSavedFoodPage(page => Math.min(page, savedFoodTotalPages));
  }, [savedFoodTotalPages]);

  useEffect(() => {
    setMealTemplatePage(page => Math.min(page, mealTemplateTotalPages));
  }, [mealTemplateTotalPages]);

  const trendDays =
    getLastNDays(7);

  const trendData =
    trendDays.map(date => {
      const entries =
        foodEntries.filter(entry =>
          isSameDay(
            entry.date,
            date
          )
        );

      const activities =
        activityEntries.filter(entry =>
          isSameDay(
            entry.date,
            date
          )
        );

      const dateKey = formatLocalDateInput(date);
      const isComplete = includedFoodLogDates.includes(dateKey);

      const calories =
        isComplete
          ? entries.reduce(
            (sum, entry) =>
            sum + normalizeHealthNonNegative(entry.calories),
            0
          )
          : 0;

      const protein =
        isComplete
          ? entries.reduce(
            (sum, entry) =>
            sum + normalizeHealthNonNegative(entry.protein),
            0
          )
          : 0;

      const sodium =
        isComplete
          ? entries.reduce(
            (sum, entry) =>
            sum + normalizeHealthNonNegative(entry.sodium),
            0
          )
          : 0;

      const fiber =
        isComplete
          ? entries.reduce(
            (sum, entry) =>
            sum + normalizeHealthNonNegative(entry.fiber),
            0
          )
          : 0;

      const burned =
        activities.reduce(
          (sum, entry) =>
            sum + normalizeHealthNonNegative(entry.caloriesBurned),
          0
        );

      return {
        date,
        label:
          date.toLocaleDateString(
            'en-US',
            {
              month:
                'short',
              day:
                'numeric',
            }
          ),
        calories,
        protein,
        sodium,
        fiber,
        burned,
        netCalories:
          calories - burned,
        isComplete,
        entryCount:
          isComplete ? entries.length : 0,
        hasLog:
          isComplete,
      };
    });

  const weeklyCompletedTrendData =
    trendData.filter(day => day.isComplete);

  const weeklyHighSodiumDays = hasSodiumTarget
    ? weeklyCompletedTrendData.filter(day => day.sodium > sodiumLimitMg).length
    : 0;

  const sevenDayDates = getLastNDays(7);
  const weeklyStart = new Date(sevenDayDates[0]);
  weeklyStart.setHours(0, 0, 0, 0);
  const weeklyEnd = new Date(sevenDayDates[sevenDayDates.length - 1]);
  weeklyEnd.setHours(23, 59, 59, 999);
  const workoutWeekSummary = getWorkoutWeekSummary(health?.workoutSessions || [], activityEntries, weeklyStart, weeklyEnd);
  const weeklyWorkouts = workoutWeekSummary.sessions;
  const weeklyMovementMinutes = Math.round(workoutWeekSummary.movementMinutes);

  const weeklySleepEntries =
    sleepEntries.filter(entry =>
      sevenDayDates.some(day =>
        isSameDay(entry.date, day)
      )
    );

  const weeklySleepEntriesWithDuration = weeklySleepEntries.filter(entry => getSleepDurationMinutes(entry) > 0);
  const weeklySleepAverageMinutes = averageSleepDurationMinutes(weeklySleepEntriesWithDuration);
  const weeklySleepScoreAverage = averageOptionalSleepMetric(weeklySleepEntries, 'sleepScore');
  const weeklyTimesAwakenedAverage = averageOptionalSleepMetric(weeklySleepEntries, 'timesAwakened');
  const weeklySleepQualityTrend = sevenDayDates.map(date => {
    const dayEntries = weeklySleepEntries.filter(entry => isSameDay(entry.date, date));
    return {
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      quality: dayEntries[dayEntries.length - 1]?.quality || null,
    };
  });
  const sleepTargetProgress = hasSleepTarget && weeklySleepAverageMinutes > 0
    ? Math.min(100, Math.max(0, Math.round((weeklySleepAverageMinutes / sleepTargetMinutes) * 100)))
    : 0;
  const exerciseTargetProgress = hasExerciseTarget && weeklyMovementMinutes > 0
    ? Math.min(100, Math.max(0, Math.round((weeklyMovementMinutes / targetExerciseMinutesPerWeek) * 100)))
    : 0;

  const weeklyWeights =
    weightEntries
      .filter(entry =>
        sevenDayDates.some(day =>
        isSameDay(entry.date, day)
        )
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const weeklyWeightChange =
    weeklyWeights.length >= 2
      ? normalizeHealthNumber(weeklyWeights[weeklyWeights.length - 1].weightKg) - normalizeHealthNumber(weeklyWeights[0].weightKg)
      : null;

  const weeklyNutritionGrade = weeklyCompletedTrendData.length >= 4
    ? 'Consistent'
    : weeklyCompletedTrendData.length
      ? 'Building data'
      : 'No nutrition days';

  const weeklySleepGrade = weeklySleepAverageMinutes > 0
    ? `${formatSleepDuration(weeklySleepAverageMinutes)} average`
    : 'No sleep logs';

  const weeklyMovementGrade = weeklyWorkouts > 0
    ? `${weeklyWorkouts} ${weeklyWorkouts === 1 ? 'session' : 'sessions'}`
    : 'No activity logs';

  const latestWorkout = getLatestCompletedWorkout(health?.workoutSessions || [], activityEntries);
  const latestWorkoutLabel = latestWorkout
    ? latestWorkout.kind === 'session'
      ? latestWorkout.value.routineName
      : latestWorkout.value.activity
    : null;
  const nextScheduledWorkout = getNextScheduledWorkout(dailyChecklistItems || []);
  const nextWorkoutLabel = nextScheduledWorkout?.item.title.replace(/^Workout\s*·\s*/i, '') || null;
  const activeFastingLabel = activeFastingSession
    ? formatFastingShortDuration(getFastingElapsedMs(activeFastingSession, new Date(fastingNow)))
    : null;
  const activeFastingStartedLabel = activeFastingSession
    ? activeFastingSession.startedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null;
  const weeklyWeightGrade = weeklyWeights.length
    ? `${weeklyWeights.length} ${weeklyWeights.length === 1 ? 'check-in' : 'check-ins'}`
    : 'No weight check';

  const registerFoodBatch = (
    drafts: Array<Omit<FoodEntry, 'id' | 'createdAt'>>,
    label: string,
  ) => {
    const ids = addFoodEntries(drafts);
    if (!ids.length) return;
    notify({
      actionId: `health-food-batch:${ids.join(',')}`,
      kind: 'success',
      title: `Added ${label}`,
      description: `${ids.length} ${ids.length === 1 ? 'entry' : 'entries'}`,
      undo: {
        label: 'Undo',
        execute: () => deleteFoodEntries(ids),
      },
    });
  };

  const previousFoodLogDate = shiftHealthDate(formatLocalDateInput(selectedFoodLogDate), -1, todayDateKey);
  const previousDayFoodEntries = foodEntries.filter(entry => isSameDay(entry.date, previousFoodLogDate));
  const repeatPreviousDayFood = () => {
    if (!previousDayFoodEntries.length) return;
    registerFoodBatch(previousDayFoodEntries.map(entry => {
      const { id: _id, createdAt: _createdAt, ...snapshot } = entry;
      return { ...snapshot, date: selectedFoodLogDate };
    }), 'previous day');
  };

  const addSavedFoodAgain = (
    template: FoodTemplate,
    mealType: MealType = suggestedMealType(),
  ) => {
    const grams = normalizeHealthNonNegative(template.referenceWeightGrams);

    registerFoodBatch([
      {
        name: template.name,
        mealType,
        date: selectedFoodLogDate,
        amount: grams || 1,
        unit: grams ? 'g' : 'serving',
        serving: grams ? `${grams}g` : '1 serving',
        sourceFoodTemplateId: template.id,
        calories: Number((normalizeHealthNonNegative(template.caloriesPerGram) * grams).toFixed(1)),
        protein: Number((normalizeHealthNonNegative(template.proteinPerGram) * grams).toFixed(1)),
        carbs: Number((normalizeHealthNonNegative(template.carbsPerGram) * grams).toFixed(1)),
        fat: Number((normalizeHealthNonNegative(template.fatPerGram) * grams).toFixed(1)),
        sodium: Math.round(normalizeHealthNonNegative(template.sodiumPerGram) * grams),
        fiber: Number((normalizeHealthNonNegative(template.fiberPerGram) * grams).toFixed(1)),
        ...(template.sugarPerGram === undefined || isNutritionFieldMissing(template, 'sugar') ? {} : { sugar: Number((normalizeHealthNonNegative(template.sugarPerGram) * grams).toFixed(1)) }),
        nutritionMissing: getNutritionMissingFields(template),
        notes: '',
      },
    ], template.name);
  };

  const saveMealTemplate = (
    draft: Omit<MealTemplate, 'id' | 'createdAt'>,
    existingId?: string,
  ) => {
    saveHealthPatch({
      mealTemplates: [
        ...mealTemplates.filter(template => template.id !== existingId),
        existingId
          ? {
              id: existingId,
              ...draft,
              createdAt: mealTemplates.find(template => template.id === existingId)?.createdAt || new Date(),
            }
          : {
              id: createEntityId('meal-template'),
              ...draft,
              createdAt: new Date(),
            },
      ],
    });
    setMealTemplateEditor(null);
  };

  const deleteMealTemplate = (id: string) => {
    saveHealthPatch({
      mealTemplates: mealTemplates.filter(template => template.id !== id),
    });
  };

  const applyMealTemplate = (
    template: MealTemplate,
    destinationMealType: MealType = template.mealType,
  ) => {
    const drafts = (template.rows || []).flatMap(row => {
      const savedFood = row.foodId
        ? uniqueSavedFoods.find(item => item.id === row.foodId)
        : undefined;
      const foodName = row.food?.name || savedFood?.name;
      if (!foodName) return [];

      const nutrition = getMealRowNutrition(row, uniqueSavedFoods);
      const unitLabel = row.unit === 'g' ? 'g' : ` ${row.unit}`;

      return [{
        name: foodName,
        mealType: destinationMealType,
        date: selectedFoodLogDate,
        amount: normalizeHealthNonNegative(row.amount),
        unit: row.unit,
        serving: `${row.amount}${unitLabel}`,
        sourceFoodTemplateId: row.foodId,
        sourceMealTemplateId: template.id,
        calories: Number(nutrition.calories.toFixed(1)),
        protein: Number(nutrition.protein.toFixed(1)),
        carbs: Number(nutrition.carbs.toFixed(1)),
        fat: Number(nutrition.fat.toFixed(1)),
        sodium: Math.round(nutrition.sodium),
        fiber: Number(nutrition.fiber.toFixed(1)),
        ...(nutrition.sugar === undefined || isNutritionFieldMissing(nutrition, 'sugar') ? {} : { sugar: Number(nutrition.sugar.toFixed(1)) }),
        nutritionMissing: getNutritionMissingFields(nutrition),
        notes: `From saved meal: ${template.name}`,
      } satisfies Omit<FoodEntry, 'id' | 'createdAt'>];
    });

    registerFoodBatch(drafts, template.name);
  };


  const openQuickAdd = (mealType = suggestedMealType()) => {
    setQuickAddMealType(mealType);
    setSelectedFoodEntry(null);
    setSelectedFoodTemplate(null);
    setAddFoodMode('log-food');
    setShowAddFoodModal(true);
  };

  const handleAddStreak = () => {
    const nameError = validateHealthText(newStreakName, { label: 'Streak name', maxLength: 100, required: true });
    if (nameError) {
      setStreakFormError(nameError);
      return;
    }

    addNoXTracker({
      name: newStreakName.trim(),
      startDate: parseLocalDateInput(newStreakStartDate),
      notes: '',
    });

    setNewStreakName('');
    setNewStreakStartDate(formatLocalDateInput(new Date()));
    setStreakFormError('');
  };

  const pauseStreak = () => {
    const reasonError = validateHealthText(pauseReason, { label: 'Pause reason', maxLength: 300, mode: 'multiline' });
    if (reasonError) {
      setStreakFormError(reasonError);
      return;
    }
    const pausedAt = new Date();
    pausedAt.setHours(0, 0, 0, 0);
    if (streakToPause && updateNoXTracker) updateNoXTracker(streakToPause.id, {
      pausedAt, resumeDate: pauseResumeDate || null, pauseReason: pauseReason.trim(),
      pauseHistory: [...normalizePauseHistory(streakToPause), { id: createEntityId('streak-pause'), pausedAt, resumedAt: null, reason: pauseReason.trim() || undefined }],
      updatedAt: new Date(),
    });
    setStreakFormError('');
    setStreakUnsavedAction(null);
    setStreakToPause(null);
  };

  const resetStreak = () => {
    const reasonError = validateHealthText(resetReason, { label: 'Reset reason', maxLength: 300, mode: 'multiline' });
    if (reasonError) {
      setStreakFormError(reasonError);
      return;
    }
    if (streakToReset && updateNoXTracker) updateNoXTracker(streakToReset.id, {
      startDate: new Date(), pausedAt: null, resumeDate: null, pauseReason: '', accumulatedPausedDays: 0,
      pauseHistory: [], updatedAt: new Date(),
      resetHistory: [...(streakToReset.resetHistory || []), { resetAt: new Date(), previousStartDate: streakToReset.startDate, previousDays: getStreakDays(streakToReset), reason: resetReason.trim() || undefined }],
    });
    setStreakFormError('');
    setStreakUnsavedAction(null);
    setStreakToReset(null);
  };

  const requestPauseClose = () => {
    if (androidPresentation && (pauseResumeDate || pauseReason)) {
      setStreakUnsavedAction('pause');
      return;
    }
    setStreakToPause(null);
  };

  const requestResetClose = () => {
    if (androidPresentation && resetReason) {
      setStreakUnsavedAction('reset');
      return;
    }
    setStreakToReset(null);
  };

  useOverlayLifecycle(androidPresentation && Boolean(streakToPause), requestPauseClose);
  useOverlayLifecycle(androidPresentation && Boolean(streakToReset), requestResetClose);

  const resumeStreak = (streak: NoXTracker) => {
    if (!updateNoXTracker || !streak.pausedAt) return;
    const resumedAt = new Date();
    resumedAt.setHours(0, 0, 0, 0);
    const history = normalizePauseHistory(streak);
    const nextHistory = history.map((period, index) =>
      index === history.length - 1 && !period.resumedAt
        ? { ...period, resumedAt }
        : period,
    );
    updateNoXTracker(streak.id, {
      pausedAt: null,
      resumeDate: null,
      pauseReason: '',
      pauseHistory: nextHistory,
      updatedAt: new Date(),
    });
  };

  const foodLogDateLabel = selectedFoodLogDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: selectedFoodLogDate.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });

  const renderFoodSummaryMetric = (item: FoodSummaryMetric) => {
    const known = item.field ? todayNutrition.knownCounts[item.field] > 0 : false;
    const value = item.field ? Number(todayTotals[item.field] ?? 0) : 0;
    const tone = item.field && item.mode
      ? getNutritionTargetTone(item.mode, value, item.target, known)
      : 'neutral' as const;
    return (
      <div key={item.label} className="min-w-0">
        <p className="text-label text-muted-foreground">{item.label}</p>
        <h3 className={`mt-1 break-words tabular-nums ${item.value === 'Not entered' || item.value === '—' ? 'text-base font-bold text-muted-foreground' : `text-lg font-bold sm:text-2xl ${nutritionToneClass(tone)}`}`}>
          <AnimatedMetricValue valueKey={`${item.label}:${item.value}${item.suffix || ''}`} ready={isHydrated && item.value !== 'Not entered' && item.value !== '—'}>
            {item.value}
            {item.value !== 'Not entered' && item.value !== '—' && <span className="ml-0.5 text-sm text-muted-foreground">{item.suffix}</span>}
          </AnimatedMetricValue>
        </h3>
        <p className="mt-1 min-h-4 text-caption font-semibold text-muted-foreground">{item.status}</p>
      </div>
    );

  };

  if (androidPresentation && activeTab === 'overview') {
    const latestWeight = [...weightEntries]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    return (
      <section className={`android-module-home ${healthResponsive.workspace}`} data-android-screen="health-home">
        <div className="android-page-heading">
          <div>
            <h1>Health</h1>
            <p>{foodLogDateLabel}</p>
          </div>
        </div>

        <div className="surface-tabs health-tab-strip android-health-entry-tabs -mx-1 grid max-w-full min-w-0 grid-cols-1 overflow-hidden rounded-[1.25rem] border border-border/60 p-1">
          <div className="health-tab-strip-scroll min-w-0 snap-x snap-proximity overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide">
            <nav role="tablist" aria-label="Health views" className="flex min-h-[2.75rem] w-max min-w-full items-center justify-start gap-1.5 px-1">
              {visibleHealthTabs.map(tab => (
                <button
                  key={tab.id}
                  id={`health-tab-${tab.id}`}
                  ref={node => { healthTabRefs.current[tab.id] = node; }}
                  type="button"
                  role="tab"
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  aria-selected={activeTab === tab.id}
                  aria-controls={`health-panel-${tab.id}`}
                  onClick={() => navigateHealthTab(tab.id)}
                  onKeyDown={event => {
                    const index = visibleHealthTabs.findIndex(item => item.id === tab.id);
                    const nextIndex = event.key === 'Home' ? 0
                      : event.key === 'End' ? visibleHealthTabs.length - 1
                        : event.key === 'ArrowRight' ? (index + 1) % visibleHealthTabs.length
                          : event.key === 'ArrowLeft' ? (index - 1 + visibleHealthTabs.length) % visibleHealthTabs.length
                            : null;
                    if (nextIndex === null) return;
                    event.preventDefault();
                    navigateHealthTab(visibleHealthTabs[nextIndex].id);
                  }}
                  className={`min-h-11 shrink-0 snap-start rounded-xl px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeTab === tab.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div id="health-panel-overview" role="tabpanel" aria-labelledby="health-tab-overview" ref={healthPanelRef} tabIndex={-1} className="space-y-4 outline-none">
        <HealthDayNavigator
          date={foodLogDate}
          dateLabel={foodLogDateLabel}
          onPrevious={() => shiftFoodLogDate(-1)}
          onNext={() => shiftFoodLogDate(1)}
          onToday={() => setFoodLogDateWithinToday(todayDateKey)}
          onDateChange={setFoodLogDateWithinToday}
        />

          <div className="android-stat-grid android-health-today-summary">
            <div className="android-stat-cell"><span>Calories</span><strong>{formatFoodNutritionValue(todayFoodEntries, 'calories', todayTotals.calories)}</strong></div>
            <div className="android-stat-cell"><span>Protein</span><strong>{formatFoodNutritionValue(todayFoodEntries, 'protein', todayTotals.protein, 'g')}</strong></div>
            <div className="android-stat-cell"><span>Activity</span><strong>{todayActivityEntries.length}</strong></div>
            <div className="android-stat-cell"><span>Weight</span><strong>{latestWeight ? displayWeight(latestWeight.weightKg) : '—'}</strong></div>
            <div className="android-stat-cell"><span>BMI</span><strong>{bmi === null ? 'Not available' : formatDisplayNumber(bmi)}</strong></div>
            {configuredOverviewCards.map(item => <div key={item.label} className="android-stat-cell"><span>{item.label}</span><strong>{item.value}</strong><small>{item.caption}</small></div>)}
          </div>

        <HealthHydrationPanel date={foodLogDate} onSetTarget={() => setShowEditTargetsModal(true)} />

        <details className="android-list-section group">
          <summary className="android-section-heading flex min-h-11 cursor-pointer list-none items-center">
            <span><h2>This week</h2><p>Sleep and movement review</p></span>
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="android-stat-grid mt-3">
            <div className="android-stat-cell"><span>Avg sleep</span><strong>{weeklySleepAverageMinutes ? formatSleepDuration(weeklySleepAverageMinutes) : '—'}</strong></div>
            <div className="android-stat-cell"><span>Sleep nights</span><strong>{weeklySleepEntries.length}</strong></div>
            <div className="android-stat-cell"><span>Avg score</span><strong>{weeklySleepScoreAverage === null ? '—' : `${formatNumber(weeklySleepScoreAverage)}/100`}</strong></div>
            <div className="android-stat-cell"><span>Avg night wakings</span><strong>{weeklyTimesAwakenedAverage === null ? '—' : formatNumber(weeklyTimesAwakenedAverage)}</strong></div>
            <div className="android-stat-cell"><span>Workouts</span><strong>{weeklyWorkouts}</strong></div>
            <div className="android-stat-cell"><span>Activity minutes</span><strong>{weeklyMovementMinutes}</strong></div>
            <div className="android-stat-cell"><span>Activity target</span><strong>{hasExerciseTarget && weeklyMovementMinutes ? `${weeklyMovementMinutes}/${targetExerciseMinutesPerWeek}` : '—'}</strong></div>
            <div className="android-stat-cell"><span>Sleep target</span><strong>{hasSleepTarget && weeklySleepAverageMinutes ? `${sleepTargetProgress}%` : '—'}</strong></div>
          </div>
        </details>

        <section className="android-list-section">
          <div className="android-section-heading"><h2>Workouts</h2></div>
          <div className="android-compact-list">
            <button type="button" className="android-navigation-row" onClick={() => setActiveTab('workout')}>
              <span>
                <strong>Start a guided workout</strong>
                <small>Today, starter routines, history, and legacy activity</small>
              </span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        {activeFastingSession ? (
          <section className="android-list-section">
            <div className="android-section-heading"><h2>Fasting</h2></div>
            <div className="android-compact-list">
              <button type="button" className="android-navigation-row" onClick={() => setActiveTab('fasting')}>
                <span><strong>{activeFastingLabel} elapsed</strong><small>Started {activeFastingStartedLabel} · Open Fasting to manage</small></span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        ) : null}

        <div className="android-primary-actions">
          <Button type="button" variant="outline" onClick={() => setShowAddWeightModal(true)}>
            Add weight
          </Button>
        </div>

        {hiddenHealthTabs.length > 0 ? (
          <section className="android-list-section">
            <div className="android-section-heading">
              <h2>Hidden Health views</h2>
              <p>Hidden views remain available here.</p>
            </div>
            <div className="android-compact-list">
              {hiddenHealthTabs.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="android-navigation-row"
                  onClick={() => restoreHealthTab(item.id)}
                >
                  <span><strong>Show {item.label}</strong><small>Health view</small></span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              ))}
            </div>
          </section>
        ) : null}
        </div>

        <FoodModal
          key={selectedFoodEntry ? `food-entry-${selectedFoodEntry.id}` : selectedFoodTemplate ? `food-template-${selectedFoodTemplate.id}` : `food-add-${addFoodMode}`}
          isOpen={showAddFoodModal || !!selectedFoodEntry}
          mode={addFoodMode}
          foodEntry={selectedFoodEntry}
          foodTemplate={selectedFoodTemplate}
          androidPresentation={androidPresentation}
          defaultDate={requestedDateKey || foodLogDate}
          defaultMealType={quickAddMealType}
          onClose={() => {
            setShowAddFoodModal(false);
            setSelectedFoodEntry(null);
            setSelectedFoodTemplate(null);
            setAddFoodMode('log-food');
          }}
        />
        <WeightModal
          isOpen={showAddWeightModal || !!selectedWeightEntry}
          weightEntry={selectedWeightEntry}
          androidPresentation={androidPresentation}
          onClose={() => {
            setShowAddWeightModal(false);
            setSelectedWeightEntry(null);
          }}
        />
      </section>
    );
  }

  // Compact mode is a density preference for the Food Log, not a capability
  // switch. Keep the full surface available for Today, Workout, and every
  // other Health destination so narrow screens never strand a core workflow.
  if (compactMobileMode && activeTab === 'food') {
    return (
      <section className={`compact-section space-y-3 ${healthResponsive.workspace}`}>
        <div className="compact-sticky-header">
          <div>
            <h1 className="text-lg font-black">Health</h1>
            <p className="text-xs text-muted-foreground">
              Food today • {formatFoodNutritionValue(todayFoodEntries, 'calories', todayTotals.calories, ' kcal')} • {formatFoodNutritionValue(todayFoodEntries, 'protein', todayTotals.protein, 'g protein')}
            </p>
          </div>
          <button type="button" onClick={() => openQuickAdd(suggestedMealType())} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground">
            <Utensils className="h-4 w-4" aria-hidden="true" />
            Log meal
          </button>
        </div>

        <div className="compact-card">
          <HealthDayNavigator
          date={foodLogDate}
          dateLabel={foodLogDateLabel}
          onPrevious={() => shiftFoodLogDate(-1)}
          onNext={() => shiftFoodLogDate(1)}
          onToday={() => setFoodLogDateWithinToday(todayDateKey)}
          onDateChange={setFoodLogDateWithinToday}
        />
        </div>

        <div className="grid grid-cols-2 gap-2 min-[640px]:grid-cols-3">
          {foodSummaryItems.map(item => {
            const known = item.field ? todayNutrition.knownCounts[item.field] > 0 : false;
            const value = item.field ? Number(todayTotals[item.field] ?? 0) : 0;
            const tone = item.field && item.mode
              ? getNutritionTargetTone(item.mode, value, item.target, known)
              : 'neutral' as const;
            return (
              <div key={item.label} className="compact-stat">
                <p>{item.label}</p>
                <strong className={nutritionToneClass(tone)}>{item.value}{item.value !== 'Not entered' && item.value !== '—' ? item.suffix : ''}</strong>
                <small>{item.status}</small>
              </div>
            );
          })}
        </div>

        <div className="compact-card space-y-2">
          <button
            type="button"
            onClick={markFoodLogComplete}
            disabled={!hasTodayFoodLog}
            aria-pressed={hasCompletedFoodLog}
            className={`min-h-11 w-full rounded-2xl border px-3 py-2 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70 ${hasCompletedFoodLog ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15' : 'border-border/50 bg-background/50 text-muted-foreground hover:text-foreground'}`}
          >
            {hasCompletedFoodLog ? '✓ Completed' : 'Complete day'}
          </button>
        </div>

        <button type="button" onClick={() => setActiveTab('fasting')} className="compact-card flex w-full items-center justify-between gap-3 text-left">
          <span className="min-w-0"><span className="block text-xs font-black uppercase tracking-wider text-muted-foreground">Fasting</span><span className="mt-1 block truncate text-sm font-black">{activeFastingSession ? `${activeFastingLabel} elapsed` : 'Open fasting strategies and history'}</span></span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        <div className="space-y-2">
          {todayFoodEntries.length === 0 ? (
            <div className="compact-empty">
              <p>No meals logged yet. Use the Log meal button above to start this day.</p>
            </div>
          ) : (
            todayFoodEntries.map(entry => (
              <button key={entry.id} type="button" onClick={() => setSelectedFoodEntry(entry)} className="motion-pop compact-list-row">
                <span className="min-w-0">
                  <OverflowTooltip text={entry.name}><span className="block truncate text-sm font-black">{entry.name}</span></OverflowTooltip>
                  <span className="block truncate text-xs text-muted-foreground">{entry.serving || entry.mealType || 'Food'}</span>
                </span>
                <span className="shrink-0 text-right text-xs font-bold text-muted-foreground">
                  {formatDisplayNumber(entry.calories)} cal<br />
                  {formatDisplayNumber(entry.protein)}g pro
                </span>
              </button>
            ))
          )}
        </div>

        <FoodModal key={selectedFoodEntry ? `food-entry-${selectedFoodEntry.id}` : selectedFoodTemplate ? `food-template-${selectedFoodTemplate.id}` : `food-add-${addFoodMode}`} isOpen={showAddFoodModal || !!selectedFoodEntry} mode={addFoodMode} foodEntry={selectedFoodEntry} foodTemplate={selectedFoodTemplate} androidPresentation={androidPresentation} defaultDate={foodLogDate} defaultMealType={quickAddMealType} onClose={() => {
            setShowAddFoodModal(false);
            setSelectedFoodEntry(null);
            setSelectedFoodTemplate(null);
            setAddFoodMode('log-food');
          }} />
        <ConfirmDialog isOpen={!!foodEntryToDelete} title="Delete Food Entry?" message={`Delete ${foodEntryToDelete?.name || 'this food entry'} from today's food log? This will not delete saved foods.`} confirmText="Delete" cancelText="Cancel" isDangerous onConfirm={() => { if (foodEntryToDelete) deleteFoodEntry(foodEntryToDelete.id); setFoodEntryToDelete(null); }} onCancel={() => setFoodEntryToDelete(null)} />
      </section>
    );
  }

  return (
    <div className={`${androidPresentation ? 'workspace-standard' : 'workspace-wide'} space-y-4 lg:space-y-5 ${healthResponsive.workspace} ${androidPresentation ? 'android-health-workspace' : ''}`} data-android-screen={`health-${activeTab}`}>
      {androidPresentation && activeTab !== 'overview' && (
        <button type="button" className="android-inline-back" onClick={() => setActiveTab('overview')}>
          ← Health overview
        </button>
      )}
      {/* HERO */}
      <header className="border-b border-border/50 px-1 pb-4 sm:px-2">
        <h1 className="text-page-title">Health</h1>
        {!androidPresentation && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {getSectionDiscoveryMeta('health')?.purpose}
          </p>
        )}
      </header>

      {/* INTERNAL TABS */}
      <DndContext
        sensors={healthTabSensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis, restrictHealthTabToRow]}
        onDragStart={handleHealthTabDragStart}
        onDragEnd={handleHealthTabDragEnd}
        onDragCancel={() => setActiveHealthDragId(null)}
      >
        <div className={`surface-tabs health-tab-strip -mx-1 grid h-[3.5rem] max-w-full min-w-0 overflow-hidden rounded-[1.25rem] border border-border/60 p-1 ${hiddenHealthTabs.length > 0 ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1'}`}>
          <div ref={healthTabScrollRef} className="health-tab-strip-scroll min-w-0 snap-x snap-proximity scroll-px-1 overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide">
            <nav role="tablist" aria-label="Health views" className="flex min-h-full w-max min-w-full items-center justify-start gap-1.5 px-1 md:justify-center lg:gap-2">
              <SortableContext items={visibleHealthTabs.map(tab => tab.id)} strategy={horizontalListSortingStrategy}>
                {visibleHealthTabs.map(tab => (
                  <SortableHealthTab
                    key={tab.id}
                    tab={tab}
                    activeTab={activeTab}
                    setContextTab={setContextTab}
                    setContextPosition={setContextPosition}
                    setHiddenTabsMenuOpen={setHiddenTabsMenuOpen}
                    tabOrder={visibleHealthTabIds}
                    registerTabRef={(id, node) => {
                      healthTabRefs.current[id] = node;
                    }}
                    onNavigate={navigateHealthTab}
                  />
                ))}
              </SortableContext>
            </nav>
          </div>

          {hiddenHealthTabs.length > 0 && (
            <div className="flex shrink-0 items-center pl-2">
              <button
                ref={hiddenTabsMenuTriggerRef}
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  setContextTab(null);
                  setHiddenTabsMenuOpen(current => !current);
                }}
                aria-label={`${hiddenHealthTabs.length} hidden health tabs`}
                aria-expanded={hiddenTabsMenuOpen}
                aria-haspopup="menu"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border/50 bg-background/60 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {hiddenTabsMenuOpen && hiddenTabsMenuPosition && typeof document !== 'undefined' && createPortal(
          <div
            ref={hiddenTabsMenuRef}
            role="menu"
            aria-label="Hidden Health views"
            onClick={event => event.stopPropagation()}
            style={{ position: 'fixed', top: hiddenTabsMenuPosition.top, left: hiddenTabsMenuPosition.left, zIndex: 10000 }}
            className={`${healthResponsive.menu} max-h-[min(60dvh,15rem)] w-48 overflow-y-auto rounded-2xl border border-border/60 bg-card p-2 shadow-2xl`}
          >
            {hiddenHealthTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <Fragment key={tab.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => restoreHealthTab(tab.id)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    {tab.label}
                  </button>
                </Fragment>
              );
            })}
          </div>,
          document.body,
        )}

        {typeof document !== 'undefined' && createPortal(
          <DragOverlay
            modifiers={[restrictToHorizontalAxis, restrictHealthTabToRow]}
            dropAnimation={reduceMotion ? null : {
              duration: 170,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {activeHealthDragId ? (() => {
              const tab = visibleHealthTabs.find(item => item.id === activeHealthDragId);
              return tab ? <HealthTabDragPreview tab={tab} activeTab={activeTab} /> : null;
            })() : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      {contextTab && typeof document !== 'undefined' && createPortal(
        <div
          onClick={event => event.stopPropagation()}
          role="menu"
          aria-label="Health tab actions"
          style={{ position: 'fixed', top: contextPosition.y, left: contextPosition.x, zIndex: 10000 }}
          className={`${healthResponsive.menu} w-44 rounded-2xl border border-border/60 bg-card p-2 shadow-2xl`}
        >
          <button
           type="button"
            role="menuitem"
            onClick={() => { hideHealthTab(contextTab); setContextTab(null); }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <EyeOff className="h-4 w-4" />
            Hide tab
          </button>
          <button
           type="button"
            role="menuitem"
            onClick={() => { moveHealthTab(contextTab, -1); setContextTab(null); }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" />
            Move left
          </button>
          <button
           type="button"
            role="menuitem"
            onClick={() => { moveHealthTab(contextTab, 1); setContextTab(null); }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowRight className="h-4 w-4" />
            Move right
          </button>
        </div>,
        document.body,
      )}

      <div
        ref={healthPanelRef}
        id={`health-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`health-tab-${activeTab}`}
        tabIndex={-1}
        data-state="active"
        className="caizen-tab-panel-motion min-w-0 outline-none"
      >
      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
        <HealthOverviewPanel
          selectedDate={foodLogDate}
          selectedDateLabel={foodLogDateLabel}
          onPreviousDay={() => shiftFoodLogDate(-1)}
          onNextDay={() => shiftFoodLogDate(1)}
          onToday={() => setFoodLogDateWithinToday(todayDateKey)}
          onDateChange={setFoodLogDateWithinToday}
          onOpenTargets={() => setShowEditTargetsModal(true)}
          todaySummaryStatus={todaySummaryStatus}
          hasCompletedFoodLog={hasCompletedFoodLog}
          hasTodayFoodLog={hasTodayFoodLog}
          todaySummaryItems={todaySummaryItems}
          overviewCards={overviewCards}
          weeklyHighSodiumDays={weeklyHighSodiumDays}
          weeklyNutritionGrade={weeklyNutritionGrade}
          weeklyCompletedTrendDays={weeklyCompletedTrendData.length}
          weeklySleepVisible
          weeklySleepGrade={weeklySleepGrade}
          weeklySleepEntries={weeklySleepEntries.length}
          weeklySleepAverageMinutes={weeklySleepAverageMinutes}
          weeklySleepScoreAverage={weeklySleepScoreAverage}
          weeklySleepScoreEntries={weeklySleepEntries.filter(entry => typeof entry.sleepScore === 'number' && Number.isFinite(entry.sleepScore)).length}
          weeklyTimesAwakenedAverage={weeklyTimesAwakenedAverage}
          weeklyTimesAwakenedEntries={weeklySleepEntries.filter(entry => typeof entry.timesAwakened === 'number' && Number.isFinite(entry.timesAwakened)).length}
          sleepTargetMinutes={hasSleepTarget ? sleepTargetMinutes : null}
          sleepTargetProgress={sleepTargetProgress}
          weeklySleepQualityTrend={weeklySleepQualityTrend}
          weeklyWorkoutVisible
          weeklyMovementGrade={weeklyMovementGrade}
          weeklyMovementMinutes={weeklyMovementMinutes}
          targetExerciseMinutesPerWeek={hasExerciseTarget ? targetExerciseMinutesPerWeek : null}
          exerciseTargetProgress={exerciseTargetProgress}
          weeklyWeightVisible={!healthTabPreferences.hidden.includes('weight')}
          weeklyWeightGrade={weeklyWeightGrade}
          weeklyWeightChangeLabel={weeklyWeightChange === null ? null : displayWeightDelta(weeklyWeightChange)}
          latestWorkoutLabel={latestWorkoutLabel}
          nextWorkoutLabel={nextWorkoutLabel}
          activeFastingLabel={activeFastingLabel}
          activeFastingStartedLabel={activeFastingStartedLabel}
          onOpenFasting={() => setActiveTab('fasting')}
          onOpenWorkout={() => setActiveTab('workout')}
          onLogFood={() => openQuickAdd()}
          onAddWeight={() => setShowAddWeightModal(true)}
          onLogWorkout={() => { setEditingWorkout(null); setShowWorkoutModal(true); }}
          onLogSleep={() => { setEditingSleep(null); setShowSleepModal(true); }}
        />
        <HealthHydrationPanel date={foodLogDate} onSetTarget={() => setShowEditTargetsModal(true)} />
        </div>
      )}

      {activeTab === 'fasting' && <HealthFastingWorkspace />}

      {activeTab === 'food' && (
        <section className="section-surface p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-section-title">
                Food log
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Log meals quickly with saved or recent food, then add detailed nutrition when you have it.
              </p>
            </div>

            <div className="flex min-w-0 flex-col gap-3 border-y border-border/50 py-4 xl:flex-row xl:items-start xl:justify-between">
              <HealthDayNavigator
                date={foodLogDate}
                dateLabel={foodLogDateLabel}
                onPrevious={() => shiftFoodLogDate(-1)}
                onNext={() => shiftFoodLogDate(1)}
                onToday={() => setFoodLogDateWithinToday(todayDateKey)}
                onDateChange={setFoodLogDateWithinToday}
                className="w-full"
              />

              <div className={`${healthResponsive.foodActions} android-food-action-row flex flex-wrap items-center gap-2 xl:justify-end`}>
                <button
                  type="button"
                  onClick={() => openQuickAdd(suggestedMealType(selectedFoodLogDate))}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Utensils className="mr-2 h-4 w-4" />
                  Log meal
                </button>

                <button
                  type="button"
                  onClick={() => setShowMealTemplatePicker(true)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border/60 bg-card px-4 py-2 text-center text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Utensils className="mr-2 h-4 w-4" />
                  <span className="android-food-action-label-full">Use saved meal</span>
                  <span className="android-food-action-label-short">Saved meal</span>
                </button>

                {previousDayFoodEntries.length ? <button
                  type="button"
                  onClick={repeatPreviousDayFood}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border/60 bg-card px-4 py-2 text-center text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Repeat the previous day with ${previousDayFoodEntries.length} food entries`}
                >Repeat previous day</button> : null}

                <div className="flex min-w-0 flex-col gap-2">
                  <button
                    type="button"
                    onClick={markFoodLogComplete}
                    disabled={!hasTodayFoodLog}
                    aria-pressed={isSelectedFoodLogIncluded}
                    className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-center text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70 ${isSelectedFoodLogIncluded ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15' : 'border-border/60 bg-background/60 text-muted-foreground hover:text-foreground disabled:bg-muted/30 disabled:text-muted-foreground'}`}
                  >
                    {isSelectedFoodLogIncluded ? <><span className="android-food-action-label-full">✓ Completed</span><span className="android-food-action-label-short">✓ Complete</span></> : <><span className="android-food-action-label-full">Complete day</span><span className="android-food-action-label-short">Complete</span></>}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
            {foodSummaryItems.filter(item => item.field === 'calories' || item.field === 'protein' || item.label === 'Net Calories').map(renderFoodSummaryMetric)}
          </div>
          <HealthDetails title="More nutrition" className="mt-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
              {foodSummaryItems.filter(item => item.field !== 'calories' && item.field !== 'protein' && item.label !== 'Net Calories').map(renderFoodSummaryMetric)}
            </div>
          </HealthDetails>

          <div className="mt-8 space-y-5">
            {todayFoodEntries.length === 0 ? (
              <div
                className="
                  rounded-xl
                  border border-dashed border-border/60
                  bg-background/40
                  p-8
                  text-center
                "
              >
                <p className="text-sm font-medium text-muted-foreground">
                  No meals logged for this day yet. Use the Log meal button above to start this day.
                </p>
              </div>
            ) : (
              MEAL_ORDER.map(meal => {
                const entries =
                  todayFoodEntries.filter(
                    entry =>
                      entry.mealType === meal
                  );

                if (entries.length === 0) {
                  return null;
                }

                const mealTotals = aggregateNutrition(entries).totals;

                return (
                  <div
                    key={meal}
                    className="border-t border-border/50 pt-5"
                  >
                    <div className="android-meal-summary-header mb-4 flex flex-col items-start gap-3 lg:flex-row lg:justify-between">
                      <div className="android-meal-heading flex min-w-0 items-center">
                        <h3 className="font-black">
                          {MEAL_LABELS[meal]}
                        </h3>
                      </div>

                      <div className="android-meal-badges flex min-w-0 flex-wrap gap-2 lg:justify-end">
                        {[
                          {
                            label: 'cal',
                            value: formatFoodNutritionValue(entries, 'calories', mealTotals.calories),
                            className: 'bg-muted text-muted-foreground',
                          },
                          {
                            label: 'protein',
                            value: formatFoodNutritionValue(entries, 'protein', mealTotals.protein, 'g'),
                            className: 'bg-muted text-muted-foreground',
                          },
                          {
                            label: 'carbs',
                            value: formatFoodNutritionValue(entries, 'carbs', mealTotals.carbs, 'g'),
                            className: 'bg-muted text-muted-foreground',
                          },
                          {
                            label: 'sodium',
                            value: formatFoodNutritionValue(entries, 'sodium', mealTotals.sodium, 'mg'),
                            className: 'bg-muted text-muted-foreground',
                          },
                          {
                            label: 'fiber',
                            value: formatFoodNutritionValue(entries, 'fiber', mealTotals.fiber, 'g'),
                            className: 'bg-muted text-muted-foreground',
                          },
                        ].map(item => (
                          <span
                            key={item.label}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.value === 'Not entered' || item.value === '—' ? 'bg-muted text-muted-foreground' : item.className || 'bg-muted text-muted-foreground'}`}
                          >
                            {item.value} {item.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {entries.map(entry => (
                        <div
                          key={entry.id}
                          className="android-food-entry-row
                            flex flex-col gap-3
                            border-b border-border/50
                            py-3
                            transition-all
                            hover:border-primary/30
                            hover:bg-card/80
                            md:flex-row
                            md:items-center
                            md:justify-between
                          "
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedFoodEntry(entry)}
                            aria-label={`Edit ${entry.name} in the ${MEAL_LABELS[meal].toLowerCase()} food log`}
                            className="android-food-entry-main min-h-11 min-w-0 flex-1 rounded-lg p-1 text-left transition-colors hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:flex md:items-center md:justify-between md:gap-4"
                          >
                            <span className="min-w-0">
                              <OverflowTooltip text={entry.name}><span className="block truncate font-bold">{entry.name}</span></OverflowTooltip>
                              <span className="mt-1 block truncate text-xs text-muted-foreground">{entry.serving || 'No serving set'}</span>
                            </span>
                            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:mt-0 md:justify-end">
                              <span className={isNutritionFieldMissing(entry, 'calories') ? 'font-bold text-muted-foreground' : 'font-black text-foreground'}>
                                {formatFoodNutritionValue([entry], 'calories', entry.calories, ' cal')}
                              </span>

                              <span className={isNutritionFieldMissing(entry, 'protein') ? 'font-bold text-muted-foreground' : 'font-semibold text-blue-700 dark:text-blue-300'}>
                                {formatFoodNutritionValue([entry], 'protein', entry.protein, 'g')} protein
                              </span>

                              <span className="text-muted-foreground">
                                {formatFoodNutritionValue([entry], 'sodium', entry.sodium, 'mg')} sodium
                              </span>
                              <span className="text-muted-foreground">
                                {formatFoodNutritionValue([entry], 'fiber', entry.fiber, 'g')} fiber
                              </span>
                            </span>
                          </button>

                          <div className="android-food-entry-actions flex shrink-0 items-center">
                            <button
                              type="button"
                              onClick={() => setFoodEntryToDelete(entry)}
                              aria-label={`Delete ${entry.name} from the food log`}
                              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/50 text-muted-foreground transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* WEIGHT */}
      {activeTab === 'weight' && (
        <section className="section-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-section-title">
                Weight
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Track current weight, goal weight, BMI, and body trend.
              </p>
            </div>

            <button
              onClick={() => setShowAddWeightModal(true)}
              className="
    inline-flex h-11 items-center justify-center
    rounded-xl bg-primary px-6
    text-sm font-bold
    text-primary-foreground
    transition-colors
    hover:bg-primary/92
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
  "
            >
              <Plus className="mr-2 h-4 w-4" />
              Add weight
            </button>

          </div>

          <div className="mt-6 flex flex-col gap-6 border-t border-border/50 pt-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current weight
              </p>
              <h3 className={`mt-2 break-words font-black tabular-nums ${latestWeight ? 'text-3xl sm:text-4xl' : 'text-xl text-muted-foreground'}`}>
                {latestWeight ? displayWeight(latestWeight.weightKg) : 'No weigh-ins yet'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {weightEntries.length > 1
                  ? `${displayWeightDelta(weightChange)} since your first entry`
                  : weightEntries.length === 1
                    ? 'Add another weigh-in to see change'
                    : 'No previous entry'}
              </p>
              {bmi !== null ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  BMI {bmi} · {bmiCategory} <span className="opacity-80">(screening estimate only)</span>
                </p>
              ) : null}
            </div>

            <div className="w-full lg:w-72 lg:shrink-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-bold">Goal</p>
                <p className="text-sm font-black tabular-nums">
                  {targetWeight ? displayWeight(targetWeight) : 'Not set'}
                </p>
              </div>
              {latestWeight && targetWeight ? (
                <>
                  <div
                    className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label="Weight goal progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={weightGoalProgress}
                    aria-valuetext={`${formatDisplayNumber(weightGoalProgress)}% complete; ${goalProgressText}`}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${weightGoalProgress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {formatDisplayNumber(weightGoalProgress)}% toward goal · {goalProgressText}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {targetWeight ? 'Add a weigh-in to see progress toward your goal.' : 'Set a target weight to track progress.'}
                </p>
              )}
            </div>
          </div>
          {weightTrendData.length > 1 && (
            <div
              className="
    mt-8
      border-t border-border/50
      pt-5
    "
            >
              <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-black">
                    Recent trend
                  </h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Compact trend from your latest weight entries.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-right text-xs sm:grid-cols-5">
                  <div>
                    <p className="text-muted-foreground">
                      Start
                    </p>
                    <p className="font-bold">
                      {firstWeight
                        ? displayWeight(firstWeight.weightKg)
                        : 'No entry yet'}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground">
                      Current
                    </p>
                    <p className="font-bold">
                      {latestWeight
                        ? displayWeight(latestWeight.weightKg)
                        : 'No entry yet'}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground">
                      Goal
                    </p>
                    <p className="font-bold">
                      {targetWeight
                        ? displayWeight(targetWeight)
                        : 'Not set'}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground">
                      Change
                    </p>
                    <p className="font-bold">
                      {weightEntries.length > 1
                        ? displayWeightDelta(weightChange)
                        : 'Not enough data'}
                    </p>
                  </div>

                  <div>
                    <p className="text-muted-foreground">
                      Left
                    </p>
                    <p className="font-bold">
                      {weightRemaining !== null
                        ? displayWeight(weightRemaining)
                        : 'Not enough data'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-y border-border/40 py-4">
                <HealthWeightTrendLine
                  points={weightTrendPoints}
                  datasetSignature={weightTrendDatasetSignature}
                />

                <div className="mt-3 flex justify-between gap-2">
                  {weightTrendData.map(entry => (
                    <div
                      key={entry.id}
                      className="text-center"
                    >
                      <p className="text-xs font-bold">
                        {displayWeight(entry.weightKg)}
                      </p>

                      <p className="text-caption text-muted-foreground">
                        {parseLocalDateValue(entry.date)?.toLocaleDateString('en-US', {
                          month: 'numeric',
                          day: 'numeric',
                        }) || '—'}
                      </p>
                    </div>
                  ))}
                </div>
                <ul className="sr-only" aria-label="Weight trend values">
                  {weightTrendData.map(entry => <li key={entry.id}>{formatDate(entry.date)}: {displayWeight(entry.weightKg)}</li>)}
                </ul>
              </div>
            </div>
          )}

          <div className="mt-8">
            {sortedWeights.length === 0 ? (
              <EmptyState title="No weight entries yet" description="Add a check-in to see your trend." variant="compact" className="rounded-3xl bg-background/40" />
            ) : (
              <>
                <div className={healthResponsive.weightTable}>
                  <DataTable className="min-w-[40rem] text-left">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Weight</TableHead>
                        <TableHead>Change</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedWeightHistory.map(({ entry, changeKg }) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <p className="font-semibold">{formatDate(entry.date)}</p>
                            {entry.notes ? <p className="mt-1 max-w-xs truncate text-xs text-muted-foreground">{entry.notes}</p> : null}
                          </TableCell>
                          <TableCell data-numeric="true" className="text-right font-bold tabular-nums">{displayWeight(entry.weightKg)}</TableCell>
                          <TableCell data-numeric="true" className="text-right text-muted-foreground tabular-nums">{changeKg === null ? '—' : displayWeightDelta(changeKg)}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedWeightEntry(entry)}>Edit</Button>
                              <Button type="button" variant="destructive" size="sm" aria-label={`Delete weight entry from ${formatDate(entry.date)}`} onClick={() => setWeightEntryToDelete(entry)}>Delete</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </DataTable>
                </div>
                <div className={healthResponsive.weightRecords}>
                  {paginatedWeightHistory.map(({ entry, changeKg }) => (
                    <DataRecordRow
                      key={entry.id}
                      primary={formatDate(entry.date)}
                      value={displayWeight(entry.weightKg)}
                      metadata={<>
                        {entry.notes || 'Weight check-in'}
                        <span className="block mt-1">Change: {changeKg === null ? '—' : displayWeightDelta(changeKg)}</span>
                      </>}
                      actions={androidPresentation ? <HealthOverflowMenu
                          title={`${formatDate(entry.date)} actions`}
                          ariaLabel={`Actions for weight entry from ${formatDate(entry.date)}`}
                          androidPresentation
                          actions={[
                            { label: 'Edit', icon: Pencil, onSelect: () => setSelectedWeightEntry(entry) },
                            { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setWeightEntryToDelete(entry) },
                          ]}
                        /> : <>
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedWeightEntry(entry)}>Edit</Button>
                          <Button type="button" variant="destructive" size="sm" onClick={() => setWeightEntryToDelete(entry)}>Delete</Button>
                        </>}
                    />
                  ))}
                </div>
                {weightTotalPages > 1 ? (
                  <PaginationControls
                    page={weightPage}
                    totalPages={weightTotalPages}
                    totalItems={weightHistory.length}
                    pageSize={HEALTH_LIST_PAGE_SIZE}
                    onPageChange={setWeightPage}
                  />
                ) : null}
              </>
              )}
            </div>
            <HealthBodyMeasurementsPanel date={parseLocalDateInput(foodLogDate) || new Date()} />
        </section>
      )}
      {/* WORKOUT */}
      {activeTab === 'workout' && (
        <WorkoutWorkspace
          defaultDate={foodLogDate}
          androidPresentation={androidPresentation}
          onOpenProgress={() => {
            setRequestedProgressTab('workout');
            setActiveTab('trends');
          }}
          requestedPlanId={workoutStartRequest?.planId || (['workout-plan', 'workout-routine', 'workout-exercise', 'workout-session'].includes(requestedView || '') ? requestedRecordId : undefined)}
          requestedPlanSignal={workoutStartRequest?.signal || requestedViewSignal}
          requestedPlanAction={workoutStartRequest || requestedView === 'workout-routine' ? 'start' : 'edit'}
          requestedFeature={requestedView}
          requestedCreateSignal={workoutCreateRequestSignal}
          requestedProfileId={requestedProfileId || currentProfileId}
          onRequestedPlanConsumed={signal => {
            setWorkoutStartRequest(null);
            if (!workoutStartRequest) onRequestedViewConsumed?.(signal);
          }}
          onRequestedCreateConsumed={() => setWorkoutCreateRequestSignal(0)}
          onManualLog={() => {
            setEditingWorkout(null);
            setShowWorkoutModal(true);
          }}
          onEditActivity={entry => {
            setEditingWorkout(entry);
            setShowWorkoutModal(true);
          }}
          onDeleteActivity={entry => setActivityToDelete(entry)}
        />
      )}

      {activeTab === 'sleep' && (
        <section className="section-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-section-title">Sleep</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Track sleep duration, quality, bedtime, wake time, and notes.</p>
            </div>
            <Button type="button" onClick={() => { setEditingSleep(null); setShowSleepModal(true); }} className="h-11 w-full rounded-xl px-4 text-sm font-black sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Add sleep
            </Button>
          </div>

          <div className="mt-6 border-y border-border/50 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm font-bold">Caizen Sleep Score</p>
              {latestSleepEntryForScore ? <span className="text-xs text-muted-foreground">Last night · {formatDate(latestSleepEntryForScore.date)}</span> : null}
            </div>
            {latestCaizenSleepScore ? (
              <>
                <p className="mt-2 text-4xl font-black tabular-nums">
                  {latestCaizenSleepScore.score}
                  <span className="text-lg font-bold text-muted-foreground"> / 100</span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatSleepDuration(getSleepDurationMinutes(latestSleepEntryForScore))}
                  {hasSleepTarget ? ` of ${formatSleepDuration(sleepTargetMinutes)} target` : ''}
                  {latestSleepEntryForScore.quality ? ` · ${formatSleepQuality(latestSleepEntryForScore.quality)} quality` : ''}
                  {typeof latestSleepEntryForScore.timesAwakened === 'number' ? ` · ${latestSleepEntryForScore.timesAwakened} ${latestSleepEntryForScore.timesAwakened === 1 ? 'waking' : 'wakings'}` : ''}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Based on {latestCaizenSleepScore.inputsUsed.join(', ')}.{latestCaizenSleepScore.isLimitedData ? ' Limited data — add quality, awakenings, or a morning check-in for a fuller score.' : ''} Not a medical score.
                </p>
                {typeof latestSleepEntryForScore.sleepScore === 'number' ? (
                  <p className="mt-2 text-xs text-muted-foreground">Personal score you entered: {latestSleepEntryForScore.sleepScore}/100</p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Log a night of sleep to see your Caizen Sleep Score.</p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-border/50 py-4 sm:grid-cols-3 xl:grid-cols-5">
            <div className="min-w-0">
              <p className="text-label text-muted-foreground">Average sleep</p>
              <h3 className="mt-1 text-lg font-black">{averageSleepMinutes ? formatSleepDuration(averageSleepMinutes) : '—'}</h3>
            </div>
            <div className="min-w-0">
              <p className="text-label text-muted-foreground">Average bedtime</p>
              <h3 className="mt-1 text-lg font-black">{averageBedtimeMinutes !== null ? formatClockMinutes(averageBedtimeMinutes) : '—'}</h3>
            </div>
            <div className="min-w-0">
              <p className="text-label text-muted-foreground">Average wake time</p>
              <h3 className="mt-1 text-lg font-black">{averageWakeTimeMinutes !== null ? formatClockMinutes(averageWakeTimeMinutes) : '—'}</h3>
            </div>
            <div className="min-w-0">
              <p className="text-label text-muted-foreground">Latest sleep</p>
              <h3 className="mt-1 text-lg font-black">{recentSleepEntries[0] ? formatSleepDuration(getSleepDurationMinutes(recentSleepEntries[0])) : '—'}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{recentSleepEntries[0] ? formatDate(recentSleepEntries[0].date) : 'No logs yet'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-label text-muted-foreground">Nights logged</p>
              <h3 className="mt-1 text-lg font-black">{monthlySleepEntries.length}</h3>
              <p className="mt-1 text-xs text-muted-foreground">30-day view · {sleepEntries.length} total</p>
            </div>
          </div>

          <div className="mt-6">
            {sleepEntries.length === 0 ? (
              <EmptyState title="No sleep logs yet" variant="compact" className="rounded-xl bg-muted/15" />
            ) : (
              <>
                <div className={healthResponsive.sleepTable}>
                  <DataTable className="min-w-[52rem] text-left">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Quality</TableHead>
                        <TableHead>Bedtime</TableHead>
                        <TableHead>Wake time</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedSleepEntries.map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-semibold">{formatDate(entry.date)}</TableCell>
                          <TableCell data-numeric="true" className="text-right font-bold tabular-nums">{formatSleepDuration(getSleepDurationMinutes(entry))}</TableCell>
                          <TableCell>{entry.quality ? <StatusBadge status={['good', 'great', 'excellent'].includes(entry.quality.toLowerCase()) ? 'success' : entry.quality.toLowerCase() === 'fair' ? 'warning' : entry.quality.toLowerCase() === 'poor' ? 'danger' : 'neutral'}>{formatSleepQuality(entry.quality)}</StatusBadge> : '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{entry.bedTime || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{entry.wakeTime || '—'}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => { setEditingSleep(entry); setShowSleepModal(true); }}>Edit</Button>
                              <Button type="button" variant="destructive" size="sm" onClick={() => setSleepToDelete(entry)}>Delete</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </DataTable>
                </div>
                <div className={healthResponsive.sleepRecords}>
                  {paginatedSleepEntries.map(renderSleepEntry)}
                </div>
                {sleepTotalPages > 1 ? (
                  <PaginationControls
                    page={sleepPage}
                    totalPages={sleepTotalPages}
                    totalItems={sleepEntries.length}
                    pageSize={HEALTH_LIST_PAGE_SIZE}
                    onPageChange={setSleepPage}
                  />
                ) : null}
              </>
            )}
          </div>
        </section>
      )}

      {/* STREAKS */}
      {activeTab === 'streaks' && (
        <section className="section-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-section-title">
                Streaks
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Track days without anything you want to avoid.
              </p>
            </div>
          </div>
          <div
            className="
    mt-6
    grid
    grid-cols-1
    gap-4
    border-y border-border/50
    py-5
    md:grid-cols-[minmax(0,1fr)_12rem_auto]
  "
          >
            <input
              value={newStreakName}
              onChange={e => {
                const result = guardHealthTextChange(newStreakName, e.target.value, { label: 'Streak name', maxLength: 100 });
                if (!result.accepted) {
                  setStreakFormError(result.error || 'Check the streak name.');
                  return;
                }
                setNewStreakName(result.value);
                setStreakFormError(result.error || '');
              }}
              placeholder="No Vape, No Soda, No Fast Food..."
              className="
      h-12
      rounded-2xl
      border border-border/50
      bg-background/60
      px-4
      text-sm
      outline-none
      transition-all
      focus:border-primary/40
      focus-visible:outline-2
      focus-visible:outline-offset-2
      focus-visible:outline-ring/60
      focus-visible:ring-0
    "
            />

            <AdaptiveDatePicker
              label="Streak start date"
              value={newStreakStartDate}
              onChange={setNewStreakStartDate}
              className="
      h-12
      rounded-2xl
      border border-border/50
      bg-background/60
      px-4
      text-sm
      outline-none
      transition-all
      focus:border-primary/40
      focus-visible:outline-2
      focus-visible:outline-offset-2
      focus-visible:outline-ring/60
      focus-visible:ring-0
    "
            />

            <button
              onClick={handleAddStreak}
              disabled={!newStreakName.trim()}
              className="
      inline-flex
      h-12
      items-center
      justify-center
      rounded-2xl
      bg-primary
      px-6
      text-sm
      font-semibold
      text-primary-foreground
      transition-colors
      hover:bg-primary/90
      disabled:cursor-not-allowed
      disabled:opacity-50
      disabled:hover:scale-100
    "
            >
              <Plus className="mr-2 h-4 w-4" />
              Add
            </button>
          </div>
          <div
            className="
              mt-6 divide-y divide-border/50
            "
          >
            {noXTrackers.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border/60 bg-background/40 p-8 text-center md:col-span-2 xl:col-span-3">
                <p className="text-sm text-muted-foreground">
                  No streaks yet. Examples: No Vape, No Soda, No Fast Food.
                </p>
              </div>
            ) : (
              noXTrackers.map(streak => (
                <div
                  key={streak.id}
                  className="
                    py-5
                  "
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {streak.pausedAt ? 'Paused Streak' : 'Current Streak'}
                      </p>

                      <h3 className="mt-2 text-xl font-black">
                        {streak.name}
                      </h3>

                      <p className="mt-1 text-sm text-muted-foreground">
                        Since {formatDate(streak.startDate)}
                      </p>
                    </div>

                    {androidPresentation ? <HealthOverflowMenu
                      title={`${streak.name} actions`}
                      ariaLabel={`Actions for ${streak.name}`}
                      androidPresentation
                      actions={[
                        { label: 'Edit timeline', icon: Pencil, onSelect: () => setStreakToEdit(streak) },
                        streak.pausedAt
                          ? { label: 'Resume', icon: PlayCircle, onSelect: () => resumeStreak(streak) }
                          : { label: 'Pause', icon: Pause, onSelect: () => { setPauseResumeDate(''); setPauseReason(''); setStreakToPause(streak); } },
                        { label: 'Reset', icon: RotateCcw, onSelect: () => { setResetReason(''); setStreakToReset(streak); } },
                        { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setStreakToDelete(streak) },
                      ]}
                    /> : <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label={`Actions for ${streak.name}`} className="grid size-10 place-items-center rounded-xl border border-border text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MoreVertical className="size-4" /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={6} className="min-w-44">
                        <DropdownMenuItem onSelect={() => setStreakToEdit(streak)}><Pencil className="size-4" />Edit timeline</DropdownMenuItem>
                        {streak.pausedAt ? <DropdownMenuItem onSelect={() => resumeStreak(streak)}><PlayCircle className="size-4" />Resume</DropdownMenuItem> : <DropdownMenuItem onSelect={() => { setPauseResumeDate(''); setPauseReason(''); setStreakToPause(streak); }}><Pause className="size-4" />Pause</DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => { setResetReason(''); setStreakToReset(streak); }} className="text-amber-600 focus:text-amber-700"><RotateCcw className="size-4" />Reset</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setStreakToDelete(streak)} variant="destructive"><Trash2 className="size-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>}
                  </div>

                  <div className="mt-5 flex items-end gap-2">
                    <span className="text-4xl font-black">
                      {getStreakDays(streak)}
                    </span>

                    <span className="pb-1 text-sm font-semibold text-muted-foreground">
                      days
                    </span>
                  </div>

                  {streak.pausedAt && <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs"><p className="font-black text-amber-700 dark:text-amber-300">Paused {formatDate(streak.pausedAt)}</p>{streak.resumeDate && <p className="mt-1 text-muted-foreground">Automatic resume: {formatDate(streak.resumeDate)}</p>}{streak.pauseReason && <p className="mt-1 text-muted-foreground">{streak.pauseReason}</p>}</div>}
                  {!streak.pausedAt && Number(streak.accumulatedPausedDays || 0) > 0 && <p className="mt-3 text-xs text-muted-foreground">{streak.accumulatedPausedDays} paused day(s) excluded.</p>}
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
                    <div>
                      <p className="text-sm font-bold">Calendar milestones</p>
                      <p className="text-xs text-muted-foreground">Show this streak in Life Hub</p>
                    </div>
                    <Switch
                      checked={streak.showMilestonesInCalendar !== false}
                      onCheckedChange={checked => updateNoXTracker?.(streak.id, {
                        showMilestonesInCalendar: checked,
                        updatedAt: new Date(),
                      })}
                      aria-label={`Show ${streak.name} milestones in calendar`}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* TRENDS */}
      {activeTab === 'trends' && (
        <HealthTrendsPanel
          initialTab={requestedProgressTab || undefined}
          foodEntries={foodEntries}
          sleepEntries={sleepEntries}
          activityEntries={activityEntries}
          workoutSessions={health?.workoutSessions || []}
          workoutExercises={workoutExerciseDefinitions}
          weightEntries={weightEntries}
          bodyMeasurementEntries={health?.bodyMeasurementEntries || []}
          waterEntries={health?.waterEntries || []}
          targetWeightKg={targetWeight || undefined}
          targetWaterMl={health?.targetWaterMl}
          weightUnit={weightUnit}
          heightUnit={heightUnit}
          includedFoodLogDates={includedFoodLogDates}
          excludedFoodLogDates={excludedFoodLogDates}
          maintenanceCalories={hasMaintenanceTarget ? maintenanceCalories : undefined}
        />
      )}
      {/* SAVED FOODS */}
      {activeTab === 'saved' && (
        <section data-caizen-feature="saved-food" className="section-surface p-5 sm:p-6">
          <div>
            <h2 className="text-section-title">
              Food Library
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Foods are reusable nutrition references. Meals combine several foods into one reusable log entry.
            </p>
            <SegmentedControl
              label="Food Library mode"
              value={foodTemplateTab}
              onValueChange={value => setFoodTemplateTab(value as 'saved' | 'meals')}
              options={[{ value: 'saved', label: 'Foods' }, { value: 'meals', label: 'Meals' }]}
              className="mt-5 grid w-full grid-cols-2 sm:inline-flex sm:w-auto"
            />
            {foodTemplateTab === 'saved' ? (
              <>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SearchField aria-label="Search foods" value={savedFoodSearch} onChange={setSavedFoodSearch} placeholder="Search foods..." wrapperClassName="w-full sm:max-w-md" className="combobox-trigger-transparent h-11" />
              <Button type="button" onClick={() => { setSelectedFoodTemplate(null); setAddFoodMode('save-template'); setShowAddFoodModal(true); }} className="h-11 rounded-xl px-4 text-sm font-black">
                <Plus className="h-4 w-4" />
                Add food
              </Button>
            </div>
            <div className="mt-4">
              <HealthLibraryList
                 revealControls={[currentProfileId, foodTemplateTab, savedFoodPage]}
                 items={paginatedSavedFoods.map(food => {
                  const grams = normalizeHealthNonNegative(food.referenceWeightGrams);
                  const calories = Math.round(normalizeHealthNonNegative(food.caloriesPerGram) * grams);
                  const protein = normalizeHealthNumber((normalizeHealthNonNegative(food.proteinPerGram) * grams).toFixed(1));
                  const carbs = formatDisplayNumber(food.carbsPerGram * grams);
                  const fat = formatDisplayNumber(food.fatPerGram * grams);
                  const sodium = Math.round(normalizeHealthNonNegative(food.sodiumPerGram) * grams).toLocaleString();
                  const sugar = food.sugarPerGram === undefined
                    ? '—'
                    : formatDisplayNumber(food.sugarPerGram * grams);
                  const savedFoodValue = (field: NutritionField, value: string | number, suffix = '') =>
                    isNutritionFieldMissing(food, field) ? 'Not entered' : `${value}${suffix}`;
                  const sugarSummary = food.sugarPerGram === undefined && !isNutritionFieldMissing(food, 'sugar')
                    ? '— sugar'
                    : `${savedFoodValue('sugar', sugar, 'g')} sugar`;
                  return {
                    id: food.id,
                    name: food.name,
                    favorite: favoriteFoodIds.includes(food.id),
                    favoriteKind: 'food' as const,
                    onToggleFavorite: () => toggleFoodFavorite(food.id),
                    metadata: `${favoriteFoodIds.includes(food.id) ? 'Favorite · ' : recentFoodTemplateIds.includes(food.id) ? 'Recent · ' : ''}${grams ? `${grams}g reference serving` : 'Serving not set'}`,
                    summary: `${savedFoodValue('calories', String(calories), ' cal')} · ${savedFoodValue('protein', protein, 'g')} protein · ${savedFoodValue('carbs', carbs, 'g')} carbs · ${savedFoodValue('fat', fat, 'g')} fat · ${savedFoodValue('sodium', sodium, 'mg')} sodium · ${sugarSummary}`,
                    primaryLabel: 'Use',
                    onPrimary: () => addSavedFoodAgain(food, suggestedMealType(selectedFoodLogDate)),
                    actions: <SavedFoodOverflowMenu
                      androidPresentation={androidPresentation}
                      onEdit={() => { setSelectedFoodTemplate(food); setAddFoodMode('edit-template'); setShowAddFoodModal(true); }}
                      onDelete={() => setSavedFoodToDelete(food)}
                    />,
                  };
                })}
                 emptyMessage={savedFoodSearch ? 'No foods match your search.' : 'No foods saved yet. Save a food from Food Log, or use Add food above.'}
               />
               {savedFoodTotalPages > 1 ? (
                 <PaginationControls
                   page={savedFoodPage}
                   totalPages={savedFoodTotalPages}
                   totalItems={filteredSavedFoods.length}
                   pageSize={HEALTH_LIST_PAGE_SIZE}
                   onPageChange={setSavedFoodPage}
                 />
               ) : null}
             </div>
              </>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <SearchField aria-label="Search meals" value={mealTemplateSearch} onChange={setMealTemplateSearch} placeholder="Search meals..." wrapperClassName="w-full sm:max-w-md" className="combobox-trigger-transparent h-11" />
                  <Button type="button" onClick={() => setMealTemplateEditor({ mode: 'new' })} className="h-11 rounded-xl px-4 text-sm font-black">
                    <Plus className="h-4 w-4" />
                    Add meal
                  </Button>
                </div>
                <HealthLibraryList
                   revealControls={[currentProfileId, foodTemplateTab, mealTemplatePage]}
                   items={paginatedMealTemplates.map(template => {
                    const totals = getMealTemplateTotals(template, uniqueSavedFoods);
                    const availableRows = template.rows.filter(row => Boolean(row.food) || uniqueSavedFoods.some(food => food.id === row.foodId));
                    return {
                      id: template.id,
                      name: template.name,
                      favorite: favoriteMealIds.includes(template.id),
                      favoriteKind: 'meal' as const,
                      onToggleFavorite: () => toggleMealFavorite(template.id),
                      metadata: `${favoriteMealIds.includes(template.id) ? 'Favorite · ' : recentMealTemplateIds.includes(template.id) ? 'Recent · ' : ''}${template.mealType} · ${availableRows.length} ${availableRows.length === 1 ? 'food' : 'foods'}`,
                      summary: `${isNutritionFieldMissing(totals, 'calories') ? 'Not entered' : `${Math.round(totals.calories)} cal`} · ${isNutritionFieldMissing(totals, 'protein') ? 'Not entered' : `${totals.protein.toFixed(1)}g protein`} · ${isNutritionFieldMissing(totals, 'carbs') ? 'Not entered' : `${totals.carbs.toFixed(1)}g carbs`}`,
                      primaryLabel: 'Use',
                      primaryDisabled: !availableRows.length,
                      onPrimary: () => applyMealTemplate(template),
                      actions: <MealTemplateOverflowMenu
                        androidPresentation={androidPresentation}
                        onEdit={() => setMealTemplateEditor({ mode: 'edit', template })}
                        onDelete={() => setMealTemplateToDelete(template)}
                      />,
                    };
                  })}
                   emptyMessage={mealTemplateSearch ? 'No meals match your search.' : 'No meals saved yet. Combine your saved foods into a meal with Add meal above.'}
                 />
                 {mealTemplateTotalPages > 1 ? (
                   <PaginationControls
                     page={mealTemplatePage}
                     totalPages={mealTemplateTotalPages}
                     totalItems={filteredMealTemplates.length}
                     pageSize={HEALTH_LIST_PAGE_SIZE}
                     onPageChange={setMealTemplatePage}
                   />
                 ) : null}
               </div>
            )}


          </div>
        </section>
      )
      }

      {/* SUPPLEMENTS */}
      {
        activeTab === 'supplements' && (
          <SupplementsSection
            onAddClick={onAddSupplementClick}
            androidPresentation={androidPresentation}
          />
        )
      }

      </div>



      <WorkoutModal
        isOpen={showWorkoutModal || !!editingWorkout}
        workout={editingWorkout}
        defaultDate={foodLogDate}
        profileId={currentProfileId}
        onSave={async draft => {
          const workoutEntry = {
            activity: draft.activity,
            caloriesBurned: normalizeHealthNonNegative(draft.caloriesBurned),
            durationMinutes: draft.durationMinutes ? normalizeHealthNonNegative(draft.durationMinutes) : undefined,
            intensity: draft.intensity || undefined,
            date: parseLocalDateValue(draft.date) || new Date(),
            notes: draft.notes || '',
            imageUrl: draft.imageUrl,
            photoAssetIds: draft.photoAssetIds,
          };
          if (draft.id) {
            updateWorkoutEntry(draft.id, workoutEntry);
          } else {
            const savedId = addActivityEntry({ id: draft.recordId, ...workoutEntry });
            if (!savedId) throw new Error('Choose a profile before saving the workout.');
          }
          setShowWorkoutModal(false);
          setEditingWorkout(null);
        }}
        onClose={() => {
          setShowWorkoutModal(false);
          setEditingWorkout(null);
        }}
      />

      <SleepModal
        isOpen={showSleepModal || !!editingSleep}
        sleepEntry={editingSleep}
        defaultDate={foodLogDate}
        onSave={draft => {
          saveSleepEntry(draft);
          setShowSleepModal(false);
          setEditingSleep(null);
        }}
        onClose={() => {
          setShowSleepModal(false);
          setEditingSleep(null);
        }}
      />

      <MealTemplateModal
        key={`meal-template-${mealTemplateEditor?.mode === 'edit' ? mealTemplateEditor.template.id : 'new'}`}
        isOpen={Boolean(mealTemplateEditor)}
        foods={uniqueSavedFoods}
        initialTemplate={mealTemplateEditor?.mode === 'edit' ? mealTemplateEditor.template : null}
        androidPresentation={androidPresentation}
        onSave={saveMealTemplate}
        onSaveFood={addFoodTemplate}
        onClose={() => setMealTemplateEditor(null)}
      />

      <MealTemplatePickerModal
        isOpen={showMealTemplatePicker}
        templates={orderedMealTemplates}
        favoriteTemplateIds={favoriteMealIds}
        onToggleFavorite={toggleMealFavorite}
        dateLabel={foodLogDateLabel}
        getSummary={template => getMealTemplateTotals(template, uniqueSavedFoods)}
        onSelect={applyMealTemplate}
        onClose={() => setShowMealTemplatePicker(false)}
        androidPresentation={androidPresentation}
      />

      <FoodModal key={selectedFoodEntry ? `food-entry-${selectedFoodEntry.id}` : selectedFoodTemplate ? `food-template-${selectedFoodTemplate.id}` : `food-add-${addFoodMode}`} isOpen={showAddFoodModal || !!selectedFoodEntry} mode={addFoodMode} foodEntry={selectedFoodEntry} foodTemplate={selectedFoodTemplate} androidPresentation={androidPresentation} defaultDate={foodLogDate} defaultMealType={quickAddMealType} onClose={() => { setShowAddFoodModal(false); setSelectedFoodEntry(null); setSelectedFoodTemplate(null); setAddFoodMode('log-food'); }} />



      {/* Future modals: uncomment after creating the files. */}

      <WeightModal
          isOpen={showAddWeightModal || !!selectedWeightEntry}
          weightEntry={selectedWeightEntry}
          androidPresentation={androidPresentation}
          onClose={() => {
            setShowAddWeightModal(false);
            setSelectedWeightEntry(null);
          }}
        />

      <EditHealthTargetsModal
        isOpen={showEditTargetsModal}
        onClose={() =>
          setShowEditTargetsModal(false)
        }
      />

      <ConfirmDialog
        isOpen={!!activityToDelete}
        title="Delete Workout?"
        message={`Delete ${activityToDelete?.activity || 'this workout'}?`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (activityToDelete) deleteActivityEntry(activityToDelete.id);
          setActivityToDelete(null);
        }}
        onCancel={() => setActivityToDelete(null)}
      />

      <ConfirmDialog
        isOpen={!!sleepToDelete}
        title="Delete Sleep Log?"
        message="Delete this sleep log?"
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (sleepToDelete) {
            deleteSleepEntry(sleepToDelete.id);
          }
          setSleepToDelete(null);
        }}
        onCancel={() => setSleepToDelete(null)}
      />

      <ConfirmDialog
        isOpen={!!foodEntryToDelete}
        title="Delete Food Entry?"
        message={`Delete ${foodEntryToDelete?.name || 'this food entry'} from today's food log? This will not delete saved foods.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (foodEntryToDelete) {
            deleteFoodEntry(foodEntryToDelete.id);
          }

          setFoodEntryToDelete(null);
        }}
        onCancel={() => setFoodEntryToDelete(null)}
      />

      <ConfirmDialog
        isOpen={!!weightEntryToDelete}
        title="Delete Weight Entry?"
        message={`Delete ${weightEntryToDelete ? displayWeight(weightEntryToDelete.weightKg) : 'this weight'} entry?`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (weightEntryToDelete) {
            deleteWeightEntry(weightEntryToDelete.id);
          }

          setWeightEntryToDelete(null);
        }}
        onCancel={() =>
          setWeightEntryToDelete(null)
        }
      />

      <ConfirmDialog
        isOpen={!!savedFoodToDelete}
        title="Delete food?"
        message={`Delete ${savedFoodToDelete?.name || 'this food'} from your Food Library? This will not delete food log entries.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (savedFoodToDelete) {
            deleteFoodTemplate(savedFoodToDelete.id);
          }

          setSavedFoodToDelete(null);
        }}
        onCancel={() =>
          setSavedFoodToDelete(null)
        }
      />

      <ConfirmDialog
        isOpen={!!mealTemplateToDelete}
        title="Delete meal?"
        message={`Delete "${mealTemplateToDelete?.name || 'this meal'}" from your Food Library? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => {
          if (mealTemplateToDelete) {
            deleteMealTemplate(mealTemplateToDelete.id);
          }
          setMealTemplateToDelete(null);
        }}
        onCancel={() => setMealTemplateToDelete(null)}
      />

      <StreakTimelineModal
        isOpen={Boolean(streakToEdit)}
        streak={streakToEdit}
        onClose={() => setStreakToEdit(null)}
        onSave={patch => {
          if (streakToEdit && updateNoXTracker) updateNoXTracker(streakToEdit.id, patch);
          setStreakToEdit(null);
        }}
      />

      <Dialog open={Boolean(streakToPause)} onOpenChange={open => !open && requestPauseClose()}>
        <DialogContent showCloseButton={false} allowOutsideDismiss={androidPresentation}>
          <DialogHeader><DialogTitle>Pause streak</DialogTitle><DialogDescription>Paused days are excluded from the count. Previous completion history remains unchanged.</DialogDescription></DialogHeader>
          <div className="grid gap-3"><AdaptiveDatePicker label="Optional automatic resume date" value={pauseResumeDate} onChange={setPauseResumeDate} /><label className="text-sm font-bold">Reason (optional)<textarea value={pauseReason} onChange={event => { const result = guardHealthTextChange(pauseReason, event.target.value, { label: 'Pause reason', maxLength: 300, mode: 'multiline' }); if (!result.accepted) return setStreakFormError(result.error || 'Check the pause reason.'); setPauseReason(result.value); setStreakFormError(result.error || ''); }} aria-invalid={Boolean(streakFormError)} aria-describedby="pause-reason-error" className="control-input mt-2 min-h-20 py-3" /></label><div className="min-h-[20px]">{streakFormError ? <p id="pause-reason-error" className="text-sm font-semibold text-destructive" role="alert">{streakFormError}</p> : null}</div></div>
          <DialogFooter><Button type="button" variant="outline" onClick={requestPauseClose}>Cancel</Button><Button type="button" onClick={pauseStreak}>Pause Streak</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(streakToReset)} onOpenChange={open => !open && requestResetClose()}>
        <DialogContent showCloseButton={false} allowOutsideDismiss={androidPresentation} className="border-destructive/30">
          <DialogHeader><DialogTitle className="text-destructive">Reset streak?</DialogTitle><DialogDescription>This resets only the current count and pause state. The previous cycle is saved in this streak’s reset history; unrelated Health logs are preserved.</DialogDescription></DialogHeader>
          <label className="text-sm font-bold">Reset reason (optional)<textarea value={resetReason} onChange={event => { const result = guardHealthTextChange(resetReason, event.target.value, { label: 'Reset reason', maxLength: 300, mode: 'multiline' }); if (!result.accepted) return setStreakFormError(result.error || 'Check the reset reason.'); setResetReason(result.value); setStreakFormError(result.error || ''); }} aria-invalid={Boolean(streakFormError)} aria-describedby="reset-reason-error" className="control-input mt-2 min-h-20 py-3" /></label>
          {streakFormError ? <p id="reset-reason-error" className="text-sm font-semibold text-destructive" role="alert">{streakFormError}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={requestResetClose}>Keep Streak</Button><Button type="button" variant="destructive" onClick={resetStreak}>Reset Current Cycle</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(streakUnsavedAction)}
        title="Discard streak changes?"
        message="Your streak changes have not been saved yet."
        confirmText="Discard changes"
        cancelText="Keep editing"
        isDangerous
        tone="danger"
        onCancel={() => setStreakUnsavedAction(null)}
        onConfirm={() => {
          const action = streakUnsavedAction;
          setStreakUnsavedAction(null);
          if (action === 'pause') setStreakToPause(null);
          if (action === 'reset') setStreakToReset(null);
        }}
      />

      <ConfirmDialog isOpen={Boolean(streakToDelete)} title="Delete streak?" message={streakToDelete ? `Delete "${streakToDelete.name}" and its saved reset summary?` : 'Delete this streak?'} confirmText="Delete" cancelText="Cancel" isDangerous onCancel={() => setStreakToDelete(null)} onConfirm={() => { if (streakToDelete && deleteNoXTracker) deleteNoXTracker(streakToDelete.id); setStreakToDelete(null); }} />
    </div >
  );
}
