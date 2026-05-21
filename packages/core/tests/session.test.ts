import { describe, it, expect } from 'vitest';
import { SessionManager } from '../src/session';

describe('SessionManager', () => {
  const config = { secret: 'super-secret-key-that-is-long-enough-for-hs256', session: { expiresIn: '1h' } };
  const manager = new SessionManager(config);

  it('should create and verify a session token', async () => {
    const user = { id: '123', email: 'test@example.com', role: 'user' };
    const token = await manager.createToken(user);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const verified = await manager.verifyToken(token);
    expect(verified?.sub).toBe('123');
    expect(verified?.email).toBe('test@example.com');
  });

  it('should fail verification with wrong secret', async () => {
    const manager2 = new SessionManager({ secret: 'another-secret-key-that-is-long-enough-for-hs256' });
    const user = { id: '123', email: 'test@example.com', role: 'user' };
    const token = await manager.createToken(user);

    const verified = await manager2.verifyToken(token);
    expect(verified).toBeNull();
  });
});
