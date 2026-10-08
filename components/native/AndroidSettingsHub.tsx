'use client';

import { App } from '@capacitor/app';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Accessibility,
  ArchiveRestore,
  Bell,
  BellOff,
  BookOpen,
  Camera,
  ChevronRight,
  Cloud,
  Database,
  Download,
  Info,
  MessageSquareText,
  Palette,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { getCurrencySelectOptions } from '@/lib/currency';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Switch } from '@/components/ui/switch';
import { isAndroid } from '@/lib/platform';
import { CaizenNative, setPrivacyScreen } from '@/lib/native/calendar';
import {
  getPrivacyScreenEnabled,
  setPrivacyScreenEnabled,
} from '@/lib/native/native-preferences';
import { getMediaPermissionStatus } from '@/lib/native/media-picker';
import {
  getHapticsEnabled,
  setHapticsEnabled,
} from '@/lib/native/haptics';
import {
  ensureNotificationPermission,
  getNotificationAvailability,
  sendTestNotification,
} from '@/lib/native/notifications';
import {
  useNotificationSettings,
  type NotificationCategory,
  type NotificationSettings,
} from '@/lib/native/notification-settings';
import { notify } from '@/lib/feedback/notify';
import {
  AndroidAdaptiveSelect,
  AndroidAdaptiveTimeInput,
  AndroidBackButton,
  AndroidSegmentedControl,
  AndroidSettingsGroup,
  AndroidSettingsRow,
  AndroidTopAppBar,
  CaizenSelectionSheet,
} from '@/components/native/android-design';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { CompanionSettings } from '@/components/settings/CompanionSettings';

type SettingsPage =
  | 'home'
  | 'profile'
  | 'appearance'
  | 'feedback'
  | 'privacy'
  | 'data'
  | 'backups'
  | 'cloud'
  | 'android'
  | 'navigation'
  | 'notifications'
  | 'permissions'
  | 'accessibility'
  | 'about'
  | 'advanced';

const pageTitles: Record<SettingsPage, string> = {
  home: 'Settings',
  profile: 'Profile and accounts',
  appearance: 'Appearance',
  feedback: 'In-app feedback',
  privacy: 'Privacy and security',
  data: 'Data and storage',
  backups: 'Backups and restore',
  cloud: 'Cloud Backup',
  android: 'Android features',
  navigation: 'Navigation',
  notifications: 'Notifications',
  permissions: 'Permissions',
  accessibility: 'Accessibility',
  about: 'About Caizen',
  advanced: 'Advanced',
};

const CATEGORY_LABELS: Record<NotificationCategory, { label: string; summary: string }> = {
  tasks: { label: 'Task reminders', summary: 'Reminders for tasks with a due date' },
  routines: { label: 'Routine reminders', summary: 'Daily and weekly routine check-ins' },
  calendar: { label: 'Calendar reminders', summary: 'Upcoming calendar events' },
  deadlines: { label: 'Deadline, money & subscription reminders', summary: 'Bills, planned money, renewals and deadlines' },
  health: { label: 'Health reminders', summary: 'Supplement and health schedules' },
  summary: { label: 'Daily summary', summary: 'One digest notification per day' },
};

const LEAD_TIME_OPTIONS = [
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '120', label: '2 hours before' },
  { value: '1440', label: '1 day before' },
];

function SettingsToggle({
  label,
  summary,
  checked,
  onChange,
}: {
  label: string;
  summary?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      className="android-list-row"
    >
      <span className="android-list-row-copy">
        <span className="android-list-row-title">{label}</span>
        {summary && (
          <span className="android-list-row-summary">{summary}</span>
        )}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export default function AndroidSettingsHub({
  onClose,
  transferFormat,
  onTransferFormatChange,
  onExport,
  onImport,
  onCloud,
  onTrash,
  onOpenGuide,
  onResetOnboarding,
  onEnterDemo,
  onExitDemo,
  onResetDemo,
  isDemoMode,
  appearanceContent,
  theme,
  darkStyle,
  density,
  animationPreference,
  setAnimationPreference,
  focusMode,
  setFocusMode,
  compactMobileMode,
  setCompactMobileMode,
  currentProfile,
  cloudStatus,
  updateProfile,
  navDestinations,
  primaryNavTabs,
  setPrimaryNavTabs,
  defaultPrimaryNavTabs,
}: {
  onClose: () => void;
  transferFormat: 'complete' | 'data';
  onTransferFormatChange: (format: 'complete' | 'data') => void;
  onExport: () => void;
  onImport: () => void;
  onCloud: () => void;
  onTrash: () => void;
  onOpenGuide: () => void;
  onResetOnboarding: () => void;
  onEnterDemo: () => void;
  onExitDemo: () => void;
  onResetDemo: () => void;
  isDemoMode: boolean;
  appearanceContent: ReactNode;
  theme: string;
  darkStyle: string;
  density: string;
  animationPreference: string;
  setAnimationPreference: (value: 'full' | 'reduced') => void;
  focusMode: boolean;
  setFocusMode: (enabled: boolean) => void;
  compactMobileMode: boolean;
  setCompactMobileMode: (enabled: boolean) => void;
  currentProfile: any;
  cloudStatus: string;
  updateProfile: (id: string, updates: any) => void;
  navDestinations: { id: string; label: string }[];
  primaryNavTabs: string[];
  setPrimaryNavTabs: (ids: string[]) => void;
  defaultPrimaryNavTabs: string[];
}) {
  const [pageHistory, setPageHistory] = useState<SettingsPage[]>(['home']);
  const page = pageHistory[pageHistory.length - 1] ?? 'home';
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [hapticsEnabled, setHapticsState] = useState(true);
  const [privacyScreenEnabled, setPrivacyScreenState] = useState(false);
  const { settings: notificationSettings, update: updateNotificationSettings } =
    useNotificationSettings();
  const [notificationStatus, setNotificationStatus] = useState<'Checking…' | 'Check failed' | 'Allowed' | 'Blocked by Android' | 'Permission required'>('Checking…');
  const [runtimePermissionGranted, setRuntimePermissionGranted] = useState<boolean | null>(null);
  const [mediaPermissions, setMediaPermissions] = useState<{ camera: string; photos: string } | null>(null);
  const [mediaStatus, setMediaStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [appInfo, setAppInfo] = useState<{ version: string; build: string } | null>(null);
  const [appInfoStatus, setAppInfoStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const notificationReadId = useRef(0);
  const mediaReadId = useRef(0);
  const [testSent, setTestSent] = useState(false);
  const [nativeNotice, setNativeNotice] = useState<{
    message: string;
    retry?: () => void;
  } | null>(null);
  const [navigationDraft, setNavigationDraft] = useState<string[]>(primaryNavTabs);
  const [navigationBaseline, setNavigationBaseline] = useState<string[]>(primaryNavTabs);
  const [discardNavigationOpen, setDiscardNavigationOpen] = useState(false);
  const navigationDirty = JSON.stringify(navigationDraft) !== JSON.stringify(navigationBaseline);
  const settingsPanelRef = useRef<HTMLElement>(null);

  const showNativeFailure = useCallback((message: string, retry?: () => void) => {
    setNativeNotice({ message, retry });
    notify({
      actionId: `settings-native-failure:${Date.now()}`,
      kind: 'error',
      title: 'Settings change not saved',
      description: `${message} Try again.`,
    });
  }, []);

  const clearNativeNotice = useCallback(() => setNativeNotice(null), []);

  const updatePrivacyScreen = async (enabled: boolean) => {
    const previous = privacyScreenEnabled;
    setPrivacyScreenState(enabled);
    try {
      // Persist first so a process restart sees the requested protection.
      await setPrivacyScreenEnabled(enabled);
      try {
        await setPrivacyScreen(enabled);
      } catch (error) {
        await setPrivacyScreenEnabled(previous);
        throw error;
      }
      clearNativeNotice();
    } catch {
      setPrivacyScreenState(previous);
      showNativeFailure('Screen privacy could not be changed.', () => {
        void updatePrivacyScreen(enabled);
      });
    }
  };

  const updateHaptics = async (enabled: boolean) => {
    const previous = hapticsEnabled;
    setHapticsState(enabled);
    try {
      await setHapticsEnabled(enabled);
      clearNativeNotice();
    } catch {
      setHapticsState(previous);
      showNativeFailure('Touch feedback could not be saved.', () => {
        void updateHaptics(enabled);
      });
    }
  };

  const updateNotificationPreference = async (updates: Partial<NotificationSettings>) => {
    try {
      await updateNotificationSettings(updates);
      clearNativeNotice();
    } catch {
      showNativeFailure('Notification settings could not be saved.', () => {
        void updateNotificationPreference(updates);
      });
    }
  };

  const refreshNotificationStatus = useCallback(async () => {
    const readId = ++notificationReadId.current;
    setRuntimePermissionGranted(null);
    setNotificationStatus('Checking…');
    try {
      const availability = await getNotificationAvailability();
      if (readId !== notificationReadId.current) return;
      setRuntimePermissionGranted(availability.runtimeGranted);
      setNotificationStatus(!availability.runtimeGranted
        ? 'Permission required'
        : availability.appEnabled ? 'Allowed' : 'Blocked by Android');
    } catch {
      if (readId !== notificationReadId.current) return;
      setRuntimePermissionGranted(null);
      setNotificationStatus('Check failed');
    }
  }, []);

  const refreshMediaStatus = useCallback(async () => {
    const readId = ++mediaReadId.current;
    setMediaStatus('loading');
    setMediaPermissions(null);
    try {
      const permissions = await getMediaPermissionStatus();
      if (permissions.camera === 'unavailable' && permissions.photos === 'unavailable') {
        throw new Error('Android media permissions could not be checked.');
      }
      if (readId !== mediaReadId.current) return;
      setMediaPermissions(permissions);
      setMediaStatus('ready');
    } catch {
      if (readId !== mediaReadId.current) return;
      setMediaPermissions(null);
      setMediaStatus('error');
    }
  }, []);

  const refreshAppInfo = useCallback(async () => {
    setAppInfo(null);
    setAppInfoStatus('loading');
    try {
      const info = await App.getInfo();
      setAppInfo({ version: info.version, build: info.build });
      setAppInfoStatus('ready');
    } catch {
      setAppInfo(null);
      setAppInfoStatus('error');
    }
  }, []);

  const requestNotificationPermission = async () => {
    try {
      const granted = await ensureNotificationPermission();
      await refreshNotificationStatus();
      if (granted) clearNativeNotice();
    } catch {
      showNativeFailure('Notification permission could not be checked.', () => {
        void requestNotificationPermission();
      });
    }
  };

  const sendNotificationTest = async () => {
    if (!notificationSettings.masterEnabled) {
      setNativeNotice({ message: 'Turn on Caizen notifications before sending a test.' });
      return;
    }
    try {
      const granted = await ensureNotificationPermission();
      await refreshNotificationStatus();
      if (!granted) {
        setNativeNotice({ message: 'Android notifications are blocked. Allow them in system settings before sending a test.' });
        return;
      }
      await sendTestNotification(notificationSettings);
      clearNativeNotice();
      setTestSent(true);
      window.setTimeout(() => setTestSent(false), 4000);
    } catch {
      showNativeFailure('The test notification could not be sent.', () => {
        void sendNotificationTest();
      });
    }
  };

  const loadNativePreferences = useCallback(async () => {
    try {
      const [haptics, privacyScreen] = await Promise.all([
        getHapticsEnabled(),
        getPrivacyScreenEnabled(),
      ]);
      setHapticsState(haptics);
      setPrivacyScreenState(privacyScreen);
      clearNativeNotice();
    } catch {
      showNativeFailure('Android preferences could not be loaded.', () => {
        void loadNativePreferences();
      });
    }
  }, [clearNativeNotice, showNativeFailure]);

  const handleOverlayClose = useCallback(() => {
    if (page === 'navigation' && navigationDirty) {
      setDiscardNavigationOpen(true);
    } else if (pageHistory.length > 1) {
      setPageHistory(current => current.slice(0, -1));
    } else {
      onClose();
    }
  }, [navigationDirty, onClose, page, pageHistory.length]);

  useOverlayLifecycle(true, handleOverlayClose, {
    containerRef: settingsPanelRef,
    initialFocusSelector: 'button',
  });

  useEffect(() => {
    void loadNativePreferences();
  }, [loadNativePreferences]);

  useEffect(() => {
    if (page !== 'notifications') return;
    void refreshNotificationStatus();
  }, [page, refreshNotificationStatus]);

  useEffect(() => {
    if (page !== 'permissions') return;
    void refreshNotificationStatus();
    void refreshMediaStatus();
  }, [page, refreshNotificationStatus, refreshMediaStatus]);

  useEffect(() => {
    if (page !== 'about' || appInfoStatus !== 'idle') return;
    void refreshAppInfo();
  }, [page, appInfoStatus, refreshAppInfo]);

  useEffect(() => {
    if (page !== 'notifications' && page !== 'permissions') return;
    const refreshOnResume = (event: Event) => {
      if (!(event as CustomEvent<{ isActive?: boolean }>).detail?.isActive) return;
      void refreshNotificationStatus();
      if (page === 'permissions') {
        void refreshMediaStatus();
      }
    };
    window.addEventListener('caizen:app-state', refreshOnResume);
    return () => window.removeEventListener('caizen:app-state', refreshOnResume);
  }, [page, refreshNotificationStatus, refreshMediaStatus]);

  useEffect(() => {
    const handleBack = (event: Event) => {
      const detail = (
        event as CustomEvent<{ handled?: boolean }>
      ).detail;
      if (!detail || detail.handled) return;
      handleOverlayClose();
      detail.handled = true;
    };
    window.addEventListener('caizen:native-back-request', handleBack);
    return () => {
      window.removeEventListener('caizen:native-back-request', handleBack);
    };
  }, [handleOverlayClose]);

  const [storageSummary, setStorageSummary] = useState('Stored on this device');

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
    void navigator.storage.estimate().then(({ usage }) => {
      if (!usage) return;
      const value = usage >= 1024 * 1024
        ? `${(usage / 1024 / 1024).toFixed(1)} MB on device`
        : `${Math.max(1, Math.round(usage / 1024))} KB on device`;
      setStorageSummary(value);
    });
  }, []);
  const cloudConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const darkStyleLabel =
    darkStyle === 'night'
      ? 'Caizen Night'
      : darkStyle === 'amoled'
        ? 'AMOLED Black'
        : 'Comfort Dark';

  const appearanceSummary =
    theme === 'light'
      ? 'Light'
      : theme === 'system'
        ? `System · ${darkStyleLabel} when dark`
        : darkStyleLabel;

  const openPage = (nextPage: SettingsPage) => {
    if (nextPage === 'navigation') {
      setNavigationDraft([...primaryNavTabs]);
      setNavigationBaseline([...primaryNavTabs]);
    }
    setPageHistory(current => current[current.length - 1] === nextPage
      ? current
      : [...current, nextPage]);
  };
  const navigateHome = () => {
    if (page === 'navigation' && navigationDirty) {
      setDiscardNavigationOpen(true);
      return;
    }
    setPageHistory(['home']);
  };
  const closeAction = (
    <button
      type="button"
      className="android-icon-button"
      onClick={handleOverlayClose}
      aria-label="Close settings"
    >
      <X className="h-5 w-5" />
    </button>
  );

  return (
    <section
      ref={settingsPanelRef}
      className="android-settings-shell outline-none"
      data-settings-page={page}
      data-caizen-overlay="open"
    >
      <AndroidTopAppBar
        title={pageTitles[page]}
        leading={
          page === 'home' ? (
            <span className="android-settings-mark" aria-hidden="true">
              <SlidersHorizontal className="h-5 w-5" />
            </span>
          ) : (
            <AndroidBackButton onClick={navigateHome} />
          )
        }
        action={closeAction}
      />

      <div key={page} className="android-settings-content">
        {nativeNotice && (
          <div
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-3 text-sm"
            role="alert"
            aria-live="assertive"
          >
            <span>{nativeNotice.message}</span>
            {nativeNotice.retry && (
              <button
                type="button"
                className="shrink-0 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-bold"
                onClick={nativeNotice.retry}
              >
                Try again
              </button>
            )}
          </div>
        )}
        {page === 'home' && (
          <>
            <section className="android-settings-overview">
              <div>
                <span className="android-settings-overview-avatar">
                  {(currentProfile?.name || 'Caizen').trim().slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{currentProfile?.name || 'Current profile'}</strong>
                  <small>{appearanceSummary} · {storageSummary}</small>
                </span>
              </div>
              <p>Personalize Caizen, manage navigation, and protect your on-device data.</p>
            </section>
            <AndroidSettingsGroup title="You">
              <AndroidSettingsRow
                icon={UserRound}
                title="Profile and accounts"
                summary={currentProfile?.name || 'Current profile'}
                onClick={() => openPage('profile')}
              />
              <AndroidSettingsRow
                icon={Palette}
                title="Appearance"
                summary={appearanceSummary}
                onClick={() => openPage('appearance')}
              />
              <AndroidSettingsRow
                icon={Accessibility}
                title="Accessibility"
                summary={
                  animationPreference === 'reduced'
                    ? 'Reduced motion'
                    : 'Standard motion'
                }
                onClick={() => openPage('accessibility')}
              />
            </AndroidSettingsGroup>
            <AndroidSettingsGroup title="Data">
              <AndroidSettingsRow
                icon={ShieldCheck}
                title="Privacy and security"
                summary="Local-first controls and deleted records"
                onClick={() => openPage('privacy')}
              />
              <AndroidSettingsRow
                icon={Database}
                title="Data and storage"
                summary={storageSummary}
                onClick={() => openPage('data')}
              />
              <AndroidSettingsRow
                icon={ArchiveRestore}
                title="Backups and restore"
                summary={cloudStatus}
                onClick={() => openPage('backups')}
              />
              <AndroidSettingsRow
                icon={Cloud}
                title="Cloud Backup"
                summary={cloudStatus}
                onClick={() => openPage('cloud')}
              />
            </AndroidSettingsGroup>
            <AndroidSettingsGroup title="App">
              <AndroidSettingsRow
                icon={SlidersHorizontal}
                title="Navigation"
                summary={`${primaryNavTabs.length} bottom tabs`}
                onClick={() => openPage('navigation')}
              />
              <AndroidSettingsRow
                icon={Bell}
                title="Notifications"
                summary={notificationSettings.masterEnabled ? 'On' : 'Off'}
                onClick={() => openPage('notifications')}
              />
              <AndroidSettingsRow
                icon={MessageSquareText}
                title="In-app feedback"
                summary={currentProfile?.feedbackPreferences?.showToasts === false ? 'Off' : 'On'}
                onClick={() => openPage('feedback')}
              />
              <AndroidSettingsRow
                icon={ShieldCheck}
                title="Permissions"
                summary="What Caizen asks Android for"
                onClick={() => openPage('permissions')}
              />
              <AndroidSettingsRow
                icon={Smartphone}
                title="Android features"
                summary={hapticsEnabled ? 'Haptics on' : 'Haptics off'}
                onClick={() => openPage('android')}
              />
              <AndroidSettingsRow
                icon={Info}
                title="About Caizen"
                summary={appInfoStatus === 'ready' && appInfo ? `Version ${appInfo.version}` : 'Installed app details'}
                onClick={() => openPage('about')}
              />
              <AndroidSettingsRow
                icon={Wrench}
                title="Advanced"
                summary="Tutorial and test data"
                onClick={() => openPage('advanced')}
              />
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'profile' && (
          <>
            <p className="android-settings-page-copy">
              Switch profiles or update account preferences.
            </p>
            <AndroidSettingsGroup>
              <AndroidSettingsRow
                icon={UserRound}
                title={currentProfile?.name || 'Current profile'}
                summary="Manage profiles"
                onClick={() =>
                  window.dispatchEvent(new Event('caizen:open-profiles'))
                }
              />
              <AndroidSettingsRow
                icon={Cloud}
                title="Connect account"
                summary={cloudStatus}
                onClick={onCloud}
              />
              <AndroidSettingsRow
                title="Display currency"
                value={currentProfile?.currency || 'PHP'}
                onClick={() => setCurrencyOpen(true)}
              />
            </AndroidSettingsGroup>
            <AndroidSettingsGroup title="Companion">
              <CompanionSettings showHeading={false} />
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'appearance' && (
          <>
            <p className="android-settings-page-copy">
              Choose a calm theme and comfortable display.
            </p>
            <div className="android-settings-appearance">{appearanceContent}</div>
            <AndroidSettingsGroup title="Layout">
              <SettingsToggle
                label="Focus mode"
                summary="Prioritize practical daily sections"
                checked={focusMode}
                onChange={setFocusMode}
              />
              <SettingsToggle
                label="Compact Android layout"
                summary={`Current density: ${density}`}
                checked={compactMobileMode}
                onChange={setCompactMobileMode}
              />
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'feedback' && (
          <>
            <p className="android-settings-page-copy">
              Keep confirmations calm while you move through useful actions.
            </p>
            <AndroidSettingsGroup title="In-app feedback">
              <SettingsToggle
                label="Show toast notifications"
                summary="Confirm meaningful actions without interrupting your flow"
                checked={currentProfile?.feedbackPreferences?.showToasts !== false}
                onChange={showToasts => {
                  if (!currentProfile) return;
                  updateProfile(currentProfile.id, {
                    feedbackPreferences: {
                      showToasts,
                      showRewardDetails: currentProfile.feedbackPreferences?.showRewardDetails !== false,
                    },
                  });
                }}
              />
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'privacy' && (
          <>
            <p className="android-settings-page-copy">
              Caizen keeps your records on this device unless you explicitly
              create a backup or use Cloud.
            </p>
            <AndroidSettingsGroup>
              <AndroidSettingsRow
                icon={ShieldCheck}
                title="On-device privacy"
                summary="Profiles and records are private to this app"
              />
              <SettingsToggle
                label="Block screenshots"
                summary="Hide Caizen from screenshots and the Android recents preview"
                checked={privacyScreenEnabled}
                onChange={enabled => void updatePrivacyScreen(enabled)}
              />
              <AndroidSettingsRow
                icon={BellOff}
                title="On-device reminders"
                summary="Local notification settings remain on this device"
              />
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'data' && (
          <>
            <p className="android-settings-page-copy">
              Review on-device storage and recover deleted records.
            </p>
            <AndroidSettingsGroup>
              <AndroidSettingsRow
                icon={Database}
                title="On-device data"
                summary={storageSummary}
              />
              <AndroidSettingsRow
                icon={Trash2}
                title="Recently deleted"
                summary="Restore or permanently remove records"
                onClick={onTrash}
              />
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'backups' && (
          <>
            <AndroidSettingsGroup title="Local transfer">
              <p className="android-settings-page-copy">Format</p>
              <AndroidSegmentedControl
                label="Local transfer format"
                value={transferFormat}
                onChange={onTransferFormatChange}
                options={[
                  { value: 'complete', label: 'Complete (.caizen)' },
                  { value: 'data', label: 'Data only (.json)' },
                ]}
              />
              <p className="android-settings-page-copy">
                {transferFormat === 'complete'
                  ? 'Profile data + managed photos/files. Recommended for moving Caizen.'
                  : 'Structured profile data only. Managed local photos/files are not included.'}
              </p>
              <AndroidSettingsRow
                icon={Download}
                title="Export"
                summary={transferFormat === 'complete' ? 'Save a complete .caizen file' : 'Save structured data as JSON'}
                onClick={onExport}
              />
              <AndroidSettingsRow
                icon={ArchiveRestore}
                title="Import"
                summary={transferFormat === 'complete' ? 'Choose and preview a .caizen file' : 'Choose and preview a JSON file'}
                onClick={onImport}
              />
            </AndroidSettingsGroup>
            <AndroidSettingsGroup title="Cloud Backup status">
              <AndroidSettingsRow
                icon={Cloud}
                title="Manage Cloud Backup"
                summary={cloudStatus}
                onClick={onCloud}
              />
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'cloud' && (
          <>
            <p className="android-settings-page-copy">
              Cloud Backup stores optional per-profile snapshots. Automatic Cloud Backup remains
              off until a profile has one successful manual Cloud Backup; it is not live
              collaboration or record-level sync.
            </p>
            <AndroidSettingsGroup>
              <AndroidSettingsRow
                icon={Cloud}
                title={cloudConfigured ? 'Cloud account' : 'Cloud unavailable'}
                summary={
                  cloudConfigured
                    ? 'Sign in, sign out, or manage snapshots'
                    : 'This build is configured for local use'
                }
                onClick={onCloud}
              />
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'navigation' && (
          <>
            <p className="android-settings-page-copy">
              Choose 3 to 5 destinations for the bottom navigation bar.
              Everything else stays reachable from More.
            </p>
            <div className="android-navigation-editor">
            <div className="android-navigation-editor-pane">
            <div className="android-navigation-preview" aria-label="Bottom navigation preview">
              {navigationDraft.map((id) => {
                const item = navDestinations.find((destination) => destination.id === id);
                return item ? <span key={id}>{item.label}</span> : null;
              })}
              <span>More</span>
            </div>
            <AndroidSettingsGroup title="Pinned destinations">
              {navigationDraft.map((id, index) => {
                const destination = navDestinations.find((item) => item.id === id);
                if (!destination) return null;
                return (
                  <div key={id} className="android-list-row">
                    <span className="android-list-row-copy">
                      <span className="android-list-row-title">{destination.label}</span>
                    </span>
                    <span className="android-nav-reorder-actions">
                      <button
                        type="button"
                        className="android-icon-button"
                        aria-label={`Move ${destination.label} up`}
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...navigationDraft];
                          [next[index - 1], next[index]] = [next[index], next[index - 1]];
                          setNavigationDraft(next);
                        }}
                      >
                        <ChevronRight className="h-4 w-4 -rotate-90" />
                      </button>
                      <button
                        type="button"
                        className="android-icon-button"
                        aria-label={`Move ${destination.label} down`}
                        disabled={index === navigationDraft.length - 1}
                        onClick={() => {
                          const next = [...navigationDraft];
                          [next[index + 1], next[index]] = [next[index], next[index + 1]];
                          setNavigationDraft(next);
                        }}
                      >
                        <ChevronRight className="h-4 w-4 rotate-90" />
                      </button>
                      <button
                        type="button"
                        className="android-icon-button"
                        aria-label={`Remove ${destination.label} from bottom navigation`}
                        disabled={navigationDraft.length <= 3}
                        onClick={() => setNavigationDraft(navigationDraft.filter((tabId) => tabId !== id))}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                );
              })}
            </AndroidSettingsGroup>
            </div>

            <div className="android-navigation-editor-pane">
            <AndroidSettingsGroup title="Available destinations">
              {navDestinations
                .filter((item) => !navigationDraft.includes(item.id))
                .map((item) => (
                  <AndroidSettingsRow
                    key={item.id}
                    title={item.label}
                    summary={navigationDraft.length >= 5 ? 'Remove one to add this' : 'Add to bottom navigation'}
                    onClick={() => {
                      if (navigationDraft.length >= 5) return;
                      setNavigationDraft([...navigationDraft, item.id]);
                    }}
                  />
                ))}
            </AndroidSettingsGroup>
            </div>
            </div>

            <div className="android-navigation-editor-actions">
              <button type="button" className="android-secondary-button" onClick={() => setNavigationDraft([...defaultPrimaryNavTabs])}>Restore defaults</button>
              <button type="button" className="android-secondary-button" onClick={navigateHome}>Cancel</button>
              <button type="button" className="android-primary-button" disabled={!navigationDirty} onClick={() => {
                setPrimaryNavTabs(navigationDraft);
                setNavigationBaseline([...navigationDraft]);
                setPageHistory(['home']);
              }}>Save</button>
            </div>
          </>
        )}

        {page === 'android' && (
          <>
            <p className="android-settings-page-copy">
              Controls connected directly to the Android app.
            </p>
            <AndroidSettingsGroup>
              <SettingsToggle
                label="Touch feedback"
                summary="Use subtle vibration for supported actions"
                checked={hapticsEnabled}
                onChange={enabled => void updateHaptics(enabled)}
              />
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'notifications' && (
          <>
            <p className="android-settings-page-copy">
              Local reminders only. Nothing about your reminders leaves this device.
            </p>
            <AndroidSettingsGroup title="Status">
              <AndroidSettingsRow
                title="Notification access"
                summary={notificationStatus}
              />
              {runtimePermissionGranted === false && (
                <AndroidSettingsRow
                  title="Request permission"
                  onClick={() => void requestNotificationPermission()}
                />
              )}
              {notificationStatus === 'Check failed' && (
                <AndroidSettingsRow title="Retry notification check" onClick={() => void refreshNotificationStatus()} />
              )}
              {isAndroid() && (
                <AndroidSettingsRow
                  title="Open Android notification settings"
                  onClick={() => {
                    void CaizenNative.openNotificationSettings().then(clearNativeNotice).catch(() => {
                      showNativeFailure('Android notification settings could not be opened.', () => {
                        void CaizenNative.openNotificationSettings();
                      });
                    });
                  }}
                />
              )}
            </AndroidSettingsGroup>

            <AndroidSettingsGroup>
              <SettingsToggle
                label="Notifications"
                summary="Master switch for every reminder below"
                checked={notificationSettings.masterEnabled}
                onChange={async (enabled) => {
                  if (!enabled) {
                    await updateNotificationPreference({ masterEnabled: false });
                    return;
                  }
                  try {
                    const granted = await ensureNotificationPermission();
                    await refreshNotificationStatus();
                    await updateNotificationPreference({ masterEnabled: granted });
                  } catch {
                    showNativeFailure('Notifications could not be enabled.', () => {
                      void updateNotificationPreference({ masterEnabled: true });
                    });
                  }
                }}
              />
            </AndroidSettingsGroup>

            <AndroidSettingsGroup title="Reminder types">
              {(Object.keys(CATEGORY_LABELS) as NotificationCategory[]).map((category) => (
                <SettingsToggle
                  key={category}
                  label={CATEGORY_LABELS[category].label}
                  summary={CATEGORY_LABELS[category].summary}
                  checked={notificationSettings.categories[category]}
                  onChange={(enabled) =>
                    void updateNotificationPreference({
                      categories: { ...notificationSettings.categories, [category]: enabled },
                    })
                  }
                />
              ))}
            </AndroidSettingsGroup>

            {notificationSettings.categories.summary && (
              <AndroidSettingsGroup title="Daily summary">
                <div className="android-list-row">
                  <span className="android-list-row-copy">
                    <span className="android-list-row-title">Summary time</span>
                  </span>
                  <AndroidAdaptiveTimeInput
                    label="Daily summary time"
                    value={notificationSettings.dailySummaryTime}
                    onChange={(value) => void updateNotificationPreference({ dailySummaryTime: value || '08:00' })}
                  />
                </div>
              </AndroidSettingsGroup>
            )}

            <AndroidSettingsGroup title="Timing">
              <div className="android-list-row">
                <span className="android-list-row-copy">
                  <span className="android-list-row-title">Default lead time</span>
                  <span className="android-list-row-summary">Used when a reminder has no time of its own</span>
                </span>
                <AndroidAdaptiveSelect
                  label="Default lead time"
                  value={String(notificationSettings.defaultLeadMinutes)}
                  options={LEAD_TIME_OPTIONS}
                  onChange={(value) => void updateNotificationPreference({ defaultLeadMinutes: Number(value) || 30 })}
                />
              </div>
              <SettingsToggle
                label="Quiet hours"
                summary="Push reminders past this window to when it ends"
                checked={notificationSettings.quietHoursEnabled}
                onChange={(enabled) => void updateNotificationPreference({ quietHoursEnabled: enabled })}
              />
              {notificationSettings.quietHoursEnabled && (
                <>
                  <div className="android-list-row">
                    <span className="android-list-row-copy">
                      <span className="android-list-row-title">Starts</span>
                    </span>
                    <AndroidAdaptiveTimeInput
                      label="Quiet hours start"
                      value={notificationSettings.quietHoursStart}
                      onChange={(value) => void updateNotificationPreference({ quietHoursStart: value || '22:00' })}
                    />
                  </div>
                  <div className="android-list-row">
                    <span className="android-list-row-copy">
                      <span className="android-list-row-title">Ends</span>
                    </span>
                    <AndroidAdaptiveTimeInput
                      label="Quiet hours end"
                      value={notificationSettings.quietHoursEnd}
                      onChange={(value) => void updateNotificationPreference({ quietHoursEnd: value || '07:00' })}
                    />
                  </div>
                </>
              )}
            </AndroidSettingsGroup>

            <AndroidSettingsGroup title="Privacy & feel">
              <SettingsToggle
                label="Privacy-safe previews"
                summary="Show generic text instead of record titles"
                checked={notificationSettings.privacySafePreviews}
                onChange={(enabled) => void updateNotificationPreference({ privacySafePreviews: enabled })}
              />
              <SettingsToggle
                label="Vibration"
                summary="Vibrate when a reminder arrives, where supported"
                checked={notificationSettings.vibrationEnabled}
                onChange={(enabled) => void updateNotificationPreference({ vibrationEnabled: enabled })}
              />
            </AndroidSettingsGroup>

            <AndroidSettingsGroup>
              <AndroidSettingsRow
                title={testSent ? 'Test notification sent' : 'Send a test notification'}
                summary="Arrives in about 3 seconds"
                onClick={() => void sendNotificationTest()}
              />
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'permissions' && (
          <>
            <p className="android-settings-page-copy">
              Caizen only asks for what a feature actually needs. Anything not
              listed here is never requested.
            </p>
            <AndroidSettingsGroup title="Capabilities">
              <AndroidSettingsRow
                icon={Bell}
                title="Notifications"
                summary={notificationStatus === 'Allowed'
                  ? 'Allowed — used for reminders you create'
                  : notificationStatus === 'Check failed' || notificationStatus === 'Checking…'
                    ? notificationStatus
                    : `${notificationStatus} — reminders will not appear`}
                onClick={() => openPage('notifications')}
              />
              {notificationStatus === 'Check failed' && (
                <AndroidSettingsRow title="Retry notification check" onClick={() => void refreshNotificationStatus()} />
              )}
              <AndroidSettingsRow
                icon={Camera}
                title="Camera"
                summary={mediaStatus === 'error' ? 'Check failed' : mediaStatus === 'loading' ? 'Checking…' : mediaPermissions?.camera === 'granted' ? 'Allowed' : mediaPermissions?.camera === 'denied' ? 'Denied — open Android settings to allow it' : 'Requested when you choose Take a photo'}
              />
              <AndroidSettingsRow
                icon={Smartphone}
                title="Photos and media"
                summary={mediaStatus === 'error' ? 'Check failed' : mediaStatus === 'loading' ? 'Checking…' : mediaPermissions?.photos === 'granted' || mediaPermissions?.photos === 'limited' ? 'Available' : 'Uses Android’s photo picker; no broad storage permission'}
              />
              {mediaStatus === 'error' && (
                <AndroidSettingsRow title="Retry camera and media check" onClick={() => void refreshMediaStatus()} />
              )}
            </AndroidSettingsGroup>

            {isAndroid() && (
              <AndroidSettingsGroup>
                <AndroidSettingsRow
                  title="Open Android app settings"
                  summary="Review or change these from the system"
                  onClick={() => {
                    void CaizenNative.openAppSettings().then(clearNativeNotice).catch(() => {
                      showNativeFailure('Android app settings could not be opened.', () => {
                        void CaizenNative.openAppSettings();
                      });
                    });
                  }}
                />
              </AndroidSettingsGroup>
            )}
          </>
        )}

        {page === 'accessibility' && (
          <>
            <p className="android-settings-page-copy">
              Reduce motion without removing essential feedback.
            </p>
            <AndroidSettingsGroup>
              <SettingsToggle
                label="Reduced motion"
                summary="Limit decorative movement and transitions"
                checked={animationPreference === 'reduced'}
                onChange={(enabled) =>
                  setAnimationPreference(enabled ? 'reduced' : 'full')
                }
              />
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'about' && (
          <>
            <AndroidSettingsGroup>
              <AndroidSettingsRow title="Caizen" summary="Life manager" />
              <AndroidSettingsRow title="Version" value={appInfoStatus === 'ready' ? appInfo?.version : appInfoStatus === 'loading' ? 'Checking…' : 'Unavailable'} />
              <AndroidSettingsRow title="Build" value={appInfoStatus === 'ready' ? appInfo?.build : appInfoStatus === 'loading' ? 'Checking…' : 'Unavailable'} />
              {appInfoStatus === 'error' && (
                <AndroidSettingsRow title="Retry app details" onClick={() => void refreshAppInfo()} />
              )}
              <AndroidSettingsRow
                icon={ShieldCheck}
                title="Privacy"
                summary="Local by default; Cloud snapshots are optional"
              />
            </AndroidSettingsGroup>
            <AndroidSettingsGroup title="Data sources">
              <AndroidSettingsRow title="Anime & manga" summary="AniList" />
              <AndroidSettingsRow title="Movies & television" summary="TMDB" />
              <AndroidSettingsRow title="Streaming availability" summary="JustWatch" />
              <p className="android-settings-page-copy">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
            </AndroidSettingsGroup>
          </>
        )}

        {page === 'advanced' && (
          <>
            <p className="android-settings-page-copy">
              These controls reset guidance or manage sample records.
            </p>
            <AndroidSettingsGroup title="Help">
              <AndroidSettingsRow
                icon={BookOpen}
                title="Learn Caizen"
                onClick={onOpenGuide}
              />
              {!isDemoMode && (
                <AndroidSettingsRow
                  icon={RotateCcw}
                  title="Replay introduction"
                  onClick={onResetOnboarding}
                />
              )}
            </AndroidSettingsGroup>
            <AndroidSettingsGroup title="Demo Mode">
              <AndroidSettingsRow
                title={isDemoMode ? 'Return to my workspace' : 'Explore a ready-made Caizen'}
                summary="Your workspace is preserved before sample records are opened"
                onClick={isDemoMode ? onExitDemo : onEnterDemo}
              />
              {isDemoMode && (
                <AndroidSettingsRow
                  title="Reset Demo"
                  onClick={onResetDemo}
                />
              )}
            </AndroidSettingsGroup>
          </>
        )}
      </div>

      <CaizenSelectionSheet
        open={currencyOpen}
        title="Display currency"
        value={currentProfile?.currency || 'PHP'}
        options={getCurrencySelectOptions()}
        searchable
        onClose={() => setCurrencyOpen(false)}
        onChange={(currency) => {
          if (currentProfile) updateProfile(currentProfile.id, { currency });
        }}
      />
      <ConfirmDialog
        isOpen={discardNavigationOpen}
        title="Discard navigation changes?"
        message="Your pinned destinations and order will stay unchanged."
        confirmText="Discard"
        cancelText="Keep editing"
        isDangerous
        onCancel={() => setDiscardNavigationOpen(false)}
        onConfirm={() => {
          setNavigationDraft([...navigationBaseline]);
          setDiscardNavigationOpen(false);
          setPageHistory(['home']);
        }}
      />
    </section>
  );
}
