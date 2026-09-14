import type { ItemQuery } from './endpoints';

/** Central query-key factory so invalidation never guesses at a key shape. */
export const qk = {
  me: ['me'] as const,

  places: ['places'] as const,
  place: (placeId: string) => ['places', placeId] as const,
  placeMembers: (placeId: string) => ['places', placeId, 'members'] as const,
  placeInvites: (placeId: string) => ['places', placeId, 'invites'] as const,
  placeActivity: (placeId: string) => ['places', placeId, 'activity'] as const,

  storageTree: (placeId: string) => ['places', placeId, 'storages', 'tree'] as const,
  storageList: (placeId: string, filters?: unknown) =>
    ['places', placeId, 'storages', 'list', filters ?? null] as const,
  storage: (placeId: string, storageId: string) =>
    ['places', placeId, 'storages', storageId] as const,
  storageByLabel: (labelCode: string) => ['storages', 'by-label', labelCode] as const,

  items: (placeId: string, query?: ItemQuery) => ['places', placeId, 'items', query ?? null] as const,
  item: (placeId: string, itemId: string) => ['places', placeId, 'items', itemId] as const,
  itemHistory: (placeId: string, itemId: string) =>
    ['places', placeId, 'items', itemId, 'history'] as const,

  attention: (withinDays: number) => ['attention', withinDays] as const,
  search: (q: string, placeId?: string) => ['search', q, placeId ?? 'all'] as const,

  friends: ['friends'] as const,
  friendRequestsIn: ['friends', 'requests', 'incoming'] as const,
  friendRequestsOut: ['friends', 'requests', 'outgoing'] as const,
};

/** Anything under a place — used after a write that could shift counts. */
export const placeScope = (placeId: string) => ['places', placeId] as const;
