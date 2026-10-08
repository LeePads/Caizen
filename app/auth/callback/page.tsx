'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Cloud, TriangleAlert } from 'lucide-react';
import CloudPasswordForm from '@/components/common/CloudPasswordForm';
import { completeCloudAuthCallback, type CloudCallbackResult } from '@/lib/cloud-auth-callback';
import { dismissGoogleAuthCompletion, finishGoogleAuth, getGoogleAuthAttempt, GOOGLE_RETRY_MESSAGE } from '@/lib/cloud-google-auth';
import { getSupabaseClient, isCloudSyncConfigured } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [result, setResult] = useState<CloudCallbackResult | null>(null);
  const [updated, setUpdated] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const callbackUrl = new URL(window.location.href);
    const google = callbackUrl.searchParams.get('intent') === 'google';
    const attemptId = callbackUrl.searchParams.get('attempt');
    // Never retain single-use codes or provider errors in copied URLs/history.
    const clean = new URL(callbackUrl.pathname, callbackUrl.origin);
    if (google && attemptId && /^[a-zA-Z0-9-]{16,80}$/.test(attemptId)) {
      clean.searchParams.set('intent', 'google');
      clean.searchParams.set('attempt', attemptId);
    }
    window.history.replaceState(null, document.title, clean.pathname + clean.search);
    void (async () => {
      let next: CloudCallbackResult;
      if (google && !callbackUrl.hash && callbackUrl.searchParams.getAll('intent').length === 1 &&
        callbackUrl.searchParams.getAll('attempt').length === 1 &&
        [...callbackUrl.searchParams.keys()].every(key => key === 'intent' || key === 'attempt')) {
        const attempt = getGoogleAuthAttempt();
        const session = isCloudSyncConfigured ? await getSupabaseClient().auth.getSession().catch(() => null) : null;
        next = attempt?.id === attemptId && attempt.phase === 'completed' && attempt.userId === session?.data.session?.user.id
          ? { kind: 'google', recovery: false, userId: attempt.userId, returnIntent: attempt.returnIntent }
          : { kind: 'google', recovery: false, error: GOOGLE_RETRY_MESSAGE };
        if (next.error && attempt?.id === attemptId) finishGoogleAuth(attempt.id, { error: next.error });
      } else next = await completeCloudAuthCallback(callbackUrl);
      setResult(next);
      if (next.kind === 'google' && !next.error) router.replace('/app/');
    })().catch(() => setResult({ kind: google ? 'google' : 'confirmation', recovery: false, error: 'Cloud sign-in did not finish. Please try again. You can continue locally.' }));
  }, [router]);

  const editing = Boolean(result?.recovery && result.userId && !result.error && !updated);
  const Icon = result?.error ? TriangleAlert : updated || (result && !editing) ? CheckCircle2 : Cloud;
  const title = !result ? 'Connecting Cloud' : result.error ? 'Link could not be confirmed' : editing ? 'Set a new Cloud password' : updated ? 'Password updated' : 'Cloud account confirmed';
  const message = !result ? 'Confirming your Cloud link…' : result.error || (editing ? 'Choose a new password for your Cloud account. Local profiles and records are unchanged.' : updated ? 'Your new password is ready to use.' : 'You can now continue to Caizen.');

  return <main className="grid min-h-dvh place-items-center bg-background p-5 text-foreground">
    <section aria-labelledby="cloud-callback-title" className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="space-y-3">
        <Icon className={`size-8 ${result?.error ? 'text-destructive' : 'text-primary'}`} aria-hidden="true" />
        <h1 id="cloud-callback-title" className="text-section-title">{title}</h1>
        <p role={result?.error ? 'alert' : 'status'} className="text-body-sm text-muted-foreground">{message}</p>
      </div>
      {editing && result?.userId ? <CloudPasswordForm userId={result.userId} onComplete={() => setUpdated(true)} onBusyChange={setBusy} /> : null}
      <Link href={result?.kind === 'google' ? '/app/?cloud=1' : '/app/'} aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); }} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-50">
        {editing ? 'Return without changing password' : 'Continue to Caizen'}
      </Link>
      {result?.error ? <p className="text-body-sm text-muted-foreground">Open Cloud Backup to start a new sign-in or request another recovery email. Local use does not require an account.</p> : null}
      {result?.kind === 'google' ? <Link href="/app/" onClick={dismissGoogleAuthCompletion} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-ring">Continue locally</Link> : null}
    </section>
  </main>;
}
