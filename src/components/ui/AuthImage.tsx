import { useEffect, useState, type ReactNode } from 'react';
import { MediaUnavailableError, isMediaMissing, loadMedia } from '@/api/media';
import { useOffline } from '@/offline/store';
import './ui.css';

interface AuthImageProps {
  mediaId: string | null | undefined;
  alt: string;
  variant?: 'thumbnail' | 'raw';
  className?: string;
  style?: React.CSSProperties;
  /** Shown when there is no photo, or it can't be loaded right now (offline, network). */
  fallback?: ReactNode;
  /** Shown when the photo's file is gone for good. Defaults to `fallback`. */
  missing?: ReactNode;
}

export function AuthImage({ mediaId, alt, variant = 'thumbnail', className, style, fallback, missing }: AuthImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<'missing' | 'error' | null>(null);
  const offline = useOffline().mode === 'offline';
  // Known-missing photos render their placeholder straight away, with no loading flash.
  const knownMissing = Boolean(mediaId && isMediaMissing(mediaId));

  useEffect(() => {
    if (!mediaId || isMediaMissing(mediaId)) return;
    let active = true;
    setFailure(null);
    loadMedia(mediaId, variant, offline)
      .then((objectUrl) => active && setUrl(objectUrl))
      .catch((error: unknown) => active && setFailure(error instanceof MediaUnavailableError ? 'missing' : 'error'));
    return () => {
      active = false;
    };
  }, [mediaId, variant, offline]);

  if (mediaId && (knownMissing || failure === 'missing')) return <>{missing ?? fallback ?? null}</>;
  if (!mediaId || failure) return <>{fallback ?? null}</>;
  if (!url) return <div className={`skeleton ${className ?? ''}`} style={style} aria-hidden />;

  return <img src={url} alt={alt} className={className} style={style} loading="lazy" />;
}

export function Avatar({
  name, mediaId, size = 32,
}: { name: string; mediaId?: string | null; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.4) };

  return (
    <AuthImage
      mediaId={mediaId}
      alt={name}
      className="avatar"
      style={style}
      fallback={
        <span className="avatar" style={style} aria-hidden title={name}>
          {initials || '?'}
        </span>
      }
    />
  );
}
