import { getWorkspaceFence, observeWorkspaceFence, WORKSPACE_FENCE_KEY, type WorkspaceFence, type WorkspaceWriteOptions } from './workspace-fence';
import type { Profile } from '../types';
import { openCaizenDatabase, transactionDone } from './database';
import {
  HEALTH_COLLECTIONS,
  PROFILE_COLLECTIONS,
  STORES,
} from './schema';

export type StoredAppState = {
  profiles: Profile[];
  currentProfileId: string;
};

type StoredProfile = Omit<Profile, (typeof PROFILE_COLLECTIONS)[number] | 'health'> & {
  health: Omit<Profile['health'], (typeof HEALTH_COLLECTIONS)[number]>;
};

type StoredRecord = {
  key: string;
  profileId: string;
  collection: string;
  recordId: string;
  data: unknown;
  updatedAt: string;
};

const itemId = (item: unknown, index: number) => {
  if (item && typeof item === 'object' && 'id' in item && typeof item.id === 'string') {
    return item.id;
  }
  return `index-${index}`;
};

/**
 * Timestamps carried over from the previous write, keyed by record key.
 *
 * `splitProfile` used to stamp `new Date().toISOString()` on EVERY record on
 * EVERY save, so every row was byte-different every time even when nothing in
 * it had changed. That made `updatedAt` meaningless and defeated any
 * downstream diffing. A record now keeps its previous timestamp unless its
 * `data` reference actually changed.
 *
 * Session-scoped and best-effort: an empty map simply means every record is
 * treated as new, which is the old behaviour.
 */
const lastWritten = new Map<string, { data: unknown; updatedAt: string }>();

/**
 * The cache is only valid for the database instance it was populated from.
 * If the connection is replaced - a test reset, or a reopen after the
 * connection was closed - any retained timestamp could describe a row that no
 * longer exists, so the cache is dropped.
 */
let cachedFor: IDBDatabase | null = null;

function syncTimestampCache(db: IDBDatabase) {
  if (cachedFor !== db) {
    lastWritten.clear();
    cachedFor = db;
  }
}

const splitProfile = (profile: Profile) => {
  const core = { ...profile } as Record<string, unknown>;
  const records: StoredRecord[] = [];
  const now = new Date().toISOString();
  const stampFor = (key: string, data: unknown) => {
    const previous = lastWritten.get(key);
    return previous && previous.data === data ? previous.updatedAt : now;
  };

  for (const collection of PROFILE_COLLECTIONS) {
    const items = Array.isArray(core[collection]) ? (core[collection] as unknown[]) : [];
    delete core[collection];
    items.forEach((data, index) => {
      const recordId = itemId(data, index);
      const key = `${profile.id}:${collection}:${recordId}`;
      records.push({
        key,
        profileId: profile.id,
        collection,
        recordId,
        data,
        updatedAt: stampFor(key, data),
      });
    });
  }

  const health = { ...(profile.health ?? {}) } as Record<string, unknown>;
  for (const collection of HEALTH_COLLECTIONS) {
    const items = Array.isArray(health[collection]) ? (health[collection] as unknown[]) : [];
    delete health[collection];
    items.forEach((data, index) => {
      const recordId = itemId(data, index);
      const key = `${profile.id}:health.${collection}:${recordId}`;
      records.push({
        key,
        profileId: profile.id,
        collection: `health.${collection}`,
        recordId,
        data,
        updatedAt: stampFor(key, data),
      });
    });
  }
  core.health = health;

  return { core: core as StoredProfile, records };
};

export async function saveAppState(state: StoredAppState, options: WorkspaceWriteOptions = {}): Promise<void> {
  const expectedGeneration = options.expectedGeneration ?? getWorkspaceFence().generation;
  const db = await openCaizenDatabase();
  syncTimestampCache(db);

  // Read the existing keys in their OWN transaction first.
  //
  // This used to await getAll() *inside* the readwrite transaction, and the
  // second read happened after the puts had already been issued. An IndexedDB
  // transaction auto-commits as soon as its microtask queue drains, so any real
  // async gap between those awaits ended the transaction and every later put
  // threw TransactionInactiveError - leaving profiles and records half written
  // with no rollback. Splitting the reads out keeps the write phase free of
  // awaits, so it is a single uninterrupted transaction.
  const readTransaction = db.transaction([STORES.profiles, STORES.records], 'readonly');
  const [existingProfiles, existingRecords] = await Promise.all([
    new Promise<StoredProfile[]>((resolve, reject) => {
      const request = readTransaction.objectStore(STORES.profiles).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }),
    new Promise<StoredRecord[]>((resolve, reject) => {
      const request = readTransaction.objectStore(STORES.records).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }),
  ]);

  const nextProfileIds = new Set(state.profiles.map((profile) => profile.id));
  const split = state.profiles.map(splitProfile);
  const allNextKeys = new Set(
    split.flatMap(({ records }) => records.map((record) => record.key)),
  );

  const transaction = db.transaction(
    [STORES.profiles, STORES.records, STORES.settings],
    'readwrite',
  );
  const profileStore = transaction.objectStore(STORES.profiles);
  const recordStore = transaction.objectStore(STORES.records);
  const settingsStore = transaction.objectStore(STORES.settings);

  const done = transactionDone(transaction);
  let fenceError: Error | null = null;
  const request = settingsStore.get(WORKSPACE_FENCE_KEY);
  request.onsuccess = () => {
    const fence: WorkspaceFence = request.result?.value ?? { generation: 0, owner: null, demo: false };
    if (fence.generation !== expectedGeneration || (fence.owner && fence.owner !== options.owner)) {
      fenceError = new Error('The workspace changed in another session. Reload Caizen before saving.');
      transaction.abort();
      return;
    }
    for (const existing of existingProfiles) {
      if (!nextProfileIds.has(existing.id)) profileStore.delete(existing.id);
    }
    for (const { core, records } of split) {
      profileStore.put(core);
      for (const record of records) recordStore.put(record);
    }
    for (const record of existingRecords) {
      if (!allNextKeys.has(record.key)) recordStore.delete(record.key);
    }

    settingsStore.put({ key: 'currentProfileId', value: state.currentProfileId });
    settingsStore.put({ key: 'localModifiedAt', value: new Date().toISOString() });

    if (options.nextFence) settingsStore.put({ key: WORKSPACE_FENCE_KEY, value: options.nextFence });
    for (const setting of options.settings ?? []) settingsStore.put(setting);
  };
  try { await done; } catch (error) { throw fenceError ?? error; }
  if (options.nextFence) observeWorkspaceFence(options.nextFence);

  // Only after the transaction commits, so a failed write cannot leave the
  // cache claiming records were persisted.
  lastWritten.clear();
  for (const { records } of split) {
    for (const record of records) {
      lastWritten.set(record.key, { data: record.data, updatedAt: record.updatedAt });
    }
  }
}

export async function loadAppState(): Promise<StoredAppState | null> {
  const db = await openCaizenDatabase();
  const transaction = db.transaction(
    [STORES.profiles, STORES.records, STORES.settings],
    'readonly',
  );
  // Queue all reads before awaiting any of them. This keeps the hydration
  // round-trip to one batch of IndexedDB requests instead of serializing the
  // three independent reads behind one another.
  const profilesRequest = new Promise<StoredProfile[]>((resolve, reject) => {
    const request = transaction.objectStore(STORES.profiles).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const recordsRequest = new Promise<StoredRecord[]>((resolve, reject) => {
    const request = transaction.objectStore(STORES.records).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const currentSettingRequest = new Promise<
    { key: string; value: string } | undefined
  >((resolve, reject) => {
    const request = transaction.objectStore(STORES.settings).get('currentProfileId');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const [profiles, records, currentSetting] = await Promise.all([
    profilesRequest,
    recordsRequest,
    currentSettingRequest,
  ]);
  if (profiles.length === 0) return null;

  const recordsByProfile = new Map<string, StoredRecord[]>();
  for (const record of records) {
    const profileRecords = recordsByProfile.get(record.profileId);
    if (profileRecords) profileRecords.push(record);
    else recordsByProfile.set(record.profileId, [record]);
  }

  const hydrated = profiles.map((stored) => {
    const profile = structuredClone(stored) as Profile;
    const core = profile as unknown as Record<string, unknown>;
    const profileRecords = recordsByProfile.get(profile.id) || [];

    // `splitProfile` deletes a collection's key from the core document when it
    // moves those rows into the records store, so a core document that STILL
    // owns the key was written before that collection was split. Seeding from
    // it keeps pre-split data alive across the transition; blanking it
    // unconditionally would drop every row until the collection was next
    // written, and the next save would then persist the empty array.
    for (const collection of PROFILE_COLLECTIONS) {
      const inline = core[collection];
      core[collection] = Array.isArray(inline) ? inline : [];
    }
    const health = { ...(profile.health ?? {}) } as Record<string, unknown>;
    for (const collection of HEALTH_COLLECTIONS) {
      const inline = health[collection];
      health[collection] = Array.isArray(inline) ? inline : [];
    }
    profile.health = health as unknown as Profile['health'];

    // Records are authoritative: drop any inline seed for a collection that has
    // already been split, so a row deleted post-split cannot be resurrected.
    const splitCollections = new Set(
      profileRecords.map((record) => record.collection),
    );
    for (const collection of splitCollections) {
      if (collection.startsWith('health.')) {
        health[collection.slice('health.'.length)] = [];
      } else {
        core[collection] = [];
      }
    }

    for (const record of profileRecords) {
      if (record.collection.startsWith('health.')) {
        const collection = record.collection.slice('health.'.length);
        (profile.health as unknown as Record<string, unknown[]>)[collection].push(record.data);
      } else {
        (profile as unknown as Record<string, unknown[]>)[record.collection].push(record.data);
      }
    }
    return profile;
  });

  return {
    profiles: hydrated,
    currentProfileId:
      currentSetting?.value && hydrated.some((profile) => profile.id === currentSetting.value)
        ? currentSetting.value
        : hydrated[0]?.id ?? '',
  };
}

export async function replaceAppState(state: StoredAppState, options: WorkspaceWriteOptions = {}): Promise<void> {
  await saveAppState(state, options);
}
