import bcrypt from 'bcryptjs';

/**
 * @param rounds — bcrypt work factor (default 10, configurable via AuthConfig.bcrypt.rounds)
 */
export async function hashPassword(password: string, rounds = 10): Promise<string> {
  return bcrypt.hash(password, rounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generates a cryptographically secure random token.
 * Uses Web Crypto API (available in Node 19+, browsers, Edge, Deno, Bun).
 */
export function generateToken(byteLength: number = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  // hex-encode — URL-safe, unambiguous
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string comparison — prevents timing oracle attacks.
 *
 * Standard string equality (===) short-circuits on the first differing
 * character, leaking timing information. Use this for comparing secrets,
 * CSRF state tokens, and any security-sensitive values.
 *
 * Works in all environments that provide Web Crypto (Node 19+, browsers,
 * Edge, Deno, Bun). Falls back to a pure-JS constant-time impl in older Node.
 *
 * @returns true only when a and b are equal AND the same byte-length
 */
export function timingSafeEqual(a: string, b: string): boolean {
  // Length check must not short-circuit — encode both to compare byte counts
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);

  // Use Node's built-in when available (preferred — FIPS-validated path)
  if (typeof globalThis.process !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { timingSafeEqual: nodeEqual } = require('crypto');
      // Both buffers must be the same length for Node's impl
      if (aBytes.length !== bBytes.length) {
        // Still do the comparison (against a padded copy) to consume constant time
        const padded = new Uint8Array(aBytes.length);
        nodeEqual(aBytes, padded);
        return false;
      }
      return nodeEqual(aBytes, bBytes);
    } catch {
      // Fall through to pure-JS impl
    }
  }

  // Pure-JS fallback: bitwise OR accumulator — same time regardless of where bytes differ
  if (aBytes.length !== bBytes.length) {
    // Compare against self to burn time, then return false
    let dummy = 0;
    for (let i = 0; i < aBytes.length; i++) dummy |= aBytes[i] ^ aBytes[i];
    return false && dummy === 0; // always false, dummy prevents dead-code elimination
  }

  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}
