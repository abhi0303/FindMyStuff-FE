/**
 * Hand-authored domain types.
 *
 * `schema.d.ts` is generated from `openapi/api.json` (npm run api:types) and is the
 * source of truth for *shape*, but the backend's Swagger decorators declare nullable
 * fields without a type, so the generator renders them as `Record<string, never> | null`.
 * These types restate the same contract with the real value types.
 */

export type PlaceType = 'HOME' | 'OFFICE' | 'LOCKER' | 'VEHICLE' | 'STORAGE_UNIT' | 'OTHER';

export type StorageType =
  | 'ROOM' | 'ALMIRAH' | 'WARDROBE' | 'CABINET' | 'SHELF' | 'DRAWER' | 'BED' | 'BOX'
  | 'SUITCASE' | 'BAG' | 'FRIDGE' | 'LOFT' | 'RACK' | 'DESK' | 'SAFE' | 'OTHER';

export type ItemStatus = 'AVAILABLE' | 'LENT_OUT' | 'CONSUMED' | 'LOST' | 'DISCARDED';
export type Visibility = 'SHARED' | 'PRIVATE';
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export type MemberStatus = 'INVITED' | 'ACTIVE' | 'REMOVED';
export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED';
export type LengthUnit = 'CM' | 'INCH';

export interface UserCard {
  id: string;
  name: string;
  email: string;
  avatarMediaId: string | null;
}

export interface PlaceCard {
  id: string;
  name: string;
}

/* ---------------- auth ---------------- */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarMediaId: string | null;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  createdAt: string;
}

export interface Me extends UserProfile {
  termsAcceptanceRequired: boolean;
  currentTermsVersion: string;
}

export interface AuthResponse extends TokenPair {
  user: UserProfile;
  termsAcceptanceRequired?: boolean;
  currentTermsVersion?: string;
}

/* ---------------- places ---------------- */

interface PlaceBase {
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
  myRole: Role;
  storageCount: number;
  itemCount: number;
}

export interface PlaceListItem extends PlaceBase {
  memberCount: number;
  members: Array<Pick<UserCard, 'id' | 'name' | 'avatarMediaId'> & { role: Role }>;
}

export interface PlaceDetail extends PlaceBase {
  owner: UserCard;
  members: PlaceMember[];
  addressLine?: string | null;
  widthValue?: number | null;
  lengthValue?: number | null;
  heightValue?: number | null;
  lengthUnit?: LengthUnit | null;
}

export interface PlaceMember {
  id: string;
  role: Role;
  status: MemberStatus;
  joinedAt: string | null;
  user: UserCard;
  invitedBy: UserCard | null;
}

export interface PlaceInvite {
  id: string;
  code: string;
  email: string | null;
  phone: string | null;
  role: Role;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface ActivityLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  actor: UserCard;
  createdAt: string;
}

/* ---------------- storages ---------------- */

interface StorageBase {
  id: string;
  placeId: string;
  parentId: string | null;
  name: string;
  type: StorageType;
  description: string | null;
  /** Ancestor ids, root first, slash-separated. Empty string for a root. */
  path: string;
  /** Depth, 0-based. */
  level: number;
  /** e.g. FMS-3TSCQ8 — render as a QR code for a printable sticker. */
  labelCode: string;
  coverMediaId: string | null;
  createdAt: string;
}

export interface StorageNode extends StorageBase {
  children: StorageNode[];
  itemCount: number;
}

export interface StorageListItem extends StorageBase {
  /** Pre-built, e.g. "Bedroom › Almirah › Top shelf". Render as-is. */
  breadcrumb: string;
  itemCount: number;
}

export interface StorageDetail extends StorageBase {
  breadcrumb: string;
  children: StorageBase[];
  items: Item[];
}

export interface StorageDeleted {
  success: boolean;
  message: string;
  storages: number;
  items: number;
}

/* ---------------- items ---------------- */

export interface ItemStorageRef {
  id: string;
  name: string;
  breadcrumb: string;
}

export interface Item {
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
  storage: ItemStorageRef | null;
  mediaIds: string[];
  updatedAt: string;
  serialNumber?: string | null;
  purchasedAt?: string | null;
  remindAt?: string | null;
}

export interface ItemMovement {
  id: string;
  fromStorageId: string | null;
  toStorageId: string | null;
  /** Breadcrumb snapshotted at move time — stays readable after a rename. */
  fromLabel: string | null;
  toLabel: string | null;
  note: string | null;
  movedBy: UserCard;
  createdAt: string;
}

export interface ItemDetail extends Item {
  owner: UserCard;
  createdBy: UserCard;
  movements: ItemMovement[];
}

/* ---------------- attention ---------------- */

export interface AttentionItem {
  id: string;
  placeId?: string;
  name: string;
  quantity: number;
  expiresAt: string | null;
  warrantyUntil?: string | null;
  lentToName?: string | null;
  dueAt?: string | null;
  lowStockAt?: number | null;
  storage: { id: string; name: string; breadcrumb?: string } | null;
  place: PlaceCard;
}

export interface AttentionBuckets {
  expiring: AttentionItem[];
  warranty: AttentionItem[];
  overdue: AttentionItem[];
  lowStock: AttentionItem[];
}

/* ---------------- search ---------------- */

export interface SearchItemStorage {
  id: string;
  name: string;
  /** Includes the place name — the whole answer to "where did I keep it". */
  breadcrumb: string;
}

export interface SearchItemResult {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  aliases: string[];
  quantity: number;
  status: ItemStatus;
  expiresAt: string | null;
  mediaId: string | null;
  place: PlaceCard;
  storage: SearchItemStorage | null;
  score: number;
}

export interface SearchStorageResult {
  id: string;
  name: string;
  type: StorageType;
  labelCode: string;
  itemCount: number;
  place: PlaceCard;
  breadcrumb: string;
}

export interface SearchResponse {
  query: string;
  items: SearchItemResult[];
  meta: PaginationMeta;
  storages: SearchStorageResult[];
}

/* ---------------- friends ---------------- */

export interface Friend {
  friendshipId: string;
  since: string | null;
  user: UserCard;
}

export interface Friendship {
  id: string;
  status: FriendshipStatus;
  message: string | null;
  requester: UserCard;
  addressee: UserCard;
  respondedAt: string | null;
  createdAt: string;
}

/* ---------------- shared ---------------- */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface Media {
  id: string;
  ownerId: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  checksum: string;
  createdAt: string;
}

export interface SuccessResponse {
  success: boolean;
  message?: string;
}
