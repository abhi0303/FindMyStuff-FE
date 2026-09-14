import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, type LoginDto, type SignupDto } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { forceLogout, onAuthEvent } from '@/api/client';
import { clearTokens, getRefreshToken, hasSession, setTokens } from '@/api/tokens';
import type { AuthResponse, Me } from '@/api/types';

type Status = 'loading' | 'authenticated' | 'anonymous' | 'unreachable';

interface AuthContextValue {
  status: Status;
  user: Me | null;
  /** True while the server is refusing normal routes pending terms acceptance. */
  termsRequired: boolean;
  requiredTermsVersion: string | null;
  /** Bootstrap failed for a reason that is not the session's fault (offline, 429, 5xx). */
  retryBootstrap: () => void;
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
    setStatus('loading');
    authApi
      .me()
      .then((me) => {
        if (!cancelled) applyMe(me);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Only a genuine auth failure means the session is dead. Being offline,
        // rate limited or hitting a 5xx must not throw away a valid session —
        // that would sign people out for a blip and cost them their refresh token.
        if (error instanceof ApiError && error.status === 401) {
          clearTokens();
          setStatus('anonymous');
        } else {
          setStatus('unreachable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyMe, bootstrapNonce]);

  const retryBootstrap = useCallback(() => setBootstrapNonce((n) => n + 1), []);

  // The HTTP layer reports terms + forced logout globally, from any request.
  useEffect(
    () =>
      onAuthEvent((event, payload) => {
        if (event === 'terms-required') {
          setTermsRequired(true);
          if (typeof payload === 'string') setRequiredTermsVersion(payload);
        } else if (event === 'logout') {
          setUser(null);
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
      status, user, termsRequired, requiredTermsVersion,
      login, signup, logout, acceptTerms, refreshUser, retryBootstrap,
    }),
    [status, user, termsRequired, requiredTermsVersion, login, signup, logout, acceptTerms, refreshUser, retryBootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
