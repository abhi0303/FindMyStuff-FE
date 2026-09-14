/**
 * The API returns `message` as an array on validation failures and a string
 * everywhere else. Normalise both into one shape, once, here.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** Individual validation messages, when the server sent an array. */
  readonly details: string[];
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const record = (body ?? {}) as Record<string, unknown>;
    const raw = record.message;
    const details = Array.isArray(raw) ? raw.map(String) : [];
    const message = details.length
      ? details.join('\n')
      : isUsableMessage(raw)
        ? raw.trim()
        : fallbackFor(status);

    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = typeof record.code === 'string' ? record.code : undefined;
    this.details = details;
    this.body = body;
  }

  /** The user must accept updated terms before the API will serve them. */
  get isTermsRequired(): boolean {
    return this.status === 403 && this.code === 'TERMS_ACCEPTANCE_REQUIRED';
  }

  get requiredTermsVersion(): string | undefined {
    const v = (this.body as Record<string, unknown> | null)?.requiredTermsVersion;
    return typeof v === 'string' ? v : undefined;
  }

  /**
   * A 404 can mean "does not exist" or "exists but is not yours" — the API
   * deliberately does not distinguish. Never render this as "no permission".
   */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * A gateway or CDN in front of the API answers errors with an HTML page rather
 * than JSON. Showing that to someone dumps raw markup on screen, so anything that
 * is not a short plain-text sentence is rejected in favour of a written fallback.
 */
function isUsableMessage(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 200 && !trimmed.startsWith('<');
}

function fallbackFor(status: number): string {
  switch (status) {
    case 0: return 'Cannot reach the server. Check your connection.';
    case 401: return 'Your session has expired. Please sign in again.';
    case 403: return 'You do not have permission to do that.';
    case 404: return 'Not found.';
    case 429: return 'Too many requests. Please wait a moment and try again.';
    case 500: return 'Something went wrong on the server.';
    // A proxy in front of a stopped or restarting API answers with these, so they
    // mean "cannot reach the server" far more often than they mean a real fault.
    case 502:
    case 503:
    case 504: return 'The server is not responding. It may be restarting — try again in a moment.';
    default: return 'Something went wrong.';
  }
}

/** Safe message extraction for anything thrown, not just ApiError. */
export function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
