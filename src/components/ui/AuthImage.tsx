import { useEffect, useState } from 'react';
import { requestBlob } from '@/api/client';
import { useOffline } from '@/offline/store';
import './ui.css';

/**
 * Media endpoints require the Authorization header, so a plain <img src> gets a 401.
 * We fetch the bytes as a blob and hand the <img> an object URL instead.
 *
 * Object URLs are cached per media id and shared across components — the same avatar
 * rendered in ten rows costs one request. The API sends `Cache-Control: private,
 * max-age=86400`, so repeat fetches after a reload are served by the HTTP cache.
 */
const cache = new Map<string, Promise<string>>();

function loadMedia(mediaId: string, variant: 'thumbnail' | 'raw', cachedOnly: boolean): Promise<string> {
  const key = `${mediaId}:${variant}`;
  let entry = cache.get(key);
  if (!entry) {
    // Offline mode: show what this session already loaded, and never wait on the network.
    if (cachedOnly) return Promise.reject(new Error('Not loaded yet'));
    entry = requestBlob(`/media/${mediaId}/${variant}`)
      .then((blob) => URL.createObjectURL(blob))
      .catch((error) => {
        cache.delete(key); // let a later mount retry
        throw error;
      });
    cache.set(key, entry);
  }
  return entry;
}

interface AuthImageProps {
  mediaId: string | null | undefined;
  alt: string;
  variant?: 'thumbnail' | 'raw';
  className?: string;
  style?: React.CSSProperties;
  fallback?: React.ReactNode;
}

export function AuthImage({ mediaId, alt, variant = 'thumbnail', className, style, fallback }: AuthImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const offline = useOffline().mode === 'offline';

  useEffect(() => {
    if (!mediaId) return;
    let active = true;
    setFailed(false);
    loadMedia(mediaId, variant, offline)
      .then((objectUrl) => active && setUrl(objectUrl))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [mediaId, variant, offline]);

  if (!mediaId || failed) return <>{fallback ?? null}</>;
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
