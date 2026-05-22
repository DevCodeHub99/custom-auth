# @custom-auth/prisma

The official Prisma ORM adapter for `@custom-auth`.

## Installation

```bash
npm install @custom-auth/core @custom-auth/prisma @prisma/client
```

## Quick Start

Pass the Prisma adapter into your core engine initialization.

```typescript
import { CustomAuth } from '@custom-auth/core';
import { PrismaAdapter } from '@custom-auth/prisma';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const auth = new CustomAuth({
  db: new PrismaAdapter(prisma),
  // ...other config
});
```

## Documentation
For the required Prisma schema and full documentation, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).
