'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CloudGoogleSignInButton from './CloudGoogleSignInButton';
import type { CloudAuthReturnIntent } from '@/lib/cloud-google-auth';

export type CloudAuthMode = 'sign-in' | 'sign-up' | 'password-reset';
export type CloudAuthFeedback = { text: string; tone: 'success' | 'warning' | 'error'; action: 'submit' | 'password-reset' | 'google' };
export const cloudPasswordResetMessage = 'If this email has a Cloud account, you’ll receive a password reset link. Open the latest link in this browser on this device.';
export function cloudAccountCreatedMessage(signedIn: boolean) {
  return signedIn ? 'Cloud account created. You’re signed in.' : 'Check your email for an account confirmation link before signing in. If you already have a Cloud account, sign in instead.';
}
export function cloudAuthError(error: unknown, mode: CloudAuthMode) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid login')) return 'That email or password did not match. Check your details or reset your password.';
  if (message.includes('not confirmed')) return 'Open the confirmation link in your email, then sign in again.';
  if (message.includes('already registered')) return 'This email already has a Cloud account. Sign in instead.';
  if (message.includes('rate limit') || message.includes('too many')) return 'Too many attempts. Wait before trying again.';
  if (message.includes('demo') || message.includes('return to your workspace')) return 'Return to your workspace to use Cloud Backup.';
  return mode === 'password-reset' ? 'Could not request a password reset link. Check your connection and try again.' : mode === 'sign-up' ? 'Could not create a Cloud account. Check your connection and try again.' : 'Could not sign in. Check your email, password, and connection, then try again.';
}

export default function CloudAuthForm({ busy, busyAction = 'submit', returnIntent, onSubmit, onReset, onContinueLocally, onGoogleBusyChange, feedback }: {
  busy: boolean;
  busyAction?: CloudAuthFeedback['action'] | 'cloud-operation';
  returnIntent: CloudAuthReturnIntent;
  onSubmit: (mode: 'sign-in' | 'sign-up', email: string, password: string) => Promise<boolean>;
  onReset: (email: string) => Promise<void>;
  onContinueLocally: () => void;
  onGoogleBusyChange?: (busy: boolean) => void;
  feedback?: CloudAuthFeedback | null;
}) {
  const id = useId();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [validation, setValidation] = useState<{ field: 'email' | 'password'; text: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (validation) (validation.field === 'email' ? emailRef : passwordRef).current?.focus();
  }, [validation]);
  useEffect(() => {
    const notice = feedbackRef.current;
    if (!feedback?.text || !notice) return;
    const scroller = notice.closest('.cloud-backup-body');
    if (!scroller) return;
    const bounds = scroller.getBoundingClientRect(), messageBounds = notice.getBoundingClientRect();
    if (messageBounds.top < bounds.top || messageBounds.bottom > bounds.bottom) notice.scrollIntoView({ block: 'nearest' });
  }, [feedback?.text, feedback?.action]);
  const locked = busy || googleBusy;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const invalidEmail = () => {
    setEmailTouched(true);
    setValidation({ field: 'email', text: 'Enter a complete email address.' });
  };
  const notice = (action: CloudAuthFeedback['action']) => feedback?.action === action ? <p ref={feedbackRef} role={feedback.tone === 'error' ? 'alert' : 'status'} className={'text-body-sm ' + (feedback.tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{feedback.text}</p> : null;
  const submit = async () => {
    if (locked) return;
    setEmailTouched(true); setPasswordTouched(true);
    if (!validEmail) { invalidEmail(); return; }
    if (password.length < 6) { setValidation({ field: 'password', text: 'Use at least 6 characters.' }); return; }
    setValidation(null);
    if (await onSubmit(mode, email.trim(), password)) {
      setPassword('');
      setEmailTouched(false); setPasswordTouched(false);
      if (mode === 'sign-up') setMode('sign-in');
    }
  };
  return <div className="cloud-auth-form">
    <div className="grid gap-2">
    <CloudGoogleSignInButton returnIntent={returnIntent} disabled={busy} onBusyChange={value => { setGoogleBusy(value); onGoogleBusyChange?.(value); }} />
    {!googleBusy ? notice('google') : null}
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{validation?.text ?? ''}</p>
    <div className="flex items-center gap-3 text-body-sm text-muted-foreground" aria-hidden="true"><span className="h-px flex-1 bg-border" />or use email<span className="h-px flex-1 bg-border" /></div>
    <form noValidate aria-busy={locked} className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="cloud-auth-field">
      <label className="block" htmlFor={`${id}-email`}><span className="text-label">Email</span>
        <input ref={emailRef} id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} disabled={locked} onChange={event => { setEmail(event.target.value); setValidation(null); }} className="control-input mt-2" placeholder="you@example.com" aria-required="true" aria-invalid={emailTouched && !validEmail} aria-describedby={emailTouched && !validEmail ? `${id}-email-error` : undefined} />
      </label>
      {emailTouched && !validEmail ? <p id={`${id}-email-error`} className="text-body-sm text-destructive">Enter a complete email address.</p> : null}
      </div>
      <div className="cloud-auth-field"><label className="text-label" htmlFor={`${id}-password`}>Password</label>
        <div className="relative"><input ref={passwordRef} id={`${id}-password`} name="password" type={visible ? 'text' : 'password'} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} disabled={locked} onChange={event => { setPassword(event.target.value); setValidation(null); }} className="control-input pr-12" aria-required="true" aria-invalid={passwordTouched && password.length < 6} aria-describedby={passwordTouched && password.length < 6 ? `${id}-password-error` : mode === 'sign-up' ? `${id}-password-hint` : undefined} />
          <button type="button" disabled={locked} onPointerDown={event => event.preventDefault()} onClick={() => setVisible(value => !value)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} className="cloud-password-toggle cloud-touch-target absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50">{visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}</button>
        </div>
      {passwordTouched && password.length < 6 ? <p id={`${id}-password-error`} className="text-body-sm text-destructive">Use at least 6 characters.</p> : null}
      {mode === 'sign-up' && !(passwordTouched && password.length < 6) ? <p id={`${id}-password-hint`} className="text-body-sm text-muted-foreground">Use at least 6 characters.</p> : null}
      </div>
      <div className="grid gap-2">
      <Button type="submit" disabled={locked} className="w-full">{busy && busyAction === 'cloud-operation' ? 'Cloud Backup is busy…' : busy && busyAction === 'submit' ? mode === 'sign-in' ? 'Signing in…' : 'Creating account…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</Button>
      {notice('submit')}
      </div>
      <div className="cloud-auth-options">
        {mode === 'sign-in' ? <div className="grid min-w-0 gap-2"><Button type="button" variant="ghost" className="h-auto justify-start whitespace-normal px-0 text-left" disabled={locked} onClick={() => { if (validEmail) { setValidation(null); void onReset(email.trim()); } else invalidEmail(); }}>{busy && busyAction === 'password-reset' ? 'Requesting reset link…' : 'Forgot password?'}</Button>{notice('password-reset')}</div> : null}
        <Button type="button" variant="ghost" className="h-auto whitespace-normal px-0" disabled={locked} onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setEmailTouched(false); setPasswordTouched(false); setValidation(null); }}>{mode === 'sign-in' ? 'Create account' : 'Back to sign in'}</Button>
      </div>
    </form>
    <Button type="button" variant="ghost" disabled={busy} onClick={onContinueLocally} className="w-full">Continue locally</Button>
  </div>;
}
