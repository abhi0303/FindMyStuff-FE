/* IndexedDB access shared by the main thread and the backup worker.
 *
 * One database per account, so a shared device never mixes two people's things.
 * No library: the handful of calls below is all the backup needs. */

export type StoreName = 'places' | 'storages' | 'items' | 'meta' | 'outbox';

const VERSION = 1;

export const backupName = (userId: string) => `fms-backup-${userId}`;

const connections = new Map<string, Promise<IDBDatabase>>();

export function openBackup(userId: string): Promise<IDBDatabase> {
  const name = backupName(userId);
  let connection = connections.get(name);
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('places')) db.createObjectStore('places', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('storages')) {
          db.createObjectStore('storages', { keyPath: 'id' }).createIndex('placeId', 'placeId');
        }
        if (!db.objectStoreNames.contains('items')) {
          db.createObjectStore('items', { keyPath: 'id' }).createIndex('placeId', 'placeId');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      };
      request.onsuccess = () => {
        const db = request.result;
        // Removing the backup (here or in the other thread) must not be blocked by this connection.
        db.onversionchange = () => {
          db.close();
          connections.delete(name);
        };
        resolve(db);
      };
      request.onerror = () => {
        connections.delete(name);
        reject(request.error);
      };
    });
    connections.set(name, connection);
  }
  return connection;
}

export function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

/** Every row of a store, or only those belonging to one place. */
export function getAll<T>(db: IDBDatabase, store: StoreName, placeId?: string): Promise<T[]> {
  const objectStore = db.transaction(store).objectStore(store);
  const request = placeId ? objectStore.index('placeId').getAll(placeId) : objectStore.getAll();
  return req(request as IDBRequest<T[]>);
}

export function getOne<T>(db: IDBDatabase, store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return req(db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>);
}

export async function getMeta<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  const row = await getOne<{ key: string; value: T }>(db, 'meta', key);
  return row?.value;
}

export async function deleteBackup(userId: string): Promise<void> {
  const name = backupName(userId);
  const connection = connections.get(name);
  connections.delete(name);
  if (connection) {
    try {
      (await connection).close();
    } catch {
      /* it never opened */
    }
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // Other connections close themselves on `versionchange`; deletion finishes then.
    request.onblocked = () => resolve();
  });
}

/** True when this account has a completed backup on the device. Never creates an empty database. */
export async function backupExists(userId: string): Promise<boolean> {
  if (typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases();
    if (!databases.some((info) => info.name === backupName(userId))) return false;
  }
  const db = await openBackup(userId);
  return Boolean(await getMeta<string>(db, 'lastSyncAt'));
}
