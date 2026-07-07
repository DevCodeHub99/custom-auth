export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  passwordHash?: string;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  mfaSecret?: string;
  [key: string]: any;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface VerificationToken {
  token: string;
  email: string;
  /**
   * 'magic-link'     — passwordless sign-in
   * 'email-verify'   — verify new account email
   * 'password-reset' — forgot password flow
   * 'mfa-pending'    — temporary token held during MFA challenge
   * 'email-otp'      — passwordless one-time password flow
   * 'webauthn-challenge' — temporary challenge stored for passkey verification
   */
  type: 'magic-link' | 'email-verify' | 'password-reset' | 'mfa-pending' | 'email-otp' | 'webauthn-challenge';
  expiresAt: Date;
}

export interface CookieOptions {
  httpOnly?: boolean;
  /**
   * When omitted, the SDK auto-detects: Secure=true in production,
   * Secure=false in development (NODE_ENV !== 'production').
   * Set explicitly to override.
   */
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
  maxAge?: number; // seconds
}

export interface BcryptConfig {
  /**
   * Work factor passed to bcrypt.hash(). Default: 10.
   * Higher = slower (more secure). Recommended range: 10–12.
   */
  rounds?: number;
}

export interface AuthLifecycleHooks {
  /**
   * Called after a successful login, register, or magic-link verification.
   * Useful for audit logs, analytics, etc.
   */
  onSuccess?: (event: AuthEvent) => void | Promise<void>;
  /**
   * Called when any auth flow throws a recoverable error (e.g. invalid
   * credentials, expired token). NOT called for 5xx/config errors.
   */
  onError?: (event: AuthErrorEvent) => void | Promise<void>;
}

export type AuthEventName =
  | 'register'
  | 'login'
  | 'logout'
  | 'mfa-verify'
  | 'magic-link-verify'
  | 'email-verify'
  | 'password-reset'
  | 'password-update'
  | 'oauth-login'
  | 'token-refresh'
  | 'otp-verify'
  | 'webauthn-register'
  | 'webauthn-login';

export interface AuthEvent {
  event: AuthEventName;
  userId?: string;
  email?: string;
  timestamp: Date;
}

export interface AuthErrorEvent {
  event: AuthEventName;
  error: Error;
  email?: string;
  timestamp: Date;
}

export interface AuthConfig {
  /** JWT signing secret. REQUIRED. Must be ≥ 32 chars in production. */
  secret: string;
  session?: {
    expiresIn?: string | number; // e.g. "1d", "7d", or seconds
  };
  cookies?: CookieOptions;
  providers?: Provider[];
  adapter?: DatabaseAdapter;
  emailAdapter?: EmailAdapter;
  /**
   * bcrypt configuration. Defaults to { rounds: 10 }.
   */
  bcrypt?: BcryptConfig;
  /**
   * Lifecycle hooks fired on auth events.
   */
  hooks?: AuthLifecycleHooks;
  /**
   * If true, a verification email is sent after registration and the user's
   * emailVerified flag is false until they click the link.
   */
  emailVerification?: boolean;
  /**
   * Base URL used to build the email-verification link, e.g. "https://example.com/verify-email".
   * Required when emailVerification is true.
   */
  verifyEmailUrl?: string;
  /**
   * Base URL used to build the password-reset link, e.g. "https://example.com/reset-password".
   * Required for the forgot-password flow.
   */
  resetPasswordUrl?: string;
  rateLimiter?: RateLimiterAdapter;
  webauthn?: {
    rpName: string;
    rpID: string;
    origin: string;
  };
  csrf?: {
    disabled?: boolean;
    allowedOrigins?: string[];
  };
}

export interface DatabaseAdapter {
  createUser(data: CreateUserInput): Promise<User>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  /**
   * idOrEmail accepts either the user's numeric/string id OR their email address.
   * Implementors should detect which is passed (contains '@' → email, else id).
   */
  updateUser?(idOrEmail: string, data: UpdateUserInput): Promise<User>;
  createSession?(userId: string, expiresAt: Date): Promise<Session>;
  getSession?(sessionId: string): Promise<Session | null>;
  deleteSession?(sessionId: string): Promise<void>;
  /** Delete all sessions for a user (e.g., on password change) */
  deleteSessionsByUserId?(userId: string): Promise<void>;
  // Verification tokens (magic link, email verify, password reset, mfa-pending)
  createVerificationToken?(data: VerificationToken): Promise<void>;
  getVerificationToken?(token: string, type: VerificationToken['type']): Promise<VerificationToken | null>;
  deleteVerificationToken?(token: string, type: VerificationToken['type']): Promise<void>;

  // WebAuthn Authenticators
  createAuthenticator?(data: Authenticator): Promise<void>;
  getAuthenticatorById?(credentialID: string): Promise<Authenticator | null>;
  listAuthenticatorsByUserId?(userId: string): Promise<Authenticator[]>;
  updateAuthenticatorCounter?(credentialID: string, counter: number): Promise<void>;
}

export interface CreateUserInput {
  email: string;
  name?: string;
  passwordHash?: string;
  role?: string;
  emailVerified?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  passwordHash?: string;
  role?: string;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  /** Pass null to explicitly clear the secret (e.g. when disabling MFA) */
  mfaSecret?: string | null;
}

export interface EmailAdapter {
  sendVerificationEmail(email: string, url: string): Promise<void>;
  sendPasswordResetEmail(email: string, url: string): Promise<void>;
  sendMagicLinkEmail(email: string, url: string): Promise<void>;
  sendOtpEmail?(email: string, code: string): Promise<void>;
}

export interface RateLimiterAdapter {
  check(key: string, limit?: number, windowMs?: number): Promise<boolean>;
}

export interface Provider {
  id: string;
  name: string;
  type: 'oauth' | 'credentials' | 'magic-link';
  /** OAuth-specific credentials */
  clientId?: string;
  clientSecret?: string;
  /** Override the auto-generated callback URL */
  callbackUrl?: string;
  [key: string]: any;
}

export interface Authenticator {
  credentialID: string;
  credentialPublicKey: string;
  counter: number;
  transports?: string; // Comma-separated list (e.g. "internal,usb")
  userId: string;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
}

