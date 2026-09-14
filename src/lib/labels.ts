import type { ItemStatus, PlaceType, Role, StorageType } from '@/api/types';

export const PLACE_TYPES: PlaceType[] = ['HOME', 'OFFICE', 'LOCKER', 'VEHICLE', 'STORAGE_UNIT', 'OTHER'];

export const STORAGE_TYPES: StorageType[] = [
  'ROOM', 'ALMIRAH', 'WARDROBE', 'CABINET', 'SHELF', 'DRAWER', 'BED', 'BOX',
  'SUITCASE', 'BAG', 'FRIDGE', 'LOFT', 'RACK', 'DESK', 'SAFE', 'OTHER',
];

export const ROLES: Role[] = ['VIEWER', 'MEMBER', 'ADMIN', 'OWNER'];

export const ITEM_STATUSES: ItemStatus[] = ['AVAILABLE', 'LENT_OUT', 'CONSUMED', 'LOST', 'DISCARDED'];

const titleCase = (value: string) =>
  value.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export const placeTypeLabel = (t: PlaceType) => (t === 'STORAGE_UNIT' ? 'Storage unit' : titleCase(t));
export const storageTypeLabel = (t: StorageType) => titleCase(t);
export const statusLabel = (s: ItemStatus) => (s === 'LENT_OUT' ? 'Lent out' : titleCase(s));
export const roleLabel = (r: Role) => titleCase(r);

export const ROLE_DESCRIPTION: Record<Role, string> = {
  VIEWER: 'Can look, but not change anything.',
  MEMBER: 'Can add, edit and move things.',
  ADMIN: 'Can also manage storages, members and invites.',
  OWNER: 'Full control, including deleting the place.',
};

/* Role gates. The server enforces these regardless — this is only so the UI does
   not offer buttons that are guaranteed to fail. */
const RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export const canEditContents = (role: Role | undefined) => (role ? RANK[role] >= RANK.MEMBER : false);
export const canManagePlace = (role: Role | undefined) => (role ? RANK[role] >= RANK.ADMIN : false);
export const isOwner = (role: Role | undefined) => role === 'OWNER';
