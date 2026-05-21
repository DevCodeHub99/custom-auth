/**
 * Flow tests: register, login (valid + invalid), magic-link generate+verify,
 * logout (via handler), session (via handler), password reset, email verify.
 *
 * Uses an in-memory adapter — no real DB needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthFlows } from '../src/flows';
import { CustomAuth } from '../src/handlers';
import type { DatabaseAdapter, EmailAdapter, User, VerificationToken, AuthConfig } from '../src/interfaces';

// ── In-memory adapter ─────────────────────────────────────────────────────

class InMemoryAdapter implements DatabaseAdapter {
  users: Map<string, User> = new Map();
  tokens: Map<string, VerificationToken> = new Map();
  private nextId = 1;

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

  async createVerificationToken(data: VerificationToken): Promise<void> {
    this.tokens.set(`${data.token}:${data.type}`, data);
  }

  async getVerificationToken(token: string, type: VerificationToken['type']): Promise<VerificationToken | null> {
    return this.tokens.get(`${token}:${type}`) ?? null;
  }

  async deleteVerificationToken(token: string, type: VerificationToken['type']): Promise<void> {
    this.tokens.delete(`${token}:${type}`);
  }
}

// ── In-memory email adapter ───────────────────────────────────────────────

class InMemoryEmailAdapter implements EmailAdapter {
  sent: { type: string; email: string; url: string }[] = [];

  async sendVerificationEmail(email: string, url: string) {
    this.sent.push({ type: 'verify', email, url });
  }
  async sendPasswordResetEmail(email: string, url: string) {
    this.sent.push({ type: 'reset', email, url });
  }
  async sendMagicLinkEmail(email: string, url: string) {
    this.sent.push({ type: 'magic', email, url });
  }
}

// ── shared test config ────────────────────────────────────────────────────

const SECRET = 'test-secret-key-long-enough-for-hs256-algo';

function makeConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    secret: SECRET,
    ...overrides,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────

function makeRequest(method: string, path: string, body?: object, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe('AuthFlows — register', () => {
  it('creates a user and returns a token', async () => {
    const adapter = new InMemoryAdapter();
    const flows = new AuthFlows(makeConfig({ adapter }));

    const result = await flows.register('alice@example.com', 'password123', 'Alice');
    expect(result.user.email).toBe('alice@example.com');
    expect(result.user.id).toBeDefined();
    expect(result.token).toBeTruthy();
    // password should be hashed, not stored in plaintext
    expect(result.user.passwordHash).not.toBe('password123');
  });

  it('throws if user already exists', async () => {
    const adapter = new InMemoryAdapter();
    const flows = new AuthFlows(makeConfig({ adapter }));

    await flows.register('alice@example.com', 'password123');
    await expect(flows.register('alice@example.com', 'password123')).rejects.toThrow('User already exists');
  });

  it('sends verification email when emailVerification=true', async () => {
    const adapter = new InMemoryAdapter();
    const emailAdapter = new InMemoryEmailAdapter();
    const flows = new AuthFlows(makeConfig({
      adapter,
      emailAdapter,
      emailVerification: true,
      verifyEmailUrl: 'https://example.com/verify-email',
    }));

    await flows.register('bob@example.com', 'password123');
    expect(emailAdapter.sent).toHaveLength(1);
    expect(emailAdapter.sent[0].type).toBe('verify');
    expect(emailAdapter.sent[0].url).toContain('token=');
  });
});

describe('AuthFlows — login', () => {
  it('returns token for valid credentials', async () => {
    const adapter = new InMemoryAdapter();
    const flows = new AuthFlows(makeConfig({ adapter }));

    await flows.register('alice@example.com', 'password123');
    const result = await flows.login('alice@example.com', 'password123');

    expect('token' in result).toBe(true);
    if ('token' in result) {
      expect(result.user.email).toBe('alice@example.com');
      expect(result.token).toBeTruthy();
    }
  });

  it('throws for wrong password', async () => {
    const adapter = new InMemoryAdapter();
    const flows = new AuthFlows(makeConfig({ adapter }));

    await flows.register('alice@example.com', 'password123');
    await expect(flows.login('alice@example.com', 'wrongpass')).rejects.toThrow('Invalid credentials');
  });

  it('throws when password omitted but account has hash (FIX #3)', async () => {
    const adapter = new InMemoryAdapter();
    const flows = new AuthFlows(makeConfig({ adapter }));

    await flows.register('alice@example.com', 'password123');
    await expect(flows.login('alice@example.com')).rejects.toThrow('Invalid credentials');
  });

  it('throws for unknown user', async () => {
    const adapter = new InMemoryAdapter();
    const flows = new AuthFlows(makeConfig({ adapter }));

    await expect(flows.login('ghost@example.com', 'password123')).rejects.toThrow('Invalid credentials');
  });
});

describe('AuthFlows — magic link', () => {
  it('generates a link and verifies it', async () => {
    const adapter = new InMemoryAdapter();
    const emailAdapter = new InMemoryEmailAdapter();
    const flows = new AuthFlows(makeConfig({ adapter, emailAdapter }));

    await flows.requestMagicLink('carol@example.com', 'https://app.com/magic');
    expect(emailAdapter.sent).toHaveLength(1);
    const url = new URL(emailAdapter.sent[0].url);
    const token = url.searchParams.get('token')!;
    const email = url.searchParams.get('email')!;

    const result = await flows.verifyMagicLink(token, email);
    expect(result.user.email).toBe('carol@example.com');
    expect(result.token).toBeTruthy();
  });

  it('rejects an invalid token', async () => {
    const adapter = new InMemoryAdapter();
    const emailAdapter = new InMemoryEmailAdapter();
    const flows = new AuthFlows(makeConfig({ adapter, emailAdapter }));

    await flows.requestMagicLink('carol@example.com', 'https://app.com/magic');
    await expect(flows.verifyMagicLink('badtoken', 'carol@example.com')).rejects.toThrow(
      'Invalid or expired magic link'
    );
  });

  it('rejects an expired token', async () => {
    const adapter = new InMemoryAdapter();
    const emailAdapter = new InMemoryEmailAdapter();
    const flows = new AuthFlows(makeConfig({ adapter, emailAdapter }));

    await flows.requestMagicLink('carol@example.com', 'https://app.com/magic');
    const url = new URL(emailAdapter.sent[0].url);
    const token = url.searchParams.get('token')!;
    const email = url.searchParams.get('email')!;

    // Manually expire the token
    const key = `${token}:magic-link`;
    const record = adapter.tokens.get(key)!;
    record.expiresAt = new Date(Date.now() - 1000); // already expired

    await expect(flows.verifyMagicLink(token, email)).rejects.toThrow('expired');
  });

  it('is single-use — second verify fails', async () => {
    const adapter = new InMemoryAdapter();
    const emailAdapter = new InMemoryEmailAdapter();
    const flows = new AuthFlows(makeConfig({ adapter, emailAdapter }));

    await flows.requestMagicLink('carol@example.com', 'https://app.com/magic');
    const url = new URL(emailAdapter.sent[0].url);
    const token = url.searchParams.get('token')!;
    const email = url.searchParams.get('email')!;

    await flows.verifyMagicLink(token, email); // first use
    await expect(flows.verifyMagicLink(token, email)).rejects.toThrow(); // second use
  });
});

describe('AuthFlows — password reset', () => {
  it('full reset flow works', async () => {
    const adapter = new InMemoryAdapter();
    const emailAdapter = new InMemoryEmailAdapter();
    const flows = new AuthFlows(makeConfig({
      adapter,
      emailAdapter,
      resetPasswordUrl: 'https://app.com/reset-password',
    }));

    await flows.register('dave@example.com', 'oldpassword');
    await flows.requestPasswordReset('dave@example.com', 'https://app.com/reset-password');
    expect(emailAdapter.sent).toHaveLength(1);

    const url = new URL(emailAdapter.sent[0].url);
    const token = url.searchParams.get('token')!;
    const email = url.searchParams.get('email')!;

    await flows.resetPassword(token, email, 'newpassword123');

    // Old password must fail
    await expect(flows.login('dave@example.com', 'oldpassword')).rejects.toThrow('Invalid credentials');
    // New password must work
    const result = await flows.login('dave@example.com', 'newpassword123');
    expect('token' in result).toBe(true);
  });

  it('silently succeeds for unknown email (no info leak)', async () => {
    const adapter = new InMemoryAdapter();
    const emailAdapter = new InMemoryEmailAdapter();
    const flows = new AuthFlows(makeConfig({
      adapter,
      emailAdapter,
      resetPasswordUrl: 'https://app.com/reset-password',
    }));

    // Should not throw
    await flows.requestPasswordReset('nobody@example.com', 'https://app.com/reset-password');
    expect(emailAdapter.sent).toHaveLength(0);
  });

  it('rejects short passwords', async () => {
    const adapter = new InMemoryAdapter();
    const emailAdapter = new InMemoryEmailAdapter();
    const flows = new AuthFlows(makeConfig({
      adapter,
      emailAdapter,
      resetPasswordUrl: 'https://app.com/reset-password',
    }));

    await flows.register('dave@example.com', 'oldpass123');
    await flows.requestPasswordReset('dave@example.com', 'https://app.com/reset-password');
    const url = new URL(emailAdapter.sent[0].url);
    const token = url.searchParams.get('token')!;
    const email = url.searchParams.get('email')!;

    await expect(flows.resetPassword(token, email, 'short')).rejects.toThrow('8 characters');
  });
});

describe('Handler — /logout and /session', () => {
  it('logout returns 200 and clears cookie', async () => {
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    // Register first to get a token
    const reg = await auth.handleRequest(makeRequest('POST', '/register', {
      email: 'eve@example.com',
      password: 'password123',
    }));
    const { token } = await reg.json();

    const res = await auth.handleRequest(
      makeRequest('POST', '/logout', undefined, { Authorization: `Bearer ${token}` })
    );
    expect(res.status).toBe(200);
    const cookieHeader = res.headers.get('set-cookie') ?? '';
    expect(cookieHeader).toContain('Max-Age=0');
  });

  it('session returns user when valid token provided', async () => {
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    const reg = await auth.handleRequest(makeRequest('POST', '/register', {
      email: 'frank@example.com',
      password: 'password123',
    }));
    const { token } = await reg.json();

    const res = await auth.handleRequest(
      makeRequest('GET', '/session', undefined, { Authorization: `Bearer ${token}` })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('frank@example.com');
  });

  it('session returns null user when no token', async () => {
    const adapter = new InMemoryAdapter();
    const auth = new CustomAuth(makeConfig({ adapter }));

    const res = await auth.handleRequest(makeRequest('GET', '/session'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
  });
});

describe('Handler — rate limiting', () => {
  it('blocks after limit exceeded on /login', async () => {
    const adapter = new InMemoryAdapter();
    let callCount = 0;
    const rateLimiter = {
      check: async (key: string) => {
        callCount++;
        return callCount <= 2; // allow first 2, then block
      },
    };

    const auth = new CustomAuth(makeConfig({ adapter, rateLimiter }));

    // First two pass (but will fail with invalid credentials — that's OK)
    const r1 = await auth.handleRequest(makeRequest('POST', '/login', { email: 'x@x.com', password: 'password123' }));
    expect(r1.status).not.toBe(429);

    const r2 = await auth.handleRequest(makeRequest('POST', '/login', { email: 'x@x.com', password: 'password123' }));
    expect(r2.status).not.toBe(429);

    // Third is rate-limited
    const r3 = await auth.handleRequest(makeRequest('POST', '/login', { email: 'x@x.com', password: 'password123' }));
    expect(r3.status).toBe(429);
  });
});

describe('Handler — /forgot-password + /reset-password', () => {
  it('full reset via HTTP handlers', async () => {
    const adapter = new InMemoryAdapter();
    const emailAdapter = new InMemoryEmailAdapter();
    const auth = new CustomAuth(makeConfig({
      adapter,
      emailAdapter,
      resetPasswordUrl: 'https://app.com/reset-password',
    }));

    // Register
    await auth.handleRequest(makeRequest('POST', '/register', {
      email: 'grace@example.com',
      password: 'oldpass123',
    }));

    // Request reset
    const forgotRes = await auth.handleRequest(makeRequest('POST', '/forgot-password', {
      email: 'grace@example.com',
    }));
    expect(forgotRes.status).toBe(200);
    expect(emailAdapter.sent).toHaveLength(1);

    const url = new URL(emailAdapter.sent[0].url);
    const token = url.searchParams.get('token')!;

    // Reset
    const resetRes = await auth.handleRequest(makeRequest('POST', '/reset-password', {
      token,
      email: 'grace@example.com',
      password: 'newpass456',
    }));
    expect(resetRes.status).toBe(200);

    // Login with new password
    const loginRes = await auth.handleRequest(makeRequest('POST', '/login', {
      email: 'grace@example.com',
      password: 'newpass456',
    }));
    expect(loginRes.status).toBe(200);
    const body = await loginRes.json();
    expect(body.token).toBeTruthy();
  });
});
