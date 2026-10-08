'use client';
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
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
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import {
  restrictToHorizontalAxis,
} from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import {
  Boxes,
  BriefcaseBusiness,
  CalendarCheck,
  Command,
  Compass,
  Film,
  Flame,
  HeartPulse,
  Cloud,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  Music,
  Palette,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { requestWorkSetupLeave } from '@/lib/workhub/setup-navigation';
import { useCaizenMotionMode } from '@/hooks/use-caizen-motion-enabled';
import { getSectionDiscoveryMeta } from '@/lib/discovery/section-meta';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import CloudModalErrorBoundary from '@/components/modals/CloudModalErrorBoundary';
import type { PreparedImport } from '@/lib/storage/import-integrity';
import {
  type RecoverySnapshot,
} from '@/lib/storage/backup-repository';
import {
  loadAppState,
} from '@/lib/storage/app-repository';
import {
  deleteStoreValue,
} from '@/lib/storage/database';
import { STORES } from '@/lib/storage/schema';
import { listMediaAssets } from '@/lib/storage/media-repository';
import {
  listPendingMediaCleanupJobs,
  processPendingMediaCleanup,
  queueMediaCleanupForAssets,
} from '@/lib/storage/media-cleanup';
import { isAndroid } from '@/lib/platform';
import {
  DEMO_ONBOARDING_RETURN_KEY,
  ONBOARDING_PENDING_KEY,
  clearOnboardingDraft,
  normalizeOnboardingPriorities,
  orderTabsForOnboarding,
  primaryTabsForOnboarding,
  shouldShowOnboarding,
  type OnboardingDraft,
} from '@/lib/onboarding';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { readGuidePreferences, rememberFirstAction, rememberGuideDismissal } from '@/lib/discovery/guide-preferences';
import { loadOnboardingDraft } from '@/lib/onboarding';
import { SectionGuide } from '@/components/discovery/SectionGuide';
import { LearnCaizenDialog } from '@/components/discovery/LearnCaizenDialog';
import { useDemoSession } from '@/hooks/use-demo-session';
import { enterDemo, exitDemo, demoReturnLabel, updateDemoGuide, acknowledgeDemoReturn, type DemoOrigin } from '@/lib/demo/demo-session';
import { assertRealWorkspace } from '@/lib/storage/workspace-fence';
import TaxonomyHub from '@/components/common/TaxonomyHub';
import {
  DEMO_BACKUP_KEY,
  DEMO_COMPASS_DISMISSED_KEY,
  DEMO_CONTENT_VERSION,
  DEMO_ENTRY_SECTION_KEY,
  DEMO_LOADED_AT_KEY,
  DEMO_MODE_KEY,
  DEMO_PROFILE_DISPLAY_NAME,
  DEMO_VERSION_KEY,
  isDemoEntrySection,
  isDemoModeActive,
} from '@/lib/demo/demo-workspace';
import {
  isGlobalSearchResultAvailable,
  searchProfileRecords,
} from '@/lib/global-search';
import {
  getProfileBoundSectionRequest,
  type SectionFeatureRequest,
} from '@/lib/section-feature-request';
import {
  isMoneyView,
  parseBalanceViewHash,
  type MoneyView,
} from '@/lib/balance-navigation';
import { recordRootSection } from '@/lib/native/root-nav-history';
import {
  DEFAULT_PRIMARY_NAV_TABS,
  sanitizePrimaryNavTabs,
} from '@/lib/native/primary-nav-config';
import { isTextEditingTarget } from '@/lib/dom/is-text-editing-target';
import { useAnimatedOverlayClose } from '@/hooks/use-animated-overlay-close';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion-preference';
import { toLocalDateKey } from '@/lib/utils';
import Dashboard from '@/components/sections/Dashboard';
import {
  ThemeToggle,
} from '@/components/ThemeToggle';
import { useTheme } from '@/lib/theme';
import { getMusicArtwork, useMusicPlayer } from '@/lib/music-player';
import { getCurrencySelectOptions } from '@/lib/currency';
import { getMediaUpdateCount } from '@/lib/entertainment/presentation';
import { notify } from '@/lib/feedback/notify';
import {
  loadDashboardPreferences,
  saveDashboardPreferences,
  type DashboardPreferences,
} from '@/lib/dashboard-preferences';
import type { QuickAddKind, QuickAddRequest } from '@/lib/quick-add';
import {
  getLastSuccessfulBackupTimestamp,
  invalidateCloudSession,
  resumeCloudMediaSession,
} from '@/lib/cloud-backup';
import { CloudOperationBusyError, getCloudOperation, isCloudManagementOpen, subscribeCloudOperation } from '@/lib/cloud-operation';
import { clearCloudMediaCache } from '@/lib/storage/media-cache';
import { consumeGoogleAuthCompletion, GOOGLE_AUTH_EVENT } from '@/lib/cloud-google-auth';
import {
  discoverCloudRecovery,
  recordCloudRecoveryCandidateDecision,
  type CloudRecoveryCandidate,
  type CloudRecoveryDiscovery,
} from '@/lib/cloud-recovery';
import {
  getCloudRecoveryFingerprint,
  hasCloudRecoveryDecision,
} from '@/lib/cloud-recovery-state';
import { getStorageEstimateLabel } from '@/lib/storage/storage-usage';
import {
  getSupabaseClient,
  isCloudSyncConfigured,
  subscribeToCloudProfileBackup,
} from '@/lib/supabase';
import ProfileSwitcher from '@/components/layout/ProfileSwitcher';
/* MODALS */
import PetModal, { PetButton } from '@/components/pets/PetCompanion';
import ImportPreviewScreen from '@/components/storage/ImportPreviewScreen';
import {
  SectionErrorBoundary,
  SectionLoadingFallback,
} from '@/components/common/SectionBoundary';
import { OverflowTooltip } from '@/components/common/OverflowTooltip';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
function SectionLoading() {
  return <SectionLoadingFallback />;
}
const BalanceSection = dynamic(
  () => import('@/components/sections/BalanceSection'),
  { loading: SectionLoading },
);
const InventorySection = dynamic(
  () => import('@/components/sections/InventorySection'),
  { loading: SectionLoading },
);
const SkincareSection = dynamic(
  () => import('@/components/sections/SkincareSection'),
  { loading: SectionLoading },
);
const HealthSection = dynamic(
  () => import('@/components/sections/HealthSection'),
  { loading: SectionLoading },
);
const EntertainmentSection = dynamic(
  () => import('@/components/sections/EntertainmentSection'),
  { loading: SectionLoading },
);
const MusicSection = dynamic(
  () => import('@/components/sections/MusicSection'),
  { loading: SectionLoading },
);
const LifeHubSection = dynamic(
  () => import('@/components/sections/LifeHubSection'),
  { loading: SectionLoading },
);
const WorkHubSection = dynamic(
  () => import('@/components/sections/WorkHubSection'),
  { loading: SectionLoading },
);
const PersonalVaultSection = dynamic(
  () => import('@/components/sections/PersonalVaultSection'),
  { loading: SectionLoading },
);
const BackupManagerModal = dynamic(
  () => import('@/components/modals/BackupManagerModal'),
);
const CloudSyncModal = dynamic(
  () => import('@/components/modals/CloudSyncModal'),
);
const CloudRecoveryModal = dynamic(
  () => import('@/components/modals/CloudRecoveryModal'),
);
const InventoryModal = dynamic(
  () => import('@/components/modals/InventoryModal'),
);
const SkincareModal = dynamic(
  () => import('@/components/modals/SkincareModal'),
);
const SupplementModal = dynamic(
  () => import('@/components/modals/SupplementModal'),
);
const EntertainmentModal = dynamic(
  () => import('@/components/modals/EntertainmentModal'),
);
const MusicModal = dynamic(
  () => import('@/components/modals/MusicModal'),
);
const QuickAddModalHost = dynamic(
  () => import('@/components/common/QuickAddModalHost'),
);
const GlobalTrashModal = dynamic(
  () => import('@/components/modals/GlobalTrashModal'),
);
const AndroidSettingsHub = dynamic(
  () => import('@/components/native/AndroidSettingsHub'),
  { loading: SectionLoading },
);
const AndroidMoreSheet = dynamic(
  () =>
    import('@/components/native/AndroidMoreSheet').then(
      (module) => module.AndroidMoreSheet,
    ),
  { loading: SectionLoading },
);
const MobileTabManager = dynamic(
  () =>
    import('@/components/settings/SettingsHub').then(
      module => module.MobileTabManager,
    ),
  { loading: SectionLoading },
);
const SettingsHub = dynamic(
  () =>
    import('@/components/settings/SettingsHub').then(
      module => module.SettingsHub,
    ),
  { loading: SectionLoading },
);
const AppearanceSettings = dynamic(
  () =>
    import('@/components/settings/AppearanceSettings').then(
      module => module.AppearanceSettings,
    ),
  { loading: SectionLoading },
);
/* =========================================
   TAB CONFIG
========================================= */
const tabs = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutGrid,
    accent: 'from-amber-500 to-yellow-300',
  },
  {
    id: 'balance',
    label: 'Money',
    icon: Wallet,
    accent: 'from-teal-600 to-cyan-500',
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Boxes,
    accent: 'from-amber-500 to-yellow-400',
  },
  {
    id: 'skincare',
    label: 'Skincare',
    icon: Sparkles,
    accent: 'from-teal-600 to-cyan-500',
  },
  {
    id: 'health',
    label: 'Health',
    icon: HeartPulse,
    accent: 'from-teal-600 to-emerald-400',
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    icon: Film,
    accent: 'from-amber-500 to-teal-500',
  },
  {
    id: 'music',
    label: 'Music',
    icon: Music,
    accent: 'from-teal-600 to-amber-400',
  },
  {
    id: 'lifehub',
    label: 'Life Hub',
    icon: CalendarCheck,
    accent: 'from-teal-600 to-emerald-400',
  },
  {
    id: 'workhub',
    label: 'Work Hub',
    icon: BriefcaseBusiness,
    accent: 'from-teal-600 to-cyan-500',
  },
  {
    id: 'personalhub',
    label: 'Personal Vault',
    icon: ShieldCheck,
    accent: 'from-amber-500 to-teal-500',
  },
] as const;
const APP_STORAGE_KEY = 'asset-planning-app-data';
const SETUP_COMPLETED_KEY = 'life-manager-setup-completed';
const IS_CAPACITOR_BUILD =
  process.env.NEXT_PUBLIC_CAPACITOR_BUILD === '1';

async function waitForOnboardingProfileSave(
  profileId: string,
  expected: { name: string; baseCurrency?: string; currency?: string },
): Promise<void> {
  const matchesSavedProfile = async () => {
    const saved = await loadAppState();
    const profile = saved?.profiles.find(item => item.id === profileId);
    return Boolean(
      profile &&
      profile.name === expected.name &&
      (expected.baseCurrency === undefined || profile.baseCurrency === expected.baseCurrency) &&
      (expected.currency === undefined || profile.currency === expected.currency),
    );
  };
  if (await matchesSavedProfile()) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('The profile could not be confirmed in local storage. Try again.')), 12_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('caizen:local-save-complete', onSave);
      window.removeEventListener('caizen-storage-error', onError);
    };
    const finish = (error?: Error) => { cleanup(); if (error) reject(error); else resolve(); };
    const onSave = (event: Event) => {
      const changed = (event as CustomEvent<{ changedProfileIds?: string[] }>).detail?.changedProfileIds;
      if (!changed?.includes(profileId)) return;
      void matchesSavedProfile().then(saved => { if (saved) finish(); }).catch(error => finish(error));
    };
    const onError = (event: Event) => finish(new Error(String((event as CustomEvent).detail || 'The profile could not be saved.')));
    window.addEventListener('caizen:local-save-complete', onSave);
    window.addEventListener('caizen-storage-error', onError);
    void matchesSavedProfile().then(saved => { if (saved) finish(); }).catch(error => finish(error));
  });
}
function getShortTabLabel(label: string) {
  if (label === 'Dashboard') return 'Dash';
  if (label === 'Entertainment') return 'Media';
  if (label === 'Inventory') return 'Items';
  if (label === 'Skincare') return 'Skin';
  if (label === 'Personal Vault') return 'Vault';
  return label;
}
function toDateKey(value: unknown) {
  if (!value) return null;
  return toLocalDateKey(value as Date | string | number) || null;
}
function getConsecutiveDayStreak(values: unknown[]) {
  const dateKeys = new Set(
    values
      .map(toDateKey)
      .filter((value): value is string => Boolean(value))
  );
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (dateKeys.has(toDateKey(cursor) || '')) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
/* =========================================
   PAGE
========================================= */
function NavUpdateBadge({ count, active = false }: { count: number; active?: boolean }) {
  if (count <= 0) return null;
  return (
    <span className={`nav-update-badge ${active ? 'nav-update-badge-active' : ''}`} aria-hidden="true">
      {count > 9 ? '9+' : count}
    </span>
  );
}

function SortableTab({
  tab,
  activeTab,
  setActiveTab,
  setContextTab,
  setContextPosition,
  setHiddenMenuPosition,
  showStreakGlow,
  streakCount = 0,
  updateCount = 0,
}: {
  setHiddenMenuPosition: (position: { x: number; y: number } | null) => void;
  tab: {
    id: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    accent: string;
  };
  activeTab: string;
  setActiveTab: (id: string) => void;
  setContextTab: (id: string | null) => void;
  setContextPosition: (position: { x: number; y: number }) => void;
  showStreakGlow?: boolean;
  streakCount?: number;
  updateCount?: number;
}) {
  const motionMode = useCaizenMotionMode();
  const motionEnabled = motionMode === 'full' || motionMode === 'android';
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tab.id,
    disabled: tab.id === 'dashboard',
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 999 : undefined,
  };
  const Icon = tab.icon;
  const hasStreakEffect = Boolean(showStreakGlow && streakCount > 0);
  const hasEntertainmentUpdates = tab.id === 'entertainment' && updateCount > 0;
  const navLabel = [
    tab.label,
    hasStreakEffect ? `${streakCount} day streak` : null,
    hasEntertainmentUpdates ? `${updateCount} ${updateCount === 1 ? 'update' : 'updates'}` : null,
  ].filter(Boolean).join(', ');
  return (
    <Tooltip delayDuration={300}><TooltipTrigger asChild><button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      type="button"
      data-active={activeTab === tab.id}
      data-nav-tab-id={tab.id}
      aria-current={activeTab === tab.id ? 'page' : undefined}
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
        if (tab.id === 'dashboard') return;
        setHiddenMenuPosition(null);
        setContextTab(tab.id);
        setContextPosition({
          x: event.clientX,
          y: event.clientY,
        });
      }}
      onClick={() => {
        setContextTab(null);
        setHiddenMenuPosition(null);
        setActiveTab(tab.id);
      }}
      className={`
        caizen-nav-item
        whitespace-nowrap
        relative
        transition-all
        duration-150
        ${isDragging
          ? 'opacity-0 pointer-events-none'
          : ''
        }
        ${activeTab === tab.id ? 'caizen-nav-item-active' : ''}
        ${hasStreakEffect ? 'nav-streak-glow' : ''}
      `}
      aria-label={navLabel}
    >
      <span className="relative z-10 inline-flex items-center gap-2">
        <Icon
          className={`h-4 w-4 ${activeTab === tab.id
            ? 'text-primary'
            : 'text-muted-foreground'
            }`}
        />
        <span className="caizen-nav-indicator-anchor relative inline-flex">
          {activeTab === tab.id ? (
            <motion.span
              aria-hidden="true"
              layoutId="caizen-main-nav-indicator"
              layout={motionEnabled}
              initial={false}
              transition={motionMode === 'full'
                ? { type: 'spring', stiffness: 620, damping: 44, mass: 0.58 }
                : motionMode === 'android'
                  ? { type: 'spring', stiffness: 820, damping: 48, mass: 0.45 }
                  : { duration: 0 }}
              className="caizen-main-nav-indicator"
            />
          ) : null}
          {tab.label}
        </span>
        <NavUpdateBadge count={hasEntertainmentUpdates ? updateCount : 0} active={activeTab === tab.id} />
        {hasStreakEffect && (
          <Tooltip><TooltipTrigger asChild><span
            className={`nav-streak-badge ${activeTab === tab.id ? 'nav-streak-badge-active' : ''}`}
          >
            <Flame className="h-3 w-3" />
          </span></TooltipTrigger><TooltipContent>{`${tab.label} streak: ${streakCount} ${streakCount === 1 ? 'day' : 'days'}`}</TooltipContent></Tooltip>
        )}
      </span>
    </button></TooltipTrigger><TooltipContent variant="navigation" sideOffset={6}>{getSectionDiscoveryMeta(tab.id)?.summary}</TooltipContent></Tooltip>
  );
}

function NavTabDragPreview({
  tab,
  activeTab,
  showStreakGlow,
  streakCount = 0,
  updateCount = 0,
}: {
  tab: {
    id: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    accent: string;
  };
  activeTab: string;
  showStreakGlow?: boolean;
  streakCount?: number;
  updateCount?: number;
}) {
  const Icon = tab.icon;
  const hasStreakEffect = Boolean(showStreakGlow && streakCount > 0);
  const hasEntertainmentUpdates = tab.id === 'entertainment' && updateCount > 0;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      className={`caizen-nav-item caizen-nav-item-drag-preview whitespace-nowrap relative rounded-2xl border border-border bg-card text-foreground ${activeTab === tab.id ? 'caizen-nav-item-active' : ''} ${hasStreakEffect ? 'nav-streak-glow' : ''}`}
    >
      <span className="relative z-10 inline-flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        {tab.label}
        <NavUpdateBadge count={hasEntertainmentUpdates ? updateCount : 0} active={activeTab === tab.id} />
        {hasStreakEffect && <span className="nav-streak-badge"><Flame className="h-3 w-3" /></span>}
      </span>
    </button>
  );
}
function GameLogo() {
  const { theme } = useTheme();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => (
    typeof document !== 'undefined' && document.documentElement.dataset.resolvedTheme === 'dark'
      ? 'dark'
      : 'light'
  ));
  useEffect(() => {
    const syncResolvedTheme = () => {
      setResolvedTheme(document.documentElement.dataset.resolvedTheme === 'dark' ? 'dark' : 'light');
    };
    syncResolvedTheme();
    window.addEventListener('caizen:theme-resolved', syncResolvedTheme);
    return () => window.removeEventListener('caizen:theme-resolved', syncResolvedTheme);
  }, [theme]);
  return (
    <div className="caizen-brand-logo">
      <img
        src={resolvedTheme === 'dark'
          ? '/icons/caizen-primary-dark-3000.png'
          : '/icons/caizen-primary-light-3000.png'}
        alt="Caizen"
        className="block h-auto w-full"
      />
    </div>
  );
}
const formatSyncTime = (value?: string | null) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
};
export default function HomePage() {
  const appContext = useAppContext();
  const entertainmentUpdateCount = useMemo(
    () => getMediaUpdateCount(appContext.mediaItems || []),
    [appContext.mediaItems],
  );
  const reduceMotion = useReducedMotionPreference();
  const currentProfile = appContext.profiles.find(profile => profile.id === appContext.currentProfileId);
  const currentProfileRef = useRef(currentProfile);
  currentProfileRef.current = currentProfile;
  const {
    theme,
    darkStyle,
    lightStyle,
    scheme,
    backgroundImage,
    backgroundOpacity,
    density,
    animationPreference,
    useAlbumArtBackground,
    setTheme,
    setDarkStyle,
    setLightStyle,
    setScheme,
    setBackgroundImage,
    setBackgroundOpacity,
    setDensity,
    setAnimationPreference,
    setUseAlbumArtBackground,
  } = useTheme();
  const { activeItem } = useMusicPlayer();
  const activeArtwork = getMusicArtwork(activeItem);
  const [activeTab, setActiveTabState] =
    useState('dashboard');
  const activeTabRef = useRef(activeTab);
  const sectionLeavePendingRef = useRef(false);
  const setActiveTab = useCallback((nextTab: string) => {
    const currentTab = activeTabRef.current;
    if (currentTab === 'workhub' && nextTab !== currentTab) {
      if (sectionLeavePendingRef.current) return;
      sectionLeavePendingRef.current = true;
      void requestWorkSetupLeave('section-navigation').then(allow => {
        sectionLeavePendingRef.current = false;
        if (!allow) return;
        activeTabRef.current = nextTab;
        setActiveTabState(nextTab);
      });
      return;
    }
    activeTabRef.current = nextTab;
    setActiveTabState(nextTab);
  }, []);
  const [lastBalanceView, setLastBalanceView] =
    useState<MoneyView>('overview');
  const [balanceUrlReady, setBalanceUrlReady] =
    useState(IS_CAPACITOR_BUILD);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    recordRootSection(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (IS_CAPACITOR_BUILD) {
      setBalanceUrlReady(true);
      return;
    }

    const syncBalanceLocation = () => {
      const view = parseBalanceViewHash(window.location.hash);
      if (!view) return;
      setLastBalanceView(view);
      setActiveTab('balance');
    };

    syncBalanceLocation();
    setBalanceUrlReady(true);
    window.addEventListener('hashchange', syncBalanceLocation);
    window.addEventListener('popstate', syncBalanceLocation);
    return () => {
      window.removeEventListener('hashchange', syncBalanceLocation);
      window.removeEventListener('popstate', syncBalanceLocation);
    };
  }, []);

  useEffect(() => {
    if (
      !balanceUrlReady ||
      IS_CAPACITOR_BUILD ||
      activeTab === 'balance' ||
      typeof window === 'undefined'
    ) {
      return;
    }

    if (!parseBalanceViewHash(window.location.hash)) return;
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }, [activeTab, balanceUrlReady]);
  const [androidPresentation, setAndroidPresentation] =
    useState(false);
  const [nativeConnected, setNativeConnected] = useState(true);
  const [showAddModal, setShowAddModal] =
    useState(false);
  const [quickAddRequest, setQuickAddRequest] =
    useState<QuickAddRequest | null>(null);
  const [activeSupplementId, setActiveSupplementId] =
    useState<string | null>(null);
  const [hiddenTabs, setHiddenTabs] =
    useState<string[]>([]);
  const [contextTab, setContextTab] =
    useState<string | null>(null);
  const [contextPosition, setContextPosition] =
    useState({
      x: 0,
      y: 0,
    });
  const [hiddenMenuPosition, setHiddenMenuPosition] =
    useState<{ x: number; y: number } | null>(null);
  const [tabOrder, setTabOrder] =
    useState<string[]>(
      tabs.map(tab => tab.id)
    );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const desktopNavScrollRef = useRef<HTMLDivElement>(null);
  const [desktopNavScrollState, setDesktopNavScrollState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });
  const [primaryNavTabs, setPrimaryNavTabs] =
    useState<string[]>(DEFAULT_PRIMARY_NAV_TABS);
  const [showBackupModal, setShowBackupModal] =
    useState(false);
  const [showCloudSyncModal, setShowCloudSyncModal] =
    useState(false);
  const [cloudRecoveryOffer, setCloudRecoveryOffer] = useState<{
    discovery: CloudRecoveryDiscovery;
    candidate: CloudRecoveryCandidate;
  } | null>(null);
  const [cloudContinuityNotice, setCloudContinuityNotice] = useState<{
    discovery: CloudRecoveryDiscovery;
    candidate: CloudRecoveryCandidate;
  } | null>(null);
  const [cloudSignedIn, setCloudSignedIn] = useState(false);
  const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
  const cloudSyncRunningRef = useRef(false);
  const cloudSyncPendingRef = useRef(false);
  const cloudSyncTimerRef = useRef<number | null>(null);
  const cloudAuthGenerationRef = useRef(0);
  const cloudRecoveryNoticeKeysRef = useRef(new Set<string>());
  const cloudAvailabilityOutageScopesRef = useRef(new Set<string>());
  const cloudAvailabilityEpisodesRef = useRef(new Map<string, number>());
  const cloudRetryRef = useRef<(() => void) | null>(null);
  const currentProfileIdRef = useRef(appContext.currentProfileId);
  currentProfileIdRef.current = appContext.currentProfileId;
  const [showMobileTools, setShowMobileTools] =
    useState(false);
  const mobileToolsPanelRef = useRef<HTMLDivElement>(null);
  const [showAppearancePanel, setShowAppearancePanel] =
    useState(false);
  const appearancePanelRef = useRef<HTMLElement>(null);
  const [showSettingsHub, setShowSettingsHub] =
    useState(false);
  const [defaultLandingPage, setDefaultLandingPage] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const stored = localStorage.getItem('layout-default-landing-page');
    return stored === 'journal' ? 'lifehub' : stored || 'dashboard';
  });
  const [showTrashModal, setShowTrashModal] =
    useState(false);
  const [showPetModal, setShowPetModal] =
    useState(false);
  const [mochiSpotlight, setMochiSpotlight] = useState<{ id: string; profileId: string } | null>(null);
  const [showCommandPalette, setShowCommandPalette] =
    useState(false);
  const [commandSearch, setCommandSearch] =
    useState('');
  const [commandSelectedIndex, setCommandSelectedIndex] =
    useState(0);
  const commandPanelRef = useRef<HTMLElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  const [showWelcome, setShowWelcome] =
    useState(false);
  const [onboardingProfileReady, setOnboardingProfileReady] = useState(false);
  const [onboardingPreparationError, setOnboardingPreparationError] = useState('');
  const [onboardingPreparationAttempt, setOnboardingPreparationAttempt] = useState(0);
  const [onboardingCloudReady, setOnboardingCloudReady] = useState(false);
  const [cloudAuthMessage, setCloudAuthMessage] = useState('');
  const [isDemoMode, setIsDemoMode] =
    useState(false);
  const demoSession = useDemoSession();
  const [appNotice, setAppNotice] =
    useState<{
      title: string;
      message: string;
    } | null>(null);
  const [sectionHelpOpen, setSectionHelpOpen] = useState(false);
  const [firstActionSection, setFirstActionSection] = useState<string | null>(null);
  const demoReturnApplied = useRef(false);
  const [demoCompassOpen, setDemoCompassOpen] = useState(false);
  const demoCompassTriggerRef = useRef<HTMLButtonElement>(null);
  const demoCompassRestoreFocusRef = useRef(false);
  const demoCompassFocusHeadingRef = useRef(false);
  const [demoTransitionBusy, setDemoTransitionBusy] = useState(false);
  const demoTransitionRef = useRef(false);
  const demoTransitionPanelRef = useRef<HTMLElement>(null);

  const dismissDemoCompass = useCallback(() => {
    localStorage.setItem(DEMO_COMPASS_DISMISSED_KEY, 'true');
    setDemoCompassOpen(false);
    void updateDemoGuide({ open: false });
  }, []);

  const reopenDemoCompass = useCallback(() => {
    localStorage.setItem(DEMO_COMPASS_DISMISSED_KEY, 'false');
    demoCompassRestoreFocusRef.current = true;
    if (demoCompassOpen) {
      document.getElementById('caizen-section-guide-title')?.focus({ preventScroll: true });
      return;
    }
    demoCompassFocusHeadingRef.current = true;
    setDemoCompassOpen(true);
    void updateDemoGuide({ open: true });
  }, [demoCompassOpen]);

  useEffect(() => {
    if (demoCompassOpen) {
      if (demoCompassFocusHeadingRef.current) {
        demoCompassFocusHeadingRef.current = false;
        document.getElementById('caizen-section-guide-title')?.focus({ preventScroll: true });
      }
      return;
    }
    if (demoCompassRestoreFocusRef.current) {
      demoCompassRestoreFocusRef.current = false;
      window.requestAnimationFrame(() => demoCompassTriggerRef.current?.focus({ preventScroll: true }));
    }
  }, [demoCompassOpen]);
  const [showUserGuide, setShowUserGuide] =
    useState(false);
  const [openGuideAfterSettings, setOpenGuideAfterSettings] = useState(false);
  const guideReturnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (showSettingsHub || !openGuideAfterSettings) return;
    // Settings has unmounted and released its focus trap before Radix opens.
    // Its existing focus-restoration frame runs before this frame.
    const frame = window.requestAnimationFrame(() => {
      guideReturnFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setOpenGuideAfterSettings(false);
      setShowUserGuide(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showSettingsHub, openGuideAfterSettings]);
  const [focusMode, setFocusMode] =
    useState(false);
  const [confirmAction, setConfirmAction] =
    useState<{
      title: string;
      message: string;
      confirmText: string;
      isDangerous?: boolean;
      onConfirm: () => void;
    } | null>(null);
  const [importPreview, setImportPreview] =
    useState<PreparedImport | null>(null);
  const [importMode, setImportMode] =
    useState<'new-profiles' | 'merge' | 'replace'>('new-profiles');
  const [importFileName, setImportFileName] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importRecovery, setImportRecovery] = useState<RecoverySnapshot | null>(null);
  const [compactMobileMode, setCompactMobileMode] =
    useState(() =>
      typeof window !== 'undefined'
        ? localStorage.getItem('layout-compact-mobile-mode') === 'true'
        : false
    );
  const [darkModeAnimation, setDarkModeAnimation] =
    useState(() =>
      typeof window !== 'undefined'
        ? localStorage.getItem('layout-dark-mode-animation') || 'off'
        : 'off'
    );
  const [dashboardPreferences, setDashboardPreferences] =
    useState<DashboardPreferences>(() => loadDashboardPreferences(appContext.currentProfileId));
  useEffect(() => {
    setDashboardPreferences(loadDashboardPreferences(appContext.currentProfileId));
  }, [appContext.currentProfileId]);
  const setDashboardPreferencesPersisted = useCallback(
    (next: DashboardPreferences) => {
      setDashboardPreferences(next);
      saveDashboardPreferences(next, appContext.currentProfileId);
    },
    [appContext.currentProfileId],
  );
  const [settingsStorageUsed, setSettingsStorageUsed] = useState('Stored on this device');
  useEffect(() => {
    if (!appContext.isHydrated) return;

    let cancelled = false;
    const refreshStorageEstimate = () => {
      void getStorageEstimateLabel().then(label => {
        if (!cancelled) setSettingsStorageUsed(label);
      });
    };

    refreshStorageEstimate();
    window.addEventListener('caizen:local-save-complete', refreshStorageEstimate);
    return () => {
      cancelled = true;
      window.removeEventListener('caizen:local-save-complete', refreshStorageEstimate);
    };
  }, [appContext.isHydrated]);
  const settingsLastBackup = currentProfile && cloudAccountId
    ? getLastSuccessfulBackupTimestamp({ profileId: currentProfile.id, userId: cloudAccountId })
    : null;
  const cloudStatusSummary = !isCloudSyncConfigured
    ? 'Unavailable'
    : cloudRecoveryOffer
      ? 'Needs attention'
      : !cloudSignedIn
        ? 'Signed out'
        : settingsLastBackup
          ? `Backed up with date: ${new Date(settingsLastBackup).toLocaleDateString()}`
          : 'Signed in / not backed up';
  const dashboardCards = [
    ['todayList', 'Today'],
    ['upcoming', 'Upcoming'],
    ['lifePulse', 'Life Pulse'],
    ['motivation', 'Milestones'],
    ['weeklyReflection', 'Weekly Reflection'],
    ['worthChecking', 'Worth Checking'],
    ['insights', 'Insights'],
  ] as const;
  const [showNavStreakGlow, setShowNavStreakGlow] =
    useState(() =>
      typeof window !== 'undefined'
        ? localStorage.getItem('layout-show-streak-glow') !== 'false'
        : true
    );
  const [showLastSavedTime, setShowLastSavedTime] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('layout-show-last-updated') !== 'false' : true
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  useEffect(() => {
    const profileId = appContext.currentProfileId;
    const refresh = () => {
      setShowLastSavedTime(localStorage.getItem('layout-show-last-updated') !== 'false');
      setLastSavedAt(profileId ? localStorage.getItem(`life-manager-local-modified-at:${profileId}`) : null);
    };
    const onSave = (event: Event) => {
      const detail = (event as CustomEvent<{ changedProfileIds?: string[] }>).detail;
      if (profileId && detail?.changedProfileIds?.includes(profileId)) refresh();
    };
    refresh();
    window.addEventListener('caizen:local-save-complete', onSave);
    window.addEventListener('life-manager:layout-settings', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('caizen:local-save-complete', onSave);
      window.removeEventListener('life-manager:layout-settings', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [appContext.currentProfileId]);
  const [openAddFoodSignal, setOpenAddFoodSignal] =
    useState(0);
  const [openLifeTaskSignal, setOpenLifeTaskSignal] =
    useState(0);
  const [openWorkNoteSignal, setOpenWorkNoteSignal] =
    useState(0);
  const [sectionFeatureRequest, setSectionFeatureRequest] =
    useState<SectionFeatureRequest | null>(null);
  const sectionFeatureRequestSignalRef = useRef(0);
  const sectionRequestProfileIdRef = useRef(appContext.currentProfileId);
  const nextSectionFeatureRequestSignal = () => {
    sectionFeatureRequestSignalRef.current += 1;
    return sectionFeatureRequestSignalRef.current;
  };
  // Each section is fully unmounted when the active tab or profile changes (see
  // renderActiveSection), so its own modal state (e.g. LifeHubSection's
  // routine editor) already clears itself. But sectionFeatureRequest lives
  // here in the parent and otherwise stays set after being consumed, so
  // remounting the section it targeted (e.g. navigating away and back to
  // Life Hub) replays the same open-record request and reopens a stale
  // modal. Clearing it once the active tab is no longer its target section
  // prevents that replay without touching any section's own modal state.
  useEffect(() => {
    setSectionFeatureRequest(current =>
      current && current.section !== activeTab ? null : current,
    );
  }, [activeTab]);
  useEffect(() => {
    const previousProfileId = sectionRequestProfileIdRef.current;
    if (previousProfileId && previousProfileId !== appContext.currentProfileId) {
      setSectionFeatureRequest(null);
    }
    sectionRequestProfileIdRef.current = appContext.currentProfileId;
  }, [appContext.currentProfileId]);
  useEffect(() => {
    setQuickAddRequest(null);
  }, [appContext.currentProfileId]);
  const closeCommandPalette = () => {
    setShowCommandPalette(false);
    setCommandSearch('');
  };
  const {
    close: closeCommandPaletteAnimated,
    isClosing: commandPaletteClosing,
  } = useAnimatedOverlayClose({
    isOpen: showCommandPalette,
    onClose: closeCommandPalette,
  });
  const {
    close: closeAppearancePanel,
    isClosing: appearancePanelClosing,
  } = useAnimatedOverlayClose({
    isOpen: showAppearancePanel,
    onClose: () => setShowAppearancePanel(false),
  });
  const {
    close: closeMobileTools,
    isClosing: mobileToolsClosing,
  } = useAnimatedOverlayClose({
    isOpen: showMobileTools,
    onClose: () => setShowMobileTools(false),
  });
  useEffect(() => {
    const syncLayoutSettings = () => {
      setShowNavStreakGlow(
        localStorage.getItem('layout-show-streak-glow') !== 'false'
      );
    };
    window.addEventListener('storage', syncLayoutSettings);
    window.addEventListener('life-manager:layout-settings', syncLayoutSettings);
    return () => {
      window.removeEventListener('storage', syncLayoutSettings);
      window.removeEventListener('life-manager:layout-settings', syncLayoutSettings);
    };
  }, []);
  const markSetupComplete = () => {
    const previousCompleted = localStorage.getItem(SETUP_COMPLETED_KEY);
    try {
      localStorage.setItem(SETUP_COMPLETED_KEY, 'true');
      localStorage.removeItem(ONBOARDING_PENDING_KEY);
      if (localStorage.getItem(ONBOARDING_PENDING_KEY) !== null) {
        throw new Error('Onboarding status could not be saved. Try again.');
      }
    } catch (error) {
      try {
        if (previousCompleted === null) localStorage.removeItem(SETUP_COMPLETED_KEY);
        else localStorage.setItem(SETUP_COMPLETED_KEY, previousCompleted);
        localStorage.setItem(ONBOARDING_PENDING_KEY, 'true');
      } catch { /* Keep the original storage error for inline retry. */ }
      throw error;
    }
  };
  const completeSetup = () => {
    markSetupComplete();
    clearOnboardingDraft();
    setShowWelcome(false);
    setActiveTab('dashboard');
  };
  const completeOnboarding = async (draft: OnboardingDraft) => {
    if (appContext.currentProfileId !== draft.profileId) {
      throw new Error('The active profile changed. Reopen onboarding to continue.');
    }
    const profile = currentProfileRef.current;
    if (!profile) throw new Error('The active profile is unavailable.');
    if (draft.mode === 'fresh' && appContext.profiles.length !== 1) {
      throw new Error('This workspace now has multiple profiles. Continue from Settings instead.');
    }
    const name = draft.mode === 'replay' ? profile.name : draft.name.trim() || profile.name;
    const currency = getCurrencySelectOptions().some(option => option.value === draft.currency)
      ? draft.currency
      : profile.baseCurrency || profile.currency || 'PHP';
    if (draft.mode === 'fresh') appContext.updateProfile(profile.id, { name, baseCurrency: currency, currency });
    await waitForOnboardingProfileSave(profile.id, draft.mode === 'fresh'
      ? { name, baseCurrency: currency, currency }
      : { name });
    if (currentProfileIdRef.current !== draft.profileId) {
      throw new Error('The active profile changed before onboarding finished.');
    }

    const priorities = normalizeOnboardingPriorities(draft.priorities);
    if (draft.mode === 'fresh' && draft.customizeNavigation && priorities.length) {
      const nextOrder = orderTabsForOnboarding(tabOrder, priorities);
      const nextPrimary = sanitizePrimaryNavTabs(
        primaryTabsForOnboarding(priorities),
        tabs.map(tab => tab.id),
      );
      localStorage.setItem('tab-order', JSON.stringify(nextOrder));
      localStorage.setItem('primary-nav-tabs', JSON.stringify(nextPrimary));
      if (localStorage.getItem('tab-order') !== JSON.stringify(nextOrder) ||
          localStorage.getItem('primary-nav-tabs') !== JSON.stringify(nextPrimary)) {
        throw new Error('Navigation choices could not be saved. Try again.');
      }
      setTabOrder(nextOrder);
      setPrimaryNavTabs(nextPrimary);
    }
    await clearOnboardingDraft(profile.id, draft.mode);
    completeSetup();
    const destination = priorities[0] || 'dashboard';
    setActiveTab(destination); setFirstActionSection(destination);
    void rememberFirstAction(profile.id, destination).catch(() => undefined);
  };
  useEffect(() => {
    if (!appContext.currentProfileId || isDemoMode) return;
    let cancelled = false;
    setSectionHelpOpen(false); setFirstActionSection(null);
    void readGuidePreferences(appContext.currentProfileId).then(value => { if (!cancelled) setFirstActionSection(value.firstActionSection ?? null); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [appContext.currentProfileId, isDemoMode]);
  const dismissSectionHelp = () => {
    void rememberGuideDismissal(appContext.currentProfileId, activeTab).catch(() => undefined);
    setSectionHelpOpen(false);
    setFirstActionSection(null);
    // The learning trigger disappears too, so return focus to the current area.
    window.requestAnimationFrame(() => document.getElementById('caizen-section-content')?.focus());
  };
  const completeRestoredOnboarding = () => {
    if (localStorage.getItem(ONBOARDING_PENDING_KEY) !== 'true') return;
    markSetupComplete();
    clearOnboardingDraft();
    setShowWelcome(false);
  };
  const requestResetOnboarding = () => {
    if (isDemoMode) return;
    setConfirmAction({
      title: 'Replay the introduction?',
      message: 'Revisit the introduction for this profile. Your data and navigation settings will stay intact.',
      confirmText: 'Replay',
      onConfirm: async () => {
        await clearOnboardingDraft(appContext.currentProfileId, 'replay');
        localStorage.setItem(SETUP_COMPLETED_KEY, 'true');
        localStorage.setItem(ONBOARDING_PENDING_KEY, 'true');
        setOnboardingCloudReady(true);
        setConfirmAction(null);
        setShowSettingsHub(false);
        setShowWelcome(true);
      },
    });
  };
  const loadDemoMode = useCallback(async (
    reset = false, initialSection?: typeof tabs[number]['id'], draft?: OnboardingDraft, origin: DemoOrigin = 'settings',
  ) => {
    if (demoTransitionRef.current) return;
    demoTransitionRef.current = true; setDemoTransitionBusy(true);
    try {
      await enterDemo({ reset,
        origin: draft ? draft.mode === 'replay' ? 'replay-introduction' : draft.phase === 'welcome' ? 'fresh-welcome' : 'onboarding-preview' : origin,
        returnTarget: draft ? { kind: 'onboarding', draft } : { kind: 'workspace', section: isDemoEntrySection(activeTab) ? activeTab : 'dashboard', feature: sectionFeatureRequest?.feature, helpOpen: origin === 'section-help' },
        entrySection: isDemoEntrySection(initialSection ?? null) ? initialSection as import('@/lib/demo/demo-workspace').DemoEntrySection : 'dashboard',
        beginTransition: appContext.beginDemoTransition,
      });
    } catch (caught) {
      setAppNotice({ title: 'Demo needs attention', message: caught instanceof Error ? caught.message : 'The sample workspace could not be opened.' });
      demoTransitionRef.current = false; setDemoTransitionBusy(false);
    }
  }, [appContext, activeTab, sectionFeatureRequest]);
  const requestDemoMode = useCallback((reset = false, initialSection?: typeof tabs[number]['id'], draft?: OnboardingDraft, origin: DemoOrigin = 'settings') => {
    if (draft?.phase === 'welcome' && !reset) { void loadDemoMode(false, initialSection, draft, origin); return; }
    setConfirmAction({
      title: reset ? 'Reset the sample workspace?' : 'Explore the Demo workspace?',
      message: reset ? 'Your Demo edits will be discarded. Your preserved workspace and setup stay safe.' : 'Your workspace and setup will be preserved. Changes made in Demo are discarded when you return.',
      confirmText: reset ? 'Reset Demo' : 'Open Demo', isDangerous: reset,
      onConfirm: () => { setConfirmAction(null); void loadDemoMode(reset, initialSection, draft, origin); },
    });
  }, [loadDemoMode]);
  const requestExitDemoMode = async () => {
    setConfirmAction({ title: demoReturnLabel() + '?',
      message: 'Your preserved workspace will be restored. Changes made in Demo will be discarded.',
      confirmText: demoReturnLabel(), onConfirm: () => {
        setConfirmAction(null);
        if (demoTransitionRef.current) return;
        demoTransitionRef.current = true; setDemoTransitionBusy(true);
        void exitDemo(appContext.beginDemoTransition).catch(caught => {
          setAppNotice({ title: 'Could not return to your workspace', message: caught instanceof Error ? caught.message : 'Review recovery before continuing.' });
          demoTransitionRef.current = false; setDemoTransitionBusy(false);
        });
      },
    });
  };

  useEffect(() => {
    const returnRequested = () => { void requestExitDemoMode(); };
    window.addEventListener('caizen:demo-native-return-request', returnRequested);
    return () => window.removeEventListener('caizen:demo-native-return-request', returnRequested);
  });

  const clearAllLocalData = async () => {
    assertRealWorkspace();
    const cleanupFailures: string[] = [];
    let pendingMediaCleanup = 0;

    try {
      const managedMedia = await listMediaAssets();
      queueMediaCleanupForAssets(managedMedia, 'workspace-cleared');
    } catch (caught) {
      throw new Error(caught instanceof Error ? caught.message : 'Managed media could not be enumerated.');
    }

    await appContext.clearWorkspaceState();

    try {
      const cleanupResult = await processPendingMediaCleanup();
      pendingMediaCleanup = cleanupResult.pendingJobs;
    } catch (caught) {
      cleanupFailures.push(
        caught instanceof Error
          ? caught.message
          : 'Managed media cleanup could not be completed; it will retry on next launch.',
      );
      pendingMediaCleanup = listPendingMediaCleanupJobs().length;
    }

    try {
      await deleteStoreValue(STORES.settings, DEMO_BACKUP_KEY);
    } catch (caught) {
      cleanupFailures.push(
        caught instanceof Error
          ? caught.message
          : 'The demo recovery state could not be removed.',
      );
    }

    localStorage.removeItem(APP_STORAGE_KEY);
    localStorage.removeItem(DEMO_MODE_KEY);
    localStorage.removeItem(DEMO_BACKUP_KEY);
    localStorage.removeItem(DEMO_LOADED_AT_KEY);
    localStorage.removeItem(DEMO_VERSION_KEY);
    localStorage.removeItem(DEMO_COMPASS_DISMISSED_KEY);
    localStorage.removeItem(DEMO_ONBOARDING_RETURN_KEY);
    sessionStorage.removeItem(DEMO_ENTRY_SECTION_KEY);
    clearOnboardingDraft();
    localStorage.removeItem(SETUP_COMPLETED_KEY);

    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (
        key?.startsWith('life-manager-local-modified-at:') ||
        key?.startsWith('cloud-last-successful-backup:') ||
        key?.startsWith('cloud-manual-backup-complete:') ||
        key?.startsWith('cloud-auto-backup:') ||
        key?.startsWith('cloud-auto-backup-paused:') ||
        key?.startsWith('cloud-auto-backup-check:') ||
        key?.startsWith('cloud-sync-marker:') ||
        key?.startsWith('cloud-backup-preferences-v1:')
      ) {
        localStorage.removeItem(key);
      }
    }

    if (pendingMediaCleanup || cleanupFailures.length) {
      window.sessionStorage.setItem(
        'caizen-storage-warning',
        [
          pendingMediaCleanup
            ? `${pendingMediaCleanup} managed media cleanup job(s) remain. The app will retry them after the next launch or successful save.`
            : '',
          ...cleanupFailures,
        ].filter(Boolean).join(' '),
      );
    }

    window.location.replace('/app/');
  };

  useEffect(() => {
    if (!appContext.isHydrated) return;
    if (localStorage.getItem(ONBOARDING_PENDING_KEY) !== 'true') {
      setOnboardingProfileReady(true);
      return;
    }
    const profile = currentProfileRef.current;
    if (!profile) return;
    let cancelled = false;
    setOnboardingProfileReady(false);
    setOnboardingPreparationError('');
    void waitForOnboardingProfileSave(profile.id, { name: profile.name })
      .then(() => { if (!cancelled) setOnboardingProfileReady(true); })
      .catch(error => {
        if (!cancelled) setOnboardingPreparationError(
          error instanceof Error ? error.message : 'Local storage could not be confirmed.',
        );
      });
    return () => { cancelled = true; };
  }, [appContext.isHydrated, appContext.currentProfileId, onboardingPreparationAttempt]);

  useEffect(() => {
    if (!appContext.isHydrated) {
      return;
    }

    const setupCompleted =
      localStorage.getItem(
        SETUP_COMPLETED_KEY,
      ) === 'true';

    const demoActive =
      localStorage.getItem(
        DEMO_MODE_KEY,
      ) === 'true';

    const hasStoredProfiles =
      appContext.profiles.length > 0;

    const onboardingPending =
      localStorage.getItem(ONBOARDING_PENDING_KEY) === 'true';

    setIsDemoMode(demoActive);
    if (!onboardingPending && !demoActive) clearOnboardingDraft();

    if (onboardingPending && !setupCompleted && appContext.profiles.length > 1) {
      // A restored or existing multi-profile workspace is not a new-user setup.
      localStorage.setItem(SETUP_COMPLETED_KEY, 'true');
      localStorage.removeItem(ONBOARDING_PENDING_KEY);
      clearOnboardingDraft();
      setShowWelcome(false);
      return;
    }

    if (demoActive) {
      setShowWelcome(false);
    } else if (
      shouldShowOnboarding({
        setupCompleted,
        onboardingPending,
        hasStoredProfiles,
      }) &&
      onboardingProfileReady &&
      !cloudRecoveryOffer &&
      !cloudContinuityNotice &&
      !showBackupModal &&
      !showCloudSyncModal &&
      !showSettingsHub &&
      !confirmAction && !appNotice && !demoTransitionBusy
    ) {
      setShowWelcome(true);
    } else {
      setShowWelcome(false);
    }

    if (
      !demoActive &&
      hasStoredProfiles &&
      !setupCompleted &&
      !onboardingPending
    ) {
      // Existing installations from before the pending marker are treated as
      // already onboarded, preserving their current startup behavior.
      localStorage.setItem(
        SETUP_COMPLETED_KEY,
        'true',
      );
    }

    if (
      sessionStorage.getItem(
        'caizen-demo-reset-notice',
      ) === 'true'
    ) {
      sessionStorage.removeItem(
        'caizen-demo-reset-notice',
      );

      setAppNotice({
        title: 'Demo reset',
        message:
          'The sample workspace has been rebuilt with dates aligned to today.',
      });
    }
  }, [
    appContext.isHydrated,
    appContext.isFreshInstall,
    appContext.profiles.length,
    onboardingProfileReady,
    appNotice,
    demoTransitionBusy,
    onboardingCloudReady,
    cloudRecoveryOffer,
    cloudContinuityNotice,
    showBackupModal,
    showCloudSyncModal,
    showSettingsHub,
    confirmAction,
  ]);

  useEffect(() => {
    if (!appContext.isHydrated || demoReturnApplied.current) return;
    if (demoSession?.phase === 'active') {
      demoReturnApplied.current = true; setDemoCompassOpen(demoSession.guide.open); setActiveTab(demoSession.guide.section);
    } else if (demoSession?.phase === 'restored') {
      demoReturnApplied.current = true;
      if (demoSession.returnTarget.kind === 'workspace') {
        const target = demoSession.returnTarget;
        setActiveTab(target.section); setSectionHelpOpen(Boolean(target.helpOpen));
        if (target.feature) window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('caizen:navigate', { detail: { section: target.section, feature: target.feature } })));
      }
      void acknowledgeDemoReturn().catch(() => undefined);
    }
  }, [appContext.isHydrated, demoSession]);
  useEffect(() => {
    if (isDemoMode && isDemoEntrySection(activeTab) && demoSession?.phase === 'active' && demoSession.guide.section !== activeTab) {
      void updateDemoGuide({ section: activeTab, visited: [...new Set([...demoSession.guide.visited, activeTab])] });
    }
  }, [activeTab, isDemoMode, demoSession]);


  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search,
    );

    if (params.get('cloud') !== '1') {
      return;
    }

    params.delete('cloud');

    const nextSearch = params.toString();

    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${
        nextSearch ? `?${nextSearch}` : ''
      }${window.location.hash}`,
    );

    setShowCloudSyncModal(true);
  }, []);

  useEffect(() => {
    if (!appContext.isHydrated || isDemoMode || isDemoModeActive() || demoTransitionBusy) return;
    const complete = () => {
      void consumeGoogleAuthCompletion().then(attempt => {
        if (!attempt) return;
        setCloudAuthMessage(attempt.message || 'Signed in to Cloud Backup.');
        if (attempt.returnIntent === 'onboarding') setOnboardingCloudReady(false);
        setShowCloudSyncModal(true);
      }).catch(() => undefined);
    };
    window.addEventListener(GOOGLE_AUTH_EVENT, complete);
    complete();
    return () => window.removeEventListener(GOOGLE_AUTH_EVENT, complete);
  }, [appContext.isHydrated, isDemoMode, demoTransitionBusy]);

  useEffect(() => {
    if (!appContext.isHydrated) return;

    const params = new URLSearchParams(
      window.location.search,
    );

    if (
      params.get('demo') !== '1' ||
      localStorage.getItem(DEMO_MODE_KEY) ===
        'true'
    ) {
      return;
    }

    params.delete('demo');

    const nextSearch =
      params.toString();

    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${
        nextSearch ? `?${nextSearch}` : ''
      }${window.location.hash}`,
    );

    const profile = currentProfileRef.current;
    if (profile && localStorage.getItem(ONBOARDING_PENDING_KEY) === 'true') {
      void loadOnboardingDraft(profile.id, localStorage.getItem(SETUP_COMPLETED_KEY) === 'true' ? 'replay' : 'fresh', profile.name, profile.baseCurrency || profile.currency || 'PHP')
        .then(draft => requestDemoMode(false, undefined, draft, 'external-entry'))
        .catch(caught => setAppNotice({ title: 'Setup could not be preserved', message: caught instanceof Error ? caught.message : 'Try opening Demo from welcome.' }));
    } else requestDemoMode(false, undefined, undefined, 'external-entry');
  }, [appContext.isHydrated, requestDemoMode]);


  useEffect(() => {
    const html = document.documentElement;

    if (useAlbumArtBackground && activeArtwork) {
      html.style.setProperty(
        '--music-bg-art',
        `url("${activeArtwork.replace(/"/g, '\\"')}")`
      );
      html.style.setProperty(
        '--music-bg-art-opacity',
        String(Math.min(0.36, Math.max(0, backgroundOpacity / 100)))
      );
      html.dataset.musicArtBackground = 'true';
    } else {
      html.style.setProperty('--music-bg-art', 'none');
      html.style.setProperty('--music-bg-art-opacity', '0');
      delete html.dataset.musicArtBackground;
    }

    return () => {
      html.style.setProperty('--music-bg-art', 'none');
      html.style.setProperty('--music-bg-art-opacity', '0');
      delete html.dataset.musicArtBackground;
    };
  }, [activeArtwork, backgroundOpacity, useAlbumArtBackground]);

  useEffect(() => {
    const updatePlatformPresentation = () => {
      setAndroidPresentation(isAndroid());
    };
    updatePlatformPresentation();
    window.addEventListener(
      'caizen:platform-ready',
      updatePlatformPresentation,
    );
    return () => {
      window.removeEventListener(
        'caizen:platform-ready',
        updatePlatformPresentation,
      );
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const connection = (
      navigator as Navigator & {
        connection?: {
          effectiveType?: string;
          saveData?: boolean;
        };
      }
    ).connection;
    const deviceMemory = (
      navigator as Navigator & { deviceMemory?: number }
    ).deviceMemory;
    const constrained = Boolean(
      connection?.saveData ||
      connection?.effectiveType === 'slow-2g' ||
      connection?.effectiveType === '2g' ||
      deviceMemory !== undefined && deviceMemory <= 2 ||
      navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4,
    );

    if (constrained) {
      html.dataset.caizenPerformance = 'constrained';
    } else {
      delete html.dataset.caizenPerformance;
    }

    return () => {
      delete html.dataset.caizenPerformance;
    };
  }, []);

  useEffect(() => {
    if (!androidPresentation) return;
    const updateNetwork = (event?: Event) => {
      const connected = (event as CustomEvent<{ connected?: boolean }> | undefined)
        ?.detail?.connected;
      setNativeConnected(connected ?? navigator.onLine);
    };
    updateNetwork();
    window.addEventListener('caizen:network', updateNetwork);
    return () => window.removeEventListener('caizen:network', updateNetwork);
  }, [androidPresentation]);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.compactMobileMode = compactMobileMode ? 'true' : 'false';
  }, [compactMobileMode]);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.darkModeAnimation = darkModeAnimation;
  }, [darkModeAnimation]);


  useEffect(() => {
    const handleOpenPetModal = (event: Event) => {
      const { observationId, profileId } = (event as CustomEvent<{ observationId?: string; profileId?: string }>).detail || {};
      setMochiSpotlight(typeof observationId === 'string' && typeof profileId === 'string'
        ? { id: observationId, profileId }
        : null);
      setShowPetModal(true);
    };
    window.addEventListener('life-manager:open-pet-modal', handleOpenPetModal);
    return () => window.removeEventListener('life-manager:open-pet-modal', handleOpenPetModal);
  }, []);

  useEffect(() => {
    if (!showPetModal) setMochiSpotlight(null);
  }, [showPetModal]);

  useEffect(() => {
    const handleOpenAddFood = () => setOpenAddFoodSignal(value => value + 1);
    window.addEventListener('life-manager:open-add-food', handleOpenAddFood);
    return () => window.removeEventListener('life-manager:open-add-food', handleOpenAddFood);
  }, []);

  useEffect(() => {
    const handleDashboardNavigate = (event: Event) => {
      const detail = (
        event as CustomEvent<
          string | { section?: string; feature?: string; recordId?: string; dateKey?: string }
        >
      ).detail;
      const requestedTab = typeof detail === 'string' ? detail : detail?.section;
      const legacyJournalRoute = requestedTab === 'journal';
      const legacyGamesRoute = requestedTab === 'games';
      const tabIdCandidate = requestedTab === 'wishlist'
        ? 'balance'
        : legacyJournalRoute
          ? 'lifehub'
          : legacyGamesRoute
            ? 'entertainment'
          : requestedTab;
      const legacyWishlistRoute = requestedTab === 'wishlist';
      const feature = typeof detail === 'string'
        ? legacyWishlistRoute
          ? 'plans'
          : legacyJournalRoute
            ? 'journal'
            : legacyGamesRoute
              ? 'games'
            : undefined
        : detail?.feature === 'add-wishlist'
          ? 'add-plan'
          : detail?.feature === 'wishlist-item'
            ? 'plan-item'
            : detail?.feature || (legacyWishlistRoute ? 'plans' : legacyJournalRoute ? 'journal' : legacyGamesRoute ? 'games' : undefined);
      const tabId = tabs.some(tab => tab.id === tabIdCandidate)
        ? tabIdCandidate!
        : 'dashboard';
      if (
        typeof detail !== 'string' &&
        detail?.feature === 'quick-add'
      ) {
        setSectionFeatureRequest(null);
        setActiveTab('dashboard');
        setShowMobileTools(true);
        closeCommandPalette();
        return;
      }

      if (typeof detail !== 'string' && feature === 'add-journal') {
        setSectionFeatureRequest(null);
        setActiveTab(tabId);
        setQuickAddRequest({ kind: 'journal' });
        closeCommandPalette();
        setShowMobileTools(false);
        return;
      }

      if (feature) {
        setSectionFeatureRequest(current => ({
          section: tabId,
          feature,
          recordId: typeof detail === 'string' ? undefined : detail.recordId,
          dateKey: typeof detail === 'string' ? undefined : detail.dateKey,
          signal: nextSectionFeatureRequestSignal(),
          profileId: appContext.currentProfileId,
        }));
      } else {
        setSectionFeatureRequest(null);
      }
      setActiveTab(tabId);
      closeCommandPalette();
      setShowMobileTools(false);

      // Supplement reminders can open the exact record in the shared
      // SupplementModal rather than only landing on the Health tab.
      if (
        typeof detail !== 'string' &&
        tabId === 'health' &&
        detail.recordId &&
        detail.feature === 'supplements'
      ) {
        setActiveSupplementId(detail.recordId);
        setShowAddModal(true);
        return;
      }

      // Sections without their own in-section view router resolve their
      // Quick Add deep links here, against the shared add modal. The tab has
      // already been set above, so the modal opens in the right context.
      const sharedAddModalFeatures = [
        'add-inventory',
      ];

      if (
        typeof detail !== 'string' &&
        feature &&
        sharedAddModalFeatures.includes(feature)
      ) {
        setShowAddModal(true);
      }
    };

    window.addEventListener('life-manager:navigate', handleDashboardNavigate);
    window.addEventListener('caizen:navigate', handleDashboardNavigate);
    return () => {
      window.removeEventListener('life-manager:navigate', handleDashboardNavigate);
      window.removeEventListener('caizen:navigate', handleDashboardNavigate);
    };
  }, [appContext.currentProfileId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [backupMode, setBackupMode] =
    useState<
      | 'import'
      | 'export'
      | 'import-complete'
      | 'export-complete'
      | 'import-data'
      | 'export-data'
    >(
      'export-complete'
    );
  const [transferFormat, setTransferFormat] = useState<'complete' | 'data'>('complete');



  const showCloudAvailabilityNotice = useCallback((scope: string) => {
    if (cloudAvailabilityOutageScopesRef.current.has(scope)) return;
    cloudAvailabilityOutageScopesRef.current.add(scope);
    const episode = (cloudAvailabilityEpisodesRef.current.get(scope) ?? 0) + 1;
    cloudAvailabilityEpisodesRef.current.set(scope, episode);
    notify({
      actionId: `cloud-availability:${scope}:episode:${episode}`,
      kind: 'info',
      title: 'Cloud Backup temporarily unavailable',
      description: 'Your local data is safe. Caizen will check again automatically.',
      undo: {
        label: 'Retry',
        execute: () => cloudRetryRef.current?.(),
      },
    });
  }, []);

  const clearCloudAvailabilityNotice = useCallback((scope: string) => {
    cloudAvailabilityOutageScopesRef.current.delete(scope);
  }, []);

  const runCloudReconciliation = useCallback(async () => {
    const profileId = appContext.currentProfileId;
    if (
      !appContext.isHydrated ||
      !profileId ||
      isDemoMode ||
      isDemoModeActive() ||
      demoTransitionRef.current ||
      cloudRecoveryOffer ||
      isCloudManagementOpen() ||
      getCloudOperation() ||
      typeof navigator === 'undefined'
    ) return;
    if (cloudSyncRunningRef.current) {
      cloudSyncPendingRef.current = true;
      return;
    }

    cloudSyncRunningRef.current = true;
    const cloud = await import('@/lib/cloud-backup').catch(() => {
      cloudSyncRunningRef.current = false;
      setOnboardingCloudReady(true);
      return null;
    });
    if (!cloud) return;
    if (isDemoModeActive() || demoTransitionRef.current) {
      cloudSyncRunningRef.current = false;
      cloudSyncPendingRef.current = false;
      return;
    }
    if (!isCloudSyncConfigured) {
      setOnboardingCloudReady(true);
      cloudSyncRunningRef.current = false;
      return;
    }
    const user = await cloud.getRestoredCloudUser().catch(() => null);
    if (!user || isDemoModeActive() || demoTransitionRef.current || currentProfileIdRef.current !== profileId) {
      setOnboardingCloudReady(true);
      cloudSyncRunningRef.current = false;
      return;
    }
    const scope = { userId: user.id, profileId };
    const autoState = cloud.getCloudAutoBackupState(scope);
    if (!navigator.onLine) {
      setOnboardingCloudReady(true);
      cloud.setCloudAutoBackupPaused(scope, 'offline: Waiting for a connection.');
      cloudSyncRunningRef.current = false;
      return;
    }
    const authGeneration = cloudAuthGenerationRef.current;
    const scopeIsCurrent = () => !isDemoModeActive() && !demoTransitionRef.current &&
      currentProfileIdRef.current === profileId && cloudAuthGenerationRef.current === authGeneration;
    const recordAutoCheck = (
      outcome: 'current' | 'uploaded' | 'partial' | 'attention',
      cloudUpdatedAt: string | null = null,
    ) => {
      if (autoState.enabled && currentProfileIdRef.current === profileId &&
        cloudAuthGenerationRef.current === authGeneration) {
        cloud.recordCloudAutoBackupCheck(user.id, profileId, outcome, cloudUpdatedAt);
      }
    };
    if (autoState.enabled) cloud.announceCloudAutoBackupChecking(user.id, profileId, true);

    try {
      // Background checks are metadata-only. A full snapshot or media bytes
      // may be loaded only from the explicit Cloud Backup review/restore flow.
      let discovery: CloudRecoveryDiscovery;
      try {
        discovery = await discoverCloudRecovery();
      } catch (error) {
        if (!scopeIsCurrent() || isCloudManagementOpen() || getCloudOperation()) return;
        if (isDemoModeActive() || demoTransitionRef.current) {
          cloudSyncPendingRef.current = false;
          return;
        }
        setOnboardingCloudReady(true);
        if (currentProfileIdRef.current !== profileId) {
          cloudSyncPendingRef.current = true;
          return;
        }
        showCloudAvailabilityNotice(`${user.id}:${profileId}`);
        cloud.setCloudAutoBackupPaused(
          scope,
          `discovery-failed: ${error instanceof Error ? error.message : 'metadata discovery failed'}`,
        );
        recordAutoCheck('attention');
        return;
      }
      if (isDemoModeActive() || demoTransitionRef.current) {
        cloudSyncPendingRef.current = false;
        return;
      }
      if (isCloudManagementOpen() || getCloudOperation()) return;
      clearCloudAvailabilityNotice(`${user.id}:${profileId}`);
      const verifiedUser = await cloud.getRestoredCloudUser().catch(() => null);
      if (
        isDemoModeActive() ||
        demoTransitionRef.current ||
        currentProfileIdRef.current !== profileId ||
        cloudAuthGenerationRef.current !== authGeneration ||
        verifiedUser?.id !== user.id
      ) {
        if (!isDemoModeActive() && !demoTransitionRef.current) {
          cloudSyncPendingRef.current = true;
        }
        return;
      }
      const currentCandidate = discovery.candidates.find(
        candidate =>
          candidate.isCurrentProfile ||
          candidate.classification === 'pristine-device-backup',
      );
      const otherRecoveryCandidate = discovery.candidates.find(
        candidate => candidate.classification === 'cloud-only-profile',
      );
      const cloudOnlyCandidateCount = discovery.candidates.filter(
        candidate => candidate.classification === 'cloud-only-profile' && candidate.backup,
      ).length;

      const showRecoveryNotice = async (candidate: CloudRecoveryCandidate) => {
        if (isDemoModeActive() || demoTransitionRef.current) return;
        let noticeKey = `${discovery.userId}:${candidate.classification}`;
        if (candidate.backup) {
          const fingerprint = getCloudRecoveryFingerprint({
            backupId: candidate.backup.id,
            profileId: candidate.backup.profileId,
            schemaVersion: candidate.backup.schemaVersion,
            updatedAt: candidate.backup.updatedAt,
          });
          noticeKey = `${discovery.userId}:${fingerprint}`;
          const alreadyDecided = await hasCloudRecoveryDecision(
            discovery.userId,
            fingerprint,
          ).catch(() => false);
          if (!scopeIsCurrent() || isCloudManagementOpen() || getCloudOperation()) return;
          if (alreadyDecided) return;
        }
        if (cloudRecoveryNoticeKeysRef.current.has(noticeKey)) return;
        cloudRecoveryNoticeKeysRef.current.add(noticeKey);
        const isCloudOnly = candidate.classification === 'cloud-only-profile';
        const isFreshDevice = discovery.localProfileCount === 0;
        const openRecovery = () => {
          if (!scopeIsCurrent() || isCloudManagementOpen() || getCloudOperation()) return;
          setCloudContinuityNotice(null);
          setShowMobileTools(false);
          setCloudRecoveryOffer({ discovery, candidate });
        };

        if (candidate.prompt === 'modal') {
          setCloudContinuityNotice(null);
          cloud.setCloudAutoBackupPaused(scope,
            candidate.classification === 'pristine-device-backup'
              ? 'recovery: A Cloud profile is available for this new device.'
              : 'recovery: Cloud Backup needs a deliberate version choice.',
          );
          setAppNotice(null);
          setCloudRecoveryOffer({ discovery, candidate });
          return;
        }

        // A device with no local profiles has nothing meaningful to preserve.
        // One Cloud profile can go straight to its safe review surface; an
        // ambiguous set stays passive until the user chooses a profile.
        if (isCloudOnly && isFreshDevice && cloudOnlyCandidateCount === 1) {
          openRecovery();
          return;
        }

        setCloudContinuityNotice({ discovery, candidate });
      };

      if (!currentCandidate || currentCandidate.classification === 'no-backup') {
        recordAutoCheck('attention');
        if (otherRecoveryCandidate) {
          await showRecoveryNotice(otherRecoveryCandidate);
          return;
        }
        if (!autoState.enabled) return;
        const alreadyMissing = /^missing-cloud:/.test(autoState.pausedReason ?? '');
        cloud.setCloudAutoBackupPaused(scope,
          'missing-cloud: The matching cloud snapshot is no longer available.',
        );
        if (!alreadyMissing) {
          notify({
            actionId: `cloud:missing:${user.id}:${profileId}:${Date.now()}`,
            feedbackGroup: 'cloud-backup',
            kind: 'warning',
            title: 'Cloud Backup needs attention',
            description: 'The matching Cloud version is unavailable. Your local data is safe.',
            undo: { label: 'Open Cloud', execute: () => setShowCloudSyncModal(true) },
          });
        }
        return;
      }

      if (
        currentCandidate.classification === 'pristine-device-backup' ||
        currentCandidate.classification === 'matching-cloud-newer' ||
        currentCandidate.classification === 'matching-no-baseline' ||
        currentCandidate.classification === 'both-changed'
      ) {
        recordAutoCheck('attention', currentCandidate.backup?.updatedAt ?? null);
        await showRecoveryNotice(currentCandidate);
        return;
      }

      if (otherRecoveryCandidate) {
        await showRecoveryNotice(otherRecoveryCandidate);
      }

      if (currentCandidate.classification === 'matching-local-newer') {
        if (!autoState.enabled || !autoState.eligible || !cloud.getCloudSyncMarker(user.id, profileId)) {
          cloud.setCloudAutoBackupPaused(scope,
            'local-pending: Local changes are waiting for Automatic Cloud Backup to be enabled.',
          );
          return;
        }
        if (cloudAuthGenerationRef.current !== authGeneration) {
          cloudSyncPendingRef.current = true;
          return;
        }
        if (isDemoModeActive() || demoTransitionRef.current) return;
        const result = await cloud.backupLocalDataToCloud({
          mode: 'auto',
          expectedUserId: user.id,
          expectedProfileId: profileId,
          expectedBackupId: currentCandidate.backup?.id,
          expectedUpdatedAt: currentCandidate.backup?.updatedAt,
        });
        if (!scopeIsCurrent() || isCloudManagementOpen()) return;
        recordAutoCheck(result.status === 'partial' ? 'partial' : 'uploaded', result.updatedAt);
        if (result.status === 'partial') {
          notify({
            actionId: `cloud:auto-partial:${user.id}:${profileId}:${result.updatedAt}`,
            feedbackGroup: 'cloud-backup',
            kind: 'warning',
            title: 'Backup saved with warnings',
            description: 'Some Cloud items still need attention. Open Cloud Backup to retry.',
            undo: { label: 'Open Cloud', execute: () => setShowCloudSyncModal(true) },
          });
        }
        return;
      }
      if (currentCandidate.classification === 'matching-equal') {
        if (autoState.enabled && autoState.eligible && cloud.getCloudSyncMarker(user.id, profileId)) {
          const pendingMediaCount = await cloud.getPendingCloudMediaCount(profileId);
          if (isDemoModeActive() || demoTransitionRef.current) return;
          if (pendingMediaCount > 0) {
            if (/^media:/.test(autoState.pausedReason ?? '')) {
              cloud.setCloudAutoBackupPaused(scope, null);
            }
            const result = await cloud.backupLocalDataToCloud({
              mode: 'auto',
              retryMedia: true,
              expectedUserId: user.id,
              expectedProfileId: profileId,
              expectedBackupId: currentCandidate.backup?.id,
              expectedUpdatedAt: currentCandidate.backup?.updatedAt,
            });
            if (!scopeIsCurrent() || isCloudManagementOpen()) return;
            recordAutoCheck(result.status === 'partial' ? 'partial' : 'uploaded', result.updatedAt);
            if (result.status === 'partial') {
              notify({
                actionId: `cloud:auto-media-partial:${user.id}:${profileId}:${result.updatedAt}`,
                feedbackGroup: 'cloud-backup',
                kind: 'warning',
                title: 'Backup saved with warnings',
                description: 'Some Cloud items still need attention. Open Cloud Backup to retry.',
                undo: { label: 'Open Cloud', execute: () => setShowCloudSyncModal(true) },
              });
            }
            return;
          }
        }
        cloud.setCloudAutoBackupPaused(scope, null);
        if (autoState.enabled) {
          const cloudUpdatedAt = currentCandidate.backup?.updatedAt ?? null;
          const lastCompleteAt = cloud.getLastSuccessfulBackupTimestamp(scope);
          const previousCheck = cloud.getCloudAutoBackupCheck(user.id, profileId);
          recordAutoCheck(
            cloudUpdatedAt && lastCompleteAt === cloudUpdatedAt
              ? 'current'
              : previousCheck?.outcome === 'partial' && previousCheck.cloudUpdatedAt === cloudUpdatedAt
                ? 'partial'
                : 'attention',
            cloudUpdatedAt,
          );
        }
      }
    } catch (error) {
      if (error instanceof CloudOperationBusyError) return;
      if (!scopeIsCurrent() || isCloudManagementOpen()) return;
      if (isDemoModeActive() || demoTransitionRef.current) return;
      if (currentProfileIdRef.current !== profileId) {
        cloudSyncPendingRef.current = true;
        return;
      }
      if (cloud.isCloudBackupBaselineChangedError(error)) {
        cloud.setCloudAutoBackupPaused(scope,
          'recovery: Cloud changed while the device upload was in progress.',
        );
        recordAutoCheck('attention');
        notify({
          actionId: `cloud:baseline-changed:${user.id}:${profileId}:${Date.now()}`,
          feedbackGroup: 'cloud-backup',
          kind: 'warning',
          title: 'Cloud Backup changed while uploading',
          description: 'Another device saved first. Review the Cloud version before choosing one.',
          undo: { label: 'Review Cloud', execute: () => setShowCloudSyncModal(true) },
        });
        return;
      }
      const message = error instanceof Error
        ? error.message
        : 'Cloud Backup could not safely upload this profile.';
      cloud.setCloudAutoBackupPaused(scope,
        `sync: ${message}`,
      );
      recordAutoCheck('attention');
      notify({
        actionId: `cloud:auto-unavailable:${user.id}:${profileId}:${Date.now()}`,
        feedbackGroup: 'cloud-backup',
        kind: 'warning',
        title: 'Cloud Backup unavailable',
        description: 'Your local data is safe. Open Cloud Backup to retry.',
        undo: { label: 'Open Cloud', execute: () => setShowCloudSyncModal(true) },
      });
    } finally {
      setOnboardingCloudReady(true);
      if (autoState.enabled) cloud.announceCloudAutoBackupChecking(user.id, profileId, false);
      cloudSyncRunningRef.current = false;
      const shouldRerun =
        (!isDemoModeActive() && !demoTransitionRef.current && cloudSyncPendingRef.current) ||
        currentProfileIdRef.current !== profileId;
      cloudSyncPendingRef.current = false;
      if (shouldRerun && typeof window !== 'undefined') {
        window.setTimeout(() => void runCloudReconciliation(), 0);
      }
    }
  }, [
    appContext.currentProfileId,
    appContext.isHydrated,
    cloudRecoveryOffer,
    isDemoMode,
    showCloudAvailabilityNotice,
    clearCloudAvailabilityNotice,
  ]);

  const scheduleCloudReconciliation = useCallback((delay = 400) => {
    if (isDemoModeActive() || demoTransitionRef.current) {
      if (cloudSyncTimerRef.current !== null) {
        window.clearTimeout(cloudSyncTimerRef.current);
        cloudSyncTimerRef.current = null;
      }
      return;
    }
    if (cloudSyncTimerRef.current !== null) {
      window.clearTimeout(cloudSyncTimerRef.current);
    }
    cloudSyncTimerRef.current = window.setTimeout(() => {
      cloudSyncTimerRef.current = null;
      void runCloudReconciliation();
    }, delay);
  }, [runCloudReconciliation]);
  cloudRetryRef.current = () => scheduleCloudReconciliation(0);
  useEffect(() => subscribeCloudOperation(() => {
    if (!getCloudOperation() && !isCloudManagementOpen()) scheduleCloudReconciliation(0);
  }), [scheduleCloudReconciliation]);

  useEffect(() => {
    if (!appContext.isHydrated) return;
    if (
      localStorage.getItem(ONBOARDING_PENDING_KEY) !== 'true' ||
      localStorage.getItem(SETUP_COMPLETED_KEY) === 'true' ||
      isDemoModeActive() ||
      demoTransitionRef.current ||
      !isCloudSyncConfigured ||
      !navigator.onLine
    ) {
      setOnboardingCloudReady(true);
      return;
    }
    let cancelled = false;
    void import('@/lib/cloud-backup')
      .then(cloud => cloud.getRestoredCloudUser())
      .then(user => {
        if (cancelled) return;
        if (user) scheduleCloudReconciliation(0);
        else setOnboardingCloudReady(true);
      })
      .catch(() => { if (!cancelled) setOnboardingCloudReady(true); });
    return () => { cancelled = true; };
  }, [appContext.isHydrated, scheduleCloudReconciliation]);

  useEffect(() => {
    if (!appContext.isHydrated) return;

    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleCloudReconciliation();
    };
    const onNativeState = (event: Event) => {
      if ((event as CustomEvent<{ isActive?: boolean }>).detail?.isActive) scheduleCloudReconciliation();
    };
    const onLocalSave = (event: Event) => {
      const changedProfileIds = (
        event as CustomEvent<{ changedProfileIds?: string[] }>
      ).detail?.changedProfileIds;
      if (
        changedProfileIds &&
        !changedProfileIds.includes(appContext.currentProfileId)
      ) return;
      scheduleCloudReconciliation(4_000);
    };

    scheduleCloudReconciliation(1_200);
    const onResume = () => scheduleCloudReconciliation();
    window.addEventListener('online', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('caizen:cloud-auth', onResume);
    window.addEventListener('caizen:local-save-complete', onLocalSave);
    window.addEventListener('caizen:app-state', onNativeState);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (cloudSyncTimerRef.current !== null) {
        window.clearTimeout(cloudSyncTimerRef.current);
        cloudSyncTimerRef.current = null;
      }
      window.removeEventListener('online', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('caizen:cloud-auth', onResume);
      window.removeEventListener('caizen:local-save-complete', onLocalSave);
      window.removeEventListener('caizen:app-state', onNativeState);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [
    appContext.currentProfileId,
    appContext.isHydrated,
    scheduleCloudReconciliation,
  ]);

  useEffect(() => {
    if (
      !appContext.isHydrated ||
      !appContext.currentProfileId ||
      isDemoMode ||
      isDemoModeActive() ||
      demoTransitionRef.current ||
      !isCloudSyncConfigured
    ) {
      setCloudSignedIn(false);
      return;
    }

    setCloudSignedIn(false);
    setCloudAccountId(null);

    let disposed = false;
    let removeChannel: () => void = () => undefined;
    let authSubscription: { unsubscribe: () => void } | null = null;
    let activeUserId: string | null = null;
    let authGeneration = 0;
    let authFence: Promise<void> | null = null;
    const profileId = appContext.currentProfileId;
    const clearPendingCloudState = () => {
      cloudRecoveryNoticeKeysRef.current.clear();
      cloudAvailabilityOutageScopesRef.current.clear();
      setCloudRecoveryOffer(null);
      setCloudContinuityNotice(null);
    };

    const fenceCloudMedia = (): Promise<void> => {
      const fence = invalidateCloudSession()
        .then(() => clearCloudMediaCache())
        .catch(() => showCloudAvailabilityNotice('cloud-media-cache'))
        .then(() => undefined);
      authFence = fence;
      void fence.then(() => {
        if (authFence === fence) authFence = null;
      });
      return fence;
    };

    const detachChannel = () => {
      removeChannel();
      removeChannel = () => undefined;
    };

    const attachChannel = async (
      userId?: string,
      generation = authGeneration,
    ) => {
      if (disposed) return;
      const user = userId
        ? { id: userId }
        : await import('@/lib/cloud-backup').then(cloud => cloud.getRestoredCloudUser().catch(() => null));
      if (
        !user ||
        disposed ||
        generation !== authGeneration ||
        (activeUserId && activeUserId !== user.id)
      ) {
        detachChannel();
        return;
      }
      activeUserId = user.id;
      setCloudAccountId(user.id);
      setCloudSignedIn(true);

      detachChannel();
      removeChannel = subscribeToCloudProfileBackup(
        user.id,
        profileId,
        payload => {
          const updatedAt = payload.record?.updated_at;
          if (typeof updatedAt === 'string') {
            try {
              const marker = JSON.parse(
                localStorage.getItem(`cloud-sync-marker:${user.id}:${profileId}`) || 'null',
              ) as { cloudUpdatedAt?: unknown } | null;
              if (marker?.cloudUpdatedAt === updatedAt) return;
            } catch {
              // A malformed marker must not suppress a remote update.
            }
          }
          window.dispatchEvent(new CustomEvent('caizen:cloud-backup-changed', { detail: { userId: user.id, profileId } }));
          scheduleCloudReconciliation(700);
        },
        status => {
          const scope = `${user.id}:${profileId}`;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            showCloudAvailabilityNotice(scope);
          } else if (status === 'SUBSCRIBED') {
            clearCloudAvailabilityNotice(scope);
          }
        },
      );
    };

    try {
      const supabase = getSupabaseClient();
      const auth = supabase.auth.onAuthStateChange((event, session) => {
        cloudAuthGenerationRef.current += 1;
        authGeneration += 1;
        const generation = authGeneration;
        if (event === 'SIGNED_OUT' || !session) {
          setCloudSignedIn(false);
          setCloudAccountId(null);
          clearPendingCloudState();
          activeUserId = null;
          detachChannel();
          fenceCloudMedia();
          return;
        }
        setCloudSignedIn(true);
        setCloudAccountId(session.user.id);
        const accountChanged = activeUserId !== null && activeUserId !== session.user.id;
        if (accountChanged) {
          clearPendingCloudState();
          // Invalidation runs synchronously before its drain promise is
          // awaited, fencing any Account A resolver before Account B work is
          // attached to the channel.
          void fenceCloudMedia()
            .then(() => {
              if (disposed || generation !== authGeneration || activeUserId !== session.user.id) return;
              resumeCloudMediaSession(session.user.id);
              scheduleCloudReconciliation(200);
            });
        }
        if (activeUserId !== session.user.id) detachChannel();
        activeUserId = session.user.id;
        void attachChannel(session.user.id, generation);
        if (!accountChanged) {
          const resume = () => {
            if (disposed || generation !== authGeneration || activeUserId !== session.user.id) return;
            resumeCloudMediaSession(session.user.id);
            scheduleCloudReconciliation(200);
          };
          if (authFence) void authFence.then(resume);
          else resume();
        }
      });
      authSubscription = auth.data.subscription;
      void attachChannel(undefined, authGeneration);
    } catch {
      setCloudSignedIn(false);
      // The normal coordinator still handles foreground/reconnect events when
      // Realtime is unavailable or the build has no configured Cloud client.
    }

    return () => {
      disposed = true;
      cloudAuthGenerationRef.current += 1;
      authGeneration += 1;
      authSubscription?.unsubscribe();
      detachChannel();
    };
  }, [
    appContext.currentProfileId,
    appContext.isHydrated,
    isDemoMode,
    scheduleCloudReconciliation,
    showCloudAvailabilityNotice,
    clearCloudAvailabilityNotice,
  ]);

  useEffect(() => {
    try {
      const storageWarning = sessionStorage.getItem('caizen-storage-warning');
      if (storageWarning) {
        sessionStorage.removeItem('caizen-storage-warning');
        setAppNotice({ title: 'Workspace cleanup needs attention', message: storageWarning });
        return;
      }
      const stored = sessionStorage.getItem('caizen-cloud-sync-notice');
      if (!stored) return;
      sessionStorage.removeItem('caizen-cloud-sync-notice');
      const notice = JSON.parse(stored) as { title?: unknown; message?: unknown };
      if (typeof notice.title === 'string' && typeof notice.message === 'string') {
        notify({
          actionId: `cloud:restore-warning:${Date.now()}`,
          feedbackGroup: 'cloud-backup',
          kind: 'warning',
          title: notice.title,
          description: notice.message,
          undo: { label: 'Open Cloud', execute: () => setShowCloudSyncModal(true) },
        });
      }
    } catch {
      sessionStorage.removeItem('caizen-cloud-sync-notice');
    }
  }, []);

  useEffect(() => {
    const onStorageWarning = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: unknown }>).detail;
      const text = typeof detail?.message === 'string' ? detail.message : null;
      if (text) {
        setAppNotice({
          title: 'Workspace cleanup needs attention',
          message: text,
        });
      }
    };
    window.addEventListener('caizen:storage-warning', onStorageWarning);
    return () => window.removeEventListener('caizen:storage-warning', onStorageWarning);
  }, []);

  /* =========================================
     LOAD HIDDEN TABS
  ========================================= */

  useEffect(() => {
    const handleCloseMenus = () => {
      setContextTab(null);
      setHiddenMenuPosition(null);
    };

    window.addEventListener(
      'click',
      handleCloseMenus
    );

    return () => {
      window.removeEventListener(
        'click',
        handleCloseMenus
      );
    };
  }, []);

  useEffect(() => {
    const handleCommandShortcut = (
      event: KeyboardEvent
    ) => {
      // Escape must close the palette even while its own search input is
      // focused, so it has to run before the text-editing guard below
      // (which exists to keep "/" and Ctrl+K from firing while typing).
      if (event.key === 'Escape') {
        closeCommandPalette();
        return;
      }

      if (isTextEditingTarget(event.target)) return;

      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        setShowCommandPalette(prev => {
          if (prev) {
            setCommandSearch('');
            return false;
          }

          return true;
        });
      }

      if (event.key === '/') {
        event.preventDefault();
        setShowCommandPalette(true);
      }
      if (event.key === 'Escape') {
        closeCommandPalette();
        setContextTab(null);
        setHiddenMenuPosition(null);
      }
    };

    window.addEventListener(
      'keydown',
      handleCommandShortcut
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleCommandShortcut
      );
    };
  }, []);

  useEffect(() => {
    const handleNativeBackRequest = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          handled: boolean;
          kind: 'overlay' | 'nested-flow';
        }>
      ).detail;

      if (!detail || detail.handled) return;

      if ((sectionHelpOpen || firstActionSection) && detail.kind === 'nested-flow') {
        setSectionHelpOpen(false); setFirstActionSection(null); detail.handled = true; return;
      }
      if (demoCompassOpen && detail.kind === 'nested-flow') {
        dismissDemoCompass();
        detail.handled = true;
        return;
      }

      if (showCommandPalette) {
        closeCommandPalette();
      } else if (showMobileTools) {
        setShowMobileTools(false);
      } else if (showCloudSyncModal || cloudRecoveryOffer) {
        window.dispatchEvent(new Event('caizen:cloud-close-request'));
      } else if (showBackupModal) {
        setShowBackupModal(false);
      } else if (showSettingsHub) {
        const settingsPage = document.querySelector<HTMLElement>('[data-settings-page]')?.dataset.settingsPage;
        if (settingsPage && settingsPage !== 'home') return;
        setShowSettingsHub(false);
      } else if (showAppearancePanel) {
        setShowAppearancePanel(false);
      } else if (showTrashModal) {
        setShowTrashModal(false);
      } else if (showPetModal) {
        setShowPetModal(false);
      } else if (quickAddRequest) {
        setQuickAddRequest(null);
      } else if (showAddModal) {
        setShowAddModal(false);
      } else if (showUserGuide) {
        setShowUserGuide(false);
      } else if (showWelcome) {
        // The onboarding controller owns stage/back/pause semantics.
        return;
      } else if (confirmAction) {
        setConfirmAction(null);
      } else if (importPreview) {
        // Never dismiss mid-commit; the write is already in flight.
        if (importBusy) return;
        closeImportPreview();
      } else if (appNotice) {
        setAppNotice(null);
      } else {
        return;
      }

      detail.handled = true;
    };

    window.addEventListener(
      'caizen:native-back-request',
      handleNativeBackRequest,
    );
    return () => {
      window.removeEventListener(
        'caizen:native-back-request',
        handleNativeBackRequest,
      );
    };
  }, [
    appNotice,
    cloudRecoveryOffer,
    confirmAction,
    demoCompassOpen,
    sectionHelpOpen,
    firstActionSection,
    dismissDemoCompass,
    importPreview,
    quickAddRequest,
    showAddModal,
    showAppearancePanel,
    showBackupModal,
    showCloudSyncModal,
    showCommandPalette,
    showMobileTools,
    showPetModal,
    showSettingsHub,
    showTrashModal,
    showUserGuide,
    showWelcome,
    importBusy,
  ]);

  useEffect(() => {
    const savedHidden =
      localStorage.getItem(
        'hidden-tabs'
      );

    const savedOrder =
      localStorage.getItem(
        'tab-order'
      );

    if (savedHidden) {
      try {
        const validIds = tabs.map(tab => tab.id) as string[];
        const parsedHidden = JSON.parse(savedHidden);
        setHiddenTabs(
          Array.isArray(parsedHidden)
            ? parsedHidden.filter((id): id is string => typeof id === 'string' && validIds.includes(id))
            : [],
        );
      } catch {
        setHiddenTabs([]);
      }
    }

    if (savedOrder) {
      const validIds: string[] = tabs.map(tab => tab.id);
      try {
        const parsedOrder: unknown = JSON.parse(savedOrder);
        const savedIds = Array.isArray(parsedOrder)
          ? [...new Set(parsedOrder.filter((id): id is string =>
              typeof id === 'string' && validIds.includes(id)))]
          : [];
        setTabOrder([...savedIds, ...validIds.filter(id => !savedIds.includes(id))]);
      } catch {
        setTabOrder(validIds);
      }
    }

    const savedPrimaryNav = localStorage.getItem('primary-nav-tabs');
    if (savedPrimaryNav) {
      try {
        setPrimaryNavTabs(
          sanitizePrimaryNavTabs(JSON.parse(savedPrimaryNav), tabs.map(tab => tab.id)),
        );
      } catch {
        setPrimaryNavTabs(DEFAULT_PRIMARY_NAV_TABS);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('primary-nav-tabs', JSON.stringify(primaryNavTabs));
  }, [primaryNavTabs]);

  /* =========================================
     SAVE HIDDEN TABS
  ========================================= */

  useEffect(() => {
    localStorage.setItem(
      'hidden-tabs',
      JSON.stringify(hiddenTabs)
    );
  }, [hiddenTabs]);

  useEffect(() => {
    localStorage.setItem(
      'tab-order',
      JSON.stringify(tabOrder)
    );
  }, [tabOrder]);

  /* =========================================
     TAB TOGGLE
  ========================================= */

  const toggleTab = (
    tabId: string
  ) => {
    if (tabId === 'dashboard')
      return;

    const isHiding = !hiddenTabs.includes(tabId);

    setHiddenTabs(prev =>
      prev.includes(tabId)
        ? prev.filter(
          t => t !== tabId
        )
        : [...prev, tabId]
    );

    // Matches the nav context-menu's own hide action: leaving the active
    // section hidden with no highlighted tab is disorienting, so fall back
    // to Dashboard the same way right-clicking a tab and hiding it already does.
    if (isHiding && activeTab === tabId) {
      setActiveTab('dashboard');
    }
  };

  const moveTab = (
    tabId: string,
    direction: -1 | 1
  ) => {
    if (tabId === 'dashboard') return;

    setTabOrder(prev => {
      const currentIndex =
        prev.indexOf(tabId);

      const nextIndex =
        currentIndex + direction;

      if (
        currentIndex <= 0 ||
        nextIndex <= 0 ||
        nextIndex >= prev.length
      ) {
        return prev;
      }

      return arrayMove(
        prev,
        currentIndex,
        nextIndex
      );
    });
  };

  const handleDragEnd = (
    event: DragEndEvent
  ) => {
    setActiveDragId(null);
    const { active, over } = event;

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (
      activeId === 'dashboard' ||
      overId === 'dashboard' ||
      activeId === overId
    ) {
      return;
    }

    setTabOrder(prev => {
      const oldIndex =
        prev.indexOf(activeId);

      const newIndex =
        prev.indexOf(overId);

      if (
        oldIndex === -1 ||
        newIndex === -1
      ) {
        return prev;
      }

      return arrayMove(
        prev,
        oldIndex,
        newIndex
      );
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  /* =========================================
     VISIBLE TABS
  ========================================= */
  const orderedTabs =
    useMemo(
      () => {
        const savedTabs =
          tabOrder
            .map(id =>
              tabs.find(tab => tab.id === id)
            )
            .filter(
              (
                tab
              ): tab is typeof tabs[number] =>
                Boolean(tab)
            );

        const missingTabs =
          tabs.filter(
            tab =>
              !savedTabs.some(
                savedTab => savedTab.id === tab.id
              )
          );

        return [
          ...savedTabs,
          ...missingTabs,
        ];
      },
      [tabOrder]
    );

  const visibleTabs =
    useMemo(
      () =>
        orderedTabs.filter(
          tab =>
            tab &&
            !hiddenTabs.includes(tab.id) &&
            (!focusMode || ['dashboard', 'lifehub', 'health', 'workhub', 'music'].includes(tab.id))
        ),
      [orderedTabs, hiddenTabs, focusMode]
    );

  const syncDesktopNavScroll = useCallback(() => {
    const scrollContainer = desktopNavScrollRef.current;
    if (!scrollContainer) return;

    const maxScrollLeft = Math.max(
      0,
      scrollContainer.scrollWidth - scrollContainer.clientWidth,
    );
    const scrollLeft = Math.max(0, Math.min(scrollContainer.scrollLeft, maxScrollLeft));
    const nextState = {
      hasOverflow: maxScrollLeft > 1,
      canScrollLeft: scrollLeft > 1,
      canScrollRight: scrollLeft < maxScrollLeft - 1,
    };

    setDesktopNavScrollState(current =>
      current.hasOverflow === nextState.hasOverflow &&
      current.canScrollLeft === nextState.canScrollLeft &&
      current.canScrollRight === nextState.canScrollRight
        ? current
        : nextState,
    );
  }, []);

  useEffect(() => {
    const scrollContainer = desktopNavScrollRef.current;
    if (!scrollContainer) return;

    syncDesktopNavScroll();
    scrollContainer.addEventListener('scroll', syncDesktopNavScroll, { passive: true });
    window.addEventListener('resize', syncDesktopNavScroll);
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncDesktopNavScroll)
      : undefined;
    observer?.observe(scrollContainer);

    return () => {
      scrollContainer.removeEventListener('scroll', syncDesktopNavScroll);
      window.removeEventListener('resize', syncDesktopNavScroll);
      observer?.disconnect();
    };
  }, [hiddenTabs.length, syncDesktopNavScroll, visibleTabs.length]);

  useEffect(() => {
    const scrollContainer = desktopNavScrollRef.current;
    if (!scrollContainer) return;

    const activeTabElement = Array.from(
      scrollContainer.querySelectorAll<HTMLElement>('[data-nav-tab-id]'),
    ).find(element => element.dataset.navTabId === activeTab);
    if (!activeTabElement) return;

    const scrollRect = scrollContainer.getBoundingClientRect();
    const tabRect = activeTabElement.getBoundingClientRect();
    if (tabRect.left >= scrollRect.left && tabRect.right <= scrollRect.right) {
      syncDesktopNavScroll();
      return;
    }

    const horizontalDelta = tabRect.left < scrollRect.left
      ? tabRect.left - scrollRect.left
      : tabRect.right > scrollRect.right
        ? tabRect.right - scrollRect.right
        : 0;
    if (horizontalDelta) {
      scrollContainer.scrollTo({
        left: Math.max(0, scrollContainer.scrollLeft + horizontalDelta),
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    }
    window.requestAnimationFrame(syncDesktopNavScroll);
  }, [activeTab, reduceMotion, syncDesktopNavScroll, visibleTabs]);

  const hiddenTabItems =
    useMemo(
      () =>
        orderedTabs.filter(tab =>
          hiddenTabs.includes(tab.id)
        ),
      [orderedTabs, hiddenTabs]
    );

  useEffect(() => {
    if (!focusMode) return;
    if (!visibleTabs.some(tab => tab.id === activeTab)) {
      setActiveTab('dashboard');
    }
  }, [activeTab, focusMode, visibleTabs]);

  const sectionStreaks =
    useMemo(() => {
      const health = appContext.health as any;
      const journalEntries = (appContext.journalEntries || []) as any[];
      const dailyChecklistItems = (appContext.dailyChecklistItems || []) as any[];
      const productivityItems = (appContext.productivityItems || []) as any[];
      const workItems = (appContext.workItems || []) as any[];

      const lifeHubDates = [
        ...dailyChecklistItems.map(item => item.completedAt),
        ...productivityItems
          .filter(item =>
            item.completed ||
            item.done ||
            item.status === 'done' ||
            item.status === 'completed'
          )
          .map(item => item.completedAt || item.updatedAt || item.createdAt || item.date),
      ];

      const workHubDates = workItems
        .filter(item => item.type !== 'project')
        .map(item => item.updatedAt || item.completedAt || item.createdAt || item.date);

      return {
        health: getConsecutiveDayStreak(health?.foodLogCompletedDates || []),
        lifehub: getConsecutiveDayStreak(lifeHubDates),
        journal: getConsecutiveDayStreak(
          journalEntries.map(entry => entry.date || entry.createdAt)
        ),
        workhub: getConsecutiveDayStreak(workHubDates),
      };
    }, [
      appContext.health,
      appContext.journalEntries,
      appContext.dailyChecklistItems,
      appContext.productivityItems,
      appContext.workItems,
    ]);
  /* =========================================
     EXPORT
  ========================================= */

  /* =========================================
    IMPORT
 ========================================= */

  const handleImport = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onload = async e => {
      try {
        const jsonData =
          e.target?.result as string;
        const { previewDataOnlyImport, getPreImportRecovery } = await import(
          '@/lib/storage/backup-repository'
        );
        const prepared = await previewDataOnlyImport(jsonData);
        setImportMode('new-profiles');
        setImportFileName(file.name);
        setImportError(null);
        setImportBusy(false);
        setImportRecovery(await getPreImportRecovery());
        setImportPreview(prepared);
      } catch (error) {
        console.error(error);
        const message =
          error instanceof Error && error.message
            ? `${error.message} Nothing on this device was changed.`
            : 'That file could not be read as a Caizen backup. Nothing on this device was changed.';
        notify({ actionId: `import:preview:error:${Date.now()}`, kind: 'error', title: 'Invalid backup file', description: message });
        setAppNotice({
          title: 'Invalid backup file',
          // Surface the real reason. The generic message alone left users with
          // no idea whether the file was the wrong type, truncated, or corrupt.
          message,
        });
      }
    };

    reader.onerror = () => {
      notify({ actionId: `import:read:error:${Date.now()}`, kind: 'error', title: 'Could not read file', description: 'The file could not be opened. Nothing on this device was changed.' });
      setAppNotice({
        title: 'Could not read file',
        message: 'The file could not be opened. Nothing on this device was changed.',
      });
    };

    reader.readAsText(file);
  };

  const closeImportPreview = () => {
    setImportPreview(null);
    setImportError(null);
    setImportBusy(false);
    setImportFileName('');
  };

  const handleSaveImportReport = () => {
    if (!importPreview) return;
    void import('@/lib/storage/backup-repository').then(({ downloadBlob }) =>
      downloadBlob(
        new Blob([JSON.stringify(importPreview.report, null, 2)], {
          type: 'application/json',
        }),
        `caizen-import-report-${toLocalDateKey(new Date())}.json`,
      ),
    );
  };

  const handleImportRecover = () => {
    setImportBusy(true);
    void import('@/lib/storage/backup-repository')
      .then(({ restorePreImportSnapshot }) => restorePreImportSnapshot())
      .then(() => notify({ actionId: `restore:recovery:${Date.now()}`, kind: 'success', title: 'Previous data restored' }))
      .then(() => window.location.reload())
      .catch((error: unknown) => {
        setImportBusy(false);
        notify({ actionId: `restore:recovery:error:${Date.now()}`, kind: 'error', title: 'Recovery failed', description: error instanceof Error ? error.message : 'The previous data could not be restored.' });
        setImportError(
          error instanceof Error ? error.message : 'The previous data could not be restored.',
        );
      });
  };

  const handleConfirmImport = () => {
    if (!importPreview) return;
    setImportBusy(true);
    setImportError(null);
    void import('@/lib/storage/backup-repository')
      .then(({ restoreDataOnlyImport }) => restoreDataOnlyImport(importPreview, importMode))
      .then(() => notify({ actionId: `restore:data:${Date.now()}`, kind: 'success', title: 'Data restored' }))
      .then(() => window.location.reload())
      // Without this the promise chain swallowed every commit failure and the
      // screen simply sat there looking like nothing had happened.
      .catch(async (error: unknown) => {
        console.error(error);
        setImportBusy(false);
        notify({ actionId: `restore:data:error:${Date.now()}`, kind: 'error', title: 'Import failed', description: error instanceof Error ? error.message : 'The import could not be completed.' });
        setImportError(
          error instanceof Error ? error.message : 'The import could not be completed.',
        );
        try {
          const { getPreImportRecovery } = await import('@/lib/storage/backup-repository');
          setImportRecovery(await getPreImportRecovery());
        } catch {
          /* recovery availability is best-effort */
        }
      });
  };

  /* =========================================
     COMPONENT MAP
  ========================================= */

  const consumeCatalogFeatureRequest = useCallback((signal: number) => {
    setSectionFeatureRequest(current =>
      current &&
      current.profileId === appContext.currentProfileId &&
      ['entertainment', 'music'].includes(current.section) &&
      current.signal === signal
        ? null
        : current,
    );
  }, [appContext.currentProfileId]);

  const renderActiveSection = () => {
    switch (activeTab) {
      case 'balance':
        return (
          <BalanceSection
            androidPresentation={androidPresentation}
            initialView={lastBalanceView}
            onViewChange={setLastBalanceView}
            requestedView={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'balance' &&
              isMoneyView(sectionFeatureRequest.feature)
                ? sectionFeatureRequest.feature
                : undefined
            }
            requestedViewSignal={sectionFeatureRequest?.signal}
            requestedFeature={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'balance'
                ? sectionFeatureRequest.feature
                : undefined
            }
            requestedRecordId={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'balance'
                ? sectionFeatureRequest.recordId
                : undefined
            }
          />
        );
      case 'inventory':
        return (
          <InventorySection
            compactMobileMode={compactMobileMode && !androidPresentation}
            androidPresentation={androidPresentation}
            onAddClick={() => setShowAddModal(true)}
            requestedRecordId={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'inventory'
                ? sectionFeatureRequest.recordId
                : undefined
            }
            requestedRecordSignal={sectionFeatureRequest?.signal}
            onRequestedRecordConsumed={consumeCollectionFeatureRequest}
          />
        );
      case 'skincare':
        return (
          <SkincareSection
            androidPresentation={androidPresentation}
            onAddClick={() => setShowAddModal(true)}
            requestedRecordId={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'skincare'
                ? sectionFeatureRequest.recordId
                : undefined
            }
            requestedRecordSignal={sectionFeatureRequest?.signal}
            onRequestedRecordConsumed={consumeCollectionFeatureRequest}
          />
        );
      case 'health': {
        const request = getProfileBoundSectionRequest(
          sectionFeatureRequest,
          'health',
          appContext.currentProfileId,
        );
        return (
          <HealthSection
            openAddFoodSignal={openAddFoodSignal}
            compactMobileMode={compactMobileMode && !androidPresentation}
            androidPresentation={androidPresentation}
            requestedProfileId={request?.profileId}
            requestedView={request?.feature}
            requestedViewSignal={request?.signal}
            requestedRecordId={request?.recordId}
            requestedDateKey={request?.dateKey}
            onRequestedViewConsumed={consumeHealthFeatureRequest}
            onOpenLifeHub={() => setActiveTab('lifehub')}
            onAddSupplementClick={() => {
              setActiveSupplementId(null);
              setShowAddModal(true);
            }}
          />
        );
      }
      case 'entertainment':
        return (
          <EntertainmentSection
            androidPresentation={androidPresentation}
            requestedProfileId={sectionFeatureRequest?.profileId}
            onAddClick={() => setShowAddModal(true)}
            requestedRecordId={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'entertainment'
                ? sectionFeatureRequest.recordId
                : undefined
            }
            requestedRecordType={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'entertainment'
                ? sectionFeatureRequest.feature
                : undefined
            }
            requestedRecordSignal={sectionFeatureRequest?.signal}
            onRequestedRecordConsumed={consumeCatalogFeatureRequest}
          />
        );
      case 'music':
        return (
          <MusicSection
            androidPresentation={androidPresentation}
            requestedProfileId={sectionFeatureRequest?.profileId}
            requestedRecordId={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'music'
                ? sectionFeatureRequest.recordId
                : undefined
            }
            requestedRecordSignal={sectionFeatureRequest?.signal}
            onRequestedRecordConsumed={consumeCatalogFeatureRequest}
          />
        );
      case 'lifehub': {
        const request = getProfileBoundSectionRequest(
          sectionFeatureRequest,
          'lifehub',
          appContext.currentProfileId,
        );
        return (
          <LifeHubSection
            openTaskSignal={openLifeTaskSignal}
            onAddJournal={() => setQuickAddRequest({ kind: 'journal' })}
            compactMobileMode={compactMobileMode && !androidPresentation}
            androidPresentation={androidPresentation}
            requestedProfileId={request?.profileId}
            requestedView={request?.feature}
            requestedViewSignal={request?.signal}
            requestedRecordId={request?.recordId}
            requestedDateKey={request?.dateKey}
            onRequestedViewConsumed={consumeLifeHubFeatureRequest}
          />
        );
      }
      case 'workhub': {
        const request = getProfileBoundSectionRequest(
          sectionFeatureRequest,
          'workhub',
          appContext.currentProfileId,
        );
        return (
          <WorkHubSection
            openNoteSignal={openWorkNoteSignal}
            androidPresentation={androidPresentation}
            requestedProfileId={request?.profileId}
            requestedRecordId={request?.recordId}
            requestedRecordSignal={request?.signal}
            onRequestedRecordConsumed={consumeWorkHubFeatureRequest}
          />
        );
      }
      case 'personalhub':
        return (
          <PersonalVaultSection
            androidPresentation={androidPresentation}
            requestedProfileId={sectionFeatureRequest?.profileId}
            requestedRecordId={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'personalhub'
                ? sectionFeatureRequest.recordId
                : undefined
            }
            requestedRecordType={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'personalhub'
                ? sectionFeatureRequest.feature
                : undefined
            }
            requestedRecordSignal={sectionFeatureRequest?.signal}
            onRequestedRecordConsumed={consumePersonalVaultFeatureRequest}
          />
        );
      default:
        return (
          <Dashboard
            learningVisible={showWelcome || isDemoMode || sectionHelpOpen || firstActionSection === activeTab}
            preferences={dashboardPreferences}
            onPreferencesChange={setDashboardPreferencesPersisted}
            androidCompact={androidPresentation}
            onQuickAdd={kind => openQuickAdd(kind)}
            requestedProfileId={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'dashboard'
                ? sectionFeatureRequest.profileId
                : undefined
            }
            requestedFeature={
              sectionFeatureRequest?.profileId === appContext.currentProfileId &&
              sectionFeatureRequest?.section === 'dashboard'
                ? sectionFeatureRequest.feature
                : undefined
            }
            requestedFeatureSignal={sectionFeatureRequest?.signal}
            onRequestedFeatureConsumed={consumeDashboardFeatureRequest}
          />
        );
    }
  };

  const renderActiveAddModal = () => {
    const onClose = () => {
      setShowAddModal(false);
      setActiveSupplementId(null);
    };
    switch (activeTab) {
      case 'inventory':
        return <InventoryModal isOpen androidPresentation={androidPresentation} onClose={onClose} />;
      case 'skincare':
        return <SkincareModal isOpen androidPresentation={androidPresentation} onClose={onClose} />;
      case 'health':
        return (
          <SupplementModal
            isOpen
            supplementId={activeSupplementId}
            onClose={onClose}
          />
        );
      case 'entertainment':
        return <EntertainmentModal isOpen onClose={onClose} />;
      case 'music':
        return <MusicModal isOpen onClose={onClose} />;
      default:
        return null;
    }
  };

  const quickAddItems = [
    {
      id: 'wallet',
      label: 'Wallet',
      description: 'Add a wallet or balance source',
    },
    {
      id: 'inventory',
      label: 'Asset',
      description: 'Add equipment or inventory',
    },
    {
      id: 'wishlist',
      label: 'Plan',
      description: 'Add a plan to Purchase plans',
    },
    {
      id: 'health',
      label: 'Supplement',
      description: 'Add a health supplement',
    },
    {
      id: 'health-food',
      label: 'Food',
      description: 'Open Food Log for quick food entry',
    },
    {
      id: 'weight',
      label: 'Weight',
      description: 'Log a new weight reading',
    },
    {
      id: 'health-sleep',
      label: 'Sleep',
      description: 'Log last night’s sleep',
    },
    {
      id: 'health-water',
      label: 'Water',
      description: 'Log water intake',
    },
    {
      id: 'expense',
      label: 'Expense',
      description: 'Add a one-time payment in Money',
    },
    {
      id: 'journal',
      label: 'Journal entry',
      description: 'Write a journal entry in Life Hub',
    },
    {
      id: 'game',
      label: 'Game',
      description: 'Add a game in Entertainment · Games',
    },
    {
      id: 'entertainment',
      label: 'Media',
      description: 'Add anime, manga, movie, or series',
    },
    {
      id: 'music',
      label: 'Music',
      description: 'Add a song, playlist, or mix',
    },
    {
      id: 'skincare',
      label: 'Skincare product',
      description: 'Add a product to your skincare routine',
    },
    {
      id: 'task',
      label: 'Task',
      description: 'Add a Life Hub task',
    },
    {
      id: 'routine',
      label: 'Routine',
      description: 'Add a recurring Life Hub routine',
    },
    {
      id: 'date',
      label: 'Important date',
      description: 'Add an important date in Life Hub',
    },
    {
      id: 'workhub',
      label: 'Work',
      description: 'Add a project, task, report, file, or presentation',
    },
    {
      id: 'personalhub',
      label: 'Personal Item',
      description: 'Add a document, resume, achievement, install link, image, or video',
    },
  ];

  const openSection = (tabId: string) => {
    setActiveTab(tabId);
    closeCommandPalette();
    setShowMobileTools(false);
  };

  const openQuickAdd = (tabId: string) => {
    const kindByAction: Record<string, QuickAddKind> = {
      balance: 'wallet',
      wallet: 'wallet',
      inventory: 'inventory',
      wishlist: 'wishlist',
      health: 'supplement',
      'health-food': 'food',
      supplement: 'supplement',
      food: 'food',
      weight: 'weight',
      'health-sleep': 'sleep',
      sleep: 'sleep',
      'health-water': 'water',
      water: 'water',
      expense: 'expense',
      journal: 'journal',
      games: 'game',
      entertainment: 'media',
      media: 'media',
      game: 'game',
      music: 'music',
      skincare: 'skincare',
      lifehub: 'task',
      task: 'task',
      routine: 'routine',
      date: 'date',
      workhub: 'work',
      work: 'work',
      personalhub: 'personal',
      personal: 'personal',
    };
    const kind = kindByAction[tabId];
    if (!kind) return;

    setQuickAddRequest({ kind });
    closeCommandPalette();
    setShowMobileTools(false);
  };

  const openSearchResult = (result: ReturnType<typeof searchProfileRecords>[number]) => {
    const profile = appContext.getCurrentProfile();
    if (!isGlobalSearchResultAvailable(profile, result)) {
      setSectionFeatureRequest(null);
      setActiveTab(result.section === 'wishlist' ? 'balance' : result.section === 'journal' ? 'lifehub' : result.section === 'games' ? 'entertainment' : result.section);
      notify({
        actionId: `search:stale:${result.id}:${Date.now()}`,
        kind: 'warning',
        title: 'Record unavailable',
        description: 'This result is no longer available in the active profile.',
      });
      setShowMobileTools(false);
      closeCommandPalette();
      return;
    }
    if (result.recordType === 'supplement') {
      setSectionFeatureRequest(null);
      setActiveTab('health');
      setActiveSupplementId(result.recordId);
      setShowAddModal(true);
      setShowMobileTools(false);
      closeCommandPalette();
      return;
    }
    const section = result.section === 'wishlist'
        ? 'balance'
        : result.section === 'journal'
          ? 'lifehub'
          : result.section === 'games'
            ? 'entertainment'
          : result.section;
    const feature = result.feature === 'wishlist-item' ? 'plan-item' : result.feature;
    setSectionFeatureRequest(current => ({
      section,
      feature,
      recordId: result.recordId,
      signal: nextSectionFeatureRequestSignal(),
      profileId: appContext.currentProfileId,
    }));
    setActiveTab(section);
    setShowMobileTools(false);
    closeCommandPalette();
  };

  const consumeHealthFeatureRequest = useCallback((signal: number) => {
    setSectionFeatureRequest(current =>
      current?.profileId === appContext.currentProfileId &&
      current.section === 'health' && current.signal === signal
        ? null
        : current,
    );
  }, [appContext.currentProfileId]);

  const consumeCollectionFeatureRequest = useCallback((signal: number) => {
    setSectionFeatureRequest(current =>
      current &&
      current.profileId === appContext.currentProfileId &&
      ['inventory', 'wishlist', 'skincare'].includes(current.section) &&
      current.signal === signal
        ? null
        : current,
    );
  }, [appContext.currentProfileId]);

  const consumePersonalVaultFeatureRequest = useCallback((signal: number) => {
    setSectionFeatureRequest(current =>
      current?.profileId === appContext.currentProfileId &&
      current.section === 'personalhub' && current.signal === signal
        ? null
        : current,
    );
  }, [appContext.currentProfileId]);

  const consumeLifeHubFeatureRequest = useCallback((signal: number) => {
    setSectionFeatureRequest(current =>
      current?.profileId === appContext.currentProfileId &&
      current.section === 'lifehub' &&
      current.signal === signal
        ? null
        : current,
    );
  }, [appContext.currentProfileId]);

  const consumeDashboardFeatureRequest = useCallback((signal: number) => {
    setSectionFeatureRequest(current =>
      current &&
      current.profileId === appContext.currentProfileId &&
      current.section === 'dashboard' &&
      current.signal === signal
        ? null
        : current,
    );
  }, [appContext.currentProfileId]);

  const consumeWorkHubFeatureRequest = useCallback((signal: number) => {
    setSectionFeatureRequest(current =>
      current?.profileId === appContext.currentProfileId &&
      current.section === 'workhub' &&
      current.signal === signal
        ? null
        : current,
    );
  }, [appContext.currentProfileId]);

  const recordSearchResults = useMemo(
    () => searchProfileRecords(appContext.getCurrentProfile(), commandSearch),
    [appContext.profiles, appContext.currentProfileId, commandSearch],
  );

  const commandItems = [
    { id: 'about-section', title: 'About this area', description: 'Purpose, first action, and related areas', group: 'Help', action: () => { setSectionHelpOpen(true); closeCommandPalette(); } },
    { id: 'learn-caizen', title: 'Learn Caizen', description: 'Sections, backups, and Demo', group: 'Help', action: () => { setShowUserGuide(true); closeCommandPalette(); } },
    ...visibleTabs.map(tab => ({
      id: `section-${tab.id}`,
      title: `Open ${tab.label}`,
      description: 'Jump to section',
      group: 'Sections',
      action: () => openSection(tab.id),
    })),
    ...quickAddItems.map(item => ({
      id: `add-${item.id}`,
      title: `Add ${item.label}`,
      description: item.description,
      group: 'Quick Add',
      action: () => openQuickAdd(item.id),
    })),
    {
      id: 'open-calendar',
      title: 'Open Calendar',
      description: 'Open Life Hub calendar and dates',
      group: 'Personal',
      action: () => {
        setActiveTab('lifehub');
        setSectionFeatureRequest({
          section: 'lifehub',
          feature: 'dates',
          signal: nextSectionFeatureRequestSignal(),
          profileId: appContext.currentProfileId,
        });
        closeCommandPalette();
      },
    },
    {
      id: 'open-trash',
      title: 'Open Recently Deleted',
      description: 'Review recently deleted items',
      group: 'Tools',
      action: () => {
        setShowTrashModal(true);
        closeCommandPalette();
      },
    },
    {
      id: 'open-meal-templates',
      title: 'Open Meal Templates',
      description: 'Open Health saved meal templates',
      group: 'Health',
      action: () => {
        setActiveTab('health');
        setSectionFeatureRequest(() => ({
          section: 'health',
          feature: 'saved',
          signal: nextSectionFeatureRequestSignal(),
          profileId: appContext.currentProfileId,
        }));
        closeCommandPalette();
      },
    },
    {
      id: 'open-journal',
      title: 'Open Journal',
      description: 'Open Life Hub · Journal',
      group: 'Personal',
      action: () => {
        setActiveTab('lifehub');
        setSectionFeatureRequest({
          section: 'lifehub',
          feature: 'journal',
          signal: nextSectionFeatureRequestSignal(),
          profileId: appContext.currentProfileId,
        });
        closeCommandPalette();
      },
    },
    {
      id: 'open-food-log',
      title: 'Open Food Log',
      description: 'Open the Health food log',
      group: 'Health',
      action: () => {
        setActiveTab('health');
        setSectionFeatureRequest(() => ({
          section: 'health',
          feature: 'food',
          signal: nextSectionFeatureRequestSignal(),
          profileId: appContext.currentProfileId,
        }));
        closeCommandPalette();
      },
    },
    {
      id: 'open-workout',
      title: 'Open Workout',
      description: 'Open Health guided workouts',
      group: 'Health',
      action: () => {
        setActiveTab('health');
        setSectionFeatureRequest(() => ({
          section: 'health',
          feature: 'workout',
          signal: nextSectionFeatureRequestSignal(),
          profileId: appContext.currentProfileId,
        }));
        closeCommandPalette();
      },
    },
    {
      id: 'open-activity',
      title: 'Open Activity',
      description: 'Open Health activity and workouts',
      group: 'Health',
      action: () => {
        setActiveTab('health');
        setSectionFeatureRequest(() => ({
          section: 'health',
          feature: 'workout',
          signal: nextSectionFeatureRequestSignal(),
          profileId: appContext.currentProfileId,
        }));
        closeCommandPalette();
      },
    },
    {
      id: 'open-workhub',
      title: 'Open Work Hub',
      description: 'Open projects, tasks, notes, and resources',
      group: 'Work',
      action: () => openSection('workhub'),
    },
    {
      id: 'start-focus-mode',
      title: 'Start Focus Mode',
      description: 'Reduce the app to practical actions',
      group: 'Tools',
      action: () => {
        setFocusMode(true);
        setActiveTab('dashboard');
        closeCommandPalette();
      },
    },
    {
      id: 'open-backup',
      title: 'Open Cloud Backup',
      description: 'Open Cloud Backup settings',
      group: 'Tools',
      action: () => {
        setShowCloudSyncModal(true);
        closeCommandPalette();
      },
    },
    {
      id: 'open-milestones',
      title: 'Open Milestones',
      description: 'Review meaningful progress across Caizen',
      group: 'Dashboard',
      action: () => {
        setActiveTab('dashboard');
        setSectionFeatureRequest({
          section: 'dashboard',
          feature: 'milestones',
          signal: nextSectionFeatureRequestSignal(),
          profileId: appContext.currentProfileId,
        });
        closeCommandPalette();
      },
    },
    {
      id: 'settings',
      title: 'Settings Hub',
      description: 'Backup, profile, themes, and animations',
      group: 'Tools',
      action: () => {
        setShowSettingsHub(true);
        closeCommandPalette();
      },
    },
  ];

  const recordCommandItems = recordSearchResults.map(result => ({
    id: `record-${result.id}`,
    title: result.title,
    description: result.description,
    group: 'Records',
    action: () => openSearchResult(result),
  }));

  const matchingCommands = commandItems.filter(item =>
    `${item.title} ${item.description} ${item.group}`
      .toLowerCase()
      .includes(commandSearch.toLowerCase())
  );
  const matchingRecords = recordCommandItems.filter(item =>
    `${item.title} ${item.description} ${item.group}`
      .toLowerCase()
      .includes(commandSearch.toLowerCase())
  );
  const filteredCommandItems = commandSearch.trim()
    ? [...matchingRecords, ...matchingCommands]
    : [...matchingCommands, ...matchingRecords];
  const filteredCommandGroups = filteredCommandItems.reduce(
    (groups, item) => {
      const current = groups.find(group => group.group === item.group);
      if (current) current.items.push(item);
      else groups.push({ group: item.group, items: [item] });
      return groups;
    },
    [] as Array<{ group: string; items: typeof filteredCommandItems }>,
  );

  useEffect(() => {
    setCommandSelectedIndex(0);
  }, [commandSearch, filteredCommandItems.length]);

  useEffect(() => {
    if (showCommandPalette) setCommandSelectedIndex(0);
  }, [showCommandPalette]);

  useOverlayLifecycle(showCommandPalette, closeCommandPaletteAnimated, {
    containerRef: commandPanelRef,
    initialFocusRef: commandInputRef,
  });
  useOverlayLifecycle(showAppearancePanel, closeAppearancePanel, {
    containerRef: appearancePanelRef,
    initialFocusSelector: 'button[aria-label="Close appearance settings"], button',
  });
  useOverlayLifecycle(showMobileTools, closeMobileTools, {
    containerRef: mobileToolsPanelRef,
    initialFocusSelector: 'button[aria-label^="Close"], input, button',
  });
  useOverlayLifecycle(demoTransitionBusy, () => undefined, {
    containerRef: demoTransitionPanelRef,
    initialFocusRef: demoTransitionPanelRef,
    restoreFocus: false,
  });

  const activateSelectedCommand = () => {
    filteredCommandItems[commandSelectedIndex]?.action();
  };

  const primaryMobileTabs =
    androidPresentation
      ? primaryNavTabs
        .map(id => visibleTabs.find(tab => tab.id === id))
        .filter((tab): tab is typeof visibleTabs[number] => Boolean(tab))
      : compactMobileMode
      ? visibleTabs.filter(tab =>
        ['health', 'lifehub'].includes(tab.id)
      )
      : visibleTabs;

  const activeTabInPrimary =
    primaryMobileTabs.some(
      tab => tab.id === activeTab
    );

  const openCloudContinuityReview = () => {
    if (!cloudContinuityNotice) return;
    setCloudContinuityNotice(null);
    setShowMobileTools(false);
    setCloudRecoveryOffer(cloudContinuityNotice);
  };

  const dismissCloudContinuityNotice = () => {
    const notice = cloudContinuityNotice;
    setCloudContinuityNotice(null);
    if (notice?.candidate.backup) {
      void recordCloudRecoveryCandidateDecision(
        notice.discovery.userId,
        notice.candidate.backup,
        'dismissed',
      ).catch(() => undefined);
    }
  };

  return (

    <main
      data-caizen-section={activeTab}
      data-caizen-top-stack={
        isDemoMode && focusMode
          ? 'multiple'
          : isDemoMode || focusMode
            ? 'status'
            : undefined
      }
      data-caizen-overlay={
        showAddModal ||
        Boolean(quickAddRequest) ||
        showBackupModal ||
        showCloudSyncModal ||
        showMobileTools ||
        showAppearancePanel ||
        showSettingsHub ||
        showTrashModal ||
        showPetModal ||
        showCommandPalette ||
        showWelcome ||
        showUserGuide ||
        Boolean(confirmAction) ||
        Boolean(importPreview) ||
        demoTransitionBusy ||
        Boolean(appNotice)
          ? 'open'
          : undefined
      }
      className="caizen-app
    min-h-screen
    w-full
    overflow-x-hidden
    text-foreground
  "
    >

      {demoTransitionBusy && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-background/95 px-5" data-caizen-overlay="open">
          <section ref={demoTransitionPanelRef} tabIndex={-1} role="status" aria-live="polite" className="text-center outline-none">
            <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-sm font-semibold">Saving your workspace</p>
          </section>
        </div>
      )}

      {isDemoMode && (
        <div className="sticky top-0 z-[90] border-b border-primary/20 bg-background/92 px-3 py-2.5 shadow-sm backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>

              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  Demo workspace
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {DEMO_PROFILE_DISPLAY_NAME} · Sample data · Your workspace is preserved
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                ref={demoCompassTriggerRef}
                type="button"
                aria-expanded={demoCompassOpen}
                aria-controls="caizen-section-guide"
                onClick={reopenDemoCompass}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-xs font-semibold"
              >
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                Guide
              </button>
              <details className="android-demo-options relative">
                <summary className="flex min-h-11 cursor-pointer items-center rounded-xl border border-border px-3 text-xs font-semibold">Demo options</summary>
                <div className="android-demo-options-menu absolute right-0 top-full z-10 mt-2 w-60 rounded-xl border border-border bg-popover p-2 shadow-lg">
                  {demoSession?.templateVersion !== DEMO_CONTENT_VERSION && <p className="px-3 py-2 text-sm">Updated sample available</p>}
                  <button type="button" className="min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-muted" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); requestDemoMode(true, isDemoEntrySection(activeTab) ? activeTab : 'dashboard'); }}>Reset Demo</button>
                </div>
              </details>

              <Tooltip><TooltipTrigger asChild><button
                type="button"
                onClick={() =>
                  void requestExitDemoMode()
                }
                className="min-h-11 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                {demoReturnLabel(demoSession)}
              </button></TooltipTrigger><TooltipContent>{"Exit Demo and restore your preserved workspace"}</TooltipContent></Tooltip>
            </div>
          </div>
        </div>
      )}


      {focusMode && (
        <div className="sticky top-0 z-[91] border-b border-primary/30 bg-primary/15 px-3 py-2 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-semibold text-primary">
              Focus Mode - practical actions first
            </p>
            <button type="button" onClick={() => setFocusMode(false)} className="rounded-2xl border border-primary/30 bg-background/70 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/40">
              Exit Focus
            </button>
          </div>
        </div>
      )}

      {cloudContinuityNotice && (
        <div
          className="sticky top-0 z-[92] border-b border-primary/20 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur-xl"
          data-testid="cloud-continuity-notice"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Cloud className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {cloudContinuityNotice.candidate.classification === 'matching-cloud-newer'
                    ? 'Cloud backup changed'
                    : 'Another profile backup is available'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {cloudContinuityNotice.candidate.classification === 'matching-cloud-newer'
                    ? `Latest Cloud backup: ${formatSyncTime(cloudContinuityNotice.candidate.cloudUpdatedAt)}. Review it before choosing a version. Your local workspace remains available.`
                    : 'Another profile backup is available for this Cloud account. Review it when you are ready.'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={dismissCloudContinuityNotice}
                className="min-h-12 rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={openCloudContinuityReview}
                className="min-h-12 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Review backup
              </button>
            </div>
          </div>
        </div>
      )}



      {/* ====================================
          HEADER
      ========================================= */}

      <header
        className="caizen-header
          sticky top-0 z-40
          border-b border-border/40
          shadow-sm
        "
      >

        {/* TOP BAR */}

        <div
          className="caizen-topbar
    mx-auto
    flex
    max-w-[1600px]
    min-w-0
    items-center
    justify-between
    gap-3
    px-3
    py-3

    sm:px-6

    md:py-4
  "
        >



          {/* LEFT */}
          {androidPresentation ? (
            <div className="android-app-bar-identity">
              <span className="android-app-bar-avatar" aria-hidden="true">
                <img src="/icons/caizen-android-icon-1024.png" alt="" className="h-5 w-5 object-contain" />
              </span>
              <span className="android-app-bar-copy">
                <strong>
                  {activeTab === 'balance'
                    ? 'Money'
                    : tabs.find(tab => tab.id === activeTab)?.label || 'Caizen'}
                </strong>
                <span>
                  {nativeConnected
                    ? appContext.getCurrentProfile()?.name || 'Local profile'
                    : 'Offline · Local data available'}
                </span>
              </span>
            </div>
          ) : (
            <div className="caizen-desktop-identity">
              <GameLogo />
              <span className="caizen-header-section-divider" aria-hidden="true" />
              <span className="caizen-header-section-copy">
                <small>Current section</small>
                <strong>{activeTab === 'balance' ? 'Money' : tabs.find(tab => tab.id === activeTab)?.label || 'Dashboard'}</strong>
                {showLastSavedTime && lastSavedAt && !Number.isNaN(Date.parse(lastSavedAt)) && (
                  <OverflowTooltip text={new Date(lastSavedAt).toLocaleString()}><small className="caizen-header-last-saved max-w-48 truncate">Last saved {new Date(lastSavedAt).toLocaleString()}</small></OverflowTooltip>
                )}
              </span>
            </div>
          )}

          {/* RIGHT */}
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 md:gap-2">
            {!androidPresentation ? (
              <>
                <Tooltip><TooltipTrigger asChild><button aria-label="Search Caizen (/, Ctrl/Cmd + K)"
                  type="button"
                  onClick={() => setShowCommandPalette(true)}
                  aria-keyshortcuts="/ Control+k Meta+k"
                  className="caizen-command-trigger hidden min-w-[220px] items-center gap-2 rounded-2xl border border-border/65 bg-card px-3.5 py-2.5 text-sm text-muted-foreground shadow-sm transition hover:border-primary/25 hover:bg-card lg:flex"
                >
                  <Search className="h-4 w-4" />
                  <span className="flex-1 text-left font-semibold">Search Caizen</span>
                  <kbd className="rounded-md border border-border/70 bg-background/70 px-1.5 py-0.5 text-[10px] font-black">/</kbd>
                </button></TooltipTrigger><TooltipContent>{"Search Caizen (/, Ctrl/Cmd + K)"}</TooltipContent></Tooltip>

                <Tooltip><TooltipTrigger asChild><button
                  type="button"
                  onClick={() => setShowSettingsHub(true)}
                  className="caizen-header-icon-action"
                  aria-label="Open Settings"
                >
                  <Settings className="h-4.5 w-4.5" />
                </button></TooltipTrigger><TooltipContent>{"Settings"}</TooltipContent></Tooltip>

                <Tooltip><TooltipTrigger asChild><button
                  type="button"
                  onClick={() => setShowTrashModal(true)}
                  className="caizen-header-icon-action hidden sm:inline-flex"
                  aria-label="Open Trash"
                >
                  <Trash2 className="h-4.5 w-4.5" />
                </button></TooltipTrigger><TooltipContent>{"Trash"}</TooltipContent></Tooltip>

                <PetButton onClick={() => setShowPetModal(true)} />
                <ThemeToggle />
              </>
            ) : null}

            <ProfileSwitcher
              onOpenCloudBackup={() => isDemoMode ? void requestExitDemoMode() : setShowCloudSyncModal(true)}
              cloudStatus={cloudStatusSummary}
            />

            <button
              type="button"
              onClick={() => setShowMobileTools(true)}
              className="caizen-header-more inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/65 bg-card text-foreground shadow-sm xl:hidden"
              aria-label="Open more tools"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* =========================================
            NAVIGATION
        ========================================= */}

        <div
          className="caizen-desktop-nav hidden px-3 py-3 sm:px-6 md:block"
        >
          <div
            className="caizen-desktop-nav-track mx-auto max-w-[1600px]"
            data-has-hidden={hiddenTabs.length > 0 ? 'true' : 'false'}
          >
            <div
              className="caizen-desktop-nav-scroll-shell"
              data-has-overflow={desktopNavScrollState.hasOverflow ? 'true' : 'false'}
              data-can-scroll-left={desktopNavScrollState.canScrollLeft ? 'true' : 'false'}
              data-can-scroll-right={desktopNavScrollState.canScrollRight ? 'true' : 'false'}
            >
              <div
                ref={desktopNavScrollRef}
                className="caizen-desktop-nav-scroll desktop-section-nav-scroll scrollbar-hide"
              >
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => setActiveDragId(null)}
                  modifiers={[restrictToHorizontalAxis]}
                >
                  <SortableContext
                    items={visibleTabs.map(tab => tab.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    <nav
                      className="caizen-desktop-nav-list"
                      aria-label="Caizen sections"
                      aria-describedby={desktopNavScrollState.hasOverflow ? 'caizen-desktop-nav-overflow-hint' : undefined}
                    >
                      {visibleTabs.map(tab => (
                        <SortableTab
                          key={tab.id}
                          setHiddenMenuPosition={setHiddenMenuPosition}
                          tab={tab}
                          activeTab={activeTab}
                          setActiveTab={setActiveTab}
                          setContextTab={setContextTab}
                          setContextPosition={setContextPosition}
                          showStreakGlow={showNavStreakGlow}
                          streakCount={
                            sectionStreaks[
                              tab.id as keyof typeof sectionStreaks
                            ] || 0
                          }
                          updateCount={tab.id === 'entertainment' ? entertainmentUpdateCount : 0}
                        />
                      ))}
                    </nav>
                  </SortableContext>
                  <DragOverlay
                    dropAnimation={reduceMotion ? null : {
                      duration: 170,
                      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  >
                    {activeDragId ? (() => {
                      const tab = visibleTabs.find(item => item.id === activeDragId);
                      return tab ? (
                        <NavTabDragPreview
                          tab={tab}
                          activeTab={activeTab}
                          showStreakGlow={showNavStreakGlow}
                          streakCount={
                            sectionStreaks[
                              tab.id as keyof typeof sectionStreaks
                            ] || 0
                          }
                          updateCount={tab.id === 'entertainment' ? entertainmentUpdateCount : 0}
                        />
                      ) : null;
                    })() : null}
                  </DragOverlay>
                </DndContext>
              </div>
              {desktopNavScrollState.hasOverflow ? (
                <span id="caizen-desktop-nav-overflow-hint" className="sr-only">
                  More Caizen sections are available. Scroll horizontally to view them.
                </span>
              ) : null}
            </div>

            {hiddenTabs.length > 0 && (
              <div className="caizen-hidden-tabs-slot">
                <Tooltip><TooltipTrigger asChild><button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    setContextTab(null);

                    const rect =
                      event.currentTarget.getBoundingClientRect();
                    const menuWidth = 240;
                    const viewportPadding = 12;

                    setHiddenMenuPosition({
                      x: Math.max(
                        viewportPadding,
                        Math.min(
                          rect.right - menuWidth,
                          window.innerWidth - menuWidth - viewportPadding,
                        ),
                      ),
                      y: rect.bottom + 8,
                    });
                  }}
                  className="caizen-hidden-tabs-button"
                  aria-label={`${hiddenTabs.length} hidden sections`}
                  aria-haspopup="menu"
                  aria-expanded={Boolean(hiddenMenuPosition)}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="caizen-hidden-tabs-count">
                    {hiddenTabs.length}
                  </span>
                </button></TooltipTrigger><TooltipContent>{`${hiddenTabs.length} hidden sections`}</TooltipContent></Tooltip>
              </div>
            )}
          </div>
        </div>

      </header>

      {/* =========================================
          CONTENT
      ========================================= */}

      <section
        id="caizen-section-content"
        tabIndex={-1}
        className="caizen-content
    mx-auto
    max-w-[1600px]
    px-3
    py-3
    mobile-content-safe

    sm:px-6
    sm:py-4

    md:pb-40
  "
      >



        <div
          key={appContext.currentProfileId}
          className="caizen-stage
  tab-content-enter
  p-1
  sm:p-2
  md:p-3
"
        >

          <SectionErrorBoundary sectionName={activeTab}>
            {currentProfile && !isDemoMode && !showWelcome && (sectionHelpOpen || firstActionSection === activeTab) && (
              <button type="button" className="mb-3 min-h-11 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" id="caizen-section-help-trigger" onClick={dismissSectionHelp} aria-expanded={true}>About this area</button>
            )}
            {(isDemoMode || (!showWelcome && (sectionHelpOpen || firstActionSection === activeTab))) && <SectionGuide
              sectionId={activeTab} mode={isDemoMode ? 'demo' : 'help'} open={isDemoMode ? demoCompassOpen : true}
              onOpen={() => isDemoMode ? reopenDemoCompass() : setSectionHelpOpen(true)}
              onDismiss={isDemoMode ? dismissDemoCompass : dismissSectionHelp}
              onNavigate={section => setActiveTab(section)} onFirstAction={kind => setQuickAddRequest({ kind })}
              onDemo={() => requestDemoMode(false, isDemoEntrySection(activeTab) ? activeTab : 'dashboard', undefined, 'section-help')}
            />}
      {currentProfile &&
        typeof window !== 'undefined' &&
        localStorage.getItem(ONBOARDING_PENDING_KEY) === 'true' &&
        !isDemoMode &&
        !showBackupModal &&
        !showCloudSyncModal &&
        !cloudRecoveryOffer &&
        !cloudContinuityNotice &&
        !confirmAction &&
        (!onboardingProfileReady) && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-background px-5" data-caizen-overlay="open">
            <section role="status" aria-live="polite" className="w-full max-w-sm text-center">
              <h2 className="text-section-title">Preparing your space</h2>
              {onboardingPreparationError ? (
                <>
                  <p className="mt-3 text-sm text-muted-foreground">{onboardingPreparationError}</p>
                  <button type="button" onClick={() => setOnboardingPreparationAttempt(value => value + 1)} className="control-button-primary mt-5 min-h-11 rounded-xl px-5">Retry</button>
                </>
              ) : <p className="mt-3 text-sm text-muted-foreground">Checking local data.</p>}
            </section>
          </div>
        )}

      {currentProfile &&
        typeof window !== 'undefined' &&
        localStorage.getItem(ONBOARDING_PENDING_KEY) === 'true' && (
        <OnboardingFlow
          key={`${currentProfile.id}:${localStorage.getItem(SETUP_COMPLETED_KEY) === 'true' ? 'replay' : 'fresh'}`}
          isOpen={showWelcome}
          profileId={currentProfile.id}
          profileName={currentProfile.name}
          currency={currentProfile.baseCurrency || currentProfile.currency || 'PHP'}
          mode={localStorage.getItem(SETUP_COMPLETED_KEY) === 'true' ? 'replay' : 'fresh'}
          activeTab={activeTab}
          onComplete={completeOnboarding}
          onPreviewSection={setActiveTab}
          onSkip={async () => {
            await waitForOnboardingProfileSave(currentProfile.id, { name: currentProfile.name });
            if (currentProfileIdRef.current !== currentProfile.id) {
              throw new Error('The active profile changed before onboarding finished.');
            }
            await clearOnboardingDraft(currentProfile.id);
            completeSetup();
            setFirstActionSection('dashboard');
          }}
          onCloud={() => {
            setOnboardingCloudReady(false);
            setShowCloudSyncModal(true);
          }}
          onRestore={format => {
            setBackupMode(format === 'complete' ? 'import-complete' : 'import-data');
            setShowBackupModal(true);
          }}
          onDemo={(sectionId, draft) => requestDemoMode(false, sectionId, draft)}
          onFirstAction={kind => setQuickAddRequest({ kind })}
          onCurrencySettings={() => setShowSettingsHub(true)}
        />
      )}

            <div key={`${activeTab}:${appContext.currentProfileId}`} className="caizen-section-motion">{renderActiveSection()}</div>
          </SectionErrorBoundary>

        </div>

      </section>

      {/* =========================================
          CUSTOMIZE MODAL
      ========================================= */}


      <LearnCaizenDialog
        isOpen={showUserGuide}
        onClose={() => setShowUserGuide(false)}
        onCloseAutoFocus={event => {
          const target = guideReturnFocusRef.current;
          guideReturnFocusRef.current = null;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        onNavigate={section => { guideReturnFocusRef.current = null; setActiveTab(section); setSectionHelpOpen(true); setShowUserGuide(false); }}
      />

      {showBackupModal && (
        <BackupManagerModal
          isOpen
          mode={backupMode}
          onClose={() => setShowBackupModal(false)}
          onRestoreCommitted={completeRestoredOnboarding}
        />
      )}

      {showCloudSyncModal && (
        <CloudModalErrorBoundary onClose={() => setShowCloudSyncModal(false)}>
          <CloudSyncModal
            isOpen
            authMessage={cloudAuthMessage}
            authReturnIntent={showWelcome || localStorage.getItem(ONBOARDING_PENDING_KEY) === 'true' ? 'onboarding' : 'cloud-backup'}
            currentProfileId={appContext.currentProfileId}
            localProfiles={appContext.profiles}
            demoBlocked={isDemoMode || demoTransitionBusy}
            onReturnToWorkspace={() => {
              setShowCloudSyncModal(false);
              setCloudAuthMessage('');
              void requestExitDemoMode();
            }}
            onBeforeBackup={appContext.prepareCloudBackup}
            onBeforeRestore={appContext.beginCloudRestore}
            onClose={() => {
              setShowCloudSyncModal(false);
              setCloudAuthMessage('');
              if (localStorage.getItem(ONBOARDING_PENDING_KEY) === 'true') {
                setOnboardingCloudReady(false);
                scheduleCloudReconciliation(0);
              }
            }}
            onRestoreCommitted={completeRestoredOnboarding}
            onBackupSuccess={() => {
              // This device just became the Cloud baseline, so a "newer Cloud
              // version" notice discovered before this upload is stale.
              // Reconciliation is rescheduled to re-classify against the
              // updated marker rather than trusting the pre-backup notice.
              cloudRecoveryNoticeKeysRef.current.clear();
              setCloudContinuityNotice(null);
              scheduleCloudReconciliation(0);
            }}
          />
        </CloudModalErrorBoundary>
      )}

      {cloudRecoveryOffer && !showCloudSyncModal && !isDemoMode && !isDemoModeActive() && (
        <CloudRecoveryModal
          isOpen
          discovery={cloudRecoveryOffer.discovery}
          candidate={cloudRecoveryOffer.candidate}
          currentProfileId={appContext.currentProfileId}
          onBeforeBackup={appContext.prepareCloudBackup}
          onBeforeRestore={appContext.beginCloudRestore}
          onBackupSuccess={partial => {
            if (partial) setShowCloudSyncModal(true);
            cloudRecoveryNoticeKeysRef.current.clear();
            setCloudContinuityNotice(null);
            scheduleCloudReconciliation(0);
          }}
          onClose={() => setCloudRecoveryOffer(null)}
          onRestoreCommitted={completeRestoredOnboarding}
          onRestored={() => {
            setCloudRecoveryOffer(null);
            window.location.reload();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmText={confirmAction?.confirmText || 'Confirm'}
        cancelText="Cancel"
        isDangerous={confirmAction?.isDangerous ?? false}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.onConfirm()}
      />

      {importPreview && (
        <ImportPreviewScreen
          report={importPreview.report}
          fileName={importFileName}
          mode={importMode}
          onModeChange={setImportMode}
          busy={importBusy}
          error={importError}
          recovery={importRecovery}
          onCancel={closeImportPreview}
          onRecover={handleImportRecover}
          onSaveReport={handleSaveImportReport}
          onConfirm={handleConfirmImport}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(appNotice)}
        title={appNotice?.title || 'Notice'}
        message={appNotice?.message || ''}
        confirmText="OK"
        cancelText="Close"
        isDangerous={false}
        onCancel={() => {
          setAppNotice(null);
        }}
        onConfirm={() => {
          setAppNotice(null);
        }}
      />

      <input
        id="backup-import"
        type="file"
        accept=".json"
        onChange={handleImport}
        className="hidden"
      />
      {/* =========================================
    MOBILE BOTTOM NAVIGATION
========================================= */}

      <div
        className="caizen-mobile-dock
    fixed
    bottom-0
    left-0
    right-0
    z-[70]
    border-t
    border-border/40
    bg-card
    px-3
    py-2
    mobile-bottom-nav
    md:hidden
  "
      >
        <div
          className="caizen-mobile-track
      flex
      items-stretch
      gap-2
      overflow-x-auto
      overscroll-x-contain
      pb-1
      scrollbar-hide
    "
      >
          <div className="caizen-mobile-tabs-scroll flex min-w-0 items-stretch gap-2 overflow-x-auto overscroll-x-contain scrollbar-hide">
            {primaryMobileTabs.map(tab => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                  aria-label={tab.id === 'entertainment' && entertainmentUpdateCount > 0 ? `${tab.label}, ${entertainmentUpdateCount} ${entertainmentUpdateCount === 1 ? 'update' : 'updates'}` : tab.label}
                  onClick={() =>
                    setActiveTab(tab.id)
                  }
                  className={`
            caizen-mobile-tab
            relative
            flex
            h-16
            min-w-[4.75rem]
            flex-col
            items-center
            justify-center
            gap-1
            overflow-visible
            rounded-2xl
            border
            px-2.5
            text-center
            text-[0.75rem]
            font-bold
            leading-tight
            transition-all
            ${activeTab === tab.id
                    ? 'caizen-mobile-tab-active'
                    : 'text-muted-foreground'
                  }
          `}
                >
                  <Icon className="relative z-10 h-4 w-4" />
                  <span className="relative z-10 flex max-w-full items-center gap-1">
                    <span className="min-w-0 truncate">{getShortTabLabel(tab.label)}</span>
                    <NavUpdateBadge count={tab.id === 'entertainment' ? entertainmentUpdateCount : 0} active={activeTab === tab.id} />
                  </span>
                </button>
              );
            })}
          </div>

          <nav className="caizen-landscape-rail-tabs" aria-label="Caizen tablet sections">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                  aria-label={tab.id === 'entertainment' && entertainmentUpdateCount > 0 ? `${tab.label}, ${entertainmentUpdateCount} ${entertainmentUpdateCount === 1 ? 'update' : 'updates'}` : tab.label}
                  onClick={() =>
                    setActiveTab(tab.id)
                  }
                  className={`caizen-mobile-tab ${activeTab === tab.id ? 'caizen-mobile-tab-active' : 'text-muted-foreground'}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="inline-flex max-w-full items-center gap-1">
                    <span className="truncate">{getShortTabLabel(tab.label)}</span>
                    <NavUpdateBadge count={tab.id === 'entertainment' ? entertainmentUpdateCount : 0} active={activeTab === tab.id} />
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowSettingsHub(true)}
              className="caizen-mobile-tab text-muted-foreground"
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </button>
          </nav>

          <button
            type="button"
            data-active={!activeTabInPrimary || undefined}
            aria-current={!activeTabInPrimary ? 'page' : undefined}
            onClick={() => setShowMobileTools(true)}
            className={`
          caizen-mobile-more
          flex
          h-16
          min-w-[4.75rem]
          items-center
          justify-center
          rounded-2xl
          border
          px-3
          text-center
          text-xs
          font-bold
          leading-tight
          transition-all
          ${activeTabInPrimary ? 'text-muted-foreground' : ''}
        `}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span>More</span>
          </button>
        </div>
      </div>

      {/* =========================================
    MOBILE TOOLS SHEET
========================================= */}

      {showMobileTools && (
        <div
          className="caizen-mobile-sheet-root
      fixed
      inset-0
      z-[80]
      xl:hidden
    "
          data-caizen-overlay={mobileToolsClosing ? 'closing' : 'open'}
          data-state={mobileToolsClosing ? 'closed' : 'open'}
        >
          <button
            type="button"
            aria-label="Close quick actions"
            className="caizen-mobile-sheet-backdrop
        absolute
        inset-0
        bg-black/60
        backdrop-blur-sm
      "
            onClick={closeMobileTools}
          />

          <div
            ref={mobileToolsPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label={androidPresentation ? 'More navigation' : 'More tools and settings'}
            tabIndex={-1}
            className="caizen-mobile-sheet
        absolute
        bottom-0
        left-0
        right-0
        max-h-[88dvh]
        overflow-y-auto
        rounded-t-[2rem]
        border-t
        border-white/10
        bg-background
        p-4
        shadow-2xl
      "
          >
            {!androidPresentation && (
              <div
                className="
          mb-4
          flex
          items-center
          justify-between
        "
              >
                <div>
                  <h3 className="text-lg font-bold">
                    Settings Hub
                  </h3>

                  <p className="text-sm text-muted-foreground">
                    Back up, restore, and customize Caizen.
                  </p>
                </div>

                <button
                  data-more-sheet-initial-focus="true"
                  type="button"
                  aria-label="Close settings hub"
                  onClick={closeMobileTools}
                  className="
            flex
            h-11
            w-11
            items-center
            justify-center
            rounded-2xl
            border
            border-border
            bg-card
            transition-colors
            hover:bg-muted/60
            focus-visible:ring-2
            focus-visible:ring-ring/40
          "
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {androidPresentation && (
              <AndroidMoreSheet
                destinations={visibleTabs.map((tab) => ({
                  id: tab.id,
                  label: tab.label,
                  icon: tab.icon,
                  summary: getSectionDiscoveryMeta(tab.id)?.summary,
                }))}
                activeTab={activeTab}
                pinnedIds={primaryNavTabs}
                onNavigate={(id) => {
                  setActiveTab(id);
                  setShowMobileTools(false);
                }}
                onOpenSettings={() => {
                  setShowSettingsHub(true);
                  setShowMobileTools(false);
                }}
                onOpenSearch={() => {
                  setShowCommandPalette(true);
                  setShowMobileTools(false);
                }}
                onOpenProfiles={() => {
                  window.dispatchEvent(new Event('caizen:open-profiles'));
                  setShowMobileTools(false);
                }}
                onOpenAppearance={() => {
                  setShowAppearancePanel(true);
                  setShowMobileTools(false);
                }}
                onOpenPet={() => {
                  setShowPetModal(true);
                  setShowMobileTools(false);
                }}
                onOpenCloudBackup={() => {
                  setShowCloudSyncModal(true);
                  setShowMobileTools(false);
                }}
                onClose={closeMobileTools}
              />
            )}

            <div className={`grid grid-cols-2 gap-3 ${androidPresentation ? 'hidden' : ''}`} data-legacy-more="true">
              <button
                type="button"
                onClick={() => {
                  setShowSettingsHub(true);
                  setShowMobileTools(false);
                }}
                className="
            col-span-2
            rounded-2xl
            border
            border-primary/20
            bg-primary/10
            p-4
            text-left
            transition-colors
            hover:border-primary/35
            hover:bg-primary/15
            focus-visible:ring-2
            focus-visible:ring-ring/40
          "
              >
                <Settings className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm font-bold text-primary">
                  Open Settings Hub
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Backup, profile, themes, and animations.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCommandPalette(true);
                  setShowMobileTools(false);
                }}
                className="
            rounded-2xl
            border
            border-primary/20
            bg-primary/5
            p-4
            text-left
            transition-colors
            hover:border-primary/35
            hover:bg-primary/10
            focus-visible:ring-2
            focus-visible:ring-ring/40
          "
              >
                <Command className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm font-bold text-primary">
                  Search
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Search, jump, or add
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAppearancePanel(true);
                  setShowMobileTools(false);
                }}
                className="
            rounded-2xl
            border
            border-primary/20
            bg-primary/5
            p-4
            text-left
            transition-colors
            hover:border-primary/35
            hover:bg-primary/10
            focus-visible:ring-2
            focus-visible:ring-ring/40
          "
              >
                <Palette className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm font-bold text-primary">
                  Appearance
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Theme and photo
                </p>
              </button>

              <button
                type="button"
                className="
            rounded-2xl
            border
            border-primary/20
            bg-primary/5
            p-4
            text-left
            transition-colors
            hover:border-primary/35
            hover:bg-primary/10
            focus-visible:ring-2
            focus-visible:ring-ring/40
          "
              >
                <LayoutGrid className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm font-bold text-primary">
                  Sections
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Manage tabs below
                </p>
              </button>
            </div>

            {!androidPresentation && (
              <>
                <MobileTabManager
                  tabs={orderedTabs}
                  hiddenTabs={hiddenTabs}
                  activeTab={activeTab}
                  toggleTab={tabId => {
                    toggleTab(tabId);

                    if (activeTab === tabId) {
                      setActiveTab('dashboard');
                    }
                  }}
                  moveTab={moveTab}
                />

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
                />
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setShowTrashModal(true);
                setShowMobileTools(false);
              }}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Trash2 className="h-4 w-4" />
              Trash
            </button>
          </div>
        </div>
      )}

      {showSettingsHub && androidPresentation && (
        <AndroidSettingsHub
          onClose={() => setShowSettingsHub(false)}
          transferFormat={transferFormat}
          onTransferFormatChange={setTransferFormat}
          onExport={() => {
            setBackupMode(transferFormat === 'complete' ? 'export-complete' : 'export-data');
            setShowBackupModal(true);
          }}
          onImport={() => {
            if (isDemoMode) { void requestExitDemoMode(); return; }
            setBackupMode(transferFormat === 'complete' ? 'import-complete' : 'import-data');
            setShowBackupModal(true);
          }}
          onCloud={() => {
            if (isDemoMode) { void requestExitDemoMode(); return; }
            setShowCloudSyncModal(true);
          }}
          onTrash={() => {
            setShowTrashModal(true);
          }}
          onEnterDemo={() => requestDemoMode(false)}
          onExitDemo={requestExitDemoMode}
          onResetDemo={() => requestDemoMode(true)}
          onOpenGuide={() => {
            setShowSettingsHub(false);
            setShowUserGuide(true);
          }}
          onResetOnboarding={requestResetOnboarding}
          isDemoMode={isDemoMode}
          appearanceContent={(
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
              compact
            />
          )}
          theme={theme}
          darkStyle={darkStyle}
          density={density}
          animationPreference={animationPreference}
          setAnimationPreference={setAnimationPreference}
          focusMode={focusMode}
          setFocusMode={setFocusMode}
          compactMobileMode={compactMobileMode}
          setCompactMobileMode={(enabled) => {
            setCompactMobileMode(enabled);
            localStorage.setItem('layout-compact-mobile-mode', String(enabled));
          }}
          currentProfile={appContext.getCurrentProfile()}
          cloudStatus={cloudStatusSummary}
          updateProfile={appContext.updateProfile}
          navDestinations={tabs.map(tab => ({ id: tab.id, label: tab.label }))}
          primaryNavTabs={primaryNavTabs}
          setPrimaryNavTabs={(ids) => setPrimaryNavTabs(sanitizePrimaryNavTabs(ids, tabs.map(tab => tab.id)))}
          defaultPrimaryNavTabs={DEFAULT_PRIMARY_NAV_TABS}
        />
      )}

      {showSettingsHub && !androidPresentation && (
        <SettingsHub
          onClose={() => setShowSettingsHub(false)}
          transferFormat={transferFormat}
          onTransferFormatChange={setTransferFormat}
          onExport={() => {
            setBackupMode(transferFormat === 'complete' ? 'export-complete' : 'export-data');
            setShowBackupModal(true);
            setShowSettingsHub(false);
          }}
          onImport={() => {
            setBackupMode(transferFormat === 'complete' ? 'import-complete' : 'import-data');
            setShowBackupModal(true);
            setShowSettingsHub(false);
          }}
          onCloudSync={() => {
            if (isDemoMode) { void requestExitDemoMode(); return; }
            setShowCloudSyncModal(true);
            setShowSettingsHub(false);
          }}
          onOpenTrash={() => {
            setShowTrashModal(true);
            setShowSettingsHub(false);
          }}
          onEnterDemo={() => requestDemoMode(false)}
          onExitDemo={requestExitDemoMode}
          onResetDemo={() => requestDemoMode(true)}
          onOpenGuide={() => {
            setOpenGuideAfterSettings(true);
            setShowSettingsHub(false);
          }}
          onResetOnboarding={requestResetOnboarding}
          onClearAllLocalData={clearAllLocalData}
          isDemoMode={isDemoMode}
          storageUsed={settingsStorageUsed}
          cloudStatus={cloudStatusSummary}
          defaultLandingPage={defaultLandingPage}
          setDefaultLandingPage={value => {
            setDefaultLandingPage(value);
            localStorage.setItem('layout-default-landing-page', value);
          }}
          dashboardCards={dashboardCards}
          demoVersion={DEMO_CONTENT_VERSION}
          focusMode={focusMode}
          setFocusMode={setFocusMode}
          dashboardVisibility={dashboardPreferences.visibility}
          dashboardDetail={dashboardPreferences.detail}
          setDashboardVisibility={visibility => setDashboardPreferencesPersisted({ ...dashboardPreferences, visibility })}
          navigationTabs={orderedTabs}
          hiddenTabs={hiddenTabs}
          activeTab={activeTab}
          toggleTab={toggleTab}
          moveTab={moveTab}
          darkModeAnimation={darkModeAnimation}
          setDarkModeAnimation={setDarkModeAnimation}
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
          currentProfile={appContext.getCurrentProfile()}
          updateProfile={appContext.updateProfile}
        />
      )}

      {showCommandPalette && (
        <div
          className="caizen-command-root fixed inset-0 z-[1000] flex items-start justify-center p-3 pt-20 sm:p-6 sm:pt-24"
          data-caizen-overlay={commandPaletteClosing ? 'closing' : 'open'}
          data-state={commandPaletteClosing ? 'closed' : 'open'}
        >
          <button
            type="button"
            aria-label="Close command palette"
            className="caizen-command-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeCommandPaletteAnimated}
          />

          <section ref={commandPanelRef} role="dialog" aria-modal="true" aria-labelledby="caizen-command-title" tabIndex={-1} className="caizen-command-panel relative z-10 w-full max-w-2xl overflow-hidden rounded-[2rem] border border-border/60 bg-background shadow-2xl outline-none">
            <div className="caizen-command-search-row flex items-center gap-3 border-b border-border/50 px-4 py-3">
              <Search className="h-5 w-5 text-muted-foreground" />
              <h2 id="caizen-command-title" className="sr-only">Command search</h2>
              <input
                ref={commandInputRef}
                value={commandSearch}
                onChange={event =>
                  setCommandSearch(event.target.value)
                }
                onKeyDown={event => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setCommandSelectedIndex(current =>
                      filteredCommandItems.length
                        ? (current + 1) % filteredCommandItems.length
                        : 0,
                    );
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setCommandSelectedIndex(current =>
                      filteredCommandItems.length
                        ? (current - 1 + filteredCommandItems.length) % filteredCommandItems.length
                        : 0,
                    );
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    activateSelectedCommand();
                  }
                }}
                placeholder="Search Caizen, records, and actions..."
                role="combobox"
                aria-label="Search Caizen commands and records"
                aria-expanded="true"
                aria-haspopup="listbox"
                aria-controls="caizen-command-results"
                aria-autocomplete="list"
                aria-activedescendant={
                  filteredCommandItems[commandSelectedIndex]
                    ? `caizen-command-option-${filteredCommandItems[commandSelectedIndex].id}`
                    : undefined
                }
                data-caizen-focus-inner="true"
                className="h-12 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:shadow-none"
              />
            </div>

            <div
              id="caizen-command-results"
              role="listbox"
              aria-label={`Command search results, ${filteredCommandItems.length} results`}
              className="max-h-[60vh] overflow-y-auto p-3"
            >
              {filteredCommandItems.length > 0 ? (
                filteredCommandGroups.map(group => (
                  <div
                    key={group.group}
                    role="group"
                    aria-label={`${group.group} results`}
                    className="not-first:mt-3"
                  >
                    <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      {group.group}
                    </p>
                    {group.items.map(item => {
                      const index = filteredCommandItems.indexOf(item);
                      return (
                        <Tooltip key={item.id}><TooltipTrigger asChild><button aria-label={`${item.title} — ${item.description}`}
                          type="button"
                          id={`caizen-command-option-${item.id}`}
                          role="option"
                          aria-selected={index === commandSelectedIndex}
                          onMouseDown={event => event.preventDefault()}
                          onMouseEnter={() => setCommandSelectedIndex(index)}
                          onClick={event => {
                            event.preventDefault();
                            item.action();
                          }}
                          className={`flex min-h-11 w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 ${index === commandSelectedIndex ? 'bg-muted' : ''}`}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            {item.group === 'Quick Add' ? (
                              <Plus className="h-4 w-4" />
                            ) : item.group === 'Records' ? (
                              <Search className="h-4 w-4" />
                            ) : item.group === 'Tools' ? (
                              <Sparkles className="h-4 w-4" />
                            ) : (
                              <Command className="h-4 w-4" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold">
                              {item.title}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">
                              {item.description}
                            </p>
                          </div>
                        </button></TooltipTrigger><TooltipContent>{`${item.title} — ${item.description}`}</TooltipContent></Tooltip>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                  No matching command or local record.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {showAppearancePanel && (
        <div
          className="caizen-appearance-root fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4"
          data-caizen-overlay={appearancePanelClosing ? 'closing' : 'open'}
          data-state={appearancePanelClosing ? 'closed' : 'open'}
        >
          <button
            type="button"
            aria-label="Close appearance settings"
            className="caizen-app-scrim absolute inset-0"
            onClick={closeAppearancePanel}
          />

          <section ref={appearancePanelRef} role="dialog" aria-modal="true" aria-labelledby="caizen-appearance-title" tabIndex={-1} className="caizen-appearance-panel relative z-10 max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-border/60 bg-background p-4 shadow-2xl outline-none sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="caizen-appearance-title" className="text-xl font-bold">
                  Appearance
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Change the color scheme and background photo.
                </p>
              </div>

              <button
                type="button"
                onClick={closeAppearancePanel}
                aria-label="Close appearance settings"
                 className="
            flex
            h-11
            w-11
            items-center
            justify-center
            rounded-2xl
            border
            border-border
            bg-card
            transition-colors
            hover:bg-muted/60
            focus-visible:ring-2
            focus-visible:ring-ring/40
          "
              >
                <X className="h-4 w-4" />
              </button>
            </div>

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
              compact
            />
          </section>
        </div>
      )}
      {/* =========================================
          ACTIVE MODAL
      ========================================= */}
      {hiddenMenuPosition && (
        <div
          onClick={event => event.stopPropagation()}
          className="caizen-hidden-tabs-menu fixed z-[9999] w-60 overflow-hidden rounded-2xl border border-border/75 bg-popover/95 p-2 shadow-2xl backdrop-blur-2xl"
          style={{
            left: hiddenMenuPosition.x,
            top: hiddenMenuPosition.y,
          }}
          role="menu"
          aria-label="Hidden sections"
        >
          <div className="flex items-center justify-between gap-3 px-2.5 pb-2 pt-1.5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Hidden sections
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Select a section to show it again.
              </p>
            </div>

            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
              {hiddenTabItems.length}
            </span>
          </div>

          <div className="max-h-[min(62dvh,28rem)] space-y-1 overflow-y-auto pr-0.5">
            {hiddenTabItems.map(tab => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="menuitem"
                  onClick={event => {
                    event.stopPropagation();
                    toggleTab(tab.id);
                    setHiddenMenuPosition(null);
                  }}
                  className="group flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/65 text-muted-foreground transition group-hover:border-primary/25 group-hover:text-primary">
                    <Icon className="h-4 w-4" />
                  </span>

                  <span className="min-w-0 flex-1 truncate">
                    {tab.label}
                  </span>

                  <Plus className="h-4 w-4 shrink-0 text-primary opacity-70" />
                </button>
              );
            })}
          </div>
        </div>
      )}{contextTab && (
        <div
          onClick={event => event.stopPropagation()}
          className="
      fixed
      z-[9999]
      min-w-40
      rounded-2xl
      border border-border
      bg-background
      p-2
      shadow-2xl
    "
          style={{
            left: contextPosition.x,
            top: contextPosition.y,
          }}
        >
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();

              toggleTab(contextTab);

              if (activeTab === contextTab) {
                setActiveTab('dashboard');
              }

              setContextTab(null);
            }}
            className="
        w-full
        rounded-xl
        px-3
        py-2
        text-left
        text-sm
        font-medium
        text-muted-foreground
        hover:bg-muted
        hover:text-foreground
      "
          >
            Hide Section
          </button>
        </div>
      )}
      {showAddModal && renderActiveAddModal()}

      {quickAddRequest && (
        <QuickAddModalHost
          request={quickAddRequest}
          androidPresentation={androidPresentation}
          onClose={() => setQuickAddRequest(null)}
        />
      )}

      {showTrashModal && (
        <GlobalTrashModal isOpen onClose={() => setShowTrashModal(false)} />
      )}
      {showPetModal && (
        <PetModal
          isOpen
          spotlightObservationId={mochiSpotlight?.id}
          spotlightProfileId={mochiSpotlight?.profileId}
          onClose={() => setShowPetModal(false)}
        />
      )}
      <TaxonomyHub androidPresentation={androidPresentation} />
    </main>
  );
}
