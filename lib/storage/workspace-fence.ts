import { getStoreValue, updateStoreValue } from './database';
import { STORES } from './schema';

export const WORKSPACE_FENCE_KEY = 'caizen-workspace-generation-v1';
export type WorkspaceFence = { generation: number; owner: string | null; demo: boolean };
export type WorkspaceWriteOptions = {
  expectedGeneration?: number;
  owner?: string;
  nextFence?: WorkspaceFence;
  settings?: Array<{ key: string; value: unknown }>;
};
let observed: WorkspaceFence = { generation: 0, owner: null, demo: false };
export const getWorkspaceFence = () => observed;
export const WORKSPACE_CHANGE_SIGNAL = 'caizen-workspace-change';
export function observeWorkspaceFence(value: WorkspaceFence) {
  observed = value;
  try { localStorage.setItem(WORKSPACE_CHANGE_SIGNAL, JSON.stringify(value)); } catch { /* IDB commit assertions remain authoritative. */ }
}
export async function initializeWorkspaceFence() {
  const stored = await getStoreValue<{ value: WorkspaceFence }>(STORES.settings, WORKSPACE_FENCE_KEY);
  observed = stored?.value ?? { generation: 0, owner: null, demo: false };
  return observed;
}
export function workspaceIsProtected() {
  return observed.demo || Boolean(observed.owner) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('life-manager-demo-mode') === 'true');
}
export async function workspaceCleanupIsProtected() {
  if (workspaceIsProtected()) return true;
  const saved = await getStoreValue<{ value: WorkspaceFence }>(STORES.settings, WORKSPACE_FENCE_KEY);
  return Boolean(saved?.value.demo || saved?.value.owner || (saved && saved.value.generation !== observed.generation));
}
export function assertRealWorkspace() {
  if (workspaceIsProtected()) throw new Error('Return to your workspace to do this.');
}
export async function acquireWorkspaceFence(owner: string) {
  const expected = observed.generation;
  const record = await updateStoreValue<{ key: string; value: WorkspaceFence }>(STORES.settings, WORKSPACE_FENCE_KEY, current => {
    const value = current?.value ?? { generation: 0, owner: null, demo: false };
    if (value.owner || value.generation !== expected) throw new Error('The workspace changed or is busy. Reload Caizen before trying again.');
    return { key: WORKSPACE_FENCE_KEY, value: { ...value, owner, generation: value.generation + 1 } };
  });
  observeWorkspaceFence(record.value);
  return observed;
}

/**
 * Recovery only. The caller must hold the exclusive transition lock, so any
 * owner still recorded belongs to an interrupted transition, not a live one.
 */
export async function takeOverWorkspaceFence(owner: string) {
  const expected = observed.generation;
  const record = await updateStoreValue<{ key: string; value: WorkspaceFence }>(STORES.settings, WORKSPACE_FENCE_KEY, current => {
    const value = current?.value ?? { generation: 0, owner: null, demo: false };
    if (value.generation !== expected) throw new Error('The workspace changed. Reload Caizen before trying again.');
    return { key: WORKSPACE_FENCE_KEY, value: { ...value, owner, generation: value.generation + 1 } };
  });
  observeWorkspaceFence(record.value);
  return observed;
}

/** Shared Web Locks fence external operations across tabs; IDB assertions protect saves. */
export async function withRealWorkspaceOperation<T>(operation: () => Promise<T>): Promise<T> {
  assertRealWorkspace();
  const run = async () => {
    const stored = await getStoreValue<{ value: WorkspaceFence }>(STORES.settings, WORKSPACE_FENCE_KEY);
    if (stored && (stored.value.demo || stored.value.owner || stored.value.generation !== observed.generation)) {
      throw new Error('The workspace changed. Reload Caizen before continuing.');
    }
    return operation();
  };
  return typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('caizen-workspace-operation', { mode: 'shared' }, run)
    : run();
}
export async function withWorkspaceTransition<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    throw new Error('This browser cannot safely coordinate Demo with other tabs. Update your browser and try again.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await navigator.locks.request('caizen-workspace-operation', { mode: 'exclusive', signal: controller.signal }, async () => {
      clearTimeout(timeout);
      return operation();
    });
  } finally { clearTimeout(timeout); }
}
