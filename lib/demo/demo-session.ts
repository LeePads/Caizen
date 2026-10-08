import { loadAppState, replaceAppState, type StoredAppState } from '../storage/app-repository';
import { deleteStoreValue, getStoreValue, putStoreValue, updateStoreValue } from '../storage/database';
import { STORES } from '../storage/schema';
import { acquireWorkspaceFence, getWorkspaceFence, initializeWorkspaceFence, observeWorkspaceFence, takeOverWorkspaceFence, withWorkspaceTransition, WORKSPACE_FENCE_KEY, type WorkspaceWriteOptions } from '../storage/workspace-fence';
import { clearOnboardingDraft, loadOnboardingDraft, saveOnboardingDraft, ONBOARDING_PENDING_KEY, DEMO_ONBOARDING_RETURN_KEY, type OnboardingDraft } from '../onboarding';
import { DEMO_BACKUP_KEY, DEMO_MODE_KEY, DEMO_LOADED_AT_KEY, DEMO_VERSION_KEY, DEMO_COMPASS_DISMISSED_KEY, DEMO_ENTRY_SECTION_KEY, DEMO_CONTENT_VERSION, DEMO_TEMPLATE_URL, getDemoTodayKey, isDemoEntrySection, materializeDemoWorkspace, type DemoEntrySection } from './demo-workspace';

export const DEMO_SESSION_KEY = 'caizen-demo-session-v1';
const ROLLBACK_KEY = 'caizen-demo-transition-rollback-v1';
const SETUP_KEY = 'life-manager-setup-completed';
export type DemoOrigin = 'fresh-welcome' | 'onboarding-preview' | 'replay-introduction' | 'settings' | 'section-help' | 'external-entry';
export type DemoReturnTarget =
  | { kind: 'onboarding'; draft: OnboardingDraft }
  | { kind: 'workspace'; section: DemoEntrySection; feature?: string; helpOpen?: boolean };
export type DemoSession = {
  version: 1;
  id: string;
  origin: DemoOrigin;
  phase: 'entering' | 'active' | 'resetting' | 'exiting' | 'restored' | 'recovery-required';
  generation: number;
  templateVersion: string;
  materializedOn: string;
  startedAt: string;
  updatedAt: string;
  originalProfileId: string;
  returnTarget: DemoReturnTarget;
  entrySection: DemoEntrySection;
  guide: { open: boolean; section: DemoEntrySection; visited: DemoEntrySection[] };
  preferences: Record<string, string | null>;
  originalFlags: Record<string, string | null>;
  /** Profile IDs of the imported Demo workspace. Absent on sessions created before identity was recorded. */
  demoProfileIds?: string[];
  demoCurrentProfileId?: string;
  error?: string;
};
type DemoIdentity = { demoProfileIds: string[]; demoCurrentProfileId: string };
const DEMO_DISAGREES = 'The Demo workspace and recovery record disagree. Your preserved workspace is available for recovery.';
let session: DemoSession | null = null;
const listeners = new Set<() => void>();
export const getDemoSession = () => session;
export const subscribeDemoSession = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function publish(value: DemoSession | null) { session = value; listeners.forEach(listener => listener()); }
const FLAG_KEYS = [SETUP_KEY, ONBOARDING_PENDING_KEY];
const PREFERENCE_KEYS = ['tab-order', 'primary-nav-tabs', 'hidden-tabs', 'layout-default-landing-page', 'settings-active-section', 'life-manager-music-shuffle', 'life-manager-music-repeat', 'life-manager-music-hidden', 'caizen-music-session'];
const isWorkspacePreference = (key: string) => PREFERENCE_KEYS.includes(key) || key.startsWith('cloud-backup-preferences-v1:') || /(?:active-tab|active-view|view-mode|section-view|selected-tab)(?::.*)?$/.test(key);
function preferences() {
  const keys = new Set(PREFERENCE_KEYS);
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key && isWorkspacePreference(key)) keys.add(key);
  }
  return Object.fromEntries([...keys].map(key => [key, localStorage.getItem(key)]));
}
function restoreValues(values: Record<string, string | null>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  }
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
}
async function verifyState(expected: StoredAppState) {
  const actual = await loadAppState();
  if (canonical(actual) !== canonical(expected)) throw new Error('The workspace could not be verified after saving. Your recovery copy has been retained.');
}
async function putVerified(key: string, value: unknown) {
  await putStoreValue(STORES.settings, { key, value });
  const saved = await getStoreValue<{ value: unknown }>(STORES.settings, key);
  if (canonical(saved?.value) !== canonical(value)) throw new Error('The preserved workspace could not be confirmed. Demo was not opened.');
}
function identityOf(state: Pick<StoredAppState, 'profiles' | 'currentProfileId'>): DemoIdentity {
  const demoProfileIds = [...new Set(state.profiles.map(profile => profile.id))].sort();
  if (!demoProfileIds.length || demoProfileIds.some(id => typeof id !== 'string' || !id) || !demoProfileIds.includes(state.currentProfileId)) {
    throw new Error('The sample workspace has no usable profile.');
  }
  return { demoProfileIds, demoCurrentProfileId: state.currentProfileId };
}
function hasIdentity(value: DemoSession): value is DemoSession & DemoIdentity {
  return Array.isArray(value.demoProfileIds) && value.demoProfileIds.length > 0 &&
    value.demoProfileIds.every(id => typeof id === 'string' && id) &&
    typeof value.demoCurrentProfileId === 'string' && value.demoProfileIds.includes(value.demoCurrentProfileId);
}
/** Profile membership is the identity; array order is not. */
function matchesIdentity(state: StoredAppState | null, identity: DemoIdentity) {
  if (!state?.profiles.length) return false;
  const ids = state.profiles.map(profile => profile.id);
  const expected = new Set(identity.demoProfileIds);
  return new Set(ids).size === ids.length && ids.length === expected.size &&
    ids.every(id => expected.has(id)) && expected.has(state.currentProfileId);
}
/**
 * The preserved record must be a structurally complete real workspace. With a
 * session, it must also be that session's original workspace and must not
 * contain any Demo profile.
 */
async function readBackup(value?: DemoSession | null): Promise<StoredAppState> {
  const saved = await getStoreValue<{ value: StoredAppState }>(STORES.settings, DEMO_BACKUP_KEY);
  const backup = saved?.value;
  if (!Array.isArray(backup?.profiles) || !backup.profiles.length || backup.profiles.some(profile => !profile || typeof profile.id !== 'string' || !profile.id) || !backup.profiles.some(profile => profile.id === backup.currentProfileId)) {
    throw new Error('The preserved workspace is missing or incomplete. Review recovery before making changes.');
  }
  if (value && backup.currentProfileId !== value.originalProfileId) throw new Error('The preserved workspace does not match this Demo session.');
  if (value && hasIdentity(value) && backup.profiles.some(profile => value.demoProfileIds.includes(profile.id))) {
    throw new Error('The preserved workspace contains sample data. Review recovery before making changes.');
  }
  return backup;
}
async function prepareDemoTemplate(materializedOn: string) {
  const response = await fetch(DEMO_TEMPLATE_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('The sample workspace could not be loaded. Check your connection and try again.');
  const { previewDataOnlyImport } = await import('../storage/backup-repository');
  const prepared = await previewDataOnlyImport(materializeDemoWorkspace(await response.text(), materializedOn));
  if (!prepared.report.canImport) throw new Error(prepared.report.warnings[0] || 'The sample did not pass the import safety check.');
  return prepared;
}
/**
 * Sessions created before Demo identity was recorded. Runs once per session;
 * afterwards the persisted identity is used and the template is not fetched.
 */
async function migrateSessionIdentity(value: DemoSession, state: StoredAppState | null, backup: StoredAppState): Promise<DemoSession> {
  if (!state) throw new Error(DEMO_DISAGREES);
  // The current template can only vouch for sessions of the same content
  // version. Older templates are no longer shipped; for those the fence check
  // that precedes this call (Demo, matching generation, no owner) is what ties
  // the workspace to this session's own import.
  const identity = value.templateVersion === DEMO_CONTENT_VERSION
    ? identityOf((await prepareDemoTemplate(getDemoTodayKey())).state)
    : identityOf(state);
  if (!matchesIdentity(state, identity) || backup.profiles.some(profile => identity.demoProfileIds.includes(profile.id))) {
    throw new Error(DEMO_DISAGREES);
  }
  const migrated: DemoSession = { ...value, ...identity, updatedAt: new Date().toISOString() };
  await putVerified(DEMO_SESSION_KEY, migrated);
  return migrated;
}
function writeOptions(next: DemoSession, demo: boolean): WorkspaceWriteOptions {
  return {
    owner: getWorkspaceFence().owner ?? undefined,
    expectedGeneration: getWorkspaceFence().generation,
    nextFence: { generation: next.generation, owner: null, demo },
    settings: [{ key: DEMO_SESSION_KEY, value: next }],
  };
}
function syncHints(value: DemoSession | null) {
  const active = value && value.phase !== 'restored';
  if (active) {
    localStorage.setItem(DEMO_MODE_KEY, 'true');
    localStorage.setItem(DEMO_VERSION_KEY, value.templateVersion);
    localStorage.setItem(DEMO_LOADED_AT_KEY, value.startedAt);
    localStorage.setItem(SETUP_KEY, 'true');
    localStorage.removeItem(ONBOARDING_PENDING_KEY);
    localStorage.setItem(DEMO_COMPASS_DISMISSED_KEY, String(!value.guide.open));
  } else {
    for (const key of [DEMO_MODE_KEY, DEMO_VERSION_KEY, DEMO_LOADED_AT_KEY, DEMO_ONBOARDING_RETURN_KEY, DEMO_COMPASS_DISMISSED_KEY]) localStorage.removeItem(key);
  }
  sessionStorage.removeItem(DEMO_ENTRY_SECTION_KEY);
  localStorage.removeItem('asset-planning-app-data');
}
export function demoReturnLabel(value = session) {
  if (value?.returnTarget.kind !== 'onboarding') return 'Return to my workspace';
  if (value.returnTarget.draft.mode === 'replay') return 'Resume introduction';
  return value.returnTarget.draft.phase === 'welcome' ? 'Back to welcome' : 'Resume setup';
}
export async function updateDemoGuide(update: Partial<DemoSession['guide']>) {
  if (!session || session.phase !== 'active') return;
  const next = { ...session, guide: { ...session.guide, ...update } };
  publish(next);
  // Guide progress is advisory; never make exploration depend on its durability.
  await updateStoreValue<{ key: string; value: DemoSession | null }>(STORES.settings, DEMO_SESSION_KEY, current => {
    if (current?.value?.id !== next.id || current.value.phase !== 'active' || current.value.generation !== next.generation) return current ?? { key: DEMO_SESSION_KEY, value: null };
    return { key: DEMO_SESSION_KEY, value: { ...current.value, guide: next.guide } };
  }).catch(() => undefined);
}

export async function enterDemo(options: {
  origin: DemoOrigin;
  returnTarget: DemoReturnTarget;
  entrySection?: DemoEntrySection;
  reset?: boolean;
  beginTransition: () => Promise<() => void>;
}) {
  if (options.returnTarget.kind === 'onboarding') await saveOnboardingDraft(options.returnTarget.draft);
  const materializedOn = getDemoTodayKey();
  const prepared = await prepareDemoTemplate(materializedOn);
  // Recorded before replacement so reconciliation never depends on a dataset-specific ID.
  const identity = identityOf(prepared.state);
  const { restoreDataOnlyImport } = await import('../storage/backup-repository');
  await withWorkspaceTransition(async () => {
    const resume = await options.beginTransition();
    const previous = session;
    let current: StoredAppState | null = null;
    let next: DemoSession | null = null;
    try {
      current = await loadAppState();
      if (!current?.profiles.length) throw new Error('Your current workspace could not be confirmed.');
      if (options.reset && !previous) throw new Error('No active Demo session was found.');
      if (previous && !options.reset) throw new Error('Demo is already active.');
      // Demo and real profiles must be distinguishable for recovery to be provable.
      if (!previous && current.profiles.some(profile => identity.demoProfileIds.includes(profile.id))) {
        throw new Error('This workspace already contains the sample profile, so Demo cannot be opened safely here.');
      }
      const id = previous?.id ?? crypto.randomUUID();
      const fence = await acquireWorkspaceFence(id);
      if (!previous) await putVerified(DEMO_BACKUP_KEY, current);
      else {
        const backup = await readBackup(previous);
        if (backup.profiles.some(profile => identity.demoProfileIds.includes(profile.id))) throw new Error('The preserved workspace contains sample data. Review recovery before making changes.');
        await putVerified(ROLLBACK_KEY, current);
      }
      const requestedSection = options.entrySection ?? null;
      const entrySection = isDemoEntrySection(requestedSection) ? requestedSection : 'dashboard';
      next = {
        version: 1, id, origin: previous?.origin ?? options.origin,
        phase: options.reset ? 'resetting' : 'entering', generation: fence.generation,
        templateVersion: DEMO_CONTENT_VERSION, materializedOn,
        startedAt: previous?.startedAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(),
        originalProfileId: previous?.originalProfileId ?? current.currentProfileId,
        returnTarget: previous?.returnTarget ?? options.returnTarget, entrySection,
        guide: { open: true, section: entrySection, visited: [entrySection] },
        preferences: previous?.preferences ?? preferences(),
        originalFlags: previous?.originalFlags ?? Object.fromEntries(FLAG_KEYS.map(key => [key, localStorage.getItem(key)])),
        ...identity,
      };
      await putVerified(DEMO_SESSION_KEY, next);
      publish(next);
      const active = { ...next, phase: 'active' as const };
      await restoreDataOnlyImport(prepared, 'replace', { preserveExistingMedia: true, preserveRecovery: true, workspaceWrite: writeOptions(active, true) });
      publish(active);
      syncHints(active);
      window.location.replace('/app/');
    } catch (error) {
      if (current && next) {
        try {
          const rollback = previous ? { ...previous, generation: getWorkspaceFence().generation } : null;
          await replaceAppState(current!, {
            owner: getWorkspaceFence().owner ?? undefined,
            nextFence: { generation: getWorkspaceFence().generation, owner: null, demo: Boolean(previous) },
            settings: [{ key: DEMO_SESSION_KEY, value: rollback }],
          });
          await verifyState(current!);
          if (next && !previous) restoreValues(next.originalFlags);
          publish(rollback); syncHints(rollback);
        } catch (failure) { await requireRecovery(next, failure); throw failure; }
      } else if (getWorkspaceFence().owner) {
        const fence = { ...getWorkspaceFence(), owner: null };
        await putStoreValue(STORES.settings, { key: WORKSPACE_FENCE_KEY, value: fence });
        observeWorkspaceFence(fence);
      }
      resume();
      throw error;
    }
  });
}

async function requireRecovery(value: DemoSession | null, error: unknown) {
  if (value) {
    const next: DemoSession = { ...value, phase: 'recovery-required', error: error instanceof Error ? error.message : 'Recovery needs attention.' };
    await putStoreValue(STORES.settings, { key: DEMO_SESSION_KEY, value: next });
    publish(next);
  }
  window.dispatchEvent(new Event('caizen:workspace-recovery-required'));
}
async function applyReturn(value: DemoSession) {
  // Include keys created while exploring, so newly chosen Demo views do not leak.
  const demoKeys = Object.keys(preferences()).filter(key => !(key in value.preferences));
  for (const key of demoKeys) localStorage.removeItem(key);
  restoreValues(value.preferences);
  restoreValues(value.originalFlags);
  if (value.returnTarget.kind === 'onboarding') {
    await saveOnboardingDraft({ ...value.returnTarget.draft, status: 'active' });
    localStorage.setItem(ONBOARDING_PENDING_KEY, 'true');
  }
  syncHints(null);
}
export async function exitDemo(beginTransition: () => Promise<() => void>) {
  await withWorkspaceTransition(async () => {
    if (!session) throw new Error('No Demo session was found. Reload Caizen to review recovery.');
    const previous = session;
    const backup = await readBackup(previous);
    const resume = await beginTransition();
    let current: StoredAppState | null = null;
    try {
      current = await loadAppState();
      if (!current) throw new Error('The sample workspace could not be confirmed.');
      const fence = await acquireWorkspaceFence(previous.id);
      await putVerified(ROLLBACK_KEY, current);
      const exiting: DemoSession = { ...previous, generation: fence.generation, phase: 'exiting' };
      await putVerified(DEMO_SESSION_KEY, exiting);
      const restored: DemoSession = { ...exiting, phase: 'restored' };
      await replaceAppState(backup, writeOptions(restored, false));
      await verifyState(backup);
      publish(restored);
      await applyReturn(restored);
      window.location.replace('/app/');
    } catch (error) {
      // Leave restoration journal and original backup intact. Startup can finish
      // applying return metadata even when localStorage itself is unavailable.
      await requireRecovery({ ...previous, generation: getWorkspaceFence().generation }, error);
      if (!current) resume();
      throw error;
    }
  });
}

function isReadableSession(value: DemoSession) {
  return !(value.version !== 1 || typeof value.id !== 'string' || !value.id ||
    !['entering', 'active', 'resetting', 'exiting', 'restored', 'recovery-required'].includes(value.phase) ||
    !Number.isSafeInteger(value.generation) || value.generation < 0 ||
    typeof value.originalProfileId !== 'string' || !isDemoEntrySection(value.entrySection) ||
    !value.returnTarget || !['workspace', 'onboarding'].includes(value.returnTarget.kind) ||
    (value.returnTarget.kind === 'workspace' && !isDemoEntrySection(value.returnTarget.section)) ||
    (value.returnTarget.kind === 'onboarding' && (!value.returnTarget.draft || value.returnTarget.draft.profileId !== value.originalProfileId || !['fresh', 'replay'].includes(value.returnTarget.draft.mode))) ||
    !value.guide || typeof value.guide.open !== 'boolean' || !isDemoEntrySection(value.guide.section) || !Array.isArray(value.guide.visited) ||
    !value.preferences || !value.originalFlags ||
    Object.values({ ...value.preferences, ...value.originalFlags }).some(entry => entry !== null && typeof entry !== 'string') ||
    ((value.demoProfileIds !== undefined || value.demoCurrentProfileId !== undefined) && !hasIdentity(value)));
}

/** Run before AppProvider, cleanup workers, Cloud or native publication. */
export async function reconcileDemoSession() {
  await initializeWorkspaceFence();
  const saved = await getStoreValue<{ value: DemoSession }>(STORES.settings, DEMO_SESSION_KEY);
  let value = saved?.value ?? null;
  if (value && !isReadableSession(value)) {
    throw new Error('This Demo session cannot be read safely. Your stored workspace has been preserved.');
  }
  const state = await loadAppState();
  if (!value && localStorage.getItem(DEMO_MODE_KEY) === 'true') {
    const backup = await readBackup();
    const mode = localStorage.getItem(DEMO_ONBOARDING_RETURN_KEY);
    const profile = backup.profiles.find(item => item.id === backup.currentProfileId)!;
    const returnTarget: DemoReturnTarget = mode === 'fresh' || mode === 'true' || mode === 'replay'
      ? { kind: 'onboarding', draft: await loadOnboardingDraft(profile.id, mode === 'replay' ? 'replay' : 'fresh', profile.name, profile.baseCurrency || profile.currency || 'PHP') }
      : { kind: 'workspace', section: 'dashboard' };
    const entry = sessionStorage.getItem(DEMO_ENTRY_SECTION_KEY);
    value = { version: 1, id: crypto.randomUUID(), origin: 'external-entry', phase: 'active', generation: getWorkspaceFence().generation,
      templateVersion: localStorage.getItem(DEMO_VERSION_KEY) || 'demo-v3', materializedOn: getDemoTodayKey(), startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      originalProfileId: backup.currentProfileId, returnTarget, entrySection: isDemoEntrySection(entry) ? entry : 'dashboard',
      guide: { open: localStorage.getItem(DEMO_COMPASS_DISMISSED_KEY) !== 'true', section: isDemoEntrySection(entry) ? entry : 'dashboard', visited: [] },
      preferences: preferences(), originalFlags: { [SETUP_KEY]: mode === 'fresh' || mode === 'true' ? null : 'true', [ONBOARDING_PENDING_KEY]: returnTarget.kind === 'onboarding' ? 'true' : null } };
    await putVerified(DEMO_SESSION_KEY, value);
    const fence = { ...getWorkspaceFence(), demo: true };
    await putStoreValue(STORES.settings, { key: WORKSPACE_FENCE_KEY, value: fence }); observeWorkspaceFence(fence);
  }
  if (!value) {
    if (getWorkspaceFence().demo) throw new Error('Demo recovery metadata is missing. Your stored data has been preserved.');
    if (getWorkspaceFence().owner) {
      // Entry stopped before writing its journal; no replacement could begin.
      const fence = { ...getWorkspaceFence(), owner: null };
      await putStoreValue(STORES.settings, { key: WORKSPACE_FENCE_KEY, value: fence }); observeWorkspaceFence(fence);
    }
    publish(null); return;
  }
  const backup = await readBackup(value);
  const realPresent = canonical(state) === canonical(backup);
  if (value.phase === 'entering' && realPresent) {
    await applyReturn(value);
    const fence = { generation: value.generation, owner: null, demo: false };
    await putStoreValue(STORES.settings, { key: WORKSPACE_FENCE_KEY, value: fence }); observeWorkspaceFence(fence);
    await deleteStoreValue(STORES.settings, DEMO_SESSION_KEY); publish(null); return;
  }
  if (value.phase === 'resetting') {
    const rollback = await getStoreValue<{ value: StoredAppState }>(STORES.settings, ROLLBACK_KEY);
    if (!rollback?.value) throw new Error('The interrupted Demo reset needs its recovery copy.');
    // The rollback is the previous Demo, which may predate a template whose profile IDs changed.
    const identity = identityOf(rollback.value);
    if (backup.profiles.some(profile => identity.demoProfileIds.includes(profile.id))) throw new Error(DEMO_DISAGREES);
    value = { ...value, ...identity, phase: 'active' };
    await replaceAppState(rollback.value, writeOptions(value, true));
    await verifyState(rollback.value);
  } else if (value.phase === 'restored' && !getWorkspaceFence().demo && state?.profiles.some(profile => profile.id === value!.originalProfileId)) {
    await applyReturn(value);
  } else if (value.phase === 'exiting' || value.phase === 'restored' || value.phase === 'recovery-required') {
    value = { ...value, phase: 'restored' };
    await replaceAppState(backup, writeOptions(value, false));
    await verifyState(backup);
    await applyReturn(value);
  } else if (value.phase !== 'active' || !getWorkspaceFence().demo || getWorkspaceFence().generation !== value.generation || getWorkspaceFence().owner !== null || !state?.profiles.length) {
    throw new Error(DEMO_DISAGREES);
  } else {
    if (!hasIdentity(value)) value = await migrateSessionIdentity(value, state, backup);
    if (!hasIdentity(value) || !matchesIdentity(state, value)) throw new Error(DEMO_DISAGREES);
  }
  publish(value);
  if (value.phase === 'active') syncHints(value);
}

/** True only when a preserved backup exists and a Demo transition is actually recorded. */
export async function hasDemoRecoveryState() {
  const [saved, fence, backup] = await Promise.all([
    getStoreValue<{ value: DemoSession | null }>(STORES.settings, DEMO_SESSION_KEY),
    getStoreValue<{ value: { demo?: boolean } }>(STORES.settings, WORKSPACE_FENCE_KEY),
    getStoreValue<{ value: unknown }>(STORES.settings, DEMO_BACKUP_KEY),
  ]);
  return Boolean(backup?.value) && (Boolean(saved?.value) || Boolean(fence?.value?.demo) || localStorage.getItem(DEMO_MODE_KEY) === 'true');
}
/**
 * User-chosen escape from Demo recovery. The preserved workspace is validated,
 * restored, and verified before any Demo metadata is cleared; on failure the
 * backup and recovery state are left in place. Final cleanup still happens in
 * acknowledgeDemoReturn after the restored workspace hydrates.
 */
export async function restorePreservedWorkspace() {
  await withWorkspaceTransition(async () => {
    // A leftover backup alone must never overwrite a workspace that is not in Demo.
    if (!(await hasDemoRecoveryState())) throw new Error('No Demo session needs recovery. Your current workspace was not changed.');
    await initializeWorkspaceFence();
    const saved = await getStoreValue<{ value: DemoSession | null }>(STORES.settings, DEMO_SESSION_KEY);
    // An unreadable session cannot supply return metadata, but the backup is still validated structurally.
    const stored = saved?.value && isReadableSession(saved.value) ? saved.value : null;
    const backup = await readBackup(stored);
    const current = await loadAppState().catch(() => null);
    if (current && canonical(current) !== canonical(backup)) await putVerified(ROLLBACK_KEY, current);
    const fence = await takeOverWorkspaceFence(stored?.id ?? crypto.randomUUID());
    let restored: DemoSession | null = null;
    if (stored) {
      // Legacy sessions lack identity; record the replaced Demo profiles for media cleanup when they are clearly not real ones.
      let identity: DemoIdentity | null = null;
      if (!hasIdentity(stored) && current?.profiles.length) {
        try { identity = identityOf(current); } catch { identity = null; }
        if (identity && backup.profiles.some(profile => identity!.demoProfileIds.includes(profile.id))) identity = null;
      }
      restored = { ...stored, ...(identity ?? {}), generation: fence.generation, phase: 'restored', updatedAt: new Date().toISOString() };
      delete restored.error;
    }
    try {
      await replaceAppState(backup, {
        owner: fence.owner ?? undefined,
        expectedGeneration: fence.generation,
        nextFence: { generation: fence.generation, owner: null, demo: false },
        settings: [{ key: DEMO_SESSION_KEY, value: restored }],
      });
      await verifyState(backup);
    } catch (error) {
      // Never let an unverified restore be acknowledged; the backup stays for the next attempt.
      if (stored) await requireRecovery({ ...stored, generation: getWorkspaceFence().generation }, error);
      throw error;
    }
    publish(restored);
    if (restored) await applyReturn(restored);
    else syncHints(null);
  });
  window.location.replace('/app/');
}

/** Only acknowledge after the restored provider has hydrated successfully. */
export async function acknowledgeDemoReturn() {
  if (session?.phase !== 'restored') return;
  const value = session;
  const state = await loadAppState();
  if (getWorkspaceFence().demo || !state?.profiles.some(profile => profile.id === value.originalProfileId)) throw new Error('The restored workspace is not ready.');
  if (value.returnTarget.kind === 'workspace') await clearOnboardingDraft(value.originalProfileId, 'replay');
  await deleteStoreValue(STORES.settings, DEMO_SESSION_KEY);
  publish(null);
  await deleteStoreValue(STORES.settings, ROLLBACK_KEY);
  await deleteStoreValue(STORES.settings, DEMO_BACKUP_KEY);
  // Only the recorded Demo profiles, and never one that belongs to the restored workspace.
  const realIds = new Set(state.profiles.map(profile => profile.id));
  const demoIds = (value.demoProfileIds ?? []).filter(id => !realIds.has(id));
  if (!demoIds.length) return;
  const { queueProfileMediaCleanup, processPendingProfileMediaCleanups } = await import('../storage/profile-media-cleanup');
  for (const profileId of demoIds) queueProfileMediaCleanup(profileId);
  await processPendingProfileMediaCleanups();
}
