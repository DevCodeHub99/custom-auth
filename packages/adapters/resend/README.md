# @custom-auth/adapter-resend

Edge-compatible email adapter for `@custom-auth/core` using the [Resend](https://resend.com) API. Uses only `fetch()` — no Node.js dependencies.

## Installation

```bash
npm install @custom-auth/adapter-resend @custom-auth/core
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
