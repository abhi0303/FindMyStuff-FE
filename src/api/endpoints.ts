import { http, request } from './client';
import type {
  ActivityLog, AttentionBuckets, AuthResponse, Friend, Friendship, Item, ItemDetail,
  ItemMovement, ItemStatus, LengthUnit, Media, Me, Paginated, PlaceDetail, PlaceInvite,
  PlaceListItem, PlaceMember, PlaceType, Role, SearchResponse, StorageDeleted,
  StorageDetail, StorageListItem, StorageNode, StorageType, SuccessResponse,
  TokenPair, UserCard, UserProfile, Visibility,
} from './types';

/* ================================================================== *
 * Write DTOs
 *
 * The API runs with `forbidNonWhitelisted`: any field not on the DTO is a 400.
 * That means a GET response can never be PATCHed straight back — these types
 * are deliberately narrow so the compiler catches it.
 * ================================================================== */

export interface SignupDto {
  email: string;
  name: string;
  password: string;
  phone?: string;
  acceptTerms: true;
}

export interface LoginDto { email: string; password: string }

interface Dimensions {
  widthValue?: number;
  lengthValue?: number;
  heightValue?: number;
  lengthUnit?: LengthUnit;
}

export interface CreatePlaceDto extends Dimensions {
  name: string;
  type?: PlaceType;
  description?: string;
  addressLine?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  coverImageBase64?: string;
}
export type UpdatePlaceDto = Partial<CreatePlaceDto>;

export interface CreateStorageDto extends Dimensions {
  name: string;
  type?: StorageType;
  parentId?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  coverImageBase64?: string;
}
/** `parentId: null` moves the storage to the top level. */
export type UpdateStorageDto = Partial<Omit<CreateStorageDto, 'parentId'>> & { parentId?: string | null };

/**
 * What the storage form produces. It covers create and edit in one shape, so
 * `parentId` has to allow null ("move to the top level") even though the create
 * endpoint only ever wants it omitted or set.
 */
export type StorageFormDto = Omit<CreateStorageDto, 'parentId'> & { parentId?: string | null };

export interface CreateItemDto {
  name: string;
  storageId?: string;
  description?: string;
  aliases?: string[];
  tags?: string[];
  category?: string;
  quantity?: number;
  lowStockAt?: number;
  serialNumber?: string;
  visibility?: Visibility;
  latitude?: number;
  longitude?: number;
  purchasedAt?: string;
  expiresAt?: string;
  warrantyUntil?: string;
  remindAt?: string;
  imagesBase64?: string[];
}
/** `storageId: null` marks the item as not put away. */
export type UpdateItemDto = Partial<Omit<CreateItemDto, 'storageId'>> & { storageId?: string | null };

export interface ItemQuery {
  page?: number;
  limit?: number;
  q?: string;
  storageId?: string;
  includeNested?: boolean;
  status?: ItemStatus;
  visibility?: Visibility;
  tag?: string;
  category?: string;
  expiringInDays?: number;
  lowStock?: boolean;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'expiresAt';
  sortOrder?: 'asc' | 'desc';
}

/* ================================================================== *
 * Auth
 * ================================================================== */

export const authApi = {
  signup: (dto: SignupDto) =>
    http.post<AuthResponse>('/auth/signup', dto, { anonymous: true }),

  login: (dto: LoginDto) =>
    http.post<AuthResponse>('/auth/login', dto, { anonymous: true }),

  logout: (refreshToken: string) =>
    http.post<SuccessResponse>('/auth/logout', { refreshToken }, { anonymous: true }),

  logoutAll: () => http.post<SuccessResponse>('/auth/logout-all'),

  /** Keeps working while terms acceptance is pending. */
  me: () => http.get<Me>('/auth/me'),

  acceptTerms: (version?: string) =>
    http.post<SuccessResponse>('/auth/accept-terms', version ? { accept: true, version } : { accept: true }),

  /** Revokes every session — send the user back to login afterwards. */
  changePassword: (currentPassword: string, newPassword: string) =>
    http.post<{ success: boolean; message: string }>('/auth/change-password', { currentPassword, newPassword }),

  refresh: (refreshToken: string) =>
    request<TokenPair>('/auth/refresh', { method: 'POST', body: { refreshToken }, anonymous: true }),
};

/* ================================================================== *
 * Users & friends
 * ================================================================== */

export const userApi = {
  updateProfile: (dto: { name?: string; phone?: string; avatarBase64?: string }) =>
    http.patch<UserProfile>('/users/me', dto),

  deleteAccount: () => http.delete<SuccessResponse>('/users/me'),

  lookup: (email: string) => http.get<UserCard>('/users/lookup', { email }),
};

export const friendsApi = {
  list: () => http.get<Friend[]>('/friends'),
  incoming: () => http.get<Friendship[]>('/friends/requests/incoming'),
  outgoing: () => http.get<Friendship[]>('/friends/requests/outgoing'),
  sendRequest: (dto: { email?: string; userId?: string; message?: string }) =>
    http.post<Friendship>('/friends/requests', dto),
  accept: (id: string) => http.post<Friendship>(`/friends/requests/${id}/accept`),
  reject: (id: string) => http.post<Friendship>(`/friends/requests/${id}/reject`),
  remove: (userId: string) => http.delete<SuccessResponse>(`/friends/${userId}`),
  block: (userId: string) => http.post<SuccessResponse>(`/friends/${userId}/block`),
};

/* ================================================================== *
 * Places
 * ================================================================== */

export const placesApi = {
  list: () => http.get<PlaceListItem[]>('/places'),
  get: (placeId: string) => http.get<PlaceDetail>(`/places/${placeId}`),
  create: (dto: CreatePlaceDto) => http.post<PlaceDetail>('/places', dto),
  update: (placeId: string, dto: UpdatePlaceDto) => http.patch<PlaceDetail>(`/places/${placeId}`, dto),
  remove: (placeId: string) => http.delete<SuccessResponse>(`/places/${placeId}`),
  leave: (placeId: string) => http.post<SuccessResponse>(`/places/${placeId}/leave`),

  activity: (placeId: string, query?: { page?: number; limit?: number }) =>
    http.get<Paginated<ActivityLog>>(`/places/${placeId}/activity`, query),

  members: (placeId: string) => http.get<PlaceMember[]>(`/places/${placeId}/members`),
  addMember: (placeId: string, userId: string, role: Role = 'MEMBER') =>
    http.post<PlaceMember>(`/places/${placeId}/members`, { userId, role }),
  updateMember: (placeId: string, memberId: string, role: Role) =>
    http.patch<PlaceMember>(`/places/${placeId}/members/${memberId}`, { role }),
  removeMember: (placeId: string, memberId: string) =>
    http.delete<SuccessResponse>(`/places/${placeId}/members/${memberId}`),

  invites: (placeId: string) => http.get<PlaceInvite[]>(`/places/${placeId}/invites`),
  createInvite: (placeId: string, dto: { email?: string; phone?: string; role?: Role; expiresInDays?: number }) =>
    http.post<PlaceInvite>(`/places/${placeId}/invites`, dto),
  revokeInvite: (placeId: string, inviteId: string) =>
    http.delete<SuccessResponse>(`/places/${placeId}/invites/${inviteId}`),

  acceptInvite: (code: string) => http.post<PlaceDetail>('/invites/accept', { code }),
};

/* ================================================================== *
 * Storages
 * ================================================================== */

export const storagesApi = {
  tree: (placeId: string) => http.get<StorageNode[]>(`/places/${placeId}/storages/tree`),

  list: (placeId: string, query?: { parentId?: string; type?: StorageType; q?: string; rootOnly?: boolean }) =>
    http.get<StorageListItem[]>(`/places/${placeId}/storages`, query),

  get: (placeId: string, storageId: string) =>
    http.get<StorageDetail>(`/places/${placeId}/storages/${storageId}`),

  create: (placeId: string, dto: CreateStorageDto) =>
    http.post<StorageListItem>(`/places/${placeId}/storages`, dto),

  /** Passing `parentId` moves the storage and everything inside it. */
  update: (placeId: string, storageId: string, dto: UpdateStorageDto) =>
    http.patch<StorageListItem>(`/places/${placeId}/storages/${storageId}`, dto),

  /** Deletes the whole subtree; items inside become unassigned, not deleted. */
  remove: (placeId: string, storageId: string) =>
    http.delete<StorageDeleted>(`/places/${placeId}/storages/${storageId}`),

  /** QR sticker lookup — searches every place you can see. */
  byLabel: (labelCode: string) => http.get<StorageDetail>(`/storages/by-label/${labelCode}`),
};

/* ================================================================== *
 * Items
 * ================================================================== */

export const itemsApi = {
  list: (placeId: string, query?: ItemQuery) =>
    http.get<Paginated<Item>>(`/places/${placeId}/items`, query as Record<string, string | number | boolean | undefined>),

  get: (placeId: string, itemId: string) =>
    http.get<ItemDetail>(`/places/${placeId}/items/${itemId}`),

  create: (placeId: string, dto: CreateItemDto) =>
    http.post<ItemDetail>(`/places/${placeId}/items`, dto),

  update: (placeId: string, itemId: string, dto: UpdateItemDto) =>
    http.patch<ItemDetail>(`/places/${placeId}/items/${itemId}`, dto),

  remove: (placeId: string, itemId: string) =>
    http.delete<SuccessResponse>(`/places/${placeId}/items/${itemId}`),

  history: (placeId: string, itemId: string) =>
    http.get<ItemMovement[]>(`/places/${placeId}/items/${itemId}/history`),

  move: (placeId: string, itemId: string, toStorageId: string | null, note?: string) =>
    http.post<ItemDetail>(`/places/${placeId}/items/${itemId}/move`, { toStorageId, note }),

  lend: (placeId: string, itemId: string, dto: { lentToName: string; lentToId?: string; dueAt?: string }) =>
    http.post<ItemDetail>(`/places/${placeId}/items/${itemId}/lend`, dto),

  returnItem: (placeId: string, itemId: string) =>
    http.post<ItemDetail>(`/places/${placeId}/items/${itemId}/return`),

  /** Across every place — the reminders dashboard. */
  attention: (withinDays = 30) =>
    http.get<AttentionBuckets>('/items/attention', { withinDays }),
};

/* ================================================================== *
 * Search & media
 * ================================================================== */

export const searchApi = {
  search: (
    query: { q: string; placeId?: string; includeStorages?: boolean; includeArchived?: boolean; page?: number; limit?: number },
    signal?: AbortSignal,
  ) => http.get<SearchResponse>('/search', query, signal),
};

export const mediaApi = {
  upload: (base64: string) => http.post<Media>('/media', { base64 }),
  get: (id: string) => http.get<Media>(`/media/${id}`),
  remove: (id: string) => http.delete<SuccessResponse>(`/media/${id}`),
};
