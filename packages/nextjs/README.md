# @custom-auth/nextjs

Edge-compatible Next.js helpers for `@custom-auth/core`. Works in App Router, Pages Router, and Edge Middleware. Zero Node.js dependencies — uses only Web APIs.

## Installation

```bash
npm install @custom-auth/nextjs @custom-auth/core jose
```

## getServerSession

Verify the auth token from a request in Server Components or Route Handlers.

```ts
// app/api/profile/route.ts
import { getServerSession } from '@custom-auth/nextjs';

export async function GET(request: Request) {
  const session = await getServerSession(request, {
    secret: process.env.AUTH_SECRET!,
  });

  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({ user: session.user });
}
```

## requireSession

Like `getServerSession` but throws a `401 Response` if unauthenticated — catch it in your handler.

```ts
import { requireSession } from '@custom-auth/nextjs';

export async function GET(request: Request) {
  const session = await requireSession(request, { secret: process.env.AUTH_SECRET! });
  // guaranteed non-null here
  return Response.json({ user: session.user });
}
```

## withRole

Require a specific role.

```ts
import { withRole } from '@custom-auth/nextjs';

export async function DELETE(request: Request) {
  const session = await withRole(request, 'admin', { secret: process.env.AUTH_SECRET! });
  // only admins reach here
}
```

## withAuth Middleware

Protect routes at the edge — no DB round-trip needed.

```ts
// middleware.ts
import { withAuth } from '@custom-auth/nextjs';

export default withAuth({
  secret: process.env.AUTH_SECRET!,
  loginUrl: '/login',
  publicPaths: ['/login', '/register', '/api/auth'],
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

## Session shape

```ts
interface NextAuthSession {
  user: {
    id: string;
    email: string;
    role: string;
    name?: string;
  };
  jti?: string;   // DB session ID (for revocation)
  iat?: number;
  exp?: number;
}
```
