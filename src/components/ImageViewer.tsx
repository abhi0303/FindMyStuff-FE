import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AuthImage } from './ui/AuthImage';
import { ChevronLeft, ChevronRight, XIcon } from './Icons';
import './ui/ui.css';

interface ImageViewerProps {
  mediaIds: string[];
  /** Which photo is open; null when the viewer is closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  alt: string;
}

/** Full-screen photo viewer: close with ✕, Esc or the backdrop; swipe or arrows between photos. */
export function ImageViewer({ mediaIds, index, onIndexChange, alt }: ImageViewerProps) {
  const count = mediaIds.length;
  const open = index !== null && count > 0;
  const touchStartX = useRef<number | null>(null);

  const close = useCallback(() => onIndexChange(null), [onIndexChange]);
  const go = useCallback(
    (step: number) => {
      if (index === null || count < 2) return;
      onIndexChange((index + step + count) % count);
    },
    [index, count, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, close, go]);

  if (!open) return null;
  // A photo can turn out missing while the viewer is open, shortening the list.
  const current = mediaIds[Math.min(index, count - 1)];

  return createPortal(
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={count > 1 ? `${alt}, photo ${index + 1} of ${count}` : alt}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null) return;
        const dx = event.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="viewer-bar">
        <span>{count > 1 ? `${index + 1} / ${count}` : ''}</span>
        <button type="button" className="viewer-btn" onClick={close} aria-label="Close">
          <XIcon size={20} />
        </button>
      </div>

      {/* Full size when it can be fetched; the small version (cached offline) otherwise. */}
      <AuthImage
        key={current}
        mediaId={current}
        alt={alt}
        variant="raw"
        className="viewer-img"
        missing={<span className="viewer-missing">This photo is no longer available.</span>}
        fallback={
          <AuthImage
            mediaId={current}
            alt={alt}
            className="viewer-img"
            fallback={<span className="viewer-missing">This photo can’t be loaded right now.</span>}
          />
        }
      />

      {count > 1 && (
        <>
          <button type="button" className="viewer-btn viewer-prev" onClick={() => go(-1)} aria-label="Previous photo">
            <ChevronLeft size={22} />
          </button>
          <button type="button" className="viewer-btn viewer-next" onClick={() => go(1)} aria-label="Next photo">
            <ChevronRight size={22} />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

/** A wide cover photo that opens in the viewer. Renders nothing if the photo can't be shown. */
export function CoverPhoto({ mediaId, alt }: { mediaId: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cover-photo" onClick={() => setOpen(true)} aria-label={`Open the photo of ${alt}`}>
        <AuthImage
          mediaId={mediaId}
          alt={alt}
          variant="raw"
          className="cover-photo-img"
          fallback={<AuthImage mediaId={mediaId} alt={alt} className="cover-photo-img" />}
        />
      </button>
      <ImageViewer mediaIds={[mediaId]} index={open ? 0 : null} onIndexChange={(i) => setOpen(i !== null)} alt={alt} />
    </>
  );
}
