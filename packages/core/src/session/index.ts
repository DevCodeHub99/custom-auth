import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { AuthConfig, User } from '../interfaces';

export class SessionManager {
  private secret: Uint8Array;
  private expiresIn: string | number;

  constructor(private config: AuthConfig) {
    this.secret = new TextEncoder().encode(this.config.secret);
    this.expiresIn = this.config.session?.expiresIn || '7d';
  }

  /**
   * Creates a signed JWT for the user AND, if the adapter supports it,
   * persists a DB session row. The DB session's id is stored as `jti`
   * so that logout / revocation actually works.
   */
  async createToken(user: User): Promise<string> {
    const expiresAt = resolveExpiresAt(this.expiresIn);

    // Persist DB session when the adapter supports it
    let jti: string;
    if (this.config.adapter?.createSession) {
      const session = await this.config.adapter.createSession(user.id, expiresAt);
      jti = session.id;
    } else {
      // Fallback: random jti (revocation won't work without an adapter)
      jti = generateFallbackJti();
    }

    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti,
    };

    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(this.expiresIn as any)
      .sign(this.secret);
  }

  async verifyToken(token: string): Promise<JWTPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      return payload;
    } catch {
      return null;
    }
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

/**
 * Convert jose-style expiresIn (e.g. "7d", "1h", or seconds as number)
 * to a concrete Date — needed to store in the DB session row.
 */
function resolveExpiresAt(expiresIn: string | number): Date {
  if (typeof expiresIn === 'number') {
    return new Date(Date.now() + expiresIn * 1000);
  }
  const match = String(expiresIn).match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // fallback 7d

  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return new Date(Date.now() + amount * multipliers[unit]);
}

/** Cryptographically random 32-char hex string — used when no DB adapter */
function generateFallbackJti(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('crypto').randomBytes(16).toString('hex');
}
