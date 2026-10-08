import { getCloudAuthRedirectUrl, getSupabaseClient, isCloudSyncConfigured } from './supabase';
import { isNativeApp } from './platform';
import {
  finishGoogleAuth, getGoogleAuthAttempt, GOOGLE_RETRY_MESSAGE,
  markGoogleAuthExchanging, trackCloudAuthExchange,
  type CloudAuthReturnIntent,
} from './cloud-google-auth';

export type CloudCallbackResult = {
  kind: 'google' | 'confirmation' | 'recovery';
  recovery: boolean;
  userId?: string;
  error?: string;
  returnIntent?: CloudAuthReturnIntent;
  duplicate?: boolean;
};

const exchanges = new Map<string, Promise<CloudCallbackResult>>();
// Persist only a one-way callback fingerprint, never the authorization code.
// A started receipt prevents a second exchange after process death. Ambiguous
// interruptions require a fresh link rather than borrowing an existing session.
const RECEIPTS = 'caizen-cloud-callback-receipts-v1';
type Receipt = { fingerprint: string; expiresAt: number; result?: CloudCallbackResult };
const receiptStorage = () => isNativeApp() ? localStorage : sessionStorage;
function readReceipts(): Receipt[] {
  try {
    const raw = receiptStorage().getItem(RECEIPTS);
    if (!raw || raw.length > 12000) return [];
    const values: unknown = JSON.parse(raw);
    return Array.isArray(values) ? values.filter((entry): entry is Receipt =>
      entry && typeof entry.fingerprint === 'string' && entry.fingerprint.length === 64 &&
      Number.isFinite(entry.expiresAt) && entry.expiresAt > Date.now() &&
      entry.expiresAt <= Date.now() + 10 * 60 * 1000 &&
      (!entry.result || (['google', 'confirmation', 'recovery'].includes(entry.result.kind) &&
        typeof entry.result.recovery === 'boolean' && typeof entry.result.userId === 'string'))).slice(-8) : [];
  } catch { return []; }
}
function saveReceipt(receipt: Receipt) {
  receiptStorage().setItem(RECEIPTS, JSON.stringify([
    ...readReceipts().filter(entry => entry.fingerprint !== receipt.fingerprint).slice(-7), receipt,
  ]));
}

export function completeCloudAuthCallback(url: URL): Promise<CloudCallbackResult> {
  const google = url.searchParams.get('intent') === 'google' || url.searchParams.has('attempt');
  const kind = google ? 'google' as const : 'confirmation' as const;
  const failure = (error = google ? GOOGLE_RETRY_MESSAGE : 'This link could not be confirmed. Request a new Cloud link on this device and browser.'): CloudCallbackResult => ({ kind, recovery: false, error });
  const expected = getCloudAuthRedirectUrl();
  if (!expected) return Promise.resolve(failure());
  const destination = new URL(expected);
  if (url.protocol !== destination.protocol || url.host !== destination.host || url.username || url.password ||
    url.pathname.replace(/\/+$/, '') !== destination.pathname.replace(/\/+$/, '') || url.hash ||
    ['code', 'intent', 'attempt', 'sb_flow_id', 'flow_id', 'error', 'type'].some(key => url.searchParams.getAll(key).length > 1)) {
    return Promise.resolve(failure());
  }
  const code = url.searchParams.get('code');
  const flowId = url.searchParams.get('sb_flow_id');
  const legacyFlowId = url.searchParams.get('flow_id');
  if ((flowId && legacyFlowId && flowId !== legacyFlowId) || (legacyFlowId && !flowId)) return Promise.resolve(failure());
  if (!isCloudSyncConfigured) return Promise.resolve(failure('Cloud is not available in this build.'));
  const attemptId = url.searchParams.get('attempt');
  const key = `${code}:${flowId}:${attemptId}`;
  const existing = exchanges.get(key);
  if (existing) return existing.then(async result => {
    const { data } = await getSupabaseClient().auth.getSession();
    return result.userId && result.userId !== data.session?.user.id
      ? { ...failure(), duplicate: true } : { ...result, duplicate: true };
  }).catch(() => ({ ...failure(), duplicate: true }));
  const result = trackCloudAuthExchange(async (): Promise<CloudCallbackResult> => {
    const attempt = getGoogleAuthAttempt();
    if (google && (!attempt || attempt.id !== attemptId || !attempt.flowId || (flowId && flowId !== attempt.flowId))) return failure();
    if (google && attempt && ['completed', 'failed'].includes(attempt.phase)) return { ...failure(), duplicate: true };
    // An uncorrelated callback must not use the Google attempt's latest verifier.
    if (!google && attempt?.flowId && (!flowId || flowId === attempt.flowId)) return failure();
    const failGoogle = (message?: string) => {
      const failed = failure(message);
      if (google && attemptId) finishGoogleAuth(attemptId, { error: failed.error });
      return failed;
    };
    if (!code || code.length > 4096 || url.searchParams.has('error') || url.searchParams.has('error_code')) {
      const conflict = ['identity_already_exists', 'email_exists', 'user_already_exists', 'email_conflict_identity_not_deletable'].includes(url.searchParams.get('error_code') || '');
      return failGoogle(google && conflict
        ? "Google couldn't connect to this Cloud account. Use your existing sign-in method."
        : google && url.searchParams.get('error') === 'access_denied' ? 'Google sign-in was cancelled.' : undefined);
    }
    try {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
      const fingerprint = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
      const receipt = readReceipts().find(entry => entry.fingerprint === fingerprint);
      const supabase = getSupabaseClient();
      if (receipt) {
        const { data } = await supabase.auth.getSession();
        if (receipt.result?.userId && receipt.result.userId === data.session?.user.id) {
          if (google && attemptId) finishGoogleAuth(attemptId, receipt.result);
          return { ...receipt.result, duplicate: true };
        }
        return failGoogle();
      }
      if (google) {
        if (attempt?.phase === 'completed' || attempt?.phase === 'failed') return { ...failure(), duplicate: true };
        const { data, error } = await supabase.auth.getSession();
        if (error || data.session) return failGoogle('The Cloud account changed. Sign out before starting Google sign-in again.');
        if (!attemptId || !markGoogleAuthExchanging(attemptId)) return failGoogle();
      }
      saveReceipt({ fingerprint, expiresAt: Date.now() + 10 * 60 * 1000 });
      const selectedFlowId = google ? attempt?.flowId : flowId;
      const { data, error } = await supabase.auth.exchangeCodeForSession(code, selectedFlowId ? { flowId: selectedFlowId } : undefined);
      if (error || !data.session) {
        const conflict = error && ['identity_already_exists', 'email_exists', 'user_already_exists', 'email_conflict_identity_not_deletable'].includes(error.code ?? '');
        return failGoogle(conflict ? "Google couldn't connect to this Cloud account. Use your existing sign-in method." : undefined);
      }
      // redirectType is recovered by Supabase from its own PKCE verifier.
      // URL type=recovery is deliberately ignored.
      const recovery = 'redirectType' in data && data.redirectType === 'recovery';
      if (google && recovery) return failGoogle();
      if (google && getGoogleAuthAttempt()?.id !== attemptId) return { ...failure(), duplicate: true };
      const completed: CloudCallbackResult = { kind: recovery ? 'recovery' : kind, recovery,
        userId: data.session.user.id, returnIntent: google ? attempt?.returnIntent : undefined };
      saveReceipt({ fingerprint, expiresAt: Date.now() + 10 * 60 * 1000, result: completed });
      if (google && attemptId) finishGoogleAuth(attemptId, completed);
      return completed;
    } catch {
      return failGoogle('Cloud sign-in did not finish. Reconnect, then start again. You can continue locally.');
    }
  });
  if (exchanges.size >= 8) exchanges.delete(exchanges.keys().next().value!);
  exchanges.set(key, result);
  return result;
}

// This is transient presentation state, not a second auth/session store. It
// survives the native startup gate mounting after a cold-start callback.
let nativeRecovery: CloudCallbackResult | null = null;
const listeners = new Set<() => void>();
export const getNativeRecovery = () => nativeRecovery;
export const getServerRecovery = () => null;
export function subscribeNativeRecovery(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setNativeRecovery(result: CloudCallbackResult | null) {
  nativeRecovery = result;
  listeners.forEach(listener => listener());
}
