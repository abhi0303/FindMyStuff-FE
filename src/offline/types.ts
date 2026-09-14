import type { ItemStatus, Me, PlaceListItem, PlaceType, Role, StorageType, Visibility } from '@/api/types';

/* ------------------------------------------------------------------ *
 * Rows as stored in the on-device backup
 *
 * Sync rows are raw records. Places also carry the role and member list from
 * GET /places (sync rows don't have them), and anything created on this device
 * is marked `pending` until the server's copy arrives.
 * ------------------------------------------------------------------ */

export interface PlaceRow {
  id: string;
  name: string;
  type: PlaceType;
  description: string | null;
  ownerId: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  coverMediaId: string | null;
  createdAt: string;
  myRole?: Role;
  memberCount?: number;
  members?: PlaceListItem['members'];
}

export interface StorageRow {
  id: string;
  placeId: string;
  parentId: string | null;
  name: string;
  type: StorageType;
  description: string | null;
  path: string;
  level: number;
  labelCode: string;
  coverMediaId: string | null;
  createdAt: string;
  pending?: boolean;
}

export interface ItemRow {
  id: string;
  placeId: string;
  name: string;
  description: string | null;
  aliases: string[];
  tags: string[];
  category: string | null;
  quantity: number;
  lowStockAt: number | null;
  status: ItemStatus;
  visibility: Visibility;
  ownerId: string;
  expiresAt: string | null;
  warrantyUntil: string | null;
  lentToName: string | null;
  dueAt: string | null;
  /** Sync rows reference their storage as `storage: { id, … }`; stored rows keep just the id. */
  storageId: string | null;
  storage?: { id: string } | null;
  mediaIds: string[];
  updatedAt: string;
  serialNumber?: string | null;
  purchasedAt?: string | null;
  remindAt?: string | null;
  pending?: boolean;
}

export interface SyncResponse {
  serverTime: string;
  places: PlaceRow[];
  storages: StorageRow[];
  items: ItemRow[];
  deleted: { places: string[]; storages: string[]; items: string[] };
  truncated: boolean;
}

/* ------------------------------------------------------------------ *
 * Changes queued while offline
 * ------------------------------------------------------------------ */

export type OutboxKind = 'createStorage' | 'createItem' | 'updateItem' | 'moveItem' | 'deleteItem';

export interface OutboxOp {
  /** Auto-increment key — replay order is the order the changes were made. */
  seq?: number;
  kind: OutboxKind;
  entityId: string;
  placeId: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /** Generated when queued and sent unchanged on every retry, so a retry never duplicates. */
  idempotencyKey: string;
  /** Short description for the UI, e.g. Add “Passport”. */
  label: string;
  createdAt: string;
  status: 'pending' | 'failed';
  error?: string;
}

/* ------------------------------------------------------------------ *
 * Worker status and messages
 * ------------------------------------------------------------------ */

export interface BackupStatus {
  phase: 'idle' | 'syncing' | 'replaying';
  hasBackup: boolean;
  lastSyncAt: string | null;
  lastFullSyncAt: string | null;
  counts: { places: number; storages: number; items: number };
  /** Changes waiting to be sent. */
  pending: number;
  /** Changes the server rejected — shown so they can be discarded. */
  failed: OutboxOp[];
  error: string | null;
}

export const EMPTY_STATUS: BackupStatus = {
  phase: 'idle',
  hasBackup: false,
  lastSyncAt: null,
  lastFullSyncAt: null,
  counts: { places: 0, storages: 0, items: 0 },
  pending: 0,
  failed: [],
  error: null,
};

export type ToWorker =
  | { type: 'init'; userId: string; apiBase: string; token: string | null; me: Me }
  | { type: 'me'; me: Me }
  | { type: 'token'; requestId: number; token: string | null }
  | { type: 'sync'; full?: boolean }
  | { type: 'replay'; thenSync?: boolean }
  | { type: 'probe' }
  | { type: 'status' }
  | { type: 'discard'; seq: number }
  | { type: 'clear' };

export type FromWorker =
  | { type: 'need-token'; requestId: number; expiredToken: string | null }
  | { type: 'status'; status: BackupStatus }
  | { type: 'changed' }
  | { type: 'probe'; reachable: boolean }
  | { type: 'replayed'; synced: number; failed: number };
