'use client';

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { Archive, Download, FileJson, ShieldCheck, Upload } from 'lucide-react';

import { DEMO_PROFILE_DISPLAY_NAME, isDemoModeActive } from '@/lib/demo/demo-workspace';
import { toLocalDateKey } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CaizenFormDialog } from '@/components/ui/section-kit';
import {
  createCompleteBackup,
  createDataOnlyExport,
  downloadBlob,
  downloadBackupBlob,
  preflightCompleteBackup,
  CompleteBackupPreflightError,
  CompleteBackupSizeError,
  getPreImportRecovery,
  assertDataOnlyJsonSize,
  previewCompleteBackup,
  previewDataOnlyImport,
  restoreCompleteBackup,
  restoreDataOnlyImport,
  restorePreImportSnapshot,
  type BackupPreview,
  type RecoverySnapshot,
} from '@/lib/storage/backup-repository';
import type { PreparedImport } from '@/lib/storage/import-integrity';
import ImportPreviewScreen from '@/components/storage/ImportPreviewScreen';
import { notify } from '@/lib/feedback/notify';
import { isAndroid } from '@/lib/platform';

interface BackupManagerModalProps {
  isOpen: boolean;
  mode:
    | 'import'
    | 'export'
    | 'import-complete'
    | 'export-complete'
    | 'import-data'
    | 'export-data';
  onClose: () => void;
  onRestoreCommitted?: () => void;
}

type SelectedImport =
  | { kind: 'complete'; file: File; preview: BackupPreview; mediaBytes: number }
  | { kind: 'data'; file: File; prepared: PreparedImport; mediaBytes: number };

type PreparedExport = {
  blob: Blob;
  fileName: string;
  mimeType: string;
  kind: 'data' | 'complete';
};

const dataOnlyMediaBytes = (value: unknown) => {
  if (!value || typeof value !== 'object') return 0;
  const media = (value as { media?: unknown }).media;
  if (!Array.isArray(media)) return 0;
  return media.reduce((total, item) => {
    if (!item || typeof item !== 'object') return total;
    const size = Number((item as { sizeBytes?: unknown }).sizeBytes);
    return total + (Number.isSafeInteger(size) && size > 0 ? size : 0);
  }, 0);
};

export default function BackupManagerModal({ isOpen, mode, onClose, onRestoreCommitted }: BackupManagerModalProps) {
  const fileInputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedImport | null>(null);
  const [restoreMode, setRestoreMode] = useState<'new-profiles' | 'merge' | 'replace'>('new-profiles');
  const [recovery, setRecovery] = useState<RecoverySnapshot | null>(null);
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [showDataOnlyFallback, setShowDataOnlyFallback] = useState(false);
  const [preparedExport, setPreparedExport] = useState<PreparedExport | null>(null);
  const [cloudConfirmation, setCloudConfirmation] = useState<{ signature: string; count: number; bytes: number } | null>(null);
  const cloudConfirmationTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setCloudConfirmation(null); }, [isOpen, mode]);
  useEffect(() => { if (cloudConfirmation) cloudConfirmationTitle.current?.focus(); }, [cloudConfirmation]);

  const handoffExport = useCallback(async (file: PreparedExport) => {
    await downloadBackupBlob(file.blob, file.fileName, file.mimeType);
    notify({
      actionId: `export:${file.kind}:${Date.now()}`,
      kind: 'success',
      title: `${file.kind === 'data' ? 'Data export' : 'Full backup'} ${isAndroid() ? 'saved' : 'download started'}`,
    });
  }, []);

  const prepareHandoff = useCallback(async (file: PreparedExport) => {
    if (isAndroid()) {
      await handoffExport(file);
    } else {
      // Preparation may outlive browser user activation. A fresh Download
      // click hands off the ready Blob without waiting on storage or media.
      setPreparedExport(file);
    }
  }, [handoffExport]);

  const exportDataOnly = useCallback(async () => {
    setBusy(true);
    setError(null);
    setShowDataOnlyFallback(false);
    setPreparedExport(null);
    setProgressMessage('Preparing JSON export...');
    try {
      const dataOnlyExport = await createDataOnlyExport();
      assertDataOnlyJsonSize(dataOnlyExport.size);
      await prepareHandoff({
        blob: dataOnlyExport,
        fileName: isDemoModeActive() ? 'caizen-demo.json' : 'caizen-data.json',
        mimeType: 'application/json',
        kind: 'data',
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The data export could not be created.';
      setError(message);
      notify({ actionId: `export:data:error:${Date.now()}`, kind: 'error', title: 'Data export failed', description: message });
    } finally { setBusy(false); setProgressMessage(null); }
  }, [prepareHandoff]);

  const exportComplete = useCallback(async (approvedRemoteSignature?: string) => {
    setBusy(true);
    setError(null);
    setShowDataOnlyFallback(false);
    setPreparedExport(null);
    setProgressMessage('Checking complete backup...');
    let archiveCreated = false;
    try {
      const preflight = await preflightCompleteBackup();
      if (!preflight.canClaimComplete) {
        throw new CompleteBackupPreflightError(preflight.unavailable.map(item => ({
          id: item.assetId,
          fileName: item.fileName,
          reason: item.reason,
        })));
      }
      if (preflight.remoteDownloads.length > 0) {
        const remoteBytes = preflight.remoteDownloads.reduce((total, item) => total + item.size, 0);
        const signature = JSON.stringify(preflight.remoteDownloads.map(item => [item.assetId, item.size]).sort());
        // Continue rechecks preflight; changed download requirements need fresh consent.
        if (approvedRemoteSignature !== signature) {
          setCloudConfirmation({ signature, count: preflight.remoteDownloads.length, bytes: remoteBytes });
          return;
        }
        setProgressMessage(`Cloud media required: ${preflight.remoteDownloads.length} file${preflight.remoteDownloads.length === 1 ? '' : 's'} will be downloaded...`);
      }
      const backup = await createCompleteBackup((completed, total) => {
        setProgressMessage(`Preparing media ${completed} of ${total}...`);
      });
      archiveCreated = true;
      await prepareHandoff({
        blob: backup,
        fileName: `${isDemoModeActive() ? 'caizen-demo' : 'caizen-full'}-${toLocalDateKey(new Date())}.caizen`,
        mimeType: 'application/vnd.caizen.backup',
        kind: 'complete',
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The full backup could not be created.';
      const isCompleteContentFailure = caught instanceof CompleteBackupPreflightError
        || caught instanceof CompleteBackupSizeError
        || message.includes('The complete backup failed final validation and was not created');
      if (!archiveCreated && isCompleteContentFailure) setShowDataOnlyFallback(true);
      setError(message);
      notify({ actionId: `export:complete:error:${Date.now()}`, kind: 'error', title: 'Full backup failed', description: message });
    } finally { setBusy(false); setProgressMessage(null); }
  }, [prepareHandoff]);

  const downloadPreparedExport = async () => {
    if (!preparedExport || busy) return;
    setBusy(true);
    setError(null);
    try {
      await handoffExport(preparedExport);
      setPreparedExport(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The file could not be downloaded. Try Download again.';
      setError(message);
      notify({ actionId: `export:${preparedExport.kind}:error:${Date.now()}`, kind: 'error', title: 'Export download failed', description: message });
    } finally { setBusy(false); }
  };

  const isExport = mode === 'export' || mode === 'export-complete' || mode === 'export-data';
  const expectedImportKind = mode === 'import-complete'
    ? 'complete'
    : mode === 'import-data'
      ? 'data'
      : 'any';
  if (!isOpen) return null;

  const selectBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    setCompletedMessage(null);
    try {
      const isCompleteFile = file.name.toLowerCase().endsWith('.caizen');
      if (expectedImportKind === 'complete' && !isCompleteFile) {
        throw new Error('Choose a .caizen complete backup file.');
      }
      if (expectedImportKind === 'data' && isCompleteFile) {
        throw new Error('Choose a JSON data-only export file.');
      }

      if (isCompleteFile) {
        const preview = await previewCompleteBackup(file);
        const mediaBytes = preview.manifest.media
          ? preview.manifest.media.reduce((sum, item) => sum + item.sizeBytes, 0)
          : preview.manifest.totalMediaBytes ?? 0;
        setSelected({ kind: 'complete', file, preview, mediaBytes });
      } else {
        assertDataOnlyJsonSize(file.size);
        const text = await file.text();
        const raw = JSON.parse(text) as unknown;
        const prepared = await previewDataOnlyImport(text);
        setSelected({ kind: 'data', file, prepared, mediaBytes: dataOnlyMediaBytes(raw) });
      }
      setRecovery(await getPreImportRecovery());
      setRestoreMode('new-profiles');
    } catch (caught) {
      const message = `${caught instanceof Error ? caught.message : 'The backup file is invalid.'} Nothing on this device was changed.`;
      setError(message);
      notify({ actionId: `import:preview:error:${Date.now()}`, kind: 'error', title: 'Backup validation failed', description: message });
      setSelected(null);
    } finally { setBusy(false); }
  };

  const restoreSelected = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (selected.kind === 'data') {
        await restoreDataOnlyImport(selected.prepared, restoreMode);
        onRestoreCommitted?.();
        notify({ actionId: `restore:data:${Date.now()}`, kind: 'success', title: 'Data restored' });
        window.location.reload();
        return;
      }
      const result = await restoreCompleteBackup(selected.file, restoreMode);
      onRestoreCommitted?.();
      if (result.status === 'success') {
        notify({ actionId: `restore:complete:${Date.now()}`, kind: 'success', title: 'Full backup restored' });
        window.location.reload();
        return;
      }
      setCompletedMessage(
        `Structured data and ${result.restoredMediaCount} media file${result.restoredMediaCount === 1 ? '' : 's'} were restored. ${result.failedMedia.length} media file${result.failedMedia.length === 1 ? '' : 's'} could not be restored: ${result.failedMedia.slice(0, 3).map(item => `${item.fileName}: ${item.message}`).join(' ')}`,
      );
      notify({ actionId: `restore:complete:partial:${Date.now()}`, kind: 'warning', title: 'Backup restored with warnings', description: `${result.failedMedia.length} media file(s) need attention.` });
      setBusy(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The backup could not be restored.';
      setError(message);
      notify({ actionId: `restore:error:${Date.now()}`, kind: 'error', title: 'Restore failed', description: message });
      setBusy(false);
      try { setRecovery(await getPreImportRecovery()); } catch { /* best effort */ }
    }
  };

  const recoverPreviousData = async () => {
    setBusy(true);
    try {
      await restorePreImportSnapshot();
      notify({ actionId: `restore:recovery:${Date.now()}`, kind: 'success', title: 'Previous data restored' });
      window.location.reload();
    } catch (caught) {
      setBusy(false);
      const message = caught instanceof Error ? caught.message : 'The previous data could not be restored.';
      setError(message);
      notify({ actionId: `restore:recovery:error:${Date.now()}`, kind: 'error', title: 'Recovery failed', description: message });
    }
  };

  const closePreview = () => {
    if (completedMessage) {
      window.location.reload();
      return;
    }
    setSelected(null);
    setError(null);
    setRecovery(null);
    setRestoreMode('new-profiles');
  };

  const report = selected?.kind === 'complete' ? selected.preview.integrity : selected?.prepared.report;
  const modalTitle = mode === 'export-complete'
    ? 'Export .caizen'
    : mode === 'export-data'
      ? 'Export JSON'
      : mode === 'import-complete'
        ? 'Import .caizen'
        : mode === 'import-data'
          ? 'Import JSON'
          : isExport
            ? 'Backup & Export'
            : 'Import Backup';
  const modalEyebrow = selected?.kind === 'complete' && selected.preview.missingMedia.length > 0
    ? 'Incomplete archive'
    : mode === 'export-complete' || mode === 'import-complete'
      ? 'Complete portable backup'
    : mode === 'export-data' || mode === 'import-data'
      ? 'Structured data only'
      : isExport
        ? 'Portable copies'
        : 'Validate before changing data';
  const inputAccept = expectedImportKind === 'complete'
    ? '.caizen,application/vnd.caizen.backup'
    : expectedImportKind === 'data'
      ? '.json,application/json'
      : '.json,.caizen,application/json,application/vnd.caizen.backup';

  return (
    <CaizenFormDialog
      title={isDemoModeActive() ? 'Export Demo sample data' : modalTitle}
      eyebrow={modalEyebrow}
      onClose={completedMessage ? () => window.location.reload() : onClose}
      maxWidthClass={selected ? 'max-w-5xl' : 'max-w-4xl'}
      bodyClassName={selected ? 'caizen-modal-contained-body flex min-h-0 flex-col overflow-hidden' : ''}
      panelClassName={selected ? 'h-[min(90dvh,56rem)]' : ''}
    >
      {isDemoModeActive() && <p className="shrink-0 text-sm font-semibold">This exports {DEMO_PROFILE_DISPLAY_NAME}&apos;s sample records. Return to your workspace to back up your own data.</p>}
      <div className={selected ? 'flex min-h-0 flex-1 flex-col' : 'space-y-5'}>
        {isExport && cloudConfirmation ? (
          <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5" aria-labelledby={`${fileInputId}-cloud-title`}>
            <h2 ref={cloudConfirmationTitle} id={`${fileInputId}-cloud-title`} tabIndex={-1} className="text-lg font-bold">Cloud media required</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This complete backup needs to download {cloudConfirmation.count} Cloud media file{cloudConfirmation.count === 1 ? '' : 's'} ({Math.round(cloudConfirmation.bytes / (1024 * 1024))} MB) before the archive can be created.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setCloudConfirmation(null);
                window.requestAnimationFrame(() => document.getElementById(`${fileInputId}-complete`)?.focus());
              }}>Cancel</Button>
              <Button onClick={() => {
                const signature = cloudConfirmation.signature;
                setCloudConfirmation(null);
                void exportComplete(signature);
              }}>Continue backup</Button>
            </div>
          </section>
        ) : !selected ? (
          <>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-black">{mode === 'export-complete' || mode === 'import-complete' ? 'Complete portable backup' : mode === 'export-data' || mode === 'import-data' ? 'Structured data transfer' : 'Local backup files'}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{mode === 'export-complete' ? 'A .caizen archive contains your profile data and managed photos. Exported files are not encrypted, so protect them like sensitive personal data.' : mode === 'export-data' ? 'JSON contains structured profile data and sanitized media metadata, but no managed photos or file bytes.' : mode === 'import-complete' ? 'Choose a .caizen archive. Caizen validates it and shows a preview before changing local data.' : mode === 'import-data' ? 'Choose a JSON data-only export. Caizen validates it and shows a preview before changing local data.' : isExport ? 'Data-only JSON includes profiles and media metadata. A complete .caizen backup also includes available managed photos and files. Exported files are not encrypted, so protect them like sensitive personal data.' : 'Choose a JSON export or .caizen archive. Caizen validates it and shows a preview before changing local data.'}</p></div></div>
              {!isExport ? <p className="mt-3 text-xs leading-5 text-muted-foreground">Before an import, Caizen keeps the latest structured recovery copy in local IndexedDB so the previous data can be restored if needed. A legacy migration copy may also remain in local browser/app storage; Clear all does not remove these safety copies.</p> : null}
            </div>

            {isExport ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {(mode === 'export' || mode === 'export-complete') && <ActionCard id={`${fileInputId}-complete`} icon={Archive} eyebrow="Recommended" title="Export .caizen" description="Creates a complete portable archive with your profile data and managed photos. The file is not encrypted." action="Create .caizen backup" primary busy={busy} onClick={() => void exportComplete()} />}
                {(mode === 'export' || mode === 'export-data') && <ActionCard icon={FileJson} eyebrow="Structured data only" title="Export JSON" description="Creates a structured-data export with sanitized media metadata, but no managed photos or file bytes." action={isAndroid() ? 'Export JSON' : 'Prepare JSON export'} busy={busy} onClick={() => void exportDataOnly()} />}
              </div>
            ) : (
              <ActionCard icon={mode === 'import-complete' ? Archive : Upload} eyebrow={mode === 'import-complete' ? 'Complete portable backup' : mode === 'import-data' ? 'Structured data only' : 'JSON or .caizen'} title={mode === 'import-complete' ? 'Import .caizen' : mode === 'import-data' ? 'Import JSON' : 'Import Backup'} description={mode === 'import-complete' ? 'Choose a complete .caizen archive. Nothing changes before validation and confirmation.' : mode === 'import-data' ? 'Choose a JSON export without managed photos. Nothing changes before validation and confirmation.' : 'Choose a legacy JSON export, caizen-data.json, or full .caizen archive. Nothing changes before validation and confirmation.'} action={mode === 'import-complete' ? 'Choose .caizen file' : mode === 'import-data' ? 'Choose JSON file' : 'Choose backup file'} primary busy={busy} onClick={() => document.getElementById(fileInputId)?.click()} />
            )}

            {preparedExport ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-muted-foreground" role="status">Your file is ready. Choose Download to save it.</p>
                <Button type="button" disabled={busy} onClick={() => void downloadPreparedExport()}>
                  <Download className="h-4 w-4" /> Download {preparedExport.fileName}
                </Button>
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert">
                <p>{error}</p>
                {showDataOnlyFallback ? (
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void exportDataOnly()} className="mt-3 border-destructive/35 bg-background text-foreground">
                    Export data-only JSON instead
                  </Button>
                ) : null}
              </div>
            ) : null}
            {progressMessage ? <p className="text-sm font-semibold text-muted-foreground" role="status">{progressMessage}</p> : null}
            <input id={fileInputId} type="file" accept={inputAccept} className="hidden" onChange={selectBackup} />
            <div className="flex justify-end border-t border-border/50 pt-4"><Button variant="outline" onClick={onClose} className="rounded-xl">Close</Button></div>
          </>
        ) : report ? (
          <ImportPreviewScreen
            report={report}
            fileName={selected.file.name}
            backupBytes={selected.file.size}
            mediaBytes={selected.mediaBytes}
            mode={restoreMode}
            onModeChange={setRestoreMode}
            busy={busy}
            error={error}
            completedMessage={completedMessage}
            missingMedia={selected.kind === 'complete' ? selected.preview.missingMedia : undefined}
            recovery={recovery}
            presentation="embedded"
            onCancel={closePreview}
            onRecover={() => void recoverPreviousData()}
            onSaveReport={() => downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `caizen-import-report-${toLocalDateKey(new Date())}.json`)}
            onConfirm={() => void restoreSelected()}
          />
        ) : null}
      </div>
    </CaizenFormDialog>
  );
}

function ActionCard({ id, icon: Icon, eyebrow, title, description, action, onClick, primary = false, busy = false }: {
  id?: string;
  icon: typeof Download;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
  primary?: boolean;
  busy?: boolean;
}) {
  return (
    <button id={id} type="button" onClick={onClick} disabled={busy} className={`group flex min-h-52 flex-col rounded-2xl border p-5 text-left transition disabled:opacity-60 ${primary ? 'border-primary/30 bg-primary/8 hover:border-primary/50 hover:bg-primary/12' : 'border-border/60 bg-card/55 hover:border-primary/25 hover:bg-card'}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-background/65 text-primary ring-1 ring-border/60"><Icon className="h-5 w-5" /></span>
      <span className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-primary">{eyebrow}</span>
      <span className="mt-1 text-lg font-black">{title}</span>
      <span className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{description}</span>
      <span className="mt-4 inline-flex items-center gap-2 text-sm font-black text-primary">{busy ? 'Working…' : action}{primary ? <Download className="h-4 w-4" /> : <Upload className="h-4 w-4" />}</span>
    </button>
  );
}
