'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import CloudAuthForm, { cloudAccountCreatedMessage, cloudAuthError, cloudPasswordResetMessage } from '@/components/common/CloudAuthForm';
import { getRestoredCloudUser, signInToCloudSync, signUpForCloudSync, signOutFromCloudSync, requestCloudPasswordReset } from '@/lib/cloud-backup';
import { getSupabaseClient, isCloudSyncConfigured } from '@/lib/supabase';
import { cancelCloudGoogleSignIn, getGoogleAuthAttempt } from '@/lib/cloud-google-auth';
import { getCloudOperation, getServerCloudOperation, holdCloudManagement, subscribeCloudOperation } from '@/lib/cloud-operation';

export default function CloudLoginModal({ isOpen, onClose, onSignedIn, postSignIn = 'cloud-settings' }: {
  isOpen: boolean; onClose: () => void; onSignedIn?: (email: string) => void; postSignIn?: 'cloud-settings' | 'continue';
}) {
  const router = useRouter();
  const [account, setAccount] = useState<{ id: string; email: string } | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [hydrationFailed, setHydrationFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [authAction, setAuthAction] = useState<'submit' | 'password-reset'>('submit');
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const admitted = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const bodyRef = useRef<HTMLDivElement>(null);
  const sharedOperation = useSyncExternalStore(subscribeCloudOperation, getCloudOperation, getServerCloudOperation);
  const locked = busy || Boolean(sharedOperation);
  const loadAccount = useCallback(async () => {
    const ticket = ++generation.current;
    setHydrating(true); setHydrationFailed(false); setMessage(''); setError(false);
    try {
      const user = await getRestoredCloudUser();
      if (mounted.current && ticket === generation.current) setAccount(user ? { id: user.id, email: user.email || 'Cloud account' } : null);
    } catch {
      if (mounted.current && ticket === generation.current) {
        setHydrationFailed(true); setError(true);
        setMessage('Could not check your Cloud account. Try again or close this window to continue locally.');
      }
    } finally { if (mounted.current && ticket === generation.current) setHydrating(false); }
  }, []);
  const close = () => {
    if (confirmSwitch) { setConfirmSwitch(false); return; }
    if (admitted.current || getCloudOperation() || getGoogleAuthAttempt()?.phase === 'exchanging') return;
    if (!googleBusy && !getGoogleAuthAttempt()) { onClose(); return; }
    admitted.current = true;
    void cancelCloudGoogleSignIn().then(onClose).catch(() => { setError(true); setMessage('Could not cancel Google sign-in. Try closing this window again.'); }).finally(() => { admitted.current = false; });
  };
  useEffect(() => {
    if (!isOpen) return;
    mounted.current = true; setAccount(null); setConfirmSwitch(false);
    const release = holdCloudManagement(); void loadAccount();
    const subscription = isCloudSyncConfigured ? getSupabaseClient().auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      generation.current += 1; setHydrating(false); setHydrationFailed(false); setConfirmSwitch(false);
      setAccount(session ? { id: session.user.id, email: session.user.email || 'Cloud account' } : null);
    }).data.subscription : null;
    const recovery = (event: Event) => { if ((event as CustomEvent<{ recovery?: boolean }>).detail?.recovery) closeRef.current(); };
    window.addEventListener('caizen:cloud-auth', recovery);
    return () => { mounted.current = false; generation.current += 1; release(); subscription?.unsubscribe(); window.removeEventListener('caizen:cloud-auth', recovery); };
  }, [isOpen, loadAccount]);
  useEffect(() => {
    if (confirmSwitch || !bodyRef.current) return;
    if (document.activeElement === document.body) bodyRef.current.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
  }, [account, hydrating, hydrationFailed, confirmSwitch]);
  const work = async (action: () => Promise<void>) => {
    if (admitted.current || getCloudOperation() || getGoogleAuthAttempt()?.phase === 'exchanging') return;
    admitted.current = true; setBusy(true); setMessage(''); setError(false);
    try { await action(); } finally { admitted.current = false; if (mounted.current) setBusy(false); }
  };
  const finish = (email: string) => { onSignedIn?.(email); onClose(); if (postSignIn === 'cloud-settings') router.push('/app/?cloud=1'); };
  if (!isOpen) return null;
  return <>
    <CaizenFormDialog title="Cloud Backup" description={account ? undefined : 'Sign in to back up or restore. Local use needs no account.'} androidPresentation size="sm" panelClassName="cloud-backup-modal" bodyClassName="cloud-backup-body" onClose={close} closeDisabled={locked || getGoogleAuthAttempt()?.phase === 'exchanging'} onBeforeClose={() => {
      if (admitted.current || getCloudOperation() || getGoogleAuthAttempt()?.phase === 'exchanging') return false;
      if (confirmSwitch || googleBusy || getGoogleAuthAttempt()) { close(); return false; }
      return true;
    }}>
      <div ref={bodyRef} className="flex min-w-0 flex-col gap-5" aria-busy={locked || hydrating}>
        {!isCloudSyncConfigured ? <p className="text-body-sm">Cloud Backup is not configured in this version of Caizen. You can still use your local workspace.</p> : hydrating ? <p role="status" className="text-body-sm text-muted-foreground">Checking Cloud account…</p> : hydrationFailed ? <Button disabled={locked} variant="secondary" onClick={() => void loadAccount()}>Check account again</Button> : account ? <>
          <div><p className="text-label text-muted-foreground">Cloud account</p><p className="mt-1 break-all text-body font-semibold">{account.email}</p></div>
          <div className="cloud-actions">
          <Button disabled={locked} onClick={() => finish(account.email)} className="w-full">{postSignIn === 'continue' ? 'Continue to Caizen' : 'Open Cloud Backup'}</Button>
          <Button variant="ghost" disabled={locked} onClick={() => setConfirmSwitch(true)} className="w-full">Switch Cloud account</Button>
          </div>
        </> : <CloudAuthForm busy={locked} busyAction={sharedOperation ? 'cloud-operation' : authAction} returnIntent="landing" feedback={message ? { text: message, tone: error ? 'error' : 'success', action: authAction } : null} onGoogleBusyChange={value => { setGoogleBusy(value); if (value) { setMessage(''); setError(false); } }} onContinueLocally={close} onSubmit={async (mode, email, password) => {
          setAuthAction('submit');
          let success = false;
          const ticket = generation.current;
          await work(async () => {
            try {
              if (mode === 'sign-in') {
                const user = await signInToCloudSync(email, password);
                const activeUser = await getRestoredCloudUser();
                if (!mounted.current || !user || activeUser?.id !== user.id) return;
                finish(user.email || email);
              } else {
                const createdUser = await signUpForCloudSync(email, password);
                const activeUser = await getRestoredCloudUser();
                if (!mounted.current || (activeUser && activeUser.id !== createdUser?.id)) return;
                setMessage(cloudAccountCreatedMessage(Boolean(activeUser)));
              }
              success = true;
            } catch (caught) { if (mounted.current && ticket === generation.current) { setError(true); setMessage(cloudAuthError(caught, mode)); } }
          }); return success;
        }} onReset={email => {
          setAuthAction('password-reset');
          const ticket = generation.current;
          return work(async () => { try { await requestCloudPasswordReset(email); if (mounted.current && ticket === generation.current) setMessage(cloudPasswordResetMessage); } catch (caught) { if (mounted.current && ticket === generation.current) { setError(true); setMessage(cloudAuthError(caught, 'password-reset')); } } });
        }} />}
        {sharedOperation ? <p role="status" className="text-body-sm">Cloud Backup is working. Account changes are available when it finishes.</p> : null}
        {message && (account || hydrating || hydrationFailed || !isCloudSyncConfigured) ? <p role={error ? 'alert' : 'status'} className={error ? 'cloud-notice cloud-notice-error text-body-sm' : 'text-body-sm'}>{message}</p> : null}
      </div>
    </CaizenFormDialog>
    <ConfirmDialog isOpen={confirmSwitch} title="Switch Cloud account?" message={`Sign out of ${account?.email}? Profiles on this device stay unchanged. Automatic Backup pauses while you’re signed out.`} confirmText="Switch account" isDangerous={false} confirmDisabled={locked || getGoogleAuthAttempt()?.phase === 'exchanging'} onCancel={() => setConfirmSwitch(false)} onConfirm={async () => {
      const expectedId = account?.id; setConfirmSwitch(false);
      await work(async () => { try { if ((await getRestoredCloudUser())?.id !== expectedId) return; await signOutFromCloudSync(); if (mounted.current) setMessage('Choose a Cloud account to continue.'); } catch { if (mounted.current) { setError(true); setMessage('Sign-out could not finish. Your local workspace remains available.'); } } });
    }} />
  </>;
}
