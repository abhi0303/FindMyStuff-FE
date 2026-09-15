import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useDeleteItem, useItem, useItemHistory, useLendItem, useMoveItem, usePlace, useReturnItem,
} from '@/hooks/queries';
import { useAuth } from '@/auth/AuthContext';
import { Button, LoadingBlock } from '@/components/ui/Button';
import { Alert, Chip, ErrorAlert, SkeletonList } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { AuthImage, Avatar } from '@/components/ui/AuthImage';
import { Breadcrumb } from '@/components/Breadcrumb';
import { MoveItemModal } from '@/components/MoveItemModal';
import { LendItemModal } from '@/components/LendItemModal';
import { ImageViewer } from '@/components/ImageViewer';
import { ExpiryBadge, StatusBadge } from '@/components/ItemRow';
import { useToast } from '@/components/ui/Toast';
import {
  ArrowLeft, EditIcon, HandIcon, ImageOffIcon, LockIcon, MapPinIcon, MoveIcon, TrashIcon,
} from '@/components/Icons';
import { useMissingMedia } from '@/api/media';
import { canEditContents, statusLabel } from '@/lib/labels';
import { formatDate, formatDateTime, pluralize, relativeTime } from '@/lib/format';
import { toMessage } from '@/api/errors';
import { NotFoundBody } from './NotFoundScreen';
import './Screens.css';

export default function ItemDetailScreen() {
  const { placeId = '', itemId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const place = usePlace(placeId);
  const item = useItem(placeId, itemId);
  const history = useItemHistory(placeId, itemId);

  const moveItem = useMoveItem(placeId);
  const lendItem = useLendItem(placeId);
  const returnItem = useReturnItem(placeId);
  const deleteItem = useDeleteItem(placeId);

  const [moving, setMoving] = useState(false);
  const [lending, setLending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const missingPhotos = useMissingMedia(item.data?.mediaIds ?? []);

  if (item.isLoading) return <LoadingBlock />;
  if (item.isError) return <NotFoundBody what="thing" />;
  if (!item.data) return null;

  const data = item.data;
  const canEdit = canEditContents(place.data?.myRole);
  const isMine = data.ownerId === user?.id;
  // The viewer only pages through photos that can actually be shown.
  const viewable = data.mediaIds.filter((mediaId) => !missingPhotos.includes(mediaId));

  return (
    <div className="stack gap-4">
      <Link
        to={data.storage ? `/places/${placeId}/storages/${data.storage.id}` : `/places/${placeId}?tab=things`}
        className="back-link"
      >
        <ArrowLeft size={15} /> {data.storage?.name ?? place.data?.name ?? 'Back'}
      </Link>

      <header className="stack gap-3">
        <div className="stack gap-1">
          <h1>{data.name}</h1>
          <div className="row wrap gap-1">
            <StatusBadge status={data.status} />
            <ExpiryBadge expiresAt={data.expiresAt} />
          </div>
        </div>

        {/* Where it is — the single most useful line on this screen. */}
        <div className="where">
          <MapPinIcon size={16} />
          <div className="stack gap-1" style={{ minWidth: 0 }}>
            <span className="where-label">Kept in</span>
            <Breadcrumb value={data.storage?.breadcrumb} />
          </div>
        </div>

        {data.visibility === 'PRIVATE' && (
          <Alert kind="info">
            <span className="row gap-2">
              <LockIcon size={15} />
              Only visible to you — no one else in this place can see it.
            </span>
          </Alert>
        )}

        {data.status === 'LENT_OUT' && (
          <Alert kind="warning">
            With <strong>{data.lentToName}</strong>
            {data.dueAt && <> · due {relativeTime(data.dueAt)}</>}
          </Alert>
        )}
      </header>

      {data.mediaIds.length > 0 && (
        <div className="stack gap-2">
          <div className="detail-gallery">
            {/* Small versions here; tapping opens the full-size photo. */}
            {data.mediaIds.map((mediaId) => {
              if (missingPhotos.includes(mediaId)) {
                return (
                  <span key={mediaId} className="gallery-missing" title="This photo is no longer available">
                    <ImageOffIcon size={20} />
                    Unavailable
                  </span>
                );
              }
              const index = viewable.indexOf(mediaId);
              return (
                <button
                  key={mediaId}
                  type="button"
                  className="gallery-thumb"
                  onClick={() => setViewing(index)}
                  aria-label={`Open photo ${index + 1} of ${viewable.length}`}
                >
                  <AuthImage mediaId={mediaId} alt={data.name} />
                </button>
              );
            })}
          </div>
          {missingPhotos.length > 0 && (
            <p className="page-meta">
              {pluralize(missingPhotos.length, 'photo')} can’t be shown any more.
              {canEdit && (
                <>
                  {' '}
                  <Link to={`/places/${placeId}/items/${itemId}/edit`}>
                    Add {missingPhotos.length === 1 ? 'it' : 'them'} again
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
      )}
      <ImageViewer mediaIds={viewable} index={viewing} onIndexChange={setViewing} alt={data.name} />

      {/* ---- actions ---- */}
      {canEdit && (
        <div className="action-row">
          <button type="button" className="action is-primary" onClick={() => setMoving(true)}>
            <MoveIcon size={15} /> Move
          </button>
          {data.status === 'LENT_OUT' ? (
            <button
              type="button"
              className="action"
              disabled={returnItem.isPending}
              onClick={async () => {
                try {
                  await returnItem.mutateAsync(itemId);
                  toast.success('Marked as returned.');
                } catch (err) {
                  toast.error(toMessage(err));
                }
              }}
            >
              <HandIcon size={15} /> Got it back
            </button>
          ) : (
            <button type="button" className="action" onClick={() => setLending(true)}>
              <HandIcon size={15} /> Lend
            </button>
          )}
          <Link to={`/places/${placeId}/items/${itemId}/edit`} className="action">
            <EditIcon size={15} /> Edit
          </Link>
        </div>
      )}

      {data.description && <p className="page-desc">{data.description}</p>}

      {(data.tags.length > 0 || data.aliases.length > 0) && (
        <div className="stack gap-3">
          {data.aliases.length > 0 && (
            <div className="stack gap-2">
              <span className="eyebrow">Also called</span>
              <div className="row wrap gap-1">
                {data.aliases.map((alias) => <Chip key={alias}>{alias}</Chip>)}
              </div>
            </div>
          )}
          {data.tags.length > 0 && (
            <div className="stack gap-2">
              <span className="eyebrow">Tags</span>
              <div className="row wrap gap-1">
                {data.tags.map((tag) => <Chip key={tag}>#{tag}</Chip>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- details ---- */}
      <section className="stack gap-1">
        <h2 className="section-title">Details</h2>
        <dl className="detail-rows">
          <Row label="Status" value={statusLabel(data.status)} />
          <Row label="Quantity" value={String(data.quantity)} />
          {data.lowStockAt !== null && <Row label="Warn me below" value={String(data.lowStockAt)} />}
          {data.category && <Row label="Category" value={data.category} />}
          {data.serialNumber && <Row label="Serial number" value={data.serialNumber} />}
          {data.expiresAt && <Row label="Expires" value={formatDate(data.expiresAt)} />}
          {data.warrantyUntil && <Row label="Warranty until" value={formatDate(data.warrantyUntil)} />}
          <Row
            label="Visibility"
            value={data.visibility === 'PRIVATE' ? 'Only me' : 'Everyone in this place'}
          />
          <Row
            label="Added by"
            value={
              <span className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                <Avatar name={data.createdBy.name} mediaId={data.createdBy.avatarMediaId} size={20} />
                {data.createdBy.name}
              </span>
            }
          />
          <Row label="Last updated" value={relativeTime(data.updatedAt)} />
        </dl>
      </section>

      {/* ---- history ---- */}
      <section className="stack gap-3">
        <h2 className="section-title">Previously kept in</h2>

        {history.isLoading ? (
          <SkeletonList rows={3} height={40} />
        ) : history.isError ? (
          <ErrorAlert message={toMessage(history.error)} />
        ) : history.data?.length ? (
          <div className="timeline">
            {history.data.map((move) => (
              <div key={move.id} className="timeline-item">
                <span className="timeline-dot"><MoveIcon size={10} /></span>
                <div className="stack gap-1 grow" style={{ minWidth: 0 }}>
                  <span className="text-sm">
                    {move.fromLabel ? (
                      <>
                        Moved from <strong>{lastSegment(move.fromLabel)}</strong> to{' '}
                        <strong>{lastSegment(move.toLabel)}</strong>
                      </>
                    ) : (
                      <>Added to <strong>{lastSegment(move.toLabel)}</strong></>
                    )}
                  </span>
                  {move.note && <span className="text-xs text-muted">“{move.note}”</span>}
                  <span className="text-xs text-subtle">
                    {move.movedBy.name} · {formatDateTime(move.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-subtle">No moves recorded yet.</p>
        )}
      </section>

      {canEdit && (
        <div className="stack gap-2">
          <hr className="section-divider" />
          <Button variant="danger-ghost" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmDelete(true)}>
            <TrashIcon size={15} /> Delete this thing
          </Button>
          {!isMine && data.visibility === 'PRIVATE' && (
            <p className="text-xs text-subtle">Only {data.owner.name} can change who sees this.</p>
          )}
        </div>
      )}

      {/* ---- dialogs ---- */}
      <MoveItemModal
        open={moving}
        placeId={placeId}
        currentStorageId={data.storage?.id ?? null}
        itemName={data.name}
        submitting={moveItem.isPending}
        onClose={() => setMoving(false)}
        onSubmit={async (toStorageId, note) => {
          try {
            await moveItem.mutateAsync({ itemId, toStorageId, note });
            toast.success('Moved.');
            setMoving(false);
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />

      <LendItemModal
        open={lending}
        itemName={data.name}
        submitting={lendItem.isPending}
        onClose={() => setLending(false)}
        onSubmit={async (dto) => {
          try {
            await lendItem.mutateAsync({ itemId, ...dto });
            toast.success(`Lent to ${dto.lentToName}.`);
            setLending(false);
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${data.name}?`}
        destructive
        confirmLabel="Delete"
        loading={deleteItem.isPending}
        message="This removes it and its history. This cannot be undone."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deleteItem.mutateAsync(itemId);
            toast.success('Deleted.');
            navigate(`/places/${placeId}?tab=things`, { replace: true });
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Movement labels are full breadcrumbs snapshotted at move time; the last
    segment is the actual spot, which is what reads well in a sentence. */
function lastSegment(label: string | null): string {
  if (!label) return 'nowhere';
  const parts = label.split('›').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? label;
}
