import { AuthConfig, User, AuthEvent, AuthErrorEvent } from '../interfaces';
import { hashPassword, verifyPassword, generateToken, timingSafeEqual, generateOtpCode } from '../utils/crypto';
import { SessionManager } from '../session';
import {
  AuthError,
  InvalidCredentialsError,
  UserExistsError,
  UserNotFoundError,
  MfaRequiredError,
  MfaInvalidError,
  TokenExpiredError,
  TokenInvalidError,
  PasswordTooShortError,
  MissingAdapterError,
  MissingConfigError,
  OAuthError,
} from '../errors';

// TTLs
const MAGIC_LINK_TTL_MS     = 15 * 60 * 1000;       // 15 min
const EMAIL_VERIFY_TTL_MS   = 24 * 60 * 60 * 1000;  // 24 h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;        // 1 h
const MFA_PENDING_TTL_MS    = 5 * 60 * 1000;         // 5 min
const EMAIL_OTP_TTL_MS      = 5 * 60 * 1000;         // 5 min

const MIN_PASSWORD_LENGTH = 8;

export class AuthFlows {
  private sessionManager: SessionManager;

  constructor(private config: AuthConfig) {
    this.sessionManager = new SessionManager(config);
  }

  // ── shared helpers ────────────────────────────────────────────────────

  private get bcryptRounds(): number {
    return this.config.bcrypt?.rounds ?? 10;
  }

  /**
   * Throws if adapter (or a specific method on it) is missing.
   * Returns the adapter typed as non-optional.
   */
  private adapter(method?: string) {
    if (!this.config.adapter) throw new MissingAdapterError(method);
    if (method && !(this.config.adapter as any)[method]) {
      throw new MissingAdapterError(method);
    }
    return this.config.adapter!;
  }

  /** Validates password meets minimum requirements. Throws PasswordTooShortError. */
  private validatePassword(password: string | undefined): asserts password is string {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new PasswordTooShortError(MIN_PASSWORD_LENGTH);
    }
  }

  private async fireSuccess(event: AuthEvent) {
    try { await this.config.hooks?.onSuccess?.(event); } catch { /* hooks must not break flows */ }
  }

  private async fireError(event: AuthErrorEvent) {
    try { await this.config.hooks?.onError?.(event); } catch { /* hooks must not break flows */ }
  }

  // ── register ─────────────────────────────────────────────────────────

  async register(
    email: string,
    password?: string,
    name?: string
  ): Promise<{ user: User; token: string }> {
    const db = this.adapter();

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      const err = new UserExistsError();
      await this.fireError({ event: 'register', error: err, email, timestamp: new Date() });
      throw err;
    }

    let passwordHash: string | undefined;
    if (password) {
      this.validatePassword(password);
      passwordHash = await hashPassword(password, this.bcryptRounds);
    }

    const user = await db.createUser({
      email,
      name,
      passwordHash,
      role: 'user',
      emailVerified: false,
    });

    // Trigger email verification if configured
    if (
      this.config.emailVerification &&
      this.config.emailAdapter &&
      db.createVerificationToken
    ) {
      const rawToken = generateToken(32);
      const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
      await db.createVerificationToken({
        token: rawToken,
        email,
        type: 'email-verify',
        expiresAt,
      });

      if (this.config.verifyEmailUrl) {
        const verifyUrl = `${this.config.verifyEmailUrl}?token=${rawToken}&email=${encodeURIComponent(email)}`;
        await this.config.emailAdapter.sendVerificationEmail(email, verifyUrl);
      }
    }

    const token = await this.sessionManager.createToken(user);
    await this.fireSuccess({ event: 'register', userId: user.id, email, timestamp: new Date() });
    return { user, token };
  }

  // ── login ─────────────────────────────────────────────────────────────

  async login(
    email: string,
    password?: string
  ): Promise<{ user: User; token: string } | { mfaRequired: true; tempToken: string }> {
    const db = this.adapter();

    const user = await db.getUserByEmail(email);
    if (!user) {
      const err = new InvalidCredentialsError();
      await this.fireError({ event: 'login', error: err, email, timestamp: new Date() });
      throw err;
    }

    // Password check: required if account has a hash
    if (user.passwordHash) {
      if (!password) {
        const err = new InvalidCredentialsError();
        await this.fireError({ event: 'login', error: err, email, timestamp: new Date() });
        throw err;
      }
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        const err = new InvalidCredentialsError();
        await this.fireError({ event: 'login', error: err, email, timestamp: new Date() });
        throw err;
      }
    }

    // MFA gate
    if (user.mfaEnabled && user.mfaSecret) {
      const tempToken = generateToken(32);
      if (db.createVerificationToken) {
        await db.createVerificationToken({
          token: tempToken,
          email: user.email,
          type: 'mfa-pending',
          expiresAt: new Date(Date.now() + MFA_PENDING_TTL_MS),
        });
      }
      return { mfaRequired: true, tempToken };
    }

    const token = await this.sessionManager.createToken(user);
    await this.fireSuccess({ event: 'login', userId: user.id, email, timestamp: new Date() });
    return { user, token };
  }

  // ── MFA verify ───────────────────────────────────────────────────────

  async verifyMfaToken(
    tempToken: string,
    totpCode: string
  ): Promise<{ user: User; token: string }> {
    const db = this.adapter('getVerificationToken');

    const record = await db.getVerificationToken!(tempToken, 'mfa-pending');
    if (!record) {
      throw new TokenInvalidError('MFA session not found. Please log in again.');
    }
    if (record.expiresAt < new Date()) {
      await db.deleteVerificationToken!(tempToken, 'mfa-pending');
      throw new TokenExpiredError('MFA session expired. Please log in again.');
    }

    const user = await db.getUserByEmail(record.email);
    if (!user || !user.mfaSecret) throw new UserNotFoundError();

    const speakeasy = await import('speakeasy');
    const isValid = speakeasy.default.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) {
      const err = new MfaInvalidError();
      await this.fireError({ event: 'mfa-verify', error: err, email: user.email, timestamp: new Date() });
      throw err;
    }

    await db.deleteVerificationToken!(tempToken, 'mfa-pending');

    const sessionToken = await this.sessionManager.createToken(user);
    await this.fireSuccess({ event: 'mfa-verify', userId: user.id, email: user.email, timestamp: new Date() });
    return { user, token: sessionToken };
  }

  // ── email verify ─────────────────────────────────────────────────────

  async verifyEmail(token: string, email: string): Promise<{ user: User }> {
    const db = this.adapter('getVerificationToken');

    const record = await db.getVerificationToken!(token, 'email-verify');
    if (!record || record.email !== email) throw new TokenInvalidError('Invalid verification link.');
    if (record.expiresAt < new Date()) {
      await db.deleteVerificationToken!(token, 'email-verify');
      throw new TokenExpiredError('Verification link has expired.');
    }

    await db.deleteVerificationToken!(token, 'email-verify');

    const user = await db.updateUser!(email, { emailVerified: true });
    await this.fireSuccess({ event: 'email-verify', userId: user.id, email, timestamp: new Date() });
    return { user };
  }

  // ── magic link ───────────────────────────────────────────────────────

  async requestMagicLink(email: string, callbackUrl: string): Promise<void> {
    const db = this.adapter('createVerificationToken');
    if (!this.config.emailAdapter) throw new MissingConfigError('emailAdapter');

    let user = await db.getUserByEmail(email);
    if (!user) {
      user = await db.createUser({ email, role: 'user' });
    }

    const rawToken = generateToken(32);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

    await db.createVerificationToken!({
      token: rawToken,
      email,
      type: 'magic-link',
      expiresAt,
    });

    const magicUrl = `${callbackUrl}?token=${rawToken}&email=${encodeURIComponent(email)}`;
    await this.config.emailAdapter.sendMagicLinkEmail(email, magicUrl);
  }

  async verifyMagicLink(
    token: string,
    email: string
  ): Promise<{ user: User; token: string }> {
    const db = this.adapter('getVerificationToken');

    const record = await db.getVerificationToken!(token, 'magic-link');

    if (!record || record.email !== email) throw new TokenInvalidError('Invalid or expired magic link.');
    if (record.expiresAt < new Date()) {
      await db.deleteVerificationToken!(token, 'magic-link');
      throw new TokenExpiredError('Magic link has expired.');
    }

    await db.deleteVerificationToken!(token, 'magic-link');

    const user = await db.getUserByEmail(email);
    if (!user) throw new UserNotFoundError();

    const sessionToken = await this.sessionManager.createToken(user);
    await this.fireSuccess({ event: 'magic-link-verify', userId: user.id, email, timestamp: new Date() });
    return { user, token: sessionToken };
  }

  // ── password reset ───────────────────────────────────────────────────

  async requestPasswordReset(email: string, resetUrl: string): Promise<void> {
    const db = this.adapter('createVerificationToken');
    if (!this.config.emailAdapter) throw new MissingConfigError('emailAdapter');

    // Always return success — don't leak whether email exists
    const user = await db.getUserByEmail(email);
    if (!user) return;

    const rawToken = generateToken(32);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await db.createVerificationToken!({
      token: rawToken,
      email,
      type: 'password-reset',
      expiresAt,
    });

    const url = `${resetUrl}?token=${rawToken}&email=${encodeURIComponent(email)}`;
    await this.config.emailAdapter.sendPasswordResetEmail(email, url);
  }

  async resetPassword(token: string, email: string, newPassword: string): Promise<void> {
    const db = this.adapter('getVerificationToken');

    const record = await db.getVerificationToken!(token, 'password-reset');
    if (!record || record.email !== email) throw new TokenInvalidError('Invalid or expired reset link.');
    if (record.expiresAt < new Date()) {
      await db.deleteVerificationToken!(token, 'password-reset');
      throw new TokenExpiredError('Password reset link has expired.');
    }

    // Consistent with register()
    this.validatePassword(newPassword);

    await db.deleteVerificationToken!(token, 'password-reset');

    const passwordHash = await hashPassword(newPassword, this.bcryptRounds);
    await db.updateUser!(email, { passwordHash });

    await this.fireSuccess({ event: 'password-reset', email, timestamp: new Date() });
  }

  // ── MFA setup ─────────────────────────────────────────────────────────

  async setupMfa(userId: string): Promise<{ secret: string; qrCodeUrl: string; otpauthUrl: string }> {
    const db = this.adapter('updateUser');

    const user = await db.getUserById(userId);
    if (!user) throw new UserNotFoundError();

    const speakeasy = await import('speakeasy');
    const qrcode = await import('qrcode');

    const secret = speakeasy.default.generateSecret({
      name: `Auth (${user.email})`,
      length: 20,
    });

    // Don't persist yet — only enable after user verifies the first code
    const qrCodeUrl = await qrcode.default.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCodeUrl,
      otpauthUrl: secret.otpauth_url!,
    };
  }

  async enableMfa(userId: string, secret: string, totpCode: string): Promise<void> {
    const db = this.adapter('updateUser');

    const speakeasy = await import('speakeasy');
    const isValid = speakeasy.default.totp.verify({
      secret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) throw new MfaInvalidError('TOTP code does not match secret. Please try again.');

    await db.updateUser!(userId, { mfaEnabled: true, mfaSecret: secret });
  }

  async disableMfa(userId: string, totpCode: string): Promise<void> {
    const db = this.adapter('updateUser');

    const user = await db.getUserById(userId);
    if (!user) throw new UserNotFoundError();
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new AuthError('MFA is not enabled for this account.', 'MFA_INVALID', 400);
    }

    const speakeasy = await import('speakeasy');
    const isValid = speakeasy.default.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) throw new MfaInvalidError('Invalid TOTP code.');

    // Clear both the enabled flag AND the secret — don't leave secrets in DB after disable
    await db.updateUser!(userId, { mfaEnabled: false, mfaSecret: null });
  }

  // ── OAuth ────────────────────────────────────────────────────────────

  async handleOAuthCallback(
    providerId: string,
    code: string,
    state: string,
    storedState: string
  ): Promise<{ user: User; token: string }> {
    const db = this.adapter();
    if (!this.config.providers) throw new MissingConfigError('providers');

    // CSRF check — constant-time comparison to prevent timing oracle attacks
    if (!state || !storedState || !timingSafeEqual(state, storedState)) {
      throw new OAuthError('Invalid OAuth state parameter. Possible CSRF attack.');
    }

    const provider = this.config.providers.find(p => p.id === providerId);
    if (!provider || provider.type !== 'oauth') {
      throw new OAuthError(`Unknown OAuth provider: ${providerId}`);
    }

    const oauthProvider = provider as any;
    const { accessToken } = await oauthProvider.getTokens(code);
    const profile = await oauthProvider.getUserProfile(accessToken);

    if (!profile.email) {
      throw new OAuthError('OAuth provider did not return an email address.');
    }

    // Upsert user
    let user = await db.getUserByEmail(profile.email);
    if (!user) {
      user = await db.createUser({
        email: profile.email,
        name: profile.name,
        role: 'user',
        emailVerified: true,
      });
    } else if (db.updateUser && !user.name && profile.name) {
      user = await db.updateUser(user.id, { name: profile.name });
    }

    const sessionToken = await this.sessionManager.createToken(user);
    await this.fireSuccess({ event: 'oauth-login', userId: user.id, email: user.email, timestamp: new Date() });
    return { user, token: sessionToken };
  }

  // ── Email OTP ─────────────────────────────────────────────────────────

  async requestOtp(email: string): Promise<void> {
    const db = this.adapter('createVerificationToken');
    if (!this.config.emailAdapter) throw new MissingConfigError('emailAdapter');
    if (!this.config.emailAdapter.sendOtpEmail) {
      throw new MissingConfigError('sendOtpEmail is not supported by the configured emailAdapter');
    }

    let user = await db.getUserByEmail(email);
    if (!user) {
      user = await db.createUser({ email, role: 'user' });
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + EMAIL_OTP_TTL_MS);

    await db.createVerificationToken!({
      token: code,
      email,
      type: 'email-otp',
      expiresAt,
    });

    await this.config.emailAdapter.sendOtpEmail(email, code);
  }

  async verifyOtp(
    email: string,
    code: string
  ): Promise<{ user: User; token: string }> {
    const db = this.adapter('getVerificationToken');

    const record = await db.getVerificationToken!(code, 'email-otp');

    if (!record || record.email !== email) throw new TokenInvalidError('Invalid or expired OTP.');
    if (record.expiresAt < new Date()) {
      await db.deleteVerificationToken!(code, 'email-otp');
      throw new TokenExpiredError('OTP has expired.');
    }

    await db.deleteVerificationToken!(code, 'email-otp');

    const user = await db.getUserByEmail(email);
    if (!user) throw new UserNotFoundError();

    const sessionToken = await this.sessionManager.createToken(user);
    await this.fireSuccess({ event: 'otp-verify', userId: user.id, email, timestamp: new Date() });
    return { user, token: sessionToken };
  }
}
