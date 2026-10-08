'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { SplashScreen } from '@capacitor/splash-screen';

import { isNativeApp } from '@/lib/platform';
import { loadAppState } from '@/lib/storage/app-repository';
import { registerAppLifecycle } from '@/lib/native/app-lifecycle';
import { registerNotificationActions } from '@/lib/native/notifications';
import { enqueueNativeReminderRoute } from '@/lib/native/startup-route-queue';

const IS_CAPACITOR_BUILD =
  process.env.NEXT_PUBLIC_CAPACITOR_BUILD === '1';

type GateState = 'checking' | 'ready' | 'error';

export function NativeStartupGate({ children }: { children: ReactNode }) {
  const native = IS_CAPACITOR_BUILD || isNativeApp();
  const [state, setState] = useState<GateState>(native ? 'checking' : 'ready');
  const [errorMessage, setErrorMessage] = useState('');

  const resolveStartup = useCallback(async () => {
    if (!native) {
      setState('ready');
      return;
    }

    setState('checking');
    setErrorMessage('');

    try {
      // Read-only inspection. The shared gate reconciles Demo before any
      // migration or default-profile write is allowed.
      await loadAppState();
      setState('ready');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Caizen could not inspect local storage safely.',
      );
      setState('error');
    }
  }, [native]);

  useEffect(() => {
    if (!native) return;

    let disposed = false;
    const cleanups: Array<() => Promise<void>> = [];
    const trackCleanup = async (registration: Promise<() => Promise<void>>) => {
      try {
        const cleanup = await registration;
        if (disposed) {
          await cleanup();
        } else {
          cleanups.push(cleanup);
        }
      } catch (error) {
        console.warn('A native startup integration could not be registered.', error);
      }
    };

    void trackCleanup(registerNotificationActions(enqueueNativeReminderRoute));

    const handleCloudAuth = (event: Event) => {
      if ((event as CustomEvent<{ ok?: boolean }>).detail?.ok) {
        void resolveStartup();
      }
    };
    window.addEventListener('caizen:cloud-auth', handleCloudAuth);
    void (async () => {
      // Read the cold-start URL (including an auth callback) before deciding
      // whether this installation needs the first-run entry surface.
      await trackCleanup(registerAppLifecycle());
      if (!disposed) await resolveStartup();
    })();

    return () => {
      disposed = true;
      window.removeEventListener('caizen:cloud-auth', handleCloudAuth);
      for (const cleanup of cleanups) void cleanup();
    };
  }, [native, resolveStartup]);

  useEffect(() => {
    if (!native || state === 'checking') return;
    void SplashScreen.hide().catch(() => undefined);
  }, [native, state]);

  if (!native || state === 'ready') return children;

  return (
    <main className="native-entry-root" aria-busy={state === 'checking'}>
      <section className="native-entry-card" aria-live="polite">
        <span className="native-entry-mark" aria-hidden="true">
          <img src="/icons/caizen-android-icon-1024.png" alt="" />
        </span>
        <p className="native-entry-eyebrow">Caizen for Android</p>

        {state === 'checking' ? (
          <>
            <Loader2 className="native-entry-spinner" aria-hidden="true" />
            <h1>Opening your Caizen</h1>
            <p>Checking this device for an existing local profile.</p>
          </>
        ) : state === 'error' ? (
          <>
            <h1>Your local data could not be opened</h1>
            <p>{errorMessage}</p>
            <p className="native-entry-caution">
              Caizen has not created or replaced a profile. Retry after the
              storage issue is resolved.
            </p>
            <button
              type="button"
              className="native-entry-primary"
              onClick={() => void resolveStartup()}
            >
              <RefreshCw aria-hidden="true" /> Retry
            </button>
          </>
        ) : null}
      </section>

    </main>
  );
}
