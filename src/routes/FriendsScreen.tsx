import { useState, type FormEvent } from 'react';
import {
  useAcceptFriendRequest, useFriends, useIncomingRequests, useOutgoingRequests,
  useRejectFriendRequest, useRemoveFriend, useSendFriendRequest,
} from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, EmptyState, ErrorAlert, SkeletonList } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/AuthImage';
import { Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { InboxIcon, UsersIcon } from '@/components/Icons';
import { relativeTime } from '@/lib/format';
import { toMessage } from '@/api/errors';
import './Screens.css';

export default function FriendsScreen() {
  const friends = useFriends();
  const incoming = useIncomingRequests();
  const outgoing = useOutgoingRequests();

  const sendRequest = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const reject = useRejectFriendRequest();
  const removeFriend = useRemoveFriend();

  const toast = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const pendingIn = incoming.data?.filter((r) => r.status === 'PENDING') ?? [];
  const pendingOut = outgoing.data?.filter((r) => r.status === 'PENDING') ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await sendRequest.mutateAsync({ email: email.trim() });
      // If they had already sent you one, the server auto-accepts — say so plainly.
      toast.success('Request sent.');
      setEmail('');
    } catch (err) {
      setError(toMessage(err));
    }
  };

  return (
    <div className="stack gap-4">
      <div className="page-head">
        <div>
          <h1>Friends</h1>
          <p className="text-muted text-sm">
            You can only add friends to a place, so this comes first.
          </p>
        </div>
      </div>

      <form className="card card-pad stack gap-3" onSubmit={submit}>
        <ErrorAlert message={error} />
        <Input
          label="Add someone by email" type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="mum@example.com"
        />
        <Button type="submit" variant="primary" loading={sendRequest.isPending} disabled={!email.trim()}>
          Send friend request
        </Button>
      </form>

      {/* ---- incoming ---- */}
      {pendingIn.length > 0 && (
        <section className="stack gap-2">
          <h2 className="section-title row gap-2">
            <InboxIcon size={14} /> Waiting for you
            <Badge tone="accent">{pendingIn.length}</Badge>
          </h2>
          <div className="list">
            {pendingIn.map((request) => (
              <div key={request.id} className="item-row">
                <Avatar name={request.requester.name} mediaId={request.requester.avatarMediaId} size={40} />
                <div className="item-main">
                  <span className="item-name truncate">{request.requester.name}</span>
                  <span className="item-meta truncate">
                    {request.message ? `“${request.message}”` : request.requester.email}
                  </span>
                </div>
                <Button
                  size="sm" variant="primary" loading={accept.isPending}
                  onClick={async () => {
                    try {
                      await accept.mutateAsync(request.id);
                      toast.success(`You and ${request.requester.name} are now friends.`);
                    } catch (err) {
                      toast.error(toMessage(err));
                    }
                  }}
                >
                  Accept
                </Button>
                <Button
                  size="sm" variant="ghost"
                  onClick={async () => {
                    try {
                      await reject.mutateAsync(request.id);
                    } catch (err) {
                      toast.error(toMessage(err));
                    }
                  }}
                >
                  Ignore
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- friends ---- */}
      <section className="stack gap-2">
        <h2 className="section-title">Your friends</h2>
        {friends.isLoading ? (
          <SkeletonList rows={3} />
        ) : friends.isError ? (
          <ErrorAlert message={toMessage(friends.error)} />
        ) : friends.data?.length ? (
          <div className="list">
            {friends.data.map((friend) => (
              <div key={friend.friendshipId} className="item-row">
                <Avatar name={friend.user.name} mediaId={friend.user.avatarMediaId} size={40} />
                <div className="item-main">
                  <span className="item-name truncate">{friend.user.name}</span>
                  <span className="item-meta truncate">{friend.user.email}</span>
                </div>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setRemoving({ id: friend.user.id, name: friend.user.name })}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<UsersIcon size={22} />}
            title="No friends yet"
            description="Add someone by email above. Once they accept, you can share a place with them."
          />
        )}
      </section>

      {/* ---- outgoing ---- */}
      {pendingOut.length > 0 && (
        <section className="stack gap-2">
          <h2 className="section-title">Sent, waiting for them</h2>
          <div className="list">
            {pendingOut.map((request) => (
              <div key={request.id} className="item-row">
                <Avatar name={request.addressee.name} mediaId={request.addressee.avatarMediaId} size={36} />
                <div className="item-main">
                  <span className="item-name truncate">{request.addressee.name}</span>
                  <span className="item-meta">sent {relativeTime(request.createdAt)}</span>
                </div>
                <Badge tone="neutral">Pending</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      <Alert kind="info">
        Not on FindMyStuff yet? Invite them straight into a place with a code instead — open the
        place, then Members → Invite by code.
      </Alert>

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name}?`}
        destructive
        confirmLabel="Remove"
        loading={removeFriend.isPending}
        message="They'll stay in any place you've already shared with them — remove them there separately."
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await removeFriend.mutateAsync(removing.id);
            toast.success('Friend removed.');
            setRemoving(null);
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />
    </div>
  );
}
