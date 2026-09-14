import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Field';
import { StorageTreePicker } from './StorageTreePicker';

interface Props {
  open: boolean;
  placeId: string;
  currentStorageId: string | null;
  itemName: string;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (toStorageId: string | null, note?: string) => void | Promise<void>;
}

/** The most common edit after creating a thing — kept to one tap and one confirm. */
export function MoveItemModal({
  open, placeId, currentStorageId, itemName, submitting, onClose, onSubmit,
}: Props) {
  const [target, setTarget] = useState<string | null>(currentStorageId);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setTarget(currentStorageId);
      setNote('');
    }
  }, [open, currentStorageId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Move ${itemName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={target === currentStorageId}
            onClick={() => onSubmit(target, note.trim() || undefined)}
          >
            Move it
          </Button>
        </>
      }
    >
      <div className="stack gap-4">
        <StorageTreePicker
          placeId={placeId}
          value={target}
          onChange={setTarget}
          allowNone
          noneLabel="Not put away yet"
        />
        <Input
          label="Note" optional value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Shifted while cleaning"
          hint="Shows up in this thing's history."
        />
      </div>
    </Modal>
  );
}
