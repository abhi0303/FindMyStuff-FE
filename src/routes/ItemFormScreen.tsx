import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCreateItem, useItem, usePlace, useStorageList, useUpdateItem } from '@/hooks/queries';
import type { CreateItemDto, UpdateItemDto } from '@/api/endpoints';
import type { Visibility } from '@/api/types';
import { Button, LoadingBlock } from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Alert, ErrorAlert } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { StorageTreePicker } from '@/components/StorageTreePicker';
import { TagInput } from '@/components/TagInput';
import { ImagePicker } from '@/components/ImagePicker';
import { Breadcrumb } from '@/components/Breadcrumb';
import { useToast } from '@/components/ui/Toast';
import { ArrowLeft, ImageOffIcon } from '@/components/Icons';
import { AuthImage } from '@/components/ui/AuthImage';
import { useMissingMedia } from '@/api/media';
import { fromDateInput, pluralize, toDateInput } from '@/lib/format';
import { toMessage } from '@/api/errors';
import { NotFoundBody } from './NotFoundScreen';
import './Screens.css';

const COMMON_TAGS = ['documents', 'electronics', 'medicine', 'tools', 'clothes', 'kitchen', 'important'];

export default function ItemFormScreen() {
  const { placeId = '', itemId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const isEdit = Boolean(itemId);
  const place = usePlace(placeId);
  const existing = useItem(placeId, itemId);
  const createItem = useCreateItem(placeId);
  const updateItem = useUpdateItem(placeId, itemId ?? '');
  const existingPhotos = existing.data?.mediaIds ?? [];
  const missingExisting = useMissingMedia(existingPhotos);

  const [name, setName] = useState('');
  const [storageId, setStorageId] = useState<string | null>(params.get('storageId'));
  const [description, setDescription] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [lowStockAt, setLowStockAt] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('SHARED');
  const [expiresAt, setExpiresAt] = useState('');
  const [warrantyUntil, setWarrantyUntil] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const [pickingStorage, setPickingStorage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askedAliases, setAskedAliases] = useState(false);

  // Seed from only the fields the update DTO accepts — a GET response carries id,
  // createdAt, breadcrumb and more, all of which would be rejected with a 400.
  useEffect(() => {
    const data = existing.data;
    if (!isEdit || !data) return;
    setName(data.name);
    setStorageId(data.storage?.id ?? null);
    setDescription(data.description ?? '');
    setAliases(data.aliases);
    setTags(data.tags);
    setCategory(data.category ?? '');
    setQuantity(String(data.quantity));
    setLowStockAt(data.lowStockAt !== null ? String(data.lowStockAt) : '');
    setSerialNumber(data.serialNumber ?? '');
    setVisibility(data.visibility);
    setExpiresAt(toDateInput(data.expiresAt));
    setWarrantyUntil(toDateInput(data.warrantyUntil));
    setAskedAliases(true);
  }, [isEdit, existing.data]);

  const storages = useStorageList(placeId);
  const currentBreadcrumb = storageId
    ? storages.data?.find((s) => s.id === storageId)?.breadcrumb ?? null
    : null;

  if (isEdit && existing.isLoading) return <LoadingBlock />;
  if (isEdit && existing.isError) return <NotFoundBody what="thing" />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const shared = {
      description: description.trim() || undefined,
      aliases,
      tags,
      category: category.trim() || undefined,
      quantity: Number(quantity) || 1,
      lowStockAt: lowStockAt ? Number(lowStockAt) : undefined,
      serialNumber: serialNumber.trim() || undefined,
      visibility,
      expiresAt: fromDateInput(expiresAt),
      warrantyUntil: fromDateInput(warrantyUntil),
      ...(images.length ? { imagesBase64: images } : {}),
    };

    try {
      if (isEdit) {
        // null is meaningful here: it marks the thing as not put away.
        const dto: UpdateItemDto = { ...shared, name: name.trim(), storageId };
        await updateItem.mutateAsync(dto);
        toast.success('Saved.');
        navigate(`/places/${placeId}/items/${itemId}`, { replace: true });
      } else {
        const dto: CreateItemDto = { ...shared, name: name.trim() };
        if (storageId) dto.storageId = storageId;
        const created = await createItem.mutateAsync(dto);
        toast.success(`${created.name} added.`);
        navigate(`/places/${placeId}/items/${created.id}`, { replace: true });
      }
    } catch (err) {
      setError(toMessage(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const submitting = createItem.isPending || updateItem.isPending;

  return (
    <form className="stack gap-4" onSubmit={submit}>
      <Link
        to={isEdit ? `/places/${placeId}/items/${itemId}` : `/places/${placeId}`}
        className="back-link"
      >
        <ArrowLeft size={15} /> Cancel
      </Link>

      <h1>{isEdit ? 'Edit thing' : 'Add a thing'}</h1>

      <ErrorAlert message={error} />

      <Input
        label="What is it?" required autoFocus value={name}
        onChange={(e) => setName(e.target.value)}
        // Nobody searches for "Type-C cable" — they search "charger". Ask for the
        // other names once, as soon as there is something to hang them off.
        onBlur={() => name.trim() && !askedAliases && setAskedAliases(true)}
        placeholder="Passport"
      />

      {askedAliases && aliases.length === 0 && !isEdit && (
        <Alert kind="info">
          <strong>What else might you call this?</strong>
          <div className="text-sm" style={{ marginTop: 4 }}>
            Add the word you’d actually search for later — “charger” finds a Type-C cable.
          </div>
        </Alert>
      )}

      <TagInput
        label="Also called"
        value={aliases}
        onChange={setAliases}
        placeholder="charger, cable, charging wire"
        hint="Press Enter after each one."
      />

      <div className="field">
        <span className="field-label">Where does it live? <span className="field-optional">· optional</span></span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPickingStorage(true)}
          style={{ justifyContent: 'space-between', height: 'auto', minHeight: 40, padding: '8px 12px' }}
        >
          {storageId ? (
            <Breadcrumb value={currentBreadcrumb} />
          ) : (
            <span className="text-muted">Not put away yet</span>
          )}
          <span className="text-xs text-subtle">Change</span>
        </Button>
      </div>

      <Textarea
        label="Description" optional value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Inside the brown document folder"
      />

      <TagInput
        label="Tags" value={tags} onChange={setTags}
        placeholder="documents, important"
        suggestions={COMMON_TAGS}
      />

      <div className="form-grid form-grid-2">
        <Input
          label="Quantity" type="number" min="1" value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <Input
          label="Warn me below" optional type="number" min="0" value={lowStockAt}
          onChange={(e) => setLowStockAt(e.target.value)}
          hint="Shows up under “Running low”."
        />
      </div>

      <div className="form-grid form-grid-2">
        <Input
          label="Expires on" optional type="date" value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        <Input
          label="Warranty until" optional type="date" value={warrantyUntil}
          onChange={(e) => setWarrantyUntil(e.target.value)}
        />
      </div>

      <div className="form-grid form-grid-2">
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">No category</option>
          {['Documents', 'Electronics', 'Medicine', 'Tools', 'Clothes', 'Kitchen', 'Other'].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <Input
          label="Serial number" optional value={serialNumber}
          onChange={(e) => setSerialNumber(e.target.value)}
        />
      </div>

      <Switch
        checked={visibility === 'PRIVATE'}
        onChange={(on) => setVisibility(on ? 'PRIVATE' : 'SHARED')}
        label="Only visible to me"
        description="Nobody else in this place will see it — not in lists, counts or search."
      />

      {isEdit && existingPhotos.length > 0 && (
        <div className="field">
          <span className="field-label">Current photos</span>
          <div className="detail-gallery">
            {existingPhotos.map((mediaId) => (
              <AuthImage
                key={mediaId}
                mediaId={mediaId}
                alt=""
                missing={
                  <span className="gallery-missing" title="This photo is no longer available">
                    <ImageOffIcon size={20} />
                    Unavailable
                  </span>
                }
              />
            ))}
          </div>
          {missingExisting.length > 0 && (
            <span className="field-hint">
              {pluralize(missingExisting.length, 'photo')} can’t be shown any more — add{' '}
              {missingExisting.length === 1 ? 'it' : 'them'} again below.
            </span>
          )}
        </div>
      )}

      <ImagePicker value={images} onChange={setImages} max={6} />
      {isEdit && images.length > 0 && (
        <p className="text-xs text-subtle">New photos are added to the existing ones.</p>
      )}

      <div className="sticky-actions">
        <Button type="submit" variant="primary" size="lg" loading={submitting} disabled={!name.trim()}>
          {isEdit ? 'Save changes' : 'Add it'}
        </Button>
      </div>

      <Modal
        open={pickingStorage}
        onClose={() => setPickingStorage(false)}
        title="Where does it live?"
      >
        <StorageTreePicker
          placeId={placeId}
          value={storageId}
          onChange={(id) => {
            setStorageId(id);
            setPickingStorage(false);
          }}
          allowNone
        />
        {!place.data?.storageCount && (
          <p className="text-sm text-muted" style={{ marginTop: 'var(--space-4)' }}>
            No storages in this place yet — you can add the thing now and put it away later.
          </p>
        )}
      </Modal>
    </form>
  );
}
