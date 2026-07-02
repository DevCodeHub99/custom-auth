/**
 * @custom-auth/adapter-nodemailer
 *
 * SMTP email adapter for @custom-auth/core using Nodemailer.
 * Works with ANY SMTP provider: Gmail, Zoho, Brevo, Mailgun, Postmark,
 * Outlook/Office365, AWS SES, or your own mail server.
 *
 * ─── Quick Start ───────────────────────────────────────────────────────────
 *
 *   // Option A — use a built-in preset (simplest)
 *   import { SmtpEmailAdapter, smtpPresets } from '@custom-auth/adapter-nodemailer';
 *
 *   const auth = createAuth({
 *     emailAdapter: new SmtpEmailAdapter({
 *       ...smtpPresets.gmail,
 *       auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
 *       from: 'My App <noreply@gmail.com>',
 *     }),
 *   });
 *
 *   // Option B — full custom SMTP config
 *   const auth = createAuth({
 *     emailAdapter: new SmtpEmailAdapter({
 *       host: 'smtp.yourdomain.com',
 *       port: 465,
 *       secure: true,
 *       auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
 *       from: 'Auth <noreply@yourdomain.com>',
 *     }),
 *   });
 *
 *   // Option C — pass your own pre-configured Nodemailer transporter
 *   import nodemailer from 'nodemailer';
 *   const transporter = nodemailer.createTransport({ ... });
 *   const auth = createAuth({
 *     emailAdapter: new SmtpEmailAdapter({ transporter, from: '...' }),
 *   });
 *
 * ─── Available Presets ─────────────────────────────────────────────────────
 *   smtpPresets.gmail       — Gmail (requires App Password, not account password)
 *   smtpPresets.zoho        — Zoho Mail (free domain email)
 *   smtpPresets.brevo       — Brevo / Sendinblue (300 free emails/day)
 *   smtpPresets.mailgun     — Mailgun SMTP
 *   smtpPresets.postmark    — Postmark
 *   smtpPresets.outlook     — Outlook / Hotmail personal
 *   smtpPresets.office365   — Microsoft 365 / Office 365
 *   smtpPresets.awsSes      — AWS SES (us-east-1; change host for other regions)
 *   smtpPresets.yahoo       — Yahoo Mail
 *   smtpPresets.ethereal    — Ethereal (fake SMTP for local dev/testing)
 */

import nodemailer, { Transporter, TransportOptions, SendMailOptions } from 'nodemailer';
import type { EmailAdapter } from '@custom-auth/core';

// ── Email template types (identical interface to Resend adapter) ───────────

export interface EmailTemplate {
  subject: string;
  html: string;
  /** Plain-text fallback — recommended for deliverability */
  text?: string;
}

export interface EmailTemplates {
  verification: (email: string, url: string) => EmailTemplate;
  passwordReset: (email: string, url: string) => EmailTemplate;
  magicLink: (email: string, url: string) => EmailTemplate;
  otp?: (email: string, code: string) => EmailTemplate;
}

// ── SMTP preset type ──────────────────────────────────────────────────────

export interface SmtpPreset {
  host: string;
  port: number;
  /** true = TLS from connection (port 465); false = STARTTLS (port 587) */
  secure: boolean;
}

// ── Config ────────────────────────────────────────────────────────────────

export interface SmtpEmailAdapterConfig {
  /**
   * Sender address shown in the "From" header.
   * @example 'My App <noreply@yourdomain.com>'
   * @example 'noreply@yourdomain.com'
   */
  from: string;

  /**
   * Pass a pre-built Nodemailer transporter (Option C).
   * When provided, host/port/secure/auth are ignored.
   */
  transporter?: Transporter;

  // ── Raw SMTP settings (Options A / B) ──────────────────────────────────

  /** SMTP hostname. Not needed if using a preset or transporter. */
  host?: string;
  /** SMTP port. Default: 587 (STARTTLS). Use 465 for TLS. */
  port?: number;
  /** true = TLS on connect (port 465). false = STARTTLS (port 587). Default: false */
  secure?: boolean;
  /** SMTP auth credentials. */
  auth?: {
    user: string;
    pass: string;
  };
  /**
   * Extra Nodemailer transport options (pool, tls, connectionTimeout, etc.).
   * These are merged with host/port/secure/auth.
   */
  transportOptions?: Omit<TransportOptions, 'host' | 'port' | 'secure' | 'auth'>;

  /**
   * Override default email templates.
   * Partial — only override the ones you need.
   */
  templates?: Partial<EmailTemplates>;

  /**
   * Additional Nodemailer SendMailOptions applied to every email.
   * Useful for setting replyTo, headers, priority, etc.
   * @example { replyTo: 'support@yourdomain.com' }
   */
  mailOptions?: Omit<SendMailOptions, 'from' | 'to' | 'subject' | 'html' | 'text'>;
}

// ── Built-in SMTP presets ─────────────────────────────────────────────────

/**
 * Ready-to-use SMTP settings for popular providers.
 * Spread the preset into SmtpEmailAdapterConfig, then add auth + from:
 *
 *   new SmtpEmailAdapter({
 *     ...smtpPresets.brevo,
 *     auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
 *     from: 'Me <noreply@yourdomain.com>',
 *   })
 */
export const smtpPresets: Record<string, SmtpPreset> = {
  /**
   * Gmail
   * Requires an App Password (Google Account → Security → App passwords).
   * Regular account password will NOT work — Google blocks it.
   * Free tier: 500 emails/day (personal), 2000/day (Google Workspace).
   * https://support.google.com/accounts/answer/185833
   */
  gmail: { host: 'smtp.gmail.com', port: 465, secure: true },

  /**
   * Zoho Mail — free with a custom domain
   * Sign up at https://www.zoho.com/mail/ → add your domain → use SMTP.
   * Free tier: 5 users, 5GB/user, 50 emails/day outbound via SMTP API.
   * Great for "noreply@yourdomain.com" at zero cost.
   */
  zoho: { host: 'smtp.zoho.com', port: 465, secure: true },

  /**
   * Brevo (formerly Sendinblue)
   * 300 free transactional emails/day, no credit card needed.
   * SMTP user = your Brevo account email.
   * SMTP pass = Brevo SMTP key (Settings → SMTP & API → SMTP Keys).
   * https://app.brevo.com/settings/keys/smtp
   */
  brevo: { host: 'smtp-relay.brevo.com', port: 587, secure: false },

  /**
   * Mailgun
   * SMTP user = postmaster@yourdomain.com (from Mailgun dashboard).
   * SMTP pass = Mailgun SMTP password.
   * Free tier: 100 emails/day for 3 months, then pay-as-you-go.
   */
  mailgun: { host: 'smtp.mailgun.org', port: 587, secure: false },

  /**
   * Postmark
   * Great deliverability. 100 free test emails/month.
   * SMTP user + pass = your Postmark Server API Token (same value for both).
   * https://account.postmarkapp.com/servers
   */
  postmark: { host: 'smtp.postmarkapp.com', port: 587, secure: false },

  /**
   * Outlook / Hotmail personal accounts (@outlook.com, @hotmail.com)
   * Free — but limited to 300 emails/day.
   * Use your Outlook email + password (or App Password if MFA enabled).
   */
  outlook: { host: 'smtp-mail.outlook.com', port: 587, secure: false },

  /**
   * Microsoft 365 / Office 365 (business accounts)
   * Use your M365 email + password.
   * Note: Tenant admin may need to enable SMTP AUTH.
   * https://docs.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission
   */
  office365: { host: 'smtp.office365.com', port: 587, secure: false },

  /**
   * AWS SES — us-east-1 region
   * Change host to match your region:
   *   us-west-2:    email-smtp.us-west-2.amazonaws.com
   *   eu-west-1:    email-smtp.eu-west-1.amazonaws.com
   * Credentials = SES SMTP credentials (NOT your AWS access keys).
   * Generate them at: SES Console → SMTP Settings → Create SMTP Credentials.
   * Free tier: 62,000 emails/month when sent from EC2.
   */
  awsSes: { host: 'email-smtp.us-east-1.amazonaws.com', port: 587, secure: false },

  /**
   * Yahoo Mail
   * Requires an App Password (Yahoo Account Security → Generate app password).
   */
  yahoo: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },

  /**
   * Ethereal — fake SMTP for local development / testing
   * Emails are captured (never delivered). View them at https://ethereal.email.
   * For local dev only — use SmtpEmailAdapter.createEtherealTransport() for
   * auto-generating Ethereal credentials instead of hardcoding.
   */
  ethereal: { host: 'smtp.ethereal.email', port: 587, secure: false },
};

// ── Default HTML templates ────────────────────────────────────────────────

const defaultTemplates: EmailTemplates = {
  verification: (_email, url) => ({
    subject: 'Verify your email address',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#111827;margin-bottom:8px;">Verify your email</h2>
        <p style="color:#374151;margin-bottom:24px;">
          Click the button below to verify your email address.
          This link expires in <strong>24 hours</strong>.
        </p>
        <a href="${url}"
           style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
                  border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
          Verify Email
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:24px;">
          Or paste this URL into your browser:<br>
          <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
        </p>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>`,
    text: `Verify your email address by visiting:\n${url}\n\nThis link expires in 24 hours.`,
  }),

  passwordReset: (_email, url) => ({
    subject: 'Reset your password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#111827;margin-bottom:8px;">Reset your password</h2>
        <p style="color:#374151;margin-bottom:24px;">
          Click the button below to set a new password.
          This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${url}"
           style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
                  border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
          Reset Password
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:24px;">
          Or paste this URL into your browser:<br>
          <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
        </p>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
          If you didn't request a password reset, you can safely ignore this email.
          Your password will not be changed.
        </p>
      </div>`,
    text: `Reset your password by visiting:\n${url}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.`,
  }),

  magicLink: (_email, url) => ({
    subject: 'Your sign-in link',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#111827;margin-bottom:8px;">Sign in to your account</h2>
        <p style="color:#374151;margin-bottom:24px;">
          Click the button below to sign in. This link expires in
          <strong>15 minutes</strong> and can only be used once.
        </p>
        <a href="${url}"
           style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
                  border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">
          Sign In
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:24px;">
          Or paste this URL into your browser:<br>
          <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
        </p>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
          If you didn't request this link, you can safely ignore this email.
        </p>
      </div>`,
    text: `Sign in by visiting:\n${url}\n\nThis link expires in 15 minutes and can only be used once.`,
  }),

  otp: (_email, code) => ({
    subject: 'Your one-time password (OTP)',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#111827;margin-bottom:8px;">Your verification code</h2>
        <p style="color:#374151;margin-bottom:24px;">
          Use the following one-time password to sign in. This code expires in
          <strong>5 minutes</strong>.
        </p>
        <div style="font-size:32px;font-weight:700;letter-spacing:4px;color:#2563eb;
                    background:#f3f4f6;padding:16px;text-align:center;border-radius:6px;
                    margin-bottom:24px;font-family:monospace;">
          ${code}
        </div>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>`,
    text: `Your verification code is: ${code}\n\nThis code expires in 5 minutes.`,
  }),
};

// ── Adapter ───────────────────────────────────────────────────────────────

export class SmtpEmailAdapter implements EmailAdapter {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly templates: EmailTemplates;
  private readonly mailOptions: Omit<SendMailOptions, 'from' | 'to' | 'subject' | 'html' | 'text'>;

  constructor(config: SmtpEmailAdapterConfig) {
    if (!config.from) throw new Error('SmtpEmailAdapter: from is required.');

    this.from = config.from;
    this.templates = { ...defaultTemplates, ...config.templates };
    this.mailOptions = config.mailOptions ?? {};

    if (config.transporter) {
      // Option C — caller-supplied transporter
      this.transporter = config.transporter;
    } else {
      // Options A / B — build from host/port/secure/auth
      if (!config.host) throw new Error('SmtpEmailAdapter: host is required (or pass a transporter).');
      if (!config.auth?.user || !config.auth?.pass) {
        throw new Error('SmtpEmailAdapter: auth.user and auth.pass are required.');
      }

      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port ?? 587,
        secure: config.secure ?? false,
        auth: {
          type: 'LOGIN',
          user: config.auth.user,
          pass: config.auth.pass,
        },
        // Sensible production defaults
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,     // ms between batches
        rateLimit: 5,        // max messages per rateDelta
        ...config.transportOptions,
      } as TransportOptions);
    }
  }

  // ── EmailAdapter interface ───────────────────────────────────────────

  async sendVerificationEmail(email: string, url: string): Promise<void> {
    await this.send(email, this.templates.verification(email, url));
  }

  async sendPasswordResetEmail(email: string, url: string): Promise<void> {
    await this.send(email, this.templates.passwordReset(email, url));
  }

  async sendMagicLinkEmail(email: string, url: string): Promise<void> {
    await this.send(email, this.templates.magicLink(email, url));
  }

  async sendOtpEmail(email: string, code: string): Promise<void> {
    if (!this.templates.otp) throw new Error('SmtpEmailAdapter: OTP template builder is missing.');
    await this.send(email, this.templates.otp(email, code));
  }

  // ── Utilities ────────────────────────────────────────────────────────

  /**
   * Verify the SMTP connection. Call this on startup to catch
   * misconfigured credentials early.
   *
   * @example
   * const adapter = new SmtpEmailAdapter({ ... });
   * await adapter.verify(); // throws if connection fails
   */
  async verify(): Promise<void> {
    await this.transporter.verify();
  }

  /**
   * Create a local Ethereal.email test account on-the-fly.
   * Returns a pre-configured SmtpEmailAdapter — all emails are captured
   * at https://ethereal.email (never delivered to real inboxes).
   *
   * Perfect for local development / CI.
   *
   * @example
   * const adapter = await SmtpEmailAdapter.createEtherealTransport();
   * // adapter.previewUrl is logged to console for easy access
   */
  static async createEtherealTransport(from?: string): Promise<SmtpEmailAdapter> {
    const account = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });

    const fromAddress = from ?? `Test <${account.user}>`;
    console.log('\n[SmtpEmailAdapter] Ethereal test account created');
    console.log(`  User:     ${account.user}`);
    console.log(`  Pass:     ${account.pass}`);
    console.log(`  Preview:  https://ethereal.email/messages\n`);

    return new SmtpEmailAdapter({ transporter, from: fromAddress });
  }

  // ── private ──────────────────────────────────────────────────────────

  private async send(to: string, template: EmailTemplate): Promise<void> {
    await this.transporter.sendMail({
      ...this.mailOptions,
      from: this.from,
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }
}
