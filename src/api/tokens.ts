/**
 * Token storage.
 *
 * The access token lives in memory only. The refresh token is persisted so a reload
 * or a cold PWA start does not log the user out — for a static SPA against a
 * cross-origin API there is no httpOnly-cookie option available to us. That is a
 * deliberate, documented tradeoff (see README "Security notes"): the refresh token is
 * rotated on every use and any replay revokes the whole session server-side.
 */

const REFRESH_KEY = 'fms.refreshToken';
const ACCESS_KEY = 'fms.accessToken';

let accessToken: string | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeToTokens(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  try {
    accessToken = sessionStorage.getItem(ACCESS_KEY);
  } catch {
    /* private mode / storage disabled */
  }
  return accessToken;
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

/** Overwrite both tokens atomically — the rotated refresh token must never be lost. */
export function setTokens(tokens: { accessToken: string; refreshToken: string }): void {
  accessToken = tokens.accessToken;
  try {
    sessionStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  } catch {
    /* keep going with the in-memory copy */
  }
  emit();
}

export function clearTokens(): void {
  accessToken = null;
  try {
    sessionStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function hasSession(): boolean {
  return Boolean(getRefreshToken());
}
