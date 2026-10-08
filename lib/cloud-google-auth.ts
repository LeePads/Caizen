import { getCloudAuthRedirectUrl, getSupabaseClient, isCloudSyncConfigured } from './supabase';
import { isNativeApp } from './platform';
import { workspaceIsProtected } from './storage/workspace-fence';
import { closeCloudAuthBrowser, openCloudAuthBrowser } from './native/open-link';

export type CloudAuthReturnIntent = 'landing' | 'cloud-backup' | 'onboarding';
type AttemptPhase = 'opening' | 'waiting' | 'exchanging' | 'completed' | 'failed';
type GoogleAttempt = {
  version: 1;
  epoch: string;
  id: string;
  createdAt: number;
  expiresAt: number;
  returnIntent: CloudAuthReturnIntent;
  flowId?: string;
  phase: AttemptPhase;
  userId?: string;
  message?: string;
  consumed?: boolean;
};

const KEY = 'caizen-cloud-google-attempt-v1';
const EPOCH_KEY = 'caizen-cloud-auth-epoch-v1';
const TTL = 10 * 60 * 1000;
export const GOOGLE_AUTH_EVENT = 'caizen:google-auth';
export const GOOGLE_RETRY_MESSAGE = 'This sign-in link expired or could not be confirmed. Start again.';
export const CLOUD_DEMO_MESSAGE = 'Return to your workspace to use Cloud Backup.';
const RETURN_MESSAGE = "Google sign-in wasn't completed.";
class GoogleSignInError extends Error {}
let opening = false;
let revision = 0;
const exchanges = new Set<Promise<unknown>>();
let cancelledAttemptId: string | undefined;
let browserCleanup: (() => void) | undefined;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;

const storage = () => isNativeApp() ? window.localStorage : window.sessionStorage;
const emit = () => window.dispatchEvent(new Event(GOOGLE_AUTH_EVENT));
const authEpoch = () => localStorage.getItem(EPOCH_KEY) || 'initial';

// Serialize session-changing work across tabs when Web Locks are available.
// The SDK still owns its session lock and all OAuth cryptography.
export function withCloudAuthLock<T>(work: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request('caizen-cloud-auth', work) : work();
}

export function getGoogleAuthAttempt(): GoogleAttempt | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = storage().getItem(KEY);
    if (!raw || raw.length > 2048) return null;
    const value = JSON.parse(raw) as GoogleAttempt;
    if (value.version !== 1 || value.epoch !== authEpoch() || value.id === cancelledAttemptId || !/^[a-zA-Z0-9-]{16,80}$/.test(value.id) ||
      !['landing', 'cloud-backup', 'onboarding'].includes(value.returnIntent) ||
      !['opening', 'waiting', 'exchanging', 'completed', 'failed'].includes(value.phase) ||
      !Number.isFinite(value.createdAt) || !Number.isFinite(value.expiresAt) ||
      value.createdAt > Date.now() || value.expiresAt <= Date.now() ||
      value.expiresAt - value.createdAt > TTL ||
      (value.flowId !== undefined && (typeof value.flowId !== 'string' || value.flowId.length > 128)) ||
      (value.userId !== undefined && typeof value.userId !== 'string') ||
      (value.message !== undefined && (typeof value.message !== 'string' || value.message.length > 300))) return null;
    return value;
  } catch { return null; }
}

function saveAttempt(attempt: GoogleAttempt) {
  storage().setItem(KEY, JSON.stringify(attempt));
  emit();
}

export function assertCloudAuthOutsideDemo() {
  if (workspaceIsProtected()) throw new GoogleSignInError(CLOUD_DEMO_MESSAGE);
}

export function googleAuthIsBusy() {
  const attempt = getGoogleAuthAttempt();
  return opening || attempt?.phase === 'exchanging' ||
    ((attempt?.phase === 'opening' || attempt?.phase === 'waiting') && !attempt.message);
}

// UI projection only: an incomplete browser return remains correlated for a
// late callback, but is no longer presented as a pending sign-in.
export function googleAuthIsPending() {
  const attempt = getGoogleAuthAttempt();
  return Boolean(attempt && (attempt.phase === 'exchanging' ||
    ((attempt.phase === 'opening' || attempt.phase === 'waiting') && !attempt.message)));
}

export function noteCloudAuthBrowserReturn() {
  clearTimeout(resumeTimer);
  const returnedAttemptId = getGoogleAuthAttempt()?.id;
  if (!returnedAttemptId) return;
  // Resume and appUrlOpen can race. Release presentation after a grace period,
  // but leave the attempt valid for a late callback until retry or expiry.
  resumeTimer = setTimeout(() => {
    const attempt = getGoogleAuthAttempt();
    if (attempt?.id !== returnedAttemptId) return;
    if (attempt?.phase === 'waiting') {
      try { saveAttempt({ ...attempt, message: RETURN_MESSAGE }); } catch { emit(); }
    } else if (attempt && !opening && exchanges.size === 0 && ['opening', 'exchanging'].includes(attempt.phase)) {
      finishGoogleAuth(attempt.id, { error: GOOGLE_RETRY_MESSAGE });
    }
  }, 1800);
}

export async function cancelCloudGoogleSignIn() {
  revision += 1;
  cancelledAttemptId = getGoogleAuthAttempt()?.id;
  // If durable cancellation cannot be saved, do not proceed into another auth
  // method/sign-out while a cold-start callback could still accept this attempt.
  storage().removeItem(KEY);
  localStorage.setItem(EPOCH_KEY, crypto.randomUUID());
  clearTimeout(resumeTimer);
  browserCleanup?.();
  browserCleanup = undefined;
  emit();
  // Sign-out/email auth waits for a previously accepted exchange before changing
  // the session, preventing its late result from undoing the user's choice.
  await Promise.allSettled([...exchanges]);
  await closeCloudAuthBrowser();
}

export function trackCloudAuthExchange<T>(work: () => Promise<T>): Promise<T> {
  const pending = withCloudAuthLock(work);
  exchanges.add(pending);
  void pending.finally(() => { exchanges.delete(pending); }).catch(() => undefined);
  return pending;
}

export function markGoogleAuthExchanging(id: string): GoogleAttempt | null {
  const attempt = getGoogleAuthAttempt();
  if (!attempt || attempt.id !== id || attempt.phase !== 'waiting' || !attempt.flowId) return null;
  saveAttempt({ ...attempt, phase: 'exchanging', message: undefined });
  return attempt;
}

export function finishGoogleAuth(id: string, result: { userId?: string; error?: string }) {
  const attempt = getGoogleAuthAttempt();
  if (!attempt || attempt.id !== id) return;
  const completed = { ...attempt, phase: result.error ? 'failed' as const : 'completed' as const,
    userId: result.userId, message: result.error || 'Signed in to Cloud Backup.', consumed: false };
  try { saveAttempt(completed); } catch { emit(); }
  clearTimeout(resumeTimer);
  browserCleanup?.();
  browserCleanup = undefined;
  void closeCloudAuthBrowser();
}

export function retainGoogleAuthError(message: string) {
  if (getGoogleAuthAttempt()) return;
  const now = Date.now();
  try {
    saveAttempt({ version: 1, epoch: authEpoch(), id: crypto.randomUUID(), createdAt: now, expiresAt: now + TTL,
      returnIntent: 'cloud-backup', phase: 'failed', message });
  } catch { /* No session or workspace mutation when auxiliary storage fails. */ }
}

// Presentation receipt only. Supabase's current session remains authoritative.
export async function consumeGoogleAuthCompletion(): Promise<GoogleAttempt | null> {
  const attempt = getGoogleAuthAttempt();
  if (!attempt || attempt.consumed || !['completed', 'failed'].includes(attempt.phase) || workspaceIsProtected()) return null;
  if (attempt.phase === 'completed') {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || data.session?.user.id !== attempt.userId) return null;
  }
  const current = getGoogleAuthAttempt();
  if (current?.id !== attempt.id || current.consumed || workspaceIsProtected()) return null;
  saveAttempt({ ...current, consumed: true });
  return attempt;
}

export function dismissGoogleAuthCompletion() {
  const attempt = getGoogleAuthAttempt();
  if (attempt && ['completed', 'failed'].includes(attempt.phase)) {
    try { saveAttempt({ ...attempt, consumed: true }); } catch { /* Local use stays available. */ }
  }
}

export async function startCloudGoogleSignIn(returnIntent: CloudAuthReturnIntent) {
  assertCloudAuthOutsideDemo();
  if (!isCloudSyncConfigured) throw new GoogleSignInError('Cloud is not available in this build.');
  if (!navigator.onLine) throw new GoogleSignInError('Cloud is unavailable right now. You can continue locally.');
  const previous = getGoogleAuthAttempt();
  if (opening || exchanges.size > 0 || (previous && ['opening', 'waiting', 'exchanging'].includes(previous.phase))) {
    throw new GoogleSignInError('Google sign-in is still in progress. Try again after returning to Caizen.');
  }
  opening = true;
  const generation = revision;
  let attempt: GoogleAttempt | undefined;
  try {
    const supabase = getSupabaseClient();
    const { data: restored, error: restoreError } = await supabase.auth.getSession();
    if (restoreError) throw new GoogleSignInError('Cloud is unavailable right now. You can continue locally.');
    if (restored.session) throw new GoogleSignInError('You are already signed in. Sign out of Cloud to switch accounts.');
    if (generation !== revision) return;
    assertCloudAuthOutsideDemo();
    const now = Date.now();
    attempt = { version: 1, epoch: authEpoch(), id: crypto.randomUUID(), createdAt: now, expiresAt: now + TTL, returnIntent, phase: 'opening' };
    // Fail before leaving Caizen if return correlation cannot be persisted.
    try { saveAttempt(attempt); } catch { throw new GoogleSignInError('Sign-in needs browser storage. Allow site storage, then try again.'); }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getCloudAuthRedirectUrl(attempt.id), skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' } },
    });
    if (generation !== revision || getGoogleAuthAttempt()?.id !== attempt.id) return;
    if (error || !data.url || !data.flowId) throw new GoogleSignInError('Google sign-in is unavailable right now. You can use email or continue locally.');
    assertCloudAuthOutsideDemo();
    const target = new URL(data.url);
    const authOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
    if (target.origin !== authOrigin || target.username || target.password ||
      (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname)))) {
      throw new GoogleSignInError('Google sign-in is unavailable right now. You can continue locally.');
    }
    attempt = { ...attempt, flowId: data.flowId, phase: 'waiting' };
    saveAttempt(attempt);
    if (isNativeApp()) {
      const browserAttemptId = attempt.id;
      try { browserCleanup = await openCloudAuthBrowser(target.href, () => {
        if (getGoogleAuthAttempt()?.id === browserAttemptId) noteCloudAuthBrowserReturn();
      }); }
      catch { throw new GoogleSignInError("Google sign-in couldn't open. Try again."); }
      if (generation !== revision) { browserCleanup?.(); browserCleanup = undefined; await closeCloudAuthBrowser(); }
    } else {
      window.location.assign(target.href);
    }
  } catch (error) {
    const message = error instanceof GoogleSignInError ? error.message : 'Google sign-in did not finish. Please try again.';
    if (attempt && generation === revision) finishGoogleAuth(attempt.id, { error: message });
    throw new GoogleSignInError(message);
  } finally { opening = false; emit(); }
}
