/* Offline mode state and the bridge to the backup worker.
 *
 * Plain module state (no React), so the data hooks can ask "live or offline?" inside a
 * query function. Components read it through `useOffline()`. */
import { useSyncExternalStore } from 'react';
import { API_BASE, getFreshAccessToken, onAuthEvent } from '@/api/client';
import { getAccessToken } from '@/api/tokens';
import type { Me } from '@/api/types';
import { backupExists, deleteBackup, getMeta, openBackup } from './db';
import { EMPTY_STATUS, type BackupStatus, type FromWorker, type ToWorker } from './types';

export type DataMode = 'live' | 'offline';

const MODE_KEY = 'fms.dataMode';
const AUTO_KEY = 'fms.autoBackup';
const USER_KEY = 'fms.backupUser';

/** Background backup cadence while the app is open and visible. */
const AUTO_SYNC_EVERY_MS = 5 * 60_000;
/** How often offline mode checks whether the server is reachable again. */
const PROBE_EVERY_MS = 30_000;
/** A burst of live edits becomes one background sync. */
const WRITE_DEBOUNCE_MS = 2500;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage disabled */
  }
}

/* ------------------------------------------------------------------ *
 * Snapshot
 * ------------------------------------------------------------------ */

export interface OfflineSnapshot {
  mode: DataMode;
  /** "Always back up in the background". On unless the user turned it off. */
  autoBackup: boolean;
  status: BackupStatus;
}

let snapshot: OfflineSnapshot = {
  mode: read(MODE_KEY) === 'offline' ? 'offline' : 'live',
  autoBackup: read(AUTO_KEY) !== 'off',
  status: EMPTY_STATUS,
};

const listeners = new Set<() => void>();

function update(patch: Partial<OfflineSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getOfflineSnapshot = (): OfflineSnapshot => snapshot;
export const isOffline = (): boolean => snapshot.mode === 'offline';

export function useOffline(): OfflineSnapshot {
  return useSyncExternalStore(subscribe, getOfflineSnapshot);
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export type OfflineEvent =
  | { type: 'changed' }
  | { type: 'mode'; mode: DataMode }
  | { type: 'reachable'; reachable: boolean }
  | { type: 'replayed'; synced: number; failed: number };

const eventListeners = new Set<(event: OfflineEvent) => void>();

export function onOfflineEvent(listener: (event: OfflineEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

const emit = (event: OfflineEvent) => eventListeners.forEach((listener) => listener(event));

/* ------------------------------------------------------------------ *
 * Worker
 * ------------------------------------------------------------------ */

let worker: Worker | null = null;
let userId: string | null = null;
let autoTimer = 0;
let probeTimer = 0;
let writeTimer = 0;

function send(message: ToWorker): void {
  worker?.postMessage(message);
}

/** The account whose backup is on this device, even before the worker starts. */
export function backupUserId(): string | null {
  return userId ?? read(USER_KEY);
}

const visible = () => document.visibilityState === 'visible';
const shouldAutoSync = () => Boolean(worker) && snapshot.autoBackup && !isOffline() && visible();

function onOnline(): void {
  if (isOffline()) send({ type: 'probe' });
  else send({ type: 'replay', thenSync: snapshot.autoBackup });
}

function onVisibility(): void {
  if (!visible()) return;
  if (isOffline()) {
    send({ type: 'probe' });
    return;
  }
  const last = snapshot.status.lastSyncAt ? Date.parse(snapshot.status.lastSyncAt) : 0;
  if (shouldAutoSync() && Date.now() - last > AUTO_SYNC_EVERY_MS) requestSync();
}

async function handle(message: FromWorker): Promise<void> {
  switch (message.type) {
    case 'need-token': {
      // Only this thread refreshes, behind the client's single in-flight lock.
      let fresh = getAccessToken();
      if (!fresh || fresh === message.expiredToken) {
        fresh = await getFreshAccessToken().catch(() => null);
      }
      send({ type: 'token', requestId: message.requestId, token: fresh });
      break;
    }
    case 'status':
      update({ status: message.status });
      break;
    case 'changed':
      emit({ type: 'changed' });
      break;
    case 'probe':
      emit({ type: 'reachable', reachable: message.reachable });
      break;
    case 'replayed':
      emit({ type: 'replayed', synced: message.synced, failed: message.failed });
      break;
  }
}

export async function startBackup(me: Me): Promise<void> {
  if (userId === me.id) {
    send({ type: 'me', me });
    return;
  }
  stopBackup();
  userId = me.id;

  // A different account on this device: its backup must not stay behind.
  const previous = read(USER_KEY);
  write(USER_KEY, me.id);
  if (previous && previous !== me.id) await deleteBackup(previous).catch(() => undefined);
  if (userId !== me.id) return; // signed out meanwhile

  worker = new Worker(new URL('./sync.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<FromWorker>) => void handle(event.data);
  send({ type: 'init', userId: me.id, apiBase: API_BASE, token: getAccessToken(), me });

  autoTimer = window.setInterval(() => {
    if (shouldAutoSync()) requestSync();
  }, AUTO_SYNC_EVERY_MS);
  probeTimer = window.setInterval(() => {
    if (isOffline() && visible()) send({ type: 'probe' });
  }, PROBE_EVERY_MS);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibility);

  if (isOffline()) send({ type: 'probe' });
  // Sends anything left queued from an earlier offline session, then backs up if that's on.
  else send({ type: 'replay', thenSync: snapshot.autoBackup });
}

export function stopBackup(): void {
  worker?.terminate();
  worker = null;
  userId = null;
  window.clearInterval(autoTimer);
  window.clearInterval(probeTimer);
  window.clearTimeout(writeTimer);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisibility);
  update({ status: EMPTY_STATUS });
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

export function requestSync(full = false): void {
  send({ type: 'sync', full });
}

/** "Back up now" — a full backup, which also clears anything no longer visible to you. */
export function backupNow(): void {
  requestSync(true);
}

export function syncQueuedNow(): void {
  send({ type: 'replay', thenSync: true });
}

/** A write just succeeded against the live API — copy it into the backup shortly. */
export function noteLiveWrite(): void {
  if (!snapshot.autoBackup || isOffline() || !worker) return;
  window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => requestSync(), WRITE_DEBOUNCE_MS);
}

/** A change was saved to the backup while offline — quietly try sending it now. */
export function noteOfflineWrite(): void {
  send(navigator.onLine ? { type: 'replay' } : { type: 'status' });
}

export function setMode(mode: DataMode, options: { sendQueued?: boolean } = {}): void {
  if (mode === snapshot.mode) return;
  write(MODE_KEY, mode === 'offline' ? 'offline' : null);
  update({ mode });
  emit({ type: 'mode', mode });
  // Back to live: send what was queued offline, then catch the backup up.
  if (mode === 'live' && options.sendQueued !== false) send({ type: 'replay', thenSync: true });
}

export function setAutoBackup(on: boolean): void {
  write(AUTO_KEY, on ? null : 'off');
  update({ autoBackup: on });
  if (on && !isOffline()) requestSync();
}

export function discardFailed(seq: number): void {
  send({ type: 'discard', seq });
}

/** Deletes the backup (and anything still queued) and turns background backup off. */
export function removeBackup(): void {
  if (isOffline()) setMode('live', { sendQueued: false });
  setAutoBackup(false);
  if (worker) {
    send({ type: 'clear' });
  } else {
    const id = backupUserId();
    if (id) void deleteBackup(id).catch(() => undefined);
  }
}

/** The signed-in profile saved with the backup — lets the app open without a connection. */
export async function loadOfflineUser(): Promise<Me | null> {
  const id = read(USER_KEY);
  if (!id || !(await backupExists(id).catch(() => false))) return null;
  const db = await openBackup(id);
  return (await getMeta<Me>(db, 'me')) ?? null;
}

// The backup holds private items, so it never outlives the session.
onAuthEvent((event) => {
  if (event !== 'logout') return;
  const id = backupUserId();
  stopBackup();
  write(USER_KEY, null);
  if (snapshot.mode === 'offline') {
    write(MODE_KEY, null);
    update({ mode: 'live' });
  }
  if (id) void deleteBackup(id).catch(() => undefined);
});
