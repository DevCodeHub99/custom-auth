# @custom-auth/adapter-nodemailer

SMTP email adapter for `@custom-auth/core`. Works with **any** SMTP provider — Gmail,
Zoho, Brevo, Mailgun, Postmark, Outlook, Office 365, AWS SES, Yahoo, or your own
mail server. Built on [Nodemailer](https://nodemailer.com).

> **Choosing between SMTP and Resend?**
> See [EMAIL_ADAPTERS.md](../../../EMAIL_ADAPTERS.md) for a full comparison.

---

## Installation

```bash
npm install @custom-auth/adapter-nodemailer @custom-auth/core
```

---

## Quick Start

### Option A — Built-in preset (recommended)

Pick a preset from the table below, add your credentials, done:

```ts
import { createAuth } from '@custom-auth/core';
import { SmtpEmailAdapter, smtpPresets } from '@custom-auth/adapter-nodemailer';

const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  emailAdapter: new SmtpEmailAdapter({
    ...smtpPresets.brevo,                       // swap to any preset below
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    from: 'My App <noreply@yourdomain.com>',
  }),
  emailVerification: true,
  verifyEmailUrl: 'https://yourapp.com/verify-email',
  resetPasswordUrl: 'https://yourapp.com/reset-password',
});
```

### Option B — Custom SMTP server (your own domain)

```ts
new SmtpEmailAdapter({
  host: 'mail.yourdomain.com',
  port: 465,
  secure: true,          // true = TLS (port 465), false = STARTTLS (port 587)
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
  from: 'Auth <noreply@yourdomain.com>',
})
```

### Option C — Pre-built Nodemailer transporter

```ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({ /* your config */ });

new SmtpEmailAdapter({ transporter, from: 'noreply@yourdomain.com' })
```

---

## Available Presets

| Preset key | Provider | Free tier | Notes |
|---|---|---|---|
| `gmail` | Gmail | 500/day (personal) | Requires [App Password](https://support.google.com/accounts/answer/185833), not your account password |
| `zoho` | Zoho Mail | 50/day via SMTP | **Best for custom domains at zero cost** — free with your own domain |
| `brevo` | Brevo (Sendinblue) | **300/day**, no card | Best free transactional option overall |
| `mailgun` | Mailgun | 100/day (3 mo) | Pay-as-you-go after trial |
| `postmark` | Postmark | 100 test/month | Best deliverability; paid in production |
| `outlook` | Outlook personal | 300/day | @outlook.com / @hotmail.com accounts |
| `office365` | Microsoft 365 | Included in M365 | Admin must enable SMTP AUTH |
| `awsSes` | AWS SES | 62k/mo from EC2 | Change `host` for non-us-east-1 regions |
| `yahoo` | Yahoo Mail | Limited | Requires App Password |
| `ethereal` | Ethereal (dev) | Unlimited (fake) | Emails captured, never delivered — local dev only |

---

## Local Development — Ethereal (zero config)

No real email account needed during development:

```ts
// Only in development
if (process.env.NODE_ENV !== 'production') {
  const adapter = await SmtpEmailAdapter.createEtherealTransport();
  // Logs credentials + https://ethereal.email/messages preview URL to console
}
```

Emails are captured at [ethereal.email/messages](https://ethereal.email/messages) —
click any captured email to view the rendered HTML.

---

## Verify Connection on Startup

Catch misconfigured credentials at boot time, not at send time:

```ts
const emailAdapter = new SmtpEmailAdapter({ ... });
await emailAdapter.verify(); // throws if SMTP connection fails
```

---

## Custom Templates

Override any or all templates — partial override, rest use defaults:

```ts
new SmtpEmailAdapter({
  ...smtpPresets.brevo,
  auth: { user: '...', pass: '...' },
  from: 'Me <noreply@yourdomain.com>',
  templates: {
    magicLink: (email, url) => ({
      subject: `Your sign-in link for ${email}`,
      html: `<a href="${url}">Sign in now →</a>`,
      text: `Sign in: ${url}`,
    }),
    // verification and passwordReset still use built-in templates
  },
})
```

Each template function receives `(email: string, url: string)` and must return:

```ts
{
  subject: string;
  html: string;
  text?: string;  // plain-text fallback — recommended for deliverability
}
```

---

## Extra Mail Options

Apply options to every outgoing email (replyTo, headers, priority, etc.):

```ts
new SmtpEmailAdapter({
  ...smtpPresets.gmail,
  auth: { user: '...', pass: '...' },
  from: 'noreply@example.com',
  mailOptions: {
    replyTo: 'support@example.com',
    headers: { 'X-App-Name': 'MyApp' },
  },
})
```

---

## Provider Setup Guides

### Gmail
1. Enable 2-Step Verification on your Google account
2. Go to **Google Account → Security → App passwords**
3. Create an app password for "Mail"
4. Use that 16-character password as `SMTP_PASS`

```env
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx   # 16-char App Password
```

### Zoho Mail (free custom domain)
1. Sign up at [zoho.com/mail](https://www.zoho.com/mail/)
2. Add your domain and verify DNS records
3. Create a mailbox (e.g. `noreply@yourdomain.com`)
4. Enable SMTP in Zoho Mail settings

```env
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-zoho-password
```

### Brevo
1. Sign up at [brevo.com](https://app.brevo.com)
2. Go to **Settings → SMTP & API → SMTP Keys → Create a new SMTP key**
3. Your SMTP user = your Brevo account email address

```env
SMTP_USER=you@youremail.com       # your Brevo login email
SMTP_PASS=xsmtpsib-...            # the SMTP key from Brevo dashboard
```

### AWS SES
1. Verify your domain in SES console
2. Go to **SES → SMTP Settings → Create SMTP Credentials**
   (these are NOT your AWS Access Key / Secret Key)
3. Change `host` in the preset if not using `us-east-1`

```env
SMTP_USER=AKIAIOSFODNN7EXAMPLE    # SES SMTP username
SMTP_PASS=wJalrXUtnFEMI/K...      # SES SMTP password
```

---

## Sent Emails

| Auth event | Template used |
|---|---|
| Register with `emailVerification: true` | `verification` |
| `POST /forgot-password` | `passwordReset` |
| `POST /magic-link` | `magicLink` |
