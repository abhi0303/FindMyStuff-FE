/* Background backup worker.
 *
 * Downloads GET /sync into IndexedDB and sends the changes queued while offline.
 * Parsing a large backup and writing it happen here, off the main thread, so the app
 * never stutters while a backup runs.
 *
 * It never calls /auth/refresh: refresh tokens rotate, and two threads refreshing at
 * once makes the server revoke every session. On a 401 it asks the main thread for a
 * fresh access token and retries once. */
import type { Me, PlaceListItem } from '@/api/types';
import { deleteBackup, getAll, getMeta, getOne, openBackup, req, txDone } from './db';
import {
  EMPTY_STATUS, type BackupStatus, type FromWorker, type ItemRow, type OutboxOp,
  type PlaceRow, type SyncResponse, type ToWorker,
} from './types';

const scope = self as unknown as {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};

/** A full sync also removes what incremental sync can't report: lost access, items made private. */
const FULL_SYNC_EVERY_MS = 24 * 60 * 60 * 1000;
/** Safety net for the truncated-page loop. */
const MAX_PAGES = 500;
const REQUEST_TIMEOUT_MS = 30_000;

let userId: string | null = null;
let apiBase = '';
let token: string | null = null;
let me: Me | null = null;
let phase: BackupStatus['phase'] = 'idle';
let lastError: string | null = null;
let removed = false;

/** The request never reached the API, or the API saved nothing (5xx) — try again later. */
class NetworkError extends Error {}
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const post = (message: FromWorker) => scope.postMessage(message);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ *
 * Login token bridge
 * ------------------------------------------------------------------ */

let tokenRequests = 0;
const tokenWaiters = new Map<number, (fresh: string | null) => void>();

function askForToken(expired: string | null): Promise<string | null> {
  const requestId = ++tokenRequests;
  return new Promise((resolve) => {
    tokenWaiters.set(requestId, resolve);
    post({ type: 'need-token', requestId, expiredToken: expired });
  });
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  anonymous?: boolean;
  timeoutMs?: number;
}

async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
  const attempt = async (auth: string | null): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && !options.anonymous) headers.Authorization = `Bearer ${auth}`;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${apiBase}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError('Can’t reach the server.');
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await attempt(token);
  if (res.status === 401 && !options.anonymous) {
    token = await askForToken(token);
    if (!token) throw new HttpError(401, 'Your session has ended. Sign in again.');
    res = await attempt(token);
  }

  const text = await res.text();
  let body: { message?: unknown } | null = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (res.ok) return body as T;
  // A 5xx saved nothing and releases the idempotency key, so retrying later is safe.
  if (res.status >= 500) throw new NetworkError(`The server had a problem (${res.status}).`);
  const raw = body?.message;
  const message = Array.isArray(raw) ? raw.join('\n') : typeof raw === 'string' ? raw : `Request failed (${res.status}).`;
  throw new HttpError(res.status, message);
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

async function readStatus(): Promise<BackupStatus> {
  if (!userId || removed) return { ...EMPTY_STATUS, phase, error: lastError };
  const db = await openBackup(userId);
  const tx = db.transaction(['places', 'storages', 'items', 'meta', 'outbox']);
  const meta = tx.objectStore('meta');
  const [places, storages, items, lastSync, lastFull, ops] = await Promise.all([
    req(tx.objectStore('places').count()),
    req(tx.objectStore('storages').count()),
    req(tx.objectStore('items').count()),
    req(meta.get('lastSyncAt')) as Promise<{ value: string } | undefined>,
    req(meta.get('lastFullSyncAt')) as Promise<{ value: string } | undefined>,
    req(tx.objectStore('outbox').getAll()) as Promise<OutboxOp[]>,
  ]);
  const lastSyncAt = lastSync?.value ?? null;
  return {
    phase,
    hasBackup: Boolean(lastSyncAt),
    lastSyncAt,
    lastFullSyncAt: lastFull?.value ?? null,
    counts: { places, storages, items },
    pending: ops.filter((op) => op.status === 'pending').length,
    failed: ops.filter((op) => op.status === 'failed'),
    error: lastError,
  };
}

async function publish(): Promise<void> {
  try {
    post({ type: 'status', status: await readStatus() });
  } catch {
    /* the database is being removed */
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** One backup job at a time: a sync and a replay must never interleave. */
function exclusive(task: () => Promise<void>): void {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
}

async function job(next: BackupStatus['phase'], task: () => Promise<void>): Promise<void> {
  phase = next;
  await publish();
  try {
    await task();
    lastError = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Backup failed.';
  } finally {
    phase = 'idle';
    await publish();
  }
}

/* ------------------------------------------------------------------ *
 * Replaying queued changes
 * ------------------------------------------------------------------ */

type Outcome = 'done' | 'offline' | 'stop' | { error: string };

async function send(op: OutboxOp): Promise<Outcome> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await call(op.path, { method: op.method, body: op.body, idempotencyKey: op.idempotencyKey });
      return 'done';
    } catch (error) {
      if (error instanceof NetworkError) return 'offline';
      if (!(error instanceof HttpError)) throw error;
      const message = error.message.toLowerCase();
      // Another attempt with this key is still running on the server.
      if (error.status === 409 && message.includes('being processed')) {
        await sleep(1500);
        continue;
      }
      // An earlier attempt already landed, or the thing is already gone.
      if (error.status === 409 && op.method === 'POST' && message.includes('already exists')) return 'done';
      if (error.status === 404 && op.method === 'DELETE') return 'done';
      // Signed out, or new terms to accept: keep the queue and try again later.
      if (error.status === 401 || (error.status === 403 && message.includes('terms'))) return 'stop';
      return { error: error.message };
    }
  }
  return 'offline';
}

async function replay(): Promise<{ synced: number; failed: number; blocked: boolean }> {
  const result = { synced: 0, failed: 0, blocked: false };
  if (!userId) return result;
  const db = await openBackup(userId);
  // Key order is the order the changes were made.
  const ops = (await getAll<OutboxOp>(db, 'outbox')).filter((op) => op.status === 'pending');

  for (const op of ops) {
    const outcome = await send(op);
    if (outcome === 'offline' || outcome === 'stop') {
      result.blocked = true;
      break;
    }
    const tx = db.transaction('outbox', 'readwrite');
    if (outcome === 'done') {
      tx.objectStore('outbox').delete(op.seq!);
      result.synced += 1;
    } else {
      tx.objectStore('outbox').put({ ...op, status: 'failed', error: outcome.error });
      result.failed += 1;
    }
    await txDone(tx);
  }

  if (result.synced || result.failed) post({ type: 'replayed', synced: result.synced, failed: result.failed });
  return result;
}

/* ------------------------------------------------------------------ *
 * Sync
 * ------------------------------------------------------------------ */

function normaliseItem(row: ItemRow): ItemRow {
  return { ...row, storageId: row.storageId ?? row.storage?.id ?? null, storage: null };
}

async function putPlaces(db: IDBDatabase, places: PlaceListItem[]): Promise<void> {
  const tx = db.transaction('places', 'readwrite');
  const store = tx.objectStore('places');
  for (const place of places) {
    const row: PlaceRow = {
      id: place.id,
      name: place.name,
      type: place.type,
      description: place.description,
      ownerId: place.ownerId,
      city: place.city,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
      coverMediaId: place.coverMediaId,
      createdAt: place.createdAt,
      myRole: place.myRole,
      memberCount: place.memberCount,
      members: place.members,
    };
    store.put(row);
  }
  await txDone(tx);
}

async function applyPage(db: IDBDatabase, res: SyncResponse): Promise<void> {
  const tx = db.transaction(['places', 'storages', 'items', 'meta'], 'readwrite');
  const places = tx.objectStore('places');
  const storages = tx.objectStore('storages');
  const items = tx.objectStore('items');

  for (const row of res.places) {
    // Keep the role and member list GET /places gave us; sync rows don't carry them.
    const existing = places.get(row.id);
    existing.onsuccess = () => places.put({ ...(existing.result as PlaceRow | undefined), ...row });
  }
  for (const row of res.storages) storages.put(row);
  for (const row of res.items) items.put(normaliseItem(row));

  for (const id of res.deleted.items) items.delete(id);
  for (const id of res.deleted.storages) storages.delete(id);
  for (const id of res.deleted.places) places.delete(id);

  // Same transaction as the data: if the app dies half-way, this page is redone, never skipped.
  tx.objectStore('meta').put({ key: 'cursor', value: res.serverTime });
  await txDone(tx);
}

/**
 * Removes places no longer visible (with their contents) and, after a full sync, any
 * storage or item the server didn't send. Rows with a queued change are kept.
 */
async function prune(
  db: IDBDatabase,
  visiblePlaces: Set<string>,
  seen: { storages: Set<string>; items: Set<string> } | null,
  keep: Set<string>,
): Promise<void> {
  const tx = db.transaction(['places', 'storages', 'items'], 'readwrite');

  const places = tx.objectStore('places');
  const placeKeys = places.getAllKeys();
  placeKeys.onsuccess = () => {
    for (const key of placeKeys.result) if (!visiblePlaces.has(String(key))) places.delete(key);
  };

  for (const name of ['storages', 'items'] as const) {
    const store = tx.objectStore(name);
    const rows = store.getAll();
    rows.onsuccess = () => {
      for (const row of rows.result as Array<{ id: string; placeId: string }>) {
        if (keep.has(row.id)) continue;
        const lostPlace = !visiblePlaces.has(row.placeId);
        const notOnServer = seen !== null && !(name === 'storages' ? seen.storages : seen.items).has(row.id);
        if (lostPlace || notOnServer) store.delete(row.id);
      }
    };
  }

  await txDone(tx);
}

async function sync(forceFull: boolean): Promise<void> {
  if (!userId) return;
  removed = false;
  const db = await openBackup(userId);

  // Queued changes go first, or the server's older copy would overwrite them on this device.
  const queued = await getAll<OutboxOp>(db, 'outbox');
  if (queued.some((op) => op.status === 'pending')) {
    const result = await replay();
    if (result.blocked) throw new NetworkError('Waiting for a connection to send queued changes.');
  }

  const cursor = await getMeta<string>(db, 'cursor');
  const lastFull = await getMeta<string>(db, 'lastFullSyncAt');
  const full = forceFull || !cursor || !lastFull || Date.now() - Date.parse(lastFull) > FULL_SYNC_EVERY_MS;

  // Roles and members aren't part of sync rows; this is also the list of places still visible.
  const visible = await call<PlaceListItem[]>('/places');
  await putPlaces(db, visible);

  const seen = { storages: new Set<string>(), items: new Set<string>() };
  let since = full ? undefined : cursor;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await call<SyncResponse>(since ? `/sync?since=${encodeURIComponent(since)}` : '/sync');
    await applyPage(db, res);
    if (full) {
      for (const row of res.storages) seen.storages.add(row.id);
      for (const row of res.items) seen.items.add(row.id);
    }
    // The server's clock, never the device's — a drifting phone would skip changes.
    since = res.serverTime;
    if (!res.truncated) break;
  }

  const keep = new Set((await getAll<OutboxOp>(db, 'outbox')).map((op) => op.entityId));
  await prune(db, new Set(visible.map((place) => place.id)), full ? seen : null, keep);

  const now = new Date().toISOString();
  const tx = db.transaction('meta', 'readwrite');
  const meta = tx.objectStore('meta');
  meta.put({ key: 'lastSyncAt', value: now });
  if (full) meta.put({ key: 'lastFullSyncAt', value: now });
  if (me) meta.put({ key: 'me', value: me });
  await txDone(tx);

  post({ type: 'changed' });
}

/* ------------------------------------------------------------------ *
 * Other jobs
 * ------------------------------------------------------------------ */

async function probe(): Promise<void> {
  try {
    await call('/health', { anonymous: true, timeoutMs: 8000 });
    post({ type: 'probe', reachable: true });
  } catch (error) {
    // Any HTTP answer means the server is there; only a missing answer means it isn't.
    post({ type: 'probe', reachable: !(error instanceof NetworkError) });
  }
}

async function discard(seq: number): Promise<void> {
  if (!userId) return;
  const db = await openBackup(userId);
  const op = await getOne<OutboxOp>(db, 'outbox', seq);
  const tx = db.transaction(['outbox', 'storages', 'items', 'meta'], 'readwrite');
  tx.objectStore('outbox').delete(seq);
  // Something that only ever existed on this device goes away with its rejected change.
  if (op?.kind === 'createItem') tx.objectStore('items').delete(op.entityId);
  if (op?.kind === 'createStorage') tx.objectStore('storages').delete(op.entityId);
  // Any other discarded edit leaves a local copy that differs from the server: the next sync
  // is a full one, which puts the server's version back.
  tx.objectStore('meta').delete('lastFullSyncAt');
  await txDone(tx);
  post({ type: 'changed' });
}

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

scope.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      userId = message.userId;
      apiBase = message.apiBase;
      token = message.token;
      me = message.me;
      removed = false;
      void publish();
      break;

    case 'me':
      me = message.me;
      break;

    case 'token':
      token = message.token;
      tokenWaiters.get(message.requestId)?.(message.token);
      tokenWaiters.delete(message.requestId);
      break;

    case 'sync':
      exclusive(() => job('syncing', () => sync(Boolean(message.full))));
      break;

    case 'replay':
      exclusive(() => job('replaying', async () => {
        const result = await replay();
        if (result.blocked) throw new NetworkError('Waiting for a connection to send queued changes.');
        // Created things get their server copy (label codes and so on) from the follow-up sync.
        if (message.thenSync || result.synced > 0) await sync(false);
      }));
      break;

    case 'probe':
      void probe();
      break;

    case 'status':
      void publish();
      break;

    case 'discard':
      exclusive(() => discard(message.seq).then(publish));
      break;

    case 'clear':
      exclusive(async () => {
        if (userId) await deleteBackup(userId);
        removed = true;
        lastError = null;
        await publish();
        post({ type: 'changed' });
      });
      break;
  }
};
