import { updateStoreValue } from './storage/database';
import { getStoreValue } from './storage/database';
import { STORES } from './storage/schema';

export const CLOUD_RECOVERY_OFFER_STATE_KEY = 'cloudRecoveryOfferStateV1';
export const CLOUD_RECOVERY_OFFER_STATE_VERSION = 1 as const;
export const MAX_CLOUD_RECOVERY_ACCOUNTS = 4;
export const MAX_CLOUD_RECOVERY_ENTRIES_PER_ACCOUNT = 32;

export type CloudRecoveryDecision =
  | 'reviewed'
  | 'kept-local'
  | 'dismissed'
  | 'restored';

export type CloudRecoveryOfferEntry = {
  fingerprint: string;
  profileId: string;
  decision: CloudRecoveryDecision;
  decidedAt: string;
};

export type CloudRecoveryOfferAccount = {
  accountId: string;
  entries: CloudRecoveryOfferEntry[];
};

export type CloudRecoveryOfferStateV1 = {
  version: typeof CLOUD_RECOVERY_OFFER_STATE_VERSION;
  accounts: CloudRecoveryOfferAccount[];
};

type StoredCloudRecoveryOfferState = {
  key: typeof CLOUD_RECOVERY_OFFER_STATE_KEY;
  value: unknown;
};

const DECISIONS = new Set<CloudRecoveryDecision>([
  'reviewed',
  'kept-local',
  'dismissed',
  'restored',
]);

const emptyState = (): CloudRecoveryOfferStateV1 => ({
  version: CLOUD_RECOVERY_OFFER_STATE_VERSION,
  accounts: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeEntry = (value: unknown): CloudRecoveryOfferEntry | null => {
  if (!isRecord(value)) return null;
  const fingerprint = typeof value.fingerprint === 'string' ? value.fingerprint.trim() : '';
  const profileId = typeof value.profileId === 'string' ? value.profileId.trim() : '';
  const decision = value.decision;
  const decidedAt = typeof value.decidedAt === 'string' ? value.decidedAt : '';
  if (
    !fingerprint ||
    !profileId ||
    typeof decision !== 'string' ||
    !DECISIONS.has(decision as CloudRecoveryDecision) ||
    !decidedAt
  ) {
    return null;
  }
  return {
    fingerprint,
    profileId,
    decision: decision as CloudRecoveryDecision,
    decidedAt,
  };
};

const normalizeState = (value: unknown): CloudRecoveryOfferStateV1 => {
  if (!isRecord(value) || value.version !== CLOUD_RECOVERY_OFFER_STATE_VERSION) {
    return emptyState();
  }
  const rawAccounts = Array.isArray(value.accounts) ? value.accounts : [];
  const accounts: CloudRecoveryOfferAccount[] = [];
  for (const rawAccount of rawAccounts) {
    if (!isRecord(rawAccount)) continue;
    const accountId = typeof rawAccount.accountId === 'string'
      ? rawAccount.accountId.trim()
      : '';
    if (!accountId || accounts.some(account => account.accountId === accountId)) continue;
    const entries = Array.isArray(rawAccount.entries)
      ? rawAccount.entries.map(normalizeEntry).filter((entry): entry is CloudRecoveryOfferEntry => Boolean(entry))
      : [];
    accounts.push({
      accountId,
      entries: entries.slice(0, MAX_CLOUD_RECOVERY_ENTRIES_PER_ACCOUNT),
    });
    if (accounts.length === MAX_CLOUD_RECOVERY_ACCOUNTS) break;
  }
  return { version: CLOUD_RECOVERY_OFFER_STATE_VERSION, accounts };
};

const readStoredState = async (): Promise<CloudRecoveryOfferStateV1> => {
  const stored = await getStoreValue<StoredCloudRecoveryOfferState>(
    STORES.settings,
    CLOUD_RECOVERY_OFFER_STATE_KEY,
  );
  return normalizeState(stored?.value);
};

/**
 * Creates the stable device-local identity used to suppress a reviewed
 * recovery candidate. It contains metadata only and never includes snapshot
 * data or a profile name.
 */
export const getCloudRecoveryFingerprint = (input: {
  backupId: string;
  profileId: string;
  schemaVersion: number;
  updatedAt: string;
}): string => JSON.stringify([
  input.backupId,
  input.profileId,
  input.schemaVersion,
  input.updatedAt,
]);

export const getCloudRecoveryOfferState = async (
  accountId: string,
): Promise<CloudRecoveryOfferStateV1> => {
  const normalizedAccountId = accountId.trim();
  const state = await readStoredState();
  return {
    version: state.version,
    accounts: state.accounts
      .filter(account => account.accountId === normalizedAccountId)
      .map(account => ({ ...account, entries: [...account.entries] })),
  };
};

export const hasCloudRecoveryDecision = async (
  accountId: string,
  fingerprint: string,
): Promise<boolean> => {
  const state = await getCloudRecoveryOfferState(accountId);
  return state.accounts.some(account =>
    account.entries.some(entry => entry.fingerprint === fingerprint),
  );
};

/**
 * Records only an explicit later-phase recovery decision. The bounded write
 * is serialized in IndexedDB and is intentionally not part of app exports,
 * profile backups, Cloud snapshots, or widget projections.
 */
export const recordCloudRecoveryDecision = async (input: {
  accountId: string;
  fingerprint: string;
  profileId: string;
  decision: CloudRecoveryDecision;
  decidedAt?: string;
}): Promise<void> => {
  const accountId = input.accountId.trim();
  const fingerprint = input.fingerprint.trim();
  const profileId = input.profileId.trim();
  if (!accountId || !fingerprint || !profileId || !DECISIONS.has(input.decision)) {
    throw new Error('Cloud recovery decision metadata is invalid.');
  }
  const decidedAt = input.decidedAt ?? new Date().toISOString();
  if (!decidedAt) throw new Error('Cloud recovery decision time is required.');

  await updateStoreValue<StoredCloudRecoveryOfferState | undefined>(
    STORES.settings,
    CLOUD_RECOVERY_OFFER_STATE_KEY,
    current => {
      const state = normalizeState(current?.value);
      const account = state.accounts.find(item => item.accountId === accountId);
      const nextEntry: CloudRecoveryOfferEntry = {
        fingerprint,
        profileId,
        decision: input.decision,
        decidedAt,
      };
      const nextEntries = [
        nextEntry,
        ...(account?.entries ?? []).filter(entry => entry.fingerprint !== fingerprint),
      ].slice(0, MAX_CLOUD_RECOVERY_ENTRIES_PER_ACCOUNT);
      const nextAccount: CloudRecoveryOfferAccount = { accountId, entries: nextEntries };
      const nextAccounts = [
        nextAccount,
        ...state.accounts.filter(item => item.accountId !== accountId),
      ].slice(0, MAX_CLOUD_RECOVERY_ACCOUNTS);
      return {
        key: CLOUD_RECOVERY_OFFER_STATE_KEY,
        value: {
          version: CLOUD_RECOVERY_OFFER_STATE_VERSION,
          accounts: nextAccounts,
        } satisfies CloudRecoveryOfferStateV1,
      };
    },
  );
};

