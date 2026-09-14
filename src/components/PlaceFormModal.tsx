import { useEffect, useState } from 'react';
import type { CreatePlaceDto } from '@/api/endpoints';
import type { PlaceDetail, PlaceType } from '@/api/types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input, Select, Textarea } from './ui/Field';
import { ImagePicker } from './ImagePicker';
import { PLACE_TYPES, placeTypeLabel } from '@/lib/labels';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (dto: CreatePlaceDto) => void | Promise<void>;
  submitting?: boolean;
  /** Editing an existing place — only writable fields are seeded from it. */
  place?: PlaceDetail;
}

export function PlaceFormModal({ open, onClose, onSubmit, submitting, place }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PlaceType>('HOME');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [cover, setCover] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    // Seed from only the fields the write DTO accepts. Sending a whole GET
    // response back would fail with 400 — the API rejects unknown fields.
    setName(place?.name ?? '');
    setType(place?.type ?? 'HOME');
    setDescription(place?.description ?? '');
    setCity(place?.city ?? '');
    setCountry(place?.country ?? '');
    setCover([]);
  }, [open, place]);

  const submit = () => {
    const dto: CreatePlaceDto = { name: name.trim(), type };
    if (description.trim()) dto.description = description.trim();
    if (city.trim()) dto.city = city.trim();
    if (country.trim()) dto.country = country.trim();
    if (cover[0]) dto.coverImageBase64 = cover[0];
    onSubmit(dto);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={place ? 'Edit place' : 'New place'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={submitting} disabled={!name.trim()}>
            {place ? 'Save changes' : 'Create place'}
          </Button>
        </>
      }
    >
      <div className="stack gap-4">
        <Input
          label="Name" required value={name} autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Home — Sector 62"
        />

        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as PlaceType)}>
          {PLACE_TYPES.map((t) => (
            <option key={t} value={t}>{placeTypeLabel(t)}</option>
          ))}
        </Select>

        <div className="form-grid form-grid-2">
          <Input label="City" optional value={city} onChange={(e) => setCity(e.target.value)} placeholder="Noida" />
          <Input label="Country" optional value={country} onChange={(e) => setCountry(e.target.value)} placeholder="India" />
        </div>

        <Textarea
          label="Description" optional value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Third floor, the one with the blue door."
        />

        <ImagePicker value={cover} onChange={setCover} max={1} label="Cover photo" />
      </div>
    </Modal>
  );
}
