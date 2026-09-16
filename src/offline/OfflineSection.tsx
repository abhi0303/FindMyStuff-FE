import { useState } from 'react';
import { Button, Spinner } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { AlertIcon, CloudUploadIcon, RefreshIcon, TrashIcon } from '@/components/Icons';
import { pluralize, relativeTime } from '@/lib/format';
import {
  backupNow, discardFailed, removeBackup, setAutoBackup, setMode, syncQueuedNow, useOffline,
} from './store';
import '@/routes/Screens.css';

/** Profile → Offline mode: the switch, background backup, manual backup and removal. */
export function OfflineSection() {
  const { mode, reason, autoBackup, status } = useOffline();
  const toast = useToast();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const busy = status.phase !== 'idle';
  const offline = mode === 'offline';
  const summary = status.hasBackup
    ? [
      `Saved ${relativeTime(status.lastSyncAt)}`,
      pluralize(status.counts.places, 'place'),
      pluralize(status.counts.storages, 'storage'),
      pluralize(status.counts.items, 'thing'),
    ].join(' · ')
    : 'Nothing is backed up on this device yet.';

  return (
    <section className="stack gap-2" id="offline">
      <div className="stack gap-1">
        <h2 className="section-title">Offline mode</h2>
        <p className="page-meta">
          Keep a copy of your places and things on this device, so you can still find them without a connection.
        </p>
      </div>

      <div className="switch-group">
        <Switch
          checked={offline}
          onChange={(on) => {
            if (on && !status.hasBackup) {
              toast.error('Back up this device first — there’s nothing to show offline yet.');
              return;
            }
            setMode(on ? 'offline' : 'live');
          }}
          label="Use offline mode"
          description={
            offline && reason === 'auto'
              ? 'Showing your saved copy while the server wakes up. It switches back on its own.'
              : offline
                ? 'Showing the backup. Things you add are sent when you go live.'
                : 'Browse the backup instead of the server.'
          }
        />
        <Switch
          checked={autoBackup}
          onChange={setAutoBackup}
          label="Always back up in the background"
          description="Adds, edits and deletes are copied to this device as they happen."
        />
      </div>

      <div className="list menu-list">
        <button type="button" className="item-row" onClick={backupNow} disabled={busy || offline}>
          <span className="icon-tile icon-tile-sm" aria-hidden>
            {busy ? <Spinner size={14} /> : <RefreshIcon size={16} />}
          </span>
          <span className="item-main">
            <span className="item-name">
              {status.phase === 'replaying' ? 'Sending queued changes…' : busy ? 'Backing up…' : 'Back up now'}
            </span>
            <span className="item-meta">{summary}</span>
          </span>
        </button>

        {status.pending > 0 && (
          <button type="button" className="item-row" onClick={syncQueuedNow} disabled={busy || offline}>
            <span className="icon-tile icon-tile-sm" aria-hidden><CloudUploadIcon size={16} /></span>
            <span className="item-main">
              <span className="item-name">{pluralize(status.pending, 'change')} waiting to be sent</span>
              <span className="item-meta">
                {offline ? 'Sent automatically when you go live.' : 'Send them now.'}
              </span>
            </span>
          </button>
        )}

        {status.failed.map((op) => (
          <div key={op.seq} className="item-row">
            <span className="icon-tile icon-tile-sm" aria-hidden style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}>
              <AlertIcon size={16} />
            </span>
            <span className="item-main">
              <span className="item-name">{op.label} couldn’t be saved</span>
              <span className="item-meta">{op.error}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => op.seq != null && discardFailed(op.seq)}>Discard</Button>
          </div>
        ))}

        <button
          type="button"
          className="item-row is-danger"
          onClick={() => setConfirmRemove(true)}
          disabled={!status.hasBackup && status.pending === 0}
        >
          <span className="icon-tile icon-tile-sm" aria-hidden><TrashIcon size={16} /></span>
          <span className="item-main"><span className="item-name">Remove backup from this device</span></span>
        </button>
      </div>

      {status.error && !busy && <p className="text-xs text-subtle">Last attempt: {status.error}</p>}
      <p className="text-xs text-subtle">The backup is stored only on this device and is deleted when you sign out.</p>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove the backup?"
        destructive
        confirmLabel="Remove"
        message={
          status.pending > 0
            ? `This also throws away ${pluralize(status.pending, 'change')} that haven’t been sent yet. Background backup will be turned off.`
            : 'The offline copy on this device will be deleted, and background backup will be turned off.'
        }
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          removeBackup();
          setConfirmRemove(false);
          toast.success('Backup removed from this device.');
        }}
      />
    </section>
  );
}
