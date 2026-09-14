import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useCreateStorage, useDeletePlace, useItems, useLeavePlace, usePlace,
  useStorageTree, useUpdatePlace,
} from '@/hooks/queries';
import type { StorageNode } from '@/api/types';
import { Button, ButtonLink, LoadingBlock } from '@/components/ui/Button';
import { Badge, EmptyRow, ErrorAlert, SkeletonList } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ItemRow } from '@/components/ItemRow';
import { StorageFormModal } from '@/components/StorageFormModal';
import { PlaceFormModal } from '@/components/PlaceFormModal';
import { StorageThumb } from '@/components/StorageThumb';
import { useToast } from '@/components/ui/Toast';
import {
  ArrowLeft, BoxIcon, ChevronRight, EditIcon, HistoryIcon, PlaceIcon, PlusIcon, PrinterIcon,
  StorageIcon, UsersIcon,
} from '@/components/Icons';
import { canEditContents, canManagePlace, isOwner, placeTypeLabel, roleLabel } from '@/lib/labels';
import { toMessage } from '@/api/errors';
import { pluralize } from '@/lib/format';
import { NotFoundBody } from './NotFoundScreen';
import './Screens.css';

type Tab = 'things' | 'storages';

export default function PlaceDetailScreen() {
  const { placeId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const tab = (params.get('tab') as Tab) ?? 'storages';
  const setTab = (next: Tab) => setParams({ tab: next }, { replace: true });

  const place = usePlace(placeId);
  const tree = useStorageTree(placeId);
  const items = useItems(placeId, { limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' });
  const { expanded, toggle } = useExpandedStorages(placeId);

  const createStorage = useCreateStorage(placeId);
  const updatePlace = useUpdatePlace(placeId);
  const deletePlace = useDeletePlace();
  const leavePlace = useLeavePlace();

  const [addingStorage, setAddingStorage] = useState<{ parentId?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (place.isLoading) return <LoadingBlock />;
  // A 404 here means "missing or not yours" — the API does not distinguish, and
  // neither should the copy.
  if (place.isError) return <NotFoundBody what="place" />;
  if (!place.data) return null;

  const role = place.data.myRole;
  const canEdit = canEditContents(role);
  const canManage = canManagePlace(role);

  const meta = [
    placeTypeLabel(place.data.type),
    place.data.city,
    pluralize(place.data.itemCount, 'thing'),
  ].filter(Boolean).join(' · ');

  return (
    <div className="stack gap-4">
      <Link to="/places" className="back-link"><ArrowLeft size={15} /> Places</Link>

      <header className="stack gap-3">
        <div className="page-header">
          <span className="icon-tile icon-tile-lg" aria-hidden><PlaceIcon type={place.data.type} size={22} /></span>
          <div className="stack grow" style={{ minWidth: 0 }}>
            <h1 className="clamp-2">{place.data.name}</h1>
            <div className="meta-line">
              <Badge tone={role === 'OWNER' ? 'accent' : 'neutral'}>{roleLabel(role)}</Badge>
              <span className="page-meta truncate">{meta}</span>
            </div>
          </div>
        </div>

        {place.data.description && <p className="page-desc">{place.data.description}</p>}

        <nav className="action-row" aria-label="Place actions">
          <Link to={`/places/${placeId}/members`} className="action">
            <UsersIcon size={15} /> Members <span className="action-count">{place.data.members.length}</span>
          </Link>
          <Link to={`/places/${placeId}/activity`} className="action">
            <HistoryIcon size={15} /> Activity
          </Link>
          <Link to={`/places/${placeId}/labels`} className="action">
            <PrinterIcon size={15} /> Labels
          </Link>
          {canManage && (
            <button type="button" className="action" onClick={() => setEditing(true)}>
              <EditIcon size={15} /> Edit
            </button>
          )}
        </nav>
      </header>

      <div className="tabs">
        <button aria-pressed={tab === 'storages'} onClick={() => setTab('storages')}>
          Storages{place.data.storageCount ? <span className="tab-count">{place.data.storageCount}</span> : null}
        </button>
        <button aria-pressed={tab === 'things'} onClick={() => setTab('things')}>
          Things{place.data.itemCount ? <span className="tab-count">{place.data.itemCount}</span> : null}
        </button>
        {tab === 'storages' && canManage && (
          <Button variant="ghost" size="sm" className="tabs-action" onClick={() => setAddingStorage({})}>
            <PlusIcon size={15} /> Add
          </Button>
        )}
        {tab === 'things' && canEdit && (
          <ButtonLink to={`/places/${placeId}/items/new`} variant="ghost" size="sm" className="tabs-action">
            <PlusIcon size={15} /> Add
          </ButtonLink>
        )}
      </div>

      {tab === 'storages' ? (
        <section>
          {tree.isLoading ? (
            <SkeletonList rows={4} height={48} />
          ) : tree.isError ? (
            <ErrorAlert message={toMessage(tree.error)} />
          ) : tree.data?.length ? (
            <div className="tree-list">
              {tree.data.map((node) => (
                <StorageNodeRow
                  key={node.id} node={node} placeId={placeId} depth={0}
                  expanded={expanded} onToggle={toggle}
                />
              ))}
            </div>
          ) : (
            <EmptyRow
              icon={<StorageIcon type="ROOM" size={17} />}
              title="Nothing inside yet"
              hint={
                canManage
                  ? 'Use + Add to create a room, then cupboards and shelves inside it.'
                  : 'Rooms and containers will show up here.'
              }
            />
          )}
        </section>
      ) : (
        <section className="stack gap-2">
          {items.isLoading ? (
            <SkeletonList rows={5} height={48} />
          ) : items.isError ? (
            <ErrorAlert message={toMessage(items.error)} />
          ) : items.data?.data.length ? (
            <>
              <div className="list">
                {items.data.data.map((item) => (
                  <ItemRow key={item.id} item={item} placeId={placeId} />
                ))}
              </div>
              {items.data.meta.hasNext && (
                <p className="text-sm text-subtle" style={{ textAlign: 'center' }}>
                  Showing {items.data.data.length} of {items.data.meta.total} — use search to narrow down.
                </p>
              )}
            </>
          ) : (
            <EmptyRow
              icon={<BoxIcon size={17} />}
              title="No things here yet"
              hint={canEdit ? 'Use + Add to put in the first one — a passport, a charger, the spare keys.' : undefined}
            />
          )}
        </section>
      )}

      {/* ---- danger zone ---- */}
      <div style={{ marginTop: 'var(--space-5)' }}>
        <hr className="section-divider" />
        {isOwner(role) ? (
          <Button variant="danger-ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            Delete this place
          </Button>
        ) : (
          <Button variant="danger-ghost" size="sm" onClick={() => setConfirmLeave(true)}>
            Leave this place
          </Button>
        )}
      </div>

      {canEdit && (
        <Link to={`/places/${placeId}/items/new`} className="fab" aria-label="Add a thing">
          <PlusIcon size={22} />
        </Link>
      )}

      {/* ---- dialogs ---- */}
      <StorageFormModal
        open={addingStorage !== null}
        placeId={placeId}
        parentId={addingStorage?.parentId}
        submitting={createStorage.isPending}
        onClose={() => setAddingStorage(null)}
        onSubmit={async ({ parentId, ...rest }) => {
          try {
            // The create endpoint wants parentId omitted for a root, not null.
            await createStorage.mutateAsync(parentId ? { ...rest, parentId } : rest);
            toast.success(`${rest.name} added.`);
            setAddingStorage(null);
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />

      <PlaceFormModal
        open={editing}
        place={place.data}
        submitting={updatePlace.isPending}
        onClose={() => setEditing(false)}
        onSubmit={async (dto) => {
          try {
            await updatePlace.mutateAsync(dto);
            toast.success('Place updated.');
            setEditing(false);
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this place?"
        destructive
        confirmLabel="Delete place"
        loading={deletePlace.isPending}
        message={
          <>
            <strong>{place.data.name}</strong> and everything in it —{' '}
            {pluralize(place.data.storageCount, 'storage')} and {pluralize(place.data.itemCount, 'thing')} — will
            be removed for every member. This cannot be undone.
          </>
        }
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deletePlace.mutateAsync(placeId);
            toast.success('Place deleted.');
            navigate('/places', { replace: true });
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />

      <ConfirmDialog
        open={confirmLeave}
        title="Leave this place?"
        destructive
        confirmLabel="Leave"
        loading={leavePlace.isPending}
        message={<>You will lose access to everything in <strong>{place.data.name}</strong>. An admin can invite you back.</>}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={async () => {
          try {
            await leavePlace.mutateAsync(placeId);
            toast.success('You left the place.');
            navigate('/places', { replace: true });
          } catch (err) {
            toast.error(toMessage(err));
          }
        }}
      />
    </div>
  );
}

/**
 * Which storages are expanded. Everything starts collapsed; the choice is kept for
 * the session so opening a storage and coming back does not fold the tree up again.
 */
function useExpandedStorages(placeId: string) {
  const key = `fms.tree.${placeId}`;
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify([...expanded]));
    } catch {
      /* storage disabled */
    }
  }, [key, expanded]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return { expanded, toggle };
}

function storageSummary(node: StorageNode): string {
  const parts: string[] = [];
  if (node.itemCount > 0) parts.push(pluralize(node.itemCount, 'thing'));
  if (node.children.length > 0) parts.push(`${node.children.length} inside`);
  return parts.length ? parts.join(' · ') : 'Empty';
}

interface NodeRowProps {
  node: StorageNode;
  placeId: string;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}

/** The chevron expands or collapses; the rest of the row opens the storage. */
function StorageNodeRow({ node, placeId, depth, expanded, onToggle }: NodeRowProps) {
  const root = depth === 0;
  const hasChildren = node.children.length > 0;
  const open = hasChildren && expanded.has(node.id);

  return (
    <div className="tnode">
      <div className={root ? 'trow trow-root' : 'trow'} data-branch={hasChildren || undefined}>
        {hasChildren ? (
          <button
            type="button"
            className="ttoggle"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${node.name}`}
            onClick={() => onToggle(node.id)}
          >
            <ChevronRight size={15} />
          </button>
        ) : (
          <span className="tspacer" aria-hidden />
        )}

        <Link to={`/places/${placeId}/storages/${node.id}`} className="trow-link">
          <StorageThumb type={node.type} coverMediaId={node.coverMediaId} small={!root} />
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="trow-name truncate">{node.name}</span>
            {root && <span className="trow-sub">{storageSummary(node)}</span>}
          </span>
          {!root && node.itemCount > 0 && <span className="trow-count">{node.itemCount}</span>}
        </Link>
      </div>

      {open && (
        <div className="tchildren">
          {node.children.map((child) => (
            <StorageNodeRow
              key={child.id} node={child} placeId={placeId} depth={depth + 1}
              expanded={expanded} onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
