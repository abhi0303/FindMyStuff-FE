import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Field';
import { fromDateInput } from '@/lib/format';

interface Props {
  open: boolean;
  itemName: string;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (dto: { lentToName: string; dueAt?: string }) => void | Promise<void>;
}

export function LendItemModal({ open, itemName, submitting, onClose, onSubmit }: Props) {
  const [lentToName, setLentToName] = useState('');
  const [dueAt, setDueAt] = useState('');

  useEffect(() => {
    if (open) {
      setLentToName('');
      setDueAt('');
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Lend ${itemName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!lentToName.trim()}
            onClick={() => onSubmit({ lentToName: lentToName.trim(), dueAt: fromDateInput(dueAt) })}
          >
            Lend it
          </Button>
        </>
      }
    >
      <div className="stack gap-4">
        <Input
          label="Who has it?" required autoFocus value={lentToName}
          onChange={(e) => setLentToName(e.target.value)}
          placeholder="Rahul (neighbour)"
        />
        <Input
          label="Due back" optional type="date" value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          hint="You'll see it under “Needs attention” once it's overdue."
        />
      </div>
    </Modal>
  );
}
