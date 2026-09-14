import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAcceptInvite } from '@/hooks/queries';
import { takeInviteCode } from '@/auth/pendingInvite';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ErrorAlert } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { LinkIcon } from '@/components/Icons';
import { toMessage } from '@/api/errors';
import './Screens.css';

export default function InviteScreen() {
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const acceptInvite = useAcceptInvite();

  const [code, setCode] = useState(codeParam ?? '');
  const [error, setError] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  const redeem = async (value: string) => {
    setError(null);
    try {
      const place = await acceptInvite.mutateAsync(value.trim().toUpperCase());
      toast.success(`You've joined ${place.name}.`);
      navigate(`/places/${place.id}`, { replace: true });
    } catch (err) {
      setError(toMessage(err));
    }
  };

  // A deep link should just work — redeem it on arrival rather than asking again.
  useEffect(() => {
    const pending = codeParam ?? takeInviteCode();
    if (pending && !autoTried) {
      setAutoTried(true);
      setCode(pending);
      void redeem(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeParam, autoTried]);

  return (
    <div className="stack gap-4" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="stack gap-2" style={{ alignItems: 'center', textAlign: 'center' }}>
        <span className="empty-icon"><LinkIcon size={22} /></span>
        <h1>Join a place</h1>
        <p className="text-muted text-sm">
          Enter the code someone shared with you. Codes are single-use and expire.
        </p>
      </div>

      <ErrorAlert message={error} />

      <form
        className="card card-pad stack gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void redeem(code);
        }}
      >
        <Input
          label="Invite code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="INV-ZJ5Y0YAP"
          className="mono"
          autoCapitalize="characters"
          autoComplete="off"
        />
        <Button
          type="submit" variant="primary" size="lg" block
          loading={acceptInvite.isPending}
          disabled={!code.trim()}
        >
          Join
        </Button>
      </form>
    </div>
  );
}
