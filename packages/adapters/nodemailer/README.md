# @custom-auth/adapter-nodemailer

The official Nodemailer adapter for sending verification emails and magic links in `@custom-auth`.

## Installation

```bash
npm install @custom-auth/core @custom-auth/adapter-nodemailer nodemailer
```

## Quick Start

Configure the adapter with your SMTP connection details.

```typescript
import { CustomAuth } from '@custom-auth/core';
import { NodemailerAdapter } from '@custom-auth/adapter-nodemailer';

export const auth = new CustomAuth({
  email: new NodemailerAdapter({
    host: 'smtp.example.com',
    port: 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    from: 'Auth <noreply@example.com>'
  }),
  // ...other config
});
```

## Documentation
For full documentation, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).
