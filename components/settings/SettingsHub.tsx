'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  LayoutGrid,
  Palette,
  RotateCcw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';

import { APP_VERSION } from '@/lib/app-version';
import { cn } from '@/lib/utils';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { Checkbox } from '@/components/ui/checkbox';
import {
  deleteHealthDataInDateRange,
  countHealthDataInDateRange,
} from '@/lib/health/date-range-deletion';
import {
  clearHealthLinksAndEvidenceFromRoutines,
  clearHealthLinksFromTasks,
  clearGameLinksFromRoutines,
  clearGameLinksFromTasks,
  clearWorkLinksFromRoutines,
  clearWorkLinksFromTasks,
  healthLinkedTargetKey,
} from '@/lib/lifehub/linked-context';
import { collectMediaReferenceIds } from '@/lib/storage/media-references';
import { queueMediaCleanup } from '@/lib/storage/media-cleanup';
import { FeedbackSettings } from './FeedbackSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { CompanionSettings } from './CompanionSettings';
import { SettingsDataPanel } from './SettingsDataPanel';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { SearchField } from '@/components/ui/search-field';
import { FormField } from '@/components/common/FormPatterns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function SettingSwitch({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      className="settings-switch-row group"
    >
      <span className="min-w-0 text-left">
        <span className="block text-sm font-semibold text-foreground">
          {label}
        </span>
        {description && (
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function SettingsSection({
  title,
  description,
  sectionId,
  children,
  active = true,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  sectionId?: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <section id={sectionId} data-active={active} className="settings-page scroll-mt-4">
      <header className="settings-page-heading">
        <h3 className="min-w-0 text-page-title">{title}</h3>
      </header>
      {description && <p className="settings-page-description text-body-sm text-muted-foreground">{description}</p>}
      <div className="settings-page-body" data-settings-content={active ? 'active' : 'inactive'}>
        {children}
      </div>
    </section>
  );
}

function SettingsSubheading({
  title,
  description,
  id,
}: {
  title: string;
  description?: string;
  id?: string;
}) {
  return (
    <div id={id} tabIndex={id ? -1 : undefined} className="settings-group-heading mb-2 mt-6 scroll-mt-5 first:mt-0">
      <h4 className="text-section-title">
        {title}
      </h4>
      {description && (
        <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

type WebSettingsId =
  | 'settings-general'
  | 'settings-appearance'
  | 'settings-workspace'
  | 'settings-data'
  | 'settings-help'
  | 'settings-advanced';

// Old per-topic section ids are mapped onto the six merged groups so stored
// hashes/localStorage values from before the consolidation still resolve.
const SETTINGS_ID_ALIASES: Record<string, WebSettingsId> = {
  'settings-overview': 'settings-general',
  'settings-general': 'settings-general',
  'settings-appearance': 'settings-appearance',
  'settings-feedback': 'settings-general',
  'settings-workspace': 'settings-workspace',
  'settings-layout': 'settings-workspace',
  // Currency is edited in Balance, but old links still land somewhere useful.
  'settings-money': 'settings-general',
  'settings-profile': 'settings-general',
  'settings-data': 'settings-data',
  'settings-cloud': 'settings-data',
  'settings-privacy': 'settings-data',
  'settings-help': 'settings-help',
  'settings-about': 'settings-help',
  'settings-demo': 'settings-advanced',
  'settings-advanced': 'settings-advanced',
};

function resolveSettingsSectionId(value: string | null | undefined): WebSettingsId | null {
  if (!value) return null;
  return SETTINGS_ID_ALIASES[value] || null;
}

const SETTINGS_SEARCH_REGISTRY: ReadonlyArray<{
  label: string;
  group: string;
  keywords: string;
  destination: WebSettingsId;
  anchor?: string;
}> = [
  { label: 'Current profile', group: 'General', keywords: 'manage edit switch profile account', destination: 'settings-general', anchor: 'settings-profile-group' },
  { label: 'Companion personality', group: 'General', keywords: 'mochi pet speaks', destination: 'settings-general', anchor: 'settings-companion-title' },
  { label: 'Show toast notifications', group: 'General · In-app feedback', keywords: 'feedback confirmations', destination: 'settings-general', anchor: 'settings-feedback-group' },
  { label: 'Theme mode and style', group: 'Appearance', keywords: 'system light dark palette', destination: 'settings-appearance', anchor: 'settings-theme-group' },
  { label: 'Accent and custom color', group: 'Appearance', keywords: 'hue hex scheme', destination: 'settings-appearance', anchor: 'settings-accent-group' },
  { label: 'Background and surfaces', group: 'Appearance', keywords: 'photo album art opacity section transparency', destination: 'settings-appearance', anchor: 'settings-background-group' },
  { label: 'Motion and theme transition', group: 'Appearance', keywords: 'animation reduced glow subtle', destination: 'settings-appearance', anchor: 'settings-motion-group' },
  { label: 'Dashboard cards', group: 'Workspace', keywords: 'visibility today focus life pulse insights milestones weekly reflection', destination: 'settings-workspace', anchor: 'settings-dashboard-group' },
  { label: 'Show Worth Checking', group: 'Workspace · Dashboard', keywords: 'neglected areas stale actionable', destination: 'settings-workspace', anchor: 'settings-dashboard-group' },
  { label: 'Navigation and layout indicators', group: 'Workspace', keywords: 'section order hide show streak glow last saved updated', destination: 'settings-workspace', anchor: 'settings-navigation-group' },
  { label: 'Default landing page', group: 'Workspace', keywords: 'start open dashboard life hub health money', destination: 'settings-workspace', anchor: 'settings-landing-group' },
  { label: 'Focus Mode', group: 'Workspace', keywords: 'daily sections', destination: 'settings-workspace', anchor: 'settings-focus-group' },
  { label: 'Local transfer', group: 'Data & Backup', keywords: 'caizen export import restore recovery complete json', destination: 'settings-data', anchor: 'settings-backup-group' },
  { label: 'Recently deleted', group: 'Data & Backup · Recovery', keywords: 'trash restore', destination: 'settings-data', anchor: 'settings-backup-group' },
  { label: 'Cloud Backup and storage', group: 'Data & Backup', keywords: 'snapshot account status manage', destination: 'settings-data', anchor: 'settings-cloud-group' },
  { label: 'Clear local data', group: 'Data & Backup · Danger Zone', keywords: 'delete section all privacy', destination: 'settings-data', anchor: 'settings-danger-group' },
  { label: 'Guide and introduction', group: 'Help & About', keywords: 'replay onboarding', destination: 'settings-help', anchor: 'settings-guide-group' },
  { label: 'Version and data sources', group: 'Help & About', keywords: 'anilist tmdb justwatch', destination: 'settings-help', anchor: 'settings-about-group' },
  { label: 'Demo Mode', group: 'Advanced', keywords: 'sample data enter exit reset', destination: 'settings-advanced', anchor: 'settings-demo-group' },
];

/* =========================================
   PAGE
========================================= */
export function MobileTabManager({
  tabs,
  hiddenTabs,
  activeTab,
  toggleTab,
  moveTab,
  compact = false,
}: {
  tabs: readonly {
    id: string;
    label: string;
  }[];
  hiddenTabs: string[];
  activeTab: string;
  toggleTab: (tabId: string) => void;
  moveTab: (tabId: string, direction: -1 | 1) => void;
  compact?: boolean;
}) {
  return (
    <section className={compact ? 'px-2 pb-2' : 'mt-5 rounded-3xl border border-border/50 bg-card/70 p-3'}>
      <div className="mb-3 flex items-center gap-2">
        <LayoutGrid className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Sections</h4>
      </div>

      <div className="max-h-[34vh] space-y-2 overflow-y-auto pr-1">
        {tabs.map((tab, index) => {
          const hidden =
            hiddenTabs.includes(tab.id);

          const protectedTab =
            tab.id === 'dashboard';

          return (
            <div
              key={tab.id}
              className={`
                flex
                items-center
                gap-2
                rounded-xl
                ${compact ? '' : 'border'}
                p-2
                ${activeTab === tab.id
                  ? compact ? 'bg-primary/10' : 'border-primary/30 bg-primary/10'
                  : compact ? 'bg-background/50' : 'border-border/50 bg-background/50'
                }
              `}
            >
              <div className="min-w-0 flex-1 px-1">
                <p className="truncate text-sm font-bold">
                  {tab.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {protectedTab
                    ? 'Required'
                    : hidden
                      ? 'Hidden'
                      : 'Visible'}
                </p>
              </div>

              <button
                type="button"
                disabled={protectedTab || index <= 1}
                onClick={() => moveTab(tab.id, -1)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-background/60 text-muted-foreground disabled:opacity-35"
                aria-label={`Move ${tab.label} up`}
              >
                <ArrowUp className="h-4 w-4" />
              </button>

              <button
                type="button"
                disabled={protectedTab || index === tabs.length - 1}
                onClick={() => moveTab(tab.id, 1)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-background/60 text-muted-foreground disabled:opacity-35"
                aria-label={`Move ${tab.label} down`}
              >
                <ArrowDown className="h-4 w-4" />
              </button>

              <button
                type="button"
                disabled={protectedTab}
                onClick={() => toggleTab(tab.id)}
                className={`
                  flex
                  h-9
                  w-9
                  items-center
                  justify-center
                  rounded-xl
                  disabled:opacity-35
                  ${hidden
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-primary text-primary-foreground'
                  }
                `}
                aria-label={`${hidden ? 'Show' : 'Hide'} ${tab.label}`}
              >
                {hidden ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SettingsHub({
  onClose,
  transferFormat,
  onTransferFormatChange,
  onExport,
  onImport,
  onCloudSync,
  onOpenTrash,
  onEnterDemo,
  onExitDemo,
  onResetDemo,
  onOpenGuide,
  onResetOnboarding,
  onClearAllLocalData,
  isDemoMode,
  storageUsed,
  cloudStatus,
  defaultLandingPage,
  setDefaultLandingPage,
  dashboardCards,
  demoVersion,
  focusMode,
  setFocusMode,
  dashboardVisibility,
  dashboardDetail,
  setDashboardVisibility,
  navigationTabs,
  hiddenTabs,
  activeTab,
  toggleTab,
  moveTab,
  darkModeAnimation,
  setDarkModeAnimation,
  theme,
  darkStyle,
  lightStyle,
  scheme,
  backgroundImage,
  backgroundOpacity,
  animationPreference,
  useAlbumArtBackground,
  setTheme,
  setDarkStyle,
  setLightStyle,
  setScheme,
  setBackgroundImage,
  setBackgroundOpacity,
  setAnimationPreference,
  setUseAlbumArtBackground,
  currentProfile,
  updateProfile,
}: {
  onClose: () => void;
  transferFormat: 'complete' | 'data';
  onTransferFormatChange: (format: 'complete' | 'data') => void;
  onExport: () => void;
  onImport: () => void;
  onCloudSync: () => void;
  onOpenTrash: () => void;
  onEnterDemo: () => void;
  onExitDemo: () => void;
  onResetDemo: () => void;
  onOpenGuide: () => void;
  onResetOnboarding: () => void;
  onClearAllLocalData: () => Promise<void>;
  isDemoMode: boolean;
  storageUsed: string;
  cloudStatus: string;
  defaultLandingPage: string;
  setDefaultLandingPage: (value: string) => void;
  dashboardCards: ReadonlyArray<readonly [string, string]>;
  demoVersion: string;
  focusMode: boolean;
  setFocusMode: (enabled: boolean) => void;
  dashboardVisibility: Record<string, boolean>;
  dashboardDetail: 'calm' | 'balanced' | 'detailed';
  setDashboardVisibility: (visibility: Record<string, boolean>) => void;
  navigationTabs: readonly { id: string; label: string }[];
  hiddenTabs: string[];
  activeTab: string;
  toggleTab: (tabId: string) => void;
  moveTab: (tabId: string, direction: -1 | 1) => void;
  darkModeAnimation: string;
  setDarkModeAnimation: (value: string) => void;
  theme: string;
  darkStyle: string;
  lightStyle: string;
  scheme: string;
  backgroundImage: string;
  backgroundOpacity: number;
  animationPreference: string;
  useAlbumArtBackground: boolean;
  setTheme: (theme: any) => void;
  setDarkStyle: (style: any) => void;
  setLightStyle: (style: any) => void;
  setScheme: (scheme: any) => void;
  setBackgroundImage: (url: string) => void;
  setBackgroundOpacity: (opacity: number) => void;
  setAnimationPreference: (preference: any) => void;
  setUseAlbumArtBackground: (enabled: boolean) => void;
  currentProfile: any;
  updateProfile: (id: string, updates: any) => void;
}) {
  const [deleteSection, setDeleteSection] = useState('journalEntries');
  const [deleteMode, setDeleteMode] = useState<'all' | 'range'>('all');
  const [deleteStart, setDeleteStart] = useState('');
  const [deleteEnd, setDeleteEnd] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteNotice, setDeleteNotice] = useState('');
  const [dangerDialog, setDangerDialog] =
    useState<'section' | 'all' | null>(null);
  const settingsPanelRef = useRef<HTMLElement | null>(null);
  const settingsContentRef = useRef<HTMLElement | null>(null);

  // Registers Settings in the shared overlay stack so Escape closes it, and
  // only it, when it is the topmost overlay. The danger-confirmation Dialog
  // nested below is registered too so it takes priority while open, instead
  // of a single Escape press closing both layers at once.
  useOverlayLifecycle(true, onClose, { containerRef: settingsPanelRef });
  useOverlayLifecycle(Boolean(dangerDialog), () => setDangerDialog(null));

  const [showLastUpdated, setShowLastUpdated] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('layout-show-last-updated') !== 'false'
      : true
  );
  const [showStreakGlow, setShowStreakGlow] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('layout-show-streak-glow') !== 'false'
      : true
  );
  const [settingsSearch, setSettingsSearch] = useState('');
  const [activeSettingsSection, setActiveSettingsSection] = useState(() => {
    if (typeof window === 'undefined') return 'settings-general';
    const hash = window.location.hash.slice(1);
    const stored = localStorage.getItem('settings-active-section');
    return resolveSettingsSectionId(hash) || resolveSettingsSectionId(stored) || 'settings-general';
  });
  const [mobileSettingsDetail, setMobileSettingsDetail] = useState(false);

  useEffect(() => {
    if (settingsContentRef.current) settingsContentRef.current.scrollTop = 0;
  }, [activeSettingsSection]);

  useEffect(() => {
    const restoreHashSection = () => {
      const resolved = resolveSettingsSectionId(window.location.hash.slice(1));
      if (resolved) {
        setActiveSettingsSection(resolved);
        if (window.matchMedia('(max-width: 767px)').matches) {
          setMobileSettingsDetail(true);
        }
      } else {
        setActiveSettingsSection('settings-general');
        setMobileSettingsDetail(false);
      }
    };
    restoreHashSection();
    window.addEventListener('hashchange', restoreHashSection);
    window.addEventListener('popstate', restoreHashSection);
    return () => {
      window.removeEventListener('hashchange', restoreHashSection);
      window.removeEventListener('popstate', restoreHashSection);
    };
  }, []);

  const settingsShortcuts = [
    { id: 'settings-general', label: 'General', detail: 'Profile, Companion, feedback', icon: Settings },
    { id: 'settings-appearance', label: 'Appearance', detail: 'Theme, accent, background', icon: Palette },
    { id: 'settings-workspace', label: 'Workspace', detail: 'Dashboard and navigation', icon: LayoutGrid },
    { id: 'settings-data', label: 'Data & Backup', detail: 'Recovery, cloud, storage', icon: Database },
    { id: 'settings-help', label: 'Help & About', detail: 'Guide and app information', icon: BookOpen },
    { id: 'settings-advanced', label: 'Advanced', detail: 'Demo Mode', icon: Sparkles },
  ] as const;

  const jumpToSetting = (id: string) => {
    const resolved = resolveSettingsSectionId(id) || 'settings-general';
    setActiveSettingsSection(resolved);
    setMobileSettingsDetail(true);
    localStorage.setItem('settings-active-section', resolved);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${resolved}`);
  };

  const searchQuery = settingsSearch.trim().toLocaleLowerCase();
  const searchResults = searchQuery ? SETTINGS_SEARCH_REGISTRY.filter(item =>
    `${item.label} ${item.group} ${item.keywords}`.toLocaleLowerCase().includes(searchQuery)
  ) : [];
  const visibleSettingsShortcuts = searchQuery ? [] : settingsShortcuts;
  const openSearchResult = (destination: WebSettingsId, anchor?: string) => {
    jumpToSetting(destination);
    if (anchor) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const target = document.getElementById(anchor);
          const disclosure = target?.matches('details') ? target : target?.querySelector('details');
          if (disclosure instanceof HTMLDetailsElement) disclosure.open = true;
          target?.scrollIntoView({ block: 'start', behavior: 'auto' });
          target?.focus({ preventScroll: true });
        });
      });
    }
  };

  const setDashboardCardVisible = (id: string, visible: boolean) => {
    if (id === 'motivation') {
      setDashboardVisibility({
        ...dashboardVisibility,
        petCard: visible,
        achievements: visible,
      });
      return;
    }
    const next = { ...dashboardVisibility, [id]: visible };
    setDashboardVisibility(next);
  };

  const deleteSections = [
    { id: 'health', label: 'Health', actionLabel: 'Clear Health data' },
    { id: 'journalEntries', label: 'Journal', actionLabel: 'Clear Journal data' },
    { id: 'musicItems', label: 'Music', actionLabel: 'Clear Music data' },
    { id: 'mediaItems', label: 'Entertainment', actionLabel: 'Clear Entertainment data' },
    { id: 'games', label: 'Games', actionLabel: 'Clear Games data' },
    { id: 'workItems', label: 'Work', actionLabel: 'Clear Work data' },
  ];

  const emptyHealth = {
    heightCm: undefined,
    targetCalories: 2100,
    targetProtein: 120,
    targetWaterMl: 3000,
    vapeTracker: {
      quitDate: null,
      dailySpendBefore: 0,
    },
    weightEntries: [],
    waterEntries: [],
    bodyMeasurementEntries: [],
    nutritionEntries: [],
    foodEntries: [],
    foodLogCompletedDates: [],
    foodLogExcludedDates: [],
    foodTemplates: [],
    mealTemplates: [],
    activityEntries: [],
    fastingSessions: [],
    workoutPlans: [],
    workoutExercises: [],
    workoutRoutines: [],
    workoutSessions: [],
    sleepEntries: [],
    noXTrackers: [],
  };

  const inDateRange = (value: any) => {
    if (deleteMode === 'all') return false;

    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return false;

    const start = deleteStart ? new Date(`${deleteStart}T00:00:00`) : null;
    const end = deleteEnd ? new Date(`${deleteEnd}T23:59:59`) : null;

    return (!start || date >= start) && (!end || date <= end);
  };

  const filterDatedItems = (items: any[], dateKeys: string[]) =>
    items.filter(item => {
      const dateValue = dateKeys.map(key => item?.[key]).find(Boolean);
      return !inDateRange(dateValue);
    });

  const healthDateRange = {
    start: deleteStart ? new Date(`${deleteStart}T00:00:00`) : undefined,
    end: deleteEnd ? new Date(`${deleteEnd}T23:59:59.999`) : undefined,
  };

  const dateKeysBySection: Record<string, string[]> = {
    journalEntries: ['date', 'createdAt'],
    musicItems: ['createdAt'],
    mediaItems: ['createdAt'],
    games: ['createdAt'],
  };

  const getDeleteItems = () => {
    if (!currentProfile) return [];

    if (deleteSection === 'health') {
      const health = currentProfile.health || emptyHealth;
      if (deleteMode === 'range') {
        return Array.from({
          length: countHealthDataInDateRange(health, healthDateRange),
        });
      }
      return [
        ...(health.foodEntries || []).map((item: any) => ({ ...item, __date: item.date })),
        ...(health.foodLogCompletedDates || []).map((date: string) => ({ __date: `${date}T00:00:00` })),
        ...(health.foodLogExcludedDates || []).map((date: string) => ({ __date: `${date}T00:00:00` })),
        ...(health.weightEntries || []).map((item: any) => ({ ...item, __date: item.date })),
        ...(health.waterEntries || []).map((item: any) => ({ ...item, __date: item.date })),
        ...(health.bodyMeasurementEntries || []).map((item: any) => ({ ...item, __date: item.date })),
        ...(health.activityEntries || []).map((item: any) => ({ ...item, __date: item.date })),
        ...(health.fastingSessions || []).map((item: any) => ({ ...item, __date: item.startedAt })),
        ...(health.nutritionEntries || []).map((item: any) => ({ ...item, __date: item.date })),
        ...(health.sleepEntries || []).map((item: any) => ({ ...item, __date: item.date })),
        ...(health.noXTrackers || []).map((item: any) => ({ ...item, __date: item.startDate })),
        ...(health.foodTemplates || []),
        ...(health.mealTemplates || []),
        ...(health.workoutPlans || []),
        ...(health.workoutExercises || []),
        ...(health.workoutRoutines || []),
        ...(health.workoutSessions || []),
      ];
    }

    const dateKeys = dateKeysBySection[deleteSection] || ['createdAt'];
    return (currentProfile[deleteSection] || []).filter((item: any) => {
      if (deleteMode === 'all') return true;
      const dateValue = dateKeys.map(key => item?.[key]).find(Boolean);
      return inDateRange(dateValue);
    });
  };

  const affectedDeleteCount = getDeleteItems().length;

  const runDeleteData = () => {
    if (!currentProfile || deleteConfirm.trim().toLowerCase() !== 'confirm') {
      setDeleteNotice('Type confirm to delete data.');
      return;
    }

    if (deleteMode === 'range' && !deleteStart && !deleteEnd) {
      setDeleteNotice('Choose a start or end date for range deletion.');
      return;
    }

    const updates: any = {};
    const deletedGameIds: ReadonlySet<string> = deleteSection === 'games'
      ? new Set<string>(getDeleteItems()
        .map((item: any) => typeof item?.id === 'string' ? item.id.trim() : '')
        .filter(Boolean))
      : new Set<string>();
    const deletedWorkIds: ReadonlySet<string> = deleteSection === 'workItems'
      ? new Set<string>(getDeleteItems()
        .map((item: any) => typeof item?.id === 'string' ? item.id.trim() : '')
        .filter(Boolean))
      : new Set<string>();

    if (deleteSection === 'health') {
      if (deleteMode === 'all') {
        const health = currentProfile.health;
        const removedHealthTargets = new Set([
          ...(health?.workoutPlans || []).map((plan: any) => healthLinkedTargetKey({ type: 'workout-plan', entityId: plan.id })),
          ...(health?.workoutRoutines || [])
            .filter((routine: any) => routine.source === 'custom')
            .map((routine: any) => healthLinkedTargetKey({ type: 'workout-routine', entityId: routine.id })),
        ]);
        updates.dailyChecklistItems = clearHealthLinksAndEvidenceFromRoutines(
          currentProfile.dailyChecklistItems || [],
          removedHealthTargets,
        );
        updates.productivityItems = clearHealthLinksFromTasks(
          currentProfile.productivityItems || [],
          removedHealthTargets,
        );
      }
      updates.health =
        deleteMode === 'all'
          ? emptyHealth
          : deleteHealthDataInDateRange(
            currentProfile.health || emptyHealth,
            healthDateRange,
          ).health;
    } else if (deleteMode === 'all') {
      updates[deleteSection] = [];
    } else {
      updates[deleteSection] = filterDatedItems(
        currentProfile[deleteSection] || [],
        dateKeysBySection[deleteSection] || ['createdAt']
      );
    }

    if (deleteSection === 'games' && deletedGameIds.size > 0) {
      updates.dailyChecklistItems = clearGameLinksFromRoutines(
        currentProfile.dailyChecklistItems || [],
        deletedGameIds,
      );
      updates.productivityItems = clearGameLinksFromTasks(
        currentProfile.productivityItems || [],
        deletedGameIds,
      );
    }

    if (deleteSection === 'workItems' && deletedWorkIds.size > 0) {
      updates.dailyChecklistItems = clearWorkLinksFromRoutines(
        currentProfile.dailyChecklistItems || [],
        deletedWorkIds,
      );
      updates.productivityItems = clearWorkLinksFromTasks(
        currentProfile.productivityItems || [],
        deletedWorkIds,
      );
    }

    const beforeMediaIds = collectMediaReferenceIds(currentProfile);
    const afterMediaIds = collectMediaReferenceIds({
      ...currentProfile,
      ...updates,
    });
    const removedMediaIds = [...beforeMediaIds].filter(
      (assetId) => !afterMediaIds.has(assetId),
    );
    queueMediaCleanup({
      profileId: currentProfile.id,
      assetIds: removedMediaIds,
      reason: 'section-deleted',
    });

    updateProfile(currentProfile.id, updates);
    setDeleteConfirm('');
    setDangerDialog(null);
    setDeleteNotice('Data deleted.');
  };

  const clearAllLocalData = async () => {
    if (deleteConfirm.trim().toLowerCase() !== 'confirm') {
      setDeleteNotice('Type confirm to clear all workspace data.');
      return;
    }

    try {
      await onClearAllLocalData();
    } catch (caught) {
      setDeleteNotice(
        caught instanceof Error
          ? `Workspace data was not cleared: ${caught.message}`
          : 'Workspace data was not cleared because local storage failed.',
      );
    }
  };

  return (
    <div className="settings-hub-root fixed inset-0 z-[95] flex items-center justify-center p-0 sm:p-4">
      <div
        aria-hidden="true"
        className="caizen-app-scrim absolute inset-0 backdrop-blur-md"
      />

      <section ref={settingsPanelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="web-settings-title" className="settings-hub-shell modal-card-enter relative z-10 flex h-dvh w-full max-w-6xl flex-col overflow-hidden border border-border/65 bg-background shadow-2xl outline-none motion-reduce:animate-none sm:h-[min(48rem,94dvh)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem]">
        <div className="settings-hub-header flex shrink-0 items-start justify-between gap-4 border-b border-border/55 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="web-settings-title" className="text-page-title">
              Settings
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Personalize Caizen and manage your workspace.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-all hover:text-foreground"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="settings-hub-grid grid min-h-0 flex-1 md:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className={cn('settings-hub-sidebar min-h-0 overflow-y-auto border-r border-border/55 bg-card p-4', mobileSettingsDetail && 'hidden md:block')}>
            <p className="mb-3 truncate px-3 text-sm text-muted-foreground">{currentProfile?.name || 'Current profile'}</p>
            <SearchField
              value={settingsSearch}
              onChange={setSettingsSearch}
              placeholder="Search settings"
              aria-label="Search settings"
              wrapperClassName="settings-hub-search mb-4"
              className="h-11 rounded-xl border border-border/60 bg-input px-3"
            />
            <nav aria-label="Settings categories" className="space-y-1">
            {searchQuery && searchResults.map(item => (
              <button key={`${item.destination}:${item.label}`} type="button" onClick={() => openSearchResult(item.destination, item.anchor)} className="settings-hub-search-result w-full rounded-xl px-3 py-2.5 text-left hover:bg-muted/55">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.group}</span>
              </button>
            ))}
            {visibleSettingsShortcuts.map(item => {
              const Icon = item.icon;
              const active = activeSettingsSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => jumpToSetting(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn('settings-hub-nav-item group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors motion-reduce:transition-none', active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/55')}
                >
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', active ? 'bg-primary/15 text-primary' : 'text-muted-foreground group-hover:text-foreground')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                  <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', active && 'text-primary')} />
                </button>
              );
            })}
            {searchQuery && searchResults.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No settings match your search.</p>}
            </nav>
          </aside>

          <main ref={settingsContentRef} className={cn('settings-content-panel settings-hub-main min-h-0 overflow-y-auto [scrollbar-gutter:stable] bg-background p-4 sm:p-5', !mobileSettingsDetail && 'hidden md:block')}>
            <button type="button" onClick={() => setMobileSettingsDetail(false)} className="mb-4 inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm font-bold md:hidden">← All settings</button>
          <SettingsSection
            sectionId="settings-general"
            title="General"
            description="Your profile and the way Caizen responds to you."
            active={activeSettingsSection === 'settings-general'}
          >
            <SettingsSubheading id="settings-profile-group" title="Current profile" />
            <div className="settings-profile-summary flex flex-wrap items-center gap-4 rounded-2xl border border-border/55 bg-card p-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-semibold text-primary" aria-hidden="true">
                {(currentProfile?.name || 'Caizen').trim().slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-card-title">{currentProfile?.name || 'Caizen profile'}</h3>
                <p className="mt-1 text-body-sm text-muted-foreground">Manage your profile name and picture.</p>
              </div>
              <button type="button" onClick={() => window.dispatchEvent(new Event('caizen:open-profiles'))} className="settings-compact-action">Manage profile</button>
            </div>
            <div className="mt-6 border-t border-border/45 pt-5"><CompanionSettings /></div>
            <div id="settings-feedback-group" tabIndex={-1} className="mt-6 scroll-mt-5 border-t border-border/45 pt-5">
              <FeedbackSettings value={currentProfile?.feedbackPreferences} onChange={feedbackPreferences => {
                if (currentProfile) updateProfile(currentProfile.id, { feedbackPreferences });
              }} compact />
            </div>
          </SettingsSection>

          <SettingsSection
            sectionId="settings-appearance"
            title="Appearance"
            description="Choose how Caizen looks and moves."
            active={activeSettingsSection === 'settings-appearance'}
          >
            <AppearanceSettings
              theme={theme}
              darkStyle={darkStyle}
              lightStyle={lightStyle}
              scheme={scheme}
              backgroundImage={backgroundImage}
              backgroundOpacity={backgroundOpacity}
              animationPreference={animationPreference}
              useAlbumArtBackground={useAlbumArtBackground}
              setTheme={setTheme}
              setDarkStyle={setDarkStyle}
              setLightStyle={setLightStyle}
              setScheme={setScheme}
              setBackgroundImage={setBackgroundImage}
              setBackgroundOpacity={setBackgroundOpacity}
              setAnimationPreference={setAnimationPreference}
              setUseAlbumArtBackground={setUseAlbumArtBackground}
              themeTransition={{ value: darkModeAnimation, onChange: value => {
                setDarkModeAnimation(value);
                localStorage.setItem('layout-dark-mode-animation', value);
              } }}
              compact
            />
          </SettingsSection>

          <SettingsSection sectionId="settings-workspace" title="Workspace" description="Choose what appears on Dashboard and how you move around Caizen." active={activeSettingsSection === 'settings-workspace'}>
            <SettingsSubheading id="settings-navigation-group" title="Navigation and layout indicators" />
            <div className="space-y-2">
                <SettingSwitch
                  label="Show last saved time"
                  description="Shows the most recent successful save for this profile in the web header."
                  checked={showLastUpdated}
                  onChange={checked => {
                    setShowLastUpdated(checked);
                    localStorage.setItem('layout-show-last-updated', String(checked));
                    window.dispatchEvent(new Event('life-manager:layout-settings'));
                  }}
                />
                <SettingSwitch
                  label="Show Streak Glow"
                  description="Adds a small visual cue to sections with an active streak."
                  checked={showStreakGlow}
                  onChange={checked => {
                    setShowStreakGlow(checked);
                    localStorage.setItem('layout-show-streak-glow', String(checked));
                    window.dispatchEvent(new Event('life-manager:layout-settings'));
                  }}
                />
            </div>
            <details className="settings-disclosure mt-3">
              <summary><span className="text-sm font-semibold">Show and order sections</span></summary>
              <MobileTabManager tabs={navigationTabs} hiddenTabs={hiddenTabs} activeTab={activeTab} toggleTab={toggleTab} moveTab={moveTab} compact />
            </details>
            <SettingsSubheading id="settings-landing-group" title="Default landing page" />
                <label className="settings-field">
                  <span className="text-sm font-semibold">Open Caizen at</span>
                  <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">The section shown when you open Caizen.</span>
                  <Combobox value={defaultLandingPage} onChange={value => { setDefaultLandingPage(value); localStorage.setItem('layout-default-landing-page', value); }} ariaLabel="Default landing page" className="mt-2" options={[
                    { value: 'dashboard', label: 'Dashboard' },
                    { value: 'lifehub', label: 'Life Hub' },
                    { value: 'health', label: 'Health' },
                    { value: 'balance', label: 'Money' },
                  ]} />
                </label>
            <SettingsSubheading id="settings-focus-group" title="Focus Mode" />
                <SettingSwitch
                  label="Focus Mode"
                  description="Temporarily show only the practical daily sections."
                  checked={focusMode}
                  onChange={setFocusMode}
                />
            <SettingsSubheading id="settings-dashboard-group" title="Visible dashboard cards" />
                <div role="group" aria-labelledby="settings-dashboard-group">
                  <p className="mt-1 text-xs font-normal leading-relaxed text-muted-foreground">Hide cards you do not use so the next useful action is easier to scan.</p>
                  <div className="mt-3 grid gap-x-4 sm:grid-cols-2">
                    {dashboardCards.map(([id, label]) => {
                      const checked = id === 'worthChecking'
                        ? dashboardVisibility.worthChecking ?? dashboardDetail === 'detailed'
                        : id === 'motivation'
                        ? dashboardVisibility.petCard !== false || dashboardVisibility.achievements !== false
                        : dashboardVisibility[id] !== false;
                      return (
                        <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border/40 px-1 text-sm">
                          <Checkbox checked={checked} onCheckedChange={value => setDashboardCardVisible(id, value === true)} className="border-border" />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
          </SettingsSection>

          <SettingsSection
            sectionId="settings-data"
            title="Data & Backup"
            description="Keep a portable copy, manage Cloud Backup, and review local data."
            active={activeSettingsSection === 'settings-data'}
          >
            <SettingsDataPanel transferFormat={transferFormat} onTransferFormatChange={onTransferFormatChange} onExport={onExport} onImport={onImport} onCloudSync={onCloudSync} onOpenTrash={onOpenTrash} cloudStatus={cloudStatus} storageUsed={storageUsed} deleteNotice={deleteNotice} onClearSection={() => { setDeleteConfirm(''); setDeleteNotice(''); setDangerDialog('section'); }} onClearAll={() => { setDeleteConfirm(''); setDeleteNotice(''); setDangerDialog('all'); }} />
          </SettingsSection>

          <SettingsSection sectionId="settings-help" title="Help & About" description="Find guidance and information about Caizen." active={activeSettingsSection === 'settings-help'}>
            <SettingsSubheading id="settings-guide-group" title="Guide & Tutorial" />
            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={onOpenGuide} className="settings-compact-action"><BookOpen className="mr-2 inline h-4 w-4" />Learn Caizen</button>
              <button type="button" onClick={onResetOnboarding} disabled={isDemoMode} className="settings-compact-action disabled:opacity-40"><RotateCcw className="mr-2 inline h-4 w-4" />Replay introduction</button>
            </div>

            <SettingsSubheading id="settings-about-group" title="About" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="settings-stat"><p className="text-xs text-muted-foreground">App version</p><p className="font-semibold">{APP_VERSION}</p></div>
            </div>

            <SettingsSubheading title="Data sources" description="Entertainment metadata and availability are provided by these services." />
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="settings-stat"><p className="text-xs text-muted-foreground">Anime & manga</p><p className="font-semibold">AniList</p></div>
              <div className="settings-stat"><p className="text-xs text-muted-foreground">Movies & television</p><p className="font-semibold">TMDB</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">This product uses the TMDB API but is not endorsed or certified by TMDB.</p></div>
              <div className="settings-stat"><p className="text-xs text-muted-foreground">Streaming availability</p><p className="font-semibold">JustWatch</p></div>
            </div>
          </SettingsSection>

          <SettingsSection sectionId="settings-advanced" title="Advanced" description="Less frequently used workspace controls." active={activeSettingsSection === 'settings-advanced'}>
            <SettingsSubheading id="settings-demo-group" title="Demo Mode" description="Demo Mode opens sample data. When real data exists, Caizen preserves it so you can return to it later." />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={onEnterDemo} disabled={isDemoMode} className="settings-compact-action">Enter Demo</button>
              <button type="button" onClick={onExitDemo} disabled={!isDemoMode} className="settings-compact-action disabled:opacity-40">Exit Demo</button>
              <button type="button" onClick={onResetDemo} disabled={!isDemoMode} className="settings-compact-action">Reset Demo</button>
            </div>
            <p className="mt-3 text-body-sm text-muted-foreground">Demo data version: {demoVersion}</p>
          </SettingsSection>
          </main>
        </div>
      </section>

      <Dialog open={Boolean(dangerDialog)} onOpenChange={open => !open && setDangerDialog(null)}>
        <DialogContent className="max-w-lg border-red-500/25" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-red-500 dark:text-red-300">
              {dangerDialog === 'all' ? 'Clear all workspace data?' : 'Clear section data?'}
            </DialogTitle>
            <DialogDescription>
              {dangerDialog === 'all'
                ? 'This removes profiles, records, and managed media from this device. It bypasses Recently Deleted and cannot be undone locally. Cloud Backup snapshots, account access, theme, preferences, and same-device recovery copies are preserved. Recovery copies contain structured data from before an import or migration.'
                : `Section: ${deleteSections.find(item => item.id === deleteSection)?.label}. Range: ${deleteMode === 'all' ? 'all dates' : `${deleteStart || 'beginning'} to ${deleteEnd || 'today'}`}. Affected items: ${affectedDeleteCount}. This bypasses Recently Deleted; the removed records cannot be restored there.`}
            </DialogDescription>
          </DialogHeader>
            {dangerDialog === 'section' && (
              <div className="mt-4 grid gap-3">
                <label className="settings-field">
                  Section
                  <Combobox value={deleteSection} onChange={setDeleteSection} options={deleteSections.map(section => ({ value: section.id, label: section.label }))} ariaLabel="Section to clear" className="mt-2" />
                </label>
                <label className="settings-field">
                  Range
                  <Combobox value={deleteMode} onChange={value => setDeleteMode(value as 'all' | 'range')} options={[{ value: 'all', label: 'All dates' }, { value: 'range', label: 'Date range' }]} ariaLabel="Date range mode" className="mt-2" />
                </label>
                {deleteMode === 'range' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <DatePicker label="Start date" value={deleteStart} onChange={setDeleteStart} />
                    <DatePicker label="End date" value={deleteEnd} onChange={setDeleteEnd} />
                  </div>
                )}
              </div>
            )}
            <FormField label="Type confirm">
              <Input value={deleteConfirm} onChange={event => setDeleteConfirm(event.target.value)} className="mt-2" placeholder="confirm" />
            </FormField>
            {deleteNotice && <p className="mt-3 text-xs font-bold text-red-500">{deleteNotice}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDangerDialog(null)}>Cancel</Button>
              <Button type="button" variant="destructive" onClick={dangerDialog === 'all' ? clearAllLocalData : runDeleteData}>{dangerDialog === 'all' ? 'Clear all local data' : deleteSections.find(item => item.id === deleteSection)?.actionLabel || 'Clear section data'}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
