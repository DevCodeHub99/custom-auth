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
# Install the core engine, the Prisma adapter, and your chosen email adapter
npm install @custom-auth/core @custom-auth/prisma <your-email-adapter>
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

## Required Schema

You must add the following models to your `schema.prisma` file for the core engine to function:

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  name          String?
  role          String    @default("user")
  emailVerified Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions      Session[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

For full architecture details, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).
