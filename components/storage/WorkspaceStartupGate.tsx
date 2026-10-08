'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { initializeAppStorage } from '@/lib/storage/localstorage-migration';
import { hasDemoRecoveryState, reconcileDemoSession, restorePreservedWorkspace } from '@/lib/demo/demo-session';
import { withWorkspaceTransition, WORKSPACE_CHANGE_SIGNAL, getWorkspaceFence } from '@/lib/storage/workspace-fence';
import { getStoreValue } from '@/lib/storage/database';
import { STORES } from '@/lib/storage/schema';
import { DEMO_BACKUP_KEY } from '@/lib/demo/demo-workspace';

export function WorkspaceStartupGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [canRestore, setCanRestore] = useState(false);
  const inspect = useCallback(async () => {
    setReady(false); setError('');
    try {
      const prepare = async () => { await reconcileDemoSession(); await initializeAppStorage(); };
      if (navigator.locks) await withWorkspaceTransition(prepare);
      else await prepare();
      setReady(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Local storage needs attention.');
      setCanRestore(await hasDemoRecoveryState().catch(() => false));
    }
  }, []);
  useEffect(() => {
    void inspect();
    const recover = () => {
      setReady(false); setError('A workspace transition could not be confirmed. Retry recovery before making changes.');
      void hasDemoRecoveryState().then(setCanRestore, () => setCanRestore(false));
    };
    const changed = (event: StorageEvent) => {
      if (event.key !== WORKSPACE_CHANGE_SIGNAL || !event.newValue) return;
      try {
        const incoming = JSON.parse(event.newValue);
        if (incoming.generation !== getWorkspaceFence().generation || incoming.owner) {
          setReady(false); setError('The workspace changed in another tab. Reload this tab before continuing.');
        }
      } catch { /* Repository fencing still rejects stale saves. */ }
    };
    window.addEventListener('caizen:workspace-recovery-required', recover);
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener('caizen:workspace-recovery-required', recover); window.removeEventListener('storage', changed); };
  }, [inspect]);
  const exportRecovery = async () => {
    try {
      const record = await getStoreValue<{ value: unknown }>(STORES.settings, DEMO_BACKUP_KEY);
      if (!record?.value) throw new Error('No preserved Demo workspace was found. Existing local records have not been cleared.');
      const url = URL.createObjectURL(new Blob([JSON.stringify(record.value)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'caizen-preserved-workspace.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Recovery export failed.'); }
  };
  const returnToPreserved = async () => {
    setRestoring(true);
    try {
      await restorePreservedWorkspace();
    } catch (caught) {
      setError(`Your preserved workspace could not be restored: ${caught instanceof Error ? caught.message : 'unknown error'} It has been kept, and recovery remains available.`);
      setRestoring(false);
    }
  };
  if (ready) return children;
  return <main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground"><section className="max-w-lg space-y-4" aria-live="polite">
    <h1 className="text-page-title">{error ? 'Your workspace needs attention' : 'Opening your Caizen'}</h1>
    <p className="text-body text-muted-foreground">{error || 'Checking your local workspace.'}</p>
    {error && <><p className="text-sm">Your stored data has not been cleared. The recovery download contains structured data; keep existing media on this device.</p><div className="flex flex-wrap gap-3"><button className="control-button-primary min-h-11 rounded-xl px-4" disabled={restoring} onClick={() => window.location.reload()}>Retry recovery</button>{canRestore ? <button className="min-h-11 rounded-xl border px-4" disabled={restoring} onClick={() => void returnToPreserved()}>{restoring ? 'Restoring…' : 'Return to preserved workspace'}</button> : null}<button className="min-h-11 rounded-xl border px-4" disabled={restoring} onClick={() => void exportRecovery()}>Download preserved data</button></div></>}
  </section></main>;
}
