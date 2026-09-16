import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { TermsGate } from './TermsGate';
import { Button, LoadingBlock, Spinner } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { RefreshIcon } from '@/components/Icons';
import { rememberInviteCode } from './pendingInvite';

/**
 * Shown while `/auth/me` is in flight. With a backup on the device the app switches to it
 * after a few seconds; with nothing to show, at least say why the wait is happening.
 */
function SigningIn() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="center-fill" role="status">
      <div className="stack gap-3" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Spinner size={26} />
        <span className="text-sm text-muted">Signing you in…</span>
        {slow && (
          <span className="text-xs text-subtle" style={{ maxWidth: '32ch' }}>
            The server sleeps when it’s idle and can take up to a minute to wake up.
          </span>
        )}
      </div>
    </div>
  );
}

export function RequireAuth() {
  const { status, termsRequired, retryBootstrap, logout, offlineUser, enterOffline } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <SigningIn />;

  // The session is intact but the server could not be reached (offline, rate
  // limited, 5xx). Offer a retry rather than signing the user out.
  if (status === 'unreachable') {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 'var(--space-5)' }}>
        <EmptyState
          icon={<RefreshIcon size={24} />}
          title="Can’t reach FindMyStuff"
          description={
            offlineUser
              ? 'You’re still signed in — the server just didn’t answer. Try again, or find your things in the backup on this device.'
              : 'You’re still signed in — the server just didn’t answer. Check your connection and try again.'
          }
          action={
            <div className="stack gap-2" style={{ width: 240 }}>
              <Button variant="primary" block onClick={retryBootstrap}>Try again</Button>
              {offlineUser && (
                <Button variant="secondary" block onClick={enterOffline}>Open offline backup</Button>
              )}
              <Button variant="ghost" block onClick={logout}>Sign out</Button>
            </div>
          }
        />
      </div>
    );
  }

  if (status === 'anonymous') {
    // An invite deep link should survive the trip through signup.
    const match = location.pathname.match(/^\/invite\/([^/]+)/);
    if (match) rememberInviteCode(decodeURIComponent(match[1]));

    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // The API refuses every other authenticated route until the new terms are
  // accepted, so this blocks the whole shell rather than any single screen.
  if (termsRequired) return <TermsGate />;

  return <Outlet />;
}

export function RequireAnonymous() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <LoadingBlock />;
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/'} replace />;
  }
  return <Outlet />;
}
