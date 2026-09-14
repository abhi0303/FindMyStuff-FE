import { useEffect, useState } from 'react';
import type { StorageFormDto } from '@/api/endpoints';
import type { StorageDetail, StorageType } from '@/api/types';
import { useStorageTree } from '@/hooks/queries';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input, Select, Textarea } from './ui/Field';
import { ImagePicker } from './ImagePicker';
import { StorageTreePicker, collectSubtreeIds } from './StorageTreePicker';
import { STORAGE_TYPES, storageTypeLabel } from '@/lib/labels';
import { Alert } from './ui/Feedback';

interface Props {
  open: boolean;
  placeId: string;
  onClose: () => void;
  onSubmit: (dto: StorageFormDto) => void | Promise<void>;
  submitting?: boolean;
  parentId?: string;
  storage?: StorageDetail;
}

export function StorageFormModal({
  open, placeId, onClose, onSubmit, submitting, parentId, storage,
}: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<StorageType>('BOX');
  const [description, setDescription] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [cover, setCover] = useState<string[]>([]);
  const [pickingParent, setPickingParent] = useState(false);

  const tree = useStorageTree(open ? placeId : undefined);

  useEffect(() => {
    if (!open) return;
    setName(storage?.name ?? '');
    setType(storage?.type ?? (parentId ? 'BOX' : 'ROOM'));
    setDescription(storage?.description ?? '');
    setParent(storage ? storage.parentId : (parentId ?? null));
    setCover([]);
    setPickingParent(false);
  }, [open, storage, parentId]);

  // Moving a storage into its own descendant is rejected with a 400 — grey those
  // rows out rather than letting someone pick an invalid target.
  const forbidden = storage && tree.data ? collectSubtreeIds(tree.data, storage.id) : undefined;

  const submit = () => {
    const dto: StorageFormDto = { name: name.trim(), type };
    if (description.trim()) dto.description = description.trim();
    if (cover[0]) dto.coverImageBase64 = cover[0];
    // On create the API wants the key omitted for a root; on edit, null means
    // "move to the top level", which is a meaningful value.
    if (storage) dto.parentId = parent;
    else if (parent) dto.parentId = parent;
    onSubmit(dto);
  };

  const parentName = parent
    ? findName(tree.data ?? [], parent) ?? 'Selected storage'
    : 'Top level (a room)';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={storage ? 'Edit storage' : 'New storage'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={submitting} disabled={!name.trim()}>
            {storage ? 'Save changes' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="stack gap-4">
        <Input
          label="Name" required value={name} autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Almirah"
        />

        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as StorageType)}>
          {STORAGE_TYPES.map((t) => (
            <option key={t} value={t}>{storageTypeLabel(t)}</option>
          ))}
        </Select>

        <div className="field">
          <span className="field-label">Inside</span>
          {pickingParent ? (
            <div className="stack gap-2">
              <StorageTreePicker
                placeId={placeId}
                value={parent}
                onChange={(id) => {
                  setParent(id);
                  setPickingParent(false);
                }}
                allowNone
                noneLabel="Top level (a room)"
                disabledIds={forbidden}
              />
              <Button size="sm" variant="ghost" onClick={() => setPickingParent(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setPickingParent(true)} style={{ justifyContent: 'space-between' }}>
              <span className="truncate">{parentName}</span>
              <span className="text-xs text-subtle">Change</span>
            </Button>
          )}
          {storage && (
            <span className="field-hint">Moving this takes everything inside it along.</span>
          )}
        </div>

        {storage && forbidden && forbidden.size > 1 && (
          <Alert kind="info">
            Its own contents are greyed out — a storage cannot be moved inside itself.
          </Alert>
        )}

        <Textarea
          label="Description" optional value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="The tall one on the left."
        />

        <ImagePicker value={cover} onChange={setCover} max={1} label="Photo" />
      </div>
    </Modal>
  );
}

function findName(nodes: { id: string; name: string; children: { id: string; name: string; children: unknown[] }[] }[], id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.name;
    const deeper = findName(node.children as never, id);
    if (deeper) return deeper;
  }
  return null;
}
