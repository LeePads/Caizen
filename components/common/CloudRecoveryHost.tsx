'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import CloudPasswordForm from './CloudPasswordForm';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import { Button } from '@/components/ui/button';
import { getNativeRecovery, getServerRecovery, setNativeRecovery, subscribeNativeRecovery, type CloudCallbackResult } from '@/lib/cloud-auth-callback';
import styles from './cloud-recovery.module.css';
import { getSupabaseClient, isCloudSyncConfigured } from '@/lib/supabase';

function RecoveryDialog({ result }: { result: CloudCallbackResult }) {
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = () => setNativeRecovery(null);
  return <CaizenFormDialog title={complete ? 'Password updated' : result.recovery ? 'Reset Cloud password' : 'Cloud link could not be confirmed'} androidPresentation size="sm" onClose={close} closeDisabled={busy} onBeforeClose={() => !busy} description={result.recovery ? 'This changes your Cloud password. Local profiles and records stay on this device.' : 'You can continue using your local profiles without Cloud.'}>
    <div className={styles.content}>
    {complete ? <div className="space-y-4"><p role="status" className="text-body-sm">Your new password is ready to use.</p><Button className="w-full" onClick={close}>Continue to Caizen</Button></div>
      : result.error || !result.userId ? <div className="space-y-4"><p role="alert" className="text-body-sm">{result.error || 'Request a new reset link from Cloud Backup.'}</p><Button onClick={close}>Return to Caizen</Button></div>
      : <CloudPasswordForm userId={result.userId} onComplete={() => setComplete(true)} onBusyChange={setBusy} />}
    </div>
  </CaizenFormDialog>;
}

export default function CloudRecoveryHost() {
  const result = useSyncExternalStore(subscribeNativeRecovery, getNativeRecovery, getServerRecovery);
  useEffect(() => {
    if (!result || !isCloudSyncConfigured) return;
    const { data } = getSupabaseClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (result.userId && session?.user.id !== result.userId)) setNativeRecovery(null);
    });
    return () => data.subscription.unsubscribe();
  }, [result]);
  return result && result.kind !== 'google' ? <RecoveryDialog key={result.userId || result.error} result={result} /> : null;
}
