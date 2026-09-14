import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { onConnectionChange, onNetworkFailure } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { pluralize, relativeTime } from '@/lib/format';
import { getOfflineSnapshot, onOfflineEvent, setMode, startBackup, useOffline } from './store';

/** A request still retrying after this long counts as "can't reach the server". */
const TROUBLE_AFTER_MS = 6000;
/** After "Keep trying", don't ask again for a while. */
const ASK_OFFLINE_AGAIN_AFTER_MS = 2 * 60_000;
/** After "Stay offline", don't ask again for a while. */
const ASK_LIVE_AGAIN_AFTER_MS = 5 * 60_000;

type Prompt = 'go-offline' | 'go-live' | null;

/**
 * Runs the backup for the signed-in account and handles the switch between live and
 * offline: it asks to go offline when the server can't be reached, and to go live again
 * once it can.
 */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { status, user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { mode, status: backup } = useOffline();

  const [prompt, setPrompt] = useState<Prompt>(null);
  const snoozed = useRef({ offline: 0, live: 0 });
  /** In offline mode: has the server been unreachable? Only then offer to go live. */
  const lostConnection = useRef(false);

  useEffect(() => {
    if (status === 'authenticated' && user) void startBackup(user);
  }, [status, user]);

  useEffect(
    () =>
      onOfflineEvent((event) => {
        switch (event.type) {
          case 'changed':
            // local.ts has already dropped its cache. Only screens reading the backup need to
            // refresh; live screens are unaffected.
            if (getOfflineSnapshot().mode === 'offline') void qc.invalidateQueries();
            break;
          case 'mode':
            setPrompt(null);
            // Drop everything cached from the other source, so live and backup data never mix.
            void qc.resetQueries();
            if (event.mode === 'live') {
              lostConnection.current = false;
              refreshUser().catch(() => undefined);
            }
            break;
          case 'reachable':
            if (getOfflineSnapshot().mode !== 'offline') break;
            if (!event.reachable) lostConnection.current = true;
            else if (lostConnection.current && Date.now() > snoozed.current.live) setPrompt('go-live');
            break;
          case 'replayed':
            if (event.synced) toast.success(`${pluralize(event.synced, 'offline change')} saved to the server.`);
            if (event.failed) {
              toast.error(`${pluralize(event.failed, 'offline change')} couldn’t be saved. See You → Offline mode.`);
            }
            break;
        }
      }),
    [qc, refreshUser, toast],
  );

  const askToGoOffline = useCallback(() => {
    const snap = getOfflineSnapshot();
    if (snap.mode === 'offline' || !snap.status.hasBackup) return;
    if (Date.now() < snoozed.current.offline) return;
    setPrompt((current) => current ?? 'go-offline');
  }, []);

  // Live mode: watch for the connection dropping.
  useEffect(() => {
    if (status !== 'authenticated' || mode !== 'live') return;
    let timer = 0;
    const onBrowserOffline = () => askToGoOffline();
    window.addEventListener('offline', onBrowserOffline);
    const stopFailures = onNetworkFailure(askToGoOffline);
    const stopRetries = onConnectionChange((state) => {
      window.clearTimeout(timer);
      if (state.status !== 'retrying') return;
      const waited = Date.now() - (state.since ?? Date.now());
      timer = window.setTimeout(askToGoOffline, Math.max(0, TROUBLE_AFTER_MS - waited));
    });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('offline', onBrowserOffline);
      stopFailures();
      stopRetries();
    };
  }, [status, mode, askToGoOffline]);

  // Opened without a connection, as soon as we know a backup exists.
  useEffect(() => {
    if (status === 'authenticated' && backup.hasBackup && !navigator.onLine) askToGoOffline();
  }, [status, backup.hasBackup, askToGoOffline]);

  const goOffline = () => {
    lostConnection.current = true;
    setPrompt(null);
    setMode('offline');
    toast.push('Offline mode — showing the backup on this device.');
  };

  const keepTrying = () => {
    snoozed.current.offline = Date.now() + ASK_OFFLINE_AGAIN_AFTER_MS;
    setPrompt(null);
  };

  const goLive = () => {
    setPrompt(null);
    setMode('live');
  };

  const stayOffline = () => {
    snoozed.current.live = Date.now() + ASK_LIVE_AGAIN_AFTER_MS;
    setPrompt(null);
  };

  return (
    <>
      {children}

      <Modal
        open={prompt === 'go-offline'}
        onClose={keepTrying}
        title="Can’t reach the server"
        footer={
          <>
            <Button variant="secondary" onClick={keepTrying}>Keep trying</Button>
            <Button variant="primary" onClick={goOffline}>Use offline mode</Button>
          </>
        }
      >
        <p className="text-muted" style={{ fontSize: 14 }}>
          Your connection seems to be down. Switch to offline mode to find your things in the backup on this
          device{backup.lastSyncAt ? `, saved ${relativeTime(backup.lastSyncAt)}` : ''}. Anything you add
          is sent once you’re back online.
        </p>
      </Modal>

      <Modal
        open={prompt === 'go-live'}
        onClose={stayOffline}
        title="You’re back online"
        footer={
          <>
            <Button variant="secondary" onClick={stayOffline}>Stay offline</Button>
            <Button variant="primary" onClick={goLive}>Go live</Button>
          </>
        }
      >
        <p className="text-muted" style={{ fontSize: 14 }}>
          The server can be reached again. Switch to live mode to see the latest
          {backup.pending > 0 ? ` and send ${pluralize(backup.pending, 'change')} you made offline` : ''}.
        </p>
      </Modal>
    </>
  );
}
