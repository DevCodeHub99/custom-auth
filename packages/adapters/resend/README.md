# @custom-auth/adapter-resend

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


Edge-compatible email adapter for `@custom-auth/core` using the [Resend](https://resend.com) API. Uses only `fetch()` — no Node.js dependencies.

## Installation

```bash
# Install the core engine, the Resend adapter, and your chosen database adapter
npm install @custom-auth/core @custom-auth/adapter-resend <your-db-adapter>
```

Get an API key at [resend.com](https://resend.com) and verify your sending domain.

## Usage

```ts
import { createAuth } from '@custom-auth/core';
import { ResendEmailAdapter } from '@custom-auth/adapter-resend';

const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  emailAdapter: new ResendEmailAdapter({
    apiKey: process.env.RESEND_API_KEY!,
    from: 'Auth <noreply@yourdomain.com>',
  }),
  emailVerification: true,
  verifyEmailUrl: 'https://yourapp.com/verify-email',
  resetPasswordUrl: 'https://yourapp.com/reset-password',
});
```

## Custom templates

```ts
new ResendEmailAdapter({
  apiKey: process.env.RESEND_API_KEY!,
  from: 'Auth <noreply@yourdomain.com>',
  templates: {
    magicLink: (email, url) => ({
      subject: 'Your magic sign-in link',
      html: `<a href="${url}">Click to sign in</a>`,
      text: `Sign in: ${url}`,
    }),
    // verification and passwordReset use defaults
  },
});
```

## Sent emails

| Trigger | Template key |
|---------|-------------|
| `emailVerification: true` on register | `verification` |
| `POST /forgot-password` | `passwordReset` |
| `POST /magic-link` | `magicLink` |


## Documentation

For full documentation, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).

