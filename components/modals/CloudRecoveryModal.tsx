'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import CloudBackupReview, { cloudReplaceBackupScope, cloudRestoreAction, cloudRestoreScope } from '@/components/common/CloudBackupReview';
import { backupLocalDataToCloud, clearReviewedCloudSnapshot, getLocalProfileModifiedAt, getRestoredCloudUser } from '@/lib/cloud-backup';
import { formatCloudDate, cloudFailureMessage, cloudProgressMessage } from '@/lib/cloud-backup-ui';
import { getSupabaseClient } from '@/lib/supabase';
import { getCloudOperation, getServerCloudOperation, holdCloudManagement, subscribeCloudOperation } from '@/lib/cloud-operation';
import type { CloudRestoreHandoff } from '@/lib/types';
import {
  recordCloudRecoveryCandidateDecision, recordCloudRecoveryReview, resolveCloudRecoveryOnboarding,
  restoreReviewedCloudProfile, retryReviewedCloudMedia, reviewCloudRecoveryCandidate,
  type CloudRecoveryCandidate, type CloudRecoveryDiscovery, type CloudRecoveryReview,
} from '@/lib/cloud-recovery';

type Props = {
  isOpen: boolean; discovery: CloudRecoveryDiscovery; candidate: CloudRecoveryCandidate;
  currentProfileId: string;
  onClose: () => void; onRestored: () => void; onRestoreCommitted?: () => void;
  onBackupSuccess?: (partial: boolean) => void;
  onBeforeBackup: () => Promise<void>; onBeforeRestore: () => Promise<CloudRestoreHandoff>;
};
export default function CloudRecoveryModal({ isOpen, discovery, candidate, currentProfileId, onClose, onRestored, onRestoreCommitted, onBackupSuccess, onBeforeBackup, onBeforeRestore }: Props) {
  const [selected, setSelected] = useState(candidate);
  const [review, setReview] = useState<CloudRecoveryReview | null>(null);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [failures, setFailures] = useState<Array<{ originalName: string | null; message: string }>>([]);
  const [confirm, setConfirm] = useState(false);
  const [confirmBackup, setConfirmBackup] = useState(false);
  const [mustReload, setMustReload] = useState(false);
  const [restored, setRestored] = useState(false);
  const [invalidated, setInvalidated] = useState(false);
  const admitted = useRef(false);
  const mounted = useRef(false);
  const closeRequest = useRef<() => void>(() => undefined);
  const bodyRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const reloadRef = useRef(false); reloadRef.current = mustReload;
  const profileRef = useRef(currentProfileId); profileRef.current = currentProfileId;
  const sharedOperation = useSyncExternalStore(subscribeCloudOperation, getCloudOperation, getServerCloudOperation);
  const busy = Boolean(progress || sharedOperation);
  const fresh = selected.classification === 'pristine-device-backup' || discovery.localProfileCount === 0;
  const candidates = discovery.candidates.filter(item => item.backup);
  const candidateGroups = [
    { label: 'Current device profile', items: candidates.filter(item => item.isCurrentProfile) },
    { label: 'Other profiles', items: candidates.filter(item => !item.isCurrentProfile) },
  ].filter(group => group.items.length);
  useEffect(() => {
    if (!isOpen) return;
    mounted.current = true;
    const release = holdCloudManagement();
    const subscription = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === discovery.userId) return;
      generation.current += 1; setInvalidated(true); setReview(null); setConfirm(false); setConfirmBackup(false); clearReviewedCloudSnapshot();
      setMessage('The Cloud account changed. Close and reopen Cloud Backup.');
    }).data.subscription;
    return () => { mounted.current = false; generation.current += 1; release(); subscription.unsubscribe(); clearReviewedCloudSnapshot(); if (reloadRef.current) window.location.reload(); };
  }, [discovery.userId, isOpen]);
  useEffect(() => { generation.current += 1; setReview(null); setConfirm(false); setConfirmBackup(false); clearReviewedCloudSnapshot(); }, [currentProfileId]);
  useEffect(() => {
    if (!review || mustReload) return;
    let cancelled = false;
    const invalidate = () => {
      void getLocalProfileModifiedAt(review.profileId).then(revision => {
        if (cancelled || admitted.current || revision === review.expectedLocalModifiedAt) return;
        setReview(null); setConfirm(false); setConfirmBackup(false); clearReviewedCloudSnapshot();
        setMessage('This device changed. Review the backup again before choosing a version.');
      }).catch(() => undefined);
    };
    window.addEventListener('caizen:local-save-complete', invalidate);
    return () => { cancelled = true; window.removeEventListener('caizen:local-save-complete', invalidate); };
  }, [review, mustReload]);
  useEffect(() => {
    if (confirm || confirmBackup || !bodyRef.current) return;
    if (document.activeElement === document.body) bodyRef.current.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
  }, [review, mustReload, invalidated, confirm, confirmBackup]);
  useEffect(() => {
    if (!isOpen) return;
    const handler = () => closeRequest.current();
    window.addEventListener('caizen:cloud-close-request', handler);
    return () => window.removeEventListener('caizen:cloud-close-request', handler);
  }, [isOpen]);
  const valid = async (ticket: number) => {
    const user = await getRestoredCloudUser().catch(() => null);
    return mounted.current && ticket === generation.current && profileRef.current === currentProfileId && user?.id === discovery.userId;
  };
  const work = async (label: string, action: (ticket: number) => Promise<void>) => {
    if (admitted.current || getCloudOperation() || invalidated) return;
    admitted.current = true; const ticket = generation.current; setProgress(label); setMessage('');
    try { if (await valid(ticket)) await action(ticket); }
    catch (error) {
      if (await valid(ticket)) {
        if (!reloadRef.current) { setReview(null); setConfirm(false); setConfirmBackup(false); clearReviewedCloudSnapshot(); }
        setMessage(cloudFailureMessage(error, label));
      }
    }
    finally { admitted.current = false; if (mounted.current) setProgress(''); }
  };
  const close = () => {
    if (confirm) { setConfirm(false); return; }
    if (confirmBackup) { setConfirmBackup(false); return; }
    if (admitted.current || getCloudOperation()) return;
    if (reloadRef.current) { onRestored(); return; }
    clearReviewedCloudSnapshot(); onClose();
    if (selected.backup) void recordCloudRecoveryCandidateDecision(discovery.userId, selected.backup, 'dismissed').catch(() => undefined);
  };
  closeRequest.current = close;
  const decide = async () => {
    await work('Keeping local data…', async ticket => {
      if (selected.backup) await recordCloudRecoveryCandidateDecision(discovery.userId, selected.backup, 'kept-local');
      if (await valid(ticket)) { clearReviewedCloudSnapshot(); onClose(); }
    });
  };
  const runReview = () => work('Reviewing backup…', async ticket => {
    await onBeforeBackup(); if (!await valid(ticket)) return;
    const next = await reviewCloudRecoveryCandidate(selected);
    if (!await valid(ticket)) { clearReviewedCloudSnapshot(); return; }
    setReview(next); await recordCloudRecoveryReview(next, 'reviewed').catch(() => undefined);
  });
  const runRestore = () => {
    const target = review; if (!target) return Promise.resolve();
    setConfirm(false);
    return work('Preparing restore…', async ticket => {
      const handoff = await onBeforeRestore();
      try {
        const result = await restoreReviewedCloudProfile(target, {
          assertBeforeReplace: () => {
            handoff.assertBeforeReplace();
            if (!mounted.current || ticket !== generation.current || profileRef.current !== currentProfileId) throw new Error('The local profile or Cloud account changed during restore. Review again.');
          },
          beforeReplace: async () => {
            await handoff.beforeReplace();
            if (!mounted.current || ticket !== generation.current || profileRef.current !== currentProfileId) throw new Error('The local profile or Cloud account changed during restore. Review again.');
          },
          onProgress: event => { if (mounted.current && ticket === generation.current) setProgress(event.message.replace(/snapshot/gi, 'backup')); },
        });
        reloadRef.current = true; setMustReload(true); setRestored(true); onRestoreCommitted?.();
        if (!mounted.current) { window.location.reload(); return; }
        await recordCloudRecoveryReview(target, 'restored').catch(() => undefined);
        if (fresh && target.restoreType !== 'replace-matching-profile') await resolveCloudRecoveryOnboarding(discovery, target.backupId, 'restored').catch(() => undefined);
        setFailures(result.failedMedia);
        setMessage(result.status === 'partial' ? `“${target.profileName}” restored. Some files could not be restored. Choose Retry files or load the profile now.` : `“${target.profileName}” restored. Load the profile to continue. Photos and attachments download from Cloud when opened.`);
      } catch (error) {
        const safe = await handoff.resumeAfterFailure().catch(() => false);
        if (!safe) { reloadRef.current = true; setMustReload(true); }
        if (mounted.current) setMessage(`${cloudFailureMessage(error, 'Restore')} ${safe ? 'Your previous workspace was checked and is still available. Review the backup again before retrying.' : 'Reload Caizen and check your local data. The recovery copy on this device is available in Backup & Restore.'}`);
        setReview(null); clearReviewedCloudSnapshot();
      }
    });
  };
  const retryFiles = () => {
    const target = review; if (!target || !restored) return Promise.resolve();
    return work('Restoring files…', async ticket => {
      const result = await retryReviewedCloudMedia(target, { onProgress: event => { if (mounted.current && ticket === generation.current) setProgress(event.message); } });
      if (!await valid(ticket)) return;
      setFailures(result.failedMedia); setMessage(result.failedMedia.length ? 'Some files could not be restored. Retry files or load the profile now.' : 'Files restored. Load the restored profile to continue.');
    });
  };
  const useLocalVersion = () => {
    const target = review; if (!target || target.profileId !== currentProfileId) return Promise.resolve();
    setConfirmBackup(false);
    return work('Preparing backup…', async ticket => {
      await onBeforeBackup(); if (!await valid(ticket)) return;
      const result = await backupLocalDataToCloud({ mode: 'manual', force: true, expectedUserId: target.userId, expectedProfileId: currentProfileId, expectedBackupId: target.backupId, expectedUpdatedAt: target.expectedUpdatedAt, expectedFingerprint: target.expectedFingerprint, expectedLocalModifiedAt: target.expectedLocalModifiedAt, onProgress: event => { if (mounted.current && ticket === generation.current) setProgress(cloudProgressMessage(event)); } });
      if (!await valid(ticket)) return;
      await recordCloudRecoveryReview(target, 'kept-local').catch(() => undefined);
      if (!await valid(ticket)) return;
      clearReviewedCloudSnapshot(); onClose(); onBackupSuccess?.(result.status === 'partial');
    });
  };
  if (!isOpen) return null;
  const footer = <div className="cloud-actions">
    {mustReload ? <><Button disabled={busy} onClick={onRestored}>{restored ? 'Load restored profile' : 'Reload Caizen'}</Button>{restored && failures.length && !invalidated ? <Button variant="ghost" disabled={busy} onClick={() => void retryFiles()}>Retry files</Button> : null}</>
      : review ? <><Button disabled={busy || invalidated} onClick={() => review.restoreType === 'replace-matching-profile' ? setConfirm(true) : void runRestore()}>{cloudRestoreAction(review)}</Button>{review.profileId === currentProfileId ? <Button variant="ghost" disabled={busy || invalidated} onClick={() => setConfirmBackup(true)}>Replace Cloud backup</Button> : null}<Button variant="ghost" disabled={busy} onClick={() => { setReview(null); clearReviewedCloudSnapshot(); }}>Back to backup choices</Button></>
      : <><Button disabled={busy || invalidated || !selected.backup} onClick={() => void runReview()}>Review backup</Button>{!fresh ? <Button variant="ghost" disabled={busy || invalidated} onClick={() => void decide()}>Keep this device’s version</Button> : null}<Button variant="ghost" disabled={busy} onClick={close}>Not now</Button></>}
  </div>;
  return <>
    <CaizenFormDialog title={mustReload ? 'Cloud restore' : 'Review Cloud backup'} description={mustReload ? undefined : 'Reviewing leaves data on this device unchanged.'} androidPresentation size="md" panelClassName="cloud-backup-modal" bodyClassName="cloud-backup-body" footer={footer} onClose={close} closeDisabled={busy} onBeforeClose={() => {
      if (admitted.current || getCloudOperation()) return false;
      if (confirm || confirmBackup) { close(); return false; }
      return true;
    }}>
      <div ref={bodyRef} aria-busy={busy} className="flex min-w-0 flex-col gap-6">
        {!mustReload ? review ? <CloudBackupReview review={review} /> : <>
          {selected.classification === 'matching-cloud-newer' ? <p className="text-body-sm font-semibold">Cloud backup changed</p> : null}
          {candidates.length > 1 ? <fieldset className="space-y-4"><legend className="text-label mb-2">Choose a backup to review</legend>{candidateGroups.map(group => <div key={group.label} className="space-y-2"><p className="text-body-sm font-semibold">{group.label}</p>{group.items.map(item => <label key={item.backup!.id} className="cloud-choice"><input type="radio" name="cloud-recovery-backup" checked={item.backup!.id === selected.backup?.id} disabled={busy || invalidated} onChange={() => { setSelected(item); setReview(null); setMessage(''); clearReviewedCloudSnapshot(); }} /><span className="min-w-0 text-body-sm"><span className="block">{item.isCurrentProfile ? 'Matches current device profile' : 'Another profile'} · {item.backup!.profileId.slice(-8)}</span><span className="block text-muted-foreground">{formatCloudDate(item.backup!.updatedAt)}</span></span></label>)}</div>)}</fieldset> : <p className="text-body-sm">{selected.isCurrentProfile ? 'Matches current device profile' : 'Another profile'} · {selected.backup?.profileId.slice(-8)} · {formatCloudDate(selected.cloudUpdatedAt)}</p>}
          <p className="text-body-sm text-muted-foreground">{fresh ? 'Not now leaves this backup available in Cloud Backup.' : 'Keeping this device’s version leaves Cloud unchanged. Not now leaves the backup available for later review.'}</p>
        </> : null}
        <div role="status" aria-live="polite" aria-atomic="true" className={progress || sharedOperation ? 'text-body-sm' : 'sr-only'}>{progress || (sharedOperation ? 'Cloud Backup is working…' : '')}{!progress && !sharedOperation && restored ? <span className="sr-only">{message}</span> : null}</div>
        {message ? <p className={restored ? failures.length ? 'cloud-notice text-body-sm' : 'text-body-sm' : 'cloud-notice cloud-notice-error text-body-sm'} role={restored ? undefined : 'alert'}>{message}</p> : null}
        {failures.length ? <details><summary className="cloud-touch-target cursor-pointer text-body-sm text-muted-foreground">File details ({failures.length})</summary><ul className="space-y-2 break-words text-body-sm text-muted-foreground">{failures.map((item, index) => <li key={index}>{item.originalName || 'File'}: {item.message.replace(/\b(?:[^/\s]+\/){3}\S+/g, '[storage path]').slice(0, 240)}</li>)}</ul></details> : null}
      </div>
    </CaizenFormDialog>
    <ConfirmDialog isOpen={confirm} title="Replace profile on this device?" message={review ? cloudRestoreScope(review) : ''} confirmText={review ? cloudRestoreAction(review) : 'Replace profile on this device'} isDangerous confirmDisabled={busy || invalidated} onCancel={() => setConfirm(false)} onConfirm={runRestore} />
    <ConfirmDialog isOpen={confirmBackup} title="Replace Cloud backup?" message={review ? cloudReplaceBackupScope(review) : ''} confirmText="Replace Cloud backup" isDangerous={false} confirmDisabled={busy || invalidated} onCancel={() => setConfirmBackup(false)} onConfirm={useLocalVersion} />
  </>;
}
