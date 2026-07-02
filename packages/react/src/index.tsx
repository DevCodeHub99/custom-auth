import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ── User type ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
}

// ── Discriminated union for signIn result ─────────────────────────────────
// The caller can check `result.mfaRequired` instead of catching exceptions.

export type SignInResult =
  | { ok: true; user: User }
  | { ok: false; mfaRequired: true; tempToken: string }
  | { ok: false; mfaRequired?: never; error: string };

// ── Context ───────────────────────────────────────────────────────────────

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────

export interface AuthProviderProps {
  children: ReactNode;
  apiBaseUrl?: string;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  apiBaseUrl = '/api/auth',
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/session`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Sign in with email + password.
   * Returns a discriminated union — never throws for expected auth outcomes.
   *
   *   const result = await signIn(email, password);
   *   if (!result.ok && result.mfaRequired) {
   *     // show TOTP prompt, pass result.tempToken to verifyMfa()
   *   }
   */
  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const res = await fetch(`${apiBaseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return { ok: false, error: data.error ?? 'Sign in failed' };
      }

      if (data.mfaRequired) {
        return { ok: false, mfaRequired: true, tempToken: data.tempToken };
      }

      // Success path: sync session state
      if (data.user) setUser(data.user);
      else await refresh();

      return { ok: true, user: data.user };
    },
    [apiBaseUrl, refresh]
  );

  const signUp = useCallback(
    async (email: string, password: string, name?: string) => {
      const res = await fetch(`${apiBaseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, name }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Sign up failed');
      }

      await refresh();
    },
    [apiBaseUrl, refresh]
  );

  const signOut = useCallback(async () => {
    await fetch(`${apiBaseUrl}/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    setUser(null);
  }, [apiBaseUrl]);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

// ── Core hook ─────────────────────────────────────────────────────────────

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// ── Convenience hooks ─────────────────────────────────────────────────────

export const useSession = () => {
  const { user, isLoading } = useAuth();
  return { user, isLoading, isAuthenticated: !!user };
};

export const useSignIn = () => {
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await signIn(email, password);
        if (!result.ok && !result.mfaRequired) setError(result.error);
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [signIn]
  );

  return { signIn: execute, isLoading, error };
};

export const useSignUp = () => {
  const { signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (email: string, password: string, name?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        await signUp(email, password, name);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Sign up failed';
        setError(msg);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [signUp]
  );

  return { signUp: execute, isLoading, error };
};

export const useSignOut = () => {
  const { signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const execute = useCallback(async () => {
    setIsLoading(true);
    try {
      await signOut();
    } finally {
      setIsLoading(false);
    }
  }, [signOut]);

  return { signOut: execute, isLoading };
};

// ── useMagicLink ──────────────────────────────────────────────────────────

export interface UseMagicLinkResult {
  requestMagicLink: (email: string, callbackUrl: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  sent: boolean;
}

export function useMagicLink(apiBaseUrl = '/api/auth'): UseMagicLinkResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const requestMagicLink = useCallback(
    async (email: string, callbackUrl: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, callbackUrl }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Failed to send magic link');
        setSent(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to send magic link';
        setError(msg);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [apiBaseUrl]
  );

  return { requestMagicLink, isLoading, error, sent };
}

// ── useForgotPassword ─────────────────────────────────────────────────────

export interface UseForgotPasswordResult {
  requestReset: (email: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  sent: boolean;
}

export function useForgotPassword(apiBaseUrl = '/api/auth'): UseForgotPasswordResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const requestReset = useCallback(
    async (email: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Failed to send reset email');
        setSent(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to send reset email';
        setError(msg);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [apiBaseUrl]
  );

  return { requestReset, isLoading, error, sent };
}

// ── useResetPassword ──────────────────────────────────────────────────────

export interface UseResetPasswordResult {
  resetPassword: (token: string, email: string, password: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  success: boolean;
}

export function useResetPassword(apiBaseUrl = '/api/auth'): UseResetPasswordResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetPassword = useCallback(
    async (token: string, email: string, password: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Password reset failed');
        setSuccess(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Password reset failed';
        setError(msg);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [apiBaseUrl]
  );

  return { resetPassword, isLoading, error, success };
}

// ── useOAuth ──────────────────────────────────────────────────────────────

export interface UseOAuthResult {
  signInWithOAuth: (provider: string) => void;
}

export function useOAuth(apiBaseUrl = '/api/auth'): UseOAuthResult {
  const signInWithOAuth = useCallback(
    (provider: string) => {
      window.location.href = `${apiBaseUrl}/oauth/${provider}`;
    },
    [apiBaseUrl]
  );

  return { signInWithOAuth };
}

// ── useMfa ────────────────────────────────────────────────────────────────

export interface UseMfaResult {
  /** Submit TOTP code for a pending MFA challenge */
  verifyMfa: (tempToken: string, code: string) => Promise<{ user: User }>;
  /** Fetch setup QR code + secret for a logged-in user */
  setupMfa: () => Promise<{ secret: string; qrCodeUrl: string; otpauthUrl: string }>;
  /** Enable MFA after user verifies the setup code */
  enableMfa: (secret: string, code: string) => Promise<void>;
  /** Disable MFA — requires a valid TOTP code to confirm */
  disableMfa: (code: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useMfa(apiBaseUrl = '/api/auth'): UseMfaResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrap = useCallback(
    // eslint-disable-next-line @typescript-eslint/comma-dangle
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setIsLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'MFA operation failed';
        setError(msg);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const verifyMfa = useCallback(
    (tempToken: string, code: string) =>
      wrap(async () => {
        const res = await fetch(`${apiBaseUrl}/mfa/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ tempToken, code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'MFA verification failed');
        return data as { user: User };
      }),
    [apiBaseUrl, wrap]
  );

  const setupMfa = useCallback(
    () =>
      wrap(async () => {
        const res = await fetch(`${apiBaseUrl}/mfa/setup`, {
          method: 'POST',
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'MFA setup failed');
        return data as { secret: string; qrCodeUrl: string; otpauthUrl: string };
      }),
    [apiBaseUrl, wrap]
  );

  const enableMfa = useCallback(
    (secret: string, code: string) =>
      wrap(async () => {
        const res = await fetch(`${apiBaseUrl}/mfa/enable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ secret, code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'MFA enable failed');
      }),
    [apiBaseUrl, wrap]
  );

  const disableMfa = useCallback(
    (code: string) =>
      wrap(async () => {
        const res = await fetch(`${apiBaseUrl}/mfa/disable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'MFA disable failed');
      }),
    [apiBaseUrl, wrap]
  );

  return { verifyMfa, setupMfa, enableMfa, disableMfa, isLoading, error };
}

// ── useOtp ────────────────────────────────────────────────────────────────

export interface UseOtpResult {
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<{ user: User }>;
  isLoading: boolean;
  error: string | null;
  sent: boolean;
}

export function useOtp(apiBaseUrl = '/api/auth'): UseOtpResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const requestOtp = useCallback(
    async (email: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Failed to request OTP');
        setSent(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to request OTP';
        setError(msg);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [apiBaseUrl]
  );

  const verifyOtp = useCallback(
    async (email: string, code: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/otp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'OTP verification failed');
        return data as { user: User };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'OTP verification failed';
        setError(msg);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [apiBaseUrl]
  );

  return { requestOtp, verifyOtp, isLoading, error, sent };
}
