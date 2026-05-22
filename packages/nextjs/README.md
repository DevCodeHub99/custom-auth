# @custom-auth/nextjs

Edge-compatible Next.js helpers, API route handlers, and middleware for `@custom-auth`.

## Installation

```bash
npm install @custom-auth/core @custom-auth/nextjs
```

## Quick Start

Easily protect your application routes using the provided edge middleware.

**`middleware.ts`**
```typescript
import { withAuth } from '@custom-auth/nextjs';

export default withAuth({
  redirectTo: '/login',
});

export const config = {
  matcher: ['/dashboard/:path*']
};
```

## Documentation
For full documentation, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).
