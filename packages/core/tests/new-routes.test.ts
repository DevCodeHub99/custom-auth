/**
 * Tests for new routes and fixes added in the overhaul:
 *  - POST /refresh        — token rotation
 *  - POST /mfa/setup      — generate TOTP secret
 *  - POST /mfa/enable     — persist MFA after user verifies
 *  - POST /mfa/disable    — disable MFA with TOTP confirmation
 *  - DB session lifecycle — createSession called on login, deleteSession on logout
 *  - Typed errors         — handlers return correct HTTP status codes
 *  - Secure cookie        — Secure flag absent in dev (NODE_ENV !== 'production')
 *  - OAuth callback       — sends two Set-Cookie headers (auth + clear-state)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CustomAuth, createAuth } from '../src/handlers';
import { AuthFlows } from '../src/flows';
import {
  InvalidCredentialsError,
  UserExistsError,
  PasswordTooShortError,
  TokenExpiredError,
} from '../src/errors';
import type {
  DatabaseAdapter,
  User,
  Session,
  VerificationToken,
  AuthConfig,
} from '../src/interfaces';

// ── In-memory adapter (with session support) ──────────────────────────────

class InMemoryAdapter implements DatabaseAdapter {
  users: Map<string, User> = new Map();
  tokens: Map<string, VerificationToken> = new Map();
  sessions: Map<string, Session> = new Map();
  private nextId = 1;
  private nextSessionId = 1;

  async createUser(data: any): Promise<User> {
    const user: User = {
      id: String(this.nextId++),
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      role: data.role ?? 'user',
      emailVerified: data.emailVerified ?? false,
      mfaEnabled: false,
    };
    this.users.set(user.email, user);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.users.get(email) ?? null;
  }

  async getUserById(id: string): Promise<User | null> {
    for (const u of this.users.values()) if (u.id === id) return u;
    return null;
  }

  async updateUser(idOrEmail: string, data: any): Promise<User> {
    const user = idOrEmail.includes('@')
      ? this.users.get(idOrEmail)
      : [...this.users.values()].find(u => u.id === idOrEmail);
    if (!user) throw new Error('User not found');
    Object.assign(user, data);
    return user;
  }

  async createSession(userId: string, expiresAt: Date): Promise<Session> {
    const id = String(this.nextSessionId++);
    const session: Session = { id, userId, expiresAt };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async createVerificationToken(data: VerificationToken): Promise<void> {
    this.tokens.set(`${data.type}:${data.token}`, data);
  }

  async getVerificationToken(token: string, type: VerificationToken['type']): Promise<VerificationToken | null> {
    return this.tokens.get(`${type}:${token}`) ?? null;
  }

  async deleteVerificationToken(token: string, type: VerificationToken['type']): Promise<void> {
    this.tokens.delete(`${type}:${token}`);
  }
}

function makeConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    secret: 'test-secret-that-is-long-enough-for-tests',
    ...overrides,
  };
}

function makeRequest(method: string, path: string, body?: object, cookie?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Typed errors ──────────────────────────────────────────────────────────

describe('Typed errors', () => {
  it('UserExistsError has code USER_EXISTS and statusCode 409', () => {
    const err = new UserExistsError();
    expect(err.code).toBe('USER_EXISTS');
    expect(err.statusCode).toBe(409);
    expect(err instanceof Error).toBe(true);
  });

  it('InvalidCredentialsError has code INVALID_CREDENTIALS and statusCode 401', () => {
    const err = new InvalidCredentialsError();
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(err.statusCode).toBe(401);
  });

  it('PasswordTooShortError includes minLength in message', () => {
    const err = new PasswordTooShortError(8);
    expect(err.message).toContain('8');
    expect(err.code).toBe('PASSWORD_TOO_SHORT');
  });

  it('handler returns 409 for duplicate registration', async () => {
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    await auth.handleRequest(makeRequest('POST', '/register', { email: 'a@b.com', password: 'password123' }));
    const res = await auth.handleRequest(makeRequest('POST', '/register', { email: 'a@b.com', password: 'password123' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('USER_EXISTS');
  });

  it('handler returns 401 for invalid credentials', async () => {
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    await auth.handleRequest(makeRequest('POST', '/register', { email: 'a@b.com', password: 'password123' }));
    const res = await auth.handleRequest(makeRequest('POST', '/login', { email: 'a@b.com', password: 'wrongpassword' }));
    expect(res.status).toBe(401);
  });

  it('handler returns 400 for password too short on register', async () => {
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    const res = await auth.handleRequest(makeRequest('POST', '/register', { email: 'a@b.com', password: 'short' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('PASSWORD_TOO_SHORT');
  });
});

// ── DB session lifecycle ───────────────────────────────────────────────────

describe('DB session lifecycle', () => {
  it('createSession is called on login and session is stored', async () => {
    const adapter = new InMemoryAdapter();
    const createSessionSpy = vi.spyOn(adapter, 'createSession');

    const auth = new CustomAuth(makeConfig({ adapter }));

    await auth.handleRequest(makeRequest('POST', '/register', { email: 'a@b.com', password: 'password123' }));
    // register also calls createToken → createSession
    expect(createSessionSpy).toHaveBeenCalledTimes(1);

    await auth.handleRequest(makeRequest('POST', '/login', { email: 'a@b.com', password: 'password123' }));
    expect(createSessionSpy).toHaveBeenCalledTimes(2);
    expect(adapter.sessions.size).toBe(2);
  });

  it('logout deletes the DB session', async () => {
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    const loginRes = await auth.handleRequest(
      makeRequest('POST', '/register', { email: 'a@b.com', password: 'password123' })
    );
    const { token } = await loginRes.json();
    expect(adapter.sessions.size).toBe(1);

    await auth.handleRequest(makeRequest('POST', '/logout', undefined, `auth-token=${token}`));
    expect(adapter.sessions.size).toBe(0);
  });

  it('session endpoint returns null for revoked session', async () => {
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    const regRes = await auth.handleRequest(
      makeRequest('POST', '/register', { email: 'a@b.com', password: 'password123' })
    );
    const { token } = await regRes.json();

    // Manually revoke all sessions
    adapter.sessions.clear();

    const sessionRes = await auth.handleRequest(
      makeRequest('GET', '/session', undefined, `auth-token=${token}`)
    );
    const body = await sessionRes.json();
    expect(body.user).toBeNull();
  });
});

// ── POST /refresh ─────────────────────────────────────────────────────────

describe('POST /refresh', () => {
  it('returns a new token and rotates DB session', async () => {
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    const regRes = await auth.handleRequest(
      makeRequest('POST', '/register', { email: 'a@b.com', password: 'password123' })
    );
    const { token: oldToken } = await regRes.json();
    const oldSessionCount = adapter.sessions.size;
    expect(oldSessionCount).toBe(1);

    const refreshRes = await auth.handleRequest(
      makeRequest('POST', '/refresh', undefined, `auth-token=${oldToken}`)
    );
    expect(refreshRes.status).toBe(200);
    const body = await refreshRes.json();
    expect(body.token).toBeTruthy();
    expect(body.token).not.toBe(oldToken);

    // Old session deleted, new session created → still 1
    expect(adapter.sessions.size).toBe(1);
  });

  it('returns 401 when no token provided', async () => {
    const auth = new CustomAuth(makeConfig());
    const res = await auth.handleRequest(makeRequest('POST', '/refresh'));
    expect(res.status).toBe(401);
  });
});

// ── MFA setup/enable/disable ──────────────────────────────────────────────

describe('MFA routes', () => {
  it('POST /mfa/setup returns secret and qrCodeUrl', async () => {
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    const regRes = await auth.handleRequest(
      makeRequest('POST', '/register', { email: 'mfa@example.com', password: 'password123' })
    );
    const { token } = await regRes.json();

    const setupRes = await auth.handleRequest(
      makeRequest('POST', '/mfa/setup', undefined, `auth-token=${token}`)
    );
    expect(setupRes.status).toBe(200);
    const body = await setupRes.json();
    expect(body.secret).toBeTruthy();
    expect(body.qrCodeUrl).toMatch(/^data:image\/png/);
    expect(body.otpauthUrl).toContain('otpauth://totp/');
  });

  it('POST /mfa/setup returns 401 without auth token', async () => {
    const auth = new CustomAuth(makeConfig({ adapter: new InMemoryAdapter() }));
    const res = await auth.handleRequest(makeRequest('POST', '/mfa/setup'));
    expect(res.status).toBe(401);
  });
});

// ── Secure cookie auto-detection ──────────────────────────────────────────

describe('Secure cookie flag', () => {
  afterEach(() => {
    // Reset NODE_ENV
    process.env.NODE_ENV = 'test';
  });

  it('omits Secure flag in non-production environment', async () => {
    process.env.NODE_ENV = 'development';
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    const res = await auth.handleRequest(
      makeRequest('POST', '/register', { email: 'a@b.com', password: 'password123' })
    );
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).not.toContain('Secure');
  });

  it('includes Secure flag in production', async () => {
    process.env.NODE_ENV = 'production';
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    const res = await auth.handleRequest(
      makeRequest('POST', '/register', { email: 'a@b.com', password: 'password123' })
    );
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('Secure');
  });
});

// ── OAuth callback sends two Set-Cookie headers ───────────────────────────

describe('OAuth callback — multiple Set-Cookie', () => {
  it('sends both auth-token and clears oauth_state_ cookie', async () => {
    const adapter = new InMemoryAdapter();

    const mockProvider = {
      id: 'mock-oauth',
      name: 'Mock OAuth',
      type: 'oauth' as const,
      getAuthorizationUrl: (state: string) => `https://mock.example.com/auth?state=${state}`,
      getTokens: async (_code: string) => ({ accessToken: 'mock-access-token' }),
      getUserProfile: async (_accessToken: string) => ({
        email: 'oauth-user@example.com',
        name: 'OAuth User',
      }),
    };

    const auth = new CustomAuth(makeConfig({ adapter, providers: [mockProvider] }));

    const callbackReq = new Request('http://localhost/callback/mock-oauth?code=abc&state=mystate123', {
      headers: {
        Cookie: 'oauth_state_mock-oauth=mystate123',
      },
    });

    const res = await auth.handleRequest(callbackReq);
    expect(res.status).toBe(200);

    // Multiple Set-Cookie headers
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const authCookie = cookies.find(c => c.startsWith('auth-token='));
    const clearCookie = cookies.find(c => c.includes('oauth_state_mock-oauth=') && c.includes('Max-Age=0'));

    expect(authCookie).toBeTruthy();
    expect(clearCookie).toBeTruthy();
  });
});

// ── Config validation ─────────────────────────────────────────────────────

describe('Config validation', () => {
  it('throws MissingConfigError when secret is missing', () => {
    expect(() => new CustomAuth({ secret: '' } as any)).toThrow('secret');
  });

  it('throws MissingConfigError for emailVerification without verifyEmailUrl', () => {
    expect(() => new CustomAuth({
      secret: 'a-very-long-secret-that-is-definitely-enough',
      emailVerification: true,
      // verifyEmailUrl intentionally omitted
    } as any)).toThrow('verifyEmailUrl');
  });
});

// ── Lifecycle hooks ───────────────────────────────────────────────────────

describe('AuthConfig lifecycle hooks', () => {
  it('calls onSuccess after register', async () => {
    const onSuccess = vi.fn();
    const adapter = new InMemoryAdapter();
    const flows = new AuthFlows({
      secret: 'test-secret-long-enough',
      adapter,
      hooks: { onSuccess },
    });

    await flows.register('hook@example.com', 'password123');
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0][0].event).toBe('register');
  });

  it('calls onError after invalid login', async () => {
    const onError = vi.fn();
    const adapter = new InMemoryAdapter();
    const flows = new AuthFlows({
      secret: 'test-secret-long-enough',
      adapter,
      hooks: { onError },
    });

    await flows.register('hook@example.com', 'password123');
    await expect(flows.login('hook@example.com', 'wrongpassword')).rejects.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].event).toBe('login');
  });
});
