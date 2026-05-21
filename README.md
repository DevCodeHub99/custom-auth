# @custom-auth — Authentication SDK

> Production-grade, framework-agnostic authentication for Node.js, edge runtimes, and browser apps.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## Table of Contents

1. [Overview](#overview)
2. [Packages](#packages)
3. [Installation](#installation)
4. [Quick Start](#quick-start)
5. [Configuration Reference](#configuration-reference)
6. [Database Adapters](#database-adapters)
   - [Drizzle](#drizzle-orm-recommended)
   - [Prisma](#prisma)
   - [Mongoose](#mongoose)
   - [Custom Adapter](#custom-adapter)
7. [Email Adapters](#email-adapters)
   - [SMTP — Nodemailer](#option-a--smtp-nodemailer)
   - [Resend](#option-b--resend-edge-compatible)
   - [Custom Templates](#custom-email-templates)
8. [Framework Integration](#framework-integration)
   - [Next.js App Router](#nextjs-app-router)
   - [Next.js Pages Router](#nextjs-pages-router)
   - [Express](#express)
   - [Hono](#hono)
   - [Fastify](#fastify)
9. [React Frontend SDK](#react-frontend-sdk)
10. [Next.js Server Helpers](#nextjs-server-helpers)
11. [API Routes Reference](#api-routes-reference)
12. [Auth Features](#auth-features)
    - [Email / Password](#email--password)
    - [Magic Link (Passwordless)](#magic-link-passwordless)
    - [OAuth (Google, GitHub)](#oauth-google-github)
    - [MFA (TOTP)](#mfa-totp)
    - [Session Management](#session-management)
    - [Password Reset](#password-reset)
    - [Email Verification](#email-verification)
13. [RBAC — Role-Based Access Control](#rbac--role-based-access-control)
14. [Rate Limiting](#rate-limiting)
15. [Lifecycle Hooks](#lifecycle-hooks)
16. [Error Handling](#error-handling)
17. [Security](#security)
18. [Environment Variables](#environment-variables)
19. [Development Setup](#development-setup)

---

## Overview

`@custom-auth` is a modular, framework-agnostic authentication SDK built on standard Web APIs (`Request` / `Response`). It runs identically on Node.js servers, Vercel Edge Functions, Cloudflare Workers, and Next.js App Router.

**Key principles:**
- **No magic** — every behaviour is explicit and configurable
- **Web-standard** — works wherever `fetch` works
- **Adapter pattern** — swap databases and email providers without touching auth logic
- **Typed errors** — every failure is a catchable, typed `AuthError` subclass
- **Fully typed** — 100% TypeScript, no `any` at the public API boundary

---

## Packages

| Package | Version | Description |
|---|---|---|
| [`@custom-auth/core`](./packages/core) | — | Core auth engine — flows, handlers, session, RBAC, MFA |
| [`@custom-auth/react`](./packages/react) | — | React hooks and context provider |
| [`@custom-auth/nextjs`](./packages/nextjs) | — | Edge-compatible Next.js middleware + server helpers |
| [`@custom-auth/drizzle`](./packages/adapters/drizzle) | — | Drizzle ORM adapter + ready-to-use schema |
| [`@custom-auth/adapter-prisma`](./packages/adapters/prisma) | — | Prisma ORM adapter |
| [`@custom-auth/adapter-mongoose`](./packages/adapters/mongoose) | — | Mongoose / MongoDB adapter |
| [`@custom-auth/adapter-nodemailer`](./packages/adapters/nodemailer) | — | SMTP email adapter (Gmail, Brevo, Zoho, SES, custom…) |
| [`@custom-auth/adapter-resend`](./packages/adapters/resend) | — | Resend API email adapter (edge-safe, fetch-only) |

---

## Installation

Install the core package plus whatever adapters you need:

```bash
# Core (required)
npm install @custom-auth/core

# Database adapter — pick one
npm install @custom-auth/drizzle          # Drizzle ORM + PostgreSQL
npm install @custom-auth/adapter-prisma   # Prisma
npm install @custom-auth/adapter-mongoose # Mongoose / MongoDB

# Email adapter — pick one
npm install @custom-auth/adapter-nodemailer   # SMTP (Node.js only)
npm install @custom-auth/adapter-resend       # Resend API (edge-compatible)

# Frontend
npm install @custom-auth/react     # React hooks
npm install @custom-auth/nextjs    # Next.js server helpers + middleware
```

---

## Quick Start

```ts
import { createAuth } from '@custom-auth/core';
import { DrizzleAdapter } from '@custom-auth/drizzle';
import { SmtpEmailAdapter, smtpPresets } from '@custom-auth/adapter-nodemailer';
import { db, usersTable, sessionsTable, verificationTokensTable } from './db/schema';

export const auth = createAuth({
  secret: process.env.AUTH_SECRET!,

  adapter: new DrizzleAdapter({ db, usersTable, sessionsTable, verificationTokensTable }),

  emailAdapter: new SmtpEmailAdapter({
    ...smtpPresets.brevo,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    from: 'My App <noreply@yourdomain.com>',
  }),

  emailVerification: true,
  verifyEmailUrl:    `${process.env.APP_URL}/verify-email`,
  resetPasswordUrl:  `${process.env.APP_URL}/reset-password`,
});

// Mount on your server — any framework
app.all('/api/auth/*', (req, res) => {
  auth.handleRequest(toWebRequest(req)).then(r => sendWebResponse(res, r));
});
```

---

## Configuration Reference

```ts
createAuth({
  // ── Required ─────────────────────────────────────────────────────────
  secret: string,             // JWT signing secret — min 32 chars in production

  // ── Database ─────────────────────────────────────────────────────────
  adapter: DatabaseAdapter,   // DrizzleAdapter | PrismaAdapter | MongooseAdapter | custom

  // ── Email ─────────────────────────────────────────────────────────────
  emailAdapter: EmailAdapter, // SmtpEmailAdapter | ResendEmailAdapter | custom

  // ── Sessions ─────────────────────────────────────────────────────────
  session: {
    expiresIn: '7d',          // string (e.g. "1d", "2h") or number (seconds). Default: "7d"
  },

  // ── Cookies ──────────────────────────────────────────────────────────
  cookies: {
    httpOnly: true,           // default: true
    sameSite: 'Lax',          // 'Lax' | 'Strict' | 'None'. Default: 'Lax'
    // secure is auto-detected: true in production, false in development
    // Override: secure: true | false
    path: '/',
  },

  // ── Password hashing ─────────────────────────────────────────────────
  bcrypt: {
    rounds: 12,               // default: 10. Range 10–12 recommended.
  },

  // ── Email verification ───────────────────────────────────────────────
  emailVerification: true,    // send verification email after registration
  verifyEmailUrl: 'https://yourapp.com/verify-email',
  resetPasswordUrl: 'https://yourapp.com/reset-password',

  // ── OAuth providers ──────────────────────────────────────────────────
  providers: [
    {
      id: 'google',
      name: 'Google',
      type: 'oauth',
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // callbackUrl is built automatically: /api/auth/callback/google
    },
    {
      id: 'github',
      name: 'GitHub',
      type: 'oauth',
      clientId:     process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  ],

  // ── Rate limiting ────────────────────────────────────────────────────
  rateLimiter: myRateLimiterAdapter, // see Rate Limiting section

  // ── Lifecycle hooks ──────────────────────────────────────────────────
  hooks: {
    onSuccess: async ({ event, userId, email, timestamp }) => { /* audit log */ },
    onError:   async ({ event, error, email, timestamp })  => { /* metrics */ },
  },
});
```

---

## Database Adapters

### Drizzle ORM (recommended)

Best for new projects — ships with a ready-to-use PostgreSQL schema.

```bash
npm install @custom-auth/drizzle drizzle-orm postgres
```

**Step 1 — Use the built-in schema (or extend it)**

```ts
// db/schema.ts
export {
  usersTable,
  sessionsTable,
  verificationTokensTable,
} from '@custom-auth/drizzle/schema';

// Or extend to add custom columns:
import { usersTable as base } from '@custom-auth/drizzle/schema';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const usersTable = pgTable('auth_users', {
  ...base,  // id, email, name, passwordHash, role, emailVerified, mfaEnabled, mfaSecret, createdAt, updatedAt
  stripeCustomerId: text('stripe_customer_id'),
  plan: text('plan').notNull().default('free'),
});
```

**Step 2 — Create adapter**

```ts
// db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DrizzleAdapter } from '@custom-auth/drizzle';
import { usersTable, sessionsTable, verificationTokensTable } from './schema';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);

export const dbAdapter = new DrizzleAdapter({
  db,
  usersTable,
  sessionsTable,
  verificationTokensTable,
});
```

**Step 3 — Push schema**

```bash
npx drizzle-kit push:pg
```

**Schema tables created:**

| Table | Columns |
|---|---|
| `auth_users` | `id` (uuid pk), `email`, `name`, `password_hash`, `role`, `email_verified`, `mfa_enabled`, `mfa_secret`, `created_at`, `updated_at` |
| `auth_sessions` | `id` (uuid pk), `user_id` (fk → users), `expires_at`, `created_at` |
| `auth_verification_tokens` | `token` (pk), `email`, `type`, `expires_at`, `created_at` |

---

### Prisma

```bash
npm install @custom-auth/adapter-prisma @prisma/client
npx prisma init
```

**Add to `prisma/schema.prisma`:**

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  name         String?
  passwordHash String?
  role         String    @default("user")
  emailVerified Boolean  @default(false)
  mfaEnabled   Boolean   @default(false)
  mfaSecret    String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  sessions     Session[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  token     String   @id
  email     String
  type      String
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([email, type])
}
```

```bash
npx prisma db push
npx prisma generate
```

**Usage:**

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaAdapter } from '@custom-auth/adapter-prisma';

const prisma = new PrismaClient();

const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  adapter: new PrismaAdapter(prisma),
});
```

---

### Mongoose

```bash
npm install @custom-auth/adapter-mongoose mongoose
```

```ts
import mongoose from 'mongoose';
import { MongooseAdapter } from '@custom-auth/adapter-mongoose';

await mongoose.connect(process.env.MONGODB_URI!);

const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  adapter: new MongooseAdapter(),
  // adapter automatically registers User, Session, VerificationToken models
  // Pass custom models if you already have them:
  // adapter: new MongooseAdapter({ UserModel: MyUser, SessionModel: MySession })
});
```

**Built-in Mongoose schemas are exported for extension:**

```ts
import { UserSchema, SessionSchema, VerificationTokenSchema } from '@custom-auth/adapter-mongoose';

// Add custom fields to the user schema
UserSchema.add({ stripeCustomerId: String, plan: { type: String, default: 'free' } });
const UserModel = mongoose.model('User', UserSchema);

const auth = createAuth({
  adapter: new MongooseAdapter({ UserModel }),
});
```

---

### Custom Adapter

Implement the `DatabaseAdapter` interface to support any data store:

```ts
import type { DatabaseAdapter, User, Session, VerificationToken, CreateUserInput, UpdateUserInput } from '@custom-auth/core';

class MyAdapter implements DatabaseAdapter {
  // ── Required ──────────────────────────────────────────────────────────
  async createUser(data: CreateUserInput): Promise<User> { /* ... */ }
  async getUserByEmail(email: string): Promise<User | null> { /* ... */ }
  async getUserById(id: string): Promise<User | null> { /* ... */ }

  // ── Optional — enables DB-backed sessions (real revocation) ───────────
  async updateUser?(idOrEmail: string, data: UpdateUserInput): Promise<User> { /* ... */ }
  async createSession?(userId: string, expiresAt: Date): Promise<Session> { /* ... */ }
  async getSession?(sessionId: string): Promise<Session | null> { /* ... */ }
  async deleteSession?(sessionId: string): Promise<void> { /* ... */ }

  // ── Optional — required for magic link, email verify, password reset ──
  async createVerificationToken?(data: VerificationToken): Promise<void> { /* ... */ }
  async getVerificationToken?(token: string, type: VerificationToken['type']): Promise<VerificationToken | null> { /* ... */ }
  async deleteVerificationToken?(token: string, type: VerificationToken['type']): Promise<void> { /* ... */ }
}
```

> `updateUser` receives either a user `id` or an `email` address. Detect which with `idOrEmail.includes('@')`.

---

## Email Adapters

Two adapters, same `EmailAdapter` interface — one-line swap.

| | SMTP (Nodemailer) | Resend |
|---|---|---|
| **Works in** | Node.js | Node.js + Edge (Vercel Edge, CF Workers) |
| **Cost** | Depends on provider — many are **free** | Free up to 3,000/mo; paid after |
| **Vendors** | Any SMTP: Gmail, Brevo, Zoho, Mailgun, Postmark, SES, custom | Resend only |
| **Local dev** | Ethereal fake inbox — zero config | Real sends (or use sandbox mode) |
| **Vendor lock-in** | None | Resend account required |

**TL;DR:**
- Edge runtime (Vercel Edge / Cloudflare Workers) → **Resend**
- Node.js server → **SMTP** (free, no vendor dependency)
- Free custom domain email (`noreply@yourco.com`) → **Zoho + SMTP**
- Local dev → **Ethereal** (`SmtpEmailAdapter.createEtherealTransport()`)

---

### Option A — SMTP (Nodemailer)

```bash
npm install @custom-auth/adapter-nodemailer
```

#### Pick a preset

```ts
import { SmtpEmailAdapter, smtpPresets } from '@custom-auth/adapter-nodemailer';

new SmtpEmailAdapter({
  ...smtpPresets.brevo,    // or: gmail | zoho | mailgun | postmark | office365 | awsSes | outlook | yahoo
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
  from: 'My App <noreply@yourdomain.com>',
})
```

#### Preset quick-reference

| Preset | Provider | Free tier | Notes |
|---|---|---|---|
| `brevo` | Brevo (Sendinblue) | **300/day** — no credit card | Best all-round free option |
| `zoho` | Zoho Mail | 50/day | **Free custom domain email** forever |
| `gmail` | Gmail | 500/day | Requires App Password (not account password) |
| `mailgun` | Mailgun | 100/day (3 months) | Pay-as-you-go after trial |
| `postmark` | Postmark | 100 test/month | Best deliverability; production is paid |
| `outlook` | Outlook.com | 300/day | @outlook.com / @hotmail.com accounts |
| `office365` | Microsoft 365 | Included in M365 | Admin must enable SMTP AUTH |
| `awsSes` | AWS SES | 62k/mo from EC2 | Change `host` for non-us-east-1 |
| `yahoo` | Yahoo Mail | Limited | Requires App Password |
| `ethereal` | Ethereal | ∞ (fake) | Local dev only — emails never delivered |

#### Per-provider setup

**Gmail**
```ts
// Requires an App Password — not your regular account password
// Google Account → Security → 2-Step Verification → App passwords
new SmtpEmailAdapter({
  ...smtpPresets.gmail,
  auth: { user: 'you@gmail.com', pass: process.env.GMAIL_APP_PASSWORD! },
  from: 'My App <you@gmail.com>',
})
```

**Brevo** (best free option)
```ts
// SMTP key from: app.brevo.com → Settings → SMTP & API → SMTP Keys
new SmtpEmailAdapter({
  ...smtpPresets.brevo,
  auth: { user: process.env.BREVO_LOGIN_EMAIL!, pass: process.env.BREVO_SMTP_KEY! },
  from: 'My App <noreply@yourdomain.com>',
})
```

**Zoho Mail** (free custom domain)
```ts
// zoho.com/mail → add domain → verify DNS → create mailbox → enable SMTP
new SmtpEmailAdapter({
  ...smtpPresets.zoho,
  auth: { user: 'noreply@yourdomain.com', pass: process.env.ZOHO_PASS! },
  from: 'My App <noreply@yourdomain.com>',
})
```

**AWS SES**
```ts
// SES Console → SMTP Settings → Create SMTP Credentials
// These are NOT your AWS access keys — they're separate SMTP credentials
new SmtpEmailAdapter({
  ...smtpPresets.awsSes,          // defaults to us-east-1
  // other regions: host: 'email-smtp.eu-west-1.amazonaws.com'
  auth: { user: process.env.SES_SMTP_USER!, pass: process.env.SES_SMTP_PASS! },
  from: 'My App <noreply@yourdomain.com>',
})
```

**Custom / self-hosted SMTP**
```ts
new SmtpEmailAdapter({
  host: 'mail.yourdomain.com',
  port: 465,
  secure: true,     // true = TLS (port 465) | false = STARTTLS (port 587)
  auth: { user: 'noreply@yourdomain.com', pass: process.env.SMTP_PASS! },
  from: 'noreply@yourdomain.com',
})
```

**Ethereal — local development**
```ts
// Zero config — no real emails sent — preview at ethereal.email/messages
const emailAdapter = await SmtpEmailAdapter.createEtherealTransport();
// Logs: Preview URL → https://ethereal.email/messages
```

**Verify connection on startup** (catch misconfigured credentials at boot, not at send time)
```ts
const emailAdapter = new SmtpEmailAdapter({ ... });
await emailAdapter.verify(); // throws if SMTP connection fails
```

---

### Option B — Resend (edge-compatible)

```bash
npm install @custom-auth/adapter-resend
```

1. Sign up at [resend.com](https://resend.com) — free, no credit card
2. Get API key from the dashboard
3. Verify your sending domain (or use `onboarding@resend.dev` while testing)

```ts
import { ResendEmailAdapter } from '@custom-auth/adapter-resend';

new ResendEmailAdapter({
  apiKey: process.env.RESEND_API_KEY!,   // re_xxxxxxxxxxxxxxxx
  from: 'My App <noreply@yourdomain.com>',
})
```

**Resend free tier:** 100 emails/day · 3,000/month · no credit card

---

### Custom Email Templates

Both adapters accept identical `templates` config. Override any combination:

```ts
new SmtpEmailAdapter({
  // ...smtp config...
  templates: {
    // Called after registration when emailVerification: true
    verification: (email, url) => ({
      subject: 'Confirm your email',
      html: `
        <h1>Welcome!</h1>
        <p>Click the link to verify your email:</p>
        <a href="${url}" style="background:#000;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;">
          Verify Email
        </a>
      `,
      text: `Verify your email: ${url}`,
    }),

    // Called by POST /forgot-password
    passwordReset: (email, url) => ({
      subject: 'Reset your password',
      html: `<p>Reset link (expires in 1 hour): <a href="${url}">${url}</a></p>`,
      text: `Reset your password: ${url}`,
    }),

    // Called by POST /magic-link
    magicLink: (email, url) => ({
      subject: 'Your sign-in link',
      html: `<p>Click to sign in (expires in 15 minutes): <a href="${url}">${url}</a></p>`,
      text: `Sign in: ${url}`,
    }),
  },
})
```

Each template function signature: `(email: string, url: string) => { subject: string; html: string; text?: string }`
Unoverridden templates use the built-in defaults.

---

## Framework Integration

### Next.js App Router

Create a catch-all route at `app/api/auth/[...auth]/route.ts`:

```ts
// app/api/auth/[...auth]/route.ts
import { createAuth } from '@custom-auth/core';
import { DrizzleAdapter } from '@custom-auth/drizzle';
import { ResendEmailAdapter } from '@custom-auth/adapter-resend';
import { db, usersTable, sessionsTable, verificationTokensTable } from '@/db/schema';

const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  adapter: new DrizzleAdapter({ db, usersTable, sessionsTable, verificationTokensTable }),
  emailAdapter: new ResendEmailAdapter({
    apiKey: process.env.RESEND_API_KEY!,
    from: `${process.env.APP_NAME} <noreply@yourdomain.com>`,
  }),
  emailVerification: true,
  verifyEmailUrl:   `${process.env.NEXT_PUBLIC_APP_URL}/verify-email`,
  resetPasswordUrl: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  providers: [
    { id: 'google', name: 'Google', type: 'oauth',
      clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
    { id: 'github', name: 'GitHub', type: 'oauth',
      clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! },
  ],
});

// Next.js App Router — native Web Request/Response, no adapter needed
export const GET  = (req: Request) => auth.handleRequest(req);
export const POST = (req: Request) => auth.handleRequest(req);
export const dynamic = 'force-dynamic';
```

---

### Next.js Pages Router

```ts
// pages/api/auth/[...auth].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuth } from '@custom-auth/core';
import { DrizzleAdapter } from '@custom-auth/drizzle';
import { db, usersTable, sessionsTable, verificationTokensTable } from '@/db/schema';

const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  adapter: new DrizzleAdapter({ db, usersTable, sessionsTable, verificationTokensTable }),
});

function toWebRequest(req: NextApiRequest): Request {
  const url = `http://${req.headers.host}${req.url}`;
  return new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: ['GET', 'HEAD'].includes(req.method!) ? undefined : JSON.stringify(req.body),
  });
}

async function sendWebResponse(res: NextApiResponse, webRes: Response) {
  res.status(webRes.status);
  webRes.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(await webRes.text());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await sendWebResponse(res, await auth.handleRequest(toWebRequest(req)));
}

export const config = { api: { bodyParser: true } };
```

---

### Express

```bash
npm install @custom-auth/core @custom-auth/drizzle @custom-auth/adapter-nodemailer express
```

```ts
import express from 'express';
import { createAuth } from '@custom-auth/core';
import { DrizzleAdapter } from '@custom-auth/drizzle';
import { SmtpEmailAdapter, smtpPresets } from '@custom-auth/adapter-nodemailer';
import { db, usersTable, sessionsTable, verificationTokensTable } from './db/schema';

const app = express();
app.use(express.json());

const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  adapter: new DrizzleAdapter({ db, usersTable, sessionsTable, verificationTokensTable }),
  emailAdapter: new SmtpEmailAdapter({
    ...smtpPresets.brevo,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    from: 'My App <noreply@yourdomain.com>',
  }),
  emailVerification: true,
  verifyEmailUrl:   `${process.env.APP_URL}/verify-email`,
  resetPasswordUrl: `${process.env.APP_URL}/reset-password`,
});

function toWebRequest(req: express.Request): Request {
  const url = `http://${req.headers.host}${req.url}`;
  return new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
  });
}

async function sendWebResponse(res: express.Response, webRes: Response) {
  res.status(webRes.status);
  webRes.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(await webRes.text());
}

app.all('/api/auth/*', async (req, res) => {
  try {
    await sendWebResponse(res, await auth.handleRequest(toWebRequest(req)));
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(process.env.PORT ?? 3001);
```

---

### Hono

Hono uses Web-standard `Request`/`Response` natively — simplest integration:

```ts
import { Hono } from 'hono';
import { createAuth } from '@custom-auth/core';
import { DrizzleAdapter } from '@custom-auth/drizzle';
import { db, usersTable, sessionsTable, verificationTokensTable } from './db/schema';

const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  adapter: new DrizzleAdapter({ db, usersTable, sessionsTable, verificationTokensTable }),
});

const app = new Hono();

// Pass the native Web Request directly — no adapter needed
app.all('/api/auth/*', (c) => auth.handleRequest(c.req.raw));

export default app;
```

---

### Fastify

```ts
import Fastify from 'fastify';
import { createAuth } from '@custom-auth/core';
import { DrizzleAdapter } from '@custom-auth/drizzle';
import { db, usersTable, sessionsTable, verificationTokensTable } from './db/schema';

const fastify = Fastify();

const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  adapter: new DrizzleAdapter({ db, usersTable, sessionsTable, verificationTokensTable }),
});

function toWebRequest(req: any): Request {
  const url = `http://${req.hostname}${req.url}`;
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
  });
}

fastify.all('/api/auth/*', async (request, reply) => {
  const webRes = await auth.handleRequest(toWebRequest(request));
  reply.status(webRes.status);
  webRes.headers.forEach((v, k) => reply.header(k, v));
  reply.send(await webRes.text());
});

fastify.listen({ port: 3001 });
```

---

## React Frontend SDK

Wrap your app with `AuthProvider` once, then use hooks anywhere.

### Setup

```tsx
// app/layout.tsx (Next.js) or index.tsx (CRA / Vite)
import { AuthProvider } from '@custom-auth/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider apiBaseUrl="/api/auth">
      {children}
    </AuthProvider>
  );
}
```

### `useSession` — current user state

```tsx
import { useSession } from '@custom-auth/react';

function Header() {
  const { user, isAuthenticated, isLoading } = useSession();

  if (isLoading) return <Spinner />;

  return isAuthenticated
    ? <span>Hello, {user.email} ({user.role})</span>
    : <a href="/login">Sign in</a>;
}
```

### `useSignIn` — email/password login

```tsx
import { useSignIn } from '@custom-auth/react';

function LoginForm() {
  const { signIn, isLoading, error } = useSignIn();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await signIn(fd.get('email') as string, fd.get('password') as string);
      router.push('/dashboard');
    } catch {
      // error is already set in the hook
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email"    type="email"    required />
      <input name="password" type="password" required />
      {error && <p className="text-red-500">{error.message}</p>}
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
```

### `useSignUp` — registration

```tsx
import { useSignUp } from '@custom-auth/react';

function RegisterForm() {
  const { signUp, isLoading, error } = useSignUp();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await signUp(fd.get('email') as string, fd.get('password') as string, fd.get('name') as string);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name"     type="text"     />
      <input name="email"    type="email"    required />
      <input name="password" type="password" minLength={8} required />
      {error && <p>{error.message}</p>}
      <button type="submit" disabled={isLoading}>Create account</button>
    </form>
  );
}
```

### `useSignOut`

```tsx
import { useSignOut } from '@custom-auth/react';

function SignOutButton() {
  const { signOut } = useSignOut();
  return <button onClick={() => signOut()}>Sign out</button>;
}
```

### `useMagicLink` — passwordless sign-in

```tsx
import { useMagicLink } from '@custom-auth/react';

function MagicLinkForm() {
  const { sendMagicLink, isLoading, isSent } = useMagicLink();

  if (isSent) return <p>Check your email for a sign-in link.</p>;

  return (
    <form onSubmit={e => { e.preventDefault(); sendMagicLink(new FormData(e.currentTarget).get('email') as string); }}>
      <input name="email" type="email" required />
      <button type="submit" disabled={isLoading}>Send link</button>
    </form>
  );
}
```

### `useMfa` — TOTP setup & verify

```tsx
import { useMfa } from '@custom-auth/react';

function MfaSetup() {
  const { setup, enable, disable, verify, qrCode, isLoading } = useMfa();

  // 1. Generate QR code
  await setup();  // sets qrCode (data URL)

  // 2. User scans QR with authenticator app, then enters first code
  await enable(code);

  // 3. Verify code during login (after MFA gate)
  await verify(tempToken, code);

  // 4. Disable
  await disable(code);
}
```

### OAuth sign-in

No hook needed — redirect to the OAuth start URL:

```tsx
<a href="/api/auth/oauth/google">Sign in with Google</a>
<a href="/api/auth/oauth/github">Sign in with GitHub</a>
```

The SDK handles the full OAuth flow and sets the session cookie on callback.

---

## Next.js Server Helpers

```bash
npm install @custom-auth/nextjs
```

### `getServerSession` — read session in Server Components / Route Handlers

```ts
import { getServerSession } from '@custom-auth/nextjs';

// Server Component
export default async function ProfilePage() {
  const session = await getServerSession(/* request not needed in server components */);
  if (!session) redirect('/login');
  return <h1>Hello, {session.user.email}</h1>;
}

// Route Handler
export async function GET(request: Request) {
  const session = await getServerSession(request, { secret: process.env.AUTH_SECRET! });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ user: session.user });
}
```

### `requireSession` — throws 401 if unauthenticated

```ts
import { requireSession } from '@custom-auth/nextjs';

export async function GET(request: Request) {
  const session = await requireSession(request, { secret: process.env.AUTH_SECRET! });
  // guaranteed non-null — throws Response({ status: 401 }) otherwise
  return Response.json({ user: session.user });
}
```

### `withRole` — require a specific role

```ts
import { withRole } from '@custom-auth/nextjs';

export async function DELETE(request: Request) {
  const session = await withRole(request, 'admin', { secret: process.env.AUTH_SECRET! });
  // only admins reach here — returns 403 for wrong role, 401 if unauthenticated
}
```

### `withAuth` — Edge Middleware

Protect routes at the edge with zero DB round-trips:

```ts
// middleware.ts
import { withAuth } from '@custom-auth/nextjs';

export default withAuth({
  secret: process.env.AUTH_SECRET!,
  loginUrl: '/login',
  publicPaths: [
    '/login',
    '/register',
    '/api/auth',          // prefix match
    '/verify-email',
    '/reset-password',
  ],
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

**Session shape available in all helpers:**
```ts
interface NextAuthSession {
  user: {
    id:     string;
    email:  string;
    role:   string;
    name?:  string;
  };
  jti?: string;   // DB session ID — used for revocation
  iat?: number;   // issued at (unix timestamp)
  exp?: number;   // expires at (unix timestamp)
}
```

---

## API Routes Reference

All routes are mounted under your configured base path (default `/api/auth`).

### Authentication

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/register` | `{ email, password, name? }` | Create account. Sends verification email if `emailVerification: true` |
| `POST` | `/login` | `{ email, password }` | Sign in. Returns `{ token, user }` or MFA gate |
| `POST` | `/logout` | — | Sign out + revoke DB session |
| `POST` | `/refresh` | — | Rotate session token (rate-limited: 10/min) |
| `GET`  | `/session` | — | Return current user from cookie |

### Passwordless

| Method | Path | Body / Query | Description |
|---|---|---|---|
| `POST` | `/magic-link` | `{ email }` | Send magic link (expires in 15 min) |
| `GET`  | `/magic-link/verify` | `?token=...` | Verify magic link, create session |

### Email & Password

| Method | Path | Body / Query | Description |
|---|---|---|---|
| `GET`  | `/verify-email` | `?token=...` | Verify email after registration |
| `POST` | `/forgot-password` | `{ email }` | Send reset link (expires in 1 hour) |
| `POST` | `/reset-password` | `{ token, password }` | Complete password reset |

### MFA (TOTP)

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/mfa/setup` | — | Generate TOTP secret + QR code |
| `POST` | `/mfa/enable` | `{ code }` | Enable MFA (verify first TOTP code) |
| `POST` | `/mfa/disable` | `{ code }` | Disable MFA (verify current TOTP code) |
| `POST` | `/mfa/verify` | `{ tempToken, code }` | Complete MFA gate after login (rate-limited: 5/min) |

### OAuth

| Method | Path | Description |
|---|---|---|
| `GET` | `/oauth/:provider` | Redirect to OAuth provider (sets CSRF state cookie) |
| `GET` | `/callback/:provider` | OAuth callback — creates/updates user, sets session |

---

## Auth Features

### Email / Password

Register creates a bcrypt-hashed password (default rounds: 10, configurable up to 12).
Minimum password length: 8 characters.

```ts
// POST /api/auth/register
{ "email": "user@example.com", "password": "securepassword", "name": "Alice" }

// POST /api/auth/login
{ "email": "user@example.com", "password": "securepassword" }
// Response: { "token": "...", "user": { "id": "...", "email": "...", "role": "user" } }
// Or, if MFA enabled: { "mfaRequired": true, "tempToken": "..." }
```

---

### Magic Link (Passwordless)

Send a one-time sign-in link valid for **15 minutes**. No password required.

```ts
// POST /api/auth/magic-link
{ "email": "user@example.com" }
// → Sends email with link: https://yourapp.com/api/auth/magic-link/verify?token=...

// GET /api/auth/magic-link/verify?token=abc123
// → Creates session, sets cookie, returns { token, user }
```

---

### OAuth (Google, GitHub)

```ts
// In createAuth config:
providers: [
  {
    id: 'google', name: 'Google', type: 'oauth',
    clientId:     process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
  {
    id: 'github', name: 'GitHub', type: 'oauth',
    clientId:     process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  },
],
```

**OAuth app callback URLs to register:**
- Google: `https://yourapp.com/api/auth/callback/google`
- GitHub: `https://yourapp.com/api/auth/callback/github`

The SDK handles:
- CSRF state generation + constant-time verification (`timingSafeEqual`)
- User creation on first OAuth sign-in
- User lookup on subsequent sign-ins
- Session creation and cookie setting

---

### MFA (TOTP)

Authenticator app-based two-factor authentication (Google Authenticator, Authy, 1Password, etc.).

**Flow:**

```
1. User enables MFA:
   POST /mfa/setup   → { secret, qrCode (data URL) }
   User scans QR with authenticator app
   POST /mfa/enable  { code: "123456" }  → MFA active

2. Login with MFA enabled:
   POST /login       → { mfaRequired: true, tempToken: "..." }
   POST /mfa/verify  { tempToken, code: "123456" }  → { token, user }
   (rate-limited: 5 attempts/min)

3. Disable MFA:
   POST /mfa/disable { code: "123456" }
```

---

### Session Management

Sessions are dual-layered: **JWT** for stateless verification + **DB record** for real revocation.

```ts
// Token in cookie (httpOnly, auto-Secure in production)
// JWT payload:
{
  sub: "user-id",
  email: "user@example.com",
  role: "user",
  jti: "session-db-id",   // DB session ID for revocation lookup
  iat: 1716300000,
  exp: 1716904800,
}

// Logout revokes the DB session — the JWT is dead even if not expired
// POST /api/auth/logout

// Token refresh rotates the session (old session deleted, new one created)
// POST /api/auth/refresh  (rate-limited: 10/min)
```

---

### Password Reset

```
1. POST /api/auth/forgot-password  { "email": "user@example.com" }
   → Sends email with link valid for 1 hour

2. User clicks link → your frontend reads ?token= from URL
   POST /api/auth/reset-password  { "token": "...", "password": "newpassword" }
   → Password updated, old sessions invalidated
```

---

### Email Verification

When `emailVerification: true`:
1. Registration sends a verification email (link valid 24 hours)
2. `user.emailVerified` is `false` until verified
3. Login with unverified email returns `EMAIL_NOT_VERIFIED` error

```
GET /api/auth/verify-email?token=...
→ Sets emailVerified: true, returns { token, user }
```

---

## RBAC — Role-Based Access Control

```ts
import { RBACManager } from '@custom-auth/core';

const rbac = new RBACManager({
  roles: {
    admin: {
      permissions: ['users:read', 'users:write', 'users:delete', 'settings:write'],
    },
    editor: {
      permissions: ['posts:read', 'posts:write'],
      inherits: ['viewer'],         // inherits all viewer permissions
    },
    viewer: {
      permissions: ['posts:read'],
    },
  },
});

// Check permission
rbac.hasPermission(user, 'posts:write');  // true | false

// In a route handler:
app.delete('/api/posts/:id', async (req, res) => {
  const session = await getSession(req);
  if (!rbac.hasPermission(session.user, 'posts:delete')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // ...
});
```

Roles are stored on the `User` object and included in the JWT. The default role for new users is `"user"`.

---

## Rate Limiting

The SDK has built-in rate limits on sensitive endpoints:
- `POST /mfa/verify` — **5 requests/minute** per user
- `POST /refresh` — **10 requests/minute** per IP

Plug in a custom rate limiter for all other endpoints:

```ts
import type { RateLimiterAdapter } from '@custom-auth/core';

// Example: in-memory (development only)
class InMemoryRateLimiter implements RateLimiterAdapter {
  private counts = new Map<string, { count: number; reset: number }>();

  async check(key: string, limit = 10, windowMs = 60_000): Promise<boolean> {
    const now = Date.now();
    const entry = this.counts.get(key) ?? { count: 0, reset: now + windowMs };

    if (now > entry.reset) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }

    entry.count++;
    this.counts.set(key, entry);
    return entry.count <= limit;   // true = allowed, false = blocked
  }
}

// Example: Redis-backed (production)
import { createClient } from 'redis';

class RedisRateLimiter implements RateLimiterAdapter {
  private redis = createClient({ url: process.env.REDIS_URL });

  async check(key: string, limit = 10, windowMs = 60_000): Promise<boolean> {
    await this.redis.connect().catch(() => {}); // idempotent
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.pExpire(key, windowMs);
    return count <= limit;
  }
}

const auth = createAuth({
  rateLimiter: new RedisRateLimiter(),
  // ...
});
```

---

## Lifecycle Hooks

Fire callbacks on any auth event — for audit logs, analytics, Slack alerts, etc.

```ts
const auth = createAuth({
  hooks: {
    onSuccess: async ({ event, userId, email, timestamp }) => {
      // event: 'register' | 'login' | 'logout' | 'mfa-verify' | 'magic-link-verify'
      //      | 'email-verify' | 'password-reset' | 'oauth-login' | 'token-refresh'
      await db.insert(auditLogTable).values({ event, userId, email, timestamp });
    },

    onError: async ({ event, error, email, timestamp }) => {
      // Called for recoverable errors (invalid credentials, expired tokens, etc.)
      // NOT called for 5xx / config errors
      await metrics.increment(`auth.error.${error.code}`, { email });

      if (error.code === 'INVALID_CREDENTIALS') {
        await slack.notify(`Failed login attempt for ${email}`);
      }
    },
  },
});
```

Hook failures are swallowed — a broken hook never breaks an auth flow.

---

## Error Handling

Every auth failure throws a typed `AuthError` subclass. Catch them by type:

```ts
import {
  AuthError,
  InvalidCredentialsError,
  UserExistsError,
  UserNotFoundError,
  MfaRequiredError,
  MfaInvalidError,
  TokenExpiredError,
  TokenInvalidError,
  RateLimitError,
  PasswordTooShortError,
  EmailNotVerifiedError,
} from '@custom-auth/core';

try {
  await auth.login(email, password);
} catch (e) {
  if (e instanceof MfaRequiredError) {
    // e.tempToken — use to call /mfa/verify
    return res.json({ mfaRequired: true, tempToken: e.tempToken });
  }
  if (e instanceof InvalidCredentialsError) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (e instanceof EmailNotVerifiedError) {
    return res.status(403).json({ error: 'Please verify your email first' });
  }
  if (e instanceof AuthError) {
    // e.code — machine-readable error code
    // e.statusCode — suggested HTTP status
    // e.message — human-readable message
    return res.status(e.statusCode).json({ error: e.message, code: e.code });
  }
  throw e; // unexpected — re-throw
}
```

**Error code reference:**

| Class | Code | HTTP |
|---|---|---|
| `InvalidCredentialsError` | `INVALID_CREDENTIALS` | 401 |
| `UserExistsError` | `USER_EXISTS` | 409 |
| `UserNotFoundError` | `USER_NOT_FOUND` | 404 |
| `MfaRequiredError` | `MFA_REQUIRED` | 200 (gate, not error) |
| `MfaInvalidError` | `MFA_INVALID` | 401 |
| `TokenExpiredError` | `TOKEN_EXPIRED` | 401 |
| `TokenInvalidError` | `TOKEN_INVALID` | 401 |
| `RateLimitError` | `RATE_LIMIT` | 429 |
| `PasswordTooShortError` | `PASSWORD_TOO_SHORT` | 400 |
| `EmailNotVerifiedError` | `EMAIL_NOT_VERIFIED` | 403 |
| `MissingAdapterError` | `MISSING_ADAPTER` | 500 |
| `OAuthError` | `OAUTH_ERROR` | 400 |

---

## Security

| Mechanism | Implementation |
|---|---|
| **Password hashing** | bcrypt with configurable work factor (default 10) |
| **JWT signing** | HS256 with secret ≥ 32 chars |
| **Session revocation** | DB-backed sessions — logout deletes the record; JWT is dead even if not expired |
| **Cookies** | `httpOnly=true`, `sameSite=Lax`, `Secure` auto-set in production |
| **OAuth CSRF** | State parameter set as `httpOnly` cookie; verified with `timingSafeEqual` (constant-time comparison, prevents timing attacks) |
| **Token expiry** | Magic links: 15 min · Email verify: 24 h · Password reset: 1 h · MFA pending: 5 min |
| **Rate limiting** | MFA verify: 5/min · Token refresh: 10/min · Custom adapter for all endpoints |
| **Timing attacks** | `timingSafeEqual` used for all secret comparisons |

---

## Environment Variables

```env
# ── Required ────────────────────────────────────────────────────────────────
AUTH_SECRET=your-secret-key-minimum-32-chars-change-this    # JWT signing secret

# ── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb      # Drizzle / Prisma
# or:
MONGODB_URI=mongodb://localhost:27017/mydb                   # Mongoose

# ── Email — SMTP (Nodemailer) ─────────────────────────────────────────────────
SMTP_USER=you@yourdomain.com
SMTP_PASS=your-smtp-password-or-key

# ── Email — Resend ────────────────────────────────────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx

# ── OAuth — Google ────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxx

# ── OAuth — GitHub ────────────────────────────────────────────────────────────
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── App ───────────────────────────────────────────────────────────────────────
APP_URL=https://yourapp.com                                  # or http://localhost:3000 in dev
NEXT_PUBLIC_APP_URL=https://yourapp.com                     # Next.js public env

# ── Optional ──────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379                             # For Redis-backed rate limiter
NODE_ENV=production                                          # Enables Secure cookie flag
```

---

## Development Setup

```bash
# Clone and install
git clone https://github.com/your-org/auth-sdk.git
cd auth-sdk
npm install

# Build all packages
npm run build

# Run tests (45 tests in packages/core)
npm run test

# Watch mode for a specific package
cd packages/core && npm run dev

# Run the Express example
cd examples/express && npm run dev

# Run the Next.js example
cd examples/nextjs
cp .env.example .env.local   # fill in DATABASE_URL, AUTH_SECRET
npx prisma generate          # required before first run
npm run dev
```

**Monorepo structure:**
```
packages/
├── core/                     — Auth engine (flows, handlers, session, RBAC, errors)
│   └── src/
│       ├── interfaces/       — TypeScript types
│       ├── errors/           — Typed error hierarchy
│       ├── session/          — JWT + DB session management
│       ├── flows/            — Business logic (register, login, MFA, magic-link, OAuth)
│       ├── handlers/         — HTTP router (/api/auth/*)
│       ├── utils/            — crypto helpers (timingSafeEqual, generateToken, etc.)
│       ├── security/         — Rate limiting
│       ├── providers/        — OAuth abstractions
│       └── rbac/             — Role-based access control
├── react/                    — React hooks + AuthProvider
├── nextjs/                   — Edge middleware + server helpers
└── adapters/
    ├── drizzle/              — Drizzle ORM adapter + PostgreSQL schema
    ├── prisma/               — Prisma adapter
    ├── mongoose/             — Mongoose adapter
    ├── nodemailer/           — SMTP email adapter
    └── resend/               — Resend API email adapter

examples/
├── nextjs/                   — Full Next.js App Router example (Prisma)
└── express/                  — Express example (Prisma)
```

---

## License

MIT
