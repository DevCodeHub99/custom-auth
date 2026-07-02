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

Here is a detailed guide on how to use the core features of the authentication engine.

### 1. Creating the Auth Instance

```typescript
import { createAuth } from '@custom-auth/core';
// Import your chosen adapters
import { PrismaAdapter } from '@custom-auth/prisma';
import { ResendEmailAdapter } from '@custom-auth/adapter-resend';

export const auth = createAuth({
  secret: process.env.AUTH_SECRET,
  dbAdapter: new PrismaAdapter(prisma),
  emailAdapter: new ResendEmailAdapter({ apiKey: process.env.RESEND_API_KEY, from: 'Auth <no-reply@yourdomain.com>' }),
  emailVerification: true,
  verifyEmailUrl: 'https://yourapp.com/verify-email',
  resetPasswordUrl: 'https://yourapp.com/reset-password',
});
```

### 2. Programmatic Usage (AuthFlows)

If you need to trigger authentication logic programmatically (e.g., in a seed script, testing, or custom setup), you can instantiate `AuthFlows` directly:

```typescript
import { AuthFlows } from '@custom-auth/core';

const flows = new AuthFlows(authConfig);

// Register a new user
const { user, token } = await flows.register(email, password, name);

// Login a user
const result = await flows.login(email, password); // returns user/token or MFA required temp token

// Request password reset
await flows.requestPasswordReset(email, 'https://yourapp.com/reset-password');

// Reset password
await flows.resetPassword(token, email, newPassword);

// Send magic link
await flows.requestMagicLink(email, 'https://yourapp.com/api/auth/magic-link/verify');

// Verify magic link
const { user, token: sessionToken } = await flows.verifyMagicLink(token, email);

// Request Email OTP (One-Time Password)
await flows.requestOtp(email);

// Verify Email OTP
const { user: otpUser, token: otpSessionToken } = await flows.verifyOtp(email, code);
```




## Documentation

For full documentation, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).

