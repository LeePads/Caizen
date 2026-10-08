'use client';

import { useEffect, useRef, useState } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isNativeApp, dispatchNativeEvent } from '@/lib/platform';
import { useAppContext } from '@/lib/context';
import { requestWorkSetupLeave } from '@/lib/workhub/setup-navigation';
import { workspaceIsProtected } from '@/lib/storage/workspace-fence';
import {
  retainRestoredCameraResult,
  takeRestoredCameraResult,
  type NativeNavigationTarget,
} from '@/lib/native/app-lifecycle';
import { recoverInventoryCameraResult } from '@/lib/native/inventory-photo-recovery';
import {
  minimizeAndroidApp,
  registerAndroidBackHandler,
} from '@/lib/native/back-handler';
import { registerNetworkAwareness } from '@/lib/native/network';
import {
  NOTIFICATION_RECONCILIATION_ERROR_EVENT,
  reconcileNotifications,
} from '@/lib/native/notifications';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  loadNotificationSettings,
  type NotificationSettings,
} from '@/lib/native/notification-settings';
import {
  clearWidgetSnapshot,
  publishWidgetSnapshots,
  readWidgetAppearance,
} from '@/lib/native/widget-snapshot';
import type { WidgetActionResult } from '@/lib/native/widget-actions';
import {
  recordWidgetActionReceipt,
  hasWidgetActionReceipt,
  removeWidgetActionReceiptsForProfiles,
  normalizeWidgetAction,
  createWidgetActionId,
} from '@/lib/native/widget-actions';
import { buildWidgetSnapshot } from '@/lib/native/widget-snapshot';
import { CaizenNative } from '@/lib/native/calendar';
import { getRoutineOccurrence, getRoutineOccurrenceKey } from '@/lib/lifehub/routine-schedule';
import { parseLocalDateKey, toLocalDateKey } from '@/lib/lifehub/date-utils';
import { useMusicPlayer } from '@/lib/music-player';
import { closeTopOverlay } from '@/lib/native/overlay-stack';
import {
  CaizenDateTimeInterceptor,
  CaizenSelectInterceptor,
} from '@/components/native/android-design';
import { setPrivacyScreen } from '@/lib/native/calendar';
import { getPrivacyScreenEnabled } from '@/lib/native/native-preferences';
import { useGlobalEntryLongPress } from '@/hooks/use-global-entry-long-press';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { notifyLegacy } from '@/lib/feedback/notify';
import {
  useKeepFocusedFieldVisible,
  useVisualViewport,
} from '@/hooks/use-visual-viewport';
import {
  subscribeToNativeRoutes,
  takePendingNativeRoute,
} from '@/lib/native/startup-route-queue';

/**
 * One queued destination, whatever produced it.
 *
 * Notification taps, widget taps, launcher shortcuts and deep links all
 * funnel into this shape so there is a single cold-start routing path rather
 * than competing ones.
 */
type QueuedRoute = {
  profileId?: string;
  section?: string;
  /** A view or form within the section, e.g. `tasks` or `add-task`. */
  feature?: string;
  recordId?: string;
};

const DEFERRED_ROUTE_KEY = 'caizen-demo-deferred-native-route';

function readDeferredRoute(): QueuedRoute | null {
  try {
    const raw = localStorage.getItem(DEFERRED_ROUTE_KEY);
    if (raw === null) return null;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { value = null; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      localStorage.removeItem(DEFERRED_ROUTE_KEY);
      return null;
    }
    const route = value as Record<string, unknown>;
    const fields = ['profileId', 'section', 'feature', 'recordId'] as const;
    if (fields.some(field => route[field] !== undefined && typeof route[field] !== 'string') ||
        !fields.some(field => typeof route[field] === 'string' && route[field].trim())) {
      localStorage.removeItem(DEFERRED_ROUTE_KEY);
      return null;
    }
    return {
      profileId: route.profileId as string | undefined,
      section: route.section as string | undefined,
      feature: route.feature as string | undefined,
      recordId: route.recordId as string | undefined,
    };
  } catch {
    // Auxiliary preferences may be unavailable; native startup still proceeds.
    return null;
  }
}

function nativeTargetToRoute(target: NativeNavigationTarget): QueuedRoute {
  return {
    profileId: target.profileId,
    section: target.section,
    feature: target.action,
    recordId: target.recordId,
  };
}

export function NativeAppShell() {
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const exitDialogRef = useRef<HTMLElement>(null);
  const {
    profiles,
    currentProfileId,
    switchProfile,
    isHydrated,
    completeRoutineOccurrenceForProfile,
    completeProductivityItemForProfile,
    completeWorkItemForProfile,
  } = useAppContext();
  // NativeAppShell renders inside MusicPlayerProvider (see app/layout.tsx),
  // so the widget snapshot can mirror the current track's safe title.
  const { activeItem } = useMusicPlayer();
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  // Holds a destination that arrived before the app finished hydrating.
  const pendingRoute = useRef<QueuedRoute | null>(null);
  const profileRouteGuardRef = useRef<QueuedRoute | null>(null);
  const widgetActionsInFlight = useRef(new Set<string>());
  const widgetDrainRunning = useRef(false);
  const widgetDrainQueued = useRef(false);
  const lastResumeSnapshotVersion = useRef(0);
  const widgetActionsAwaitingSave = useRef(new Map<string, string>());
  const widgetActionsPersisted = useRef(new Set<string>());
  const knownProfileIds = useRef<Set<string> | null>(null);
  const knownProfileRevisions = useRef<Map<string, string> | null>(null);
  const [localSaveVersion, setLocalSaveVersion] = useState(0);
  const [resumeVersion, setResumeVersion] = useState(0);
  const [widgetDrainVersion, setWidgetDrainVersion] = useState(0);
  const [routeVersion, setRouteVersion] = useState(0);
  useGlobalEntryLongPress(isNativeApp());
  useOverlayLifecycle(
    exitDialogOpen,
    () => setExitDialogOpen(false),
    {
      containerRef: exitDialogRef,
      initialFocusSelector: '[data-exit-cancel]',
    },
  );

  /*
    Centralized Escape coordinator, capture phase on window.

    Previously every overlay (ConfirmDialog, and ~26 bespoke modals) attached
    its own `keydown` Escape listener directly, each firing unconditionally.
    Pressing Escape while two overlays were open (most commonly a ConfirmDialog
    nested on top of a form) closed both at once instead of just the topmost.

    Registering on `window` with `capture: true` runs this before any bubble-
    phase listener on window/document gets the event. When the overlay stack
    has an entry, only that topmost overlay's close() runs, and propagation is
    stopped so no other component's own Escape listener fires. When the stack
    is empty (an overlay that has not been migrated to the stack), the event is
    left alone and existing per-component behaviour is unchanged.
  */
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (closeTopOverlay()) {
        event.stopPropagation();
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleEscape, { capture: true });
    return () => window.removeEventListener('keydown', handleEscape, { capture: true });
  }, []);

  // Runs on web too: --cz-vh is the single height authority everywhere, which
  // is what lets the keyboard layout be exercised in the headless harness.
  useVisualViewport();
  useKeepFocusedFieldVisible();

  useEffect(() => {
    const handleExitRequest = () => {
      setExitDialogOpen(true);
    };
    const handleNativeBackRequest = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          handled: boolean;
          kind: 'overlay' | 'nested-flow';
        }>
      ).detail;
      if (!detail || detail.handled || !exitDialogOpen) return;
      setExitDialogOpen(false);
      detail.handled = true;
    };
    window.addEventListener('caizen:exit-request', handleExitRequest);
    window.addEventListener(
      'caizen:native-back-request',
      handleNativeBackRequest,
    );
    return () => {
      window.removeEventListener('caizen:exit-request', handleExitRequest);
      window.removeEventListener(
        'caizen:native-back-request',
        handleNativeBackRequest,
      );
    };
  }, [exitDialogOpen]);

  // Kept fresh every render so the mount-only native-init effect below can
  // route a notification tap against the current profile list instead of
  // whatever was in scope when the listener was first registered.
  const switchProfileRef = useRef(switchProfile);
  const currentProfileIdRef = useRef(currentProfileId);
  const isHydratedRef = useRef(isHydrated);
  const profilesRef = useRef(profiles);
  useEffect(() => {
    switchProfileRef.current = switchProfile;
    currentProfileIdRef.current = currentProfileId;
    isHydratedRef.current = isHydrated;
    profilesRef.current = profiles;
  });

  /*
    The single routing entry point.

    Every source (notification tap, widget tap, launcher shortcut, deep link)
    calls this. If the app has not hydrated yet the destination is parked and
    replayed by the effect below, so a cold start from a widget lands on the
    right screen instead of the dashboard.

    A profile that no longer exists is ignored rather than switched to, and an
    unknown section falls back to the dashboard inside the page's own handler,
    so a deleted record or removed profile degrades to a valid screen.
  */
  const routeToRef = useRef<(route: QueuedRoute) => void>(() => undefined);

  routeToRef.current = (route: QueuedRoute) => {
    if (workspaceIsProtected()) {
      try { localStorage.setItem(DEFERRED_ROUTE_KEY, JSON.stringify(route)); } catch { /* Demo remains protected when preferences are unavailable. */ }
      window.dispatchEvent(new Event('caizen:demo-native-return-request'));
      return;
    }
    pendingRoute.current = {
      ...route,
      profileId: route.profileId ?? (isHydratedRef.current ? currentProfileIdRef.current : undefined),
    };
    setRouteVersion(version => version + 1);
  };

  useEffect(() => {
    if (!isHydrated || !pendingRoute.current || workspaceIsProtected()) return;
    const route = pendingRoute.current;
    if (route.profileId && !profiles.some(profile => profile.id === route.profileId)) {
      pendingRoute.current = null;
      return;
    }
    if (route.profileId && route.profileId !== currentProfileId) {
      if (profileRouteGuardRef.current !== route) {
        profileRouteGuardRef.current = route;
        void requestWorkSetupLeave('profile-route').then(allow => {
          if (pendingRoute.current !== route) return;
          profileRouteGuardRef.current = null;
          if (!allow) {
            pendingRoute.current = null;
            return;
          }
          switchProfileRef.current(route.profileId!);
        });
      }
      return;
    }
    // The page's profile-bound navigation listener updates in its own effect.
    // Deliver after the whole React commit, including that listener, finishes.
    const frame = requestAnimationFrame(() => {
      if (pendingRoute.current !== route ||
          (route.profileId && currentProfileIdRef.current !== route.profileId)) return;
      pendingRoute.current = null;
      dispatchNativeEvent('navigate', {
        section: route.section,
        feature: route.feature,
        recordId: route.recordId,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [isHydrated, currentProfileId, profiles, routeVersion]);

  // NativeStartupGate captures routes before providers exist. Drain the
  // retained target into this hydration-aware router once the shell mounts.
  useEffect(() => {
    const handleNativeTarget = (target: NativeNavigationTarget) => {
      routeToRef.current(nativeTargetToRoute(target));
    };
    const unsubscribe = subscribeToNativeRoutes(handleNativeTarget);
    const deferred = readDeferredRoute();
    if (deferred && !workspaceIsProtected()) {
      routeToRef.current(deferred);
      try { localStorage.removeItem(DEFERRED_ROUTE_KEY); } catch { /* Routing does not depend on preference cleanup. */ }
    }
    const pending = takePendingNativeRoute();
    if (pending) handleNativeTarget(pending);
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadNotificationSettings().then((settings) => {
      if (!cancelled) setNotificationSettings(settings);
    });
    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<NotificationSettings>).detail;
      if (detail) setNotificationSettings(detail);
    };
    window.addEventListener('caizen:notification-settings-changed', handleSettingsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('caizen:notification-settings-changed', handleSettingsChanged);
    };
  }, []);

  useEffect(() => {
    if (!isNativeApp() || !isHydrated || workspaceIsProtected()) return;
    // Debounced so a burst of saves (e.g. bulk import) only reconciles once.
    const timeout = setTimeout(() => {
      if (workspaceIsProtected()) return;
      void reconcileNotifications(profiles, currentProfileId, notificationSettings);
    }, 600);
    return () => clearTimeout(timeout);
  }, [profiles, currentProfileId, notificationSettings, isHydrated, resumeVersion]);

  useEffect(() => {
    const handleNotificationError = () => {
      notifyLegacy({
        title: 'Reminders need attention',
        description: 'Caizen could not refresh local reminders. Check notification permission and try again.',
        variant: 'warning',
        actionId: 'native:notification-reconciliation-error',
      });
    };
    window.addEventListener(NOTIFICATION_RECONCILIATION_ERROR_EVENT, handleNotificationError);
    return () => window.removeEventListener(NOTIFICATION_RECONCILIATION_ERROR_EVENT, handleNotificationError);
  }, []);

  // Mirrors the sanitized widget projections after committed changes, profile
  // switches, and imports. publishWidgetSnapshots debounces internally and
  // never throws, so a widget failure cannot disturb the app.
  useEffect(() => {
    if (!isNativeApp() || !isHydrated || workspaceIsProtected()) return;

    if (!profiles.length) {
      void clearWidgetSnapshot();
      return;
    }

    void publishWidgetSnapshots(profiles, currentProfileId, {
      nowPlaying: activeItem,
      appearance: readWidgetAppearance(),
    });
  }, [profiles, currentProfileId, isHydrated, activeItem]);

  useEffect(() => {
    if (!isNativeApp() || !isHydrated) return;
    const refreshOnResume = (event: Event) => {
      if (!(event as CustomEvent<{ isActive?: boolean }>).detail?.isActive) return;
      setResumeVersion(version => version + 1);
    };
    window.addEventListener('caizen:app-state', refreshOnResume);
    return () => window.removeEventListener('caizen:app-state', refreshOnResume);
  }, [isHydrated]);

  useEffect(() => {
    if (!isNativeApp() || !isHydrated) return;
    let recovering = false;
    const recover = async () => {
      if (recovering) return;
      const result = takeRestoredCameraResult();
      if (!result) return;
      recovering = true;
      try {
        const outcome = await recoverInventoryCameraResult(
          result,
          new Set(profilesRef.current.map(profile => profile.id)),
        );
        if (outcome === 'recovered') {
          notifyLegacy({
            title: 'Camera photo recovered',
            description: 'Open Inventory in the original profile to attach or discard it.',
            variant: 'warning',
            actionId: 'native:recovered-inventory-photo',
          });
        } else if (outcome === 'unowned') {
          notifyLegacy({
            title: 'Camera result needs attention',
            description: 'The original Inventory draft or profile could not be confirmed.',
            variant: 'warning',
            actionId: 'native:unowned-camera-photo',
          });
        }
      } catch {
        retainRestoredCameraResult(result);
        notifyLegacy({
          title: 'Camera photo recovery failed',
          description: 'Caizen will try again when you return to the app.',
          variant: 'warning',
          actionId: 'native:camera-recovery-error',
        });
      } finally {
        recovering = false;
      }
    };
    const onRestoredResult = () => { void recover(); };
    const onResume = (event: Event) => {
      if ((event as CustomEvent<{ isActive?: boolean }>).detail?.isActive) void recover();
    };
    window.addEventListener('caizen:restored-result', onRestoredResult);
    window.addEventListener('caizen:app-state', onResume);
    void recover();
    return () => {
      window.removeEventListener('caizen:restored-result', onRestoredResult);
      window.removeEventListener('caizen:app-state', onResume);
    };
  }, [isHydrated]);

  useEffect(() => {
    if (!isNativeApp() || !isHydrated) return;
    const handleLocalSave = (event: Event) => {
      const changedProfileIds = new Set(
        (event as CustomEvent<{ changedProfileIds?: string[] }>).detail?.changedProfileIds || [],
      );
      let ready = false;
      widgetActionsAwaitingSave.current.forEach((profileId, actionId) => {
        if (changedProfileIds.has(profileId)) {
          widgetActionsPersisted.current.add(actionId);
          ready = true;
        }
      });
      if (ready) setLocalSaveVersion(version => version + 1);
    };
    window.addEventListener('caizen:local-save-complete', handleLocalSave);
    return () => window.removeEventListener('caizen:local-save-complete', handleLocalSave);
  }, [isHydrated]);

  // Native widget taps are durable pending events, not a second domain store.
  // Existing UI toggles remain separate; native actions are explicit,
  // complete-only operations against the exact pinned profile.
  useEffect(() => {
    if (!isNativeApp() || !isHydrated) return;
    const nextIds = new Set(profiles.map(profile => profile.id));
    const previousIds = knownProfileIds.current;
    const nextRevisions = new Map(
      profiles.map(profile => [profile.id, buildWidgetSnapshot(profile, { now: new Date() }).revision]),
    );
    if (previousIds) {
      const removed = [...previousIds].filter(profileId => !nextIds.has(profileId));
      if (removed.length) void removeWidgetActionReceiptsForProfiles(removed);
    }
    knownProfileIds.current = nextIds;
    knownProfileRevisions.current = nextRevisions;
  }, [isHydrated, profiles]);

  useEffect(() => {
    if (!isNativeApp() || !isHydrated || workspaceIsProtected()) return;
    if (widgetDrainRunning.current) {
      widgetDrainQueued.current = true;
      return;
    }
    widgetDrainRunning.current = true;
    let cancelled = false;
    const publishResumeSnapshot = async () => {
      if (resumeVersion <= lastResumeSnapshotVersion.current ||
          widgetActionsAwaitingSave.current.size || !profilesRef.current.length) return;
      const published = await publishWidgetSnapshots(profilesRef.current, currentProfileIdRef.current, {
        nowPlaying: activeItem,
        appearance: readWidgetAppearance(),
        immediate: true,
      });
      if (published) lastResumeSnapshotVersion.current = resumeVersion;
    };
    void CaizenNative.getPendingWidgetActions().then(async result => {
      if (cancelled) return;
      if (workspaceIsProtected()) return;
      if (!result?.actions?.length) {
        await publishResumeSnapshot();
        return;
      }
      const results: WidgetActionResult[] = [];
      for (const rawAction of result.actions) {
        const action = normalizeWidgetAction(rawAction);
        if (!action) {
          const actionId = typeof (rawAction as { actionId?: unknown })?.actionId === 'string'
            ? (rawAction as { actionId: string }).actionId
            : '';
          if (actionId) results.push({ actionId, status: 'rejected', reason: 'invalid' });
          continue;
        }
        const profile = profiles.find(entry => entry.id === action.profileId);
        if (!profile) {
          widgetActionsAwaitingSave.current.delete(action.actionId);
          widgetActionsPersisted.current.delete(action.actionId);
          results.push({ actionId: action.actionId, status: 'rejected', reason: 'missing-profile' });
          continue;
        }
        const date = parseLocalDateKey(action.localDateKey);
        const age = Date.now() - action.createdAt;
        if (!date || age < 0 || age > 48 * 60 * 60 * 1000 ||
            toLocalDateKey(date) !== toLocalDateKey(new Date(action.createdAt))) {
          widgetActionsAwaitingSave.current.delete(action.actionId);
          widgetActionsPersisted.current.delete(action.actionId);
          results.push({ actionId: action.actionId, status: 'rejected', reason: 'wrong-date' });
          continue;
        }
        if (await createWidgetActionId(
          action.actionType, action.profileId, action.recordId, action.occurrenceKey,
        ) !== action.actionId) {
          results.push({ actionId: action.actionId, status: 'rejected', reason: 'invalid' });
          continue;
        }
        const routine = action.actionType === 'routine.complete'
          ? profile.dailyChecklistItems?.find(item => item.id === action.recordId)
          : undefined;
        const task = action.actionType === 'task.complete'
          ? profile.productivityItems?.find(item => item.id === action.recordId)
          : undefined;
        const workTask = action.actionType === 'workTask.complete'
          ? profile.workItems?.find(item => item.id === action.recordId)
          : undefined;
        if (!routine && !task && !workTask) {
          widgetActionsAwaitingSave.current.delete(action.actionId);
          widgetActionsPersisted.current.delete(action.actionId);
          results.push({ actionId: action.actionId, status: 'rejected', reason: 'missing-record' });
          continue;
        }

        const targetIsDone = action.actionType === 'routine.complete'
          ? Boolean(date && getRoutineOccurrence(routine!, date)?.status === 'done')
          : action.actionType === 'task.complete'
            ? task?.status === 'completed'
            : workTask?.status === 'done';
        const awaitingSave = widgetActionsAwaitingSave.current.has(action.actionId);
        if (awaitingSave) {
          // A successful canonical save changes snapshotRevision. Complete
          // this handshake before stale-revision validation. The native
          // accepted overlay must not be acknowledged until the fresh
          // canonical projection has also been published; otherwise the
          // launcher can redraw the old incomplete snapshot after ack.
          if (!widgetActionsPersisted.current.has(action.actionId)) continue;
          if (!targetIsDone) continue;
          const published = await publishWidgetSnapshots(
            profilesRef.current,
            currentProfileIdRef.current,
            {
              nowPlaying: action.profileId === currentProfileIdRef.current ? activeItem : null,
              appearance: readWidgetAppearance(),
              immediate: true,
            },
          );
          if (!published) {
            widgetActionsInFlight.current.delete(action.actionId);
            results.push({
              actionId: action.actionId,
              status: 'retryableFailure',
              reason: 'save-failed',
            });
            continue;
          }
          widgetActionsAwaitingSave.current.delete(action.actionId);
          widgetActionsPersisted.current.delete(action.actionId);
          await recordWidgetActionReceipt(action.profileId, action.actionId);
          results.push({ actionId: action.actionId, status: 'applied' });
          continue;
        }
        if (await hasWidgetActionReceipt(action.profileId, action.actionId)) {
          results.push({ actionId: action.actionId, status: 'alreadyApplied' });
          continue;
        }
        if (action.actionType === 'routine.complete') {
          if (!routine || !date || getRoutineOccurrenceKey(routine, date) !== action.occurrenceKey) {
            results.push({ actionId: action.actionId, status: 'rejected', reason: 'invalid' });
            continue;
          }
        } else if (action.occurrenceKey !== 'once') {
          results.push({ actionId: action.actionId, status: 'rejected', reason: 'invalid' });
          continue;
        }
        if (targetIsDone) {
          await recordWidgetActionReceipt(action.profileId, action.actionId);
          results.push({ actionId: action.actionId, status: 'alreadyApplied' });
          continue;
        }
        const expectedRevision = buildWidgetSnapshot(profile, {
          now: date,
          nowPlaying: action.profileId === currentProfileId ? activeItem : null,
        }).revision;
        if (expectedRevision !== action.snapshotRevision) {
          results.push({ actionId: action.actionId, status: 'rejected', reason: 'stale' });
          continue;
        }
        if (widgetActionsInFlight.current.has(action.actionId)) continue;
        widgetActionsInFlight.current.add(action.actionId);
        widgetActionsAwaitingSave.current.set(action.actionId, action.profileId);
        const completion = action.actionType === 'routine.complete'
          ? completeRoutineOccurrenceForProfile(action.profileId, action.recordId, date)
          : action.actionType === 'task.complete'
            ? completeProductivityItemForProfile(action.profileId, action.recordId, new Date(action.createdAt))
            : completeWorkItemForProfile(action.profileId, action.recordId);
        if (completion === 'alreadyApplied') {
          widgetActionsAwaitingSave.current.delete(action.actionId);
          widgetActionsInFlight.current.delete(action.actionId);
          await recordWidgetActionReceipt(action.profileId, action.actionId);
          results.push({ actionId: action.actionId, status: 'alreadyApplied' });
        } else if (completion === 'rejected') {
          widgetActionsAwaitingSave.current.delete(action.actionId);
          widgetActionsInFlight.current.delete(action.actionId);
          results.push({ actionId: action.actionId, status: 'rejected', reason: 'invalid' });
        }
      }
      if (results.length) {
        try {
          await CaizenNative.ackWidgetActions({ results });
        } finally {
          // A bridge failure must remain retryable on the next hydration or
          // profile switch; do not strand an action in the in-flight guard.
          results
            .filter(result => result.status !== 'retryableFailure')
            .forEach(result => widgetActionsInFlight.current.delete(result.actionId));
        }
      }
      await publishResumeSnapshot();
    }).catch(() => undefined).finally(() => {
      widgetDrainRunning.current = false;
      if (widgetDrainQueued.current) {
        widgetDrainQueued.current = false;
        setWidgetDrainVersion(version => version + 1);
      }
    });
    return () => { cancelled = true; };
  }, [
    activeItem,
    completeProductivityItemForProfile,
    completeRoutineOccurrenceForProfile,
    completeWorkItemForProfile,
    currentProfileId,
    isHydrated,
    localSaveVersion,
    profiles,
    resumeVersion,
    widgetDrainVersion,
  ]);

  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.setAttribute('data-capacitor', 'true');
    window.dispatchEvent(new CustomEvent('caizen:platform-ready'));
    const cleanups: Array<() => Promise<void>> = [];
    let disposed = false;
    const trackCleanup = async (
      registration: Promise<() => Promise<void>>,
    ) => {
      const cleanup = await registration;
      if (disposed) {
        await cleanup();
      } else {
        cleanups.push(cleanup);
      }
    };

    void (async () => {
      try {
        // `StatusBar.setOverlaysWebView` is deprecated in Capacitor 8 - the
        // core SystemBars plugin owns edge-to-edge now - and its only
        // remaining effect is setting SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN, which
        // is exactly the flag Keyboard.isOverlays() tests to select its more
        // aggressive resize branch. Combined with resizeOnFullScreen it
        // compensated for the IME twice, which is the blank gap under the form.
        const syncStatusBar = (resolvedTheme?: string) =>
          StatusBar.setStyle({
            style:
              (resolvedTheme ??
                document.documentElement.dataset.resolvedTheme) === 'dark'
                ? Style.Light
                : Style.Dark,
          });
        await syncStatusBar();
        await setPrivacyScreen(await getPrivacyScreenEnabled()).catch(
          () => undefined,
        );
        const handleResolvedTheme = (event: Event) => {
          const resolvedTheme = (
            event as CustomEvent<{ resolvedTheme?: string }>
          ).detail?.resolvedTheme;
          void syncStatusBar(resolvedTheme).catch(() => undefined);
          if (profilesRef.current.length) {
            void publishWidgetSnapshots(profilesRef.current, currentProfileIdRef.current, {
              nowPlaying: activeItem,
              appearance: readWidgetAppearance(),
              immediate: true,
            });
          }
        };
        window.addEventListener(
          'caizen:theme-resolved',
          handleResolvedTheme,
        );
        cleanups.push(async () => {
          window.removeEventListener(
            'caizen:theme-resolved',
            handleResolvedTheme,
          );
        });
        await trackCleanup(registerAndroidBackHandler());
        await trackCleanup(registerNetworkAwareness());
        // Layout is driven entirely by useVisualViewport (--cz-vh /
        // --cz-keyboard-h). These listeners only mark intent, so the shell can
        // hide the dock and FAB the moment the keyboard is requested rather
        // than waiting for the viewport to settle.
        //
        // The plugin reports keyboardHeight in dp; the previous code wrote it
        // with a `px` suffix, which happened to work at zoom 1 and broke under
        // Android display-size and font-scale changes. visualViewport has no
        // unit ambiguity.
        const show = await Keyboard.addListener('keyboardWillShow', () => {
          document.documentElement.setAttribute('data-keyboard-open', 'true');
        });
        const hide = await Keyboard.addListener('keyboardWillHide', () => {
          document.documentElement.removeAttribute('data-keyboard-open');
        });
        const cleanupKeyboard = async () => {
          await show.remove();
          await hide.remove();
        };
        if (disposed) {
          await cleanupKeyboard();
        } else {
          cleanups.push(cleanupKeyboard);
        }
      } catch {
        console.warn('Caizen native initialization recovered from an unavailable integration.');
      } finally {
        if (!disposed) await SplashScreen.hide().catch(() => undefined);
      }
    })();

    return () => {
      disposed = true;
      document.documentElement.removeAttribute('data-capacitor');
      void Promise.all(cleanups.map((cleanup) => cleanup()));
    };
  }, []);

  if (!exitDialogOpen) {
    // Still mounted so the global date/time interceptor keeps running even
    // when no exit dialog is showing.
    return <><CaizenDateTimeInterceptor /><CaizenSelectInterceptor /></>;
  }

  return (
    <>
    <CaizenDateTimeInterceptor />
    <CaizenSelectInterceptor />
    <div
      className="caizen-exit-dialog-root"
      data-caizen-overlay="open"
    >
      <button
        type="button"
        className="caizen-exit-dialog-backdrop"
        aria-label="Cancel exit"
        onClick={() => setExitDialogOpen(false)}
      />
      <section
        ref={exitDialogRef}
        tabIndex={-1}
        className="caizen-exit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="caizen-exit-title"
        aria-describedby="caizen-exit-description"
      >
        <h2 id="caizen-exit-title">Exit Caizen?</h2>
        <p id="caizen-exit-description">
          Your local changes are saved on this device.
        </p>
        <div className="caizen-exit-dialog-actions">
          <button
            type="button"
            data-exit-cancel
            onClick={() => setExitDialogOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="caizen-exit-dialog-confirm"
            onClick={() => {
              setExitDialogOpen(false);
              void minimizeAndroidApp().catch(() => undefined);
            }}
          >
            Exit
          </button>
        </div>
      </section>
    </div>
    </>
  );
}
