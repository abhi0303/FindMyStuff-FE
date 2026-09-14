/**
 * An invite deep link (/invite/INV-ZJ5Y0YAP) usually arrives before the person has
 * an account. Park the code across the signup round-trip and redeem it on arrival.
 */
const KEY = 'fms.pendingInvite';

export function rememberInviteCode(code: string): void {
  try {
    sessionStorage.setItem(KEY, code);
  } catch {
    /* ignore */
  }
}

export function takeInviteCode(): string | null {
  try {
    const code = sessionStorage.getItem(KEY);
    if (code) sessionStorage.removeItem(KEY);
    return code;
  } catch {
    return null;
  }
}

export function peekInviteCode(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
