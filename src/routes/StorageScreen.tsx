import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useCreateStorage, useDeleteStorage, useItems, usePlace, useStorage, useStorageTree, useUpdateStorage,
} from '@/hooks/queries';
import type { StorageNode } from '@/api/types';
import { Button, ButtonLink, LoadingBlock } from '@/components/ui/Button';
import { EmptyRow, ErrorAlert, SkeletonList } from '@/components/ui/Feedback';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { ItemRow } from '@/components/ItemRow';
import { Breadcrumb } from '@/components/Breadcrumb';
import { QrCode } from '@/components/QrCode';
import { CoverPhoto } from '@/components/ImageViewer';
import { StorageThumb } from '@/components/StorageThumb';
import { StorageFormModal } from '@/components/StorageFormModal';
import { useToast } from '@/components/ui/Toast';
import { ArrowLeft, BoxIcon, ChevronRight, EditIcon, PlusIcon, QrIcon, StorageIcon, TrashIcon } from '@/components/Icons';
import { canEditContents, canManagePlace, storageTypeLabel } from '@/lib/labels';
import { pluralize } from '@/lib/format';
import { toMessage } from '@/api/errors';
import { NotFoundBody } from './NotFoundScreen';
import './Screens.css';

export default function StorageScreen() {
  const { placeId = '', storageId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const place = usePlace(placeId);
  const storage = useStorage(placeId, storageId);
  const tree = useStorageTree(placeId);
  // Direct contents only — the nested things belong to the child storages, which
  // are listed separately just below.
  const items = useItems(placeId, { storageId, includeNested: false, limit: 100 });

  const [editing, setEditing] = useState(false);
  const [addingInside, setAddingInside] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const createStorage = useCreateStorage(placeId);
  const updateStorage = useUpdateStorage(placeId);
  const deleteStorage = useDeleteStorage(placeId);

  // What deleting would actually take with it — the whole subtree, plus every
  // thing inside it, which becomes unassigned rather than deleted.
  const impact = useMemo(() => {
    if (!tree.data) return null;
    const node = findNode(tree.data, storageId);
    if (!node) return null;
    let storages = 0;
    let things = 0;
    const walk = (n: StorageNode) => {
      storages += 1;
      things += n.itemCount;
      n.children.forEach(walk);
    };
    walk(node);
    return { storages, things };
  }, [tree.data, storageId]);

  if (storage.isLoading) return <LoadingBlock />;
  if (storage.isError) return <NotFoundBody what="storage" />;
  if (!storage.data) return null;

  const role = place.data?.myRole;
  const canEdit = canEditContents(role);
  const canManage = canManagePlace(role);
  const data = storage.data;
  const newThingUrl = `/places/${placeId}/items/new?storageId=${storageId}`;

  return (
    <div className="stack gap-4">
      <Link
        to={data.parentId ? `/places/${placeId}/storages/${data.parentId}` : `/places/${placeId}`}
        className="back-link"
      >
        <ArrowLeft size={15} /> {data.parentId ? 'Back' : place.data?.name ?? 'Place'}
      </Link>

      {data.coverMediaId && <CoverPhoto mediaId={data.coverMediaId} alt={data.name} />}

      <header className="stack gap-3">
        <div className="page-header">
          <span className="icon-tile icon-tile-lg" aria-hidden><StorageIcon type={data.type} size={22} /></span>
          <div className="stack grow" style={{ minWidth: 0 }}>
            <h1 className="clamp-2">{data.name}</h1>
            {/* Pre-built by the API — rendered exactly as given. */}
            <div className="page-meta"><Breadcrumb value={data.breadcrumb} emphasizeLast={false} /></div>
          </div>
        </div>

        {data.description && <p className="page-desc">{data.description}</p>}

        <div className="action-row">
          <button type="button" className="action" onClick={() => setShowQr(true)}>
            <QrIcon size={15} /> <span className="mono">{data.labelCode}</span>
          </button>
          {canManage && (
            <>
              <button type="button" className="action" onClick={() => setEditing(true)}>
                <EditIcon size={15} /> Edit
              </button>
              <button type="button" className="action is-danger" onClick={() => setConfirmDelete(true)}>
                <TrashIcon size={15} /> Delete
              </button>
            </>
          )}
        </div>
      </header>

      {/* ---- nested storages ---- */}
      {(data.children.length > 0 || canManage) && (
        <section className="stack gap-1">
          <div className="section-head">
            <h2 className="section-title">Inside this</h2>
            {canManage && (
              <Button size="sm" variant="ghost" onClick={() => setAddingInside(true)}>
                <PlusIcon size={15} /> Add
              </Button>
            )}
          </div>
          {data.children.length > 0 ? (
            <div className="list">
              {data.children.map((child) => {
                const node = tree.data ? findNode(tree.data, child.id) : null;
                return (
                  <Link key={child.id} to={`/places/${placeId}/storages/${child.id}`} className="item-row">
                    <StorageThumb type={child.type} coverMediaId={child.coverMediaId} />
                    <span className="item-main">
                      <span className="item-name truncate">{child.name}</span>
                      <span className="item-meta">{storageTypeLabel(child.type)}</span>
                    </span>
                    {node && node.itemCount > 0 && <span className="item-count">{node.itemCount}</span>}
                    <ChevronRight size={16} className="row-chevron" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyRow
              icon={<StorageIcon type="BOX" size={17} />}
              title="No storage inside"
              hint="Use + Add to put a box, shelf or drawer in here."
            />
          )}
        </section>
      )}

      {/* ---- things directly here ---- */}
      <section className="stack gap-1">
        <div className="section-head">
          <h2 className="section-title">Things here</h2>
          {canEdit && (
            <ButtonLink to={newThingUrl} size="sm" variant="ghost">
              <PlusIcon size={15} /> Add
            </ButtonLink>
          )}
        </div>

        {items.isLoading ? (
          <SkeletonList rows={3} height={48} />
        ) : items.isError ? (
          <ErrorAlert message={toMessage(items.error)} />
        ) : items.data?.data.length ? (
          <div className="list">
            {items.data.data.map((item) => (
              <ItemRow key={item.id} item={item} placeId={placeId} />
            ))}
          </div>
        ) : (
          <EmptyRow
            icon={<BoxIcon size={17} />}
            title="Nothing in here yet"
            hint={
              data.children.length > 0
                ? 'It may be in one of the storages above.'
                : canEdit ? 'Use + Add to put the first thing here.' : undefined
            }
          />
        )}
      </section>

      {/* ---- QR sticker ---- */}
      <Modal open={showQr} onClose={() => setShowQr(false)} title="Label for this storage">
        <div className="stack gap-4" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 12 }}>
            <QrCode value={data.labelCode} size={200} />
          </div>
          <div className="stack gap-1">
            <strong>{data.name}</strong>
            <span className="mono text-sm text-muted">{data.labelCode}</span>
          </div>
          <p className="text-sm text-muted" style={{ maxWidth: '34ch' }}>
            Stick this on the box. Scanning it opens this screen — no need to remember what’s inside.
          </p>
          <ButtonLink to={`/places/${placeId}/labels`} variant="secondary" block>
            Print a sheet for the whole place
          </ButtonLink>
        </div>
      </Modal>

      {/* ---- add a storage inside this one ---- */}
      <StorageFormModal
        open={addingInside}
        placeId={placeId}
        parentId={storageId}
        submitting={createStorage.isPending}
        onClose={() => setAddingInside(false)}
        onSubmit={async ({ parentId, ...rest }) => {
          try {
            // The form lets the parent be changed; omit it for a root, as the create endpoint expects.
            await createStorage.mutateAsync(parentId ? { ...rest, parentId } : rest);
            toast.success(`${rest.name} added.`);
            setAddingInside(false);
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />

      <StorageFormModal
        open={editing}
        placeId={placeId}
        storage={data}
        submitting={updateStorage.isPending}
        onClose={() => setEditing(false)}
        onSubmit={async (dto) => {
          try {
            await updateStorage.mutateAsync({ storageId, dto });
            toast.success('Storage updated.');
            setEditing(false);
          } catch (err) {
            // Moving a storage into its own descendant lands here — show the
            // server's own message, which explains exactly what went wrong.
            toast.error(toMessage(err));
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${data.name}?`}
        destructive
        confirmLabel="Delete"
        loading={deleteStorage.isPending}
        message={
          impact ? (
            <>
              This removes <strong>{pluralize(impact.storages, 'storage')}</strong>
              {impact.storages > 1 && ' (this one and everything inside it)'}.
              {impact.things > 0 ? (
                <> The {pluralize(impact.things, 'thing')} inside won’t be deleted — they’ll be marked “not put away”.</>
              ) : (
                <> Nothing is stored in it.</>
              )}
            </>
          ) : (
            <>This removes the storage and everything inside it. Things inside are kept, but marked “not put away”.</>
          )
        }
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            const result = await deleteStorage.mutateAsync(storageId);
            toast.success(result.message);
            navigate(
              data.parentId ? `/places/${placeId}/storages/${data.parentId}` : `/places/${placeId}`,
              { replace: true },
            );
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />
    </div>
  );
}

function findNode(nodes: StorageNode[], id: string): StorageNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}
