import { STORES } from '../storage/schema';
import { getStoreValue, updateStoreValue } from '../storage/database';

export const WIDGET_ACTION_SCHEMA_VERSION = 1;
export const WIDGET_ACTION_RECEIPTS_KEY = 'caizen-widget-action-receipts-v1';
export const MAX_WIDGET_ACTION_RECEIPTS_PER_PROFILE = 128;

export type WidgetActionType =
  | 'routine.complete'
  | 'task.complete'
  | 'workTask.complete';

export type WidgetProviderKind = 'calendar' | 'routines' | 'today' | 'workTasks';

export interface WidgetBindingContract {
  appWidgetId: number;
  providerKind: WidgetProviderKind;
  profileId: string;
  privacyMode: 'redacted' | 'names';
  includeRoutines: boolean;
}

export function normalizeWidgetBinding(value: unknown): WidgetBindingContract | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<WidgetBindingContract>;
  if (
    !Number.isInteger(source.appWidgetId) ||
    (source.appWidgetId as number) < 0 ||
    !WIDGET_PROVIDER_KINDS.includes(source.providerKind as WidgetProviderKind) ||
    !validId(source.profileId) ||
    (source.privacyMode !== 'redacted' && source.privacyMode !== 'names')
  ) return null;
  return {
    appWidgetId: source.appWidgetId as number,
    providerKind: source.providerKind as WidgetProviderKind,
    profileId: source.profileId!.trim(),
    privacyMode: source.privacyMode,
    includeRoutines: source.includeRoutines !== false,
  };
}

export type WidgetAction = {
  schemaVersion: typeof WIDGET_ACTION_SCHEMA_VERSION;
  actionId: string;
  actionType: WidgetActionType;
  sourceWidgetId: number;
  profileId: string;
  recordId: string;
  localDateKey: string;
  occurrenceKey: string;
  snapshotRevision: string;
  createdAt: number;
};

export type WidgetActionResultStatus =
  | 'applied'
  | 'alreadyApplied'
  | 'retryableFailure'
  | 'rejected';

export type WidgetActionResult = {
  actionId: string;
  status: WidgetActionResultStatus;
  reason?:
    | 'invalid'
    | 'stale'
    | 'missing-profile'
    | 'missing-record'
    | 'save-failed'
    | 'unsupported'
    | 'wrong-provider'
    | 'wrong-profile'
    | 'wrong-date'
    | 'missing-projection';
};

export const WIDGET_ACTION_TYPES: readonly WidgetActionType[] = [
  'routine.complete',
  'task.complete',
  'workTask.complete',
];

export const WIDGET_PROVIDER_KINDS: readonly WidgetProviderKind[] = [
  'calendar',
  'routines',
  'today',
  'workTasks',
];

export function widgetActionAllowedForProvider(
  provider: WidgetProviderKind,
  actionType: WidgetActionType,
): boolean {
  if (provider === 'routines') return actionType === 'routine.complete';
  if (provider === 'today') return actionType === 'task.complete';
  if (provider === 'workTasks') return actionType === 'workTask.complete';
  return false;
}

export function widgetActionIdentity(
  actionType: WidgetActionType,
  profileId: string,
  recordId: string,
  occurrenceKey: string,
): string {
  return [actionType, profileId, recordId, occurrenceKey].join('\u001f');
}

/** Browser-side counterpart to Android's SHA-256 action ID implementation. */
export async function createWidgetActionId(
  actionType: WidgetActionType,
  profileId: string,
  recordId: string,
  occurrenceKey: string,
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(widgetActionIdentity(actionType, profileId, recordId, occurrenceKey)),
  );
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

function validLocalDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Normalizes untrusted native bridge JSON before it reaches a domain helper.
 * This is intentionally stricter than the persisted legacy adapter.
 */
export function normalizeWidgetAction(value: unknown): WidgetAction | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<WidgetAction>;
  if (
    source.schemaVersion !== WIDGET_ACTION_SCHEMA_VERSION ||
    typeof source.actionId !== 'string' ||
    !source.actionId.trim() ||
    !WIDGET_ACTION_TYPES.includes(source.actionType as WidgetActionType) ||
    !Number.isInteger(source.sourceWidgetId) ||
    (source.sourceWidgetId as number) < 0 ||
    !validId(source.profileId) ||
    !validId(source.recordId) ||
    !validLocalDateKey(source.localDateKey) ||
    !validId(source.occurrenceKey) ||
    !validId(source.snapshotRevision) ||
    !Number.isFinite(source.createdAt) ||
    (source.createdAt as number) <= 0
  ) return null;

  if (
    (source.actionType === 'task.complete' || source.actionType === 'workTask.complete') &&
    source.occurrenceKey !== 'once'
  ) return null;

  return {
    schemaVersion: WIDGET_ACTION_SCHEMA_VERSION,
    actionId: source.actionId.trim(),
    actionType: source.actionType as WidgetActionType,
    sourceWidgetId: source.sourceWidgetId as number,
    profileId: source.profileId!.trim(),
    recordId: source.recordId!.trim(),
    localDateKey: source.localDateKey,
    occurrenceKey: source.occurrenceKey!.trim(),
    snapshotRevision: source.snapshotRevision!.trim(),
    createdAt: source.createdAt as number,
  };
}

type WidgetActionReceiptState = {
  key: typeof WIDGET_ACTION_RECEIPTS_KEY;
  profiles: Record<string, string[]>;
};

function emptyReceiptState(): WidgetActionReceiptState {
  return { key: WIDGET_ACTION_RECEIPTS_KEY, profiles: {} };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeReceiptState(value: unknown): WidgetActionReceiptState {
  if (!value || typeof value !== 'object') return emptyReceiptState();
  const source = value as Partial<WidgetActionReceiptState>;
  const profiles: Record<string, string[]> = {};

  if (source.profiles && typeof source.profiles === 'object') {
    Object.entries(source.profiles).forEach(([profileId, actionIds]) => {
      if (!validId(profileId) || !Array.isArray(actionIds)) return;
      profiles[profileId] = Array.from(
        new Set(actionIds.filter(validId)),
      ).slice(-MAX_WIDGET_ACTION_RECEIPTS_PER_PROFILE);
    });
  }

  return { key: WIDGET_ACTION_RECEIPTS_KEY, profiles };
}

export async function hasWidgetActionReceipt(
  profileId: string,
  actionId: string,
): Promise<boolean> {
  const state = normalizeReceiptState(
    await getStoreValue<WidgetActionReceiptState>(
      STORES.settings,
      WIDGET_ACTION_RECEIPTS_KEY,
    ),
  );
  return state.profiles[profileId]?.includes(actionId) ?? false;
}

export async function recordWidgetActionReceipt(
  profileId: string,
  actionId: string,
): Promise<void> {
  if (!validId(profileId) || !validId(actionId)) return;

  await updateStoreValue<WidgetActionReceiptState>(
    STORES.settings,
    WIDGET_ACTION_RECEIPTS_KEY,
    current => {
      const state = normalizeReceiptState(current);
      const existing = state.profiles[profileId] ?? [];
      state.profiles[profileId] = Array.from(
        new Set([...existing, actionId]),
      ).slice(-MAX_WIDGET_ACTION_RECEIPTS_PER_PROFILE);
      return state;
    },
  );
}

export async function removeWidgetActionReceiptsForProfiles(
  profileIds: string[],
): Promise<void> {
  const ids = new Set(profileIds.filter(validId));
  if (!ids.size) return;

  await updateStoreValue<WidgetActionReceiptState>(
    STORES.settings,
    WIDGET_ACTION_RECEIPTS_KEY,
    current => {
      const state = normalizeReceiptState(current);
      ids.forEach(profileId => delete state.profiles[profileId]);
      return state;
    },
  );
}
