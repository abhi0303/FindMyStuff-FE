import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  friendsApi, itemsApi, placesApi, searchApi, storagesApi, userApi,
  type CreateItemDto, type CreatePlaceDto, type CreateStorageDto, type ItemQuery,
  type UpdateItemDto, type UpdatePlaceDto, type UpdateStorageDto,
} from '@/api/endpoints';
import { placeScope, qk } from '@/api/keys';
import type { Role, StorageType } from '@/api/types';
import {
  localItems, localPlaces, localSearch, localStorages, localWrites, needsConnection, notInBackup,
} from '@/offline/local';
import { isOffline, noteLiveWrite } from '@/offline/store';

/* Reads go to the live API, or to the backup on this device in offline mode. The offline
   provider resets the query cache whenever the mode flips, so the two never mix. */
function read<T>(offline: () => Promise<T>, live: () => Promise<T>): Promise<T> {
  return isOffline() ? offline() : live();
}

/* A live write is copied into the backup shortly after it succeeds. In offline mode the
   writes that can be queued are saved on the device and sent later; anything else says
   it needs a connection. */
function write<T>(live: () => Promise<T>, offline: (() => Promise<T>) | string): Promise<T> {
  if (isOffline()) return typeof offline === 'string' ? needsConnection(offline) : offline();
  return live().then((result) => {
    noteLiveWrite();
    return result;
  });
}

/* ---------------- places ---------------- */

export function usePlaces() {
  return useQuery({ queryKey: qk.places, queryFn: () => read(localPlaces.list, placesApi.list) });
}

export function usePlace(placeId: string | undefined) {
  return useQuery({
    queryKey: qk.place(placeId!),
    queryFn: () => read(() => localPlaces.get(placeId!), () => placesApi.get(placeId!)),
    enabled: Boolean(placeId),
  });
}

export function useCreatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePlaceDto) => write(() => placesApi.create(dto), 'Adding a place'),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.places }),
  });
}

export function useUpdatePlace(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdatePlaceDto) => write(() => placesApi.update(placeId, dto), 'Editing a place'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.places });
      qc.invalidateQueries({ queryKey: qk.place(placeId) });
    },
  });
}

export function useDeletePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => write(() => placesApi.remove(placeId), 'Deleting a place'),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.places }),
  });
}

export function useLeavePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => write(() => placesApi.leave(placeId), 'Leaving a place'),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.places }),
  });
}

export function usePlaceActivity(placeId: string, page = 1) {
  return useQuery({
    queryKey: [...qk.placeActivity(placeId), page],
    queryFn: () => read(() => notInBackup('Activity'), () => placesApi.activity(placeId, { page, limit: 30 })),
    placeholderData: keepPreviousData,
  });
}

/* ---------------- members & invites ---------------- */

export function usePlaceMembers(placeId: string) {
  return useQuery({
    queryKey: qk.placeMembers(placeId),
    queryFn: () => read(() => notInBackup('The member list'), () => placesApi.members(placeId)),
  });
}

export function useAddMember(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      write(() => placesApi.addMember(placeId, userId, role), 'Adding a member'),
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
      write(() => placesApi.updateMember(placeId, memberId, role), 'Changing a role'),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.placeMembers(placeId) }),
  });
}

export function useRemoveMember(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => write(() => placesApi.removeMember(placeId, memberId), 'Removing a member'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.placeMembers(placeId) });
      qc.invalidateQueries({ queryKey: qk.places });
    },
  });
}

export function usePlaceInvites(placeId: string, enabled = true) {
  return useQuery({
    queryKey: qk.placeInvites(placeId),
    queryFn: () => read(() => notInBackup('Invites'), () => placesApi.invites(placeId)),
    enabled,
  });
}

export function useCreateInvite(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { email?: string; phone?: string; role?: Role; expiresInDays?: number }) =>
      write(() => placesApi.createInvite(placeId, dto), 'Creating an invite'),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.placeInvites(placeId) }),
  });
}

export function useRevokeInvite(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => write(() => placesApi.revokeInvite(placeId, inviteId), 'Revoking an invite'),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.placeInvites(placeId) }),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => write(() => placesApi.acceptInvite(code), 'Joining a place'),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.places }),
  });
}

/* ---------------- storages ---------------- */

export function useStorageTree(placeId: string | undefined) {
  return useQuery({
    queryKey: qk.storageTree(placeId!),
    queryFn: () => read(() => localStorages.tree(placeId!), () => storagesApi.tree(placeId!)),
    enabled: Boolean(placeId),
  });
}

export function useStorageList(
  placeId: string | undefined,
  filters?: { parentId?: string; type?: StorageType; q?: string; rootOnly?: boolean },
) {
  return useQuery({
    queryKey: qk.storageList(placeId!, filters),
    queryFn: () => read(() => localStorages.list(placeId!, filters), () => storagesApi.list(placeId!, filters)),
    enabled: Boolean(placeId),
  });
}

export function useStorage(placeId: string | undefined, storageId: string | undefined) {
  return useQuery({
    queryKey: qk.storage(placeId!, storageId!),
    queryFn: () => read(() => localStorages.get(placeId!, storageId!), () => storagesApi.get(placeId!, storageId!)),
    enabled: Boolean(placeId && storageId),
  });
}

export function useStorageByLabel(labelCode: string | undefined) {
  return useQuery({
    queryKey: qk.storageByLabel(labelCode!),
    queryFn: () => read(() => localStorages.byLabel(labelCode!), () => storagesApi.byLabel(labelCode!)),
    enabled: Boolean(labelCode),
    retry: false,
  });
}

export function useCreateStorage(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateStorageDto) =>
      write(() => storagesApi.create(placeId, dto), () => localWrites.createStorage(placeId, dto)),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeScope(placeId) }),
  });
}

export function useUpdateStorage(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ storageId, dto }: { storageId: string; dto: UpdateStorageDto }) =>
      write(() => storagesApi.update(placeId, storageId, dto), 'Editing a storage'),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeScope(placeId) }),
  });
}

export function useDeleteStorage(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storageId: string) => write(() => storagesApi.remove(placeId, storageId), 'Deleting a storage'),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeScope(placeId) }),
  });
}

/* ---------------- items ---------------- */

export function useItems(placeId: string | undefined, query?: ItemQuery) {
  return useQuery({
    queryKey: qk.items(placeId!, query),
    queryFn: () => read(() => localItems.list(placeId!, query), () => itemsApi.list(placeId!, query)),
    enabled: Boolean(placeId),
    placeholderData: keepPreviousData,
  });
}

export function useItem(placeId: string | undefined, itemId: string | undefined) {
  return useQuery({
    queryKey: qk.item(placeId!, itemId!),
    queryFn: () => read(() => localItems.get(placeId!, itemId!), () => itemsApi.get(placeId!, itemId!)),
    enabled: Boolean(placeId && itemId),
  });
}

export function useItemHistory(placeId: string | undefined, itemId: string | undefined) {
  return useQuery({
    queryKey: qk.itemHistory(placeId!, itemId!),
    queryFn: () => read(() => notInBackup('Move history'), () => itemsApi.history(placeId!, itemId!)),
    enabled: Boolean(placeId && itemId),
  });
}

export function useCreateItem(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateItemDto) =>
      write(() => itemsApi.create(placeId, dto), () => localWrites.createItem(placeId, dto)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: placeScope(placeId) });
      qc.invalidateQueries({ queryKey: qk.places });
    },
  });
}

export function useUpdateItem(placeId: string, itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateItemDto) =>
      write(() => itemsApi.update(placeId, itemId, dto), () => localWrites.updateItem(placeId, itemId, dto)),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeScope(placeId) }),
  });
}

export function useDeleteItem(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      write(() => itemsApi.remove(placeId, itemId), () => localWrites.deleteItem(placeId, itemId)),
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
      write(
        () => itemsApi.move(placeId, itemId, toStorageId, note),
        () => localWrites.moveItem(placeId, itemId, toStorageId, note),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: placeScope(placeId) }),
  });
}

export function useLendItem(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...dto }: { itemId: string; lentToName: string; dueAt?: string }) =>
      write(() => itemsApi.lend(placeId, itemId, dto), 'Lending'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: placeScope(placeId) });
      qc.invalidateQueries({ queryKey: ['attention'] });
    },
  });
}

export function useReturnItem(placeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => write(() => itemsApi.returnItem(placeId, itemId), 'Marking as returned'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: placeScope(placeId) });
      qc.invalidateQueries({ queryKey: ['attention'] });
    },
  });
}

export function useAttention(withinDays = 30) {
  return useQuery({
    queryKey: qk.attention(withinDays),
    queryFn: () => read(() => localItems.attention(withinDays), () => itemsApi.attention(withinDays)),
  });
}

/* ---------------- search ---------------- */

export function useSearch(q: string, placeId?: string, enabled = true) {
  return useQuery({
    queryKey: qk.search(q, placeId),
    queryFn: ({ signal }) =>
      read(() => localSearch({ q, placeId, limit: 30 }), () => searchApi.search({ q, placeId, limit: 30 }, signal)),
    enabled: enabled && q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });
}

/* ---------------- friends ---------------- */

export function useFriends() {
  return useQuery({ queryKey: qk.friends, queryFn: () => read(() => notInBackup('Friends'), friendsApi.list) });
}

export function useIncomingRequests() {
  return useQuery({
    queryKey: qk.friendRequestsIn,
    queryFn: () => read(() => notInBackup('Friend requests'), friendsApi.incoming),
  });
}

export function useOutgoingRequests() {
  return useQuery({
    queryKey: qk.friendRequestsOut,
    queryFn: () => read(() => notInBackup('Friend requests'), friendsApi.outgoing),
  });
}

function useFriendMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => write(() => fn(args), 'Managing friends'),
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
      write(() => userApi.updateProfile(dto), 'Editing your profile'),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}
