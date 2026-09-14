import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  friendsApi, itemsApi, placesApi, searchApi, storagesApi, userApi,
  type CreateItemDto, type CreatePlaceDto, type CreateStorageDto, type ItemQuery,
  type UpdateItemDto, type UpdatePlaceDto, type UpdateStorageDto,
} from '@/api/endpoints';
import { placeScope, qk } from '@/api/keys';
import type { Role, StorageType } from '@/api/types';

/* ---------------- places ---------------- */

export function usePlaces() {
  return useQuery({ queryKey: qk.places, queryFn: placesApi.list });
}

export function usePlace(placeId: string | undefined) {
  return useQuery({
    queryKey: qk.place(placeId!),
    queryFn: () => placesApi.get(placeId!),
    enabled: Boolean(placeId),
  });
}

export function useCreatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePlaceDto) => placesApi.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.places }),
  });
}

export function useUpdatePlace(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdatePlaceDto) => placesApi.update(placeId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.places });
      qc.invalidateQueries({ queryKey: qk.place(placeId) });
    },
  });
}

export function useDeletePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => placesApi.remove(placeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.places }),
  });
}

export function useLeavePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => placesApi.leave(placeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.places }),
  });
}

export function usePlaceActivity(placeId: string, page = 1) {
  return useQuery({
    queryKey: [...qk.placeActivity(placeId), page],
    queryFn: () => placesApi.activity(placeId, { page, limit: 30 }),
    placeholderData: keepPreviousData,
  });
}

/* ---------------- members & invites ---------------- */

export function usePlaceMembers(placeId: string) {
  return useQuery({ queryKey: qk.placeMembers(placeId), queryFn: () => placesApi.members(placeId) });
}

export function useAddMember(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      placesApi.addMember(placeId, userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.placeMembers(placeId) });
      qc.invalidateQueries({ queryKey: qk.places });
    },
  });
}

export function useUpdateMemberRole(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Role }) =>
      placesApi.updateMember(placeId, memberId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.placeMembers(placeId) }),
  });
}

export function useRemoveMember(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => placesApi.removeMember(placeId, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.placeMembers(placeId) });
      qc.invalidateQueries({ queryKey: qk.places });
    },
  });
}

export function usePlaceInvites(placeId: string, enabled = true) {
  return useQuery({
    queryKey: qk.placeInvites(placeId),
    queryFn: () => placesApi.invites(placeId),
    enabled,
  });
}

export function useCreateInvite(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { email?: string; phone?: string; role?: Role; expiresInDays?: number }) =>
      placesApi.createInvite(placeId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.placeInvites(placeId) }),
  });
}

export function useRevokeInvite(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => placesApi.revokeInvite(placeId, inviteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.placeInvites(placeId) }),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => placesApi.acceptInvite(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.places }),
  });
}

/* ---------------- storages ---------------- */

export function useStorageTree(placeId: string | undefined) {
  return useQuery({
    queryKey: qk.storageTree(placeId!),
    queryFn: () => storagesApi.tree(placeId!),
    enabled: Boolean(placeId),
  });
}

export function useStorageList(
  placeId: string | undefined,
  filters?: { parentId?: string; type?: StorageType; q?: string; rootOnly?: boolean },
) {
  return useQuery({
    queryKey: qk.storageList(placeId!, filters),
    queryFn: () => storagesApi.list(placeId!, filters),
    enabled: Boolean(placeId),
  });
}

export function useStorage(placeId: string | undefined, storageId: string | undefined) {
  return useQuery({
    queryKey: qk.storage(placeId!, storageId!),
    queryFn: () => storagesApi.get(placeId!, storageId!),
    enabled: Boolean(placeId && storageId),
  });
}

export function useStorageByLabel(labelCode: string | undefined) {
  return useQuery({
    queryKey: qk.storageByLabel(labelCode!),
    queryFn: () => storagesApi.byLabel(labelCode!),
    enabled: Boolean(labelCode),
    retry: false,
  });
}

export function useCreateStorage(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateStorageDto) => storagesApi.create(placeId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeScope(placeId) }),
  });
}

export function useUpdateStorage(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storageId, dto }: { storageId: string; dto: UpdateStorageDto }) =>
      storagesApi.update(placeId, storageId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeScope(placeId) }),
  });
}

export function useDeleteStorage(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storageId: string) => storagesApi.remove(placeId, storageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeScope(placeId) }),
  });
}

/* ---------------- items ---------------- */

export function useItems(placeId: string | undefined, query?: ItemQuery) {
  return useQuery({
    queryKey: qk.items(placeId!, query),
    queryFn: () => itemsApi.list(placeId!, query),
    enabled: Boolean(placeId),
    placeholderData: keepPreviousData,
  });
}

export function useItem(placeId: string | undefined, itemId: string | undefined) {
  return useQuery({
    queryKey: qk.item(placeId!, itemId!),
    queryFn: () => itemsApi.get(placeId!, itemId!),
    enabled: Boolean(placeId && itemId),
  });
}

export function useItemHistory(placeId: string | undefined, itemId: string | undefined) {
  return useQuery({
    queryKey: qk.itemHistory(placeId!, itemId!),
    queryFn: () => itemsApi.history(placeId!, itemId!),
    enabled: Boolean(placeId && itemId),
  });
}

export function useCreateItem(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateItemDto) => itemsApi.create(placeId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: placeScope(placeId) });
      qc.invalidateQueries({ queryKey: qk.places });
    },
  });
}

export function useUpdateItem(placeId: string, itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateItemDto) => itemsApi.update(placeId, itemId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeScope(placeId) }),
  });
}

export function useDeleteItem(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => itemsApi.remove(placeId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: placeScope(placeId) });
      qc.invalidateQueries({ queryKey: qk.places });
    },
  });
}

export function useMoveItem(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, toStorageId, note }: { itemId: string; toStorageId: string | null; note?: string }) =>
      itemsApi.move(placeId, itemId, toStorageId, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeScope(placeId) }),
  });
}

export function useLendItem(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...dto }: { itemId: string; lentToName: string; dueAt?: string }) =>
      itemsApi.lend(placeId, itemId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: placeScope(placeId) });
      qc.invalidateQueries({ queryKey: ['attention'] });
    },
  });
}

export function useReturnItem(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => itemsApi.returnItem(placeId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: placeScope(placeId) });
      qc.invalidateQueries({ queryKey: ['attention'] });
    },
  });
}

export function useAttention(withinDays = 30) {
  return useQuery({
    queryKey: qk.attention(withinDays),
    queryFn: () => itemsApi.attention(withinDays),
  });
}

/* ---------------- search ---------------- */

export function useSearch(q: string, placeId?: string, enabled = true) {
  return useQuery({
    queryKey: qk.search(q, placeId),
    queryFn: ({ signal }) => searchApi.search({ q, placeId, limit: 30 }, signal),
    enabled: enabled && q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });
}

/* ---------------- friends ---------------- */

export function useFriends() {
  return useQuery({ queryKey: qk.friends, queryFn: friendsApi.list });
}

export function useIncomingRequests() {
  return useQuery({ queryKey: qk.friendRequestsIn, queryFn: friendsApi.incoming });
}

export function useOutgoingRequests() {
  return useQuery({ queryKey: qk.friendRequestsOut, queryFn: friendsApi.outgoing });
}

function useFriendMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends'] }),
  });
}

export const useSendFriendRequest = () =>
  useFriendMutation((dto: { email?: string; userId?: string; message?: string }) =>
    friendsApi.sendRequest(dto));
export const useAcceptFriendRequest = () => useFriendMutation((id: string) => friendsApi.accept(id));
export const useRejectFriendRequest = () => useFriendMutation((id: string) => friendsApi.reject(id));
export const useRemoveFriend = () => useFriendMutation((userId: string) => friendsApi.remove(userId));

/* ---------------- profile ---------------- */

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { name?: string; phone?: string; avatarBase64?: string }) =>
      userApi.updateProfile(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}
