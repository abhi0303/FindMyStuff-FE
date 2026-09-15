import { useSyncExternalStore } from 'react';
import { requestBlob } from './client';
import { ApiError } from './errors';

/**
 * Media endpoints require the Authorization header, so a plain <img src> gets a 401.
 * The bytes are fetched as a blob and handed to <img> as an object URL.
 *
 * Object URLs are cached per media id and variant and shared across components — the same
 * avatar in ten rows costs one request. The API sends `Cache-Control: private,
 * max-age=86400`, so repeat fetches after a reload are served by the HTTP cache.
 */
const urls = new Map<string, Promise<string>>();

/**
 * Photos that answer 404 are gone for good — most were saved to the old server's disk,
 * which a deploy wiped when images moved to object storage. Remembered for the session,
 * so lists never re-request them on every render.
 */
const missing = new Set<string>();
let missingVersion = 0;
const listeners = new Set<() => void>();

/** The photo's file no longer exists (or can't be seen) — show a placeholder, not an error. */
export class MediaUnavailableError extends Error {}

export function isMediaMissing(mediaId: string): boolean {
  return missing.has(mediaId);
}

function markMissing(mediaId: string): void {
  if (missing.has(mediaId)) return;
  missing.add(mediaId);
  missingVersion += 1;
  listeners.forEach((listener) => listener());
}

/**
 * Resolves to an object URL for the photo.
 * `cachedOnly` (offline mode) uses what this session already loaded and never waits on the network.
 */
export function loadMedia(mediaId: string, variant: 'thumbnail' | 'raw', cachedOnly: boolean): Promise<string> {
  if (missing.has(mediaId)) return Promise.reject(new MediaUnavailableError(mediaId));
  const key = `${mediaId}:${variant}`;
  let entry = urls.get(key);
  if (!entry) {
    if (cachedOnly) return Promise.reject(new Error('Not loaded yet'));
    entry = requestBlob(`/media/${mediaId}/${variant}`)
      .then((blob) => URL.createObjectURL(blob))
      .catch((error: unknown) => {
        urls.delete(key); // a network blip can be retried by a later mount
        if (error instanceof ApiError && error.status === 404) {
          markMissing(mediaId);
          throw new MediaUnavailableError(mediaId);
        }
        throw error;
      });
    urls.set(key, entry);
  }
  return entry;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getVersion = () => missingVersion;

/** Which of these photos are known to be gone. Re-renders when another one turns out missing. */
export function useMissingMedia(mediaIds: readonly string[]): string[] {
  useSyncExternalStore(subscribe, getVersion);
  return mediaIds.filter((id) => missing.has(id));
}
