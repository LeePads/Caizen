'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormPatterns';
import { getSupabaseClient } from '@/lib/supabase';
import { withCloudAuthLock } from '@/lib/cloud-google-auth';

export default function CloudPasswordForm({ userId, onComplete, onBusyChange }: { userId: string; onComplete: () => void; onBusyChange: (busy: boolean) => void }) {
  const id = useId();
  const submitting = useRef(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordError = submitted && password.length < 6 ? 'Use at least 6 characters.' : undefined;
  const confirmationError = submitted && confirmation !== password ? 'Passwords must match.' : undefined;

  return <form className="space-y-4 text-left" aria-busy={busy} onSubmit={async event => {
    event.preventDefault();
    if (submitting.current) return;
    setSubmitted(true);
    setError(null);
    if (password.length < 6 || confirmation !== password) return;
    submitting.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      const supabase = getSupabaseClient();
      // Keep the identity check and password change in the same lock used by
      // sign-in, sign-out, and callback exchange, including cooperating tabs.
      const updateError = await withCloudAuthLock(async () => {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || data.session?.user.id !== userId) {
          return 'Your recovery session has ended or the account changed. Request a new reset link from Cloud Backup.';
        }
        const { data: updated, error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) return passwordError.message;
        if (updated.user?.id !== userId) return 'The Cloud account changed. Request a new reset link before updating a password.';
        return null;
      });
      if (updateError) { setError(updateError); return; }
      setPassword('');
      setConfirmation('');
      onComplete();
    } catch {
      setError('Your password could not be updated. Check your connection and try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }}>
    <FormField label="New password" controlId={`${id}-password`} description="Use at least 6 characters. Your Cloud account may require a stronger password." error={passwordError} required>
      <Input id={`${id}-password`} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
    </FormField>
    <FormField label="Confirm new password" controlId={`${id}-confirmation`} error={confirmationError} required>
      <Input id={`${id}-confirmation`} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} />
    </FormField>
    <Button type="button" variant="ghost" aria-pressed={showPassword} disabled={busy} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide passwords' : 'Show passwords'}</Button>
    {error ? <p role="alert" className="text-body-sm break-words text-destructive">{error}</p> : null}
    <Button type="submit" disabled={busy} className="w-full">{busy ? 'Updating password…' : 'Update password'}</Button>
  </form>;
}
