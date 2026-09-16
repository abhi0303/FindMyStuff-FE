import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, type LoginDto, type SignupDto } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { forceLogout, onAuthEvent } from '@/api/client';
import { clearTokens, getRefreshToken, hasSession, setTokens } from '@/api/tokens';
import type { AuthResponse, Me } from '@/api/types';
import { getOfflineSnapshot, loadOfflineUser, noteServerReachable, setMode } from '@/offline/store';

/** Matches the offline provider: a server this slow is asleep, not broken. */
const SERVER_SLOW_AFTER_MS = 4000;

type Status = 'loading' | 'authenticated' | 'anonymous' | 'unreachable';

interface AuthContextValue {
  status: Status;
  user: Me | null;
  /** True while the server is refusing normal routes pending terms acceptance. */
  termsRequired: boolean;
  requiredTermsVersion: string | null;
  /** Bootstrap failed for a reason that is not the session's fault (offline, 429, 5xx). */
  retryBootstrap: () => void;
  /** The profile saved with this device's backup, when the server can't be reached. */
  offlineUser: Me | null;
  /** Open the app on the backup instead of waiting for the server. */
  enterOffline: () => void;
  login: (dto: LoginDto) => Promise<void>;
  signup: (dto: SignupDto) => Promise<void>;
  logout: () => Promise<void>;
  acceptTerms: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>(() => (hasSession() ? 'loading' : 'anonymous'));
  const [bootstrapNonce, setBootstrapNonce] = useState(0);
  const [user, setUser] = useState<Me | null>(null);
  const [termsRequired, setTermsRequired] = useState(false);
  const [requiredTermsVersion, setRequiredTermsVersion] = useState<string | null>(null);
  const [offlineUser, setOfflineUser] = useState<Me | null>(null);

  const applyMe = useCallback((me: Me) => {
    setUser(me);
    setTermsRequired(me.termsAcceptanceRequired);
    setRequiredTermsVersion(me.currentTermsVersion ?? null);
    setStatus('authenticated');
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await authApi.me();
    applyMe(me);
  }, [applyMe]);

  // Bootstrap: /auth/me works even while terms acceptance is pending.
  useEffect(() => {
    if (!hasSession()) {
      setStatus('anonymous');
      return;
    }
    let cancelled = false;
    let settled = false;
    setStatus('loading');

    /* The API sleeps when idle and can take a minute to wake — and a sleeping instance holds
       the connection open rather than failing, so nothing is "retrying" meanwhile. Measure the
       wait directly: after a few seconds, open on this device's saved copy and let the
       reconnect banner offer the latest once the server answers. */
    const slowTimer = window.setTimeout(() => {
      void (async () => {
        const cached = await loadOfflineUser().catch(() => null);
        if (!cached || settled || cancelled) return;
        setMode('offline', { reason: 'auto' });
        applyMe({ ...cached, termsAcceptanceRequired: false });
      })();
    }, SERVER_SLOW_AFTER_MS);

    const bootstrap = async () => {
      // Left in offline mode last time: open straight on the backup, no network wait.
      if (getOfflineSnapshot().mode === 'offline') {
        const cached = await loadOfflineUser().catch(() => null);
        if (cancelled) return;
        if (cached) {
          applyMe({ ...cached, termsAcceptanceRequired: false });
          return;
        }
        setMode('live', { sendQueued: false }); // nothing to show offline
      }

      try {
        const me = await authApi.me();
        settled = true;
        // Awake: if we opened on the saved copy meanwhile, offer the latest data.
        noteServerReachable();
        if (!cancelled) applyMe(me);
      } catch (error) {
        settled = true;
        if (cancelled) return;
        // Only a genuine auth failure means the session is dead. Being offline,
        // rate limited or hitting a 5xx must not throw away a valid session —
        // that would sign people out for a blip and cost them their refresh token.
        if (error instanceof ApiError && error.status === 401) {
          clearTokens();
          setStatus('anonymous');
          return;
        }
        setStatus('unreachable');
        const cached = await loadOfflineUser().catch(() => null);
        if (!cancelled) setOfflineUser(cached);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, [applyMe, bootstrapNonce]);

  const retryBootstrap = useCallback(() => setBootstrapNonce((n) => n + 1), []);

  const enterOffline = useCallback(() => {
    if (!offlineUser) return;
    setMode('offline');
    applyMe({ ...offlineUser, termsAcceptanceRequired: false });
  }, [applyMe, offlineUser]);

  // The HTTP layer reports terms + forced logout globally, from any request.
  useEffect(
    () =>
      onAuthEvent((event, payload) => {
        if (event === 'terms-required') {
          setTermsRequired(true);
          if (typeof payload === 'string') setRequiredTermsVersion(payload);
        } else if (event === 'logout') {
          setUser(null);
          setOfflineUser(null);
          setStatus('anonymous');
          setTermsRequired(false);
          qc.clear();
        }
      }),
    [qc],
  );

  const afterAuth = useCallback(
    async (res: AuthResponse) => {
      setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      qc.clear();
      if (res.termsAcceptanceRequired) {
        setTermsRequired(true);
        setRequiredTermsVersion(res.currentTermsVersion ?? null);
      }
      await refreshUser();
    },
    [qc, refreshUser],
  );

  const login = useCallback(
    async (dto: LoginDto) => {
      await afterAuth(await authApi.login(dto));
    },
    [afterAuth],
  );

  const signup = useCallback(
    async (dto: SignupDto) => {
      await afterAuth(await authApi.signup(dto));
    },
    [afterAuth],
  );

  const logout = useCallback(async () => {
    const token = getRefreshToken();
    if (token) {
      // Best effort: a failed revoke must not strand the user in a logged-in shell.
      await authApi.logout(token).catch(() => undefined);
    }
    forceLogout();
  }, []);

  const acceptTerms = useCallback(async () => {
    await authApi.acceptTerms(requiredTermsVersion ?? undefined);
    setTermsRequired(false);
    await refreshUser();
    qc.invalidateQueries();
  }, [qc, refreshUser, requiredTermsVersion]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status, user, termsRequired, requiredTermsVersion, offlineUser,
      login, signup, logout, acceptTerms, refreshUser, retryBootstrap, enterOffline,
    }),
    [
      status, user, termsRequired, requiredTermsVersion, offlineUser,
      login, signup, logout, acceptTerms, refreshUser, retryBootstrap, enterOffline,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
