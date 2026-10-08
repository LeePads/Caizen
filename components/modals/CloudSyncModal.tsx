'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, Check, ChevronDown, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import CloudAuthForm, { cloudAccountCreatedMessage, cloudAuthError, cloudPasswordResetMessage } from '@/components/common/CloudAuthForm';
import CloudBackupReview, { cloudReplaceBackupScope, cloudRestoreAction, cloudRestoreScope } from '@/components/common/CloudBackupReview';
import {
  backupLocalDataToCloud, clearReviewedCloudSnapshot, CLOUD_AUTO_BACKUP_STATUS_EVENT,
  deleteCloudProfileData, getCloudAutoBackupState, getCloudBackupOverview, getCloudSyncMarker, getPendingCloudMediaCount,
  getRestoredCloudUser, requestCloudPasswordReset, setCloudAutoBackupEnabled,
  signInToCloudSync, signOutFromCloudSync, signUpForCloudSync,
  type CloudBackupOverview, type CloudDeletionRetryTarget, type CloudProfileBackupSummary,
} from '@/lib/cloud-backup';
import {
  reviewCloudRecoveryCandidate, restoreReviewedCloudProfile, retryReviewedCloudMedia,
  recordCloudRecoveryReview, type CloudRecoveryCandidate, type CloudRecoveryReview,
} from '@/lib/cloud-recovery';
import { cloudAuthenticationNeedsRecovery, cloudBackupLabel, cloudBackupStatus, cloudFailureMessage, cloudProgressMessage, formatCloudDate } from '@/lib/cloud-backup-ui';
import { getCloudOperation, getServerCloudOperation, holdCloudManagement, subscribeCloudOperation } from '@/lib/cloud-operation';
import { cancelCloudGoogleSignIn, getGoogleAuthAttempt, type CloudAuthReturnIntent } from '@/lib/cloud-google-auth';
import { isCloudSyncConfigured, getSupabaseClient } from '@/lib/supabase';
import { isDemoModeActive } from '@/lib/demo/demo-workspace';
import type { CloudRestoreHandoff } from '@/lib/types';

type Props = {
  isOpen: boolean; currentProfileId?: string; onClose: () => void;
  localProfiles?: readonly { id: string; name: string }[];
  demoBlocked?: boolean; onReturnToWorkspace: () => void;
  onBeforeBackup: () => Promise<void>;
  onBeforeRestore: () => Promise<CloudRestoreHandoff>;
  onBackupSuccess?: () => void; onRestoreCommitted?: () => void;
  authReturnIntent?: CloudAuthReturnIntent; authMessage?: string;
};
type Feedback = { tone: 'success' | 'warning' | 'error'; text: string; detail?: string; diagnostics?: string[] };
type Retry = { kind: 'backup'; userId: string; profileId: string } | { kind: 'files'; review: CloudRecoveryReview } | {
  kind: 'delete'; backup: CloudProfileBackupSummary; initiatingProfileId: string; targets: CloudDeletionRetryTarget[];
};
type Confirmation = { title: string; message: string; confirmText: string; dangerous?: boolean; run: () => Promise<void> };
const diagnostics = (items: Array<{ originalName: string | null; message: string }>) => items.map(item => `${item.originalName || 'File'}: ${item.message.replace(/\b(?:[^/\s]+\/){3}\S+/g, '[storage path]').slice(0, 240)}`);

export default function CloudSyncModal({ isOpen, currentProfileId, localProfiles = [], demoBlocked = false, onReturnToWorkspace, onClose, onBeforeBackup, onBeforeRestore, onBackupSuccess, onRestoreCommitted, authReturnIntent = 'cloud-backup', authMessage = '' }: Props) {
  const blockedByDemo = demoBlocked || isDemoModeActive();
  const [account, setAccount] = useState<{ id: string; email: string } | null>(null);
  const [overview, setOverview] = useState<CloudBackupOverview | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [reauthRequired, setReauthRequired] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [operation, setOperation] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [authAction, setAuthAction] = useState<'submit' | 'password-reset' | 'google'>('google');
  const [review, setReview] = useState<CloudRecoveryReview | null>(null);
  const [retry, setRetry] = useState<Retry | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [restoreCommitted, setRestoreCommitted] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<number | null>(null);
  const [, setPreferenceRevision] = useState(0);
  const sharedOperation = useSyncExternalStore(subscribeCloudOperation, getCloudOperation, getServerCloudOperation);
  const activeProfile = useRef(currentProfileId); activeProfile.current = currentProfileId;
  const generation = useRef(0);
  const admitted = useRef(false);
  const alive = useRef(false);
  const closeRequest = useRef<() => void>(() => undefined);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reloadRef = useRef(false); reloadRef.current = reloadRequired;
  const pendingRead = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const deferredRead = useRef(false);
  const busy = Boolean(operation || sharedOperation || refreshing || googleBusy);
  const current = overview?.currentProfile ?? null;
  const matching = overview?.matchingBackup ?? null;
  const scope = account && current ? { userId: account.id, profileId: current.id } : null;
  const automatic = scope ? getCloudAutoBackupState(scope) : null;
  const status = overview ? cloudBackupStatus(overview, phase === 'ready' ? pendingFiles : null, phase === 'ready' && scope ? getCloudSyncMarker(scope.userId, scope.profileId) : null) : null;

  useEffect(() => {
    if (!review || !overview || admitted.current || reloadRef.current) return;
    const target = overview.backups.find(item => item.id === review.backupId);
    if (!target || target.updatedAt !== review.expectedUpdatedAt || target.schemaVersion !== review.schemaVersion ||
      (review.profileId === overview.currentProfile?.id && overview.currentProfile.localModifiedAt !== review.expectedLocalModifiedAt)) {
      setReview(null); setConfirmation(null); clearReviewedCloudSnapshot();
      setFeedback({ tone: 'warning', text: 'The device or backup changed. Review it again before choosing a version.' });
    }
  }, [overview, review]);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || confirmation) return;
    const focused = document.activeElement;
    if (focused === document.body || (focused instanceof HTMLElement && body.contains(focused) && focused.matches(':disabled'))) {
      body.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
    }
  }, [account, review, reloadRequired, phase, confirmation]);

  const refresh = useCallback((): Promise<void> => {
    if (reloadRef.current) return Promise.resolve();
    if (getCloudOperation()) { deferredRead.current = true; return Promise.resolve(); }
    if (pendingRead.current?.generation === generation.current) return pendingRead.current.promise;
    deferredRead.current = false;
    const ticket = generation.current;
    const profileId = currentProfileId;
    setRefreshing(true);
    const valid = () => alive.current && ticket === generation.current && activeProfile.current === profileId;
    const promise = (async () => {
      try {
        if (!isCloudSyncConfigured || blockedByDemo || isDemoModeActive()) { if (valid()) setPhase('ready'); return; }
        const user = await getRestoredCloudUser();
        if (!valid()) return;
        if (!user) { setAccount(null); setOverview(null); setPhase('ready'); setReauthRequired(false); return; }
        setAccount({ id: user.id, email: user.email || 'Cloud account' });
        const next = await getCloudBackupOverview({ includeMediaTotals: false });
        const files = next.currentProfile ? await getPendingCloudMediaCount(next.currentProfile.id).catch(() => null) : null;
        const verifiedUser = await getRestoredCloudUser();
        if (!valid() || verifiedUser?.id !== user.id) return;
        if (profileId && next.currentProfile?.id !== profileId) throw new Error('The local profile changed.');
        setOverview(next); setPendingFiles(files); setPhase('ready'); setReauthRequired(false);
      } catch (error) {
        if (!valid()) return;
        setPhase('failed');
        setReauthRequired(cloudAuthenticationNeedsRecovery(error));
        setFeedback({ tone: 'error', text: cloudAuthenticationNeedsRecovery(error) ? 'Sign in again to continue using Cloud Backup.' : 'Could not load backup status.', detail: 'Refresh backup status or continue using your local workspace.', diagnostics: [error instanceof Error ? error.message : 'Status unavailable'] });
      } finally { if (valid()) setRefreshing(false); }
    })();
    const read = { generation: ticket, promise }; pendingRead.current = read;
    void promise.finally(() => { if (pendingRead.current === read) pendingRead.current = null; });
    return promise;
  }, [currentProfileId, blockedByDemo]);

  useEffect(() => {
    if (isOpen && !reloadRef.current && !operation && !sharedOperation && deferredRead.current) void refresh();
  }, [isOpen, operation, sharedOperation, refresh]);

  useEffect(() => {
    if (!isOpen) return;
    alive.current = true; generation.current += 1;
    setAccount(null); setOverview(null); setReview(null); setRetry(null); setConfirmation(null); setMenuId(null); setPhase('loading'); setFeedback(null);
    const release = holdCloudManagement(); void refresh();
    return () => { alive.current = false; generation.current += 1; release(); clearReviewedCloudSnapshot(); if (reloadRef.current) window.location.reload(); };
  }, [isOpen, refresh]);
  useEffect(() => {
    // The shared Google button owns attempt feedback, including retries.
    if (isOpen && authMessage && !authMessage.startsWith('Signed in') && !getGoogleAuthAttempt()) {
      setAuthAction('google');
      setFeedback({ tone: 'warning', text: authMessage });
    }
  }, [authMessage, isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const handler = () => closeRequest.current();
    window.addEventListener('caizen:cloud-close-request', handler);
    return () => window.removeEventListener('caizen:cloud-close-request', handler);
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen || !isCloudSyncConfigured || blockedByDemo) return;
    let userId: string | null | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const queueRead = () => {
      if (reloadRef.current) return;
      if (admitted.current || getCloudOperation()) { deferredRead.current = true; return; }
      clearTimeout(timer); timer = setTimeout(() => { void refresh(); }, 150);
    };
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; profileId: string }>).detail;
      if (detail?.userId === userId && detail.profileId === activeProfile.current) queueRead();
    };
    const subscription = getSupabaseClient().auth.onAuthStateChange((event, session) => {
      const nextId = session?.user.id ?? null;
      if (event === 'INITIAL_SESSION') { userId = nextId; return; }
      if (nextId === userId) return;
      userId = nextId; generation.current += 1;
      setAccount(null); setOverview(null); setReview(null); setConfirmation(null); setMenuId(null); setRetry(null); setFeedback(null);
      clearReviewedCloudSnapshot(); setPhase('loading');
      clearTimeout(timer); timer = setTimeout(() => { void refresh(); }, 0);
    }).data.subscription;
    const autoEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ profileId?: string; userId?: string; recorded?: boolean }>).detail;
      if (detail?.profileId !== activeProfile.current || (detail.userId && userId && detail.userId !== userId)) return;
      setPreferenceRevision(value => value + 1); if (detail.recorded) queueRead();
    };
    window.addEventListener(CLOUD_AUTO_BACKUP_STATUS_EVENT, autoEvent);
    window.addEventListener('caizen:cloud-backup-changed', changed);
    window.addEventListener('caizen:local-save-complete', queueRead); window.addEventListener('online', queueRead);
    return () => { subscription.unsubscribe(); clearTimeout(timer); window.removeEventListener(CLOUD_AUTO_BACKUP_STATUS_EVENT, autoEvent); window.removeEventListener('caizen:cloud-backup-changed', changed); window.removeEventListener('caizen:local-save-complete', queueRead); window.removeEventListener('online', queueRead); };
  }, [isOpen, refresh, blockedByDemo]);

  const isCurrent = async (ticket: number, userId: string, profileId: string | undefined) => {
    const user = await getRestoredCloudUser().catch(() => null);
    return alive.current && ticket === generation.current && activeProfile.current === profileId && user?.id === userId;
  };
  const run = async (label: string, action: (progress: (text: string) => void) => Promise<void>, preservedRetry?: Retry) => {
    if (blockedByDemo || isDemoModeActive() || admitted.current || getCloudOperation() || refreshing || getGoogleAuthAttempt()?.phase === 'exchanging') return;
    admitted.current = true; const ticket = generation.current;
    setOperation(label); setFeedback(null); setRetry(null);
    try { await action(text => { if (alive.current && ticket === generation.current) setOperation(text); }); }
    catch (error) {
      if (alive.current && ticket === generation.current) {
        if (preservedRetry) setRetry(preservedRetry);
        setFeedback({ tone: 'error', text: cloudFailureMessage(error, label), detail: reloadRef.current ? 'Load the restored profile when you are ready. Unfinished files can be retried.' : 'Your local workspace remains available.', diagnostics: [error instanceof Error ? error.message : label] });
        if (/review/i.test(label) && !reloadRef.current) {
          setReview(null); clearReviewedCloudSnapshot(); await refresh();
        }
      }
    }
    finally { admitted.current = false; if (alive.current) setOperation(null); }
  };
  const backUp = async (force = false, reviewed = review) => {
    if (!account || !current) return;
    const userId = account.id, profileId = current.id, ticket = generation.current;
    const target = force && reviewed ? { id: reviewed.backupId, updatedAt: reviewed.expectedUpdatedAt } : matching;
    await run('Preparing backup…', async progress => {
      await onBeforeBackup(); if (!await isCurrent(ticket, userId, profileId)) return;
      try {
        const result = await backupLocalDataToCloud({ mode: 'manual', force, expectedUserId: userId, expectedProfileId: profileId, expectedBackupId: target?.id, expectedUpdatedAt: target?.updatedAt ?? null, expectedFingerprint: force ? reviewed?.expectedFingerprint : undefined, expectedLocalModifiedAt: force ? reviewed?.expectedLocalModifiedAt : undefined, onProgress: event => progress(cloudProgressMessage(event)) });
        if (!await isCurrent(ticket, userId, profileId)) return;
        setFeedback({ tone: result.status === 'partial' ? 'warning' : 'success', text: result.status === 'partial' ? 'Profile backed up. Some files could not be backed up.' : 'Backup complete.', detail: 'Changes saved while this backup was running may need another backup.', diagnostics: diagnostics(result.failedMedia) });
        if (result.status === 'partial') setRetry({ kind: 'backup', userId, profileId });
        setReview(null); clearReviewedCloudSnapshot(); onBackupSuccess?.(); await refresh();
      } catch (error) {
        if (await isCurrent(ticket, userId, profileId)) {
          setRetry({ kind: 'backup', userId, profileId });
          if (force) { setReview(null); clearReviewedCloudSnapshot(); }
        }
        throw error;
      }
    });
  };
  const reviewBackup = async (backup: CloudProfileBackupSummary) => {
    const ticket = generation.current, profileId = currentProfileId;
    await run('Reviewing backup…', async () => {
      await onBeforeBackup(); if (!await isCurrent(ticket, backup.userId, profileId)) return;
      const candidate: CloudRecoveryCandidate = { backup: { ...backup, createdAt: backup.updatedAt }, classification: backup.profileId === profileId ? 'matching-no-baseline' : 'cloud-only-profile', prompt: 'none', isCurrentProfile: backup.profileId === profileId, localUpdatedAt: null, cloudUpdatedAt: backup.updatedAt, media: { count: 0, bytes: 0 } };
      const next = await reviewCloudRecoveryCandidate(candidate);
      if (!await isCurrent(ticket, backup.userId, profileId)) { clearReviewedCloudSnapshot(); return; }
      setReview(next);
      setOverview(previous => previous ? {
        ...previous,
        backups: previous.backups.map(item => item.id === next.backupId ? { ...item, profileName: next.profileName, profileNameSource: 'reviewed' } : item),
        otherBackups: previous.otherBackups.map(item => item.id === next.backupId ? { ...item, profileName: next.profileName, profileNameSource: 'reviewed' } : item),
      } : previous);
      await recordCloudRecoveryReview(next, 'reviewed').catch(() => undefined);
    });
  };
  const restore = async (target: CloudRecoveryReview) => {
    const ticket = generation.current, profileId = currentProfileId;
    await run('Preparing restore…', async progress => {
      if (!await isCurrent(ticket, target.userId, profileId)) return;
      const handoff = await onBeforeRestore();
      try {
        const result = await restoreReviewedCloudProfile(target, {
          assertBeforeReplace: () => {
            handoff.assertBeforeReplace();
            if (!alive.current || ticket !== generation.current || activeProfile.current !== profileId) throw new Error('The local profile or Cloud account changed during restore. Review again.');
          },
          beforeReplace: async () => {
            await handoff.beforeReplace();
            if (!alive.current || ticket !== generation.current || activeProfile.current !== profileId) throw new Error('The local profile or Cloud account changed during restore. Review again.');
          },
          onProgress: event => progress(event.message.replace(/snapshot/gi, 'backup')),
        });
        reloadRef.current = true; setReloadRequired(true); setRestoreCommitted(true); onRestoreCommitted?.();
        if (!alive.current) { window.location.reload(); return; }
        setFeedback({ tone: result.status === 'partial' ? 'warning' : 'success', text: `“${target.profileName}” restored.`, detail: result.status === 'partial' ? 'Some files could not be restored. Choose Retry files or load the profile now.' : 'Load the restored profile to continue. Photos and attachments download from Cloud when opened.', diagnostics: diagnostics(result.failedMedia) });
        if (result.status === 'partial' && await isCurrent(ticket, target.userId, profileId)) setRetry({ kind: 'files', review: target });
      } catch (error) {
        const safe = await handoff.resumeAfterFailure().catch(() => false);
        if (!safe) { reloadRef.current = true; setReloadRequired(true); }
        if (alive.current) setFeedback({ tone: 'error', text: cloudFailureMessage(error, 'Restore'), detail: safe ? 'Your previous workspace was checked and is still available. Review the backup again before retrying.' : 'Reload Caizen and check your local data. The recovery copy on this device is available in Backup & Restore.', diagnostics: [error instanceof Error ? error.message : 'Restore failed'] });
        setReview(null); clearReviewedCloudSnapshot();
      }
    });
  };
  const removeBackup = async (backup: CloudProfileBackupSummary, initiatingProfileId: string, targets: CloudDeletionRetryTarget[] = []) => {
    const ticket = generation.current;
    await run('Deleting Cloud backup…', async () => {
      if (!await isCurrent(ticket, backup.userId, initiatingProfileId)) return;
      const result = await deleteCloudProfileData(backup.profileId, targets, { expectedUserId: backup.userId, expectedBackupId: backup.id, expectedUpdatedAt: backup.updatedAt, expectedCurrentProfileId: initiatingProfileId });
      if (!await isCurrent(ticket, backup.userId, initiatingProfileId)) return;
      if (result.remainingTargets.length) setRetry({ kind: 'delete', backup, initiatingProfileId, targets: result.remainingTargets });
      let next: CloudBackupOverview;
      try { next = await getCloudBackupOverview({ includeMediaTotals: false }); }
      catch (error) {
        if (await isCurrent(ticket, backup.userId, initiatingProfileId)) {
          setPhase('failed'); setReview(null); clearReviewedCloudSnapshot();
          setFeedback({ tone: 'warning', text: result.status === 'success' ? 'Cloud backup deleted.' : 'Cloud deletion needs attention.', detail: 'Status could not refresh. Local profiles and device data were not changed.', diagnostics: [...diagnostics(result.failedMedia), error instanceof Error ? error.message : 'Status unavailable'] });
        }
        return;
      }
      if (!await isCurrent(ticket, backup.userId, initiatingProfileId)) return;
      const latest = next.backups.find(item => item.profileId === backup.profileId);
      const changed = latest && (latest.id !== backup.id || latest.updatedAt !== backup.updatedAt);
      if (changed) setRetry(null);
      setFeedback({ tone: result.status === 'partial' || changed ? 'warning' : 'success', text: changed ? 'A new Cloud backup exists. Review it before deleting.' : result.status === 'partial' ? !latest ? 'Backup removed; some Cloud files still need cleanup.' : 'Cloud deletion could not finish.' : 'Cloud backup deleted.', detail: 'Local profiles and device data were not changed.', diagnostics: diagnostics(result.failedMedia) });
      setOverview(next); setReview(null); clearReviewedCloudSnapshot();
    }, targets.length ? { kind: 'delete', backup, initiatingProfileId, targets } : undefined);
  };
  const confirmDelete = (backup: CloudProfileBackupSummary, label: string) => {
    if (!current) return;
    const initiatingProfileId = current.id;
    setConfirmation({ title: 'Delete Cloud backup?', message: `Delete ${label}, backed up ${formatCloudDate(backup.updatedAt)}, from ${account?.email}? Its associated Cloud files will be removed. Local profiles stay unchanged. This cannot be undone.`, confirmText: 'Delete Cloud backup', dangerous: true, run: () => removeBackup(backup, initiatingProfileId) });
  };
  const signOut = async () => {
    if (!account) return;
    const ticket = generation.current;
    await run('Signing out of Cloud…', async () => {
      if (reauthRequired) {
        if (!alive.current || ticket !== generation.current || activeProfile.current !== currentProfileId) return;
      } else if (!await isCurrent(ticket, account.id, currentProfileId)) return;
      let failure: unknown;
      try { await signOutFromCloudSync(); } catch (error) { failure = error; }
      await refresh();
      const user = await getRestoredCloudUser().catch(() => undefined);
      if (!alive.current || activeProfile.current !== currentProfileId) return;
      if (user === null) setFeedback({ tone: failure ? 'warning' : 'success', text: 'Signed out of Cloud. Your local workspace remains available.', detail: failure ? 'Some Cloud cache cleanup needs attention.' : undefined, diagnostics: failure ? [failure instanceof Error ? failure.message : 'Cleanup unavailable'] : undefined });
      else if (failure && ticket === generation.current) throw failure;
    });
  };
  const requestClose = () => {
    if (confirmation) { setConfirmation(null); return; }
    if (menuId) { setMenuId(null); return; }
    if (admitted.current || getCloudOperation() || getGoogleAuthAttempt()?.phase === 'exchanging') return;
    if (reloadRef.current) { window.location.reload(); return; }
    if (!googleBusy && !getGoogleAuthAttempt()) { onClose(); return; }
    admitted.current = true;
    void cancelCloudGoogleSignIn().then(onClose).catch(() => setFeedback({ tone: 'error', text: 'Could not cancel Google sign-in. Try closing this window again.' })).finally(() => { admitted.current = false; });
  };
  closeRequest.current = requestClose;
  const retryAction = async () => {
    if (!retry) return;
    if (retry.kind === 'backup') {
      if (account?.id !== retry.userId || current?.id !== retry.profileId) return;
      if (status?.needsReview && matching) await reviewBackup(matching); else await backUp();
    } else if (retry.kind === 'delete') await removeBackup(retry.backup, retry.initiatingProfileId, retry.targets);
    else {
      const target = retry.review, ticket = generation.current;
      await run('Restoring files…', async progress => {
        if (!await isCurrent(ticket, target.userId, currentProfileId)) return;
        const result = await retryReviewedCloudMedia(target, { onProgress: event => progress(event.message) });
        if (!await isCurrent(ticket, target.userId, currentProfileId)) return;
        setFeedback({ tone: result.failedMedia.length ? 'warning' : 'success', text: result.failedMedia.length ? 'Some files could not be restored. Retry files.' : 'Files restored.', diagnostics: diagnostics(result.failedMedia) });
        if (result.failedMedia.length) setRetry({ kind: 'files', review: target });
      }, { kind: 'files', review: target });
    }
  };

  if (!isOpen) return null;
  const otherBackups = [...(overview?.otherBackups ?? [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  const canAct = !blockedByDemo && !busy && phase === 'ready' && Boolean(current) && !reloadRequired;
  const automaticPaused = automatic?.enabled && (automatic.pausedReason || !automatic.eligible || !matching || status?.needsReview || phase !== 'ready');
  const automaticCopy = automatic?.legacyEnabled
    ? 'Choose Back up now once before enabling Automatic Backup.'
    : automaticPaused
      ? !matching ? 'Create a Cloud backup for this profile to continue.'
        : automatic?.pausedReason?.startsWith('offline:') ? 'Waiting for a connection.'
        : automatic?.pausedReason?.startsWith('media:') ? 'Some files need attention. Review this backup before resuming Automatic Backup.'
        : 'Review the backup or refresh its status to resume Automatic Backup.'
      : automatic?.enabled ? 'Backs up saved changes while Caizen is in use.'
        : !automatic?.eligible || !matching ? 'Choose Back up now once before enabling Automatic Backup.'
        : status?.needsReview ? 'Review this backup before enabling it.'
        : 'Nothing is uploaded automatically.';
  const footer = blockedByDemo ? undefined : reloadRequired ? (
    <div className="cloud-actions">
      <Button disabled={busy} onClick={() => window.location.reload()}>{operation || (restoreCommitted ? 'Load restored profile' : 'Reload Caizen')}</Button>
      {retry?.kind === 'files' ? <Button variant="ghost" disabled={busy} onClick={() => void retryAction()}>Retry files</Button> : null}
    </div>
  ) : review ? (
    <div className="cloud-actions">
      <Button disabled={!canAct} onClick={() => review.restoreType === 'replace-matching-profile' ? setConfirmation({ title: 'Replace profile on this device?', message: cloudRestoreScope(review), confirmText: cloudRestoreAction(review), dangerous: true, run: () => restore(review) }) : void restore(review)}>
        {operation || (sharedOperation ? 'Cloud Backup is busy…' : cloudRestoreAction(review))}
      </Button>
      {review.profileId === current?.id ? <Button variant="ghost" disabled={!canAct} onClick={() => setConfirmation({ title: 'Replace Cloud backup?', message: cloudReplaceBackupScope(review, account?.email), confirmText: 'Replace Cloud backup', run: () => backUp(true, review) })}>Replace Cloud backup</Button> : null}
      <Button variant="ghost" disabled={busy} onClick={() => { setReview(null); clearReviewedCloudSnapshot(); }}>Back to backup status</Button>
    </div>
  ) : account && overview ? (
    <div className={'cloud-actions' + (status?.primaryAction === 'none' ? ' cloud-actions-current' : '')}>
      {status?.primaryAction === 'none' ? (
        <Button variant="ghost" disabled={!canAct} onClick={() => matching && void reviewBackup(matching)}>Review backup</Button>
      ) : <>
        <Button disabled={!canAct} onClick={() => status?.primaryAction === 'review' && matching ? void reviewBackup(matching) : void backUp()}>{operation || (sharedOperation ? 'Cloud Backup is busy…' : status?.primaryAction === 'review' ? 'Review backup' : 'Back up now')}</Button>
        {matching && !status?.needsReview ? <Button variant="ghost" disabled={!canAct} onClick={() => void reviewBackup(matching)}>Review backup</Button> : null}
      </>}
    </div>
  ) : undefined;

  return <>
    <CaizenFormDialog
      title={review && !reloadRequired ? 'Review Cloud backup' : 'Cloud Backup'}
      description={blockedByDemo ? undefined : review && !reloadRequired ? 'Reviewing leaves data on this device unchanged.' : account ? 'Backup for the current profile.' : 'Sign in to back up or restore. Local use needs no account.'}
      onClose={requestClose}
      closeDisabled={Boolean(operation || sharedOperation || getGoogleAuthAttempt()?.phase === 'exchanging')}
      onBeforeClose={() => {
        if (admitted.current || getCloudOperation() || getGoogleAuthAttempt()?.phase === 'exchanging') return false;
        if (confirmation || menuId || googleBusy || getGoogleAuthAttempt()) { requestClose(); return false; }
        return true;
      }}
      androidPresentation size="md" panelClassName="cloud-backup-modal" bodyClassName="cloud-backup-body" footer={footer}
    >
      <div ref={bodyRef} aria-busy={busy} className="flex min-w-0 flex-col gap-6">
        {blockedByDemo ? <div role="alert" className="cloud-demo-blocked">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <h3 className="text-card-title">Cloud Backup is blocked in Demo Mode</h3>
              <p className="text-body-sm mt-2">Demo data cannot be uploaded to Cloud. Return to your workspace to sign in, back up, or restore your own profiles.</p>
            </div>
          </div>
          <Button className="mt-4 w-full" onClick={onReturnToWorkspace}>Return to workspace</Button>
        </div> : !isCloudSyncConfigured ? (
          <p className="text-body-sm">Cloud Backup is not configured in this version of Caizen. You can still use your local workspace.</p>
        ) : <>
          {phase === 'loading' && !overview ? (
            <div className="space-y-4 py-4" role="status" aria-label="Checking Cloud Backup">
              <Skeleton className="h-5 w-3/4" /><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-2/3" />
              <span className="sr-only">Checking Cloud Backup…</span>
            </div>
          ) : null}
          {account ? (
            <div className="cloud-account-row">
              <div className="min-w-0"><p className="text-label text-muted-foreground">Cloud account</p><p className="text-body mt-1 break-all font-semibold">{account.email}</p></div>
              <Button variant="ghost" disabled={busy || reloadRequired} onClick={() => setConfirmation({ title: 'Switch Cloud account?', message: `Sign out of ${account.email}? Profiles on this device stay unchanged. Automatic Backup pauses while you’re signed out.`, confirmText: 'Switch account', run: signOut })}>Switch account</Button>
            </div>
          ) : null}
          {phase === 'ready' && !account ? (
            <CloudAuthForm busy={Boolean(operation)} busyAction={authAction} returnIntent={authReturnIntent} feedback={feedback ? { text: feedback.text, tone: feedback.tone, action: authAction } : null} onGoogleBusyChange={value => { setGoogleBusy(value); if (value) setFeedback(null); }} onContinueLocally={requestClose} onSubmit={async (mode, email, password) => {
              setAuthAction('submit');
              let success = false;
              const ticket = generation.current, profileId = currentProfileId;
              await run(mode === 'sign-in' ? 'Signing in…' : 'Creating account…', async () => {
                try {
                  if (mode === 'sign-in') {
                    const user = await signInToCloudSync(email, password);
                    const activeUser = await getRestoredCloudUser();
                    if (!alive.current || !user || activeProfile.current !== profileId || activeUser?.id !== user.id) return;
                    await refresh();
                  } else {
                    const createdUser = await signUpForCloudSync(email, password);
                    const activeUser = await getRestoredCloudUser();
                    if (!alive.current || activeProfile.current !== profileId) return;
                    if (activeUser && activeUser.id !== createdUser?.id) return;
                    await refresh();
                    if (alive.current && activeProfile.current === profileId) setFeedback({ tone: 'success', text: cloudAccountCreatedMessage(Boolean(activeUser)) });
                  }
                  success = true;
                } catch (error) {
                  if (alive.current && ticket === generation.current) setFeedback({ tone: 'error', text: cloudAuthError(error, mode) });
                }
              });
              return success;
            }} onReset={email => {
              setAuthAction('password-reset');
              const ticket = generation.current;
              return run('Requesting reset link…', async () => {
                try {
                  await requestCloudPasswordReset(email);
                  if (alive.current && ticket === generation.current) setFeedback({ tone: 'success', text: cloudPasswordResetMessage });
                } catch (error) {
                  if (alive.current && ticket === generation.current) setFeedback({ tone: 'error', text: cloudAuthError(error, 'password-reset') });
                }
              });
            }} />
          ) : null}
          {phase === 'failed' ? <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => void refresh()}>Refresh backup status</Button>{reauthRequired && account ? <Button variant="ghost" disabled={busy} onClick={() => void signOut()}>Sign out to sign in again</Button> : null}</div> : null}
          {review && !reloadRequired ? <CloudBackupReview review={review} /> : overview && account && !reloadRequired ? <>
            <div>
              <section aria-labelledby="cloud-current-profile">
                <p className="text-label text-muted-foreground">Current profile</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 id="cloud-current-profile" className="text-section-title min-w-0 break-words">{current?.name || 'Local profile unavailable'}</h3>
                  <span className={'cloud-status-label' + (status?.primaryAction === 'none' ? ' cloud-status-current' : '')}>
                    {status?.primaryAction === 'none' ? <Check aria-hidden="true" className="size-4" /> : null}{status?.title}
                  </span>
                </div>
                <p className="text-body-sm mt-3 text-muted-foreground">{status?.detail}</p>
                {matching ? <dl className="cloud-detail-list mt-4"><div><dt>Latest Cloud backup</dt><dd>{formatCloudDate(matching.updatedAt)}</dd></div></dl> : null}
              </section>
              <section className="cloud-automatic-section flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <label htmlFor="cloud-automatic-backup" className="text-card-title">Automatic Backup</label>
                  <p className="text-body-sm mt-1 font-semibold">{automatic?.enabled ? automaticPaused ? 'On · Paused' : 'On' : 'Off'}</p>
                  <p id="cloud-automatic-description" className="text-body-sm mt-1 text-muted-foreground">{automaticCopy}</p>
                </div>
                <Switch id="cloud-automatic-backup" aria-describedby="cloud-automatic-description" checked={automatic?.enabled ?? false}
                  disabled={busy || !scope || reloadRequired || (!automatic?.enabled && (phase !== 'ready' || !automatic?.eligible || !matching || status?.needsReview))}
                  onCheckedChange={enabled => { if (!scope) return; try { setCloudAutoBackupEnabled(scope, enabled); } catch (error) { setFeedback({ tone: 'error', text: cloudFailureMessage(error, 'Automatic Backup') }); } }}
                  className="mt-3 cloud-automatic-switch" />
              </section>
            </div>
            {otherBackups.length ? (
              <Collapsible>
                <CollapsibleTrigger asChild><Button variant="ghost" className="cloud-disclosure w-full justify-between"><span>Other backups in this Cloud account ({otherBackups.length})</span><ChevronDown aria-hidden="true" className="size-4 shrink-0" /></Button></CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3">
                  {otherBackups.map(backup => {
                    const label = cloudBackupLabel(backup, otherBackups);
                    const localProfile = localProfiles.find(profile => profile.id === backup.profileId);
                    const sameName = current && label.trim() === current.name.trim();
                    const location = localProfile ? 'Another profile on this device' : sameName ? 'Another profile' : '';
                    return <div key={backup.id} className="cloud-backup-row">
                      <div className="min-w-0">
                        <p className="text-body-sm break-words font-semibold">{label}</p>
                        {backup.profileNameSource !== 'unknown' ? <p className="text-body-sm mt-1 text-muted-foreground">{location ? location + ' · ' : ''}{formatCloudDate(backup.updatedAt)}</p> : null}
                      </div>
                      <div className="cloud-row-actions">
                        <Button variant="ghost" disabled={!canAct} aria-label={'Review ' + label} onClick={() => void reviewBackup(backup)}>Review</Button>
                        <DropdownMenu open={menuId === backup.id} onOpenChange={open => setMenuId(open ? backup.id : null)}>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={!canAct} aria-label={'More actions for ' + label}><MoreVertical aria-hidden="true" className="size-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent className="cloud-backup-menu" align="end" sideOffset={4}>
                            <DropdownMenuItem variant="destructive" disabled={!canAct} onSelect={() => confirmDelete(backup, label)}>Delete Cloud backup</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>;
                  })}
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            <Collapsible>
              <CollapsibleTrigger asChild><Button variant="ghost" className="cloud-disclosure w-full justify-between"><span>More actions</span><ChevronDown aria-hidden="true" className="size-4 shrink-0" /></Button></CollapsibleTrigger>
              <CollapsibleContent className="cloud-maintenance mt-1 flex flex-col items-start">
                {status?.primaryAction === 'none' ? <Button variant="ghost" disabled={!canAct} onClick={() => void backUp()}>Back up again</Button> : null}
                <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>Refresh Cloud Backup</Button>
                {matching ? <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={!canAct} onClick={() => confirmDelete(matching, current?.name || 'this profile')}>Delete this Cloud backup</Button> : null}
                <Button variant="ghost" disabled={busy || reloadRequired} onClick={() => void signOut()}>Sign out of Cloud</Button>
              </CollapsibleContent>
            </Collapsible>
          </> : null}
          <div aria-live="polite" aria-atomic="true" role="status" className={operation || sharedOperation || (refreshing && overview) ? 'text-body-sm' : 'sr-only'}>
            {operation || (sharedOperation ? 'Cloud Backup is working…' : refreshing && overview ? 'Refreshing Cloud Backup…' : '')}
            {!operation && !sharedOperation && !refreshing && feedback?.tone !== 'error' && (account || phase !== 'ready') ? <span className="sr-only">{feedback?.text}</span> : null}
          </div>
          {feedback && (account || phase !== 'ready') ? (
            <div className={feedback.tone === 'success' ? 'text-body-sm' : 'cloud-notice ' + (feedback.tone === 'error' ? 'cloud-notice-error' : '')} role={feedback.tone === 'error' ? 'alert' : undefined}>
              <p className="text-body-sm font-semibold">{feedback.text}</p>
              {feedback.detail ? <p className="text-body-sm mt-1 text-muted-foreground">{feedback.detail}</p> : null}
              {feedback.diagnostics?.length ? <details className="mt-2"><summary className="cloud-touch-target cursor-pointer text-body-sm text-muted-foreground">Technical details</summary><ul className="space-y-1 break-words text-body-sm text-muted-foreground">{feedback.diagnostics.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null}
              {retry && !reloadRequired ? <Button variant="secondary" disabled={busy} onClick={() => void retryAction()} className="mt-3">{retry.kind === 'backup' ? status?.needsReview ? 'Review backup' : 'Retry backup' : retry.kind === 'files' ? 'Retry files' : 'Retry cleanup'}</Button> : null}
            </div>
          ) : null}
        </>}
      </div>
    </CaizenFormDialog>
    <ConfirmDialog isOpen={!blockedByDemo && Boolean(confirmation)} title={confirmation?.title || 'Confirm Cloud action'} message={confirmation?.message || ''} confirmText={confirmation?.confirmText} isDangerous={confirmation?.dangerous ?? false} confirmDisabled={busy}
      onCancel={() => setConfirmation(null)} onConfirm={async () => { const action = confirmation?.run; setConfirmation(null); await action?.(); }} />
  </>;
}
