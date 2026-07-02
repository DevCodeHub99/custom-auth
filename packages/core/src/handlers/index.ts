import { AuthConfig, CookieOptions } from '../interfaces';
import { AuthFlows } from '../flows';
import { SessionManager } from '../session';
import { generateToken } from '../utils/crypto';
import {
  AuthError,
  RateLimitError,
  MissingConfigError,
  TokenInvalidError,
} from '../errors';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ── helpers ───────────────────────────────────────────────────────────────

function json(data: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

/**
 * Build a Set-Cookie header string.
 * Auto-detects `Secure` flag: enabled in production, disabled in dev.
 * Config can override explicitly.
 */
function buildSetCookieHeader(token: string, opts: CookieOptions = {}): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const {
    httpOnly = true,
    secure = isProduction,
    sameSite = 'Lax',
    path = '/',
    maxAge = 60 * 60 * 24 * 7, // 7 days
  } = opts;

  let cookie = `auth-token=${token}; Path=${path}; Max-Age=${maxAge}`;
  if (httpOnly) cookie += '; HttpOnly';
  if (secure) cookie += '; Secure';
  cookie += `; SameSite=${sameSite}`;
  return cookie;
}

function clearCookieHeader(opts: CookieOptions = {}): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const { path = '/', secure = isProduction, sameSite = 'Lax' } = opts;
  let cookie = `auth-token=; Path=${path}; Max-Age=0; HttpOnly`;
  if (secure) cookie += '; Secure';
  cookie += `; SameSite=${sameSite}`;
  return cookie;
}

/**
 * Build a generic named cookie (e.g. for OAuth state).
 * Also auto-detects Secure from NODE_ENV.
 */
function buildGenericCookie(
  name: string,
  value: string,
  maxAge: number,
  secure: boolean
): string {
  let c = `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
  if (secure) c += '; Secure';
  return c;
}

function isSecureContext(config: AuthConfig): boolean {
  if (config.cookies?.secure !== undefined) return config.cookies.secure;
  return process.env.NODE_ENV === 'production';
}

/**
 * Extract auth token from cookie or Authorization header.
 * URL-decodes the cookie value to handle encoded JWTs.
 */
function extractToken(req: Request): string | null {
  // 1. Cookie
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)auth-token=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);

  // 2. Authorization: Bearer <token>
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);

  return null;
}

function parseCookie(cookieHeader: string, name: string): string | null {
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const m = cookieHeader.match(re);
  return m ? decodeURIComponent(m[1]) : null;
}

// ── rate limiter helper ───────────────────────────────────────────────────

async function checkRateLimit(
  config: AuthConfig,
  req: Request,
  key: string,
  limit = 10,
  windowMs = 60_000
): Promise<Response | null> {
  if (!config.rateLimiter) return null;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const allowed = await config.rateLimiter.check(`${key}:${ip}`, limit, windowMs);
  if (!allowed) return json({ error: 'Too many requests. Please try again later.' }, 429);
  return null;
}

// ── config validation ─────────────────────────────────────────────────────

function validateConfig(config: AuthConfig): void {
  if (!config.secret) {
    throw new MissingConfigError('secret');
  }
  if (process.env.NODE_ENV === 'production' && config.secret.length < 32) {
    throw new MissingConfigError('secret (must be at least 32 characters in production)');
  }
  if (config.emailVerification && !config.verifyEmailUrl) {
    throw new MissingConfigError('verifyEmailUrl (required when emailVerification is true)');
  }
}

// ── error → HTTP status mapper ────────────────────────────────────────────

function errorResponse(e: unknown): Response {
  if (e instanceof AuthError) {
    return json({ error: e.message, code: e.code }, e.statusCode);
  }
  const msg = e instanceof Error ? e.message : 'An unexpected error occurred.';
  return json({ error: msg }, 400);
}

// ── CustomAuth class ──────────────────────────────────────────────────────

export class CustomAuth {
  private flows: AuthFlows;
  private sessionManager: SessionManager;

  constructor(private config: AuthConfig) {
    validateConfig(config);
    this.flows = new AuthFlows(config);
    this.sessionManager = new SessionManager(config);
  }

  async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;

    // ── POST ──────────────────────────────────────────────────────────────
    if (method === 'POST') {
      if (pathname.endsWith('/register'))          return this.handleRegister(req);
      if (pathname.endsWith('/login'))             return this.handleLogin(req);
      if (pathname.endsWith('/logout'))            return this.handleLogout(req);
      if (pathname.endsWith('/refresh'))           return this.handleRefresh(req);
      if (pathname.endsWith('/magic-link'))        return this.handleMagicLink(req);
      if (pathname.endsWith('/mfa/verify'))        return this.handleMfaVerify(req);
      if (pathname.endsWith('/mfa/setup'))         return this.handleMfaSetup(req);
      if (pathname.endsWith('/mfa/enable'))        return this.handleMfaEnable(req);
      if (pathname.endsWith('/mfa/disable'))       return this.handleMfaDisable(req);
      if (pathname.endsWith('/forgot-password'))   return this.handleForgotPassword(req);
      if (pathname.endsWith('/reset-password'))    return this.handleResetPassword(req);
      if (pathname.endsWith('/otp'))               return this.handleOtpRequest(req);
      if (pathname.endsWith('/otp/verify'))        return this.handleOtpVerify(req);
      if (pathname.endsWith('/webauthn/register/options')) return this.handleWebAuthnRegisterOptions(req);
      if (pathname.endsWith('/webauthn/register/verify'))  return this.handleWebAuthnRegisterVerify(req);
      if (pathname.endsWith('/webauthn/login/options'))    return this.handleWebAuthnLoginOptions(req);
      if (pathname.endsWith('/webauthn/login/verify'))     return this.handleWebAuthnLoginVerify(req);
    }

    // ── GET ───────────────────────────────────────────────────────────────
    if (method === 'GET') {
      if (pathname.endsWith('/session'))           return this.handleSession(req);
      if (pathname.endsWith('/magic-link/verify')) return this.handleMagicLinkVerify(req);
      if (pathname.endsWith('/verify-email'))      return this.handleVerifyEmail(req);

      const oauthMatch = pathname.match(/\/oauth\/([^/]+)$/);
      if (oauthMatch) return this.handleOAuthRedirect(req, oauthMatch[1]);

      const callbackMatch = pathname.match(/\/callback\/([^/]+)$/);
      if (callbackMatch) return this.handleOAuthCallback(req, callbackMatch[1]);
    }

    return json({ error: 'Not found' }, 404);
  }

  // ── /register ─────────────────────────────────────────────────────────

  private async handleRegister(req: Request): Promise<Response> {
    const rl = await checkRateLimit(this.config, req, 'register', 5, 60_000);
    if (rl) return rl;

    try {
      const { email, password, name } = await req.json();
      if (!email) return json({ error: 'email is required' }, 400);

      const result = await this.flows.register(email, password, name);
      const setCookie = buildSetCookieHeader(result.token, this.config.cookies);
      return json({ user: result.user, token: result.token }, 201, { 'Set-Cookie': setCookie });
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /login ────────────────────────────────────────────────────────────

  private async handleLogin(req: Request): Promise<Response> {
    const rl = await checkRateLimit(this.config, req, 'login', 10, 60_000);
    if (rl) return rl;

    try {
      const { email, password } = await req.json();
      if (!email) return json({ error: 'email is required' }, 400);

      const result = await this.flows.login(email, password);

      if ('mfaRequired' in result) {
        return json({ mfaRequired: true, tempToken: result.tempToken }, 200);
      }

      const setCookie = buildSetCookieHeader(result.token, this.config.cookies);
      return json({ user: result.user, token: result.token }, 200, { 'Set-Cookie': setCookie });
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /logout ───────────────────────────────────────────────────────────

  private async handleLogout(req: Request): Promise<Response> {
    try {
      const token = extractToken(req);

      if (token && this.config.adapter?.deleteSession) {
        const payload = await this.sessionManager.verifyToken(token);
        if (payload?.jti) {
          await this.config.adapter.deleteSession(payload.jti as string);
        }
      }

      const clearCookie = clearCookieHeader(this.config.cookies);
      return json({ success: true }, 200, { 'Set-Cookie': clearCookie });
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /refresh ──────────────────────────────────────────────────────────
  /**
   * Rotates the session token.
   * 1. Verifies the existing token
   * 2. Deletes the old DB session (if adapter supports it)
   * 3. Issues a new token + new DB session
   */
  private async handleRefresh(req: Request): Promise<Response> {
    const rl = await checkRateLimit(this.config, req, 'refresh', 10, 60_000);
    if (rl) return rl;

    try {
      const token = extractToken(req);
      if (!token) return json({ error: 'No session token provided.' }, 401);

      const payload = await this.sessionManager.verifyToken(token);
      if (!payload || !payload.sub) {
        return json({ error: 'Invalid or expired token.' }, 401);
      }

      // Delete old DB session
      if (payload.jti && this.config.adapter?.deleteSession) {
        await this.config.adapter.deleteSession(payload.jti as string);
      }

      const user = this.config.adapter
        ? await this.config.adapter.getUserById(payload.sub)
        : { id: payload.sub, email: payload['email'] as string, role: payload['role'] as string };

      if (!user) return json({ error: 'User not found.' }, 401);

      const newToken = await this.sessionManager.createToken(user);
      const setCookie = buildSetCookieHeader(newToken, this.config.cookies);

      await this.config.hooks?.onSuccess?.({
        event: 'token-refresh',
        userId: user.id,
        email: user.email,
        timestamp: new Date(),
      });

      return json({ token: newToken }, 200, { 'Set-Cookie': setCookie });
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /session ──────────────────────────────────────────────────────────

  private async handleSession(req: Request): Promise<Response> {
    try {
      const token = extractToken(req);
      if (!token) return json({ user: null }, 200);

      const payload = await this.sessionManager.verifyToken(token);
      if (!payload || !payload.sub) return json({ user: null }, 200);

      // Optional: verify session still exists in DB (catches revoked sessions)
      if (payload.jti && this.config.adapter?.getSession) {
        const session = await this.config.adapter.getSession(payload.jti as string);
        if (!session || session.expiresAt < new Date()) {
          return json({ user: null }, 200);
        }
      }

      const user = this.config.adapter
        ? await this.config.adapter.getUserById(payload.sub)
        : { id: payload.sub, email: payload['email'] as string, role: payload['role'] as string };

      return json({ user: user ?? null }, 200);
    } catch {
      return json({ user: null }, 200);
    }
  }

  // ── /magic-link ───────────────────────────────────────────────────────

  private async handleMagicLink(req: Request): Promise<Response> {
    const rl = await checkRateLimit(this.config, req, 'magic-link', 5, 60_000);
    if (rl) return rl;

    try {
      const { email, callbackUrl } = await req.json();
      if (!email || !callbackUrl) return json({ error: 'email and callbackUrl are required' }, 400);

      await this.flows.requestMagicLink(email, callbackUrl);
      return json({ success: true }, 200);
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /magic-link/verify ────────────────────────────────────────────────

  private async handleMagicLinkVerify(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url);
      const token = url.searchParams.get('token');
      const email = url.searchParams.get('email');

      if (!token || !email) return json({ error: 'token and email are required' }, 400);

      const result = await this.flows.verifyMagicLink(token, decodeURIComponent(email));
      const setCookie = buildSetCookieHeader(result.token, this.config.cookies);
      return json({ user: result.user, token: result.token }, 200, { 'Set-Cookie': setCookie });
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /mfa/verify ───────────────────────────────────────────────────────

  private async handleMfaVerify(req: Request): Promise<Response> {
    // Rate-limit tightly — TOTP has only 1M codes (6-digit), brute-force is feasible
    const rl = await checkRateLimit(this.config, req, 'mfa-verify', 5, 60_000);
    if (rl) return rl;

    try {
      const { tempToken, code } = await req.json();
      if (!tempToken || !code) return json({ error: 'tempToken and code are required' }, 400);

      const result = await this.flows.verifyMfaToken(tempToken, code);
      const setCookie = buildSetCookieHeader(result.token, this.config.cookies);
      return json({ user: result.user, token: result.token }, 200, { 'Set-Cookie': setCookie });
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /mfa/setup ────────────────────────────────────────────────────────

  private async handleMfaSetup(req: Request): Promise<Response> {
    try {
      const token = extractToken(req);
      if (!token) return json({ error: 'Authentication required.' }, 401);

      const payload = await this.sessionManager.verifyToken(token);
      if (!payload?.sub) return json({ error: 'Invalid session.' }, 401);

      const result = await this.flows.setupMfa(payload.sub);
      return json(result, 200);
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /mfa/enable ───────────────────────────────────────────────────────

  private async handleMfaEnable(req: Request): Promise<Response> {
    try {
      const token = extractToken(req);
      if (!token) return json({ error: 'Authentication required.' }, 401);

      const payload = await this.sessionManager.verifyToken(token);
      if (!payload?.sub) return json({ error: 'Invalid session.' }, 401);

      const { secret, code } = await req.json();
      if (!secret || !code) return json({ error: 'secret and code are required' }, 400);

      await this.flows.enableMfa(payload.sub, secret, code);
      return json({ success: true }, 200);
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /mfa/disable ──────────────────────────────────────────────────────

  private async handleMfaDisable(req: Request): Promise<Response> {
    try {
      const token = extractToken(req);
      if (!token) return json({ error: 'Authentication required.' }, 401);

      const payload = await this.sessionManager.verifyToken(token);
      if (!payload?.sub) return json({ error: 'Invalid session.' }, 401);

      const { code } = await req.json();
      if (!code) return json({ error: 'code is required' }, 400);

      await this.flows.disableMfa(payload.sub, code);
      return json({ success: true }, 200);
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /verify-email ─────────────────────────────────────────────────────

  private async handleVerifyEmail(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url);
      const token = url.searchParams.get('token');
      const email = url.searchParams.get('email');

      if (!token || !email) return json({ error: 'token and email are required' }, 400);

      const result = await this.flows.verifyEmail(token, decodeURIComponent(email));
      return json({ user: result.user }, 200);
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /forgot-password ──────────────────────────────────────────────────

  private async handleForgotPassword(req: Request): Promise<Response> {
    const rl = await checkRateLimit(this.config, req, 'forgot-password', 5, 60_000);
    if (rl) return rl;

    try {
      const { email } = await req.json();
      if (!email) return json({ error: 'email is required' }, 400);

      if (!this.config.resetPasswordUrl) {
        return json({ error: 'resetPasswordUrl is not configured.' }, 500);
      }

      await this.flows.requestPasswordReset(email, this.config.resetPasswordUrl);
      // Always return success — don't leak if email exists
      return json({ success: true }, 200);
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /reset-password ───────────────────────────────────────────────────

  private async handleResetPassword(req: Request): Promise<Response> {
    try {
      const { token, email, password } = await req.json();
      if (!token || !email || !password) {
        return json({ error: 'token, email, and password are required' }, 400);
      }

      await this.flows.resetPassword(token, email, password);
      return json({ success: true }, 200);
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /oauth/:provider  (initiates OAuth redirect) ──────────────────────

  private async handleOAuthRedirect(req: Request, providerId: string): Promise<Response> {
    try {
      const provider = this.config.providers?.find(p => p.id === providerId && p.type === 'oauth');
      if (!provider) return json({ error: `Unknown OAuth provider: ${providerId}` }, 404);

      const state = generateToken(16);
      const oauthProvider = provider as any;
      const authUrl = oauthProvider.getAuthorizationUrl(state);

      const secure = isSecureContext(this.config);
      const stateCookie = buildGenericCookie(`oauth_state_${providerId}`, state, 300, secure);

      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl,
          'Set-Cookie': stateCookie,
        },
      });
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── /callback/:provider  (handles OAuth code exchange) ────────────────
  /**
   * Uses a Headers object to set multiple Set-Cookie headers correctly.
   * The plain `{ 'Set-Cookie': '...' }` approach only allows one value;
   * we need two here (auth-token + clear oauth_state).
   */
  private async handleOAuthCallback(req: Request, providerId: string): Promise<Response> {
    try {
      const url = new URL(req.url);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const errorParam = url.searchParams.get('error');

      if (errorParam) return json({ error: `OAuth error: ${errorParam}` }, 400);
      if (!code || !state) return json({ error: 'code and state are required' }, 400);

      const cookieHeader = req.headers.get('cookie') || '';
      const storedState = parseCookie(cookieHeader, `oauth_state_${providerId}`);

      if (!storedState) {
        return json({ error: 'OAuth state cookie missing. Session may have expired.' }, 400);
      }

      const result = await this.flows.handleOAuthCallback(providerId, code, state, storedState);

      const secure = isSecureContext(this.config);
      const authCookie = buildSetCookieHeader(result.token, this.config.cookies);
      const clearState = buildGenericCookie(`oauth_state_${providerId}`, '', 0, secure);

      // Use Headers to send multiple Set-Cookie headers correctly
      const headers = new Headers({ 'Content-Type': 'application/json' });
      headers.append('Set-Cookie', authCookie);
      headers.append('Set-Cookie', clearState);

      return new Response(JSON.stringify({ user: result.user, token: result.token }), {
        status: 200,
        headers,
      });
    } catch (e) {
      return errorResponse(e);
    }
  }

  // ── OTP Handlers ──────────────────────────────────────────────────────

  private async handleOtpRequest(req: Request): Promise<Response> {
    const rl = await checkRateLimit(this.config, req, 'otp-request', 5, 60_000);
    if (rl) return rl;

    try {
      const { email } = await req.json();
      if (!email) return json({ error: 'email is required' }, 400);

      await this.flows.requestOtp(email);
      return json({ success: true }, 200);
    } catch (e) {
      return errorResponse(e);
    }
  }

  private async handleOtpVerify(req: Request): Promise<Response> {
    const rl = await checkRateLimit(this.config, req, 'otp-verify', 5, 60_000);
    if (rl) return rl;

    try {
      const { email, code } = await req.json();
      if (!email || !code) return json({ error: 'email and code are required' }, 400);

      const result = await this.flows.verifyOtp(email, code);
      const setCookie = buildSetCookieHeader(result.token, this.config.cookies);
      return json({ user: result.user, token: result.token }, 200, { 'Set-Cookie': setCookie });
    } catch (e) {
      return errorResponse(e);
    }
  }

  private async handleWebAuthnRegisterOptions(req: Request): Promise<Response> {
    try {
      const { userId } = await req.json();
      if (!userId) return json({ error: 'userId is required' }, 400);

      const options = await this.flows.generateRegistrationOptions(userId);
      return json(options, 200);
    } catch (e) {
      return errorResponse(e);
    }
  }

  private async handleWebAuthnRegisterVerify(req: Request): Promise<Response> {
    try {
      const { userId, response, challenge } = await req.json();
      if (!userId || !response || !challenge) {
        return json({ error: 'userId, response, and challenge are required' }, 400);
      }

      await this.flows.verifyRegistration(userId, response, challenge);
      return json({ success: true }, 200);
    } catch (e) {
      return errorResponse(e);
    }
  }

  private async handleWebAuthnLoginOptions(req: Request): Promise<Response> {
    try {
      let email: string | undefined;
      try {
        const body = await req.json();
        email = body.email;
      } catch (e) {
        // body may be missing/empty for anonymous assertions
      }

      const options = await this.flows.generateLoginOptions(email);
      return json(options, 200);
    } catch (e) {
      return errorResponse(e);
    }
  }

  private async handleWebAuthnLoginVerify(req: Request): Promise<Response> {
    try {
      const { response, challenge } = await req.json();
      if (!response || !challenge) {
        return json({ error: 'response and challenge are required' }, 400);
      }

      const result = await this.flows.verifyLogin(response, challenge);
      const setCookie = buildSetCookieHeader(result.token, this.config.cookies);
      return json({ user: result.user, token: result.token }, 200, { 'Set-Cookie': setCookie });
    } catch (e) {
      return errorResponse(e);
    }
  }
}

export function createAuth(config: AuthConfig) {
  return new CustomAuth(config);
}
