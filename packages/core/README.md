# @custom-auth/core

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


The framework-agnostic authentication engine that powers the entire `@custom-auth` ecosystem.

## Installation

The core engine requires a database adapter and an email adapter to function. Choose the ones that match your stack:

```bash
# General Format
npm install @custom-auth/core <your-db-adapter> <your-email-adapter>

# Example 1: Prisma + Resend
npm install @custom-auth/core @custom-auth/prisma @custom-auth/adapter-resend

# Example 2: Drizzle + Nodemailer
npm install @custom-auth/core @custom-auth/drizzle @custom-auth/adapter-nodemailer
```

*(See the Ecosystem Packages list above for all available adapters)*

## Quick Start

Initialize the core authentication engine with your chosen database and email adapters. The API remains exactly the same regardless of which adapters you pick!

```typescript
import { CustomAuth } from '@custom-auth/core';

// 1. Import your preferred Database Adapter
import { PrismaAdapter } from '@custom-auth/prisma';
// import { DrizzleAdapter } from '@custom-auth/drizzle';
// import { MongooseAdapter } from '@custom-auth/mongoose';

// 2. Import your preferred Email Adapter
import { ResendAdapter } from '@custom-auth/adapter-resend';
// import { NodemailerAdapter } from '@custom-auth/adapter-nodemailer';

export const auth = new CustomAuth({
  // Use your chosen DB adapter
  db: new PrismaAdapter(prisma), 
  
  // Use your chosen Email adapter
  email: new ResendAdapter('your-resend-api-key'),
  
  secret: process.env.AUTH_SECRET
});
```

## Documentation
For full documentation and examples, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).
