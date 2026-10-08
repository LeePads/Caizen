import { DATABASE_NAME, DATABASE_VERSION, STORES } from './schema';

let databasePromise: Promise<IDBDatabase> | null = null;

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });

export const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });

export function openCaizenDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable on this device.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.profiles)) {
        db.createObjectStore(STORES.profiles, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.records)) {
        const records = db.createObjectStore(STORES.records, { keyPath: 'key' });
        records.createIndex('profileId', 'profileId');
        records.createIndex('profileCollection', ['profileId', 'collection']);
        records.createIndex('collection', 'collection');
        records.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORES.media)) {
        const media = db.createObjectStore(STORES.media, { keyPath: 'id' });
        media.createIndex('profileId', 'profileId');
        media.createIndex('owner', ['ownerType', 'ownerId']);
        media.createIndex('syncStatus', 'syncStatus');
        media.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(STORES.mediaBlobs)) {
        db.createObjectStore(STORES.mediaBlobs, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.backupHistory)) {
        const history = db.createObjectStore(STORES.backupHistory, { keyPath: 'id' });
        history.createIndex('createdAt', 'createdAt');
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Unable to open the Caizen database.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('Close other Caizen tabs, then retry the storage upgrade.'));
    };
  });

  return databasePromise;
}

export async function getStoreValue<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openCaizenDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).get(key)) as Promise<T | undefined>;
}

export async function putStoreValue(storeName: string, value: unknown): Promise<void> {
  const db = await openCaizenDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
}

/**
 * Applies a small settings/meta update inside one IndexedDB transaction.
 * This is intentionally kept generic for bounded operational ledgers such as
 * native widget receipts; it does not create a competing domain store.
 */
export async function updateStoreValue<T>(
  storeName: string,
  key: IDBValidKey,
  update: (current: T | undefined) => T,
): Promise<T> {
  const db = await openCaizenDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  const request = store.get(key);
  let nextValue!: T;
  let updateError: unknown;

  request.onsuccess = () => {
    try {
      nextValue = update(request.result as T | undefined);
      store.put(nextValue);
    } catch (error) { updateError = error; transaction.abort(); }
  };

  try { await transactionDone(transaction); } catch (error) { throw updateError ?? error; }
  return nextValue;
}

export async function deleteStoreValue(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openCaizenDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

export async function getAllStoreValues<T>(storeName: string): Promise<T[]> {
  const db = await openCaizenDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).getAll()) as Promise<T[]>;
}

export async function resetCaizenDatabaseForTests(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Database reset is only available to tests.');
  }
  const current = databasePromise ? await databasePromise.catch(() => null) : null;
  current?.close();
  databasePromise = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Test database deletion was blocked.'));
  });
}
