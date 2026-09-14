import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useAddMember, useCreateInvite, useFriends, usePlace, usePlaceInvites, usePlaceMembers,
  useRemoveMember, useRevokeInvite, useUpdateMemberRole,
} from '@/hooks/queries';
import { useAuth } from '@/auth/AuthContext';
import type { Role } from '@/api/types';
import { Button, ButtonLink, LoadingBlock } from '@/components/ui/Button';
import { Alert, Badge, EmptyState, ErrorAlert, SkeletonList } from '@/components/ui/Feedback';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/AuthImage';
import { Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { ArrowLeft, LinkIcon, PlusIcon, UsersIcon } from '@/components/Icons';
import { ROLES, ROLE_DESCRIPTION, canManagePlace, roleLabel } from '@/lib/labels';
import { formatDate, relativeTime } from '@/lib/format';
import { toMessage } from '@/api/errors';
import { NotFoundBody } from './NotFoundScreen';
import './Screens.css';

export default function MembersScreen() {
  const { placeId = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const place = usePlace(placeId);
  const members = usePlaceMembers(placeId);
  const canManage = canManagePlace(place.data?.myRole);
  const invites = usePlaceInvites(placeId, canManage);
  const friends = useFriends();

  const addMember = useAddMember(placeId);
  const updateRole = useUpdateMemberRole(placeId);
  const removeMember = useRemoveMember(placeId);
  const createInvite = useCreateInvite(placeId);
  const revokeInvite = useRevokeInvite(placeId);

  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [newInvite, setNewInvite] = useState<{ code: string; expiresAt: string } | null>(null);

  if (place.isLoading) return <LoadingBlock />;
  if (place.isError) return <NotFoundBody what="place" />;

  const activeMemberIds = new Set(members.data?.map((m) => m.user.id));
  const addableFriends = friends.data?.filter((f) => !activeMemberIds.has(f.user.id)) ?? [];

  return (
    <div className="stack gap-4">
      <Link to={`/places/${placeId}`} className="back-link">
        <ArrowLeft size={15} /> {place.data?.name ?? 'Place'}
      </Link>

      <div className="page-head">
        <div>
          <h1>Members</h1>
          <p className="text-muted text-sm">Who can see and change things in {place.data?.name}.</p>
        </div>
      </div>

      {canManage && (
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <Button variant="primary" onClick={() => setAdding(true)}>
            <PlusIcon size={16} /> Add a friend
          </Button>
          <Button variant="secondary" onClick={() => setInviting(true)}>
            <LinkIcon size={16} /> Invite by code
          </Button>
        </div>
      )}

      {members.isLoading ? (
        <SkeletonList rows={3} />
      ) : members.isError ? (
        <ErrorAlert message={toMessage(members.error)} />
      ) : (
        <div className="list">
          {members.data?.map((member) => {
            const isSelf = member.user.id === user?.id;
            const canChange = canManage && !isSelf && member.role !== 'OWNER';

            return (
              <div key={member.id} className="item-row">
                <Avatar name={member.user.name} mediaId={member.user.avatarMediaId} size={40} />

                <div className="item-main">
                  <span className="item-name truncate">
                    {member.user.name}
                    {isSelf && <span className="text-xs text-subtle">(you)</span>}
                  </span>
                  <span className="item-meta truncate">
                    {member.user.email}
                    {member.joinedAt && ` · joined ${formatDate(member.joinedAt)}`}
                  </span>
                </div>

                {canChange ? (
                  <div className="select-wrap" style={{ width: 120, flexShrink: 0 }}>
                    <select
                      className="select"
                      value={member.role}
                      style={{ height: 32, fontSize: 13 }}
                      aria-label={`Role for ${member.user.name}`}
                      onChange={async (e) => {
                        try {
                          await updateRole.mutateAsync({ memberId: member.id, role: e.target.value as Role });
                          toast.success('Role updated.');
                        } catch (err) {
                          toast.error(toMessage(err));
                        }
                      }}
                    >
                      {ROLES.filter((r) => r !== 'OWNER').map((r) => (
                        <option key={r} value={r}>{roleLabel(r)}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <Badge tone={member.role === 'OWNER' ? 'accent' : 'neutral'}>{roleLabel(member.role)}</Badge>
                )}

                {canChange && (
                  <Button
                    size="sm" variant="ghost" iconOnly
                    aria-label={`Remove ${member.user.name}`}
                    onClick={() => setRemovingId(member.id)}
                  >
                    ×
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---- roles key ---- */}
      <section className="card card-pad stack gap-2">
        <span className="section-title">What the roles mean</span>
        {ROLES.map((role) => (
          <div key={role} className="row gap-3 text-sm">
            <span className="semibold" style={{ width: 62, flexShrink: 0 }}>{roleLabel(role)}</span>
            <span className="text-muted">{ROLE_DESCRIPTION[role]}</span>
          </div>
        ))}
      </section>

      {/* ---- pending invites ---- */}
      {canManage && invites.data && invites.data.length > 0 && (
        <section className="stack gap-2">
          <h2 className="section-title">Pending invites</h2>
          <div className="list">
            {invites.data.filter((i) => !i.acceptedAt).map((invite) => (
              <div key={invite.id} className="item-row">
                <span className="item-thumb" aria-hidden><LinkIcon size={18} /></span>
                <div className="item-main">
                  <span className="item-name mono truncate">{invite.code}</span>
                  <span className="item-meta truncate">
                    {invite.email ?? 'Anyone with the code'} · {roleLabel(invite.role)} · expires {relativeTime(invite.expiresAt)}
                  </span>
                </div>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => navigator.clipboard?.writeText(inviteLink(invite.code)).then(
                    () => toast.success('Invite link copied.'),
                    () => toast.error('Could not copy.'),
                  )}
                >
                  Copy
                </Button>
                <Button
                  size="sm" variant="ghost" iconOnly aria-label="Revoke invite"
                  onClick={async () => {
                    try {
                      await revokeInvite.mutateAsync(invite.id);
                      toast.success('Invite revoked.');
                    } catch (err) {
                      toast.error(toMessage(err));
                    }
                  }}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- add a friend ---- */}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add a friend to this place">
        {friends.isLoading ? (
          <SkeletonList rows={3} />
        ) : addableFriends.length ? (
          <div className="list">
            {addableFriends.map((friend) => (
              <div key={friend.user.id} className="item-row">
                <Avatar name={friend.user.name} mediaId={friend.user.avatarMediaId} size={36} />
                <div className="item-main">
                  <span className="item-name truncate">{friend.user.name}</span>
                  <span className="item-meta truncate">{friend.user.email}</span>
                </div>
                <Button
                  size="sm" variant="primary"
                  loading={addMember.isPending}
                  onClick={async () => {
                    try {
                      await addMember.mutateAsync({ userId: friend.user.id, role: 'MEMBER' });
                      toast.success(`${friend.user.name} added.`);
                      setAdding(false);
                    } catch (err) {
                      toast.error(toMessage(err));
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<UsersIcon size={22} />}
            title="No friends to add"
            description="You can only add people you're already friends with. Send a friend request first, or invite them by code."
            action={<ButtonLink to="/friends" variant="primary" onClick={() => setAdding(false)}>Go to friends</ButtonLink>}
          />
        )}
      </Modal>

      {/* ---- invite by code ---- */}
      <InviteModal
        open={inviting}
        onClose={() => {
          setInviting(false);
          setNewInvite(null);
        }}
        created={newInvite}
        submitting={createInvite.isPending}
        onSubmit={async (dto) => {
          try {
            const invite = await createInvite.mutateAsync(dto);
            setNewInvite({ code: invite.code, expiresAt: invite.expiresAt });
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />

      <ConfirmDialog
        open={removingId !== null}
        title="Remove this member?"
        destructive
        confirmLabel="Remove"
        loading={removeMember.isPending}
        message="They'll lose access to everything in this place. Their own private things stay theirs."
        onCancel={() => setRemovingId(null)}
        onConfirm={async () => {
          if (!removingId) return;
          try {
            await removeMember.mutateAsync(removingId);
            toast.success('Member removed.');
            setRemovingId(null);
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />
    </div>
  );
}

function inviteLink(code: string): string {
  // Include the base path, or shared links break when the app lives under /FindMyStuff-FE/.
  return `${window.location.origin}${import.meta.env.BASE_URL}invite/${code}`;
}

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (dto: { email?: string; role: Role; expiresInDays: number }) => void | Promise<void>;
  submitting?: boolean;
  created: { code: string; expiresAt: string } | null;
}

function InviteModal({ open, onClose, onSubmit, submitting, created }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [days, setDays] = useState('7');
  const toast = useToast();

  if (created) {
    const link = inviteLink(created.code);
    return (
      <Modal open={open} onClose={onClose} title="Invite created">
        <div className="stack gap-4">
          <Alert kind="success">
            Single-use code, valid until {formatDate(created.expiresAt)}.
          </Alert>

          <div className="card card-pad stack gap-2" style={{ textAlign: 'center' }}>
            <span className="mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.06em' }}>
              {created.code}
            </span>
            <span className="text-xs text-subtle">They can enter this code, or open the link below.</span>
          </div>

          <div className="stack gap-2">
            <Button
              variant="primary" block
              onClick={() => navigator.clipboard?.writeText(link).then(
                () => toast.success('Link copied.'),
                () => toast.error('Could not copy.'),
              )}
            >
              Copy invite link
            </Button>
            {typeof navigator.share === 'function' && (
              <Button
                variant="secondary" block
                onClick={() => navigator.share({ title: 'Join my place on FindMyStuff', url: link }).catch(() => undefined)}
              >
                Share…
              </Button>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite by code"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="primary" loading={submitting}
            onClick={() => onSubmit({
              email: email.trim() || undefined,
              role,
              expiresInDays: Number(days) || 7,
            })}
          >
            Create invite
          </Button>
        </>
      }
    >
      <div className="stack gap-4">
        <p className="text-sm text-muted">
          For someone who isn’t on FindMyStuff yet — they can sign up and join in one go.
        </p>

        <Input
          label="Their email" optional type="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="mum@example.com"
          hint="If set, only that account can use the code."
        />

        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.filter((r) => r !== 'OWNER').map((r) => (
            <option key={r} value={r}>{roleLabel(r)} — {ROLE_DESCRIPTION[r]}</option>
          ))}
        </Select>

        <Input
          label="Expires in (days)" type="number" min="1" max="90" value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </div>
    </Modal>
  );
}
