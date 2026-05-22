# @custom-auth/prisma

---

### 📦 Ecosystem Packages
* 🔑 **[Core Engine (@custom-auth/core)](https://www.npmjs.com/package/@custom-auth/core)** — The core framework-agnostic auth engine.
* ⚛️ **[React SDK (@custom-auth/react)](https://www.npmjs.com/package/@custom-auth/react)** — React hooks and context provider.
* 🌐 **[Next.js SDK (@custom-auth/nextjs)](https://www.npmjs.com/package/@custom-auth/nextjs)** — Edge-compatible Next.js helpers and middleware.
* 🗄️ **Database Adapters:**
  * [Prisma (@custom-auth/prisma)](https://www.npmjs.com/package/@custom-auth/prisma)
  * [Drizzle (@custom-auth/drizzle)](https://www.npmjs.com/package/@custom-auth/drizzle)
  * [Mongoose (@custom-auth/mongoose)](https://www.npmjs.com/package/@custom-auth/mongoose)
* ✉️ **Email Adapters:**
  * [Nodemailer (@custom-auth/adapter-nodemailer)](https://www.npmjs.com/package/@custom-auth/adapter-nodemailer)
  * [Resend (@custom-auth/adapter-resend)](https://www.npmjs.com/package/@custom-auth/adapter-resend)

---


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
