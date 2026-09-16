import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { onNetworkFailure, onSlowRequest } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { pluralize } from '@/lib/format';
import { getOfflineSnapshot, onOfflineEvent, setMode, startBackup, useOffline } from './store';

/** After "Later" on the reconnect banner, wait before offering again. */
const OFFER_AGAIN_AFTER_MS = 3 * 60_000;

/**
 * Runs the backup for the signed-in account, falls back to the saved copy while the server
 * is waking up, and offers the latest data once it answers.
 */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { status, user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { mode, reason, status: backup } = useOffline();

  const [offerLatest, setOfferLatest] = useState(false);
  const snoozedUntil = useRef(0);

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
            setOfferLatest(false);
            // Drop everything cached from the other source, so live and backup data never mix.
            void qc.resetQueries();
            if (event.mode === 'live') refreshUser().catch(() => undefined);
            break;
          case 'reachable':
            if (!event.reachable || getOfflineSnapshot().mode !== 'offline') break;
            if (Date.now() > snoozedUntil.current) setOfferLatest(true);
            break;
          case 'replayed':
            if (event.synced) toast.success(`${pluralize(event.synced, 'change')} saved to the server.`);
            if (event.failed) {
              toast.error(`${pluralize(event.failed, 'change')} couldn’t be saved. See You → Offline mode.`);
            }
            break;
        }
      }),
    [qc, refreshUser, toast],
  );

  /** Show the saved copy instead of making the user wait for a sleeping server. */
  const showSavedCopy = useCallback(() => {
    const snap = getOfflineSnapshot();
    if (snap.mode === 'offline' || !snap.status.hasBackup) return;
    setMode('offline', { reason: 'auto' });
    toast.push('The server is slow to answer — showing your saved copy meanwhile.');
  }, [toast]);

  // Watch for the server being slow or unreachable while we are reading it live.
  useEffect(() => {
    if (status !== 'authenticated' || mode !== 'live') return;
    const onBrowserOffline = () => showSavedCopy();
    window.addEventListener('offline', onBrowserOffline);
    const stopFailures = onNetworkFailure(showSavedCopy);
    // Fires while a request is still unanswered — a sleeping server never "fails".
    const stopSlow = onSlowRequest(showSavedCopy);
    return () => {
      window.removeEventListener('offline', onBrowserOffline);
      stopFailures();
      stopSlow();
    };
  }, [status, mode, showSavedCopy]);

  // Opened with no connection at all, once we know a backup exists.
  useEffect(() => {
    if (status === 'authenticated' && backup.hasBackup && !navigator.onLine) showSavedCopy();
  }, [status, backup.hasBackup, showSavedCopy]);

  const waiting = mode === 'offline' && reason === 'auto';

  return (
    <>
      {children}

      {offerLatest && mode === 'offline' && (
        <div className="update-banner" role="status">
          <span className="grow">
            {waiting
              ? 'The server is ready — the latest data can be loaded.'
              : 'The server can be reached again.'}
            {backup.pending > 0 && ` ${pluralize(backup.pending, 'change')} waiting to send.`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              snoozedUntil.current = Date.now() + OFFER_AGAIN_AFTER_MS;
              setOfferLatest(false);
            }}
          >
            Later
          </Button>
          <Button size="sm" variant="primary" onClick={() => setMode('live')}>
            {waiting ? 'Show latest' : 'Go live'}
          </Button>
        </div>
      )}
    </>
  );
}
