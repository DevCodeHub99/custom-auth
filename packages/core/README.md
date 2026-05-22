# @custom-auth/core

The framework-agnostic authentication engine that powers the entire `@custom-auth` ecosystem.

## Installation

```bash
npm install @custom-auth/core
```

## Quick Start

Initialize the core authentication engine with your desired database and email adapters.

```typescript
import { CustomAuth } from '@custom-auth/core';
import { PrismaAdapter } from '@custom-auth/prisma';
import { ResendAdapter } from '@custom-auth/adapter-resend';

export const auth = new CustomAuth({
  db: new PrismaAdapter(prisma),
  email: new ResendAdapter('your-resend-api-key'),
  secret: process.env.AUTH_SECRET
});
```

## Documentation
For full documentation and examples, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).
