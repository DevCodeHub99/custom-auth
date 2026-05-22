# @custom-auth/adapter-resend

The official Resend adapter for sending verification emails and magic links in `@custom-auth`.

## Installation

```bash
npm install @custom-auth/core @custom-auth/adapter-resend resend
```

## Quick Start

Pass your Resend API key to the adapter.

```typescript
import { CustomAuth } from '@custom-auth/core';
import { ResendAdapter } from '@custom-auth/adapter-resend';

export const auth = new CustomAuth({
  email: new ResendAdapter(process.env.RESEND_API_KEY, {
    from: 'Auth <noreply@yourdomain.com>'
  }),
  // ...other config
});
```

## Documentation
For full documentation, please visit the [Main Repository](https://github.com/DevCodeHub99/custom-auth).
