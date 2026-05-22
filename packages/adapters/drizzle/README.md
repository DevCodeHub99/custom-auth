# @custom-auth/drizzle

The official Drizzle ORM adapter for `@custom-auth`.

## Installation

```bash
npm install @custom-auth/core @custom-auth/drizzle drizzle-orm
```

## Quick Start

```typescript
import { CustomAuth } from '@custom-auth/core';
import { DrizzleAdapter } from '@custom-auth/drizzle';
import { db } from './db'; // Your initialized Drizzle db instance

export const auth = new CustomAuth({
  db: new DrizzleAdapter(db),
  // ...other config
});
```

## Documentation
For the required Drizzle schema and full documentation, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).
