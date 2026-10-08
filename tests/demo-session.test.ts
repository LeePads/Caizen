import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStoreValue, putStoreValue, resetCaizenDatabaseForTests } from '@/lib/storage/database';
import { loadAppState, saveAppState } from '@/lib/storage/app-repository';
import { acquireWorkspaceFence, initializeWorkspaceFence, observeWorkspaceFence, withRealWorkspaceOperation } from '@/lib/storage/workspace-fence';
import { acknowledgeDemoReturn, DEMO_SESSION_KEY, enterDemo, exitDemo, getDemoSession, reconcileDemoSession } from '@/lib/demo/demo-session';
import { DEMO_BACKUP_KEY, materializeDemoWorkspace } from '@/lib/demo/demo-workspace';
import { loadOnboardingDraft, saveOnboardingDraft } from '@/lib/onboarding';
import { previewDataOnlyImport } from '@/lib/storage/backup-repository';
import { STORES } from '@/lib/storage/schema';

// Session tests need representative records, not every canonical history row.
// first-use-content.test.ts validates the complete shipped export separately.
const fixture = JSON.parse(readFileSync('public/caizen-demo.json', 'utf8'));
for (const profile of fixture.data.profiles) {
  for (const owner of [profile, profile.health]) {
    for (const [key, value] of Object.entries(owner)) {
      if (Array.isArray(value)) owner[key] = value.slice(0, 3);
    }
  }
}
const template = JSON.stringify(fixture);
const demoProfileId = JSON.parse(template).data.currentProfileId;
const resume = vi.fn();
const beginTransition = async () => resume;
const state = async () => {
  const prepared = await previewDataOnlyImport(materializeDemoWorkspace(template, '2026-10-03'));
  const profile = prepared.state.profiles[0];
  return { profiles: [{ ...profile, id: 'real-profile', name: 'My real workspace' }], currentProfileId: 'real-profile' };
};
beforeEach(async () => {
  localStorage.clear();
  const StorageClass = localStorage.constructor as { new(): Storage };
  vi.stubGlobal('sessionStorage', new StorageClass());
  vi.stubGlobal('window', { localStorage, sessionStorage, location: { replace: vi.fn() }, dispatchEvent: vi.fn() });
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: unknown, callback: () => unknown) => callback() } });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => template })));
  observeWorkspaceFence({ generation: 0, owner: null, demo: false });
  await saveAppState(await state());
  await reconcileDemoSession();
  resume.mockClear();
});
afterEach(async () => { vi.restoreAllMocks(); await resetCaizenDatabaseForTests(); observeWorkspaceFence({ generation: 0, owner: null, demo: false }); vi.unstubAllGlobals(); });

describe('durable Demo round trips', () => {
  it('preserves all real records and a Health setup checkpoint through reset, reload and exit', async () => {
    const original = await loadAppState();
    localStorage.setItem('caizen-onboarding-pending-v1', 'true');
    const draft = await loadOnboardingDraft('real-profile', 'fresh', 'My real workspace', 'PHP');
    Object.assign(draft, { name: 'My unfinished name', phase: 'preview', priorities: ['health', 'balance'], experienceIndex: 0 });
    await saveOnboardingDraft(draft);
    await enterDemo({ origin: 'onboarding-preview', returnTarget: { kind: 'onboarding', draft }, entrySection: 'health', beginTransition });
    expect((await loadAppState())?.currentProfileId).toBe(demoProfileId);
    sessionStorage.clear();
    await reconcileDemoSession();
    expect(getDemoSession()?.guide.section).toBe('health');
    await enterDemo({ origin: 'settings', reset: true, returnTarget: { kind: 'workspace', section: 'dashboard' }, entrySection: 'balance', beginTransition });
    expect(getDemoSession()?.returnTarget).toEqual({ kind: 'onboarding', draft });
    await exitDemo(beginTransition);
    expect(await loadAppState()).toEqual(original);
    expect(await loadOnboardingDraft('real-profile', 'fresh', 'ignored', 'USD')).toMatchObject({ name: 'My unfinished name', phase: 'preview', priorities: ['health', 'balance'] });
    expect(await getStoreValue(STORES.settings, DEMO_BACKUP_KEY)).toBeTruthy();
    await reconcileDemoSession();
    await acknowledgeDemoReturn();
    expect(await getStoreValue(STORES.settings, DEMO_BACKUP_KEY)).toBeUndefined();
  });
  it('does not replace the workspace when fetching fails', async () => {
    const original = await loadAppState();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    await expect(enterDemo({ origin: 'settings', returnTarget: { kind: 'workspace', section: 'inventory' }, beginTransition })).rejects.toThrow('could not be loaded');
    expect(await loadAppState()).toEqual(original);
    expect(getDemoSession()).toBeNull();
  });
  it('blocks external operations while Demo is active', async () => {
    await enterDemo({ origin: 'settings', returnTarget: { kind: 'workspace', section: 'workhub' }, beginTransition });
    const operation = vi.fn();
    await expect(withRealWorkspaceOperation(operation)).rejects.toThrow('Return to your workspace');
    expect(operation).not.toHaveBeenCalled();
  });
  it('retains missing-backup recovery state instead of clearing Demo', async () => {
    await enterDemo({ origin: 'settings', returnTarget: { kind: 'workspace', section: 'inventory' }, beginTransition });
    const { deleteStoreValue } = await import('@/lib/storage/database');
    await deleteStoreValue(STORES.settings, DEMO_BACKUP_KEY);
    await expect(reconcileDemoSession()).rejects.toThrow('missing or incomplete');
    expect((await loadAppState())?.currentProfileId).toBe(demoProfileId);
  });
  it('recovers interrupted exit using the preserved workspace', async () => {
    const original = await loadAppState();
    await enterDemo({ origin: 'settings', returnTarget: { kind: 'workspace', section: 'workhub', feature: 'notes' }, beginTransition });
    const active = getDemoSession()!;
    const fence = await acquireWorkspaceFence(active.id);
    await putStoreValue(STORES.settings, { key: DEMO_SESSION_KEY, value: { ...active, phase: 'exiting', generation: fence.generation } });
    await reconcileDemoSession();
    expect(await loadAppState()).toEqual(original);
    expect(getDemoSession()?.phase).toBe('restored');
  });
  it('rejects stale writes inside the repository transaction', async () => {
    const original = (await loadAppState())!;
    const oldGeneration = (await initializeWorkspaceFence()).generation;
    await acquireWorkspaceFence('other-tab');
    await expect(saveAppState(original, { expectedGeneration: oldGeneration })).rejects.toThrow('workspace changed');
    expect(await loadAppState()).toEqual(original);
  });
});


describe('Demo interruption and compatibility boundaries', () => {
  const open = () => enterDemo({ origin: 'settings', returnTarget: { kind: 'workspace', section: 'dashboard' }, beginTransition });
  it('keeps the real workspace when its preserved write fails', async () => {
    const original = await loadAppState();
    const database = await import('@/lib/storage/database');
    vi.spyOn(database, 'putStoreValue').mockRejectedValueOnce(new Error('Storage is full'));
    await expect(open()).rejects.toThrow('Storage is full');
    expect(await loadAppState()).toEqual(original);
    expect((await initializeWorkspaceFence()).owner).toBeNull();
    expect(resume).toHaveBeenCalled();
  });
  it('compensates a replacement failure and retains the original recovery anchor', async () => {
    const original = await loadAppState();
    const repository = await import('@/lib/storage/app-repository');
    vi.spyOn(repository, 'replaceAppState').mockRejectedValueOnce(new Error('Replacement failed'));
    await expect(open()).rejects.toThrow('Replacement failed');
    expect(await loadAppState()).toEqual(original);
    expect(getDemoSession()).toBeNull();
    expect(await getStoreValue(STORES.settings, DEMO_BACKUP_KEY)).toBeTruthy();
  });
  it('blocks startup for an unknown newer journal without mutating records', async () => {
    await open();
    const before = await loadAppState();
    await putStoreValue(STORES.settings, { key: DEMO_SESSION_KEY, value: { ...getDemoSession(), version: 9 } });
    await expect(reconcileDemoSession()).rejects.toThrow('cannot be read safely');
    expect(await loadAppState()).toEqual(before);
  });
  it('uses the journal when compatibility flags disagree', async () => {
    await open();
    localStorage.removeItem('life-manager-demo-mode');
    await reconcileDemoSession();
    expect(localStorage.getItem('life-manager-demo-mode')).toBe('true');
    expect(getDemoSession()?.phase).toBe('active');
  });
  it('restores existing preferences and removes views created in Demo', async () => {
    localStorage.setItem('primary-nav-tabs', '["dashboard","health"]');
    localStorage.setItem('caizen-music-session', 'real listening state');
    await open();
    localStorage.setItem('primary-nav-tabs', '["music"]');
    localStorage.setItem('caizen-music-session', 'sample listening state');
    localStorage.setItem(`inventory-view-mode:${demoProfileId}`, 'list');
    await exitDemo(beginTransition);
    expect(localStorage.getItem('primary-nav-tabs')).toBe('["dashboard","health"]');
    expect(localStorage.getItem('caizen-music-session')).toBe('real listening state');
    expect(localStorage.getItem(`inventory-view-mode:${demoProfileId}`)).toBeNull();
  });
  it('migrates a legacy preview draft durably and prevents replay navigation changes', async () => {
    sessionStorage.setItem('caizen-onboarding-draft-v2', JSON.stringify({ version: 2, profileId: 'real-profile', mode: 'replay', phase: 'experience', priorities: ['health', 'health', 'balance'], experienceIndex: 1, name: 'Draft name', currency: 'USD', customizeNavigation: true }));
    const draft = await loadOnboardingDraft('real-profile', 'replay', 'Original', 'PHP');
    expect(draft).toMatchObject({ version: 3, phase: 'preview', experienceIndex: 1, name: 'Draft name', currency: 'USD', priorities: ['health', 'balance'], customizeNavigation: false });
    sessionStorage.clear();
    expect(await loadOnboardingDraft('real-profile', 'replay', 'Original', 'PHP')).toEqual(draft);
  });
});
