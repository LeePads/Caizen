'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  cancelCloudGoogleSignIn, getGoogleAuthAttempt, GOOGLE_AUTH_EVENT, googleAuthIsBusy, googleAuthIsPending,
  noteCloudAuthBrowserReturn, startCloudGoogleSignIn, type CloudAuthReturnIntent,
} from '@/lib/cloud-google-auth';
import { isCloudSyncConfigured } from '@/lib/supabase';
import { isDemoModeActive } from '@/lib/demo/demo-workspace';

export default function CloudGoogleSignInButton({ disabled = false, returnIntent, onBusyChange }: {
  disabled?: boolean;
  returnIntent: CloudAuthReturnIntent;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const retryInFlight = useRef(false);
  const busyChange = useRef(onBusyChange);
  busyChange.current = onBusyChange;

  useEffect(() => {
    let previousPhase: string | null = null;
    const update = () => {
      const attempt = getGoogleAuthAttempt();
      const lostPendingAttempt = !attempt && ['opening', 'waiting', 'exchanging'].includes(previousPhase ?? '');
      const completedAttemptEnded = !attempt && previousPhase === 'completed';
      previousPhase = attempt?.phase ?? null;
      const nextBusy = retryInFlight.current || googleAuthIsBusy();
      setBusy(nextBusy);
      busyChange.current?.(nextBusy);
      setPhase(attempt?.phase ?? null);
      setPending(googleAuthIsPending());
      setExchanging(attempt?.phase === 'exchanging');
      if (attempt) {
        setMessage(attempt.phase === 'waiting' && attempt.message
          ? `${attempt.message} You can retry.`
          : attempt.message || (attempt.phase === 'waiting' ? 'Finish signing in in your browser.' : ''));
      } else if (lostPendingAttempt) {
        setMessage('Google sign-in ended before completion. You can retry.');
      } else if (completedAttemptEnded) {
        setMessage('');
      }
    };
    update();
    const onPageShow = () => { update(); noteCloudAuthBrowserReturn(); };
    const onVisible = () => { if (document.visibilityState === 'visible') onPageShow(); };
    // A remount after browser Back can miss pageshow, especially without BFCache.
    if (getGoogleAuthAttempt()?.phase === 'waiting' && document.visibilityState === 'visible') noteCloudAuthBrowserReturn();
    window.addEventListener(GOOGLE_AUTH_EVENT, update);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => {
      if (previousPhase && !getGoogleAuthAttempt()) {
        update();
      }
    }, 1000);
    return () => {
      window.removeEventListener(GOOGLE_AUTH_EVENT, update);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
      busyChange.current?.(false);
    };
  }, []);

  const retryable = !pending && !busy && phase !== 'completed' && Boolean(message);
  const signIn = async () => {
    if (retryInFlight.current || disabled || busy || pending || googleAuthIsBusy()) return;
    retryInFlight.current = true;
    setBusy(true); busyChange.current?.(true); setMessage('');
    try {
      // Invalidate the old ID/epoch and drain accepted exchanges before retry.
      await cancelCloudGoogleSignIn();
      await startCloudGoogleSignIn(returnIntent);
    } catch (error) {
      setPending(googleAuthIsPending());
      setPhase(getGoogleAuthAttempt()?.phase ?? 'failed');
      setMessage(error instanceof Error ? error.message : 'Google sign-in did not finish. Please try again.');
    } finally {
      retryInFlight.current = false;
      const nextBusy = googleAuthIsBusy();
      setBusy(nextBusy); busyChange.current?.(nextBusy);
    }
  };

  const cancel = async () => {
    // Recheck the live attempt: a callback can begin exchanging after render.
    if (disabled || retryInFlight.current || !googleAuthIsPending() || getGoogleAuthAttempt()?.phase === 'exchanging') return;
    retryInFlight.current = true;
    setCancelling(true);
    setBusy(true); busyChange.current?.(true);
    try {
      await cancelCloudGoogleSignIn();
      setPending(false); setPhase(null);
      setMessage('Google sign-in cancelled. You can retry.');
    } catch {
      setPending(googleAuthIsPending());
      setMessage(googleAuthIsPending() ? 'Could not cancel Google sign-in. Try cancelling again.' : 'Google sign-in ended. You can retry.');
    } finally {
      setCancelling(false);
      retryInFlight.current = false;
      const nextBusy = googleAuthIsBusy();
      setBusy(nextBusy); busyChange.current?.(nextBusy);
    }
  };

  return <div className="grid min-w-0 gap-2" aria-busy={busy}>
    <button type="button" disabled={disabled || busy || pending || !isCloudSyncConfigured || isDemoModeActive()}
      onClick={() => void signIn()}
      style={{ fontFamily: 'Arial, sans-serif' }}
      className="inline-flex min-h-12 min-w-0 w-full items-center justify-center gap-3 whitespace-normal rounded-xl border border-[#747775] bg-white px-4 py-3 text-center text-sm font-medium text-[#1f1f1f] hover:bg-[#f2f2f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48" className="shrink-0">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55Z" />
        <path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
      </svg>
      {cancelling ? 'Cancelling Google sign-in…' : exchanging ? 'Completing Google sign-in…' : busy ? phase === 'waiting' && pending ? 'Waiting for sign-in…' : 'Opening Google…' : retryable ? 'Retry Google sign-in' : 'Continue with Google'}
    </button>
    {pending && !exchanging ? <Button type="button" variant="ghost" className="h-auto w-full whitespace-normal" disabled={disabled || retryInFlight.current} onClick={() => void cancel()}>Cancel Google sign-in</Button> : null}
    <p role="status" aria-atomic="true" className={message ? 'text-body-sm text-muted-foreground' : 'sr-only'}>{message}</p>
  </div>;
}
