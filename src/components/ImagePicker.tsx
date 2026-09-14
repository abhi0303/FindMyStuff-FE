import { useRef, useState } from 'react';
import { prepareImage, formatBytes } from '@/lib/image';
import { Button } from './ui/Button';
import { CameraIcon, XIcon } from './Icons';
import { useToast } from './ui/Toast';

interface Props {
  /** Data URLs, ready to send as imagesBase64 / coverImageBase64. */
  value: string[];
  onChange: (dataUrls: string[]) => void;
  max?: number;
  label?: string;
}

export function ImagePicker({ value, onChange, max = 6, label = 'Photos' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const room = max - value.length;
      const chosen = Array.from(files).slice(0, room);
      if (files.length > room) toast.error(`You can attach up to ${max} photos.`);

      const prepared = await Promise.all(chosen.map((file) => prepareImage(file)));
      onChange([...value, ...prepared.map((p) => p.dataUrl)]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add that photo.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="field">
      <span className="field-label">
        {label} <span className="field-optional">· up to {max}, resized automatically</span>
      </span>

      <div className="row wrap gap-2">
        {value.map((dataUrl, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <img
              src={dataUrl}
              alt={`Attachment ${i + 1}`}
              style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, index) => index !== i))}
              aria-label={`Remove photo ${i + 1}`}
              style={{
                position: 'absolute', top: -6, right: -6, width: 22, height: 22,
                borderRadius: '50%', border: '1px solid var(--border)',
                background: 'var(--bg-elevated)', color: 'var(--text)',
                display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-sm)',
              }}
            >
              <XIcon size={12} />
            </button>
          </div>
        ))}

        {value.length < max && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            loading={busy}
            style={{ width: 76, height: 76, flexDirection: 'column', gap: 4, fontSize: 11 }}
          >
            {!busy && <CameraIcon size={20} />}
            {!busy && 'Add'}
          </Button>
        )}
      </div>

      {value.length > 0 && (
        <span className="field-hint">
          {value.length} attached · about {formatBytes(value.reduce((sum, d) => sum + d.length * 0.75, 0))}
        </span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heif,image/avif"
        multiple={max > 1}
        capture={undefined}
        onChange={(e) => handleFiles(e.target.files)}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  );
}
