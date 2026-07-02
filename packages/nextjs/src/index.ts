/**
 * @custom-auth/nextjs
 *
 * Edge-compatible helpers for Next.js App Router and Pages Router.
 * Zero Node.js dependencies — uses only Web APIs (fetch, crypto, Headers).
 *
 * Usage:
 *
 *   // app/api/auth/[...auth]/route.ts
 *   import { auth } from '@/lib/auth';
 *   export const GET  = (req: Request) => auth.handleRequest(req);
 *   export const POST = (req: Request) => auth.handleRequest(req);
 *
 *   // Middleware (middleware.ts)
 *   import { withAuth } from '@custom-auth/nextjs';
 *   export default withAuth({ apiBaseUrl: '/api/auth' });
 *
 *   // Server Component / Route Handler
 *   import { getServerSession } from '@custom-auth/nextjs';
 *   const session = await getServerSession(request);
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

// ── Types ─────────────────────────────────────────────────────────────────

export interface NextAuthUser {
  id: string;
  email: string;
  role: string;
  name?: string;
}

export interface NextAuthSession {
  user: NextAuthUser;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface GetServerSessionOptions {
  /** JWT secret — must match the one passed to createAuth(). */
  secret: string;
  /** Cookie name. Default: 'auth-token'. */
  cookieName?: string;
}

export interface WithAuthOptions {
  /** API base URL — used to redirect unauthenticated requests. */
  loginUrl?: string;
  /** Return 401 JSON instead of redirecting. Useful for API routes. */
  returnUnauthorized?: boolean;
  /** Paths to protect. Glob matching with exact prefix. Default: all non-public paths. */
  matcher?: string[];
  /** Paths to always allow (e.g. /api/auth, /login). */
  publicPaths?: string[];
  /** JWT secret for verifying the token in middleware (edge-compatible). */
  secret: string;
  /** Cookie name. Default: 'auth-token'. */
  cookieName?: string;
}

// ── getServerSession ──────────────────────────────────────────────────────

/**
 * Extract and verify the auth session from an incoming Request.
 * Works in Server Components, Route Handlers, and Middleware.
 *
 * @example
 * // Route Handler
 * export async function GET(request: Request) {
 *   const session = await getServerSession(request, { secret: process.env.AUTH_SECRET! });
 *   if (!session) return new Response('Unauthorized', { status: 401 });
 *   return Response.json({ user: session.user });
 * }
 */
export async function getServerSession(
  request: Request,
  options: GetServerSessionOptions
): Promise<NextAuthSession | null> {
  const { secret, cookieName = 'auth-token' } = options;

  const token = extractTokenFromRequest(request, cookieName);
  if (!token) return null;

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    return payloadToSession(payload);
  } catch {
    return null;
  }
}

// ── withAuth middleware ───────────────────────────────────────────────────

/**
 * Next.js middleware that protects routes by verifying the auth token.
 *
 * @example
 * // middleware.ts
 * import { withAuth } from '@custom-auth/nextjs';
 *
 * export default withAuth({
 *   secret: process.env.AUTH_SECRET!,
 *   loginUrl: '/login',
 *   publicPaths: ['/login', '/register', '/api/auth'],
 * });
 *
 * export const config = {
 *   matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
 * };
 */
export function withAuth(options: WithAuthOptions) {
  const {
    secret,
    loginUrl = '/login',
    returnUnauthorized = false,
    publicPaths = ['/login', '/register', '/api/auth'],
    cookieName = 'auth-token',
  } = options;

  return async function middleware(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Allow public paths (prefix match)
    const isPublic = publicPaths.some(
      p => url.pathname === p || url.pathname.startsWith(p + '/')
    );
    if (isPublic) return nextResponse(request);

    const token = extractTokenFromRequest(request, cookieName);
    if (!token) return unauthorized(url, loginUrl, returnUnauthorized);

    try {
      const key = new TextEncoder().encode(secret);
      await jwtVerify(token, key);
      return nextResponse(request);
    } catch {
      return unauthorized(url, loginUrl, returnUnauthorized);
    }
  };
}

// ── requireSession helper ─────────────────────────────────────────────────

/**
 * Use in Route Handlers or Server Actions.
 * Throws a Response (401) if the session is invalid — catch in your handler.
 *
 * @example
 * export async function GET(request: Request) {
 *   const session = await requireSession(request, { secret: process.env.AUTH_SECRET! });
 *   // session is guaranteed to be non-null here
 * }
 */
export async function requireSession(
  request: Request,
  options: GetServerSessionOptions
): Promise<NextAuthSession> {
  const session = await getServerSession(request, options);
  if (!session) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return session;
}

// ── withRole helper ───────────────────────────────────────────────────────

/**
 * Like requireSession but also checks the user's role.
 *
 * @example
 * const session = await withRole(request, 'admin', { secret: process.env.AUTH_SECRET! });
 */
export async function withRole(
  request: Request,
  role: string | string[],
  options: GetServerSessionOptions
): Promise<NextAuthSession> {
  const session = await requireSession(request, options);
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(session.user.role)) {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return session;
}

// ── internal helpers ──────────────────────────────────────────────────────

function extractTokenFromRequest(request: Request, cookieName: string): string | null {
  // 1. Cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const re = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`);
  const match = cookieHeader.match(re);
  if (match) return decodeURIComponent(match[1]);

  // 2. Authorization: Bearer <token>
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);

  return null;
}

function payloadToSession(payload: JWTPayload): NextAuthSession {
  return {
    user: {
      id: payload.sub!,
      email: payload['email'] as string,
      role: payload['role'] as string,
      name: payload['name'] as string | undefined,
    },
    jti: payload.jti,
    iat: payload.iat,
    exp: payload.exp,
  };
}

/**
 * Pass-through: continue to next middleware / handler.
 * In Next.js edge middleware, returning NextResponse.next() means continue.
 * We return a special marker Response that Next.js treats as "continue".
 */
function nextResponse(request: Request): Response {
  // When used as Next.js middleware, the framework checks response.headers
  // for x-middleware-next. Setting it to '1' tells Next.js to proceed.
  return new Response(null, {
    status: 200,
    headers: {
      'x-middleware-next': '1',
    },
  });
}

function unauthorized(
  url: URL,
  loginUrl: string,
  returnUnauthorized: boolean
): Response {
  if (returnUnauthorized || url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const redirectUrl = new URL(loginUrl, url.origin);
  redirectUrl.searchParams.set('callbackUrl', url.pathname);
  return Response.redirect(redirectUrl.toString(), 302);
}
