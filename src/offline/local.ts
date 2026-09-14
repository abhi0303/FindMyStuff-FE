/* The on-device backup, answering the same calls as the API.
 *
 * In offline mode the query hooks read from here. Sync rows are raw records, so the
 * derived fields screens expect — breadcrumbs, item counts, the storage tree — are
 * rebuilt from them once per place and reused until the backup changes. */
import { ApiError } from '@/api/errors';
import type { CreateItemDto, CreateStorageDto, ItemQuery, UpdateItemDto } from '@/api/endpoints';
import type {
  AttentionBuckets, AttentionItem, Item, ItemDetail, Paginated, PlaceDetail, PlaceListItem,
  PlaceMember, SearchItemResult, SearchResponse, SearchStorageResult, StorageDetail,
  StorageListItem, StorageNode, StorageType, SuccessResponse, UserCard,
} from '@/api/types';
import { getAll, getOne, openBackup, txDone } from './db';
import { backupUserId, noteOfflineWrite, onOfflineEvent } from './store';
import type { ItemRow, OutboxKind, OutboxOp, PlaceRow, StorageRow } from './types';

const SEP = ' › ';
const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/** A screen asked for something the backup doesn't hold (members, activity, history). */
export async function notInBackup(what: string): Promise<never> {
  throw new ApiError(0, { message: `${what} isn’t part of the offline backup. Switch to live mode to see it.` });
}

/** A write that can't be queued offline. */
export async function needsConnection(action: string): Promise<never> {
  throw new ApiError(0, { message: `${action} needs a connection. Switch to live mode to do this.` });
}

const notFound = () => new ApiError(404, { message: 'Not found' });

async function database(): Promise<IDBDatabase> {
  const id = backupUserId();
  if (!id) throw new ApiError(0, { message: 'There’s no backup on this device.' });
  return openBackup(id);
}

/* ------------------------------------------------------------------ *
 * Per-place index, rebuilt only when the backup changes
 * ------------------------------------------------------------------ */

interface PlaceIndex {
  place: PlaceRow;
  storages: StorageRow[];
  byId: Map<string, StorageRow>;
  /** Parent id (null for rooms) → children, sorted by name. */
  children: Map<string | null, StorageRow[]>;
  items: ItemRow[];
  /** Item id → the storage it is in, or null when unassigned. */
  itemStorage: Map<string, string | null>;
  directCount: Map<string, number>;
  crumb: (storageId: string) => string;
}

let generation = 0;
const indexes = new Map<string, { generation: number; index: Promise<PlaceIndex> }>();

/** The backup changed — derived data is rebuilt on the next read. */
export function invalidateLocalData(): void {
  generation += 1;
  indexes.clear();
}

// The worker wrote to the backup, or the mode flipped: never answer from a stale index.
onOfflineEvent((event) => {
  if (event.type === 'changed' || event.type === 'mode') invalidateLocalData();
});

function placeIndex(placeId: string): Promise<PlaceIndex> {
  const hit = indexes.get(placeId);
  if (hit && hit.generation === generation) return hit.index;
  const index = buildIndex(placeId);
  indexes.set(placeId, { generation, index });
  index.catch(() => indexes.delete(placeId));
  return index;
}

async function buildIndex(placeId: string): Promise<PlaceIndex> {
  const db = await database();
  const [place, storages, items] = await Promise.all([
    getOne<PlaceRow>(db, 'places', placeId),
    getAll<StorageRow>(db, 'storages', placeId),
    getAll<ItemRow>(db, 'items', placeId),
  ]);
  if (!place) throw notFound();

  const byId = new Map(storages.map((storage) => [storage.id, storage]));
  const children = new Map<string | null, StorageRow[]>();
  for (const storage of [...storages].sort((a, b) => a.name.localeCompare(b.name))) {
    const parent = storage.parentId && byId.has(storage.parentId) ? storage.parentId : null;
    const siblings = children.get(parent);
    if (siblings) siblings.push(storage);
    else children.set(parent, [storage]);
  }

  const crumbs = new Map<string, string>();
  const crumb = (storageId: string): string => {
    const cached = crumbs.get(storageId);
    if (cached !== undefined) return cached;
    const names: string[] = [];
    let cursor = byId.get(storageId);
    for (let depth = 0; cursor && depth < 12; depth += 1) {
      names.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    const value = names.join(SEP);
    crumbs.set(storageId, value);
    return value;
  };

  const itemStorage = new Map<string, string | null>();
  const directCount = new Map<string, number>();
  for (const item of items) {
    const storageId = item.storageId ?? item.storage?.id ?? null;
    // An item whose storage is gone is unassigned — the server does the same on delete.
    const valid = storageId && byId.has(storageId) ? storageId : null;
    itemStorage.set(item.id, valid);
    if (valid) directCount.set(valid, (directCount.get(valid) ?? 0) + 1);
  }

  return { place, storages, byId, children, items, itemStorage, directCount, crumb };
}

/* ------------------------------------------------------------------ *
 * Mapping rows to API shapes
 * ------------------------------------------------------------------ */

type StorageBase = Omit<StorageListItem, 'breadcrumb' | 'itemCount'>;

function storageBase(row: StorageRow): StorageBase {
  return {
    id: row.id,
    placeId: row.placeId,
    parentId: row.parentId,
    name: row.name,
    type: row.type,
    description: row.description,
    path: row.path,
    level: row.level,
    // The server assigns label codes; a storage created offline gets one when it syncs.
    labelCode: row.labelCode || 'PENDING',
    coverMediaId: row.coverMediaId,
    createdAt: row.createdAt,
  };
}

function storageRef(index: PlaceIndex, storageId: string | null | undefined) {
  if (!storageId) return null;
  const storage = index.byId.get(storageId);
  return storage ? { id: storage.id, name: storage.name, breadcrumb: index.crumb(storage.id) } : null;
}

function toItem(row: ItemRow, index: PlaceIndex): Item {
  return {
    id: row.id,
    placeId: row.placeId,
    name: row.name,
    description: row.description,
    aliases: row.aliases ?? [],
    tags: row.tags ?? [],
    category: row.category,
    quantity: row.quantity,
    lowStockAt: row.lowStockAt,
    status: row.status,
    visibility: row.visibility,
    ownerId: row.ownerId,
    expiresAt: row.expiresAt,
    warrantyUntil: row.warrantyUntil,
    lentToName: row.lentToName,
    dueAt: row.dueAt,
    storage: storageRef(index, index.itemStorage.get(row.id)),
    mediaIds: row.mediaIds ?? [],
    updatedAt: row.updatedAt,
    serialNumber: row.serialNumber ?? null,
    purchasedAt: row.purchasedAt ?? null,
    remindAt: row.remindAt ?? null,
  };
}

function person(place: PlaceRow, userId: string): UserCard {
  const member = place.members?.find((m) => m.id === userId);
  return { id: userId, name: member?.name ?? 'Someone', email: '', avatarMediaId: member?.avatarMediaId ?? null };
}

function toPlaceListItem(row: PlaceRow, index: PlaceIndex): PlaceListItem {
  const members = row.members ?? [];
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    ownerId: row.ownerId,
    city: row.city,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    coverMediaId: row.coverMediaId,
    createdAt: row.createdAt,
    myRole: row.myRole ?? (row.ownerId === backupUserId() ? 'OWNER' : 'VIEWER'),
    storageCount: index.storages.length,
    itemCount: index.items.length,
    memberCount: row.memberCount ?? Math.max(1, members.length),
    members,
  };
}

/* ------------------------------------------------------------------ *
 * Search scoring
 * ------------------------------------------------------------------ */

const terms = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (a.length < b.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Exact beats prefix beats word-prefix beats substring beats a one-letter typo. */
function textScore(text: string | null | undefined, term: string): number {
  if (!text) return 0;
  const value = text.toLowerCase();
  if (value === term) return 3;
  if (value.startsWith(term)) return 2.5;
  const words = value.split(/[\s\-_,./›()]+/).filter(Boolean);
  if (words.some((word) => word.startsWith(term))) return 2;
  if (value.includes(term)) return 1.5;
  if (term.length >= 4 && words.some((word) => withinOneEdit(word.slice(0, term.length + 1), term) || withinOneEdit(word, term))) {
    return 1;
  }
  return 0;
}

function itemScore(row: ItemRow, queryTerms: string[]): number {
  let total = 0;
  for (const term of queryTerms) {
    const best = Math.max(
      textScore(row.name, term),
      ...(row.aliases ?? []).map((alias) => textScore(alias, term)),
      ...(row.tags ?? []).map((tag) => 0.8 * textScore(tag, term)),
      0.6 * textScore(row.category, term),
      0.4 * textScore(row.description, term),
    );
    if (best === 0) return 0; // every word has to match something
    total += best;
  }
  return total;
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export const localPlaces = {
  async list(): Promise<PlaceListItem[]> {
    const rows = await getAll<PlaceRow>(await database(), 'places');
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return Promise.all(rows.map(async (row) => toPlaceListItem(row, await placeIndex(row.id))));
  },

  async get(placeId: string): Promise<PlaceDetail> {
    const index = await placeIndex(placeId);
    const summary = toPlaceListItem(index.place, index);
    const members: PlaceMember[] = summary.members.map((member) => ({
      id: member.id,
      role: member.role,
      status: 'ACTIVE',
      joinedAt: null,
      user: { id: member.id, name: member.name, email: '', avatarMediaId: member.avatarMediaId },
      invitedBy: null,
    }));
    return { ...summary, owner: person(index.place, index.place.ownerId), members };
  },
};

export const localStorages = {
  async tree(placeId: string): Promise<StorageNode[]> {
    const index = await placeIndex(placeId);
    const build = (parentId: string | null): StorageNode[] =>
      (index.children.get(parentId) ?? []).map((row) => ({
        ...storageBase(row),
        itemCount: index.directCount.get(row.id) ?? 0,
        children: build(row.id),
      }));
    return build(null);
  },

  async list(
    placeId: string,
    filters?: { parentId?: string; type?: StorageType; q?: string; rootOnly?: boolean },
  ): Promise<StorageListItem[]> {
    const index = await placeIndex(placeId);
    let rows = index.storages;
    if (filters?.rootOnly) rows = rows.filter((row) => !row.parentId || !index.byId.has(row.parentId));
    if (filters?.parentId) rows = rows.filter((row) => row.parentId === filters.parentId);
    if (filters?.type) rows = rows.filter((row) => row.type === filters.type);
    const q = filters?.q?.trim().toLowerCase();
    if (q) rows = rows.filter((row) => index.crumb(row.id).toLowerCase().includes(q));
    return rows
      .map((row) => ({ ...storageBase(row), breadcrumb: index.crumb(row.id), itemCount: index.directCount.get(row.id) ?? 0 }))
      .sort((a, b) => a.breadcrumb.localeCompare(b.breadcrumb));
  },

  async get(placeId: string, storageId: string): Promise<StorageDetail> {
    const index = await placeIndex(placeId);
    const row = index.byId.get(storageId);
    if (!row) throw notFound();
    return {
      ...storageBase(row),
      breadcrumb: index.crumb(row.id),
      children: (index.children.get(row.id) ?? []).map(storageBase),
      items: index.items.filter((item) => index.itemStorage.get(item.id) === row.id).map((item) => toItem(item, index)),
    };
  },

  async byLabel(labelCode: string): Promise<StorageDetail> {
    const code = labelCode.trim().toUpperCase();
    const match = (await getAll<StorageRow>(await database(), 'storages')).find((row) => row.labelCode.toUpperCase() === code);
    if (!match) throw notFound();
    return localStorages.get(match.placeId, match.id);
  },
};

function compareItems(sortBy: NonNullable<ItemQuery['sortBy']>, order: 'asc' | 'desc') {
  const direction = order === 'asc' ? 1 : -1;
  // Sync rows have no createdAt; updatedAt is the closest stand-in.
  const field = sortBy === 'expiresAt' ? 'expiresAt' : 'updatedAt';
  return (a: ItemRow, b: ItemRow): number => {
    if (sortBy === 'name') return direction * a.name.localeCompare(b.name);
    const av = a[field] ? Date.parse(a[field] as string) : null;
    const bv = b[field] ? Date.parse(b[field] as string) : null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return direction * (av - bv);
  };
}

export const localItems = {
  async list(placeId: string, query: ItemQuery = {}): Promise<Paginated<Item>> {
    const index = await placeIndex(placeId);
    let rows = index.items;

    if (query.storageId) {
      const scope = new Set([query.storageId]);
      if (query.includeNested !== false) {
        const walk = (id: string) => (index.children.get(id) ?? []).forEach((child) => {
          scope.add(child.id);
          walk(child.id);
        });
        walk(query.storageId);
      }
      rows = rows.filter((row) => {
        const storageId = index.itemStorage.get(row.id);
        return storageId ? scope.has(storageId) : false;
      });
    }
    if (query.q?.trim()) {
      const queryTerms = terms(query.q);
      rows = rows.filter((row) => itemScore(row, queryTerms) > 0);
    }
    if (query.status) rows = rows.filter((row) => row.status === query.status);
    if (query.visibility) rows = rows.filter((row) => row.visibility === query.visibility);
    if (query.tag) rows = rows.filter((row) => row.tags?.includes(query.tag!.toLowerCase()));
    if (query.category) rows = rows.filter((row) => row.category?.toLowerCase() === query.category!.toLowerCase());
    if (query.expiringInDays != null) {
      const horizon = Date.now() + query.expiringInDays * DAY_MS;
      rows = rows.filter((row) => row.expiresAt && Date.parse(row.expiresAt) <= horizon);
    }
    if (query.lowStock) rows = rows.filter((row) => row.lowStockAt != null && row.quantity <= row.lowStockAt);

    rows = [...rows].sort(compareItems(query.sortBy ?? 'updatedAt', query.sortOrder ?? 'desc'));

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
    const total = rows.length;
    const totalPages = Math.ceil(total / limit);
    return {
      data: rows.slice((page - 1) * limit, page * limit).map((row) => toItem(row, index)),
      meta: { page, limit, total, totalPages, hasNext: page < totalPages },
    };
  },

  async get(placeId: string, itemId: string): Promise<ItemDetail> {
    const index = await placeIndex(placeId);
    const row = index.items.find((item) => item.id === itemId);
    if (!row) throw notFound();
    const owner = person(index.place, row.ownerId);
    return { ...toItem(row, index), owner, createdBy: owner, movements: [] };
  },

  async attention(withinDays: number): Promise<AttentionBuckets> {
    const places = await getAll<PlaceRow>(await database(), 'places');
    const now = Date.now();
    const horizon = now + withinDays * DAY_MS;
    const buckets: AttentionBuckets = { expiring: [], warranty: [], overdue: [], lowStock: [] };

    for (const place of places) {
      const index = await placeIndex(place.id);
      for (const row of index.items) {
        const inUse = row.status !== 'CONSUMED' && row.status !== 'DISCARDED' && row.status !== 'LOST';
        const entry = (): AttentionItem => ({
          id: row.id,
          placeId: row.placeId,
          name: row.name,
          quantity: row.quantity,
          expiresAt: row.expiresAt,
          warrantyUntil: row.warrantyUntil,
          lentToName: row.lentToName,
          dueAt: row.dueAt,
          lowStockAt: row.lowStockAt,
          storage: storageRef(index, index.itemStorage.get(row.id)),
          place: { id: place.id, name: place.name },
        });
        if (inUse && row.expiresAt && Date.parse(row.expiresAt) <= horizon) buckets.expiring.push(entry());
        if (inUse && row.warrantyUntil) {
          const until = Date.parse(row.warrantyUntil);
          if (until >= now && until <= horizon) buckets.warranty.push(entry());
        }
        if (row.status === 'LENT_OUT' && row.dueAt && Date.parse(row.dueAt) < now) buckets.overdue.push(entry());
        if (inUse && row.lowStockAt != null && row.quantity <= row.lowStockAt) buckets.lowStock.push(entry());
      }
    }

    const by = (key: 'expiresAt' | 'warrantyUntil' | 'dueAt') => (a: AttentionItem, b: AttentionItem) =>
      Date.parse(a[key] ?? '') - Date.parse(b[key] ?? '');
    buckets.expiring.sort(by('expiresAt'));
    buckets.warranty.sort(by('warrantyUntil'));
    buckets.overdue.sort(by('dueAt'));
    return buckets;
  },
};

export async function localSearch(query: {
  q: string;
  placeId?: string;
  page?: number;
  limit?: number;
}): Promise<SearchResponse> {
  const db = await database();
  const places = query.placeId
    ? [await getOne<PlaceRow>(db, 'places', query.placeId)].filter((place): place is PlaceRow => Boolean(place))
    : await getAll<PlaceRow>(db, 'places');
  const queryTerms = terms(query.q);

  const items: SearchItemResult[] = [];
  const storages: Array<SearchStorageResult & { score: number }> = [];

  for (const place of places) {
    const index = await placeIndex(place.id);
    for (const row of index.items) {
      const score = itemScore(row, queryTerms);
      if (!score) continue;
      const storage = storageRef(index, index.itemStorage.get(row.id));
      items.push({
        id: row.id,
        name: row.name,
        description: row.description,
        tags: row.tags ?? [],
        aliases: row.aliases ?? [],
        quantity: row.quantity,
        status: row.status,
        expiresAt: row.expiresAt,
        mediaId: row.mediaIds?.[0] ?? null,
        place: { id: place.id, name: place.name },
        // Search breadcrumbs include the place name, like the API's.
        storage: storage ? { ...storage, breadcrumb: `${place.name}${SEP}${storage.breadcrumb}` } : null,
        score,
      });
    }
    for (const row of index.storages) {
      const scores = queryTerms.map((term) => textScore(row.name, term));
      if (scores.some((score) => score === 0)) continue;
      storages.push({
        id: row.id,
        name: row.name,
        type: row.type,
        labelCode: row.labelCode || 'PENDING',
        itemCount: index.directCount.get(row.id) ?? 0,
        place: { id: place.id, name: place.name },
        breadcrumb: `${place.name}${SEP}${index.crumb(row.id)}`,
        score: scores.reduce((sum, score) => sum + score, 0),
      });
    }
  }

  items.sort((a, b) => b.score - a.score);
  storages.sort((a, b) => b.score - a.score);

  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
  const totalPages = Math.ceil(items.length / limit);
  return {
    query: query.q,
    items: items.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total: items.length, totalPages, hasNext: page < totalPages },
    storages: storages.slice(0, 10).map((entry) => ({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      labelCode: entry.labelCode,
      itemCount: entry.itemCount,
      place: entry.place,
      breadcrumb: entry.breadcrumb,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Offline writes — saved to the backup and queued for the server
 * ------------------------------------------------------------------ */

const nowIso = () => new Date().toISOString();

function queued(
  kind: OutboxKind, placeId: string, entityId: string, method: OutboxOp['method'],
  path: string, label: string, body?: unknown,
): OutboxOp {
  return {
    kind, placeId, entityId, method, path, label, body,
    idempotencyKey: crypto.randomUUID(),
    createdAt: nowIso(),
    status: 'pending',
  };
}

/** The row change and its queued request land in one transaction — never one without the other. */
async function commit(apply: (tx: IDBTransaction) => void): Promise<void> {
  const db = await database();
  const tx = db.transaction(['storages', 'items', 'outbox'], 'readwrite');
  apply(tx);
  await txDone(tx);
  invalidateLocalData();
  noteOfflineWrite();
}

const lower = (values: string[] | undefined) => (values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);

export const localWrites = {
  async createStorage(placeId: string, dto: CreateStorageDto): Promise<StorageListItem> {
    const index = await placeIndex(placeId);
    const parent = dto.parentId ? index.byId.get(dto.parentId) : undefined;
    // A client id is final from the start, so things added inside this storage offline can reference it.
    const id = crypto.randomUUID();
    const row: StorageRow = {
      id,
      placeId,
      parentId: parent?.id ?? null,
      name: dto.name,
      type: dto.type ?? 'OTHER',
      description: dto.description ?? null,
      path: parent ? (parent.path ? `${parent.path}/${parent.id}` : parent.id) : '',
      level: parent ? parent.level + 1 : 0,
      labelCode: '',
      coverMediaId: null,
      createdAt: nowIso(),
      pending: true,
    };
    await commit((tx) => {
      tx.objectStore('storages').put(row);
      tx.objectStore('outbox').add(
        queued('createStorage', placeId, id, 'POST', `/places/${placeId}/storages`, `Add storage “${dto.name}”`, { ...dto, id }),
      );
    });
    return {
      ...storageBase(row),
      breadcrumb: parent ? `${index.crumb(parent.id)}${SEP}${row.name}` : row.name,
      itemCount: 0,
    };
  },

  async createItem(placeId: string, dto: CreateItemDto): Promise<ItemDetail> {
    await placeIndex(placeId); // 404 for a place that isn't in the backup
    const id = crypto.randomUUID();
    const row: ItemRow = {
      id,
      placeId,
      name: dto.name,
      description: dto.description ?? null,
      aliases: lower(dto.aliases),
      tags: lower(dto.tags),
      category: dto.category ?? null,
      quantity: dto.quantity ?? 1,
      lowStockAt: dto.lowStockAt ?? null,
      status: 'AVAILABLE',
      visibility: dto.visibility ?? 'SHARED',
      ownerId: backupUserId() ?? '',
      expiresAt: dto.expiresAt ?? null,
      warrantyUntil: dto.warrantyUntil ?? null,
      lentToName: null,
      dueAt: null,
      storageId: dto.storageId ?? null,
      // Photos upload with the queued request; they show once it syncs.
      mediaIds: [],
      updatedAt: nowIso(),
      serialNumber: dto.serialNumber ?? null,
      purchasedAt: dto.purchasedAt ?? null,
      remindAt: dto.remindAt ?? null,
      pending: true,
    };
    await commit((tx) => {
      tx.objectStore('items').put(row);
      tx.objectStore('outbox').add(
        queued('createItem', placeId, id, 'POST', `/places/${placeId}/items`, `Add “${dto.name}”`, { ...dto, id }),
      );
    });
    return localItems.get(placeId, id);
  },

  async updateItem(placeId: string, itemId: string, dto: UpdateItemDto): Promise<ItemDetail> {
    const index = await placeIndex(placeId);
    const current = index.items.find((item) => item.id === itemId);
    if (!current) throw notFound();

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined || key === 'imagesBase64') continue;
      patch[key] = key === 'aliases' || key === 'tags' ? lower(value as string[]) : value;
    }
    const next: ItemRow = { ...current, ...patch, updatedAt: nowIso() };

    await commit((tx) => {
      tx.objectStore('items').put(next);
      tx.objectStore('outbox').add(
        queued('updateItem', placeId, itemId, 'PATCH', `/places/${placeId}/items/${itemId}`, `Edit “${next.name}”`, dto),
      );
    });
    return localItems.get(placeId, itemId);
  },

  async moveItem(placeId: string, itemId: string, toStorageId: string | null, note?: string): Promise<ItemDetail> {
    const index = await placeIndex(placeId);
    const current = index.items.find((item) => item.id === itemId);
    if (!current) throw notFound();
    const next: ItemRow = { ...current, storageId: toStorageId, storage: null, updatedAt: nowIso() };

    await commit((tx) => {
      tx.objectStore('items').put(next);
      tx.objectStore('outbox').add(
        queued('moveItem', placeId, itemId, 'POST', `/places/${placeId}/items/${itemId}/move`, `Move “${current.name}”`, { toStorageId, note }),
      );
    });
    return localItems.get(placeId, itemId);
  },

  async deleteItem(placeId: string, itemId: string): Promise<SuccessResponse> {
    const index = await placeIndex(placeId);
    const current = index.items.find((item) => item.id === itemId);
    if (!current) throw notFound();

    const ops = await getAll<OutboxOp>(await database(), 'outbox');
    // Added offline and never sent: cancel its queued changes instead of sending a create then a delete.
    const neverSent = ops.some((op) => op.entityId === itemId && op.kind === 'createItem' && op.status === 'pending');

    await commit((tx) => {
      tx.objectStore('items').delete(itemId);
      const outbox = tx.objectStore('outbox');
      if (neverSent) {
        for (const op of ops) if (op.entityId === itemId && op.seq != null) outbox.delete(op.seq);
      } else {
        outbox.add(queued('deleteItem', placeId, itemId, 'DELETE', `/places/${placeId}/items/${itemId}`, `Delete “${current.name}”`));
      }
    });
    return { success: true };
  },
};
