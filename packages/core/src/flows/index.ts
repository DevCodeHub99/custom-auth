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
    if (password.length > 72) {
      throw new AuthError('Password must not exceed 72 characters.', 'INVALID_CREDENTIALS', 400);
    }
  }

  private validateEmail(email: string | undefined): asserts email is string {
    if (!email) {
      throw new AuthError('Email is required.', 'INVALID_CREDENTIALS', 400);
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AuthError('Invalid email format.', 'INVALID_CREDENTIALS', 400);
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
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
    this.validateEmail(email);
    email = this.normalizeEmail(email);
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
    this.validateEmail(email);
    email = this.normalizeEmail(email);
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
    } else {
      const err = new InvalidCredentialsError('This account uses passwordless authentication. Please sign in with your original method.');
      await this.fireError({ event: 'login', error: err, email, timestamp: new Date() });
      throw err;
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
    this.validateEmail(email);
    email = this.normalizeEmail(email);
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
    this.validateEmail(email);
    email = this.normalizeEmail(email);
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
    this.validateEmail(email);
    email = this.normalizeEmail(email);
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
    this.validateEmail(email);
    email = this.normalizeEmail(email);
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
    this.validateEmail(email);
    email = this.normalizeEmail(email);
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
    const user = await db.updateUser!(email, { passwordHash });

    // Invalidate all existing sessions for this user on password reset
    if (db.deleteSessionsByUserId) {
      await db.deleteSessionsByUserId(user.id);
    }

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
      length: 20,
    });

    const issuer = this.config.webauthn?.rpName || 'CustomAuth';
    const encodedIssuer = encodeURIComponent(issuer.trim());
    const encodedAccount = encodeURIComponent(user.email.trim());
    const otpauthUrl = `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret.base32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

    // Persist secret server-side so enableMfa can verify it without relying on client-provided secret
    await db.updateUser!(userId, { mfaSecret: secret.base32 });

    const qrCodeUrl = await qrcode.default.toDataURL(otpauthUrl);

    return {
      secret: secret.base32,
      qrCodeUrl,
      otpauthUrl,
    };
  }

  async enableMfa(userId: string, secret: string, totpCode: string): Promise<void> {
    const db = this.adapter('updateUser');

    const user = await db.getUserById(userId);
    if (!user) throw new UserNotFoundError();

    const serverSecret = user.mfaSecret;
    if (!serverSecret) {
      throw new AuthError('MFA setup has not been initiated. Please call setupMfa first.', 'MFA_INVALID', 400);
    }

    const speakeasy = await import('speakeasy');
    const isValid = speakeasy.default.totp.verify({
      secret: serverSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) throw new MfaInvalidError('TOTP code does not match secret. Please try again.');

    await db.updateUser!(userId, { mfaEnabled: true });
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
    this.validateEmail(email);
    email = this.normalizeEmail(email);
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
    this.validateEmail(email);
    email = this.normalizeEmail(email);
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

  // ── WebAuthn / Passkey Flows ──────────────────────────────────────────

  async generateRegistrationOptions(userId: string) {
    const config = this.config;
    if (!config.webauthn) {
      throw new MissingConfigError('webauthn config is required for Passkey authentication');
    }
    const db = this.adapter('getUserById');
    const user = await db.getUserById(userId);
    if (!user) throw new UserNotFoundError();

    const dbAdapter = this.config.adapter;
    const existing = dbAdapter?.listAuthenticatorsByUserId ? await dbAdapter.listAuthenticatorsByUserId(userId) : [];

    const { generateRegistrationOptions } = await import('@simplewebauthn/server');
    const options = await generateRegistrationOptions({
      rpName: config.webauthn.rpName,
      rpID: config.webauthn.rpID,
      userID: Buffer.from(user.id),
      userName: user.email,
      userDisplayName: user.name || user.email,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
      excludeCredentials: existing.map(auth => ({
        id: auth.credentialID,
        type: 'public-key',
      })),
    });

    const createToken = this.adapter('createVerificationToken');
    await createToken.createVerificationToken!({
      token: options.challenge,
      email: user.email,
      type: 'webauthn-challenge',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    return options;
  }

  async verifyRegistration(userId: string, response: any, challenge: string) {
    const config = this.config;
    if (!config.webauthn) {
      throw new MissingConfigError('webauthn config is required');
    }
    const db = this.adapter('getUserById');
    const user = await db.getUserById(userId);
    if (!user) throw new UserNotFoundError();

    const dbToken = this.adapter('getVerificationToken');
    const tokenRecord = await dbToken.getVerificationToken!(challenge, 'webauthn-challenge');
    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      throw new TokenExpiredError('Challenge has expired or is invalid');
    }
    await dbToken.deleteVerificationToken!(challenge, 'webauthn-challenge');

    const { verifyRegistrationResponse } = await import('@simplewebauthn/server');
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.webauthn.origin,
      expectedRPID: config.webauthn.rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new AuthError('WebAuthn registration verification failed');
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const { id: credentialID, publicKey: credentialPublicKey, counter } = credential;

    const rawCredentialID = typeof credentialID === 'string'
      ? credentialID
      : Buffer.from(credentialID).toString('base64url');

    const createAuthenticator = this.adapter('createAuthenticator');
    await createAuthenticator.createAuthenticator!({
      credentialID: rawCredentialID,
      credentialPublicKey: Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
      userId: user.id,
      credentialDeviceType,
      credentialBackedUp,
      transports: response.response.transports?.join(','),
    });

    await this.fireSuccess({
      event: 'webauthn-register',
      userId: user.id,
      email: user.email,
      timestamp: new Date(),
    });
  }

  async generateLoginOptions(email?: string) {
    const config = this.config;
    if (!config.webauthn) {
      throw new MissingConfigError('webauthn config is required');
    }

    let allowCredentials: any[] = [];
    if (email) {
      this.validateEmail(email);
      email = this.normalizeEmail(email);
      const db = this.adapter('getUserByEmail');
      const user = await db.getUserByEmail(email);
      if (user) {
        const dbAdapter = this.config.adapter;
        const existing = dbAdapter?.listAuthenticatorsByUserId ? await dbAdapter.listAuthenticatorsByUserId(user.id) : [];
        allowCredentials = existing.map(auth => ({
          id: auth.credentialID,
          type: 'public-key',
        }));
      }
    }

    const { generateAuthenticationOptions } = await import('@simplewebauthn/server');
    const options = await generateAuthenticationOptions({
      rpID: config.webauthn.rpID,
      allowCredentials,
      userVerification: 'preferred',
    });

    const createToken = this.adapter('createVerificationToken');
    await createToken.createVerificationToken!({
      token: options.challenge,
      email: email || '',
      type: 'webauthn-challenge',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    return options;
  }

  async verifyLogin(response: any, challenge: string) {
    const config = this.config;
    if (!config.webauthn) {
      throw new MissingConfigError('webauthn config is required');
    }

    const dbToken = this.adapter('getVerificationToken');
    const tokenRecord = await dbToken.getVerificationToken!(challenge, 'webauthn-challenge');
    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      throw new TokenExpiredError('Challenge has expired or is invalid');
    }
    await dbToken.deleteVerificationToken!(challenge, 'webauthn-challenge');

    const dbAuth = this.adapter('getAuthenticatorById');
    const authenticator = await dbAuth.getAuthenticatorById!(response.id);
    if (!authenticator) {
      throw new AuthError('Authenticator not found or not registered to any user');
    }

    const dbUser = this.adapter('getUserById');
    const user = await dbUser.getUserById(authenticator.userId);
    if (!user) throw new UserNotFoundError();

    const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.webauthn.origin,
      expectedRPID: config.webauthn.rpID,
      credential: {
        id: authenticator.credentialID,
        publicKey: Buffer.from(authenticator.credentialPublicKey, 'base64url'),
        counter: authenticator.counter,
      },
    });

    if (!verification.verified || !verification.authenticationInfo) {
      throw new AuthError('WebAuthn authentication verification failed');
    }

    const updateCounter = this.adapter('updateAuthenticatorCounter');
    await updateCounter.updateAuthenticatorCounter!(authenticator.credentialID, verification.authenticationInfo.newCounter);

    const sessionToken = await this.sessionManager.createToken(user);

    await this.fireSuccess({
      event: 'webauthn-login',
      userId: user.id,
      email: user.email,
      timestamp: new Date(),
    });

    return { user, token: sessionToken };
  }

  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const db = this.adapter('getUserById');
    const user = await db.getUserById(userId);
    if (!user) throw new UserNotFoundError();

    if (!user.passwordHash) {
      throw new AuthError('Cannot update password for passwordless-only accounts.', 'INVALID_CREDENTIALS', 400);
    }

    const isCorrect = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCorrect) {
      throw new InvalidCredentialsError('Incorrect current password.');
    }

    if (currentPassword === newPassword) {
      throw new AuthError('New password cannot be the same as current password.', 'INVALID_CREDENTIALS', 400);
    }

    this.validatePassword(newPassword);

    const newPasswordHash = await hashPassword(newPassword, this.bcryptRounds);
    await db.updateUser!(userId, { passwordHash: newPasswordHash });

    // Invalidate all existing sessions for this user on password update
    if (db.deleteSessionsByUserId) {
      await db.deleteSessionsByUserId(userId);
    }

    await this.fireSuccess({ event: 'password-update', userId, email: user.email, timestamp: new Date() });
  }

  async updateProfile(
    userId: string,
    data: { name?: string; email?: string }
  ): Promise<User> {
    const db = this.adapter('getUserById');
    const user = await db.getUserById(userId);
    if (!user) throw new UserNotFoundError();

    const updateFields: any = {};
    if (data.name !== undefined) updateFields.name = data.name;
    if (data.email !== undefined) {
      this.validateEmail(data.email);
      const normalizedEmail = this.normalizeEmail(data.email);
      const existing = await db.getUserByEmail(normalizedEmail);
      if (existing && existing.id !== userId) {
        throw new UserExistsError('Email already in use.');
      }
      updateFields.email = normalizedEmail;
    }

    if (Object.keys(updateFields).length === 0) return user;

    const updatedUser = await db.updateUser!(userId, updateFields);
    return updatedUser;
  }
}
