import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useUpdateProfile } from '@/hooks/queries';
import { authApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Alert, ErrorAlert } from '@/components/ui/Feedback';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/AuthImage';
import { ImagePicker } from '@/components/ImagePicker';
import { useToast } from '@/components/ui/Toast';
import { ChevronRight, KeyIcon, LinkIcon, LogoutIcon, ShieldIcon, UsersIcon } from '@/components/Icons';
import { formatDate } from '@/lib/format';
import { OfflineSection } from '@/offline/OfflineSection';
import { toMessage } from '@/api/errors';
import './Screens.css';

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const updateProfile = useUpdateProfile();
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
  }, [user]);

  const dirty = name.trim() !== (user?.name ?? '') || phone.trim() !== (user?.phone ?? '') || avatar.length > 0;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await updateProfile.mutateAsync({
        name: name.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(avatar[0] ? { avatarBase64: avatar[0] } : {}),
      });
      await refreshUser();
      setAvatar([]);
      toast.success('Profile saved.');
    } catch (err) {
      setError(toMessage(err));
    }
  };

  if (!user) return null;

  return (
    <div className="stack gap-5">
      <header className="page-header">
        <Avatar name={user.name} mediaId={user.avatarMediaId} size={52} />
        <div className="stack" style={{ minWidth: 0 }}>
          <h1 className="truncate">{user.name}</h1>
          <p className="page-meta truncate">{user.email} · member since {formatDate(user.createdAt)}</p>
        </div>
      </header>

      <form className="stack gap-3" onSubmit={save}>
        <h2 className="section-title">Profile</h2>

        <ErrorAlert message={error} />

        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Phone" optional type="tel" value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+919876543210"
          hint="International format, starting with +."
        />

        <ImagePicker value={avatar} onChange={setAvatar} max={1} label="Profile photo" />

        <Button
          type="submit" variant="primary" loading={updateProfile.isPending} disabled={!dirty}
          style={{ alignSelf: 'flex-start' }}
        >
          Save changes
        </Button>
      </form>

      <section className="stack gap-1">
        <h2 className="section-title">Sharing</h2>
        <nav className="list menu-list">
          <Link to="/friends" className="item-row">
            <span className="icon-tile icon-tile-sm" aria-hidden><UsersIcon size={16} /></span>
            <span className="item-main"><span className="item-name">Friends and requests</span></span>
            <ChevronRight size={16} className="row-chevron" />
          </Link>
          <Link to="/invite" className="item-row">
            <span className="icon-tile icon-tile-sm" aria-hidden><LinkIcon size={16} /></span>
            <span className="item-main"><span className="item-name">Join a place with a code</span></span>
            <ChevronRight size={16} className="row-chevron" />
          </Link>
        </nav>
      </section>

      <OfflineSection />

      <section className="stack gap-1">
        <h2 className="section-title">Security</h2>
        <div className="list menu-list">
          <button type="button" className="item-row" onClick={() => setChangingPassword(true)}>
            <span className="icon-tile icon-tile-sm" aria-hidden><KeyIcon size={16} /></span>
            <span className="item-main"><span className="item-name">Change password</span></span>
            <ChevronRight size={16} className="row-chevron" />
          </button>
          <button type="button" className="item-row" onClick={() => setConfirmLogoutAll(true)}>
            <span className="icon-tile icon-tile-sm" aria-hidden><ShieldIcon size={16} /></span>
            <span className="item-main"><span className="item-name">Sign out everywhere</span></span>
            <ChevronRight size={16} className="row-chevron" />
          </button>
          <button
            type="button"
            className="item-row is-danger"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            <span className="icon-tile icon-tile-sm" aria-hidden><LogoutIcon size={16} /></span>
            <span className="item-main"><span className="item-name">Sign out</span></span>
          </button>
        </div>
      </section>

      <ChangePasswordModal
        open={changingPassword}
        onClose={() => setChangingPassword(false)}
        onDone={async () => {
          // Changing the password revokes every session — including this one.
          toast.success('Password changed. Please sign in again.');
          await logout();
          navigate('/login', { replace: true });
        }}
      />

      <ConfirmDialog
        open={confirmLogoutAll}
        title="Sign out everywhere?"
        destructive
        confirmLabel="Sign out everywhere"
        loading={loggingOutAll}
        message="Every device, including this one, will be signed out."
        onCancel={() => setConfirmLogoutAll(false)}
        onConfirm={async () => {
          setLoggingOutAll(true);
          try {
            await authApi.logoutAll();
          } catch {
            /* the local session is cleared regardless */
          }
          await logout();
          navigate('/login', { replace: true });
        }}
      />
    </div>
  );
}

function ChangePasswordModal({
  open, onClose, onDone,
}: { open: boolean; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await authApi.changePassword(current, next);
      await onDone();
    } catch (err) {
      setError(toMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={submitting} disabled={!current || !next}>
            Change password
          </Button>
        </>
      }
    >
      <div className="stack gap-4">
        <Alert kind="warning">
          This signs you out on every device. You’ll need to sign in again.
        </Alert>
        <ErrorAlert message={error} />
        <Input
          label="Current password" type="password" autoComplete="current-password"
          value={current} onChange={(e) => setCurrent(e.target.value)}
        />
        <Input
          label="New password" type="password" autoComplete="new-password"
          value={next} onChange={(e) => setNext(e.target.value)}
          hint="8+ characters, with an uppercase, a lowercase and a digit."
        />
      </div>
    </Modal>
  );
}
