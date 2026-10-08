import { App } from '@capacitor/app';
import type { RestoredListenerEvent } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { isNativeApp, dispatchNativeEvent } from '../platform';
import {
  enqueueNativeRoute,
  type NativeNavigationTarget as QueuedNativeNavigationTarget,
} from './startup-route-queue';
import { completeCloudAuthCallback, setNativeRecovery } from '../cloud-auth-callback';
import { noteCloudAuthBrowserReturn, retainGoogleAuthError } from '../cloud-google-auth';

export type NativeNavigationTarget = QueuedNativeNavigationTarget;

let pendingRestoredCameraResult: RestoredListenerEvent | null = null;

export function takeRestoredCameraResult(): RestoredListenerEvent | null {
  const result = pendingRestoredCameraResult;
  pendingRestoredCameraResult = null;
  return result;
}

export function retainRestoredCameraResult(result: RestoredListenerEvent): void {
  pendingRestoredCameraResult = result;
}

export const parseNativeTarget = (
  url: string,
): NativeNavigationTarget | null => {
  try {
    const parsed = new URL(url);
    if (!['caizen:', 'https:', 'http:'].includes(parsed.protocol)) return null;
    return {
      profileId: parsed.searchParams.get('profile') ?? undefined,
      section:
        parsed.searchParams.get('section') ??
        // caizen://open?... puts the intent in the query, so `open` itself is
        // not a destination.
        (parsed.hostname && parsed.hostname !== 'open'
          ? parsed.hostname
          : parsed.pathname.split('/').filter(Boolean)[0]),
      recordId: parsed.searchParams.get('record') ?? undefined,
      action: parsed.searchParams.get('action') ?? undefined,
      source: parsed.searchParams.get('source') ?? undefined,
    };
  } catch {
    return null;
  }
};

const parseTarget = parseNativeTarget;

const handleAuthCallback = async (url: string) => {
  try {
    const parsed = new URL(url);
    const isAuthCallback =
      parsed.protocol === 'caizen:' &&
      parsed.hostname === 'auth' &&
      parsed.pathname.replace(/\/+$/, '') === '/callback';
    if (!isAuthCallback) return false;

    const result = await completeCloudAuthCallback(parsed);
    // Google completion is retained in auxiliary attempt state until the
    // hydrated app consumes it, including errors and cold starts during Demo.
    if (result.kind === 'google') {
      if (result.error && !result.duplicate) retainGoogleAuthError(result.error);
      return true;
    }
    if (result.duplicate) return true;
    if (result.recovery || result.error) setNativeRecovery(result);
    dispatchNativeEvent('cloud-auth', {
      ok: !result.error,
      recovery: result.recovery,
      message: result.error,
    });
    return true;
  } catch {
    return false;
  }
};

export async function registerAppLifecycle(): Promise<() => Promise<void>> {
  if (!isNativeApp()) return async () => undefined;
  const listeners: PluginListenerHandle[] = [];

  listeners.push(
    await App.addListener('appStateChange', ({ isActive }) => {
      document.documentElement.toggleAttribute('data-app-paused', !isActive);
      dispatchNativeEvent('app-state', { isActive });
      if (isActive) noteCloudAuthBrowserReturn();
    }),
  );
  listeners.push(
    await App.addListener('appUrlOpen', ({ url }) => {
      void handleAuthCallback(url).then((handled) => {
        if (handled) return;
        const target = parseTarget(url);
        // Retained rather than navigating directly: NativeAppShell owns the
        // hydrated route consumer, even when this arrives at the entry gate.
        if (target) enqueueNativeRoute(target);
      });
    }),
  );

  // A cold start launched from a widget or shortcut may deliver the intent
  // before any listener is attached, so the launch URL is read explicitly.
  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url) {
      const launchUrl = launch.url;
      // Cloud networking must not hold the local-first startup gate closed.
      void handleAuthCallback(launchUrl).then(handled => {
        if (handled) return;
        const target = parseTarget(launchUrl);
        if (target) enqueueNativeRoute(target);
      });
    }
  } catch {
    // A missing launch URL is the normal case.
  }
  noteCloudAuthBrowserReturn();
  listeners.push(
    await App.addListener('appRestoredResult', (result) => {
      if (result.pluginId === 'Camera' && result.methodName === 'getPhoto') {
        pendingRestoredCameraResult = result;
      }
      dispatchNativeEvent('restored-result', result);
    }),
  );

  return async () => {
    await Promise.all(listeners.map((listener) => listener.remove()));
  };
}
