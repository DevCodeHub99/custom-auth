/**
 * @custom-auth/adapter-resend
 *
 * Edge-compatible email adapter using the Resend API (https://resend.com).
 * Uses only fetch() — no Node.js dependencies. Works in Vercel Edge, Cloudflare
 * Workers, Bun, Deno, and browser environments.
 *
 * Usage:
 *
 *   import { ResendEmailAdapter } from '@custom-auth/adapter-resend';
 *
 *   const auth = createAuth({
 *     secret: process.env.AUTH_SECRET!,
 *     emailAdapter: new ResendEmailAdapter({
 *       apiKey: process.env.RESEND_API_KEY!,
 *       from: 'Auth <noreply@yourdomain.com>',
 *     }),
 *   });
 */

import type { EmailAdapter } from '@custom-auth/core';

// ── Config ────────────────────────────────────────────────────────────────

export interface ResendEmailAdapterConfig {
  /** Resend API key (re_...). */
  apiKey: string;
  /** Sender address. Must be verified in your Resend account. */
  from: string;
  /**
   * Override the default email templates.
   * Each function receives (email, url) and must return { subject, html, text? }.
   */
  templates?: Partial<EmailTemplates>;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailTemplates {
  verification: (email: string, url: string) => EmailTemplate;
  passwordReset: (email: string, url: string) => EmailTemplate;
  magicLink: (email: string, url: string) => EmailTemplate;
}

// ── Default templates ─────────────────────────────────────────────────────

const defaultTemplates: EmailTemplates = {
  verification: (_email, url) => ({
    subject: 'Verify your email address',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Verify your email</h2>
        <p>Click the link below to verify your email address. The link expires in 24 hours.</p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
          Verify Email
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:16px;">
          Or copy this URL: <a href="${url}">${url}</a>
        </p>
      </div>
    `,
    text: `Verify your email by visiting: ${url}`,
  }),

  passwordReset: (_email, url) => ({
    subject: 'Reset your password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Reset your password</h2>
        <p>Click the link below to set a new password. The link expires in 1 hour.</p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
          Reset Password
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:16px;">
          If you didn't request a password reset, you can safely ignore this email.
        </p>
        <p style="color:#6b7280;font-size:13px;">
          Or copy this URL: <a href="${url}">${url}</a>
        </p>
      </div>
    `,
    text: `Reset your password by visiting: ${url}`,
  }),

  magicLink: (_email, url) => ({
    subject: 'Your sign-in link',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Sign in to your account</h2>
        <p>Click the link below to sign in. The link expires in 15 minutes and can only be used once.</p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
          Sign In
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:16px;">
          If you didn't request this link, you can safely ignore this email.
        </p>
        <p style="color:#6b7280;font-size:13px;">
          Or copy this URL: <a href="${url}">${url}</a>
        </p>
      </div>
    `,
    text: `Sign in by visiting: ${url}`,
  }),
};

// ── Adapter ───────────────────────────────────────────────────────────────

export class ResendEmailAdapter implements EmailAdapter {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly templates: EmailTemplates;

  constructor(config: ResendEmailAdapterConfig) {
    if (!config.apiKey) throw new Error('ResendEmailAdapter: apiKey is required.');
    if (!config.from) throw new Error('ResendEmailAdapter: from is required.');

    this.apiKey = config.apiKey;
    this.from = config.from;
    this.templates = { ...defaultTemplates, ...config.templates };
  }

  async sendVerificationEmail(email: string, url: string): Promise<void> {
    const tmpl = this.templates.verification(email, url);
    await this.send(email, tmpl);
  }

  async sendPasswordResetEmail(email: string, url: string): Promise<void> {
    const tmpl = this.templates.passwordReset(email, url);
    await this.send(email, tmpl);
  }

  async sendMagicLinkEmail(email: string, url: string): Promise<void> {
    const tmpl = this.templates.magicLink(email, url);
    await this.send(email, tmpl);
  }

  // ── private ─────────────────────────────────────────────────────────

  private async send(to: string, template: EmailTemplate): Promise<void> {
    const body: Record<string, unknown> = {
      from: this.from,
      to: [to],
      subject: template.subject,
      html: template.html,
    };
    if (template.text) body.text = template.text;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = '';
      try {
        const data = await res.json();
        detail = data.message ?? JSON.stringify(data);
      } catch {
        detail = await res.text().catch(() => `HTTP ${res.status}`);
      }
      throw new Error(`ResendEmailAdapter: failed to send email — ${detail}`);
    }
  }
}
