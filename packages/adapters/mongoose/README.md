# @custom-auth/mongoose

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


The official Mongoose (MongoDB) adapter for `@custom-auth`.

## Installation

```bash
npm install @custom-auth/core @custom-auth/mongoose mongoose
```

## Quick Start

```typescript
import { CustomAuth } from '@custom-auth/core';
import { MongooseAdapter } from '@custom-auth/mongoose';
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);

export const auth = new CustomAuth({
  db: new MongooseAdapter(),
  // ...other config
});
```

## Documentation
For full documentation, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).
