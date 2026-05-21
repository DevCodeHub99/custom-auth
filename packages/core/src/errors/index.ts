/**
 * @custom-auth/core — typed error hierarchy
 *
 * Every public flow throws a subclass of AuthError so callers can do:
 *
 *   import { MfaRequiredError, InvalidCredentialsError } from '@custom-auth/core';
 *   try { await login(...) }
 *   catch (e) {
 *     if (e instanceof MfaRequiredError) { ... }
 *   }
 *
 * HTTP handlers map each subclass to the appropriate status code.
 */

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USER_EXISTS'
  | 'USER_NOT_FOUND'
  | 'MFA_REQUIRED'
  | 'MFA_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'RATE_LIMIT'
  | 'MISSING_ADAPTER'
  | 'MISSING_CONFIG'
  | 'ADAPTER_MISSING_METHOD'
  | 'OAUTH_ERROR'
  | 'PASSWORD_TOO_SHORT'
  | 'EMAIL_NOT_VERIFIED'
  | 'UNKNOWN';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly statusCode: number;

  constructor(message: string, code: AuthErrorCode = 'UNKNOWN', statusCode = 400) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
    // Restore prototype chain (needed when targeting ES5)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Credential errors ─────────────────────────────────────────────────────

export class InvalidCredentialsError extends AuthError {
  constructor(message = 'Invalid credentials.') {
    super(message, 'INVALID_CREDENTIALS', 401);
    this.name = 'InvalidCredentialsError';
  }
}

export class UserExistsError extends AuthError {
  constructor(message = 'User already exists.') {
    super(message, 'USER_EXISTS', 409);
    this.name = 'UserExistsError';
  }
}

export class UserNotFoundError extends AuthError {
  constructor(message = 'User not found.') {
    super(message, 'USER_NOT_FOUND', 404);
    this.name = 'UserNotFoundError';
  }
}

// ── MFA errors ────────────────────────────────────────────────────────────

export class MfaRequiredError extends AuthError {
  /** Short-lived opaque token that identifies the pending MFA session */
  readonly tempToken: string;

  constructor(tempToken: string, message = 'MFA verification required.') {
    super(message, 'MFA_REQUIRED', 200); // 200 — not an error in HTTP terms, but a gate
    this.name = 'MfaRequiredError';
    this.tempToken = tempToken;
  }
}

export class MfaInvalidError extends AuthError {
  constructor(message = 'Invalid TOTP code.') {
    super(message, 'MFA_INVALID', 401);
    this.name = 'MfaInvalidError';
  }
}

// ── Token errors ──────────────────────────────────────────────────────────

export class TokenExpiredError extends AuthError {
  constructor(message = 'Token has expired.') {
    super(message, 'TOKEN_EXPIRED', 401);
    this.name = 'TokenExpiredError';
  }
}

export class TokenInvalidError extends AuthError {
  constructor(message = 'Invalid or malformed token.') {
    super(message, 'TOKEN_INVALID', 401);
    this.name = 'TokenInvalidError';
  }
}

// ── Rate limiting ─────────────────────────────────────────────────────────

export class RateLimitError extends AuthError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}

// ── Validation ────────────────────────────────────────────────────────────

export class PasswordTooShortError extends AuthError {
  constructor(minLength = 8) {
    super(`Password must be at least ${minLength} characters.`, 'PASSWORD_TOO_SHORT', 400);
    this.name = 'PasswordTooShortError';
  }
}

export class EmailNotVerifiedError extends AuthError {
  constructor(message = 'Please verify your email address before signing in.') {
    super(message, 'EMAIL_NOT_VERIFIED', 403);
    this.name = 'EmailNotVerifiedError';
  }
}

// ── Config / adapter ──────────────────────────────────────────────────────

export class MissingAdapterError extends AuthError {
  constructor(method?: string) {
    const msg = method
      ? `Database adapter is missing required method: ${method}`
      : 'A database adapter is required.';
    super(msg, method ? 'ADAPTER_MISSING_METHOD' : 'MISSING_ADAPTER', 500);
    this.name = 'MissingAdapterError';
  }
}

export class MissingConfigError extends AuthError {
  constructor(field: string) {
    super(`Missing required config field: ${field}`, 'MISSING_CONFIG', 500);
    this.name = 'MissingConfigError';
  }
}

export class OAuthError extends AuthError {
  constructor(message: string) {
    super(message, 'OAUTH_ERROR', 400);
    this.name = 'OAuthError';
  }
}
