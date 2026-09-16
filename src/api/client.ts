import { ApiError } from './errors';
import {
  clearTokens, getAccessToken, getRefreshToken, setTokens,
} from './tokens';
import type { TokenPair } from './types';

/** In dev this is '/api' and Vite proxies it; in prod set VITE_API_BASE_URL. */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

/* ------------------------------------------------------------------ *
 * Global auth events
 * ------------------------------------------------------------------ */

type AuthEvent = 'logout' | 'terms-required';
type AuthListener = (event: AuthEvent, payload?: unknown) => void;

const authListeners = new Set<AuthListener>();

export function onAuthEvent(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function emitAuth(event: AuthEvent, payload?: unknown) {
  authListeners.forEach((l) => l(event, payload));
}

/** Drop the session and tell the app to bounce to the login screen. */
export function forceLogout(): void {
  clearTokens();
  emitAuth('logout');
}

/* ------------------------------------------------------------------ *
 * Connection state
 *
 * The API is hosted on a tier that sleeps when idle: the first request after a
 * quiet spell gets gateway errors for 30-60s while the instance wakes. That is
 * not a failure worth showing anyone — we retry through it and publish progress
 * so the UI can say "waking the server" instead of "something went wrong".
 * ------------------------------------------------------------------ */

export interface ConnectionState {
  status: 'idle' | 'retrying';
  attempt: number;
  maxAttempts: number;
  /** When the current wake-up sequence began, for elapsed-time display. */
  since: number | null;
}

type ConnectionListener = (state: ConnectionState) => void;

const connectionListeners = new Set<ConnectionListener>();
let connectionState: ConnectionState = { status: 'idle', attempt: 0, maxAttempts: 0, since: null };

/** How many requests are currently mid-retry — the banner hides when all finish. */
let retryingCount = 0;

export function onConnectionChange(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

export function getConnectionState(): ConnectionState {
  return connectionState;
}

function setConnectionState(next: ConnectionState) {
  connectionState = next;
  connectionListeners.forEach((l) => l(next));
}

/* A request gave up because the API couldn't be reached at all. Offline mode listens to
   this to offer the on-device backup. */
const networkFailureListeners = new Set<() => void>();

export function onNetworkFailure(listener: () => void): () => void {
  networkFailureListeners.add(listener);
  return () => networkFailureListeners.delete(listener);
}

/* ------------------------------------------------------------------ *
 * Slow requests
 *
 * A sleeping instance accepts the connection and then just holds it, so nothing fails and
 * no retry is announced for a full attempt timeout. Waiting is measured directly instead:
 * if anything is still in flight after a few seconds, the server is asleep and the app can
 * show the on-device backup rather than a spinner.
 * ------------------------------------------------------------------ */

const SLOW_REQUEST_MS = 4000;

const slowRequestListeners = new Set<() => void>();
let inFlight = 0;
let slowTimer: ReturnType<typeof setTimeout> | null = null;

export function onSlowRequest(listener: () => void): () => void {
  slowRequestListeners.add(listener);
  return () => slowRequestListeners.delete(listener);
}

function requestStarted(): void {
  inFlight += 1;
  slowTimer ??= setTimeout(() => {
    slowTimer = null;
    if (inFlight > 0) slowRequestListeners.forEach((l) => l());
  }, SLOW_REQUEST_MS);
}

function requestFinished(): void {
  inFlight = Math.max(0, inFlight - 1);
  if (inFlight === 0 && slowTimer) {
    clearTimeout(slowTimer);
    slowTimer = null;
  }
}

/* ------------------------------------------------------------------ *
 * Retry policy
 * ------------------------------------------------------------------ */

/** Backoff between attempts. Totals ~63s, which covers a cold start. */
const BACKOFF_MS = [1000, 2000, 4000, 8000, 12000, 16000, 20000];
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
/** A single attempt that hangs this long is treated as a failed attempt. */
const ATTEMPT_TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * How an attempt failed, which decides whether replaying it is safe.
 *
 * - `network` — fetch threw; no response at all, so nothing reached the API.
 * - `gateway` — 502/503/504 whose body is not JSON. Our API always answers with
 *   JSON, so an HTML body means a proxy/CDN produced it and the request never
 *   reached the app.
 * - `server`  — a 5xx the API itself produced. It may have done work already.
 * - `fatal`   — anything else; retrying will not help.
 */
type FailureKind = 'network' | 'gateway' | 'server' | 'fatal';

function isSafeToReplay(method: string, kind: FailureKind): boolean {
  if (kind === 'fatal') return false;
  // Reads can always be replayed.
  if (method === 'GET' || method === 'HEAD') return true;
  // Writes are only replayed when we know the request never reached the API,
  // otherwise a retry could create a second item or send a second invite.
  return kind === 'network' || kind === 'gateway';
}

/** Combines the caller's abort signal with a per-attempt timeout. */
function attemptSignal(outer: AbortSignal | undefined): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const onOuterAbort = () => ctrl.abort(outer?.reason);

  if (outer) {
    if (outer.aborted) ctrl.abort(outer.reason);
    else outer.addEventListener('abort', onOuterAbort, { once: true });
  }

  const timer = setTimeout(
    () => ctrl.abort(new DOMException('Attempt timed out', 'TimeoutError')),
    ATTEMPT_TIMEOUT_MS,
  );

  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    },
  };
}

/**
 * Runs `attempt` until it succeeds, the failure is not replayable, or we run out
 * of attempts. Publishes connection state so the UI can show a waking indicator.
 */
async function withRetry<T>(
  method: string,
  attempt: () => Promise<T>,
  classify: (error: unknown) => FailureKind,
): Promise<T> {
  let announced = false;

  try {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        const result = await attempt();
        return result;
      } catch (error) {
        // The caller gave up (component unmounted, new search keystroke).
        if (error instanceof DOMException && error.name === 'AbortError') throw error;

        const kind = classify(error);
        const lastAttempt = i === MAX_ATTEMPTS - 1;
        if (lastAttempt || !isSafeToReplay(method, kind)) {
          if (kind === 'network' || kind === 'gateway') networkFailureListeners.forEach((l) => l());
          throw error;
        }

        if (!announced) {
          announced = true;
          retryingCount += 1;
        }
        setConnectionState({
          status: 'retrying',
          attempt: i + 2, // the attempt we are about to make
          maxAttempts: MAX_ATTEMPTS,
          since: connectionState.since ?? Date.now(),
        });

        await sleep(BACKOFF_MS[i]);
      }
    }
    // Unreachable: the final attempt either returns or throws above.
    throw new ApiError(0, null);
  } finally {
    if (announced) {
      retryingCount = Math.max(0, retryingCount - 1);
      if (retryingCount === 0) {
        setConnectionState({ status: 'idle', attempt: 0, maxAttempts: 0, since: null });
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Refresh: serialised
 *
 * Refresh tokens rotate — every call invalidates the token it was given. If five
 * requests 401 at once and each fires its own refresh, four of them replay a spent
 * token, which the server treats as theft and revokes *every* session. So all
 * callers queue behind one in-flight promise.
 * ------------------------------------------------------------------ */

let refreshing: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError(401, { message: 'No session' });

  // Refreshing is a GET-like replay for our purposes: a gateway error means the
  // token was never spent, so waking the server and retrying is safe. Without
  // this, a cold start would log everyone out.
  const pair = await withRetry<TokenPair>(
    'GET',
    async () => {
      const { signal, done } = attemptSignal(undefined);
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          signal,
        });
        if (!res.ok) throw await toApiError(res);
        return (await res.json()) as TokenPair;
      } catch (error) {
        throw asTransportError(error);
      } finally {
        done();
      }
    },
    classifyFailure,
  ).catch((error) => {
    // Out of retries, or the token really is spent or revoked.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) forceLogout();
    throw error;
  });

  setTokens(pair); // atomic — stores the *new* refresh token
  return pair.accessToken;
}

/** Also used by the backup worker's token bridge, so there is still only ever one refresh in flight. */
export function getFreshAccessToken(): Promise<string> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/* ------------------------------------------------------------------ *
 * Request
 * ------------------------------------------------------------------ */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Skip the Authorization header and the refresh dance (login, signup, refresh). */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Marks an ApiError whose body was not JSON — i.e. produced by a gateway. */
const NON_JSON = Symbol('nonJsonBody');

async function toApiError(res: Response): Promise<ApiError> {
  const text = await res.text();
  let body: unknown = null;
  let wasJson = false;

  if (text) {
    try {
      body = JSON.parse(text);
      wasJson = true;
    } catch {
      // Not JSON. A proxy, CDN or load balancer in front of the API answers
      // errors with an HTML page, and rendering that dumps raw markup in front
      // of the user. Only a short plain-text body is kept as a message.
      const trimmed = text.trim();
      body = trimmed.startsWith('<') || trimmed.length > 200 ? null : { message: trimmed };
    }
  }

  const error = new ApiError(res.status, body);
  if (!wasJson) Object.defineProperty(error, NON_JSON, { value: true });
  return error;
}

/** Turns a thrown fetch failure into an ApiError, preserving real aborts. */
function asTransportError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return error;
  // A per-attempt timeout, DNS failure, refused connection, or a CORS-blocked
  // gateway response all land here with no status of their own.
  return new ApiError(0, { message: 'Cannot reach the server. Check your connection.' });
}

function classifyFailure(error: unknown): FailureKind {
  if (!(error instanceof ApiError)) return 'fatal';
  if (error.status === 0) return 'network';
  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return NON_JSON in error ? 'gateway' : 'server';
  }
  return 'fatal';
}

async function fetchOnce(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const { signal, done } = attemptSignal(options.signal);
  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
  } catch (error) {
    throw asTransportError(error);
  } finally {
    done();
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';

  // Only API calls count towards "the server is slow"; a slow photo download does not.
  requestStarted();
  try {
    return await withRetry<T>(
    method,
    async () => {
      const token = options.anonymous ? null : getAccessToken();
      let res = await fetchOnce(path, options, token);

      // Expired access token: refresh once (queued), then retry exactly once.
      if (res.status === 401 && !options.anonymous && getRefreshToken()) {
        try {
          const fresh = await getFreshAccessToken();
          res = await fetchOnce(path, options, fresh);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error;
          forceLogout();
          throw new ApiError(401, { message: 'Your session has expired. Please sign in again.' });
        }
        if (res.status === 401) {
          forceLogout();
          throw new ApiError(401, { message: 'Your session has expired. Please sign in again.' });
        }
      }

      if (!res.ok) {
        const error = await toApiError(res);
        // Terms gate is global: every authenticated route starts 403-ing until accepted.
        if (error.isTermsRequired) emitAuth('terms-required', error.requiredTermsVersion);
        throw error;
      }

      if (res.status === 204) return undefined as T;

      const text = await res.text();
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return undefined as T;
      }
      },
      classifyFailure,
    );
  } finally {
    requestFinished();
  }
}

/** Authenticated binary fetch — media endpoints need the bearer header. */
export async function requestBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  return withRetry<Blob>(
    'GET',
    async () => {
      const run = async (token: string | null) => {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const { signal: attemptAbort, done } = attemptSignal(signal);
        try {
          return await fetch(`${API_BASE}${path}`, { headers, signal: attemptAbort });
        } catch (error) {
          throw asTransportError(error);
        } finally {
          done();
        }
      };

      let res = await run(getAccessToken());
      if (res.status === 401 && getRefreshToken()) {
        const fresh = await getFreshAccessToken();
        res = await run(fresh);
      }
      if (!res.ok) throw await toApiError(res);
      return res.blob();
    },
    classifyFailure,
  );
}

export const http = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
};
