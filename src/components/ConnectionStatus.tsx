import { useEffect, useState } from 'react';
import { getConnectionState, onConnectionChange, type ConnectionState } from '@/api/client';
import { Spinner } from './ui/Button';
import './ConnectionStatus.css';

/**
 * Shown while the HTTP layer is retrying through a sleeping backend. The API is
 * hosted on a tier that spins down when idle, so the first request after a quiet
 * spell can take up to a minute — that is a wait, not an error, and it should
 * look like one.
 */
export function ConnectionStatus() {
  const [state, setState] = useState<ConnectionState>(getConnectionState);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => onConnectionChange(setState), []);

  const since = state.since;
  useEffect(() => {
    if (state.status !== 'retrying' || !since) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - since) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state.status, since]);

  // A single quick retry is invisible on purpose — only a wait worth explaining
  // gets a banner, so a momentary blip does not flash something alarming.
  if (state.status !== 'retrying' || elapsed < 2) return null;

  return (
    <div className="conn-banner" role="status" aria-live="polite">
      <Spinner size={15} />
      <span className="conn-text">
        <strong>Waking the server…</strong>
        <span className="conn-sub">
          It sleeps when idle and can take up to a minute. Retrying ({state.attempt} of{' '}
          {state.maxAttempts}) · {elapsed}s
        </span>
      </span>
    </div>
  );
}
